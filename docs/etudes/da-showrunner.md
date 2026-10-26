# La direction artistique Showrunner, adaptée à STUDIO_REAL

> Décision du propriétaire (26/10/2026) : « on prend le thème de Showrunner avec le canvas designé,
> les timelines qu'on a et tous les éléments UI ».
>
> Cette étude décrit précisément ce thème (relevé dans le dépôt Showrunner, privé, en lecture seule :
> `commun/tokens.css`, `commun/base.css`, `commun/shell.css`, `commun/*.css`, `musique/nodal.css`,
> `musique/musique.css`, `montage/montage.css`, `ideation/ideation.css`, `commun/tete.css`, `commun/wire.css`,
> études `musique_theme.md` et `preferences.md`, page de référence `character_factory/theme.html`), puis dit comment le porter
> sur les quatre surfaces de STUDIO_REAL. Le brief à coller dans Claude Design en est tiré :
> [`docs/brief-claude-design.md`](../brief-claude-design.md).
>
> Sources de référence (fichiers sources, jamais des captures) :
> - **la page de référence du thème** `character_factory/theme.html` de Showrunner : une page statique qui ne définit
>   **aucune couleur ni aucune fonte** et charge les mêmes CSS que l'application (nuancier, spécimens, barèmes, démos de
>   composants) — « modifier un jeton se voit ici immédiatement, il n'y a jamais deux vérités » ;
> - la règle mémoire `SUPERVISIO/00-PILOTAGE/memoire-claude/theme-showrunner-sliders-et-tetes.md` : **le fader et la tête
>   de lecture**, deux composants ratés plusieurs fois (§ 9 bis) ;
> - la pose du thème : `commun/theme-tot.js`, `commun/theme.js` (Showrunner) et `public/js/theme.js` (SUPERVISIO, règle
>   `data-salle`, § 10 bis).
>
> Déjà dans ce dépôt (`design/`) : `tokens.css` et `base.css` (copies **identiques octet pour octet** à celles de
> Showrunner), `curseur.css` (le fader), `tete.css` + `tete.js` (la tête et la règle), `theme-tot.js` + `theme.js` (la pose
> du thème avant la première peinture), Azeret Mono et Chakra Petch Light (OFL). Les limites de cette copie sont au § 12.
>
> Claude Design recevra un kit **`kit-theme-showrunner.zip`** (page de référence et ses assets, jetons, composants, canvas,
> nodal, timelines, polices, dossier SUPERVISIO) : ce zip est un **envoi privé**, il ne doit pas entrer dans ce dépôt public
> (il contient `character_factory/` et des polices sans licence connue).

---

## 1. L'esprit en une phrase

Un **banc de mesure de studio, la nuit** : fonds vert-noir presque neutres, **blocs pleins, filets fins, chiffres
larges** ; une seule couleur d'action (l'orange) ; une voix « machine » (mono minuscule, capitales très espacées)
qui étiquette tout, une voix « affichage » (Venus Rising, capitales larges) qui nomme, et une prose en bas de casse
pour expliquer. Les couleurs ne décorent pas : **chaque teinte a un rôle** (agir, lire une valeur, attendre,
progresser, alerter) et ce rôle ne change jamais d'un outil à l'autre.

Ce que cela donne à l'écran (les gabarits `.hero`, `.statcard`, `.slab`, `.bench` de `base.css`, montrés par la page de
référence) :
- la **console** : un grand bloc héro (titre Norelli sur `--panel`), un bloc compteur orange plein avec un chiffre
  géant Venus, puis une pile de **dalles** pleine largeur en rampe corail (pêche → corail → terre) puis vert ;
- le **banc** : trois colonnes (rack de rangées à gauche, scène au centre, fiche clé/valeur à droite), en-tête
  collante avec logotype, pastilles d'état mono, horloge acier, boutons fantômes, **un** bouton orange.

---

## 2. La palette : chaque jeton et son rôle

Source unique : `design/tokens.css`. Deux thèmes par les **mêmes noms** (`:root` = sombre, défaut ;
`[data-theme="light"]` = clair). Un composant ne sait jamais quel thème est posé.

### 2.1 Fonds (du plus profond au plus relevé)

| jeton | sombre | clair | rôle |
|---|---|---|---|
| `--bg` | `#0a0d0b` | `#e6e9e5` | le fond de page, l'intérieur des « écrans encastrés » (vumètres, afficheurs, surfaces de dessin) |
| `--panel` | `#101413` | `#f6f7f5` | un panneau, une carte, une rangée de rack, le canvas d'un cadre |
| `--panel2` | `#151a18` | `#eaede9` | un niveau au-dessus : champs, boutons, tuiles du nodal, menus, barres flottantes |
| `--panel3` | `#1b211e` | `#dadfda` | le plus relevé : tuile choisie, survol de menu, rail de curseur, molette |
| `--sel-bg` | `#122a2d` | `#d4e4e9` | une rangée choisie (bleu-vert sourd) |
| `--black` | `#000` | `#d5dad4` | le fond d'un moniteur / d'une vidéo |
| `--hdr-bg` | `rgba(10,13,11,.94)` | `rgba(238,241,237,.94)` | l'en-tête collante, sur flou 12 px |

### 2.2 Encres

| jeton | sombre | clair | rôle |
|---|---|---|---|
| `--ink` | `#e6eae7` | `#141a17` | le texte, les valeurs, le chapeau des faders |
| `--ink2` | `#9ca8a2` | `#3e4944` | texte secondaire, prose d'explication |
| `--ink3` | `#7c8884` | `#4f5a55` | étiquettes mono, graduations, état éteint |

### 2.3 Accents — le cœur sémantique

| jeton | sombre | clair | rôle (règle stricte) |
|---|---|---|---|
| `--or` | `#e0674a` | `#a8391b` | **L'ACTION.** Le seul bouton plein orange de l'écran (`.tb.go`), la **sélection** sur un canvas, la **tête de lecture**, le fil choisi, l'anneau de focus clavier, l'alerte d'un fil refusé. Jamais décoratif. |
| `--cy` | `#b9cfd8` | `#25586c` | **L'acier : ce qu'on LIT.** Valeurs mesurées, horloge, timecode, « en cours » (pastille qui pulse), poignées de plage, groupes. |
| `--grn` | `#2f6b4a` | `#2f6b4a` | **L'état engagé** : bouton/segment `.on`, option retenue. |
| `--grn2` | `#3d8a60` | `#23693f` | **La progression / OK** : jauges, pastille « en ligne », témoin d'un bloc qui joue, niveau d'un vumètre. |
| `--amb` | `#d6a24a` | `#7f5308` | **CE QUI ATTEND UN HUMAIN, jamais une action** : file d'attente, demande en suspens, marqueur, explication d'une action désactivée (`.why`), liaisons. |
| `--rouge` | `#b3392b` | `#b3261e` | **L'alerte système, hors de la palette d'action** (bandeau « machines éteintes »). Rare. |

