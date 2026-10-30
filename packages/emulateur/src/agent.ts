// Un téléphone émulé. Deux rendus, la même machine d'état (rapport 2 §4.4) :
// - agent de la FOULE (sans rendu) : il exécute `reduire` de ui-telephone par son magasin, parle à la salle émulée par
//   `transportMemoire()` (réseau simulé : latence, perte, coupures) et se comporte selon son profil (délais
//   log-normaux, participation, page cachée, rechargements) ; il « affiche » une vue au bout de son délai de rendu et
//   l'accuse comme l'application (App.tsx : `affiche` après chaque rendu) ;
// - VITRINE : la vraie application (`apps/telephone`, `?emule=1&id=…`) dans une iframe ; son côté serveur mémoire
//   (`window.studioRealTelephone`) est branché sur la salle à la place de l'agent (même personne, même session).
// - transport RÉEL (transport-reel.ts) : le même agent, mais sa ligne est un WebSocket vers un vrai serveur de spectacle ;
//   la latence est vraie, le temps est le temps réel (l'horloge de l'émulateur le suit), les coupures ferment la socket.
// Toutes les heures sont celles de l'horloge émulée ; tout hasard vient du flux du téléphone (graine de la salle).
import type { SalleSimulee } from '@studio-real/modele';
import {
  creerMagasin, ecranAMontrer, etatInitial, messageHello, nombreReponses, nomsCapacites, questionDe, transportMemoire, vueEcran,
  type Action, type CoteServeurMemoire, type Effet, type FabriqueHello, type Magasin, type Sortie, type TransportTelephone,
} from '@studio-real/ui-telephone';
import { entre, exponentielle, logNormale, mulberry32, sousGraine, tirerPondere } from './alea';
import type { Ordonnanceur } from './horloge';
import { BANQUE_TEXTES, facteurReaction, participation, poidsPenchant } from './profils';
import type { SalleEmulee } from './salle';
import type { SalleReelle } from './transport-reel';
import type { EtatTelephoneEmule, ProfilSpectateur, TelephoneEmule } from './types';

/** Version annoncée dans `hello.app` par les téléphones émulés. */
export const APP_EMULEE = { version: 'emule', build: 'emulateur' } as const;
/** Battement `etat` du téléphone (comme telephone.ts). */
export const BATTEMENT_MS = 5000;

/** Ce que le téléphone partage avec l'émulateur. */
export interface ContexteTelephone {
  horloge: Ordonnanceur;
  /** la salle en mémoire (transport mémoire) ; null en transport réel */
  salle: SalleEmulee | null;
  /** le serveur réel (transport réel) ; null en transport mémoire */
  reel: SalleReelle | null;
  graine: number;
  sens: () => SalleSimulee;
  /** comportement automatique en vigueur */
  auto: () => boolean;
  /** l'émulateur tourne (sinon toute tâche planifiée s'éteint) */
  actif: () => boolean;
  /** adresse de l'application téléphone (vitrine) ; null : pas de rendu */
  urlTelephone: string | null;
}

export interface OptionsTelephone {
  id: string;
  profil: ProfilSpectateur;
  /** 'public' (foule) ou un acteur nommé ('franck', 'ministre') */
  acteur: string;
  pseudo: string | null;
  /** comportement automatique pour ce téléphone (faux : téléphones nommés, rejeu) */
  auto?: boolean;
  /** personne et session imposées (rejeu d'un journal) ; défaut : celles d'une iframe `?emule=1&id=<id>` */
  personne?: string;
  session?: string;
}

/** Index d'une réponse : 0, '0', 'A' (→ 0), 'b' (→ 1). */
export function indexReponse(option: string | number): number {
  if (typeof option === 'number') return Math.floor(option);
  const t = option.trim();
  if (/^\d+$/.test(t)) return Number(t);
  if (/^[A-Za-z]$/.test(t)) return t.toUpperCase().charCodeAt(0) - 65;
  return -1;
}

/** Identifiants d'un téléphone émulé, comme dans apps/telephone/src/main.tsx (`?emule=1&id=…`). */
export const personneEmulee = (id: string) => `emule-${id}`.padEnd(6, '0');
export const sessionEmulee = (id: string) => `emule-${id}-s`.padEnd(6, '0');

