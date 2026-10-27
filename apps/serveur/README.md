# Serveur du Conducteur (Cloudflare Workers, local d'abord)

Worker TypeScript qui sert, **sur le même domaine** :

- l'interface (`apps/conducteur/dist`, Workers Static Assets, application monopage) ;
- l'API REST `/api` : projets et versions (**D1**), médias (**R2**), exécutions ;
- la salle temps réel d'un projet : **Durable Object `SalleProjet`** (un par projet, WebSocket Hibernation, SQLite)
  — présence, curseurs, chat, commentaires épinglés, verrous en mode Scène, deltas numérotés + instantanés,
  diffusion de l'état de lecture. Protocole : [PROTOCOLE.md](PROTOCOLE.md).

Tout tourne **en local** avec `wrangler dev` (D1, R2 et Durable Object simulés dans `.wrangler/state`).
Rien n'est déployé, aucune connexion au compte Cloudflare n'est nécessaire.

## Lancer en local

```sh
cd C:\STUDIO_REAL
npm install                         # une fois
copy apps\serveur\.dev.vars.exemple apps\serveur\.dev.vars   # puis mettre un vrai JETON_ADMIN (≥ 16 caractères)
npm run build                       # facultatif : construit l'interface (sinon une page d'attente est servie)
npm run dev -w serveur              # migrations D1 locales + wrangler dev --local → http://localhost:8787
```

