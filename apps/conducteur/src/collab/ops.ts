// Opérations de la salle (deltas) côté interface : PURES, sans React ni réseau.
//
// Même format et même sémantique que apps/serveur/src/logique/ops.ts (réimplémenté ici pour ne pas faire dépendre
// l'interface du code du Worker) :
//   {op:'poser',   chemin, valeur}   pose (crée la clé si besoin)
//   {op:'inserer', chemin, valeur}   insère dans un tableau (dernier segment : index ou '-' = fin)
//   {op:'retirer', chemin}           retire une clé ou un élément
// Segments : clé (texte), index (entier ≥ 0), {id} (élément de tableau par son champ id), '-' (fin de tableau).
//
// En plus : `diffProjet` traduit le passage d'un état du projet à un autre en opérations (chemins par id dès que les
// éléments d'un tableau en portent un, ce qui rend les modifications concurrentes robustes aux insertions), et
// `decouper` les répartit en deltas qui respectent les limites du serveur (200 opérations, 256 Ko par message).

export type Segment = string | number | { id: string };
export type Chemin = Segment[];
export type Op =
  | { op: 'poser'; chemin: Chemin; valeur: unknown }
  | { op: 'inserer'; chemin: Chemin; valeur: unknown }
  | { op: 'retirer'; chemin: Chemin };

export const LIMITES_OPS = {
  opsParDelta: 200,
  profondeur: 16,
  /** taille JSON visée d'un delta (le serveur refuse un message > 256 Ko ; on garde de la marge pour l'enveloppe) */
  octetsParDelta: 200 * 1024,
} as const;

const CLES_INTERDITES = new Set(['__proto__', 'prototype', 'constructor']);

export class ErreurOp extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

type Conteneur = Record<string, unknown> | unknown[];
const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

// ───────────────────────── application (identique au serveur) ─────────────────────────

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
  if (CLES_INTERDITES.has(s)) throw new ErreurOp('chemin-invalide', 'clé interdite');
  return s;
}

