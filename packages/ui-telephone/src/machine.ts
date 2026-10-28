// Machine d'état PURE du téléphone (audit 2026-10, rapport 2 §4.4 : « le vrai écran, pas une imitation »).
//
//   reduire(etat, evenement, heure) → { etat, sorties }
//
// - `evenement` : un message du serveur de spectacle (`MessageServeur`, déjà validé par lire.ts) ou une action de la
//   personne qui tient le téléphone (`Action` : voter, écrire, réagir, toucher…) ou de l'application (accusé
//   d'affichage, battement, état du réseau).
// - `sorties` : les messages à envoyer au serveur (`MessageClient` : `in{cseq}`, `etat`, `resync`) et des effets que
//   l'application exécute (`vibrer`, `son`, `flash`, `precharger`, `hello`, `arreter`).
// - `heure` : horloge du CLIENT en ms (Date.now() dans l'application, une horloge fixe dans les tests). Aucune autre
//   source de temps, aucun hasard, aucune entrée-sortie : même suite d'événements = même état. C'est ce qui permet à
//   l'émulateur de faire tourner des centaines de téléphones sans rendu (rapport 2 §4.4, « foule »).
//
// Règles tenues ici (et testées dans machine.test.ts) :
// - une `vue` plus ancienne que la courante est ignorée ; un trou de `vseq` → `resync` ;
// - chaque vue affichée est accusée une fois (`in{k:'accuse'}`) ; un écran inconnu est accusé avec `refus:'invalide'` ;
// - un vote par question ; une réponse écrite par question ; une phrase du fil ne part qu'une fois ;
// - toute entrée prend un `cseq` croissant et reste dans la file jusqu'à son `ack` ; hors ligne rien ne part, et la
//   file est rejouée dans l'ordre après `bienvenue` (le serveur ignore les doublons) ;
// - panique (`fx{kind:'panique'}`) : écran de sécurité « Regardez la scène » par-dessus tout, jusqu'à `actif:false` ;
// - son muet par défaut (décision du 28/10) : un `fx{kind:'son'}` ne sonne que si la personne a activé le son.
import {
  VERSION_PROTOCOLE,
  type AppClient, type EcranAffiche, type EntreeActeur, type MediaActeur, type MessageClient, type MessageServeur,
  type MsgEtat, type MsgHello, type MsgIn, type VueDiffusee,
} from '@studio-real/protocole';

// ── Catalogue des écrans ───────────────────────────────────────────────────────────────────────────────────────────

/** Écrans que l'application sait afficher (les composants de ecrans/ ; la liste est vérifiée par les tests). Écrans
 *  propres à l'application : `entree` (pseudo), `attente` (rien encore), `merci`. Public : `regardez` … `image-onde`.
 *  Téléphones nommés (comédien, ministre) : `prompteur`, `vote-compteur`, `veille`, `visio-appel`, `image`. */
export const ECRANS = [
  'entree', 'attente', 'regardez', 'video', 'phrases', 'vote', 'texte', 'choix', 'notification', 'couleur', 'noir',
  'image-onde', 'merci',
  'prompteur', 'vote-compteur', 'veille', 'visio-appel', 'image',
] as const;
export type NomEcran = (typeof ECRANS)[number];
const ECRANS_CONNUS: ReadonlySet<string> = new Set(ECRANS);
export const estEcranConnu = (x: unknown): x is NomEcran => typeof x === 'string' && ECRANS_CONNUS.has(x);

// ── État ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Vue reçue du serveur, avec l'heure (client) de sa réception. */
export interface VueCourante extends VueDiffusee { recue: number }

export type Lecture = MediaActeur['lecture'];
export interface EtatMedia { pret: number; lecture: Lecture }
export type Choix = 'abonne' | 'desabonne';
export type EtatAppel = 'sonne' | 'en-cours' | 'fini';

