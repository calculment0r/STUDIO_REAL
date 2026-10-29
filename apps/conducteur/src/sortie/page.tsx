// Page de la SORTIE ÉCRAN SCÈNE (sortie.html) : la fenêtre glissée sur le projecteur et mise en plein écran
// (bouton, touche F ou double-clic). Noir par défaut, curseur caché, reconnexion seule, témoin discret.
//
// Adresse :
//   sortie.html                                         même machine que la régie (BroadcastChannel)
//   sortie.html?serveur=https://…&projet=p_…&jeton=sr_…  par la salle du serveur (autre machine) ET le canal local :
//                                                        la sortie écoute TOUJOURS le canal local en plus de la salle
//   sortie.html#spectacle=wss://…/ws&jeton=…             ACTEUR `scene` du serveur de spectacle (client-spectacle.ts) :
//                                                        ses vues font la scène ; le fragment est rangé dans l'onglet
//                                                        puis effacé. La régie peut aussi le demander (message `source`).
//                                                        Le canal local reste le SECOURS : ses scènes ne passent que si
//                                                        le serveur de spectacle est injoignable ; ses préchargements,
//                                                        sa configuration et ses événements passent toujours.
//                                                        Visio : les téléphones nommés offrent leur caméra par `rtc`,
//                                                        visio-rtc.ts répond et remplit flux-visio.ts (scène « visio »).
// Plusieurs régies peuvent la piloter (Conducteur, moniteur, autre machine) : la décision la plus récente gagne
// (arbitrage.ts). Une vidéo introuvable s'affiche en clair et remonte aux régies (present.etat.absent).
// Un message de régie illisible (autre version du protocole, scène inconnue) n'est PAS ignoré : la sortie renvoie un
// `refus` sur le même transport et, si c'était une scène qu'elle ne peut pas montrer, affiche une carte plein écran
// « Scène inconnue : <type> — recharger la sortie ». Le message `recharger` de la régie la recharge.
//   options d'essai : &scene=accueil-qr|noir|streamer|titre|video|chrono|mur  &titre=…  &adresse=…  &code=…  &asset=…
//                     &duree=…  &demo=1 (faux public sur le calque)
// Touches : F plein écran · D faux public · W webcam de test · M dossier des médias.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EtatLecture, Projet } from '@studio-real/modele';
import { transportWebSocket, type MsgFx } from '@studio-real/protocole';
import { arbitrerScene, FiltreDoublons, type DecisionScene } from './arbitrage';
import { transportLocal, type Transport } from './canal';
import type { CalqueReactions } from './calque/calque';
import {
  ClientSortieSpectacle, lireSourceSpectacle, mediasBattement, rangerSourceSpectacle, sessionOnglet, type EtatClientSpectacle, type VueRecue,
} from './client-spectacle';
import { GestionFlux, type EtatFlux } from './flux';
import { Horloge } from './horloge';
import { BibliothequeMedias, type EtatMedias } from './medias';
import { DonneesMur } from './mur';
import {
  adresseEntree, BATTEMENT_MS, BUILD_SORTIE, configParDefaut, estAsset, examinerMessageRegie, FONDU_DEFAUT_MS, msgBonjour, msgPresent, PERTE_MS, TYPES_SCENE, VERSION_SORTIE,
  type ConfigSortie, type EtatPrecharge, type EtatScene, type EtatSortie, type EvenementScene, type ExamenMessageRegie, type MessageSortie, type Scene,
  type SourceSpectacle, type TypeScene,
} from './protocole';
import { salleDansAdresse, TransportSalle, type MessageSalleBrut } from './salle';
import { ContexteServices, ContexteTemps, Fondus, Scene1080, type Services } from './scenes';
import { SonDeSalle } from './son-salle';
import { lireFxScene, traduire } from './traduction';
import { viderFluxVisio } from './flux-visio';
import { configurationVisio, creerVisioRtc, origineHttpDe, type VisioRtc } from './visio-rtc';
import { PoolVideos } from './videos';

type Liaison = 'attente' | 'connecte' | 'perdu';
type Refus = Extract<ExamenMessageRegie, { refus: unknown }>['refus'];
/** Carte affichée à la place d'une scène que la sortie ne sait pas montrer. */
interface CarteRefus { type: string; inconnue: boolean }
/** Un même refus (même raison, même message) ne repart pas plus d'une fois par REFUS_MS (battements d'une vieille régie). */
const REFUS_MS = 2000;

