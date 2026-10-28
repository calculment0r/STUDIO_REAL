// Machine d'état du téléphone : chaque règle du lot « application téléphone unique », sans navigateur ni réseau.
import { describe, expect, it } from 'vitest';
import { lireMessageClient, type MessageServeur, type MsgBienvenue, type MsgIn, type MsgVue } from '@studio-real/protocole';
import {
  ECRANS, ecranAMontrer, enchainer, estEffet, estMessage, etatInitial, messageHello, reduire, validerPseudo, vueEcran,
  type Evenement, type EtatTelephone, type Sortie,
} from './machine';

const SESSION = 's_123456';
const H = 1_000_000;

const nouveau = (o: Partial<Parameters<typeof etatInitial>[0]> = {}) =>
  etatInitial({ acteur: 'public', personne: 'tel_abcdef', session: SESSION, ...o });
const bienvenue = (o: Partial<MsgBienvenue> = {}): MsgBienvenue =>
  ({ t: 'bienvenue', v: 2, role: 'acteur', acteur: 'public', session: SESSION, ts: H, vue: null, cseq: 0, ...o });
const vue = (vseq: number, ecran: string | null, params: Record<string, unknown> = {}, cle?: string): MsgVue =>
  ({ t: 'vue', acteur: 'public', vseq, at: H, ecran, params, ...(cle ? { cle } : {}) });
const entrees = (s: readonly Sortie[]) => s.filter(estMessage).filter((m): m is MsgIn => m.t === 'in');
const effets = (s: readonly Sortie[]) => s.filter(estEffet);

/** Un téléphone du public connecté, pseudo choisi. */
function connecte(o: Partial<Parameters<typeof etatInitial>[0]> = {}, b: Partial<MsgBienvenue> = {}): EtatTelephone {
  return enchainer(nouveau({ pseudo: 'lea', ...o }), [{ a: 'reseau', enLigne: true }, bienvenue(b)], H).etat;
}
/** Applique une suite d'événements, chacun à son heure. */
function suite(e: EtatTelephone, evs: readonly (Evenement | [Evenement, number])[]) {
  const sorties: Sortie[] = [];
  for (const x of evs) {
    const [ev, h] = Array.isArray(x) ? x : [x, H];
    const r = reduire(e, ev, h);
    e = r.etat;
    sorties.push(...r.sorties);
  }
  return { etat: e, sorties };
}

describe('identité et pseudo', () => {
  it('le public commence par l’écran d’entrée ; un téléphone nommé non', () => {
    expect(ecranAMontrer(nouveau()).ecran).toBe('entree');
    expect(ecranAMontrer(nouveau({ acteur: 'franck' })).ecran).toBe('attente');
    expect(ecranAMontrer(nouveau({ pseudo: 'lea' })).ecran).toBe('attente');
  });

  it('une seule règle de pseudo : 2 à 20 caractères, @ retirés, espaces changés en _', () => {
    expect(validerPseudo('  @@Léa B ')).toEqual({ ok: 'Léa_B' });
    expect(validerPseudo('x')).toEqual({ erreur: 'Au moins 2 caractères.' });
    expect(validerPseudo('@a')).toEqual({ erreur: 'Au moins 2 caractères.' });
    expect(validerPseudo('a'.repeat(21))).toEqual({ erreur: '20 caractères au plus.' });
    expect(validerPseudo('a'.repeat(20))).toEqual({ ok: 'a'.repeat(20) });
  });

  it('pseudo validé : l’entrée laisse place à la vue ; refusé : message ; connecté : on renvoie hello', () => {
    let r = reduire(nouveau(), { a: 'pseudo', pseudo: 'x' });
    expect(r.etat.pseudo).toBeNull();
    expect(r.etat.erreurPseudo).toBe('Au moins 2 caractères.');
    r = reduire(r.etat, { a: 'pseudo', pseudo: '@lea' });
    expect(r.etat.pseudo).toBe('lea');
    expect(r.etat.erreurPseudo).toBeNull();
    expect(r.sorties).toEqual([]);                                   // pas encore connecté : le prochain hello le portera
    const e = enchainer(nouveau(), [{ a: 'reseau', enLigne: true }, bienvenue()]).etat;
    expect(reduire(e, { a: 'pseudo', pseudo: 'lea' }).sorties).toEqual([{ e: 'hello' }]);
  });

  it('hello : acteur, personne, session, reprise (vseq, cseq), pseudo, capacités — accepté par le protocole', () => {
    const e = suite(connecte({ cseq: 7 }), [vue(4, 'regardez')]).etat;
    const h = messageHello(e, { app: { version: '0.1.0', build: 'essai' }, capacites: ['video', 'vibrer'] });
    expect(h).toMatchObject({ t: 'hello', v: 2, role: 'acteur', acteur: 'public', personne: 'tel_abcdef', session: SESSION, vseq: 4, cseq: 7, pseudo: 'lea' });
    expect(lireMessageClient({ ...h, jeton: 'public' }).message).toMatchObject({ t: 'hello', pseudo: 'lea', capacites: ['video', 'vibrer'] });
  });
});

