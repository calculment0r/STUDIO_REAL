import { describe, expect, it } from 'vitest';
import { exempleDemo } from '@studio-real/modele';
import {
  cibleDeChemin, ciblesDesOps, peutChangerMode, peutDiffuserLecture, peutForcer, peutModifier, peutPrendre, type Verrou,
} from '../../src/logique/verrous';

const v = (cible: string, personne: string): Verrou => ({ cible, personne, nom: personne.toUpperCase(), pris_le: 0 });

describe('verrous et mode Scène', () => {
  const d = exempleDemo();

  it('déduit la cible touchée par un chemin', () => {
    expect(cibleDeChemin(d, ['ev', 1, 'name'])).toBe('moment:e2');
    expect(cibleDeChemin(d, ['ev', { id: 'e3' }, 'st'])).toBe('moment:e3');
    expect(cibleDeChemin(d, ['ev', '-'])).toBe('projet');
    expect(cibleDeChemin(d, ['titre'])).toBe('projet');
    expect(ciblesDesOps(d, [{ op: 'retirer', chemin: ['ev', 0] }, { op: 'retirer', chemin: ['ev', 0, 'st', 0] }])).toEqual(['moment:e1']);
  });

  it('refuse une modification sur une cible tenue par un autre', () => {
    expect(peutModifier('a', ['moment:e1'], [v('moment:e1', 'b')], 'ecrire')).toEqual({ ok: false, raison: 'verrouille:moment:e1:B' });
    expect(peutModifier('a', ['moment:e2'], [v('moment:e1', 'b')], 'ecrire').ok).toBe(true);
    expect(peutModifier('a', ['moment:e2'], [v('projet', 'b')], 'ecrire').ok).toBe(false);
    expect(peutModifier('b', ['moment:e1'], [v('moment:e1', 'b')], 'ecrire').ok).toBe(true);
  });

  it('en mode Scène, seul qui tient le verrou modifie', () => {
    expect(peutModifier('a', ['moment:e1'], [], 'jouer')).toEqual({ ok: false, raison: 'mode-scene' });
    expect(peutModifier('a', ['moment:e1'], [v('projet', 'a')], 'jouer').ok).toBe(true);
    expect(peutModifier('a', ['moment:e1'], [v('moment:e1', 'a')], 'jouer').ok).toBe(true);
    expect(peutModifier('a', ['projet'], [v('moment:e1', 'a')], 'jouer').ok).toBe(false);
  });

  it('règles de prise de verrou', () => {
    expect(peutPrendre('a', 'projet', [v('moment:e1', 'b')]).ok).toBe(false);
    expect(peutPrendre('a', 'projet', [v('lecture', 'b')]).ok).toBe(true);
    expect(peutPrendre('a', 'moment:e2', [v('projet', 'b')]).ok).toBe(false);
    expect(peutPrendre('a', 'lecture', [v('projet', 'b')]).ok).toBe(true);
    expect(peutPrendre('a', 'moment:e1', [v('moment:e1', 'a')]).ok).toBe(true);
    expect(peutPrendre('a', 'n_importe quoi', []).ok).toBe(false);
  });

  it('forcer ne marche que si le détenteur est parti', () => {
    expect(peutForcer('projet', [v('projet', 'b')], new Set(['b'])).ok).toBe(false);
    expect(peutForcer('projet', [v('projet', 'b')], new Set(['a'])).ok).toBe(true);
    expect(peutForcer('projet', [], new Set()).ok).toBe(false);
  });

  it('diffusion de la lecture et changement de mode', () => {
    expect(peutDiffuserLecture('a', 'regie', [], 'repeter').ok).toBe(true);
    expect(peutDiffuserLecture('a', 'auteur', [], 'repeter').ok).toBe(false);
    expect(peutDiffuserLecture('a', 'regie', [], 'jouer').ok).toBe(false);
    expect(peutDiffuserLecture('a', 'poste', [v('lecture', 'a')], 'jouer').ok).toBe(true);
    expect(peutDiffuserLecture('a', 'regie', [v('projet', 'b')], 'ecrire').ok).toBe(false);
    expect(peutChangerMode('a', 'jouer', [v('projet', 'b')]).ok).toBe(false);
    expect(peutChangerMode('b', 'jouer', [v('projet', 'b')]).ok).toBe(true);
    expect(peutChangerMode('a', 'ecrire', [v('projet', 'b')]).ok).toBe(true);
  });
});
