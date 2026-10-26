# Étude — L'écran scène : pile technique, design et catalogue d'effets

*Étude du 26 octobre 2026. Complète [06 — Cas LIVE §3](../06-cas-live-streamer.md) et [07 — Architecture](../07-architecture-technique.md).*
*Périmètre : la page « écran scène » (ordinateur → projecteur) qui affiche la vidéo du streamer et, par-dessus, les réactions du public en animations. Pas de liste de commentaires.*

**Convention de confiance.** Chaque affirmation est suivie de sa source `[n]` (liste en §9). Ce qui n'est **pas** sourcé est marqué **(inférence)** : jugement de conception ou ordre de grandeur à vérifier par un prototype. Les numéros de version viennent du registre npm lu le 26/10/2026.

---

## 1. Résumé et recommandation

**Pile recommandée (une phrase) :** une page plein écran = `<video>` WebRTC en dessous + **un seul canevas PixiJS v8 transparent** au-dessus (WebGL d'abord, WebGPU en option), avec **ParticleContainer** pour les particules et emojis, **BitmapText (police dynamique, MSDF pour les gros titres)** pour le texte, un **émetteur de particules maison** (le paquet officiel n'est pas publié pour Pixi v8), des **ressorts maison** pour les pops, **GSAP** uniquement pour les séquences « héros », **MediaPipe Face Detector** en assistant de la zone protégée, et un **régulateur de débit côté serveur**.

| Décision | Choix | Pourquoi (détail) |
|---|---|---|
| Rendu | **PixiJS v8** (8.22.0), WebGL par défaut | 2D natif, `ParticleContainer`, `BitmapText`, filtres ; §2.1 |
| Particules | **Émetteur maison sur `ParticleContainer`** | `@pixi/particle-emitter` : dernière version npm 5.0.10, pairs `<8.0.0` ; §2.2 |
| Texte | **BitmapText dynamique** + MSDF (gros), `Text` en secours | rapide, net à l'échelle ; emoji/CJK à traiter à part ; §2.3 |
| Emoji | **Atlas unique de ~256 emoji triés** : **Noto (Apache-2.0)** par défaut, Twemoji (CC-BY) en alternative | licences ; §2.4 |
| Animation | **Ressorts/intégrateur maison** en boucle + **GSAP 3.15** pour les séquences | gratuit (licence « no charge ») ; §2.5 |
| Physique | **Pas de Matter.js par défaut** ; seulement pour 1 effet (éboulis) | §2.5 |
| Visage | **Zone protégée réglée par la régie** + **détection MediaPipe** comme aide (10–15 Hz) | §3.4 |
| Débit | **Régulateur serveur** (budget par gabarit, priorité, agrégation, échantillonnage) | §3.3 |
| Sécurité visuelle | **≤ 3 flashs/s**, pas de flash rouge saturé plein écran | WCAG 2.3.1 [31] ; §3.2 |

**Risque principal :** le texte (rastérisation, emoji dans les messages, contour net à 15 m). Il faut un **prototype de charge** avant de figer (§7).

---

## 2. Technique

### 2.1 Moteur de rendu : PixiJS v8 vs Three.js vs Canvas 2D vs DOM/CSS

| Option | Forces | Faiblesses pour notre cas | Verdict |
|---|---|---|---|
| **PixiJS v8** (`pixi.js` 8.22.0, MIT) [1] | Moteur 2D WebGL **et WebGPU** ; `autoDetectRenderer()` choisit le moteur [2] ; sprites 100 k en ~15 ms CPU vs ~50 ms en v7 (Bunnymark) [2] ; `ParticleContainer` : 200 000 sprites à 60 i/s en mode normal, **~1 000 000 particules** à 60 i/s en mode particules (un MacBook Pro M3, test unique) [3] ; `BitmapText`, `HTMLText`, filtres (`pixi-filters` : glow, outline, shockwave, bloom, RGB split…) [4] | `Particle` est **expérimental** (API susceptible de changer) [5] ; pas d'enfants/événements/filtres sur une particule [5] | **Retenu** |
| **Three.js** (0.186.1, MIT) [6] | Excellent pour la 3D, instanciation | Moteur 3D : pas de gestion native du texte 2D ni des sprites en atlas aussi directe ; plus de code pour des bénéfices 3D dont nous n'avons pas besoin. Je n'ai pas trouvé de benchmark 2026 comparant Pixi/Three/Canvas sur des particules 2D [7] | Écarté (sauf effet 3D précis plus tard) |
| **Canvas 2D** | Zéro dépendance ; `canvas-confetti` (ISC) l'utilise [10] | Rendu CPU : le nombre de sprites alpha + texte à contour + ombres au pixel près est le point faible **(inférence, connaissance générale)** ; pas de filtres GPU | Écarté pour la couche principale ; OK pour un prototype jetable |
| **DOM/CSS + GSAP/Motion** | Texte net natif (CSS `text-shadow`, `-webkit-text-stroke`), emoji couleur gratuits via la police du système, GSAP 3.15 / Motion 14.6 (MIT) [11][12] | Coût de mise en page et de composition par élément ; SplitText de GSAP sert au DOM, pas au canevas [13] ; au-delà de quelques dizaines d'éléments animés le DOM devient fragile **(inférence)** | Gardé pour l'**outillage** (page de debug, aperçu régie), pas pour la scène |

**Choix du backend.** Le WebGPU est livré dans Chrome, Edge, Firefox et Safari (Safari 26 depuis septembre 2025, Firefox Windows depuis juillet 2025) [14]. Mais Pixi précise qu'il n'améliore pas tout automatiquement : il aide surtout les scènes à nombreuses ruptures de lot (filtres, masques, modes de fusion) [2]. **Reco :** WebGL par défaut (le plus éprouvé), option `preference: 'webgpu'` testée sur l'ordinateur réel de la salle ; on garde le plus rapide mesuré. La norme W3C WebGPU est encore en « Candidate Recommendation Draft » à septembre 2026 [14].

