# 01 — Architecture globale : un seul serveur, un seul protocole, des acteurs sur la planche

Audit du 28 octobre 2026, branche `audit/2026-10`. Périmètre : la cohabitation du Conducteur (`apps/conducteur`,
`packages/modele`, `apps/serveur`) et du prototype figurants (`prototypes/figurants`), le pont qui les relie, et la cible
unifiée. Toutes les références sont des `fichier:ligne` de la branche auditée.

## 1. Résumé

1. Le 27/10, **trois protocoles temps réel** ont tourné en même temps (sortie Écran scène, salle collaborative du Worker,
   `/ws` du serveur figurants), chacun avec ses rôles, son `hello`, sa reconnexion et son horloge ; aucun ne connaît les autres.
2. **L'état du spectacle n'existe nulle part de façon unique** : le lecteur déterministe vit dans l'onglet de la régie, l'état
   des téléphones et du mur dans la mémoire du processus Node, la scène dans la fenêtre de sortie. Un rechargement ou un
   redémarrage perd ou rejoue des commandes.
3. Le **pont** (`pont-figurants.ts`) est un relais aveugle : il envoie `params.cmds` de la première étape de chaque moment,
   sans accusé, sans reprise, sans retour d'état, et ignore les `commandes` numérotées que le moteur sait déjà émettre.
4. Le mur, le vote, la visio et le flux sont affichés par la sortie **dans une iframe vers un tunnel codé en dur** dans le
   JSON du projet : le spectacle dépend d'une adresse qui change à chaque lancement.
5. Le modèle `conducteur@1` **ne connaît ni acteur, ni écran, ni destinataire** : `params.sortie`, `params.cmds`,
   `params.telephones` sont du texte libre interprété par trois codes différents. L'auteur ne peut rien cibler depuis la planche.
6. Le moteur sait pourtant déjà : signaux extérieurs (`sig:`/`sigv:`), mémoires, gardes, commandes numérotées, salle
   simulée, points de reprise, simulation complète. Le 27/10 n'a utilisé que `top()`.
7. **Cible** : UN serveur de spectacle = `apps/serveur` (Worker + Durable Object) déployé sur un domaine fixe, qui héberge le
   lecteur en mode scène et calcule la **vue de chaque acteur** ; les agents (figurants, ElevenLabs, Whisper) deviennent des
   clients `agent` de ce serveur ; un adaptateur Node du même noyau pour répéter hors ligne.
8. **Un protocole** : rôles typés, `vue{acteur, vseq}` + instantané, entrées `in{cseq}` idempotentes avec `ack`, commandes du
   lecteur routées vers les acteurs avec accusé, horloge serveur.
9. **Nœuds acteurs sur la planche** : `Projet.acteurs[]` et `Etape.envois[]` ; l'étape « envoie » un écran à un acteur, l'acteur
   « renvoie » des signaux lisibles par les conditions. Écho se compose alors sans code (exemple §4.4).
10. **Huit lots**, de la décision d'hébergement (L0) au nettoyage (L8) ; Écho se rejoue sans régression après L0–L4 + L7.

## 2. Constats

### C1 — Trois protocoles temps réel, trois reconnexions, trois horloges (P1)

**Preuve.**
- Sortie Écran scène : `MessageRegie`/`MessageSortie`, `apps/conducteur/src/sortie/protocole.ts:149-161` (`etat`, `scene`,
  `evenement`, `config`, `precharger`, `heure` / `bonjour`, `present`, `fin-video`, `au-revoir`), transport BroadcastChannel
  (`canal.ts`) ou salle (`salle.ts:48-153`, sa propre reconnexion `ATTENTES_MS` l.34, son ping l.32).
- Salle collaborative : `apps/serveur/PROTOCOLE.md` (hello/bienvenue, `modif{seq}`, `cseq`/`ack`, `lecture`, `scene`,
  `rtc`), client `apps/conducteur/src/etat/serveur.ts:305` (`SalleClient`, reconnexion et ping l.302-303).
- Figurants : `prototypes/figurants/PROTOCOLE.md` (hello/welcome, `msg{cseq}`, `fig.cmd`, `vote.cmd`, `tel.cmd`, `junon`,
  `ecran`, `rtc`, `choix.reponse`), client `pages/commun/ws.js:26-189` (backoff l.145-153, ping 4 s l.92-106, `cseq` en
  sessionStorage l.48-53), serveur `serveur/jeu.mjs:336-365`.
- Le pont ouvre une **quatrième** connexion, sans reconnexion sérieuse (`setTimeout(ouvrir, 2000)` à
  `apps/conducteur/src/coquille/pont-figurants.ts:25`) et sans lecture des messages du serveur (aucun `onmessage`).

Redondances : `cseq`/idempotence existe dans la salle (`SalleProjet` sessions, PROTOCOLE.md §Identité) et dans le prototype
(`jeu.mjs:406-413` `_dejaVu`) ; le relais WebRTC existe dans la salle (`SalleProjet.ts:311,425`, `flux/protocole.ts`) et dans
le prototype (`jeu.mjs:234-248`) ; le ping/pong avec heure serveur existe trois fois.

**Impact 27/10.** « Serveur à redémarrer sans cesse, tunnel à recoller partout, ports qui restent occupés » (00-contexte.md
§Problèmes) : chaque transport a ses propres pannes et ses propres réglages.

### C2 — Le pont est un relais aveugle, non déterministe, sans accusé ni reprise (P0)

**Preuve.** `pont-figurants.ts:31-40` : `useMagasin.subscribe` ne regarde que `lecture.moment` ; il lit
`mo.st[0].params.cmds` (seulement la **première** étape du moment, l.36) et fait `ws.send` de chaque objet tel quel (l.39).
Pas de `cseq`, pas d'`ack`, pas de file d'attente : si le socket est fermé, un toast et les commandes sont **perdues** (l.38).
Après reconnexion, `dernier` reste posé (l.30-33) : rien n'est renvoyé. Les commandes sont donc des effets de bord de
l'interface React, pas des sorties du moteur.

Le moteur a pourtant déjà un canal pour ça : `CommandeLecture{n, t, type, moment, etape, donnees}` numérotées
(`packages/modele/src/moteur.ts:81-89`), émises par `emettre()` (`lecteur.ts:151-157`) pour `machine`, `message`,
`chrono`, `figurants.cmd`, `reprise` (`lecteur.ts:228-243`), relevées par la régie (`etat/magasin.ts:175-187`) et
`etatPlateau(n)` qui sait rejouer l'état du plateau à une reprise (`lecteur.ts:491-498`). Le 27/10, ces commandes ne
sortaient que dans le journal du pupitre (`etat/regie.ts:172-174`).

Déterminisme : le moteur est pur (`moteur.ts:1-2`), mais le pont dépend de l'ordre des rendus zustand et de l'état du socket :
même projet + mêmes tops ≠ mêmes messages envoyés.

**Impact 27/10.** Tops « perdus » sans qu'on sache lesquels ; obligation de garder la page `regie/` du prototype ouverte en
doublon (`pages/regie/regie.js:554-566`, conduite à 14 boutons).

### C3 — L'état du spectacle n'existe nulle part de façon unique (P0)

**Preuve.** Quatre copies partielles, aucune autoritaire :
1. Le **lecteur** est une variable de module dans l'onglet régie : `etat/magasin.ts:122` (`let lecteur`), avancé par
   `requestAnimationFrame` (`magasin.ts:442-462`). Au chargement, `revenirAuDebut()` (`magasin.ts:465`) replace la lecture au
   moment 1 : la lecture **n'est pas persistée** (`persistance.ts` n'écrit que projet/assets/runs, `magasin.ts:468-470`).
