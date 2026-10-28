// Planche : logique PURE (sans React ni DOM) — placement des étapes, géométrie des liens, niveaux de zoom,
// caméra (écran ↔ monde), édition des sorties. Port fidèle de layout() / fitR() / bz() du design
// (conception/conducteur/source/Studio Real Conducteur.dc.html). Testé dans geometrie.test.ts.
import type { Condition, Etape, Moment, Projet, Sortie } from '@studio-real/modele';
import { dureeEtape } from '@studio-real/modele';
import { nouvelId } from '../etat/ids';

// ── Constantes du monde (pixels du monde, zoom 1) ─────────────────────────────────────────────
export const LARGEUR_BLOC = 240;
export const PAS_COLONNE = 560;
export const PAS_RANGEE = 320;
/** Marge intérieure d'un cadre de moment autour de ses étapes. */
export const MARGE_CADRE = 46;
/** Hauteur réservée à une étape pour le calcul du cadre (indépendante du zoom : le cadre ne saute pas). */
export const HAUTEUR_RESERVEE = 264;
/** Espace sous le titre au-dessus des étapes, dans le cadre. */
export const ENTETE_CADRE = 90;
/** Écart horizontal entre deux cadres de moments. */
export const ECART_MOMENTS = 180;
/** Hauteur du rond d'entrée (et de la première sortie) sous le haut du bloc. */
export const Y_ENTREE = 28;
export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 2.2;

// ── Zoom sémantique ───────────────────────────────────────────────────────────────────────────
/** < 50 % vue d'ensemble · 50–100 % étapes · > 100 % réglages. */
export type Niveau = 'loin' | 'moyen' | 'pres';

export function niveauZoom(z: number): Niveau {
  if (z < 0.5) return 'loin';
  if (z <= 1 + 1e-9) return 'moyen';
  return 'pres';
}

/** Hauteur d'un bloc selon le niveau (pastille / aperçu / aperçu + rotatifs + sorties détaillées). */
export function hauteurBloc(n: Niveau): number {
  return n === 'loin' ? 56 : n === 'moyen' ? 164 : 292;
}

/** Zoom typique de chaque niveau (boutons « vue d'ensemble / étapes / réglages » du design). */
export const ZOOM_NIVEAU: Record<Niveau, number> = { loin: 0.36, moyen: 0.75, pres: 1.15 };

export const bornerZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

// ── Caméra : écran = monde × z + (px, py) ───────────────────────────────────────────────────────
export interface Camera { px: number; py: number; z: number }
export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const ecranVersMonde = (c: Camera, sx: number, sy: number): Point => ({ x: (sx - c.px) / c.z, y: (sy - c.py) / c.z });
export const mondeVersEcran = (c: Camera, wx: number, wy: number): Point => ({ x: wx * c.z + c.px, y: wy * c.z + c.py });

/** Zoome vers z en gardant fixe le point écran (sx, sy). */
export function zoomerAutour(c: Camera, z: number, sx: number, sy: number): Camera {
  const nz = bornerZoom(z);
  return { z: nz, px: sx - (sx - c.px) * nz / c.z, py: sy - (sy - c.py) * nz / c.z };
}

/** Rectangle du monde visible à l'écran (largeur l, hauteur h), agrandi d'une marge relative. */
export function vueMonde(c: Camera, l: number, h: number, marge = 0): Rect {
  const w = l / c.z, hh = h / c.z, mx = w * marge, my = hh * marge;
  return { x: -c.px / c.z - mx, y: -c.py / c.z - my, w: w + 2 * mx, h: hh + 2 * my };
}

export const intersecte = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const unionRect = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/** Cadre un rectangle du monde dans la planche (fitR du design) : marge pour la barre d'outils,
 *  zoom plafonné à 105 %, et au moins 50 % dès que ça tient (lisible). */
export function cadrer(r: Rect, l: number, h: number): Camera {
  const zf = (haut: number) => Math.max(ZOOM_MIN, Math.min(1.05, Math.min((l - 80) / r.w, (h - haut - 56) / r.h)));
  let haut = 122, z = zf(haut);
  if (z >= 0.5) { haut = 64; z = Math.max(0.5, zf(haut)); }
  const ah = h - haut - 56;
  return { z, px: l / 2 - (r.x + r.w / 2) * z, py: haut - r.y * z + Math.max(0, (ah - r.h * z) / 2) };
}

