# Mesures de performance de l'interface du Conducteur (lot « performance-react »)

Lot du 29/10/2026, branche `agent/performance-react`, à la suite du rapport `07-fluidite.md` (constats C9 et C10 du rapport 03 §4.4).
Question posée : **l'interface se redessine-t-elle tout entière à chaque image de la lecture ?** Avant le lot, oui. Ce document dit ce qui a
changé, comment on le mesure sans navigateur (c'est la règle de ce lot), les chiffres avant / après, et ce que le relecteur doit
mesurer dans un vrai navigateur.

## Mots utilisés

* **Image** : un dessin complet de l'écran (60 par seconde).
* **Rendu d'un composant** : React ré-exécute la fonction du composant. **Validation** (commit) : React applique le résultat au document. Une validation peut ré-exécuter des dizaines de composants.
* **Structure de la lecture** : ce qui change à un GO, une pause, une attente du top, une mémoire posée (moment, étape, attente du GO, mémoires, parcours, alertes, journal…). **Horloge** : le temps qui passe (`t`, `tEtape`, `retard`).
* **Mise en page** : le navigateur recalcule la taille et la place des éléments (cher). **Repeinture** : il redessine des pixels sans rien déplacer. **Composition** : la carte graphique déplace un calque déjà dessiné (presque gratuit).

## 1. Ce qui a changé

| Pièce | Avant | Après |
|---|---|---|
| `lecture` (magasin) | objet neuf à **chaque image**, avec le temps dedans ; `Lecteur.etat()` recopiait 9 tableaux à chaque appel | remplacée **seulement quand la structure change** ; plus un *battement* de 0,2 s de spectacle (voir §5) ; les tableaux gardent leur référence tant que leur contenu ne change pas |
| temps | dans `lecture` | magasin séparé `useHorloge` (`etat/horloge.ts`), mis à jour à chaque image ; les composants le lisent **arrondi** (seconde ou quart de seconde) ou l'écrivent hors React |
| `Planche` | abonnée à `lecture` entière ; re-rendue à chaque image avec tous ses moments, `CoucheActeurs`, curseurs, pastilles | abonnée à 7 valeurs simples ; `vue` et `actif` mémorisés ; `CoucheActeurs` et `NoeudBande` mémorisés (rappels stables) ; le bloc de l'étape en cours lit lui-même son temps (reste, jauge, aperçu) |
| `EnTete`, `BarreScene` | re-rendus à chaque image (13 icônes comprises) | re-rendus à la structure ; seuls `HorlogeEnTete` (1 Hz) et `TempsEnCours` (4 Hz) suivent le temps |
| `OuEnEstOn`, `Pupitre`, `EnCoursProchain`, `AlerteSecurite`, `Commentaires`, `Emulateur` | tous à 60 Hz ; `Pupitre` calculait même fermé | `OuEnEstOn` et `Pupitre` ouvert : 4 Hz au plus ; `Pupitre` fermé ne calcule rien ; `EnCoursProchain` : au changement de cue seulement ; `AlerteSecurite` : 1 Hz (4 Hz s'il y a des repères de sécurité) |
| `PupitreRegie`, `ApercuSortie`, `usePastillesActeurs` | copies neuves à chaque image ; `useSortie()` et `useInterface()` sans sélecteur | comparés par contenu / `useShallow` / `memo` ; `usePastillesActeurs` rend le même objet tant qu'aucune pastille ne change (plus de rendu au tic d'une seconde) |
| tête de lecture (`conduite/TeteDeLecture.tsx`, `conduite.css`) | par image : `transform` de la tête **et** `left` du repère de zoom, `left`/`width` des hachures d'attente, `--avance` (largeur d'un fond) | par image : deux `transform` ; à 10 Hz : `--avance` lu par un `scaleX`, hachures par `clip-path` (largeur posée une fois) ; `cd-pulse` anime l'opacité d'un voile et non plus un fond |
| caméra de la planche | boucle `requestAnimationFrame` permanente en SPECTACLE | s'arrête à l'arrivée, repart au moment suivant |
| ticker PixiJS du calque de la sortie (`sortie/calque/calque.ts`) | tournait calque invisible (120 appels/s) | arrêté 600 ms après que le calque est devenu invisible (fin du fondu), relancé dès qu'il est montré |

Aucun changement visuel voulu : seuls des moments d'actualisation changent (jauges au quart de seconde au lieu de l'image, avancement des moments à 10 Hz, hachures à 10 Hz). La tête de lecture reste à l'image.

## 2. Protocole de mesure (sans navigateur, reproductible)

