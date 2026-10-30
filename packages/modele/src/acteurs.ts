// Les acteurs du spectacle (audit 2026-10, rapport 1 §4.4) : catalogue des types, cibles dans la foule, envois des
// étapes, et calcul PUR de la vue de chaque acteur à partir du parcours du lecteur.
//
// Règle des vues (généralisation de la règle d'héritage de la sortie scène) : un acteur garde son dernier écran tant
// qu'un envoi ne le remplace pas. La vue d'un acteur se calcule donc à tout instant depuis `EtatLecture.parcours` :
// c'est ce qui permet l'instantané à la connexion et la reprise sans journal côté téléphone.
//   - quand: 'entree' (défaut) part à l'entrée de l'étape ; { apres: s } part s secondes après l'entrée si l'étape dure
//     jusque-là ; 'sortie' part quand on quitte l'étape ;
//   - tenir: false : l'écran ne dure que le temps de l'étape ; à sa sortie l'acteur retrouve le dernier écran tenu ;
//   - un envoi ciblé dans la foule ('public:ont-vote:A') ne compte que pour les personnes concernées (ContexteFoule) ;
//   - les envois portés par les étapes d'une séquence réutilisable ne sont pas encore joués (avertissement de valider).
// Tout est déterministe : même projet + même état de lecture (+ même contexte de foule) = même vue.
import type { Acteur, Envoi, Etape, GenreAgent, Projet, QuandEnvoi, RenduActeur, TypeActeur } from './types';
import type { EtatLecture } from './moteur';
import { normaliserNom } from './blocs-moteur';

// ── Catalogue des types d'acteurs ──────────────────────────────────────────────────────────────────────────────────

/** Modèle d'acteur du catalogue : ce qu'un acteur de ce type sait recevoir et renvoyer par défaut. */
export interface ModeleActeur {
  /** clé du catalogue : le type, ou 'agent:<genre>' pour les agents */
  cle: string;
  type: TypeActeur;
  genre?: GenreAgent;
  /** nom proposé à la création */
  nom: string;
  rendu: RenduActeur;
  cardinalite: 1 | 'n';
  /** écrans (vues persistantes) par défaut */
  ecrans: readonly string[];
  /** effets éphémères qu'il sait jouer */
  fx: readonly string[];
  /** signaux qu'il renvoie (lus par 'sig:<acteur>.<signal>') */
  signaux: readonly string[];
  /** exemple dans Écho */
  exemple: string;
}

/** Écrans de la sortie scène existante (apps/conducteur/src/sortie/protocole.ts, TypeScene) + mur, visio, flux vidéo. */
const ECRANS_SCENE = ['noir', 'accueil-qr', 'streamer', 'vote', 'chrono', 'titre', 'image', 'video', 'page', 'mur', 'visio', 'flux-video'] as const;

