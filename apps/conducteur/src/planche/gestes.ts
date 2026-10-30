// Gestes de la molette, communs à la planche (haut) et à la conduite (bas) : logique PURE, testée dans gestes.test.ts.
//   molette seule = DÉFILER (vertical sur la planche, horizontal sur la conduite)
//   Ctrl (ou Cmd) + molette, ou pincement sur un pavé tactile = ZOOMER
// Les navigateurs envoient un pincement de pavé comme une molette avec ctrlKey = true : plus besoin de deviner si
// l'appareil est une souris ou un pavé d'après la taille du delta.

export type GesteMolette = 'defiler' | 'zoomer';

/** Ce que la décision lit d'un événement `wheel`. */
export interface EntreeGeste { ctrlKey: boolean; metaKey?: boolean }
/** Ce que la mesure du défilement lit d'un événement `wheel`. */
export interface EntreeMolette extends EntreeGeste { shiftKey?: boolean; deltaX: number; deltaY: number; deltaMode?: number }

/** Pixels pour un cran de molette en mode « lignes » (deltaMode 1) ou « pages » (deltaMode 2). */
export const PX_PAR_LIGNE = 33;
export const PX_PAR_PAGE = 400;
/** Zoom à la molette : facteur exp(−delta × coef), delta borné (un cran de souris ≈ 26 % ; un pincement fin reste doux). */
export const COEF_ZOOM_MOLETTE = 0.006;
export const DELTA_ZOOM_MAX = 50;

/** Défiler ou zoomer ? Ctrl / Cmd (ou pincement) = zoomer ; tout le reste = défiler. */
export function gesteMolette(e: EntreeGeste): GesteMolette {
  return e.ctrlKey || e.metaKey ? 'zoomer' : 'defiler';
}

/** Deltas de la molette en pixels, quel que soit le mode (pixels, lignes, pages). */
export function pixelsMolette(e: Pick<EntreeMolette, 'deltaX' | 'deltaY' | 'deltaMode'>): { dx: number; dy: number } {
  const k = e.deltaMode === 1 ? PX_PAR_LIGNE : e.deltaMode === 2 ? PX_PAR_PAGE : 1;
  return { dx: e.deltaX * k, dy: e.deltaY * k };
}

/** Défilement de la planche en pixels : Maj + molette défile à l'horizontale (molette verticale d'une souris). */
export function defilementMolette(e: EntreeMolette): { dx: number; dy: number } {
  const { dx, dy } = pixelsMolette(e);
  return e.shiftKey && !dx ? { dx: dy, dy: 0 } : { dx, dy: e.shiftKey ? 0 : dy };
}

/** Facteur de zoom d'un cran de molette (> 1 : on zoome, < 1 : on dézoome). */
export function facteurZoomMolette(e: Pick<EntreeMolette, 'deltaX' | 'deltaY' | 'deltaMode'>): number {
  const { dx, dy } = pixelsMolette(e);
  const d = Math.max(-DELTA_ZOOM_MAX, Math.min(DELTA_ZOOM_MAX, dy || dx));
  return Math.exp(-d * COEF_ZOOM_MOLETTE);
}
