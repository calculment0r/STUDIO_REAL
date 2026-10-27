// Magasin d'état du conducteur (zustand). Socle minimal posé pour que CONDUITE et PLANCHE démarrent ;
// le chantier COQUILLE l'enrichit (persistance, annuler/rétablir, lecture branchée sur le moteur) sans casser cette API.
import { create } from 'zustand';
import { exempleDemo, type EtatLecture, type Projet } from '@studio-real/modele';

export type ModeConducteur = 'ecrire' | 'repeter' | 'jouer';

export interface Selection { moment?: string; etape?: string }

export interface Magasin {
  projet: Projet;
  selection: Selection;
  mode: ModeConducteur;
  /** État du moteur de lecture ; null tant que rien n'est lancé. */
  lecture: EtatLecture | null;
  enLecture: boolean;
  /** Zoom de la planche (1 = 100 %) et de la conduite (pixels par seconde). */
  zoomPlanche: number;
  zoomConduite: number;
  theme: 'sombre' | 'clair';

  selectionner: (s: Selection) => void;
  /** Modifie le projet par une fonction qui reçoit une copie (immutabilité simple). */
  modifierProjet: (fn: (p: Projet) => void) => void;
  changerMode: (m: ModeConducteur) => void;
  lancer: () => void;
  pause: () => void;
  top: () => void;
  allerA: (moment: string, etape?: string) => void;
  zoomerPlanche: (z: number) => void;
  zoomerConduite: (z: number) => void;
  basculerTheme: () => void;
}

export const useMagasin = create<Magasin>((set, get) => ({
  projet: exempleDemo(),
  selection: { moment: 'e1' },
  mode: 'ecrire',
  lecture: null,
  enLecture: false,
  zoomPlanche: 1,
  zoomConduite: 0.6,
  theme: 'sombre',

  selectionner: (s) => set({ selection: s }),
  modifierProjet: (fn) => {
    const copie = structuredClone(get().projet);
    fn(copie);
    set({ projet: copie });
  },
  changerMode: (mode) => set({ mode }),
  // Branchés sur le moteur par le chantier COQUILLE (creerLecteur / signauxSalle de @studio-real/modele).
  lancer: () => set({ enLecture: true }),
  pause: () => set({ enLecture: false }),
  top: () => {},
  allerA: (moment, etape) => set({ selection: { moment, etape } }),
  zoomerPlanche: (z) => set({ zoomPlanche: Math.min(3, Math.max(0.2, z)) }),
  zoomerConduite: (z) => set({ zoomConduite: Math.min(8, Math.max(0.05, z)) }),
  basculerTheme: () => {
    const theme = get().theme === 'sombre' ? 'clair' : 'sombre';
    document.documentElement.toggleAttribute('data-theme', theme === 'clair');
    if (theme === 'clair') document.documentElement.setAttribute('data-theme', 'light');
    set({ theme });
  },
}));
