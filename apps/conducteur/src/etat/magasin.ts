// Magasin d'état du conducteur (zustand) — chantier COQUILLE.
//
// CONTRAT (ARCHITECTURE.md, inchangé) : `projet`, `selection: { moment?, etape? }`, `mode`, `lecture`, `enLecture`,
// `zoomPlanche`, `zoomConduite`, `theme` et les actions `selectionner`, `modifierProjet(fn)`, `changerMode`, `lancer`,
// `pause`, `top`, `allerA`, `zoomerPlanche`, `zoomerConduite`, `basculerTheme`. CONDUITE et PLANCHE n'utilisent que ça.
//
// Ajouts (tous facultatifs pour les autres chantiers) : sélection étendue (sortie, passage, acte, piste, clip, note),
// annuler / rétablir, vitesse de lecture, salle simulée, modes RÉPÉTITION / SPECTACLE (l'ancien verrou « scène »),
// GO unique (`go`), versions locales, export / import JSON, messages à la régie. La lecture passe par src/etat/moteur.ts (moteur du chantier MODÈLE, ou provisoire).
// Pupitre de la régie (chantier INTÉGRATION) : `poserMemoire`, `envoyerSignal`, `reprendreAuPoint` (entrées extérieures
// du moteur) et `journalRegie` (commandes émises par les blocs, entrées reçues, alertes ; voir src/etat/regie.ts).
// Serveur de spectacle (src/etat/spectacle.ts) : `surConduiteLocale` annonce chaque geste de conduite (GO et le nombre
// de tops qu'il a joués, saut, mémoire, signal, reprise) pour qu'il parte en `conduite` ; `resynchroniser(etat)` cale
// le lecteur local, devenu MIROIR, sur l'état officiel reçu du serveur (`lecture`).
import { create } from 'zustand';
import {
  exempleDemo,
  type CategorieAssets, type EtatLecture, type Execution, type Lecteur, type Projet, type SalleSimulee, type Signaux,
} from '@studio-real/modele';
import { creerLecteur, signauxSalle } from './moteur';
import { ASSETS_DEMO } from './assets';
import { ligneAlerte, ligneCommande, ligneEvenement, type LigneRegie, type ValeurMemoire } from './regie';
import {
  ecrireCourant, ecrireVersions, emballer, lireCourant, lireFichier, lireVersions, oublierCourant, telecharger,
  type VersionLocale,
} from './persistance';

/** Les deux modes (audit UX d'octobre 2026, §4.3, validé le 28/10) :
 *  - RÉPÉTITION (défaut à l'ouverture) : structure modifiable (le lecteur se recrée en gardant sa place), vitesses
 *    ×1 ×5 ×20, Espace = lecture / pause, T ou G = GO, caméra de la planche libre ;
 *  - SPECTACLE : structure verrouillée (l'ancien verrou SCÈNE), lecteur jamais recréé pendant un moment (les
 *    modifications reçues attendent le moment suivant), vitesse ×1 imposée, Espace = GO, Maj+Espace = lecture / pause,
 *    la caméra suit le spectacle. */
export type ModeConducteur = 'repetition' | 'spectacle';
/** Anciennes valeurs (PRÉPARER / JOUER, et avant elles Écrire / Répéter), acceptées par `changerMode` et traduites :
 *  JOUER → SPECTACLE, les autres → RÉPÉTITION. Le magasin ne les contient jamais. */
export type ModeAncien = 'preparer' | 'jouer' | 'ecrire' | 'repeter';
export const normaliserMode = (m: ModeConducteur | ModeAncien | string | null | undefined): ModeConducteur =>
  (m === 'spectacle' || m === 'jouer' ? 'spectacle' : 'repetition');
/** Migration de l'ancien état (mode PRÉPARER / JOUER + verrou SCÈNE) : le verrou SCÈNE (structure figée) devient
 *  SPECTACLE ; sans verrou, l'ancien mode est traduit par `normaliserMode`. */
export const migrerMode = (ancien: { mode?: string | null; verrou?: boolean | null } | null | undefined): ModeConducteur =>
  (ancien?.verrou ? 'spectacle' : normaliserMode(ancien?.mode));

/** Vitesses de répétition rapide (cachées en SPECTACLE, où ×1 est imposé). */
export const VITESSES_REPETITION = [1, 5, 20] as const;
/** Anti double GO : un second GO moins de 800 ms après le précédent est ignoré (règle 4.1-3). */
export const DELAI_ANTI_DOUBLE_GO_MS = 800;
/** Nombre maximal de tops forcés pour replacer un lecteur recréé au passage qu'il attendait. */
const MAX_TOPS_REPLACEMENT = 64;

/** Ce qui est choisi. `moment` + `etape` : une étape ; `moment` + `sortie` (index dans moment.tr) : une sortie ;
 *  `moment` + `passage` : le passage vers le moment suivant ; `moment` seul : le moment ; `acte` : un acte ;
 *  `piste` (+ `clip` ou `note`) : une piste de la conduite ou un de ses éléments. */
