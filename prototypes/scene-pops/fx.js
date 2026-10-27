// fx.js : les effets de l'écran scène. Tout est en « unités logiques » : la scène fait toujours 1080 de haut,
// scene.js applique l'échelle de l'écran réel au conteneur racine.
import { PIXI } from './kit.js';
import { mix } from './theme.js';

const { Container, Sprite } = PIXI;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeIn = (t) => clamp(t, 0, 1) ** 2;
/** ressort sous-amorti : 0 -> dépasse ~1.17 -> se stabilise sur 1 */
const spring = (t) => (t <= 0 ? 0 : 1 - Math.exp(-8 * t) * Math.cos(14 * t));

const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const overlapArea = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};
function distToRect(px, py, r) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/** Cherche un emplacement libre (hors zone protégée et zones réservées, peu de recouvrement avec les autres). */
function place(ctx, w, h, others, tries = 18) {
  const m = 20;
  let best = null, bestScore = Infinity;
  const avoid = ctx.avoidRects();
  for (let i = 0; i < tries; i++) {
    const r = { x: m + Math.random() * Math.max(1, ctx.W - 2 * m - w), y: m + Math.random() * Math.max(1, ctx.H - 2 * m - h), w, h };
    const rr = { x: r.x - 30, y: r.y - 30, w: w + 60, h: h + 60 };   // marge : la bulle bouge (ressort, éclatement)
    if (avoid.some((a) => hit(rr, a))) continue;
    let ov = 0;
    for (const o of others) ov += overlapArea(r, o);
    ov /= w * h;
    if (ov < bestScore) { best = r; bestScore = ov; if (ov === 0) break; }
  }
  return bestScore < 0.3 ? best : null;
}

/* ================================================================== */
/* POP : bulle qui grossit avec ressort, reste 3 à 6 s, puis éclate     */
/* ================================================================== */
export class Pops {
  constructor(ctx) {
    this.ctx = ctx; this.items = []; this.cap = 44;
    this.layer = ctx.layers.bubbles;
  }
  get count() { return this.items.length; }

  add(msg) {
    const { kit, theme } = this.ctx;
    const color = this.ctx.userColor(msg.user);
    const nameT = kit.text(msg.user.name, { font: 'sr-mono', size: 24, tint: color });
    const body = kit.text(msg.text, { font: 'sr-ui', size: 40, tint: theme.ink, wrap: 560 });
    const padX = 26, padY = 16, gap = 4;
    let emo = null;
    if (msg.emoji) { emo = kit.sprite(kit.emoji(msg.emoji)); emo.scale.set(0.5); }
    const w = Math.max(nameT.width + (emo ? 52 : 0), body.width) + padX * 2;
    const h = nameT.height + gap + body.height + padY * 2;
    const r = place(this.ctx, w, h, this.items.map((i) => i.rect));
    if (!r) return false;

    const c = new Container();
    c.addChild(kit.nine('fill', w, h, theme.bubbleFill, 0.88));
    c.addChild(kit.nine('ring', w, h, color, 1));
    nameT.position.set(padX, padY - 2);
    body.position.set(padX, padY + nameT.height + gap);
    c.addChild(nameT, body);
    if (emo) { emo.position.set(w - padX - 14, padY + 10); c.addChild(emo); }
    c.pivot.set(w / 2, h / 2);
    c.position.set(r.x + w / 2, r.y + h / 2);
    c.scale.set(0);
    c.rotation = (Math.random() - 0.5) * 0.08;
    this.layer.addChild(c);
    if (this.items.length >= this.cap) this._forcePop();
    this.items.push({ c, rect: r, cy: r.y + h / 2, born: this.ctx.time, life: 3 + Math.random() * 3, color, rot0: c.rotation, ph: Math.random() * 6, out: -1 });
    return true;
  }

  _forcePop() {
    for (const it of this.items) if (it.out < 0) { it.out = this.ctx.time; return; }
  }

