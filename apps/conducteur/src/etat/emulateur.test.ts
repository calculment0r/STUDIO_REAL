// Branchement de l'émulateur de téléphones au magasin (src/etat/emulateur.ts) sur le projet ÉCHO : source des signaux
// (émulée / simulée), refus en SPECTACLE, chaque GO du magasin transmis à la salle émulée en `conduite{op:'top'}`,
// pause et projet suivis. Sans navigateur : pas d'horloge temps réel, on avance le temps émulé à la main.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import echo from '../../../../projets/echo/echo.conducteur.json';
import { DELAI_ANTI_DOUBLE_GO_MS, useMagasin } from './magasin';
import { signauxSalle } from './moteur';
import { arreterEmulateur, demarrerEmulateur, emulateurCourant, sourceSignaux, useEmulateur } from './emulateur';

const s = () => useMagasin.getState();
const apresAntiRebond = () => vi.advanceTimersByTime(DELAI_ANTI_DOUBLE_GO_MS + 200);
const T0 = Date.UTC(2026, 9, 28, 20, 0, 0);

function ouvrirEcho() {
  if (s().mode !== 'repetition') s().changerMode('repetition');
  s().importer(JSON.stringify(echo));
  s().revenirAuDebut();
  apresAntiRebond();
}

/** Émulateur de 10 téléphones « rapides », tous présents, sans boucle temps réel. */
function demarrer(n = 10) {
  expect(demarrerEmulateur({ population: n, melange: 'rapides', arrivees: 'toutes', graine: 7, boucle: false, debut: T0 })).toBe(true);
  return emulateurCourant()!;
}

/** Les GO transmis à la salle émulée (journal du noyau). */
const tops = () => emulateurCourant()!.salle.evenementsJournal().filter(e => e.type === 'conduite' && e.op === 'top').length;

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(T0)); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => ouvrirEcho());
afterEach(() => arreterEmulateur());

describe('sourceSignaux : émulée si l’émulateur tourne en RÉPÉTITION, simulée sinon', () => {
  it('sans émulateur : la salle simulée des rotatifs (signauxSalle), et le magasin lit la même chose', () => {
    const sens = s().projet.sens;
    const r = sourceSignaux(sens, 12);
    expect(r.source).toBe('simulee');
    expect(r.signaux).toEqual(signauxSalle(sens, 12));
    expect(s().signaux()).toEqual(signauxSalle(sens, s().lecture?.tEtape ?? 0));
  });

  it('émulateur en marche : les signaux sont COMPTÉS sur les téléphones émulés, et c’est ce que lit le magasin', async () => {
    const emu = demarrer(10);
    await emu.avancer(3000);
    const r = sourceSignaux(s().projet.sens, 0);
    expect(r.source).toBe('emulee');
    expect(r.signaux.pres).toBe(10);
    expect(s().signaux()).toEqual(emu.signaux());
    expect(s().signaux().pres).toBe(10);
    expect(useEmulateur.getState().actif).toBe(true);
  });

  it('à l’arrêt, retour à la salle simulée', async () => {
    const emu = demarrer(4);
    await emu.avancer(3000);
    arreterEmulateur();
    expect(emulateurCourant()).toBeNull();
    expect(sourceSignaux(s().projet.sens, 0).source).toBe('simulee');
    expect(s().signaux().pres).toBe(signauxSalle(s().projet.sens, s().lecture?.tEtape ?? 0).pres);
    expect(useEmulateur.getState()).toMatchObject({ actif: false, bilan: null, points: [] });
  });
});

describe('SPECTACLE : l’émulateur est refusé', () => {
  it('démarrer en SPECTACLE est refusé (et dit pourquoi)', () => {
    s().changerMode('spectacle');
    expect(demarrerEmulateur({ boucle: false })).toBe(false);
    expect(emulateurCourant()).toBeNull();
    expect(s().message).toMatch(/SPECTACLE : émulateur refusé/);
    expect(sourceSignaux(s().projet.sens, 0).source).toBe('simulee');
  });

  it('passer en SPECTACLE arrête l’émulateur ; les signaux redeviennent ceux de la salle simulée', async () => {
    const emu = demarrer(4);
    await emu.avancer(3000);
    s().changerMode('spectacle');
    expect(emulateurCourant()).toBeNull();
    expect(useEmulateur.getState().actif).toBe(false);
    await Promise.resolve();
    expect(s().message).toMatch(/émulateur arrêté/);
    expect(sourceSignaux(s().projet.sens, 0).source).toBe('simulee');
  });
});

describe('GO du magasin → conduite{op:\'top\'} de la salle émulée', () => {
  it('le premier GO lance (rien à franchir) ; chaque GO suivant part en top, la salle émulée suit le Conducteur', async () => {
    const emu = demarrer(6);
    await emu.avancer(2000);
    expect(emu.salle.rep.enPause).toBe(true);   // la lecture du magasin n'est pas lancée : la salle attend
    s().go();
    expect(s().enLecture).toBe(true);
    expect(emu.salle.rep.enPause).toBe(false);
    expect(tops()).toBe(0);
    expect(emu.salle.lecture()?.moment).toBe(s().lecture?.moment);
    for (let i = 0; i < 6; i++) {
      apresAntiRebond();
      await emu.avancer(3000);
      s().go();
      expect(emu.salle.lecture()?.moment, `GO ${i + 2}`).toBe(s().lecture?.moment);
    }
    expect(s().lecture?.moment).toBe('b5_q1');
    expect(tops()).toBeGreaterThanOrEqual(6);
    // la vue que reçoivent les téléphones est celle que calcule le vrai noyau : le vote n° 1
    await emu.avancer(1000);
    expect(emu.vueDe('public')).toMatchObject({ ecran: 'vote', params: { numero: 1 } });
    expect(emu.telephones().every(t => t.etat().ecran?.type === 'vote')).toBe(true);
  });

  it('la salle émulée en retard (étape finie, passage en attente) : un seul top suffit, toujours au même moment', async () => {
    const emu = demarrer(4);
    s().go();
    apresAntiRebond();
    await emu.avancer(15_000);   // l'étape d'Écho (10 s) est finie côté salle émulée : elle attend le top au passage
    expect(emu.salle.lecture()).toMatchObject({ moment: 'b1_entree', etape: null });
    const avant = tops();
    s().go();
    expect(tops() - avant).toBe(1);
    expect(emu.salle.lecture()?.moment).toBe(s().lecture?.moment);
  });

  it('pause du magasin = pause de la salle émulée ; un projet modifié est suivi par la salle émulée', async () => {
    const emu = demarrer(4);
    s().go();
    expect(emu.salle.rep.enPause).toBe(false);
    s().pause();
    expect(emu.salle.rep.enPause).toBe(true);
    s().modifierProjet(p => { p.ev[0]!.name = 'Entrée (modifiée)'; }, 'renommer');
    vi.advanceTimersByTime(700);
    expect(emulateurCourant()!.salle.rep.projet.ev[0]!.name).toBe('Entrée (modifiée)');
    await emu.avancer(2000);
    expect(emu.signaux().pres).toBe(4);   // les téléphones sont revenus (hello) sur le nouveau noyau
  });
});
