// Page de la SORTIE ÉCRAN SCÈNE (sortie.html) : la fenêtre glissée sur le projecteur et mise en plein écran
// (bouton, touche F ou double-clic). Noir par défaut, curseur caché, reconnexion seule, témoin discret.
//
// Adresse :
//   sortie.html                                         même machine que la régie (BroadcastChannel)
//   sortie.html?serveur=https://…&projet=p_…&jeton=sr_…  autre machine : par la salle du serveur
//   options d'essai : &scene=accueil-qr|noir|streamer|titre|video|chrono  &titre=…  &adresse=…  &code=…  &asset=…
//                     &duree=…  &demo=1 (faux public sur le calque)
// Touches : F plein écran · D faux public · W webcam de test · M dossier des médias.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EtatLecture, Projet } from '@studio-real/modele';
import { transportLocal, type Transport } from './canal';
import type { CalqueReactions } from './calque/calque';
import { GestionFlux, type EtatFlux } from './flux';
import { Horloge } from './horloge';
import { BibliothequeMedias, type EtatMedias } from './medias';
import {
  adresseEntree, BATTEMENT_MS, configParDefaut, FONDU_DEFAUT_MS, lireMessageRegie, PERTE_MS, TYPES_SCENE, VERSION_SORTIE,
  type ConfigSortie, type EtatScene, type EtatSortie, type EvenementScene, type MessageSortie, type Scene, type TypeScene,
} from './protocole';
import { salleDansAdresse, TransportSalle, type MessageSalleBrut } from './salle';
import { ContexteServices, ContexteTemps, Fondus, Scene1080, type Services } from './scenes';
import { traduire } from './traduction';
import { PoolVideos } from './videos';

