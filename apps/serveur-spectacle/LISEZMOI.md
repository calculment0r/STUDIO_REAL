# Serveur de spectacle (protocole v2)

Fait tourner le lecteur en représentation, tient l'état officiel, calcule la vue de chaque acteur et parle à tous
(régie, téléphones, sortie, agents) avec le protocole unique (`packages/protocole/PROTOCOLE.md`).

- `src/noyau/` : PUR (ni Node ni `ws`, horloge et aléa injectés) → hébergeable tel quel dans un Durable Object.
  `Representation` : `recevoir(session, msg)`, `fermer(session)`, `tick(dt)`, `instantane()`, `restaurer(x)`, `bienvenue(session)`.
- `src/hote/` : Node. HTTP (clients construits, `/medias/`, `/sante`, `/config.json`) + WebSocket `/ws`, jetons, disque.

## Lancer

- `npm run dev:spectacle` (racine) ; l'ancien serveur des figurants : `npm run dev:figurants`.
- Variables : `SPECTACLE_CONFIG` (autre fichier de configuration), `PORT`, `SANS_REPRISE=1` (nouvelle représentation).
- Sortie : 0 arrêt propre (Ctrl+C, SIGTERM, SIGHUP, SIGBREAK), 1 exception (instantané et journal écrits), 2 port pris.

## Configuration et secrets

- `exploitation/spectacle.config.json` (sinon `spectacle.config.exemple.json`) : adresses publique et locale, port
  (8790), projet, dossier des médias, dossiers des clients construits. Sans secret.
- `exploitation/spectacle.secrets.json` (ignoré par git) : créé au premier lancement, un jeton aléatoire par rôle
  (`regie`, `acteur`, `agent`). La console dit OÙ il est, jamais sa valeur ; le serveur ne garde que l'empreinte SHA-256.
- Jeton faux : `refus{fatal}` puis fermeture 4003. Session reprise ailleurs : 4001. Hello refusé (acteur inconnu) : 4400.

## Santé, journal, reprise

- `GET /sante` : version, redémarrages, connexions par rôle, position du lecteur, agents, âge de l'instantané, disque.
  Aucune donnée personnelle. `GET /config.json` : partie publique (adresses, version, run).
- Journal : `exploitation/journaux/<run>.jsonl`, ajout synchrone. Instantané : `exploitation/etat/<run>.instantane.json`
  (écriture atomique au plus 200 ms après un changement, et à l'arrêt).
- Au démarrage, le dernier instantané est repris : le lecteur est reconstruit en rejouant ses entrées (déterministe),
  les clients se reconnectent et reçoivent leur vue courante dans `bienvenue`.

## Pas encore fait

Latences d'affichage agrégées (rapport 2 §4.3) · jetons par acteur nommé · capteurs bruit et assis (valeurs neutres) ·
rejeu de la fin du journal postérieure à l'instantané · `agent.in say` vers le mur (lot agents) · orchestrateur,
Whisper, ElevenLabs, R2, TURN, tunnel, application téléphone, sortie · adaptateur Durable Object · script de lancement.
