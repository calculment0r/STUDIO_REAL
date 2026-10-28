// Format d'un projet STUDIO_REAL : « studio-real/conducteur@1 ».
// C'est la forme produite par le design (bouton « Exporter JSON » de conception/conducteur), gardée telle quelle
// pour rester compatible ; les noms courts du design sont documentés ici. C'est aussi la forme stockée côté serveur
// (Cloudflare D1 pour `project`, R2 pour les médias d'`assets`).
//
// Vocabulaire du théâtre (jamais « nœud », « FSM », « guard » dans l'interface) :
//   acte → moment (« ev ») → étape (« st », un bloc de la planche) ; sorties (« tr ») entre étapes ; passage (« gate ») entre moments.

export const FORMAT = 'studio-real/conducteur@1' as const;

/** Fichier d'échange complet. */
export interface FichierConducteur {
  format: typeof FORMAT;
  project: Projet;
  assets: CategorieAssets[];
  runs: Execution[];
}

export interface Projet {
  /** Titre affiché (ajout STUDIO_REAL ; absent des exports du design → « Sans titre »). */
  titre?: string;
  acts: Acte[];
  /** Les moments, dans l'ordre de la conduite. */
  ev: Moment[];
  /** Salle simulée (répétition) : les 4 rotatifs qui produisent les signaux de la salle, 0 → 100. */
  sens: SalleSimulee;
  /** Retards mesurés aux passages « go » (id du moment → secondes), remplis pendant une exécution. */
  hold: Record<string, number>;
  /** Tops régie donnés (id du moment → horodatage ms). */
  go: Record<string, number>;
  ver: number;
  /** Prochain identifiant numérique libre (générateur d'id). */
  nid: number;
  tracks: Piste[];
  /** Mémoires de spectacle (bloc « Mémoire ») : nom → valeur. Ajout STUDIO_REAL. */
  memoires?: Record<string, number | string | boolean>;
  /** Séquences réutilisables (bloc « Séquence », 'd:sequence') : sous-déroulés nommés. Ajout STUDIO_REAL. */
  sequences?: Sequence[];
  /** Les acteurs du spectacle : qui reçoit quoi (écran scène, public, téléphones nommés, agents). Ajout STUDIO_REAL
   *  (audit 2026-10, rapport 1 §4.4) ; absent = projet sans acteurs, comme avant. */
  acteurs?: Acteur[];
}

// ── Acteurs et envois (audit 2026-10, rapport 1 §4.4 ; catalogue et calcul des vues : acteurs.ts) ────────────────────

/** Type d'un acteur : fixe ce qu'on peut lui envoyer (catalogue CATALOGUE_ACTEURS). */
export type TypeActeur = 'regie' | 'comedien' | 'public' | 'ecran' | 'telephone' | 'agent';

/** Comment un acteur est rendu : 'sortie' (fenêtre projecteur), 'telephone' (app téléphone, écran par acteur),
 *  'externe' (agent ou machine hors navigateur), 'conducteur' (la régie elle-même). */
export type RenduActeur = 'sortie' | 'telephone' | 'externe' | 'conducteur';

/** Service qui anime un acteur de type 'agent'. */
export type GenreAgent = 'figurants' | 'elevenlabs' | 'asr' | 'osc';

/** Une destination nommée et durable du spectacle. Ajout STUDIO_REAL. */
export interface Acteur {
  /** identifiant court, sans espace ni point : 'public', 'scene', 'ministre', 'franck', 'eco', 'figurants' */
  id: string;
  type: TypeActeur;
  /** nom affiché : « Le public », « Téléphone de la ministre » */
  nom: string;
  rendu: RenduActeur;
  /** nombre attendu : 1 (acteur nommé, adresse d'entrée propre) ou 'n' (foule) */
  cardinalite: 1 | 'n';
  /** agent : quel service l'anime et sa configuration (JAMAIS de clé ni de secret ici) */
  agent?: { genre: GenreAgent; config?: Record<string, unknown> };
  /** écrans qu'il sait afficher (validation des envois) */
  ecrans: string[];
  /** signaux qu'il renvoie, lus par les conditions 'sig:<acteur>.<signal>' et 'sigv:<acteur>.<signal>' */
  signaux: string[];
  /** position sur la planche (bande des acteurs) */
  x?: number;
  y?: number;
}

/** Quand un envoi part : à l'entrée de l'étape (défaut), à sa sortie, ou `apres` secondes après l'entrée. */
export type QuandEnvoi = 'entree' | 'sortie' | { apres: number };

/** Ce qu'une étape envoie à un acteur. Ajout STUDIO_REAL. */
export interface Envoi {
  /** id d'un acteur, ou cible dans la foule : 'public', 'public:ont-vote:A', 'public:aleatoire:3' (voir cibleDansFoule) */
  vers: string;
  /** écran (vue persistante) : 'vote', 'regardez', 'mur', 'noir'… (pris dans Acteur.ecrans) */
  ecran?: string;
  /** effet éphémère : 'vibrer', 'son', 'flash', 'pop'… */
  fx?: string;
  /** réglages de l'écran ou de l'effet ; une valeur texte '$nom' est lue dans les params de l'étape */
  params?: Record<string, unknown>;
  /** défaut 'entree' */
  quand?: QuandEnvoi;
  /** l'écran reste jusqu'à ce qu'un autre envoi au même acteur le remplace (défaut : oui) ; false = écran montré le
   *  temps de l'étape seulement, l'acteur retrouve ensuite le dernier écran tenu */
  tenir?: boolean;
}

