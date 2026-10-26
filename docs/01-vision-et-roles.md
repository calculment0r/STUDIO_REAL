# 01 — Vision et rôles

## Ce qu'est le studio

Un outil pour **écrire, répéter et jouer** des spectacles où les téléphones du public font partie de la mise en scène.
Trois temps, trois modes de la même application :

| Mode | Qui | Quoi |
|------|-----|------|
| **Écriture** | auteur, metteur en scène, développeur | Éditeur nodal + timeline : on compose les segments, les événements, les règles de passage, les écrans des téléphones |
| **Répétition** | équipe | On lance le scénario avec des **spectateurs simulés** (bots) et quelques vrais téléphones ; avance rapide, retour arrière, points de reprise |
| **Représentation** | régie | Mode live : tableau de bord temps réel, GO, forçages, envois ciblés, surveillance des connexions, journal |

Le même moteur d'exécution tourne dans les trois modes ; seul ce qui l'alimente change (vrais téléphones, bots, horloge accélérée).

## Les rôles

Un rôle = un type d'écran + des droits + des informations visibles. Un même téléphone n'a qu'un rôle à la fois,
mais la régie peut le changer en direct (ex. un spectateur tiré au sort devient « invité »).

| Rôle | Appareil | Voit | Peut |
|------|----------|------|------|
| **Spectateur / joueur** | son téléphone | l'interface du moment (vote, clavier, bouton, consigne), les effets | interagir, réagir, écrire |
| **Superviseur** | téléphone ou tablette | tout ce que voit un joueur **+** des infos réservées (état de la salle, file de modération, consignes de jeu, rôles secrets...) | jouer **et** agir sur certains éléments (valider des commentaires, déclencher un effet autorisé) |
| **Streamer** (personnage filmé, ailleurs) | téléphone dédié ou ordinateur + caméra | son retour vidéo, les réactions du public, **des indications que lui seul voit** (prochaine action, chrono, prénom à citer, alerte) | envoyer la vidéo/l'audio, accuser réception d'une consigne, déclencher ses propres effets |
| **Comédien en salle** | téléphone discret / oreillette | consignes privées, chrono | accuser réception |
| **Écran scène** | ordinateur relié au projecteur | rien d'interactif : vidéo du streamer + calques animés (commentaires, emojis, votes) | — (affichage pur, plein écran) |
| **Régie** | ordinateur de régie | tout : timeline, joueurs, journal, aperçus de chaque rôle | GO, retenir, sauter, forcer, envoyer à une cible, modérer, panique |
| **Bot** | serveur | — | simuler un joueur en répétition / test de charge |

## Le vocabulaire (emprunté au théâtre, pour que la régie s'y retrouve)

- **Spectacle** (*show*) : le fichier scénario complet.
- **Représentation** (*session*) : une exécution du spectacle, avec ses joueurs, son journal, son code d'accès.
- **Segment** : un morceau de la timeline, avec une durée (fixe, min/max, ou ouverte). Son contenu est un flowgraphe.
- **Événement** (*cue*, « top ») : quelque chose qui se déclenche à un instant ou sur une condition. Son contenu est un flowgraphe.
- **Point d'arrêt** (*gate*, le « togglebreak ») : la frontière entre deux segments, avec une règle de passage.
- **GO** : l'ordre de la régie de franchir un point d'arrêt ou de déclencher un top.
- **Cible** : à qui s'adresse une action (tous, un groupe, un rôle, un joueur, une sélection).
- **Effet** : ce qui arrive sur un appareil (couleur, vibration, son, notification, écran d'interface...).

## Ce qui distingue ce studio d'un outil de quiz type Kahoot / Mentimeter

- Une **dramaturgie temporelle** (timeline + règles de passage) au lieu d'une suite de questions.
- Le téléphone comme **objet scénique** (lumière, vibration, son, capteurs), pas seulement comme formulaire.
- Des **rôles asymétriques** et des informations privées (superviseurs, streamer, rôles secrets).
- Une **régie de spectacle** (GO, standby, forçage, panique) plutôt qu'un animateur qui clique « suivant ».
- La **reprise sans perte** : un spectateur qui recharge revient exactement où en est la salle.