export interface Selection {
  moment?: string; etape?: string;
  sortie?: number; passage?: boolean; acte?: number;
  piste?: string; clip?: string; note?: string;
}

interface EntreeHistorique { projet: Projet; etiquette: string; t: number }

export interface Magasin {
  projet: Projet;
  selection: Selection;
  /** 'repetition' ou 'spectacle' (voir ModeConducteur ; les anciennes valeurs sont traduites par changerMode). */
  mode: ModeConducteur;
  /** État du moteur de lecture ; null tant que rien n'est lancé. */
  lecture: EtatLecture | null;
  enLecture: boolean;
  /** Zoom de la planche (1 = 100 %) et de la conduite (pixels par seconde). */
  zoomPlanche: number;
  zoomConduite: number;
  theme: 'sombre' | 'clair';

  selectionner: (s: Selection) => void;
  /** Modifie le projet par une fonction qui reçoit une copie (immutabilité simple). `etiquette` regroupe les gestes
   *  continus (rotatif, glisser) en une seule entrée d'annulation s'ils se suivent à moins de 0,9 s. */
  modifierProjet: (fn: (p: Projet) => void, etiquette?: string) => void;
  changerMode: (m: ModeConducteur | ModeAncien) => void;
  lancer: () => void;
  pause: () => void;
  /** GO : « le cue suivant, maintenant » (règle 4.1-2). Si un passage attend, il est franchi ; sinon, si l'étape en
   *  cours mène à un passage « go » (cas d'Écho), l'étape est terminée de force PUIS le passage franchi, dans la même
   *  action ; si la lecture était arrêtée, elle repart. Un appui = un cue ; rien n'est armé pour plus tard ; un second
   *  GO moins de DELAI_ANTI_DOUBLE_GO_MS après le précédent est ignoré. Partagé par le TAP, les GO de l'en-tête, du
   *  pupitre et du panneau, Espace (SPECTACLE) et T / G. */
  go: () => void;
  /** Ancien nom de `go` (contrat ARCHITECTURE.md) : même action. */
  top: () => void;
  /** Instant (Date.now()) du dernier GO accepté : le bouton affiche « GO ✓ » pendant l'anti-rebond. */
  dernierGo: number;
  allerA: (moment: string, etape?: string) => void;
  zoomerPlanche: (z: number) => void;
  zoomerConduite: (z: number) => void;
  basculerTheme: () => void;

  // ── ajouts COQUILLE ──
  /** Demande à la planche de cadrer un moment (double-clic sur la conduite, recherche) ; `n` change à chaque demande. */
  cadrage: { moment: string; n: number } | null;
  cadrerMoment: (moment: string) => void;
  vitesse: number;
  changerVitesse: (v: number) => void;
  basculerLecture: () => void;
  revenirAuDebut: () => void;
  reglerSalle: (k: keyof SalleSimulee, v: number) => void;
  /** Signaux de la salle à l'instant (salle simulée, ou la source branchée par brancherSignaux : émulateur). */
  signaux: () => Signaux;

  assets: CategorieAssets[];
  executions: Execution[];

  passe: EntreeHistorique[];
  futur: Projet[];
  annuler: () => void;
  retablir: () => void;

  /** Lecture seule : vrai en SPECTACLE (structure verrouillée). Gardé pour le code qui lisait l'ancien verrou SCÈNE. */
  verrou: boolean;
  /** Ancien bouton SCÈNE : bascule entre RÉPÉTITION et SPECTACLE. */
  basculerVerrou: () => void;
  /** SPECTACLE : modifications reçues (salle collaborative) pas encore vues par le lecteur ; elles seront appliquées
   *  à l'entrée du prochain moment. Toujours 0 en RÉPÉTITION. */
  modificationsEnAttente: number;
  /** Fin d'une vidéo jouée une seule fois sur la sortie : signal 'video.fin' au moteur, toujours transmis (même
   *  pendant une attente du top ou une pause), sauf quand le spectacle est terminé. */
  recevoirFinVideo: (asset: string) => void;

  message: string;
  signaler: (m: string) => void;

  versions: VersionLocale[];
  enregistrerVersion: () => void;
  ouvrirVersion: (i: number) => void;
  supprimerVersion: (i: number) => void;
  exporter: () => void;
  importer: (texte: string) => void;
  revenirDemo: () => void;
  /** Projet venu de la salle collaborative (sans annulation possible, verrou ignoré). */
  remplacerProjetDistant: (p: Projet, o?: { premier?: boolean }) => void;

  // ── pupitre de la régie : entrées extérieures du moteur (Lecteur.poser / signal / reprendre) ──
  /** Pose une mémoire de spectacle (bouton « Reçu », jauge, validation des superviseurs…), lue par 'mem:<nom>'. */
  poserMemoire: (nom: string, valeur: ValeurMemoire) => void;
  /** Signal extérieur reçu (OSC, MIDI, clavier, accusé 'accuse:<étape>', lecture 'lu:<étape>', transcription…). */
  envoyerSignal: (nom: string, donnees?: unknown) => void;
  /** Reprend au point de reprise `nom` (ou au dernier passé), avec l'état mémorisé. */
  reprendreAuPoint: (nom?: string) => void;
  /** Journal de régie de la représentation en cours : commandes émises par les blocs (machine, message, chrono,
   *  figurants), entrées reçues (signaux, mémoires, reprises) et alertes ; le plus récent en dernier (300 au plus). */
  journalRegie: LigneRegie[];