2. L'état des **téléphones, du mur et du vote** vit dans `Jeu` : `jeu.mjs:21-24` (`this.tel`, `this.ecran`, `this.vote`),
   `historique` l.30 ; rien n'est écrit sur disque (le journal JSONL est un journal, pas un instantané) : un redémarrage du
   serveur remet `tel = 'video'`, `ecran = 'mur'`, `vote = null`.
3. La **scène** affichée vit dans la fenêtre de sortie (arbitrage par date, `sortie/arbitrage.ts`), rejouée seulement si une
   régie renvoie sa scène au `bonjour` (`relais.ts`).
4. La **copie de travail du projet** vit dans le Durable Object (`SalleProjet.ts:33-45`), avec `lecture` gardée
   (`SalleProjet.ts:298-303`), mais ce serveur n'a pas servi le 27/10.

Conséquence concrète du couple 1 + C2 : si le Conducteur est rechargé pendant le spectacle, `lecture.moment` revient à
`b1_entree` et le prochain « ▶ LECTURE » (`BoutonTap.tsx:18`) renvoie ses `cmds` : `{t:'tel.cmd', mode:'video'}`,
`{t:'ecran', mode:'qr'}`, `{t:'vote.cmd', cmd:'fermer'}` (`generer-echo-simple.ts:25`) → tous les téléphones repassent à
« Regardez la vidéo » et le mur au QR, en plein spectacle.

**Impact 27/10.** « État perdu au rechargement », « serveur à redémarrer sans cesse » (00-contexte.md).

### C4 — Le mur, la visio et le flux sont des iframes vers un tunnel codé en dur (P0)

**Preuve.** `projets/echo/generer-echo-simple.ts:66-68` (`SERVEUR = 'https://highway-regions-temperatures-penn.trycloudflare.com'`,
`MUR`, `VISIO` en `{type:'page', url}`), recopié 10 fois dans `projets/echo/echo.conducteur.json` (l.121, 166, 211, 266…).
La sortie rend la scène `page` par `<iframe src={scene.url}>` (`sortie/scenes.tsx:133-135`, commit `72b32bc`) ; la page
embarquée ouvre **sa propre** connexion `/ws` au serveur figurants (`pages/chat/chat.js:14-27`). L'adresse par défaut du QR est
le même tunnel (`sortie/protocole.ts:166-167`). Le flux Instagram sur scène est encore une page (`pages/flux/index.html`).

À chaque changement d'étape dont la `sortie` diffère (`cleScene = JSON.stringify`, `protocole.ts:220`), un nouvel iframe est
monté : rechargement complet de la page du mur, nouvelle connexion WebSocket, re-réception de l'historique (30 lignes,
`jeu.mjs:387`), audio à ré-autoriser (`chat.js:33-38` bandeau « cliquer ici pour autoriser le son »).

**Impact 27/10.** « Tunnel à recoller partout (QR, Conducteur, pages) », « vidéos très lentes à démarrer », « fenêtre de
sortie en cache » (le `?v=Date.now()` de `sortie/fenetre.ts:10-11` est un pansement).

### C5 — Deux régies concurrentes sans arbitrage ni retour d'état (P1)

**Preuve.** La page `regie/` envoie la même conduite que le pont (`pages/regie/regie.js:554-566` : `tel.cmd`, `junon`,
`ecran`, `vote.cmd`) ; le serveur accepte tout client `regie` muni du jeton (`jeu.mjs:367-371`), sans savoir laquelle a
la main. Le Conducteur se déclare `regie` (`pont-figurants.ts:24`) mais ne lit aucun message : il ne sait pas si le vote est
ouvert, si le mur est noir, combien de téléphones sont là (`jeu.mjs:208-209`, `292` envoient `tel` et `vote` à la régie,
ignorés).

**Impact 27/10.** « Visio réglable nulle part dans l'interface » ; la régie regardait deux écrans pour savoir où on en était.

### C6 — En représentation, le moteur lit une salle simulée, jamais la vraie (P1)

**Preuve.** `etat/magasin.ts:232` : `l.avancer(d, signauxSalle(get().projet.sens, e.tEtape))` en mode `jouer` comme en
`preparer`. `etat/moteur.ts:1-3` annonce « pour changer de moteur (serveur, signaux réels de la salle), on ne touche qu'à ce
fichier » mais rien n'y est branché. Les votes réels sont pourtant comptés côté serveur (`jeu.mjs:283-293`, journal
`vote_reel`) et le compte abonné/désabonné aussi (`jeu.mjs:195-199`) ; ils n'atteignent jamais `Signaux.quorum`,
`Signaux.votes` ni un `signal()` du lecteur. La fin de vidéo de la sortie remonte bien en `signal('video.fin')`
(`sortie/useRelaisSortie.ts:55-58`), mais Écho simple n'a aucune condition (`generer-echo-simple.ts:83`, `g: []`).

**Impact 27/10.** Chaque passage attend le top à la main ; aucune règle « passer quand 90 % ont voté » n'est possible.

### C7 — Le format `conducteur@1` n'a ni acteur, ni écran, ni destinataire (P1)

**Preuve.** `packages/modele/src/types.ts:75-92` : une étape a `ty`, `k[]`, `asset?`, `params?: Record<string, unknown>`.
Le ciblage est éclaté dans `params` :
- `params.sortie` → scène de l'écran de scène, lu seulement par `sortie/traduction.ts:103-118` ;
- `params.cmds` → messages bruts du prototype, lus seulement par le pont (`pont-figurants.ts:36`) ;
- `params.telephones`, `params.ecran`, `params.plateau`, `params.outil` → texte libre pour l'humain
  (`generer-echo-simple.ts:77`) ;
- `params.destinataire` du bloc Message (`blocs-moteur.ts:60-62`) et `params.cible` du bloc Machine : des chaînes.
Les pistes de type `tel` (`types.ts:127`) sont des clips sans sémantique d'écran. Rien ne nomme le téléphone de la ministre,
le prompteur de Franck ou l'agent ElevenLabs : ils n'existent que comme pages HTML (`pages/ministre`, `pages/eco`,
`pages/visio/franck.html`).

La validation ne vérifie donc rien de tout ça (`valider.ts` ne connaît que `tr`, `g`, blocs moteur).

**Impact 27/10.** Pour changer « ce qui s'affiche sur les téléphones à l'étape 5 », il fallait éditer un générateur TypeScript
et une page HTML.

### C8 — Quatre vocabulaires de rôles (P2)

**Preuve.** Salle : `auteur | regie | poste` (`apps/serveur/src/logique/protocole.ts:23`). Figurants :
`chat | regie | comedien | telephone | ministre | visio` (`jeu.mjs:10`) + postes `franck | ministre | scene` (`jeu.mjs:236`).
Flux : `canal` libre, défaut `streamer` (`flux/protocole.ts:19`). Sortie : `source` = identifiant de régie
(`sortie/protocole.ts:225`). L'étude figurants prévoyait un rôle `animateur_figurants` (`docs/etudes/figurants-ia.md` §8.3)
jamais créé.

### C9 — Le serveur Cloudflare a l'ossature de la cible, mais il n'est ni déployé ni ouvert (P1)

