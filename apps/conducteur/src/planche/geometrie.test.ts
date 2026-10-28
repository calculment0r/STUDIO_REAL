import { describe, expect, it } from 'vitest';
import { exempleDemo, type Moment } from '@studio-real/modele';
import {
  ajouterSortie, cadrerSansZoom, cadreAuPoint, cadrer, cheminLien, creerEtape, deplacerSortie, ecranVersMonde, etapeDeFin, fm,
  flecheProchain, grilleDepuisPoint, hauteurBloc, intersecte, libelleCondition, liensDuMoment, mondeVersEcran, niveauZoom,
  placerMoments, pointSurLien, positionEtape, progressionEtape, rapprocher, regleSortie, rondEntree, rondSortie,
  statutSortie, statutsMoment, supprimerEtape, vueMonde, yRondSortie, zoomDeSpectacle, zoomerAutour,
  LARGEUR_BLOC, MARGE_CADRE, PAS_COLONNE, PAS_RANGEE, ZOOM_MAX, ZOOM_MIN, ZOOM_NIVEAU,
} from './geometrie';

describe('placement colonne / rangée → x / y', () => {
  it('place une étape selon c, r, dx, dy', () => {
    expect(positionEtape(0, { c: 0, r: 0, dx: 0, dy: 0 })).toEqual({ x: MARGE_CADRE, y: 0 });
    expect(positionEtape(1000, { c: 2, r: -1, dx: 5, dy: -7 })).toEqual({ x: 1000 + MARGE_CADRE + 2 * PAS_COLONNE + 5, y: -PAS_RANGEE - 7 });
  });

  it('enchaîne les cadres de moments de gauche à droite sans chevauchement', () => {
    const F = placerMoments(exempleDemo().ev);
    expect(F).toHaveLength(7);
    for (let i = 1; i < F.length; i++) {
      expect(F[i].r.x).toBeGreaterThanOrEqual(F[i - 1].r.x + F[i - 1].r.w + 179);
      expect(intersecte(F[i].r, F[i - 1].r)).toBe(false);
    }
    // chaque étape est dans son cadre
    for (const f of F) for (const st of f.moment.st) {
      const p = f.P[st.id];
      expect(p.x).toBeGreaterThanOrEqual(f.r.x);
      expect(p.x + LARGEUR_BLOC).toBeLessThanOrEqual(f.r.x + f.r.w);
      expect(p.y).toBeGreaterThan(f.r.y);
    }
  });

  it('le cadre englobe les branches (rangées ±1)', () => {
    const F = placerMoments(exempleDemo().ev);
    const vote = F[2];
    expect(vote.P.issA.y).toBe(-PAS_RANGEE);
    expect(vote.P.tir.y).toBe(PAS_RANGEE);
    expect(vote.r.y).toBeLessThan(-PAS_RANGEE);
    expect(vote.r.y + vote.r.h).toBeGreaterThan(PAS_RANGEE + 200);
  });

  it('applique un décalage provisoire de glisser sans toucher au projet', () => {
    const ev = exempleDemo().ev;
    const F = placerMoments(ev, { moment: 'e1', etape: 'calage', ddx: 30, ddy: -12 });
    const G = placerMoments(ev);
    expect(F[0].P.calage).toEqual({ x: G[0].P.calage.x + 30, y: G[0].P.calage.y - 12 });
    expect(ev[0].st[1].dx).toBe(0);
  });

  it('grilleDepuisPoint est l’inverse du placement', () => {
    const fx = 812;
    const g = grilleDepuisPoint(fx, fx + MARGE_CADRE + 2 * PAS_COLONNE + 37, -PAS_RANGEE + 12);
    expect(g).toEqual({ c: 2, r: -1, dx: 37, dy: 12 });
    expect(positionEtape(fx, g)).toEqual({ x: fx + MARGE_CADRE + 2 * PAS_COLONNE + 37, y: -PAS_RANGEE + 12 });
  });

  it('trouve le cadre sous un point, ou le plus proche', () => {
    const F = placerMoments(exempleDemo().ev);
    expect(cadreAuPoint(F, F[3].r.x + 10, F[3].r.y + 10)?.moment.id).toBe('e4');
    expect(cadreAuPoint(F, F[3].r.x - 20, 99999)?.moment.id).toBe('e4');
  });
});

describe('niveaux de zoom', () => {
  it('trois niveaux : < 50 %, 50–100 %, > 100 %', () => {
    expect(niveauZoom(0.2)).toBe('loin');
    expect(niveauZoom(0.49)).toBe('loin');
    expect(niveauZoom(0.5)).toBe('moyen');
    expect(niveauZoom(1)).toBe('moyen');
    expect(niveauZoom(1.01)).toBe('pres');
    expect(hauteurBloc('loin')).toBeLessThan(hauteurBloc('moyen'));
    expect(hauteurBloc('moyen')).toBeLessThan(hauteurBloc('pres'));
  });
});

