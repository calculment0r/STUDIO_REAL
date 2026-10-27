import { describe, expect, it } from 'vitest';
import { creerLecteur } from './lecteur';
import type { Lecteur, Signaux } from './moteur';
import { BORNE_BOUCLE, TY_BOUCLE, TY_GARDE, TY_MEMOIRE, TY_TIRAGE, creerPrng, reglagesBoucle, reglagesGarde, tirerIndex } from './blocs-moteur';
import { planifier } from './temps';
import { cond, etape, moment, projet, sig, sortie } from './aides-test';

const avancerN = (L: Lecteur, n: number, s: Signaux = sig()) => {
  let e = L.etat();
  for (let i = 0; i < n; i++) e = L.avancer(1, s);
  return e;
};

describe('garde-fou de temps', () => {
  const garde = (echeance: 'continuer' | 'top') => projet([moment('m', [
    etape('g', 10, TY_GARDE, { params: { delai: 30, echeance } }), etape('ok'), etape('secours'),
  ], [
    sortie('g', 'ok', [cond('quorum', '≥', 60)], 'all', { nom: 'condition remplie' }),
    sortie('g', 'secours', [], 'all', { nom: 'délai dépassé' }),
  ])]);

  it('condition remplie avant le délai → « condition remplie »', () => {
    const L = creerLecteur(garde('continuer'), { mode: 'repetition' });
    expect(avancerN(L, 12, sig({ quorum: 70 })).etape).toBe('ok');
  });

  it('délai dépassé → sortie de secours et alerte Sécurité, jamais bloqué', () => {
    const L = creerLecteur(garde('continuer'), { mode: 'repetition' });
    const e29 = avancerN(L, 29, sig({ quorum: 10 }));
    expect(e29.etape).toBe('g');
    expect(e29.bloque).toBe(false);
    const e = avancerN(L, 1, sig({ quorum: 10 }));
    expect(e.etape).toBe('secours');
    expect(e.alertes?.map(a => a.type)).toEqual(['delai']);
  });

  it('échéance « demander le top » : attend le top régie puis prend « délai dépassé »', () => {
    const L = creerLecteur(garde('top'), { mode: 'repetition' });
    const e = avancerN(L, 34, sig({ quorum: 10 }));
    expect(e.etape).toBe('g');
    expect(e.attenteGo).toBe(true);
    expect(e.retard).toBe(4);
    expect(L.top().etape).toBe('secours');
  });

  it('réglages par rotatifs : délai 00:05 → 10:00, échéance au-dessus de 50', () => {
    expect(reglagesGarde({ k: [0, 0, 0] })).toEqual({ delai: 5, echeance: 'continuer' });
    expect(reglagesGarde({ k: [0, 100, 80] })).toEqual({ delai: 600, echeance: 'top' });
  });

  it('planification : le garde-fou borne la durée prévue', () => {
    const p = garde('continuer');
    p.sens.part = 0; // quorum lent : T = 140 s, 60 % atteint vers 128 s
    expect(planifier(p).moments[0]!.etapes[0]!.fin).toBe(30);
  });
});

describe('mémoire de spectacle', () => {
  it('poser / ajouter / remettre à zéro, lisible par une condition plus loin', () => {
    const p = projet([
      moment('m1', [
        etape('pose', 10, TY_MEMOIRE, { params: { nom: 'score', op: 'poser', valeur: 2 } }),
        etape('ajoute', 10, TY_MEMOIRE, { params: { nom: 'score', op: 'ajouter', valeur: 3 } }),
        etape('drapeau', 10, TY_MEMOIRE, { params: { nom: 'fuite', op: 'poser', valeur: 'oui' } }),
      ], [sortie('pose', 'ajoute'), sortie('ajoute', 'drapeau')]),
      moment('m2', [etape('test'), etape('gagne'), etape('perdu'), etape('raz', 10, TY_MEMOIRE, { params: { nom: 'score', op: 'zero' } })], [
        sortie('test', 'gagne', [cond('mem:score', '≥', 5), cond('mem:fuite', '=', 'oui')]),
        sortie('test', 'perdu'),
        sortie('gagne', 'raz'),
      ]),
    ]);
    const L = creerLecteur(p, { mode: 'repetition' });
    expect(avancerN(L, 1).memoires).toEqual({ score: 2 });
    const e = avancerN(L, 30);
    expect(e.memoires).toEqual({ score: 5, fuite: 'oui' });
    expect(e.moment).toBe('m2');
    expect(avancerN(L, 10).etape).toBe('gagne');
    expect(avancerN(L, 10).memoires.score).toBe(0);
  });

  it('opération par rotatif k[1] : < 34 poser, < 67 ajouter, sinon remettre à zéro', () => {
    const p = projet([moment('m', [
      etape('a', 10, TY_MEMOIRE, { k: [0, 10, 7], name: 'jauge' }),
      etape('b', 10, TY_MEMOIRE, { k: [0, 50, 4], name: 'jauge' }),
    ], [sortie('a', 'b')])]);
    const L = creerLecteur(p, { mode: 'repetition' });
    expect(avancerN(L, 10).memoires).toEqual({ jauge: 11 });
  });
});