**Preuve.** Ce qui existe : un DO par projet avec hibernation et SQLite (`SalleProjet.ts:1-11`), `cseq`/`ack` doublons,
instantané + `resync`, `lecture` gardée et rediffusée (`SalleProjet.ts:298-303`), relais `scene` (l.308-309) et `rtc`
(l.311, 425), médias R2 avec `Range` (README §API), exécutions et événements idempotents (`POST …/runs/:run/evenements`).
Ce qui manque : `wrangler.jsonc:26` (`database_id` à zéro), `workers_dev: false` (l.11), `ORIGINES_AUTORISEES` limité à
`localhost:5173` (l.41) → GitHub Pages est refusé 403 (`apps/serveur/src/index.ts:23`, `http.ts:29-34`). README :
« Rien n'est déployé ». Le relais `scene` ne garde rien (l.309) : une sortie qui se connecte après la régie n'a rien tant
qu'une régie ne renvoie pas.

**Impact 27/10.** Faute de serveur à domaine fixe, c'est le prototype + `cloudflared` quick qui a servi, avec les
problèmes C3/C4.

### C10 — Latence structurelle du chemin d'un top (P1)

**Preuve.** Un top traverse : Conducteur (GitHub Pages) → WebSocket par le tunnel public → serveur Node (sur dgx2 via SSH ou
sur le PC) → `versRole` (`jeu.mjs:65`) → tunnel → téléphones et iframe du mur. La sortie, elle, reçoit la scène par
BroadcastChannel puis **recharge une page** (C4). Les vidéos sont servies depuis `medias-locales/` par plages
(`index.mjs:118-131`) à travers le tunnel, par chaque téléphone (`echo.js:149` précharge dès le `welcome`). Rien n'utilise
l'horloge serveur pourtant calculée (`ws.js:96-106`) pour programmer un effet « à T ».

S'y ajoute une contrainte du moteur : une étape dure au moins `dureeEtape` = 10 s avec `k[0] = 0` (`types.ts:161`,
`lecteur.ts:335-346` `if (!force && s.tEtape < d) return`), et le TAP n'est actif qu'à `!enLecture` (`BoutonTap.tsx:12`),
donc au passage : d'où la pause automatique ajoutée à la hâte (`magasin.ts:240`, commit `68590f1`).

**Impact 27/10.** « Latences ressenties », « vidéos très lentes à démarrer ».

### C11 — Deux signalisations WebRTC pour la même chose (P2)

**Preuve.** Le Conducteur a un émetteur complet (`apps/conducteur/src/streamer/emetteur.ts`, 422 lignes, `flux/protocole.ts`
avec `annonce/recherche/offre/reponse/candidat/fin/consigne`) relayé par la salle. La visio du 27/10 a été refaite en 100
lignes (`pages/visio/visio.js`) sur un relais ad hoc (`jeu.mjs:234-248`). Aucun des deux n'est réglable depuis le Conducteur
(C5).

### C12 — Les agents IA sont hors de tout pilotage (P1)

**Preuve.** ElevenLabs : la page `pages/eco/eco.js` n'est qu'un prompteur ; elle reçoit `vote` (l.33) pour surligner la
question, l'appel lui-même est lancé à la main par Franck (00-contexte.md : « page eco de Franck »). Figurants : le bloc
`x:figurants` émet `figurants.cmd` (`lecteur.ts:243`, `blocs-moteur.ts:562-567`) mais le pupitre ne fait que l'afficher
(`etat/regie.ts:189`) ; le serveur figurants attend `fig.cmd` de la régie (`jeu.mjs:435-445`). Whisper : audio binaire sur
`/ws` (`jeu.mjs:49-62`), réservé au rôle `comedien` ; la transcription n'arrive jamais au bloc « Quand le comédien dit »
(`lecteur.ts:568-573` attend `signal('transcription', …)`).

### C13 — Jetons en URL puis en stockage local (P2, à traiter par le chantier sécurité)