Équivalent à la main, depuis `apps/serveur` : `npx wrangler d1 migrations apply DB --local` puis `npx wrangler dev --local`
(ajouter `--assets ./attente` tant que `apps/conducteur/dist` n'existe pas : wrangler refuse un dossier absent).

Essai rapide :

```sh
curl -X POST http://localhost:8787/api/projets -H "Authorization: Bearer <JETON_ADMIN>" -H "content-type: application/json" -d "{\"titre\":\"Essai\"}"
# → {"id":"p_…","jeton":"sr_…",…}   le jeton du projet n'est affiché qu'une fois
curl http://localhost:8787/api/projets/p_…  -H "Authorization: Bearer sr_…"
```

Interface en développement (Vite, port 5173) : elle appelle `http://localhost:8787/api/...` ; les origines
`http://localhost:5173` et `http://127.0.0.1:5173` sont autorisées par défaut (CORS et WebSocket).

## Vérifier

```sh
cd C:\STUDIO_REAL\apps\serveur
npx tsc --noEmit                      # Worker (types Cloudflare)
npx tsc --noEmit -p tsconfig.tests.json   # tests et logique pure (types Node)
npx vitest run                        # logique pure + intégration (lance wrangler dev sur un port libre, puis l'arrête)
```

## Variables

| Nom | Où | Rôle |
|---|---|---|
| `JETON_ADMIN` | **secret** : `.dev.vars` en local (ignoré par git), `wrangler secret put` en production | crée et liste les projets, accède à tous |
| `ORIGINES_AUTORISEES` | `wrangler.jsonc` → `vars` | origines permises (CORS, WebSocket), séparées par des virgules ; la même origine est toujours permise |
| `TAILLE_MAX_MEDIA` | `vars` | taille max d'un média (octets, défaut 50 Mo) |
| `TAILLE_MAX_PROJET` | `vars` | taille max d'un projet enregistré (octets, défaut 1,8 Mo ; D1 limite une ligne à 2 Mo) |

## API REST

Accès : `Authorization: Bearer <jeton>` (ou `X-Jeton-Projet`, ou `?jeton=` pour le WebSocket et les balises
`<audio>`/`<img>`). Jeton du projet (créé avec lui, seule son empreinte SHA-256 est stockée) ou `JETON_ADMIN`.
Réponses JSON ; erreurs `{erreur, message}`. `X-Auteur: <nom>` renseigne l'auteur des versions et médias.

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/api/sante` | état du service (sans jeton) |
| GET | `/api/projets` | liste (admin) |
| POST | `/api/projets` | crée (admin) : `{}` / `{titre, project?, assets?}` / fichier d'échange complet `{format:'studio-real/conducteur@1', project, assets, runs}` (import). Renvoie `{id, jeton, version:1}` |
| GET | `/api/projets/:id` | dernière version enregistrée `{version, project, assets, …}` (ETag `"v<n>"`) ; `?direct=1` : copie de travail en direct de la salle `{seq, version, modifie, projet}` |
| PUT | `/api/projets/:id` | enregistre `{version_base, project, assets?, message?}` (ou `If-Match: "v<n>"`) → `{version}` ; **409** `{erreur:'conflit', version_actuelle}` si quelqu'un a enregistré entre-temps ; 428 sans version de base |
| GET | `/api/projets/:id/versions` | historique (200 dernières) `{versions:[{version, auteur, message, taille, cree_le}]}` |
| GET | `/api/projets/:id/versions/:n` | contenu d'une version |
| GET | `/api/projets/:id/export` | fichier d'échange complet (avec les exécutions) |
| GET | `/api/projets/:id/medias` | liste des médias (R2) |
| PUT | `/api/projets/:id/medias/:nom` | téléverse (corps brut, `Content-Type` et `Content-Length` requis ; son, image, vidéo, texte, JSON, PDF ; pas de SVG/HTML) ; 413 au-delà de la taille max |
| GET/HEAD | `/api/projets/:id/medias/:nom` | lit (gère `Range` pour la lecture audio/vidéo, `If-None-Match`) |
| DELETE | `/api/projets/:id/medias/:nom` | supprime le média |
| GET | `/api/projets/:id/runs` | exécutions (sans événements) |
| POST | `/api/projets/:id/runs` | crée `{id?, mode:'repetition'\|'scene', debut?, evenements?}` (idempotent sur `id`) |
| GET | `/api/projets/:id/runs/:run` | exécution complète `{id, mode, debut, evenements}` |
| POST | `/api/projets/:id/runs/:run/evenements` | ajoute `{premier, evenements[]}` : l'événement i a le rang `premier+i` ; un renvoi n'ajoute pas de doublon → `{recus, ignores, total}` (1000 max par envoi) |
| GET (WebSocket) | `/api/projets/:id/salle?jeton=…` | salle temps réel (voir PROTOCOLE.md) |

## Organisation

```
wrangler.jsonc        Worker, assets (../conducteur/dist), D1 « DB », R2 « MEDIAS », DO « SALLE »
migrations/           schéma D1 (projets, versions, runs, evenements)
src/index.ts          routeur /api, CORS, contrôle d'accès, médias, exécutions
src/salle/            Durable Object SalleProjet
src/logique/          PUR (testé sous Node) : opérations (deltas), verrous, protocole, validation
src/depot.ts          accès D1 (contrôle de conflit en SQL, lot transactionnel)
src/securite.ts       jetons (empreinte SHA-256, comparaison à temps constant)
scripts/dev.mjs       migrations locales + wrangler dev --local
attente/              page servie tant que l'interface n'est pas construite
tests/                logique pure + intégration wrangler dev
```

## Sécurité (prototype)

- Jeton par projet, en-tête ou paramètre ; jeton admin en secret. Aucun secret dans le dépôt (`.dev.vars` ignoré).
- CORS restreint à `ORIGINES_AUTORISEES` (+ même origine) ; toute requête `/api` d'une autre origine → 403,
  WebSocket compris.
- Limites : projet 1,8 Mo, média 50 Mo, message WebSocket 256 Ko, chat 2000 caractères, 200 opérations par delta,
  1000 événements par envoi, corps JSON bornés (Content-Length et taille réelle).
- Médias servis avec `Content-Security-Policy: sandbox` et `nosniff` ; SVG et HTML refusés au téléversement.
- Limites connues : identité déclarative dans la salle (tous partagent le jeton du projet) ; jeton en paramètre
  d'URL pour le WebSocket (visible dans les journaux) ; pas de limitation de débit. À traiter avant un usage public :
  comptes (Cloudflare Access ou session signée), rôles par jeton (régie / poste), rate limiting.

## Déployer plus tard (NE PAS faire sans le propriétaire)

1. `npx wrangler login` (compte du propriétaire).
2. Créer les ressources : `npx wrangler d1 create studio-real-conducteur` → recopier le `database_id` dans
   `wrangler.jsonc` ; `npx wrangler r2 bucket create studio-real-medias`.
3. Schéma : `npx wrangler d1 migrations apply DB --remote`.
4. Secret : `npx wrangler secret put JETON_ADMIN`.
5. `ORIGINES_AUTORISEES` : mettre le domaine de production (ou vider : même origine seulement).
6. Construire l'interface (`npm run build` à la racine), puis `npx wrangler deploy` depuis `apps/serveur`.
   Le Durable Object `SalleProjet` est créé par la migration `v1` (`new_sqlite_classes`) de `wrangler.jsonc`.
7. Domaine : route ou domaine personnalisé dans `wrangler.jsonc` (`routes`), ou activer `workers_dev`.
   Un déploiement coupe les WebSockets ouverts : les clients se reconnectent (`hello` avec leur `seq`).
   Plan Workers Paid (5 $/mois) conseillé par l'étude `docs/etudes/serveur-temps-reel.md`.
