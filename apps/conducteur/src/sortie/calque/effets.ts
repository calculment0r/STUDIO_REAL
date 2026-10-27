// Effets du calque de réactions (porté de prototypes/scene-pops/fx.js). Tout est en unités logiques : la scène fait
// toujours 1080 de haut, calque.ts applique l'échelle de l'écran réel au conteneur racine.
import { Container, Sprite, type BitmapText } from 'pixi.js';
import { NEUTRE, type Kit, type Particules, type Rect } from './kit';
import { melange, type ThemeCalque } from './theme';

export interface MessagePublic { auteur: string; texte: string; emoji?: string }

export type NomCouche = 'back' | 'danmaku' | 'bubbles' | 'fx' | 'front' | 'hud' | 'flash';

export interface Contexte {
  kit: Kit; theme: ThemeCalque;
  couches: Record<NomCouche, Container>;
  pBack: Particules; pFront: Particules;
  W: number; H: number; temps: number;
  zone: Rect | null;
  eviter: Record<string, Rect>;
  rectsAEviter(): Rect[];
  secouer(a: number): void;
  eclair(couleur: number, a: number): void;
  couleurPseudo(nom: string): number;
}

const borne = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sortie = (t: number) => 1 - Math.pow(1 - borne(t, 0, 1), 3);
const entree = (t: number) => borne(t, 0, 1) ** 2;
/** ressort sous-amorti : 0 → dépasse ~1,17 → se stabilise sur 1 */
export const ressort = (t: number) => (t <= 0 ? 0 : 1 - Math.exp(-8 * t) * Math.cos(14 * t));
const touche = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const recouvrement = (a: Rect, b: Rect) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};
const distanceRect = (px: number, py: number, r: Rect) => Math.hypot(Math.max(r.x - px, 0, px - (r.x + r.w)), Math.max(r.y - py, 0, py - (r.y + r.h)));
const hasard = <T>(l: readonly T[]): T => l[(Math.random() * l.length) | 0];

/** Cherche un emplacement libre (hors zone protégée et zones réservées, peu de recouvrement avec les autres). */
function placer(ctx: Contexte, w: number, h: number, autres: Rect[], essais = 18): Rect | null {
  const m = 20;
  let meilleur: Rect | null = null, score = Infinity;
  const eviter = ctx.rectsAEviter();
  for (let i = 0; i < essais; i++) {
    const r = { x: m + Math.random() * Math.max(1, ctx.W - 2 * m - w), y: m + Math.random() * Math.max(1, ctx.H - 2 * m - h), w, h };
    const rr = { x: r.x - 30, y: r.y - 30, w: w + 60, h: h + 60 };
    if (eviter.some((a) => touche(rr, a))) continue;
    let ov = 0;
    for (const o of autres) ov += recouvrement(r, o);
    ov /= w * h;
    if (ov < score) { meilleur = r; score = ov; if (ov === 0) break; }
  }
  return score < 0.3 ? meilleur : null;
}

// ── POP : bulle qui grossit avec ressort, reste 3 à 6 s, puis éclate ──────────────────────────────────────────────
interface Bulle { c: Container; rect: Rect; cy: number; ne: number; vie: number; couleur: number; rot0: number; ph: number; sortie: number }
export class Pops {
  private items: Bulle[] = [];
  private readonly ctx: Contexte;
  cap = 14;
  constructor(ctx: Contexte) { this.ctx = ctx; }
  get nombre() { return this.items.length; }

