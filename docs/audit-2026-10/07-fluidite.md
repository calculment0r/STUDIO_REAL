# Chantier 7 — Fluidité du Conducteur : ce qui coûte, mesuré dans un vrai navigateur

Audit du 29/10/2026, branche `agent/fluidite` (depuis `integration/2026-10`, commit `81e6b1e`). **Aucun fichier du produit n'a été
modifié** : le lot ajoute un outil de mesure (`outils/fluidite/`, lancé par `npm run fluidite`), ses mesures de référence
(`outils/fluidite/resultats/*.json`) et ce rapport. Question du propriétaire : « ça rame quand même pas mal : a-t-on besoin
de jouer les animations hors écran par exemple ? cherche des pistes ». Le lot suivant (« performance-react ») appliquera les
correctifs à partir de ce rapport.

Tout ce qui suit vient de **vraies exécutions** dans Edge sans tête (Edge 156, projet Écho en mode SPECTACLE, fenêtre de régie
1440 × 900, fenêtre de sortie ouverte comme le fait le produit). Machine de mesure : portable Core i7-10875H (16 cœurs
logiques, 64 Go, carte Intel UHD). Ce qui n'a pas pu être mesuré est dit au §8.

## Mots utilisés (une demi-ligne chacun)

* **Image** : un dessin complet de l'écran. À 60 images par seconde (i/s), le navigateur dispose de **16,7 ms** pour tout faire entre deux images ; au-delà, l'image est « en retard » et l'œil voit une saccade. Le tableau compte les images en retard à partir de **20 ms** : le chronomètre de l'écran tremble déjà de ± 1 ms sur une page vide (mesuré : 60 i/s, 0 écart > 20 ms).
* **Fil principal** : la « voie » unique sur laquelle une page exécute son JavaScript, calcule sa mise en page et la dessine. Sa durée d'occupation (en **ms par seconde**, 1000 = saturé) est le meilleur indicateur de marge : une page à 410 ms/s n'a plus que 590 ms/s de réserve.
* **Rendu React / validation (commit)** : React recalcule ce qui doit changer à l'écran (rendu) puis l'applique au document (validation). Un composant « rendu » est une fonction que React a ré-exécutée.
* **Mise en page (layout)**, **recalcul de style**, **peinture**, **assemblage des calques (« Layerize »)** : les étapes du navigateur après un changement du document : où les éléments se placent, quelles règles de style s'appliquent, le dessin des pixels, puis l'assemblage des morceaux dessinés en calques que la carte graphique composera.
* **Ramasse-miettes (GC)** : le nettoyage périodique de la mémoire JavaScript ; un « GC majeur » gèle la page quelques dizaines de ms.
* **Construction de production** : le Conducteur construit comme au spectacle (`npm run build`, code réduit). **Construction de développement** : celle de `npm run dev` (React complet, vérifications) ; plus lente, mais c'est la seule où l'on voit les noms de composants.
* **p50 / p95** : la valeur « du milieu » et celle qui n'est dépassée que 1 fois sur 20.

## 1. Résumé

