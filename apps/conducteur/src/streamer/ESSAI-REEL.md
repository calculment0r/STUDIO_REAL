# Essai réel du flux streamer (iPhone → sortie écran)

But : le vrai iPhone (iOS 18, Safari ou Chrome iOS) filme, un PC Windows affiche la sortie écran scène.
Tout passe par **une seule adresse https** (tunnel rapide cloudflared) : l'interface (build de `apps/conducteur`),
l'API et la salle WebSocket (signalisation WebRTC) sont servies par le même serveur local (`wrangler dev`).
La vidéo, elle, va **directement** du téléphone au PC (WebRTC pair-à-pair), ou par un relais TURN s'il est configuré.

## Ce qu'il faut

- Le PC de sortie, avec ce dépôt installé (`npm install` déjà fait) et `apps/serveur/.dev.vars` (JETON_ADMIN).
- `C:\Program Files (x86)\cloudflared\cloudflared.exe` (déjà installé).
- L'iPhone : **même Wi-Fi que le PC** pour le premier essai (STUN suffit). En 4G : voir « TURN » plus bas.

## Les commandes, dans l'ordre

Deux terminaux PowerShell sur le PC.

**Terminal 1 : le tunnel public** (laisser ouvert). Il affiche une adresse `https://<mots-au-hasard>.trycloudflare.com` :

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:8787
```

**Terminal 2 : construction + serveur + projet de test** (laisser ouvert ; remplacer l'adresse par celle du terminal 1) :

```powershell
cd C:\STUDIO_REAL
node apps/conducteur/src/streamer/essai-reel.mjs --tunnel https://<mots-au-hasard>.trycloudflare.com
```

Le script construit l'interface (`index.html`, `sortie.html`, `streamer.html` → `apps/conducteur/dist`), lance
`npm run dev -w serveur` sur le port 8787, crée (ou reprend) le projet « LIVE » de test avec son jeton (mémo hors git :
`apps/conducteur/node_modules/.cache/studio-real-essai-reel.json`), puis affiche **l'adresse de démarrage**
`https://…trycloudflare.com/streamer.html#role=accueil&projet=…&jeton=…`. Ctrl+C arrête le serveur.

## Sur le PC

