// Profils de spectateurs et population de la salle émulée (rapport 2 §4.4, tableau des profils).
//
// La salle émulée raconte la même histoire que la salle simulée des rotatifs (packages/modele/src/salle.ts) :
// - arrivées : la courbe `pres` (T = 40 + (100 − aff) · 2,2 s) → instant d'arrivée tiré d'une loi exponentielle de
//   moyenne T ;
// - délais de réponse : la courbe `quorum` (T = 20 + (100 − part) · 1,2 s) → les délais de réaction des profils sont
//   multipliés par T(part) / T(50) (1 pour une salle « moyenne », plus vifs quand `part` monte) ; la participation
//   suit le même rotatif ;
// - choix : `votesSalle(pen)` (A, B, C en %) pour le vote « penchant ».
// Les constantes de temps sont relues dans salle.ts (valeurSignal), pas recopiées.
import { CAPACITE_SALLE, valeurSignal, votesSalle, type SalleSimulee } from '@studio-real/modele';
import type { Capacites } from '@studio-real/ui-telephone';
import { entre, exponentielle, repartir } from './alea';
import type { NomProfil, ProfilSpectateur } from './types';

const ANDROID: Capacites = { plateforme: 'android', vibration: true, sonSansGeste: false, pleinEcran: true, wakeLock: true, camera: true, cache: true };
const IPHONE: Capacites = { plateforme: 'ios', vibration: false, sonSansGeste: false, pleinEcran: false, wakeLock: true, camera: true, cache: true };

/** Les six profils du rapport 2 §4.4. */
export const PROFILS: Readonly<Record<NomProfil, ProfilSpectateur>> = {
  rapide: {
    nom: 'rapide', reaction: { medianeS: 1.5, dispersion: 0.5 }, participation: 0.95, visibilite: 1,
    coupures: { parMinute: 0, dureeS: [0, 0] }, rechargementsParMinute: 0, reseau: { rttMs: 40, debitKbps: 20_000, perte: 0 },
    capacites: ANDROID, vote: 'penchant', textes: 'banque', renduMs: 30, videoPreteS: 1,
  },
  lent: {
    nom: 'lent', reaction: { medianeS: 8, dispersion: 0.6 }, participation: 0.8, visibilite: 0.95,
    coupures: { parMinute: 0, dureeS: [0, 0] }, rechargementsParMinute: 0, reseau: { rttMs: 300, debitKbps: 2_000, perte: 0 },
    capacites: { ...ANDROID, wakeLock: false }, vote: 'penchant', textes: 'banque', renduMs: 150, videoPreteS: 12,
  },
  distrait: {
    nom: 'distrait', reaction: { medianeS: 20, dispersion: 0.8 }, participation: 0.4, visibilite: 0.7,
    coupures: { parMinute: 0, dureeS: [0, 0] }, rechargementsParMinute: 0, reseau: { rttMs: 80, debitKbps: 10_000, perte: 0 },
    capacites: ANDROID, vote: 'penchant', textes: 'aucun', renduMs: 50, videoPreteS: 2,
  },
  deconnecte: {
    nom: 'deconnecte', reaction: { medianeS: 4, dispersion: 0.6 }, participation: 0.7, visibilite: 0.9,
    coupures: { parMinute: 1 / 3, dureeS: [5, 60] }, rechargementsParMinute: 0.1, reseau: { rttMs: 150, debitKbps: 5_000, perte: 0.01 },
    capacites: ANDROID, vote: 'penchant', textes: 'banque', renduMs: 60, videoPreteS: 4,
  },
  'iphone-muet': {
    nom: 'iphone-muet', reaction: { medianeS: 3, dispersion: 0.5 }, participation: 0.85, visibilite: 0.95,
    coupures: { parMinute: 0, dureeS: [0, 0] }, rechargementsParMinute: 0, reseau: { rttMs: 60, debitKbps: 10_000, perte: 0 },
    capacites: IPHONE, vote: 'penchant', textes: 'banque', renduMs: 40, videoPreteS: 2,
  },
  '4g-salle-pleine': {
    nom: '4g-salle-pleine', reaction: { medianeS: 4, dispersion: 0.5 }, participation: 0.85, visibilite: 0.95,
    coupures: { parMinute: 0, dureeS: [0, 0] }, rechargementsParMinute: 0, reseau: { rttMs: 600, debitKbps: 1_500, perte: 0.03 },
    capacites: ANDROID, vote: 'penchant', textes: 'banque', renduMs: 60, videoPreteS: 8,
  },
};

export const NOMS_PROFILS = Object.keys(PROFILS) as NomProfil[];

