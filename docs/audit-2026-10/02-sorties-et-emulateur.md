# Chantier 2 — Sorties et retours, émulateur de téléphones

Audit d'architecture du 28/10/2026, branche `audit/2026-10`. Périmètre : (A) adresser facilement chaque sortie depuis le
Conducteur (écran scène, téléphones du public, téléphones des comédiens, visio) et voir dans l'interface ce que chacune
affiche vraiment ; (B) un émulateur de téléphones dans le Conducteur, qui rend le vrai écran du téléphone, pour répéter
et tester sans vrais téléphones. Le modèle de données des nœuds « acteurs » revient au chantier 1 ; ce rapport traite de
l'ergonomie, du protocole de retour et de l'émulateur.

## 1. Résumé

1. Le 27/10, quatre canaux d'adressage cohabitaient sans se connaître : `params.sortie` (sortie Écran scène, par
   BroadcastChannel ou la salle du serveur), `params.cmds` (pont WebSocket vers le serveur figurants, envoyé au seul
   changement de moment), les `commandes` émises par les blocs du moteur (journalisées, jamais envoyées), et les boutons
   de `pages/regie` (une deuxième conduite écrite à la main, qui recopie la première).
2. Le mur, la visio et le flux Insta ont été projetés par une scène `page` (iframe vers le tunnel). Elle se recharge à
   chaque retour, la vignette de la régie la montre noire, la sortie ne dit pas si elle a chargé, et on ne peut rien y
   régler (le son de Franck se coupe par un bouton à l'intérieur de l'iframe).
3. Le Conducteur n'avait **aucun retour** des téléphones : pas de nombre de connectés, pas d'écran effectivement affiché,
   pas de votes. Le moteur lit **toujours la salle simulée**, même en mode Scène (`magasin.ts:232`).
4. Proposition : un **rail des sorties** (une vignette vivante par acteur), une section « Sorties de l'étape » dans
   l'inspecteur, un seul vocabulaire de commandes, et un protocole de retour commun (`etat` + `ack`) qui sert aussi au
   journal d'après-spectacle et aux vrais signaux du moteur.
5. Émulateur : faire de l'app téléphone **un seul bundle** dont le transport s'échange (WebSocket réel ou salle en
   mémoire). On en montre jusqu'à environ 12 en iframes réelles, et des centaines d'agents sans rendu pilotés par la même
   machine d'état, avec des profils tirés des rotatifs de `salle.ts`. C'est le même moteur qui sert aux tests vitest.

## 2. Constats

### C1 — Quatre canaux d'adressage parallèles, aucun ne voit les autres · **P0**
- **Écran scène** : `params.sortie` de l'étape, traduit par `traduction.ts:103-118` (chaîne ou objet `Scene`), publié par
  `relais.ts:198-205` sur le canal local (`canal.ts:21-34`, BroadcastChannel `studio-real-sortie`) et, si la coquille est
  dans une salle, par le message `scene` de la salle (`salle.ts:127-130`, `useRelaisSortie.ts:62-74`).
- **Téléphones, mur, vote, audio** : `params.cmds` de la **première étape** du moment, envoyés par
  `pont-figurants.ts:31-40` **seulement quand le moment change** (`if (!m || m === dernier) return`). Une commande posée
  sur une deuxième étape, ou un retour en arrière dans le même moment, ne part jamais.
- **Blocs du moteur** (`c:message`, `x:figurants`, `s:machine`) : leurs `commandes` sont seulement relevées pour le
  journal de régie (`magasin.ts:176`, `regie.ts:173-189`). Aucun envoi de `figurants.cmd` n'existe dans
  `apps/conducteur/src`. Un bloc « message à une personne » posé sur la planche ne fait donc **rien** en représentation.
- **Régie figurants** : `pages/regie/regie.js:555-567` recode la conduite d'Écho (« CONDUITE ÉCHO », 16 taps), en double
  de `generer-echo-simple.ts:23-58`. Les deux pouvaient diverger. Le 27/10, les deux régies ont envoyé des commandes
  (47 `hello` de rôle `regie` dans le journal du serveur).
- Impact le 27/10 : la régie devait savoir quel outil pilotait quoi (le champ `outil` de chaque étape le rappelle :
  « régie : tap 5 · notification + écran noir · page eco de Franck », `generer-echo-simple.ts:41-42`).

### C2 — La scène `page` (iframe) : rechargée, aveugle, impossible à régler · **P0**
- Ajoutée à la hâte dans `72b32bc` (`protocole.ts:57`, `scenes.tsx:133-135`). La visio, le mur et le flux Insta passent
  par elle avec une adresse de tunnel **codée en dur** (`generer-echo-simple.ts:66-71`).
- **Rechargement** : `Fondus` démonte la couche précédente (`scenes.tsx:112-118`). Chaque retour au mur après un noir
  (b4 → b5, b6 → b7) recharge l'iframe : nouveau WebSocket `chat`, historique réduit aux 30 derniers messages
  (`jeu.mjs:387`), son à réautoriser (`chat.js:35`, bandeau « Cliquer ici pour autoriser le son du mur »), visio
  renégociée de zéro. Le journal du 27/10 compte 22 `hello` de rôle `chat` et 17 de rôle `visio`.
- **Pas de retour** : la sortie n'envoie que le **type** de scène (`page.tsx:114-117`, `present.scene`). Ni l'URL, ni
  « chargée / en erreur », ni l'état du WebSocket interne. Dans la vignette de la régie, une page s'affiche en **noir**
  (`scenes.tsx:133-134`, `miniature ? <div className="so-noir" />`).
