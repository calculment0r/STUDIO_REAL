// Transport RÉEL de l'émulateur : au lieu de la salle en mémoire, les faux téléphones se connectent par WebSocket à un
// vrai serveur de spectacle (essai de charge, rapport 5 §4.8). Chaque téléphone garde la même machine d'état (ui-telephone),
// le même profil, le même délai de rendu ; la latence réseau n'est plus simulée, elle est vraie. Les coupures et les
// rechargements restent : fermeture de la socket (et blocage des reconnexions pendant la coupure), puis reconnexion.
//
// `SalleReelle` joue, pour l'émulateur, le rôle de `SalleEmulee` (mêmes méthodes : lancer, conduite, go, vueDe, signaux,
// votes, lecture, surEvenement…), mais ce qu'elle sait vient de ce que les clients REÇOIVENT :
// - la régie est un client `role:'regie'` (jeton « regie ») : elle reçoit `lecture` et `salle`, envoie `conduite` ;
// - chaque téléphone est un client `role:'acteur'` (jeton « acteur ») ;
// - tout est mesuré au passage (WebSocket enveloppée) : accusés d'affichage, `ack`, `refus`, octets par type de message,
//   reconnexions réussies ou ratées. `mesures()` en donne un instantané ; l'émulateur en tire `bilan()`.
// Les heures sont celles de l'horloge réelle (Date.now). Tout le temps est réel : `avancer(ms)` n'a pas de sens ici.
import type { EtatLecture, Projet, Signaux } from '@studio-real/modele';
import {
  VERSION_PROTOCOLE, transportWebSocket,
  type EtatLigne, type EtatTransport, type FabriqueHello, type MessageClient, type MessageServeur, type MsgAck, type MsgSalle,
  type OpConduite, type TransportSpectacle, type VueDiffusee, type WebSocketMinimal,
  fusionnerDelta,
} from '@studio-real/protocole';
import type { EvenementSalle, OptionsTransportReel } from './types';

/** Une reconnexion qui dure plus que ça (après la fin de la coupure) est comptée « ratée ». */
export const SEUIL_RECONNEXION_MS = 30_000;
/** Délai maximal d'attente d'un accusé de la régie (conduite). */
const DELAI_CONDUITE_MS = 5000;
/** Échantillons gardés par série (au-delà : les plus anciens sont oubliés). */
const MAX_ECHANTILLONS = 200_000;
const MAX_EXEMPLES = 20;

/** Percentile (0 → 1) d'une liste de nombres. */
export function percentile(l: readonly number[], p: number): number {
  if (!l.length) return 0;
  const t = [...l].sort((a, b) => a - b);
  return Math.round(t[Math.min(t.length - 1, Math.max(0, Math.ceil(p * t.length) - 1))]!);
}

const arrondi1 = (x: number) => Math.round(x * 10) / 10;

class Serie {
  readonly v: number[] = [];
  ajouter(x: number): void {
    this.v.push(x);
    if (this.v.length > MAX_ECHANTILLONS) this.v.splice(0, this.v.length - MAX_ECHANTILLONS);
  }
}

/** Ce qu'on mesure d'un côté du fil. */
export interface MesuresReelles {
  /** durée de la mesure (ms réelles depuis `demarrer`) */
  dureeMs: number;
  /** accusés d'affichage : de l'heure de la vue (serveur) à l'arrivée de l'accusé au serveur (estimée : envoi + ½ aller-retour, horloges recalées) */
  accuses: { n: number; p50: number; p95: number; max: number; partA1s: number; partA2s: number };
  /** de la réception de la vue par le téléphone à l'envoi de son accusé (rendu compris), côté téléphone */
  delaiVueAccuse: { n: number; moyenneMs: number; p95Ms: number; maxMs: number };
  /** réponses du serveur aux messages `in` / `conduite` numérotés */
  acks: { ok: number; doublon: number; refus: number; ferme: number };
  /** messages refusés par le serveur : `ack` en refus + messages `refus`. `total` = les refus INATTENDUS ; `tardifs` = refus d'un
   *  envoi resté en file pendant une coupure et livré après coup (un vote arrivé quand la question est fermée : normal) */
  refus: { total: number; tardifs: number; parCode: Record<string, number>; exemples: string[]; fatals: number };
  /** entrées acceptées par le serveur (ack ok) */
  entrees: { vote: number; texte: number; pret: number; autres: number };
  reconnexions: {
    /** lignes tombées (coupure voulue, rechargement, ligne perdue) */
    pertes: number;
    reussies: number;
    /** pas revenues dans les 30 s qui suivent la fin de la coupure, ou toujours absentes à la mesure */
    ratees: number;
    /** perdues et pas encore revenues (dans le délai) à la mesure */
    enCours: number;
    delaiP50Ms: number;
    delaiP95Ms: number;
    delaiMaxMs: number;
  };
  /** premières connexions réussies (bienvenue reçue) */
  connexions: number;
  messages: {
    /** reçus par tous les clients (téléphones + régie) */
    recus: number;
    envoyes: number;
    parSecondeMoyenne: number;
    parSecondePic: number;
    octetsRecus: number;
    octetsEnvoyes: number;
    octetsRecusParS: number;
    parType: Record<string, { n: number; octets: number }>;
  };
  /** messages `lecture` reçus par la régie */
  lecture: { n: number; moyenneOctets: number; maxOctets: number; octetsParS: number };
}

