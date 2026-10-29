import { describe, expect, it } from 'vitest';
import { creerLecteur, simuler } from './lecteur';
import { exempleDemo } from './exemple';
import { signauxSalle } from './salle';
import { planifier } from './temps';
import type { Lecteur, Signaux } from './moteur';
import { cond, etape, moment, projet, sig, sortie } from './aides-test';

const avancerN = (L: Lecteur, n: number, s: Signaux | ((tEtape: number) => Signaux) = sig()) => {
  let e = L.etat();
  for (let i = 0; i < n; i++) e = L.avancer(1, typeof s === 'function' ? s(e.tEtape + 1) : s);
  return e;
};

describe('exemple de démonstration de bout en bout', () => {
  it('se joue jusqu’au bout avec la salle simulée, les tops régie et l’issue A', () => {
    const p = exempleDemo();
    const r = simuler(p, { pas: 0.5, topApres: 5 });
    expect(r.etat.termine).toBe(true);
    expect(r.tops).toBe(3); // trois passages « go » : e1, e3, e5
    expect(r.etat.issue).toBe('A'); // pen = 62 → A = 53 %, B = 35 %
    const etapes = r.etat.parcours.map(x => x[1]);
    expect(etapes).toEqual(['portes', 'calage', 'noir', 'voix', 'aube', 'appar', 'quest', 'vote', 'depou', 'issA',
      'jeuA', 'basc', 'prep', 'vague', 'retour', 'montee', 'pic', 'silence', 'salut', 'sortie']);
    expect(Object.keys(r.etat.attentes ?? {}).sort()).toEqual(['e1', 'e3', 'e5']);
    expect(r.etat.retard).toBeGreaterThan(0);
    expect(r.etat.alertes).toEqual([]);
  });

  it('suit la planification (positions prévues) à une seconde près', () => {
    const p = exempleDemo();
    const r = simuler(p, { pas: 0.25, topApres: 5 });
    const pl = planifier(p, { attentes: r.etat.attentes });
    expect(Math.abs(r.etat.t - pl.total)).toBeLessThan(2);
    for (const m of pl.moments) {
      const entree = r.etat.parcours.find(x => x[0] === m.id)!;
      expect(Math.abs(entree[2] - m.debut)).toBeLessThan(2);
    }
  });

  it('prend la branche B quand le penchant du vote s’inverse', () => {
    const p = exempleDemo();
    p.sens.pen = 10; // A = 32 %, B = 56 %
    const r = simuler(p);
    const e = r.etat.parcours.map(x => x[1]);
    expect(e).toContain('issB');
    expect(e).toContain('jeuB');
    expect(e).not.toContain('jeuA');
    expect(r.etat.issue).toBe('B');
  });

  it('est déterministe (même projet + mêmes signaux = même déroulé)', () => {
    const a = simuler(exempleDemo(), { graine: 7 });
    const b = simuler(exempleDemo(), { graine: 7 });
    expect(a.etat).toEqual(b.etat);
  });
});

