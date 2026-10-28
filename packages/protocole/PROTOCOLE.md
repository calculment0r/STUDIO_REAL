# Protocole du serveur de spectacle (v2)

**La référence unique** des messages échangés avec le serveur de spectacle STUDIO_REAL. Elle remplace, à terme,
`apps/serveur/PROTOCOLE.md` (salle de projet v1) et `prototypes/figurants/PROTOCOLE.md` (serveur des figurants du 27/10),
ainsi que les messages de la sortie écran scène (`apps/conducteur/src/sortie/protocole.ts`).

- Types : `src/spectacle.ts`. Validation (à la main, sans dépendance) : `src/lire.ts`, fonctions
  `lireMessageClient(x)` et `lireMessageServeur(x)` qui renvoient `{ message }` ou `{ message: null, raison }`.
- Origine des décisions : `docs/audit-2026-10/01-architecture.md` §4.3 et §4.4, `02-sorties-et-emulateur.md` §4.3.
- Le calcul de ce que voit chaque acteur est dans le modèle (`packages/modele/src/acteurs.ts`, `vueActeur()`).

Un serveur, un protocole, des acteurs sur la planche : la **régie** conduit, le **serveur** fait tourner le lecteur et
diffuse à chaque **acteur** sa vue ; les acteurs renvoient leurs entrées et ce qu'ils affichent ; les **agents** (figurants,
ElevenLabs, Whisper, pont OSC) exécutent les commandes numérotées du lecteur et les accusent.

## Transport

- WebSocket, messages **JSON texte**, champ `t` obligatoire, **256 Ko** au plus. Version : **2** (`hello.v`).
- Le premier message est `hello`. Tant qu'il n'est pas accepté, le serveur répond `refus`.
- Bornes de toute donnée libre (`params`, `data`, `donnees`, `res`) : textes ≤ **2000** caractères, tableaux ≤ **200**
  éléments, objets ≤ 200 clés, profondeur ≤ 8, clés `__proto__`, `prototype`, `constructor` interdites. Les champs
  inconnus sont ignorés (le message est reconstruit).
- Heures en millisecondes : `at`, `ts` = horloge du **serveur** ; `tc`, `heure`, `depuis`, `affiche` = horloge du **client**.
  Le client calcule son décalage avec `ping{tc}` → `pong{tc, ts}`.

## Rôles

| `role` | Qui | Reçoit | Envoie |
|---|---|---|---|
| `auteur` | poste d'écriture | messages v1 de la salle de projet (`modif`, `verrou`, `mode`, `chat`, `commentaire`…), inchangés : `apps/serveur/src/logique/protocole.ts` | idem |
| `regie` | le Conducteur en mode scène | `lecture`, `salle`, `ack` | `conduite` |
| `acteur` (+ `acteur:<id>`) | sortie scène, téléphone du public, téléphone nommé, prompteur | `vue`, `fx`, `ack` | `in`, `etat` |
| `agent` (+ `acteur:<id>`) | service figurants, enveloppe ElevenLabs, Whisper, pont OSC | `agent.cmd` | `agent.ack`, `agent.in` |

Un jeton par rôle (et par acteur nommé). Le jeton n'est jamais conservé dans l'adresse une fois la connexion faite.

## Numérotation, reprise, idempotence

| Numéro | Portée | Règle |
|---|---|---|
| `cseq` | par session, client → serveur | croissant (1, 2, 3…) sur tout message qui change quelque chose (`conduite`, `in`, `agent.in`). Un `cseq` déjà vu n'est pas réappliqué : `ack{statut:'doublon'}`. Le client renvoie sans risque ce qui n'a pas été acquitté. |
| `vseq` | par acteur (et par personne pour une vue ciblée), serveur → client | croissant sur chaque `vue`. Un trou → le client envoie `resync` et reçoit la vue courante. |
| `n` | par représentation | numéro de commande du lecteur ; `agent.cmd` est **idempotent** chez l'agent (rejouer `n = 57` ne relance pas Junon). |

- À la connexion, `bienvenue` porte la **vue courante** de l'acteur (instantané) et le dernier `cseq` reçu de la session.
- Les `fx` dont `at + ttl` est passé ne sont pas rejoués.
- Une seule voix par personne et par question : l'unicité `(personne, q)` est tenue par le serveur.

## Client → serveur

