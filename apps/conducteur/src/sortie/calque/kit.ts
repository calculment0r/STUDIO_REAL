// Boîte à outils Pixi du calque de réactions : polices bitmap (texte rapide à 60 i/s), textures générées par canvas
// (bulle 9 tranches, cœur, étincelle, halo, emojis) et particules à sprites recyclés. Porté de
// prototypes/scene-pops/kit.js. Les textures sont des MASQUES blancs teintés par Pixi (tint) : le blanc n'est pas une
// couleur du design mais la valeur neutre du masque.
import { BitmapFontManager, BitmapText, Container, NineSliceSprite, Sprite, Texture } from 'pixi.js';
import type { ThemeCalque } from './theme';

/** Valeur neutre d'un masque teinté (aucune teinte). */
export const NEUTRE = 0xffffff;
const MASQUE = '#fff';

// Caractères installés dans les polices bitmap : ASCII + Latin-1 (accents français) + ponctuation typographique.
const CARACTERES: (string | string[])[] = [[' ', '~'], [' ', 'ÿ'], 'ŒœŸ’‘“”…–—€•★'];
const HORS_POLICE = /[^ -~ -ÿŒœŸ’‘“”…–—€•★]/g;
export const nettoyer = (s: string): string => String(s).replace(HORS_POLICE, '');

export const EMOJIS = ['😂', '🔥', '👏', '😮', '🎉', '💀', '😍', '🥹', '✨', '💜', '🫶', '🤯'];

