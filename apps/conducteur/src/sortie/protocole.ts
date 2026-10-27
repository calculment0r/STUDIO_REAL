// Protocole régie → sortie écran scène (chantier SORTIE SCÈNE). Logique PURE : types, constructeurs, validation.
//
// La régie (le Conducteur) pilote une fenêtre « sortie » glissée sur le projecteur. Deux transports portent les
// mêmes messages :
//   - même machine : BroadcastChannel(NOM_CANAL) (src/sortie/canal.ts) ;
//   - autre machine : la salle du serveur (apps/serveur, message `lecture`), voir src/sortie/salle.ts.
//
// Messages régie → sortie (MessageRegie) : chacun porte `heure` = Date.now() de la régie à l'envoi (synchro des
// comptes à rebours, voir horloge.ts) et `v` = VERSION_SORTIE.
//   etat       état de scène (moment, étape, phase, compteur, attente du top) — ≤ 4 par seconde
//   scene      la scène à montrer (noir, QR d'accueil, streamer, vote, chrono, titre, média) + durée du fondu
//   evenement  un événement du public (pop de chat, réaction, cœurs, voix, résultats, fusée, alerte, gabarit)
//   config     titre du spectacle, adresse d'entrée du public, consigne, code de représentation
//   precharger vidéos annoncées (assets) : la sortie les met en mémoire avant la bascule
//   heure      battement (1 par seconde) : témoin de connexion et synchro
// Messages sortie → régie (MessageSortie) :
//   bonjour    la sortie s'ouvre (ou se reconnecte) : la régie renvoie config + scène + état
//   present    battement (1 par seconde) avec la scène montrée, l'état du flux, du secours et des médias
//   fin-video  une vidéo jouée « une seule fois » est finie (la régie peut en faire un signal 'video.fin')
//   au-revoir  la fenêtre se ferme

export const VERSION_SORTIE = 1;
/** Nom du BroadcastChannel (même origine, même navigateur). */
export const NOM_CANAL = 'studio-real-sortie';
/** Nom fixe de la fenêtre de sortie : window.open le réutilise. */
export const NOM_FENETRE = 'studio-real-sortie-scene';
/** Battement des deux côtés (ms) ; au-delà de PERTE_MS sans nouvelles, la liaison est tenue pour perdue. */
export const BATTEMENT_MS = 1000;
export const PERTE_MS = 3500;

export type TypeScene = 'noir' | 'accueil-qr' | 'streamer' | 'vote' | 'chrono' | 'titre' | 'image' | 'video';
export const TYPES_SCENE: readonly TypeScene[] = ['noir', 'accueil-qr', 'streamer', 'vote', 'chrono', 'titre', 'image', 'video'];
/** Fondu enchaîné entre deux scènes : 0 → 2 s. */
export const FONDU_MAX_MS = 2000;
export const FONDU_DEFAUT_MS = 600;
export const borneFondu = (ms: unknown): number => (typeof ms === 'number' && Number.isFinite(ms) ? Math.max(0, Math.min(FONDU_MAX_MS, Math.round(ms))) : FONDU_DEFAUT_MS);
/** Cadrage d'une vidéo : 'contain' (tout voir, bandes noires) · 'cover' (remplir, rogner) · 'auto' (selon le format). */
export type Cadrage = 'contain' | 'cover' | 'auto';

/** Gabarit des effets du calque de réactions (doc 06 §3 : « un gabarit par séquence »). */
export type Gabarit = 'calme' | 'chat' | 'folie' | 'vote' | 'entracte';
export const GABARITS: readonly Gabarit[] = ['calme', 'chat', 'folie', 'vote', 'entracte'];

export interface OptionVote { cle: string; libelle: string }

export type Scene =
  | { type: 'noir' }
  | { type: 'accueil-qr'; adresse: string; titre: string; consigne: string; code?: string }
  | {
      type: 'streamer'; gabarit?: Gabarit; bandeau?: string;
      /** asset vidéo joué si le flux du streamer tombe (défaut : ConfigSortie.secours) */
      secours?: string;
    }
  | {
      type: 'vote'; question: string; options: OptionVote[];
      /** ouvert : on vote · decompte : roulement · revele : le gagnant est montré */
      phase: 'ouvert' | 'decompte' | 'revele';
      /** voix ou % par option (clé → nombre) */
      resultats?: Record<string, number>;
      gagnant?: string;
    }
  | { type: 'chrono'; duree: number; titre?: string }
  | { type: 'titre'; titre: string; surtitre?: string; sousTitre?: string }
  | { type: 'image'; asset: string; legende?: string }
  | {
      /** vidéo précalculée lue EN LOCAL sur la machine du projecteur (dossier médias, voir medias.ts) */
      type: 'video'; asset: string;
      /** en boucle (défaut) ou une seule fois, puis signal « fin-video » vers la régie (dernière image tenue) */
      boucle?: boolean;
      /** son de la vidéo (défaut : muet) */
      son?: boolean;
      cadrage?: Cadrage;
      legende?: string;
    };

