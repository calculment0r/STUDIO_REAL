# @studio-real/theme

Le thème de l'interface STUDIO REAL : la **source unique** des jetons, des polices, de la base et des composants. Le
Conducteur (`apps/conducteur/src/theme/index.css`) l'importe comme dépendance de l'espace de travail npm ; les pages
statiques (prototypes, pages publiques) le prennent par chemin relatif. Le thème marche **sans build** (fichiers
relatifs) comme dans une app Vite. Une valeur se corrige ici, une seule fois : il n'existe plus de copie dans le Conducteur.

## Ce qu'il y a dedans

| Fichier | Rôle |
|---|---|
| `theme.css` | Point d'entrée des **pages** (prototypes, pages publiques) : noyau + `pages.css`. |
| `noyau.css` | Le noyau : polices, jetons, jetons dérivés, base, composants. Le Conducteur l'importe. |
| `polices.css` + `polices/` | Chakra Petch 300 → 700 et Azeret Mono (variable), libres, **licences OFL** à côté des fichiers. |
| `jetons-portail.css` | Jetons du portail (fonds, encres, `--f-ui`, `--f-mono`, `--f-disp`, espacements `--s1…--s6`). |
| `jetons.css` | La couche Studio Real, **sombre** (`:root`, `[data-theme="dark"]`) et **clair** (`[data-theme="light"]`) : couleurs, familles de blocs `--fam-*`, ombres et voiles. |
| `jetons-apercus.css` | Les couleurs des aperçus de blocs du Conducteur (`--apercu-*`, sombre et clair), lues par `apps/conducteur/src/theme/jetons.ts` ; hors `noyau.css` et `theme.css`. |
| `jetons-derives.css` | Noms composés, aucune couleur nouvelle : filets `--filet-12…`, fonds `--ort-14`, `--rec-22`…, rayons NL-16 `--nl-7`, `--nl-10`, `--nl-16`. |
| `base.css` | Base commune (police, couleurs, barres de défilement, focus, `.f-disp`, `.f-micro`, `.chiffres`, animation `srp`). |
| `composants.css` | Le curseur (`input[type=range]`) et la tête de lecture du Conducteur ; puis des composants simples `sr-*`. |
| `pages.css` | Remises à zéro d'une page (contrôles nus, `[hidden]`, sélection, mouvement réduit). |
| `plein-ecran.css` | `html, body, #root` à 100 % sans défilement (une app plein écran, comme le Conducteur). |
| `format.js` | `mmss(125.7) → "02:05"`, `mmssSigne`, `romain` (le Conducteur garde son `format.ts` typé : une valeur se change des deux côtés). |
| `venus.js` | Charge Venus Rising (`polices/venus-rising.otf`, versionnée ici) dans une page statique. |

Les règles du design (à ne pas casser) : fond `--bg` `#0a0d0b`, rampe corail `--rampe-1 → --rampe-5`, verts profonds
`--gdeep` / `--gt`, accent `--ort` `#e0674a`, encre tech `--cy` `#b9cfd8`, filets en `box-shadow: inset` (jamais de
bordure), rayons NL-16 (6 → 16 px). Venus Rising pour les titres et **tous les chiffres** (`--f-disp`, `--f-chiffre`),
Chakra Petch pour le texte, Azeret Mono 7 → 9 px capitales pour les micro-étiquettes. Un chiffre qui change a une
largeur fixe et des chiffres tabulaires ; un temps s'écrit `MM:SS`, sans décimale. **Aucune couleur en dur** hors des
fichiers `jetons*.css` : il manque une couleur, on ajoute un jeton.

## Dans une page statique (sans build)

```html
<html lang="fr">                       <!-- sombre par défaut ; data-theme="light" pour le clair -->
<head>
  <link rel="stylesheet" href="../../packages/theme/theme.css">   <!-- chemin relatif depuis la page -->
  <script src="../../packages/theme/venus.js" defer></script>     <!-- facultatif -->
  <link rel="stylesheet" href="ma-page.css">
</head>
```

Puis, dans `ma-page.css`, rien que des jetons : `background: var(--tile); box-shadow: inset 0 0 0 1px var(--filet-14);
border-radius: var(--nl-10); color: var(--cy);`. Les temps : `import { mmss } from '../../packages/theme/format.js'`.

La page doit être servie par HTTP (les polices ne se chargent pas en `file://` dans tous les navigateurs). Le serveur
des figurants (`node prototypes/figurants/serveur/index.mjs`) et GitHub Pages servent la racine du dépôt : les
chemins relatifs y sont valides.

### Composants `sr-*`

```html
<div class="sr-marque"><span class="sr-marque-carre"></span>
  <span class="sr-marque-titres"><b class="sr-marque-nom">Studio Real</b><span class="sr-marque-sous">régie</span></span></div>
<span class="sr-micro">densité</span>                    <!-- micro-étiquette Azeret Mono capitales (.ort, .cy) -->
<span class="sr-chiffres sr-mmss cy">02:05</span>         <!-- chiffres tabulaires, largeur fixe -->
<button class="sr-bouton">Relance</button>               <!-- .plein (action), .on (choisi), .rec, .cy, .attend, .pret, .grand -->
<div class="sr-seg-groupe"><button class="sr-seg on">A</button><button class="sr-seg">B</button></div>
<input class="sr-champ" placeholder="…">                 <!-- .grand : 52 px, 16 px de texte (mobile) -->
<span class="sr-pastille gt">en ligne</span>             <!-- .ort, .gt, .cy, .rec, .plein -->
<i class="sr-point gt pulse"></i>
<section class="sr-panneau">…</section>                  <!-- aussi .sr-puits, .sr-flottant, .sr-toast -->
```

## Dans une app Vite

```json
// package.json de l'app : l'espace de travail npm (packages/*) crée le lien node_modules/@studio-real/theme
"dependencies": { "@studio-real/theme": "*" }
```

```css
/* apps/conducteur/src/theme/index.css */
@import '@studio-real/theme/noyau.css';
@import '@studio-real/theme/jetons-apercus.css';   /* seulement pour les aperçus de blocs */
@import '@studio-real/theme/plein-ecran.css';      /* si l'app occupe toute la fenêtre */
```

Vite résout les `url('./polices/…')`, les copie dans `dist/assets/` avec une empreinte et réécrit les URL (y compris avec
`--base ./`). Pour un `<link rel="preload">` d'une police dans une page HTML de l'app, pointer le fichier du paquet par un
chemin relatif (`href="../../packages/theme/polices/azeret-mono.ttf"`) : Vite le remplace par l'adresse finale. Les
licences `polices/*.txt` ne sont référencées par aucun CSS : l'app les recopie dans `dist/` si elle les redistribue
(le Conducteur le fait dans `vite.config.ts`). Pour Venus Rising, le Conducteur la charge à l'exécution
(`src/theme/polices.ts`, import `@studio-real/theme/polices/venus-rising.otf?url`) ; `venus.js` est fait pour les pages statiques.

## Venus Rising

La police est **versionnée dans ce paquet** (`polices/venus-rising.otf`), à la demande du propriétaire (commit 88e2925) :
elle fait partie du dépôt, de `dist/` et de GitHub Pages. Elle se charge à l'exécution (`venus.js` dans une page statique,
`polices.ts` dans le Conducteur) ; installée dans le système, `polices.css` la prend aussi par `local()`. Si le fichier
manque, repli Chakra Petch 700 : les éléments en `--f-disp` portent `font-weight: 700`. `venus.js` pose
`<html data-venus="oui|repli">`.