/** Les 9 types d'acteurs du rapport 1 §4.4 (6 types, dont 4 genres d'agents). */
export const CATALOGUE_ACTEURS: readonly ModeleActeur[] = [
  { cle: 'regie', type: 'regie', nom: 'La régie', rendu: 'conducteur', cardinalite: 1,
    ecrans: ['alerte', 'salle', 'validation'], fx: ['alerte'], signaux: ['top', 'poser', 'signal', 'forcer'], exemple: 'la régie' },
  { cle: 'comedien', type: 'comedien', nom: 'Comédien', rendu: 'telephone', cardinalite: 1,
    ecrans: ['prompteur', 'visio-appel', 'veille'], fx: ['consigne', 'vibrer'], signaux: ['transcription', 'accuse', 'present'],
    exemple: 'Franck (prompteur ÉCO + visio)' },
  { cle: 'public', type: 'public', nom: 'Le public', rendu: 'telephone', cardinalite: 'n',
    ecrans: ['qr', 'regardez', 'video', 'phrases', 'vote', 'texte', 'choix', 'notification', 'couleur', 'noir', 'image-onde'],
    fx: ['vibrer', 'son', 'flash'], signaux: ['vote', 'texte', 'reaction', 'pret', 'presence'], exemple: 'les spectateurs' },
  { cle: 'ecran', type: 'ecran', nom: 'Écran scène', rendu: 'sortie', cardinalite: 1,
    ecrans: ECRANS_SCENE, fx: ['pop', 'reaction', 'coeurs', 'fusee', 'alerte', 'gabarit', 'son', 'flash'],
    signaux: ['fin-video', 'present', 'absent'], exemple: 'l’écran scène' },
  { cle: 'telephone', type: 'telephone', nom: 'Téléphone nommé', rendu: 'telephone', cardinalite: 1,
    ecrans: ['veille', 'vote-compteur', 'visio-appel', 'image'], fx: ['vibrer', 'son'], signaux: ['present', 'camera'],
    exemple: 'le téléphone de la ministre' },
  { cle: 'agent:figurants', type: 'agent', genre: 'figurants', nom: 'Les figurants', rendu: 'externe', cardinalite: 1,
    ecrans: ['figurants.cmd'], fx: [], signaux: ['say', 'stat'], exemple: 'les abonnés qui commentent, « @x a voté »' },
  { cle: 'agent:elevenlabs', type: 'agent', genre: 'elevenlabs', nom: 'Agent vocal', rendu: 'externe', cardinalite: 1,
    ecrans: ['appel', 'raccrocher'], fx: [], signaux: ['transcript', 'fin-appel', 'parle'], exemple: 'ÉCO' },
  { cle: 'agent:asr', type: 'agent', genre: 'asr', nom: 'Transcription', rendu: 'externe', cardinalite: 1,
    ecrans: ['ecouter'], fx: [], signaux: ['transcription'], exemple: 'Whisper sur dgx' },
  { cle: 'agent:osc', type: 'agent', genre: 'osc', nom: 'Pont OSC', rendu: 'externe', cardinalite: 1,
    ecrans: ['machine'], fx: [], signaux: ['accuse'], exemple: 'console son / lumière (plus tard)' },
];

export const TYPES_ACTEUR: readonly TypeActeur[] = ['regie', 'comedien', 'public', 'ecran', 'telephone', 'agent'];
export const GENRES_AGENT: readonly GenreAgent[] = ['figurants', 'elevenlabs', 'asr', 'osc'];

/** Identifiant d'acteur : lettres, chiffres, - et _ (ni point, réservé aux signaux, ni deux-points, réservé aux cibles). */
export const RE_ID_ACTEUR = /^[A-Za-z0-9_-]{1,40}$/;

/** Modèle du catalogue d'un acteur (par son type, et son genre pour un agent). */
export function modeleActeur(a: Pick<Acteur, 'type'> & { agent?: { genre?: unknown } }): ModeleActeur | undefined {
  if (a.type === 'agent') return CATALOGUE_ACTEURS.find(m => m.type === 'agent' && m.genre === a.agent?.genre);
  return CATALOGUE_ACTEURS.find(m => m.type === a.type);
}

/** Nouvel acteur à partir d'une clé du catalogue ('public', 'ecran', 'agent:figurants'…). */
export function creerActeur(cle: string, id: string, nom?: string): Acteur {
  const m = CATALOGUE_ACTEURS.find(x => x.cle === cle);
  if (!m) throw new Error(`Type d’acteur inconnu : « ${cle} ».`);
  const a: Acteur = {
    id, type: m.type, nom: nom ?? m.nom, rendu: m.rendu, cardinalite: m.cardinalite, ecrans: [...m.ecrans], signaux: [...m.signaux],
  };
  if (m.genre) a.agent = { genre: m.genre };
  return a;
}

/** Les acteurs d'Écho (rapport 1 §4.4), complétés des écrans produits par commandesVersEnvois ('image-onde',
 *  'flux-video') et du signal 'raccroche' de la ministre. Aucune clé ni identifiant d'agent ici. */
