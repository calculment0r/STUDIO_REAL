// CONTRAT du moteur de lecture (à implémenter par le chantier « modèle » ; l'interface code contre ces signatures).
// Le moteur est PUR et DÉTERMINISTE : même projet + mêmes signaux + même graine = même déroulé (rejouable, testable).
import type { Projet, SalleSimulee } from './types';

/** Signaux de la salle à un instant (réels en représentation, simulés en répétition). */
export interface Signaux {
  /** nombre de présents */ pres: number;
  /** % de votes reçus */ quorum: number;
  /** % de téléphones prêts */ prets: number;
  /** niveau sonore (dB) */ bruit: number;
  /** % du public assis */ assis: number;
  /** issue du dernier vote ('A' | 'B' | 'T' …) */ issue?: string;
  /** répartition du dernier vote (issue → % ou nombre de voix) ; sert au tirage parmi les ex æquo (ajout STUDIO_REAL) */
  votes?: Record<string, number>;
}

export type ModeLecture = 'repetition' | 'scene';

export interface EtatLecture {
  /** temps écoulé depuis le début (s, entier pour l'affichage MM:SS) */ t: number;
  moment: string | null;
  etape: string | null;
  /** temps passé dans l'étape courante (s) */ tEtape: number;
  /** le passage du moment courant attend le top régie */ attenteGo: boolean;
  /** cumul des attentes aux passages « go » (s) */ retard: number;
  /** l'étape a dépassé sa durée prévue sans qu'aucune sortie ne soit remplie */ bloque: boolean;
  termine: boolean;
  /** issue choisie au dernier vote (sert à l'entrée des moments suivants) */ issue?: string;
  memoires: Record<string, number | string | boolean>;
  /** parcours effectué : [moment, étape, t d'entrée] */ parcours: [string, string, number][];
  // Ajouts STUDIO_REAL (facultatifs, remplis par creerLecteur) :
  /** 'etape' : une étape joue · 'passage' : entre deux moments (etape = null, tEtape = temps dans le passage) · 'fin' */
  phase?: 'etape' | 'passage' | 'fin';
  /** attente mesurée à chaque passage « go » (id du moment → s), pour les hachures de la conduite (= Projet.hold) */
  attentes?: Record<string, number>;
  /** alertes à reporter dans la piste Sécurité (garde-fou échu, boucle bornée, étape bloquée…) */
  alertes?: AlerteLecture[];
  /** tours faits par les boucles du moment courant (id de l'étape → nombre d'entrées) */
  tours?: Record<string, number>;
  /** journal des événements venus de l'extérieur (signaux, mémoires posées), des reprises et des étapes jouées dans
   *  une séquence ; `parcours` garde, lui, les seules étapes des moments [moment, étape, t] */
  journal?: EvenementLecture[];
  /** commandes émises vers l'extérieur, numérotées (la régie relaie celles qu'elle n'a pas encore vues) */
  commandes?: CommandeLecture[];
  /** points de reprise passés (le plus récent en dernier), pour le bouton « REPRENDRE ICI » du pupitre */
  reprises?: PointReprise[];
  /** étape jouée à l'intérieur d'une séquence réutilisable (etape = l'étape 'd:sequence' du moment) */
  sequence?: PositionSequence;
  /** répartition du dernier vote retenue (avec `issue`) */
  votes?: Record<string, number>;
  /** réceptions de chaque signal depuis l'entrée dans l'étape (ou le passage) en cours (nom normalisé → nombre) */
  receptions?: Record<string, number>;
  /** l'étape (ou le passage) en cours est tenue : seul le top régie la termine (ajout barre de scène) */
  retenu?: boolean;
  /** secondes ajoutées à la durée minimale de l'étape en cours, cumulées ; remis à 0 à l'entrée d'une étape */
  prolonge?: number;
}

/** Alerte produite pendant la lecture (ajout STUDIO_REAL). */
export interface AlerteLecture {
  t: number;
  moment: string;
  etape?: string;
  type: 'delai' | 'boucle' | 'bloque' | 'force' | 'signal' | 'machine' | 'message' | 'sequence' | 'reprise';
  txt: string;
}

