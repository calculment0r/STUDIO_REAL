// Scène native « visio » de la sortie écran scène : la disposition de prototypes/figurants/pages/visio/scene.html
// (deux cadres côte à côte, étiquettes en bas à gauche), plus la disposition « plein » (un poste en plein écran, la
// ministre au bloc 6 d'Écho). Chaque cadre lit le flux de son poste dans le registre flux-visio.ts, rempli par les
// liaisons WebRTC de visio-rtc.ts ; tant qu'il n'y en a pas, la mire de flux/mire.ts (bande de latence) et « connexion… ».
// Son : un poste n'est entendu sur la sono que si `son` est vrai (Franck, dans la salle, est coupé par défaut). Si le
// navigateur refuse le son sans geste, la vidéo joue muette et le son revient au premier geste sur la page.
import { useEffect, useRef } from 'react';
import { dessinerMire } from '../flux/mire';
import { useFluxVisio } from './flux-visio';
import type { PosteVisio, Scene } from './protocole';

type SceneVisio = Extract<Scene, { type: 'visio' }>;

/** Mire d'attente d'un cadre : fond du thème et bande de latence (heure locale) de flux/mire.ts. */
function MireVisio() {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = toile.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const fond = getComputedStyle(c).getPropertyValue('--well2').trim();
    let raf = 0;
    const dessiner = () => {
      g.fillStyle = fond;
      g.fillRect(0, 0, c.width, c.height);
      dessinerMire(g, c.width, c.height, Date.now());
      raf = requestAnimationFrame(dessiner);
    };
    raf = requestAnimationFrame(dessiner);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={toile} className="so-visio-mire" width={640} height={360} />;
}

function Cadre({ poste, miniature }: { poste: PosteVisio; miniature: boolean }) {
  const flux = useFluxVisio(poste.id);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (v.srcObject !== flux) v.srcObject = flux;
    v.muted = !poste.son;
    if (!flux) return;
    let attente: (() => void) | null = null;
    void v.play().catch(() => {
      // son refusé sans geste : on joue muet plutôt que pas du tout, et le son revient au premier geste
      v.muted = true;
      void v.play().catch(() => { /* rien */ });
      if (!poste.son) return;
      attente = () => { v.muted = false; void v.play().catch(() => { v.muted = true; }); };
      document.addEventListener('pointerdown', attente, { once: true });
      document.addEventListener('keydown', attente, { once: true });
    });
    return () => {
      if (attente) { document.removeEventListener('pointerdown', attente); document.removeEventListener('keydown', attente); }
    };
  }, [flux, poste.son]);
  return (
    <div className="so-visio-cadre" data-poste={poste.id}>
      {!miniature && <video ref={video} className={'so-visio-video' + (flux ? ' on' : '')} playsInline autoPlay muted={!poste.son} />}
      {(!flux || miniature) && (
        <div className="so-visio-attente">
          {!miniature && <MireVisio />}
          <span className="so-micro">{miniature ? 'VISIO' : 'connexion…'}</span>
        </div>
      )}
      <span className="so-visio-etiquette f-disp">{poste.nom}</span>
    </div>
  );
}

export function SceneVisio({ scene, miniature }: { scene: SceneVisio; miniature: boolean }) {
  const plein = scene.disposition === 'plein' ? scene.postes.find((p) => p.id === scene.plein) ?? scene.postes[0] : null;
  const montres = plein ? [plein] : scene.postes;
  return (
    <div className={'so-visio ' + (plein ? 'plein' : 'cote')} style={{ gridTemplateColumns: `repeat(${montres.length}, 1fr)` }}>
      {montres.map((p) => <Cadre key={p.id} poste={p} miniature={miniature} />)}
    </div>
  );
}