/** La ligne d'un téléphone (ou de la régie) vue de l'agent. */
export interface LigneReelle {
  readonly transport: TransportSpectacle;
  /** la socket est ouverte (le transport est « ouvert ») */
  readonly ouverte: boolean;
  /** coupure réseau : la socket est fermée de force et les reconnexions sont bloquées jusqu'à `retablir` */
  readonly bloquee: boolean;
  couper(): void;
  /** fin de coupure : reconnexion tout de suite */
  retablir(): void;
  /** la personne quitte la salle : fermeture définitive */
  fermer(): void;
}

interface Pendant { k: string; q?: string; index?: number; horsLigne: boolean }
interface Suivi { perteLe: number | null; retabliLe: number | null }

export type ConstructeurWS = new (url: string) => WebSocketMinimal & { terminate?(): void };

/** La socket réelle enveloppée : compte les octets envoyés et reçus, sait se couper de force, refuse de s'ouvrir tant
 *  que la ligne est coupée (le transport du protocole réessaie alors à son rythme normal). */
class SocketMesuree implements WebSocketMinimal {
  private readonly ws: WebSocketMinimal & { terminate?(): void };
  private readonly salle: SalleReelle;
  private readonly ligne: LigneImpl;
  constructor(salle: SalleReelle, ligne: LigneImpl, url: string) {
    this.salle = salle;
    this.ligne = ligne;
    if (ligne.bloquee) throw new Error('ligne coupée (essai de charge)');
    this.ws = new salle.constructeurWS(url);
    ligne.courant = this;
  }
  get readyState(): number { return this.ws.readyState; }
  set onopen(f: ((ev: unknown) => void) | null) { this.ws.onopen = f; }
  get onopen() { return this.ws.onopen; }
  set onclose(f: ((ev: unknown) => void) | null) { this.ws.onclose = f; }
  get onclose() { return this.ws.onclose; }
  set onerror(f: ((ev: unknown) => void) | null) { this.ws.onerror = f; }
  get onerror() { return this.ws.onerror; }
  set onmessage(f: ((ev: { data: unknown }) => void) | null) {
    this.ws.onmessage = f ? ev => { this.salle.compterRecu(this.ligne, ev.data); f(ev); } : null;
  }
  get onmessage() { return this.ws.onmessage; }
  send(data: string): void {
    this.salle.compterEnvoye(data);
    this.ws.send(data);
  }
  close(): void { this.ws.close(); }
  /** coupure de force (tunnel, ascenseur) : le serveur voit la socket tomber */
  terminer(): void {
    if (typeof this.ws.terminate === 'function') this.ws.terminate();
    else this.ws.close();
  }
}