  ajouter(msg: MessagePublic): boolean {
    const { kit, theme } = this.ctx;
    const couleur = this.ctx.couleurPseudo(msg.auteur);
    const nom = kit.texte(msg.auteur, { police: 'sr-mono', taille: 24, teinte: couleur });
    const corps = kit.texte(msg.texte, { police: 'sr-ui', taille: 40, teinte: theme.ink, largeur: 560 });
    const padX = 26, padY = 16, ecart = 4;
    const emo = msg.emoji ? kit.sprite(kit.emoji(msg.emoji)) : null;
    emo?.scale.set(0.5);
    const w = Math.max(nom.width + (emo ? 52 : 0), corps.width) + padX * 2;
    const h = nom.height + ecart + corps.height + padY * 2;
    const r = placer(this.ctx, w, h, this.items.map((i) => i.rect));
    if (!r) { nom.destroy(); corps.destroy(); emo?.destroy(); return false; }
    const c = new Container();
    c.addChild(kit.neuf('fond', w, h, theme.bubbleFill, 0.88), kit.neuf('anneau', w, h, couleur, 1));
    nom.position.set(padX, padY - 2);
    corps.position.set(padX, padY + nom.height + ecart);
    c.addChild(nom, corps);
    if (emo) { emo.position.set(w - padX - 14, padY + 10); c.addChild(emo); }
    c.pivot.set(w / 2, h / 2);
    c.position.set(r.x + w / 2, r.y + h / 2);
    c.scale.set(0);
    c.rotation = (Math.random() - 0.5) * 0.08;
    this.ctx.couches.bubbles.addChild(c);
    if (this.items.length >= this.cap) { const v = this.items.find((i) => i.sortie < 0); if (v) v.sortie = this.ctx.temps; }
    this.items.push({ c, rect: r, cy: r.y + h / 2, ne: this.ctx.temps, vie: 3 + Math.random() * 3, couleur, rot0: c.rotation, ph: Math.random() * 6, sortie: -1 });
    return true;
  }

  avancer(): void {
    const now = this.ctx.temps, L = this.items;
    for (let i = L.length - 1; i >= 0; i--) {
      const it = L[i], age = now - it.ne, c = it.c;
      if (it.sortie < 0 && age > it.vie) it.sortie = now;
      if (it.sortie >= 0) {
        const k = (now - it.sortie) / 0.28;
        if (k >= 1) { this.eclater(it); c.destroy({ children: true }); L[i] = L[L.length - 1]; L.pop(); continue; }
        c.scale.set(1 + 0.22 * sortie(k)); c.alpha = 1 - entree(k);
      } else {
        c.scale.set(Math.max(0, ressort(age)));
        c.rotation = it.rot0 * (1 - borne(age * 2, 0, 1)) + Math.sin(now * 1.3 + it.ph) * 0.012;
        c.y = it.cy + Math.sin(now * 1.1 + it.ph) * 4;
      }
    }
  }

  private eclater(it: Bulle): void {
    const { pBack, kit } = this.ctx;
    const x = it.c.x, y = it.c.y, n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, sp = 160 + Math.random() * 260;
      pBack.lancer(kit.tex.point, x + Math.cos(a) * it.rect.w * 0.3, y + Math.sin(a) * it.rect.h * 0.3,
        { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 320, drag: 2.5, life: 0.5 + Math.random() * 0.4, s0: 0.55, s1: 0, tint: it.couleur, fout: 0.7 });
    }
  }

  vider(): void { for (const it of this.items) it.c.destroy({ children: true }); this.items = []; }
}

// ── DANMAKU : lignes de texte qui traversent de droite à gauche ──────────────────────────────────────────────────
export class Danmaku {
  private items: { t: BitmapText; vitesse: number }[] = [];
  private pistes: { y: number; vitesse: number; libre: number; interdite: boolean }[] = [];
  private readonly ctx: Contexte;
  private readonly hPiste = 66;
  constructor(ctx: Contexte) { this.ctx = ctx; this.disposer(); }
  get nombre() { return this.items.length; }

  disposer(): void {
    const { H, zone } = this.ctx;
    const haut = 56, n = Math.max(3, Math.floor((H - 2 * haut) / this.hPiste));
    const old = this.pistes;
    this.pistes = [];
    for (let i = 0; i < n; i++) {
      const y = haut + i * this.hPiste;
      const interdite = !!zone && y + this.hPiste > zone.y && y < zone.y + zone.h;
      this.pistes.push({ y, vitesse: old[i]?.vitesse ?? 300 + Math.random() * 140, libre: old[i]?.libre ?? 0, interdite });
    }
  }

