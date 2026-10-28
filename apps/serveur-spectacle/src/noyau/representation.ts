// Le module « représentation » du serveur de spectacle (audit 2026-10, rapport 1 §4.2 et §4.3 ; rapport 5 §4.6).
//
// Il tient l'état OFFICIEL d'une représentation : le run, le lecteur du modèle (mode scène), l'état de la salle par
// acteur (personnes présentes, visibles, prêtes, votes, textes, écran affiché), les vues diffusées et leur `vseq`, les
// commandes aux agents et leurs accusés, et le journal. Il ne fait AUCUNE entrée-sortie : l'hôte (Node aujourd'hui, un
// Durable Object demain) lui passe les messages lus (`recevoir`), les fermetures (`fermer`) et le temps (`tick`), et remet
// les messages sortants selon leur destination (`Sortie.a`). L'horloge et l'aléa sont injectés.
//
// Reprise : l'instantané est une copie de l'état (données JSON). Le lecteur est reconstruit en rejouant ses entrées
// (`entrees`, avec la même graine) : le lecteur du modèle est déterministe.
//
// Règles :
// - `cseq` par session : un cseq déjà vu reçoit `ack{doublon}` sans réapplication ;
// - une voix par personne et par question (`ack{doublon, raison:'deja-vote'}`), seulement pendant que l'écran de vote
//   est montré à la foule ;
// - `conduite` : rôle `regie` seulement ; `in` : rôle `acteur` seulement ; `agent.ack` / `agent.in` : rôle `agent` ;
// - chaque entrée d'un acteur (vote, texte, pret, fin-video, transcription) devient le signal `<acteur>.<k>` du lecteur ;
//   `fin-video` donne aussi `video.fin` (donnée : l'asset), `transcription` donne aussi `transcription` ;
// - `agent.ack{fait}` → signal de l'accusé de la commande (`accuse:<étape>` par défaut) ;
// - Signaux du lecteur calculés depuis la salle RÉELLE : pres, quorum, prets, votes, issue ; bruit et assis n'ont pas
//   de capteur : valeurs neutres (salle calme et assise) ;
// - `vue.at` et `fx.at` en heure serveur ; un `fx` dont `at + ttl` est passé n'est pas rejoué à la reconnexion ;
// - `panique` : tous les acteurs (hors agents) sur leur écran de sécurité ; levée → retour aux vues calculées ;
// - `forcer` : vue imposée, journalisée, valable jusqu'au prochain envoi du lecteur à cet acteur.
import {
  cibleDansFoule, creerLecteur, envoisPasses, personneConcernee, vueActeur,
  type Acteur, type ContexteFoule, type EnvoiPasse, type EtatLecture, type Lecteur, type Projet, type Signaux,
} from '@studio-real/modele';
import {
  LIMITES, VERSION_PROTOCOLE,
  type MessageClient, type MessageServeur, type MsgAck, type MsgAgentAck, type MsgAgentCmd, type MsgAgentIn, type MsgBienvenue, type MsgConduite,
  type MsgEtat, type MsgFx, type MsgHello, type MsgIn, type MsgSalle, type StatutAck, type VueDiffusee,
} from '@studio-real/protocole';
import { acteursCibles, acteursFoule, agentPour, preparerProjet, type ProjetPrepare } from './projet';
import { cloner, empreinteDe, idRepresentation, jsonStable, lettre } from './outils';
import type {
  CommandeAgent, Destination, EntreeLecteur, EtatRepresentation, EvenementJournal, InfoSession, OptionsRepresentation,
  PersonneSalle, SessionEtat, Sortie, TypeEvenement,
} from './types';

export const FORMAT_INSTANTANE = 'studio-real/representation@1' as const;
/** Textes gardés en mémoire pour la régie (tous vont au journal). */
export const MAX_TEXTES = 200;
/** Fenêtre des cseq retenus par session (renvois dans le désordre). */
export const FENETRE_CSEQ = 64;
/** Durée de vie par défaut d'un effet (ms). */
export const TTL_FX = 5000;
/** Résumé de salle à la régie : au plus 4 par seconde. */
export const INTERVALLE_SALLE_MS = 250;
/** Bruit et assis : pas de capteur en salle → valeurs neutres (salle calme, assise). À remplacer par un vrai capteur. */
export const SIGNAUX_SANS_CAPTEUR = { bruit: 32, assis: 100 } as const;

/** Réponse d'un traitement idempotent (devient l'`ack`). */
interface Resultat { statut: StatutAck; raison?: string; res?: unknown }
const ok = (res?: unknown): Resultat => (res === undefined ? { statut: 'ok' } : { statut: 'ok', res });
const refus = (raison: string): Resultat => ({ statut: 'refus', raison });

/** Une destination correspond-elle à cette connexion ? (utilisé par l'hôte pour la remise) */
export function correspond(d: Destination, s: InfoSession): boolean {
  if ('session' in d) return s.session === d.session;
  if ('role' in d) return s.role === d.role;
  if ('tous' in d) return true;
  if (s.role !== 'acteur' && s.role !== 'agent') return false;
  if (s.acteur !== d.acteur) return false;
  return d.personne === undefined || (s.personne ?? s.session) === d.personne;
}

/** Joue une entrée sur un lecteur (une fois). */
function jouer(L: Lecteur, x: EntreeLecteur): void {
  switch (x.k) {
    case 'avancer': L.avancer(x.dt, x.s); break;
    case 'top': L.top(); break;
    case 'allerA': L.allerA(x.moment, x.etape); break;
    case 'reprendre': L.reprendre(x.point); break;
    case 'poser': L.poser(x.nom, x.valeur); break;
    case 'signal': L.signal(x.nom, x.donnees); break;
  }
}

const cleFlux = (acteur: string, personne?: string) => (personne === undefined ? acteur : `${acteur}/${personne}`);
const arrondi = (x: number) => Math.round(x * 10) / 10;