export function acteursEcho(): Acteur[] {
  return [
    { id: 'public', type: 'public', nom: 'Le public', rendu: 'telephone', cardinalite: 'n',
      ecrans: ['qr', 'regardez', 'video', 'phrases', 'vote', 'choix', 'notification', 'noir', 'image-onde'],
      signaux: ['vote', 'texte', 'pret', 'presence'] },
    { id: 'scene', type: 'ecran', nom: 'Écran scène', rendu: 'sortie', cardinalite: 1,
      ecrans: ['noir', 'accueil-qr', 'mur', 'vote', 'visio', 'video', 'titre', 'flux-video'], signaux: ['fin-video', 'present'] },
    { id: 'ministre', type: 'telephone', nom: 'Téléphone de la ministre', rendu: 'telephone', cardinalite: 1,
      ecrans: ['veille', 'vote-compteur', 'visio-appel'], signaux: ['present', 'camera', 'raccroche'] },
    { id: 'franck', type: 'comedien', nom: 'Franck (Jim)', rendu: 'telephone', cardinalite: 1,
      ecrans: ['prompteur', 'visio-appel'], signaux: ['present', 'transcription'] },
    { id: 'eco', type: 'agent', nom: 'ÉCO (ElevenLabs)', rendu: 'externe', cardinalite: 1, agent: { genre: 'elevenlabs' },
      ecrans: ['appel', 'raccrocher'], signaux: ['fin-appel', 'transcript'] },
    { id: 'figurants', type: 'agent', nom: 'Les abonnés (figurants)', rendu: 'externe', cardinalite: 1,
      agent: { genre: 'figurants', config: { banques: 'echo' } }, ecrans: ['figurants.cmd'], signaux: ['say'] },
  ];
}

// ── Cibles dans la foule ───────────────────────────────────────────────────────────────────────────────────────────

/** Partie de la foule visée par un envoi. */
export type FiltreFoule =
  /** a répondu `reponse` à la question `question` (ou, sans question, au dernier vote) */
  | { genre: 'ont-vote'; reponse: string; question?: string }
  /** n'a pas répondu à la question (ou à aucun vote) */
  | { genre: 'sans-reponse'; question?: string }
  /** n personnes tirées au sort par le serveur (ContexteFoule.tirages) */
  | { genre: 'aleatoire'; n: number }
  | { genre: 'groupe'; nom: string }
  | { genre: 'personne'; id: string };

export interface CibleFoule {
  acteur: string;
  /** null = tout l'acteur */
  filtre: FiltreFoule | null;
}

const morceau = (x: string | undefined): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= 64;

/**
 * Lit la cible d'un envoi : 'public' · 'public:tous' · 'public:ont-vote:A' · 'public:ont-vote:A:q1' ·
 * 'public:sans-reponse[:q1]' · 'public:aleatoire:3' · 'public:groupe:<nom>' · 'public:personne:<id>'. null si illisible.
 */
export function cibleDansFoule(vers: unknown): CibleFoule | null {
  if (typeof vers !== 'string' || vers.length > 200) return null;
  const [acteur, genre, a, b, ...reste] = vers.split(':').map(x => x.trim());
  if (!acteur || !RE_ID_ACTEUR.test(acteur) || reste.length) return null;
  if (genre === undefined || (genre === 'tous' && a === undefined)) return { acteur, filtre: null };
  switch (genre) {
    case 'ont-vote':
      if (!morceau(a) || (b !== undefined && !morceau(b))) return null;
      return { acteur, filtre: b === undefined ? { genre, reponse: a } : { genre, reponse: a, question: b } };
    case 'sans-reponse':
      if (b !== undefined || (a !== undefined && !morceau(a))) return null;
      return { acteur, filtre: a === undefined ? { genre } : { genre, question: a } };
    case 'aleatoire': {
      const n = Number(a);
      if (b !== undefined || !a || !/^\d+$/.test(a) || n < 1 || n > 100000) return null;
      return { acteur, filtre: { genre, n } };
    }
    case 'groupe':
      return morceau(a) && b === undefined ? { acteur, filtre: { genre, nom: a } } : null;
    case 'personne':
      return morceau(a) && b === undefined ? { acteur, filtre: { genre, id: a } } : null;
    default:
      return null;
  }
}

