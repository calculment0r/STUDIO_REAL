// La sortie écran scène, acteur `scene` du serveur de spectacle : client-spectacle.ts sur une paire de canaux en
// mémoire (transportMemoire du paquet protocole). Le côté « serveur » est joué par le test.
import { describe, expect, it } from 'vitest';
import { transportMemoire, VERSION_PROTOCOLE, type CoteServeurMemoire, type MessageClient, type MsgHello, type VueDiffusee } from '@studio-real/protocole';
import {
  CAPACITES_SORTIE, ClientSortieSpectacle, CLE_SOURCE_SPECTACLE, lireSourceSpectacle, mediasBattement, type VueRecue,
} from './client-spectacle';
import { configParDefaut, VERSION_SORTIE, type ConfigSortie } from './protocole';

const CONFIG: ConfigSortie = { ...configParDefaut('ÉCHO'), adresse: 'https://echo.test/', code: 'K7' };

function monter(o: { maintenant?: () => number } = {}) {
  let serveur!: CoteServeurMemoire;
  const client = new ClientSortieSpectacle({
    ouvrir: (hello) => { const p = transportMemoire({ hello, jeton: 'sr_scene_essai' }); serveur = p.serveur; return p.client; },
    config: () => CONFIG, session: 's_sortie_essai', personne: 'sortie_abcdef', ...(o.maintenant ? { maintenant: o.maintenant } : {}),
  });
  const vues: VueRecue[] = [];
  client.surVue((v) => vues.push(v));
  const recus = () => serveur.recus as readonly MessageClient[];
  const entrees = () => recus().filter((m): m is Extract<MessageClient, { t: 'in' }> => m.t === 'in');
  const hellos = () => recus().filter((m): m is MsgHello => m.t === 'hello');
  return { client, serveur: () => serveur, vues, recus, entrees, hellos };
}

const vueMur = (vseq: number, params: Record<string, unknown> = {}): VueDiffusee =>
  ({ acteur: 'scene', vseq, at: 1_000_000, ecran: 'mur', params, cle: `b5/b5_q1#0@${vseq}` });
const bienvenue = (vue: VueDiffusee | null, cseq = 0) =>
  ({ t: 'bienvenue', v: VERSION_PROTOCOLE, role: 'acteur', acteur: 'scene', session: 's_sortie_essai', ts: 1_000_500, vue, cseq } as const);