  ajouter(msg: MessagePublic): boolean {
    const { kit, temps } = this.ctx;
    const libres = this.pistes.filter((l) => !l.interdite && l.libre <= temps);
    if (!libres.length) return false;
    const piste = hasard(libres);
    const t = kit.texte(msg.texte, { police: 'sr-ui', taille: 50, teinte: this.ctx.couleurPseudo(msg.auteur) });
    t.position.set(this.ctx.W + 20, piste.y);
    this.ctx.couches.danmaku.addChild(t);
    piste.libre = temps + (t.width + 120) / piste.vitesse;
    this.items.push({ t, vitesse: piste.vitesse });
    return true;
  }

  avancer(dt: number): void {
    const L = this.items;
    for (let i = L.length - 1; i >= 0; i--) {
      const it = L[i];
      it.t.x -= it.vitesse * dt;
      if (it.t.x + it.t.width < -20) { it.t.destroy(); L[i] = L[L.length - 1]; L.pop(); }
    }
  }

  vider(): void { for (const it of this.items) it.t.destroy(); this.items = []; }
}

// ── COMMENTAIRE VEDETTE : grand format, couleur du pseudo ────────────────────────────────────────────────────────
export class Vedette {
  private cur: { c: Container; ne: number; vie: number; y: number } | null = null;
  private readonly ctx: Contexte;
  constructor(ctx: Contexte) { this.ctx = ctx; }

  montrer(msg: MessagePublic): void {
    const { kit, theme, W, H, zone } = this.ctx;
    if (this.cur) this.tuer();
    const couleur = this.ctx.couleurPseudo(msg.auteur);
    const largeur = Math.min(1180, W - 260);
    const tag = kit.texte('★ EN VEDETTE', { police: 'sr-mono', taille: 28, teinte: theme.rampe[0] });
    const nom = kit.texte(msg.auteur, { police: 'sr-mono', taille: 44, teinte: couleur });
    const corps = kit.texte(msg.texte, { police: 'sr-ui', taille: 74, teinte: theme.ink, largeur });
    const padX = 44, padY = 28;
    const w = Math.max(corps.width, nom.width + tag.width + 40) + padX * 2;
    const h = nom.height + corps.height + padY * 2 + 6;
    const c = new Container();
    c.addChild(kit.neuf('fond', w, h, theme.bubbleFill, 0.92), kit.neuf('anneau', w, h, couleur, 1));
    const a2 = kit.neuf('anneau', w + 16, h + 16, couleur, 0.45); a2.position.set(-8, -8); c.addChild(a2);
    tag.position.set(padX, padY - 6); nom.position.set(padX + tag.width + 28, padY - 12);
    corps.position.set(padX, padY + nom.height + 2);
    c.addChild(tag, nom, corps);
    let y = H - h - 36;
    if (zone && y < zone.y + zone.h && y + h > zone.y) y = 36;
    c.pivot.set(w / 2, h / 2);
    c.position.set(W / 2, y + h / 2);
    c.scale.set(0);
    this.ctx.couches.hud.addChild(c);
    this.cur = { c, ne: this.ctx.temps, vie: 6.5, y: y + h / 2 };
    this.ctx.eviter.vedette = { x: W / 2 - w / 2, y, w, h };
    this.ctx.eclair(couleur, 0.12);
    this.ctx.secouer(5);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, sp = 200 + Math.random() * 500;
      this.ctx.pFront.lancer(kit.tex.etoile, W / 2 + (Math.random() - 0.5) * w * 0.9, y + h / 2,
        { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2.2, life: 0.8 + Math.random() * 0.6, s0: 0.5, s1: 0, tint: i % 2 ? couleur : theme.rampe[0], add: true, rot: a, vr: 4 });
    }
  }

  private tuer(): void { this.cur?.c.destroy({ children: true }); this.cur = null; delete this.ctx.eviter.vedette; }

  avancer(): void {
    const f = this.cur; if (!f) return;
    const age = this.ctx.temps - f.ne;
    if (age > f.vie) { this.tuer(); return; }
    const out = borne((age - (f.vie - 0.4)) / 0.4, 0, 1);
    f.c.scale.set(Math.max(0, ressort(age)) * (1 - 0.15 * entree(out)));
    f.c.alpha = 1 - out;
    f.c.y = f.y + 12 * entree(out) - Math.sin(age * 2) * 3;
  }
}

