// Le GO unique, le temps réel et les modes RÉPÉTITION / SPECTACLE (audit UX d'octobre 2026, lots L1 et L2), sur le
// projet ÉCHO embarqué (projets/echo/echo.conducteur.json : 19 moments d'une étape de 10 s, chacun fermé par un
// passage « go »). Le magasin est un singleton : chaque essai rouvre Écho au début, en RÉPÉTITION.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Projet } from '@studio-real/modele';
import echo from '../../../../projets/echo/echo.conducteur.json';
import { DELAI_ANTI_DOUBLE_GO_MS, avancerDe, migrerMode, normaliserMode, useMagasin } from './magasin';
import { actionTouche, etatRepresentation } from '../coquille/etat-scene';

const s = () => useMagasin.getState();
const ids = (echo as unknown as { project: Projet }).project.ev.map((m) => m.id);
const indexMoment = () => ids.indexOf(s().lecture?.moment ?? '');
/** Laisse passer l'anti-rebond avant le GO suivant (horloge simulée). */
const apresAntiRebond = () => vi.advanceTimersByTime(DELAI_ANTI_DOUBLE_GO_MS + 200);

function ouvrirEcho() {
  if (s().mode !== 'repetition') s().changerMode('repetition');
  s().importer(JSON.stringify(echo));
  s().revenirAuDebut();
  apresAntiRebond();
}

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T20:00:00Z')); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => ouvrirEcho());

describe('GO unique · un appui = un cue (Écho)', () => {
  it('le premier GO lance la représentation au moment 1, sans sauter de cue', () => {
    expect(s().enLecture).toBe(false);
    s().go();
    expect(s().enLecture).toBe(true);
    expect(s().lecture?.moment).toBe(ids[0]);
    expect(s().lecture?.etape).toBe(ids[0] + '_s');
  });

  it('pendant l’étape de 10 s, un GO termine l’étape ET franchit le passage « go » : moment suivant, une seule fois', () => {
    s().go();
    apresAntiRebond();
    avancerDe(3);                                   // en pleine étape (10 s)
    expect(s().lecture?.etape).toBe(ids[0] + '_s');
    s().go();
    expect(s().lecture?.moment).toBe(ids[1]);
    expect(s().lecture?.etape).toBe(ids[1] + '_s');
    expect(s().lecture?.attenteGo).toBe(false);
    expect(s().enLecture).toBe(true);
  });

  it('huit GO, à des instants variés (étape ou attente du top) = huit cues exactement', () => {
    s().go();
    const pauses = [0.4, 4, 11, 25, 9.9, 10.1, 2, 60];
    pauses.forEach((dt, k) => {
      apresAntiRebond();
      avancerDe(dt);
      expect(indexMoment()).toBe(k);
      s().go();
      expect(indexMoment()).toBe(k + 1);
    });
  });

  it('plus d’armement : un GO pendant l’étape ne laisse rien « pour plus tard », le passage suivant attend son propre GO', () => {
    s().go();
    apresAntiRebond();
    avancerDe(2);
    s().go();                                        // cue 2
    avancerDe(30);                                   // l’étape du moment 2 finit, son passage attend
    expect(s().lecture?.moment).toBe(ids[1]);
    expect(s().lecture?.attenteGo).toBe(true);
    avancerDe(30);
    expect(s().lecture?.moment).toBe(ids[1]);        // toujours là : rien n’était armé
  });

  it('double GO à 300 ms : le second est ignoré ; après 800 ms, il repasse', () => {
    s().go();
    apresAntiRebond();
    avancerDe(12);
    s().go();
    expect(indexMoment()).toBe(1);
    vi.advanceTimersByTime(300);
    s().go();
    expect(indexMoment()).toBe(1);                   // ignoré
    vi.advanceTimersByTime(DELAI_ANTI_DOUBLE_GO_MS);
    s().go();
    expect(indexMoment()).toBe(2);
    expect(s().dernierGo).toBe(Date.now());
  });

  it('un GO sur une pause reprend la lecture et franchit le passage en un seul appui', () => {
    s().go();
    apresAntiRebond();
    avancerDe(12);
    s().pause();
    expect(s().enLecture).toBe(false);
    s().go();
    expect(indexMoment()).toBe(1);
    expect(s().enLecture).toBe(true);
  });

  it('dernier moment : le GO ne termine pas le spectacle (aucun cue après)', () => {
    s().allerA(ids[ids.length - 1]!);
    s().go();                                        // lance
    apresAntiRebond();
    avancerDe(2);
    s().go();
    expect(s().lecture?.termine).toBe(false);
    expect(s().lecture?.moment).toBe(ids[ids.length - 1]);
  });
});

