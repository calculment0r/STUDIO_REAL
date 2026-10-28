# Chantier 4 — Médias et performance (vidéos, audio, WebRTC)

Audit du 28/10/2026, branche `audit/2026-10`. Périmètre : le chemin des médias (téléphones, sortie Écran scène, mur)
et les flux WebRTC (streamer du Conducteur, visio Franck ↔ ministre du prototype). Rien n'a été lancé ni modifié hors
de ce rapport. Les médias de `medias-locales/` n'ont été lus que par `ls -la` et `ffprobe` (lecture des en-têtes).

## 1. Résumé

- **Les vidéos n'étaient pas mal encodées.** `flux_insta_jim.mp4` est en H.264, 720×1280, 0,92 Mb/s, avec le `moov`
  en tête (faststart). La lenteur vient du **transport**.
- **Tout passait par un tunnel cloudflared « quick » depuis le PC de régie.** Ce tunnel accepte 200 requêtes en vol
  au plus (documentation Cloudflare). Aucun cache n'était possible : `no-cache`, sans `ETag`.
- **150 téléphones et la sortie tiraient la même vidéo au même top**, par la liaison montante de la salle :
  ≈ 784 Mo, soit plus de 5 min à 20 Mb/s.
- **Rien n'est préchargé ni mesuré** : iOS ignore `preload="auto"`, et les scènes `page` de la sortie sont des
  iframes montées au moment du top. Le `precharger` de la sortie ne voit que les clips de piste, et Écho simple n'en
  a aucun.
- **La visio est fragile et ouverte.** STUN seul (pas de TURN), aucune reprise, aucun réglage de débit, aucun
  pilotage. N'importe qui peut s'y annoncer « ministre » sans jeton.
- **Le Conducteur a déjà une pile WebRTC mûre** (`src/flux` et `src/streamer` : H.264, TURN configurable, reprise,
  statistiques), que la visio n'utilise pas.
- **Cible proposée :**
  - médias versionnés et cachables, servis par le **serveur de salle**, avec **R2 sur un domaine** en repli ;
  - préchargement piloté par le projet, avec un état « prêt » remonté et la règle « 95 % prêts » avant le top ;
  - encodage normalisé par un script `ffmpeg` ;
  - visio refaite sur `src/flux`, avec un **TURN Cloudflare** (≈ 0 € par représentation) et pilotée par un nœud
    « visio » du Conducteur.

## 2. Constats

### 2.0 Diagnostic des démarrages lents, chemin par chemin

#### Téléphone ← tunnel quick ← Node (prototype) ← disque (fil Insta)

Ce qui se passe au premier `play()` :

1. **Préchargement au `welcome`.** Le serveur envoie `tel {video:'/medias-locales/flux_insta_jim.mp4'}`. La page pose
   `src` et appelle `load()`, avec `preload="auto"`. Android met en tampon une partie de la vidéo, selon le navigateur
   et l'économiseur de données. **iOS Safari ignore ce préchargement** sans geste de l'utilisateur : il ne charge rien,
   ou seulement les métadonnées.
2. **Au top « FLUX INSTA »**, `jouerFlux()` lance la lecture **avec son**. Sur iPhone c'est refusé, puis rejoué en
   muet : deux allers-retours.
3. **Chaque lecture enchaîne des requêtes `Range`.** iOS sonde `bytes=0-1`, puis demande des plages. Chacune fait
   Internet → Cloudflare → tunnel → PC de régie, sans cache possible (`cache-control: no-cache`, sans `ETag` ni
   `Last-Modified`).
4. **150 téléphones démarrent ensemble.**
   - Pour une lecture fluide, il faudrait 150 × 0,92 Mb/s ≈ **138 Mb/s**.
   - Au total, 150 × 5,23 Mo ≈ **784 Mo** sortent par la liaison montante du PC.
   - À 20 Mb/s montants, il faut ≈ 5 min 15 ; à 50 Mb/s, ≈ 2 min.
5. **La limite du tunnel quick est atteinte** : 200 requêtes en vol au plus, au-delà HTTP 429. 150 WebSocket
   ouverts plus 150 plages vidéo la dépassent.

Preuves : `serveur/jeu.mjs:194` ; `pages/echo/echo.js:149`, `:159-167` ; `pages/echo/index.html:54` ;
`serveur/index.mjs:113`, `:126-127` ; documentation TryCloudflare (« Each Quick Tunnel supports up to 200 in-flight
requests »).

#### Sortie ← iframe ← tunnel (mur, flux, visio)

1. **L'iframe de la scène `page` est créée au top**, sans préchargement. La couche devient visible après 2 images (ou
   100 ms), quel que soit l'état de l'iframe : on voit du noir pendant le chargement.
2. **L'iframe charge tout par le tunnel** : la page, `theme.css` et ses 7 `@import` en cascade, les polices, le JS,
   puis le WebSocket.
3. **La page `flux/` lit la même vidéo par le tunnel**, au même top que les 150 téléphones : au pire moment de
   l'embouteillage. Elle n'utilise pas les médias locaux de la sortie.
4. **Un passage mur → noir → mur remonte l'iframe et recharge tout** (étapes `b4_notif` puis `b5_*`). Entre deux
   scènes identiques, l'iframe n'est pas remontée (comparaison JSON).

Preuves : `sortie/scenes.tsx:133-135`, `:98-104` ; `sortie/page.tsx:140-143` ; `pages/flux/index.html:15-18` ;
`projets/echo/generer-echo-simple.ts:66-71` ; `packages/theme/theme.css` (7 `@import`).

#### Sortie ← vidéo locale (scène `video`)

- Ce chemin est sain : `PoolVideos` crée des `<video preload=auto muted playsinline>` cachés, puis les prend tels
  quels à la bascule.
