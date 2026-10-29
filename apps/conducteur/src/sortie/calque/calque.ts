// Calque de réactions de la sortie écran scène : UN canevas PixiJS 8 transparent au-dessus de la vidéo
// (docs/etudes/ecran-scene-animations.md §1). Porté de prototypes/scene-pops/scene.js en module : pas de panneau,
// pilotage par les événements du canal (pops, danmaku, vedette, réactions, cœurs, fusées, jauge, révélation de vote)
// et par le gabarit de la séquence. Chargé à la demande (import dynamique) : pixi.js n'entre pas dans la régie.
import { Application, Container, Graphics } from 'pixi.js';
import type { EvenementScene, Gabarit } from '../protocole';
import { Coeurs, Danmaku, Densite, explosionVote, FeuxEmojis, Jauge, Pops, Vedette, type Contexte, type MessagePublic, type NomCouche } from './effets';
import { EMOJIS, Kit, Particules, type Rect } from './kit';
import { PublicFactice } from './public-factice';
import { hachage, lireTheme, parseCss, versHex } from './theme';

const HAUTEUR = 1080;
/** Délai avant d'arrêter la boucle d'un calque devenu invisible : le fondu de sortie.css (`.so-calque`) dure 500 ms. */
const DELAI_SUSPENSION_MS = 600;

interface Reglages { pops: boolean; danmaku: boolean; feux: boolean; coeurs: boolean; jauge: boolean; plafond: number }
export const GABARITS_EFFETS: Record<Gabarit, Reglages> = {
  calme: { pops: true, danmaku: false, feux: true, coeurs: true, jauge: false, plafond: 5 },
  chat: { pops: true, danmaku: true, feux: true, coeurs: true, jauge: true, plafond: 9 },
  folie: { pops: true, danmaku: true, feux: true, coeurs: true, jauge: true, plafond: 14 },
  vote: { pops: false, danmaku: false, feux: true, coeurs: true, jauge: false, plafond: 3 },
  entracte: { pops: true, danmaku: false, feux: true, coeurs: true, jauge: false, plafond: 4 },
};

export class CalqueReactions {
  private app!: Application;
  private ctx!: Contexte;
  private monde!: Container;
  private eclairG!: Graphics;
  private pops!: Pops; private danmaku!: Danmaku; private vedette!: Vedette; private coeurs!: Coeurs;
  private feux!: FeuxEmojis; private jauge!: Jauge; private densite!: Densite;
  private reglages: Reglages = { ...GABARITS_EFFETS.chat };
  private file: { m: MessagePublic; t: number; style?: 'pop' | 'danmaku' }[] = [];
  private jetons = 0;
  private vus = new Map<string, number>();
  private secousse = 0; private eclairA = 0;
  private zoneFrac: Rect | null = { x: 0.35, y: 0.08, w: 0.3, h: 0.56 };
  private demo: PublicFactice | null = null;
  private readonly hote: HTMLElement;
  private readonly cibleSecousse: HTMLElement | null;
  /** Ticker arrêté parce que le calque est invisible (voir regulerTicker). */
  private suspendu = false;
  private observateur: MutationObserver | null = null;
  private minuteurSuspension: ReturnType<typeof setTimeout> | undefined;

  private constructor(hote: HTMLElement, cibleSecousse: HTMLElement | null) { this.hote = hote; this.cibleSecousse = cibleSecousse; }

  /** Crée le calque dans `hote` (plein cadre) ; `cibleSecousse` reçoit le tremblement (transform CSS). */
  static async creer(hote: HTMLElement, cibleSecousse: HTMLElement | null = null): Promise<CalqueReactions> {
    const c = new CalqueReactions(hote, cibleSecousse);
    await c.init();
    return c;
  }