function etatVide(empreinteProjet: string): EtatRepresentation {
  return {
    format: FORMAT_INSTANTANE, projet: empreinteProjet, run: null, entrees: [], lecture: null, pause: false, panique: false,
    sessions: {}, salle: {}, votes: {}, question: null, voteOuvert: false, textes: [], reactions: {}, flux: {}, fxEmis: [],
    fxActifs: [], tirages: {}, commandes: [], nLecteur: 0, forcages: [], signaux: null,
    salleEnvoyee: { ts: 0, empreinte: '' }, position: '', dernierTop: null, agents: {},
  };
}

/** Vue à diffuser (sans numéro ni heure). */
interface VueCalculee { ecran: string | null; params: Record<string, unknown>; cle?: string }

export class Representation {
  /** projet joué (préparé : acteurs et envois) */
  readonly projet: Projet;
  readonly preparation: Omit<ProjetPrepare, 'projet'>;
  readonly empreinteProjet: string;
  private readonly horloge: () => number;
  private readonly alea: () => number;
  private readonly acteurs = new Map<string, Acteur>();
  private readonly foule: string[];
  private readonly cibles: Set<string>;
  private e: EtatRepresentation;
  private lecteur: Lecteur | null = null;
  private etatL: EtatLecture | null = null;
  private aJournaliser: EvenementJournal[] = [];
  /** messages produits par l'appel en cours */
  private sorties: Sortie[] = [];
  /** le lecteur a reçu une entrée pendant l'appel en cours */
  private touche = false;

  constructor(o: OptionsRepresentation) {
    const p = preparerProjet(o.projet);
    this.projet = p.projet;
    this.preparation = { origine: p.origine, converties: p.converties };
    this.empreinteProjet = empreinteDe(this.projet);
    this.horloge = o.horloge;
    this.alea = o.alea;
    for (const a of this.projet.acteurs ?? []) this.acteurs.set(a.id, a);
    this.foule = acteursFoule(this.projet).map(a => a.id);
    this.cibles = acteursCibles(this.projet);
    this.e = etatVide(this.empreinteProjet);
  }

  // ── Lecture de l'état ──────────────────────────────────────────────────────────────────────────────────────────

  get run() { return this.e.run; }
  get enPause() { return this.e.pause; }
  get enPanique() { return this.e.panique; }
  /** état de lecture courant (null avant le premier lancement) */
  etatLecture(): EtatLecture | null { return this.etatL ? cloner(this.etatL) : null; }
  /** vue diffusée d'un acteur (ou d'une personne de la foule) */
  vue(acteur: string, personne?: string): VueDiffusee | null {
    const cle = personne !== undefined && this.cibleeParPersonne(acteur) ? cleFlux(acteur, personne) : acteur;
    const f = this.e.flux[cle];
    return f ? cloner(f.vue) : null;
  }
  /** signaux de la salle réelle tels qu'ils seraient passés au lecteur maintenant */
  signaux(): Signaux { return this.calculerSignaux(); }
  commandes(): CommandeAgent[] { return cloner(this.e.commandes); }

  /** Événements du journal produits depuis le dernier appel (l'hôte les écrit aussitôt, dans l'ordre). */
  journal(): EvenementJournal[] {
    const l = this.aJournaliser;
    this.aJournaliser = [];
    return l;
  }

  /** Résumé pour la supervision (`GET /sante`) : AUCUNE donnée personnelle (ni pseudo, ni texte, ni identifiant). */
  resume() {
    const e = this.e;
    const L = this.etatL;
    const connectes = { regie: 0, agent: 0, acteur: 0, auteur: 0 };
    for (const s of Object.values(e.sessions)) if (s.connectee) connectes[s.role]++;
    const acteurs: Record<string, number> = {};
    for (const [id, personnes] of Object.entries(e.salle)) acteurs[id] = Object.values(personnes).filter(p => p.sessions.length).length;
    const agents: Record<string, { connectes: number; enAttente: number; derniereStat: number | null }> = {};
    for (const s of Object.values(e.sessions)) if (s.connectee && s.role === 'agent' && s.acteur) {
      agents[s.acteur] ??= { connectes: 0, enAttente: 0, derniereStat: e.agents[s.acteur]?.ts ?? null };
      agents[s.acteur]!.connectes++;
    }
    for (const c of e.commandes) if (c.statut === 'envoye' || c.statut === 'recu') {
      agents[c.agent] ??= { connectes: 0, enAttente: 0, derniereStat: e.agents[c.agent]?.ts ?? null };
      agents[c.agent]!.enAttente++;
    }
    return {
      run: e.run ? { id: e.run.id, debut: e.run.debut, mode: e.run.mode } : null,
      lecture: L ? { moment: L.moment, etape: L.etape, t: Math.round(L.t), phase: L.phase ?? null, attenteGo: L.attenteGo, termine: L.termine } : null,
      pause: e.pause, panique: e.panique, dernierTop: e.dernierTop, connectes, acteurs, agents,
      entreesLecteur: e.entrees.length,
    };
  }

  // ── Instantané ─────────────────────────────────────────────────────────────────────────────────────────────────

  /** État complet (copie JSON) : run, entrées du lecteur, salle, votes, sessions (cseq vus), flux (vseq), commandes… */
  instantane(): EtatRepresentation {
    if (this.lecteur) this.e.lecture = empreinteDe(this.lecteur.etat());
    return cloner(this.e);
  }

