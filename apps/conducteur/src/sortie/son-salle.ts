// Audio de salle du mur (discours de Junon, du président) : un asset LOCAL, préchargé par la réserve (videos.ts), lancé
// quand la vue du mur le demande et REPRIS à sa place après un rechargement ou une reconnexion :
// position = heure serveur − `depuis` (heure serveur de sa position 0, AudioMur). Le même asset d'une vue à la suivante
// (vote révélé pendant le discours) continue sans à-coup ; une vue sans audio l'arrête.
// Un son refusé par le navigateur (pas de geste) est signalé (bouton « Activer le son » de la page) : un clic le relance
// à la bonne position.
import type { AudioMur } from './protocole';
import type { PoolVideos } from './videos';

export type LectureSon = 'attente' | 'lit' | 'fin' | 'bloque' | 'absent';

/** Position de départ (s) d'un audio qui a commencé à `depuis` (heure serveur), PURE. Boucle : modulo la durée. */
export function positionAudio(a: Pick<AudioMur, 'depuis' | 'boucle'>, heureServeur: number, duree?: number): number {
  if (a.depuis === undefined) return 0;
  const p = Math.max(0, (heureServeur - a.depuis) / 1000);
  if (a.boucle && duree && Number.isFinite(duree) && duree > 0) return p % duree;
  return p;
}

export interface RappelsSon {
  sonBloque: (v: boolean) => void;
  absent?: (asset: string, oui: boolean) => void;
}

export class SonDeSalle {
  private courant: { a: AudioMur; el: HTMLVideoElement; lecture: LectureSon } | null = null;
  private readonly pool: PoolVideos;
  private readonly heureServeur: () => number;
  private readonly rappels: RappelsSon;

  constructor(pool: PoolVideos, heureServeur: () => number, rappels: RappelsSon) {
    this.pool = pool;
    this.heureServeur = heureServeur;
    this.rappels = rappels;
  }

  /** Ce que joue le mur (null : rien), pour le battement. */
  get etat(): { asset: string; lecture: LectureSon } | null {
    const c = this.courant;
    if (!c) return null;
    const lecture = c.lecture === 'lit' && c.el.ended ? 'fin' : c.lecture;
    return { asset: c.a.asset, lecture };
  }

  /** L'audio demandé par la scène courante (null : aucun). */
  jouer(a: AudioMur | null | undefined): void {
    if (!a) { this.arreter(); return; }
    const c = this.courant;
    if (c && c.a.asset === a.asset) { c.el.loop = !!a.boucle; c.a = a; return; }
    this.arreter();
    const { el, pret } = this.pool.prendre(a.asset);
    el.loop = !!a.boucle;
    el.muted = false;
    const n = { a, el, lecture: 'attente' as LectureSon };
    this.courant = n;
    void pret.then((ok) => {
      if (this.courant !== n) return;
      if (!ok) { n.lecture = 'absent'; this.rappels.absent?.(a.asset, true); return; }
      this.demarrer(n);
    });
  }

  private demarrer(n: { a: AudioMur; el: HTMLVideoElement; lecture: LectureSon }) {
    const el = n.el;
    const partir = () => {
      if (this.courant !== n) return;
      const d = el.duration;
      const pos = positionAudio(n.a, this.heureServeur(), d);
      if (!n.a.boucle && Number.isFinite(d) && d > 0 && pos >= d) { n.lecture = 'fin'; return; }   // déjà fini
      try { el.currentTime = pos; } catch { /* pas encore positionnable */ }
      el.muted = false;
      el.play().then(() => { if (this.courant === n) { n.lecture = 'lit'; this.rappels.sonBloque(false); } }).catch(() => {
        if (this.courant !== n) return;
        n.lecture = 'bloque';
        this.rappels.sonBloque(true);
      });
    };
    if (el.readyState >= 1) partir();
    else el.addEventListener('loadedmetadata', partir, { once: true });
  }

  /** Après un geste (clic) : relance un son refusé, à sa place. */
  debloquer(): void {
    const c = this.courant;
    if (c && c.lecture === 'bloque') this.demarrer(c);
  }

  arreter(): void {
    const c = this.courant;
    if (!c) return;
    this.courant = null;
    if (c.lecture === 'absent') this.rappels.absent?.(c.a.asset, false);
    this.pool.rendre(c.el);
  }
}