/** Zoom de la caméra de spectacle : choisi une fois, puis constant. On garde le zoom courant s'il est lisible (niveau
 *  ÉTAPES ou plus près) ; en vue d'ensemble, on passe au niveau ÉTAPES. */
export function zoomDeSpectacle(zCourant: number): number {
  return niveauZoom(zCourant) === 'loin' ? ZOOM_NIVEAU.moyen : bornerZoom(zCourant);
}

/** Caméra de spectacle : place le rectangle r dans la planche SANS changer le zoom z (panoramique seul).
 *  Si r tient dans la vue il est centré ; sinon son bord gauche (et son bord haut) est calé sur la marge. */
export function cadrerSansZoom(r: Rect, l: number, h: number, z: number, haut = 64, bas = 56, marge = 40): Camera {
  const dispoL = l - 2 * marge, dispoH = h - haut - bas;
  const px = r.w * z <= dispoL ? l / 2 - (r.x + r.w / 2) * z : marge - r.x * z;
  const py = r.h * z <= dispoH ? haut + (dispoH - r.h * z) / 2 - r.y * z : haut - r.y * z;
  return { z, px, py };
}

/** Flèche « PROCHAIN » : où, au bord de la vue, pointer vers un rectangle hors champ. */
export interface FlecheProchain {
  /** Direction du centre de la vue vers le centre de la cible, en radians (atan2, y vers le bas). */
  angle: number;
  /** Bord de la vue où la flèche se pose. */
  bord: 'gauche' | 'droite' | 'haut' | 'bas';
  /** Position de la flèche sur ce bord, en fraction de la largeur (u) et de la hauteur (v) de la vue, 0 → 1. */
  u: number;
  v: number;
}

/** Calcule la flèche à partir de deux rectangles du monde : la vue et la cible. Rien (null) si le centre de la cible est déjà dans la vue. */
export function flecheProchain(vue: Rect, cible: Rect): FlecheProchain | null {
  if (vue.w <= 0 || vue.h <= 0) return null;
  const cx = vue.x + vue.w / 2, cy = vue.y + vue.h / 2;
  const dx = cible.x + cible.w / 2 - cx, dy = cible.y + cible.h / 2 - cy;
  const hw = vue.w / 2, hh = vue.h / 2;
  if (Math.abs(dx) <= hw && Math.abs(dy) <= hh) return null;
  const sx = dx === 0 ? Infinity : hw / Math.abs(dx), sy = dy === 0 ? Infinity : hh / Math.abs(dy);
  const s = Math.min(sx, sy);
  const bord = sx <= sy ? (dx > 0 ? 'droite' : 'gauche') : (dy > 0 ? 'bas' : 'haut');
  return { angle: Math.atan2(dy, dx), bord, u: (cx + dx * s - vue.x) / vue.w, v: (cy + dy * s - vue.y) / vue.h };
}

/** Rapproche la caméra de la cible (suivi en mode Jouer) ; a = part du chemin parcourue (0 → 1). */
export function rapprocher(c: Camera, cible: Camera, a: number): Camera {
  const k = Math.max(0, Math.min(1, a));
  return { z: c.z + (cible.z - c.z) * k, px: c.px + (cible.px - c.px) * k, py: c.py + (cible.py - c.py) * k };
}

export const cameraProche = (a: Camera, b: Camera) => Math.abs(a.px - b.px) + Math.abs(a.py - b.py) < 0.4 && Math.abs(a.z - b.z) < 0.0008;

// ── Placement des moments et des étapes (colonne c, rangée r, décalage dx dy) ──────────────────
export interface CadreMoment {
  moment: Moment;
  index: number;
  /** Abscisse d'origine des colonnes du moment. */
  fx: number;
  /** Position (coin haut-gauche) de chaque étape. */
  P: Record<string, Point>;
  /** Cadre du moment (inclut l'espace du titre). */
  r: Rect;
}

/** Décalage provisoire pendant un glisser (appliqué au placement sans toucher au projet). */
export interface DecalageProvisoire { moment: string; etape: string; ddx: number; ddy: number }

export function positionEtape(fx: number, e: Pick<Etape, 'c' | 'r' | 'dx' | 'dy'>): Point {
  return { x: fx + MARGE_CADRE + e.c * PAS_COLONNE + e.dx, y: e.r * PAS_RANGEE + e.dy };
}