/** La ligne d'un téléphone, quel que soit le transport : mémoire (salle émulée) ou réel (WebSocket). */
interface LigneTel {
  readonly transport: TransportTelephone;
  readonly ouverte: boolean;
  ouvrir(): void;
  couper(): void;
  /** la ligne tombe et se rouvre aussitôt (le serveur a redémarré) */
  renouer(): void;
  fermer(): void;
}

export class TelephoneSalle implements TelephoneEmule {
  readonly id: string;
  readonly profil: ProfilSpectateur;
  readonly acteur: string;
  readonly pseudo: string | null;
  readonly personne: string;
  readonly session: string;
  private readonly ctx: ContexteTelephone;
  private readonly rnd: () => number;
  private readonly autoPropre: boolean;
  magasin: Magasin | null = null;
  private ligne: LigneTel | null = null;
  private debrancher: (() => void) | null = null;
  /** livraisons dans l'ordre (TCP) : prochaine heure de livraison au plus tôt */
  private derniereLivraison = 0;
  /** actions prévues annulables, par clé ('reponse', 'touche'…) */
  private readonly prevus = new Map<string, () => void>();
  private cleRendu = '';
  private vseqVu = 0;
  /** la personne a quitté la salle (retirer) */
  retire = false;
  arrive = false;
  visible = true;
  vibrations = 0;
  /** heure (émulée) des votes donnés, par question */
  private readonly heuresVotes = new Map<string, number>();
  /** cseq gardé d'un rechargement à l'autre (sessionStorage de la vraie application) */
  private cseqGarde = 0;
  private finCoupure: (() => void) | null = null;
  /** coupure en cours sans fin prévue (rejeu : jusqu'à la prochaine connexion) */
  coupe = false;
  /** vitrine : la vraie application dans une iframe */
  iframe?: HTMLIFrameElement;
  private vitrine: { serveur: CoteServeurMemoire; magasin: Magasin } | null = null;
  private offVitrine: (() => void) | null = null;

  constructor(ctx: ContexteTelephone, o: OptionsTelephone) {
    this.ctx = ctx;
    this.id = o.id;
    this.profil = o.profil;
    this.acteur = o.acteur;
    this.pseudo = o.pseudo;
    this.autoPropre = o.auto ?? o.acteur === 'public';
    this.personne = o.personne ?? personneEmulee(o.id);
    this.session = o.session ?? sessionEmulee(o.id);
    this.rnd = mulberry32(sousGraine(ctx.graine, 'tel', o.id));
  }

  // ── Arrivée, machine, ligne ──────────────────────────────────────────────────────────────────────────────────

  /** La personne entre dans la salle (scanne le QR) : la page s'ouvre, la ligne aussi ; les processus de fond
   *  (battement, coupures, page cachée, rechargements) démarrent. */
  arriver(): void {
    if (this.arrive || this.retire) return;
    this.arrive = true;
    this.demarrerMachine();
    this.ouvrirLigne();
    this.processusDeFond();
  }

  private planifier(ms: number, fn: () => void): () => void {
    return this.ctx.horloge.planifier(ms, () => { if (this.ctx.actif() && !this.retire) fn(); });
  }

  private demarrerMachine() {
    const etat = etatInitial({
      acteur: this.acteur, personne: this.personne, session: this.session, pseudo: this.pseudo, cseq: this.cseqGarde,
      demanderPseudo: this.acteur === 'public',
    });
    // eslint-disable-next-line prefer-const -- le magasin est affecté après la création du transport, dont le rappel hello le lit
    let m!: Magasin;
    const hello: FabriqueHello = () => messageHello(m.lire(), { app: { ...APP_EMULEE }, capacites: nomsCapacites(this.profil.capacites) });
    const reel = this.ctx.reel;
    const ligne = reel ? this.ligneReelle(reel, hello) : this.ligneMemoire(hello);
    m = creerMagasin(etat, sorties => this.executer(sorties, ligne), () => this.ctx.horloge.maintenant());
    ligne.transport.surMessage(msg => { if (this.ligne === ligne) m.envoyer(msg); });
    ligne.transport.surEtat(t => {
      if (this.ligne !== ligne) return;
      const rtt = reel ? t.rttMs : this.profil.reseau.rttMs;
      m.envoyer({ a: 'reseau', enLigne: t.etat === 'ouvert', ...(t.etat === 'ouvert' && rtt !== undefined ? { rttMs: rtt } : {}) });
    });
    m.abonner(() => { if (this.magasin === m) this.apresChangement(); });
    this.magasin = m;
    this.ligne = ligne;
    this.cleRendu = '';
    this.vseqVu = 0;
    if (!this.visible) m.envoyer({ a: 'visible', visible: false });
  }

