// Fonctions de statistiques pures du banc de mesure (aucune dépendance, aucun effet de bord).

/** Percentile p (0 à 100) par interpolation linéaire. Tableau vide : NaN. */
export function percentile(valeurs, p) {
  const v = [...valeurs].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return NaN;
  if (v.length === 1) return v[0];
  const pp = Math.min(100, Math.max(0, p));
  const rang = (pp / 100) * (v.length - 1);
  const bas = Math.floor(rang);
  const haut = Math.ceil(rang);
  return v[bas] + (v[haut] - v[bas]) * (rang - bas);
}

/** Agrégat {n, min, p50, p95, max, moyenne}. Tableau vide : n = 0 et le reste à null (JSON propre). */
export function resume(valeurs) {
  const v = valeurs.filter((x) => Number.isFinite(x));
  if (v.length === 0) return { n: 0, min: null, p50: null, p95: null, max: null, moyenne: null };
  let min = Infinity, max = -Infinity, somme = 0;
  for (const x of v) { if (x < min) min = x; if (x > max) max = x; somme += x; }
  return { n: v.length, min, p50: percentile(v, 50), p95: percentile(v, 95), max, moyenne: somme / v.length };
}

/** Débit en mégabits par seconde (1 Mb = 10^6 bits). Durée nulle ou négative : 0. */
export function debitMbps(octets, secondes) {
  if (!(secondes > 0) || !(octets > 0)) return 0;
  return (octets * 8) / secondes / 1e6;
}

/** Arrondi à n décimales pour des sorties lisibles (null et NaN passent en null). */
export function arrondi(x, n = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  const f = 10 ** n;
  return Math.round(x * f) / f;
}