/** Place un moment dont les colonnes commencent à fx. */
export function placerUnMoment(moment: Moment, index: number, fx: number, prov?: DecalageProvisoire | null): CadreMoment {
  const P: Record<string, Point> = {};
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const st of moment.st) {
    const p = positionEtape(fx, st);
    if (prov && prov.moment === moment.id && prov.etape === st.id) { p.x += prov.ddx; p.y += prov.ddy; }
    P[st.id] = p;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x + LARGEUR_BLOC);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y + HAUTEUR_RESERVEE);
  }
  if (!moment.st.length) { x0 = fx + MARGE_CADRE; x1 = x0 + LARGEUR_BLOC; y0 = 0; y1 = HAUTEUR_RESERVEE; }
  const rx = Math.min(fx, x0 - MARGE_CADRE), ry = y0 - ENTETE_CADRE;
  return { moment, index, fx, P, r: { x: rx, y: ry, w: x1 + MARGE_CADRE - rx, h: y1 + MARGE_CADRE - ry } };
}

export function placerMoments(moments: Moment[], prov?: DecalageProvisoire | null): CadreMoment[] {
  let fx = 0;
  return moments.map((moment, index) => {
    const cadre = placerUnMoment(moment, index, fx, prov);
    fx = cadre.r.x + cadre.r.w + ECART_MOMENTS;
    return cadre;
  });
}

/** Pendant un glisser : ne recalcule que le moment touché (les autres cadres gardent leur identité → pas de re-rendu). */
export function appliquerProvisoire(cadres: CadreMoment[], prov: DecalageProvisoire | null): CadreMoment[] {
  if (!prov) return cadres;
  return cadres.map(f => (f.moment.id === prov.moment ? placerUnMoment(f.moment, f.index, f.fx, prov) : f));
}

/** Inverse du placement : colonne, rangée et décalage pour poser une étape au point du monde (x, y) = coin haut-gauche. */
export function grilleDepuisPoint(fx: number, x: number, y: number): Pick<Etape, 'c' | 'r' | 'dx' | 'dy'> {
  const c = Math.max(0, Math.round((x - fx - MARGE_CADRE) / PAS_COLONNE));
  const r = Math.round(y / PAS_RANGEE);
  return { c, r, dx: Math.round(x - (fx + MARGE_CADRE + c * PAS_COLONNE)), dy: Math.round(y - r * PAS_RANGEE) };
}

/** Le cadre qui contient le point, sinon le plus proche en x. */
export function cadreAuPoint(cadres: CadreMoment[], x: number, y: number): CadreMoment | null {
  let meilleur: CadreMoment | null = null, d = Infinity;
  for (const f of cadres) {
    if (x >= f.r.x && x <= f.r.x + f.r.w && y >= f.r.y && y <= f.r.y + f.r.h) return f;
    const dd = x < f.r.x ? f.r.x - x : x > f.r.x + f.r.w ? x - f.r.x - f.r.w : 0;
    if (dd < d) { d = dd; meilleur = f; }
  }
  return meilleur;
}

// ── Ronds d'entrée / de sortie (collés au bord du bloc à tous les zooms) ────────────────────────
/** Ordonnée (relative au haut du bloc) du rond de la sortie n° k (0 = première ; k = nb sorties → rond « + »). */
export function yRondSortie(k: number, n: Niveau): number {
  return n === 'loin' ? Y_ENTREE : Math.min(hauteurBloc(n) - 16, Y_ENTREE + k * 20);
}

export const rondEntree = (p: Point): Point => ({ x: p.x, y: p.y + Y_ENTREE });
export const rondSortie = (p: Point, k: number, n: Niveau): Point => ({ x: p.x + LARGEUR_BLOC, y: p.y + yRondSortie(k, n) });

// ── Liens : courbes de Bézier horizontales ──────────────────────────────────────────────────────
const tangente = (ax: number, bx: number) => Math.max(40, Math.abs(bx - ax) * 0.45);

export function cheminLien(ax: number, ay: number, bx: number, by: number): string {
  const d = tangente(ax, bx), f = (v: number) => Math.round(v * 10) / 10;
  return `M${f(ax)} ${f(ay)} C${f(ax + d)} ${f(ay)} ${f(bx - d)} ${f(by)} ${f(bx)} ${f(by)}`;
}

/** Point de la courbe à u ∈ [0, 1]. */
export function pointSurLien(ax: number, ay: number, bx: number, by: number, u: number): Point {
  const d = tangente(ax, bx), c1x = ax + d, c2x = bx - d, m = 1 - u;
  return {
    x: m * m * m * ax + 3 * m * m * u * c1x + 3 * m * u * u * c2x + u * u * u * bx,
    y: m * m * m * ay + 3 * m * m * u * ay + 3 * m * u * u * by + u * u * u * by,
  };
}

