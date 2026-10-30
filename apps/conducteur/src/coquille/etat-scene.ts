// Décisions pures de la régie (sans React ni magasin, testées dans etat/magasin.test.ts) :
//   - ce que fait une touche selon le mode (Espace = GO en SPECTACLE, lecture / pause en RÉPÉTITION) ;
//   - l'état de la représentation affiché dans l'en-tête (badge à côté de l'horloge) et sa teinte.
import type { EtatLecture } from '@studio-real/modele';
import type { ModeConducteur } from '../etat/magasin';

export type ActionTouche = 'go' | 'lecture' | 'retenir' | 'prolonger' | 'sauter';

/** Touche → action de la barre de scène. SPECTACLE : Espace = GO, Maj+Espace = lecture / pause. RÉPÉTITION : Espace =
 *  lecture / pause (Maj+Espace aussi). T ou G = GO dans les deux modes. H = RETENIR, J = +30 s, Ctrl+Maj+K = SAUTER À… (Ctrl+K reste à la recherche)
 *  PANIQUE n'a JAMAIS de touche (appui long ou double-clic seulement). Toute autre combinaison avec Ctrl, Méta ou Alt
 *  n'est pas une commande de lecture. null : la touche n'est pas une commande de la barre. */
export function actionTouche(
  e: { code?: string; key?: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
  mode: ModeConducteur,
): ActionTouche | null {
  const k = e.key ?? '';
  if (e.ctrlKey || e.metaKey) return (k === 'k' || k === 'K') && !e.altKey && !!e.shiftKey ? 'sauter' : null;
  if (e.altKey) return null;
  if (e.code === 'Space' || k === ' ') return mode === 'spectacle' && !e.shiftKey ? 'go' : 'lecture';
  if (k === 't' || k === 'T' || k === 'g' || k === 'G') return 'go';
  if (k === 'h' || k === 'H') return 'retenir';
  if (k === 'j' || k === 'J') return 'prolonger';
  return null;
}

/** Teinte d'un état : ambre = attend un humain, vert = ça joue, acier = on lit. */
export type TonEtat = 'ambre' | 'vert' | 'acier';
export interface EtatRepresentation { libelle: string; ton: TonEtat; pulse: boolean }

/** PRÊT / EN LECTURE / ATTENTE DU TOP / EN PAUSE / BLOQUÉ / TERMINÉ. L'attente du top est un état de la lecture (la
 *  lecture continue) ; EN PAUSE, c'est l'horloge arrêtée à la main (Maj+Espace) une fois la représentation lancée. */
export function etatRepresentation(lecture: EtatLecture | null, enLecture: boolean): EtatRepresentation {
  if (!lecture) return { libelle: 'PRÊT', ton: 'acier', pulse: false };
  if (lecture.termine) return { libelle: 'TERMINÉ', ton: 'acier', pulse: false };
  if (!enLecture) {
    const pasCommence = lecture.t <= 0 && (lecture.parcours?.length ?? 0) <= 1;
    return pasCommence ? { libelle: 'PRÊT', ton: 'acier', pulse: false } : { libelle: 'EN PAUSE', ton: 'ambre', pulse: false };
  }
  if (lecture.attenteGo) return { libelle: 'ATTENTE DU TOP', ton: 'ambre', pulse: true };
  if (lecture.bloque) return { libelle: 'BLOQUÉ', ton: 'ambre', pulse: true };
  return { libelle: 'EN LECTURE', ton: 'vert', pulse: false };
}
