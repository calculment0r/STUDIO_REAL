// Placement des moments sur la conduite : les positions du moteur (planifier de @studio-real/modele, port de `sched()`).
// Logique pure, testée dans planning.test.ts.
//
// Chaque moment dure le parcours prévu de ses étapes : on suit, depuis l'étape d'entrée, la sortie qui se remplit
// la première d'après la salle simulée (projet.sens) ; une étape dure au moins sa durée prévue. Entre deux moments,
// le passage attend que ses conditions soient remplies (pointillés), puis, s'il est « go », l'attente du top régie
// mesurée pendant la lecture (projet.hold, hachurée).
import { dureeEtape, planifier as planifierModele, type Condition, type Etape, type Moment, type Passage, type Projet, type SalleSimulee, type Sortie } from '@studio-real/modele';

export interface Course { st: Etape; S: number; E: number; tr: Sortie | null; bloque: boolean }
export interface PlanMoment { ev: Moment; i: number; S: number; E: number; run: Course[] }
export interface PlanPassage {
  ev: Moment; i: number; g: Passage;
  /** fin du moment */ S: number;
  /** conditions remplies */ ready: number;
  /** passage franchi (ready + attente du top) */ pass: number;
  /** attente mesurée du top (s) */ hold: number;
  /** premier passage « go » sans top : la conduite s'y arrête */ pend: boolean;
}
export interface Plan { evs: PlanMoment[]; gates: PlanPassage[]; total: number; planned: number; issue: string }

const INFINI = 1e9;

/** Votes simulés d'après le rotatif « penchant » de la salle (le design). */
export function votes(sens: SalleSimulee): { A: number; B: number; C: number } {
  const A = Math.round(28 + sens.pen * 0.4), C = 12;
  return { A, B: 100 - A - C, C };
}
export function issueSimulee(sens: SalleSimulee): string {
  const v = votes(sens);
  return v.A > v.B + 4 ? 'A' : v.B > v.A + 4 ? 'B' : 'T';
}

export interface Signal { val: (t: number) => number; cross: (v: number) => number }

/** Signaux de la salle simulée, en fonction du temps passé dans l'étape (le design, `SN`). */
export function signal(k: string, s: SalleSimulee): Signal {
  const E = Math.exp, Lg = Math.log;
  if (k === 'pres') { const T = 40 + (100 - s.aff) * 2.2; return { val: (t) => 142 * (1 - E(-t / T)), cross: (v) => (v >= 142 ? INFINI : -T * Lg(1 - v / 142)) }; }
  if (k === 'quorum') { const T = 20 + (100 - s.part) * 1.2; return { val: (t) => 100 * (1 - E(-t / T)), cross: (v) => (v >= 100 ? INFINI : -T * Lg(1 - v / 100)) }; }
  if (k === 'prets') { const T = 15 + (100 - s.part) * 0.6; return { val: (t) => 100 * (1 - E(-t / T)), cross: (v) => (v >= 100 ? INFINI : -T * Lg(1 - v / 100)) }; }
  if (k === 'bruit') { const T = 10 + (100 - s.calme) * 0.8; return { val: (t) => 32 + 40 * E(-t / T), cross: (v) => (v <= 32 ? INFINI : v >= 72 ? 0 : -T * Lg((v - 32) / 40)) }; }
  return { val: (t) => t, cross: (v) => v };
}

/** Temps (s, dans l'étape) où la condition se remplit. Une condition inconnue (mémoire, assis…) : tout de suite. */
export function franchissement(g: Condition, sens: SalleSimulee, issue: string): number {
  if (g.k === 'issue') return issue === g.v ? 0 : INFINI;
  if (typeof g.v !== 'number') return 0;
  if (g.k === 't' || g.k === 'pres' || g.k === 'quorum' || g.k === 'prets' || g.k === 'bruit') return Math.max(0, signal(g.k, sens).cross(g.v));
  return 0;
}