class LigneImpl implements LigneReelle {
  transport!: TransportSpectacle;
  courant: SocketMesuree | null = null;
  etat: EtatLigne = 'connexion';
  ferme = false;
  rttMs: number | undefined;
  decalageMs: number | undefined;
  /** vues reçues non encore accusées : vseq → heure de base (serveur) et heure de réception (client) */
  readonly vues = new Map<number, { base: number; recuLe: number }>();
  derniereVue: VueDiffusee | null = null;
  readonly pendants = new Map<number, Pendant>();
  private readonly salle: SalleReelle;
  readonly id: string;
  readonly acteur: string;
  readonly personne: string;
  bloquee: boolean;
  readonly regie: boolean;
  constructor(salle: SalleReelle, id: string, acteur: string, personne: string, bloquee: boolean, regie: boolean) {
    this.salle = salle;
    this.id = id;
    this.acteur = acteur;
    this.personne = personne;
    this.bloquee = bloquee;
    this.regie = regie;
  }
  get ouverte(): boolean { return this.etat === 'ouvert'; }
  couper(): void {
    if (this.ferme) return;
    this.bloquee = true;
    this.salle.perte(this.id);
    this.courant?.terminer();
  }
  retablir(): void {
    if (this.ferme || !this.bloquee) return;
    this.bloquee = false;
    this.salle.retabli(this.id);
    this.transport.renouer();
  }
  fermer(): void {
    if (this.ferme) return;
    this.ferme = true;
    this.transport.fermer();
    this.salle.ligneFermee(this);
  }
}

export interface OptionsSalleReelle {
  reseau: OptionsTransportReel;
  /** le projet joué par le serveur (pour la règle du GO : passage « go » du moment) */
  projet: Projet;
  /** autre WebSocket que celle de `ws` (tests) */
  constructeurWS?: ConstructeurWS;
}

export class SalleReelle {
  /** la WebSocket de `ws`, chargée à `demarrer()` (Node seulement : le paquet n'est jamais embarqué dans le navigateur) */
  constructeurWS: ConstructeurWS;
  private readonly url: string;
  private readonly jeton: string;
  private readonly jetonRegie: string | undefined;
  private readonly projet: Projet;
  private readonly abonnes = new Set<(e: EvenementSalle) => void>();
  private readonly lignes = new Map<string, LigneImpl>();
  private readonly suivis = new Map<string, Suivi>();
  private debut = Date.now();
  // série de mesures
  private readonly latences = new Serie();
  private readonly delais = new Serie();
  private readonly delaisReconnexion = new Serie();
  private acks = { ok: 0, doublon: 0, refus: 0, ferme: 0 };
  private refus = { total: 0, tardifs: 0, fatals: 0, parCode: {} as Record<string, number>, exemples: [] as string[] };
  private entrees = { vote: 0, texte: 0, pret: 0, autres: 0 };
  private pertes = 0;
  private reussies = 0;
  private lentes = 0;
  private connexions = 0;
  private recus = 0;
  private envoyes = 0;
  private octetsRecus = 0;
  private octetsEnvoyes = 0;
  private readonly parType: Record<string, { n: number; octets: number }> = {};
  private readonly parSeconde = new Map<number, number>();
  private lectures = { n: 0, octets: 0, max: 0 };
  // régie
  private regieLigne: LigneImpl | null = null;
  private cseqRegie = 0;
  private readonly conduites = new Map<number, (a: MsgAck) => void>();
  private lectureCourante: EtatLecture | null = null;
  private nLectures = 0;
  private readonly attentesLecture = new Set<() => void>();
  private salleCourante: MsgSalle | null = null;
  private position = '';
  private readonly sessionRegie = `regie_rep_${Date.now().toString(36)}`;
  // votes acceptés par le serveur : question → personne → index
  private readonly votesAcceptes = new Map<string, Map<string, number>>();
  private questionVotee: string | null = null;
  private readonly imposeeParOptions: boolean;

  constructor(o: OptionsSalleReelle) {
    if (!o.reseau.url) throw new Error('Émulateur réel : transport.url manquante.');
    if (!o.reseau.jeton) throw new Error('Émulateur réel : transport.jeton (jeton du rôle « acteur ») obligatoire.');
    this.url = o.reseau.url;
    this.jeton = o.reseau.jeton;
    this.jetonRegie = o.reseau.jetonRegie;
    this.projet = o.projet;
    this.constructeurWS = o.constructeurWS ?? (() => { throw new Error('Émulateur réel : demarrer() d’abord (la WebSocket est chargée à ce moment-là).'); }) as unknown as ConstructeurWS;
    this.imposeeParOptions = o.constructeurWS !== undefined;
  }

  // ── Abonnements ───────────────────────────────────────────────────────────────────────────────────────────────

