// kit.js : boîte à outils Pixi — polices bitmap (texte rapide à 60 i/s), textures générées par canvas
// (bulle 9-tranches, cœur, étincelle, emojis) et système de particules à sprites recyclés.
import * as PIXI from 'pixi.js';
import { EMOJIS } from './crowd.js';
import { hexToCss, SANS_TEINTE } from './theme.js';

const { Texture, Sprite, NineSliceSprite, BitmapText, BitmapFontManager } = PIXI;

// Caractères installés dans les polices bitmap : ASCII + Latin-1 (accents français) + ponctuation typographique.
const CHARS = [[' ', '~'], [' ', 'ÿ'], 'ŒœŸ’‘“”…–—€•★'];
const ALLOWED = new RegExp('[^ -~\\u00A0-\\u00FF\\u0152\\u0153\\u0178\\u2019\\u2018\\u201C\\u201D\\u2026\\u2013\\u2014\\u20AC\\u2022\\u2605]', 'g');
export const clean = (s) => String(s).replace(ALLOWED, '');

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export class Kit {
  constructor(theme) {
    this.theme = theme;
    this.tex = {};
    this.emojiTex = {};
  }

  async init() {
    const { theme } = this;
    // attendre les polices pour que les bitmaps soient dessinés avec les bonnes glyphes
    try {
      await Promise.all([
        document.fonts.load('700 44px "Chakra Petch"'),
        document.fonts.load('800 40px "Azeret Mono"'),
      ]);
      await document.fonts.ready;
    } catch (e) { /* on continue avec la police de repli */ }

    const stroke = (w) => ({ color: theme.outline, width: w, join: 'round' });
    BitmapFontManager.install({
      name: 'sr-ui',
      style: { fontFamily: theme.fontUi, fontSize: 44, fontWeight: '700', fill: theme.masque, stroke: stroke(10) },
      chars: CHARS, resolution: 2, padding: 6,
    });
    BitmapFontManager.install({
      name: 'sr-mono',
      style: { fontFamily: theme.fontMono, fontSize: 40, fontWeight: '800', fill: theme.masque, stroke: stroke(9) },
      chars: CHARS, resolution: 2, padding: 6,
    });

    this._makeTextures();
  }

  _makeTextures() {
    const T = this.tex;
    // textures BLANCHES (le masque du thème) que Pixi teinte ensuite ; ombres et contours : le contour du thème
    const blanc = (a = 1) => hexToCss(this.theme.masque, a), sombre = (a) => hexToCss(this.theme.outline, a);
    const mk = (w, h, draw) => { const [c, g] = canvas(w, h); draw(g, w, h); return Texture.from(c); };

    T.white = Texture.WHITE;
    T.dot = mk(48, 48, (g) => { g.fillStyle = blanc(); g.beginPath(); g.arc(24, 24, 22, 0, 7); g.fill(); });
    T.glow = mk(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, blanc()); r.addColorStop(0.35, blanc(.45)); r.addColorStop(1, blanc(0));
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    });
    T.star = mk(64, 64, (g) => {
      g.fillStyle = blanc(); g.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 7 : 30; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
      g.closePath(); g.fill();
    });
    // cœur : contour sombre cuit dans la texture (la teinte colore le remplissage, le contour reste sombre)
    T.heart = mk(128, 128, (g) => {
      const path = () => {
        g.beginPath(); g.moveTo(64, 112);
        g.bezierCurveTo(8, 72, 10, 20, 44, 18); g.bezierCurveTo(56, 17, 62, 24, 64, 32);
        g.bezierCurveTo(66, 24, 72, 17, 84, 18); g.bezierCurveTo(118, 20, 120, 72, 64, 112); g.closePath();
      };
      path(); g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = sombre(.92); g.stroke();
      path(); g.fillStyle = blanc(); g.fill();
      g.globalCompositeOperation = 'source-atop';
      const hl = g.createLinearGradient(0, 18, 0, 112); hl.addColorStop(0, blanc(0)); hl.addColorStop(1, sombre(.28));
      g.fillStyle = hl; g.fillRect(0, 0, 128, 128);
    });
    // bulle : remplissage et anneau séparés, teintés indépendamment, étirés en 9 tranches
    const R = 30, N = 96;
    T.bubbleFill = mk(N, N, (g) => { g.fillStyle = blanc(); g.beginPath(); g.roundRect(2, 2, N - 4, N - 4, R); g.fill(); });
    T.bubbleRing = mk(N, N, (g) => { g.strokeStyle = blanc(); g.lineWidth = 6; g.beginPath(); g.roundRect(4, 4, N - 8, N - 8, R - 2); g.stroke(); });

    for (const e of EMOJIS) this.emoji(e);
  }

  emoji(ch) {
    let t = this.emojiTex[ch];
    if (t) return t;
    const [c, g] = canvas(128, 128);
    g.font = '96px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = hexToCss(this.theme.outline, .55); g.shadowBlur = 10;
    g.fillText(ch, 64, 70);
    t = this.emojiTex[ch] = Texture.from(c);
    return t;
  }

  /** texte bitmap : blanc cuit + contour sombre, couleur par teinte */
  text(str, { font = 'sr-ui', size = 36, tint = SANS_TEINTE, wrap = 0, align = 'left' } = {}) {
    const t = new BitmapText({
      text: clean(str),
      style: { fontFamily: font, fontSize: size, wordWrap: wrap > 0, wordWrapWidth: wrap, align },
    });
    t.tint = tint;
    return t;
  }

  nine(kind, w, h, tint, alpha = 1) {
    const tex = kind === 'ring' ? this.tex.bubbleRing : this.tex.bubbleFill;
    const s = new NineSliceSprite({ texture: tex, leftWidth: 32, topHeight: 32, rightWidth: 32, bottomHeight: 32 });
    s.width = w; s.height = h; s.tint = tint; s.alpha = alpha;
    return s;
  }

  sprite(tex, tint = SANS_TEINTE) {
    const s = new Sprite(tex);
    s.anchor.set(0.5); s.tint = tint;
    return s;
  }
}

