// Petites aides de style de la planche (jetons du thème uniquement).

/** Longueur en coordonnées du monde d'une mesure d'écran (bordures, rayons à taille constante à tous les zooms). */
export const px = (n: number) => `calc(${n}px / var(--z))`;
/** Teinte translucide d'un jeton de couleur. */
export const teinte = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
/** Trait neutre à l'opacité donnée (jeton --lr : r,g,b de l'encre des traits). */
export const LIGNE = (a: number) => `rgba(var(--lr),${a})`;