describe('étapes et sorties', () => {
  it('une étape dure au minimum sa durée prévue, même si sa sortie est remplie', () => {
    const L = creerLecteur(projet([moment('m', [etape('a', 22), etape('b', 10)], [sortie('a', 'b')])]), { mode: 'repetition' });
    expect(avancerN(L, 21).etape).toBe('a');
    const e = avancerN(L, 1);
    expect(e.etape).toBe('b');
    expect(e.parcours).toEqual([['m', 'a', 0], ['m', 'b', 22]]);
  });

  it('évalue les sorties dans l’ordre : la première remplie gagne, la sortie sans condition est le sinon', () => {
    const mk = () => projet([moment('m', [etape('a'), etape('x'), etape('y'), etape('z')], [
      sortie('a', 'x', [cond('quorum', '≥', 60)]),
      sortie('a', 'y', [cond('quorum', '≥', 30)]),
      sortie('a', 'z'),
    ])]);
    expect(avancerN(creerLecteur(mk(), { mode: 'repetition' }), 10, sig({ quorum: 70 })).etape).toBe('x');
    expect(avancerN(creerLecteur(mk(), { mode: 'repetition' }), 10, sig({ quorum: 40 })).etape).toBe('y');
    expect(avancerN(creerLecteur(mk(), { mode: 'repetition' }), 10, sig({ quorum: 5 })).etape).toBe('z');
  });

  it('mode any / all', () => {
    const mk = (mode: 'any' | 'all') => projet([moment('m', [etape('a'), etape('b')], [
      sortie('a', 'b', [cond('pres', '≥', 100), cond('bruit', '≤', 40)], mode),
    ])]);
    const s = sig({ pres: 120, bruit: 60 });
    expect(avancerN(creerLecteur(mk('any'), { mode: 'repetition' }), 10, s).etape).toBe('b');
    const all = avancerN(creerLecteur(mk('all'), { mode: 'repetition' }), 10, s);
    expect(all.etape).toBe('a');
    expect(all.bloque).toBe(true);
    expect(all.alertes?.[0]?.type).toBe('bloque');
  });

  it('condition sur t = temps dans l’étape ; bloqué se débloque quand la condition vient', () => {
    const L = creerLecteur(projet([moment('m', [etape('a'), etape('b')], [sortie('a', 'b', [cond('t', '≥', 15)])])]), { mode: 'repetition' });
    const e10 = avancerN(L, 10);
    expect(e10.bloque).toBe(true);
    expect(avancerN(L, 5).etape).toBe('b');
  });

  it('top() force la sortie d’une étape bloquée par son sinon ou sa première sortie', () => {
    const L = creerLecteur(projet([moment('m', [etape('a'), etape('b')], [sortie('a', 'b', [cond('quorum', '≥', 90)])])]), { mode: 'scene', graine: 1 });
    avancerN(L, 12);
    const e = L.top();
    expect(e.etape).toBe('b');
    expect(e.alertes?.some(a => a.type === 'force')).toBe(true);
  });

  it('une sortie vers "" termine le moment ; le dernier moment terminé termine le spectacle', () => {
    const L = creerLecteur(projet([
      moment('m1', [etape('a'), etape('b')], [sortie('a', ''), sortie('a', 'b')]),
      moment('m2', [etape('c')], []),
    ]), { mode: 'repetition' });
    const e = avancerN(L, 10);
    expect(e.moment).toBe('m2');
    expect(e.etape).toBe('c');
    const f = avancerN(L, 10);
    expect(f.termine).toBe(true);
    expect(f.phase).toBe('fin');
    expect(f.parcours.map(x => x[1])).toEqual(['a', 'c']);
  });

  it('mémoires lisibles par les conditions (mem:<nom>, non définie = 0)', () => {
    const p = projet([moment('m', [etape('a'), etape('oui'), etape('non')], [
      sortie('a', 'oui', [cond('mem:fuite', '=', 1)]), sortie('a', 'non'),
    ])]);
    expect(avancerN(creerLecteur(p, { mode: 'repetition' }), 10).etape).toBe('non');
    p.memoires = { fuite: true };
    expect(avancerN(creerLecteur(p, { mode: 'repetition' }), 10).etape).toBe('oui');
  });
});

