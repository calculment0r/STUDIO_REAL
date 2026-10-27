import { describe, expect, it } from 'vitest';
import { CAPACITE_SALLE, instantFranchissement, issueSalle, signauxSalle, valeurSignal, votesSalle } from './salle';
import { dureeMoment, dureeTotale, formatMMSS, planifier, positionsMoments } from './temps';
import { exempleDemo } from './exemple';
import { cond } from './aides-test';

const sens = { aff: 60, part: 55, calme: 50, pen: 62 };

describe('salle simulée', () => {
  it('reprend les formules du design', () => {
    expect(signauxSalle(sens, 0)).toMatchObject({ pres: 0, quorum: 0, prets: 0, bruit: 72, issue: 'A' });
    const T = 40 + 40 * 2.2;
    expect(signauxSalle(sens, T).pres).toBe(Math.round(CAPACITE_SALLE * (1 - Math.exp(-1))));
    expect(valeurSignal('bruit', sens, 1e6)).toBeCloseTo(32, 5);
    expect(votesSalle(sens)).toEqual({ A: 53, B: 35, C: 12 });
  });

  it('présents montent avec l’affluence, quorum avec la participation, bruit baisse avec le calme', () => {
    expect(signauxSalle({ ...sens, aff: 90 }, 120).pres).toBeGreaterThan(signauxSalle({ ...sens, aff: 20 }, 120).pres);
    expect(signauxSalle({ ...sens, part: 90 }, 40).quorum).toBeGreaterThan(signauxSalle({ ...sens, part: 20 }, 40).quorum);
    expect(signauxSalle({ ...sens, part: 90 }, 40).prets).toBeGreaterThan(signauxSalle({ ...sens, part: 20 }, 40).prets);
    expect(signauxSalle({ ...sens, calme: 90 }, 30).bruit).toBeLessThan(signauxSalle({ ...sens, calme: 10 }, 30).bruit);
    for (let t = 0; t < 600; t += 10) expect(signauxSalle(sens, t + 10).pres).toBeGreaterThanOrEqual(signauxSalle(sens, t).pres);
  });

  it('issue du vote selon le penchant : A, B ou T (égalité)', () => {
    expect(issueSalle({ ...sens, pen: 80 })).toBe('A');
    expect(issueSalle({ ...sens, pen: 10 })).toBe('B');
    expect(issueSalle({ ...sens, pen: 40 })).toBe('T'); // A = 44, B = 44
  });

  it('déterministe avec une graine, et proche des valeurs exactes', () => {
    expect(signauxSalle(sens, 37.5, 9)).toEqual(signauxSalle(sens, 37.5, 9));
    expect(signauxSalle(sens, 37.5, 9)).not.toEqual(signauxSalle(sens, 37.5, 10));
    expect(Math.abs(signauxSalle(sens, 37.5, 9).quorum - valeurSignal('quorum', sens, 37.5))).toBeLessThanOrEqual(1.5);
  });

  it('instant de franchissement = inverse du signal', () => {
    const c = instantFranchissement(cond('quorum', '≥', 60), sens);
    expect(valeurSignal('quorum', sens, c)).toBeCloseTo(60, 6);
    const b = instantFranchissement(cond('bruit', '≤', 40), sens);
    expect(valeurSignal('bruit', sens, b)).toBeCloseTo(40, 6);
    expect(instantFranchissement(cond('quorum', '≥', 100), sens)).toBeGreaterThan(1e8);
  });
});

describe('temps', () => {
  it('formatMMSS : entier, jamais de décimale', () => {
    expect(formatMMSS(0)).toBe('00:00');
    expect(formatMMSS(59.999)).toBe('00:59');
    expect(formatMMSS(61.2)).toBe('01:01');
    expect(formatMMSS(-5)).toBe('00:00');
    expect(formatMMSS(6000)).toBe('100:00');
    expect(formatMMSS(Number.NaN)).toBe('00:00');
  });

  it('positions des moments : contiguës, passages compris, cohérentes avec dureeMoment / dureeTotale', () => {
    const p = exempleDemo();
    const pl = planifier(p);
    expect(pl.moments.map(m => m.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7']);
    expect(pl.moments[0]!.debut).toBe(0);
    for (let i = 1; i < pl.moments.length; i++) expect(pl.moments[i]!.debut).toBeCloseTo(pl.moments[i - 1]!.passage!.fin, 9);
    expect(pl.moments[6]!.passage).toBeUndefined();
    expect(dureeTotale(p)).toBeCloseTo(pl.moments[6]!.fin, 9);
    // Prologue : 3 étapes sans condition → 148 + 178 + 118 (durées codées du design : 148, 178, 118)
    expect(dureeMoment(p, 'e2')).toBe(148 + 178 + 118);
    // Scène selon le choix, issue A : jeuA (418) + bascule (40)
    expect(dureeMoment(p, 'e4')).toBe(418 + 40);
    expect(dureeMoment(p, 'e4', { issue: 'B' })).toBe(382 + 40);
    const pos = positionsMoments(p);
    expect(pos.e2!.debut).toBeCloseTo(pl.moments[1]!.debut, 9);
  });

  it('une attente au passage « go » décale la suite', () => {
    const p = exempleDemo();
    const a = dureeTotale(p);
    p.hold = { e3: 30 };
    expect(dureeTotale(p)).toBeCloseTo(a + 30, 9);
  });
});
