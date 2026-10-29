// L'horloge de la lecture (lot performance-react, audit de fluidité 07, constats C9/C10) : le TEMPS qui passe, séparé de la
// STRUCTURE de la lecture.
//
// Avant : `lecture` (moment, étape, attente du GO, mémoires, parcours, alertes, journal…) était recréée à chaque image,
// avec le temps dedans ; tout composant abonné à `lecture` était donc ré-exécuté 60 fois par seconde (toute la planche,
// l'en-tête et ses icônes, le pupitre, les aperçus de la sortie…).
// Maintenant : `lecture` (magasin.ts) ne change que lorsque la STRUCTURE change (plus un battement lent de 0,2 s de
// spectacle pour les lecteurs hors React qui veulent un temps récent : relais de la sortie, salle collaborative), et ce
// magasin-ci reçoit le temps À CHAQUE IMAGE : `t` (horloge du spectacle), `tEtape` (temps dans l'étape ou le passage),
// `retard` (cumul des attentes du GO) et `attentes` (attente mesurée à chaque passage, pour les hachures).
//
// Règle pour un composant : s'abonner au temps AVEC UN SÉLECTEUR ARRONDI (à la seconde pour un chronomètre, au quart de
// seconde pour une jauge : `useTempsArrondi`), ou écrire le DOM directement hors de React comme conduite/TeteDeLecture.tsx
// (`useHorloge.subscribe`). Ne jamais lire `lecture.t` pour afficher le temps : il peut avoir 0,2 s de retard.
import { useEffect } from 'react';
import { create } from 'zustand';
import type { EtatLecture } from '@studio-real/modele';

export interface Horloge {
  /** horloge du spectacle (s), retards compris ; comme EtatLecture.t */
  t: number;
  /** temps passé dans l'étape (ou le passage) en cours (s) */
  tEtape: number;
  /** cumul des attentes du GO (s) */
  retard: number;
  /** attente mesurée à chaque passage « go » (id du moment → s) */
  attentes: Record<string, number>;
}

const SANS_ATTENTES: Record<string, number> = {};

export const useHorloge = create<Horloge>(() => ({ t: 0, tEtape: 0, retard: 0, attentes: SANS_ATTENTES }));

/** L'horloge d'un état de lecture. */
export const horlogeDe = (l: Pick<EtatLecture, 't' | 'tEtape' | 'retard' | 'attentes'>): Horloge =>
  ({ t: l.t, tEtape: l.tEtape, retard: l.retard, attentes: l.attentes ?? SANS_ATTENTES });

/** Pose l'horloge (sans effet, donc sans notification, si rien n'a changé). */
export function poserHorloge(h: Horloge): void {
  const a = useHorloge.getState();
  if (a.t === h.t && a.tEtape === h.tEtape && a.retard === h.retard && a.attentes === h.attentes) return;
  useHorloge.setState(h);
}

/**
 * Le temps `champ` arrondi vers le bas au multiple de `pas` secondes : le composant n'est ré-exécuté que lorsque la valeur
 * arrondie change (1 pour un chronomètre MM:SS, 0,25 pour une jauge). `pas` doit être un nombre « rond » en binaire
 * (1, 0,5, 0,25…) pour que les valeurs rendues restent exactes.
 */
export function useTempsArrondi(champ: 't' | 'tEtape' | 'retard', pas = 1): number {
  return useHorloge(h => Math.floor(h[champ] / pas + 1e-9) * pas);
}

/**
 * Écrit l'horloge hors de React : `ecrire` est appelé tout de suite puis à chaque changement de l'horloge, sans rendu.
 * `ecrire` doit être stable (useCallback) ; elle fait ses propres économies (ne rien toucher si la valeur à l'écran est la même).
 */
export function useHorlogeHorsReact(ecrire: (h: Horloge) => void): void {
  useEffect(() => {
    ecrire(useHorloge.getState());
    return useHorloge.subscribe(ecrire);
  }, [ecrire]);
}
