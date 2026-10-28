// Traduction état de lecture → scène de la sortie écran (chantier SORTIE SCÈNE). Logique PURE et déterministe :
// même projet + même état de lecture = même scène (testé dans traduction.test.ts).
//
// Règles, de la plus forte à la plus faible :
//   1. rien n'est lancé (lecture null)                → QR d'accueil
//      spectacle fini (phase 'fin' ou termine)        → noir
//   2. l'étape déclare sa scène : params.sortie        → 'noir' | 'accueil-qr' | 'streamer' | 'titre' | 'video' | … ou
//                                                        un objet Scene complet ({ type: 'titre', titre: '…' })
//   3. un chrono visible court (bloc u:chrono, affichage « écran de scène » ou « les deux »), y compris après sa
//      sortie « 10 s restantes » (le compte continue)  → chrono géant
//   4. étapes fortes : fondu / « noir » dans le nom    → noir
//                      vote (u1)                       → vote ouvert (question, options, compte à rebours)
//                      décompte (d1, b3)               → vote en roulement
//                      issue (k:issue après un vote)   → vote révélé (gagnant = issue)
//   5. piste « vidéo » de la conduite : le clip posé sur le moment courant à l'instant courant (le plus récent s'ils
//      se chevauchent) → vidéo locale (asset = nom du clip) ; « flux … / WebRTC » → streamer ; « … QR … » → QR ;
//      « … noir … » → noir ; image → image
//   6. l'étape elle-même : asset vidéo → vidéo, image → image, flux → streamer ; k:attente « QR / accueil » → QR ;
//      s1 (écran scène : animer) → streamer avec son gabarit, ou titre si elle n'a qu'un texte ; k:scene, s2, u2 →
//      streamer
//   7. sinon la scène est HÉRITÉE de l'étape précédente du parcours dans le même moment ; à défaut : QR dans le
//      premier acte, streamer ensuite.
// Préchargement : les vidéos des clips qui commencent dans les 20 s, ceux du début du moment suivant, les médias des
// ENVOIS à venir vers l'écran scène (vidéo, flux vidéo, audio du mur) et des `params.sortie` de l'étape courante, de
// ses suivantes et de l'entrée du moment suivant, puis la vidéo de secours.
//
// SERVEUR DE SPECTACLE : `sceneDeVue()` convertit la vue de l'acteur `scene` (écran + réglages, rapport 1 §4.4) en
// `Scene` de rendu, et `lireFxScene()` ses effets (pop, message du mur, « @x a voté »…). Pures, testées.
import {
  cibleDansFoule, dureeEtape, envoisDeCompatibilite, reglagesChrono, resoudreParams, TY_CHRONO, TYPES_VOTE,
  type EtatLecture, type Etape, type Moment, type Projet, type Signaux,
} from '@studio-real/modele';
import {
  adresseEntree, estAsset, GABARITS, MUR_MAX_MESSAGES, MUR_MAX_REPONSES, RE_JETON_COULEUR, sceneValide, TYPES_SCENE, VISIO_MAX_POSTES,
  type AudioMur, type Compteur, type ConfigSortie, type EtatScene, type EvenementScene, type Gabarit, type MessageMur, type OptionVote,
  type PosteVisio, type Scene, type TypeScene, type VoteMur,
} from './protocole';

export interface EntreeTraduction {
  projet: Projet;
  lecture: EtatLecture | null;
  enLecture: boolean;
  vitesse?: number;
  config: ConfigSortie;
  /** signaux de la salle (répartition des votes en direct) */
  signaux?: Partial<Signaux>;
}

export interface SortieTraduction {
  scene: Scene;
  etat: EtatScene;
  /** vidéos à précharger (assets), au plus 4 */
  precharger: string[];
  /** d'où vient la scène (diagnostic, tests) */
  origine: 'arret' | 'fin' | 'etape' | 'chrono' | 'clip' | 'heritee' | 'defaut';
}

// ── outils de nom ────────────────────────────────────────────────────────────────────────────────────────────────

export const normaliser = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const estNomVideo = (n: string): boolean => /\.(mp4|webm|mov|m4v|mkv|ogv)$/i.test(n.trim());
export const estNomAudio = (n: string): boolean => /\.(mp3|wav|ogg|m4a|aac|opus)$/i.test(n.trim());
export const estNomImage = (n: string): boolean => /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(n.trim());
export const estNomFlux = (n: string): boolean => /webrtc|\bflux\b|\bdirect\b/i.test(normaliser(n)) && !estNomVideo(n);
const contientMot = (n: string, mot: string) => new RegExp(`(^|[^a-z0-9])${mot}([^a-z0-9]|$)`).test(normaliser(n));
const texteParam = (e: Etape, cle: string): string | undefined => {
  const v = e.params?.[cle];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};