  update(dt) {
    const now = this.ctx.time, L = this.items;
    for (let i = L.length - 1; i >= 0; i--) {
      const it = L[i], age = now - it.born;
      const c = it.c;
      if (it.out < 0 && age > it.life) it.out = now;
      if (it.out >= 0) {
        const k = (now - it.out) / 0.28;
        if (k >= 1) { this._burst(it); c.destroy({ children: true }); L[i] = L[L.length - 1]; L.pop(); continue; }
        const s = 1 + 0.22 * easeOut(k);
        c.scale.set(s); c.alpha = 1 - easeIn(k);
      } else {
        const s = Math.max(0, spring(age));
        c.scale.set(s);
        c.rotation = it.rot0 * (1 - clamp(age * 2, 0, 1)) + Math.sin(now * 1.3 + it.ph) * 0.012;
        c.y = it.cy + Math.sin(now * 1.1 + it.ph) * 4;
      }
    }
  }

  _burst(it) {
    const { pBack, kit } = this.ctx;
    const x = it.c.x, y = it.c.y, n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, sp = 160 + Math.random() * 260;
      pBack.spawn(kit.tex.dot, x + Math.cos(a) * it.rect.w * 0.3, y + Math.sin(a) * it.rect.h * 0.3,
        { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 320, drag: 2.5, life: 0.5 + Math.random() * 0.4, s0: 0.55, s1: 0, tint: it.color, fout: 0.7 });
    }
  }
}

/* ================================================================== */
/* DANMAKU : lignes de texte qui traversent de droite à gauche          */
/* ================================================================== */
export class Danmaku {
  constructor(ctx) {
    this.ctx = ctx; this.items = []; this.layer = ctx.layers.danmaku; this.lanes = [];
    this.laneH = 66; this.layout();
  }
  get count() { return this.items.length; }

  layout() {
    const { H, zone } = this.ctx;
    const top = 56, n = Math.max(3, Math.floor((H - 2 * top) / this.laneH));
    const old = this.lanes;
    this.lanes = [];
    for (let i = 0; i < n; i++) {
      const y = top + i * this.laneH;
      const forbidden = zone && y + this.laneH > zone.y && y < zone.y + zone.h;
      this.lanes.push({ y, speed: old[i]?.speed ?? 300 + Math.random() * 140, freeAt: old[i]?.freeAt ?? 0, forbidden });
    }
  }

  add(msg) {
    const { kit, time } = this.ctx;
    const free = this.lanes.filter((l) => !l.forbidden && l.freeAt <= time);
    if (!free.length) return false;
    const lane = free[Math.floor(Math.random() * free.length)];
    const color = this.ctx.userColor(msg.user);
    const t = kit.text(msg.text, { font: 'sr-ui', size: 50, tint: color });
    t.position.set(this.ctx.W + 20, lane.y);
    this.layer.addChild(t);
    lane.freeAt = time + (t.width + 120) / lane.speed;
    this.items.push({ t, speed: lane.speed });
    return true;
  }

  update(dt) {
    const L = this.items;
    for (let i = L.length - 1; i >= 0; i--) {
      const it = L[i];
      it.t.x -= it.speed * dt;
      if (it.t.x + it.t.width < -20) { it.t.destroy(); L[i] = L[L.length - 1]; L.pop(); }
    }
  }
}

/* ================================================================== */
/* COMMENTAIRE VEDETTE : grand format, couleur du pseudo                */
/* ================================================================== */
export class Featured {
  constructor(ctx) { this.ctx = ctx; this.cur = null; this.layer = ctx.layers.hud; }
  get active() { return !!this.cur; }