- **Pas de réglage** : le son de Franck se coupe par un bouton à l'intérieur de la page visio (`visio/scene.html:19`).
  Il est inatteignable depuis le Conducteur, et le curseur est caché sur la sortie. D'où « visio réglable nulle part dans
  l'interface ».
- **Médias** : le flux Insta de l'écran scène (`pages/flux/index.html:15`) est lu **depuis le tunnel**, servi en
  `cache-control: no-cache` (`serveur/index.mjs:113`). La sortie possède pourtant une réserve de vidéos locales
  préchargées faite pour ça (`videos.ts:1-3`, `medias.ts:1-8`), qu'une scène `video` aurait utilisée. D'où « vidéos très
  lentes à démarrer » côté sortie.

### C3 — Fenêtre de sortie en cache et changement de protocole silencieux · **P0**
- `68590f1` ajoute `?v=Date.now()` (`fenetre.ts:11`). Mais si une fenêtre `studio-real-sortie-scene` existe déjà, elle
  est **reprise sans rechargement** (`fenetre.ts:38-42`). Une sortie ouverte avant la publication garde donc l'ancien
  code.
- `72b32bc` ajoute le type `page` sans changer `VERSION_SORTIE` (toujours `1`, `protocole.ts:30`). Une sortie
  d'ancienne version **rejette en silence** une scène `page` (`lireMessageRegie` → `null`, `protocole.ts:296-299` ;
  `page.tsx:167-168` `if (!m) return;`) et garde l'écran précédent. C'est l'explication la plus probable de « mire au lieu
  de la scène ». Rien ne prévient la régie : son aperçu montre la scène **publiée** (`ApercuSortie.tsx:14`, `scene`), pas
  la scène **vue** (`sceneVue`, que `relais.ts:143-146` reçoit mais que rien ne compare).

### C4 — Téléphones du public adressés « à l'aveugle » · **P0**
- `tel.cmd` diffuse un **mode global** à tous les téléphones (`jeu.mjs:201-210`). Chaque téléphone en déduit son écran
  avec un état local en mémoire (`echo.js:144-158` : `etapeChoix`, `monChoix`, perdus au rechargement). Le serveur ne
  sait pas quel écran chaque téléphone affiche vraiment : celui-ci passe seul au choix à la fin de la vidéo
  (`echo.js:170`).
- La vidéo du fil est servie par le tunnel en `no-cache` et ne se précharge qu'à la réception du premier `tel`
  (`echo.js:149`, `jeu.mjs:194`). Le serveur ne reçoit aucun « prêt ».
- Pas de ciblage : impossible d'envoyer un écran à « ceux qui n'ont pas voté » ou à un seul téléphone (les rôles
  existent dans `docs/01-vision-et-roles.md`, ils n'ont pas été construits).

### C5 — Les téléphones des comédiens n'ont pas d'identité d'acteur · **P1**
- Les rôles du serveur sont des **types d'écran** (`jeu.mjs:10` : `chat`, `regie`, `comedien`, `telephone`, `ministre`,
  `visio`), pas des personnes. Le prompteur de Franck (`pages/eco`) se connecte comme `ministre` (`eco.js:31`) pour
  recevoir les votes. Les questions sont recopiées en dur dans `eco.js:4-10`, en double de `votes.json`.
- La visio a sa propre signalisation WebRTC dans le serveur figurants (`jeu.mjs:234-248`, `visio.js`). Elle n'utilise
  que du STUN, sans TURN (`visio.js:11`), et ne donne ni statistiques ni reprise. Or le Conducteur possède déjà une pile
  WebRTC complète : canaux multiples (`flux/protocole.ts:16`), statistiques et latence (`flux/stats.ts`), consignes
  privées avec accusé de lecture (`flux/protocole.ts:13-14`), reprise iOS (`streamer/emetteur.ts:1-9`). Elle n'a pas
  servi.

### C6 — Aucun retour des sorties dans le Conducteur · **P0**
- Le pont n'écoute rien : il n'a pas de `onmessage` (`pont-figurants.ts:22-27`). Ses seuls retours sont deux toasts
  (`signaler`, lignes 24 et 38).
- Ce que la régie figurants voyait (`regie.js:69-77`) : le mode **demandé** aux téléphones (`telEtat`), pas celui qui
  était affiché ; les compteurs abonne / désabonne (`choix.stat`) ; les votes réels et truqués (`regie.js:526-540`) ;
  le journal texte. **Nulle part un nombre de téléphones connectés** : `pseudosHumains()` (`jeu.mjs:72`) ne sert qu'aux
  figurants.
- Côté Conducteur : la pastille de la sortie (fermée / ouverte / connectée, `BoutonSortieScene.tsx`), une vidéo absente,
  « autre régie ». La vignette (`Panneau.tsx:414`) montre la scène publiée.
- Le moteur, même en mode Scène, avance avec `signauxSalle(projet.sens, …)` (`magasin.ts:232` et `336`) : présents,
  quorum, prêts et votes sont **toujours simulés**. Une condition « quorum ≥ 90 % » se serait jouée sur une salle fictive.

### C7 — Latence : mesurée par endroits, nulle part affichée pour les téléphones · **P1**
- `commun/ws.js:92-106` calcule le décalage d'horloge et l'aller-retour de chaque page, mais ne les renvoie pas au
  serveur. `fig.stat` ne mesure que la chaîne des figurants (`jeu.mjs:323-332`). La sortie a son horloge
  (`horloge.ts`), le flux du streamer a ses statistiques : trois mesures séparées, aucune vue d'ensemble.