  /**
   * Reprend un instantané : recopie l'état et reconstruit le lecteur en rejouant ses entrées. `divergence` : l'état de
   * lecture rejoué n'a pas l'empreinte enregistrée (projet modifié, modèle changé) ; la reprise continue avec l'état
   * rejoué, et une alerte est journalisée.
   */
  restaurer(x: unknown): { divergence: boolean; projetModifie: boolean } {
    const brut = x as Partial<EtatRepresentation> | null;
    if (!brut || typeof brut !== 'object' || brut.format !== FORMAT_INSTANTANE) throw new Error('Instantané illisible : format studio-real/representation@1 attendu.');
    const etat = { ...etatVide(this.empreinteProjet), ...cloner(brut) } as EtatRepresentation;
    this.e = etat;
    this.lecteur = null;
    this.etatL = null;
    let divergence = false;
    if (etat.run) {
      const L = creerLecteur(this.projet, { mode: etat.run.mode, graine: etat.run.graine });
      for (const entree of etat.entrees) {
        const n = entree.k === 'avancer' ? entree.x ?? 1 : 1;
        for (let i = 0; i < n; i++) jouer(L, entree);
      }
      this.lecteur = L;
      this.etatL = L.etat();
      const emp = empreinteDe(this.etatL);
      divergence = etat.lecture !== null && etat.lecture !== emp;
      etat.lecture = emp;
    }
    const projetModifie = etat.projet !== this.empreinteProjet;
    this.journaliser('reprise', { entrees: etat.entrees.length, divergence, projetModifie });
    if (divergence) this.journaliser('alerte', { code: 'reprise-divergente', message: 'L’état de lecture rejoué diffère de l’instantané.' });
    if (projetModifie) {
      this.journaliser('alerte', { code: 'projet-modifie', message: 'Le projet a changé depuis l’instantané.' });
      etat.projet = this.empreinteProjet;
    }
    return { divergence, projetModifie };
  }

  /** Après un redémarrage de l'hôte : plus aucune connexion n'est ouverte (les clients vont se reconnecter). */
  redemarrer(): Sortie[] {
    const ouvertes = Object.entries(this.e.sessions).filter(([, s]) => s.connectee);
    this.journaliser('demarrage', { sessionsFermees: ouvertes.length });
    if (!ouvertes.length) return [];
    return this.executer(() => { for (const [id, s] of ouvertes) this.detacher(id, s); });
  }

  // ── Entrées ────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Démarre une nouvelle représentation (nouveau run, nouveau lecteur ; la salle connectée reste). */
  lancer(mode: 'repetition' | 'scene' = 'scene', graine?: number): Sortie[] {
    return this.executer(() => this.lancerInterne(mode, graine));
  }

  /** Un message client déjà lu et validé (`lireMessageClient`) ; pour `hello`, le jeton a été vérifié par l'hôte. */
  recevoir(session: string, m: MessageClient): Sortie[] {
    return this.executer(() => {
      if (m.t === 'hello') { this.ouvrir(session, m); return; }
      const s = this.e.sessions[session];
      if (!s || !s.connectee) {
        this.envoyer({ session }, { t: 'refus', code: 'hello-requis', message: 'Envoyer hello d’abord.' });
        return;
      }
      switch (m.t) {
        case 'ping': this.envoyer({ session }, { t: 'pong', tc: m.tc, ts: this.horloge() }); return;
        case 'resync': this.resync(session, s); return;
        case 'etat': this.battement(session, s, m); return;
        case 'agent.ack': this.accuseAgent(session, s, m); return;
        case 'rtc': {
          const vers = this.e.sessions[m.vers]?.connectee ? { session: m.vers } : this.acteurs.has(m.vers) ? { acteur: m.vers } : null;
          if (!vers || s.role === 'regie' || s.role === 'auteur') {
            this.envoyer({ session }, { t: 'refus', code: 'rtc-absent', message: `Destinataire ${m.vers} absent.` });
            return;
          }
          this.envoyer(vers, { t: 'rtc', de: session, vers: m.vers, signal: m.signal, ts: this.horloge() });
          return;
        }
        case 'conduite': case 'in': case 'agent.in': {
          if (s.cseq - m.cseq >= FENETRE_CSEQ || s.cseqs.includes(m.cseq)) {
            this.envoyer({ session }, { t: 'ack', cseq: m.cseq, statut: 'doublon' });
            return;
          }
          s.cseqs = [...s.cseqs, m.cseq].sort((a, b) => a - b).slice(-FENETRE_CSEQ);
          s.cseq = Math.max(s.cseq, m.cseq);
          const r = m.t === 'conduite' ? this.conduite(session, s, m) : m.t === 'in' ? this.entree(session, s, m) : this.agentIn(session, s, m);
          const ack: MsgAck = { t: 'ack', cseq: m.cseq, statut: r.statut };
          if (r.raison !== undefined) ack.raison = r.raison;
          if (r.res !== undefined) ack.res = r.res;
          this.envoyer({ session }, ack);
          if (r.statut === 'refus') this.journaliser('refus', { session, t: m.t, raison: r.raison });
        }
      }
    });
  }

  /** La connexion de cette session s'est fermée. */
  fermer(session: string): Sortie[] {
    return this.executer(() => {
      const s = this.e.sessions[session];
      if (s?.connectee) this.detacher(session, s);
    });
  }

  /** Le temps passe (alarme de l'hôte, 1 Hz) : le lecteur avance avec les signaux de la salle réelle. */
  tick(dt: number): Sortie[] {
    return this.executer(() => {
      const now = this.horloge();
      if (this.lecteur && this.etatL && !this.e.pause && !this.etatL.termine && Number.isFinite(dt) && dt > 0)
        this.appliquer({ k: 'avancer', dt, s: this.calculerSignaux() });
      this.e.fxActifs = this.e.fxActifs.filter(f => f.m.at + f.m.ttl > now);
    }, true);
  }

  /** Message `bienvenue` d'une session ouverte : vue courante (acteur, agent), lecture (régie), dernier cseq reçu. */
  bienvenue(session: string): MsgBienvenue {
    const s = this.e.sessions[session];
    if (!s) throw new Error(`Session inconnue : ${session}`);
    const m: MsgBienvenue = { t: 'bienvenue', v: VERSION_PROTOCOLE, role: s.role, session, ts: this.horloge(), vue: null, cseq: s.cseq };
    if (s.acteur !== undefined) m.acteur = s.acteur;
    if ((s.role === 'acteur' || s.role === 'agent') && s.acteur) m.vue = cloner(this.assurerFlux(s.acteur, s.personne ?? session).vue);
    if (s.role === 'regie') m.lecture = this.etatL ? { etat: cloner(this.etatL), par: 'serveur', ts: this.horloge() } : null;
    return m;
  }

  // ── Mécanique interne ──────────────────────────────────────────────────────────────────────────────────────────

