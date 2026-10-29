// Performance de l'interface du Conducteur (lot performance-react, audit de fluidité 07, constats C9/C10) : PLUS de
// redessin de toute l'interface à chaque image de la lecture.
//
// Le vrai `App` (planche, en-tête, panneau, barre de scène, conduite, rail, sortie…) est monté dans un faux DOM
// (test-outils/faux-dom.ts, aucun navigateur) avec le projet Écho en SPECTACLE ; chaque image de la boucle est jouée comme
// le navigateur le ferait (requestAnimationFrame à 60 i/s, boucle de lecture du magasin) ; le compteur de
// test-outils/rendus.ts dit combien de fois chaque composant a été ré-exécuté par React.
//
// Objectifs (brief du lot) : 0 rendu de `Planche`, `EnTete`, `Panneau` et `BarreScene` tant que la structure ne change pas
// (moment, étape, attente du GO, pause) ; ce qui affiche le temps est rafraîchi à la seconde ou à 4 Hz ; un GO coûte un
// nombre borné de rendus. Variables SR_MESURES=1 : imprime aussi le tableau des chiffres (avant / après du protocole de
// docs/audit-2026-10/mesures-performance.md).
import { beforeAll, describe, expect, it, vi } from 'vitest';

const { rendus, declencherImage } = await vi.hoisted(async () => (await import('./test-outils/rendus')).preparer());

import echo from '../../../projets/echo/echo.conducteur.json';
import { ecrituresDeStyle, monter, remettreAZeroEcritures, type BilanRendus } from './test-outils/rendus';
import App from './coquille/App';
import { useInterface } from './coquille/interface';
import { DELAI_ANTI_DOUBLE_GO_MS, avancerDe, useMagasin } from './etat/magasin';

const s = () => useMagasin.getState();
const IMAGES = 120;                  // 2 s à 60 i/s
const MS_IMAGE = 1000 / 60;

interface Phase {
  nom: string; bilan: BilanRendus; publications: number; secondes: number;
  /** écritures dans element.style : toutes, et celles qui obligent le navigateur à refaire la mise en page (left, width…) */
  styles: { toutes: number; geometrie: number; parPropriete: Record<string, number> };
}

/** Ce que le code a écrit dans le DOM de la conduite (tête de lecture, repère de zoom, hachures de l'attente), relevé en fin de phase. */
interface Sondes {
  tete: Record<string, string> | undefined;
  repere: Record<string, string> | undefined;
  hachures: Record<string, string> | undefined;
}

/** Joue le scénario du protocole et renvoie le bilan de chaque phase. */
async function jouer(): Promise<{ phases: Phase[]; sondes: Record<string, Sondes> }> {
  s().changerMode('repetition');
  s().importer(JSON.stringify(echo));
  s().revenirAuDebut();
  s().changerMode('spectacle');

  const monte = await monter(<App />);
  let ts = 0;
  let publications = 0;
  useMagasin.subscribe((n, p) => { if (n.lecture !== p.lecture) publications++; });
  const image = () => monte.image(() => { ts += MS_IMAGE; declencherImage(ts); });
  const phases: Phase[] = [];
  const sondes: Record<string, Sondes> = {};
  const sonder = (nom: string) => {
    sondes[nom] = { tete: monte.trouver('.sr-ph')?.style, repere: monte.trouver('.cd-zb-tete')?.style, hachures: monte.trouver('.cd-attente-vive')?.style };
    sondes[nom] = JSON.parse(JSON.stringify(sondes[nom])) as Sondes;
  };
  /** Mesure `fn` (qui joue des images) : validations, composants rendus, publications de la lecture. */
  const mesurer = async (nom: string, images: number, fn: () => Promise<void>) => {
    rendus.remettreAZero();
    remettreAZeroEcritures();
    publications = 0;
    await fn();
    phases.push({ nom, bilan: rendus.lire(), publications, secondes: images / 60, styles: ecrituresDeStyle() });
  };
  const images = async (n: number) => { for (let i = 0; i < n; i++) await image(); };
  // La caméra de la planche glisse vers le moment en cours après chaque changement de moment (suivi du spectacle) : c'est
  // une animation voulue, qui re-rend la planche image après image. On la laisse finir avant de mesurer le régime établi.
  const apaiser = async (max = 900): Promise<number> => {
    let calme = 0, n = 0;
    while (n < max && calme < 30) {
      const avant = rendus.de('Planche');
      await image();
      n++;
      calme = rendus.de('Planche') === avant ? calme + 1 : 0;
    }
    return n;
  };

  await image();                                           // première image : la boucle s'installe
  await apaiser();                                         // cadrage initial de la caméra (en pause)
  await mesurer('repos (pause)', IMAGES, () => images(IMAGES));
  await monte.image(() => s().go());                       // le premier GO lance la représentation (même moment : la caméra ne bouge pas)
  await image();                                           // la première image jouée : « la représentation a commencé » (une fois)
  await mesurer('lecture, étape en cours', IMAGES, () => images(IMAGES));
  sonder('lecture');
  // saut à la fin de l'étape de 10 s : le passage du moment attend le GO
  await monte.image(() => avancerDe(9));
  await monte.image(() => avancerDe(1.2));
  expect(s().lecture?.attenteGo).toBe(true);
  await mesurer('attente du GO', IMAGES, () => images(IMAGES));
  sonder('attente');
  // un GO : le moment suivant commence (1 image), la caméra glisse vers lui, puis le régime s'établit
  vi.setSystemTime(Date.now() + 5000);
  await mesurer('le GO lui-même (1 image)', 1, () => monte.image(() => { s().go(); ts += MS_IMAGE; declencherImage(ts); }));
  let glissement = 0;
  await mesurer('glissement de la caméra après le GO', 0, async () => { glissement = await apaiser(240); });
  phases[phases.length - 1]!.secondes = glissement / 60;
  // le « GO ✓ » de l'en-tête et de la barre (anti-rebond de 800 ms, minuterie réelle) retombe une fois : on l'attend avant de mesurer
  await new Promise(r => setTimeout(r, DELAI_ANTI_DOUBLE_GO_MS + 150));
  await image();
  await mesurer('régime établi après le GO', IMAGES, () => images(IMAGES));
  // le pupitre de représentation (touche P) ouvert : c'est lui qui montre le gros chrono, la jauge et l'horloge
  await monte.image(() => useInterface.getState().poser({ pupitre: true }));
  await mesurer('pupitre ouvert', IMAGES, () => images(IMAGES));
  await monte.image(() => useInterface.getState().poser({ pupitre: false }));
  await monte.image(() => s().pause());
  await mesurer('pause (fin)', IMAGES, () => images(IMAGES));
  await monte.demonter();
  return { phases, sondes };
}

