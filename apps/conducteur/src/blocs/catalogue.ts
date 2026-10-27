// Catalogue des blocs : port fidèle de studio-real/blocs.js (familles, réglages, ports, aperçus) et des étapes de base
// de conducteur-core.js (CK), plus les 10 blocs de conception/conducteur/etude-10-blocs.md et les 2 blocs figurants
// de docs/etudes/figurants-ia.md §8.4. Codes, choix des rotatifs et sorties nommées viennent du moteur (blocs-moteur.ts).
import {
  AFFICHAGES_CHRONO, CIBLES_MACHINE, DENSITES_FIGURANTS, DESTINATAIRES_MESSAGE, HUMEURS_FIGURANTS, RECONNAISSANCES_MOT,
  RESTAURATIONS_REPRISE, SOURCES_SIGNAL, indexChoix, TY_BOUCLE, TY_CHRONO, TY_COMEDIEN_DIT, TY_FIGURANTS, TY_GARDE, TY_MACHINE,
  TY_MEMOIRE, TY_MESSAGE, TY_REPRISE, TY_SEQUENCE, TY_SIGNAL, TY_TIRAGE,
} from '@studio-real/modele';
import { fm } from './dessin';
import { COULEURS_FAMILLES, versClair } from './palette';
import type { Catalogue, CouleurTheme, DefBloc, Famille, IdFamille, Port, Reglage, TypePort } from './types';

const coul = (hex: string): CouleurTheme => ({ sombre: hex, clair: versClair(hex) });

