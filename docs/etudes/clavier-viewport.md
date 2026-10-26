# Étude : le clavier virtuel en web mobile pour une interface de chat plein écran sans défilement

> Date de l'étude : 26 octobre 2026. Complète [06 — Cas LIVE §4 « Le clavier qui ne mange pas l'écran »](../06-cas-live-streamer.md).
> Méthode : lecture de spécifications, de pages MDN / caniuse / Chrome for Developers, de bugs WebKit (bugs.webkit.org), de fils Apple Developer Forums,
> d'articles de blogs techniques, et du **code source public** de Telegram Web K et Web A. Aucun appareil réel n'a été testé : tout ce qui est marqué
> **[À TESTER]** est une hypothèse à confirmer avec la liste du §9.
> Limite de la recherche : le quota de recherches web de la session a été atteint avant d'avoir pu creuser Discord, WhatsApp Web et Twitch
> (leurs clients sont fermés ; aucune source publique fiable trouvée, voir §5).

---

## 0. Résumé (à lire si on n'a que 2 minutes)

1. **Safari iOS n'a toujours pas `interactive-widget` ni l'API VirtualKeyboard** (caniuse : non supporté jusqu'à Safari/iOS 27.2 ; bug WebKit 230225 « Implement the VirtualKeyboard API » toujours NEW, modifié le 2 sept. 2026).
   Un signe d'ouverture : le 19 août 2026, un ingénieur WebKit écrit dans le fil standards-positions #65 que `interactive-widget` « a été implémenté dans WebKit »,
   mais ce n'est pas dans la bêta de Safari 27. **On ne peut donc pas bâtir le spectacle dessus.**
2. **La seule API qui marche partout (iOS, Android, Chrome, Firefox, WebViews) est `window.visualViewport`** (Baseline depuis août 2021).
   La recette recommandée : une coque `position: fixed` dont la hauteur et le décalage vertical sont **recopiés depuis `visualViewport`** (`height`, `offsetTop`),
   `html/body` verrouillés (`overflow: hidden`, `overscroll-behavior: none`). Le meta `interactive-widget=resizes-content` est ajouté en bonus : il aide Android,
   et il est inoffensif ailleurs.
3. **Les unités `dvh/svh/lvh` ne réagissent PAS au clavier** (web.dev : le clavier « n'est pas de l'UI navigateur »). `100dvh` ne sert que de valeur de repli avant le premier calcul JS.
   Un article (Sparka, DEV.to) affirme le contraire pour iOS ; il contredit web.dev, la spec et Chrome → à ne pas croire sans test.
4. **Garder le clavier ouvert après l'envoi** : `<form>` + `<input type="text" enterkeyhint="send">`, Entrée = envoi (le champ ne perd jamais le focus),
   et tous les boutons voisins (envoyer, émojis, suggestions) interceptent `mousedown`/`pointerdown` pour ne **pas** voler le focus, avec un `input.focus()` de filet dans le geste utilisateur.
5. **Anti-zoom iOS** : `font-size: 16px` minimum sur le champ. **Ne pas** mettre `maximum-scale=1` / `user-scalable=no` (accessibilité, ignoré par iOS ≥ 10 pour le pincement ; Telegram le fait pourtant).
6. **Pièges majeurs à surveiller sur vrais appareils** : régressions iOS 26 (barres `fixed` qui dérivent, `offsetTop` ou `height` qui ne revient pas après fermeture du clavier,
   bugs WebKit 297779 et 292603), **PWA iOS « standalone »** (viewport qui reste rétréci après le clavier, bugs 218983 / 254861), **navigateurs intégrés** Instagram / Facebook
   (unités de viewport fausses, bug 255852), clavier en **paysage** (il mange 50 à 60 % de l'écran).

---

## 1. Rappel du besoin

Page spectateur plein écran **sans défilement**, trois zones dans la hauteur visible : *haut* (consigne), *milieu* (réactions rapides), *bas* (champ de saisie collé au clavier).
Le clavier ne doit jamais cacher le champ ni pousser la page de façon imprévisible ; on envoie plusieurs messages d'affilée **sans fermer le clavier** ;
la zone haute se compacte quand le clavier est ouvert ; émojis maison plutôt que clavier emoji système ; tolérance au paysage, aux PWA et aux navigateurs intégrés (Instagram…) ouverts depuis un QR code.

---

## 2. État de l'art, point par point (au 26/10/2026)

### 2.1 Le modèle mental : deux viewports

- **Layout viewport** : celui que voit le CSS (`position: fixed`, `vh`, `100%`).
- **Visual viewport** : la partie réellement visible à l'écran (zoom, clavier). Sur mobile, `visualViewport.offsetTop` bouge quand la page « glisse ».
- Comportement historique de **Safari iOS** : le clavier **ne redimensionne rien** ; il se pose par-dessus. Si le champ focalisé serait caché, iOS fait défiler le
  conteneur scrollable le plus proche, et sinon **décale le visual viewport lui-même** (`offsetTop > 0`), ce qui emporte les éléments `position: fixed` avec lui.
  Ce décalage ne déclenche pas de `resize` sur `window`, mais bien des événements sur `visualViewport`.
- Depuis **Chrome 108 (Android)**, Chrome s'est aligné sur iOS : par défaut le clavier ne redimensionne que le visual viewport, les unités de viewport ne bougent pas,
  et les éléments `fixed` bas de page se retrouvent **couverts** par le clavier. C'est ce qui a rendu la question « universelle ».

Sources : Chrome for Developers (viewport-resize-behavior), Bram.us (2021), MDN VisualViewport, bug WebKit 191204.

### 2.2 `<meta name="viewport" content="interactive-widget=...">`

| Valeur | Effet (spec CSS Viewport) |
|---|---|
| `resizes-visual` (défaut) | le clavier réduit le visual viewport seulement ; layout viewport et unités inchangés |
| `resizes-content` | le clavier réduit aussi le layout viewport (et donc `dvh`, `vh`, `100%`, `fixed bottom`) : le comportement Android d'avant Chrome 108 |
| `overlays-content` | rien n'est redimensionné, le clavier recouvre la page |

**Support réel** (caniuse consulté le 26/10/2026, MDN, Chrome for Developers, Bram.us) :

| Navigateur | `interactive-widget` |
|---|---|
| Chrome Android | oui depuis 108 |
| Firefox Android | oui depuis 132 (Bram.us) ; caniuse le liste comme supporté |
| Samsung Internet | oui (caniuse : supporté 21 à 30) |
| **Safari iOS / iPadOS et tous les navigateurs iOS** (Chrome, Firefox, Edge iOS utilisent WebKit) | **non**, jusqu'à 27.2 inclus ; Safari TP : « inconnu » |
| WebViews Android / navigateurs intégrés | non couverts par le changement 108 (Chrome for Developers : « WebView isn't affected ») → comportement variable selon l'appli [À TESTER] |

Particularité : si `navigator.virtualKeyboard.overlaysContent = true` est posé, le navigateur **ignore** `interactive-widget` (spec).

**Piste Apple** : fil WebKit/standards-positions #65 (« Opt-in meta tag for virtual keyboard to affect layout »), ouvert depuis 2022, toujours « Needs position » ;
commentaire du 19/08/2026 d'un membre WebKit : une proposition `interactive-widget` « a été implémentée dans WebKit », mais absente de la bêta Safari 27 d'après la discussion.
→ Ça peut arriver en iOS 27.x ou 28. **Ne pas compter dessus ; la recette ci-dessous reste valable le jour où ça arrive** (voir §6.5).

### 2.3 VirtualKeyboard API (`navigator.virtualKeyboard`, `env(keyboard-inset-*)`)

- `navigator.virtualKeyboard.overlaysContent = true` désactive le redimensionnement automatique ; `boundingRect` + événement `geometrychange` donnent la géométrie ;
  CSS : `env(keyboard-inset-height, 0px)` (et `-top/-bottom/-left/-right/-width`). Contexte sécurisé (HTTPS) obligatoire. Marquée **expérimentale** par MDN.
- Support : **Chromium Android (depuis 94)** et Samsung Internet (17+). **Safari iOS : non** (bug WebKit 230225, NEW, 2021 → toujours ouvert en sept. 2026).
  **Firefox (y compris Android) : non**.
- Verdict : utile comme **amélioration progressive Android** (inset exact, pas de reflow du layout viewport), mais impossible comme solution unique.
  Le but d'un spectacle est d'avoir **un seul chemin de code qui marche partout** → on utilise `visualViewport` et on garde VirtualKeyboard comme piste d'optimisation (§6.5).

### 2.4 `window.visualViewport` (la base)

- Propriétés : `width`, `height`, `offsetLeft`, `offsetTop`, `pageLeft`, `pageTop`, `scale` ; événements `resize`, `scroll`, `scrollend`. Baseline « widely available » (août 2021).
- Sur iOS, c'est **le seul moyen** de connaître la hauteur réellement visible avec le clavier (`window.innerHeight` est inutile avec le clavier : bug WebKit 191204).
- Pièges documentés :
  - l'événement `resize` peut arriver **avant** que `height` / `offsetTop` soient à jour → relire dans un `requestAnimationFrame` (bug WebKit 237851, commentaire 4 du bug 254861) ;
  - sur iOS la mise à jour de `pageTop` / `offsetTop` pendant le geste est partielle (Bram.us, bug 218983) ;
  - ne se met à jour qu'**à la fin** de l'animation du clavier : aucune API web ne donne la durée/courbe de l'animation → il y aura un petit « saut » à l'ouverture ;
  - l'animation de l'interface en suivant le clavier image par image n'est pas réalisable proprement en web sur iOS.

### 2.5 Unités `dvh` / `svh` / `lvh`

- `lvh` = barres du navigateur repliées ; `svh` = barres dépliées ; `dvh` = la valeur courante entre les deux. Support : Safari 15.4, Chrome/Edge 108, Firefox 101 (web.dev).
- **Le clavier n'est pas de l'UI navigateur : il ne change pas ces unités** (web.dev). Exception : en Chrome Android avec `interactive-widget=resizes-content`, la taille du bloc contenant initial change, donc `dvh` suit le clavier (MDN).
- Les `dvh` ne sont pas mis à jour à 60 images/s (le navigateur limite pendant le geste).
- Dans certains navigateurs intégrés WKWebView (Facebook), `vh`, `svh`, `lvh` et `dvh` se comportent tous comme `dvh` (bug WebKit 255852).
- Conclusion : `height: 100dvh` est un **repli** pour la 1re image ; la vraie hauteur vient de `visualViewport.height`.

### 2.6 Pièges de l'iOS 26 / 27 (tout récents)

| Bug | Symptôme | État (sources) |
|---|---|---|
| WebKit **297779** (iOS 26 bêta 7, août 2025) | éléments `fixed` qui montent/descendent quand le sens du défilement change | Apple : « bug dans un composant système », correctif pour WKWebView aussi ; mais des retours encore en nov.–déc. 2025 (iOS/iPadOS 26.1), décalage ~10 px, et Chrome iOS 154 sur iOS 26.6 en 2026 → **pas considéré comme fini** |
| Apple Dev Forums **800125 / 800154** (iOS 26.0) | après fermeture du clavier, `visualViewport.height` reste plus petit que `innerHeight` (≈ 24 px) : les `fixed` restent décalés | pas de correctif officiel confirmé ; quelques retours « résolu en 26.1 », d'autres « non » |
| WebKit **292603** (Safari 18, confirmé iOS 26.x, sept. 2026) | bande vide en bas, équivalente à l'inset de la barre d'accueil, **toujours défilable** quand le clavier est ouvert | NEW ; analyse de cause (inset de la barre + inset du clavier additionnés) et PR WebKit #74122 liée → peut-être corrigé dans une prochaine version |
| WebKit **301857** (Cordova / WKWebView iOS 26.0.1) | viewport 812 → 744 px après le clavier, jamais recalculé | résolu en iOS 26.1 (configuration) |
| iOS 26 « Liquid Glass » | `position: fixed; bottom: 0` : un espace flottant sous les contrôles Safari | Apple : voulu, remplissage de couleur heuristique ; ok en 26.1 selon un retour (dans le fil 297779) |
| WebKit **191204** (2018, toujours NEW en 2025) | avec le clavier, `fixed`, `innerHeight` et le positionnement absolu par `scrollY` sont peu fiables | la cause racine de tout le reste |

Ordre de grandeur utile pour la décision : **le moteur WebKit n'a pas résolu ces bugs en 8 ans** ; il faut une recette qui les **contourne** plutôt que d'attendre un correctif.
Une idée structurante : la plupart de ces bugs concernent le **défilement du document** (barres Safari qui se replient, `scroll` qui change le décalage).
**Une page qui ne défile jamais (`html/body` verrouillés) évite une bonne partie de l'exposition.** [À TESTER]

---

## 3. Autres sujets demandés

### 3.1 Anti-zoom automatique iOS sur les champs

- iOS Safari zoome sur le champ focalisé si sa `font-size` calculée est **< 16 px** (retours concordants ; 16 px et plus : pas de zoom).
- **Solution propre** : `font-size: 16px` (ou `1rem` avec racine à 16 px) sur le champ. Si le design veut un texte plus petit, on garde 16 px pour le champ et on joue sur le reste.
- **À éviter** : `maximum-scale=1` / `user-scalable=no` dans le meta viewport. Ça supprime le zoom d'accessibilité (MDN : WCAG demande au moins 2×) ;
  MDN précise que iOS ≥ 10 ignore ces clés pour le pincement par défaut. Telegram Web K les met pourtant (`maximum-scale=1,user-scalable=no`).
  Compromis possible **en dernier recours** si un modèle d'iPhone zoome quand même malgré 16 px : `maximum-scale=1` seulement, pour iOS.
- Ajouter `touch-action: manipulation` sur les boutons (supprime le zoom au double-tap).
- Si l'utilisateur a pincé (`visualViewport.scale > 1`), la mise en page recalculée doit **cesser de se battre** (voir `sync()` §6.3).

### 3.2 Attributs du champ (`enterkeyhint`, `autocapitalize`, `autocorrect`, `inputmode`, `spellcheck`)

| Attribut | Valeur proposée | Pourquoi |
|---|---|---|
| `enterkeyhint="send"` | oui | Baseline depuis nov. 2021 ; la touche Entrée s'affiche « envoyer » (libellé/icône selon appareil et langue) |
| `autocapitalize="sentences"` | oui (défaut Safari et Chrome ; Firefox : `none`) | la majuscule initiale rend les messages plus lisibles sur scène ; à mettre `none` si on veut un style « chat » en minuscules |
| `autocorrect` | **laisser actif** (défaut) | `off` supprime la correction iOS ; pour des commentaires rapides, mieux vaut garder la correction. Attribut standardisé et « Baseline newly available » en sept. 2026 (MDN) ; Safari le connaît depuis longtemps |
| `spellcheck="false"` | oui | évite les soulignements rouges (Android/Chrome), sans effet sur la correction iOS |
| `autocomplete="off"` | oui | évite barre d'auto-remplissage / gestionnaires de mots de passe ; éviter aussi les `name`/`id` du type `name`, `email`, `address` |
| `inputmode` | **ne rien mettre** (ou `text`) | `inputmode="none"` supprime le clavier système : à proscrire. Ne pas utiliser `type="search"` (croix de suppression, style iOS particulier) |
| `maxlength` | 80 à 120 | cohérent avec la lisibilité sur scène (à décider côté scénario) |

Remarque : tous ces attributs sont des **indices**, les claviers tiers (SwiftKey, Samsung…) peuvent les ignorer.

### 3.3 Émojis maison

- Une barre de 6 à 8 boutons dans la zone basse, juste au-dessus du champ. Chaque bouton **ne vole pas le focus** (§7).
- Deux comportements distincts :
  - **réaction rapide** (un tap = un envoi `{type:'react', emoji}` sans texte) ;
  - **insertion dans le texte** : `input.setRangeText(emoji, start, end, 'end')` + événement `input` (code §6.3).
- Utiliser des **émojis Unicode** dans le champ (un `<input>` ne peut pas contenir d'images). L'« emoji custom » se joue **à l'affichage scène** : le serveur remplace les caractères
  (ou des jetons `:pop:`) par les sprites/animations du spectacle. Éviter `contenteditable` pour s'offrir des images dans le champ : c'est la pire zone de bugs clavier iOS
  (caret, scroll, pan) — voir les contournements nécessaires dans les éditeurs riches (bug WebKit 191204 vient d'ailleurs d'un éditeur riche, CKEditor).
- Le sélecteur d'émojis système reste accessible par le clavier ; rien ne l'empêche, mais l'attendu est que la barre maison soit plus rapide.

### 3.4 Mode paysage

- L'iPhone en paysage avec clavier laisse environ 150 à 200 px de hauteur visible (ordre de grandeur, **[À TESTER]**) : impossible d'afficher 3 zones.
- Règle : `@media (orientation: landscape) and (max-height: 500px)` **et** `html.kb-open` → ne garder que le champ + le bouton envoyer (zone haute et milieu masquées, ou la consigne en une ligne).
- Verrouiller l'orientation n'est pas fiable sur le web mobile (le manifest `orientation` ne vaut que pour la PWA installée, et iOS le respecte mal [À TESTER]). On **tolère** le paysage plutôt que de le bloquer.
- Remettre à zéro la ligne de base de hauteur à chaque `orientationchange` (§6.3). Ajouter `viewport-fit=cover` + `env(safe-area-inset-left/right)` (encoche en paysage).

### 3.5 PWA installée (« standalone ») ou onglet

| | Onglet Safari / Chrome | PWA standalone |
|---|---|---|
| Barres du navigateur | oui, qui se replient au défilement (iOS 26 : barre en bas/flottante) | aucune → viewport stable |
| Clavier iOS | modèle §2.1 | **plus capricieux** : bugs 218983 (`visualViewport.height` faux après rotation + clavier), 254861 (iPad : viewport pas restauré, `touch` décalés ; vu aussi dans la PWA WhatsApp sur iPad, 2024) |
| Spécial | — | un article (iOS 17/18) décrit un viewport qui **reste rétréci jusqu'au kill de l'appli** après le 1er clavier ; `interactive-widget`, `height:100%` et `position:fixed` n'ont pas aidé ; seul un « re-layout forcé » a réussi |
| Android | OK | `display: standalone` : comportement Chrome identique, à confirmer [À TESTER] |

→ Prévoir le **correctif de « guérison »** (§6.4) dès le début pour la PWA iOS, car la proposition PWA est dans le déroulé du spectacle (06 §6, segment 0).

### 3.6 Navigateurs intégrés (Instagram, Facebook, TikTok, etc.)

- Un QR code scanné **depuis une appli** (Instagram, Snapchat, Google Lens…) ouvre souvent la page dans un **navigateur intégré** (WKWebView sur iOS ; WebView ou Custom Tab sur Android).
- iOS/WKWebView : `visualViewport` existe (iOS ≥ 13), **mais** les unités `vh/svh/lvh` sont mal dimensionnées si l'appli n'a pas posé `setMinimumViewportInset` (bug WebKit 255852 : Facebook fait comporter les 4 unités comme `dvh`).
  Instagram est cité par un article comme comportant le même défaut pour `svh` (non vérifié à la source).
- WKWebView iOS 26.0.x : viewport rétréci après le clavier (301857), corrigé en 26.1.
- Android WebView : pas concerné par le changement Chrome 108 → le layout viewport peut déjà se redimensionner avec le clavier (ancien comportement). **La recette `visualViewport` reste correcte dans les deux cas** (si le layout rétrécit, `vv.height` = taille du layout et `offsetTop` = 0).
- Aucune source ne documente le comportement spécifique du clavier d'Instagram : **tester sur vrai appareil** (§9). Option produit : détecter l'UA (`Instagram`, `FBAN`/`FBAV`, `FB_IAB`) et afficher « Ouvrir dans Safari/Chrome » (bouton ou lien `x-safari-https://…`/`intent://…`) — à valider.
- Aucun accès à `navigator.virtualKeyboard` ni `interactive-widget` fiable dans ces conteneurs.

---

## 4. Pièges par plateforme (synthèse)

### iOS Safari (iPhone), onglet
1. Le clavier recouvre ; la page « glisse » (`offsetTop > 0`) ; les éléments `fixed` partent avec. `window.innerHeight` ne reflète pas le clavier.
2. `focus({preventScroll:true})` **ne couvre pas** forcément le décalage du « reveal » du clavier (un rapport WebKit/Uno le confirme pour un cas précis) → ne pas compter dessus.
3. Si le document est un peu défilable, le geste du doigt fait défiler **le document** et la coque suit (décalée) : verrouiller le défilement partout (`overflow:hidden`, `overscroll-behavior:none`, voire `touchmove` bloqué hors zones scrollables, comme Telegram).
4. Après la fermeture du clavier : `offsetTop` / `height` peuvent rester faux (iOS 26.0.x ; 297779 ; 800125) → resynchroniser (`blur` + 150 ms) et se brancher sur `scrollend`.
5. `resize` précoce : relire dans `requestAnimationFrame` (voire 2 rAF).
6. La mise à jour de `visualViewport` n'a lieu qu'à la **fin** de l'animation du clavier : saut visuel inévitable.
7. L'autofocus programmatique n'ouvre pas le clavier sans geste utilisateur : le premier tap sur le champ est indispensable.
8. Barre Safari « en bas » (option iOS 15+) et iOS 26 « Liquid Glass » : tester avec les deux dispositions.
9. Le prédictif (barre de suggestions au-dessus du clavier) ajoute ~40 px de hauteur utilisée ; non désactivable de façon fiable.

### iOS Safari, PWA standalone
Voir §3.5 : viewport rétréci après clavier, `visualViewport` faux après rotation, iPad. Prévoir la guérison.

### iOS WKWebView / navigateurs intégrés
Voir §3.6.

### Chrome iOS / Firefox iOS / Edge iOS
Même moteur WebKit : mêmes limites que Safari (pas d'`interactive-widget`) **plus** leurs propres bugs (297779 constaté aussi sur Chrome iOS).

### Android Chrome
- Depuis 108 : mode `resizes-visual` par défaut = comme iOS (clavier par-dessus, `fixed` couvert). Avec `resizes-content` : le layout rétrécit, `dvh` suit, `fixed bottom` est bon.
- Appuyer sur « retour » **cache le clavier sans retirer le focus du champ** → détecter la fermeture par la hauteur, pas par `blur`.
- Claviers : Gboard, SwiftKey, clavier Samsung, claviers flottants / en deux parties (tablettes, pliables) : la hauteur visible ne correspond plus à un rectangle collé en bas [À TESTER].

### Samsung Internet / Firefox Android
Supportent `interactive-widget` (§2.2). Samsung gère aussi `virtualKeyboard`. À tester quand même : ce sont des moteurs avec leurs barres.

### Android WebView / navigateurs intégrés
Comportement variable selon l'appli ; comportement historique « le layout rétrécit ». Tester Instagram, Facebook, TikTok, Snapchat, Gmail, Messages.

### Paysage
Voir §3.4.

---

## 5. Ce que font les grosses applis de chat

| Appli | Ce qu'on sait (source) | Fiabilité |
|---|---|---|
| **Telegram Web A** (code source public `Ajaxy/telegram-tt`) | Variable CSS `--vh` = 1 % de la hauteur calculée ; sur iOS la hauteur est `visualViewport.height + visualViewport.pageTop`, ailleurs `window.innerHeight` ; écoute `resize` sur `visualViewport` (iOS) ou `window` ; limitation à 250 ms (100 ms sur changement d'orientation, qui remet à zéro la hauteur de référence) ; clavier détecté si la hauteur actuelle est inférieure à la hauteur initiale ; `html, body` en `height: calc(var(--vh,1vh)*100)` (mobile), `overflow: hidden`, `overscroll-behavior: none` ; pas de `dvh` ; une classe `.for-ios-autocapitalization-fix` | lu dans le code, haute |
| **Telegram Web K** (`morethanwords/tweb`) | meta viewport : `width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,shrink-to-fit=no,viewport-fit=cover` ; contournement « sticky input » Safari : on décale le champ de `translateY(-99999px)` puis `focus()` puis on le remet après 2 rAF (empêche le saut de page au focus) ; `touchmove` bloqué hors zones scrollables pour que la page ne défile pas derrière le champ — **mais ce contournement est aujourd'hui désactivé** dans le code (drapeau `&& false`) | lu dans le code, haute |
| **WhatsApp Web mobile / Discord web / Twitch mobile web** | **Aucune source publique trouvée.** Ces clients sont fermés ; Discord et WhatsApp poussent surtout vers leurs applis natives. À observer par inspection directe (§9, observation) plutôt que par supposition | néant |
| **Hydrogen (client Matrix)** | un correctif utilise l'API VisualViewport pour redimensionner la vue de conversation à l'affichage du clavier et garder le bas de la liste ancré (cité dans les résultats de recherche ; page source non lisible) | moyenne |

Enseignement commun : **aucun** de ces clients ne s'appuie sur `interactive-widget` / VirtualKeyboard ; tous verrouillent le document et pilotent la hauteur par `visualViewport` + variable CSS — c'est la voie de la §6.

---

## 6. Recette recommandée

### 6.1 Principes

1. Document **verrouillé** (jamais de défilement) ; une seule **coque** `position: fixed` qui reflète exactement le visual viewport.
2. Hauteur et décalage de la coque = `visualViewport.height` / `offsetTop` (recopiés dans deux variables CSS par `requestAnimationFrame`).
3. Trois zones en grille : `auto` (haut, compactable) / `1fr` (milieu) / `auto` (bas).
4. Classe `kb-open` sur `<html>` (hauteur qui chute de plus de 120 px par rapport à la référence) → CSS compacte la zone haute et (en paysage) masque tout sauf le champ.
5. Le champ ne perd **jamais** le focus tant que le spectateur écrit (§7).
6. Chemin de code **unique** pour toutes les plateformes ; `interactive-widget` n'est qu'une aide.

### 6.2 HTML

```html
<meta name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">

<body>
  <div id="app">
    <header id="zone-top">
      <p id="consigne">Écris un message au streamer !</p>
    </header>

    <main id="zone-mid"><!-- réactions rapides --></main>

    <footer id="zone-bottom">
      <div id="emojis" aria-label="Émojis du spectacle">
        <button type="button" class="emoji" data-keep-focus data-emoji="🔥">🔥</button>
        <!-- 6 à 8 boutons -->
      </div>
      <form id="composer" autocomplete="off">
        <input id="msg" type="text" maxlength="100"
               enterkeyhint="send" autocapitalize="sentences"
               autocomplete="off" spellcheck="false"
               aria-label="Ton message">
        <button id="send" type="submit" data-keep-focus>Envoyer</button>
      </form>
    </footer>
  </div>
</body>
```

Pourquoi `<input type="text">` plutôt que `<textarea>` : un message de scène tient sur une ligne ; **Entrée envoie** (aucun retour à la ligne à gérer) et la soumission implicite d'un `<form>` **ne retire pas le focus**.
Pas de `contenteditable`.

### 6.3 CSS + JS (cœur de la recette)

```css
:root { --app-h: 100dvh; --app-top: 0px; }               /* repli 1re image */
html, body { margin: 0; height: 100%; overflow: hidden; overscroll-behavior: none; }

#app {
  position: fixed; top: 0; left: 0; width: 100%;
  height: var(--app-h);
  transform: translate3d(0, var(--app-top), 0);          /* suit le pan iOS */
  display: grid; grid-template-rows: auto 1fr auto;
  box-sizing: border-box;
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
           env(safe-area-inset-bottom) env(safe-area-inset-left);
}
html.kb-open #app { padding-bottom: 0; }                 /* le clavier couvre la barre d'accueil */
html.kb-open #consigne { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
html.kb-open #zone-mid { /* réduire/compacter les réactions */ }

#msg { font-size: 16px; /* >= 16px : pas de zoom iOS */ -webkit-user-select: text; user-select: text; }
button, .emoji { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }

@media (orientation: landscape) and (max-height: 500px) {
  html.kb-open #zone-top, html.kb-open #zone-mid, html.kb-open #emojis { display: none; }
}
```

```js
const vv = window.visualViewport;
const root = document.documentElement;
const input = document.getElementById('msg');
let baseH = 0, raf = 0;

function sync() {
  raf = 0;
  if (!vv) return;                       // vieux navigateur : le repli CSS 100dvh reste
  if (vv.scale > 1.01) return;           // l'utilisateur a pincé : ne pas lutter
  const h = Math.round(vv.height);
  const top = Math.max(0, Math.round(vv.offsetTop));
  root.style.setProperty('--app-h', h + 'px');
  root.style.setProperty('--app-top', top + 'px');
  if (document.activeElement !== input) baseH = Math.max(h, innerHeight); // référence « clavier fermé »
  root.classList.toggle('kb-open', baseH - h > 120);                      // fiable aussi sur Android (retour = clavier caché, focus gardé)
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => requestAnimationFrame(sync)); }; // 2 rAF : resize précoce

vv?.addEventListener('resize', schedule);
vv?.addEventListener('scroll', schedule);
vv?.addEventListener('scrollend', schedule);
addEventListener('orientationchange', () => { baseH = 0; setTimeout(schedule, 300); });
addEventListener('pageshow', schedule);
document.addEventListener('visibilitychange', schedule);
input.addEventListener('focus', schedule);
input.addEventListener('blur', () => setTimeout(heal, 150));
schedule();
```

Variantes à comparer sur appareils (voir test T3) :
- **A (ci-dessus)** : coque `fixed` + `translateY(offsetTop)`. Avantage : pas de défilement forcé. Risque : léger scintillement pendant le pan (MDN avertit pour la simulation de `position: device-fixed`).
- **B** : A + `window.scrollTo(0, 0)` dans `sync()` pour « défaire » le pan (technique d'un correctif public : le décalage de iOS est annulé, la coque reste ancrée en haut de la fenêtre ; ne s'applique pas au pincement ; gagne en simplicité, risque : peut déclencher le redessin du curseur).
- **C** (Telegram Web A) : pas de coque `fixed` ; `html, body { height = vv.height + vv.pageTop }` en pixels, `overflow:hidden`. Variante la plus éprouvée en production, moins élégante.

Sélection : celle qui reste stable sur le plus grand nombre d'iPhones du §9 ; ne garder qu'**une** variante dans le code final.

### 6.4 Rétablir un état faux après coup (iOS 26 / PWA)

```js
function heal() {
  if (document.activeElement === input) return;
  // Cas 1 : décalage résiduel après fermeture du clavier (iOS 26)
  if (vv && (vv.offsetTop > 0 || Math.abs(vv.height - innerHeight) > 2)) {
    scrollTo(0, 0);
    schedule();
  }
  // Cas 2 : PWA standalone iOS, viewport resté rétréci (voir §3.5)
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (standalone && innerHeight < baseH - 4) {
    const app = document.getElementById('app');
    app.style.display = 'none'; void app.offsetHeight; app.style.display = '';   // re-layout forcé
    schedule();
  }
}
```

C'est un **filet** dérivé de bidouilles publiées (iifx.dev, cederhook sur DEV.to) : à valider sur vrais appareils, et à retirer si inutile (chaque hack ajoute des bugs).

### 6.5 Améliorations facultatives (après validation de la base)

- **Android Chrome / Samsung** : activer `navigator.virtualKeyboard.overlaysContent = true` et piloter la ligne basse par `env(keyboard-inset-height, 0px)`
  (la grille `"messages 1fr / input auto / keyboard env(keyboard-inset-height,0px)"` de MDN). Gain : pas de reflow du layout viewport. Coût : deuxième chemin de code. À ne faire que si les tests montrent un défaut avec `resizes-content`.
- **Le jour où Safari supportera `interactive-widget`** : rien à changer — `vv.height` deviendra égal à `innerHeight`, `offsetTop` restera 0 ; on pourra supprimer la partie `translate`.
- **Détection du navigateur intégré** : bandeau « Ouvrir dans Safari/Chrome » si l'UA contient `Instagram`, `FBAN`, `FBAV`, `Snapchat`… (à décider côté produit).

---

## 7. Garder le clavier ouvert après l'envoi

Règle : **le champ ne doit jamais perdre le focus** quand on tape sur un bouton voisin ou qu'on envoie.

```js
// 1) Aucun bouton « voleur de focus » : on bloque le déplacement de focus à l'appui
for (const ev of ['mousedown', 'pointerdown']) {
  document.addEventListener(ev, e => {
    if (e.target.closest('[data-keep-focus]')) e.preventDefault();
  }, { passive: false });
}

// 2) Envoi : Entrée (enterkeyhint=send) ET bouton passent par submit
document.getElementById('composer').addEventListener('submit', e => {
  e.preventDefault();
  const text = input.value.trim();
  if (text) { sendToServer(text); input.value = ''; }
  input.focus({ preventScroll: true });     // filet : dans le geste utilisateur, iOS laisse rouvrir le clavier
});

// 3) Émojis : insertion au curseur, sans fermer le clavier
document.getElementById('emojis').addEventListener('click', e => {
  const b = e.target.closest('[data-emoji]'); if (!b) return;
  const s = input.selectionStart ?? input.value.length;
  const t = input.selectionEnd ?? s;
  input.setRangeText(b.dataset.emoji, s, t, 'end');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus({ preventScroll: true });
});
```

Points d'attention :
- **iOS/Safari : la validité de `pointerdown.preventDefault()` seul est incertaine** (l'annulation de `pointerdown` n'empêche pas à coup sûr le déplacement de focus selon les moteurs ; c'est l'annulation de `mousedown` qui le fait). D'où l'écoute des **deux** événements, plus le `focus()` de filet dans `click`/`submit`. [À TESTER sur iPhone : T5]
- Ne **jamais** faire un `focus()` hors geste utilisateur (timer, réponse réseau) : iOS refuse d'ouvrir le clavier.
- Ne **pas** recréer le noeud `<input>` (re-rendu complet d'un framework, `innerHTML`) ni passer `disabled`/`readonly` pendant la saisie : le clavier se ferme. Le champ doit être un noeud stable. Si un scénario doit fermer le clavier (changement de segment), appeler `input.blur()` **volontairement**.
- **Correction automatique** : sur iOS, la suggestion en cours est validée quand l'utilisateur tape Entrée ou quitte le champ. Si on envoie par un bouton sans faire perdre le focus, le dernier mot peut partir **non corrigé** [À TESTER : T6]. Pour cette raison, la touche Entrée (`enterkeyhint="send"`) est le **chemin principal**, le bouton « Envoyer » le secours.
- Un bug WebKit ancien (193634, NEW) demandait à iOS de **garder le clavier** quand le focus passe d'un champ à un contrôle non texte ; il n'est pas résolu, donc le contournement par `mousedown` reste nécessaire.
- Le retour haptique (`navigator.vibrate`) n'existe pas sur iOS Safari : retour **visuel** (flash du bouton, « parti sur scène ✨ ») comme dit en 06 §4.
- Suggestions de mots au-dessus du clavier : boutons `data-keep-focus`, même mécanique.

---

## 8. Anti-spam et compacité de la zone haute

(Sans rapport avec le clavier mais lié à l'ergonomie :) l'anti-spam « attends 2 s » ne doit **pas désactiver** le champ (le clavier se fermerait) : on grise le bouton et on affiche le compte à rebours, le champ reste actif.
Quand `kb-open`, la zone haute passe en **une ligne** (CSS ci-dessus) au lieu de disparaître ; la zone milieu réduit la taille des boutons de réaction mais les garde atteignables au pouce.

---

## 9. Plan de tests sur vrais appareils

### 9.1 Matrice minimale (une dizaine de téléphones, comme prévu en 06 §4)

| # | Appareil / navigateur | Pourquoi |
|---|---|---|
| 1 | iPhone récent, iOS 26.x ou 27.x, **Safari**, barre en bas (défaut) | cible principale, bugs 26.x |
| 2 | Même iPhone, **barre Safari en haut** (Réglages > Safari) | variation de layout |
| 3 | iPhone ancien (iOS 16/17, écran 4,7" type SE) | petit écran, anciennes versions encore présentes dans la salle |
| 4 | iPhone, **Chrome iOS** et **Firefox iOS** | WebKit sous un autre habillage, mêmes bugs |
| 5 | iPhone, **PWA installée** (écran d'accueil) | bugs 218983 / 254861 / viewport figé |
| 6 | iPhone, **Instagram** (scan du QR depuis la caméra d'Instagram), **Facebook / Messenger**, **TikTok**, **Snapchat** | navigateurs intégrés WKWebView |
| 7 | Android récent, **Chrome**, **Gboard** | `interactive-widget`, cas nominal |
| 8 | Samsung Galaxy, **Samsung Internet** + clavier Samsung | moteur et clavier spécifiques |
| 9 | Android milieu/bas de gamme (Xiaomi/Oppo), Chrome + **SwiftKey** | claviers tiers, petits écrans |
| 10 | Android, **Firefox** ; **Instagram / Facebook** Android (WebView) | support 132+, WebView |
| 11 | iPad (optionnel) + tablette Android | clavier flottant / scindé (bug 254861) |

### 9.2 Scénarios

Chaque test : noter modèle, version d'OS/navigateur, réussite, capture ou vidéo d'écran. Cibles de référence : champ **entièrement visible** et collé au clavier, **zéro défilement** de la page, pas de saut de plus de 1 image à l'ouverture.

| Test | À faire | Attendu |
|---|---|---|
| **T1** Ouverture | taper dans le champ (1er tap) | clavier s'ouvre, champ visible, page immobile, zone haute compactée, pas de zoom |
| **T2** Fermeture | fermer le clavier (iOS : tap hors champ / Entrée n'est pas un moyen de fermer ; Android : « retour ») | retour exact à la mise en page initiale (hauteur, `offsetTop = 0`) ; **sans résidu** après 5 ouvertures/fermetures répétées (régression iOS 26) |
| **T3** Comparer variantes A / B / C (§6.3) | ouvrir/fermer 10 fois chacune | choisir la plus stable ; noter scintillement |
| **T4** Défilement | glisser le doigt partout (haut, milieu, bas, avec clavier ouvert et fermé) | la page ne bouge jamais ; pas de rebond ; pas de bande vide en bas (bug 292603) |
| **T5** Envois en rafale | envoyer 10 messages d'affilée : 5 par Entrée, 5 par bouton | le clavier **ne se ferme jamais** ; le champ se vide ; le focus reste |
| **T6** Correction auto | taper « bonjouur » puis envoyer par Entrée, puis par bouton | par Entrée : corrigé ; par bouton : noter si le dernier mot est corrigé |
| **T7** Émojis | taper sur 8 émojis (insertion), puis réaction rapide | clavier ouvert, insertion au curseur, pas de saut |
| **T8** Zoom | taper dans le champ (font-size 16 px), double-tap sur un bouton, pincer l'écran | aucun zoom au focus ; aucun zoom au double-tap ; le pincement ne casse pas la mise en page (retour à 1× possible) |
| **T9** Paysage | tourner avant, pendant et après saisie (verrou de rotation désactivé) | mise en page cohérente, champ visible, pas de coque rétrécie après retour en portrait ; `kb-open` correct |
| **T10** Dictée et émoji système | basculer sur le clavier emoji système, sur la dictée vocale, sur un clavier tiers | la hauteur visible suit ; pas de bande vide |
| **T11** Cycle de vie | verrouiller l'écran / changer d'appli 30 s / revenir, avec le clavier ouvert puis fermé | pas de coque décalée ; reprise propre (cf. doc 04) |
| **T12** Notifications / appels | recevoir une bannière iOS pendant la saisie | pas de saut permanent |
| **T13** PWA iOS | ouvrir le clavier, le fermer, quitter/revenir, tourner | viewport non rétréci ; sinon `heal()` doit le corriger |
| **T14** Navigateurs intégrés | tous les cas T1, T2, T4, T5 dans Instagram, Facebook, TikTok, Snapchat (iOS et Android) | idem navigateur ; sinon basculer vers le bandeau « Ouvrir dans le navigateur » |
| **T15** Réseau dégradé | couper le Wi-Fi pendant la saisie, envoyer | le clavier reste ouvert, état « en attente » affiché (principe du doc 04) |
| **T16** Accessibilité | VoiceOver / TalkBack activés, taille de texte système agrandie | le champ reste atteignable ; la mise en page ne se casse pas (zoom autorisé) |
| **T17** Flux QR | scanner le QR depuis : appareil photo iOS, Google Lens, appli appareil photo Samsung, Instagram | noter quel navigateur s'ouvre (détermine l'importance de T14) |

### 9.3 Outillage pour tester sans Mac

- Intégrer un **panneau de débogage** activable par `?debug=1` : affiche en direct `vv.height`, `vv.offsetTop`, `vv.pageTop`, `vv.scale`, `innerHeight`, `kb-open`, `baseH`, UA ; permet de comparer sans inspecteur.
  Les mesures sont ce qui compte, pas les impressions.
- Android : inspection distante via Chrome (`chrome://inspect`), câble USB.
- iOS : l'inspecteur Safari exige un Mac ; sinon services de téléphones réels (BrowserStack, etc.) et le panneau de débogage ci-dessus, plus **enregistrement d'écran** pour les sauts.
- Pour Discord / WhatsApp / Twitch : lancer l'appli web sur les mêmes téléphones et **filmer** le comportement du clavier comme référence de confort, sans prétendre connaître leur code.

---

## 10. Décisions proposées et points ouverts

**Décisions proposées (à valider par prototype) :**
1. Coque fixe + `visualViewport` (variante A/B/C à trancher en T3) ; document verrouillé.
2. `<input type="text">` en `<form>`, Entrée = envoi, boutons `data-keep-focus`.
3. `font-size: 16px`, pas de `maximum-scale`.
4. `interactive-widget=resizes-content` conservé (aide Android).
5. Guérison (`heal()`) incluse d'emblée pour la PWA iOS ; retirer si inutile.
6. Pas de VirtualKeyboard API en v1.

**À suivre / ouvert :**
- Date réelle d'arrivée de `interactive-widget` dans Safari (fil standards-positions #65, bug 230225). Sur 2 ans, aucune échéance annoncée.
- Correctifs iOS : 297779, 292603 (PR WebKit #74122), 191204.
- Comportement exact des claviers dans Instagram / Facebook (aucune doc publique).
- Faut-il proposer le bandeau « Ouvrir dans le navigateur » (décision produit) ?
- Verrouillage d'orientation en PWA : support iOS réel à vérifier.
- Sur le dvh : l'article Sparka (DEV.to) qui affirme que `h-dvh` suit le clavier sur iOS est en contradiction avec web.dev ; à confirmer par un mini-test (T1 avec seulement `100dvh`).

---

## 11. Sources

**Spécifications, documentation de référence**
- Spécification CSS Viewport (interactive-widget, VirtualKeyboard) : https://drafts.csswg.org/css-viewport/
- MDN, meta viewport : https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport
- MDN, VirtualKeyboard API : https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API
- MDN, Visual Viewport API : https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API
- MDN, enterkeyhint : https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/enterkeyhint
- MDN, autocorrect : https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/autocorrect
- MDN, autocapitalize : https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/autocapitalize
- MDN, inputmode : https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode
- web.dev, unités de viewport (svh/lvh/dvh) : https://web.dev/blog/viewport-units
- Chrome for Developers, changement de comportement du viewport Android (Chrome 108) : https://developer.chrome.com/blog/viewport-resize-behavior
- Chrome for Developers, autocapitalize (2015) : https://developer.chrome.com/blog/autocapitalize
- caniuse, interactive-widget : https://caniuse.com/mdn-html_elements_meta_name_viewport_interactive-widget_resizes-content
- caniuse, VirtualKeyboard API : https://caniuse.com/mdn-api_virtualkeyboard

**Position de WebKit / bugs**
- WebKit standards-positions #65 (interactive-widget) : https://github.com/WebKit/standards-positions/issues/65
- WebKit standards-positions #16 (VirtualKeyboard) : https://github.com/WebKit/standards-positions/issues/16
- Bug 230225, VirtualKeyboard API non implémentée : https://bugs.webkit.org/show_bug.cgi?id=230225
- Bug 191204, mécanique de viewport cassée avec le clavier (2018) : https://bugs.webkit.org/show_bug.cgi?id=191204
- Bug 292603, bande vide en bas avec clavier : https://bugs.webkit.org/show_bug.cgi?id=292603
- Bug 297779, éléments fixed qui bougent (iOS 26) : https://bugs.webkit.org/show_bug.cgi?id=297779
- Bug 301857, WebView rétréci après clavier (iOS 26.0.1) : https://bugs.webkit.org/show_bug.cgi?id=301857
- Bug 218983, visualViewport.height faux en PWA : https://bugs.webkit.org/show_bug.cgi?id=218983
- Bug 254861, iPadOS PWA, viewport non restauré : https://bugs.webkit.org/show_bug.cgi?id=254861
- Bug 255852, unités de viewport fausses dans les IAB : https://bugs.webkit.org/show_bug.cgi?id=255852
- Bug 193634, garder le clavier au changement de focus : https://bugs.webkit.org/show_bug.cgi?id=193634
- Bug 237851, `offsetTop` lu trop tôt dans `resize` (iOS 15.4) : https://bugs.webkit.org/show_bug.cgi?id=237851
- Apple Developer Forums, iOS 26 fixed après clavier : https://developer.apple.com/forums/thread/800125 et https://developer.apple.com/forums/thread/800154

**Articles et retours d'expérience**
- Bramus, « Prevent content from being hidden underneath the Virtual Keyboard » (2021) : https://www.bram.us/2021/09/13/prevent-items-from-being-hidden-underneath-the-virtual-keyboard-by-means-of-the-virtualkeyboard-api/
- HTMHell, interactive-widget (Calendrier de l'Avent 2024) : https://htmhell.dev/adventcalendar/2024/4/
- mathix.dev, « How to keep fixed elements on top of the keyboard on iOS Safari » : https://mathix.dev/blog/fix-html-elements-on-top-of-the-ios-keyboard-using-html-css-js
- DEV.to (Francisco Moretti), « Fix mobile keyboard overlap » (dvh, contesté) : https://dev.to/franciscomoretti/fix-mobile-keyboard-overlap-with-visualviewport-3a4a
- DEV.to (cederhook), PWA standalone iOS, viewport rétréci : https://dev.to/cederhook/fixing-the-ios-standalone-pwa-keyboard-bug-that-shrinks-your-viewport-for-good-63d
- DEV.to (deanliu), bug de défilement du clavier iOS avec une ligne de CSS : https://dev.to/deanliu/the-ios-safari-keyboard-scroll-bug-fixed-with-one-line-of-css-1353
- iifx.dev, correction du positionnement fixe après clavier (iOS 26) : https://iifx.dev/en/articles/460201403/debugging-ios-26-how-to-correct-fixed-positioning-post-keyboard-interaction
- PR ReviewStage/luke #4171 (annuler le pan iOS avec `scrollTo(0,0)`) : https://github.com/ReviewStage/luke/pull/4171

**Code source de grosses applis**
- Telegram Web A : https://github.com/Ajaxy/telegram-tt (fichiers `src/util/windowSize.ts`, `src/styles/index.scss`)
- Telegram Web K : https://github.com/morethanwords/tweb (fichiers `index.html`, `src/helpers/dom/fixSafariStickyInput.ts`, `src/helpers/dom/fixSafariStickyInputFocusing.ts`)

> Les liens ci-dessus ont été consultés le 26/10/2026, sauf indication contraire. Plusieurs contenus de wiki WebKit changent vite : refaire le point sur les bugs 297779, 292603 et le fil #65 avant le prototype.
