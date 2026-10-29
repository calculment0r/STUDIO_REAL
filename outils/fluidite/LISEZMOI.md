# Outil de mesure de fluidité du Conducteur

Mesure, dans un VRAI navigateur (Edge sans tête, sans fenêtre), si le Conducteur « rame » pendant un spectacle : images par seconde,
images en retard, travail du processeur, nombre de rendus React, animations et minuteurs qui tournent, nombre de nœuds
du document, mémoire. Il **ne modifie aucun fichier du produit** : il construit le Conducteur à part (dans le dossier
temporaire), le sert sur un port local et l'observe de l'extérieur par le protocole DevTools. Rapport d'analyse :
`docs/audit-2026-10/07-fluidite.md`.

## Lancer

```
npm run fluidite                                  # tout le scénario, ≈ 4 min 30 (+ 20 s à la première construction)
npm run fluidite -- --aide                        # toutes les options
npm run fluidite -- --phase lecture,go            # seulement certaines phases (--lister pour les voir)
npm run fluidite -- --duree 0.3                   # essai rapide : durées × 0,3 (chiffres moins stables)
npm run fluidite -- --hypotheses                  # EXPÉRIENCES (zone masquée, animations coupées…), ≈ 3 min, fichier à part
npm run fluidite -- --sans-sortie                 # sans fenêtre de sortie
npm run fluidite -- --comparer avant.json apres.json
```

(`npm run fluidite` = `node --import tsx outils/fluidite/mesurer.ts`.) Le résultat est écrit dans
`outils/fluidite/resultats/AAAAMMJJ-HHMM-<étiquette>.json` (compact, moins de 100 Ko) et un tableau lisible sort à l'écran.
Sans Edge (ou avec `SR_SANS_NAVIGATEUR=1`, `SR_SANS_SERVEUR=1`) l'outil le dit et s'arrête sans erreur. Autre navigateur :
`SR_EDGE=<chemin de msedge.exe>`.

## Le scénario (fichier `scenario.ts`)

Projet Écho, mode SPECTACLE, fenêtre de régie 1440 × 900, fenêtre de sortie ouverte comme le produit le fait
(`window.open`, 1280 × 720), émulateur fermé. Deux constructions du Conducteur :

* **production** (comme `npm run build`, code réduit) : les chiffres à retenir ;
* **développement** (React non réduit) : pour savoir QUI coûte (noms de composants, profil, comptage des rendus). Plus lent que la réalité.

