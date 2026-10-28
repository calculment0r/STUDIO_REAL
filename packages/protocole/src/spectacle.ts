// Le protocole UNIQUE du serveur de spectacle (audit 2026-10, rapport 1 §4.3, retours des sorties du rapport 2 §4.3).
// Types seulement ; la validation est dans lire.ts, la référence lisible dans ../PROTOCOLE.md.
//
// Un serveur, un protocole, des acteurs sur la planche : la régie conduit (`conduite`), le serveur fait tourner le
// lecteur et diffuse à chaque acteur sa `vue` (écran persistant, numérotée par `vseq`) et ses `fx` (effets éphémères) ;
// les acteurs renvoient leurs entrées (`in`) et leur battement (`etat` : ce qui est AFFICHÉ) ; les agents (figurants,
// ElevenLabs, Whisper, OSC) reçoivent les commandes numérotées du lecteur (`agent.cmd`) et les accusent (`agent.ack`).
// Numérotation : `cseq` par session (client → serveur, `ack` doublon) ; `vseq` par acteur (serveur → client, trou →
// `resync`) ; `n` = numéro de commande du lecteur, unique par représentation (idempotence chez l'agent).
// Heures : `at`, `ts` en ms, horloge du SERVEUR ; `tc`, `heure` en ms, horloge du client.
import type { EtatLecture } from '@studio-real/modele';

export const VERSION_PROTOCOLE = 2;

/** Bornes de validation (lire.ts). */
export const LIMITES = {
  /** message reçu sous forme de texte JSON (caractères) */
  message: 256 * 1024,
  /** tout texte libre (chat, transcription, params…) */
  texte: 2000,
  /** tout tableau */
  tableau: 200,
  /** clés d'un objet libre (params, données) */
  cles: 200,
  /** profondeur d'un objet libre */
  profondeur: 8,
  /** signal WebRTC relayé, JSON sérialisé */
  rtc: 64 * 1024,
  /** durée de vie maximale d'un effet (ms) */
  ttl: 10 * 60 * 1000,
} as const;

// ── Rôles ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Rôle déclaré dans `hello` (un jeton par rôle) :
 *  auteur : poste d'écriture (messages v1 de la salle de projet, inchangés) ; regie : le Conducteur en mode scène ;
 *  acteur : sortie scène, téléphone du public ou nommé, prompteur ; agent : service externe (figurants, ElevenLabs,
 *  Whisper, pont OSC). */
export type Role = 'auteur' | 'regie' | 'acteur' | 'agent';
export const ROLES: readonly Role[] = ['auteur', 'regie', 'acteur', 'agent'];

/** Version de l'application cliente (comparée à celle de la régie : « sortie périmée, recharger »). */
export interface AppClient { version: string; build: string }

// ── Client → serveur ───────────────────────────────────────────────────────────────────────────────────────────────

/** Premier message de toute connexion (remplace `hello` v1, `bonjour` de la sortie et `hello` des figurants). */
export interface MsgHello {
  t: 'hello';
  v: number;
  role: Role;
  /** id de l'acteur incarné (obligatoire pour `acteur` et `agent`) : 'public', 'scene', 'ministre', 'figurants'… */
  acteur?: string;
  /** identifiant stable de la personne (téléphone du public, poste) */
  personne?: string;
  /** identifiant de la connexion logique, gardé pendant les reconnexions */
  session: string;
  /** jeton du rôle (jamais dans l'adresse une fois connecté) */
  jeton: string;
  /** dernière `vue.vseq` reçue (reprise : le serveur renvoie la vue courante si elle est plus récente) */
  vseq?: number;
  /** dernier `cseq` envoyé par cette session (le serveur dit dans `bienvenue` lequel il a reçu) */
  cseq?: number;
  app?: AppClient;
  /** ce que le client sait faire : 'video', 'son', 'vibrer', 'visio', 'camera', 'plein-ecran'… */
  capacites?: string[];
}

