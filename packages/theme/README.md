# @studio-real/theme

Le thème de l'interface STUDIO REAL, celui du Conducteur (`apps/conducteur/src/theme/`, issu du design
`conception/conducteur/`), extrait en CSS autonome : il marche dans une page statique **sans build** (fichiers
relatifs) comme dans une app Vite. C'est une **copie fidèle** : aucune valeur n'a changé. Si le Conducteur change
une valeur, on la recopie ici (ou, mieux, le Conducteur pointe sur ce paquet).

## Ce qu'il y a dedans

| Fichier | Rôle |
|---|---|
| `theme.css` | Point d'entrée des **pages** (prototypes, pages publiques) : noyau + `pages.css`. |
| `noyau.css` | L'équivalent de `apps/conducteur/src/theme/index.css` (+ jetons dérivés). |
| `polices.css` + `polices/` | Chakra Petch 300 → 700 et Azeret Mono (variable), libres, **licences OFL** à côté des fichiers. |
| `jetons-portail.css` | Copie exacte : jetons du portail (fonds, encres, `--f-ui`, `--f-mono`, `--f-disp`, espacements `--s1…--s6`). |
| `jetons.css` | Copie exacte : la couche Studio Real, **sombre** (`:root`, `[data-theme="dark"]`) et **clair** (`[data-theme="light"]`). |
| `jetons-derives.css` | Noms composés, aucune couleur nouvelle : filets `--filet-12…`, fonds `--ort-14`, `--rec-22`…, rayons NL-16 `--nl-7`, `--nl-10`, `--nl-16`. |
| `base.css` | Base du Conducteur (police, couleurs, barres de défilement, focus, `.f-disp`, `.f-micro`, `.chiffres`, animation `srp`). |
| `composants.css` | Le curseur (`input[type=range]`) et la tête de lecture, copiés tels quels ; puis des composants simples `sr-*`. |
| `pages.css` | Remises à zéro d'une page (contrôles nus, `[hidden]`, sélection, mouvement réduit). |
| `plein-ecran.css` | `html, body, #root` à 100 % sans défilement (une app plein écran, comme le Conducteur). |
| `format.js` | `mmss(125.7) → "02:05"`, `mmssSigne`, `romain` (copie de `format.ts`). |
| `venus.js` | Charge Venus Rising **seulement si elle est présente en local**. |

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

```ts
// main.tsx
import '@studio-real/theme/noyau.css';        // ou le chemin relatif ../../packages/theme/noyau.css
import '@studio-real/theme/plein-ecran.css';  // si l'app occupe toute la fenêtre
```

Le paquet est un espace de travail npm (`packages/*`) : après son ajout, un `npm install` à la racine met
`package-lock.json` à jour et crée le lien `node_modules/@studio-real/theme` (sans lui, passer par le chemin relatif).
Vite résout les `url('./polices/…')` et copie les polices dans `dist/`. Pour Venus Rising, une app Vite garde son
chargeur (le Conducteur : `src/theme/polices.ts`, qui lit `/polices-privees/`) ; `venus.js` est fait pour les pages
statiques.

## Venus Rising

Sans licence connue : **jamais copiée** ici ni ailleurs dans le dépôt (`conception/conducteur/source/uploads/` est hors
git). Elle s'affiche si elle est installée dans le système (`local()` dans `polices.css`) ou si le fichier hors git est
présent à côté du dépôt et que la page charge `venus.js`. Sinon, repli Chakra Petch 700 : les éléments en `--f-disp`
portent `font-weight: 700`. `venus.js` pose `<html data-venus="oui|repli">`.