function parentDe(doc: unknown, chemin: Chemin): Conteneur {
  if (chemin.length === 0) throw new ErreurOp('chemin-invalide', 'chemin vide');
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

function prefixeResolu(doc: unknown, chemin: Chemin): (string | number)[] {
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

function appliquerUne(doc: unknown, o: Op): Op {
  const parent = parentDe(doc, o.chemin);
  const dernier = o.chemin[o.chemin.length - 1]!;
  const prefixe = prefixeResolu(doc, o.chemin.slice(0, -1));
  if (o.op === 'inserer') {
    if (!Array.isArray(parent)) throw new ErreurOp('chemin-invalide', 'inserer : le parent doit être un tableau');
    const i = resoudre(parent, dernier, true) as number;
    parent.splice(i, 0, clone(o.valeur));
    return { op: 'retirer', chemin: [...prefixe, i] };
  }
  if (Array.isArray(parent)) {
    const i = resoudre(parent, dernier) as number;
    const ancien = parent[i];
    if (o.op === 'poser') { parent[i] = clone(o.valeur); return { op: 'poser', chemin: [...prefixe, i], valeur: ancien }; }
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

/** Applique un delta EN PLACE, tout ou rien (comme le serveur). Lève ErreurOp, document restauré. */
export function appliquerOps(doc: unknown, ops: Op[]): void {
  const inverses: Op[] = [];
  try {
    for (const o of ops) inverses.unshift(appliquerUne(doc, o));
  } catch (e) {
    for (const inv of inverses) appliquerUne(doc, inv);
    throw e;
  }
}

/** Applique un delta tout ou rien ; renvoie false (document inchangé) s'il échoue. */
export function essayerOps(doc: unknown, ops: Op[]): boolean {
  try { appliquerOps(doc, ops); return true; } catch { return false; }
}

/** Applique chaque opération qui peut l'être (rebasage des modifications locales) ; renvoie le nombre d'échecs. */
export function appliquerSouple(doc: unknown, ops: Op[]): number {
  let echecs = 0;
  for (const o of ops) { try { appliquerUne(doc, o); } catch { echecs++; } }
  return echecs;
}

// ───────────────────────── égalité et diff ─────────────────────────

/** Égalité profonde de valeurs JSON (undefined = absent). */
export function egal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!egal(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const oa = a as Record<string, unknown>, ob = b as Record<string, unknown>;
  for (const k in oa) if (oa[k] !== undefined && !egal(oa[k], ob[k])) return false;
  for (const k in ob) if (ob[k] !== undefined && oa[k] === undefined) return false;
  return true;
}

const idDe = (v: unknown): string | undefined => (estObjet(v) && typeof v.id === 'string' ? v.id : undefined);

/** Tous les éléments sont des objets à `id` texte, uniques. */
function parId(t: unknown[]): boolean {
  const vus = new Set<string>();
  for (const e of t) {
    const id = idDe(e);
    if (id === undefined || vus.has(id)) return false;
    vus.add(id);
  }
  return true;
}

/** Plus longue sous-suite croissante (indices dans `v`) : les éléments qui ne bougent pas lors d'un réordonnancement. */
function sousSuiteCroissante(v: number[]): Set<number> {
  const pred = new Array<number>(v.length).fill(-1);
  const fins: number[] = [];
  for (let i = 0; i < v.length; i++) {
    let lo = 0, hi = fins.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (v[fins[m]!]! < v[i]!) lo = m + 1; else hi = m; }
    if (lo > 0) pred[i] = fins[lo - 1]!;
    fins[lo] = i;
  }
  const garde = new Set<number>();
  for (let i = fins.length ? fins[fins.length - 1]! : -1; i >= 0; i = pred[i]!) garde.add(i);
  return garde;
}

function diffValeur(a: unknown, b: unknown, chemin: Chemin, ops: Op[]): void {
  if (egal(a, b)) return;
  if (chemin.length >= LIMITES_OPS.profondeur - 1) { ops.push({ op: 'poser', chemin, valeur: clone(b) }); return; }
  if (estObjet(a) && estObjet(b)) { diffObjet(a, b, chemin, ops); return; }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length + b.length > 0 && parId(a) && parId(b)) diffParId(a, b, chemin, ops);
    else diffParIndex(a, b, chemin, ops);
    return;
  }
  if (chemin.length === 0) throw new ErreurOp('chemin-invalide', 'la racine doit rester un objet');
  ops.push({ op: 'poser', chemin, valeur: clone(b) });
}

function diffObjet(a: Record<string, unknown>, b: Record<string, unknown>, chemin: Chemin, ops: Op[]): void {
  for (const k in a) {
    if (CLES_INTERDITES.has(k) || a[k] === undefined) continue;
    if (b[k] === undefined) ops.push({ op: 'retirer', chemin: [...chemin, k] });
  }
  for (const k in b) {
    if (CLES_INTERDITES.has(k) || b[k] === undefined) continue;
    if (a[k] === undefined) ops.push({ op: 'poser', chemin: [...chemin, k], valeur: clone(b[k]) });
    else diffValeur(a[k], b[k], [...chemin, k], ops);
  }
}

/** Tableau sans id (sorties, conditions, rotatifs…) : élément par élément si même longueur, ajout / coupe en fin,
 *  sinon le tableau est reposé en entier. */
function diffParIndex(a: unknown[], b: unknown[], chemin: Chemin, ops: Op[]): void {
  const n = Math.min(a.length, b.length);
  if (a.length !== b.length) {
    for (let i = 0; i < n; i++) if (!egal(a[i], b[i])) { ops.push({ op: 'poser', chemin, valeur: clone(b) }); return; }
    for (let i = a.length - 1; i >= b.length; i--) ops.push({ op: 'retirer', chemin: [...chemin, i] });
    for (let i = a.length; i < b.length; i++) ops.push({ op: 'inserer', chemin: [...chemin, '-'], valeur: clone(b[i]) });
    return;
  }
  for (let i = 0; i < n; i++) diffValeur(a[i], b[i], [...chemin, i], ops);
}

/** Tableau d'éléments à id (moments, étapes, pistes, clips, repères) : retraits et modifications par {id},
 *  déplacements = retrait + insertion (seuls les éléments hors de la plus longue sous-suite ordonnée bougent),
 *  insertions à l'index voulu ('-' en fin de tableau). */
function diffParId(a: unknown[], b: unknown[], chemin: Chemin, ops: Op[]): void {
  const idsB = new Map<string, number>();
  b.forEach((e, i) => idsB.set(idDe(e)!, i));
  const parIdA = new Map<string, unknown>();
  for (const e of a) parIdA.set(idDe(e)!, e);

  // éléments communs dans l'ordre de a, avec leur rang dans b
  const communs = a.map(idDe).filter((id): id is string => idsB.has(id!));
  const rangs = communs.map((id) => idsB.get(id)!);
  const fixes = sousSuiteCroissante(rangs);
  const restent = new Set(communs.filter((_, i) => fixes.has(i)));

  for (const e of a) {
    const id = idDe(e)!;
    if (!restent.has(id)) ops.push({ op: 'retirer', chemin: [...chemin, { id }] });
  }
  // parcours de b : les i premiers éléments du tableau simulé sont b[0..i-1]
  let restentApres = restent.size;
  for (let i = 0; i < b.length; i++) {
    const e = b[i], id = idDe(e)!;
    if (restent.has(id)) {
      restentApres--;
      diffValeur(parIdA.get(id), e, [...chemin, { id }], ops);
    } else {
      const fin = restentApres === 0;
      ops.push({ op: 'inserer', chemin: [...chemin, fin ? '-' : i], valeur: clone(e) });
    }
  }
}

/** Opérations qui font passer `avant` à `apres` (deux états du projet, non modifiés). */
export function diffProjet(avant: unknown, apres: unknown): Op[] {
  const ops: Op[] = [];
  diffValeur(avant, apres, [], ops);
  return ops;
}

/** Répartit des opérations en deltas ≤ 200 opérations et ≤ ~200 Ko. Une opération seule trop lourde va dans `tropGros`. */
export function decouper(ops: Op[], limites = LIMITES_OPS): { deltas: Op[][]; tropGros: Op[] } {
  const deltas: Op[][] = [];
  const tropGros: Op[] = [];
  let courant: Op[] = [], taille = 0;
  for (const o of ops) {
    const t = JSON.stringify(o).length + 1;
    if (t > limites.octetsParDelta) { tropGros.push(o); continue; }
    if (courant.length >= limites.opsParDelta || taille + t > limites.octetsParDelta) { deltas.push(courant); courant = []; taille = 0; }
    courant.push(o); taille += t;
  }
  if (courant.length) deltas.push(courant);
  return { deltas, tropGros };
}

/** Cible de verrou touchée par un chemin (même règle que le serveur, pour l'affichage). */
export function cibleDeChemin(chemin: Chemin): string {
  const tete = chemin[0], seg = chemin[1];
  if ((tete === 'ev' || tete === 'tracks') && typeof seg === 'object' && seg !== null) return `${tete === 'ev' ? 'moment' : 'piste'}:${seg.id}`;
  return 'projet';
}

export const copie = clone;
