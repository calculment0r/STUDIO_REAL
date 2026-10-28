// Branchement de l'émulateur de téléphones (packages/emulateur) au magasin du Conducteur (audit 2026-10, rapport 2
// §4.4). Hors React : un petit magasin zustand pour le panneau (coquille/Emulateur.tsx), et l'émulateur lui-même.
//
// - Signaux : `sourceSignaux()` dit d'où viennent les signaux de la salle que lit le lecteur du magasin : ÉMULÉE
//   (comptés par le noyau du serveur sur les téléphones émulés) quand l'émulateur tourne en RÉPÉTITION, SIMULÉE (les
//   rotatifs, salle.ts) sinon. Une troisième source, RÉELLE (le vrai serveur de spectacle), viendra avec le lot qui
//   branche le Conducteur au serveur : elle prendra la même place (`brancherSignaux` du magasin).
// - SPECTACLE : l'émulateur est refusé, et arrêté si l'on passe en SPECTACLE (pas de téléphones émulés mêlés au public
//   réel, rapport 2 §4.5 et Q7).
// - GO : chaque GO accepté par le magasin part vers la salle émulée en `conduite{op:'top'}` (règle du GO : un second
//   `top` si l'étape menait au passage « go » du moment) ; si la salle émulée n'est toujours pas au moment du magasin,
//   elle y est recalée (`allerA`). Le premier GO (lancement) ne franchit rien : la salle est déjà au premier moment.
// - Projet : la salle émulée suit le projet du magasin (nouveau noyau relancé au même moment, les téléphones
//   repassent par `hello`) ; ses rotatifs aussi. La lecture du magasin en pause met la salle émulée en pause.
// - Vitesse : celle de l'horloge des spectateurs émulés (×1 ×4 ×20) ; le lecteur de la salle émulée est recalé sur le
//   Conducteur à chaque GO.
import { create } from 'zustand';
import type { Projet, SalleSimulee, Signaux } from '@studio-real/modele';
import {
  creerEmulateur, type BilanSalle, type EmulateurSalle, type EvenementSalle, type TelephoneSalle,
} from '@studio-real/emulateur';
import { brancherSignaux, useMagasin, type Magasin } from './magasin';
import { brancherTemoin } from './acteurs';
import { signauxSalle } from './moteur';

export type SourceSignaux = 'simulee' | 'emulee' | 'reelle';
export const VITESSES_EMULATEUR = [1, 4, 20] as const;
export const VITRINE_MAX = 12;

export interface ReglagesEmulateur {
  population: number;
  melange: string;
  graine: number;
  vitesse: number;
  /** arrivées : courbe `pres` des rotatifs, ou tout le monde au début */
  arrivees: 'salle' | 'toutes';
  /** les spectateurs répondent d'eux-mêmes (sinon : seulement les actions en masse et la main) */
  auto: boolean;
}

/** Un point du nuage de la foule. */
export interface PointFoule {
  id: string;
  profil: string;
  /** écran affiché ('hors-ligne', 'absent' : pas encore arrivé) */
  ecran: string;
  repondu: boolean;
  enLigne: boolean;
  visible: boolean;
  vitrine: boolean;
}

interface EtatEmulateur {
  ouvert: boolean;
  detache: boolean;
  reglages: ReglagesEmulateur;
  actif: boolean;
  bilan: BilanSalle | null;
  signaux: Signaux | null;
  points: PointFoule[];
  vitrine: string[];
  temoin: string | null;
  /** derniers événements lisibles (connexions, recalages…) */
  fil: string[];
  poser: (p: Partial<Omit<EtatEmulateur, 'poser' | 'basculer'>>) => void;
  basculer: () => void;
}

export const REGLAGES_DEFAUT: ReglagesEmulateur = { population: 120, melange: 'soiree', graine: 2026, vitesse: 1, arrivees: 'salle', auto: true };

export const useEmulateur = create<EtatEmulateur>((set, get) => ({
  ouvert: false,
  detache: false,
  reglages: { ...REGLAGES_DEFAUT },
  actif: false,
  bilan: null,
  signaux: null,
  points: [],
  vitrine: [],
  temoin: null,
  fil: [],
  poser: (p) => set(p),
  basculer: () => set({ ouvert: !get().ouvert }),
}));

// ─── hors React : l'émulateur courant ───────────────────────────────────────────────────────────────
let emu: EmulateurSalle | null = null;
let abonnements: (() => void)[] = [];
let minuteurProjet: ReturnType<typeof setTimeout> | undefined;
let minuteurVue: ReturnType<typeof setInterval> | undefined;
/** débranchement du bouton « Tester » de l'inspecteur Envois (etat/acteurs.ts : brancherTemoin) */
let debrancherTemoin: (() => void) | null = null;
/** heure émulée du démarrage (fil des événements) */
let origine = 0;