describe('client de la sortie, acteur scene du serveur de spectacle', () => {
  it('hello : acteur scene, version et build de la sortie, capacités (écrans natifs compris), jeton', () => {
    const t = monter();
    t.serveur().ouvrir();
    const h = t.hellos()[0];
    expect(h).toMatchObject({ t: 'hello', v: VERSION_PROTOCOLE, role: 'acteur', acteur: 'scene', session: 's_sortie_essai', personne: 'sortie_abcdef', jeton: 'sr_scene_essai' });
    expect(h.app).toEqual({ version: String(VERSION_SORTIE), build: expect.any(String) });
    expect(h.capacites).toEqual(expect.arrayContaining(['mur', 'visio', 'video', 'flux-video', 'accueil-qr', 'noir']));
    expect(h.capacites).toEqual([...CAPACITES_SORTIE]);
    expect(h.vseq).toBeUndefined();
    expect(t.client.etatCourant.ligne).toBe('ouvert');
  });

  it('bienvenue → scène (Vue → Scene), puis accusé SEULEMENT quand la scène est à l’écran', () => {
    const t = monter();
    t.serveur().ouvrir();
    t.serveur().envoyer(bienvenue(vueMur(3, { titre: 'LE MUR', vote: 'ouvert', numero: 1, question: 'Q ?', reponses: ['a', 'b'] })));
    expect(t.vues).toHaveLength(1);
    expect(t.vues[0]).toMatchObject({ vseq: 3, ecran: 'mur', instantane: true });
    expect(t.vues[0].resultat).toEqual({ scene: { type: 'mur', titre: 'LE MUR', vote: { etat: 'ouvert', numero: 1, question: 'Q ?', reponses: ['a', 'b'] } } });
    expect(t.entrees()).toHaveLength(0);                       // pas encore à l'écran
    t.client.vueAffichee(3, 1_000_123);
    t.client.vueAffichee(3, 1_000_999);                        // une seule fois
    expect(t.entrees()).toEqual([{ t: 'in', cseq: 1, heure: expect.any(Number), k: 'accuse', data: { vseq: 3, affiche: 1_000_123 } }]);
    // le battement dit ce qui est AFFICHÉ, avec les médias
    t.client.battre({ visible: true, media: [{ asset: 'junon.mp3', pret: 1, lecture: 'lit' }] });
    const etat = t.recus().find((m) => m.t === 'etat');
    expect(etat).toMatchObject({ t: 'etat', visible: true, enLigne: true, ecran: { vseq: 3, ecran: 'mur', depuis: 1_000_123, cle: 'b5/b5_q1#0@3' }, media: [{ asset: 'junon.mp3', pret: 1, lecture: 'lit' }] });
  });

  it('vues suivantes : une vue plus ancienne (en retard) est ignorée ; les effets passent à la page', () => {
    const t = monter();
    const fx: string[] = [];
    t.client.surFx((m) => fx.push(m.kind));
    t.serveur().ouvrir();
    t.serveur().envoyer(bienvenue(vueMur(3)));
    t.serveur().envoyer({ t: 'vue', ...vueMur(5, { vote: 'revele', reponses: ['a', 'b'], scores: [3, 1] }) });
    t.serveur().envoyer({ t: 'vue', ...vueMur(4) });
    expect(t.vues.map((v) => v.vseq)).toEqual([3, 5]);
    expect(t.vues[1].resultat).toMatchObject({ scene: { vote: { etat: 'revele', pourcents: [75, 25] } } });
    t.serveur().envoyer({ t: 'fx', acteur: 'scene', id: 'x:1', at: 1, kind: 'message', p: { pseudo: 'zoe', texte: 'salut' }, ttl: 2000 });
    expect(fx).toEqual(['message']);
  });

  it('fin d’une vidéo jouée une fois : in{k:"fin-video", asset, vseq}', () => {
    const t = monter();
    t.serveur().ouvrir();
    t.serveur().envoyer(bienvenue({ acteur: 'scene', vseq: 7, at: 1, ecran: 'flux-video', params: {} }));
    expect(t.vues[0].resultat).toEqual({ scene: { type: 'video', asset: 'flux_insta_jim.mp4', boucle: false, son: true, cadrage: 'contain' } });
    t.client.vueAffichee(7, 10);
    t.client.finVideo('flux_insta_jim.mp4');
    expect(t.entrees().map((m) => [m.cseq, m.k, m.data])).toEqual([
      [1, 'accuse', { vseq: 7, affiche: 10 }],
      [2, 'fin-video', { asset: 'flux_insta_jim.mp4', vseq: 7 }],
    ]);
  });

  it('reconnexion : hello avec le vseq et le cseq déjà vus, file rejouée, même vue non ré-accusée, cseq repris du serveur', () => {
    const t = monter();
    t.serveur().ouvrir();
    t.serveur().envoyer(bienvenue(vueMur(5)));
    t.client.vueAffichee(5, 100);
    t.serveur().couper();
    expect(t.client.etatCourant.ligne).toBe('attente');
    t.client.finVideo('a.mp4');                                 // gardé pour la reconnexion
    t.client.battre({ visible: true });                         // périssable : perdu
    t.serveur().ouvrir();
    const h = t.hellos();
    expect(h).toHaveLength(2);
    expect(h[1]).toMatchObject({ vseq: 5, cseq: 2 });
    expect(t.entrees().map((m) => m.k)).toEqual(['accuse', 'fin-video']);
    expect(t.recus().filter((m) => m.t === 'etat')).toHaveLength(0);
    // le serveur renvoie l'instantané : même vue, déjà à l'écran et accusée → rien de neuf pour la page
    t.serveur().envoyer(bienvenue(vueMur(5), 9));
    expect(t.vues).toHaveLength(1);
    // une vue changée pendant la coupure arrive comme instantané ; l'accusé suivant reprend après le cseq du serveur
    t.serveur().envoyer(bienvenue(vueMur(6, { titre: 'neuf' }), 9));
    expect(t.vues.map((v) => [v.vseq, v.instantane])).toEqual([[5, true], [6, true]]);
    t.client.vueAffichee(6, 200);
    expect(t.entrees()[t.entrees().length - 1]).toMatchObject({ cseq: 10, k: 'accuse', data: { vseq: 6 } });
  });

  it('refus de version (fatal) : le client s’arrête au lieu de se reconnecter en boucle', () => {
    const t = monter();
    t.serveur().ouvrir();
    t.serveur().envoyer({ t: 'refus', code: 'version', message: 'protocole v2 attendu (reçu : 1)', fatal: true });
    expect(t.client.etatCourant).toMatchObject({ ligne: 'refuse', refus: { code: 'version', fatal: true } });
    t.serveur().couper();
    t.serveur().ouvrir();
    expect(t.hellos()).toHaveLength(1);                        // ligne fermée : plus de hello
    t.client.finVideo('a.mp4');
    expect(t.entrees()).toHaveLength(0);
  });

  it('écran que la sortie ne sait pas montrer : refus « capacite » dans l’accusé ; refus non fatal : le client continue', () => {
    const t = monter();
    t.serveur().ouvrir();
    t.serveur().envoyer(bienvenue({ acteur: 'scene', vseq: 2, at: 1, ecran: 'hologramme', params: {} }));
    expect(t.vues[0].resultat).toEqual({ refus: 'capacite', ecran: 'hologramme' });
    t.client.vueRefusee(2, 'capacite', 50);
    expect(t.entrees()[0]).toMatchObject({ k: 'accuse', data: { vseq: 2, affiche: 50, refus: 'capacite' } });
    t.serveur().envoyer({ t: 'refus', code: 'trop-long', message: 'texte trop long' });
    expect(t.client.etatCourant).toMatchObject({ ligne: 'ouvert', refus: { code: 'trop-long', fatal: false } });
  });

  it('resync du serveur : le client se présente de nouveau', () => {
    const t = monter();
    t.serveur().ouvrir();
    t.serveur().envoyer({ t: 'resync', raison: 'nouvelle représentation' });
    expect(t.hellos()).toHaveLength(2);
  });
});

