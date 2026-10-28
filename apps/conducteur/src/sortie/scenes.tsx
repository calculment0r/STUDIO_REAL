// Les scènes de la sortie écran scène (chantier SORTIE SCÈNE), dessinées sur une scène logique de 1920 × 1080
// mise à l'échelle de l'écran. Partagées par la page de sortie (sortie.html) et la vignette de la régie
// (<ApercuSortie />, `miniature` : ni vidéo, ni webcam, ni calque). Couleurs : jetons de src/theme uniquement.
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import type { CalqueReactions } from './calque/calque';
import type { GestionFlux, EtatFlux } from './flux';
import { mmssRebours, restantCompteur } from './horloge';
import type { BibliothequeMedias } from './medias';
import { adresseLisible, cleScene, type EtatScene, type Scene } from './protocole';
import { cadrageAuto, type PoolVideos } from './videos';

export const LARGEUR = 1920;
export const HAUTEUR = 1080;

// ── services (page de sortie seulement) et temps ────────────────────────────────────────────────────────────────

export interface Services {
  medias: BibliothequeMedias;
  pool: PoolVideos;
  flux: GestionFlux;
  calque: () => CalqueReactions | null;
  /** fin d'une vidéo jouée une seule fois */
  finVideo: (asset: string) => void;
  /** le navigateur a refusé le son sans geste de l'utilisateur */
  sonBloque: (v: boolean) => void;
  /** la vidéo de secours remplace le flux tombé */
  secours: (v: boolean) => void;
  /** asset de secours par défaut (configuration) */
  secoursDefaut?: string;
  /** un média demandé est introuvable (oui) ou de nouveau trouvé / plus à l'écran (non) : remonte aux régies */
  absent?: (asset: string, oui: boolean) => void;
}
export const ContexteServices = createContext<Services | null>(null);

export interface Temps { etat: EtatScene | null; heureEtat: number; maintenantRegie: () => number }
export const ContexteTemps = createContext<Temps>({ etat: null, heureEtat: 0, maintenantRegie: () => Date.now() });

