import { describe, it, expect } from 'vitest';
import { percentile, resume, debitMbps, arrondi } from './stats.mjs';

describe('percentile', () => {
  it('tableau vide : NaN', () => {
    expect(percentile([], 50)).toBeNaN();
  });
  it('un seul élément : toujours cet élément', () => {
    expect(percentile([42], 0)).toBe(42);
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 100)).toBe(42);
  });
  it('médiane d\'un nombre impair et pair d\'éléments (interpolation)', () => {
    expect(percentile([3, 1, 2], 50)).toBe(2);
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
  });
  it('p95 sur 1..100 et bornes 0 / 100', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 95)).toBeCloseTo(95.05, 5);
    expect(percentile(v, 0)).toBe(1);
    expect(percentile(v, 100)).toBe(100);
  });
  it('ne modifie pas le tableau d\'entrée et borne p hors de 0..100', () => {
    const v = [5, 1, 3];
    percentile(v, 50);
    expect(v).toEqual([5, 1, 3]);
    expect(percentile(v, 250)).toBe(5);
    expect(percentile(v, -3)).toBe(1);
  });
});

describe('resume', () => {
  it('tableau vide : n = 0 et le reste à null', () => {
    expect(resume([])).toEqual({ n: 0, min: null, p50: null, p95: null, max: null, moyenne: null });
  });
  it('un seul élément', () => {
    expect(resume([7])).toEqual({ n: 1, min: 7, p50: 7, p95: 7, max: 7, moyenne: 7 });
  });
  it('plusieurs éléments, ignore les NaN', () => {
    const r = resume([10, 20, NaN, 30, 40]);
    expect(r.n).toBe(4);
    expect(r.min).toBe(10);
    expect(r.max).toBe(40);
    expect(r.moyenne).toBe(25);
    expect(r.p50).toBe(25);
  });
});

describe('debitMbps', () => {
  it('1 Mo en 1 s = 8 Mb/s', () => {
    expect(debitMbps(1e6, 1)).toBeCloseTo(8, 10);
  });
  it('durée nulle, négative ou octets nuls : 0', () => {
    expect(debitMbps(1e6, 0)).toBe(0);
    expect(debitMbps(1e6, -2)).toBe(0);
    expect(debitMbps(0, 5)).toBe(0);
  });
});

describe('arrondi', () => {
  it('arrondit et neutralise les valeurs non finies', () => {
    expect(arrondi(1.2349, 2)).toBe(1.23);
    expect(arrondi(NaN)).toBeNull();
    expect(arrondi(null)).toBeNull();
  });
});
