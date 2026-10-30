# Chantier 6 — Qualité du code et structure du monorepo

Audit du 28/10/2026, branche `audit/2026-10` (HEAD `c1045cd`). Toutes les mesures ont été prises sur le poste Windows du
propriétaire (Node v24.14.1, npm 11.11.0), sans `npm install`. Rien n'a été modifié dans le dépôt hors de ce rapport
(`generer-echo-simple.ts` a été relancé : le JSON régénéré est identique, `git diff --stat` vide ; une construction de
contrôle a été faite dans `apps/conducteur/dist/audit-pages/`, dossier ignoré, puis effacée).

## 1. Résumé

- Le code du Conducteur est **sain sur le fond** : 283 tests verts (80 modèle, 180 Conducteur, 23 serveur), types OK
  partout où `tsc` passe, build reproductible (la construction refaite donne exactement les mêmes fichiers hachés que `conducteur/`).
- La dette vient du **27/10 au soir** et des **copies** : la conduite d'Écho existe en 3 endroits qui divergent déjà, le protocole du
  serveur de spectacle a 11 messages non documentés et n'est typé nulle part, le vote est dessiné 4 fois, le thème existe en
  2 copies vivantes (+2 anciennes), les polices en 4 copies, `ops`/`protocole` de la salle en 2 copies « à garder alignées ».
- Mesure : **1 784 lignes** de source dans des blocs dupliqués (fenêtres de 6 lignes identiques), dont 72 % de jetons CSS.
- `Etape.params` est un fourre-tout (`Record<string, unknown>`) : 68 clés différentes dans LIVE, 7 dans Écho, mêlant réglages
  lus par la machine, commandes envoyées au serveur et notes de régie ; le comportement dépend même du **nom** de l'étape.
- Outillage absent au niveau du dépôt : ni `.gitattributes`, ni CI, ni lint hors Conducteur (25 erreurs), `npm test` racine ne
  lance que 80 tests sur 283, les générateurs `projets/echo/*.ts` ne sont jamais vérifiés par `tsc` (9 erreurs dans le complet).
- Proposition : un **paquet `protocole`** (types + schémas validés, source unique), un **thème unique**, `params` typés par bloc,
  une CI minimale (lint + types + tests rapides + « Pages à jour »), et un rangement `archive/` **soumis à l'accord du propriétaire**.
- 17 lots, dont 9 délégables à Qwen local ou Haiku 5.5 (normalisation, scripts, lint, tests, CSS, dépendances).

## 2. Constats

Gravité : **P0** = fera rater un spectacle, **P1** = coûte cher ou casse au prochain changement, **P2** = hygiène.

### C1 — La conduite d'Écho existe en trois exemplaires, déjà divergents (P0)
- **Preuves** :
  - `prototypes/figurants/pages/regie/regie.js:555-567` : `const CONDUITE = [...]`, la suite des taps de la régie figurants
    (tap 1 = `tel.cmd video` seul ; tap 3 = « (forcer) Abonne / désabonne » = `tel.cmd choix` ; questions `[1, 2, 3, 4, 15]` à la ligne 561).
  - `projets/echo/generer-echo-simple.ts:22-59` : les mêmes taps en `cmds`, recopiés à la main, puis écrits dans 16 étapes de
    `echo.conducteur.json`. `b1_entree` envoie `tel.cmd video` **+ `ecran qr` + `vote.cmd fermer`** (ligne 25) : pas la même chose
    que le tap 1 de la régie ; `b1_choix` n'envoie **aucune** commande (ligne 29) alors que la régie a un tap « forcer le choix ».
  - `prototypes/figurants/banques/echo/votes.json` : les questions elles-mêmes (troisième source de la liste 1-2-3-4-15).
- **Impact vécu** : deux pupitres (régie figurants et TAP du Conducteur) pouvaient piloter le même spectacle avec deux suites
  différentes ; toute correction de dernière minute devait être faite deux fois.