  show(msg) {
    const { kit, theme, W, H, zone } = this.ctx;
    if (this.cur) this._kill();
    const color = this.ctx.userColor(msg.user);
    const wrap = Math.min(1180, W - 260);
    const tag = kit.text('★ EN VEDETTE', { font: 'sr-mono', size: 28, tint: theme.amb });
    const nameT = kit.text(msg.user.name, { font: 'sr-mono', size: 44, tint: color });
    const body = kit.text(msg.text, { font: 'sr-ui', size: 74, tint: theme.ink, wrap });
    const padX = 44, padY = 28;
    const w = Math.max(body.width, nameT.width + tag.width + 40) + padX * 2;
    const h = nameT.height + body.height + padY * 2 + 6;
    const c = new Container();
    c.addChild(kit.nine('fill', w, h, theme.bubbleFill, 0.92), kit.nine('ring', w, h, color, 1));
    const ring2 = kit.nine('ring', w + 16, h + 16, color, 0.45); ring2.position.set(-8, -8); c.addChild(ring2);
    tag.position.set(padX, padY - 6); nameT.position.set(padX + tag.width + 28, padY - 12);
    body.position.set(padX, padY + nameT.height + 2);
    c.addChild(tag, nameT, body);
    // en bas de l'écran, ou en haut si le bas rencontre la zone protégée
    let y = H - h - 36;
    if (zone && y < zone.y + zone.h && y + h > zone.y) y = 36;
    if (zone && y < zone.y + zone.h && y + h > zone.y) y = H - h - 36;
    c.pivot.set(w / 2, h / 2);
    c.position.set(W / 2, y + h / 2);
    c.scale.set(0);
    this.layer.addChild(c);
    this.cur = { c, born: this.ctx.time, life: 6.5, color, y: y + h / 2, w, h };
    this.ctx.avoid.featured = { x: W / 2 - w / 2, y, w, h };
    this.ctx.flash(color, 0.12);
    this.ctx.shake(5);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, sp = 200 + Math.random() * 500;
      this.ctx.pFront.spawn(kit.tex.star, W / 2 + (Math.random() - 0.5) * w * 0.9, y + h / 2,
        { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2.2, life: 0.8 + Math.random() * 0.6, s0: 0.5, s1: 0, tint: i % 2 ? color : theme.amb, add: true, rot: a, vr: 4 });
    }
  }

  _kill() { this.cur.c.destroy({ children: true }); this.cur = null; delete this.ctx.avoid.featured; }

  update() {
    const f = this.cur; if (!f) return;
    const age = this.ctx.time - f.born;
    if (age > f.life) { this._kill(); return; }
    const out = clamp((age - (f.life - 0.4)) / 0.4, 0, 1);
    f.c.scale.set(Math.max(0, spring(age)) * (1 - 0.15 * easeIn(out)));
    f.c.alpha = 1 - out;
    f.c.y = f.y + 12 * easeIn(out) - Math.sin(age * 2) * 3;
  }
}

/* ================================================================== */
/* CŒURS QUI MONTENT : intensité = débit de likes                        */
/* ================================================================== */
export class Hearts {
  constructor(ctx) { this.ctx = ctx; this.pending = 0; this.rate = 0; this.sum = 0; this.acc = 0; }
  like() { this.pending++; this.sum++; }

