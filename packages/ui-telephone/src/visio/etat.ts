// Machine d'état PURE des appels visio d'un téléphone nommé (franck, ministre…) :
//
//   reduireVisio(etat, evenement, heure) → { etat, commandes }
//
// Aucune entrée-sortie, aucun hasard, aucune horloge : les commandes (`offrir`, `repondre`, `distant`, `candidat`,
// `fermer`, `envoyer`, `camera`) sont exécutées par appel.ts avec un vrai RTCPeerConnection (ou un faux, en test).
//
// Topologie (comme le prototype du 27/10) : le téléphone OFFRE à chaque destinataire de `vue.params.vers` (ids
// d'acteurs, défaut ['scene']) une liaison d'ÉMISSION (sa caméra et son micro) ; il RÉPOND aux offres qu'il reçoit
// (liaison de RÉCEPTION, ex. la ministre reçoit Franck). Un pair par (sens, acteur) ; un nouveau `n` remplace l'ancien.
//
// Règles :
// - `demarrer` (Répondre) : caméra demandée ; une fois prête et la ligne ouverte, une offre par destinataire ;
// - une offre reçue AVANT d'avoir répondu est gardée (la dernière par acteur) et traitée à `demarrer` ;
// - la première réponse fixe la session du destinataire (deux onglets « scene » : l'autre reçoit `fin`) ;
// - relance d'une émission : sans réponse en 10 s, sans connexion 15 s après la réponse, coupée plus de 4 s, en échec
//   ICE (tout de suite) ; fermée par `fin` du destinataire : nouvel essai 15 s plus tard, ou dès sa `recherche` ;
// - ligne revenue (reconnexion WebSocket) : chaque émission non connectée est renégociée (nouveau `n`) — une liaison
//   pair-à-pair déjà établie survit à la coupure du serveur, on ne la casse pas ;
// - `arreter` (Raccrocher, ou l'écran change) : `fin` à chaque pair, tout est fermé, la caméra est libérée.
import { CANAL_VISIO, type SignalVisio } from './signaux';

export type SensPair = 'emission' | 'reception';
/** offre : envoyée, pas de réponse · negociation : SDP échangés, ICE en cours · connecte · coupe : liaison perdue */
export type PhasePair = 'offre' | 'negociation' | 'connecte' | 'coupe';
export type EtatCamera = 'eteinte' | 'demande' | 'prete' | 'refusee';

export interface PairVisio {
  cle: string;
  acteur: string;
  sens: SensPair;
  n: string;
  /** session du pair (connue à la réponse pour une émission, à l'offre pour une réception) */
  session: string | null;
  phase: PhasePair;
  /** heure du dernier changement de phase */
  depuis: number;
}

export interface OffreEnAttente { session: string; n: string; sdp: string; recue: number }

export interface EtatVisio {
  /** l'acteur de ce téléphone */
  moi: string;
  /** préfixe des numéros de négociation (unique par page) */
  graine: string;
  compteur: number;
  /** appel en cours (Répondre touché, écran visio-appel) */
  actif: boolean;
  vers: string[];
  camera: EtatCamera;
  erreurCamera: string | null;
  /** ligne WebSocket ouverte */
  enLigne: boolean;
  pairs: Record<string, PairVisio>;
  /** offres reçues avant d'avoir répondu (la dernière par acteur) */
  attente: Record<string, OffreEnAttente>;
  /** heure à partir de laquelle réessayer une émission fermée (par acteur) */
  prochainEssai: Record<string, number>;
}

export type EtatLiaison = 'connecte' | 'coupe' | 'echec' | 'ferme';

export type EvenementVisio =
  | { e: 'demarrer'; moi?: string; vers: readonly string[] }
  | { e: 'arreter' }
  | { e: 'camera'; ok: boolean; erreur?: string }
  | { e: 'signal'; session: string; signal: SignalVisio }
  | { e: 'reseau'; enLigne: boolean }
  /** état d'un RTCPeerConnection (connectionState) */
  | { e: 'liaison'; cle: string; n: string; etat: EtatLiaison }
  /** la négociation a levé une erreur (SDP refusé, pc fermé) */
  | { e: 'erreur'; cle: string; n: string }
  /** toutes les secondes : délais */
  | { e: 'tick' };

