// Messages WebSocket de la salle de projet (JSON texte, champ `t` obligatoire). PUR : partagé par le Durable Object
// et les tests ; l'interface (apps/conducteur) peut recopier ces types. Documentation : apps/serveur/PROTOCOLE.md.
import type { EtatLecture, Projet } from '@studio-real/modele';
import { validerOps, ErreurOp, type Op } from './ops';
import { MODES, cibleValide, type ModeSalle, type Verrou } from './verrous';

export const VERSION_PROTOCOLE = 1;

export const LIMITES_WS = {
  /** taille max d'un message reçu (octets UTF-16 approx.) ; un delta peut porter un moment collé */
  message: 256 * 1024,
  chat: 2000,
  commentaire: 4000,
  nom: 60,
  /** historique de chat renvoyé à l'arrivée */
  historiqueChat: 100,
  /** message de la sortie écran scène (régie ↔ sortie), JSON sérialisé */
  scene: 32 * 1024,
  /** signal WebRTC relayé (offre/réponse SDP, candidat ICE, consigne au streamer), JSON sérialisé */
  rtc: 64 * 1024,
} as const;

export type Role = 'auteur' | 'regie' | 'poste';
const ROLES: readonly Role[] = ['auteur', 'regie', 'poste'];

/** Où un commentaire est épinglé. */
export type Ancre =
  | { type: 'etape'; moment: string; etape: string }
  | { type: 'moment'; moment: string }
  | { type: 'instant'; t: number; moment?: string };

/** Position d'un curseur : sur la planche (coordonnées du monde) ou sur la conduite (temps en s). */
export interface Curseur { zone: 'planche' | 'conduite'; x: number; y: number; moment?: string; etape?: string }

export interface Personne { personne: string; nom: string; couleur: string; role: Role; curseur?: Curseur }

export interface Commentaire {
  id: string; ancre: Ancre; texte: string; auteur: string; nom: string; couleur: string;
  cree_le: number; resolu: boolean;
}

export interface MessageChat { id: number; personne: string; nom: string; couleur: string; texte: string; t: number }

// ───────── Client → serveur ─────────
export type MessageClient =
  | { t: 'hello'; v: number; personne: string; session: string; nom: string; couleur?: string; role?: Role; seq?: number }
  | { t: 'curseur'; curseur: Curseur | null }
  | { t: 'modif'; cseq: number; base: number; ops: Op[] }
  | { t: 'chat'; cseq: number; texte: string }
  | { t: 'commentaire'; cseq: number; action: 'ajouter'; ancre: Ancre; texte: string }
  | { t: 'commentaire'; cseq: number; action: 'resoudre' | 'rouvrir' | 'supprimer'; id: string }
  | { t: 'verrou'; cseq: number; action: 'prendre' | 'rendre' | 'forcer'; cible: string }
  | { t: 'mode'; cseq: number; mode: ModeSalle }
  | { t: 'lecture'; cseq?: number; etat: EtatLecture | Record<string, unknown> }
  | { t: 'enregistrer'; cseq: number; message?: string }
  /** sortie écran scène : message opaque relayé aux autres (régie → sortie, sortie → régie), jamais gardé */
  | { t: 'scene'; message: Record<string, unknown> }
  /** signalisation WebRTC (flux du streamer) : `signal` opaque relayé tel quel à la session `vers` ('*' = tous les autres) */
  | { t: 'rtc'; vers: string; signal: Record<string, unknown> }
  | { t: 'resync' }
  | { t: 'ping'; id?: number }
  | { t: 'bye' };

// ───────── Serveur → client ─────────
export type StatutAck = 'ok' | 'doublon' | 'refus' | 'conflit';
export type MessageServeur =
  | {
      t: 'bienvenue'; v: number; vous: Personne & { session: string };
      seq: number; version: number; a_jour: boolean; projet: Projet | null;
      mode: ModeSalle; lecture: { etat: unknown; par: string; ts: number } | null;
      presents: Personne[]; verrous: Verrou[]; commentaires: Commentaire[]; chat: MessageChat[]; ts: number;
    }
  | { t: 'ack'; cseq: number; statut: StatutAck; raison?: string; res?: unknown }
  | { t: 'modif'; seq: number; ops: Op[]; par: string; session: string; cseq: number }
  | { t: 'instantane'; seq: number; version: number; projet: Projet; raison: string }
  | { t: 'arrivee'; personne: Personne }
  | { t: 'depart'; personne: string }
  | { t: 'curseur'; personne: string; curseur: Curseur | null }
  | { t: 'chat'; message: MessageChat }
  | { t: 'commentaire'; action: 'ajoute' | 'modifie' | 'supprime'; commentaire: Commentaire | { id: string } }
  | { t: 'verrou'; cible: string; personne: string | null; nom?: string }
  | { t: 'mode'; mode: ModeSalle; par: string }
  | { t: 'lecture'; etat: unknown; par: string; ts: number }
  | { t: 'scene'; message: unknown; par: string; session: string; ts: number }
  /** `de` = session émettrice (posée par le serveur, jamais par le client), `par` = sa personne */
  | { t: 'rtc'; de: string; par: string; vers: string; signal: unknown; ts: number }
  | { t: 'version'; version: number; par: string; message?: string; seq: number }
  | { t: 'pong'; id?: number; ts: number }
  | { t: 'erreur'; code: string; message: string };

