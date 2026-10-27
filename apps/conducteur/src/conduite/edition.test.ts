import { describe, expect, it } from 'vitest';
import { exempleDemo } from '@studio-real/modele';
import {
  ajouterActeFin, ajouterMomentFin, ajouterPiste, ajouterRepere, couperIci, deplacerElement, dureeClip, insererMoment,
  nouveauMomentIci, nouvelActeIci, positionsAbsolues, redimensionnerMoment, reglerPoint,
} from './edition';
import { planifier } from './planning';

const absolus = (p: ReturnType<typeof exempleDemo>) => new Map(positionsAbsolues(p).map(([it, a]) => [it.id, a]));

describe('créer depuis la conduite', () => {
  it('« nouveau moment ici » s’insère à la limite la plus proche et les clips restent à leur temps', () => {
    const p = exempleDemo();
    const avant = absolus(p);
    const plan = planifier(p);
    const t = plan.evs[2].S + 5; // juste après le début du 3e moment
    const id = nouveauMomentIci(p, t);
    expect(p.ev[2].id).toBe(id);
    expect(p.ev[2].act).toBe(p.ev[1].act);
    // les clips après l'insertion sont décalés de la durée du nouveau moment, ceux d'avant ne bougent pas
    const apres = absolus(p);
    const d = planifier(p).evs[2].E - planifier(p).evs[2].S;
    for (const [k, a] of avant) {
      if (a < plan.evs[2].S) expect(apres.get(k)).toBe(a);
    }
    expect(d).toBeGreaterThan(0);
    // la courbe de tension a un point pour le nouveau moment
    expect(p.tracks.find((x) => x.id === 't1')!.pts![id]).toBe(50);
  });

  it('« + » en fin de rangée : moment puis acte', () => {
    const p = exempleDemo();
    const id = ajouterMomentFin(p);
    expect(p.ev[p.ev.length - 1].id).toBe(id);
    expect(p.ev[p.ev.length - 1].act).toBe(2);
    const id2 = ajouterActeFin(p);
    expect(p.acts).toHaveLength(4);
    expect(p.ev.find((x) => x.id === id2)!.act).toBe(3);
  });

  it('les identifiants viennent de nid', () => {
    const p = exempleDemo();
    const nid = p.nid;
    const id = insererMoment(p, 0);
    expect(id).toBe('m' + (nid + 1));
    expect(p.nid).toBe(nid + 2); // le moment et sa première étape
  });

  it('« couper ici » coupe à la limite d’étape la plus proche', () => {
    const p = exempleDemo();
    const plan = planifier(p);
    const e = plan.evs[1]; // Prologue : voix → aube → apparition
    const r = couperIci(p, e.run[1].S + 3);
    expect(r.ok).toBe(true);
    expect(p.ev[1].st.map((x) => x.id)).toEqual(['voix']);
    expect(p.ev[2].name).toBe('Prologue · suite');
    expect(p.ev[2].entry).toBe('aube');
    expect(p.ev[2].st.map((x) => x.id).sort()).toEqual(['appar', 'aube']);
    // la durée totale ne change pas
    expect(planifier(p).total).toBeCloseTo(plan.total, 6);
  });

  it('« couper ici » refuse un moment à une seule étape jouée', () => {
    const p = exempleDemo();
    p.ev[0].st = [p.ev[0].st[0]];
    p.ev[0].tr = [];
    const r = couperIci(p, 5);
    expect(r.ok).toBe(false);
  });

  it('« nouvel acte à partir d’ici »', () => {
    const p = exempleDemo();
    const plan = planifier(p);
    const r = nouvelActeIci(p, plan.evs[1].S + 1); // limite la plus proche : début du Prologue
    expect(r.ok).toBe(true);
    expect(p.acts.map((a) => a.n)).toEqual(['Accueil', 'Nouvel acte', 'Le choix', 'Dénouement']);
    expect(p.ev.map((x) => x.act)).toEqual([0, 1, 2, 2, 2, 3, 3]);
    // un moment qui ouvre déjà un acte
    const r2 = nouvelActeIci(p, planifier(p).evs[1].S + 1);
    expect(r2.ok).toBe(false);
  });
});

describe('glisser et régler', () => {
  it('décaler un clip le raccroche au moment qui joue à son nouveau temps', () => {
    const p = exempleDemo();
    const plan = planifier(p);
    const cible = plan.evs[4].S + 12;
    deplacerElement(p, 't4', 'c1', cible);
    const c = p.tracks.find((x) => x.id === 't4')!.clips!.find((x) => x.id === 'c1')!;
    expect(c.ev).toBe('e5');
    expect(c.off).toBe(12);
    dureeClip(p, 't4', 'c1', 1);
    expect(c.dur).toBe(2);
  });

  it('poignée d’un moment : les durées prévues des étapes jouées suivent', () => {
    const p = exempleDemo();
    const d0 = planifier(p).evs[1];
    redimensionnerMoment(p, 'e2', 2);
    const d1 = planifier(p).evs[1];
    expect((d1.E - d1.S) / (d0.E - d0.S)).toBeGreaterThan(1.8);
  });

  it('points de courbe bornés 0 → 100, repères et pistes', () => {
    const p = exempleDemo();
    reglerPoint(p, 't1', 'e3', 140);
    expect(p.tracks[0].pts!.e3).toBe(100);
    const id = ajouterRepere(p, 't7', 30)!;
    expect(p.tracks.find((x) => x.id === 't7')!.marks!.find((x) => x.id === id)).toMatchObject({ ev: 'e1', off: 30, lead: 10 });
    const tid = ajouterPiste(p, 'video');
    expect(p.tracks.find((x) => x.id === tid)).toMatchObject({ type: 'video', name: 'Écran de scène', clips: [] });
  });
});