/** Re-rendu à chaque image tant que `actif`. */
function useImage(actif: boolean): number {
  const [, set] = useState(0);
  useEffect(() => {
    if (!actif) return;
    let raf = 0;
    const f = () => { set((x) => (x + 1) % 1e6); raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [actif]);
  return 0;
}

/** Secondes restantes du compteur de l'état (chrono, vote), extrapolées entre deux messages. */
function useRestant(): { restant: number; duree: number } | null {
  const { etat, heureEtat, maintenantRegie } = useContext(ContexteTemps);
  const c = etat?.compteur;
  useImage(!!c?.enCours);
  if (!c) return null;
  return { restant: restantCompteur(c, heureEtat, maintenantRegie()), duree: c.duree };
}

// ── scène logique 16:9 mise à l'échelle ─────────────────────────────────────────────────────────────────────────

/** Scène 1920 × 1080 centrée et mise à l'échelle de son conteneur (bandes noires si l'écran n'est pas en 16:9). */
export function Scene1080({ children, className }: { children: ReactNode; className?: string }) {
  const hote = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  useLayoutEffect(() => {
    const el = hote.current;
    if (!el) return;
    const maj = () => setK(Math.min(el.clientWidth / LARGEUR, el.clientHeight / HAUTEUR));
    maj();
    const ro = new ResizeObserver(maj);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={hote} className={'so-hote' + (className ? ' ' + className : '')}>
      <div className="so-1080" style={{ transform: `translate(-50%, -50%) scale(${k})` }}>{children}</div>
    </div>
  );
}

// ── fondus enchaînés ─────────────────────────────────────────────────────────────────────────────────────────────

interface Couche { cle: string; scene: Scene; n: number; fondu: number; visible: boolean }

/** Clé d'une scène « page » : son adresse seule (l'iframe gardée montée ne dépend que d'elle). */
export const clePage = (url: string): string => 'page:' + url;

/** Hôte d'une adresse (vignette d'une scène « page ») ; l'adresse brute si elle ne se lit pas. */
export function hotePage(url: string): string {
  try { return new URL(url).host || url; } catch { return url; }
}

/**
 * Empile les scènes : la nouvelle apparaît PAR-DESSUS l'ancienne en `fondu` ms, puis l'ancienne est retirée.
 * Une scène « page » (iframe : mur du serveur, visio) n'est PAS dans les couches : elle vit dans une couche GARDÉE,
 * montée une fois par adresse (clé : clePage) et seulement cachée quand une autre scène passe devant — une suite
 * mur → noir → mur ne recharge donc pas la page (ni ne reconnecte son WebSocket). Sa couche dans la pile ne porte que
 * l'ordre et le fondu ; l'ordre d'empilement passe par z-index (déplacer une iframe dans le DOM la rechargerait).
 * La page gardée est posée AVANT les couches (.so-page-gardee, pas .so-couche) : la dernière .so-couche reste la
 * scène du dessus (essais de bout en bout).
 */
export function Fondus({ scene, n, fondu, miniature = false }: { scene: Scene | null; n: number; fondu: number; miniature?: boolean }) {
  const [couches, setCouches] = useState<Couche[]>([]);
  /** adresse de la dernière scène « page » montrée (page de sortie seulement) : son iframe reste montée */
  const [pageGardee, setPageGardee] = useState<string | null>(null);
  const cle = scene ? cleScene(scene) : '';
  useEffect(() => {
    if (!scene) { setCouches([]); return; }
    if (scene.type === 'page' && !miniature) setPageGardee(scene.url);
    setCouches((l) => {
      if (l.length && l[l.length - 1].cle === cle) return l;
      return [...l.slice(-2), { cle, scene, n, fondu, visible: fondu <= 0 }];
    });
    if (fondu <= 0) return;
    // la couche est d'abord peinte transparente, puis rendue visible : la transition CSS fait le fondu. Deux images
    // d'animation suffisent ; mais une fenêtre cachée (onglet en arrière-plan) suspend requestAnimationFrame : un
    // minuteur garantit la bascule quand même (sans quoi la nouvelle scène resterait transparente sous l'ancienne).
    let fait = false, raf2 = 0;
    const montrer = () => {
      if (fait) return;
      fait = true;
      setCouches((l) => l.map((c) => (c.cle === cle && c.n === n ? { ...c, visible: true } : c)));
    };
    const raf = requestAnimationFrame(() => { raf2 = requestAnimationFrame(montrer); });
    const minuteur = setTimeout(montrer, 100);
    return () => { cancelAnimationFrame(raf); cancelAnimationFrame(raf2); clearTimeout(minuteur); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  // l'ancienne couche part quand la nouvelle est entièrement visible
  const derniere = couches[couches.length - 1];
  useEffect(() => {
    if (!derniere?.visible || couches.length < 2) return;
    const t = setTimeout(() => setCouches((l) => l.slice(-1)), derniere.fondu + 50);
    return () => clearTimeout(t);
  }, [derniere?.visible, derniere?.fondu, couches.length]);
  const gardee = (c: Couche) => !miniature && c.scene.type === 'page' && c.scene.url === pageGardee;
  // place de la page gardée dans la pile : celle de sa couche (la plus haute), sinon cachée sous tout
  let iPage = -1;
  couches.forEach((c, i) => { if (gardee(c)) iPage = i; });
  const cPage = iPage >= 0 ? couches[iPage] : null;
  return (
    <>
      {pageGardee && !miniature && (
        <div
          key={clePage(pageGardee)}
          className="so-page-gardee"
          aria-hidden={!cPage}
          style={cPage
            ? { zIndex: iPage + 1, opacity: cPage.visible ? 1 : 0, transition: `opacity ${cPage.fondu}ms ease` }
            : { zIndex: 0, opacity: 0, visibility: 'hidden', pointerEvents: 'none' }}
        >
          <PagePleinEcran url={pageGardee} />
        </div>
      )}
      {couches.map((c, i) => (
        <div key={c.cle + ':' + c.n} className="so-couche" style={{ zIndex: i + 1, opacity: c.visible ? 1 : 0, transition: `opacity ${c.fondu}ms ease`, ...(gardee(c) ? { pointerEvents: 'none' as const } : {}) }}>
          {!gardee(c) && <RenduScene scene={c.scene} n={c.n} miniature={miniature} />}
        </div>
      ))}
    </>
  );
}

/** Page web plein écran (scène « page »). */
function PagePleinEcran({ url }: { url: string }) {
  return <iframe className="so-iframe" src={url} title="page" allow="autoplay; camera; microphone; fullscreen" />;
}

export function RenduScene({ scene, n, miniature }: { scene: Scene; n: number; miniature: boolean }) {
  switch (scene.type) {
    case 'noir': return <div className="so-noir" />;
    case 'page': return miniature
      ? <div className="so-vignette-media"><span className="so-micro">{'PAGE · ' + hotePage(scene.url)}</span></div>
      : <PagePleinEcran url={scene.url} />;
    case 'accueil-qr': return <SceneQr scene={scene} />;
    case 'streamer': return <SceneStreamer scene={scene} miniature={miniature} />;
    case 'vote': return <SceneVote scene={scene} miniature={miniature} />;
    case 'chrono': return <SceneChrono scene={scene} />;
    case 'titre': return <SceneTitre scene={scene} />;
    case 'image': return <SceneImage scene={scene} miniature={miniature} />;
    case 'video': return <SceneVideo scene={scene} n={n} miniature={miniature} />;
  }
}

// ── QR d'accueil ────────────────────────────────────────────────────────────────────────────────────────────────

/** Tracé SVG des modules sombres d'un QR (une seule <path>, couleur posée par la feuille de style). */
export function traceQr(texte: string): { taille: number; d: string } {
  const qr = QRCode.create(texte, { errorCorrectionLevel: 'M' });
  const { size, data } = qr.modules;
  let d = '';
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!data[y * size + x]) { x++; continue; }
      let l = 1;
      while (x + l < size && data[y * size + x + l]) l++;
      d += `M${x} ${y}h${l}v1h-${l}z`;
      x += l;
    }
  }
  return { taille: size, d };
}

const tailleTitre = (t: string, grand: number, moyen: number, petit: number) => (t.length <= 14 ? grand : t.length <= 28 ? moyen : petit);

function SceneQr({ scene }: { scene: Extract<Scene, { type: 'accueil-qr' }> }) {
  const qr = useMemo(() => { try { return traceQr(scene.adresse); } catch { return null; } }, [scene.adresse]);
  const marge = 4;   // zone de silence : 4 modules
  return (
    <div className="so-qr">
      <div className="so-qr-plaque">
        {qr && (
          <svg viewBox={`${-marge} ${-marge} ${qr.taille + 2 * marge} ${qr.taille + 2 * marge}`} shapeRendering="crispEdges" role="img" aria-label={'QR code : ' + scene.adresse}>
            <rect x={-marge} y={-marge} width={qr.taille + 2 * marge} height={qr.taille + 2 * marge} className="so-qr-fond" />
            <path d={qr.d} className="so-qr-modules" />
          </svg>
        )}
      </div>
      <div className="so-qr-texte">
        <div className="so-micro so-qr-sur">STUDIO REAL · ENTRÉE DU PUBLIC</div>
        <div className="so-qr-titre f-disp" style={{ fontSize: tailleTitre(scene.titre, 150, 104, 72) }}>{scene.titre}</div>
        <div className="so-rampe" />
        <div className="so-qr-consigne">{scene.consigne}</div>
        <div className="so-qr-adresse">{adresseLisible(scene.adresse)}</div>
        {scene.code && (
          <div className="so-qr-code"><span className="so-micro">CODE</span><span className="f-disp">{scene.code}</span></div>
        )}
      </div>
    </div>
  );
}

// ── flux du streamer ────────────────────────────────────────────────────────────────────────────────────────────

function useEtatFlux(flux: GestionFlux | undefined): EtatFlux | null {
  const [e, setE] = useState<EtatFlux | null>(flux?.etat ?? null);
  useEffect(() => (flux ? flux.abonner(setE) : undefined), [flux]);
  return e;
}

/** Mire de test (jetons du thème), animée tant qu'aucun flux n'arrive. */
function Mire({ texte }: { texte: string }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = toile.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    const cs = getComputedStyle(c);
    const jetons = ['--ink', '--rampe-1', '--cy', '--vert-pale', '--ort', '--fam-cible', '--gt', '--rampe-4'].map((n) => cs.getPropertyValue(n).trim());
    const fond = cs.getPropertyValue('--well2').trim(), trait = cs.getPropertyValue('--ink2').trim();
    let raf = 0, t0 = performance.now();
    const W = c.width, H = c.height;
    const dessiner = (ts: number) => {
      const t = (ts - t0) / 1000;
      g.fillStyle = fond; g.fillRect(0, 0, W, H);
      const bw = W / jetons.length;
      jetons.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * bw, 0, bw + 1, H * 0.62); });
      for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? fond : trait; g.fillRect((i * W) / 16, H * 0.66, W / 16 + 1, H * 0.06); }
      const x = ((t * 0.25) % 1) * W;
      g.fillStyle = trait; g.fillRect(x, H * 0.76, 4, H * 0.24);
      raf = requestAnimationFrame(dessiner);
    };
    raf = requestAnimationFrame(dessiner);
    return () => { cancelAnimationFrame(raf); t0 = 0; };
  }, []);
  return (
    <div className="so-mire">
      <canvas ref={toile} width={480} height={270} />
      <div className="so-mire-texte so-micro">{texte}</div>
    </div>
  );
}