| `t` | Rôle | Champs | Réponse |
|---|---|---|---|
| `hello` | tous | `v` (= 2), `role`, `acteur?` (obligatoire pour `acteur` et `agent`), `personne?`, `session`, `jeton`, `vseq?`, `cseq?`, `app?{version, build}`, `capacites?[]`, `pseudo?` (2 à 20 caractères, téléphone du public) | `bienvenue`, ou `refus` |
| `conduite` | regie | `cseq`, `op` + champs de l'op (tableau suivant) | `ack` ; puis `lecture` |
| `in` | acteur | `cseq`, `k`, `q?` (question), `data`, `heure?` (tableau suivant) | `ack` |
| `etat` | acteur | battement : `heure`, `ecran` (`{vseq, ecran, cle?, depuis}` ou `null`), `visible`, `enLigne?`, `rttMs?`, `decalageMs?`, `media?[]{asset, pret 0→1, lecture}`, `batterie?` (0→100), `erreurs?[]` | — |
| `agent.ack` | agent | `n`, `statut` (`recu` \| `fait` \| `echec` \| `refus`), `detail?` | — (`fait` → signal `accuse:<étape>` du lecteur) |
| `agent.in` | agent | `cseq`, `k` (nom : `say`, `stat`, `transcript`, `fin-appel`…), `data` | `ack` |
| `ping` | tous | `tc` | `pong` |
| `resync` | tous | — | `vue` courante (acteur) ou `bienvenue` |
| `rtc` | acteur | `vers` (acteur ou session), `signal` (objet opaque, ≤ 64 Ko) | `rtc` relayé |

`etat` est envoyé 1 fois par seconde par un écran, 1 fois toutes les 5 s par un téléphone. Il dit ce qui est **affiché**
(pas ce qui a été demandé) : la régie compare avec la dernière `vue` et affiche l'écart.

### `conduite` : les ordres de la régie

| `op` | Champs | Effet |
|---|---|---|
| `top` | — | top régie (`lecteur.top()`) |
| `lancer` | `mode?` (`repetition` \| `scene`), `graine?` | démarre une représentation (nouveau `run`) |
| `pause` | `pause` (défaut vrai) | arrête / relance l'horloge du lecteur |
| `allerA` | `moment`, `etape?` | `lecteur.allerA()` |
| `reprendre` | `point?` | repart d'un point de reprise (`lecteur.reprendre()`) |
| `poser` | `nom`, `valeur` (nombre, texte, vrai/faux) | pose une mémoire (`lecteur.poser()`) |
| `signal` | `nom`, `donnees?` | signal extérieur (`lecteur.signal()`) |
| `forcer` | `acteur` (acteur ou cible dans la foule), `vue{ecran, params?}` | impose une vue à la main, journalisée (remplace l'arbitrage des régies de la sortie) |
| `panique` | `actif` (défaut vrai) | tous les acteurs sur leur écran de sécurité ; `actif:false` lève la panique |
| `valider` | `id`, `ok`, `texte?` | décision sur une réplique de figurant en attente (ex `fig.valide`) |

### `in` : les entrées des acteurs

Une seule famille pour tout ce qu'un acteur renvoie (ex `entree` et `ack{n, affiche}` des sorties, `vote.choix`,
`msg`, `choix.reponse` des figurants). Chaque entrée devient, côté serveur, un signal du lecteur nommé
`<acteur>.<k>` (`public.vote`, `scene.fin-video`, `franck.transcription`), et les votes alimentent `Signaux`
(`quorum`, `issue`, `votes`).