  surEvenement(fn: (e: EvenementSalle) => void): () => void {
    this.abonnes.add(fn);
    return () => { this.abonnes.delete(fn); };
  }
  private emettre(e: EvenementSalle): void {
    for (const fn of [...this.abonnes]) {
      try { fn(e); } catch (err) { console.error('[emulateur] abonné', err); }
    }
  }

  // ── Lignes ────────────────────────────────────────────────────────────────────────────────────────────────────

  /** La ligne d'un téléphone (ou de la régie) : un `transportWebSocket` du protocole, sur une socket mesurée. */
  creerLigne(o: { id: string; acteur: string; personne: string; hello: FabriqueHello; bloquee?: boolean; regie?: boolean }): LigneReelle {
    const regie = o.regie === true;
    const ligne = new LigneImpl(this, o.id, o.acteur, o.personne, o.bloquee === true, regie);
    const salle = this;
    const Ctor = function (this: unknown, url: string) { return new SocketMesuree(salle, ligne, url); } as unknown as new (url: string) => WebSocketMinimal;
    const brut = transportWebSocket(this.url, regie ? this.jetonRegie ?? '' : this.jeton, { hello: o.hello, env: { WebSocket: Ctor } });
    // nos abonnements d'abord : les mesures sont prises avant que la machine du téléphone ne réagisse
    brut.surMessage(m => this.apresMessage(ligne, m));
    brut.surEtat(e => this.apresEtat(ligne, e));
    ligne.transport = {
      envoyer: m => { this.avantEnvoi(ligne, m); brut.envoyer(m); },
      surMessage: fn => brut.surMessage(fn),
      surEtat: fn => brut.surEtat(fn),
      renouer: () => brut.renouer(),
      fermer: () => brut.fermer(),
    };
    if (!regie) {
      this.lignes.set(o.id, ligne);
      // un rechargement : la ligne précédente est tombée, la nouvelle s'ouvre (sauf coupure en cours)
      if (!ligne.bloquee) this.retabli(o.id);
    }
    return ligne;
  }

  ligneFermee(l: LigneImpl): void {
    if (this.lignes.get(l.id) === l) this.lignes.delete(l.id);
  }

  /** La personne quitte la salle : plus de suivi de reconnexion pour elle. */
  oublier(id: string): void { this.suivis.delete(id); }

  // ── Suivi des reconnexions ───────────────────────────────────────────────────────────────────────────────────

  /** La ligne de ce téléphone est tombée (coupure, rechargement, ligne perdue). */
  perte(id: string): void {
    const s = this.suivis.get(id) ?? { perteLe: null, retabliLe: null };
    this.suivis.set(id, s);
    if (s.perteLe !== null) return;
    s.perteLe = Date.now();
    s.retabliLe = null;
    this.pertes++;
    this.emettre({ type: 'deconnexion', id, t: s.perteLe });
  }
  /** La coupure est finie : la reconnexion peut commencer (le délai se compte à partir d'ici). */
  retabli(id: string): void {
    const s = this.suivis.get(id);
    if (s && s.perteLe !== null && s.retabliLe === null) s.retabliLe = Date.now();
  }
  private bienvenue(l: LigneImpl): void {
    const now = Date.now();
    const s = this.suivis.get(l.id);
    if (s && s.perteLe !== null) {
      const delai = Math.max(0, now - (s.retabliLe ?? s.perteLe));
      this.delaisReconnexion.ajouter(delai);
      if (delai > SEUIL_RECONNEXION_MS) this.lentes++;
      else this.reussies++;
      s.perteLe = null;
      s.retabliLe = null;
    } else this.connexions++;
    this.emettre({ type: 'connexion', id: l.id, t: now });
  }

  // ── Mesures au passage ──────────────────────────────────────────────────────────────────────────────────────