describe('temps réel · l’attente du top est un état, pas une pause', () => {
  it('aucune pause automatique : la lecture continue, l’horloge, le retard et l’attente du moment avancent', () => {
    s().go();
    avancerDe(12);
    const l1 = s().lecture!;
    expect(l1.attenteGo).toBe(true);
    expect(l1.etape).toBeNull();
    expect(s().enLecture).toBe(true);
    avancerDe(5);
    const l2 = s().lecture!;
    expect(s().enLecture).toBe(true);
    expect(l2.t).toBeCloseTo(l1.t + 5, 5);
    expect(l2.retard).toBeCloseTo(l1.retard + 5, 5);
    expect(l2.attentes?.[ids[0]!] ?? 0).toBeGreaterThanOrEqual(5);
  });

  it('la fin de vidéo est transmise au moteur pendant l’attente du top, et même en pause', () => {
    s().go();
    avancerDe(12);
    expect(s().lecture?.attenteGo).toBe(true);
    s().recevoirFinVideo('junon.mp4');
    const vus = () => (s().lecture?.journal ?? []).filter((j) => j.type === 'signal' && j.nom === 'video.fin').length;
    expect(vus()).toBe(1);
    s().pause();
    s().recevoirFinVideo('junon.mp4');
    expect(vus()).toBe(2);
  });
});

describe('modes RÉPÉTITION / SPECTACLE', () => {
  it('RÉPÉTITION par défaut ; migration des anciens modes et du verrou SCÈNE', () => {
    expect(s().mode).toBe('repetition');
    expect(normaliserMode('jouer')).toBe('spectacle');
    expect(normaliserMode('preparer')).toBe('repetition');
    expect(normaliserMode('ecrire')).toBe('repetition');
    expect(migrerMode({ mode: 'preparer', verrou: true })).toBe('spectacle');
    expect(migrerMode({ mode: 'preparer', verrou: false })).toBe('repetition');
    expect(migrerMode(null)).toBe('repetition');
    s().changerMode('jouer');
    expect(s().mode).toBe('spectacle');
    expect(s().verrou).toBe(true);
    s().changerMode('preparer');
    expect(s().mode).toBe('repetition');
    expect(s().verrou).toBe(false);
  });

  it('SPECTACLE impose ×1 : ×20 refusé ; en RÉPÉTITION ×5 et ×20 sont permis', () => {
    s().changerVitesse(20);
    expect(s().vitesse).toBe(20);
    s().changerMode('spectacle');
    expect(s().vitesse).toBe(1);
    s().changerVitesse(20);
    expect(s().vitesse).toBe(1);
    s().changerMode('repetition');
    s().changerVitesse(5);
    expect(s().vitesse).toBe(5);
  });

  it('Espace = GO seulement en SPECTACLE (Maj+Espace = lecture / pause) ; T et G = GO partout', () => {
    expect(actionTouche({ code: 'Space', key: ' ' }, 'spectacle')).toBe('go');
    expect(actionTouche({ code: 'Space', key: ' ', shiftKey: true }, 'spectacle')).toBe('lecture');
    expect(actionTouche({ code: 'Space', key: ' ' }, 'repetition')).toBe('lecture');
    expect(actionTouche({ code: 'Space', key: ' ', shiftKey: true }, 'repetition')).toBe('lecture');
    for (const key of ['t', 'T', 'g', 'G']) {
      expect(actionTouche({ code: 'Key' + key.toUpperCase(), key }, 'spectacle')).toBe('go');
      expect(actionTouche({ code: 'Key' + key.toUpperCase(), key }, 'repetition')).toBe('go');
    }
    expect(actionTouche({ code: 'KeyM', key: 'm' }, 'spectacle')).toBeNull();
  });

  it('badge d’état : PRÊT, EN LECTURE (vert), ATTENTE DU TOP (ambre), EN PAUSE (ambre), TERMINÉ (acier)', () => {
    expect(etatRepresentation(s().lecture, s().enLecture)).toMatchObject({ libelle: 'PRÊT', ton: 'acier' });
    s().go();
    avancerDe(3);
    expect(etatRepresentation(s().lecture, s().enLecture)).toMatchObject({ libelle: 'EN LECTURE', ton: 'vert' });
    avancerDe(10);
    expect(etatRepresentation(s().lecture, s().enLecture)).toMatchObject({ libelle: 'ATTENTE DU TOP', ton: 'ambre', pulse: true });
    s().pause();
    expect(etatRepresentation(s().lecture, s().enLecture)).toMatchObject({ libelle: 'EN PAUSE', ton: 'ambre' });
    expect(etatRepresentation({ ...s().lecture!, termine: true }, false)).toMatchObject({ libelle: 'TERMINÉ', ton: 'acier' });
  });
});

