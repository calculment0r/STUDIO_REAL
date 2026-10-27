// Blocs à comportement moteur (les 10 blocs de etude-10-blocs.md, plus les blocs figurants de docs/etudes/figurants-ia.md §8.4).
// Le moteur de lecture (lecteur.ts) et le calcul des positions prévues (temps.ts) reconnaissent ces codes `ty` ;
// le chantier BLOCS les reprend pour l'affichage (famille, réglages, sorties nommées, aperçu).
//
// Convention commune : k[0] reste la durée prévue (dureeEtape) ; k[1] et k[2] sont les deux rotatifs du bloc
// (0 → 100) ; `params` (facultatif) permet de fixer une valeur exacte qui l'emporte sur le rotatif.
//
// ┌──────────────┬──────────┬───────────────────────────────┬──────────────────────────────────────────────────────┐
// │ ty           │ famille  │ sorties (dans l'ordre)        │ réglages                                              │
// ├──────────────┼──────────┼───────────────────────────────┼──────────────────────────────────────────────────────┤
// │ 'g:garde'    │ flow     │ « condition remplie »         │ k[1] délai max 00:05 → 10:00 (params.delai, s)        │
// │ Garde-fou    │ (Comment)│ « délai dépassé » (sinon)     │ k[2] à l'échéance : ≤ 50 continuer, > 50 demander le  │
// │ de temps     │          │                               │      top (params.echeance 'continuer' | 'top')        │
// ├──────────────┼──────────┼───────────────────────────────┼──────────────────────────────────────────────────────┤
// │ 'm:memoire'  │ data     │ 1 sortie (normale)            │ k[1] opération : < 34 poser, < 67 ajouter, sinon      │
// │ Mémoire      │ (Combien)│                               │      remettre à zéro (params.op 'poser'|'ajouter'|    │
// │              │          │                               │      'zero') · k[2] valeur (params.valeur) ;          │
// │              │          │                               │      nom : params.nom, sinon le nom de l'étape        │
// ├──────────────┼──────────┼───────────────────────────────┼──────────────────────────────────────────────────────┤
// │ 'f:tirage'   │ flow     │ 2 à 6 sorties pondérées       │ k[1] nombre de sorties (indicatif) · poids : champ    │
// │ Tirage au    │ (Comment)│ (Sortie.poids, défaut 1)      │      `poids` de chaque sortie ; graine fixe en        │
// │ sort         │          │                               │      répétition, aléa vrai en scène (sans graine)     │
// ├──────────────┼──────────┼───────────────────────────────┼──────────────────────────────────────────────────────┤
// │ 'f:boucle'   │ flow     │ « encore » (retour au début   │ k[1] nombre de tours : 1 → 20, 100 = ∞               │
// │ Boucle       │ (Comment)│ de la boucle) · « terminé »   │      (params.tours, 0 = ∞) ; condition d'arrêt :      │
// │              │          │                               │      conditions de la sortie « terminé » ; borne 50   │
// └──────────────┴──────────┴───────────────────────────────┴──────────────────────────────────────────────────────┘
//
// Comportements :
// - Garde-fou : après la durée prévue, la première sortie « condition remplie » dont les conditions sont remplies
//   gagne ; sinon, au délai max (au moins la durée prévue), sortie « délai dépassé » et alerte Sécurité. Si l'échéance
//   est réglée sur « demander le top », le lecteur attend le top régie (attenteGo, retard cumulé) puis prend
//   « délai dépassé ». Un garde-fou n'est jamais « bloqué ».
// - Mémoire : l'opération s'applique à l'entrée dans l'étape. Une mémoire non définie vaut 0 / non, jamais une erreur.
//   Les conditions la lisent par 'mem:<nom>'.
// - Tirage : le tirage a lieu à l'entrée dans l'étape (PRNG déterministe) ; la sortie tirée est prise à la fin de la
//   durée prévue. Poids tous à 0 → sortie 1.
// - Boucle : chaque entrée dans le bloc compte un tour. Après la durée prévue : si le nombre de tours est atteint (ou
//   la borne dure de 50, avec alerte Sécurité) → « terminé » ; sinon si la sortie « terminé » a des conditions
//   remplies → « terminé » ; sinon « encore ». Le compteur repart à zéro à la sortie « terminé » et à l'entrée du moment.
//
// Sorties reconnues par leur `nom` (casse et accents ignorés) ; à défaut : garde-fou → la sortie sans condition est
// « délai dépassé » ; boucle → 1re sortie « encore », 2e « terminé ».
//
// Tirage parmi les ex æquo (params.exaequo = true) : seules les sorties dont l'issue (condition « issue = X » de la
// sortie, sinon A, B, C… dans l'ordre) est ex æquo au dernier vote gardent leur poids. Ex æquo = issue retenue si elle
// n'est pas 'T' ; sinon les issues à ECART_EXAEQUO points (params.ecart) ou moins de la meilleure (Signaux.votes) ;
// répartition inconnue → toutes les sorties.
//
// Blocs à événements extérieurs (signaux reçus par Lecteur.signal(), commandes émises dans EtatLecture.commandes).
// Codes, sorties et rotatifs ; un choix à N positions découpe le rotatif en N parts égales (indexChoix) :
// ┌───────────────────┬──────────┬──────────────────────────────┬──────────────────────────────────────────────────────┐
// │ 'q:signal'        │ trig     │ « reçu »                     │ k[1] source OSC / MIDI / clavier / GPIO · k[2] reçu N │
// │ Écoute d'un signal│ (Quand)  │                              │ fois 1 → 20 · signal attendu : params.signal, sinon   │
// │                   │          │                              │ params.adresse, sinon l'id de l'étape (params.fois)   │
// │ 's:machine'       │ scene    │ « confirmé » · « sans        │ k[1] cible console LX / QLab / vidéo / sono · k[2]    │
// │ Commande machine  │          │ réponse »                    │ attente de l'accusé 0,5 → 10 s (params.delai) ;       │
// │                   │          │                              │ params.commande ; accusé : params.accuse ou           │
// │                   │          │                              │ 'accuse:<id de l'étape>'                              │
// │ 'c:message'       │ cible    │ « lu » · « non lu »          │ k[1] destinataire · k[2] délai avant « non lu » 5 →   │
// │ Message à une     │ (Qui)    │                              │ 120 s ; params.texte, params.destinataire ; accusé de │
// │ personne          │          │                              │ lecture : params.accuse ou 'lu:<id de l'étape>'        │
// │ 'u:chrono'        │ ui       │ « zéro » · « 10 s restantes »│ k[1] durée 5 → 120 s (params.duree) · k[2] affichage  │
// │ Chrono visible    │          │ (facultative)                │ téléphones / écran de scène / les deux                │
// │ 'p:reprise'       │ gate     │ 1 sortie (passage direct)    │ k[1] ce qui est restauré : tout / mémoires / état     │
// │ Point de reprise  │          │                              │ plateau / écrans publics · nom : params.nom ou nom    │
// │ 'd:sequence'      │ deroule  │ celles de la séquence        │ k[1] durée globale 50 → 200 % · k[2] intensité ;      │
// │ Séquence          │          │ (défaut « fin »)             │ params.sequence = id ou nom (Projet.sequences)        │
// │ 'x:figurants'     │ scene    │ « fini »                     │ k[1] densité silence / calme / normal / chaud / folie │
// │ Figurants         │          │                              │ · k[2] humeur ; params.intention (souffleur),         │
// │                   │          │                              │ params.personas, params.validation                    │
// │ 'q:comedien-dit'  │ trig     │ « dit » · « pas dit »        │ k[1] écoute au plus 00:05 → 10:00 · k[2] mot entier / │
// │ Quand le comédien │          │ (facultative ; une sortie    │ approchant ; params.mots (liste ou texte séparé par   │
// │ dit               │          │ nommée d'après un mot-clé    │ des virgules) ; signal lu : params.source ou          │
// │                   │          │ l'emporte pour ce mot)       │ 'transcription'                                       │
// └───────────────────┴──────────┴──────────────────────────────┴──────────────────────────────────────────────────────┘
// - Signal : sort par « reçu » dès N réceptions depuis l'entrée (sans attendre la durée prévue) ; sinon reste en
//   attente, « bloqué » (alerte « signal ») après la durée prévue ; le top régie vaut le signal.
// - Machine : émet la commande 'machine' à l'entrée ; « confirmé » dès l'accusé ; sans accusé au délai → « sans
//   réponse » (à défaut « confirmé ») et alerte Sécurité « … ne répond pas » ; le top régie prend « sans réponse ».
// - Message : émet 'message' ; « lu » dès l'accusé de lecture ; au délai → « non lu » + alerte « … n'a pas lu la
//   consigne » ; le top prend « non lu ».
// - Chrono : émet 'chrono' (durée, affichage, fin) ; à 10 s de la fin émet 'chrono.10s' et, si la sortie « 10 s
//   restantes » existe, la prend (le compte à rebours continue chez le public) ; sinon « zéro » à la fin.
// - Reprise : ne dure pas ; mémorise un instantané (mémoires, issue, position) restaurable par Lecteur.reprendre().
// - Séquence : joue le sous-déroulé (toutes les règles des étapes s'appliquent dedans, durées × durée globale),
//   puis sort par la sortie de même nom que la fin de séquence ; séquence introuvable → sortie directe + alerte.
// - Figurants : émet 'figurants.cmd' { densite, humeur, dire? } (la régie relaie au service figurants), puis se
//   comporte comme une étape ordinaire (« fini » à la fin de la durée prévue).
// - Quand le comédien dit : écoute le signal de transcription ; un mot-clé entendu → sa sortie nommée, sinon « dit »
//   (sans attendre la durée prévue) ; au délai → « pas dit » si elle existe, sinon reste en attente (« bloqué »).
import type { Etape, Sequence, Sortie } from './types';
import { dureeEtape } from './types';

