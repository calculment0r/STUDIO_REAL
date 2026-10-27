// Types du catalogue des blocs (chantier BLOCS).
// Vocabulaire du théâtre : une « étape » de la planche est l'instance d'un bloc du catalogue (champ `ty` de l'étape).

/** Couleur déclinée pour les deux thèmes (sombre = défaut, clair = `data-theme="light"`). */
export interface CouleurTheme {
  sombre: string;
  clair: string;
}

export type IdFamille = 'deroule' | 'trig' | 'flow' | 'data' | 'cible' | 'fx' | 'ui' | 'scene' | 'gate';

export interface Famille {
  id: IdFamille;
  /** Nom affiché dans la bibliothèque (« Quand », « Comment »…). */
  nom: string;
  description: string;
  couleur: CouleurTheme;
  /** Tracé SVG (viewBox 0 0 24 24) du glyphe de la famille. */
  icone: string;
  /** Référence du design (FA—01…). */
  ref: string;
}

/** Type d'un port : exécution (flux) ou donnée. */
export type TypePort = 'exec' | 'num' | 'txt' | 'bool' | 'cible' | 'equipe' | 'coul' | 'media';

export interface Port {
  type: TypePort;
  /** Nom affiché ; '' pour le flux principal (« la suite »). */
  nom: string;
}

/**
 * Un réglage = un rotatif de l'étape. La position du rotatif va de 0 à 100 (k[1], k[2]) ;
 * la valeur réelle = min + position/100 × (max − min), ou un choix de la liste `choix`.
 */
export interface Reglage {
  nom: string;
  /** Position par défaut du rotatif, 0 → 100. */
  defaut: number;
  min: number;
  max: number;
  /** Unité affichée, espace comprise (' s', ' %', ' Hz'…), '' si aucune. */
  unite: string;
  /** Nombre de décimales affichées (0 ou 1). */
  decimales: number;
  /** Réglage à positions discrètes : le rotatif est découpé en parts égales (≤ 50 / > 50 pour deux choix,
   *  < 34 / < 67 / reste pour trois…), comme le lit le moteur (`blocs-moteur.ts`). */
  choix?: string[];
  /** Le rotatif en butée (100) vaut « sans fin » (∞) ; sinon valeur entière arrondie. */
  infiniAuMax?: boolean;
  /** Valeur en secondes affichée en MM:SS entiers. */
  temps?: boolean;
}

export interface DefBloc {
  /** Code du bloc, identique au design (« u1 », « k:attente »…) ; c'est `Etape.ty`. */
  ty: string;
  nom: string;
  famille: IdFamille;
  description: string;
  /** Petite étiquette du design (« SG—04 », « 3 CAS »…). */
  cle: string;
  /** Couleur d'accent du bloc (celle de sa famille, ou propre à l'étape de base). */
  couleur: CouleurTheme;
  /** Réglages portés par les rotatifs k[1] et k[2] (au plus deux sont utilisés par la planche). */
  reglages: Reglage[];
  entrees: Port[];
  /** Sorties, ordonnées. Les sorties d'exécution nommées deviennent les sorties de l'étape. */
  sorties: Port[];
  /** Tracé SVG propre au bloc (viewBox 0 0 24 24) ; à défaut, le glyphe de sa famille. */
  icone?: string;
  /** Clé de l'aperçu animé (voir `apercus.ts`). */
  apercu: string;
  /** Étape de base du déroulé (« k:… »). */
  base?: boolean;
  /** Bloc ajouté par l'étude des 10 blocs (absent du design d'origine). */
  nouveau?: boolean;
  /** Comportement en cas de problème (blocs de l'étude). */
  siProbleme?: string;
}

export interface Catalogue {
  familles: Famille[];
  blocs: DefBloc[];
}
