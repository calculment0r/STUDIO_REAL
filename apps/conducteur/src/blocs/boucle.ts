// Boucle d'animation commune à tous les aperçus : UNE seule requestAnimationFrame pour tout l'écran,
// la salle simulée avancée une fois par image, les aperçus redessinés une image sur deux (≈ 30 i/s),
// et seulement ceux qui sont visibles (un IntersectionObserver partagé).
import { avancerSimulation, nouvelleSimulation, type Simulation } from './simulation';

export interface Abonne {
  /** Dessine l'aperçu ; `now` = horloge des aperçus en secondes (performance.now). */
  dessiner: (now: number) => void;
  /** Élément observé pour la visibilité (facultatif : sans lui, toujours dessiné). */
  element?: Element | null;
}

/** La salle simulée partagée (lue par les aperçus). */
export const simulation: Simulation = nouvelleSimulation();

const abonnes = new Set<Abonne>();
const visibles = new WeakMap<Element, boolean>();
let observateur: IntersectionObserver | null = null;
let raf = 0;
let dernier = 0;
let image = 0;

function observer(): IntersectionObserver | null {
  if (observateur || typeof IntersectionObserver === 'undefined') return observateur;
  observateur = new IntersectionObserver((entrees) => {
    for (const e of entrees) visibles.set(e.target, e.isIntersecting);
  }, { rootMargin: '64px' });
  return observateur;
}

function tic(ts: number) {
  raf = requestAnimationFrame(tic);
  const dt = Math.min(.1, Math.max(0, (ts - (dernier || ts)) / 1000));
  dernier = ts;
  const now = ts / 1000;
  avancerSimulation(simulation, dt, now);
  image++;
  if (image % 2) return;
  for (const a of abonnes) {
    if (a.element && visibles.get(a.element) === false) continue;
    a.dessiner(now);
  }
}

/** Inscrit un aperçu dans la boucle commune ; renvoie la fonction de désinscription. */
export function abonner(a: Abonne): () => void {
  abonnes.add(a);
  const obs = a.element ? observer() : null;
  if (obs && a.element) obs.observe(a.element);
  if (!raf && typeof requestAnimationFrame !== 'undefined') { dernier = 0; raf = requestAnimationFrame(tic); }
  return () => {
    abonnes.delete(a);
    if (obs && a.element) { obs.unobserve(a.element); visibles.delete(a.element); }
    if (!abonnes.size && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
}

/** Nombre d'aperçus inscrits (diagnostic, galerie). */
export const nombreAbonnes = (): number => abonnes.size;
