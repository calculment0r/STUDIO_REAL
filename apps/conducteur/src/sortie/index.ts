// Chantier SORTIE SCÈNE : la sortie écran scène (fenêtre séparée, projecteur, plein écran) pilotée par la régie.
// À monter par la coquille :
//   useRelaisSortie()          UNE fois (App) : traduit la lecture en scène et la publie (canal local + salle)
//   <BoutonSortieScene />      en-tête : ouvre / ramène la fenêtre de sortie ; pastille fermée / ouverte / connectée
//   <ApercuSortie />           panneau ou pupitre : vignette 16:9 de la scène en cours
// Commandes (pupitre, raccourcis) : publierScene, relacherScene, publierEvenement, configurerSortie, precharger,
// surFinVideo, ouvrirSortieScene. Page de sortie : sortie.html (src/sortie/main.tsx). Protocole : protocole.ts.
export { useRelaisSortie, brancherRelaisSortie } from './useRelaisSortie';
export { BoutonSortieScene, IcoSortieScene } from './BoutonSortieScene';
export { ApercuSortie } from './ApercuSortie';
export { ouvrirSortieScene, fermerSortieScene, adresseSortie } from './fenetre';
export {
  useSortie, publierScene, relacherScene, publierEvenement, configurerSortie, precharger, surFinVideo, sceneDeCommande, choisirSourceSortie,
  type CommandeScene, type EtatRelais, type EtatFenetre,
} from './relais';
export { adresseSortieDistante } from './salle';
export type { Scene, TypeScene, EvenementScene, ConfigSortie, Gabarit, SourceSpectacle } from './protocole';
export { poserFluxVisio } from './flux-visio';
