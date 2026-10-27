// Catalogue d'assets de démonstration (ASSETS, AG, AT, AN de conducteur-core.js), au format d'échange
// `CategorieAssets` de @studio-real/modele : { k, n, items: [nom, détail, durée_s][] }.
import type { CategorieAssets, TypePiste } from '@studio-real/modele';

export const ASSETS_DEMO: CategorieAssets[] = [
  { k: 'son', n: 'Sons', items: [['ouverture.wav', 'stéréo · 48 kHz', 148], ['pluie_toit.wav', 'ambiance', 70], ['cloche.wav', 'effet', 4], ['montee_climax.wav', 'musique', 238], ['souffle.wav', 'effet', 22], ['salut.wav', 'musique', 118]] },
  { k: 'lx', n: 'Lumières · mémoires', items: [['LX 01 · Aube', '45 %', 30], ['LX 12 · Noir salle', '0 %', 22], ['LX 20 · Douche centre', '80 %', 60], ['LX 31 · Vague bleue', '100 %', 46], ['LX 40 · Strobe', '3 Hz', 28], ['LX 99 · Salut', '90 %', 118]] },
  { k: 'video', n: 'Vidéos · écran de scène', items: [['generique.mp4', '1080p', 48], ['pluie_ville.mp4', '1080p', 130], ['carte_metro.mp4', '4K', 35], ['credits.mp4', '1080p', 90]] },
  { k: 'img', n: 'Images', items: [['affiche.png', '4K', 20], ['plan_salle.png', 'A3', 20], ['visage_milo.jpg', '1080p', 20]] },
  { k: 'txt', n: 'Textes · consignes', items: [['Où doit-il aller ?', 'question', 20], ['Garde-le pour toi', 'message privé', 12], ['Va vers la boulangerie', 'streamer', 15], ['Rallumez vos téléphones', 'salle', 20]] },
  { k: 'role', n: 'Rôles et équipes', items: [['Milo · streamer', '1 personne', 0], ['Superviseur', '1 personne', 0], ['Corbeaux', '36 joueurs', 0], ['Lucioles', '35 joueurs', 0]] },
  { k: 'tel', n: 'Écrans téléphone', items: [['Vote à 3 choix', 'écran type', 30], ['Clavier libre', 'écran type', 30], ['Réactions', 'écran type', 30], ['Patientez', 'écran type', 30]] },
  { k: 'osc', n: 'Commandes OSC · MIDI', items: [['/lx/12', 'osc', 4], ['/qlab/cue/12', 'osc', 4], ['note C3 · canal 1', 'midi', 4]] },
];

/** Pictogrammes des catégories (tracés SVG 24 × 24 du design). */
export const PICTO_ASSET: Record<string, string> = {
  son: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  lx: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z',
  video: 'M3 6h13v12H3zM16 10l5-3v10l-5-3',
  img: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6',
  txt: 'M5 6h14M5 10h14M5 14h9M5 18h6',
  role: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 21c.8-4 3.6-6 7-6s6.2 2 7 6',
  tel: 'M8 2h8v20H8zM11 18h2',
  osc: 'M2 12h4l3-7 4 14 3-9 2 2h4',
  notes: 'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h6',
  curve: 'M3 17c4 0 5-10 9-10s5 10 9 10',
};

/** Couleur (jeton) d'une catégorie d'assets. */
export const couleurAsset = (k: string): string => `var(--asset-${k in PICTO_ASSET ? k : 'img'})`;

/** Piste de la conduite où se pose un asset de cette catégorie (null : les rôles se posent sur la planche). */
export const PISTE_DE_ASSET: Record<string, TypePiste | null> = { son: 'son', lx: 'lx', osc: 'lx', video: 'video', img: 'video', txt: 'txt', tel: 'tel', role: null };

/** Type d'étape créé quand l'asset est lâché sur la planche. */
export const ETAPE_DE_ASSET: Record<string, string> = { son: 'k:son', lx: 'k:lum', osc: 's3', video: 's1', img: 's1', txt: 'x6', tel: 'u3', role: 'c1' };

/** Types de pistes : [nom, description] (TT du design ; la couleur est le jeton --piste-<type>). */
export const TYPES_PISTE: Record<TypePiste, [string, string]> = {
  son: ['Son', 'Pistes son posées sur le temps'],
  lx: ['Lumière · cues', 'Mémoires de la console lumière'],
  video: ['Écran de scène', 'Vidéos et images projetées'],
  tel: ['Téléphones', 'Écrans poussés au public'],
  txt: ['Textes', 'Consignes, surtitres, messages'],
  notes: ['Notes de régie', 'Repères écrits pour l’équipe'],
  curve: ['Courbe libre', 'Une intensité dessinée à la main'],
  secu: ['Sécurité', 'Alertes avant strobe, fumée, entrées de public'],
};
