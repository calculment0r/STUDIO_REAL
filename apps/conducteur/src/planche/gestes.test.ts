import { describe, expect, it } from 'vitest';
import { defilementMolette, facteurZoomMolette, gesteMolette, pixelsMolette, PX_PAR_LIGNE, PX_PAR_PAGE } from './gestes';

const molette = (o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; deltaX: number; deltaY: number; deltaMode: number }> = {}) =>
  ({ ctrlKey: false, metaKey: false, shiftKey: false, deltaX: 0, deltaY: 0, deltaMode: 0, ...o });

describe('décision de geste de la molette', () => {
  it('molette seule = défiler, quelle que soit la taille du delta (plus de devinette souris / pavé)', () => {
    expect(gesteMolette(molette({ deltaY: 100 }))).toBe('defiler');
    expect(gesteMolette(molette({ deltaY: 3 }))).toBe('defiler');
    expect(gesteMolette(molette({ deltaX: 40, deltaY: 1 }))).toBe('defiler');
  });
  it('Ctrl + molette = zoomer', () => {
    expect(gesteMolette(molette({ ctrlKey: true, deltaY: 100 }))).toBe('zoomer');
  });
  it('le pincement d’un pavé (ctrlKey, delta fin) = zoomer', () => {
    expect(gesteMolette(molette({ ctrlKey: true, deltaY: -1.5 }))).toBe('zoomer');
  });
  it('Cmd + molette = zoomer ; Maj ou Alt seuls = défiler', () => {
    expect(gesteMolette(molette({ metaKey: true }))).toBe('zoomer');
    expect(gesteMolette(molette({ shiftKey: true }))).toBe('defiler');
    expect(gesteMolette({ ctrlKey: false })).toBe('defiler');
  });
});

describe('mesure de la molette', () => {
  it('convertit lignes et pages en pixels', () => {
    expect(pixelsMolette(molette({ deltaY: 3, deltaMode: 1 }))).toEqual({ dx: 0, dy: 3 * PX_PAR_LIGNE });
    expect(pixelsMolette(molette({ deltaX: 1, deltaY: 1, deltaMode: 2 }))).toEqual({ dx: PX_PAR_PAGE, dy: PX_PAR_PAGE });
    expect(pixelsMolette(molette({ deltaY: 120 }))).toEqual({ dx: 0, dy: 120 });
  });
  it('Maj + molette verticale défile à l’horizontale', () => {
    expect(defilementMolette(molette({ shiftKey: true, deltaY: 100 }))).toEqual({ dx: 100, dy: 0 });
    expect(defilementMolette(molette({ deltaY: 100 }))).toEqual({ dx: 0, dy: 100 });
    expect(defilementMolette(molette({ deltaX: 30, deltaY: 10 }))).toEqual({ dx: 30, dy: 10 });
  });
  it('facteur de zoom : > 1 vers le haut, < 1 vers le bas, borné pour un cran de souris', () => {
    expect(facteurZoomMolette(molette({ deltaY: -100 }))).toBeGreaterThan(1);
    expect(facteurZoomMolette(molette({ deltaY: 100 }))).toBeLessThan(1);
    expect(facteurZoomMolette(molette({ deltaY: 100 }))).toBeCloseTo(facteurZoomMolette(molette({ deltaY: 5000 })), 10);
    expect(facteurZoomMolette(molette({ deltaY: -2 }))).toBeCloseTo(Math.exp(2 * 0.006), 10);
    expect(facteurZoomMolette(molette({ deltaY: 0 }))).toBe(1);
  });
});
