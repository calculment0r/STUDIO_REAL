// Côté RÉGIE du canal vers la sortie écran scène (chantier SORTIE SCÈNE). Sans React ni magasin du conducteur :
// la traduction automatique (useRelaisSortie.ts) et les boutons s'appuient dessus, les tests aussi.
//
//   publierScene({ scene: 'video', asset: 'starting_soon.mp4', fondu: 800, boucle: false })   → vidéo locale
//   publierScene({ scene: 'streamer' })                                                         → direct
//   publierScene({ type: 'titre', titre: 'Entracte' })                                          → une Scene complète
//   relacherScene()                    → retour à la scène automatique (traduction de la lecture)
//   publierEvenement({ type: 'pop', auteur: 'Zoé', texte: 'trop fort' })   → calque de réactions
//   configurerSortie({ titre, adresse, code, consigne, secours })          → QR d'accueil, vidéo de secours
//   precharger(['coupure_flux.mp4'])   → la sortie met la vidéo en mémoire avant la bascule
//   surFinVideo(fn)                    → une vidéo « une seule fois » est finie sur la sortie
// État observable : le magasin zustand `useSortie` (fenêtre fermée / ouverte / connectée, scène en cours…).
import { create } from 'zustand';
import type { StatutTransport, Transport } from './canal';
import {
  BATTEMENT_MS, borneFondu, cleScene, configParDefaut, FONDU_DEFAUT_MS, lireMessageSortie, msgConfig, msgEtat, msgEvenement,
  msgHeure, msgPrecharger, msgScene, PERTE_MS, adresseEntree,
  type Cadrage, type ConfigSortie, type EtatScene, type EtatSortie, type EvenementScene, type Gabarit, type OptionVote, type Scene,
} from './protocole';

export type EtatFenetre = 'fermee' | 'ouverte' | 'connectee';

export interface EtatRelais {
  fenetre: EtatFenetre;
  /** scène publiée (la dernière envoyée) et son numéro */
  scene: Scene | null;
  n: number;
  fondu: number;
  /** heure de la décision de cette scène (renvoyée telle quelle : la sortie garde la décision la plus récente) */
  depuis: number;
  /** la sortie montre la scène d'une AUTRE régie (moniteur, autre machine) : elle a pris la main après nous */
  autreRegie: boolean;
  /** 'auto' : la scène suit la lecture ; 'manuel' : une commande la tient jusqu'à relacherScene() */
  mode: 'auto' | 'manuel';
  etat: EtatScene | null;
  /** heure (régie) du dernier état publié */
  heureEtat: number;
  config: ConfigSortie;
  /** ce que la sortie dit d'elle-même (flux, secours, médias, plein écran) */
  sortie: EtatSortie | null;
  /** scène que la sortie dit montrer */
  sceneVue: string | null;
  vuLe: number;
  finVideo: { asset: string; n: number; heure: number } | null;
  /** liaison par la salle du serveur (autre machine) */
  salle: StatutTransport | 'aucune';
  precharger: string[];
}