/** Mélanges nommés (parts de la population par profil). « soirée » : une vraie salle de 120 à 150 personnes. */
export const MELANGES: Readonly<Record<string, Partial<Record<NomProfil, number>>>> = {
  soiree: { rapide: 35, 'iphone-muet': 25, lent: 12, '4g-salle-pleine': 13, distrait: 10, deconnecte: 5 },
  rapides: { rapide: 100 },
  iphones: { 'iphone-muet': 100 },
  difficile: { '4g-salle-pleine': 35, lent: 25, deconnecte: 20, distrait: 20 },
};
export const NOMS_MELANGES = Object.keys(MELANGES);

export function profil(nom: string | ProfilSpectateur): ProfilSpectateur {
  if (typeof nom !== 'string') return nom;
  const p = (PROFILS as Record<string, ProfilSpectateur>)[nom];
  if (!p) throw new Error(`Profil inconnu : « ${nom} » (connus : ${NOMS_PROFILS.join(', ')}).`);
  return p;
}

/** Population d'un mélange nommé : [{profil, nombre}] dont la somme vaut exactement `nombre`. */
export function population(nombre: number, melange = 'soiree'): { profil: ProfilSpectateur; nombre: number }[] {
  const parts = MELANGES[melange];
  if (!parts) throw new Error(`Mélange inconnu : « ${melange} » (connus : ${NOMS_MELANGES.join(', ')}).`);
  const n = repartir(Math.max(0, Math.floor(nombre)), parts as Record<string, number>);
  return Object.entries(n).filter(([, k]) => k > 0).map(([nom, k]) => ({ profil: profil(nom), nombre: k }));
}

// ── Les rotatifs ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Constante de temps d'une montée 1 − e^(−t/T) relue dans salle.ts (valeur à t = 10 s). */
function constante(k: 'pres' | 'quorum', sens: SalleSimulee): number {
  const max = k === 'pres' ? CAPACITE_SALLE : 100;
  const v = valeurSignal(k, sens, 10);
  return v > 0 && v < max ? -10 / Math.log(1 - v / max) : 1;
}

/** T de la courbe des présents (s) : 40 + (100 − aff) · 2,2. */
export const tempsPresence = (sens: SalleSimulee): number => constante('pres', sens);
/** T de la courbe du quorum (s) : 20 + (100 − part) · 1,2. */
export const tempsQuorum = (sens: SalleSimulee): number => constante('quorum', sens);

/** Facteur des délais de réaction tiré du rotatif `part` (1 pour part = 50). */
export const facteurReaction = (sens: SalleSimulee): number => tempsQuorum(sens) / tempsQuorum({ ...sens, part: 50 });
/** Participation effective d'un profil selon le rotatif `part` (part = 50 : celle du profil). */
export const participation = (p: ProfilSpectateur, sens: SalleSimulee): number =>
  Math.max(0, Math.min(1, p.participation * (0.75 + sens.part / 200)));

/** Poids des réponses du vote « penchant » (A, B, C de votesSalle). */
export const poidsPenchant = (sens: SalleSimulee): Record<string, number> => ({ ...votesSalle(sens) });

/** Instant d'arrivée (ms depuis le début) d'un téléphone. */
export function instantArrivee(rnd: () => number, sens: SalleSimulee, mode: 'salle' | 'toutes' | { surS: number }): number {
  if (mode === 'toutes') return Math.round(entre(rnd, 0, 2000));
  if (typeof mode === 'object') return Math.round(entre(rnd, 0, Math.max(0, mode.surS) * 1000));
  const T = tempsPresence(sens);
  return Math.round(Math.min(5 * T, exponentielle(rnd, T)) * 1000);
}

// ── Textes ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Banque de phrases du public émulé (courtes, comme au prototype). */
export const BANQUE_TEXTES: readonly string[] = [
  'trop fort', 'je suis pas d’accord', 'on veut la suite', 'c’est flippant', 'il ment', 'bravo', 'encore !', 'non mais sérieux',
  'je vote pour lui', 'qui a coupé le son ?', 'la ministre a raison', 'il faut le dire', 'je reste abonné', 'désabonné, ciao',
  'c’est du direct ?', 'on est 120 ce soir', 'Junon présidente', 'l’IA nous écoute', 'je comprends rien', 'magnifique',
];

const PRENOMS = ['zoe', 'lucas', 'ines', 'mathis', 'camille', 'nour', 'hugo', 'lea', 'theo', 'manon', 'yanis', 'jade', 'rayan', 'sacha', 'anais', 'malo', 'louise', 'gaspard', 'lina', 'nino'];

/** Pseudo d'un téléphone émulé : stable pour un index donné. */
export const pseudoEmule = (index: number): string => `${PRENOMS[index % PRENOMS.length]}_${String(index).padStart(3, '0')}`;