export const TY_GARDE = 'g:garde';
export const TY_MEMOIRE = 'm:memoire';
export const TY_TIRAGE = 'f:tirage';
export const TY_BOUCLE = 'f:boucle';
export const TY_SIGNAL = 'q:signal';
export const TY_MACHINE = 's:machine';
export const TY_MESSAGE = 'c:message';
export const TY_CHRONO = 'u:chrono';
export const TY_REPRISE = 'p:reprise';
export const TY_SEQUENCE = 'd:sequence';
export const TY_FIGURANTS = 'x:figurants';
export const TY_COMEDIEN_DIT = 'q:comedien-dit';

/** Bloc du catalogue du design dont le comportement moteur est celui du tirage (« aléatoire pondéré »). */
export const ALIAS_TIRAGE: readonly string[] = ['f3'];

/** Types d'étapes de vote / décompte : à leur sortie, le lecteur retient l'issue du vote (sert aux entrées par issue). */
export const TYPES_VOTE: readonly string[] = ['u1', 'b3', 'd1'];

/** Borne dure du nombre de tours d'une boucle, même réglée sur ∞. */
export const BORNE_BOUCLE = 50;

/** Noms des sorties nommées. */
export const SORTIES_NOMMEES = {
  conditionRemplie: 'condition remplie',
  delaiDepasse: 'délai dépassé',
  encore: 'encore',
  termine: 'terminé',
  recu: 'reçu',
  confirme: 'confirmé',
  sansReponse: 'sans réponse',
  lu: 'lu',
  nonLu: 'non lu',
  zero: 'zéro',
  dixSecondes: '10 s restantes',
  fin: 'fin',
  fini: 'fini',
  dit: 'dit',
  pasDit: 'pas dit',
} as const;