### C8 — Journal d'après-spectacle incomplet · **P1**
- Le journal JSONL du serveur (`serveur/journaux/2026-10-27.jsonl`, ignoré par git) contient les envois de la régie
  (`tel_cmd` ×80, `vote_cmd` ×129) et les votes réels (`vote_reel` ×39). En revanche, il ne contient ni les
  **déconnexions** (`retirer`, `jeu.mjs:47`, n'écrit rien), ni l'écran affiché, ni les latences par téléphone, ni ce
  que montrait l'écran scène. On y compte aussi **17 `demarrage`** du serveur le 27/10.
- Le Conducteur garde des `executions` (`magasin.ts:195-213`) locales au navigateur, sans lien avec le journal du
  serveur. Rejouer une soirée est impossible.

### C9 — Trois publics simulés, aucun téléphone émulé · **P1**
- `packages/modele/src/salle.ts:4-10` : des courbes agrégées (présents, quorum, prêts, bruit, assis, votes A/B/C), sans
  aucun individu.
- `blocs/simulation.ts` : une autre salle fictive pour les aperçus des blocs (142 places, ses propres formules).
- `sortie/calque/public-factice.ts` : un troisième faux public, pour les pops du calque.
- Les aperçus des blocs dessinent un **faux** téléphone sur canvas 216 × 92 (`dessin.ts:71`, `apercus.ts:257,284,323`),
  pas le vrai écran. L'étude `catalogue-noeuds-visuels.md:222` demandait pourtant un « mini-téléphone : vrai rendu de
  l'app joueur ».
- La doc prévoyait les bots à profils et les aperçus de rôle (`docs/05-regie-et-studio.md:24,33,63-67`). Rien n'existe.
  Le 27/10, tout s'est testé sur de vrais téléphones à travers le tunnel (64 `hello` de rôle `telephone`).

### C10 — Briques réutilisables déjà présentes (à garder) · info
- Transports interchangeables et testables en mémoire : `Transport`, `paireMemoire()` (`canal.ts:7-48`).
- Arbitrage multi-régies et filtre des doublons (`arbitrage.ts`), battement `present` (`page.tsx:114-117`), signal de fin
  de vidéo vers le moteur (`useRelaisSortie.ts:55-58`).
- Page de démarrage avec un lien par rôle, jeton dans le fragment (`streamer/page-accueil.ts`, `streamer/config.ts:5`) :
  c'est l'embryon des « liens d'acteurs ».
- `simuler()` accepte des `signaux` et des `evenements` extérieurs (`lecteur.ts:620-646`) : c'est le point d'entrée des
  tests émulés.
- `?ws=hote:port` dans `commun/ws.js:63` permet de pointer une page vers un autre serveur.
- Banc d'essai des capacités (`prototypes/banc-essai/tests.js` : vibration, son, plein écran, wake lock, etc.), qui peut
  nourrir les profils de capacités.
- Banc de bout en bout dans un vrai navigateur (Edge sans tête via CDP, `sortie/bascule.edge.test.ts:1-13`).

## 3. Risques (si rien ne change avant le prochain spectacle)

- **Sortie bloquée sur une ancienne version** (C3) : un ajout au protocole est rejeté sans un mot, et l'écran scène
  reste sur la mauvaise scène pendant que la régie croit le contraire.
- **Commandes perdues** : un `cmds` posé hors de la première étape, un retour en arrière, ou un pont non relié (simple
  toast, `pont-figurants.ts:38`), et les téléphones restent sur l'écran précédent sans que personne le voie.
- **Condition de passage jouée sur une salle fictive** (C6) : dès qu'une étape attendra un vrai quorum, elle passera
  (ou bloquera) selon les rotatifs de la salle simulée, pas selon le public.
- **Visio** : en 4G sans TURN, la liaison peut ne jamais s'établir, et la scène se recharge à chaque affichage.
- **Mur** : son bloqué après un rechargement d'iframe, historique tronqué.
- **Répétitions** : sans émulateur, chaque essai mobilise de vrais téléphones et le tunnel. Les régressions sur les
  écrans du public ne se voient qu'en salle.
- **Analyse** : impossible de répondre après coup à « combien de téléphones ont vu la question 3, en combien de temps ».

## 4. Proposition cible

### 4.1 Vocabulaire : acteurs, écrans, commandes, retours

```
                          ┌──────────────────────── Conducteur (régie) ─────────────────────────┐
  planche / conduite  →   │ étape.params.sorties = { [acteur]: Commande }   (modèle : chantier 1)  │
                          │        │                                                            │
                          │  Aiguilleur des sorties (un seul module)                            │
                          │   ├─ écran scène   → transport sortie (canal local + salle)          │
                          │   ├─ public        → serveur de spectacle  (diffusion / cible)       │
                          │   ├─ franck, ministre (téléphones d'acteur) → serveur de spectacle    │
                          │   └─ émulateur      → salle en mémoire (même protocole)              │
                          │        ▲                                                            │
                          │  Retours : etat (battement) + ack (par commande) + entrées            │
                          │   → magasin `useSorties` → rail, inspecteur, moteur (Signaux), journal │
                          └─────────────────────────────────────────────────────────────────────┘
```

- **Acteur** : une destination nommée et durable du spectacle. Exemples : `ecran-scene`, `public`, `franck`, `ministre`,
  `sono`. Chaque acteur a un **genre** (écran 16:9, téléphone du public, téléphone d'acteur, machine) qui fixe ce qu'on
  peut lui envoyer. La visio n'est pas un acteur : c'est une **scène** de l'écran scène (deux flux) plus un écran sur
  deux téléphones d'acteur.
- **Commande** : un seul format pour toutes les destinations :
  `{ ecran?: { type, ...params }, effet?: {...}, media?: {...}, consigne?: {...}, reglage?: {...}, cible?: Cible }`.
  Exemples : écran scène `{ ecran: { type: 'mur' } }` ; public `{ ecran: { type: 'vote', question: 3 }, cible: 'tous' }` ;
  franck `{ ecran: { type: 'prompteur', question: 3 } }`.
- **Cible** pour le public : `tous` · `groupe:<nom>` · `sans-reponse` · `selection:[ids]` · `joueur:<id>`.
- Les commandes partent **à l'entrée de chaque étape**, pas seulement à chaque moment. Elles sont **rejouées** à la
  reconnexion d'un acteur : l'état voulu de chaque acteur est gardé, ce n'est pas un flux d'ordres.
- `params.sortie`, `params.cmds` et les `commandes` des blocs `c:message` / `x:figurants` convergent vers ce format,
  avec un convertisseur pour les projets existants (Écho simple).

### 4.2 Ergonomie : choisir une sortie, lui envoyer, la voir

**a) Le rail des sorties** (bandeau fixe sous l'en-tête, repliable ; en mode Scène, toujours visible)

```
┌ ÉCRAN SCÈNE ───────┐┌ PUBLIC · 124 ──────┐┌ FRANCK ───────────┐┌ MINISTRE ─────────┐
│ [vignette 16:9    ]││ [mini-tél. réel  ] ││ [mini-tél. réel ] ││ [mini-tél. réel ] │
│ mur · v3 · ● 38 ms ││ vote Q3 · 118/124  ││ prompteur Q3     ││ visio · caméra ✓  │
│ ⚠ son bloqué        ││ 97 votes · p95 0,4s││ ● 52 ms · lu ✓    ││ ● 71 ms · 720p    │
└────────────────────┘└────────────────────┘└───────────────────┘└───────────────────┘
```

- La pastille dit la liaison (vert < 1 s, ambre en attente, rouge perdue). Dessous : ce qui est **effectivement
  affiché** (pas ce qui a été demandé), la latence et les alertes.
- **Écart demandé / affiché** : si un acteur n'a pas accusé la commande au bout de 2 s, la vignette passe en ambre et
  montre les deux (« demandé : vote Q3 · affiché : noir ») ; rouge à 5 s.
- Un clic ouvre le détail dans l'inspecteur. Un clic droit propose : tenir / rendre à la lecture, renvoyer, copier le
  lien ou le QR de l'acteur, ouvrir la fenêtre (écran scène).
- Pour le public, la vignette montre l'écran **majoritaire** et une barre empilée des écrans affichés (« 118 vote Q3 ·
  4 noir · 2 hors ligne »).

**b) L'inspecteur d'une étape : section « SORTIES DE L'ÉTAPE »**
- Une ligne par acteur du projet, avec une puce d'état : *hérite* (grisé, ce que l'acteur montrera puisqu'il garde
  l'écran précédent), *change* (en couleur), *inchangé*.
