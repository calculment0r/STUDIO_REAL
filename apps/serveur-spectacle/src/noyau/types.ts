// Types du noyau du serveur de spectacle : destinations des messages sortants, état complet (instantané), journal.
// Tout est fait de données JSON : l'instantané est l'état lui-même (copie) ; la restauration le recopie et rejoue les
// entrées du lecteur (le lecteur du modèle est déterministe : même projet + mêmes entrées + même graine = même état).
import type { Projet, Signaux } from '@studio-real/modele';
import type { AppClient, EcranAffiche, MessageServeur, MsgFx, Role, VueDiffusee } from '@studio-real/protocole';

/** À qui envoyer un message : une session, un acteur (toutes ses sessions, ou une personne de la foule), un rôle, tous. */
export type Destination =
  | { session: string }
  | { acteur: string; personne?: string }
  | { role: Role }
  | { tous: true };

/** Message sortant et sa destination (l'hôte — Node ou Durable Object — fait la remise). */
export interface Sortie { a: Destination; m: MessageServeur }

/** Ce que l'hôte sait d'une connexion, pour la remise (voir correspond()). */
export interface InfoSession { session: string; role: Role; acteur?: string; personne?: string }

/** Options du noyau : le projet, et l'horloge et l'aléa INJECTÉS (tests rejouables, hébergement indifférent). */
export interface OptionsRepresentation {
  projet: Projet;
  /** heure serveur en ms */
  horloge: () => number;
  /** tirage uniforme dans [0, 1) */
  alea: () => number;
}

/** Entrée du lecteur, journalisée pour pouvoir le reconstruire à l'identique (restaurer). `x` : répétitions. */
export type EntreeLecteur =
  | { k: 'avancer'; dt: number; s: Signaux; x?: number }
  | { k: 'top' }
  | { k: 'allerA'; moment: string; etape?: string }
  | { k: 'reprendre'; point?: string }
  | { k: 'poser'; nom: string; valeur: number | string | boolean }
  | { k: 'signal'; nom: string; donnees?: unknown }
  | { k: 'retenir'; actif: boolean }
  | { k: 'prolonger'; secondes: number };

export interface Run {
  id: string;
  /** heure serveur du lancement */
  debut: number;
  mode: 'repetition' | 'scene';
  graine: number;
}

/** Une session logique (survit aux reconnexions : même `session` dans le hello). */
export interface SessionEtat {
  role: Role;
  acteur?: string;
  personne?: string;
  /** plus grand cseq reçu */
  cseq: number;
  /** derniers cseq reçus (fenêtre de 64) : un renvoi dans le désordre est reconnu comme doublon */
  cseqs: number[];
  connectee: boolean;
  /** heure serveur de la dernière connexion */
  depuis: number;
  app?: AppClient;
}

/** Une personne d'un acteur (téléphone du public, écran scène, téléphone nommé). Clé : `personne` du hello, sinon la session. */
export interface PersonneSalle {
  /** sessions connectées de cette personne */
  sessions: string[];
  visible: boolean;
  pret: boolean;
  enLigne: boolean;
  /** dernier écran AFFICHÉ (battement `etat` ou accusé) */
  affiche: EcranAffiche | null;
  rttMs?: number;
  /** heure serveur du dernier signe de vie */
  vu: number;
}

/** Vue diffusée d'un flux : un acteur (vue commune) ou une personne (`<acteur>/<personne>`, envois ciblés). */
export interface Flux { empreinte: string; vue: VueDiffusee }

/** Commande envoyée à un agent (`agent.cmd`), avec son accusé. */
export interface CommandeAgent {
  /** numéro unique dans la représentation (ordre d'émission) : l'agent est idempotent sur `n` */
  n: number;
  type: string;
  moment?: string;
  etape: string;
  donnees: Record<string, unknown>;
  /** heure serveur d'émission */
  at: number;
  /** acteur agent destinataire */
  agent: string;
  statut: 'envoye' | 'recu' | 'fait' | 'echec' | 'refus';
  /** d'où vient la commande : commande du lecteur, envoi d'une étape à un acteur agent, ordre de la régie */
  source: 'lecteur' | 'envoi' | 'regie';
  /** numéro de la commande dans le lecteur (EtatLecture.commandes[].n) */
  nLecteur?: number;
  /** signal à donner au lecteur quand l'agent répond « fait » */
  accuse?: string;
}