// ── CŒURS QUI MONTENT : intensité = débit de likes ───────────────────────────────────────────────────────────────
export class Coeurs {
  private attente = 0; private debit = 0; private somme = 0; private acc = 0;
  private readonly ctx: Contexte;
  constructor(ctx: Contexte) { this.ctx = ctx; }
  aimer(n = 1): void { this.attente += n; this.somme += n; }

  avancer(dt: number): void {
    const { pBack, kit, W, H, zone, theme } = this.ctx;
    this.debit = lerp(this.debit, this.somme / Math.max(dt, 1e-3), borne(dt * 3, 0, 1)); this.somme = 0;
    const intensite = borne(this.debit / 60, 0, 1);
    this.acc = Math.min(3, this.acc + (4 + intensite * 12) * dt);
    const budget = Math.min(this.attente, Math.floor(this.acc));
    this.acc -= budget; this.attente = 0;
    if (pBack.charge > 0.9) return;
    const teintes = [theme.ort, theme.rampe[1], theme.rampe[0], theme.palette[8]];
    for (let i = 0; i < budget; i++) {
      let x = 60 + Math.random() * (W - 120);
      if (zone && x > zone.x - 70 && x < zone.x + zone.w + 70) x = Math.random() < 0.5 ? zone.x - 70 - Math.random() * 300 : zone.x + zone.w + 70 + Math.random() * 300;
      x = borne(x, 40, W - 40);
      const sz = 0.3 + Math.random() * 0.3 + intensite * 0.25;
      const sp = 150 + Math.random() * 130 + intensite * 120;
      pBack.lancer(kit.tex.coeur, x, H + 60, {
        vy: -sp, life: (H + 160) / sp, s0: sz * 0.5, s1: sz, a0: 0.95, fin: 0.04, fout: 0.25,
        tint: hasard(teintes), wa: 24 + Math.random() * 28, wf: 1.5 + Math.random() * 2, ph: Math.random() * 6, rot: (Math.random() - 0.5) * 0.4,
      });
    }
  }
}

// ── FEUX D'EMOJIS : 1 tap = 1 particule ; 30 taps en 2 s = une fusée ─────────────────────────────────────────────
interface Fusee { s: Sprite; x0: number; y0: number; x1: number; y1: number; t0: number; dur: number; emoji: string; R: number; grande: boolean; trainee: number }
export class FeuxEmojis {
  private fenetres = new Map<string, number[]>();
  private fusees: Fusee[] = [];
  private repos = new Map<string, number>();
  seuil = 30;
  private compte = 0; private debit = 0;
  private readonly ctx: Contexte;
  constructor(ctx: Contexte) { this.ctx = ctx; }

