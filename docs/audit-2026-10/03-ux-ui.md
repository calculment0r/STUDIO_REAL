# Chantier 3 — Fluidité de l'interface (UX/UI) du Conducteur

Audit du 28/10/2026, branche `audit/2026-10`. Périmètre : le Conducteur (`apps/conducteur`) vu depuis la régie du
spectacle « Écho » du 27/10, la sortie Écran scène, la planche, la conduite, le thème (`packages/theme`, Venus Rising).
Aucun fichier du dépôt n'a été modifié hors de ce rapport. Mesures faites : `npm run build -w conducteur` (taille des
morceaux, §2.3) et un banc du moteur hors navigateur (script dans le dossier temporaire de la session, pas dans le
dépôt). Aucun serveur lancé : les re-rendus React sont déduits du code (abonnements), **pas mesurés au Profiler**.

## 1. Résumé

1. La « latence » vécue le 27/10 vient d'abord du **modèle de lecture**, pas de la machine : chaque top ouvre une étape
   d'au moins **10 s** (`dureeEtape`, plancher du modèle) pendant laquelle le TAP est grisé ; à ×20 cela durait 0,5 s,
   d'où le ×20 par défaut, et le passage au temps réel a rendu ces 10 s visibles.
2. La pause automatique sur les losanges et le TAP sont des rustines : elles gèlent l'horloge et le retard, perdent la
   fin de vidéo, et laissent **quatre boutons GO aux effets différents** (le GO de l'en-tête et la touche T entrent dans le
   cue suivant sans le jouer ; pendant une étape, T « arme », et un double appui saute un cue).
3. Le clic dans la conduite **déplace la vraie lecture** (et renvoie les ordres aux téléphones) sans garde ni
   confirmation ; toute modification du projet en représentation **rejoue le cue en cours**.
4. La « mire » est une sortie périmée qui rejette en silence la scène `page` (protocole non versionné), pendant que la
   vignette de la régie affiche la scène publiée (noire pour `page`) et une pastille verte.
5. Le coût React est réel (re-rendu à 60 Hz de l'en-tête, de la planche, du panneau, du pupitre régie) et la sortie tourne
   dans le même processus que la régie, avec Pixi toujours actif : à corriger en P1, après le modèle de lecture.
6. Cible : **GO unique** (Espace, TAP, OSC), horloge toujours en temps réel en SPECTACLE, attente du top = un état
   (ambre) et non une pause, RETENIR / SAUTER À… / +30 s / PAUSE dans une barre de scène, ×20 réservé à la RÉPÉTITION,
   clic de règle = repérage. 7 lots P0 (≈ 36 h), 6 lots P1, 3 lots P2.

## 2. Constats

### 2.1 Les parcours de la régie le 27/10 (inventaire, frictions, causes)

| Étape | Ce que la régie a fait | Frictions | Cause dans le code |
|---|---|---|---|
| **Ouvrir le projet** | `…/conducteur/?projet=echo`, ou fenêtre PROJET → SPECTACLE ÉCHO | Chaque correction d'Écho (URL du tunnel, sorties) = régénérer le JSON, reconstruire, publier sur Pages, attendre le cache ; recharger avec `?projet=echo` **réimporte l'embarqué et écrase la version locale** ; au rechargement, la position dans le spectacle est perdue (retour au moment 1) | Projet embarqué au build (`coquille/projet-live.ts:13-16`) ; `coquille/App.tsx:113` + `projet-live.ts:24` (`importer`) à chaque chargement ; `etat/magasin.ts:465` (`revenirAuDebut()` au chargement) ; URL du tunnel en dur dans `projets/echo/generer-echo-simple.ts:66` |
| **Relier le serveur du spectacle** | Coller `?figurants=wss://…/ws&jeton_regie=…` dans l'adresse | Aucun champ, aucun voyant : un toast seulement ; le jeton reste dans la barre d'adresse et l'historique ; nouveau tunnel à chaque lancement = nouvelle adresse à fabriquer à la main ; le toast « Spectacle relié » revient à chaque reconnexion (toutes les 2 s si le tunnel tombe) | `coquille/pont-figurants.ts:12-25` (lecture de l'adresse, `localStorage`, pas de `history.replaceState`, `setTimeout(ouvrir, 2000)`) |
| **Ouvrir la sortie** | Icône « écran » de l'en-tête (15 px, sans libellé), glisser sur le projecteur, F ou double-clic | Mire au lieu du mur ou de la visio ; vignette noire pour les scènes `page` ; pastille verte quand même ; une fenêtre déjà ouverte n'est jamais rechargée ; son de la visio à débloquer **sur le projecteur** | §2.2, C13 à C17 |
| **Lancer** | TAP « ▶ » ou Espace ; vitesse ×20 par défaut jusqu'à `6752dea` (17:09), puis ×1 | À ×20 tout défile (chronos de la sortie compris) ; à ×1 chaque étape dure 10 s minimum | `etat/magasin.ts:316` ; `packages/modele/src/types.ts:161` ; `sortie/traduction.ts:246` |
| **Taper les tops** | Gros TAP (`a9fe965`, 18:03), pause automatique (`68590f1`, 18:09) | TAP grisé 10 s après chaque top ; le GO de l'en-tête, la touche T et le pupitre n'ont pas le même effet que le TAP ; double appui = cue sauté ; Espace n'est pas GO | §2.2, C1 à C5 |
| **Gérer la visio, le vote, Junon, le mur** | Hors du Conducteur : `pages/regie` (prototype figurants) et la page `eco` de Franck | Deux conduites à tenir (le Conducteur et la « conduite écho » du prototype) ; vote, Junon, écran MUR / NOIR, arrêt audio, densité des figurants, modération, son de Franck : rien n'est pilotable dans le Conducteur | `prototypes/figurants/pages/regie/regie.js:554-576` (liste de 18 taps codée en dur) ; `pages/visio/visio.js:88-95` (son de Franck réglé dans la page projetée) ; `pages/eco/index.html` (appel ElevenLabs sur le poste de Franck) |

Ce que la régie a dû faire ailleurs (pages/regie) et qui manque au Conducteur : densité, humeur, relance, vague, chut et
COUPE des figurants, choix du fournisseur et contrôle de chauffe, segment, file « à valider », prise de la main d'un
persona, chat complet et transcription, vote (ouvrir n°, révéler, fermer, détail), Junon (lancer, arrêt), président,
écran MUR / NOIR, télémétrie (p50 / p95, coût). Une partie est déjà dans les `params.cmds` des étapes d'Écho, mais
sans aucun retour (envoyé ? reçu ? affiché ?).

### 2.2 Constats numérotés

Chemins relatifs à `apps/conducteur/src/` sauf mention contraire.