describe('vues', () => {
  it('bienvenue porte la vue courante : elle s’affiche', () => {
    const e = connecte({}, { vue: { acteur: 'public', vseq: 18, at: H, ecran: 'vote', params: { numero: 1 }, cle: 'b5_q1#1' } });
    expect(e.connecte).toBe(true);
    expect(e.vseq).toBe(18);
    expect(ecranAMontrer(e)).toMatchObject({ ecran: 'vote', source: 'vue', pris: true });
    expect(vueEcran(e)).toMatchObject({ ecran: 'vote', vseq: 18, cle: 'b5_q1#1', vote: null });
  });

  it('une vue plus ancienne (ou rejouée) est ignorée', () => {
    const e = suite(connecte(), [vue(5, 'vote', { numero: 1 })]).etat;
    expect(reduire(e, vue(5, 'noir')).etat).toBe(e);
    expect(reduire(e, vue(3, 'noir')).etat).toBe(e);
  });

  it('un trou de vseq : la vue s’applique et on demande un resync', () => {
    const r = suite(connecte(), [vue(5, 'regardez'), vue(8, 'noir')]);
    expect(r.etat.vseq).toBe(8);
    expect(r.sorties.filter(estMessage)).toEqual([{ t: 'resync' }]);
  });

  it('après un redémarrage du serveur (bienvenue sans vue), on revient à l’attente', () => {
    const e = suite(connecte(), [vue(5, 'vote')]).etat;
    const r = reduire(e, bienvenue({ vue: null }));
    expect(ecranAMontrer(r.etat).ecran).toBe('attente');
    expect(r.etat.vseq).toBe(0);
  });
});

describe('accusé d’affichage', () => {
  it('chaque vue affichée est accusée une fois, à l’heure de l’affichage', () => {
    const e = suite(connecte(), [vue(18, 'vote', { numero: 1 }, 'b5_q1#1')]).etat;
    const r = reduire(e, { a: 'affiche' }, H + 40);
    expect(entrees(r.sorties)).toEqual([{ t: 'in', cseq: 1, heure: H + 40, k: 'accuse', data: { vseq: 18, affiche: H + 40 } }]);
    expect(r.etat.affiche).toEqual({ vseq: 18, ecran: 'vote', cle: 'b5_q1#1', depuis: H + 40 });
    expect(reduire(r.etat, { a: 'affiche' }, H + 90).sorties).toEqual([]);
  });

  it('pas d’accusé tant que l’entrée du pseudo cache la vue ; il part quand la vue est à l’écran', () => {
    const e = enchainer(nouveau(), [{ a: 'reseau', enLigne: true }, bienvenue(), vue(3, 'regardez'), { a: 'affiche' }]);
    expect(entrees(e.sorties)).toEqual([]);
    expect(e.etat.affiche?.ecran).toBe('entree');
    const r = enchainer(e.etat, [{ a: 'pseudo', pseudo: 'lea' }, { a: 'affiche' }], H);
    expect(entrees(r.sorties).map(m => m.k)).toEqual(['accuse']);
  });

  it('un écran inconnu : non pris en charge, accusé avec refus « invalide »', () => {
    const e = suite(connecte(), [vue(2, 'hologramme')]).etat;
    expect(ecranAMontrer(e)).toMatchObject({ ecran: 'hologramme', pris: false });
    const r = reduire(e, { a: 'affiche' }, H);
    expect(entrees(r.sorties)[0]).toMatchObject({ k: 'accuse', data: { vseq: 2, refus: 'invalide' } });
    expect(r.etat.affiche?.ecran).toBe('hologramme');
  });
});