/** Ce que le serveur sait d'une personne de la foule, pour les envois ciblés. */
export interface ContexteFoule {
  /** identifiant de la personne (téléphone) */
  personne?: string;
  /** ses votes : question (numéro ou id) → réponse ('A', '2'…) */
  votes?: Record<string, string>;
  /** sa réponse au dernier vote */
  dernierVote?: string;
  groupes?: string[];
  /** clés des envois (EnvoiPasse.cle) pour lesquels elle a été tirée au sort */
  tirages?: string[];
}

const memeTexte = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && normaliserNom(a) === normaliserNom(b);

/** La personne décrite par `foule` est-elle visée par ce filtre ? Sans filtre : oui ; sans contexte : non. */
export function personneConcernee(filtre: FiltreFoule | null, foule: ContexteFoule | undefined, cle = ''): boolean {
  if (!filtre) return true;
  if (!foule) return false;
  switch (filtre.genre) {
    case 'ont-vote':
      return filtre.question !== undefined ? memeTexte(foule.votes?.[filtre.question], filtre.reponse) : memeTexte(foule.dernierVote, filtre.reponse);
    case 'sans-reponse':
      return filtre.question !== undefined ? foule.votes?.[filtre.question] === undefined : foule.dernierVote === undefined;
    case 'aleatoire': return !!cle && (foule.tirages ?? []).includes(cle);
    case 'groupe': return (foule.groupes ?? []).some(g => memeTexte(g, filtre.nom));
    case 'personne': return foule.personne === filtre.id;
  }
}

// ── Envois d'une étape ─────────────────────────────────────────────────────────────────────────────────────────────

/** `quand` est-il lisible ? */
export const quandValide = (q: unknown): q is QuandEnvoi =>
  q === 'entree' || q === 'sortie'
  || (!!q && typeof q === 'object' && !Array.isArray(q) && typeof (q as { apres?: unknown }).apres === 'number'
    && Number.isFinite((q as { apres: number }).apres) && (q as { apres: number }).apres >= 0);

/** Moment d'un envoi : 'entree', 'sortie' ou le délai (s) après l'entrée. Un `quand` illisible compte comme 'entree'. */
export function momentEnvoi(e: Pick<Envoi, 'quand'>): 'entree' | 'sortie' | number {
  const q = e.quand;
  if (q === 'sortie') return 'sortie';
  if (quandValide(q) && typeof q === 'object') return q.apres;
  return 'entree';
}

/** Clé de `quand` pour comparer deux envois ('entree', 'sortie', 'apres:5'). */
export const cleQuand = (q: unknown): string => {
  const m = momentEnvoi({ quand: q as QuandEnvoi });
  return typeof m === 'number' ? `apres:${m}` : m;
};

const estEnvoi = (e: unknown): e is Envoi => !!e && typeof e === 'object' && !Array.isArray(e) && typeof (e as Envoi).vers === 'string';

/** Envois lisibles d'une étape avec leur index, dans l'ordre d'envoi : entrée (ordre écrit), délais croissants, sortie. */
function envoisOrdonnes(etape: Pick<Etape, 'envois'>): { envoi: Envoi; index: number; quand: 'entree' | 'sortie' | number }[] {
  const l = (Array.isArray(etape.envois) ? etape.envois : [])
    .map((envoi, index) => ({ envoi, index }))
    .filter((x): x is { envoi: Envoi; index: number } => estEnvoi(x.envoi))
    .map(x => ({ ...x, quand: momentEnvoi(x.envoi) }));
  const rang = (q: 'entree' | 'sortie' | number) => (q === 'entree' ? -1 : q === 'sortie' ? Infinity : q);
  return l.sort((a, b) => rang(a.quand) - rang(b.quand) || a.index - b.index);
}