| Phase | Durée | Ce qu'on fait |
|---|---|---|
| `repos` | 8 s | SPECTACLE chargé, lecture en pause |
| `lecture` | 60 s | lecture en cours, aucun GO (le spectacle attend le premier GO : situation la plus fréquente d'un soir) |
| `onglet-cache` | 12 s | onglet de la régie caché (un autre onglet passe devant) |
| `sortie-cachee` | 12 s | fenêtre de sortie réduite |
| `sans-sortie` | 12 s | fenêtre de sortie fermée |
| `go` | 25 s | 5 GO espacés de 5 s (vrais clics de souris sur le gros bouton GO) |
| `go-lent` | 14 s | comme `go` (3 GO) avec un processeur 4 fois plus lent (portable modeste) |
| `lecture-dev`, `profil`, `rendus` | 10 / 15 / 16 s | construction de développement : écart avec la production, profil du processeur, rendus par composant |
| `hyp-*` (avec `--hypotheses`) | 10 s chacune | expériences par feuille de style injectée, et 20 modifications du projet |

L'ordre compte : tant qu'aucun GO n'est donné, le spectacle reste dans le même état, donc `lecture`, `onglet-cache`,
`sortie-cachee` et `sans-sortie` se comparent entre elles. Les GO viennent après.

## Comparer avant / après un correctif

1. Sur la version AVANT (ou la branche d'intégration) : `npm run fluidite -- --etiquette avant`.
2. Appliquer le correctif ; **même machine, même Edge, même scénario, rien d'autre d'ouvert** : `npm run fluidite -- --etiquette apres`.
3. `npm run fluidite -- --comparer outils/fluidite/resultats/<avant>.json outils/fluidite/resultats/<apres>.json`
   donne, phase par phase, avant / après / variation et « mieux » ou « pire ».

La construction est refaite toute seule si les sources ont changé (`--reconstruire` pour la forcer). Garder les deux
fichiers JSON dans la demande de fusion.

## Limites (à lire avant de conclure)

* **Machine de mesure** : portable de développement (Core i7-10875H, 16 cœurs logiques, 64 Go, carte Intel UHD + RTX 2080 Super). Une machine de spectacle plus modeste ira moins vite : la phase `go-lent` (processeur ×4 par réglage du navigateur) donne un ordre de grandeur, pas une mesure.
* **Edge sans tête n'est pas un écran réel** : pas de carte graphique réellement sollicitée par l'affichage, pas de projecteur, pas de plein écran, pas d'écran à 120 Hz. La fenêtre « réduite » est considérée comme cachée par le navigateur ; l'occultation par une autre fenêtre (Windows) n'est pas reproduite.
* **Les autres programmes comptent** : si la machine fait autre chose, les chiffres gonflent (la colonne « machine % » de chaque phase le dit ; au-dessus de 35 %, relancer). Les écarts de 10 % d'une exécution à l'autre sont normaux ; en dessous, ne rien conclure.
* **Le bruit d'une page vide** est mesuré au début (`bruitPageVide`) : environ 60 images par seconde ; les écarts « > 16,7 ms » y sont déjà fréquents (le chronomètre de l'écran tremble), c'est pourquoi les tableaux comptent les images en retard à partir de **20 ms**.
* **Le travail de la carte graphique et des fils de fond** (tramage, compositeur) n'est pas mesuré : seul le fil principal du processus de rendu l'est. La régie et la sortie partagent ce fil quand la sortie est ouverte par `window.open` (c'est le cas du produit) ; la colonne « fil » les additionne.
* Le comptage des rendus par composant (phase `rendus`) parcourt l'arbre React à chaque validation : il ralentit lui-même la page (comparer avec `lecture-dev`).
* Les noms de fonctions des phases en production sont réduits (`iu`, `r`, `Q`) ; les noms lisibles viennent des phases en développement.
* Les écritures du projet en `localStorage` ne sont exercées que par l'expérience `hyp-edition`.

## Propreté : aucun navigateur ne reste ouvert, aucune fenêtre dans la liste de Windows

* Par défaut le navigateur est lancé en `--headless=old` (ancien mode sans tête) : **aucune fenêtre n'est créée, ni visible ni listée par Windows**. Le mode `--headless=new` crée, lui, une fenêtre listée par page ouverte : il n'est disponible que derrière l'option explicite `--headless-new`, à n'utiliser qu'en dernier recours (par exemple si votre Edge refuse l'ancien mode ; les versions récentes d'Edge et de Chrome ont retiré l'ancien mode de leur programme : dans ce cas l'outil s'arrête avec un message clair et ne bascule PAS tout seul).
* Une seule instance, un seul profil jetable (`%TEMP%luidite-edge-*`) réutilisé pour toutes les pages ; les pages (régie, sortie, onglet vide) sont **fermées entre deux sessions**.
* En fin de lancement, réussi ou en échec (`try/finally`), à `Ctrl+C` ou à l'arrêt du processus : le navigateur et tous ses processus sont arrêtés (`taskkill /T`), puis le dossier du profil est supprimé.
* Au démarrage, l'outil **arrête les Edge orphelins** laissés par un lancement précédent (reconnus à leur profil `fluidite-edge-*`, jamais les autres Edge) et supprime les dossiers `%TEMP%luidite-*`.
* Pour le vérifier : `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'fluidite-' }` ne doit rien renvoyer une fois l'outil terminé.
* **État de validation** : le mode `--headless=old` n'a PAS pu être essayé sur cet Edge (lancement de tout navigateur interdit après la livraison des mesures ; les mesures enregistrées ont été faites en `--headless=new`). À essayer en premier par le relecteur, avec `npm run fluidite -- --phase repos --duree 0.3`.

## Fichiers

* `mesurer.ts` : le pilote (construction, serveur local, Edge, déroulé, écriture, `--comparer`).
* `scenario.ts` : les phases et les expressions évaluées dans la page.
* `sonde.ts` : le script injecté dans chaque page (compte requestAnimationFrame, minuteurs, rendus React, stockage, images en retard).
* `analyse.ts` : calculs purs (statistiques, trace du navigateur, profil du processeur, comparaison).
* `resultats/` : les mesures de référence du rapport.
