import { describe, expect, it } from 'vitest';
import {
  MARGE_FIN, ZOOM_MAX, ZOOM_MIN, bornerDefilement, defilementMax, fenetreVisible, fm, graduations, pasRegle, pxVersTemps, sousPasRegle,
  suivre, tempsVersPx, vueDepuisFenetre, zoomCentre, zoomMolette, zoomPourTout,
} from './temps';

describe('fm (MM:SS entiers)', () => {
  it('formate sans décimale', () => {
    expect(fm(0)).toBe('00:00');
    expect(fm(59.9)).toBe('00:59');
    expect(fm(61)).toBe('01:01');
    expect(fm(4500)).toBe('75:00');
  });
  it('borne les négatifs et les non-nombres à zéro', () => {
    expect(fm(-5)).toBe('00:00');
    expect(fm(Number.NaN)).toBe('00:00');
  });
});

describe('temps ↔ pixels', () => {
  it('aller-retour', () => {
    expect(tempsVersPx(120, 0.5)).toBe(60);
    expect(pxVersTemps(60, 0.5)).toBe(120);
    for (const pps of [0.05, 0.6, 3, 8]) expect(pxVersTemps(tempsVersPx(733, pps), pps)).toBeCloseTo(733, 9);
  });
  it('zoom nul : pas de division par zéro', () => {
    expect(pxVersTemps(100, 0)).toBe(0);
  });
});

describe('zoom centré sur la souris', () => {
  it('le temps sous la souris reste sous la souris', () => {
    const def = 300, pps = 0.6, ancre = 420;
    const t = (def + ancre) / pps;
    for (const p2 of [0.1, 1.2, 5]) {
      const d2 = zoomCentre(def, pps, p2, ancre);
      expect((d2 + ancre) / p2).toBeCloseTo(t, 9);
    }
  });
  it('ancre au bord gauche : le défilement suit le facteur', () => {
    expect(zoomCentre(100, 1, 2, 0)).toBeCloseTo(200, 9);
  });
  it('Alt + molette : vers le haut zoome, vers le bas dézoome, borné', () => {
    expect(zoomMolette(1, -100)).toBeGreaterThan(1);
    expect(zoomMolette(1, 100)).toBeLessThan(1);
    expect(zoomMolette(1, -100)).toBeCloseTo(Math.exp(0.3), 9); // |delta| borné à 50
    expect(zoomMolette(ZOOM_MAX, -50)).toBe(ZOOM_MAX);
    expect(zoomMolette(ZOOM_MIN, 50)).toBe(ZOOM_MIN);
  });
});

describe('défilement borné', () => {
  it('reste entre 0 et la fin de la conduite plus la marge', () => {
    expect(defilementMax(1000, 1, 600)).toBe(1000 + MARGE_FIN - 600);
    expect(bornerDefilement(-50, 1000, 1, 600)).toBe(0);
    expect(bornerDefilement(99999, 1000, 1, 600)).toBe(1000 + MARGE_FIN - 600);
    expect(bornerDefilement(200, 100, 1, 600)).toBe(0); // tout tient dans la vue
  });
  it('TOUT : la conduite tient dans la vue', () => {
    const pps = zoomPourTout(2400, 1240);
    expect(2400 * pps).toBeLessThanOrEqual(1240);
  });
});

describe('règle', () => {
  it('une étiquette a au moins 70 px, une petite graduation au moins 12 px (le design)', () => {
    for (const pps of [0.05, 0.2, 0.6, 1, 3, 8]) {
      const pas = pasRegle(pps), sp = sousPasRegle(pps);
      expect(pas * pps).toBeGreaterThanOrEqual(Math.min(70, 1800 * pps));
      expect(sp * pps).toBeGreaterThanOrEqual(Math.min(12, 1800 * pps));
      expect(pas % sp).toBe(0);
    }
    expect(pasRegle(100)).toBe(1);
    expect(pasRegle(0.01)).toBe(1800);
  });
  it('spectacle de 40 min au zoom TOUT (≈ 1410 px) : étiquettes toutes les 2 min, petites toutes les 30 s', () => {
    const pps = zoomPourTout(2412, 1410);
    expect(pasRegle(pps)).toBe(120);
    expect(sousPasRegle(pps)).toBe(30);
  });
  it('graduations entières en MM:SS ; les petites, sans étiquette, entre les étiquetées', () => {
    const g = graduations(0.6, 0, 600);
    const pas = pasRegle(0.6);
    const pleines = g.filter((x) => !x.sous);
    expect(pleines[0]).toMatchObject({ t: 0, x: 0, libelle: '00:00' });
    expect(pleines[1].t).toBe(pas);
    expect(pleines.every((x) => Number.isInteger(x.t))).toBe(true);
    expect(g.filter((x) => x.sous).every((x) => x.libelle === '' && x.t % pas !== 0)).toBe(true);
    expect(g.some((x) => x.sous)).toBe(sousPasRegle(0.6) < pas);
  });
});

describe('la vue suit la tête pendant la lecture', () => {
  it('rien tant que la tête est en vue', () => {
    expect(suivre(0, 500, 1000)).toBeNull();
  });
  it('à 30 px du bord droit, repart 60 px avant la tête', () => {
    expect(suivre(0, 980, 1000)).toBe(920);
    expect(suivre(2000, 100, 1000)).toBe(40);
  });
});

describe('barre de zoom', () => {
  it('fenêtre visible en fractions de la conduite', () => {
    const f = fenetreVisible(600, 1, 1200, 2400);
    expect(f.debut).toBeCloseTo(0.25, 9);
    expect(f.largeur).toBeCloseTo(0.5, 9);
  });
  it('poignées : une fenêtre de temps donne zoom et défilement', () => {
    const v = vueDepuisFenetre(300, 600, 1200, 2400);
    expect(v.pps).toBeCloseTo(2, 9);
    expect(v.defilement).toBeCloseTo(600, 9);
    expect(vueDepuisFenetre(0, 1, 1200, 2400).pps).toBeLessThanOrEqual(1200 / 20); // 20 s au moins
  });
});
