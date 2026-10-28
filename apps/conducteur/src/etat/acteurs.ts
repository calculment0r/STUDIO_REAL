// État des acteurs du spectacle, vu de la régie (audit 2026-10, rapport 1 §4.4 et rapport 2 §4.2) : ce que chaque
// acteur dit de lui-même (hors ligne, présents, connecté, dernière vue affichée) et le téléphone témoin de l'émulateur.
// Rien ici n'entre dans le projet ni dans l'export : c'est l'état du soir, rempli par d'autres lots.
//
// API pour les autres lots (à appeler hors React, depuis n'importe quel module) :
//   poserEtatActeur(id, etat)    le client réseau de la régie (lot « rail des sorties ») pose l'état d'un acteur à chaque
//                                battement : { etat: 'connecte' | 'present' | 'hors-ligne', n?, vue?, latence?, detail? } ;
//                                `null` efface l'acteur (retour au gris « inconnu »).
//   viderEtatsActeurs()          nouvelle représentation, ou déconnexion de la salle.
//   brancherTemoin(fn)           l'émulateur (lot « émulateur ») déclare son téléphone témoin ; `fn` reçoit la vue à
//                                montrer et renvoie true si elle est partie. Renvoie la fonction de débranchement.
//   testerVue(vue)               bouton « Tester » de l'inspecteur : envoie la vue au témoin s'il existe, sinon ne fait
//                                rien (renvoie { envoye: false }). Jamais vers le vrai public.
// Pour un essai à la main dans la console du navigateur : window.studioRealActeurs.poserEtatActeur('public', { etat: 'present', n: 12 }).
import { create } from 'zustand';

/** Ce qu'un acteur dit de lui : connecté (acteur nommé, sortie), présents (foule), hors ligne (perdu). */
export type GenreEtatActeur = 'connecte' | 'present' | 'hors-ligne';

/** Vue (écran + réglages) qu'un acteur dit afficher. */
export interface VueAffichee { ecran: string; params?: Record<string, unknown>; cle?: string }

export interface EtatActeur {
  etat: GenreEtatActeur;
  /** foule : nombre de téléphones présents */
  n?: number;
  /** dernière vue connue (ce qui est AFFICHÉ, pas ce qui a été demandé) */
  vue?: VueAffichee;
  /** latence mesurée (ms) */
  latence?: number;
  /** précision libre (« iPhone · 82 % batterie ») */
  detail?: string;
  /** horodatage mural de la dernière nouvelle (posé par poserEtatActeur) */
  recu?: number;
}

/** Ce que le bouton « Tester » envoie au témoin. */
export interface VueTest { acteur: string; ecran?: string; fx?: string; params: Record<string, unknown> }
/** Le téléphone témoin : renvoie true si la vue est partie. */
export type FonctionTemoin = (vue: VueTest) => boolean | void;

interface MagasinActeurs {
  etats: Record<string, EtatActeur>;
  temoin: FonctionTemoin | null;
}

export const useActeurs = create<MagasinActeurs>(() => ({ etats: {}, temoin: null }));

/** Pose (ou efface avec null) l'état d'un acteur. */
export function poserEtatActeur(id: string, etat: EtatActeur | null): void {
  if (typeof id !== 'string' || !id) return;
  const etats = { ...useActeurs.getState().etats };
  if (etat) etats[id] = { ...etat, recu: etat.recu ?? Date.now() };
  else delete etats[id];
  useActeurs.setState({ etats });
}

export function viderEtatsActeurs(): void {
  useActeurs.setState({ etats: {} });
}

/** L'émulateur déclare son téléphone témoin ; renvoie la fonction qui le débranche. */
export function brancherTemoin(fn: FonctionTemoin): () => void {
  useActeurs.setState({ temoin: fn });
  return () => { if (useActeurs.getState().temoin === fn) useActeurs.setState({ temoin: null }); };
}

/** Bouton « Tester » : la vue part au témoin s'il existe (sinon rien). */
export function testerVue(vue: VueTest): { envoye: boolean; message: string } {
  const t = useActeurs.getState().temoin;
  if (!t) return { envoye: false, message: 'Aucun téléphone témoin : ouvrez l’émulateur pour tester.' };
  try {
    const r = t(vue);
    return r === false ? { envoye: false, message: 'Le téléphone témoin a refusé la vue.' } : { envoye: true, message: 'Vue envoyée au téléphone témoin.' };
  } catch (e) {
    return { envoye: false, message: 'Téléphone témoin en erreur : ' + (e as Error).message };
  }
}

/** Libellé et jeton de couleur de la pastille d'un acteur (gris tant que personne n'a rien posé). */
export function pastilleEtat(e: EtatActeur | undefined, foule: boolean): { texte: string; couleur: string } {
  if (!e) return { texte: 'inconnu', couleur: 'rgba(var(--lr), .35)' };
  if (e.etat === 'hors-ligne') return { texte: 'hors ligne', couleur: 'var(--rec)' };
  if (e.etat === 'present' || (foule && typeof e.n === 'number')) return { texte: `${e.n ?? 0} présent${(e.n ?? 0) > 1 ? 's' : ''}`, couleur: 'var(--gt)' };
  return { texte: 'connecté', couleur: 'var(--gt)' };
}

if (typeof window !== 'undefined') {
  (window as unknown as { studioRealActeurs?: unknown }).studioRealActeurs = { poserEtatActeur, viderEtatsActeurs, brancherTemoin, testerVue };
}