**Vidéo.** Le doc 06 prévoit un flux WebRTC < 500 ms. Reco **(inférence)** : afficher le flux dans un `<video>` HTML **sous** le canevas Pixi transparent (`backgroundAlpha: 0`). Le décodage matériel et le compositeur font le travail ; on évite de recopier chaque image dans une texture GPU. Pixi sait aussi utiliser une vidéo comme texture (`VideoSource`, avec mise à jour automatique) [15], à réserver aux effets qui déforment la vidéo (onde de choc, aberration chromatique, zoom). Le tremblement d'écran (« shake ») se fait en CSS sur un conteneur qui enveloppe vidéo + canevas.

### 2.2 Moteurs de particules

| Candidat | État | Verdict |
|---|---|---|
| **`@pixi/particle-emitter`** | npm `latest` = **5.0.10** (republié 08/01/2026), pairs `@pixi/core >=6.0.4 <8.0.0` [16] ; le dépôt dit « utilisez v6 » (Pixi 6) [17]. Un README indexé évoque une v6 « migrée vers Pixi v8 » mais **je n'ai pas pu la confirmer sur npm** ; contradiction non levée [18] | Inutilisable tel quel avec Pixi v8 |
| Fork **`@spd789562/particle-emitter`** | Reconstruit sur `ParticleContainer`, Pixi **≥ 8.5.0** ; toutes les textures doivent partager la même `TextureSource` [19] | Communautaire, petit : à évaluer, pas à dépendre |
| **tsParticles** 4.5.0 (MIT) [20] | Moteur à part (son propre canevas) ; paquets confetti, fireworks, formes emoji [21] ; je n'ai trouvé **aucun benchmark** d'émetteurs emoji en v4 [21] | Bon pour prototyper vite ; deux canevas = deux boucles : écarté en production |
| **canvas-confetti** 1.9.4 (ISC) [10] | `shapeFromText` pour des confettis emoji ; `useWorker` pour déporter sur un worker ; un canevas à part | Idéal pour un prototype de 1 h, pas pour le rendu final (contrôle limité) |
| **Maison sur `ParticleContainer`** | Nos effets sont de la cinématique simple (gravité, traînée, durée de vie, ressort) ; ~300 lignes ; un seul `TextureSource` (atlas) donc un seul lot | **Retenu** |

**Conception de l'émetteur maison (inférence) :** tableaux typés (structure de tableaux : `x[]`, `y[]`, `vx[]`, `vy[]`, `life[]`, `scale[]`, `rot[]`) + pool de `Particle` préalloués, **zéro allocation par image** ; `dynamicProperties` limité à `position` (+ `color` seulement pour les effets avec fondu), car chaque propriété dynamique ajoute un coût par image et les propriétés statiques ne montent au GPU qu'à `update()` [3][5]. Un `ParticleContainer` par couche (fond / milieu / avant-plan) pour garder l'ordre de profondeur, tous sur le même atlas.

### 2.3 Texte net et performant

