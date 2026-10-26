# 05 — L'ordinateur de régie : éditeur et mode live

Une seule application web (ouverte sur l'ordinateur de régie), deux modes.

## 1. Mode écriture (éditeur)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Spectacle : LIVE  v12      [Écriture] [Répétition] [Live]     Enregistrer │
├───────────────┬──────────────────────────────────────┬───────────────────┤
│ Bibliothèque  │  VUE NODALE (segments + gates)       │ Inspecteur        │
│ • Segments    │   [Accueil]─▶◇─▶[Intro]─▶◇─┬▶[2A]    │ Gate « porte »    │
│ • Écrans      │                           └▶[2B]    │ Quand: 100% votes │
│ • Effets      ├──────────────────────────────────────┤ Max: 90 s         │
│ • Sons/médias │  TIMELINE du chemin sélectionné      │ Avertir: 10 s     │
│ • Modèles de  │  |Accueil|Intro|Vote porte|Acte 2A|  │ Si forcé: abst.   │
│   règles      │   pistes: ▲tops ▲tops ▲               │ Vers: gagnant     │
│               ├──────────────────────────────────────┤                   │
│               │  FLOWGRAPHE (double-clic)            │ Aperçus de rôle   │
│               │   (nœuds + liens)                    │ [📱][🎥][🖥️]       │
└───────────────┴──────────────────────────────────────┴───────────────────┘
```

- **Aperçus de rôle** : un faux téléphone (spectateur), la vue streamer et l'écran scène, côte à côte, qui réagissent pendant qu'on édite.
- **Éditeur d'écrans** : on choisit un écran type (vote, clavier, réactions...) et on règle ses paramètres (textes, couleurs, options)
  sans code. Écrans sur mesure possibles en code pour les développeurs.
- **Bibliothèque de médias** : sons, images, vidéos, polices ; préchargés sur les téléphones pendant l'accueil.
- **Validation** : l'éditeur signale les segments inaccessibles, les gates sans délai max (risque de blocage), les cibles vides,
  les effets non disponibles sur iPhone sans repli.

## 2. Mode répétition

- Lancer le spectacle avec **N bots** (profils : rapides, lents, distraits, qui se déconnectent) + de vrais téléphones.
- **Avance rapide** (×2, ×10), saut direct à un segment avec un état préparé (« on reprend à l'Acte 2 avec 120 joueurs dont 60 ont voté rouge »).
- **Points d'arrêt de débogage** dans les flowgraphes, inspection des variables.
- Rejouer une représentation passée depuis son journal.

## 3. Mode live (la représentation)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ● LIVE  K7Q2   21:14:32   Horloge 00:23:41   Présents 138/142   ⚠ 2      │
├──────────────────────────────────────────────────────────────────────────┤
│ TIMELINE   [Accueil ✓][Intro ✓][▶ Vote porte 00:42 / max 01:30][Acte 2?] │
│ Gate : ARMÉ — 121/138 ont voté (88 %)  → passe à 100 % ou dans 0:48      │
│        [  GO  ]  [ RETENIR ]  [ SAUTER À… ]  [ +30 s ]  [ PAUSE ]         │
├─────────────────────────────┬────────────────────────────────────────────┤
│ JOUEURS (filtre, tri)       │ ENVOYER À  [sélection: 17 manquants ▼]      │
│ ● Zoé42   iOS  ✓vote  12ms  │ [Couleur] [Vibrer] [Son] [Message] [Écran] │
│ ◐ Max     And. (caché)      │ Messages rapides prédéfinis : « Votez ! » … │
│ ○ Léa     déconnecté 0:12   ├────────────────────────────────────────────┤
│ ...                         │ STREAMER : 🎥 OK 24 fps 180 ms  [Consigne…]│
│                             │ MODÉRATION : 3 en attente [✓][✗][⭐]       │
├─────────────────────────────┴────────────────────────────────────────────┤
│ JOURNAL  21:14:30 vote Zoé42=rouge · 21:14:28 Max caché · 21:14:20 GO ... │
└──────────────────────────────────────────────────────────────────────────┘
```

### Fonctions indispensables
- **GO / RETENIR / SAUTER / PAUSE / +30 s** sur le point d'arrêt courant. Raccourcis clavier (barre d'espace = GO, comme QLab),
  avec **confirmation** sur les actions destructrices (sauter un segment).
- **Tops manuels** : boutons configurés dans le scénario (« Faire vibrer la salle », « Révéler le traître »).
- **Liste des joueurs** : état (●présent ◐caché ○déconnecté), plateforme, latence, a répondu ou non, rôle, groupe, zone,
  capacités (son ✓, vibration ✗...). Filtres, recherche, **sélection multiple** → devient une cible.
- **Envoyer à** une cible : effet, message, écran, changement de rôle ou de groupe.
- **Variables** : lecture et modification à la main.
- **Aperçus** : voir l'écran d'un joueur précis tel qu'il le voit ; voir l'écran scène et la vue streamer.
- **Bouton PANIQUE** : tous les téléphones en noir et silencieux, écran scène sur une image de secours, streamer prévenu.
  Second bouton « Reprendre » qui restaure l'état d'avant.
- **Alertes** : chute brutale des présents (problème réseau), streamer déconnecté, gate bloquée longtemps, serveur chargé.
- **Plusieurs postes régie** possibles (un régisseur général + un modérateur), avec des droits différents.

### Superviseurs
Ils ont une **régie de poche** limitée sur leur téléphone, en plus de leur écran de joueur : un onglet « Supervision »
(compteurs, file de modération, consignes privées, boutons autorisés par le scénario). Ce qu'ils voient et peuvent faire
est défini par le scénario, segment par segment.

## 4. Intégration avec la régie son et lumière

- **Sortie OSC / MIDI** depuis les flowgraphes : déclencher un top QLab, une mémoire de console lumière, un effet vidéo.
- **Entrée OSC / MIDI** : un top son ou lumière peut faire passer un point d'arrêt (« quand la musique finit »).
- Option **Art-Net / DMX** plus tard (faire répondre les projecteurs à la jauge du public).
- Un petit **pont local** (programme sur la machine de régie) relie le serveur de jeu au réseau son/lumière de la salle.
