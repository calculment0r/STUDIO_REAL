// Petits outils partagés des figurants (port de prototypes/figurants/serveur/util.mjs) : hasard, statistiques.
// Tout le hasard passe par `source` : un test la remplace (fixerAleatoire) pour des tirages reproductibles.

let source: () => number = Math.random;

/** Remplace la source de hasard (tests). Sans argument : retour à Math.random. */
export function fixerAleatoire(f?: () => number): void { source = f ?? Math.random; }

/** Petit générateur déterministe (mulberry32) pour les tests. */
export function graine(g: number): () => number {
  let a = g >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hasard = (min: number, max: number): number => min + source() * (max - min);
export const entier = (min: number, max: number): number => Math.floor(hasard(min, max + 1));
export const choisir = <T>(liste: readonly T[]): T | undefined => (liste.length ? liste[Math.floor(source() * liste.length)] : undefined);
export const proba = (p: number): boolean => source() < p;
export const borne = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

/** Tirage pondéré : liste d'objets, fonction de poids. */
export function choisirPondere<T>(liste: readonly T[], poids: (x: T) => number): T | undefined {
  let total = 0;
  const w = liste.map(x => { const v = Math.max(0, poids(x)); total += v; return v; });
  if (total <= 0) return undefined;
  let r = source() * total;
  for (let i = 0; i < liste.length; i++) { r -= w[i]!; if (r <= 0) return liste[i]; }
  return liste[liste.length - 1];
}

/** Loi log-normale de médiane donnée (σ en log). */
export function logNormale(mediane: number, sigma = 0.4): number {
  const u1 = source() || 1e-9;
  const u2 = source();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mediane * Math.exp(sigma * z);
}

export function melanger<T>(liste: readonly T[]): T[] {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(source() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

/** Percentile (méthode du rang le plus proche) sur une liste de nombres. */
export function percentile(valeurs: readonly number[], p: number): number | null {
  const v = valeurs.filter(x => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const i = Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1));
  return v[i]!;
}

/** Fenêtre glissante des N dernières valeurs. */
export class Fenetre {
  private v: number[] = [];
  constructor(private taille = 100) {}
  ajouter(x: number): void { if (!Number.isFinite(x)) return; this.v.push(x); if (this.v.length > this.taille) this.v.shift(); }
  resume(): { p50: number | null; p95: number | null; n: number } {
    return { p50: percentile(this.v, 50), p95: percentile(this.v, 95), n: this.v.length };
  }
}
