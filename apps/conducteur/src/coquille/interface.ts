// État propre à la coquille (mise en page, tiroirs, panneaux) : rien ici n'entre dans le projet ni dans l'export.
import { create } from 'zustand';

export type Vue = 'both' | 'board' | 'tracks';
export interface Accordeons { r: boolean; a: boolean; s: boolean; v: boolean }

interface Interface {
  vue: Vue;
  largeurPanneau: number;
  hauteurConduite: number;
  /** Réglages ouvert, Avancé fermé, Salle simulée fermée, Versions fermé (comme le design). */
  acc: Accordeons;
  tiroir: boolean;
  pupitre: boolean;
  aide: boolean;
  allerA: boolean;
  /** Recherche (loupe, Ctrl+K). */
  recherche: boolean;
  pleinEcran: boolean;
  /** Alertes de sécurité déjà accusées (id du repère). */
  accuses: string[];
  poser: (p: Partial<Omit<Interface, 'poser' | 'basculer'>>) => void;
  basculer: (k: 'tiroir' | 'pupitre' | 'aide' | 'allerA' | 'recherche') => void;
  basculerAcc: (k: keyof Accordeons) => void;
}

const hauteurInitiale = () =>
  typeof window === 'undefined' ? 380 : Math.round(Math.max(200, Math.min(420, window.innerHeight * 0.42, window.innerHeight - 56 - 8 - 220)));

export const useInterface = create<Interface>((set, get) => ({
  vue: 'both',
  largeurPanneau: 300,
  hauteurConduite: hauteurInitiale(),
  acc: { r: true, a: false, s: false, v: false },
  tiroir: false,
  pupitre: false,
  aide: false,
  allerA: false,
  recherche: false,
  pleinEcran: false,
  accuses: [],
  poser: (p) => set(p),
  basculer: (k) => set({ [k]: !get()[k] } as Partial<Interface>),
  basculerAcc: (k) => set({ acc: { ...get().acc, [k]: !get().acc[k] } }),
}));
