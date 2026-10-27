// Vignette 16:9 de la régie : la scène PUBLIÉE vers la sortie (ce que le projecteur montre), en miniature — sans
// vidéo ni calque (ils ne vivent que sur la machine du projecteur), avec le type de scène et le mode (auto / tenu).
import { useMemo } from 'react';
import { relacherScene, useSortie } from './relais';
import { ContexteTemps, Fondus, Scene1080 } from './scenes';
import type { TypeScene } from './protocole';
import './sortie.css';

const NOMS: Record<TypeScene, string> = {
  noir: 'noir', 'accueil-qr': 'QR d’accueil', streamer: 'direct', vote: 'vote', chrono: 'chrono', titre: 'titre', image: 'image', video: 'vidéo', page: 'page',
};

export function ApercuSortie({ className }: { className?: string }) {
  const { scene, n, fondu, etat, heureEtat, mode, fenetre, sortie } = useSortie();
  const temps = useMemo(() => ({ etat, heureEtat, maintenantRegie: () => Date.now() }), [etat, heureEtat]);
  return (
    <div className={'so-apercu' + (className ? ' ' + className : '')} title="Sortie écran scène">
      <ContexteTemps.Provider value={temps}>
        <Scene1080>
          <Fondus scene={scene} n={n} fondu={Math.min(fondu, 400)} miniature />
        </Scene1080>
      </ContexteTemps.Provider>
      <div className="so-apercu-legende">
        <span><b>{scene ? NOMS[scene.type] : '—'}</b>{sortie?.secours ? ' · secours' : ''}</span>
        {mode === 'manuel'
          ? <span className="manuel" style={{ pointerEvents: 'auto', cursor: 'pointer' }} onClick={relacherScene} title="Rendre la sortie à la lecture">tenue · rendre</span>
          : <span>{fenetre === 'connectee' ? 'auto' : fenetre === 'ouverte' ? 'ouverte' : 'fermée'}</span>}
      </div>
    </div>
  );
}
