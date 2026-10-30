// Barre de scène : dérivation des libellés et des états (barre-etat.ts, module pur). @testing-library/react n'est pas
// installé : l'affichage est vérifié ici sur ce que le composant reçoit, et l'appui long sur son contrôleur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { creerLecteur, type EtatLecture, type Projet } from '@studio-real/modele';
import echo from '../../../../projets/echo/echo.conducteur.json';
import {
  DUREE_APPUI_LONG_MS, PAS_PROLONGER_S, confirmationRequise, creerAppuiLong, dureeMinimale, enCoursDe, filtrerSauts, listeSauts,
  phraseConfirmation, progresAppuiLong, vueBarre, type EntreeBarre,
} from './barre-etat';

const projet = (echo as unknown as { project: Projet }).project;
const SIG = { pres: 0, quorum: 0, prets: 0, bruit: 32, assis: 100 };
/** État du lecteur d'Écho après `dt` secondes dans le premier moment (puis réglages éventuels). */
function lecture(dt = 3, regler?: (l: ReturnType<typeof creerLecteur>) => void): EtatLecture {
  const l = creerLecteur(projet, { mode: 'scene', graine: 1 });
  if (dt > 0) l.avancer(dt, SIG);
  regler?.(l);
  return l.etat();
}
const entree = (o: Partial<EntreeBarre> = {}): EntreeBarre => ({ lecture: lecture(), enLecture: true, projet, enPanique: false, goRecent: false, ...o });

describe('vueBarre · états des boutons', () => {
  it('au repos : GO, RETENIR non enfoncé, +30 s sans cumul, PAUSE, PANIQUE', () => {
    const v = vueBarre(entree());
    expect(v.go).toMatchObject({ libelle: 'GO', desactive: false, attente: false });
    expect(v.retenir).toMatchObject({ libelle: 'RETENIR', enfonce: false, desactive: false });
    expect(v.prolonger).toMatchObject({ libelle: '+30 s', cumul: 0, cumulTxt: '', desactive: false });
    expect(v.pause).toMatchObject({ libelle: 'PAUSE', enfonce: false });
    expect(v.panique).toMatchObject({ libelle: 'PANIQUE', enfonce: false, desactive: false });
    expect(v.sauter).toMatchObject({ libelle: 'SAUTER À…', desactive: false });
  });

  it('GO ✓ pendant l’anti-rebond ; grisé quand le spectacle est terminé', () => {
    expect(vueBarre(entree({ goRecent: true })).go.libelle).toBe('GO ✓');
    const fin = { ...lecture(), termine: true } as EtatLecture;
    const v = vueBarre(entree({ lecture: fin, enLecture: false }));
    expect(v.go.desactive).toBe(true);
    expect(v.retenir.desactive).toBe(true);
    expect(v.prolonger.desactive).toBe(true);
    expect(v.pause.desactive).toBe(true);
    expect(v.panique.desactive).toBe(false);   // la panique reste possible quoi qu'il arrive
  });

  it('l’attente du top fait pulser le GO (sauf pendant « GO ✓ »)', () => {
    const attente = { ...lecture(), attenteGo: true } as EtatLecture;
    expect(vueBarre(entree({ lecture: attente })).go.attente).toBe(true);
    expect(vueBarre(entree({ lecture: attente, goRecent: true })).go.attente).toBe(false);
  });

  it('RETENIR enfoncé : libellé RETENU, état enfoncé (aria-pressed côté composant)', () => {
    const v = vueBarre(entree({ lecture: lecture(3, l => { l.retenir(true); }) }));
    expect(v.retenir).toMatchObject({ libelle: 'RETENU', enfonce: true, desactive: false });
    expect(v.retenir.aria).toMatch(/tenue/);
  });

  it('+30 s affiche le cumul (+60 s après deux appuis) et le dit au lecteur d’écran', () => {
    const l = lecture(3, x => { x.prolonger(PAS_PROLONGER_S); x.prolonger(PAS_PROLONGER_S); });
    const v = vueBarre(entree({ lecture: l }));
    expect(v.prolonger.cumul).toBe(60);
    expect(v.prolonger.cumulTxt).toBe('+60 s');
    expect(v.prolonger.aria).toMatch(/60 secondes/);
  });

  it('PAUSE / REPRISE suit enLecture : LECTURE avant le début, PAUSE en lecture, REPRISE (enfoncé) en pause', () => {
    const debut = vueBarre(entree({ lecture: lecture(0), enLecture: false }));
    expect(debut.pause).toMatchObject({ libelle: 'LECTURE', enfonce: false });
    expect(vueBarre(entree({ enLecture: true })).pause).toMatchObject({ libelle: 'PAUSE', enfonce: false });
    const enPause = vueBarre(entree({ enLecture: false }));
    expect(enPause.pause).toMatchObject({ libelle: 'REPRISE', enfonce: true });
  });

  it('PANIQUE enfoncée : FIN PANIQUE', () => {
    const v = vueBarre(entree({ enPanique: true }));
    expect(v.panique).toMatchObject({ libelle: 'FIN PANIQUE', enfonce: true });
    expect(v.panique.aria).toMatch(/Fin de la panique/);
  });

  it('chaque bouton a une info-bulle et une étiquette ARIA en français', () => {
    const v = vueBarre(entree());
    for (const b of [v.go, v.retenir, v.sauter, v.prolonger, v.pause, v.panique]) {
      expect(b.titre.length).toBeGreaterThan(8);
      expect(b.aria.length).toBeGreaterThan(8);
    }
    expect(v.panique.titre).toMatch(/pas de raccourci clavier/);
  });

  it('sans lecture : GO possible (il lance la représentation), rien à retenir ni à prolonger', () => {
    const v = vueBarre(entree({ lecture: null, enLecture: false }));
    expect(v.go.desactive).toBe(false);
    expect(v.enCours).toBeNull();
    expect(v.prolonger.desactive).toBe(true);
    expect(v.retenir.desactive).toBe(true);
  });
});