describe('caméra : écran ↔ monde', () => {
  const c = { px: 120, py: -40, z: 0.8 };
  it('aller-retour exact', () => {
    const w = ecranVersMonde(c, 500, 300);
    const s = mondeVersEcran(c, w.x, w.y);
    expect(s.x).toBeCloseTo(500); expect(s.y).toBeCloseTo(300);
  });
  it('zoomer autour d’un point le garde fixe à l’écran', () => {
    const avant = ecranVersMonde(c, 400, 250);
    const n = zoomerAutour(c, 1.6, 400, 250);
    const apres = ecranVersMonde(n, 400, 250);
    expect(apres.x).toBeCloseTo(avant.x); expect(apres.y).toBeCloseTo(avant.y);
    expect(zoomerAutour(c, 99, 0, 0).z).toBe(ZOOM_MAX);
    expect(zoomerAutour(c, 0.001, 0, 0).z).toBe(ZOOM_MIN);
  });
  it('vue du monde visible', () => {
    const v = vueMonde({ px: -100, py: 50, z: 2 }, 800, 400);
    expect(v).toEqual({ x: 50, y: -25, w: 400, h: 200 });
  });
  it('cadrer centre le rectangle et le fait tenir', () => {
    const r = { x: 1000, y: -90, w: 1500, h: 400 };
    const cam = cadrer(r, 1200, 600);
    const a = mondeVersEcran(cam, r.x, r.y), b = mondeVersEcran(cam, r.x + r.w, r.y + r.h);
    expect(a.x).toBeGreaterThanOrEqual(0); expect(b.x).toBeLessThanOrEqual(1200);
    expect((a.x + b.x) / 2).toBeCloseTo(600);
    expect(cam.z).toBeLessThanOrEqual(1.05);
  });
  it('rapprocher converge vers la cible', () => {
    let cam = { px: 0, py: 0, z: 0.3 };
    const cible = { px: 500, py: -200, z: 0.9 };
    for (let i = 0; i < 120; i++) cam = rapprocher(cam, cible, 0.1);
    expect(cam.px).toBeCloseTo(500, 0); expect(cam.z).toBeCloseTo(0.9, 2);
  });
});

describe('géométrie des liens', () => {
  it('ronds collés au bord du bloc', () => {
    const p = { x: 100, y: 50 };
    expect(rondEntree(p)).toEqual({ x: 100, y: 78 });
    expect(rondSortie(p, 0, 'moyen')).toEqual({ x: 100 + LARGEUR_BLOC, y: 78 });
    expect(rondSortie(p, 2, 'moyen').y).toBe(50 + 68);
    // à distance toutes les sorties partent du même rond
    expect(yRondSortie(3, 'loin')).toBe(yRondSortie(0, 'loin'));
    // jamais sous le bas du bloc
    expect(yRondSortie(50, 'moyen')).toBeLessThanOrEqual(hauteurBloc('moyen') - 16);
  });
  it('courbe de Bézier : départ et arrivée exacts, tangentes horizontales', () => {
    expect(cheminLien(0, 0, 300, 100)).toBe('M0 0 C135 0 165 100 300 100');
    expect(cheminLien(0, 0, 50, 0)).toBe('M0 0 C40 0 10 0 50 0');
    const p0 = pointSurLien(0, 0, 300, 100, 0), p1 = pointSurLien(0, 0, 300, 100, 1), pm = pointSurLien(0, 0, 300, 100, 0.5);
    expect(p0).toEqual({ x: 0, y: 0 }); expect(p1).toEqual({ x: 300, y: 100 });
    expect(pm.x).toBeCloseTo(150); expect(pm.y).toBeCloseTo(50);
  });
  it('liens d’un moment avec ordre des sorties', () => {
    const F = placerMoments(exempleDemo().ev);
    const L = liensDuMoment(F[2], 'moyen');
    const depuisDecompte = L.filter(l => l.sortie.a === 'depou');
    expect(depuisDecompte.map(l => l.ordre)).toEqual([0, 1, 2]);
    expect(depuisDecompte.every(l => l.nb === 3)).toBe(true);
    expect(depuisDecompte[1].a.y).toBeGreaterThan(depuisDecompte[0].a.y);
    expect(depuisDecompte[0].b).toEqual(rondEntree(F[2].P.issA));
  });
});

