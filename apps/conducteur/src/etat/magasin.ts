// Magasin d'état du conducteur (zustand) — chantier COQUILLE.
//
// CONTRAT (ARCHITECTURE.md, inchangé) : `projet`, `selection: { moment?, etape? }`, `mode`, `lecture`, `enLecture`,
// `zoomPlanche`, `zoomConduite`, `theme` et les actions `selectionner`, `modifierProjet(fn)`, `changerMode`, `lancer`,
// `pause`, `top`, `allerA`, `zoomerPlanche`, `zoomerConduite`, `basculerTheme`. CONDUITE et PLANCHE n'utilisent que ça.
//
// Ajouts (tous facultatifs pour les autres chantiers) : sélection étendue (sortie, passage, acte, piste, clip, note),
// annuler / rétablir, vitesse de lecture, salle simulée, verrou « scène », versions locales, export / import JSON,
// messages à la régie. La lecture passe par src/etat/moteur.ts (moteur du chantier MODÈLE, ou provisoire).
// Pupitre de la régie (chantier INTÉGRATION) : `poserMemoire`, `envoyerSignal`, `reprendreAuPoint` (entrées extérieures
// du moteur) et `journalRegie` (commandes émises par les blocs, entrées reçues, alertes ; voir src/etat/regie.ts).
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

/** Les deux modes du design : PRÉPARER (écrire, régler, répéter avec la salle simulée ; la caméra reste libre) et
 *  JOUER (représentation : la caméra suit le spectacle). */
export type ModeConducteur = 'preparer' | 'jouer';
/** Anciennes valeurs (Écrire / Répéter), acceptées par `changerMode` et ramenées à 'preparer'. Le magasin ne les
 *  contient jamais ; elles restent dans le type pour que le code d'autres chantiers qui les compare compile encore. */
export type ModeAncien = 'ecrire' | 'repeter';
export const normaliserMode = (m: ModeConducteur | ModeAncien): ModeConducteur => (m === 'jouer' ? 'jouer' : 'preparer');

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
  /** Toujours 'preparer' ou 'jouer' (voir ModeAncien). */
  mode: ModeConducteur | ModeAncien;
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
  /** Top régie : franchit le passage « go » qui attend (ou l'arme s'il n'est pas encore prêt). */
  top: () => void;
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
  /** Passage « go » armé d'avance (id du moment) : il passera dès qu'il sera prêt. */
  topArme: string | null;
  reglerSalle: (k: keyof SalleSimulee, v: number) => void;
  /** Signaux de la salle à l'instant (salle simulée). */
  signaux: () => Signaux;

  assets: CategorieAssets[];
  executions: Execution[];

  passe: EntreeHistorique[];
  futur: Projet[];
  annuler: () => void;
  retablir: () => void;

  verrou: boolean;
  basculerVerrou: () => void;

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
}

// ─── hors React : le lecteur, sa révision, l'exécution en cours ───────────────────────────────────────
let lecteur: Lecteur | null = null;
let revision = 0;          // change à chaque modification du projet (sauf la salle simulée)
let revisionLecteur = -1;
let decalT = 0, decalRetard = 0;   // continuité de l'horloge quand le lecteur est recréé après une modification
let execution: Execution | null = null;
let minuteurMessage: ReturnType<typeof setTimeout> | undefined;
/** Ce que le journal de régie a déjà relevé dans l'état du lecteur courant (commandes, journal, alertes). */
let vus = { c: 0, j: 0, a: 0 };
let numeroRegie = 0;
/** Fait avancer la lecture de dt secondes de spectacle (posé par le magasin, appelé par la boucle). */
let avancerLecture: (dt: number) => void = () => {};

const lireTheme = (): 'sombre' | 'clair' => {
  try { return localStorage.getItem('sr-conducteur-theme') === 'clair' ? 'clair' : 'sombre'; } catch { return 'sombre'; }
};
const poserTheme = (t: 'sombre' | 'clair') => {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', t === 'clair' ? 'light' : 'dark');
};