  // ── lecture miroir (serveur de spectacle, src/etat/spectacle.ts) ──
  /** Cale la lecture sur l'état OFFICIEL reçu du serveur (`lecture{etat}`) : le lecteur local (même projet) se replace
   *  au même moment, à la même étape (ou au passage), avec les mêmes mémoires, et son horloge est recalée sur `etat.t`.
   *  Entre deux `lecture`, il continue d'animer la conduite à 60 i/s. Le journal de régie suit alors le serveur.
   *  Sans effet en RÉPÉTITION. */
  resynchroniser: (etat: EtatLecture) => void;
  /** Vrai depuis le premier `resynchroniser` en SPECTACLE, jusqu'au retour en RÉPÉTITION ou au début. */
  miroir: boolean;
}

/** Geste de conduite fait dans CE Conducteur (src/etat/spectacle.ts le relaie au serveur de spectacle). `go` : `tops`
 *  = nombre de `Lecteur.top()` joués par l'appui (0 : la représentation commence ou repart, 1 ou 2 : voir `go`). */
export type GesteConduite =
  | { k: 'go'; tops: number }
  | { k: 'allerA'; moment: string; etape?: string }
  | { k: 'poser'; nom: string; valeur: ValeurMemoire }
  | { k: 'signal'; nom: string; donnees?: unknown }
  | { k: 'reprendre'; nom?: string };
const ecouteursConduite = new Set<(g: GesteConduite) => void>();
/** S'abonne aux gestes de conduite de ce Conducteur ; renvoie le désabonnement. */
export function surConduiteLocale(fn: (g: GesteConduite) => void): () => void {
  ecouteursConduite.add(fn);
  return () => { ecouteursConduite.delete(fn); };
}
function annoncer(g: GesteConduite): void {
  for (const fn of [...ecouteursConduite]) {
    try { fn(g); } catch (e) { console.error('[conducteur] geste de conduite', e); }
  }
}

// ─── hors React : le lecteur, sa révision, l'exécution en cours ───────────────────────────────────────
let lecteur: Lecteur | null = null;
let revision = 0;          // change à chaque modification du projet (sauf la salle simulée)
let revisionLecteur = -1;
/** Mode et projet avec lesquels le lecteur courant a été créé (en SPECTACLE, le projet du magasin peut être plus
 *  récent : ses modifications attendent le moment suivant). */
let modeLecteur: ModeConducteur | null = null;
let projetLecteur: Projet | null = null;
/** Instant du dernier GO accepté (anti double GO). */
let instantDernierGo = -Infinity;
let decalT = 0, decalRetard = 0;   // continuité de l'horloge quand le lecteur est recréé après une modification
let execution: Execution | null = null;
let minuteurMessage: ReturnType<typeof setTimeout> | undefined;
/** Ce que le journal de régie a déjà relevé dans l'état du lecteur courant (commandes, journal, alertes). */
let vus = { c: 0, j: 0, a: 0 };
/** Idem dans l'état officiel du serveur (lecture miroir : le journal suit le serveur, pas le lecteur local). */
let vusServeur = { c: 0, j: 0, a: 0 };
let numeroRegie = 0;
/** Fait avancer la lecture de dt secondes de spectacle (posé par le magasin, appelé par la boucle). */
let avancerLecture: (dt: number) => void = () => {};

/** Source des signaux de la salle : la salle simulée des rotatifs, sauf si une autre source est branchée
 *  (src/etat/emulateur.ts : `sourceSignaux()` — téléphones émulés comptés, plus tard la salle réelle). */
export type FournisseurSignaux = (sens: SalleSimulee, tEtape: number) => Signaux;
let fournisseurSignaux: FournisseurSignaux | null = null;
/** Branche une source de signaux (null : retour à la salle simulée). */
export function brancherSignaux(f: FournisseurSignaux | null): void { fournisseurSignaux = f; }
const signauxCourants: FournisseurSignaux = (sens, tEtape) => (fournisseurSignaux ?? signauxSalle)(sens, tEtape);

const lireTheme = (): 'sombre' | 'clair' => {
  try { return localStorage.getItem('sr-conducteur-theme') === 'clair' ? 'clair' : 'sombre'; } catch { return 'sombre'; }
};
const poserTheme = (t: 'sombre' | 'clair') => {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', t === 'clair' ? 'light' : 'dark');
};

const reprise = typeof localStorage !== 'undefined' ? lireCourant() : null;
const themeInitial = lireTheme();
poserTheme(themeInitial);
const VERROU = 'SPECTACLE : la structure est verrouillée. Passe en RÉPÉTITION pour modifier.';

