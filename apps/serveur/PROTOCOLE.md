# Protocole de la salle de projet (WebSocket)

Un **Durable Object `SalleProjet` par projet**. Il tient la copie de travail partagée du projet et relaie la présence,
le chat, les commentaires, les verrous et l'état de lecture. Types TypeScript : `src/logique/protocole.ts`
(l'interface peut les recopier ou les importer).

Version du protocole : **1** (`hello.v` ; le serveur accepte aussi `v-1`).

## Connexion

```
GET /api/projets/<id>/salle?jeton=<jeton du projet>     (Upgrade: websocket)
```

- Le jeton se passe en paramètre (le navigateur ne peut pas poser d'en-tête sur un WebSocket). Jeton absent → 401,
  faux → 404, origine non autorisée → 403 (voir `ORIGINES_AUTORISEES`).
- Messages **JSON texte**, champ `t` obligatoire, **256 Ko max**. Les binaires sont refusés.
- Le premier message doit être `hello`. Tout autre message avant reçoit `erreur{code:'hello-requis'}`.
- Heartbeat : envoyer exactement `{"t":"ping"}` → `{"t":"pong"}` (réponse automatique, sans réveiller l'objet).
  Avec un id : `{"t":"ping","id":7}` → `{"t":"pong","id":7,"ts":…}` (heure serveur).

## Identité, sessions, idempotence

- `personne` : identifiant stable de la personne (à garder en `localStorage`), `[A-Za-z0-9_-]{6,64}`.
  La présence, la couleur et les **verrous** appartiennent à la personne (ils survivent à une reconnexion).
- `session` : identifiant de l'onglet / de la connexion logique, `[A-Za-z0-9_-]{6,64}`. Un onglet garde sa session
  pendant ses reconnexions.
- `cseq` : compteur **croissant par session** (1, 2, 3…), porté par chaque message qui modifie quelque chose.
  Le serveur garde le dernier `cseq` de chaque session : un message renvoyé (`cseq ≤ dernier`) n'est **pas réappliqué**
  et reçoit `ack{statut:'doublon'}` (avec `res` = l'acquittement d'origine si c'est le dernier). Le client peut donc
  renvoyer sans risque, après une coupure, tout ce qui n'a pas été acquitté.
- Dans ce prototype, nom et rôle sont **déclaratifs** (tous partagent le jeton du projet).

## Copie de travail : deltas numérotés et instantanés

- `seq` : numéro du dernier delta appliqué à la copie de travail (global à la salle).
- À l'arrivée (`bienvenue`) : instantané complet (`projet`), sauf si `hello.seq` == `seq` serveur (`a_jour:true`, `projet:null`).
- Ensuite chaque modification acceptée est diffusée **à tous, auteur compris** : `modif{seq, ops, par, session, cseq}`.
  Le client applique les deltas dans l'ordre ; **si `seq` ≠ son seq + 1 (trou), il envoie `resync`** et reçoit un
  `instantane`. Pas de rejeu de deltas manqués : on renvoie l'instantané (étude serveur temps réel, D5).
- L'auteur reconnaît sa propre modification par `session` + `cseq` (application optimiste possible ; en cas de
  `ack` `refus`, il annule localement ou demande `resync`).
- Ordre total décidé par le serveur ; pas de transformation opérationnelle : les chemins par **id** (`{id:'e3'}`)
  rendent les modifications concurrentes robustes aux insertions.

### Opérations (`ops`, tout ou rien, 200 max par delta)

```jsonc
{"op":"poser",   "chemin":["ev",{"id":"e2"},"name"], "valeur":"Prologue revu"}  // pose (crée la clé si besoin)
{"op":"inserer", "chemin":["ev",{"id":"e2"},"st","-"], "valeur":{ /* Etape */ }}  // insère dans un tableau ('-' = fin)
{"op":"retirer", "chemin":["tracks",{"id":"t3"}]}                                // retire une clé ou un élément
```

Segments de chemin : clé (texte), index (entier ≥ 0), `{id}` (élément de tableau par son champ `id`), `'-'` (fin de
tableau, dernier segment d'un `inserer`). Interdits : `__proto__`, `prototype`, `constructor`. Profondeur ≤ 16.
Si une opération échoue, tout le delta est annulé : `ack{statut:'refus', raison:'chemin-introuvable' | …}`.

### Enregistrement dans D1 (versions)

- La copie de travail est enregistrée comme **nouvelle version** D1 : sur demande (`enregistrer`), et
  **automatiquement** 15 s après la dernière modification (60 s au plus après la première non enregistrée).
  Chaque enregistrement est annoncé : `version{version, par, seq, message?}`.
- Le `PUT /api/projets/:id` (REST) passe aussi par la salle : s'il reste des modifications en direct non
  enregistrées, elles sont enregistrées d'abord, et le PUT fondé sur l'ancienne version reçoit **409**. Un PUT
  accepté remplace la copie de travail : tous reçoivent `instantane{raison:'version-externe'}` puis `version`.

## Verrous et mode Scène

Cibles : `projet` · `moment:<id>` · `piste:<id>` · `lecture`.

1. Un verrou appartient à une personne ; il est rendu par `verrou{action:'rendre'}`, ou repris par
   `verrou{action:'forcer'}` **seulement si son détenteur n'est plus connecté**.
2. Une modification touchant une cible tenue par quelqu'un d'autre (ou alors que quelqu'un d'autre tient `projet`)
   est refusée : `raison:'verrouille:<cible>:<nom>'`. La cible d'une opération est déduite de son chemin
   (`['ev', …]` → `moment:<id>`, `['tracks', …]` → `piste:<id>`, le reste → `projet`).
3. **Mode Scène** (`mode:'jouer'`) : le projet est gelé ; seul qui tient `projet` (ou la cible exacte) modifie
   (`raison:'mode-scene'` sinon). Passer en mode Scène donne `projet` à qui le demande, s'il est libre.
   Seul le détenteur de `projet` peut quitter le mode Scène.
4. On ne prend pas `projet` si d'autres tiennent des verrous (hors `lecture`), ni un verrou partiel si un autre tient `projet`.

## État de lecture (régie → postes)

`lecture{etat}` (forme `EtatLecture` de `@studio-real/modele`) est diffusé aux autres et gardé : un poste qui arrive
le reçoit dans `bienvenue.lecture`. Autorisé à : qui tient `lecture` ou `projet` ; sinon, hors mode Scène et si
personne ne les tient, à un client de rôle `regie`. Fréquence conseillée ≤ 4 Hz. `cseq` facultatif (sans `cseq`,
pas d'`ack`, même en refus).

## Messages client → serveur

| `t` | Champs | Réponse |
|---|---|---|
| `hello` | `v`, `personne`, `session`, `nom` (≤ 60), `couleur?` `#rrggbb`, `role?` `auteur`\|`regie`\|`poste`, `seq?` | `bienvenue` ; les autres reçoivent `arrivee` |
| `curseur` | `curseur: {zone:'planche'\|'conduite', x, y, moment?, etape?}` ou `null` | les autres reçoivent `curseur` |
| `modif` | `cseq`, `base` (seq connu), `ops[]` | `ack` (`res:{seq}`) + `modif` à tous |
| `chat` | `cseq`, `texte` (≤ 2000) | `ack` + `chat` à tous |
| `commentaire` | `cseq`, `action:'ajouter'`, `ancre`, `texte` (≤ 4000) | `ack` (`res:{id}`) + `commentaire{action:'ajoute'}` |
| `commentaire` | `cseq`, `action:'resoudre'\|'rouvrir'\|'supprimer'`, `id` | `ack` + `commentaire{action:'modifie'\|'supprime'}` (supprimer : auteur seulement) |
| `verrou` | `cseq`, `action:'prendre'\|'rendre'\|'forcer'`, `cible` | `ack` + `verrou` à tous |
| `mode` | `cseq`, `mode:'ecrire'\|'repeter'\|'jouer'` | `ack` + `mode` à tous (+ `verrou` si passage en Scène) |
| `lecture` | `etat`, `cseq?` | `lecture` aux autres (+ `ack` si `cseq`) |
| `enregistrer` | `cseq`, `message?` (≤ 200) | `ack` (`res:{version}` ou `{version, inchange:true}`, `statut:'conflit'`) + `version` à tous |
| `scene` | `message` (objet, ≤ 32 Ko) : message de la sortie écran scène (régie ↔ sortie, voir apps/conducteur/src/sortie/protocole.ts) | `scene` aux autres ; rien n'est gardé |
| `rtc` | `vers` (session cible, ou `'*'` = tous les autres), `signal` (objet opaque, ≤ 64 Ko) : signalisation WebRTC du flux du streamer (annonce, offre/réponse SDP, candidats ICE, consignes ; voir apps/conducteur/src/flux/protocole.ts) | `rtc` à la session visée (tous ses sockets) ou aux autres ; `erreur{code:'rtc-absent'}` si la session visée n'est pas là ; rien n'est gardé |
| `resync` | — | `instantane{raison:'resync'}` |
| `ping` | `id?` | `pong` |
| `bye` | — | les autres reçoivent `depart` ; fermeture 1000 |

Ancres de commentaire : `{type:'etape', moment, etape}` · `{type:'moment', moment}` · `{type:'instant', t, moment?}`
(`t` en secondes sur la conduite).

## Messages serveur → client

| `t` | Champs |
|---|---|
| `bienvenue` | `v`, `vous{personne, session, nom, couleur, role}`, `seq`, `version`, `a_jour`, `projet` (ou `null`), `mode`, `lecture{etat, par, ts}` ou `null`, `presents[]`, `verrous[]`, `commentaires[]`, `chat[]` (100 derniers), `ts` |
| `ack` | `cseq`, `statut:'ok'\|'doublon'\|'refus'\|'conflit'`, `raison?`, `res?` |
| `modif` | `seq`, `ops`, `par` (personne), `session`, `cseq` |
| `instantane` | `seq`, `version`, `projet`, `raison` (`resync`, `version-externe`) |
| `arrivee` / `depart` | `personne{personne, nom, couleur, role}` / `personne` (id) — une personne à plusieurs onglets n'apparaît qu'une fois |
| `curseur` | `personne`, `curseur` ou `null` |
| `chat` | `message{id, personne, nom, couleur, texte, t}` |
| `commentaire` | `action:'ajoute'\|'modifie'\|'supprime'`, `commentaire` (`{id}` si supprimé) |
| `verrou` | `cible`, `personne` (`null` = libéré), `nom?` |
| `mode` | `mode`, `par` |
| `lecture` | `etat`, `par`, `ts` |
| `scene` | `message`, `par`, `session`, `ts` (relais de la sortie écran scène) |
| `rtc` | `de` (session émettrice, posée par le serveur), `par` (sa personne), `vers`, `signal` (tel qu'envoyé), `ts` |
| `version` | `version`, `par`, `seq`, `message?` |
| `pong` | `id?`, `ts` |
| `erreur` | `code`, `message` (`hello-requis`, `type-inconnu`, `json-invalide`, `trop-gros`, `conflit-enregistrement`, `interne`…) |

Un message mal formé portant un `cseq` reçoit `ack{statut:'refus', raison:<code>}` plutôt qu'`erreur`.

## Exemple

```jsonc
// → 
{"t":"hello","v":1,"personne":"pers_alice","session":"onglet_7f3a","nom":"Alice","role":"regie","seq":0}
// ←
{"t":"bienvenue","v":1,"vous":{"personne":"pers_alice","session":"onglet_7f3a","nom":"Alice","couleur":"#e0674a","role":"regie"},
 "seq":12,"version":4,"a_jour":false,"projet":{/* … */},"mode":"ecrire","lecture":null,
 "presents":[/* … */],"verrous":[],"commentaires":[],"chat":[],"ts":1793102124925}
// →
{"t":"modif","cseq":1,"base":12,"ops":[{"op":"poser","chemin":["ev",{"id":"e2"},"name"],"valeur":"Prologue revu"}]}
// ← (à tous)
{"t":"modif","seq":13,"ops":[…],"par":"pers_alice","session":"onglet_7f3a","cseq":1}
// ← (à Alice)
{"t":"ack","cseq":1,"statut":"ok","res":{"seq":13,"base_en_retard":false}}
```

## Persistance côté salle (SQLite du Durable Object)

`etat` (instantané `{seq, projet}`, `version_base`, `seq_enregistre`, mode, lecture) · `journal` (deltas depuis le
dernier instantané ; instantané tous les 100 deltas et à chaque enregistrement) · `sessions` (`last_cseq`, dernier
`ack`) · `verrous` · `commentaires` · `chat` (500 derniers). Au réveil (hibernation, redémarrage), la salle se
reconstruit : dernier instantané + rejeu du journal. Les curseurs sont éphémères (non conservés).