describe('lecteur stable', () => {
  it('SPECTACLE : une modification locale est refusée et le lecteur n’est pas recréé (l’étape continue)', () => {
    s().go();
    avancerDe(4);
    s().changerMode('spectacle');
    const avant = s().projet;
    s().modifierProjet((p) => { p.ev[0]!.name = 'renommé'; });
    expect(s().projet).toBe(avant);
    avancerDe(1);
    expect(s().lecture?.etape).toBe(ids[0] + '_s');
    expect(s().lecture?.tEtape).toBeCloseTo(5, 5);   // pas de retour à 0 : même lecteur
    s().annuler();
    expect(s().projet).toBe(avant);
  });

  it('SPECTACLE : un projet reçu de la salle est mis en attente, puis appliqué à l’entrée du moment suivant', () => {
    s().changerMode('spectacle');
    s().go();
    avancerDe(2);
    const p = structuredClone(s().projet);
    p.ev[0]!.st[0]!.k[0] = 5;                        // 40 s au lieu de 10 s
    p.ev[1]!.st[0]!.k[0] = 5;
    s().remplacerProjetDistant(p);
    expect(s().projet).toBe(p);                      // le document suit la salle…
    expect(s().modificationsEnAttente).toBe(1);      // …le lecteur attend
    avancerDe(9);
    expect(s().lecture?.tEtape).toBeGreaterThan(0);
    expect(s().lecture?.attenteGo).toBe(true);       // ancienne durée (10 s) : même lecteur, rien rejoué
    apresAntiRebond();
    s().go();
    expect(s().lecture?.moment).toBe(ids[1]);
    expect(s().lecture?.etape).toBe(ids[1] + '_s');
    expect(s().modificationsEnAttente).toBe(0);
    avancerDe(12);
    expect(s().lecture?.attenteGo).toBe(false);      // nouvelle durée (40 s) appliquée au nouveau moment
    expect(s().lecture?.t).toBeCloseTo(2 + 9 + 12, 5);  // l’horloge n’a pas sauté
  });

  it('RÉPÉTITION : la re-création pendant l’attente d’un passage se replace AU PASSAGE (pas au début du moment)', () => {
    s().go();
    avancerDe(12);
    const avant = s().lecture!;
    expect(avant.etape).toBeNull();
    s().modifierProjet((p) => { p.ev[5]!.name = 'renommé'; });
    avancerDe(0.5);
    const apres = s().lecture!;
    expect(apres.moment).toBe(ids[0]);
    expect(apres.etape).toBeNull();
    expect(apres.attenteGo).toBe(true);
    expect(apres.t).toBeCloseTo(avant.t + 0.5, 5);
    expect(apres.retard).toBeCloseTo(avant.retard + 0.5, 5);
    apresAntiRebond();
    s().go();
    expect(indexMoment()).toBe(1);
  });

  it('RÉPÉTITION : la re-création pendant une étape garde le moment, l’étape et l’horloge', () => {
    s().go();
    apresAntiRebond();
    avancerDe(12);
    s().go();
    avancerDe(3);
    const t = s().lecture!.t;
    s().modifierProjet((p) => { p.ev[8]!.name = 'renommé'; });
    avancerDe(0.5);
    expect(s().lecture?.moment).toBe(ids[1]);
    expect(s().lecture?.etape).toBe(ids[1] + '_s');
    expect(s().lecture?.t).toBeCloseTo(t + 0.5, 5);
  });
});