describe('passages entre moments', () => {
  const deux = (mode: 'auto' | 'go', g = [] as ReturnType<typeof cond>[]) => projet([
    moment('m1', [etape('a')], [], { mode, g }),
    moment('m2', [etape('b')], []),
  ]);

  it('auto : enchaîne dès la fin du moment', () => {
    const e = avancerN(creerLecteur(deux('auto'), { mode: 'repetition' }), 10);
    expect(e.moment).toBe('m2');
    expect(e.attenteGo).toBe(false);
  });

  it('auto avec condition : attend la condition, mesurée depuis le début du passage', () => {
    const L = creerLecteur(deux('auto', [cond('bruit', '≤', 40)]), { mode: 'repetition' });
    const e = avancerN(L, 10);
    expect(e.phase).toBe('passage');
    expect(e.etape).toBeNull();
    expect(avancerN(L, 3, sig({ bruit: 60 })).moment).toBe('m1');
    const f = avancerN(L, 1, sig({ bruit: 35 }));
    expect(f.moment).toBe('m2');
    expect(f.retard).toBe(0);
  });

  it('go : attenteGo puis retard cumulé jusqu’au top()', () => {
    const L = creerLecteur(deux('go'), { mode: 'scene', graine: 3 });
    const e = avancerN(L, 10);
    expect(e.attenteGo).toBe(true);
    expect(e.moment).toBe('m1');
    const w = avancerN(L, 7);
    expect(w.retard).toBe(7);
    expect(w.attentes).toEqual({ m1: 7 });
    expect(w.t).toBe(17);
    const g = L.top();
    expect(g.attenteGo).toBe(false);
    expect(g.moment).toBe('m2');
    expect(g.etape).toBe('b');
    expect(avancerN(L, 3).retard).toBe(7);
  });

  it('go avec condition : pas d’attente du top avant que la condition soit remplie', () => {
    const L = creerLecteur(deux('go', [cond('bruit', '≤', 40)]), { mode: 'repetition' });
    avancerN(L, 10);
    const e = avancerN(L, 4, sig({ bruit: 50 }));
    expect(e.attenteGo).toBe(false);
    expect(e.retard).toBe(0);
    expect(avancerN(L, 1, sig({ bruit: 30 })).attenteGo).toBe(true);
    expect(avancerN(L, 2, sig({ bruit: 30 })).retard).toBe(2);
  });

  it('issue A/B : retenue après le décompte, elle choisit l’entrée du moment suivant', () => {
    const p = () => projet([
      moment('vote', [etape('v', 10, 'd1'), etape('fa', 10, 'k:issue'), etape('fb', 10, 'k:issue')], [
        sortie('v', 'fa', [cond('issue', '=', 'A')]), sortie('v', 'fb', [cond('issue', '=', 'B')]),
      ], { mode: 'go', g: [] }),
      moment('suite', [etape('jeuA'), etape('jeuB')], [], { mode: 'auto', g: [] }, { A: 'jeuA', B: 'jeuB', T: 'jeuA' }),
    ]);
    for (const [iss, branche, jeu] of [['A', 'fa', 'jeuA'], ['B', 'fb', 'jeuB']] as const) {
      const L = creerLecteur(p(), { mode: 'repetition' });
      const e = avancerN(L, 10, sig({ issue: iss }));
      expect(e.etape).toBe(branche);
      expect(e.issue).toBe(iss);
      avancerN(L, 10, sig()); // le signal n'a plus d'issue : l'issue retenue sert
      const f = L.top();
      expect(f.moment).toBe('suite');
      expect(f.etape).toBe(jeu);
    }
  });
});

describe('allerA, reinitialiser', () => {
  it('allerA saute à un moment en gardant les mémoires et place t au début prévu', () => {
    const p = exempleDemo();
    p.memoires = { score: 3 };
    const L = creerLecteur(p, { mode: 'repetition' });
    avancerN(L, 30, t => signauxSalle(p.sens, t));
    const e = L.allerA('e5');
    expect(e.moment).toBe('e5');
    expect(e.etape).toBe('prep');
    expect(e.memoires).toEqual({ score: 3 });
    expect(e.t).toBeCloseTo(planifier(p).moments[4]!.debut, 5);
    expect(L.allerA('e3', 'depou').etape).toBe('depou');
  });

  it('reinitialiser repart du début', () => {
    const L = creerLecteur(exempleDemo(), { mode: 'repetition' });
    avancerN(L, 50);
    const e = L.reinitialiser();
    expect(e.t).toBe(0);
    expect(e.moment).toBe('e1');
    expect(e.etape).toBe('portes');
    expect(e.parcours).toEqual([['e1', 'portes', 0]]);
  });
});

