# Contexte commun de l'audit d'architecture (28 octobre 2026)

Ce fichier est lu par chaque agent d'audit avant son chantier. Il résume ce qu'est STUDIO_REAL, ce qui a été
bricolé le 27/10 pour le spectacle « Écho », et les règles de l'audit.

## Ce qu'est STUDIO_REAL

Un studio pour créer des **spectacles de théâtre augmentés par les téléphones du public**. Deux mondes cohabitent :

1. **Le Conducteur** (`apps/conducteur`, React 19 + zustand + Vite, ~12 000 lignes) : timeline + planche nodale,
   moteur déterministe dans `packages/modele` (`planifier`, `lecteur`, `blocs-moteur`, `salle` simulée, `valider`),
   sortie **Écran scène** détachable (`src/sortie`, fenêtre `sortie.html`, protocole BroadcastChannel/relais),
   streamer WebRTC (`src/streamer`, `src/flux`), salle collaborative (`src/collab`, `src/etat/serveur.ts`) sur
   un **Cloudflare Worker + Durable Object + D1 + R2** (`apps/serveur`, jamais déployé : `wrangler dev` en local).
   Construit et publié sur **GitHub Pages** dans `conducteur/` à la racine (`npm run pages -w conducteur`, dossier
   `conducteur/` versionné). Thème : `packages/theme` (jetons sombre/clair, police Venus Rising versionnée à la demande
   du propriétaire, Chakra Petch, Azeret Mono). Interface en **français**.
2. **Le prototype « figurants »** (`prototypes/figurants`, Node ≥ 20 + `ws`, ~4 000 lignes hors banques) : né pour
   les figurants IA (chat façon Twitch nourri par Ollama/Anthropic), il a servi de **serveur de spectacle** le 27/10 :
   pages téléphone du public (`pages/echo`, `pages/telephone`), mur projeté (`pages/chat`), régie (`pages/regie`),
   comédien (`pages/comedien`), téléphone de la ministre (`pages/ministre`), visio Franck ↔ ministre (`pages/visio`),
   flux Instagram (`pages/flux`), vote truqué (`banques/echo/votes.json`), audio de Junon et du président
   (`medias-locales/*.mp3`, hors git). Protocole JSON sur `/ws` : `prototypes/figurants/PROTOCOLE.md`.

Les deux sont reliés par un **pont bricolé** : `apps/conducteur/src/coquille/pont-figurants.ts` ouvre un WebSocket
vers le serveur figurants (`?figurants=wss://…/ws&jeton_regie=…`, retenu en localStorage) et, à chaque top de la régie
(changement de `lecture.moment`), envoie les `params.cmds` de la première étape du moment. Le mur, le vote et la
visio sont affichés dans la sortie Écran scène par une scène `page` (iframe vers le serveur, exposé par un tunnel
`cloudflared` quick dont l'adresse change à chaque lancement : `https://highway-regions-temperatures-penn.trycloudflare.com`
est codée en dur dans `projets/echo/generer-echo-simple.ts`).

## Le spectacle « Écho » du 27/10/2026

Jim/Franck (influenceur, sur scène), la ministre Junon (audio précalculé + visio), le président Boilot (audio),
l'IA Écho jouée par un **agent ElevenLabs** (`agent_…(identifiant hors dépôt)`, page `pages/echo` de Franck).
Le projet joué est la **version SIMPLE** (`projets/echo/generer-echo-simple.ts` → `echo.conducteur.json`, 7 blocs,
14 étapes, chacune attend le top). La version détaillée (`generer-echo-complet.ts`, 138 étapes, textes de l'auteur
extraits de `DEROULE-AUTEUR.md`) reste générable et réécrit le même JSON.

**Problèmes vécus** : latences ressenties, vidéos très lentes à démarrer (téléphones et sortie), visio réglable nulle
part dans l'interface, tests sur vrais téléphones pénibles, lecture qui n'attendait pas les tops (d'où la pause
automatique sur les passages et le gros bouton TAP ajoutés à la hâte), fenêtre de sortie en cache sur GitHub Pages
(mire au lieu de la scène), serveur à redémarrer sans cesse, tunnel à recoller partout (QR, Conducteur, pages),
jeton de régie dans l'URL, ports qui restent occupés, tunnel SSH vers dgx2 qui tombe, état perdu au rechargement.

## Le journal git du 27/10 (du plus ancien au plus récent)