/**
 * Envois d'une étape partis au temps `t` (s depuis l'entrée dans l'étape) : ceux de l'entrée et ceux dont le délai est
 * échu, dans l'ordre d'envoi ; avec `sortie`, ceux de la sortie en plus (l'étape est quittée).
 */
export function envoisDeLEtape(etape: Pick<Etape, 'envois'>, t: number, sortie = false): Envoi[] {
  return envoisOrdonnes(etape)
    .filter(x => x.quand === 'entree' || (x.quand === 'sortie' ? sortie : x.quand <= t))
    .map(x => x.envoi);
}

/** Params d'un envoi, où une valeur texte '$nom' est remplacée par le paramètre `nom` de l'étape (s'il existe). */
export function resoudreParams(params: unknown, etape: Pick<Etape, 'params'>): Record<string, unknown> {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    const ref = typeof v === 'string' && /^\$[A-Za-z_][A-Za-z0-9_-]*$/.test(v) ? v.slice(1) : null;
    out[k] = ref !== null && etape.params && Object.prototype.hasOwnProperty.call(etape.params, ref) ? etape.params[ref] : v;
  }
  return out;
}

// ── Envois partis pendant la lecture, vue d'un acteur ──────────────────────────────────────────────────────────────

/** Un envoi parti pendant la lecture. */
export interface EnvoiPasse {
  /** temps de lecture (s) où il est parti */
  t: number;
  moment: string;
  etape: string;
  /** index de l'envoi dans `etape.envois` */
  index: number;
  /** rang du passage dans `EtatLecture.parcours` (une étape rejouée donne un autre passage) */
  passage: number;
  envoi: Envoi;
  cible: CibleFoule;
  /** params résolus (voir resoudreParams) */
  params: Record<string, unknown>;
  /** clé stable : '<moment>/<etape>#<index>@<passage>' (accusés, tirages au sort, `etat.ecran.cle` du protocole) */
  cle: string;
  /** écran non tenu (tenir: false) dont l'étape est finie : il n'est plus montré */
  echu: boolean;
}

/** Étape d'un moment du projet. */
function trouverEtape(projet: Projet, moment: string, etape: string): Etape | undefined {
  return projet.ev.find(m => m.id === moment)?.st.find(s => s.id === etape);
}

/**
 * Tous les envois partis depuis le début de la lecture, dans l'ordre d'envoi (passage après passage). Le temps passé
 * dans une étape est lu dans le parcours (entrée de l'étape suivante) ou, pour la dernière, dans l'état courant.
 */
export function envoisPasses(projet: Projet, etat: EtatLecture): EnvoiPasse[] {
  const out: EnvoiPasse[] = [];
  const parcours = Array.isArray(etat.parcours) ? etat.parcours : [];
  parcours.forEach(([moment, etapeId, debut], passage) => {
    const etape = trouverEtape(projet, moment, etapeId);
    if (!etape || !Array.isArray(etape.envois) || !etape.envois.length) return;
    const suivant = parcours[passage + 1];
    let enCours = false;
    let duree: number;
    if (suivant) duree = Math.max(0, suivant[2] - debut);
    else if (etat.phase !== 'passage' && etat.phase !== 'fin' && !etat.termine && etat.moment === moment && etat.etape === etapeId) {
      enCours = true;
      duree = Math.max(0, etat.tEtape);
    } else duree = Math.max(0, (etat.phase === 'passage' ? etat.t - etat.tEtape : etat.t) - debut);
    for (const { envoi, index, quand } of envoisOrdonnes(etape)) {
      if (quand === 'sortie' ? enCours : typeof quand === 'number' && quand > duree) continue;
      const cible = cibleDansFoule(envoi.vers);
      if (!cible) continue;
      const t = quand === 'entree' ? debut : quand === 'sortie' ? debut + duree : debut + quand;
      out.push({
        t, moment, etape: etapeId, index, passage, envoi, cible, params: resoudreParams(envoi.params, etape),
        cle: `${moment}/${etapeId}#${index}@${passage}`, echu: envoi.tenir === false && !enCours,
      });
    }
  });
  return out;
}