export interface EtatTelephone {
  // identité
  acteur: string;
  /** jeton d'appareil (identite.ts) : identifiant stable de la personne */
  personne: string;
  /** connexion logique, gardée pendant les reconnexions (par onglet) */
  session: string;
  pseudo: string | null;
  /** vrai pour le public : l'écran `entree` passe avant tout le reste tant qu'il n'y a pas de pseudo */
  demanderPseudo: boolean;
  erreurPseudo: string | null;
  // connexion
  /** le transport est ouvert */
  enLigne: boolean;
  /** `bienvenue` reçue sur cette connexion : on peut envoyer des entrées */
  connecte: boolean;
  rttMs?: number;
  decalageMs?: number;
  refus: { code: string; message: string; fatal: boolean } | null;
  // vue
  vseq: number;
  vue: VueCourante | null;
  /** écran enchaîné par le téléphone lui-même (ex. `choix` à la fin de la vidéo, `params.puis`) */
  local: { ecran: NomEcran; vseq: number } | null;
  /** ce qui est À L'ÉCRAN (battement `etat`) */
  affiche: EcranAffiche | null;
  /** dernier vseq accusé (`in{k:'accuse'}`) */
  accusee: number;
  panique: boolean;
  visible: boolean;
  /** son activé par la personne (muet par défaut) */
  son: boolean;
  // entrées
  cseq: number;
  /** entrées envoyées (ou à envoyer) et pas encore acquittées, dans l'ordre */
  file: MsgIn[];
  /** réponse donnée par question (un vote par question) */
  votes: Record<string, number>;
  choix: Record<string, Choix>;
  /** textes envoyés, par question (ou groupe de phrases) */
  textes: Record<string, string[]>;
  /** boutons touchés, par `<vseq>:<cible>` */
  touches: Record<string, true>;
  /** question mise en avant à la main sur le prompteur, par vseq */
  enAvant: Record<string, number>;
  appels: Record<string, EtatAppel>;
  medias: Record<string, EtatMedia>;
  /** fin de vidéo déjà signalée pour ce vseq */
  finVideo: number;
  /** dernières erreurs (refus du serveur), remontées dans le battement */
  erreurs: string[];
}

export interface OptionsEtat {
  acteur: string;
  personne: string;
  session: string;
  pseudo?: string | null;
  cseq?: number;
  /** défaut : vrai pour l'acteur `public` */
  demanderPseudo?: boolean;
  visible?: boolean;
}

export function etatInitial(o: OptionsEtat): EtatTelephone {
  const pseudo = o.pseudo ? validerPseudo(o.pseudo) : null;
  return {
    acteur: o.acteur, personne: o.personne, session: o.session,
    pseudo: pseudo && 'ok' in pseudo ? pseudo.ok : null,
    demanderPseudo: o.demanderPseudo ?? o.acteur === 'public',
    erreurPseudo: null,
    enLigne: false, connecte: false, refus: null,
    vseq: 0, vue: null, local: null, affiche: null, accusee: 0, panique: false, visible: o.visible ?? true, son: false,
    cseq: Math.max(0, Math.floor(o.cseq ?? 0)), file: [],
    votes: {}, choix: {}, textes: {}, touches: {}, enAvant: {}, appels: {}, medias: {}, finVideo: 0, erreurs: [],
  };
}

// ── Événements et sorties ──────────────────────────────────────────────────────────────────────────────────────────

/** Actions de la personne (écrans) ou de l'application (App.tsx). */
export type Action =
  /** valider le pseudo (écran `entree`) */
  | { a: 'pseudo'; pseudo: string }
  /** répondre à la question de l'écran `vote` (index 0 → 25) */
  | { a: 'voter'; index: number }
  /** écran `choix` : s'abonner ou se désabonner */
  | { a: 'choisir'; choix: Choix }
  /** texte libre (`texte`, pourquoi du `choix`) ; `phrase` : une phrase touchée dans le fil (`phrases`) */
  | { a: 'ecrire'; texte: string; phrase?: boolean }
  | { a: 'reagir'; emoji: string }
  /** bouton d'un écran : 'bouton' (notification), 'question:<n>' (prompteur)… */
  | { a: 'toucher'; cible: string }
  | { a: 'pret'; pret?: boolean }
  /** la page passe au premier plan ou en arrière-plan (visibilitychange) */
  | { a: 'visible'; visible: boolean }
  /** la vidéo de l'écran courant est finie */
  | { a: 'fin-video'; asset: string }
  /** progression du préchargement ou de la lecture d'un média */
  | { a: 'media'; asset: string; pret?: number; lecture?: Lecture }
  /** la personne active (ou coupe) le son */
  | { a: 'son'; actif: boolean }
  /** écran `visio-appel` */
  | { a: 'appel'; geste: 'repondre' | 'raccrocher' }
  /** le rendu a eu lieu : l'écran montré est à l'écran (accusé d'affichage) */
  | { a: 'affiche' }
  /** toutes les 5 s : battement `etat` */
  | { a: 'battement' }
  /** état du transport */
  | { a: 'reseau'; enLigne: boolean; rttMs?: number; decalageMs?: number };
