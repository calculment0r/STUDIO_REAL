import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paireMemoire, type Transport } from './canal';
import { decisionReprise, REPRISE_MS } from './fenetre';
import { msgPresent, VERSION_SORTIE, type MessageRegie, type Scene } from './protocole';
import {
  ajouterTransport, configurerSortie, demarrerRelais, ECART_MS, precharger, publierAuto, publierEtat, publierScene, rechargerSortie,
  relacherScene, reinitialiserRelais, retenirFenetre, sceneDeCommande, SOURCE_REGIE, surFinVideo, useSortie,
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

  it('écart : la scène publiée que la sortie ne montre pas depuis plus de 2 s (horloge simulée)', () => {
    vi.useFakeTimers();
    try {
      const { sortie } = brancher();
      demarrerRelais();
      const present = (vue: Scene | null) => sortie.envoyer(msgPresent({ id: 'sortie_test', vue, n: 1, source: SOURCE_REGIE }));
      const titre = publierScene({ scene: 'titre', titre: 'Entracte' });
      present({ type: 'noir' });                       // la sortie montre encore autre chose
      expect(useSortie.getState()).toMatchObject({ fenetre: 'connectee', sceneVue: 'noir', ecart: false, versionSortie: VERSION_SORTIE });
      vi.advanceTimersByTime(1000); present({ type: 'noir' });
      expect(useSortie.getState().ecart).toBe(false);
      vi.advanceTimersByTime(ECART_MS - 1000 + 100); present({ type: 'noir' });
      expect(useSortie.getState().ecart).toBe(true);
      expect(useSortie.getState().sceneVueComplete).toEqual({ type: 'noir' });
      present(titre);                                  // elle suit : plus d'écart
      expect(useSortie.getState().ecart).toBe(false);
      // même type mais autre contenu : comparé par cleScene
      present({ type: 'titre', titre: 'Autre' });
      vi.advanceTimersByTime(ECART_MS + 100); present({ type: 'titre', titre: 'Autre' });
      expect(useSortie.getState().ecart).toBe(true);
      // sortie muette : pas d'écart (rien n'est vu), la fenêtre n'est plus connectée
      vi.advanceTimersByTime(5000);
      expect(useSortie.getState()).toMatchObject({ fenetre: 'fermee', ecart: false });
    } finally { vi.useRealTimers(); }
  });

  it('sortie périmée (v1) : repérée, rechargée par sa fenêtre ; à jour : message « recharger » seul', () => {
    const { recus, sortie } = brancher();
    let rechargements = 0;
    retenirFenetre({ closed: false }, () => { rechargements++; });
    sortie.envoyer({ t: 'present', v: 1, id: 'sortie_test', heure: Date.now(), scene: 'titre', n: 1 });
    expect(useSortie.getState()).toMatchObject({ versionSortie: 1, buildSortie: null, sceneVue: 'titre', sceneVueComplete: null });
    rechargerSortie();
    expect(dernier(recus)).toMatchObject({ t: 'recharger', v: VERSION_SORTIE });
    expect(rechargements).toBe(1);
    sortie.envoyer(msgPresent({ id: 'sortie_test', vue: { type: 'noir' }, n: 1 }));
    expect(useSortie.getState().versionSortie).toBe(VERSION_SORTIE);
    rechargerSortie();
    expect(recus.filter((m) => m.t === 'recharger')).toHaveLength(2);
    expect(rechargements).toBe(1);
  });

  it('refus de la sortie : retenu s’il nous concerne, effacé quand elle redémarre', () => {
    const { sortie } = brancher();
    const refus = { t: 'refus', v: VERSION_SORTIE, id: 'sortie_test', heure: 1, raison: 'invalide', version: VERSION_SORTIE, recu: 'scene:cinema', versionRecue: VERSION_SORTIE };
    sortie.envoyer({ ...refus, source: 'regie_autre' });
    expect(useSortie.getState().refus).toBeNull();
    sortie.envoyer({ ...refus, versionRecue: 1 });
    expect(useSortie.getState().refus).toBeNull();
    sortie.envoyer({ ...refus, source: SOURCE_REGIE });
    expect(useSortie.getState().refus).toMatchObject({ raison: 'invalide', recu: 'scene:cinema', version: VERSION_SORTIE });
    sortie.envoyer({ t: 'bonjour', v: VERSION_SORTIE, version: VERSION_SORTIE, build: 'abc1234', id: 'sortie_test', heure: Date.now() });
    expect(useSortie.getState()).toMatchObject({ refus: null, buildSortie: 'abc1234' });
  });

  it('fenêtre reprise : rechargée si périmée ou muette, gardée si elle répond à la bonne version', () => {
    expect(decisionReprise({ versionSortie: 1, vuLe: 0 }, 1000, 1000)).toBe('recharger');
    expect(decisionReprise({ versionSortie: VERSION_SORTIE, vuLe: 1500 }, 1000, 1600)).toBe('garder');
    expect(decisionReprise({ versionSortie: VERSION_SORTIE, vuLe: 500 }, 1000, 1600)).toBe('attendre');
    expect(decisionReprise({ versionSortie: null, vuLe: 0 }, 1000, 1000 + REPRISE_MS)).toBe('recharger');
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
