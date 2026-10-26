# Brief Claude Design — STUDIO_REAL

> **À coller tel quel dans Claude Design, avec le zip `kit-theme-showrunner.zip`** (§ 0.1). Ce brief est autoportant :
> Claude Design n'a pas accès aux dépôts. Les valeurs clés (couleurs, polices, tailles, anatomie des composants) sont
> écrites ici ; les fichiers sources du kit font foi en cas d'écart.
> Analyse complète côté dépôt : `docs/etudes/da-showrunner.md`.

---

## 0. Ta mission en trois lignes

Tu conçois l'interface de **STUDIO_REAL**, un studio pour écrire, répéter et jouer des **spectacles de théâtre où le
public participe avec son téléphone**. La direction artistique est **imposée** : celle de **Showrunner**, une suite
d'outils de création existante (thème sombre « banc de mesure de studio », décrit en détail au § 2). Tu ne crées pas
un nouveau style : tu **étends** ce thème à de nouveaux écrans, en respectant ses jetons et ses règles, et tu proposes
**les composants nouveaux** qui manquent (blocs visuels du canvas, écrans téléphone, écran de scène).

### 0.1 Le kit que tu reçois : `kit-theme-showrunner.zip`
Avec ce brief, tu reçois un zip qui contient **les fichiers sources** du thème (pas des captures) :

| dossier | contenu | à quoi il sert |
|---|---|---|
| `0-page-de-reference/` | `theme.html` et ses assets | **la page de référence** : statique, branchée sur les mêmes CSS que l'application ; elle ne définit aucune couleur ni fonte ; nuancier, spécimens typographiques, barèmes, démonstrations de chaque composant. **Ouvre-la d'abord.** |
| `1-jetons/` | `tokens.css` | la **seule source des couleurs**, bloc sombre (`:root`) et bloc clair (`[data-theme="light"]`) |
| `2-composants/` | `base.css`, `shell.css`, `curseur.css`, `tete.css` + `tete.js`, `menu.css`, `wire.css`, `plage.css`, `theme-tot.js`, `theme.js`, etc. | boutons, rack, fiches, menus, fils, **le fader**, **la tête de lecture**, la pose du thème |
| `3-canvas-ideation/` | `canvas.js` (+ sa feuille) | **le canvas** : trame, zoom sémantique, ports, sélection, cadres, groupes, mini-carte |
| `4-nodal/` | `nodal.js` + `nodal.css` | **le nodal** : tuiles, accent par tuile, témoin, bornes, câbles, liste rapide |
| `5-timelines/` | les timelines (arrangement façon Live, montage façon Premiere) | pistes, sections, clips, marqueurs, règle, tête |
| `6-supervisio/` | le thème appliqué dans SUPERVISIO (dont `theme.js` et la règle `data-salle`) | un second exemple du même thème, et la règle « en salle, jamais de clair » |
| polices | Azeret Mono, Chakra Petch, Venus Rising, Norelli | voir § 2.3 (licences) |

**Exigence : les composants qui existent dans ces sources se reprennent DEPUIS LES SOURCES, sans les réinterpréter** — mêmes
classes, mêmes mesures, mêmes jetons. Ce que décrit ce brief (§ 2) est un résumé pour t'orienter ; **en cas d'écart,
le fichier source fait foi.** Tu ne dessines à neuf que ce qui n'existe pas (§ 5), et dans la même grammaire.
Deux composants ont déjà été ratés plusieurs fois par d'autres : **le curseur et la tête de lecture** (§ 2.5 bis) —
reprends-les à l'identique.

---

## 1. Le produit

### 1.1 Ce que c'est
Le public entre par un **QR code**, choisit un **pseudo**, et son téléphone devient un objet de la mise en scène :
il vote, écrit, réagit, secoue, s'allume d'une couleur, vibre, reçoit des messages secrets. Une **régie** pilote le tout
en temps réel. Premier spectacle : **LIVE** — un personnage (« Milo ») streame depuis un autre lieu, son flux est
projeté sur scène, le public commente depuis son téléphone et les réactions **explosent à l'écran** (pops, danmaku,
feux d'artifice d'emojis), pas en liste.

### 1.2 Trois modes de la même application (ordinateur)
| mode | qui | quoi | repère visuel |
|---|---|---|---|
| **Écriture** | auteur, metteur en scène | canvas nodal + timeline + inspecteur + aperçus de rôle | normal |
| **Répétition** | équipe | même vue, alimentée par des **bots** (120 faux spectateurs) et quelques vrais téléphones ; avance rapide ×2/×10, points d'arrêt de débogage | pastille acier qui pulse « RÉPÉTITION · BOTS 120 · ×10 » + trait acier sous l'en-tête |
| **Live** | régie | tableau de bord temps réel, GO / retenir / sauter / panique, joueurs, envois ciblés, modération | pastille « ● LIVE K7Q2 » + **trait orange 2 px sous l'en-tête** ; structure verrouillée |

### 1.3 Quatre surfaces
1. **Éditeur / régie** — ordinateur, dense, souris + clavier.
2. **Téléphone du spectateur** — plein écran, une main, **dans le noir d'une salle**, gros boutons, aucun défilement.
3. **Vue streamer** — téléphone tenu par quelqu'un qui marche et filme : **lisible en mouvement**.
4. **Écran de scène** — projection 1920 × 1080, **lisible à 15 m**, aucune interface, uniquement des calques animés
   par-dessus la vidéo du streamer.

### 1.4 Les rôles (beaucoup, et certains secrets)
Un rôle = un écran + des droits + des informations visibles. La régie peut changer le rôle d'un téléphone en direct.
Chaque rôle a un **badge** (glyphe + accent) visible en régie.

| rôle | appareil | voit / fait |
|---|---|---|
| **Spectateur** | son téléphone | l'interface du moment ; vote, écrit, réagit |
| **Capitaine d'équipe** | son téléphone | comme un spectateur + décide pour l'équipe (valide un choix d'équipe, voit le score de l'équipe) |
| **Superviseur qui joue** | téléphone / tablette | joue **et** a un onglet « Supervision » : compteurs, file de modération, consignes privées, qui a les rôles secrets, boutons autorisés par le scénario |
| **Modérateur** | poste ou téléphone | file des messages : valider / refuser / mettre en vedette / sourdine fantôme |
| **Streamer** (Milo) | téléphone dédié | son retour caméra, consignes privées, réactions compactes, bouton « REÇU » |
| **Comédien en salle** | téléphone discret | consignes privées, chrono, « REÇU » |
| **Régisseur général** | ordinateur | tout ; GO, panique |
| **Régisseur adjoint** | ordinateur | droits réduits (envois, modération, pas de panique) |
| **Écran scène** | ordinateur + projecteur | affichage pur |
| **Invité** | son téléphone | spectateur tiré au sort qui monte sur scène : télécommande spéciale |
| **Rôles secrets** | son téléphone | Traître, Confident, Veto, Messager… : une mission privée ; visibles **seulement** par le joueur concerné, les superviseurs et la régie (badge masqué) |
| **Bot** | serveur | faux spectateur de répétition (badge « robot », jamais en live) |
| **Technicien son / lumière** | console externe | reçoit des tops OSC/MIDI (apparaît comme cible « extérieur ») |

### 1.5 Les équipes
2 à 8 équipes par spectacle, créées par le scénario ou tirées au sort. Une équipe = **nom** (« Corbeaux », « Lucioles »,
« Renards », « Méduses »), **couleur** (donnée choisie par l'auteur), **emblème** (glyphe simple, pour les daltoniens et
l'écran noir & blanc), effectif, **capitaine**, **score**. Les équipes servent de cible (envoyer à l'équipe), de jauge
(course de secousses), d'écran (révélation de l'équipe en couleur plein écran), d'affichage scène (barres par équipe).

