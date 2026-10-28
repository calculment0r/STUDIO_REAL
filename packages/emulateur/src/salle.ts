// La salle émulée : le VRAI noyau du serveur de spectacle (apps/serveur-spectacle/src/noyau, `Representation`), qui
// tourne en mémoire, sans réseau, sur l'horloge émulée. Elle joue le rôle de l'hôte (Node ou Durable Object) :
// elle passe au noyau les messages des téléphones, les fermetures de ligne et le temps (tick 1 Hz), et remet les
// messages sortants selon leur destination (`correspond`). Les téléphones s'y branchent par le côté « serveur » de
// `transportMemoire()` (ui-telephone) : agents de la foule et iframes de vitrine passent par le même chemin.
// La régie est une session interne (`regie-emulee`) : `conduite(op)` lui fait envoyer ses ordres (le Conducteur
// branché sur l'émulateur y envoie ses GO). Rien ici ne touche au DOM.
import type { Projet, Signaux, EtatLecture } from '@studio-real/modele';
import {
  lireMessageClient,
  type MessageClient, type MessageServeur, type MsgAck, type OpConduite, type VueDiffusee,
} from '@studio-real/protocole';
import { Representation, correspond, type EvenementJournal, type InfoSession, type Sortie } from '@studio-real/serveur-spectacle';
import type { CoteServeurMemoire } from '@studio-real/ui-telephone';
import { mulberry32, sousGraine } from './alea';
import type { Ordonnanceur } from './horloge';
import type { EvenementSalle } from './types';

/** Session interne de la régie émulée. */
export const SESSION_REGIE = 'regie-emulee';
/** Événements de journal gardés en mémoire (le reste est perdu : la salle émulée n'écrit rien sur disque). */
const MAX_JOURNAL = 50_000;
/** Accusés gardés pour les latences. */
const MAX_LATENCES = 1000;

export interface OptionsSalle {
  projet: Projet;
  horloge: Ordonnanceur;
  graine: number;
  mode?: 'repetition' | 'scene';
}

interface Branchement {
  id: string;
  cote: CoteServeurMemoire | null;
  info: InfoSession | null;
  /** dernière vue remise : vseq → heure serveur (latence des accusés) */
  vues: Map<number, number>;
}

export class SalleEmulee {
  rep: Representation;
  readonly horloge: Ordonnanceur;
  private readonly graine: number;
  private mode: 'repetition' | 'scene';
  private readonly branches = new Map<string, Branchement>();
  private readonly abonnes = new Set<(e: EvenementSalle) => void>();
  private cseqRegie = 0;
  /** le noyau sur lequel la session de la régie est ouverte */
  private regieDe: Representation | null = null;
  private journalEv: EvenementJournal[] = [];
  private position = '';
  private arretTick: (() => void) | null = null;
  /** votes, question ouverte et textes, tenus d'après le journal du noyau */
  private compte: { question: string | null; votes: Record<string, Record<string, number>>; textes: number } = { question: null, votes: {}, textes: 0 };
  /** latences des accusés (ms), dans l'ordre */
  readonly latences: number[] = [];
  /** messages reçus des téléphones (compteur) */
  recus = 0;

  constructor(o: OptionsSalle) {
    this.horloge = o.horloge;
    this.graine = o.graine >>> 0;
    this.mode = o.mode ?? 'repetition';
    this.rep = this.creer(o.projet);
  }

  private creer(projet: Projet): Representation {
    return new Representation({ projet, horloge: () => this.horloge.maintenant(), alea: mulberry32(sousGraine(this.graine, 'serveur')) });
  }

  // ── Abonnements ───────────────────────────────────────────────────────────────────────────────────────────────

  surEvenement(fn: (e: EvenementSalle) => void): () => void {
    this.abonnes.add(fn);
    return () => { this.abonnes.delete(fn); };
  }
  emettre(e: EvenementSalle): void {
    for (const fn of [...this.abonnes]) {
      try { fn(e); } catch (err) { console.error('[emulateur] abonné', err); }
    }
  }

  // ── Régie ─────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Ouvre la session de la régie et lance une représentation ; le tick 1 Hz démarre. */
  lancer(mode: 'repetition' | 'scene' = this.mode, graine?: number): MsgAck {
    this.mode = mode;
    if (!this.regieOuverte()) this.ouvrirRegie();
    const ack = this.conduite(graine === undefined ? { op: 'lancer', mode } : { op: 'lancer', mode, graine });
    this.demarrerTick();
    return ack;
  }

  private regieOuverte(): boolean { return this.regieDe === this.rep; }

  private ouvrirRegie() {
    this.cseqRegie = 0;
    this.regieDe = this.rep;
    this.distribuer(this.rep.recevoir(SESSION_REGIE, { t: 'hello', v: 2, role: 'regie', session: SESSION_REGIE, jeton: 'emule' }));
  }