/** Ce qu'un acteur montre à un instant. */
export interface Vue {
  acteur: string;
  /** écran courant ('vote', 'mur', 'noir'…) */
  ecran: string;
  params: Record<string, unknown>;
  /** temps de lecture (s) où l'écran a été envoyé */
  depuis: number;
  moment: string;
  etape: string;
  /** cible écrite dans l'envoi ('public' ou 'public:ont-vote:A') */
  vers: string;
  /** clé de l'envoi (EnvoiPasse.cle) : l'acteur la renvoie dans son battement (écran AFFICHÉ) */
  cle: string;
  /** false : écran montré le temps de l'étape seulement (tenir: false) */
  tenue: boolean;
}

/**
 * Vue courante d'un acteur (fonction PURE) : le dernier écran qui lui a été envoyé et qui est encore montré. null si
 * aucun écran ne lui a encore été envoyé, ou si le projet déclare ses acteurs et ne connaît pas `acteurId`.
 * `foule` : pour une personne de la foule, les envois ciblés qui la concernent comptent aussi ; sans `foule`, seule la
 * vue commune (envois sans filtre) est calculée.
 */
export function vueActeur(projet: Projet, etat: EtatLecture, acteurId: string, foule?: ContexteFoule): Vue | null {
  if (Array.isArray(projet.acteurs) && projet.acteurs.length && !projet.acteurs.some(a => a && a.id === acteurId)) return null;
  const l = envoisPasses(projet, etat);
  for (let i = l.length - 1; i >= 0; i--) {
    const x = l[i]!;
    if (x.cible.acteur !== acteurId || typeof x.envoi.ecran !== 'string' || !x.envoi.ecran || x.echu) continue;
    if (!personneConcernee(x.cible.filtre, foule, x.cle)) continue;
    return {
      acteur: acteurId, ecran: x.envoi.ecran, params: x.params, depuis: x.t, moment: x.moment, etape: x.etape,
      vers: x.envoi.vers, cle: x.cle, tenue: x.envoi.tenir !== false,
    };
  }
  return null;
}

/** Vues communes de tous les acteurs déclarés (id → vue ou null). */
export function vuesDesActeurs(projet: Projet, etat: EtatLecture): Record<string, Vue | null> {
  const out: Record<string, Vue | null> = {};
  for (const a of Array.isArray(projet.acteurs) ? projet.acteurs : []) if (a && typeof a.id === 'string') out[a.id] = vueActeur(projet, etat, a.id);
  return out;
}

// ── Conversion des commandes du prototype (params.cmds, params.sortie) ─────────────────────────────────────────────

const estObjet = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Écran du téléphone du public pour chaque `tel.cmd mode` du prototype (prototypes/figurants/pages/echo/echo.js:150-157). */
const TEL_CMD: Record<string, Omit<Envoi, 'vers'>> = {
  // « Regardez la vidéo » : écran d'attente pendant que la vidéo passe sur scène (et non la vidéo elle-même)
  video: { ecran: 'regardez', params: { texte: 'Regardez la vidéo' } },
  scene: { ecran: 'regardez', params: { texte: 'Regardez la scène' } },
  // le flux Instagram joué sur le téléphone, puis « abonne / désabonne + pourquoi » à la fin de la vidéo
  flux: { ecran: 'video', params: { asset: 'flux_insta_jim.mp4', puis: 'choix' } },
  choix: { ecran: 'choix' },
  notif: { ecran: 'notification', fx: 'vibrer', params: { texte: 'Vous êtes désormais modérateur', motif: [200, 100, 200] } },
  phrases: { ecran: 'phrases' },
};