export type ComportementBloc =
  | 'garde' | 'memoire' | 'tirage' | 'boucle' | 'signal' | 'machine' | 'message' | 'chrono' | 'reprise' | 'sequence'
  | 'figurants' | 'comedien' | 'normal';

export interface DescriptionBlocMoteur {
  ty: string;
  nom: string;
  /** Famille du catalogue (clé de GRP dans conducteur-core.js, plus 'deroule'). */
  famille: 'flow' | 'data' | 'trig' | 'scene' | 'cible' | 'ui' | 'gate' | 'deroule';
  comportement: Exclude<ComportementBloc, 'normal'>;
  /** Sorties nommées dans l'ordre (vide = sorties libres). */
  sorties: string[];
  /** Libellés des rotatifs k[1], k[2] (un seul si le bloc n'a qu'un réglage). */
  reglages: string[];
  description: string;
}

// ── Choix des rotatifs (repris tels quels par le catalogue des blocs) ──────────────────────────────────────────────
export const SOURCES_SIGNAL = ['OSC', 'MIDI', 'clavier', 'GPIO'] as const;
export const CIBLES_MACHINE = ['console LX', 'QLab', 'vidéo', 'sono'] as const;
/** Commande envoyée par défaut à chaque cible (params.commande l'emporte). */
export const COMMANDES_MACHINE = ['/lx/cue/12 GO', '/qlab/cue/12 GO', '/video/play 3', '/sono/volume -6'] as const;
export const DESTINATAIRES_MESSAGE = ['Milo · streamer', 'Superviseur', 'régie plateau', 'comédien'] as const;
export const AFFICHAGES_CHRONO = ['téléphones', 'écran de scène', 'les deux'] as const;
export const RESTAURATIONS_REPRISE = ['tout', 'mémoires', 'état plateau', 'écrans publics'] as const;
export const DENSITES_FIGURANTS = ['silence', 'calme', 'normal', 'chaud', 'folie'] as const;
export const HUMEURS_FIGURANTS = ['neutre', 'enthousiaste', 'moqueuse', 'inquiète', 'méfiante'] as const;
export const RECONNAISSANCES_MOT = ['mot entier', 'approchant'] as const;
/** Écart (points de vote) en dessous duquel deux issues sont ex æquo (règle de la salle simulée : ≤ 4 points). */
export const ECART_EXAEQUO = 4;
/** Profondeur maximale des séquences imbriquées. */
export const PROFONDEUR_SEQUENCES = 8;

/** Index du choix désigné par un rotatif 0 → 100 découpé en n parts égales (bornes incluses à gauche) :
 *  2 choix → ≤ 50 / > 50 ; 3 choix → < 34 / < 67 / reste… (même lecture que le catalogue des blocs). */
export function indexChoix(n: number, position: number): number {
  return Math.max(0, Math.min(n - 1, Math.ceil(Math.max(0, Math.min(100, position)) / 100 * n - 1e-9) - 1));
}