export function entrees(ev: Moment): string[] {
  return typeof ev.entry === 'string' ? [ev.entry] : Object.values(ev.entry);
}

/**
 * Le plan de la conduite, tiré du moteur (`planifier` de @studio-real/modele) : les mêmes positions que le lecteur,
 * pour que la tête de lecture tombe juste sur les moments. On y ajoute ce que la conduite dessine : le passage « go »
 * où elle s'arrête (premier sans top), et la durée prévue cumulée.
 */
export function planifier(p: Projet): Plan {
  const pl = planifierModele(p);
  const evs: PlanMoment[] = [], gates: PlanPassage[] = [];
  let planned = 0, pending = false;
  pl.moments.forEach((mp, i) => {
    const ev = p.ev[i];
    const run: Course[] = [];
    for (const e of mp.etapes) {
      const st = ev.st.find((x) => x.id === e.id);
      if (!st) continue;
      planned += dureeEtape(st);
      run.push({ st, S: e.debut, E: e.fin, tr: e.sortie, bloque: e.bloque });
    }
    evs.push({ ev, i, S: mp.debut, E: mp.fin, run });
    if (mp.passage) {
      const g: Passage = ev.gate ?? { mode: 'auto', g: [] };
      const pend = g.mode === 'go' && !p.go[ev.id] && !pending;
      if (pend) pending = true;
      gates.push({ ev, i, g, S: mp.passage.debut, ready: mp.passage.pret, pass: mp.passage.fin, hold: mp.passage.attente, pend });
    }
  });
  return { evs, gates, total: pl.total, planned, issue: pl.issue };
}

/** Index du moment qui joue à l'instant t (le dernier commencé ; le premier avant 0). -1 si aucun moment. */
export function indiceMomentA(plan: Plan, t: number): number {
  let k = plan.evs.length ? 0 : -1;
  plan.evs.forEach((e, i) => { if (t >= e.S) k = i; });
  return k;
}

/** Le moment et l'étape qui jouent à t (pour `allerA`). */
export function momentEtapeA(plan: Plan, t: number): { moment: string; etape?: string } | null {
  const i = indiceMomentA(plan, t);
  if (i < 0) return null;
  const e = plan.evs[i];
  let etape: string | undefined = e.run[0]?.st.id;
  e.run.forEach((r) => { if (t >= r.S) etape = r.st.id; });
  return { moment: e.ev.id, etape };
}

/** Début (s) de chaque moment, par id. */
export function debuts(plan: Plan): Record<string, number> {
  const S: Record<string, number> = {};
  plan.evs.forEach((e) => { S[e.ev.id] = e.S; });
  return S;
}

/** La limite la plus proche de t entre deux moments : index d'insertion d'un nouveau moment (0 → n). */
export function limiteProche(plan: Plan, t: number): number {
  if (!plan.evs.length) return 0;
  const i = indiceMomentA(plan, t);
  const e = plan.evs[i];
  if (t < e.S) return i;
  return t - e.S < e.E - t ? i : i + 1;
}

/** Libellé d'une condition, dans le vocabulaire du théâtre (le design, `glab`). */
export function libelleCondition(g: Condition): string {
  if (g.k === 'issue') return 'le public choisit ' + (g.v === 'T' ? 'égalité' : String(g.v));
  const v = typeof g.v === 'number' ? Math.round(g.v) : g.v;
  if (g.k === 'pres') return 'au moins ' + v + ' spectateurs assis';
  if (g.k === 'quorum') return v + ' % des votes reçus';
  if (g.k === 'prets') return v + ' % des téléphones prêts';
  if (g.k === 'bruit') return 'salle calme · ' + g.op + ' ' + v + ' dB';
  if (g.k === 'assis') return v + ' % du public assis';
  if (g.k === 't') { const s = Number(g.v) || 0; return 'après ' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
  if (g.k.startsWith('mem:')) return 'mémoire ' + g.k.slice(4) + ' ' + g.op + ' ' + v;
  return g.k + ' ' + g.op + ' ' + v;
}
