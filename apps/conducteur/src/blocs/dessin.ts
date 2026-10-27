// Primitives de dessin des aperçus (port des fonctions tx, fr, sr, dot, ring, av, emb, seg7, seats, phone, wave, feu
// de studio-real/blocs.js). Toutes les couleurs viennent de la palette passée en argument.
import type { Palette } from './palette';

export type Ctx = CanvasRenderingContext2D;

export const PSEUDOS = ['Zoé42', 'Max', 'Léa', 'Inès_b', 'Tom', 'Kenji', 'Sacha', 'Nour', 'Yanis', 'Camille.R', 'Bastien', 'Mila'];
export const MSGS: [string, string][] = [['trop bien 🔥', 'Zoé42'], ['va au métro !', 'Kenji'], ['le toit, le toit', 'Nour'], ['milo t’es où ?', 'Tom'], ['boulangerie svp', 'Léa'], ['😱😱😱', 'Sacha']];
export const TEAMS: [string, number][] = [['corbeaux', 36], ['lucioles', 35], ['renards', 34], ['méduses', 33]];
export const OPTS = ['boulangerie', 'toit', 'métro'];

/** Polices : m = micro-étiquette (Azeret Mono), d = chiffres et titres (Venus Rising), u = texte (Chakra Petch). */
export const F = {
  m: (s: number, w?: number) => `${w || 500} ${s}px "Azeret Mono", ui-monospace, monospace`,
  d: (s: number) => `${s}px "Venus Rising", "Chakra Petch", sans-serif`,
  u: (s: number, w?: number) => `${w || 600} ${s}px "Chakra Petch", sans-serif`,
};

type AvecEspacement = { letterSpacing?: string };

