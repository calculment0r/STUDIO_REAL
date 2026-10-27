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
// Préchargement : les vidéos des clips qui commencent dans les 20 s, ceux du début du moment suivant, et la vidéo de
// secours.
import {
  dureeEtape, reglagesChrono, TY_CHRONO, TYPES_VOTE,
  type EtatLecture, type Etape, type Moment, type Projet, type Signaux,
} from '@studio-real/modele';
import {
  adresseEntree, GABARITS, sceneValide, TYPES_SCENE,
  type Compteur, type ConfigSortie, type EtatScene, type Gabarit, type OptionVote, type Scene, type TypeScene,
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

function sceneExplicite(e: Etape, c: ConfigSortie): Scene | null {
  const s = e.params?.sortie;
  if (s && typeof s === 'object' && sceneValide(s)) return s as Scene;
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
    case 'vote': case 'page': return null;
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

function aPrecharger(projet: Projet, moment: string | null, tm: number, c: ConfigSortie): string[] {
  const r: string[] = [];
  const ajouter = (n: string) => { if (estNomVideo(n) && !r.includes(n)) r.push(n); };
  if (moment) {
    const clips = clipsVideo(projet);
    clips.filter((x) => x.ev === moment && x.off > tm && x.off - tm <= 20).sort((a, b) => a.off - b.off).forEach((x) => ajouter(x.name));
    const i = projet.ev.findIndex((m) => m.id === moment);
    const suivant = projet.ev[i + 1];
    if (suivant) clips.filter((x) => x.ev === suivant.id && x.off <= 5).forEach((x) => ajouter(x.name));
  }
  if (c.secours) ajouter(c.secours);
  return r.slice(0, 4);
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
  const precharger = aPrecharger(projet, l.moment, tm, c);
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