  private executer(f: () => void, depuisTick = false): Sortie[] {
    this.sorties = [];
    this.touche = false;
    f();
    this.mettreAJour(depuisTick);
    const out = this.sorties;
    this.sorties = [];
    return out;
  }

  private envoyer(a: Destination, m: MessageServeur) { this.sorties.push({ a, m }); }

  private journaliser(type: TypeEvenement, detail: Record<string, unknown> = {}) {
    // Les champs fixes gardent leur valeur même si un détail porte le même nom.
    const e: EvenementJournal = { ts: 0, run: null, src: 'serveur', type, ...detail };
    e.ts = this.horloge();
    e.run = this.e.run?.id ?? null;
    e.src = 'serveur';
    e.type = type;
    this.aJournaliser.push(e);
  }

  /** Entrée du lecteur : journalisée (pour la reprise), puis jouée. Les `avancer` identiques consécutifs sont comptés. */
  private appliquer(x: EntreeLecteur) {
    if (!this.lecteur) return;
    const der = this.e.entrees[this.e.entrees.length - 1];
    if (x.k === 'avancer' && der?.k === 'avancer' && der.dt === x.dt && jsonStable(der.s) === jsonStable(x.s)) der.x = (der.x ?? 1) + 1;
    else this.e.entrees.push(cloner(x));
    jouer(this.lecteur, x);
    if (x.k === 'avancer') this.e.signaux = cloner(x.s);
    this.etatL = this.lecteur.etat();
    this.touche = true;
  }

  private lancerInterne(mode: 'repetition' | 'scene', graine?: number) {
    const now = this.horloge();
    const g = graine ?? Math.floor(this.alea() * 2 ** 32);
    const e = this.e;
    e.run = { id: idRepresentation(now, this.alea), debut: now, mode, graine: g };
    e.entrees = [];
    e.lecture = null;
    e.pause = false;
    e.panique = false;
    e.votes = {};
    e.question = null;
    e.voteOuvert = false;
    e.textes = [];
    e.reactions = {};
    e.fxEmis = [];
    e.fxActifs = [];
    e.tirages = {};
    e.commandes = [];
    e.nLecteur = 0;
    e.forcages = [];
    e.signaux = null;
    e.position = '';
    e.dernierTop = null;
    for (const personnes of Object.values(e.salle)) for (const p of Object.values(personnes)) p.pret = false;
    // Les flux (et leurs vseq) continuent : un client ne voit jamais un vseq reculer.
    this.lecteur = creerLecteur(this.projet, { mode, graine: g });
    this.etatL = this.lecteur.etat();
    this.touche = true;
    this.journaliser('lancer', { mode, graine: g, projet: this.empreinteProjet, titre: this.projet.titre ?? null });
  }

  private personne(acteur: string, cle: string): PersonneSalle {
    const salle = (this.e.salle[acteur] ??= {});
    return (salle[cle] ??= { sessions: [], visible: true, pret: false, enLigne: true, affiche: null, vu: this.horloge() });
  }

  private ouvrir(session: string, m: MsgHello) {
    const fatal = (code: string, message: string) => this.envoyer({ session }, { t: 'refus', code, message, fatal: true });
    if (m.role === 'auteur') { fatal('role-non-gere', 'Le rôle auteur est servi par la salle de projet (apps/serveur), pas par le serveur de spectacle.'); return; }
    const a = m.acteur !== undefined ? this.acteurs.get(m.acteur) : undefined;
    if (m.role === 'acteur' && (!a || a.type === 'agent')) { fatal('acteur-inconnu', `Acteur « ${m.acteur ?? ''} » inconnu du projet.`); return; }
    if (m.role === 'agent' && a && a.type !== 'agent') { fatal('acteur-inconnu', `« ${m.acteur ?? ''} » n’est pas un agent du projet.`); return; }
    const ancienne = this.e.sessions[session];
    if (ancienne?.connectee) this.detacher(session, ancienne, false);
    const s: SessionEtat = {
      role: m.role, cseq: ancienne?.cseq ?? 0, cseqs: ancienne?.cseqs ?? [], connectee: true, depuis: this.horloge(),
    };
    if (m.acteur !== undefined) s.acteur = m.acteur;
    if (m.personne !== undefined) s.personne = m.personne;
    if (m.app) s.app = m.app;
    this.e.sessions[session] = s;
    const cleP = m.personne ?? session;
    if (m.role === 'acteur' && m.acteur) {
      const p = this.personne(m.acteur, cleP);
      if (!p.sessions.includes(session)) p.sessions.push(session);
      p.vu = this.horloge();
      p.enLigne = true;
      p.visible = true;
    }
    this.journaliser('connexion', {
      session, role: m.role, acteur: m.acteur ?? null, personne: m.role === 'acteur' ? cleP : null, reprise: !!ancienne,
      vseqClient: m.vseq ?? null, app: m.app?.version ?? null,
    });
    this.envoyer({ session }, this.bienvenue(session));
    const now = this.horloge();
    if (m.role === 'acteur' && m.acteur) {
      const info: InfoSession = { session, role: 'acteur', acteur: m.acteur, personne: cleP };
      for (const f of this.e.fxActifs) if (f.m.at + f.m.ttl > now && correspond(f.a, info)) this.envoyer({ session }, cloner(f.m));
    }
    if (m.role === 'agent' && m.acteur) {
      for (const c of this.e.commandes) if (c.agent === m.acteur && (c.statut === 'envoye' || c.statut === 'recu')) this.envoyer({ session }, this.messageCommande(c));
    }
    if (m.role === 'regie') this.envoyer({ session }, this.messageSalle());
  }

  private detacher(session: string, s: SessionEtat, journal = true) {
    s.connectee = false;
    if (s.role === 'acteur' && s.acteur) {
      const p = this.e.salle[s.acteur]?.[s.personne ?? session];
      if (p) { p.sessions = p.sessions.filter(x => x !== session); p.vu = this.horloge(); }
    }
    if (journal) this.journaliser('deconnexion', { session, role: s.role, acteur: s.acteur ?? null });
  }