export const BLOCS_MOTEUR: Record<string, DescriptionBlocMoteur> = {
  [TY_GARDE]: {
    ty: TY_GARDE, nom: 'garde-fou de temps', famille: 'flow', comportement: 'garde',
    sorties: [SORTIES_NOMMEES.conditionRemplie, SORTIES_NOMMEES.delaiDepasse],
    reglages: ['délai max', 'à l’échéance'],
    description: 'Une sortie de secours datée : si la condition n’est pas remplie à temps, on passe par « délai dépassé ».',
  },
  [TY_MEMOIRE]: {
    ty: TY_MEMOIRE, nom: 'mémoire', famille: 'data', comportement: 'memoire',
    sorties: [],
    reglages: ['opération', 'valeur'],
    description: 'Pose, ajoute ou remet à zéro une mémoire de spectacle, lisible par toutes les conditions.',
  },
  [TY_TIRAGE]: {
    ty: TY_TIRAGE, nom: 'tirage au sort', famille: 'flow', comportement: 'tirage',
    sorties: [],
    reglages: ['sorties', 'mode'],
    description: 'Choisit une sortie selon ses poids : rejouable en répétition, vraiment aléatoire en scène.',
  },
  [TY_BOUCLE]: {
    ty: TY_BOUCLE, nom: 'boucle', famille: 'flow', comportement: 'boucle',
    sorties: [SORTIES_NOMMEES.encore, SORTIES_NOMMEES.termine],
    reglages: ['tours', 'arrêt'],
    description: 'Rejoue une suite d’étapes un nombre de fois donné ou jusqu’à une condition (50 tours au plus).',
  },
  [TY_SIGNAL]: {
    ty: TY_SIGNAL, nom: 'écoute d’un signal', famille: 'trig', comportement: 'signal',
    sorties: [SORTIES_NOMMEES.recu],
    reglages: ['source', 'reçu N fois'],
    description: 'Attend un signal extérieur (OSC, MIDI, clavier, GPIO) reçu N fois, puis passe par « reçu ».',
  },
  [TY_MACHINE]: {
    ty: TY_MACHINE, nom: 'commande machine', famille: 'scene', comportement: 'machine',
    sorties: [SORTIES_NOMMEES.confirme, SORTIES_NOMMEES.sansReponse],
    reglages: ['cible', 'attente accusé'],
    description: 'Envoie une commande à une machine et attend son accusé : « confirmé » ou « sans réponse ».',
  },
  [TY_MESSAGE]: {
    ty: TY_MESSAGE, nom: 'message à une personne', famille: 'cible', comportement: 'message',
    sorties: [SORTIES_NOMMEES.lu, SORTIES_NOMMEES.nonLu],
    reglages: ['destinataire', 'délai non lu'],
    description: 'Envoie une consigne à un rôle précis et attend l’accusé de lecture : « lu » ou « non lu ».',
  },
  [TY_CHRONO]: {
    ty: TY_CHRONO, nom: 'chrono visible', famille: 'ui', comportement: 'chrono',
    sorties: [SORTIES_NOMMEES.zero, SORTIES_NOMMEES.dixSecondes],
    reglages: ['durée', 'affichage'],
    description: 'Compte à rebours montré au public ; sortie « zéro », et « 10 s restantes » si elle est branchée.',
  },
  [TY_REPRISE]: {
    ty: TY_REPRISE, nom: 'point de reprise', famille: 'gate', comportement: 'reprise',
    sorties: [],
    reglages: ['restaure'],
    description: 'Mémorise un état sûr (mémoires, position) d’où reprendre le spectacle ; ne dure pas.',
  },
  [TY_SEQUENCE]: {
    ty: TY_SEQUENCE, nom: 'séquence réutilisable', famille: 'deroule', comportement: 'sequence',
    sorties: [SORTIES_NOMMEES.fin],
    reglages: ['durée globale', 'intensité'],
    description: 'Joue un sous-déroulé nommé (Projet.sequences), modifié à un seul endroit.',
  },
  [TY_FIGURANTS]: {
    ty: TY_FIGURANTS, nom: 'figurants', famille: 'scene', comportement: 'figurants',
    sorties: [SORTIES_NOMMEES.fini],
    reglages: ['densité', 'humeur'],
    description: 'Règle la densité et l’humeur des figurants du chat, et souffle une intention (commande figurants.cmd).',
  },
  [TY_COMEDIEN_DIT]: {
    ty: TY_COMEDIEN_DIT, nom: 'quand le comédien dit', famille: 'trig', comportement: 'comedien',
    sorties: [SORTIES_NOMMEES.dit, SORTIES_NOMMEES.pasDit],
    reglages: ['écoute', 'reconnaissance'],
    description: 'Un mot-clé entendu dans la transcription du comédien déclenche la suite.',
  },
};

export function comportementBloc(ty: string): ComportementBloc {
  if (ty === TY_GARDE) return 'garde';
  if (ty === TY_MEMOIRE) return 'memoire';
  if (ty === TY_TIRAGE || ALIAS_TIRAGE.includes(ty)) return 'tirage';
  if (ty === TY_BOUCLE) return 'boucle';
  const d = BLOCS_MOTEUR[ty];
  return d ? d.comportement : 'normal';
}

/** Normalise un nom de sortie : minuscules, sans accents, espaces réduits. */
export const normaliserNom = (s: string | undefined): string =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const memeNom = (s: Sortie, nom: string) => normaliserNom(s.nom) === normaliserNom(nom);
const k = (e: Pick<Etape, 'k'>, i: number, defaut = 50) => {
  const v = e.k[i];
  return typeof v === 'number' && Number.isFinite(v) ? v : defaut;
};
const param = (e: Pick<Etape, 'params'>, nom: string): unknown => e.params?.[nom];

// ── Garde-fou ───────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ReglagesGarde { delai: number; echeance: 'continuer' | 'top' }
export function reglagesGarde(e: Pick<Etape, 'k' | 'params'>): ReglagesGarde {
  const pd = param(e, 'delai');
  const delai = typeof pd === 'number' && pd > 0 ? pd : Math.round(5 + (borne01(k(e, 1)) / 100) * 595);
  const pe = param(e, 'echeance');
  const echeance = pe === 'top' || pe === 'continuer' ? pe : k(e, 2) > 50 ? 'top' : 'continuer';
  return { delai, echeance };
}
/** Sépare les sorties d'un garde-fou : « délai dépassé » d'un côté, « condition remplie » de l'autre. */
export function sortiesGarde(sorties: Sortie[]): { conditions: Sortie[]; delai: Sortie | undefined } {
  let delai = sorties.find(s => memeNom(s, SORTIES_NOMMEES.delaiDepasse));
  if (!delai) delai = sorties.find(s => s.g.length === 0 && !memeNom(s, SORTIES_NOMMEES.conditionRemplie));
  return { conditions: sorties.filter(s => s !== delai), delai };
}

