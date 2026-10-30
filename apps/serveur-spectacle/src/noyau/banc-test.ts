// Banc d'essai des tests du noyau (pas exporté par index.ts) : horloge et aléa maîtrisés, petit projet construit à la
// main, connexions simulées. PUR, comme le noyau.
import { TY_MACHINE, type Acteur, type Condition, type Envoi, type Etape, type Moment, type Projet, type Sortie as SortieProjet } from '@studio-real/modele';
import type { MessageClient, MessageServeur, MsgHello, Role } from '@studio-real/protocole';
import { Representation } from './representation';
import type { BanquesRepresentation, Sortie } from './types';

export const T0 = Date.UTC(2026, 10, 14, 19, 30, 0);

/** Aléa rejouable (mulberry32). */
export function aleaFixe(graine = 7): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const etape = (id: string, envois: Envoi[] = [], extra: Partial<Etape> = {}): Etape =>
  ({ id, name: id, ty: 'k:scene', c: 0, r: 0, dx: 0, dy: 0, k: [0, 50, 50], envois, ...extra });
export const cond = (k: string, op: Condition['op'], v: number | string): Condition => ({ k, op, v });
export const sortie = (a: string, b: string, g: Condition[] = [], extra: Partial<SortieProjet> = {}): SortieProjet => ({ a, b, g, mode: 'all', ...extra });
export const moment = (id: string, st: Etape[], tr: SortieProjet[], gate: Moment['gate'] = { mode: 'go', g: [] }): Moment =>
  ({ id, act: 0, name: id, entry: st[0]!.id, st, tr, gate });

export const ACTEURS_BANC: Acteur[] = [
  { id: 'scene', type: 'ecran', nom: 'Écran scène', rendu: 'sortie', cardinalite: 1, ecrans: ['noir', 'accueil-qr', 'vote', 'titre', 'mur'], signaux: ['fin-video'] },
  { id: 'public', type: 'public', nom: 'Le public', rendu: 'telephone', cardinalite: 'n', ecrans: ['regardez', 'vote', 'notification', 'noir'], signaux: ['vote', 'pret'] },
  { id: 'ministre', type: 'telephone', nom: 'Ministre', rendu: 'telephone', cardinalite: 1, ecrans: ['veille', 'vote-compteur'], signaux: [] },
  { id: 'figurants', type: 'agent', nom: 'Figurants', rendu: 'externe', cardinalite: 1, agent: { genre: 'figurants' }, ecrans: ['figurants.cmd'], signaux: ['say'] },
  { id: 'pont', type: 'agent', nom: 'Pont OSC', rendu: 'externe', cardinalite: 1, agent: { genre: 'osc' }, ecrans: ['machine'], signaux: [] },
];

/**
 * Petit projet : m1 = accueil (10 s) → vote (10 s ; sortie au quorum ≥ 50 %) → résultat ; m2 = figurants (attend
 * l'accusé de l'agent) → machine (commande au pont OSC, attend son accusé) → fin. Passages « go ».
 */