export interface GeometrieLien { sortie: Sortie; index: number; ordre: number; nb: number; a: Point; b: Point; d: string; milieu: Point }

/** Géométrie de toutes les sorties d'un moment placé (les sorties vers « fin du moment » n'ont pas de courbe). */
export function liensDuMoment(f: CadreMoment, n: Niveau): GeometrieLien[] {
  const parSource = new Map<string, Sortie[]>();
  for (const s of f.moment.tr) parSource.set(s.a, [...(parSource.get(s.a) ?? []), s]);
  const res: GeometrieLien[] = [];
  f.moment.tr.forEach((sortie, index) => {
    const pa = f.P[sortie.a], pb = sortie.b ? f.P[sortie.b] : undefined;
    if (!pa || !pb) return;
    const soeurs = parSource.get(sortie.a) ?? [];
    const ordre = Math.max(0, soeurs.indexOf(sortie));
    const a = rondSortie(pa, ordre, n), b = rondEntree(pb);
    res.push({ sortie, index, ordre, nb: soeurs.length, a, b, d: cheminLien(a.x, a.y, b.x, b.y), milieu: pointSurLien(a.x, a.y, b.x, b.y, 0.5) });
  });
  return res;
}

// ── Sorties : ordre, création, suppression (mutations sur une copie du projet) ──────────────────
export const entreesDe = (m: Moment): string[] => typeof m.entry === 'string' ? [m.entry] : Object.values(m.entry);

export const sortiesDe = (m: Moment, a: string): Sortie[] => m.tr.filter(s => s.a === a);

/** Échange la sortie (index global dans m.tr) avec sa voisine de même source ; renvoie le nouvel index, ou −1. */
export function deplacerSortie(m: Moment, index: number, sens: -1 | 1): number {
  const s = m.tr[index];
  if (!s) return -1;
  const soeurs = sortiesDe(m, s.a), k = soeurs.indexOf(s), j = k + sens;
  if (j < 0 || j >= soeurs.length) return -1;
  const i2 = m.tr.indexOf(soeurs[j]);
  m.tr[index] = soeurs[j];
  m.tr[i2] = s;
  return i2;
}

/** Ajoute la sortie a → b (fin de liste des sorties de a) ; refuse a = b et les doublons. */
export function ajouterSortie(m: Moment, a: string, b: string): boolean {
  if (a === b || m.tr.some(s => s.a === a && s.b === b)) return false;
  if (!m.st.some(e => e.id === a) || !m.st.some(e => e.id === b)) return false;
  m.tr.push({ a, b, g: [], mode: 'all' });
  return true;
}

/** Supprime une étape et ses sorties ; la (les) première(s) étape(s) du moment ne se suppriment pas. */
export function supprimerEtape(m: Moment, id: string): boolean {
  if (entreesDe(m).includes(id) || !m.st.some(e => e.id === id)) return false;
  m.st = m.st.filter(e => e.id !== id);
  m.tr = m.tr.filter(s => s.a !== id && s.b !== id);
  return true;
}

/** Crée une étape dans le moment, coin haut-gauche au point du monde (x, y). Renvoie son id. */
export function creerEtape(p: Projet, momentId: string, fx: number, x: number, y: number, ty = 'k:passage', nom = 'Nouvelle étape'): string | null {
  const m = p.ev.find(e => e.id === momentId);
  if (!m) return null;
  const id = nouvelId(p, 'st');
  m.st.push({ id, name: nom, ty, ...grilleDepuisPoint(fx, x, y), k: [3, 50, 50] });
  return id;
}

// ── Libellés (vocabulaire du théâtre) ───────────────────────────────────────────────────────────
/** Temps toujours MM:SS entiers. */
export function fm(s: number): string {
  const v = Math.max(0, Math.floor((+s || 0) + 1e-6));
  return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
}