/* ------------------------------------------------------------------ */
/* Particules : sprites recyclés, mouvement balistique + oscillation   */
/* ------------------------------------------------------------------ */
export class Particles {
  constructor(container, addContainer, max = 1500) {
    this.container = container;
    this.addContainer = addContainer;   // conteneur séparé pour le mode additif : ne casse pas les lots de dessin
    this.max = max;
    this.list = [];
    this.pool = [];
    this.zone = null;       // {x,y,w,h} en unités logiques : les particules s'y estompent
    this.zoneAlpha = 0.1;
  }
  get count() { return this.list.length; }
  get load() { return this.list.length / this.max; }

  spawn(tex, x, y, o = {}) {
    if (this.list.length >= this.max) return null;
    const s = this.pool.pop() || new Sprite();
    s.texture = tex; s.anchor.set(0.5);
    s.tint = o.tint ?? SANS_TEINTE;
    s.blendMode = o.add ? 'add' : 'normal';
    s.visible = true;
    (o.add ? this.addContainer : this.container).addChild(s);
    const p = {
      s, add: !!o.add, x, y, vx: o.vx ?? 0, vy: o.vy ?? 0, ax: o.ax ?? 0, ay: o.ay ?? 0, drag: o.drag ?? 0,
      t: 0, life: o.life ?? 1, s0: o.s0 ?? 1, s1: o.s1 ?? o.s0 ?? 1, a0: o.a0 ?? 1,
      fin: o.fin ?? 0.08, fout: o.fout ?? 0.4, rot: o.rot ?? 0, vr: o.vr ?? 0,
      wa: o.wa ?? 0, wf: o.wf ?? 0, ph: o.ph ?? 0, fade: o.fade !== false,
    };
    s.position.set(x, y); s.scale.set(p.s0); s.alpha = 0; s.rotation = p.rot;
    this.list.push(p);
    return p;
  }

  update(dt) {
    const L = this.list, z = this.zone, za = this.zoneAlpha;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.t += dt;
      if (p.t >= p.life) { this._free(i); continue; }
      p.vx += p.ax * dt; p.vy += p.ay * dt;
      if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const k = p.t / p.life;
      const s = p.s.scale;
      const sc = p.s0 + (p.s1 - p.s0) * k;
      s.x = s.y = sc;
      const wx = p.wa ? Math.sin(p.t * p.wf + p.ph) * p.wa : 0;
      const px = p.x + wx;
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

  _free(i) {
    const L = this.list, p = L[i];
    p.s.visible = false;
    (p.add ? this.addContainer : this.container).removeChild(p.s);
    this.pool.push(p.s);
    L[i] = L[L.length - 1]; L.pop();
  }

  clear() { for (let i = this.list.length - 1; i >= 0; i--) this._free(i); }
}

export { PIXI, hexToCss };
