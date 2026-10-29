// Décisions PURES de la barre de scène (sans React ni magasin ; testées dans barre-etat.test.ts) :
//   - ce que chaque bouton affiche et son état (enfoncé, grisé, libellé lu par un lecteur d'écran) ;
//   - EN COURS / PROCHAIN avec le temps dans l'étape et la progression de la durée minimale (prolongation comprise) ;
//   - la liste « SAUTER À… » (moments puis étapes), sa recherche par texte, et la confirmation demandée en SPECTACLE ;
//   - l'appui long de PANIQUE (jauge 700 ms), construit sur des fonctions de temps injectables.
import { dureeEtape, type EtatLecture, type Projet } from '@studio-real/modele';
import type { ModeConducteur } from '../etat/magasin';
import { mmss } from '../theme/format';
import { prochainCue } from './envois';

/** Durée de l'appui long qui déclenche (ou lève) la PANIQUE. */
export const DUREE_APPUI_LONG_MS = 700;
/** Pas du bouton « +30 s ». */
export const PAS_PROLONGER_S = 30;

// ── boutons ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface EntreeBarre {
  lecture: EtatLecture | null;
  enLecture: boolean;
  projet: Projet;
  enPanique: boolean;
  /** « GO ✓ » pendant l'anti-rebond qui suit un GO accepté */
  goRecent: boolean;
}

export interface EtatBouton {
  libelle: string;
  /** texte lu par un lecteur d'écran (français) */
  aria: string;
  /** info-bulle : sert de libellé quand la barre se réduit à des icônes (< 900 px) */
  titre: string;
  desactive: boolean;
}
export interface EtatBoutonBascule extends EtatBouton { enfonce: boolean }

export interface EnCours {
  nom: string;
  /** nom du moment, s'il diffère du nom de l'étape */
  momentNom: string;
  /** « un passage attend » : pas d'étape, le temps compté est celui du passage */
  passage: boolean;
  /** temps passé dans l'étape (ou dans le passage), MM:SS */
  temps: string;
  /** durée minimale de l'étape, prolongation comprise, MM:SS ('' au passage) */
  duree: string;
  /** 0 à 1 : temps passé / durée minimale (1 si la durée est dépassée) */
  progres: number;
  /** la durée minimale est atteinte : l'étape attend sa sortie (condition, signal, GO) */
  depasse: boolean;
}

export interface VueBarre {
  go: EtatBouton & { attente: boolean };
  retenir: EtatBoutonBascule;
  sauter: EtatBouton;
  prolonger: EtatBouton & { cumul: number; cumulTxt: string };
  pause: EtatBoutonBascule;
  panique: EtatBoutonBascule;
  enCours: EnCours | null;
  /** nom de la prochaine étape (celle que le GO lancera) */
  prochain: string | null;
  termine: boolean;
}

/** Durée minimale de l'étape en cours (s), prolongation de la régie comprise ; null hors étape. */
export function dureeMinimale(projet: Projet, lecture: Pick<EtatLecture, 'moment' | 'etape' | 'prolonge'> | null): number | null {
  if (!lecture || !lecture.moment || !lecture.etape) return null;
  const st = projet.ev.find(m => m.id === lecture.moment)?.st.find(x => x.id === lecture.etape);
  return st ? dureeEtape(st) + Math.max(0, lecture.prolonge ?? 0) : null;
}

export function enCoursDe(projet: Projet, lecture: EtatLecture | null): EnCours | null {
  if (!lecture || lecture.termine || !lecture.moment) return null;
  const cue = prochainCue(projet, lecture).enCours;
  if (!lecture.etape) {
    const suivant = projet.ev[projet.ev.findIndex(m => m.id === lecture.moment) + 1];
    return {
      nom: suivant ? 'Passage vers « ' + suivant.name + ' »' : 'Passage', momentNom: '', passage: true,
      temps: mmss(lecture.tEtape), duree: '', progres: 0, depasse: false,
    };
  }
  const duree = dureeMinimale(projet, lecture);
  const progres = duree && duree > 0 ? Math.max(0, Math.min(1, lecture.tEtape / duree)) : 0;
  const nom = cue?.nom ?? lecture.etape;
  return {
    nom, momentNom: cue && cue.momentNom !== nom ? cue.momentNom : '', passage: false,
    temps: mmss(lecture.tEtape), duree: duree === null ? '' : mmss(duree), progres,
    depasse: duree !== null && lecture.tEtape >= duree - 1e-6,
  };
}

