// Réserve d'éléments <video> de la sortie (chantier SORTIE SCÈNE) : les vidéos annoncées par la régie sont chargées
// d'avance dans des éléments cachés ; à la bascule, la scène PREND l'élément déjà prêt (déplacé dans le DOM, son
// tampon est gardé) au lieu d'en créer un : pas d'image noire au début du fondu enchaîné.
import type { BibliothequeMedias } from './medias';

const MAX = 6;

/** Cadrage automatique : une vidéo dont le format s'écarte de plus de 20 % du 16:9 est montrée entière (contain). */
export function cadrageAuto(largeur: number, hauteur: number): 'contain' | 'cover' {
  if (!largeur || !hauteur) return 'cover';
  const r = largeur / hauteur, cible = 16 / 9;
  return Math.abs(r - cible) / cible > 0.2 ? 'contain' : 'cover';
}

interface Entree { el: HTMLVideoElement; pret: Promise<boolean>; utilise: number; enScene: boolean; trouve: boolean | null }

export class PoolVideos {
  private entrees = new Map<string, Entree>();
  private readonly cache: HTMLElement;
  private readonly medias: BibliothequeMedias;

  constructor(medias: BibliothequeMedias) {
    this.medias = medias;
    this.cache = document.createElement('div');
    this.cache.setAttribute('aria-hidden', 'true');
    Object.assign(this.cache.style, { position: 'fixed', left: '-10px', top: '-10px', width: '1px', height: '1px', overflow: 'hidden', opacity: '0', pointerEvents: 'none' });
    document.body.appendChild(this.cache);
  }

  private creer(asset: string, cle = asset): Entree {
    const el = document.createElement('video');
    el.preload = 'auto';
    el.muted = true;
    el.playsInline = true;
    el.dataset.asset = asset;
    this.cache.appendChild(el);
    const e: Entree = { el, pret: Promise.resolve(false), utilise: Date.now(), enScene: false, trouve: null };
    e.pret = this.medias.resoudre(asset).then((url) => {
      e.trouve = !!url;
      if (!url) return false;
      el.src = url;
      el.load();
      return true;
    });
    this.entrees.set(cle, e);
    this.elaguer();
    return e;
  }

  private elaguer(): void {
    if (this.entrees.size <= MAX) return;
    const libres = [...this.entrees.entries()].filter(([, e]) => !e.enScene).sort((a, b) => a[1].utilise - b[1].utilise);
    for (const [k, e] of libres.slice(0, this.entrees.size - MAX)) {
      e.el.removeAttribute('src'); e.el.load(); e.el.remove();
      this.entrees.delete(k);
    }
  }

  /** Charge d'avance (les vidéos déjà prêtes ne bougent pas). */
  precharger(assets: string[]): void {
    for (const a of assets) { const e = this.entrees.get(a) ?? this.creer(a); e.utilise = Date.now(); }
  }

  /** Prend l'élément d'un asset pour la scène ; `pret` dit si le média a été trouvé. */
  prendre(asset: string): { el: HTMLVideoElement; pret: Promise<boolean> } {
    let e = this.entrees.get(asset);
    // introuvable la dernière fois (dossier choisi depuis ?) : on cherche à nouveau
    if (e && e.trouve === false && !e.enScene) { e.el.remove(); this.entrees.delete(asset); e = undefined; }
    // déjà à l'écran (même vidéo dans deux couches pendant un fondu) : un second élément
    if (e?.enScene) {
      e = this.creer(asset, asset + '#' + Date.now());
    }
    e ??= this.creer(asset);
    e.enScene = true;
    e.utilise = Date.now();
    return { el: e.el, pret: e.pret };
  }

  /** Rend l'élément : arrêté, remis au début, retourné dans la réserve. */
  rendre(el: HTMLVideoElement): void {
    for (const [k, e] of this.entrees) {
      if (e.el !== el) continue;
      e.enScene = false;
      el.pause();
      el.muted = true;
      el.onended = null;
      try { el.currentTime = 0; } catch { /* pas encore chargé */ }
      this.cache.appendChild(el);
      if (k.includes('#')) { el.removeAttribute('src'); el.load(); el.remove(); this.entrees.delete(k); }
      break;
    }
    this.elaguer();
  }
}
