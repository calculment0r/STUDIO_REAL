# STUDIO_REAL

Studio de fabrication de **spectacles augmentés par téléphone** : le public entre par un QR code,
se connecte avec un pseudo, et participe au déroulé d'une pièce (voter, cliquer, secouer, écrire, filmer...).
La régie pilote tout en temps réel : écrans colorés, vibrations, sons, notifications, vidéo, messages ciblés.

Premier projet produit avec le studio : **LIVE**, un personnage qui streame son flux « façon Twitch »
depuis un autre lieu ; le flux est projeté sur scène, le public commente et réagit depuis son téléphone,
et les réactions explosent à l'écran (pops, feux d'artifice d'emojis), pas en liste.

## Documents d'étude (première passe, 26 octobre 2026)

| # | Document | Contenu |
|---|----------|---------|
| 01 | [Vision et rôles](docs/01-vision-et-roles.md) | Ce que fait le studio, les rôles (spectateur, streamer, superviseur, régie, écran scène, comédien), le vocabulaire |
| 02 | [Capacités du téléphone](docs/02-capacites-telephone.md) | **La grosse étude des signaux** : écran, couleur, vibration, son, notifications, capteurs, caméra, micro, flash, clavier... avec iOS / Android |
| 03 | [Moteur de scénario](docs/03-moteur-scenario.md) | Timeline + flowgraphes + points d'arrêt (« togglebreak ») à règles simples, ciblage, variables, modèle de données |
| 04 | [Connexion, reprise, réseau](docs/04-connexion-reprise-reseau.md) | QR code, pseudo, reconnaissance du téléphone, « rafraîchir sans rien perdre », plein écran, réseau en salle |
| 05 | [Régie et éditeur](docs/05-regie-et-studio.md) | L'ordinateur de régie : édition nodale + timeline, mode live, forçages, envois ciblés, bouton panique |
| 06 | [Cas LIVE : le streamer](docs/06-cas-live-streamer.md) | Flux vidéo vers la scène, écran scène animé, clavier qui ne mange pas l'écran, modération, déroulé type |
| 07 | [Architecture technique](docs/07-architecture-technique.md) | Pile proposée, hébergement (GitHub Pages ne suffit pas seul), vidéo, synchronisation d'horloge, tests de charge |
| 08 | [Catalogue de mécaniques](docs/08-catalogue-mecaniques.md) | Une trentaine d'idées de scénarios pour nourrir le studio |
| 09 | [Feuille de route et questions](docs/09-feuille-de-route-et-questions.md) | Phases, premiers prototypes, décisions à prendre |

## Les cinq principes qui structurent tout

1. **Le serveur a toujours raison.** Le téléphone n'est qu'un écran et une télécommande : il ne garde aucun état
   de jeu. Rafraîchir, perdre le réseau, verrouiller l'écran ou changer de téléphone ne fait rien perdre.
2. **Tout est un événement journalisé.** Chaque action (vote, GO régie, reconnexion) est écrite dans un journal.
   On rejoue, on reprend, on analyse, on simule une salle de 300 bots en répétition.
3. **Une règle de passage se lit en une phrase.** « Suivant quand 100 % des connectés ont voté, sinon au bout de 90 s. »
   La régie peut toujours forcer, retenir ou sauter.
4. **On conçoit pour l'iPhone le plus limité.** Vibration, plein écran, flash : iOS en refuse une partie.
   Chaque effet a une solution de repli définie dans le scénario.
5. **Le réseau de la salle est l'ennemi n° 1.** On mesure, on dégrade proprement, on ne bloque jamais le spectacle.
