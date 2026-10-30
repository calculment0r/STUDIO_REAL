// Le catalogue des écrans : un composant pur par écran de la machine (ECRANS). Un écran inconnu affiche une carte
// « écran non pris en charge » ; la machine, elle, l'accuse avec `refus:'invalide'` (la régie le voit).
import { estEcranConnu, type NomEcran } from '../machine';
import type { Ecran, ProprietesEcran } from './communs';
import { EcranVideo } from './video';
import {
  EcranAttente, EcranChoix, EcranCouleur, EcranEntree, EcranImage, EcranImageOnde, EcranMerci, EcranNoir, EcranNotification,
  EcranPhrases, EcranRegardez, EcranTexte, EcranVote,
} from './public';
import { EcranPrompteur, EcranVeille, EcranVisioAppel, EcranVoteCompteur } from './nommes';

export const COMPOSANTS_ECRANS: Record<NomEcran, Ecran> = {
  entree: EcranEntree,
  attente: EcranAttente,
  regardez: EcranRegardez,
  video: EcranVideo,
  phrases: EcranPhrases,
  vote: EcranVote,
  texte: EcranTexte,
  choix: EcranChoix,
  notification: EcranNotification,
  couleur: EcranCouleur,
  noir: EcranNoir,
  'image-onde': EcranImageOnde,
  merci: EcranMerci,
  prompteur: EcranPrompteur,
  'vote-compteur': EcranVoteCompteur,
  veille: EcranVeille,
  'visio-appel': EcranVisioAppel,
  image: EcranImage,
};

export function EcranInconnu({ vue }: ProprietesEcran) {
  return (
    <section className="tl-ecran tl-plein" role="alert">
      <div className="tl-carte-inconnu">
        <span className="tl-et ort">écran non pris en charge</span>
        <p>écran non pris en charge : <b>{vue.ecran}</b></p>
        <p className="tl-sous">Cette version de l’application ne sait pas l’afficher. La régie est prévenue.</p>
      </div>
    </section>
  );
}

/** L'écran de la vue : le composant du catalogue, ou la carte « non pris en charge ». La clé (vseq + écran) remet à
 *  zéro l'état local d'un écran (champ, chrono) quand une nouvelle vue arrive. */
export function EcranTelephone(p: ProprietesEcran) {
  // estEcranConnu (un Set) : jamais de clé héritée ("constructor"…) prise pour un écran
  const C = estEcranConnu(p.vue.ecran) ? COMPOSANTS_ECRANS[p.vue.ecran] : EcranInconnu;
  return <C key={`${p.vue.vseq}:${p.vue.ecran}`} {...p} />;
}

export * from './communs';
export * from './public';
export * from './nommes';
export { EcranVideo } from './video';