  taper(emoji: string): void {
    const { temps, pFront, kit, W, H } = this.ctx;
    this.compte++;
    const f = this.fenetres.get(emoji) ?? [];
    this.fenetres.set(emoji, f);
    f.push(temps);
    while (f.length && temps - f[0] > 2) f.shift();
    if (pFront.charge < 0.75 && Math.random() < 22 / Math.max(22, this.debit)) {
      const sp = 380 + Math.random() * 300;
      pFront.lancer(kit.emoji(emoji), 80 + Math.random() * (W - 160), H + 40, {
        vy: -sp, drag: 0.4, life: 1.6 + Math.random() * 0.9, s0: 0.3, s1: 0.62, a0: 0.95,
        wa: 30, wf: 3 + Math.random() * 3, ph: Math.random() * 6, rot: (Math.random() - 0.5) * 0.5,
      });
    }
    if (f.length >= this.seuil && (this.repos.get(emoji) ?? 0) < temps) {
      f.length = 0; this.repos.set(emoji, temps + 1.2);
      this.lancer(emoji);
    }
  }

  lancer(emoji: string, grande = false): void {
    const { kit, W, H, zone, temps } = this.ctx;
    const R = grande ? 380 : 300;
    let x = W / 2, y = 300;
    for (let i = 0; i < 24; i++) {
      x = R * 0.5 + Math.random() * (W - R);
      y = 170 + Math.random() * (H * 0.42);
      if ((!zone || distanceRect(x, y, zone) >= R * 0.8) && this.ctx.rectsAEviter().every((a) => distanceRect(x, y, a) >= R * 0.45)) break;
      if (i === 23) x = Math.random() < 0.5 ? 200 : W - 200;
    }
    const s = kit.sprite(kit.emoji(emoji)); s.scale.set(0.7);
    this.ctx.couches.fx.addChild(s);
    this.fusees.push({ s, x0: borne(x + (Math.random() - 0.5) * 160, 60, W - 60), y0: H + 40, x1: x, y1: y, t0: temps, dur: 0.85, emoji, R, grande, trainee: 0 });
  }

  avancer(dt: number): void {
    const { temps, pFront, kit, theme } = this.ctx;
    this.debit = lerp(this.debit, this.compte / Math.max(dt, 1e-3), borne(dt * 4, 0, 1)); this.compte = 0;
    for (let i = this.fusees.length - 1; i >= 0; i--) {
      const r = this.fusees[i];
      const k = (temps - r.t0) / r.dur;
      if (k >= 1) { this.exploser(r); r.s.destroy(); this.fusees.splice(i, 1); continue; }
      const e = sortie(k);
      const px = lerp(r.x0, r.x1, e) + Math.sin(k * 24) * 6 * (1 - k), py = lerp(r.y0, r.y1, e);
      r.s.position.set(px, py); r.s.rotation = Math.sin(k * 30) * 0.25; r.s.scale.set(0.7 + 0.25 * k);
      r.trainee += dt * 90;
      while (r.trainee >= 1) {
        r.trainee--;
        pFront.lancer(kit.tex.point, px + (Math.random() - 0.5) * 12, py + 24, {
          vx: (Math.random() - 0.5) * 60, vy: 90 + Math.random() * 90, life: 0.35 + Math.random() * 0.3, s0: 0.5, s1: 0, tint: Math.random() < 0.5 ? theme.rampe[0] : theme.rampe[1], add: true,
        });
      }
    }
  }

  private exploser(r: Fusee): void {
    const { pFront, kit, theme } = this.ctx;
    const tex = kit.emoji(r.emoji);
    const n = Math.round((r.grande ? 90 : 62) * (pFront.charge > 0.6 ? 0.55 : 1));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const couronne = i % 3 === 0 ? 0.55 : 1;
      const sp = (300 + Math.random() * 420) * couronne * (r.R / 300);
      const sc = (0.42 + Math.random() * 0.34) * (r.grande ? 1.2 : 1);
      pFront.lancer(tex, r.x1, r.y1, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 420, drag: 1.6, life: 1.5 + Math.random() * 0.9, s0: sc, s1: sc * 0.55, rot: (Math.random() - 0.5) * 0.6, vr: (Math.random() - 0.5) * 3, fout: 0.45 });
    }
    const teintes = [theme.rampe[0], theme.rampe[1], theme.cy, theme.ort];
    for (let i = 0; i < 44; i++) {
      const a = Math.random() * Math.PI * 2, sp = 200 + Math.random() * 600;
      pFront.lancer(kit.tex.etoile, r.x1, r.y1, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 260, drag: 2.2, life: 0.7 + Math.random() * 0.8, s0: 0.45, s1: 0.05, tint: teintes[i % 4], add: true, rot: a, vr: 5 });
    }
    pFront.lancer(kit.tex.halo, r.x1, r.y1, { life: 0.4, s0: 1.5, s1: 7, a0: 0.9, tint: theme.rampe[0], add: true, fin: 0, fout: 1 });
    this.ctx.secouer(r.grande ? 14 : 8);
  }
}

