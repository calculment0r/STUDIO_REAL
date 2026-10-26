// crowd.js : générateur de faux public. Pseudos stables (graine fixe), messages français variés,
// débit réglable (1 à 60 messages/s), réactions emoji, likes, rafales, votes.

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const EMOJIS = ['😂', '🔥', '👏', '😮', '🎉', '💀', '😍', '🥹', '✨', '💜', '🫶', '🤯'];

const PREFIX = ['Zoé', 'Lucas', 'Inès', 'Mathis', 'Camille', 'Nour', 'Hugo', 'Léa', 'Théo', 'Manon', 'Yanis', 'Capucine', 'Jade', 'Rayan', 'Eliott',
  'Sacha', 'Anaïs', 'Malo', 'Louise', 'Gaspard', 'Maëlys', 'Tom', 'Clara', 'Ilyes', 'Océane', 'Paul', 'Salomé', 'Noé', 'Elsa', 'Victor'];
const SUFFIX = ['_92', '_gaming', 'TV', '_off', '2000', 'LeBoss', '_du_13', 'Official', '_xx', '_lol', '77', '_cine', 'Tonic', '_pastis', 'Fan',
  '_bzh', 'Prod', '_zen', '31', 'Max', '_chaton', 'DJ', '_74', 'Ninja', '_cafe'];
const NICKS = ['MamieGaming', 'LeCroissantMasqué', 'xX_Licorne_Xx', 'PetitPoney', 'ChatonGrincheux', 'Baguette_Man', 'RaclettePartie', 'SuperNanard',
  'Tonton_Michel', 'Mme_Pop', 'LaBrioche', 'CaptainCrêpe', 'FromageSec', 'DocteurMoustache', 'Pingouin44', 'TeamRocket_FR'];

// Pas d'emoji dans le texte : les emojis sont des sprites (voir kit.js).
const MESSAGES = [
  'MDRRRR', 'trop fort !!', 'GO GO GO', 'Zoé t\'es où ??', 'il est où le chat ?', 'je pleure de rire', 'Allez, à gauche !', 'non mais regardez derrière lui',
  'c\'est quoi ce bruit ?', 'on veut la boulangerie !', 'le parc le parc le parc', 'Bonjour de Lyon', 'Salut depuis Nantes', 'premier !', 'on se calme',
  'il est vivant ce stream ?', 'la lumière est incroyable', 'je suis dans la salle, coucou', 'quelqu\'un a vu ça ??', 'j\'ai eu peur', 'ça tremble tout',
  'bravo l\'artiste', 'encore encore encore', 'il va tomber…', 'on lâche rien', 'c\'est de la folie', 'lis mon message stp', 'vas-y entre !', 'n\'ouvre pas cette porte',
  'ça sent le piège', 'moi je dis oui', 'moi je dis non', 'trop de suspense', 'ma voisine hurle', 'quelle ambiance ce soir', 'qui a coupé le son ?',
  'je ne sens plus mes mains', 'on est tous là !', 'ÇA SE PASSE LÀ', 'génial ce spectacle', 'ouf, j\'ai cru que…', 'retourne-toi !!', 'attention derrière',
  'il est trop mignon', 'petit coup de stress', 'c\'est écrit à l\'avance non ?', 'chut, on écoute', 'je vote pour le métro', 'team boulangerie', 'team parc',
  'le métro, évidemment', 'quelle fin de soirée', 'j\'adore cette énergie', 'filme le ciel !', 'on veut un bis', 'salut la famille', 'encore une minute !',
  'sublime, vraiment', 'je suis scotché', 'tout le monde debout !', 'envoyez les confettis', 'allumez les lumières', 'je crois que j\'ai rêvé',
  'C\'est du théâtre en direct et c\'est magnifique de le vivre ensemble ce soir',
  'Merci à toute l\'équipe, on ne s\'attendait pas du tout à ça !',
  'Quelqu\'un doit lui dire de se retourner, il y a quelque chose là-bas',
  'Je crois que la salle entière retient son souffle, c\'est incroyable',
];

