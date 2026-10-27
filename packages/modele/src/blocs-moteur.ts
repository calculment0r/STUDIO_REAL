// Blocs à comportement moteur (etude-10-blocs.md, blocs 1, 2, 3 et 6).
// Le moteur de lecture (lecteur.ts) et le calcul des positions prévues (temps.ts) reconnaissent ces codes `ty` ;
// le chantier BLOCS les reprend pour l'affichage (famille, réglages, sorties nommées, aperçu).
//
// Convention commune : k[0] reste la durée prévue (dureeEtape) ; k[1] et k[2] sont les deux rotatifs du bloc
// (0 → 100) ; `params` (facultatif) permet de fixer une valeur exacte qui l'emporte sur le rotatif.
//
// ┌──────────────┬──────────┬───────────────────────────────┬──────────────────────────────────────────────────────┐
// │ ty           │ famille  │ sorties (dans l'ordre)        │ réglages                                              │
// ├──────────────┼──────────┼───────────────────────────────┼──────────────────────────────────────────────────────┤
// │ 'g:garde'    │ flow     │ « condition remplie »         │ k[1] délai max 00:05 → 10:00 (params.delai, s)        │
// │ Garde-fou    │ (Comment)│ « délai dépassé » (sinon)     │ k[2] à l'échéance : ≤ 50 continuer, > 50 demander le  │
// │ de temps     │          │                               │      top (params.echeance 'continuer' | 'top')        │
// ├──────────────┼──────────┼───────────────────────────────┼──────────────────────────────────────────────────────┤
// │ 'm:memoire'  │ data     │ 1 sortie (normale)            │ k[1] opération : < 34 poser, < 67 ajouter, sinon      │
// │ Mémoire      │ (Combien)│                               │      remettre à zéro (params.op 'poser'|'ajouter'|    │
// │              │          │                               │      'zero') · k[2] valeur (params.valeur) ;          │
// │              │          │                               │      nom : params.nom, sinon le nom de l'étape        │
// ├──────────────┼──────────┼───────────────────────────────┼──────────────────────────────────────────────────────┤
// │ 'f:tirage'   │ flow     │ 2 à 6 sorties pondérées       │ k[1] nombre de sorties (indicatif) · poids : champ    │
// │ Tirage au    │ (Comment)│ (Sortie.poids, défaut 1)      │      `poids` de chaque sortie ; graine fixe en        │
// │ sort         │          │                               │      répétition, aléa vrai en scène (sans graine)     │
// ├──────────────┼──────────┼───────────────────────────────┼──────────────────────────────────────────────────────┤
// │ 'f:boucle'   │ flow     │ « encore » (retour au début   │ k[1] nombre de tours : 1 → 20, 100 = ∞               │
// │ Boucle       │ (Comment)│ de la boucle) · « terminé »   │      (params.tours, 0 = ∞) ; condition d'arrêt :      │
// │              │          │                               │      conditions de la sortie « terminé » ; borne 50   │
// └──────────────┴──────────┴───────────────────────────────┴──────────────────────────────────────────────────────┘
//
// Comportements :
// - Garde-fou : après la durée prévue, la première sortie « condition remplie » dont les conditions sont remplies
//   gagne ; sinon, au délai max (au moins la durée prévue), sortie « délai dépassé » et alerte Sécurité. Si l'échéance
//   est réglée sur « demander le top », le lecteur attend le top régie (attenteGo, retard cumulé) puis prend
//   « délai dépassé ». Un garde-fou n'est jamais « bloqué ».
// - Mémoire : l'opération s'applique à l'entrée dans l'étape. Une mémoire non définie vaut 0 / non, jamais une erreur.
//   Les conditions la lisent par 'mem:<nom>'.
// - Tirage : le tirage a lieu à l'entrée dans l'étape (PRNG déterministe) ; la sortie tirée est prise à la fin de la
//   durée prévue. Poids tous à 0 → sortie 1.
// - Boucle : chaque entrée dans le bloc compte un tour. Après la durée prévue : si le nombre de tours est atteint (ou
//   la borne dure de 50, avec alerte Sécurité) → « terminé » ; sinon si la sortie « terminé » a des conditions
//   remplies → « terminé » ; sinon « encore ». Le compteur repart à zéro à la sortie « terminé » et à l'entrée du moment.
//
// Sorties reconnues par leur `nom` (casse et accents ignorés) ; à défaut : garde-fou → la sortie sans condition est
// « délai dépassé » ; boucle → 1re sortie « encore », 2e « terminé ».
import type { Etape, Sortie } from './types';

export const TY_GARDE = 'g:garde';
export const TY_MEMOIRE = 'm:memoire';
export const TY_TIRAGE = 'f:tirage';
export const TY_BOUCLE = 'f:boucle';