describe('EN COURS / PROCHAIN', () => {
  it('nom de l’étape, temps passé, durée minimale et progression', () => {
    const e = enCoursDe(projet, lecture(4))!;
    expect(e.passage).toBe(false);
    expect(e.temps).toBe('00:04');
    expect(e.duree).toBe('00:10');
    expect(e.progres).toBeCloseTo(0.4, 5);
    expect(e.depasse).toBe(false);
  });

  it('la prolongation allonge la durée minimale et recule la progression', () => {
    const l = lecture(4, x => { x.prolonger(30); });
    expect(dureeMinimale(projet, l)).toBe(40);
    const e = enCoursDe(projet, l)!;
    expect(e.duree).toBe('00:40');
    expect(e.progres).toBeCloseTo(0.1, 5);
  });

  it('étape qui dépasse sa durée : progression pleine et drapeau « dépassée »', () => {
    const e = enCoursDe(projet, { ...lecture(4), tEtape: 25 } as EtatLecture)!;
    expect(e.progres).toBe(1);
    expect(e.depasse).toBe(true);
  });

  it('prochain = l’étape que le GO lancera ; passage = pas de barre de progression', () => {
    const v = vueBarre(entree());
    expect(v.prochain).toBeTruthy();
    const passage = { ...lecture(), etape: null, phase: 'passage', tEtape: 7 } as EtatLecture;
    const e = enCoursDe(projet, passage)!;
    expect(e).toMatchObject({ passage: true, temps: '00:07', duree: '', progres: 0 });
    expect(e.nom).toMatch(/^Passage/);
  });

  it('terminé : rien en cours', () => {
    expect(enCoursDe(projet, { ...lecture(), termine: true } as EtatLecture)).toBeNull();
    expect(vueBarre(entree({ lecture: { ...lecture(), termine: true } as EtatLecture })).termine).toBe(true);
  });
});