  update(dt) {
    const { pBack, kit, W, H, zone, theme } = this.ctx;
    // débit de likes lissé -> intensité 0..1
    this.rate = lerp(this.rate, this.sum / Math.max(dt, 1e-3), clamp(dt * 3, 0, 1)); this.sum = 0;
    const intensity = clamp(this.rate / 60, 0, 1);
    // budget d'affichage : le surplus n'est pas perdu, il grossit et accélère les cœurs
    this.acc = Math.min(3, this.acc + (4 + intensity * 12) * dt);
    const budget = Math.min(this.pending, Math.floor(this.acc));
    this.acc -= budget; this.pending = 0;   // le trop-plein n'est pas affiché : il grossit les cœurs (intensité)
    if (pBack.load > 0.9) return;
    const tints = [theme.or, theme.coral2, theme.coral3, theme.palette[8]];
    for (let i = 0; i < budget; i++) {
      let x = 60 + Math.random() * (W - 120);
      if (zone && x > zone.x - 70 && x < zone.x + zone.w + 70) x = Math.random() < 0.5 ? zone.x - 70 - Math.random() * 300 : zone.x + zone.w + 70 + Math.random() * 300;
      x = clamp(x, 40, W - 40);
      const sz = 0.3 + Math.random() * 0.3 + intensity * 0.25;
      const sp = 150 + Math.random() * 130 + intensity * 120;
      pBack.spawn(kit.tex.heart, x, H + 60, {
        vy: -sp, life: (H + 160) / sp, s0: sz * 0.5, s1: sz, a0: 0.95, fin: 0.04, fout: 0.25,
        tint: tints[(Math.random() * tints.length) | 0], wa: 24 + Math.random() * 28, wf: 1.5 + Math.random() * 2, ph: Math.random() * 6, vr: 0,
        rot: (Math.random() - 0.5) * 0.4,
      });
    }
  }
}

/* ================================================================== */
/* FEUX D'EMOJIS : 1 tap = 1 particule ; 30 taps / 2 s = une fusée       */
/* ================================================================== */
export class Fireworks {
  constructor(ctx) { this.ctx = ctx; this.win = {}; this.rockets = []; this.cool = {}; this.threshold = 30; this.cnt = 0; this.rate = 0; }

  tap(emoji) {
    const { time, pFront, kit, W, H } = this.ctx;
    this.cnt++;
    const w = (this.win[emoji] ||= []);
    w.push(time);
    while (w.length && time - w[0] > 2) w.shift();
    // un tap = une particule qui monte du bas (si la charge le permet)
    if (pFront.load < 0.75 && Math.random() < 22 / Math.max(22, this.rate)) {   // plafond ~22 particules de tap par seconde
      const sp = 380 + Math.random() * 300;
      pFront.spawn(kit.emoji(emoji), 80 + Math.random() * (W - 160), H + 40, {
        vy: -sp, drag: 0.4, life: 1.6 + Math.random() * 0.9, s0: 0.3, s1: 0.62, a0: 0.95,
        wa: 30, wf: 3 + Math.random() * 3, ph: Math.random() * 6, rot: (Math.random() - 0.5) * 0.5,
      });
    }
    if (w.length >= this.threshold && (this.cool[emoji] ?? 0) < time) {
      w.length = 0; this.cool[emoji] = time + 1.2;
      this.launch(emoji);
    }
  }

  launch(emoji, big = false) {
    const { kit, W, H, zone, time } = this.ctx;
    const R = big ? 380 : 300;
    let x = W / 2, y = 300;
    for (let i = 0; i < 24; i++) {
      x = R * 0.5 + Math.random() * (W - R);
      y = 170 + Math.random() * (H * 0.42);
      if ((!zone || distToRect(x, y, zone) >= R * 0.8) && this.ctx.avoidRects().every((a) => distToRect(x, y, a) >= R * 0.45)) break;
      if (i === 23) x = Math.random() < 0.5 ? 200 : W - 200;
    }
    const s = kit.sprite(kit.emoji(emoji)); s.scale.set(0.7);
    this.ctx.layers.fx.addChild(s);
    const x0 = clamp(x + (Math.random() - 0.5) * 160, 60, W - 60);
    this.rockets.push({ s, x0, y0: H + 40, x1: x, y1: y, t0: time, dur: 0.85, emoji, R, big, trail: 0 });
  }