export function gabaritDe(e: Etape | undefined): Gabarit | undefined {
  const g = e ? texteParam(e, 'gabarit') : undefined;
  if (!g) return undefined;
  const n = normaliser(g) as Gabarit;
  return GABARITS.includes(n) ? n : undefined;
}

/** Options d'un vote : params.options (objet clé → libellé ou liste), sinon les sorties nommées, sinon A / B. */
export function optionsVote(moment: Moment, e: Etape): OptionVote[] {
  const o = e.params?.options;
  if (Array.isArray(o)) return o.slice(0, 8).map((x, i) => ({ cle: String.fromCharCode(65 + i), libelle: String(x) }));
  if (o && typeof o === 'object') return Object.entries(o as Record<string, unknown>).slice(0, 8).map(([cle, v]) => ({ cle, libelle: String(v) }));
  const noms = moment.tr.filter((t) => t.a === e.id && t.nom).map((t) => t.nom!);
  if (noms.length >= 2) return noms.slice(0, 8).map((nom, i) => ({ cle: String.fromCharCode(65 + i), libelle: nom }));
  return [{ cle: 'A', libelle: 'A' }, { cle: 'B', libelle: 'B' }];
}

const sceneQr = (c: ConfigSortie): Scene => ({
  type: 'accueil-qr', adresse: adresseEntree(c), titre: c.titre, consigne: c.consigne, ...(c.code ? { code: c.code } : {}),
});

/** Scène d'un nom d'asset ou de clip (null : rien d'affichable, ex. une page HTML). */
export function sceneDeNom(nom: string, c: ConfigSortie, o: { gabarit?: Gabarit; boucle?: boolean } = {}): Scene | null {
  const n = nom.trim();
  if (!n) return null;
  if (estNomFlux(n)) return { type: 'streamer', ...(o.gabarit ? { gabarit: o.gabarit } : {}) };
  if (contientMot(n, 'qr')) return sceneQr(c);
  if (contientMot(n, 'noir')) return { type: 'noir' };
  if (estNomImage(n)) return { type: 'image', asset: n };
  if (estNomVideo(n)) return { type: 'video', asset: n, ...(o.boucle === false ? { boucle: false } : {}) };
  return null;
}

// ── la scène d'une étape ─────────────────────────────────────────────────────────────────────────────────────────

const estVote = (ty: string) => ty === 'u1';
const estDecompte = (ty: string) => TYPES_VOTE.includes(ty) && ty !== 'u1';

