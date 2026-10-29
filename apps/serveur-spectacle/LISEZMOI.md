# Serveur de spectacle (protocole v2)

Fait tourner le lecteur en représentation, tient l'état officiel, calcule la vue de chaque acteur et parle à tous
(régie, téléphones, sortie, agents) avec le protocole unique (`packages/protocole/PROTOCOLE.md`).

- `src/noyau/` : PUR (ni Node ni `ws`, horloge et aléa injectés) → hébergeable tel quel dans un Durable Object.
  `Representation` : `recevoir(session, msg)`, `fermer(session)`, `tick(dt)`, `instantane()`, `restaurer(x)`, `bienvenue(session)`.
- `src/hote/` : Node. HTTP (clients construits, `/medias/`, `/sante`, `/config.json`) + WebSocket `/ws`, jetons, disque.

## Lancer

- **Le soir du spectacle** : `exploitation/lancer-spectacle.ps1` (PowerShell ; gel du code, port, serveur, tunnel, pages, superviseur qui
  relance le serveur) puis `exploitation/arreter-spectacle.ps1` (arrêt propre, archive). Mode d'emploi, tunnel nommé et plan B :
  `exploitation/LISEZMOI.md` ; check-list : `exploitation/CHECKLIST.md`. Racine : `npm run spectacle` et `npm run spectacle:arret`.
- En développement : `npm run dev:spectacle` (racine) ; l'ancien serveur des figurants : `npm run dev:figurants`.
- Variables : `SPECTACLE_CONFIG` (autre fichier de configuration), `PORT`, `SANS_REPRISE=1` (nouvelle représentation).
- Sortie : 0 arrêt propre (Ctrl+C, SIGTERM, SIGHUP, SIGBREAK, ou `POST /arret`), 1 exception (instantané et journal écrits), 2 port pris.
- `POST /arret` : arrêt propre demandé par `arreter-spectacle.ps1` (Windows n'a pas de signal d'arrêt propre pour Node). Jeton de la
  régie en `Authorization: Bearer`, **depuis cette machine seulement** : toute requête portant un en-tête de relais
  (`cf-connecting-ip`, `x-forwarded-for`…) est refusée (403), donc rien ne passe par le tunnel.

## Configuration et secrets

- `exploitation/spectacle.config.json` (sinon `spectacle.config.exemple.json`) : adresses publique et locale, port
  (8790), projet, dossier des médias, dossiers des clients construits, `tunnel` (`type` : `aucun`, `cloudflare-nomme` ou
  `tailscale-funnel` ; `nom` du tunnel nommé). Sans secret.
- `exploitation/spectacle.secrets.json` (ignoré par git) : créé au premier lancement,
  `{"jetons": {"regie", "agent", "public", "acteurs": {"<id>": "<jeton>"}}}` : un jeton pour la régie, un pour les agents, un
  `public` pour la foule (acteurs de cardinalité n) et **un jeton par acteur nommé** du projet (cardinalité 1, hors agents et
  régie : `scene`, `ministre`, `franck`…), créé à la demande au démarrage quand un acteur apparaît dans le projet. La
  console dit OÙ il est, jamais sa valeur ; le serveur ne garde que l'empreinte SHA-256 (comparaison à temps constant).
- Vérification du `hello` : `role:'regie'` → `jetons.regie` ; `role:'agent'` → `jetons.agent` ; `role:'acteur'` → `jetons.public`
  si l'acteur est de cardinalité n (la foule), sinon `jetons.acteurs[<acteur>]`. Un jeton d'acteur nommé ne vaut que pour cet
  acteur : le jeton public ne peut réclamer ni la scène ni un téléphone nommé (refus 4003), ni le jeton de `ministre` celui de
  `scene`. `GET /ice` accepte le jeton de n'importe quel rôle ou acteur ; `POST /arret`, la régie seulement.
- Migration : un ancien fichier `{"jetons": {"regie", "acteur", "agent"}}` est réécrit au démarrage : l'ancien jeton `acteur`
  devient `public` (les QR déjà donnés à la foule restent valables), chaque acteur nommé reçoit un jeton neuf (ses liens et QR
  sont à refaire depuis la page LIENS du Conducteur) et la console l'écrit. L'entrée `turn` collée à la main est gardée.