// ── JAUGE DE SALLE (combo) : plus la salle réagit ensemble, plus ça gonfle ───────────────────────────────────────
export class Jauge {
  private energie = 0; private niveau = 0; private mult = 1; private readonly cap = 200;
  private readonly h = 380; private readonly w = 46; private readonly x = 56; private readonly y = 500;
  private readonly c: Container; private readonly rempli: Sprite; private readonly multT: BitmapText;
  private pop: BitmapText | null = null; private popNe = 0;
  actif = true;
  private readonly ctx: Contexte;
  constructor(ctx: Contexte) {
    this.ctx = ctx;
    const { kit, theme } = ctx;
    const c = this.c = new Container();
    ctx.couches.hud.addChild(c);
    const fond = kit.neuf('fond', this.w + 16, this.h + 16, theme.bubbleFill, 0.85); fond.position.set(-8, -8);
    const anneau = kit.neuf('anneau', this.w + 16, this.h + 16, theme.ink2, 0.8); anneau.position.set(-8, -8);
    this.rempli = new Sprite(kit.tex.blanc); this.rempli.width = this.w; this.rempli.anchor.set(0, 1); this.rempli.position.set(0, this.h);
    const etiquette = kit.texte('SALLE', { police: 'sr-mono', taille: 26, teinte: theme.ink2 }); etiquette.position.set(-6, -52);
    this.multT = kit.texte('x1', { police: 'sr-mono', taille: 72, teinte: theme.ink }); this.multT.position.set(-6, this.h + 20);
    c.addChild(fond, this.rempli, anneau, etiquette, this.multT);
    c.position.set(this.x, this.y);
    this.activer(true);
  }
  activer(v: boolean): void {
    this.actif = v; this.c.visible = v;
    if (v) this.ctx.eviter.jauge = { x: this.x - 30, y: this.y - 90, w: 300, h: this.h + 190 }; else delete this.ctx.eviter.jauge;
  }
  ajouter(w: number): void { this.energie = Math.min(this.cap * 1.3, this.energie + w); }

  avancer(dt: number): void {
    const { theme, kit, temps } = this.ctx;
    this.energie *= Math.exp(-dt / 2.4);
    const cible = borne(this.energie / this.cap, 0, 1);
    this.niveau = lerp(this.niveau, cible, borne(dt * 6, 0, 1));
    const mult = 1 + Math.floor(cible * 5);
    if (mult > this.mult && this.actif) this.monter(mult);
    if (mult !== this.mult) { this.mult = mult; this.multT.text = 'x' + mult; }
    if (!this.actif) return;
    this.rempli.height = Math.max(2, this.h * this.niveau);
    const ramp = theme.ramp, f = this.niveau * (ramp.length - 1), i = Math.min(ramp.length - 2, Math.floor(f));
    const col = melange(ramp[i], ramp[i + 1], f - i);
    this.rempli.tint = col; this.multT.tint = col;
    const pouls = 1 + (mult > 1 ? Math.sin(temps * (6 + mult * 2)) * 0.03 * mult : 0);
    this.multT.scale.set(pouls * (1 + 0.1 * (mult - 1)));
    if (this.pop) {
      const age = temps - this.popNe;
      if (age > 1.6) { this.pop.destroy(); this.pop = null; } else { this.pop.scale.set(Math.max(0, ressort(age)) * 1.1); this.pop.alpha = 1 - entree((age - 1) / 0.6); this.pop.y = -108 - age * 24; }
    }
    void kit;
  }