/** Ordres de la régie. `reprendre` = repartir d'un point de reprise (lecteur.reprendre) ; `pause{pause:false}` relance. */
export type OpConduite =
  | { op: 'top' }
  | { op: 'lancer'; mode?: 'repetition' | 'scene'; graine?: number }
  | { op: 'pause'; pause: boolean }
  | { op: 'allerA'; moment: string; etape?: string }
  | { op: 'reprendre'; point?: string }
  | { op: 'poser'; nom: string; valeur: number | string | boolean }
  | { op: 'signal'; nom: string; donnees?: unknown }
  /** vue imposée à la main à un acteur (ou une cible dans la foule), journalisée */
  | { op: 'forcer'; acteur: string; vue: { ecran: string; params?: Record<string, unknown> } }
  /** tous les acteurs sur leur écran de sécurité (noir, « regardez la scène ») ; actif:false lève la panique */
  | { op: 'panique'; actif: boolean }
  /** décision sur une réplique de figurant en attente (ex `fig.valide`) */
  | { op: 'valider'; id: string; ok: boolean; texte?: string };
export type NomOpConduite = OpConduite['op'];
export const OPS_CONDUITE: readonly NomOpConduite[] = ['top', 'lancer', 'pause', 'allerA', 'reprendre', 'poser', 'signal', 'forcer', 'panique', 'valider'];

export type MsgConduite = { t: 'conduite'; cseq: number } & OpConduite;

/** Entrées d'un acteur (une seule famille : ex `entree` et `ack{n, affiche}` des sorties, `vote.choix`, `msg`…). */
export type EntreeActeur =
  | { k: 'vote'; q?: string; data: { index: number; numero?: number } }
  | { k: 'texte'; q?: string; data: { texte: string } }
  | { k: 'reaction'; data: { emoji: string; n?: number } }
  | { k: 'pret'; data: { pret: boolean } }
  | { k: 'presence'; data: { visible: boolean } }
  | { k: 'fin-video'; data: { asset: string; vseq?: number } }
  | { k: 'transcription'; data: { texte: string; final?: boolean } }
  /** accusé d'affichage d'une vue : `affiche` = heure (client) où elle est À L'ÉCRAN ; `refus` si elle ne peut pas l'être */
  | { k: 'accuse'; data: { vseq: number; affiche: number; refus?: RefusAffichage } };
export type GenreEntree = EntreeActeur['k'];
export const GENRES_ENTREE: readonly GenreEntree[] = ['vote', 'texte', 'reaction', 'pret', 'presence', 'fin-video', 'transcription', 'accuse'];
export type RefusAffichage = 'version' | 'invalide' | 'capacite';

export type MsgIn = { t: 'in'; cseq: number; /** heure du client au geste */ heure?: number } & EntreeActeur;

/** Écran effectivement affiché par un acteur (battement). */
export interface EcranAffiche {
  vseq: number;
  ecran: string;
  /** clé de l'envoi (Vue.cle du modèle) */
  cle?: string;
  /** heure (client) depuis laquelle il est affiché */
  depuis: number;
}

export interface MediaActeur {
  asset: string;
  /** part préchargée, 0 → 1 */
  pret: number;
  lecture: 'attente' | 'lit' | 'fin' | 'bloque' | 'absent';
}

/** Battement d'un acteur : 1 / s (écran), 1 / 5 s (téléphone). Ce qui est AFFICHÉ, pas ce qui a été demandé. */
export interface MsgEtat {
  t: 'etat';
  heure: number;
  ecran: EcranAffiche | null;
  visible: boolean;
  enLigne?: boolean;
  rttMs?: number;
  decalageMs?: number;
  media?: MediaActeur[];
  /** 0 → 100 */
  batterie?: number;
  erreurs?: string[];
}

/** Accusé d'une commande du lecteur par un agent (→ signal 'accuse:<étape>' du lecteur quand statut = 'fait'). */
export interface MsgAgentAck { t: 'agent.ack'; n: number; statut: 'recu' | 'fait' | 'echec' | 'refus'; detail?: string }

/** Entrée d'un agent : 'say' (réplique de figurant → mur, par le filtre du serveur), 'stat', 'transcript', 'fin-appel'… */
export interface MsgAgentIn { t: 'agent.in'; cseq: number; k: string; data: Record<string, unknown> }

export interface MsgPing { t: 'ping'; tc: number }
/** Le client a vu un trou de `vseq` (ou se croit perdu) : le serveur renvoie la vue courante (`vue`) ou `bienvenue`. */
export interface MsgResyncClient { t: 'resync' }
/** Signalisation WebRTC relayée (visio, flux du streamer) : `vers` = acteur ou session ; `signal` opaque. */
export interface MsgRtcClient { t: 'rtc'; vers: string; signal: Record<string, unknown> }

