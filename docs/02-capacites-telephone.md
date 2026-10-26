# 02 — Capacités du téléphone : l'étude des signaux

Le public arrive par un QR code sur **une page web** (pas d'application à installer). Tout ce qui suit est donc
ce qu'un **navigateur mobile** permet, en 2026, sur Safari iOS et Chrome Android.

> ⚠️ Les navigateurs évoluent vite et plusieurs points ci-dessous (marqués **à vérifier**) doivent être confirmés
> sur de vrais appareils. Le premier livrable technique proposé est justement une **page « banc d'essai »** qui teste
> chaque capacité sur le téléphone de chacun (voir [09](09-feuille-de-route-et-questions.md)).

## Règles générales qui conditionnent tout

1. **HTTPS obligatoire** pour les capteurs, la caméra, le micro, le Wake Lock, les notifications. GitHub Pages fournit le HTTPS ;
   le serveur temps réel devra aussi être en `wss://` avec un vrai certificat.
2. **Le geste utilisateur** : son, plein écran, permission capteurs (iOS), vibration (selon navigateur) ne s'activent
   qu'à la suite d'un **toucher** de l'utilisateur. D'où l'écran « Toucher pour entrer dans le spectacle » qui sert à tout
   déverrouiller d'un coup (audio, capteurs, plein écran, wake lock).
3. **Page au premier plan** : quand l'écran se verrouille ou qu'on change d'appli, la page est gelée (iOS surtout) et
   la connexion coupe. Les effets n'arrivent alors plus — seules les **notifications push** peuvent réveiller.
4. **Permissions = friction** : chaque demande (caméra, capteurs, notifications) perd des gens. On ne demande que ce
   que le spectacle utilise, au moment du tutoriel, avec une explication.

## Tableau de synthèse

Légende : ✅ fonctionne · ⚠️ partiel / conditions · ❌ impossible · 🔒 permission demandée

| Capacité | Android (Chrome) | iPhone (Safari) | Usage scénique | Repli si absent |
|---|---|---|---|---|
| **Couleur plein écran** (fond CSS) | ✅ | ✅ | mosaïque humaine, signal d'équipe, salle qui s'allume | — (universel) |
| Luminosité de l'écran | ❌ pas d'API | ❌ | — | fond blanc pur = « lampe » ; noir = invisible |
| **Animation / vidéo à l'écran** | ✅ | ✅ | tout | — |
| **Vibration** `navigator.vibrate` | ✅ motifs ms | ❌ non supporté (**à vérifier** en 2026) | alerte, pulsation, « cœur » | flash d'écran + son court ; astuce haptique iOS (case `switch`) seulement au toucher, **à vérifier** |
| **Son** (Web Audio, `<audio>`) | ✅ après un toucher | ⚠️ après un toucher ; le **bouton silencieux** coupe le son Web Audio (contournement possible via `navigator.audioSession`, **à vérifier**) | chœur de téléphones, sons spatialisés, bip de consigne | visuel |
| Synthèse vocale (`speechSynthesis`) | ✅ | ✅ | voix d'un personnage dans la poche | texte |
| **Plein écran** (Fullscreen API) | ✅ sur toucher | ❌ sur iPhone (seulement la vidéo) ; ✅ iPad | supprimer barres du navigateur | **PWA « ajouter à l'écran d'accueil »** = plein écran sur iOS aussi ; sinon mise en page qui tolère la barre |
| Verrouiller l'orientation | ⚠️ seulement en plein écran | ❌ | forcer le portrait | mise en page adaptée + message « tournez le téléphone » |
| **Empêcher la mise en veille** (Wake Lock) | ✅ | ✅ (Safari 16.4+) | **indispensable** : sinon l'écran s'éteint pendant les scènes calmes | vidéo muette en boucle (vieux contournement) |
| **Notification système** (Web Push) | ✅ 🔒 | ⚠️ 🔒 uniquement si la page est **installée sur l'écran d'accueil** (iOS 16.4+) | réveiller un téléphone verrouillé, rappel d'entracte, message d'un personnage après le spectacle | **notification « dans la page »** (bandeau + son + vibration) tant que la page est ouverte — couvre 95 % des besoins pendant le spectacle |
| Pastille sur l'icône (Badging) | ✅ (PWA) | ✅ (PWA) | « 1 message du personnage » | — |
| **Accéléromètre / gyroscope** (DeviceMotion / Orientation) | ✅ | ✅ 🔒 demande explicite au toucher (iOS 13+) | secouer, lever le téléphone, viser, vague, pencher pour choisir, compter des pas | bouton à marteler |
| Boussole (orientation absolue) | ✅ | ✅ (`webkitCompassHeading`) | pointer une direction de la salle | — |
| **Toucher multi-points, glisser, appui long, pression** | ✅ | ✅ | dessin, swipe pour voter, jauge à tenir | — |
| **Caméra** (getUserMedia) | ✅ 🔒 | ✅ 🔒 | stream, selfie projeté, mur de visages, lecture de QR caché dans la salle | upload photo |
| **Micro** | ✅ 🔒 | ✅ 🔒 | niveau sonore (crier pour gagner), message vocal, applaudimètre | bouton |
| Reconnaissance vocale | ✅ | ⚠️ (webkitSpeechRecognition, **à vérifier**) | commande vocale, phrase magique | clavier |
| **Lampe torche / flash** | ⚠️ via la piste caméra (`torch`), 🔒 caméra, appareils compatibles | ❌ | salle qui clignote dans le noir, morse | **écran blanc plein écran** |
| **Partage de vidéo en direct** (WebRTC) | ✅ | ✅ | streamer, spectateur filmé projeté | — |
| Géolocalisation | ✅ 🔒 | ✅ 🔒 | parcours en extérieur, avant spectacle | ❌ **inutile en salle** (précision de 10 à 50 m, pas d'étage) |
| NFC (Web NFC) | ✅ | ❌ | toucher un objet du décor | QR code collé sur l'objet |
| Bluetooth (Web Bluetooth) | ⚠️ | ❌ | balise par siège, accessoire connecté | — |
| Capteur de lumière ambiante | ❌ (désactivé) | ❌ | — | caméra (lourd) |
| Batterie (Battery API) | ⚠️ Chrome | ❌ | alerte régie « batterie faible » | — |
| Visibilité de la page (Page Visibility) | ✅ | ✅ | **savoir qui a quitté / verrouillé** → statut dans la régie | — |
| Presse-papiers, partage natif (Web Share) | ✅ | ✅ | partager un souvenir après le spectacle | — |
| **Clavier virtuel** maîtrisé | ✅ `interactive-widget`, VirtualKeyboard API | ⚠️ via `visualViewport` (calcul de la hauteur) | **cas LIVE** : écrire sans perdre l'écran — voir [06](06-cas-live-streamer.md) | — |
| Stockage local (localStorage, IndexedDB, cookie) | ✅ | ✅ (⚠️ effacé après 7 jours sans visite en navigation Safari) | reconnaissance du téléphone | jeton dans l'URL |

## Les familles de signaux que le studio doit exposer

Chaque famille devient un ou plusieurs **nœuds d'action** dans l'éditeur (voir [03](03-moteur-scenario.md)).
Tous acceptent une **cible** et une **heure d'exécution** (immédiat ou « à T serveur » pour la synchronisation).

### 1. Lumière (écran)
- `couleur(c)`, `fondu(c1→c2, durée)`, `stroboscope(couleurs, fréquence)` — ⚠️ prévoir un **garde-fou épilepsie**
  (limiter à 3 flashs/s, avertissement en début de spectacle).
- `dégradé selon la place` : la couleur dépend de la position du spectateur (siège / zone) → images à l'échelle de la salle.
- `vague` : la même couleur se propage zone par zone avec un délai.
- `noir` : l'écran s'éteint visuellement (fond noir, rien d'autre) — pour les moments où la salle doit être sombre.
- `lampe` : blanc pur + flash si disponible.

### 2. Haptique
- `vibrer(motif)` : motifs nommés (`battement`, `alerte`, `pulsation lente`, `morse(texte)`).
- Repli automatique sur iPhone : flash d'écran bref + clic sonore discret (paramétrable).

### 3. Son
- `jouer(son, volume)`, `boucle`, `stop`, `fondu`.
- `jouer à T` synchronisé sur toute la salle (chœur, canon, son qui « traverse » la salle zone par zone).
- `voix(texte)` via synthèse vocale, ou fichier audio enregistré.
- ⚠️ À dire au public : « mettez le son, sortez du mode silencieux ». Le tutoriel teste le son et affiche qui ne l'a pas.

### 4. Messages
- `notification dans la page` : bandeau animé + son + vibration (fiable tant que la page est ouverte).
- `notification système` (push) : pour réveiller un téléphone verrouillé ou écrire après le spectacle. Exige la PWA sur iOS.
- `message privé` : texte qui n'apparaît que pour la cible (streamer, superviseur, joueur à rôle secret).
- `toast`, `plein écran texte`, `compte à rebours`.

### 5. Interfaces (ce que le joueur peut faire)
Des **écrans types** paramétrables, chacun produisant des événements remontés au serveur :
`attente`, `bouton unique`, `choix (2 à 6)`, `vote pondéré / jauge`, `curseur`, `texte libre (clavier)`, `réactions (emojis)`,
`dessin`, `photo`, `secouer`, `orienter`, `tenir appuyé`, `swipe`, `quiz chronométré`, `classement`, `carte de la salle`.

### 6. Capteurs (ce que le téléphone mesure)
- Secousse (énergie de l'accélération), inclinaison (gauche/droite/avant/arrière), orientation (boussole), téléphone levé / posé,
  rythme (frappes régulières), niveau sonore du micro.
- Les mesures brutes restent sur le téléphone ; on n'envoie que des **valeurs agrégées** (ex. énergie par 200 ms) pour ne pas noyer le réseau.

### 7. Vidéo
- Envoyer sa caméra (streamer, spectateur invité).
- Recevoir un flux (le stream sur le téléphone, ou un replay).
- Afficher une vidéo préenregistrée synchronisée.

### 8. Système et état
- `wake lock`, `plein écran`, `changer de rôle`, `changer d'écran`, `verrouiller l'interface` (plus aucune action possible),
  `recharger l'interface`, `demander une permission`.

## Remontées vers la régie (télémétrie de chaque téléphone)

Pour que la régie sache vraiment si « tout le monde est là » :

| Info | Comment |
|------|---------|
| Connecté / déconnecté | socket ouverte + battement de cœur toutes les 5 s |
| Au premier plan / caché | Page Visibility |
| Latence | aller-retour du battement de cœur |
| Capacités | résultat du tutoriel : son OK, vibration dispo, capteurs autorisés, caméra autorisée, PWA installée |
| Batterie | quand disponible (Android) |
| Dernière action | horodatage |
| Plateforme | iOS / Android, navigateur |

## Contraintes d'accessibilité et d'éthique

- **Photosensibilité** : limiter fréquence des flashs, avertissement, option « réduire les effets ».
- **Spectateurs sans téléphone** ou batterie vide : prévoir quelques téléphones de prêt, et des mécaniques qui ne pénalisent pas.
- **Données personnelles** : pseudo seulement, pas d'e-mail ; photos/vidéos du public projetées = consentement explicite ;
  purge des données après la représentation (RGPD).
- **Lumière dans la salle** : un téléphone à fond blanc éclaire tout le rang. Le mode « noir » doit être l'état par défaut entre les interactions.