  update(dt) {
    const { time, pFront, kit, theme } = this.ctx;
    this.rate = lerp(this.rate, this.cnt / Math.max(dt, 1e-3), clamp(dt * 4, 0, 1)); this.cnt = 0;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      const k = (time - r.t0) / r.dur;
      if (k >= 1) { this.explode(r); r.s.destroy(); this.rockets.splice(i, 1); continue; }
      const e = easeOut(k);
      const px = lerp(r.x0, r.x1, e) + Math.sin(k * 24) * 6 * (1 - k);
      const py = lerp(r.y0, r.y1, e);
      r.s.position.set(px, py); r.s.rotation = Math.sin(k * 30) * 0.25; r.s.scale.set(0.7 + 0.25 * k);
      r.trail += dt * 90;
      while (r.trail >= 1) {
        r.trail--;
        pFront.spawn(kit.tex.dot, px + (Math.random() - 0.5) * 12, py + 24, {
          vx: (Math.random() - 0.5) * 60, vy: 90 + Math.random() * 90, life: 0.35 + Math.random() * 0.3, s0: 0.5, s1: 0, tint: Math.random() < 0.5 ? theme.amb : theme.coral3, add: true,
        });
      }
    }
  }

  explode(r) {
    const { pFront, kit, theme } = this.ctx;
    const tex = kit.emoji(r.emoji);
    const load = pFront.load;
    const n = Math.round((r.big ? 90 : 62) * (load > 0.6 ? 0.55 : 1));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const ring = i % 3 === 0 ? 0.55 : 1;   // gerbe à deux couronnes
      const sp = (300 + Math.random() * 420) * ring * (r.R / 300);
      const sc = (0.42 + Math.random() * 0.34) * (r.big ? 1.2 : 1);
      pFront.spawn(tex, r.x1, r.y1, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 420, drag: 1.6, life: 1.5 + Math.random() * 0.9,
        s0: sc, s1: sc * 0.55, rot: (Math.random() - 0.5) * 0.6, vr: (Math.random() - 0.5) * 3, fout: 0.45,
      });
    }
    for (let i = 0; i < 44; i++) {
      const a = Math.random() * Math.PI * 2, sp = 200 + Math.random() * 600;
      pFront.spawn(kit.tex.star, r.x1, r.y1, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 260, drag: 2.2, life: 0.7 + Math.random() * 0.8, s0: 0.45, s1: 0.05,
        tint: [theme.amb, theme.coral3, theme.cy, theme.or][i % 4], add: true, rot: a, vr: 5,
      });
    }
    pFront.spawn(kit.tex.glow, r.x1, r.y1, { life: 0.4, s0: 1.5, s1: 7, a0: 0.9, tint: theme.amb, add: true, fin: 0, fout: 1 });
    this.ctx.shake(r.big ? 14 : 8);
  }
}

/* ================================================================== */
/* JAUGE DE SALLE (combo) : plus la salle réagit ensemble, plus ça gonfle */
/* ================================================================== */
export class Gauge {
  constructor(ctx, o = {}) {
    this.ctx = ctx; this.energy = 0; this.level = 0; this.mult = 1; this.cap = 200;
    this.h = o.h ?? 380; this.w = 46; this.x = o.x ?? 56; this.y = o.y ?? 500;
    const { kit, theme } = ctx;
    const c = this.c = new Container();
    ctx.layers.hud.addChild(c);
    this.bg = kit.nine('fill', this.w + 16, this.h + 16, theme.bubbleFill, 0.85); this.bg.position.set(-8, -8);
    this.ring = kit.nine('ring', this.w + 16, this.h + 16, theme.ink2, 0.8); this.ring.position.set(-8, -8);
    this.fill = new Sprite(kit.tex.white); this.fill.width = this.w; this.fill.anchor.set(0, 1); this.fill.position.set(0, this.h);
    this.label = kit.text('SALLE', { font: 'sr-mono', size: 26, tint: theme.ink2 }); this.label.position.set(-6, -52);
    this.multT = kit.text('x1', { font: 'sr-mono', size: 72, tint: theme.ink }); this.multT.position.set(-6, this.h + 20);
    c.addChild(this.bg, this.fill, this.ring, this.label, this.multT);
    c.position.set(this.x, this.y);
    this.popT = null; this.popBorn = 0;
    this.enabled = true;
    this.setEnabled(true);
  }
  setEnabled(v) {
    this.enabled = v; this.c.visible = v;
    if (v) this.ctx.avoid.gauge = { x: this.x - 30, y: this.y - 90, w: 300, h: this.h + 190 }; else delete this.ctx.avoid.gauge;
  }
  add(w) { this.energy = Math.min(this.cap * 1.3, this.energy + w); }

