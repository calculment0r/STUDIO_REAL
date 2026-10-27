import { describe, expect, it } from 'vitest';
import { exempleDemo } from '@studio-real/modele';
import { appliquerOps, ErreurOp, resoudreChemin, validerOps, type Op } from '../../src/logique/ops';

const doc = () => exempleDemo() as unknown as Record<string, unknown>;

describe('opérations de modification', () => {
  it('pose une valeur par index et par id', () => {
    const d = doc();
    appliquerOps(d, [
      { op: 'poser', chemin: ['titre'], valeur: 'Nouveau' },
      { op: 'poser', chemin: ['ev', { id: 'e2' }, 'name'], valeur: 'Prologue bis' },
      { op: 'poser', chemin: ['ev', 0, 'st', { id: 'calage' }, 'k', 0], valeur: 9 },
    ]);
    const p = d as unknown as ReturnType<typeof exempleDemo>;
    expect(p.titre).toBe('Nouveau');
    expect(p.ev[1]!.name).toBe('Prologue bis');
    expect(p.ev[0]!.st[1]!.k[0]).toBe(9);
  });

  it('insère, retire, et le chemin « - » ajoute en fin', () => {
    const d = doc() as unknown as ReturnType<typeof exempleDemo>;
    const n = d.acts.length;
    appliquerOps(d, [{ op: 'inserer', chemin: ['acts', '-'], valeur: { n: 'Épilogue' } }]);
    expect(d.acts.at(-1)).toEqual({ n: 'Épilogue' });
    appliquerOps(d, [{ op: 'inserer', chemin: ['acts', 0], valeur: { n: 'Avant' } }, { op: 'retirer', chemin: ['acts', 1] }]);
    expect(d.acts.length).toBe(n + 1);
    expect(d.acts[0]).toEqual({ n: 'Avant' });
  });

  it('les inverses rétablissent exactement le document', () => {
    const d = doc();
    const avant = JSON.stringify(d);
    const inv = appliquerOps(d, [
      { op: 'poser', chemin: ['memoires'], valeur: { a: 1 } },
      { op: 'retirer', chemin: ['ev', { id: 'e1' }] },
      { op: 'inserer', chemin: ['tracks', 0], valeur: { id: 't9', type: 'notes', name: 'N', open: true } },
      { op: 'poser', chemin: ['sens', 'aff'], valeur: 99 },
    ]);
    expect(JSON.stringify(d)).not.toBe(avant);
    appliquerOps(d, inv);
    expect(JSON.stringify(d)).toBe(avant);
  });

  it('tout ou rien : un échec annule les opérations précédentes', () => {
    const d = doc();
    const avant = JSON.stringify(d);
    expect(() => appliquerOps(d, [
      { op: 'poser', chemin: ['titre'], valeur: 'X' },
      { op: 'retirer', chemin: ['ev', 0, 'st', 0] },
      { op: 'poser', chemin: ['ev', { id: 'inexistant' }, 'name'], valeur: 'Y' },
    ])).toThrow(ErreurOp);
    expect(JSON.stringify(d)).toBe(avant);
  });

  it('refuse les chemins dangereux ou mal formés', () => {
    expect(() => validerOps([{ op: 'poser', chemin: ['__proto__', 'x'], valeur: 1 }])).toThrow(/interdite/);
    expect(() => validerOps([{ op: 'poser', chemin: [], valeur: 1 }])).toThrow();
    expect(() => validerOps([{ op: 'poser', chemin: ['a', -1], valeur: 1 }])).toThrow();
    expect(() => validerOps([{ op: 'detruire', chemin: ['a'] }])).toThrow();
    expect(() => validerOps([{ op: 'poser', chemin: ['a'] }])).toThrow(/valeur/);
    expect(() => validerOps([])).toThrow();
    expect(() => validerOps(Array.from({ length: 201 }, () => ({ op: 'retirer', chemin: ['a'] })))).toThrow();
    const ok: Op[] = validerOps([{ op: 'retirer', chemin: ['ev', { id: 'e1' }] }]);
    expect(ok).toHaveLength(1);
  });

  it('resoudreChemin remplace les {id} par des index', () => {
    expect(resoudreChemin(doc(), ['ev', { id: 'e2' }, 'st', { id: 'aube' }])).toEqual(['ev', 1, 'st', 1]);
  });

  it('les valeurs posées sont copiées (pas de partage de référence)', () => {
    const d = doc() as unknown as ReturnType<typeof exempleDemo>;
    const v = { n: 'Copie' };
    appliquerOps(d, [{ op: 'inserer', chemin: ['acts', '-'], valeur: v }]);
    v.n = 'modifié après coup';
    expect(d.acts.at(-1)!.n).toBe('Copie');
  });
});