/** Compte à rebours vivant (chrono, vote) : la sortie l'extrapole entre deux messages. */
export interface Compteur {
  /** secondes restantes à l'heure du message */
  restant: number;
  duree: number;
  /** la lecture avance (sinon le compteur est figé) */
  enCours: boolean;
  /** vitesse de lecture (1 = temps réel) */
  vitesse: number;
}

/** État de scène : ce que la sortie sait du déroulé (témoin, compteurs). */
export interface EtatScene {
  moment: string | null;
  momentNom?: string;
  etape: string | null;
  etapeNom?: string;
  phase: 'etape' | 'passage' | 'fin' | 'arret';
  /** temps de lecture (s) */
  t: number;
  tEtape: number;
  attenteGo: boolean;
  enLecture: boolean;
  compteur?: Compteur;
}

export type EvenementScene =
  | { type: 'pop'; auteur: string; texte: string; emoji?: string; style?: 'pop' | 'danmaku' | 'vedette' }
  | { type: 'reaction'; emoji: string; n?: number }
  | { type: 'coeurs'; n: number }
  | { type: 'fusee'; emoji: string }
  | { type: 'vote'; option: string; n?: number }
  | { type: 'resultats'; votes: Record<string, number>; gagnant?: string }
  | { type: 'alerte'; texte: string; niveau?: 'info' | 'alerte' }
  | { type: 'gabarit'; gabarit: Gabarit };

export interface ConfigSortie {
  /** titre du spectacle (QR d'accueil) */
  titre: string;
  /** adresse d'entrée du public (sans le code) */
  adresse: string;
  consigne: string;
  /** code de la représentation, ajouté en ?r= à l'adresse */
  code?: string;
  /** vidéo de secours (asset) jouée si le flux du streamer tombe */
  secours?: string;
  /** salle d'où recevoir le flux WebRTC du streamer (src/flux) ; posée par la régie connectée à une salle */
  flux?: { serveur: string; projet: string; jeton: string };
}

/** Ce que la sortie dit d'elle-même dans son battement. */
export interface EtatSortie {
  /** flux du streamer : direct (WebRTC), test (webcam / mire), aucun */
  flux: 'direct' | 'test' | 'aucun';
  /** la vidéo de secours remplace un flux tombé */
  secours: boolean;
  /** d'où viennent les vidéos locales */
  medias: 'dossier' | 'fichiers' | 'dev' | 'aucun';
  pleinEcran: boolean;
}

export type MessageRegie =
  | { t: 'etat'; v: number; heure: number; etat: EtatScene }
  | { t: 'scene'; v: number; heure: number; scene: Scene; n: number; fondu: number }
  | { t: 'evenement'; v: number; heure: number; evenement: EvenementScene }
  | { t: 'config'; v: number; heure: number; config: ConfigSortie }
  | { t: 'precharger'; v: number; heure: number; assets: string[] }
  | { t: 'heure'; v: number; heure: number };

export type MessageSortie =
  | { t: 'bonjour'; v: number; id: string; heure: number }
  | { t: 'present'; v: number; id: string; heure: number; scene: TypeScene | null; n: number; etat?: EtatSortie }
  | { t: 'fin-video'; v: number; id: string; heure: number; asset: string; n: number }
  | { t: 'au-revoir'; v: number; id: string };

// ── adresse et configuration ─────────────────────────────────────────────────────────────────────────────────────

/** Adresse publique des pages spectateur (docs/04 §1) ; VITE_ADRESSE_PUBLIC la remplace au build. */
export const ADRESSE_PUBLIC_DEFAUT = 'https://calculment0r.github.io/STUDIO_REAL/';
export const CONSIGNE_DEFAUT = 'Scannez pour entrer';