/**
 * Séquence réutilisable (etude-10-blocs.md n° 7) : un sous-déroulé nommé (« noir salle + voix off + lumière lente »),
 * instancié par les étapes 'd:sequence' (params.sequence = id ou nom) et modifié à un seul endroit. Ajout STUDIO_REAL.
 * Ses étapes et sorties suivent les règles d'un moment ; une sortie vers '' (ou une étape sans sortie) termine la
 * séquence, et le `nom` de cette sortie choisit la sortie de même nom du bloc appelant (défaut : « fin »).
 */
export interface Sequence {
  id: string;
  nom: string;
  /** Étape d'entrée. */
  entry: string;
  st: Etape[];
  tr: Sortie[];
  /** Sorties déclarées par la séquence, dans l'ordre (défaut ['fin']) : ce sont les sorties du bloc appelant. */
  sorties?: string[];
}

export interface Acte { n: string }

export interface Moment {
  id: string;
  /** Index dans `acts`. */
  act: number;
  name: string;
  /** Étape d'entrée ; ou, si le moment suit une issue de vote, table issue → étape (ex. {A:'jeuA', B:'jeuB'}). */
  entry: string | Record<string, string>;
  st: Etape[];
  /** Sorties, ordonnées : pour une étape source donnée, la première dont les conditions sont remplies gagne ;
   *  une sortie sans condition est le « sinon ». */
  tr: Sortie[];
  /** Passage vers le moment suivant. */
  gate: Passage;
}

export interface Etape {
  id: string;
  name: string;
  /** Type de bloc : étape de base « k:attente », « k:scene »… ou bloc du catalogue « u1 », « b3 », « x2 »… (voir blocs). */
  ty: string;
  /** Colonne (ordre logique gauche → droite) et rangée (0 = axe central, ±1 = branches). */
  c: number;
  r: number;
  /** Décalage manuel de position sur la planche (pixels du monde). */
  dx: number;
  dy: number;
  /** Rotatifs : k[0] = durée prévue codée ((durée_s − 10) / 6) ; k[1], k[2] = réglages du bloc, 0 → 100. */
  k: number[];
  /** Média associé (nom d'un item d'assets). */
  asset?: string;
  /** Réglages propres au bloc au-delà des rotatifs (ajout STUDIO_REAL ; ex. texte d'une question, cible). */
  params?: Record<string, unknown>;
  /** Ce que l'étape envoie aux acteurs (ordre = ordre d'envoi ; voir acteurs.ts). Ajout STUDIO_REAL. */
  envois?: Envoi[];
}

/** Condition élémentaire d'une sortie ou d'un passage. */
export interface Condition {
  /** Signal : 't' durée (s) · 'pres' présents · 'quorum' % de votes · 'prets' % de téléphones prêts ·
   *  'bruit' niveau sonore (dB) · 'assis' % public assis · 'issue' issue du vote ('A'|'B'|'T'…) ·
   *  'mem:<nom>' mémoire de spectacle · 'sig:<nom>' nombre de réceptions d'un signal extérieur depuis l'entrée dans
   *  l'étape (ou le passage) en cours · 'sigv:<nom>' dernière valeur reçue de ce signal (non reçu = 0). */
  k: string;
  op: '≥' | '≤' | '=' | '≠' | '>' | '<';
  v: number | string;
}

export interface Sortie {
  /** Étape source. */
  a: string;
  /** Étape cible ; absente ou '' = fin du moment. */
  b: string;
  g: Condition[];
  /** 'all' : toutes les conditions ; 'any' : au moins une. */
  mode: 'all' | 'any';
  /** Nom affiché de la sortie (ex. « condition remplie », « délai dépassé »). */
  nom?: string;
  /** Poids de la sortie d'un bloc Tirage au sort (défaut 1 ; voir blocs-moteur.ts). Ajout STUDIO_REAL. */
  poids?: number;
}

export interface Passage {
  /** 'auto' : enchaîne dès que les conditions sont remplies ; 'go' : attend le top régie (attente mesurée → « retard »). */
  mode: 'auto' | 'go';
  g: Condition[];
}

export interface SalleSimulee { aff: number; part: number; calme: number; pen: number }

export type TypePiste = 'curve' | 'son' | 'lx' | 'video' | 'tel' | 'txt' | 'notes' | 'secu';

export interface Piste {
  id: string;
  type: TypePiste;
  name: string;
  open: boolean;
  col?: string;
  /** Courbe : source et points par moment (0 → 100). */
  src?: string;
  pts?: Record<string, number>;
  /** Clips posés sur un moment, à un décalage (s), pour une durée (s). */
  clips?: { id: string; name: string; ev: string; off: number; dur: number }[];
  /** Repères (notes, sécurité) : texte, décalage, préavis (s). */
  marks?: { id: string; ev: string; off: number; txt: string; lead?: number }[];
}

export interface CategorieAssets {
  /** 'son' | 'lx' | 'video' | 'img' | 'txt' | 'role' | 'tel' | 'osc' */
  k: string;
  n: string;
  /** [nom, détail, durée_s] */
  items: [string, string, number][];
}

/** Une exécution (répétition ou représentation) : journal horodaté pour rejouer et mesurer. */
export interface Execution {
  id: string;
  debut: number;
  mode: 'repetition' | 'scene';
  evenements: { t: number; type: string; [cle: string]: unknown }[];
}

/** Durée prévue d'une étape en secondes, à partir du rotatif k[0] (convention du design). */
export const dureeEtape = (e: Pick<Etape, 'k'>): number => Math.max(10, (e.k[0] ?? 0) * 6 + 10);
