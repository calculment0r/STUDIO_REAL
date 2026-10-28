// Lecture des jetons de couleur du thème pour le code qui dessine sur <canvas> (aperçus de blocs) ou qui range des
// teintes dans des données (catalogue). La SEULE source des couleurs est le CSS du paquet @studio-real/theme :
//   - jetons.css : les familles de blocs (--fam-*) ;
//   - jetons-apercus.css : la palette des aperçus (--apercu-*).
// On lit ces deux fichiers tels quels (import ?raw) plutôt que getComputedStyle : le résultat ne dépend ni d'un
// document, ni du thème de la page (une galerie peut montrer le clair dans une page sombre), et il existe dès
// l'évaluation du module, y compris sous vitest où il n'y a pas de DOM. Aucune couleur n'est écrite dans le TypeScript.
import cssJetons from '@studio-real/theme/jetons.css?raw';
import cssApercus from '@studio-real/theme/jetons-apercus.css?raw';

export type NomTheme = 'sombre' | 'clair';
export type TableJetons = Readonly<Record<string, string>>;

/** Les déclarations « --nom: valeur » d'un fichier de jetons, rangées par thème (:root et [data-theme="dark"] → sombre). */
export function lireJetons(css: string): Record<NomTheme, TableJetons> {
  const sombre: Record<string, string> = {};
  const clair: Record<string, string> = {};
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, selecteur, corps] of sansCommentaires.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const cible = /\[data-theme=["']light["']\]/.test(selecteur) && !/:root/.test(selecteur)
      ? clair
      : /:root|\[data-theme=["']dark["']\]/.test(selecteur) ? sombre : null;
    if (!cible) continue;
    for (const decl of corps.split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      const nom = decl.slice(0, i).trim();
      if (nom.startsWith('--')) cible[nom] = decl.slice(i + 1).trim();
    }
  }
  return { sombre, clair };
}

const JETONS = lireJetons(cssJetons);
const APERCUS = lireJetons(cssApercus);

/** Un jeton de la couche Studio Real (jetons.css) pour un thème ; une erreur claire s'il n'existe pas. */
export function jeton(theme: NomTheme, nom: string): string {
  const v = JETONS[theme][nom];
  if (v === undefined) throw new Error('jeton absent de jetons.css : ' + nom);
  return v;
}

/** Tous les jetons --apercu-* d'un thème, nommés comme dans le design, sans le préfixe : « --bg », « --line-amb »… */
export function jetonsApercus(theme: NomTheme): Record<string, string> {
  const sortie: Record<string, string> = {};
  for (const [nom, valeur] of Object.entries(APERCUS[theme])) {
    if (nom.startsWith('--apercu-')) sortie['--' + nom.slice('--apercu-'.length)] = valeur;
  }
  return sortie;
}