**A. Modèle de lecture et tops**

**C1 — La pause automatique gèle l'horloge, le retard et la fin de vidéo.** P0
Preuve : `etat/magasin.ts:240` `else if (e.attenteGo) set({ enLecture: false });` (commit `68590f1`, 18:09).
Conséquences : l'attente du top n'avance plus `retard` ni `attentes` (le moteur ne compte que dans `avancer()`,
`packages/modele/src/lecteur.ts:511-516`), alors que le design veut une attente « mesurée, hachurée et cumulée dans
retard » (`conception/conducteur/LISEZMOI-claude-code.md:17`) ; la sortie reçoit `enLecture: false` et fige ses compteurs
(`sortie/traduction.ts:246`) ; **la fin de vidéo est jetée** quand la lecture est arrêtée (`sortie/useRelaisSortie.ts:57`
`if (s.enLecture) s.envoyerSignal('video.fin', …)`) : un passage « à la fin de la vidéo » (Junon, `projets/echo/LISEZMOI.md`,
décision 2) ne peut plus partir pendant une attente ; le cadre « EN LECTURE » s'éteint à chaque losange.
Impact 27/10 : horloge et retard faux pendant tout le spectacle ; rustine posée une heure avant le jeu.

**C2 — Une étape dure au moins 10 s : c'est la « latence » principale.** P0
Preuve : `packages/modele/src/types.ts:161` `dureeEtape = Math.max(10, (e.k[0] ?? 0) * 6 + 10)` ; Écho simple met une
seule étape `k: [0, 50, 50]` par moment (`projets/echo/generer-echo-simple.ts:82`, commentaire « 10 s puis ATTENTE DU
TOP ») ; le TAP est grisé tant que la lecture tourne (`coquille/BoutonTap.tsx:12` `const actif = !enLecture`).
Impact 27/10 : après chaque top, 10 s pendant lesquelles le TAP ne répond pas (« en cours : … ») ; à ×20 (défaut jusqu'à
`6752dea`) ces 10 s faisaient 0,5 s, ce qui explique le ×20 par défaut. Le moteur, lui, est rapide (banc, §2.3).

**C3 — Quatre GO, quatre comportements ; l'armement fait sauter des cues.** P0
Preuve : TAP = `top()` puis `lancer()` (`coquille/BoutonTap.tsx:18`) ; GO de l'en-tête (`coquille/EnTete.tsx:111`), GO du
pupitre (`coquille/Superpositions.tsx:166`), « TOP · GO » du panneau (`coquille/Panneau.tsx:413`) et touches T / G
(`coquille/raccourcis.ts:61`) = `top()` seul. Avec la pause automatique, `top()` entre dans le moment suivant (le pont
envoie ses ordres) **mais laisse la lecture arrêtée** : l'étape ne joue pas avant un second appui (TAP « ▶ » ou Espace).
Pendant une étape, `top()` **arme** le passage (`etat/magasin.ts:291-293`, consommé l. 233-234) : il passera seul à la
fin de l'étape ; deux appuis rapprochés (un pendant l'étape, un à l'attente) font sauter un cue.
Impact 27/10 : « la lecture n'attendait pas les tops » est cohérent avec l'armement ; le TAP grisé en a été la parade.

**C4 — Espace n'est pas GO.** P0
Preuve : `coquille/raccourcis.ts:60` Espace = `basculerLecture()` ; la conception veut « barre d'espace = GO, comme QLab »
(`docs/05-regie-et-studio.md:60`, `docs/etudes/editeur-nodal-timeline.md` §3.2). Pendant une attente, Espace relance une
image, puis la pause automatique recoupe : touche morte.

**C5 — L'état de la représentation n'est pas affiché.** P0
Preuve : `coquille/EnTete.tsx:46-51` calcule PRÊT / TERMINÉ / ATTENTE DU TOP / BLOQUÉ / EN LECTURE / EN PAUSE et sa
couleur, mais ne s'en sert que comme infobulle de l'horloge (`EnTete.tsx:105` `title={etat[0]}`) ; la couleur et la
pulsation calculées ne sont jamais utilisées.
Impact : la régie ne voit pas d'un coup d'œil si l'on attend son top.

**C6 — La vitesse ×20 / ×60 est à un clic, en représentation, et elle atteint la sortie.** P1
Preuve : `coquille/EnTete.tsx:100-104` (boutons ×1 ×20 ×60 toujours actifs, mode JOUER compris, sans témoin) ; la vitesse
est passée aux compteurs projetés (`sortie/useRelaisSortie.ts:34`, `sortie/traduction.ts:246`). Défaut ×20 jusqu'à
`6752dea` (`etat/magasin.ts:316`).

**C7 — Modifier le projet pendant la représentation rejoue le cue en cours.** P0
Preuve : toute modification (`modifierProjet`, `etat/magasin.ts:255-262` → `revision++` l. 222), un changement de mode
(l. 264-269) ou un projet reçu de la salle (l. 414-417) recrée le lecteur, replacé par `allerA` (l. 154-172) ;
`entrerMoment` et `entrerEtape` remettent `tEtape` à 0 et vident les signaux reçus (`packages/modele/src/lecteur.ts:184-205`) ;
pendant une attente de top (`etape === null`), le nouveau lecteur **rentre dans le moment par sa première étape**. Le mode
par défaut est JOUER (`etat/magasin.ts:246`), le verrou SCÈNE est éteint par défaut (`etat/magasin.ts:357`) et la
planche reste éditable en JOUER (`planche/Planche.tsx:57-58`).
Impact : un bloc déplacé, un renommage ou un collègue connecté à la salle pendant l'attente du top = l'étape repart pour
10 s et le TAP redevient « ▶ ».

**B. Barre de temps et sauts**

**C8 — Un clic dans la conduite déplace la vraie lecture et renvoie les ordres.** P0
Preuve : `conduite/Conduite.tsx:258-268` (`appuiCorps`, posé sur tout le corps l. 428) appelle `aller()` → `allerA()`
(l. 233-244) au premier clic puis à chaque mouvement du glisser ; aucune vérification du mode ni du verrou (le verrou ne
bloque que `modifierProjet`). `allerA` place la tête au début prévu du moment (`packages/modele/src/lecteur.ts:537`) :
recul visible. Écho n'a aucune piste, toute la conduite est donc « du vide » cliquable, et le TAP flotte au-dessus
(`coquille/coquille.css:409`, `position: fixed; bottom: 18px`) : un clic à côté du TAP recule la cue. Le pont réagit au
changement de moment (`coquille/pont-figurants.ts:31-40`) : chaque moment traversé par un glisser envoie ses ordres aux
téléphones, au mur et au vote. Même effet, sans confirmation : clic sur une étape en PRÉPARER (`planche/Planche.tsx:356`),
recherche (`coquille/Recherche.tsx:51`), « ALLER À CE MOMENT » (`coquille/Panneau.tsx:253`).
Impact 27/10 : « clic dans la barre de temps qui fait reculer la cue ».