| `k` | `data` | Exemple |
|---|---|---|
| `vote` | `index` (0 → 25), `numero?` ; `q` = question | `{"t":"in","cseq":42,"k":"vote","q":"q1","data":{"index":2}}` |
| `texte` | `texte` (≤ 2000, non vide) ; `q?` | commentaire, « pourquoi ? » |
| `reaction` | `emoji` (≤ 16), `n?` (1 → 100) | 😂 |
| `pret` | `pret` (défaut vrai) | téléphone prêt |
| `presence` | `visible` | l'onglet passe au premier plan / en arrière-plan |
| `fin-video` | `asset`, `vseq?` | vidéo jouée une seule fois, terminée |
| `transcription` | `texte`, `final?` | micro du comédien |
| `accuse` | `vseq`, `affiche` (heure client de l'affichage), `refus?` (`version` \| `invalide` \| `capacite`) | accusé d'affichage d'une vue : latence = `affiche` − `vue.at`, ramené à l'horloge du serveur |

## Serveur → client

| `t` | Destinataires | Champs |
|---|---|---|
| `bienvenue` | l'émetteur du `hello` | `v`, `role`, `acteur?`, `session`, `ts`, `vue` (vue courante ou `null`), `cseq` (dernier reçu de la session), `lecture?` (régie) |
| `vue` | un acteur (ou une personne de la foule) | `acteur`, `vseq`, `at`, `ecran` (ou `null` : aucun écran encore), `params`, `cle?` |
| `fx` | un acteur | `acteur`, `id`, `at`, `kind` (`vibrer`, `son`, `flash`, `pop`…), `p`, `ttl` (ms, ≤ 10 min) |
| `lecture` | régie | `etat` (`EtatLecture` du modèle), `par`, `ts` — émis par le serveur en scène |
| `salle` | régie | `ts`, `acteurs{<id>: {presents, prets?, enLigne?}}`, `vote?{q, recus, parts[]}` — ≤ 4 par seconde |
| `agent.cmd` | un agent | `n`, `type` (`figurants.cmd`, `appel`, `machine`…), `moment?`, `etape`, `donnees`, `at?` |
| `ack` | l'émetteur d'un `cseq` | `cseq`, `statut` (`ok` \| `doublon` \| `refus` \| `ferme`), `raison?`, `res?` |
| `refus` | l'émetteur | `code`, `message`, `fatal?` (le serveur ferme) — hello invalide, jeton faux, version |
| `pong` | l'émetteur | `tc`, `ts` |
| `resync` | un client | `raison` : renvoyer `hello` (redémarrage, nouvelle représentation) |
| `rtc` | l'acteur visé | `de`, `vers`, `signal`, `ts` |

### La vue d'un acteur

`vue.ecran` est l'un des écrans que l'acteur déclare (`Acteur.ecrans` du projet) ; `vue.params` sont les réglages de
l'envoi, où `"$question"` a été remplacé par le paramètre `question` de l'étape. Un acteur garde son dernier écran tant
qu'un envoi ne le remplace pas : la vue se recalcule à tout instant depuis le parcours du lecteur, ce qui rend la reprise
possible sans journal côté téléphone. Pour l'écran scène, `params` a la forme d'une `Scene` de la sortie
(`apps/conducteur/src/sortie/protocole.ts`), plus les écrans `mur`, `visio`, `flux-video`.

## Exemple : la question 1 d'Écho

```jsonc
// → (téléphone)  {"t":"hello","v":2,"role":"acteur","acteur":"public","personne":"tel_8f3a","session":"s_9c1d2e","jeton":"…","vseq":17}
// ←              {"t":"bienvenue","v":2,"role":"acteur","acteur":"public","session":"s_9c1d2e","ts":1793102124925,"cseq":0,
//                 "vue":{"acteur":"public","vseq":18,"at":1793102120000,"ecran":"vote","params":{"numero":1,"question":"…","reponses":["…"]},"cle":"b5_q1/b5_q1_s#1@8"}}
// →              {"t":"in","cseq":1,"k":"accuse","data":{"vseq":18,"affiche":1793102125010}}
// →              {"t":"in","cseq":2,"k":"vote","q":"1","data":{"index":2}}
// ←              {"t":"ack","cseq":2,"statut":"ok"}
// → (régie)      {"t":"conduite","cseq":9,"op":"top"}
// ← (régie)      {"t":"ack","cseq":9,"statut":"ok"}   puis   {"t":"lecture","etat":{…},"par":"serveur","ts":…}
// ← (figurants)  {"t":"agent.cmd","n":57,"type":"figurants.cmd","etape":"b5_q1_s","donnees":{"densite":"calme"}}
// → (figurants)  {"t":"agent.ack","n":57,"statut":"fait"}
```

## Correspondance avec les anciens protocoles

| Ancien | Nouveau |
|---|---|
| salle v1 `hello{v:1, role:'auteur'\|'regie'\|'poste'}` | `hello{v:2, role}` ; `poste` → `acteur` |
| salle v1 `scene{message}` (relais opaque, arbitré par la sortie) | `vue` de l'acteur `scene` ; forçage = `conduite{op:'forcer'}` |
| salle v1 `lecture` envoyé par la régie | `lecture` émis par le serveur ; la régie envoie `conduite` |
| sortie `bonjour{v, id}` | `hello{role:'acteur', acteur:'scene', app, capacites}` |
| sortie `present{scene, n, etat}` | `etat{ecran:{vseq, ecran, cle, depuis}, media…}` |
| sortie `fin-video{asset, n}` | `in{k:'fin-video', data:{asset, vseq}}` → signal `scene.fin-video` |
| rapport 2 `ack{n, affiche}`, `entree{type, valeur}` | `in{k:'accuse'}`, `in{k}` (une seule famille) |
| figurants `hello{role:'telephone'\|'chat'\|'ministre'…}` | `hello{role:'acteur', acteur:'public'\|'scene'\|'ministre'}` |
| figurants `vote.choix{numero, index}`, `msg{texte}`, `choix.reponse` | `in{k:'vote'}`, `in{k:'texte'}` |
| figurants `tel.cmd`, `ecran`, `vote.cmd`, `junon` (régie) | `envois` des étapes du projet → `vue` (conversion : `commandesVersEnvois` du modèle) |
| figurants `fig.cmd` / `fig.valide` / `fig.stat` | `agent.cmd{type:'figurants.cmd'}` / `conduite{op:'valider'}` / `agent.in{k:'stat'}` |
| figurants `asr{kind, texte}` | `in{k:'transcription'}` (acteur comédien) ou `agent.in` (agent `asr`) |
| figurants `welcome`, `pong{tc, ts}` | `bienvenue`, `pong{tc, ts}` (inchangé) |

## Reste à décider ou à faire (lots suivants)

- **L2** (serveur) : brancher ces messages dans le Durable Object (`apps/serveur`), le module représentation, l'état de salle,
  la diffusion par `vseq`, le journal unique ; porter les messages `auteur` v1 dans ce paquet (`salle`).
- Validation par schémas (zod) ou à la main : **non tranché** (rapport 6, Q5) ; ce paquet est à la main, sans dépendance.
- Tirage au sort `public:aleatoire:n` : fait par le serveur (graine de la représentation), transmis au modèle par
  `ContexteFoule.tirages`.
