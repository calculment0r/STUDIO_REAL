import { describe, expect, it } from 'vitest';
import {
  BLOCS_MOTEUR, comportementBloc, reglagesBoucle, reglagesChrono, reglagesComedien, reglagesFigurants, reglagesGarde,
  reglagesMachine, reglagesMemoire, reglagesMessage, reglagesReprise, reglagesSequence, reglagesSignal,
} from '@studio-real/modele';
import { APERCUS, HAUTEUR_APERCU, LARGEUR_APERCU } from './apercus';
import { CATALOGUE, FAMILLES, TY_FIGURANTS_IA, TY_NOUVEAUX, formaterReglage, sortiesExec, trouverBloc, valeurReglage } from './catalogue';
import { construireOptions } from './options';
import { palette } from './palette';
import { avancerSimulation, nouvelleSimulation } from './simulation';

const base = CATALOGUE.blocs.filter((b) => b.base);
const blocs = CATALOGUE.blocs.filter((b) => !b.base);
const design = blocs.filter((b) => !b.nouveau);
const nouveaux = blocs.filter((b) => b.nouveau);

/** Contexte 2D factice : toutes les méthodes sont des fonctions vides, toutes les propriétés sont modifiables. */
function faux2d(): CanvasRenderingContext2D {
  const etat: Record<string | symbol, unknown> = {};
  return new Proxy(etat, {
    get: (o, k) => (k in o ? o[k] : () => undefined),
    set: (o, k, v) => { o[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

describe('catalogue des blocs', () => {
  it('compte 8 étapes de base, les blocs du design, les 10 blocs de l’étude et les 2 blocs figurants', () => {
    expect(base.map((b) => b.ty)).toEqual(['k:attente', 'k:calage', 'k:scene', 'k:son', 'k:lum', 'k:fondu', 'k:passage', 'k:issue']);
    // blocs.js en déclare 35 (b1–b8, f1–f6, d1–d4, c1–c4, x1–x6, u1–u3, s1–s3, g1) ; l'étude en annonce « 34 ».
    expect(design).toHaveLength(35);
    expect(nouveaux).toHaveLength(12);
    expect(nouveaux.filter((b) => b.origine === 'étude des 10 blocs').map((b) => b.ty).sort()).toEqual(Object.values(TY_NOUVEAUX).sort());
    expect(nouveaux.filter((b) => b.origine === 'étude figurants IA').map((b) => b.ty)).toEqual(['x:figurants', 'q:comedien-dit']);
    expect(Object.values(TY_FIGURANTS_IA)).toEqual(['x:figurants', 'q:comedien-dit']);
    expect(blocs).toHaveLength(47);
  });

  it('chaque bloc nouveau a son comportement dans le moteur', () => {
    for (const b of nouveaux) expect(comportementBloc(b.ty), b.ty).not.toBe('normal');
    expect(Object.keys(BLOCS_MOTEUR).sort()).toEqual(nouveaux.map((b) => b.ty).sort());
    expect(trouverBloc('x:figurants')!.famille).toBe('scene');
    expect(trouverBloc('q:comedien-dit')!.famille).toBe('trig');
  });

  it('a des codes uniques retrouvés par trouverBloc', () => {
    const codes = CATALOGUE.blocs.map((b) => b.ty);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(trouverBloc(c)?.ty).toBe(c);
    expect(trouverBloc('inconnu')).toBeUndefined();
    for (const c of ['u1', 'b3', 'd1', 'x2', 'x3', 'u3', 'k:attente']) expect(trouverBloc(c)).toBeDefined();
  });

  it('range chaque bloc dans une famille connue, avec ses couleurs sombre et clair', () => {
    const ids = new Set(FAMILLES.map((f) => f.id));
    for (const b of CATALOGUE.blocs) {
      expect(ids.has(b.famille), b.ty).toBe(true);
      expect(b.couleur.sombre).toMatch(/^#[0-9a-f]{6}$/);
      expect(b.couleur.clair).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const f of FAMILLES) expect(CATALOGUE.blocs.some((b) => b.famille === f.id), f.id).toBe(true);
  });

  it('donne des réglages cohérents (deux rotatifs au plus utilisés, défaut 0 → 100)', () => {
    for (const b of CATALOGUE.blocs) {
      for (const r of b.reglages) {
        expect(r.defaut, b.ty + ' ' + r.nom).toBeGreaterThanOrEqual(0);
        expect(r.defaut).toBeLessThanOrEqual(100);
        expect(r.max).toBeGreaterThan(r.min);
        if (r.choix) expect(r.choix.length).toBe(r.max - r.min + 1);
        expect(formaterReglage(r, r.defaut)).not.toBe('');
      }
    }
    expect(formaterReglage(trouverBloc('f2')!.reglages[0], 30)).toBe('3,0 s');
  });

  it('nomme les sorties des blocs de l’étude', () => {
    const noms = (ty: string) => sortiesExec(trouverBloc(ty)!).map((p) => p.nom);
    expect(noms(TY_NOUVEAUX.garde)).toEqual(['condition remplie', 'délai dépassé']);
    expect(noms(TY_NOUVEAUX.machine)).toEqual(['confirmé', 'sans réponse']);
    expect(noms(TY_NOUVEAUX.boucle)).toEqual(['encore', 'terminé']);
    expect(noms(TY_NOUVEAUX.message)).toEqual(['lu', 'non lu']);
    expect(noms(TY_NOUVEAUX.chrono)).toEqual(['zéro', '10 s restantes']);
    expect(noms(TY_NOUVEAUX.signal)).toEqual(['reçu']);
    expect(noms(TY_NOUVEAUX.sequence)).toEqual(['fin']);
    expect(noms(TY_FIGURANTS_IA.figurants)).toEqual(['fini']);
    expect(noms(TY_FIGURANTS_IA.comedienDit)).toEqual(['dit', 'pas dit']);
    for (const b of nouveaux) { expect(b.entrees).toHaveLength(1); expect(b.siProbleme).toBeTruthy(); }
  });

  it('suit le moteur (blocs-moteur.ts) : codes, familles, sorties nommées, lecture des rotatifs', () => {
    for (const m of Object.values(BLOCS_MOTEUR)) {
      const b = trouverBloc(m.ty)!;
      expect(b, m.ty).toBeDefined();
      expect(b.famille).toBe(m.famille);
      expect(b.reglages.slice(0, 2).map((r) => r.nom)).toEqual(m.reglages);
      if (m.sorties.length) expect(sortiesExec(b).map((p) => p.nom)).toEqual(m.sorties);
    }
    const garde = trouverBloc(TY_NOUVEAUX.garde)!, memoire = trouverBloc(TY_NOUVEAUX.memoire)!, boucle = trouverBloc(TY_NOUVEAUX.boucle)!;
    for (const k1 of [0, 17, 50, 100]) expect(Math.round(valeurReglage(garde.reglages[0], k1))).toBe(reglagesGarde({ k: [8, k1, 0] }).delai);
    for (const k2 of [0, 50, 51, 100]) expect(formaterReglage(garde.reglages[1], k2)).toBe(reglagesGarde({ k: [8, 0, k2] }).echeance === 'top' ? 'demander le top' : 'continuer');
    for (const k1 of [0, 33, 34, 66, 67, 100]) expect(['poser', 'ajouter', 'zero'][valeurReglage(memoire.reglages[0], k1)]).toBe(reglagesMemoire({ id: 'x', name: 'x', k: [8, k1, 5] }).op);
    for (const k1 of [0, 11, 50, 99, 100]) expect(valeurReglage(boucle.reglages[0], k1)).toBe(reglagesBoucle({ k: [8, k1, 0] }).tours);
  });

  it('lit les rotatifs des blocs à événements et des figurants comme le moteur', () => {
    const b = (ty: string) => trouverBloc(ty)!;
    const choixDe = (ty: string, i: number, k: number) => formaterReglage(b(ty).reglages[i], k);
    const nombre = (ty: string, i: number, k: number) => valeurReglage(b(ty).reglages[i], k);
    for (const k of [0, 25, 26, 50, 51, 75, 76, 100]) {
      expect(choixDe(TY_NOUVEAUX.signal, 0, k)).toBe(reglagesSignal({ id: 's', k: [8, k, 0] }).source);
      expect(choixDe(TY_NOUVEAUX.machine, 0, k)).toBe(reglagesMachine({ id: 's', k: [8, k, 0] }).cible);
      expect(choixDe(TY_NOUVEAUX.message, 0, k)).toBe(reglagesMessage({ id: 's', name: 's', k: [8, k, 0] }).destinataire);
      expect(choixDe(TY_NOUVEAUX.chrono, 1, k)).toBe(reglagesChrono({ k: [8, 0, k] }).affichage);
      expect(choixDe(TY_FIGURANTS_IA.figurants, 0, k)).toBe(reglagesFigurants({ k: [8, k, 0] }).densite);
      expect(choixDe(TY_FIGURANTS_IA.figurants, 1, k)).toBe(reglagesFigurants({ k: [8, 0, k] }).humeur);
      expect(choixDe(TY_FIGURANTS_IA.comedienDit, 1, k) === 'approchant').toBe(reglagesComedien({ k: [8, 0, k] }).approchant);
      expect(['tout', 'memoires', 'plateau', 'ecrans'][nombre(TY_NOUVEAUX.reprise, 0, k)]).toBe(reglagesReprise({ id: 'r', name: 'r', k: [8, k, 0] }).restaure);
      expect(Math.round(nombre(TY_NOUVEAUX.signal, 1, k))).toBe(reglagesSignal({ id: 's', k: [8, 0, k] }).fois);
      expect(Math.round(nombre(TY_NOUVEAUX.machine, 1, k) * 10) / 10).toBe(reglagesMachine({ id: 's', k: [8, 0, k] }).delai);
      expect(Math.round(nombre(TY_NOUVEAUX.message, 1, k))).toBe(reglagesMessage({ id: 's', name: 's', k: [8, 0, k] }).delai);
      expect(Math.round(nombre(TY_NOUVEAUX.chrono, 0, k))).toBe(reglagesChrono({ k: [8, k, 0] }).duree);
      expect(Math.round(nombre(TY_FIGURANTS_IA.comedienDit, 0, k))).toBe(reglagesComedien({ k: [8, k, 0] }).delai);
      expect(nombre(TY_NOUVEAUX.sequence, 0, k) / 100).toBeCloseTo(reglagesSequence({ k: [8, k, 0] }).facteur, 9);
    }
  });

  it('dessine les aperçus figurants avec leurs réglages propres (silence, folie, intention, mots-clés)', () => {
    const S = nouvelleSimulation();
    const cas: [string, number[], Record<string, unknown> | undefined][] = [
      ['x:figurants', [8, 0, 0], undefined],
      ['x:figurants', [8, 100, 60], { intention: 'il a oublié son portefeuille chez la boulangère' }],
      ['q:comedien-dit', [8, 0, 100], { mots: 'religieuse, gâteau' }],
      ['q:comedien-dit', [8, 50, 0], { mots: ['un mot très très long qui ne tient pas dans le bloc'] }],
    ];
    for (const [ty, k, params] of cas) {
      for (const t of [0, 1.7, 4.2, 30]) {
        const o = construireOptions(trouverBloc(ty), { k, t, actif: t > 1, params }, 'sombre', t);
        expect(() => APERCUS[ty]!(faux2d(), LARGEUR_APERCU, HAUTEUR_APERCU, t, palette('sombre'), S, o), ty).not.toThrow();
      }
    }
  });

  it('a un aperçu pour chaque bloc, qui se dessine sans erreur dans les deux thèmes', () => {
    const S = nouvelleSimulation();
    for (let i = 0; i < 40; i++) avancerSimulation(S, .1, i * .1);
    for (const b of CATALOGUE.blocs) {
      const dessin = APERCUS[b.apercu];
      expect(typeof dessin, b.ty).toBe('function');
      for (const theme of ['sombre', 'clair'] as const) {
        for (const [t, actif, boucle] of [[0, false, false], [12, true, false], [0, false, true]] as const) {
          const o = construireOptions(b, { k: [8, 50, 50], t, actif, boucle }, theme, 37.3);
          expect(() => dessin(faux2d(), LARGEUR_APERCU, HAUTEUR_APERCU, 37.3, palette(theme), S, o), b.ty).not.toThrow();
        }
      }
    }
  });
});