/** Familles, dans l'ordre de la bibliothèque du design (GRP). Glyphes : FAM de blocs.js. */
export const FAMILLES: Famille[] = [
  { id: 'deroule', nom: 'Le déroulé', description: 'les étapes de base du spectacle', ref: 'DR', icone: 'M4 6h16M4 12h10M4 18h13', couleur: coul(COULEURS_FAMILLES.deroule) },
  { id: 'trig', nom: 'Quand', description: 'ce qui déclenche une action', ref: 'FA—01', icone: 'M13 2 4 14h7l-1 8 9-12h-7z', couleur: coul(COULEURS_FAMILLES.trig) },
  { id: 'flow', nom: 'Comment', description: 'aiguillages, attentes, tirages', ref: 'FA—02', icone: 'M12 3l9 9-9 9-9-9z', couleur: coul(COULEURS_FAMILLES.flow) },
  { id: 'data', nom: 'Combien', description: 'votes, comptes, scores', ref: 'FA—03', icone: 'M5 20v-8M10 20V5M15 20v-6M20 20V9', couleur: coul(COULEURS_FAMILLES.data) },
  { id: 'cible', nom: 'Qui', description: 'quelle partie du public', ref: 'FA—04', icone: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 21c.8-4 3.6-6 7-6s6.2 2 7 6', couleur: coul(COULEURS_FAMILLES.cible) },
  { id: 'fx', nom: 'Effets téléphone', description: 'lumière, vibration, son', ref: 'FA—05', icone: 'M2 12h4l3-7 4 14 3-9 2 2h4', couleur: coul(COULEURS_FAMILLES.fx) },
  { id: 'ui', nom: 'Écrans du public', description: 'ce que voit le téléphone', ref: 'FA—06', icone: 'M8 2h8v20H8zM11 18h2', couleur: coul(COULEURS_FAMILLES.ui) },
  { id: 'scene', nom: 'Scène et régie', description: 'écran, streamer, console', ref: 'FA—07', icone: 'M3 8h11v8H3zM14 11l7-3v8l-7-3', couleur: coul(COULEURS_FAMILLES.scene) },
  { id: 'gate', nom: 'Points d’arrêt', description: 'attendre une décision humaine', ref: 'FA—08', icone: 'M9 2h6v20H9zM11 6h2v2h-2zM11 11h2v2h-2zM11 16h2v2h-2z', couleur: coul(COULEURS_FAMILLES.gate) },
];

/** Ports au format court du design : 'exec:' , 'num:votes'… */
const ports = (a: string[]): Port[] => a.map((s) => {
  const i = s.indexOf(':');
  return { type: s.slice(0, i) as TypePort, nom: s.slice(i + 1) };
});

/** Réglage au format du design : [nom, défaut 0→1, min, max, unité, décimales]. */
type ReglageCourt = [string, number, number, number, string, number, (string[] | 'infini' | 'temps')?];
const reglages = (a: ReglageCourt[]): Reglage[] => a.map(([nom, d, min, max, unite, decimales, choix]) => {
  const r: Reglage = { nom, defaut: Math.round(d * 100), min, max, unite, decimales };
  if (choix === 'infini') r.infiniAuMax = true;
  else if (choix === 'temps') r.temps = true;
  else if (choix) r.choix = choix;
  return r;
});

const BLOCS: DefBloc[] = [];

/** Étape de base du déroulé (CK de conducteur-core.js). */
function K(ty: string, nom: string, cle: string, apercu: string, hex: string, description: string, sets: ReglageCourt[]) {
  BLOCS.push({
    ty, nom, cle, apercu, description, base: true,
    famille: ty === 'k:issue' ? 'flow' : 'deroule',
    couleur: coul(hex), reglages: reglages(sets), entrees: ports(['exec:']), sorties: ports(['exec:']),
  });
}
const ST = (a: number, b: number): ReglageCourt[] => [['intensité', a, 0, 100, ' %', 0], ['fondu', b, 0, 10, ' s', 1]];

K('k:attente', 'attente du public', 'ATTENTE', 'k:attente', '#b9cfd8', 'On attend la salle. L’étape se termine dès qu’une condition de sortie est remplie.', ST(.4, .3));
K('k:calage', 'calage salle', 'CALAGE', 'k:calage', '#d9a486', 'Dernier calage son et lumière. On passe quand la salle s’est calmée.', ST(.5, .4));
K('k:scene', 'scène jouée', 'SCÈNE', 'k:scene', '#d47a5c', 'Les comédiens jouent. La suite part à la fin de la durée prévue ou au top.', ST(.7, .4));
K('k:son', 'son en salle', 'SON', 'k:son', '#e59578', 'Lecture d’une piste sur la sono de la salle.', [['volume', .75, 0, 100, ' %', 0], ['fondu', .3, 0, 10, ' s', 1]]);
K('k:lum', 'lumière', 'LUMIÈRE', 'k:lumiere', '#f0b49b', 'Conduite lumière vers l’intensité choisie, avec un temps de montée.', [['intensité', .6, 0, 100, ' %', 0], ['montée', .4, 0, 10, ' s', 1]]);
K('k:fondu', 'fondu', 'FONDU', 'k:fondu', '#8fa5ad', 'Fondu enchaîné entre deux états du plateau.', ST(.1, .6));
K('k:passage', 'liaison', 'LIAISON', 'k:passage', '#8fa5ad', 'Étape de liaison, sans action propre.', ST(.3, .5));
K('k:issue', 'issue', 'ISSUE', 'k:issue', '#78b08f', 'Une des issues possibles. Elle est jouée si le public la choisit.', ST(.7, .4));

/** Bloc du canvas (S de blocs.js). */
function S(ty: string, famille: IdFamille, nom: string, cle: string, ins: string[], outs: string[], sets: ReglageCourt[], apercu: string, description: string) {
  BLOCS.push({
    ty, famille, nom, cle, apercu, description,
    couleur: coul(COULEURS_FAMILLES[famille]), reglages: reglages(sets), entrees: ports(ins), sorties: ports(outs),
  });
}

// ── les 35 blocs du canvas (blocs.js ; segment, sous-graphe et gates de la vue macro exclus comme dans le design) ──
S('b1', 'trig', 'au démarrage du segment', 'SG—04', [], ['exec:'], [['délai', 0, 0, 10, ' s', 1]], 'start', 'Se déclenche à l’entrée dans le segment, avant tout autre top.');
S('b2', 'trig', 'à +t', '+80 S', [], ['exec:'], [['décalage', .53, 0, 150, ' s', 0]], 'timer', 'Un top minuté après l’entrée dans le segment.');
S('b3', 'trig', 'vote reçu', '121', [], ['exec:', 'num:votes', 'cible:votant'], [['regrouper', .2, 0, 5, ' s', 1]], 'vote', 'Chaque vote reçu ; en répétition les bots en envoient des dizaines par seconde (agrégés ×N sur le fil).');
S('b4', 'trig', 'texte reçu', 'CHAT', [], ['exec:', 'txt:message', 'cible:auteur'], [['tampon', .4, 0, 5, ' s', 1]], 'text', 'Le dernier message validé par la modération.');
S('b5', 'trig', 'secousse', 'ÉNERGIE', [], ['exec:', 'num:énergie'], [['seuil', .35, 0, 1, '', 1]], 'seismo', 'L’énergie des accéléromètres de la salle, en direct.');
S('b6', 'trig', 'bouton régie', 'F1', [], ['exec:'], [['garde', .2, 0, 5, ' s', 1]], 'btn', 'Un bouton de la régie lié à ce bloc ; clic sur l’aperçu pour l’essayer.');
S('b7', 'trig', 'osc reçu', 'UDP 53000', [], ['exec:', 'num:valeur'], [['lissage', .2, 0, 1, '', 1]], 'osc', 'Un message OSC ou MIDI venu de la console son ou lumière.');
S('b8', 'trig', 'joueur rejoint', '+3 · −1', [], ['exec:', 'cible:joueur'], [], 'join', 'Un joueur arrive, revient ou part.');
S('f1', 'flow', 'selon', '3 CAS', ['exec:', 'txt:valeur'], ['exec:boulangerie', 'exec:toit', 'exec:métro'], [], 'switch', 'L’aiguillage : la branche active s’éclaire en direct.');
S('f2', 'flow', 'attendre', '3,0 S', ['exec:'], ['exec:'], [['durée', .3, 0, 10, ' s', 1]], 'wait', 'Latent : le fil sortant reste tireté tant que le bloc attend.');
S('f3', 'flow', 'aléatoire pondéré', '3 POIDS', ['exec:'], ['exec:a', 'exec:b', 'exec:c'], [['graine', .42, 0, 99, '', 0]], 'wheel', 'Un tirage par poids ; l’aiguille s’arrête sur le résultat.');
S('f4', 'flow', 'compteur', 'PAS 1', ['exec:', 'exec:remise'], ['exec:', 'num:compte'], [['pas', 0, 1, 10, '', 0]], 'counter', 'Compte les passages.');
S('f5', 'flow', 'attendre que', '> 600', ['exec:', 'bool:condition'], ['exec:'], [['au plus', .5, 0, 120, ' s', 0]], 'waituntil', 'Attend qu’une condition soit vraie, au plus N secondes.');
S('f6', 'flow', 'porte', 'FERMÉE', ['exec:', 'exec:ouvrir', 'exec:fermer'], ['exec:'], [], 'lock', 'Laisse passer ou retient le flux.');
S('d1', 'data', 'agréger', 'GAGNANT', ['exec:', 'num:votes'], ['num:total', 'txt:gagnant'], [['fenêtre', .5, 0, 30, ' s', 0]], 'histo', 'Histogramme des votes ; la plus haute barre est couronnée.');
S('d2', 'data', 'variable', 'JAUGE_SALLE', ['num:valeur'], ['num:valeur', 'bool:> 600'], [['amorti', .4, 0, 1, '', 1]], 'var', 'Une valeur du spectacle et son historique.');
S('d3', 'data', 'tirer au sort', 'N = 3', ['exec:', 'cible:parmi'], ['exec:', 'cible:élus'], [['nombre', .18, 1, 12, '', 0]], 'slot', 'Tire N joueurs : les avatars défilent puis se figent.');
S('d4', 'data', 'classement', 'TOP 3', ['equipe:équipes', 'num:score'], ['txt:premier'], [], 'podium', 'Le podium des équipes.');
S('c1', 'cible', 'cible', '17', [], ['cible:joueurs'], [], 'cible', 'a_voté:"A" - rôle:superviseur');
S('c2', 'cible', 'équipes', '4 ÉQ.', [], ['equipe:équipes'], [], 'teams', 'Couleur + emblème + effectif ; capitaine marqué.');
S('c3', 'cible', 'zone / siège', 'RANGS C–F', [], ['cible:zone'], [['rayon', .4, 0, 1, '', 1]], 'seats', 'Le plan de salle ; les zones ciblées s’allument.');
S('c4', 'cible', 'sans réponse', '17', [], ['cible:retardataires'], [], 'noresp', 'Ceux qui n’ont pas encore voté.');
S('x1', 'fx', 'couleur', '#7D5BD6', ['exec:', 'cible:qui'], ['exec:'], [['durée', .25, 0, 20, ' s', 1]], 'color', 'Allume les téléphones ciblés d’une couleur pleine.');
S('x2', 'fx', 'vague', 'G → D', ['exec:', 'cible:qui'], ['exec:'], [['vitesse', .5, 0, 4, ' s', 1]], 'wave', 'Un front de couleur traverse les rangs.');
S('x3', 'fx', 'stroboscope', 'HZ', ['exec:', 'cible:qui'], ['exec:'], [['fréquence', .8, 0, 5, ' Hz', 1]], 'strobe', 'Limité à 3 Hz (photosensibilité) : au-delà, refusé.');
S('x4', 'fx', 'vibrer', 'BATTEMENT', ['exec:', 'cible:qui'], ['exec:'], [['intensité', .7, 0, 1, '', 1]], 'vibe', 'Le motif en créneaux ; repli iPhone : flash + clic.');
S('x5', 'fx', 'son', 'CLOCHE.WAV', ['exec:', 'cible:qui', 'media:fichier'], ['exec:'], [['volume', .75, 0, 1, '', 1]], 'sound', 'Joue un son sur les téléphones ciblés.');
S('x6', 'fx', 'message privé', 'SCELLÉ', ['exec:', 'cible:qui', 'txt:texte'], ['exec:'], [], 'msg', 'Le bandeau tel que le joueur le verra.');
S('u1', 'ui', 'vote / choix', '3 OPTIONS', ['exec:', 'cible:qui'], ['exec:', 'num:votes'], [['chrono', .6, 0, 150, ' s', 0]], 'vote_ui', '« Où doit-il aller ? » — barres de résultat en direct.');
S('u2', 'ui', 'réactions', '8 EMOJIS', ['exec:'], ['num:intensité'], [['combo', .5, 0, 1, '', 1]], 'react', 'Grille d’emojis maison ; jauge collective.');
S('u3', 'ui', 'afficher écran', 'CLAVIER', ['exec:', 'cible:qui'], ['exec:'], [], 'screen', 'Pousse un écran type sur les téléphones.');
S('s1', 'scene', 'écran scène : animer', 'POPS', ['exec:', 'txt:texte'], [], [['densité', .5, 0, 1, '', 1]], 'stage', 'Le style de l’écran de scène joue en boucle.');
S('s2', 'scene', 'streamer : consigne', 'MILO', ['exec:', 'txt:consigne'], ['exec:reçu'], [], 'stream', 'Consigne envoyée au streamer ; ambre tant que non reçue.');
S('s3', 'scene', 'envoyer osc', '/LX/12', ['exec:', 'num:valeur'], [], [['échelle', .5, 0, 1, '', 1]], 'oscout', 'Une façade de console miniature.');
S('g1', 'gate', 'point d’arrêt', 'ARMÉ', ['exec:', 'num:quorum'], ['exec:passage', 'exec:avertir'], [['délai max', .6, 0, 150, ' s', 0]], 'gate', 'gate_porte : la règle de passage se lit en une phrase.');

/** Codes des 10 blocs de l'étude : tous ont leur comportement dans le moteur (`blocs-moteur.ts`, chantier MODÈLE). */
export const TY_NOUVEAUX = {
  garde: TY_GARDE,
  memoire: TY_MEMOIRE,
  tirage: TY_TIRAGE,
  signal: TY_SIGNAL,
  machine: TY_MACHINE,
  boucle: TY_BOUCLE,
  sequence: TY_SEQUENCE,
  message: TY_MESSAGE,
  chrono: TY_CHRONO,
  reprise: TY_REPRISE,
} as const;

/** Codes des blocs de l'étude des figurants IA (docs/etudes/figurants-ia.md §8.4), eux aussi dans le moteur. */
export const TY_FIGURANTS_IA = {
  figurants: TY_FIGURANTS,
  comedienDit: TY_COMEDIEN_DIT,
} as const;

/** Bloc nouveau (absent du design d'origine). */
function N(ty: string, famille: IdFamille, nom: string, cle: string, outs: string[], sets: ReglageCourt[], description: string, siProbleme: string, origine = 'étude des 10 blocs') {
  BLOCS.push({
    ty, famille, nom, cle, apercu: ty, description, siProbleme, nouveau: true, origine,
    couleur: coul(COULEURS_FAMILLES[famille]), reglages: reglages(sets), entrees: ports(['exec:']), sorties: ports(outs),
  });
}
const liste = (l: readonly string[]): string[] => [...l];

// ── les 10 blocs de etude-10-blocs.md (dans l'ordre de fabrication proposé) ──
N(TY_NOUVEAUX.garde, 'flow', 'garde-fou de temps', 'DÉLAI', ['exec:condition remplie', 'exec:délai dépassé'],
  [['délai max', (90 - 5) / 595, 5, 600, ' s', 0, 'temps'], ['à l’échéance', 0, 0, 1, '', 0, ['continuer', 'demander le top']]],
  'Une sortie de secours datée : si la condition n’est pas remplie à temps, on passe quand même.',
  'À l’échéance : sortie « délai dépassé » et note automatique dans la piste Sécurité.');
N(TY_NOUVEAUX.memoire, 'data', 'mémoire de spectacle', 'FUITE', ['exec:', 'num:valeur'],
  [['opération', 0, 0, 2, '', 0, ['poser', 'ajouter', 'remettre à zéro']], ['valeur', .01, 0, 100, '', 0]],
  'Une variable nommée qui traverse les moments : compteur, drapeau, score, dernier choix. Lisible depuis toute condition (« mem:fuite »).',
  'Une mémoire non définie vaut 0 / non, jamais une erreur.');
N(TY_NOUVEAUX.machine, 'scene', 'commande machine', 'GO', ['exec:confirmé', 'exec:sans réponse'],
  [['cible', .34, 0, 3, '', 0, liste(CIBLES_MACHINE)], ['attente accusé', (2 - .5) / 9.5, .5, 10, ' s', 1]],
  'Envoie une cue lumière, un GO QLab, une lecture vidéo ou un volume, et attend l’accusé de réception.',
  'Sans réponse : bandeau Sécurité « la console ne répond pas » et sortie dédiée.');
N(TY_NOUVEAUX.signal, 'trig', 'écoute d’un signal', 'OSC', ['exec:reçu', 'num:réceptions'],
  [['source', 0, 0, 3, '', 0, liste(SOURCES_SIGNAL)], ['reçu N fois', 0, 1, 20, '', 0]],
  'Attend un signal extérieur : pédale du comédien, note MIDI, message OSC de QLab, touche régie, capteur de porte.',
  'Signal absent : le bloc reste en attente ; à combiner avec le garde-fou de temps.');
N(TY_NOUVEAUX.chrono, 'ui', 'chrono visible', '00:20', ['exec:zéro', 'exec:10 s restantes'],
  [['durée', (20 - 5) / 115, 5, 120, ' s', 0, 'temps'], ['affichage', 1, 0, 2, '', 0, liste(AFFICHAGES_CHRONO)]],
  'Le compte à rebours que le public voit : voter, s’asseoir, allumer son téléphone.',
  'Si les téléphones décrochent, l’écran de scène prend le relais automatiquement.');
N(TY_NOUVEAUX.tirage, 'flow', 'tirage au sort', '3 ISSUES', ['exec:a', 'exec:b', 'exec:c'],
  [['sorties', .25, 2, 6, '', 0], ['mode', 0, 0, 1, '', 0, ['graine fixe', 'aléa vrai']]],
  'Égalité de vote, choix d’un spectateur, ordre d’une scène : rejouable en répétition, vraiment aléatoire en scène.',
  'Poids à 0 partout : sortie 1.');
N(TY_NOUVEAUX.boucle, 'flow', 'boucle', '3 TOURS', ['exec:encore', 'exec:terminé'],
  [['tours', .11, 1, 20, '', 0, 'infini'], ['arrêt', 0, 0, 4, '', 0, ['aucun', 'votes', 'téléphones prêts', 'silence', 'public assis']]],
  'Rejouer une suite d’étapes N fois, ou jusqu’à ce qu’un signal de la salle soit atteint.',
  'Borne dure de 50 tours, même réglée sur ∞ (rotatif en butée), avec note Sécurité.');
N(TY_NOUVEAUX.message, 'cible', 'message à une personne', 'MILO', ['exec:lu', 'exec:non lu'],
  [['destinataire', 0, 0, 3, '', 0, liste(DESTINATAIRES_MESSAGE)], ['délai non lu', (30 - 5) / 115, 5, 120, ' s', 0, 'temps']],
  'Une consigne individuelle à un rôle précis (streamer, comédien, régisseur) avec accusé de lecture.',
  'Non lu : sortie dédiée et bandeau « Milo n’a pas lu la consigne ».');
N(TY_NOUVEAUX.reprise, 'gate', 'point de reprise', 'SÛR', ['exec:'],
  [['restaure', 0, 0, 3, '', 0, liste(RESTAURATIONS_REPRISE)]],
  'Un endroit sûr d’où reprendre le spectacle avec le bon état (mémoires, lumière, écrans publics). Ne dure pas.',
  'Reprise impossible (état incomplet) : le pupitre propose le point de reprise précédent.');
N(TY_NOUVEAUX.sequence, 'deroule', 'séquence réutilisable', 'NOIR', ['exec:fin'],
  [['durée globale', (100 - 50) / 150, 50, 200, ' %', 0], ['intensité', 1, 0, 100, ' %', 0]],
  'Un sous-déroulé nommé (« noir salle + voix off + lumière lente »), instancié comme un bloc, modifié à un seul endroit.',
  'Séquence supprimée : bloc en pointillés rouges, sortie directe.');

// ── les blocs de l'étude des figurants IA (docs/etudes/figurants-ia.md §8.4) ──
N(TY_FIGURANTS_IA.figurants, 'scene', 'figurants', 'CHAT', ['exec:fini'],
  [['densité', .5, 0, 4, '', 0, liste(DENSITES_FIGURANTS)], ['humeur', 0, 0, 4, '', 0, liste(HUMEURS_FIGURANTS)]],
  'Règle les figurants du chat : densité (silence → folie), humeur, et souffle une intention à quelques personas (mode souffleur). La régie relaie la commande au service figurants.',
  'Service figurants muet : le serveur joue la banque de secours ; « fini » part quand même à la fin de la durée prévue.', 'étude figurants IA');
N(TY_FIGURANTS_IA.comedienDit, 'trig', 'quand le comédien dit', 'MOT-CLÉ', ['exec:dit', 'exec:pas dit'],
  [['écoute', (120 - 5) / 595, 5, 600, ' s', 0, 'temps'], ['reconnaissance', 0, 0, 1, '', 0, liste(RECONNAISSANCES_MOT)]],
  'Écoute la transcription du comédien : un mot-clé entendu (« religieuse ») déclenche la suite ; une sortie nommée d’après un mot-clé l’emporte pour ce mot.',
  'Transcription muette : le bloc attend, « pas dit » au délai ; le top régie vaut le mot-clé.', 'étude figurants IA');

/** Glyphes propres aux étapes de base et aux blocs de l'étude (les autres prennent celui de leur famille). */
const ICONES: Record<string, string> = {
  'k:attente': 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 21c.8-4 3.6-6 7-6s6.2 2 7 6',
  'k:calage': 'M4 20v-4M8 20v-7M12 20V9M16 20v-5M20 20v-9',
  'k:scene': 'M3 5h18v14H3zM3 9h18M8 5v4M16 5v4',
  'k:son': 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  'k:lum': 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z',
  'k:fondu': 'M3 17c4 0 5-10 9-10s5 10 9 10',
  'k:passage': 'M3 12h16M14 6l6 6-6 6',
  'k:issue': 'M12 3l9 9-9 9-9-9zM12 8v5M12 16v.5',
  'g:garde': 'M12 8v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  'm:memoire': 'M4 6h16v12H4zM8 10v4M11 10v4M16 10v4',
  'f:tirage': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v9l6.4 6.4M12 12H3',
  'q:signal': 'M2 13h5l2-6 3 11 2-5h8',
  's:machine': 'M3 5h18v14H3zM7 10l3 2-3 2M12 15h5',
  'f:boucle': 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
  'd:sequence': 'M2 8h6v8H2zM16 8h6v8h-6zM8 12h8M11 9l2 3-2 3',
  'c:message': 'M4 5h16v11H9l-5 4zM8 10h8',
  'u:chrono': 'M12 9v4l3 2M9 2h6M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
  'p:reprise': 'M5 21V4M5 4h14l-3 4 3 4H5',
  'x:figurants': 'M3 5h12v8H8l-4 3v-3H3zM17 9h4v8h-1v3l-3-3h-5v-2',
  'q:comedien-dit': 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4',
};
BLOCS.forEach((b) => { if (ICONES[b.ty]) b.icone = ICONES[b.ty]; });

const PAR_TY = new Map(BLOCS.map((b) => [b.ty, b]));

/** Le catalogue complet : familles et blocs (8 étapes de base + 35 blocs du design + 10 blocs de l'étude + 2 blocs figurants). */
export const CATALOGUE: Catalogue = { familles: FAMILLES, blocs: BLOCS };

/** Définition d'un bloc par son code, ou `undefined`. */
export const trouverBloc = (ty: string): DefBloc | undefined => PAR_TY.get(ty);

export const trouverFamille = (id: string): Famille | undefined => FAMILLES.find((f) => f.id === id);

/** Valeur réelle d'un réglage pour une position de rotatif 0 → 100 (index du choix pour un réglage à choix). */
export function valeurReglage(r: Reglage, position: number): number {
  const p = Math.max(0, Math.min(100, position));
  if (r.choix) return r.min + indexChoix(r.choix.length, p);
  if (r.infiniAuMax) return p >= 100 ? Infinity : r.min + Math.round(p / 100 * (r.max - r.min));
  return r.min + p / 100 * (r.max - r.min);
}

/** Valeur affichée d'un réglage (port de `fmt` du design ; « 3,0 s », « 45 % », « ∞ », ou le choix en clair). */
export function formaterReglage(r: Reglage, position: number): string {
  if (r.choix) return r.choix[indexChoix(r.choix.length, position)] ?? '';
  const n = valeurReglage(r, position);
  if (!Number.isFinite(n)) return '∞';
  if (r.temps) return fm(Math.round(n));
  const s = r.decimales ? n.toFixed(Math.min(1, r.decimales)) : String(Math.round(n));
  return s.replace('.', ',') + r.unite;
}

/** Sorties d'exécution du bloc : ce sont les sorties de l'étape sur la planche (nom '' = la suite). */
export const sortiesExec = (b: DefBloc): Port[] => b.sorties.filter((p) => p.type === 'exec');

/** Rotatifs par défaut d'une nouvelle étape de ce bloc : [durée codée, réglage 1, réglage 2]. */
export function rotatifsParDefaut(b: DefBloc, dureeS = 58): number[] {
  return [Math.max(0, Math.round((dureeS - 10) / 6)), b.reglages[0]?.defaut ?? 50, b.reglages[1]?.defaut ?? 50];
}
