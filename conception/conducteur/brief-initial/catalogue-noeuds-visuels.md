# Étude — Des blocs de fonction VISUELS pour le canvas nodal

*Étude du 26 octobre 2026. Complète [03 — Moteur de scénario](../03-moteur-scenario.md) (§4.2, première liste de nœuds),
[02 — Capacités du téléphone](../02-capacites-telephone.md), [05 — Régie et studio](../05-regie-et-studio.md),
[06 — Cas LIVE](../06-cas-live-streamer.md) et [08 — Catalogue de mécaniques](../08-catalogue-mecaniques.md).*

> **La demande du propriétaire** : « sur notre canvas il faut des blocs de fonction qui soient VISUELS, pas juste une carte
> avec des paramètres » ; « on fait large pour les fonctions dont on a besoin » ; « regarde ce qui se fait déjà ».

> **Limite de la recherche** : le budget de recherche web de la session a été épuisé en cours d'étude. Les sources marquées
> **‡** dans la bibliographie (§9) sont des pages officielles connues mais **non revérifiées en ligne le 26/10/2026** ;
> les affirmations qui en dépendent sont formulées prudemment et sont à confirmer par une seconde passe.

---

## 0. En bref (ce qu'il faut retenir)

1. **Un bloc lisible montre le RÉSULTAT, pas les réglages.** Les outils qu'on cite comme modèles (TouchDesigner, ComfyUI,
   Shader Graph, Copernicus dans Houdini) mettent l'aperçu de la sortie *dans* le nœud ; les réglages vont dans l'inspecteur.
2. **Chaque bloc a un « corps vivant »** (la fenêtre du milieu) dont le contenu dépend du mode :
   *écriture* = aperçu simulé avec des données fictives ; *répétition* = valeurs des bots ; *live* = valeurs réelles qui bougent.
3. **On reconnaît une famille avant de lire** : couleur d'en-tête + icône + **forme** (déclencheur en « chapeau » à la Scratch,
   gate en losange, nœud latent avec anneau de temps, nœud de données en capsule sans broche d'exécution).
4. **Quatre tailles par bloc** (puce → réduit → standard → déplié) et un **zoom sémantique** : de loin on voit des pastilles
   colorées, de près les aperçus vivants. Comme le « collapse » de Shader Graph ou le viewer de TouchDesigner qu'on active.
5. **Le flux se voit** : une impulsion court sur le fil d'exécution quand il se déclenche (Blueprints), les fils de données
   affichent le nombre d'éléments passés (façon n8n), les nœuds portent un **statut** pastille/anneau + court texte (Node-RED).
6. **On regroupe** : cadres colorés nommés, commentaires, sous-graphes avec vignette (macro = « effet vague complet »).
7. **Catalogue : 320 nœuds exécutables** en 22 familles (+ 6 outils du canevas, §6) : **160 en v1**, 128 en v2, 32 plus tard ; un **v1 minimal pour jouer LIVE** en retient ≈ 100 (§7).
8. Techniquement c'est **compatible avec React Flow** (choisi dans [07](../07-architecture-technique.md)) : un nœud personnalisé est un
   composant React qui peut contenir n'importe quoi (graphiques, mini-téléphone, forme d'onde).
9. **Contrainte de performance** : 200 blocs vivants à 60 i/s, c'est trop. Règle : animer seulement les blocs visibles et assez
   zoomés, données de live limitées à 5 Hz par bloc, dessin en `<canvas>` pour les courbes.
10. **Accessibilité** : jamais la couleur seule (toujours icône + forme), respect de « réduire les animations », et garde-fou
    photosensibilité aussi dans l'éditeur (un aperçu de stroboscope ne clignote pas à 10 Hz sur l'écran de régie).

---

## 1. État de l'art : ce que font les éditeurs nodaux visuels

### 1.1 Outil par outil