### 1.6 Le vocabulaire (théâtre)
- **Spectacle** : le scénario complet. **Représentation** : une exécution (code `K7Q2`).
- **Segment** : morceau de timeline avec une durée **fixe**, **min/max** ou **ouverte**.
- **Top** (cue) : un événement minuté (« +12 s : vibrer tous »).
- **Point d'arrêt** (« gate », « togglebreak ») : la frontière entre deux segments, avec une **règle de passage qui se
  lit en une phrase** : « *Suivant quand 100 % des présents ont voté, au plus tard 90 s, pas avant 15 s. Avertir les
  retardataires à 10 s. Si forcé : abstention. Vers : selon le gagnant.* » États : **EN COURS → ARMÉ → AVERTISSEMENT →
  PASSAGE**, plus **RETENU** (la régie garde la main).
- **Flowgraphe** : la logique d'un segment, d'un top ou d'un gate, en nœuds reliés (comme les Blueprints d'Unreal) :
  **liens d'exécution** (l'ordre) et **liens de données** (les valeurs).
- **Cible** : à qui s'adresse une action (tous, un rôle, une équipe, une zone, un joueur, une sélection, « ceux qui n'ont
  pas voté »).
- **GO** : l'ordre de la régie de franchir un gate ou de lancer un top (barre d'espace, comme QLab).

