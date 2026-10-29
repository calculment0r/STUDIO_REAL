// Touches de la barre de scène (décision pure actionTouche) : GO, lecture / pause, RETENIR, +30 s, SAUTER À…, et
// l'absence volontaire de touche pour PANIQUE.
import { describe, expect, it } from 'vitest';
import { actionTouche } from './etat-scene';

const touche = (key: string, extra: Record<string, boolean> = {}) => ({ key, code: key === ' ' ? 'Space' : 'Key' + key.toUpperCase(), ...extra });

describe('actionTouche · barre de scène', () => {
  it('H = RETENIR et J = +30 s, dans les deux modes, majuscule comprise', () => {
    for (const mode of ['repetition', 'spectacle'] as const) {
      expect(actionTouche(touche('h'), mode)).toBe('retenir');
      expect(actionTouche(touche('H', { shiftKey: true }), mode)).toBe('retenir');
      expect(actionTouche(touche('j'), mode)).toBe('prolonger');
      expect(actionTouche(touche('J', { shiftKey: true }), mode)).toBe('prolonger');
    }
  });

  it('Ctrl+Maj+K (ou Méta+Maj+K) = SAUTER À… ; Ctrl+K reste à la recherche, K seul n’est pas une commande de la barre', () => {
    expect(actionTouche(touche('K', { ctrlKey: true, shiftKey: true }), 'spectacle')).toBe('sauter');
    expect(actionTouche(touche('k', { ctrlKey: true, shiftKey: true }), 'repetition')).toBe('sauter');
    expect(actionTouche(touche('K', { metaKey: true, shiftKey: true }), 'repetition')).toBe('sauter');
    expect(actionTouche(touche('k', { ctrlKey: true }), 'spectacle')).toBeNull();
    expect(actionTouche(touche('k', { metaKey: true }), 'repetition')).toBeNull();
    expect(actionTouche(touche('k'), 'repetition')).toBeNull();
    expect(actionTouche(touche('K', { ctrlKey: true, shiftKey: true, altKey: true }), 'repetition')).toBeNull();
  });

  it('Espace, Maj+Espace, T et G sont inchangés', () => {
    expect(actionTouche({ code: 'Space', key: ' ' }, 'spectacle')).toBe('go');
    expect(actionTouche({ code: 'Space', key: ' ', shiftKey: true }, 'spectacle')).toBe('lecture');
    expect(actionTouche({ code: 'Space', key: ' ' }, 'repetition')).toBe('lecture');
    for (const k of ['t', 'T', 'g', 'G']) {
      expect(actionTouche(touche(k), 'spectacle')).toBe('go');
      expect(actionTouche(touche(k), 'repetition')).toBe('go');
    }
  });

  it('avec Ctrl, Méta ou Alt, aucune autre touche ne devient une commande (Ctrl+H, Ctrl+J, Ctrl+Espace, Alt+T…)', () => {
    const combinaisons: Record<string, boolean>[] = [{ ctrlKey: true }, { metaKey: true }, { altKey: true }];
    for (const extra of combinaisons) {
      expect(actionTouche(touche('h', extra), 'spectacle')).toBeNull();
      expect(actionTouche(touche('j', extra), 'spectacle')).toBeNull();
      expect(actionTouche(touche('t', extra), 'spectacle')).toBeNull();
      expect(actionTouche({ code: 'Space', key: ' ', ...extra }, 'spectacle')).toBeNull();
    }
  });

  it('PANIQUE n’a aucune touche : aucune lettre, ni Entrée, ni Échap, ne la déclenche', () => {
    const actions = new Set<string | null>();
    for (const k of 'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) for (const mode of ['repetition', 'spectacle'] as const) {
      actions.add(actionTouche(touche(k), mode));
      actions.add(actionTouche(touche(k, { shiftKey: true }), mode));
      actions.add(actionTouche(touche(k, { ctrlKey: true }), mode));
      actions.add(actionTouche(touche(k, { ctrlKey: true, shiftKey: true }), mode));
    }
    for (const k of ['Enter', 'Escape', 'Backspace', 'Delete', 'p', 'P', '!']) actions.add(actionTouche({ key: k, code: k }, 'spectacle'));
    expect([...actions].filter(Boolean).sort()).toEqual(['go', 'prolonger', 'retenir', 'sauter']);
    expect([...actions]).not.toContain('panique');
  });
});
