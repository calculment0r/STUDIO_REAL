# Étude : capacités navigateur mobile (iOS Safari, Chrome Android) — vérification sourcée

Date de l'étude : 26 octobre 2026. Objet : vérifier et compléter le tableau de [docs/02-capacites-telephone.md](../02-capacites-telephone.md).

## 0. Comment lire ce document

**Niveaux de confiance** (chaque ligne en porte un) :

| Code | Sens |
|---|---|
| **V** | **Vérifié par source** : donnée lue dans une source primaire (WebKit, W3C, MDN/BCD, caniuse) ou une source secondaire concordante, URL donnée. |
| **V2** | Vérifié par **une seule source secondaire** (blog, outil tiers). Plausible, pas confirmé par l'éditeur. |
| **P** | **Probable** : déduction à partir de sources ou connaissance générale du développeur, mais pas lu dans une source ici. À tester. |
| **N** | **Non documenté** : aucune source trouvée. Il faut mesurer sur de vrais appareils. |

**Instantané de versions** (d'après les données caniuse récupérées le 26/10/2026) : iOS Safari jusqu'à 27.2, Chrome Android 156, Firefox Android 158, Samsung Internet 30. iOS 27 est sorti le 14 septembre 2026 (source secondaire, S23). Tout ce qui est dit de « iOS Safari » vaut aussi pour **Chrome, Firefox, Edge… sur iPhone**, qui utilisent tous WebKit (S3, rapport d'implémentation W3C).

**Limites de la méthode (à connaître)** :
- Le quota d'appels `WebSearch` s'est épuisé en cours d'étude (limite partagée). La seconde moitié des vérifications a donc été faite par lecture directe de pages connues (MDN, BCD, caniuse, WebKit, W3C, GitHub). Les points les plus pauvres en sources sont : les **délais réels de gel/coupure des WebSockets**, les **navigateurs intégrés des applis**, la **torche sur iPhone** et le **comportement du lecteur QR natif**.
- Plusieurs pages Apple Developer (`developer.apple.com/documentation/...`) ne se chargent pas sans JavaScript : leur contenu n'a **pas** été utilisé (les réponses obtenues venaient de la mémoire du modèle de lecture, pas de la page). Ces points sont marqués **P** ou **N**.
- Les données caniuse/BCD sont des fichiers JSON bruts lus via GitHub (`raw.githubusercontent.com`), résumés par un outil de lecture. Les valeurs clés ont été recoupées avec une seconde source quand c'était possible.

---

## 1. Tableau corrigé et sourcé

Légende : ✅ fonctionne · ⚠️ partiel / conditions · ❌ impossible · ❓ inconnu à tester · 🔒 permission/geste. Les numéros `Sxx` renvoient à la liste de sources (section 6).

| Capacité | Android Chrome (et Samsung Internet) | iPhone Safari (et tous les navigateurs iOS) | Confiance | Sources |
|---|---|---|---|---|
| **`navigator.vibrate`** | ✅ depuis Chrome 32 ; **geste utilisateur requis** depuis Chrome 60 (activation « collante » : après le premier toucher, les vibrations déclenchées par un message serveur passent) ; Samsung Internet ✅ (même moteur). Certains appareils ne vibrent pas en mode silencieux / Ne pas déranger. **Firefox Android : l'API existe mais ne vibre plus** (désactivée depuis Firefox 79, renvoie `true` sans effet). | ❌ **jamais livrée**. WebKit a officiellement une position « oppose » (issue #267, fermée le 14/11/2023). Caniuse : non supporté jusqu'à iOS 27.2. | **V** | S1, S2, S3, S4, S5 |
| **Astuce haptique `<input type=checkbox switch>`** | sans objet | ⚠️ Introduit dans Safari/iOS **18.0** (un « tap » ressenti quand on touche un interrupteur). Le bug WebKit 285120 demande (et marque « FIXED » le 03/01/2025) que cela exige une **activation utilisateur** : on ne peut donc pas l'utiliser pour une vibration poussée par le serveur. Sources tierces : l'astuce par `label.click()` marchait iOS 17.4 → 26.4 et **aurait été corrigée par Apple dans iOS 26.5** ; non confirmé par Apple. | Existence iOS 18.0 : **V** ; exigence d'activation : **V** (titre/statut du bug) ; casse en 26.5 : **V2** | S6, S7, S8, S9 |
| **Son : Web Audio / `<audio>`** | ✅ après un geste (voir autoplay ci-dessous). | ⚠️ idem, **et** l'`AudioContext` est par défaut en catégorie « ambient » : **coupé par le bouton silencieux**. Un ingénieur WebKit confirme que, **depuis iOS 17, `navigator.audioSession.type = "playback"`** sort le son du régime « silencieux » (bug 237322). `<audio>`/`<video>` sont en « playback » par défaut et passent même en silencieux. | **V** (déclaration d'un ingénieur WebKit dans le bug tracker) | S10, S11, S12 |
| **`navigator.audioSession`** | ❌ Chrome Android et Samsung : non supporté. Firefox : « preview ». | ✅ Safari/iOS **16.4+** (sous-ensemble de l'API). | **V** | S10 |
| Synthèse vocale | non revérifié dans cette étude | non revérifié ; Safari 27 corrige un bug de `speechSynthesis.cancel()` | **N** (pour le tableau), **V** (le bug) | S22b |
| **Plein écran** (Fullscreen API) | ✅ Chrome, Firefox, Samsung. | ❌ **iPhone : non** (caniuse : « partiel = iPad seulement, avec un bouton superposé non désactivable », vrai jusqu'à 27.2). Seule la **vidéo** passe en plein écran sur iPhone. | **V** | S16, S6b |
| Orientation : **`screen.orientation.lock()`** | ✅ Chrome Android depuis 38, mais en pratique **seulement quand la page est en plein écran** (« typically only enabled on mobile, and when the browser context is full screen ») ; Firefox Android 144+ (79→143 : l'API existe mais échoue). | ❌ **non supporté** (BCD) ; Safari 16.4 le proposait derrière un réglage expérimental (jamais activé par défaut d'après nos sources). | **V** | S32 |
| **Wake Lock** (écran allumé) | ✅ Chrome 84, Samsung 84, Firefox 126. | ✅ **dans un onglet Safari depuis 16.4**. **Dans une web app installée (écran d'accueil) : seulement depuis iOS 18.4** (de 16.4 à 18.3 l'objet existe mais ne marche pas : bug WebKit 254545). Le verrou est **relâché automatiquement quand la page passe en arrière-plan** : à reprendre sur `visibilitychange`. Une demande peut être refusée (économie d'énergie, batterie faible). | **V** | S13, S14, S15, S23 |
| **Web Push** | ✅ Chrome, Samsung, Firefox (navigateur complet, pas besoin d'installer). | ⚠️ **Uniquement pour une web app ajoutée à l'écran d'accueil** (iOS 16.4+), permission demandée sur un geste ; **dans un onglet Safari : `Notification` indéfini, `PushManager` inutilisable** (caniuse : toujours « il faut d'abord l'ajouter à l'écran d'accueil » jusqu'à 27.2). Depuis **iOS 26**, n'importe quel site ajouté à l'écran d'accueil s'ouvre en web app par défaut (manifest non requis). **Declarative Web Push** (sans service worker) depuis 18.4. **Pas de push** dans WKWebView ni SFSafariViewController (navigateurs intégrés). | **V** (WebKit + caniuse) ; détail « onglet = indéfini » : **V2** | S17, S19, S20, S21, S22, S23 |
| **Web apps (PWA) dans l'UE (DMA)** | sans objet | ✅ Apple avait retiré la fonction dans une bêta d'iOS 17.4 (UE), puis l'a **rétablie avant la sortie (1er mars 2024)** ; les web apps UE tournent sur WebKit, comme ailleurs. État fin 2026 : source secondaire (septembre 2026) dit « supportées, WebKit uniquement, aucun moteur alternatif livré aux utilisateurs ». **Aucune déclaration Apple de 2026 trouvée** : à revérifier juste avant le spectacle. | Rétablissement 2024 : **V** (presse concordante) ; état 2026 : **V2** | S23, S24, S25 |
| Pastille sur l'icône (Badging) | ⚠️ **Non confirmé** : les notes BCD ne citent que Windows/macOS (Chrome 81) et ChromeOS (91) ; Android absent des notes. | ✅ iOS 16.4+, web app installée, après permission de notification. | iOS : **V** ; Android : **P** (probablement non) | S2, S16b, S23 |
| **Accéléromètre / gyroscope** | ✅ DeviceMotion/Orientation sans permission aujourd'hui. **À surveiller** : BCD indique que `DeviceMotionEvent/DeviceOrientationEvent.requestPermission` apparaît côté Chrome en **version 152** (stable le 25/08/2026) ; la page des notes de version 152 n'en parle pas, donc l'effet sur Android n'est **pas établi**. Coder de façon générique : `typeof X.requestPermission === 'function'`. | ✅ mais 🔒 `requestPermission()` obligatoire, **doit être appelé sur un geste** (activation transitoire), sinon `NotAllowedError`. BCD : disponible depuis 14.5 ; caniuse : support complet à partir d'iOS 17.0 (partiel avant). Réponse `granted` / `denied`. | **V** (existence, geste) ; Chrome 152 : **N** (effet) | S27, S28, S40 |
| Boussole / orientation absolue | ✅ événement `deviceorientationabsolute` (propriété `absolute` sur Chrome) | `absolute` **non supporté** ; la boussole passe par `webkitCompassHeading` (non revérifié ici). | `absolute` : **V** ; `webkitCompassHeading` : **N** (non relu) | S28 |
| **Caméra / micro** (`getUserMedia`) | ✅ 🔒 | ✅ 🔒 dans Safari. **Dans une WKWebView (navigateur intégré)** : disponible depuis iOS 14.3 **seulement si l'appli hôte sait capturer** (déclaration native) ; sinon refusé. | Safari : connu ; WKWebView : **V** (blog WebKit) | S37c |
| **Lampe torche** (`torch` via piste caméra) | ⚠️ La contrainte `torch` est définie dans le brouillon W3C *Image Capture* (23/04/2025). Aucune table de compatibilité n'a pu être lue. Marche en pratique sur Chrome Android sur les appareils dotés d'un flash (connaissance générale). | ❓ **Ne plus écrire ❌.** Safari a livré **ImageCapture en 18.4** (`grabFrame` en 26), et les notes 18.4 mentionnent la correction d'un bug « `getSettings()` renvoyait une valeur obsolète pour `torch` » : **WebKit semble donc gérer `torch` sur certaines caméras**. Aucune source ne dit « iPhone peut allumer la lampe depuis une page ». | Android : **P** ; iOS : **N** (indice seulement) | S29, S29b, S14 |
| **Reconnaissance vocale** | ✅ Chrome Android : préfixé `webkitSpeechRecognition` depuis 33, **sans préfixe depuis 139**. Firefox Android : seulement en « preview ». Samsung : non précisé par BCD. | ⚠️ `webkitSpeechRecognition` (préfixé) depuis Safari **14.1** ; Safari 26 la restreint aux **contextes sécurisés (HTTPS)**. Où est traité l'audio (serveur/appareil) : non documenté dans nos sources. | existence : **V** ; qualité/vie privée : **N** | S31, S22 |
| **Géolocalisation / Bluetooth / lumière ambiante** | non revérifié | non revérifié | **N** (hors périmètre de cette étude ; inchangé dans docs/02) | — |
| **Web NFC** | ✅ Chrome Android **89+** (`NDEFReader`, expérimental, HTTPS). Firefox ❌. Samsung : non précisé (basé Chromium, à tester). | ❌ non supporté. | **V** | S33 |
| **Battery Status API** | ✅ Chrome (depuis 38) et Samsung Internet. Firefox Android ❌ (retiré en 52). | ❌ Safari jamais. | **V** | S2, S34 |
| **Luminosité de l'écran** | pas d'API standard livrée (non revérifié) | ❌ WebKit a une position « oppose » sur le contrôle de la luminosité (issue #19, close le 23/03/2023) ; arguments : abus, détection de QR possible par le navigateur lui-même, l'utilisateur peut régler à la main. | iOS : **V** ; Android : **N** | S39 |
| **Visibilité / gel d'onglet** | `visibilitychange` ✅. `freeze`/`resume` (Page Lifecycle) Chrome 68+. Après **5 min** cachée, limitation « intensive » des minuteries ; **exemptées : WebRTC (data channel ou piste active) et page qui a produit du son dans les 30 dernières secondes**. Les WebSockets **ne sont pas exemptés**. | `visibilitychange` ✅ (dernier événement fiable avant suspension, source secondaire). `freeze`/`resume` : **non supportés par Safari**. Les web apps installées sont mises en pause en arrière-plan. | Chrome : **V** ; iOS : **V2** ; **délais réels de coupure du WebSocket : N** | S35, S23 |
| **Autoplay son** | Son autorisé après interaction avec le domaine (ou site ajouté à l'écran d'accueil sur mobile) ; vidéo muette toujours autorisée ; `AudioContext` créé hors geste = `suspended`, `resume()` après un geste (depuis Chrome 71). | Son : geste direct requis (`touchend`, `click`, `doubleclick`, `keydown`), `play()` renvoie une promesse rejetée sinon ; vidéo muette inline autorisée. `AudioContext` reste suspendu jusqu'à `resume()` sur une action utilisateur (note BCD Safari 14.1). | **V** | S36 |
| **Web Audio : latence** | `baseLatency` dès Chrome 58 ; `outputLatency` dès Chrome 102 ; `latencyHint` ✅ | `baseLatency` et `latencyHint` dès Safari 14.1 ; `outputLatency` dès **Safari 18.4**. Valeurs réelles en millisecondes : **non documentées**. | présence des API : **V** ; chiffres : **N** | S36 |
| **`overscroll-behavior`** | ✅ Chrome Android (63+, `overscroll-behavior-y: contain` bloque le tirer-pour-rafraîchir de Chrome) ; Samsung 8.2+ | ✅ supporté **depuis iOS 16.0** (14.5–15.8 : derrière un réglage expérimental). **Aucune source ne dit s'il désactive le tirer-pour-rafraîchir ni le rebond élastique d'iOS.** | support : **V** ; effet sur le « pull-to-refresh » iOS : **N / P** | S38 |
| **Stockage local et ITP** | ✅ pas de plafond de 7 jours | ⚠️ voir section 2.9 : plafond de **7 jours d'usage de Safari sans interaction avec le site**, **uniquement pour le stockage écrit par script** (localStorage, IndexedDB, cookies écrits en JS, caches/service workers). Cookies posés par le serveur : non plafonnés (sauf camouflage CNAME/IP). Web app installée : exemptée, compteur à part. | **V** | S26, S26b |
| **Navigateurs intégrés aux applis (IAB)** | voir section 4 | voir section 4 | mixte | S19, S37 |
| **Clavier virtuel** (`interactive-widget`, `visualViewport`) | non revérifié | non revérifié ; Safari 15.4 apporte `dvh/svh/lvh` (hauteur de viewport dynamique) | **N** pour le clavier ; **V** pour dvh | S38b |

*(Les lignes « Pastille » et « Synthèse vocale » renvoient à S16b = S2 et S22b.)*

---

## 2. Détail des points prioritaires

### 2.1 Vibration : conclusion nette
- iOS : **jamais**, et pas de piste. WebKit s'oppose formellement (S4). Raisons citées : expressivité limitée, risque de détournement en canal de notification, consommation, « impossible à intégrer sur les plateformes Apple ». En octobre-novembre 2025, des demandes de réexamen ont été postées sans réponse visible. **Ne rien promettre à l'iPhone.**
- Android : Chrome et Samsung Internet oui ; **Firefox Android a l'API mais elle est inerte** depuis la 79 (S2, S3). Donc `navigator.vibrate` renvoie `true` sans rien faire : **ne pas se fier à la valeur de retour ni à la présence de la fonction** pour compter les « téléphones qui vibrent ». Le banc d'essai doit demander à la personne « avez-vous senti la vibration ? ».
- Chrome exige une activation utilisateur (« sticky ») (S5, S2) : le toucher d'entrée dans le spectacle suffit pour les vibrations ultérieures.
- Appareil en mode silencieux / Ne pas déranger : certains ne vibrent pas (S5).
- L'astuce haptique du `switch` : trop fragile (activation requise, probable cassure iOS 26.5) pour entrer dans la conception comme canal du scénario. **Au plus un bonus au toucher** (retour d'un bouton), jamais un signal que la régie envoie.

### 2.2 Son et bouton silencieux
- Principe vérifié : sur iPhone, un `AudioContext` « ambient » est coupé par le commutateur silencieux, alors que `<audio>` ne l'est pas (S11). Correctif officiel : `navigator.audioSession.type = "playback"` (iOS 17+, S11). Le contournement ancien (boucler un `<audio>` silencieux, utilisé par Wikipédia) a un effet de bord : des commandes de lecture apparaissent sur l'écran verrouillé (S11).
- **Aucune API ne permet de savoir si le téléphone est en silencieux.** Le tutoriel doit donc faire un **test d'écoute** (« Entendez-vous le bip ? Oui / Non ») et remonter le résultat à la régie.
- L'API Audio Session a six types (`auto`, `playback`, `transient`, `transient-solo`, `ambient`, `play-and-record`). Piège : si la caméra/micro est active, `auto` passe en `play-and-record` (priorité la plus haute) (S12).

### 2.3 Plein écran, orientation
- iPhone : pas de Fullscreen API pour une page (S16). Repli : mise en page qui tolère la barre Safari ; `100dvh`/`svh` (S38b) ; web app installée en option.
- Une web app iOS peut passer en « standalone », mais l'installation est manuelle (menu Partager), sans `beforeinstallprompt`, et selon une source secondaire **un lien venant d'une autre appli n'ouvre jamais la web app** (S23). Donc le scénario « QR → web app installée » ne marche pas : le QR ouvre toujours Safari.
- Verrouillage d'orientation : iOS ❌ ; Android seulement en plein écran (S32). Concevoir **portrait d'abord, mise en page responsive aussi en paysage**, et un message « tournez » plutôt qu'un verrou.

### 2.4 Wake Lock
- Onglet Safari : oui depuis 16.4. Web app installée : oui seulement depuis 18.4 (S14, S23). iOS 16.4 → 18.3 : l'objet existe mais ne fait rien en web app : **ne pas se fier à la détection de fonctionnalité** seule en PWA.
- Libération automatique à la mise en arrière-plan : réécrire `request('screen')` sur `visibilitychange` quand la page redevient visible (S15). Les demandes peuvent échouer : toujours `try/catch` et remonter l'état à la régie.
- Repli (vidéo muette en boucle) : **non vérifié ici** ; à tester sur iOS avec les versions réelles de la salle.

### 2.5 Web Push et PWA (y compris UE)
- iOS : push seulement pour une web app installée, permission sur geste, payload visible obligatoire (« chaque push doit afficher une notification », source secondaire) (S17, S19, S23). Depuis iOS 26, tout site ajouté se comporte en web app par défaut, **sans manifest** (S22) : la barrière technique est tombée, **la friction humaine reste** (4 étapes dans le menu Partager).
- Pas de push dans les navigateurs intégrés (caniuse note 6 : « supporté dans Safari, mais pas dans WKWebView ni SFSafariViewController ») (S19).
- UE : Apple a rétabli les web apps avant la sortie d'iOS 17.4 (S25). Des moteurs alternatifs sont autorisés en UE depuis iOS 17.4, mais les web apps restent WebKit (S23). **Conclusion : pas de différence UE pour notre usage**, sauf nouvelle annonce d'Apple.
- Pour un spectacle : **push = bonus facultatif** (après-spectacle, rappel), jamais un canal de scène.

### 2.6 Capteurs
- Permission iOS sur geste : pas de contournement. Concevoir l'écran « Toucher pour entrer » pour appeler dans l'ordre : `DeviceMotionEvent.requestPermission()`, audio (`AudioContext.resume()` + `audioSession`), Wake Lock, dans le **même** gestionnaire de clic (le premier `await` peut consommer l'activation transitoire sur certains moteurs : à tester, non documenté ici).
- Surveiller Chrome ≥ 152 (voir tableau).

### 2.7 Reconnaissance vocale
- Disponible en préfixé sur Safari 14.1+ et Chrome Android, mais Firefox Android seulement en préversion et le traitement de l'audio n'est pas documenté ici : **pas de dépendance** dans un scénario ; clavier en repli. Si l'audio part vers un tiers, c'est un sujet RGPD (non vérifié ici).

### 2.8 Visibilité, gel, WebSocket à l'écran verrouillé
Ce que les sources établissent :
- Chrome : limitation intensive des minuteries après 5 min en arrière-plan ; exemptions pour WebRTC actif et son récent ; les WebSockets ne sont pas exemptés (S35). L'événement `freeze` arrive à la discrétion du navigateur ; Chrome recommande de **fermer proprement les WebSockets au gel** et de les rouvrir à la reprise (S35).
- Sur mobile, `pagehide`/`unload` peuvent ne pas se déclencher : l'état « hidden » est le dernier point fiable (S35 ; S23 pour iOS).
- Un témoignage isolé (commentaire GitHub, 2020) signale des coupures de socket sur Chrome Android après verrouillage (S38c) : **anecdotique**, non daté en secondes.
- **Délais réels (secondes avant coupure du socket, avant gel du JS) sur iOS et sur Android : non documentés.** Ne pas inventer de chiffre. C'est le **test n° 1** à faire sur appareils (section 5).

### 2.9 Stockage et reconnaissance du téléphone (ITP)
- Règle exacte de WebKit : suppression de tout le stockage écrit par script « après sept jours **d'usage de Safari** sans interaction de l'utilisateur avec le site » (S26). Ce n'est donc **pas** 7 jours calendaires : un spectateur qui n'ouvre pas Safari pendant 3 semaines ne perd rien tant qu'il n'a pas « utilisé Safari » 7 jours sans retourner sur le site. La phrase de docs/02 (« effacé après 7 jours sans visite ») est approximative.
- Périmètre : IndexedDB, localStorage, sessionStorage, clés média, enregistrements et caches de service workers, cookies écrits par JavaScript (S26b). **Les cookies posés par le serveur (`Set-Cookie`) ne sont pas plafonnés** hors cas de camouflage CNAME/IP tiers (S26b).
- Décoration de lien : si une adresse arrive avec un paramètre de pistage connu, les cookies JS créés sur cette page sont plafonnés à **24 h** (S26b). Un jeton de place dans l'URL du QR n'est pas concerné en soi, mais **ne pas l'utiliser comme seule mémoire**.
- Web app installée : exemptée, compteur d'usage séparé, données isolées de Safari (S26, S26b, S23). Les cookies sont copiés **une fois** à la création (iOS 17.2+), pas localStorage/IndexedDB (S23, secondaire).
- Safari 26 bloque aussi les scripts de fingerprinting connus pour écrire du stockage à longue durée de vie (S22).
- Quota : jusqu'à 60 % du disque par origine, 80 % au total depuis iOS 17 (S23, S24) ; l'éviction peut aussi avoir lieu en cas de pression disque ; `navigator.storage.persist()` accordé sans demande depuis iOS 17 (S23).
- **Conséquence pour « reconnaître un téléphone »** : la durée d'une soirée est très en dessous de 7 jours. Le vrai risque n'est pas l'ITP mais (a) le **changement de contexte de navigation** (Safari ↔ navigateur intégré ↔ web app : stockages séparés) et (b) un effacement manuel. Voir recommandations.

---

## 3. Navigateurs autres que Safari/Chrome (ajouts)

| Navigateur | Ce qui change | Confiance | Source |
|---|---|---|---|
| **Samsung Internet** (Android, très répandu) | Chromium : vibration ✅, Wake Lock ✅ (84+), Push ✅, Battery ✅, orientation lock ✅, Web NFC (non précisé) | **V** (caniuse + BCD « mirror ») | S1, S2, S13, S19, S34 |
| **Firefox Android** | `vibrate` inerte ; Wake Lock ✅ (126+) ; Push ✅ ; Battery ❌ ; NFC ❌ ; audioSession « preview » ; orientation lock ✅ (144+) | **V** | S2, S3, S13, S32, S33 |
| **Chrome/Firefox/Edge sur iPhone** | Même moteur que Safari : **mêmes limites que Safari** (pas de vibration, etc.). Peuvent proposer « Ajouter à l'écran d'accueil » sous conditions (entitlement). | **V** | S3, S17 |
| **WebView Android** (navigateur intégré) | BCD : `vibrate` ✅ (4.4.3+, geste requis), Wake Lock « miroir de Chrome 84 ». `navigator.share`, WebUSB, Serial, XR : ❌. | **V** | S2 |

---

## 4. Navigateurs intégrés aux applis (le QR ouvre parfois un « petit navigateur »)

### 4.1 Ce qui est établi
- **Instagram, Facebook, Messenger** (iOS) ouvrent les liens dans un navigateur intégré personnalisé, pas dans Safari ; Instagram **injecte** un script de Meta (`pcm.js`) dans les pages affichées ; cela peut « provoquer des bogues ou casser des sites » ; **pas de blocage de contenu ni d'extensions** ; liens profonds et partage difficiles ; pas d'indicateurs de sécurité du navigateur ; pas d'option pour le désactiver (réponse de Meta). Un menu « ⋯ » permet d'**ouvrir dans le navigateur par défaut** (S37).
- **WhatsApp** ouvre Safari par défaut ; **Telegram** utilise `SFSafariViewController` (S37).
- Web Push : **absent** de WKWebView et de SFSafariViewController (S19).
- `getUserMedia` dans une WKWebView : possible depuis iOS 14.3 si l'appli hôte déclare la capacité de capture (S37 : blog WebKit). Donc **caméra/micro dépendent de chaque appli**.
- L'ITP est activé par défaut dans toutes les applis WKWebView (S37, App-Bound Domains).
- Aucune source trouvée donnant la liste des API cassées dans chaque navigateur intégré. **Il n'y a pas de table fiable « Instagram supporte X ».**

### 4.2 Ce qui est probable (non lu dans une source ici — P)
- WKWebView/SFSafariViewController : **stockage séparé de Safari** (cookies, localStorage). Donc un spectateur qui s'inscrit dans Instagram puis rouvre dans Safari apparaît comme un **nouveau téléphone**.
- Dans une WKWebView : pas de Web Push, Wake Lock et Fullscreen identiques à Safari mais dépendants de la version d'iOS ; capteurs de mouvement : demande de permission possible mais **comportement non documenté** ; fermeture de la vue = perte de la session.
- Android : les WebViews (Facebook, Instagram, TikTok, applis de messagerie) laissent l'appli décider d'accorder caméra, micro, géolocalisation ; par défaut c'est refusé si l'appli ne l'implémente pas (API Android `onPermissionRequest` / `onGeolocationPermissionsShowPrompt` ; page officielle non lisible, **connaissance générale**).
- Lecteur QR natif : l'appareil photo d'iPhone affiche une bannière puis ouvre le lien dans **Safari** (page Apple non lisible ici). Sur Android, Google Lens / l'appareil photo ouvre en général le **navigateur par défaut** ou un onglet personnalisé ; Samsung peut ouvrir Samsung Internet. **À tester sur vos téléphones.** Les lecteurs de QR **dans** une appli tierce (Snapchat, Instagram, LINE, WeChat, appli de banque…) ouvrent leur navigateur intégré.

### 4.3 Conséquences pour la conception
1. **Détecter** le navigateur intégré à l'arrivée (jetons du user-agent connus des développeurs comme `FBAN`/`FBAV`/`FB_IAB`, `Instagram`, `Line/`, `MicroMessenger`, `TikTok`/`musical_ly`/`BytedanceWebview`, et `; wv)` pour Android WebView — **liste non vérifiée ici, à valider sur appareils**), **et** par tests de fonctionnalités (la page « banc d'essai » : caméra, mouvement, Wake Lock, audio).
2. Afficher un bandeau **non bloquant** : « Pour une meilleure expérience, ouvrez dans Safari/Chrome (menu ⋯ → Ouvrir dans le navigateur) », avec **bouton « Copier le lien »**. Aucune source ne fournit de moyen fiable d'ouvrir automatiquement Safari depuis un navigateur intégré iOS (l'auteur de S37 n'en a pas trouvé). Sur Android, un lien `intent://` vers Chrome existe (connaissance générale, **P**).
3. Garder un **mode dégradé complet** : couleur, texte, vote, boutons, notifications dans la page marchent dans n'importe quelle WebView. Caméra, capteurs, push, Wake Lock sont **optionnels** et déclarés par le banc d'essai.
4. **Changement de contexte = nouveau téléphone** : prévoir une reconnexion par **pseudo + code court** (voir section 5).
5. Sur l'affiche et le programme : consigne « Scannez avec l'**appareil photo** de votre téléphone » (pas depuis une autre appli) ; **URL courte lisible** sous le QR pour la saisir à la main.

---

## 5. Recommandations concrètes

### 5.1 Replis (par capacité)
| Capacité | Repli recommandé |
|---|---|
| Vibration (iOS, Firefox, navigateurs intégrés) | Flash d'écran bref + son discret ; ne jamais en faire le **seul** signal d'un moment clé. Mesurer la part de téléphones qui vibrent via le test d'entrée (« avez-vous senti ? »). |
| Son et silencieux | `audioSession.type = 'playback'` dans le geste d'entrée ; test d'écoute ; si « non entendu », afficher un message **visuel** équivalent (texte/animation) pour ce téléphone. |
| Plein écran iPhone | Mise en page avec `100dvh`, tolérante à la barre ; ne pas compter sur le plein écran. |
| Orientation | Portrait par défaut + tolérance au paysage. |
| Wake Lock | Demander dans le geste d'entrée, **réarmer** sur `visibilitychange`, remonter l'état à la régie ; consigne « réglez la mise en veille sur 5 min ou plus » si échec. |
| Push | Facultatif ; notification **dans la page** pendant le spectacle. |
| Capteurs iOS | Écran « Toucher pour activer le mouvement » ; refus → bouton à marteler. |
| Torche | Écran blanc ; torche en **bonus Android** testé en banc d'essai, jamais sur iPhone sans test concluant. |
| Reconnaissance vocale | Clavier. |
| Reconnaissance du téléphone | **Cookie `Set-Cookie` côté serveur** (HttpOnly, Secure, SameSite=Lax, durée longue) comme jeton principal + miroir en localStorage/IndexedDB ; récupération par **pseudo + code à 4 chiffres** ; la place/siège portée par le serveur, pas par le téléphone. |
| Connexion coupée (écran verrouillé) | Sur `visibilitychange`/`pageshow` : rouvrir le socket, demander l'**état courant complet** au serveur (le serveur a toujours raison). Heartbeat côté serveur plutôt que minuterie client (une minuterie client est ralentie en arrière-plan, S35, S38c). |
| Navigateur intégré | Bandeau « Ouvrir dans le navigateur » + mode dégradé. |

### 5.2 À tester sur de vrais appareils (par priorité)
Matrice minimale : iPhone récent (iOS 26/27), iPhone ancien (iOS 17/18), Android Chrome milieu de gamme, Samsung Internet, Firefox Android ; chacun avec lecteur QR natif **et** depuis Instagram/Facebook/Snapchat/WhatsApp.

1. **Écran verrouillé / appli en arrière-plan** : verrouiller 10 s, 30 s, 1 min, 5 min, 15 min, avec et sans Wake Lock, sur Wi-Fi puis 4G/5G ; journaliser côté serveur l'heure de la dernière réception, de la fermeture du socket et de la reconnexion. *Ces délais ne sont pas documentés.*
2. **Silencieux** : commutateur silencieux, volume média à zéro, Bluetooth connecté ; avec et sans `audioSession.type='playback'`.
3. **Vibration** : Chrome, Samsung, Firefox, mode silencieux, Ne pas déranger ; test d'entrée avec réponse humaine.
4. **Torche** : Chrome Android sur 3 modèles ; **Safari iPhone** (`getCapabilities().torch` existe ? `applyConstraints({advanced:[{torch:true}]})` réussit ?).
5. **Wake Lock** : onglet Safari, web app installée, iOS 17/18.3/18.4+, mode économie d'énergie.
6. **Capteurs** : `requestPermission` sur iOS dans la chaîne d'entrée (geste → audio → capteurs → wake lock) ; refus puis réessai ; **Chrome Android ≥ 152** : y a-t-il maintenant une invite ?
7. **Navigateurs intégrés** : pour chaque appli : caméra, micro, mouvement, Wake Lock, audio, stockage conservé en revenant dans Safari, lien d'ouverture externe.
8. **Pull-to-refresh / rebond** : Safari iOS avec `overscroll-behavior: none` sur `html, body` ; Chrome Android avec `overscroll-behavior-y: contain`.
9. **Latence audio** : mesurer `baseLatency`, `outputLatency` (iOS ≥ 18.4, Chrome ≥ 102) sur chaque appareil, avec et sans écouteurs Bluetooth ; si « jouer à T » doit être synchrone, prévoir une **calibration** (la latence varie selon l'appareil et la sortie audio).
10. **Reconnaissance du téléphone** : fermer l'onglet, tuer Safari, redémarrer, basculer vers un autre navigateur, mode privé.
11. **UE** : refaire un test d'ajout à l'écran d'accueil + push sur un iPhone configuré en UE avant le spectacle.

### 5.3 Décisions de conception qui changent
- **L'iPhone n'a ni vibration, ni plein écran, ni push (dans le parcours QR), ni torche prouvée.** Les effets scéniques doivent reposer sur **image + son** ; la vibration est un bonus Android.
- **Le parcours QR → Safari (ou navigateur intégré) est le chemin principal ; la PWA est une option, pas un prérequis.**
- **Le test d'entrée devient central** : un seul toucher qui enchaîne audio (+ `audioSession`), mouvement, Wake Lock, puis questions humaines (« bip entendu ? », « vibration sentie ? ») et enregistre la **capacité réelle** de chaque téléphone, y compris `inAppBrowser`.

---

## 6. Corrections à apporter à docs/02-capacites-telephone.md

1. **Vibration iPhone** : retirer « à vérifier ». Ajouter : « jamais livrée, position WebKit "oppose" (2023) » et **« Firefox Android : API présente mais inerte depuis la 79 »**. Samsung Internet ✅.
2. **Astuce haptique `switch`** : remplacer « à vérifier » par : iOS 18.0+, **activation utilisateur requise**, **fragile (signalée cassée en iOS 26.5, non confirmé)** ; ne pas l'utiliser comme canal piloté par la régie.
3. **Son / bouton silencieux** : remplacer « à vérifier » par : le contournement est **`navigator.audioSession.type = 'playback'` (iOS 17+, confirmé par un ingénieur WebKit)**, contournement ancien : `<audio>` silencieux en boucle (effet de bord sur l'écran verrouillé). Ajouter qu'**aucune API ne détecte le mode silencieux** → test d'écoute.
4. **Plein écran** : « ❌ iPhone » confirmé jusqu'à iOS 27.2 ; iPad « partiel » avec bouton superposé. Corriger « PWA = plein écran sur iOS aussi » en : **« mode standalone après installation manuelle ; un lien venant d'une autre appli n'ouvre pas la web app (source secondaire) »**.
5. **Verrouillage d'orientation** : Android = « ⚠️ en plein écran seulement » (déjà), ajouter **Firefox Android 144+**, et que Safari iOS ne l'a **jamais livré par défaut**.
6. **Wake Lock** : « ✅ (Safari 16.4+) » → **« ✅ onglet Safari 16.4+ ; ⚠️ web app installée seulement 18.4+ ; relâché à chaque mise en arrière-plan ; peut être refusé (économie d'énergie) »**.
7. **Web Push** : ajouter **« onglet Safari : API absente ; web app seulement ; depuis iOS 26 tout site ajouté devient web app (sans manifest) ; Declarative Web Push depuis 18.4 ; pas dans les navigateurs intégrés ; UE : fonction rétablie en 2024, rien de nouveau trouvé en 2026 »**.
8. **Règle générale n° 3** : « seules les notifications push peuvent réveiller » → **« seulement pour une web app installée sur iOS ; donc, dans le parcours QR, rien ne réveille un iPhone verrouillé »**.
9. **Badging** : Android « ✅ (PWA) » → **« ⚠️ non confirmé sur Android (notes BCD : bureau et ChromeOS) »** ; iOS ✅ 16.4+ (permission de notification requise).
10. **DeviceMotion** : préciser **« `requestPermission()` sur un geste ; `NotAllowedError` sinon »** ; ajouter la **surveillance de Chrome 152** (apparition de `requestPermission`) ; `absolute` non supporté sur iOS.
11. **Reconnaissance vocale iPhone** : remplacer « à vérifier » par « ⚠️ `webkitSpeechRecognition` depuis Safari 14.1, HTTPS obligatoire (Safari 26) ; Android : Chrome seulement (Firefox Android préversion) ».
12. **Lampe torche iPhone** : « ❌ » → **« ❓ inconnu : Safari livre ImageCapture (18.4) et gère `torch` dans `getSettings()` ; à tester »**. Android : citer la contrainte `torch` du brouillon W3C Image Capture ; test obligatoire.
13. **NFC** : Android ✅ **Chrome 89+ uniquement** ; Firefox ❌ ; Samsung à tester.
14. **Battery** : Android « ⚠️ Chrome » → **« ✅ Chrome et Samsung ; ❌ Firefox ; ❌ Safari »**.
15. **Visibilité** : compléter par : `freeze`/`resume` absents de Safari ; Chrome ralentit les minuteries après 5 min et **n'exempte pas les WebSockets** ; WebRTC actif ou son récent exemptent. Les **délais réels de coupure du socket sont non documentés** : ajouter un renvoi au plan de test.
16. **Stockage** : « effacé après 7 jours sans visite » → **« après 7 jours d'usage de Safari sans interaction avec le site ; seulement le stockage écrit par script ; les cookies serveur ne sont pas plafonnés ; web app installée exemptée ; navigateur intégré = stockage séparé (probable) »**. Remplacer le repli « jeton dans l'URL » par **cookie serveur + code court**.
17. **Autoplay / Web Audio** : ajouter les règles par navigateur (section 1) et la **latence variable** (`outputLatency` Safari 18.4+, Chrome 102+).
18. **Ajouter des lignes** : Samsung Internet, Firefox Android, **navigateurs intégrés (Instagram, Facebook, Messenger, TikTok, Snapchat, WeChat, Telegram, WhatsApp)**, `audioSession`, `overscroll-behavior`, Page Lifecycle.
19. **Luminosité** : citer la position « oppose » de WebKit (2023) pour justifier le ❌ iPhone.
20. **Lignes non revérifiées dans cette étude** (laisser telles quelles mais marquer « non revérifié ») : synthèse vocale, géolocalisation, Bluetooth, lumière ambiante, presse-papiers/Web Share, clavier virtuel.

---

## 7. Liste des sources

Toutes consultées le 26/10/2026.

**Compatibilité (données brutes)**
- S1 — caniuse, Vibration : https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/vibration.json
- S2 — MDN BCD, `Navigator` (vibrate, wakeLock, getBattery, audioSession, clearAppBadge) : https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Navigator.json
- S10 — MDN BCD, `AudioSession` : https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/AudioSession.json
- S13 — caniuse, Wake Lock : https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/wake-lock.json
- S16 — caniuse, Fullscreen : https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/fullscreen.json
- S16b — (badging, via S2)
- S19 — caniuse, Push API (notes 6 et 7) : https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/push-api.json
- S27 — MDN BCD, `DeviceMotionEvent` : https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/DeviceMotionEvent.json
- S28 — MDN BCD, `DeviceOrientationEvent` : https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/DeviceOrientationEvent.json
- S40 — caniuse, DeviceOrientation : https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/deviceorientation.json
- S29b — MDN BCD, `ImageCapture` : https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/ImageCapture.json
- S31 — MDN BCD, `SpeechRecognition` : https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SpeechRecognition.json
- S32 — MDN BCD, `ScreenOrientation` : https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/ScreenOrientation.json ; MDN `lock()` : https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/screenorientation/lock/index.md
- S33 — MDN BCD, `NDEFReader` : https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/NDEFReader.json
- S34 — caniuse, Battery Status : https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/battery-status.json
- S36 — MDN BCD, `AudioContext` (baseLatency, outputLatency) : https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/AudioContext.json
- S38 — caniuse, overscroll-behavior : https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/css-overscroll-behavior.json
- S38b — WebKit, Safari 15.4 (dvh) : https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/

**WebKit / Apple / standards**
- S4 — WebKit standards-positions #267 (Vibration, oppose) : https://github.com/WebKit/standards-positions/issues/267
- S39 — WebKit standards-positions #19 (luminosité, oppose) : https://github.com/WebKit/standards-positions/issues/19
- S3 — W3C, rapport d'implémentation Vibration : https://w3c.github.io/vibration/reports/implementation.html
- S6 — WebKit, Safari 18.0 (haptique `switch`) : https://webkit.org/blog/15865/webkit-features-in-safari-18-0/
- S6b — WebKit, Safari 16.4 (orientation, Fullscreen, Audio Session sous-ensemble, Wake Lock, Badging, Push) : https://webkit.org/blog/13966/webkit-features-in-safari-16-4/
- S7 — WebKit Bugzilla 285120 (haptique `switch` et activation) : https://bugs.webkit.org/show_bug.cgi?id=285120
- S11 — WebKit Bugzilla 237322 (Web Audio coupé par le silencieux ; `audioSession.type='playback'` depuis iOS 17) : https://bugs.webkit.org/show_bug.cgi?id=237322
- S14 — WebKit, Safari 18.4 (Wake Lock web apps, Declarative Web Push, ImageCapture, correctif `torch`) : https://webkit.org/blog/16574/webkit-features-in-safari-18-4/
- S17 — WebKit, Web Push iOS 16.4 : https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- S21 — WebKit, Declarative Web Push : https://webkit.org/blog/16535/meet-declarative-web-push/
- S22 — WebKit, Safari 26.0 (web apps par défaut, SpeechRecognition HTTPS, stockage anti-fingerprinting) : https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- S22b — WebKit, nouveautés WWDC26 / Safari 27 (aucune nouveauté sur vibration, push, wake lock, etc.) : https://webkit.org/blog/17967/news-from-wwdc26-webkit-in-saf
- S26 — WebKit, plafond de 7 jours : https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- S26b — WebKit, prévention du pistage : https://webkit.org/tracking-prevention/
- S36b — WebKit, politique vidéo iOS (autoplay) : https://webkit.org/blog/6784/new-video-policies-for-ios/
- S37b — WebKit, App-Bound Domains (ITP actif dans WKWebView) : https://webkit.org/blog/10882/app-bound-domains/
- S37c — WebKit, getUserMedia en WKWebView (iOS 14.3) : https://webkit.org/blog/11353/mediarecorder-api/

**MDN / W3C / Chrome**
- S5 — MDN, `navigator.vibrate` : https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate
- S12 — MDN, Audio Session API : https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/audio_session_api/index.md ; types : https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/audiosession/type/index.md
- S15 — MDN, Screen Wake Lock API : https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
- S27b — MDN, `DeviceMotionEvent.requestPermission()` : https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/devicemotionevent/requestpermission_static/index.md
- S29 — W3C, Image Capture (contrainte `torch`) : https://www.w3.org/TR/image-capture/ ; MDN `MediaTrackConstraints` : https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints
- S35 — Chrome, Page Lifecycle API : https://developer.chrome.com/docs/web-platform/page-lifecycle-api ; limitation des minuteries (Chrome 88) : https://developer.chrome.com/blog/timer-throttling-in-chrome-88
- S36c — Chrome, politique d'autoplay : https://developer.chrome.com/blog/autoplay ; MDN, bonnes pratiques Web Audio : https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/web_audio_api/best_practices/index.md
- S38c — socket.io, issue #3259 (témoignage de coupure sur Chrome Android) : https://github.com/socketio/socket.io/issues/3259

**Secondaires (à traiter comme « V2 »)**
- S8 — Outil « iOS Haptics Tester » (iOS 17.4–26.4, correctif 26.5) : https://rapidtoolset.com/en/tool/ios-haptics-tester
- S9 — Article WebHaptics : https://azukiazusa.dev/en/blog/ios-safari-web-haptics
- S23 — Guide PWA iOS : https://progressivewebapps.com/platforms/ios-safari/
- S24 — Article PWA iOS 2026 : https://synthetixis.com/writing/pwa-ios-2026
- S25 — Presse, rétablissement des web apps dans l'UE (mars 2024) : https://www.engadget.com/apple-backtracks-on-plans-to-get-rid-of-web-apps-on-iphones-in-the-eu-195232177.html ; https://9to5mac.com/2024/03/01/apple-home-screen-web-apps-ios-17-eu/
- S37 — F. Krause, navigateurs intégrés d'Instagram et Facebook : https://krausefx.com/blog/ios-privacy-instagram-and-facebook-can-track-anything-you-do-on-any-website-in-their-in-app-browser

*Note sur les identifiants : les suffixes (`b`, `c`) désignent une seconde page de la même famille de source ; S16b = ligne Badging, couverte par la source S2.*
