// État propre à la coquille (mise en page, tiroirs, panneaux) : rien ici n'entre dans le projet ni dans l'export.
import { create } from 'zustand';

export type Vue = 'both' | 'board' | 'tracks';
/** r Réglages · a Avancé · s Salle simulée · v Projet · versions · g Régie (entrées extérieures, journal) ·
 *  e Équipe (discussion, commentaires, verrous de la salle collaborative). */
export interface Accordeons { r: boolean; a: boolean; s: boolean; v: boolean; g: boolean; e: boolean }
export type OngletEquipe = 'discussion' | 'commentaires' | 'verrous';

interface Interface {
  vue: Vue;
  largeurPanneau: number;
  hauteurConduite: number;
  /** Réglages ouvert, Avancé fermé, Salle simulée fermée, Versions fermé (comme le design) ; Régie ouverte, Équipe fermée. */
  acc: Accordeons;
  tiroir: boolean;
  pupitre: boolean;
  aide: boolean;
  allerA: boolean;
  /** Recherche (loupe, Ctrl+K). */
  recherche: boolean;
  /** Ouverture de projet (projets du dépôt, du serveur, fichier ; identité dans la salle). */
  projets: boolean;
  /** Fenêtre Projet › Acteurs (acteurs du spectacle : qui reçoit quoi). */
  acteurs: boolean;
  /** Acteur choisi dans la fenêtre Projet › Acteurs (id). */
  acteurChoisi: string | null;
  /** Conduite : acteurs dont la piste (dérivée des envois) est affichée. Réglage du poste, hors projet. */
  pistesActeurs: string[];
  /** Planche : bande des acteurs repliée ; liens étape → acteur montrés. */
  bandeRepliee: boolean;
  liensActeurs: boolean;
  /** Onglet de la section Équipe du panneau. */
  ongletEquipe: OngletEquipe;
  pleinEcran: boolean;
  /** Alertes de sécurité déjà accusées (id du repère, ou « regie:<n> » pour une alerte du moteur). */
  accuses: string[];
  poser: (p: Partial<Omit<Interface, 'poser' | 'basculer'>>) => void;
  basculer: (k: 'tiroir' | 'pupitre' | 'aide' | 'allerA' | 'recherche' | 'projets' | 'acteurs' | 'bandeRepliee' | 'liensActeurs') => void;
  /** Montre ou cache la piste d'un acteur dans la conduite. */
  basculerPisteActeur: (id: string) => void;
  basculerAcc: (k: keyof Accordeons) => void;
  /** Ouvre la section Équipe du panneau sur un onglet (pastille de commentaires, présence). */
  montrerEquipe: (o: OngletEquipe) => void;
}

const CLE_PISTES_ACTEURS = 'sr-conducteur-pistes-acteurs';
function lirePistesActeurs(): string[] {
  try {
    const l: unknown = JSON.parse(localStorage.getItem(CLE_PISTES_ACTEURS) ?? '[]');
    return Array.isArray(l) ? l.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

const hauteurInitiale =() =>
  typeof window === 'undefined' ? 380 : Math.round(Math.max(200, Math.min(420, window.innerHeight * 0.42, window.innerHeight - 56 - 8 - 220)));

export const useInterface = create<Interface>((set, get) => ({
  vue: 'both',
  largeurPanneau: 300,
  hauteurConduite: hauteurInitiale(),
  acc: { r: true, a: false, s: false, v: false, g: true, e: false },
  tiroir: false,
  pupitre: false,
  aide: false,
  allerA: false,
  recherche: false,
  projets: false,
  acteurs: false,
  acteurChoisi: null,
  pistesActeurs: lirePistesActeurs(),
  bandeRepliee: false,
  liensActeurs: true,
  ongletEquipe: 'discussion',
  pleinEcran: false,
  accuses: [],
  poser: (p) => set(p),
  basculer: (k) => set({ [k]: !get()[k] } as Partial<Interface>),
  basculerAcc: (k) => set({ acc: { ...get().acc, [k]: !get().acc[k] } }),
  montrerEquipe: (o) => set({ ongletEquipe: o, acc: { ...get().acc, e: true } }),
  basculerPisteActeur: (id) => {
    const l = get().pistesActeurs;
    const pistesActeurs = l.includes(id) ? l.filter(x => x !== id) : [...l, id];
    try { localStorage.setItem(CLE_PISTES_ACTEURS, JSON.stringify(pistesActeurs)); } catch { /* stockage indisponible */ }
    set({ pistesActeurs });
  },
}));
