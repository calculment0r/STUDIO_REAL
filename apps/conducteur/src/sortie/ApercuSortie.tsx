// Vignette 16:9 de la régie : la scène que la sortie dit RÉELLEMENT montrer (present.vue), en miniature — sans
// vidéo ni calque (ils ne vivent que sur la machine du projecteur), avec le type de scène et le mode (auto / tenu).
// Sans retour de la sortie (fermée, ou sortie d'une version sans `vue`), c'est la scène publiée qui est dessinée.
// Bandeaux :
//   écart (ambre)        demandé : <type publié> · affiché : <type vu>   — la sortie ne suit pas depuis plus de 2 s
//   sortie périmée       la sortie annonce une autre version du protocole : bouton « Recharger la sortie »
import { useMemo } from 'react';
import { rechargerSortie, relacherScene, useSortie } from './relais';
import { ContexteTemps, Fondus, Scene1080 } from './scenes';
import { VERSION_SORTIE, type TypeScene } from './protocole';
import './sortie.css';

const NOMS: Record<TypeScene, string> = {
  noir: 'noir', 'accueil-qr': 'QR d’accueil', streamer: 'direct', vote: 'vote', chrono: 'chrono', titre: 'titre', image: 'image', video: 'vidéo', page: 'page',
};
const nom = (t: TypeScene | null | undefined): string => (t ? NOMS[t] : '—');

export function ApercuSortie({ className }: { className?: string }) {
  const { scene, sceneVue, sceneVueComplete, ecart, versionSortie, buildSortie, refus, n, fondu, etat, heureEtat, mode, fenetre, sortie } = useSortie();
  const temps = useMemo(() => ({ etat, heureEtat, maintenantRegie: () => Date.now() }), [etat, heureEtat]);
  const connectee = fenetre === 'connectee';
  const perimee = fenetre !== 'fermee' && versionSortie !== null && versionSortie !== VERSION_SORTIE;
  // la scène VUE quand la sortie la dit (≥ v2) ; sinon la scène publiée
  const dessinee = connectee && !perimee ? sceneVueComplete : scene;
  const typeMontre = connectee ? sceneVue : scene?.type ?? null;
  return (
    <div className={'so-apercu' + (className ? ' ' + className : '')} title="Sortie écran scène">
      <ContexteTemps.Provider value={temps}>
        <Scene1080>
          <Fondus scene={dessinee} n={n} fondu={Math.min(fondu, 400)} miniature />
        </Scene1080>
      </ContexteTemps.Provider>
      {perimee ? (
        <div className="so-apercu-bandeau perimee" role="alert">
          <span>sortie périmée · protocole v{versionSortie}{buildSortie ? ' · ' + buildSortie : ''}</span>
          <button type="button" onClick={rechargerSortie}>Recharger la sortie</button>
        </div>
      ) : connectee && ecart ? (
        <div className="so-apercu-bandeau" role="status">
          <span>demandé : {nom(scene?.type)} · affiché : {nom(sceneVue)}{refus?.recu ? ' · refus : ' + refus.recu : ''}</span>
          {refus && <button type="button" onClick={rechargerSortie}>Recharger la sortie</button>}
        </div>
      ) : null}
      <div className="so-apercu-legende">
        <span><b>{nom(typeMontre)}</b>{sortie?.secours ? ' · secours' : ''}</span>
        {mode === 'manuel'
          ? <span className="manuel" style={{ pointerEvents: 'auto', cursor: 'pointer' }} onClick={relacherScene} title="Rendre la sortie à la lecture">tenue · rendre</span>
          : <span>{connectee ? 'auto' : fenetre === 'ouverte' ? 'ouverte' : 'fermée'}</span>}
      </div>
    </div>
  );
}