function toile(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

export interface Textures { blanc: Texture; point: Texture; halo: Texture; etoile: Texture; coeur: Texture; bulle: Texture; anneau: Texture }

export class Kit {
  readonly theme: ThemeCalque;
  tex!: Textures;
  private emojis = new Map<string, Texture>();
  constructor(theme: ThemeCalque) { this.theme = theme; }

  async init(): Promise<void> {
    const { theme } = this;
    try {
      await Promise.all([document.fonts.load(`700 44px ${theme.fontUi}`), document.fonts.load(`800 40px ${theme.fontMono}`)]);
      await document.fonts.ready;
    } catch { /* police de repli */ }
    const contour = (w: number) => ({ color: theme.outline, width: w, join: 'round' as const });
    BitmapFontManager.install({
      name: 'sr-ui', chars: CARACTERES, resolution: 2, padding: 6,
      style: { fontFamily: theme.fontUi, fontSize: 44, fontWeight: '700', fill: NEUTRE, stroke: contour(10) },
    });
    BitmapFontManager.install({
      name: 'sr-mono', chars: CARACTERES, resolution: 2, padding: 6,
      style: { fontFamily: theme.fontMono, fontSize: 40, fontWeight: '800', fill: NEUTRE, stroke: contour(9) },
    });
    this.fabriquer();
  }

  private fabriquer(): void {
    const mk = (w: number, h: number, dessin: (g: CanvasRenderingContext2D) => void) => { const [c, g] = toile(w, h); dessin(g); return Texture.from(c); };
    const contour = this.theme.outlineCss;
    const R = 30, N = 96;
    this.tex = {
      blanc: Texture.WHITE,
      point: mk(48, 48, (g) => { g.fillStyle = MASQUE; g.beginPath(); g.arc(24, 24, 22, 0, 7); g.fill(); }),
      halo: mk(128, 128, (g) => {
        const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r; g.fillRect(0, 0, 128, 128);
      }),
      etoile: mk(64, 64, (g) => {
        g.fillStyle = MASQUE; g.beginPath();
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 7 : 30; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
        g.closePath(); g.fill();
      }),
      // cœur : contour sombre (jeton) cuit dans la texture, la teinte colore le remplissage
      coeur: mk(128, 128, (g) => {
        const trace = () => {
          g.beginPath(); g.moveTo(64, 112);
          g.bezierCurveTo(8, 72, 10, 20, 44, 18); g.bezierCurveTo(56, 17, 62, 24, 64, 32);
          g.bezierCurveTo(66, 24, 72, 17, 84, 18); g.bezierCurveTo(118, 20, 120, 72, 64, 112); g.closePath();
        };
        trace(); g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = contour; g.stroke();
        trace(); g.fillStyle = MASQUE; g.fill();
      }),
      bulle: mk(N, N, (g) => { g.fillStyle = MASQUE; g.beginPath(); g.roundRect(2, 2, N - 4, N - 4, R); g.fill(); }),
      anneau: mk(N, N, (g) => { g.strokeStyle = MASQUE; g.lineWidth = 6; g.beginPath(); g.roundRect(4, 4, N - 8, N - 8, R - 2); g.stroke(); }),
    };
    for (const e of EMOJIS) this.emoji(e);
  }

  /** Texture d'un emoji (police couleur du système), mise en cache. */
  emoji(ch: string): Texture {
    let t = this.emojis.get(ch);
    if (t) return t;
    const [c, g] = toile(128, 128);
    g.font = '96px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = this.theme.outlineCss; g.shadowBlur = 10;
    g.fillText(ch, 64, 70);
    t = Texture.from(c);
    this.emojis.set(ch, t);
    return t;
  }

  /** Texte bitmap : blanc cuit + contour sombre, couleur par teinte. */
  texte(s: string, o: { police?: 'sr-ui' | 'sr-mono'; taille?: number; teinte?: number; largeur?: number; align?: 'left' | 'center' | 'right' } = {}): BitmapText {
    const t = new BitmapText({
      text: nettoyer(s),
      style: { fontFamily: o.police ?? 'sr-ui', fontSize: o.taille ?? 36, wordWrap: (o.largeur ?? 0) > 0, wordWrapWidth: o.largeur ?? 0, align: o.align ?? 'left' },
    });
    t.tint = o.teinte ?? NEUTRE;
    return t;
  }

  neuf(genre: 'fond' | 'anneau', w: number, h: number, teinte: number, alpha = 1): NineSliceSprite {
    const s = new NineSliceSprite({ texture: genre === 'anneau' ? this.tex.anneau : this.tex.bulle, leftWidth: 32, topHeight: 32, rightWidth: 32, bottomHeight: 32 });
    s.width = w; s.height = h; s.tint = teinte; s.alpha = alpha;
    return s;
  }

  sprite(tex: Texture, teinte = NEUTRE): Sprite {
    const s = new Sprite(tex);
    s.anchor.set(0.5); s.tint = teinte;
    return s;
  }
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface OptionsParticule {
  vx?: number; vy?: number; ax?: number; ay?: number; drag?: number; life?: number; s0?: number; s1?: number; a0?: number;
  fin?: number; fout?: number; rot?: number; vr?: number; wa?: number; wf?: number; ph?: number; fade?: boolean; tint?: number; add?: boolean;
}
interface Particule extends Required<Omit<OptionsParticule, 'tint'>> { s: Sprite; x: number; y: number; t: number }

/** Particules : sprites recyclés, mouvement balistique + oscillation, estompées dans la zone protégée. */
export class Particules {
  private liste: Particule[] = [];
  private reserve: Sprite[] = [];
  zone: Rect | null = null;
  zoneAlpha = 0.1;
  private readonly c: Container;
  private readonly cAdd: Container;
  readonly max: number;
  constructor(c: Container, cAdd: Container, max = 1500) { this.c = c; this.cAdd = cAdd; this.max = max; }
  get nombre(): number { return this.liste.length; }
  get charge(): number { return this.liste.length / this.max; }

  lancer(tex: Texture, x: number, y: number, o: OptionsParticule = {}): void {
    if (this.liste.length >= this.max) return;
    const s = this.reserve.pop() ?? new Sprite();
    s.texture = tex; s.anchor.set(0.5);
    s.tint = o.tint ?? NEUTRE;
    s.blendMode = o.add ? 'add' : 'normal';
    s.visible = true;
    (o.add ? this.cAdd : this.c).addChild(s);
    const p: Particule = {
      s, x, y, t: 0, vx: o.vx ?? 0, vy: o.vy ?? 0, ax: o.ax ?? 0, ay: o.ay ?? 0, drag: o.drag ?? 0,
      life: o.life ?? 1, s0: o.s0 ?? 1, s1: o.s1 ?? o.s0 ?? 1, a0: o.a0 ?? 1, fin: o.fin ?? 0.08, fout: o.fout ?? 0.4,
      rot: o.rot ?? 0, vr: o.vr ?? 0, wa: o.wa ?? 0, wf: o.wf ?? 0, ph: o.ph ?? 0, fade: o.fade !== false, add: !!o.add,
    };
    s.position.set(x, y); s.scale.set(p.s0); s.alpha = 0; s.rotation = p.rot;
    this.liste.push(p);
  }

  avancer(dt: number): void {
    const L = this.liste, z = this.zone, za = this.zoneAlpha;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.t += dt;
      if (p.t >= p.life) { this.liberer(i); continue; }
      p.vx += p.ax * dt; p.vy += p.ay * dt;
      if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const k = p.t / p.life;
      p.s.scale.set(p.s0 + (p.s1 - p.s0) * k);
      const px = p.x + (p.wa ? Math.sin(p.t * p.wf + p.ph) * p.wa : 0);
      p.s.position.set(px, p.y);
      p.s.rotation = p.rot;
      let a = p.a0;
      if (p.fade) {
        const fi = p.fin > 0 ? Math.min(1, p.t / (p.fin * p.life)) : 1;
        const fo = p.fout > 0 ? Math.min(1, (1 - k) / p.fout) : 1;
        a *= fi * fo;
      }
      if (z && px > z.x && px < z.x + z.w && p.y > z.y && p.y < z.y + z.h) a *= za;
      p.s.alpha = a;
    }
  }

  private liberer(i: number): void {
    const L = this.liste, p = L[i];
    p.s.visible = false;
    (p.add ? this.cAdd : this.c).removeChild(p.s);
    this.reserve.push(p.s);
    L[i] = L[L.length - 1]; L.pop();
  }

  vider(): void { for (let i = this.liste.length - 1; i >= 0; i--) this.liberer(i); }
}