/** Replace un lecteur (qui vient d'entrer dans `moment` par allerA) au passage de ce moment, comme s'il avait joué
 *  ses étapes : tops forcés jusqu'à la phase 'passage' (bornés). Sert à la re-création en RÉPÉTITION quand on
 *  attendait un passage : le nouveau lecteur se replace AU PASSAGE, pas au début du moment. */
function placerAuPassage(l: Lecteur, moment: string): EtatLecture {
  let e = l.etat();
  for (let i = 0; i < MAX_TOPS_REPLACEMENT && !e.termine && e.moment === moment && e.etape !== null; i++) e = l.top();
  return e;
}

export const useMagasin = create<Magasin>((set, get) => {
  const signaler = (m: string) => {
    clearTimeout(minuteurMessage);
    set({ message: m });
    minuteurMessage = setTimeout(() => set({ message: '' }), 2800);
  };

  const lecteurAJour = () => !!lecteur && revisionLecteur === revision && modeLecteur === get().mode;

  /** Le lecteur du projet courant. En RÉPÉTITION, il est recréé quand le projet (ou le mode) a changé, à la même
   *  place : même moment, même étape, ou AU PASSAGE si l'on attendait un passage. En SPECTACLE, il n'est jamais
   *  recréé ici (règle 4.1-9) : les modifications attendent l'entrée du prochain moment (`appliquerEnAttente`), un
   *  retour au début ou un saut explicite (`forcer`). */
  const assurerLecteur = (forcer = false): Lecteur => {
    if (lecteur && lecteurAJour()) return lecteur;
    if (lecteur && !forcer && get().mode === 'spectacle') return lecteur;
    const s = get(), avant = s.lecture;
    const nouveau = creerLecteur(s.projet, { mode: s.mode === 'spectacle' ? 'scene' : 'repetition' });
    lecteur = nouveau;
    revisionLecteur = revision;
    modeLecteur = s.mode;
    projetLecteur = s.projet;
    decalT = 0; decalRetard = 0;
    const m = avant && !avant.termine ? s.projet.ev.find(x => x.id === avant.moment) : undefined;
    if (avant && m) {
      const etape = avant.etape && m.st.some(x => x.id === avant.etape) ? avant.etape : undefined;
      let e = nouveau.allerA(m.id, etape);
      // on attendait le passage de ce moment : on s'y replace (sans rejouer l'étape depuis son début)
      if (avant.etape === null && avant.phase !== 'fin') e = placerAuPassage(nouveau, m.id);
      decalT = avant.t - e.t; decalRetard = avant.retard - e.retard;
      // les mémoires de la soirée (blocs Mémoire, entrées de la régie) survivent à une modification du projet
      for (const [k, v] of Object.entries(avant.memoires ?? {})) if (e.memoires[k] !== v) nouveau.poser(k, v);
    }
    // ce que le nouveau lecteur a émis en se replaçant n'est pas nouveau pour la régie
    const e0 = nouveau.etat();
    vus = { c: e0.commandes?.length ?? 0, j: e0.journal?.length ?? 0, a: e0.alertes?.length ?? 0 };
    if (s.modificationsEnAttente) set({ modificationsEnAttente: 0 });
    return nouveau;
  };

  /** SPECTACLE : à l'entrée d'un nouveau moment, le lecteur prend les modifications en attente (il se recrée au
   *  moment et à l'étape où il vient d'entrer). Renvoie le nouvel état, ou null s'il n'y avait rien à faire. */
  const appliquerEnAttente = (momentAvant: string | null, e: EtatLecture): EtatLecture | null => {
    if (lecteurAJour() || e.termine || !e.moment || e.moment === momentAvant) return null;
    if (!get().projet.ev.some(x => x.id === e.moment)) return null;   // moment disparu : on garde l'ancien lecteur
    const n = get().modificationsEnAttente;
    const l = assurerLecteur(true);
    if (n) signaler(n + (n > 1 ? ' modifications appliquées' : ' modification appliquée') + ' à l’entrée du moment.');
    return l.etat();
  };

  /** Projet que lit le lecteur courant (celui du magasin, sauf modifications en attente en SPECTACLE). */
  const projetLu = (): Projet => projetLecteur ?? get().projet;

  /** Relève les commandes, entrées et alertes nouvelles du lecteur pour le journal de régie (temps décalés). */
  const releverRegie = (e: EtatLecture, serveur = false): LigneRegie[] | null => {
    let v = serveur ? vusServeur : vus;
    const c = e.commandes ?? [], j = e.journal ?? [], a = e.alertes ?? [];
    if (c.length < v.c || j.length < v.j || a.length < v.a) v = { c: 0, j: 0, a: 0 };
    if (c.length === v.c && j.length === v.j && a.length === v.a) return null;
    const recu = Date.now(), lignes: LigneRegie[] = [];
    for (const x of c.slice(v.c)) lignes.push(ligneCommande(x, ++numeroRegie, recu));
    for (const x of j.slice(v.j)) { const l = ligneEvenement(x, numeroRegie + 1, recu); if (l) { numeroRegie++; lignes.push(l); } }
    for (const x of a.slice(v.a)) lignes.push(ligneAlerte(x, ++numeroRegie, recu));
    if (serveur) vusServeur = { c: c.length, j: j.length, a: a.length };
    else vus = { c: c.length, j: j.length, a: a.length };
    if (!serveur) for (const l of lignes) l.t += decalT;
    lignes.sort((p, q) => p.t - q.t || p.n - q.n);
    return [...get().journalRegie, ...lignes].slice(-300);
  };
  const publier = (e: EtatLecture) => {
    const lecture = { ...e, t: e.t + decalT, retard: e.retard + decalRetard };
    // lecture miroir : le journal de régie suit l'état officiel du serveur (resynchroniser), pas le lecteur local
    const journalRegie = get().miroir ? null : releverRegie(e);
    set(journalRegie ? { lecture, journalRegie } : { lecture });
  };
  /** Nouvelle représentation : le journal de régie repart de zéro. */
  const viderRegie = () => { vus = { c: 0, j: 0, a: 0 }; vusServeur = { c: 0, j: 0, a: 0 }; set({ journalRegie: [] }); };

  const journal = (type: string, extra: Record<string, unknown> = {}) => {
    if (!execution) return;
    execution.evenements.push({ t: Math.round(get().lecture?.t ?? 0), type, ...extra });
  };
  const ouvrirExecution = () => {
    if (execution) return;
    execution = { id: 'x' + Date.now().toString(36), debut: Date.now(), mode: get().mode === 'spectacle' ? 'scene' : 'repetition', evenements: [] };
  };
  /** Ferme l'exécution en cours ; elle compte comme un soir joué si elle a duré plus d'une minute. */
  const fermerExecution = () => {
    if (!execution) return;
    const l = get().lecture;
    journal('fin', { retard: Math.round(l?.retard ?? 0) });
    const x = execution;
    execution = null;
    if ((l?.t ?? 0) < 60) return;
    set(s => ({ executions: [...s.executions, x] }));
    signaler('Soir ' + get().executions.length + ' enregistré');
  };

  const pousserHistorique = (avant: Projet, etiquette: string) => {
    const now = performance.now(), passe = get().passe, dernier = passe[passe.length - 1];
    if (dernier && dernier.etiquette === etiquette && now - dernier.t < 900) { dernier.t = now; set({ futur: [] }); return; }
    set({ passe: [...passe, { projet: avant, etiquette, t: now }].slice(-80), futur: [] });
  };

  /** Nouveau projet. En SPECTACLE, le lecteur ne le voit pas tout de suite : le compteur des modifications en
   *  attente monte (elles seront appliquées à l'entrée du prochain moment). */
  const remplacerProjet = (p: Projet) => {
    revision++;
    if (get().mode === 'spectacle' && lecteur) {
      const n = get().modificationsEnAttente + 1;
      set({ projet: p, modificationsEnAttente: n });
      if (n === 1) signaler('1 modification en attente : appliquée au prochain moment.');
    } else set({ projet: p });
  };

  // L'attente du top est un ÉTAT, pas une pause (règle 4.1-1) : l'horloge continue, `retard` et `attentes`
  // s'accumulent (dans le moteur), la sortie reste « en lecture ». Rien n'est armé : seul un GO franchit un passage.
  avancerLecture = (dt) => {
    const l = assurerLecteur();
    let e = l.etat();
    const momentAvant = e.moment;
    const avant = (e.moment ?? '') + '/' + (e.etape ?? '');
    let reste = dt;
    while (reste > 1e-6 && !e.termine) {
      const d = Math.min(0.5, reste);
      reste -= d;
      e = l.avancer(d, signauxCourants(get().projet.sens, e.tEtape));
    }
    publier(e);
    const apres = (e.moment ?? '') + '/' + (e.etape ?? '');
    if (apres !== avant) journal(e.etape ? 'etape' : 'passage', { moment: e.moment, etape: e.etape });
    if (e.termine) { set({ enLecture: false }); fermerExecution(); return; }
    const applique = appliquerEnAttente(momentAvant, e);
    if (applique) publier(applique);
  };

  /** Le GO (voir Magasin.go). */
  const go = () => {
    const maintenant = Date.now();
    if (maintenant - instantDernierGo < DELAI_ANTI_DOUBLE_GO_MS) return;   // double appui : ignoré
    const s = get(), l = assurerLecteur();
    let e = l.etat();
    if (e.termine) { signaler('Le spectacle est terminé.'); return; }
    const accepter = (texte: string) => {
      instantDernierGo = maintenant;
      ouvrirExecution();
      set({ enLecture: true, dernierGo: maintenant });
      signaler(texte);
    };
    // Représentation pas encore commencée : le premier GO la lance (cue 1).
    if (!execution || !s.lecture) {
      if (!s.lecture) publier(e);
      accepter('GO · le spectacle commence');
      journal('go', { moment: e.moment, etape: e.etape });
      annoncer({ k: 'go', tops: 0 });
      return;
    }
    const p = projetLu();
    const i = p.ev.findIndex(m => m.id === e.moment), m = p.ev[i];
    if (!m) return;
    const momentAvant = e.moment;
    const dernier = i >= p.ev.length - 1;
    let tops = 0;
    if (e.etape === null) {
      // un passage attend (le top, ou ses conditions) : GO le franchit
      e = l.top(); tops++;
    } else {
      // Pendant une étape. Dernier moment : l'étape qui termine le spectacle n'est pas un cue (on la laisse finir).
      const versEtape = m.tr.some(o => o.a === e.etape && !!o.b && m.st.some(x => x.id === o.b));
      if (dernier && !versEtape && !e.sequence) {
        if (!s.enLecture) { accepter('Lecture reprise · dernier moment, aucun cue après celui-ci'); annoncer({ k: 'go', tops: 0 }); }
        else signaler('Dernier moment : aucun cue après celui-ci.');
        return;
      }
      // fin de l'étape forcée ; si elle mène au passage « go » du moment (cas d'Écho), on le franchit aussitôt
      e = l.top(); tops++;
      if (!e.termine && e.moment === momentAvant && e.etape === null && (m.gate.mode === 'go' || e.attenteGo)) { e = l.top(); tops++; }
    }
    annoncer({ k: 'go', tops });
    publier(e);
    journal('go', { moment: e.moment, etape: e.etape });
    const j = e.moment ? p.ev.findIndex(x => x.id === e.moment) : -1;
    accepter(e.moment !== momentAvant ? 'GO · ' + (p.ev[j]?.name ?? 'moment ' + (j + 1)) : 'GO · étape suivante');
    if (e.termine) { set({ enLecture: false }); fermerExecution(); return; }
    const applique = appliquerEnAttente(momentAvant, e);
    if (applique) publier(applique);
  };

  return {
    projet: reprise?.project ?? exempleDemo(),
    selection: {},
    mode: 'repetition',   // RÉPÉTITION par défaut à l'ouverture (le mode n'est pas retenu d'une session à l'autre)
    lecture: null,
    enLecture: false,
    zoomPlanche: 1,
    zoomConduite: 0.6,
    theme: themeInitial,

    selectionner: (s) => set({ selection: s }),

    modifierProjet: (fn, etiquette = 'modification') => {
      const s = get();
      if (s.mode === 'spectacle') { signaler(VERROU); return; }
      const copie = structuredClone(s.projet);
      fn(copie);
      pousserHistorique(s.projet, etiquette);
      remplacerProjet(copie);
    },

    // Le lecteur n'est pas recréé au changement de mode : en RÉPÉTITION il le sera à la prochaine image (à la même
    // place), en SPECTACLE à l'entrée du prochain moment (il passe alors en mode 'scene').
    changerMode: (m) => {
      const mode = normaliserMode(m);
      if (mode === get().mode) return;
      if (mode === 'spectacle') {
        set({ mode, verrou: true, vitesse: 1, modificationsEnAttente: lecteurAJour() ? 0 : Math.max(0, revision - revisionLecteur) });
        signaler('SPECTACLE · structure verrouillée, vitesse ×1, Espace = GO, Maj+Espace = pause.');
      } else {
        set({ mode, verrou: false, modificationsEnAttente: 0, miroir: false });
        signaler('RÉPÉTITION · modifications autorisées, Espace = lecture / pause, T = GO.');
      }
    },

    lancer: () => {
      const s0 = get().lecture;
      const l = assurerLecteur(!s0 || s0.termine);
      const e = get().lecture;
      if (!e || e.termine) { decalT = 0; decalRetard = 0; viderRegie(); publier(l.reinitialiser()); }
      ouvrirExecution();
      set({ enLecture: true });
    },
    pause: () => set({ enLecture: false }),

    go,
    top: go,
    dernierGo: 0,

    // Saut explicite : le lecteur prend les modifications en attente (on rentre de toute façon dans un moment).
    allerA: (moment, etape) => {
      set({ selection: { moment, etape } });
      publier(assurerLecteur(true).allerA(moment, etape));
      journal('aller', { moment, etape });
      annoncer(etape === undefined ? { k: 'allerA', moment } : { k: 'allerA', moment, etape });
    },

    zoomerPlanche: (z) => set({ zoomPlanche: Math.min(3, Math.max(0.2, z)) }),
    zoomerConduite: (z) => set({ zoomConduite: Math.min(8, Math.max(0.05, z)) }),

    basculerTheme: () => {
      const theme = get().theme === 'sombre' ? 'clair' : 'sombre';
      poserTheme(theme);
      try { localStorage.setItem('sr-conducteur-theme', theme); } catch { /* rien */ }
      set({ theme });
    },

    cadrage: null,
    cadrerMoment: (moment) => set(s => ({ selection: { moment }, cadrage: { moment, n: (s.cadrage?.n ?? 0) + 1 } })),

    vitesse: 1,          // temps réel par défaut ; ×5 / ×20 seulement en RÉPÉTITION
    changerVitesse: (vitesse) => {
      if (get().mode === 'spectacle' && vitesse !== 1) { signaler('SPECTACLE : vitesse ×1 imposée.'); return; }
      set({ vitesse });
    },
    basculerLecture: () => { if (get().enLecture) get().pause(); else get().lancer(); },
    revenirAuDebut: () => {
      fermerExecution();
      const l = assurerLecteur(true);
      decalT = 0; decalRetard = 0;
      viderRegie();
      publier(l.reinitialiser());
      instantDernierGo = -Infinity;
      set({ enLecture: false, dernierGo: 0, miroir: false });
    },

    reglerSalle: (k, v) => {
      const s = get();
      if (s.mode === 'spectacle') { signaler(VERROU); return; }
      pousserHistorique(s.projet, 'salle');
      // la salle ne change pas la structure : le lecteur continue (les signaux sont relus à chaque image)
      set({ projet: { ...s.projet, sens: { ...s.projet.sens, [k]: Math.max(0, Math.min(100, Math.round(v))) } } });
    },
    signaux: () => { const s = get(); return signauxCourants(s.projet.sens, s.lecture?.tEtape ?? 0); },

    assets: reprise?.assets?.length ? reprise.assets : ASSETS_DEMO,
    executions: reprise?.runs ?? [],

    passe: [],
    futur: [],
    annuler: () => {
      const s = get(), h = s.passe[s.passe.length - 1];
      if (s.mode === 'spectacle') { signaler(VERROU); return; }
      if (!h) { signaler('Rien à annuler.'); return; }
      set({ passe: s.passe.slice(0, -1), futur: [...s.futur, s.projet] });
      remplacerProjet(h.projet);
      signaler('Annulé · ' + h.etiquette);
    },
    retablir: () => {
      const s = get(), p = s.futur[s.futur.length - 1];
      if (s.mode === 'spectacle') { signaler(VERROU); return; }
      if (!p) { signaler('Rien à rétablir.'); return; }
      set({ futur: s.futur.slice(0, -1), passe: [...s.passe, { projet: s.projet, etiquette: 'rétablir', t: 0 }] });
      remplacerProjet(p);
    },

    verrou: false,
    basculerVerrou: () => get().changerMode(get().mode === 'spectacle' ? 'repetition' : 'spectacle'),
    modificationsEnAttente: 0,
    recevoirFinVideo: (asset) => {
      const l = get().lecture;
      if (!l || l.termine) return;
      get().envoyerSignal('video.fin', { valeur: asset, asset });
    },

    message: '',
    signaler,

    versions: typeof localStorage !== 'undefined' ? lireVersions() : [],
    enregistrerVersion: () => {
      const s = get(), l = lireVersions();
      l.unshift({ n: 'Version ' + (l.length + 1), d: new Date().toISOString(), data: emballer(s.projet, s.assets, s.executions) });
      if (!ecrireVersions(l)) { signaler('Stockage local plein.'); return; }
      set({ versions: lireVersions() });
      signaler('Version enregistrée en local.');
    },
    ouvrirVersion: (i) => {
      const s = get(), v = s.versions[i];
      if (!v) return;
      if (s.mode === 'spectacle') { signaler(VERROU); return; }
      try {
        const f = lireFichier(JSON.stringify(v.data));
        pousserHistorique(s.projet, 'version');
        set({ selection: {}, assets: f.assets.length ? f.assets : s.assets });
        remplacerProjet(f.project);
        signaler('« ' + v.n + ' » ouverte');
      } catch (err) { signaler((err as Error).message); }
    },
    supprimerVersion: (i) => {
      const l = lireVersions();
      l.splice(i, 1);
      ecrireVersions(l);
      set({ versions: lireVersions() });
    },
    exporter: () => { const s = get(); telecharger(emballer(s.projet, s.assets, s.executions)); },
    importer: (texte) => {
      const s = get();
      if (s.mode === 'spectacle') { signaler(VERROU); return; }
      try {
        const f = lireFichier(texte);
        pousserHistorique(s.projet, 'import');
        set({ selection: {}, assets: f.assets.length ? f.assets : ASSETS_DEMO, executions: f.runs });
        remplacerProjet(f.project);
        signaler('Projet importé · ' + f.project.ev.length + ' moments');
      } catch (err) { signaler((err as Error).message); }
    },
    revenirDemo: () => {
      const s = get();
      if (s.mode === 'spectacle') { signaler(VERROU); return; }
      pousserHistorique(s.projet, 'démonstration');
      oublierCourant();
      set({ selection: {}, assets: ASSETS_DEMO, executions: [] });
      remplacerProjet(exempleDemo());
    },
    // Projet reçu de la salle collaborative (src/etat/serveur.ts) : nouvelle révision, sans entrée d'annulation et sans
    // tenir compte du verrou local (ce sont les gestes des autres postes). Le projet du magasin suit toujours la salle
    // (la synchronisation en dépend) ; en SPECTACLE, c'est le LECTEUR qui attend : modification comptée dans
    // `modificationsEnAttente`, appliquée à l'entrée du prochain moment.
    remplacerProjetDistant: (p, o) => {
      if (o?.premier) set({ passe: [], futur: [] });
      remplacerProjet(p);
    },

    // Pupitre de la régie : entrées extérieures, permises en SPECTACLE (le verrou fige la conduite, pas la soirée).
    poserMemoire: (nom, valeur) => {
      const n = nom.trim();
      if (!n) return;
      publier(assurerLecteur().poser(n, valeur));
      journal('memoire', { nom: n, valeur });
      annoncer({ k: 'poser', nom: n, valeur });
    },
    envoyerSignal: (nom, donnees) => {
      const n = nom.trim();
      if (!n) return;
      publier(assurerLecteur().signal(n, donnees));
      journal('signal', { nom: n });
      annoncer(donnees === undefined ? { k: 'signal', nom: n } : { k: 'signal', nom: n, donnees });
    },
    reprendreAuPoint: (nom) => {
      publier(assurerLecteur().reprendre(nom));
      journal('reprise', { nom: nom ?? '' });
      annoncer(nom === undefined ? { k: 'reprendre' } : { k: 'reprendre', nom });
    },
    journalRegie: [],

    miroir: false,
    resynchroniser: (etat) => {
      if (get().mode !== 'spectacle') return;
      const l = assurerLecteur();
      let e = l.etat();
      const p = projetLu();
      const connu = !!etat.moment && p.ev.some(x => x.id === etat.moment);
      // replacer le lecteur local s'il n'est plus au même endroit (même projet, même graine : mêmes étapes ensuite)
      if (!etat.termine && connu && (e.termine || e.moment !== etat.moment || e.etape !== etat.etape)) {
        const m = p.ev.find(x => x.id === etat.moment)!;
        const etape = etat.etape && m.st.some(x => x.id === etat.etape) ? etat.etape : undefined;
        e = l.allerA(m.id, etape);
        if (etat.etape === null && etat.phase !== 'fin') e = placerAuPassage(l, m.id);
      }
      for (const [k, v] of Object.entries(etat.memoires ?? {})) if (e.memoires[k] !== v) e = l.poser(k, v);
      // ce que le lecteur local a émis en se replaçant n'est pas nouveau pour la régie
      vus = { c: e.commandes?.length ?? 0, j: e.journal?.length ?? 0, a: e.alertes?.length ?? 0 };
      decalT = etat.t - e.t; decalRetard = etat.retard - e.retard;
      // premier calage : l'historique du serveur ne remplit pas le journal, seules les nouveautés y entrent
      if (!get().miroir) vusServeur = { c: etat.commandes?.length ?? 0, j: etat.journal?.length ?? 0, a: etat.alertes?.length ?? 0 };
      const journalRegie = releverRegie(etat, true);
      const maj: Partial<Magasin> = { lecture: { ...etat }, miroir: true };
      if (journalRegie) maj.journalRegie = journalRegie;
      if (etat.termine) maj.enLecture = false;
      set(maj);
    },
  };
});