  private resync(session: string, s: SessionEtat) {
    if ((s.role === 'acteur' || s.role === 'agent') && s.acteur) {
      this.envoyer({ session }, { t: 'vue', ...cloner(this.assurerFlux(s.acteur, s.personne ?? session).vue) });
    } else this.envoyer({ session }, this.bienvenue(session));
  }

  private battement(session: string, s: SessionEtat, m: MsgEtat) {
    if (s.role !== 'acteur' || !s.acteur) return;
    const p = this.personne(s.acteur, s.personne ?? session);
    const avant = jsonStable(p.affiche);
    p.affiche = m.ecran ? cloner(m.ecran) : null;
    p.visible = m.visible;
    p.enLigne = m.enLigne ?? true;
    if (m.rttMs !== undefined) p.rttMs = m.rttMs;
    p.vu = this.horloge();
    if (jsonStable(p.affiche) !== avant) this.journaliser('entree', { k: 'etat', acteur: s.acteur, personne: s.personne ?? session, ecran: p.affiche });
  }

  private conduite(session: string, s: SessionEtat, m: MsgConduite): Resultat {
    if (s.role !== 'regie') return refus('role : conduite réservée à la régie');
    const { t: _t, cseq: _c, ...detail } = m as MsgConduite & Record<string, unknown>;
    const op = m;
    if (op.op === 'lancer') {
      this.lancerInterne(op.mode ?? 'scene', op.graine);
      this.journaliser('conduite', { session, op: op.op, mode: op.mode ?? 'scene' });
      return ok({ run: this.e.run!.id });
    }
    if (!this.lecteur) return refus('aucune-representation : lancer d’abord');
    switch (op.op) {
      case 'top': this.appliquer({ k: 'top' }); this.e.dernierTop = this.horloge(); break;
      case 'pause': this.e.pause = op.pause; break;
      case 'allerA':
        if (!this.projet.ev.some(x => x.id === op.moment)) return refus(`moment-inconnu : ${op.moment}`);
        this.appliquer(op.etape === undefined ? { k: 'allerA', moment: op.moment } : { k: 'allerA', moment: op.moment, etape: op.etape });
        break;
      case 'reprendre': this.appliquer(op.point === undefined ? { k: 'reprendre' } : { k: 'reprendre', point: op.point }); break;
      case 'poser': this.appliquer({ k: 'poser', nom: op.nom, valeur: op.valeur }); break;
      case 'signal': this.appliquer(op.donnees === undefined ? { k: 'signal', nom: op.nom } : { k: 'signal', nom: op.nom, donnees: op.donnees }); break;
      case 'forcer': {
        const cible = cibleDansFoule(op.acteur);
        const a = cible ? this.acteurs.get(cible.acteur) : undefined;
        if (!cible || !a) return refus(`acteur-inconnu : ${op.acteur}`);
        if (a.ecrans.length && !a.ecrans.includes(op.vue.ecran)) return refus(`ecran-inconnu : ${op.vue.ecran} (${a.id})`);
        const envois = this.etatL ? envoisPasses(this.projet, this.etatL).filter(x => x.cible.acteur === a.id).length : 0;
        this.e.forcages.push({ cible: op.acteur, acteur: a.id, ecran: op.vue.ecran, params: cloner(op.vue.params ?? {}), at: this.horloge(), envois });
        this.journaliser('forcer', { session, cible: op.acteur, ecran: op.vue.ecran, params: op.vue.params ?? {} });
        return ok();
      }
      case 'panique':
        this.e.panique = op.actif;
        this.journaliser('panique', { session, actif: op.actif });
        return ok();
      case 'valider': {
        const agent = agentPour(this.projet, 'figurants.valider');
        if (!agent) return refus('aucun-agent : pas d’agent figurants');
        const d: Record<string, unknown> = { id: op.id, ok: op.ok };
        if (op.texte !== undefined) d.texte = op.texte;
        this.creerCommande({ type: 'figurants.valider', etape: this.etatL?.etape ?? '', donnees: d, source: 'regie' }, agent, this.etatL?.moment ?? undefined);
        break;
      }
    }
    this.journaliser('conduite', { session, ...cloner(detail) });
    const L = this.etatL;
    return ok(L ? { moment: L.moment, etape: L.etape, t: L.t } : undefined);
  }

  private entree(session: string, s: SessionEtat, m: MsgIn): Resultat {
    if (s.role !== 'acteur' || !s.acteur) return refus('role : entrées réservées aux acteurs');
    const acteur = s.acteur;
    const cleP = s.personne ?? session;
    const p = this.personne(acteur, cleP);
    p.vu = this.horloge();
    const signal = (nom: string, donnees?: unknown) => {
      if (this.lecteur) this.appliquer(donnees === undefined ? { k: 'signal', nom } : { k: 'signal', nom, donnees: cloner(donnees) });
    };
    const journal = (detail: Record<string, unknown>) => this.journaliser('entree', { k: m.k, acteur, personne: cleP, ...detail });
    switch (m.k) {
      case 'vote': {
        if (!this.foule.includes(acteur)) return refus(`vote-reserve : seule la foule vote (${acteur})`);
        const q = m.q ?? this.e.question;
        if (!q) return refus('aucun-vote : pas de question ouverte');
        if (!this.e.voteOuvert || q !== this.e.question) return refus(`vote-ferme : ${q}`);
        const votes = (this.e.votes[q] ??= {});
        const votant = `${acteur}/${cleP}`;
        if (votes[votant] !== undefined) return { statut: 'doublon', raison: 'deja-vote' };
        votes[votant] = m.data.index;
        journal({ q, index: m.data.index });
        signal(`${acteur}.vote`, { q, index: m.data.index, valeur: lettre(m.data.index) });
        return ok({ q, recus: Object.keys(votes).length });
      }
      case 'texte': {
        const t = { ts: this.horloge(), acteur, personne: cleP, texte: m.data.texte, ...(m.q !== undefined ? { q: m.q } : {}) };
        this.e.textes = [...this.e.textes, t].slice(-MAX_TEXTES);
        journal({ q: m.q ?? null, texte: m.data.texte });
        signal(`${acteur}.texte`, { texte: m.data.texte, ...(m.q !== undefined ? { q: m.q } : {}) });
        return ok();
      }
      case 'reaction': {
        const r = (this.e.reactions[acteur] ??= {});
        r[m.data.emoji] = (r[m.data.emoji] ?? 0) + (m.data.n ?? 1);
        journal({ emoji: m.data.emoji, n: m.data.n ?? 1 });
        return ok();
      }
      case 'pret':
        p.pret = m.data.pret;
        journal({ pret: m.data.pret });
        signal(`${acteur}.pret`, m.data.pret);
        return ok();
      case 'presence':
        p.visible = m.data.visible;
        journal({ visible: m.data.visible });
        return ok();
      case 'fin-video':
        journal({ asset: m.data.asset, vseq: m.data.vseq ?? null });
        signal('video.fin', m.data.asset);
        signal(`${acteur}.fin-video`, m.data.asset);
        return ok();
      case 'transcription': {
        const d = { texte: m.data.texte, final: m.data.final ?? false };
        journal(d);
        signal('transcription', d);
        signal(`${acteur}.transcription`, d);
        return ok();
      }
      case 'accuse': {
        const f = this.e.flux[cleFlux(acteur, this.cibleeParPersonne(acteur) ? cleP : undefined)];
        const ecran = f && f.vue.vseq === m.data.vseq ? f.vue.ecran ?? '' : '';
        p.affiche = { vseq: m.data.vseq, ecran, depuis: m.data.affiche, ...(f?.vue.cle && f.vue.vseq === m.data.vseq ? { cle: f.vue.cle } : {}) };
        if (m.data.refus) journal({ vseq: m.data.vseq, refus: m.data.refus });
        return ok();
      }
    }
  }