/** Bloc du catalogue du design dont le comportement moteur est celui du tirage (« aléatoire pondéré »). */
export const ALIAS_TIRAGE: readonly string[] = ['f3'];

/** Types d'étapes de vote / décompte : à leur sortie, le lecteur retient l'issue du vote (sert aux entrées par issue). */
export const TYPES_VOTE: readonly string[] = ['u1', 'b3', 'd1'];

/** Borne dure du nombre de tours d'une boucle, même réglée sur ∞. */
export const BORNE_BOUCLE = 50;

/** Noms des sorties nommées. */
export const SORTIES_NOMMEES = {
  conditionRemplie: 'condition remplie',
  delaiDepasse: 'délai dépassé',
  encore: 'encore',
  termine: 'terminé',
} as const;

export type ComportementBloc = 'garde' | 'memoire' | 'tirage' | 'boucle' | 'normal';

export interface DescriptionBlocMoteur {
  ty: string;
  nom: string;
  /** Famille du catalogue (clé de GRP dans conducteur-core.js). */
  famille: 'flow' | 'data';
  comportement: Exclude<ComportementBloc, 'normal'>;
  /** Sorties nommées dans l'ordre (vide = sorties libres). */
  sorties: string[];
  /** Libellés des rotatifs k[1], k[2]. */
  reglages: [string, string];
  description: string;
}

export const BLOCS_MOTEUR: Record<string, DescriptionBlocMoteur> = {
  [TY_GARDE]: {
    ty: TY_GARDE, nom: 'garde-fou de temps', famille: 'flow', comportement: 'garde',
    sorties: [SORTIES_NOMMEES.conditionRemplie, SORTIES_NOMMEES.delaiDepasse],
    reglages: ['délai max', 'à l’échéance'],
    description: 'Une sortie de secours datée : si la condition n’est pas remplie à temps, on passe par « délai dépassé ».',
  },
  [TY_MEMOIRE]: {
    ty: TY_MEMOIRE, nom: 'mémoire', famille: 'data', comportement: 'memoire',
    sorties: [],
    reglages: ['opération', 'valeur'],
    description: 'Pose, ajoute ou remet à zéro une mémoire de spectacle, lisible par toutes les conditions.',
  },
  [TY_TIRAGE]: {
    ty: TY_TIRAGE, nom: 'tirage au sort', famille: 'flow', comportement: 'tirage',
    sorties: [],
    reglages: ['sorties', 'mode'],
    description: 'Choisit une sortie selon ses poids : rejouable en répétition, vraiment aléatoire en scène.',
  },
  [TY_BOUCLE]: {
    ty: TY_BOUCLE, nom: 'boucle', famille: 'flow', comportement: 'boucle',
    sorties: [SORTIES_NOMMEES.encore, SORTIES_NOMMEES.termine],
    reglages: ['tours', 'arrêt'],
    description: 'Rejoue une suite d’étapes un nombre de fois donné ou jusqu’à une condition (50 tours au plus).',
  },
};

export function comportementBloc(ty: string): ComportementBloc {
  if (ty === TY_GARDE) return 'garde';
  if (ty === TY_MEMOIRE) return 'memoire';
  if (ty === TY_TIRAGE || ALIAS_TIRAGE.includes(ty)) return 'tirage';
  if (ty === TY_BOUCLE) return 'boucle';
  return 'normal';
}

/** Normalise un nom de sortie : minuscules, sans accents, espaces réduits. */
export const normaliserNom = (s: string | undefined): string =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const memeNom = (s: Sortie, nom: string) => normaliserNom(s.nom) === normaliserNom(nom);
const k = (e: Pick<Etape, 'k'>, i: number, defaut = 50) => {
  const v = e.k[i];
  return typeof v === 'number' && Number.isFinite(v) ? v : defaut;
};
const param = (e: Pick<Etape, 'params'>, nom: string): unknown => e.params?.[nom];

// ── Garde-fou ───────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ReglagesGarde { delai: number; echeance: 'continuer' | 'top' }
export function reglagesGarde(e: Pick<Etape, 'k' | 'params'>): ReglagesGarde {
  const pd = param(e, 'delai');
  const delai = typeof pd === 'number' && pd > 0 ? pd : Math.round(5 + (borne01(k(e, 1)) / 100) * 595);
  const pe = param(e, 'echeance');
  const echeance = pe === 'top' || pe === 'continuer' ? pe : k(e, 2) > 50 ? 'top' : 'continuer';
  return { delai, echeance };
}
/** Sépare les sorties d'un garde-fou : « délai dépassé » d'un côté, « condition remplie » de l'autre. */
export function sortiesGarde(sorties: Sortie[]): { conditions: Sortie[]; delai: Sortie | undefined } {
  let delai = sorties.find(s => memeNom(s, SORTIES_NOMMEES.delaiDepasse));
  if (!delai) delai = sorties.find(s => s.g.length === 0 && !memeNom(s, SORTIES_NOMMEES.conditionRemplie));
  return { conditions: sorties.filter(s => s !== delai), delai };
}

