import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { paireMemoire, type Transport } from './canal';
import { VERSION_SORTIE, type MessageRegie } from './protocole';
import {
  ajouterTransport, configurerSortie, precharger, publierAuto, publierEtat, publierScene, relacherScene, reinitialiserRelais,
  sceneDeCommande, surFinVideo, useSortie,
} from './relais';
import { adresseSortieDistante, salleDansAdresse, TransportSalle, urlSalle } from './salle';

const dernier = <T>(l: T[]): T | undefined => l[l.length - 1];
const ETAT = { moment: 'm', etape: 'e', phase: 'etape' as const, t: 1, tEtape: 1, attenteGo: false, enLecture: true };

function brancher(): { recus: MessageRegie[]; sortie: Transport } {
  const [regie, sortie] = paireMemoire();
  ajouterTransport(regie);
  const recus: MessageRegie[] = [];
  sortie.ecouter((m) => recus.push(m as MessageRegie));
  return { recus, sortie };
}

describe('relais de la régie', () => {
  beforeEach(() => reinitialiserRelais());
  afterEach(() => reinitialiserRelais());

  it('commande vidéo : fondu borné, tenue jusqu’au relâchement ; la scène automatique attend', () => {
    const { recus } = brancher();
    publierScene({ scene: 'video', asset: 'starting_soon.mp4', fondu: 5000, boucle: false });
    expect(dernier(recus)).toMatchObject({ t: 'scene', n: 1, fondu: 2000, scene: { type: 'video', asset: 'starting_soon.mp4', boucle: false } });
    expect(useSortie.getState().mode).toBe('manuel');
    publierAuto({ type: 'streamer' }, ETAT, []);
    expect(recus.filter((m) => m.t === 'scene')).toHaveLength(1);
    relacherScene();
    publierAuto({ type: 'streamer' }, ETAT, []);
    expect(dernier(recus.filter((m) => m.t === 'scene'))).toMatchObject({ n: 2, scene: { type: 'streamer' } });
    publierAuto({ type: 'streamer' }, ETAT, []);
    expect(recus.filter((m) => m.t === 'scene')).toHaveLength(2);   // même scène : pas de nouveau fondu
  });

  it('commandes → scènes (QR depuis la configuration)', () => {
    configurerSortie({ titre: 'LIVE', adresse: 'https://a.test/', code: 'K7Q2' });
    const c = useSortie.getState().config;
    expect(sceneDeCommande({ scene: 'accueil-qr' }, c)).toEqual({ type: 'accueil-qr', adresse: 'https://a.test/?r=K7Q2', titre: 'LIVE', consigne: 'Scannez pour entrer', code: 'K7Q2' });
    expect(sceneDeCommande({ scene: 'streamer' }, c)).toEqual({ type: 'streamer' });
    expect(sceneDeCommande({ type: 'noir' }, c)).toEqual({ type: 'noir' });
  });

  it('une sortie qui arrive reçoit config, scène et état ; son battement la dit connectée', () => {
    const { recus, sortie } = brancher();
    publierScene({ scene: 'titre', titre: 'Entracte' });
    publierEtat(ETAT);
    recus.length = 0;
    sortie.envoyer({ t: 'bonjour', v: VERSION_SORTIE, id: 'sortie_test', heure: Date.now() });
    expect(recus.map((m) => m.t)).toEqual(['config', 'scene', 'etat']);
    expect(useSortie.getState().fenetre).toBe('connectee');
    sortie.envoyer({ t: 'present', v: VERSION_SORTIE, id: 'sortie_test', heure: Date.now(), scene: 'titre', n: 1, etat: { flux: 'aucun', secours: false, medias: 'dev', pleinEcran: true } });
    expect(useSortie.getState().sortie).toMatchObject({ medias: 'dev', pleinEcran: true });
    sortie.envoyer({ t: 'au-revoir', v: VERSION_SORTIE, id: 'sortie_test' });
    expect(useSortie.getState().fenetre).toBe('fermee');
  });

  it('fin d’une vidéo jouée une fois : remontée à la régie', () => {
    const { sortie } = brancher();
    const fins: string[] = [];
    surFinVideo((a) => fins.push(a));
    sortie.envoyer({ t: 'fin-video', v: VERSION_SORTIE, id: 'sortie_test', heure: 1, asset: 'coupure_flux.mp4', n: 4 });
    expect(fins).toEqual(['coupure_flux.mp4']);
    expect(useSortie.getState().finVideo).toMatchObject({ asset: 'coupure_flux.mp4', n: 4 });
  });

  it('préchargement : annoncé une fois par liste ; chrono tenu : compteur fabriqué par la régie', () => {
    const { recus } = brancher();
    precharger(['a.mp4']); precharger(['a.mp4']); precharger(['a.mp4', 'b.mp4']);
    expect(recus.filter((m) => m.t === 'precharger').map((m) => (m as Extract<MessageRegie, { t: 'precharger' }>).assets)).toEqual([['a.mp4'], ['a.mp4', 'b.mp4']]);
    publierEtat(ETAT);
    publierScene({ scene: 'chrono', duree: 45 });
    const e = dernier(recus.filter((m) => m.t === 'etat')) as Extract<MessageRegie, { t: 'etat' }>;
    expect(e.etat.compteur).toMatchObject({ duree: 45, enCours: true });
  });
});