### 1.7 Données d'exemple (pour des maquettes crédibles)
- Spectacle **LIVE v12**, représentation **K7Q2**, 21:14:32, horloge de spectacle 00:23:41, **142 inscrits / 138 présents**, 2 alertes.
- Segments : 0 Hall · 1 Noir / ouverture · 2 Milo se connecte · 3 Chat ouvert · **4 Le choix (vote : « Où doit-il aller ? »
  Boulangerie / Toit / Métro)** · 5A/5B/5C La conséquence (« secouez pour l'aider », jauge) · 6 Rôles secrets ·
  7 Climax (danmaku, feux d'emojis, salle en couleur) · 8 Final.
- Gate du segment 4 : ARMÉ, **121/138 ont voté (88 %)**, passe à 100 % ou dans **0:48**.
- Joueurs : Zoé42 (iOS, a voté, 12 ms), Max (Android, caché), Léa (déconnectée depuis 0:12), Inès_b, Tom, Kenji, Sacha,
  Nour, Yanis, Camille.R, Bastien, Mila. Équipes : Corbeaux 36 · Lucioles 35 · Renards 34 · Méduses 33.
- Streamer : 24 i/s, 180 ms, 4G. Modération : 3 messages en attente.
- Emojis maison du spectacle (6–8) : 🔥 😱 😂 ❤️ 👏 🫣 ⚡ 🐀.

---

## 2. La direction artistique Showrunner (imposée)

### 2.1 L'esprit
Un **banc de mesure de studio, la nuit** : fonds vert-noir presque neutres ; **blocs pleins, filets fins, chiffres
larges** ; **une seule couleur d'action** (l'orange) ; une voix « machine » (mono minuscule en capitales très espacées)
qui étiquette tout ; une voix « affichage » (capitales larges géométriques) qui nomme ; une prose en bas de casse qui
explique. **Chaque couleur a un rôle et n'en change jamais.** Outil professionnel, sobre, précis — pas « gaming », pas
« néon ». Le spectaculaire est réservé à l'écran de scène.

Deux gabarits du thème (à retrouver dans les sources du kit : `.hdr`, `.hero`, `.statcard`, `.slab`, `.bench`, `.item`,
`.meta` de `base.css`, montrés par la page de référence) :
- **La console** : en-tête fine (logotype à gauche : carré orange 24 px à pastille sombre + nom en serif didone fin,
  sous-titre mono) ; à droite pastilles d'état mono, horloge 19 px acier, boutons fantômes, **un** bouton orange.
  Dessous : un grand bloc héro sombre (« DU PROMPT AU PERSONNAGE » en didone fin, prose grise), un bloc compteur
  **orange plein** avec un chiffre géant (« 01 ») en capitales larges et une **trame de points** sur sa droite ; puis une
  pile de **dalles pleine largeur** (pêche → corail → terre, puis verts) : icône au trait, référence mono (« ST—01 »),
  nom en capitales larges 19–27 px (« IDENTITÉ »), sous-titre mono, action mono à droite (« OUVRIR »), trame de points.
- **Le banc** : trois colonnes — à gauche un **rack** de rangées (référence mono, nom en capitales larges, sous-titre
  mono, point d'état, trame de points à droite, la choisie sur fond bleu-vert sourd cerné d'acier), au centre la scène
  (conversation, champs, zones de dépôt cernées de vert), à droite une **fiche clé/valeur** (clés mono capitales
  grises, rubriques mono orange sur filet, valeurs en interface) et en bas le bouton orange plein largeur.

### 2.2 Les jetons de couleur (noms et valeurs exacts — utilise ces noms comme variables CSS)

**Fonds** (du plus profond au plus relevé)
| jeton | sombre | clair | rôle |
|---|---|---|---|
| `--bg` | `#0a0d0b` | `#e6e9e5` | fond de page ; intérieur des « écrans encastrés » (vumètres, afficheurs, surfaces) |
| `--panel` | `#101413` | `#f6f7f5` | panneau, carte, rangée |
| `--panel2` | `#151a18` | `#eaede9` | champs, boutons, tuiles du nodal, menus, barres flottantes |
| `--panel3` | `#1b211e` | `#dadfda` | tuile choisie, survol, rail de curseur, molette |
| `--sel-bg` | `#122a2d` | `#d4e4e9` | rangée choisie |
| `--black` | `#000000` | `#d5dad4` | fond d'un moniteur vidéo |
| `--hdr-bg` | `rgba(10,13,11,.94)` | `rgba(238,241,237,.94)` | en-tête collante (+ flou 12 px) |

**Encres**
| jeton | sombre | clair | rôle |
|---|---|---|---|
| `--ink` | `#e6eae7` | `#141a17` | texte, valeurs |
| `--ink2` | `#9ca8a2` | `#3e4944` | secondaire, prose |
| `--ink3` | `#7c8884` | `#4f5a55` | étiquettes mono, graduations, éteint |

**Accents — rôles stricts**
| jeton | sombre | clair | rôle |
|---|---|---|---|
| `--or` | `#e0674a` | `#a8391b` | **L'ACTION** : le seul bouton plein orange de l'écran, la **sélection** sur un canvas, la **tête de lecture**, le fil choisi, l'anneau de focus |
| `--cy` | `#b9cfd8` | `#25586c` | **l'acier, ce qu'on LIT** : valeurs mesurées, horloges, timecodes, « en cours » (pulse), poignées de plage |
| `--grn` | `#2f6b4a` | `#2f6b4a` | **état engagé** (bouton/option active) |
| `--grn2` | `#3d8a60` | `#23693f` | **progression / OK / ça joue** : jauges, « en ligne », bloc qui s'exécute |
| `--amb` | `#d6a24a` | `#7f5308` | **ce qui ATTEND UN HUMAIN, jamais une action** : file, demande en suspens, marqueur, raison d'un bouton désactivé |
| `--rouge` | `#b3392b` | `#b3261e` | **alerte système hors palette d'action** (rare) |

Encres sur aplat : `--on-or` `#170c08` / `#fff5f0` · `--on-cy` `#0a0d0b` / `#f2f6f8` · `--on-grn` `#eaf4ee` ·
`--on-rouge` `#fff4f1` / `#ffffff` · `--on-light` `#1a0d07` (sur la rampe corail, sombre).

Fonds teintés et traits (cerner sans remplir) : `--or-bg` `rgba(224,103,74,.14)` · `--or-bg2` `.55` · `--cy-bg`
`rgba(185,207,216,.10)` · `--grn-bg` `rgba(47,107,74,.18)` · `--amb-bg` `rgba(214,162,74,.08)` · `--line-or`
`rgba(224,103,74,.70)` · `--line-cy` `rgba(185,207,216,.45)` · `--line-gr` `rgba(47,107,74,.85)` · `--line-amb`
`rgba(214,162,74,.55)`.

**Rampes**
- Corail (dalles, pistes) : `--coral-3` `#f2cdb8` (pêche) · `--coral-2` `#e79b7c` (corail) · `--coral-1` `#a8603c` (terre).
- Verts de dalles : `--verd-2` `#35684a` · `--verd-1` `#2a5540` · `--verd-3` `#2f6b4a` · `--verd-4` `#24543b` · `--verd-5` `#1a3f2c`.
- Cinq « lanes » (4,5:1 sur les panneaux) : `--nd-ryt` `#4b8fb6` (bleu) · `--nd-har` `#8b82bb` (violet) · `--nd-tim`
  `#bd7294` (rose) · `--nd-nrj` `#45967c` (vert d'eau) · `--nd-ten` `#a0836d` (brun).
  Clair : `#356683` · `#62569f` · `#95466a` · `#316a58` · `#735c4b`.
- Spectre (forme d'onde / intensité) : `--spec-0` `#0b0f0d` → `--spec-1` `#183d2c` → `--spec-2` `#2f7d54` →
  `--spec-3` `#d6a24a` → `--spec-4` `#f7ead8`.

**Traits, voiles, trame**
- `--line` `rgba(198,213,220,.14)` (clair `rgba(22,34,28,.16)`) : **LE filet** de tout.
- `--veil` `rgba(10,13,11,.82)` (voile sous une étiquette posée sur une image) · `--scrim` `rgba(4,6,5,.78)` (sous une
  modale, avec flou 4 px) · `--drop` `rgba(0,0,0,.5)` · `--drop-lg` `.6` (ombres des éléments qui flottent).
- `--dot` `rgba(198,213,220,.12)` · `--dot-hi` `.16` : **la trame de points** (7 px dans les cartes, 24 px sur le canvas) ;
  `--dot-on-or` `rgba(26,13,7,.22)` sur l'orange.

### 2.3 Typographie

| voix | police | usage | réglages |
|---|---|---|---|
| Interface | **Chakra Petch** (Google Fonts, OFL) 400/500/600/700 | prose, valeurs, boutons, champs | corps **12 px** / 1,5 ; **chiffres tabulaires partout** ; bouton 11 px 600 capitales `.1em` ; valeur lue 15 px 600 acier ; horloge 19 px 700 acier |
| Machine | **Azeret Mono** (OFL) | étiquettes, références (« ST—01 »), compteurs, graduations, états | **7,5–9,5 px, CAPITALES, interlettrage .1–.22em**, `--ink3` (orange pour une rubrique) |
| Affichage | **Venus Rising** (capitale géométrique très étendue) | noms de sections, rangées, pistes, cadres ; titre d'écran vide ; chiffre géant | capitales `.04–.2em` ; 12–15 px en tête de colonne, 13 px nom de rangée, 22 px écran vide, 56–92 px chiffre géant |
| Logotype | **Norelli Black** (didone à fort contraste, fin) | logotype et grand titre d'accueil **seulement** | 54 glyphes : A-Z, a-z, espace — pas de chiffre ni d'accent |

**Important — licences** : Venus Rising et Norelli (fournies dans le kit) n'ont **pas de licence connue** pour une
diffusion publique. Tu peux t'en servir pour **concevoir** (maquettes privées), mais : écris toujours
`font-family: var(--f-disp)` / `var(--f-black)` (jamais le nom en dur), et montre aussi chaque écran public (téléphone,
scène) avec des **remplaçants OFL** : `--f-disp` → **Michroma** (capitale étendue géométrique), `--f-black` → **Bodoni
Moda** ou **Italiana** (didone fin). Le propriétaire tranchera (licence ou remplacement).

Règles typographiques : **les capitales sont pour la machine** (mono, petit, espacé) ; la prose reste en bas de casse ;
les noms créés par l'utilisateur restent en bas de casse (« Vote porte », pas « VOTE PORTE ») ; un nom en capitales
larges **passe à la ligne** plutôt que d'être coupé.

### 2.4 Espacements, rayons, filets
- Espacements : `--s1` 4 · `--s2` 6 · `--s3` 10 · `--s4` 14 · `--s5` 18 · `--s6` 24 px.
- Rayons, tous dérivés de `--rad` = 5 px : `--rxs` 1 · `--r0` 2 · `--rs` 3 · `--r1` 4 · `--r2` 5 (boutons, champs) ·
  `--r3` 7 (rangées, panneaux, menus) · `--rl` 8 · `--r4` 9 (cartes, modales, moniteur) · `--rxl` 12. Pilules 999 px.
- **Filets, jamais de bordures** : `box-shadow: inset 0 0 0 1px var(--line)`. Choisi : filet `--line-cy` (rangée) ou
  halo orange 2 px (objet de canvas, vignette). Fini : `--line-gr`. Zone de dépôt : filet vert → orange au survol.
- **La trame de points** (`radial-gradient(var(--dot) 1px, transparent 1.1px)` en 7 px) sur une bande à droite des
  rangées, panneaux, dalles et du compteur orange : la signature visuelle.
- Gabarits : en-tête 52 px collante ; banc `252 px | 1fr | 340 px` ; gouttière 14 px ; page 24 px de marge.
- Hauteurs : bouton 30 px (petit 26), rangée de rack ≥ 64 px. **Téléphone : toute cible ≥ 44 px, champs en 16 px.**

### 2.5 Les composants Showrunner à reprendre (anatomie)
- **Bouton** : 30 px, `--panel2`, 11 px 600 capitales ; survol luminosité ×1,18 ; **`.go` orange plein, un seul par
  écran** ; `.on` vert ; `.ghost` transparent cerné `--line` ; désactivé 30 % **avec sa raison en ambre dessous**.
- **Segmenté** : rail `--panel2`, l'option active en vert `--grn`.
- **Pastille d'état** : point 6 px + mono 9 px : gris repos, vert en ligne, acier qui pulse = en cours, orange = erreur,
  ambre = partiel / attente.
- **Champ** : `--panel2`, filet → acier au focus.
- **Rangée de rack** : `--panel` `--r3` ≥ 64 px ; point d'état 7 px ; référence mono 8,5 px ; **nom en capitales larges
  13 px** ; sous-titre mono ; trame à droite ; survol = glisse de 3 px à droite ; choisie `--sel-bg` + filet acier ;
  séparateur de série = mono orange + filet qui court jusqu'au compte.
- **Panneau** : `--panel` `--r3`, en-tête mono sur filet bas.
- **Moniteur** 16:9 sur `--black`, `--r4`, étiquettes posées sur voile (`--veil` + flou), lecture acier en bas à droite.
- **Fiche clé/valeur** : clés mono capitales `--ink3`, valeurs `--ink2`, valeur importante 15 px 600 acier.
- **Jauge** : rail 4 px `--panel3`, remplissage `--grn2`. **Vumètre** : colonnes 6 px sur `--bg`, vert → ambre, crête tenue.
- **Curseur** = **un fader de console couché** : rail creux 8 px arrondi `--panel3` avec trait central, **chapeau plein
  `--ink` 10 × 20 px à encoche**, ombre ; s'étire au survol, s'enfonce tenu. Jamais de pouce rond.
- **Molette** : cadran 40 px `--panel3`, arc 270° et aiguille dans l'accent de la carte, valeur 11 px 600, nom mono 7,5 px.
- **Pas / pads** : éteint `--dot`, allumé **orange**, courant cerné acier.
- **Menu (clic droit)** : `--panel2` `--r3`, grande ombre, têtes de rubrique mono orange 8 px, entrées 12 px avec icône,
  point de teinte, raccourci mono à droite ; désactivée pâlie + raison ambre ; danger en orange.
- **Modale** : voile `--scrim` + flou ; carte `--panel` `--r4` ; en-tête mono sur filet ; pied à filet haut.
- **Toast** : bas centré, `--panel3`, fondu 200 ms. **Avertissement** : fond `--or-bg`, mono orange.
- **Carte compteur** : aplat orange, chiffre géant en capitales larges, trame sombre à droite.
- **Dalle** : bande pleine largeur en rampe corail puis verte, icône au trait 1,6 px, référence mono, nom 19–27 px
  capitales larges, action mono à droite.
- **Croix « × »** : un dessin vectoriel centré (traits 1,5 px), jamais un caractère.
- Icônes : **au trait** 1,6 px, `currentColor`, coins arrondis, sobres.
- Le motif de tout le produit (page de référence) : **une référence en mono, un nom en capitales larges, un compte en
  mono** (« LOT—3 · VUES ET 3D · 3 ÉTAGES »). Rayons : au-delà de 9 px on sort du langage (sauf la coque des tuiles, 12 px).

### 2.5 bis Les deux composants à reprendre À L'IDENTIQUE (jamais redessinés)
1. **Le curseur (`input type=range`) = le fader de console couché** — `2-composants/curseur.css`, posé sous `:where()` sans
   classe : **tout** curseur le prend. Rail **creux arrondi de 8 px** (`--panel3` sous un filet `--line`, **un trait fin
   de 2 px au milieu**, ombre intérieure) ; **chapeau plein rectangulaire 10 × 20 px aux coins doux (3 px), à l'encre
   `--ink`, avec une encoche verticale au milieu (`--ink3`)**, porté par une ombre `--drop` ; survol : s'étire ×1,08 ;
   tenu : s'enfonce ×0,94 ; désactivé 35 %. **Jamais de pouce rond, jamais de curseur natif, jamais de rail plein coloré.**
   Variante « timeline » (`.tl` de `base.css`) : pouce **4 × 28 px orange**, piste 8 px `--panel3` dessous, remplissage `--grn2`.
2. **La tête de lecture et la règle, identiques dans toutes les timelines** — `2-composants/tete.css` + `tete.js` :
   `.sr-ph` = **trait orange 2 px pleine hauteur + onglet orange 11 px en haut, arrondi dessous**, déplacé par
   `transform`, jamais par-dessus les en-têtes de piste collés ; la vue suit la lecture. `.sr-mk` = graduations en
   **timecode HH:MM:SS:FF**, mono 8 px `--ink3`, filet à gauche, une étiquette tous les 84 px au moins.
   La timeline des segments (P0-b) et la bande timeline de la régie (P0-c) utilisent **cette** tête et **cette** règle.

### 2.5 ter Sombre ET clair, rien que par les jetons
- Le thème a **deux jeux** : sombre (défaut, `:root`) et clair (`[data-theme="light"]`), **mêmes noms**. Clair : papier
  gris-vert `--bg` `#e6e9e5`, `--panel` `#f6f7f5`, `--panel2` `#eaede9`, `--panel3` `#dadfda`, encres `#141a17` /
  `#3e4944` / `#4f5a55`, accents assombris jusqu'à AA (`--or` `#a8391b`, `--cy` `#25586c`, `--grn2` `#23693f`, `--amb`
  `#7f5308`), corail assombri avec encre claire `#fbf7f4`, `--line` `rgba(22,34,28,.16)`, ombres légères
  (`--drop` `rgba(20,30,24,.16)`), `--black` `#d5dad4`. Toutes les valeurs : `1-jetons/tokens.css`.
- **Un composant ne sait jamais quel thème est posé** : aucune règle « si clair alors… » dans un composant.
- Le thème est posé **avant la première peinture** par `theme-tot.js` (script classique en tête du `<head>`) :
  `data-theme`, `data-appareil` (mobile / tablette / ordi), `data-motion`, `--rad`, zoom de l'interface.
- **La règle « salle »** (SUPERVISIO, `6-supervisio/`) : quand `html[data-salle]` est posé, **le clair n'est jamais
  appliqué** (« on y regarde une image, la pièce est noire ») ; le choix de la personne reste mémorisé pour plus tard.

### 2.6 Le canvas (à reprendre fidèlement)
- **Planche infinie à trame de points 24 px** (`--dot-hi`) sur `--bg`, cadre `--r4` cerné d'un filet ; zoom 8 % → 400 %.
- **Zoom sémantique à 3 niveaux** : **Ensemble** (< 42 %) — les cartes ne gardent que l'essentiel (leur aperçu visuel),
  le **nom des cadres s'affiche en grand au centre** sur un voile, les textes illisibles deviennent des **barres de leur
  couleur** ; **Travail** ; **Détail** (> 130 %) — tout le détail.
- **Ports** : ronds de **13 px d'écran à tout zoom**, anneau 2 px dans la teinte de ce qu'ils portent, **pleins quand un
  fil est branché** ; ×1,45 au survol. En tirant un fil : ports compatibles allumés (anneau + halo 30 %), les autres à 10 %.
- **Fils** : courbes, **2 px d'écran** dans la teinte de la source à 75 % ; survol 2,6 px ; **choisi orange 3 px** ; fil
  qu'on tire en tirets 5 5 orange ; refusé en pointillé orange ; étiquette mono 9 px avec contour `--bg` 4 px ; épaisseurs
  constantes à tout zoom.
- **Cadres** : panneau `--panel` `--r4`, nom en capitales larges **au-dessus** du cadre, compte en mono ; choisi = filet orange.
- **Groupe replié = carte à ports** (sous-graphe) : en-tête mono acier, nom en capitales larges 15 px, mosaïque d'aperçus,
  une ligne par fil qui traverse sa frontière (entrées à gauche, sorties à droite).
- **Sélection** : rectangle `--or-bg` cerné d'orange, poignées carrées 9 px creuses (pleines au survol), pastille de compte
  orange ; **barre de sélection flottante** au-dessus (`--panel2`, ombre, boutons mono 8,5 px, actif vert).
- Guides d'aimantation orange 1 px. **Mini-carte** 188 × 118 px en bas à droite (`--panel`, `--r3`, ombre) ; au-dessus,
  **boîte de zoom en pilule** (`--veil`, filet vert, « 100 % » en 11 px, − / + / cadrer). Écran vide : carte voilée centrée,
  titre en capitales larges 20 px, prose, boutons.

### 2.7 Le nodal (à reprendre fidèlement)
- **La tuile = une carte** `--panel2`, filet, coins 12 px ; choisie `--panel3` **cernée de son accent** 1,5 px.
- **Accent par tuile (`--k`)** : il colore le témoin, les rails, les molettes, la borne de sortie et les fils qui partent.
  Fond de tuile teinté à 8–10 % de l'accent.
- **En-tête 23 px** : **témoin** (point de l'accent au repos, **vert quand le bloc s'exécute**, creux quand éteint),
  nom 12 px 600 bas de casse, à droite le réglage clé en mono 7,5 px dans l'accent.
- **Corps vivant** : lignes de réglage (nom mono 8 px, rail 3 px, pouce 8 × 12 dans l'accent, valeur 11 px 600), faders,
  molettes, pads, **surfaces encastrées** (fond `--bg`, filet, courbe dans l'accent), afficheurs (mono dans l'accent sur
  `--bg`), vumètres. **De loin, il reste ce qui est visuel** (l'aperçu), pas les titres.
- Éteint = corps à 55 % désaturé. Bornes : rondes 13 px (sortie dans l'accent, pleine si branchée), **losange** pour un
  autre type de flux. Lâcher un fil dans le vide ouvre une **liste rapide** (le menu) : le bloc naît branché ; au-dessus
  d'une cible : cadre **vert** (permis) ou **orange tireté** (refusé). Double-clic dans le vide : **catalogue** (modale,
  rubriques mono orange).

### 2.8 Les timelines (à reprendre fidèlement)
- **Tête de lecture** : trait orange 2 px pleine hauteur + onglet orange 11 px en haut. **Règle** : timecodes mono 8 px
  `--ink3`, filet à gauche de chaque graduation.
- **Façon Ableton Live** : règle en deux bandes — **sections** (pavés `--panel2` à **trait de couleur 2 px à gauche**, nom
  mono 8,5 px) puis graduations ; **marqueurs** = trait ambre 2 × 16 + étiquette mono ambre ; **en-têtes de piste** collés à
  gauche : **barre de couleur 4 px**, nom en capitales larges 12 px, sorte en mono 7,5 px, petits boutons 19 px, fader
  couché ; la **grille passe au-dessus des clips** (traits fins).
- **Façon Premiere** : pistes de 46 px ; **clip** = corps `--panel3` `--r2` cerné acier, **dégradé de voile en haut** pour le
  nom 11 px, badge mono acier sur voile en bas ; clip son vert ; **désactivé = 38 % + hachures à 135°** ; plage in/out =
  traits acier 3 px à prise striée, hors plage voilé.

### 2.9 Micro-interactions
Retenues, informatives : survol bouton luminosité ×1,18 (120 ms) ; survol rangée = glisse 3 px (150 ms) ; « en cours » =
pulsation d'opacité .35 ↔ 1 en 1,2 s ; attente humaine = point ambre qui pulse 1,4 s ; port ×1,45 ; modale : entrée fondu +
échelle .985, **refus = petit rebond vertical** (−8 / +5 px, 260 ms) ; changement de page 160 ms sans faire clignoter
l'en-tête ; tiroirs 200 ms ; jauge 300 ms ; champ qui vient de changer : éclair vert ; **`prefers-reduced-motion` coupe
tout** (sauf l'écran de scène, voir § 4.4).

---

## 3. Les règles dures (à ne jamais enfreindre)

1. **Aucune couleur en dur** : uniquement les jetons ci-dessus. Il manque une teinte → propose un **nouveau jeton nommé**
   (sombre **et** clair, contraste mesuré). **Exception** : les couleurs **choisies par l'auteur du spectacle** (couleur
   plein écran envoyée aux téléphones, couleur d'équipe, couleur d'un pseudo) sont des **données** : montre-les dans des
   **pastilles**, jamais comme habillage de l'interface.
2. **Deux thèmes, rien que par les jetons** ; le sombre est le défaut ; **chaque écran se livre en sombre ET en clair**.
   En salle (`html[data-salle]` : téléphone du public pendant le spectacle, écran de scène), le clair n'est jamais posé.
2 bis. **Les composants existants se reprennent des sources du kit, sans réinterprétation** — en particulier le curseur
   (fader couché) et la tête de lecture (§ 2.5 bis).
3. **Filets, jamais de bordures.**
4. **Un seul orange plein par écran = l'action.** En régie live : **GO**. **PANIQUE n'est pas orange** : `--rouge`, appui
   long pour confirmer.
5. **Capitales = machine** (mono, petit, espacé) ; prose en bas de casse.
6. Le logotype seul en didone (Norelli) ; tout le reste de l'affichage en capitales larges (Venus Rising / Michroma).
7. **Une action désactivée dit pourquoi** (ambre, bas de casse) et mène à ce qui la débloque.
8. Ambre = attend un humain (gate armé, modération, consigne non lue) ; acier = on lit ; vert = OK / ça joue ;
   orange = on agit / c'est choisi ; rouge = alerte.
9. Fils, ports, étiquettes à **taille d'écran constante** ; zoom sémantique plutôt que miniaturisation illisible.
10. **Accessibilité** : AA en clair ; **jamais la couleur seule** (équipes = couleur + emblème + nom ; états = couleur +
    forme/texte) ; photosensibilité : **≤ 3 flashs/s** partout.

---

## 4. Adapter le thème aux quatre surfaces

### 4.0 Quel thème sur quelle surface (règle proposée, sur le modèle `data-salle` de SUPERVISIO)
| surface | thème |
|---|---|
| Éditeur (écriture, répétition) | sombre **ou** clair, au choix de la personne |
| Régie live | sombre **ou** clair au choix (sombre recommandé en salle ; variante « régie de nuit ») |
| **Téléphone du spectateur pendant le spectacle** | **toujours sombre** (`data-salle` posé dès l'entrée dans la représentation) |
| **Écran de scène** | **toujours sombre** (`data-salle` en dur) |
| Vue streamer / comédien | sombre en spectacle ; un clair « plein soleil » en extérieur reste à évaluer (dis-nous si tu le recommandes) |
| Écrans d'**avant / après** (hall, entrée avant l'ouverture, souvenir du lendemain) | clair possible (préférence du téléphone) |

Tu livres **quand même chaque écran dans les deux thèmes** : la version claire des écrans « salle » prouve que rien n'est
en dur et sert telle quelle avant/après le spectacle.

### 4.1 Éditeur / régie (ordinateur)
Le thème **tel quel** : 12 px, mono 8,5 px, rack, fiches, canvas, nodal, timelines. Densité maximale, tout au clavier.
Sombre ou clair. Prévoir une variante « régie de nuit » (encres et accents baissés par surcharge des jetons).

### 4.2 Téléphone du spectateur
- **Sombre forcé en salle** ; le « noir » d'un écran éteint est `#000` (nouveau jeton `--salle-noir`) ; fonds `--bg`/`--panel` ;
  la seule lumière vive est l'effet **couleur plein écran** ou **lampe** décidé par la régie.
- **Échelle ×1,4 à ×2** : corps 17 px, mono **≥ 11 px**, titres en capitales larges 24–34 px, chiffres géants 64–120 px.
- **Cibles 56–72 px** pour les gestes du spectacle (44 px minimum pour le reste). **Actions dans le tiers bas** (pouce) ;
  consigne et chrono en haut. Hauteur = `100svh`, **aucun défilement**, zones sûres de l'iPhone respectées.
- **Un seul orange** = l'action attendue maintenant (« VOTER », « ENVOYER »). Retour de chaque toucher : enfoncement 0,94 +
  éclair + vibration courte + confirmation verte « parti ✓ ».
- Pas de jargon (« segment », « gate » n'apparaissent jamais).

### 4.3 Vue streamer
- **Une consigne à la fois**, capitales larges 32–44 px, bandeau du tiers haut ; « ensuite : … » en petit ; bouton **REÇU**
  orange, 72 px, pleine largeur, au pouce.
- Consigne **urgente** : bandeau **ambre plein** (nouvelle encre `--on-amb`), vibration longue + son, ne disparaît qu'à REÇU.
- Retour caméra plein écran ; voile `--veil` sous chaque texte ; état du flux en haut à droite (mono 13 px).
- Réactions du public en **bande compacte** (compteurs d'emojis qui pulsent + un commentaire épinglé).
- Anneau de chrono du segment.

### 4.4 Écran de scène (15 m)
- 1920 × 1080, aucune interface. **Tailles** (hypothèse : image de 5 m de base, ≈ 2,6 mm par pixel) : texte ≥ **56 px** de
  corps, pseudos ≥ 40 px, titres / révélations 120–300 px ; graisses 600–700 ; pas de mono < 32 px.
- **Contour** sur chaque texte posé sur la vidéo (trait `--bg` sous le texte, `paint-order: stroke`) et/ou pastille `--veil`.
  **Zone protégée** autour du visage du streamer (rien ne s'y pose).
- C'est la **seule surface spectaculaire** : ressorts, particules, secousses, mais avec une **grammaire** stable (pop =
  arrivée, danmaku = flux, fusée = cumul, barres = vote, flash = climax) et **un gabarit par séquence** (calme / folie /
  vote / entracte / panne). Garde-fou photosensibilité (≤ 3 flashs/s) et option « calme ».

---

## 5. Ce qu'il faut produire (par priorité)

Chaque écran : **en sombre ET en clair** (rien que par les jetons ; § 4.0 dit lequel est montré en salle), avec **ses
états** : mode **écriture / répétition / live** quand c'est pertinent, et **vide / chargé / erreur**. Utilise les données
d'exemple du § 1.7. Tout ce qui existe dans le kit (boutons, rack, menus, fils, curseur, tête de lecture, canvas, nodal,
timelines) est **repris des sources**, pas redessiné.

### P0-a — Le canvas nodal avec des blocs VISUELS (priorité absolue)

**Le principe demandé par le propriétaire** : sur le canvas, un bloc de fonction **montre ce qu'il fait** — un aperçu
vivant — et pas une carte de paramètres. Même coque que les tuiles du nodal (§ 2.7) : en-tête 23 px (témoin, nom,
réglage clé à droite), **un grand aperçu au centre** (écran encastré `--bg`, `--r2`, filet), une ligne ou deux de réglages
dessous (cachés au zoom Ensemble). Ports : exécution en haut (entrée à gauche / sorties à droite), données dessous.

**Familles et accents `--k`** (alias à créer : `--fam-*`, sur des jetons existants — propose mieux si le contraste l'exige) :
| famille | accent proposé | glyphe d'en-tête |
|---|---|---|
| Déclencheurs (quand) | `--nd-ryt` bleu | éclair |
| Flux & logique | `--nd-har` violet | losange |
| Données & agrégats | `--cy` acier | barres |
| Ciblage (qui) | `--nd-tim` rose | silhouette |
| Effets téléphone (lumière, vibration, son, message) | `--coral-2` corail | onde |
| Interfaces joueur (écrans types) | `--nd-nrj` vert d'eau | téléphone |
| Scène, streamer, extérieur (OSC/MIDI) | `--nd-ten` brun | projecteur |
| Points d'arrêt / attente | `--amb` ambre | feu |

**Les liens** :
- **Exécution** : trait `--ink2` 2,5 px, port en **chevron ▸** ; en répétition/live, **une impulsion verte court le long
  du fil** quand le moteur le traverse, et le témoin du bloc s'allume en vert.
- **Données** : 2 px dans la teinte du **type** : nombre `--cy` (rond), texte `--coral-3` (rond), vrai/faux `--nd-har`
  (rond), **joueurs / cible `--nd-tim` (losange)**, équipe `--nd-tim` (losange + pastilles), couleur (rond rempli de la
  **couleur réelle**), média `--nd-ten` (carré arrondi). Propose la légende.
- Latents (« Attendre ») : fil sortant **tireté** tant que le bloc attend.

**Au moins 20 blocs types à dessiner** (en voici 34 ; dessine-en le plus possible, au moins 2 par famille), chacun avec
son **aperçu vivant** :

*Déclencheurs*
1. **Au démarrage du segment** — mini-barre de segment avec encoche d'entrée qui s'allume.
2. **À +T** — mini-règle avec un repère et un **compte à rebours** en chiffres acier.
3. **Vote reçu** — urne stylisée + compteur qui s'incrémente (« 121 »), petite étincelle à chaque vote.
4. **Texte reçu** — bulle où défile le dernier message (« trop bien 🔥 — Zoé42 »).
5. **Secousse** — **sismographe** live (trait qui oscille, amplitude = énergie de la salle).
6. **Bouton régie** — un bouton miniature qui **flashe** quand on clique le bouton de régie lié (« Révéler le traître »).
7. **OSC / MIDI reçu** — diode d'activité qui clignote + adresse en mono (`/qlab/cue/12`).
8. **Joueur rejoint / revient / part** — pile d'avatars avec flèches entrée/sortie, compteurs.

*Flux & logique*
9. **Si / Selon** — l'aiguillage : la branche active **s'éclaire** en live, les autres grisées ; une ligne par cas.
10. **Attendre** — **anneau de chrono** qui se vide (« 3,0 s »).
11. **Attendre que** — condition en une phrase + feu ambre/vert.
12. **Aléatoire pondéré** — **roue / camembert** par poids, l'aiguille s'arrête sur le tirage.
13. **Compteur** — afficheur 7 segments en acier.
14. **Porte (ouvrir / fermer)** — cadenas ouvert / fermé.

*Données & agrégats*
15. **Agréger (histogramme / gagnant)** — **barres qui bougent en direct**, la plus haute couronnée.
16. **Variable** — valeur en grand + **sparkline** de son historique (`jauge_salle = 640`).
17. **Tirer au sort N joueurs** — rangée d'avatars qui **défilent comme une machine à sous** puis se figent.
18. **Classement** — podium top 3 (pseudos + couleur stable).

*Ciblage*
19. **Cible** — **pile d'avatars** + total (« 17 ») + pastilles des équipes concernées ; l'expression en mono
    (`a_voté:"A" - rôle:superviseur`).
20. **Équipe(s)** — pastilles d'équipe (couleur + emblème + effectif) ; capitaine marqué.
21. **Zone / siège** — **plan de salle miniature** (rangs en arc), zones ciblées allumées.
22. **Ceux qui n'ont pas répondu** — avatars grisés + compteur ambre.
23. **Rôle** — badge du rôle (et badge masqué pour un rôle secret).

*Effets téléphone*
24. **Couleur** — **la pastille de la couleur réelle** occupe l'aperçu + un **mini-téléphone** allumé de cette couleur.
25. **Fondu** — dégradé c1 → c2 avec curseur de progression.
26. **Vague** — plan de salle où **un front de couleur traverse** les rangs.
27. **Stroboscope** — damier de couleurs + **jauge de fréquence avec limite 3 Hz** (au-delà : refusé, raison ambre).
28. **Vibrer** — **forme d'onde du motif** (créneaux en ms : « battement », « alerte », morse) + repli iPhone indiqué
    (« iOS : flash + clic »).
29. **Son** — **forme d'onde** du fichier (rampe `--spec-*`), volume, bouton écoute, état « 38 sans son » en ambre.
30. **Message privé / notification** — **mini-téléphone** montrant le bandeau tel que le joueur le verra ; enveloppe
    scellée si privé.

*Interfaces joueur*
31. **Afficher écran** — **mini-téléphone** montrant l'écran type (vote, clavier, réactions, attente…), sélecteur d'écran.
32. **Vote / choix** — options + **barres de résultat qui bougent en live** + anneau de chrono.
33. **Réactions** — grille d'emojis avec compteurs qui pulsent ; **jauge collective** (thermomètre) pour « secouez ».

*Scène, streamer, extérieur*
34. **Écran scène : animer** — mini 16:9 où l'on voit le style choisi (pops, danmaku, fusée) jouer en boucle.
35. **Streamer : consigne** — bandeau de consigne + état « envoyée / **REÇU** ✓ » (ambre tant que non reçue).
36. **Envoyer OSC / MIDI** — façade de console miniature (fader + adresse + valeur).
37. **Changer de rôle / d'équipe** — badge A → badge B.

*Points d'arrêt (dans la vue macro, voir plus bas)*
38. **Point d'arrêt (gate)** — **feu tricolore** vertical : éteint (EN COURS), **ambre** (ARMÉ ; ambre qui pulse =
    AVERTISSEMENT), **vert** (PASSAGE), **rouge** (RETENU) ; dessous la règle en une phrase et une **barre de quorum**
    (« 121/138 — 88 % ») + anneau du délai max (« 0:48 »).

**Deux niveaux de canvas** (même composant, même habit) :
- **Vue macro (la dramaturgie)** : les **segments** sont de grandes cartes (nom en capitales larges, mode de durée
  « 15 s – 90 s », mini-timeline de leurs tops, trois vignettes d'aperçu téléphone / streamer / scène) ; les **gates** sont
  des feux / losanges entre eux ; les **embranchements** (4 → 5A/5B/5C) se lisent d'un coup d'œil ; en live, le chemin
  parcouru est vert, le segment courant cerné d'orange, les branches non prises grisées.
- **Vue flowgraphe (la logique)** : double-clic sur un segment / top / gate → ses nœuds.

**Cadres et sous-graphes** : cadres nommés (« Acte 1 », « Hall ») ; un groupe de blocs se **replie en un sous-graphe**
(carte à ports, mosaïque de ses aperçus, ses fils traversants listés) réutilisable comme une fonction (« Relancer les
retardataires »). **Mini-carte** en bas à droite (blocs peints dans leur accent, segment courant orange en live) et boîte de
zoom au-dessus. **Fil d'Ariane** en haut : `LIVE › 4 Le choix › gate_porte`.

**États à montrer** :
- Écriture : vide (écran vide « Commence par un segment » + gabarits), chargé, **erreurs de validation** (segment
  inaccessible, gate sans délai max, cible vide, effet sans repli iPhone) : pastille ambre sur le bloc + liste dans
  l'inspecteur, clic = aller au bloc ; lien refusé (pointillé orange).
- Répétition : impulsions vertes sur les fils, valeurs live dans les aperçus, **point d'arrêt de débogage** (rond `--rouge`
  dans la marge du bloc) atteint = bloc cerné rouge + pile d'appels.
- Live : canvas en lecture seule, bloc en cours qui « respire » (vert), aperçus vivants.
- Zooms : Ensemble (que les aperçus + noms de cadres en grand), Travail, Détail.

Inspecteur à droite (340 px) : fiche du bloc choisi, règle de gate **en phrase éditable** (chaque mot souligné est un
champ), **aperçus de rôle** côte à côte (téléphone · streamer · scène) qui réagissent à l'édition.

### P0-b — La timeline des segments, gates et pistes de tops
- La **projection linéaire du chemin** courant (ou d'un chemin choisi) : **segments** = sections façon Live (trait de
  couleur 2 px à gauche, nom mono) ; durée **fixe** (bloc plein), **min/max** (plein jusqu'au min, puis zone élastique
  hachurée jusqu'au max), **ouverte** (fondu tireté vers la droite).
- **Gates** = losange / feu entre deux segments, dans la règle, avec son état ; un **embranchement** se signale par un
  sélecteur « chemin : 5A ▾ ».
- **Pistes de tops** (en-têtes façon Live : barre 4 px de couleur, nom en capitales larges, sorte en mono) : **Tous** ·
  **Équipes** (une sous-piste par équipe) · **Superviseurs** · **Streamer** · **Comédiens** · **Écran scène** ·
  **Son / lumière (OSC)** · **Régie** (tops manuels). Un **top** = marqueur (trait + pastille d'icône d'effet) ;
  un effet qui dure (fondu, son) = clip court.
- **Tête de lecture** orange ; horloge de spectacle (pausable) et heure serveur en acier.
- États : **écriture** (glisser segments et tops, aimant, tops en fantôme pendant le glissement) · **répétition** (vitesse
  ×1/×2/×10, saut à un segment « avec un état préparé ») · **live** (segments passés verts « ✓ », segment courant : temps
  écoulé rempli + repères min/max + compte à rebours du gate ; futurs pâles) · vide · erreur (gate sans délai max : losange
  ambre « peut bloquer »).

### P0-c — La régie live
Écran le plus important en représentation. Densité Showrunner, mais **les 5 décisions critiques visibles sans chercher**.
- **En-tête** : « ● LIVE K7Q2 », heure, horloge de spectacle, **présents 138/142**, alertes « ⚠ 2 », trait orange dessous.
- **Bande timeline** (P0-b en compact) + **panneau du gate courant** : feu tricolore, règle en une phrase, **barre de
  quorum 121/138 (88 %)**, « passe à 100 % ou dans 0:48 », liste des manquants cliquable.
- **Transport** : **GO** (le seul orange, grand, raccourci ESPACE affiché) · RETENIR (ambre cerné) · SAUTER À… (fantôme,
  confirmation) · +30 s · PAUSE · **PANIQUE** (`--rouge`, appui long 1 s avec anneau qui se remplit) puis **REPRENDRE**.
- **Tops manuels** du scénario (« Faire vibrer la salle », « Révéler le traître ») en dalles courtes.
- **Joueurs** (rack dense) : point de présence (● présent / ◐ caché / ○ déconnecté), pseudo, badge de rôle (masqué si
  secret), pastille d'équipe, plateforme, latence, a répondu ?, capacités (son ✓ / vibration ✗) ; filtres, recherche,
  **sélection multiple → devient une cible**.
- **Équipes** : une carte par équipe (couleur + emblème + effectif + capitaine + score + jauge).
- **Envoyer à** : constructeur de cible (puces : tous / rôle / équipe / zone / sélection / manquants), puis effets en
  boutons-aperçus (Couleur avec nuancier de données, Vibrer avec motifs, Son, Message, Écran, Changer de rôle), messages
  rapides prédéfinis.
- **Modération** : file (3 en attente) : message, pseudo, bouton ✓ / ✗ / ⭐ vedette / sourdine fantôme ; tampon de 2 s
  visualisé (barre qui se vide).
- **Streamer** : état du flux (24 i/s, 180 ms, 4G, pastille), aperçu de sa vue, **composeur de consigne** + historique
  (envoyée / REÇU).
- **Aperçus** : téléphone d'un joueur précis, vue streamer, écran scène (moniteurs 16:9 et 9:19).
- **Variables** (fiche clé/valeur éditable, chaque modif journalisée) et **Journal** en bas (mono défilant).
- **États** : normal · gate ARMÉ · AVERTISSEMENT · RETENU · **alerte chute des présents** (bandeau `--rouge`) · streamer
  déconnecté (plan B) · **PANIQUE active** (tout le cadre cerné rouge, « REPRENDRE » seul bouton actif) · poste
  **modérateur** (droits réduits : sans GO ni panique, raisons en ambre) · mode **répétition** (bots, ×10).

### P0-d — Les écrans téléphone du spectateur (390 × 844 ; sombre forcé en salle, clair pour avant/après)
1. **Entrée (QR → pseudo)** : titre du spectacle (capitales larges), code K7Q2 en mono, champ pseudo 16 px (16 signes max),
   option zone / siège, bouton ENTRER. Erreurs : pseudo pris (suggestion « Zoé (2) »), pseudo refusé (filtre, sans moraliser),
   code invalide (saisie manuelle de secours), réseau absent. Variante « J'étais déjà là » (fusion validée par la régie).
2. **Toucher pour entrer** : un grand disque au pouce ; une phrase : il active le son, la vibration, le plein écran.
3. **Tutoriel des capacités** (30 s) : test couleur (l'écran s'allume), vibration (« tu l'as sentie ? » oui/non), son
   (« tu l'entends ? »), capteurs (permission iOS), proposition « ajouter à l'écran d'accueil » ; résultat ✓ / ✗ avec repli
   expliqué (« pas de vibration sur iPhone : on fera clignoter l'écran »).
4. **Attente** : noir, pseudo, équipe, « le spectacle commence bientôt », un **pouls** lumineux très discret (vivant mais
   sombre).
5. **Vote** : 2 à 6 options (grandes dalles, couleur de l'option = donnée), anneau de chrono ; après vote « ton vote est
   compté » + barres live (si autorisé) ; **avertissement 10 s** (bord ambre qui pulse) ; résultat révélé.
6. **Chat / clavier sans perte d'écran** : **3 zones** dans `100svh` — haut : consigne (se compacte en une ligne quand le
   clavier est ouvert), milieu : réactions rapides / suggestions du moment, bas : champ **collé au clavier** + gros bouton
   envoyer ; envoyer **sans fermer** le clavier ; barre d'**emojis maison** au-dessus du clavier ; compteur 80 signes ;
   anti-spam doux (« attends 2 s ») ; états « envoyé », « **sur scène ✨** », « en attente de validation », sourdine fantôme
   (identique à « envoyé »). Montre **clavier fermé et ouvert** (iOS et Android).
7. **Réactions emojis** : 6–8 très gros boutons ; appui long = réaction plus forte (anneau qui se charge) ; combo de salle.
8. **Couleur plein écran** : aucune interface (un repère invisible) ; variantes **noir**, **lampe** (blanc), fondu, vague.
9. **Message privé** : enveloppe scellée qui s'ouvre, texte d'un personnage, « garde-le pour toi » ; **mission de rôle
   secret** (badge masqué, objectif, compteur).
10. **Équipe** : révélation (couleur pleine + emblème + nom + « 35 coéquipiers »), capitaine (marque + droit de valider),
    score, défi d'équipe (**secouer** : jauge qui monte, comparaison avec les autres équipes).
11. **Onglet superviseur** (même téléphone, un onglet en bas) : compteurs de salle, file de modération au pouce,
    consignes privées, liste des rôles secrets, boutons autorisés par le scénario ; l'onglet joueur reste accessible.
12. **Reconnexion** : bandeau discret « reconnexion… » **sans perdre l'écran** ; « session ouverte ailleurs » ; retour =
    même écran exactement.
13. **Fin** : message du personnage, souvenir à partager.

### P1-e — La vue streamer (téléphone, en mouvement)
Retour caméra plein écran ; bandeau de consigne (tiers haut, capitales larges 32–44 px) + « ensuite : … » ; bouton **REÇU**
(orange, 72 px) ; consigne **urgente** (aplat ambre, vibration, persistante) ; anneau de chrono ; état du flux ; bande de
réactions compacte + commentaire épinglé (« Lis le commentaire de Zoé42 »). États : en direct, **réseau dégradé** (ambre),
**coupé** (rouge + « reconnexion »), en attente du début, **panique** (« STOP — la régie a tout coupé »).

### P1-f — L'écran de scène (1920 × 1080)
Sur le flux vidéo du streamer :
- **Pop** (bulle qui grossit avec rebond, reste 3–6 s, s'envole) ; **danmaku** (lignes qui traversent de droite à
  gauche) ; **typographie cinétique** (mot à mot) ; **commentaire vedette** (grand format, couleur du pseudo) ;
  **nuage de mots** final ; **écho** (message lu par le streamer qui s'illumine).
- **Feux d'artifice d'emojis** (1 tap = 1 particule ; 30 taps en 2 s = une fusée qui éclate) ; **cœurs qui montent** ;
  **jauge de salle / combo** (multiplicateur, secousse d'écran) ; **barres de vote** qui gonflent puis **révélation**
  (roulement, explosion du gagnant) ; **barres d'équipes** ; alerte « cadeau » plein écran.
- Bandeau « EN DIRECT » (pastille rouge + capitales larges) ; **plan B « connexion perdue »** dans le style du personnage ;
  écran **panique** (image de secours sobre).
- **Gabarits par séquence** à montrer : calme, folie, vote, entracte, panne. Indique la **zone protégée** (visage).

### P1-g — La bibliothèque de composants
Une planche par famille, chaque composant avec **variantes et états** (repos, survol, actif, désactivé + raison, erreur,
chargement, vide) en **sombre et clair** :
- Jetons (nuancier avec noms et rôles), échelle typographique (les quatre voix), espacements, rayons, filets, trame.
- Boutons (`.tb`, `.go`, `.on`, `.ghost`, `.sm`, GO géant, PANIQUE à appui long, REÇU), segmentés, pastilles d'état,
  champs, fader, molette, jauge, vumètre, menu, modale, toast, avertissement, `.why`.
- Rangée de rack → **carte joueur** ; **badge de rôle** (13 rôles, version masquée pour les secrets) ; **pastille
  d'équipe** (couleur + emblème) ; **pile d'avatars** ; **avatar de pseudo** (initiales sur sa couleur stable).
- **Feu tricolore**, **anneau de chrono**, **barre de quorum**, **mini-téléphone** d'aperçu, **forme d'onde** (son /
  vibration), **pastille de couleur réelle**, **plan de salle**, **sismographe**, **barres de vote animées**.
- Tuile de bloc (coque, en-tête, témoin, aperçu, réglages, ports exec/données), fils (tous types et états), cadre, sous-graphe,
  mini-carte, boîte de zoom, barre de sélection, liste rapide, catalogue.
- Éléments de timeline (segment fixe / min-max / ouvert, gate, top, piste, tête de lecture, règle).
- Composants téléphone (grand bouton d'option, champ collé au clavier, barre d'emojis maison, enveloppe, bandeau de
  reconnexion) et éléments d'écran scène (pop, ligne de danmaku, fusée, cœur, jauge, révélation).

---

## 6. Livrables attendus de Claude Design

1. **Maquettes haute fidélité** des écrans P0 (a, b, c, d), puis P1 (e, f, g), aux tailles : 1600 × 1000 (régie / éditeur),
   390 × 844 (téléphone, + clavier ouvert), 1920 × 1080 (scène). **Chaque écran en sombre ET en clair**, la bascule se
   faisant uniquement par `data-theme` sur `<html>` ; les écrans « salle » marqués `data-salle` (sombre forcé).
2. **La planche des blocs du canvas** : au moins **20 blocs types** dessinés (idéalement les 38), chacun à 3 niveaux de zoom
   (Ensemble / Travail / Détail) et en états écriture / répétition / live.
3. **Prototypes interactifs** (HTML/CSS/JS) pour : la séquence téléphone *entrée → toucher → tutoriel → vote → résultat* ;
   le clavier du chat (3 zones) ; le **GO** et la **panique** de la régie ; un pop + une fusée d'emojis sur l'écran scène ;
   un bloc « Vote » dont les barres bougent.
4. **Le code des composants en HTML/CSS** utilisant **exactement les noms de jetons** du § 2 (`var(--panel2)`, `var(--or)`…),
   filets en `box-shadow: inset`, aucune couleur en dur hors des déclarations de jetons ; il **charge les feuilles du kit**
   (`tokens.css`, `base.css`, `curseur.css`, `tete.css`…) au lieu de les recopier, et `theme-tot.js` en tête du `<head>`.
   Les composants nouveaux vont dans une feuille à part (`studio-real.css`), jetons nouveaux déclarés dans les deux blocs.
4 bis. **Une page de référence STUDIO_REAL** sur le modèle de `0-page-de-reference/theme.html` : aucune couleur ni fonte
   définie dans la page, bascule sombre / clair, nuancier, spécimens, et chaque composant nouveau en démonstration.
5. **La liste des jetons nouveaux** que tu proposes (nom, sombre, clair, rôle, contraste mesuré) — au minimum : `--salle-noir`,
   `--on-amb`, `--exec`, `--live`, `--gate-*`, `--fam-*`, `--role-*`, `--eq-1…8` (équipes par défaut), `--pseudo-1…12`
   (couleurs stables des pseudos sur l'écran scène).
6. **Les spécifications de mouvement** : durées, courbes (ressorts : raideur / amortissement), ce qui est coupé en
   « animations réduites », débit maximal de l'écran scène.
7. Une **page de règles** courte (do / don't) avec des exemples visuels des règles dures du § 3.

## 7. Questions à te poser (réponds-y dans tes livrables)

1. **Familles de blocs** : les accents proposés (§ 5, P0-a) se distinguent-ils assez entre eux **et** de l'orange de
   sélection, en sombre et en clair ? Sinon, quels jetons proposes-tu (avec mesures de contraste) ?
2. **Exécution vs données** : comment rendre le flux d'exécution lisible en live (impulsions) **sans bruit visuel** quand
   200 bots déclenchent des événements à la seconde ? Faut-il agréger (« ×37 ») ?
3. **Zoom Ensemble** : quel est l'aperçu minimal de chaque bloc qui reste lisible à 25 % (une icône ? la pastille ? la
   barre dominante ?) — propose la règle générale.
4. **Remplaçants de polices** : Michroma et Bodoni Moda / Italiana tiennent-ils l'esprit de Venus Rising et Norelli ?
   Propose mieux si tu connais (OFL obligatoire), et montre un spécimen côte à côte.
5. **Téléphone dans le noir** : quelle luminance maximale pour l'interface entre deux effets, et quelle taille minimale
   de mono reste lisible à bout de bras dans une salle éteinte ?
6. **Équipes et daltonisme** : quels 8 couples couleur + emblème restent distincts pour tous et sur l'écran scène ?
7. **Rôles secrets** : comment les montrer en régie sans qu'un spectateur qui regarde l'écran d'un superviseur par-dessus
   son épaule les découvre (badge masqué, révélation au maintien) ?
8. **GO et panique** : quelles protections contre le double GO accidentel et la panique déclenchée par erreur, sans ralentir
   la régie (appui long, délai d'annulation, confirmation) ?
9. **Écran scène** : quelle densité maximale (pops simultanés, lignes de danmaku) avant que ce soit illisible à 15 m ?
   Comment représenter le surplus (« la densité des effets ») ?
10. **Clavier du chat** : quelle mise en page résiste au clavier iOS **et** Android, avec la consigne toujours visible ?
11. **Vue streamer** : la consigne urgente en aplat ambre est-elle assez forte en plein soleil, en extérieur ?
12. **Mode clair** : la règle par surface du § 4.0 te paraît-elle juste ? Les nouveaux composants (feu tricolore, aperçus de
    blocs, barres de vote, pastilles d'équipe) tiennent-ils AA en clair sans changer de dessin ?
12 bis. Y a-t-il, dans les sources du kit, un composant que tu as dû **modifier** pour l'un de nos écrans ? Liste chaque
    écart à la source et sa raison (par défaut, il ne doit y en avoir aucun).
13. Y a-t-il un composant Showrunner décrit ici que tu **déconseilles** pour une surface donnée, et pourquoi ?