**C. Latences et performance**

**C9 — La lecture re-rend une grande partie de l'interface à chaque image.** P1
Preuve : la boucle `requestAnimationFrame` (`etat/magasin.ts:442-461`) publie à chaque image un **nouvel objet** `lecture`
(`publier`, l. 188-192). Sont abonnés à `s.lecture` entier, donc re-rendus à 60 Hz pendant la lecture : `EnTete`
(`coquille/EnTete.tsx:23`, plus `useInterface()` sans sélecteur l. 33), `BoutonTap` (l. 6), `OuEnEstOn` avec la vignette
de sortie (`coquille/Panneau.tsx:387`, 414), **la planche entière** (`planche/Planche.tsx:49` ; l'objet `actif` est recréé
à chaque image l. 618, donc le `MomentPlanche` courant aussi), le pupitre ouvert (`coquille/Superpositions.tsx:117`),
l'alerte de sécurité (`t`, l. 30), les commentaires (`collab/Commentaires.tsx:22`). Le pupitre régie, **ouvert par
défaut** (`coquille/interface.ts:43`, `g: true`), lit `s.lecture?.memoires` et `s.lecture?.reprises`
(`coquille/Regie.tsx:110-111`), recopiés à chaque appel de `lecteur.etat()` (`packages/modele/src/lecteur.ts:157-176`) :
nouvelle référence à chaque image, re-rendu à 60 Hz. `situation()` et `signauxSalle()` sont recalculés dans chaque rendu
(`EnTete.tsx:31`, `Panneau.tsx:388`, `Superpositions.tsx:120`). Seule la tête de lecture de la conduite est isolée
(`conduite/TeteDeLecture.tsx`, abonnement hors React) : c'est le bon modèle.
Banc du moteur (§2.3) : 0,01 ms par image ; le coût est dans React. **À confirmer au Profiler** (lot L8).

**C10 — La sortie partage le processus de la régie, et son calque Pixi ne s'arrête jamais.** P1
Preuve : `sortie/fenetre.ts:38` `window.open('', NOM_FENETRE, 'popup…')` sans `noopener` : régie et sortie sur la même
machine (cas du 27/10, canal local) appartiennent au même groupe de navigation et partagent en pratique le même fil
principal ; le ticker Pixi tourne en permanence (`sortie/calque/calque.ts:81`), le calque n'étant que rendu transparent
pour `page`, `noir`, QR et chrono (`sortie/page.tsx:264`, 317) ; les aperçus animés de la planche tournent à ≈ 30 images/s
même en JOUER (`blocs/boucle.ts:31-43`). Hypothèse forte (non mesurée) pour les saccades et les vidéos lentes à démarrer
sur la sortie pendant qu'une iframe porte la visio WebRTC.

**C11 — Chaque modification copie et écrit tout le projet.** P2
Preuve : `structuredClone` du projet (`etat/magasin.ts:258`) puis écriture synchrone de tout le projet en `localStorage`
(`etat/magasin.ts:468-470`) à chaque modification, gestes continus compris. Sensible sur LIVE (114 ko de JSON), pas sur Écho.

**C12 — La taille du code n'est pas en cause.** P2 (constat rassurant)
Preuve : §2.3. Régie : ≈ 600 ko (≈ 200 ko gzip) au premier chargement ; Pixi (333 ko) n'est chargé que par la sortie, à
la demande (`sortie/page.tsx:250`). Seul défaut : Venus Rising est chargée après coup, sans préchargement
(`theme/polices.ts:7-24`, rien dans `index.html`) : les titres passent de Chakra Petch à Venus Rising après l'affichage.

**D. Sortie Écran scène**

**C13 — La mire : une sortie périmée rejette en silence la scène `page`.** P0
Preuve : la scène `page` est ajoutée à 18:07 (`72b32bc`, `sortie/protocole.ts` : `TYPES_SCENE` et `sceneValide`) sans
changer `VERSION_SORTIE` (toujours `1`, `sortie/protocole.ts:30`). Une sortie chargée avant (fenêtre restée ouverte, ou
HTML en cache) juge le message invalide et l'ignore sans rien dire (`sortie/page.tsx:168` `if (!m) return;`) ; elle garde
la scène précédente, et la scène par défaut d'un moment hors acte 0 est `streamer` (`sortie/traduction.ts:289`), dont
l'écran sans flux est la mire « EN ATTENTE DU FLUX DU STREAMER » (`sortie/scenes.tsx:257`).

**C14 — Le correctif `?v=` ne recharge pas une fenêtre déjà ouverte ; la régie elle-même reste en cache.** P0
Preuve : `sortie/fenetre.ts:11` ajoute `?v=Date.now()` (commit `68590f1`), mais une fenêtre du même nom est reprise **sans
rechargement** (`fenetre.ts:33` et 36-42 : `if (vierge) w.location.href = url`). GitHub Pages sert tout avec un cache
d'environ 10 min, `index.html` de la régie compris ; `npm run pages` vide `conducteur/` à chaque publication
(`apps/conducteur/package.json:12`, `--emptyOutDir`) : une page en cache peut demander des fichiers supprimés.
Pas de service worker (vérifié : aucune occurrence dans `apps/conducteur/src`, `conducteur/`, `prototypes/figurants/pages`).
Six publications de `conducteur/` entre 17:09 et 18:10 le 27/10 (journal git).

**C15 — Le retour d'état de la sortie trompe la régie.** P0
Preuve : la vignette montre la scène **publiée** (`sortie/ApercuSortie.tsx:1-2`), noire pour `page` en miniature
(`sortie/scenes.tsx:133-135`) ; la sortie renvoie pourtant ce qu'elle montre (`sceneVue`, `sortie/relais.ts:145`), mais
seul le moniteur du streamer s'en sert (`streamer/page-moniteur.ts:26`) ; la pastille verte du bouton veut dire
« battement reçu » (`sortie/BoutonSortieScene.tsx:34-36`), pas « la bonne scène est à l'écran ».

**C16 — La visio et les pages se règlent sur le projecteur ; l'adresse est en dur.** P1
Preuve : le son de Franck et « son bloqué » sont des boutons de la page projetée
(`prototypes/figurants/pages/visio/visio.js:88-95`) ; l'iframe `page` n'a ni détection d'erreur ni rechargement
(`sortie/scenes.tsx:133-135`, fond `'#000'` en dur) ; l'adresse du tunnel est codée dans le générateur
(`projets/echo/generer-echo-simple.ts:66`). Un enchaînement MUR → NOIR → MUR recrée l'iframe du mur (clé de scène,
`sortie/scenes.tsx:85-90`) : reconnexion WebSocket, et nouvelle négociation WebRTC pour la visio.