  /** Ordre de la régie émulée (le Conducteur branché sur l'émulateur). Renvoie l'accusé du noyau. */
  conduite(op: OpConduite): MsgAck {
    if (!this.regieOuverte()) this.ouvrirRegie();
    const cseq = ++this.cseqRegie;
    const sorties = this.rep.recevoir(SESSION_REGIE, { t: 'conduite', cseq, ...op } as MessageClient);
    const ack = sorties.find(s => s.m.t === 'ack' && s.m.cseq === cseq)?.m as MsgAck | undefined;
    this.distribuer(sorties);
    return ack ?? { t: 'ack', cseq, statut: 'refus', raison: 'aucune réponse' };
  }

  /** Le GO du Conducteur (règle du magasin) : `top` ; si l'étape menait au passage « go » du moment, le passage est
   *  franchi dans la même action (second `top`). */
  go(): void {
    const avant = this.rep.etatLecture();
    if (!avant || avant.termine) return;
    this.conduite({ op: 'top' });
    const apres = this.rep.etatLecture();
    if (avant.etape !== null && apres && !apres.termine && apres.moment === avant.moment && apres.etape === null) {
      const m = this.rep.projet.ev.find(x => x.id === apres.moment);
      if (m?.gate.mode === 'go' || apres.attenteGo) this.conduite({ op: 'top' });
    }
  }

  private demarrerTick() {
    if (this.arretTick) return;
    let actif = true;
    const tic = () => {
      if (!actif) return;
      this.distribuer(this.rep.tick(1));
      this.horloge.planifier(1000, tic);
    };
    this.horloge.planifier(1000, tic);
    this.arretTick = () => { actif = false; };
  }

  arreter(): void {
    this.arretTick?.();
    this.arretTick = null;
    for (const b of this.branches.values()) if (b.info) this.distribuer(this.rep.fermer(b.info.session));
  }

  /** Nouveau projet (le Conducteur l'a modifié en RÉPÉTITION) : nouveau noyau, relancé au même moment ; les
   *  téléphones branchés repassent par `hello` (comme après un redémarrage du serveur). Renvoie les sessions coupées
   *  (l'appelant les rouvre). */
  changerProjet(projet: Projet): string[] {
    const lecture = this.rep.etatLecture();
    const mode = this.mode;
    const run = this.rep.run;
    const pause = this.rep.enPause;
    this.arretTick?.();
    this.arretTick = null;
    const sessions = [...this.branches.values()].filter(b => b.info).map(b => b.info!.session);
    this.rep = this.creer(projet);
    this.position = '';
    this.compte = { question: null, votes: {}, textes: 0 };
    if (run) {
      this.lancer(mode, run.graine);
      if (lecture?.moment && projet.ev.some(m => m.id === lecture.moment) && lecture.moment !== this.rep.etatLecture()?.moment) {
        const m = projet.ev.find(x => x.id === lecture.moment)!;
        const etape = lecture.etape && m.st.some(s => s.id === lecture.etape) ? lecture.etape : undefined;
        this.conduite(etape ? { op: 'allerA', moment: m.id, etape } : { op: 'allerA', moment: m.id });
      }
      if (pause) this.conduite({ op: 'pause', pause: true });
    }
    for (const b of this.branches.values()) b.info = null;
    this.emettre({ type: 'resync', raison: 'projet modifié', t: this.horloge.maintenant() });
    return sessions;
  }

  // ── Téléphones ───────────────────────────────────────────────────────────────────────────────────────────────

  /** Branche le côté serveur d'un transport mémoire (agent de la foule ou iframe de vitrine). Ce que le téléphone
   *  envoie est lu comme sur le réseau (lireMessageClient) ; rien n'est lu pendant que la ligne est coupée. */
  brancher(id: string, cote: CoteServeurMemoire): () => void {
    const b: Branchement = { id, cote, info: null, vues: new Map() };
    const off = cote.surMessage(m => {
      if (!cote.ouverte || b.cote !== cote) return;
      this.recevoir(b, m);
    });
    return () => {
      off();
      if (b.info) this.fermerBranchement(b);
      b.cote = null;
    };
  }

  /** La ligne de ce téléphone est coupée (ou l'iframe fermée) : le noyau ferme la session. */
  ligneCoupee(session: string): void {
    const b = this.branches.get(session);
    if (b?.info) this.fermerBranchement(b);
  }

  private fermerBranchement(b: Branchement) {
    const info = b.info!;
    b.info = null;
    if (this.branches.get(info.session) === b) this.branches.delete(info.session);
    this.distribuer(this.rep.fermer(info.session));
    this.emettre({ type: 'deconnexion', id: b.id, t: this.horloge.maintenant() });
  }

