// Jetons de couleur des aperçus de blocs : port fidèle de `pal()` et de la table LIGHT de conducteur-core.js.
// Les aperçus sont dessinés sur <canvas> : ils ne lisent pas le CSS, ils lisent cette table, déclinée par thème.
// C'est la seule source de couleurs du dossier `blocs` (aucune couleur en dur ailleurs).

export type ThemeApercu = 'sombre' | 'clair';
export type Palette = Record<string, string>;

/** Couleurs des familles (thème sombre), comme `FC` du design. */
export const COULEURS_FAMILLES = {
  trig: '#e59578',
  flow: '#b9cfd8',
  data: '#78b08f',
  cible: '#d9a486',
  fx: '#e0674a',
  ui: '#f0b49b',
  scene: '#8fa5ad',
  gate: '#d47a5c',
  deroule: '#8fa5ad',
} as const;

/** Table de correspondance sombre → clair (`LIGHT` du design). */
export const CLAIR: Record<string, string> = {
  '#b9cfd8': '#2c5363',
  '#f0b49b': '#a3502f',
  '#e59578': '#b8492e',
  '#d9a486': '#7a3a22',
  '#78b08f': '#24613f',
  '#8fa5ad': '#4a5f66',
  '#d47a5c': '#a3502f',
  '#e0674a': '#b8492e',
  '#a3aea8': '#3a4440',
  '#76878e': '#4a5f66',
};

/** Couleur d'accent déclinée pour le thème clair (identique si absente de la table). */
export const versClair = (hex: string): string => CLAIR[hex.toLowerCase()] ?? hex;

/** Couleur pleine utilisée par le bloc « couleur » (x1) : c'est la valeur du réglage, pas un jeton. */
export const COULEUR_DEMO_TELEPHONE = '#7d5bd6';

const PSEUDOS = ['#f0b49b', '#e59578', '#d47a5c', '#a3502f', '#78b08f', '#3f9a6a', '#2f6b4a', '#b9cfd8', '#8fa5ad', '#d9a486', '#c98b6b', '#9fc4ae'];

const CACHE: Partial<Record<ThemeApercu, Palette>> = {};

/** Palette complète des aperçus pour un thème (port de `pal(th)`). */
export function palette(theme: ThemeApercu): Palette {
  const deja = CACHE[theme];
  if (deja) return deja;
  const L = theme === 'clair';
  const C: Palette = {
    '--bg': L ? '#dcdbd3' : '#070a08',
    '--panel': L ? '#f5f4f0' : '#0f1311',
    '--panel2': L ? '#cfcec5' : '#141a17',
    '--panel3': L ? '#bdbcb2' : '#222a26',
    '--ink': L ? '#141a17' : '#e6eae7',
    '--ink2': L ? '#3a4440' : '#a3aea8',
    '--ink3': L ? '#59635e' : '#7f8b86',
    '--cy': L ? '#2c5363' : '#b9cfd8',
    '--or': L ? '#b8492e' : '#e0674a',
    '--grn': L ? '#24613f' : '#2f6b4a',
    '--grn2': L ? '#24613f' : '#78b08f',
    '--amb': L ? '#a3502f' : '#f0b49b',
    '--rouge': L ? '#a3502f' : '#e0674a',
    '--line': L ? 'rgba(24,34,29,.22)' : 'rgba(185,207,216,.2)',
    '--line-amb': 'rgba(229,149,120,.6)',
    '--line-cy': 'rgba(185,207,216,.5)',
    '--dot': L ? 'rgba(24,34,29,.1)' : 'rgba(185,207,216,.1)',
    '--dot-hi': L ? 'rgba(24,34,29,.25)' : 'rgba(185,207,216,.28)',
    '--coral-1': '#f0b49b',
    '--coral-2': '#e59578',
    '--coral-3': '#d47a5c',
    '--spec-1': '#24543b',
    '--spec-2': '#2f6b4a',
    '--spec-3': '#78b08f',
    '--spec-4': '#f0b49b',
    '--black': '#000',
    '--veil': L ? 'rgba(233,232,226,.75)' : 'rgba(10,13,11,.75)',
    '--on-or': L ? '#fdf3ee' : '#170c08',
    '--on-amb': L ? '#fdf3ee' : '#170c08',
    '--on-grn': '#e6f1ea',
    '--on-rouge': '#fdf3ee',
    '--salle-noir': L ? '#1a1f1c' : '#050706',
    '--titre-clair': '#f3efe8',
    '--titre-sombre': '#170c08',
    '--exec': L ? '#141a17' : '#e6eae7',
    '--t-num': '#78b08f',
    '--t-txt': '#b9cfd8',
    '--t-bool': '#f0b49b',
    '--t-cible': '#d9a486',
    '--t-media': '#d47a5c',
    '--nd-ryt': '#b9cfd8',
    '--tel-demo': COULEUR_DEMO_TELEPHONE,
  };
  (Object.keys(COULEURS_FAMILLES) as (keyof typeof COULEURS_FAMILLES)[]).forEach((k) => {
    C['--fam-' + k] = L ? versClair(COULEURS_FAMILLES[k]) : COULEURS_FAMILLES[k];
  });
  PSEUDOS.forEach((v, i) => { C['--pseudo-' + (i + 1)] = v; });
  PSEUDOS.slice(0, 8).forEach((v, i) => { C['--eq-' + (i + 1)] = v; });
  CACHE[theme] = C;
  return C;
}
