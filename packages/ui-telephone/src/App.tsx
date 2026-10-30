// L'application téléphone : elle affiche l'écran que la machine dit de montrer, et c'est tout. La logique est dans
// machine.ts (pure), le câblage navigateur dans telephone.ts, les écrans dans ecrans/. L'émulateur du Conducteur ouvre
// cette même application (en iframe, `?emule=1`) : le bandeau « ÉMULÉ » le dit.
// Après chaque rendu, l'application dit à la machine ce qui est À L'ÉCRAN (`affiche`) : c'est l'accusé d'affichage
// (`in{k:'accuse'}`) et la base du battement `etat`.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { vueEcran, type Action } from './machine';
import type { Telephone } from './telephone';
import type { Capacites } from './capacites';
import { EcranTelephone, type MediasEcran } from './ecrans';

export interface ProprietesApp {
  telephone: Telephone;
  capacites: Capacites;
  /** bandeau « ÉMULÉ » (téléphone de l'émulateur du Conducteur) */
  emule?: boolean;
  /** titre de l'écran d'entrée (config.json) */
  titre?: string;
}

export function App({ telephone, capacites, emule = false, titre }: ProprietesApp) {
  const { magasin, prechargeur, video } = telephone;
  const etat = useSyncExternalStore(magasin.abonner, magasin.lire, magasin.lire);
  const vue = useMemo(() => {
    const v = vueEcran(etat);
    // l'écran d'entrée et l'attente portent le titre du spectacle
    return titre && (v.ecran === 'entree' || v.source === 'attente') ? { ...v, params: { titre, ...v.params } } : v;
  }, [etat, titre]);
  const agir = useMemo(() => (a: Action) => magasin.envoyer(a), [magasin]);
  const medias = useMemo<MediasEcran>(() => ({
    video,
    url: (asset, sources) => prechargeur?.url(asset, sources) ?? sources?.[0] ?? null,
    repli: prechargeur?.repli ?? true,
    debloquer: () => telephone.debloquer(),
  }), [video, prechargeur, telephone]);

  // accusé d'affichage : l'écran montré est dans le DOM
  useEffect(() => { magasin.envoyer({ a: 'affiche' }); }, [magasin, vue.vseq, vue.ecran, vue.source]);

  // flash demandé par la régie (fx)
  const [flash, setFlash] = useState(0);
  useEffect(() => telephone.surFlash(ms => {
    setFlash(ms);
    setTimeout(() => setFlash(0), ms);
  }), [telephone]);

  // téléphone nommé (pas de pseudo) : le premier toucher débloque vidéo, son et Wake Lock
  const premierToucher = etat.demanderPseudo ? undefined : () => telephone.debloquer();

  const horsLigne = !etat.enLigne || !etat.connecte;
  return (
    <div className={`tl-app${emule ? ' emule' : ''}`} data-ecran={vue.ecran} onPointerDown={premierToucher}>
      {emule && <div className="tl-bandeau-emule" aria-hidden="true">ÉMULÉ · {etat.personne}</div>}
      <EcranTelephone vue={vue} agir={agir} capacites={capacites} medias={medias} />
      {etat.refus?.fatal ? (
        <div className="tl-refus" role="alert">
          <span className="tl-et ort">connexion refusée</span>
          <p>{etat.refus.message}</p>
          <button type="button" className="tl-bouton" onClick={() => location.reload()}>Recharger</button>
        </div>
      ) : horsLigne && vue.ecran !== 'entree' ? (
        <div className="tl-reseau" role="status" aria-live="polite"><i />{etat.enLigne ? 'connexion…' : 'reconnexion…'}</div>
      ) : null}
      {flash > 0 && <div className="tl-flash" style={{ animationDuration: `${flash}ms` }} aria-hidden="true" />}
    </div>
  );
}
