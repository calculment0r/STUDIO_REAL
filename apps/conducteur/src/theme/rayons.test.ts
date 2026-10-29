// Angles carrés : plus aucun `border-radius` écrit en dur dans l'interface globale. Chaque rayon lit l'un des trois
// jetons du thème (packages/theme/jetons.css : --rayon, --rayon-petit, --rayon-rond) ; seul `0` (un coin voulu droit
// dans un groupe) reste permis à côté d'eux. Hors périmètre, volontairement : la planche (src/planche/**), le calque
// PixiJS de la sortie (src/sortie/calque/**) et la galerie des blocs (src/blocs/Galerie.tsx, dessine des aperçus de la planche).
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..');
const SRC_CONDUCTEUR = join(DEPOT, 'apps', 'conducteur', 'src');
const EXCLUS = [
  join(SRC_CONDUCTEUR, 'planche'),
  join(SRC_CONDUCTEUR, 'sortie', 'calque'),
  join(SRC_CONDUCTEUR, 'blocs', 'Galerie.tsx'),
];
const RACINES = [
  join(DEPOT, 'packages', 'theme'),
  SRC_CONDUCTEUR,
  join(DEPOT, 'packages', 'ui-telephone', 'src'),
  join(DEPOT, 'apps', 'telephone', 'src'),
  join(DEPOT, 'apps', 'serveur-spectacle', 'pages'),
];
const EXTENSIONS = ['.css', '.html', '.ts', '.tsx'];

function fichiers(dossier: string, sortie: string[] = []): string[] {
  if (!existsSync(dossier)) return sortie;
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (EXCLUS.some(x => chemin === x || chemin.startsWith(x + sep))) continue;
    if (nom === 'node_modules' || nom === 'dist') continue;
    if (statSync(chemin).isDirectory()) fichiers(chemin, sortie);
    else if (EXTENSIONS.some(e => nom.endsWith(e)) && !/\.test\.tsx?$/.test(nom)) sortie.push(chemin);
  }
  return sortie;
}

/** Les jetons de rayon permis, et `0`. */
const JETON = /^(?:var\(--rayon(?:-petit|-rond)?\)|0)$/;

/** Découpe une valeur en coins (« var(--rayon) var(--rayon) 0 0 » → 4 morceaux), sans couper dans les parenthèses. */
function coins(valeur: string): string[] {
  const t: string[] = [];
  let cur = '', p = 0;
  for (const c of valeur.trim()) {
    if (c === '(') p++;
    if (c === ')') p--;
    if (/\s/.test(c) && p === 0) { if (cur) t.push(cur); cur = ''; } else cur += c;
  }
  if (cur) t.push(cur);
  return t;
}

/** Toutes les déclarations de rayon d'un texte (CSS, style en ligne d'une chaîne, objet de style React). */
export function rayonsEnDur(texte: string): string[] {
  const mauvais: string[] = [];
  for (const m of texte.matchAll(/(border(?:-(?:top|bottom)-(?:left|right))?-radius|borderRadius)\s*:\s*['"]?([^;}'",\n]+)/g)) {
    const valeur = m[2]!.trim();
    if (!coins(valeur).every(c => JETON.test(c))) mauvais.push(`${m[1]}: ${valeur}`);
  }
  return mauvais;
}

describe('angles carrés : jetons de rayon', () => {
  it('jetons.css définit --rayon, --rayon-petit et --rayon-rond', () => {
    const css = readFileSync(join(DEPOT, 'packages', 'theme', 'jetons.css'), 'utf8');
    for (const nom of ['--rayon', '--rayon-petit', '--rayon-rond']) expect(css, nom).toMatch(new RegExp(`^\\s*${nom}\\s*:`, 'm'));
  });

  it('le détecteur voit les valeurs en dur et accepte les jetons', () => {
    expect(rayonsEnDur('a { border-radius: 6px; }')).toEqual(['border-radius: 6px']);
    expect(rayonsEnDur('a { border-radius: var(--nl-7); }')).toHaveLength(1);
    expect(rayonsEnDur('a { border-radius: var(--rayon) var(--rayon) 6px 0; }')).toHaveLength(1);
    expect(rayonsEnDur('a { border-top-left-radius: 50%; }')).toHaveLength(1);
    expect(rayonsEnDur("style={{ borderRadius: 3 }}")).toHaveLength(1);
    expect(rayonsEnDur('a { border-radius: var(--rayon); } b { border-radius: 0 0 var(--rayon-petit) var(--rayon-petit); } c { border-radius: var(--rayon-rond); }')).toEqual([]);
    expect(rayonsEnDur("style={{ borderRadius: 'var(--rayon-petit)' }}")).toEqual([]);
  });

  it('aucun border-radius en dur hors planche, calque PixiJS et galerie des blocs', () => {
    const tous = RACINES.flatMap(r => fichiers(r));
    expect(tous.length).toBeGreaterThan(30);
    const fautes: string[] = [];
    for (const f of tous) for (const m of rayonsEnDur(readFileSync(f, 'utf8'))) fautes.push(`${relative(DEPOT, f)} → ${m}`);
    expect(fautes, 'rayons écrits en dur (utiliser var(--rayon), var(--rayon-petit) ou var(--rayon-rond))').toEqual([]);
  });
});
