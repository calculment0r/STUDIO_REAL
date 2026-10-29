// Le GO unique, le temps réel et les modes RÉPÉTITION / SPECTACLE (audit UX d'octobre 2026, lots L1 et L2), sur le
// projet ÉCHO embarqué (projets/echo/echo.conducteur.json : 19 moments d'une étape de 10 s, chacun fermé par un
// passage « go »). Le magasin est un singleton : chaque essai rouvre Écho au début, en RÉPÉTITION.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Projet } from '@studio-real/modele';
import echo from '../../../../projets/echo/echo.conducteur.json';
import { DELAI_ANTI_DOUBLE_GO_MS, avancerDe, etatVif, lectureVive, migrerMode, normaliserMode, structureChangee, useMagasin } from './magasin';
import { useHorloge } from './horloge';
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

describe('barre de scène · RETENIR, +30 s, PANIQUE', () => {
  /** Représentation lancée, 3 s dans la première étape (10 s). */
  function dansLEtape() {
    s().go();
    apresAntiRebond();
    avancerDe(3);
    expect(s().lecture?.etape).toBe(ids[0] + '_s');
  }

  it('retenir : la fin de l’étape n’arrive plus par le temps ; relâcher la termine aussitôt', () => {
    dansLEtape();
    s().retenir(true);
    expect(s().lecture?.retenu).toBe(true);
    avancerDe(60);
    expect(s().lecture?.etape).toBe(ids[0] + '_s');
    expect(s().lecture?.tEtape).toBeCloseTo(63, 5);
    s().retenir(false);
    expect(s().lecture?.retenu).toBe(false);
    expect(s().lecture?.etape).toBeNull();           // l’étape a fini : un passage « go » attend
    expect(s().lecture?.attenteGo).toBe(true);
  });

  it('retenir sans argument bascule ; le GO sort de l’étape tenue et lève la retenue', () => {
    dansLEtape();
    s().retenir();
    expect(s().lecture?.retenu).toBe(true);
    s().retenir();
    expect(s().lecture?.retenu).toBe(false);
    s().retenir();
    avancerDe(20);
    apresAntiRebond();
    s().go();
    expect(indexMoment()).toBe(1);
    expect(s().lecture?.retenu).toBe(false);
  });

  it('prolonger : +30 s décale la fin de l’étape, cumulable, avec le cumul dans la lecture', () => {
    dansLEtape();
    s().prolonger();
    expect(s().lecture?.prolonge).toBe(30);
    avancerDe(20);                                   // 23 s < 10 + 30
    expect(s().lecture?.etape).toBe(ids[0] + '_s');
    s().prolonger(30);
    expect(s().lecture?.prolonge).toBe(60);
    avancerDe(40);                                   // 63 s < 10 + 60
    expect(s().lecture?.etape).toBe(ids[0] + '_s');
    avancerDe(8);                                    // 71 s ≥ 70
    expect(s().lecture?.etape).toBeNull();
    expect(s().lecture?.prolonge).toBe(0);           // remis à zéro à la sortie de l’étape
  });

  it('prolonger est refusé hors étape (passage) et quand le spectacle est terminé', () => {
    dansLEtape();
    avancerDe(10);                                   // l’étape est finie : le passage attend le GO
    expect(s().lecture?.etape).toBeNull();
    s().prolonger();
    expect(s().lecture?.prolonge ?? 0).toBe(0);
    expect(s().message).toMatch(/rien à prolonger/);
  });

  it('retenue et prolongation survivent à la re-création du lecteur (modification du projet en RÉPÉTITION)', () => {
    dansLEtape();
    s().retenir(true);
    s().prolonger(30);
    s().modifierProjet((p) => { p.ev[8]!.name = 'renommé'; });
    avancerDe(0.5);
    expect(s().lecture?.etape).toBe(ids[0] + '_s');
    expect(s().lecture?.retenu).toBe(true);
    expect(s().lecture?.prolonge).toBe(30);
    avancerDe(60);
    expect(s().lecture?.etape).toBe(ids[0] + '_s');
  });

  it('retour au début : retenue et prolongation effacées', () => {
    dansLEtape();
    s().retenir(true);
    s().prolonger(30);
    s().revenirAuDebut();
    expect(s().lecture?.retenu).toBe(false);
    expect(s().lecture?.prolonge).toBe(0);
  });

  it('allerA efface la retenue et la prolongation', () => {
    dansLEtape();
    s().retenir(true);
    s().prolonger(30);
    s().allerA(ids[4]!);
    expect(s().lecture?.moment).toBe(ids[4]);
    expect(s().lecture?.retenu).toBe(false);
    expect(s().lecture?.prolonge).toBe(0);
  });

  it('panique : état local, sortie locale au noir tenue à la main, levée = retour à la scène automatique', async () => {
    const { useSortie, reinitialiserRelais } = await import('../sortie/relais');
    reinitialiserRelais();
    expect(s().enPanique).toBe(false);
    s().panique(true);
    expect(s().enPanique).toBe(true);
    expect(useSortie.getState().mode).toBe('manuel');
    expect(useSortie.getState().scene).toMatchObject({ type: 'noir' });
    s().panique(true);                               // idempotent
    s().panique(false);
    expect(s().enPanique).toBe(false);
    expect(useSortie.getState().mode).toBe('auto');
    reinitialiserRelais();
  });

  it('panique se déclenche même spectacle terminé ou sans lecture : rien ne la grise côté magasin', () => {
    s().panique(true);
    expect(s().enPanique).toBe(true);
    s().panique(false);
  });
});

