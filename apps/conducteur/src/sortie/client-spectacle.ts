// La sortie écran scène, ACTEUR `scene` du serveur de spectacle (audit 2026-10, rapport 1 §4.3 ; rapport 2 §4.3).
//
// Le serveur de spectacle fait tourner le lecteur et envoie à chaque acteur sa `vue` (écran + réglages, numérotée par
// `vseq`) et ses `fx` (effets éphémères). La sortie :
//   - se présente : hello{v:2, role:'acteur', acteur:'scene', session, personne, jeton, vseq, cseq, app{version, build},
//     capacites} — à CHAQUE ouverture de la ligne (reconnexion : le `vseq` déjà vu, le serveur renvoie la vue courante) ;
//   - reçoit `bienvenue` (instantané : la vue courante), `vue`, `fx`, `refus`, `resync` ;
//   - convertit la vue en `Scene` de rendu (traduction.ts, sceneDeVue) et la remet à la page ;
//   - accuse l'affichage quand la scène est À L'ÉCRAN : in{k:'accuse', data{vseq, affiche}} (ou avec `refus` :
//     'capacite' si elle ne sait pas montrer l'écran, 'invalide' si ses réglages ne donnent rien de montrable) ;
//   - bat 1 fois par seconde : etat{heure, ecran (ce qui est AFFICHÉ), visible, rttMs, decalageMs, media[]} ;
//   - signale la fin d'une vidéo jouée une fois : in{k:'fin-video', data{asset, vseq}} (→ signal `scene.fin-video`) ;
//   - relaie la signalisation WebRTC de la visio : rtc{de, vers, signal, ts} reçus (surRtc) et rtc{vers, signal} envoyés
//     (envoyerRtc) ; les liaisons elles-mêmes sont dans visio-rtc.ts.
// Un refus FATAL du serveur (version du protocole, jeton, acteur inconnu) arrête le client : il ne se reconnecte pas en
// boucle, la page affiche le refus.
// Le transport est le client commun du paquet protocole (transportWebSocket, ou transportMemoire pour les tests).
//
// Adresse de la page : sortie.html#spectacle=<wss://…/ws>&jeton=<jeton>[&acteur=scene]. Le fragment est rangé en
// sessionStorage (il survit au rechargement de l'onglet) puis EFFACÉ de l'adresse : le jeton n'y reste pas, n'est
// jamais envoyé au serveur HTTP (fragment) ni gardé dans l'historique. La régie peut aussi choisir la source par le
// message `source` du canal local (relais.ts, choisirSourceSortie).
import {
  VERSION_PROTOCOLE,
  type EcranAffiche, type EntreeActeur, type EtatTransport, type FabriqueHello, type MediaActeur, type MessageClient, type MessageServeur, type MsgFx,
  type MsgHello, type MsgRtcServeur, type RefusAffichage, type TransportSpectacle, type VueDiffusee,
} from '@studio-real/protocole';
import { BUILD_SORTIE, sourceSpectacleValide, VERSION_SORTIE, type ConfigSortie, type EtatPrecharge, type SourceSpectacle } from './protocole';
import { ECRANS_SORTIE, sceneDeVue, type ResultatVue } from './traduction';

/** Clé de rangement de la source de spectacle (sessionStorage : propre à l'onglet, effacée à sa fermeture). */
export const CLE_SOURCE_SPECTACLE = 'sr-sortie-spectacle';
const CLE_SESSION = 'sr-sortie-session';
/** Refus du serveur après lesquels il est inutile de se reconnecter (même message, même réponse). */
export const REFUS_FATALS = ['version', 'jeton', 'acteur-inconnu', 'role-non-gere'];

interface Stockage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

/**
 * Source de spectacle de la page : le fragment `#spectacle=…&jeton=…` (rangé puis effacé), sinon celle rangée dans
 * l'onglet. `effacer` retire le fragment de l'adresse (history.replaceState). null : pas de serveur de spectacle.
 */
