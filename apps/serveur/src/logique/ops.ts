// Opérations de modification du projet (deltas), PURES et sans dépendance au runtime Cloudflare.
//
// Un delta est une liste d'opérations appliquées dans l'ordre, tout ou rien : si l'une échoue, les précédentes
// sont annulées (grâce aux opérations inverses calculées au passage) et le document est inchangé.
//
// Chemin : suite de segments depuis la racine du projet.
//   - chaîne  → clé d'objet          ex. 'titre', 'sens', 'aff'
//   - nombre  → index de tableau     ex. ['ev', 2, 'name']
//   - {id}    → élément de tableau dont le champ `id` vaut cette valeur (robuste aux insertions concurrentes)
//               ex. ['ev', {id:'e3'}, 'st', {id:'voix'}, 'k', 0]
//   - '-'     → fin de tableau (seulement en dernier segment d'un « inserer »)

export type Segment = string | number | { id: string };
export type Chemin = Segment[];

export type Op =
  | { op: 'poser'; chemin: Chemin; valeur: unknown }
  | { op: 'inserer'; chemin: Chemin; valeur: unknown }
  | { op: 'retirer'; chemin: Chemin };

export const LIMITES_OPS = {
  /** nombre maximal d'opérations dans un delta */
  opsParDelta: 200,
  /** profondeur maximale d'un chemin */
  profondeur: 16,
} as const;

const CLES_INTERDITES = new Set(['__proto__', 'prototype', 'constructor']);

export class ErreurOp extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

type Conteneur = Record<string, unknown> | unknown[];

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Vérifie la forme d'un delta reçu du réseau (sans l'appliquer). Lève ErreurOp si invalide. */
export function validerOps(brut: unknown): Op[] {
  if (!Array.isArray(brut)) throw new ErreurOp('ops-invalides', 'ops doit être un tableau');
  if (brut.length === 0) throw new ErreurOp('ops-invalides', 'delta vide');
  if (brut.length > LIMITES_OPS.opsParDelta) throw new ErreurOp('ops-trop-nombreuses', `au plus ${LIMITES_OPS.opsParDelta} opérations par delta`);
  return brut.map((o, i) => {
    if (!estObjet(o)) throw new ErreurOp('ops-invalides', `opération ${i} : objet attendu`);
    const { op, chemin } = o;
    if (op !== 'poser' && op !== 'inserer' && op !== 'retirer') throw new ErreurOp('ops-invalides', `opération ${i} : op inconnue`);
    validerChemin(chemin, i);
    const c = chemin as Chemin;
    if (op === 'retirer') return { op, chemin: c };
    if (!('valeur' in o) || o.valeur === undefined) throw new ErreurOp('ops-invalides', `opération ${i} : valeur manquante`);
    return { op, chemin: c, valeur: o.valeur };
  });
}

function validerChemin(chemin: unknown, i: number): asserts chemin is Chemin {
  if (!Array.isArray(chemin) || chemin.length === 0) throw new ErreurOp('chemin-invalide', `opération ${i} : chemin vide ou absent`);
  if (chemin.length > LIMITES_OPS.profondeur) throw new ErreurOp('chemin-invalide', `opération ${i} : chemin trop profond`);
  for (const s of chemin) {
    if (typeof s === 'string') {
      if (CLES_INTERDITES.has(s)) throw new ErreurOp('chemin-invalide', `opération ${i} : clé interdite`);
    } else if (typeof s === 'number') {
      if (!Number.isInteger(s) || s < 0) throw new ErreurOp('chemin-invalide', `opération ${i} : index invalide`);
    } else if (!(estObjet(s) && typeof s.id === 'string' && Object.keys(s).length === 1)) {
      throw new ErreurOp('chemin-invalide', `opération ${i} : segment invalide`);
    }
  }
}