Encres posées sur un aplat d'accent : `--on-or` (`#170c08` / `#fff5f0`), `--on-cy`, `--on-grn` (`#eaf4ee`),
`--on-rouge`, `--on-light` / `--on-coral1` (sur la rampe corail).

Fonds teintés et traits d'accent (pour cerner sans remplir) : `--or-bg` (14 %), `--or-bg2` (55 %), `--cy-bg` (10 %),
`--grn-bg` (18 %), `--grn-bg2`, `--amb-bg` (8 %) ; `--line-or`, `--line-cy`, `--line-gr`, `--line-amb`.

### 2.4 Rampes

- **Corail** (pistes, dalles de la console) : `--coral-3` `#f2cdb8` (pêche) · `--coral-2` `#e79b7c` (corail) ·
  `--coral-1` `#a8603c` (terre). En clair, assombries jusqu'à 4,5:1.
- **Verts de dalles** : `--verd-1..5` (`#2a5540` → `#1a3f2c`).
- **Couleurs de piste** autorisées par le serveur de Showrunner : `or`, `cy`, `amb`, `grn2`, `coral-1/2/3` (sept).
- **Les cinq lanes du nodal** (ODIO), réglées pour 4,5:1 sur les panneaux : `--nd-ryt` `#4b8fb6` (bleu),
  `--nd-har` `#8b82bb` (violet), `--nd-tim` `#bd7294` (rose), `--nd-nrj` `#45967c` (vert d'eau), `--nd-ten` `#a0836d` (brun).
- **Spectre** (rampe d'un spectrogramme) : `--spec-0..4` (silence → plus fort ; 16:1 au plus fort).

### 2.5 Traits, voiles, trames

| jeton | sombre | rôle |
|---|---|---|
| `--line` | `rgba(198,213,220,.14)` | LE filet : tout contour, séparateur, rail |
| `--veil` / `--veil-0` | `rgba(10,13,11,.82)` / 0 | voile sous une étiquette posée sur une image ; dégradé du haut des clips |
| `--scrim` | `rgba(4,6,5,.78)` | fond sous une modale (avec flou 4 px), hachures d'un clip désactivé |
| `--voile` | `rgba(5,6,6,.55)` | fond sous un panneau qui sort d'une barre |
| `--dot` / `--dot-hi` | `.12` / `.16` | **la trame de points** (7 px dans les cartes, 24 px sur le canvas) |
| `--dot-on-or` | `rgba(26,13,7,.22)` | la trame posée sur l'aplat orange |
| `--drop` / `--drop-lg` | `rgba(0,0,0,.5/.6)` | ombre portée d'un élément qui flotte (menus, barres, chapeaux) |
| `--hl-*` | 26–40 % | surligneurs de texte (ambre, orange, acier, vert) |

### 2.6 Contraste

Le clair est tenu à **AA (4,5:1)** pour tout accent qui sert d'encre ; les graphiques à 3:1 (WCAG 1.4.11).
Chaque jeton neuf se déclare **dans les deux blocs** et se mesure.

---

## 3. Typographie

| voix | police | usage | réglages types |
|---|---|---|---|
| **Interface** | Chakra Petch (OFL ; 400/500/600/700) | prose, valeurs, boutons, champs | corps 12 px, `line-height 1.5`, **chiffres tabulaires partout** ; bouton 11 px 600 capitales `.1em` ; valeur lue 15 px 600 acier ; horloge 19 px 700 acier |
| **Machine** | Azeret Mono (OFL, variable 100–900) | toutes les étiquettes, références, compteurs, graduations, états | 7,5–9,5 px, **CAPITALES, interlettrage .1–.22em**, `--ink3` (ou orange pour une rubrique) |
| **Affichage** | Venus Rising (licence inconnue, § 12) | noms de sections, de rangées, de pistes, de cadres, titres d'écran vide, chiffre géant | capitales larges, `.04–.2em` ; 12–15 px en tête de colonne, 13 px nom de rangée, 22 px écran vide, 56–92 px chiffre de la carte compteur |
| **Logotype** | Norelli Black (licence inconnue, § 12) | logotype et grand titre d'accueil **seulement** | 54 glyphes (A-Z, a-z, espace) : aucun chiffre, aucun accent ; 16 px au logo, 30–54 px en héro |

Règles :
- **Les capitales sont pour la machine** (mono, petit, espacé). La prose reste en bas de casse, dans la fonte d'interface.
- Une phrase qui explique pourquoi une action est bloquée est en `--amb`, bas de casse (`.why`).
- Venus Rising est plus large que la fonte d'interface : un nom **passe à la ligne** plutôt que d'être coupé.
- Les noms d'objets créés par l'utilisateur sont en bas de casse (« Délai », pas « DÉLAI ») ; seules les sections
  et les étiquettes machine passent en capitales.

---

## 4. Grille, espacements, gabarits

- **Espacements** : `--s1` 4 · `--s2` 6 · `--s3` 10 · `--s4` 14 · `--s5` 18 · `--s6` 24 px. Gouttière standard
  entre colonnes : 14 px ; padding de page 24 px.
- **Gabarits de page** :
  - *banc* : `252 px | 1fr | 340 px` (rack, scène, fiche), qui se replie en deux puis une colonne par
    `@container` (1280 px, 900 px) — c'est la place de la page qui décide, pas la fenêtre ;
  - *outil* : `340 | 1fr | 300` ;
  - *console* : héro 1,55fr + carte compteur 1fr, puis la pile de dalles.
- **En-tête** : 52 px (46 sous 700 px), collante, `--hdr-bg` + flou 12 px, filet bas ; de gauche à droite :
  logotype (carré orange 24 px à pastille), navigation mono 8,5 px (onglet actif = trait orange de 2 px dessous),
  vide, pastilles d'état, horloge, boutons fantômes, un bouton orange. Sa mise en page ne dépend **que de sa largeur**
  (paliers fixes) : rien ne bouge quand une donnée arrive.
- **Hauteurs** : bouton 30 px (`.sm` 26), champ ~32 px, rangée de rack ≥ 64 px, en-tête de tuile 23 px,
  ligne de réglage de tuile 19 px. **Au téléphone, toute cible ≥ 44 × 44 px**, tout champ en 16 px (pas de zoom iOS).
- **Unités d'écran** : jamais `100vh` brut (faux sous zoom et sur mobile) — `calc(100 * var(--vh))`, avec
  `--vh = 1svh` sur téléphone.

## 5. Rayons et traits

- **Un seul réglage** : `--rad` (5 px). Tous les rayons en sont des multiples : `--rxs` 1 · `--r0` 2 · `--rs` 3 ·
  `--r1` 4 · `--r2` 5 (boutons, champs) · `--r3` 7 (rangées, panneaux, menus) · `--rl` 8 · `--r4` 9 (cartes,
  modales, moniteur) · `--rxl` 12. Ronds (50 %) et pilules (999 px) hors réglage. Sobre : « outil professionnel ».
- **Filets, jamais de bordures** : `box-shadow: inset 0 0 0 1px var(--line)` (ne prend pas de place, ne décale rien).
  Variantes : choisi = `inset 0 0 0 1px var(--line-cy)` (rangée) ou `2px var(--or)` (vignette, objet de canvas) ;
  terminé = `--line-gr` ; zone de dépôt = `--line-gr` qui passe à `--or` au survol.
- Séparateurs : `inset 0 -1px 0 var(--line)` (sous une en-tête), traits de 1 px `--line`.
- **La trame de points** (`radial-gradient(var(--dot) 1px, transparent 1.1px)` en 7 px) occupe une bande à droite
  des rangées, panneaux et dalles : c'est la signature visuelle du banc.

---

## 6. Les composants clés (anatomie)

| composant | anatomie |
|---|---|
| **Bouton `.tb`** | 30 px, `--panel2`, 11 px 600 capitales `.1em`, rayon `--r2` ; survol = luminosité ×1,18 ; `.go` orange plein (**un seul par écran**) ; `.on` vert engagé ; `.ghost` transparent cerné `--line` (survol `--line-cy`) ; `.sm` 26 px ; désactivé = 30 % d'opacité **et** une raison (`.why`) |
| **Segmenté `.seg`** | rail `--panel2` 3 px de marge, boutons transparents, l'option active en vert `--grn` |
| **Pastille d'état `.pill`** | point 6 px + mono 9 px capitales : gris (repos), vert (en ligne), acier qui pulse (en cours), orange (erreur), ambre (partiel) |
| **Étiquette `.lbl`** | mono 8,5 px `.2em` capitales `--ink3` |
| **Champ `.fld`** | `--panel2`, filet `--line` → `--line-cy` au focus, placeholder `--ink3` |
| **Rangée de rack `.item`** | `--panel`, rayon `--r3`, ≥ 64 px ; point d'état 7 px à gauche (vert ok, acier qui pulse, orange erreur) ; texte : référence mono 8,5 px, **nom Venus 13 px**, sous-titre mono ; trame de points à droite ; survol = glisse de 3 px à droite + luminosité ; choisie = `--sel-bg` + filet acier ; verrouillée = 42 % |
| **Séparateur de série** | mono orange capitales + filet qui court jusqu'au compte (`.rack .serie`) |
| **Panneau `.pan`** | `--panel`, `--r3`, en-tête mono sur filet bas, trame à droite |
| **Moniteur** | 16:9, `--black`, `--r4`, volet A/B (poignée orange 26 × 44 à deux traits), étiquettes sur voile (A en acier, B en orange), lecture en bas à droite acier |
| **Transport / timecode** | barre `--panel` ; timecode 15 px 700 acier + unité mono |
| **Carte méta + `.kv`** | grille clé (mono capitales `--ink3`) / valeur (`--ink2`) ; la valeur importante en 15 px 600 acier ; filet acier (voie A) ou orange (voie B) |
| **Jauge `.meter`** | rail 4 px `--panel3`, remplissage `--grn2` animé .3 s |
| **Avertissement `.warn`** | fond `--or-bg`, filet `--or-bg2`, mono orange capitales |
| **Bandeau `.why`** | prose ambre bas de casse : ce qui manque pour agir |
| **Toast** | bas centré, `--panel3`, `--r3`, ombre, fondu .2 s |
| **Modale** | voile `--scrim` + flou 4 px ; carte `--panel` `--r4`, en-tête mono sur filet, pied à filet haut |
| **Carte compteur `.statcard`** | aplat orange, chiffre géant Venus, trame `--dot-on-or` |
| **Dalle `.slab`** | pleine largeur, rampe corail puis verte, icône au trait 1,6, référence mono, **nom Venus 19–27 px**, action mono à droite ; survol glisse de 3 px |
| **Menu commun** | `--panel2`, `--r3`, ombre profonde ; têtes de rubrique mono orange 8 px ; entrées 12 px avec icône, point de teinte, raccourci mono à droite ; désactivée = pâlie + son pourquoi en ambre ; danger = orange |
| **Bouton « ⋯ »** | 28 px sur voile, filet |
| **Curseur (range)** | **le fader de console couché** : rail creux 8 px arrondi (`--panel3`, trait central), chapeau plein `--ink` 10 × 20 à encoche, ombre ; survol s'étire (scaleY 1,08), tenu s'enfonce (0,94). Plus jamais de pouce rond |
| **Molette** | cadran 40 px (`.sm` 30, `.xs` 22) : piste `--line` 3 px, arc 270° et aiguille dans l'accent `--k` ; valeur 11 px 600, nom mono 7,5 px |
| **Fader vertical** | rail 22 × 150 `--panel3`, trait d'accent 2 px à 55 %, chapeau pilule `--ink` ombré |
| **Vumètre** | colonnes 6 px sur `--bg` : vert, ambre quand ça chauffe, crête tenue (trait `--ink2`, orange si saturé) |
| **Pas / pads** | pas éteint `--dot`, temps fort `--dot-hi`, allumé **orange**, pas courant cerné d'acier 2 px |
| **Zone de dépôt** | filet vert, survol orange, gros « + » mono vert |
| **Plage in/out** | traits acier 3 px, prise striée, étiquettes mono sur aplat acier ; hors plage = voile `--bg` à 78 % à bord doux ; dépassement hachuré |
| **Croix « × »** | un masque SVG centré (traits 1,5 px), jamais un caractère texte mal centré |
| **Panneau latéral (dock)** | glisse de la gauche, pousse la page ; languette verticale verte « ASSET » au bord |
| **Fenêtres détachées** | un bouton icône dans l'en-tête de panneau, pastilles mono dans la barre |

---

## 7. Le canvas (Idéation) — « le canvas designé »

- **Planche infinie** à trame de points **24 px** (`--dot-hi`) sur `--bg`, cadre `--r4` cerné d'un filet.
  Zoom 8 % → 400 %, molette ancrée au pointeur, espace/main pour glisser, pincer au doigt.
- **Zoom sémantique à trois niveaux** (posé 150 ms après le geste) :
  - **Ensemble** (< 42 %) : les cartes ne gardent que l'essentiel, le **nom des cadres s'affiche en grand au centre**
    sur un voile (avec son compte), les textes illisibles deviennent des **barres de leur couleur (« le pavé »)**,
    le titre d'une carte importante flotte au-dessus d'elle en mono orange ;
  - **Travail** (42–130 %) : la carte normale ;
  - **Détail** (> 130 %) : légendes, prompt entier, toutes les références.
- **Objets** (`.nd`) : `--r3` ; choisi = halo orange 2 px ; survol = filet acier 1 px.
- **Ports** : ronds de **13 px d'écran à tout zoom** (plancher à 60 %), anneau de 2 px dans la teinte de ce qu'ils
  portent (`--k`), **pleins quand un fil est branché** ; entrées à gauche, sortie à droite ; grossissent ×1,45 au survol.
  Pendant qu'on tire un fil : les ports compatibles s'allument (anneau + halo 30 %), les autres s'éteignent à 10 %,
  les objets incompatibles passent à 38 %.
- **Fils** (`commun/wire.css`) : courbe, **2 px d'écran** dans la teinte de la source à 75 % ; survol 2,6 px opaque ;
  **choisi orange 3 px** ; fil qu'on tire en **tirets 5 5** orange ; « envoi » en tirets 6 5 ; refusé en pointillé
  orange 2 5 ; étiquette mono 9 px capitales avec contour `--bg` 4 px (lisible sur tout fond) ; zone de clic 16 px.
  Toutes ces mesures restent en **pixels d'écran** quel que soit le zoom.
- **Cadres** (`.fr`) : un panneau `--panel` `--r4` ; leur nom en Venus **au-dessus** du cadre (taille bornée), compte en
  mono ; choisi = filet orange 2 px.
- **Groupes** : une appartenance, pas une zone : pointillé acier au survol, nom mono acier ; ouvert = pointillé orange.
  **Un groupe réduit devient une carte à ports** (le « nœud replié d'un sous-graphe ») : en-tête mono acier, nom Venus
  15 px, mosaïque d'aperçus, une ligne par fil qui traverse sa frontière (entrée à gauche / sortie à droite).
- **Sélection** : rectangle `--or-bg` cerné d'orange ; lasso (Alt) pointillé orange ; cadre de sélection orange avec
  poignées carrées 9 px (creuses, pleines au survol), poignée « ranger » à trois points, pastille de compte orange.
  Au-dessus, **la barre de sélection** (`.sbar`) : `--panel2`, ombre, boutons mono 8,5 px, actif vert, séparateurs.
- **Aimantation** : guides orange 1 px d'écran (`--line-or`) ; trait d'insertion orange 2 px.
- **Coins de la planche** : boîte de zoom en pilule (`--veil`, filet vert, pourcentage en 11 px) au-dessus de la
  **mini-carte** (188 × 118 px, `--panel`, `--r3`, ombre, en bas à droite, peinte avec les jetons) ; bandeau d'aide
  en pilule en bas à gauche ; **écran vide** = carte voilée centrée, titre Venus 20 px, prose, boutons.
- Au téléphone : pas de barre latérale, pas de mini-carte ; deux doigts zooment, un doigt déplace.

## 8. Le nodal (ODIO, `musique/nodal.*`)

- **La tuile = une carte** : `--panel2`, filet `--line`, coins 12 px apparents ; deux tuiles accolées ne dessinent
  qu'un filet entre elles (une machine soudée = une seule coque). **Choisie** : `--panel3` cernée de son accent 1,5 px.
- **L'accent `--k` par tuile** (la piste, sinon la famille du module) : il colore le **témoin**, les molettes, les rails,
  la borne de sortie, les fils qui en partent. Teinte de fond de la tuile à 8–10 % de l'accent.
- **En-tête** (23 px) : témoin (point de l'accent au repos, **vert quand ça joue**, creux quand éteint ; clic = allumer),
  nom `--f-ui` 600 bas de casse, à droite le réglage exposé en mono 7,5 px dans l'accent ; nom trop long = défilement
  doux aller-retour. Le nœud de départ d'une piste porte un **trait de 2 px de sa couleur** en tête et son **étiquette
  de piste à gauche** (Venus 12 px, pastille de couleur), à taille d'écran constante.
- **Corps vivant** : lignes de réglage (nom mono 8 px, rail 3 px, pouce 8 × 12 dans l'accent, valeur 11 px 600),
  faders, molettes, pads, pas, clavier, **surfaces encastrées** (`--bg`, filet, courbe dans l'accent), afficheur
  (texte mono dans l'accent sur `--bg`), vumètre, matrice (trois intensités par `color-mix` de l'accent), pad XY
  (point de l'accent sur un réticule). **De loin, il reste ce qui fait le son** (molettes, pads, courbes), pas les titres ;
  « le réglage en grand » : la valeur en Venus dans l'accent quand rien d'autre ne tient.
- **Éteint / contourné** : corps à 55 % désaturé, témoin creux. **Influencé** : filet vert.
- **Bornes** : 13 px d'écran, anneau 2 px `--ink3` ; **sortie dans l'accent, pleine quand un fil part** ; « notes » en
  **losange** 11 px ; pastilles de saut empilées sous la borne.
- **Câbles** : ceux du canvas (§ 7), plus : chaîne partagée en tireté long 9 4, notes en **pointillé rond** 1 6 épais 3,
  saut en 2 4 ; lâcher un câble dans le vide ouvre **la liste rapide** (le menu commun) et le bloc naît branché ;
  au-dessus d'une cible : cadre **vert** (liaison permise) ou **orange tireté** (refusée).
- **Liens de contrôle** (molette → molette) en **ambre** 1,5 px, avec un signe ±.
- Groupes en pointillé acier aux coins des cartes + barre de groupe (nom, nuancier 5 × n, boutons mono) ;
  séparateurs internes qui s'éclairent en acier ; jonctions carrées 11 px.
- **Catalogue** (double-clic dans le vide) : une modale du portail, rubriques mono orange, entrées nom + référence,
  vignettes teintées au survol.

## 9. Les timelines

Deux timelines éprouvées, **une seule tête et une seule règle** communes (`commun/tete.css`).

- **Tête de lecture** : trait orange 2 px pleine hauteur + onglet orange 11 px en haut (coins bas arrondis),
  sur son propre calque. **Règle** : graduations timecode mono 8 px `--ink3`, filet à gauche de chaque graduation,
  sous-graduations décalées.
- **Arrangement (ODIO, façon Ableton Live)** :
  - règle en deux bandes : **sections** (22 px : pavés `--panel2` à **trait de couleur 2 px à gauche**, nom mono
    8,5 px, bords tirables) puis **mesures** (numéros mono, bande de boucle : acier, orange quand active) ;
  - **marqueurs** : trait ambre 2 × 16 + étiquette mono ambre ;
  - **arc** collé sous la règle (58 px) : une courbe d'énergie dessinée, tête de rangée Venus orange ;
  - **en-têtes de piste** collés à gauche : **barre de couleur 4 px**, nom Venus 12 px, sorte mono 7,5 px, boutons
    19 px (muet, solo, armer — armé = filet orange), mini-molettes, fader couché ; choisie `--sel-bg` ;
  - **la grille passe AU-DESSUS des clips** (traits fins, on vise un temps à travers une forme d'onde) ; elle ne
    s'arrête jamais à droite ;
  - objet / temps : la **barre de titre d'un clip est l'objet**, son corps et le vide sont le temps (clic = marqueur
    d'insertion qui clignote, glisser = plage) ; rectangle de sélection acier.
- **Montage (façon Premiere Pro)** : pistes de 46 px (audio 40), fond de piste `--cy-bg` ; **clip** = corps `--panel3`
  `--r2` cerné acier, **dégradé de voile en haut** pour le nom (11 px), badge mono acier sur voile en bas à gauche ;
  son = fond vert `--grn-bg` cerné vert ; titre = bande acier pâle, nom Venus ; **désactivé = 38 % + hachures à 135°** ;
  fondus = triangles d'ombre `--scrim` + trait `--ink` ; poignées de fondu 9 px ; désynchronisation = pastille ambre ;
  marqueurs = drapeau vert ; plage in/out = traits acier ; outils de Premiere (V, A, B, N, R, C, Y, U, H, Z).
- **Gestes** : molette seule = défiler, Maj = le temps, Alt = zoom sous le pointeur, Ctrl = hauteur des pistes ;
  aimant 8 px ; une entrée d'annulation par geste.

## 9 bis. Les deux composants à ne jamais redessiner : le fader et la tête de lecture

Le propriétaire de Showrunner l'a répété (09/10) : « on a designé des sliders et à chaque fois tu m'as mis des sliders de
merde », « on a mis des conventions sur les têtes de lecture qui doivent être identiques ». On **reprend les fichiers tels
quels**, on ne les réinterprète pas.

1. **Le curseur = le fader de console couché** (`design/curseur.css`, modèle : `musique/nodal.css` `.fader`) :
   rail creux arrondi de 8 px (`--panel3` sous un filet, **trait fin au milieu**, ombre intérieure), **chapeau plein
   rectangulaire 10 × 20 px aux coins doux (`--rs`), à l'encre `--ink`, avec une encoche verticale au milieu (`--ink3`)**,
   porté par son ombre ; s'étire (×1,08) au survol, s'enfonce (×0,94) tenu ; désactivé à 35 %. Posé sous `:where()` **sans
   classe** : tout `input[type=range]` le prend. **Jamais de pouce rond.** La variante timeline (`.tl` de `base.css`) : un
   pouce de 4 × 28 px orange, la piste est la `.track` dessous (8 px `--panel3`, remplissage `--grn2`), graduations à 25 %.
2. **La tête de lecture et la règle, communes à toutes les timelines** (`design/tete.css` + `design/tete.js`, celle du
   Montage) : `.sr-ph` = trait **orange 2 px** pleine hauteur + **onglet 11 px en haut, arrondi dessous**, déplacé par
   `transform` sur son propre calque, jamais dessiné sous les en-têtes de piste collés ; la vue suit la lecture (à 30 px du
   bord droit, elle repart 60 px avant la tête). `.sr-mk` = graduations en **timecode HH:MM:SS:FF**, mono 8 px `--ink3`,
   pas choisi pour qu'une étiquette ait au moins 84 px, demi-graduations au-delà de 160 px. API : `tete()`, `poser()`,
   `suivre()`, `peindreRegle()`, `brancherRegle()`, `tc()`.
   Pour STUDIO_REAL : la timeline des segments **et** la bande timeline de la régie utilisent cette tête et cette règle ;
   l'heure de spectacle (pausable) s'affiche en HH:MM:SS (le `:FF` des images ne sert qu'aux tops minutés à l'image près).

## 10. Micro-interactions et animations

Le thème est **retenu** : il bouge pour informer, jamais pour décorer.

| mouvement | valeur |
|---|---|
| survol de bouton | `filter: brightness(1.18)` en 120 ms |
| survol de rangée / dalle | glisse de 3 px à droite + luminosité, 140–160 ms |
| « en cours » | `sPulse` : opacité .35 ↔ 1 en 1,2 s (pastilles, points d'état) |
| attente d'un humain | point ambre qui pulse 1,4 s ; barre ambre qui balaie (2,2 s) |
| port / borne au survol | ×1,45, 100–120 ms |
| fil au survol | épaissit 2 → 2,6 px, opacité .75 → 1 |
| chapeau de curseur | s'étire 1,08 au survol, s'enfonce 0,94 tenu |
| modale / fenêtre | entrée : fondu + échelle .985 ; **refus** : petit rebond vertical (−8 / +5 px en 260 ms) |
| lecteur | entrée : fondu + 10 px vers le haut |
| changement de page | transition de vue 160 ms, **l'en-tête ne clignote pas** |
| tiroir, panneau | translation 200 ms, seulement pendant un geste (jamais au chargement) |
| jauge | largeur en 300 ms ; vumètre par `transform` (pas de repeinture) |
| champ qui vient de changer | éclair vert `--grn-bg2` |
| éclair de capture | flash .9 → 0 |
| nom trop long | défilement aller-retour lent |
| marqueur d'insertion | clignote (opacité 50 %) |

**Toujours** : `prefers-reduced-motion` (et une préférence « réduire les animations ») coupe tout et laisse un état
fixe et clair. Rien n'anime `width/left` quand un `transform` suffit.

## 10 bis. Sombre et clair : la pose du thème, et la règle « salle »

- **Le clair existe et doit marcher partout, rien que par les jetons.** `tokens.css` redonne **les mêmes noms** sous
  `[data-theme="light"]` : papier gris-vert (`--bg` `#e6e9e5`, panneaux plus clairs que le fond, champs un cran plus gris),
  accents **assombris jusqu'à AA** (`--or` `#a8391b`, `--cy` `#25586c`, `--amb` `#7f5308`), rampe corail assombrie avec
  encre claire (`--on-light` `#fbf7f4`), `--black` devient un gris neutre `#d5dad4`, ombres beaucoup plus légères.
  Un composant ne sait jamais quel thème est posé ; tout jeton neuf se déclare dans les deux blocs.
- **La pose, avant la première peinture** (`design/theme-tot.js`) : un **script classique synchrone, le premier du
  `<head>`**, avant toute feuille ; il lit la préférence locale et pose sur `<html>` : `data-theme` (`dark` / `light`,
  et « le mien » = des jetons surchargés en ligne, chaque valeur vérifiée par `colorOk()`), `zoom` + `--ui-zoom` (90–125 %),
  `--rad` (arrondi 0–16 px), `data-motion="reduce"`, et **`data-appareil`** (`mobile` / `tablette` / `ordi`),
  `data-tactile`, `data-standalone` (PWA). `design/theme.js` n'en est que la façade pour les modules (`applyTheme`,
  `reducedMotion()`…). Sans ce script en tête, la page clignote en sombre avant de passer en clair.
  À adapter : la clé de préférence `sr.prefs.v1` → une clé propre à STUDIO_REAL.
- **La règle « salle » de SUPERVISIO** (`public/js/theme.js`) : le sombre est le défaut et n'écrit rien ; le clair pose
  `data-theme="light"` ; **dans une salle (`html[data-salle]`), le clair n'est jamais posé** — « on y regarde une image, la
  pièce est noire quel que soit le choix » — mais le choix reste mémorisé pour le reste de l'outil. Le script du `<head>`
  applique la même règle avant la première peinture.
- **Règle proposée pour STUDIO_REAL, par surface** :

| surface | thème | mécanisme |
|---|---|---|
| Éditeur (écriture, répétition) | sombre **ou** clair, au choix de la personne | préférence (`theme-tot.js`) |
| Régie live | sombre **ou** clair au choix (le sombre recommandé en salle ; variante « régie de nuit ») | préférence |
| **Téléphone du spectateur pendant le spectacle** | **toujours sombre** | `html[data-salle]` posé dès l'entrée dans la représentation (le serveur dit « en salle ») |
| **Écran de scène** | **toujours sombre** | `data-salle` en dur sur la page scène |
| Vue streamer, comédien | sombre en spectacle (`data-salle`) ; clair possible en extérieur plein soleil si les essais le justifient (à mesurer) | `data-salle` levé par la régie, pas par la personne |
| Écrans d'**avant / après** spectacle (hall, billetterie, souvenir du lendemain, PWA) | clair possible (préférence du téléphone, `prefers-color-scheme`) | `data-salle` absent |

  Conséquence de conception : **chaque écran est dessiné et vérifié dans les deux thèmes**, y compris ceux qui seront
  forcés en sombre : la version claire prouve que rien n'est en dur et sert telle quelle avant/après le spectacle.

---

## 11. Les règles dures à conserver dans STUDIO_REAL

1. **Aucune couleur en dur.** Une teinte manque : on ajoute un jeton, dans les deux thèmes, mesuré.
   **Exception, déjà admise par Showrunner** (« les nuanciers tirés d'une image sont des données ») : les couleurs
   **choisies par l'auteur du spectacle** (couleur plein écran envoyée aux téléphones, couleur d'une équipe, palette d'un
   gabarit de scène) sont des **données du spectacle**, montrées dans des pastilles, jamais utilisées pour l'habillage.
2. **Deux thèmes par les seuls jetons** ; le sombre est le défaut ; chaque écran est vérifié en sombre **et** en clair.
   En salle (`html[data-salle]` : téléphone du public pendant le spectacle, écran de scène), le clair n'est jamais posé
   (§ 10 bis).
3. **Filets, jamais de bordures** (`box-shadow: inset`).
4. **Un seul orange plein par écran : l'action.** En régie, c'est **GO**. Le bouton **PANIQUE n'est pas orange** :
   il prend `--rouge` (l'alerte hors palette d'action) et se tient appuyé pour confirmer.
5. **Les capitales sont pour la machine** (mono, petit, espacé) ; la prose en bas de casse.
6. **Norelli** ne tient que le logotype ; le reste de l'affichage est en Venus Rising (ou son remplaçant, § 12).
7. **Une action désactivée dit pourquoi** (ambre) et mène à ce qui la débloque ; rien à « enregistrer » qui pourrait
   s'enregistrer seul.
8. L'ambre = **ce qui attend un humain** → dans STUDIO_REAL : gate ARMÉE / AVERTISSEMENT, file de modération,
   consigne non accusée, joueur en attente de validation. Jamais un bouton.
9. L'acier = **ce qu'on lit** → compteurs de la salle, latences, horloges, valeurs de variables, aperçus.
10. Le vert = engagé / OK / ça joue → présent, connecté, testé, segment passé, bloc qui s'exécute.
11. Fils et ports **à taille d'écran constante** ; zoom sémantique plutôt que réduction illisible.
11 bis. **Le curseur et la tête de lecture se reprennent des fichiers** (`curseur.css`, `tete.css` + `tete.js`), jamais
   redessinés (§ 9 bis). Plus largement, tout composant qui existe dans Showrunner se reprend de sa source.
11 ter. Rayons : « au-delà de 9 px, on sort du langage » (page de référence) — seule exception admise, la coque des tuiles
   du nodal (12 px apparents).
12. `prefers-reduced-motion` partout, **sauf** l'écran scène (c'est un spectacle), qui garde un **garde-fou
    photosensibilité** (≤ 3 flashs/s) et un gabarit « calme ».

## 12. Ce que la copie actuelle (`design/`) ne couvre pas — à signaler

- **Venus Rising et Norelli : licence inconnue → NON copiées dans ce dépôt public**, à juste titre.
  Conséquence : `design/base.css` déclare encore `@font-face` vers `./fonts/venus-rising.otf` et `./fonts/norelli-black.otf`
  (fichiers absents → requêtes 404, repli silencieux sur Chakra Petch). À trancher par le propriétaire :
  (a) obtenir une licence web pour les deux ; (b) les **héberger hors dépôt** (comme Showrunner, chargées depuis un
  stockage privé) ; (c) **remplacer** par des polices OFL proches : pour Venus Rising, une capitale géométrique très
  étendue (piste : *Michroma*, OFL) ; pour Norelli, un didone à fort contraste (pistes : *Bodoni Moda* ou *Italiana*,
  OFL). Proposition : (c) pour le public (téléphones, écran scène), (a/b) si la régie veut l'original.
- **Chakra Petch** : seule la graisse **Light** est dans `design/fonts/`, alors que le thème utilise 400, 500, 600, 700
  (boutons en 600, horloge en 700). Showrunner les charge depuis Google Fonts ; ici, pour fonctionner hors ligne en salle,
  il faut **ajouter les graisses 400–700 (OFL)** dans `design/fonts/`.
- `design/curseur.css`, `tete.css`, `tete.js`, `theme-tot.js`, `theme.js` sont maintenant présents (l'`@import` du curseur
  dans `base.css` est donc résolu). `tete.js` et `theme-tot.js` tels quels n'ont pas de dépendance ; `theme-tot.js` garde
  la clé `sr.prefs.v1` de Showrunner, à renommer.
- **Il manque une page de référence propre à STUDIO_REAL**, sur le modèle de `character_factory/theme.html` (qu'on ne
  copie pas : `character_factory/` ne sort jamais du dépôt privé) : un `design/theme.html` qui ne définit **aucune couleur
  ni fonte**, charge `tokens.css` + `base.css` + `curseur.css` + `tete.css`, et montre nuancier (sombre et clair côte à côte),
  spécimens, barèmes, et chaque composant — à écrire quand Claude Design aura livré les composants nouveaux.
- Les jetons ODIO `--nd-*`, la rampe corail et le spectre sont utiles ici (familles de nœuds, formes d'onde) ;
  les jetons de « planche de présentation » (`--paper*`) et `--titre-*` ne servent pas : à garder pour rester
  comparable nom à nom avec Showrunner, mais ne pas s'en servir.

---

## 13. Adapter le thème aux quatre surfaces

Le thème est né pour un **outil dense sur grand écran**. STUDIO_REAL ajoute trois surfaces de **spectacle** où les
contraintes s'inversent (lisibilité à distance, une main, le noir de la salle). Principe : **mêmes jetons, mêmes
rôles de couleur, mêmes deux voix typographiques** ; ce qui change, ce sont les **tailles, les densités, et les
jetons de surface** ajoutés (§ 14).

### 13.1 Éditeur et régie (ordinateur, desktop dense) — le thème tel quel

- **Tout Showrunner s'applique sans adaptation** : en-tête 52 px, rack, fiche `.kv`, canvas, nodal, timelines,
  menus, modales, 12 px de corps, mono 8,5 px. **Sombre ou clair au choix** (préférence), comme Showrunner et SUPERVISIO.
- **Mode = couleur du cadre de l'application** (repère permanent, à ne pas rater en représentation) :
  - Écriture : en-tête normale ;
  - Répétition : pastille acier qui pulse « RÉPÉTITION · BOTS 120 · ×10 » + trait acier sous l'en-tête ;
  - **Live** : pastille « ● LIVE K7Q2 » + **trait orange de 2 px sous l'en-tête** ; l'édition structurelle est verrouillée
    (curseur interdit + `.why` « verrouillé pendant la représentation »).
- La régie live est l'écran le plus dense : **GO** est le seul orange ; RETENIR en ambre (contour) ; SAUTER/+30 s/PAUSE
  en fantômes ; PANIQUE en `--rouge`, appui long 1 s avec anneau qui se remplit ; raccourcis rappelés en mono.
- Lisibilité dans une régie sombre : prévoir une **préférence « régie de nuit »** qui baisse `--ink` et les accents
  (jetons surchargés par l'éditeur de thème, comme Showrunner le permet) — jamais de blanc pur.

### 13.2 Téléphone du spectateur (plein écran, une main, dans le noir)

- **Toujours en thème sombre** pendant le spectacle (un fond clair éclaire tout le rang) — `html[data-salle]`, § 10 bis ;
  les écrans d'avant/après (hall, souvenir du lendemain) peuvent être clairs ; le noir de l'écran
  « noir » est **`#000` pur** (jeton `--salle-noir`, pas `--bg`) ; la seule lumière vive autorisée est l'effet
  « couleur plein écran » ou « lampe », décidé par la régie.
- **Échelle ×1,4 à ×2** : corps 17 px (prose 16–18), mono **≥ 11 px** (jamais 8,5 px dans le noir), titres Venus 24–34 px,
  chiffres géants 64–120 px. **Cibles 56–72 px** pour les actions du spectacle (44 px reste le plancher des réglages).
- **Une main** : les actions dans le **tiers bas** (zone du pouce), le contexte (consigne, chrono) en haut ;
  `100svh`, aucun défilement, `overscroll-behavior: none`, zones sûres (`env(safe-area-inset-*)`).
- **Un seul orange par écran** = l'action attendue maintenant (« VOTER », « ENVOYER », « J'Y SUIS »).
  Un vote à options colorées : les couleurs des options sont des **données** (pastilles larges), l'orange reste
  sur la confirmation.
- Les étiquettes « machine » se font rares : un pseudo, un chrono, une équipe. **Pas de jargon** (pas de « segment »,
  « gate »), prose courte en bas de casse.
- Retour de chaque toucher : enfoncement 0,94 (le chapeau du fader), éclair d'accent, **vibration courte** (Android),
  et confirmation « parti ✓ » en vert.
- Luminosité : fonds `--bg`/`--panel` uniquement, textes `--ink2` par défaut ; `--ink` pour l'essentiel.
- Animations : courtes, ressorts doux, **respectent `prefers-reduced-motion`** ; jamais plus de 3 flashs/s.

### 13.3 Vue streamer (téléphone, lisible en mouvement)

- Le streamer marche, filme, parle : la vue est un **pare-brise**, pas un tableau de bord.
- **Une consigne à la fois**, en **Venus 32–44 px**, sur un bandeau qui occupe le tiers haut ; la suivante en petit
  (« ensuite : … ») ; bouton **REÇU** orange, 72 px de haut, pleine largeur, au pouce.
- Arrivée d'une consigne urgente : **bandeau ambre plein** (`--amb`, encre `--on-amb` à créer), vibration longue + son,
  le bandeau **ne disparaît pas** avant REÇU.
- Retour caméra plein écran en fond ; par-dessus, voiles `--veil` sous chaque texte (lisibles sur toute image).
- État du flux en haut à droite : pastille (vert ok, ambre dégradé, rouge coupé), images/s et latence en mono **13 px**.
- Réactions du public : une **bande compacte** (pas de danmaku sur le téléphone) : compteurs d'emojis qui
  pulsent + 1 commentaire épinglé à la fois.
- Chrono du segment : anneau de chrono 56 px en haut à gauche, chiffres acier.

### 13.4 Écran scène (projection, lisible à 15 m)

- 1920 × 1080 (ou 3840 × 2160), plein écran, **aucune interface** ; calques animés au-dessus du flux vidéo ;
  **toujours sombre** (`data-salle` en dur sur la page).
- **Tailles** (hypothèse : image de 5 m de base, soit ≈ 2,6 mm par pixel à 1920 px ; **à mesurer en salle**) :
  texte courant ≥ **56 px** de corps (capitale ≈ 10 cm), pseudo ≥ 40 px, titres et révélations **120–300 px**,
  aucune graisse fine (Chakra Petch 600–700, Venus) ; jamais de mono < 32 px.
- **Contraste sur vidéo** : chaque texte porte un **contour** (`paint-order: stroke`, comme les étiquettes de fils de
  Showrunner) et/ou une pastille `--veil` ; zone protégée autour du visage du streamer.
- La palette reste celle du thème : fond `--bg`, réactions dans les accents et la **couleur stable de chaque pseudo**
  (donnée, tirée d'une palette de 12 teintes mesurées sur `--bg`, § 14) ; la trame de points devient un motif de fond
  animé discret (parallaxe lente).
- C'est **la seule surface spectaculaire** : ressorts, particules, secousses d'écran, mais au service d'une
  **grammaire** (pop = arrivée, danmaku = flux, fusée = cumul, barre = vote) et d'un gabarit par séquence
  (calme / folie / vote / entracte / panne).
- Plan B « connexion perdue » dans le style du personnage, sur `--bg` avec trame et texte Venus.

---

## 14. Ce qu'on réutilise, ce qu'on adapte, ce qu'on crée

### 14.1 Réutilisable tel quel
- `design/tokens.css` entier (palette sombre et claire, rayons, espacements, typo, `--vh`).
- `design/curseur.css` (le fader), `design/tete.css` + `tete.js` (tête et règle), `design/theme-tot.js` + `theme.js`
  (pose du thème, appareil, animations réduites), plus la règle `data-salle` de SUPERVISIO à y ajouter.
- `design/base.css` : boutons, `.seg`, `.pill`, `.lbl`, `.fld`, rack `.item`, `.pan`, moniteur, transport, `.kv`, `.meter`,
  `.warn`, toast, modale, carte compteur, dalles, règles téléphone (44 px, 16 px), croix.
- Depuis Showrunner (à recopier, leur code est à nous) : `commun/curseur.css` (fader), `commun/menu.css` (menu commun),
  `commun/wire.css` (fils), `commun/tete.css` (tête + règle), `commun/plage.css` (in/out), logique et habit du **canvas**
  d'Idéation (trame, zoom sémantique, sélection, barre, cadres, groupes repliés, mini-carte, zoombox, écran vide) et du
  **nodal** d'ODIO (tuiles, accent `--k`, témoin, bornes, câbles, liste rapide, catalogue), les **en-têtes de piste**,
  sections, marqueurs et clips des timelines.

### 14.2 À adapter
- **Fils** : distinguer **exécution** (trait `--ink2` 2,5 px, ports en **chevron ▸**) et **données** (trait 2 px dans la
  teinte du type, ports ronds) ; un fil d'exécution **s'illumine** (impulsion qui court, vert) quand le moteur le
  traverse en répétition/live.
- **Bornes** : ajouter le chevron d'exécution ; garder rond (données) et losange (événements / listes de joueurs).
- **Tuiles** : le corps « vivant » d'ODIO devient un **aperçu de l'effet** (pastille, onde, mini-téléphone…) — même
  coque, même en-tête, même accent par famille.
- **Groupes repliés** → **sous-graphes** (« fonction » réutilisable) ; **cadres** → zones nommées (Acte 1, Hall…).
- **Timeline** : les sections deviennent des **segments** à durée fixe / min-max / ouverte, les marqueurs des **tops**,
  la boucle disparaît, les **gates** s'intercalent (losanges) ; les pistes deviennent des **pistes de cible**.
- **Rack** → liste des joueurs (point d'état = présence ; nom = pseudo ; sous-titre mono = plateforme, latence, capacités).
- **Fiche `.kv`** → inspecteur de règle (« Suivant quand… » en phrase + champs).
- **Moniteur A/B** → aperçus de rôle (téléphone · streamer · scène) côte à côte.
- **Pastilles d'état** → présence (● présent, ◐ caché, ○ déconnecté) avec les accents existants.
- **Téléphone** : tailles ×1,4–2, thème sombre forcé, cibles 56–72 px (§ 13.2).

### 14.3 À créer (n'existe pas dans Showrunner)
- **Jetons nouveaux** (sombre + clair, mesurés) :
  - `--eq-1 … --eq-8` : couleurs **par défaut** des équipes (proposées, modifiables : la couleur réelle est une donnée) ;
  - `--fam-trig`, `--fam-flux`, `--fam-data`, `--fam-cible`, `--fam-effet`, `--fam-ui`, `--fam-scene`, `--fam-gate` :
    **alias** des accents existants pour les familles de nœuds (§ brief), pour que l'éditeur de thème les voie ;
  - `--role-*` : un accent par rôle (spectateur, superviseur, streamer, comédien, modérateur, régisseur, écran scène,
    capitaine, secret, invité, bot) — alias des accents et des lanes `--nd-*` ;
  - `--salle-noir: #000` (le noir d'un téléphone en salle) ; `--pseudo-1 … -12` (couleurs stables des pseudos à l'écran) ;
  - `--exec` (fil d'exécution), `--live` (le trait « en représentation »), `--gate-*` (feu : éteint / ambre / vert / rouge),
    `--on-amb` (encre sur un aplat ambre : Showrunner n'en pose jamais, la vue streamer en a besoin).
- **Composants** : feu tricolore de gate, anneau de chrono, mini-téléphone d'aperçu, forme d'onde de vibration,
  pastille de couleur réelle, barres de vote animées, pile d'avatars + pastilles d'équipe, plan de salle miniature,
  badge de rôle (et de rôle secret, masqué), bouton GO géant, bouton panique à appui long, file de modération,
  bandeau de consigne, carte joueur, compteurs de présence, horloge de spectacle, boîte « envoyer à », éléments de
  l'écran scène (pop, danmaku, fusée d'emojis, cœurs, jauge de salle, révélation de vote, commentaire vedette, nuage de
  mots), écrans téléphone (entrée, tutoriel, attente, vote, clavier, réactions, couleur, message privé, équipe,
  supervision), vue streamer.