describe('transport par la salle du serveur', () => {
  it('adresse de la salle et paramètres de la sortie distante', () => {
    expect(urlSalle({ serveur: 'https://srv.test/', projet: 'p_1', jeton: 'sr_a b' })).toBe('wss://srv.test/api/projets/p_1/salle?jeton=sr_a%20b');
    const a = adresseSortieDistante('https://regie.test/sortie.html', { serveur: 'https://srv.test', projet: 'p_1', jeton: 'sr_x' });
    expect(salleDansAdresse(new URL(a).search)).toEqual({ serveur: 'https://srv.test', projet: 'p_1', jeton: 'sr_x' });
    expect(salleDansAdresse('?projet=p_1')).toBeNull();
  });

  it('hello, enveloppe « scene », réception, reconnexion après coupure', async () => {
    const sockets: FauxWS[] = [];
    class FauxWS {
      static OPEN = 1;
      readyState = 0; envoyes: unknown[] = [];
      onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null; onclose: (() => void) | null = null; onerror: (() => void) | null = null;
      url: string;
      constructor(url: string) { this.url = url; sockets.push(this); }
      send(s: string) { this.envoyes.push(JSON.parse(s)); }
      close() { this.readyState = 3; }
      ouvrir() { this.readyState = 1; this.onopen?.(); }
      recevoir(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
    }
    const t = new TransportSalle({ serveur: 'http://srv.test', projet: 'p_1', jeton: 'sr_x', role: 'poste', personne: 'sortie_abc', nom: 'Sortie scène', WebSocket: FauxWS as unknown as typeof WebSocket });
    const statuts: string[] = [];
    t.statut((s) => statuts.push(s));
    const recus: unknown[] = [];
    t.ecouter((m) => recus.push(m));
    const ws = sockets[0];
    expect(ws.url).toBe('ws://srv.test/api/projets/p_1/salle?jeton=sr_x');
    ws.ouvrir();
    expect(ws.envoyes[0]).toMatchObject({ t: 'hello', v: 1, personne: 'sortie_abc', role: 'poste', nom: 'Sortie scène' });
    t.envoyer({ t: 'bonjour' });
    expect(ws.envoyes).toHaveLength(1);   // pas avant « bienvenue »
    ws.recevoir({ t: 'bienvenue', projet: null, lecture: null });
    t.envoyer({ t: 'bonjour' });
    expect(ws.envoyes[1]).toEqual({ t: 'scene', message: { t: 'bonjour' } });
    ws.recevoir({ t: 'scene', message: { t: 'heure', v: 1, heure: 5 }, par: 'pers_regie', session: 's', ts: 1 });
    expect(recus).toEqual([{ t: 'heure', v: 1, heure: 5 }]);
    ws.onclose?.();
    expect(statuts).toEqual(['connexion', 'connecte', 'hors-ligne']);
    await new Promise((r) => setTimeout(r, 600));
    expect(sockets).toHaveLength(2);
    t.fermer();
  });
});