// ── Mémoire ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export type OperationMemoire = 'poser' | 'ajouter' | 'zero';
export interface ReglagesMemoire { nom: string; op: OperationMemoire; valeur: number | string | boolean }
export function reglagesMemoire(e: Pick<Etape, 'k' | 'params' | 'name' | 'id'>): ReglagesMemoire {
  const pn = param(e, 'nom');
  const nom = typeof pn === 'string' && pn.trim() ? pn.trim() : (e.name || e.id);
  const po = param(e, 'op');
  const k1 = k(e, 1);
  const op: OperationMemoire = po === 'poser' || po === 'ajouter' || po === 'zero' ? po : k1 < 34 ? 'poser' : k1 < 67 ? 'ajouter' : 'zero';
  const pv = param(e, 'valeur');
  const valeur = typeof pv === 'number' || typeof pv === 'string' || typeof pv === 'boolean' ? pv : k(e, 2);
  return { nom, op, valeur };
}
/** Valeur numérique d'une mémoire (non définie → 0, oui/vrai → 1, non/faux → 0). */
export function memoireEnNombre(v: unknown): number | null {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = normaliserNom(v);
    if (n === 'oui' || n === 'vrai') return 1;
    if (n === 'non' || n === 'faux' || n === '') return 0;
    const x = Number(v.replace(',', '.'));
    return Number.isFinite(x) ? x : null;
  }
  return null;
}
/** Applique l'opération d'un bloc Mémoire ; renvoie le nouvel objet des mémoires (sans modifier l'ancien). */
export function appliquerMemoire(memoires: Record<string, number | string | boolean>, r: ReglagesMemoire): Record<string, number | string | boolean> {
  const m = { ...memoires };
  if (r.op === 'zero') m[r.nom] = 0;
  else if (r.op === 'poser') m[r.nom] = r.valeur;
  else m[r.nom] = (memoireEnNombre(m[r.nom]) ?? 0) + (memoireEnNombre(r.valeur) ?? 0);
  return m;
}

// ── Tirage ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Poids des sorties d'un tirage (Sortie.poids, sinon params.poids[i], sinon 1). */
export function poidsTirage(e: Pick<Etape, 'params'>, sorties: Sortie[]): number[] {
  const pp = param(e, 'poids');
  return sorties.map((s, i) => {
    const p = typeof s.poids === 'number' ? s.poids : Array.isArray(pp) && typeof pp[i] === 'number' ? (pp[i] as number) : 1;
    return Number.isFinite(p) && p > 0 ? p : 0;
  });
}
/** Index tiré selon les poids pour un nombre u ∈ [0, 1[ ; poids tous à 0 → 0 (sortie 1). */
export function tirerIndex(poids: number[], u: number): number {
  const total = poids.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return 0;
  let x = u * total;
  for (let i = 0; i < poids.length; i++) {
    x -= poids[i] ?? 0;
    if (x < 0) return i;
  }
  return poids.length - 1;
}

// ── Boucle ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ReglagesBoucle { tours: number; borne: number }
export function reglagesBoucle(e: Pick<Etape, 'k' | 'params'>): ReglagesBoucle {
  const pt = param(e, 'tours');
  let tours: number;
  if (typeof pt === 'number') tours = pt <= 0 ? Infinity : Math.round(pt);
  else { const k1 = borne01(k(e, 1)); tours = k1 >= 100 ? Infinity : 1 + Math.round((k1 / 100) * 19); }
  return { tours, borne: BORNE_BOUCLE };
}
export function sortiesBoucle(sorties: Sortie[]): { encore: Sortie | undefined; termine: Sortie | undefined } {
  let encore = sorties.find(s => memeNom(s, SORTIES_NOMMEES.encore));
  let termine = sorties.find(s => memeNom(s, SORTIES_NOMMEES.termine));
  const libres = sorties.filter(s => s !== encore && s !== termine);
  if (!encore) encore = libres.shift();
  if (!termine) termine = libres.shift();
  return { encore, termine };
}

function borne01(v: number) { return Math.min(100, Math.max(0, v)); }

// ── Générateur pseudo-aléatoire ────────────────────────────────────────────────────────────────────────────────────
/** PRNG mulberry32 : simple, rapide, déterministe. Renvoie une fonction → [0, 1[. */
export function creerPrng(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