const reprise = typeof localStorage !== 'undefined' ? lireCourant() : null;
const themeInitial = lireTheme();
poserTheme(themeInitial);
const VERROU = 'Verrouillé · mode scène. Désactive SCÈNE en haut pour modifier.';

export const useMagasin = create<Magasin>((set, get) => {
  const signaler = (m: string) => {
    clearTimeout(minuteurMessage);
    set({ message: m });
    minuteurMessage = setTimeout(() => set({ message: '' }), 2800);
  };

  /** Le lecteur du projet courant ; recréé (au même moment, à la même étape) quand le projet a changé. */
  const assurerLecteur = (): Lecteur => {
    if (lecteur && revisionLecteur === revision) return lecteur;
    const s = get(), avant = s.lecture;
    lecteur = creerLecteur(s.projet, { mode: s.mode === 'jouer' ? 'scene' : 'repetition' });
    revisionLecteur = revision;
    decalT = 0; decalRetard = 0;
    const m = avant && !avant.termine ? s.projet.ev.find(x => x.id === avant.moment) : undefined;
    if (avant && m) {
      const etape = avant.etape && m.st.some(x => x.id === avant.etape) ? avant.etape : undefined;
      const e = lecteur.allerA(m.id, etape);
      decalT = avant.t - e.t; decalRetard = avant.retard - e.retard;
      // les mémoires de la soirée (blocs Mémoire, entrées de la régie) survivent à une modification du projet
      for (const [k, v] of Object.entries(avant.memoires ?? {})) if (e.memoires[k] !== v) lecteur.poser(k, v);
    }
    // ce que le nouveau lecteur a émis en se replaçant n'est pas nouveau pour la régie
    const e0 = lecteur.etat();
    vus = { c: e0.commandes?.length ?? 0, j: e0.journal?.length ?? 0, a: e0.alertes?.length ?? 0 };
    return lecteur;
  };

  /** Relève les commandes, entrées et alertes nouvelles du lecteur pour le journal de régie (temps décalés). */
  const releverRegie = (e: EtatLecture): LigneRegie[] | null => {
    const c = e.commandes ?? [], j = e.journal ?? [], a = e.alertes ?? [];
    if (c.length < vus.c || j.length < vus.j || a.length < vus.a) vus = { c: 0, j: 0, a: 0 };
    if (c.length === vus.c && j.length === vus.j && a.length === vus.a) return null;
    const recu = Date.now(), lignes: LigneRegie[] = [];
    for (const x of c.slice(vus.c)) lignes.push(ligneCommande(x, ++numeroRegie, recu));
    for (const x of j.slice(vus.j)) { const l = ligneEvenement(x, numeroRegie + 1, recu); if (l) { numeroRegie++; lignes.push(l); } }
    for (const x of a.slice(vus.a)) lignes.push(ligneAlerte(x, ++numeroRegie, recu));
    vus = { c: c.length, j: j.length, a: a.length };
    for (const l of lignes) l.t += decalT;
    lignes.sort((p, q) => p.t - q.t || p.n - q.n);
    return [...get().journalRegie, ...lignes].slice(-300);
  };
  const publier = (e: EtatLecture) => {
    const lecture = { ...e, t: e.t + decalT, retard: e.retard + decalRetard };
    const journalRegie = releverRegie(e);
    set(journalRegie ? { lecture, journalRegie } : { lecture });
  };
  /** Nouvelle représentation : le journal de régie repart de zéro. */
  const viderRegie = () => { vus = { c: 0, j: 0, a: 0 }; set({ journalRegie: [] }); };

  const journal = (type: string, extra: Record<string, unknown> = {}) => {
    if (!execution) return;
    execution.evenements.push({ t: Math.round(get().lecture?.t ?? 0), type, ...extra });
  };
  const ouvrirExecution = () => {
    if (execution) return;
    execution = { id: 'x' + Date.now().toString(36), debut: Date.now(), mode: get().mode === 'jouer' ? 'scene' : 'repetition', evenements: [] };
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

  const remplacerProjet = (p: Projet) => { revision++; set({ projet: p }); };

  avancerLecture = (dt) => {
    const l = assurerLecteur();
    let e = l.etat();
    const avant = (e.moment ?? '') + '/' + (e.etape ?? '');
    let reste = dt;
    while (reste > 1e-6 && !e.termine) {
      const d = Math.min(0.5, reste);
      reste -= d;
      e = l.avancer(d, signauxSalle(get().projet.sens, e.tEtape));
      const arme = get().topArme;
      if (arme && e.attenteGo && e.moment === arme) { e = l.top(); set({ topArme: null }); journal('top', { moment: arme }); }
    }
    publier(e);
    const apres = (e.moment ?? '') + '/' + (e.etape ?? '');
    if (apres !== avant) journal(e.etape ? 'etape' : 'passage', { moment: e.moment, etape: e.etape });
    if (e.termine) { set({ enLecture: false }); fermerExecution(); }
  };

  return {
    projet: reprise?.project ?? exempleDemo(),
    selection: {},
    mode: 'jouer',
    lecture: null,
    enLecture: false,
    zoomPlanche: 1,
    zoomConduite: 0.6,
    theme: themeInitial,

    selectionner: (s) => set({ selection: s }),

    modifierProjet: (fn, etiquette = 'modification') => {
      const s = get();
      if (s.verrou) { signaler(VERROU); return; }
      const copie = structuredClone(s.projet);
      fn(copie);
      pousserHistorique(s.projet, etiquette);
      remplacerProjet(copie);
    },

    changerMode: (m) => {
      const mode = normaliserMode(m);
      if (mode === get().mode) return;
      revision++;   // le lecteur est recréé dans le bon mode (scène / répétition), à la même place
      set({ mode });
    },

    lancer: () => {
      const l = assurerLecteur();
      const e = get().lecture;
      if (!e || e.termine) { decalT = 0; decalRetard = 0; viderRegie(); publier(l.reinitialiser()); }
      ouvrirExecution();
      set({ enLecture: true });
    },
    pause: () => set({ enLecture: false }),

    top: () => {
      const s = get(), l = assurerLecteur(), e = l.etat();
      if (e.termine) { signaler('Le spectacle est terminé.'); return; }
      const i = s.projet.ev.findIndex(m => m.id === e.moment), m = s.projet.ev[i];
      if (!m) return;
      const dernier = i >= s.projet.ev.length - 1;
      if (!dernier && m.gate.mode === 'go' && (e.attenteGo || !e.etape)) {
        publier(l.top());
        journal('top', { moment: m.id });
        set({ topArme: null });
        signaler('Top donné · passage P' + (i + 1) + ' franchi');
      } else if (!dernier && m.gate.mode === 'go') {
        set({ topArme: m.id });
        signaler('Top armé · P' + (i + 1) + ' passera dès que prêt');
      } else signaler('Aucun passage n’attend de top.');
    },

    allerA: (moment, etape) => {
      set({ selection: { moment, etape } });
      publier(assurerLecteur().allerA(moment, etape));
      journal('aller', { moment, etape });
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

    vitesse: 20,
    changerVitesse: (vitesse) => set({ vitesse }),
    basculerLecture: () => { if (get().enLecture) get().pause(); else get().lancer(); },
    revenirAuDebut: () => {
      fermerExecution();
      const l = assurerLecteur();
      decalT = 0; decalRetard = 0;
      viderRegie();
      publier(l.reinitialiser());
      set({ enLecture: false, topArme: null });
    },
    topArme: null,

    reglerSalle: (k, v) => {
      const s = get();
      if (s.verrou) { signaler(VERROU); return; }
      pousserHistorique(s.projet, 'salle');
      // la salle ne change pas la structure : le lecteur continue (les signaux sont relus à chaque image)
      set({ projet: { ...s.projet, sens: { ...s.projet.sens, [k]: Math.max(0, Math.min(100, Math.round(v))) } } });
    },
    signaux: () => { const s = get(); return signauxSalle(s.projet.sens, s.lecture?.tEtape ?? 0); },

    assets: reprise?.assets?.length ? reprise.assets : ASSETS_DEMO,
    executions: reprise?.runs ?? [],

    passe: [],
    futur: [],
    annuler: () => {
      const s = get(), h = s.passe[s.passe.length - 1];
      if (!h) { signaler('Rien à annuler.'); return; }
      set({ passe: s.passe.slice(0, -1), futur: [...s.futur, s.projet] });
      remplacerProjet(h.projet);
      signaler('Annulé · ' + h.etiquette);
    },
    retablir: () => {
      const s = get(), p = s.futur[s.futur.length - 1];
      if (!p) { signaler('Rien à rétablir.'); return; }
      set({ futur: s.futur.slice(0, -1), passe: [...s.passe, { projet: s.projet, etiquette: 'rétablir', t: 0 }] });
      remplacerProjet(p);
    },

    verrou: false,
    basculerVerrou: () => {
      const v = !get().verrou;
      set({ verrou: v });
      signaler(v ? 'Mode scène : la conduite est verrouillée. Top, pause et conditions restent actifs.' : 'Mode répétition : modifications autorisées.');
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
      if (s.verrou) { signaler(VERROU); return; }
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
      if (s.verrou) { signaler(VERROU); return; }
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
      pousserHistorique(s.projet, 'démonstration');
      oublierCourant();
      set({ selection: {}, assets: ASSETS_DEMO, executions: [] });
      remplacerProjet(exempleDemo());
    },
    // Projet reçu de la salle collaborative (src/etat/serveur.ts) : nouvelle révision pour le lecteur, sans entrée
    // d'annulation et sans tenir compte du verrou local de scène (ce sont les gestes des autres postes).
    remplacerProjetDistant: (p, o) => {
      if (o?.premier) set({ passe: [], futur: [] });
      remplacerProjet(p);
    },

    // Pupitre de la régie : entrées extérieures, permises en mode scène (le verrou fige la conduite, pas la soirée).
    poserMemoire: (nom, valeur) => {
      const n = nom.trim();
      if (!n) return;
      publier(assurerLecteur().poser(n, valeur));
      journal('memoire', { nom: n, valeur });
    },
    envoyerSignal: (nom, donnees) => {
      const n = nom.trim();
      if (!n) return;
      publier(assurerLecteur().signal(n, donnees));
      journal('signal', { nom: n });
    },
    reprendreAuPoint: (nom) => {
      publier(assurerLecteur().reprendre(nom));
      journal('reprise', { nom: nom ?? '' });
    },
    journalRegie: [],
  };
});

/** Démarre la boucle de lecture : requestAnimationFrame, relayé par setInterval quand l'onglet est caché
 *  (la représentation continue). Renvoie la fonction d'arrêt. */
export function demarrerBoucle(): () => void {
  let raf = 0, dernier = 0, dernierCache = performance.now();
  const image = (ts: number) => {
    raf = requestAnimationFrame(image);
    const dt = dernier ? Math.min(0.1, (ts - dernier) / 1000) : 0;
    dernier = ts;
    const s = useMagasin.getState();
    if (s.enLecture && dt > 0) avancerLecture(dt * s.vitesse);
  };
  raf = requestAnimationFrame(image);
  const relais = setInterval(() => {
    const now = performance.now(), s = useMagasin.getState();
    if (document.hidden) {
      if (s.enLecture) avancerLecture(Math.min(1, (now - dernierCache) / 1000) * s.vitesse);
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
