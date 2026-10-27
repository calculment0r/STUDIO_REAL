// Placement des moments sur la conduite (port de `sched()` du design, conception/conducteur/source/…dc.html).
// Logique pure, testée dans planning.test.ts.
//
// Chaque moment dure le parcours prévu de ses étapes : on suit, depuis l'étape d'entrée, la sortie qui se remplit
// la première d'après la salle simulée (projet.sens) ; une étape dure au moins sa durée prévue. Entre deux moments,
// le passage attend que ses conditions soient remplies (pointillés), puis, s'il est « go », l'attente du top régie
// mesurée pendant la lecture (projet.hold, hachurée).
import { dureeEtape, type Condition, type Etape, type Moment, type Passage, type Projet, type SalleSimulee, type Sortie } from '@studio-real/modele';

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

function tempsSortie(tr: Sortie, sens: SalleSimulee, issue: string): number {
  if (!tr.g.length) return 0;
  const c = tr.g.map((g) => franchissement(g, sens, issue));
  return tr.mode === 'any' ? Math.min(...c) : Math.max(...c);
}

export function entrees(ev: Moment): string[] {
  return typeof ev.entry === 'string' ? [ev.entry] : Object.values(ev.entry);
}

export function planifier(p: Projet): Plan {
  const iss = issueSimulee(p.sens);
  let T = 0, planned = 0;
  let pending: PlanPassage | null = null;
  const evs: PlanMoment[] = [], gates: PlanPassage[] = [];
  p.ev.forEach((ev, i) => {
    const S0 = T, run: Course[] = [];
    let sid: string | undefined = typeof ev.entry === 'string' ? ev.entry : (ev.entry[iss] ?? Object.values(ev.entry)[0]);
    const vu = new Set<string>();
    while (sid && !vu.has(sid)) {
      vu.add(sid);
      const st = ev.st.find((x) => x.id === sid);
      if (!st) break;
      const d = dureeEtape(st);
      planned += d;
      const outs = ev.tr.filter((x) => x.a === sid);
      let tr: Sortie | null = null, c = 0;
      if (outs.length) {
        let bc = 1e12;
        for (const o of outs) { const cc = tempsSortie(o, p.sens, iss); if (cc < bc) { bc = cc; tr = o; } }
        c = bc;
      }
      const bloque = c >= 1e8;
      const ex = bloque ? d + 600 : Math.max(d, c);
      run.push({ st, S: T, E: T + ex, tr, bloque });
      T += ex;
      sid = tr ? tr.b || undefined : undefined;
    }
    if (!run.length) T += 10;
    evs.push({ ev, i, S: S0, E: T, run });
    if (ev.gate && i < p.ev.length - 1) {
      const g = ev.gate;
      const cc = g.g.length ? Math.max(...g.g.map((x) => franchissement(x, p.sens, iss))) : 0;
      const ready = T + Math.min(cc, 600);
      const hold = g.mode === 'go' ? (p.hold[ev.id] ?? 0) : 0;
      const pend = g.mode === 'go' && !p.go[ev.id] && !pending;
      const gg: PlanPassage = { ev, i, g, S: T, ready, pass: ready + hold, hold, pend };
      if (pend) pending = gg;
      gates.push(gg);
      T = gg.pass;
    }
  });
  return { evs, gates, total: T, planned, issue: iss };
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