// ── Mémoire ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export type OperationMemoire = 'poser' | 'ajouter' | 'zero';
export interface ReglagesMemoire { nom: string; op: OperationMemoire; valeur: number | string | boolean }
export function reglagesMemoire(e: Pick<Etape, 'k' | 'params' | 'name' | 'id'>): ReglagesMemoire {
  const pn = param(e, 'nom');
  const nom = typeof pn === 'string' && pn.trim() ? pn.trim() : (e.name || e.id);
  const po = param(e, 'op');
  const k1 = k(e, 1);
  const op: OperationMemoire = po === 'poser' || po === 'ajouter' || po === 'zero' ? po : k1 < 34 ? 'poser' : k1 < 67 ? 'ajouter' : 'zero';
  const pv = param(e, 'valeur');
  const valeur = typeof pv === 'number' || typeof pv === 'string' || typeof pv === 'boolean' ? pv : k(e, 2);
  return { nom, op, valeur };
}
/** Valeur numérique d'une mémoire (non définie → 0, oui/vrai → 1, non/faux → 0). */
export function memoireEnNombre(v: unknown): number | null {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = normaliserNom(v);
    if (n === 'oui' || n === 'vrai') return 1;
    if (n === 'non' || n === 'faux' || n === '') return 0;
    const x = Number(v.replace(',', '.'));
    return Number.isFinite(x) ? x : null;
  }
  return null;
}
/** Applique l'opération d'un bloc Mémoire ; renvoie le nouvel objet des mémoires (sans modifier l'ancien). */
export function appliquerMemoire(memoires: Record<string, number | string | boolean>, r: ReglagesMemoire): Record<string, number | string | boolean> {
  const m = { ...memoires };
  if (r.op === 'zero') m[r.nom] = 0;
  else if (r.op === 'poser') m[r.nom] = r.valeur;
  else m[r.nom] = (memoireEnNombre(m[r.nom]) ?? 0) + (memoireEnNombre(r.valeur) ?? 0);
  return m;
}

// ── Tirage ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Poids des sorties d'un tirage (Sortie.poids, sinon params.poids[i], sinon 1). */
export function poidsTirage(e: Pick<Etape, 'params'>, sorties: Sortie[]): number[] {
  const pp = param(e, 'poids');
  return sorties.map((s, i) => {
    const p = typeof s.poids === 'number' ? s.poids : Array.isArray(pp) && typeof pp[i] === 'number' ? (pp[i] as number) : 1;
    return Number.isFinite(p) && p > 0 ? p : 0;
  });
}
/** Index tiré selon les poids pour un nombre u ∈ [0, 1[ ; poids tous à 0 → 0 (sortie 1). */
export function tirerIndex(poids: number[], u: number): number {
  const total = poids.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return 0;
  let x = u * total;
  for (let i = 0; i < poids.length; i++) {
    x -= poids[i] ?? 0;
    if (x < 0) return i;
  }
  return poids.length - 1;
}

export interface ReglagesTirage {
  /** ne tirer que parmi les issues ex æquo du dernier vote (params.exaequo) */
  exaequo: boolean;
  /** écart en points sous lequel deux issues sont ex æquo (params.ecart, défaut ECART_EXAEQUO) */
  ecart: number;
}
export function reglagesTirage(e: Pick<Etape, 'params'>): ReglagesTirage {
  const pe = param(e, 'ecart');
  return { exaequo: param(e, 'exaequo') === true, ecart: typeof pe === 'number' && pe >= 0 ? pe : ECART_EXAEQUO };
}
/** Issue représentée par la sortie n° i d'un tirage : sa condition « issue = X », sinon A, B, C… dans l'ordre. */
export function issueSortie(s: Pick<Sortie, 'g'>, i: number): string {
  const g = s.g.find(x => x.k === 'issue' && x.op === '=' && typeof x.v === 'string' && x.v !== '');
  return g ? String(g.v) : String.fromCharCode(65 + i);
}
/**
 * Issues ex æquo au dernier vote : l'issue retenue si elle est tranchée (≠ 'T') ; sinon celles à `ecart` points ou
 * moins de la meilleure d'après la répartition ; null si on ne sait pas (aucune répartition connue).
 */
export function issuesExaequo(votes: Record<string, number> | undefined, issue: string | undefined, ecart = ECART_EXAEQUO): string[] | null {
  if (issue !== undefined && issue !== '' && issue !== 'T') return [issue];
  const e = Object.entries(votes ?? {}).filter((x): x is [string, number] => typeof x[1] === 'number' && Number.isFinite(x[1]));
  if (!e.length) return null;
  const max = Math.max(...e.map(x => x[1]));
  return e.filter(x => x[1] >= max - ecart).map(x => x[0]);
}
/** Poids d'un tirage restreint aux issues ex æquo (les autres à 0) ; si rien ne correspond, poids inchangés. */
export function poidsExaequo(poids: number[], sorties: Pick<Sortie, 'g'>[], exaequo: string[] | null): number[] {
  if (!exaequo) return poids;
  const garde = exaequo.map(normaliserNom);
  const p = poids.map((w, i) => (garde.includes(normaliserNom(issueSortie(sorties[i] ?? { g: [] }, i))) ? w : 0));
  return p.some(x => x > 0) ? p : poids;
}

