// Aides pour fabriquer de petits projets dans les tests (non exportées par index.ts).
import type { Condition, Etape, Moment, Passage, Projet, Sortie } from './types';
import type { Signaux } from './moteur';

/** Étape de durée prévue `dur` (multiple de 6 + 10 pour tomber juste). */
export const etape = (id: string, dur = 10, ty = 'k:scene', extra: Partial<Etape> = {}): Etape =>
  ({ id, name: id, ty, c: 0, r: 0, dx: 0, dy: 0, k: [Math.round((dur - 10) / 6), 50, 50], ...extra });
export const cond = (k: string, op: Condition['op'], v: number | string): Condition => ({ k, op, v });
export const sortie = (a: string, b: string, g: Condition[] = [], mode: Sortie['mode'] = 'all', extra: Partial<Sortie> = {}): Sortie =>
  ({ a, b, g, mode, ...extra });
export const moment = (id: string, st: Etape[], tr: Sortie[], gate: Passage = { mode: 'auto', g: [] }, entry: Moment['entry'] = st[0]?.id ?? ''): Moment =>
  ({ id, act: 0, name: id, entry, st, tr, gate });
export const projet = (ev: Moment[], extra: Partial<Projet> = {}): Projet => ({
  acts: [{ n: 'Acte' }], ev, sens: { aff: 50, part: 50, calme: 50, pen: 50 }, hold: {}, go: {}, ver: 1, nid: 100, tracks: [], ...extra,
});
/** Signaux fixes. */
export const sig = (s: Partial<Signaux> = {}): Signaux => ({ pres: 0, quorum: 0, prets: 0, bruit: 72, assis: 0, ...s });
