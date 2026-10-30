// @studio-real/theme : formats des temps, copie de apps/conducteur/src/theme/format.ts (fm() du design) : le Conducteur garde son format.ts typé ; une valeur se change des deux côtés.
// Toujours MM:SS entiers, jamais de décimale. Module ES : `import { mmss } from '…/packages/theme/format.js'`.

/** 125.7 → « 02:05 ». Les minutes dépassent 99 si besoin. @param {number} s @returns {string} */
export function mmss(s) {
  const v = Math.max(0, Math.floor((Number.isFinite(+s) ? +s : 0) + 1e-6));
  return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
}

/** Retard signé : « +02:40 » / « −00:12 » (vrai signe moins). @param {number} s @returns {string} */
export function mmssSigne(s) {
  return (s >= 0 ? '+' : '−') + mmss(Math.abs(s));
}

/** Chiffres romains des actes (I → X, puis le nombre). */
const ROMAINS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
/** @param {number} i @returns {string} */
export const romain = (i) => ROMAINS[i] ?? String(i + 1);