  private agentIn(session: string, s: SessionEtat, m: MsgAgentIn): Resultat {
    if (s.role !== 'agent' || !s.acteur) return refus('role : réservé aux agents');
    if (m.k === 'stat') this.e.agents[s.acteur] = { ts: this.horloge(), stat: cloner(m.data) };
    else this.journaliser('agent.in', { session, agent: s.acteur, k: m.k, data: m.data });
    return ok();
  }

  private accuseAgent(session: string, s: SessionEtat, m: MsgAgentAck) {
    const c = this.e.commandes[m.n - 1];
    if (s.role !== 'agent' || !c || c.n !== m.n || c.agent !== s.acteur) {
      this.envoyer({ session }, { t: 'refus', code: 'commande-inconnue', message: `Commande ${m.n} inconnue pour cet agent.` });
      return;
    }
    if (c.statut === 'fait' || c.statut === 'echec' || c.statut === 'refus') return;   // accusé déjà pris en compte
    c.statut = m.statut;
    this.journaliser('agent.ack', { n: c.n, agent: c.agent, statut: m.statut, ...(m.detail !== undefined ? { detail: m.detail } : {}) });
    if (m.statut === 'fait' && c.accuse && this.lecteur) this.appliquer({ k: 'signal', nom: c.accuse, donnees: { n: c.n } });
  }

  private messageCommande(c: CommandeAgent): MsgAgentCmd {
    const m: MsgAgentCmd = { t: 'agent.cmd', n: c.n, type: c.type, etape: c.etape, donnees: cloner(c.donnees), at: c.at };
    if (c.moment !== undefined) m.moment = c.moment;
    return m;
  }

  private creerCommande(x: Pick<CommandeAgent, 'type' | 'etape' | 'donnees' | 'source'> & Partial<Pick<CommandeAgent, 'nLecteur' | 'accuse'>>, agent: string, moment?: string) {
    const c: CommandeAgent = { n: this.e.commandes.length + 1, at: this.horloge(), agent, statut: 'envoye', ...cloner(x) };
    if (moment) c.moment = moment;
    this.e.commandes.push(c);
    this.envoyer({ acteur: agent }, this.messageCommande(c));
    this.journaliser('agent.cmd', { n: c.n, agent, commande: c.type, etape: c.etape, source: c.source, ...(c.nLecteur !== undefined ? { nLecteur: c.nLecteur } : {}) });
  }

  // ── Vues, effets, commandes : recalcul après chaque entrée ────────────────────────────────────────────────────

  /** L'acteur a-t-il une vue par personne (envois ciblés, ou forçage ciblé) ? */
  private cibleeParPersonne(acteur: string): boolean {
    return this.cibles.has(acteur) || this.e.forcages.some(f => f.acteur === acteur && cibleDansFoule(f.cible)?.filtre);
  }

  private contexteFoule(acteur: string, personne: string): ContexteFoule {
    const votant = `${acteur}/${personne}`;
    const votes: Record<string, string> = {};
    for (const [q, v] of Object.entries(this.e.votes)) if (v[votant] !== undefined) votes[q] = lettre(v[votant]!);
    const ctx: ContexteFoule = {
      personne, votes, tirages: Object.entries(this.e.tirages).filter(([, l]) => l.includes(personne)).map(([cle]) => cle),
    };
    const q = this.e.question;
    if (q && votes[q] !== undefined) ctx.dernierVote = votes[q];
    return ctx;
  }

  private ecranSecurite(a: Acteur): VueCalculee {
    if (a.type !== 'ecran' && a.ecrans.includes('regardez')) return { ecran: 'regardez', params: { texte: 'Regardez la scène' }, cle: 'panique' };
    return { ecran: 'noir', params: {}, cle: 'panique' };
  }

  private vueEffective(a: Acteur, passes: EnvoiPasse[], personne?: string): VueCalculee {
    if (this.e.panique && a.type !== 'agent') return this.ecranSecurite(a);
    if (!this.etatL) return { ecran: null, params: {} };
    const ctx = personne !== undefined ? this.contexteFoule(a.id, personne) : undefined;
    const envois = passes.filter(x => x.cible.acteur === a.id).length;
    for (let i = this.e.forcages.length - 1; i >= 0; i--) {
      const f = this.e.forcages[i]!;
      if (f.acteur !== a.id || f.envois !== envois) continue;
      const filtre = cibleDansFoule(f.cible)?.filtre ?? null;
      if (filtre && !personneConcernee(filtre, ctx, '')) continue;
      return { ecran: f.ecran, params: cloner(f.params), cle: `forcer@${f.at}` };
    }
    const v = vueActeur(this.projet, this.etatL, a.id, ctx);
    return v ? { ecran: v.ecran, params: v.params, cle: v.cle } : { ecran: null, params: {} };
  }