export class ErreurProtocole extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

const RE_ID = /^[A-Za-z0-9_-]{6,64}$/;
const RE_COULEUR = /^#[0-9a-fA-F]{6}$/;
const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const entier = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

function texte(v: unknown, max: number, champ: string): string {
  if (typeof v !== 'string') throw new ErreurProtocole('champ-invalide', `${champ} : texte attendu`);
  const s = v.trim();
  if (!s) throw new ErreurProtocole('champ-invalide', `${champ} : vide`);
  if (s.length > max) throw new ErreurProtocole('trop-long', `${champ} : ${max} caractères au plus`);
  return s;
}

function cseq(m: Record<string, unknown>): number {
  if (!entier(m.cseq) || m.cseq === 0) throw new ErreurProtocole('cseq-invalide', 'cseq : entier ≥ 1 attendu');
  return m.cseq;
}

function lireAncre(a: unknown): Ancre {
  if (!estObjet(a)) throw new ErreurProtocole('champ-invalide', 'ancre absente');
  const id = (v: unknown, c: string) => texte(v, 64, c);
  if (a.type === 'etape') return { type: 'etape', moment: id(a.moment, 'ancre.moment'), etape: id(a.etape, 'ancre.etape') };
  if (a.type === 'moment') return { type: 'moment', moment: id(a.moment, 'ancre.moment') };
  if (a.type === 'instant') {
    if (!fini(a.t) || a.t < 0) throw new ErreurProtocole('champ-invalide', 'ancre.t : secondes ≥ 0');
    return a.moment === undefined ? { type: 'instant', t: a.t } : { type: 'instant', t: a.t, moment: id(a.moment, 'ancre.moment') };
  }
  throw new ErreurProtocole('champ-invalide', 'ancre.type : etape | moment | instant');
}

function lireCurseur(c: unknown): Curseur | null {
  if (c === null) return null;
  if (!estObjet(c) || (c.zone !== 'planche' && c.zone !== 'conduite') || !fini(c.x) || !fini(c.y)) {
    throw new ErreurProtocole('champ-invalide', 'curseur : {zone, x, y} attendu');
  }
  const r: Curseur = { zone: c.zone, x: c.x, y: c.y };
  if (typeof c.moment === 'string' && c.moment.length <= 64) r.moment = c.moment;
  if (typeof c.etape === 'string' && c.etape.length <= 64) r.etape = c.etape;
  return r;
}