describe('édition des sorties et des étapes', () => {
  const moment = (): Moment => structuredClone(exempleDemo().ev[2]);
  it('réordonne les sorties d’une même étape', () => {
    const m = moment();
    const i = m.tr.findIndex(s => s.a === 'depou' && s.b === 'issB');
    const j = deplacerSortie(m, i, -1);
    expect(m.tr.filter(s => s.a === 'depou').map(s => s.b)).toEqual(['issB', 'issA', 'tir']);
    expect(m.tr[j].b).toBe('issB');
    expect(deplacerSortie(m, j, -1)).toBe(-1);
  });
  it('crée une sortie, refuse doublon et boucle sur soi', () => {
    const m = moment();
    expect(ajouterSortie(m, 'issA', 'issB')).toBe(true);
    expect(ajouterSortie(m, 'issA', 'issB')).toBe(false);
    expect(ajouterSortie(m, 'issA', 'issA')).toBe(false);
    expect(m.tr[m.tr.length - 1]).toEqual({ a: 'issA', b: 'issB', g: [], mode: 'all' });
  });
  it('supprime une étape et ses sorties, jamais l’entrée', () => {
    const m = moment();
    expect(supprimerEtape(m, 'quest')).toBe(false);
    expect(supprimerEtape(m, 'depou')).toBe(true);
    expect(m.st.some(e => e.id === 'depou')).toBe(false);
    expect(m.tr.some(s => s.a === 'depou' || s.b === 'depou')).toBe(false);
  });
  it('crée une étape au point du monde avec un id libre', () => {
    const p = exempleDemo();
    const F = placerMoments(p.ev);
    const id = creerEtape(p, 'e2', F[1].fx, F[1].fx + MARGE_CADRE + PAS_COLONNE + 10, 20)!;
    const st = p.ev[1].st.find(e => e.id === id)!;
    expect(st).toMatchObject({ c: 1, r: 0, dx: 10, dy: 20 });
    expect(p.nid).toBe(101);
  });
});

describe('libellés et lecture', () => {
  it('règles lisibles sur les liens', () => {
    expect(libelleCondition({ k: 'quorum', op: '≥', v: 60 })).toBe('60 % des votes reçus');
    expect(libelleCondition({ k: 't', op: '≥', v: 90 })).toBe('après 01:30');
    expect(libelleCondition({ k: 'issue', op: '=', v: 'T' })).toBe('égalité au vote');
    expect(regleSortie({ a: 'x', b: 'y', g: [], mode: 'all' }, 2)).toMatch(/^sinon/);
    expect(regleSortie({ a: 'x', b: 'y', g: [{ k: 'quorum', op: '≥', v: 60 }, { k: 't', op: '≥', v: 90 }], mode: 'any' }, 1))
      .toBe('60 % des votes reçus ou après 01:30');
    expect(fm(61.9)).toBe('01:01');
  });
  it('statuts des étapes et des sorties', () => {
    const m = exempleDemo().ev[2];
    const l = { moment: 'e3', etape: 'depou', parcours: [['e3', 'quest', 0], ['e3', 'vote', 34], ['e3', 'depou', 128]] as [string, string, number][] };
    const s = statutsMoment(m, 2, 2, l);
    expect(s.quest).toBe('joue'); expect(s.depou).toBe('actif'); expect(s.issA).toBe('avenir');
    expect(statutsMoment(m, 2, 4, { moment: 'e5', etape: 'prep', parcours: [] }).issA).toBe('ignore');
    expect(statutsMoment(m, 2, -1, null).quest).toBe('neutre');
    const pm = ['quest', 'vote', 'depou'];
    expect(statutSortie(m.tr[0], s, pm)).toBe('franchie');
    expect(statutSortie(m.tr[2], s, pm)).toBe('evaluee');
    expect(progressionEtape({ k: [1] }, 8)).toBeCloseTo(0.5);
    expect(progressionEtape({ k: [1] }, 99)).toBe(1);
  });
  it('étape de fin d’un moment', () => {
    const F = placerMoments(exempleDemo().ev);
    expect(etapeDeFin(F[0].moment, F[0])).toBe('noir');
    expect(etapeDeFin(F[2].moment, F[2])).toBe('issB');
  });
});