function SceneStreamer({ scene, miniature }: { scene: Extract<Scene, { type: 'streamer' }>; miniature: boolean }) {
  const s = useContext(ContexteServices);
  const etat = useEtatFlux(s?.flux);
  const video = useRef<HTMLVideoElement>(null);
  const flux = etat?.flux ?? null;
  const secours = scene.secours ?? s?.secoursDefaut;
  const tombe = etat?.statut === 'tombe' && !!secours;
  useEffect(() => {
    const v = video.current;
    if (!v || !s) return;
    s.flux.ecran = v;
    if (v.srcObject !== flux) v.srcObject = flux;
    if (flux) void v.play().catch(() => { /* lecture automatique muette : toujours permise */ });
    return () => { if (s.flux.ecran === v) s.flux.ecran = null; };
  }, [flux, s]);
  useEffect(() => { s?.secours(tombe); return () => s?.secours(false); }, [tombe, s]);
  if (miniature) return <div className="so-vignette-media"><span className="so-micro">FLUX DU STREAMER</span></div>;
  return (
    <div className="so-streamer">
      <video ref={video} className={'so-flux' + (flux ? ' on' : '') + (etat?.source === 'webcam' ? ' miroir' : '')} muted playsInline autoPlay />
      {!flux && !tombe && <Mire texte={etat?.statut === 'connexion' ? 'CONNEXION AU STREAMER…' : 'EN ATTENTE DU FLUX DU STREAMER'} />}
      {secours && (
        <div className="so-couche" style={{ opacity: tombe ? 1 : 0, transition: 'opacity 800ms ease' }}>
          {tombe && <LecteurVideo asset={secours} boucle son={false} cadrage="auto" />}
        </div>
      )}
      {scene.bandeau && <div className="so-bandeau so-micro">{scene.bandeau}</div>}
    </div>
  );
}