export type NomAction = Action['a'];

export type Evenement = MessageServeur | Action;

export type Effet =
  | { e: 'vibrer'; motif: number | number[] }
  | { e: 'son'; nom: string }
  | { e: 'flash'; ms: number }
  | { e: 'precharger'; medias: MediaAPrecharger[] }
  /** renvoyer `hello` (nouveau pseudo, `resync` demandé par le serveur) */
  | { e: 'hello' }
  /** refus fatal du serveur : fermer le transport */
  | { e: 'arreter' };
export interface MediaAPrecharger { asset: string; sources: string[] }

export type Sortie = MessageClient | Effet;
export interface Resultat { etat: EtatTelephone; sorties: Sortie[] }

export const estEffet = (s: Sortie): s is Effet => 'e' in s;
export const estMessage = (s: Sortie): s is MessageClient => 't' in s;

// ── Petites règles ─────────────────────────────────────────────────────────────────────────────────────────────────

/** LA règle du pseudo : 2 à 20 caractères (après avoir retiré les @ du début et changé les espaces en _). */
export function validerPseudo(brut: string): { ok: string } | { erreur: string } {
  const p = String(brut ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/^@+/, '').replace(/\s+/g, '_');
  if (p.length < 2) return { erreur: 'Au moins 2 caractères.' };
  if (p.length > 20) return { erreur: '20 caractères au plus.' };
  return { ok: p };
}

const FILE_MAX = 500;
const TEXTE_MAX = 2000;
const RE_COURT = /^[^\s\u0000-\u001f]{1,64}$/;
const estTexte = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const estNombre = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Identifiant de la question d'une vue (`q` du message `in`) : params.q, sinon le numéro, sinon la clé de l'envoi. */
export function questionDe(vue: Pick<VueDiffusee, 'params' | 'cle' | 'vseq'> | null): string {
  if (!vue) return 'v0';
  const p = vue.params;
  if (typeof p.q === 'string' && RE_COURT.test(p.q)) return p.q;
  if (estNombre(p.numero) || (typeof p.numero === 'string' && RE_COURT.test(p.numero))) return String(p.numero);
  if (vue.cle) {
    const c = vue.cle.replace(/\s+/g, '_').slice(0, 64);
    if (RE_COURT.test(c)) return c;
  }
  return `v${vue.vseq}`;
}

/** Nombre de réponses d'une vue de vote : params.reponses (2 → 6), sinon params.nb, sinon 4 (A à D, comme Écho). */
export function nombreReponses(params: Record<string, unknown>): number {
  if (Array.isArray(params.reponses) && params.reponses.length >= 2) return Math.min(6, params.reponses.length);
  if (estNombre(params.nb)) return Math.max(2, Math.min(6, Math.floor(params.nb)));
  return 4;
}

/** Médias à précharger lus dans les réglages d'une vue : `precharger: [{asset, sources[]}]` (ou des noms seuls). */
export function mediasAPrecharger(params: Record<string, unknown>): MediaAPrecharger[] {
  const liste = Array.isArray(params.precharger) ? params.precharger : [];
  const out: MediaAPrecharger[] = [];
  for (const x of liste.slice(0, 50)) {
    if (typeof x === 'string' && x.trim()) out.push({ asset: x.trim(), sources: [x.trim()] });
    else if (x && typeof x === 'object' && estTexte((x as Record<string, unknown>).asset)) {
      const o = x as Record<string, unknown>;
      const sources = (Array.isArray(o.sources) ? o.sources : []).filter(estTexte).slice(0, 4);
      out.push({ asset: String(o.asset), sources: sources.length ? sources : [String(o.asset)] });
    }
  }
  return out;
}

