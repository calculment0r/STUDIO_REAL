// API de l'émulateur de téléphones (audit 2026-10, rapport 2 §4.4). Conforme à l'interface proposée, avec ces
// adaptations imposées par le code réel (voir aussi index.ts) :
// - `OptionsEmulateur.projet` : la salle émulée fait tourner le VRAI noyau du serveur de spectacle, il lui faut le projet ;
// - `horloge` : l'horloge émulée est celle de l'émulateur (Ordonnanceur) ; on choisit son origine (`debut`), et on
//   l'avance avec `avancer(ms)` (tests) ou `tempsReel(vitesse)` (Conducteur, ×1 à ×20) ;
// - `EtatTelephone` s'appelle `EtatTelephoneEmule` (le nom est pris par l'état de la machine de ui-telephone) ;
// - `Capacites` est celle de ui-telephone (avec `cache`) ;
// - `transport: { url }` (essai de charge sur un vrai serveur) est déclaré mais pas encore fait : refusé à la création ;
// - les actions en masse renvoient le nombre (ou la liste) des téléphones touchés.
import type { Projet, SalleSimulee, Signaux } from '@studio-real/modele';
import type { MsgAck, OpConduite, VueDiffusee } from '@studio-real/protocole';
import type { Capacites, Magasin } from '@studio-real/ui-telephone';

export type { Capacites, Plateforme } from '@studio-real/ui-telephone';

export type GenreActeur = 'public' | 'acteur';
export type NomProfil = 'rapide' | 'lent' | 'distrait' | 'deconnecte' | 'iphone-muet' | '4g-salle-pleine';

export interface ProfilSpectateur {
  nom: string;
  /** loi log-normale du délai de réaction (s) */
  reaction: { medianeS: number; dispersion: number };
  /** 0 → 1 : probabilité de répondre à une sollicitation */
  participation: number;
  /** 0 → 1 : part du temps où la page est visible */
  visibilite: number;
  coupures: { parMinute: number; dureeS: [min: number, max: number] };
  rechargementsParMinute: number;
  reseau: { rttMs: number; debitKbps: number; perte: number };
  capacites: Capacites;
  /** 'penchant' = votesSalle(projet.sens) ; sinon des poids par réponse ('A': 60…) */
  vote: 'penchant' | 'hasard' | Record<string, number>;
  textes: 'banque' | 'aucun' | readonly string[];
  /** délai de rendu d'un écran (ms) : entre la réception de la vue et l'accusé d'affichage (ajout) */
  renduMs?: number;
  /** une vidéo annoncée est prête au bout de ce temps (s) (ajout ; « vidéo prête tard » du profil lent) */
  videoPreteS?: number;
}

/** 'groupe:<profil>' : les téléphones d'un profil ; 'joueur:<id>' : un téléphone ; 'sans-reponse' : pas encore
 *  répondu à la question affichée. */
export type Cible = 'tous' | 'sans-reponse' | `groupe:${string}` | `joueur:${string}` | { ids: readonly string[] };

export interface EtatTelephoneEmule {
  id: string;
  pseudo: string;
  genre: GenreActeur;
  /** acteur incarné : 'public', ou 'franck', 'ministre'… */
  acteur: string;
  personne: string;
  profil: string;
  /** la ligne est ouverte et le serveur a dit bienvenue */
  enLigne: boolean;
  /** arrivé dans la salle (sinon : pas encore là) */
  arrive: boolean;
  visible: boolean;
  /** ce qui est AFFICHÉ (null : rien encore) ; `n` = vseq de la vue */
  ecran: { cle: string; n: number; type: string; depuis: number } | null;
  dernierVote?: { question: string; option: number; t: number };
  /** a répondu à la question de l'écran affiché (vote, choix, texte) */
  aRepondu: boolean;
  /** messages en attente d'accusé (hors ligne : file d'envoi) */
  fileEnvoi: number;
  rttMs?: number;
  /** rendu réel dans une iframe de vitrine */
  vitrine: boolean;
  /** vibrations reçues (témoin visuel « bzz » de la vitrine) */
  vibrations: number;
}

export interface TelephoneEmule {
  readonly id: string;
  readonly profil: ProfilSpectateur;
  /** la machine d'état du téléphone (celle de l'iframe pour une vitrine) ; null avant l'arrivée */
  readonly magasin: Magasin | null;
  etat(): EtatTelephoneEmule;
  /** actions « à la main » (mêmes effets qu'un doigt sur l'écran réel) */
  toucher(selecteur: string): void;
  voter(option: string | number): void;
  ecrire(texte: string): void;
  /** incidents */
  couper(dureeS?: number): void;
  recharger(): void;
  masquer(dureeS: number): void;
  /** rendu réel (vitrine) ; absent pour un agent de la foule */
  readonly iframe?: HTMLIFrameElement;
  /** ouvre ce téléphone dans une iframe de vitrine (DOM requis) : l'agent passe la main à la vraie application */
  promouvoir(hote: HTMLElement): HTMLIFrameElement;
}

