# 03 — Moteur de scénario : timeline, flowgraphes, points d'arrêt

C'est le cœur du studio. Objectif : **un auteur non développeur** compose un spectacle, et **une régie** le joue sans stress.

## 1. Trois niveaux, deux vues

```
SPECTACLE
 └─ Graphe de segments  (vue « schéma nodal » : la dramaturgie, avec embranchements)
     ├─ Segment  (une durée ; son contenu = un flowgraphe + des pistes de tops minutés)
     │    ├─ Pistes de timeline : tops à +0 s, +12 s, +45 s...   (vue « timeline »)
     │    └─ Écouteurs : « à chaque vote reçu », « quand quelqu'un secoue »...
     ├─ Point d'arrêt (gate)  (une petite machine à états + une règle de passage)
     └─ Événements globaux  (actifs tout le spectacle : panique, entracte, arrivée tardive...)
```

- **Vue nodale (macro)** : chaque segment est une boîte, chaque point d'arrêt une flèche (ou un losange s'il y a plusieurs sorties).
  On y voit les **embranchements** : « si le public vote A → Acte 2A, sinon Acte 2B ».
- **Vue timeline** : la projection linéaire du chemin en cours (ou d'un chemin choisi) avec, pour chaque segment, ses pistes
  et ses tops minutés. C'est la vue que la régie regarde pendant la représentation (comme QLab ou une console lumière).
- **Vue flowgraphe (micro)** : on double-clique un segment, un top ou un point d'arrêt et on édite sa logique en nœuds.

Tout est un flowgraphe à l'intérieur : segments, événements, points d'arrêt. La timeline n'est qu'une manière
d'ordonner et de minuter des flowgraphes.

## 2. Les segments

| Propriété | Valeurs |
|-----------|---------|
| Durée | `fixe` (60 s) · `min/max` (au moins 20 s, au plus 120 s) · `ouverte` (jusqu'à ce que le point d'arrêt passe) |
| Horloge | se met en **pause** si la régie met le spectacle en pause |
| À l'entrée | flowgraphe `onEnter` : installer les écrans, couleurs, sons |
| Pistes | tops minutés relatifs au début du segment (`+5 s : vibrer tous`, `+30 s : afficher indice au streamer`) |
| Écouteurs | flowgraphes réactifs (`onVote`, `onText`, `onShake`, `onJoin`, `onOsc`...) actifs seulement pendant ce segment |
| À la sortie | flowgraphe `onExit` : figer les résultats, nettoyer |
| Sous-états | optionnel : une **machine à états** interne (ex. question → réponse → révélation) pour les segments complexes |

## 3. Les points d'arrêt (« togglebreak »)

### 3.1 La machine à états (identique pour tous)

```
          min atteint          condition vraie ou max atteint
 EN COURS ─────────────► ARMÉ ─────────────────────────────► PASSAGE ─► segment suivant
    │                     │  ▲                                  ▲
    │                     │  │ condition redevient fausse       │
    │                     ▼  │                                  │
    │               AVERTISSEMENT (compte à rebours affiché) ───┘
    │
    ├── régie : RETENIR  → RETENU (plus aucun passage auto, l'horloge max est suspendue)
    ├── régie : GO       → PASSAGE immédiat (quelle que soit la règle)
    └── régie : SAUTER   → PASSAGE vers un segment choisi
```

- **EN COURS** : le temps minimal n'est pas écoulé, on ne vérifie rien.
- **ARMÉ** : on évalue la règle à chaque événement (vote reçu, déconnexion, tick d'1 s).
- **AVERTISSEMENT** : optionnel ; « plus que 10 s » sur les écrans, un son, une vibration aux retardataires seulement.
- **RETENU** : la régie a la main (un comédien improvise, problème technique...).
- **PASSAGE** : on exécute l'action de sortie (`onExit`, actions de délai dépassé), on choisit la branche, on entre dans le segment suivant.

### 3.2 La règle de passage, en une phrase

Une règle a cinq champs, tous optionnels sauf un :

```
PASSER QUAND   <condition>              ex. 100 % des présents ont voté
AU PLUS TARD   <durée max>              ex. 90 s  → alors on force
PAS AVANT      <durée min>              ex. 15 s
AVERTIR        <x s avant le max>       ex. 10 s, cible : ceux qui n'ont pas voté
SI FORCÉ       <action>                 ex. les manquants comptent comme abstention
VERS           <branche>                ex. si gagnant = "porte rouge" → Acte2_Rouge, sinon → Acte2_Bleue
```

Affichage dans l'éditeur et la régie, en français :
> **Suivant** quand **100 % des présents ont voté**, au plus tard **90 s**, pas avant **15 s**.
> Avertir les retardataires à **10 s**. Si forcé : **abstention**. Vers : **selon le gagnant**.

### 3.3 Les modèles de règles prêts à l'emploi

| Modèle | Condition | Exemple |
|--------|-----------|---------|
| **Tous ont répondu** | `réponses ≥ 100 % des présents` | vote, saisie de pseudo |
| **Quorum** | `réponses ≥ X %` | 80 % ont voté |
| **Majorité acquise** | le résultat ne peut plus changer (même si tous les autres votaient pareil) | vote serré, on gagne du temps |
| **Durée fixe** | `après X s` | scène minutée |
| **Manuel** | attend le **GO** de la régie | fin d'une scène jouée par les comédiens |
| **Premier qui** | `1 réponse correcte` | course, buzzer |
| **Score / jauge** | `jauge_salle ≥ 1000` | « secouez jusqu'à remplir la barre » |
| **Signal externe** | le streamer valide / une console envoie un OSC / un top son finit | synchro avec la régie son et lumière |
| **Combinaison** | `ET` / `OU` / `NON` des précédents | « 100 % OU (80 % ET 30 s écoulées) » |

### 3.4 « 100 % de qui ? » — le dénominateur

C'est le piège principal des règles « tout le monde a voté ». Le moteur définit des **populations** :

| Population | Définition |
|-----------|------------|
| `inscrits` | tous ceux qui ont rejoint la représentation |
| `connectés` | socket ouverte |
| `présents` (**défaut**) | connectés **et** page visible dans les 20 dernières secondes |
| `actifs` | présents **et** ayant agi pendant le segment précédent |
| `éligibles` | sous-ensemble défini par la cible de l'interaction (ex. seulement l'équipe rouge vote) |

- Si quelqu'un se déconnecte pendant un vote, le ratio est recalculé (il ne bloque plus).
- S'il revient avant le passage, il retrouve l'écran de vote et peut voter.
- La régie voit en direct « 47/52 ont voté — 5 manquants : Zoé, Max... » et peut relancer **seulement eux** (vibration, son).

## 4. Les flowgraphes

### 4.1 Principe (proche des Blueprints d'Unreal)

- **Broches d'exécution** (flèches blanches) : l'ordre des actions.
- **Broches de données** (couleurs par type) : valeurs passées d'un nœud à l'autre.
- **Nœuds latents** : `Attendre 3 s`, `Attendre que`, `Collecter les votes` — ils suspendent le fil sans bloquer le reste.
- Exécution **sur le serveur** uniquement (le téléphone ne reçoit que des effets à appliquer).

### 4.2 Catalogue de nœuds (première liste)

**Déclencheurs**
`Au démarrage du segment` · `À +T` · `À la sortie` · `Toutes les N s` · `Joueur rejoint / revient / part` ·
`Vote reçu` · `Texte reçu` · `Réaction reçue` · `Secousse` · `Inclinaison` · `Bouton régie` · `OSC / MIDI reçu` ·
`Message du streamer` · `Condition devient vraie`

**Logique et flux**
`Si` · `Selon (switch)` · `Séquence` · `En parallèle` · `Attendre` · `Attendre que` · `Une seule fois` · `Pour chaque joueur de` ·
`Aléatoire (pondéré)` · `Compteur` · `Porte (ouvrir/fermer)` · `Aller au segment` · `Lancer un événement`

**Données**
`Variable (spectacle / groupe / joueur)` · `Agréger (compte, %, somme, moyenne, max, histogramme, gagnant)` · `Comparer` ·
`Texte (formater, filtrer)` · `Tirer au sort N joueurs` · `Classement`

**Ciblage**
`Tous` · `Rôle` · `Groupe` · `Zone / siège` · `Joueur` · `Ceux qui ont voté X` · `Ceux qui n'ont pas répondu` · `Sélection régie` ·
`Union / Intersection / Sauf`

**Actions (effets — voir [02](02-capacites-telephone.md))**
`Afficher écran` · `Couleur` · `Fondu` · `Vague` · `Vibrer` · `Son` · `Voix` · `Notification` · `Message privé` ·
`Écran scène : afficher / animer` · `Streamer : consigne` · `Changer de rôle / groupe` · `Verrouiller l'interface` ·
`Envoyer OSC / MIDI` (lumière, son, QLab) · `Journaliser`

### 4.3 Variables et portées

| Portée | Exemple |
|--------|---------|
| Spectacle | `jauge_salle`, `fin_choisie` |
| Groupe / équipe | `score_rouges` |
| Joueur | `a_voté`, `rôle_secret`, `points`, `zone` |
| Privée régie | `notes`, `incidents` |

Toutes les variables sont **observables** dans la régie en direct et modifiables à la main (avec journalisation).

## 5. Le ciblage

Une cible est une expression simple, éditable en nœuds ou en texte :

```
tous
rôle:superviseur
groupe:rouges + groupe:bleus
zone:balcon
joueur:"Zoé42"
a_voté:"A" - rôle:superviseur
aléatoire(3, parmi: rôle:spectateur, jamais_tiré)
sélection_régie
```

## 6. État persistant contre effets éphémères (clé pour la reprise)

| | Persistant | Éphémère |
|---|-----------|----------|
| Exemples | écran affiché, couleur de fond, interface verrouillée, rôle, vote déjà donné | vibration, son court, flash, notification |
| À la reconnexion | **renvoyé** dans l'instantané | **non rejoué** (sauf si < 2 s, réglable) |

Chaque téléphone a donc un **état d'affichage dérivé** que le serveur peut recalculer à tout moment :
`(rôle, segment courant, variables du joueur) → écran + paramètres + couleur`.

## 7. Temps et synchronisation

- **Horloge de spectacle** (pausable) ; **horloge locale du segment** ; **heure serveur** (non pausable).
- Les téléphones estiment leur décalage avec l'horloge serveur (aller-retours façon NTP au branchement puis régulièrement).
- Un effet synchronisé est envoyé **à l'avance** avec « exécute à T serveur » : la salle entière s'allume à ±20 ms près
  au lieu de l'effet « ola involontaire » dû aux latences réseau.

## 8. Exécution, journal, rejouabilité

- Le moteur est **déterministe** : même scénario + même journal d'événements + même graine aléatoire = même résultat.
- Le **journal** (event log) contient tout : entrées des joueurs, GO de la régie, passages, effets envoyés.
- Conséquences :
  - **Reprise après crash du serveur** : on recharge le dernier instantané + on rejoue la fin du journal.
  - **Répétition** : on rejoue une représentation passée, on avance rapidement jusqu'à un segment, on pose des
    **points d'arrêt de débogage** (au sens programmation) dans les flowgraphes.
  - **Analyse** après le spectacle : taux de participation, temps de vote, segments où le public décroche.
  - **Bots** : un bot est un joueur dont les entrées sont générées (aléatoires, lentes, déconnexions simulées).

## 9. Modèle de données (esquisse JSON)

```jsonc
{
  "id": "live-v1",
  "titre": "LIVE",
  "roles": ["spectateur", "superviseur", "streamer", "ecran_scene"],
  "variables": { "jauge_salle": 0, "fin": null },
  "segments": {
    "accueil": {
      "duree": { "mode": "ouverte" },
      "onEnter": "fg_accueil",
      "pistes": [],
      "sortie": "gate_accueil"
    },
    "vote_porte": {
      "duree": { "mode": "minmax", "min": 15, "max": 90 },
      "onEnter": "fg_vote_porte",
      "pistes": [{ "t": 30, "flowgraphe": "fg_relance_streamer" }],
      "ecouteurs": [{ "sur": "vote", "flowgraphe": "fg_maj_jauge" }],
      "sortie": "gate_porte"
    }
  },
  "gates": {
    "gate_porte": {
      "quand": { "type": "ratio", "mesure": "votes", "population": "presents", "seuil": 1.0 },
      "auPlusTard": 90,
      "pasAvant": 15,
      "avertir": { "avant": 10, "cible": "n_a_pas_vote", "effets": ["vibrer:alerte", "son:tic"] },
      "siForce": "abstention",
      "vers": [
        { "si": "gagnant(votes) == 'rouge'", "segment": "acte2_rouge" },
        { "sinon": true, "segment": "acte2_bleu" }
      ]
    }
  },
  "flowgraphes": {
    "fg_vote_porte": { "noeuds": [ /* ... */ ], "liens": [ /* ... */ ] }
  }
}
```

Le format est **du JSON versionné** (diff lisible dans Git, validé par un schéma) : on peut écrire un spectacle à la main,
le générer, ou le faire relire par une IA.