**C17 — Ouvrir la sortie demande trois gestes et ne dit pas lesquels.** P1
Preuve : bouton icône sans libellé (`sortie/BoutonSortieScene.tsx:47-73`) ; plein écran et son exigent un geste sur la
fenêtre projetée (F ou double-clic, en-tête de `sortie/page.tsx`) ; aucun guide côté régie.

**E. Pont vers le serveur du spectacle**

**C18 — Le pont envoie sur « le moment a changé », pas sur « la régie a donné un top ».** P0
Preuve : `coquille/pont-figurants.ts:31-40` s'abonne au magasin et envoie les `params.cmds` de la **première étape** du
moment dès que `lecture.moment` change. Donc aussi : `allerA` (C8), re-création du lecteur (C7), import d'un projet, et
le **chargement de la page** (`dernier = null` : à la première modification du magasin, les ordres du moment 1 partent
si le WebSocket est déjà ouvert, sinon le toast « ⚠ Spectacle NON relié » s'affiche). Aucun voyant de liaison ; jeton
dans l'adresse ; reconnexion toutes les 2 s avec un toast à chaque fois (l. 24-25). Pas d'accusé : la régie ne sait pas
si le mur a reçu l'ordre.

**C19 — Deux conduites tenues en parallèle.** P0
Preuve : la « conduite écho · un tap = un top » de `prototypes/figurants/pages/regie/regie.js:554-576` contient les mêmes
ordres que les `params.cmds` d'Écho (`projets/echo/generer-echo-simple.ts:24-62`). Taper dans les deux envoie deux fois
(un second `vote.cmd ouvrir` réinitialise-t-il le vote ? à vérifier côté serveur, chantier 2).

**F. Modes et lisibilité**

**C20 — Trois notions de « scène » qui ne se recouvrent pas.** P1
Preuve : PRÉPARER / JOUER (`coquille/EnTete.tsx:16-19` : seulement la caméra et la graine du lecteur,
`etat/magasin.ts:157`), le verrou SCÈNE (local, `etat/magasin.ts:357-362`), les modes de la salle Écriture / Répétition /
Scène (`collab/BoutonsVerrou.tsx:14`). Défaut : JOUER **et** non verrouillé. La conception prévoyait des modes clairs,
chacun avec son repère (`docs/brief-claude-design.md` §1.2 : pastille acier « RÉPÉTITION · ×10 », trait orange « LIVE »).
En dessous de 1180 px, vitesse, recherche et pupitre disparaissent ; en dessous de 1270 px, le fil « où en est-on » aussi
(`coquille/coquille.css:98-102`).

**C21 — Plusieurs oranges pleins, et le TAP couvre la conduite.** P1
Preuve : GO de l'en-tête (`.go.pret`, `coquille/coquille.css:96`), TAP (`.tap-geant.pret`, l. 414), « TOP · GO » du
panneau, GO du pupitre ; la règle est « un seul orange plein par écran = l'action » (`docs/brief-claude-design.md:341`).
Le TAP est posé en surimpression fixe (l. 409-411) sur la conduite ; ombre `rgba(0,0,0,.5)` en dur (l. 414).

**G. Planche**

**C22 — En JOUER, la caméra dézoome et rezoome deux fois par cue.** P1
Preuve : pendant l'attente, le cadrage vise le moment **et le suivant** (`planche/Planche.tsx:149`, `unionRect`) ; à
l'entrée du suivant, le moment seul (clé de suivi, l. 194) ; le zoom calculé (`planche/geometrie.ts:74-80`) traverse les
seuils sémantiques (50 % et 100 %, `geometrie.ts:29-37`), et la hauteur des blocs passe de 56 à 164 à 292 px. Chaque
pas de caméra pousse aussi le zoom dans le magasin (`Planche.tsx:130`). Tout geste de l'utilisateur coupe le suivi.
Impact 27/10 (probable) : le « zoom de la planche » qui pompe à chaque top.

**C23 — La molette ne veut pas dire la même chose en haut et en bas.** P1
Preuve : planche : molette = zoom pour une souris, mais **panoramique** si `|deltaY| < 40` (pavé deviné,
`planche/Planche.tsx:224`) ; une souris à défilement fin est prise pour un pavé ; conduite : molette = défilement
horizontal, Alt / Ctrl + molette = zoom (`conduite/Conduite.tsx:2`). F = plein écran, ou recadrer si la planche a le focus.

**C24 — Lisibilité de la planche en spectacle.** P2
Preuve : en vue d'ensemble (< 50 %), l'étiquette « P{n} · top régie » des losanges disparaît (`planche/Planche.tsx`,
rendu des passages, `niveau !== 'loin'`) ; le bandeau « ÉTAPE BLOQUÉE » ne s'affiche que si la lecture tourne
(`lecture?.bloque && enLecture`) ; rien n'indique sur la planche ce qui **partira** au prochain GO (ordres aux
téléphones, scène de la sortie).

**H. Thème**

**C25 — Couleurs en dur hors des jetons.** P2
Preuve : palette des blocs en hexadécimal (`blocs/palette.ts:10-32`, `blocs/catalogue.ts:56-63`, `blocs/apercus.ts:256`),
`'#000'` (`sortie/scenes.tsx:135`), `rgba(0,0,0,.5)` (`coquille/coquille.css:414`).

**C26 — Thème dupliqué, documentation contradictoire sur Venus Rising.** P2
Preuve : le Conducteur garde sa copie (`theme/*.css`) au lieu de pointer sur `packages/theme` (README du paquet, l. 4-6 :
« ou, mieux, le Conducteur pointe sur ce paquet ») ; `apps/conducteur/vite.config.ts:7-9` et `packages/theme/README.md`
(section « Venus Rising ») disent « jamais dans le dépôt », alors que `venus-rising.otf` est versionnée
(`apps/conducteur/public/polices/`, `packages/theme/polices/`, `conducteur/polices/`, commit `88e2925`, à la demande du
propriétaire) et chargée par `theme/polices.ts:5`.

### 2.3 Mesures

`npm run build -w conducteur` (28/10, Vite 6.4.5, sortie dans `apps/conducteur/dist`, ignoré par git) :