1. **Sur ce portable branché et en construction de production, la régie tient 60 i/s en lecture** (0 image en retard sur 60 s, 0 sur 25 s de 5 GO) : la saccade n'est pas reproduite à vide. Mais elle ne le fait qu'avec **peu de marge** : le fil principal est occupé **410 ms par seconde (41 %) pour… attendre un GO** (77 ms/s quand la lecture est en pause), avec **129 validations React par seconde, soit plus de 2 par image**.
2. **La saccade apparaît dès que la marge disparaît.** Même scénario, mêmes 60 s : **portable sur batterie** → 855 ms/s, 54 i/s, **339 images en retard** ; **processeur ralenti 4 fois** (portable modeste, réglage du navigateur) → **22 i/s, 314 images en retard sur 323, 49 images > 50 ms, délai du clic GO 120-144 ms**. Et **construction de développement** (`npm run dev`) → 54,5 i/s, 55 images en retard en 10 s, script 6 fois plus lourd. Trois causes possibles du « ça rame » observé : machine sur batterie, machine modeste, ou régie lancée en mode développement.
3. **Cause n° 1 : le navigateur redessine et réassemble la conduite et la planche à chaque image, alors que presque rien ne change à l'écran.** L'« assemblage des calques » coûte à lui seul **194 ms/s (47 % du fil)**, 60 mises en page par seconde, 11 événements de peinture par image. Expérience : masquer la conduite fait tomber le fil de 387 à 104 ms/s (**− 73 %**), masquer le seul calque de la tête de lecture à 270 (**− 30 %**), masquer la planche à 270 (**− 30 %**, − 49 % au premier passage).
4. **Cause n° 2 : la lecture est publiée 60 fois par seconde à toute l'interface** (`lecture` recréée à chaque image) : 18,8 composants ré-exécutés par validation, dont **toute la planche, l'en-tête et ses 13 icônes, le pupitre, les aperçus de la sortie**, même fermés. En développement c'est 204 ms/s de rendu React ; en production, le script total reste modeste (74 ms/s) mais alimente la cause n° 1 et déclenche un **GC majeur de 17-21 ms toutes les 12 à 17 s** (la plus longue tâche de la lecture : 31 ms).
5. **Réponse à la question « jouer les animations hors écran ? »** (§5) : **quand l'onglet de la régie est caché, le navigateur coupe déjà tout** (0 image, 0 rappel d'image, 31 ms/s) ; **quand la fenêtre de sortie est cachée, sa boucle PixiJS s'arrête aussi** (1 ms/s au lieu de 12-18). Ce qui tourne pour rien est **dans la page visible** : 12 animations CSS (dont une qui repeint : − 11 % du fil quand on les coupe), la boucle PixiJS de la sortie qui tourne 2 fois par image même quand le calque est invisible, et la simulation des aperçus de blocs.
6. **Le GO n'est pas un pic** : sur 5 GO, 0 image > 20 ms, tâche la plus longue 8-34 ms (des GC), délai du clic jusqu'à l'image suivante 64 ms. Le coût du GO est un **palier** (+ 100 ms/s pendant 1,5 s : 80 mises en page par seconde) et le nouveau moment fait re-rendre ses blocs (`MomentPlanche2`, `BlocEtape`, `OrdresBloc`, `Ronds`) à chaque image.
7. **Ne sont PAS des causes** (mesuré) : les minuteurs et battements (23 rappels/s, ≈ 1 ms/s au total), la surveillance à 250 ms, l'écriture du projet dans `localStorage` (regroupée, 1,4 Ko/s pendant 20 modifications d'Écho, 0,24 à 0,5 ms par copie), la mémoire (10 Mo, + 0,7 Mo par minute), le nombre de nœuds (1 266 en tout, 425 dans la conduite), le moteur de lecture (< 2 % du processeur en profil).

## 2. Ce qui a été mesuré, et comment

| Quoi | Comment |
|---|---|
| Images par seconde, images en retard (> 20, > 33, > 50, > 100 ms), écart p95 | boucle `requestAnimationFrame` propre à l'outil, injectée dans la page avant ses scripts |
| Occupation du fil principal, script, style, mise en page (ms/s) | `Performance.getMetrics` du navigateur, début et fin de phase |
| Décomposition fine : assemblage des calques, peinture, GC, travail par image (p50/p95/max), tâches les plus longues et ce qu'elles contiennent, éléments repeints | trace du navigateur (`Tracing`, catégorie `devtools.timeline`), analysée par `analyse.ts` |
| Validations React par seconde, durée du rendu, rendus **par composant**, validations légères | fausse « extension DevTools de React » injectée (porte officielle de React) ; comptage par composant en construction de développement seulement |
| Appels `requestAnimationFrame` et minuteurs par seconde, par fonction appelante, avec leur durée | enveloppes injectées autour de `requestAnimationFrame`, `setTimeout`, `setInterval` |
| Écritures `localStorage`, copies `structuredClone`, messages `BroadcastChannel` | enveloppes injectées |
| Nœuds du document (total, conduite, planche, panneau), animations CSS en cours, éléments à calque | requêtes dans la page |
| Mémoire JS (avant, après nettoyage forcé) | `Performance.getMetrics` + `HeapProfiler.collectGarbage` |
| Profil du processeur (qui, dans quelle fonction) | `Profiler`, échantillon toutes les 0,5 ms, 15 s, construction de développement |
| Fenêtre de sortie, séparément : images, script, boucle PixiJS | mêmes sondes dans la fenêtre de sortie, ouverte par `window.open` comme le produit |
| Variantes : onglet caché, sortie réduite, sans sortie, processeur ×4 | un autre onglet passé devant ; fenêtre réduite par le navigateur ; fenêtre fermée ; `Emulation.setCPUThrottlingRate` |
| Expériences « et si cette zone n'existait pas ? » | feuille de style injectée dans la page (`display:none`…), le produit n'est pas touché |

Scénario : Écho, SPECTACLE, lecture 60 s **sans GO** (Écho attend le premier GO : c'est la situation la plus fréquente d'un soir),
puis variantes dans le même état, puis 5 GO espacés de 5 s (vrais clics de souris sur le gros bouton GO). Les chiffres à retenir sont
en **construction de production** ; la construction de développement ne sert qu'à nommer les coupables. L'outil tourne en ≈ 4 min 30.