describe('caméra de spectacle : panoramique sans changement de zoom', () => {
  const r = { x: 1000, y: -200, w: 800, h: 400 };

  it('garde exactement le zoom demandé, quel que soit le moment cadré', () => {
    const F = placerMoments(exempleDemo().ev);
    for (const f of F) expect(cadrerSansZoom(f.r, 1200, 600, 0.75).z).toBe(0.75);
  });
  it('centre le rectangle quand il tient dans la vue', () => {
    const cam = cadrerSansZoom(r, 1200, 700, 0.8);
    const c = mondeVersEcran(cam, r.x + r.w / 2, r.y + r.h / 2);
    expect(c.x).toBeCloseTo(600, 6);
    expect(c.y).toBeCloseTo(64 + (700 - 64 - 56) / 2, 6);
  });
  it('cale le bord gauche et le bord haut sur la marge quand le rectangle déborde', () => {
    const grand = { x: 500, y: 100, w: 4000, h: 3000 };
    const cam = cadrerSansZoom(grand, 1000, 600, 0.75);
    expect(mondeVersEcran(cam, grand.x, grand.y)).toEqual({ x: 40, y: 64 });
  });
  it('un changement de moment ne déplace que le panoramique (px, py), jamais z', () => {
    const F = placerMoments(exempleDemo().ev);
    const a = cadrerSansZoom(F[1].r, 1200, 600, 0.75), b = cadrerSansZoom(F[2].r, 1200, 600, 0.75);
    expect(a.z).toBe(b.z);
    expect(a.px).not.toBe(b.px);
  });
  it('zoom de spectacle : on garde un zoom lisible, la vue d’ensemble passe au niveau ÉTAPES', () => {
    expect(zoomDeSpectacle(0.9)).toBe(0.9);
    expect(zoomDeSpectacle(0.5)).toBe(0.5);
    expect(zoomDeSpectacle(1.4)).toBe(1.4);
    expect(zoomDeSpectacle(0.3)).toBe(ZOOM_NIVEAU.moyen);
    expect(zoomDeSpectacle(9)).toBe(ZOOM_MAX);
  });
});

describe('flèche « PROCHAIN » : direction à partir de la vue et du rectangle suivant', () => {
  const vue = { x: 0, y: 0, w: 1000, h: 600 };

  it('suivant à droite : bord droit, angle nul, à mi-hauteur', () => {
    const f = flecheProchain(vue, { x: 1500, y: 250, w: 400, h: 100 });
    expect(f?.bord).toBe('droite');
    expect(f?.angle).toBeCloseTo(0, 6);
    expect(f?.u).toBeCloseTo(1, 6);
    expect(f?.v).toBeCloseTo(0.5, 6);
  });
  it('suivant à gauche : bord gauche, angle π', () => {
    const f = flecheProchain(vue, { x: -1400, y: 250, w: 400, h: 100 });
    expect(f?.bord).toBe('gauche');
    expect(Math.abs(f?.angle ?? 0)).toBeCloseTo(Math.PI, 6);
    expect(f?.u).toBeCloseTo(0, 6);
  });
  it('suivant en dessous / au-dessus : bord bas (angle +π/2) / haut (−π/2)', () => {
    const bas = flecheProchain(vue, { x: 400, y: 1500, w: 200, h: 200 });
    expect(bas?.bord).toBe('bas'); expect(bas?.angle).toBeCloseTo(Math.PI / 2, 6); expect(bas?.v).toBeCloseTo(1, 6);
    const haut = flecheProchain(vue, { x: 400, y: -1700, w: 200, h: 200 });
    expect(haut?.bord).toBe('haut'); expect(haut?.angle).toBeCloseTo(-Math.PI / 2, 6); expect(haut?.v).toBeCloseTo(0, 6);
  });
  it('suivant en diagonale : la flèche se pose sur le bord touché en premier, avec une fraction entre 0 et 1', () => {
    const f = flecheProchain(vue, { x: 1900, y: 1000, w: 200, h: 200 });
    expect(f).not.toBeNull();
    expect(f!.u).toBeGreaterThanOrEqual(0); expect(f!.u).toBeLessThanOrEqual(1);
    expect(f!.v).toBeGreaterThan(0.5); expect(f!.angle).toBeGreaterThan(0); expect(f!.angle).toBeLessThan(Math.PI / 2);
  });
  it('rien à signaler quand le centre du suivant est déjà dans la vue, ou quand la vue est vide', () => {
    expect(flecheProchain(vue, { x: 600, y: 100, w: 800, h: 200 })).toBeNull();
    expect(flecheProchain({ x: 0, y: 0, w: 0, h: 600 }, { x: 5000, y: 0, w: 10, h: 10 })).toBeNull();
  });
  it('avec la vraie planche : depuis le premier moment cadré à 75 %, le deuxième est à droite', () => {
    const F = placerMoments(exempleDemo().ev);
    const cam = cadrerSansZoom(F[0].r, 1200, 600, 0.75);
    const f = flecheProchain(vueMonde(cam, 1200, 600), F[1].r);
    if (f) { expect(f.bord).toBe('droite'); expect(Math.abs(f.angle)).toBeLessThan(Math.PI / 2); }
    // le centre du moment suivant est toujours à droite de la vue qui cadre le précédent
    expect(F[1].r.x + F[1].r.w / 2).toBeGreaterThan(F[0].r.x + F[0].r.w / 2);
  });
});