/** Page du flux Instagram du prototype (prototypes/figurants/pages/flux/) : plus d'iframe, la vidéo LOCALE native. */
const RE_PAGE_FLUX = /\/pages\/flux(\/|$|\?|#)/;

function sceneExplicite(e: Etape, c: ConfigSortie): Scene | null {
  const s = e.params?.sortie;
  if (s && typeof s === 'object' && sceneValide(s)) {
    const sc = s as Scene;
    if (sc.type === 'page' && RE_PAGE_FLUX.test(sc.url)) return sceneFluxVideo({});
    return sc;
  }
  if (typeof s !== 'string') return null;
  const t = normaliser(s.trim()) as TypeScene;
  if (!TYPES_SCENE.includes(t)) return null;
  switch (t) {
    case 'noir': return { type: 'noir' };
    case 'accueil-qr': return sceneQr(c);
    case 'streamer': return { type: 'streamer', ...(gabaritDe(e) ? { gabarit: gabaritDe(e) } : {}) };
    case 'titre': return { type: 'titre', titre: texteParam(e, 'texte') ?? e.name };
    case 'video': case 'image': return e.asset ? (t === 'video' ? { type: 'video', asset: e.asset, ...(e.params?.boucle === false ? { boucle: false } : {}) } : { type: 'image', asset: e.asset }) : null;
    case 'chrono': return { type: 'chrono', duree: dureeEtape(e), titre: e.name };
    case 'mur': return { type: 'mur', ...(texteParam(e, 'texte') ? { titre: texteParam(e, 'texte') } : {}) };
    case 'vote': case 'page': case 'visio': return null;
  }
}

/** Scène propre à une étape (règles 4 et 6), null si elle hérite. */
export function sceneEtape(projet: Projet, m: Moment, e: Etape, c: ConfigSortie, lecture?: EtatLecture | null, signaux?: Partial<Signaux>): Scene | null {
  const exp = sceneExplicite(e, c);
  if (exp) return exp;
  if (e.ty === 'k:fondu' || contientMot(e.name, 'noir')) return { type: 'noir' };
  const votes = lecture?.votes ?? signaux?.votes;
  if (estVote(e.ty)) {
    return { type: 'vote', question: texteParam(e, 'question') ?? e.name, options: optionsVote(m, e), phase: 'ouvert', ...(votes ? { resultats: votes } : {}) };
  }
  const vote = [...m.st].reverse().find((x) => estVote(x.ty));
  if (vote && (estDecompte(e.ty) || e.ty === 'k:issue')) {
    const base = { type: 'vote' as const, question: texteParam(vote, 'question') ?? vote.name, options: optionsVote(m, vote), ...(votes ? { resultats: votes } : {}) };
    if (estDecompte(e.ty)) return { ...base, phase: 'decompte' };
    const issue = lecture?.issue;
    return { ...base, phase: 'revele', ...(issue && issue !== 'T' ? { gagnant: issue } : {}) };
  }
  const g = gabaritDe(e);
  if (e.asset) {
    if (e.ty === 'k:attente' && (contientMot(e.asset, 'qr') || contientMot(e.asset, 'accueil'))) return sceneQr(c);
    const s = sceneDeNom(e.asset, c, { ...(g ? { gabarit: g } : {}), ...(e.params?.boucle === false ? { boucle: false } : {}) });
    if (s) return s;
  }
  if (e.ty === 'k:attente' && (contientMot(e.name, 'qr') || contientMot(e.name, 'accueil'))) return sceneQr(c);
  if (e.ty === 's1') {
    const texte = texteParam(e, 'texte');
    if (texte && !g && !e.asset) return { type: 'titre', titre: texte, surtitre: e.name };
    return { type: 'streamer', ...(g ? { gabarit: g } : {}) };
  }
  if (e.ty === 'k:scene' || e.ty === 's2' || e.ty === 'u2') return { type: 'streamer', ...(g ? { gabarit: g } : {}) };
  void projet;
  return null;
}

// ── temps dans le moment et clips de la piste vidéo ─────────────────────────────────────────────────────────────

/** Temps passé dans le moment courant (s), d'après le parcours. */
export function tempsDansMoment(l: EtatLecture): number {
  const p = l.parcours;
  let debut: number | null = null;
  for (let i = p.length - 1; i >= 0 && p[i][0] === l.moment; i--) debut = p[i][2];
  return debut === null ? l.tEtape : Math.max(0, l.t - debut);
}

export interface ClipVideo { id: string; name: string; ev: string; off: number; dur: number }

export function clipsVideo(projet: Projet): ClipVideo[] {
  return projet.tracks.filter((t) => t.type === 'video').flatMap((t) => t.clips ?? []);
}

/** Clip actif sur le moment à l'instant tm : le plus récent s'ils se chevauchent (à départ égal, le plus court). */
export function clipActif(projet: Projet, moment: string, tm: number): ClipVideo | null {
  let best: ClipVideo | null = null;
  for (const c of clipsVideo(projet)) {
    if (c.ev !== moment || tm < c.off || tm >= c.off + c.dur) continue;
    if (!best || c.off > best.off || (c.off === best.off && c.dur < best.dur)) best = c;
  }
  return best;
}

/** Au plus autant de médias annoncés à la sortie (le message `precharger` en accepte 8). */
export const MAX_PRECHARGES = 6;

/** Acteurs « écran scène » du projet (type 'ecran') ; 'scene' s'il n'en déclare pas. */
export function acteursScene(projet: Projet): string[] {
  const ids = (Array.isArray(projet.acteurs) ? projet.acteurs : []).filter((a) => a && a.type === 'ecran').map((a) => a.id);
  return ids.length ? ids : ['scene'];
}

/** Médias à précharger d'un écran envoyé à la scène (vidéo, flux vidéo, audio du mur). */
export function mediasDeVue(ecran: string, p: Record<string, unknown>): string[] {
  const audio = (a: unknown) => (estAsset(a) ? [a] : estObjet(a) && estAsset(a.asset) ? [a.asset] : []);
  switch (ecran) {
    case 'video': return estAsset(p.asset) ? [p.asset] : [];
    case 'flux-video': return [estAsset(p.asset) ? p.asset : ASSET_FLUX_DEFAUT];
    case 'mur': return audio(p.audio);
    default: return [];
  }
}

/** Étapes « à venir » vues d'une étape : elle-même (envois différés), ses suivantes, l'entrée du moment suivant. */
function etapesAVenir(projet: Projet, moment: string, etape: string | null): Etape[] {
  const i = projet.ev.findIndex((m) => m.id === moment);
  const m = projet.ev[i];
  if (!m) return [];
  const ids: string[] = [];
  if (etape) { ids.push(etape); for (const t of m.tr) if (t.a === etape && t.b && !ids.includes(t.b)) ids.push(t.b); }
  const out = ids.map((id) => m.st.find((e) => e.id === id)).filter((e): e is Etape => !!e);
  const suivant = projet.ev[i + 1];
  if (suivant) {
    const entrees = typeof suivant.entry === 'string' ? [suivant.entry] : Object.values(suivant.entry ?? {});
    for (const id of entrees) { const e = suivant.st.find((x) => x.id === id); if (e && !out.includes(e)) out.push(e); }
  }
  return out;
}

function aPrecharger(projet: Projet, moment: string | null, tm: number, c: ConfigSortie, etape: string | null = null): string[] {
  const r: string[] = [];
  const ajouter = (n: string) => { if ((estNomVideo(n) || estNomAudio(n)) && !r.includes(n)) r.push(n); };
  if (moment) {
    const clips = clipsVideo(projet);
    clips.filter((x) => x.ev === moment && x.off > tm && x.off - tm <= 20).sort((a, b) => a.off - b.off).forEach((x) => ajouter(x.name));
    const i = projet.ev.findIndex((m) => m.id === moment);
    const suivant = projet.ev[i + 1];
    if (suivant) clips.filter((x) => x.ev === suivant.id && x.off <= 5).forEach((x) => ajouter(x.name));
    // envois à venir vers l'écran scène, et scènes déclarées (params.sortie)
    const scene = acteursScene(projet);
    for (const e of etapesAVenir(projet, moment, etape)) {
      for (const env of envoisDeCompatibilite(e)) {
        const cible = cibleDansFoule(env.vers);
        if (!env.ecran || !cible || !scene.includes(cible.acteur)) continue;
        mediasDeVue(env.ecran, resoudreParams(env.params, e)).forEach(ajouter);
      }
      const s = sceneExplicite(e, c);
      if (s?.type === 'video') ajouter(s.asset);
      if (s?.type === 'mur' && s.audio) ajouter(s.audio.asset);
    }
  }
  if (c.secours) ajouter(c.secours);
  return r.slice(0, MAX_PRECHARGES);
}

// ── chrono visible ───────────────────────────────────────────────────────────────────────────────────────────────

const affichageEcran = (a: unknown) => typeof a === 'string' && normaliser(a) !== 'telephones';

function chronoActif(projet: Projet, l: EtatLecture): { duree: number; restant: number; titre?: string } | null {
  const cmds = l.commandes ?? [];
  for (let i = cmds.length - 1; i >= 0; i--) {
    const c = cmds[i];
    if (c.type !== 'chrono' && c.type !== 'chrono.10s') continue;
    // le dernier chrono émis décide : fini, d'un autre moment ou réservé aux téléphones → pas de chrono géant
    const fin = Number(c.donnees.fin);
    if (!Number.isFinite(fin) || fin <= l.t || c.moment !== l.moment || !affichageEcran(c.donnees.affichage)) return null;
    // durée : celle de la commande 'chrono' (la 'chrono.10s' ne la porte pas)
    let duree = Number(c.donnees.duree);
    if (!Number.isFinite(duree)) {
      const d = cmds.slice(0, i).reverse().find((x) => x.type === 'chrono' && x.moment === c.moment);
      duree = Number(d?.donnees.duree) || 10;
    }
    const m = projet.ev.find((x) => x.id === c.moment);
    const e = m?.st.find((x) => x.id === c.etape) ?? (l.etape ? m?.st.find((x) => x.id === l.etape && x.ty === TY_CHRONO) : undefined);
    return { duree, restant: fin - l.t, ...(e ? { titre: e.name } : {}) };
  }
  // moteur sans commandes de chrono : l'étape chrono courante
  const m = projet.ev.find((x) => x.id === l.moment);
  const e = m?.st.find((x) => x.id === l.etape);
  if (e?.ty === TY_CHRONO) {
    const r = reglagesChrono(e);
    if (affichageEcran(r.affichage)) return { duree: r.duree, restant: Math.max(0, r.duree - l.tEtape), titre: e.name };
  }
  return null;
}

// ── la traduction ────────────────────────────────────────────────────────────────────────────────────────────────

export function traduire(x: EntreeTraduction): SortieTraduction {
  const { projet, lecture: l, config: c } = x;
  const vitesse = x.vitesse ?? 1;
  if (!l) {
    return {
      scene: sceneQr(c), origine: 'arret', precharger: aPrecharger(projet, null, 0, c),
      etat: { moment: null, etape: null, phase: 'arret', t: 0, tEtape: 0, attenteGo: false, enLecture: false },
    };
  }
  const m = projet.ev.find((v) => v.id === l.moment);
  const e = m?.st.find((v) => v.id === l.etape);
  const fini = l.termine || l.phase === 'fin';
  const phase: EtatScene['phase'] = fini ? 'fin' : l.phase ?? (l.etape ? 'etape' : 'passage');
  const tm = tempsDansMoment(l);
  const etat: EtatScene = {
    moment: l.moment, ...(m ? { momentNom: m.name } : {}), etape: l.etape, ...(e ? { etapeNom: e.name } : {}),
    phase, t: l.t, tEtape: l.tEtape, attenteGo: l.attenteGo, enLecture: x.enLecture,
  };
  const precharger = aPrecharger(projet, l.moment, tm, c, l.etape);
  const compteur = (restant: number, duree: number): Compteur => ({ restant: Math.max(0, restant), duree, enCours: x.enLecture && !fini, vitesse });

  if (fini) return { scene: { type: 'noir' }, etat, precharger, origine: 'fin' };

  // 2. scène déclarée par l'étape
  if (m && e) {
    const exp = sceneExplicite(e, c);
    if (exp) {
      if (exp.type === 'chrono') etat.compteur = compteur(dureeEtape(e) - l.tEtape, exp.duree);
      return { scene: exp, etat, precharger, origine: 'etape' };
    }
  }
  // 3. chrono visible
  const ch = chronoActif(projet, l);
  if (ch) {
    etat.compteur = compteur(ch.restant, ch.duree);
    return { scene: { type: 'chrono', duree: ch.duree, ...(ch.titre ? { titre: ch.titre } : {}) }, etat, precharger, origine: 'chrono' };
  }
  // 4. étapes fortes
  const propre = m && e ? sceneEtape(projet, m, e, c, l, x.signaux) : null;
  if (propre && (propre.type === 'noir' || propre.type === 'vote')) {
    if (propre.type === 'vote' && propre.phase === 'ouvert' && e) etat.compteur = compteur(dureeEtape(e) - l.tEtape, dureeEtape(e));
    return { scene: propre, etat, precharger, origine: 'etape' };
  }
  // 5. clip de la piste vidéo
  const clip = l.moment ? clipActif(projet, l.moment, tm) : null;
  if (clip) {
    const g = (propre?.type === 'streamer' ? propre.gabarit : undefined) ?? gabaritDe(e);
    const s = sceneDeNom(clip.name, c, g ? { gabarit: g } : {});
    if (s) return { scene: s, etat, precharger, origine: 'clip' };
  }
  // 6. l'étape
  if (propre) return { scene: propre, etat, precharger, origine: 'etape' };
  // 7. héritage dans le moment (parcours), puis défaut
  if (m) {
    const p = l.parcours;
    for (let i = p.length - 1; i >= 0 && p[i][0] === m.id; i--) {
      if (p[i][1] === l.etape) continue;
      const prec = m.st.find((v) => v.id === p[i][1]);
      const s = prec ? sceneEtape(projet, m, prec, c, l, x.signaux) : null;
      if (s && !(s.type === 'vote' && s.phase === 'ouvert')) return { scene: s, etat, precharger, origine: 'heritee' };
    }
  }
  const scene: Scene = !m || m.act === 0 ? sceneQr(c) : { type: 'streamer' };
  return { scene, etat, precharger, origine: 'defaut' };
}

// ── vue d'acteur (serveur de spectacle) → scène ─────────────────────────────────────────────────────────────────
//
// | écran de la vue        | scène de rendu                                                                         |
// |------------------------|----------------------------------------------------------------------------------------|
// | null, noir             | noir (null : aucun écran encore envoyé)                                                |
// | accueil-qr, qr         | QR d'accueil de la configuration (titre, consigne, code, adresse réglables)            |
// | video                  | vidéo locale {asset, boucle (défaut oui), son, cadrage, legende}                        |
// | flux-video             | vidéo locale du flux Instagram {asset (défaut flux_insta_jim.mp4), une fois, son}      |
// | titre                  | titre {titre | texte, surtitre, sousTitre}                                             |
// | mur                    | mur {titre, messages, vote{etat, question, reponses, comptes, pourcents, resultat}, audio, qr} |
// | vote                   | vote {question, reponses | options, etat | phase, comptes | scores, gagnant}            |
// | visio                  | visio {postes, son, noms, disposition 'cote' | 'plein', plein}                         |
// | streamer, image, chrono, page | la scène du même nom (page : l'exception, iframe)                               |
// | autre                  | refus 'capacite' (la sortie ne sait pas le montrer : accusé avec refus, carte)         |
// La sortie ne lit JAMAIS de fichier de banque : tout ce qu'elle montre est dans les réglages de la vue.

/** Vidéo du flux Instagram d'Écho (page prototypes/figurants/pages/flux/) quand la vue n'en nomme pas. */
export const ASSET_FLUX_DEFAUT = 'flux_insta_jim.mp4';

/** Écrans de l'acteur `scene` que la sortie sait montrer (capacités annoncées dans le `hello`). */
export const ECRANS_SORTIE = ['noir', 'accueil-qr', 'qr', 'streamer', 'vote', 'chrono', 'titre', 'image', 'video', 'flux-video', 'mur', 'visio', 'page'] as const;

/** Ce que la sortie reçoit du serveur pour son acteur (VueDiffusee, sans la numérotation). */
export interface VueSortie { ecran: string | null; params: Record<string, unknown>; /** heure serveur de la vue (ms) */ at?: number }
export type ResultatVue = { scene: Scene } | { refus: 'capacite' | 'invalide'; ecran: string };

const estObjet = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const txt = (x: unknown, max = 400): string | undefined => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : undefined);
const fini = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
const nombres = (x: unknown, n: number): number[] | undefined =>
  (Array.isArray(x) ? x.slice(0, n).map((v) => Math.max(0, fini(v) ?? 0)) : undefined);