  private async init(): Promise<void> {
    const theme = lireTheme();
    this.app = new Application();
    await this.app.init({
      resizeTo: this.hote, backgroundAlpha: 0, antialias: false, autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2), powerPreference: 'high-performance',
    });
    this.hote.appendChild(this.app.canvas);
    const kit = new Kit(theme);
    await kit.init();
    this.monde = new Container();
    this.app.stage.addChild(this.monde);
    const couches = {} as Record<NomCouche, Container>;
    for (const n of ['back', 'danmaku', 'bubbles', 'fx', 'front', 'hud', 'flash'] as NomCouche[]) { couches[n] = new Container(); this.monde.addChild(couches[n]); }
    const additif = (p: Container) => { const c = new Container(); p.addChild(c); return c; };
    const pBack = new Particules(couches.back, additif(couches.back), 1000);
    const pFront = new Particules(couches.front, additif(couches.front), 1300);
    this.eclairG = new Graphics();
    this.eclairG.alpha = 0;
    couches.flash.addChild(this.eclairG);
    this.ctx = {
      kit, theme, couches, pBack, pFront, W: 1920, H: HAUTEUR, temps: 0, zone: null, eviter: {},
      rectsAEviter() { return [this.zone, ...Object.values(this.eviter)].filter((r): r is Rect => !!r); },
      secouer: (a) => { this.secousse = Math.max(this.secousse, a); },
      eclair: (couleur, a) => { this.eclairG.tint = couleur; this.eclairA = Math.max(this.eclairA, Math.min(a, 0.3)); },
      couleurPseudo: (nom) => theme.palette[hachage(nom) % theme.palette.length],
    };
    this.pops = new Pops(this.ctx); this.danmaku = new Danmaku(this.ctx); this.vedette = new Vedette(this.ctx);
    this.coeurs = new Coeurs(this.ctx); this.feux = new FeuxEmojis(this.ctx); this.jauge = new Jauge(this.ctx); this.densite = new Densite(this.ctx);
    this.disposer();
    this.appliquer();
    this.app.ticker.add((tk) => this.image(Math.min(tk.deltaMS / 1000, 1 / 20)));
    // La page de sortie cache le calque en posant l'opacité de son conteneur (pas d'appel à afficher()) : on l'observe,
    // sans rien lire à chaque image, pour arrêter la boucle PixiJS tant qu'il est invisible.
    if (typeof MutationObserver !== 'undefined') {
      this.observateur = new MutationObserver(() => this.regulerTicker());
      this.observateur.observe(this.hote, { attributes: true, attributeFilter: ['style'] });
      this.observateur.observe(this.app.canvas, { attributes: true, attributeFilter: ['style'] });
    }
    this.regulerTicker();
  }

  /** Le calque est-il montré ? Opacité posée par la page de sortie sur son conteneur, ou par afficher() sur le canevas. */
  private estVisible(): boolean {
    const opacite = (e: HTMLElement) => (e.style.opacity === '' ? 1 : Number(e.style.opacity));
    return !(opacite(this.hote) <= 0 || opacite(this.app.canvas) <= 0);
  }

  /**
   * Boucle PixiJS (mise à jour des effets ET dessin, 2 appels par image : 120 appels/s mesurés, audit de fluidité 07, cause 7)
   * arrêtée tant que le calque est invisible, relancée dès qu'il est montré. Pendant l'arrêt, les événements du public sont
   * ignorés (personne ne les verrait, et ils se déverseraient en rafale au retour) ; les effets en vol reprennent où ils étaient.
   */
  private regulerTicker(): void {
    if (this.estVisible()) {
      clearTimeout(this.minuteurSuspension);
      this.minuteurSuspension = undefined;
      if (this.suspendu) { this.suspendu = false; this.app.ticker.start(); }
      return;
    }
    if (this.suspendu || this.minuteurSuspension !== undefined) return;
    // le calque s'efface en fondu (500 ms, sortie.css) : on n'arrête la boucle qu'une fois l'effacement fini
    this.minuteurSuspension = setTimeout(() => {
      this.minuteurSuspension = undefined;
      if (this.estVisible() || this.suspendu) return;
      this.suspendu = true;
      this.app.ticker.stop();
    }, DELAI_SUSPENSION_MS);
  }

  private lw = 0; private lh = 0;
  private disposer(): void {
    const W = this.app.screen.width, H = this.app.screen.height;
    this.lw = W; this.lh = H;
    const S = H / HAUTEUR;
    this.monde.scale.set(S);
    this.ctx.W = W / S; this.ctx.H = HAUTEUR;
    const z = this.zoneFrac;
    const m = 36;
    this.ctx.zone = z ? { x: z.x * this.ctx.W - m, y: z.y * HAUTEUR - m, w: z.w * this.ctx.W + 2 * m, h: z.h * HAUTEUR + 2 * m } : null;
    this.ctx.pBack.zone = this.ctx.pFront.zone = this.ctx.zone;
    this.danmaku.disposer();
    const g = this.eclairG.clear().rect(-50, -50, this.ctx.W + 100, this.ctx.H + 100).fill(0xffffff);
    if (this.ctx.zone) g.rect(this.ctx.zone.x, this.ctx.zone.y, this.ctx.zone.w, this.ctx.zone.h).cut();
  }

  private appliquer(): void { this.jauge.activer(this.reglages.jauge); this.pops.cap = this.reglages.plafond + 5; }

  /** Gabarit de la séquence (calme, chat, folie, vote, entracte). */
  gabarit(g: Gabarit): void { this.reglages = { ...GABARITS_EFFETS[g] }; this.appliquer(); }

  /** Zone protégée (visage du streamer), en fractions de l'écran ; null = aucune. */
  zoneProtegee(z: Rect | null): void { this.zoneFrac = z; this.disposer(); }

  /** Montre ou cache le calque (caché, la boucle PixiJS est arrêtée : voir regulerTicker). */
  afficher(v: boolean): void { this.app.canvas.style.opacity = v ? '1' : '0'; this.regulerTicker(); }

  /** Faux public (répétition sans téléphones). */
  basculerDemo(v = !this.demo): boolean {
    this.demo = v ? new PublicFactice({
      message: (m) => this.pousser(m),
      reaction: (e) => { this.jauge.ajouter(0.4); if (this.reglages.feux) this.feux.taper(e); },
      coeur: () => { this.jauge.ajouter(0.25); if (this.reglages.coeurs) this.coeurs.aimer(); },
    }) : null;
    return !!this.demo;
  }

  /** Explosion de révélation à une position (fractions de l'écran) et d'une couleur CSS (jeton résolu). */
  celebrer(xf: number, yf: number, couleurCss: string): void {
    const p = parseCss(couleurCss);
    explosionVote(this.ctx, xf * this.ctx.W, yf * HAUTEUR, p ? versHex(p) : this.ctx.theme.ort);
  }

  private pousser(m: MessagePublic, style?: 'pop' | 'danmaku') {
    this.jauge.ajouter(1);
    this.file.push({ m, t: this.ctx.temps, ...(style ? { style } : {}) });
    if (this.file.length > 160) { this.file.shift(); this.densite.surplus(1); }
  }

  /** Événement du public venu de la régie. */
  recevoir(ev: EvenementScene): void {
    if (this.suspendu && ev.type !== 'gabarit') return;   // calque invisible : boucle arrêtée, rien à montrer
    switch (ev.type) {
      case 'pop':
        if (ev.style === 'vedette') this.vedette.montrer({ auteur: ev.auteur, texte: ev.texte });
        else this.pousser({ auteur: ev.auteur, texte: ev.texte.slice(0, 80), ...(ev.emoji ? { emoji: ev.emoji } : {}) }, ev.style);
        break;
      case 'reaction': {
        const n = Math.min(60, Math.max(1, Math.round(ev.n ?? 1)));
        for (let i = 0; i < n; i++) { this.jauge.ajouter(0.4); if (this.reglages.feux) this.feux.taper(ev.emoji); }
        break;
      }
      case 'coeurs': this.jauge.ajouter(0.25 * ev.n); if (this.reglages.coeurs) this.coeurs.aimer(Math.min(200, ev.n)); break;
      case 'fusee': this.feux.lancer(ev.emoji, true); break;
      case 'gabarit': this.gabarit(ev.gabarit); break;
      default: break;   // vote, résultats, alerte : traités par la page (scène de vote, témoin)
    }
  }

  private afficherMessage(m: MessagePublic, style?: 'pop' | 'danmaku'): boolean {
    const r = this.reglages;
    const long = m.texte.length > 46;
    const versD = style === 'danmaku' || (style !== 'pop' && r.danmaku && (!r.pops || Math.random() < (long ? 0.08 : 0.45)));
    for (const k of versD ? ['d', 'p'] : ['p', 'd']) {
      if (k === 'p' && r.pops && this.pops.ajouter(m)) return true;
      if (k === 'd' && r.danmaku && this.danmaku.ajouter(m)) return true;
    }
    return false;
  }

  /** Plafond d'affichage : seau à jetons ; priorité aux nouveaux auteurs, aux mentions, aux messages courts. */
  private pompe(dt: number): void {
    const cap = this.reglages.plafond;
    this.jetons = Math.min(cap * 0.5 + 1, this.jetons + cap * dt);
    const b = this.file, now = this.ctx.temps;
    while (b.length && now - b[0].t > 1.2) { b.shift(); this.densite.surplus(1); }
    while (this.jetons >= 1 && b.length) {
      let best = 0, bs = -1;
      for (let i = 0; i < Math.min(b.length, 40); i++) {
        const { m, t } = b[i];
        const neuf = now - (this.vus.get(m.auteur) ?? -99) > 25;
        const s = (neuf ? 3 : 0) + (m.texte[0] === '@' ? 1 : 0) + (m.texte.length < 40 ? 0.3 : 0) + (now - t) * 0.8 + Math.random() * 0.6;
        if (s > bs) { bs = s; best = i; }
      }
      const { m, style } = b.splice(best, 1)[0];
      this.jetons -= 1;
      if (this.afficherMessage(m, style)) this.vus.set(m.auteur, now); else this.densite.surplus(1);
    }
  }

  private image(dt: number): void {
    this.ctx.temps += dt;
    if (this.app.screen.width !== this.lw || this.app.screen.height !== this.lh) this.disposer();
    this.demo?.avancer(dt);
    this.pompe(dt);
    this.pops.avancer(); this.danmaku.avancer(dt); this.vedette.avancer(); this.coeurs.avancer(dt); this.feux.avancer(dt);
    this.jauge.avancer(dt); this.densite.avancer();
    this.ctx.pBack.avancer(dt); this.ctx.pFront.avancer(dt);
    const cible = this.cibleSecousse;
    if (this.secousse > 0.3) {
      const a = this.secousse * (this.lh / HAUTEUR);
      if (cible) cible.style.transform = `translate(${((Math.random() - 0.5) * a).toFixed(1)}px,${((Math.random() - 0.5) * a).toFixed(1)}px)`;
      this.secousse *= Math.exp(-dt * 7);
    } else if (this.secousse !== 0) { this.secousse = 0; if (cible) cible.style.transform = ''; }
    if (this.eclairA > 0.005) { this.eclairG.alpha = this.eclairA; this.eclairA *= Math.exp(-dt * 5); } else { this.eclairA = 0; this.eclairG.alpha = 0; }
  }

  /** Une rafale d'emojis (essai). */
  rafale(): void { const e = EMOJIS[(Math.random() * EMOJIS.length) | 0]; for (let i = 0; i < 40; i++) this.feux.taper(e); }

  detruire(): void {
    this.observateur?.disconnect();
    clearTimeout(this.minuteurSuspension);
    this.pops.vider(); this.danmaku.vider();
    try { this.app.destroy(true, { children: true }); } catch { /* déjà détruit */ }
  }
}