**Trois jeux de mesures sont conservés** (`outils/fluidite/resultats/`) :

* `20261029-1329-reference-secteur.json` : référence, portable **sur secteur** (état déduit : la sonde d'alimentation a été ajoutée après ; la même phase donne 410 ms/s ici contre 855 ms/s sur batterie) ;
* `20261029-1345-reference-batterie.json` : même scénario, **portable sur batterie** pour les phases `repos` à `go-lent` (étiquette de chaque phase), rebranché ensuite pour les phases en développement ;
* `20261029-1348-hypotheses.json` : les expériences (zone masquée, animations coupées), sur secteur.

**Découverte d'exploitation** : l'alimentation change tout. Le même Conducteur, la même phase `lecture`, donne 410 ms/s et 0 image en retard sur secteur, 855 ms/s et 339 images en retard sur batterie (le processeur perd son mode « turbo »). L'outil note maintenant l'alimentation de chaque phase.

## 3. Chiffres de référence (production, portable sur secteur)

| Phase (durée) | i/s | Images > 20 ms | Écart p95 (ms) | Fil (ms/s) | Script (ms/s) | Mises en page /s | Validations React /s | Rappels d'image /s | Nœuds |
|---|---|---|---|---|---|---|---|---|---|
| Repos, lecture en pause (8 s) | 60,1 | 0 | 17,3 | 77 | 11 | 0 | 9,9 | 180 | 1 258 |
| **Lecture sans GO (60 s)** | 60,0 | 0 | 17,3 | **410** | 74 | 60 | **129** | 180 | 1 266 |
| Onglet de la régie caché (12 s) | 0 | – | – | 31 | 1,4 | 0 | 3,2 | 0 | 1 266 |
| Fenêtre de sortie réduite (12 s) | 60,1 | 0 | 17,3 | 372 | 80 | 60 | 127 | 180 | 1 266 |
| Sans fenêtre de sortie (12 s) | 60,1 | 0 | 17,4 | 377 | 80 | 60 | 125 | 180 | 1 244 |
| **5 GO (25 s)** | 60,0 | 0 | 17,3 | 511 | 91 | 80 | 129 | 181 | 1 293 |
| **Processeur ×4, 3 GO (14 s)** | **22,0** | **314** | 66,6 | 999 | 165 | 31 | 45 | 67 | 1 292 |
| Même phase `lecture`, portable sur **batterie** | 54,4 | **339** | 33,3 | 855 | 140 | 54 | 113 | 163 | 1 266 |
| Même phase `lecture`, construction de **développement** (10 s) | 54,5 | 55 | 33,3 | 811 | 469 | 55 | 116 | 164 | 1 266 |

Détail de la lecture en production (trace, 60 s) : travail par image p50 6,3 ms, p95 7,9 ms, max 16,7 ms (marge moyenne : 10 ms sur 16,7) ; script par image p50 1,7 ms, p95 2,5 ms ; tâche la plus longue 31 ms (un GC majeur) ; mémoire 10,1 Mo après nettoyage, + 0,7 Mo en 60 s ; 404 écouteurs d'événements.

Détail du GO (production, 5 GO) : tâche la plus longue après chaque GO 8 à 34 ms (GC majeur), plus mauvais écart entre images 17,6 ms, travail par image max 16,7 ms, **délai du clic jusqu'à l'image suivante 64 ms** (mesure du navigateur, par pas de 8 ms). Processeur ×4 : tâche jusqu'à 42 ms, écart d'images jusqu'à 83 ms, délai du clic 120 à 144 ms ; sur batterie et ×4 : 3,9 i/s (inutilisable) et délai du clic 512 à 784 ms.

La fenêtre de sortie (scène QR puis scènes du déroulé), en production : 60 i/s, 14-18 ms/s de script, **120 appels de la boucle PixiJS (`_tick`) par seconde pour 60 images**, soit deux par image.

## 4. Classement des causes (de la plus coûteuse à la moins coûteuse)

Mesures en production sur secteur, attente d'un GO (410 ms/s). Les expériences coupent une zone par une feuille de style : elles
disent combien la zone coûte, pas comment la réparer.

| # | Cause | Preuve (chiffre, fonction ou composant) | Poids |
|---|---|---|---|
| 1 | **Assemblage des calques refait à chaque image** | Trace : `Layerize` 194 ms/s sur 387-410 (47 %) ; 60 mises en page/s ; 11 peintures par image (`#document`, `.coquille`, `.cd-moment`, `.cd-zb-tete`, `.cd-attente-vive`, aire jusqu'à 1,3 Mpx) ; expérience : conduite masquée → `Layerize` 195 → 3 ms/s, mises en page 60 → 4/s, fil 387 → 104 | ≈ 200 ms/s |
| 2 | **Tête de lecture et écritures par image dans la conduite** | `conduite/TeteDeLecture.tsx` écrit à **chaque image** `style.left` du repère de zoom (`.cd-zb-tete`), `left`/`width` de l'attente (`.cd-attente-vive`), la variable `--avance` et l'attribut `data-vif` de chaque moment, en plus du `transform` de la tête ; `left`/`width` déclenchent une mise en page. Expérience : calque de la tête masqué → fil 387 → 270 (− 30 %), `Layerize` 195 → 60 | ≈ 120 ms/s |
| 3 | **La planche est re-rendue et repeinte à chaque image** | Rendus (développement) : `Planche`, `CoucheActeurs`, `PastillesCommentaires`, `CurseursDistants` ≈ 69 rendus/s chacun ; après un GO `MomentPlanche2`, `BlocEtape`, `OrdresBloc`, `Ronds` ≈ 110/s ; profil : `Planche` 13,9 % du processeur à elle seule (jsxDEV : 20 % en développement) ; abonnée à `lecture` (`planche/Planche.tsx:55`) ; expérience : planche masquée → 270 ms/s (− 30 %), `Layerize` 195 → 66 ; la caméra suit en continu (`pas`, `requestAnimationFrame` permanent en SPECTACLE, 0,5-1 ms/s) | ≈ 115-200 ms/s |
| 4 | **Publication de `lecture` 60 fois par seconde** | `etat/magasin.ts` `publier` (l. 303) crée un objet `lecture` neuf à chaque image ; `Lecteur.etat()` (`packages/modele/src/lecteur.ts` l. 159-181) recopie `journal`, `commandes`, `parcours`, `alertes`, `memoires`, `reprises` ; 7 composants abonnés à l'objet entier (`EnTete`, `BoutonTap`, `Panneau`, `Superpositions`, `InspecteurEnvois`, `Planche`, `CoucheActeurs`) → 129 validations/s, **18,8 composants ré-exécutés par validation** (en-tête et ses 13 icônes, `Pupitre` fermé, `PupitreRegie`, `JournalRegie`, `OuEnEstOn`, `EnCoursProchain`, `SectionSorties`, `ApercuSortie` → `Scene1080`, `Fondus`, `RenduScene`) ; 39 validations/s ne rendent aucun composant (cause à établir). Les tableaux copiés sont vides dans ce scénario (0 entrée de journal) : le coût de copie grandira avec un long spectacle (non mesuré) | script 74-94 ms/s en production ; 204 ms/s de rendu et 469 ms/s de script en développement |
| 5 | **Animations CSS qui repeignent** | 12 animations en cours : 9 d'opacité ou de `transform` (bon marché, sur le compositeur), **`cd-pulse` anime l'arrière-plan** de la tête de lecture (`<i>`, repeinte 52 fois/s), `planche-defile` ×3-4 ; expérience : toutes coupées → fil 387 → 345 (− 11 % ; − 17 % au premier passage) | ≈ 40-70 ms/s |
| 6 | **GC majeur** | trace : `MajorGC` 17-21 ms (jusqu'à 30 ms) toutes les 12 à 17 s, plus longue tâche de la lecture (31 ms, 34 ms après un GO) ; 117 ms une fois à ×4 | 5-8 ms/s, mais c'est lui qui fait la rare image en retard |
| 7 | **Sortie ouverte dans le même processus** | `TaskDuration` identique dans les deux fenêtres (même fil) ; sortie visible → + 35 ms/s (9 %) sur le fil de la régie (410 contre 372-377) ; boucle PixiJS `_tick` à 120 appels/s, 12 ms/s de script | ≈ 35 ms/s |
| 8 | Aperçus des blocs (`blocs/boucle.ts`) | une seule boucle, 30 i/s, seulement les aperçus visibles ; mais `avancerSimulation` tourne à chaque image même sans aperçu visible (`tic`, 9-15 ms/s) | ≈ 10-15 ms/s |
| – | **Pas des causes** | minuteurs : 23 rappels/s au total, 0,1 à 0,6 ms/s ; `useHorloge`, surveillance (`JSON.stringify(alertes)` à 250 ms), battement de la sortie (1 s) : < 1 ms/s ; `localStorage` : 20 modifications = 20 copies de 0,24-0,5 ms et **1** écriture de 14 Ko (regroupée à 500 ms), 0 image en retard ; mémoire stable ; nœuds 1 266 ; moteur de lecture `avancerLecture` + `publier` : 1,5 % du profil | < 1 % |

Remarques de méthode : (a) les expériences « panneau masqué », « liens SVG masqués », « zones isolées par `contain` » et
« repère de zoom / remplissage `--avance` masqués » ne sortent pas du bruit (± 15 % d'un passage à l'autre quand la machine fait autre chose, voir la colonne « machine % » du fichier) : **aucune conclusion**
sur elles, sauf que `contain: layout paint` sur la planche et la conduite n'apporte **rien** (fil 430 contre 387) ; (b) le gain de la piste « tout en `transform` » n'est
donc pas démontré par morceaux, seulement par bloc (calque de la tête : − 30 %) ; (c) les chiffres de développement ne servent qu'à
classer les composants : le profil en développement a 79 % du processeur occupé dont 20 % de surcoût propre au mode
développement (`jsxDEV`).

## 5. Réponse à la question : « a-t-on besoin de jouer les animations hors écran ? »

**Non, et ce n'est pas là que ça coûte.** Ce qui tourne selon l'endroit où est caché quoi :

| Situation | Ce qui tourne | Coût |
|---|---|---|
| **Onglet de la régie caché** (mesuré) | Plus aucune image dessinée (0 i/s), plus aucun `requestAnimationFrame` (0/s) : **le navigateur les suspend lui-même**. Restent : l'horloge de lecture, qui bascule sur un minuteur de 250 ms (`demarrerBoucle`, `etat/magasin.ts` l. 666-682, ralenti par le navigateur à ≈ 1 fois/s), 3,2 validations React/s, quelques minuteurs (≈ 6/s) | **31 ms/s** (3 %), dont ≈ 12-25 ms/s sont la sortie visible qui partage le fil. La lecture continue correctement, c'est voulu |
| **Fenêtre de sortie cachée (réduite)** (mesuré) | Plus d'image ni de `_tick` PixiJS (0/s contre 120/s), 1 minuteur de 1 s | **1 ms/s** de script côté sortie (12-18 visible) ; le fil de la régie baisse de 410 à 372 (− 9 %) |
| **Sortie visible mais calque invisible** (mesuré, scène QR / noir / page) | La boucle PixiJS tourne **quand même** : `calque.afficher(false)` ne baisse que l'opacité, « les effets continuent hors écran » (`sortie/calque/calque.ts` l. 81 et commentaire) ; `_tick` 120 appels/s | 12 ms/s de script + travail de la carte graphique (non mesuré) |
| **Page visible, éléments hors de la vue** (mesuré) | 12 animations CSS (pulsations, défilé de la planche), dont `cd-pulse` (arrière-plan, repeinte à chaque image) ; la planche entière rendue même hors cadre (316 nœuds, caméra en suivi) ; la conduite entière repeinte à chaque image | c'est le gros du problème (§4 causes 1 à 3), pas des animations « décoratives » |

À noter : la sortie cachée par une **autre fenêtre posée dessus** (et non réduite) n'a pas été reproduite (Edge sans tête ne modélise pas l'occultation) ; en vrai Edge/Windows, une fenêtre entièrement recouverte est aussi suspendue par défaut.

Conséquence pour les pistes : on n'a **pas besoin de coder** de pause pour l'onglet caché (le navigateur le fait) ; on a besoin d'une pause **dans la page visible** pour ce qui est hors cadre (`IntersectionObserver`, `animation-play-state`) et d'une pause du calque PixiJS quand rien ne l'affiche.

## 6. Pistes

Gains en ms/s du fil principal (construction de production, secteur, attente d'un GO) sauf mention. « Effort » en heures de développement par un agent
relu par Claude ; vérification = commande de l'outil et critère.

| # | Piste | Fichiers | Gain attendu | Risque | Effort | Vérification |
|---|---|---|---|---|---|---|
| P1 | **Tête de lecture et conduite sans mise en page par image** : repère de zoom, attente du top et remplissage des moments passés en `transform: scaleX/translateX` (calque dédié), `--avance` et `data-vif` seulement quand la valeur visible change d'au moins 1 pixel, `cd-pulse` en opacité ; calque de la tête isolé | `conduite/TeteDeLecture.tsx`, `conduite/BarreZoom.tsx`, `conduite/conduite.css` (`.cd-attente-vive`, `.cd-zb-tete`, `.cd-moment`, `cd-pulse`) | **− 100 à − 150 ms/s** (calque de la tête : − 117 mesuré) ; mises en page 60 → < 5/s | faible à moyen (rendu visuel de la règle et des hachures) | 5-6 h | `npm run fluidite -- --phase lecture` : mises en page/s < 5, `Layerize` (fichier JSON, `trace.parNom`) < 60 ms/s |
| P2 | **Publication de `lecture` seulement au changement de structure + horloge séparée** : un objet `lecture` stable (moment, étape, attente du GO, alertes, mémoires), changé seulement quand l'un d'eux change ; le temps `t`, le retard et la tête de lecture sur un petit magasin d'horloge lu hors React (`subscribe`) ou à 4 Hz ; `Lecteur.etat()` ne copie que ce qui a bougé | `etat/magasin.ts` (`publier`, `demarrerBoucle`), `packages/modele/src/lecteur.ts` (`etat`), `coquille/EnTete.tsx`, `BoutonTap.tsx`, `Panneau.tsx`, `Superpositions.tsx`, `Regie.tsx`, `InspecteurEnvois.tsx`, `Emulateur.tsx`, `planche/Planche.tsx`, `planche/CoucheActeurs.tsx`, `collab/Commentaires.tsx` | validations 129/s → < 10/s ; script production 74 → ≈ 20 ms/s ; plus de GC majeur régulier ; en développement : fil 811 → ≈ 300 | moyen (11 fichiers, affichage du temps et du retard à vérifier partout) | 10-14 h (lot L8 de l'audit UX) | `--phase lecture,rendus` : `react.commitsParS` < 10 ; plus grosse tâche < 20 ms |
| P3 | **Sélecteurs fins et `memo`** (peut précéder P2) : valeurs simples (`s.lecture?.moment`, `attenteGo`, `termine`) plutôt que l'objet ; `ApercuSortie` avec sélecteur dans `useSortie` ; `Pupitre` ne calcule rien fermé ; `PupitreRegie` / `JournalRegie` : `memoires` et `reprises` stables ; `Planche` : `parcoursParMoment`, `statutsMoment`, `vueMonde` mémoïsés sur des valeurs stables ; `memo` sur `CoucheActeurs`, `PastillesCommentaires`, `CurseursDistants`, icônes de l'en-tête | `coquille/EnTete.tsx`, `Panneau.tsx` (`OuEnEstOn`), `Superpositions.tsx`, `Regie.tsx`, `sortie/ApercuSortie.tsx` (l. 19), `planche/Planche.tsx` (l. 583-612), `planche/CoucheActeurs.tsx`, `collab/` | composants rendus par validation 18,8 → < 3 ; **0 rendu de la planche entre deux GO** ; − 30 à − 60 ms/s | faible | 6-8 h | `--phase rendus` : liste `rendus` sans `Planche`, `EnTete`, `Ico*` entre deux GO |
| P4 | **Planche : ne mettre à jour que ce qui est vu** : en SPECTACLE, rendre le moment courant et ses voisins (le reste figé, sans abonnement), caméra qui s'arrête de tourner quand elle est arrivée (`pas` n'annule pas son `requestAnimationFrame`), `content-visibility` pour le reste | `planche/Planche.tsx` (l. 195-222 et rendu des moments), `planche/MomentPlanche.tsx`, `planche/planche.css` | − 70 à − 115 ms/s (planche masquée : − 117 mesuré) ; nœuds 316 → ≈ 100 | moyen (suivi de caméra, clics sur la planche) | 6-8 h | `--phase lecture` ; `noeuds.planche` ; expérience `hyp-sans-planche` comme plafond |
| P5 | **Animations : pause hors cadre et hors onglet** : `animation-play-state: paused` quand l'élément n'est pas dans la vue (`IntersectionObserver` unique) ou que `document.hidden` ; `prefers-reduced-motion` ; pulsations réduites à `opacity` | `planche/planche.css` (`planche-pulse`, `planche-defile`), `coquille/coquille.css` (`srp`), `conduite/conduite.css` (`cd-pulse`) | − 40 à − 70 ms/s ; moins de calques animés | faible | 2-3 h | `noeuds.animations` (fichier JSON) ; `--hypotheses` : `hyp-sans-animations` = plafond |
| P6 | **Boucle PixiJS de la sortie** : suspendre le `ticker` quand le calque est invisible et qu'aucun effet n'est en cours (reprise instantanée à la prochaine réaction) ; suspendre sur `visibilitychange` ; un seul `_tick` par image | `sortie/calque/calque.ts` (l. 81 et `afficher`), `sortie/page.tsx` | − 12 ms/s de script côté sortie + travail de la carte graphique ; `_tick` 120 → 0/s sur QR / noir | moyen (effets « à rattraper » au retour) | 2-3 h | `sortie.tickerPixi.execsParS` ; images de la sortie toujours 60 i/s en scène avec effets |
| P7 | **Aperçus des blocs** : `tic` n'avance la simulation que si au moins un aperçu est visible ; pause sur `visibilitychange` | `blocs/boucle.ts` | − 10 à − 15 ms/s | faible | 1-2 h | `regie.sonde.raf` (fonction `tic`) |
| P8 | **Coût de la fenêtre de sortie** : à tester, ouvrir la sortie avec `noopener` (processus séparé, sans fil partagé) ; à vérifier que `retenirFenetre` et la reprise de fenêtre (`sortie/fenetre.ts`) n'en dépendent pas. **À mesurer avant de décider** | `sortie/fenetre.ts` | jusqu'à − 35 ms/s sur le fil de la régie (sortie visible) ; inconnu sur la carte graphique | moyen (`window.open` est aussi la poignée de reprise) | 2 h pour l'essai | l'outil, variante `window.open` avec `noopener` (à ajouter) : `memeProcessus` doit passer à `false` |
| P9 | **Exploitation (sans code)** : spectacle sur **secteur**, plan d'alimentation « Performances », régie lancée en **construction de production** (c'est déjà ce que fait `exploitation/lancer-spectacle.ps1`, jamais `npm run dev` le soir) | – | 2× (855 → 410 ms/s) ; 54 → 60 i/s | nul | 0 h | `alimentation` de chaque phase dans le JSON |
| P10 | Polices | `packages/theme/polices.css` | aucun effet sur la fluidité en lecture (chargées une fois, `font-display: swap`) ; au démarrage : 10 fichiers ≈ 160 Ko, dont les sous-ensembles « latin-ext » en double de chaque graisse ; Venus Rising n'est pas concernée | faible | 1 h | non mesuré comme cause : priorité basse |
| P11 | GC majeur | – | disparaît avec P2/P3 (moins de copies) ; rien à faire à part | – | 0 | plus grosse tâche `trace.taches.max` < 20 ms |

