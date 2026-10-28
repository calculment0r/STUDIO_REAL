// @studio-real/ui-telephone : l'application téléphone unique (public et téléphones nommés), réutilisée telle quelle par
// l'émulateur du Conducteur (rapport 2 §4.4). Trois couches : machine.ts (pure), ecrans/ (composants purs),
// transport.ts (WebSocket ou mémoire) ; telephone.ts les relie, App.tsx les affiche.
export * from './machine';
export * from './magasin';
export * from './transport';
export * from './identite';
export * from './medias';
export * from './capacites';
export * from './telephone';
export { App, type ProprietesApp } from './App';
export { COMPOSANTS_ECRANS, EcranTelephone, EcranInconnu, type Ecran, type MediasEcran, type ProprietesEcran } from './ecrans';
