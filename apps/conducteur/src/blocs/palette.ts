// Couleurs des aperçus de blocs : port fidèle de `pal()` et de la table LIGHT de conducteur-core.js (design).
// Les aperçus sont dessinés sur <canvas> : ils ne lisent pas le CSS de la page, ils lisent cette table, déclinée par thème.
// Les valeurs ne sont PAS ici : elles viennent du thème (@studio-real/theme), via theme/jetons.ts :
//   - les familles de blocs : jetons --fam-* de jetons.css ;
//   - le reste de la palette : jetons --apercu-* de jetons-apercus.css.
// Une couleur à changer se change dans le CSS du paquet, pas dans ce fichier (aucune couleur en dur dans `blocs`).
import { jeton, jetonsApercus } from '../theme/jetons';
import type { IdFamille } from './types';

export type ThemeApercu = 'sombre' | 'clair';
export type Palette = Record<string, string>;

const IDS_FAMILLES: readonly IdFamille[] = ['trig', 'flow', 'data', 'cible', 'fx', 'ui', 'scene', 'gate', 'deroule'];

/** Le jeton CSS d'une famille : --fam-<id>, sauf le déroulé qui porte --fam-autre. */
const jetonFamille = (id: IdFamille): string => '--fam-' + (id === 'deroule' ? 'autre' : id);

/** Couleur d'une famille de blocs pour un thème (valeur du jeton --fam-*). */
export const couleurFamille = (id: IdFamille, theme: ThemeApercu): string => jeton(theme, jetonFamille(id));

/** Couleurs des familles (thème sombre), comme `FC` du design. */
export const COULEURS_FAMILLES = Object.fromEntries(IDS_FAMILLES.map((id) => [id, couleurFamille(id, 'sombre')])) as Readonly<Record<IdFamille, string>>;

const CACHE: Partial<Record<ThemeApercu, Palette>> = {};

/** Palette complète des aperçus pour un thème (port de `pal(th)`). */
export function palette(theme: ThemeApercu): Palette {
  const deja = CACHE[theme];
  if (deja) return deja;
  const C: Palette = jetonsApercus(theme);
  IDS_FAMILLES.forEach((id) => { C['--fam-' + id] = couleurFamille(id, theme); });
  // les huit premières teintes de pseudo servent aussi d'égaliseur
  for (let i = 1; i <= 8; i++) C['--eq-' + i] = C['--pseudo-' + i];
  CACHE[theme] = C;
  return C;
}
