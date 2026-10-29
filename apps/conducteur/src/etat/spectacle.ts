// Client RÉGIE du serveur de spectacle (audit 2026-10 : rapport 1 §4.2 et §4.3, rapport 2 §4.2 a et §4.3, rapport 3 §4.2,
// rapport 5 §4.4). Il remplace le pont des figurants (coquille/pont-figurants.ts, retiré) : le Conducteur en SPECTACLE se
// relie au serveur de spectacle, lui envoie ses ordres de conduite et voit ce que chaque sortie affiche vraiment.
//
// - Réglages (fenêtre Projet › Spectacle, jamais dans l'adresse) : adresse du serveur et adresse publique (localStorage),
//   jeton de la régie et jeton des acteurs (sessionStorage seulement : saisis une fois par onglet, jamais écrits ailleurs).
// - Liaison : `hello{role:'regie'}` par le transport WebSocket de l'application téléphone (@studio-real/ui-telephone :
//   reconnexion à attente croissante, ping toutes les 2 s, horloge), session et `cseq` gardés dans l'onglet.
// - Voyant (en-tête, rail) : relié (vert) · connexion (ambre) · absent (rouge) · périmé = sans nouvelles depuis 5 s
//   (rouge FIXE) · jeton refusé (rouge) ; un ordre `top` non accusé : ambre, rouge à 5 s.
// - En SPECTACLE relié, chaque geste de conduite du magasin part en `conduite` : GO → un `top` par top joué
//   localement, saut → `allerA`, mémoire → `poser`, signal → `signal`, reprise → `reprendre`, lecture / pause →
//   `pause`, RETENIR → `retenir`, +30 s → `prolonger`, PANIQUE → `panique`. Forcer une vue : fonction ci-dessous (rail). Un ordre n'est JAMAIS mis
//   en file pendant une coupure : il serait rejoué en retard ; la régie est prévenue qu'il n'est pas parti.
// - Lecture MIROIR : chaque `lecture{etat}` reçu recale le lecteur local (`resynchroniser` du magasin) ; entre deux, le
//   lecteur local anime la conduite à 60 i/s.
// - Retours : `salle` → résumé par acteur (etat/acteurs.ts) ; `etat` d'un acteur nommé → etat/acteurs.ts ; `refus` →
//   voyant et message. Alertes (bandeau) : acteur perdu, sortie périmée, chute des connectés, écart > 5 s, serveur muet.
import { create } from 'zustand';
import { acteursEcho, type Acteur, type EtatLecture, type Projet } from '@studio-real/modele';
import { VERSION_PROTOCOLE, type MessageServeur, type MsgConduite, type MsgHello, type OpConduite } from '@studio-real/protocole';
import { transportWebSocket, type EtatTransport, type FabriqueHello, type TransportTelephone } from '@studio-real/ui-telephone';
import { useMagasin, surConduiteLocale, type GesteConduite } from './magasin';
import {
  agregatsFoule, chuteConnectes, diagnosticActeur, ECART_AMBRE_MS, ECART_ROUGE_MS, libelleEcran, magasinActeurs,
  oublierActeurs, poserEtatActeur, poserResumeSalle, type AgregatsFoule, type Diagnostic, type EtatActeursMagasin, type Pastille,
} from './acteurs';
import { configurerSortie, useSortie, type EtatRelais } from '../sortie/relais';
import { VERSION_SORTIE } from '../sortie/protocole';

/** Sans nouvelles du serveur depuis ce délai : voyant rouge fixe (« périmé »), alerte « serveur muet ». */
export const MUET_MS = 5000;
/** Un ordre non accusé : ambre tout de suite, rouge au-delà de ce délai. */
export const ACCUSE_ROUGE_MS = 5000;
/** Ping du transport (le serveur répond `pong` : la liaison est vivante même quand la salle est calme). */
export const PING_MS = 2000;
/** Rafraîchissement du voyant et des alertes (≤ 4 par seconde). */
export const SURVEILLANCE_MS = 250;

const CLES = {
  adresse: 'studio-real:spectacle:adresse',
  publique: 'studio-real:spectacle:adresse-publique',
  jetonRegie: 'studio-real:spectacle:jeton-regie',
  jetonActeur: 'studio-real:spectacle:jeton-acteur',
  session: 'studio-real:spectacle:session',
  cseq: 'studio-real:spectacle:cseq',
} as const;

// ── stockage (sans lever : navigation privée stricte, tests sous Node) ─────────────────────────────────────────────