export function lireSourceSpectacle(hash: string, stockage: Stockage | null, effacer?: () => void): SourceSpectacle | null {
  const f = new URLSearchParams(hash.replace(/^#/, ''));
  const url = f.get('spectacle')?.trim();
  if (url) {
    const acteur = f.get('acteur')?.trim();
    const s = { url, jeton: f.get('jeton')?.trim() ?? '', ...(acteur ? { acteur } : {}) };
    effacer?.();
    if (sourceSpectacleValide(s)) {
      try { stockage?.setItem(CLE_SOURCE_SPECTACLE, JSON.stringify(s)); } catch { /* stockage plein ou bloqué */ }
      return s;
    }
    return null;
  }
  try {
    const brut = stockage?.getItem(CLE_SOURCE_SPECTACLE);
    const s = brut ? (JSON.parse(brut) as unknown) : null;
    return sourceSpectacleValide(s) ? s : null;
  } catch { return null; }
}

/** Range (ou oublie) la source choisie par la régie. */
export function rangerSourceSpectacle(s: SourceSpectacle | null, stockage: Stockage | null): void {
  try { if (s) stockage?.setItem(CLE_SOURCE_SPECTACLE, JSON.stringify(s)); else stockage?.removeItem(CLE_SOURCE_SPECTACLE); } catch { /* bloqué */ }
}

/** Identifiant de session de l'onglet (gardé au rechargement : le serveur reconnaît la reprise). */
export function sessionOnglet(stockage: Stockage | null): string {
  try {
    const deja = stockage?.getItem(CLE_SESSION);
    if (deja && /^[A-Za-z0-9_-]{6,64}$/.test(deja)) return deja;
  } catch { /* bloqué */ }
  const a = new Uint8Array(12);
  globalThis.crypto.getRandomValues(a);
  const id = 's_' + Array.from(a, (x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
  try { stockage?.setItem(CLE_SESSION, id); } catch { /* bloqué */ }
  return id;
}

/** Médias du battement du serveur de spectacle (MediaActeur) depuis l'état des préchargements (PUR). */
export function mediasBattement(
  precharges: Record<string, EtatPrecharge>, part: (asset: string) => number,
  enCours: { video?: string; son?: { asset: string; lecture: MediaActeur['lecture'] } | null },
): MediaActeur[] {
  return Object.entries(precharges).map(([asset, e]) => {
    const lecture: MediaActeur['lecture'] = e === 'absent' ? 'absent'
      : enCours.son?.asset === asset ? enCours.son.lecture : enCours.video === asset ? 'lit' : 'attente';
    return { asset, pret: e === 'pret' ? 1 : e === 'absent' ? 0 : Math.max(0, Math.min(1, part(asset))), lecture };
  });
}

/** Une vue reçue, numérotée, avec sa conversion. */
export interface VueRecue {
  vseq: number;
  /** heure serveur de la vue (ms) */
  at: number;
  ecran: string | null;
  cle?: string;
  params: Record<string, unknown>;
  resultat: ResultatVue;
  /** arrivée par `bienvenue` (connexion ou reconnexion) plutôt que par `vue` */
  instantane: boolean;
}

export interface EtatClientSpectacle {
  ligne: EtatTransport['etat'] | 'refuse';
  rttMs?: number;
  decalageMs?: number;
  /** dernière vue reçue (0 : aucune) */
  vseq: number;
  /** refus du serveur (fatal : le client s'est arrêté) */
  refus?: { code: string; message: string; fatal: boolean };
}

export interface OptionsClientSpectacle {
  /** ouvre le transport avec la fabrique du `hello` (sans le jeton) : transportWebSocket(url, jeton, {hello}) ou mémoire */
  ouvrir: (hello: FabriqueHello) => TransportSpectacle;
  /** configuration de la sortie (QR d'accueil des vues `accueil-qr`) */
  config: () => ConfigSortie;
  /**
   * origine HTTP du serveur de spectacle (https://…) : le client y lit `/config.json` et en retient `lienPublic` (lien du
   * public avec le jeton public), qu'il pose dans la configuration des QR (`ConfigSortie.lienPublic`). Absent : rien n'est lu.
   */
  urlHttp?: string;
  /** `fetch` (tests) */
  fetch?: (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
  session: string;
  personne?: string;
  /** acteur incarné (défaut 'scene') */
  acteur?: string;
  maintenant?: () => number;
}

/** Capacités annoncées : les écrans que la sortie sait montrer, et ce qu'elle sait faire. */
export const CAPACITES_SORTIE: readonly string[] = [...ECRANS_SORTIE, 'son', 'plein-ecran', 'precharge'];

type Abonne<T> = (x: T) => void;

export class ClientSortieSpectacle {
  private readonly o: OptionsClientSpectacle;
  private readonly transport: TransportSpectacle;
  private readonly maintenant: () => number;
  private readonly abonnesVue = new Set<Abonne<VueRecue>>();
  private readonly abonnesFx = new Set<Abonne<MsgFx>>();
  private readonly abonnesEtat = new Set<Abonne<EtatClientSpectacle>>();
  private readonly abonnesRtc = new Set<Abonne<MsgRtcServeur>>();
  private readonly desabonner: (() => void)[] = [];
  private vseq = 0;
  private cseq = 0;
  private derniere: VueDiffusee | null = null;
  /** ce qui est À L'ÉCRAN (accusé), renvoyé par le battement */
  private affiche: EcranAffiche | null = null;
  private accuses = new Set<number>();
  private etat: EtatClientSpectacle = { ligne: 'connexion', vseq: 0 };
  private arrete = false;
  /** `lienPublic` du /config.json du serveur (null : pas encore lu, ou serveur sans) */
  private lienPublic: string | null = null;
  private lecturePublic = false;

  constructor(o: OptionsClientSpectacle) {
    this.o = o;
    this.maintenant = o.maintenant ?? (() => Date.now());
    void this.lireLienPublic();
    this.transport = o.ouvrir(() => this.hello());
    this.desabonner.push(this.transport.surMessage((m) => this.recevoir(m)));
    this.desabonner.push(this.transport.surEtat((e) => {
      if (this.arrete && e.etat !== 'ferme') return;
      this.majEtat({
        ligne: this.etat.ligne === 'refuse' ? 'refuse' : e.etat,
        ...(e.rttMs !== undefined ? { rttMs: e.rttMs } : {}), ...(e.decalageMs !== undefined ? { decalageMs: e.decalageMs } : {}),
      });
    }));
  }

  /** Le `hello` courant (sans le jeton, ajouté par le transport). */
  hello(): Omit<MsgHello, 'jeton'> {
    return {
      t: 'hello', v: VERSION_PROTOCOLE, role: 'acteur', acteur: this.o.acteur ?? 'scene', session: this.o.session,
      ...(this.o.personne ? { personne: this.o.personne } : {}),
      ...(this.vseq > 0 ? { vseq: this.vseq } : {}), ...(this.cseq > 0 ? { cseq: this.cseq } : {}),
      app: { version: String(VERSION_SORTIE), build: BUILD_SORTIE }, capacites: [...CAPACITES_SORTIE],
    };
  }

  get etatCourant(): EtatClientSpectacle { return this.etat; }
  get vueCourante(): VueDiffusee | null { return this.derniere; }

  /** Configuration des QR : celle de la sortie, avec le lien du public du serveur quand on l'a. */
  private configQr(): ConfigSortie {
    const c = this.o.config();
    return this.lienPublic ? { ...c, lienPublic: this.lienPublic } : c;
  }

  /** Lit `lienPublic` dans /config.json du serveur (une fois ; sans réponse, un nouvel essai à la prochaine bienvenue). */
  private async lireLienPublic(): Promise<void> {
    if (this.lienPublic || this.lecturePublic || !this.o.urlHttp) return;
    this.lecturePublic = true;
    try {
      const f = this.o.fetch ?? ((u: string) => globalThis.fetch(u, { cache: 'no-store' }));
      const r = await f(this.o.urlHttp.replace(/\/+$/, '') + '/config.json');
      if (!r.ok) return;
      const j = await r.json() as { lienPublic?: unknown };
      if (this.arrete || typeof j.lienPublic !== 'string' || j.lienPublic.length > 1000 || !/^https?:\/\//.test(j.lienPublic)) return;
      this.lienPublic = j.lienPublic;
      // la vue déjà à l'écran (QR d'accueil, mur) est retraduite avec le bon lien
      const v = this.derniere;
      if (v && (v.ecran === 'accueil-qr' || v.ecran === 'qr' || v.ecran === 'mur')) this.appliquer(v, true, true);
    } catch { /* serveur muet : le QR garde l'adresse de la configuration */ } finally { this.lecturePublic = false; }
  }

  surVue(fn: Abonne<VueRecue>): () => void { this.abonnesVue.add(fn); return () => { this.abonnesVue.delete(fn); }; }
  surFx(fn: Abonne<MsgFx>): () => void { this.abonnesFx.add(fn); return () => { this.abonnesFx.delete(fn); }; }
  surEtat(fn: Abonne<EtatClientSpectacle>): () => void { this.abonnesEtat.add(fn); fn(this.etat); return () => { this.abonnesEtat.delete(fn); }; }
  /** Signalisation WebRTC reçue (visio) : rtc{de: <session de l'émetteur>, vers, signal, ts}. */
  surRtc(fn: Abonne<MsgRtcServeur>): () => void { this.abonnesRtc.add(fn); return () => { this.abonnesRtc.delete(fn); }; }

  /**
   * Envoie un signal WebRTC à un acteur ou à une session (relayé par le serveur). Ligne fermée : rien ne part (un
   * signal périmé rejoué à la reconnexion ferait plus de mal que de bien) ; renvoie vrai si le signal est parti.
   */
  envoyerRtc(vers: string, signal: Record<string, unknown>): boolean {
    if (this.arrete || this.etat.ligne !== 'ouvert') return false;
    this.transport.envoyer({ t: 'rtc', vers, signal });
    return true;
  }

  /** Heure du serveur (ms), estimée par le transport (ping → pong) ; l'heure locale sans estimation. */
  heureServeur(): number { return this.maintenant() + (this.etat.decalageMs ?? 0); }

  private majEtat(p: Partial<EtatClientSpectacle>) {
    this.etat = { ...this.etat, ...p };
    for (const f of [...this.abonnesEtat]) f(this.etat);
  }

  private envoyer(m: MessageClient) { if (!this.arrete) this.transport.envoyer(m); }
  private entree(e: EntreeActeur) {
    this.cseq += 1;
    this.envoyer({ t: 'in', cseq: this.cseq, heure: this.maintenant(), ...e });
  }

  private recevoir(m: MessageServeur) {
    if (this.arrete) return;
    switch (m.t) {
      case 'bienvenue':
        // le serveur dit le dernier cseq reçu de cette session : on repart après (un renvoi serait un doublon)
        this.cseq = Math.max(this.cseq, m.cseq);
        if (!this.lienPublic) void this.lireLienPublic();
        if (this.etat.refus && !this.etat.refus.fatal) this.majEtat({ refus: undefined });
        if (m.vue) this.appliquer(m.vue, true);
        break;
      case 'vue': {
        const { t: _t, ...vue } = m;
        void _t;
        // une vue plus ancienne que la dernière (arrivée en retard) ne remplace rien
        if (vue.vseq <= this.vseq) break;
        this.appliquer(vue, false);
        break;
      }
      case 'fx':
        for (const f of [...this.abonnesFx]) f(m);
        break;
      case 'rtc':
        for (const f of [...this.abonnesRtc]) f(m);
        break;
      case 'refus': {
        // destinataire d'un signal WebRTC absent (téléphone pas encore là) : pas une erreur de la sortie
        if (m.code === 'rtc-absent') break;
        const fatal = !!m.fatal || REFUS_FATALS.includes(m.code);
        this.majEtat({ refus: { code: m.code, message: m.message, fatal } });
        if (fatal) this.arreter('refuse');
        break;
      }
      case 'resync':
        // redémarrage du serveur, nouvelle représentation : on se présente de nouveau (l'instantané suit)
        this.transport.renouer();
        break;
      default: break;
    }
  }

  private appliquer(v: VueDiffusee, instantane: boolean, forcer = false) {
    // instantané d'un serveur redémarré : la numérotation peut repartir de plus bas, la vue reçue fait foi
    const memeVue = this.derniere !== null && this.derniere.vseq === v.vseq && this.derniere.cle === v.cle && this.derniere.ecran === v.ecran;
    this.vseq = v.vseq;
    this.derniere = v;
    this.majEtat({ vseq: v.vseq });
    if (!forcer && memeVue && this.accuses.has(v.vseq)) return;   // reconnexion sans changement : déjà à l'écran et accusée
    const resultat = sceneDeVue({ ecran: v.ecran, params: v.params, at: v.at }, this.configQr());
    const recue: VueRecue = { vseq: v.vseq, at: v.at, ecran: v.ecran, params: v.params, resultat, instantane, ...(v.cle !== undefined ? { cle: v.cle } : {}) };
    for (const f of [...this.abonnesVue]) f(recue);
  }

  /** La scène de la vue `vseq` est À L'ÉCRAN (couche visible) : accusé, et elle devient l'écran affiché du battement. */
  vueAffichee(vseq: number, heure = this.maintenant()): void {
    if (this.accuses.has(vseq)) return;
    this.accuses.add(vseq);
    if (this.accuses.size > 64) this.accuses = new Set([...this.accuses].slice(-32));
    const v = this.derniere && this.derniere.vseq === vseq ? this.derniere : null;
    this.affiche = v?.ecran ? { vseq, ecran: v.ecran, depuis: heure, ...(v.cle !== undefined ? { cle: v.cle } : {}) } : null;
    this.entree({ k: 'accuse', data: { vseq, affiche: heure } });
  }

  /** La vue `vseq` ne peut pas être montrée : accusé avec refus (la page affiche une carte à la place). */
  vueRefusee(vseq: number, refus: RefusAffichage, heure = this.maintenant()): void {
    if (this.accuses.has(vseq)) return;
    this.accuses.add(vseq);
    this.affiche = null;
    this.entree({ k: 'accuse', data: { vseq, affiche: heure, refus } });
  }

  /** Fin d'une vidéo jouée une seule fois (→ signal `scene.fin-video` du lecteur). */
  finVideo(asset: string): void {
    this.entree({ k: 'fin-video', data: { asset, ...(this.vseq > 0 ? { vseq: this.vseq } : {}) } });
  }

  /** Battement (1 / s) : ce qui est affiché, la visibilité de la page, les médias. */
  battre(o: { visible: boolean; media?: MediaActeur[]; erreurs?: string[] }): void {
    if (this.etat.ligne !== 'ouvert') return;   // périssable : rien à garder pour la reconnexion
    const e = this.etat;
    this.envoyer({
      t: 'etat', heure: this.maintenant(), ecran: this.affiche, visible: o.visible, enLigne: true,
      ...(e.rttMs !== undefined ? { rttMs: e.rttMs } : {}), ...(e.decalageMs !== undefined ? { decalageMs: e.decalageMs } : {}),
      ...(o.media?.length ? { media: o.media.slice(0, 50) } : {}), ...(o.erreurs?.length ? { erreurs: o.erreurs.slice(0, 10) } : {}),
    });
  }

  private arreter(ligne: EtatClientSpectacle['ligne']) {
    if (this.arrete) return;
    this.arrete = true;
    this.transport.fermer();
    this.majEtat({ ligne });
  }

  fermer(): void {
    this.arreter('ferme');
    for (const f of this.desabonner) f();
    this.abonnesVue.clear(); this.abonnesFx.clear(); this.abonnesEtat.clear(); this.abonnesRtc.clear();
  }
}