**Non recommandé** : limiter la surveillance, les battements ou `useHorloge` (gain < 1 ms/s) ; **virtualiser la conduite** (425 nœuds seulement ; les 270 ms/s qu'elle coûte viennent de ce qui s'y écrit à chaque image, pas de son nombre d'éléments) ; isoler par `contain: layout paint` (mesuré : aucun gain).

## 7. Ordre de réalisation proposé et objectifs chiffrés

Objectifs, à mesurer avec le même outil, même machine, **sur secteur**, en production, phase par phase (valeurs actuelles entre parenthèses) :

| Objectif | Phase | Maintenant |
|---|---|---|
| Fil principal ≤ 150 ms/s en attente de GO | `lecture` | 410 |
| Validations React < 10 par seconde en attente de GO | `lecture` | 129 |
| **0 rendu de la planche entre deux GO** | `rendus` | ≈ 69/s |
| Script < 1 ms par image (p50) | `lecture` (trace) | 1,7 |
| Mises en page < 5 par seconde | `lecture` | 60 |
| 0 image > 50 ms en lecture et sur 5 GO ; plus grosse tâche < 20 ms | `lecture`, `go` | 0 ; 31-34 ms |
| Processeur ×4 : ≥ 50 i/s, ≤ 5 images > 50 ms | `go-lent` | 22 i/s ; 49 |
| Batterie : ≥ 58 i/s, ≤ 10 images > 20 ms par minute | `lecture` sur batterie | 54,4 ; 339 |
| Onglet / sortie cachés : ≤ 30 ms/s | `onglet-cache`, `sortie-cachee` | 31 ; 372 (sortie réduite : régie inchangée) |

Ordre (chaque étape se termine par une mesure et la comparaison `--comparer`, dans la demande de fusion) :

0. **Dès maintenant, sans code** : P9 (secteur, production, plan Performances).
1. **Lot A, ≈ 10 h, risque faible** : P3 (sélecteurs fins / `memo`) + P5 (animations) + P7. Objectif : composants par validation < 3, fil − 80 à − 120 ms/s.
2. **Lot B, ≈ 6 h** : P1 (tête de lecture et conduite). Objectif : mises en page < 5/s, `Layerize` < 60 ms/s.
3. **Lot C, ≈ 12 h** : P2 (horloge séparée, publication de `lecture` seulement au changement de structure) ; il rend P3 plus simple si l'on veut le faire d'abord.
4. **Lot D, ≈ 8 h** : P4 (planche) puis P6 (PixiJS) puis l'essai P8.
5. **Mesure d'acceptation** : tableau du §7 ; si l'objectif ×4 n'est pas atteint, regarder d'abord `trace.parNom` (assemblage des calques) avant de toucher à React.

Première tâche du lot correctif : **aucune sonde n'est nécessaire dans le code** pour mesurer (l'outil injecte les siennes). Deux petites sondes aideraient pourtant : (a) un `Profiler` React en développement autour de l'application pour nommer la cause des **39 validations/s qui ne rendent aucun composant** (probablement des effets qui rappellent un `setState` identique) ; (b) des `performance.mark` autour de `publier` et de `TeteDeLecture.poser` pour les voir directement dans la trace. À écrire par le lot correctif, pas ici.