  private monter(mult: number): void {
    const { kit, theme, pFront } = this.ctx;
    const col = theme.ramp[Math.min(3, mult - 2)];
    this.ctx.eclair(col, 0.1 + 0.03 * mult);
    this.ctx.secouer(4 + mult * 2.5);
    this.pop?.destroy();
    this.pop = kit.texte('COMBO x' + mult + ' !', { police: 'sr-mono', taille: 54, teinte: col });
    this.pop.position.set(-6, -108);
    this.c.addChild(this.pop); this.popNe = this.ctx.temps;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, sp = 200 + Math.random() * 420;
      pFront.lancer(kit.tex.etoile, this.x + this.w / 2, this.y + this.h * (1 - this.niveau), { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2.4, life: 0.7 + Math.random() * 0.5, s0: 0.5, s1: 0, tint: col, add: true, rot: a, vr: 5 });
    }
  }
}

// ── DENSITÉ : le surplus de messages devient poussière lumineuse ─────────────────────────────────────────────────
export class Densite {
  private attente = 0;
  private readonly ctx: Contexte;
  constructor(ctx: Contexte) { this.ctx = ctx; }
  surplus(n: number): void { this.attente += n; }
  avancer(): void {
    const { pBack, kit, theme, W, H } = this.ctx;
    const n = Math.min(Math.round(this.attente * 1.5), 12);
    this.attente = 0;
    if (pBack.charge > 0.85) return;
    for (let i = 0; i < n; i++) {
      const gauche = Math.random() < 0.5;
      const x = gauche ? Math.random() * W * 0.22 : W * 0.78 + Math.random() * W * 0.22;
      const tex = Math.random() < 0.35 ? kit.tex.etoile : kit.tex.point;
      pBack.lancer(tex, Math.random() < 0.6 ? x : Math.random() * W, H + 20 - Math.random() * 120, {
        vy: -(110 + Math.random() * 240), life: 2.4 + Math.random() * 2, s0: 0.12 + Math.random() * 0.22, s1: 0.05, a0: 0.8, tint: hasard(theme.palette),
        wa: 14 + Math.random() * 30, wf: 1 + Math.random() * 2.5, ph: Math.random() * 6, add: tex === kit.tex.etoile, rot: Math.random() * 3,
      });
    }
  }
}

/** RÉVÉLATION DE VOTE : gerbe d'étoiles, de points et d'emojis autour du gagnant, secousse et éclair. */
export function explosionVote(ctx: Contexte, x: number, y: number, couleur: number): void {
  const { kit, theme, pFront } = ctx;
  ctx.secouer(18); ctx.eclair(couleur, 0.3);
  const teintes = [couleur, theme.rampe[0], theme.rampe[1], NEUTRE, theme.cy];
  for (let i = 0; i < 110; i++) {
    const a = Math.random() * Math.PI * 2, sp = 240 + Math.random() * 760;
    pFront.lancer(i % 3 ? kit.tex.point : kit.tex.etoile, x, y, {
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, ay: 520, drag: 1.4, life: 1.2 + Math.random() * 1.2, s0: 0.5 + Math.random() * 0.5, s1: 0.2,
      tint: teintes[i % 5], add: i % 3 === 0, rot: a, vr: 6,
    });
  }
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, sp = 300 + Math.random() * 420;
    pFront.lancer(kit.emoji(i % 2 ? '🎉' : '✨'), x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, ay: 480, drag: 1.5, life: 1.6 + Math.random(), s0: 0.9, s1: 0.5 });
  }
  pFront.lancer(kit.tex.halo, x, y, { life: 0.5, s0: 2, s1: 9, a0: 0.9, tint: couleur, add: true, fin: 0 });
}