**Preuve.** `pont-figurants.ts:13-15` (`?jeton_regie=` → localStorage), `sortie/salle.ts:163-171` (jeton du projet dans
l'adresse de la sortie), `ws.js:118` (`?jeton=`). Le serveur statique a bien une liste blanche (`index.mjs:72`).

### C14 — Trois journaux, aucun rejouable ensemble (P2)

**Preuve.** `Execution.evenements` dans le magasin (`magasin.ts:196-214`), JSONL côté figurants (`serveur/journal.mjs`,
`jeu.mjs:386,310`), journal des deltas dans le DO. Le journal du lecteur (`EtatLecture.journal`, `moteur.ts:42`) n'est
envoyé nulle part. Principe 2 du README (« tout est un événement journalisé ») non tenu.

## 3. Risques si rien n'est fait

- **Prochain tunnel = tout à réécrire** : adresse dans le JSON du projet (×10), dans `protocole.ts:167`, dans le QR ; une
  faute de frappe = mur noir en salle (C4).
- **Un rechargement de la régie renvoie l'accueil à toute la salle** (C2 + C3). Un redémarrage du serveur Node efface le vote
  en cours et le mode des téléphones (C3).
- **Aucune règle automatique possible** (quorum, fin de vidéo, mot du comédien) tant que la vraie salle n'entre pas dans le
  moteur (C6) : la régie reste seule maîtresse du rythme, avec 10 s de latence minimale par étape (C10).
- **Deux régies qui se contredisent** (C5) : un clic sur la page `regie/` pendant que le Conducteur joue, et le mur ne
  correspond plus à la timeline.
- **Chaque nouveau spectacle = de nouvelles pages HTML** (C7) : le studio ne « fabrique » rien, il faut un développeur par
  représentation.
- **Dérive des trois protocoles** (C1) : la prochaine fonction (ex. notification plein écran) sera ajoutée dans un seul des
  trois, et il faudra un nouveau pont.
- **Dépendance aux machines** : serveur sur dgx2 par tunnel SSH qui tombe (00-contexte.md) ; aucun plan B écrit pour les
  figurants si Ollama tombe en salle (le `FOURNISSEUR=banque` existe, `index.mjs:25`, mais pas de bascule pilotée).

## 4. Proposition cible

### 4.1 Cartographie honnête de l'existant (qui parle à qui)

```
                 BroadcastChannel (même machine)            salle DO (jamais le 27/10)
 Conducteur ──────────────────────────────▶ Sortie scène ◀────────────────────────── Worker apps/serveur
 (React, lecteur       MessageRegie/Sortie   (sortie.html)    { t:'scene' } relayé     (SalleProjet : projet, lecture,
  dans l'onglet)                                │ iframe                               scene, rtc ; D1, R2)
      │ pont-figurants.ts                       │ { type:'page', url: tunnel }
      │ { t:'tel.cmd'|'ecran'|'vote.cmd'|'junon' }  (params.cmds, 1re étape du moment)
      ▼                                          ▼
 Serveur figurants Node (jeu.mjs, /ws) ◀──── pages/chat (mur)  pages/flux  pages/visio/scene.html
      ▲        ▲          ▲         ▲
      │        │          │         └── pages/regie (2e régie, même commandes)
      │        │          └── pages/ministre (rôle ministre), pages/eco (rôle ministre !, prompteur ElevenLabs)
      │        └── pages/visio/franck|ministre (rôle visio, WebRTC p2p)
      └── pages/echo (rôle telephone : props, vote, tel, choix.reponse, msg)
 Orchestrateur figurants (Ollama dgx2 / 3090, Anthropic) · Whisper (ASR_URL) : dans le même processus Node
 ElevenLabs : appel lancé à la main sur le téléphone de Franck, hors protocole
```

Déterministe : `packages/modele` (lecteur, salle simulée, blocs, planification). Non déterministe : le pont (ordre des
rendus, état du socket), `Jeu` (compteurs du vote truqué avec `Math.random()`, `jeu.mjs:150`, minuteurs `setInterval`),
l'orchestrateur (LLM, délais tirés), la sortie (arbitrage par horloge murale).

Ce que `packages/modele` sait déjà faire et que le 27/10 n'a pas utilisé :

| Capacité | Où | Utilisé le 27/10 ? |
|---|---|---|
| Signaux extérieurs comptés / valués : `sig:<nom>`, `sigv:<nom>` | `types.ts:96-99`, `conditions.ts:35-43` ; `lecteur.ts:558-576` | non (seule `video.fin` est câblée, sans condition dans Écho) |
| Mémoires de spectacle `mem:<nom>`, `poser()` | `types.ts:36`, `lecteur.ts:550-557` | non |
| Gardes (`g:garde`) avec sortie anticipée et délai | `lecteur.ts:343-355` | non (Écho simple : « sans garde ») |
| Commandes numérotées vers l'extérieur + état plateau rejouable | `moteur.ts:81-89`, `lecteur.ts:491-498` | non (journal seulement) |
| Points de reprise `p:reprise`, `reprendre()` | `lecteur.ts:577-613` | non |
| Salle simulée déterministe, votes, issue | `salle.ts:71-92` | oui, mais **aussi en représentation** (C6) |
| Simulation complète d'une soirée | `lecteur.ts:640-663` `simuler()` | non |
| Signaux `Signaux{pres, quorum, prets, bruit, assis, votes}` injectables à chaque `avancer()` | `moteur.ts:6-15` | jamais alimentés par la vraie salle |
| Bloc « Quand le comédien dit » sur `signal('transcription')` | `lecteur.ts:568-573` | non |
| Bloc figurants → `figurants.cmd` | `lecteur.ts:243` | non relayé |

### 4.2 UN serveur de spectacle : faire grandir `apps/serveur`

**Décision proposée : le serveur de spectacle est le Worker + Durable Object `apps/serveur`, déployé sur un domaine fixe
(workers.dev ou domaine du propriétaire), et il héberge le lecteur en mode scène.** Le serveur Node du prototype disparaît
comme serveur ; son orchestrateur, Whisper et les banques deviennent un **service agent** client du serveur de spectacle.

Arguments, en regard du réel du 27/10 :
1. **Le public était en 4G/5G**, pas sur un Wi-Fi de salle (`sortie/protocole.ts:166` : « les spectateurs sont en 4G/5G »). Un
   serveur Node « local en salle » a donc besoin d'un tunnel de toute façon — c'est exactement ce qui a fait mal. L'étude
   serveur le disait (`docs/etudes/serveur-temps-reel.md` §1.5 : « seulement si une salle n'a aucun accès Internet fiable »).
2. **Domaine fixe = fin des recollages.** QR, Conducteur, sortie, téléphones pointent une fois pour toutes sur
   `https://<domaine>/…`. Le Worker sert aussi le client (`wrangler.jsonc:15-20`, même origine : plus de CORS, cookie de
   session possible, D2 de l'étude).
3. **Le code existe** : DO avec hibernation, SQLite, `cseq`/`ack`, instantané, `lecture`, relais `scene`/`rtc`, R2 avec
   `Range`, exécutions idempotentes (C9). Le déploiement est une procédure documentée en 7 points (README §Déployer).
   Coût : plan Workers Paid 5 $/mois, 0 $ de plus pour 500 connexions × 2 h (étude §2.5).
4. **Ce qui ne peut pas tourner dans un DO** (Ollama, Whisper, audio binaire, ElevenLabs côté serveur) n'a pas à y tourner :
   c'est le rôle `agent`, un client WebSocket comme les autres, qui tourne sur dgx2 ou sur le PC de régie et se connecte en
   sortant (pas de port à ouvrir, pas de tunnel SSH à maintenir).
5. **Plan B écrit, pas improvisé** : le noyau (`lecteur` + vue par acteur + protocole) est déjà pur TypeScript ; un
   adaptateur Node (`ws` + fichier JSON) du **même** noyau sert aux répétitions sans réseau, aux bots et aux tests (D3 de
   l'étude ; `vitest` lance déjà `wrangler dev`). Il ne remplace pas la production.

Alternative rejetée : garder Node (`prototypes/figurants/serveur`) comme serveur de spectacle et le faire grossir. Il a 26 Ko
de logique de spectacle non testée, aucune persistance, un seul processus pour le jeu *et* les LLM (un appel Ollama lent
retarde la diffusion d'un `vote`), et il devrait de toute façon se mettre derrière un tunnel.

Ce qu'il faut ajouter au DO (lot L2) :
- un **module « représentation »** à côté de la copie de travail : `run` courant, `lecteur` (du paquet modèle) avancé par
  une alarme à 1 Hz et réévalué à chaque entrée (top, signal, mémoire) ; en mode `preparer`, le lecteur reste local à la régie
  comme aujourd'hui ;
- la **vue par acteur** `vueActeur(projet, etatLecture, acteur, etatSalle) → Vue` (fonction pure du paquet modèle, lot L1),
  diffusée avec `vseq` ; instantané à la connexion ;
- l'**état de salle** (présents par acteur, votes par question, textes, prêts) qui alimente `Signaux` réels et
  `lecteur.signal()` ;
- le routage des `commandes` du lecteur vers les acteurs/agents avec accusé (`accuse:<étape>` déjà prévu, `moteur.ts:129`).

Où tourne le lecteur, en une phrase : **en scène, dans le serveur ; en répétition, dans la régie** ; la régie en scène garde
un lecteur miroir (même code, même graine, resynchronisé à chaque `lecture` reçu) pour animer la timeline à 60 i/s sans
attendre le réseau. Téléphones et sortie ne font tourner aucun moteur : ils rendent la `vue` reçue (principe 1 du README).

### 4.3 UN protocole

Base : `apps/serveur/PROTOCOLE.md` (on garde `hello/bienvenue`, `seq/cseq/ack`, `instantane/resync`, `ping/pong{ts}`,
`modif`, `verrou`, `mode`, `rtc`) ; on y **ajoute** le vocabulaire du spectacle et on **retire** `scene` opaque au profit de
`vue`.

**Rôles** (champ `role` du `hello`, jeton par rôle) :

| `role` | Qui | Reçoit | Envoie |
|---|---|---|---|
| `auteur` | poste d'écriture | `modif`, présence (inchangé) | `modif`, `verrou` |
| `regie` | le Conducteur en mode scène | `lecture`, `salle` (compteurs), `agent.stat`, alertes | `conduite{cseq, op}` |
| `acteur` + `acteur:<id>` | sortie scène, téléphone du public, téléphone nommé, prompteur | `vue`, `fx` | `in{cseq}` |
| `agent` + `acteur:<id>` | service figurants, enveloppe ElevenLabs, Whisper, pont OSC | `agent.cmd`, `agent.ctx` | `agent.ack`, `agent.in`, `agent.stat` |

**Messages ajoutés** (JSON, champ `t`) :

```jsonc
// client → serveur
{"t":"hello","v":2,"role":"acteur","acteur":"public","personne":"tel_8f3a","session":"s_…","jeton":"…","vseq":17,"cseq":41}
{"t":"conduite","cseq":9,"op":"top"}                       // régie : top | lancer | pause | allerA | reprendre | poser | signal | forcer | panique
{"t":"conduite","cseq":10,"op":"signal","nom":"go.story"}
{"t":"in","cseq":42,"k":"vote","q":"q1","data":{"index":2}}  // acteur : vote | texte | reaction | pret | presence | fin-video | transcription | accuse
{"t":"agent.ack","n":57,"statut":"fait"}                     // agent : accusé de la commande n du lecteur (→ signal 'accuse:<étape>')
{"t":"agent.in","cseq":12,"k":"say","data":{"persona":"p_kev","texte":"…","origine":"N2"}}   // figurant → chat (même filtre que le public)
// serveur → client
{"t":"vue","acteur":"public","vseq":18,"at":1793…,"ecran":"vote","params":{"question":"…","reponses":["…"],"numero":1,"fin":1793…}}
{"t":"fx","acteur":"public","id":"x7:12","at":1793…,"kind":"vibrer","p":{"motif":[200,100,200]},"ttl":2000}
{"t":"lecture","etat":{…EtatLecture…},"par":"serveur","ts":…}          // inchangé, émis par le serveur en scène
{"t":"salle","ts":…,"acteurs":{"public":{"presents":138,"prets":131},"ministre":{"presents":1}},"vote":{"q":"q1","recus":121,"parts":[…]}}
{"t":"agent.cmd","n":57,"type":"figurants.cmd","etape":"b5_q1_s","donnees":{"densite":"calme","humeur":"moqueuse"}}
{"t":"ack","cseq":42,"statut":"ok|doublon|refus|ferme","res":{…}}
```

Règles :
- **Numérotation** : `seq` = journal global du DO (inchangé) ; `vseq` par acteur (trou → `resync` → instantané, D5) ;
  `cseq` par session (inchangé, `ack` doublon) ; `n` = numéro de commande du lecteur, unique par `run`
  (`moteur.ts:84`), ce qui rend `agent.cmd` **idempotent** chez l'agent (rejouer `n=57` deux fois ne relance pas Junon).
- **Instantané / reprise** : `bienvenue` porte la `vue` courante de l'acteur et son `vseq` ; les `fx` dont `at + ttl` est
  passé ne sont pas rejoués (doc 03 §6). Le DO persiste `run`, `etatLecture`, `etatSalle` dans SQLite à chaque entrée (déjà
  fait pour `lecture`, `SalleProjet.ts:302`).
- **Idempotence des votes** : unicité `(acteur-personne, q)` côté serveur (déjà dans `jeu.mjs:287` `v.reels.has`).
- **Horloge** : `pong{ts}` existe ; `vue.at` et `fx.at` sont en heure serveur ; les écrans programmés (rouge à T) l'utilisent.
- **Sortie scène** : `MessageRegie.scene` devient une `vue` de l'acteur `scene` (`Scene` de `sortie/protocole.ts:54-84`
  reste le type des `params`) ; l'arbitrage multi-régies disparaît : une seule source, le serveur, et un forçage régie =
  `conduite{op:'forcer', acteur:'scene', vue:{…}}` journalisé. Le BroadcastChannel reste comme transport local de secours.
- **Figurants** : `fig.cmd`/`fig.valide`/`fig.stat` de `prototypes/figurants/PROTOCOLE.md` deviennent `agent.cmd` /
  `conduite{op:'valider'}` / `agent.stat` ; le chat affiché est une `vue` de l'acteur `scene` (écran `mur`) et un `fx`
  `pop` ; le filtre reste côté serveur (une seule porte, règle dure du prototype).

### 4.4 Les nœuds « acteurs » sur la planche

#### Modèle de données (extension compatible de `conducteur@1`, champs facultatifs)

```ts
// packages/modele/src/types.ts (ajouts)
export interface Projet {
  // … existant …
  /** Les acteurs du spectacle : qui reçoit quoi. Ajout STUDIO_REAL. */
  acteurs?: Acteur[];
}

export type TypeActeur = 'regie' | 'comedien' | 'public' | 'ecran' | 'telephone' | 'agent';

export interface Acteur {
  id: string;                       // 'public', 'scene', 'ministre', 'franck', 'eco', 'figurants'
  type: TypeActeur;
  nom: string;                      // « Le public », « Téléphone de la ministre »
  /** Comment il est rendu : 'sortie' (fenêtre projecteur), 'telephone' (app téléphone, écran par acteur),
   *  'externe' (agent ou machine hors navigateur). */
  rendu: 'sortie' | 'telephone' | 'externe';
  /** Nombre attendu : 1 (nommé) ou 'n' (foule). Un acteur nommé a une adresse d'entrée propre (QR dédié). */
  cardinalite: 1 | 'n';
  /** Agent : quel service l'anime et sa configuration (jamais de clé ici). */
  agent?: { genre: 'figurants' | 'elevenlabs' | 'asr' | 'osc'; config?: Record<string, unknown> };
  /** Écrans qu'il sait afficher (validation) et signaux qu'il renvoie (proposés dans les conditions). */
  ecrans: string[];
  signaux: string[];
  /** Position sur la planche (bande des acteurs). */
  x?: number; y?: number;
}

export interface Etape {
  // … existant …
  /** Ce que l'étape envoie à chaque acteur à son entrée (ordre = ordre d'envoi). Ajout STUDIO_REAL. */
  envois?: Envoi[];
}

export interface Envoi {
  /** id d'un acteur, ou cible dans la foule : 'public', 'public:ont-vote:A', 'public:aleatoire:3' */
  vers: string;
  /** écran (vue persistante) ou effet (éphémère) */
  ecran?: string;                   // 'vote' | 'texte' | 'phrases' | 'video' | 'notification' | 'couleur' | 'noir' | 'regardez' | 'qr'
                                    // scène : 'noir' | 'accueil-qr' | 'mur' | 'vote' | 'visio' | 'video' | 'titre' | 'streamer' …
  fx?: string;                      // 'vibrer' | 'son' | 'flash' | 'pop'
  params?: Record<string, unknown>; // texte, réponses, asset, numéro, cadrage…
  /** 'entree' (défaut) · 'sortie' · { apres: s } : envoyé après un délai dans l'étape */
  quand?: 'entree' | 'sortie' | { apres: number };
  /** l'écran reste jusqu'à ce qu'un autre envoi au même acteur le remplace (défaut : oui) */
  tenir?: boolean;
}
```

Ce que l'acteur **renvoie** entre dans le moteur par deux portes déjà existantes :
- `Signaux` (quorum, prets, pres, votes, issue) calculés par le serveur à partir des `in` de l'acteur `public` : les
  conditions `quorum ≥ 90`, `issue = A` marchent sans rien changer au moteur ;
- `lecteur.signal(nom, donnees)` pour tout le reste, avec un nommage `acteur.signal` : `scene.fin-video`,
  `ministre.present`, `franck.transcription`, `eco.fin-appel`, `public.texte` (compte), `figurants.say`. Lisibles par
  `sig:ministre.present ≥ 1` ou `sigv:scene.fin-video = zoom_junon.mp4` (`conditions.ts:39-40`).

La règle d'héritage de la sortie (`traduction.ts:7-23`) devient la règle générale de **toutes** les vues : un acteur garde son
dernier écran tant qu'une étape ne lui en envoie pas un autre (`tenir`), ce qui rend `vueActeur()` calculable à tout instant
depuis le `parcours` du lecteur (`moteur.ts:30`) : c'est ce qui permet instantané et reprise sans journal côté téléphone.

#### Catalogue des types d'acteurs

| Type (`type`) | Rendu | Reçoit (écrans / fx) | Renvoie (signaux) | Exemple Écho |
|---|---|---|---|---|
| `regie` | Conducteur | alertes, `salle`, file à valider | `top`, `poser`, `signal`, `forcer` | la régie |
| `comedien` | téléphone nommé | `prompteur` (texte, question en avant), `consigne` (fx), `visio-appel` | `transcription`, `accuse` (« reçu »), `present` | Franck (prompteur ÉCO + visio) |
| `public` | app téléphone (foule) | `qr`, `regardez`, `video`, `phrases`, `vote`, `texte`, `choix+pourquoi`, `notification`, `couleur`, `noir`, `image+onde` ; fx `vibrer`, `son` | `vote` (→ quorum, issue, votes), `texte`, `reaction`, `pret`, `presence` | les spectateurs |
| `ecran` | sortie (fenêtre) | toutes les `Scene` existantes + `mur` (chat, vote, pops, audio) + `visio` + `flux-video` | `fin-video`, `present`, `absent` (média introuvable) | l'écran scène |
| `telephone` | téléphone nommé | `veille`, `vote-compteur`, `visio-appel`, `image` | `present`, `camera` | le téléphone de la ministre |
| `agent` figurants | externe (service) | `figurants.cmd` (densité, humeur, dire, segment, coupe), contexte | `say` (→ mur via filtre), `stat` | les abonnés qui commentent, « @x a voté » |
| `agent` elevenlabs | externe (enveloppe) | `appel` (agent_id, question n, prompt dynamique), `raccrocher` | `transcript`, `fin-appel`, `parle` | ÉCO |
| `agent` asr | externe | `ecouter` (acteur source) | `transcription` (vers le comédien) | Whisper sur dgx |
| `agent` osc | externe (pont local) | `machine` (cible, commande) | `accuse` | console son / lumière (plus tard) |

#### Sur la planche et dans l'inspecteur

- **Planche** : une **bande des acteurs** (à gauche ou en haut du calque monde, `Planche.tsx` dessine déjà cadres, blocs et
  liens en SVG) avec un nœud par acteur : glyphe du type, nom, pastille de présence en scène (138 présents, « ministre
  connectée »). Un lien **étape → acteur** = un `Envoi` (couleur de la famille `ui`/`scene` du catalogue,
  `blocs/catalogue.ts:17-26`) ; un lien **acteur → sortie d'étape** = une condition `sig:`/`sigv:` sur ce signal (couleur
  `trig`). Clic droit sur un acteur : « envoyer un écran ici », « attendre un signal ».
- **Inspecteur** (panneau de droite, étape sélectionnée) : un onglet **Envois** avec une ligne par envoi
  (acteur ▸ écran ▸ réglages, choisis dans `Acteur.ecrans`), et un onglet **Attend** qui liste les signaux de l'acteur
  (`Acteur.signaux`) à glisser dans une condition — c'est l'extension de `signauxAttendus()` (`etat/regie.ts:132-155`).
- **Conduite** : une piste par acteur, dérivée automatiquement des `envois` (clips « vote Q1 », « regardez la scène »…) ;
  la piste `tel` existante (`types.ts:127`) est reprise, le type `TypePiste` gagne `acteur:<id>`.
- **Pupitre** : les commandes relayées montrent leur accusé (`agent.ack`) ; le bouton « forcer » envoie une vue à la main.
- **Validation** (`valider.ts`) : acteur inconnu, écran que l'acteur ne sait pas afficher, envoi sans acteur de ce type, deux
  envois contradictoires au même acteur dans la même étape, signal attendu qu'aucun acteur ne renvoie.

#### Exemple : Écho, blocs 5 et 6, composés sans code

Acteurs du projet (une fois pour toutes, dans la fenêtre Projet) :

```jsonc
"acteurs": [
  { "id": "public",    "type": "public",    "nom": "Le public",               "rendu": "telephone", "cardinalite": "n",
    "ecrans": ["qr","regardez","video","phrases","vote","choix","notification","noir"], "signaux": ["vote","texte","pret","presence"] },
  { "id": "scene",     "type": "ecran",     "nom": "Écran scène",             "rendu": "sortie",    "cardinalite": 1,
    "ecrans": ["noir","accueil-qr","mur","vote","visio","video","titre"], "signaux": ["fin-video","present"] },
  { "id": "ministre",  "type": "telephone", "nom": "Téléphone de la ministre", "rendu": "telephone", "cardinalite": 1,
    "ecrans": ["veille","vote-compteur","visio-appel"], "signaux": ["present","camera"] },
  { "id": "franck",    "type": "comedien",  "nom": "Franck (Jim)",            "rendu": "telephone", "cardinalite": 1,
    "ecrans": ["prompteur","visio-appel"], "signaux": ["present","transcription"] },
  { "id": "eco",       "type": "agent",     "nom": "ÉCO (ElevenLabs)",        "rendu": "externe",   "cardinalite": 1,
    "agent": { "genre": "elevenlabs", "config": { "agent": "agent_…(identifiant hors dépôt)" } },
    "ecrans": ["appel","raccrocher"], "signaux": ["fin-appel","transcript"] },
  { "id": "figurants", "type": "agent",     "nom": "Les abonnés (figurants)", "rendu": "externe",   "cardinalite": 1,
    "agent": { "genre": "figurants", "config": { "banques": "echo" } }, "ecrans": ["figurants.cmd"], "signaux": ["say"] }
]
```

Bloc 5, question 1 (deux étapes, comme aujourd'hui `b5_q1` / `b5_q1_res`, mais tout est dans le projet) :

```jsonc
{ "id": "b5_q1", "name": "Q1 · réponses", "ty": "k:scene", "k": [0, 50, 50],
  "params": { "numero": 1, "question": "Je trouve ça dur d’être un homme blanc…", "reponses": ["…", "…", "…", "…"] },
  "envois": [
    { "vers": "scene",     "ecran": "mur",          "params": { "vote": "ouvert", "numero": 1 } },
    { "vers": "public",    "ecran": "vote",         "params": { "numero": 1, "question": "$question", "reponses": "$reponses" } },
    { "vers": "ministre",  "ecran": "vote-compteur","params": { "numero": 1, "scores": [41, 9, 37, 13], "duree": 20 } },
    { "vers": "franck",    "ecran": "prompteur",    "params": { "enAvant": 1 } },
    { "vers": "figurants", "ecran": "figurants.cmd","params": { "densite": "calme", "dire": { "intention": "voter et commenter la question" } } }
  ] },
{ "id": "b5_q1_res", "name": "Q1 · résultat", "ty": "k:scene", "k": [0, 50, 50],
  "envois": [
    { "vers": "scene",    "ecran": "mur",  "params": { "vote": "revele", "scores": [41, 9, 37, 13], "resultat": "…" } },
    { "vers": "public",   "ecran": "regardez", "params": { "texte": "Résultat à l’écran" } },
    { "vers": "ministre", "ecran": "vote-compteur", "params": { "revele": true } }
  ] }
```
Sorties : `b5_q1 → b5_q1_res` avec `g: [{k:'quorum', op:'≥', v:90}]` (sortie anticipée dès 90 % de votes) **et** une sortie
« sinon » à la fin de la durée, le top régie forçant toujours (`lecteur.top()`), exactement comme aujourd'hui. Le vote truqué
(`banques/echo/votes.json`) devient les `scores` de l'envoi : visibles et modifiables dans l'inspecteur, journalisés avec le
projet, plus de fichier relu à chaud (`jeu.mjs:113-123`).

Bloc 6, visio :

```jsonc
{ "id": "b6_visio", "name": "Visio Franck ↔ ministre", "ty": "k:scene", "k": [0, 50, 50],
  "envois": [
    { "vers": "scene",    "ecran": "visio",       "params": { "postes": ["franck", "ministre"], "son": { "franck": false, "ministre": true } } },
    { "vers": "franck",   "ecran": "visio-appel", "params": { "vers": ["scene", "ministre"] } },
    { "vers": "ministre", "ecran": "visio-appel", "params": { "vers": ["scene"], "sonnerie": true } },
    { "vers": "public",   "ecran": "regardez" },
    { "vers": "figurants","ecran": "figurants.cmd", "params": { "densite": "silence" } }
  ] }
```
Sortie vers `b6_pause` : `g: [{k:'sig:ministre.raccroche', op:'≥', v:1}]`, sinon top. Le serveur relaie la signalisation
WebRTC par `rtc` (existant, `SalleProjet.ts:425`) entre les sessions des acteurs `franck`, `ministre`, `scene` ; le réglage
« son de Franck coupé » (`visio.js:88-94`) devient un paramètre d'envoi, donc visible dans le Conducteur (réponse à C5).

Toute la version SIMPLE d'Écho (7 blocs, 14 étapes) se réécrit ainsi : `tel.cmd mode:'video'` → envoi `public/video` ;
`ecran mode:'qr'` → envoi `scene/accueil-qr` ; `junon lancer` → envoi `scene/mur {audio:'junon_discours.mp3',
commentaires:'junon'}` + `figurants.cmd {segment:'junon'}` ; `junon president` → envoi `scene/mur {audio:'president_boilot_speech.mp3'}`
+ `public/image-onde`. Les médias passent par R2 (`/api/projets/:id/medias/…`, `Range` géré) ou en local sur la sortie
(`sortie/medias.ts`), au choix de l'envoi (`params.asset` + `local: true`).

### 4.5 Ce qu'on garde, retire, déplace

| | Élément | Preuve de la décision |
|---|---|---|
| **Garder** | `packages/modele` entier (lecteur, blocs, salle simulée, planification, validation) | pur, testé, déjà prêt pour `signal`/`commandes` |
| Garder | `apps/serveur` : DO, D1, R2, `cseq`/`ack`, instantané, `rtc`, exécutions | C9 |
| Garder | Sortie : `Scene`, `scenes.tsx`, médias locaux, préchargement, calque de réactions, `fin-video` | 7 189 lignes testées (`bascule*.test.ts`, `traduction.test.ts`) |
| Garder | Thème, planche, conduite, pupitre, collab | hors périmètre du problème |
| Garder | Orchestrateur figurants, modération, banques, Whisper (`asr-flux.mjs`) | logique métier précieuse ; devient un agent |
| **Retirer** | `pont-figurants.ts`, `main.tsx:6-9` | C2 |
| Retirer | Scène `page` (iframe) : `protocole.ts:39,57`, `scenes.tsx:133-135`, `traduction.ts:116` | C4 |
| Retirer | `params.cmds`, `params.sortie` en objet `page`, `SERVEUR` codé en dur (`generer-echo-simple.ts:66-72`) | C4, C7 |
| Retirer | `Jeu` comme serveur (`jeu.mjs` : `tel`, `ecran`, `vote`, `_junon`, `_rtc`, `_ecran`, `_telCmd`), serveur statique `index.mjs:60-131` | remplacés par le DO et R2 |
| Retirer | Pages dupliquées : `pages/telephone`, `pages/chat`, `pages/flux`, `pages/ministre`, `pages/visio/*`, `pages/eco`, `pages/regie` (conduite l.554-580) | deviennent des écrans de l'app téléphone et de la sortie |
| Retirer | Arbitrage multi-régies de la sortie (`arbitrage.ts`) | une seule source : le serveur |
| **Déplacer** | Le mur (`pages/chat` + `chatvue.js`) → scène `mur` de la sortie (chat, vote en grand, pops « @x a voté », audio de salle) | C4 |
| Déplacer | `pages/echo` (phrases, émojis, vote, flux vidéo, choix + pourquoi, notification) → écrans de l'app téléphone, acteur `public` | C7 |
| Déplacer | `pages/ministre`, `pages/visio/franck|ministre`, `pages/eco` → écrans d'acteurs nommés dans la même app téléphone (adresse `…/t/<acteur>?jeton=`) | C7, C8 |
| Déplacer | `pages/visio/scene.html` → scène `visio` de la sortie, sur le `rtc` de la salle, émetteur `streamer/emetteur.ts` réutilisé | C11 |
| Déplacer | `banques/echo/votes.json` → `envois[].params.scores` du projet ; `propositions.json` → `envois` écran `phrases` ; `junon-commentaires.json` → asset texte du projet | C7 |
| Déplacer | `pages/regie` (figurants : densité, humeur, souffleur, validation, machines) → panneau « Agents » du pupitre du Conducteur | C5, C12 |
| Déplacer | `pages/comedien` (micro → Whisper) → écran `prompteur` de l'acteur comédien, audio vers l'agent `asr` | C12 |

### 4.6 Chemin de migration par lots (pour rejouer Écho sans régression)

Ordre : **L0 → L1 → L2 → L3 → L4 → L7** donne un Écho jouable sur le nouveau serveur (les agents restent pilotés à la main
comme le 27/10 si L6 n'est pas fait). L5 (planche) peut suivre : tant qu'il n'est pas fait, le générateur
`generer-echo-simple.ts` écrit les `envois` (c'est déjà ce qu'il fait avec `cmds`). L6 et L8 ferment.

Garde-fou de non-régression : le fichier `echo.conducteur.json` régénéré doit passer `validerProjet` à 0 erreur et
`simuler()` jusqu'au bout (déjà le cas : LISEZMOI §intro) ; le nouveau test bout en bout (L7) rejoue les 14 tops avec 50 bots
et vérifie la `vue` de chaque acteur à chaque étape.

## 5. Lots de travail proposés

| Lot | Objectif | Fichiers concernés | Taille | Dépend de | Exécutant conseillé |
|---|---|---|---|---|---|
| **L0** | Décider et **déployer** `apps/serveur` sur un domaine fixe : compte Cloudflare, D1/R2, `JETON_ADMIN`, `ORIGINES_AUTORISEES` (GitHub Pages + domaine), `workers_dev` ou domaine ; relais `scene` gardé en SQLite en attendant L2 ; procédure de gel le jour J (D7) | `apps/serveur/wrangler.jsonc`, `README.md`, `SalleProjet.ts:308` | S (4 h + le propriétaire) | décision Q1 | **Claude (Opus/Fable)** + propriétaire (jamais sans lui) |
| **L1** | Noyau « acteurs » dans le modèle : types `Acteur`, `Envoi`, `vueActeur()` pure (héritage par parcours, `tenir`, `quand`), signaux `acteur.signal` → `Signaux`/`signal()`, validation, tests ; générateur Écho réécrit en `envois` | `packages/modele/src/types.ts`, nouveau `acteurs.ts`, `valider.ts`, `conditions.ts`, `projets/echo/generer-echo-simple.ts` | M (16 h) | — | **Sonnet 5.5** (brief et relecture Claude) ; tests → Qwen local |
| **L2** | Le DO héberge la représentation : `run`, lecteur en mode scène (alarme 1 Hz + réévaluation sur entrée), rôles `acteur`/`agent`, `vue{vseq}` + instantané, `in{cseq}` → état de salle → `Signaux`, routage des `commandes` → `agent.cmd` + accusés, `conduite` régie, journal unique dans `runs/evenements` ; adaptateur Node du même noyau pour `vitest` et bots | `apps/serveur/src/salle/SalleProjet.ts`, nouveau `src/salle/Representation.ts`, `src/logique/protocole.ts`, `PROTOCOLE.md`, tests | L (40 h) | L1 | **Claude (Opus/Fable)** pour le découpage et le protocole, Sonnet 5.5 pour le code, Qwen pour les tests |
| **L3** | App téléphone `apps/telephone` (Vite, sans framework ou Preact, thème `packages/theme`) : client du protocole (hello/vue/in/fx, reprise, horloge), écrans du public repris de `pages/echo` (phrases, émojis, vote, vidéo préchargée, choix + pourquoi, notification, couleur, noir, regardez) et écrans nommés (`prompteur`, `vote-compteur`, `visio-appel`, `veille`) ; adresse par acteur ; servie par le Worker | nouveau `apps/telephone/`, reprise de `pages/echo/*`, `pages/ministre/*`, `pages/eco/*`, `pages/visio/*` | L (32 h) | L2 (protocole) ; peut démarrer sur une maquette du protocole dès L1 | **Sonnet 5.5** (écrans en volume → Haiku 5.5 par écran, brief par écran) |
| **L4** | Sortie : acteur `scene` client du serveur (vue au lieu de `scene` arbitrée, local BroadcastChannel en secours), scènes `mur` (chat + vote en grand + pops + audio de salle, repris de `pages/chat`), `visio` (sur `rtc` de la salle, `emetteur.ts`), `flux-video` ; suppression de `page` | `apps/conducteur/src/sortie/{protocole,relais,traduction,scenes,page,arbitrage}.ts(x)`, `src/flux`, `src/streamer/emetteur.ts` | M (24 h) | L2 | **Sonnet 5.5** ; retrait de `page`/arbitrage et tests → Qwen local |
| **L5** | Conducteur : bande des acteurs sur la planche, liens étape→acteur (envois) et acteur→sortie (conditions), inspecteur « Envois / Attend », pistes acteurs dans la conduite, mode scène = régie connectée (`conduite{op}`, lecteur miroir), panneau Agents au pupitre, retrait du pont | `apps/conducteur/src/planche/*`, `coquille/Panneau*`, `conduite/*`, `etat/{magasin,moteur,serveur,regie}.ts`, `coquille/pont-figurants.ts` (suppr.), `main.tsx` | L (40 h) | L1, L2 | **Claude (Opus/Fable)** pour l'interaction planche/inspecteur (décision produit), Sonnet 5.5 pour le reste |
| **L6** | Agents : service figurants = client `agent` (hello agent, `agent.cmd` ← `figurants.cmd`, `agent.in say` → filtre serveur, `agent.stat`), enveloppe ElevenLabs (agent conversationnel piloté : appel, question n, fin), Whisper = agent `asr` ; plan B `banque` piloté par commande | `prototypes/figurants/serveur/{index,jeu}.mjs` (réduits à l'orchestrateur + client), nouveau `services/agents/{figurants,elevenlabs,asr}` | M (24 h) | L2 | **Sonnet 5.5** (ElevenLabs : Claude relit l'API et les secrets) ; Qwen pour `asr` |
| **L7** | Répétition bout en bout : Écho régénéré, test `vitest` qui rejoue les 14 tops avec 50 bots contre `wrangler dev` et vérifie la `vue` de chaque acteur ; essai sur 3 vrais téléphones ; fiche de lancement du soir (une adresse, un jeton par rôle) | `projets/echo/*`, `apps/serveur/tests/*`, `docs/` | M (12 h) | L0–L4 | **Qwen local** (tests, bots), **Claude** pour l'essai réel et la fiche |
| **L8** | Nettoyage : suppression des pages prototypes dupliquées et de `jeu.mjs` serveur, un seul `PROTOCOLE.md` (dans `apps/serveur`), `docs/07` et `docs/etudes/serveur-temps-reel.md` mis à jour, README | `prototypes/figurants/pages/*`, `PROTOCOLE.md` ×2, `docs/07-architecture-technique.md` | S (6 h) | L6, L7 | **Qwen local** |

Total indicatif : **≈ 200 h** de développement, dont ≈ 60 h à garder pour Claude (L0, L2 découpage, L5 interaction, relectures).
Coût API estimé si L1/L3/L4/L6 passent par Sonnet 5.5 en tâches d'agent : 15 à 30 tâches × 0,3–1 $.

## 6. Questions au propriétaire

1. **Hébergement (bloque L0)** : acceptez-vous de déployer `apps/serveur` sur votre compte Cloudflare (plan Workers Paid,
   5 $/mois) avec un domaine fixe (`*.workers.dev` suffit-il, ou un domaine à vous pour le QR) ? Sinon, quelle machine
   publique stable (VPS) pour l'adaptateur Node ?
2. **Réseau de salle** : au prochain spectacle, le public sera-t-il en 4G comme le 27/10, ou disposerez-vous d'un Wi-Fi
   installé par vous ? (Si Wi-Fi local garanti, l'adaptateur Node en salle devient une vraie option de secours à prévoir en L2.)
3. **Lecteur en scène sur le serveur** : confirmez-vous que la régie accepte que le temps « officiel » soit celui du serveur
   (1 Hz) et que son écran soit un miroir ? L'alternative (lecteur dans le navigateur, comme aujourd'hui) garde le risque C3.
4. **ÉCO / ElevenLabs** : voulez-vous que l'appel soit piloté par le spectacle (agent conversationnel déclenché par une
   étape, question injectée, fin détectée — L6) ou que Franck continue à lancer l'appel lui-même avec un simple prompteur ?
5. **Vote truqué** : les scores et phrases de résultat doivent-ils vivre dans le projet (visibles dans l'inspecteur, versionnés
   avec lui — proposition) ou rester dans une banque à part relue à chaud ?
6. **Visio** : garder le pair-à-pair relayé par le serveur (deux téléphones + sortie, ce qui a marché le 27/10) ou passer à un
   SFU (LiveKit / Cloudflare Realtime) pour fiabiliser le son sur la sono ? (Le p2p est gardé par défaut en L4.)
7. **Planche** : la bande des acteurs doit-elle être visible en permanence (même pour un spectacle sans téléphone), ou
   apparaître seulement quand le projet déclare des acteurs ? Les acteurs doivent-ils être des nœuds déplaçables ou une colonne fixe ?
8. **Mode par défaut d'Écho** : garder « un top par étape, sans garde » (ce qui a été joué) comme déroulé officiel, et ajouter
   les règles automatiques (quorum 90 %, fin de vidéo) seulement en option armable par la régie ?
9. **Journal et données du public** : un seul journal de représentation sur le serveur (pseudos, textes, votes) — durée de
   conservation et effacement après le spectacle (LISEZMOI §5.9) ?
10. **Date du prochain spectacle** : elle fixe ce qu'on garde de L5/L6 avant la première représentation sur la nouvelle
    architecture, et si l'on joue une fois encore avec le prototype (L0 seul + tunnel) en attendant.