export interface BilanSalle {
  /** téléphones de la population (arrivés ou non) */
  population: number;
  arrives: number;
  connectes: number;
  horsLigne: number;
  /** écran affiché → nombre (téléphones arrivés ; 'hors-ligne' pour ceux qui ont perdu la ligne) */
  parEcran: Record<string, number>;
  /** votes reçus par le serveur pour la question ouverte : 'A' → nombre */
  votes: Record<string, number>;
  question: string | null;
  textes: number;
  /** latence des accusés d'affichage (réception par le serveur − heure de la vue), sur les 1000 derniers */
  latenceAck: { p50: number; p95: number; partA1s: number; partA2s: number; n: number };
  /** position du lecteur de la salle émulée */
  lecture: { moment: string | null; etape: string | null; attenteGo: boolean; termine: boolean } | null;
  /** temps émulé écoulé depuis la création (ms) */
  t: number;
}

export type EvenementSalle =
  | { type: 'connexion' | 'deconnexion'; id: string; t: number }
  | { type: 'ack'; id: string; n: number; latenceMs: number; t: number }
  | { type: 'entree'; id: string; nature: 'vote' | 'texte' | 'toucher' | 'pret'; valeur: unknown; t: number }
  | { type: 'lecture'; moment: string | null; etape: string | null; t: number }
  | { type: 'resync'; raison: string; t: number };

export interface OptionsEmulateur {
  graine: number;
  /** le projet joué par la salle émulée (préparé comme par le serveur : conversion d'Écho si besoin) */
  projet: Projet;
  /** liste explicite, ou un nombre et un mélange nommé ('soiree', 'rapides', 'difficile', 'iphones') */
  population: { profil: ProfilSpectateur | string; nombre: number }[] | { nombre: number; melange: string };
  /** téléphones de comédiens émulés (franck, ministre) : ils affichent leur écran, sans comportement automatique */
  acteurs?: { acteur: string; id?: string }[];
  /** 'salle' : courbe `pres` de packages/modele/src/salle.ts ; 'toutes' : tout le monde dans les 2 premières s */
  arrivees?: 'salle' | 'toutes' | { surS: number };
  transport?: 'memoire' | { url: string; jeton?: string };
  /** 'aucun' : tests sous Node ; sinon l'adresse de l'application téléphone pour les iframes de vitrine */
  rendu?: { vitrineMax: number; urlTelephone?: string } | 'aucun';
  /** origine de l'horloge émulée (ms) ; défaut : Date.now() */
  horloge?: { debut?: number };
  /** les rotatifs de la salle (aff, part, calme, pen) ; défaut : ceux du projet */
  sens?: SalleSimulee;
  /** comportement automatique des agents (répondre, toucher…) ; défaut vrai. Faux : seules les actions en masse */
  auto?: boolean;
  /** mode du run de la salle émulée ; défaut 'repetition' */
  mode?: 'repetition' | 'scene';
}

export interface RapportRejeu {
  entrees: number;
  /** entrées jouées par un agent ou par la régie émulée */
  rejouees: number;
  /** entrées que la machine du téléphone a refusées (écran différent au moment du rejeu) */
  refusees: number;
  personnes: number;
  /** durée du journal (ms, avant vitesse) */
  dureeMs: number;
}

export interface Emulateur {
  demarrer(): Promise<void>;
  arreter(): Promise<void>;
  telephones(filtre?: Cible): TelephoneEmule[];
  telephone(id: string): TelephoneEmule | undefined;
  ajouter(nombre: number, profil?: string): TelephoneEmule[];
  retirer(ids: readonly string[]): void;
  /** actions en masse (renvoient le nombre de téléphones sollicités) */
  faireVoter(o: { repartition: Record<string, number>; dansS: number; part?: number; cible?: Cible }): number;
  faireEcrire(o: { textes: 'banque' | readonly string[]; parMinute: number; dureeS?: number; part?: number; cible?: Cible }): number;
  faireToucher(o: { selecteur: string; dansS: number; part?: number; cible?: Cible }): number;
  coupure(o: { part: number; dureeS: number; cible?: Cible }): string[];
  recharger(ids: readonly string[]): void;
  masquer(o: { part: number; dureeS: number; cible?: Cible }): string[];
  /** la régie (le Conducteur branché sur l'émulateur) */
  conduite(op: OpConduite): MsgAck;
  /** GO du Conducteur : `top`, et un second `top` si l'étape menait au passage « go » du moment (règle du magasin) */
  go(): void;
  vueDe(acteur: string, personne?: string): VueDiffusee | null;
  /** pour le moteur et l'interface */
  bilan(): BilanSalle;
  signaux(): Signaux;
  surEvenement(fn: (e: EvenementSalle) => void): () => void;
  /** rejeu d'une vraie soirée : les entrées du journal de représentation, rejouées par des agents */
  rejouer(journal: AsyncIterable<unknown> | Iterable<unknown> | string, o?: { vitesse?: number; avancer?: boolean }): Promise<RapportRejeu>;
  /** tests : avance l'horloge émulée et laisse tout s'exécuter */
  avancer(ms: number): Promise<void>;
  /** navigateur : l'horloge émulée suit le temps réel × vitesse (0 : arrêt) */
  tempsReel(vitesse: number): void;
  /** journal de la salle émulée (format JSONL du serveur de spectacle) */
  journal(): string;
  /** heure émulée (ms) */
  maintenant(): number;
}