## 8. Ce qui n'a pas pu être mesuré, et pourquoi

* **Travail de la carte graphique et des fils de fond** (tramage, compositeur) : seul le fil principal du processus de rendu est observé ; sur un vrai écran avec la sortie plein écran 1080p, la carte graphique peut peser (carte Intel UHD ici, mais Edge sans tête ne la sollicite pas comme un écran réel).
* **Edge a été utilisé en mode `--headless=new`** pour ces mesures ; ce mode ouvre des fenêtres listées par Windows. Sur consigne du coordinateur, l'outil lance maintenant `--headless=old` par défaut (sans fenêtre) et garde `--headless=new` derrière `--headless-new`. **Ce changement n'a pas été essayé** (tout lancement d'Edge était interdit ensuite) : les versions récentes d'Edge peuvent refuser l'ancien mode ; l'outil le dit alors clairement sans basculer tout seul. Les mesures enregistrées ne sont pas affectées (faites avant, en mode `new`).
* **Machine de spectacle réelle** : inconnue ; la phase ×4 (réglage du navigateur) en donne un ordre de grandeur.
* **Sortie ouverte par `Start-Process`** (script `lancer-spectacle.ps1`, onglet sans lien avec la régie, donc probablement dans un autre processus) : non mesuré ; l'outil ouvre la sortie par `window.open`, qui la place dans le même processus (`TaskDuration` identique dans les deux fenêtres), le cas le plus défavorable.
* **Scènes de sortie lourdes** (vidéo plein cadre, mur de messages, calque PixiJS plein d'effets, flux du streamer), **émulateur de téléphones ouvert**, **salle collaborative reliée**, **deux régies** : hors scénario.
* **Un long spectacle** : les tableaux copiés à chaque image (`journal`, `commandes`, `parcours`) sont vides ou courts ici (0 entrée de journal, 3 à 9 passages) ; leur croissance sur 2 heures n'est pas mesurée.
* **Écriture du projet complet** : mesurée sur Écho (27 Ko) seulement, pas sur `echo-complet` (241 Ko).
* **Quel élément précis de `TeteDeLecture` coûte le plus** : les expériences par morceau (repère de zoom, `--avance`, animation de la tête) ne sortent pas du bruit ; seul le bloc « calque de la tête » est établi (− 30 %).
* **Bruit** : un portable partagé (autres programmes, alimentation) fait varier les chiffres de ± 15 %, voire × 2 (batterie). Le premier passage des expériences (secteur) n'a pas été gardé en fichier ; ses chiffres (conduite masquée 407 → 114, planche 206, animations 337) sont cités ici de mémoire du tableau d'exécution et confirmés dans le même ordre par le passage conservé (104, 270, 345).
* **Conditions d'une passe propre** : une troisième passe de la référence sur secteur, destinée à remplacer celle dont l'alimentation est « déduite », a été interrompue sur consigne ; elle n'a pas été enregistrée.

## 9. Questions pour le relecteur

1. La régie du soir tourne-t-elle sur secteur, avec quel plan d'alimentation, et sur quelle machine (processeur, carte graphique) ? Cela fixe l'objectif ×4 ou ×2 à viser.
2. La sortie est-elle ouverte par le bouton du Conducteur (`window.open`, même processus) ou par `Start-Process` du script de lancement (probablement un autre processus) ? Cela décide de l'intérêt de P8.
3. Peut-on, côté produit, mettre à jour le remplissage des moments (`--avance`) et les hachures d'attente à 10 Hz au lieu de 60 ? Le gain mesuré ne le démontre pas encore, mais P1 le suppose.
4. D'accord pour traiter P3 avant P2 (plus sûr, gain plus petit) ?
5. L'ancien mode sans tête (`--headless=old`) doit être essayé une fois sur ce poste avant de s'y fier : `npm run fluidite -- --phase repos --duree 0.3`.
