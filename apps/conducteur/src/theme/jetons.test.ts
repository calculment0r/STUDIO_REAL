import { describe, expect, it } from 'vitest';
import { jeton, jetonsApercus, lireJetons } from './jetons';

const FAMILLES = ['trig', 'flow', 'data', 'cible', 'fx', 'ui', 'scene', 'gate', 'autre'];

describe('lecture des jetons du thème', () => {
  it('range les déclarations par thème (:root et dark → sombre, light → clair), commentaires ignorés', () => {
    const t = lireJetons('/* { --x: 1; } */ :root, [data-theme="dark"] { --a: #111111; --b: rgba(0,0,0,.5); } [data-theme="light"] { --a: #eeeeee; }');
    expect(t.sombre).toEqual({ '--a': '#111111', '--b': 'rgba(0,0,0,.5)' });
    expect(t.clair).toEqual({ '--a': '#eeeeee' });
  });

  it('trouve les familles de blocs (--fam-*) du thème, en hexadécimal, dans les deux thèmes', () => {
    for (const theme of ['sombre', 'clair'] as const) {
      for (const f of FAMILLES) expect(jeton(theme, '--fam-' + f), theme + ' ' + f).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(() => jeton('sombre', '--fam-inconnue')).toThrow();
  });

  it('donne la même liste de jetons --apercu-* en sombre et en clair', () => {
    const sombre = Object.keys(jetonsApercus('sombre')).sort();
    expect(sombre.length).toBeGreaterThan(40);
    expect(Object.keys(jetonsApercus('clair')).sort()).toEqual(sombre);
    expect(sombre).toContain('--bg');
    expect(sombre).toContain('--tel-demo');
  });
});
