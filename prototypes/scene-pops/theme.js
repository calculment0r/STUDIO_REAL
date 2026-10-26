// theme.js : lit les jetons de ../../design/tokens.css À L'EXÉCUTION (getComputedStyle)
// et les convertit en entiers 0xRRGGBB pour Pixi. Les valeurs de repli ne servent que si
// tokens.css n'a pas pu être chargé (page ouverte hors du dépôt).

const FALLBACK = {
  '--bg': '#0a0d0b', '--panel': '#101413', '--panel2': '#151a18', '--panel3': '#1b211e',
  '--ink': '#e6eae7', '--ink2': '#9ca8a2', '--cy': '#b9cfd8', '--or': '#e0674a',
  '--grn': '#2f6b4a', '--grn2': '#3d8a60', '--amb': '#d6a24a',
  '--coral-3': '#f2cdb8', '--coral-2': '#e79b7c', '--coral-1': '#a8603c',
  '--nd-ryt': '#4b8fb6', '--nd-har': '#8b82bb', '--nd-tim': '#bd7294', '--nd-nrj': '#45967c', '--nd-ten': '#a0836d',
  '--spec-3': '#d6a24a', '--spec-4': '#f7ead8', '--rouge': '#b3392b',
  '--f-ui': "'Chakra Petch', 'Saira Semi Condensed', sans-serif",
  '--f-mono': "'Azeret Mono', ui-monospace, monospace",
};

/** "#rrggbb" | "#rgb" | "rgb(a)(...)" -> {r,g,b,a} (0..255, a 0..1) */
export function parseCss(str) {
  str = (str || '').trim();
  let m;
  if ((m = /^#([0-9a-f]{3})$/i.exec(str))) {
    const h = m[1];
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16), a: 1 };
  }
  if ((m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(str))) {
    const n = parseInt(m[1], 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  }
  if ((m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\s*\)$/i.exec(str))) {
    let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  return null;
}

export const toHex = (c) => (Math.round(c.r) << 16) | (Math.round(c.g) << 8) | Math.round(c.b);
export const hexToCss = (n) => '#' + (n & 0xffffff).toString(16).padStart(6, '0');

/** mélange deux entiers 0xRRGGBB (t = 0 -> a, 1 -> b) */
export function mix(a, b, t) {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  const br = b >> 16, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

export function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  let fromTokens = 0;
  const raw = (name) => {
    const v = cs.getPropertyValue(name).trim();
    if (v) { fromTokens++; return v; }
    return FALLBACK[name];
  };
  const col = (name) => {
    const p = parseCss(raw(name)) || parseCss(FALLBACK[name]) || { r: 128, g: 128, b: 128, a: 1 };
    return toHex(p);
  };

  const t = {
    bg: col('--bg'), panel: col('--panel'), panel2: col('--panel2'), panel3: col('--panel3'),
    ink: col('--ink'), ink2: col('--ink2'),
    cy: col('--cy'), or: col('--or'), grn: col('--grn'), grn2: col('--grn2'), amb: col('--amb'),
    coral3: col('--coral-3'), coral2: col('--coral-2'), coral1: col('--coral-1'),
    warn: col('--rouge'),
    fontUi: raw('--f-ui'), fontMono: raw('--f-mono'),
  };

  // Couleurs de pseudos : une palette de teintes distinctes, éclaircies vers le blanc pour la lisibilité à 15 m
  const names = ['--cy', '--or', '--amb', '--grn2', '--coral-2', '--coral-3', '--nd-ryt', '--nd-har', '--nd-tim', '--nd-nrj', '--nd-ten', '--spec-3'];
  t.palette = names.map((n) => mix(col(n), 0xffffff, 0.22));

  // Rampe de la jauge : calme -> chaud
  t.ramp = [t.grn2, t.cy, t.amb, t.or];
  // Fond d'une bulle : le fond du thème légèrement relevé
  t.bubbleFill = mix(t.bg, t.panel3, 0.7);
  t.outline = mix(t.bg, 0x000000, 0.6);
  t.fromTokens = fromTokens > 10;
  return t;
}
