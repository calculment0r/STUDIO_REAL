// Temps ↔ pixels de la conduite, zoom et défilement façon Premiere. Logique pure (testée dans temps.test.ts).
//
// Repère : x = 0 est le temps 0 dans le contenu des pistes (à droite de la colonne des en-têtes).
// Le zoom est en pixels par seconde (`zoomConduite` du magasin) ; le défilement en pixels du contenu.

/** Largeur de la colonne des en-têtes (libellés TEMPS / ACTES… et noms des pistes), comme le design (LBL). */
export const LARGEUR_ENTETES = 176;
/** Marge laissée après la fin de la conduite (le « + » de fin de rangée y loge). */
export const MARGE_FIN = 120;
/** Bornes du zoom : les mêmes que `zoomerConduite` du magasin. */
export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 8;
/** Un cran de zoom au clavier ou aux boutons (le design : ×1,5). */
export const PAS_ZOOM = 1.5;

/** MM:SS entiers, jamais de décimale (les heures se cumulent dans les minutes : 75:00). */
export function fm(s: number): string {
  const v = Math.max(0, Math.floor((Number.isFinite(s) ? s : 0) + 1e-6));
  return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
}

export const tempsVersPx = (t: number, pps: number): number => t * pps;
export const pxVersTemps = (x: number, pps: number): number => (pps > 0 ? x / pps : 0);

export const borner = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const bornerZoom = (pps: number): number => borner(pps, ZOOM_MIN, ZOOM_MAX);

/** Défilement maximal : la fin de la conduite (plus la marge) arrive au bord droit. */
export function defilementMax(total: number, pps: number, largeurVue: number): number {
  return Math.max(0, total * pps + MARGE_FIN - largeurVue);
}

export function bornerDefilement(x: number, total: number, pps: number, largeurVue: number): number {
  return borner(x, 0, defilementMax(total, pps, largeurVue));
}

/**
 * Zoom centré : le temps sous `ancre` (px depuis le bord gauche de la zone des pistes) reste sous `ancre`.
 * Rend le nouveau défilement (non borné : à borner par l'appelant avec la durée totale).
 */
export function zoomCentre(defilement: number, pps: number, ppsNouveau: number, ancre: number): number {
  const t = pxVersTemps(defilement + ancre, pps);
  return tempsVersPx(t, ppsNouveau) - ancre;
}

/** Alt + molette : un facteur exponentiel du delta, borné (comme le design : exp(d × 0,006), |d| ≤ 50). */
export function zoomMolette(pps: number, deltaY: number): number {
  const d = borner(deltaY, -50, 50);
  return bornerZoom(pps * Math.exp(-d * 0.006));
}

/** Le zoom qui fait tenir toute la conduite dans la vue (« TOUT ») : toute la largeur, comme le design. */
export function zoomPourTout(total: number, largeurVue: number): number {
  if (total <= 0) return bornerZoom(1);
  return bornerZoom(Math.max(10, largeurVue - 2) / total);
}

// ── la règle (le design : petites graduations d'au moins 12 px, graduations étiquetées d'au moins 70 px) ──
const PAS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800];
/** Pas des petites graduations (s). */
export function sousPasRegle(pps: number): number {
  return PAS.find((s) => s * pps >= 12) ?? 1800;
}
/** Pas des graduations étiquetées (s), multiple du petit pas : au zoom par défaut d'un spectacle de 40 min, 02:00. */
export function pasRegle(pps: number): number {
  const mn = sousPasRegle(pps);
  return PAS.find((s) => s % mn === 0 && s * pps >= 70) ?? 1800;
}

export interface Graduation { t: number; x: number; libelle: string; sous: boolean }

/** Les graduations entre les pixels `gauche` et `droite` du contenu (+ une de chaque côté) : étiquetées (MM:SS) et petites. */
export function graduations(pps: number, gauche: number, droite: number): Graduation[] {
  const pas = pasRegle(pps), sp = sousPasRegle(pps);
  const de = Math.max(0, Math.floor(gauche / pps / pas) - 1) * pas;
  const a = (Math.ceil(droite / pps / pas) + 1) * pas;
  const out: Graduation[] = [];
  for (let t = de, n = 0; t <= a && n < 4000; t += sp, n++) {
    const pleine = t % pas === 0;
    out.push({ t, x: t * pps, libelle: pleine ? fm(t) : '', sous: !pleine });
  }
  return out;
}

/** Pendant la lecture, la vue suit (commun/tete.js `suivre`) : à 30 px du bord droit, elle repart 60 px avant la tête. Rend null si rien à faire. */
export function suivre(defilement: number, x: number, largeurVue: number): number | null {
  if (x > defilement + largeurVue - 30 || x < defilement) return Math.max(0, x - 60);
  return null;
}

/** Barre de zoom : position et largeur (fractions 0 → 1) de la fenêtre visible sur toute la conduite. */
export function fenetreVisible(defilement: number, pps: number, largeurVue: number, total: number): { debut: number; largeur: number } {
  const tot = Math.max(1, total);
  const t0 = pxVersTemps(defilement, pps);
  const span = pxVersTemps(largeurVue, pps);
  return { debut: borner(t0 / tot, 0, 1), largeur: borner(span / tot, 0, 1) };
}

/**
 * Barre de zoom, poignée tirée : la fenêtre [t0, t0 + span] (s) devient le nouveau zoom et défilement.
 * span minimal 20 s (le design), borné à la conduite.
 */
export function vueDepuisFenetre(t0: number, span: number, largeurVue: number, total: number): { pps: number; defilement: number } {
  const s = borner(span, Math.min(20, Math.max(1, total)), Math.max(20, total));
  const pps = bornerZoom(largeurVue / s);
  return { pps, defilement: Math.max(0, t0 * pps) };
}