  compterRecu(l: LigneImpl, data: unknown): void {
    if (typeof data !== 'string') return;
    const octets = Buffer.byteLength(data, 'utf8');
    const type = /^\{"t":"([^"]+)"/.exec(data)?.[1] ?? 'inconnu';
    this.recus++;
    this.octetsRecus += octets;
    const par = (this.parType[type] ??= { n: 0, octets: 0 });
    par.n++;
    par.octets += octets;
    const seconde = Math.floor((Date.now() - this.debut) / 1000);
    this.parSeconde.set(seconde, (this.parSeconde.get(seconde) ?? 0) + 1);
    if (l.regie && type === 'lecture') {
      this.lectures.n++;
      this.lectures.octets += octets;
      this.lectures.max = Math.max(this.lectures.max, octets);
    }
  }
  compterEnvoye(data: string): void {
    this.envoyes++;
    this.octetsEnvoyes += Buffer.byteLength(data, 'utf8');
  }

  private noterRefus(l: LigneImpl, code: string, detail: string, fatal = false): void {
    this.refus.total++;
    if (fatal) this.refus.fatals++;
    this.refus.parCode[code] = (this.refus.parCode[code] ?? 0) + 1;
    if (this.refus.exemples.length < MAX_EXEMPLES) this.refus.exemples.push(`${l.id} : ${code} — ${detail}`);
  }

  private avantEnvoi(l: LigneImpl, m: MessageClient): void {
    if (m.t === 'in' && m.k === 'accuse') {
      const v = l.vues.get(m.data.vseq);
      if (v) {
        const now = Date.now();
        this.delais.ajouter(Math.max(0, now - v.recuLe));
        // l'accusé arrive au serveur ½ aller-retour après l'envoi ; horloge du serveur = horloge du client + décalage
        const arrivee = now + (l.decalageMs ?? 0) + (l.rttMs ?? 0) / 2;
        const latenceMs = Math.max(0, arrivee - v.base);
        this.latences.ajouter(latenceMs);
        l.vues.delete(m.data.vseq);
        this.emettre({ type: 'ack', id: l.id, n: m.data.vseq, latenceMs, t: now });
      }
    }
    if (m.t === 'in') {
      const p: Pendant = { k: m.k, horsLigne: !l.ouverte };
      if (m.k === 'vote') { if (m.q !== undefined) p.q = m.q; p.index = m.data.index; }
      l.pendants.set(m.cseq, p);
      if (l.pendants.size > 200) l.pendants.delete(l.pendants.keys().next().value!);
    }
  }

  private apresEtat(l: LigneImpl, e: EtatTransport): void {
    const avant = l.etat;
    l.etat = e.etat;
    l.rttMs = e.rttMs;
    l.decalageMs = e.decalageMs;
    // une ligne qui tombe sans qu'on l'ait coupée (serveur, réseau, pongs manquants) : reconnexion automatique
    if (!l.regie && e.etat === 'attente' && avant === 'ouvert' && !l.bloquee && !l.ferme) {
      this.perte(l.id);
      this.retabli(l.id);
    }
  }

  private apresMessage(l: LigneImpl, m: MessageServeur): void {
    const now = Date.now();
    switch (m.t) {
      case 'bienvenue':
        if (m.vue) {
          // la vue de la reprise vaut « maintenant » (le serveur ne l'a pas envoyée à cet instant-là)
          this.noterVue(l, m.vue, Math.max(m.vue.at, now + (l.decalageMs ?? 0)), now);
        }
        if (l.regie && m.lecture) this.poserLecture(m.lecture.etat);
        if (!l.regie) this.bienvenue(l);
        else this.emettre({ type: 'connexion', id: l.id, t: now });
        return;
      case 'vue': {
        const { t: _t, ...vue } = m;
        void _t;
        this.noterVue(l, vue, vue.at, now);
        return;
      }
      case 'ack': {
        const p = l.pendants.get(m.cseq);
        l.pendants.delete(m.cseq);
        this.acks[m.statut]++;
        if (l.regie) { this.conduites.get(m.cseq)?.(m); this.conduites.delete(m.cseq); }
        if (m.statut === 'refus') {
          if (p?.horsLigne) this.refus.tardifs++;
          else this.noterRefus(l, 'ack-refus', `${p?.k ?? (l.regie ? 'conduite' : '?')} : ${m.raison ?? 'sans raison'}`);
          return;
        }
        if (m.statut === 'ok' && p && p.k !== 'accuse' && p.k !== 'presence' && p.k !== 'conduite') this.entreeAcceptee(l, p, now);
        return;
      }
      case 'refus':
        this.noterRefus(l, m.code, m.message, m.fatal === true);
        return;
      case 'lecture':
        // complet (avec l'état entier) ou delta (seuls les champs changés, à fusionner sur le dernier complet) : lot « lecture allégée »
        if (!l.regie) return;
        if (m.mode === 'delta') { if (this.lectureCourante) this.poserLecture(fusionnerDelta(this.lectureCourante, m.d)); }
        else this.poserLecture(m.etat);
        return;
      case 'salle':
        if (l.regie) this.salleCourante = m;
        return;
      default:
        return;
    }
  }

  private noterVue(l: LigneImpl, vue: VueDiffusee, base: number, recuLe: number): void {
    l.derniereVue = vue;
    l.vues.set(vue.vseq, { base, recuLe });
    if (l.vues.size > 64) l.vues.delete(l.vues.keys().next().value!);
  }

  private entreeAcceptee(l: LigneImpl, p: Pendant, now: number): void {
    if (p.k === 'vote') {
      this.entrees.vote++;
      const q = p.q ?? this.questionVotee ?? '?';
      this.questionVotee = q;
      const m = this.votesAcceptes.get(q) ?? new Map<string, number>();
      this.votesAcceptes.set(q, m);
      if (p.index !== undefined) m.set(l.personne, p.index);
    } else if (p.k === 'texte') this.entrees.texte++;
    else if (p.k === 'pret') this.entrees.pret++;
    else this.entrees.autres++;
    const nature = p.k === 'vote' ? 'vote' : p.k === 'texte' ? 'texte' : p.k === 'pret' ? 'pret' : 'toucher';
    this.emettre({ type: 'entree', id: l.id, nature, valeur: p.k === 'vote' ? { q: p.q, index: p.index } : null, t: now });
  }

  private poserLecture(etat: EtatLecture): void {
    this.lectureCourante = etat;
    this.nLectures++;
    for (const f of [...this.attentesLecture]) f();
    const pos = `${etat.moment}/${etat.etape}/${etat.termine}`;
    if (pos !== this.position) {
      this.position = pos;
      this.emettre({ type: 'lecture', moment: etat.moment, etape: etat.etape, t: Date.now() });
    }
  }

  // ── Régie ─────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Début de la mesure (l'heure réelle) ; ouvre la régie si on a son jeton. */
  async demarrer(): Promise<void> {
    if (!this.imposeeParOptions) {
      // import dynamique par nom variable : ni le Conducteur (navigateur) ni tsc n'ont à résoudre `ws`
      const nom = 'ws';
      const mod = await import(/* @vite-ignore */ nom) as { WebSocket: ConstructeurWS };
      this.constructeurWS = mod.WebSocket;
    }
    this.debut = Date.now();
    await this.connecterRegie();
  }

  /** Ouvre la ligne de la régie (jeton « regie ») et attend sa `bienvenue` (5 s au plus). Sans jeton : rien. */
  async connecterRegie(): Promise<void> {
    if (!this.jetonRegie || this.regieLigne) return;
    const ligne = this.creerLigne({
      id: 'regie', acteur: '', personne: this.sessionRegie, regie: true,
      hello: () => ({ t: 'hello', v: VERSION_PROTOCOLE, role: 'regie', session: this.sessionRegie, cseq: this.cseqRegie, app: { version: 'emulateur', build: 'repetition' } }),
    }) as LigneImpl;
    this.regieLigne = ligne;
    await new Promise<void>((ok, ko) => {
      const fin = setTimeout(() => { off(); ko(new Error('Émulateur réel : la régie n’a pas reçu de bienvenue en 5 s (adresse ou jeton « regie » faux ?).')); }, 5000);
      const off = ligne.transport.surMessage(m => {
        if (m.t === 'bienvenue') { clearTimeout(fin); off(); ok(); }
        else if (m.t === 'refus' && m.fatal) { clearTimeout(fin); off(); ko(new Error(`Émulateur réel : la régie est refusée par le serveur (${m.code} : ${m.message}).`)); }
      });
    });
  }

  private exigerRegie(): LigneImpl {
    if (!this.jetonRegie) throw new Error('Émulateur réel : conduite et go demandent le jeton de la régie (transport.jetonRegie).');
    if (!this.regieLigne) throw new Error('Émulateur réel : la régie n’est pas connectée (demarrer() d’abord).');
    return this.regieLigne;
  }

  /** Envoie un ordre de la régie et attend l'accusé du serveur (le vrai). */
  conduiteReelle(op: OpConduite): Promise<MsgAck> {
    return this.envoyerConduite(op).promesse;
  }

  private envoyerConduite(op: OpConduite): { cseq: number; promesse: Promise<MsgAck> } {
    const ligne = this.exigerRegie();
    const cseq = ++this.cseqRegie;
    const promesse = new Promise<MsgAck>(ok => {
      const delai = setTimeout(() => {
        this.conduites.delete(cseq);
        ok({ t: 'ack', cseq, statut: 'refus', raison: `aucun accusé du serveur en ${DELAI_CONDUITE_MS / 1000} s` });
      }, DELAI_CONDUITE_MS);
      this.conduites.set(cseq, a => { clearTimeout(delai); ok(a); });
    });
    ligne.pendants.set(cseq, { k: 'conduite', horsLigne: !ligne.ouverte });
    ligne.transport.envoyer({ t: 'conduite', cseq, ...op } as MessageClient);
    return { cseq, promesse };
  }

  /** Comme `SalleEmulee.conduite`, mais le serveur est ailleurs : l'accusé renvoyé est provisoire (l'envoi a eu lieu) ;
   *  le vrai accusé est compté dans les mesures (un refus y figure). */
  conduite(op: OpConduite): MsgAck {
    const { cseq, promesse } = this.envoyerConduite(op);
    void promesse;
    return { t: 'ack', cseq, statut: 'ok', raison: 'envoyé au serveur (accusé asynchrone : conduiteReelle)' };
  }

  /** Comme `SalleEmulee.lancer` : le serveur a déjà sa représentation ; on ne la relance pas. On ouvre la régie. */
  lancer(): MsgAck {
    void this.connecterRegie();
    return { t: 'ack', cseq: 0, statut: 'ok', raison: 'représentation du serveur conservée' };
  }

  /** Attend (au plus `ms`) une `lecture` plus récente que la n-ième. */
  private lectureApres(n: number, ms: number): Promise<EtatLecture | null> {
    return new Promise(ok => {
      if (this.nLectures > n) { ok(this.lectureCourante); return; }
      const f = () => { if (this.nLectures > n) fin(); };
      const fin = () => { clearTimeout(delai); this.attentesLecture.delete(f); ok(this.lectureCourante); };
      const delai = setTimeout(fin, ms);
      this.attentesLecture.add(f);
    });
  }

  /** Le GO du Conducteur (règle du magasin) : `top` ; si l'étape menait au passage « go » du moment, second `top`. */
  async go(): Promise<void> {
    this.exigerRegie();
    const avant = this.lectureCourante;
    if (!avant || avant.termine) return;
    const n = this.nLectures;
    await this.conduiteReelle({ op: 'top' });
    const apres = await this.lectureApres(n, 2000);
    if (avant.etape !== null && apres && !apres.termine && apres.moment === avant.moment && apres.etape === null) {
      const m = this.projet.ev.find(x => x.id === apres.moment);
      if (m?.gate.mode === 'go' || apres.attenteGo) await this.conduiteReelle({ op: 'top' });
    }
  }

  // ── Lecture ──────────────────────────────────────────────────────────────────────────────────────────────────

  lecture(): EtatLecture | null { return this.lectureCourante; }

  /** La dernière vue reçue par un téléphone de cet acteur (de cette personne, si précisée). */
  vueDe(acteur: string, personne?: string): VueDiffusee | null {
    let derniere: VueDiffusee | null = null;
    for (const l of this.lignes.values()) {
      if (l.acteur !== acteur || (personne !== undefined && l.personne !== personne) || !l.derniereVue) continue;
      if (!derniere || l.derniereVue.vseq > derniere.vseq) derniere = l.derniereVue;
    }
    return derniere;
  }

  /** Signaux d'après le dernier résumé `salle` reçu par la régie (bruit et assis ne sont pas mesurables : 0). */
  signaux(): Signaux {
    const s = this.salleCourante;
    const pub = s?.acteurs['public'];
    const presents = pub?.presents ?? 0;
    const sig: Signaux = { pres: presents, quorum: 0, prets: presents ? Math.round(((pub?.prets ?? 0) * 100) / presents) : 0, bruit: 0, assis: 0 };
    if (s?.vote) {
      const parts = s.vote.parts;
      sig.quorum = presents ? Math.min(100, Math.round((s.vote.recus * 100) / presents)) : 0;
      const total = parts.reduce((a, b) => a + b, 0);
      if (total) {
        const max = Math.max(...parts);
        const premiers = parts.map((n, i) => (n === max ? i : -1)).filter(i => i >= 0);
        sig.issue = premiers.length === 1 ? String.fromCharCode(65 + premiers[0]!) : 'T';
        sig.votes = Object.fromEntries(parts.map((n, i) => [String.fromCharCode(65 + i), Math.round((n * 100) / total)]));
      }
    }
    return sig;
  }

  /** Votes acceptés par le serveur pour la dernière question votée (lettre → nombre), et textes acceptés. */
  votes(): { question: string | null; votes: Record<string, number>; textes: number } {
    const q = this.salleCourante?.vote?.q ?? this.questionVotee;
    const votes: Record<string, number> = {};
    if (q) for (const i of this.votesAcceptes.get(q)?.values() ?? []) {
      const k = String.fromCharCode(65 + i);
      votes[k] = (votes[k] ?? 0) + 1;
    }
    return { question: q, votes, textes: this.entrees.texte };
  }

  /** Dernières latences d'accusé (ms), pour `bilan()` (les 1000 dernières, comme la salle en mémoire). */
  get latencesRecentes(): number[] { return this.latences.v.slice(-1000); }

  // ── Mesures ───────────────────────────────────────────────────────────────────────────────────────────────────

  mesures(): MesuresReelles {
    const now = Date.now();
    const dureeMs = Math.max(1, now - this.debut);
    const lat = this.latences.v;
    const del = this.delais.v;
    const enCours = [...this.suivis.values()].filter(s => s.perteLe !== null);
    const encoreAbsentes = enCours.filter(s => now - (s.retabliLe ?? s.perteLe!) > SEUIL_RECONNEXION_MS).length;
    const rec = this.delaisReconnexion.v;
    const pic = Math.max(0, ...this.parSeconde.values());
    return {
      dureeMs,
      accuses: {
        n: lat.length, p50: percentile(lat, 0.5), p95: percentile(lat, 0.95), max: lat.length ? Math.round(Math.max(...lat)) : 0,
        partA1s: lat.length ? lat.filter(x => x <= 1000).length / lat.length : 0,
        partA2s: lat.length ? lat.filter(x => x <= 2000).length / lat.length : 0,
      },
      delaiVueAccuse: {
        n: del.length, moyenneMs: del.length ? Math.round(del.reduce((a, b) => a + b, 0) / del.length) : 0,
        p95Ms: percentile(del, 0.95), maxMs: del.length ? Math.round(Math.max(...del)) : 0,
      },
      acks: { ...this.acks },
      refus: { total: this.refus.total, tardifs: this.refus.tardifs, fatals: this.refus.fatals, parCode: { ...this.refus.parCode }, exemples: [...this.refus.exemples] },
      entrees: { ...this.entrees },
      reconnexions: {
        pertes: this.pertes, reussies: this.reussies, ratees: this.lentes + encoreAbsentes, enCours: enCours.length - encoreAbsentes,
        delaiP50Ms: percentile(rec, 0.5), delaiP95Ms: percentile(rec, 0.95), delaiMaxMs: rec.length ? Math.round(Math.max(...rec)) : 0,
      },
      connexions: this.connexions,
      messages: {
        recus: this.recus, envoyes: this.envoyes,
        parSecondeMoyenne: arrondi1(this.recus / (dureeMs / 1000)), parSecondePic: pic,
        octetsRecus: this.octetsRecus, octetsEnvoyes: this.octetsEnvoyes, octetsRecusParS: Math.round(this.octetsRecus / (dureeMs / 1000)),
        parType: Object.fromEntries(Object.entries(this.parType).map(([k, v]) => [k, { ...v }])),
      },
      lecture: {
        n: this.lectures.n, moyenneOctets: this.lectures.n ? Math.round(this.lectures.octets / this.lectures.n) : 0,
        maxOctets: this.lectures.max, octetsParS: Math.round(this.lectures.octets / (dureeMs / 1000)),
      },
    };
  }

  journal(): string { return ''; }

  arreter(): void {
    this.regieLigne?.fermer();
    this.regieLigne = null;
    for (const l of [...this.lignes.values()]) l.fermer();
    this.lignes.clear();
    this.conduites.clear();
    this.attentesLecture.clear();
  }
}
