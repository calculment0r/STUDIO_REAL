// Salle simulée (répétition) : les 4 rotatifs du design produisent les signaux de la salle.
// Formules reprises de la classe Component du design (méthodes SN(), votes(), issue() de
// conception/conducteur/source/Studio Real Conducteur.dc.html) :
//   présents  = 142 · (1 − e^(−t/T)),  T = 40 + (100 − aff) · 2,2
//   quorum    = 100 · (1 − e^(−t/T)),  T = 20 + (100 − part) · 1,2
//   prêts     = 100 · (1 − e^(−t/T)),  T = 15 + (100 − part) · 0,6
//   bruit     = 32 + 40 · e^(−t/T),     T = 10 + (100 − calme) · 0,8      (72 dB → 32 dB)
//   votes     A = round(28 + pen · 0,4), C = 12, B = 100 − A − C ; issue A si A > B + 4, B si B > A + 4, sinon T.
// « assis » n'existe pas dans le design : ajout STUDIO_REAL, part des présents qui sont assis,
//   assis = 100 · (1 − e^(−t/T)), T = 30 + (100 − calme) · 0,9 (une salle calme s'assoit vite).
// t est le temps écoulé dans l'étape (ou dans le passage) en cours, comme dans le design : chaque étape
// repart de zéro (on appelle donc signauxSalle(sens, etat.tEtape)).
// Sans graine, les valeurs sont exactement celles du design ; avec une graine, un léger bruit déterministe
// (fonction de la graine et de la seconde entière) les rend plus vivantes, toujours rejouables.
import type { Condition, SalleSimulee } from './types';
import type { FonctionSignauxSalle, Signaux } from './moteur';

/** Jauge de la salle simulée (nombre maximal de présents), comme le design. */
export const CAPACITE_SALLE = 142;
/** Niveau sonore d'une salle qui entre (dB) et plancher d'une salle silencieuse (dB). */
export const BRUIT_MAX = 72;
export const BRUIT_MIN = 32;
/** Valeur « jamais » des instants de franchissement (le design utilise 1e9). */
export const JAMAIS = 1e9;

const E = Math.exp;
const Lg = Math.log;
const borne = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const tPres = (s: SalleSimulee) => 40 + (100 - s.aff) * 2.2;
const tQuorum = (s: SalleSimulee) => 20 + (100 - s.part) * 1.2;
const tPrets = (s: SalleSimulee) => 15 + (100 - s.part) * 0.6;
const tBruit = (s: SalleSimulee) => 10 + (100 - s.calme) * 0.8;
const tAssis = (s: SalleSimulee) => 30 + (100 - s.calme) * 0.9;

/** Répartition des votes simulés (en %) selon le penchant `pen`. */
export function votesSalle(sens: SalleSimulee): { A: number; B: number; C: number } {
  const A = Math.round(28 + sens.pen * 0.4);
  const C = 12;
  return { A, B: 100 - A - C, C };
}

/** Issue du vote simulé : 'A', 'B' ou 'T' (égalité, écart ≤ 4 points). */
export function issueSalle(sens: SalleSimulee): 'A' | 'B' | 'T' {
  const v = votesSalle(sens);
  return v.A > v.B + 4 ? 'A' : v.B > v.A + 4 ? 'B' : 'T';
}