- Choisir un écran = un menu des écrans possibles **pour ce genre d'acteur** (pas de champ JSON libre). Les réglages se
  remplissent dans un formulaire (question, options, durée, son on/off, cadrage).
- **Aperçu en direct** à droite de chaque ligne : le vrai rendu de l'écran (§4.4), avec les vrais textes. Une bascule
  « avant / après » montre l'écran hérité.
- Bouton **Tester** : envoie la commande au téléphone témoin, à l'émulateur, ou à la sortie en mode préparation. Jamais
  au public en mode Scène.
- Visio et écran scène : les **réglages de direct** (son de Franck, son de la ministre, disposition côte à côte ou
  incrustée, recadrage) se trouvent ici et dans la vignette, et passent par une commande `reglage` sans changer de
  scène. Cela supprime le bouton caché dans l'iframe.

**c) La conduite : une piste par acteur**
- La piste « écran scène » existe déjà (piste vidéo). On en ajoute une par acteur : des pavés colorés par type d'écran
  (vote, mur, noir, prompteur) le long du temps prévu. Pendant la lecture, le pavé courant se teinte selon le taux
  d'accusés (vert ≥ 95 %, ambre, rouge).
- Sur la planche, le nœud « acteur » du chantier 1 porte la même vignette que le rail (même composant, autre taille).

**d) Liens d'acteurs** (généralisation de `streamer/page-accueil.ts`)
- La page « Acteurs » liste chaque acteur avec son lien (jeton dans le fragment `#`, jamais dans `?`), son QR, et
  « connecté depuis 12 min, iPhone, 82 % batterie ». Le QR du public reste celui de la sortie.
- Un téléphone d'acteur s'annonce par son **identité** (`acteur: 'franck'`), pas par un type d'écran détourné (C5).

**e) La scène `page` devient l'exception**
- Le mur, le vote et la visio deviennent des **scènes natives** de la sortie. Le mur s'appuie sur le calque, qui sait
  déjà afficher pops et commentaires vedettes. La visio utilise `src/flux` avec deux canaux. Le flux Insta passe par
  `video` avec un média local.
- `page` reste une issue de secours : badge « page externe » dans la vignette, adresse et état de chargement dans le
  battement, iframe **gardée montée** quand on revient à la même URL, avertissement à la validation du projet.

### 4.3 Le retour : quoi, où, comment on le garde

**Protocole de retour commun** (tous les acteurs ; l'écran scène l'étend à partir de `present`) :