describe('horloge séparée de la lecture (lot performance-react)', () => {
  const horloge = () => useHorloge.getState();
  /** Compte les remplacements de `lecture` pendant `fn`. */
  const publications = (fn: () => void): number => {
    let n = 0;
    const fin = useMagasin.subscribe((a, b) => { if (a.lecture !== b.lecture) n++; });
    try { fn(); } finally { fin(); }
    return n;
  };

  it('à chaque image l’horloge avance, mais `lecture` n’est remplacée qu’au battement lent (0,2 s), pas 60 fois par seconde', () => {
    s().go();
    apresAntiRebond();
    const t0 = horloge().t;
    let n = 0;
    const vus = new Set<number>();
    const fin = useMagasin.subscribe((a, b) => { if (a.lecture !== b.lecture) n++; });
    for (let i = 0; i < 120; i++) { avancerDe(1 / 60); vus.add(horloge().t); }
    fin();
    expect(vus.size).toBe(120);                                        // une valeur d'horloge neuve à chaque image
    expect(horloge().t).toBeCloseTo(t0 + 2, 6);
    expect(n).toBeLessThanOrEqual(11);                                 // 2 s / 0,2 s, plus la marge d'une image
    expect(n).toBeGreaterThanOrEqual(8);
    // le battement garde `lecture` à moins de 0,2 s de l'horloge
    expect(horloge().t - s().lecture!.t).toBeLessThan(0.2 + 1e-9);
  });

  it('un changement de structure remplace `lecture` tout de suite (GO, mémoire posée, retenue, attente du top)', () => {
    s().go();
    apresAntiRebond();
    avancerDe(0.5);
    const avant = s().lecture;
    s().retenir(true);
    expect(s().lecture).not.toBe(avant);
    expect(s().lecture?.retenu).toBe(true);
    const avant2 = s().lecture;
    s().poserMemoire('niveau', 3);
    expect(s().lecture).not.toBe(avant2);
    expect(s().lecture?.memoires.niveau).toBe(3);
    s().retenir(false);
    apresAntiRebond();
    avancerDe(30);                                                    // l'étape de 10 s finit : le passage « go » attend
    expect(s().lecture?.attenteGo).toBe(true);
    expect(publications(() => avancerDe(0.01))).toBe(0);              // dans l'attente : aucun changement de structure, pas de nouvelle `lecture`
  });

  it('les tableaux et dictionnaires de `lecture` gardent leur référence d’une image à l’autre', () => {
    s().go();
    apresAntiRebond();
    s().poserMemoire('niveau', 3);
    const l = s().lecture!;
    for (let i = 0; i < 60; i++) avancerDe(1 / 60);
    const m = s().lecture!;
    expect(m).not.toBe(l);                                              // battement : objet neuf…
    expect(m.memoires).toBe(l.memoires);                                // …mais mêmes références
    expect(m.parcours).toBe(l.parcours);
    expect(m.journal).toBe(l.journal);
    expect(m.commandes).toBe(l.commandes);
    expect(m.alertes).toBe(l.alertes);
    expect(m.reprises).toBe(l.reprises);
  });

  it('à l’arrêt, `lecture` est remise à l’heure de l’horloge (note, saut et export lisent lecture.t)', () => {
    s().go();
    apresAntiRebond();
    for (let i = 0; i < 7; i++) avancerDe(1 / 60);                     // entre deux battements : `lecture` est en retard
    s().pause();
    expect(s().lecture!.t).toBe(horloge().t);
    expect(s().lecture!.tEtape).toBe(horloge().tEtape);
    expect(s().enLecture).toBe(false);
  });

  it('`structureChangee` ignore le temps (t, tEtape, retard, attentes, temps de séquence) et voit le reste', () => {
    s().go();
    const a = s().lecture!;
    expect(structureChangee(a, { ...a, t: a.t + 5, tEtape: a.tEtape + 5, retard: 3, attentes: { x: 2 } })).toBe(false);
    expect(structureChangee(a, { ...a, etape: 'autre' })).toBe(true);
    expect(structureChangee(a, { ...a, attenteGo: !a.attenteGo })).toBe(true);
    expect(structureChangee(a, { ...a, memoires: { ...a.memoires } })).toBe(true);        // autre référence = autre contenu pour le magasin
    expect(structureChangee(a, { ...a, sequence: { id: 's', nom: 'S', etape: 'e', tEtape: 1, chemin: ['S'] } })).toBe(true);
    const avecSeq = { ...a, sequence: { id: 's', nom: 'S', etape: 'e', tEtape: 1, chemin: ['S'] } };
    expect(structureChangee(avecSeq, { ...avecSeq, sequence: { ...avecSeq.sequence, tEtape: 9 } })).toBe(false);
  });

  it('`etatVif` rend `lecture` à l’heure de l’horloge sans changer ce qui est déjà à l’heure (la tête de lecture)', () => {
    s().go();
    apresAntiRebond();
    avancerDe(0.5);
    expect(s().lecture!.t).toBe(horloge().t);                            // 0,5 s d'un coup : `lecture` vient d'être publiée, à l'heure
    expect(etatVif(s())).toBe(s());                                      // déjà à l'heure : aucune copie
    for (let i = 0; i < 3; i++) avancerDe(1 / 60);                       // 0,05 s plus tard : pas de battement, `lecture` est en retard
    expect(s().lecture!.t).toBeLessThan(horloge().t);
    const vif = etatVif(s());
    expect(vif).not.toBe(s());
    expect(vif.lecture!.t).toBe(horloge().t);
    expect(vif.lecture!.tEtape).toBe(horloge().tEtape);
    expect(vif.mode).toBe(s().mode);                                     // le reste de l'état se lit à travers
    expect(etatVif(s())).toBe(vif);                                      // une seule copie par état et par image
    expect(lectureVive(null)).toBeNull();
  });

  it('une `lecture` posée de l’extérieur (poste qui suit la régie) amène l’horloge avec elle', () => {
    const l = s().lecture!;
    useMagasin.setState({ lecture: { ...l, t: 123, tEtape: 7, retard: 2 } });
    expect(horloge()).toMatchObject({ t: 123, tEtape: 7, retard: 2 });
  });

  it('lecture miroir : des tableaux de même contenu reçus du serveur gardent la référence précédente', () => {
    s().changerMode('spectacle');
    s().go();
    const avant = s().lecture!;
    const copie = JSON.parse(JSON.stringify(avant)) as typeof avant;     // ce que le réseau livre : des objets neufs, même contenu
    s().resynchroniser(copie);
    const apres = s().lecture!;
    expect(apres.parcours).toBe(avant.parcours);
    expect(apres.memoires).toBe(avant.memoires);
    expect(apres.journal).toBe(avant.journal);
    s().resynchroniser({ ...copie, memoires: { ...copie.memoires, nouveau: 1 } });
    expect(s().lecture!.memoires).not.toBe(avant.memoires);
  });
});
