// Petits outils partagés (hasard, statistiques, temps).

export const maintenant = () => Date.now();

export function hasard(min, max) { return min + Math.random() * (max - min); }
export function entier(min, max) { return Math.floor(hasard(min, max + 1)); }
export function choisir(liste) { return liste.length ? liste[Math.floor(Math.random() * liste.length)] : undefined; }
export function proba(p) { return Math.random() < p; }

/** Tirage pondéré : liste d'objets, fonction de poids. */
export function choisirPondere(liste, poids) {
  let total = 0;
  const w = liste.map((x) => { const v = Math.max(0, poids(x)); total += v; return v; });
  if (total <= 0) return undefined;
  let r = Math.random() * total;
  for (let i = 0; i < liste.length; i++) { r -= w[i]; if (r <= 0) return liste[i]; }
  return liste[liste.length - 1];
}

/** Loi log-normale de médiane donnée (σ en log). */
export function logNormale(mediane, sigma = 0.4) {
  const u1 = Math.random() || 1e-9, u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mediane * Math.exp(sigma * z);
}

export function melanger(liste) {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Percentile (méthode du rang le plus proche) sur une liste de nombres. */
export function percentile(valeurs, p) {
  const v = valeurs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const i = Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1));
  return v[i];
}

/** Fenêtre glissante des N dernières valeurs. */
export class Fenetre {
  constructor(taille = 100) { this.taille = taille; this.v = []; }
  ajouter(x) { if (!Number.isFinite(x)) return; this.v.push(x); if (this.v.length > this.taille) this.v.shift(); }
  resume() { return { p50: percentile(this.v, 50), p95: percentile(this.v, 95), n: this.v.length }; }
}

export function dateLocale(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function borne(x, a, b) { return Math.min(b, Math.max(a, x)); }
