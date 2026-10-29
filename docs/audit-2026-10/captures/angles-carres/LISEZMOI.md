# Angles carrés : captures avant / après

Demande du propriétaire : plus aucun arrondi sur les cartes, boutons, panneaux, champs et pastilles de l'interface
globale. La **planche** (cartes de moments, blocs, liens, mini-carte) et le calque PixiJS de la sortie ne changent pas :
on les voit encore arrondis sur les captures, c'est voulu. Les pastilles d'état rondes restent des cercles
(`--rayon-rond`) ; les trois réglages sont dans `packages/theme/jetons.css` (`--rayon`, `--rayon-petit`, `--rayon-rond`).

Edge sans tête, 1440 × 900 (sauf le téléphone : 390 × 844), chaque PNG à moins de 250 Ko. « Avant » a été pris sur la
branche d'intégration avant toute modification, « après » avec les angles carrés, par le même script.

| Paire | Ce qu'elle montre |
|---|---|
| `01-conducteur-avant.png` / `01-conducteur-apres.png` | Conducteur, projet Écho : en-tête, rail des sorties, panneau de droite, conduite (planche visible, inchangée). |
| `02-acteurs-avant.png` / `02-acteurs-apres.png` | Fenêtre Projet › Acteurs (acteurs d'Écho posés, commandes converties en envois) : liste, champs, sélecteurs, puces. |
| `03-envois-avant.png` / `03-envois-apres.png` | Inspecteur, section ENVOIS d'une étape : cartes d'acteurs, étiquettes CHANGE / HÉRITE, boutons. |
| `04-emulateur-avant.png` / `04-emulateur-apres.png` | Émulateur de téléphones (touche E), foule démarrée : champs, boutons, nuage de points (restent ronds). |
| `05-telephone-vote-avant.png` / `05-telephone-vote-apres.png` | Un écran du téléphone (vote), application construite, téléphone émulé. |
| `06-sortie-mur-avant.png` / `06-sortie-mur-apres.png` | Sortie en scène `mur` (`sortie.html?scene=mur`) : le bandeau d'état en bas à droite ; la jauge SALLE est dessinée par le calque PixiJS (inchangée). |
| `07-sante-avant.png` / `07-sante-apres.png` | Page de santé du serveur de spectacle (réponse `/sante` factice, tout vert). |
| `08-checklist-avant.png` / `08-checklist-apres.png` | Check-list d'exploitation J-1 / H-1 / H-0. |

## Les refaire

Depuis la racine du dépôt (Windows, Edge installé ; `SR_EDGE=<chemin>` sinon), à la main, hors de la suite de tests :

```
node outils/captures-ui/captures.mjs avant     # écrit NN-nom-avant.png ici
node outils/captures-ui/captures.mjs apres     # écrit NN-nom-apres.png ici
node outils/captures-ui/captures.mjs apres C:\temp\essai    # ou dans un autre dossier
```

Le script construit l'application téléphone (`vite build`, dossier `apps/telephone/dist/`, ignoré par git), lance `vite`
pour le Conducteur (aucun serveur de spectacle n'est nécessaire), sert les pages de santé et le thème par un petit
serveur local, pilote Edge par le protocole DevTools (`apps/conducteur/src/test-outils/cdp.ts`) et arrête tout à la
fin. Un PNG de plus de 250 Ko est réduit en palette (`sharp`).

Pour des « avant » nouveaux, il faut le code d'avant : `git stash` ou une copie de travail sur le commit précédent.