describe('retenir et prolonger (barre de scène)', () => {
  const deuxEtapes = (extra: Parameters<typeof projet>[1] = {}) =>
    projet([moment('m', [etape('a', 10), etape('b', 10)], [sortie('a', 'b')])], extra);

  it('retenir : l’étape ne se termine pas par le temps, même très au-delà de sa durée', () => {
    const L = creerLecteur(deuxEtapes(), { mode: 'repetition' });
    avancerN(L, 3);
    const e = L.retenir(true);
    expect(e.retenu).toBe(true);
    const f = avancerN(L, 120);
    expect(f.etape).toBe('a');
    expect(f.retenu).toBe(true);
    expect(f.bloque).toBe(false);
    expect(f.tEtape).toBe(123);
  });

  it('retenir : les signaux sont comptés mais n’évaluent pas la sortie', () => {
    const p = projet([moment('m', [etape('a', 10), etape('b', 10)], [sortie('a', 'b', [cond('sig:go', '≥', 1)])])]);
    const L = creerLecteur(p, { mode: 'repetition' });
    L.retenir(true);
    avancerN(L, 20);
    const e = L.signal('go');
    expect(e.etape).toBe('a');
    expect(e.receptions?.go).toBe(1);
    expect(avancerN(L, 5).etape).toBe('a');
  });

  it('top() sort de l’étape tenue et lève la retenue', () => {
    const L = creerLecteur(deuxEtapes(), { mode: 'repetition' });
    L.retenir(true);
    avancerN(L, 30);
    const e = L.top();
    expect(e.etape).toBe('b');
    expect(e.retenu).toBe(false);
    // la nouvelle étape suit son cours normal
    expect(avancerN(L, 9).etape).toBe('b');
  });

  it('relâcher une étape dont la durée est échue la termine aussitôt', () => {
    const L = creerLecteur(deuxEtapes(), { mode: 'repetition' });
    L.retenir(true);
    avancerN(L, 30);
    const e = L.retenir(false);
    expect(e.retenu).toBe(false);
    expect(e.etape).toBe('b');
  });

  it('retenir est idempotent et journalisé une seule fois par changement', () => {
    const L = creerLecteur(deuxEtapes(), { mode: 'repetition' });
    L.retenir(true);
    L.retenir(true);
    const e = L.retenir(false);
    const j = (e.journal ?? []).filter(x => x.type === 'retenir');
    expect(j.map(x => x.valeur)).toEqual([true, false]);
  });

  it('retenir tient aussi un passage « auto » jusqu’au top', () => {
    const p = projet([
      moment('m1', [etape('a', 10)], []),
      moment('m2', [etape('b', 10)], []),
    ]);
    const L = creerLecteur(p, { mode: 'repetition' });
    avancerN(L, 3);
    L.retenir(true);
    expect(avancerN(L, 40).moment).toBe('m1');
    expect(L.top().moment).toBe('m2');
  });

  it('prolonger : décale la fin de l’étape, de façon cumulable', () => {
    const L = creerLecteur(deuxEtapes(), { mode: 'repetition' });
    avancerN(L, 5);
    expect(L.prolonger(30).prolonge).toBe(30);
    const e = L.prolonger(30);
    expect(e.prolonge).toBe(60);
    expect(avancerN(L, 64).etape).toBe('a'); // t = 69 < 10 + 60
    const f = avancerN(L, 1);
    expect(f.etape).toBe('b'); // t = 70
    expect(f.prolonge).toBe(0); // remis à zéro à l’entrée de l’étape
  });

  it('prolonger : journalisé, ignoré si la valeur est nulle ou négative', () => {
    const L = creerLecteur(deuxEtapes(), { mode: 'repetition' });
    L.prolonger(0);
    L.prolonger(-5);
    L.prolonger(Number.NaN);
    const e = L.prolonger(12);
    expect(e.prolonge).toBe(12);
    expect((e.journal ?? []).filter(x => x.type === 'prolonger').map(x => x.valeur)).toEqual([12]);
  });

  it('prolonger redonne du temps à une étape déjà bloquée', () => {
    const p = projet([moment('m', [etape('a', 10), etape('b', 10)], [sortie('a', 'b', [cond('quorum', '≥', 90)])])]);
    const L = creerLecteur(p, { mode: 'repetition' });
    expect(avancerN(L, 11).bloque).toBe(true);
    expect(L.prolonger(30).bloque).toBe(false);
  });

  it('sans effet quand le spectacle est terminé', () => {
    const L = creerLecteur(projet([moment('m', [etape('a', 10)], [])]), { mode: 'repetition' });
    expect(avancerN(L, 12).termine).toBe(true);
    const e = L.prolonger(30);
    expect(e.prolonge).toBe(0);
    expect(L.retenir(true).retenu).toBe(false);
  });

  it('allerA et reinitialiser effacent la retenue et la prolongation', () => {
    const p = projet([
      moment('m1', [etape('a', 10)], []),
      moment('m2', [etape('b', 10)], []),
    ]);
    const L = creerLecteur(p, { mode: 'repetition' });
    L.retenir(true);
    L.prolonger(30);
    const e = L.allerA('m2');
    expect(e.retenu).toBe(false);
    expect(e.prolonge).toBe(0);
    L.retenir(true);
    L.prolonger(30);
    const f = L.reinitialiser();
    expect(f.retenu).toBe(false);
    expect(f.prolonge).toBe(0);
    expect(f.journal).toEqual([]);
  });
});