/** Ce que le téléphone montre maintenant (et d'où ça vient). */
export interface EcranMontre {
  ecran: string;
  params: Record<string, unknown>;
  /** panique · entree (pseudo) · vue (envoyée par le serveur) · local (enchaîné par le téléphone) · attente (rien reçu) */
  source: 'panique' | 'entree' | 'vue' | 'local' | 'attente';
  /** l'application sait afficher cet écran */
  pris: boolean;
}

export function ecranAMontrer(e: EtatTelephone): EcranMontre {
  if (e.panique) return { ecran: 'regardez', params: { texte: 'Regardez la scène' }, source: 'panique', pris: true };
  if (e.demanderPseudo && !e.pseudo) return { ecran: 'entree', params: {}, source: 'entree', pris: true };
  if (e.vue && e.local && e.local.vseq === e.vue.vseq) return { ecran: e.local.ecran, params: e.vue.params, source: 'local', pris: true };
  if (!e.vue) return { ecran: 'attente', params: {}, source: 'attente', pris: true };
  if (e.vue.ecran === null) return { ecran: 'attente', params: e.vue.params, source: 'vue', pris: true };
  return { ecran: e.vue.ecran, params: e.vue.params, source: 'vue', pris: estEcranConnu(e.vue.ecran) };
}

/** Ce qu'un écran reçoit (`vue` des composants de ecrans/) : la vue montrée et ce que le téléphone en a retenu. */
export interface VueEcran {
  ecran: string;
  params: Record<string, unknown>;
  source: EcranMontre['source'];
  vseq: number;
  cle?: string;
  /** heure (client) de réception de la vue : base des chronos */
  recue: number;
  pseudo: string | null;
  erreurPseudo: string | null;
  /** réponse déjà donnée à la question de cet écran */
  vote: number | null;
  choix: Choix | null;
  /** textes déjà envoyés pour cet écran (question, ou groupe de phrases) */
  textes: readonly string[];
  /** cibles déjà touchées sur cet écran */
  touches: readonly string[];
  enAvant: number | null;
  appel: EtatAppel;
  son: boolean;
  enLigne: boolean;
  /** part préchargée (0 → 1) des médias annoncés par la vue (`params.precharger`), null s'il n'y en a pas */
  chargement: number | null;
}

/** Groupe des textes d'une vue : la question, ou pour le fil de phrases `params.segment` (les phrases déjà envoyées ne
 *  reviennent pas après une reconnexion, comme au prototype du 27/10). */
function groupeTextes(vue: VueCourante | null, ecran: string): string {
  if (vue && ecran === 'phrases' && typeof vue.params.segment === 'string' && vue.params.segment) return `phrases:${vue.params.segment}`;
  return ecran === 'phrases' ? `phrases:${questionDe(vue)}` : questionDe(vue);
}

function chargementDe(e: EtatTelephone, params: Record<string, unknown>): number | null {
  const l = mediasAPrecharger(params);
  if (!l.length) return null;
  return l.reduce((t, x) => t + (e.medias[x.asset]?.pret ?? 0), 0) / l.length;
}

export function vueEcran(e: EtatTelephone): VueEcran {
  const m = ecranAMontrer(e);
  const v = e.vue;
  const vseq = v?.vseq ?? 0;
  const q = questionDe(v);
  const prefixe = `${vseq}:`;
  return {
    ecran: m.ecran, params: m.params, source: m.source, vseq, ...(v?.cle ? { cle: v.cle } : {}), recue: v?.recue ?? 0,
    pseudo: e.pseudo, erreurPseudo: e.erreurPseudo,
    vote: e.votes[q] ?? null, choix: e.choix[q] ?? null,
    textes: e.textes[groupeTextes(v, m.ecran)] ?? [],
    touches: Object.keys(e.touches).filter(k => k.startsWith(prefixe)).map(k => k.slice(prefixe.length)),
    enAvant: e.enAvant[String(vseq)] ?? null,
    appel: e.appels[v?.cle ?? `v${vseq}`] ?? 'sonne',
    son: e.son, enLigne: e.enLigne && e.connecte,
    chargement: chargementDe(e, m.params),
  };
}

