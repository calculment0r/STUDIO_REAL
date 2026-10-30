// Hasard REJOUABLE de l'émulateur : tout tirage vient d'un générateur mulberry32 (le même que le faux public de la
// sortie, apps/conducteur/src/sortie/calque/public-factice.ts, et que le banc du noyau) issu de la graine de la salle.
// Chaque téléphone a son propre flux (sousGraine(graine, index)) : son comportement ne dépend pas de l'ordre dans
// lequel les autres téléphones agissent. Même graine = même salle = même bilan.

/** Générateur uniforme dans [0, 1) (mulberry32). */
export function mulberry32(graine: number): () => number {
  let s = graine | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Graine dérivée (FNV-1a sur la graine et les clés) : un flux indépendant par téléphone, par usage. */
export function sousGraine(graine: number, ...cles: readonly (number | string)[]): number {
  let h = (0x811c9dc5 ^ (graine | 0)) >>> 0;
  const texte = cles.join('|');
  for (let i = 0; i < texte.length; i++) h = Math.imul(h ^ texte.charCodeAt(i), 0x01000193) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/** Loi normale centrée réduite (Box-Muller). */
export function normale(rnd: () => number): number {
  const u = Math.max(1e-12, rnd());
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Loi log-normale de médiane `mediane` ; `dispersion` = écart type du logarithme (0 : toujours la médiane). */
export const logNormale = (rnd: () => number, mediane: number, dispersion: number): number =>
  mediane * Math.exp(dispersion * normale(rnd));

/** Loi exponentielle de moyenne `moyenne`. */
export const exponentielle = (rnd: () => number, moyenne: number): number => -moyenne * Math.log(1 - rnd());

/** Uniforme dans [a, b]. */
export const entre = (rnd: () => number, a: number, b: number): number => a + (b - a) * rnd();

/** Tirage pondéré d'une clé (poids ≥ 0 ; tous nuls : la première clé). */
export function tirerPondere<K extends string>(rnd: () => number, poids: Readonly<Record<K, number>>): K {
  const cles = Object.keys(poids) as K[];
  const total = cles.reduce((t, k) => t + Math.max(0, poids[k]), 0);
  if (!(total > 0)) return cles[0]!;
  let x = rnd() * total;
  for (const k of cles) {
    x -= Math.max(0, poids[k]);
    if (x < 0) return k;
  }
  return cles[cles.length - 1]!;
}

/** Mélange de Fisher-Yates (copie). */
export function melanger<T>(rnd: () => number, l: readonly T[]): T[] {
  const out = [...l];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Répartition entière de `n` selon des parts (plus forts restes) : la somme vaut exactement `n`. */
export function repartir<K extends string>(n: number, parts: Readonly<Record<K, number>>): Record<K, number> {
  const cles = Object.keys(parts) as K[];
  const total = cles.reduce((t, k) => t + Math.max(0, parts[k]), 0) || 1;
  const brut = cles.map(k => ({ k, x: (Math.max(0, parts[k]) / total) * n }));
  const out = Object.fromEntries(brut.map(b => [b.k, Math.floor(b.x)])) as Record<K, number>;
  let reste = n - brut.reduce((t, b) => t + Math.floor(b.x), 0);
  for (const b of [...brut].sort((p, q) => (q.x - Math.floor(q.x)) - (p.x - Math.floor(p.x)) || cles.indexOf(p.k) - cles.indexOf(q.k))) {
    if (reste <= 0) break;
    out[b.k] += 1;
    reste--;
  }
  return out;
}