  private recevoir(b: Branchement, brut: MessageClient) {
    // le transport mémoire a déjà fait une copie JSON (comme le réseau) : on valide comme l'hôte (lireMessageClient)
    const lu = lireMessageClient(brut);
    if (!lu.message) return;
    const m = lu.message;
    this.recus++;
    const now = this.horloge.maintenant();
    if (m.t === 'hello') {
      // une session reprise ailleurs (iframe qui remplace un agent) : l'ancienne ligne est lâchée
      const ancien = this.branches.get(m.session);
      if (ancien && ancien !== b) ancien.info = null;
      const info: InfoSession = { session: m.session, role: m.role };
      if (m.acteur !== undefined) info.acteur = m.acteur;
      info.personne = m.personne ?? m.session;
      b.info = info;
      this.branches.set(m.session, b);
      const sorties = this.rep.recevoir(m.session, m);
      const refus = sorties.find(s => s.m.t === 'refus' && s.m.fatal);
      this.distribuer(sorties);
      if (refus) { b.info = null; this.branches.delete(m.session); return; }
      this.emettre({ type: 'connexion', id: b.id, t: now });
      return;
    }
    if (!b.info) return;
    if (m.t === 'in' && m.k === 'accuse') {
      const at = b.vues.get(m.data.vseq);
      if (at !== undefined) {
        const latenceMs = Math.max(0, now - at);
        this.latences.push(latenceMs);
        if (this.latences.length > MAX_LATENCES) this.latences.splice(0, this.latences.length - MAX_LATENCES);
        this.emettre({ type: 'ack', id: b.id, n: m.data.vseq, latenceMs, t: now });
      }
    }
    const sorties = this.rep.recevoir(b.info.session, m);
    if (m.t === 'in' && m.k !== 'accuse' && m.k !== 'presence') {
      const ack = sorties.find(s => s.m.t === 'ack' && s.m.cseq === m.cseq);
      if (ack && ack.m.t === 'ack' && ack.m.statut === 'ok') {
        const nature = m.k === 'vote' ? 'vote' : m.k === 'texte' ? 'texte' : m.k === 'pret' ? 'pret' : 'toucher';
        const valeur = m.k === 'vote' ? { q: m.q, index: m.data.index } : m.k === 'texte' ? m.data.texte : m.data;
        this.emettre({ type: 'entree', id: b.id, nature, valeur, t: now });
      }
    }
    this.distribuer(sorties);
  }

  /** Remise des messages sortants (rôle de l'hôte) ; puis le journal et la position du lecteur. */
  private distribuer(sorties: Sortie[]) {
    let lecture: EtatLecture | null = null;
    for (const s of sorties) {
      // la régie émulée reçoit l'état de lecture à chaque changement (copie déjà faite par le noyau)
      if (s.m.t === 'lecture' && 'role' in s.a && s.a.role === 'regie') lecture = s.m.etat;
      for (const b of this.branches.values()) {
        if (!b.info || !b.cote || !correspond(s.a, b.info)) continue;
        const m: MessageServeur = s.m;
        if (m.t === 'vue') b.vues.set(m.vseq, m.at);
        else if (m.t === 'bienvenue' && m.vue) b.vues.set(m.vue.vseq, Math.max(m.vue.at, this.horloge.maintenant()));
        if (b.vues.size > 64) b.vues.delete(b.vues.keys().next().value!);
        b.cote.envoyer(m);
      }
    }
    const j = this.rep.journal();
    if (j.length) {
      for (const e of j) this.compter(e);
      this.journalEv.push(...j);
      if (this.journalEv.length > MAX_JOURNAL) this.journalEv.splice(0, this.journalEv.length - MAX_JOURNAL);
    }
    if (!lecture) return;
    const pos = `${lecture.moment}/${lecture.etape}/${lecture.termine}`;
    if (pos !== this.position) {
      this.position = pos;
      this.emettre({ type: 'lecture', moment: lecture.moment, etape: lecture.etape, t: this.horloge.maintenant() });
    }
  }

  // ── Lecture ──────────────────────────────────────────────────────────────────────────────────────────────────

  vueDe(acteur: string, personne?: string): VueDiffusee | null { return this.rep.vue(acteur, personne); }
  signaux(): Signaux { return this.rep.signaux(); }
  lecture(): EtatLecture | null { return this.rep.etatLecture(); }
  /** Votes reçus pour la question ouverte (lettre → nombre), la question, les textes reçus : tenus à partir du journal
   *  du noyau (votes acceptés, question ouverte), sans copier son état. */
  votes(): { question: string | null; votes: Record<string, number>; textes: number } {
    const q = this.compte.question;
    const votes: Record<string, number> = {};
    if (q) for (const i of Object.values(this.compte.votes[q] ?? {})) {
      const k = String.fromCharCode(65 + i);
      votes[k] = (votes[k] ?? 0) + 1;
    }
    return { question: q, votes, textes: this.compte.textes };
  }

  private compter(e: EvenementJournal) {
    const c = this.compte;
    if (e.type === 'lancer') { c.question = null; c.votes = {}; c.textes = 0; return; }
    if (e.type === 'alerte' && e.code === 'question' && typeof e.q === 'string') { c.question = e.q; return; }
    if (e.type !== 'entree') return;
    if (e.k === 'vote' && typeof e.q === 'string' && typeof e.index === 'number') (c.votes[e.q] ??= {})[`${String(e.acteur)}/${String(e.personne)}`] = e.index;
    else if (e.k === 'texte') c.textes++;
  }

  /** Le journal de la salle émulée, en JSONL (même format que exploitation/journaux/<run>.jsonl). */
  journal(): string { return this.journalEv.map(e => JSON.stringify(e)).join('\n') + (this.journalEv.length ? '\n' : ''); }
  evenementsJournal(): readonly EvenementJournal[] { return this.journalEv; }
}