  update(dt) {
    const { theme, kit, time } = this.ctx;
    this.energy *= Math.exp(-dt / 2.4);
    const target = clamp(this.energy / this.cap, 0, 1);
    this.level = lerp(this.level, target, clamp(dt * 6, 0, 1));
    const mult = 1 + Math.floor(target * 5);   // x1 .. x6
    if (mult > this.mult && this.enabled) this._levelUp(mult);
    if (mult !== this.mult) { this.mult = mult; this.multT.text = 'x' + mult; }
    if (!this.enabled) return;
    const L = this.level;
    this.fill.height = Math.max(2, this.h * L);
    const ramp = theme.ramp, f = L * (ramp.length - 1), i = Math.min(ramp.length - 2, Math.floor(f));
    const col = mix(ramp[i], ramp[i + 1], f - i);
    this.fill.tint = col;
    this.multT.tint = col;
    const pulse = 1 + (mult > 1 ? Math.sin(time * (6 + mult * 2)) * 0.03 * mult : 0);
    this.multT.scale.set(pulse * (1 + 0.1 * (mult - 1)));
    if (this.popT) {
      const age = time - this.popBorn;
      if (age > 1.6) { this.popT.destroy(); this.popT = null; }
      else { this.popT.scale.set(Math.max(0, spring(age)) * 1.1); this.popT.alpha = 1 - easeIn((age - 1) / 0.6); this.popT.y = -108 - age * 24; }
    }
  }

  _levelUp(mult) {
    const { kit, theme, pFront } = this.ctx;
    const col = theme.ramp[Math.min(3, mult - 2)];
    this.ctx.flash(col, 0.1 + 0.03 * mult);
    this.ctx.shake(4 + mult * 2.5);
    if (this.popT) this.popT.destroy();
    this.popT = kit.text('COMBO x' + mult + ' !', { font: 'sr-mono', size: 54, tint: col });
    this.popT.position.set(-6, -108); this.popT.pivot.set(0, 0);
    this.c.addChild(this.popT); this.popBorn = this.ctx.time;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, sp = 200 + Math.random() * 420;
      pFront.spawn(kit.tex.star, this.x + this.w / 2, this.y + this.h * (1 - this.level), {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2.4, life: 0.7 + Math.random() * 0.5, s0: 0.5, s1: 0, tint: col, add: true, rot: a, vr: 5,
      });
    }
  }
}

/* ================================================================== */
/* RÉVÉLATION DE VOTE : barres qui montent, roulement, explosion         */
/* ================================================================== */
export class VoteReveal {
  constructor(ctx) { this.ctx = ctx; this.state = 'idle'; this.c = null; this.counts = []; }
  get active() { return this.state !== 'idle'; }