  /** Ligne mémoire : la paire de canaux, branchée sur la salle émulée (latence et perte simulées par `differer`). */
  private ligneMemoire(hello: FabriqueHello): LigneTel {
    const salle = this.ctx.salle!;
    const paire = transportMemoire({ hello, jeton: 'emule', differer: fn => this.differer(fn) });
    this.debrancher = salle.brancher(this.id, paire.serveur);
    return {
      transport: paire.telephone,
      get ouverte() { return paire.serveur.ouverte; },
      ouvrir: () => paire.serveur.ouvrir(),
      couper: () => paire.serveur.couper(),
      renouer: () => { paire.serveur.couper(); paire.serveur.ouvrir(); },
      fermer: () => paire.telephone.fermer(),
    };
  }

  /** Ligne réelle : un WebSocket vers le vrai serveur (ouvert dès la création, sauf coupure en cours). */
  private ligneReelle(reel: SalleReelle, hello: FabriqueHello): LigneTel {
    const l = reel.creerLigne({ id: this.id, acteur: this.acteur, personne: this.personne, hello, bloquee: this.coupe });
    return {
      transport: l.transport,
      get ouverte() { return l.ouverte; },
      ouvrir: () => { if (l.bloquee) l.retablir(); },
      couper: () => l.couper(),
      // la ligne réelle se rouvre toute seule : seul un blocage de coupure demande un geste
      renouer: () => l.transport.renouer(),
      fermer: () => l.fermer(),
    };
  }

  private arreterMachine() {
    for (const annuler of this.prevus.values()) annuler();
    this.prevus.clear();
    const ligne = this.ligne;
    this.ligne = null;
    this.magasin = null;
    ligne?.fermer();
    this.debrancher?.();
    this.debrancher = null;
  }

  private ouvrirLigne() {
    if (this.ligne && !this.ligne.ouverte && !this.coupe) this.ligne.ouvrir();
  }

  /** Latence d'un message (aller simple) : RTT/2 ± 20 %, une perte coûte une retransmission (2 RTT) ; l'ordre est
   *  gardé (TCP). */
  private differer(fn: () => void) {
    const r = this.profil.reseau;
    let d = (r.rttMs / 2) * entre(this.rnd, 0.8, 1.2);
    if (r.perte > 0 && this.rnd() < r.perte) d += r.rttMs * 2 + 200;
    const now = this.ctx.horloge.maintenant();
    const at = Math.max(now + Math.max(1, d), this.derniereLivraison);
    this.derniereLivraison = at;
    this.ctx.horloge.planifier(at - now, fn);
  }

  /** Les sorties de la machine (comme telephone.ts) : messages → transport, effets → témoins. */
  private executer(sorties: Sortie[], ligne: LigneTel) {
    for (const s of sorties) {
      if (!('e' in s)) { ligne.transport.envoyer(s); continue; }
      const e: Effet = s;
      switch (e.e) {
        case 'vibrer': if (this.profil.capacites.vibration) this.vibrations++; break;
        case 'hello': ligne.transport.renouer(); break;
        case 'arreter': ligne.transport.fermer(); break;
        case 'precharger': {
          for (const media of e.medias) {
            const ms = (this.profil.videoPreteS ?? 2) * 1000 * entre(this.rnd, 0.8, 1.2);
            this.planifier(ms, () => { if (this.ligne === ligne) this.magasin?.envoyer({ a: 'media', asset: media.asset, pret: 1 }); });
          }
          break;
        }
        default: break;   // son, flash : pas émulés (rapport 2 §4.5)
      }
    }
  }