const LETTRES = 'ABCDEFGH';

/** Pourcentages entiers d'une liste de comptes (0 partout si personne n'a voté). */
export function pourcentsDe(comptes: readonly number[]): number[] {
  const total = comptes.reduce((a, b) => a + Math.max(0, b), 0);
  return comptes.map((x) => (total > 0 ? Math.round((Math.max(0, x) / total) * 100) : 0));
}

/** Index de la réponse gagnante (unique maximum), -1 sinon (égalité, rien). */
export function indexGagnant(valeurs: readonly number[] | undefined): number {
  if (!valeurs?.length) return -1;
  const max = Math.max(...valeurs);
  if (max <= 0) return -1;
  return valeurs.filter((v) => v === max).length === 1 ? valeurs.indexOf(max) : -1;
}

/** Un message du mur lu dans des réglages (ou un effet) ; null si illisible. */
export function messageDuMur(x: unknown): MessageMur | null {
  if (!estObjet(x)) return null;
  const pseudo = txt(x.pseudo ?? x.auteur, 40)?.replace(/^@+/, '');
  const texte = txt(x.texte, 400);
  if (!pseudo || !texte) return null;
  const id = typeof x.id === 'string' || typeof x.id === 'number' ? String(x.id).slice(0, 80) : undefined;
  return {
    ...(id ? { id } : {}), pseudo, texte,
    ...(typeof x.couleur === 'string' && RE_JETON_COULEUR.test(x.couleur) ? { couleur: x.couleur } : {}),
    ...(x.grand === true ? { grand: true } : {}),
  };
}