Il n'y a ni navigateur ni jsdom : `test-outils/faux-dom.ts` fournit juste assez de DOM pour que **le vrai `App`** (planche, en-tête, panneau,
barre de scène, conduite, rail, sortie…) soit monté par `react-dom`, avec le projet **Écho en SPECTACLE** ; `test-outils/rendus.ts` branche la
« fausse extension DevTools de React » (la porte officielle que `react-dom` appelle à chaque validation, la même que la sonde
navigateur de `outils/fluidite/sonde.ts`) et compte, par composant, les ré-exécutions. `requestAnimationFrame` est manuel : le test joue
chaque image à 60 i/s (`declencherImage`), donc la boucle de lecture du magasin avance comme dans le navigateur, sans dépendre de
l'horloge de la machine. Le faux DOM compte aussi **chaque écriture dans `element.style`** et isole celles qui changent la géométrie
(`left`, `width`, `height`…) : c'est ce qui oblige un vrai navigateur à refaire une mise en page.

```
SR_MESURES=1      npx vitest run --project conducteur-rapide apps/conducteur/src/performance.test.tsx     # tableau JSON des phases
SR_MESURES=detail npx vitest run --project conducteur-rapide apps/conducteur/src/performance.test.tsx     # + tous les composants ré-exécutés, phase par phase
npx vitest run --project conducteur-rapide --project modele                                               # preuves (les 12 tests de performance sont dedans)
```

Scénario (`performance.test.tsx`) : repos en pause (2 s) → premier GO puis **lecture dans l'étape** (2 s) → saut à la fin de l'étape,
**attente du GO** (2 s) → **un GO** (1 image) → glissement de la caméra vers le moment suivant → **régime établi** (2 s) → **pupitre ouvert**
(2 s) → pause (2 s). Les chiffres « avant » sont le même scénario sur le code de `integration/2026-10` (`fd8c733`), mis de côté avec
`git stash` des seuls fichiers source.

## 3. Chiffres avant / après (2 secondes = 120 images, 60 i/s)

| Phase | Mesure | Avant | Après |
|---|---|---|---|
| **Lecture dans l'étape** | validations React | 182 (91/s) | **10 (5/s)** |
| | composants ré-exécutés | 5 550 | **94** |
| | `Planche` / `EnTete` / `BarreScene` / `Panneau` | 120 / 120 / 120 / 0 | **0 / 0 / 0 / 0** |
| | `CoucheActeurs` / `Pupitre` / `PupitreRegie` / bloc de l'étape (`BlocEtape`) | 120 / 120 / 120 / 120 | **0 / 0 / 0 / 0** |
| | « Où en est-on » (`OuEnEstOn`) | 120 | 8 (4 Hz) |
| | aperçu de la sortie (`ApercuSortie`) | 126 | 8 (4 Hz, relais de la sortie) |
| | remplacements de `lecture` | 120 | 10 (battement 0,2 s) |
| | écritures de style / dont **géométrie** | 960 / **720** | 292 / **32** |
| **Attente du GO** | validations React | 122 (61/s) | **10 (5/s)** |
| | composants ré-exécutés | 4 822 | **62** |
| | `Planche` / `EnTete` / `BarreScene` / `Panneau` | 120 / 120 / 120 / 0 | **0 / 0 / 0 / 0** |
| | `CoucheActeurs` / `Pupitre` / `PupitreRegie` | 120 / 120 / 120 | **0 / 0 / 0** |
| | écritures de style / dont **géométrie** | 720 / **480** | 280 / **0** |
| **Un GO** (1 image) | validations / composants ré-exécutés | 2 / 151 | 2 / 131 |
| | `Planche` / `EnTete` / `BarreScene` | 1 / 2 / 2 | 1 / 1 / 1 |
| **Glissement de la caméra** après le GO (2,6 s, animation voulue) | `Planche` (une fois par image) | 240 sur 4 s | 125 sur 2,6 s |
| | `CoucheActeurs`, `EnTete`, `BarreScene`, `Pupitre` | 241 chacun | 125 (suit la caméra) / **0 / 0 / 0** |
| **Régime établi** après le GO | validations React | 126 (63/s) | **12 (6/s)** |
| | composants ré-exécutés | 5 671 | **94** |
| | `Planche` / `EnTete` / `BarreScene` / `CoucheActeurs` | 121 / 121 / 121 / 121 | **0 / 0 / 0 / 0** |
| **Pupitre ouvert** (touche P) | validations React | 125 | **13** |
| | `PupitreRegie` (2 instances) / `Planche` / `EnTete` | 240 / 120 / 120 | **0 / 0 / 0** |
| | écritures de style / dont géométrie | 1 200 / 960 | 309 / 48 |
| **Pause** | validations / composants | 1 / 0 | **0 / 0** |

