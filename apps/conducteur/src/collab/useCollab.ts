// useCollab() : l'état de la salle (connecté, membres, chat, commentaires, verrous…) et ses actions.
// Les composants de src/collab lisent `useSalle` par sélecteur (moins de rendus) ; la coquille peut utiliser ce hook.
import { useCallback, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  connecterSalle, deconnecterSalle, enregistrerSurServeur, useSalle, type EtatCollab,
} from '../etat/serveur';
import type { Ack, Ancre, Curseur, ModeSalle, Verrou } from './protocole';

const horsSalle = (): Promise<Ack> => Promise.reject(new Error('Hors salle : ouvrez un projet du serveur.'));
const salle = () => useSalle.getState().salle;

/** Actions de la salle (stables, utilisables hors React). Sans salle ouverte, les envois sont refusés. */
export const actionsCollab = {
  ouvrir: (projet: string, jeton?: string) => connecterSalle(projet, jeton),
  quitter: () => deconnecterSalle(true),
  ecrire: (texte: string) => salle()?.chat(texte) ?? horsSalle(),
  commenter: (ancre: Ancre, texte: string) => salle()?.commenter(ancre, texte) ?? horsSalle(),
  resoudre: (id: string) => salle()?.commentaire('resoudre', id) ?? horsSalle(),
  rouvrir: (id: string) => salle()?.commentaire('rouvrir', id) ?? horsSalle(),
  supprimerCommentaire: (id: string) => salle()?.commentaire('supprimer', id) ?? horsSalle(),
  prendre: (cible: string) => salle()?.verrou('prendre', cible) ?? horsSalle(),
  rendre: (cible: string) => salle()?.verrou('rendre', cible) ?? horsSalle(),
  forcer: (cible: string) => salle()?.verrou('forcer', cible) ?? horsSalle(),
  changerMode: (mode: ModeSalle) => salle()?.mode(mode) ?? horsSalle(),
  enregistrer: (message?: string) => enregistrerSurServeur(message),
  curseur: (c: Curseur | null) => { salle()?.curseur(c); },
};

export interface Collab extends Omit<EtatCollab, 'salle'> {
  connecte: boolean;
  /** identifiant de la personne de ce navigateur dans la salle */
  moi: string | null;
  verrouDe: (cible: string) => Verrou | undefined;
  jeTiens: (cible: string) => boolean;
  actions: typeof actionsCollab;
}

/** État de la salle + actions. Sans salle ouverte : statut 'ferme', listes vides, tout reste local. */
export function useCollab(): Collab {
  const etat = useSalle(useShallow((s) => { const { salle, ...reste } = s; void salle; return reste; }));
  const moi = etat.vous?.personne ?? null;
  return useMemo(() => ({
    ...etat,
    connecte: etat.statut === 'connecte',
    moi,
    verrouDe: (cible: string) => etat.verrous.find((v) => v.cible === cible),
    jeTiens: (cible: string) => etat.verrous.some((v) => v.cible === cible && v.personne === moi),
    actions: actionsCollab,
  }), [etat, moi]);
}

/**
 * Émet le curseur de cette personne sur une zone. `versMonde` convertit la position du pointeur (relative à
 * l'élément qui reçoit les événements) en coordonnées du monde de la zone (planche : pixels du monde ; conduite :
 * x = temps en s). Renvoie les gestionnaires à poser sur l'élément.
 */
export function useEmettreCurseur(
  zone: Curseur['zone'],
  versMonde: (x: number, y: number) => { x: number; y: number; moment?: string; etape?: string },
) {
  const conv = useRef(versMonde);
  conv.current = versMonde;
  const onPointerMove = useCallback((e: { clientX: number; clientY: number; currentTarget: Element }) => {
    const r = e.currentTarget.getBoundingClientRect();
    const m = conv.current(e.clientX - r.left, e.clientY - r.top);
    if (Number.isFinite(m.x) && Number.isFinite(m.y)) actionsCollab.curseur({ zone, ...m });
  }, [zone]);
  const onPointerLeave = useCallback(() => actionsCollab.curseur(null), []);
  return { onPointerMove, onPointerLeave };
}