/** Tout ce que la barre affiche, d'après l'état du magasin. */
export function vueBarre(e: EntreeBarre): VueBarre {
  const { lecture, enLecture, projet } = e;
  const termine = !!lecture?.termine;
  const retenu = !!lecture?.retenu;
  const commence = !!lecture && (enLecture || lecture.t > 0 || (lecture.parcours?.length ?? 0) > 1);
  const hors = !lecture || lecture.etape === null;   // pas d'étape en cours : rien à retenir ni à prolonger
  const cumul = Math.max(0, Math.round(lecture?.prolonge ?? 0));
  const cue = prochainCue(projet, lecture);

  const go: VueBarre['go'] = {
    libelle: e.goRecent ? 'GO ✓' : 'GO',
    aria: termine ? 'GO : le spectacle est terminé' : 'GO : lancer le cue suivant, maintenant',
    titre: termine ? 'Le spectacle est terminé' : 'GO : le cue suivant, maintenant · Espace, T ou G',
    desactive: termine,
    attente: !!lecture?.attenteGo && !e.goRecent,
  };
  const retenir: VueBarre['retenir'] = {
    libelle: retenu ? 'RETENU' : 'RETENIR',
    aria: retenu ? 'Retenir : étape tenue, appuyer pour relâcher' : 'Retenir l’étape en cours',
    titre: retenu ? 'Étape tenue : seul le GO en sort · H pour relâcher' : 'Retenir l’étape en cours : elle ne se termine plus toute seule · H',
    desactive: termine || (hors && !retenu),
    enfonce: retenu,
  };
  const sauter: VueBarre['sauter'] = {
    libelle: 'SAUTER À…',
    aria: 'Sauter à un moment ou à une étape',
    titre: 'Sauter à un moment ou à une étape · Ctrl+Maj+K',
    desactive: projet.ev.length === 0,
  };
  const prolonger: VueBarre['prolonger'] = {
    libelle: '+' + PAS_PROLONGER_S + ' s',
    aria: cumul > 0
      ? 'Ajouter ' + PAS_PROLONGER_S + ' secondes à l’étape en cours, déjà ' + cumul + ' secondes ajoutées'
      : 'Ajouter ' + PAS_PROLONGER_S + ' secondes à l’étape en cours',
    titre: 'Repousser la fin de l’étape de ' + PAS_PROLONGER_S + ' s' + (cumul > 0 ? ' (cumul +' + cumul + ' s)' : '') + ' · J',
    desactive: termine || hors,
    cumul,
    cumulTxt: cumul > 0 ? '+' + cumul + ' s' : '',
  };
  const enPause = commence && !enLecture;
  const pause: VueBarre['pause'] = {
    libelle: !commence ? 'LECTURE' : enLecture ? 'PAUSE' : 'REPRISE',
    aria: !commence ? 'Lancer la lecture' : enLecture ? 'Mettre en pause' : 'Reprendre la lecture',
    titre: (!commence ? 'Lancer la lecture' : enLecture ? 'Mettre en pause' : 'Reprendre la lecture') + ' · Maj+Espace',
    desactive: termine,
    enfonce: enPause,
  };
  const panique: VueBarre['panique'] = {
    libelle: e.enPanique ? 'FIN PANIQUE' : 'PANIQUE',
    aria: e.enPanique
      ? 'Fin de la panique : maintenir 0,7 seconde ou double-cliquer pour rendre les écrans'
      : 'Panique : maintenir 0,7 seconde ou double-cliquer pour mettre tous les écrans en sécurité',
    titre: e.enPanique ? 'Lever la panique · maintenir ou double-clic' : 'PANIQUE · maintenir 0,7 s ou double-clic · pas de raccourci clavier',
    desactive: false,
    enfonce: e.enPanique,
  };
  return {
    go, retenir, sauter, prolonger, pause, panique,
    enCours: enCoursDe(projet, lecture),
    prochain: cue.prochain?.nom ?? null,
    termine,
  };
}

