// État du rail des sorties (coquille/RailSorties.tsx) et de la fenêtre Projet › Spectacle / Liens
// (coquille/LiensActeurs.tsx) : repli du rail, acteur choisi, menu du clic droit, onglet de la fenêtre Projet ; horloge du
// rail (4 rafraîchissements par seconde au plus) ; vignettes ; lien d'un acteur. Rien ici n'entre dans le projet.
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useMagasin } from '../etat/magasin';
import { magasinActeurs, pastilleDiagnostic } from '../etat/acteurs';
import {
  SURVEILLANCE_MS, adressePubliqueSpectacle, jetonActeurSpectacle, lienActeur, lienPublic, sortieLocale, useSpectacle,
  vignettesSorties, type VignetteActeur,
} from '../etat/spectacle';
import { useSortie } from '../sortie';

interface EtatRail {
  /** replié (RÉPÉTITION seulement : en SPECTACLE le rail est toujours déplié) */
  replie: boolean;
  /** acteur dont le détail est ouvert dans le panneau Régie */
  choisi: string | null;
  menu: { id: string; x: number; y: number } | null;
}
export const useRail = create<EtatRail>(() => ({ replie: true, choisi: null, menu: null }));

/** Onglet de la fenêtre Projet (PROJET, SPECTACLE, LIENS) et acteur mis en avant dans les liens. */
export type OngletProjet = 'projet' | 'spectacle' | 'liens';
interface EtatOnglet {
  onglet: OngletProjet;
  /** acteur à mettre en avant dans les liens (clic droit « Montrer le QR » du rail) */
  vise: string | null;
  poser: (p: Partial<Omit<EtatOnglet, 'poser'>>) => void;
}
export const useOngletProjet = create<EtatOnglet>(set => ({ onglet: 'projet', vise: null, poser: p => set(p) }));

/** Re-rend le composant toutes les `ms` (horloge du rail). */
export function useHorloge(ms = SURVEILLANCE_MS): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

/** Les vignettes du rail, recalculées à l'horloge du rail. */
export function useVignettes(ms = SURVEILLANCE_MS): VignetteActeur[] {
  const maintenant = useHorloge(ms);
  const projet = useMagasin(s => s.projet);
  const mode = useMagasin(s => s.mode);
  // abonnés pour re-rendre aussitôt un changement de liaison ou de fenêtre
  useSortie(s => s.fenetre);
  useSpectacle(s => s.ligne);
  return vignettesSorties({
    projet, acteurs: magasinActeurs.getState(), local: sortieLocale(useSortie.getState(), maintenant), spectacle: mode === 'spectacle', maintenant,
  });
}

/** Pastille (texte, couleur) de chaque acteur du projet, pour la bande de la planche et la fenêtre Acteurs : même
 *  diagnostic que le rail des sorties, donc elle se colore dès que `poserEtatActeur` / `poserResumeSalle` sont appelés. */
export function usePastillesActeurs(): Record<string, { texte: string; couleur: string }> {
  const vignettes = useVignettes(1000);
  const sortie: Record<string, { texte: string; couleur: string }> = {};
  for (const v of vignettes) sortie[v.id] = pastilleDiagnostic(v.diag, v.agregats);
  return sortie;
}

/** Lien de l'acteur (public : l'application sans jeton ; acteur nommé : avec le jeton des acteurs). */
export function lienDeLActeur(v: Pick<VignetteActeur, 'id' | 'cardinalite' | 'type'>): string | null {
  const publique = adressePubliqueSpectacle();
  if (v.type === 'agent' || v.type === 'ecran') return null;
  if (v.cardinalite === 'n') return lienPublic(publique);
  const jeton = jetonActeurSpectacle();
  return jeton ? lienActeur(publique, v.id, jeton) : null;
}