```ts
// À ajouter au protocole commun (noms à faire valider par le chantier 1)
type RetourActeur =
  | { t: 'bonjour'; v: number; acteur: string; session: string; app: { version: string; build: string }; capacites: Capacites }
  | { t: 'etat'; acteur: string; session: string; heure: number;          // battement : 1 / s (écran), 1 / 5 s (téléphone)
      ecran: { cle: string; n: number; depuis: number } | null;           // ce qui est AFFICHÉ (clé de la commande appliquée)
      visible: boolean; enLigne: boolean; rttMs?: number; decalageMs?: number;
      media?: { asset: string; pret: number; lecture: 'attente' | 'lit' | 'fin' | 'bloque' | 'absent' }[];
      batterie?: number; erreurs?: string[] }
  | { t: 'ack'; acteur: string; session: string; n: number; affiche: number; refus?: 'version' | 'invalide' | 'capacite' }
  | { t: 'entree'; acteur: string; session: string; cseq: number; type: 'vote' | 'texte' | 'toucher' | 'pret' | 'fin-video';
      valeur: unknown; heure: number };
```

- **Version** : `bonjour.app.version`, comparée à celle de la régie. Si elles diffèrent, la vignette affiche « sortie
  périmée, recharger », avec un bouton qui recharge la fenêtre (corrige C3). Un message refusé reçoit un
  `ack{refus:'version'}` au lieu d'un silence.
- **Latence** = `ack.affiche − envoi`, ramené à l'horloge du serveur (`decalageMs` déjà calculé par `ws.js`). Le serveur
  agrège par commande : p50, p95, part affichée à 1 s, 2 s, 5 s.
- **Agrégation pour le public** : le serveur de spectacle tient, pour chaque téléphone, `{ ecran, enLigne, dernierRtt,
  aVote }` et publie à la régie un **résumé** au plus 4 fois par seconde : `{ connectes, parEcran, votes, textes,
  latence, horsLigne }`. La liste détaillée (« Liste des joueurs » de `docs/05` §3) ne s'envoie qu'à la demande.
- **Moteur** : en mode Scène, `Signaux` vient de ce résumé (`pres = connectes`, `quorum = votes / connectes`,
  `prets = parEcran[écran courant] / connectes`, `votes`, `issue`). La salle simulée ne sert plus qu'en Préparer, ou
  s'il n'y a pas de serveur (`magasin.ts:232` et `336`, via une fonction `sourceSignaux()`). Les `entree` deviennent des
  `Lecteur.signal()` (`vote`, `texte`, `fin-video`), ce qui réunit `sig:` / `sigv:` et le quorum.

**Où ça s'affiche**
- Rail des sorties : l'état court, toujours visible (§4.2a).
- Panneau Régie (`Regie.tsx`) : une section « SORTIES » au-dessus des mémoires (par acteur : écran affiché, accusés,
  latence, médias prêts), et un **filtre** du journal par acteur.
- Pupitre de représentation (touche P) : les mêmes vignettes en grand, et la ligne « pour passer à la suite » nourrie
  par les vrais nombres (`Superpositions.tsx:152-166`).
- Alertes au bandeau (`AlerteSecurite`) : acteur perdu, sortie périmée, média absent, chute brutale des connectés
  (> 10 % en 10 s), écart demandé / affiché de plus de 5 s.

**Journal de représentation (après le spectacle)**
- Un fichier JSONL **par représentation**, écrit par le serveur de spectacle, avec un en-tête (projet, version, code de
  la représentation, horloge). Les événements, tous horodatés serveur et datés en `t` de lecture :
  `commande` (acteur, n, contenu), `ack`, `etat` (aux changements seulement), `connexion` / `deconnexion` (motif),
  `entree` (vote, texte), `lecture` (moment, étape, top), `alerte`.
- Les pseudos sont **pseudonymisés** dans le fichier d'analyse (identifiant de session), la table pseudo ↔ session est
  séparée et effaçable (LISEZMOI d'Écho §5.9).
- Outils : un résumé (`npm run bilan -- <fichier>` : courbe des connectés, latences par commande, taux de réponse par
  question) et un **rejeu** dans l'émulateur (§4.4) : on rejoue les entrées du public d'une vraie soirée contre une
  nouvelle version du projet.

### 4.4 L'émulateur de téléphones

**Principe : le vrai écran, pas une imitation**
1. L'app du public devient **un seul bundle** (`apps/telephone`, Vite, même thème) découpé en trois couches :
   - `ecrans/` : composants **purs** `({ etat, agir, capacites }) => vue`. On y transpose les écrans d'Écho : fil de
     phrases, vidéo plein écran, choix + pourquoi, vote, notification, « regardez la scène », merci.
   - `machine.ts` : une **machine d'état pure** (`etat = reduire(etat, messageServeur | action)`). Elle remplace l'état
     épars de `echo.js:144-158` et garde l'écran courant (clé et `n` de la commande) pour l'`ack`.
   - `transport.ts` : l'interface `TransportTelephone` avec deux implémentations, WebSocket (vrai serveur) et
     **mémoire** (salle émulée). Le mode se choisit dans l'adresse : `telephone.html#emule=1&id=t042`.
2. Les **téléphones d'acteurs** (prompteur de Franck, téléphone de la ministre, visio) sont d'autres écrans du même
   bundle. L'émulateur les rend aussi. Leur caméra est remplacée par la mire de `flux/mire.ts`.
3. **Deux niveaux de rendu**, la même machine d'état :
   - **Vitrine** : jusqu'à environ 12 téléphones rendus en **iframes réelles** (390 × 844 mis à l'échelle), même
     origine. C'est le vrai DOM, le vrai `<video>`, le vrai CSS. On peut toucher dedans à la main.
   - **Foule** : 10 à 500 **agents sans rendu**, qui exécutent `machine.ts` dans un Web Worker et le comportement de leur
     profil. Ils produisent de vrais messages (`entree`, `ack`, `etat`) et comptent dans tous les retours.
   - Un clic sur une pastille de la foule la **promeut** en vitrine (une iframe ouverte sur le même état).

