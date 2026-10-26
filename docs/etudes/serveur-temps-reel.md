# Étude : serveur temps réel pour STUDIO_REAL (100 à 500 téléphones)

*Étude du 26 octobre 2026. Complète [03 — Moteur de scénario](../03-moteur-scenario.md), [04 — Connexion et reprise](../04-connexion-reprise-reseau.md) et [07 — Architecture technique](../07-architecture-technique.md).*

**Convention de lecture.** `[Sn]` renvoie à la liste de sources en fin de document (§10). Une phrase marquée **[Estimation]** est un ordre de grandeur de l'auteur, **non sourcé**, à confirmer par les tests du §9. Une phrase marquée **[À vérifier]** repose sur une source indirecte ou contradictoire. Les budgets de recherche web ont été épuisés avant la fin : quelques points (Kahoot, détails d'Artillery distribué, Local Network Access pour WebSocket) restent donc partiels, et c'est signalé là où c'est le cas.

---

## 0. Décisions (le résumé qui engage)

| # | Décision | Pourquoi en une ligne |
|---|----------|-----------------------|
| D1 | **Production : Cloudflare Workers + 1 Durable Object (SQLite) par représentation**, plan **Workers Paid (5 $/mois)** | Conçu pour « une salle = un objet avec état, WebSockets et minuteurs » ; 500 connexions × 2 h coûtent **0 $ au-delà du forfait de 5 $** (§2.5) ; rien à maintenir. |
| D2 | **Le client (téléphone, scène, régie) est servi par le même Worker** (Workers Static Assets), sur le même domaine que le WebSocket. GitHub Pages ne reste que miroir de maquette/dev. | Même origine : plus de CORS, cookie de session *first-party* posé par le serveur (hors du plafond de 7 jours de Safari), `wss://` sans certificat à gérer. |
| D3 | **Le moteur est un paquet TypeScript pur**, branché au Durable Object par un adaptateur (`Storage`, `Clock`, `Transport`). Le même paquet tourne sur Node (`ws`) pour le développement, les bots et le **plan B**. | On ne s'enferme pas chez un fournisseur : le plan B (Node sur DGX ou VPS) coûte un adaptateur, pas une réécriture. |
| D4 | **Pas de framework de jeu ni de service de pub/sub** (Colyseus, Socket.IO, PartyKit/PartyServer, Liveblocks, Ably, Pusher). | Notre valeur est le moteur déterministe + journal + reprise ; ces produits imposent leur modèle d'état ou ne fournissent que la tuyauterie (§1.3). |
| D5 | **Reprise = snapshot d'abord.** Deltas numérotés par téléphone uniquement pour détecter un trou ; au moindre doute, on renvoie un snapshot. Entrées **idempotentes** (`cseq` par joueur). | État par téléphone minuscule (< 2 Ko) : 500 snapshots d'un coup = environ 1 Mo ; la complexité des « deltas manquants rejoués » n'achète rien. |
| D6 | **Synchro d'horloge : Cristian multi-échantillons filtré sur le plus petit RTT**, mesuré avec `performance.now()`, entretenu par le heartbeat de 10 s. Effets programmés à `at = heure serveur`. | Précision visuelle réaliste **±25 à 40 ms** sur la salle (§4.3), pas ±20 ms. Le son n'est pas une cible de synchro. |
| D7 | **Gel des déploiements** le jour d'un spectacle : déployer une nouvelle version **coupe tous les WebSockets** [S3]. | Un `wrangler deploy` pendant le show = reconnexion générale. |
| D8 | **Un seul DO par représentation : plafond ~1 000 requêtes/s** (limite souple) [S2][S6] → les flux denses (capteurs 5 Hz, réactions) sont **agrégés côté téléphone**. | 500 × 5 Hz = 2 500 msg/s dépasserait la limite : la doc 07 (« capteurs à 5 Hz ») doit être corrigée (§8). |

---

## 1. Hébergement : comparatif

### 1.1 Les options en un tableau