/** Lit et valide un message client. Lève ErreurProtocole. */
export function lireMessageClient(brut: string | ArrayBuffer): MessageClient {
  if (typeof brut !== 'string') throw new ErreurProtocole('binaire-refuse', 'messages texte JSON seulement');
  if (brut.length > LIMITES_WS.message) throw new ErreurProtocole('trop-gros', `message > ${LIMITES_WS.message} octets`);
  let m: unknown;
  try { m = JSON.parse(brut); } catch { throw new ErreurProtocole('json-invalide', 'JSON illisible'); }
  if (!estObjet(m) || typeof m.t !== 'string') throw new ErreurProtocole('message-invalide', 'champ t manquant');
  switch (m.t) {
    case 'hello': {
      if (m.v !== VERSION_PROTOCOLE && m.v !== VERSION_PROTOCOLE - 1) throw new ErreurProtocole('version', `protocole v${VERSION_PROTOCOLE} attendu`);
      if (typeof m.personne !== 'string' || !RE_ID.test(m.personne)) throw new ErreurProtocole('champ-invalide', 'personne : identifiant [A-Za-z0-9_-]{6,64}');
      if (typeof m.session !== 'string' || !RE_ID.test(m.session)) throw new ErreurProtocole('champ-invalide', 'session : identifiant [A-Za-z0-9_-]{6,64}');
      const r: MessageClient = { t: 'hello', v: m.v, personne: m.personne, session: m.session, nom: texte(m.nom, LIMITES_WS.nom, 'nom') };
      if (m.couleur !== undefined) {
        if (typeof m.couleur !== 'string' || !RE_COULEUR.test(m.couleur)) throw new ErreurProtocole('champ-invalide', 'couleur : #rrggbb');
        r.couleur = m.couleur;
      }
      if (m.role !== undefined) {
        if (!ROLES.includes(m.role as Role)) throw new ErreurProtocole('champ-invalide', 'role : auteur | regie | poste');
        r.role = m.role as Role;
      }
      if (m.seq !== undefined) {
        if (!entier(m.seq)) throw new ErreurProtocole('champ-invalide', 'seq : entier ≥ 0');
        r.seq = m.seq;
      }
      return r;
    }
    case 'curseur': return { t: 'curseur', curseur: lireCurseur(m.curseur) };
    case 'modif': {
      const c = cseq(m);
      if (!entier(m.base)) throw new ErreurProtocole('champ-invalide', 'base : seq connu du client');
      try { return { t: 'modif', cseq: c, base: m.base, ops: validerOps(m.ops) }; } catch (e) {
        if (e instanceof ErreurOp) throw new ErreurProtocole(e.code, e.message);
        throw e;
      }
    }
    case 'chat': return { t: 'chat', cseq: cseq(m), texte: texte(m.texte, LIMITES_WS.chat, 'texte') };
    case 'commentaire': {
      const c = cseq(m);
      if (m.action === 'ajouter') return { t: 'commentaire', cseq: c, action: 'ajouter', ancre: lireAncre(m.ancre), texte: texte(m.texte, LIMITES_WS.commentaire, 'texte') };
      if (m.action === 'resoudre' || m.action === 'rouvrir' || m.action === 'supprimer') {
        return { t: 'commentaire', cseq: c, action: m.action, id: texte(m.id, 64, 'id') };
      }
      throw new ErreurProtocole('champ-invalide', 'action : ajouter | resoudre | rouvrir | supprimer');
    }
    case 'verrou': {
      const c = cseq(m);
      if (m.action !== 'prendre' && m.action !== 'rendre' && m.action !== 'forcer') throw new ErreurProtocole('champ-invalide', 'action : prendre | rendre | forcer');
      if (!cibleValide(m.cible)) throw new ErreurProtocole('champ-invalide', 'cible : projet | lecture | moment:<id> | piste:<id>');
      return { t: 'verrou', cseq: c, action: m.action, cible: m.cible };
    }
    case 'mode': {
      const c = cseq(m);
      if (!MODES.includes(m.mode as ModeSalle)) throw new ErreurProtocole('champ-invalide', 'mode : ecrire | repeter | jouer');
      return { t: 'mode', cseq: c, mode: m.mode as ModeSalle };
    }
    case 'lecture': {
      if (!estObjet(m.etat)) throw new ErreurProtocole('champ-invalide', 'etat : objet EtatLecture attendu');
      return m.cseq === undefined ? { t: 'lecture', etat: m.etat } : { t: 'lecture', cseq: cseq(m), etat: m.etat };
    }
    case 'enregistrer': {
      const c = cseq(m);
      return m.message === undefined ? { t: 'enregistrer', cseq: c } : { t: 'enregistrer', cseq: c, message: texte(m.message, 200, 'message') };
    }
    case 'scene': {
      if (!estObjet(m.message)) throw new ErreurProtocole('champ-invalide', 'message : objet attendu');
      if (JSON.stringify(m.message).length > LIMITES_WS.scene) throw new ErreurProtocole('trop-gros', `message de scène > ${LIMITES_WS.scene} octets`);
      return { t: 'scene', message: m.message };
    }
    case 'rtc': {
      if (m.vers !== '*' && (typeof m.vers !== 'string' || !RE_ID.test(m.vers))) throw new ErreurProtocole('champ-invalide', 'vers : session [A-Za-z0-9_-]{6,64} ou *');
      if (!estObjet(m.signal)) throw new ErreurProtocole('champ-invalide', 'signal : objet attendu');
      if (JSON.stringify(m.signal).length > LIMITES_WS.rtc) throw new ErreurProtocole('trop-gros', `signal WebRTC > ${LIMITES_WS.rtc} octets`);
      return { t: 'rtc', vers: m.vers, signal: m.signal };
    }
    case 'resync': return { t: 'resync' };
    case 'ping': return entier(m.id) ? { t: 'ping', id: m.id } : { t: 'ping' };
    case 'bye': return { t: 'bye' };
    default: throw new ErreurProtocole('type-inconnu', `type « ${m.t} » inconnu`);
  }
}

/** Palette des présences (tons du design : corail, verts, encre tech…). */
export const PALETTE_PRESENCE = ['#e0674a', '#f0b49b', '#2f6b4a', '#b9cfd8', '#d9a441', '#8f7ad6', '#4aa3a1', '#c25a7c'] as const;

/** Couleur stable dérivée de l'identifiant de la personne. */
export function couleurPour(personne: string): string {
  let h = 0;
  for (let i = 0; i < personne.length; i++) h = (h * 31 + personne.charCodeAt(i)) >>> 0;
  return PALETTE_PRESENCE[h % PALETTE_PRESENCE.length]!;
}
