import { describe, expect, it } from 'vitest';
import { nettoyer } from './kit';

// HORS_POLICE écrit l'espace insécable par son code Unicode (A0 en hexadécimal) et non en caractère brut, refusé par le lint :
// le résultat doit rester celui de l'ancienne expression.
const ANCIENNE = new RegExp('[^ -~' + String.fromCharCode(0xa0) + '-ÿŒœŸ’‘“”…–—€•★]', 'g');

describe('nettoyer (police bitmap du calque)', () => {
  it('garde l\'ASCII, l\'espace insécable, les accents et la ponctuation typographique', () => {
    const insecable = String.fromCharCode(0xa0);
    const texte = `Bravo${insecable}l'équipe ! « œuvre » — ça va… €5 ★`;
    expect(nettoyer(texte)).toBe(texte);
  });

  it('retire les emojis et les caractères de contrôle', () => {
    expect(nettoyer('ok 🔥👏 oui\u0007\n')).toBe('ok  oui');
  });

  it('donne le même résultat que l\'ancienne expression, espace insécable compris', () => {
    const insecable = String.fromCharCode(0xa0);
    const entrees = [`a${insecable}b`, 'a\u0080b', 'a\u009fb', 'ÿ', 'Ā', 'œŒŸ', '😂', '’‘“”'];
    for (const e of entrees) expect(nettoyer(e)).toBe(e.replace(ANCIENNE, ''));
    expect(nettoyer(`a${insecable}b`)).toBe(`a${insecable}b`);
    expect(nettoyer('a\u0080b')).toBe('ab');
  });
});