const memoire = { local: new Map<string, string>(), session: new Map<string, string>() };
function stock(genre: 'local' | 'session') {
  const reel = (): Storage | null => {
    try { return (genre === 'local' ? globalThis.localStorage : globalThis.sessionStorage) ?? null; } catch { return null; }
  };
  return {
    lire(cle: string): string | null {
      try { const s = reel(); if (s) return s.getItem(cle); } catch { /* bloqué */ }
      return memoire[genre].get(cle) ?? null;
    },
    ecrire(cle: string, v: string | null) {
      try {
        const s = reel();
        if (s) { if (v === null) s.removeItem(cle); else s.setItem(cle, v); return; }
      } catch { /* bloqué */ }
      if (v === null) memoire[genre].delete(cle); else memoire[genre].set(cle, v);
    },
  };
}
const local = stock('local');
const onglet = stock('session');

// ── adresses et liens ──────────────────────────────────────────────────────────────────────────────────────────────

/** Adresse du serveur (https://… ou wss://…) → adresse WebSocket (`/ws` par défaut). null : illisible. */
export function adresseWebSocket(adresse: string): string | null {
  const a = adresse.trim();
  if (!a) return null;
  try {
    const u = new URL(a);
    if (u.protocol === 'https:') u.protocol = 'wss:';
    else if (u.protocol === 'http:') u.protocol = 'ws:';
    else if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return null;
    if (u.pathname === '/' || u.pathname === '') u.pathname = '/ws';
    u.hash = '';
    return u.toString();
  } catch { return null; }
}