// ── vidéos locales ──────────────────────────────────────────────────────────────────────────────────────────────

/** Message plein écran d'un média introuvable : le nom, et quoi faire. */
function MediaAbsent({ asset }: { asset: string }) {
  const s = useContext(ContexteServices);
  useEffect(() => {
    s?.absent?.(asset, true);
    return () => s?.absent?.(asset, false);
  }, [asset, s]);
  return (
    <div className="so-absent" role="alert">
      <div className="so-absent-titre">{asset} introuvable — choisir le dossier médias</div>
      <div className="so-absent-aide so-micro">
        touche M ou bouton « Dossier médias » · médias actuels : {s?.medias.etat.source === 'aucun' ? 'aucun' : `${s?.medias.etat.source} (${s?.medias.etat.nombre})`}
      </div>
    </div>
  );
}

function LecteurVideo({ asset, boucle, son, cadrage, surFin }: { asset: string; boucle: boolean; son: boolean; cadrage: 'contain' | 'cover' | 'auto'; surFin?: () => void }) {
  const s = useContext(ContexteServices);
  const hote = useRef<HTMLDivElement>(null);
  const [absente, setAbsente] = useState(false);
  // média introuvable : on réessaie dès que la bibliothèque change (dossier choisi, fichiers ajoutés)
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    if (!absente || !s) return;
    let n0: number | null = null;
    return s.medias.abonner((e) => { if (n0 === null) n0 = e.nombre; else if (e.nombre !== n0 || !e.aAutoriser) setEssai((x) => x + 1); });
  }, [absente, s]);
  const fin = useRef(surFin);
  fin.current = surFin;
  useEffect(() => {
    const h = hote.current;
    if (!h || !s) return;
    const { el, pret } = s.pool.prendre(asset);
    el.className = 'so-video';
    el.loop = boucle;
    el.muted = !son;
    const cadrer = () => { el.style.objectFit = cadrage === 'auto' ? cadrageAuto(el.videoWidth, el.videoHeight) : cadrage; };
    cadrer();
    el.onloadedmetadata = cadrer;
    el.onended = boucle ? null : () => fin.current?.();
    h.appendChild(el);
    let vivant = true;
    void pret.then((ok) => {
      if (!vivant) return;
      setAbsente(!ok);
      if (!ok) return;
      try { el.currentTime = 0; } catch { /* pas encore prêt */ }
      el.play().catch(() => {
        if (!vivant || el.muted) return;
        // son refusé sans geste : on joue muet et la page propose un clic
        el.muted = true;
        s.sonBloque(true);
        void el.play().catch(() => { /* rien */ });
      });
    });
    return () => { vivant = false; el.onloadedmetadata = null; s.pool.rendre(el); };
  }, [asset, boucle, son, cadrage, s, essai]);
  return (
    <div ref={hote} className="so-lecteur">
      {absente && <MediaAbsent asset={asset} />}
    </div>
  );
}