  start(options, voteDur = 6.5) {
    if (this.active) this._kill();
    const { kit, theme, W, H, videoRight } = this.ctx;
    const pw = clamp(W - videoRight - 50, 440, 520), ph = 800;
    const px = W - pw - 24, py = (H - ph) / 2;
    this.rect = { x: px, y: py, w: pw, h: ph };
    this.options = options; this.counts = options.map(() => 0); this.shown = options.map(() => 0);
    this.voteDur = voteDur; this.t0 = this.ctx.time; this.state = 'voting'; this.winner = -1;
    const c = this.c = new Container(); c.position.set(px, py);
    this.ctx.layers.hud.addChild(c);
    c.addChild(kit.nine('fill', pw, ph, theme.bubbleFill, 0.93), kit.nine('ring', pw, ph, theme.cy, 0.9));
    this.title = kit.text('OÙ DOIT-IL ALLER ?', { font: 'sr-ui', size: 38, tint: theme.ink, wrap: pw - 60 });
    this.title.position.set(30, 26); c.addChild(this.title);
    this.status = kit.text('VOTEZ !', { font: 'sr-mono', size: 28, tint: theme.amb });
    this.status.position.set(30, 26 + this.title.height + 6); c.addChild(this.status);
    const n = options.length, slot = (pw - 40) / n, bw = slot - 26;
    this.bars = options.map((o, i) => {
      const x = 20 + slot * i + 13;
      const bar = new Sprite(kit.tex.white); bar.anchor.set(0, 1); bar.width = bw; bar.height = 4; bar.position.set(x, ph - 150); bar.tint = o.color;
      const pct = kit.text('0%', { font: 'sr-mono', size: 40, tint: theme.ink }); pct.position.set(x, ph - 150 - 60);
      const lab = kit.text(o.label, { font: 'sr-ui', size: 28, tint: o.color, wrap: slot - 4 }); lab.position.set(x - 2, ph - 134);
      c.addChild(bar, pct, lab);
      return { bar, pct, lab, x, bw };
    });
    this.maxH = ph - 150 - (26 + this.title.height + 6 + 34 + 70);
    c.scale.set(0); c.pivot.set(pw / 2, ph / 2); c.position.set(px + pw / 2, py + ph / 2);
    this.ctx.avoid.vote = this.rect;
    return true;
  }

  add(opt) { if (this.state === 'voting' || this.state === 'drum') this.counts[opt]++; }

  _kill() { this.c?.destroy({ children: true }); this.c = null; this.state = 'idle'; delete this.ctx.avoid.vote; }

  update(dt) {
    if (this.state === 'idle') return;
    const { time, kit, theme, pFront } = this.ctx;
    const age = time - this.t0;
    const total = this.counts.reduce((a, b) => a + b, 0) || 1;
    const maxC = Math.max(1, ...this.counts);
    const bars = this.bars;
    // entrée en ressort
    let sc = Math.max(0, spring(age));
    if (this.state === 'out') sc = 1 - easeIn((time - this.tOut) / 0.5);
    this.c.scale.set(Math.max(0, sc)); this.c.alpha = this.state === 'out' ? sc : 1;

    for (let i = 0; i < bars.length; i++) {
      let target = this.counts[i] / maxC;
      if (this.state === 'drum') target = clamp(target * (0.55 + Math.random() * 0.6), 0, 1);   // roulement : les barres tremblent
      if (this.state === 'reveal' || this.state === 'out') target = i === this.winner ? 1 : (this.counts[i] / maxC) * 0.55;
      this.shown[i] = lerp(this.shown[i], target, clamp(dt * (this.state === 'drum' ? 22 : 7), 0, 1));
      const hh = Math.max(4, this.maxH * this.shown[i]);
      bars[i].bar.height = hh;
      const top = this.rect.h - 150 - hh;
      bars[i].pct.y = top - 58;
      if (this.state !== 'drum') bars[i].pct.text = Math.round((this.counts[i] / total) * 100) + '%';
      else bars[i].pct.text = '??%';
      bars[i].lab.alpha = bars[i].bar.alpha = bars[i].pct.alpha = (this.state === 'reveal' && i !== this.winner) ? 0.35 : 1;
    }

    if (this.state === 'voting') {
      const left = Math.max(0, this.voteDur - age);
      this.status.text = 'VOTEZ !  ' + Math.ceil(left) + ' s';
      if (age >= this.voteDur) { this.state = 'drum'; this.tDrum = time; this.status.text = 'ET LE GAGNANT EST…'; this.ctx.shake(5); }
    } else if (this.state === 'drum') {
      this.ctx.shake(3 + (time - this.tDrum) * 3);
      if (time - this.tDrum > 1.9) this._reveal();
    } else if (this.state === 'reveal') {
      const k = time - this.tReveal, w = bars[this.winner];
      w.pct.scale.set(1 + 0.18 * Math.sin(k * 8) * Math.exp(-k)); w.bar.tint = mix(this.options[this.winner].color, this.ctx.theme.masque, 0.25 + 0.2 * Math.sin(k * 10));
      if (this.status.scale.x < 1.2) this.status.scale.set(1 + 0.3 * easeOut(k * 4));
      if (k > 5.5) { this.state = 'out'; this.tOut = time; }
    } else if (this.state === 'out') {
      if (time - this.tOut > 0.5) this._kill();
    }
  }