Lecture des chiffres :

* « 0 rendu de `Planche`, `EnTete`, `Panneau` et `BarreScene` entre deux changements de structure » : **atteint** (lecture dans l'étape, attente du GO, régime établi, pupitre ouvert, pause).
* `Panneau` lui-même ne se ré-exécutait déjà pas (seul son bloc « Où en est-on » le faisait) ; le critère est tenu des deux côtés.
* Les 5 à 6 validations par seconde restantes sont les petits composants qui montrent le temps : horloge de l'en-tête (1 Hz), temps et jauge de la barre de scène (4 Hz), « Où en est-on » (4 Hz), reste / jauge / aperçu du bloc de l'étape (1 Hz et 4 Hz), aperçu de la sortie (4 Hz). Ils sont groupés par React : une seule validation par instant.
* Les écritures de géométrie qui restent (32 en 2 s en lecture, 0 en attente) sont les **jauges en pourcentage** de « Où en est-on » et du bloc de l'étape, à 4 Hz au plus. Plus aucune écriture de `left`, `top`, `right`, `bottom` ni `height` pendant la lecture (test).
* Ces chiffres comptent des rendus et des écritures, pas des millisecondes : ils ne remplacent pas la mesure navigateur du §4. Le comptage « avant » est plus bas que celui du navigateur (61 à 91 validations par seconde contre 129 mesurées par `outils/fluidite` : le faux DOM n'a ni polices, ni sortie réelle, ni les validations déclenchées par la mise en page) ; les rapports avant / après restent comparables entre eux.

## 4. À mesurer dans un vrai navigateur (relecteur) : commande et chiffres attendus

Je n'ai lancé **aucun navigateur** (consigne du propriétaire). La mesure d'acceptation se fait avec l'outil existant, **sur secteur**, régie en
construction de production, rien d'autre d'ouvert :

```
npm run fluidite -- --etiquette apres-performance-react --phase repos,lecture,go,go-lent,rendus
npm run fluidite -- --comparer outils/fluidite/resultats/20261029-1329-reference-secteur.json outils/fluidite/resultats/<fichier produit>.json
```

Ce que le lot vise (objectifs du rapport 07 §7 ; **ce sont des objectifs, pas des résultats mesurés**) et ce que le code permet d'espérer :

| Mesure `outils/fluidite` | Phase | Référence (secteur) | Objectif | Raison de l'espérer |
|---|---|---|---|---|
| validations React par seconde | `lecture`, `go` | 129 | **< 10** | 5 à 6 par seconde dans le comptage sans navigateur ; 39 validations/s « sans composant » du rapport (cause inconnue) restent à regarder si l'objectif n'est pas tenu |
| composants rendus par validation | `rendus` | 18,8 | < 3 | **probablement non atteint tel quel** : 6 à 9 en comptage (94 composants pour 10 validations), parce que React regroupe dans UNE validation tout ce qui change au même quart de seconde (dont les 6 composants de l'aperçu de la sortie) ; le nombre de validations par seconde et l'absence de la planche comptent davantage |
| `Planche`, `EnTete`, `Icô*` dans la liste des rendus entre deux GO | `rendus` | ≈ 69/s chacune | **absents** | 0 rendu dans le test |
| mises en page par seconde | `lecture` | 60 | **< 5** | plus aucune écriture de `left`/`width` par image ; restent les jauges à 4 Hz (≈ 4 à 8 mises en page/s : **la limite est serrée**, voir §6 question 2) |
| `Layerize` (`trace.parNom`) | `lecture` | 194 ms/s | **< 60 ms/s** | tête, repère, fond d'avancement et hachures ne déclenchent plus de mise en page |
| fil principal | `lecture` | 410 ms/s | **≤ 150 ms/s** | — |
| script par image (p50) | `lecture` (trace) | 1,7 ms | **< 1 ms** | — |
| plus grosse tâche | `lecture`, `go` | 31-34 ms | **< 20 ms** | moins de copies de tableaux → moins de GC majeur régulier |
| ×4 (processeur ralenti) | `go-lent` | 22 i/s ; 49 images > 50 ms | ≥ 50 i/s ; ≤ 5 images > 50 ms | — |
| `sortie.tickerPixi.execsParS` | `lecture` (scène QR / noir) | 120 | 0 une fois le calque invisible depuis plus de 0,6 s | `calque.ts` |

## 5. Choix à connaître

1. **Battement de 0,2 s.** `lecture` n'est pas seulement remplacée à la structure : elle l'est aussi quand son temps a avancé de 0,2 s de spectacle. Raison : le relais de la sortie (`sortie/useRelaisSortie.ts`, qui rafraîchit le chrono et les comptes à rebours de l'écran de scène), la salle collaborative (`etat/serveur.ts`, `lecture` envoyée aux postes) et le serveur de spectacle lisent `lecture.t` et se déclenchent sur son changement ; ces fichiers sont hors du périmètre du lot. Ces lecteurs étaient déjà limités à 4 Hz ; les composants, eux, n'y sont pas abonnés (leurs sélecteurs ne changent pas). Pour supprimer le battement, il suffirait que ces lecteurs s'abonnent à `useHorloge` : une ligne dans chacun.
2. **`etatVif` / `lectureVive`** (`etat/magasin.ts`) : la tête de lecture et le sélecteur `temps` de `conduite/Conduite.tsx` (non modifié) lisent `lecture.t` ; `etatVif(state)` leur donne une `lecture` à l'heure de l'horloge, **la même référence** quand elle l'est déjà. Ainsi la règle « après un clic sur la règle, on garde le temps cliqué tant que la lecture n'a pas bougé » reste exacte.
3. **`pause()`** remet `lecture` à l'heure avant d'arrêter (une nouvelle note, un saut, un export lisent `lecture.t`).
4. **Lecture miroir** (serveur de spectacle) : les tableaux reçus du serveur reprennent la référence précédente quand leur contenu est le même (`stabiliser`), pour ne pas faire passer chaque message pour un changement de structure.
5. **Calque PixiJS** : arrêté 600 ms après l'invisibilité (le fondu de `sortie.css` dure 500 ms), les événements du public arrivés pendant l'arrêt sont ignorés (ils se déverseraient en rafale au retour), les effets en vol reprennent où ils étaient.

## 6. Questions pour le relecteur

1. Le battement de 0,2 s de `lecture` est-il acceptable, ou faut-il que le lot suivant fasse lire `useHorloge` au relais de la sortie et à `serveur.ts` pour le supprimer ?
2. Si la mesure navigateur donne plus de 5 mises en page par seconde : convertir les jauges `.barre > span` (`coquille.css`, `barre-scene.css`, `planche.css`) de `width` en `transform: scaleX` ? Hors du périmètre de ce lot (CSS des jauges).
3. L'aperçu de la sortie dans le panneau est rafraîchi à 4 Hz par le relais (`sortie/**`) : à garder tel quel ?

## Mesure du relecteur dans le navigateur (29 octobre, 16 h, intégration `67564b1`)

Commande : `npm run fluidite -- --etiquette apres-performance-react --phase repos,lecture,go,go-lent,rendus` (Edge en
`--headless=old`, validé sur ce poste : aucune fenêtre listée par Windows, aucun processus restant), puis
`--comparer` avec la référence du matin `20261029-1329-reference-secteur.json`. Fichiers : `outils/fluidite/resultats/20261029-1508-apres-performance-react.json`
et `20261029-1504-essai-headless-old.json`. Machine partagée avec d'autres programmes (12 à 28 %).

| Phase | Mesure | Avant | Après | Variation |
|---|---|---|---|---|
| lecture (attente d'un GO, 60 s) | fil principal occupé (ms/s) | 410 | 311 | −24 % |
| | script (ms/s) | 74 | 19 | −74 % |
| | rendus React validés par seconde | 129 | 15 | −88 % |
| | sortie : script (ms/s) | 16 | 6 | −61 % |
| go (GO toutes les 5 s) | script (ms/s) | 91 | 37 | −59 % |
| | rendus React validés par seconde | 129 | 41 | −68 % |
| go-lent (processeur ralenti ×4) | images par seconde | 22 | 24 | +10 % |
| | script (ms/s) | 165 | 114 | −31 % |
| | rendus React validés par seconde | 45 | 20 | −56 % |
| rendus (construction de développement) | script (ms/s) | 468 | 166 | −65 % |
| | temps de rendu React (ms/s) | 215 | 106 | −50 % |

Lecture : les objectifs « script par image » et « validations » sont presque atteints (15 validations par seconde au
lieu de moins de 10 : les jauges en largeur rafraîchies 4 fois par seconde et l'aperçu de la sortie restent) ; le fil
principal reste à 311 ms/s parce que l'assemblage des calques par le navigateur (194 ms/s dans l'audit) n'a été réduit
que pour la tête de lecture. Sur une machine ralentie ×4, la saccade reste : la suite est dans les jauges (`scaleX`
au lieu de `width`), la conduite et la planche limitées à ce qui est vu, et la consigne d'exploitation (secteur, plan
Performances, construction de production).
