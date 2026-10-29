// Delta de lecture : calcul (serveur) et fusion (régie) doivent se retrouver exactement sur l'état complet.
import { describe, expect, it } from 'vitest';
import type { EtatLecture } from '@studio-real/modele';
import { calculerDelta, fusionnerDelta, suivreLecture } from './lecture-delta';
import { lireMessageServeur } from './lire';

const base = (): EtatLecture => ({
  t: 10, moment: 'm1', etape: 'accueil', tEtape: 10, attenteGo: false, retard: 0, bloque: false, termine: false,
  memoires: { a: 1, b: 'x' }, parcours: [['m1', 'accueil', 0]], phase: 'etape', attentes: {}, alertes: [], tours: {}, journal: [],
  commandes: [], reprises: [], receptions: { 'sig.un': 1 }, retenu: false, prolonge: 0,
});

describe('calculerDelta / fusionnerDelta', () => {
  it('rien n’a bougé : pas de changement', () => {
    const e = base();
    const suivi = suivreLecture(e);
    const r = calculerDelta(suivi, { ...e, memoires: { ...e.memoires } })!;
    expect(r.change).toBe(false);
    expect(r.d).toEqual({ t: 10, tEtape: 10 });
  });

  it('le temps qui passe : t et tEtape seulement', () => {
    const e = base();
    const suivi = suivreLecture(e);
    const r = calculerDelta(suivi, { ...e, t: 11, tEtape: 11 })!;
    expect(r.change).toBe(true);
    expect(r.d).toEqual({ t: 11, tEtape: 11 });
  });

  it('mémoires : seules les clés changées ; tableaux : seulement les entrées ajoutées ; fusion identique à l’état', () => {
    const e0 = base();
    const suivi = suivreLecture(e0);
    const e1: EtatLecture = {
      ...e0, t: 12, tEtape: 0, etape: 'vote', memoires: { a: 2, b: 'x', c: true }, parcours: [...e0.parcours, ['m1', 'vote', 12]],
      journal: [{ t: 12, type: 'memoire', nom: 'a', valeur: 2, moment: 'm1' }], receptions: {}, phase: 'etape',
    };
    const { d } = calculerDelta(suivi, e1)!;
    expect(d.memoires).toEqual({ a: 2, c: true });
    expect(d.parcours).toEqual([['m1', 'vote', 12]]);
    expect(d.journal).toHaveLength(1);
    expect(d.retires).toEqual(['receptions.sig.un']);
    expect(d.moment).toBeUndefined();
    expect(fusionnerDelta(e0, d)).toEqual(e1);
    // le suivi est à jour : le même état ne donne plus rien
    expect(calculerDelta(suivi, e1)!.change).toBe(false);
  });

  it('champs facultatifs qui apparaissent puis disparaissent : séquence, votes, issue', () => {
    const e0 = base();
    const suivi = suivreLecture(e0);
    const e1: EtatLecture = {
      ...e0, t: 11, tEtape: 11, issue: 'A', votes: { A: 60, B: 40 },
      sequence: { id: 's', nom: 'S', etape: 'x', tEtape: 1, chemin: ['S'] },
    };
    const r1 = calculerDelta(suivi, e1)!;
    expect(r1.d).toMatchObject({ issue: 'A', votes: { A: 60, B: 40 }, sequence: { id: 's' } });
    expect(fusionnerDelta(e0, r1.d)).toEqual(e1);
    const { votes: _v, sequence: _s, issue: _i, ...sans } = e1;
    const e2: EtatLecture = { ...sans, t: 12, tEtape: 12 };
    const r2 = calculerDelta(suivi, e2)!;
    expect(r2.d.retires).toEqual(expect.arrayContaining(['issue', 'votes', 'sequence']));
    expect(fusionnerDelta(e1, r2.d)).toEqual(e2);
  });

  it('un tableau qui rétrécit (lecteur relancé) : pas de delta, il faut un complet', () => {
    const e0 = { ...base(), journal: [{ t: 1, type: 'signal' as const, nom: 'x', moment: 'm1' }] };
    const suivi = suivreLecture(e0);
    expect(calculerDelta(suivi, { ...e0, journal: [] })).toBeNull();
  });

  it('reprises : la liste entière quand elle change', () => {
    const e0 = base();
    const suivi = suivreLecture(e0);
    const e1: EtatLecture = { ...e0, t: 11, tEtape: 11, reprises: [{ nom: 'p', t: 11, moment: 'm1', etape: 'accueil', restaure: 'tout', memoires: { a: 1 } }] };
    const { d } = calculerDelta(suivi, e1)!;
    expect(d.reprises).toHaveLength(1);
    expect(fusionnerDelta(e0, d)).toEqual(e1);
  });

  it('le suivi est du JSON ordinaire (il se range dans l’instantané du serveur)', () => {
    const suivi = suivreLecture(base());
    expect(JSON.parse(JSON.stringify(suivi))).toEqual(suivi);
  });

  it('une clé « __proto__ » dans un dictionnaire reste une simple clé', () => {
    const e0 = base();
    const suivi = suivreLecture(e0);
    const memoires = JSON.parse('{"a":1,"b":"x","__proto__":5}') as EtatLecture['memoires'];
    const e1: EtatLecture = { ...e0, t: 11, tEtape: 11, memoires };
    const brut = JSON.stringify({ t: 'lecture', mode: 'delta', seq: 2, ts: 1, par: 'serveur', d: calculerDelta(suivi, e1)!.d });
    const m = lireMessageServeur(brut).message!;
    if (m.t !== 'lecture' || m.mode !== 'delta') throw new Error('delta attendu');
    const f = fusionnerDelta(e0, m.d);
    expect(Object.getPrototypeOf(f.memoires)).toBe(Object.prototype);
    expect(Object.keys(f.memoires)).toContain('__proto__');
  });
});