/** Écran scène pour chaque `ecran mode` du prototype (page chat du serveur des figurants). */
const ECRAN_CMD: Record<string, string> = { qr: 'accueil-qr', mur: 'mur', noir: 'noir' };

/** Écran scène lu dans `params.sortie` (texte : type de scène ; objet : scène, ou page du serveur des figurants). */
function sceneDepuisSortie(sortie: unknown): { ecran: string; params: Record<string, unknown> } | undefined {
  if (typeof sortie === 'string' && sortie.trim()) {
    const s = sortie.trim();
    return { ecran: s === 'qr' ? 'accueil-qr' : s, params: {} };
  }
  if (!estObjet(sortie) || typeof sortie.type !== 'string' || !sortie.type) return undefined;
  const type = sortie.type;
  if (type !== 'page') return { ecran: type, params: Object.fromEntries(Object.entries(sortie).filter(([k]) => k !== 'type')) };
  const url = typeof sortie.url === 'string' ? sortie.url : '';
  if (/\/pages\/chat(\/|$)/.test(url)) return { ecran: 'mur', params: {} };
  if (/\/pages\/flux(\/|$)/.test(url)) return { ecran: 'flux-video', params: {} };
  if (/\/pages\/visio(\/|$)/.test(url)) return { ecran: 'visio', params: { postes: ['franck', 'ministre'], son: { franck: false, ministre: true } } };
  return { ecran: 'page', params: { url } };
}

/**
 * Convertit les commandes du prototype d'Écho (`params.cmds` : tel.cmd, ecran, vote.cmd, junon) et `params.sortie` d'une
 * étape en envois aux acteurs d'Écho ('scene', 'public', 'ministre', 'figurants' ; voir acteursEcho()).
 * Comme au prototype, la dernière commande d'un acteur l'emporte ; l'écran scène suit `params.sortie` (la page du mur
 * suit, elle, la commande `ecran`) ; le vote et l'audio deviennent des réglages de l'écran `mur`.
 *
 * | commande du prototype           | envois                                                                          |
 * |---------------------------------|---------------------------------------------------------------------------------|
 * | tel.cmd video / scene           | public/regardez {texte}                                                         |
 * | tel.cmd flux / choix / phrases  | public/video {asset, puis:'choix'} · public/choix · public/phrases              |
 * | tel.cmd notif                   | public/notification + fx vibrer                                                 |
 * | ecran qr / mur / noir           | scene/accueil-qr · scene/mur · scene/noir                                       |
 * | vote.cmd ouvrir n               | scene/mur {vote:'ouvert', numero} · public/vote {numero} · ministre/vote-compteur {numero} |
 * | vote.cmd reveler                | scene/mur {vote:'revele'} · public/regardez · ministre/vote-compteur {revele}   |
 * | vote.cmd fermer                 | scene/mur {vote:'ferme'} (si le mur est montré) · ministre/veille               |
 * | junon lancer                    | scene/mur {audio, commentaires:'junon'} · figurants {segment:'junon'} · public/regardez |
 * | junon president                 | scene/mur {audio} · public/image-onde                                           |
 * | junon arreter                   | scene {audio: null}                                                             |
 * | sortie 'accueil-qr', 'noir'…    | scene/<type>                                                                    |
 * | sortie page …/chat, …/flux, …/visio | scene/mur · scene/flux-video · scene/visio {postes, son}                    |
 */