| Outil | Ce qui est VISUEL dans le nœud | Ce qu'on en retient pour le studio |
|---|---|---|
| **ComfyUI** | Nœuds « Preview Image » / « Mask Preview » qui affichent l'image produite pendant l'exécution ; les nœuds en cours d'exécution sont surlignés ; groupes colorés. | Un nœud *aperçu* que l'on branche n'importe où (« sonde visuelle ») ; surligner le nœud qui s'exécute. |
| **Blender** — Shader Editor / Geometry Nodes | Aperçus de nœuds dans l'éditeur de shaders (première implémentation dans la PR #110065, via la zone de prévisualisation des surimpressions) ; nœud **Viewer** en Geometry Nodes pour voir n'importe quelle sortie intermédiaire ; nombreuses extensions qui ajoutent des vignettes rendues au-dessus des nœuds ; cadres (*frames*), reroutes. | Le nœud **Viewer** : un seul raccourci pour « montre-moi ce qui sort d'ici » dans l'aperçu de rôle. Vignettes au-dessus du nœud plutôt que dedans pour ne pas l'élargir. |
| **TouchDesigner** | Chaque opérateur affiche **son propre viewer** (image pour les TOP, courbes pour les CHOP, tableau pour les DAT) ; un drapeau *Viewer* l'affiche, le drapeau *Viewer Active* le rend interactif (on peut manipuler le contenu dans le nœud) ; couleur par famille d'opérateurs. | **La référence** : le corps du nœud EST la sortie. Deux niveaux : aperçu passif / aperçu actif (on peut cliquer dedans, ex. tester un écran de vote). Couleur par famille. |
| **Houdini** | **Drapeaux** visibles sur le nœud (affichage bleu, rendu violet, gabarit marron, contournement jaune, verrou rouge) avec anneau coloré autour du nœud ; vignettes de prévisualisation dans les réseaux Copernicus ; formes et couleurs de nœuds personnalisables. | Des **drapeaux d'état** sur chaque bloc : *contourné* (bypass, jaune), *verrouillé*, *point d'arrêt*, *épinglé*, *désactivé en live*. |
| **Unreal Blueprints** | Broches d'exécution blanches et broches de données colorées par type ; **points d'arrêt** (octogone rouge) ; **« Watch this value »** : une bulle flottante affiche la dernière valeur d'une broche ; fenêtre de trace des nœuds exécutés ; fils d'exécution qui s'illuminent pendant le jeu. | Déjà adopté dans [03 §4.1](../03-moteur-scenario.md). On ajoute : **bulles de valeur** sur les broches surveillées, **impulsion lumineuse** sur les fils en répétition et en live. |
| **Unreal MetaSounds / Sound Cues** | Éditeur MetaSound : **vu-mètre temps réel** sur la sortie, **widgets dans le graphe** (potentiomètres, curseurs) pour piloter et visualiser des paramètres, boutons pour déclencher des événements en direct. Audio Insights : oscilloscope, spectrogramme… (panneau séparé). | Les nœuds son ont une **forme d'onde + vu-mètre** ; on peut **écouter depuis le nœud** (bouton lecture) et **déclencher depuis le nœud** (bouton « tester »). |
| **Unreal Niagara** ‡ | Pile de modules par étape (émetteur, particule) plutôt que fils ; aperçu 3D de l'effet. | Pour les effets de l'écran scène, une **vignette 16:9 animée** de l'effet, comme l'aperçu Niagara. |
| **Unity Shader Graph** | Chaque nœud a une **fenêtre d'aperçu de sa sortie principale**, repliable ; un bouton replie le nœud entier (cache les ports non branchés) ; commande « replier tous les aperçus » ; nœud **Preview** passe-plat qui affiche un aperçu n'importe où. | Bouton **repli de l'aperçu** séparé du **repli des ports** ; commande globale « tout replier / tout déplier ». Nœud *Sonde* passe-plat. |
| **Max/MSP** ‡ | Les objets d'interface vivent **dans** le patch (nombres, curseurs, `scope~`, `spectroscope~`, `live.*`) ; mode **présentation** qui ne montre que l'interface. | Les blocs « Curseur régie », « Bouton régie », « Compteur » sont des **contrôles utilisables directement sur le canvas** en répétition/live. Un mode « présentation » = la régie live construite à partir des blocs marqués. |
| **Pure Data** ‡ | Objets graphiques (bang, toggle, slider, number) et **tableaux** (*arrays*) dessinés dans le patch ; *graph-on-parent* : un sous-patch montre son interface sur son parent. | **Sous-graphe avec façade** : un sous-graphe affiche à l'extérieur un mini-panneau choisi par l'auteur (ex. la jauge de l'effet « Secouez pour l'aider »). |
| **vvvv gamma** ‡ | Programmation vivante (le patch tourne pendant qu'on l'édite) ; *IOBox* qui affichent et éditent des valeurs ; info-bulles avec valeurs courantes ; couleurs par type. | L'éditeur doit pouvoir rester **« branché »** sur une répétition en cours : on modifie un bloc, l'effet change sans relancer. |
| **cables.gl** | Éditeur web de patchs WebGL ; ports colorés par type ; sous-patchs ; aperçu de textures (détail de l'interface non revérifié, la page de documentation consultée n'en parle pas). | Preuve qu'un éditeur nodal **dans le navigateur** peut montrer des aperçus vivants. |
| **Nodes.io** | Programmation « comme un croquis sur une toile », zoom pour s'approcher ou s'éloigner du problème, blocs de code réutilisables et annotables. | Le **zoom sémantique** et l'annotation libre sur la toile. |
| **Origami Studio** | Éditeur de *patches* relié à un canvas de calques et à un **aperçu en direct** (et l'app Origami Live sur téléphone). | L'**aperçu de rôle** à droite (déjà prévu dans 05) doit réagir à la sélection d'un bloc : clic sur un bloc « Écran vote » → le faux téléphone montre cet écran. Envoi vers un **vrai téléphone de test** en un clic. |
| **Bitfocus Companion** | Des **boutons** dont l'apparence (couleur, texte, image) est pilotée par des *feedbacks* venant des appareils ; un bouton = une action + son état. | Les **boutons régie** du scénario se dessinent comme une touche de Stream Deck : couleur + libellé + état vivant (« 17 manquants »). |
| **Chataigne** | Hub central de contrôle (OSC, MIDI, DMX, Art-Net, MQTT) avec modules communautaires ; machines à états et timeline (à confirmer sur la doc, la page d'accueil consultée ne les décrit pas). | Les nœuds **réseau externe** affichent l'état de la connexion du module (vert/rouge) et le dernier message reçu/envoyé. |
| **Node-RED (+ Dashboard)** | **Statut** sous chaque nœud : une **pastille ou un anneau** (rouge, vert, jaune, bleu, gris) + un court texte (< 20 caractères) ; Dashboard 2.0 : widgets jauge, graphique, bouton. | **Adopté tel quel** : chaque bloc porte un statut forme+couleur+texte court (« 121/138 », « connecté », « en attente »). |
| **Scratch / Blockly** | La **forme dit où ça s'emboîte** : chapeau (début de script), pile (commande), hexagone (booléen), arrondi (valeur), en C (boucle/condition), cap (fin) ; catégories colorées ; pièces de puzzle. | **Formes porteuses de sens** (§2.3) : déclencheur en chapeau, booléen à bouts pointus, valeur à bouts ronds, boucle/« pour chaque » en C qui enveloppe visuellement. |
| **Make / Zapier / n8n** | Make ‡ : modules ronds avec le logo du service, bulle du nombre d'opérations après exécution. n8n : panneau des exécutions, **données épinglées** (*data pinning*) pour retester sans rappeler les services externes. | **Badge de comptage** après exécution ; **épingler** la sortie d'un bloc (ex. un résultat de vote) pour travailler la suite sans rejouer. |
| **Figma / FigJam widgets** | Objets interactifs posés sur la toile, **partagés** : tout le monde voit et manipule le même widget. | Les commentaires et post-it du canvas sont **partagés** entre auteurs (cohérent avec l'édition à plusieurs). |
| **React Flow (xyflow)** | Un nœud personnalisé est un composant React ordinaire enregistré dans `nodeTypes` : il peut afficher n'importe quel contenu. | **Faisabilité confirmée** pour la pile prévue : chaque famille = un composant de corps vivant. |

### 1.2 Ce qui rend un nœud lisible d'un coup d'œil (synthèse)

| # | Levier | Exemple de référence | Règle pour le studio |
|---|---|---|---|
| 1 | **Aperçu vivant de la sortie** | TouchDesigner, Shader Graph, ComfyUI | Le corps du bloc montre ce que le public / la scène / le streamer va percevoir. |
| 2 | **Forme porteuse de sens** | Scratch, Blockly, losanges de décision | 6 formes seulement (§2.3), apprises en 5 minutes. |
| 3 | **Couleur par famille** | TouchDesigner, Scratch, cables.gl | 1 couleur d'en-tête par famille (§2.4), jamais réutilisée pour autre chose. |
| 4 | **Icône** | Make, Companion | Icône à gauche de l'en-tête, lisible aussi en mode puce. |
| 5 | **Couleur par type de donnée** | Blueprints, vvvv | Broches et fils colorés par type (§2.2). |
| 6 | **Mode réduit / développé** | Shader Graph, Blueprints (« collapse to node ») | 4 tailles + zoom sémantique (§2.5). |
| 7 | **Valeurs en direct** | Blueprints « Watch », vvvv, Node-RED statut | Statut + bulles de valeur + badges de comptage. |
| 8 | **Animation du flux** | Blueprints en PIE | Impulsion sur les fils d'exécution, épaisseur/particules sur les fils de données selon le débit. |
| 9 | **Drapeaux d'état** | Houdini | Contourné, verrouillé, point d'arrêt, épinglé, en erreur. |
| 10 | **Regroupement** | Blender frames, ComfyUI groupes, Pd graph-on-parent | Cadres, sous-graphes à façade, commentaires. |
| 11 | **Interaction dans le nœud** | TouchDesigner Viewer Active, MetaSounds widgets, Max | On peut tester (écouter, faire vibrer, voter) depuis le bloc. |
| 12 | **Phrase-résumé** | (règle de passage « en une phrase » du studio) | Pied de bloc : une phrase en français, générée depuis les paramètres. |

---

## 2. La grammaire visuelle du studio

### 2.1 Anatomie d'un bloc

```
            ┌─ drapeaux (bypass, verrou, point d'arrêt, épinglé)
 ╭──────────┴───────────────────────────────╮
 │ [icône] VIBRER              ◉ statut     │ ← EN-TÊTE : couleur de la famille, icône, nom, statut (forme + couleur)
 ├──────────────────────────────────────────┤
 ▶ exéc                               exéc ▶ │ ← broches d'exécution (blanches)
 ◎ cible                          envoyés ● │ ← broches de données (couleur du type)
 │ ╭──────────────────────────────────────╮ │
 │ │  ▂▂▅▅▂▂  ▂▂▅▅▂▂  ▂▂▅▅▂▂   (motif)   │ │ ← CORPS VIVANT : l'aperçu (ici la forme d'onde du motif)
 │ │  [▷ tester sur le téléphone témoin] │ │    interactif au survol / en mode actif
 │ ╰──────────────────────────────────────╯ │
 │ Battement · 3 × · repli iPhone : flash   │ ← PIED : la phrase-résumé (générée)
 ╰──────────────────────────────────────────╯
     └ badge : « 138 » (envois au dernier passage)
```

- **En-tête** : couleur de famille + icône + nom (renommable : « Vibrer — cœur du héros »). À droite, le **statut** à la Node-RED
  (pastille pleine = actif/OK, anneau = en attente, couleur = gravité) et un texte court.
- **Corps vivant** : la représentation propre à la famille (§4 et §6). Toujours lisible sans texte.
- **Pied** : phrase-résumé (« Vibrer **les retardataires** en **battement** 3 fois, repli iPhone **flash** »). C'est elle qui est lue
  en mode réduit et dans la timeline.
- **Badges** autour du bloc : compteur d'exécutions ou d'envois, avertissement de validation (cible vide, pas de repli iPhone, gate sans max).
- **Inspecteur** (panneau de droite, déjà prévu dans 05) : tous les paramètres. **Le bloc n'est pas un formulaire.** On ne met dans
  le corps que 0 à 2 contrôles directs (ex. la pastille de couleur qu'on clique pour changer la couleur).

### 2.2 Broches et fils : types de données

| Type | Broche | Couleur du fil | Remarque |
|---|---|---|---|
| Exécution | triangle ▶ | blanc | l'ordre des actions (comme Blueprints) ; impulsion lumineuse quand il passe |
| Booléen | losange ◆ | rouge | bouts pointus (Scratch) |
| Nombre | rond ● | vert | |
| Texte | rond ● | rose | |
| **Cible** (ensemble de joueurs) | anneau ◎ | orange | fil **épais**, son épaisseur ∝ nombre de joueurs (log) en répétition/live |
| Joueur (un seul) | rond plein ☺ | jaune | |
| Couleur | rond ● | **le fil prend la couleur transportée** | lisible sans légende |
| Média (son, image, vidéo) | carré ■ | violet | |
| Événement / charge utile (vote reçu, texte reçu…) | rond ● | cyan | se déplie en sous-broches (auteur, valeur, heure) |
| Liste de X | broche de X doublée ●● | couleur de X, fil double | |
| Objet / dictionnaire | hexagone ⬡ | gris | plus tard |

Fils : **courbes de Bézier** par défaut ; **reroute** (point de passage) pour ranger ; les fils de données deviennent **pointillés**
quand la valeur n'a pas encore été calculée dans la session en cours.

### 2.3 Les six formes

| Forme | Pour | Inspiration |
|---|---|---|
| **Chapeau** (dessus arrondi, pas de broche d'exécution entrante) | déclencheurs : ce qui démarre un fil | « hat block » de Scratch |
| **Rectangle** (standard) | actions et effets | Blueprints |
| **Capsule** (sans broche d'exécution, coins très arrondis) | données pures, calculs, ciblage : se recalculent à la demande | nœuds « purs » des Blueprints, *reporters* de Scratch |
| **Rectangle avec anneau de temps** dans le coin | nœuds **latents** (attendre, collecter, écran qui attend une réponse) : l'anneau se remplit pendant l'attente | |
| **Losange / hexagone** | gates et décisions (si, selon, gate) | organigramme ; hexagone booléen de Scratch |
| **Double bord** | sous-graphes / macros (le contenu est ailleurs) | sous-patchs de Pd / Max |
| **Bord en « prise »** (encoche côté droit) | sorties vers l'extérieur (OSC, MIDI, HTTP, DMX) : signale que ça quitte le serveur | |

### 2.4 Couleurs de familles (proposition, à décliner en jetons)

Le fichier `design/tokens.css` définit déjà des accents (`--or` orange = action/alerte, `--amb` ambre = « ce qui attend »,
`--cy` acier = valeurs lues, `--grn`/`--grn2` vert = engagé/progression). On propose d'ajouter des jetons `--fam-*` qui restent cohérents :

| Famille | Teinte | Logique |
|---|---|---|
| Déclencheurs | acier pâle (`--cy`) | « quelque chose arrive » |
| Flux / logique | gris clair | structure, neutre |
| Temps | ambre (`--amb`) | « ça attend » |
| Gates / règles | ambre + liseré orange | attente + décision |
| Données / maths / texte / listes | vert sourd | valeurs |
| Agrégats / statistiques | vert clair | « la salle en chiffres » |
| Ciblage / participants | orange clair | « à qui » |
| Interfaces téléphone | bleu | ce que le joueur voit et fait |
| Effets téléphone | violet / magenta | ce que le joueur ressent |
| Capteurs / caméra / micro | turquoise | mesures du corps |
| Écran scène / vidéo | indigo | ce que la salle regarde |
| Streamer / comédiens | corail | consignes privées |
| Régie / modération | orange (`--or`) | « la main humaine » |
| Réseau externe | brun | sort du serveur |
| IA | rose pâle | (avec liseré « relecture humaine ») |
| Jeux | jaune or | score, classement |
| Débogage / test | gris tramé | n'existe pas en live |

Règle : **la couleur n'est jamais seule** (icône + forme + nom), pour les daltoniens et l'impression noir et blanc.

### 2.5 Tailles et zoom sémantique

| Taille | Contenu | Quand |
|---|---|---|
| **Puce** (≈ 32 px) | icône + couleur + statut | zoom < 40 % ; vue d'ensemble d'un gros flowgraphe |
| **Réduit** | en-tête + phrase-résumé, broches non branchées cachées | par défaut pour les blocs « finis » ; comme le repli Shader Graph |
| **Standard** | en-tête + corps vivant + pied | par défaut à la création |
| **Déplié** | corps agrandi, interactif (« viewer actif » de TouchDesigner), mini-journal du bloc | double-clic ; ou ouverture en **fenêtre flottante** (TouchDesigner « View… ») |

Le **zoom sémantique** bascule automatiquement puce ↔ réduit ↔ standard selon le niveau de zoom, sauf si l'auteur a fixé une taille.

### 2.6 Les trois modes : ce que montre le corps vivant

| | Écriture | Répétition | Représentation (live) |
|---|---|---|---|
| Source des données | **données d'exemple** (salle fictive de 120 joueurs, réglable) | bots + vrais téléphones de test, horloge accélérable | vrais joueurs |
| Rythme d'animation | au survol ou en boucle douce | réelle ×1, ×2, ×10 | réelle, **plafonnée à 5 Hz** par bloc |
| Fils | statiques | **impulsion** sur les fils d'exécution qui passent ; compteur sur les fils de données | idem, + le fil du segment courant en surbrillance |
| Statut | validation (cible vide, pas de repli…) | état d'exécution (en attente, actif, fini, erreur) | idem + alertes (gate bloquée, flux streamer coupé) |
| Interaction | **tester** : envoie l'effet au téléphone témoin / à l'aperçu de rôle | **tester** + **injecter** (faire voter un bot) + **point d'arrêt** + **épingler** la sortie | **lecture seule par défaut** ; seuls les blocs régie (boutons, curseurs, confirmations) sont cliquables |
| Teinte de fond du canvas | neutre | trame « répétition » | liseré rouge « LIVE » (on sait qu'on touche au vrai) |

### 2.7 Regroupement, commentaires, navigation

- **Cadres** (frames de Blender / groupes de ComfyUI) : rectangle coloré nommé, repliable, déplaçable avec son contenu.
  Ex. « Relance des retardataires », « Révélation ».
- **Sous-graphes à façade** (graph-on-parent de Pure Data) : un sous-graphe montre à l'extérieur la vignette de son choix
  (la jauge, la vague…). Ils forment la **bibliothèque de recettes** (« Vague de couleur », « Vote à embranchement complet »).
- **Commentaires / post-it** partagés, avec image possible (croquis de mise en scène).
- **Minicarte** et **recherche** (« où est utilisé `score_rouges` ? ») ; **signets** pour sauter d'un endroit à l'autre.
- **Reroutes** pour ranger les fils ; option d'alignement automatique.

### 2.8 Performance (à respecter dès le prototype)

- Animer seulement les blocs **visibles à l'écran** et au zoom ≥ standard ; les autres affichent une image figée.
- Données de live envoyées à l'éditeur en **instantanés agrégés à 5 Hz** maximum par bloc (cohérent avec la remontée des capteurs, [07 §4](../07-architecture-technique.md)).
- Formes d'onde, histogrammes, courbes dessinés en **`<canvas>`** (pas des centaines de nœuds DOM) ; vignettes d'écran scène en image réduite.
- **Réduire les animations** (préférence système) : impulsions remplacées par des changements de couleur.

---

## 3. Le « corps vivant » : 12 composants réutilisables

Pour ne pas coder 200 aperçus différents, on fabrique **12 composants de corps** paramétrables, et chaque nœud en choisit un :

| Composant | Montre | Utilisé par |
|---|---|---|
| **Pastille / nuancier** | couleur réelle, dégradé, séquence de couleurs | Couleur, Fondu, Stroboscope, Vague, Équipes |
| **Forme d'onde** | motif temporel (vibration, son, enveloppe) avec tête de lecture | Vibrer, Son, Voix, Courbe, Métronome |
| **Mini-téléphone** | l'écran du joueur rendu en miniature (vrai rendu de l'app joueur) | tous les écrans types, Notification, Message privé |
| **Vignette 16:9** | rendu réduit de l'écran scène / du flux streamer | Écran scène, Vidéo, Streamer |
| **Barres / histogramme** | répartition en direct | Vote, Agrégats, Classement, Quiz |
| **Jauge** (arc ou barre) | une valeur entre min et max, seuils marqués | Capteurs, Énergie salle, Curseur, Score |
| **Anneau de temps** | durée écoulée / restante | Attendre, Chrono, Compte à rebours, Timeout |
| **Foule** | nuage de points (1 point = 1 joueur, couleur = équipe/état), compteur | Cible, Population, Tirage, Équipes |
| **Feu / machine à états** | états et état courant allumé | Gate, Porte, Machine à états, Interrupteur |
| **Valeur** | grand nombre ou texte + mini-courbe (sparkline) de l'historique | Variable, Calcul, Compteur, Débit |
| **Bulle de texte** | texte rendu (avec variables remplies par un exemple) | Texte, Consigne, Commentaire vedette, IA |
| **Journal** | 3 dernières lignes défilantes | Réception OSC/HTTP, Modération, Journaliser |

---

## 4. Représentation visuelle par famille (et par mode)

| Famille | Forme · icône | Écriture | Répétition | Live |
|---|---|---|---|---|
| **Déclencheurs** | chapeau · éclair | icône de la source + la condition en clair (« quand **quelqu'un secoue** fort ») | flash de l'en-tête à chaque déclenchement, compteur | idem + fréquence (« 4,2/s ») |
| **Flux / logique** | losange (si, selon) · rectangle | les branches sont étiquetées (« oui / non », valeurs du switch) | la branche prise s'allume | idem |
| **Temps** | anneau · sablier | anneau avec la durée | anneau qui se remplit, temps restant | idem ; avance rapide visible |
| **Gates / règles** | losange ambre · feu | **feu tricolore** EN COURS / ARMÉ / AVERTISSEMENT / RETENU / PASSAGE + la phrase de la règle | état courant allumé + barre de progression (« 88 % ») | idem, en grand dans la timeline ; GO/RETENIR cliquables |
| **Données** | capsule · `x=` | la valeur d'exemple | valeur + sparkline | valeur réelle + sparkline ; modifiable avec journalisation |
| **Agrégats** | capsule · histogramme | barres sur données d'exemple | barres qui bougent | barres qui bougent (5 Hz) |
| **Ciblage** | capsule · cible | **foule** de points : qui est dans la cible (sur la salle d'exemple), nombre estimé | nombre réel + avatars/couleurs d'équipes | idem ; survol = liste des pseudos |
| **Participants / équipes** | rectangle · personnages | **blasons** des équipes avec effectif | effectifs réels | idem |
| **Interfaces téléphone** | rectangle + anneau (latent) · téléphone | **mini-téléphone** avec l'écran rendu (textes réels, couleurs du thème) | mini-téléphone + taux de réponse (« 47/52 ») | idem ; clic = voir l'écran d'un joueur précis |
| **Effets téléphone** | rectangle · onde | pastille / forme d'onde / bulle, bouton **tester** | badge « envoyés à 138 » + « repli : 23 iPhone » | idem |
| **Capteurs** | chapeau ou capsule · boussole | jauge animée sur un signal d'exemple, seuil réglable en glissant | jauge réelle (moyenne de la cible) + nuage de points | idem |
| **Caméra / micro** | rectangle · objectif | vignette exemple / vu-mètre | vignettes reçues (floutées tant que non modérées) | idem |
| **Écran scène** | rectangle · projecteur | **vignette 16:9 animée** de l'effet (générateur de faux messages) | vignette réelle (rendu réduit de la page scène) | idem |
| **Streamer / comédiens** | rectangle · casque | **bulle de consigne** telle que le streamer la voit | état « envoyée / lue / reçue ✓ » | idem + délai de réponse |
| **Vidéo** | rectangle · pellicule | vignette + barre de temps | idem + images/s, latence | idem |
| **Régie** | rectangle orange · main | **touche de Stream Deck** (couleur, libellé) | cliquable | cliquable, état vivant (« 17 manquants ») |
| **Modération** | rectangle · bouclier | file d'exemple | file réelle (3 dernières), compteurs ✓/✗ | idem |
| **Médias** | capsule · fichier | vignette / forme d'onde / première image | | |
| **Réseau externe** | bord en prise · antenne | adresse + dernier message (exemple) | pastille connexion + journal | idem |
| **IA** | rectangle rose · étincelle | bulle avec réponse d'exemple ; liseré « relecture » | réponses réelles + file de relecture | idem |
| **Jeux** | rectangle or · trophée | podium / pièces / sablier selon le nœud | valeurs réelles | idem |
| **Débogage** | gris tramé · insecte | sonde, valeur | valeurs, arrêts | **masqué** (inactif en live) |

---

## 5. Exemples détaillés de blocs (les plus importants)

| Bloc | Écriture | Répétition | Live |
|---|---|---|---|
| **Couleur** | grande **pastille** de la couleur réelle (clic = nuancier) ; si couleur par équipe : pastilles côte à côte | la pastille pulse à chaque envoi | idem + nombre de téléphones allumés |
| **Fondu / Vague** | **dégradé** c1→c2 avec la durée ; pour la vague, mini-plan de salle balayé zone par zone | balayage animé au moment réel | idem |
| **Vibrer** | **forme d'onde du motif** (créneaux en ms) ; icône « repli iPhone » avec le repli choisi | onde parcourue par une tête de lecture | « 115 vibrés · 23 en repli » |
| **Son** | **forme d'onde** du fichier, durée, volume ; **lecture au survol** (dans l'éditeur seulement) | tête de lecture synchronisée | « 92 lisent · 31 muets (mode silencieux) » |
| **Écran téléphone** (choix, clavier…) | **mini-téléphone** qui montre l'écran avec les vrais textes | idem + « 47/52 ont répondu » | idem, clic = écran d'un joueur précis |
| **Vote** (écran + agrégat) | barres de résultat sur données d'exemple | **barres qui bougent en direct** | barres qui bougent ; gagnant provisoire couronné ; égalité signalée |
| **Cible** | **pastille foule** : nombre estimé + couleurs d'équipes + 3 avatars | nombre réel | nombre réel ; alerte si 0 |
| **Attendre** | **anneau de chrono** avec la durée | anneau qui se remplit | idem |
| **Gate** | **feu tricolore / mini machine à états** + phrase de la règle | état courant allumé + progression | idem + boutons GO / RETENIR |
| **Aléatoire** | **dé** + poids des branches en camembert | le dé « roule », face tirée allumée | idem ; graine affichée (rejouabilité) |
| **Équipe** | **blasons** (couleur + emblème + effectif) | effectifs réels | idem |
| **Capteur secousse** | **jauge animée** sur signal d'exemple, seuil glissable | jauge réelle | jauge réelle + nuage de points (qui secoue) |
| **Écran scène** | **vignette 16:9** animée de l'effet | rendu réduit réel | idem |
| **Streamer** | **vignette vidéo** + bulle de consigne | flux de test | flux réel + images/s + latence ; état de la consigne |

---

## 6. Catalogue des nœuds (320 + 6 outils du canevas)

**Notation des broches** : `▶` exécution · `B` booléen · `N` nombre · `T` texte · `C` cible · `J` joueur · `Co` couleur ·
`M` média · `E` événement (charge utile : auteur `J`, valeur, heure) · `L·x` liste de x · `O` objet.
« `▶, C → ▶` » = entre une exécution et une cible, sort une exécution.
**Priorités** : **v1** = nécessaire au socle et à LIVE (phases 1-2 de [09](../09-feuille-de-route-et-questions.md)) ·
**v2** = studio complet (phases 3-4) · **+tard** = extension.

### 6.1 Déclencheurs — forme chapeau (24)

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| DEC-01 | Au début du segment | — → `▶` | — | chapeau avec icône « entrée de scène » ; flash à chaque entrée | v1 |
| DEC-02 | À la sortie du segment | — → `▶` | raison (normal, forcé, sauté) | chapeau « sortie » ; les 3 raisons en sorties étiquetées | v1 |
| DEC-03 | À +T (top minuté) | — → `▶` | délai depuis le début du segment | chapeau + **position du top sur une mini-règle** du segment | v1 |
| DEC-04 | Toutes les N s | — → `▶`, `N` itération | période, nombre max | chapeau + **métronome** qui bat | v1 |
| DEC-05 | Au lancement de la représentation | — → `▶` | — | chapeau « rideau » | v1 |
| DEC-06 | Joueur rejoint | — → `▶`, `J` | filtre de rôle | chapeau + avatar qui entre ; compteur d'arrivées | v1 |
| DEC-07 | Joueur revient (reconnexion) | — → `▶`, `J`, `N` durée d'absence | absence minimale | avatar avec flèche circulaire | v1 |
| DEC-08 | Joueur part / caché / déconnecté | — → `▶`, `J`, `T` type | type (caché, déconnecté), délai de grâce | avatar qui s'estompe ; compteur | v1 |
| DEC-09 | Tutoriel terminé | — → `▶`, `J`, `O` capacités | — | chapeau + 4 coches (couleur, vibration, son, capteurs) | v1 |
| DEC-10 | Vote reçu | — → `▶`, `E` (auteur, option) | écran source | chapeau + **mini-barres** qui bougent à chaque vote | v1 |
| DEC-11 | Texte reçu | — → `▶`, `E` (auteur, texte) | écran source, après modération oui/non | chapeau + **dernière bulle** reçue (floutée si non modérée) | v1 |
| DEC-12 | Réaction reçue | — → `▶`, `E` (auteur, emoji, force) | filtre d'emojis | chapeau + **pluie d'emojis** à l'échelle du débit | v1 |
| DEC-13 | Bouton joueur touché | — → `▶`, `E` | écran source, bouton | chapeau + doigt qui tape ; compteur | v1 |
| DEC-14 | Quand la condition devient vraie | `B` → `▶` | front (devient vraie / fausse / les deux) | chapeau + **ampoule** éteinte/allumée | v1 |
| DEC-15 | Quand la variable change | — → `▶`, ancienne, nouvelle | variable, seuil de variation | chapeau + valeur avant → après | v1 |
| DEC-16 | Écouter un événement personnalisé | — → `▶`, `O` charge | nom de l'événement | chapeau + **antenne** nommée ; lien pointillé vers les « Lancer » correspondants | v1 |
| DEC-17 | Bouton régie pressé | — → `▶` | libellé, couleur, raccourci clavier, confirmation | **touche Stream Deck** (couleur + libellé) cliquable en répétition/live | v1 |
| DEC-18 | Seuil de capteur franchi | — → `▶`, `J`, `N` | capteur, seuil, cible, hystérésis | chapeau + **jauge avec trait de seuil** | v2 |
| DEC-19 | Changement d'état de gate | — → `▶`, `T` état | gate, état visé (armé, avertissement, passage) | chapeau + **feu** avec l'état visé allumé | v2 |
| DEC-20 | À l'heure murale | — → `▶` | heure réelle (21:00), fuseau | chapeau + **horloge à aiguilles** | v2 |
| DEC-21 | Panique / reprise | — → `▶` panique, `▶` reprise | — | chapeau rouge « PANIQUE » | v2 |
| DEC-22 | Média terminé | — → `▶` | média, cible (scène, téléphones) | chapeau + forme d'onde avec drapeau de fin | v2 |
| DEC-23 | Permission accordée / refusée | — → `▶` oui, `▶` non, `J` | permission (caméra, capteurs, notifications) | chapeau + cadenas ouvert/fermé ; taux d'acceptation | v2 |
| DEC-24 | Message entrant d'un service externe | — → `▶`, `O` | source (OSC, MIDI, HTTP — voir 6.19) | chapeau à bord en prise + dernier message | v2 |

### 6.2 Flux et logique (20)

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| FLX-01 | Si | `▶`, `B` → `▶` oui, `▶` non | — | **losange** ; branche prise s'allume | v1 |
| FLX-02 | Selon (switch) | `▶`, valeur → `▶` par cas, `▶` sinon | liste de cas | losange à N sorties étiquetées par valeur ; cas pris allumé ; % historique par sortie en répétition | v1 |
| FLX-03 | Séquence | `▶` → `▶` 1…n | nombre de sorties | sorties numérotées, s'allument dans l'ordre | v1 |
| FLX-04 | En parallèle | `▶` → `▶` ×n | — | éventail de sorties | v1 |
| FLX-05 | Rassembler (attendre toutes les branches) | `▶` ×n → `▶` | n, délai max | **entonnoir** ; entrées cochées au fur et à mesure | v2 |
| FLX-06 | Le premier des deux (course) | `▶` ×n → `▶`, `N` gagnante | — | ligne d'arrivée ; entrée gagnante allumée | v2 |
| FLX-07 | Une seule fois | `▶`, `▶` réarmer → `▶` | portée (spectacle, segment, par joueur) | **cadenas** qui se ferme après le passage | v1 |
| FLX-08 | Porte (ouvrir / fermer) | `▶` entrée, `▶` ouvrir, `▶` fermer → `▶` | état initial | **barrière** ouverte/fermée | v1 |
| FLX-09 | Interrupteur (bascule) | `▶` → `▶` A, `▶` B | état initial | interrupteur à levier, position courante | v2 |
| FLX-10 | Pour chaque joueur de | `▶`, `C` → `▶` corps (`J`), `▶` fini | ordre (aléatoire, siège, pseudo), espacement en ms | **forme en C** qui enveloppe le corps ; foule où les points s'allument un par un | v1 |
| FLX-11 | Pour chaque élément | `▶`, `L·x` → `▶` corps (x, index), `▶` fini | espacement | forme en C + liste | v2 |
| FLX-12 | Répéter N fois | `▶`, `N` → `▶` corps (`N` i), `▶` fini | n, intervalle | forme en C + compteur i/n | v2 |
| FLX-13 | Tant que | `▶`, `B` → `▶` corps, `▶` fini | **garde-fou** : itérations max, intervalle min | forme en C avec avertissement si pas de délai | +tard |
| FLX-14 | Aléatoire pondéré | `▶` → `▶` ×n | poids, graine | **dé** + camembert des poids ; face tirée allumée | v1 |
| FLX-15 | Limiteur (anti-rebond / débit max) | `▶` → `▶`, `N` ignorés | mode (premier, dernier), fenêtre | **sablier fin** ; compteur d'ignorés | v1 |
| FLX-16 | Aller au segment | `▶` → — | segment cible, confirmation régie oui/non | **flèche vers la vignette** du segment cible (fin de fil, forme « cap ») | v1 |
| FLX-17 | Lancer un événement | `▶`, `O` charge → `▶` | nom, portée (segment, global) | **antenne émettrice** ; lien pointillé vers les écouteurs | v1 |
| FLX-18 | Arrêter ce fil | `▶` → — | — | forme « cap » (fin de script Scratch) | v1 |
| FLX-19 | Machine à états (sous-états) | `▶` événements → `▶` par état | états, transitions | **mini-diagramme d'états** avec l'état courant allumé (double-clic : ouvre l'éditeur) | v2 |
| FLX-20 | Sous-graphe / recette | broches choisies → broches choisies | façade (quelle vignette montrer) | **double bord** + façade (jauge, vague…) | v2 |

### 6.3 Temps (12)

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| TPS-01 | Attendre | `▶`, `N` durée → `▶` | durée, horloge (spectacle pausable / serveur) | **anneau de chrono** qui se remplit | v1 |
| TPS-02 | Attendre que | `▶`, `B` → `▶`, `▶` délai dépassé | délai max (obligatoire) | anneau + **ampoule** de la condition | v1 |
| TPS-03 | Délai dépassé (timeout) | `▶` démarrer, `▶` annuler → `▶` | durée | anneau rouge qui se vide | v1 |
| TPS-04 | Programmer à T serveur | `▶`, `N` T → `▶` (à l'heure exacte) | avance d'envoi (ms) | horloge + **trait vertical « T »** sur une mini-règle | v1 |
| TPS-05 | Chrono | `▶` départ, `▶` stop, `▶` remise à zéro → `N` écoulé | — | **chronomètre** numérique | v1 |
| TPS-06 | Compte à rebours partagé | `▶`, `N` durée, `C` affichage → `▶` fini, `N` restant | où l'afficher (téléphones, scène, streamer), alerte à x s | **anneau + chiffres**, aperçu des 3 surfaces | v1 |
| TPS-07 | Lire l'horloge | — → `N` spectacle, `N` segment, `N` serveur | — | trois petites horloges | v1 |
| TPS-08 | Décalage par zone (vague temporelle) | `▶`, `C` → `▶` par zone (avec heure) | délai entre zones, ordre, sens | **plan de salle** balayé par une onde | v2 |
| TPS-09 | Métronome / tempo | `▶` démarrer, `▶` stop → `▶` à chaque temps, `N` | BPM, mesure, synchro serveur | **pendule** + temps forts | v2 |
| TPS-10 | Courbe d'automation | `▶`, `N` t → `N` valeur | points de la courbe, durée, boucle | **courbe éditable** avec tête de lecture | v2 |
| TPS-11 | Fenêtre de temps | — → `B` dans la fenêtre | début, fin (relatifs au segment) | **segment surligné** sur une mini-règle | v2 |
| TPS-12 | Ralentir / accélérer (répétition) | — | facteur | compteur ×2 / ×10 (répétition seulement) | v2 |

### 6.4 Points d'arrêt (gates) et règles de passage (13)

*Le gate est la boîte la plus regardée de la régie : son bloc est un **feu tricolore** qui montre la machine à états de [03 §3.1](../03-moteur-scenario.md).*

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| GAT-01 | Gate (point d'arrêt) | `B` condition, `▶` GO, `▶` retenir, `▶` sauter → `▶` par branche | pas avant, au plus tard, avertir, si forcé | **losange ambre + feu** EN COURS / ARMÉ / AVERTISSEMENT / RETENU / PASSAGE ; phrase de la règle ; barre de progression | v1 |
| GAT-02 | Règle : tous ont répondu | `C` population, mesure → `B`, `N` ratio | population (présents par défaut) | **anneau de ratio** « 121/138 » | v1 |
| GAT-03 | Règle : quorum | idem + `N` seuil → `B` | seuil % | anneau avec **trait du seuil** | v1 |
| GAT-04 | Règle : majorité acquise | `L` votes, `N` restants → `B`, gagnant | — | barres + **cadenas** sur le gagnant quand c'est mathématiquement joué | v1 |
| GAT-05 | Règle : durée fixe | — → `B` | durée | anneau de chrono | v1 |
| GAT-06 | Règle : manuel | — → `B` | libellé du GO | **touche GO** | v1 |
| GAT-07 | Règle : premier qui | `E` → `B`, `J` gagnant | critère (réponse correcte) | **ligne d'arrivée** + avatar du premier | v1 |
| GAT-08 | Règle : jauge atteinte | `N` → `B` | seuil | **jauge** avec trait du seuil | v1 |
| GAT-09 | Règle : signal externe | `E` → `B` | source (streamer « Reçu », OSC, fin de son) | prise + dernier signal | v2 |
| GAT-10 | Combiner des règles | `B` ×n → `B` | ET / OU / NON, arbre | **arbre de portes logiques**, chaque feuille allumée/éteinte | v1 |
| GAT-11 | Avertir avant la fin | `▶` → `▶` | x s avant le max, cible (ceux qui n'ont pas répondu), effets | **anneau avec zone orange** à la fin ; aperçu des effets | v1 |
| GAT-12 | Si forcé | `▶` → `▶` | action (abstention, choix par défaut, tirage) | icône **marteau** + phrase | v1 |
| GAT-13 | Brancher vers | valeur → segment | table valeur → segment, sinon | **aiguillage** ferroviaire vers les vignettes des segments | v1 |

### 6.5 Données, variables, maths, texte, listes (22)

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| DON-01 | Lire variable | (`J` / groupe si portée) → valeur | variable, portée (spectacle, groupe, joueur, régie) | **capsule-valeur** + sparkline ; pastille de portée | v1 |
| DON-02 | Écrire variable | `▶`, valeur → `▶` | variable, portée | flèche → capsule ; ancienne → nouvelle valeur | v1 |
| DON-03 | Incrémenter / décrémenter | `▶`, `N` pas → `▶`, `N` | min, max, boucle | **compteur mécanique** | v1 |
| DON-04 | Constante | — → valeur | type, valeur | la valeur elle-même (pastille si couleur) | v1 |
| DON-05 | Comparer | a, b → `B` | =, ≠, <, ≤, >, ≥, contient | capsule à bouts pointus ; vrai/faux allumé | v1 |
| DON-06 | ET / OU / NON | `B` ×n → `B` | — | symbole de porte logique, entrées allumées | v1 |
| DON-07 | Calcul | `N` ×n → `N` | opération (+ − × ÷ min max arrondi modulo) | grand symbole d'opération + résultat | v1 |
| DON-08 | Formule libre | variables → `N`/`T` | expression texte (sûre, sans code arbitraire) | la formule typographiée + résultat | v2 |
| DON-09 | Remapper une plage | `N` → `N` | entrée min/max, sortie min/max, courbe | **deux règles** reliées par des traits | v1 |
| DON-10 | Limiter (bornes) | `N` → `N` | min, max | jauge avec butées | v1 |
| DON-11 | Lisser | `N` → `N` | fenêtre, type (moyenne glissante, exponentiel) | **deux courbes** : brute pâle, lissée vive | v2 |
| DON-12 | Nombre aléatoire | `▶`? → `N` | min, max, entier, graine | **dé** avec la valeur | v1 |
| DON-13 | Gabarit de texte | valeurs → `T` | texte avec `{pseudo}`, `{score}`… | **bulle** rendue avec un exemple, variables surlignées | v1 |
| DON-14 | Opérations texte | `T` → `T` / `N` / `B` | majuscules, tronquer, longueur, contient, remplacer | bulle avant → après | v2 |
| DON-15 | Choisir dans une banque de textes | `▶` → `T` | banque, mode (aléatoire sans remise, séquentiel) | pile de cartes, carte tirée sur le dessus | v2 |
| DON-16 | Créer une liste | x ×n → `L·x` | — | pile d'éléments | v2 |
| DON-17 | Modifier une liste | `L`, x → `L` | ajouter, retirer, vider | pile avec élément entrant/sortant | v2 |
| DON-18 | Trier / mélanger / prendre N | `L` → `L` | critère, ordre, n | pile réordonnée | v2 |
| DON-19 | Longueur / contient / index | `L` → `N`/`B`/x | — | pile + chiffre | v2 |
| DON-20 | Couleur : mélanger / dégradé / depuis valeur | `Co`, `N` → `Co` | palette, interpolation | **bande de dégradé** avec curseur à la position | v2 |
| DON-21 | Convertir | x → y | type cible | flèche entre deux broches de couleurs | v2 |
| DON-22 | Objet (lire / écrire un champ) | `O` → valeur | chemin | hexagone avec arbre replié | +tard |

### 6.6 Agrégats et statistiques (14)

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| AGR-01 | Compter | `C` / flux d'`E` → `N` | fenêtre (segment, glissante) | **grand nombre** + sparkline | v1 |
| AGR-02 | Ratio / pourcentage | `C` partie, `C` population → `N` | population de référence | **anneau de ratio** | v1 |
| AGR-03 | Somme / moyenne / min / max | flux de `N` → `N` | opération, fenêtre | valeur + **boîte à moustaches miniature** | v1 |
| AGR-04 | Histogramme / répartition | flux de valeurs → `L·N`, `O` | options (ordre fixe), inclure abstentions | **barres qui bougent** | v1 |
| AGR-05 | Gagnant | répartition → valeur, `B` égalité | règle d'égalité (tirage, régie, première arrivée) | barres avec **couronne** sur la plus haute ; « égalité » clignote doucement | v1 |
| AGR-06 | Débit (événements par seconde) | flux d'`E` → `N` | fenêtre | **sismographe** | v1 |
| AGR-07 | Énergie de salle (jauge collective) | flux de `N` capteurs → `N` | gain, décroissance, plafond | **jauge verticale** qui monte et redescend | v1 |
| AGR-08 | Participation | `C` → `L·J` ont agi, `L·J` n'ont pas agi | depuis (début du segment, ce vote) | **foule** : points pleins / vides | v1 |
| AGR-09 | Médiane / écart-type / percentiles | flux de `N` → `N` | — | courbe de densité | v2 |
| AGR-10 | Fréquence des mots | flux de `T` → `L·(mot, n)` | mots vides, min longueur | **mini nuage de mots** | v2 |
| AGR-11 | Consensus (accord de la salle) | répartition → `N` 0..1 | mesure (entropie) | **balance** : penchée = divisé, droite = unanime | v2 |
| AGR-12 | Moyenne par zone | flux de `N` + zone → `O` | zones | **carte de chaleur** de la salle | v2 |
| AGR-13 | Par équipe | flux + équipe → `O` | agrégat | **barres aux couleurs des blasons** | v1 |
| AGR-14 | Temps de réponse | flux d'`E` → `N` moyenne, `L` | — | histogramme des délais | v2 |

### 6.7 Ciblage (16)

*Corps commun : la **foule** (nuage de points de la salle, d'exemple en écriture, réelle ensuite) avec le nombre en grand.*

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| CIB-01 | Tous | — → `C` | population (inscrits, connectés, présents, actifs) | foule entière + nombre | v1 |
| CIB-02 | Population | — → `C` | inscrits / connectés / présents / actifs / éligibles | foule avec 4 nuances (présent ●, caché ◐, déconnecté ○) | v1 |
| CIB-03 | Rôle | — → `C` | rôle(s) | foule filtrée + icône du rôle | v1 |
| CIB-04 | Équipe / groupe | — → `C` | équipe(s) | **blason** + effectif | v1 |
| CIB-05 | Joueur | `J` → `C` | pseudo ou référence | avatar seul | v1 |
| CIB-06 | Expéditeur de l'événement | `E` → `C` | — | avatar + flèche retour (« lui répondre ») | v1 |
| CIB-07 | Ceux qui ont répondu X | — → `C` | interaction, valeur | foule colorée par réponse | v1 |
| CIB-08 | Ceux qui n'ont pas répondu | — → `C` | interaction | foule : **points vides** mis en avant | v1 |
| CIB-09 | Sélection régie | — → `C` | — | foule + main ; nombre sélectionné en live | v1 |
| CIB-10 | Union / intersection / sauf | `C` ×n → `C` | opération | **diagramme de Venn** avec effectifs | v1 |
| CIB-11 | Tirer au sort N | `C` → `C`, `L·J` | n, sans remise (`jamais_tiré`), graine | **urne** + avatars tirés | v1 |
| CIB-12 | Par capacité | `C` → `C` | son OK, vibration, capteurs, caméra, PWA | foule + icônes de capacités | v1 |
| CIB-13 | Zone / siège | — → `C` | zone(s), rangs | **plan de salle** avec zones surlignées | v2 |
| CIB-14 | Par variable | `C` → `C` | condition (points > 10) | foule + phrase | v2 |
| CIB-15 | Les N meilleurs / premiers | `C`, critère → `C` | n, critère | **podium** | v2 |
| CIB-16 | Voisins | `J` → `C` | rayon (sièges) | plan de salle avec cercle | +tard |

### 6.8 Participants, rôles, équipes (9)

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| PAR-01 | Infos joueur | `J` → pseudo, rôle, équipe, zone, plateforme, capacités, présence | — | **carte de joueur** (avatar, couleur stable du pseudo, icônes) | v1 |
| PAR-02 | Changer de rôle | `▶`, `C`, rôle → `▶` | rôle, transition d'écran | avatar qui change de costume (icône avant → après) | v1 |
| PAR-03 | Assigner à une équipe | `▶`, `C`, équipe → `▶` | équipe | avatar → blason | v1 |
| PAR-04 | Former des équipes | `▶`, `C` → `▶`, `L` équipes | nombre, méthode (aléatoire équilibré, par zone, par réponse) | **blasons** avec effectifs ; foule coloriée | v1 |
| PAR-05 | Définir des équipes (statique) | — → équipes | nom, couleur, emblème, son | **rangée de blasons** éditables | v1 |
| PAR-06 | Donner un rôle secret | `▶`, `C`, rôle → `▶` | rôle secret, mission, visible par (superviseurs) | avatar avec **masque** ; compteur | v2 |
| PAR-07 | Groupe dynamique | `▶`, `C` → `▶` | nom, ajouter / retirer / remplacer | cercle de points nommé | v2 |
| PAR-08 | Renommer un joueur | `▶`, `J`, `T` → `▶` | — | carte avant → après | v2 |
| PAR-09 | Promouvoir (spectateur → invité / superviseur) | `▶`, `J` → `▶` | rôle cible, interface spéciale | avatar qui **monte sur une estrade** | v2 |

### 6.9 Interfaces téléphone — écrans types (40)

*Corps commun : le **mini-téléphone** qui rend l'écran pour de vrai (même code que l'app joueur), avec les couleurs du thème.
Ce sont des nœuds **latents** (anneau de temps) quand ils attendent une réponse. Entrées communes : `▶`, `C`. Sorties communes :
`▶` affiché, flux d'`E` réponses, `N` taux de réponse. Option commune : verrouiller après réponse, modifiable, délai.*

| # | Nœud | Sorties spécifiques | Paramètres clés | Bloc visuel (dans le mini-téléphone) | Prio |
|---|---|---|---|---|---|
| ECR-01 | Attente | — | texte, animation, couleur de fond | logo / texte « Le spectacle va reprendre » | v1 |
| ECR-02 | Noir | — | — (écran noir, par défaut entre les interactions) | téléphone noir avec petite lune | v1 |
| ECR-03 | Message plein écran | — | texte, taille, image, durée | le texte en grand | v1 |
| ECR-04 | Image / animation plein écran | — | média, ajustement | la vignette | v1 |
| ECR-05 | Pseudo | `T` pseudo | longueur, filtre | champ « Ton pseudo » | v1 |
| ECR-06 | Toucher pour entrer | `▶` déverrouillé | ce qu'on déverrouille (son, capteurs, plein écran, wake lock) | gros bouton « Entrer dans le spectacle » | v1 |
| ECR-07 | Tutoriel / test des capacités | `O` capacités | étapes (couleur, vibration, son, capteurs) | 4 étapes avec coches | v1 |
| ECR-08 | Bouton unique | `E` touché | libellé, couleur, une fois / répétable | **gros bouton** ; compteur de touches | v1 |
| ECR-09 | Choix (2 à 6) | `E` (option) | options (texte, couleur, icône), ordre aléatoire | les boutons d'options ; **barres en surimpression** en répétition/live | v1 |
| ECR-10 | Oui / Non | `E` (B) | libellés | deux gros boutons | v1 |
| ECR-11 | Choix à images | `E` (option) | images, grille | grille de vignettes | v2 |
| ECR-12 | Curseur | `E` (N) | min, max, libellés des bouts, envoi continu ou à la validation | le curseur ; **histogramme des positions** en live | v1 |
| ECR-13 | Répartir des jetons (vote pondéré) | `E` (`O` répartition) | nombre de jetons, options | piles de jetons par option | v2 |
| ECR-14 | Jauge à tenir appuyé | `E` (N durée) | durée max, retour visuel | **cercle qui se remplit** sous le doigt | v2 |
| ECR-15 | Texte libre | `E` (`T`) | longueur max, suggestions, anti-spam | champ + clavier (3 zones de [06 §4](../06-cas-live-streamer.md)) | v1 |
| ECR-16 | Réactions (emojis maison) | `E` (emoji, force) | 6-8 emojis, appui long = plus fort | barre d'emojis ; **pluie d'emojis** au débit réel | v1 |
| ECR-17 | Écran LIVE (consigne + réactions + clavier) | `E` texte, `E` réaction | consigne, emojis, suggestions | les 3 zones du téléphone LIVE | v1 |
| ECR-18 | Quiz chronométré | `E` (réponse, temps), `B` correct | question, réponses, bonne réponse, temps, points | question + anneau de temps + réponses | v2 |
| ECR-19 | Classer (glisser pour ordonner) | `E` (`L` ordre) | éléments | liste avec poignées | v2 |
| ECR-20 | Swipe (gauche / droite) | `E` (B, carte) | cartes, libellés des côtés | pile de cartes inclinées | v2 |
| ECR-21 | Noter (étoiles / échelle) | `E` (N) | échelle, icône | rangée d'étoiles | v2 |
| ECR-22 | Saisie de nombre | `E` (N) | min, max, pavé | pavé numérique | v2 |
| ECR-23 | Code / mot de passe | `E` (`T`), `B` correct | code attendu, essais | cases de code | v2 |
| ECR-24 | Buzzer | `E` (heure précise) | verrouillage après le premier | **gros dôme rouge** ; avatar du premier en live | v1 |
| ECR-25 | Secouer | `E` (N énergie) | objectif individuel, retour visuel | téléphone qui tremble + jauge perso | v1 |
| ECR-26 | Pencher / orienter | `E` (N angle) | axe, retour visuel | bille dans un niveau à bulle | v2 |
| ECR-27 | Pointer (boussole) | `E` (N cap) | cible de référence | **boussole** | +tard |
| ECR-28 | Taper en rythme | `E` (N tempo, régularité) | tempo cible | cercle qui pulse | v2 |
| ECR-29 | Dessin | `E` (image) | palette, épaisseur, durée, case de fresque | toile avec trait d'exemple | v2 |
| ECR-30 | Photo / selfie | `E` (image) | caméra avant/arrière, consentement de projection | viseur | v2 |
| ECR-31 | Consentement | `E` (B) | texte (projection d'image, données) | case à cocher + texte | v2 |
| ECR-32 | Carte de la salle (choisir une zone) | `E` (zone) | plan | **plan de salle** cliquable | v2 |
| ECR-33 | Scanner un QR caché | `E` (`T` code) | codes attendus | viseur QR | v2 |
| ECR-34 | Compte à rebours | — | durée, style | grands chiffres | v1 |
| ECR-35 | Résultat / révélation | — | source (agrégat), style (barres, gagnant seul) | barres / gagnant | v1 |
| ECR-36 | Classement | — | source, top N, « ta place » | podium + ta ligne | v2 |
| ECR-37 | Conversation privée (chat avec un personnage) | `E` (`T`) | personnage, avatar, historique | **bulles de messagerie** | v2 |
| ECR-38 | Mini-vue vidéo | — | source (streamer), qualité basse | vignette vidéo dans le téléphone | +tard |
| ECR-39 | Onglet supervision (régie de poche) | `E` actions | compteurs, file de modération, boutons autorisés | téléphone avec **onglets** joueur / supervision | v2 |
| ECR-40 | Écran personnalisé (code) | selon le code | composant développeur, paramètres déclarés | rendu du composant ; badge « code » | v2 |

### 6.10 Effets téléphone : lumière, haptique, son, voix, messages, système (24)

*Entrées communes : `▶`, `C`, `N` heure d'exécution (immédiat ou T serveur). Sorties : `▶`, `N` envoyés, `N` en repli.
Chaque effet affiche son **repli iPhone** (icône + choix) et passe par le **garde-fou photosensibilité** quand il clignote.*

| # | Nœud | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|
| EFT-01 | Couleur | couleur (ou par équipe / par variable), persistante | **grande pastille** réelle ; pastilles par équipe | v1 |
| EFT-02 | Fondu | c1 → c2, durée, courbe | **dégradé** + durée | v1 |
| EFT-03 | Stroboscope | couleurs, fréquence (≤ 3/s plafonné), durée | séquence de pastilles ; **aperçu ralenti** dans l'éditeur (pas de vrai clignotement rapide) | v2 |
| EFT-04 | Couleur selon la place (mosaïque) | image source ou palette par zone | **plan de salle pixelisé** montrant l'image formée | v2 |
| EFT-05 | Vague | couleur/effet, délai par zone, sens | plan de salle balayé | v2 |
| EFT-06 | Lampe (blanc + torche) | durée, torche si possible | ampoule / torche ; « 34 torches · 104 écrans blancs » | v2 |
| EFT-07 | Pulsation lumineuse (cœur) | BPM, couleur, variation | **cœur qui bat** à la couleur choisie | v2 |
| EFT-08 | Vibrer | motif nommé ou personnalisé (ms), repli iPhone (flash, clic) | **forme d'onde en créneaux** du motif | v1 |
| EFT-09 | Battement de cœur (haptique) | BPM (branchable sur une variable de tension) | **électrocardiogramme** | v2 |
| EFT-10 | Morse | texte, unité de temps | traits et points | +tard |
| EFT-11 | Jouer un son | média, volume, boucle, fondu, synchro T | **forme d'onde** + lecture au survol | v1 |
| EFT-12 | Arrêter / fondre le son | durée de fondu | onde qui s'éteint | v1 |
| EFT-13 | Accord / chœur (une voix par groupe) | média par groupe, synchro | **portée musicale** avec une note par groupe | v2 |
| EFT-14 | Son qui traverse la salle | média, ordre des zones, délai | plan de salle + onde qui voyage | +tard |
| EFT-15 | Voix (synthèse vocale) | texte (gabarit), voix, langue, débit | **bulle** + onde de voix ; bouton écouter | v2 |
| EFT-16 | Notification dans la page | titre, texte, son, vibration, durée | **mini-téléphone avec bandeau** qui descend | v1 |
| EFT-17 | Toast | texte, durée | petite bulle en bas du mini-téléphone | v1 |
| EFT-18 | Message privé | texte, expéditeur (personnage), persistance | **enveloppe** + bulle | v1 |
| EFT-19 | Notification push (téléphone verrouillé, après spectacle) | titre, texte, heure d'envoi | écran verrouillé avec notification ; « 41 installés PWA » | +tard |
| EFT-20 | Pastille sur l'icône | nombre | icône d'app avec pastille | +tard |
| EFT-21 | Verrouiller / déverrouiller l'interface | — | **cadenas** sur le mini-téléphone | v1 |
| EFT-22 | Demander une permission | permission, texte d'explication | boîte de dialogue + taux d'acceptation | v2 |
| EFT-23 | Recharger l'interface | — | flèche circulaire | v2 |
| EFT-24 | Préférences d'effets (réduire les effets) | respecter le choix du joueur | interrupteur « effets réduits » + nombre de joueurs concernés | v1 |

### 6.11 Capteurs (10)

*Les valeurs brutes restent sur le téléphone ; le bloc reçoit des agrégats (≤ 5 Hz). Corps commun : **jauge animée** + nuage de points.
Sorties : flux d'`E` par joueur, `N` agrégat de la cible. Entrée : `C`, activer/désactiver.*

| # | Nœud | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|
| CAP-01 | Secousse (énergie) | sensibilité, fenêtre | **jauge animée** + téléphone qui tremble | v1 |
| CAP-02 | Taps (fréquence) | zone de l'écran | **sismographe** des taps | v1 |
| CAP-03 | Présence de la page (visible / cachée) | délai | œil ouvert / fermé ; compteur | v1 |
| CAP-04 | Inclinaison | axe, zone morte | **niveau à bulle** / horizon artificiel | v2 |
| CAP-05 | Téléphone levé / posé | seuil | téléphone debout / à plat | v2 |
| CAP-06 | Immobilité (« Silence ! ») | tolérance, durée | **statue** + jauge de calme | v2 |
| CAP-07 | Rythme régulier | tempo cible, tolérance | métronome + régularité en % | v2 |
| CAP-08 | Niveau sonore (micro) | gain, fenêtre | **vu-mètre** | v2 |
| CAP-09 | Batterie | seuil d'alerte | pile qui se vide ; liste des faibles | v2 |
| CAP-10 | Orientation (boussole) | référence de la salle | **boussole** avec flèches des joueurs | +tard |

### 6.12 Caméra et micro (5)

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| CAM-01 | Recevoir une photo | `E` image → `M`, `J` | modération obligatoire, consentement | **vignettes** floutées jusqu'à validation | v2 |
| CAM-02 | Applaudimètre | `C` → `N` | durée, échelle | **aiguille d'applaudimètre** | v2 |
| CAM-03 | Message vocal | `E` → `M`, `J` | durée max | onde + lecture | +tard |
| CAM-04 | Caméra d'un spectateur invité (vidéo directe) | `J` → flux | qualité, consentement | vignette vidéo | +tard |
| CAM-05 | Reconnaissance vocale (phrase magique) | `C` → `E` (`T`) | phrases attendues, langue | onde + texte reconnu | +tard |

### 6.13 Écran scène (22)

*Corps commun : **vignette 16:9 animée** (écriture : générateur de faux messages ; ensuite : rendu réduit de la vraie page scène).
Entrées communes : `▶` montrer, `▶` cacher, calque (ordre). Les blocs scène s'empilent en **calques** visibles dans un mini-empilement.*

| # | Nœud | Entrées spécifiques | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| SCN-01 | Calque vidéo du streamer | — | cadrage, zone protégée (visage) | vignette vidéo + **rectangle de zone protégée** | v1 |
| SCN-02 | Image de secours / plan B | — | média, déclenchement auto si flux perdu | vignette « Connexion perdue… » | v1 |
| SCN-03 | Commentaires « pop » | flux d'`E` texte | durée, rebond, débit max, positions | bulles qui gonflent dans la vignette | v1 |
| SCN-04 | Danmaku | flux d'`E` texte | vitesse, lignes, densité | textes qui défilent | v2 |
| SCN-05 | Typographie cinétique | `T` | rythme, tailles | mots qui arrivent un par un | v2 |
| SCN-06 | Commentaire vedette | `E` texte | style, son, durée | grande bulle aux couleurs du pseudo | v1 |
| SCN-07 | Feux d'artifice d'emojis | flux d'`E` réactions | seuil fusée (30 en 2 s), palette | **gerbes** dans la vignette | v1 |
| SCN-08 | Cœurs qui montent | flux d'`E` | intensité ∝ débit | cœurs qui montent | v1 |
| SCN-09 | Jauge de combo / multiplicateur | `N` | paliers, tremblement, flash | **jauge** avec paliers ×2 ×3 | v2 |
| SCN-10 | Barres de vote / révélation | répartition | style (barres, bulles), roulement, explosion du gagnant | barres qui gonflent | v1 |
| SCN-11 | Titre / texte | `T` | police, taille, animation d'entrée | texte rendu dans la vignette | v1 |
| SCN-12 | Image / vidéo plein cadre | `M` | ajustement, boucle, fondu | vignette du média | v1 |
| SCN-13 | Compte à rebours scène | `N` | style | chiffres géants | v1 |
| SCN-14 | Gabarit de séquence (calme, folie, vote, entracte) | — | gabarit | **4 vignettes**, celle active encadrée | v1 |
| SCN-15 | Nuage de mots | `L` (mot, n) | palette, forme | nuage | v2 |
| SCN-16 | Classement scène | `L` | top N, animation de montée | podium | v2 |
| SCN-17 | Alerte « offrande » | `J`, `T` | animation, son | bannière plein écran avec pseudo | v2 |
| SCN-18 | Effet d'écran (tremblement, flash, vignettage) | `N` intensité | durée (flash plafonné) | vignette qui tremble | v2 |
| SCN-19 | Écho du streamer (message lu s'illumine) | `E` | style | bulle surlignée | v2 |
| SCN-20 | Vague latérale (réaction par zone) | flux d'`E` + zone | côté de départ | onde qui part d'un bord | v2 |
| SCN-21 | Mur de visages | `L·M` | grille, consentement | mosaïque de vignettes | +tard |
| SCN-22 | Carte de salle (chaleur) | `O` par zone | palette | plan de salle colorié | +tard |

### 6.14 Streamer et comédiens (10)

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| STR-01 | Consigne au streamer | `▶`, `T` → `▶` envoyée, `▶` reçue (« Reçu »), `N` délai | texte (gabarit), priorité, vibration/son, attendre le « Reçu » oui/non | **bulle de consigne** telle qu'il la voit ; états envoyée → lue → ✓ reçue | v1 |
| STR-02 | Pousser un commentaire au streamer | `▶`, `E` texte → `▶` | mise en avant | bulle avec pseudo coloré | v1 |
| STR-03 | Chrono du streamer | `▶`, `N` → `▶` | style, alerte | anneau dans un cadre de téléphone streamer | v1 |
| STR-04 | Alerte urgente au streamer | `▶`, `T` → `▶` | vibration forte, son | bulle rouge + onde de vibration | v1 |
| STR-05 | État du flux | — → `B` en ligne, `N` images/s, `N` latence, `N` débit | seuils d'alerte | **vignette vidéo** + 3 mini-jauges | v1 |
| STR-06 | Le streamer a déclenché | — → `▶`, `T` action | boutons du streamer | chapeau + bouton du streamer | v2 |
| STR-07 | Prénom à citer | `▶`, `J` → `▶` | gabarit (« Dis bonjour à {pseudo} ») | bulle avec pseudo surligné | v2 |
| STR-08 | Consigne au comédien en salle (téléphone / oreillette) | `▶`, `C` comédien, `T` → `▶`, `▶` reçue | discrétion (vibration seule, écran noir) | bulle discrète + icône oreillette | v2 |
| STR-09 | Script du streamer (prompteur) | `▶`, `T` → `▶` | vitesse de défilement | **prompteur** qui défile | v2 |
| STR-10 | Retour audio vers le streamer | `▶`, source → `▶` | source (régie, micro de salle) | onde + casque | +tard |

### 6.15 Vidéo (6)

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| VID-01 | Lire une vidéo préenregistrée (synchronisée) | `▶`, `M`, surface → `▶` fin | surface (scène, téléphones), boucle, T serveur | vignette + **barre de temps** | v2 |
| VID-02 | Basculer de source | `▶`, source → `▶` | streamer, caméra de secours, boucle | **sélecteur** de 3 vignettes | v2 |
| VID-03 | Couper le flux (effet dramatique) | `▶` → `▶` | style de coupure (neige, figé, noir), durée | vignette « neige » | v2 |
| VID-04 | Figer / ralentir l'image | `▶` → `▶` | durée | vignette avec icône pause | +tard |
| VID-05 | Enregistrer la représentation | `▶` début, `▶` fin | calques inclus | point rouge REC | +tard |
| VID-06 | Diffuser le flux sur les téléphones | `▶`, `C` → `▶` | qualité basse | mini-téléphone avec vidéo | +tard |

### 6.16 Régie (11)

*Les blocs régie sont des **contrôles utilisables sur le canvas** en répétition et en live (comme les objets d'interface de Max),
et peuvent être « publiés » dans le tableau de bord live (mode présentation).*

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| REG-01 | Bouton régie (top manuel) | — → `▶` | libellé, couleur, raccourci, confirmation | **touche Stream Deck** avec état | v1 |
| REG-02 | Demander confirmation à la régie | `▶`, `T` question → `▶` oui, `▶` non, `▶` délai | délai, choix par défaut | boîte « Confirmer ? » avec deux boutons | v1 |
| REG-03 | Choix de la régie (branche) | `▶` → `▶` par option | options, délai, défaut | rangée de touches | v1 |
| REG-04 | Alerte régie | `▶`, `T` → `▶` | gravité, son | **bandeau** jaune / rouge | v1 |
| REG-05 | Journaliser / note de régie | `▶`, `T` → `▶` | niveau | ligne de journal | v1 |
| REG-06 | Panique | `▶` → `▶` | ce que fait la panique (noir, silence, image de secours, prévenir streamer) | gros bouton rouge sous capot | v1 |
| REG-07 | Retenir / relâcher le gate courant | `▶` → `▶` | — | main levée | v1 |
| REG-08 | Curseur régie (fader) | — → `N` | min, max, libellé | **fader** vertical manipulable | v2 |
| REG-09 | Compteur affiché au tableau de bord | `N` / `T` → — | libellé, seuils de couleur | **tuile chiffrée** (comme le tableau de bord) | v2 |
| REG-10 | Notifier les superviseurs | `▶`, `T` → `▶` | priorité | bulle vers téléphone superviseur | v2 |
| REG-11 | Bouton superviseur | — → `▶`, `J` qui a pressé | libellé, qui peut (superviseurs) | touche avec badge « superviseur » | v2 |

### 6.17 Modération (9)

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| MOD-01 | Filtre automatique | `E` texte → `E` accepté, `E` refusé | mots interdits (variantes l33t), liens, numéros, longueur | **tamis** ; compteurs passés / bloqués | v1 |
| MOD-02 | Tampon de délai | `E` → `E` | 1-3 s | file avec **barre de temps** par message | v1 |
| MOD-03 | File de validation manuelle | `E` → `E` validé, `E` refusé, `E` vedette | qui modère (poste, superviseurs) | **3 dernières bulles** avec ✓ ✗ ★ cliquables | v1 |
| MOD-04 | Limite de débit par joueur | `E` → `E` | n messages / s, message « attends 2 s » | sablier + compteur | v1 |
| MOD-05 | Sourdine fantôme | `▶`, `J` → `▶` | durée | avatar avec **bâillon transparent** | v1 |
| MOD-06 | Mettre en vedette | `▶`, `E` → `▶` | destination (scène, streamer) | étoile | v1 |
| MOD-07 | Avertir un joueur | `▶`, `J`, `T` → `▶` | texte | panneau triangle | v2 |
| MOD-08 | Exclure un joueur | `▶`, `J` → `▶` | confirmation | porte de sortie | v2 |
| MOD-09 | Modérer une image | `E` image → `E` validée, `E` refusée | file, floutage | vignette floutée ✓ ✗ | +tard |

### 6.18 Médias (8)

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| MED-01 | Son | — → `M` | fichier, volume, boucle | **forme d'onde** + lecture au survol | v1 |
| MED-02 | Image | — → `M` | fichier | **vignette** | v1 |
| MED-03 | Vidéo | — → `M` | fichier | première image + durée | v1 |
| MED-04 | Précharger | `▶`, `L·M`, `C` → `▶`, `N` % prêt | priorité | **barre de chargement** par téléphone (agrégée) | v1 |
| MED-05 | Banque de textes / répliques | — → `L·T` | textes | pile de cartes | v2 |
| MED-06 | Palette de couleurs | — → `L·Co` | couleurs nommées | **nuancier** | v2 |
| MED-07 | Liste de lecture | — → `L·M` | ordre, enchaînement | pistes empilées | v2 |
| MED-08 | Police | — → police | fichier | « Aa » dans la police | v2 |

### 6.19 Réseau externe (11)

*Forme à bord en prise. Corps commun : pastille de connexion du **pont local** + journal des 3 derniers messages.*

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| NET-01 | Envoyer OSC | `▶`, valeurs → `▶` | hôte, adresse `/cue/12/go`, arguments | **prise** + dernier message | v2 |
| NET-02 | OSC reçu | — → `▶`, valeurs | adresse (motif) | chapeau + journal | v2 |
| NET-03 | Envoyer MIDI | `▶` → `▶` | port, note / CC / programme, canal | **touche de piano** / potentiomètre | v2 |
| NET-04 | MIDI reçu | — → `▶`, `N` | port, filtre | chapeau + touche | v2 |
| NET-05 | Top QLab (raccourci OSC) | `▶` → `▶` | numéro de top, action (go, stop) | logo générique « top son » + numéro | v2 |
| NET-06 | Requête HTTP | `▶`, `O` → `▶` ok, `▶` erreur, `O` réponse | URL (liste blanche), méthode, délai | prise + code de réponse | v2 |
| NET-07 | Webhook reçu | — → `▶`, `O` | chemin, secret | chapeau + journal | v2 |
| NET-08 | Art-Net / DMX | `▶`, `N` → `▶` | univers, canal, fondu | **rangée de faders** de canaux | +tard |
| NET-09 | MQTT | `▶` / chapeau | sujet | prise + journal | +tard |
| NET-10 | Importer un chat externe (Twitch…) | — → `E` texte | canal | chapeau + bulles | +tard |
| NET-11 | État du pont local | — → `B`, `N` latence | — | pastille + latence | v2 |

### 6.20 IA (9)

*Toujours encadrée (cadre écrit par l'auteur), avec **relecture humaine** possible ; exécution locale (DGX) ou API ; jamais bloquante
pour le spectacle (délai max + réponse de secours obligatoires). Liseré « relecture » sur tous les blocs.*

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| IA-01 | Classer un message (modération) | `E` texte → catégorie, `N` confiance | catégories, seuil | **étiquettes** colorées sur une bulle | v2 |
| IA-02 | Générer un texte | `▶`, contexte → `▶`, `T` | consigne d'auteur, longueur, délai, texte de secours | **bulle** avec réponse d'exemple + anneau de délai | v2 |
| IA-03 | Personnage conversationnel (PNJ) | `E` message, `J` → `T` réponse | fiche du personnage, mémoire par joueur, relecture | **fil de messagerie** + portrait | v2 |
| IA-04 | Relecture humaine | `T` → `T` validé, `T` refusé | qui relit, délai, défaut | file ✓ ✗ ✎ | v2 |
| IA-05 | Résumer la salle | `L·T` → `T` | longueur, ton | entonnoir → bulle | +tard |
| IA-06 | Extraire mots-clés / thèmes | `L·T` → `L·T` | nombre | étiquettes | +tard |
| IA-07 | Traduire | `T` → `T` | langue | deux bulles | +tard |
| IA-08 | Voix de personnage (synthèse IA) | `T` → `M` | voix, émotion | onde + portrait | +tard |
| IA-09 | Choisir parmi les propositions (meilleure réplique) | `L·T` → `T` | critère | liste avec élue surlignée | +tard |

### 6.21 Jeux (14)

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| JEU-01 | Score (joueur / équipe) | `▶`, `C`, `N` → `▶`, `N` | portée, min | **compteur** + barres d'équipes | v1 |
| JEU-02 | Classement | `C`, critère → `L·J` | top N, égalités | **podium** | v1 |
| JEU-03 | Tirage / loterie | `▶`, `C` → `J` gagnant | sans remise, animation | **urne** / roue | v1 |
| JEU-04 | Premier qui (buzzer) | `E` → `J`, `▶` | fenêtre, verrouillage | ligne d'arrivée + avatar | v1 |
| JEU-05 | Course contre la montre | `▶`, `N` objectif → `▶` réussi, `▶` raté | durée, jauge | anneau + jauge d'objectif | v1 |
| JEU-06 | Tir à la corde (deux équipes) | `N` A, `N` B → `N` position, `▶` gagnant | gain, seuil | **corde** avec drapeau au centre | v2 |
| JEU-07 | Monnaie / jetons | `▶`, `C`, `N` → `▶`, `N` solde | monnaie, solde initial | **pile de pièces** | v2 |
| JEU-08 | Enchères | `▶`, `C` → `J` gagnant, `N` mise | durée, mise min, type (montante, cachée) | marteau + mise courante | v2 |
| JEU-09 | Quiz (série de questions) | `▶` → `▶` fini, `O` résultats | questions, points, temps | carte de question + numéro i/n | v2 |
| JEU-10 | Rôles secrets (loup-garou / traître) | `▶`, `C` → `▶` | rôles, répartition, révélation | **cartes face cachée** | v2 |
| JEU-11 | Inventaire | `▶`, `J`, objet → `▶` | objets, quantité | **sac** avec icônes | +tard |
| JEU-12 | Dilemme (matrice de gains) | choix A, choix B → gains | matrice | **grille 2×2** colorée | +tard |
| JEU-13 | Vies / élimination | `▶`, `C` → `C` encore en jeu | vies | cœurs pleins / vides | +tard |
| JEU-14 | Badge / succès | `▶`, `J` → `▶` | badge, condition | **médaille** | +tard |

### 6.22 Débogage et test (11)

*Gris tramé, **inactifs en live** (badge « ignoré en représentation »).*

| # | Nœud | Entrées → Sorties | Paramètres clés | Bloc visuel | Prio |
|---|---|---|---|---|---|
| DBG-01 | Sonde (afficher la valeur) | x → x (passe-plat) | format | **bulle de valeur** + historique (Watch des Blueprints, Preview de Shader Graph) | v1 |
| DBG-02 | Point d'arrêt | `▶` → `▶` | condition | **octogone rouge** | v1 |
| DBG-03 | Journal de débogage | `▶`, x → `▶` | — | 3 dernières lignes | v1 |
| DBG-04 | Simuler une entrée | `▶` → `E` | type (vote, texte, réaction, secousse), joueur (bot) | **doigt robot** + l'entrée simulée | v1 |
| DBG-05 | Générateur de faux messages | `▶` → flux d'`E` | débit, lexique, pseudos | robinet + débit | v1 |
| DBG-06 | Profil de bots | — → config | nombre, vitesse, distraction, déconnexions | **foule de robots** avec répartition des profils | v1 |
| DBG-07 | Épingler la sortie | x → x figé | valeur épinglée (n8n) | **punaise** + valeur | v2 |
| DBG-08 | Assertion (test) | `B` → `▶` ok, `▶` échec | message | coche / croix | v2 |
| DBG-09 | Graine aléatoire | — → `N` | graine | dé avec numéro | v2 |
| DBG-10 | Instantané / restaurer l'état | `▶` → `▶` | nom de l'instantané | appareil photo | v2 |
| DBG-11 | Mesurer la latence | `C` → `N` | — | histogramme des latences | v2 |

### 6.23 Outils du canevas (non exécutés) (6)

| # | Outil | Bloc visuel | Prio |
|---|---|---|---|
| OUT-01 | Cadre (groupe nommé, coloré, repliable) | rectangle teinté avec titre ; replié = une tuile avec le nombre de blocs | v1 |
| OUT-02 | Commentaire / post-it (texte, image, croquis) | post-it ; partagé entre auteurs | v1 |
| OUT-03 | Reroute (point de passage de fil) | petit point | v1 |
| OUT-04 | Signet / ancre de navigation | drapeau | v2 |
| OUT-05 | Recette (sous-graphe de bibliothèque) | double bord + façade | v2 |
| OUT-06 | Lien vers un autre flowgraphe (« voir aussi ») | carte avec vignette du flowgraphe cible | v2 |

### 6.24 Récapitulatif

| Famille | Nœuds | v1 | v2 | +tard |
|---|---|---|---|---|
| Déclencheurs | 24 | 17 | 7 | 0 |
| Flux / logique | 20 | 12 | 7 | 1 |
| Temps | 12 | 7 | 5 | 0 |
| Gates / règles | 13 | 12 | 1 | 0 |
| Données | 22 | 11 | 10 | 1 |
| Agrégats | 14 | 9 | 5 | 0 |
| Ciblage | 16 | 12 | 3 | 1 |
| Participants | 9 | 5 | 4 | 0 |
| Interfaces téléphone | 40 | 18 | 20 | 2 |
| Effets téléphone | 24 | 10 | 10 | 4 |
| Capteurs | 10 | 3 | 6 | 1 |
| Caméra / micro | 5 | 0 | 2 | 3 |
| Écran scène | 22 | 11 | 9 | 2 |
| Streamer / comédiens | 10 | 5 | 4 | 1 |
| Vidéo | 6 | 0 | 3 | 3 |
| Régie | 11 | 7 | 4 | 0 |
| Modération | 9 | 6 | 2 | 1 |
| Médias | 8 | 4 | 4 | 0 |
| Réseau externe | 11 | 0 | 8 | 3 |
| IA | 9 | 0 | 4 | 5 |
| Jeux | 14 | 5 | 5 | 4 |
| Débogage / test | 11 | 6 | 5 | 0 |
| Outils du canevas | 6 | 3 | 3 | 0 |
| **Total** | **326** | **163** | **131** | **32** |

> Note : le total dépasse largement la cible de 150. Les **outils du canevas** (6, dont 3 en v1) ne sont pas des nœuds exécutables ;
> sans eux, **320 nœuds** (160 v1, 128 v2, 32 plus tard). Le v1 « large » peut être resserré : un **v1 minimal pour jouer LIVE** tient en ≈ 100 nœuds (§7).

---

## 7. Le v1 minimal pour LIVE (≈ 100 nœuds, 9 corps vivants)

Pour jouer le déroulé de [06 §6](../06-cas-live-streamer.md) de bout en bout, sans le studio complet :

- **Déclencheurs** : DEC-01, 02, 03, 06, 07, 08, 09, 10, 11, 12, 14, 16, 17
- **Flux** : FLX-01, 02, 03, 07, 08, 10, 14, 15, 16, 17
- **Temps** : TPS-01, 02, 04, 06
- **Gates** : GAT-01 à 08, 10 à 13
- **Données / agrégats** : DON-01, 02, 03, 05, 06, 13 · AGR-01, 02, 04, 05, 07, 08
- **Ciblage / équipes** : CIB-01, 02, 03, 05, 06, 08, 09, 10, 11 · PAR-04
- **Écrans** : ECR-01, 02, 03, 06, 07, 09, 15, 16, 17, 25, 35
- **Effets** : EFT-01, 02, 08, 11, 16, 18, 21
- **Scène / streamer / régie / modération** : SCN-01, 02, 03, 06, 07, 08, 10, 14 · STR-01, 02, 04, 05 · REG-01, 02, 04, 06 · MOD-01, 02, 03, 05
- **Débogage** : DBG-01, 02, 04, 05, 06

Corps vivants à coder en premier : **pastille, forme d'onde, mini-téléphone, vignette 16:9, barres, jauge, anneau de temps, foule, feu**.
Les trois autres (valeur, bulle, journal) sont triviaux.

---

## 8. Implications pour la réalisation

### 8.1 Avec React Flow (xyflow)
- Un `nodeType` **par forme** (chapeau, rectangle, capsule, losange, double bord, prise) ; l'en-tête et le pied sont communs ;
  le **corps vivant** est un composant choisi par le nœud (`corps: "pastille" | "onde" | "telephone" | ...`).
- Les **définitions de nœuds** sont des données (JSON validé par Zod, comme le schéma du spectacle) : nom, famille, broches typées,
  paramètres, gabarit de phrase-résumé, corps vivant, repli iPhone, priorité. Ajouter un nœud = ajouter une définition + éventuellement
  une fonction moteur. **Bonne tâche à déléguer** (une définition = un brief borné, cf. [07 §7](../07-architecture-technique.md)).
- Le **mini-téléphone** doit réutiliser **le vrai composant d'écran** de l'app joueur (Svelte dans 07) : soit en iframe miniature
  (simple, isolé, un peu lourd), soit en compilant les écrans en Web Components utilisables depuis React. À trancher (§10).
- La **vignette 16:9** de l'écran scène : la page scène (PixiJS) tourne en iframe réduite **une seule fois**, et les blocs scène
  affichent des captures (`canvas` → image) à 2-5 Hz, pour éviter 20 contextes WebGL.

### 8.2 Données de l'éditeur
- Les **données d'exemple** (salle fictive) sont un fichier du spectacle : nombre de joueurs, équipes, zones, profils. Le même
  générateur sert aux bots de répétition (une seule source).
- En répétition / live, le serveur publie vers l'éditeur un **flux d'observation par bloc** (compteurs, dernière valeur, état),
  agrégé, à 5 Hz max, seulement pour les blocs visibles (l'éditeur s'abonne/désabonne selon la vue).
- Le JSON du flowgraphe stocke la **vue** de chaque bloc : position, taille choisie (puce / réduit / standard / déplié),
  nom personnalisé, cadre, épinglage. Elle n'influe pas sur l'exécution (le moteur reste déterministe).

### 8.3 Validation visuelle (rappel de 05)
Badges d'avertissement directement sur les blocs : cible vide, effet sans repli iPhone, gate sans délai max, boucle sans délai,
stroboscope au-dessus du plafond, IA sans texte de secours, réseau externe hors liste blanche, segment inaccessible.

---

## 9. Sources (consultées le 26/10/2026)

Pages consultées (résultats de recherche ou lecture directe) :

- ComfyUI — Preview Image : https://docs.comfy.org/built-in-nodes/PreviewImage.md
- ComfyUI — Mask Preview : https://docs.comfy.org/built-in-nodes/MaskPreview.md
- Blender — PR « Node previews in the shader editor » #110065 : https://projects.blender.org/blender/blender/pulls/110065
- Blender — extension Node Preview : https://extensions.blender.org/add-ons/node-preview/
- Blender — nœud Viewer (compositing) : https://docs.blender.org/manual/en/latest/compositing/types/output/viewer.html
- Article « Real-Time Node Previews in Blender » : https://digitalproduction.com/2025/02/11/real-time-node-previews-in-blender-because-guesswork-is-so-last-year/
- TouchDesigner — Viewer Active : https://derivative.ca/UserGuide/Viewer_Active
- TouchDesigner — Node Viewer : https://derivative.ca/UserGuide/Node_Viewer
- TouchDesigner — TOP Viewer : https://docs.derivative.ca/TOP_Viewer
- TouchDesigner — « Reading Operator Anatomy » : https://learn.derivative.ca/courses/100-fundamentals/lessons/101-navigating-the-environment/topic/reading-operator-anatomy/
- Houdini — drapeaux de nœuds : https://www.sidefx.com/docs/houdini/network/flags.html
- Unreal — Blueprint Debugger : https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-debugger-in-unreal-engine
- Unreal — exemple de débogage Blueprint : https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-debugging-example-in-unreal-engine
- Unreal 4.27 — débogage Blueprint : https://docs.unrealengine.com/4.27/ProgrammingAndScripting/Blueprints/BP_HowTo/Debugging
- Unreal — Introducing MetaSounds : https://dev.epicgames.com/documentation/unreal-engine/metasounds-the-next-generation-sound-sources-in-unreal-engine
- Unreal — Audio Insights, analyseurs : https://dev.epicgames.com/documentation/unreal-engine/analyzers-and-output-metering-in-audio-insights-in-unreal-engine
- Unity Shader Graph — Preview Node : https://docs.unity3d.com/Packages/com.unity.shadergraph@8.0/manual/Preview-Node.html
- Unity Shader Graph — Node : https://docs.unity3d.com/Packages/com.unity.shadergraph@7.3/manual/Node
- Node-RED — statut des nœuds : https://nodered.org/docs/creating-nodes/status
- FlowFuse Dashboard (Node-RED Dashboard 2.0) : https://flows.nodered.org/node/@flowfuse/node-red-dashboard
- Blockly : https://docs.blockly.com/guides/get-started/what-is-blockly
- Scratch Wiki — Blocks (formes) : https://en.scratch-wiki.info/wiki/Blocks
- n8n — exécutions : https://docs.n8n.io/workflows/executions/
- n8n — data pinning : https://docs.n8n.io/data/data-pinning/
- Figma — widgets : https://developers.figma.com/docs/widgets/
- Origami Studio : https://origami.design/
- Bitfocus Companion : https://bitfocus.io/companion
- Chataigne : https://benjamin.kuperberg.fr/chataigne/en
- cables.gl — documentation : https://cables.gl/docs/docs
- Nodes.io : https://nodes.io/
- vvvv — The Gray Book : https://thegraybook.vvvv.org/
- React Flow — nœud personnalisé : https://reactflow.dev/examples/nodes/custom-node

**‡ Non revérifiées en ligne** (budget de recherche épuisé ; contenu cité de mémoire, à confirmer) :
- Max/MSP — documentation (objets d'interface, mode présentation) : https://docs.cycling74.com/
- Pure Data — documentation (graph-on-parent, objets graphiques, tableaux) : https://msp.ucsd.edu/Pd_documentation/ (le certificat a été refusé par l'outil de lecture)
- Unreal Niagara — https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-niagara-effects-for-unreal-engine
- Unreal Sound Cue Editor — https://dev.epicgames.com/documentation/en-us/unreal-engine/sound-cue-editor-in-unreal-engine
- Make — https://www.make.com/en/help/scenarios/creating-a-scenario
- Zapier — https://zapier.com/
- Détails d'interface de vvvv gamma (valeurs en info-bulle), cables.gl (aperçu de textures), Chataigne (machines à états, timeline) :
  les pages consultées ne les décrivent pas.

---

## 10. Questions ouvertes (à trancher avec le propriétaire)

1. **Mini-téléphone** : iframe de la vraie app joueur (fidèle, plus lourd) ou écrans compilés en Web Components (léger, plus de travail) ?
2. **Zoom sémantique automatique** ou tailles toujours choisies à la main ?
3. **Lecture au survol** des sons dans l'éditeur : activée par défaut ou sur clic (open-space, régie partagée) ?
4. En **live**, le canvas est-il modifiable (correction à chaud, journalisée) ou strictement en lecture seule ?
5. Quel **v1** : le minimal LIVE (≈ 100 nœuds, §7) ou le v1 large (160) ? Recommandation : minimal d'abord, puis par familles.
6. Les **recettes** (sous-graphes de bibliothèque) font-elles partie du v1 pour les auteurs non développeurs (« Vote à embranchement complet » en un bloc) ?
7. Ajout des jetons `--fam-*` dans `design/tokens.css` : validation de la palette de familles (§2.4) en clair et en sombre.
