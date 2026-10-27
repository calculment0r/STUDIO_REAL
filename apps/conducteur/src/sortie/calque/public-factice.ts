// Faux public pour répéter la sortie sans téléphones (touche D de la sortie, ou ?demo=1). Pseudos stables (graine
// fixe), messages français, réactions, likes, rafales. Porté de prototypes/scene-pops/crowd.js.
import { EMOJIS } from './kit';

export function mulberry32(graine: number): () => number {
  let s = graine;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRENOMS = ['Zoé', 'Lucas', 'Inès', 'Mathis', 'Camille', 'Nour', 'Hugo', 'Léa', 'Théo', 'Manon', 'Yanis', 'Capucine', 'Jade', 'Rayan', 'Eliott', 'Sacha', 'Anaïs', 'Malo', 'Louise', 'Gaspard'];
const SUFFIXES = ['_92', '_gaming', 'TV', '_off', '2000', 'LeBoss', '_du_13', '_xx', '_lol', '77', '_cine', 'Fan', '_bzh', '_zen', '31', 'Max'];
const MESSAGES = [
  'MDRRRR', 'trop fort !!', 'GO GO GO', 'il est où le chat ?', 'je pleure de rire', 'Allez, à gauche !', 'non mais regardez derrière lui',
  'on veut la boulangerie !', 'le parc le parc le parc', 'Bonjour de Lyon', 'premier !', 'la lumière est incroyable', 'je suis dans la salle, coucou',
  'quelqu\'un a vu ça ??', 'bravo l\'artiste', 'encore encore encore', 'il va tomber…', 'c\'est de la folie', 'n\'ouvre pas cette porte',
  'trop de suspense', 'quelle ambiance ce soir', 'retourne-toi !!', 'team boulangerie', 'le métro, évidemment', 'on veut un bis', 'je suis scotché',
  'C\'est du théâtre en direct et c\'est magnifique de le vivre ensemble ce soir',
];

export interface Rappels {
  message: (m: { auteur: string; texte: string; emoji?: string }) => void;
  reaction: (emoji: string) => void;
  coeur: () => void;
}

export class PublicFactice {
  debit = 12;
  private readonly rnd: () => number;
  private readonly pseudos: string[] = [];
  private acc = { m: 0, r: 0, c: 0 };
  private file: { t: number; fn: () => void }[] = [];
  private temps = 0; private prochaineRafale = 5;
  private readonly rappels: Rappels;
  constructor(rappels: Rappels, graine = 20261026) {
    this.rappels = rappels;
    this.rnd = mulberry32(graine);
    const vus = new Set<string>();
    while (this.pseudos.length < 64) {
      const n = PRENOMS[(this.rnd() * PRENOMS.length) | 0] + SUFFIXES[(this.rnd() * SUFFIXES.length) | 0];
      if (!vus.has(n)) { vus.add(n); this.pseudos.push(n); }
    }
  }

  private pseudo() { return this.pseudos[(this.rnd() * this.pseudos.length) | 0]; }
  private emoji() { return EMOJIS[(this.rnd() * EMOJIS.length) | 0]; }

  rafale(emoji: string, n = 60, duree = 1.8): void {
    for (let i = 0; i < n; i++) this.file.push({ t: this.temps + (i / n) * duree, fn: () => this.rappels.reaction(emoji) });
  }

  avancer(dt: number): void {
    this.temps += dt;
    if (this.file.length) {
      const reste: typeof this.file = [];
      for (const q of this.file) { if (q.t <= this.temps) q.fn(); else reste.push(q); }
      this.file = reste;
    }
    if (this.temps > this.prochaineRafale) { this.rafale(this.emoji(), 36 + ((this.rnd() * 40) | 0), 1.4 + this.rnd()); this.prochaineRafale = this.temps + 9 + this.rnd() * 9; }
    const j = () => 0.7 + this.rnd() * 0.6;
    this.acc.m += this.debit * dt * j();
    this.acc.r += this.debit * 1.6 * dt * j();
    this.acc.c += this.debit * 1.2 * dt * j();
    while (this.acc.m >= 1) {
      this.acc.m--;
      this.rappels.message({ auteur: this.pseudo(), texte: MESSAGES[(this.rnd() * MESSAGES.length) | 0], ...(this.rnd() < 0.28 ? { emoji: this.emoji() } : {}) });
    }
    while (this.acc.r >= 1) { this.acc.r--; this.rappels.reaction(this.emoji()); }
    while (this.acc.c >= 1) { this.acc.c--; this.rappels.coeur(); }
  }
}