function SceneVideo({ scene, miniature }: { scene: Extract<Scene, { type: 'video' }>; n: number; miniature: boolean }) {
  const s = useContext(ContexteServices);
  if (miniature || !s) return <div className="so-vignette-media"><span className="so-micro">VIDÉO · {scene.asset}</span></div>;
  return (
    <div className="so-streamer">
      <LecteurVideo asset={scene.asset} boucle={scene.boucle !== false} son={!!scene.son} cadrage={scene.cadrage ?? 'auto'} surFin={() => s.finVideo(scene.asset)} />
      {scene.legende && <div className="so-legende">{scene.legende}</div>}
    </div>
  );
}

function SceneImage({ scene, miniature }: { scene: Extract<Scene, { type: 'image' }>; miniature: boolean }) {
  const s = useContext(ContexteServices);
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let vivant = true;
    if (s) void s.medias.resoudre(scene.asset).then((u) => { if (vivant) setUrl(u); });
    return () => { vivant = false; };
  }, [scene.asset, s]);
  if (miniature || !s) return <div className="so-vignette-media"><span className="so-micro">IMAGE · {scene.asset}</span></div>;
  return (
    <div className="so-streamer">
      {url && <img className="so-image" src={url} alt={scene.legende ?? scene.asset} />}
      {url === null && <MediaAbsent asset={scene.asset} />}
      {scene.legende && <div className="so-legende">{scene.legende}</div>}
    </div>
  );
}

// ── vote ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Couleur (jeton) de la i-ième option. */
export const JETONS_OPTIONS = ['--ort', '--cy', '--vert-pale', '--rampe-1', '--fam-cible', '--fam-scene', '--rampe-3', '--gink'];

export function pourcentages(options: { cle: string }[], r: Record<string, number> | undefined): number[] {
  const v = options.map((o) => Math.max(0, r?.[o.cle] ?? 0));
  const total = v.reduce((a, b) => a + b, 0);
  return v.map((x) => (total > 0 ? Math.round((x / total) * 100) : 0));
}