const textes = (x: unknown, n: number): string[] =>
  (Array.isArray(x) ? x.slice(0, n).map((r) => (typeof r === 'string' ? r.slice(0, 300) : estObjet(r) && typeof r.libelle === 'string' ? r.libelle.slice(0, 300) : String(r ?? ''))) : []);

/** Le vote du mur : `vote` objet {etat, question, reponses…} ou texte ('ouvert' | 'revele' | 'ferme') avec les champs à
 *  côté (forme des commandes converties du prototype : {vote:'ouvert', numero:1}). `scores` = résultats imposés. */
function voteDuMur(p: Record<string, unknown>): VoteMur | undefined {
  const o = estObjet(p.vote) ? p.vote : {};
  const brut = estObjet(p.vote) ? (o.etat ?? o.phase ?? 'ouvert') : p.vote;
  const etat = brut === 'revele' ? 'revele' : brut === 'ouvert' || brut === true ? 'ouvert' : null;
  if (!etat) return undefined;
  const champ = (k: string) => (o[k] !== undefined ? o[k] : p[k]);
  const reponses = textes(champ('reponses') ?? champ('options'), MUR_MAX_REPONSES);
  const question = txt(champ('question'), 600) ?? '';
  const numero = fini(champ('numero'));
  const comptes = nombres(champ('comptes') ?? champ('scores'), MUR_MAX_REPONSES);
  const pourcents = nombres(champ('pourcents'), MUR_MAX_REPONSES) ?? (etat === 'revele' && comptes ? pourcentsDe(comptes) : undefined);
  const resultat = txt(champ('resultat'), 600);
  return {
    etat, question, reponses, ...(numero !== undefined ? { numero } : {}), ...(comptes ? { comptes } : {}),
    ...(pourcents ? { pourcents } : {}), ...(resultat ? { resultat } : {}),
  };
}