  /** Après chaque changement d'état : rendu (accusé d'affichage), et réaction à une nouvelle vue. */
  private apresChangement() {
    const m = this.magasin;
    if (!m) return;
    const e = m.lire();
    this.cseqGarde = e.cseq;
    if (this.vitrine) return;   // l'application de l'iframe fait son rendu et ses accusés
    const montre = ecranAMontrer(e);
    const cle = `${e.vue?.vseq ?? 0}|${montre.ecran}|${montre.source}`;
    if (cle !== this.cleRendu) {
      this.cleRendu = cle;
      const ms = (this.profil.renduMs ?? 40) * entre(this.rnd, 0.7, 1.3);
      this.planifier(ms, () => { if (this.magasin === m) m.envoyer({ a: 'affiche' }); });
    }
    if (e.vue && e.vue.vseq !== this.vseqVu && montre.source === 'vue') {
      this.vseqVu = e.vue.vseq;
      if (this.autoPropre && this.ctx.auto()) this.reagir();
    }
  }

  // ── Comportement automatique (profil) ────────────────────────────────────────────────────────────────────────

  private delaiReaction(): number {
    const r = this.profil.reaction;
    return Math.min(180_000, logNormale(this.rnd, r.medianeS, r.dispersion) * facteurReaction(this.ctx.sens()) * 1000);
  }

  /** Prévoit une action ; si la page est cachée à ce moment-là, l'action attend le retour au premier plan. */
  private prevoir(cle: string, ms: number, fn: () => void) {
    this.prevus.get(cle)?.();
    const m = this.magasin;
    const tenter = () => {
      if (this.magasin !== m || !m) return;
      if (!this.visible) { this.prevus.set(cle, this.planifier(2000 + this.rnd() * 3000, tenter)); return; }
      this.prevus.delete(cle);
      fn();
    };
    this.prevus.set(cle, this.planifier(ms, tenter));
  }

  annulerPrevu(cle: string): void {
    this.prevus.get(cle)?.();
    this.prevus.delete(cle);
  }

