// Couleurs du calque Pixi : lues À L'EXÉCUTION dans les jetons de l'interface (src/theme/jetons.css, thème sombre)
// et converties en entiers 0xRRGGBB. Aucune couleur en dur : un jeton absent retombe sur --ink.
// (Porté de prototypes/scene-pops/theme.js.)

export interface ThemeCalque {
  bg: number; tile: number; tile2: number; well: number;
  ink: number; ink2: number; cy: number; ort: number; gt: number; vertPale: number; rec: number;
  rampe: [number, number, number, number, number];
  /** contour sombre des textes et des cœurs */
  outline: number; outlineCss: string;
  /** fond d'une bulle */
  bubbleFill: number;
  /** couleurs stables des pseudos */
  palette: number[];
  /** rampe de la jauge de salle : calme → chaud */
  ramp: number[];
  fontUi: string; fontDisp: string; fontMono: string;
}

/** "#rrggbb" | "#rgb" | "rgb(a)(…)" → {r, g, b} (0..255) */
export function parseCss(str: string): { r: number; g: number; b: number } | null {
  const s = (str || '').trim();
  let m: RegExpExecArray | null;
  if ((m = /^#([0-9a-f]{3})$/i.exec(s))) {
    const h = m[1];
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
  }
  if ((m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s))) {
    const n = parseInt(m[1], 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 };
  }
  if ((m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(s))) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
}

export const versHex = (c: { r: number; g: number; b: number }): number => (Math.round(c.r) << 16) | (Math.round(c.g) << 8) | Math.round(c.b);
export const hexVersCss = (n: number): string => '#' + (n & 0xffffff).toString(16).padStart(6, '0');

/** Mélange de deux 0xRRGGBB (t = 0 → a, 1 → b). */
export function melange(a: number, b: number, t: number): number {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  const br = b >> 16, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

/** Lecture des jetons (élément racine, thème sombre). */
export function lireTheme(el: Element = document.documentElement): ThemeCalque {
  const cs = getComputedStyle(el);
  const brut = (nom: string) => cs.getPropertyValue(nom).trim();
  const encre = parseCss(brut('--ink'));
  const col = (nom: string): number => {
    const p = parseCss(brut(nom)) ?? encre;
    return p ? versHex(p) : 0;
  };
  const t = {
    bg: col('--bg'), tile: col('--tile'), tile2: col('--tile2'), well: col('--well2'),
    ink: col('--ink'), ink2: col('--ink2'), cy: col('--cy'), ort: col('--ort'), gt: col('--gt'), vertPale: col('--vert-pale'), rec: col('--rec'),
    rampe: [col('--rampe-1'), col('--rampe-2'), col('--rampe-3'), col('--rampe-4'), col('--rampe-5')] as ThemeCalque['rampe'],
    fontUi: brut('--f-ui') || 'sans-serif', fontDisp: brut('--f-disp') || brut('--f-ui') || 'sans-serif', fontMono: brut('--f-mono') || 'monospace',
  };
  // pseudos : teintes distinctes des jetons, relevées vers l'encre pour la lisibilité à 15 m
  const sources = ['--cy', '--ort', '--rampe-1', '--vert-pale', '--rampe-2', '--fam-cible', '--fam-scene', '--rampe-3', '--gt', '--fam-trig', '--gink', '--fam-data'];
  const palette = sources.map((n) => melange(col(n), t.ink, 0.22));
  const outline = t.well;
  return {
    ...t,
    outline, outlineCss: hexVersCss(outline),
    bubbleFill: melange(t.bg, t.tile2, 0.7),
    palette,
    ramp: [t.gt, t.cy, t.rampe[0], t.ort],
  };
}

/** Couleur stable d'un pseudo (hachage FNV). */
export function hachage(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
