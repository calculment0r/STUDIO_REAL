import { describe, expect, it } from 'vitest';
import { dureeEtape, dureeTotale, exempleDemo, positionsMoments, type Projet } from '@studio-real/modele';
import { debuts, indiceMomentA, limiteProche, momentEtapeA, planifier } from './planning';

const projetSimple = (n: number): Projet => ({
  acts: [{ n: 'Un' }], sens: { aff: 50, part: 50, calme: 50, pen: 50 }, hold: {}, go: {}, ver: 1, nid: 1000, tracks: [],
  ev: Array.from({ length: n }, (_, i) => ({
    id: 'm' + i, act: 0, name: 'Moment ' + i, entry: 'a' + i,
    st: [
      { id: 'a' + i, name: 'A', ty: 'k:scene', c: 0, r: 0, dx: 0, dy: 0, k: [5, 50, 50] }, // 40 s
      { id: 'b' + i, name: 'B', ty: 'k:scene', c: 1, r: 0, dx: 0, dy: 0, k: [10, 50, 50] }, // 70 s
    ],
    tr: [{ a: 'a' + i, b: 'b' + i, g: [], mode: 'all' as const }],
    gate: { mode: 'auto' as const, g: [] },
  })),
});

describe('placement des moments', () => {
  it('chaque moment dure le parcours prévu de ses étapes, sans trou ni chevauchement', () => {
    const plan = planifier(projetSimple(3));
    expect(plan.evs.map((e) => [e.S, e.E])).toEqual([[0, 110], [110, 220], [220, 330]]);
    expect(plan.total).toBe(330);
    expect(plan.planned).toBe(330);
    expect(plan.evs[0].run.map((r) => [r.st.id, r.S, r.E])).toEqual([['a0', 0, 40], ['b0', 40, 110]]);
  });

  it('une sortie à condition de durée allonge l’étape', () => {
    const p = projetSimple(1);
    p.ev[0].tr[0].g = [{ k: 't', op: '≥', v: 90 }];
    const plan = planifier(p);
    expect(plan.evs[0].run[0].E).toBe(90);
    expect(plan.total).toBe(160);
  });

  it('un passage « go » ajoute l’attente mesurée (hachurée) et s’arrête au premier sans top', () => {
    const p = projetSimple(3);
    p.ev[0].gate = { mode: 'go', g: [] };
    p.ev[1].gate = { mode: 'go', g: [] };
    p.hold.m0 = 25;
    const plan = planifier(p);
    expect(plan.gates[0]).toMatchObject({ S: 110, ready: 110, hold: 25, pass: 135, pend: true });
    expect(plan.gates[1].pend).toBe(false);
    expect(plan.evs[1].S).toBe(135);
    expect(plan.total).toBe(355);
  });

  it('le dernier moment n’a pas de passage', () => {
    const plan = planifier(projetSimple(2));
    expect(plan.gates.map((g) => g.ev.id)).toEqual(['m0']);
  });

  it('la démo : 7 moments ordonnés, chacun au moins la durée de son entrée', () => {
    const p = exempleDemo();
    const plan = planifier(p);
    expect(plan.evs).toHaveLength(7);
    for (let i = 1; i < plan.evs.length; i++) expect(plan.evs[i].S).toBeGreaterThanOrEqual(plan.evs[i - 1].E);
    plan.evs.forEach((e) => expect(e.E - e.S).toBeGreaterThanOrEqual(dureeEtape(e.run[0].st)));
    // le moment à issues de vote suit une seule branche
    expect(plan.evs[2].run.filter((r) => r.st.ty === 'k:issue')).toHaveLength(1);
  });

  it('tient 60 moments rapidement', () => {
    const p = projetSimple(60);
    const t0 = performance.now();
    for (let k = 0; k < 50; k++) planifier(p);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(planifier(p).total).toBe(60 * 110);
  });
});

describe('retrouver un moment par le temps', () => {
  const plan = planifier(projetSimple(3));
  it('moment et étape qui jouent à t', () => {
    expect(indiceMomentA(plan, 0)).toBe(0);
    expect(indiceMomentA(plan, 150)).toBe(1);
    expect(indiceMomentA(plan, 9999)).toBe(2);
    expect(momentEtapeA(plan, 130)).toEqual({ moment: 'm1', etape: 'a1' });
    expect(momentEtapeA(plan, 160)).toEqual({ moment: 'm1', etape: 'b1' });
  });
  it('limite la plus proche (pour « nouveau moment ici »)', () => {
    expect(limiteProche(plan, 10)).toBe(0);
    expect(limiteProche(plan, 100)).toBe(1);
    expect(limiteProche(plan, 120)).toBe(1);
    expect(limiteProche(plan, 9999)).toBe(3);
  });
  it('débuts par id', () => {
    expect(debuts(plan)).toEqual({ m0: 0, m1: 110, m2: 220 });
  });
});

describe('les positions sont celles du moteur', () => {
  it('chaque moment commence et finit là où le moteur (positionsMoments) le place', () => {
    const p = exempleDemo();
    const plan = planifier(p);
    const pos = positionsMoments(p);
    for (const e of plan.evs) {
      expect(e.S).toBeCloseTo(pos[e.ev.id].debut, 6);
      expect(e.E).toBeCloseTo(pos[e.ev.id].fin, 6);
    }
    for (const g of plan.gates) expect(g.pass).toBeCloseTo(pos[g.ev.id].finPassage, 6);
    expect(plan.total).toBeCloseTo(dureeTotale(p), 6);
  });
});