**Salle émulée locale**
- `SalleEmulee` : une implémentation en mémoire du **protocole du serveur de spectacle**, qui reprend la logique de
  `jeu.mjs` (diffusion, `vueVote`, `tel`, choix, filtre). Le moteur choisi par les chantiers 1 et 3 en est la
  référence. Elle tourne dans le navigateur du Conducteur, ou sous Node pour les tests.
- Bouton « Brancher l'émulateur sur le vrai serveur local » : les agents ouvrent alors de vrais WebSocket (`?ws=`,
  `ws.js:63`). Cela sert d'essai de charge à 150 ou 300 téléphones avant une représentation.
- L'aiguilleur des sorties (§4.1) traite l'émulateur comme un transport de plus, donc **rien ne change** dans la
  conduite entre répétition émulée et représentation.

**Profils** (graine fixe, PRNG `mulberry32` déjà présent dans `public-factice.ts:5-12`)

| Profil | Réaction (médiane) | Répond | Réseau | Particularités |
|---|---|---|---|---|
| rapide | 1,5 s | 95 % | RTT 40 ms | — |
| lent | 8 s | 80 % | RTT 300 ms, 2 Mb/s | vidéo prête tard |
| distrait | 20 s | 40 % | normal | page cachée 30 % du temps (`visible:false`) |
| déconnecté | — | — | coupures de 5 à 60 s, 1 fois / 3 min | rechargement, file d'envoi rejouée |
| iPhone muet | 3 s | 85 % | normal | `vibration:false`, son bloqué sans geste, pas de plein écran |
| 4G salle pleine | 4 s | 85 % | RTT 600 ms, perte 3 % | latence des `ack` visible |

- **Population** tirée des rotatifs de `salle.ts` : les arrivées suivent la courbe `pres` (T = 40 + (100 − aff) · 2,2),
  les délais de réponse suivent `quorum` (T = 20 + (100 − part) · 1,2), les choix suivent `votesSalle(pen)`. La salle
  simulée et l'émulateur racontent donc la même histoire. En répétition émulée, `Signaux` est **compté** sur les agents
  au lieu d'être calculé par formule.
- Les capacités d'un profil peuvent être **importées d'un rapport du banc d'essai** (`prototypes/banc-essai`) fait sur
  un vrai téléphone.

**Panneau Émulateur** (onglet du panneau de droite et fenêtre détachable)
- Une ligne de commande : population (`120 · mélange « soirée »`), graine, vitesse ×1 / ×4, Démarrer / Arrêter /
  Remettre à zéro.
- Une grille de vitrine (les iframes) et un **nuage** de la foule (1 point = 1 téléphone, couleur = écran affiché,
  contour = a répondu). C'est le composant « Foule » de `catalogue-noeuds-visuels.md` §3.
- **Actions en masse** : « faire voter : A 60 % · B 30 % · C 10 % en 20 s », « 30 % écrivent une phrase de la banque »,
  « couper 10 % pendant 30 s », « recharger 5 téléphones », « tout le monde touche ‘son’ ».
- **À la main** : on touche dans une iframe de vitrine, ou on choisit un téléphone et on tape un texte.
- **Téléphone témoin** : épingler un téléphone émulé dans l'inspecteur. Il sert à l'aperçu en direct des étapes et au
  bouton Tester.
- Les vitrines portent un bandeau « ÉMULÉ ». En mode Scène, l'émulateur est **refusé** par défaut (voir Q7).

**API de l'émulateur** (proposition, `packages/emulateur/src/index.ts`)

