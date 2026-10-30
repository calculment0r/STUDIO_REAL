# Banc de mesure vidéo

Deux outils pour chiffrer AVANT/APRÈS la diffusion des vidéos aux téléphones (tunnel, serveur local, CDN).

## 1. Page téléphone : `banc.html`
1. Servir ce dossier avec n'importe quel serveur statique (`npx serve outils/banc-media`, Caddy, nginx...).
2. Générer un QR code vers `http://<ip-du-pc>:<port>/banc.html?src=<url-de-la-video>&mode=froid&n=5`
   (`mode` = `froid` | `tampon` | `cache`, `n` = répétitions, `&envoyer=<url>` pour un POST du JSON à la fin).
3. Sur le téléphone : ouvrir, garder l'écran allumé, toucher « Lancer » (geste obligatoire sur iPhone), puis « Copier le JSON ».
4. Les octets et le délai réseau demandent `Timing-Allow-Origin: *` côté serveur si la vidéo vient d'une autre origine.

## 2. Script de charge : `charge.mjs` (Node 20 ou plus, sans dépendance)
```
node outils/banc-media/charge.mjs --cible <url> --clients 150 --duree 60 [--plage 1048576] [--etalement 0]
```
Chaque client fait comme Safari : `HEAD`, `Range: bytes=0-1`, puis des plages successives. Le résumé JSON sort sur stdout,
le tableau sur stderr. `--cible` est obligatoire (aucune adresse par défaut), `--aide` donne l'usage.
Pour comparer : lancer la même commande (mêmes `--clients`, `--plage`, `--etalement`) une fois par chemin,
`https://…trycloudflare.com/…` (tunnel), `http://<ip-du-pc>:<port>/…` (serveur local), puis l'adresse du CDN, et mettre
les résumés côte à côte (débit total, TTFB p95, 429, 5xx).

## Critères proposés
- Première image p95 < 300 ms quand la vidéo est préchargée (mode `cache` ou `tampon`).
- Première image p95 < 1,5 s à froid sur le serveur local.
- 0 erreur 429 (et 0 erreur 5xx) à 150 clients au même top (`--etalement 0`).

Tests des statistiques : `npx vitest run outils/banc-media`.