1. Ouvrir l'adresse de démarrage dans Chrome ou Edge.
2. **« L'adresse du streamer »** : bouton « Copier l'adresse », l'envoyer au comédien (SMS, AirDrop). Pas de QR code
   pour le streamer : le QR est réservé au public (projeté par la sortie à l'accueil).
3. **« SORTIE ÉCRAN »** ouvre `sortie.html?projet=…&jeton=…&stats=1` : la sortie écran scène (chantier SORTIE) ;
   l'incrustation `stats=1` en bas à gauche montre l'état du flux, le **chemin** (DIRECT · RÉSEAU LOCAL / DIRECT ·
   INTERNET / RELAIS (TURN)), la définition, les images/s, le débit, la latence estimée, le codec.
   La sortie ne montre la vidéo que sur une scène « streamer » (pilotée par la régie).
4. **« MONITEUR DU FLUX »** : la vidéo seule, **son coupé par défaut** (bouton « Activer le son »), chemin et
   statistiques, latence mesurée par mire, et une zone « Consigne privée au streamer » (Entrée / Urgent).
5. **Bascule de la sortie** : barre **SCÈNE** du moniteur — DIRECT / VIDÉO (`test-h3.mp4` par défaut) / NOIR /
   QR PUBLIC, avec le temps de fondu. Le moniteur publie sur le canal local (sortie dans ce navigateur) ET par la
   salle (sortie sur une autre machine) ; la sortie écoute toujours les deux. Au bout de la barre, le **retour** de la
   sortie : « connectée · montre video », ou « ⚠ test-h3.mp4 introuvable — choisir le dossier médias ».
   La conduite du Conducteur (`/` sur la même adresse, même navigateur) pilote la sortie par le même chemin : un clip
   de la piste vidéo lu fait basculer la sortie. Plusieurs régies à la fois : **la dernière commande gagne**.
   Les vidéos : le script copie `C:\STUDIO_REAL\medias-locales\` dans le build (servies sous `/medias-locales/`),
   donc `test-h3.mp4` est trouvé sans rien choisir. En spectacle, choisir le dossier sur la sortie (touche M).
   Gardez la fenêtre de sortie **visible** (glissée sur le projecteur ou à côté) : un onglet caché retarde la
   lecture des vidéos jusqu'à ce qu'on le montre.

## Sur l'iPhone

1. Ouvrir l'adresse reçue (Safari conseillé). Pour la garder : Partager › **Sur l'écran d'accueil** (ou favori).
   L'adresse contient serveur, projet, rôle et jeton : rien à taper.
2. **ACTIVER LA CAMÉRA** (caméra **arrière** par défaut ; accepter caméra et micro), puis **EN DIRECT**.
3. En haut : état (EN DIRECT / attente sortie), barres de qualité, images/s, débit, « sortie ✓ ×1 », chemin.
   En bas : bascule caméra avant/arrière (gauche), EN DIRECT/COUPER (centre), micro (droite).
4. Les consignes de la régie s'affichent en grand en haut (toucher pour masquer).

Comportements iPhone pris en compte : `playsinline`, session audio passée en `play-and-record` avant le micro
(constat du banc d'essai du 26/10), Wake Lock (écran allumé pendant le direct), **reprise automatique** au retour
au premier plan (iOS coupe la caméra et gèle la page dès qu'elle est masquée : la caméra est rouverte, la piste
remplacée sans renégocier, la salle rouverte, le téléphone se ré-annonce). Pendant l'arrière-plan, **il n'y a pas
d'image** : c'est une limite d'iOS, pas du code.

## Mesurer la latence

Sur la page de démarrage, envoyer au téléphone **l'adresse « mode mire »** : le téléphone envoie une image
horodatée (heure du serveur, calée par ping des deux côtés) au lieu de la caméra ; le MONITEUR affiche
« latence mesurée (mire) … ms · médiane … ms » (capture + encodage + réseau + décodage + affichage).

## TURN (4G, NAT stricts) : Cloudflare Realtime TURN

Sans TURN, le flux passe en pair-à-pair grâce au STUN public de Google (`stun.l.google.com:19302`) : sûr sur le
même Wi-Fi, souvent possible en 4G, **impossible derrière certains NAT d'opérateur** (NAT symétrique / CGNAT).
Le TURN relaie alors la vidéo. Rien n'est en dur dans le code ; pour l'activer **sans rien déployer** :

1. (Propriétaire, une fois) Tableau de bord Cloudflare › **Realtime › TURN Server** › créer une clé TURN : on obtient
   un **Turn Token ID** et un **API Token**. Ce sont des secrets : ne pas les mettre dans le dépôt.
2. Avant la commande du terminal 2, dans le même PowerShell :

   ```powershell
   $env:CF_TURN_CLE_ID = "<Turn Token ID>"
   $env:CF_TURN_CLE_JETON = "<API Token>"
   # facultatif : durée de vie des identifiants (s), 6 h par défaut
   $env:CF_TURN_DUREE = "21600"
   ```

3. `essai-reel.mjs` demande alors à Cloudflare des **identifiants TURN éphémères**
   (`POST https://rtc.live.cloudflare.com/v1/turn/keys/<id>/credentials/generate-ice-servers`, durée limitée) et les
   met dans l'adresse de démarrage (`ice=` en base64url) : l'adresse du streamer les reprend, et la page de démarrage
   les pose pour `sortie.html` (même origine, `localStorage['studio-real:ice']`). Les clés longues ne quittent pas le PC.
   La page de démarrage affiche « Réseau : STUN + TURN ». Les adresses en port 53 renvoyées par Cloudflare sont retirées
   (bloquées par les navigateurs).
4. Pour **vérifier le relais** : ajouter `&relais=1` à l'adresse du streamer et à celle de la sortie/du moniteur
   (TURN forcé) ; le chemin affiché doit être « RELAIS (TURN) ».

Autres façons de fournir une configuration ICE (JSON `[{"urls":[…],"username":…,"credential":…}]` ou base64url) :
paramètre `ice=` d'une adresse, `localStorage['studio-real:ice']`, ou `VITE_SERVEURS_ICE` au moment du build
(fichier `.env.local`, hors git). Voir `src/flux/ice.ts`.

## Si ça ne marche pas

| Symptôme | Cause probable |
|---|---|
| « caméra refusée » sur l'iPhone | Réglages › Safari › Caméra/Micro : Autoriser ; ou page ouverte en http (il faut l'adresse https du tunnel) |
| Le téléphone reste « en direct · attente sortie » | Sortie/moniteur pas ouverts, ou salle injoignable (voir « salle connectée » sous les chiffres) |
| Sortie « négociation… » sans fin, chemin jamais établi | NAT : essayer le même Wi-Fi, ou activer le TURN |
| Image figée après retour d'arrière-plan | Attendre 2 à 5 s (reprise automatique) ; sinon COUPER puis EN DIRECT |
| `LIEN INCOMPLET` sur le téléphone | Adresse tronquée par la messagerie : la renvoyer en entier |
| Erreur 403 sur l'API | Ouvrir les pages par l'adresse du tunnel, pas en mélangeant localhost et tunnel |

Vérifié en automatique (`src/flux/integration.edge.test.ts`, Edge sans tête, fausse caméra, même serveur que ci-dessus
en local) : image reçue, chemin direct, H.264, consigne, reprise caméra, latence par mire, réception dans `sortie.html`.
Non vérifié par nous : le vrai iPhone, le tunnel public, le TURN Cloudflare (pas de clé utilisée).