describe('SAUTER À…', () => {
  it('liste les moments puis leurs étapes, dans l’ordre', () => {
    const l = listeSauts(projet);
    expect(l[0]).toMatchObject({ niveau: 'moment', moment: projet.ev[0]!.id });
    expect(l[1]).toMatchObject({ niveau: 'etape', moment: projet.ev[0]!.id, etape: projet.ev[0]!.st[0]!.id });
    expect(l.filter(s => s.niveau === 'moment')).toHaveLength(projet.ev.length);
    expect(l).toHaveLength(projet.ev.length + projet.ev.reduce((n, m) => n + m.st.length, 0));
  });

  it('recherche par texte : sans casse ni accents, tous les mots', () => {
    const p = { ...projet, ev: [{ ...projet.ev[0]!, name: 'Première Rencontre', st: [{ ...projet.ev[0]!.st[0]!, id: 'a', name: 'Lumière rouge' }] }] } as Projet;
    const l = listeSauts(p);
    expect(filtrerSauts(l, 'PREMIERE').map(s => s.libelle)).toEqual(['Première Rencontre', 'Lumière rouge']);   // l’étape correspond par son moment
    expect(filtrerSauts(l, 'lumiere rouge').map(s => s.libelle)).toEqual(['Lumière rouge']);
    expect(filtrerSauts(l, 'lumiere bleue')).toEqual([]);
    expect(filtrerSauts(l, '   ')).toHaveLength(l.length);
  });

  it('Entrée saute tout de suite en RÉPÉTITION, mais se confirme en SPECTACLE', () => {
    expect(confirmationRequise('repetition')).toBe(false);
    expect(confirmationRequise('spectacle')).toBe(true);
    const [m, e] = listeSauts(projet);
    expect(phraseConfirmation(m!)).toMatch(/Entrée pour confirmer/);
    expect(phraseConfirmation(e!)).toContain(e!.libelle);
  });
});

describe('appui long de PANIQUE (700 ms)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T20:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('la jauge monte de 0 à 1 et le seuil est de 700 ms', () => {
    expect(DUREE_APPUI_LONG_MS).toBe(700);
    expect(progresAppuiLong(0)).toBe(0);
    expect(progresAppuiLong(350)).toBeCloseTo(0.5, 5);
    expect(progresAppuiLong(5000)).toBe(1);
  });

  it('un appui tenu 700 ms déclenche UNE fois, jauge visible entre-temps', () => {
    const progres: number[] = [];
    const declenche = vi.fn();
    const a = creerAppuiLong({ surProgres: p => progres.push(p), surDeclenche: declenche });
    a.commencer();
    vi.advanceTimersByTime(300);
    expect(declenche).not.toHaveBeenCalled();
    expect(Math.max(...progres)).toBeGreaterThan(0.3);
    expect(a.enCours()).toBe(true);
    vi.advanceTimersByTime(500);
    expect(declenche).toHaveBeenCalledTimes(1);
    expect(a.enCours()).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(declenche).toHaveBeenCalledTimes(1);
    expect(progres[progres.length - 1]).toBe(0);   // la jauge se vide
  });

  it('relâcher trop tôt n’a aucun effet et remet la jauge à zéro', () => {
    const progres: number[] = [];
    const declenche = vi.fn();
    const a = creerAppuiLong({ surProgres: p => progres.push(p), surDeclenche: declenche });
    a.commencer();
    vi.advanceTimersByTime(400);
    a.arreter();
    vi.advanceTimersByTime(2000);
    expect(declenche).not.toHaveBeenCalled();
    expect(progres[progres.length - 1]).toBe(0);
    expect(a.enCours()).toBe(false);
  });

  it('un second appui après un déclenchement repart de zéro', () => {
    const declenche = vi.fn();
    const a = creerAppuiLong({ surProgres: () => {}, surDeclenche: declenche });
    a.commencer(); vi.advanceTimersByTime(800);
    a.commencer(); vi.advanceTimersByTime(800);
    expect(declenche).toHaveBeenCalledTimes(2);
  });
});