/** Effet éphémère encore valable (rejoué à la reconnexion tant que `at + ttl` n'est pas passé). */
export interface FxActif { a: Destination; m: MsgFx }

/** Vue imposée par la régie (`conduite{op:'forcer'}`) : vaut jusqu'au prochain envoi du lecteur à cet acteur. */
export interface Forcage {
  /** cible écrite par la régie : 'scene', 'public:ont-vote:A'… */
  cible: string;
  acteur: string;
  ecran: string;
  params: Record<string, unknown>;
  at: number;
  /** nombre d'envois partis vers cet acteur au moment du forçage */
  envois: number;
}

export interface TexteRecu { ts: number; acteur: string; personne: string; q?: string; texte: string }

/** État COMPLET de la représentation : l'instantané est une copie de cet objet. */
export interface EtatRepresentation {
  format: 'studio-real/representation@1';
  /** empreinte du projet préparé (une reprise avec un autre projet est signalée) */
  projet: string;
  run: Run | null;
  /** entrées du lecteur depuis le lancement, dans l'ordre */
  entrees: EntreeLecteur[];
  /** empreinte de l'état de lecture après la dernière entrée (vérifiée à la restauration) */
  lecture: string | null;
  pause: boolean;
  panique: boolean;
  sessions: Record<string, SessionEtat>;
  /** acteur → personne → état */
  salle: Record<string, Record<string, PersonneSalle>>;
  /** question → '<acteur>/<personne>' → index de la réponse */
  votes: Record<string, Record<string, number>>;
  /** question du dernier écran de vote montré à la foule */
  question: string | null;
  /** l'écran de vote est-il montré à la foule en ce moment */
  voteOuvert: boolean;
  /** 200 derniers textes reçus */
  textes: TexteRecu[];
  /** acteur → emoji → nombre */
  reactions: Record<string, Record<string, number>>;
  /** clé de flux → vue diffusée (son `vseq` est le numéro courant du flux) */
  flux: Record<string, Flux>;
  /** clés des envois dont l'effet est déjà parti */
  fxEmis: string[];
  fxActifs: FxActif[];
  /** tirages au sort : clé de l'envoi → personnes tirées */
  tirages: Record<string, string[]>;
  commandes: CommandeAgent[];
  /** commandes du lecteur déjà routées */
  nLecteur: number;
  forcages: Forcage[];
  /** signaux passés au lecteur la dernière fois */
  signaux: Signaux | null;
  /** dernier résumé de salle envoyé à la régie */
  salleEnvoyee: { ts: number; empreinte: string };
  /** moment / étape / phase de la dernière lecture journalisée */
  position: string;
  /** dernier top de la régie (heure serveur) */
  dernierTop: number | null;
  /** agent → dernière statistique reçue (agent.in k='stat') */
  agents: Record<string, { ts: number; stat?: Record<string, unknown> }>;
}

/** Types d'événements du journal (un fichier JSONL par représentation, écrit par l'hôte). */
export type TypeEvenement =
  | 'demarrage' | 'lancer' | 'reprise' | 'connexion' | 'deconnexion' | 'refus' | 'conduite' | 'forcer' | 'panique'
  | 'entree' | 'vue' | 'fx' | 'agent.cmd' | 'agent.ack' | 'agent.in' | 'lecture' | 'alerte';

/** Événement du journal, horodaté à l'heure serveur ; `src` = qui l'a produit. Aucune adresse IP, aucun jeton. */
export interface EvenementJournal {
  ts: number;
  run: string | null;
  src: 'serveur';
  type: TypeEvenement;
  [detail: string]: unknown;
}
