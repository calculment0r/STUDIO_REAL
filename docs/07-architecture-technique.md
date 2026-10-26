# 07 — Architecture technique (proposition)

## 1. Vue d'ensemble

```
                    GitHub Pages (statique, HTTPS)
                    ├─ /           application spectateur / superviseur / streamer
                    ├─ /scene      écran scène
                    └─ /regie      régie + éditeur  (ou servi ailleurs, voir sécurité)
                               │ chargent le JS puis se connectent à ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ SERVEUR DE JEU  (WebSocket wss://)                                        │
│  ├─ moteur de scénario (package partagé, pur TypeScript, déterministe)    │
│  ├─ une « salle » par représentation : état en mémoire + journal          │
│  ├─ instantanés + journal persistés (SQLite / stockage du Durable Object) │
│  └─ API régie (authentifiée)                                              │
└───────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────┐      ┌─────────────────────────────────────────┐
│ SERVEUR VIDÉO (SFU)      │      │ PONT LOCAL (machine de régie)           │
│ LiveKit Cloud ou auto-   │      │ OSC / MIDI / Art-Net ⇄ serveur de jeu   │
│ hébergé                  │      └─────────────────────────────────────────┘
└──────────────────────────┘
```

## 2. Pile proposée

| Partie | Choix proposé | Pourquoi |
|--------|---------------|----------|
| Langage | **TypeScript partout** | un seul langage, le moteur tourne côté serveur, dans l'éditeur (simulation) et dans les tests |
| Organisation | monorepo pnpm | `packages/schema`, `packages/engine`, `packages/protocol`, `apps/player`, `apps/stage`, `apps/regie`, `apps/server`, `tools/bots` |
| Schéma du scénario | JSON + Zod (validation, types générés) | fichiers lisibles dans Git, erreurs claires dans l'éditeur |
| App téléphone | Vite + **Svelte** (ou Preact) | léger, démarre vite sur un vieux téléphone en 4G |
| Écran scène | Vite + **PixiJS** (WebGL) | particules, texte animé à 60 i/s |
| Régie / éditeur | Vite + React + **React Flow (xyflow)** pour les nœuds + timeline maison | React Flow est la référence des éditeurs nodaux web |
| Serveur de jeu | Node + `ws` (ou uWebSockets.js) **ou** Cloudflare Durable Objects | voir §3 |
| Vidéo | **LiveKit** (WebRTC, SDK web, simulcast) | open source, auto-hébergeable, offre cloud ; alternative : Cloudflare Realtime (WHIP/WHEP) |
| Tests | Vitest (moteur), Playwright (émulation mobile), bots maison (charge) | |

## 3. Où tourne le serveur de jeu ? (décision à prendre)

| Option | + | − |
|--------|---|---|
| **A. Node sur un petit serveur loué** (VPS) | simple, tout est maîtrisé, facile à déboguer ; une représentation = un processus | un serveur à maintenir, une seule région |
| **B. Cloudflare Workers + Durable Objects** (un objet par représentation) | conçu exactement pour ça (état + WebSockets par salle), rien à maintenir, proche du public, très peu cher | modèle d'exécution particulier, débogage moins direct |
| **C. Sur l'ordinateur de régie dans la salle** + tunnel | marche même si Internet tombe (si le public est sur le Wi-Fi local) | certificats HTTPS locaux compliqués, le public en 4G passe par le tunnel (donc par Internet quand même), la machine devient critique |

**Recommandation** : écrire le moteur et le protocole indépendamment de l'hébergement ; **commencer en A** (développement et répétitions,
y compris sur un DGX via Tailscale), et évaluer **B** pour la production. C n'est utile que pour des lieux sans Internet fiable.

## 4. Protocole temps réel (principes)

- Messages JSON courts (passage à un format binaire si besoin plus tard).
- **Serveur → client** : `snapshot` (état complet du joueur) puis `delta`s numérotés (`seq`). Le client conserve le dernier `seq`
  et le renvoie à la reconnexion ; le serveur renvoie les deltas manquants ou un nouvel instantané.
- **Client → serveur** : entrées (`vote`, `texte`, `réaction`, `capteur`) avec un **identifiant unique** : un message renvoyé après
  une coupure n'est jamais compté deux fois (un vote = un vote).
- **Effets programmés** : `{effet, cible, à: heureServeur}` envoyés quelques centaines de ms à l'avance pour la synchronisation.
- **Battement de cœur** toutes les 5 s (présence + latence + mesure du décalage d'horloge).
- **Capteurs** : agrégés sur le téléphone, envoyés à 5 Hz max.
- Ordre de grandeur : 500 joueurs × quelques messages/s = trivial pour un seul processus Node ou un Durable Object.

## 5. Sécurité

- Le dépôt est **public** (GitHub Pages) : aucun secret dans le code ; les clés (LiveKit, régie) restent côté serveur.
- **Régie** : authentification forte, idéalement accessible seulement via Tailscale ou un accès protégé (Cloudflare Access par ex.).
- Jetons joueurs aléatoires, liés à une représentation, sans valeur ailleurs.
- Limitation de débit par joueur et par IP ; taille maximale des messages.
- Jetons vidéo LiveKit à durée courte, émis par le serveur selon le rôle (seul le streamer peut publier).
- Données : pseudos et messages purgés après la représentation (sauf archive voulue et annoncée).

## 6. Tests et qualité

- **Moteur** : tests unitaires des règles de passage (« 100 % des présents » avec déconnexions, délais, forçages, branches).
- **Rejeu** : un journal de représentation réelle devient un test de non-régression.
- **Bots** : `tools/bots` lance 500 joueurs simulés (latences, déconnexions, lenteur) contre un serveur → mesure des temps de passage.
- **Banc d'essai appareils** : la page de test des capacités (voir [09](09-feuille-de-route-et-questions.md)) et une matrice
  iPhone/Android réels avant chaque création.

## 7. Répartition du travail (agents)

Le moteur, le protocole, la sécurité et l'architecture restent pilotés par Claude.
Les tâches bornées (écrans types, nœuds d'action, tests du moteur, bots, page banc d'essai, doc) peuvent être déléguées
aux agents locaux des DGX (Qwen, gratuit) ou à Sonnet/Haiku via l'API, avec un brief par tâche et relecture de chaque PR.