function SceneVote({ scene, miniature }: { scene: Extract<Scene, { type: 'vote' }>; miniature: boolean }) {
  const s = useContext(ContexteServices);
  const r = useRestant();
  useImage(scene.phase === 'decompte');
  const pct = pourcentages(scene.options, scene.resultats);
  const max = Math.max(1, ...pct);
  const barres = useRef<(HTMLDivElement | null)[]>([]);
  const revele = scene.phase === 'revele';
  const gagnant = revele ? scene.options.findIndex((o) => o.cle === scene.gagnant) : -1;
  useEffect(() => {
    if (!revele || gagnant < 0 || miniature) return;
    const el = barres.current[gagnant];
    const c = s?.calque();
    if (!el || !c) return;
    const b = el.getBoundingClientRect(), p = el.closest('.so-1080')?.getBoundingClientRect();
    if (!p) return;
    c.celebrer((b.left + b.width / 2 - p.left) / p.width, (b.top - p.top) / p.height, getComputedStyle(el).backgroundColor);
  }, [revele, gagnant, miniature, s]);
  return (
    <div className="so-vote">
      <div className="so-vote-tete">
        <div className="so-vote-question">{scene.question}</div>
        <div className="so-vote-etat">
          {scene.phase === 'ouvert' && <><span className="so-micro">VOTEZ !</span>{r && <span className="f-disp so-chiffres">{mmssRebours(r.restant)}</span>}</>}
          {scene.phase === 'decompte' && <span className="so-micro so-pulse">ET LE GAGNANT EST…</span>}
          {revele && gagnant >= 0 && <span className="so-vote-gagnant" style={{ color: `var(${JETONS_OPTIONS[gagnant % JETONS_OPTIONS.length]})` }}>★ {scene.options[gagnant].libelle}</span>}
          {revele && gagnant < 0 && <span className="so-micro">ÉGALITÉ</span>}
        </div>
      </div>
      <div className="so-vote-barres">
        {scene.options.map((o, i) => {
          const jeton = `var(${JETONS_OPTIONS[i % JETONS_OPTIONS.length]})`;
          const tremble = scene.phase === 'decompte' ? 0.55 + Math.random() * 0.6 : 1;
          const h = revele ? (i === gagnant ? 1 : (pct[i] / max) * 0.55) : Math.min(1, (pct[i] / max) * tremble);
          return (
            <div key={o.cle} className={'so-vote-col' + (revele && i !== gagnant ? ' terne' : '') + (i === gagnant ? ' gagne' : '')}>
              <div className="so-vote-pct f-disp so-chiffres">{scene.phase === 'decompte' ? '??' : pct[i]}%</div>
              <div className="so-vote-puits">
                <div ref={(el) => { barres.current[i] = el; }} className="so-vote-barre" style={{ height: `${Math.max(1, h * 100)}%`, background: jeton }} />
              </div>
              <div className="so-vote-lib" style={{ color: jeton }}>{o.libelle}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── chrono géant ─────────────────────────────────────────────────────────────────────────────────────────────────

function SceneChrono({ scene }: { scene: Extract<Scene, { type: 'chrono' }> }) {
  const r = useRestant();
  const restant = r?.restant ?? scene.duree;
  const duree = r?.duree ?? scene.duree;
  const fin = restant <= 10;
  return (
    <div className={'so-chrono' + (fin ? ' fin' : '')}>
      {scene.titre && <div className="so-micro so-chrono-titre">{scene.titre}</div>}
      <div className="so-chrono-temps f-disp so-chiffres">{mmssRebours(restant)}</div>
      <div className="so-chrono-piste"><div className="so-chrono-jauge" style={{ width: `${duree > 0 ? Math.max(0, Math.min(1, restant / duree)) * 100 : 0}%` }} /></div>
    </div>
  );
}

// ── titre / carton ───────────────────────────────────────────────────────────────────────────────────────────────

function SceneTitre({ scene }: { scene: Extract<Scene, { type: 'titre' }> }) {
  const long = scene.titre.length > 40;
  return (
    <div className="so-titre">
      {scene.surtitre && <div className="so-micro so-titre-sur">{scene.surtitre}</div>}
      <div className={long ? 'so-titre-texte' : 'so-titre-texte f-disp'} style={{ fontSize: long ? (scene.titre.length > 120 ? 58 : 72) : tailleTitre(scene.titre, 190, 130, 96) }}>{scene.titre}</div>
      <div className="so-rampe" />
      {scene.sousTitre && <div className="so-titre-sous">{scene.sousTitre}</div>}
    </div>
  );
}
