// Chantier COLLAB : composants autonomes, à monter par la coquille (aucun n'est encore branché).
//   <Presence />                        en-tête : état de la liaison + pastilles des membres
//   <CurseursDistants zone projeter />  DANS le conteneur relatif de la planche ou de la conduite
//   <Discussion />                      panneau : chat de la salle
//   <Commentaires ancre? />             panneau : fils épinglés (étape, moment, instant)
//   <BoutonsVerrou moment? />           panneau ou en-tête : verrous personnels, mode Scène
//   <OuvrirProjet onOuvert? />          superposition : projets du serveur, import, LIVE, identité
//   useCollab(), useEmettreCurseur(zone, versMonde), actionsCollab
// Démarrage (main.tsx ou App) : `reprendreDerniereSalle()` rouvre la dernière salle si son jeton est connu.
export { Presence, STATUTS } from './Presence';
export { CurseursDistants } from './CurseursDistants';
export { Discussion } from './Discussion';
export { Commentaires } from './Commentaires';
export { ancreDeSelection, cleAncre, libelleAncre, useCommentairesSur, heureMinute, mmss } from './ancres';
export { BoutonsVerrou } from './BoutonsVerrou';
export { OuvrirProjet } from './OuvrirProjet';
export { useCollab, useEmettreCurseur, actionsCollab, type Collab } from './useCollab';
export { jetonCouleur, raisonLisible, type Ancre, type Commentaire, type Curseur, type Personne, type Verrou } from './protocole';
export { reprendreDerniereSalle, connecterSalle, deconnecterSalle, enregistrerSurServeur, versionsServeur, ouvrirVersionServeur } from '../etat/serveur';
