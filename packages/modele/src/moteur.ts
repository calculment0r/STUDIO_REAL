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
}

/** Alerte produite pendant la lecture (ajout STUDIO_REAL). */
export interface AlerteLecture {
  t: number;
  moment: string;
  etape?: string;
  type: 'delai' | 'boucle' | 'bloque' | 'force';
  txt: string;
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
}

export interface OptionsLecteur { mode: ModeLecture; graine?: number }

/** Signaux produits par la salle simulée (4 rotatifs) à l'instant t, déterministes pour une graine donnée. */
export type FonctionSignauxSalle = (sens: SalleSimulee, t: number, graine?: number) => Signaux;

export type FabriqueLecteur = (projet: Projet, options: OptionsLecteur) => Lecteur;
