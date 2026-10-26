# 09 — Feuille de route et questions ouvertes

## Principe : dérisquer d'abord ce qui peut tuer le projet

Les trois risques qui peuvent rendre le spectacle impossible :
1. **Les téléphones** (iOS surtout) ne font pas ce qu'on croit → prototype banc d'essai.
2. **Le clavier** dévore l'écran ou fait sauter la mise en page → prototype clavier.
3. **La vidéo du streamer** n'arrive pas assez vite / assez stable → prototype flux.

Le moteur de scénario est un gros chantier mais un risque **maîtrisable** (c'est du logiciel pur, testable).

## Phase 0 — Prototypes de dérisquage (1 à 2 semaines)

| Prototype | Livrable | Preuve attendue |
|-----------|----------|-----------------|
| **P0.1 Banc d'essai** | page GitHub Pages : chaque capacité de [02](02-capacites-telephone.md) testée avec un bouton (couleur, vibration, son + mode silencieux, plein écran, wake lock, capteurs, caméra, torche, push, clavier) ; résultats envoyés et compilés | un tableau iOS/Android rempli sur ≥ 10 vrais téléphones, qui remplace les « à vérifier » |
| **P0.2 Clavier** | écran de saisie LIVE seul (3 zones, emojis maison, envoi sans fermer) | vidéo écran sur iPhone ancien/récent + Android : rien ne saute, la consigne reste visible |
| **P0.3 Flux** | streamer (téléphone en 4G) → LiveKit → page écran scène plein écran | latence mesurée < 500 ms, comportement en coupure 4G |
| **P0.4 Pops** | écran scène PixiJS : pops, danmaku, feux d'emojis, alimentés par un générateur de faux messages | 60 i/s avec 50 messages/s sur l'ordinateur de scène |

## Phase 1 — Le socle temps réel (3 à 4 semaines)

- Monorepo, schéma JSON du spectacle, protocole.
- Serveur de jeu : représentations, entrée QR + pseudo, jetons, **reprise sans perte**, instantanés + deltas, journal.
- Moteur v1 : segments, tops minutés, **gates avec règles** (tous les modèles de [03 §3.3](03-moteur-scenario.md)), populations, branches, ciblage.
- App spectateur : écrans attente / choix / bouton / texte / réactions ; effets couleur / vibration / son / notification dans la page.
- Régie live minimale : liste des joueurs, GO / retenir / sauter, envoyer à une sélection, panique, journal.
- Bots + test de charge 500 joueurs.
- *Un spectacle de test écrit à la main en JSON joue de bout en bout.*

## Phase 2 — LIVE jouable (3 à 4 semaines)

- Intégration du flux streamer dans l'écran scène ; vue privée du streamer avec consignes + « Reçu ».
- Écran scène : styles de commentaires, emojis, votes, gabarits par séquence, zone protégée.
- Modération (auto + tampon + file de validation) ; régie de poche des superviseurs.
- Synchronisation d'horloge et effets programmés.
- Répétition grandeur nature avec l'équipe.

## Phase 3 — Le studio (éditeur)

- Vue nodale des segments, vue timeline, éditeur de flowgraphes (React Flow), inspecteur de règles « en une phrase ».
- Aperçus de rôle en direct, validation du scénario, mode répétition (avance rapide, points d'arrêt, rejouer un journal).
- Bibliothèque de médias, écrans types paramétrables.

## Phase 4 — Extension

PWA + push après spectacle, sorties/entrées OSC-MIDI, zones/sièges et effets de salle (mosaïque, vague), capteurs avancés,
caméra du public, nœud IA encadré, statistiques après représentation.

## Questions à trancher (pour la prochaine séance)

**Projet LIVE**
1. Date de la première représentation (ou de la première répétition publique) ? Ça fixe ce qu'on coupe.
2. Jauge : combien de spectateurs maximum ?
3. Le streamer : en extérieur sur réseau mobile, ou dans un lieu maîtrisé ? Comédien qui improvise ou texte écrit ?
4. Le public voit-il la vidéo sur son téléphone, ou seulement sur scène ?
5. Le public peut-il envoyer photo/vidéo vers la scène ?
6. Qui modère pendant le spectacle (un poste dédié, les superviseurs) ?
7. Y a-t-il une régie son/lumière à piloter (QLab, console) ?

**Studio**
8. Hébergement du serveur : petit serveur loué, Cloudflare, ou machine en salle ? (recommandation : serveur loué pour commencer)
9. Les lieux de représentation ont-ils un Wi-Fi utilisable ? Peut-on y installer le nôtre ?
10. L'éditeur doit-il être utilisable par des non-développeurs dès la v1, ou d'abord un JSON écrit par nous ?
11. Accepte-t-on de demander l'installation PWA (plein écran iOS, push), ou reste-t-on 100 % « simple onglet » ?
12. Le nom de domaine : rester sur `calculment0r.github.io/STUDIO_REAL` ou un domaine dédié (plus court sur le QR, plus pro) ?