describe('vote', () => {
  const ouvrir = (vseq: number, numero: number, reponses = ['a', 'b', 'c', 'd']) => vue(vseq, 'vote', { numero, question: 'Q', reponses });

  it('un vote par question', () => {
    const r = suite(connecte(), [ouvrir(1, 1), { a: 'voter', index: 2 }, { a: 'voter', index: 0 }]);
    expect(entrees(r.sorties)).toEqual([{ t: 'in', cseq: 1, heure: H, k: 'vote', q: '1', data: { index: 2, numero: 1 } }]);
    expect(effets(r.sorties)).toEqual([{ e: 'vibrer', motif: 40 }]);
    expect(vueEcran(r.etat).vote).toBe(2);
  });

  it('une nouvelle question se vote ; revenir à la première ne permet pas de revoter', () => {
    const r = suite(connecte(), [ouvrir(1, 1), { a: 'voter', index: 2 }, ouvrir(2, 2), { a: 'voter', index: 1 }, ouvrir(3, 1), { a: 'voter', index: 0 }]);
    expect(entrees(r.sorties).map(m => [m.k, (m as { q?: string }).q])).toEqual([['vote', '1'], ['vote', '2']]);
    expect(vueEcran(r.etat).vote).toBe(2);
  });

  it('réponse hors des réponses proposées, vote fermé, ou pas d’écran de vote : rien ne part', () => {
    expect(suite(connecte(), [ouvrir(1, 1, ['a', 'b', 'c']), { a: 'voter', index: 3 }]).sorties).toEqual([]);
    expect(suite(connecte(), [vue(1, 'vote', { numero: 1, ferme: true }), { a: 'voter', index: 0 }]).sorties).toEqual([]);
    expect(suite(connecte(), [vue(1, 'regardez'), { a: 'voter', index: 0 }]).sorties).toEqual([]);
  });

  it('sans réponses ni numéro : 4 lettres, la question est la clé de l’envoi', () => {
    const r = suite(connecte(), [vue(1, 'vote', {}, 'b5 q1#1'), { a: 'voter', index: 3 }]);
    expect(entrees(r.sorties)[0]).toMatchObject({ k: 'vote', q: 'b5_q1#1', data: { index: 3 } });
  });
});