// ── Boucle ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ReglagesBoucle { tours: number; borne: number }
export function reglagesBoucle(e: Pick<Etape, 'k' | 'params'>): ReglagesBoucle {
  const pt = param(e, 'tours');
  let tours: number;
  if (typeof pt === 'number') tours = pt <= 0 ? Infinity : Math.round(pt);
  else { const k1 = borne01(k(e, 1)); tours = k1 >= 100 ? Infinity : 1 + Math.round((k1 / 100) * 19); }
  return { tours, borne: BORNE_BOUCLE };
}
export function sortiesBoucle(sorties: Sortie[]): { encore: Sortie | undefined; termine: Sortie | undefined } {
  let encore = sorties.find(s => memeNom(s, SORTIES_NOMMEES.encore));
  let termine = sorties.find(s => memeNom(s, SORTIES_NOMMEES.termine));
  const libres = sorties.filter(s => s !== encore && s !== termine);
  if (!encore) encore = libres.shift();
  if (!termine) termine = libres.shift();
  return { encore, termine };
}

function borne01(v: number) { return Math.min(100, Math.max(0, v)); }
const texteParam = (e: Pick<Etape, 'params'>, nom: string): string | undefined => {
  const v = param(e, nom);
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};
const nombreParam = (e: Pick<Etape, 'params'>, nom: string, min = 0): number | undefined => {
  const v = param(e, nom);
  return typeof v === 'number' && Number.isFinite(v) && v > min ? v : undefined;
};
/** Choix parmi `liste` : params[nom] s'il en fait partie (casse et accents ignorés), sinon le rotatif k[i]. */
function choixParam<T extends string>(e: Pick<Etape, 'k' | 'params'>, nom: string, liste: readonly T[], i: number, defaut = 0): T {
  const p = texteParam(e, nom);
  if (p) { const j = liste.findIndex(x => normaliserNom(x) === normaliserNom(p)); if (j >= 0) return liste[j]!; }
  return liste[indexChoix(liste.length, k(e, i, defaut))]!;
}
/** Sortie nommée `nom`, sinon la n-ième sortie sans nom reconnu parmi `noms`. */
function sortiesNommees(sorties: Sortie[], noms: string[]): (Sortie | undefined)[] {
  const trouvees = noms.map(n => sorties.find(s => memeNom(s, n)));
  const libres = sorties.filter(s => !trouvees.includes(s) && !noms.some(n => memeNom(s, n)));
  return trouvees.map(s => s ?? libres.shift());
}

// ── Écoute d'un signal ──────────────────────────────────────────────────────────────────────────────────────────────
export interface ReglagesSignal { signal: string; source: string; fois: number }
export function reglagesSignal(e: Pick<Etape, 'k' | 'params' | 'id'>): ReglagesSignal {
  const signal = texteParam(e, 'signal') ?? texteParam(e, 'adresse') ?? e.id;
  const pf = nombreParam(e, 'fois');
  const fois = pf ? Math.max(1, Math.round(pf)) : Math.max(1, Math.round(1 + borne01(k(e, 2, 0)) / 100 * 19));
  return { signal, source: choixParam(e, 'source', SOURCES_SIGNAL, 1, 0), fois };
}
export function sortiesSignal(sorties: Sortie[]): { recu: Sortie | undefined } {
  const [recu] = sortiesNommees(sorties, [SORTIES_NOMMEES.recu]);
  return { recu };
}

// ── Commande machine ────────────────────────────────────────────────────────────────────────────────────────────────
export interface ReglagesMachine { cible: string; commande: string; accuse: string; delai: number }
export function reglagesMachine(e: Pick<Etape, 'k' | 'params' | 'id'>): ReglagesMachine {
  const cible = texteParam(e, 'cible') ?? CIBLES_MACHINE[indexChoix(CIBLES_MACHINE.length, k(e, 1))]!;
  const i = CIBLES_MACHINE.findIndex(x => normaliserNom(x) === normaliserNom(cible));
  const commande = texteParam(e, 'commande') ?? COMMANDES_MACHINE[i >= 0 ? i : 1]!;
  const delai = nombreParam(e, 'delai') ?? Math.round((0.5 + borne01(k(e, 2)) / 100 * 9.5) * 10) / 10;
  return { cible, commande, accuse: texteParam(e, 'accuse') ?? `accuse:${e.id}`, delai };
}
export function sortiesMachine(sorties: Sortie[]): { confirme: Sortie | undefined; sansReponse: Sortie | undefined } {
  const [confirme, sansReponse] = sortiesNommees(sorties, [SORTIES_NOMMEES.confirme, SORTIES_NOMMEES.sansReponse]);
  return { confirme, sansReponse };
}

