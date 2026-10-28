// Chantier BLOCS : point d'entrée public. Contrat utilisé par PLANCHE (voir apps/conducteur/ARCHITECTURE.md) :
//   CATALOGUE, trouverBloc(ty), <ApercuBloc ty k t actif params? />, <IconeBloc ty />.
export { CATALOGUE, FAMILLES, TY_NOUVEAUX, TY_FIGURANTS_IA, trouverBloc, trouverFamille, valeurReglage, formaterReglage, sortiesExec, rotatifsParDefaut } from './catalogue';
export { ApercuBloc, type ProprietesApercu } from './ApercuBloc';
export { IconeBloc, type ProprietesIcone } from './IconeBloc';
export { Galerie } from './Galerie';
export { APERCUS, LARGEUR_APERCU, HAUTEUR_APERCU, type DessinApercu, type OptionsApercu } from './apercus';
export { palette, couleurFamille, COULEURS_FAMILLES, type Palette, type ThemeApercu } from './palette';
export { simulation, abonner } from './boucle';
export type { Catalogue, CouleurTheme, DefBloc, Famille, IdFamille, Port, Reglage, TypePort } from './types';