/** Adresse HTTP du serveur (pour /config.json), depuis l'adresse réglée. */
export function adresseHttp(adresse: string): string | null {
  try {
    const u = new URL(adresse.trim());
    if (u.protocol === 'wss:') u.protocol = 'https:';
    else if (u.protocol === 'ws:') u.protocol = 'http:';
    else if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch { return null; }
}

/** Base de l'application téléphone : `<adresse publique>/t/` (une adresse qui finit déjà par /t est gardée). */
export function baseTelephone(adressePublique: string): string | null {
  const a = adressePublique.trim();
  if (!/^https?:\/\//i.test(a)) return null;
  try {
    const u = new URL(a);
    u.hash = ''; u.search = '';
    let p = u.pathname.replace(/\/+$/, '');
    if (!p.endsWith('/t')) p += '/t';
    u.pathname = p + '/';
    return u.toString();
  } catch { return null; }
}

/** Lien d'un acteur nommé : jeton dans le FRAGMENT (jamais dans `?` : ni envoyé au serveur, ni journalisé). */
export function lienActeur(adressePublique: string, acteur: string, jeton: string): string | null {
  const base = baseTelephone(adressePublique);
  if (!base) return null;
  return `${base}#acteur=${encodeURIComponent(acteur)}&jeton=${encodeURIComponent(jeton)}`;
}
/** Lien du public : l'application téléphone sans jeton nommé (QR projeté par la sortie). */
export const lienPublic = (adressePublique: string): string | null => baseTelephone(adressePublique);

// ── réglages ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Reglages {
  adresse: string;
  adressePublique: string;
  /** les jetons ne sortent pas de ce module : on dit seulement s'ils sont connus */
  jetonRegie: boolean;
  jetonActeur: boolean;
}
export function lireReglages(): Reglages {
  return {
    adresse: local.lire(CLES.adresse) ?? '',
    adressePublique: local.lire(CLES.publique) ?? '',
    jetonRegie: !!onglet.lire(CLES.jetonRegie),
    jetonActeur: !!onglet.lire(CLES.jetonActeur),
  };
}
/** Jeton des acteurs (liens des téléphones nommés) ; null s'il n'a pas été saisi dans cet onglet. */
export const jetonActeurSpectacle = (): string | null => onglet.lire(CLES.jetonActeur);

/** Adresse publique retenue (QR du public, liens d'acteurs) ; '' si aucune. Lue aussi par sortie/protocole.ts. */
export const adressePubliqueSpectacle = (): string => local.lire(CLES.publique) ?? '';

/** Change les réglages. Une valeur vide efface ; `undefined` laisse tel quel. Relie de nouveau si l'adresse ou le
 *  jeton de la régie change pendant une liaison. */
export function reglerSpectacle(r: Partial<{ adresse: string; adressePublique: string; jetonRegie: string; jetonActeur: string }>): void {
  const avant = lireReglages();
  const jetonAvant = onglet.lire(CLES.jetonRegie);
  if (r.adresse !== undefined) local.ecrire(CLES.adresse, r.adresse.trim() || null);
  if (r.adressePublique !== undefined) local.ecrire(CLES.publique, r.adressePublique.trim() || null);
  if (r.jetonRegie !== undefined) onglet.ecrire(CLES.jetonRegie, r.jetonRegie.trim() || null);
  if (r.jetonActeur !== undefined) onglet.ecrire(CLES.jetonActeur, r.jetonActeur.trim() || null);
  const apres = lireReglages();
  useSpectacle.setState({ reglages: apres });
  // le QR du public (sortie) suit l'adresse publique du spectacle
  if (apres.adressePublique !== avant.adressePublique) configurerSortie({});
  const change = apres.adresse !== avant.adresse || onglet.lire(CLES.jetonRegie) !== jetonAvant;
  if (change && transport) relierSpectacle(optionsCourantes);
}

// ── état observable ────────────────────────────────────────────────────────────────────────────────────────────────

/** eteinte : pas relié · connexion : premier essai · ouverte : `bienvenue` reçu · absente : coupure, reconnexion
 *  programmée · jeton-refuse · refusee : refus fatal du serveur (rôle, version). */
export type Ligne = 'eteinte' | 'connexion' | 'ouverte' | 'absente' | 'jeton-refuse' | 'refusee';

export interface OrdreEnAttente { cseq: number; op: OpConduite['op']; envoye: number }

export interface ConfigPublique {
  spectacle?: string;
  representation?: string | null;
  adresses?: { publique?: string; locale?: string; secours?: string };
  version?: string | null;
  run?: string | null;
}

export interface AlerteSpectacle {
  /** clé stable de la condition (accusé « bien reçu ») */
  cle: string;
  code: 'muet' | 'absent' | 'jeton' | 'go' | 'perdu' | 'perimee' | 'ecart' | 'chute';
  texte: string;
  gravite: 'ambre' | 'rouge';
}

export interface Voyant { pastille: Pastille; libelle: string; detail: string }

export interface EtatSpectacle {
  reglages: Reglages;
  ligne: Ligne;
  /** heure locale du dernier message ou pong du serveur (0 : jamais) */
  dernierContact: number;
  /** heure locale du dernier `bienvenue` */
  ouvertLe: number;
  rttMs?: number;
  decalageMs?: number;
  /** ordres envoyés, pas encore accusés */
  enAttente: OrdreEnAttente[];
  dernierAccuse: { cseq: number; op: string; statut: string; heure: number } | null;
  refus: { code: string; message: string; heure: number } | null;
  config: ConfigPublique | null;
  /** heure locale de la dernière `lecture` reçue */
  lectureRecue: number;
  voyant: Voyant;
  alertes: AlerteSpectacle[];
}

const voyantEteint: Voyant = { pastille: 'eteinte', libelle: 'SERVEUR', detail: 'Serveur de spectacle non relié (fenêtre Projet › Spectacle)' };
export const useSpectacle = create<EtatSpectacle>(() => ({
  reglages: lireReglages(), ligne: 'eteinte', dernierContact: 0, ouvertLe: 0, enAttente: [], dernierAccuse: null, refus: null,
  config: null, lectureRecue: 0, voyant: voyantEteint, alertes: [],
}));

/** Le voyant du serveur (PUR) : liaison, puis ordres non accusés. */
export function voyantSpectacle(e: Pick<EtatSpectacle, 'ligne' | 'dernierContact' | 'enAttente' | 'refus' | 'rttMs'>, maintenant: number): Voyant {
  const rtt = e.rttMs !== undefined ? ` · aller-retour ${Math.round(e.rttMs)} ms` : '';
  switch (e.ligne) {
    case 'eteinte': return voyantEteint;
    case 'jeton-refuse': return { pastille: 'rouge', libelle: 'JETON REFUSÉ', detail: 'Le serveur refuse le jeton de la régie : le corriger dans Projet › Spectacle' };
    case 'refusee': return { pastille: 'rouge', libelle: 'REFUSÉ', detail: 'Le serveur refuse la régie : ' + (e.refus?.message ?? '') };
    case 'connexion': return { pastille: 'ambre', libelle: 'CONNEXION', detail: 'Connexion au serveur de spectacle…' };
    case 'absente': return { pastille: 'rouge', libelle: 'ABSENT', detail: 'Serveur de spectacle injoignable : reconnexion en cours' };
    case 'ouverte': break;
  }
  const muet = maintenant - e.dernierContact;
  if (muet > MUET_MS) return { pastille: 'rouge', libelle: 'PÉRIMÉ', detail: `Aucune nouvelle du serveur depuis ${Math.round(muet / 1000)} s` };
  const tops = e.enAttente.filter(o => o.op === 'top');
  const plusVieux = tops.length ? Math.min(...tops.map(o => o.envoye)) : null;
  if (plusVieux !== null && maintenant - plusVieux > ACCUSE_ROUGE_MS) return { pastille: 'rouge', libelle: 'GO NON ACCUSÉ', detail: `Le serveur n’a pas accusé le GO depuis ${Math.round((maintenant - plusVieux) / 1000)} s` + rtt };
  if (plusVieux !== null) return { pastille: 'ambre', libelle: 'GO…', detail: 'GO envoyé, en attente de l’accusé du serveur' + rtt };
  if (e.enAttente.length) return { pastille: 'ambre', libelle: 'RELIÉ', detail: 'Ordre envoyé, en attente de l’accusé' + rtt };
  return { pastille: 'verte', libelle: 'RELIÉ', detail: 'Serveur de spectacle relié' + rtt };
}

// ── les acteurs du rail ────────────────────────────────────────────────────────────────────────────────────────────

/** Une vignette du rail des sorties (et une ligne de la section SORTIES du panneau Régie). */
export interface VignetteActeur {
  id: string;
  nom: string;
  type: Acteur['type'];
  cardinalite: 1 | 'n';
  diag: Diagnostic;
  /** foule seulement */
  agregats?: AgregatsFoule;
  /** d'où vient ce qu'on montre : serveur, sortie locale (repli), rien */
  source: 'serveur' | 'local' | 'aucune';
  perimee?: boolean;
}

/** Acteurs montrés : ceux du projet, sinon ceux que nomme le serveur (Écho converti) ; l'écran scène au moins. */
export function acteursDuRail(projet: Pick<Projet, 'acteurs'>, idsServeur: readonly string[]): Pick<Acteur, 'id' | 'nom' | 'type' | 'cardinalite'>[] {
  const declares = (projet.acteurs ?? []).filter(a => a && a.type !== 'regie');
  if (declares.length) return declares;
  const echo = new Map(acteursEcho().map(a => [a.id, a] as const));
  const out: Pick<Acteur, 'id' | 'nom' | 'type' | 'cardinalite'>[] = idsServeur.map(id => echo.get(id) ?? { id, nom: id, type: 'ecran', cardinalite: 1 });
  if (!out.some(a => a.type === 'ecran')) out.unshift({ id: 'scene', nom: 'Écran scène', type: 'ecran', cardinalite: 1 });
  return out;
}

/** Ce que la sortie écran scène de CETTE machine dit (repli quand le serveur ne la relaie pas). */
export interface SortieLocale {
  fenetre: EtatRelais['fenetre'];
  demande: string | null;
  affiche: string | null;
  /** heure locale où l'écart publié ≠ vu a commencé (0 : pas d'écart) */
  ecartDepuis: number;
  perimee: boolean;
  vuLe: number;
  absent?: string;
}

/** Diagnostic de la sortie locale (PUR). */
export function diagnosticSortieLocale(s: SortieLocale, maintenant: number, spectacle: boolean): Diagnostic {
  const alertes: string[] = [];
  if (s.perimee) return { pastille: 'rouge', liaison: 'reliee', affiche: s.affiche, demande: s.demande, ecartMs: 0, alertes: ['sortie périmée : recharger'] };
  if (s.fenetre === 'fermee') return { pastille: spectacle ? 'rouge' : 'eteinte', liaison: spectacle ? 'perdue' : 'inconnue', affiche: null, demande: s.demande, ecartMs: 0, alertes: spectacle ? ['fenêtre de sortie fermée'] : [] };
  if (s.fenetre === 'ouverte') return { pastille: 'ambre', liaison: 'attente', affiche: null, demande: s.demande, ecartMs: 0, alertes: ['fenêtre ouverte, sans réponse'] };
  const ecartMs = s.ecartDepuis ? Math.max(0, maintenant - s.ecartDepuis) : 0;
  let pastille: Pastille = 'verte';
  if (ecartMs > ECART_AMBRE_MS) {
    pastille = ecartMs > ECART_ROUGE_MS ? 'rouge' : 'ambre';
    alertes.push(`demandé : ${libelleEcran(s.demande)} · affiché : ${libelleEcran(s.affiche)}`);
  }
  if (s.absent) { if (pastille === 'verte') pastille = 'ambre'; alertes.push('média absent : ' + s.absent); }
  return { pastille, liaison: 'reliee', affiche: s.affiche, demande: s.demande, ecartMs, alertes };
}

let ecartLocalDepuis = 0;
/** Lit l'état de la sortie locale (sortie/relais.ts) et suit la durée de l'écart. */
export function sortieLocale(s: EtatRelais = useSortie.getState(), maintenant = Date.now()): SortieLocale {
  const connectee = s.fenetre === 'connectee';
  const differe = connectee && !!s.scene && s.sceneVue !== s.scene.type;
  if (!differe && !s.ecart) ecartLocalDepuis = 0;
  else if (!ecartLocalDepuis) ecartLocalDepuis = maintenant - (s.ecart ? ECART_AMBRE_MS : 0);
  return {
    fenetre: s.fenetre, demande: s.scene?.type ?? null, affiche: connectee ? s.sceneVue : null, ecartDepuis: ecartLocalDepuis,
    perimee: s.fenetre !== 'fermee' && s.versionSortie !== null && s.versionSortie !== VERSION_SORTIE, vuLe: s.vuLe,
    ...(connectee && s.sortie?.absent ? { absent: s.sortie.absent } : {}),
  };
}

/** Les vignettes du rail (PUR, à partir des magasins lus). */
export function vignettesSorties(x: {
  projet: Pick<Projet, 'acteurs'>;
  acteurs: EtatActeursMagasin;
  local: SortieLocale;
  spectacle: boolean;
  maintenant: number;
}): VignetteActeur[] {
  const { acteurs: a, maintenant } = x;
  const salleConnue = a.recu > 0;
  return acteursDuRail(x.projet, Object.keys(a.resumes)).map(act => {
    const etat = a.etats[act.id];
    const resume = a.resumes[act.id];
    const base = { id: act.id, nom: act.nom, type: act.type, cardinalite: act.cardinalite };
    if (act.type === 'agent') {
      const n = resume?.presents ?? 0;
      const diag: Diagnostic = {
        pastille: !salleConnue ? 'eteinte' : n ? 'verte' : 'rouge', liaison: !salleConnue ? 'inconnue' : n ? 'reliee' : 'perdue',
        affiche: n ? 'connecté' : null, demande: null, ecartMs: 0, alertes: salleConnue && !n ? ['agent absent'] : [],
      };
      return { ...base, diag, source: salleConnue ? 'serveur' : 'aucune' };
    }
    // l'écran scène : le relais du serveur s'il est frais, sinon la sortie de cette machine
    const serveurFrais = !!etat && etat.source === 'serveur' && maintenant - etat.recu < 12_000;
    if (act.type === 'ecran' && !serveurFrais && (x.local.fenetre !== 'fermee' || !salleConnue)) {
      return { ...base, diag: diagnosticSortieLocale(x.local, maintenant, x.spectacle), source: 'local', perimee: x.local.perimee };
    }
    const diag = diagnosticActeur({ acteur: act, ...(etat ? { etat } : {}), ...(resume ? { resume } : {}), vote: a.vote, salleConnue, maintenant });
    const v: VignetteActeur = { ...base, diag, source: salleConnue || etat ? 'serveur' : 'aucune' };
    if (act.cardinalite === 'n') v.agregats = agregatsFoule(resume, a.vote);
    return v;
  });
}

/** Les alertes du bandeau (PUR) : serveur muet ou absent, jeton refusé, GO non accusé, acteur perdu, sortie
 *  périmée, écart demandé / affiché > 5 s, chute de plus de 10 % des connectés en 10 s. */
export function alertesSpectacle(x: {
  voyant: Voyant;
  ligne: Ligne;
  avaitEteRelie: boolean;
  vignettes: readonly VignetteActeur[];
  historique: EtatActeursMagasin['historique'];
  maintenant: number;
}): Omit<AlerteSpectacle, 'cle'>[] {
  const out: Omit<AlerteSpectacle, 'cle'>[] = [];
  if (x.ligne === 'jeton-refuse') out.push({ code: 'jeton', texte: 'Jeton de la régie refusé par le serveur de spectacle', gravite: 'rouge' });
  else if (x.ligne === 'ouverte' && x.voyant.libelle === 'PÉRIMÉ') out.push({ code: 'muet', texte: 'Serveur de spectacle muet · ' + x.voyant.detail.toLowerCase(), gravite: 'rouge' });
  else if (x.ligne === 'absente' && x.avaitEteRelie) out.push({ code: 'absent', texte: 'Serveur de spectacle injoignable : reconnexion en cours', gravite: 'rouge' });
  if (x.voyant.libelle === 'GO NON ACCUSÉ') out.push({ code: 'go', texte: x.voyant.detail, gravite: 'rouge' });
  for (const v of x.vignettes) {
    if (v.perimee) out.push({ code: 'perimee', texte: `${v.nom} : sortie périmée, la recharger`, gravite: 'rouge' });
    else if (v.diag.liaison === 'perdue' && v.cardinalite === 1 && v.source !== 'aucune') out.push({ code: 'perdu', texte: `${v.nom} perdu · ${v.diag.alertes[0] ?? ''}`, gravite: 'rouge' });
    if (v.diag.ecartMs > ECART_ROUGE_MS) {
      out.push({ code: 'ecart', texte: `${v.nom} · demandé : ${libelleEcran(v.diag.demande)} · affiché : ${libelleEcran(v.diag.affiche)} depuis ${Math.round(v.diag.ecartMs / 1000)} s`, gravite: 'rouge' });
    }
  }
  const chute = chuteConnectes(x.historique, x.maintenant);
  if (chute) out.push({ code: 'chute', texte: `Connectés : ${chute.avant} → ${chute.apres} en 10 s (−${Math.round(chute.part * 100)} %)`, gravite: 'rouge' });
  return out;
}

// ── la liaison ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface OptionsLiaison {
  /** fabrique du transport (tests : transportMemoire) ; défaut : WebSocket */
  creerTransport?: (url: string, jeton: string, hello: FabriqueHello) => TransportTelephone;
  /** lire /config.json du serveur après la connexion (défaut : vrai) */
  config?: boolean;
}