// ── Message à une personne ──────────────────────────────────────────────────────────────────────────────────────────
export interface ReglagesMessage { destinataire: string; texte: string; accuse: string; delai: number }
export function reglagesMessage(e: Pick<Etape, 'k' | 'params' | 'id' | 'name'>): ReglagesMessage {
  return {
    destinataire: texteParam(e, 'destinataire') ?? DESTINATAIRES_MESSAGE[indexChoix(DESTINATAIRES_MESSAGE.length, k(e, 1, 0))]!,
    texte: texteParam(e, 'texte') ?? (e.name || e.id),
    accuse: texteParam(e, 'accuse') ?? `lu:${e.id}`,
    delai: nombreParam(e, 'delai') ?? Math.round(5 + borne01(k(e, 2)) / 100 * 115),
  };
}
export function sortiesMessage(sorties: Sortie[]): { lu: Sortie | undefined; nonLu: Sortie | undefined } {
  const [lu, nonLu] = sortiesNommees(sorties, [SORTIES_NOMMEES.lu, SORTIES_NOMMEES.nonLu]);
  return { lu, nonLu };
}

// ── Chrono visible ──────────────────────────────────────────────────────────────────────────────────────────────────
export interface ReglagesChrono { duree: number; affichage: string }
export function reglagesChrono(e: Pick<Etape, 'k' | 'params'>): ReglagesChrono {
  return {
    duree: nombreParam(e, 'duree') ?? Math.round(5 + borne01(k(e, 1)) / 100 * 115),
    affichage: choixParam(e, 'affichage', AFFICHAGES_CHRONO, 2, 100),
  };
}
/** Sorties d'un chrono : « zéro » (à défaut la première), « 10 s restantes » seulement si elle est nommée. */
export function sortiesChrono(sorties: Sortie[]): { zero: Sortie | undefined; dixSecondes: Sortie | undefined } {
  const dixSecondes = sorties.find(s => memeNom(s, SORTIES_NOMMEES.dixSecondes));
  const zero = sorties.find(s => memeNom(s, SORTIES_NOMMEES.zero)) ?? sorties.find(s => s !== dixSecondes);
  return { zero, dixSecondes };
}

// ── Point de reprise ────────────────────────────────────────────────────────────────────────────────────────────────
export type Restauration = 'tout' | 'memoires' | 'plateau' | 'ecrans';
const CODES_RESTAURATION: Restauration[] = ['tout', 'memoires', 'plateau', 'ecrans'];
export interface ReglagesReprise { nom: string; restaure: Restauration }
export function reglagesReprise(e: Pick<Etape, 'k' | 'params' | 'id' | 'name'>): ReglagesReprise {
  const pr = texteParam(e, 'restaure');
  let i = pr ? CODES_RESTAURATION.findIndex(c => c === normaliserNom(pr)) : -1;
  if (i < 0 && pr) i = RESTAURATIONS_REPRISE.findIndex(x => normaliserNom(x) === normaliserNom(pr));
  if (i < 0) i = indexChoix(RESTAURATIONS_REPRISE.length, k(e, 1, 0));
  return { nom: texteParam(e, 'nom') ?? (e.name || e.id), restaure: CODES_RESTAURATION[i]! };
}

// ── Séquence réutilisable ───────────────────────────────────────────────────────────────────────────────────────────
export interface ReglagesSequence {
  /** id ou nom de la séquence */
  sequence: string;
  /** facteur appliqué aux durées prévues des étapes de la séquence (durée globale 50 → 200 %) */
  facteur: number;
  /** intensité 0 → 100 (transmise aux commandes émises dans la séquence) */
  intensite: number;
}
export function reglagesSequence(e: Pick<Etape, 'k' | 'params'>): ReglagesSequence {
  const pd = nombreParam(e, 'duree');
  const pi = param(e, 'intensite');
  return {
    sequence: texteParam(e, 'sequence') ?? '',
    facteur: (pd ?? 50 + borne01(k(e, 1)) / 100 * 150) / 100,
    intensite: typeof pi === 'number' && Number.isFinite(pi) ? borne01(pi) : borne01(k(e, 2, 100)),
  };
}
/** Séquence désignée par son id, ou par son nom (casse et accents ignorés). */
export function trouverSequence(sequences: Sequence[] | undefined, ref: string): Sequence | undefined {
  if (!ref || !sequences) return undefined;
  return sequences.find(s => s.id === ref) ?? sequences.find(s => normaliserNom(s.nom) === normaliserNom(ref));
}
/** Sortie du bloc appelant prise à la fin de la séquence : même nom que la fin de séquence, sinon « fin », sinon la
 *  première. */
export function sortieApresSequence(sorties: Sortie[], nomFin: string | undefined): Sortie | undefined {
  return (nomFin ? sorties.find(s => memeNom(s, nomFin)) : undefined) ?? sorties.find(s => memeNom(s, SORTIES_NOMMEES.fin)) ?? sorties[0];
}
/** Durée prévue d'une séquence, parcourue linéairement depuis son entrée (première sortie remplie ou sans condition,
 *  sinon la première), durées × facteur ; séquences imbriquées comprises (PROFONDEUR_SEQUENCES au plus). */
export function dureeSequence(sequences: Sequence[] | undefined, seq: Sequence, facteur = 1, profondeur = 0): number {
  if (profondeur >= PROFONDEUR_SEQUENCES) return 0;
  let total = 0;
  let id: string | undefined = seq.entry;
  const vus = new Set<string>();
  while (id && !vus.has(id)) {
    vus.add(id);
    const st = seq.st.find(x => x.id === id);
    if (!st) break;
    const comp = comportementBloc(st.ty);
    if (comp === 'sequence') {
      const r = reglagesSequence(st);
      const sous = trouverSequence(sequences, r.sequence);
      total += sous ? dureeSequence(sequences, sous, facteur * r.facteur, profondeur + 1) : 0;
    } else if (comp === 'chrono') total += reglagesChrono(st).duree;
    else if (comp !== 'reprise') total += dureeEtape(st) * facteur;
    const outs = seq.tr.filter(x => x.a === st.id);
    const o = outs.find(x => !x.g.length) ?? outs[0];
    id = o?.b || undefined;
  }
  return total;
}

