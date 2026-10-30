// Évaluation des conditions des sorties et des passages.
import type { Condition, Projet, Sortie } from './types';
import type { Signaux } from './moteur';
import { memoireEnNombre, normaliserNom } from './blocs-moteur';

/** Signaux numériques de la salle lisibles par une condition. */
export const SIGNAUX_SALLE = ['pres', 'quorum', 'prets', 'bruit', 'assis'] as const;
/** Clés de condition connues (plus 'mem:<nom>', 'sig:<nom>' et 'sigv:<nom>'). */
export const CLES_CONDITION = ['t', ...SIGNAUX_SALLE, 'issue'] as const;
export const OPERATEURS: readonly Condition['op'][] = ['≥', '≤', '=', '≠', '>', '<'];

export const estCleCondition = (k: unknown): boolean =>
  typeof k === 'string' && ((CLES_CONDITION as readonly string[]).includes(k) || /^(mem|sig|sigv):.+/.test(k));

/** Signaux neutres (aucune salle) : utilisés avant le premier appel à avancer(). */
export const SIGNAUX_VIDES: Signaux = { pres: 0, quorum: 0, prets: 0, bruit: 72, assis: 0 };

export interface ContexteCondition {
  /** temps passé dans l'étape (ou le passage) en cours, s */
  tEtape: number;
  signaux: Signaux;
  /** issue retenue au dernier vote (si le signal n'en donne pas) */
  issue?: string;
  memoires: Record<string, number | string | boolean>;
  /** réceptions de chaque signal extérieur depuis l'entrée dans l'étape en cours (nom normalisé → nombre) */
  receptions?: Record<string, number>;
  /** dernière valeur reçue de chaque signal extérieur (nom normalisé → valeur) */
  valeursSignaux?: Record<string, number | string | boolean>;
}

/** Clé d'un signal extérieur : son nom normalisé (casse, accents et espaces ignorés). */
export const cleSignal = (nom: string): string => normaliserNom(nom);

/** Valeur courante lue par une condition. */
export function valeurCondition(k: string, ctx: ContexteCondition): number | string | boolean | undefined {
  if (k === 't') return ctx.tEtape;
  if (k === 'issue') return ctx.signaux.issue ?? ctx.issue;
  if (k.startsWith('mem:')) return ctx.memoires[k.slice(4)] ?? 0;
  if (k.startsWith('sig:')) return ctx.receptions?.[cleSignal(k.slice(4))] ?? 0;
  if (k.startsWith('sigv:')) return ctx.valeursSignaux?.[cleSignal(k.slice(5))] ?? 0;
  if ((SIGNAUX_SALLE as readonly string[]).includes(k)) return ctx.signaux[k as (typeof SIGNAUX_SALLE)[number]];
  return undefined;
}

/** Compare deux valeurs selon un opérateur. Tolérance du design : ≥ v − 0,01 et ≤ v + 0,01. */
export function comparer(op: Condition['op'], a: unknown, b: unknown): boolean {
  if (a === undefined) return false;
  const na = memoireEnNombre(a);
  const nb = memoireEnNombre(b);
  // Deux textes ne se comparent en nombres que s'ils sont tous deux écrits en chiffres ('A' = 'A' reste un texte).
  const chiffres = (x: unknown) => typeof x === 'string' && /^\s*-?\d+([.,]\d+)?\s*$/.test(x);
  const deuxTextes = typeof a === 'string' && typeof b === 'string';
  if (na !== null && nb !== null && (!deuxTextes || (chiffres(a) && chiffres(b)))) {
    switch (op) {
      case '≥': return na >= nb - 0.01;
      case '≤': return na <= nb + 0.01;
      case '>': return na > nb;
      case '<': return na < nb;
      case '=': return Math.abs(na - nb) < 1e-9;
      case '≠': return Math.abs(na - nb) >= 1e-9;
    }
  }
  const sa = normaliserNom(String(a));
  const sb = normaliserNom(String(b));
  if (op === '=') return sa === sb;
  if (op === '≠') return sa !== sb;
  return false;
}

export function conditionRemplie(g: Condition, ctx: ContexteCondition): boolean {
  if (!estCleCondition(g.k)) return false;
  return comparer(g.op, valeurCondition(g.k, ctx), g.v);
}

/** Sortie remplie : sans condition = toujours (le « sinon ») ; 'all' toutes, 'any' au moins une. */
export function sortieRemplie(s: Pick<Sortie, 'g' | 'mode'>, ctx: ContexteCondition): boolean {
  if (!s.g.length) return true;
  return s.mode === 'any' ? s.g.some(g => conditionRemplie(g, ctx)) : s.g.every(g => conditionRemplie(g, ctx));
}

// ── Signaux des acteurs (audit 2026-10, rapport 1 §4.4) ─────────────────────────────────────────────────────────────
// Ce qu'un acteur renvoie entre dans le lecteur par `signal(nom, donnees)` sous le nom « <acteur>.<signal> » :
// 'scene.fin-video', 'ministre.present', 'franck.transcription', 'eco.fin-appel', 'figurants.say'. Les conditions le lisent
// comme tout signal extérieur : 'sig:ministre.present' (réceptions dans l'étape), 'sigv:scene.fin-video' (dernière valeur).

/** Séparateur entre l'acteur et son signal. */
export const SEPARATEUR_SIGNAL = '.';

/** Nom de signal d'un acteur : nomSignalActeur('ministre', 'present') = 'ministre.present'. */
export const nomSignalActeur = (acteur: string, signal: string): string => `${acteur}${SEPARATEUR_SIGNAL}${signal}`;

/** Découpe « <acteur>.<signal> » (au premier point) ; null si le nom n'a pas cette forme. */
export function lireSignalActeur(nom: string): { acteur: string; signal: string } | null {
  if (typeof nom !== 'string') return null;
  const i = nom.indexOf(SEPARATEUR_SIGNAL);
  if (i <= 0 || i >= nom.length - 1) return null;
  return { acteur: nom.slice(0, i).trim(), signal: nom.slice(i + 1).trim() };
}

/** Signal déclaré par un acteur du projet (proposé dans l'onglet « Attend » de l'inspecteur). */
export interface SignalActeur {
  /** nom complet, tel qu'écrit dans une condition après 'sig:' ou 'sigv:' */
  nom: string;
  acteur: string;
  signal: string;
  /** nom affiché de l'acteur */
  acteurNom: string;
}

/** Les signaux que les acteurs du projet déclarent renvoyer, dans l'ordre des acteurs puis de leurs signaux. */
export function signauxDuProjet(projet: Pick<Projet, 'acteurs'>): SignalActeur[] {
  const out: SignalActeur[] = [];
  const vus = new Set<string>();
  for (const a of Array.isArray(projet.acteurs) ? projet.acteurs : []) {
    if (!a || typeof a.id !== 'string' || !a.id || !Array.isArray(a.signaux)) continue;
    for (const s of a.signaux) {
      if (typeof s !== 'string' || !s) continue;
      const nom = nomSignalActeur(a.id, s);
      if (vus.has(cleSignal(nom))) continue;
      vus.add(cleSignal(nom));
      out.push({ nom, acteur: a.id, signal: s, acteurNom: typeof a.nom === 'string' && a.nom ? a.nom : a.id });
    }
  }
  return out;
}