type Liaison = 'attente' | 'connecte' | 'perdu';

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
  const [scene, setScene] = useState<{ scene: Scene; n: number; fondu: number }>(() => ({ scene: sceneDeDepart(q, configDepart), n: 0, fondu: 0 }));
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

  const horloge = useRef(new Horloge());
  const dernierRegie = useRef(0);
  const transport = useRef<Transport | null>(null);
  const calque = useRef<CalqueReactions | null>(null);
  const hoteCalque = useRef<HTMLDivElement>(null);
  const cadre = useRef<HTMLDivElement>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const fichiers = useRef<HTMLInputElement>(null);

  // ── services ──
  const bib = useMemo(() => new BibliothequeMedias(), []);
  const pool = useMemo(() => new PoolVideos(bib), [bib]);
  const gestionFlux = useMemo(() => new GestionFlux(), []);
  const envoyer = useCallback((m: MessageSortie) => transport.current?.envoyer(m), []);
  const services = useMemo<Services>(() => ({
    medias: bib, pool, flux: gestionFlux, calque: () => calque.current,
    finVideo: (asset) => envoyer({ t: 'fin-video', v: VERSION_SORTIE, id, heure: Date.now(), asset, n: sceneRef.current.n }),
    sonBloque: setSonBloque, secours: setSecours,
    ...(config.secours ? { secoursDefaut: config.secours } : {}),
  }), [bib, pool, gestionFlux, envoyer, id, config.secours]);

  useEffect(() => bib.abonner(setMedias), [bib]);
  useEffect(() => { void bib.demarrer(); }, [bib]);
  useEffect(() => gestionFlux.abonner(setFlux), [gestionFlux]);
  // flux du streamer : la salle de l'adresse, sinon celle que la régie annonce dans la configuration
  const salleFlux = salleParams ?? config.flux ?? null;
  const cleSalleFlux = salleFlux ? JSON.stringify(salleFlux) : '';
  useEffect(() => { void gestionFlux.demarrer(cleSalleFlux ? JSON.parse(cleSalleFlux) : null); }, [gestionFlux, cleSalleFlux]);
  useEffect(() => () => gestionFlux.arreter(), [gestionFlux]);

  // ── messages de la régie ──
  const changerScene = useCallback((s: Scene, n: number, fondu: number) => {
    setScene((p) => (JSON.stringify(p.scene) === JSON.stringify(s) ? p : { scene: s, n, fondu }));
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

  const recevoir = useCallback((brut: unknown) => {
    const m = lireMessageRegie(brut);
    if (!m) return;
    const local = Date.now();
    horloge.current.noter(m.heure, local);
    dernierRegie.current = local;
    setLiaison((l) => (l === 'connecte' ? l : 'connecte'));
    switch (m.t) {
      case 'scene': changerScene(m.scene, m.n, m.fondu); break;
      case 'etat': setEtat({ etat: m.etat, heure: m.heure }); break;
      case 'evenement': evenement(m.evenement); break;
      case 'config': setConfig(m.config); break;
      case 'precharger': pool.precharger(m.assets); break;
      case 'heure': break;
    }
  }, [changerScene, evenement, pool]);

  // ── transport, battement, reconnexion ──
  useEffect(() => {
    let projetSalle: Projet | null = null, lectureSalle: EtatLecture | null = null, nLocal = 1_000_000;
    const t: Transport = salleParams
      ? new TransportSalle({ ...salleParams, role: 'poste', personne: id, nom: 'Sortie scène' })
      : transportLocal();
    transport.current = t;
    const a = t.ecouter(recevoir);
    const b = t instanceof TransportSalle ? t.ecouterSalle((m: MessageSalleBrut) => {
      if (m.t === 'bienvenue') { projetSalle = (m.projet as Projet | null) ?? projetSalle; lectureSalle = ((m.lecture as { etat?: EtatLecture } | null)?.etat) ?? lectureSalle; }
      if (m.t === 'instantane') projetSalle = (m.projet as Projet) ?? projetSalle;
      if (m.t === 'lecture') lectureSalle = (m.etat as EtatLecture) ?? lectureSalle;
    }) : () => {};
    const c = t.statut((s) => { if (s === 'connecte') envoyer({ t: 'bonjour', v: VERSION_SORTIE, id, heure: Date.now() }); });
    envoyer({ t: 'bonjour', v: VERSION_SORTIE, id, heure: Date.now() });
    let tic = 0;
    const battement = setInterval(() => {
      tic++;
      const s = sceneRef.current;
      const etatSortie: EtatSortie = {
        flux: gestionFlux.etat.statut === 'direct' ? 'direct' : gestionFlux.etat.statut === 'test' ? 'test' : 'aucun',
        secours: !!document.querySelector('.so-streamer .so-lecteur video'),
        medias: bib.etat.source, pleinEcran: !!document.fullscreenElement,
      };
      envoyer({ t: 'present', v: VERSION_SORTIE, id, heure: Date.now(), scene: s.scene.type, n: s.n, etat: etatSortie });
      const silence = Date.now() - dernierRegie.current;
      if (dernierRegie.current && silence > PERTE_MS) setLiaison('perdu');
      if (silence > PERTE_MS && tic % 2 === 0) envoyer({ t: 'bonjour', v: VERSION_SORTIE, id, heure: Date.now() });
      // secours : salle joignable mais aucune régie ne publie de scène → la sortie traduit elle-même la lecture
      if (projetSalle && lectureSalle && silence > 5000) {
        const r = traduire({ projet: projetSalle, lecture: lectureSalle, enLecture: true, config: configDepart });
        setScene((p) => (JSON.stringify(p.scene) === JSON.stringify(r.scene) ? p : { scene: r.scene, n: ++nLocal, fondu: FONDU_DEFAUT_MS }));
      }
    }, BATTEMENT_MS);
    const auRevoir = () => envoyer({ t: 'au-revoir', v: VERSION_SORTIE, id });
    window.addEventListener('pagehide', auRevoir);
    return () => { clearInterval(battement); window.removeEventListener('pagehide', auRevoir); a(); b(); c(); t.fermer(); transport.current = null; };
  }, [recevoir, envoyer, id, salleParams, gestionFlux, bib, configDepart]);

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
  const gabarit = scene.scene.type === 'streamer' ? scene.scene.gabarit : scene.scene.type === 'vote' ? 'vote' : undefined;
  const calqueVisible = !['noir', 'accueil-qr', 'chrono'].includes(typeScene);
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
    setSonBloque(false);
  }, [sonBloque]);

  const temps = useMemo(() => ({ etat: etat.etat, heureEtat: etat.heure, maintenantRegie: () => horloge.current.maintenant() }), [etat]);
  const texteLiaison = liaison === 'connecte' ? 'régie connectée' : liaison === 'perdu' ? 'régie perdue · reconnexion…' : 'en attente de la régie';
  const nomMedias = medias?.source === 'dossier' ? `dossier ${medias.dossier} · ${medias.nombre}` : medias?.source === 'fichiers' ? `fichiers · ${medias.nombre}` : medias?.source === 'dev' ? `médias de dev · ${medias.nombre}` : 'aucun média';

  return (
    <ContexteServices.Provider value={services}>
      <ContexteTemps.Provider value={temps}>
        <div className={'so-page' + (repos ? ' repos' : '')} onDoubleClick={basculerPleinEcran} onPointerDown={debloquerSon}>
          <div ref={cadre} className="so-cadre">
            <Scene1080>
              <Fondus scene={scene.scene} n={scene.n} fondu={scene.fondu} />
              <div ref={hoteCalque} className="so-calque" style={{ opacity: calqueVisible ? 1 : 0 }} />
            </Scene1080>
          </div>

          <div className={'so-temoin ' + liaison + (temoinVisible || !repos ? '' : ' cache')} role="status">
            <i />{texteLiaison}{salleParams ? ' · salle' : ''}{secours ? ' · secours' : ''}
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