/** Audio de salle : 'junon.mp3' ou {asset, depuis?, boucle?} ; `depuis` (heure serveur de la position 0) vaut à défaut
 *  l'heure de la vue. null / absent : pas d'audio. */
function audioDuMur(a: unknown, at: number | undefined): AudioMur | undefined {
  const o = estObjet(a) ? a : { asset: a };
  if (!estAsset(o.asset)) return undefined;
  const depuis = fini(o.depuis) ?? at;
  return { asset: o.asset, ...(depuis !== undefined ? { depuis } : {}), ...(o.boucle === true ? { boucle: true } : {}) };
}

function sceneMur(p: Record<string, unknown>, c: ConfigSortie, at: number | undefined): Scene {
  const messages = (Array.isArray(p.messages) ? p.messages : []).map(messageDuMur).filter((m): m is MessageMur => !!m).slice(-MUR_MAX_MESSAGES);
  const vote = voteDuMur(p);
  const audio = audioDuMur(p.audio, at);
  const titre = txt(p.titre, 200);
  const qr = p.qr === true ? adresseEntree(c) : typeof p.qr === 'string' && /^https?:\/\//.test(p.qr) ? p.qr.slice(0, 1000) : undefined;
  return {
    type: 'mur', ...(titre ? { titre } : {}), ...(messages.length ? { messages } : {}), ...(vote ? { vote } : {}),
    ...(audio ? { audio } : {}), ...(qr ? { qr } : {}),
  };
}

