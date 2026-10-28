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
//   recharger  la sortie se recharge (location.reload) ; lu QUELLE QUE SOIT la version, pour rattraper une sortie périmée
// Messages sortie → régie (MessageSortie) :
//   bonjour    la sortie s'ouvre (ou se reconnecte) : la régie renvoie config + scène + état
//   present    battement (1 par seconde) avec la scène montrée (type, et la scène complète `vue`), l'état du flux, du
//              secours et des médias (dont la vidéo introuvable : etat.absent) et la régie dont la scène est montrée
//   fin-video  une vidéo jouée « une seule fois » est finie (la régie peut en faire un signal 'video.fin')
//   refus      la sortie n'a pas su lire un message de régie (autre version, scène inconnue) : elle le dit au lieu de
//              l'ignorer, et affiche une carte « Scène inconnue » si c'était une scène qu'elle ne peut pas montrer
//   au-revoir  la fenêtre se ferme
//
// VERSIONS : `bonjour` et `present` portent `version` (VERSION_SORTIE) et `build` (empreinte du code, __BUILD__) et la
// régie les lit QUELLE QUE SOIT leur version : elle repère ainsi une sortie périmée (fenêtre restée ouverte sur un
// ancien code) et propose de la recharger. Tout changement du protocole (nouveau type de scène, nouveau champ requis)
// DOIT incrémenter VERSION_SORTIE (v2 : scène « page », refus, recharger, present.vue).
//
// PLUSIEURS RÉGIES (Conducteur, moniteur du flux, autre machine par la salle) pilotent la même sortie : chaque scène
// porte `source` (identifiant de la régie) et `depuis` (heure de la DÉCISION, horloge de la régie ; un renvoi garde
// celle d'origine). La sortie garde la décision la plus récente (arbitrage.ts) — la dernière commande gagne — sans
// dépendre des numéros `n` (propres à chaque régie) ni de l'accord des horloges : l'âge de la décision
// (heure - depuis, même horloge) est retranché de l'heure d'arrivée locale. La sortie écoute TOUJOURS le canal local,
// plus la salle si son adresse en donne une ; un message arrivé par les deux chemins n'est traité qu'une fois.

export const VERSION_SORTIE = 2;
/** Empreinte du code (hash git court ou date ISO du build, posée par Vite : define __BUILD__) ; 'dev' à défaut. */
export const BUILD_SORTIE: string = typeof __BUILD__ === 'string' && __BUILD__ ? __BUILD__ : 'dev';
/** Nom du BroadcastChannel (même origine, même navigateur). */
export const NOM_CANAL = 'studio-real-sortie';
/** Nom fixe de la fenêtre de sortie : window.open le réutilise. */
export const NOM_FENETRE = 'studio-real-sortie-scene';
/** Battement des deux côtés (ms) ; au-delà de PERTE_MS sans nouvelles, la liaison est tenue pour perdue. */
export const BATTEMENT_MS = 1000;
export const PERTE_MS = 3500;

export type TypeScene = 'noir' | 'accueil-qr' | 'streamer' | 'vote' | 'chrono' | 'titre' | 'image' | 'video' | 'page';
export const TYPES_SCENE: readonly TypeScene[] = ['noir', 'accueil-qr', 'streamer', 'vote', 'chrono', 'titre', 'image', 'video', 'page'];
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
  /** une page web en plein écran (spectacle du soir : le mur du serveur, la visio) */
  | { type: 'page'; url: string }
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
  /** vidéo (ou image) demandée mais introuvable dans les médias de la sortie */
  absent?: string;
}

export type MessageRegie =
  | { t: 'etat'; v: number; heure: number; etat: EtatScene }
  | { t: 'scene'; v: number; heure: number; scene: Scene; n: number; fondu: number; source?: string; depuis?: number }
  | { t: 'evenement'; v: number; heure: number; evenement: EvenementScene }
  | { t: 'config'; v: number; heure: number; config: ConfigSortie }
  | { t: 'precharger'; v: number; heure: number; assets: string[] }
  | { t: 'heure'; v: number; heure: number }
  | { t: 'recharger'; v: number; heure: number };

