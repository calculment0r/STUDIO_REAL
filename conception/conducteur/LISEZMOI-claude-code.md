# Studio Real · Conducteur du spectacle — paquet pour Claude Code

## Ce qu'il y a dans le zip
- `Studio Real Conducteur (statique).html` — **la référence visuelle et fonctionnelle**. Un seul fichier, hors ligne, polices et scripts inclus. L'ouvrir dans Chrome : tout fonctionne (lecture, zoom, création de liens, panneaux, thème clair, plein écran).
- `source/` — le code lisible, à lire pour reprendre les valeurs exactes :
  - `Studio Real Conducteur.dc.html` : gabarit (markup à styles en ligne) + classe `Component` (toute la logique, ~600 lignes). `support.js` est le moteur d'affichage de l'outil de design : **ne pas le reprendre**, réécrire en React / Svelte.
  - `studio-real/conducteur-core.js` : données de démonstration (`mk()`), palette, catalogue d'assets, types de pistes, dessin des aperçus de blocs, format du temps.
  - `studio-real/blocs.js` : catalogue des 34 blocs du canvas (familles, réglages, aperçus animés).
  - `studio-real/tokens.css`, `uploads/Venus Rising Rg.otf`.
- `brief-initial/` — le brief d'origine et ses règles (thème, sliders, rôles, catalogue de nœuds).
- `etude-10-blocs.md` — les 10 blocs à ajouter, avec spécification.

## Le modèle (à respecter)
- **Conduite** (bas, pleine largeur) = la gestion générale : actes → moments → passages, plus des pistes (son, lumière, vidéo, téléphones, texte, notes, sécurité, courbes). Zoom et défilement façon Premiere (molette + Alt, barre de zoom à poignées, touches + / −).
- **Planche** (haut) = la machine à états de chaque moment : étapes (blocs) reliées par des sorties. En mode **Jouer**, la caméra suit la tête de lecture et cadre le moment en cours.
- **Sorties** : elles appartiennent à l'étape source, **ordonnées** ; évaluées de haut en bas, la première remplie gagne ; une sortie sans condition = « sinon ». Une étape dure au minimum sa durée prévue.
- **Passages** entre moments : `auto` (enchaîne dès que les conditions sont remplies) ou `go` (attend le top régie ; l'attente est mesurée, hachurée et cumulée dans « retard »).
- **Conditions** disponibles : durée, % de votes, % de téléphones prêts, silence (dB), public assis, issue du vote. En répétition, la « salle simulée » (4 rotatifs) produit ces signaux.
- **Zoom sémantique** de la planche : `< 50 %` vue d'ensemble (titres au-dessus des cadres, pastilles), `50–100 %` étapes (aperçu + règles sur les liens), `> 100 %` réglages (rotatifs, sorties détaillées). Les ronds d'entrée / sortie restent collés au bord des blocs à tous les zooms.
- **Format d'échange** : bouton « Exporter JSON » → `{format:'studio-real/conducteur@1', project, assets, runs}`. C'est la forme à stocker côté Cloudflare (D1 ou KV pour `project`, R2 pour les médias d'`assets`).

## Règles de design à ne pas casser
- Fond `#0a0d0b`, rampe corail `#f0b49b → #7a3a22`, vert profond `#1a3f2c / #2f6b4a`, accent `#e0674a`, encre tech `#b9cfd8`. Thème clair complet (`data-theme="light"`).
- Typo : Venus Rising pour titres et **tous les chiffres**, Chakra Petch pour le texte, Azeret Mono 7–9 px capitales pour les micro-étiquettes.
- **Tout chiffre qui change dans un en-tête a une largeur fixe et des chiffres tabulaires.** Les temps sont toujours `MM:SS` entiers, jamais de décimale.
- Panneau de droite en trois niveaux : essentiel visible → « Réglages » (ouvert) → « Avancé » (fermé). Pas de phrases d'aide dans le panneau.
- Vocabulaire du théâtre (acte, moment, étape, passage, top régie). Jamais « FSM », « nœud », « guard » dans l'interface.

## Ce qui n'est pas encore fait — recommandations
1. **Créer moments et actes plus directement** : clic droit sur la conduite (« nouveau moment ici », « couper ici », « nouvel acte à partir d'ici »), un « + » en fin de rangée, double-clic dans le vide de la planche. Aujourd'hui : bouton + MOMENT / touche M, et « Nouvel acte ici » dans Avancé.
2. **Les 10 blocs** de `etude-10-blocs.md`, dans l'ordre proposé (garde-fou de temps et mémoire d'abord).
3. **Collaboratif** (demandé dans le brief, absent ici) : présence et curseurs des membres, chat, commentaires épinglés sur une étape ou un instant de la conduite, visio (WebRTC via Cloudflare Calls), verrouillage par personne en mode Scène.
4. **Persistance réelle** : remplacer le stockage local des versions par l'API ; historique d'annulation à conserver côté client.
5. **Vrais signaux** : OSC / MIDI / clavier régie pour les tops et les commandes machines, avec accusé de réception (voir blocs 4 et 5 de l'étude).
6. **À tester sur machine réelle** : gestes du pavé tactile (pincement, deux doigts), plein écran hors aperçu, performances à 40+ moments.
7. **Décision à prendre** : le brief demandait des cartes et boutons **sans arrondi** ; la version actuelle suit le style NL-16 Station Rack (rayons 6–16 px), demandé ensuite. Trancher avant de reprendre les composants.