const CLE_CONFIG = 'sr-sortie-config';
const lireConfigPerso = (): Partial<ConfigSortie> => {
  try { const o = JSON.parse(localStorage.getItem(CLE_CONFIG) ?? '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
};
let configPerso: Partial<ConfigSortie> = lireConfigPerso();
let titreProjet: string | undefined;
/** salle du flux du streamer (non gardée : le jeton reste où etat/serveur le range) */
let salleFlux: ConfigSortie['flux'];
const configEffective = (): ConfigSortie => ({ ...configParDefaut(titreProjet), ...configPerso, ...(salleFlux ? { flux: salleFlux } : {}) });

const etatInitial = (): EtatRelais => ({
  fenetre: 'fermee', scene: null, n: 0, fondu: FONDU_DEFAUT_MS, depuis: 0, autreRegie: false, mode: 'auto', etat: null, heureEtat: 0,
  config: configEffective(), sortie: null, sceneVue: null, vuLe: 0, finVideo: null, salle: 'aucune', precharger: [],
});
export const useSortie = create<EtatRelais>(etatInitial);

/** Identifiant de CETTE régie (une par page) : la sortie arbitre les scènes de plusieurs régies (arbitrage.ts). */
export const SOURCE_REGIE = 'regie_' + (() => {
  try { const a = new Uint8Array(10); globalThis.crypto.getRandomValues(a); return Array.from(a, (x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join(''); }
  catch { return Math.random().toString(36).slice(2, 12); }
})();

// ── commandes de scène ───────────────────────────────────────────────────────────────────────────────────────────

type AvecFondu = { fondu?: number };
export type CommandeScene = AvecFondu & (
  | { scene: 'video'; asset: string; boucle?: boolean; son?: boolean; cadrage?: Cadrage; legende?: string }
  | { scene: 'streamer'; gabarit?: Gabarit; secours?: string; bandeau?: string }
  | { scene: 'noir' }
  | { scene: 'accueil-qr' }
  | { scene: 'titre'; titre: string; surtitre?: string; sousTitre?: string }
  | { scene: 'image'; asset: string; legende?: string }
  | { scene: 'chrono'; duree: number; titre?: string }
  | { scene: 'vote'; question: string; options: OptionVote[]; phase?: 'ouvert' | 'decompte' | 'revele'; resultats?: Record<string, number>; gagnant?: string }
);

/** Commande → Scene (PUR). Une Scene complète passe telle quelle. */
export function sceneDeCommande(cmd: CommandeScene | Scene, config: ConfigSortie): Scene {
  if ('type' in cmd) return cmd;
  const sans = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
  switch (cmd.scene) {
    case 'video': return sans<Scene>({ type: 'video', asset: cmd.asset, boucle: cmd.boucle, son: cmd.son, cadrage: cmd.cadrage, legende: cmd.legende });
    case 'streamer': return sans<Scene>({ type: 'streamer', gabarit: cmd.gabarit, secours: cmd.secours, bandeau: cmd.bandeau });
    case 'noir': return { type: 'noir' };
    case 'accueil-qr': return sans<Scene>({ type: 'accueil-qr', adresse: adresseEntree(config), titre: config.titre, consigne: config.consigne, code: config.code });
    case 'titre': return sans<Scene>({ type: 'titre', titre: cmd.titre, surtitre: cmd.surtitre, sousTitre: cmd.sousTitre });
    case 'image': return sans<Scene>({ type: 'image', asset: cmd.asset, legende: cmd.legende });
    case 'chrono': return sans<Scene>({ type: 'chrono', duree: cmd.duree, titre: cmd.titre });
    case 'vote': return sans<Scene>({ type: 'vote', question: cmd.question, options: cmd.options, phase: cmd.phase ?? 'ouvert', resultats: cmd.resultats, gagnant: cmd.gagnant });
  }
}

// ── le relais ────────────────────────────────────────────────────────────────────────────────────────────────────

const transports = new Set<Transport>();
const desabonnements = new Map<Transport, () => void>();
const finsVideo = new Set<(asset: string, n: number) => void>();
/** fins de vidéo déjà signalées (la même peut arriver par deux chemins) */
const finsVues: string[] = [];
let derniersPrecharges: string[] = [];
let chronoManuel: { debut: number; duree: number } | null = null;
let battement: ReturnType<typeof setInterval> | undefined;
let utilisateurs = 0;
/** référence de la fenêtre ouverte par ouvrirSortieScene (fenetre.ts) */
let fenetreRef: { closed: boolean } | null = null;
export const retenirFenetre = (w: { closed: boolean } | null) => { fenetreRef = w; majFenetre(); };

function diffuser(m: unknown) { for (const t of transports) t.envoyer(m); }

function majFenetre() {
  const s = useSortie.getState();
  const vivante = Date.now() - s.vuLe < PERTE_MS;
  const fenetre: EtatFenetre = vivante ? 'connectee' : fenetreRef && !fenetreRef.closed ? 'ouverte' : 'fermee';
  if (fenetre !== s.fenetre) useSortie.setState({ fenetre });
}

/** Renvoie tout l'état connu (à l'arrivée d'une sortie ou d'une nouvelle liaison). */
function rejouer(t?: Transport) {
  const s = useSortie.getState();
  const env = (m: unknown) => (t ? t.envoyer(m) : diffuser(m));
  env(msgConfig(s.config));
  // renvoi : l'heure de décision d'origine (une commande plus récente d'une autre régie reste à l'écran)
  if (s.scene) env(msgScene(s.scene, s.n, 0, Date.now(), { source: SOURCE_REGIE, depuis: s.depuis }));
  if (s.etat) env(msgEtat(etatAvecChrono(s.etat)));
  if (s.precharger.length) env(msgPrecharger(s.precharger));
}

function recevoir(brut: unknown) {
  const m = lireMessageSortie(brut);
  if (!m) return;
  const maintenant = Date.now();
  switch (m.t) {
    case 'bonjour': useSortie.setState({ vuLe: maintenant }); rejouer(); break;
    case 'present': {
      const autreRegie = !!m.source && m.source !== SOURCE_REGIE;
      useSortie.setState({ vuLe: maintenant, sceneVue: m.scene, autreRegie, ...(m.etat ? { sortie: m.etat } : {}) });
      break;
    }
    case 'fin-video': {
      // la même fin peut arriver par le canal local ET par la salle : un seul signal
      const cle = `${m.id}|${m.asset}|${m.n}|${m.heure}`;
      if (finsVues.includes(cle)) break;
      finsVues.push(cle);
      if (finsVues.length > 20) finsVues.shift();
      useSortie.setState({ vuLe: maintenant, finVideo: { asset: m.asset, n: m.n, heure: maintenant } });
      for (const f of finsVideo) f(m.asset, m.n);
      break;
    }
    case 'au-revoir': useSortie.setState({ vuLe: 0, sortie: null, sceneVue: null }); break;
  }
  majFenetre();
}

/** Branche un transport (local, salle) ; renvoie la fonction qui le retire. */
export function ajouterTransport(t: Transport): () => void {
  transports.add(t);
  const a = t.ecouter(recevoir);
  const b = t.statut((st) => {
    if (t.nom === 'salle') useSortie.setState({ salle: st });
    if (st === 'connecte') rejouer(t);
  });
  desabonnements.set(t, () => { a(); b(); });
  return () => {
    desabonnements.get(t)?.();
    desabonnements.delete(t);
    transports.delete(t);
    if (t.nom === 'salle' && ![...transports].some((x) => x.nom === 'salle')) useSortie.setState({ salle: 'aucune' });
  };
}

/** Démarre le battement (heure régie, surveillance de la fenêtre). Compté : arreterRelais() le libère. */
export function demarrerRelais(): void {
  utilisateurs++;
  if (battement) return;
  battement = setInterval(() => {
    diffuser(msgHeure());
    const s = useSortie.getState();
    if (s.mode === 'manuel' && chronoManuel && s.etat) diffuser(msgEtat(etatAvecChrono(s.etat)));
    majFenetre();
  }, BATTEMENT_MS);
}
export function arreterRelais(): void {
  utilisateurs = Math.max(0, utilisateurs - 1);
  if (utilisateurs === 0 && battement) { clearInterval(battement); battement = undefined; }
}

/** Envoie une scène, datée de sa décision. `forcer` : renvoyée même si c'est déjà la nôtre (une autre régie a pu
 *  prendre la main entre-temps : un clic sur un bouton de scène doit TOUJOURS reprendre la sortie). */
function envoyerScene(scene: Scene, fondu: number, forcer = false) {
  const s = useSortie.getState();
  if (!forcer && s.scene && cleScene(s.scene) === cleScene(scene)) return;
  const n = s.n + 1;
  const depuis = Math.max(Date.now(), s.depuis + 1);
  useSortie.setState({ scene, n, fondu, depuis });
  diffuser(msgScene(scene, n, fondu, depuis, { source: SOURCE_REGIE, depuis }));
}

/** Montre une scène sur la sortie. Par défaut la commande est TENUE (mode manuel) jusqu'à relacherScene(). */
export function publierScene(cmd: CommandeScene | Scene, o: { fondu?: number; maintenir?: boolean } = {}): Scene {
  const scene = sceneDeCommande(cmd, useSortie.getState().config);
  const fondu = borneFondu(o.fondu ?? ('fondu' in cmd ? cmd.fondu : undefined) ?? FONDU_DEFAUT_MS);
  chronoManuel = scene.type === 'chrono' ? { debut: Date.now(), duree: scene.duree } : null;
  if (o.maintenir !== false) useSortie.setState({ mode: 'manuel' });
  envoyerScene(scene, fondu, true);
  const e = useSortie.getState().etat;
  if (chronoManuel && e) diffuser(msgEtat(etatAvecChrono(e)));
  return scene;
}

let rappelAuto: (() => void) | null = null;
/** La traduction automatique s'enregistre ici pour republier dès qu'on relâche une commande. */
export const surRelache = (fn: (() => void) | null) => { rappelAuto = fn; };

/** Rend la main à la scène automatique (la lecture). */
export function relacherScene(): void {
  chronoManuel = null;
  useSortie.setState({ mode: 'auto' });
  rappelAuto?.();
}

/** Publication par la traduction automatique : la scène n'est envoyée qu'en mode auto. */
export function publierAuto(scene: Scene, etat: EtatScene, precharges: string[], fondu = FONDU_DEFAUT_MS): void {
  const s = useSortie.getState();
  if (s.mode === 'auto') envoyerScene(scene, fondu);
  publierEtat(etat);
  precharger(precharges);
}

function etatAvecChrono(e: EtatScene): EtatScene {
  const s = useSortie.getState();
  if (s.mode !== 'manuel' || !chronoManuel) return e;
  const ecoule = (Date.now() - chronoManuel.debut) / 1000;
  return { ...e, compteur: { restant: Math.max(0, chronoManuel.duree - ecoule), duree: chronoManuel.duree, enCours: true, vitesse: 1 } };
}

let dernierEtat = '';
/** Publie l'état de scène (moment, étape, compteur). Les doublons exacts ne repartent pas. */
export function publierEtat(etat: EtatScene): void {
  const e = etatAvecChrono(etat);
  const cle = JSON.stringify(e);
  const heure = Date.now();
  useSortie.setState({ etat: e, heureEtat: heure });
  if (cle === dernierEtat) return;
  dernierEtat = cle;
  diffuser(msgEtat(e, heure));
}

export function publierEvenement(ev: EvenementScene): void { diffuser(msgEvenement(ev)); }

/** Annonce les vidéos à précharger (les mêmes ne repartent pas). */
export function precharger(assets: string[]): void {
  const l = assets.slice(0, 8);
  if (l.join('\n') === derniersPrecharges.join('\n')) return;
  derniersPrecharges = l;
  useSortie.setState({ precharger: l });
  if (l.length) diffuser(msgPrecharger(l));
}

/** Change la configuration (titre, adresse, code, consigne, secours) ; gardée dans ce navigateur. */
export function configurerSortie(c: Partial<ConfigSortie>): void {
  const { flux: _flux, ...reste } = c;
  void _flux;
  configPerso = { ...configPerso, ...reste };
  for (const k of Object.keys(configPerso) as (keyof ConfigSortie)[]) if (configPerso[k] === undefined || configPerso[k] === '') delete configPerso[k];
  try { localStorage.setItem(CLE_CONFIG, JSON.stringify(configPerso)); } catch { /* stockage bloqué */ }
  appliquerConfig();
}

/** Salle d'où la sortie reçoit le flux WebRTC du streamer (null : aucune). */
export function definirSalleFlux(f: ConfigSortie['flux'] | null): void {
  if (JSON.stringify(f ?? undefined) === JSON.stringify(salleFlux)) return;
  salleFlux = f ?? undefined;
  appliquerConfig();
}

/** Titre du projet courant (titre par défaut du QR). */
export function definirTitreProjet(t: string | undefined): void {
  if (t === titreProjet) return;
  titreProjet = t;
  appliquerConfig();
}

function appliquerConfig() {
  const config = configEffective();
  if (JSON.stringify(config) === JSON.stringify(useSortie.getState().config)) return;
  useSortie.setState({ config });
  diffuser(msgConfig(config));
  rappelAuto?.();
}

/** Abonnement à la fin d'une vidéo jouée « une seule fois » sur la sortie. */
export function surFinVideo(fn: (asset: string, n: number) => void): () => void {
  finsVideo.add(fn);
  return () => { finsVideo.delete(fn); };
}

/** Remise à zéro (tests). */
export function reinitialiserRelais(): void {
  for (const t of [...transports]) { desabonnements.get(t)?.(); transports.delete(t); }
  desabonnements.clear(); finsVideo.clear(); finsVues.length = 0;
  derniersPrecharges = []; dernierEtat = ''; chronoManuel = null; configPerso = {}; titreProjet = undefined; salleFlux = undefined; fenetreRef = null; rappelAuto = null;
  if (battement) clearInterval(battement);
  battement = undefined; utilisateurs = 0;
  useSortie.setState(etatInitial());
}