| Option | Capacité 500 conn. | État / reprise | Coût (500 conn., 2 h) | Entretien | Verdict |
|--------|--------------------|----------------|-----------------------|-----------|---------|
| **Cloudflare Workers + Durable Objects (SQLite)** | Oui : jusqu'à 32 768 WebSockets par DO avec l'API Hibernation [S4] ; limite pratique = CPU/mémoire (128 Mo partagés) [S11] | SQLite intégré dans l'objet, 30 jours de restauration à un instant donné [S7] ; alarmes pour les minuteurs [S5] | **5 $/mois** (forfait Paid), usage réel bien sous les quotas inclus (§2.5) | Aucun serveur ; mais déploiement = coupure des sockets [S3] | **RETENU (D1)** |
| Node + `ws` sur VPS | Oui, très large | À construire : SQLite/Postgres, reprise du processus | quelques euros/mois **[Estimation]** | TLS (Caddy/Let's Encrypt), supervision, une seule région | Plan B / développement |
| Node + uWebSockets.js sur VPS | Oui, marge énorme (≈ 5 Ko par connexion inactive, mesure du concurrent AnyCable [S23]) | idem | idem | Module natif installé depuis une étiquette GitHub, pas depuis le registre npm classique [S23] | Inutile à 500 connexions ; `ws` suffit |
| Colyseus (Node) | 1 000–2 000 connexions sur 1 vCPU/1 Go pour un jeu simple (FAQ officielle) [S18] | Reconnexion par jeton (`allowReconnection`, ex. 30 s) [S18] ; état synchronisé par « patches » de schéma | Hébergement Node (ou Colyseus Cloud) | Il faut quand même un serveur ; Redis pour passer à l'échelle | Écarté : sa couche d'état concurrence notre moteur/journal |
| PartyKit / **PartyServer** | Même base que le DO | `hibernate: true`, `broadcast`, tags de connexion ; `setState` limité à 2 Ko [S17] | Identique au DO | Dépôt `cloudflare/partykit`, 42 tickets ouverts, README sans niveau de stabilité annoncé [S17] **[À vérifier]** | Utile pour prototyper ; en prod on écrit la classe DO nous-mêmes (API courte, 16 Ko d'attachement au lieu de 2 Ko) |
| Socket.IO | Oui | « Connection state recovery » : récupère id, rooms, `data` et les paquets manqués après coupure brève, **sans garantie**, seulement avec adaptateur mémoire / Redis Streams / MongoDB [S19] | Hébergement Node | idem | Écarté : la reprise n'est pas garantie, on doit de toute façon écrire la nôtre |
| Liveblocks | **Non** : 50 connexions simultanées par salle sur le plan Pro (page « limits ») [S22] **[À vérifier : plusieurs pages se contredisent]** | CRDT/documents partagés | — | — | Hors sujet (outil d'édition collaborative) |
| Ably | Standard : 29 $/mois + usage, 10 k connexions, 2,5 k msg/s ; **Free : 200 connexions** [S20] | Pub/sub avec historique | 29 $ + consommation (messages 2,50 $/million, minutes de connexion 1 $/million) [S20] | Aucun serveur de **transport**, mais **le moteur autoritaire reste à héberger ailleurs** | Écarté : il faudrait *aussi* un serveur de jeu |
| Pusher Channels | Startup : 49 $/mois, **500 connexions** (pile la limite), 1 M msg/jour ; Pro : 99 $/mois, 2 000 [S21] | Pub/sub | 49–99 $/mois | idem Ably | Écarté : même raison, et plus cher que Cloudflare |
| **Serveur local en salle** (machine de régie + tunnel) | Oui | Dépend de la machine | 0 | Un `https` page ne peut pas ouvrir un `ws://` (contenu mixte) [S27] ; il faut un vrai certificat. Les certificats Tailscale sont liés aux machines du tailnet : le public n'y est pas [S38] | Seulement pour une salle **sans Internet** (phase 3, §1.5) |

### 1.2 Pourquoi Cloudflare Durable Objects plutôt que le VPS

1. **Le modèle colle au besoin.** « Créer un DO par unité logique (salle de chat, session de jeu) », ID déterministe par nom, « WebSockets longue durée et minuteurs par entité » : c'est le cas d'usage cité par la doc [S6]. Une représentation = `idFromName("K7Q2")`.
2. **Le stockage est dans l'objet.** SQLite synchrone dans le DO ; les écritures sans `await` intermédiaire sont fusionnées en une transaction atomique [S6][S7]. Pas de base à déployer, pas de latence réseau vers la base.
3. **Les minuteurs de gates ont un support natif** : les alarmes (§2.3).
4. **Coût et exploitation** : 5 $/mois pour tout (§2.5), pas de TLS à renouveler, pas de processus à superviser.
5. **Contre-points honnêtes :** (a) un seul objet = un seul point de défaillance et une seule région ; (b) un déploiement coupe tous les sockets [S3] ; (c) la limite souple de **1 000 requêtes/s par objet** [S2] oblige à agréger les flux denses ; (d) débogage moins direct qu'un Node local (atténué par `wrangler dev` et par le plan B Node) ; (e) dépendance à un fournisseur (atténuée par D3).

### 1.3 Pourquoi pas les frameworks / services

- **Colyseus** apporte salles, matchmaking et synchro d'état par schéma. Notre moteur est un **automate déterministe rejouable depuis un journal** qui produit des « vues par téléphone » ; mélanger les deux crée deux sources de vérité. Sa reconnexion (jeton + `allowReconnection`) est la même idée que la nôtre, sans l'idempotence du journal [S18].
- **Socket.IO** : la doc le dit elle-même, la récupération « n'est pas toujours réussie » et l'appli doit gérer la resynchronisation [S19]. Son atout (repli HTTP long-polling) est sans objet en 2026 sur des téléphones récents.
- **Ably / Pusher / Liveblocks** : ce sont des tuyaux (ou des CRDT). Sans serveur de jeu à côté, rien ne décide « 100 % des présents ont voté ». On paierait un service **en plus** de l'hébergement du moteur.
- **PartyServer** : très proche de notre choix (il *est* un habillage de DO) ; on peut l'adopter pour gagner une journée, mais on garde la main sur l'attachement de 16 Ko, les alarmes et le journal. Décision : classe DO maison, 150 lignes.

### 1.4 Le client statique et GitHub Pages (CORS, wss, certificats)

| Sujet | Avec client sur GitHub Pages | Avec client servi par le Worker (**recommandé**) |
|-------|------------------------------|--------------------------------------------------|
| WebSocket | `wss://studio-real.<compte>.workers.dev/ws/K7Q2` depuis `https://calculment0r.github.io`. Le certificat est celui de Cloudflare (rien à faire). Un `ws://` est interdit depuis une page HTTPS [S27]. | Même origine, `wss://` relatif. |
| CORS | Les appels HTTP (`/api/join`, API régie) exigent `Access-Control-Allow-Origin: https://calculment0r.github.io` + préflight. Le handshake WebSocket n'est pas soumis à CORS mais **le serveur doit vérifier l'en-tête `Origin`** (liste d'origines autorisées) **[connaissance générale, à tester]**. La doc Cloudflare conseille de valider les requêtes dans le Worker, avant le DO, pour ne pas facturer les requêtes invalides [S3]. | Aucun CORS ; vérification `Origin` = notre domaine. |
| Cookie de jeton | Cookie du serveur vu depuis `github.io` = cookie **tiers** : à ne pas compter dessus, surtout sur Safari. Le jeton reste donc dans `localStorage`/IndexedDB, soumis au plafond de 7 jours d'ITP (§3.4). | Cookie `HttpOnly; Secure; SameSite=Lax` posé par le serveur, *first-party*. |
| Déploiement | Deux pipelines (Pages + Worker), deux versions à garder compatibles. | Un seul : le Worker embarque les fichiers statiques et le DO. |
| Coût | 0 | Les requêtes de fichiers statiques sont **gratuites et illimitées** sur Workers [S9]. |

**Conséquence :** le QR code de la doc 04 (`https://calculment0r.github.io/STUDIO_REAL/?r=K7Q2`) doit pointer vers le domaine du Worker (`workers.dev` gratuit, ou un domaine perso passé chez Cloudflare). GitHub Pages reste utile comme maquette publique et pour le banc d'essai des capacités.

### 1.5 Serveur local en salle : quand et comment

Seulement si une salle n'a **aucun accès Internet fiable**. Contraintes recensées :
- Page HTTPS → `ws://` interdit (contenu mixte) ; localhost est l'exception courante [S27].
- Chrome introduit une permission « Local Network Access » (invite à partir de Chrome 142) ; à la date de la page consultée, **les WebSockets n'étaient pas encore soumis** à cette invite mais l'extension était annoncée « bientôt » [S37] **[À vérifier]**.
- Les certificats `tailscale cert` sont émis pour des noms `machine.tailnet.ts.net` et seules les machines du tailnet y accèdent : inutilisable pour 500 téléphones du public [S38].
- Piste à valider : un nom de domaine public qui résout vers l'IP privée de la salle, avec un certificat Let's Encrypt par challenge DNS (Caddy) **[connaissance générale, non vérifiée]** ; plus le client statique servi *par la machine locale* (sinon il faut Internet pour charger la page).
- Réseau : pas de portail captif (déjà acté en doc 04 §5).

Verdict : phase 3 uniquement, avec l'adaptateur Node du plan B.

---

## 2. Cloudflare Workers + Durable Objects en détail

### 2.1 Architecture

```
Téléphone ──wss──▶ Worker (routeur, 0 état)
  GET /ws/:code  : vérifie Upgrade=websocket, Origin, forme du code
                   └─▶ env.ROOM.getByName(code).fetch(request)
                                   │
                          Durable Object « Room »  (1 par représentation)
                          ├─ moteur de scénario (paquet pur, en mémoire)
                          ├─ WebSockets acceptés avec ctx.acceptWebSocket(ws, tags)
                          │    tags : "p:<joueurId>", "role:spectateur", "zone:balcon"…
                          │    attachement (≤ 16 Ko) : {joueurId, vseq, lastSeen}
                          ├─ SQLite : journal, snapshots, joueurs, minuteurs
                          └─ alarme unique = prochain minuteur dû
Écran scène / régie : mêmes WebSockets, rôles et jetons différents (/ws/:code?role=regie)
Fichiers statiques (player/stage/regie) : servis par le même Worker, hors DO
```

- Le Worker rejette tout ce qui n'est pas un `GET` WebSocket valide avec un code connu avant de réveiller le DO [S3].
- `getByName()`/`idFromName()` : même code → même objet [S6].
- **Emplacement.** Le DO est créé près de la première requête `get()` ; il ne bouge plus ensuite [S8]. On le crée donc depuis la **régie dans la salle** (ou avec `locationHint: "weur"`), pas depuis un test à l'autre bout du monde. Pour le RGPD (pseudos, messages), `jurisdiction("eu")` restreint exécution **et** stockage à l'UE [S8] ; à décider en connaissance de cause car l'identifiant d'objet change avec la juridiction.
- **Plafond d'objet** : 1 000 requêtes/s, limite souple ; au-delà, erreurs « overloaded » [S2] ; « environ 500 à 1 000 requêtes simples par seconde » selon la page des bonnes pratiques [S6].

### 2.2 WebSocket Hibernation : ce qu'il apporte ici

- L'API `acceptWebSocket` permet à l'objet de dormir sans couper les clients ; l'état mémoire est perdu à l'éveil, d'où l'attachement (≤ **16 384 octets** par socket, perdu si le socket se ferme) [S3].
- Les **pings/pongs** protocolaires sont répondus automatiquement sans réveiller l'objet [S3] ; `setWebSocketAutoResponse` peut répondre à un message texte fixe (≤ 2 048 caractères) sans réveil [S4].
- **Pendant un spectacle l'objet ne dort pas** : alarmes, `setTimeout`, requêtes entrantes empêchent l'hibernation [S3]. Ce n'est pas un problème (coût en §2.5). L'hibernation sert surtout **avant l'ouverture des portes** (salle créée, personne connecté) et **après** le spectacle.
- Dans tous les cas on écrit le code comme si l'objet pouvait être évincé à tout moment : au réveil, le constructeur recharge l'état depuis SQLite (`blockConcurrencyWhile`, 30 s max) [S4][S6], et `ctx.getWebSockets()` redonne les sockets encore ouverts avec leurs attachements.
- Ne pas oublier : sur les dates de compatibilité antérieures à 2026-04-07, appeler `ws.close()` dans `webSocketClose` pour éviter les codes 1006 [S6]. On fixera `compatibility_date` récente.

### 2.3 Stockage SQLite et alarmes

**Stockage.** SQLite par objet : 10 Go par objet, une ligne/valeur ≤ 2 Mo [S2] ; restauration à tout instant des 30 derniers jours (bookmarks) [S7]. Schéma proposé :

```sql
CREATE TABLE journal (seq INTEGER PRIMARY KEY AUTOINCREMENT, t_ms INTEGER NOT NULL,
                      kind TEXT NOT NULL, actor TEXT, cseq INTEGER, payload TEXT NOT NULL);
CREATE TABLE snapshots (seq INTEGER PRIMARY KEY, t_ms INTEGER NOT NULL, state TEXT NOT NULL);
CREATE TABLE players  (id TEXT PRIMARY KEY, token_hash BLOB UNIQUE, pseudo TEXT, role TEXT,
                       zone TEXT, last_cseq INTEGER DEFAULT 0, vseq INTEGER DEFAULT 0,
                       last_seen_ms INTEGER);
CREATE TABLE timers   (id INTEGER PRIMARY KEY, at_ms INTEGER NOT NULL, kind TEXT, payload TEXT);
CREATE INDEX timers_at ON timers(at_ms);
```

- Le journal est la vérité ; `snapshots` est une accélération (un snapshot à chaque changement de segment, plus tous les N événements). Récupération : dernier snapshot + rejeu du journal qui suit (doc 03 §8).
- **Déterminisme** : le moteur ne lit jamais l'horloge ni `Math.random` ; l'heure arrive dans les événements (`tick{t}`), et la graine aléatoire est écrite dans le journal. Attention : dans un Worker, `Date.now()` « renvoie l'heure de la dernière entrée/sortie et n'avance pas pendant l'exécution du code » [S16] ; l'horodatage se prend donc à l'arrivée du message, pas au milieu d'un calcul. `performance.now()` n'est pas fourni côté serveur (« aucun autre minuteur ») [S16].
- Facturation SQLite : lignes lues/écrites (25 milliards lues et 50 millions écrites incluses par mois sur Paid) [S1]. Un spectacle de 500 joueurs écrit de l'ordre de 10⁵ lignes **[Estimation]**.

**Alarmes pour les minuteurs de gates.**
- **Une seule alarme par objet** : on range tous les minuteurs dans la table `timers` et l'alarme pointe sur le plus proche ; `alarm()` traite tout ce qui est dû puis reprogramme l'alarme suivante [S5].
- **Au moins une fois** : en cas d'exception, nouvelle tentative avec attente exponentielle à partir de 2 s, 6 essais maximum [S5] ; les handlers doivent être **idempotents** [S6]. Chez nous : un minuteur est supprimé dans la même transaction que son effet, et le moteur ignore « fin de gate » si le gate est déjà passé.
- Le constructeur doit vérifier `getAlarm()` avant de `setAlarm()` [S5].
- **Précision** : la doc ne donne pas de garantie de précision [S5]. Les gates (« au plus tard 90 s ») tolèrent une seconde ; **les effets synchronisés ne passent jamais par l'alarme** : ils partent à l'avance avec `at` (§4).
- Un seul « tick » du moteur à 1 Hz suffit pour les populations « présents » (doc 03 §3.4) : c'est l'alarme qui le déclenche.

### 2.4 Limites utiles, en une table

| Limite | Valeur | Source |
|--------|--------|--------|
| WebSockets par DO (API Hibernation) | 32 768 (CPU/mémoire peuvent abaisser) | [S4] |
| Mémoire | 128 Mo par isolat, partagée entre objets de la même machine ; connexions actives et état comptent | [S1][S11] |
| Débit par objet | 1 000 requêtes/s (souple) | [S2] |
| Taille de message reçu | 32 MiB | [S2] |
| Attachement par socket | 16 384 octets | [S3] |
| Tags par socket | 10 tags de 256 car. max | [S4] |
| CPU par requête / message | 30 s par défaut, jusqu'à 5 min ; chaque message entrant remet le compteur à zéro | [S2] |
| Stockage par objet | 10 Go ; ligne ≤ 2 Mo ; 100 paramètres par requête SQL | [S2] |
| Plan gratuit Workers | 100 000 requêtes/jour, **10 ms CPU** par invocation | [S10] |
| Alarme | une seule par objet ; `alarm()` 15 min de temps réel max | [S2][S5] |
| Déploiement | coupe tous les WebSockets | [S3] |

### 2.5 Prix pour 500 connexions pendant 2 h

**Règles de facturation (officielles).** Plan Paid : minimum 5 $/mois incluant Workers et DO [S9]. DO : 1 M de requêtes incluses puis 0,15 $/M ; 400 000 Go·s incluses puis 12,50 $/M Go·s ; durée facturée sur 128 Mo ; **20 messages WebSocket entrants = 1 requête**, ouverture de connexion = 1 requête, messages sortants et pings protocolaires gratuits [S1]. Workers : 10 M de requêtes et 30 M de ms CPU inclus ; durée, trafic sortant et bande passante non facturés ; une connexion WebSocket = 1 requête, ses messages ne comptent pas côté Worker [S9].

**Hypothèses de charge (pessimistes).** 500 joueurs, 2 h = 7 200 s :
- Entrées utiles : 1 message / 4 s / joueur → 900 000 messages.
- Heartbeat + échantillon d'horloge : 1 / 10 s / joueur → 360 000 messages.
- Rafales de synchro à la connexion/reconnexion : 8 échantillons × 500 × 5 reconnexions → 20 000 messages.
- Sorties : 1 effet/min + deltas, ~ 1 million de messages sortants (gratuits).

| Poste | Quantité | Facturé | Coût |
|-------|----------|---------|------|
| Requêtes DO (messages entrants ÷ 20 + connexions) | ≈ (900 k + 360 k + 20 k) ÷ 20 + 3 000 ≈ **67 000** | 1 M inclus | 0 $ |
| Durée DO sans hibernation (pire cas) | 0,125 Go × 7 200 s = **900 Go·s** | 400 000 inclus | 0 $ |
| Requêtes Worker (upgrades + HTTP) | ≈ 5 000 | 10 M inclus | 0 $ |
| CPU (diffusion, moteur) | quelques millions de ms au pire **[Estimation]** | 30 M inclus | 0 $ |
| SQLite : lignes écrites / lues | ~10⁵ / ~10⁶ **[Estimation]** | 50 M / 25 G inclus | 0 $ |
| Fichiers statiques | illimité | gratuit [S9] | 0 $ |
| **Total mensuel** | | | **5,00 $** (forfait Paid) |

Repères officiels : l'exemple 4 de la page de prix (100 objets × 100 WebSockets hibernables) coûte 20,65 $/mois [S1]. Nous sommes très en deçà.

**Pourquoi pas le plan gratuit ?** 100 000 requêtes/jour partagées entre répétitions et bots de test, et surtout 10 ms de CPU par invocation Workers [S10] : une diffusion à 500 sockets dans un message risque de s'y heurter **[À vérifier : la page DO indique 30 s par défaut pour tous les plans, la page Workers 10 ms sur Free]**. 5 $/mois suppriment l'incertitude.

### 2.6 Déploiement depuis le dépôt GitHub

Deux voies officielles :
1. **Workers Builds** : on connecte le dépôt dans le tableau de bord (*Workers & Pages → Create → GitHub*). Un push déclenche build + déploiement ; les branches hors production créent un *Preview* avec sa propre URL ; le nom du Worker doit correspondre au `name` du fichier Wrangler dans le dossier racine indiqué [S14].
2. **GitHub Actions + `cloudflare/wrangler-action`** : secrets `CLOUDFLARE_API_TOKEN` (modèle « Edit Cloudflare Workers », limité au compte) et `CLOUDFLARE_ACCOUNT_ID` [S15]. **Recommandé** : contrôle des étapes (tests Vitest + bots de fumée avant déploiement), et **déploiement de production manuel** (`workflow_dispatch` ou étiquette `v*`).

Environnements : `main` → Worker `studio-real-staging` ; étiquette `v*` → `studio-real` (production, **gel le jour J**, D7). `wrangler.jsonc` du dossier `apps/server` : `main`, `compatibility_date` récente, `assets.directory = ../player/dist` (+ scène/régie), `run_worker_first: ["/ws/*", "/api/*"]` pour que seules ces routes passent par le code [S12], `durable_objects.bindings` + `migrations: [{tag:"v1", new_sqlite_classes:["Room"]}]` [S17 pour l'exemple de configuration].

### 2.7 Cloudflare Pages plutôt que GitHub Pages pour le client ?

- Les sources secondaires consultées indiquent que Cloudflare recommande désormais **Workers Static Assets** pour les nouveaux projets et que les projets Pages existants continuent de marcher, sans migration forcée ; la page officielle de migration précise que Workers dispose de fonctionnalités plus larges, dont les Durable Objects [S13] **[À vérifier : lu via résultats de recherche, la page n'a pas été ouverte]**.
- Sur Workers, un fichier statique correspondant est servi sans exécuter le code ; sinon le Worker est invoqué [S12]. C'est exactement ce qu'il nous faut : `/` → fichiers, `/ws/*` et `/api/*` → code.
- **Choix : Workers Static Assets** (pas Pages) pour avoir **un seul déploiement et une seule origine**. Pages + Worker séparés rétablirait le CORS et les cookies tiers.
- Domaine : `workers.dev` convient pour démarrer (certificat inclus) ; un domaine personnalisé (quelques euros par an **[Estimation]**) donne une adresse de QR plus courte et stable.
- Régie : à protéger (Cloudflare Access ou jeton de régie + liste d'IP/Tailscale) ; le détail est une décision de sécurité à traiter dans la doc 07 §5.

---

## 3. Synchro d'état, reprise, identité

### 3.1 Ce que font les autres (et ce qu'on sait réellement)

- **Jackbox** : le joueur n'installe rien, saisit un code de salle sur `jackbox.tv` et son navigateur devient la manette [S39]. **Aucune documentation d'architecture publique n'a été trouvée** (des articles tiers se contredisent sur le pair-à-pair) : ne pas s'appuyer sur « ce que fait Jackbox » pour le protocole. L'enseignement utile est d'UX : code court, aucune app.
- **Kahoot** : aucune source d'architecture fiable trouvée (recherche épuisée). Même remarque.
- **Colyseus** : jeton de reconnexion rangé côté client, `client.reconnect(token)`, côté serveur `allowReconnection` (ex. 30 s) hors fermeture volontaire [S18]. Modèle de reprise à fenêtre limitée.
- **Socket.IO** : identifiant privé de session `pid` + décalage (offset) par paquet ; le client renvoie `pid` et dernier offset ; récupération des paquets manquants, sans garantie [S19].
- **Cloudflare** : l'objet peut être évincé et ses sockets survivre ; l'état doit vivre dans l'attachement/SQLite [S3][S6].

### 3.2 Notre patron

1. **Serveur autoritaire, vue par téléphone.** Pour chaque joueur, le moteur sait calculer `vue(joueur) = (écran, params, couleur, votes en cours, compte à rebours, effets actifs, variables visibles)` (doc 03 §6).
2. **`vseq` par téléphone** : numéro de version de sa vue, incrémenté à chaque changement. Un `delta` porte `{de: n, vers: n+1}`. Si `de` ≠ version locale (trou), le client demande `resync`. Pas de rejeu de deltas : **on renvoie un snapshot** (D5).
3. **Journal global** `seq` côté serveur (pour reprise du DO, rejeu, analyse), invisible des clients.
4. **Entrées idempotentes.** Chaque entrée porte `cseq` (compteur du joueur, croissant). Le serveur garde `last_cseq` ; `cseq ≤ last_cseq` ⇒ doublon : on renvoie le même `ack` sans réappliquer. Les votes ont en plus une contrainte d'unicité `(joueur, question)`.
5. **Effets** : persistants (écran, couleur) = dans le snapshot ; éphémères (vibration, son court) = non rejoués, sauf si `at + ttl` est encore dans le futur (règle doc 03 §6, « < 2 s »).
6. **Ouverture de la file client** : le téléphone peut mettre ses entrées en file pendant une coupure brève (≤ 3 s) et les renvoyer avec les mêmes `cseq` ; au-delà, il les jette (un vote tardif hors fenêtre est refusé par le serveur avec `ack.status = "closed"`).
7. **Précharge de timeline** (idée reprise du projet open source *crowd-light-show* : « toute la timeline lumineuse est envoyée une fois à la connexion, chaque téléphone la joue localement depuis l'horloge synchronisée, ce qui continue à marcher sur réseau saturé ou après coupure » [S33]). Pour les séquences **sans interaction** (compte à rebours, vague, mosaïque), envoyer `fxplan` (liste d'effets avec `at` absolus, version, hash) à l'avance. Le serveur reste maître : `fxcancel{planId}` et nouvelle version annulent. À réserver aux effets déjà décidés ; tout ce qui dépend d'un vote reste en temps réel.

### 3.3 Reprise d'un téléphone (séquence)

```
Téléphone                                      DO Room
 ── hello{tok, cseq_max, vseq, build} ──────▶
                                                valider jeton (hash), retrouver joueur
                                                fermer l'ancien socket du joueur (code 4001 « ouvert ailleurs »)
 ◀─ welcome{pid, snap, vseq, t_srv, params} ──
 ── sync×8 (rafale) ────────────────────────▶ ◀── syncr×8
 ◀─ (deltas normaux ensuite) ─────────────────
```
Les entrées envoyées avant la coupure et non acquittées sont renvoyées après `welcome` (mêmes `cseq`). Si `hello` arrive sans jeton valide : écran pseudo / « J'étais déjà là » (régie valide, doc 04 §3.2).

### 3.4 Identité d'un téléphone : jeton, stockage, Safari ITP

- Jeton aléatoire 128 bits, lié à la représentation. **Le serveur ne stocke que son hash** (`players.token_hash`).
- **Safari (ITP) :** après 7 jours sans interaction de l'utilisateur avec le site, Safari efface tout le stockage écrit par script (IndexedDB, LocalStorage, SessionStorage, caches/Service Workers) ; l'application web ajoutée à l'écran d'accueil est exemptée [S24]. Les cookies posés par le serveur ne sont pas concernés par ce plafond général ; le plafond de 7 jours sur les cookies posés par le serveur ne vise que le camouflage CNAME/IP de tiers [S24].
- **Conséquences :**
  1. Un spectateur qui a scanné à la répétition J-10 et revient le soir du spectacle a perdu son jeton JS : **nouvelle inscription**. C'est acceptable car le jeton n'est valable que « le jour J ».
  2. **Le jeton principal doit être un cookie posé par le serveur** (`HttpOnly; Secure; SameSite=Lax`), ce qui exige le client sur la même origine (D2). `localStorage` et IndexedDB restent des copies de secours (doc 04 §3.1, triple stockage), et `#t=` dans l'URL en dernier recours.
  3. Avec un client sur `github.io` appelant un serveur d'un autre domaine, ce cookie est tiers et inutilisable : cela seul justifie D2.
- **Deux onglets / deux appareils** : le dernier gagne, l'ancien reçoit la fermeture `4001` et affiche « session ouverte ailleurs » (doc 04).

---

## 4. Synchronisation d'horloge dans le navigateur

### 4.1 Ce que les sources établissent

- Le navigateur ne propose **aucun protocole NTP sur WebSocket** ; le groupe de travail W3C a clos la demande en disant que la synchro d'horloge se superpose (WebSocket/WebRTC) ou relève du système [S34].
- `performance.now()` est **monotone**, non soumis aux ajustements de l'horloge système, contrairement à `Date.now()`. Résolution volontairement dégradée : **100 µs** en contexte normal, **5 µs** si la page est *cross-origin isolated* [S27][S28] (Chrome ; pour Firefox/Safari, les chiffres connus datent de 2021 : 1 ms [S28] **[À vérifier]**). Ces valeurs sont très inférieures à l'erreur réseau : sans importance pour nous.
- **Piège :** la spécification veut que `performance.now()` continue pendant la veille ou le gel du processus, mais MDN indique que seul Windows semble s'y conformer (bugs ouverts sur Chrome, Firefox, WebKit) [S27]. **Donc : après toute mise en veille ou retour d'arrière-plan, jeter le modèle d'horloge et refaire une rafale** (c'est dans l'algorithme ci-dessous).
- Références de synchro multi-appareils : *timingsrc* (Multi-device Timing CG) annonce, par ses auteurs, de l'ordre de 1 ms entre appareils lisant de l'audio dans Chrome et 6–7 ms en HTML5 audio/vidéo [S30] (mesures auto-déclarées, appareils maîtrisés). La cible « serrée » du W3C est < 25 ms [S30]. `@ircam/sync` (soundworks) fait suivre un horloge maître par chaque client via des échanges ping/pong WebSocket et recommande de convertir en temps local « au dernier moment » [S31]. `timesync` (npm) : ping répétés, tri par latence, médiane, rejet des échantillons à plus d'un écart-type, moyenne du reste [S32]. *crowd-light-show* et *phone-light-show* (open source) : handshake « type NTP » sur WebSocket à la connexion, départ à un instant futur décidé par le serveur, rendu local [S33]. Aucun de ces projets ne publie de mesure sur téléphones en salle : **ne pas promettre plus que nos propres essais (§9, S3/S9)**.

### 4.2 Algorithme (pseudo-code)

Modèle : `heure_serveur(p) = p + offset + derive × (p − p_ref)`, où `p = performance.now()` local. Borne d'erreur d'un échantillon = `rtt / 2` (asymétrie maximale aller/retour).

```text
────────────── SERVEUR (Durable Object) ──────────────
sur message {t:"sync", id, c0}:
    répondre IMMÉDIATEMENT {t:"syncr", id, c0, s: Date.now()}
    // hors file du moteur. Date.now() = heure d'arrivée (dernière E/S) dans un Worker [S16].
    // Pas de calcul avant la lecture de l'heure.

────────────── CLIENT ──────────────
état:
    echantillons = []            // fenêtre glissante {offset, rtt, p1}
    modele = {offset, derive, p_ref, valide:false}

fonction mesurer():                       // retourne {offset, rtt, p1}
    p0 = performance.now()
    envoyer({t:"sync", id:n, c0:p0})
    {s} = attendre_reponse(id:n, délai 2000 ms)    // si délai dépassé: échantillon perdu
    p1 = performance.now()
    rtt    = p1 - p0
    offset = s - (p0 + rtt/2)             // serveur ≈ local + offset (aller = retour supposé)
    retourner {offset, rtt, p1}

fonction rafale_initiale():               // à chaque (re)connexion et au retour de veille
    echantillons = []
    pour i de 1 à 8:                      // 8 × ~150 ms ≈ 1,2 s
        e = mesurer(); echantillons.ajouter(e); attendre(100 + aleatoire(0,100) ms)
    meilleurs = les 3 échantillons de plus petit rtt
    modele = {offset: mediane(meilleurs.offset), derive: 0, p_ref: now(), valide:true}
    // Écran « synchronisation… » tant que modele.valide est faux ; l'effet reste utilisable
    // dès valide=true, même si l'estimation n'est pas encore fine.

fonction entretien():                     // appelé par le heartbeat toutes les 10 s
    e = mesurer(); echantillons.ajouter(e); garder les 12 derniers (≈ 2 min)
    rtt_min = min(echantillons.rtt)
    bons = [x pour x dans echantillons si x.rtt <= 1,5 × rtt_min + 5 ms]
    si taille(bons) >= 6 et (bons.dernier.p1 - bons.premier.p1) >= 30 000 ms:
        (a, b) = régression_moindres_carrés(offset = b + a × (p1 - p_ref), poids = 1/rtt²)
        derive = borner(a, ±200e-6)       // 200 ppm max, typique : quelques dizaines de ppm [Estimation]
        cible = b
    sinon:
        derive = 0 ; cible = mediane(bons.offset)
    ecart = cible - modele.offset(à maintenant)
    si |ecart| < 5 ms:      modele.offset += 0,2 × ecart            // lissage
    sinon si |ecart| < 50 ms: absorber l'écart en 2 s (glissement)   // jamais de saut visible
    sinon:                    saut immédiat, SEULEMENT si aucun effet dans les 500 ms à venir

fonction heure_serveur(p = performance.now()):
    retourner p + modele.offset + modele.derive × (p - modele.p_ref)

sur visibilitychange→visible, pageshow(persisted), resume, online:
    si caché depuis > 5 s: modele.valide = false; rafale_initiale()    // performance.now peut avoir "dormi" [S27]

────────────── EXÉCUTION D'UN EFFET PROGRAMMÉ ──────────────
sur message {t:"fx", id, at, ...}:           // at = heure serveur en ms (epoch)
    d = at - heure_serveur()
    si d < -fx.tard_ok:                      // trop tard (défaut : 150 ms pour un flash, ∞ pour un état persistant)
        si fx.persistant: appliquer_maintenant(fx) sinon ignorer + journaliser("fx_en_retard", d)
    sinon:
        setTimeout(() => armer(fx), max(0, d - 50))   // réveil approximatif, 50 ms de marge
fonction armer(fx):
    boucle requestAnimationFrame(ts):                 // synchronisé sur la trame d'affichage
        si heure_serveur(ts) + 8 >= fx.at: appliquer(fx)    // 8 ms ≈ demi-trame à 60 Hz
        sinon: requestAnimationFrame(boucle)

────────────── CÔTÉ SERVEUR : CHOIX DU DÉLAI D'ANTICIPATION ──────────────
// Chaque heartbeat remonte rtt_dernier au serveur (champ "rtt" du ping).
fonction delai_avance():
    p95 = percentile_95(rtt_dernier de tous les présents) / 2
    retourner borner(1,5 × p95 + 200 ms, 400 ms, 2500 ms)
at = Date.now() + delai_avance()
// Les retardataires au-delà du délai : voir « tard_ok » ci-dessus ; ils sont comptés dans les métriques.
```

### 4.3 Précision réaliste pour « allumer 500 écrans ensemble »

Budget d'erreur (écart entre téléphones, hors panne réseau) :

| Source | Ordre de grandeur | Origine |
|--------|-------------------|---------|
| Erreur d'estimation du décalage (filtre plus petit RTT) | Wi-Fi sain : ±3 à 10 ms ; 4G : ±10 à 30 ms ; pire cas garanti ≤ rtt_min/2 | **[Estimation]**, la borne `rtt/2` est mathématique |
| Dérive entre deux resynchronisations (10 s) | < 1 ms | **[Estimation]** (dizaines de ppm) |
| Résolution de `performance.now()` | 0,1 ms | [S28] |
| Jitter de `setTimeout` | quelques ms → compensé par la boucle `requestAnimationFrame` | **[Estimation]** |
| Quantification à l'affichage (trame) | 16,7 ms à 60 Hz ; 8,3 ms à 120 Hz | arithmétique |
| Latence propre à chaque écran (traitement, OLED/LCD) | 10 à 50 ms de différence selon modèle | **[Estimation]** — *non mesurable par NTP* |

**Conclusion : visuel ±25 à 40 ms (90 % des téléphones), quelques outliers à 60–100 ms (téléphone lent, 4G asymétrique, onglet en arrière-plan).** Pour du « tout s'allume » c'est perçu comme simultané ; ce ne l'est pas pour des motifs ultra-rapides (strobe, rythmique à 8 Hz). La promesse « ±20 ms » du doc 03 §7 est trop optimiste et devient « ±30 à 40 ms, mesuré en répétition ».
- **Mesure en conditions réelles** : filmer la salle (ou un panneau de 20 téléphones) à 240 images/s avec un téléphone en ralenti, déclencher un flash `at`, compter les images d'écart. Table de décalages par modèle/UA possible si une famille de téléphones sort systématiquement du lot.
- **Audio.** `AudioContext.currentTime` tourne sur l'horloge audio, pas sur `performance.now()`. Pour aligner un son sur l'heure serveur : `source.start(ctx.currentTime + (at − heure_serveur())/1000 − outputLatency)`. `outputLatency` n'est supporté que par Safari **18.4+** (Chrome 102, Firefox 70) [S29] ; `getOutputTimestamp()` a été inutilisable sur Safari/iOS pendant longtemps (rapport développeur sur iOS 15.1) [S29] **[À vérifier sur iOS actuel]**. À cela s'ajoutent la latence Bluetooth et surtout la **propagation acoustique** : 500 haut-parleurs répartis sur 30 m, c'est ±50 ms de décalage physique **[Estimation]** (≈ 3 ms par mètre). Règle : le téléphone ne sert pas à produire un rythme collectif ; pour un effet de « chœur de téléphones », cette dispersion est l'effet, et on évite les sons percussifs courts. Le son de référence passe par la sono de la salle.

---

## 5. Comportement mobile : arrière-plan, heartbeat, reconnexion

### 5.1 Ce que font réellement les navigateurs

- Un WebSocket **n'est pas un état fiable en arrière-plan** : sur iOS, une app suspendue perd ses connexions ; au retour, `onerror`/`onclose` finissent par arriver, mais après une longue inactivité ils peuvent ne **pas** arriver et le socket mort passe inaperçu [S26]. Un bug WebKit documente aussi l'absence de `onclose` après coupure du réseau [S26].
- Dans `onmessage`, `readyState` peut encore valoir 1 alors que le socket est fermé ; `onclose` arrive après les `onmessage` [S26] : ne pas tenir sa propre variable « connecté » à partir de ces événements.
- **Page Lifecycle (Chrome)** : une page *gelée* ne déclenche plus de minuteries ni de callbacks ; recommandé : fermer les WebSockets et IndexedDB au gel, rouvrir à `resume` ; sur mobile, `pagehide`/`unload` ne sont pas fiables, se fier à `visibilitychange` [S25].
- L'API WebSocket du navigateur **n'expose ni ping ni pong** et n'a ni reconnexion ni contre-pression automatique (`bufferedAmount` à surveiller) [S27] : le heartbeat est applicatif.
- **Wake Lock** : relâché automatiquement quand la page n'est plus visible ; à reprendre à `visibilitychange` ; contexte sécurisé obligatoire ; Baseline depuis mars 2025 [S27].

### 5.2 Règles

1. **Heartbeat applicatif toutes les 10 s** (messages `ping` portant aussi l'échantillon d'horloge, §4), tant que la page est visible. Pas de heartbeat page cachée : le socket sera de toute façon incertain.
2. **Détection de mort** : pas de `pong` en 2 intervalles (≈ 25 s) ⇒ fermer et reconnecter avec un **nouveau** WebSocket (jamais réutiliser l'ancien) [S26].
3. **Présence côté serveur** (doc 03 : « présent = connecté et page visible dans les 20 dernières secondes ») : le client envoie `vis{visible:true/false}` aux transitions, plus le heartbeat ; le serveur marque « absent » s'il n'a rien reçu depuis 20 s.
4. **Reconnexion immédiate** à `visibilitychange→visible`, `pageshow` (`persisted`), `online`, `resume` : nouvelle socket + `hello` + rafale de synchro + réacquisition du Wake Lock.
5. **Backoff exponentiel avec jitter complet** : `attente = aleatoire(0, min(5 s, 0,5 s × 2^n))`. Le jitter est indispensable : une coupure du Wi-Fi de la salle fait reconnecter 500 téléphones à la même seconde (troupeau). Après 60 s d'échec, plafond relevé à 10 s et bandeau « reconnexion… » ; remise à zéro de `n` après 10 s de connexion stable.
6. **Fermetures typées** : `4001` ouvert ailleurs (ne pas reconnecter), `4002` spectacle terminé, `4003` jeton refusé (retour à l'écran pseudo), `4008` limite de débit atteinte (pause 5 s), `1006`/réseau (reconnecter).
7. **Contre-pression** : ne pas envoyer si `bufferedAmount` > 64 Ko ; pour les flux denses, garder seulement la dernière valeur.
8. **Admission côté serveur** : le Worker refuse (`429` + `Retry-After` aléatoire) au-delà de ~200 nouveaux sockets/s pour lisser un retour de panne **[Estimation]**.
9. **Redémarrage / éviction du DO** : les sockets survivent à l'hibernation ; si l'objet est réinitialisé (déploiement, crash), les clients reconnectent via la règle 4 et reçoivent un snapshot reconstruit depuis SQLite.

---

## 6. Protocole conseillé (messages types)

JSON texte, champ `t` obligatoire. Versionné : `hello.v` ; un serveur plus récent accepte `v-1`. Taille max d'un message client : 4 Ko. Temps en **ms epoch serveur** (`at`, `ts`) sauf `c0/p` (ms `performance.now()` local).

### 6.1 Client → serveur

| `t` | Champs | Rôle / idempotence |
|-----|--------|--------------------|
| `hello` | `v`, `room`, `tok` (ou vide), `vseq`, `cseq`, `build`, `ua`, `caps{vibr,wake,audio,flash}` | Ouverture/reprise. `tok` vide = nouveau joueur. |
| `join` | `pseudo`, `zone?`, `siege?` | Après `hello` sans jeton valide ; le serveur répond `welcome` avec nouveau jeton. |
| `sync` | `id`, `c0` | Échantillon d'horloge (§4). Réponse immédiate. |
| `ping` | `id`, `c0`, `rtt` (dernier mesuré), `vis` | Heartbeat + échantillon d'horloge + remontée du RTT. |
| `in` | `cseq`, `k` (`vote`/`text`/`react`/`sensor`/`btn`/`ready`), `q?` (id de question), `data` | **Idempotent** par `cseq`. Réponse `ack`. |
| `vis` | `visible` | Transitions de visibilité. |
| `resync` | `raison` | Demande de snapshot (trou de `vseq`, retour d'arrière-plan). |
| `diag` | `{rtt_p50, rtt_p95, offset_err_est, fx_retard, bat?}` | Télémétrie légère (toutes les 60 s). |
| `bye` | — | Départ volontaire. |

### 6.2 Serveur → client

| `t` | Champs | Rôle |
|-----|--------|------|
| `welcome` | `pid`, `tok?` (nouveau jeton), `snap`, `vseq`, `ts`, `params{hb:10000, backoff…}` | Snapshot complet (état persistant de ce joueur). |
| `d` | `de`, `vers`, `patch` | Delta de vue par téléphone ; trou ⇒ `resync`. |
| `fx` | `id`, `at`, `dur?`, `kind` (`couleur`/`flash`/`vibrer`/`son`/…), `p` (paramètres), `ttl?`, `tard_ok?` | Effet programmé à l'heure serveur. |
| `fxplan` | `plan`, `ver`, `hash`, `items[{id,at,…}]` | Précharge de séquence ; remplaçable/annulable. |
| `fxcancel` | `ids[]` ou `plan` | Annule des effets non encore joués. |
| `syncr` | `id`, `c0`, `s` | Réponse d'horloge. |
| `pong` | `id`, `c0`, `s` | Réponse de heartbeat (porte aussi `s`). |
| `ack` | `cseq`, `status` (`ok`/`dup`/`closed`/`refused`), `res?` | Acquittement d'une entrée. |
| `err` | `code`, `msg` | Erreur applicative. |
| `kick` | `code`, `raison` | Précède la fermeture (4001/4002/4003). |

### 6.3 Exemples

```jsonc
// C→S  entrée idempotente (vote)
{"t":"in","cseq":42,"k":"vote","q":"porte","data":{"choix":"rouge"}}
// S→C  acquittement (même réponse si renvoyé : "dup")
{"t":"ack","cseq":42,"status":"ok"}

// S→C  effet synchronisé : « tous les écrans en rouge à T »
{"t":"fx","id":"fx_8812","at":1790424312450,"kind":"couleur","p":{"hex":"#ff0030","fondu_ms":0},"dur":1500,"tard_ok":150}

// S→C  delta de vue
{"t":"d","de":17,"vers":18,"patch":{"ecran":"vote_resultat","params":{"gagnant":"rouge"}}}

// C→S  heartbeat + échantillon d'horloge
{"t":"ping","id":311,"c0":183204.3,"rtt":38.7,"vis":true}
// S→C
{"t":"pong","id":311,"c0":183204.3,"s":1790424311902}
```

### 6.4 Canal régie et écran scène

Mêmes sockets avec un rôle `regie` / `scene` (jeton distinct, jamais dans le dépôt). Messages régie : `ctl{go|retenir|sauter|forcer|cible|panique, …}` avec **le même mécanisme `cseq`/`ack`** ; la régie reçoit en plus `stats` (présents, votes) à 1 Hz. L'écran de scène reçoit les `fx` agrégés (jamais 500 messages `react` : le DO les réduit en lots de 200 ms).

### 6.5 Flux denses (corrige la doc 07)

| Flux | Règle |
|------|-------|
| Capteurs (secousse, inclinaison) | Agrégation **sur le téléphone** ; envoi à 1 Hz max pour tous ; 5 Hz seulement pour une sélection ciblée par la régie (≤ 100 téléphones). |
| Réactions (emojis) | Compteur local envoyé toutes les 250 ms (`react{emoji:n}`), le serveur lisse. |
| Texte | 1 message / 2 s / joueur ; 140 caractères. |
| Total | Budget cible : **≤ 400 messages/s** en régime, **≤ 1 000 messages/s** en pointe pour rester sous la limite d'objet [S2]. |

---

## 7. Capacité : repères chiffrés

| Repère | Valeur | Source |
|--------|--------|--------|
| WebSockets par DO (Hibernation) | 32 768 | [S4] |
| Débit par DO | 1 000 req/s (souple) ; 500–1 000 requêtes simples/s (bonnes pratiques) | [S2][S6] |
| Colyseus, 1 vCPU / 1 Go | 1 000–2 000 connexions, jeu simple ; 2–5 Ko par connexion | [S18] |
| uWebSockets.js, connexion inactive | ≈ 5 Ko (vendor concurrent) ; 52 Ko pour Socket.IO (même source) | [S23] |
| uWebSockets.js | « 13× plus rapide que Fastify, 20× que Socket.IO » (README) | [S23] |
| Notre besoin | 500 sockets, ≤ 400 msg/s en régime, rafale de 500 votes en ~1 s | §6.5 |

Marge : nous sommes à ~1,5 % de la limite de connexions d'un DO et à 40–100 % de sa limite de débit en pointe ; **c'est le débit, pas les connexions, qui est le risque** (d'où §6.5 et le test S6 du §9).

---

## 8. Écarts à répercuter dans les docs existantes

| Doc | Passage | Correction proposée |
|-----|---------|---------------------|
| 03 §7 | « ±20 ms près » | « ±30 à 40 ms visuel, mesuré en répétition » ; effet = `{at}` anticipé par `delai_avance()`. |
| 04 §1, §2 | QR vers `calculment0r.github.io` | QR vers le domaine du Worker (client servi par le Worker). GitHub Pages = miroir de maquette. |
| 04 §3.1 | Triple stockage | Cookie **posé par le serveur** en premier (first-party), `localStorage`/IndexedDB en copie ; plafond ITP de 7 jours documenté. |
| 04 §3.2 | « délais croissants 0,5 s → 5 s » | Ajouter le **jitter complet** et la reconnexion immédiate au retour d'arrière-plan. |
| 04 §3.3 | Instantané « heure serveur » | Ajouter `vseq`, `fx` actifs, `params.hb`. |
| 07 §3 | « B à évaluer pour la production » | Décision D1 : B retenu ; A (Node) = plan B et outil de développement. |
| 07 §4 | « Battement de cœur toutes les 5 s » ; « capteurs à 5 Hz » | 10 s, fusionné avec l'échantillon d'horloge ; capteurs 1 Hz par défaut (§6.5). |
| 07 §4 | Deltas numérotés `seq` | `vseq` par téléphone ; reprise par snapshot (D5). |

---

## 9. Plan de test de charge

### 9.1 Outils

| Outil | Rôle | Remarques |
|-------|------|-----------|
| **Bots maison (`tools/bots`, TypeScript + `ws`)** | **Outil principal.** Implémente *vraiment* le protocole du §6 : `hello`, rafale d'horloge, heartbeat, `cseq`, reconnexion avec jitter, profils (rapide, lent, instable, « iPhone qui s'endort » : coupe son socket après 20 s caché). | Seul outil qui mesure la **dispersion de synchro** et vérifie l'**absence de doublons**. |
| k6 (`k6/websockets`) | Rampes de connexion, seuils (`ws_connecting`, `checks`), rapports. | Le module `k6/experimental/websockets` est déprécié au profit de `k6/websockets` ; un seul VU peut tenir plusieurs sockets (boucle d'événements globale) [S35]. Retour d'expérience : depuis un portable, au-delà de ~1 000 VU on voit des fermetures 1006 (limite côté générateur), alors que 4 000 VU passent depuis un cluster [S35] → générer depuis les DGX, pas depuis un PC. |
| Artillery (moteur `ws`) | Scénarios déclaratifs `connect/send/think/loop`, métriques `websocket.*` [S36]. | Utile en scénario court de fumée en CI ; pas de logique de reprise. Distribution multi-machines non documentée sur la page consultée **[À vérifier]**. |
| `wrangler dev` (Miniflare) | Essais locaux du DO (hibernation, alarmes) sans coût. | Étape P0. |

Générateurs de charge : **dgx1 et dgx2** (SSH/Tailscale), 250–300 bots chacun, plus une ligne de bots depuis le PC de développement pour le contrôle. Dégradation réseau par `tc netem` (latence, perte, asymétrie).
Cible : **Worker de staging**, jamais la production ; **annoncer** les tests : la politique de Cloudflare sur les tests de charge n'a pas été vérifiée **[À vérifier]** — rester à des volumes proportionnés et sur notre compte.

### 9.2 Scénarios et seuils (go / no-go)

| # | Scénario | Mesures | Seuil de réussite |
|---|----------|---------|-------------------|
| S1 | **Arrivée du public** : 500 connexions en 60 s, rafale d'horloge, `join` | taux de succès, temps `hello→welcome`, mémoire du DO | 100 % connectés ; p95 `welcome` < 1 s ; aucune erreur « overloaded » |
| S2 | **Vote simultané** : 500 votes en 1 s, + 20 % de renvois (mêmes `cseq`) | doublons, délai dernier vote → passage de gate | 0 doublon ; passage < 200 ms p95 après le dernier vote |
| S3 | **Effet synchronisé** : 20 effets espacés de 5 s | dispersion des instants d'application (les bots partagent la même horloge locale, donc l'écart mesure directement l'erreur de synchro) ; effets en retard | écart p90 < 30 ms, p99 < 60 ms ; retards < 2 % |
| S4 | **Coupure massive** : fermer 30 % puis 100 % des sockets d'un coup | temps de retour, état perdu (comparaison avec un oracle) | 100 % rétablis < 10 s ; 0 écart d'état ; pas de pic d'« overloaded » |
| S5 | **Rafraîchissements en continu** : 10 % des bots reconnectent toutes les 30 s pendant 10 min | stabilité mémoire, `vseq`, doublons | aucune dérive ; 0 doublon |
| S6 | **Flux denses** : 500 bots × 5 msg/s pendant 30 s *sans* limiteur, puis *avec* (1 Hz, §6.5) | erreurs « overloaded », latence d'écho, CPU | Sans limiteur : on **observe** la limite (documenter). Avec : 0 erreur |
| S7 | **Perte de l'objet** : forcer une réinitialisation (déploiement ou `wrangler` pendant le test) | restauration depuis SQLite, rejeu du journal | état identique au journal (hash) ; reconnexion 100 % < 15 s |
| S8 | **Endurance 2 h** au régime nominal (1 msg/4 s, heartbeat 10 s, 1 effet/min) | mémoire (métriques mémoire des DO via GraphQL [S11]), requêtes, **facture réelle vs §2.5** | pas de fuite ; coût ≤ estimation |
| S9 | **Réseau dégradé** : latence 150 ± 100 ms, perte 5 %, asymétrie aller/retour | erreur d'estimation d'offset, `fx` en retard | confronter à la théorie (borne rtt/2) ; recalibrer `delai_avance` |
| S10 | **Précision des alarmes** : 1 000 minuteurs de gate à dates aléatoires | retard de `alarm()` (distribution) | p99 < 1 s (sinon règles des gates à tolérance plus large) |
| S11 | **Admission** : 500 reconnexions simultanées sans jitter vs avec | pic de requêtes/s, erreurs | avec jitter : pic < 400/s ; sans : documenter |

### 9.3 Calendrier

- **P0** : bots locaux contre `wrangler dev`, 50 puis 200 bots (S1–S3, S5).
- **P1** : Worker de staging, 100 bots (tous scénarios sauf S8).
- **P2** : 500 bots + 20 % de marge (600) ; S1–S7, S9–S11 ; mesure de la facture.
- **P3** : endurance 2 h (S8) la veille de la première, puis **répétition générale avec vrais téléphones** (≥ 20 modèles) et film à 240 images/s (§4.3).
- Chaque palier écrit un rapport JSON (`tools/bots/out/`) ; les journaux de test sont rejoués comme tests de non-régression (doc 07 §6).

---

## 10. Sources

**Cloudflare**
- [S1] Durable Objects — Pricing : https://developers.cloudflare.com/durable-objects/platform/pricing/
- [S2] Durable Objects — Limits : https://developers.cloudflare.com/durable-objects/platform/limits/
- [S3] Durable Objects — WebSockets (Hibernation) : https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- [S4] Durable Objects — State API (`acceptWebSocket`, auto-response, 32 768 connexions) : https://developers.cloudflare.com/durable-objects/api/state/
- [S5] Durable Objects — Alarms : https://developers.cloudflare.com/durable-objects/api/alarms/
- [S6] Rules of Durable Objects : https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- [S7] Accès au stockage (SQLite, restauration 30 jours) : https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/
- [S8] Emplacement des objets, indices et juridictions : https://developers.cloudflare.com/durable-objects/reference/data-location/
- [S9] Workers — Pricing : https://developers.cloudflare.com/workers/platform/pricing/
- [S10] Workers — Limits : https://developers.cloudflare.com/workers/platform/limits/
- [S11] Journal des modifications, 30/06/2026, métriques de mémoire : https://developers.cloudflare.com/changelog/post/2026-06-30-memory-usage-metrics/
- [S12] Workers Static Assets : https://developers.cloudflare.com/workers/static-assets/
- [S13] Migrer de Pages vers Workers (lu via résultat de recherche) : https://developers.cloudflare.com/workers/static-assets/migrate-from-pages/
- [S14] Workers Builds (intégration GitHub) : https://developers.cloudflare.com/workers/ci-cd/builds/
- [S15] Déploiement par GitHub Actions : https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- [S16] Modèle de sécurité (`Date.now()`) : https://developers.cloudflare.com/workers/reference/security-model/
- [S17] PartyServer : https://github.com/cloudflare/partykit

**Alternatives**
- [S18] Colyseus — FAQ : https://docs.colyseus.io/faq ; scalabilité : https://docs.colyseus.io/scalability
- [S19] Socket.IO — Connection state recovery : https://socket.io/docs/v4/connection-state-recovery
- [S20] Ably — Pricing : https://ably.com/pricing
- [S21] Pusher Channels — Pricing : https://pusher.com/channels/pricing/
- [S22] Liveblocks — Limits (résultat de recherche, pages contradictoires) : https://liveblocks.io/docs/platform/limits
- [S23] uWebSockets.js : https://github.com/uNetworking/uWebSockets.js ; comparatif AnyCable (source concurrente) : https://anycable.io/compare/nodejs-websocket

**Navigateur, mobile, identité**
- [S24] WebKit — Tracking Prevention (plafond 7 jours, exception écran d'accueil) : https://webkit.org/tracking-prevention/
- [S25] Chrome — Page Lifecycle API : https://developer.chrome.com/docs/web-platform/page-lifecycle-api
- [S26] Forum Apple, WebSocket Safari iOS 15 : https://developer.apple.com/forums/thread/696310 ; bug WebKit `onclose` : https://bugs.webkit.org/show_bug.cgi?id=247943
- [S27] MDN — WebSocket : https://developer.mozilla.org/en-US/docs/Web/API/WebSocket ; `performance.now()` : https://developer.mozilla.org/en-US/docs/Web/API/Performance/now ; Wake Lock : https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
- [S28] Chrome — Timers et isolation cross-origin (100 µs / 5 µs) : https://developer.chrome.com/blog/cross-origin-isolated-hr-timers
- [S29] web.dev — `outputLatency` : https://web.dev/articles/audio-output-latency ; forum Apple `getOutputTimestamp` : https://developer.apple.com/forums/thread/696356

**Synchro d'horloge et références**
- [S30] timingsrc / Multi-device Timing CG : https://cdn.jsdelivr.net/npm/webtiming-timingsrc@3.0.0/docs/doc/background_mediasync.md ; message d'Ingar Arntzen : https://lists.w3.org/Archives/Public/public-webtiming/2015May/0003.html ; exposé TPAC : https://www.w3.org/2015/Talks/fd-timing-tpac-breakout
- [S31] `@ircam/sync` (page npm non accessible directement, lue via résultat de recherche) : https://www.npmjs.com/package/@ircam/sync
- [S32] `timesync` : https://github.com/enmasseio/timesync
- [S33] crowd-light-show : https://github.com/AndriiShramko/crowd-light-show ; phone-light-show : https://github.com/BilyaminuShehu/-phone-light-show
- [S34] W3C, bug 27915 « WebSocket non synchronisé NTP » : https://www.w3.org/Bugs/Public/show_bug.cgi?id=27915

**Tests de charge, réseau local, divers**
- [S35] k6 WebSockets : https://grafana.com/docs/k6/next/examples/websockets.md ; fil communautaire (1006 à >1 000 VU depuis un portable) : https://community.grafana.com/t/k6-is-use-to-getting-abnormal-closure-when-i-run-web-socket-load-tests/159146
- [S36] Artillery — moteur WebSocket : https://www.artillery.io/docs/reference/engines/websocket
- [S37] Chrome — Local Network Access : https://developer.chrome.com/blog/local-network-access
- [S38] Tailscale — HTTPS : https://tailscale.com/kb/1153/enabling-https
- [S39] Jackbox — premiers pas : https://support.jackboxgames.com/hc/en-us/articles/15794771245975-How-do-I-get-started-playing-Jackbox-Games

## 11. Questions ouvertes pour le propriétaire

1. **Domaine** : accepter `studio-real.<compte>.workers.dev` au début, ou acheter un nom court pour les QR ?
2. **Juridiction UE** pour le DO (pseudos et messages) : oui/non (irréversible par objet).
3. **Salles sans Internet** prévues dans la tournée ? Si oui, planifier l'adaptateur Node local (phase 3).
4. **Protection de la régie** : Cloudflare Access, jeton + Tailscale, ou les deux.
5. **Budget de mesure** : accord pour un essai à ~20 téléphones réels filmés à 240 images/s avant la création.