export function libelleCondition(g: Condition): string {
  const v = g.v, op = g.op;
  switch (g.k) {
    case 't': return op === '≥' || op === '>' ? 'après ' + fm(+v) : op + ' ' + fm(+v);
    // phrases du design (glab) pour l'opérateur habituel ; sinon l'opérateur est écrit
    case 'pres': return op === '≥' ? `au moins ${v} spectateurs assis` : `${op} ${v} spectateurs assis`;
    case 'quorum': return op === '≥' ? `${v} % des votes reçus` : `${op} ${v} % des votes reçus`;
    case 'prets': return op === '≥' ? `${v} % des téléphones prêts` : `${op} ${v} % des téléphones prêts`;
    case 'bruit': return op === '≤' || op === '<' ? `salle calme · ${op} ${v} dB` : `${op} ${v} dB`;
    case 'assis': return `${op} ${v} % du public assis`;
    case 'issue': {
      const nom = v === 'T' ? 'égalité' : String(v);
      return op === '≠' ? 'le public ne choisit pas ' + nom : v === 'T' ? 'égalité au vote' : 'le public choisit ' + nom;
    }
    default:
      if (g.k.startsWith('mem:')) return `mémoire « ${g.k.slice(4)} » ${op} ${v}`;
      return `${g.k} ${op} ${v}`;
  }
}

/** Règle lisible d'une sortie ; une sortie sans condition est le « sinon » (ou « à la fin » si elle est seule). */
export function regleSortie(s: Sortie, nbSoeurs: number): string {
  if (!s.g.length) return nbSoeurs > 1 ? 'sinon · à la fin de l’étape' : 'à la fin de l’étape';
  return s.g.map(libelleCondition).join(s.mode === 'any' ? ' ou ' : ' et ');
}

// ── États de lecture (Préparer et Jouer) ─────────────────────────────────────────────────────
export type StatutEtape = 'neutre' | 'joue' | 'actif' | 'avenir' | 'ignore';

export interface LectureMinimale {
  moment: string | null;
  etape: string | null;
  parcours: [string, string, number][];
}

/** Statut de chaque étape d'un moment : jouée, en cours, à venir, ou non choisie (moment passé, étape sautée). */
export function statutsMoment(m: Moment, indexMoment: number, indexCourant: number, l: LectureMinimale | null): Record<string, StatutEtape> {
  const res: Record<string, StatutEtape> = {};
  const joues = new Set<string>();
  if (l) for (const [mo, et] of l.parcours) if (mo === m.id) joues.add(et);
  for (const e of m.st) {
    if (!l) res[e.id] = 'neutre';
    else if (l.moment === m.id && l.etape === e.id) res[e.id] = 'actif';
    else if (joues.has(e.id)) res[e.id] = 'joue';
    else if (indexCourant >= 0 && indexMoment < indexCourant) res[e.id] = 'ignore';
    else res[e.id] = 'avenir';
  }
  return res;
}

/** Statut d'une sortie : franchie (a puis b dans le parcours), en évaluation (a en cours), à venir, ou ignorée. */
export function statutSortie(s: Sortie, statuts: Record<string, StatutEtape>, parcoursMoment: string[]): 'franchie' | 'evaluee' | 'avenir' | 'ignoree' | 'neutre' {
  const sa = statuts[s.a];
  if (sa === 'neutre' || sa === undefined) return 'neutre';
  for (let i = 0; i + 1 < parcoursMoment.length; i++) if (parcoursMoment[i] === s.a && parcoursMoment[i + 1] === s.b) return 'franchie';
  if (sa === 'actif') return 'evaluee';
  if (sa === 'ignore' || sa === 'joue') return 'ignoree';
  return 'avenir';
}

/** Progression de l'étape en cours, 0 → 1 (elle dure au minimum sa durée prévue). */
export function progressionEtape(e: Pick<Etape, 'k'>, tEtape: number): number {
  const d = dureeEtape(e);
  return Math.max(0, Math.min(1, tEtape / d));
}

/** Étape « de fin » d'un moment (point de départ du passage vers le suivant) : sans sortie, la plus à droite. */
export function etapeDeFin(m: Moment, f: CadreMoment, parcours?: string[]): string | null {
  if (parcours && parcours.length) return parcours[parcours.length - 1];
  const sans = m.st.filter(e => !m.tr.some(s => s.a === e.id && s.b));
  const pool = sans.length ? sans : m.st;
  let best: Etape | null = null;
  for (const e of pool) {
    const p = f.P[e.id];
    if (!best || p.x > f.P[best.id].x || (p.x === f.P[best.id].x && Math.abs(p.y) < Math.abs(f.P[best.id].y))) best = e;
  }
  return best ? best.id : null;
}

/** Étape d'entrée d'un moment (si l'entrée dépend d'une issue de vote : celle de l'issue, sinon la première). */
export function etapeDEntree(m: Moment, issue?: string): string | null {
  if (typeof m.entry === 'string') return m.entry;
  return (issue && m.entry[issue]) || Object.values(m.entry)[0] || null;
}