/** Bruit déterministe dans [−1, 1] pour (graine, seconde, canal). */
function alea(graine: number, seconde: number, canal: number): number {
  let h = (Math.imul(graine | 0, 0x9e3779b1) ^ Math.imul(seconde | 0, 0x85ebca6b) ^ Math.imul(canal, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h / 0xffffffff) * 2 - 1;
}

/** Valeur exacte (sans bruit) d'un signal numérique de la salle simulée à l'instant t. */
export function valeurSignal(k: 'pres' | 'quorum' | 'prets' | 'bruit' | 'assis', sens: SalleSimulee, t: number): number {
  const u = Math.max(0, t);
  switch (k) {
    case 'pres': return CAPACITE_SALLE * (1 - E(-u / tPres(sens)));
    case 'quorum': return 100 * (1 - E(-u / tQuorum(sens)));
    case 'prets': return 100 * (1 - E(-u / tPrets(sens)));
    case 'bruit': return BRUIT_MIN + (BRUIT_MAX - BRUIT_MIN) * E(-u / tBruit(sens));
    case 'assis': return 100 * (1 - E(-u / tAssis(sens)));
  }
}

/** Signaux de la salle simulée à l'instant t (temps dans l'étape), déterministes pour une graine donnée. */
export const signauxSalle: FonctionSignauxSalle = (sens, t, graine) => {
  const s: Signaux = {
    pres: valeurSignal('pres', sens, t),
    quorum: valeurSignal('quorum', sens, t),
    prets: valeurSignal('prets', sens, t),
    bruit: valeurSignal('bruit', sens, t),
    assis: valeurSignal('assis', sens, t),
    issue: issueSalle(sens),
    votes: votesSalle(sens),
  };
  if (graine !== undefined) {
    const sec = Math.floor(Math.max(0, t));
    s.pres = borne(s.pres + 1.5 * alea(graine, sec, 1), 0, CAPACITE_SALLE);
    s.quorum = borne(s.quorum + 1.5 * alea(graine, sec, 2), 0, 100);
    s.prets = borne(s.prets + 1.5 * alea(graine, sec, 3), 0, 100);
    s.bruit = borne(s.bruit + 1 * alea(graine, sec, 4), BRUIT_MIN - 2, BRUIT_MAX + 2);
    s.assis = borne(s.assis + 1.5 * alea(graine, sec, 5), 0, 100);
  }
  // Un nombre de présents est un entier.
  s.pres = Math.round(s.pres);
  return s;
};

/** Inverse d'une montée 1 − e^(−t/T) vers `max` : instant où la valeur atteint v. */
const inverseMontee = (v: number, max: number, T: number) => (v <= 0 ? 0 : v >= max ? JAMAIS : -T * Lg(1 - v / max));

/**
 * Instant (s, depuis le début de l'étape) où une condition sur un signal de la salle simulée devient vraie ;
 * `JAMAIS` si elle ne le devient jamais. Sert au calcul des positions prévues (même logique que cross() du design,
 * généralisée aux opérateurs ≤ / ≥ selon le sens de variation du signal). Les conditions sur 'issue' et 'mem:' ne
 * dépendent pas du temps : elles valent 0 (vraie) ou JAMAIS, à évaluer par l'appelant.
 */
export function instantFranchissement(g: Condition, sens: SalleSimulee): number {
  const v = typeof g.v === 'number' ? g.v : Number(g.v);
  if (!Number.isFinite(v)) return JAMAIS;
  const monte = g.op === '≥' || g.op === '>';
  const descend = g.op === '≤' || g.op === '<';
  switch (g.k) {
    case 't':
      if (monte) return Math.max(0, v);
      if (descend) return v >= 0 ? 0 : JAMAIS;
      return g.op === '=' ? (v >= 0 ? v : JAMAIS) : 0;
    case 'pres': case 'quorum': case 'prets': case 'assis': {
      const max = g.k === 'pres' ? CAPACITE_SALLE : 100;
      const T = g.k === 'pres' ? tPres(sens) : g.k === 'quorum' ? tQuorum(sens) : g.k === 'prets' ? tPrets(sens) : tAssis(sens);
      if (monte) return inverseMontee(v, max, T);
      if (descend) return v >= 0 ? 0 : JAMAIS;
      return JAMAIS;
    }
    case 'bruit': {
      const T = tBruit(sens);
      if (descend) return v <= BRUIT_MIN ? JAMAIS : v >= BRUIT_MAX ? 0 : -T * Lg((v - BRUIT_MIN) / (BRUIT_MAX - BRUIT_MIN));
      if (monte) return v <= BRUIT_MAX ? 0 : JAMAIS;
      return JAMAIS;
    }
    default:
      return JAMAIS;
  }
}