- **Gravité** : P0 (le prochain spectacle partira d'une des deux copies sans savoir laquelle est juste).

### C2 — Le protocole du serveur de spectacle n'est ni typé ni à jour (P0)
- **Preuves** :
  - Messages traités par `prototypes/figurants/serveur/*.mjs` mais **absents de `PROTOCOLE.md`** : `tel`, `tel.cmd`, `ecran`,
    `junon`, `media`, `vote.pop`, `choix.reponse`, `choix.stat`, `rtc` (visio), `diag`, `asr.etat`. Le champ `pourcents` du message
    `vote` (envoyé par `jeu.mjs:131`, lu par `pages/chat/chat.js` dans `montrerVote`) n'est pas documenté.
  - `apps/conducteur/src/coquille/pont-figurants.ts:36` : `(mo?.st[0]?.params as { cmds?: unknown[] } | undefined)?.cmds`, puis
    ligne 39 `for (const c of cmds) ws.send(JSON.stringify(c))` : aucune validation, aucun type ; si la socket est fermée, les
    commandes sont **perdues** (ligne 38 : message « NON relié », pas de file d'attente, pas de nouvel essai), alors que
    `pages/commun/ws.js:75-90` a, lui, une file d'attente.
  - Seule la première étape du moment est lue (`st[0]`, ligne 36).
- **Impact vécu** : une faute de frappe dans un `cmds` = commande ignorée en silence par le serveur ; tunnel qui tombe pendant un
  top = commandes perdues (« serveur à redémarrer sans cesse », « tunnel à recoller partout »).
- **Gravité** : P0.

### C3 — Le vote est dessiné quatre fois, avec deux moteurs (P1)
- **Preuves** : `pages/chat/chat.js:43-72` (mur : `LETTRES`, `reponses`, `pourcents`, « @x a voté »), `pages/ministre/ministre.js:5-47`
  (barres sur `comptes`), `pages/echo/echo.js:109-139` (boutons du public), `pages/regie/regie.js` (15 mentions de vote, envoi ligne 516),
  et côté Conducteur la scène `vote` de la sortie (`apps/conducteur/src/sortie/traduction.ts:130-140`, `optionsVote` ligne 73) avec le
  calque (`sortie/calque/effets.ts:428` `explosionVote`). Deux moteurs : le vote truqué de `prototypes/figurants/serveur/jeu.mjs:117-181`
  et les blocs `u1`/`d1` du modèle (`packages/modele/src/blocs-moteur.ts`, `TYPES_VOTE`).
- **Impact vécu** : le Conducteur avait sa scène de vote, mais le soir on a projeté le mur du prototype dans une iframe.
- **Gravité** : P1.

### C4 — Le thème vit en deux copies actives, plus deux anciennes ; les polices en quatre (P1)
- **Preuves** :
  - `packages/theme/jetons.css:1-2` : « copie FIDÈLE de apps/conducteur/src/theme/jetons.css (27/10/2026) … un écart avec le
    Conducteur se corrige des deux côtés ». Le Conducteur **n'importe pas** `@studio-real/theme` (aucune dépendance dans
    `apps/conducteur/package.json` ; `src/theme/index.css` importe ses propres fichiers).
  - Écarts déjà présents (lignes différentes, `diff --strip-trailing-cr`) : `base.css` 12, `composants.css` 113, `polices.css` 46,
    `jetons.css` 3, `jetons-portail.css` 3.
  - `jetons-portail.css` existe en **4 copies** : `apps/conducteur/src/theme/`, `packages/theme/`, `design/tokens.css`,
    `conception/conducteur/source/studio-real/tokens.css` (ces deux derniers sont le même blob git `61de4bc`).
  - Polices : mêmes blobs dans `packages/theme/polices/`, `apps/conducteur/public/polices/`, `conducteur/polices/` (build) et
    `design/fonts/` (ex. `azeret-mono.ttf`, blob `105c12b`, 4 copies ; `venus-rising.otf`, blob `da5e4bf`, 3 copies). Git ne stocke
    qu'un blob, mais chaque mise à jour devra être faite à 3 endroits.
- **Gravité** : P1 (les pages du public et le Conducteur divergeront visuellement à la première retouche).

### C5 — Copies « volontaires » entre le Worker et l'interface (P1)
- **Preuves** : `apps/conducteur/src/collab/protocole.ts:1-2` « recopiés de apps/serveur/src/logique/protocole.ts … À garder alignée
  avec le serveur » (101 lignes contre 227) ; `apps/conducteur/src/collab/ops.ts:3-4` « réimplémenté ici pour ne pas faire dépendre
  l'interface du code du Worker » (285 lignes contre 167 dans `apps/serveur/src/logique/ops.ts`). Aucun test ne vérifie l'alignement.
  Même motif pour le protocole de la sortie (`apps/conducteur/src/sortie/protocole.ts`, 321 lignes, 11 `as unknown as` après
  validation à la main, lignes 295-318).
- **Gravité** : P1. Le motif (« ne pas dépendre du Worker ») est juste ; la solution est un paquet partagé, pas une copie.

### C6 — Inventaire chiffré des duplications (P2)
Détecteur maison (fenêtres de 6 lignes normalisées identiques ; lignes de moins de 12 caractères et commentaires ignorés) sur
`apps/`, `packages/`, `prototypes/`, `projets/`, `design/`, `conception/` : **1 784 lignes** dans des blocs dupliqués.

| Fichiers | Lignes dupliquées |
|---|---|
| `jetons-portail.css` ×2 + `design/tokens.css` + `conception/…/tokens.css` | 239 + 239 + 237 + 237 |
| `apps/conducteur/src/theme/jetons.css` ↔ `packages/theme/jetons.css` | 132 + 132 |
| `flux/integration.edge.test.ts` ↔ `sortie/bascule.edge.test.ts` (pilote CDP d'Edge recopié) | 88 + 88 |
| `collab/ops.ts` ↔ `serveur/src/logique/ops.ts` | 58 + 58 |
| `composants.css` ×2 (+ `design/curseur.css`) | 41 + 41 + 24 |
| `collab/protocole.ts` ↔ `serveur/…/protocole.ts` ; `base.css` ×2 | 24 + 24 ; 24 + 24 |
| `pages/echo/echo.js` ↔ `pages/telephone/telephone.js` (saisie du pseudo) | 13 + 13 |
| `sortie/calque/kit.ts` ↔ `prototypes/scene-pops/kit.js` (portage) | 9 + 9 |

Hors code : 3 documents identiques entre `docs/` et `conception/conducteur/brief-initial/` (`roles-equipes.md`,
`catalogue-noeuds-visuels.md`, `00-BRIEF-a-coller.md` = `docs/brief-claude-design.md`) ; `prototypes/figurants/serveur/secours/`
reprend 5 fichiers de `banques/` mais **diverge** (`personas.json` : 1 983 lignes différentes). Le build embarque
`live.conducteur.json` deux fois (`assets/live.conducteur-*.json` 114 Ko via `?url` dans `collab/OuvrirProjet.tsx:14`, et
`assets/live.conducteur-*.js` 54 Ko via `import()` dans `coquille/projet-live.ts:11`).
Bonne nouvelle : la **connexion WebSocket** des pages n'est pas dupliquée (toutes passent par `pages/commun/ws.js`) ; la seule
autre est `pont-figurants.ts`, plus pauvre (C2).

### C7 — CSS du 27/10 : empilé en fin de fichier, écrans superposés par z-index (P2)
- **Preuves** : `git log --numstat -- '*.css'` : tous les commits CSS du 27/10 après 15:00 sont des **ajouts purs** (0 ligne retirée)
  en fin de fichier (`echo.css` +67, +23, +26, +6 ; `chat.css` +4, +3, +20, +4 ; `ministre.css` +54 ; `visio.css` +29…). Doublon de
  sélecteur strict trouvé : un seul, `.cd-piste-nom` (`apps/conducteur/src/conduite/conduite.css:167` et `:241`). La vraie dette est ailleurs :
  - chaque « écran » est un calque `position: fixed` affiché par `hidden` et départagé par `z-index` : `echo.css` `.ec-plein` 19,
    `.ec-flux` 20, `.ec-vote` 25 ; `chat.css` `.ch-vote` 30, `.ch-noir` 40, `.ch-qr` 45, `.ch-son` 50. Plusieurs écrans peuvent être
    visibles à la fois (dans `chat.js`, le message `ecran` masque noir et QR, mais `vote` est indépendant) : il n'y a pas d'« écran courant ».
  - 15 couleurs en dur (`#000`, `#fff`, `rgba(...)`) dans `pages/{chat,echo,ministre,visio}/*.css`, contre la règle
    « sans aucune couleur en dur » de `prototypes/figurants/PROTOCOLE.md` (§ Arborescence).
- **Gravité** : P2 (mais un écran resté affiché par-dessus un autre est un bug de spectacle probable).

### C8 — Fins de ligne : pas de `.gitattributes`, copie de travail mélangée (P2)
- **Preuves** : `.gitattributes` absent ; `core.autocrlf=true` vient de `C:/Program Files/Git/etc/gitconfig` (réglage du poste, pas du
  dépôt). `git ls-files --eol` : l'**index est propre** (406 fichiers texte en LF, 35 binaires, 0 CRLF), mais la copie de travail
  compte **92 fichiers CRLF + 1 mixte** (`.gitignore`) contre 313 LF : les fichiers du clone du 26/10 sont en CRLF, ceux écrits le
  27/10 par les agents en LF (`file` signale 83 fichiers CRLF). Preuve que ça a déjà gêné :
  `projets/echo/generer-echo-complet.ts:11` fait `.replace(/\r\n/g, '\n')` sur `DEROULE-AUTEUR.md`. Git avertit à chaque écriture
  (« LF will be replaced by CRLF the next time Git touches it », vu sur `echo.conducteur.json`). Les DGX (Linux) écrivent en LF.
- **Gravité** : P2 (diffs bruités, comparaisons de texte et hachages qui changent selon la machine).

### C9 — Lint : seulement le Conducteur, et rouge (P2)
- **Preuve** : `npm run lint -w conducteur` (34 s) : **38 problèmes, 25 erreurs, 13 avertissements**, code de sortie 1.
  22 erreurs sont dans les tests (`no-explicit-any` et `no-this-alias` dans `flux/flux.test.ts:48-59`, `flux/integration.edge.test.ts`
  ×13, `sortie/bascule.edge.test.ts` ×5), 3 dans le code : `planche/Planche.tsx:456` (`prefer-const`), `sortie/calque/calque.ts:69`
  (`no-this-alias`), `sortie/calque/kit.ts:14` (espace insécable). 13 avertissements `react-refresh/only-export-components`.
  4 `eslint-disable-next-line react-hooks/exhaustive-deps` (`Conduite.tsx:167`, `Planche.tsx:163,178`, `scenes.tsx:110`).
- Rien n'est linté dans `packages/modele`, `apps/serveur`, `prototypes/`, `projets/`. Pas de Prettier, pas d'`.editorconfig` ;
  812 lignes de plus de 160 caractères (551 dans le Conducteur, la plus longue en fait 405).
- `apps/conducteur/README.md` est le README du gabarit Vite (en anglais, « This template provides a minimal setup… »).
- **Gravité** : P2.

### C10 — Types : vert là où `tsc` passe, aveugle ailleurs (P1)
- **Preuves** : `npx tsc -b apps/conducteur --noEmit` 0 erreur (18 s) ; `npm run typecheck -w serveur` 0 (7 s) ;
  `npx tsc --noEmit -p packages/modele` 0 (5 s). Mais :
  - `projets/echo/*.ts` n'est couvert par **aucun** tsconfig, et `tsx` ne vérifie pas les types. En les vérifiant à part
    (`tsc --strict --noEmit`) : `generer-echo-simple.ts` 0 erreur, **`generer-echo-complet.ts` 9 erreurs** (TS2353 ×4 lignes 316-319,
    propriété `role` inconnue ; TS2454 ×4 lignes 363-376, `courant` utilisé avant affectation ; TS2339 ligne 366).
  - Trois tsconfig divergents, pas de base commune : `noUncheckedIndexedAccess` dans `packages/modele/tsconfig.json` et
    `apps/serveur/tsconfig.json`, absent de `apps/conducteur/tsconfig.app.json` ; cible ES2020 (Conducteur) contre ES2022.
    Pas de tsconfig racine : `tsc -b` à la racine est impossible.
  - Échappatoires : `as unknown as` 26 (23 dans le Conducteur, 18 hors tests, dont 11 dans `sortie/protocole.ts:295-318`),
    `Record<string, unknown>` 70 occurrences (34 Conducteur, 12 modèle, 14 serveur, 10 projets), `any` 17 (tous dans des tests).
- **Gravité** : P1 pour les générateurs (ils écrivent le JSON joué), P2 pour le reste.

### C11 — `params` d'étape : un fourre-tout qui pilote le spectacle (P1)
- **Preuves** :
  - `packages/modele/src/types.ts:91` : `params?: Record<string, unknown>;` (« ex. texte d'une question, cible »).
  - **Écho** : 19 étapes, toutes `k:scene`, 7 clés : `ecran`, `plateau`, `telephones`, `outil` (texte libre pour les humains),
    `duree_reperes_min` (nombre), `sortie` (texte ou objet `{type:'page', url}`), `cmds` (16 étapes, 12 sortes de commandes :
    `tel.cmd`, `ecran`, `vote.cmd`, `junon`).
  - **LIVE** : 97 étapes, **68 clés différentes** ; la plupart sont des notes (`consigne`, `son`, `lumiere`, `fiction`, `patissier`…),
    d'autres sont lues par le moteur (`delai`, `echeance`, `nom`, `op`, `valeur`, `poids`, `exaequo`, `entree`…).
  - Lecture : lecteurs **tolérants** clé par clé dans `packages/modele/src/blocs-moteur.ts:268-629` (`reglagesGarde`, `reglagesMemoire`… :
    un mauvais type retombe en silence sur le rotatif), `apps/conducteur/src/blocs/options.ts:25-45`, `apps/conducteur/src/etat/regie.ts:38`,
    `apps/conducteur/src/sortie/traduction.ts:104` (`params.sortie`), et le cast de `pont-figurants.ts:36`. `valider.ts:203` ne contrôle
    qu'un seul paramètre (`signal`/`adresse`).
  - Le comportement dépend aussi du **nom** : `traduction.ts:124` `contientMot(e.name, 'noir')` → écran noir ;
    `traduction.ts:142` un nom contenant « qr » ou « accueil » → QR. Renommer une étape change ce que montre l'écran.
- **Gravité** : P1.

### C12 — Deux générateurs d'Écho réécrivent le même JSON (P1)
- **Preuves** : `generer-echo-simple.ts` (105 lignes) et `generer-echo-complet.ts` (625 lignes, ex-`generer-echo.ts`, renommé au
  commit `8cc36e4`) écrivent tous deux `projets/echo/echo.conducteur.json`. Les deux **écrivent avant de valider**
  (`simple.ts:99` puis `:101` ; `complet.ts:617` puis `:620`) : un projet invalide est quand même écrit. Le simple code en dur
  l'adresse du tunnel du soir (`simple.ts:66`), recopiée 15 fois dans le JSON et une fois dans
  `apps/conducteur/src/sortie/protocole.ts:167` (`ADRESSE_PUBLIC_DEFAUT`). Le JSON est **embarqué dans le build**
  (`coquille/projet-live.ts:12`) : changer d'adresse de tunnel = régénérer + reconstruire + commettre `conducteur/`.
- Textes faux : `simple.ts:2` et `LISEZMOI.md` (« 6 blocs (actes) et 14 étapes ») alors que le JSON a 7 blocs et 19 étapes
  (sortie du générateur : « blocs 7 · étapes 19 · total prévu 03:10 »). `npm run verifier-projets` : 0 erreur, 1 avertissement
  (« Discours du président Jean Boilot : c'est le dernier moment, son passage ne sera jamais joué »).
- Vérifié : `npx tsx projets/echo/generer-echo-simple.ts` (2,6 s) régénère un JSON **identique** à celui commis.
- **Gravité** : P1 (relancer le mauvais générateur efface la version jouée ; une retouche faite dans le Conducteur est écrasée).

### C13 — Le build GitHub Pages est versionné à la main (P1)
- **Preuves** : `conducteur/` = 47 fichiers, 1,9 Mo, touché par **14 commits** le 27/10 ; 156 blobs historiques (10,2 Mo bruts) pour
  ce seul dossier. `.git` = 8,9 Mo (1 006 objets en vrac, jamais compactés). Reconstruction de contrôle
  (`vite build --base ./`, 12 s) : **mêmes noms hachés** que `conducteur/assets/` — le build commis correspond bien aux sources
  de `c1045cd`. Mais rien ne le garantit au prochain commit : il faut penser à lancer `npm run pages -w conducteur`, qui n'existe pas
  à la racine (`package.json` racine : `dev`, `build`, `test`, `verifier-projets`).
- Le site publie toute la racine du dépôt (`index.html` racine lie `conducteur/` et `prototypes/…`), donc aussi
  `projets/echo/DEROULE-AUTEUR.md`, les banques et les documents.
- **Gravité** : P1 (une sortie Écran scène en retard d'une version a déjà coûté cher le 27/10).

### C14 — Tests : beaucoup, mais pas là où le spectacle a cassé (P1)
- **Mesures** :

| Commande | Résultat | Durée |
|---|---|---|
| `npm test` (racine = modèle seul) | 5 fichiers, **80 tests** verts | 14 s (vitest 5,1 s) |
| `npm test -w conducteur` | 17 fichiers, **180 tests** verts | 64 s (vitest 61,3 s) |
| `npm run test:logique -w serveur` | 3 fichiers, **23 tests** verts | 4 s |
| `npm run verifier-projets` | 3 projets, 0 erreur, 1 avertissement | 4 s |

- `npm test` racine ne lance que 80 tests sur 283. `npm test -w conducteur` **démarre `wrangler dev` et Edge sans tête** sur des ports
  locaux (`collab/integration.serveur.test.ts` 22,5 s ; `sortie/bascule.edge.test.ts` 48,2 s ; `flux/integration.edge.test.ts`). Ces
  tests dépendent du chemin Windows d'Edge (`bascule.edge.test.ts:26`) et **se sautent en silence** ailleurs
  (`describe.skipIf(SANS)`, `integration.edge.test.ts:21`, `bascule.edge.test.ts:27`), quand `sortie.html` n'est pas construite
  (`integration.edge.test.ts:231`, `ctx.skip()`) ou sans vidéo locale (`bascule.edge.test.ts:238`). Sur une CI Linux, ils seraient
  « verts » sans avoir tourné.
- Non testé : `apps/conducteur/src/coquille/` (16 fichiers, 1 925 lignes, dont `pont-figurants.ts` et `BoutonTap.tsx` ajoutés le soir),
  `sortie/calque/` (1 000 lignes), les générateurs, toutes les pages du public. Côté prototype, `jeu.mjs` (vote, `tel`, `ecran`, Junon)
  a été modifié **9 fois le 27/10** ; `test-bout-en-bout.mjs` n'a pas bougé depuis le 26/10 (`558ab54`) et ne mentionne ni `vote`,
  ni `tel.cmd`, ni `ecran`, ni `junon` (0 occurrence) ; il lance de plus un serveur sur un port (non lancé pendant l'audit).
- **Gravité** : P1.

### C15 — Scripts, versions et dépendances (P2)
- **Preuves** :
  - `prototypes/figurants/serveur` est **hors des workspaces** (`package.json` racine : `packages/*`, `apps/*`) avec son propre
    `package-lock.json` : 2 lockfiles.
  - Versions installées : React 19.3.1, Vite 6.4.5, vitest 3.2.7, TypeScript 5.8.3, wrangler 4.153.0, `@cloudflare/workers-types`
    5.20261027.1 (cohérent avec wrangler). Incohérences : `@types/node ^26.6.5` (`apps/serveur/package.json`) alors que la machine
    tourne en **Node 24** et que le prototype annonce `node >= 20` ; aucun `engines` racine, aucun `.nvmrc` ; `vitest ^3.1.1`
    (Conducteur, modèle) contre `^3.2.7` (serveur) ; `@types/qrcode` en `dependencies` au lieu de `devDependencies`.
  - `npm ls --depth=0` : 3 paquets **extraneous** (`@emnapi/runtime`, `@img/sharp-wasm32`, `tslib`) : `node_modules` ne correspond plus
    au lockfile. `depcheck` n'est pas installé (non lancé).
  - `pixi.js` **est utilisé** (`sortie/calque/calque.ts:5`, `effets.ts:3`, `kit.ts:5`) ; il pèse environ 600 Ko de morceaux
    (`calque` 333 Ko, renderers WebGL/WebGPU/Canvas 149 Ko…), chargés à part. Pas de dépendance inutile trouvée à la main.
  - Code mort : le greffon `policesPrivees` de `apps/conducteur/vite.config.ts:7-29` et son commentaire « JAMAIS dans le dépôt
    public » sont obsolètes depuis que Venus Rising est versionnée à la demande du propriétaire (`src/theme/polices.ts:1` la charge
    depuis `public/polices/`).
- **Gravité** : P2.

### C16 — Les deux serveurs veulent le port 8787 (P1)
- **Preuves** : `prototypes/figurants/serveur/index.mjs:20` `port: parseInt(env.PORT || '8787', 10)` ; `apps/serveur/README.md:21`
  « wrangler dev --local → http://localhost:8787 ».
- **Impact vécu** : « ports qui restent occupés » (00-contexte.md).
- **Gravité** : P1 (simple à corriger ; le détail réseau appartient à un autre chantier).

### C17 — Dossiers caducs ou en double (P2)
- `design/` (11 fichiers, thème Showrunner du 26/10) : référencé seulement dans des **commentaires**
  (`packages/theme/composants.css:7-13`, `apps/conducteur/src/theme/polices.css:3-4`) ; `design/tokens.css` = blob de
  `conception/…/tokens.css`.
- `conception/` (11 fichiers versionnés) : source du design (citée par `planche/geometrie.ts:3`, `conduite/types-pistes.ts:2`)
  + 3 documents en double de `docs/`.
- `prototypes/scene-pops/` : porté dans `apps/conducteur/src/sortie/calque/` (en-têtes de `kit.ts`, `effets.ts`, `calque.ts`,
  `public-factice.ts`, `theme.ts`), toujours lié depuis `index.html:40`.
- `prototypes/figurants/pages/telephone/` (testeur du 26/10) et `pages/echo/` (public d'Écho) font le même travail ;
  `echo/index.html` (page fixe du QR) en est une troisième variante.
- `apps/conducteur/src/App.tsx` (2 lignes, réexporte `coquille/App.tsx`) ; `planche/essai/` (banc de développement).
- **Gravité** : P2. **Rien ne doit être écarté sans l'accord du propriétaire** (question Q2).

### C18 — Trois règles de pseudo pour le même public (P2)
- `pages/telephone/telephone.js:40` (espaces gardés, 2 à 20 caractères, clé `figurants.pseudo`) ; `pages/echo/echo.js:14` (« @ » retiré,
  espaces → « _ », 2 à 20, clé `studio-real:echo:pseudo`) ; `echo/index.html:71` (préfixe « @ » **stocké**, `maxlength="24"`, pas de
  minimum, **même clé** `studio-real:echo:pseudo`, ligne 66).
- **Gravité** : P2 (un pseudo de 21 à 24 caractères est accepté à l'accueil puis refusé par la page du spectacle).

### C19 — Fichiers non suivis apparus pendant l'audit (à signaler)
- Vers 19:21 le 28/10 (pendant l'audit, sans action de ma part) sont apparus à la racine : `STUDIO_REAL/` (copie imbriquée d'un ancien
  état du dépôt : `README.md`, `design/`, `docs/`, `prototypes/`, un fichier `lpcyba8tvke6ixgmfr3z`), `kit-theme-showrunner/`,
  `package-claude-design.zip` (1,3 Mo), `patch_page.cjs`. Ils ne sont pas ignorés : un `git add .` les committerait. Je n'y ai pas
  touché (Q1).

## 3. Risques (si rien n'est fait avant le prochain spectacle)

1. **Conduite fausse** : on corrige un tap dans la régie figurants mais pas dans le générateur (ou l'inverse) ; le TAP du Conducteur
   envoie l'ancienne suite (C1).
2. **Commande muette** : une faute de frappe dans `cmds` (`vote.cmd` → `vote.cmds`) passe la validation, le build, les tests, et ne
   fait rien le soir (C2, C11). Même chose si le tunnel tombe au moment du top : commandes perdues, sans nouvel essai.
3. **Mauvais générateur relancé** : `generer-echo-complet.ts` écrase la version simple jouée ; ou une retouche faite dans le Conducteur
   est perdue à la prochaine régénération (C12). Le complet ne passe d'ailleurs pas `tsc` (C10).
4. **Pages en retard** : un correctif du Conducteur commis sans `npm run pages` ; la régie ouvre GitHub Pages et joue l'ancienne
   version (C13).
5. **Écran qui reste** : un calque (vote, QR, noir) reste affiché par-dessus un autre sur le mur ou les téléphones (C7).
6. **Thème qui diverge** : une couleur corrigée dans le Conducteur ne l'est pas sur les téléphones (C4).
7. **Faux vert** : une CI Linux montrerait des tests « verts » dont les tests Edge et serveur n'auraient pas tourné (C14).
8. **Bruit de fins de ligne** : un agent DGX et le poste Windows produisent des diffs entiers sur des fichiers non modifiés (C8).

## 4. Proposition cible

### 4.1 Structure du monorepo

```
STUDIO_REAL/
├─ packages/
│  ├─ modele/          moteur déterministe (inchangé) + params typés par bloc (§4.5) + valider
│  ├─ protocole/       NOUVEAU : SOURCE UNIQUE des messages
│  │    salle/         salle du Conducteur v1 (ex apps/serveur/src/logique/protocole.ts + ops.ts)
│  │    spectacle/     serveur de spectacle (ex prototypes/figurants : hello, msg, vote.*, tel.*, ecran, junon, media, rtc…)
│  │    sortie/        Écran scène (ex apps/conducteur/src/sortie/protocole.ts : Scene, MessageRegie, MessageSortie)
│  │    client-ws.ts   client commun : reconnexion + file d'attente + horloge (ex pages/commun/ws.js, utilisé aussi par le pont)
│  ├─ theme/           SEULE source du thème (CSS + polices) ; le Conducteur l'importe, les pages aussi
│  └─ ui-telephone/    NOUVEAU : écrans du téléphone du public (pseudo, phrases, vote, flux, choix, notif, attente),
│                      une machine à états « écran courant » ; utilisé par apps/telephone ET par l'émulateur du Conducteur
├─ apps/
│  ├─ conducteur/      régie (React) ; sortie.html et streamer.html restent ici tant que la sortie n'est pas séparée (Q8)
│  ├─ serveur/         Worker du Conducteur (D1, R2, DO) — à renommer serveur-conducteur ? (Q10)
│  ├─ serveur-spectacle/  ex prototypes/figurants/serveur (Node + ws), passé progressivement en TS (ou JS + // @ts-check)
│  ├─ telephone/       page du public (ex pages/echo + echo/index.html), construite par Vite à partir de ui-telephone
│  └─ ecrans/          mur, ministre, visio, flux, régie de secours (ex pages/chat, ministre, visio, flux, regie)
├─ projets/            echo/, live/ : le JSON au format du projet (+ outils éventuels, §4.6)
├─ archive/            prototypes caducs, design/, conception/… UNIQUEMENT après accord du propriétaire, fichier par fichier
├─ docs/
├─ conducteur/         build GitHub Pages (gardé tant que Pages se publie depuis la branche ; vérifié par la CI)
├─ .gitattributes  .editorconfig  .nvmrc  tsconfig.base.json  tsconfig.json (références)  eslint.config.js  vitest.workspace.ts
└─ .github/workflows/verifier.yml
```

Ce qui devient paquet : `protocole` (les copies C2, C5 et les validateurs à la main disparaissent), `ui-telephone` (C3, C18 : un seul
rendu du vote côté public, une seule règle de pseudo). Ce qui reste app : tout ce qui se lance. Ce qui part en `archive/` : **proposé,
jamais fait sans accord** (liste en Q2). Dépendances internes : `modele` ne dépend de rien ; `protocole` dépend de `modele` (types
`Projet`, `EtatLecture`) ; les apps dépendent des paquets, jamais l'inverse ; le Worker importe `protocole` comme il importe déjà `modele`.
Cette arborescence s'aligne sur le « protocole unique » et les nœuds « acteurs » des chantiers 1 et 2 : `packages/protocole/spectacle`
est l'endroit où un acteur (téléphones, mur, audio, vote) déclare les commandes qu'il comprend.

### 4.2 Conventions

- **Fins de ligne** : `.gitattributes`
  ```
  * text=auto eol=lf
  *.{png,jpg,jpeg,gif,webp,avif,ico,woff,woff2,ttf,otf,mp3,mp4,wav,zip,pdf} binary
  ```
  puis `git add --renormalize .` (l'index est déjà en LF : commit quasi vide) et une nouvelle extraction des fichiers en CRLF.
  `.editorconfig` (LF, UTF-8, 2 espaces, saut de ligne final).
- **TypeScript** : `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, ES2022) étendu par chaque
  paquet ; `tsconfig.json` racine en références pour `tsc -b` ; `projets/**/*.ts` inclus. Le Conducteur passe à
  `noUncheckedIndexedAccess` dans un lot à part (nombre d'erreurs à mesurer d'abord).
- **Lint** : un `eslint.config.js` racine (flat config) pour tout le TS/JS, avec les règles actuelles du Conducteur ;
  `no-explicit-any` en avertissement dans les tests. **Prettier : pas tout de suite** (le style dense est voulu ; un formatage global
  ferait un diff de dizaines de milliers de lignes) — à trancher (Q6). `max-len` en avertissement à 200 pour commencer.
- **Tests** : à côté du code (`*.test.ts`), comme aujourd'hui. Les tests lents (navigateur, `wrangler dev`) gardent leurs suffixes
  `*.edge.test.ts` / `*.integration*.test.ts` et ont leur propre projet vitest ; un test sauté pour cause d'environnement le dit dans le
  résumé, et une variable (`SR_EXIGER_TOUT=1`) les rend obligatoires sur le poste de régie.
- **Pages sans build** (tant qu'elles existent) : `// @ts-check` + JSDoc des messages importés de `protocole` (typage sans compilation).

### 4.3 Scripts npm racine

| Script | Fait |
|---|---|
| `dev` | Conducteur (Vite) |
| `dev:spectacle` | serveur de spectacle (port **8788** par défaut, C16) |
| `dev:serveur` | Worker (`wrangler dev`, 8787) |
| `test` | tous les tests **rapides** de tous les paquets (vitest workspace, `SR_SANS_SERVEUR=1`, `SR_SANS_NAVIGATEUR=1`) |
| `test:lent` | tests Edge et `wrangler dev` (poste Windows de régie) |
| `lint` | `eslint .` |
| `typecheck` | `tsc -b` (racine, références) |
| `verifier` | `verifier-projets` + générateurs en mode « vérifier sans écrire » |
| `pages` | `npm run pages -w conducteur` |
| `pages:verifier` | reconstruit dans `apps/conducteur/dist/pages-verif/` et compare la liste des fichiers hachés à `conducteur/` |
| `tout` | `lint`, `typecheck`, `test`, `verifier`, `pages:verifier` à la suite (avant un commit) |

### 4.4 CI GitHub Actions minimale (sans déploiement)

```yaml
# .github/workflows/verifier.yml
name: verifier
on:
  pull_request:
  push:
    branches: [main]
jobs:
  verifier:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test                 # rapides seulement : les tests Edge et wrangler restent sur le poste Windows
      - run: npm run verifier
      - run: npm run pages:verifier   # échoue si conducteur/ ne correspond pas aux sources
```
Préalables : lint vert (L3), `npm ci` propre (L16), scripts racine (L2), tests rapides séparés (L4).

### 4.5 Typer et valider `params` (sans concevoir le modèle à la place du chantier 1)

Aujourd'hui `params` mélange trois familles ; la cible les sépare **dans le format**, chacune avec son type et son contrôle :

| Famille | Exemples | Qui lit | Cible |
|---|---|---|---|
| Réglages du bloc | `delai`, `echeance`, `nom`, `op`, `valeur`, `poids`, `options`, `question`, `gabarit`, `boucle` | moteur, sortie, aperçus | `reglages` typé **par `ty`** (union discriminée), un schéma par bloc dans `packages/modele/src/params/<bloc>.ts` |
| Commandes vers un acteur | `cmds`, `sortie` | pont, sortie Écran scène | types de `packages/protocole` (`CommandeSpectacle`, `Scene`) ; dans le modèle du chantier 1, ce sont les **actions des nœuds acteurs** |
| Notes de régie | `ecran`, `plateau`, `telephones`, `outil`, `consigne`, `fiction`… | humains seulement | `notes: Record<string, string>` (texte libre assumé, jamais lu par la machine) |

Comment :
1. **Un schéma = un type** : un schéma par bloc et par message, d'où l'on **dérive** le type TS (pas de type écrit deux fois).
   Recommandation : **zod** (types dérivés, validation à l'exécution dans le Worker, le serveur de spectacle et le Conducteur,
   export JSON Schema pour générer l'éditeur de paramètres du panneau). Alternative sans dépendance : validateurs écrits à la
   main sur le modèle de `sortie/protocole.ts` (`sceneValide`, ligne 235) — c'est ce qu'on fait déjà, et c'est ce qui a produit les
   11 `as unknown as` et la dérive du protocole. À trancher (Q5).
2. **`validerParams(etape)`** appelé par `valider.ts` : clé inconnue → avertissement `param-inconnu` ; mauvais type → erreur
   `param-type` ; `cmds` invalide → erreur `commande-invalide`. Le cas « faute de frappe » du risque 2 devient une erreur affichée
   dans le Conducteur et dans `verifier-projets`.
3. Les lecteurs tolérants de `blocs-moteur.ts` (`reglagesGarde`…) **restent** comme repli pour les anciens fichiers, mais lisent
   l'objet typé ; plus aucune lecture de clé brute ailleurs (`options.ts`, `traduction.ts`, `regie.ts`, `pont-figurants.ts`).
4. **Plus de comportement par le nom** : `traduction.ts:124,142` (« noir », « qr », « accueil » dans `e.name`) → réglage explicite
   (`sortie: 'noir'`), avec une migration qui pose ce réglage pour les projets existants.
5. **Migration au chargement** (`valider.ts` charge déjà les fichiers `studio-real/conducteur@1`) : clés connues → `reglages`,
   `cmds`/`sortie` → commandes typées, le reste → `notes`. Changement de version du format (`@2`) **à décider avec le chantier 1**.
6. Tests : un test par schéma (valeurs bonnes, mauvaises, anciennes) + LIVE et Écho chargés sans erreur après migration.

### 4.6 Les générateurs d'Écho

Constat : deux générateurs, un seul fichier de sortie, le JSON embarqué dans le build, une adresse de tunnel dedans.

- **A — le JSON est la source de vérité** (recommandé à terme) : Écho s'édite dans le Conducteur, le fichier est validé par la CI
  (`verifier`), les générateurs partent en `archive/` après un dernier passage (si le propriétaire l'accepte). C'est cohérent avec
  le principe du studio : le Conducteur est l'outil d'écriture.
- **B — un seul générateur paramétré** : `generer-echo.ts --version simple|complet`, chaque version dans **son** fichier
  (`echo-simple.conducteur.json`, `echo-complet.conducteur.json`), aucun écrasement, validation **avant** écriture (refus si erreur),
  mode `--verifier` (régénère en mémoire et compare au fichier commis : utile en CI tant que les générateurs vivent).
- **C — garder les deux tels quels** : à éviter (risque 3).

Dans tous les cas, **l'adresse du serveur de spectacle sort du JSON** : les scènes `page` gardent un chemin relatif
(`/prototypes/figurants/pages/chat/`) et la base vient de la configuration de la sortie (même mécanisme que la retenue de
`?figurants=` dans `pont-figurants.ts`), réglable dans l'interface. Un nouveau tunnel ne demande alors ni régénération ni rebuild.
Recommandation : **B tout de suite** (petit, sûr), **A** quand le Conducteur saura éditer `cmds`/`sortie` avec les types de §4.5.
Le propriétaire doit trancher : quelle version est la référence, et si les retouches se font dans le Conducteur ou dans le code (Q3).

## 5. Lots de travail proposés

Estimations en heures d'un développeur. Coût indicatif d'exécution par agent : Qwen local 0 € ; Haiku 5.5 quelques centimes ;
Sonnet 5.5 environ 0,2 à 1 $ par lot ; Opus seulement pour les lots de conception. Total des lots délégables : environ 3 à 6 $ de crédits API.

| Lot | Objectif | Fichiers | Taille | Dépend de | Exécutant |
|---|---|---|---|---|---|
| **L1** | `.gitattributes` + `.editorconfig` + renormalisation (preuve : `git ls-files --eol` sans `w/crlf`) | racine | S (0,5 h) | — | Haiku 5.5 |
| **L2** | `tsconfig.base.json`, tsconfig racine en références, `projets/**/*.ts` inclus ; scripts racine (§4.3) ; corriger les 9 erreurs de `generer-echo-complet.ts` (ou l'exclure s'il est archivé) | `tsconfig*.json`, `package.json` | S-M (2-3 h) | L11 pour le complet | Sonnet 5.5 |
| **L3** | ESLint racine pour tout le TS/JS ; 25 erreurs → 0 (type du pilote CDP dans les tests, 3 corrections dans le code) ; README du Conducteur réécrit | `eslint.config.js`, tests edge, `Planche.tsx:456`, `calque.ts:69`, `kit.ts:14` | M (3 h) | L4 (pilote CDP) | Qwen local |
| **L4** | Tests rapides / lents séparés (vitest workspace), pilote CDP factorisé (88 lignes en double → `src/test-outils/cdp.ts`), sauts signalés | `vitest.workspace.ts`, `*.edge.test.ts`, `integration.serveur.test.ts` | M (3 h) | — | Qwen local |
| **L5** | CI GitHub Actions (§4.4) + `pages:verifier` | `.github/workflows/verifier.yml`, `apps/conducteur/package.json` | S (2 h) | L2, L3, L4, L16 | Sonnet 5.5 |
| **L6** | Thème unique : le Conducteur importe `@studio-real/theme` (réconcilier d'abord les 177 lignes d'écart), polices servies depuis `packages/theme/polices` | `apps/conducteur/src/theme/*`, `public/polices/`, `packages/theme/*` | M (4 h) | accord Q2 pour retirer les copies | Sonnet 5.5 |
| **L7** | Pages du spectacle : un « écran courant » au lieu des calques par z-index, couleurs en dur → jetons, doublon `.cd-piste-nom` | `pages/{chat,echo,ministre,visio}/*`, `conduite.css:167,241` | S-M (3 h) | — (inutile si L15 vient vite) | Qwen local |
| **L8** | `packages/protocole` : conception (messages relevés dans `jeu.mjs`, `PROTOCOLE.md` mis à jour, salle v1, sortie) | nouveau paquet, `PROTOCOLE.md` | M (2 h de conception) | chantiers 1-2 (protocole unique) | Claude (Opus) |
| **L9** | `packages/protocole` : réalisation ; suppression des copies `collab/protocole.ts` et `collab/ops.ts` ; tests d'aller-retour | `packages/protocole`, `apps/serveur/src/logique/*`, `apps/conducteur/src/collab/*`, `sortie/protocole.ts` | L (8 h) | L8 | Sonnet 5.5 |
| **L10** | `params` typés et validés (§4.5) : schémas par bloc, `notes`, `validerParams`, migration LIVE/Écho, fin du comportement par le nom | `packages/modele/src/{types,valider,blocs-moteur}.ts`, `params/`, `sortie/traduction.ts`, `blocs/options.ts` | L (10-12 h) | chantier 1, L8, Q5 | Claude (Opus) pour le schéma, Sonnet 5.5 pour la suite |
| **L11** | Générateurs : validation avant écriture, fichiers séparés, `--verifier`, adresse du serveur hors JSON, textes corrigés (7 blocs, 19 étapes) | `projets/echo/*`, `sortie/protocole.ts:167` | S (2 h) | Q3 | Sonnet 5.5 |
| **L12** | Pont du Conducteur : client commun (file d'attente + reconnexion), commandes typées, toutes les étapes du moment, tests | `coquille/pont-figurants.ts` | M (4 h) | L9 ; chantier réseau | Sonnet 5.5 |
| **L13** | Tests unitaires du serveur de spectacle sans port (vote truqué, `tel`, `ecran`, `junon`, `choix`) | `prototypes/figurants/serveur/jeu.mjs` + `jeu.test.mjs` | M (4 h) | — | Qwen local |
| **L14** | Rangement : `archive/` pour ce que le propriétaire aura accepté (Q2) ; retrait du greffon `policesPrivees` mort | selon Q2, `vite.config.ts:7-29` | S (1-2 h) | **accord explicite, fichier par fichier** | Haiku 5.5 |
| **L15** | Restructuration : `prototypes/figurants` → `apps/serveur-spectacle` + `apps/telephone` + `apps/ecrans` + `packages/ui-telephone` | voir §4.1 | L (12 h et plus) | L8, L9, Q8, Q9 | Claude (Opus) pour le plan, Sonnet 5.5 pour l'exécution |
| **L16** | Hygiène des dépendances : `.nvmrc` + `engines`, `@types/node` aligné sur la version de Node choisie (Q7), `@types/qrcode` en dev, serveur figurants dans les workspaces (un seul lockfile), `npm ci` propre (plus d'extraneous) | `package.json` ×4, lockfiles | S (1 h) | Q7 | Haiku 5.5 |
| **L17** | Ports par défaut distincts (Worker 8787, spectacle 8788) + message clair si le port est occupé | `index.mjs:20`, READMEs | S (0,5 h) | — | Haiku 5.5 |

Ordre conseillé : L1, L16, L17 (sans risque) → L4, L3, L2 → L5 (la CI protège la suite) → L11 → L8 → L9, L12, L13 → L6, L10 → L14, L15.
Deux agents en parallèle seulement sur des fichiers disjoints (par exemple L4 sur un serveur DGX, L13 sur l'autre).

## 6. Questions au propriétaire

1. **Fichiers apparus vers 19:21 le 28/10** (`STUDIO_REAL/`, `kit-theme-showrunner/`, `package-claude-design.zip`, `patch_page.cjs`) :
   sont-ils à toi ? À ignorer (`.gitignore`), à committer, ou à déplacer hors du dépôt ? Je n'y ai pas touché.
2. **Archive** : lesquels de ces éléments peuvent aller dans `archive/` (rien ne bouge sans ton accord, fichier par fichier) ?
   `design/` ; `conception/` (ou seulement les 3 documents en double de `docs/`) ; `prototypes/scene-pops/` (porté dans le calque) ;
   `prototypes/banc-essai/` et `prototypes/clavier/` (encore liés depuis `index.html`) ; `prototypes/figurants/pages/telephone/` ;
   `prototypes/figurants/serveur/secours/` (diverge de `banques/`) ; `generer-echo-complet.ts` ; les copies de polices hors
   `packages/theme/polices/` (Venus Rising reste versionnée dans `packages/theme`).
3. **Écho** : la version de référence est-elle la simple (19 étapes) ou la complète (138) ? Les retouches se feront-elles dans le
   Conducteur (le JSON devient la source, cible A) ou dans le code (générateur unique, cible B) ?
4. **GitHub Pages** : garder le build commis dans `conducteur/` (avec la vérification de la CI) ou, plus tard, publier par une Action ?
   Le dépôt est-il public ? Pages expose aujourd'hui toute la racine (`DEROULE-AUTEUR.md`, banques, documents).
5. **Validation** : d'accord pour ajouter **zod** (modèle, protocole, Worker et serveur de spectacle), ou préfères-tu zéro dépendance
   et des validateurs écrits à la main ?
6. **Prettier** : formatage automatique de tout le dépôt (un gros commit de mise en forme) ou on garde le style actuel avec ESLint seul ?
7. **Version de Node** cible pour le poste de régie, les DGX et la CI : 24 (installée) ou 26 (`@types/node ^26`) ?
8. **Sortie Écran scène** : reste-t-elle dans `apps/conducteur` (aujourd'hui `sortie.html`) ou devient-elle une app à part ?
9. **Pages du public** : acceptes-tu qu'elles passent par un build (Vite + TypeScript, paquet `ui-telephone`), ou doivent-elles
   rester des fichiers servis tels quels ?
10. **Noms** : renommer `apps/serveur` en `apps/serveur-conducteur` et le prototype en `apps/serveur-spectacle` ?

## Annexe — commandes lancées et résultats bruts

| Commande (depuis `C:\STUDIO_REAL`) | Code | Durée | Résultat |
|---|---|---|---|
| `npm test` | 0 | 14 s | 5 fichiers, 80 tests |
| `npm test -w conducteur` | 0 | 64 s | 17 fichiers, 180 tests (lance `wrangler dev` et Edge sans tête le temps des tests) |
| `npm run lint -w conducteur` | 1 | 34 s | 38 problèmes (25 erreurs, 13 avertissements) |
| `npx tsc -b apps/conducteur --noEmit` | 0 | 18 s | 0 erreur |
| `npm run typecheck -w serveur` | 0 | 7 s | 0 erreur |
| `npx tsc --noEmit -p packages/modele` | 0 | 5 s | 0 erreur |
| `npm run test:logique -w serveur` | 0 | 4 s | 3 fichiers, 23 tests |
| `npm run verifier-projets` | 0 | 4 s | 0 erreur, 1 avertissement (Écho) |
| `npx tsx projets/echo/generer-echo-simple.ts` | 0 | 2,6 s | JSON identique (`git diff --stat` vide) |
| `tsc --strict --noEmit` sur `projets/echo/*.ts` | 2 | 4,5 s | simple 0 erreur, complet 9 erreurs |
| `vite build --base ./ --outDir dist/audit-pages` (Conducteur) | 0 | 12 s | mêmes fichiers hachés que `conducteur/assets/` (dossier effacé ensuite) |
| `git ls-files --eol` | — | — | index : 406 LF, 35 binaires ; copie de travail : 92 CRLF, 1 mixte, 313 LF |
| `npm ls --depth=0` | — | — | 3 extraneous : `@emnapi/runtime`, `@img/sharp-wasm32`, `tslib` |
| `npx depcheck` | — | — | non lancé (non installé ; aucune installation faite) |