// ── hello ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Le `hello` du téléphone (sans le jeton : c'est le transport qui le porte). */
export function messageHello(e: EtatTelephone, o: { app?: AppClient; capacites?: string[] } = {}): Omit<MsgHello, 'jeton'> {
  const h: Omit<MsgHello, 'jeton'> = {
    t: 'hello', v: VERSION_PROTOCOLE, role: 'acteur', acteur: e.acteur, personne: e.personne, session: e.session,
    vseq: e.vseq, cseq: e.cseq,
  };
  if (e.pseudo) h.pseudo = e.pseudo;
  if (o.app) h.app = o.app;
  if (o.capacites?.length) h.capacites = o.capacites;
  return h;
}

// ── Réducteur ──────────────────────────────────────────────────────────────────────────────────────────────────────

const rien = (etat: EtatTelephone): Resultat => ({ etat, sorties: [] });

/** Nouvelle entrée : prend le cseq suivant, entre dans la file, et part tout de suite si la connexion est prête. */
function emettre(etat: EtatTelephone, entree: EntreeActeur, heure: number, sorties: Sortie[]): EtatTelephone {
  const cseq = etat.cseq + 1;
  const msg = { t: 'in', cseq, heure, ...entree } as MsgIn;
  const file = [...etat.file, msg];
  if (file.length > FILE_MAX) file.splice(0, file.length - FILE_MAX);
  if (etat.connecte) sorties.push(msg);
  return { ...etat, cseq, file };
}

function appliquerVue(etat: EtatTelephone, v: VueDiffusee, heure: number, sorties: Sortie[]): EtatTelephone {
  const vue: VueCourante = { acteur: v.acteur, vseq: v.vseq, at: v.at, ecran: v.ecran, params: v.params, recue: heure, ...(v.cle ? { cle: v.cle } : {}) };
  const medias = { ...etat.medias };
  const aPrecharger = mediasAPrecharger(v.params);
  if (v.ecran === 'video' && estTexte(v.params.asset) && !aPrecharger.some(m => m.asset === v.params.asset)) {
    const sources = (Array.isArray(v.params.sources) ? v.params.sources : []).filter(estTexte);
    const src = estTexte(v.params.src) ? [v.params.src] : [];
    aPrecharger.push({ asset: v.params.asset, sources: sources.length ? sources : src.length ? src : [v.params.asset] });
  }
  for (const m of aPrecharger) medias[m.asset] ??= { pret: 0, lecture: 'attente' };
  if (aPrecharger.length) sorties.push({ e: 'precharger', medias: aPrecharger });
  return { ...etat, vue, vseq: v.vseq, local: null, medias };
}

const borne = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

function motifVibration(p: unknown): number | number[] {
  if (estNombre(p)) return borne(Math.round(p), 0, 5000);
  if (Array.isArray(p)) {
    const l = p.filter(estNombre).slice(0, 20).map(x => borne(Math.round(x), 0, 5000));
    if (l.length) return l;
  }
  return 200;
}