export function configParDefaut(titre?: string): ConfigSortie {
  let adresse = ADRESSE_PUBLIC_DEFAUT;
  try {
    const v = (import.meta.env?.VITE_ADRESSE_PUBLIC as string | undefined)?.trim();
    if (v) adresse = v;
  } catch { /* hors Vite */ }
  return { titre: titre?.trim() || 'Studio Real', adresse, consigne: CONSIGNE_DEFAUT };
}

/** Adresse complète encodée dans le QR : l'adresse + ?r=<code> (code de la représentation) s'il y en a un. */
export function adresseEntree(c: Pick<ConfigSortie, 'adresse' | 'code'>): string {
  const base = c.adresse.trim();
  const code = c.code?.trim();
  if (!code) return base;
  try {
    const u = new URL(base);
    u.searchParams.set('r', code);
    return u.toString();
  } catch {
    return base + (base.includes('?') ? '&' : '?') + 'r=' + encodeURIComponent(code);
  }
}

/** Adresse lisible sous le QR (sans « https:// » ni « / » final). */
export const adresseLisible = (a: string): string => a.replace(/^https?:\/\//, '').replace(/\/$/, '');

// ── constructeurs ────────────────────────────────────────────────────────────────────────────────────────────────

export const msgEtat = (etat: EtatScene, heure = Date.now()): MessageRegie => ({ t: 'etat', v: VERSION_SORTIE, heure, etat });
export const msgScene = (scene: Scene, n: number, fondu = FONDU_DEFAUT_MS, heure = Date.now()): MessageRegie =>
  ({ t: 'scene', v: VERSION_SORTIE, heure, scene, n, fondu: borneFondu(fondu) });
export const msgPrecharger = (assets: string[], heure = Date.now()): MessageRegie => ({ t: 'precharger', v: VERSION_SORTIE, heure, assets });
export const msgEvenement = (evenement: EvenementScene, heure = Date.now()): MessageRegie =>
  ({ t: 'evenement', v: VERSION_SORTIE, heure, evenement });
export const msgConfig = (config: ConfigSortie, heure = Date.now()): MessageRegie => ({ t: 'config', v: VERSION_SORTIE, heure, config });
export const msgHeure = (heure = Date.now()): MessageRegie => ({ t: 'heure', v: VERSION_SORTIE, heure });

/** Clé d'identité d'une scène : deux scènes de même clé ne déclenchent pas de fondu. */
export const cleScene = (s: Scene): string => JSON.stringify(s);

// ── validation (tout ce qui arrive d'un canal est une donnée non sûre) ─────────────────────────────────────────

const estObjet = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const estTexte = (x: unknown, max = 400): x is string => typeof x === 'string' && x.length <= max;
const estNombre = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const texteOpt = (x: unknown, max = 400) => x === undefined || estTexte(x, max);

function recordNombres(x: unknown): x is Record<string, number> {
  return estObjet(x) && Object.keys(x).length <= 26 && Object.values(x).every(estNombre);
}

export function sceneValide(x: unknown): x is Scene {
  if (!estObjet(x) || !TYPES_SCENE.includes(x.type as TypeScene)) return false;
  switch (x.type as TypeScene) {
    case 'noir': return true;
    case 'accueil-qr': return estTexte(x.adresse, 1000) && estTexte(x.titre) && estTexte(x.consigne) && texteOpt(x.code, 40);
    case 'streamer': return (x.gabarit === undefined || GABARITS.includes(x.gabarit as Gabarit)) && texteOpt(x.bandeau) && texteOpt(x.secours);
    case 'vote':
      return estTexte(x.question) && Array.isArray(x.options) && x.options.length <= 8
        && x.options.every((o) => estObjet(o) && estTexte(o.cle, 20) && estTexte(o.libelle, 200))
        && ['ouvert', 'decompte', 'revele'].includes(x.phase as string)
        && (x.resultats === undefined || recordNombres(x.resultats)) && texteOpt(x.gagnant, 20);
    case 'chrono': return estNombre(x.duree) && texteOpt(x.titre);
    case 'titre': return estTexte(x.titre, 600) && texteOpt(x.surtitre) && texteOpt(x.sousTitre, 600);
    case 'image': return estTexte(x.asset) && x.asset.length > 0 && texteOpt(x.legende);
    case 'video':
      return estTexte(x.asset) && x.asset.length > 0 && texteOpt(x.legende)
        && (x.boucle === undefined || typeof x.boucle === 'boolean') && (x.son === undefined || typeof x.son === 'boolean')
        && (x.cadrage === undefined || ['contain', 'cover', 'auto'].includes(x.cadrage as string));
  }
}

function etatValide(x: unknown): x is EtatScene {
  if (!estObjet(x)) return false;
  const c = x.compteur;
  return (x.moment === null || estTexte(x.moment, 200)) && (x.etape === null || estTexte(x.etape, 200))
    && ['etape', 'passage', 'fin', 'arret'].includes(x.phase as string)
    && estNombre(x.t) && estNombre(x.tEtape) && typeof x.attenteGo === 'boolean' && typeof x.enLecture === 'boolean'
    && (c === undefined || (estObjet(c) && estNombre(c.restant) && estNombre(c.duree) && typeof c.enCours === 'boolean' && estNombre(c.vitesse)));
}

const TYPES_EVENEMENT = ['pop', 'reaction', 'coeurs', 'fusee', 'vote', 'resultats', 'alerte', 'gabarit'];

function evenementValide(x: unknown): x is EvenementScene {
  if (!estObjet(x) || !TYPES_EVENEMENT.includes(x.type as string)) return false;
  switch (x.type) {
    case 'pop': return estTexte(x.auteur, 60) && estTexte(x.texte, 200) && texteOpt(x.emoji, 16)
      && (x.style === undefined || ['pop', 'danmaku', 'vedette'].includes(x.style as string));
    case 'reaction': return estTexte(x.emoji, 16) && (x.n === undefined || estNombre(x.n));
    case 'coeurs': return estNombre(x.n);
    case 'fusee': return estTexte(x.emoji, 16);
    case 'vote': return estTexte(x.option, 20) && (x.n === undefined || estNombre(x.n));
    case 'resultats': return recordNombres(x.votes) && texteOpt(x.gagnant, 20);
    case 'alerte': return estTexte(x.texte) && (x.niveau === undefined || x.niveau === 'info' || x.niveau === 'alerte');
    case 'gabarit': return GABARITS.includes(x.gabarit as Gabarit);
  }
  return false;
}

function configValide(x: unknown): x is ConfigSortie {
  if (!estObjet(x)) return false;
  const f = x.flux;
  return estTexte(x.titre) && estTexte(x.adresse, 1000) && estTexte(x.consigne) && texteOpt(x.code, 40) && texteOpt(x.secours)
    && (f === undefined || (estObjet(f) && estTexte(f.serveur, 500) && estTexte(f.projet, 100) && estTexte(f.jeton, 200)));
}

/** Message régie reçu par la sortie, validé ; null si invalide ou d'une autre version. */
export function lireMessageRegie(x: unknown): MessageRegie | null {
  if (!estObjet(x) || x.v !== VERSION_SORTIE || !estNombre(x.heure)) return null;
  switch (x.t) {
    case 'etat': return etatValide(x.etat) ? (x as unknown as MessageRegie) : null;
    case 'scene':
      return sceneValide(x.scene) && estNombre(x.n) && estNombre(x.fondu)
        ? ({ ...(x as unknown as Extract<MessageRegie, { t: 'scene' }>), fondu: borneFondu(x.fondu) }) : null;
    case 'precharger':
      return Array.isArray(x.assets) && x.assets.length <= 8 && x.assets.every((a) => estTexte(a) && a.length > 0) ? (x as unknown as MessageRegie) : null;
    case 'evenement': return evenementValide(x.evenement) ? (x as unknown as MessageRegie) : null;
    case 'config': return configValide(x.config) ? (x as unknown as MessageRegie) : null;
    case 'heure': return x as unknown as MessageRegie;
  }
  return null;
}

/** Message sortie reçu par la régie, validé ; null sinon. */
export function lireMessageSortie(x: unknown): MessageSortie | null {
  if (!estObjet(x) || x.v !== VERSION_SORTIE || !estTexte(x.id, 80)) return null;
  switch (x.t) {
    case 'bonjour': return estNombre(x.heure) ? (x as unknown as MessageSortie) : null;
    case 'present':
      return estNombre(x.heure) && estNombre(x.n) && (x.scene === null || TYPES_SCENE.includes(x.scene as TypeScene))
        ? (x as unknown as MessageSortie) : null;
    case 'fin-video': return estNombre(x.heure) && estTexte(x.asset) && estNombre(x.n) ? (x as unknown as MessageSortie) : null;
    case 'au-revoir': return x as unknown as MessageSortie;
  }
  return null;
}