  /** Flux d'un acteur (ou d'une personne) : créé sans être diffusé s'il n'existe pas (bienvenue, resync). */
  private assurerFlux(acteur: string, personne: string) {
    const parPersonne = this.cibleeParPersonne(acteur);
    const cle = cleFlux(acteur, parPersonne ? personne : undefined);
    const f = this.e.flux[cle];
    if (f) return f;
    const a = this.acteurs.get(acteur);
    const passes = this.etatL ? envoisPasses(this.projet, this.etatL) : [];
    const v = a ? this.vueEffective(a, passes, parPersonne ? personne : undefined) : { ecran: null, params: {} };
    return this.ecrireFlux(cle, acteur, v, this.e.flux[acteur]?.vue.vseq ?? 0);
  }

  private ecrireFlux(cle: string, acteur: string, v: VueCalculee, base: number) {
    const vue: VueDiffusee = { acteur, vseq: (this.e.flux[cle]?.vue.vseq ?? base) + 1, at: this.horloge(), ecran: v.ecran, params: cloner(v.params) };
    if (v.cle !== undefined) vue.cle = v.cle;
    const f = { empreinte: empreinteDe({ ecran: v.ecran, params: v.params, cle: v.cle ?? null }), vue };
    this.e.flux[cle] = f;
    return f;
  }

  /** Recalcule et diffuse la vue d'un flux si elle a changé. */
  private majFlux(a: Acteur, passes: EnvoiPasse[], personne?: string) {
    const cle = cleFlux(a.id, personne);
    const v = this.vueEffective(a, passes, personne);
    const emp = empreinteDe({ ecran: v.ecran, params: v.params, cle: v.cle ?? null });
    const avant = this.e.flux[cle];
    if (avant && avant.empreinte === emp) return;
    const f = this.ecrireFlux(cle, a.id, v, this.e.flux[a.id]?.vue.vseq ?? 0);
    this.journaliser('vue', { flux: cle, vseq: f.vue.vseq, ecran: f.vue.ecran, cle: f.vue.cle ?? null });
    if (a.type === 'agent') {
      // Un envoi à un acteur agent devient une commande numérotée (l'agent ne reçoit pas de `vue`).
      if (v.ecran && this.etatL) {
        const vue = vueActeur(this.projet, this.etatL, a.id);
        this.creerCommande({
          type: v.ecran, etape: vue?.etape ?? this.etatL.etape ?? '', donnees: cloner(v.params), source: 'envoi',
          accuse: `accuse:${vue?.etape ?? this.etatL.etape ?? ''}`,
        }, a.id, vue?.moment ?? this.etatL.moment ?? undefined);
      }
      return;
    }
    this.envoyer(personne === undefined ? { acteur: a.id } : { acteur: a.id, personne }, { t: 'vue', ...cloner(f.vue) });
  }

  /** Personnes connectées d'un acteur, triées. */
  private presentes(acteur: string): string[] {
    return Object.entries(this.e.salle[acteur] ?? {}).filter(([, p]) => p.sessions.length).map(([k]) => k).sort();
  }

  private recalculer() {
    const L = this.etatL;
    const passes = L ? envoisPasses(this.projet, L) : [];
    const now = this.horloge();

    // Commandes du lecteur → agents (figurants, OSC). Les autres (message, chrono, reprise) sont pour la régie.
    if (L) {
      const cmds = L.commandes ?? [];
      for (const c of cmds.slice(this.e.nLecteur)) {
        const agent = agentPour(this.projet, c.type);
        if (!agent) continue;
        const accuse = typeof c.donnees.accuse === 'string' ? c.donnees.accuse : `accuse:${c.etape ?? ''}`;
        this.creerCommande({ type: c.type, etape: c.etape ?? '', donnees: c.donnees, source: 'lecteur', nLecteur: c.n, accuse }, agent, c.moment);
      }
      this.e.nLecteur = cmds.length;
    }

    // Tirages au sort ('public:aleatoire:3') : faits une fois, parmi les présents, gardés dans l'état.
    for (const x of passes) {
      if (x.cible.filtre?.genre !== 'aleatoire' || this.e.tirages[x.cle]) continue;
      const l = this.presentes(x.cible.acteur);
      for (let i = l.length - 1; i > 0; i--) {
        const j = Math.floor(this.alea() * (i + 1));
        [l[i], l[j]] = [l[j]!, l[i]!];
      }
      this.e.tirages[x.cle] = l.slice(0, x.cible.filtre.n);
      this.journaliser('alerte', { code: 'tirage', cle: x.cle, n: this.e.tirages[x.cle]!.length });
    }

    // Forçages devenus caducs : un nouvel envoi est parti vers l'acteur.
    this.e.forcages = this.e.forcages.filter(f => passes.filter(x => x.cible.acteur === f.acteur).length === f.envois);

    // Vues : une par acteur, ou une par personne pour les acteurs visés par des envois ciblés.
    for (const a of this.acteurs.values()) {
      if (this.cibleeParPersonne(a.id)) {
        for (const personne of Object.keys(this.e.salle[a.id] ?? {}).sort()) this.majFlux(a, passes, personne);
      } else this.majFlux(a, passes);
    }

    // Question ouverte : l'écran de vote montré à la foule (vue commune, hors panique et forçage).
    if (L) {
      let ouvert = false;
      for (const id of this.foule) {
        const v = vueActeur(this.projet, L, id);
        if (v?.ecran !== 'vote') continue;
        const p = v.params;
        const q = typeof p.q === 'string' || typeof p.q === 'number' ? String(p.q) : p.numero !== undefined ? String(p.numero) : v.cle;
        if (q !== this.e.question) this.journaliser('alerte', { code: 'question', q });
        this.e.question = q;
        ouvert = true;
        break;
      }
      this.e.voteOuvert = ouvert;
    }

    // Effets : chaque envoi `fx` part une fois (clé de l'envoi), à tout l'acteur ou aux personnes visées.
    const emis = new Set(this.e.fxEmis);
    for (const x of passes) {
      if (!x.envoi.fx || emis.has(x.cle)) continue;
      emis.add(x.cle);
      this.e.fxEmis.push(x.cle);
      const a = this.acteurs.get(x.cible.acteur);
      if (!a || a.type === 'agent') continue;
      if (this.e.panique) { this.journaliser('fx', { id: x.cle, acteur: a.id, kind: x.envoi.fx, supprime: 'panique' }); continue; }
      const ttlBrut = Number(x.params.ttl);
      const ttl = Math.min(LIMITES.ttl, Math.max(0, Number.isFinite(ttlBrut) && ttlBrut > 0 ? ttlBrut : TTL_FX));
      const m: MsgFx = { t: 'fx', acteur: a.id, id: x.cle, at: now, kind: x.envoi.fx, p: cloner(x.params), ttl };
      const dests: Destination[] = !x.cible.filtre
        ? [{ acteur: a.id }]
        : Object.keys(this.e.salle[a.id] ?? {}).sort()
          .filter(per => personneConcernee(x.cible.filtre, this.contexteFoule(a.id, per), x.cle))
          .map(per => ({ acteur: a.id, personne: per }));
      for (const d of dests) {
        this.envoyer(d, cloner(m));
        this.e.fxActifs.push({ a: d, m: cloner(m) });
      }
      this.journaliser('fx', { id: x.cle, acteur: a.id, kind: x.envoi.fx, destinataires: dests.length });
    }
  }