/** Pourquoi la sortie refuse un message : autre version du protocole, ou forme / scène qu'elle ne connaît pas. */
export type RaisonRefus = 'version' | 'invalide';

export type MessageSortie =
  | { t: 'bonjour'; v: number; id: string; heure: number; version?: number; build?: string }
  | {
      t: 'present'; v: number; id: string; heure: number; scene: TypeScene | null; n: number; etat?: EtatSortie; source?: string;
      version?: number; build?: string;
      /** la scène montrée, telle que reçue (null : aucune, ou carte de refus) ; absente avant la version 2 */
      vue?: Scene | null;
    }
  | { t: 'fin-video'; v: number; id: string; heure: number; asset: string; n: number }
  | {
      t: 'refus'; v: number; id: string; heure: number; raison: RaisonRefus; version: number;
      /** ce qui a été reçu, en clair (« scene:cinema », « heure v3 ») */
      recu?: string;
      /** version et régie du message refusé (une régie ne retient que les refus qui la concernent) */
      versionRecue?: number; source?: string;
    }
  | { t: 'au-revoir'; v: number; id: string };

/** Types des messages ÉMIS par une sortie : une sortie qui les reçoit (autre fenêtre de sortie) les ignore. */
const TYPES_MESSAGE_SORTIE = ['bonjour', 'present', 'fin-video', 'refus', 'au-revoir'];

// ── adresse et configuration ─────────────────────────────────────────────────────────────────────────────────────

/** Adresse publique des pages spectateur (docs/04 §1) ; VITE_ADRESSE_PUBLIC la remplace au build. */
// Spectacle du 27/10 : le serveur du soir, par le tunnel public (les spectateurs sont en 4G/5G)
export const ADRESSE_PUBLIC_DEFAUT = 'https://highway-regions-temperatures-penn.trycloudflare.com/echo';
export const CONSIGNE_DEFAUT = 'Scannez pour entrer';

