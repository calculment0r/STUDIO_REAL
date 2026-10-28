// @studio-real/emulateur : de faux spectateurs pour répéter et tester sans vrais téléphones (rapport 2 §4.4, §4.5).
//
//   creerEmulateur({ projet, graine, population: { nombre: 120, melange: 'soiree' } })
//     ├─ SalleEmulee : le VRAI noyau du serveur de spectacle (Representation), en mémoire, sur une horloge émulée
//     │   (×1 à ×20 dans le Conducteur, instantanée sous vitest) ; la régie émulée y envoie ses `conduite`.
//     └─ téléphones émulés : la VRAIE machine d'état du téléphone (ui-telephone, `reduire`), reliée à la salle par
//         `transportMemoire()` (latence, perte, coupures simulées) :
//         · foule : agents sans rendu, comportement de leur profil (rapide, lent, distrait, déconnecté, iPhone muet,
//           4G salle pleine), arrivées et délais tirés des rotatifs de packages/modele/src/salle.ts, graine fixe ;
//         · vitrine : la vraie application (`apps/telephone?emule=1&id=…`) dans une iframe (`promouvoir`).
//
// Les signaux (pres, quorum, prets, votes, issue) sont ceux que le noyau calcule sur la salle : COMPTÉS sur les
// téléphones émulés, pas tirés d'une formule. `rejouer(journal)` rejoue une vraie soirée (journal JSONL du serveur).
// Pas fait (rapport 2 §4.4) : le branchement des agents sur un vrai serveur (essai de charge à 150 bots, rapport 5
// §4.8) ; les agents en Web Worker ; l'import des capacités d'un rapport du banc d'essai.
export * from './types';
export * from './alea';
export * from './horloge';
export * from './profils';
export { SalleEmulee, SESSION_REGIE, type OptionsSalle } from './salle';
export {
  APP_EMULEE, BATTEMENT_MS, TelephoneSalle, indexReponse, personneEmulee, sessionEmulee,
  type ContexteTelephone, type OptionsTelephone,
} from './agent';
export { creerEmulateur, type EmulateurSalle } from './emulateur';
export { lireJournal, rejouerJournal, type HoteRejeu } from './rejouer';