/** Vitesse appliquée : ×1 en SPECTACLE quoi qu'il arrive. */
const vitesseEffective = (s: Pick<Magasin, 'mode' | 'vitesse'>) => (s.mode === 'spectacle' ? 1 : s.vitesse);

/** Fait avancer la lecture de `dt` secondes de spectacle, comme une image de la boucle (essais, outils). */
export function avancerDe(dt: number): void {
  if (useMagasin.getState().enLecture && dt > 0) avancerLecture(dt);
}

/** Démarre la boucle de lecture : requestAnimationFrame, relayé par setInterval quand l'onglet est caché
 *  (la représentation continue). Renvoie la fonction d'arrêt. */
export function demarrerBoucle(): () => void {
  let raf = 0, dernier = 0, dernierCache = performance.now();
  const image = (ts: number) => {
    raf = requestAnimationFrame(image);
    const dt = dernier ? Math.min(0.1, (ts - dernier) / 1000) : 0;
    dernier = ts;
    const s = useMagasin.getState();
    if (s.enLecture && dt > 0) avancerLecture(dt * vitesseEffective(s));
  };
  raf = requestAnimationFrame(image);
  const relais = setInterval(() => {
    const now = performance.now(), s = useMagasin.getState();
    if (document.hidden) {
      if (s.enLecture) avancerLecture(Math.min(1, (now - dernierCache) / 1000) * vitesseEffective(s));
      dernier = 0;
    }
    dernierCache = now;
  }, 250);
  return () => { cancelAnimationFrame(raf); clearInterval(relais); };
}

// Au chargement, la lecture est posée au début (comme le design) : le moment 1 et sa première étape sont « en cours »,
// rien ne joue tant qu'on ne lance pas.
useMagasin.getState().revenirAuDebut();

// Enregistrement automatique du projet en cours (reprise après rechargement).
useMagasin.subscribe((s, p) => {
  if (s.projet !== p.projet || s.assets !== p.assets || s.executions !== p.executions) ecrireCourant(emballer(s.projet, s.assets, s.executions));
});
