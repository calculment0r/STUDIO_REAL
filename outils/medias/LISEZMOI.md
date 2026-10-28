# Outils médias

Encoder les médias du spectacle (H.264 + AAC, `moov` en tête), puis les vérifier et produire `medias.json`.

## Encoder (PowerShell, ffmpeg dans le PATH)
```
.\outils\medias\normaliser.ps1 -Entree brut.mov -Sortie intro.mp4 -Cible telephone   # 720x1280
.\outils\medias\normaliser.ps1 -Entree brut.mov -Sortie fond.mp4  -Cible scene       # 1920x1080
.\outils\medias\normaliser.ps1 -Entree pas.wav  -Sortie pas.mp3   -Cible son         # MP3 128k
```
`-Ecraser` remplace une sortie existante.

## Vérifier (Node ≥ 20, ffprobe dans le PATH)
```
node outils/medias/verifier-medias.mjs dossier --cible telephone
node outils/medias/verifier-medias.mjs dossier --cible scene --manifeste scene.json --images-cles
```
Une ligne par fichier (OK / REFUSÉ + raisons) ; code 1 s'il y a un refus, 2 si ffprobe manque.
Manifeste (défaut `<dossier>/medias.json`) : nom, fichier, fichierVersionne (`nom.<8 car. sha256>.ext`), taille, sha256, duree, type, cible, ok, raisons.
`--images-cles` mesure l'écart entre images clés (refus au-delà de 2,5 s) ; plus lent.
Tests : `npx vitest run outils/medias`
