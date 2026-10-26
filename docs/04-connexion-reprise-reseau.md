# 04 — Connexion, reprise, réseau

## 1. Le parcours d'entrée

```
QR code (programme, écran d'accueil, dossier de siège)
   │   https://calculment0r.github.io/STUDIO_REAL/?r=K7Q2      (r = code de la représentation)
   ▼
Page web (GitHub Pages, HTTPS)
   │  1. Le téléphone a déjà un jeton pour K7Q2 ?  → reprise directe (§3)
   │  2. Sinon : écran « Ton pseudo » (+ option zone / siège)
   ▼
« Toucher pour entrer »  ← CE toucher déverrouille son, capteurs (iOS), plein écran, wake lock
   ▼
Tutoriel (30 s) : test couleur, vibration, son → résultats remontés à la régie
   ▼
Écran d'attente du spectacle  ── la régie voit le joueur apparaître dans la liste
```

- **Un QR par représentation** (code court `K7Q2`, valable le jour J) ; option : **un QR par siège / zone** qui pré-remplit la place
  (indispensable pour les effets « mosaïque » ou « vague »).
- **Pseudo** : unicité gérée par le serveur (`Zoé`, `Zoé (2)`), filtre d'insultes, longueur max 16. La régie peut renommer.
- Code de représentation tapable à la main en secours (QR illisible, appareil photo cassé).
- Ouverture des portes : la régie voit le compteur `142 inscrits / 138 présents` et le point d'arrêt « Accueil » attend
  « 100 % des présents ont fini le tutoriel » **ou** le GO de la régie.

## 2. Pourquoi GitHub Pages ne suffit pas seul

GitHub Pages sert des **fichiers statiques** : parfait pour l'application du téléphone (HTML/JS/CSS), gratuit, HTTPS, rapide.
Mais il ne peut pas tenir de connexion temps réel. Il faut **un serveur de jeu** à côté, joint en WebSocket (`wss://`).
Options détaillées dans [07](07-architecture-technique.md). Le QR pointe vers GitHub Pages, la page se connecte ensuite au serveur.

## 3. Reconnaître le téléphone et le remettre dans l'histoire

### 3.1 Identité
À la première connexion, le serveur crée un **joueur** et renvoie un **jeton secret** (aléatoire, 128 bits) lié à la représentation.
Le téléphone le range à **trois endroits** (si l'un est effacé, un autre survit) :
`localStorage`, `IndexedDB`, cookie du domaine. Option de secours : le jeton dans l'URL (`#t=...`) après l'entrée, pour qu'un
« ajouter à l'écran d'accueil » ou un partage d'onglet le conserve.

### 3.2 Les cas de reprise

| Situation | Ce qui se passe |
|-----------|-----------------|
| Coupure réseau de quelques secondes | Reconnexion automatique (délais croissants 0,5 s → 5 s), le téléphone envoie `dernier numéro d'événement reçu`, le serveur renvoie ce qui manque |
| Écran verrouillé puis rallumé | Page Visibility → reconnexion immédiate + instantané |
| **Rafraîchissement** de la page | Jeton retrouvé → instantané complet → le joueur est **exactement** où est la salle (même écran, même couleur, son vote déjà compté) |
| Onglet fermé, réouvert via le QR | idem (le jeton est dans le stockage) |
| Navigation privée / stockage effacé / autre téléphone | Nouveau pseudo… **ou** « J'étais déjà là » : saisir son pseudo, la **régie valide** la fusion (ou un code à 4 chiffres affiché au premier passage) |
| Deux onglets ouverts | Le dernier gagne, l'ancien affiche « session ouverte ailleurs » |
| Le serveur redémarre | Instantané + journal rechargés (voir [03 §8](03-moteur-scenario.md)), les téléphones se reconnectent seuls |

### 3.3 L'instantané (snapshot)
Envoyé à chaque (re)connexion : rôle, segment courant, écran et ses paramètres, couleur de fond, état des votes en cours
(et le sien), variables visibles par ce joueur, heure serveur, compte à rebours en cours. **Jamais** les effets éphémères passés
(pas de rafale de vibrations au retour).

## 4. Empêcher (et surtout rendre inoffensif) le rafraîchissement

On ne peut pas interdire totalement le rafraîchissement sur mobile. La vraie réponse est le §3 : **rafraîchir doit être sans danger**.
On réduit quand même les accidents :

| Mesure | Effet |
|--------|-------|
| `overscroll-behavior: none` sur la page + pas de défilement global | désactive le « tirer pour rafraîchir » (Chrome Android, Safari récent — **à vérifier** sur iOS) |
| Mise en page en `100dvh` sans défilement, `touch-action` réglé | moins de gestes parasites |
| `beforeunload` | demande de confirmation sur Android (peu fiable sur iOS) |
| **PWA installée** (écran d'accueil, `display: fullscreen/standalone`) | plus de barre du navigateur, plus de bouton rafraîchir, vrai plein écran sur iOS |
| Fullscreen API au « Toucher pour entrer » | plein écran sur Android |
| Wake Lock | l'écran ne s'éteint pas (moins de verrouillages → moins de reconnexions) |

**Recommandation** : proposer l'installation PWA **avant** le spectacle (dans le hall, sur une affiche « 2 étapes »), sans l'imposer.
Le spectacle doit fonctionner dans un simple onglet.

## 5. Le réseau dans la salle (risque n° 1)

- 200 à 500 téléphones dans une salle souvent mal couverte en 4G/5G (murs épais, sous-sol).
- Le trafic de jeu est **minuscule** (quelques Ko par joueur et par minute) : c'est la **couverture** et la **qualité** du Wi-Fi qui comptent,
  pas le débit — sauf si le public reçoit de la vidéo.
- Recommandations :
  1. **Mesurer** chaque salle en amont (page banc d'essai, 20 téléphones, partout dans la salle).
  2. Wi-Fi dédié au spectacle avec bornes adaptées à la densité (type borne « haute densité »), sans portail captif
     (les portails captifs cassent les WebSockets et l'entrée par QR), réseau ouvert ou mot de passe affiché.
  3. Serveur de jeu joignable **à la fois** par Internet (4G) et par le Wi-Fi local.
  4. Si le public doit **voir** la vidéo sur son téléphone : budget de débit sérieux (500 × 1 Mb/s = 500 Mb/s) → privilégier
     la vidéo **sur l'écran de scène** et pas dans les téléphones (voir [06](06-cas-live-streamer.md)).
- Le moteur **ne bloque jamais** sur un réseau défaillant : les règles « 100 % des présents » excluent automatiquement
  ceux qui ont décroché, et le délai max force le passage.
