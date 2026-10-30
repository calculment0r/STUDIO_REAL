// Aperçu en direct de ce qu'un acteur montrera (inspecteur, section ENVOIS ; vignette au survol d'un acteur) :
//   - téléphone (public, comédien, téléphone nommé) : le VRAI écran de l'application téléphone (packages/ui-telephone,
//     composants purs), rendu en taille réduite, sans réseau ni média ;
//   - sortie (écran scène) : la vignette 16:9 de la sortie (sortie/scenes.tsx, lue telle quelle) pour les scènes
//     natives ; mur, visio, flux vidéo : une carte qui dit l'écran et ses réglages (ils ne sont pas encore natifs) ;
//   - agent ou machine : une carte texte (ce qui partira).
import { memo, useMemo } from 'react';
import { CAPACITES_NEUTRES, EcranTelephone, type MediasEcran, type VueEcran } from '@studio-real/ui-telephone';
import '@studio-real/ui-telephone/telephone.css';
import type { Acteur } from '@studio-real/modele';
import { RenduScene, Scene1080 } from '../sortie/scenes';
import type { Scene } from '../sortie/protocole';
import '../sortie/sortie.css';
import './acteurs.css';

const MEDIAS: MediasEcran = { video: null, url: () => null, repli: true };
const LETTRES = ['A', 'B', 'C', 'D', 'E', 'F'];

const texte = (v: unknown, d = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : d);
const nombre = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const textes = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Scène de la sortie pour un écran envoyé à l'écran scène ; null si l'écran n'est pas (encore) une scène native. */
export function sceneDeVue(ecran: string, params: Record<string, unknown>, titreProjet?: string): Scene | null {
  switch (ecran) {
    case 'noir': return { type: 'noir' };
    case 'accueil-qr': return { type: 'accueil-qr', adresse: 'https://studio-real.fr/salle', titre: texte(params.titre, titreProjet ?? 'Studio Real'), consigne: texte(params.consigne, 'Scannez pour entrer') };
    case 'titre': return { type: 'titre', titre: texte(params.titre, '—'), surtitre: texte(params.surtitre) || undefined, sousTitre: texte(params.sousTitre) || undefined };
    case 'image': return { type: 'image', asset: texte(params.asset, '—'), legende: texte(params.legende) || undefined };
    case 'video': case 'flux-video':
      return { type: 'video', asset: texte(params.asset, ecran === 'flux-video' ? 'flux vidéo' : '—'), boucle: params.boucle !== false, legende: texte(params.legende) || undefined };
    case 'chrono': return { type: 'chrono', duree: nombre(params.duree) ?? 60, titre: texte(params.titre) || undefined };
    case 'vote': {
      const phase = params.phase === 'decompte' || params.phase === 'revele' ? params.phase : 'ouvert';
      return { type: 'vote', question: texte(params.question, 'Question'), options: textes(params.reponses).slice(0, 6).map((libelle, i) => ({ cle: LETTRES[i]!, libelle })), phase };
    }
    case 'streamer': return { type: 'streamer', bandeau: texte(params.bandeau) || undefined };
    case 'page': return { type: 'page', url: texte(params.url, 'about:blank') };
    default: return null;
  }
}

/** Écran du téléphone, rendu par l'application téléphone elle-même (390 × 844, mis à l'échelle). */
export const ApercuTelephone = memo(function ApercuTelephone({ ecran, params, largeur = 104 }: { ecran: string; params: Record<string, unknown>; largeur?: number }) {
  const vue = useMemo<VueEcran>(() => ({
    ecran, params, source: 'vue', vseq: 1, recue: 0, pseudo: 'spectateur', erreurPseudo: null, vote: null, choix: null,
    textes: [], touches: [], enAvant: null, appel: 'sonne', son: false, enLigne: true, chargement: null,
  }), [ecran, params]);
  const k = largeur / 390;
  return (
    <div className="ap-tel" data-theme="dark" style={{ width: largeur, height: Math.round(844 * k) }} aria-label={'aperçu téléphone : ' + ecran}>
      <div className="ap-tel-ecran" style={{ transform: `scale(${k})` }} inert>
        <div className="tl-app">
          <EcranTelephone vue={vue} agir={() => {}} capacites={CAPACITES_NEUTRES} medias={MEDIAS} />
        </div>
      </div>
    </div>
  );
});

/** Écran scène : la vignette de la sortie, ou une carte pour les écrans pas encore natifs (mur, visio…). */
export const ApercuScene = memo(function ApercuScene({ ecran, params, titreProjet, largeur = 200 }: { ecran: string; params: Record<string, unknown>; titreProjet?: string; largeur?: number }) {
  const scene = useMemo(() => sceneDeVue(ecran, params, titreProjet), [ecran, params, titreProjet]);
  return (
    <div className="ap-scene" style={{ width: largeur, height: Math.round(largeur * 9 / 16) }} aria-label={'aperçu écran scène : ' + ecran}>
      {scene
        ? <Scene1080><RenduScene scene={scene} n={0} miniature /></Scene1080>
        : <CarteEcran ecran={ecran} params={params} />}
    </div>
  );
});

/** Carte texte : l'écran et ses réglages principaux (agents, écrans pas encore natifs). */
export function CarteEcran({ ecran, params }: { ecran: string; params: Record<string, unknown> }) {
  const lignes = Object.entries(params).slice(0, 5).map(([k, v]) => k + ' : ' + (typeof v === 'string' ? v : JSON.stringify(v)));
  return (
    <div className="ap-carte">
      <span className="ap-carte-ecran">{ecran}</span>
      {lignes.map((l, i) => <span key={i} className="ap-carte-ligne">{l}</span>)}
    </div>
  );
}

/** Aperçu selon le rendu de l'acteur. `vue` null : rien encore (carte vide). */
export function ApercuActeur({ acteur, vue, titreProjet, petit }: { acteur: Acteur | undefined; vue: { ecran: string; params: Record<string, unknown> } | null; titreProjet?: string; petit?: boolean }) {
  if (!vue) return <div className="ap-vide">rien encore</div>;
  if (acteur?.rendu === 'telephone') return <ApercuTelephone ecran={vue.ecran} params={vue.params} largeur={petit ? 64 : 104} />;
  if (acteur?.rendu === 'sortie') return <ApercuScene ecran={vue.ecran} params={vue.params} titreProjet={titreProjet} largeur={petit ? 128 : 200} />;
  return <div className="ap-externe"><CarteEcran ecran={vue.ecran} params={vue.params} /></div>;
}