describe('file d’envoi hors ligne', () => {
  it('hors ligne rien ne part ; à la reconnexion la file est rejouée dans l’ordre', () => {
    let e = suite(connecte(), [vue(1, 'vote', { numero: 1 })]).etat;
    let r = suite(e, [{ a: 'reseau', enLigne: false }, { a: 'voter', index: 1 }, { a: 'reagir', emoji: '👏' }, { a: 'visible', visible: false }]);
    expect(r.sorties.filter(estMessage)).toEqual([]);
    e = r.etat;
    expect(e.file.map(m => m.cseq)).toEqual([1, 2, 3]);
    r = suite(e, [{ a: 'reseau', enLigne: true }, bienvenue({ cseq: 0, vue: { acteur: 'public', vseq: 1, at: H, ecran: 'vote', params: { numero: 1 } } })]);
    expect(entrees(r.sorties).map(m => [m.cseq, m.k])).toEqual([[1, 'vote'], [2, 'reaction'], [3, 'presence']]);
  });

  it('ce que le serveur a déjà reçu (bienvenue.cseq) n’est pas rejoué ; ack vide la file', () => {
    let e = suite(connecte(), [{ a: 'reseau', enLigne: false }, { a: 'pret' }, { a: 'reagir', emoji: '😂' }, { a: 'reagir', emoji: '🔥' }]).etat;
    const r = suite(e, [{ a: 'reseau', enLigne: true }, bienvenue({ cseq: 2 })]);
    expect(entrees(r.sorties).map(m => m.cseq)).toEqual([3]);
    e = reduire(r.etat, { t: 'ack', cseq: 3, statut: 'ok' }).etat;
    expect(e.file).toEqual([]);
  });

  it('le cseq continue après un rechargement, et rattrape celui du serveur', () => {
    const e = connecte({ cseq: 41 });
    expect(entrees(reduire(e, { a: 'pret' }).sorties)[0]?.cseq).toBe(42);
    const f = connecte({ cseq: 3 }, { cseq: 10 });
    expect(entrees(reduire(f, { a: 'pret' }).sorties)[0]?.cseq).toBe(11);
  });

  it('un refus du serveur (ack refus) est remonté dans le battement', () => {
    const e = suite(connecte(), [{ a: 'pret' }, { t: 'ack', cseq: 1, statut: 'refus', raison: 'trop vite' }]).etat;
    expect(e.file).toEqual([]);
    const b = reduire(e, { a: 'battement' }, H).sorties[0];
    expect(b).toMatchObject({ t: 'etat', erreurs: ['refus 1 : trop vite'] });
  });
});

describe('panique et effets', () => {
  const fx = (kind: string, p: Record<string, unknown> = {}, at = H, ttl = 60_000): MessageServeur =>
    ({ t: 'fx', acteur: 'public', id: `fx-${kind}`, at, kind, p, ttl });

  it('panique : « Regardez la scène » par-dessus tout, les gestes ne partent plus ; levée, la vue revient', () => {
    let e = suite(connecte(), [vue(1, 'vote', { numero: 1 }), fx('panique', { actif: true })]).etat;
    expect(ecranAMontrer(e)).toMatchObject({ ecran: 'regardez', source: 'panique' });
    expect(reduire(e, { a: 'voter', index: 0 }).sorties).toEqual([]);
    e = reduire(e, fx('panique', { actif: false })).etat;
    expect(ecranAMontrer(e).ecran).toBe('vote');
  });

  it('vibrer (motif borné) ; flash ; son muet par défaut, joué seulement si la personne l’a activé', () => {
    const e = connecte();
    expect(reduire(e, fx('vibrer', { motif: [200, 100, 99999] })).sorties).toEqual([{ e: 'vibrer', motif: [200, 100, 5000] }]);
    expect(reduire(e, fx('flash')).sorties).toEqual([{ e: 'flash', ms: 300 }]);
    expect(reduire(e, fx('son')).sorties).toEqual([]);
    const avecSon = reduire(e, { a: 'son', actif: true }).etat;
    expect(reduire(avecSon, fx('son', { nom: 'grave' })).sorties).toEqual([{ e: 'son', nom: 'grave' }]);
  });

  it('un effet périmé (at + ttl passé, heure serveur estimée) n’est pas joué', () => {
    const e = reduire(connecte(), { a: 'reseau', enLigne: true, decalageMs: 500 }).etat;
    expect(reduire(e, fx('vibrer', {}, H - 20_000, 10_000), H).sorties).toEqual([]);
    expect(reduire(e, fx('vibrer', {}, H - 5_000, 10_000), H).sorties).toHaveLength(1);
  });

  it('refus fatal : on arrête le transport ; resync du serveur : on renvoie hello', () => {
    const r = reduire(connecte(), { t: 'refus', code: 'jeton', message: 'Jeton refusé', fatal: true });
    expect(r.sorties).toEqual([{ e: 'arreter' }]);
    expect(r.etat).toMatchObject({ connecte: false, refus: { code: 'jeton', fatal: true } });
    expect(reduire(connecte(), { t: 'resync', raison: 'nouvelle représentation' }).sorties).toEqual([{ e: 'hello' }]);
  });
});