- `488c384` 27/10 11:26 — Figurants : transcription par Whisper sur un DGX au lieu de la reconnaissance du navigateur
- `b095c44` 27/10 11:58 — Figurants : transcription fiable depuis le téléphone du comédien
- `f0d1cab` 27/10 12:12 — Figurants : fiches allégées pour le petit modèle local, plus de répliques recopiées
- `f2c7a26` 27/10 12:42 — Conducteur : socle du logiciel (monorepo, format du projet, contrat du moteur, design)
- `998d709` 27/10 13:12 — Conducteur : première version assemblée (moteur, interface, blocs, serveur, projet LIVE)
- `e006790` 27/10 13:38 — Conducteur : finition (fidélité au design, moteur complet, collaboratif)
- `34da008` 27/10 14:26 — Conducteur : sortie Écran scène, flux du téléphone en direct, thème partout
- `0b19166` 27/10 14:56 — Essai réel du flux : correctifs et barre de scène
- `135ce87` 27/10 15:22 — Sortie écran : bascule réparée (canal local + salle, arbitrage par date)
- `428fdad` 27/10 15:27 — Projet Écho : le spectacle de l'auteur monté dans le Conducteur
- `3299cc3` 27/10 15:33 — GitHub Pages : le Conducteur en ligne (conducteur/), lien Écho sur l'accueil
- `88e2925` 27/10 15:40 — Police Venus Rising dans le dépôt (Conducteur, thème, GitHub Pages)
- `0c8f25c` 27/10 15:43 — Planche : la trame espace ses points au dézoom (règle du canvas d'idéation de ShowRunner)
- `2d206cc` 27/10 15:55 — Page du public d'Écho (echo/, fixe) et QR qui pointe dessus
- `723d067` 27/10 16:04 — Écho ce soir : téléphone du spectateur (phrases à toucher, émojis), commentaires spectateurs plus gros, adresse du QR réglable
- `9810165` 27/10 16:22 — Écho : banques des figurants et phrases du public par séquence, choix de séquence dans la régie
- `8cc36e4` 27/10 16:40 — Écho simplifié : 6 blocs du déroulé, une étape = un top régie, sans piste lumière ni garde
- `5977c03` 27/10 16:41 — Écho : LISEZMOI à jour (version simple embarquée)
- `4fe3435` 27/10 16:41 — Écho séq. 4 : vote truqué (5 questions provisoires), écran « téléphone de la ministre », bloc vote dans la régie
- `a543a9d` 27/10 16:56 — Écho bloc 1 : flux Insta en vidéo sur les téléphones, puis abonne / désabonne et pourquoi, réponses en direct sur le mur
- `3e1c119` 27/10 17:03 — QR du public : le tunnel du soir par défaut, une adresse locale retenue est oubliée
- `09965de` 27/10 17:05 — QR du public : correctif de l'expression (adresses locales oubliées)
- `6752dea` 27/10 17:09 — Spectacle : lecture en temps réel par défaut, chaque étape d'Écho attend le top ; discours de Junon (audio + 52 commentaires) sur le mur
- `7a40bc1` 27/10 17:30 — Écho, conduite du soir : taps dans l'ordre (vidéo, flux, Junon, notification modérateur, questions 1-2-3-4-15 réponses puis résultat, noir, président), réponses en grand et « @x a voté » sur le mur
- `2b31835` 27/10 17:35 — Écho : page de Franck (appel ElevenLabs ECO + les 5 questions en prompteur, question ouverte par la régie en avant)
- `7259daf` 27/10 17:40 — Écho : visio Franck ↔ ministre (deux téléphones), les deux vidéos sur l'écran scène, son de Franck coupé par défaut
- `64ef575` 27/10 17:50 — Écho : la timeline du Conducteur suit le cheminement du soir (7 blocs, un tap de la régie par étape)
- `ec08ee4` 27/10 18:01 — Écho : le Conducteur pilote le spectacle (pont vers le serveur : chaque top envoie téléphones, mur, vote, audio), QR sur le mur
- `a9fe965` 27/10 18:03 — Conducteur : gros bouton TAP en bas (grisé tant qu'on ne peut pas passer)
- `72b32bc` 27/10 18:07 — Sortie Écran scène : scène « page » (le mur et la visio du spectacle dans la sortie), Écho la règle par étape ; TAP lance la lecture
- `68590f1` 27/10 18:09 — Conducteur : pause automatique sur chaque passage, le TAP repart ; la fenêtre de sortie charge toujours la dernière version
- `c1045cd` 27/10 18:10 — Écho : le flux Insta aussi sur l'écran scène (sortie du Conducteur)

(`git show --stat <hash>` pour les fichiers touchés ; `git log -p --since=2026-10-27 -- <fichier>` pour le détail.)

## Règles pour les agents d'audit

- Lire d'abord ce fichier, puis `README.md`, `projets/echo/LISEZMOI.md`, `prototypes/figurants/PROTOCOLE.md`,
  `apps/serveur/README.md` et `apps/serveur/PROTOCOLE.md`, puis les fichiers de son chantier.
- **Ne jamais lancer `find` ou `grep -r` hors de `C:\STUDIO_REAL`** ; ne pas ouvrir `medias-locales/` ni `node_modules/`
  ni `apps/serveur/.wrangler/` (artefacts).
- **Ne modifier aucun fichier du dépôt** sauf son propre rapport `docs/audit-2026-10/0N-*.md`. Pas de `npm install`,
  pas de déploiement, pas de serveur lancé sur un port, pas de connexion aux machines distantes (DGX, station 3090).
- Rapport en **français**, Markdown, avec pour chaque constat une **preuve** (`fichier:ligne`, extrait court, ou commit).
- Structure imposée du rapport :
  1. Résumé (10 lignes max)
  2. Constats (numérotés C1, C2… ; chacun : preuve, impact vécu le 27/10 si connu, gravité P0/P1/P2)
  3. Risques (ce qui casse au prochain spectacle si rien n'est fait)
  4. Proposition cible (architecture / conception, avec schémas en texte si utile)
  5. Lots de travail proposés (L1, L2… ; chacun : objectif, fichiers concernés, taille S/M/L avec estimation en heures
     d'un développeur, dépendances, **exécutant conseillé** : « Qwen local » pour tests/doc/boilerplate/refactor borné,
     « Haiku 5.5 » pour du simple en volume, « Sonnet 5.5 » pour du code courant, « Claude (Opus/Fable) » pour
     architecture, sécurité, décisions produit, tâches floues ou qui touchent beaucoup de fichiers)
  6. Questions au propriétaire (décisions qu'il doit prendre)