/** Stockage de l'onglet (source de spectacle, session) ; null s'il est bloqué. */
function stockageOnglet(): Storage | null {
  try { return sessionStorage; } catch { return null; }
}


function idSortie(): string {
  try {
    const deja = localStorage.getItem('sr-sortie-id');
    if (deja && /^[A-Za-z0-9_-]{6,64}$/.test(deja)) return deja;
    const a = new Uint8Array(10);
    crypto.getRandomValues(a);
    const id = 'sortie_' + Array.from(a, (x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
    localStorage.setItem('sr-sortie-id', id);
    return id;
  } catch { return 'sortie_' + Math.random().toString(36).slice(2, 12); }
}

/** Scène de départ lue dans l'adresse (essais, sortie sans régie). */
export function sceneDeDepart(q: URLSearchParams, c: ConfigSortie): Scene {
  const t = q.get('scene') as TypeScene | null;
  if (!t || !TYPES_SCENE.includes(t)) return { type: 'noir' };
  switch (t) {
    case 'accueil-qr': return { type: 'accueil-qr', adresse: adresseEntree(c), titre: c.titre, consigne: c.consigne, ...(c.code ? { code: c.code } : {}) };
    case 'streamer': return { type: 'streamer' };
    case 'titre': return { type: 'titre', titre: q.get('texte') ?? c.titre };
    case 'video': case 'image': { const a = q.get('asset'); return a ? (t === 'video' ? { type: 'video', asset: a, ...(q.get('son') === '1' ? { son: true } : {}) } : { type: 'image', asset: a }) : { type: 'noir' }; }
    case 'chrono': return { type: 'chrono', duree: Number(q.get('duree')) || 60 };
    case 'mur': { const t = q.get('texte'); return { type: 'mur', ...(t ? { titre: t } : {}) }; }
    default: return { type: 'noir' };
  }
}

export function PageSortie() {
  const q = useMemo(() => new URLSearchParams(location.search), []);
  const salleParams = useMemo(() => salleDansAdresse(location.search), []);
  const id = useMemo(idSortie, []);

  const configDepart = useMemo<ConfigSortie>(() => {
    const c = configParDefaut(q.get('titre') ?? undefined);
    const adresse = q.get('adresse'), code = q.get('code');
    return { ...c, ...(adresse ? { adresse } : {}), ...(code ? { code } : {}) };
  }, [q]);
  const [config, setConfig] = useState<ConfigSortie>(configDepart);
  // n : numéro LOCAL de la couche (les numéros des régies se recoupent) ; nRegie, source : d'où vient la scène
  const [scene, setScene] = useState<{ scene: Scene; n: number; nRegie: number; fondu: number; source: string }>(
    () => ({ scene: sceneDeDepart(q, configDepart), n: 0, nRegie: 0, fondu: 0, source: '' }));
  const [absents, setAbsents] = useState<string[]>([]);
  const [etat, setEtat] = useState<{ etat: EtatScene | null; heure: number }>({ etat: null, heure: 0 });
  const [liaison, setLiaison] = useState<Liaison>('attente');
  const [temoinVisible, setTemoinVisible] = useState(true);
  const [repos, setRepos] = useState(true);
  const [pleinEcran, setPleinEcran] = useState(false);
  const [demo, setDemo] = useState(false);
  const [sonBloque, setSonBloque] = useState(false);
  const [secours, setSecours] = useState(false);
  const [alerte, setAlerte] = useState<string | null>(null);
  const [medias, setMedias] = useState<EtatMedias | null>(null);
  const [flux, setFlux] = useState<EtatFlux | null>(null);
  const [calquePret, setCalquePret] = useState(false);
  const [carte, setCarte] = useState<CarteRefus | null>(null);
  const carteRef = useRef<CarteRefus | null>(null);
  carteRef.current = carte;
  // serveur de spectacle : la source (fragment de l'adresse, onglet, ou message `source` de la régie) et la liaison
  const [spectacle, setSpectacle] = useState<SourceSpectacle | null>(() =>
    lireSourceSpectacle(location.hash, stockageOnglet(), () => { try { history.replaceState(null, '', location.pathname + location.search); } catch { /* bac à sable */ } }));
  const [etatSpectacle, setEtatSpectacle] = useState<EtatClientSpectacle | null>(null);
  const etatSpectacleRef = useRef<EtatClientSpectacle | null>(null);
  const client = useRef<ClientSortieSpectacle | null>(null);
  /** liaisons WebRTC de la visio (avec le serveur de spectacle seulement) */
  const visio = useRef<VisioRtc | null>(null);
  /** couche locale dont l'affichage doit être accusé au serveur (vseq de la vue) */
  const aAccuser = useRef<{ n: number; vseq: number } | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const horloge = useRef(new Horloge());
  const dernierRegie = useRef(0);
  const transports = useRef<Transport[]>([]);
  const decision = useRef<DecisionScene | null>(null);
  const filtre = useRef(new FiltreDoublons());
  const numero = useRef(0);
  const absentsRef = useRef<string[]>([]);
  absentsRef.current = absents;
  const calque = useRef<CalqueReactions | null>(null);
  const hoteCalque = useRef<HTMLDivElement>(null);
  const cadre = useRef<HTMLDivElement>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  /** la scène telle que reçue (sans les votes ajoutés ici) : renvoyée dans `present.vue`, comparée par la régie */
  const sceneRecue = useRef<Scene | null>(null);
  const refusEnvoyes = useRef(new Map<string, number>());
  const fichiers = useRef<HTMLInputElement>(null);

  // ── services ──
  const bib = useMemo(() => new BibliothequeMedias(), []);
  const pool = useMemo(() => new PoolVideos(bib), [bib]);
  const gestionFlux = useMemo(() => new GestionFlux(), []);
  const donneesMur = useMemo(() => new DonneesMur(), []);
  const envoyer = useCallback((m: MessageSortie) => { for (const t of transports.current) t.envoyer(m); }, []);
  /** médias annoncés et leur état (les introuvables signalés par les scènes compris) */
  const precharges = useCallback((): Record<string, EtatPrecharge> => {
    const r = pool.etats();
    for (const a of absentsRef.current) r[a] = 'absent';
    return r;
  }, [pool]);
  const etatSortie = useCallback((): EtatSortie => {
    const a = absentsRef.current[absentsRef.current.length - 1];
    const p = precharges();
    const sp = etatSpectacleRef.current?.ligne;
    return {
      flux: gestionFlux.etat.statut === 'direct' ? 'direct' : gestionFlux.etat.statut === 'test' ? 'test' : 'aucun',
      secours: !!document.querySelector('.so-streamer .so-lecteur video'),
      medias: bib.etat.source, pleinEcran: !!document.fullscreenElement, ...(a ? { absent: a } : {}),
      ...(Object.keys(p).length ? { precharges: p } : {}),
      ...(sp && sp !== 'ferme' ? { spectacle: sp } : {}),
    };
  }, [gestionFlux, bib, precharges]);
  const presence = useCallback(() => {
    const s = sceneRef.current;
    // carte de refus à l'écran : la sortie ne montre AUCUNE scène demandée
    const montre = carteRef.current ? null : (sceneRecue.current ?? s.scene);
    envoyer(msgPresent({ id, vue: montre, n: s.nRegie, etat: etatSortie(), ...(s.source ? { source: s.source } : {}) }));
  }, [envoyer, etatSortie, id]);
  const bonjour = useCallback(() => msgBonjour(id), [id]);
  // média introuvable (ou retrouvé) : la régie le sait tout de suite, pas au battement suivant
  const absent = useCallback((asset: string, oui: boolean) => {
    setAbsents((l) => (oui ? (l.includes(asset) ? l : [...l, asset]) : l.filter((x) => x !== asset)));
  }, []);
  // audio de salle du mur : repris à sa place (heure du serveur de spectacle, sinon heure locale)
  const son = useMemo(() => new SonDeSalle(pool, () => client.current?.heureServeur() ?? Date.now(), { sonBloque: setSonBloque, absent }), [pool, absent]);
  // média absent, nouvelle scène, carte de refus : la régie le sait tout de suite, pas au battement suivant
  useEffect(() => { presence(); }, [absents, scene.n, carte, presence]);
  const services = useMemo<Services>(() => ({
    medias: bib, pool, flux: gestionFlux, calque: () => calque.current, mur: donneesMur,
    finVideo: (asset) => {
      envoyer({ t: 'fin-video', v: VERSION_SORTIE, id, heure: Date.now(), asset, n: sceneRef.current.nRegie });
      // serveur de spectacle : signal `scene.fin-video` du lecteur
      if (sceneRef.current.source === 'spectacle') client.current?.finVideo(asset);
    },
    sonBloque: setSonBloque, secours: setSecours, absent,
    ...(config.secours ? { secoursDefaut: config.secours } : {}),
  }), [bib, pool, gestionFlux, donneesMur, envoyer, id, config.secours, absent]);

  useEffect(() => bib.abonner(setMedias), [bib]);
  useEffect(() => { void bib.demarrer(); }, [bib]);
  useEffect(() => gestionFlux.abonner(setFlux), [gestionFlux]);
  // flux du streamer : la salle de l'adresse, sinon celle que la régie annonce dans la configuration
  const salleFlux = salleParams ?? config.flux ?? null;
  const cleSalleFlux = salleFlux ? JSON.stringify(salleFlux) : '';
  useEffect(() => { void gestionFlux.demarrer(cleSalleFlux ? JSON.parse(cleSalleFlux) : null); }, [gestionFlux, cleSalleFlux]);
  useEffect(() => () => gestionFlux.arreter(), [gestionFlux]);

  // ── messages de la régie ──
  const changerScene = useCallback((s: Scene, nRegie: number, fondu: number, source: string) => {
    sceneRecue.current = s;
    setCarte(null);
    setScene((p) => (JSON.stringify(p.scene) === JSON.stringify(s)
      ? (p.source === source && p.nRegie === nRegie ? p : { ...p, nRegie, source })
      : { scene: s, n: ++numero.current, nRegie, fondu, source }));
  }, []);

  const evenement = useCallback((ev: EvenementScene) => {
    if (ev.type === 'vote' || ev.type === 'resultats') {
      setScene((p) => {
        if (p.scene.type !== 'vote') return p;
        const r = { ...(p.scene.resultats ?? {}) };
        if (ev.type === 'vote') r[ev.option] = (r[ev.option] ?? 0) + (ev.n ?? 1);
        const s: Scene = ev.type === 'vote' ? { ...p.scene, resultats: r }
          : { ...p.scene, resultats: ev.votes, ...(ev.gagnant ? { gagnant: ev.gagnant, phase: 'revele' as const } : {}) };
        return { ...p, scene: s };
      });
      return;
    }
    if (ev.type === 'alerte') {
      if (ev.niveau === 'alerte') { setAlerte(ev.texte); setTimeout(() => setAlerte((a) => (a === ev.texte ? null : a)), 6000); }
      else calque.current?.recevoir({ type: 'pop', style: 'vedette', auteur: '★', texte: ev.texte });
      return;
    }
    calque.current?.recevoir(ev);
  }, []);

  /** Refus d'un message illisible : renvoyé sur le transport d'arrivée (au plus une fois par REFUS_MS et par message),
   *  et carte plein écran si c'était une scène que la sortie ne peut pas montrer. */
  const refuser = useCallback((r: Refus, t: Transport | null) => {
    const maintenant = Date.now();
    const cle = r.raison + '|' + r.recu + '|' + (r.source ?? '');
    const avant = refusEnvoyes.current.get(cle);
    if (avant === undefined || maintenant - avant > REFUS_MS) {
      refusEnvoyes.current.set(cle, maintenant);
      if (refusEnvoyes.current.size > 50) refusEnvoyes.current.clear();
      const m: MessageSortie = {
        t: 'refus', v: VERSION_SORTIE, id, heure: maintenant, raison: r.raison, version: VERSION_SORTIE, recu: r.recu,
        ...(r.versionRecue !== undefined ? { versionRecue: r.versionRecue } : {}), ...(r.source ? { source: r.source } : {}),
      };
      if (t) t.envoyer(m); else envoyer(m);
    }
    if (r.carte) {
      const type = r.typeScene ?? '?';
      const inconnue = r.raison === 'version' || !TYPES_SCENE.includes(type as TypeScene);
      setCarte((c) => (c && c.type === type && c.inconnue === inconnue ? c : { type, inconnue }));
    }
  }, [envoyer, id]);

  /** Le serveur de spectacle tient la scène (liaison ouverte) : les scènes du canal local attendent (secours). */
  const spectacleTient = useCallback(() => etatSpectacleRef.current?.ligne === 'ouvert', []);

  const recevoir = useCallback((brut: unknown, t: Transport | null = null) => {
    const ex = examinerMessageRegie(brut);
    if (!ex) return;
    if ('refus' in ex) { refuser(ex.refus, t); return; }
    const m = ex.message;
    // la régie demande un rechargement (sortie périmée, refus) : quelle que soit la version
    if (m.t === 'recharger') { location.reload(); return; }
    const local = Date.now();
    // le même message arrivé par le canal local ET par la salle : traité une fois
    if (!filtre.current.nouveau(m, local)) return;
    horloge.current.noter(m.heure, local);
    dernierRegie.current = local;
    setLiaison((l) => (l === 'connecte' ? l : 'connecte'));
    switch (m.t) {
      case 'scene': {
        if (spectacleTient()) break;
        // plusieurs régies : la décision la plus récente gagne ; un renvoi plus ancien est ignoré
        const d = arbitrerScene(decision.current, m, local);
        if (!d) break;
        decision.current = d;
        changerScene(m.scene, m.n, m.fondu, d.source);
        break;
      }
      case 'etat': setEtat({ etat: m.etat, heure: m.heure }); break;
      case 'evenement': evenement(m.evenement); break;
      case 'config': setConfig(m.config); break;
      case 'precharger': pool.precharger(m.assets); break;
      case 'heure': break;
      case 'source':
        rangerSourceSpectacle(m.spectacle, stockageOnglet());
        setSpectacle((s) => (JSON.stringify(s) === JSON.stringify(m.spectacle) ? s : m.spectacle));
        break;
    }
  }, [changerScene, evenement, pool, refuser, spectacleTient]);

  // ── serveur de spectacle : la sortie est l'acteur `scene` ──
  const recevoirVue = useCallback((v: VueRecue) => {
    const pre = v.params.precharger;
    if (Array.isArray(pre)) pool.precharger(pre.filter(estAsset).slice(0, 8));
    if ('refus' in v.resultat) {
      // écran inconnu ou illisible : carte « Scène inconnue » et accusé avec refus
      sceneRecue.current = null;
      setCarte({ type: v.ecran ?? '?', inconnue: v.resultat.refus === 'capacite' });
      client.current?.vueRefusee(v.vseq, v.resultat.refus);
      return;
    }
    const s = v.resultat.scene;
    const maintenant = Date.now();
    decision.current = { source: 'spectacle', depuis: maintenant, local: maintenant };
    sceneRecue.current = s;
    // même scène que la couche du dessus (reconnexion, ou après une carte de refus qui la masquait) : pas de nouvelle couche
    const deja = JSON.stringify(sceneRef.current.scene) === JSON.stringify(s);
    setCarte(null);
    if (deja) {
      // déjà à l'écran (reconnexion, même scène) : accusée tout de suite
      setScene((p) => ({ ...p, nRegie: v.vseq, source: 'spectacle' }));
      client.current?.vueAffichee(v.vseq);
      return;
    }
    const n = ++numero.current;
    aAccuser.current = { n, vseq: v.vseq };
    setScene({ scene: s, n, nRegie: v.vseq, fondu: FONDU_DEFAUT_MS, source: 'spectacle' });
  }, [pool]);

  const recevoirFx = useCallback((fx: MsgFx) => {
    const e = lireFxScene(fx.kind, fx.p);
    if (!e) return;
    if ('message' in e) { donneesMur.ajouterMessage(e.message); return; }
    if ('vote' in e) {
      const { pseudo, index } = e.vote;
      if (pseudo) calque.current?.recevoir({ type: 'pop', auteur: '@' + pseudo, texte: 'a voté', style: 'pop' });
      if (index !== undefined) {
        donneesMur.ajouterVoix(index);
        const s = sceneRef.current.scene;
        if (s.type === 'vote' && s.options[index]) evenement({ type: 'vote', option: s.options[index].cle });
      }
      return;
    }
    evenement(e.evenement);
  }, [donneesMur, evenement]);

  /** La couche `n` est à l'écran : accusé de la vue qu'elle montre. */
  const surAffiche = useCallback((n: number) => {
    const a = aAccuser.current;
    if (a && a.n === n) { aAccuser.current = null; client.current?.vueAffichee(a.vseq); }
  }, []);

  useEffect(() => {
    if (!spectacle) { etatSpectacleRef.current = null; setEtatSpectacle(null); return; }
    const c = new ClientSortieSpectacle({
      ouvrir: (hello) => transportWebSocket(spectacle.url, spectacle.jeton, { hello }),
      config: () => configRef.current, urlHttp: origineHttpDe(spectacle.url), session: sessionOnglet(stockageOnglet()), personne: id,
      ...(spectacle.acteur ? { acteur: spectacle.acteur } : {}),
    });
    client.current = c;
    // visio : répond aux offres des téléphones nommés, suit la scène affichée (posée tout de suite, puis par l'effet plus bas)
    const v = creerVisioRtc({ client: c, configuration: configurationVisio(spectacle) });
    visio.current = v;
    const s0 = sceneRef.current.scene;
    v.scene(s0.type === 'visio' ? s0.postes.map((p) => p.id) : null);
    const desabonner = [
      c.surEtat((e) => { etatSpectacleRef.current = e; setEtatSpectacle(e); }),
      c.surVue(recevoirVue),
      c.surFx(recevoirFx),
    ];
    const battement = setInterval(() => {
      const s = sceneRef.current.scene;
      c.battre({
        visible: document.visibilityState !== 'hidden',
        media: mediasBattement(precharges(), (a) => pool.part(a), { ...(s.type === 'video' ? { video: s.asset } : {}), son: son.etat }),
        ...(absentsRef.current.length ? { erreurs: absentsRef.current.map((a) => `absent:${a}`) } : {}),
      });
    }, BATTEMENT_MS);
    return () => {
      clearInterval(battement);
      for (const f of desabonner) f();
      v.fermer();
      if (visio.current === v) visio.current = null;
      c.fermer();
      if (client.current === c) client.current = null;
    };
  }, [spectacle, id, recevoirVue, recevoirFx, precharges, pool, son]);

  // visio : liaisons ouvertes tant que la scène montrée est « visio » (fermées 10 s après en être sortie)
  useEffect(() => {
    const s = scene.scene;
    visio.current?.scene(s.type === 'visio' ? s.postes.map((p) => p.id) : null);
  }, [scene.scene]);
  // fermeture de la page : `fin` aux téléphones, registre des flux vidé
  useEffect(() => {
    const fin = () => { visio.current?.fermer(); viderFluxVisio(); };
    window.addEventListener('pagehide', fin);
    return () => window.removeEventListener('pagehide', fin);
  }, []);

  // données vivantes du mur et audio de salle : suivent la scène montrée
  useEffect(() => { donneesMur.nouvelleVue(scene.scene); }, [donneesMur, scene.scene]);
  useEffect(() => { son.jouer(!carte && scene.scene.type === 'mur' ? scene.scene.audio : null); }, [son, scene.scene, carte]);
  useEffect(() => () => son.arreter(), [son]);

  // ── transports (canal local TOUJOURS, plus la salle de l'adresse), battement, reconnexion ──
  useEffect(() => {
    // secours : la sortie traduit elle-même la lecture de la salle si une conduite y joue (message « lecture » reçu
    // pendant cette session : un état de lecture ancien gardé par le serveur ne compte pas) et qu'aucune régie ne parle
    let projetSalle: Projet | null = null, lectureSalle: EtatLecture | null = null, lectureVivante = false;
    const salle = salleParams ? new TransportSalle({ ...salleParams, role: 'poste', personne: id, nom: 'Sortie scène' }) : null;
    const liste: Transport[] = [transportLocal(), ...(salle ? [salle] : [])];
    transports.current = liste;
    const desabonner: (() => void)[] = [];
    for (const t of liste) {
      desabonner.push(t.ecouter((m) => recevoir(m, t)));
      desabonner.push(t.statut((st) => { if (st === 'connecte') t.envoyer(bonjour()); }));
    }
    if (salle) desabonner.push(salle.ecouterSalle((m: MessageSalleBrut) => {
      if (m.t === 'bienvenue') { projetSalle = (m.projet as Projet | null) ?? projetSalle; lectureSalle = ((m.lecture as { etat?: EtatLecture } | null)?.etat) ?? lectureSalle; }
      if (m.t === 'instantane') projetSalle = (m.projet as Projet) ?? projetSalle;
      if (m.t === 'lecture') { lectureSalle = (m.etat as EtatLecture) ?? lectureSalle; lectureVivante = true; }
    }));
    let tic = 0;
    const battement = setInterval(() => {
      tic++;
      presence();
      const silence = Date.now() - dernierRegie.current;
      if (dernierRegie.current && silence > PERTE_MS) setLiaison('perdu');
      if (silence > PERTE_MS && tic % 2 === 0) envoyer(bonjour());
      if (projetSalle && lectureSalle && lectureVivante && silence > 5000 && !spectacleTient()) {
        const r = traduire({ projet: projetSalle, lecture: lectureSalle, enLecture: true, config: configDepart });
        const p = sceneRef.current;
        if (JSON.stringify(p.scene) !== JSON.stringify(r.scene)) {
          const maintenant = Date.now();
          decision.current = { source: 'secours', depuis: maintenant, local: maintenant };
          sceneRecue.current = r.scene;
          setCarte(null);
          setScene({ scene: r.scene, n: ++numero.current, nRegie: 0, fondu: FONDU_DEFAUT_MS, source: 'secours' });
        }
      }
    }, BATTEMENT_MS);
    const auRevoir = () => envoyer({ t: 'au-revoir', v: VERSION_SORTIE, id });
    window.addEventListener('pagehide', auRevoir);
    return () => {
      clearInterval(battement); window.removeEventListener('pagehide', auRevoir);
      for (const f of desabonner) f();
      for (const t of liste) t.fermer();
      transports.current = [];
    };
  }, [recevoir, envoyer, presence, bonjour, id, salleParams, configDepart, spectacleTient]);

  // témoin : visible 3 s après la connexion, toujours quand la liaison manque
  useEffect(() => {
    setTemoinVisible(true);
    if (liaison !== 'connecte') return;
    const t = setTimeout(() => setTemoinVisible(false), 3000);
    return () => clearTimeout(t);
  }, [liaison]);

  // ── calque de réactions (PixiJS, chargé à la demande) ──
  useEffect(() => {
    let vivant = true;
    const hote = hoteCalque.current;
    if (!hote) return;
    import('./calque/calque')
      .then((m) => m.CalqueReactions.creer(hote, cadre.current))
      .then((c) => {
        if (!vivant) { c.detruire(); return; }
        calque.current = c;
        if (q.get('demo') === '1') { c.basculerDemo(true); setDemo(true); }
        setCalquePret(true);
      })
      .catch((e) => console.warn('sortie : calque de réactions indisponible', e));
    return () => { vivant = false; calque.current?.detruire(); calque.current = null; };
  }, [q]);

  const typeScene = scene.scene.type;
  const gabarit = scene.scene.type === 'streamer' ? scene.scene.gabarit : scene.scene.type === 'vote' ? 'vote' : scene.scene.type === 'mur' ? 'chat' : undefined;
  const calqueVisible = !carte && !['noir', 'accueil-qr', 'chrono', 'page', 'visio'].includes(typeScene);
  useEffect(() => { if (gabarit) calque.current?.gabarit(gabarit); }, [gabarit, calquePret]);

  // ── plein écran, curseur, touches ──
  const basculerPleinEcran = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => { /* refusé */ });
  }, []);
  useEffect(() => {
    const f = () => setPleinEcran(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const bouger = () => { setRepos(false); clearTimeout(t); t = setTimeout(() => setRepos(true), 2500); };
    window.addEventListener('pointermove', bouger);
    return () => { window.removeEventListener('pointermove', bouger); clearTimeout(t); };
  }, []);
  const basculerDemo = useCallback(() => { const c = calque.current; if (c) setDemo(c.basculerDemo()); }, []);
  const webcam = useCallback(() => { if (gestionFlux.etat.source === 'webcam') gestionFlux.arreterTest(); else void gestionFlux.webcam(); }, [gestionFlux]);
  const dossier = useCallback(() => { void (bib.etat.aAutoriser ? bib.autoriser() : bib.choisirDossier()); }, [bib]);
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyF') { e.preventDefault(); basculerPleinEcran(); }
      else if (e.code === 'KeyD') basculerDemo();
      else if (e.code === 'KeyW') webcam();
      else if (e.code === 'KeyM') dossier();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [basculerPleinEcran, basculerDemo, webcam, dossier]);

  // un clic rend le son refusé par le navigateur
  const debloquerSon = useCallback(() => {
    if (!sonBloque) return;
    const s = sceneRef.current.scene;
    if (s.type === 'video' && s.son) document.querySelectorAll<HTMLVideoElement>('.so-lecteur video').forEach((v) => { v.muted = false; void v.play().catch(() => {}); });
    son.debloquer();
    setSonBloque(false);
  }, [sonBloque, son]);

  const temps = useMemo(() => ({ etat: etat.etat, heureEtat: etat.heure, maintenantRegie: () => horloge.current.maintenant() }), [etat]);
  // serveur de spectacle : le témoin dit SA liaison (la régie locale n'est plus que le secours)
  const ligne = etatSpectacle?.ligne;
  const temoin: Liaison = !spectacle ? liaison : ligne === 'ouvert' ? 'connecte' : ligne === 'connexion' ? 'attente' : 'perdu';
  const texteLiaison = spectacle
    ? (ligne === 'ouvert' ? 'serveur de spectacle' : ligne === 'refuse' ? 'serveur de spectacle : refusé' : ligne === 'connexion' ? 'connexion au serveur de spectacle…' : 'serveur de spectacle perdu · reconnexion…')
      + (etatSpectacle?.rttMs !== undefined && ligne === 'ouvert' ? ` · ${etatSpectacle.rttMs} ms` : '')
    : liaison === 'connecte' ? 'régie connectée' : liaison === 'perdu' ? 'régie perdue · reconnexion…' : 'en attente de la régie';
  const refusSpectacle = etatSpectacle?.refus?.fatal ? etatSpectacle.refus : null;
  const nomMedias = medias?.source === 'dossier' ? `dossier ${medias.dossier} · ${medias.nombre}` : medias?.source === 'fichiers' ? `fichiers · ${medias.nombre}` : medias?.source === 'dev' ? `médias de dev · ${medias.nombre}` : 'aucun média';

  return (
    <ContexteServices.Provider value={services}>
      <ContexteTemps.Provider value={temps}>
        <div className={'so-page' + (repos ? ' repos' : '')} onDoubleClick={basculerPleinEcran} onPointerDown={debloquerSon}>
          <div ref={cadre} className="so-cadre">
            <Scene1080>
              <Fondus scene={scene.scene} n={scene.n} fondu={scene.fondu} surAffiche={surAffiche} />
              <div ref={hoteCalque} className="so-calque" style={{ opacity: calqueVisible ? 1 : 0 }} />
              {carte && (
                <div className="so-refus" role="alert">
                  <div className="so-micro so-refus-sur">Sortie écran scène · protocole v{VERSION_SORTIE} · {BUILD_SORTIE}</div>
                  <div className="so-refus-titre">{carte.inconnue ? 'Scène inconnue' : 'Scène illisible'} : {carte.type}</div>
                  <div className="so-rampe" />
                  <div className="so-refus-consigne">— recharger la sortie</div>
                  <div className="so-refus-aide">touche F5 ici, ou « Recharger la sortie » dans la régie</div>
                </div>
              )}
              {refusSpectacle && (
                <div className="so-refus" role="alert">
                  <div className="so-micro so-refus-sur">Sortie écran scène · serveur de spectacle · {BUILD_SORTIE}</div>
                  <div className="so-refus-titre">Connexion refusée : {refusSpectacle.code}</div>
                  <div className="so-rampe" />
                  <div className="so-refus-consigne">— {refusSpectacle.code === 'version' ? 'recharger la sortie' : 'vérifier le lien de la sortie'}</div>
                  <div className="so-refus-aide">{refusSpectacle.message}</div>
                </div>
              )}
            </Scene1080>
          </div>

          <div className={'so-temoin ' + temoin + (temoinVisible || !repos || (spectacle && temoin !== 'connecte') ? '' : ' cache')} role="status">
            <i />{texteLiaison}{spectacle ? ' · canal local en secours' : salleParams ? ' · canal local + salle' : ' · canal local'}{secours ? ' · secours' : ''}
          </div>
          {alerte && <div className="so-alerte" role="alert">{alerte}</div>}

          <div className={'so-commandes' + (repos ? ' cache' : '')} onDoubleClick={(e) => e.stopPropagation()}>
            <button className={pleinEcran ? 'on' : ''} onClick={basculerPleinEcran} title="Plein écran · F ou double-clic">{pleinEcran ? 'Quitter' : 'Plein écran'}</button>
            {medias?.dossierPossible && (
              <button className={medias.aAutoriser ? 'on' : ''} onClick={dossier} title="Dossier des vidéos précalculées · M">
                {medias.aAutoriser ? 'Autoriser le dossier' : 'Dossier médias'}
              </button>
            )}
            <button onClick={() => fichiers.current?.click()} title="Choisir des fichiers médias">Fichiers</button>
            <button className={flux?.source === 'webcam' ? 'on' : ''} onClick={webcam} title="Source de test du streamer · W">Webcam test</button>
            <button className={demo ? 'on' : ''} onClick={basculerDemo} disabled={!calquePret} title="Faux public sur le calque · D">Public factice</button>
            {sonBloque && <button className="on" onClick={debloquerSon}>Activer le son</button>}
            <span className="so-info">{nomMedias} · flux {flux?.statut ?? 'aucun'}</span>
            <input ref={fichiers} type="file" multiple accept="video/*,image/*,audio/*" hidden onChange={(e) => { if (e.target.files) bib.ajouterFichiers(e.target.files); e.target.value = ''; }} />
          </div>
        </div>
      </ContexteTemps.Provider>
    </ContexteServices.Provider>
  );
}