describe('vidéo et médias', () => {
  it('la vue vidéo demande le préchargement ; la fin part une fois et enchaîne le choix', () => {
    let r = suite(connecte(), [vue(4, 'video', { asset: 'flux.mp4', sources: ['/medias/flux.mp4'], puis: 'choix' })]);
    expect(effets(r.sorties)).toEqual([{ e: 'precharger', medias: [{ asset: 'flux.mp4', sources: ['/medias/flux.mp4'] }] }]);
    expect(r.etat.medias['flux.mp4']).toEqual({ pret: 0, lecture: 'attente' });
    r = suite(r.etat, [{ a: 'fin-video', asset: 'flux.mp4' }, { a: 'fin-video', asset: 'flux.mp4' }]);
    expect(entrees(r.sorties)).toEqual([{ t: 'in', cseq: 1, heure: H, k: 'fin-video', data: { asset: 'flux.mp4', vseq: 4 } }]);
    expect(ecranAMontrer(r.etat)).toMatchObject({ ecran: 'choix', source: 'local' });
    expect(r.etat.medias['flux.mp4']?.lecture).toBe('fin');
  });

  it('attente avec precharger : progression des médias, comptée dans la vue et le battement', () => {
    let e = suite(connecte(), [vue(1, 'attente', { precharger: [{ asset: 'a.mp4', sources: ['/a.mp4'] }, 'b.mp4'] })]).etat;
    expect(vueEcran(e).chargement).toBe(0);
    e = suite(e, [{ a: 'media', asset: 'a.mp4', pret: 1 }, { a: 'media', asset: 'b.mp4', pret: 0.5 }, { a: 'affiche' }]).etat;
    expect(vueEcran(e).chargement).toBe(0.75);
    const b = reduire(e, { a: 'battement' }, H + 5000).sorties[0];
    expect(b).toMatchObject({
      t: 'etat', heure: H + 5000, visible: true, ecran: { vseq: 1, ecran: 'attente' },
      media: [{ asset: 'a.mp4', pret: 1, lecture: 'attente' }, { asset: 'b.mp4', pret: 0.5, lecture: 'attente' }],
    });
    expect(lireMessageClient(b).message).not.toBeNull();
  });

  it('pas de battement tant que la connexion n’est pas acceptée', () => {
    expect(reduire(nouveau({ pseudo: 'lea' }), { a: 'battement' }).sorties).toEqual([]);
  });
});