| Morceau | Taille | gzip | Chargé par |
|---|---|---|---|
| `main-*.js` | 296,9 ko | 102,3 ko | régie |
| `scenes-*.js` (React, scènes partagées) | 275,3 ko | 89,5 ko | régie et sortie |
| `salle-*.js` + `relais-*.js` | 23,1 ko | 9,2 ko | régie |
| `main-*.css` | 63,1 ko | 10,4 ko | régie |
| `calque-*.js` (Pixi) + moteurs de rendu | 333 + 74 + 56 + 54 ko | ≈ 155 ko | sortie seule, à la demande |
| `live.conducteur` / `echo.conducteur` | 54 / 13 ko | 14 / 2 ko | à l'ouverture du projet |

Banc du moteur (`creerLecteur`, puis à chaque image `etat()` + `avancer()` comme `avancerLecture`, 60 images/s, top
après 5 s d'attente) : LIVE, 76 min simulées, **0,009 à 0,014 ms par image**, stable du début à la fin ; Écho, 280 s.
Conclusion : le moteur et la copie d'état ne coûtent rien à cette échelle ; la latence vient du modèle (C2, C3) puis du
rendu React et du partage de processus (C9, C10).

## 3. Risques (prochain spectacle, si rien n'est fait)

1. **Cue sauté ou rejoué** : double GO armé (C3), modification pendant l'attente (C7), clic dans la conduite (C8) ; avec le
   pont, chaque erreur part **sur les téléphones du public** (C18).
2. **Ordres envoyés au rechargement** de la régie : retour au moment 1 et, selon l'ordre de connexion, téléphones renvoyés
   sur « Regardez la vidéo », mur sur le QR, vote fermé (C18, `etat/magasin.ts:465`).
3. **Projecteur sur la mire** après toute publication du jour même (C13, C14), sans que la régie le voie (C15).
4. **Fin de vidéo perdue** (Junon) tant que la pause automatique existe (C1).
5. **Chrono projeté à ×20** si la vitesse est restée sur ×20 après une répétition (C6).
6. **Régie à deux tableaux de commande** (Conducteur + pages/regie) avec double envoi possible (C19).
7. Sur un portable de régie à 1366 px avec mise à l'échelle 125 %, vitesse, pupitre et fil disparaissent de l'en-tête (C20).

## 4. Proposition cible

### 4.1 Le modèle de lecture (un seul concept pour « attendre le top »)

```
                     GO (Espace · TAP · OSC)
  ┌──────┐   GO    ┌─────────────┐  fin d'étape + conditions  ┌──────────────────┐   GO   ┌─────────────────┐
  │ PRÊT │───────▶ │ EN LECTURE  │──────────────────────────▶ │ ATTENTE DU TOP   │──────▶ │ EN LECTURE      │
  └──────┘         │ (vert)      │   passage « go » du moment  │ (ambre ; horloge │        │ (cue suivant)   │
                   └──────┬──────┘                              │  qui tourne,     │        └─────────────────┘
                     PAUSE│ ▲ REPRENDRE                         │  retard compté)  │
                          ▼ │                                   └──────────────────┘
                   ┌─────────────┐   RETENIR : le prochain passage « auto » devient une attente du top
                   │ EN PAUSE    │   SAUTER À… : confirmation ; ordres du moment cible envoyés ou non (case)
                   │ (ambre fixe)│   +30 s : prolonge l'étape ou le garde-fou en cours
                   └─────────────┘
```

Règles :

1. **L'attente du top est un état, pas une pause.** Le passage `gate.mode === 'go'` du modèle est le seul « attend le
   top ». L'horloge tourne, `retard` et `attentes` s'accumulent, la sortie et les fins de vidéo restent vivantes. La pause
   automatique (`etat/magasin.ts:240`) disparaît.
2. **GO = « le cue suivant, maintenant ».** Une action `go()` du magasin, partagée par Espace (en SPECTACLE), le TAP, le
   GO de l'en-tête, le pupitre et une future entrée OSC. Effet : si un passage attend, le franchir ; sinon, si l'étape en
   cours mène à un passage « go » (cas d'Écho), forcer la sortie de l'étape (`Lecteur.top()` en phase étape) puis franchir
   le passage dans la même action ; si la lecture était arrêtée, la lancer. Résultat : un appui = un cue, toujours.
3. **Plus d'armement implicite.** Un GO pendant une étape ne s'enregistre plus « pour plus tard ». Protection contre le
   double GO : 800 ms après un GO, un second est ignoré et le bouton affiche « GO ✓ » (réglable dans le projet).
4. **Étape « jusqu'au top ».** Le plancher de 10 s (`packages/modele/src/types.ts:161`) doit pouvoir être levé pour une
   étape qui n'a pas d'autre rôle que d'attendre le top (demande au chantier 1). En attendant, la règle 2 suffit.
5. **RETENIR** (touche H) : le prochain passage, même « auto », attend le top (pastille ambre « RETENU »). **SAUTER À…**
   (Ctrl+G ou bouton) : la recherche des moments, puis une confirmation en SPECTACLE (« Sauter à « Q3 · réponses » ?
   ☑ envoyer les ordres de ce moment »). **+30 s** : nouvelle entrée du lecteur `prolonger(s)` (chantier 1). **PAUSE** :
   bouton de la barre de scène et Maj+Espace (proposition) ; gèle l'horloge, bandeau ambre « EN PAUSE » sur toute la largeur.
6. **×20 devient la répétition rapide** : vitesses ×1 / ×5 / ×20 visibles seulement en RÉPÉTITION (§4.3), pastille acier
   « RÉPÉTITION ×20 » et trait acier sous l'en-tête ; passer en SPECTACLE remet ×1 ; option « à blanc » en répétition (ni
   pont ni sortie).
7. **Barre de temps** : un clic ou un glisser sur la règle et dans le vide = **repérage** (tête fantôme acier ; le panneau
   montre « à cet instant » : moment, étape, ordres, scène), sans toucher la lecture ni rien envoyer. Pour déplacer la
   vraie lecture : double-clic ou bouton « ALLER ICI » de la bulle de repérage = SAUTER À, avec confirmation en SPECTACLE,
   sans confirmation en RÉPÉTITION. Même règle pour le clic sur une étape de la planche et pour la recherche.
8. **Les ordres partent sur un événement de lecture**, pas sur l'observation de `lecture.moment` : « cue franchi par GO /
   par passage auto / par saut confirmé », numéroté et journalisé, jamais au chargement ni à la re-création du lecteur.
9. **Le lecteur n'est pas recréé en SPECTACLE** : la structure est verrouillée ; une modification venue de la salle est
   mise en attente (« 1 modification en attente : appliquer à la fin du moment »). En RÉPÉTITION, la re-création garde
   l'état de passage (si `etape === null`, se replacer **au passage**, pas au début du moment).

### 4.2 L'écran de régie (barre de scène au lieu du TAP flottant)

```
┌ STUDIO REAL · ÉCHO │ ● SPECTACLE │ 5 · Questions › Q3 · réponses │ 23:41 / 48:00  RETARD +02:10 │ PONT ● │ SORTIE ● mur ┐
├─────────────────────────────────────────────────────────────────────────────┬──────────────────────────────────────────┤
│ PLANCHE (lecture seule en spectacle, caméra stable)                          │ EN COURS   Q3 · réponses       00:42     │
│                                                                             │ PROCHAIN   Q3 · résultat                 │
│                                                                             │   → MUR · vote révéler                   │
│                                                                             │   → SORTIE · page mur (inchangée)        │
│                                                                             │ RÉGIE · mémoires, signaux, journal       │
├─────────────────────────────────────────────────────────────────────────────┴──────────────────────────────────────────┤
│ CONDUITE (repérage : un clic pose la tête fantôme)                                                                     │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ATTENTE DU TOP · 00:42 │ PROCHAIN : Q3 · RÉSULTAT │ [ GO · ESPACE ] [RETENIR] [SAUTER À…] [+30 s] [PAUSE]   [PANIQUE] │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- La barre de scène est une **rangée de la mise en page** (grille de `.coquille`), pas une surimpression : elle ne couvre
  plus la conduite. GO est le **seul orange plein** de l'écran ; les GO de l'en-tête, du panneau et du pupitre deviennent
  des rappels en filet ou disparaissent ; PANIQUE en rouge (`--rec`), appui long (`docs/05-regie-et-studio.md` §3).
- L'état (PRÊT / EN LECTURE / ATTENTE DU TOP / EN PAUSE / BLOQUÉ / TERMINÉ) est un badge de l'en-tête et le début de la
  barre de scène : couleur **et** texte (ambre = attend un humain, vert = ça joue, acier = on lit).
- Le panneau montre en tête **EN COURS / PROCHAIN** avec les ordres qui partiront au GO (l'équivalent du « standby » de
  QLab) : la régie sait ce que fera son appui avant d'appuyer.
- Voyants PONT et SORTIE dans l'en-tête : hôte, état (relié / périmé / absent), dernière scène **vue** par la sortie.

### 4.3 Deux modes au lieu de trois notions : RÉPÉTITION et SPECTACLE

| | RÉPÉTITION | SPECTACLE |
|---|---|---|
| Vitesse | ×1 ×5 ×20, pastille acier | ×1 imposé, pas de bouton |
| Structure | modifiable (le lecteur se recrée en gardant le passage) | verrouillée (l'ancien verrou SCÈNE) ; modifications de la salle mises en attente |
| Espace | lecture / pause | **GO** |
| Clic dans la conduite | aller à (sans confirmation) | repérage ; aller = confirmation |
| Caméra de la planche | libre | suit le spectacle, zoom constant |
| Pont et sortie | « à blanc » au choix | toujours actifs |
| Repère | trait acier sous l'en-tête | trait orange 2 px sous l'en-tête (brief §1.2) |

Le mode de la salle collaborative (Écriture / Répétition / Scène) s'aligne sur ce choix (Scène = SPECTACLE) ; le lecteur
passe en `mode: 'scene'` en SPECTACLE. Le défaut à l'ouverture est RÉPÉTITION.

### 4.4 Performance (après le modèle de lecture)

- **Séparer l'horloge de la structure.** Le magasin publie `lecture` (moment, étape, phase, attente du top, bloqué,
  terminé, issue, mémoires, reprises, longueurs du journal) **seulement quand elle change** ; `t`, `tEtape`, `retard` vont
  dans un petit magasin `horloge` (ou une référence) lu par des composants isolés (horloge de l'en-tête, barres de
  progression, compte à rebours) qui écrivent le DOM eux-mêmes, comme `TeteDeLecture`. « Où en est-on » se rafraîchit à 10 Hz.
- **Sélecteurs fins partout** : plus de `s => s.lecture`, `useShallow` pour les objets, `useInterface` avec sélecteur ;
  `memoires` et `reprises` comparées par contenu. Côté moteur, un `etatLeger()` sans copie des journaux pour l'image
  (chantier 1).
- **Planche** : elle ne reçoit que `moment`, `etape`, `attenteGo`, `parcours` ; l'avancement de l'étape courante passe par
  une variable CSS écrite hors React.
- **Sortie** : arrêter le ticker Pixi quand le calque est invisible (`app.ticker.stop()` / `start()`), garder vivantes les
  iframes `page` d'un même spectacle (préchargées, cachées) pour que MUR → NOIR → MUR ne recharge rien, ouvrir la sortie
  dans un processus séparé (`noopener`, à mesurer) ou sur une seconde machine (relais par la salle du serveur).
- **Objectif mesurable** : au Profiler React, aucun rendu de `Planche`, `Panneau` ni `EnTete` entre deux changements de
  structure pendant la lecture ; moins de 1 ms de script par image côté régie.

### 4.5 Une sortie qui dit la vérité

- **Version de construction** : `define` Vite `__BUILD__` (hash du commit + date) dans la régie et la sortie ; la sortie
  l'envoie dans `present` ; la régie compare. Écart → voyant ambre « SORTIE PÉRIMÉE » et bouton **RECHARGER LA SORTIE**
  (nouveau message `recharger` : la sortie fait `location.reload()`).
- **Protocole** : `VERSION_SORTIE` incrémentée à chaque ajout de type ; une scène inconnue n'est plus ignorée : la sortie
  répond `refus{type}` et affiche une carte « scène inconnue : page — recharger » au lieu de rester sur l'ancienne.
- **Retour d'état** : la vignette montre la scène **vue** (`sceneVue`) et signale tout écart avec la scène publiée ; pour
  `page`, elle affiche l'hôte et un état (chargée / erreur / délai) au lieu d'un noir.
- **Publication** : ne plus vider `conducteur/` (garder la génération précédente des fichiers hachés) et, le soir même,
  préférer servir le Conducteur depuis le serveur du spectacle (même origine, pas de cache de 10 min ; question 7).
- **Ouverture** : bouton libellé « SORTIE » ; à l'ouverture, une carte d'aide sur la sortie (« glisser sur le projecteur ·
  F plein écran · cliquer une fois pour le son ») qui disparaît au premier geste.
- **Pages et visio** : adresse du serveur du spectacle en réglage du soir (chantier 2), pas dans le JSON ; réglages de la
  visio (son de Franck, recharger) envoyés depuis la régie.

### 4.6 La planche : zoom, navigation, lisibilité, place des acteurs

Zoom et navigation :
- **Mêmes gestes en haut et en bas** : molette = défilement (vertical sur la planche, horizontal sur la conduite),
  Ctrl / pincement = zoom, glisser du bouton du milieu = panoramique. Plus de devinette souris / pavé.
- **Caméra de spectacle** : zoom constant choisi une fois (niveau ÉTAPES), seul le panoramique suit ; pendant l'attente, le
  moment suivant est signalé par une flèche « PROCHAIN » au bord plutôt que par un dézoom. Bouton « SUIVRE » toujours
  visible quand le suivi est coupé, avec une touche dédiée (F reste le plein écran).
- **Lisibilité** : en vue d'ensemble, le losange garde « GO » ou « AUTO » en micro-étiquette à taille d'écran constante
  (règle 11 de `docs/etudes/da-showrunner.md`) ; bandeau BLOQUÉ affiché même à l'arrêt.

Les futurs nœuds « acteurs » (le chantier 1 propose le modèle ; ici, l'ergonomie) :
- **Où ils vivent** : un rail **PLATEAU** à gauche de la planche (ou en tête du panneau en SPECTACLE) : une puce par
  acteur — Écran scène, Mur, Téléphones du public, Téléphone de la ministre, Visio, Poste de Franck (ÉCO), Son — avec un
  voyant (relié / périmé / absent), la dernière chose **vue** (retour d'état) et une vignette au survol. Un clic ouvre le
  panneau de l'acteur : réglages du soir (adresse, son, recharger) et liste de ses ordres dans le spectacle.
- **Relier une étape à une sortie** : sous chaque bloc, une rangée de puces d'ordres (« MUR · vote Q3 », « TÉL · flux »,
  « SORTIE · page mur ») ; on en crée une en tirant du bloc vers une puce du rail, ou par la section **ORDRES AUX
  ACTEURS** du panneau de l'étape (acteur ▾, action ▾, paramètres en champs), qui remplace l'édition brute de
  `params.cmds` et `params.sortie`.
- **Aperçu** : survol d'une puce = ce que l'acteur montrera ; le panneau PROCHAIN liste les ordres du prochain GO ; dans la
  conduite, une piste par acteur (facultative) montre qui affiche quoi au fil du spectacle.
- En SPECTACLE, le rail devient le moniteur des postes : il remplace l'état éclaté entre pages/regie, la page ÉCO et la
  vignette de sortie.

### 4.7 Thème (inchangé dans l'esprit)

Tout passe par les jetons (`packages/theme/jetons*.css`) : ambre = attend un humain (ATTENTE DU TOP, RETENU, sortie
périmée), vert = joue / relié, acier = on lit (repérage, répétition), orange plein = **GO seul**, rouge = PANIQUE et
alertes. Noms du cue en cours et du prochain, titres de sections : Venus Rising (`--f-disp`) ; micro-étiquettes en Azeret
Mono capitales ; chiffres tabulaires à largeur fixe. Nouveaux jetons si besoin (ombre de la barre de scène) dans les deux
thèmes. Le Conducteur pointe sur `packages/theme` au lieu de sa copie.

## 5. Lots de travail proposés

Estimations en heures d'un développeur. Coût indicatif d'un lot confié à Sonnet 5.5 : 0,3 à 1 $ ; Qwen local : gratuit.
Total P0 ≈ 36 h (≈ 4 à 6 $ de crédits API si les lots Sonnet passent par `agent-run`, plus la relecture Claude).

| Lot | Prio | Objectif | Fichiers | Taille | Dépend de | Exécutant conseillé |
|---|---|---|---|---|---|---|
| **L1 GO unique, temps réel** | P0 | Règles 4.1-1, 4.1-2, 4.1-3, 4.1-6 : supprimer la pause automatique, action `go()` (force + franchit), plus d'armement, anti double GO, Espace = GO en SPECTACLE, vitesse liée au mode, fin de vidéo toujours transmise | `etat/magasin.ts` (l. 224-241, 280-295, 316-318), `coquille/BoutonTap.tsx`, `coquille/raccourcis.ts:60-61`, `coquille/EnTete.tsx:100-111`, `coquille/Superpositions.tsx:134,166`, `coquille/Panneau.tsx:413`, `sortie/useRelaisSortie.ts:57` | M · 8 h | questions 1 à 3 | Sonnet 5.5 sur la spécification §4.1, relu par Claude |
| **L2 Lecteur stable en représentation** | P0 | Règle 4.1-9 : pas de re-création en SPECTACLE ; re-création qui garde le passage en RÉPÉTITION ; modifications de la salle mises en attente | `etat/magasin.ts:154-172, 222, 264-269, 414-417` | S · 3 h | L1 | Sonnet 5.5 |
| **L3 Barre de temps sûre** | P0 | Règle 4.1-7 : tête fantôme de repérage, « ALLER ICI », boîte SAUTER À… avec confirmation et case « envoyer les ordres » | `conduite/Conduite.tsx:232-268`, `conduite/TeteDeLecture.tsx`, `conduite/conduite.css`, `planche/Planche.tsx:356`, `coquille/Recherche.tsx:51`, `coquille/Panneau.tsx:253`, `coquille/Superpositions.tsx` | M · 6 h | L1 | Sonnet 5.5 |
| **L4 Pont sûr et visible** | P0 | Règle 4.1-8 : ordres sur l'événement « cue franchi », rien au chargement ni au saut non confirmé ; voyant PONT ; adresse réglable dans la fenêtre PROJET ; jeton retiré de l'adresse (`history.replaceState`) ; un seul toast de reconnexion | `coquille/pont-figurants.ts`, `etat/magasin.ts`, `coquille/EnTete.tsx`, `coquille/Superpositions.tsx` (Projets) | M · 5 h | L1 ; chantier 2 (serveur du spectacle, accusés) | Sonnet 5.5 |
| **L5 Sortie fiable** | P0 | §4.5 : version de construction, `recharger`, `refus`, vignette = scène vue, carte d'aide, publication sans `--emptyOutDir` | `sortie/protocole.ts`, `sortie/page.tsx:168`, `sortie/relais.ts:143-158`, `sortie/ApercuSortie.tsx`, `sortie/BoutonSortieScene.tsx`, `sortie/fenetre.ts`, `sortie/scenes.tsx:133-135`, `apps/conducteur/vite.config.ts`, `apps/conducteur/package.json:12` | M · 6 h | — | Sonnet 5.5 (tests du protocole : Qwen local) |
| **L6 Barre de scène et état visible** | P0 | §4.2 : barre de scène dans la grille (remplace le TAP flottant), badge d'état, un seul orange, emplacement PANIQUE (appui long, action branchée avec le chantier 2) | nouveau `coquille/BarreScene.tsx` (remplace `BoutonTap.tsx`), `coquille/App.tsx:117-149`, `coquille/coquille.css:409-415`, `coquille/EnTete.tsx:46-51, 105` | M · 5 h | L1 | Sonnet 5.5, relu par Claude (design) |
| **L7 Tests de non-régression de la régie** | P0 | Scénarios Écho en vitest : un GO = un cue, double GO ignoré, modification pendant l'attente, clic de règle sans effet en SPECTACLE, aucun ordre au chargement, fin de vidéo pendant l'attente, scène inconnue refusée | nouveau `etat/magasin.test.ts`, `sortie/protocole.test.ts` | S · 3 h | L1 à L5 | Qwen local (brief borné : fichiers de test seuls, preuve = `npm test -w conducteur`) |
| **L8 Re-rendus** | P1 | §4.4 : horloge séparée, sélecteurs fins, planche sans re-rendu par image ; mesure au Profiler avant / après (protocole écrit dans la PR) | `etat/magasin.ts`, `coquille/EnTete.tsx`, `coquille/Panneau.tsx`, `coquille/Regie.tsx:108-111`, `coquille/Superpositions.tsx`, `planche/Planche.tsx:49, 618`, `collab/Commentaires.tsx:22` | L · 10 h | L1, L6 | Sonnet 5.5, relu par Claude |
| **L9 Sortie légère** | P1 | Ticker Pixi arrêté hors calque, iframes `page` gardées vivantes, essai `noopener`, préchargement de Venus Rising | `sortie/calque/calque.ts:81`, `sortie/page.tsx:247-264`, `sortie/scenes.tsx:85-135`, `sortie/fenetre.ts:38`, `apps/conducteur/index.html`, `apps/conducteur/sortie.html` | M · 4 h | L5 | Sonnet 5.5 |
| **L10 Modes RÉPÉTITION / SPECTACLE** | P1 | §4.3 : un sélecteur, repères visuels, alignement avec la salle collaborative, en-tête lisible à 1100 px | `etat/magasin.ts` (mode, verrou, vitesse), `coquille/EnTete.tsx`, `coquille/coquille.css:98-102`, `planche/Planche.tsx:186-209`, `collab/BoutonsVerrou.tsx`, `etat/serveur.ts` | M · 6 h | question 5, L1 | Claude (décision) puis Sonnet 5.5 |
| **L11 Planche : caméra et gestes** | P1 | §4.6 : zoom constant en spectacle, plus de dézoom à l'attente, gestes unifiés, SUIVRE toujours visible | `planche/Planche.tsx:141-234`, `planche/geometrie.ts:74-80`, `conduite/Conduite.tsx` (molette) | M · 4 h | L10 | Sonnet 5.5 |
| **L12 EN COURS / PROCHAIN et reprise** | P1 | Panneau « prochain cue » avec ses ordres ; position du spectacle gardée au rechargement (« Reprendre à Q3 ? », sans renvoyer d'ordres) ; `?projet=echo` ne remplace plus une version locale modifiée sans demander | `coquille/Panneau.tsx`, `coquille/derive.ts`, `etat/persistance.ts`, `etat/magasin.ts:465`, `coquille/App.tsx:111-114`, `coquille/projet-live.ts` | M · 6 h | L1, L4 | Sonnet 5.5 |
| **L13 Une seule régie** | P1 | Faire entrer dans le Conducteur les commandes de pages/regie jouées le 27/10 (vote, Junon, président, écran MUR / NOIR, arrêt audio, son de la visio) comme **tops manuels** (doc 05 §3), puis retirer la conduite du prototype | `coquille/Regie.tsx`, `etat/regie.ts`, `prototypes/figurants/pages/regie/regie.js:554-576` | L · 12 h | chantiers 1 et 2 (modèle des acteurs, serveur) ; question 6 | Claude (architecture) puis Sonnet 5.5 |
| **L14 Acteurs dans la planche** | P2 | §4.6 : rail PLATEAU, puces d'ordres, section ORDRES AUX ACTEURS, pistes par acteur | `planche/*`, `coquille/Panneau.tsx`, `conduite/*` | L · 16 h | modèle du chantier 1, L13 | Claude (conception) puis Sonnet 5.5 |
| **L15 Thème propre** | P2 | Palette des blocs en jetons, couleurs en dur retirées, Conducteur branché sur `packages/theme`, commentaires sur Venus Rising corrigés | `blocs/palette.ts`, `blocs/catalogue.ts`, `blocs/apercus.ts`, `sortie/scenes.tsx:135`, `coquille/coquille.css:414`, `theme/*`, `apps/conducteur/vite.config.ts:7-9`, `packages/theme/README.md` | S · 3 h | — | Qwen local (refactor borné), relu par Claude |
| **L16 Fiche « soir de spectacle »** | P2 | Une page de procédure régie : ouvrir, relier, sortie, vérifier les voyants, GO, que faire si… | nouveau `docs/regie-soir-de-spectacle.md` | S · 2 h | L1 à L6 | Qwen local |

Ordre conseillé avant le prochain spectacle : L1 → L2 → L3 et L5 en parallèle (un agent par serveur, fichiers disjoints)
→ L4 → L6 → L7.

## 6. Questions au propriétaire

1. **Espace = GO** en SPECTACLE (comme QLab, doc 05), et la pause sur Maj+Espace : d'accord ?
2. **Supprimer l'armement du top** (un GO pendant une étape ne s'enregistre plus pour plus tard) ; protection contre le
   double GO à 800 ms : la bonne durée ?
3. Une étape d'Écho « attend le top » : accepter qu'un GO **termine l'étape et franchisse le passage en un seul appui**,
   et demander au chantier 1 de lever le plancher de 10 s pour ces étapes ?
4. **Clic dans la barre de temps en SPECTACLE** : repérage seul (recommandé), ou saut avec confirmation ?
5. Remplacer PRÉPARER / JOUER + verrou SCÈNE par **RÉPÉTITION / SPECTACLE**, avec RÉPÉTITION par défaut à l'ouverture ?
6. Le Conducteur doit-il devenir **la seule régie** (vote, Junon, mur, visio, figurants dedans), ou garde-t-on un second
   poste « régie figurants » tenu par une autre personne ?
7. Le soir du spectacle, servir le Conducteur **depuis le serveur du spectacle** (même origine, pas de cache GitHub Pages)
   plutôt que depuis Pages ?
8. La sortie Écran scène : même machine que la régie (plus simple, même processus) ou **seconde machine** (plus sûr pour la
   fluidité, passe par la salle du serveur) ?
9. Les réglages de la visio (son de Franck, recharger, couper) doivent-ils être pilotables depuis la régie ?
10. Bouton **PANIQUE** (téléphones noirs et muets, sortie sur image de secours) : à livrer pour le prochain spectacle (il
    manque aujourd'hui), avec appui long ?