const FEATURED = [
  'Est-ce que tu entends la salle respirer ?', 'Dis-nous ce que tu vois derrière la porte !', 'On est avec toi, vas-y, ouvre.',
  'Cette soirée, on s\'en souviendra longtemps.',
];

export class Crowd {
  constructor(seed = 20261026, nUsers = 96) {
    this.rnd = mulberry32(seed);
    this.rate = 20;             // messages / s
    this.reactionRatio = 1.6;   // taps emoji par message
    this.likeRatio = 1.2;       // likes par message
    this.autoBursts = true;
    this.paused = false;
    this.users = [];
    const used = new Set();
    while (this.users.length < nUsers) {
      const r = this.rnd();
      let name;
      if (r < 0.2) name = NICKS[Math.floor(this.rnd() * NICKS.length)] + (this.rnd() < 0.5 ? '' : Math.floor(this.rnd() * 99));
      else name = PREFIX[Math.floor(this.rnd() * PREFIX.length)] + SUFFIX[Math.floor(this.rnd() * SUFFIX.length)];
      if (used.has(name)) continue;
      used.add(name);
      this.users.push({ id: this.users.length, name, ci: hashStr(name) });
    }
    this._accMsg = 0; this._accRea = 0; this._accLike = 0;
    this._queue = [];           // événements différés (rafales, votes)
    this._time = 0;
    this._nextBurst = 6;
    this.onMessage = this.onReaction = this.onLike = this.onVote = () => {};
  }

  user() { return this.users[Math.floor(this.rnd() * this.users.length)]; }

  makeText() {
    let t = MESSAGES[Math.floor(this.rnd() * MESSAGES.length)];
    if (this.rnd() < 0.08) t = '@' + this.user().name + ' ' + t;
    if (t.length > 80) t = t.slice(0, 79) + '…';
    return t;
  }

  featuredMessage() { return { user: this.user(), text: FEATURED[Math.floor(this.rnd() * FEATURED.length)] }; }

  /** rafale : n taps du même emoji répartis sur `dur` secondes */
  burst(emoji, n = 60, dur = 1.8) {
    for (let i = 0; i < n; i++) {
      const u = this.user();
      this._queue.push({ t: this._time + (i / n) * dur + this.rnd() * 0.05, fn: () => this.onReaction({ user: u, emoji }) });
    }
  }

  /** vote : `n` votes répartis sur `dur` secondes, selon des poids */
  vote(weights, n = 240, dur = 6) {
    const sum = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n; i++) {
      let r = this.rnd() * sum, opt = 0;
      while (opt < weights.length - 1 && r > weights[opt]) { r -= weights[opt]; opt++; }
      const u = this.user();
      const tt = Math.sqrt(this.rnd()) * dur; // plutôt dans les dernières secondes
      this._queue.push({ t: this._time + tt, fn: () => this.onVote({ user: u, option: opt }) });
    }
  }

  update(dt) {
    this._time += dt;
    if (this._queue.length) {
      const keep = [];
      for (const q of this._queue) { if (q.t <= this._time) q.fn(); else keep.push(q); }
      this._queue = keep;
    }
    if (this.paused) return;
    if (this.autoBursts && this._time > this._nextBurst) {
      this.burst(EMOJIS[Math.floor(this.rnd() * EMOJIS.length)], 36 + Math.floor(this.rnd() * 40), 1.4 + this.rnd());
      this._nextBurst = this._time + 9 + this.rnd() * 9;
    }
    const jitter = () => 0.7 + this.rnd() * 0.6;
    this._accMsg += this.rate * dt * jitter();
    this._accRea += this.rate * this.reactionRatio * dt * jitter();
    this._accLike += this.rate * this.likeRatio * dt * jitter();
    while (this._accMsg >= 1) { this._accMsg--; this.onMessage({ user: this.user(), text: this.makeText() }); }
    while (this._accRea >= 1) { this._accRea--; this.onReaction({ user: this.user(), emoji: EMOJIS[Math.floor(this.rnd() * EMOJIS.length)] }); }
    while (this._accLike >= 1) { this._accLike--; this.onLike({ user: this.user() }); }
  }
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
