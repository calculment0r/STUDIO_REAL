// theme.js : lit les jetons du thème STUDIO REAL (packages/theme/) À L'EXÉCUTION (getComputedStyle)
// et les convertit en entiers 0xRRGGBB pour Pixi. Aucune couleur écrite ici : si le thème n'a pas pu
// être chargé (page ouverte hors du dépôt), tout tombe sur un gris neutre et la page le dit.

/** valeur calculée d'un jeton (hexadécimal court ou long, ou fonction rgb / rgba) -> {r,g,b,a} (0..255, a 0..1) */
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

/** La teinte NEUTRE de Pixi (multiplier par 1 : la texture garde sa couleur). Pas une couleur d'interface. */
export const SANS_TEINTE = 0xffffff;

export const toHex = (c) => (Math.round(c.r) << 16) | (Math.round(c.g) << 8) | Math.round(c.b);
const deux = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
/** entier 0xRRGGBB -> chaîne CSS « #rrggbb » ; avec a (0..1) -> « #rrggbbaa » (pour le canvas 2D) */
export const hexToCss = (n, a = 1) => '#' + (n & 0xffffff).toString(16).padStart(6, '0') + (a >= 1 ? '' : deux(a * 255));

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
    if (v) fromTokens++;
    return v;
  };
  const GRIS = { r: 128, g: 128, b: 128, a: 1 };
  const col = (name) => toHex(parseCss(raw(name)) || GRIS);

  // Le thème STUDIO REAL : fond, tuiles, encres, l'accent orange, l'encre tech, les verts profonds, la rampe corail.
  const t = {
    bg: col('--bg'), panel: col('--tile'), panel2: col('--tile2'), panel3: col('--well2'),
    ink: col('--ink'), ink2: col('--ink2'),
    cy: col('--cy'), or: col('--ort'), grn: col('--gdeep'), grn2: col('--gt'),
    amb: col('--rampe-1'),                     // le chaud qui attire l'œil (vedette, vote) : le corail le plus clair
    coral3: col('--rampe-1'), coral2: col('--rampe-2'), coral1: col('--rampe-4'),
    warn: col('--rec'),
    // le blanc neutre des textures que Pixi teinte ensuite (pas une couleur d'interface)
    masque: col('--masque'),
    fontUi: raw('--f-ui') || 'sans-serif', fontMono: raw('--f-mono') || 'monospace',
  };

  // Couleurs de pseudos : des teintes distinctes prises au thème, éclaircies pour la lisibilité à 15 m
  const names = ['--cy', '--ort', '--rampe-1', '--gt', '--rampe-2', '--vert-pale', '--rampe-3', '--fam-scene', '--nd-ryt', '--nd-har', '--nd-tim', '--nd-nrj'];
  t.palette = names.map((n) => mix(col(n), t.masque, 0.22));

  // Rampe de la jauge : calme -> chaud (vert, acier, corail, orange)
  t.ramp = [t.grn2, t.cy, t.amb, t.or];
  // Fond d'une bulle : le fond du thème légèrement relevé
  t.bubbleFill = mix(t.bg, t.panel2, 0.7);
  // Contour des textes et ombre des textures : le fond, assombri vers le puits
  t.outline = mix(t.bg, t.panel3, 0.6);
  t.fromTokens = fromTokens > 10;
  return t;
}