// ── Figurants (docs/etudes/figurants-ia.md §8.4) ────────────────────────────────────────────────────────────────────
export interface ReglagesFigurants {
  densite: string;
  humeur: string;
  /** intention soufflée (mode souffleur) */
  intention?: string;
  /** personas visés : 'auto' ou liste */
  personas: 'auto' | string[];
  /** les répliques passent par la file « à valider » de la régie */
  validation: boolean;
}
export function reglagesFigurants(e: Pick<Etape, 'k' | 'params'>): ReglagesFigurants {
  const pp = param(e, 'personas');
  const personas = Array.isArray(pp) ? pp.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
  const pv = param(e, 'validation');
  return {
    densite: choixParam(e, 'densite', DENSITES_FIGURANTS, 1),
    humeur: texteParam(e, 'humeur') ?? HUMEURS_FIGURANTS[indexChoix(HUMEURS_FIGURANTS.length, k(e, 2, 0))]!,
    intention: texteParam(e, 'intention') ?? texteParam(e, 'souffleur'),
    personas: personas.length ? personas : 'auto',
    validation: typeof pv === 'boolean' ? pv : true,
  };
}
/** Données de la commande `figurants.cmd` (protocole fig.cmd : { densite } · { humeur } · { dire }). */
export function commandeFigurants(r: ReglagesFigurants): Record<string, unknown> {
  const d: Record<string, unknown> = { densite: r.densite, humeur: r.humeur };
  if (r.intention) d.dire = { intention: r.intention, personas: r.personas, validation: r.validation };
  return d;
}

// ── Quand le comédien dit ───────────────────────────────────────────────────────────────────────────────────────────
export interface ReglagesComedien {
  mots: string[];
  /** nom du signal de transcription écouté */
  source: string;
  /** écoute au plus (s) avant « pas dit » */
  delai: number;
  /** reconnaissance approchante (le mot peut être une partie d'un mot entendu) */
  approchant: boolean;
}
export function reglagesComedien(e: Pick<Etape, 'k' | 'params'>): ReglagesComedien {
  const pm = param(e, 'mots') ?? param(e, 'motsCles');
  const brut = Array.isArray(pm) ? pm.filter((x): x is string => typeof x === 'string') : typeof pm === 'string' ? pm.split(/[,;|\n]/) : [];
  const pr = texteParam(e, 'reconnaissance');
  return {
    mots: brut.map(x => x.trim()).filter(Boolean),
    source: texteParam(e, 'source') ?? 'transcription',
    delai: nombreParam(e, 'delai') ?? Math.round(5 + borne01(k(e, 1)) / 100 * 595),
    approchant: pr ? normaliserNom(pr) === normaliserNom(RECONNAISSANCES_MOT[1]) : indexChoix(2, k(e, 2, 0)) === 1,
  };
}
/** Texte entendu ramené à des mots : minuscules, sans accents ni ponctuation. */
const motsDe = (s: string) => normaliserNom(s).replace(/[^a-z0-9' -]+/g, ' ').replace(/['-]/g, ' ').replace(/\s+/g, ' ').trim();
/** Premier mot-clé (dans l'ordre de la liste) présent dans le texte, ou undefined. */
export function motEntendu(texte: string, r: Pick<ReglagesComedien, 'mots' | 'approchant'>): string | undefined {
  const t = ` ${motsDe(texte)} `;
  return r.mots.find(m => {
    const n = motsDe(m);
    return !!n && (r.approchant ? t.includes(n) : t.includes(` ${n} `));
  });
}
/** Texte porté par un signal (chaîne, ou donnees.texte / donnees.valeur). */
export function texteSignal(donnees: unknown): string {
  if (typeof donnees === 'string') return donnees;
  if (donnees && typeof donnees === 'object') {
    const o = donnees as Record<string, unknown>;
    if (typeof o.texte === 'string') return o.texte;
    if (typeof o.valeur === 'string') return o.valeur;
  }
  return '';
}
/** Sorties de « Quand le comédien dit » : celle nommée d'après le mot entendu, sinon « dit » ; « pas dit » si nommée. */
export function sortiesComedien(sorties: Sortie[], mot?: string): { dit: Sortie | undefined; pasDit: Sortie | undefined } {
  const pasDit = sorties.find(s => memeNom(s, SORTIES_NOMMEES.pasDit));
  const parMot = mot ? sorties.find(s => memeNom(s, mot)) : undefined;
  const dit = parMot ?? sorties.find(s => memeNom(s, SORTIES_NOMMEES.dit)) ?? sorties.find(s => s !== pasDit);
  return { dit, pasDit };
}

// ── Générateur pseudo-aléatoire ────────────────────────────────────────────────────────────────────────────────────
/** PRNG mulberry32 : simple, rapide, déterministe. Renvoie une fonction → [0, 1[. */
export function creerPrng(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
