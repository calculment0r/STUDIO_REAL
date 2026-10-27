// Ancres des commentaires et petits formats (purs, partagés par les composants de src/collab).
import { useMemo } from 'react';
import type { Projet } from '@studio-real/modele';
import type { Selection } from '../etat/magasin';
import { useSalle } from '../etat/serveur';
import type { Ancre, Commentaire } from './protocole';

/** Heure murale HH:MM (chat, commentaires). */
export const heureMinute = (t: number) => {
  const d = new Date(t);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

/** Temps de la conduite MM:SS entiers. */
export const mmss = (t: number) => {
  const s = Math.max(0, Math.floor(Number.isFinite(t) ? t : 0));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

/** Clé stable d'une ancre (regroupement des fils). */
export function cleAncre(a: Ancre): string {
  if (a.type === 'etape') return `etape:${a.moment}:${a.etape}`;
  if (a.type === 'moment') return `moment:${a.moment}`;
  return `instant:${Math.floor(a.t)}`;
}

/** Libellé d'une ancre dans le vocabulaire du théâtre. */
export function libelleAncre(a: Ancre, p: Projet): { type: string; nom: string } {
  const m = 'moment' in a && a.moment ? p.ev.find((x) => x.id === a.moment) : undefined;
  if (a.type === 'etape') return { type: 'Étape', nom: m?.st.find((e) => e.id === a.etape)?.name ?? 'étape retirée' };
  if (a.type === 'moment') return { type: 'Moment', nom: m?.name ?? 'moment retiré' };
  return { type: 'Instant', nom: mmss(a.t) + (m ? ' · ' + m.name : '') };
}

/** Ancre proposée pour la sélection courante : étape, sinon moment, sinon l'instant de la tête de lecture. */
export function ancreDeSelection(s: Selection, t: number | null): Ancre | null {
  if (s.moment && s.etape) return { type: 'etape', moment: s.moment, etape: s.etape };
  if (s.moment) return { type: 'moment', moment: s.moment };
  if (t !== null && Number.isFinite(t)) return { type: 'instant', t: Math.max(0, Math.round(t)) };
  return null;
}

/** Commentaires ouverts épinglés sur une ancre (pastille de compte sur la planche ou la conduite). */
export function useCommentairesSur(ancre: Ancre | null): Commentaire[] {
  const commentaires = useSalle((s) => s.commentaires);
  const cle = ancre ? cleAncre(ancre) : null;
  return useMemo(() => (cle ? commentaires.filter((c) => !c.resolu && cleAncre(c.ancre) === cle) : []), [commentaires, cle]);
}