describe('autres écrans du public', () => {
  it('choix : abonne (vote 0), puis un seul pourquoi', () => {
    const r = suite(connecte(), [vue(1, 'choix', { q: 'jim' }), { a: 'ecrire', texte: 'trop tôt' }, { a: 'choisir', choix: 'abonne' },
      { a: 'choisir', choix: 'desabonne' }, { a: 'ecrire', texte: ' parce que ' }, { a: 'ecrire', texte: 'encore' }]);
    expect(entrees(r.sorties).map(m => [m.k, (m as { q?: string }).q, m.data])).toEqual([
      ['vote', 'jim', { index: 0 }], ['texte', 'jim', { texte: 'parce que' }],
    ]);
    expect(vueEcran(r.etat)).toMatchObject({ choix: 'abonne', textes: ['parce que'] });
  });

  it('phrases : chaque phrase une fois, les textes libres refusés, les émojis à volonté', () => {
    const r = suite(connecte(), [vue(1, 'phrases', { segment: 's1', phrases: ['Bravo', 'Non'] }), { a: 'ecrire', texte: 'Bravo', phrase: true },
      { a: 'ecrire', texte: 'Bravo', phrase: true }, { a: 'ecrire', texte: 'libre' }, { a: 'reagir', emoji: '😂' }, { a: 'reagir', emoji: '😂' }]);
    expect(entrees(r.sorties).map(m => [m.k, m.data])).toEqual([
      ['texte', { texte: 'Bravo' }], ['reaction', { emoji: '😂' }], ['reaction', { emoji: '😂' }],
    ]);
    // les phrases envoyées d'un segment ne reviennent pas, même après une nouvelle vue du même segment
    const e = reduire(r.etat, vue(2, 'phrases', { segment: 's1', phrases: ['Bravo', 'Non'] })).etat;
    expect(vueEcran(e).textes).toEqual(['Bravo']);
  });

  it('texte : une réponse par question, refusée après le chrono', () => {
    let r = suite(connecte(), [vue(1, 'texte', { q: 'q9', duree: 30 }), [{ a: 'ecrire', texte: 'oui' }, H + 10_000], [{ a: 'ecrire', texte: 'non' }, H + 11_000]]);
    expect(entrees(r.sorties)).toEqual([{ t: 'in', cseq: 1, heure: H + 10_000, k: 'texte', q: 'q9', data: { texte: 'oui' } }]);
    r = suite(connecte(), [vue(1, 'texte', { q: 'q9', duree: 30 }), [{ a: 'ecrire', texte: 'tard' }, H + 31_000]]);
    expect(r.sorties).toEqual([]);
  });

  it('page cachée puis revenue : presence, une fois par changement', () => {
    const r = suite(connecte(), [{ a: 'visible', visible: false }, { a: 'visible', visible: false }, { a: 'visible', visible: true }]);
    expect(entrees(r.sorties).map(m => m.data)).toEqual([{ visible: false }, { visible: true }]);
  });

  it('notification : le bouton vaut « prêt », une fois', () => {
    const r = suite(connecte(), [vue(1, 'notification', { texte: 'Vous êtes modérateur', bouton: 'OK' }), { a: 'toucher', cible: 'bouton' }, { a: 'toucher', cible: 'bouton' }]);
    expect(entrees(r.sorties).map(m => [m.k, m.data])).toEqual([['pret', { pret: true }]]);
    expect(vueEcran(r.etat).touches).toEqual(['bouton']);
  });
});

describe('téléphones nommés', () => {
  it('visio-appel : répondre (prêt), raccrocher (plus prêt), puis plus rien', () => {
    const e = enchainer(nouveau({ acteur: 'ministre' }), [{ a: 'reseau', enLigne: true }, bienvenue({ acteur: 'ministre' })]).etat;
    const r = suite(e, [vue(1, 'visio-appel', { nom: 'Franck' }, 'b6#1'), { a: 'appel', geste: 'repondre' }, { a: 'appel', geste: 'raccrocher' }, { a: 'appel', geste: 'repondre' }]);
    expect(entrees(r.sorties).map(m => m.data)).toEqual([{ pret: true }, { pret: false }]);
    expect(vueEcran(r.etat).appel).toBe('fini');
  });

  it('prompteur : le comédien met une question en avant lui-même', () => {
    const e = enchainer(nouveau({ acteur: 'franck' }), [{ a: 'reseau', enLigne: true }, bienvenue({ acteur: 'franck' }), vue(1, 'prompteur', { enAvant: 1 })]).etat;
    const r = reduire(e, { a: 'toucher', cible: 'question:3' });
    expect(r.sorties).toEqual([]);
    expect(vueEcran(r.etat).enAvant).toBe(3);
  });
});

describe('pureté', () => {
  it('reduire ne modifie jamais l’état reçu, et la même suite donne le même état', () => {
    const geler = <T>(x: T): T => { if (x && typeof x === 'object') { Object.freeze(x); Object.values(x).forEach(geler); } return x; };
    const evs: Evenement[] = [{ a: 'reseau', enLigne: true }, bienvenue(), vue(1, 'vote', { numero: 1 }), { a: 'affiche' }, { a: 'voter', index: 1 }, { a: 'battement' }];
    let e = geler(nouveau({ pseudo: 'lea' }));
    for (const ev of evs) e = geler(reduire(e, ev, H).etat);
    expect(enchainer(nouveau({ pseudo: 'lea' }), evs, H).etat).toEqual(e);
  });

  it('la liste des écrans est celle du catalogue des acteurs, plus les écrans de l’application', () => {
    expect(ECRANS).toEqual(expect.arrayContaining(['vote', 'texte', 'phrases', 'video', 'prompteur', 'vote-compteur', 'veille', 'visio-appel']));
  });
});
