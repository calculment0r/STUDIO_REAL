# 06 — Cas LIVE : le streamer projeté sur scène

## 1. Le dispositif

```
   AILLEURS                               SERVEUR VIDÉO (SFU)                    THÉÂTRE
┌────────────┐   WebRTC (vidéo+audio)   ┌───────────────────┐   WebRTC      ┌──────────────────┐
│ STREAMER   │ ───────────────────────► │  LiveKit (ou      │ ────────────► │ ORDI ÉCRAN SCÈNE │──HDMI──► projecteur
│ téléphone  │ ◄─────────────────────── │  équivalent)      │               │ navigateur plein │
│ + vue      │   consignes, réactions   └───────────────────┘               │ écran : vidéo +  │
│ privée     │                                                               │ calques animés   │
└─────┬──────┘                          ┌───────────────────┐   WebSocket   └──────────────────┘
      │          WebSocket              │  SERVEUR DE JEU   │ ◄──────────►  téléphones du public
      └───────────────────────────────► │  (moteur, état,   │ ◄──────────►  superviseurs
                                        │   journal)        │ ◄──────────►  ordi de RÉGIE
                                        └───────────────────┘
```

- **Deux canaux séparés** : la vidéo passe par un serveur vidéo spécialisé (SFU), les commentaires/réactions/consignes par le serveur de jeu.
  Si la vidéo hoquette, le jeu continue, et inversement.
- **Latence visée** : vidéo streamer → scène **< 500 ms** (WebRTC ; le HLS de Twitch/YouTube fait 3 à 30 s, inutilisable pour une
  interaction avec la salle). Commentaire tapé → visible sur scène **< 300 ms**.
- L'**écran scène** est une page web en plein écran (Chrome en mode kiosque) sur l'ordinateur relié au projecteur. Variante :
  la même page comme **source navigateur dans OBS** si l'on veut mixer, enregistrer ou ajouter d'autres sources.