describe('tirage au sort', () => {
  const tirage = () => projet([moment('m', [etape('roue', 10, TY_TIRAGE), etape('A'), etape('B'), etape('C')], [
    sortie('roue', 'A', [], 'all', { poids: 50 }),
    sortie('roue', 'B', [], 'all', { poids: 30 }),
    sortie('roue', 'C', [], 'all', { poids: 20 }),
  ])]);
  const tirer = (graine: number, mode: 'repetition' | 'scene' = 'repetition') =>
    avancerN(creerLecteur(tirage(), { mode, graine }), 10).etape;

  it('rejouable : même graine = même sortie, y compris après reinitialiser()', () => {
    for (const g of [1, 2, 3, 42, 999]) expect(tirer(g)).toBe(tirer(g));
    const L = creerLecteur(tirage(), { mode: 'repetition' });
    const a = avancerN(L, 10).etape;
    L.reinitialiser();
    expect(avancerN(L, 10).etape).toBe(a);
  });

  it('respecte à peu près les poids sur beaucoup de graines', () => {
    const n: Record<string, number> = { A: 0, B: 0, C: 0 };
    for (let g = 1; g <= 2000; g++) n[tirer(g)!]!++;
    expect(n.A! / 2000).toBeGreaterThan(0.44);
    expect(n.A! / 2000).toBeLessThan(0.56);
    expect(n.C! / 2000).toBeGreaterThan(0.15);
    expect(n.C! / 2000).toBeLessThan(0.25);
  });

  it('poids tous à 0 → sortie 1 ; PRNG déterministe', () => {
    expect(tirerIndex([0, 0, 0], 0.9)).toBe(0);
    expect(tirerIndex([1, 1], 0.75)).toBe(1);
    const a = creerPrng(5), b = creerPrng(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('boucle', () => {
  const boucle = (params: Record<string, unknown>, arret: ReturnType<typeof cond>[] = []) => projet([moment('m', [
    etape('corps'), etape('tour', 10, TY_BOUCLE, { params }), etape('apres'),
  ], [
    sortie('corps', 'tour'),
    sortie('tour', 'corps', [], 'all', { nom: 'encore' }),
    sortie('tour', 'apres', arret, 'all', { nom: 'terminé' }),
  ])]);

  it('rejoue le corps le nombre de tours voulu puis sort par « terminé »', () => {
    const L = creerLecteur(boucle({ tours: 3 }), { mode: 'repetition' });
    const e = avancerN(L, 6 * 20);
    expect(e.parcours.map(x => x[1])).toEqual(['corps', 'tour', 'corps', 'tour', 'corps', 'tour', 'apres']);
  });

  it('s’arrête sur la condition de la sortie « terminé »', () => {
    const L = creerLecteur(boucle({ tours: 10 }, [cond('quorum', '≥', 80)]), { mode: 'repetition' });
    avancerN(L, 40);
    const e = avancerN(L, 20, sig({ quorum: 90 }));
    expect(e.etape).toBe('apres');
    expect(e.parcours.filter(x => x[1] === 'tour').length).toBe(3);
  });

  it('borne dure de 50 tours même sur ∞, avec alerte', () => {
    const L = creerLecteur(boucle({ tours: 0 }), { mode: 'repetition' });
    const e = avancerN(L, 20 * 60);
    expect(e.etape === 'apres' || e.termine).toBe(true);
    expect(e.parcours.filter(x => x[1] === 'tour').length).toBe(BORNE_BOUCLE);
    expect(e.alertes?.map(a => a.type)).toEqual(['boucle']);
    expect(reglagesBoucle({ k: [0, 100, 0] }).tours).toBe(Infinity);
    expect(reglagesBoucle({ k: [0, 0, 0] }).tours).toBe(1);
  });

  it('planification : la boucle compte ses tours', () => {
    const pl = planifier(boucle({ tours: 3 }));
    expect(pl.moments[0]!.etapes.map(x => x.id)).toEqual(['corps', 'tour', 'corps', 'tour', 'corps', 'tour', 'apres']);
    expect(pl.total).toBe(70);
  });
});