describe('adresse de la sortie et battement', () => {
  const memoire = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m };
  };

  it('#spectacle=…&jeton=… : rangé dans l’onglet puis effacé de l’adresse ; relu ensuite sans fragment', () => {
    const s = memoire();
    let efface = 0;
    const lu = lireSourceSpectacle('#spectacle=wss%3A%2F%2Fspectacle.test%2Fws&jeton=sr_scene_x', s, () => { efface++; });
    expect(lu).toEqual({ url: 'wss://spectacle.test/ws', jeton: 'sr_scene_x' });
    expect(efface).toBe(1);
    expect(JSON.parse(s.m.get(CLE_SOURCE_SPECTACLE)!)).toEqual(lu);
    expect(lireSourceSpectacle('', s)).toEqual(lu);
  });

  it('adresse illisible (pas ws://, jeton absent) : aucune source, mais le fragment est effacé quand même', () => {
    const s = memoire();
    let efface = 0;
    expect(lireSourceSpectacle('#spectacle=https://a.test&jeton=x', s, () => { efface++; })).toBeNull();
    expect(lireSourceSpectacle('#spectacle=wss://a.test/ws', s, () => { efface++; })).toBeNull();
    expect(efface).toBe(2);
    expect(s.m.size).toBe(0);
  });

  it('médias du battement : prêt, en chargement (part tamponnée), introuvable, en lecture', () => {
    expect(mediasBattement(
      { 'a.mp4': 'pret', 'junon.mp3': 'charge', 'x.mp4': 'absent' }, (a) => (a === 'junon.mp3' ? 0.4 : 0),
      { video: 'a.mp4', son: { asset: 'junon.mp3', lecture: 'bloque' } },
    )).toEqual([
      { asset: 'a.mp4', pret: 1, lecture: 'lit' },
      { asset: 'junon.mp3', pret: 0.4, lecture: 'bloque' },
      { asset: 'x.mp4', pret: 0, lecture: 'absent' },
    ]);
  });
});