// ── SAUTER À… ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Saut {
  moment: string;
  /** absent : on saute au début du moment */
  etape?: string;
  niveau: 'moment' | 'etape';
  libelle: string;
  /** moment d'une étape, ou « Moment n » */
  sous: string;
}

/** Les moments, chacun suivi de ses étapes (dans l'ordre de la planche). */
export function listeSauts(projet: Projet): Saut[] {
  const l: Saut[] = [];
  projet.ev.forEach((m, i) => {
    l.push({ moment: m.id, niveau: 'moment', libelle: m.name, sous: 'Moment ' + (i + 1) });
    for (const st of m.st) l.push({ moment: m.id, etape: st.id, niveau: 'etape', libelle: st.name, sous: m.name });
  });
  return l;
}

const nu = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Recherche par texte (sans accents ni casse) : tous les mots doivent se trouver dans le nom ou dans le moment. */
export function filtrerSauts(sauts: readonly Saut[], requete: string): Saut[] {
  const mots = nu(requete).split(/\s+/).filter(Boolean);
  if (!mots.length) return [...sauts];
  return sauts.filter(s => {
    const texte = nu(s.libelle + ' ' + s.sous);
    return mots.every(m => texte.includes(m));
  });
}

/** En SPECTACLE un saut se confirme (second appui sur Entrée) ; en RÉPÉTITION il part tout de suite. */
export const confirmationRequise = (mode: ModeConducteur): boolean => mode === 'spectacle';

/** Phrase de confirmation d'un saut. */
export const phraseConfirmation = (s: Saut): string =>
  'Sauter à ' + (s.niveau === 'etape' ? '« ' + s.libelle + ' » (' + s.sous + ')' : '« ' + s.libelle + ' »') + ' ? Entrée pour confirmer, Échap pour annuler.';

// ── appui long (PANIQUE) ───────────────────────────────────────────────────────────────────────────────────────────

/** Avancement de la jauge d'un appui long, de 0 à 1. */
export const progresAppuiLong = (ecouleMs: number, seuilMs = DUREE_APPUI_LONG_MS): number =>
  Math.max(0, Math.min(1, ecouleMs / seuilMs));

export interface OptionsAppuiLong {
  seuilMs?: number;
  /** appelé à chaque image de la jauge (0 à 1), puis une dernière fois avec 0 quand l'appui s'arrête */
  surProgres: (p: number) => void;
  /** appelé UNE fois quand le seuil est atteint (l'appui peut continuer, rien ne se répète) */
  surDeclenche: () => void;
  maintenant?: () => number;
}
export interface AppuiLong { commencer: () => void; arreter: () => void; enCours: () => boolean }

/** Contrôleur d'appui long : `commencer` à l'appui, `arreter` au relâchement, à la sortie du bouton ou à l'annulation. */
export function creerAppuiLong(o: OptionsAppuiLong): AppuiLong {
  const seuil = o.seuilMs ?? DUREE_APPUI_LONG_MS;
  const maintenant = o.maintenant ?? (() => Date.now());
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  let debut = 0;
  let actif = false;
  const tic = () => {
    if (!actif) return;
    const p = progresAppuiLong(maintenant() - debut, seuil);
    o.surProgres(p);
    if (p >= 1) { actif = false; minuteur = undefined; o.surDeclenche(); o.surProgres(0); return; }
    minuteur = setTimeout(tic, 16);
  };
  return {
    commencer() {
      if (actif) return;
      actif = true;
      debut = maintenant();
      o.surProgres(0);
      minuteur = setTimeout(tic, 16);
    },
    arreter() {
      if (minuteur !== undefined) clearTimeout(minuteur);
      minuteur = undefined;
      if (actif) { actif = false; o.surProgres(0); }
    },
    enCours: () => actif,
  };
}