export type MessageClient =
  | MsgHello | MsgConduite | MsgIn | MsgEtat | MsgAgentAck | MsgAgentIn | MsgPing | MsgResyncClient | MsgRtcClient;
export type TypeMessageClient = MessageClient['t'];
export const TYPES_CLIENT: readonly TypeMessageClient[] = ['hello', 'conduite', 'in', 'etat', 'agent.ack', 'agent.in', 'ping', 'resync', 'rtc'];

// ── Serveur → client ───────────────────────────────────────────────────────────────────────────────────────────────

/** Vue d'un acteur telle que diffusée (la `Vue` du modèle, numérotée et datée). */
export interface VueDiffusee {
  acteur: string;
  /** numéro croissant par acteur (et par personne pour un envoi ciblé dans la foule) */
  vseq: number;
  /** heure serveur à laquelle la vue vaut (écran programmé : dans le futur) */
  at: number;
  /** null = aucun écran encore (attente) */
  ecran: string | null;
  params: Record<string, unknown>;
  cle?: string;
}

export interface MsgBienvenue {
  t: 'bienvenue';
  v: number;
  role: Role;
  acteur?: string;
  session: string;
  /** heure serveur */
  ts: number;
  /** vue courante de l'acteur (instantané) */
  vue: VueDiffusee | null;
  /** dernier cseq reçu de cette session (le client renvoie ce qui suit) */
  cseq: number;
  /** pour la régie : état de lecture courant */
  lecture?: { etat: EtatLecture; par: string; ts: number } | null;
}

export interface MsgVue extends VueDiffusee { t: 'vue' }

/** Effet éphémère : pas rejoué si `at + ttl` est passé (reprise). */
export interface MsgFx { t: 'fx'; acteur: string; id: string; at: number; kind: string; p: Record<string, unknown>; ttl: number }

/** État de lecture (régie), émis par le serveur en scène. */
export interface MsgLecture { t: 'lecture'; etat: EtatLecture; par: string; ts: number }

/** Résumé de la salle pour la régie (≤ 4 par seconde). */
export interface MsgSalle {
  t: 'salle';
  ts: number;
  acteurs: Record<string, { presents: number; prets?: number; enLigne?: number }>;
  vote?: { q: string; recus: number; parts: number[] };
}

/** Commande numérotée du lecteur vers un agent (ex `fig.cmd`, `junon`, appel ElevenLabs…). */
export interface MsgAgentCmd {
  t: 'agent.cmd';
  n: number;
  /** 'figurants.cmd', 'appel', 'machine'… (écran de l'envoi ou type de commande du lecteur) */
  type: string;
  moment?: string;
  etape: string;
  donnees: Record<string, unknown>;
  at?: number;
}

export type StatutAck = 'ok' | 'doublon' | 'refus' | 'ferme';
export interface MsgAck { t: 'ack'; cseq: number; statut: StatutAck; raison?: string; res?: unknown }

/** Connexion ou message refusé hors `cseq` (hello invalide, jeton faux, version) ; `fatal` : le serveur ferme. */
export interface MsgRefus { t: 'refus'; code: string; message: string; fatal?: boolean }

export interface MsgPong { t: 'pong'; tc: number; ts: number }
/** Le serveur demande au client de se resynchroniser (renvoyer `hello`) : redémarrage, changement de représentation. */
export interface MsgResyncServeur { t: 'resync'; raison: string }
export interface MsgRtcServeur { t: 'rtc'; de: string; vers: string; signal: Record<string, unknown>; ts: number }

export type MessageServeur =
  | MsgBienvenue | MsgVue | MsgFx | MsgLecture | MsgSalle | MsgAgentCmd | MsgAck | MsgRefus | MsgPong | MsgResyncServeur
  | MsgRtcServeur;
export type TypeMessageServeur = MessageServeur['t'];
export const TYPES_SERVEUR: readonly TypeMessageServeur[] = ['bienvenue', 'vue', 'fx', 'lecture', 'salle', 'agent.cmd', 'ack', 'refus', 'pong', 'resync', 'rtc'];