- **Il n'a pas servi le 27/10.** `aPrecharger()` ne regarde que les clips de la piste vidéo, et Écho simple a
  `tracks: []`. Aucune scène `video` n'était posée : tout passait en `page`.
- Sans précharge, la vidéo serait créée au top et chargée à froid, depuis le disque (rapide) ou par `/medias-locales/`
  du serveur de dev.

Preuves : `sortie/videos.ts:30-48`, `:60-62` ; `sortie/traduction.ts:179-191` ; `generer-echo-simple.ts:95`.

#### Mur ← audio de Junon et du président

- Le `src` de l'`Audio()` est posé **au moment du `play`** (2 Mo puis 1 Mo, par le tunnel), sans précharge.
- Le bouton « Cliquer ici pour autoriser le son du mur » reste projeté tant que personne n'a cliqué.

Preuves : `pages/chat/chat.js:30-40` ; `serveur/jeu.mjs:261-274`.

### Constats numérotés

**C1 — Toute la distribution des médias passe par un tunnel quick depuis le PC de régie (P0).**
- Preuves :
  - les téléphones lisent `/medias-locales/…` sur l'origine du tunnel (`jeu.mjs:194`) ;
  - la sortie charge `https://highway-regions-temperatures-penn.trycloudflare.com/…` en iframe
    (`generer-echo-simple.ts:66-71`) ;
  - le serveur expose `medias-locales/*.mp4` et deux mp3 au tunnel (`serveur/index.mjs:72`) ;
  - la documentation Cloudflare des tunnels quick : « no uptime guarantee », 200 requêtes en vol au plus.
- Chaque octet sort du PC de régie par la liaison montante de la salle, puis revient vers des téléphones souvent
  assis dans la même salle : un aller-retour complet par Internet.
- Impact le 27/10 : vidéos lentes sur les téléphones et sur la sortie, tunnel à recoller partout.

**C2 — Aucun cache possible (P0).**
- Preuves : `cache-control: no-cache` sans `ETag` ni `Last-Modified` sur tout ce que sert le prototype : pages, thème,
  polices, vidéos (`serveur/index.mjs:113`, `:126-127`). Même chose pour le serveur de dev Vite
  (`apps/conducteur/vite.config.ts:57-74`).
- Un rechargement ou une relecture retélécharge tout, et Cloudflare ne peut rien garder.
- Les noms de fichiers ne sont pas versionnés : on ne peut donc pas non plus servir en `immutable`.

**C3 — Tout le monde télécharge au même top (P0).**
- Preuves :
  - le top « FLUX INSTA » envoie `tel.cmd mode:'flux'` à **tous** les téléphones (`jeu.mjs:203-209`) ;
  - ils lancent `play()` en même temps (`echo.js:155`) ;
  - la sortie charge la page `flux/` au même instant (`generer-echo-simple.ts:70`).
- Avec le fil prévu par le LISEZMOI (10 vidéos, 3:10, ≈ 38 Mo par téléphone), le volume monterait à **5,7 Go**
  (`projets/echo/LISEZMOI.md:125-127`) : intenable par un tunnel.

**C4 — Le préchargement des téléphones n'est ni fiable ni mesuré (P1).**
- Preuves :
  - le seul préchargement est `video.src = …; video.load()` au `welcome` (`echo.js:149`), que iOS ignore ;
  - aucun état « prêt » ne remonte à la régie ;
  - le LISEZMOI le note comme manquant (`LISEZMOI.md:147-148`) ;
  - la règle « GO quand 95 % des téléphones ont préchargé » (`LISEZMOI.md:54`) n'est câblée nulle part.

**C5 — La lecture sur iPhone est mal gérée (P1).**
- **Le son est tenté d'abord** (`echo.js:162`), à l'inverse de la décision « son coupé par défaut »
  (`LISEZMOI.md:27-29`, `:109`). Sur Android, l'activation déjà acquise (le pseudo a été tapé) peut faire partir le
  son de dizaines de téléphones à la fois.
- **En mode économie d'énergie, iOS refuse même la lecture muette.** Le téléphone reste noir, avec un bouton
  « Toucher pour le son » qui induit en erreur (`echo.js:163-166`).
- **Aucun déblocage par geste pendant l'accueil**, alors que le toucher qui valide le pseudo le permettrait.
- **Pas de Wake Lock sur la page du public** : écran verrouillé, page gelée, WebSocket perdu.

**C6 — La sortie ne précharge pas ses pages, et `precharger` ne voit pas les scènes `page` (P1).**
- Preuves : `scenes.tsx:133-135` ; `traduction.ts:116` (« vote, page → null ») ; `traduction.ts:179-191` ;
  `relais.ts:260-265`.
- La sortie ne dit pas non plus à la régie qu'un média est **prêt** : `present.etat` ne connaît que `absent`
  (`page.tsx:106-113`).

**C7 — L'audio du mur est chargé au dernier moment (P1).**
- Preuve : `chat.js:38-40`. Le discours de Junon (≈ 2 Mo, 1:40) part du tunnel au moment du top.
- Le bouton d'autorisation du son est visible à l'écran (`chat.js:34-37`).

**C8 — Le chemin R2 prévu n'est pas utilisable pour le public (P1).**
- Le LISEZMOI a décidé que les vidéos des téléphones viendraient de R2 (`LISEZMOI.md:27-29`). En l'état :
  - le Worker n'a **jamais été déployé** ;
  - la lecture exige le **jeton du projet**, en en-tête ou en `?jeton=` (`apps/serveur/README.md:58-59`,
    `src/index.ts:217-219`). Ce jeton donne aussi le droit d'**écrire** dans le projet : impossible de le distribuer
    à 150 téléphones ;
  - `cache-control: private, max-age=60` (`src/index.ts:225`) empêche le cache du CDN : chaque plage réveille le
    Worker et relit R2 ;
  - un `fetch()` de préchargement depuis une autre origine reçoit 403 si cette origine n'est pas dans
    `ORIGINES_AUTORISEES` (`src/http.ts:29-34`).
