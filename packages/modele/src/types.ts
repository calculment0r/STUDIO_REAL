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
}

/** Condition élémentaire d'une sortie ou d'un passage. */
export interface Condition {
  /** Signal : 't' durée (s) · 'pres' présents · 'quorum' % de votes · 'prets' % de téléphones prêts ·
   *  'bruit' niveau sonore (dB) · 'assis' % public assis · 'issue' issue du vote ('A'|'B'|'T'…) ·
   *  'mem:<nom>' mémoire de spectacle. */
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