/** Postes de la visio : ['franck', 'ministre'] ou [{id, nom}] ; son : {franck: false, ministre: true} ou vrai / faux
 *  pour tous (défaut : coupé) ; noms : {ministre: 'Junon Maréchal · ministre'} (défaut : l'id). */
function sceneVisio(p: Record<string, unknown>): Scene | null {
  const son = p.son;
  const noms = estObjet(p.noms) ? p.noms : {};
  const brut = Array.isArray(p.postes) ? p.postes : estObjet(son) ? Object.keys(son) : [];
  const postes: PosteVisio[] = [];
  for (const x of brut.slice(0, VISIO_MAX_POSTES)) {
    const id = typeof x === 'string' ? x : estObjet(x) && typeof x.id === 'string' ? x.id : '';
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || postes.some((q) => q.id === id)) continue;
    const nom = txt(estObjet(x) ? x.nom : undefined, 80) ?? txt(noms[id], 80) ?? id;
    const s = estObjet(son) ? son[id] === true : son === true;
    postes.push({ id, nom, son: s });
  }
  if (!postes.length) return null;
  const disposition = p.disposition === 'plein' ? 'plein' : 'cote';
  const voulu = txt(p.plein, 40);
  const plein = postes.find((q) => q.id === voulu)?.id ?? postes.find((q) => q.son)?.id ?? postes[0].id;
  return { type: 'visio', postes, disposition, ...(disposition === 'plein' ? { plein } : {}) };
}

function sceneFluxVideo(p: Record<string, unknown>): Scene {
  return {
    type: 'video', asset: estAsset(p.asset) ? p.asset : ASSET_FLUX_DEFAUT, boucle: p.boucle === true, son: p.son !== false,
    cadrage: p.cadrage === 'cover' || p.cadrage === 'auto' ? p.cadrage : 'contain',
  };
}

function sceneVoteDeVue(p: Record<string, unknown>): Scene {
  const libelles = textes(p.reponses ?? p.options, MUR_MAX_REPONSES);
  const options: OptionVote[] = libelles.map((libelle, i) => ({ cle: LETTRES[i], libelle }));
  const brut = p.etat ?? p.phase;
  const phase = brut === 'revele' || brut === 'decompte' ? brut : 'ouvert';
  const comptes = nombres(p.comptes ?? p.scores, options.length);
  const resultats = comptes ? Object.fromEntries(options.map((o, i) => [o.cle, comptes[i] ?? 0])) : undefined;
  const g = txt(p.gagnant, 20);
  const gagnant = g && options.some((o) => o.cle === g) ? g : phase === 'revele' && comptes && indexGagnant(comptes) >= 0 ? LETTRES[indexGagnant(comptes)] : undefined;
  return { type: 'vote', question: txt(p.question, 400) ?? '', options, phase, ...(resultats ? { resultats } : {}), ...(gagnant ? { gagnant } : {}) };
}

/**
 * Vue de l'acteur `scene` → scène de rendu (PURE). Un écran que la sortie ne connaît pas donne un refus 'capacite' ;
 * des réglages qui ne donnent aucune scène montrable (vidéo sans asset, page sans adresse) un refus 'invalide'.
 */