export function reduire(etat: EtatTelephone, ev: Evenement, heure = 0): Resultat {
  const sorties: Sortie[] = [];
  if ('t' in ev) {
    switch (ev.t) {
      case 'bienvenue': {
        // la file : ce que le serveur a déjà reçu en sort, le reste est rejoué dans l'ordre
        const file = etat.file.filter(m => m.cseq > ev.cseq);
        sorties.push(...file);
        let e: EtatTelephone = { ...etat, file, cseq: Math.max(etat.cseq, ev.cseq), connecte: true, enLigne: true, refus: null };
        if (ev.acteur && ev.acteur !== e.acteur) e = { ...e, acteur: ev.acteur };
        // l'instantané fait foi (le serveur a pu redémarrer : vseq plus petit, ou plus d'écran du tout)
        if (ev.vue === null) {
          if (e.vue) e = { ...e, vue: null, local: null, vseq: 0 };
        } else if (!e.vue || ev.vue.vseq !== e.vseq || ev.vue.ecran !== e.vue.ecran) {
          e = appliquerVue(e, ev.vue, heure, sorties);
        }
        return { etat: e, sorties };
      }
      case 'vue': {
        if (ev.vseq <= etat.vseq) return rien(etat);
        const trou = etat.vseq > 0 && ev.vseq > etat.vseq + 1;
        const e = appliquerVue(etat, ev, heure, sorties);
        if (trou && etat.connecte) sorties.push({ t: 'resync' });
        return { etat: e, sorties };
      }
      case 'fx': {
        // un effet périmé n'est pas joué (heure serveur estimée = heure client + décalage)
        if (etat.decalageMs !== undefined && heure > 0 && ev.at + ev.ttl < heure + etat.decalageMs) return rien(etat);
        switch (ev.kind) {
          case 'vibrer': return { etat, sorties: [{ e: 'vibrer', motif: motifVibration(ev.p.motif) }] };
          case 'son': return etat.son ? { etat, sorties: [{ e: 'son', nom: estTexte(ev.p.nom) ? ev.p.nom : 'bip' }] } : rien(etat);
          case 'flash': return { etat, sorties: [{ e: 'flash', ms: estNombre(ev.p.ms) ? borne(ev.p.ms, 50, 5000) : 300 }] };
          case 'panique': return { etat: { ...etat, panique: ev.p.actif !== false }, sorties };
          default: return rien(etat);
        }
      }
      case 'ack': {
        const file = etat.file.filter(m => m.cseq !== ev.cseq);
        const erreurs = ev.statut === 'refus' ? [...etat.erreurs, `refus ${ev.cseq}${ev.raison ? ` : ${ev.raison}` : ''}`].slice(-5) : etat.erreurs;
        return rien({ ...etat, file, erreurs });
      }
      case 'refus': {
        const fatal = ev.fatal === true;
        const e = { ...etat, refus: { code: ev.code, message: ev.message, fatal }, ...(fatal ? { connecte: false } : {}) };
        return { etat: e, sorties: fatal ? [{ e: 'arreter' }] : [] };
      }
      case 'resync':
        return { etat: { ...etat, connecte: false }, sorties: [{ e: 'hello' }] };
      default:
        // pong (le transport mesure l'horloge), salle, lecture, agent.cmd : pas pour un téléphone ; rtc : lot visio
        return rien(etat);
    }
  }

  const montre = ecranAMontrer(etat);
  const vseq = etat.vue?.vseq ?? 0;
  switch (ev.a) {
    case 'pseudo': {
      const r = validerPseudo(ev.pseudo);
      if ('erreur' in r) return rien({ ...etat, erreurPseudo: r.erreur });
      const change = r.ok !== etat.pseudo;
      return { etat: { ...etat, pseudo: r.ok, erreurPseudo: null }, sorties: change && etat.connecte ? [{ e: 'hello' }] : [] };
    }
    case 'voter': {
      if (montre.ecran !== 'vote' || montre.source === 'panique' || !etat.vue) return rien(etat);
      if (etat.vue.params.ferme === true) return rien(etat);
      const q = questionDe(etat.vue);
      if (etat.votes[q] !== undefined) return rien(etat);
      if (!Number.isInteger(ev.index) || ev.index < 0 || ev.index >= nombreReponses(etat.vue.params)) return rien(etat);
      const numero = estNombre(etat.vue.params.numero) ? { numero: etat.vue.params.numero } : {};
      let e: EtatTelephone = { ...etat, votes: { ...etat.votes, [q]: ev.index } };
      e = emettre(e, { k: 'vote', q, data: { index: ev.index, ...numero } }, heure, sorties);
      sorties.push({ e: 'vibrer', motif: 40 });
      return { etat: e, sorties };
    }
    case 'choisir': {
      if (montre.ecran !== 'choix' || !etat.vue) return rien(etat);
      const q = questionDe(etat.vue);
      if (etat.choix[q]) return rien(etat);
      let e: EtatTelephone = { ...etat, choix: { ...etat.choix, [q]: ev.choix } };
      e = emettre(e, { k: 'vote', q, data: { index: ev.choix === 'abonne' ? 0 : 1 } }, heure, sorties);
      sorties.push({ e: 'vibrer', motif: 30 });
      return { etat: e, sorties };
    }
    case 'ecrire': {
      const texte = String(ev.texte ?? '').trim();
      const params = etat.vue?.params ?? {};
      const max = estNombre(params.max) ? borne(Math.floor(params.max), 1, TEXTE_MAX) : TEXTE_MAX;
      if (!texte || texte.length > max || !etat.vue || montre.source === 'panique') return rien(etat);
      const ecran = montre.ecran;
      if (ecran === 'phrases') {
        if (!ev.phrase && params.libre !== true) return rien(etat);
      } else if (ecran === 'choix') {
        if (!etat.choix[questionDe(etat.vue)]) return rien(etat);           // le pourquoi vient après le choix
      } else if (ecran === 'texte') {
        if (estNombre(params.duree) && heure - etat.vue.recue > params.duree * 1000) return rien(etat);   // chrono échu
      } else return rien(etat);
      const groupe = groupeTextes(etat.vue, ecran);
      const deja = etat.textes[groupe] ?? [];
      // phrase : chacune une seule fois ; texte et pourquoi : une réponse par question
      if (ecran === 'phrases' ? deja.includes(texte) : deja.length > 0) return rien(etat);
      let e: EtatTelephone = { ...etat, textes: { ...etat.textes, [groupe]: [...deja, texte].slice(-200) } };
      const q = ecran === 'phrases' ? (typeof params.q === 'string' && RE_COURT.test(params.q) ? params.q : undefined) : questionDe(etat.vue);
      e = emettre(e, q ? { k: 'texte', q, data: { texte } } : { k: 'texte', data: { texte } }, heure, sorties);
      if (ev.phrase) sorties.push({ e: 'vibrer', motif: 30 });
      return { etat: e, sorties };
    }
    case 'reagir': {
      const emoji = String(ev.emoji ?? '').trim();
      if (!emoji || emoji.length > 16 || montre.source === 'panique') return rien(etat);
      return { etat: emettre(etat, { k: 'reaction', data: { emoji } }, heure, sorties), sorties };
    }
    case 'toucher': {
      const cible = String(ev.cible ?? '').slice(0, 64);
      if (!cible || !etat.vue || montre.source === 'panique') return rien(etat);
      if (montre.ecran === 'prompteur' && /^question:\d+$/.test(cible)) {
        return rien({ ...etat, enAvant: { ...etat.enAvant, [String(vseq)]: Number(cible.slice(9)) } });
      }
      const cle = `${vseq}:${cible}`;
      if (etat.touches[cle]) return rien(etat);
      let e: EtatTelephone = { ...etat, touches: { ...etat.touches, [cle]: true } };
      // le bouton de la notification vaut « vu, prêt »
      if (montre.ecran === 'notification' && cible === 'bouton') e = emettre(e, { k: 'pret', data: { pret: true } }, heure, sorties);
      return { etat: e, sorties };
    }
    case 'pret':
      return { etat: emettre(etat, { k: 'pret', data: { pret: ev.pret !== false } }, heure, sorties), sorties };
    case 'visible': {
      if (ev.visible === etat.visible) return rien(etat);
      const e = emettre({ ...etat, visible: ev.visible }, { k: 'presence', data: { visible: ev.visible } }, heure, sorties);
      return { etat: e, sorties };
    }
    case 'fin-video': {
      if (!etat.vue || etat.vue.ecran !== 'video' || etat.finVideo === vseq || montre.source !== 'vue') return rien(etat);
      const asset = String(ev.asset || etat.vue.params.asset || '').slice(0, 200);
      if (!asset) return rien(etat);
      const medias = { ...etat.medias, [asset]: { pret: etat.medias[asset]?.pret ?? 1, lecture: 'fin' as const } };
      let e: EtatTelephone = { ...etat, medias, finVideo: vseq };
      const puis = etat.vue.params.puis;
      if (estEcranConnu(puis) && puis !== 'video' && puis !== 'entree') e = { ...e, local: { ecran: puis, vseq } };
      e = emettre(e, { k: 'fin-video', data: { asset, vseq } }, heure, sorties);
      return { etat: e, sorties };
    }
    case 'media': {
      const asset = String(ev.asset ?? '').slice(0, 200);
      if (!asset) return rien(etat);
      const avant = etat.medias[asset] ?? { pret: 0, lecture: 'attente' as const };
      const apres: EtatMedia = {
        pret: estNombre(ev.pret) ? borne(ev.pret, 0, 1) : avant.pret,
        lecture: ev.lecture ?? avant.lecture,
      };
      if (apres.pret === avant.pret && apres.lecture === avant.lecture && etat.medias[asset]) return rien(etat);
      return rien({ ...etat, medias: { ...etat.medias, [asset]: apres } });
    }
    case 'son':
      return rien(ev.actif === etat.son ? etat : { ...etat, son: ev.actif });
    case 'appel': {
      if (montre.ecran !== 'visio-appel' || !etat.vue) return rien(etat);
      const cle = etat.vue.cle ?? `v${vseq}`;
      const avant = etat.appels[cle] ?? 'sonne';
      const apres: EtatAppel = ev.geste === 'repondre' ? 'en-cours' : 'fini';
      if (avant === apres || avant === 'fini') return rien(etat);
      const e = emettre({ ...etat, appels: { ...etat.appels, [cle]: apres } }, { k: 'pret', data: { pret: apres === 'en-cours' } }, heure, sorties);
      return { etat: e, sorties };
    }
    case 'affiche': {
      const nom = montre.source === 'vue' && etat.vue?.ecran ? etat.vue.ecran : montre.ecran;
      if (etat.affiche && etat.affiche.vseq === vseq && etat.affiche.ecran === nom) return rien(etat);
      const affiche: EcranAffiche = { vseq, ecran: nom.slice(0, 64), depuis: heure, ...(etat.vue?.cle ? { cle: etat.vue.cle } : {}) };
      let e: EtatTelephone = { ...etat, affiche };
      if (montre.source === 'vue' && etat.vue && etat.accusee < etat.vue.vseq) {
        const data = montre.pris
          ? { vseq: etat.vue.vseq, affiche: heure }
          : { vseq: etat.vue.vseq, affiche: heure, refus: 'invalide' as const };
        e = emettre({ ...e, accusee: etat.vue.vseq }, { k: 'accuse', data }, heure, sorties);
      }
      return { etat: e, sorties };
    }
    case 'battement': {
      if (!etat.connecte) return rien(etat);
      const media = Object.entries(etat.medias).slice(0, 200).map(([asset, m]) => ({ asset, pret: m.pret, lecture: m.lecture }));
      const msg: MsgEtat = { t: 'etat', heure, ecran: etat.affiche, visible: etat.visible, enLigne: etat.enLigne };
      if (etat.rttMs !== undefined) msg.rttMs = etat.rttMs;
      if (etat.decalageMs !== undefined) msg.decalageMs = etat.decalageMs;
      if (media.length) msg.media = media;
      if (etat.erreurs.length) msg.erreurs = etat.erreurs;
      return { etat, sorties: [msg] };
    }
    case 'reseau': {
      const e: EtatTelephone = { ...etat, enLigne: ev.enLigne, ...(ev.enLigne ? {} : { connecte: false }) };
      if (ev.rttMs !== undefined) e.rttMs = ev.rttMs;
      if (ev.decalageMs !== undefined) e.decalageMs = ev.decalageMs;
      return rien(e);
    }
  }
}

/** Raccourci pour les tests et l'émulateur : enchaîne des événements à la même heure. */
export function enchainer(etat: EtatTelephone, evenements: readonly Evenement[], heure = 0): Resultat {
  let e = etat;
  const sorties: Sortie[] = [];
  for (const ev of evenements) {
    const r = reduire(e, ev, heure);
    e = r.etat;
    sorties.push(...r.sorties);
  }
  return { etat: e, sorties };
}