/** Événement du journal de lecture (ajout STUDIO_REAL). */
export interface EvenementLecture {
  t: number;
  /** 'signal' reçu · 'memoire' posée de l'extérieur · 'mot' entendu (Quand le comédien dit) · 'reprise' · 'sous-etape'
   *  (étape jouée dans une séquence) */
  type: 'signal' | 'memoire' | 'mot' | 'reprise' | 'sous-etape' | 'retenir' | 'prolonger';
  nom: string;
  valeur?: unknown;
  moment: string;
  etape?: string;
}

/** Types des commandes émises par le lecteur (ajout STUDIO_REAL). */
export type TypeCommande = 'machine' | 'message' | 'chrono' | 'chrono.10s' | 'figurants.cmd' | 'reprise';

/** Commande émise vers l'extérieur : la régie la relaie (console, QLab, téléphones, service figurants…) et renvoie
 *  l'accusé éventuel par `Lecteur.signal(donnees.accuse)`. */
export interface CommandeLecture {
  /** numéro d'ordre (1, 2, 3…) */
  n: number;
  t: number;
  type: TypeCommande;
  moment: string;
  etape?: string;
  donnees: Record<string, unknown>;
}

/** Point de reprise passé (bloc 'p:reprise'). */
export interface PointReprise {
  nom: string;
  /** temps de lecture au dernier passage */
  t: number;
  moment: string;
  etape: string;
  /** ce qui est restauré : 'tout' | 'memoires' | 'plateau' | 'ecrans' */
  restaure: 'tout' | 'memoires' | 'plateau' | 'ecrans';
  memoires: Record<string, number | string | boolean>;
  issue?: string;
}

/** Position dans une séquence réutilisable (ajout STUDIO_REAL). */
export interface PositionSequence {
  /** id de la séquence la plus profonde en cours */
  id: string;
  nom: string;
  /** étape de la séquence en cours et temps passé dedans (s) */
  etape: string;
  tEtape: number;
  /** fil d'Ariane : noms des séquences imbriquées, de la plus externe à la plus profonde */
  chemin: string[];
}

export interface Lecteur {
  etat(): EtatLecture;
  /** Fait avancer le temps de dt secondes avec les signaux du moment ; renvoie le nouvel état. */
  avancer(dt: number, signaux: Signaux): EtatLecture;
  /** Top régie : franchit le passage « go » en attente (ou force la sortie de l'étape courante). */
  top(): EtatLecture;
  /** Saute à un moment (et éventuellement une étape), état des mémoires conservé. */
  allerA(moment: string, etape?: string): EtatLecture;
  /** Repart du début. */
  reinitialiser(): EtatLecture;
  // Ajouts STUDIO_REAL : entrées venues de l'extérieur pendant une représentation (journalisées dans `journal`).
  /** Pose une mémoire de spectacle (ex. 'missions' ← validation des superviseurs), lisible par 'mem:<nom>'. */
  poser(nom: string, valeur: number | string | boolean): EtatLecture;
  /** Signal extérieur reçu : OSC, MIDI, touche clavier, GPIO, accusé d'une machine ('accuse:<étape>'), accusé de
   *  lecture d'un message ('lu:<étape>'), transcription du comédien ('transcription', donnees = texte)… Lisible par
   *  'sig:<nom>' (réceptions dans l'étape) et 'sigv:<nom>' (dernière valeur : donnees, ou donnees.valeur). */
  signal(nom: string, donnees?: unknown): EtatLecture;
  /** Reprend au point de reprise `nom` (ou au dernier passé) avec l'état mémorisé ; point jamais passé → le
   *  précédent (alerte « reprise »). */
  reprendre(nomPoint?: string): EtatLecture;
  // Ajouts barre de scène : gestes de la régie sur l'étape en cours (journalisés dans `journal`).
  /** Tient (true) ou relâche (false) l'étape en cours : tenue, elle ne se termine ni par le temps ni par un signal
   *  (les signaux restent comptés) ; seul `top()` en sort, ce qui lève aussi la retenue. */
  retenir(actif: boolean): EtatLecture;
  /** Ajoute `secondes` à la durée minimale de l'étape en cours (cumulable ; sans effet si le spectacle est terminé). */
  prolonger(secondes: number): EtatLecture;
}

export interface OptionsLecteur { mode: ModeLecture; graine?: number }

/** Signaux produits par la salle simulée (4 rotatifs) à l'instant t, déterministes pour une graine donnée. */
export type FonctionSignauxSalle = (sens: SalleSimulee, t: number, graine?: number) => Signaux;

export type FabriqueLecteur = (projet: Projet, options: OptionsLecteur) => Lecteur;