let transport: TransportTelephone | null = null;
let desabonner: (() => void)[] = [];
let optionsCourantes: OptionsLiaison = {};
let avaitEteRelie = false;
/** début de chaque condition d'alerte (clé stable pour « bien reçu ») */
const debutsAlertes = new Map<string, number>();

function sessionOnglet(): string {
  let s = onglet.lire(CLES.session);
  if (!s || !/^[A-Za-z0-9_-]{6,64}$/.test(s)) {
    let alea = '';
    try { const a = new Uint8Array(12); globalThis.crypto.getRandomValues(a); alea = Array.from(a, x => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join(''); }
    catch { alea = Math.random().toString(36).slice(2, 14); }
    s = 'regie_' + alea;
    onglet.ecrire(CLES.session, s);
  }
  return s;
}
const lireCseq = (): number => { const n = Number(onglet.lire(CLES.cseq)); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
let cseq = 0;

const signaler = (t: string) => { try { useMagasin.getState().signaler(t); } catch { /* magasin absent */ } };

function helloRegie(): Omit<MsgHello, 'jeton'> {
  const build = typeof __BUILD__ === 'string' && __BUILD__ ? __BUILD__ : 'dev';
  return { t: 'hello', v: VERSION_PROTOCOLE, role: 'regie', session: sessionOnglet(), cseq, app: { version: 'conducteur', build } };
}

/** Relie la régie au serveur de spectacle (adresse et jeton des réglages). Faux si les réglages manquent. */
export function relierSpectacle(o: OptionsLiaison = {}): boolean {
  delierInterne(false);
  optionsCourantes = o;
  const url = adresseWebSocket(local.lire(CLES.adresse) ?? '');
  const jeton = onglet.lire(CLES.jetonRegie);
  useSpectacle.setState({ reglages: lireReglages() });
  if (!url || !jeton) {
    useSpectacle.setState({ ligne: 'eteinte', voyant: voyantEteint });
    return false;
  }
  cseq = Math.max(cseq, lireCseq());
  avaitEteRelie = false;
  useSpectacle.setState({ ligne: 'connexion', refus: null, enAttente: [], dernierContact: 0, config: null });
  const fabrique = o.creerTransport ?? ((u, j, hello) => transportWebSocket(u, j, { hello, pingMs: PING_MS }));
  const t = fabrique(url, jeton, helloRegie);
  transport = t;
  desabonner.push(
    t.surMessage(m => { if (transport === t) recevoir(m); }),
    t.surEtat(e => { if (transport === t) etatTransport(e); }),
    surConduiteLocale(relayerGeste),
    useMagasin.subscribe((s, p) => {
      if (s.enLecture === p.enLecture || s.mode !== 'spectacle' || s.lecture?.termine) return;
      envoyerConduite({ op: 'pause', pause: !s.enLecture }, { silencieux: true });
    }),
  );
  demarrerSurveillance();
  return true;
}

function delierInterne(remettre: boolean) {
  for (const f of desabonner) { try { f(); } catch { /* rien */ } }
  desabonner = [];
  const t = transport;
  transport = null;
  if (t) { try { t.fermer(); } catch { /* rien */ } }
  if (remettre) {
    oublierActeurs();
    useSpectacle.setState({ ligne: 'eteinte', enAttente: [], voyant: voyantEteint, alertes: [], dernierContact: 0, refus: null });
  }
}

/** Délie la régie (le Conducteur redevient autonome ; le lecteur local reprend la main). */
export function delierSpectacle(): void {
  delierInterne(true);
  useMagasin.setState({ miroir: false });
}

function etatTransport(e: EtatTransport) {
  const s = useSpectacle.getState();
  if (s.ligne === 'jeton-refuse' || s.ligne === 'refusee') return;
  const maj: Partial<EtatSpectacle> = {};
  if (e.rttMs !== undefined) { maj.rttMs = e.rttMs; maj.dernierContact = Date.now(); }
  if (e.decalageMs !== undefined) maj.decalageMs = e.decalageMs;
  if (e.etat === 'attente') maj.ligne = 'absente';
  else if (e.etat === 'connexion') maj.ligne = 'connexion';
  else if (e.etat === 'ferme') maj.ligne = 'eteinte';
  // 'ouvert' : la ligne passe à « ouverte » au `bienvenue`
  useSpectacle.setState(maj);
}

async function chargerConfig() {
  const base = adresseHttp(local.lire(CLES.adresse) ?? '');
  if (!base || typeof fetch !== 'function') return;
  try {
    const r = await fetch(base + '/config.json', { cache: 'no-store' });
    if (!r.ok) return;
    const c = await r.json() as ConfigPublique;
    if (!c || typeof c !== 'object') return;
    useSpectacle.setState({ config: c });
    const publique = c.adresses?.publique;
    if (!local.lire(CLES.publique) && typeof publique === 'string' && /^https?:\/\//i.test(publique)) {
      local.ecrire(CLES.publique, publique);
      useSpectacle.setState({ reglages: lireReglages() });
      configurerSortie({});
    }
  } catch { /* serveur sans /config.json : les réglages suffisent */ }
}

function recevoir(m: MessageServeur) {
  const maintenant = Date.now();
  useSpectacle.setState({ dernierContact: maintenant });
  switch (m.t) {
    case 'bienvenue': {
      const s = useSpectacle.getState();
      cseq = Math.max(cseq, m.cseq);
      onglet.ecrire(CLES.cseq, String(cseq));
      // ordres partis avant la coupure : reçus (accusé perdu) ou perdus ; jamais renvoyés en retard
      const perdus = s.enAttente.filter(o => o.cseq > m.cseq);
      if (perdus.length) signaler(`⚠ ${perdus.length} ordre(s) non reçu(s) par le serveur (${perdus.map(o => o.op).join(', ')}) : à refaire`);
      avaitEteRelie = true;
      useSpectacle.setState({ ligne: 'ouverte', ouvertLe: maintenant, enAttente: [], refus: null });
      if (m.lecture) recevoirLecture(m.lecture.etat, maintenant);
      if (optionsCourantes.config !== false) void chargerConfig();
      return;
    }
    case 'lecture': recevoirLecture(m.etat, maintenant); return;
    case 'salle': poserResumeSalle(m, maintenant); return;
    case 'etat': {
      const { t: _t, acteur, ...reste } = m;
      void _t;
      poserEtatActeur(acteur, { ...reste, recu: maintenant, source: 'serveur' });
      return;
    }
    case 'ack': {
      const s = useSpectacle.getState();
      const o = s.enAttente.find(x => x.cseq === m.cseq);
      const maj: Partial<EtatSpectacle> = {
        enAttente: s.enAttente.filter(x => x.cseq !== m.cseq),
        dernierAccuse: { cseq: m.cseq, op: o?.op ?? '?', statut: m.statut, heure: maintenant },
      };
      if (m.statut === 'refus') {
        maj.refus = { code: 'conduite', message: `${o?.op ?? 'ordre'} refusé : ${m.raison ?? 'sans raison'}`, heure: maintenant };
        signaler(`⚠ Serveur : ${maj.refus.message}`);
      }
      useSpectacle.setState(maj);
      return;
    }
    case 'refus': {
      const refus = { code: m.code, message: m.message, heure: maintenant };
      if (m.code === 'jeton') {
        useSpectacle.setState({ ligne: 'jeton-refuse', refus, enAttente: [] });
        arreterTransport();
        signaler('⚠ Serveur de spectacle : jeton de la régie refusé');
      } else if (m.fatal) {
        useSpectacle.setState({ ligne: 'refusee', refus, enAttente: [] });
        arreterTransport();
        signaler('⚠ Serveur de spectacle : ' + m.message);
      } else {
        useSpectacle.setState({ refus });
      }
      return;
    }
    case 'resync': transport?.renouer(); return;
    default: return;   // vue, fx, agent.cmd, rtc, pong : pas pour la régie
  }
}

function arreterTransport() {
  const t = transport;
  transport = null;
  if (t) { try { t.fermer(); } catch { /* rien */ } }
}

function recevoirLecture(etat: EtatLecture, maintenant: number) {
  useSpectacle.setState({ lectureRecue: maintenant });
  const m = useMagasin.getState();
  if (m.mode === 'spectacle') m.resynchroniser(etat);
}

/** Envoie un ordre de conduite (SPECTACLE ou non : l'appelant décide). null : pas relié, l'ordre n'est pas parti. */
export function envoyerConduite(op: OpConduite, o: { silencieux?: boolean } = {}): number | null {
  const s = useSpectacle.getState();
  if (!transport || s.ligne !== 'ouverte') {
    if (!o.silencieux && s.ligne !== 'eteinte') signaler(`⚠ Serveur de spectacle non relié : ${op.op.toUpperCase()} non transmis`);
    return null;
  }
  cseq += 1;
  onglet.ecrire(CLES.cseq, String(cseq));
  transport.envoyer({ t: 'conduite', cseq, ...op } as MsgConduite);
  useSpectacle.setState({ enAttente: [...s.enAttente, { cseq, op: op.op, envoye: Date.now() }] });
  return cseq;
}

/** Les gestes de conduite du magasin, relayés en SPECTACLE. */
function relayerGeste(g: GesteConduite) {
  if (useMagasin.getState().mode !== 'spectacle') return;
  switch (g.k) {
    case 'go':
      for (let i = 0; i < g.tops; i++) envoyerConduite({ op: 'top' }, { silencieux: i > 0 });
      return;
    case 'allerA': envoyerConduite(g.etape === undefined ? { op: 'allerA', moment: g.moment } : { op: 'allerA', moment: g.moment, etape: g.etape }); return;
    case 'poser': envoyerConduite({ op: 'poser', nom: g.nom, valeur: g.valeur }); return;
    case 'signal': envoyerConduite(g.donnees === undefined ? { op: 'signal', nom: g.nom } : { op: 'signal', nom: g.nom, donnees: g.donnees }); return;
    case 'reprendre': envoyerConduite(g.nom === undefined ? { op: 'reprendre' } : { op: 'reprendre', point: g.nom }); return;
    case 'retenir': retenir(g.actif); return;
    case 'prolonger': prolonger(g.secondes); return;
    case 'panique': panique(g.actif); return;
  }
}

// ── ordres de la barre de scène et du rail ─────────────────────────────────────────────────────────────────────────

/** RETENIR (touche H) : tient (ou relâche) l'étape en cours ; seul le top la termine (`lecteur.retenir()` du serveur). */
export const retenir = (actif = true) => envoyerConduite({ op: 'retenir', actif });
/** +30 s (touche J) : repousse de `secondes` la fin de l'étape en cours, cumulable (`lecteur.prolonger()` du serveur). */
export const prolonger = (secondes = 30) => envoyerConduite({ op: 'prolonger', secondes });
/** SAUTER À… (après confirmation de la barre de scène). */
export const sauterA = (moment: string, etape?: string) =>
  envoyerConduite(etape === undefined ? { op: 'allerA', moment } : { op: 'allerA', moment, etape });
/** PAUSE : gèle (ou relance) l'horloge du lecteur du serveur. */
export const pauseSpectacle = (pause = true) => envoyerConduite({ op: 'pause', pause });
/** PANIQUE : tous les acteurs sur leur écran de sécurité ; `false` la lève. */
export const panique = (actif = true) => envoyerConduite({ op: 'panique', actif });
/** Impose une vue à un acteur (rail : « renvoyer la vue »), journalisé par le serveur. */
export const forcerVue = (acteur: string, vue: { ecran: string; params?: Record<string, unknown> }) =>
  envoyerConduite({ op: 'forcer', acteur, vue });

// ── surveillance : voyant et alertes, 4 fois par seconde au plus ───────────────────────────────────────────────────

let minuteur: ReturnType<typeof setInterval> | undefined;

/** Recalcule le voyant et les alertes (appelé par la surveillance ; exporté pour les tests). */
export function surveiller(maintenant = Date.now()): void {
  const s = useSpectacle.getState();
  const voyant = voyantSpectacle(s, maintenant);
  const m = useMagasin.getState();
  const vignettes = vignettesSorties({ projet: m.projet, acteurs: magasinActeurs.getState(), local: sortieLocale(useSortie.getState(), maintenant), spectacle: m.mode === 'spectacle', maintenant });
  const brutes = alertesSpectacle({ voyant, ligne: s.ligne, avaitEteRelie, vignettes, historique: magasinActeurs.getState().historique, maintenant });
  const vues = new Set<string>();
  const alertes: AlerteSpectacle[] = brutes.map(a => {
    const id = a.code + ':' + a.texte.split(' · ')[0];
    vues.add(id);
    if (!debutsAlertes.has(id)) debutsAlertes.set(id, maintenant);
    return { ...a, cle: id + '@' + debutsAlertes.get(id) };
  });
  for (const k of [...debutsAlertes.keys()]) if (!vues.has(k)) debutsAlertes.delete(k);
  const maj: Partial<EtatSpectacle> = {};
  if (voyant.pastille !== s.voyant.pastille || voyant.libelle !== s.voyant.libelle || voyant.detail !== s.voyant.detail) maj.voyant = voyant;
  if (JSON.stringify(alertes) !== JSON.stringify(s.alertes)) maj.alertes = alertes;
  if (maj.voyant || maj.alertes) useSpectacle.setState(maj);
}

/** Démarre la surveillance (voyant, alertes de la sortie locale même sans serveur). Idempotent. */
export function demarrerSurveillance(): () => void {
  if (!minuteur) minuteur = setInterval(() => surveiller(), SURVEILLANCE_MS);
  return arreterSurveillance;
}
export function arreterSurveillance(): void {
  if (minuteur) clearInterval(minuteur);
  minuteur = undefined;
}

/** Au démarrage du Conducteur : surveillance, et liaison si les réglages de l'onglet sont complets. */
export function demarrerSpectacle(): () => void {
  demarrerSurveillance();
  const r = lireReglages();
  if (r.adresse && r.jetonRegie) relierSpectacle();
  return () => { arreterSurveillance(); delierInterne(false); };
}

/** Remise à zéro (tests). */
export function reinitialiserSpectacle(): void {
  delierInterne(true);
  arreterSurveillance();
  debutsAlertes.clear();
  memoire.local.clear(); memoire.session.clear();
  cseq = 0;
  avaitEteRelie = false;
  ecartLocalDepuis = 0;
  optionsCourantes = {};
  useSpectacle.setState({ reglages: lireReglages(), ligne: 'eteinte', dernierContact: 0, ouvertLe: 0, enAttente: [], dernierAccuse: null, refus: null, config: null, lectureRecue: 0, voyant: voyantEteint, alertes: [] });
}