  /** Une nouvelle vue est arrivée : le spectateur y répond (ou pas) selon son profil. */
  private reagir() {
    const m = this.magasin!;
    const e = m.lire();
    const v = vueEcran(e);
    const p = participation(this.profil, this.ctx.sens());
    const vseq = v.vseq;
    const meme = () => this.magasin === m && m.lire().vue?.vseq === vseq;
    switch (v.ecran) {
      case 'vote':
        if (v.vote === null && this.rnd() < p) this.prevoir('reponse', this.delaiReaction(), () => { if (meme()) this.voterIndex(this.tirerOption(v.params)); });
        break;
      case 'choix':
        if (v.choix === null && this.rnd() < p) {
          this.prevoir('reponse', this.delaiReaction(), () => {
            if (!meme()) return;
            m.envoyer({ a: 'choisir', choix: this.tirerOption({ reponses: ['A', 'B'] }) === 0 ? 'abonne' : 'desabonne' });
            if (this.profil.textes !== 'aucun' && this.rnd() < 0.3) this.prevoir('texte', this.delaiReaction() * 2, () => { if (meme()) this.ecrire(this.tirerTexte()); });
          });
        }
        break;
      case 'texte':
        if (this.profil.textes !== 'aucun' && this.rnd() < p * 0.6) this.prevoir('reponse', this.delaiReaction() * 2, () => { if (meme()) this.ecrire(this.tirerTexte()); });
        break;
      case 'phrases':
        if (this.rnd() < p * 0.3) {
          this.prevoir('reponse', this.delaiReaction() * 2, () => {
            if (!meme()) return;
            const fil = Array.isArray(v.params.phrases) ? v.params.phrases.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];
            if (fil.length) m.envoyer({ a: 'ecrire', texte: fil[Math.floor(this.rnd() * fil.length)]!, phrase: true });
          });
        }
        break;
      case 'notification':
        if (this.rnd() < p) this.prevoir('touche', this.delaiReaction(), () => { if (meme()) m.envoyer({ a: 'toucher', cible: 'bouton' }); });
        break;
      case 'video': {
        const asset = typeof v.params.asset === 'string' ? v.params.asset : '';
        const duree = typeof v.params.duree === 'number' && v.params.duree > 0 ? v.params.duree : 12;
        const pret = (this.profil.videoPreteS ?? 2) * entre(this.rnd, 0.8, 1.2);
        if (asset) this.prevoir('video', (duree + pret) * 1000, () => { if (meme()) m.envoyer({ a: 'fin-video', asset }); });
        break;
      }
      default: break;
    }
  }

  /** Réponse tirée selon le profil (penchant de la salle, hasard, ou poids par lettre). */
  tirerOption(params: Record<string, unknown>, poidsImposes?: Record<string, number>): number {
    const n = nombreReponses(params);
    const v = this.profil.vote;
    const brut: Record<string, number> = poidsImposes ?? (v === 'penchant' ? poidsPenchant(this.ctx.sens()) : v === 'hasard' ? {} : v);
    const poids: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const lettre = String.fromCharCode(65 + i);
      poids[lettre] = v === 'hasard' && !poidsImposes ? 1 : Math.max(0, Number(brut[lettre] ?? brut[String(i)] ?? 0));
    }
    return tirerPondere(this.rnd, poids).charCodeAt(0) - 65;
  }

  tirerTexte(textes?: 'banque' | readonly string[]): string {
    const t = textes ?? this.profil.textes;
    const l = t === 'banque' || t === 'aucun' ? BANQUE_TEXTES : t.length ? t : BANQUE_TEXTES;
    return l[Math.floor(this.rnd() * l.length)]!;
  }

  /** Tirage dans le flux de ce téléphone (actions en masse). */
  tirage(): number { return this.rnd(); }

  // ── Processus de fond ────────────────────────────────────────────────────────────────────────────────────────

  private processusDeFond() {
    // battement `etat` toutes les 5 s, en phase décalée
    const battre = () => {
      if (!this.vitrine) this.magasin?.envoyer({ a: 'battement' });
      this.planifier(BATTEMENT_MS, battre);
    };
    this.planifier(this.rnd() * BATTEMENT_MS, battre);

    const c = this.profil.coupures;
    if (c.parMinute > 0) {
      const prochaine = () => this.planifier(exponentielle(this.rnd, 60_000 / c.parMinute), () => {
        if (!this.vitrine && this.ligne?.ouverte) this.couper(entre(this.rnd, c.dureeS[0], c.dureeS[1]));
        prochaine();
      });
      prochaine();
    }
    const r = this.profil.rechargementsParMinute;
    if (r > 0) {
      const prochain = () => this.planifier(exponentielle(this.rnd, 60_000 / r), () => {
        if (!this.vitrine && this.magasin) this.recharger();
        prochain();
      });
      prochain();
    }
    const v = this.profil.visibilite;
    if (v < 1 && v > 0) {
      const cacheMoyen = 20_000;
      const visibleMoyen = (cacheMoyen * v) / (1 - v);
      const basculer = (visible: boolean) => {
        this.planifier(exponentielle(this.rnd, visible ? visibleMoyen : cacheMoyen), () => {
          this.poserVisible(!visible);
          basculer(!visible);
        });
      };
      basculer(true);
    }
  }

  poserVisible(visible: boolean) {
    this.visible = visible;
    this.magasin?.envoyer({ a: 'visible', visible });
  }

  // ── Actions « à la main » et incidents ───────────────────────────────────────────────────────────────────────

  /** Une action de la personne ou de l'application, telle quelle (rejeu, outils). */
  action(a: Action): void { this.magasin?.envoyer(a); }
  private agir(a: Action): void { this.action(a); }

  /** Vote (renvoie vrai si la machine l'a pris : écran de vote affiché, pas déjà voté). */
  voterIndex(index: number): boolean {
    const m = this.magasin;
    if (!m) return false;
    const avant = m.lire();
    m.envoyer({ a: 'voter', index });
    const q = questionDe(avant.vue);
    const pris = m.lire() !== avant && m.lire().votes[q] === index;
    if (pris) this.heuresVotes.set(q, this.ctx.horloge.maintenant());
    return pris;
  }
  voter(option: string | number): void { this.voterIndex(indexReponse(option)); }

  /** Texte : une phrase du fil (écran `phrases`), sinon la réponse écrite de l'écran courant. Vrai si pris. */
  ecrireTexte(texte: string): boolean {
    const m = this.magasin;
    if (!m) return false;
    const avant = m.lire();
    m.envoyer(ecranAMontrer(avant).ecran === 'phrases' ? { a: 'ecrire', texte, phrase: true } : { a: 'ecrire', texte });
    return m.lire().cseq !== avant.cseq;
  }
  ecrire(texte: string): void { this.ecrireTexte(texte); }

  /** Toucher : 'son', 'pret', 'abonne' / 'desabonne', 'repondre' / 'raccrocher', 'reaction:<emoji>', sinon un
   *  'fin-video' (la vidéo affichée est finie : la machine enchaîne sur l'écran « puis »), sinon un bouton de l'écran
   *  ('bouton' de la notification, 'question:2' du prompteur…). */
  toucher(selecteur: string): void {
    const s = selecteur.trim();
    if (s === 'son') this.agir({ a: 'son', actif: true });
    else if (s === 'pret') this.agir({ a: 'pret' });
    else if (s === 'abonne' || s === 'desabonne') this.agir({ a: 'choisir', choix: s });
    else if (s === 'fin-video') this.agir({ a: 'fin-video', asset: '' });
    else if (s === 'repondre' || s === 'raccrocher') this.agir({ a: 'appel', geste: s });
    else if (s.startsWith('reaction:')) this.agir({ a: 'reagir', emoji: s.slice(9) });
    else this.agir({ a: 'toucher', cible: s });
  }

  /** Coupure réseau (tunnel, ascenseur, mode avion) : la ligne tombe ; elle revient au bout de `dureeS` (sinon
   *  jusqu'à `retablir()`). Le téléphone garde ses envois et les rejoue après `bienvenue`. */
  couper(dureeS?: number): void {
    if (!this.arrive) return;
    this.finCoupure?.();
    this.finCoupure = null;
    if (this.vitrine) this.vitrine.serveur.couper();
    else this.ligne?.couper();
    this.ctx.salle?.ligneCoupee(this.session);
    if (dureeS !== undefined && dureeS > 0) {
      this.coupe = false;
      this.finCoupure = this.planifier(dureeS * 1000, () => { this.finCoupure = null; this.retablir(); });
    } else this.coupe = true;
  }

  /** Fin de coupure : la ligne se rouvre (hello, bienvenue, file rejouée). */
  retablir(): void {
    this.coupe = false;
    this.finCoupure?.();
    this.finCoupure = null;
    if (this.vitrine) { if (!this.vitrine.serveur.ouverte) this.vitrine.serveur.ouvrir(); return; }
    this.ouvrirLigne();
  }

  /** Le serveur a redémarré (nouveau projet) : la ligne tombe et se rouvre aussitôt (hello, bienvenue). */
  renouerLigne(): void {
    if (this.coupe) return;
    if (this.vitrine) {
      const s = this.vitrine.serveur;
      if (s.ouverte) { s.couper(); s.ouvrir(); }
      return;
    }
    if (this.ligne?.ouverte) this.ligne.renouer();
  }

  /** Rechargement de la page : la machine repart de zéro (pseudo et cseq gardés, comme le stockage du navigateur),
   *  nouvelle ligne au bout de 1,5 à 4 s. */
  recharger(): void {
    if (!this.arrive || this.vitrine) return;
    this.ctx.reel?.perte(this.id);
    this.arreterMachine();
    this.planifier(entre(this.rnd, 1500, 4000), () => {
      if (this.magasin || this.vitrine) return;
      this.demarrerMachine();
      this.ouvrirLigne();
    });
  }

  /** La page passe en arrière-plan pendant `dureeS` (visibilitychange). */
  masquer(dureeS: number): void {
    this.poserVisible(false);
    this.planifier(Math.max(0, dureeS) * 1000, () => this.poserVisible(true));
  }

  /** La personne quitte la salle. */
  retirer(): void {
    this.arreterMachine();
    this.ctx.reel?.oublier(this.id);
    this.fermerVitrine();
    this.retire = true;
  }

  // ── Vitrine ──────────────────────────────────────────────────────────────────────────────────────────────────

  get enVitrine(): boolean { return this.vitrine !== null || this.iframe !== undefined; }

  /** Adresse de l'iframe de ce téléphone. */
  adresseVitrine(): string {
    const base = this.ctx.urlTelephone ?? '/t/';
    const q = new URLSearchParams({ emule: '1', id: this.id });
    if (this.acteur !== 'public') q.set('acteur', this.acteur);
    if (this.pseudo) q.set('pseudo', this.pseudo);
    return `${base}${base.includes('?') ? '&' : '?'}${q.toString()}`;
  }

  /** Ouvre la vraie application dans une iframe (390 × 844) posée dans `hote` ; l'agent lui passe la main quand
   *  l'application dit qu'elle est prête (`studio-real:telephone-pret`). */
  promouvoir(hote: HTMLElement): HTMLIFrameElement {
    if (typeof document === 'undefined') throw new Error('Vitrine : il faut un navigateur (DOM).');
    if (this.ctx.reel) throw new Error('Vitrine : pas disponible avec le transport réel (l’iframe parle à la salle en mémoire).');
    if (this.iframe) { hote.appendChild(this.iframe); return this.iframe; }
    const f = document.createElement('iframe');
    f.title = `Téléphone émulé ${this.id}`;
    f.width = '390';
    f.height = '844';
    f.className = 'emu-iframe';
    f.src = this.adresseVitrine();
    const surMessage = (ev: MessageEvent) => {
      const d = ev.data as { type?: string; id?: string } | null;
      if (ev.source !== f.contentWindow || d?.type !== 'studio-real:telephone-pret' || d.id !== this.id) return;
      const expose = (f.contentWindow as (Window & { studioRealTelephone?: { serveur: CoteServeurMemoire; magasin: Magasin } }) | null)?.studioRealTelephone;
      if (expose) this.attacherVitrine(expose);
    };
    window.addEventListener('message', surMessage);
    this.offVitrine = () => window.removeEventListener('message', surMessage);
    this.iframe = f;
    hote.appendChild(f);
    return f;
  }

  /** Branche l'application d'une iframe (son côté serveur mémoire) à la place de l'agent. */
  attacherVitrine(expose: { serveur: CoteServeurMemoire; magasin: Magasin }): void {
    if (!this.ctx.salle) throw new Error('Vitrine : pas disponible avec le transport réel.');
    this.arreterMachine();
    this.vitrine = expose;
    this.magasin = expose.magasin;
    if (!this.arrive) {
      this.arrive = true;
      this.processusDeFond();
    }
    expose.magasin.abonner(() => { if (this.vitrine === expose) this.apresChangement(); });
    this.debrancher = this.ctx.salle.brancher(this.id, expose.serveur);
    if (!this.coupe) expose.serveur.ouvrir();
  }

  /** Ferme l'iframe ; le téléphone retourne dans la foule (sa ligne se rouvre aussitôt). */
  fermerVitrine(): void {
    this.offVitrine?.();
    this.offVitrine = null;
    const attachee = this.vitrine !== null;
    if (this.vitrine) {
      this.debrancher?.();
      this.debrancher = null;
      this.vitrine.serveur.couper();
      this.vitrine = null;
      this.magasin = null;
    }
    this.iframe?.remove();
    this.iframe = undefined;
    // l'agent avait passé la main à l'iframe : il la reprend (nouvelle page, même personne, même session)
    if (attachee && this.arrive && !this.retire) {
      this.demarrerMachine();
      this.ouvrirLigne();
    }
  }

  // ── État ─────────────────────────────────────────────────────────────────────────────────────────────────────

  etat(): EtatTelephoneEmule {
    const e = this.magasin?.lire() ?? null;
    const v = e ? vueEcran(e) : null;
    const q = e?.vue ? questionDe(e.vue) : null;
    const vote = e && q !== null && e.votes[q] !== undefined ? e.votes[q] : undefined;
    const out: EtatTelephoneEmule = {
      id: this.id, pseudo: e?.pseudo ?? this.pseudo ?? '', genre: this.acteur === 'public' ? 'public' : 'acteur', acteur: this.acteur,
      personne: this.personne, profil: this.profil.nom,
      enLigne: !!e && e.enLigne && e.connecte, arrive: this.arrive, visible: this.visible,
      ecran: e?.affiche ? { cle: e.affiche.cle ?? '', n: e.affiche.vseq, type: e.affiche.ecran, depuis: e.affiche.depuis } : null,
      aRepondu: !!v && (v.vote !== null || v.choix !== null || v.textes.length > 0 || (v.ecran === 'notification' && v.touches.length > 0)),
      fileEnvoi: e?.file.length ?? 0,
      vitrine: this.enVitrine, vibrations: this.vibrations,
    };
    if (vote !== undefined && q !== null) out.dernierVote = { question: q, option: vote, t: this.heuresVotes.get(q) ?? 0 };
    if (e?.rttMs !== undefined) out.rttMs = e.rttMs;
    return out;
  }
}