export function projetBanc(extra: Partial<Projet> = {}): Projet {
  return {
    titre: 'Banc', acts: [{ n: 'Acte' }], sens: { aff: 50, part: 50, calme: 50, pen: 50 }, hold: {}, go: {}, ver: 1, nid: 100, tracks: [],
    acteurs: ACTEURS_BANC,
    ev: [
      moment('m1', [
        etape('accueil', [{ vers: 'scene', ecran: 'accueil-qr' }, { vers: 'public', ecran: 'regardez', params: { texte: 'Bienvenue' } }, { vers: 'ministre', ecran: 'veille' }]),
        etape('vote', [
          { vers: 'public', ecran: 'vote', params: { numero: 1, question: '$question', reponses: ['Oui', 'Non'] } },
          { vers: 'scene', ecran: 'vote', params: { numero: 1 } },
          { vers: 'public', fx: 'vibrer', params: { motif: [200, 100, 200], ttl: 3000 } },
        ], { ty: 'u1', params: { question: 'Faut-il continuer ?' } }),
        etape('resultat', [{ vers: 'public', ecran: 'regardez', params: { texte: 'Résultat à l’écran' } }]),
      ], [sortie('accueil', 'vote'), sortie('vote', 'resultat', [cond('quorum', '≥', 50)]), sortie('resultat', '')]),
      moment('m2', [
        etape('fig', [{ vers: 'figurants', ecran: 'figurants.cmd', params: { segment: 'junon' } }]),
        etape('lumiere', [], { ty: TY_MACHINE, params: { cible: 'console', commande: 'go 12', delai: 60 } }),
      ], [
        sortie('fig', 'lumiere', [cond('sig:accuse:fig', '≥', 1)]),
        sortie('lumiere', '', [], { nom: 'confirmé' }),
        sortie('lumiere', '', [], { nom: 'sans réponse' }),
      ]),
    ],
    ...extra,
  };
}

/** Une représentation sur le banc, son horloge, et des raccourcis pour parler au noyau. */
export function banc(projet: Projet = projetBanc(), graine = 42, banques?: BanquesRepresentation) {
  const h = { now: T0 };
  const rep = new Representation({ projet, horloge: () => h.now, alea: aleaFixe(3), ...(banques ? { banques } : {}) });
  const cseq: Record<string, number> = {};
  const b = {
    rep, h,
    lancer: () => rep.lancer('scene', graine),
    /** connexion (le jeton est vérifié par l'hôte, pas par le noyau) */
    hello: (session: string, role: Role, acteur?: string, personne?: string, extra: Partial<MsgHello> = {}): Sortie[] => {
      const m: MsgHello = { t: 'hello', v: 2, role, session, jeton: 'x', ...extra };
      if (acteur !== undefined) m.acteur = acteur;
      if (personne !== undefined) m.personne = personne;
      return rep.recevoir(session, m);
    },
    /** message porteur de cseq (numéroté automatiquement par session) */
    envoyer: (session: string, m: Record<string, unknown>, n?: number): Sortie[] => {
      const c = n ?? (cseq[session] = (cseq[session] ?? 0) + 1);
      return rep.recevoir(session, { ...m, cseq: c } as unknown as MessageClient);
    },
    brut: (session: string, m: MessageClient): Sortie[] => rep.recevoir(session, m),
    top: (session = 'regie_1') => b.envoyer(session, { t: 'conduite', op: 'top' }),
    voter: (session: string, index: number, q?: string) => b.envoyer(session, { t: 'in', k: 'vote', ...(q !== undefined ? { q } : {}), data: { index } }),
    /** n secondes, une alarme par seconde ; renvoie toutes les sorties */
    secondes: (n: number): Sortie[] => {
      const out: Sortie[] = [];
      for (let i = 0; i < n; i++) { h.now += 1000; out.push(...rep.tick(1)); }
      return out;
    },
    /** salle type : une régie, l'écran scène, la ministre, n téléphones du public (pub_1…) */
    salle: (n = 4): Sortie[] => {
      const out = [...b.hello('regie_1', 'regie'), ...b.hello('scene_1', 'acteur', 'scene'), ...b.hello('mini_1', 'acteur', 'ministre')];
      for (let i = 1; i <= n; i++) out.push(...b.hello(`pub_s${i}`, 'acteur', 'public', `tel_00${i}`));
      return out;
    },
  };
  return b;
}

/** Messages d'un type donné. */
export const de = <T extends MessageServeur['t']>(l: Sortie[], t: T) =>
  l.filter((s): s is Sortie & { m: Extract<MessageServeur, { t: T }> } => s.m.t === t);
/** Messages d'un type donné, sans leur destination. */
export const messages = <T extends MessageServeur['t']>(l: Sortie[], t: T) => de(l, t).map(s => s.m);
