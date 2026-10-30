// Pistes par acteur de la conduite : pavés dérivés des envois le long du plan (même règle que vueActeur).
import { describe, expect, it } from 'vitest';
import { acteursEcho, type Etape, type Moment, type Projet } from '@studio-real/modele';
import { planifier } from './planning';
import { couleurEcran, pistesActeur } from './pistes-acteurs';

// durée prévue = k[0] * 6 + 10 : k0 = 0 → 10 s, k0 = 5 → 40 s
const st = (id: string, k0: number, extra: Partial<Etape> = {}): Etape => ({ id, name: id, ty: 'k:scene', c: 0, r: 0, dx: 0, dy: 0, k: [k0, 50, 50], ...extra });
const moment = (id: string, etapes: Etape[]): Moment => ({
  id, act: 0, name: id, entry: etapes[0]!.id, st: etapes, gate: { mode: 'auto', g: [] },
  tr: etapes.slice(1).map((e, i) => ({ a: etapes[i]!.id, b: e.id, g: [], mode: 'all' as const })),
});
const projet = (ev: Moment[]): Projet => ({ acts: [{ n: 'Acte' }], ev, sens: { aff: 50, part: 50, calme: 50, pen: 50 }, hold: {}, go: {}, ver: 1, nid: 100, tracks: [], acteurs: acteursEcho() });

describe('pistes par acteur', () => {
  const p = projet([
    moment('m1', [
      st('a', 5, { params: { numero: 2 }, envois: [{ vers: 'public', ecran: 'vote', params: { numero: '$numero' } }, { vers: 'scene', ecran: 'mur', quand: { apres: 15 } }] }),
      st('b', 0, { envois: [{ vers: 'public', ecran: 'regardez', tenir: false }, { vers: 'scene', ecran: 'noir', quand: 'sortie' }] }),
      st('c', 0),
    ]),
    moment('m2', [st('d', 0, { envois: [{ vers: 'public', ecran: 'vote', params: { numero: 2 } }, { vers: 'scene', ecran: 'mur', quand: { apres: 60 } }] })]),
  ]);
  const plan = planifier(p);

  it('le public : vote, puis regardez le temps de l’étape (non tenu), retour au vote, nouvel envoi du même écran', () => {
    const P = pistesActeur(plan, 'public');
    expect(P.map(x => [x.ecran, x.S, x.E, x.tenu])).toEqual([
      ['vote', 0, 40, true],
      ['regardez', 40, 50, false],
      ['vote', 50, 60, true],
      ['vote', 60, plan.total, true],
    ]);
    expect(P[0]!.nom).toBe('vote 2');                      // « $numero » résolu
    expect(P[0]).toMatchObject({ moment: 'm1', etape: 'a', index: 0, partiel: false });
  });

  it('la scène : délai dans l’étape, envoi à la sortie, délai plus long que l’étape ignoré', () => {
    const P = pistesActeur(plan, 'scene');
    expect(P.map(x => [x.ecran, x.S, x.E])).toEqual([['mur', 15, 50], ['noir', 50, plan.total]]);
  });

  it('acteur sans envoi : piste vide ; couleur stable par écran (jetons)', () => {
    expect(pistesActeur(plan, 'ministre')).toEqual([]);
    expect(couleurEcran('vote')).toBe(couleurEcran('vote'));
    expect(couleurEcran('prompteur')).toMatch(/^var\(--fam-/);
    expect(couleurEcran('noir')).toBe('var(--ink3)');
  });
});