export type CommandeVisio =
  | { c: 'camera' }
  | { c: 'liberer-camera' }
  | { c: 'offrir'; cle: string; acteur: string; n: string }
  | { c: 'repondre'; cle: string; acteur: string; session: string; n: string; sdp: string }
  | { c: 'distant'; cle: string; n: string; sdp: string }
  | { c: 'candidat'; cle: string; n: string; candidat: RTCIceCandidateInit }
  | { c: 'fermer'; cle: string }
  | { c: 'envoyer'; vers: string; signal: SignalVisio };

export interface ResultatVisio { etat: EtatVisio; commandes: CommandeVisio[] }

export const DELAI_REPONSE_MS = 10_000;
export const DELAI_NEGOCIATION_MS = 15_000;
export const DELAI_COUPURE_MS = 4_000;
export const RELANCE_APRES_FIN_MS = 15_000;
export const RELANCE_APRES_ERREUR_MS = 5_000;
export const GARDE_OFFRE_MS = 60_000;

export const cleEmission = (acteur: string) => `vers:${acteur}`;
export const cleReception = (acteur: string) => `de:${acteur}`;

export function etatVisio(o: { moi: string; graine: string; enLigne?: boolean }): EtatVisio {
  return {
    moi: o.moi, graine: o.graine, compteur: 0, actif: false, vers: [], camera: 'eteinte', erreurCamera: null,
    enLigne: o.enLigne ?? false, pairs: {}, attente: {}, prochainEssai: {},
  };
}

/** Destinataire des signaux d'un pair (sa session si connue, sinon l'acteur) ; null si le pair n'est plus ce `n`. */
export function destinataire(e: EtatVisio, cle: string, n: string): string | null {
  const p = e.pairs[cle];
  return p && p.n === n ? p.session ?? p.acteur : null;
}

const RE_ACTEUR = /^[A-Za-z0-9_-]{1,64}$/;

/** Destinataires d'un appel : `vue.params.vers` (ids d'acteurs), défaut ['scene'] ; jamais soi-même. */
export function destinatairesAppel(vers: unknown, moi: string): string[] {
  const l = Array.isArray(vers) ? vers.filter((x): x is string => typeof x === 'string' && RE_ACTEUR.test(x)) : [];
  const uniques = [...new Set(l.length ? l : ['scene'])].filter(a => a !== moi);
  return uniques.slice(0, 6);
}

// ── réducteur ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Petit accumulateur : l'état change par copies, les commandes s'empilent. */
class Pas {
  commandes: CommandeVisio[] = [];
  e: EtatVisio;
  readonly heure: number;
  constructor(e: EtatVisio, heure: number) { this.e = e; this.heure = heure; }
  maj(p: Partial<EtatVisio>) { this.e = { ...this.e, ...p }; }
  poserPair(p: PairVisio) { this.maj({ pairs: { ...this.e.pairs, [p.cle]: p } }); }
  retirerPair(cle: string) {
    if (!this.e.pairs[cle]) return;
    const pairs = { ...this.e.pairs };
    delete pairs[cle];
    this.maj({ pairs });
    this.commandes.push({ c: 'fermer', cle });
  }
  envoyer(vers: string, signal: SignalVisio) { if (this.e.enLigne) this.commandes.push({ c: 'envoyer', vers, signal }); }
  nouveauN(): string {
    const compteur = this.e.compteur + 1;
    this.maj({ compteur });
    return `${this.e.graine}${compteur.toString(36)}`.slice(0, 64);
  }

  /** (Ré)offre au destinataire : l'ancien pair est fermé, un nouveau `n`. */
  offrir(acteur: string) {
    const cle = cleEmission(acteur);
    const ancien = this.e.pairs[cle];
    if (ancien) {
      // le destinataire abandonne l'ancien numéro
      this.envoyer(ancien.session ?? acteur, { type: 'fin', canal: CANAL_VISIO, de: this.e.moi, n: ancien.n });
      this.retirerPair(cle);
    }
    const n = this.nouveauN();
    this.poserPair({ cle, acteur, sens: 'emission', n, session: null, phase: 'offre', depuis: this.heure });
    const prochainEssai = { ...this.e.prochainEssai };
    delete prochainEssai[acteur];
    this.maj({ prochainEssai });
    this.commandes.push({ c: 'offrir', cle, acteur, n });
  }