describe('performance : rendus de l’interface pendant la lecture (Écho, SPECTACLE)', () => {
  let phases: Phase[] = [];
  let sondes: Record<string, Sondes> = {};
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-29T20:00:00Z'));
    ({ phases, sondes } = await jouer());
  }, 120_000);
  const de = (nom: string) => phases.find(p => p.nom === nom)!;
  /** Ré-exécutions d'un composant. Les composants mémorisés par `memo(function X…)` sont nommés « X2 » par le transformateur de
   *  vitest (même nom que la constante exportée) : on compte les deux écritures. */
  const nombre = (p: Phase, nom: string): number =>
    Object.entries(p.bilan.parComposant).filter(([k]) => k === nom || (k.startsWith(nom) && k.length === nom.length + 1 && /\d/.test(k.slice(-1)))).reduce((a, [, v]) => a + v, 0);
  const rendusDe = (p: Phase, ...noms: string[]) => noms.map(n => nombre(p, n));

  it('imprime le tableau des mesures', () => {
    if (!process.env.SR_MESURES) return;
    const cles = ['Planche', 'CoucheActeurs', 'EnTete', 'Panneau', 'OuEnEstOn', 'BarreScene', 'Pupitre', 'PupitreRegie', 'ApercuSortie', 'AlerteSecurite', 'MomentPlanche', 'BlocEtape'];
    const lignes = phases.map(p => ({
      phase: p.nom, secondes: p.secondes, validations: p.bilan.commits, 'composants rendus': p.bilan.total, 'publications de lecture': p.publications,
      'écritures de style': p.styles.toutes, 'dont géométrie': p.styles.geometrie,
      'propriétés de géométrie': Object.fromEntries(Object.entries(p.styles.parPropriete).filter(([k]) => /^(left|right|top|bottom|width|height|margin.*|padding.*)$/.test(k))),
      ...Object.fromEntries(cles.map(c => [c, nombre(p, c)])),
    }));
    console.info('MESURES-RENDUS ' + JSON.stringify(lignes));
    // SR_MESURES=detail : tous les composants ré-exécutés de chaque phase (pour savoir QUI se redessine)
    if (process.env.SR_MESURES === 'detail') {
      for (const p of phases) {
        const trie = Object.fromEntries(Object.entries(p.bilan.parComposant).sort((x, y) => y[1] - x[1]));
        console.info('DETAIL-RENDUS ' + p.nom + ' ' + JSON.stringify(trie));
      }
    }
  });

  it('en lecture dans une étape : 0 rendu de Planche, EnTete, Panneau et BarreScene', () => {
    const p = de('lecture, étape en cours');
    expect(rendusDe(p, 'Planche', 'EnTete', 'Panneau', 'BarreScene')).toEqual([0, 0, 0, 0]);
  });

  it('en attente du GO : 0 rendu de Planche, EnTete, Panneau et BarreScene', () => {
    const p = de('attente du GO');
    expect(rendusDe(p, 'Planche', 'EnTete', 'Panneau', 'BarreScene')).toEqual([0, 0, 0, 0]);
  });

  it('en pause : plus aucun rendu du tout', () => {
    expect(de('repos (pause)').bilan.total).toBe(0);
    expect(de('pause (fin)').bilan.total).toBe(0);
  });

  it('en attente du GO : moins de 10 validations React par seconde et rien de lourd ne se redessine', () => {
    const p = de('attente du GO');
    expect(p.bilan.commits / p.secondes).toBeLessThan(10);
    for (const c of ['CoucheActeurs', 'MomentPlanche', 'BlocEtape', 'Pupitre', 'PupitreRegie', 'SectionSorties', 'CurseursDistants', 'PastillesCommentaires']) {
      expect(nombre(p, c), c).toBe(0);
    }
    // ce qui montre le temps ou la scène de la sortie : au plus 4 fois par seconde (relais de la sortie), 1 fois pour l'alerte
    expect(nombre(p, 'ApercuSortie') / p.secondes).toBeLessThanOrEqual(5);
    expect(nombre(p, 'AlerteSecurite') / p.secondes).toBeLessThanOrEqual(1.5);
  });

  it('le régime établi après un GO est le même que dans la première étape : la planche ne se ré-exécute plus', () => {
    const p = de('régime établi après le GO');
    expect(rendusDe(p, 'Planche', 'EnTete', 'Panneau', 'BarreScene', 'CoucheActeurs')).toEqual([0, 0, 0, 0, 0]);
    expect(p.bilan.commits / p.secondes).toBeLessThan(10);
  });

  it('le pupitre ouvert suit le temps au quart de seconde (et la planche, l’en-tête et le panneau restent à 0)', () => {
    const p = de('pupitre ouvert');
    expect(rendusDe(p, 'Planche', 'EnTete', 'Panneau', 'BarreScene')).toEqual([0, 0, 0, 0]);
    expect(nombre(p, 'PupitreOuvert') / p.secondes).toBeLessThanOrEqual(5);
    expect(nombre(p, 'PupitreOuvert')).toBeGreaterThan(0);
    expect(nombre(p, 'Pupitre')).toBe(0);                                  // la coquille du pupitre ne bouge pas
    expect(nombre(p, 'PupitreRegie') / p.secondes).toBeLessThanOrEqual(1); // la régie du pupitre : structure seulement
    expect(p.bilan.commits / p.secondes).toBeLessThan(10);
  });

  it('la tête de lecture et le repère de zoom se déplacent par transform : aucune écriture de left, top, width ou height par image', () => {
    for (const nom of ['lecture', 'attente']) {
      expect(sondes[nom]!.tete?.transform, nom).toMatch(/^translateX\(-?[\d.]+px\)$/);
      expect(sondes[nom]!.repere?.transform, nom).toMatch(/^translateX\(-?[\d.]+px\)$/);
      expect(sondes[nom]!.repere?.left, nom).toBeUndefined();
    }
    for (const nom of ['lecture, étape en cours', 'attente du GO', 'régime établi après le GO']) {
      const p = de(nom);
      for (const k of ['left', 'right', 'top', 'bottom', 'height']) expect(p.styles.parPropriete[k] ?? 0, nom + ' · ' + k).toBe(0);
      // il reste les jauges en pourcentage du panneau (au quart de seconde) : jamais une écriture de géométrie par image
      expect(p.styles.geometrie, nom).toBeLessThan(IMAGES / 3);
    }
  });

  it('les hachures de l’attente du top ne changent que leur clip-path (largeur posée une fois)', () => {
    const h = sondes.attente!.hachures;
    expect(h?.display).toBe('block');
    expect(h?.clipPath).toMatch(/^inset\(0 [\d.]+px 0 0\)$/);
    expect(Number.parseFloat(h?.width ?? '0')).toBeGreaterThan(0);
    const p = de('attente du GO');
    expect(p.styles.parPropriete.clipPath ?? 0).toBeGreaterThan(0);          // la tête avance : les hachures grandissent…
    expect(p.styles.parPropriete.clipPath ?? 0).toBeLessThanOrEqual(Math.ceil(p.secondes * 10) + 2);   // …à 10 Hz au plus
    expect(p.styles.parPropriete.width ?? 0).toBeLessThanOrEqual(2 + 12 * p.secondes);                  // largeur : jauges du panneau seulement
  });

  it('« Où en est-on » ne se rafraîchit pas plus de 10 fois par seconde', () => {
    for (const nom of ['lecture, étape en cours', 'attente du GO']) {
      const p = de(nom);
      expect(nombre(p, 'OuEnEstOn') / p.secondes, nom).toBeLessThanOrEqual(10);
    }
  });

  it('un GO coûte un nombre borné de rendus (le nouveau moment seul, pas toute l’interface à chaque image)', () => {
    const p = de('le GO lui-même (1 image)');
    // la planche change de moment une fois (statuts, caméra) : bien en dessous d'un rendu par image
    expect(nombre(p, 'Planche')).toBeLessThanOrEqual(6);
    expect(nombre(p, 'EnTete')).toBeLessThanOrEqual(6);
    expect(nombre(p, 'BarreScene')).toBeLessThanOrEqual(8);
    expect(p.bilan.commits).toBeLessThan(IMAGES);
  });

  it('la lecture n’est publiée que quand la structure change (ou à un battement lent), jamais à chaque image', () => {
    const p = de('lecture, étape en cours');
    expect(p.publications).toBeLessThanOrEqual(Math.ceil(p.secondes / 0.2) + 1);
    expect(p.publications).toBeLessThan(IMAGES / 4);
  });
});