  private calculerSignaux(): Signaux {
    let pres = 0;
    let prets = 0;
    for (const id of this.foule) {
      for (const [cle, p] of Object.entries(this.e.salle[id] ?? {})) {
        if (!p.sessions.length) continue;
        pres++;
        const f = this.e.flux[cleFlux(id, this.cibleeParPersonne(id) ? cle : undefined)];
        if (p.pret || (p.affiche && f && p.affiche.vseq >= f.vue.vseq)) prets++;
      }
    }
    const s: Signaux = { pres, quorum: 0, prets: pres ? arrondi((prets * 100) / pres) : 0, ...SIGNAUX_SANS_CAPTEUR };
    const q = this.e.question;
    const votes = q ? this.e.votes[q] ?? {} : {};
    const indices = Object.values(votes);
    if (indices.length) {
      s.quorum = pres ? Math.min(100, arrondi((indices.length * 100) / pres)) : 100;
      const compte: Record<string, number> = {};
      for (const i of indices) compte[lettre(i)] = (compte[lettre(i)] ?? 0) + 1;
      const max = Math.max(...Object.values(compte));
      const premiers = Object.keys(compte).filter(k => compte[k] === max);
      s.issue = premiers.length === 1 ? premiers[0]! : 'T';
      s.votes = Object.fromEntries(Object.entries(compte).sort().map(([k, n]) => [k, arrondi((n * 100) / indices.length)]));
    }
    return s;
  }

  private messageSalle(): MsgSalle {
    const acteurs: MsgSalle['acteurs'] = {};
    for (const a of this.acteurs.values()) {
      if (a.type === 'agent') {
        acteurs[a.id] = { presents: Object.values(this.e.sessions).filter(s => s.connectee && s.role === 'agent' && s.acteur === a.id).length };
        continue;
      }
      let presents = 0;
      let prets = 0;
      let enLigne = 0;
      for (const p of Object.values(this.e.salle[a.id] ?? {})) {
        if (!p.sessions.length) continue;
        presents++;
        if (p.pret) prets++;
        if (p.enLigne && p.visible) enLigne++;
      }
      acteurs[a.id] = { presents, prets, enLigne };
    }
    const m: MsgSalle = { t: 'salle', ts: this.horloge(), acteurs };
    const q = this.e.question;
    if (q) {
      const indices = Object.values(this.e.votes[q] ?? {});
      const parts: number[] = [];
      for (const i of indices) {
        while (parts.length <= i) parts.push(0);
        parts[i] = (parts[i] ?? 0) + 1;
      }
      m.vote = { q, recus: indices.length, parts };
    }
    return m;
  }

  /** Après chaque entrée : vues, effets, commandes, signaux réels (et passage automatique), lecture, salle. */
  private mettreAJour(depuisTick: boolean) {
    for (let i = 0; i < 4; i++) {
      this.recalculer();
      if (!this.lecteur || !this.etatL || this.e.pause || this.etatL.termine) break;
      const s = this.calculerSignaux();
      if (this.e.signaux && jsonStable(s) === jsonStable(this.e.signaux)) break;
      // Les signaux de la salle ont changé (vote, arrivée, prêt) : le lecteur réévalue tout de suite, sans avancer.
      this.appliquer({ k: 'avancer', dt: 0, s });
    }
    const L = this.etatL;
    if (L) {
      const position = `${L.moment ?? ''}/${L.etape ?? ''}/${L.phase ?? ''}/${L.termine ? 'fin' : ''}/${L.attenteGo ? 'go' : ''}`;
      if (position !== this.e.position) {
        this.e.position = position;
        this.journaliser('lecture', { moment: L.moment, etape: L.etape, phase: L.phase ?? null, t: L.t, attenteGo: L.attenteGo, termine: L.termine });
      }
      if (this.touche) this.envoyer({ role: 'regie' }, { t: 'lecture', etat: cloner(L), par: 'serveur', ts: this.horloge() });
    }
    const salle = this.messageSalle();
    const { ts: _ts, ...sansHeure } = salle;
    const emp = empreinteDe(sansHeure);
    const now = this.horloge();
    if (emp !== this.e.salleEnvoyee.empreinte && (depuisTick || now - this.e.salleEnvoyee.ts >= INTERVALLE_SALLE_MS)) {
      this.e.salleEnvoyee = { ts: now, empreinte: emp };
      this.envoyer({ role: 'regie' }, salle);
    }
  }
}