export function commandesVersEnvois(cmds: unknown, sortie?: unknown): Envoi[] {
  const liste = Array.isArray(cmds) ? cmds.filter(estObjet) : [];
  let pub: Envoi | undefined;
  let ministre: Envoi | undefined;
  let figurants: Envoi | undefined;
  let ecranCmd: string | undefined;
  let vote: { vote: 'ouvert' | 'revele' | 'ferme'; numero?: number } | undefined;
  let audio: Record<string, unknown> | undefined;

  for (const c of liste) {
    if (c.t === 'tel.cmd') {
      const m = TEL_CMD[String(c.mode)];
      if (m) pub = { vers: 'public', ...m, ...(m.params ? { params: { ...m.params } } : {}) };
    } else if (c.t === 'ecran') {
      const e = ECRAN_CMD[String(c.mode)];
      if (e) ecranCmd = e;
    } else if (c.t === 'vote.cmd') {
      if (c.cmd === 'ouvrir') {
        const numero = typeof c.numero === 'number' && Number.isFinite(c.numero) ? c.numero : Number(c.numero);
        const n = Number.isFinite(numero) ? { numero } : {};
        vote = { vote: 'ouvert', ...n };
        pub = { vers: 'public', ecran: 'vote', params: { ...n } };
        ministre = { vers: 'ministre', ecran: 'vote-compteur', params: { ...n } };
      } else if (c.cmd === 'reveler') {
        vote = { vote: 'revele', ...(vote?.numero !== undefined ? { numero: vote.numero } : {}) };
        pub = { vers: 'public', ecran: 'regardez', params: { texte: 'Résultat à l’écran' } };
        ministre = { vers: 'ministre', ecran: 'vote-compteur', params: { revele: true } };
      } else if (c.cmd === 'fermer') {
        vote = { vote: 'ferme' };
        ministre = { vers: 'ministre', ecran: 'veille' };
      }
    } else if (c.t === 'junon') {
      if (c.cmd === 'lancer') {
        audio = { audio: 'junon_discours.mp3', commentaires: 'junon' };
        figurants = { vers: 'figurants', ecran: 'figurants.cmd', params: { segment: 'junon' } };
        pub = { vers: 'public', ecran: 'regardez', params: { texte: 'Regardez la scène' } };
      } else if (c.cmd === 'president') {
        audio = { audio: 'president_boilot_speech.mp3' };
        pub = { vers: 'public', ecran: 'image-onde' };
      } else if (c.cmd === 'arreter') audio = { audio: null };
    }
  }

  // Écran scène : la sortie l'emporte, sauf la page du mur qui suit la commande `ecran` ; sinon la commande `ecran` ;
  // sinon un vote ouvert ou révélé, ou un audio, se montrent sur le mur.
  const deSortie = sceneDepuisSortie(sortie);
  let scene: { ecran: string; params: Record<string, unknown> } | undefined;
  if (deSortie && deSortie.ecran !== 'mur') scene = deSortie;
  else if (ecranCmd) scene = { ecran: ecranCmd, params: {} };
  else if (deSortie) scene = deSortie;
  else if ((vote && vote.vote !== 'ferme') || audio) scene = { ecran: 'mur', params: {} };
  if (scene && scene.ecran === 'mur' && vote) scene.params = { ...scene.params, ...vote };
  if (scene && audio) scene.params = { ...scene.params, ...audio };

  const out: Envoi[] = [];
  if (scene) out.push(Object.keys(scene.params).length ? { vers: 'scene', ecran: scene.ecran, params: scene.params } : { vers: 'scene', ecran: scene.ecran });
  for (const e of [pub, ministre, figurants]) if (e) out.push(e);
  return out;
}

/** Envois d'une étape du prototype : ses `envois` s'il y en a, sinon la conversion de `params.cmds` et `params.sortie`. */
export function envoisDeCompatibilite(etape: Pick<Etape, 'envois' | 'params'>): Envoi[] {
  if (Array.isArray(etape.envois) && etape.envois.length) return etape.envois;
  return commandesVersEnvois(etape.params?.cmds, etape.params?.sortie);
}
