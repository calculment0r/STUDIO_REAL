// Évaluation des conditions des sorties et des passages.
import type { Condition, Sortie } from './types';
import type { Signaux } from './moteur';
import { memoireEnNombre, normaliserNom } from './blocs-moteur';

/** Signaux numériques de la salle lisibles par une condition. */
export const SIGNAUX_SALLE = ['pres', 'quorum', 'prets', 'bruit', 'assis'] as const;
/** Clés de condition connues (plus 'mem:<nom>'). */
export const CLES_CONDITION = ['t', ...SIGNAUX_SALLE, 'issue'] as const;
export const OPERATEURS: readonly Condition['op'][] = ['≥', '≤', '=', '≠', '>', '<'];

export const estCleCondition = (k: unknown): boolean =>
  typeof k === 'string' && ((CLES_CONDITION as readonly string[]).includes(k) || /^mem:.+/.test(k));

/** Signaux neutres (aucune salle) : utilisés avant le premier appel à avancer(). */
export const SIGNAUX_VIDES: Signaux = { pres: 0, quorum: 0, prets: 0, bruit: 72, assis: 0 };

export interface ContexteCondition {
  /** temps passé dans l'étape (ou le passage) en cours, s */
  tEtape: number;
  signaux: Signaux;
  /** issue retenue au dernier vote (si le signal n'en donne pas) */
  issue?: string;
  memoires: Record<string, number | string | boolean>;
}

/** Valeur courante lue par une condition. */
export function valeurCondition(k: string, ctx: ContexteCondition): number | string | boolean | undefined {
  if (k === 't') return ctx.tEtape;
  if (k === 'issue') return ctx.signaux.issue ?? ctx.issue;
  if (k.startsWith('mem:')) return ctx.memoires[k.slice(4)] ?? 0;
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