/** L'émulateur qui tourne (null sinon). */
export const emulateurCourant = (): EmulateurSalle | null => emu;

/** D'où viennent les signaux de la salle (et leur valeur) : émulée si l'émulateur tourne en RÉPÉTITION, simulée sinon. */
export function sourceSignaux(sens: SalleSimulee, tEtape: number): { source: SourceSignaux; signaux: Signaux } {
  if (emu && emu.actif && useMagasin.getState().mode === 'repetition') return { source: 'emulee', signaux: emu.signaux() };
  return { source: 'simulee', signaux: signauxSalle(sens, tEtape) };
}

function noter(texte: string) {
  const fil = [...useEmulateur.getState().fil, texte].slice(-12);
  useEmulateur.getState().poser({ fil });
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

function decrire(e: EvenementSalle): string | null {
  const t = mmss(e.t - origine);
  switch (e.type) {
    case 'lecture': return `${t} lecture · ${e.moment ?? '—'} › ${e.etape ?? 'passage'}`;
    case 'resync': return `${t} recalage · ${e.raison}`;
    default: return null;
  }
}

/** Relit l'émulateur pour le panneau (bilan, nuage, signaux). */
export function rafraichirEmulateur(): void {
  if (!emu) return;
  const points: PointFoule[] = emu.telephonesSalle().filter(t => t.acteur === 'public').map(t => {
    const e = t.etat();
    return {
      id: t.id, profil: t.profil.nom, ecran: !e.arrive ? 'absent' : e.enLigne ? e.ecran?.type ?? 'attente' : 'hors-ligne',
      repondu: e.aRepondu, enLigne: e.enLigne, visible: e.visible, vitrine: e.vitrine,
    };
  });
  useEmulateur.getState().poser({ bilan: emu.bilan(), signaux: emu.signaux(), points, actif: emu.actif });
}

/** Le GO du magasin vers la salle émulée (voir l'en-tête). `cible` : la lecture du magasin après le GO. */
export function transmettreGo(cible: Pick<Magasin, 'lecture'>): void {
  if (!emu) return;
  const avant = emu.salle.lecture();
  const L = cible.lecture;
  if (!avant || avant.termine) return;
  if (L && avant.moment === L.moment && avant.etape === L.etape) return;   // déjà là (premier GO : lancement)
  emu.go();
  const apres = emu.salle.lecture();
  if (L?.moment && apres && apres.moment !== L.moment && emu.salle.rep.projet.ev.some(m => m.id === L.moment)) {
    const ack = emu.conduite(L.etape ? { op: 'allerA', moment: L.moment, etape: L.etape } : { op: 'allerA', moment: L.moment });
    if (ack.statut === 'ok') noter(`recalage sur le Conducteur · ${L.moment}`);
  }
}

/** Démarre l'émulateur (RÉPÉTITION seulement). `boucle: false` : pas d'horloge temps réel ni de rafraîchissement (tests :
 *  on avance avec `emulateurCourant().avancer(ms)`). Renvoie faux si l'émulateur est refusé. */
export function demarrerEmulateur(o: Partial<ReglagesEmulateur> & { boucle?: boolean; urlTelephone?: string; debut?: number } = {}): boolean {
  const m = useMagasin.getState();
  if (m.mode === 'spectacle') {
    m.signaler('SPECTACLE : émulateur refusé (pas de téléphones émulés mêlés au public réel).');
    return false;
  }
  arreterEmulateur();
  const { boucle = true, urlTelephone, debut, ...reste } = o;
  const r: ReglagesEmulateur = { ...useEmulateur.getState().reglages, ...reste };
  const projet = m.projet;
  emu = creerEmulateur({
    projet, graine: r.graine, population: { nombre: r.population, melange: r.melange }, sens: projet.sens, auto: r.auto,
    arrivees: r.arrivees, rendu: { vitrineMax: VITRINE_MAX, urlTelephone: urlTelephone ?? adresseTelephone() },
    ...(debut !== undefined ? { horloge: { debut } } : {}),
  });
  const e = emu;
  origine = e.maintenant();
  void e.demarrer();
  // la salle émulée se met à la place du Conducteur, et en pause si la lecture l'est
  const L = m.lecture;
  if (L?.moment && L.moment !== e.salle.lecture()?.moment) e.conduite(L.etape ? { op: 'allerA', moment: L.moment, etape: L.etape } : { op: 'allerA', moment: L.moment });
  if (!m.enLecture) e.conduite({ op: 'pause', pause: true });
  brancherSignaux((sens, t) => sourceSignaux(sens, t).signaux);
  // bouton « Tester » (planche des acteurs) : la vue est FORCÉE dans la salle émulée, jamais vers le vrai public
  // (l'émulateur est refusé en SPECTACLE). Elle touche les téléphones émulés de cet acteur, pas seulement le témoin épinglé.
  debrancherTemoin?.();
  debrancherTemoin = brancherTemoin(vue => {
    if (!emu || !vue.ecran) return false;
    return emu.conduite({ op: 'forcer', acteur: vue.acteur, vue: { ecran: vue.ecran, params: vue.params } }).statut === 'ok';
  });

  abonnements.push(e.surEvenement(ev => { const t = decrire(ev); if (t) noter(t); }));
  abonnements.push(useMagasin.subscribe((s, p) => {
    if (!emu) return;
    if (s.mode !== p.mode && s.mode === 'spectacle') {
      arreterEmulateur();
      // après le message du changement de mode (posé juste après ce changement d'état)
      queueMicrotask(() => useMagasin.getState().signaler('SPECTACLE : émulateur arrêté (pas de téléphones émulés pendant une représentation).'));
      return;
    }
    if (s.dernierGo !== p.dernierGo && s.dernierGo) transmettreGo(s);
    if (s.enLecture !== p.enLecture) emu.conduite({ op: 'pause', pause: !s.enLecture });
    if (s.projet !== p.projet) {
      if (s.projet.sens !== p.projet.sens) emu.reglerSens(s.projet.sens);
      const avant = p.projet;
      clearTimeout(minuteurProjet);
      minuteurProjet = setTimeout(() => {
        const courant = useMagasin.getState().projet;
        if (!emu || courant === avant || memeStructure(courant, avant)) return;
        emu.changerProjet(courant);
        noter('projet modifié · la salle émulée suit');
      }, 600);
    }
  }));
  if (boucle) {
    e.tempsReel(r.vitesse);
    minuteurVue = setInterval(rafraichirEmulateur, 250);
  }
  useEmulateur.getState().poser({ reglages: r, actif: true, fil: [] });
  rafraichirEmulateur();
  return true;
}

/** Le projet a-t-il changé ailleurs que dans les rotatifs (seuls ev, acteurs et séquences comptent pour le noyau) ? */
function memeStructure(a: Projet, b: Projet): boolean {
  return a.ev === b.ev && a.acteurs === b.acteurs && a.sequences === b.sequences;
}

export function arreterEmulateur(): void {
  clearTimeout(minuteurProjet);
  clearInterval(minuteurVue);
  minuteurVue = undefined;
  for (const f of abonnements) f();
  abonnements = [];
  brancherSignaux(null);
  debrancherTemoin?.();
  debrancherTemoin = null;
  const e = emu;
  emu = null;
  if (e) void e.arreter();
  useEmulateur.getState().poser({ actif: false, bilan: null, signaux: null, points: [], vitrine: [], temoin: null });
}

export function remettreAZero(): boolean {
  const r = useEmulateur.getState().reglages;
  arreterEmulateur();
  return demarrerEmulateur(r);
}

export function changerVitesseEmulateur(v: number): void {
  const reglages = { ...useEmulateur.getState().reglages, vitesse: v };
  useEmulateur.getState().poser({ reglages });
  if (emu && minuteurVue !== undefined) emu.tempsReel(v);
}

export function reglerAutoEmulateur(auto: boolean): void {
  useEmulateur.getState().poser({ reglages: { ...useEmulateur.getState().reglages, auto } });
  emu?.reglerAuto(auto);
}

// ─── vitrine et témoin ──────────────────────────────────────────────────────────────────────────────

/** Adresse de l'application téléphone servie à côté du Conducteur (vite.config.ts : /t/ → apps/telephone/dist). */
export function adresseTelephone(): string {
  if (typeof location === 'undefined') return '/t/';
  const q = new URLSearchParams(location.search).get('telephone');
  return q && q.startsWith('/') ? q : '/t/';
}

export const telephoneEmule = (id: string): TelephoneSalle | undefined => emu?.telephone(id) as TelephoneSalle | undefined;

/** Met un téléphone en vitrine (12 au plus) ; sans id : le prochain arrivé qui n'y est pas. */
export function mettreEnVitrine(id?: string): string | null {
  if (!emu) return null;
  const s = useEmulateur.getState();
  if (s.vitrine.length >= VITRINE_MAX) { useMagasin.getState().signaler(`Vitrine pleine (${VITRINE_MAX} téléphones).`); return null; }
  const choix = id ?? emu.telephonesSalle().find(t => t.acteur === 'public' && t.arrive && !s.vitrine.includes(t.id))?.id;
  if (!choix || s.vitrine.includes(choix)) return null;
  s.poser({ vitrine: [...s.vitrine, choix] });
  return choix;
}

export function retirerDeVitrine(id: string): void {
  telephoneEmule(id)?.fermerVitrine();
  const s = useEmulateur.getState();
  s.poser({ vitrine: s.vitrine.filter(x => x !== id) });
}

export function epingler(id: string | null): void {
  useEmulateur.getState().poser({ temoin: id });
}