  /** Répond à une offre (remplace la réception précédente du même acteur). */
  repondre(acteur: string, o: { session: string; n: string; sdp: string }) {
    const cle = cleReception(acteur);
    if (this.e.pairs[cle]) this.retirerPair(cle);
    this.poserPair({ cle, acteur, sens: 'reception', n: o.n, session: o.session, phase: 'negociation', depuis: this.heure });
    this.commandes.push({ c: 'repondre', cle, acteur, session: o.session, n: o.n, sdp: o.sdp });
  }

  peutEmettre() { return this.e.actif && this.e.camera === 'prete' && this.e.enLigne; }

  /** Offres gardées pendant que ça sonnait : on y répond maintenant. */
  traiterAttente() {
    const attente = this.e.attente;
    this.maj({ attente: {} });
    for (const [acteur, o] of Object.entries(attente)) this.repondre(acteur, o);
  }
}

export function reduireVisio(etat: EtatVisio, ev: EvenementVisio, heure: number): ResultatVisio {
  const p = new Pas(etat, heure);
  const e = () => p.e;
  switch (ev.e) {
    case 'demarrer': {
      if (e().actif) break;
      const moi = ev.moi ?? e().moi;
      p.maj({ actif: true, moi, vers: destinatairesAppel(ev.vers, moi), camera: 'demande', erreurCamera: null, prochainEssai: {} });
      p.commandes.push({ c: 'camera' });
      p.traiterAttente();
      break;
    }
    case 'camera': {
      if (!e().actif || e().camera !== 'demande') {
        // caméra arrivée après Raccrocher : on la rend tout de suite
        if (ev.ok) p.commandes.push({ c: 'liberer-camera' });
        break;
      }
      if (!ev.ok) { p.maj({ camera: 'refusee', erreurCamera: ev.erreur ?? 'refusee' }); break; }
      p.maj({ camera: 'prete', erreurCamera: null });
      if (p.peutEmettre()) for (const a of e().vers) p.offrir(a);
      break;
    }
    case 'arreter': {
      if (!e().actif && !Object.keys(e().pairs).length) break;
      for (const pair of Object.values(e().pairs)) {
        p.envoyer(pair.session ?? pair.acteur, { type: 'fin', canal: CANAL_VISIO, de: e().moi, n: pair.n });
        p.retirerPair(pair.cle);
      }
      if (e().camera !== 'eteinte') p.commandes.push({ c: 'liberer-camera' });
      p.maj({ actif: false, vers: [], camera: 'eteinte', erreurCamera: null, attente: {}, prochainEssai: {} });
      break;
    }
    case 'signal': {
      const s = ev.signal;
      const acteur = s.de;
      if (acteur === e().moi) break;
      switch (s.type) {
        case 'recherche': {
          // le destinataire (la scène) nous cherche : (ré)offre, sauf négociation récente en cours
          if (!p.peutEmettre() || !e().vers.includes(acteur)) break;
          const pair = e().pairs[cleEmission(acteur)];
          if (pair && (pair.phase === 'offre' || pair.phase === 'negociation') && heure - pair.depuis < DELAI_REPONSE_MS) break;
          p.offrir(acteur);
          break;
        }
        case 'offre': {
          if (!e().actif) {
            const attente = { ...e().attente, [acteur]: { session: ev.session, n: s.n, sdp: s.sdp, recue: heure } };
            p.maj({ attente });
            break;
          }
          p.repondre(acteur, { session: ev.session, n: s.n, sdp: s.sdp });
          break;
        }
        case 'reponse': {
          const pair = e().pairs[cleEmission(acteur)];
          if (!pair || pair.n !== s.n) break;                             // ancienne négociation
          if (pair.session === null) {
            p.poserPair({ ...pair, session: ev.session, phase: 'negociation', depuis: heure });
            p.commandes.push({ c: 'distant', cle: pair.cle, n: s.n, sdp: s.sdp });
          } else if (pair.session !== ev.session) {
            // un autre onglet du même acteur a répondu aussi : il abandonne
            p.envoyer(ev.session, { type: 'fin', canal: CANAL_VISIO, de: e().moi, n: s.n });
          }
          break;
        }
        case 'candidat': {
          for (const cle of [cleEmission(acteur), cleReception(acteur)]) {
            const pair = e().pairs[cle];
            if (!pair || pair.n !== s.n || (pair.session !== null && pair.session !== ev.session)) continue;
            p.commandes.push({ c: 'candidat', cle, n: s.n, candidat: s.candidat });
          }
          break;
        }
        case 'fin': {
          for (const cle of [cleEmission(acteur), cleReception(acteur)]) {
            const pair = e().pairs[cle];
            if (!pair || (s.n !== undefined && pair.n !== s.n) || (pair.session !== null && pair.session !== ev.session)) continue;
            p.retirerPair(cle);
            if (pair.sens === 'emission') p.maj({ prochainEssai: { ...e().prochainEssai, [acteur]: heure + RELANCE_APRES_FIN_MS } });
          }
          const att = e().attente[acteur];
          if (att && att.session === ev.session && (s.n === undefined || s.n === att.n)) {
            const attente = { ...e().attente };
            delete attente[acteur];
            p.maj({ attente });
          }
          break;
        }
      }
      break;
    }
    case 'reseau': {
      const revenu = ev.enLigne && !e().enLigne;
      p.maj({ enLigne: ev.enLigne });
      if (!revenu || !p.peutEmettre()) break;
      // reconnexion : renégociation (nouveau n) de chaque émission qui n'est pas établie ; offre à qui n'en a pas
      for (const a of e().vers) {
        const pair = e().pairs[cleEmission(a)];
        if (!pair || pair.phase !== 'connecte') p.offrir(a);
      }
      break;
    }
    case 'liaison': {
      const pair = e().pairs[ev.cle];
      if (!pair || pair.n !== ev.n) break;
      if (ev.etat === 'connecte') {
        if (pair.phase !== 'connecte') p.poserPair({ ...pair, phase: 'connecte', depuis: heure });
      } else if (ev.etat === 'coupe') {
        if (pair.phase !== 'coupe') p.poserPair({ ...pair, phase: 'coupe', depuis: heure });
      } else if (ev.etat === 'echec') {
        if (pair.sens === 'emission' && p.peutEmettre()) p.offrir(pair.acteur);
        else p.retirerPair(pair.cle);                                  // réception : l'autre côté réoffrira
      } else {
        p.retirerPair(pair.cle);
      }
      break;
    }
    case 'erreur': {
      const pair = e().pairs[ev.cle];
      if (!pair || pair.n !== ev.n) break;
      p.retirerPair(pair.cle);
      if (pair.sens === 'emission') p.maj({ prochainEssai: { ...e().prochainEssai, [pair.acteur]: heure + RELANCE_APRES_ERREUR_MS } });
      break;
    }
    case 'tick': {
      for (const pair of Object.values(e().pairs)) {
        const age = heure - pair.depuis;
        const trop = (pair.phase === 'offre' && age >= DELAI_REPONSE_MS)
          || (pair.phase === 'negociation' && age >= DELAI_NEGOCIATION_MS)
          || (pair.phase === 'coupe' && age >= DELAI_COUPURE_MS);
        if (!trop) continue;
        if (pair.sens === 'emission') { if (p.peutEmettre()) p.offrir(pair.acteur); }
        else p.retirerPair(pair.cle);
      }
      if (p.peutEmettre()) {
        for (const a of e().vers) {
          if (e().pairs[cleEmission(a)]) continue;
          if (heure >= (e().prochainEssai[a] ?? 0)) p.offrir(a);
        }
      }
      const vieilles = Object.entries(e().attente).filter(([, o]) => heure - o.recue > GARDE_OFFRE_MS);
      if (vieilles.length) {
        const attente = { ...e().attente };
        for (const [a] of vieilles) delete attente[a];
        p.maj({ attente });
      }
      break;
    }
  }
  return { etat: p.e, commandes: p.commandes };
}

/** Raccourci pour les tests : enchaîne des événements à la même heure. */
export function enchainerVisio(etat: EtatVisio, evs: readonly EvenementVisio[], heure = 0): ResultatVisio {
  let e = etat;
  const commandes: CommandeVisio[] = [];
  for (const ev of evs) {
    const r = reduireVisio(e, ev, heure);
    e = r.etat;
    commandes.push(...r.commandes);
  }
  return { etat: e, commandes };
}
