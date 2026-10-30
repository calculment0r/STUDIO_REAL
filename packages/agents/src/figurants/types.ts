// Types des figurants : fiches des personas (normalisées), banques, état de la mise en scène, sortie vers le serveur.

export type NomDensite = 'silence' | 'calme' | 'normal' | 'chaud' | 'folie';
export type NomFournisseur = 'auto' | 'ollama' | 'anthropic' | 'banque';
export type Niveau = 'N0' | 'N1' | 'N2' | 'N3';

export interface Voix {
  longueur: [number, number];
  casse: 'CRIS' | 'minuscules' | 'normale';
  cris: number;
  fautes: number;
  fautes_typiques: [string, string][];
  /** probabilité de GARDER les accents */
  accents: number;
  point_final: number;
  repetition_lettres: number;
  abreviations: Record<string, string>;
  emojis: string[];
  emojis_par_msg: number;
  emotes: string[];
  tics: string[];
  tic_proba: number;
  exemples: string[];
}

export interface Persona {
  id: string;
  pseudo: string;
  /** jeton de couleur du thème (`--coral-2`…), jamais une valeur */
  couleur: string;
  type: 'recurrent' | 'silhouette';
  archetype: string;
  bio: string;
  registre: string;
  sujets: unknown[];
  regles: string[];
  presence: string[] | null;
  faits: string[];
  actif: boolean;
  humeur_base: unknown;
  reagit: Record<Niveau, number>;
  voix: Voix;
  rythme: { reaction_s: [number, number]; frappe_cps: number; activite: number; rafale: number };
}

export interface Declencheur {
  id: string;
  motifs: RegExp[];
  priorite: string;
  nb: [number, number];
  delai_s: [number, number];
  stylisable: boolean;
  segments_exclus: string[];
  variantes: string[];
  par_humeur: Record<string, string[]>;
}

export interface HumeurBanque {
  variantes: string[];
  emotes: string[];
  centre: { valence: number; energie: number } | null;
  stylisable: boolean;
}

export interface Vague {
  id: string;
  cle: string;
  taille: [number, number];
  etalement_s: [number, number];
  copie_exacte: boolean;
  ordonnee: boolean;
  stylisable: boolean;
  variantes: string[];
}

export interface Reflexes {
  humeurs: Record<string, HumeurBanque>;
  declencheurs: Declencheur[];
  vagues: Vague[];
  relance: string[];
}

export type TypeReplique = 'debut' | 'fin' | 'libre' | 'relance' | 'mot' | 'top';

export interface Replique {
  id: string;
  quand: string;
  type: TypeReplique;
  motif: RegExp | null;
  top: string | null;
  persona: string | null;
  texte: string;
  ordre: number;
}

export interface Segment {
  titre: string;
  ordre: number;
  consigne: string;
  faits: string[];
  interdits: string[];
  humeur: Record<string, unknown> | null;
  densite: string | null;
  repliques: Replique[];
}

export interface SegmentCourant extends Segment { id: string }

export interface Banques {
  personas: Persona[];
  reflexes: Reflexes;
  segments: Record<string, Segment>;
  fiction: Record<string, unknown> | null;
  prompts: Record<string, string>;
  /** sujets à ne pas révéler, par segment (spoilers), déjà normalisés */
  interditsSegment: Record<string, string[]>;
  /** d'où chaque fichier a été lu (journal de démarrage) */
  sources: Record<string, string>;
  premierSegment(): string;
}

export interface Humeur { valence: number; energie: number; etiquettes: string[] }

/** L'état que la régie pilote (commandes `figurants.cmd`). */
export interface EtatFigurants {
  segment: string;
  densite: NomDensite;
  humeur: Humeur;
  coupe: boolean;
  fournisseur: NomFournisseur;
}

/** Une réplique prête à partir vers le chat. */
export interface ItemReplique {
  persona: Persona;
  texte: string;
  origine: string;
  ref?: string | null;
  fournisseur?: string;
  ambiance?: boolean;
  vague?: boolean;
  regie?: boolean;
  version?: string;
  brut?: string;
  t?: Record<string, number | undefined>;
}

/** Ce que l'orchestrateur demande à son hôte (l'agent branché sur le serveur de spectacle, ou un faux dans les tests). */
export interface Hote {
  /** émet la réplique ; renvoie faux si elle est refusée avant l'envoi */
  diffuserChat(item: ItemReplique): boolean;
  /** la régie doit décider d'une réplique (souffleur avec validation) */
  versRegie(msg: { type: 'attente'; id: string; pid: string; pseudo: string; texte: string; origine: string }): void;
  /** ligne lisible pour le journal de la régie */
  journalRegie(ligne: string): void;
  /** répliques de figurants émises ou en file sur la dernière minute (débit réel) */
  debit(): number;
  /** derniers messages du vrai public, pseudonymisés (le serveur ne les transmet pas encore : vide) */
  chatHumainsRecents(n: number): string[];
}