export function sceneDeVue(v: VueSortie, c: ConfigSortie): ResultatVue {
  const p = estObjet(v.params) ? v.params : {};
  const ecran = v.ecran ?? 'noir';
  let scene: Scene | null;
  switch (ecran) {
    case 'noir': scene = { type: 'noir' }; break;
    case 'accueil-qr': case 'qr': {
      const adresse = typeof p.adresse === 'string' && /^https?:\/\//.test(p.adresse) ? p.adresse : c.adresse;
      const code = txt(p.code, 40) ?? c.code;
      const adr = adresseEntree({ adresse, ...(code ? { code } : {}) });
      scene = { type: 'accueil-qr', adresse: adr, titre: txt(p.titre) ?? c.titre, consigne: txt(p.consigne) ?? c.consigne, ...(code ? { code } : {}) };
      break;
    }
    case 'video':
      scene = estAsset(p.asset) ? {
        type: 'video', asset: p.asset, ...(p.boucle === false ? { boucle: false } : {}), ...(p.son === true ? { son: true } : {}),
        ...(p.cadrage === 'contain' || p.cadrage === 'cover' || p.cadrage === 'auto' ? { cadrage: p.cadrage } : {}),
        ...(txt(p.legende) ? { legende: txt(p.legende)! } : {}),
      } : null;
      break;
    case 'flux-video': scene = sceneFluxVideo(p); break;
    case 'titre': {
      const sur = txt(p.surtitre), sous = txt(p.sousTitre, 600);
      scene = { type: 'titre', titre: txt(p.titre, 600) ?? txt(p.texte, 600) ?? '', ...(sur ? { surtitre: sur } : {}), ...(sous ? { sousTitre: sous } : {}) };
      break;
    }
    case 'mur': scene = sceneMur(p, c, v.at); break;
    case 'vote': scene = sceneVoteDeVue(p); break;
    case 'visio': scene = sceneVisio(p); break;
    case 'streamer': {
      const g = typeof p.gabarit === 'string' && GABARITS.includes(p.gabarit as Gabarit) ? (p.gabarit as Gabarit) : undefined;
      const bandeau = txt(p.bandeau);
      scene = { type: 'streamer', ...(g ? { gabarit: g } : {}), ...(bandeau ? { bandeau } : {}), ...(estAsset(p.secours) ? { secours: p.secours } : {}) };
      break;
    }
    case 'image': scene = estAsset(p.asset) ? { type: 'image', asset: p.asset, ...(txt(p.legende) ? { legende: txt(p.legende)! } : {}) } : null; break;
    case 'chrono': scene = { type: 'chrono', duree: Math.max(1, fini(p.duree) ?? 60), ...(txt(p.titre) ? { titre: txt(p.titre)! } : {}) }; break;
    case 'page': scene = typeof p.url === 'string' && /^https?:\/\//.test(p.url) && p.url.length <= 1000 ? { type: 'page', url: p.url } : null; break;
    default: return { refus: 'capacite', ecran };
  }
  return scene && sceneValide(scene) ? { scene } : { refus: 'invalide', ecran };
}

/** Effet reçu par l'acteur `scene` (fx du serveur), lu pour la sortie (PURE). */
export type EffetScene =
  /** un effet du calque de réactions (pop, réaction, cœurs, fusée, alerte, gabarit) */
  | { evenement: EvenementScene }
  /** un message ajouté au mur */
  | { message: MessageMur }
  /** une voix : « @x a voté » sur le calque, et +1 sur la réponse `index` (mur, scène de vote) */
  | { vote: { pseudo?: string; index?: number } };

/**
 * Effets compris par la sortie : `message` {id?, pseudo, texte, couleur?, grand?} · `a-vote` {pseudo?, index?} ·
 * `pop` {auteur | pseudo, texte, emoji?, style?} · `reaction` {emoji, n?} · `coeurs` {n} · `fusee` {emoji} ·
 * `alerte` {texte, niveau?} · `gabarit` {gabarit}. Un autre effet (ou illisible) est ignoré : null.
 */
export function lireFxScene(kind: string, p: Record<string, unknown>): EffetScene | null {
  const emoji = txt(p.emoji, 16);
  switch (kind) {
    case 'message': { const m = messageDuMur(p); return m ? { message: m } : null; }
    case 'a-vote': {
      const pseudo = txt(p.pseudo ?? p.auteur, 40)?.replace(/^@+/, '');
      const index = fini(p.index);
      return { vote: { ...(pseudo ? { pseudo } : {}), ...(index !== undefined && index >= 0 && index < MUR_MAX_REPONSES ? { index: Math.floor(index) } : {}) } };
    }
    case 'pop': {
      const auteur = txt(p.auteur ?? p.pseudo, 60), texte = txt(p.texte, 200);
      if (!auteur || !texte) return null;
      const style = p.style === 'pop' || p.style === 'danmaku' || p.style === 'vedette' ? p.style : undefined;
      return { evenement: { type: 'pop', auteur, texte, ...(emoji ? { emoji } : {}), ...(style ? { style } : {}) } };
    }
    case 'reaction': return emoji ? { evenement: { type: 'reaction', emoji, ...(fini(p.n) !== undefined ? { n: fini(p.n)! } : {}) } } : null;
    case 'coeurs': return { evenement: { type: 'coeurs', n: Math.max(1, Math.min(200, fini(p.n) ?? 1)) } };
    case 'fusee': return emoji ? { evenement: { type: 'fusee', emoji } } : null;
    case 'alerte': { const texte = txt(p.texte); return texte ? { evenement: { type: 'alerte', texte, ...(p.niveau === 'alerte' || p.niveau === 'info' ? { niveau: p.niveau } : {}) } } : null; }
    case 'gabarit': return typeof p.gabarit === 'string' && GABARITS.includes(p.gabarit as Gabarit) ? { evenement: { type: 'gabarit', gabarit: p.gabarit as Gabarit } } : null;
    default: return null;
  }
}