export function tx(c: Ctx, s: string, x: number, y: number, font: string, col: string, al: CanvasTextAlign = 'left', ls?: string) {
  c.font = font; c.fillStyle = col; c.textAlign = al; c.textBaseline = 'middle';
  const e = c as unknown as AvecEspacement;
  if (ls) e.letterSpacing = ls;
  c.fillText(s, x, y);
  if (ls) e.letterSpacing = '0px';
}
export function fr(c: Ctx, x: number, y: number, w: number, h: number, col: string) { c.fillStyle = col; c.fillRect(x, y, w, h); }
export function sr(c: Ctx, x: number, y: number, w: number, h: number, col: string, lw = 1) {
  c.strokeStyle = col; c.lineWidth = lw; c.strokeRect(x + .5, y + .5, w - 1, h - 1);
}
export function dot(c: Ctx, x: number, y: number, r: number, col: string) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
export function ring(c: Ctx, x: number, y: number, r: number, f: number, col: string, bg: string, lw: number) {
  c.lineWidth = lw; c.lineCap = 'butt'; c.strokeStyle = bg; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke();
  c.strokeStyle = col; c.beginPath(); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.max(0, Math.min(1, f)) * Math.PI * 2); c.stroke();
}
/** Avatar carré d'un spectateur (pseudo coloré). */
export function av(c: Ctx, x: number, y: number, s: number, i: number, C: Palette, grey?: boolean) {
  fr(c, x - 1, y - 1, s + 2, s + 2, C['--bg']);
  fr(c, x, y, s, s, grey ? C['--panel3'] : C['--pseudo-' + (i % 12 + 1)]);
  tx(c, PSEUDOS[i % 12][0].toUpperCase(), x + s / 2, y + s / 2 + .5, F.u(s * .48, 700), grey ? C['--ink3'] : C['--titre-sombre'], 'center');
}
/** Emblème d'équipe : triangle, rond, carré, losange. */
export function emb(c: Ctx, k: number, x: number, y: number, r: number, col: string) {
  c.fillStyle = col; c.beginPath();
  if (k === 0) { c.moveTo(x, y - r); c.lineTo(x + r, y + r * .8); c.lineTo(x - r, y + r * .8); }
  else if (k === 1) { c.arc(x, y, r, 0, 7); }
  else if (k === 2) { c.rect(x - r * .85, y - r * .85, r * 1.7, r * 1.7); }
  else { c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); }
  c.closePath(); c.fill();
}
const SEG7 = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
/** Chiffre à sept segments (afficheur LCD). */
export function seg7(c: Ctx, x: number, y: number, w: number, h: number, d: number, on: string, off: string) {
  const t = Math.max(2, w * .17), hh = h / 2;
  const R = [[t, 0, w - 2 * t, t], [w - t, t, t, hh - t * 1.5], [w - t, hh + t * .5, t, hh - t * 1.5], [t, h - t, w - 2 * t, t], [0, hh + t * .5, t, hh - t * 1.5], [0, t, t, hh - t * 1.5], [t, hh - t / 2, w - 2 * t, t]];
  R.forEach((r, i) => fr(c, x + r[0], y + r[1], r[2], r[3], (SEG7[d] >> i) & 1 ? on : off));
}
/** Plan de salle en éventail ; `fn` choisit la couleur de chaque siège. */
export function seats(c: Ctx, cx: number, cy: number, C: Palette, fn: (r: number, i: number, a: number) => string | null) {
  fr(c, cx - 34, cy - 4, 68, 3, C['--ink3']);
  for (let r = 0; r < 5; r++) {
    const R = 14 + r * 9, n = 9 + r * 3;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (.12 + .76 * i / (n - 1));
      fr(c, cx + Math.cos(a) * R * 1.7 - 1.5, cy + Math.sin(a) * R - 1.5, 3, 3, fn(r, i, a) || C['--panel3']);
    }
  }
}
/** Mini-téléphone ; `inner` dessine l'écran (coupé à ses bords). */
export function phone(c: Ctx, x: number, y: number, w: number, h: number, C: Palette, inner?: (x: number, y: number, w: number, h: number) => void) {
  fr(c, x, y, w, h, C['--salle-noir']); sr(c, x, y, w, h, C['--line']);
  c.save(); c.beginPath(); c.rect(x + 2, y + 2, w - 4, h - 4); c.clip();
  if (inner) inner(x + 2, y + 2, w - 4, h - 4);
  c.restore(); fr(c, x + w * .38, y + 3, w * .24, 1.5, C['--ink3']);
}
/** Forme d'onde en spectre ; `ph` = tête de lecture 0 → 1. */
export function wave(c: Ctx, x: number, y: number, w: number, h: number, C: Palette, ph: number | null) {
  const n = Math.floor(w / 1.5);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const a = (Math.abs(Math.sin(u * 31 + 1.3)) * .5 + Math.abs(Math.sin(u * 7.3)) * .5) * Math.exp(-Math.pow((u - .25) * 3, 2) * .6) * (.55 + .45 * Math.sin(u * 90));
    const v = Math.min(1, Math.abs(a));
    const col = v > .8 ? C['--spec-4'] : v > .6 ? C['--spec-3'] : v > .3 ? C['--spec-2'] : C['--spec-1'];
    fr(c, x + i * 1.5, y + h / 2 - v * h / 2, 1.5, Math.max(1, v * h), col);
  }
  if (ph != null) fr(c, x + ph * w - 1, y - 2, 2, h + 4, C['--or']);
}
/** Feu tricolore d'un point d'arrêt. */
export function feu(c: Ctx, x: number, y: number, st: string, C: Palette, t: number, s = 1) {
  fr(c, x, y, 22 * s, 62 * s, C['--panel2']);
  const pulse = (Math.sin(t * 4.5) + 1) / 2;
  const L: [string, number][] = [
    [st === 'RETENU' ? C['--rouge'] : C['--panel3'], 1],
    [st === 'ARMÉ' || st === 'AVERTISSEMENT' ? C['--amb'] : C['--panel3'], st === 'AVERTISSEMENT' ? .35 + .65 * pulse : 1],
    [st === 'PASSAGE' ? C['--grn2'] : C['--panel3'], 1],
  ];
  L.forEach((l, i) => { c.globalAlpha = l[1]; dot(c, x + 11 * s, y + (12 + i * 19) * s, 6.5 * s, l[0]); c.globalAlpha = 1; });
}
/** Temps en MM:SS entiers (jamais de décimale). */
export const fm = (s: number): string => {
  const n = Math.max(0, Math.floor((+s || 0) + 1e-6));
  return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
};