```ts
import type { Signaux } from '@studio-real/modele';

export type GenreActeur = 'public' | 'acteur';            // téléphone du public · téléphone de comédien
export type Plateforme = 'ios' | 'android' | 'autre';

export interface Capacites {
  plateforme: Plateforme; vibration: boolean; sonSansGeste: boolean; pleinEcran: boolean; wakeLock: boolean; camera: boolean;
}

export interface ProfilSpectateur {
  nom: string;                                            // 'rapide' | 'lent' | 'distrait' | 'deconnecte' | 'iphone-muet' | …
  reaction: { medianeS: number; dispersion: number };      // loi log-normale du délai de réaction
  participation: number;                                  // 0 → 1 : probabilité de répondre à une sollicitation
  visibilite: number;                                     // 0 → 1 : part du temps où la page est visible
  coupures: { parMinute: number; dureeS: [min: number, max: number] };
  rechargementsParMinute: number;
  reseau: { rttMs: number; debitKbps: number; perte: number };
  capacites: Capacites;
  vote: 'penchant' | 'hasard' | Record<string, number>;   // 'penchant' = votesSalle(projet.sens)
  textes: 'banque' | 'aucun' | readonly string[];
}

export type Cible = 'tous' | 'sans-reponse' | `groupe:${string}` | `joueur:${string}` | { ids: string[] };

export interface EtatTelephone {
  id: string; pseudo: string; genre: GenreActeur; acteur?: string;   // acteur : 'franck', 'ministre'…
  enLigne: boolean; visible: boolean;
  ecran: { cle: string; n: number; type: string; depuis: number } | null;   // ce qui est AFFICHÉ
  dernierVote?: { question: string | number; option: string | number; t: number };
  fileEnvoi: number;                                     // messages en attente (hors ligne)
  rttMs?: number;
}

export interface TelephoneEmule {
  readonly id: string;
  readonly profil: ProfilSpectateur;
  etat(): EtatTelephone;
  /** actions « à la main » (mêmes effets qu'un doigt sur l'écran réel) */
  toucher(selecteur: string): void;
  voter(option: string | number): void;
  ecrire(texte: string): void;
  /** incidents */
  couper(dureeS?: number): void;
  recharger(): void;
  masquer(dureeS: number): void;
  /** rendu réel (vitrine) ; absent pour un agent de la foule */
  readonly iframe?: HTMLIFrameElement;
  promouvoir(hote: HTMLElement): HTMLIFrameElement;
}

export interface BilanSalle {
  connectes: number; horsLigne: number;
  parEcran: Record<string, number>;                      // clé d'écran affiché → nombre
  votes: Record<string, number>; textes: number;
  latenceAck: { p50: number; p95: number; partA1s: number; partA2s: number };
}

export type EvenementSalle =
  | { type: 'connexion' | 'deconnexion'; id: string; t: number }
  | { type: 'ack'; id: string; n: number; latenceMs: number; t: number }
  | { type: 'entree'; id: string; nature: 'vote' | 'texte' | 'toucher' | 'pret'; valeur: unknown; t: number };

export interface OptionsEmulateur {
  graine: number;
  population: { profil: ProfilSpectateur | string; nombre: number }[];
  acteurs?: { acteur: string; ecran: string }[];         // téléphones de comédiens émulés (franck, ministre)
  arrivees?: 'salle' | 'toutes' | { surS: number };      // 'salle' : courbe `pres` de packages/modele/src/salle.ts
  transport: 'memoire' | { url: string; jeton?: string }; // salle émulée locale, ou vrai serveur (essai de charge)
  rendu: { vitrineMax: number; hote?: HTMLElement } | 'aucun';   // 'aucun' : tests sous Node
  horloge?: { maintenant(): number; planifier(ms: number, fn: () => void): () => void };  // horloge accélérée (tests)
}

export interface Emulateur {
  demarrer(): Promise<void>;
  arreter(): Promise<void>;
  telephones(filtre?: Cible): TelephoneEmule[];
  ajouter(nombre: number, profil?: string): TelephoneEmule[];
  retirer(ids: readonly string[]): void;
  /** actions en masse */
  faireVoter(o: { repartition: Record<string, number>; dansS: number; part?: number; cible?: Cible }): void;
  faireEcrire(o: { textes: 'banque' | readonly string[]; parMinute: number; cible?: Cible }): void;
  coupure(o: { part: number; dureeS: number }): void;
  /** pour le moteur et l'interface */
  bilan(): BilanSalle;
  signaux(): Signaux;                                    // pres, quorum, prets, votes, issue comptés sur les agents
  surEvenement(fn: (e: EvenementSalle) => void): () => void;
  /** rejeu d'une vraie soirée : les entrées du journal de représentation, rejouées par des agents */
  rejouer(journal: AsyncIterable<unknown>, o?: { vitesse?: number }): Promise<void>;
  /** tests : avance l'horloge émulée et laisse tout s'exécuter */
  avancer(ms: number): Promise<void>;
}

export declare function creerEmulateur(o: OptionsEmulateur): Emulateur;
```

**Le même émulateur dans vitest**
- Sous Node : `rendu: 'aucun'`, `transport: 'memoire'`, horloge accélérée. On branche le moteur avec
  `simuler(projet, { signaux: () => emu.signaux(), evenements: (e, L) => aiguilleur.appliquer(e) })`
  (`lecteur.ts:620-646`). Exemple de test : « Écho simple, 120 spectateurs, Q3 : 95 % affichent le vote en moins de
  1 s, le quorum de 90 % est atteint avant 30 s, le passage `b5_q3_res` part sur le top ».
- Les écrans étant des composants purs, ils se testent par instantané (happy-dom, à ajouter en dépendance de test).
- En vrai navigateur, on réutilise le harnais Edge + CDP de `bascule.edge.test.ts` : le Conducteur et 6 vitrines, on
  vérifie la vignette « vote Q3 · 6/6 » et la sortie.
- Le rejeu des journaux (§4.3) donne des **tests de non-régression issus des vraies soirées**.

### 4.5 Ce qu'on ne fait pas
- Pas de rendu de 300 iframes (mémoire, CPU) : la foule n'a pas de DOM.
- Pas d'émulation fidèle de la vibration ou du son : un témoin visuel sur la vitrine (onde, pastille « bzz ») et le
  repli prévu du profil suffisent.
- Pas de téléphones émulés mêlés au public réel pendant une représentation (voir Q7).

## 5. Lots de travail proposés