  _reveal() {
    const { kit, theme, pFront, time } = this.ctx;
    let win = 0;
    this.counts.forEach((v, i) => { if (v > this.counts[win]) win = i; });
    this.winner = win; this.state = 'reveal'; this.tReveal = time;
    const o = this.options[win];
    this.status.text = '★ ' + o.label.toUpperCase() + ' !'; this.status.tint = o.color;
    this.ctx.shake(18); this.ctx.flash(o.color, 0.3);
    const b = this.bars[win];
    const cx = this.rect.x + b.x + b.bw / 2, cy = this.rect.y + this.rect.h - 150 - this.maxH * 0.9;
    for (let i = 0; i < 110; i++) {
      const a = Math.random() * Math.PI * 2, sp = 240 + Math.random() * 760;
      pFront.spawn(i % 3 ? kit.tex.dot : kit.tex.star, cx, cy, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, ay: 520, drag: 1.4, life: 1.2 + Math.random() * 1.2, s0: 0.5 + Math.random() * 0.5, s1: 0.2,
        tint: [o.color, theme.amb, theme.coral3, theme.masque, theme.cy][i % 5], add: i % 3 === 0, rot: a, vr: 6,
      });
    }
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2, sp = 300 + Math.random() * 420;
      pFront.spawn(kit.emoji(i % 2 ? '🎉' : '✨'), cx, cy, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, ay: 480, drag: 1.5, life: 1.6 + Math.random(), s0: 0.9, s1: 0.5 });
    }
    pFront.spawn(kit.tex.glow, cx, cy, { life: 0.5, s0: 2, s1: 9, a0: 0.9, tint: o.color, add: true, fin: 0 });
  }
}

/* ================================================================== */
/* DENSITÉ : le surplus de messages devient poussière lumineuse         */
/* ================================================================== */
export class Density {
  constructor(ctx) { this.ctx = ctx; this.pending = 0; this.level = 0; }
  surplus(n) { this.pending += n; }
  update(dt) {
    const { pBack, kit, theme, W, H } = this.ctx;
    this.level = lerp(this.level, this.pending / Math.max(dt, 1e-3), clamp(dt * 2, 0, 1));
    const n = Math.min(Math.round(this.pending * 1.5), 12);
    this.pending = 0;
    if (pBack.load > 0.85) return;
    for (let i = 0; i < n; i++) {
      const left = Math.random() < 0.5;
      const x = left ? Math.random() * W * 0.22 : W * 0.78 + Math.random() * W * 0.22;
      const tint = theme.palette[(Math.random() * theme.palette.length) | 0];
      const tex = Math.random() < 0.35 ? kit.tex.star : kit.tex.dot;
      pBack.spawn(tex, Math.random() < 0.6 ? x : Math.random() * W, H + 20 - Math.random() * 120, {
        vy: -(110 + Math.random() * 240), life: 2.4 + Math.random() * 2, s0: 0.12 + Math.random() * 0.22, s1: 0.05, a0: 0.8, tint,
        wa: 14 + Math.random() * 30, wf: 1 + Math.random() * 2.5, ph: Math.random() * 6, add: tex === kit.tex.star, rot: Math.random() * 3,
      });
    }
  }
}