/** Résout un segment sur un conteneur : clé d'objet ou index numérique de tableau. */
function resoudre(parent: Conteneur, s: Segment, pourInsertion = false): string | number {
  if (Array.isArray(parent)) {
    if (typeof s === 'number') {
      const max = pourInsertion ? parent.length : parent.length - 1;
      if (s > max) throw new ErreurOp('chemin-introuvable', `index ${s} hors du tableau (${parent.length})`);
      return s;
    }
    if (s === '-' && pourInsertion) return parent.length;
    if (typeof s === 'object') {
      const i = parent.findIndex((e) => estObjet(e) && e.id === s.id);
      if (i < 0) throw new ErreurOp('chemin-introuvable', `aucun élément d'id « ${s.id} »`);
      return i;
    }
    throw new ErreurOp('chemin-invalide', `segment « ${String(s)} » invalide pour un tableau`);
  }
  if (typeof s !== 'string') throw new ErreurOp('chemin-invalide', 'un objet ne s\'indexe que par une clé');
  return s;
}

/** Descend jusqu'au parent du dernier segment. */
function parentDe(doc: unknown, chemin: Chemin): Conteneur {
  let courant: unknown = doc;
  for (let i = 0; i < chemin.length - 1; i++) {
    if (!estObjet(courant) && !Array.isArray(courant)) throw new ErreurOp('chemin-introuvable', 'le chemin traverse une valeur simple');
    const cle = resoudre(courant, chemin[i]!);
    courant = (courant as Record<string | number, unknown>)[cle];
    if (courant === undefined) throw new ErreurOp('chemin-introuvable', `segment ${i} absent`);
  }
  if (!estObjet(courant) && !Array.isArray(courant)) throw new ErreurOp('chemin-introuvable', 'parent non modifiable');
  return courant;
}

/** Chemin numérique résolu (les {id} remplacés par des index) : utile pour les inverses et le verrouillage. */
export function resoudreChemin(doc: unknown, chemin: Chemin): (string | number)[] {
  const res: (string | number)[] = [];
  let courant: unknown = doc;
  for (const s of chemin) {
    if (!estObjet(courant) && !Array.isArray(courant)) break;
    let cle: string | number;
    try { cle = resoudre(courant, s, true); } catch { break; }
    res.push(cle);
    courant = (courant as Record<string | number, unknown>)[cle];
  }
  return res;
}

/** Applique une opération, renvoie son inverse (à appliquer pour annuler). */
function appliquerUne(doc: unknown, o: Op): Op {
  const parent = parentDe(doc, o.chemin);
  const dernier = o.chemin[o.chemin.length - 1]!;
  const prefixe = resoudreChemin(doc, o.chemin.slice(0, -1));
  if (o.op === 'inserer') {
    if (!Array.isArray(parent)) throw new ErreurOp('chemin-invalide', 'inserer : le parent doit être un tableau');
    const i = resoudre(parent, dernier, true) as number;
    parent.splice(i, 0, clone(o.valeur));
    return { op: 'retirer', chemin: [...prefixe, i] };
  }
  if (Array.isArray(parent)) {
    const i = resoudre(parent, dernier) as number;
    const ancien = parent[i];
    if (o.op === 'poser') {
      parent[i] = clone(o.valeur);
      return { op: 'poser', chemin: [...prefixe, i], valeur: ancien };
    }
    parent.splice(i, 1);
    return { op: 'inserer', chemin: [...prefixe, i], valeur: ancien };
  }
  const cle = resoudre(parent, dernier) as string;
  const existait = Object.prototype.hasOwnProperty.call(parent, cle);
  const ancien = parent[cle];
  if (o.op === 'poser') {
    parent[cle] = clone(o.valeur);
    return existait ? { op: 'poser', chemin: [...prefixe, cle], valeur: ancien } : { op: 'retirer', chemin: [...prefixe, cle] };
  }
  if (!existait) throw new ErreurOp('chemin-introuvable', `clé « ${cle} » absente`);
  delete parent[cle];
  return { op: 'poser', chemin: [...prefixe, cle], valeur: ancien };
}

/**
 * Applique un delta EN PLACE, tout ou rien. Renvoie les inverses (dans l'ordre d'annulation).
 * Lève ErreurOp (document restauré) si une opération échoue.
 */
export function appliquerOps(doc: unknown, ops: Op[]): Op[] {
  const inverses: Op[] = [];
  try {
    for (const o of ops) inverses.unshift(appliquerUne(doc, o));
    return inverses;
  } catch (e) {
    for (const inv of inverses) appliquerUne(doc, inv);
    throw e;
  }
}

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