- **Retour son** : la régie ou un comédien peut parler au streamer (canal audio retour dans son oreillette), et le streamer peut
  entendre la salle (un micro d'ambiance renvoyé) — à décider artistiquement.

## 2. Le streamer

### Matériel recommandé
Un **téléphone dédié** en mode page web (ou PWA) **ou** un ordinateur portable + caméra pour plus de stabilité.
4G/5G + Wi-Fi en secours, batterie externe, stabilisateur. Le streamer bouge ? → téléphone + **connexion cellulaire agrégée**
(routeur 4G/5G multi-opérateurs) si le spectacle en dépend.

### Son écran (vue privée, seul lui la voit)
- Son propre retour caméra.
- **Les réactions du public** en direct (version compacte de l'écran scène).
- **Le bandeau de consignes** : ce que la régie / le scénario lui demande (« Lis le commentaire de Zoé », « Entre dans la boulangerie »,
  « Plus que 2 min »), avec un bouton **« Reçu »** qui remonte à la régie (et peut faire passer un point d'arrêt).
- Chrono du segment, état de connexion, qualité du flux.
- **Vibration / son** pour les consignes urgentes (le streamer ne regarde pas toujours l'écran).

### Qualité et résilience du flux
- Diffusion adaptative (simulcast) : le serveur choisit la qualité selon le réseau.
- Indicateurs en régie : images/s, débit, latence, pertes.
- **Plan B automatique** sur l'écran scène si le flux tombe : image « Connexion perdue… » dans le style du personnage
  (ça peut devenir un ressort dramatique), boucle vidéo préenregistrée, ou bascule sur une caméra de secours.

## 3. L'écran scène : des réactions spectaculaires, pas une liste

Toutes les animations sont rendues en **WebGL (PixiJS)** sur un calque au-dessus de la vidéo, à 60 images/s.

### Commentaires
| Style | Description |
|-------|-------------|
| **Pop** | la bulle apparaît en grossissant avec rebond (ressort), reste 3–6 s, s'envole ou éclate ; position libre autour de la vidéo, sans jamais masquer le visage du streamer (zone protégée réglable) |
| **Danmaku** | le texte traverse l'écran de droite à gauche sur plusieurs lignes (style Niconico) — énergique pour les moments de folie |
| **Typographie cinétique** | les mots arrivent un par un, taille selon l'importance ; pour un commentaire mis en avant |
| **Commentaire vedette** | le superviseur ou la régie « épingle » un message : grand format, couleur du pseudo, son |
| **Nuage de mots** | en fin de séquence, les mots les plus tapés grossissent |
| **Écho du streamer** | quand le streamer lit un message, il s'illumine à l'écran |

Chaque pseudo a **une couleur stable** ; la longueur des messages est limitée (≈ 80 caractères) pour rester lisible depuis le fond de la salle ;
**débit régulé** : si 200 messages arrivent en 5 s, l'écran en affiche une sélection (plafond par seconde, priorité aux nouveaux auteurs) et
représente le reste par la densité des effets.

### Réactions et emojis
- **Feux d'artifice d'emojis** : un tap = une particule ; 30 taps du même emoji en 2 s = une **fusée** qui explose en gerbe de cet emoji.
- **Cœurs qui montent** (style live TikTok/Instagram) depuis le bas, intensité = débit de likes.
- **Combo / jauge de salle** : plus la salle réagit ensemble, plus l'effet grossit (multiplicateur, tremblement d'écran, flash).
- **Vagues** : quand une zone de la salle réagit, l'effet part du côté correspondant de l'écran (si on connaît les zones).
- **Votes** : barres ou bulles qui se gonflent en direct, révélation dramatique (roulement, explosion du gagnant).
- **Alertes « abonnés » détournées** : un spectateur « offre » quelque chose au streamer → animation plein écran avec son pseudo.

### Contraintes
- Lisibilité à 15 m : polices épaisses, contour, contraste fort.
- Un **gabarit par séquence** : la régie bascule les styles selon le moment (calme, folie, vote, entracte).
- Tout est paramétrable dans l'éditeur (vitesse, densité, zone protégée, palette).

## 4. Le téléphone du spectateur pendant LIVE

### Le clavier qui ne mange pas l'écran
Problème : le clavier virtuel prend 40 % de l'écran ; sur iOS il « pousse » la page de façon imprévisible.

Solution proposée :
1. Mise en page en **3 zones** dans `100dvh` sans défilement : *haut* = contexte (consigne, mini-vue du streamer optionnelle),
   *milieu* = réactions rapides, *bas* = champ de saisie **collé au clavier**.
2. Android/Chrome : `<meta name="viewport" content="..., interactive-widget=resizes-content">` → la page se réduit proprement au-dessus du clavier
   (ou VirtualKeyboard API pour un contrôle fin).
3. iOS/Safari : écouter `visualViewport` (`resize`/`scroll`) pour connaître la hauteur réellement visible et repositionner le champ et la zone haute ;
   éviter `position: fixed` en bas (comportement instable avec le clavier).
4. Quand le clavier est ouvert, la zone haute **se compacte** (consigne en une ligne) au lieu de disparaître.
5. **Envoyer sans fermer** le clavier (on enchaîne les messages), bouton envoyer gros, retour haptique (Android) / visuel.
6. **Suggestions rapides** au-dessus du clavier (mots du moment proposés par le scénario) pour ceux qui tapent lentement.
7. Barre d'**emojis maison** (6–8 emojis du spectacle) plutôt que le clavier emoji du système — plus rapide et animable à l'écran.
8. Compteur de caractères, anti-spam doux (« attends 2 s »), aperçu « ton message est parti sur scène ✨ » quand il est affiché.

→ À valider tôt par un **prototype dédié** sur une dizaine de téléphones réels (iPhone récents et anciens, Android variés).

### Autres écrans du spectateur
Réactions (tap, appui long = réaction plus forte), vote, « secoue pour encourager », message privé reçu d'un personnage,
écran couleur / noir piloté par la régie.

### Faut-il montrer la vidéo dans les téléphones ?
Par défaut **non** : le public regarde la scène, le téléphone est la télécommande ; ça économise le réseau de la salle (voir [04 §5](04-connexion-reprise-reseau.md))
et garde les têtes levées. Option : une mini-vue basse définition pour certains moments, ou pour les superviseurs.

## 5. Modération (indispensable : ce que tape le public est projeté en grand)

| Niveau | Mécanisme |
|--------|-----------|
| Automatique | liste de mots interdits (avec variantes l33t), blocage liens / numéros, longueur max, limite de débit par joueur |
| Délai | les messages passent par un tampon de 1–3 s pendant lequel le modérateur peut les retirer |
| Manuel | file de validation (superviseur / poste modération) pour les séquences sensibles : ✓ valider, ✗ refuser, ⭐ mettre en vedette |
| Sanctions | **sourdine fantôme** (le joueur voit son message envoyé, il n'apparaît nulle part), avertissement, exclusion |
| IA (option) | classification rapide des messages douteux par un petit modèle (local sur les DGX ou Haiku) pour pré-trier la file |

Le mode de modération est un **paramètre du segment** (libre / tampon / validation manuelle).

## 6. Déroulé type de LIVE (exemple à discuter)

| # | Segment | Contenu | Règle de passage |
|---|---------|---------|------------------|
| 0 | Hall | QR, pseudo, tutoriel (couleur, vibration, son), proposition PWA | GO régie quand la salle est prête **et** ≥ 95 % des présents ont fini le tutoriel |
| 1 | Noir / ouverture | tous les téléphones en noir, vibration collective au top son | durée fixe (son de la régie) ou OSC « fin de musique » |
| 2 | Le streamer se connecte | « EN DIRECT » sur scène ; premières réactions (emojis seulement) | consigne streamer « Reçu » |
| 3 | Chat ouvert | commentaires libres, pops sur scène ; le streamer répond ; la régie lui pousse des commentaires choisis | min 3 min, max 6 min, GO régie |
| 4 | Le choix | vote : « Où doit-il aller ? » (3 options) | 100 % des présents **ou** 60 s ; avertir à 10 s ; abstention si forcé ; **branche selon gagnant** |
| 5A/B/C | La conséquence | le streamer suit le choix ; défi « secouez pour l'aider » (jauge salle) | jauge ≥ seuil **ou** 90 s |
| 6 | Rôles secrets | 3 spectateurs tirés au sort reçoivent une mission privée (envoyer un mot précis) ; les superviseurs voient qui | tous les 3 ont réussi **ou** 2 min |
| 7 | Climax | danmaku + feux d'artifice ; la salle entière en couleur ; le flux « coupe » (dramaturgie) | GO régie |
| 8 | Final | message du personnage sur chaque téléphone (puis notification push le lendemain pour ceux qui ont installé la PWA) | fin |

## 7. Points ouverts pour LIVE
- Le streamer joue-t-il en extérieur (réseau mobile) ou en intérieur maîtrisé ? Ça dimensionne tout le plan vidéo.
- Le streamer est-il un comédien qui improvise, ou suit-il un texte ? (affecte la densité des consignes privées)
- Combien de spectateurs par représentation ? (100 ? 500 ?)
- Faut-il enregistrer la représentation (vidéo + calques) ?
- Le public peut-il envoyer **sa** vidéo/photo sur scène (consentement, modération image) ?
