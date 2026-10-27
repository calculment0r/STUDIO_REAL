// Types des messages de la salle (WebSocket), recopiés de apps/serveur/src/logique/protocole.ts (PROTOCOLE.md, v1).
// Recopie volontaire : l'interface ne dépend pas du code du Worker. À garder alignée avec le serveur.
import type { Op } from './ops';

export const VERSION_PROTOCOLE = 1;
export const LIMITES_WS = { message: 256 * 1024, chat: 2000, commentaire: 4000, nom: 60 } as const;

export type Role = 'auteur' | 'regie' | 'poste';
export type ModeSalle = 'ecrire' | 'repeter' | 'jouer';

/** Où un commentaire est épinglé : une étape, un moment, ou un instant de la conduite (t en secondes). */
export type Ancre =
  | { type: 'etape'; moment: string; etape: string }
  | { type: 'moment'; moment: string }
  | { type: 'instant'; t: number; moment?: string };

/** Curseur : planche (coordonnées du monde) ou conduite (x = temps en s, y = rangée/pixels du monde). */
export interface Curseur { zone: 'planche' | 'conduite'; x: number; y: number; moment?: string; etape?: string }

export interface Personne { personne: string; nom: string; couleur: string; role: Role; curseur?: Curseur }

export interface Commentaire {
  id: string; ancre: Ancre; texte: string; auteur: string; nom: string; couleur: string; cree_le: number; resolu: boolean;
}

export interface MessageChat { id: number; personne: string; nom: string; couleur: string; texte: string; t: number }

export interface Verrou { cible: string; personne: string; nom: string; pris_le: number }

export type StatutAck = 'ok' | 'doublon' | 'refus' | 'conflit';
export interface Ack { t: 'ack'; cseq: number; statut: StatutAck; raison?: string; res?: unknown }

export type MessageClient =
  | { t: 'hello'; v: number; personne: string; session: string; nom: string; couleur?: string; role?: Role; seq?: number }
  | { t: 'curseur'; curseur: Curseur | null }
  | { t: 'modif'; cseq: number; base: number; ops: Op[] }
  | { t: 'chat'; cseq: number; texte: string }
  | { t: 'commentaire'; cseq: number; action: 'ajouter'; ancre: Ancre; texte: string }
  | { t: 'commentaire'; cseq: number; action: 'resoudre' | 'rouvrir' | 'supprimer'; id: string }
  | { t: 'verrou'; cseq: number; action: 'prendre' | 'rendre' | 'forcer'; cible: string }
  | { t: 'mode'; cseq: number; mode: ModeSalle }
  | { t: 'lecture'; cseq?: number; etat: unknown }
  | { t: 'enregistrer'; cseq: number; message?: string }
  | { t: 'resync' }
  | { t: 'ping'; id?: number }
  | { t: 'bye' };

export type MessageServeur =
  | {
      t: 'bienvenue'; v: number; vous: Personne & { session: string };
      seq: number; version: number; a_jour: boolean; projet: unknown;
      mode: ModeSalle; lecture: { etat: unknown; par: string; ts: number } | null;
      presents: Personne[]; verrous: Verrou[]; commentaires: Commentaire[]; chat: MessageChat[]; ts: number;
    }
  | Ack
  | { t: 'modif'; seq: number; ops: Op[]; par: string; session: string; cseq: number }
  | { t: 'instantane'; seq: number; version: number; projet: unknown; raison: string }
  | { t: 'arrivee'; personne: Personne }
  | { t: 'depart'; personne: string }
  | { t: 'curseur'; personne: string; curseur: Curseur | null }
  | { t: 'chat'; message: MessageChat }
  | { t: 'commentaire'; action: 'ajoute' | 'modifie' | 'supprime'; commentaire: Commentaire | { id: string } }
  | { t: 'verrou'; cible: string; personne: string | null; nom?: string }
  | { t: 'mode'; mode: ModeSalle; par: string }
  | { t: 'lecture'; etat: unknown; par: string; ts: number }
  | { t: 'version'; version: number; par: string; message?: string; seq: number }
  | { t: 'pong'; id?: number; ts: number }
  | { t: 'erreur'; code: string; message: string };

/** Message de refus du serveur → phrase pour la régie (vocabulaire du théâtre). */
export function raisonLisible(raison: string): string {
  const v = /^verrouille:(projet|lecture|moment|piste)(?::([^:]*))?:(.*)$/.exec(raison);
  if (v) {
    const quoi = v[1] === 'projet' ? 'le projet' : v[1] === 'lecture' ? 'la lecture' : v[1] === 'moment' ? 'ce moment' : 'cette piste';
    return `${v[3] || 'Quelqu’un'} tient ${quoi} : modification refusée.`;
  }
  switch (raison) {
    case 'mode-scene': return 'Mode Scène : le projet est gelé (seul qui tient la main modifie).';
    case 'chemin-introuvable': return 'Cet élément a été retiré ou déplacé par un autre membre.';
    case 'enregistrement-en-cours': return 'Enregistrement en cours : réessayez dans un instant.';
    case 'autres-verrous-actifs': return 'D’autres membres tiennent encore des verrous.';
    case 'verrou-non-detenu': return 'Vous ne tenez pas ce verrou.';
    case 'detenteur-connecte': return 'Son détenteur est encore connecté : impossible de forcer.';
    case 'auteur-seulement': return 'Seul l’auteur peut supprimer ce commentaire.';
    case 'commentaire-introuvable': return 'Commentaire introuvable.';
    case 'role-regie-requis': return 'Réservé à la régie.';
    case 'trop-gros': return 'Modification trop lourde pour la salle : enregistrez une version.';
    default: return 'Refusé par la salle : ' + raison;
  }
}

/** Couleurs de présence : la couleur donnée par le serveur (palette de couleurPour) → jeton du thème. */
const PALETTE_SERVEUR = ['#e0674a', '#f0b49b', '#2f6b4a', '#b9cfd8', '#d9a441', '#8f7ad6', '#4aa3a1', '#c25a7c'];
const JETONS_PRESENCE = ['var(--ort)', 'var(--rampe-1)', 'var(--gt)', 'var(--cy)', 'var(--spec-3)', 'var(--fam-scene)', 'var(--vert-pale)', 'var(--rampe-3)'];
export function jetonCouleur(couleur: string | undefined, personne = ''): string {
  const i = PALETTE_SERVEUR.indexOf((couleur ?? '').toLowerCase());
  if (i >= 0) return JETONS_PRESENCE[i]!;
  let h = 0;
  for (let k = 0; k < personne.length; k++) h = (h * 31 + personne.charCodeAt(k)) >>> 0;
  return JETONS_PRESENCE[h % JETONS_PRESENCE.length]!;
}