- Jeton faux : `refus{fatal}` puis fermeture 4003. Session reprise ailleurs : 4001. Hello refusé (acteur inconnu) : 4400.

## Santé, journal, reprise

- `GET /sante` : version git, démarré depuis, redémarrages, connexions par rôle et acteurs connectés, position du lecteur, dernier top
  (`topRecu`), agents, âge de l'instantané, espace disque du dossier des journaux, **sonde du tunnel** (`tunnel` : toutes les 30 s le
  serveur interroge `<adresses.publique>/sante` et vérifie que la réponse vient de lui ; inactive sans tunnel ou sans vraie adresse
  publique). Aucune donnée personnelle, aucun jeton (`sante.test.ts` le vérifie). `GET /config.json` : partie publique.
- Pages d'exploitation (dans `pages/`, thème et Venus Rising servis sous `/theme/`) : `GET /sante.html` (une ligne par maillon, vert /
  orange / rouge, alerte sonore facultative) et `GET /checklist.html` (`exploitation/CHECKLIST.md` avec cases à cocher).
- Journal : `exploitation/journaux/<run>.jsonl`, ajout synchrone. Instantané : `exploitation/etat/<run>.instantane.json`
  (écriture atomique au plus 200 ms après un changement, et à l'arrêt).
- Au démarrage, le dernier instantané est repris : le lecteur est reconstruit en rejouant ses entrées (déterministe),
  les clients se reconnectent et reçoivent leur vue courante dans `bienvenue`.

## Ce que le serveur envoie au mur

Le mur est l'écran `mur` de tout acteur qui le déclare (l'écran scène d'Écho). Règles reprises du prototype du 27/10 :
- **Pseudo** : celui du `hello` s'il passe le filtre (2 à 20 lettres, chiffres, `_ . -`, aucun mot interdit), sinon `spectateur_NNN` (acteur nommé : son nom réglé dans la fenêtre Acteurs, à défaut son identifiant) ; unique dans l’acteur (`_2`, `_3`…), gardé à la reconnexion, renvoyé dans `bienvenue.pseudo` ; couleur = un jeton du thème tiré du pseudo.
- **Messages du public** (`in{k:'texte'}`) : 8 par 10 s et par personne (sinon `ack refus trop-vite`), modérés (`noyau/moderation.ts` : mots interdits masqués `***`, refus `filtre` si vide, > 200 caractères ou surtout interdit), puis fx `message` `{id, pseudo, texte, couleur, grand:true}` au mur et à la régie, valable 30 s.
- **Répliques des figurants** (`agent.in{k:'say', data:{persona, texte, couleur?}}`) : même modération, fx `message` `grand:false`.
- **Voix** : chaque vote accepté donne fx `a-vote` `{pseudo, index}` au mur (10 s).
- **Question du vote** : les vues `mur` (`vote:'ouvert'|'revele'|'ferme'` + `numero`) et `vote` sont complétées avec la question et les réponses de la banque ; à la révélation, `comptes` (voix réelles, ou `scores` de la banque : résultat forcé, signalé à la régie par `salle.vote.force`), `pourcents`, `gagnant`, `resultat` (phrase de la banque). Ce qu'un projet écrit déjà n'est pas remplacé.
- **Banques** : l’hôte lit `prototypes/figurants/banques/interdits.txt` plus `<banque>/interdits.txt` (concaténées, dédoublonnées) et `prototypes/figurants/banques/<banque>/votes.json` (`<banque>` = `agent.config.banques` de l'acteur figurants) ; un fichier absent est ignoré.
- **Reprise et panique** : les effets du mur encore valables sont rejoués à la reconnexion (200 au plus) ; en panique, aucun ne part.

## Pas encore fait

Latences d'affichage agrégées (rapport 2 §4.3) · capteurs bruit et assis (valeurs neutres) ·
rejeu de la fin du journal postérieure à l'instantané · orchestrateur,
Whisper, ElevenLabs, R2, TURN, sortie · adaptateur Durable Object · alertes poussées à la régie et pastilles dans le Conducteur.
Fait par le lot exploitation : script de lancement et d'arrêt, tunnel (fichiers et procédure seulement : rien n'est créé chez Cloudflare), page de santé, check-list.