| Lot | Objectif | Fichiers concernés | Taille | Dépend de | Exécutant conseillé |
|---|---|---|---|---|---|
| **L0** | **Correctifs avant la prochaine soirée** : passer `VERSION_SORTIE` à 2 ; la sortie renvoie un refus (`ack{refus}`) au lieu de rien ; la fenêtre reprise est rechargée si sa version diffère ; la vignette compare la scène publiée et la scène vue et passe en ambre ; l'iframe `page` reste montée à URL égale ; le pont envoie les `cmds` de **chaque étape** et journalise ce qui n'est pas parti | `sortie/protocole.ts`, `page.tsx`, `fenetre.ts`, `relais.ts`, `ApercuSortie.tsx`, `scenes.tsx`, `coquille/pont-figurants.ts` | S · 4 h | — | Sonnet 5.5 (tests par Qwen local) |
| **L1** | **Protocole commun des sorties** : `Commande`, `Cible`, `RetourActeur` (`bonjour` / `etat` / `ack` / `entree`), validation, versions, convertisseur `params.sortie` + `params.cmds` → `params.sorties` | nouveau `packages/protocole-sorties`, `sortie/protocole.ts`, `traduction.ts`, `projets/echo/generer-echo-simple.ts` | M · 8 h | modèle de données du chantier 1 | Claude (Opus/Fable) pour le contrat, Sonnet 5.5 pour le code |
| **L2** | **Aiguilleur des sorties et magasin `useSorties`** : un module qui reçoit l'état de lecture, envoie à chaque acteur, garde l'état voulu, rejoue à la reconnexion et agrège les retours ; il remplace le pont | `sortie/relais.ts`, `coquille/pont-figurants.ts` (retiré), `etat/` | M · 10 h | L1, serveur de spectacle (chantiers 1 et 3) | Sonnet 5.5, relu par Claude |
| **L3** | **Scènes natives** mur, vote réel et visio (deux canaux `src/flux`, réglages de son et de disposition par commande `reglage`) ; flux Insta en `video` locale | `sortie/scenes.tsx`, `sortie/flux.ts`, `flux/recepteur.ts`, `calque/*` | L · 16 h | L1 | Sonnet 5.5 |
| **L4** | **Rail des sorties, inspecteur « Sorties de l'étape », pistes par acteur, page des liens d'acteurs** | `coquille/EnTete.tsx`, `Panneau.tsx`, `Regie.tsx`, `Superpositions.tsx`, conduite, `streamer/page-accueil.ts` | L · 20 h | L1, L2 ; maquette validée par le propriétaire | Claude pour l'ergonomie (maquette), Sonnet 5.5 pour le code |
| **L5** | **Bundle téléphone unique** : écrans purs, machine d'état, `TransportTelephone` (WebSocket / mémoire), `bonjour` / `etat` / `ack` ; on y transpose `pages/echo`, `pages/eco`, `pages/ministre` et les téléphones de la visio | nouveau `apps/telephone`, `prototypes/figurants/pages/*` (référence) | L · 20 h | L1 | Claude (Opus/Fable) pour le découpage, Sonnet 5.5 pour le portage |
| **L6** | **Salle émulée et agents** : `SalleEmulee` en mémoire, agents sans rendu en Worker, profils, population tirée de `salle.ts`, `signaux()`, `bilan()` | nouveau `packages/emulateur` | M · 12 h | L1, L5 (machine d'état) | Sonnet 5.5 ; tests unitaires par Qwen local |
| **L7** | **Panneau Émulateur** : vitrine en iframes, nuage de la foule, actions en masse, téléphone témoin, bouton Tester de l'inspecteur | `coquille/` (nouveau `Emulateur.tsx`), `packages/emulateur` | M · 12 h | L4, L5, L6 | Sonnet 5.5 |
| **L8** | **Vrais signaux dans le moteur** : `sourceSignaux()` (réels en Scène, émulés en répétition émulée, simulés sinon) ; `entree` → `Lecteur.signal()` | `etat/magasin.ts:232,336`, `etat/moteur.ts` | M · 6 h | L2 ou L6 | Claude (Opus/Fable) : touche au moteur et au mode Scène |
| **L9** | **Journal de représentation** : schéma JSONL, pseudonymisation, `bilan`, rejeu dans l'émulateur | serveur de spectacle, `packages/emulateur`, scripts | M · 8 h | L1, L6 ; politique de données (Q5) | Sonnet 5.5 ; doc et script de bilan par Qwen local |
| **L10** | **Tests de bout en bout émulés** : scénario Écho simple sous vitest (Node), puis Edge + CDP avec vitrine | `packages/emulateur/*.test.ts`, `sortie/*.edge.test.ts` | M · 6 h | L6, L8 | Qwen local (Haiku 5.5 si Qwen échoue) |
| **L11** | **Retrait des doublons** : conduite en dur de `regie.js:555-567`, questions de `eco.js:4-10`, adresse du tunnel de `generer-echo-simple.ts:66` et de `protocole.ts:167` | ces fichiers | S · 3 h | L2, L5 | Haiku 5.5 |

Ordre conseillé : **L0** tout de suite ; puis L1 → (L2, L5 en parallèle) → L6 → (L3, L7, L8) → L4 → L9 → L10 → L11.
Total ≈ 125 h de développeur. Si l'on délègue comme proposé (Sonnet pour l'essentiel, Qwen pour les tests), compter
environ 10 à 20 $ de crédits API, plus la relecture par Claude.

## 6. Questions au propriétaire

1. **Quel serveur porte les téléphones** au prochain spectacle : le prototype figurants consolidé, ou le Worker /
   Durable Object d'`apps/serveur` ? L'émulateur reprend le protocole de celui qui est choisi (chantiers 1 et 3).
2. **Le mur** devient-il une scène native de l'écran scène (recommandé : réglable, avec retour, sans rechargement), ou
   reste-t-il une page séparée qu'on projette ?
3. **La visio** : WebRTC pair à pair par `src/flux` avec un serveur TURN (à louer ou à héberger), ou un service tiers ?
   En 4G, sans TURN, elle peut échouer.
4. **Jauge cible** : combien de téléphones au maximum (150 ? 300 ?) pour dimensionner les agents et l'essai de charge ?
5. **Données du public** dans le journal : durée de conservation des pseudos et des textes, pseudonymisation, mention à
   l'accueil ?
6. **Téléphones des comédiens** : des téléphones de prêt préconfigurés (lien d'acteur installé à l'avance) ou leurs
   téléphones personnels ?
7. **Émulateur pendant une représentation** : l'interdire totalement en mode Scène (recommandé), ou n'autoriser que le
   téléphone témoin en lecture seule ?
8. **Le rail des sorties** : toujours visible en haut, ou seulement en mode Scène ou pupitre ? Et quels acteurs pour
   Écho : écran scène, public, Franck, ministre ; le prompteur ÉCO est-il un acteur à part ?
9. **Rendu de la vitrine** : accepter le coût des iframes réelles (≤ 12, fidélité maximale), ou préférer des composants
   montés directement dans le Conducteur (plus léger, moins fidèle au téléphone) ?