Faits sourcés :
- `Text` rastérise **chaque chaîne** en texture (à éviter pour des centaines d'instances ou des changements à chaque image) ; `BitmapText` dessine depuis un atlas préparé, « ultra-rapide », partage les textures de glyphes ; `HTMLText` gère les emoji mais n'est pas fait pour des centaines de blocs [22][23].
- Pixi v8 : `BitmapText` peut **générer des polices à la volée** (ajoute les glyphes quand nécessaire) ; remplissages et contours de texte acceptent dégradés et textures [2].
- Les polices **MSDF/SDF** restent nettes à toute échelle ; le chargement se fait par un `.fnt`/`.xml` (AngelCode BMFont) via `Assets.load` ; la résolution d'un `BitmapText` ne peut pas être changée après coup [22].
- Les jeux de caractères **CJK ou emoji lourds** consomment trop de mémoire en police bitmap ; la doc recommande `Text`/`HTMLText` dans ce cas [22].
- `SplitText` / `SplitBitmapText` (expérimentaux) découpent en `lines/words/chars`, animables un par un ; le découpage perd le crénage [24].
- `msdf-atlas-gen` (MIT) produit des atlas MSDF à partir de TTF/OTF, sortie PNG + JSON/CSV [25] ; la doc Pixi cite AssetPack pour produire un atlas de police chargeable [22]. Le JSON de `msdf-atlas-gen` n'est pas du BMFont : **passer par AssetPack** ou convertir **(à vérifier)**.

**Reco :**
1. **Police dynamique** (`BitmapFont` installée au démarrage, latin + accents + ponctuation, étendue à la volée) pour pops et danmaku. Police épaisse (grasse, sans empattement) : cf. §3.2.
2. **MSDF** pour la typographie cinétique et les titres de séquence (très grands, mis à l'échelle en continu) : un atlas MSDF unique, généré hors ligne.
3. **Contour** : la doc BitmapText n'illustre pas le contour [22]. Plan **(à valider en prototype)** : (a) contour cuit dans la police dynamique via le style (rendu canevas des glyphes) ; (b) à défaut, double dessin (copie sombre décalée/agrandie sous le texte) ; (c) pour l'MSDF, contour dans un shader maison.
4. **Emoji dans un message** : on découpe le message en jetons ; les emoji sont remplacés par des **sprites de l'atlas emoji** placés en ligne (largeur = hauteur de ligne) ; le reste du texte part en `BitmapText`. Aucun emoji ne passe par la police bitmap. **(inférence, à prototyper)**
5. **CJK / caractères hors police** : repli sur `Text` avec cache et plafond (max N par seconde) ; ou restreindre l'alphabet à la saisie (doc 06 §5).
6. Messages **≈ 80 caractères** max (doc 06) : à 15 m, 2 lignes maximum par pop.

### 2.4 Emoji couleur en WebGL : atlas et licences

L'emoji est affiché comme un **sprite d'un atlas** (pas via la police du système), pour un rendu identique sur tous les ordinateurs et un seul lot de dessin **(inférence)**. Un atlas de 2048×2048 en cellules de 128 px = 256 emoji, ≈ 16 Mo en mémoire GPU **(calcul)** ; une seconde texture 512 px chargée à la demande pour les « héros » (§5, G-EMOJI).

| Jeu | Licence | Points d'attention |
|---|---|---|
| **Noto Color Emoji** (Google) | Polices : SIL OFL 1.1 ; outils et **images : Apache-2.0** ; drapeaux : domaine public [26] | Plus simple juridiquement : aucune obligation de partage ; conserver la mention de licence. Le dépôt fournit les images SVG et PNG [26] (tailles PNG : **à vérifier** dans le dépôt) |
| **Twemoji** (fork communautaire `jdecked/twemoji`, v17.0.x, npm `@twemoji/api` 17.0.3) | Code MIT, **graphismes CC-BY 4.0** [27][28][29] | Attribution obligatoire ; le projet accepte une mention dans un README, une page « À propos », un pied de page, ou le code source [27][28] : **la ligne dans le générique ou le programme suffit probablement** (à valider). Le dépôt d'origine `twitter/twemoji` documente la v14 et son CDN MaxCDN est arrêté [27] |
| **OpenMoji** | **CC BY-SA 4.0** : attribution + **partage dans les mêmes conditions** si on adapte [30] | Un atlas d'emoji recomposé est probablement une adaptation : il faudrait le publier en CC BY-SA. À éviter si on veut garder les assets fermés. PNG 72 et 618 px, SVG [30] |
| Emoji Apple / Segoe | Non redistribuables **(connaissance générale)** | Ne pas les extraire. L'usage direct de la police du système (`fillText`) est possible pour un prototype mais dépend de l'OS (Segoe UI Emoji sous Windows) **(inférence)** |

**Reco :** Noto (Apache-2.0). Attention : les téléphones du public affichent leurs emoji natifs (Apple/Google) ; l'écran scène affichera donc des **équivalents Noto**, au dessin différent. Acceptable ; sinon figer un **jeu restreint d'emoji de réaction** (≈ 24 à 48) proposés dans l'UI du téléphone et redessinés à l'identique sur scène, ce qui supprime l'écart. **(décision produit)**

### 2.5 Animation et physique légère

- **Ressorts maison** (intégrateur semi-implicite : `v += (k·(cible − x) − c·v)·dt ; x += v·dt`) pour l'apparition en rebond des pops : quelques flottants par objet, aucune dépendance, pas de création de « tween » par message **(inférence)**.
- **GSAP 3.15.0** : le site indique « GSAP est maintenant gratuit pour tous » (Webflow) [11] ; le registre donne la licence « Standard *no charge* » [11]. Les conditions précises de la licence (usages exclus) ne figurent pas sur les pages lues : **à relire avant la production**. Le plugin SplitText agit sur le **DOM** [13] ; pour le canevas, utiliser `SplitBitmapText` de Pixi (que la doc Pixi anime justement avec `gsap.from`) [24]. Usage cible : les timelines des effets « héros » (révélation de vote, cadeau).
- **Motion 14.6.0 (MIT)** [12] : alternative à GSAP ; la page lue ne confirme pas de support direct des objets canevas : non retenu **(à vérifier si GSAP posait un souci de licence)**.
- **Matter.js 0.20.0 (MIT)** [32] : moteur de corps rigides ; la doc prévient que les bundlers aux réglages par défaut (cartes sources) peuvent dégrader le temps réel [33]. Aucun chiffre de capacité publié. **Reco :** non nécessaire pour 14 des 17 effets ; réservé à « Éboulis » (≤ ~150 corps, **ordre de grandeur à mesurer**).

### 2.6 Tenir 60 i/s avec 50 messages/s

Budget (inférence, à valider §7) :

| Poste | Plafond de conception |
|---|---|
| Image | 16,6 ms ; viser **p99 < 12 ms** de travail JS+GPU |
| Messages entrants | 50/s traités par le régulateur (§3.3), **≤ 8 textes/s** affichés |
| Textes vivants | pops ≤ 14, danmaku ≤ 60, cinétique ≤ 2, vedette ≤ 1 |
| Particules vivantes | **≤ 10 000** (Pixi tient ~100 000+ dans ses démos [3][5] ; on garde de la marge pour le texte et les filtres) |
| Filtres plein écran | ≤ 1 actif à la fois (les filtres rompent les lots [2]) |
| Allocation | pools d'objets, aucune allocation dans la boucle ; mesurer les pauses du ramasse-miettes |
| Résolution | rendu 1920×1080, `resolution` réglable ; passer en 4K seulement si le projecteur l'exige (remplissage ×4) |

Principe clé : **les messages ne sont pas des objets de rendu avant d'avoir été sélectionnés**. Les 50 msg/s sont réduits en amont à quelques ordres d'affichage (§3.3) ; seul ce flux réduit touche le moteur de rendu.

---

## 3. Design

### 3.1 Références

| Référence | Ce qu'on en retient | Source |
|---|---|---|
| **Niconico / danmaku** (depuis 2006) | commentaires qui traversent la vidéo ; au moment fort ils remplissent l'écran ; critique : surcharge visuelle qui masque l'image. Les plateformes offrent plafond de commentaires, vitesse, filtres, mode « seulement en haut » ; certains services utilisent de l'IA pour **ne pas couvrir les visages** | [34] |
| **Pistes (lanes) de danmaku** | exemple d'implémentation : 10 pistes, choix de la piste la moins encombrée, espacement mini 50 px | [35] |
| **Twitch Power-ups** (juin 2024) | « Effets de message », **« célébration à l'écran »** (emotes qui volent sur le flux), **« Gigantify »** (emote agrandi) : l'idée d'un geste payant-visible qui s'impose à l'écran | [36] |
| **StreamElements AlertBox** | file d'attente d'alertes, durée réglable par type, option « sauter les variations pour le même utilisateur » ; conseils : cohérence, lisibilité, animations **brèves**, tester dans la scène réelle | [37] |
| **TikTok LIVE – cadeaux** | cadeaux = animation dédiée, plus spectaculaire quand la valeur monte, avec le pseudo de l'envoyeur ; le fonctionnement exact des combos n'est pas documenté publiquement dans mes sources | [38] |
| **YouTube Live – réactions** | 5 emoji anonymes (test 2022) puis généralisation ; l'animation « emojis flottants » à la Instagram est documentée seulement côté SDK tiers | [39][40] |
| **Concerts / stades** | bracelets lumineux pilotés à distance (Xylobands) : le public devient un écran de pixels. Aucune source trouvée sur un mur LED piloté par téléphones : référence d'ambiance seulement | [41] |

**Enseignement :** tous ces systèmes séparent (1) le **texte** (rare, sélectionné) de (2) l'**émotion** (emoji, cœurs, densité) qui, elle, est massive. C'est exactement la ligne de conduite du doc 06.

### 3.2 Lisibilité à 15 m

**Règles de dimensionnement** (écran de projection) [42] :
- Hauteur de lettre ≥ **4 mm par mètre** de distance (règle simple), **5 mm/m** (20 arcmin, usage « messages de sécurité »), **absolu minimum 2 mm/m** (≈ 7 arcmin) ; lisibilité correcte ≥ 5–7 arcmin.
- Règles de taille d'image : 4×H, 6×H (texte détaillé), 8×H (images) pour le spectateur le plus éloigné [42].

**Application à 15 m (calcul à partir de [42]) :**

| Règle | Hauteur de lettre à 15 m |
|---|---|
| Minimum absolu (2 mm/m) | 30 mm |
| Règle simple (4 mm/m) | 60 mm |
| Confort (5 mm/m) | **75 mm** |

Exemple : image projetée de **2 m** de haut en 1080 p (0,54 px/mm) → 75 mm = **≈ 40 px de hauteur de majuscule**, soit une taille de police d'environ **55–60 px** **(inférence : capitale ≈ 0,7 em)**. En paramétrage : `taille_min_px = 5 mm × distance_m × (hauteur_px / hauteur_image_mm) / 0,7`. **Renseigner dans l'éditeur la distance du dernier rang et la hauteur d'image** : le logiciel calcule alors la taille minimale et refuse d'afficher en dessous.

Recommandations (pratique, non sourcées sauf mention) :
- **Taille** : texte courant ≥ 5 % de la hauteur d'image (valeur à ajuster par le calcul ci-dessus) ; texte vedette ≥ 9 % ; pseudo ≥ 70 % du corps.
- **Contraste** : remplissage clair saturé, **contour sombre épais** (≈ 12–15 % de la hauteur de lettre) et **halo/ombre portée** semi-transparent ; un projecteur ne rend pas de vrai noir, donc compter sur le **contour** plutôt que sur un fond sombre.
- **Police** : très grasse, sans empattement, grandes ouvertures (type « black/heavy »), pas de graisses fines, pas de lettres condensées.
- **Couleur du pseudo** : teinte stable issue d'un hachage du pseudo, mais **luminosité et saturation bornées** (pas de bleu foncé ni de couleurs pâles) pour garantir le contraste.
- **Durée** : 1 mot ≈ 0,3 s de lecture ; un pop de 6 mots reste ≥ 3 s ; danmaku : vitesse telle qu'un message de 20 caractères reste visible ≥ 4 s.
- **Sécurité photosensible** : pas plus de **3 flashs par seconde** ; seuil d'aire ≈ 25 % d'un champ visuel de 10°, et pas de flashs rouges saturés [31]. Le « flash d'écran » (combo) doit donc être unique, bref et **non répété à plus de 3 Hz** ; les effets plein écran passent par un **limiteur global**.
- **Mouvement** : éviter un défilement trop rapide (le danmaku à 15 m doit rester lisible : ≤ 1/6 de largeur d'écran par seconde pour un texte courant **(inférence)**).

### 3.3 Régulation du débit : représenter 200 messages en 5 s

200 messages / 5 s = **40 msg/s**. Aucun texte à 8 msg/s ne se lit ; l'écran doit **montrer une sélection et traduire le reste en énergie**. Le régulateur tourne **côté serveur** (dans le journal d'événements, rejouable : principe 2 du README) et émet des **ordres d'affichage** vers l'écran scène.

Étages, dans l'ordre :

1. **Filtre / modération** (doc 06 §5) : tampon 1–3 s, mots interdits, limite par joueur.
2. **Agrégation** : messages identiques ou quasi (après normalisation : minuscules, accents, répétitions de lettres) → **un seul ordre « mème × N »** (effet MÈME, §5). Les emoji seuls sont comptés, pas affichés individuellement.
3. **Notation de priorité** (par message) : `score = 3·nouvel_auteur + 2·(auteur_non_vu_depuis_>60s) + 1·longueur_utile + 5·épinglé + 4·mention_du_streamer − pénalité_si_auteur_déjà_affiché_<5s` **(valeurs à régler en répétition)**.
4. **Budget par gabarit** (§3.5) : `n_affichés/s = clamp(a·√débit_entrant, 1, plafond_gabarit)` ; par ex. 40 msg/s avec `a = 1,2` → ~7,6/s, plafonné à 8. Le surplus ne disparaît pas : il alimente la **densité** (étage 5).
5. **Échantillonnage équitable** quand il y a plus de candidats que de places : **réservoir pondéré** (algorithme A-Res : clé aléatoire^(1/poids), on garde les k plus grandes) [43] ; garantit que chaque auteur a une chance proportionnelle sans trier tout le flux.
6. **Représentation du reste** : le débit entrant total pilote (a) le **taux d'émission** de cœurs/confettis, (b) la **jauge de salle** et le combo, (c) le **nuage de mots** en fin de séquence. 200 messages en 5 s se voient donc : 8 textes lisibles + 1 gros « LOL ×43 » + une pluie de cœurs plus dense + la jauge qui monte.
7. **Équité** : un auteur ne peut pas apparaître plus d'une fois toutes les 4 s en moyenne ; son premier message de la séquence est prioritaire (le public doit se voir).
8. **Dégradation propre** : si le temps de trame dépasse 14 ms (moyenne glissante), l'écran scène **réduit le budget** d'un cran (moins de particules, filtres coupés) puis le remonte : jamais de gel (principe 5 du README).

Débit d'événements vers l'écran : lots à 10–20 Hz plutôt qu'un événement par message **(inférence)**.

### 3.4 Zone protégée autour du visage

**Détection possible en temps réel : oui.** `@mediapipe/tasks-vision` (1.1.1, Apache-2.0) [44] propose un **Face Detector** : modèle BlazeFace court portée en entrée 128×128, mode `VIDEO` avec `detectForVideo()`, sorties : boîte englobante, score, six points clés (yeux, nez, bouche, oreilles) ; `minDetectionConfidence` par défaut 0,5 [45][46]. Latence publiée : **2,94 ms CPU / 7,41 ms GPU** sur un Pixel 6 [46]. Attention : `detect`/`detectForVideo` sont **synchrones et bloquent le fil principal** ; la doc recommande des web workers [45]. Les licences des modèles ne sont pas indiquées sur la page : **lire les fiches de modèle** [46].

Conception recommandée **(inférence)** :
1. **Source de vérité = la régie.** Un rectangle « zone protégée » (ou ellipse) réglable à la main, enregistré par séquence. C'est le seul mécanisme garanti ; il marche même si la détection échoue.
2. **Détection en assistant**, 10–15 Hz (pas à 60), dans un worker via `createImageBitmap(video)` (faisabilité en worker : **à valider**) ; sinon sur le fil principal à 8–10 Hz, une durée de ~3–8 ms par appel.
3. **Lissage** : moyenne exponentielle sur le centre et la taille, boîte **agrandie ×1,6 à ×2** (visage + cou + gestes), avec **hystérésis** (la zone ne se rétrécit qu'après 1 s sans détection) et **repli sur le dernier rectangle connu** si plus de visage ; si plusieurs visages : union.
4. **Application** : (a) les pops et la cinétique tirent leur position par **rejet** hors de la zone ; (b) le danmaku **saute les pistes** qui traversent la zone, ou les ralentit/atténue (alpha) dans la zone ; (c) les particules ne sont pas exclues (elles sont courtes et translucides) mais les cœurs montent **sur les bords** ; (d) l'« éclat » plein écran évite le visage (masque).
5. **Option phase 2 : segmentation de personne** pour faire passer les commentaires **derrière** le streamer (le « mask danmaku » existe déjà dans l'écosystème des plateformes [34]). Tâche de segmentation de MediaPipe : coût et latence à mesurer ; ne pas promettre.
6. **Marge de latence** : la vidéo est retardée de ~0,5 s (WebRTC) ; la détection tourne sur l'image affichée, donc la zone suit le visage avec un retard de 1–2 images de détection : acceptable avec la marge ×1,6–2.

### 3.5 Gabarits par séquence

Un **gabarit** est un jeu de paramètres que la régie bascule d'un clic (doc 06 §3 : « calme, folie, vote, entracte »). Exemple de valeurs de départ **(à régler en répétition)** :

| Paramètre | CALME | FOLIE | VOTE | ENTRACTE |
|---|---|---|---|---|
| Textes affichés/s (plafond) | 1,5 | 8 | 0–1 (seulement épinglés) | 0,5 |
| Style de texte | POP | DANMAKU + MÈME | aucun (sauf vedette) | NUAGE → GÉNÉRIQUE-PSEUDOS |
| Cœurs / emoji | doux, ≤ 30/s | ≤ 150/s, FUSÉE active | masqués | lents, ambiance |
| Particules max | 2 000 | 10 000 | 3 000 | 4 000 |
| Combo / tremblement | off | on (≤ 6 px, jamais > 3 flashs/s) | off | off |
| Zone protégée | stricte (×2) | stricte (×1,6) | sans objet (barres hors visage) | sans objet |
| Palette | pastel/chaude | néon saturé | 1 couleur par option | sobre |
| Rythme | lent (3–6 s par pop) | rapide (1–3 s) | monte vers la révélation | statique |

Chaque ligne est un champ de l'éditeur (vitesse, densité, zone protégée, palette : doc 06 §3).

---

## 4. Architecture de la page écran scène (proposition)

```
WebSocket ──► [Reçoit "ordres d'affichage" lots 10–20 Hz]
                  │
          ┌───────▼────────┐        ┌─────────────────────────┐
          │ Planificateur  │◄───────│ Zone protégée (régie +  │
          │ pistes, places,│        │ MediaPipe 10–15 Hz)     │
          │ gabarit actif  │        └─────────────────────────┘
          └───────┬────────┘
                  │ crée des effets (pool)
   <video> ──►  ┌─▼───────────────────────────────────────┐
   (dessous)    │ Canevas PixiJS v8 transparent            │
                │ couches : fond / textes / particules /   │
                │           avant-plan / HUD (vote, jauge) │
                │ Ticker unique, pools, limiteur de flashs │
                └──────────────────────────────────────────┘
```
- **Une boucle, un canevas.** Chaque effet est un objet à `start(params)`, `update(dt)`, `dispose()` venu d'un pool.
- **Limiteur global de flashs** : un seul service autorise les flashs plein écran (≤ 3/s, [31]).
- **Mode télémétrie** : p50/p95/p99 du temps de trame, compte de particules, taille de file ; affichable en superposition dans la régie.
- **Reprise** : l'écran scène ne garde aucun état de jeu (principe 1) ; rechargé, il redemande l'état courant (gabarit, votes) au serveur.

---

## 5. Catalogue d'effets (17)

Notation : **Déclencheur** = événement serveur ou action régie ; **Paramètres** = champs d'éditeur ; **Technique** = comment le réaliser dans la pile du §1.

### Textes

**1. POP-BULLE**
- *Description* : le message apparaît en bulle colorée qui grossit avec rebond (ressort), reste 3–6 s, puis s'envole ou éclate en éclats/emoji. Placé librement, hors zone protégée.
- *Déclencheur* : ordre d'affichage « message » en gabarit CALME.
- *Paramètres* : `durée` (3–6 s), `raideur/amortissement` du ressort, `taille` (≥ min lisibilité), `couleur` (couleur du pseudo), `sortie` (envol | éclat), `max_simultanés` (14), `marge_visage`.
- *Technique* : conteneur par bulle (fond arrondi `Graphics` mis en cache en texture + `BitmapText` + sprites emoji) ; ressort maison ; placement par rejet hors zone ; éclat via émetteur de particules.

**2. DANMAKU**
- *Description* : le texte traverse l'écran de droite à gauche sur plusieurs pistes (style Niconico) ; énergie « folie ».
- *Déclencheur* : gabarit FOLIE, ordre « message ».
- *Paramètres* : `nb_pistes` (6–10), `vitesse` (px/s), `espacement_mini` (≥ 50 px, [35]), `alpha`, `max_simultanés` (60), `pistes_interdites` (zone visage), `taille`.
- *Technique* : attribution de piste = celle dont le dernier message a libéré le plus d'espace ; temps de sortie prédit (largeur/vitesse) pour éviter les collisions sans les tester à chaque image ; `BitmapText` poolés ; déplacement par incrément constant.

**3. MOT-CINÉTIQUE**
- *Description* : un message mis en avant arrive mot par mot, taille selon l'importance (mots-clés plus gros), avec accélérations, rotations et chocs.
- *Déclencheur* : régie « mettre en avant », ou message à très haute priorité.
- *Paramètres* : `mots_par_seconde`, `échelle_max`, `chorégraphie` (cascade | claque | zoom), `couleurs`, `durée_totale`.
- *Technique* : MSDF (net à toute échelle) + `SplitBitmapText` (expérimental) ou sprites par mot ; séquence GSAP ; ressorts.

**4. VEDETTE**
- *Description* : message épinglé en grand format : couleur du pseudo, bandeau, son ; reste jusqu'à relève.
- *Déclencheur* : ⭐ du superviseur ou de la régie (doc 06 §5).
- *Paramètres* : `durée`, `position` (hors visage), `son`, `style` (bandeau | bulle géante), `échelle`.
- *Technique* : conteneur MSDF + halo (filtre `GlowFilter` *ponctuel*, un seul actif, [4]) ; son géré hors canevas.

**5. NUAGE-DE-MOTS**
- *Description* : en fin de séquence, les mots les plus tapés grossissent et se placent en nuage.
- *Déclencheur* : fin de séquence (régie ou timer) ; comptage cumulé côté serveur.
- *Paramètres* : `nb_mots` (≤ 25), `stop-words`, `taille_min/max`, `durée_de_montée`, `forme` (libre | silhouette).
- *Technique* : le serveur envoie `(mot, poids)` ; placement en spirale/anti-chevauchement (calcul au chargement, pas par image) ; échelle animée par ressort ; MSDF.

**6. ÉCHO-STREAMER**
- *Description* : quand le streamer lit un message, celui-ci (déjà passé à l'écran) se rallume brièvement en s'agrandissant.
- *Déclencheur* : tap du streamer sur son téléphone ou de la régie (« lu »), via l'identifiant du message.
- *Paramètres* : `durée_éclat`, `échelle`, `couleur_aura`, `mémoire` (combien de messages récents restent « éclairables »).
- *Technique* : garder une référence aux N derniers messages affichés ; si expirés, recréer en POP ; aura = sprite additif (pas de filtre).

### Émotion (emoji, cœurs, particules)

**7. TAP-POP (une pression = une particule)**
- *Description* : chaque tap sur un emoji lance une petite particule (emoji) qui monte/rebondit depuis le bas de l'écran.
- *Déclencheur* : événement « réaction » d'un téléphone.
- *Paramètres* : `plafond_par_seconde` (agrégé : au-delà de 150/s, 1 particule = N taps), `taille`, `durée` (1–2 s), `zone_de_départ`.
- *Technique* : `ParticleContainer`, atlas emoji, émetteur maison avec pool ; agrégation serveur (1 particule représente k taps).

**8. FUSÉE-EMOJI**
- *Description* : 30 taps d'un même emoji en 2 s lancent une fusée qui explose en gerbe de cet emoji (doc 06).
- *Déclencheur* : compteur glissant par emoji (≥ 30 / 2 s).
- *Paramètres* : `seuil` (30), `fenêtre` (2 s), `nb_éclats` (40–120), `gravité`, `durée`, `refroidissement` (3 s par emoji), `traînée` on/off.
- *Technique* : phase 1 : particule montante + traînée de petites particules ; phase 2 : explosion radiale (vitesses uniformes + dispersion) ; gravité et traînée d'air ; une sous-fusée possible. Prototype rapide possible avec `canvas-confetti`/tsParticles [10][21].

**9. CŒURS-MONTANTS**
- *Description* : cœurs qui montent du bas avec dérive sinusoïdale, rotation et fondu (style live TikTok/Instagram) ; intensité = débit de likes.
- *Déclencheur* : événement « like » ; intensité lissée sur 2 s.
- *Paramètres* : `débit_max` (≤ 150/s), `couleurs`, `amplitude_dérive`, `vitesse`, `colonnes` (bords préférés pour laisser le visage libre), `taille`.
- *Technique* : `ParticleContainer`, un sprite de cœur (tinté), trajectoire `x = x0 + A·sin(ωt + φ)` ; émission pilotée par le débit lissé.

**10. JAUGE-COMBO**
- *Description* : plus la salle réagit ensemble, plus l'effet grossit : multiplicateur « ×2, ×3… », tremblement, flash bref, particules plus nombreuses.
- *Déclencheur* : débit d'événements lissé franchissant des paliers (avec hystérésis).
- *Paramètres* : `paliers` (3–5), `hystérésis`, `amplitude_shake` (≤ 6 px), `flash` (1 par palier, jamais > 3/s), `decay`.
- *Technique* : EMA du débit côté serveur ; HUD en MSDF ; shake CSS sur le conteneur vidéo+canevas ; flash via le limiteur global [31].

**11. VAGUE**
- *Description* : quand une zone de la salle réagit, l'effet part du côté correspondant et balaie l'écran.
- *Déclencheur* : réaction avec zone connue (si la zone du spectateur est renseignée : à décider).
- *Paramètres* : `côté`, `largeur_de_front`, `vitesse`, `emoji`, `densité`.
- *Technique* : front qui avance ; les particules naissent dans la bande ; option `ShockwaveFilter` [4] (un seul filtre actif).

**12. MÈME × N**
- *Description* : un message répété par beaucoup de monde devient un gros « LOL ×43 » qui grossit à chaque ajout (représente les 200 messages en 5 s).
- *Déclencheur* : agrégation du §3.3 (étage 2) au-dessus d'un seuil.
- *Paramètres* : `seuil` (5), `échelle_par_N` (log), `échelle_max`, `fusion` (fenêtre 5 s), `emoji_de_fond`.
- *Technique* : conteneur persistant dont le compteur et l'échelle sont animés en ressort ; mis à jour par ordre « incrément ».

### Votes

**13. VOTE-BARRES**
- *Description* : barres ou bulles qui se gonflent en direct selon les votes ; options lisibles à distance.
- *Déclencheur* : segment de vote ouvert ; mises à jour 4–10 Hz.
- *Paramètres* : `style` (barres | bulles), `couleur_par_option`, `afficher_pourcentage`, `masquer_avant_révélation` (oui/non), `position` hors visage.
- *Technique* : `Graphics` mis en cache ou sprites étirés ; valeurs lissées par ressort ; chiffres MSDF ; bulles = cercles à rayon ∝ √votes.

**14. RÉVÉLATION-VOTE**
- *Description* : roulement (accélération puis arrêt), suspense, explosion du gagnant (confettis, flash unique, tremblement).
- *Déclencheur* : action régie « révéler ».
- *Paramètres* : `durée_suspense` (3–8 s), `son`, `nb_confettis`, `flash` (1), `ex_aequo` (comportement).
- *Technique* : timeline GSAP (aiguille/rotation → arrêt → échelle du gagnant → émetteur confettis) ; barres perdantes qui s'estompent ; un seul filtre plein écran.

### Événements spéciaux

**15. CADEAU-PLEIN-ÉCRAN**
- *Description* : un spectateur « offre » quelque chose au streamer : animation plein écran avec son pseudo, accompagnée d'un son (alerte d'abonné détournée, doc 06).
- *Déclencheur* : événement « offrande » ; **file d'attente** (une à la fois, comme les alertes de stream [37]).
- *Paramètres* : `durée` (3–5 s), `objet`, `file_max`, `priorité`, `sauter_doublons` (même auteur : fusionner).
- *Technique* : séquence GSAP héros ; sprite 512 px de l'atlas « héros » ; pseudo en MSDF avec contour épais ; limiteur de flashs.

**16. GIGA-EMOJI**
- *Description* : un emoji géant rebondit sur l'écran, puis s'efface (inspiré de « Gigantify » [36]).
- *Déclencheur* : emoji « doré » tapé par le public, ou seuil de réactions d'un même emoji, ou régie.
- *Paramètres* : `emoji`, `taille` (15–35 % hauteur), `nb_rebonds`, `durée`, `évite_visage`.
- *Technique* : texture 512 px chargée à la demande ; rebonds par ressort/gravité simplifiée ; léger éclat de particules à chaque rebond.

**17. GÉNÉRIQUE-PSEUDOS**
- *Description* : à l'entracte ou en fin, tous les pseudos défilent comme un générique de film, colorés à leur couleur stable.
- *Déclencheur* : gabarit ENTRACTE ou régie.
- *Paramètres* : `vitesse`, `colonnes`, `taille`, `ordre` (arrivée | alphabétique), `inclure_n_derniers`.
- *Technique* : `BitmapText` poolés défilant en colonnes ; liste fournie par le serveur.

*Option « héros » hors catalogue de base :* **ÉBOULIS** (éboulement d'emoji avec vrais corps rigides, Matter.js [32]) pour la clôture d'une séquence ; ≤ ~150 corps, à réserver aux moments sans autre effet lourd.

---

## 6. Correspondance avec le doc 06 §3

Chaque ligne du doc 06 §3 est couverte : Pop (1), Danmaku (2), Typographie cinétique (3), Commentaire vedette (4), Nuage de mots (5), Écho du streamer (6), feux d'artifice (7–8), cœurs (9), combo/jauge (10), vagues (11), votes (13–14), alertes détournées (15). Ajouts : MÈME × N (12), GIGA-EMOJI (16), GÉNÉRIQUE-PSEUDOS (17). La régulation du débit déjà énoncée au doc 06 est précisée au §3.3.

---

## 7. Prototype de validation (avant de figer la pile)

1. **Banc de charge** sur **l'ordinateur réel de la salle** (ou équivalent) : générateur de 50 msg/s (bots, cf. doc 07) + 10 000 particules + 60 danmaku + 14 pops, 15 min en plein écran sur le projecteur. **Critère** : p99 du temps de trame < 16,6 ms, aucune pause du ramasse-miettes > 5 ms, aucune dérive de mémoire.
2. **Comparer WebGL vs WebGPU** sur cette machine.
3. **Texte** : tester les trois voies de contour (cuit / double dessin / shader MSDF) et mesurer la lisibilité sur place à 15 m (essai physique : une image de test avec des tailles échelonnées).
4. **Détection de visage** : MediaPipe en worker vs fil principal ; mesurer coût et stabilité sur le vrai flux WebRTC (éclairage de scène, masque, lunettes, mouvement).
5. **Emoji** : générer l'atlas Noto à 128 px, vérifier le rendu en projection (taille/netteté) et les emoji manquants (versions Unicode récentes).
6. **Licences** : relire la licence GSAP « no charge » et les fiches de modèle MediaPipe ; arrêter le jeu d'emoji ; prévoir la ligne d'attribution (générique/programme).
7. **Photosensibilité** : valider le limiteur de flashs (outil PEAT cité par le W3C [31]).

---

## 8. Limites et points non confirmés

- Les chiffres Pixi (200 000 sprites, 1 M particules) viennent d'**un seul test** sur un MacBook M3, avec mouvement et logique volontairement simples [3] ; nos plafonds (§2.6) sont volontairement bien inférieurs et **à mesurer**.
- `@pixi/particle-emitter` : npm affiche 5.0.10 (pairs `<8`) alors qu'un README indexé parle d'une v6 pour Pixi v8 [16][18] ; je n'ai pas pu accéder à l'historique du dépôt. À re-vérifier le jour du démarrage du code.
- `ParticleContainer`/`Particle` et `SplitText` sont **expérimentaux** dans Pixi v8 [5][24] : épingler la version exacte (8.22.0) et isoler ces appels derrière une interface maison.
- Je n'ai trouvé **aucune** documentation officielle du comportement exact des combos TikTok [38], ni de l'animation de réactions YouTube [39][40], ni de benchmark 2026 Pixi/Three/Canvas [7] : ces références sont qualitatives.
- Contour et emoji **dans** `BitmapText` : non documentés [22] ; les solutions du §2.3 sont à prototyper.
- Faisabilité de MediaPipe en worker, tailles PNG de Noto, conversion MSDF vers BMFont : **à vérifier**.
- Les règles de lisibilité divergent d'un facteur 2,5 selon les sources (2 à 5 mm/m) [42] ; le test à 15 m dans la salle tranche.

---

## 9. Sources (consultées le 26/10/2026)

**Moteur, particules, texte**
- [1] pixi.js 8.22.0 (registre npm) — https://registry.npmjs.org/pixi.js/latest
- [2] PixiJS v8 launches — https://pixijs.com/blog/pixi-v8-launches
- [3] ParticleContainer v8 (blog) — https://pixijs.com/blog/particlecontainer-v8
- [4] pixijs/filters (pixi-filters, compatible Pixi v8.x ↔ filters v6.x) — https://github.com/pixijs/filters
- [5] Guide ParticleContainer v8 — https://pixijs.com/8.x/guides/components/scene-objects/particle-container
- [6] three 0.186.1 (registre npm) — https://registry.npmjs.org/three/latest
- [7] Recherche « Three.js vs PixiJS vs Canvas 2D benchmark 2026 » (aucun benchmark direct ; éléments partiels : https://github.com/Shirajuki/js-game-rendering-benchmark, https://galacean.antgroup.com/engine/en/docs/basics/benchmark/)
- [10] canvas-confetti — https://github.com/catdad/canvas-confetti (1.9.4, ISC : https://registry.npmjs.org/canvas-confetti)
- [11] GSAP : https://gsap.com/community/standard-license/ ; registre https://registry.npmjs.org/gsap/latest (3.15.0, licence « no charge »)
- [12] Motion 14.6.0 (MIT) — https://registry.npmjs.org/motion/latest ; docs https://motion.dev/docs
- [13] GSAP SplitText — https://gsap.com/docs/v3/Plugins/SplitText/
- [14] Support WebGPU : https://en.wikipedia.org/wiki/WebGPU ; https://web.dev/blog/webgpu-supported-major-browsers ; https://www.khronos.org/developers/linkto/webgl-and-webgpu-sigg26
- [15] Textures / VideoSource Pixi v8 — https://pixijs.com/8.x/guides/components/textures
- [16] @pixi/particle-emitter (registre npm) — https://registry.npmjs.org/@pixi/particle-emitter
- [17] Dépôt pixijs-userland/particle-emitter — https://github.com/pixijs-userland/particle-emitter
- [18] README indexé (mention d'une v6 pour Pixi v8, non confirmée) — https://docsearch.algolia.com/mcp/docs/repo/pixijs-userland/particle-emitter ; https://cdn.jsdelivr.net/npm/@barvynkoa/particle-emitter@0.0.1/README.md
- [19] Fork v8 — https://jsr.io/@spd789562/particle-emitter
- [20] tsparticles 4.5.0 (MIT) — https://registry.npmjs.org/tsparticles/latest
- [21] tsParticles confetti/fireworks — https://particles.js.org/guide/bundles-confetti ; https://particles.js.org/docs/modules/tsParticles_Fireworks_Preset.html
- [22] BitmapText Pixi v8 — https://pixijs.com/8.x/guides/components/scene-objects/text/bitmap
- [23] Texte Pixi v8 (Text/BitmapText/HTMLText) — https://pixijs.com/8.x/guides/components/scene-objects/text
- [24] SplitText / SplitBitmapText — https://pixijs.com/8.x/guides/components/scene-objects/text/split-text
- [25] msdf-atlas-gen (MIT) — https://github.com/Chlumsky/msdf-atlas-gen

**Emoji et licences**
- [26] Noto Emoji — https://github.com/googlefonts/noto-emoji
- [27] twitter/twemoji — https://github.com/twitter/twemoji
- [28] jdecked/twemoji (v17.0) — https://github.com/jdecked/twemoji
- [29] @twemoji/api 17.0.3 — https://registry.npmjs.org/@twemoji/api/latest
- [30] OpenMoji FAQ — https://openmoji.org/faq/

**Sécurité, physique, détection**
- [31] WCAG 2.1, critère 2.3.1 (trois flashs) — https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html
- [32] matter-js 0.20.0 (MIT) — https://registry.npmjs.org/matter-js/latest
- [33] Dépôt Matter.js — https://github.com/liabru/matter-js
- [44] @mediapipe/tasks-vision 1.1.1 (Apache-2.0) — https://registry.npmjs.org/@mediapipe/tasks-vision/latest
- [45] MediaPipe Face Detector (Web) — https://developers.google.com/edge/mediapipe/solutions/vision/face_detector/web_js
- [46] MediaPipe Face Detector (modèles, latence) — https://developers.google.com/edge/mediapipe/solutions/vision/face_detector

**Design et références**
- [34] Danmaku — https://en.wikipedia.org/wiki/Danmaku_subtitling
- [35] Mod danmaku-chat (pistes) — https://modrinth.com/mod/danmaku-chat
- [36] Twitch Power-ups — https://blog.twitch.tv/en/2024/06/12/introducing-power-ups-unleash-special-effects-with-bits
- [37] StreamElements, alertes Twitch — https://support.streamelements.com/hc/en-us/articles/16789217829778-Setting-Up-Twitch-Alerts-with-StreamElements-Overlays
- [38] Cadeaux TikTok LIVE (sources secondaires) — https://www.jivochat.com/blog/tools/tiktok-live-gifts.html ; https://www.socialchamp.com/blog/tiktok-gifts/
- [39] YouTube : réactions en direct — https://www.socialmediatoday.com/news/YouTube-Tests-Emoji-Reactions-in-Live-Streams/638787/
- [40] Emojis flottants (SDK tiers) — https://docs.videosdk.live/javascript/guide/interactive-live-streaming/reactions-during-livestream
- [41] Xylobands / Coldplay — https://ledinside.com/node/20358
- [42] Règles de projection (taille de texte par distance) — https://proav.de/video/projectionrules.html
- [43] Échantillonnage par réservoir (A-Res) — https://en.wikipedia.org/wiki/Reservoir_sampling
