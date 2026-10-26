# Étude — Éditeur nodal, timeline, sémantique d'exécution, outils de régie

*Date : 26 octobre 2026. Complète [03 — Moteur de scénario](../03-moteur-scenario.md), [05 — Régie et éditeur](../05-regie-et-studio.md) et [07 — Architecture](../07-architecture-technique.md).*
*Les renvois `[S12]` pointent vers la liste de sources en fin de document. Les chiffres de versions et de dates viennent du registre npm et de l'API GitHub consultés le 26/10/2026. Quand un point n'a pas pu être vérifié aujourd'hui (page introuvable, document illisible), il est marqué **(non vérifié)**.*

---

## 0. Résumé et recommandations

**Éditeur nodal et timeline**

1. **Ne pas figer React Flow comme dans le doc 07.** La direction artistique impose le thème de SHOWRUNNER_TOOLS (vanilla JS, nodal et timeline maison). Le thème n'est pas l'obstacle : les bibliothèques à nœuds en DOM se thèment en CSS avec `design/tokens.css`. Le vrai critère est le coût d'intégration d'un second framework dans un outil vanilla, face au coût d'un éditeur maison qui existe déjà en partie.
2. **Voie A (recommandée) : noyau « graphe » maison, sans interface, en TypeScript, avec un rendu vanilla** (SVG + DOM, thème par jetons CSS). Le noyau porte le modèle, les broches typées, la validation, les commandes annuler/rétablir et la sérialisation. Le rendu reprend le nodal et la timeline de SHOWRUNNER_TOOLS s'ils passent la grille d'audit du §1.6 (à faire en 2 jours, je n'ai pas eu accès au code de cet outil : seul `design/tokens.css` est dans le dépôt).
3. **Voie B (repli) : `@xyflow/react` ou `@xyflow/svelte` pour le nodal seulement**, timeline maison. Le Svelte est cohérent avec l'application téléphone (doc 07) et se monte comme un îlot dans une page vanilla.
4. **À écarter** : LiteGraph (canvas, thème difficile, dépôt Comfy archivé, code repris dans un dépôt GPL-3.0), Flume (une seule version publiée récemment, pas de broches d'exécution), Baklava (Vue, surcouche moteur inutile), Node-RED (éditeur non embarquable, source d'idées seulement), Theatre.js (studio AGPL-3.0, publications arrêtées depuis mai 2024, pensé pour l'animation).
5. **Timeline : maison, dans tous les cas.** Une timeline de tops, de clips et de gates est un objet métier ; aucune bibliothèque ne modélise des gates ni un mode live avec « standby ». `@xzdarcy/react-timeline-editor` est le seul candidat crédible, et seulement en voie B.

**Sémantique d'exécution** (détail au §2.7)

6. **Moteur = fonction pure `step(état, entrée) → (état', effets)`**, sans horloge ni aléa cachés. Toute la vie du spectacle passe par un journal d'entrées numérotées.
7. **Les nœuds latents sont des « fibres » stockées comme des données** (nœud courant, ce qu'elle attend, variables figées), jamais des coroutines ou des promesses. C'est ce qui permet l'instantané, la reprise et le rejeu.
8. **Les minuteurs sont des enregistrements dans l'état** (`{id, échéance, domaine d'horloge}`), réveillés par une entrée `timer` du journal. L'hébergeur (Node ou Durable Object) ne fait que réveiller le moteur.
9. **Les effets sont des sorties du moteur**, pas des appels. Au rejeu, on ne les réémet pas (même règle que XState : les actions ne sont pas rejouées à la restauration [S19]).
10. **XState : s'en inspirer, ne pas l'adopter comme moteur.** L'horloge est injectable [S22], mais les fibres, les populations et le journal propre au studio obligent à un état maison. Un moteur de ~1 500 lignes écrites pour le besoin vaut mieux.
11. **Schéma JSON v2** au §4 : broches typées (`exec` + types de données dont `target` paresseux et `players` figé), liens, gates avec machine à états standard et règles en arbre d'expression, positions des nœuds dans un fichier à part pour des diffs Git lisibles. Liste de ~45 nœuds pour la v1 au §4.7.

**Régie, OSC, MIDI**

12. **Prendre à QLab** la séparation entre le *playhead* (le cue prêt à partir, « standby ») et ce qui joue, ainsi que les trois modes d'enchaînement (GO, auto-continue, auto-follow) [S28]. **Prendre à Chataigne** l'idée d'un pont qui relie tous les protocoles ; il peut servir de pont jetable pour la v1 [S29].
13. **OSC/MIDI : jamais depuis le navigateur.** Le navigateur ne fait pas d'UDP ; Web MIDI n'existe pas sur Safari iOS [S36]. Un petit **pont local Node** (`node-osc`, `@julusian/midi` ou `easymidi`) se connecte en sortant au serveur de jeu par WebSocket (§3.4).

---

## 1. Bibliothèques d'édition nodale et timeline

### 1.1 Ce que le studio doit éditer (cahier des charges)

| Objet | Taille attendue | Particularités |
|-------|-----------------|----------------|
| Graphe macro (segments + gates) | 10 à 60 boîtes | losanges de gates à plusieurs sorties, retour en arrière possible, zoom sémantique utile |
| Flowgraphe (segment, événement, gate) | 5 à 200 nœuds | **deux familles de broches** (exécution et données), types de données vérifiés à la connexion, nœuds latents, sous-graphes/macros, commentaires |
| Timeline | 5 à 30 pistes, quelques centaines de tops | blocs avec durée, marqueurs, points d'arrêt (gates) comme jalons, playhead en direct, mode « standby » |

Les graphes sont petits. **La performance de rendu de milliers de nœuds n'est pas un critère décisif** ; la qualité d'édition (broches typées, annuler/rétablir, copier/coller, recherche de nœud, commentaires) et la facilité à thémer le sont.

### 1.2 Tableau comparatif (données du 26/10/2026)

| Bibliothèque | Rendu / cadre | Licence | Version et date | Activité | Notes |
|---|---|---|---|---|---|
| **React Flow** (`@xyflow/react`) | DOM + SVG, React ≥ 17 | MIT | 12.12.0, 24/09/2026 | 38,8 k étoiles, commit du jour [S1][S2] | La référence. Nœuds = composants React, donc CSS libre. Validation de connexion via `isValidConnection` [S5]. |
| **Svelte Flow** (`@xyflow/svelte`) | DOM + SVG, Svelte 5 | MIT | 1.7.0, 24/09/2026 | même dépôt | Même cœur `@xyflow/system` 0.0.83 (d3-zoom, d3-drag, d3-selection) [S6]. |
| **Rete.js v2** | agnostique + plugins de rendu React, Vue, Angular, Svelte, Lit | MIT | `rete` 2.0.6 (30/06/2025) ; plugin area 2.3.2, plugin React 2.1.2 (07/2026) ; `rete-engine` 2.1.1 (12/2024) | 12,3 k étoiles, commit du 25/10/2026 [S7][S8] | Moteurs intégrés : flux de données et flux de contrôle « comme UE4 Blueprints » [S8][S9]. Plus d'abstractions à apprendre ; un rendu vanilla demanderait un plugin maison (non vérifié). |
| **LiteGraph / ComfyUI** | Canvas2D | MIT (paquet) | `@comfyorg/litegraph` 0.17.2 (08/2025) ; original `litegraph.js` 0.7.18 (01/2024) | Dépôt Comfy : « archivé, code déplacé dans ComfyUI_frontend » [S10] ; ComfyUI_frontend est en **GPL-3.0** [S11] ; original poussé pour la dernière fois en 08/2024 [S12] | Sait tourner côté serveur Node [S10]. Le fork Comfy est « largement incompatible » avec l'original. Thème par peinture canvas : le CSS ne s'applique pas. |
| **Baklava.js** | Vue | MIT | 2.8.1, 02/11/2025 | 2,1 k étoiles, commit du 23/10/2026 [S13] | Moteur de calcul de graphe intégré (`@baklavajs/engine`). Vue 3 non confirmé par la page consultée. |
| **Flume** | React | MIT | 1.2.0, 05/11/2025 | 1 version récente, peu de signaux d'activité [S14] | Ports typés et couleurs, moteur de flux de données simple ; pas de broches d'exécution. |
| **Node-RED (éditeur)** | éditeur lié au runtime Node-RED | Apache-2.0 | 5.0.9, 21/10/2026 | 23,8 k étoiles, commit du jour [S15] | Modèle de messages sur fils, panneau de debug. **Non conçu pour être embarqué** : source d'idées. |
| Autres écartés | Drawflow (0.0.60, 2024), `@projectstorm/react-diagrams` (7.0.4, 02/2024), Reaflow (5.4.1, 04/2025), Svelvet (11.0.5, 02/2025), AntV X6 (3.1.8, 08/2026), Blockly (13.4.0, blocs imbriqués plutôt que fils) | MIT / Apache-2.0 | | | Soit peu maintenus, soit un autre paradigme (blocs). |

**Points de licence à noter**
- React Flow est MIT, mais le site demande de ne retirer le petit bandeau d'attribution qu'en souscrivant à React Flow Pro (de 169 $/mois, abonnement qui finance le projet et donne des exemples Pro) [S4]. À arbitrer : garder l'attribution (gratuit) ou s'abonner. Sans abonnement, le code reste utilisable.
- Theatre.js : cœur Apache-2.0, **studio AGPL-3.0** [S18] ; la copie du studio dans un outil distribué est le piège.
- Chataigne est en GPL-3.0 [S29] : on l'utilise comme outil à côté, on ne l'embarque pas.
- `osc` (npm) : « MIT OU GPL-2.0 » ; `osc-js` : MIT ; `node-osc` : Apache-2.0 [S35].

### 1.3 Analyse par critère

**Performances.** La documentation de React Flow ne donne aucun seuil chiffré ; elle conseille de mémoïser les nœuds personnalisés, de ne pas lire tout le tableau `nodes` dans un composant, de replier les arbres profonds et d'alléger les styles (ombres, dégradés) [S3]. Pour des graphes de moins de 200 nœuds, c'est sans objet. LiteGraph (canvas) tient mieux des milliers de nœuds, mais ce n'est pas notre besoin. *(Remarque de bon sens, non mesurée : un rendu DOM/SVG maison de quelques centaines de nœuds est aussi fluide qu'une bibliothèque DOM.)*

**Personnalisation et thème.** Tout ce qui est DOM (React Flow, Svelte Flow, Rete avec rendu DOM, Baklava) se thème en CSS avec les variables de `design/tokens.css` (`--bg`, `--panel`, `--ink`, `--cy`, `--or`…). Un composant ne sait jamais quel thème est posé, ce qui correspond à la règle de SHOWRUNNER_TOOLS. LiteGraph dessine en canvas : il faudrait relire les jetons en JS et repeindre à chaque changement de thème.

**Broches d'exécution contre broches de données.** Aucune bibliothèque ne donne gratuitement le modèle Blueprint complet. React Flow : on écrit les `Handle` (forme = exécution, couleur = type) et la règle de compatibilité dans `isValidConnection` [S5]. Rete : les sockets ont une compatibilité déclarée, et un moteur de flux de contrôle existe [S8], mais **nous n'exécutons pas le graphe dans le navigateur** (le moteur tourne côté serveur et doit être rejouable, §2), donc l'avantage est mince.

**Maintenance.** React Flow / Svelte Flow : projet financé, très actif, versions de septembre 2026. Rete : actif (commit du 25/10/2026) mais le paquet `rete` date de juin 2025 et le moteur de décembre 2024. Baklava : actif. LiteGraph : fin de vie du fork autonome. Flume : maigre. Theatre : publications arrêtées (0.7.2, mai 2024) [S18].

**Dépendance de cadre.** Le doc 07 prévoit déjà React pour la régie, Svelte pour le téléphone, PixiJS pour la scène. Choisir React Flow ajoute React dans la régie ; choisir Svelte Flow réutilise Svelte (déjà dans la pile). Un outil de régie vanilla JS n'a besoin ni de l'un ni de l'autre.

### 1.4 Éditeurs de timeline

| Option | Licence | Version / activité | Modèle | Verdict |
|---|---|---|---|---|
| `animation-timeline-js` | MIT | 2.3.5, 07/2024 ; 470 étoiles ; TypeScript, canvas, sans dépendance, exemples HTML/Angular/React/Svelte [S16] | image-clé (keyframes) en lignes et groupes, zoom, accrochage, sélection multiple | Utilisable en vanilla, mais pensé pour des images-clés ; pas de bloc à durée ni de gate. Peu actif depuis 2024. |
| `@xzdarcy/react-timeline-editor` | MIT | 1.0.0, 25/01/2026 ; 800 étoiles ; composants `Timeline`, `TimelineRow`, `TimelineEffect` [S17] | lignes, actions (blocs) et effets | Modèle le plus proche des « tops et clips », mais React obligatoire. Fonctions détaillées non vérifiées (la page ne les liste pas). |
| Theatre.js | cœur Apache-2.0, studio AGPL-3.0 | 0.7.2, 05/2024 ; dépôt poussé 08/2024 [S18] | feuilles, objets, propriétés animées sur une séquence | Écarté : paradigme « animation de propriétés », AGPL, inactif. |
| **Maison** | – | – | pistes de tops, clips, marqueurs, jalons de gates, playhead live | **Recommandé.** |

Une timeline de régie a des besoins que les bibliothèques ignorent : jalons de gates qui s'étirent entre `min` et `max`, état « armé / retenu » affiché en direct, compte à rebours, saut vers un segment, mode répétition à vitesse ×10. Inspiration : Vezér (pistes OSC/MIDI/DMX, points de repère, sauts, boucles, points d'arrêt, file de compositions) [S30] et Millumin (colonnes de cues + timeline + tableau de bord) [S31].

### 1.5 Option « éditeur maison en vanilla JS »

**Pour**
- Conforme à la direction artistique (même thème, mêmes composants, mêmes raccourcis que SHOWRUNNER_TOOLS), zéro cadre supplémentaire, aucune licence tierce, aucun bandeau.
- Le **modèle** est à nous de toute façon : broches typées, gates, populations, validation « segment inaccessible / gate sans délai max ». Une bibliothèque ne fournit que le dessin, le panoramique/zoom et le glisser.
- Un rendu vanilla peut aussi servir le **rendu en lecture seule** dans les apps de répétition et d'aperçu, sans charger React.

**Contre**
- Estimation (mon évaluation, non mesurée) : nodal ≈ 2 000 à 4 000 lignes et 2 à 4 semaines (panoramique/zoom, glisser, broches, liens courbes, sélection rectangle, annuler/rétablir, copier/coller, commentaires, réacheminement, mini-carte, palette de recherche) ; timeline ≈ 2 000 à 3 000 lignes et 2 à 3 semaines. Une bonne partie est du code d'interaction qui existe déjà chez SHOWRUNNER_TOOLS.
- Accessibilité clavier et tactile à refaire.
- Risque de réinventer des bugs de pointeur que React Flow a déjà résolus.

**Atténuations**
- Séparer le **noyau** (modèle, commandes, validation, mise en page automatique avec `@dagrejs/dagre` 3.1.3, MIT, 24/10/2026) du **rendu**. Le noyau est testable avec Vitest sans navigateur ; le rendu est remplaçable (SHOWRUNNER vanilla, ou React Flow en repli).
- **Option hybride** : `@xyflow/system` (MIT, 0.0.83) est le cœur « sans cadre » de React Flow et de Svelte Flow [S6] ; il fournit panoramique/zoom (d3-zoom), glisser (d3-drag) et logique de connexion. On pourrait bâtir le rendu vanilla dessus. Son API est jeune (version 0.0.x) : à tester avant de s'y engager.
- Déléguer aux agents locaux (doc `dgx-agents`) les tests du noyau, la validation et les générateurs de nœuds ; garder pour Claude le modèle de broches et la sémantique.

### 1.6 Grille d'audit du nodal et de la timeline de SHOWRUNNER_TOOLS (2 jours)

À remplir avant de décider (je n'ai pas vu le code) :

| Critère | Doit avoir | Si non |
|---|---|---|
| Deux familles de broches (exécution / données) avec formes distinctes | oui | ajouter au modèle |
| Types de données vérifiés à la connexion (table de compatibilité) | oui | ajouter une table de types + `canConnect()` |
| Modèle de graphe séparable du DOM (JSON in/out, sans état caché dans le rendu) | oui | extraire le noyau |
| Annuler/rétablir par commandes | oui | écrire le journal de commandes |
| Copier-coller, multi-sélection, commentaires, groupes | oui | à écrire |
| Nœuds de grande taille variable (paramètres dans le nœud) | oui | |
| Mise en page automatique ou au moins « aligner » | souhaitable | `dagre` |
| 200 nœuds + 400 liens à 60 i/s sur le portable de régie | oui | virtualiser ou passer en canvas pour les liens |
| Timeline : blocs à durée, jalons, marqueurs, zoom, accrochage, playhead | oui | |
| Rendu en lecture seule + surlignage d'état live (nœud actif, fibres en attente) | oui | essentiel pour le mode répétition et le débogage |

**Décision** : ≥ 8 « oui » sur 10 → voie A. Sinon voie B pour le nodal (Svelte Flow en priorité), timeline maison.

---

## 2. Sémantique d'exécution : ce que font les autres, ce qu'on emprunte

### 2.1 Unreal Blueprints
- Deux familles de broches : **exécution** (blanches) et **données** (typées, couleurs). Les nœuds « purs » sont évalués à la demande lorsqu'un nœud d'exécution lit leur sortie.
- **Nœuds latents** (`Delay`, `MoveTo`…) : ils n'existent que dans les graphes d'événements, **pas dans les fonctions** [S24]. Le mécanisme (gestionnaire d'actions latentes réveillé à chaque image du moteur) est une information générale, non revérifiée aujourd'hui (la page n'en donne que le titre).
- À emprunter : la double nature des broches, les nœuds purs, la restriction « latent seulement là où un fil de longue durée a sens », les macros. À éviter : l'état d'une action latente est en mémoire (fermetures), donc ni sérialisable ni rejouable.

### 2.2 Unity Visual Scripting
- Deux sortes de graphes (flux de script avec broches de flux et de valeur ; graphes d'état) et événements-coroutines. **(non vérifié : les pages de manuel interrogées répondaient 404.)**
- À emprunter : la séparation « graphe de flux » / « machine à états » — exactement notre distinction flowgraphe / gate.

### 2.3 Godot
- VisualScript a été retiré de Godot 4 : malgré les efforts, « il n'a jamais trouvé son public », la conception n'était pas assez conviviale et les utilisateurs préféraient GDScript [S23].
- Leçon : **un langage visuel généraliste attire peu**. Garder un jeu de nœuds restreint et métier (votes, ciblage, effets, minuteries) plutôt que d'y reconstruire un langage. Prévoir une sortie de secours : expressions courtes, jamais un nœud « code libre » en v1.

### 2.4 Node-RED
- Un message est un objet JavaScript (`payload` par défaut) avec un identifiant `_msgid` ajouté automatiquement pour le suivre ; les messages peuvent former des séquences (`msg.parts` : `id`, `index`, `count`) ; l'état partagé vit dans des contextes de flux et global [S15].
- À emprunter : le **panneau de debug** (voir passer les valeurs sur les fils), l'idée d'identifiant de trace (nous : `fibreId` + `seq`), les séquences nommées pour « pour chaque joueur ». À éviter : pas de distinction exécution/données, pas de déterminisme, état dans le contexte de runtime.

### 2.5 XState (statecharts et acteurs)
- **Persistance** : `getPersistedSnapshot()` donne l'état interne, restituable par `createActor(machine, { snapshot })`. Les acteurs invoqués et créés sont sauvés récursivement. « Les actions des machines ne sont **pas** réexécutées » à la restauration. L'état doit être sérialisable en JSON, et peut devenir incompatible si la logique de la machine change [S19].
- **Rejeu d'événements** (event sourcing) : on enregistre `@xstate.event` via l'API d'inspection et on renvoie les événements dans l'ordre à un nouvel acteur [S19][S21]. Les docs ne décrivent pas de fonction de rejeu clé en main.
- **Minuteries** : les transitions `after` sont annulées à la sortie de l'état [S20] ; elles s'appuient sur une `clock` remplaçable (`SimulatedClock` pour les tests) [S22]. Le comportement des minuteries à la restauration n'est pas documenté : nous le définirons nous-mêmes.
- À emprunter : **run-to-completion** (on traite les événements un par un jusqu'à stabilité), **gardes** nommées, **actions déclaratives qui ne s'exécutent pas au rejeu**, **portée des minuteries liée à l'état** (sortir d'un segment annule ses délais), état en JSON.
- Pourquoi ne pas adopter XState tel quel : nos gates dépendent de populations calculées, de fibres de flowgraphe persistées et d'une horloge de spectacle pausable ; il faudrait quand même un état et un journal maison par-dessus, et les versions de scénarios modifiés posent le même problème de compatibilité. On garde XState comme **référence de conception** et éventuellement comme **oracle de test** de la machine d'une gate (sur quelques scénarios).

### 2.6 Arbres de comportement, Ink, Yarn Spinner, Twine

**Arbres de comportement** : chaque nœud renvoie *succès / échec / en cours*, la racine envoie un « tick » à fréquence fixe ; la séquence s'arrête au premier échec, le sélecteur au premier succès [S25]. À emprunter : le statut **« en cours »** comme valeur de retour d'un nœud latent, et les politiques de jointure de `En parallèle` (tous / un seul / premier qui réussit).

**Ink** : boucle `Continue()` puis choix ; `state.ToJson()` / `LoadJson()` sauvegardent et restaurent tout l'état ; fonctions externes liées par l'hôte, avec indication « sans effet de bord » (`lookaheadSafe`) ; observateurs de variables [S26]. Le déterminisme et la graine aléatoire n'y sont pas documentés **(non vérifié)**. À emprunter : **le récit ne produit que des demandes à l'hôte** (texte, choix, appel externe) ; l'hôte les exécute — c'est notre séparation moteur / effets. À emprunter aussi : classer les fonctions externes en « pures » et « avec effet ».

**Yarn Spinner** : nœuds, `jump`, options conditionnelles dont les indisponibles sont quand même livrées et c'est le jeu qui choisit comment les afficher ; si toutes les options sont indisponibles, le groupe est sauté [S27]. Le runtime émet lignes, options et commandes que l'hôte traite. À emprunter : **un choix conditionnel reste visible côté régie même quand il est indisponible côté public** (affichage grisé « pourquoi »), et la règle de repli quand aucune option n'est disponible (gate : `sinon`).

**Twine** : passages et liens, historique des passages pour l'état **(non vérifié, connaissance générale)**. Emprunt faible : c'est notre graphe macro de segments, sans machine à états.

### 2.7 Règles de sémantique recommandées pour le moteur (R1 à R14)

Ces règles précisent le doc 03 §8 ; elles sont numérotées pour pouvoir être citées dans le code et les tests.

| N° | Règle | Pourquoi / origine |
|----|-------|---------------------|
| **R1** | Le moteur est une fonction pure `step(état, entrée) → { état, effets }`. Il ne lit ni l'heure, ni un aléa, ni le réseau. | Rejeu exact, tests sans simulateur. |
| **R2** | Tout ce qui arrive est une **entrée de journal** numérotée (`seq`), idempotente par `id` (un vote renvoyé après une coupure n'est jamais compté deux fois, cf. doc 07 §4). Types : `init`, `join`, `leave`, `presence`, `input`, `ops` (GO, retenir, sauter, panique…), `tick`, `timer`, `ext` (OSC/MIDI/pont). | Event sourcing. |
| **R3** | **Le temps est une entrée.** Une entrée `tick` porte l'heure serveur `ts` ; le moteur en déduit l'avancement de l'horloge de spectacle (nul si pause). Les minuteries appartiennent à un domaine : `show` (pausable) ou `server` (non pausable). | Doc 03 §7. |
| **R4** | **Un minuteur est une donnée** `{ id, domaine, échéance, propriétaire }` dans l'état. L'hébergeur planifie un réveil à la plus proche échéance et ajoute une entrée `timer`. Les réveils sont « au moins une fois » (Durable Object : une seule alarme par objet, réessais exponentiels, jusqu'à 6 [S37]) : le moteur déduplique par `id`. | Un hébergeur à un seul réveil par objet suffit. |
| **R5** | **Nœud latent = fibre persistée.** Une fibre est `{ id, graphe, nœud courant, valeurs de données figées, attente, propriétaire }` où `attente` ∈ minuteur, événement (avec filtre et minuteur d'expiration), condition. Aucune fermeture JavaScript, aucune promesse dans l'état. | Reprise après crash, instantané, rejeu. Corrige le défaut des actions latentes d'UE et des coroutines Unity. |
| **R6** | **Propriétaire et portée.** Chaque fibre et chaque minuteur appartient à un segment, une gate, un événement global ou au spectacle. Sortir du propriétaire les annule (comme une transition `after` XState [S20]). | Évite les fuites d'un segment à l'autre. |
| **R7** | **Run-to-completion.** Une entrée est traitée jusqu'à stabilité (plus de fibre exécutable) avant d'évaluer les gates, puis les gates avant la prochaine entrée. Ordre déterministe : fibres par `id` croissant, gates par `id`. Plafond de pas (ex. 10 000) pour couper les boucles. | Statecharts. |
| **R8** | **Broches de données : échantillonnage à l'activation.** Les nœuds purs sont évalués à la demande au moment où le nœud d'exécution qui les lit s'active ; la valeur est figée dans la fibre. `target` (expression de ciblage) est paresseux ; `players` est un ensemble figé ; la conversion explicite s'appelle `Figer`. | Évite « 100 % de qui ? » à retardement (doc 03 §3.4). |
| **R9** | **Effets = sorties.** `step` renvoie des effets typés, avec un `effetId` déterministe `seq:index`. Persistant (écran, couleur, verrouillage) → entre dans l'état d'affichage dérivé du joueur ; éphémère (vibration, son) → file d'envoi. **Au rejeu en mode « reconstruction », les effets ne sont pas réémis** ; en mode « répétition », ils sont envoyés aux faux téléphones. | XState [S19], Ink [S26]. |
| **R10** | **Aléa : générateur à graine dont l'état est dans l'instantané** (`pure-rand` 8.4.2, MIT, publié 07/2026, générateurs sérialisables ; `seedrandom` n'est plus publié depuis 2019 [S38]). La graine de la représentation est écrite dans l'entrée `init`. | Doc 03 §8. |
| **R11** | **Version figée** : l'entrée `init` enregistre le hash du scénario et la version du moteur ; une représentation se rejoue avec **sa** version. Modifier le scénario pendant le live est interdit en v1 (la compatibilité d'état n'est pas garantie lorsque la logique change [S19]). | |
| **R12** | **Politique des écouteurs** (que faire si l'événement arrive pendant que le fil précédent attend) : `parallèle`, `file`, `ignorer si en cours`, `redémarrer`. Obligatoire dans le schéma. | Nombre de bugs de salle viennent de là. |
| **R13** | **Instantané** toutes les N entrées ou toutes les 30 s : `{ seq, hash scénario, heure de spectacle, état RNG, segment, états des gates, fibres, minuteurs, variables, joueurs }` + `hashÉtat`. La reprise charge le dernier instantané puis rejoue la fin du journal. Test de non-régression : *rejeu intégral et rejeu depuis instantané donnent le même `hashÉtat`.* | |
| **R14** | **Observabilité** : l'éditeur et la régie reçoivent un flux de traces (`fibre`, `nœud`, `entrée`, `valeurs des broches`) pour surligner le nœud actif, afficher les fibres en attente (sur quoi, depuis quand) et poser des points d'arrêt de débogage. | Panneau de debug de Node-RED [S15]. |

**Machine d'une gate (rappel précis, complète doc 03 §3.1)**

| État | Entrée | Sortie / garde |
|------|--------|----------------|
| `EN_COURS` | `tick` ≥ `pasAvant` | → `ARMÉ` |
| `ARMÉ` | condition vraie | → `PASSAGE` |
| `ARMÉ` | `tick` ≥ `auPlusTard − avertir.avant` et condition fausse | → `AVERTISSEMENT` (déclenche le flowgraphe d'avertissement une fois) |
| `AVERTISSEMENT` | condition vraie, ou `tick` ≥ `auPlusTard` | → `PASSAGE` |
| `AVERTISSEMENT` | condition redevient fausse / population change | reste (recalcul) |
| tout sauf `PASSAGE` | `ops.retenir` | → `RETENU` (le minuteur `auPlusTard` est suspendu ; paramétrable : *geler* ou *repartir*) |
| `RETENU` | `ops.relâcher` | → état précédent selon la politique |
| tout | `ops.go` | → `PASSAGE` (journalisé « forcé ») |
| tout | `ops.sauter(segment)` | → `PASSAGE` vers ce segment |
| tout | `ops.prolonger(Δ)` | `auPlusTard += Δ` |
| `PASSAGE` | – | exécute `siForce` si forcé, `onPass`, choisit la branche, entre dans le segment suivant ; annule fibres et minuteurs du segment (R6) |

Cas limite à fixer : condition vraie *avant* `pasAvant` → on passe à `pasAvant`, pas avant. Cas du dénominateur nul (plus aucun présent) : la condition de ratio est **fausse**, la gate attend `auPlusTard`, et la régie est alertée.

---

## 3. Outils de régie existants et pont OSC/MIDI

### 3.1 Ce qu'on prend à chaque outil

| Outil | Modèle | À emprunter | Source |
|---|---|---|---|
| **QLab** | Liste de cues, GO, *playhead* | **GO** démarre le cue sélectionné et joue sa séquence, puis déplace le playhead après la séquence ; les déclencheurs par touche, MIDI, timecode ou horloge murale jouent la séquence mais **laissent le playhead** en place. *Auto-continue* : le cue suivant part quand l'attente post du cue courant est écoulée ; *auto-follow* : il part quand le courant est **terminé**. *Pré-attente* / *post-attente*. Groupes : Timeline, Start First, Start First And Enter, Start Random (tourniquet), Playlist [S28] | [S28] |
| | OSC | Écoute sur le port 53000 (UDP/TCP), réponses sur 53001 ; `/go` déclenche le cue en attente ; mot de passe d'espace de travail ; les clients UDP sont déconnectés après 61 s de silence sauf `/udpKeepAlive 1` [S28] | [S28] |
| **Chataigne** | Hub modulaire : modules (OSC, MIDI, DMX, Art-Net, sACN, série, TCP, UDP, HTTP, MQTT, WebSocket…), états, séquences | Gratuit, GPL-3.0, Windows/macOS/Linux/Raspberry Pi, intégrations QLab, Resolume, Millumin, TouchDesigner, Unity [S29]. **Rôle pour le studio : pont de transition** — notre serveur parle WebSocket/OSC à Chataigne, qui parle DMX/Art-Net/MIDI à la salle. Maintenu sur le temps libre de l'auteur (risque de pérennité). | [S29] |
| **Vezér** | Séquenceur à pistes (MIDI, OSC, DMX/Art-Net), courbes, repères, sauts, boucles, points d'arrêt, **file de compositions** | La timeline à pistes typées par protocole ; un point d'arrêt comme objet de première classe ; macOS, démo gratuite, tarif non indiqué sur la page [S30] | [S30] |
| **Millumin** | Colonnes (cues) + timeline + tableau de bord | Séquenceur plus timeline, **« états auto »** qui mémorisent l'état d'une colonne ; macOS seulement, 29 € les 7 jours ou 399 € à vie [S31] | [S31] |
| **Isadora** | Programmation par « acteurs » reliés, scènes, déclencheurs | Scènes enchaînées par déclencheurs, composants réutilisables ; page peu détaillée sur OSC/MIDI et les prix [S32] | [S32] |
| **TouchDesigner** | Opérateurs en familles (TOP image, CHOP canaux numériques, SOP géométrie, DAT texte, COMP conteneur) ; modèle de « cuisson » à la demande | Familles de types distinctes avec liens explicites entre familles → inspire nos familles de broches (exécution, valeurs, ciblage, ressources) et l'évaluation paresseuse des nœuds purs [S33] | [S33] |
| **ETC Eos** | Console lumière pilotable en OSC | Fiche de commandes OSC non lisible aujourd'hui (le PDF n'a pas pu être lu) ; les PDF « Eos Integration via OSC » et « Supported OSC Commands » sont référencés par ETCLabs [S40]. **À vérifier** avant toute intégration (ports, adresses de GO de cue). | [S40] |
| **ShowCues** | Appel de cues en équipe | Le site redirige vers une page « SM CALLING » : salle protégée par code opérateur, bouton GO, cue suivant avec compte à rebours, messages à expiration, historique, synchronisation multi-appareils et mode hors ligne [S39]. Le lien avec ShowCues n'est pas confirmé par la page : **identification non vérifiée**. Idée à retenir : messages à durée de vie courte pour la régie de poche. | [S39] |

### 3.2 Traduction dans le studio

| Concept QLab / régie | Équivalent STUDIO_REAL |
|---|---|
| Playhead (cue « en attente ») | **Segment/gate suivant « en standby »** : sa précharge (médias, polices) est faite, son état est visible, `GO` le lance |
| GO | `ops.go` sur la gate courante (barre d'espace) ; GO distant = même entrée de journal, venant d'OSC |
| Déclencheur qui ne bouge pas le playhead | Les **tops manuels** (doc 05 §3) : lancent un flowgraphe sans changer de segment |
| Auto-continue | chaînage de segments `enchainement: "apresDebut"` (+ délai) |
| Auto-follow | `enchainement: "apresFin"` (fin du segment) |
| Pré-attente / post-attente | `pistes[].cues[].t` et `delai` du chaînage |
| Groupes de cues (timeline / playlist / aléatoire) | pistes d'un segment (timeline), `Séquence` (playlist), `Aléatoire pondéré` |
| Armer / désarmer | `actif: false` sur un cue ou un écouteur (grisé dans la timeline) |
| Mot de passe d'espace, expiration UDP | jeton de régie, battement de cœur du pont (§3.4) |

### 3.3 OSC et MIDI : bibliothèques (npm, 26/10/2026)

| Besoin | Bibliothèque | Licence | Version / date | Remarque |
|---|---|---|---|---|
| OSC Node (UDP, simple) | `node-osc` | Apache-2.0 | 11.7.1, 14/09/2026 | actif ; client/serveur UDP |
| OSC Node (bas niveau, bundles, timetags) | `osc` (osc.js) | MIT ou GPL-2.0 | 2.4.5, 20/08/2024 | complet, moins actif |
| OSC pont WebSocket ↔ UDP | `osc-js` | MIT | 2.4.1, 21/04/2024 | `BridgePlugin` WebSocket ↔ UDP ; navigateur et Node [S34] ; peu actif |
| MIDI Node | `easymidi` | MIT | 3.2.0, 05/03/2026 | API simple |
| MIDI Node (natif) | `@julusian/midi` | MIT | 3.8.1, 10/08/2026 | liaison RtMidi ; binaires précompilés à vérifier sur la machine de régie |
| MIDI navigateur | `webmidi` | Apache-2.0 | 3.3.1, 15/09/2026 | surcouche de l'API Web MIDI |

### 3.4 OSC/MIDI depuis le navigateur : réponse courte, ne pas le faire

- **OSC** : un navigateur ne peut pas ouvrir de socket UDP. `osc-js` en navigateur utilise un client WebSocket ; l'envoi UDP exige un pont côté Node (`BridgePlugin`) [S34]. (Il existe une API « Direct Sockets » pour des applications web isolées ; **non vérifié aujourd'hui et non recommandé** comme base.)
- **MIDI** : Web MIDI marche sur Chrome, Edge, Firefox, Chrome Android ; **Safari iOS ne le prend pas en charge** (caniuse : aucune version listée comme compatible, bug WebKit 107250 toujours ouvert) [S36]. Sur macOS une extension tierce existe pour Safari ≥ 18.4 [S36]. L'ordinateur de régie peut donc tourner sous Chrome, mais on ne dépend pas de Web MIDI : la MIDI passe par le pont.
- **Architecture retenue** (cohérente avec doc 05 §4 et doc 07) : le moteur émet l'effet `osc.send` / `midi.send` ; le **pont local** (petit programme Node sur la machine de régie) ouvre une connexion WebSocket **sortante** vers le serveur de jeu (aucun port à ouvrir en salle), reçoit les effets, les convertit en UDP/MIDI, renvoie un accusé par `effetId` (idempotent), et envoie en retour les messages entrants comme entrées `ext` (avec `source`, adresse, arguments, heure). Les paquets OSC peuvent porter un *timetag* pour une exécution synchronisée.
- **Hébergement Durable Object** : un Worker ne peut pas émettre en UDP ; le pont local est donc indispensable en option B du doc 07.

---

## 4. Schéma JSON proposé (v2)

Principes : (1) **sémantique séparée de la mise en page** (positions dans `*.layout.json`) pour que les diffs Git disent la logique, pas des pixels ; (2) **catalogue de nœuds hors du scénario** (le scénario cite `type@version`, le catalogue fixe les broches) ; (3) **identifiants stables** partout (jamais d'index de tableau comme référence) ; (4) **tout est validable** par Zod/JSON Schema et par un validateur de graphe (types, accessibilité, délais max).

### 4.1 Fichiers

```
spectacle/
  scenario.json          // sémantique (ce document)
  scenario.layout.json   // positions, zoom, commentaires visuels
  catalogue.json         // généré à partir du code des nœuds (broches, version)
  assets/…
```

### 4.2 Types de broches

| Type | Sens | Notes |
|------|------|-------|
| `exec` | flux d'exécution | une sortie `exec` a **au plus un lien** (utiliser `Séquence` pour éventailler) ; une entrée `exec` en accepte plusieurs |
| `bool`, `int`, `float`, `string`, `duration`, `color`, `time` | scalaires | `duration` en secondes (flottant) ; `int → float` implicite |
| `player`, `players` | un joueur, un **ensemble figé** de joueurs | `players` est acceptable là où `target` est attendu |
| `target` | **expression de ciblage paresseuse** (R8) | convertie par `Figer` en `players` |
| `ballot` | résultat d'une collecte (réponses par joueur) | produit par `Collecter` |
| `agg` | agrégat (comptes, pourcentages, histogramme) | produit par `Agréger` |
| `ref<screen\|asset\|segment\|graph>` | référence à un objet du scénario | validée à la connexion |
| `list<T>`, `T?` | liste, optionnel | |
| `json` | échappatoire en lecture seule | interdit en entrée d'effets |

Règles : une entrée de données reçoit **au plus un lien** ou une valeur littérale (`in`) ; une sortie de données peut en alimenter plusieurs ; aucune conversion implicite sauf `int → float` et `players → target` ; conversion vers `string` seulement par `Texte.formater`.

### 4.3 Exemple complet (extrait de LIVE)

```jsonc
{
  "$schema": "https://studio-real.example/schemas/scenario-2.json",
  "schemaVersion": 2,
  "id": "live", "titre": "LIVE", "version": "0.12.0",
  "moteur": { "min": "1.0.0" },

  "roles": ["spectateur", "superviseur", "streamer", "ecran_scene"],

  "variables": {
    "jauge_salle": { "portee": "spectacle", "type": "float", "init": 0, "observable": true },
    "fin":         { "portee": "spectacle", "type": "string?", "init": null },
    "a_vote":      { "portee": "joueur",    "type": "bool",   "init": false },
    "points":      { "portee": "joueur",    "type": "int",    "init": 0 },
    "notes":       { "portee": "regie",     "type": "string", "init": "" }
  },

  "populations": { "presents": { "base": "connectes", "visible_depuis": 20 } },

  "questions": {
    "porte": { "type": "choix", "options": ["rouge", "bleu"], "unParJoueur": true }
  },

  "segments": {
    "vote_porte": {
      "titre": "Vote de la porte",
      "duree": { "mode": "minmax", "min": 15, "max": 90 },   // indicatif (affichage timeline) ; la gate fait foi
      "horloge": "spectacle",
      "onEnter": "fg_vote_porte",
      "onExit": null,
      "preload": ["asset:son_porte", "ecran:vote_deux_boutons"],
      "pistes": [
        { "id": "p_streamer", "voie": "streamer",
          "cues": [ { "id": "c_relance", "t": 30, "graphe": "fg_relance_streamer",
                      "params": { "texte": "Relance le vote !" }, "actif": true } ] },
        { "id": "p_lumiere", "voie": "osc",
          "cues": [ { "id": "c_mem12", "t": 0, "dur": 90, "graphe": "fg_lumiere_vote" } ] }
      ],
      "ecouteurs": [
        { "id": "l_vote", "sur": { "type": "input", "genre": "vote", "question": "porte" },
          "graphe": "fg_maj_jauge", "mode": "file" }       // parallele | file | ignorer_si_en_cours | redemarrer
      ],
      "enchainement": "gate",                               // gate | apresDebut | apresFin
      "sortie": "gate_porte"
    },
    "acte2_rouge": { "titre": "Acte 2 — rouge", "duree": { "mode": "ouverte" }, "onEnter": "fg_acte2_rouge", "sortie": "gate_acte2" },
    "acte2_bleu":  { "titre": "Acte 2 — bleu",  "duree": { "mode": "ouverte" }, "onEnter": "fg_acte2_bleu",  "sortie": "gate_acte2" }
  },

  "gates": {
    "gate_porte": {
      "segment": "vote_porte",
      "population": "presents",
      "pasAvant": 15,
      "auPlusTard": 90,
      "passerQuand": {                      // arbre d'expression (grammaire §4.4)
        "fn": "gte",
        "args": [ { "fn": "ratio",
                    "args": [ { "fn": "compter_reponses", "args": ["porte"] },
                              { "fn": "taille_population", "args": [] } ] },
                  1.0 ]
      },
      "modele": { "id": "tous_ont_repondu", "params": { "question": "porte" } },   // sucre de l'interface
      "avertir": { "avant": 10, "cible": { "ceux_qui": "nont_pas_repondu", "question": "porte" },
                   "graphe": "fg_avertir_retardataires" },
      "siForce": { "politique": "abstention", "question": "porte" },
      "retenir": { "horloge": "geler" },    // geler | repartir
      "regie": { "go": true, "retenir": true, "sauter": ["acte2_rouge", "acte2_bleu"], "prolonger": [30] },
      "onPass": "fg_figer_resultats",
      "vers": [
        { "id": "b_rouge", "libelle": "Porte rouge",
          "si": { "fn": "eq", "args": [ { "fn": "gagnant", "args": ["porte"] }, "rouge" ] },
          "segment": "acte2_rouge" },
        { "id": "b_bleu", "sinon": true, "libelle": "Porte bleue", "segment": "acte2_bleu" }
      ]
    }
  },

  "evenements": {
    "ev_panique": {
      "declencheur": { "type": "ext", "source": "regie", "nom": "panique" },
      "graphe": "fg_panique", "priorite": 100, "portee": "spectacle", "mode": "ignorer_si_en_cours"
    }
  },

  "graphes": {
    "fg_vote_porte": {
      "genre": "segment.onEnter",
      "entrees": [], "sorties": [],
      "noeuds": [
        { "id": "n1", "type": "event.start@1" },
        { "id": "n2", "type": "target.role@1",    "params": { "role": "spectateur" } },
        { "id": "n3", "type": "fx.screen@1",      "params": { "ecran": "ecran:vote_deux_boutons", "options": ["rouge", "bleu"] },
                                                    "in": { "duree_fondu": 0.3 } },
        { "id": "n4", "type": "fx.color@1",       "in": { "couleur": "#101413", "duree": 1.0 } },
        { "id": "n5", "type": "flow.sequence@1",  "params": { "sorties": 2 } },
        { "id": "n6", "type": "collect.ballots@1","params": { "question": "porte" } },
        { "id": "n7", "type": "log.write@1",      "in": { "texte": "vote ouvert" } }
      ],
      "liens": [
        { "id": "k1", "de": "n1.exec",     "vers": "n5.exec" },
        { "id": "k2", "de": "n5.then_0",   "vers": "n3.exec" },
        { "id": "k3", "de": "n5.then_1",   "vers": "n6.exec" },
        { "id": "k4", "de": "n2.cible",    "vers": "n3.cible" },
        { "id": "k5", "de": "n2.cible",    "vers": "n6.cible" },
        { "id": "k6", "de": "n3.exec_out", "vers": "n4.exec" }
      ]
    }
  },

  "assets": { "son_porte": { "type": "audio", "src": "assets/porte.ogg", "repli": "vibrer:court" } }
}
```

Fichier de mise en page séparé :

```jsonc
{ "schemaVersion": 2,
  "macro":  { "segments": { "vote_porte": [320, 120], "acte2_rouge": [640, 60], "acte2_bleu": [640, 200] },
              "gates":    { "gate_porte": [480, 120] } },
  "graphes": { "fg_vote_porte": { "n1": [0, 0], "n5": [220, 0], "n3": [440, -40], "n6": [440, 80] },
               "_commentaires": [ { "id": "cm1", "texte": "Ouverture du vote", "rect": [-20, -80, 700, 300] } ] },
  "timeline": { "zoom": 8, "decalage": 0 } }
```

### 4.4 Grammaire des expressions (gates et conditions de nœuds)

- Littéral : nombre, chaîne, booléen. Variable : `{ "var": "jauge_salle" }` (avec `"portee"` si ambigu).
- Appel pur : `{ "fn": "<nom>", "args": [ … ] }`. Les fonctions sont typées par un registre : `et`, `ou`, `non`, `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `add`, `sub`, `mul`, `div`, `dans`, `ratio`, `compter_reponses(question)`, `taille_population`, `gagnant(question)`, `majorite_acquise(question)`, `ecoule(segment)`, `joueurs_ayant(question, valeur)`.
- Même évaluateur que les nœuds purs d'un flowgraphe : l'éditeur affiche l'arbre comme une phrase (« 100 % des présents ont voté ») ou comme un mini-graphe, au choix.
- Un `modele` (§3.3 du doc 03) est un raccourci d'interface qui se développe en arbre ; **l'arbre est la vérité**.

### 4.5 Contrats de validation (à implémenter dans le noyau)

1. Tout lien : types compatibles (§4.2), sens sortie → entrée, cardinalité respectée.
2. Aucun cycle de **données** ; les cycles d'**exécution** sont permis seulement s'ils traversent un nœud latent (`Attendre`, `Attendre que`, `Attendre un événement`) — sinon boucle infinie.
3. Toute gate a un `auPlusTard` ou un modèle « Manuel » (alerte sinon : risque de blocage).
4. Tout segment est atteignable depuis `accueil` et possède une gate ou `fin`.
5. Toute branche `vers` a un `sinon` (sauf liste de cas exhaustive sur un enum).
6. Toute cible non vide à la validation (population possible), tout effet avec un `repli` s'il n'est pas disponible sur iPhone.
7. Tout écouteur déclare un `mode` (R12).
8. Les références (`ecran:…`, `asset:…`, `graphe`) existent.

### 4.6 Journal et instantané (formats)

```jsonc
// entrée de journal
{ "seq": 1042, "ts": 1761480123456, "type": "input", "id": "p_zoe42#118",
  "source": { "joueur": "p_zoe42", "conn": "c9" },
  "data": { "genre": "vote", "question": "porte", "valeur": "rouge" } }
{ "seq": 1043, "ts": 1761480124000, "type": "tick", "dtSpectacle": 0.544 }
{ "seq": 1044, "ts": 1761480125000, "type": "ops",  "acteur": "regie:marie", "cmd": "go", "gate": "gate_porte" }
{ "seq": 1045, "ts": 1761480125500, "type": "ext",  "source": "pont:regie", "osc": { "adresse": "/cue/12/done", "args": [] } }
{ "seq": 1046, "ts": 1761480126000, "type": "timer", "minuteur": "t88" }

// fibre dans l'instantané
{ "id": "f17", "graphe": "fg_vote_porte", "proprietaire": { "genre": "segment", "id": "vote_porte" },
  "noeud": "n6", "valeurs": { "n2.cible": { "role": "spectateur" } },
  "attente": { "genre": "evenement", "filtre": { "type": "input", "genre": "vote", "question": "porte" },
               "expiration": "t89" } }
```

### 4.7 Liste minimale des nœuds pour la v1

Convention : *(L)* = latent. Identifiant `famille.nom@version`. ~45 nœuds ; ce qui est marqué ★ suffit pour le **premier prototype** (vote → jauge → branche → effet).

**Déclencheurs (entrées de graphe)**

| Nœud | Sorties | Notes |
|------|---------|-------|
| ★ `event.start` | `exec` | début du graphe (onEnter, cue, onExit) |
| ★ `event.input` | `exec`, `joueur`, `valeur` | genre (vote, texte, réaction, secousse), question |
| `event.presence` | `exec`, `joueur` | rejoint / revient / part |
| `event.ext` | `exec`, `args` | bouton régie, OSC/MIDI via pont, message du streamer |
| `event.every` | `exec` | toutes les N s (horloge `spectacle`) |

**Flux et temps**

| Nœud | Notes |
|------|-------|
| ★ `flow.branch` | `bool` → `vrai` / `faux` |
| ★ `flow.switch` | selon `string` ou enum ; sortie `defaut` obligatoire |
| ★ `flow.sequence` | N sorties exécutées dans l'ordre |
| `flow.parallel` | N fils, politique de jointure `tous` / `un` / `premier` |
| ★ `flow.delay` *(L)* | durée, domaine d'horloge |
| ★ `flow.waitUntil` *(L)* | condition (expression), expiration optionnelle |
| `flow.waitEvent` *(L)* | filtre d'événement ; sorties `reçu` / `expiré` |
| `flow.once` | n'exécute qu'une fois par propriétaire |
| `flow.forEachPlayer` | corps / terminé ; sur `players` ; (L) si son corps est latent |
| ★ `flow.goto` | vers segment ; équivaut à un `PASSAGE` forcé |
| `flow.emit` | lance un événement global |
| `flow.end` | termine la fibre |

**Données, variables, hasard**

| Nœud | Notes |
|------|-------|
| ★ `var.get`, ★ `var.set` | portée spectacle / groupe / joueur / régie ; `set` journalisé avec l'auteur |
| `var.add` | atomique (jauge) |
| ★ `math.op`, ★ `math.compare` | |
| `logic.and/or/not` | |
| `text.format`, `text.filter` | modération simple |
| `random.pick` | seedé (R10), pondéré optionnel |
| `time.elapsed` | durée écoulée dans le segment |

**Collecte et agrégation**

| Nœud | Notes |
|------|-------|
| ★ `collect.ballots` *(L)* | ouvre la collecte d'une question sur une `target` ; sortie `ballot` ; fin à la fermeture explicite ou par la gate |
| ★ `agg.count`, `agg.ratio`, `agg.winner`, `agg.histogram` | `ballot` → `agg` / valeurs |
| `players.draw` | tire N joueurs (seedé) |
| `players.rank` | classement par une variable |

**Ciblage**

| Nœud | Notes |
|------|-------|
| ★ `target.all`, ★ `target.role`, `target.group`, `target.player`, `target.zone` | produisent un `target` |
| `target.where` | « ceux qui ont voté X », « n'ont pas répondu » |
| `target.setop` | union, intersection, sauf |
| `target.freeze` | `target` → `players` (R8) |

**Effets** (le catalogue indique `persistant` ou `éphémère`, et le repli iPhone)

| Nœud | Type | Notes |
|------|------|-------|
| ★ `fx.screen` | persistant | écran type + paramètres |
| ★ `fx.color` | persistant | couleur + fondu |
| ★ `fx.vibrate` | éphémère | motif ; repli défini |
| ★ `fx.sound` | éphémère ou persistant (boucle) | asset + repli |
| `fx.notify`, `fx.message` | éphémère | message privé |
| `ui.lock` | persistant | verrouille l'interface |
| `role.set` | persistant | changement de rôle / groupe |
| `stage.show` | persistant | écran scène |
| `streamer.prompt` | éphémère | consigne privée au streamer |
| ★ `osc.send`, `midi.send` | éphémère (via pont) | adresse/args typés, accusé par `effetId` |
| ★ `log.write` | – | trace métier au journal |

Hors v1 : macros réutilisables avec `entrees`/`sorties` exécutables (schéma déjà prévu), nœud « expression libre », Art-Net/DMX, modification du scénario en direct.

---

## 5. Plan de décision et de mise en œuvre

1. **Jour 1-2 — audit** du nodal et de la timeline de SHOWRUNNER_TOOLS avec la grille §1.6 ; décision voie A ou B.
2. **Semaine 1 — noyau headless** (`packages/schema`, `packages/graph-core`) : types de broches, validation §4.5, commandes annuler/rétablir, import/export JSON + layout. Tests Vitest. *Candidat à la délégation aux agents locaux : tests et générateurs de nœuds, avec brief borné.*
3. **Semaine 1-2 — moteur** (`packages/engine`) : `step`, fibres, minuteurs, gate, journal, instantané, rejeu ; **test d'or** : rejeu complet et rejeu depuis instantané donnent le même `hashÉtat` ; bots de charge.
4. **Semaine 2-3 — rendu** : nodal (voie A ou B), timeline maison, surlignage live (R14).
5. **Pont local** : sortie OSC (`node-osc`), entrée OSC, MIDI (`easymidi` ou `@julusian/midi`) ; en attendant, Chataigne comme pont de test.

**Risques**
- Sous-estimer l'éditeur maison (mitigation : audit §1.6 en premier, voie B en repli).
- Moteur et éditeur divergent sur les types (mitigation : un seul registre de nœuds dans le code, génère `catalogue.json` et le schéma JSON).
- Instantanés incompatibles après changement de scénario (mitigation : R11, hash de version).
- Alarme unique par Durable Object (mitigation : un seul minuteur matériel = plus proche échéance, R4).

**Questions ouvertes pour la direction artistique et le porteur du projet**
- Le nodal de SHOWRUNNER_TOOLS gère-t-il déjà des broches typées et deux familles de broches ?
- Faut-il garder l'attribution React Flow (gratuit) en voie B, ou souscrire à Pro ?
- Le pont local doit-il être livré avec l'application de régie (Electron/Tauri) ou comme petit exécutable séparé ?
- Compatibilité exigée avec la console lumière réelle (Eos ?) : fournir la fiche de commandes OSC pour valider ports et adresses.

---

## Sources

Consultées le 26/10/2026 (certaines pages ont été lues en résumé par l'outil de lecture ; ce qui n'y figurait pas est marqué non vérifié dans le texte).

- [S1] xyflow — https://github.com/xyflow/xyflow
- [S2] `@xyflow/react` (npm) — https://www.npmjs.com/package/@xyflow/react ; `@xyflow/svelte` — https://www.npmjs.com/package/@xyflow/svelte
- [S3] React Flow, performances — https://reactflow.dev/learn/advanced-use/performance
- [S4] React Flow, attribution et offre Pro — https://reactflow.dev/learn/troubleshooting/remove-attribution
- [S5] React Flow, validation de connexion — https://reactflow.dev/examples/interaction/validation
- [S6] `@xyflow/system` (npm) — https://www.npmjs.com/package/@xyflow/system
- [S7] Rete.js — https://github.com/retejs/rete
- [S8] `rete-engine` (npm) — https://www.npmjs.com/package/rete-engine
- [S9] Rete engine — https://github.com/retejs/engine
- [S10] Comfy-Org litegraph.js (archivé) — https://github.com/Comfy-Org/litegraph.js
- [S11] ComfyUI_frontend (GPL-3.0, contient `src/lib/litegraph`) — https://github.com/Comfy-Org/ComfyUI_frontend
- [S12] litegraph.js d'origine — https://github.com/jagenjo/litegraph.js
- [S13] Baklava.js — https://github.com/newcat/baklavajs
- [S14] Flume — https://www.npmjs.com/package/flume
- [S15] Node-RED — https://github.com/node-red/node-red ; messages — https://nodered.org/docs/user-guide/messages
- [S16] animation-timeline-js — https://github.com/ievgennaida/js-animation-timeline-control
- [S17] react-timeline-editor — https://github.com/xzdarcy/react-timeline-editor
- [S18] Theatre.js — https://github.com/theatre-js/theatre ; `@theatre/studio` — https://www.npmjs.com/package/@theatre/studio
- [S19] XState, persistance — https://stately.ai/docs/persistence
- [S20] XState, transitions retardées — https://stately.ai/docs/delayed-transitions
- [S21] XState, API d'inspection — https://stately.ai/docs/inspection
- [S22] XState, option `clock` et `SimulatedClock` (types) — https://cdn.jsdelivr.net/npm/xstate@5/dist/declarations/src/types.d.ts
- [S23] Godot, arrêt de VisualScript — https://godotengine.org/article/godot-4-will-discontinue-visual-scripting
- [S24] Unreal Engine, nœuds latents — https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-latent-actions-in-unreal-engine
- [S25] Arbres de comportement — https://en.wikipedia.org/wiki/Behavior_tree_(artificial_intelligence,_robotics_and_control)
- [S26] Ink, exécution — https://github.com/inkle/ink/blob/master/Documentation/RunningYourInk.md
- [S27] Yarn Spinner, contrôle de flux — https://docs.yarnspinner.dev/write-yarn-scripts/scripting-fundamentals/flow-control.md
- [S28] QLab — séquences de cues https://qlab.app/docs/v5/fundamentals/cue-sequences/ ; groupes https://qlab.app/docs/v5/fundamentals/group-cues/ ; dictionnaire OSC https://qlab.app/docs/v5/scripting/osc-dictionary-v5/ ; sommaire https://qlab.app/docs/
- [S29] Chataigne — https://benjamin.kuperberg.fr/chataigne/en
- [S30] Vezér — https://imimot.com/vezer/
- [S31] Millumin — https://millumin.com/
- [S32] Isadora — https://www.troikatronix.com/isadora/about/
- [S33] TouchDesigner (familles d'opérateurs) — https://docs.derivative.ca/Introduction_to_Python_Tutorial
- [S34] osc-js — https://github.com/adzialocha/osc-js
- [S35] npm : https://www.npmjs.com/package/node-osc · https://www.npmjs.com/package/osc · https://www.npmjs.com/package/osc-js · https://www.npmjs.com/package/easymidi · https://www.npmjs.com/package/@julusian/midi · https://www.npmjs.com/package/webmidi
- [S36] Web MIDI, compatibilité — https://caniuse.com/midi ; bug WebKit — https://bugs.webkit.org/show_bug.cgi?id=107250
- [S37] Cloudflare Durable Objects, alarmes — https://developers.cloudflare.com/durable-objects/api/alarms/
- [S38] `pure-rand` — https://www.npmjs.com/package/pure-rand ; `seedrandom` — https://www.npmjs.com/package/seedrandom
- [S39] Redirection de showcues.com — https://rehearse.management/legacy
- [S40] ETCLabs EosSyncLib (références OSC Eos) — https://github.com/ETCLabs/EosSyncLib

*Limites de cette étude : le quota de recherches web a été atteint avant d'avoir pu vérifier Isadora (OSC/MIDI), ETC Eos (commandes OSC), ShowCues, les pages de manuel Unity Visual Scripting et Twine ; ces points sont marqués non vérifiés. Le code de SHOWRUNNER_TOOLS n'était pas dans le dépôt : la recommandation du §1 repose sur une grille d'audit à appliquer.*