- Ce qui est déjà bon : `Range`, `ETag`, `If-None-Match`, `nosniff`, `sandbox`, et 50 Mo par média suffisent.

**C9 — L'encodage n'est pas normalisé (P2).** Mesures `ffprobe` du 28/10 :

| Fichier | Taille | Vidéo | Audio | Faststart | Remarques |
|---|---|---|---|---|---|
| `flux_insta_jim.mp4` | 5,23 Mo | H.264 Main@3.1, 720×1280, 24 i/s, 0,91 Mb/s, yuv420p | AAC-LC 48 kHz stéréo, **2 kb/s** (quasi silence) | **oui** (`moov` à l'octet 40) | piste de données `tmcd` inutile ; **une image clé toutes les 10,4 s** (positionnement lent) ; 45 s au lieu du fil de 10 vidéos prévu |
| `test-h3.mp4` | 2,14 Mo | H.264 High@3.1, 1312×512, 24 i/s, 1,0 Mb/s | AAC 32 kHz, 131 kb/s | oui | vidéo d'essai du streamer |
| `junon_discours.mp3` | 2,00 Mo | — | MP3 160 kb/s stéréo, 1:40 | — | |
| `president_boilot_speech.mp3` | 0,99 Mo | — | MP3 128 kb/s mono, 1:01 | — | |

- Aucun script ne vérifie le format conseillé (`LISEZMOI.md:108-110`).
- Le prochain fichier livré tel quel peut casser la lecture sur iPhone ou peser 10 fois plus : par exemple un export
  de téléphone en HEVC, ou en 1080p à 15 Mb/s avec le `moov` en fin de fichier.

**C10 — Trois façons divergentes de servir `medias-locales/` (P2).**
- **Vite** sert tout type, liste JSON comprise (`vite.config.ts:42-81`).
- **`essai-reel.mjs`** copie le dossier dans `dist/` (`essai-reel.mjs:48-70`). `dist/medias-locales` est **déjà
  périmé** : 2 fichiers sur 5 au 28/10. Les Workers Static Assets limitent sans doute chaque fichier à 25 Mio
  (à vérifier).
- **Le prototype** n'autorise que mp4, jpg, png, webp et **deux** mp3 nommés (`serveur/index.mjs:72`). Un nouveau son
  (les `*.wav` du LISEZMOI §2) recevrait un 404 sans explication.

**C11 — La visio n'a pas de TURN (P0 pour la prochaine fois).**
- Elle n'a que deux serveurs STUN (`pages/visio/visio.js:11`). Elle casse donc :
  - en 4G/5G derrière un CGNAT symétrique ;
  - sur un Wi-Fi avec isolation des clients, que recommande pourtant `docs/etudes/reseau-salle.md:115-120` ;
  - sur un réseau qui filtre l'UDP.
- Le Conducteur sait déjà ajouter un TURN par configuration (`src/flux/ice.ts:1-8`, `:70-80`) et obtenir des
  identifiants **éphémères** Cloudflare (`src/streamer/essai-reel.mjs:125`). La visio n'en profite pas.

**C12 — Les adresses mDNS ne sont pas débloquées sur l'écran scène (P1).**
- Sur un même réseau local, Chrome masque l'adresse IP du PC derrière un `xxx.local` que l'iPhone ne résout pas.
  Le correctif existe dans le Conducteur (`src/flux/recepteur.ts:80-95`, « vu à l'essai réel du 27/10 »).
- La page `visio/scene.html` ne demande jamais le micro, donc ne profite pas de ce correctif. Le cas « Franck sur le
  Wi-Fi de la salle, PC de scène sur le même réseau » dépend alors d'un STUN en épingle (NAT loopback), que beaucoup
  de box refusent.

**C13 — Pas de reprise propre (P1).**
- `onconnectionstatechange` ne fait qu'afficher l'état (`visio.js:33`) : pas de `restartIce()`, pas de nouvelle offre
  quand la liaison passe en `failed`.
- À chaque reconnexion du WebSocket (tunnel qui tousse), `present` est renvoyé (`visio.js:21`). Tous les pairs
  **recréent** alors leurs `RTCPeerConnection` (`visio.js:47-48`, `:28-29`), même ceux qui marchaient : c'est la
  reprise elle-même qui coupe l'image.
- Il n'y a pas de numéro de négociation. Un candidat ICE ou une réponse d'une ancienne liaison peut s'appliquer à la
  nouvelle. Comparer avec le `n` de `src/flux/protocole.ts:10-12`.

**C14 — La qualité n'est pas maîtrisée (P1).**
- Pas de préférence de codec, alors que `src/flux/codec.ts` existe. Pas de `maxBitrate`.
- Le téléphone de Franck **encode deux fois** en 720p, pour la scène et pour la ministre (`visio.js:10`, `:41`,
  `:75`), sans réduction adaptative. Comparer avec `streamer/emetteur.ts:72-80`, `:221`, `:297-304`.
- Pas de Wake Lock ni de reprise au retour au premier plan (comparer `emetteur.ts:320`, `:365`). Si l'écran de Franck
  ou de la ministre se verrouille, iOS coupe la caméra et ne la rend pas.

**C15 — Qui entend quoi : implicite et dangereux (P1).**
- **Risque de Larsen.** Le micro de Franck est envoyé à la scène, où il est seulement **coupé à la lecture**
  (`visio/scene.html:16`), par un bouton projeté (`visio.js:89-94`). Un clic suffit : le micro de Franck capte la
  sono.
- **Écho pour la ministre** (déduction). Le micro de Franck, sur scène, capte aussi la voix de la ministre diffusée
  par la sono et la lui renvoie avec retard. L'annulation d'écho de son téléphone ne retire que ce que son propre
  haut-parleur joue.
- **Aucun réglage du son** : ni niveaux, ni choix de la sortie audio.
- **Son bloqué possible.** Si la lecture avec son de `v_ministre` est refusée, le bouton « activer le son de la
  ministre » apparaît **dans l'iframe projetée** (`visio.js:66`).

**C16 — La visio ne se pilote de nulle part (P1).**
- Aucune commande de visio, ni dans la régie figurants (`regie.js:565` met seulement l'écran au noir), ni dans le
  Conducteur.
- Les pages s'ouvrent à la main sur chaque appareil (`generer-echo-simple.ts:51-52`, champ `outil`) et se mettent
  en plein écran à la main.
- La régie ne voit que « visio : X connecté » (`jeu.mjs:243`) : ni l'état de la liaison, ni le chemin, ni l'aperçu.
- La barre de commandes reste projetée à 25 % d'opacité (`visio/visio.css:28`).
- Impact le 27/10 : « visio réglable nulle part dans l'interface ».

**C17 — La signalisation est ouverte à tous (P1, sécurité).**
- Le rôle `visio` ne demande aucun jeton (`jeu.mjs:10`, `:366-369` : seul `regie` est contrôlé). Le message `present`
  accepte n'importe quel poste (`jeu.mjs:235-243`).
- L'adresse du tunnel est sur le QR du public, et `pages/visio/ministre.html` y est servie (`index.mjs:72`).
  **N'importe quel spectateur peut s'annoncer « ministre » et afficher sa caméra sur l'écran de scène.**
- Point secondaire (P2) : le plafond de 40 messages/s (`jeu.mjs:336-338`) peut jeter sans bruit une rafale de
  candidats ICE. `maxPayload` à 64 Ko suffit, une offre SDP fait 5 à 10 Ko.

**C18 — Deux piles WebRTC font le même travail (P2).**
- D'un côté `src/flux` + `src/streamer` (≈ 1 700 lignes, testées : `flux.test.ts`, `integration.edge.test.ts`).
  De l'autre `pages/visio/visio.js` (100 lignes, sans test).
- La seconde a été écrite à côté, à 17:40 le jour du spectacle (`7259daf`).

## 3. Risques au prochain spectacle si rien ne change

1. **Le fil Insta complet (10 vidéos) par le tunnel échouera.** 5,7 Go à faire passer, des 429 au-delà de 200
   requêtes, des téléphones noirs. Le passage automatique « 80 % ont fini le fil » n'arrivera jamais.
2. **Une nouvelle adresse de tunnel casse la sortie.** Ses iframes visent l'ancienne adresse
   (`generer-echo-simple.ts:66`) : écran noir, ou page d'erreur Cloudflare projetée.
3. **Ministre en 4G ou Wi-Fi isolé** : la visio ne s'établit pas, et il n'y a pas de plan B sans TURN.
4. **Franck verrouille son téléphone, ou le WebSocket se reconnecte** : image coupée 5 à 30 s, ou figée pour de bon.
5. **Un clic malheureux sur « son de Franck »** : Larsen dans la salle.
6. **Un spectateur ouvre `visio/ministre.html`** et s'affiche en grand sur la scène.
7. **Une vidéo livrée en HEVC, en 4K ou sans faststart** : lecture impossible ou très lente sur une partie des
   téléphones.
8. **Des iPhone en économie d'énergie** (fréquent en soirée) : vidéo noire pour une partie du public, sans que la
   régie le sache.

## 4. Proposition cible

### 4.1 Où vivent les médias

```
 PRÉPARATION (une fois)
   fichiers source
     └─► normaliser.ps1 (ffmpeg) + verifier-medias.mjs
           └─► nom versionné (fil-01.a3f9c2.mp4) + manifeste medias.json
                 ├─► copié sur le SERVEUR DE SALLE (Node, disque local)
                 └─► téléversé dans R2 « medias », servi par medias.<domaine> (cache CDN Cloudflare)

 REPRÉSENTATION
   SERVEUR DE SALLE : /m/<nom-versionné>, Range + ETag, Cache-Control: public, max-age=1 an, immutable
     ├─► téléphones en Wi-Fi de la salle (réseau local : latence quasi nulle, débit du Wi-Fi)
     └─► sortie Écran scène (dossier local)
   R2 + CDN (medias.<domaine>)
     └─► téléphones en 4G, et repli si le réseau local échoue
```

- **Noms versionnés et immuables** : `<nom>.<sha256 sur 8 caractères>.mp4`, plus un manifeste par projet
  (`medias.json` : `{nom, fichier, taille, sha256, duree, type, cible: 'telephones'|'sortie'|'mur'}`). Un média modifié
  change de nom. On peut donc servir `Cache-Control: public, max-age=31536000, immutable` partout, et le navigateur
  comme le CDN gardent le fichier.
- **Ordre des sources dans la page du téléphone** :
  1. le serveur de salle, sur la même origine (architecture hybride « une URL » de `docs/etudes/reseau-salle.md` §5.2) ;
  2. sinon `https://medias.<domaine>/…` : R2 public derrière un domaine du studio, avec le cache du CDN.
  - On bascule de 1 à 2 après 3 s sans premier octet.
  - **Jamais par un tunnel quick.**
- **R2** :
  - un bucket public **en lecture seule** sur domaine personnalisé, plutôt que la route à jeton
    `/api/projets/:id/medias`. Celle-ci reste pour le téléversement et l'administration ;
  - CORS `GET, HEAD` pour l'origine du spectacle, pour que le `fetch()` de préchargement et `Timing-Allow-Origin`
    fonctionnent ;
  - **pas de `r2.dev`**, réservé au développement et limité en débit ;
  - si les médias doivent rester privés : URL signées à durée courte, émises par le serveur de spectacle pour chaque
    lot de préchargement.
- **Sortie Écran scène** : en local uniquement, par la `BibliothequeMedias` existante (dossier choisi, touche M),
  avec les **mêmes noms versionnés**. La page `flux/` en iframe devient une scène native `video` (`asset`,
  `boucle:false`, `son`) ; le signal `fin-video` existe déjà.
- **Mur et audio** : préchargés comme les vidéos. `Audio().src` est posé au préchargement, pas au moment du `play`.

### 4.2 Préchargement explicite, piloté par le projet, avec un état « prêt »

Messages à intégrer au **protocole unique du serveur de spectacle** (c'est le chantier protocole ; ci-dessous,
seulement l'intention) :

| Message | Sens | Contenu |
|---|---|---|
| `medias.lot` | serveur → téléphones (et sortie) | `{lot:'fil', medias:[{fichier, sources[], taille, sha256}], priorite, avant?:<étape>}`, envoyé au `welcome` et quand le projet l'ordonne |
| `medias.etat` | téléphone → serveur | `{lot, octets, total, prets, nb, methode:'cache'\|'blob'\|'tampon', erreurs[]}`, à 0, 25, 50, 75 et 100 %, puis toutes les 10 s si rien ne bouge |
| `medias.salle` | serveur → régie / Conducteur | `{lot, connectes, prets, pct, lents:[{pseudo, pct, source}], debitMoyen}`, toutes les 2 s |
| signal moteur | serveur → lecteur | `medias.prets_pct` (0 à 100), lisible par un garde-fou `sigv:medias.prets_pct >= 95`. La règle de l'accueil (`LISEZMOI.md:54`) devient câblable. |

**Côté téléphone (on conçoit pour l'iPhone d'abord) :**

1. **Préchargement** : `fetch(source)` vers le **Cache Storage** (`caches.open('medias-v1')`), qui survit à un
   rechargement et au gel d'iOS. La progression se lit sur le flux. Vérification du `sha256` en option (coût faible
   pour 5 à 40 Mo).
2. **Lecture** : `caches.match()` → `Blob` → `URL.createObjectURL()` → `video.src`. **Ni Range ni réseau au moment du
   top** : le premier `play()` part de la mémoire.
3. **Repli** si le Cache Storage est indisponible (navigation privée) : `video.preload='auto'` sur la source réseau.
   « Prêt » se mesure alors par `video.buffered.end(0) >= duration - 0,5`.
4. **Concurrence** : 2 téléchargements au plus par téléphone. Chaque téléphone démarre à un moment tiré au hasard
   entre 0 et 20 s après le `medias.lot`, pour lisser la pointe.

**Côté sortie :**

- Étendre `precharger` à `{assets, pages}`. La sortie garde un réservoir d'**iframes cachées, montées d'avance**
  (clé : l'URL), et les **prend** à la bascule, comme `PoolVideos` le fait pour les vidéos.
- Remonter `present.etat.precharges: {asset: 'pret'|'charge'|'absent'}`.
- `aPrecharger()` lit aussi les `params.sortie` des étapes suivantes, pas seulement les clips de piste.

### 4.3 Règles de la page du public pour l'iPhone

1. `<video muted playsinline webkit-playsinline preload="auto">`. Lecture **toujours muette d'abord** (décision du
   propriétaire), puis un bouton « 🔊 ». Le serveur ne lance jamais une lecture avec son.
2. **Déblocage par geste.** Dans le gestionnaire du toucher « Valider le pseudo », appeler `v.play()` puis `v.pause()`
   sur l'unique élément `<video>`, qu'on **réutilise** ensuite (on change `src`, pas l'élément). iOS autorise alors le
   `play()` déclenché plus tard par le serveur. Même chose pour un `Audio` si les téléphones jouent du son.
3. **Si `play()` est rejeté** (économie d'énergie) : afficher en plein écran « Touchez l'écran pour lancer la vidéo »,
   et remonter `lecture.bloquee` à la régie, qui voit combien de téléphones sont concernés.
4. **Wake Lock pendant le spectacle** : `navigator.wakeLock.request('screen')`, repris sur `visibilitychange`.
5. **Un seul élément vidéo par téléphone** : iOS limite le nombre de décodeurs actifs.
6. **`Range` reste obligatoire pour la source réseau** (le serveur de salle et R2 le gèrent déjà), mais pas en `blob:`.

### 4.4 Encodage de référence (script `outils/medias/normaliser.ps1`, à écrire)

Pour les téléphones (9:16, 720p) :

```powershell
ffmpeg -hide_banner -y -i "$entree" `
  -map 0:v:0 -map 0:a:0? -map_metadata -1 -dn -sn `
  -vf "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p" `
  -c:v libx264 -profile:v main -level:v 3.1 -preset slow -crf 23 -maxrate 1800k -bufsize 3600k `
  -g 60 -keyint_min 60 -sc_threshold 0 `
  -c:a aac -b:a 96k -ac 2 -ar 48000 `
  -movflags +faststart "$sortie"
```

- **Sortie Écran scène (16:9)** : `scale=1920:1080`, `-profile:v high -level:v 4.1 -crf 20 -maxrate 8M -bufsize 16M`,
  `-b:a 192k`.
- **Sons** : mp3 à 128 kb/s, ou AAC dans un `.m4a`.
- **Ce que garantissent ces réglages** :
  - une image clé toutes les 2 s : démarrage et positionnement rapides ;
  - pas de piste `tmcd` ;
  - `moov` en tête du fichier ;
  - un débit plafonné, ≈ 1,2 à 1,6 Mb/s, soit ≈ 10 Mo par minute.
- **`outils/medias/verifier-medias.mjs`** lit `ffprobe` en JSON et refuse tout fichier qui :
  - n'est pas en H.264 + AAC ;
  - a son `moov` après le `mdat` ;
  - dépasse 720p ou 2 Mb/s pour les téléphones ;
  - espace ses images clés de plus de 2 s.

  Il écrit aussi le manifeste `medias.json` (sha256, nom versionné).

### 4.5 Débit à prévoir pour 150 téléphones

| Cas | Volume | Débit moyen sur 10 min d'accueil | Commentaire |
|---|---|---|---|
| 27/10 : une vidéo de 45 s (5,2 Mo) | 0,78 Go | 10,5 Mb/s | facile **si le téléchargement est étalé** ; c'est le top synchrone qui a tout cassé |
| Fil prévu : 3:10 en 720p (≈ 38 Mo) | 5,7 Go | 76 Mb/s | par le Wi-Fi local s'il est bien dimensionné (8 bornes, voir `reseau-salle.md`), ou par le CDN en 4G ; **jamais par la liaison montante de la salle** |
| Même fil en 1080p | ≈ 14 Go | 190 Mb/s | à éviter |

### 4.6 WebRTC cible (la visio, et à terme toute vidéo en direct)

**Une seule pile** : `src/flux` (protocole, codec, ICE, statistiques, mire) et `src/streamer` (émetteur), étendus.
- La visio devient un cas général : **N participants qui publient, M récepteurs**, en pair-à-pair (maillage).
- Avec 2 ou 3 participants, un SFU n'apporte rien. On passera à Cloudflare Realtime SFU ou à LiveKit
  (`docs/etudes/video-streamer.md`) au-delà de 4 participants, ou s'il faut enregistrer.

**Signalisation** : dans le protocole unique du serveur de spectacle, sur le modèle de `src/flux/protocole.ts`
(`annonce`, `recherche`, `offre`, `reponse`, `candidat`, `fin`, avec numéro de négociation `n` et `canal`), plus :
- **un rôle à jeton pour publier** (`participant:<id>`, par un lien signé de la régie). Les téléphones du public n'ont
  jamais ce droit ;
- `vers` désigne une session, **pas** un nom de poste déclaré par le client ;
- le serveur tient la table des participants (état, chemin, statistiques résumées remontées toutes les 2 s) et la
  diffuse à la régie.

**STUN/TURN** (comparaison sans rien déployer) :

| Option | Coût | Mise en place | Verdict |
|---|---|---|---|
| **Cloudflare Realtime TURN** | 0,05 $/Go sortant ; gratuit avec le SFU Cloudflare ; une source tierce cite 1 000 Go/mois gratuits (à confirmer). Pour une visio de 4 min à 3 flux (≈ 2 + 0,8 + 1,5 Mb/s), **même entièrement relayée** : ≈ 0,13 Go, soit **moins de 0,01 $ par représentation** | 1. Le propriétaire crée une clé TURN (tableau de bord › Realtime › TURN).<br>2. Le serveur de spectacle appelle `POST https://rtc.live.cloudflare.com/v1/turn/keys/<id>/credentials/generate-ice-servers` (code déjà écrit dans `essai-reel.mjs:125-160`) et donne aux pages des identifiants **éphémères**, valables 6 à 24 h. Retirer les URL en port 53.<br>3. Ports : UDP 3478 et 443, TCP 3478 et 80, **TLS 5349 et 443** (ce dernier passe les Wi-Fi filtrants). | **Retenu** |
| Metered | 500 Mo/mois gratuits ; 99 $/mois pour 150 Go (relevé du 28/10, à reconfirmer) | identifiants par API | plan B seulement |
| coturn auto-hébergé | VPS à ≈ 5-10 €/mois, plus un certificat TLS et un domaine | IP publique, UDP 49152-65535, TLS sur 443 | inutile au prix de Cloudflare |
| coturn sur un DGX | — | **non** : pas d'IP publique (Tailscale), pas d'UDP entrant, et les DGX sont réservés à d'autres usages les soirs de représentation (`video-streamer.md:303-305`) | écarté |

**Configuration des pages** :
- `iceServers` = STUN Cloudflare + TURN en UDP, TCP et TLS ;
- `bundlePolicy:'max-bundle'` ;
- `?relais=1` pour vérifier le relais en répétition ;
- côté récepteur (PC de scène), déblocage mDNS **avant** l'offre.

**Qualité** :

| Liaison | Résolution et débit | Réglage |
|---|---|---|
| ministre → scène | 720p30, `maxBitrate` 2 Mb/s | `degradationPreference:'maintain-resolution'` (un visage projeté en grand) |
| Franck → scène | 720p30, 1,5 Mb/s, **image seule, sans piste audio** | supprime le risque de Larsen à la source |
| Franck → ministre | 480p, 0,8 Mb/s + Opus mono 32 kb/s | |
| tout participant → aperçu régie | 180p, 0,2 Mb/s, 15 i/s | |

- Codec H.264 en tête (`codec.ts`) et réduction adaptative d'`emetteur.ts`.
- **Pas de simulcast** : en pair-à-pair, chaque liaison a son propre encodage, réglé par destination avec
  `setParameters`.

**Qui entend quoi** : une matrice dans le nœud « visio », appliquée à la source (la piste n'est pas envoyée) et au
récepteur (l'élément est coupé).

| Source | Sono de la scène | Oreille de la ministre | Oreille de Franck |
|---|---|---|---|
| Micro de la ministre | ON | — | par la sono |
| Micro de Franck | OFF | ON | — |

Conseiller une oreillette filaire à la ministre, pour qu'elle ne s'entende pas en retour par le micro de Franck.

**Reprise** :
- liaison `disconnected` pendant 4 s → `pc.restartIce()` et nouvelle offre `iceRestart` sur la même liaison ;
- liaison `failed` → nouvelle liaison, avec un nouveau `n` ;
- une reconnexion du WebSocket **ne recrée pas** les liaisons saines ;
- Wake Lock et reprise de la caméra au retour au premier plan, comme dans `emetteur.ts` ;
- participant perdu depuis plus de 5 s : la scène affiche un **repli choisi dans le nœud** (photo + « connexion… »,
  ou la vidéo précalculée `zoom_junon.mp4` que prévoyait la décision n° 2, `LISEZMOI.md:30-33`), et la régie voit
  une alerte rouge.

**Nœud « visio » du Conducteur** (un bloc du modèle et son panneau) :
- **Paramètres** : `participants[{id, nom, appareil, publie:[scene, …], repli}]`, la matrice du son, la disposition
  (côte à côte, plein écran ministre, vignette) et le débit.
- **Panneau** :
  - un lien ou QR **signé** par participant : on n'ouvre plus les pages à la main ;
  - pour chaque participant : état (connexion, direct, coupé), chemin (local, Internet, relais), images/s, débit,
    aperçu 180p ;
  - commandes : couper le micro ou l'image à distance (`visio.cmd`), relancer la liaison, passer au repli.
- **Sortie** : elle affiche une scène native `visio` à la place de l'iframe `scene.html`. Les boutons de réglage
  restent dans le Conducteur : rien n'est projeté.

### 4.7 Banc de mesure reproductible

Objectif : chiffrer **avant et après** le temps jusqu'à la première image (TTFF) et les blocages.

- **`outils/banc-media/banc.html`** : page statique, ouverte par QR sur de vrais téléphones.
  - Paramètres : `?src=<url>&mode=froid|tampon|cache&n=<répétitions>`.
  - Mesures :
    - `fetchStart` et premier octet (`PerformanceResourceTiming.responseStart`, avec `Timing-Allow-Origin` côté R2) ;
    - `loadedmetadata`, `canplay` ;
    - **première image** (`requestVideoFrameCallback`, ou à défaut `playing` puis le premier `timeupdate`) ;
    - durée passée en `waiting`, octets transférés ;
    - durée du préchargement complet en mode `cache`.
  - Résultat en JSON : affiché, copiable, et envoyé au serveur de banc s'il existe. Il précise l'appareil, le
    navigateur, le réseau, l'économie d'énergie et `navigator.connection`.
- **`outils/banc-media/charge.mjs`** : Node, sans dépendance.
  - Simule N clients simultanés (1, 20, 50, 150) qui rejouent le motif de Safari : `bytes=0-1`, puis des plages de
    1 Mo.
  - Mesure le débit total, le TTFB p50 et p95, et compte les 429 et les 5xx.
  - Trois cibles comparées : **tunnel quick, serveur local, R2 + CDN**.
- **`outils/banc-media/emulation.mjs`** : Edge sans tête piloté par CDP (même méthode que
  `src/flux/integration.edge.test.ts`).
  - Réseau simulé par `Network.emulateNetworkConditions` : « 4G rapide » (9 Mb/s, 170 ms) et « 3G » (1,6 Mb/s,
    300 ms).
  - Émulation d'un iPhone, puis ouverture de `banc.html`.
  - Résultats dans `outils/banc-media/resultats/<date>.jsonl`, hors git.
- **Pour la sortie** : horodater de la réception du message `scene` jusqu'à la première image (`present.etat.ttff`).
- **Pour le WebRTC** : réutiliser la **mire** (`src/flux/mire.ts`) pour la latence de bout en bout. Mesurer aussi le
  temps d'établissement (de `present` à `connected`) et le chemin ICE, en STUN seul puis avec `?relais=1`.
- **Critères d'acceptation proposés** :
  - média préchargé : TTFF p95 sous 300 ms sur iPhone ;
  - à froid sur le réseau local : TTFF p95 sous 1,5 s ;
  - 150 clients simulés sans aucun 429 ni 5xx ;
  - visio établie en moins de 5 s en 4G avec TURN, et reprise en moins de 8 s après une coupure Wi-Fi de 10 s.

## 5. Lots de travail proposés

| Lot | Objectif | Fichiers | Taille | Dépend de | Exécutant conseillé |
|---|---|---|---|---|---|
| **L1** Retouches rapides du prototype (seulement s'il rejoue) | `ETag` + `Last-Modified` + 304 ; `Cache-Control: public, max-age=86400` pour `medias-locales` et le thème ; lecture **muette d'abord** et déblocage au toucher du pseudo ; « Touchez pour lancer » si `play()` est rejeté ; Wake Lock ; `Audio().src` préchargé au `welcome` du mur ; rôle `visio` à jeton | `prototypes/figurants/serveur/index.mjs`, `serveur/jeu.mjs`, `pages/echo/echo.js`, `pages/chat/chat.js`, `pages/visio/visio.js` | S, 4 h | Q7 | Sonnet 5.5 (jeton visio relu par Claude) |
| **L2** Encodage normalisé | `normaliser.ps1`, `verifier-medias.mjs` (ffprobe en JSON, règles du §4.4, manifeste `medias.json` avec sha256 et noms versionnés), courte doc | `outils/medias/*` | S, 3 h | — | Qwen local |
| **L3** Banc de mesure | `banc.html`, `charge.mjs`, `emulation.mjs` ; une première série « tunnel contre serveur local » mesurée **avant** tout changement | `outils/banc-media/*` | M, 6 h | — | Sonnet 5.5 |
| **L4** Hébergement des médias | route `/m/<fichier-versionné>` du serveur de salle (Range, ETag, immutable) ; R2 public sur domaine, avec CORS et `Timing-Allow-Origin` ; outil de téléversement à partir du manifeste ; repli de source côté client | serveur de spectacle (chantier serveur), `apps/serveur/src/index.ts` (URL signées si besoin), `outils/medias/televerser.mjs` | M, 6 h (plus les réglages Cloudflare par le propriétaire) | L2, Q1, Q3 | Claude pour le choix public ou signé, puis Sonnet 5.5 |
| **L5** Préchargement des téléphones avec état « prêt » | messages `medias.lot`, `medias.etat`, `medias.salle` ; cache côté téléphone (Cache Storage → blob) ; agrégat côté serveur ; signal `medias.prets_pct` et garde-fou à 95 % ; jauge dans le Conducteur | protocole unique, page du public, `packages/modele` (signal), panneau du Conducteur | L, 12 h | L4, protocole unique (chantier protocole) | conception Claude, code Sonnet 5.5 |
| **L6** Sortie : tout préchargé, plus aucun média par le tunnel | `precharger` étendu aux `pages` (réservoir d'iframes) ; `aPrecharger()` qui lit les `params.sortie` à venir ; `present.etat.precharges` et `ttff` ; flux Insta en scène `video` native | `apps/conducteur/src/sortie/{protocole,traduction,relais,page,scenes,videos}.ts(x)` et leurs tests | M, 6 h | — | Sonnet 5.5 (tests : Qwen local) |
| **L7** TURN à identifiants éphémères | point d'accès `/ice` du serveur de spectacle (identifiants Cloudflare valables 6 h, port 53 filtré, secret seulement dans l'environnement), lu par `serveursIce()` ; essais avec `?relais=1` | serveur de spectacle, `apps/conducteur/src/flux/ice.ts` | S, 3 h | Q5 (clé créée par le propriétaire) | Sonnet 5.5, relu par Claude (secrets) |
| **L8** Visio v2 sur `src/flux` | participants à jeton, plusieurs émetteurs, débit par destination, Franck → scène en image seule, `restartIce`, pas de recréation à la reconnexion du WebSocket, Wake Lock, déblocage mDNS, repli ; tests de la logique pure (routage, matrice du son) et un test Edge à 3 pairs | `apps/conducteur/src/flux/*`, `src/streamer/*`, nouvelle page participant ; retrait de `prototypes/figurants/pages/visio` | L, 14 h | L7, protocole unique | Claude (Opus/Fable) pour la conception, Sonnet 5.5 pour le code |
| **L9** Nœud « visio » dans le Conducteur | bloc du modèle (paramètres, validation) ; panneau (liens signés, état, aperçu 180p, coupure à distance, relance, repli) ; scène native `visio` de la sortie | `packages/modele`, `apps/conducteur/src/...` (planche, panneau, sortie) | L, 12 h | L8, chantier modèle et blocs | Sonnet 5.5 (interface relue par Claude) |
| **L10** Tests et documentation | tests de l'agrégat « prêt », du manifeste et du `precharger` étendu ; `ESSAI-REEL.md` mis à jour (TURN, banc) ; fiche « médias à livrer » pour l'équipe | tests et documents ci-dessus | S, 3 h | L5, L6, L8 | Qwen local |

**Ordre conseillé** :
1. **L3** en premier, pour mesurer l'état actuel.
2. En parallèle, sur des fichiers séparés : **L2** (Qwen) et **L6** (Sonnet).
3. Puis **L7**, **L4** et **L5**.
4. Puis **L8** et **L9**.
5. **L1** seulement si le prototype rejoue avant la migration.

**Coût estimé si tout est délégué** :
- Qwen local (L2, L10) : gratuit ;
- Sonnet 5.5 (L3, L6, L7, L1) : ≈ 2 à 4 $ ;
- L4, L5, L8, L9 (conception Claude, code Sonnet) : ≈ 5 à 10 $ d'API, plus les relectures.

## 6. Questions au propriétaire

1. **Domaine du studio** : en avez-vous un, ou faut-il en acheter un ? Il servirait à `medias.<domaine>` (R2 public)
   et à une adresse fixe pour le spectacle (tunnel nommé à la place du tunnel quick).
2. **Le fil Insta** : une seule vidéo de 45 s comme le 27/10, ou les 10 vidéos (3:10) du LISEZMOI ? Le poids pour 150
   téléphones passe de 0,8 Go à 5,7 Go, et décide du besoin de réseau local.
3. **Réseau de la prochaine salle** : Wi-Fi dédié avec serveur local (architecture hybride), ou public en 4G/5G ?
   Quel est le débit **montant** de l'accès Internet de la salle ?
4. **La ministre** : sera-t-elle dans le bâtiment (même Wi-Fi) ou à distance (4G) ? La visio reste-t-elle **en
   direct**, ou revient-on à la vidéo précalculée `zoom_junon.mp4` (décision n° 2 du LISEZMOI), qui pourrait au moins
   servir de repli ?
5. **TURN Cloudflare** : êtes-vous d'accord pour créer une clé Realtime TURN sur votre compte ? Coût attendu : moins
   de 0,01 $ par représentation. Les clés restent dans l'environnement du serveur, jamais dans le dépôt.
6. **Son des téléphones** : confirmez-vous « muet par défaut, le spectateur active le son » ? Le code du 27/10
   tentait le son d'abord.
7. **Le prototype figurants rejouera-t-il** avant la migration vers le serveur de spectacle unique ? Sinon, on saute
   L1.
8. **Aperçu de la visio en régie** : acceptez-vous un flux de plus (180p, ≈ 0,2 Mb/s) envoyé par chaque téléphone de
   la visio ?
9. **Médias publics ou privés** : les vidéos du fil peuvent-elles être lisibles par quiconque connaît l'URL (R2
   public, plus simple, avec cache CDN) ? Ou faut-il des URL signées à durée courte ?
