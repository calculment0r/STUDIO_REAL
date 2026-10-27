// Formats des temps du conducteur : toujours MM:SS entiers, jamais de décimale (fm() du design).

/** 125.7 → « 02:05 ». Les minutes dépassent 99 si besoin. */
export function mmss(s: number): string {
  const v = Math.max(0, Math.floor((Number.isFinite(+s) ? +s : 0) + 1e-6));
  return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
}

/** Retard signé : « +02:40 » / « −00:12 » (vrai signe moins). */
export function mmssSigne(s: number): string {
  return (s >= 0 ? '+' : '−') + mmss(Math.abs(s));
}

/** Chiffres romains des actes (I → X, puis le nombre). */
const ROMAINS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const romain = (i: number): string => ROMAINS[i] ?? String(i + 1);