export function configParDefaut(titre?: string): ConfigSortie {
  let adresse = ADRESSE_PUBLIC_DEFAUT;
  try {
    const v = (import.meta.env?.VITE_ADRESSE_PUBLIC as string | undefined)?.trim();
    if (v) adresse = v;
  } catch { /* hors Vite */ }
  // `?adresse=https://…` dans l'adresse de la page (régie ou sortie) : remplace l'adresse du QR et reste retenue dans ce
  // navigateur (le tunnel du soir change d'adresse à chaque lancement) ; `?adresse=defaut` revient à la valeur livrée
  try {
    const CLE = 'studio-real:adresse-public';
    const q = new URLSearchParams(location.search).get('adresse')?.trim();
    if (q === 'defaut') localStorage.removeItem(CLE);
    else if (q && /^https?:\/\//i.test(q)) localStorage.setItem(CLE, q);
    const retenue = localStorage.getItem(CLE);
    // une adresse du réseau local est injoignable en 4G/5G : on l'oublie
    if (retenue && /^https?:\/\/(192\.168\.|10\.|127\.|localhost)/i.test(retenue)) localStorage.removeItem(CLE);
    else if (retenue) adresse = retenue;
  } catch { /* hors navigateur, stockage indisponible */ }
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
export const msgScene = (scene: Scene, n: number, fondu = FONDU_DEFAUT_MS, heure = Date.now(), o: { source?: string; depuis?: number } = {}): MessageRegie =>
  ({ t: 'scene', v: VERSION_SORTIE, heure, scene, n, fondu: borneFondu(fondu), ...(o.source ? { source: o.source } : {}), ...(o.depuis !== undefined ? { depuis: o.depuis } : {}) });
export const msgPrecharger = (assets: string[], heure = Date.now()): MessageRegie => ({ t: 'precharger', v: VERSION_SORTIE, heure, assets });
export const msgEvenement = (evenement: EvenementScene, heure = Date.now()): MessageRegie =>
  ({ t: 'evenement', v: VERSION_SORTIE, heure, evenement });
export const msgConfig = (config: ConfigSortie, heure = Date.now()): MessageRegie => ({ t: 'config', v: VERSION_SORTIE, heure, config });
export const msgHeure = (heure = Date.now()): MessageRegie => ({ t: 'heure', v: VERSION_SORTIE, heure });
export const msgRecharger = (heure = Date.now()): MessageRegie => ({ t: 'recharger', v: VERSION_SORTIE, heure });

/** Messages de la sortie qui l'annoncent : version du protocole et build du code toujours joints. */
export const msgBonjour = (id: string, heure = Date.now()): MessageSortie =>
  ({ t: 'bonjour', v: VERSION_SORTIE, version: VERSION_SORTIE, build: BUILD_SORTIE, id, heure });
export const msgPresent = (
  o: { id: string; vue: Scene | null; n: number; etat?: EtatSortie; source?: string }, heure = Date.now(),
): MessageSortie => ({
  t: 'present', v: VERSION_SORTIE, version: VERSION_SORTIE, build: BUILD_SORTIE, id: o.id, heure,
  scene: o.vue ? o.vue.type : null, vue: o.vue, n: o.n, ...(o.etat ? { etat: o.etat } : {}), ...(o.source ? { source: o.source } : {}),
});

/** Clé d'identité d'une scène : deux scènes de même clé ne déclenchent pas de fondu. */
export const cleScene = (s: Scene): string => JSON.stringify(s);

// ── validation (tout ce qui arrive d'un canal est une donnée non sûre) ─────────────────────────────────────────

/** Identifiant d'une régie (source d'une scène). */
export const RE_SOURCE = /^[A-Za-z0-9_-]{1,80}$/;
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
    case 'page': return estTexte(x.url, 1000) && /^https?:\/\//.test(x.url);
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

/** Message régie reçu par la sortie, validé ; null si invalide ou d'une autre version (sauf `recharger`, lu toujours). */
export function lireMessageRegie(x: unknown): MessageRegie | null {
  if (estObjet(x) && x.t === 'recharger' && estNombre(x.heure)) return { t: 'recharger', v: estNombre(x.v) ? x.v : VERSION_SORTIE, heure: x.heure };
  if (!estObjet(x) || x.v !== VERSION_SORTIE || !estNombre(x.heure)) return null;
  switch (x.t) {
    case 'etat': return etatValide(x.etat) ? (x as unknown as MessageRegie) : null;
    case 'scene':
      return sceneValide(x.scene) && estNombre(x.n) && estNombre(x.fondu)
        && (x.source === undefined || (typeof x.source === 'string' && RE_SOURCE.test(x.source))) && (x.depuis === undefined || estNombre(x.depuis))
        ?({ ...(x as unknown as Extract<MessageRegie, { t: 'scene' }>), fondu: borneFondu(x.fondu) }) : null;
    case 'precharger':
      return Array.isArray(x.assets) && x.assets.length <= 8 && x.assets.every((a) => estTexte(a) && a.length > 0) ? (x as unknown as MessageRegie) : null;
    case 'evenement': return evenementValide(x.evenement) ? (x as unknown as MessageRegie) : null;
    case 'config': return configValide(x.config) ? (x as unknown as MessageRegie) : null;
    case 'heure': return x as unknown as MessageRegie;
  }
  return null;
}

/** Verdict de la sortie sur un message reçu : à traiter, à refuser (en le disant), ou à ignorer (pas pour elle). */
export type ExamenMessageRegie =
  | { message: MessageRegie }
  | {
      refus: {
        raison: RaisonRefus; recu: string; versionRecue?: number; source?: string;
        /** type de la scène refusée (message `scene`) */
        typeScene?: string;
        /** la sortie ne peut pas montrer la scène demandée : carte « Scène inconnue » à la place de l'ancienne scène.
         *  Pas pour un message d'une régie PLUS ANCIENNE (c'est elle qu'il faut recharger : la scène en cours reste). */
        carte: boolean;
      };
    }
  | null;

/** Texte reçu rendu inoffensif et court (lettres, chiffres, _ . : -). */
const lisible = (x: unknown, max = 40): string => (typeof x === 'string' ? x.replace(/[^\p{L}\p{N}_.:-]/gu, '').slice(0, max) || '?' : '?');

/**
 * Examine un message reçu par la sortie. Un message d'une autre fenêtre de sortie (bonjour, present…) ou qui n'est
 * pas un objet est ignoré (null) ; un message de régie illisible n'est PLUS ignoré en silence : il donne un refus.
 */
export function examinerMessageRegie(x: unknown): ExamenMessageRegie {
  if (!estObjet(x) || TYPES_MESSAGE_SORTIE.includes(x.t as string)) return null;
  const m = lireMessageRegie(x);
  if (m) return { message: m };
  const t = lisible(x.t, 20);
  const typeScene = x.t === 'scene' ? (estObjet(x.scene) ? lisible(x.scene.type) : '?') : undefined;
  const versionRecue = estNombre(x.v) ? x.v : undefined;
  const source = typeof x.source === 'string' && RE_SOURCE.test(x.source) ? x.source : undefined;
  const raison: RaisonRefus = versionRecue !== undefined && versionRecue !== VERSION_SORTIE ? 'version' : 'invalide';
  const recu = (typeScene ? `${t}:${typeScene}` : t) + (raison === 'version' ? ` v${versionRecue}` : '');
  const carte = x.t === 'scene' && (raison === 'invalide' || (versionRecue ?? 0) > VERSION_SORTIE);
  return {
    refus: {
      raison, recu, carte,
      ...(versionRecue !== undefined ? { versionRecue } : {}), ...(source ? { source } : {}), ...(typeScene ? { typeScene } : {}),
    },
  };
}

/** Message sortie reçu par la régie, validé ; null sinon. `bonjour`, `present`, `refus` et `au-revoir` sont lus
 *  QUELLE QUE SOIT leur version (repérer une sortie périmée) ; une `vue` invalide est retirée (pas le message). */
export function lireMessageSortie(x: unknown): MessageSortie | null {
  if (!estObjet(x) || !estNombre(x.v) || !estTexte(x.id, 80)) return null;
  const versionOk = (x.version === undefined || estNombre(x.version)) && (x.build === undefined || estTexte(x.build, 80));
  switch (x.t) {
    case 'bonjour': return estNombre(x.heure) && versionOk ? (x as unknown as MessageSortie) : null;
    case 'present': {
      if (!(estNombre(x.heure) && estNombre(x.n) && versionOk && (x.scene === null || TYPES_SCENE.includes(x.scene as TypeScene)))) return null;
      if (x.vue === undefined || x.vue === null || sceneValide(x.vue)) return x as unknown as MessageSortie;
      const { vue: _vue, ...reste } = x;
      void _vue;
      return reste as unknown as MessageSortie;
    }
    case 'refus':
      return estNombre(x.heure) && (x.raison === 'version' || x.raison === 'invalide') && estNombre(x.version) && texteOpt(x.recu, 80)
        && (x.versionRecue === undefined || estNombre(x.versionRecue)) && (x.source === undefined || (typeof x.source === 'string' && RE_SOURCE.test(x.source)))
        ? (x as unknown as MessageSortie) : null;
    case 'au-revoir': return x as unknown as MessageSortie;
  }
  // le reste suit la version exacte
  if (x.v !== VERSION_SORTIE) return null;
  if (x.t === 'fin-video') return estNombre(x.heure) && estTexte(x.asset) && estNombre(x.n) ? (x as unknown as MessageSortie) : null;
  return null;
}
