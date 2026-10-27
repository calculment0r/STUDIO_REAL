# LIVE — le projet du spectacle dans le Conducteur

Un comédien joue **le chef**, un streamer façon Twitch, filmé en extérieur et projeté sur scène. Le public commente et réagit
depuis son téléphone ; des **figurants IA** écrivent aussi dans le chat ; une régie pilote ; quatre superviseurs aident dans la salle ;
la salle est coupée en deux camps.

- `live.conducteur.json` : le projet complet, format `studio-real/conducteur@1` (`{format, project, assets, runs: []}`),
  Il est **embarqué dans le Conducteur** : bouton projet de l'en-tête (ou « Projet · versions ») → **Spectacle LIVE**, ou
  l'adresse `…/?projet=live` ; « Importer » marche aussi. Il est lu par `chargerFichier()` et passe `validerProjet()` sans
  erreur ni avertissement (`npm run verifier -w @studio-real/modele`).
- Ce fichier : le déroulé lisible, les choix de mise en scène et ce que l'équipe artistique doit trancher.

**En chiffres** : 4 actes · 13 moments · 97 étapes · 107 sorties · 8 mémoires de spectacle · 10 pistes · 112 éléments au catalogue.
**Durée prévue** (chemin principal de la salle simulée : boulangerie, il parle à l'homme) : **69:03** au total, dont
14:17 de hall et 06:02 de générique, salut et sortie. **Spectacle proprement dit, du noir au salut : ≈ 46 min.**
Les durées comptent les attentes des garde-fous en répétition (la salle simulée ne remplit pas la jauge des secousses ni
les missions secrètes : on y lit donc le délai maximal).

---

## 1. Le déroulé

Règle de lecture : une étape dure au moins sa durée prévue, puis ses sorties sont lues dans l'ordre ; **chaque attente
qui dépend de la salle passe par un garde-fou de temps** (`g:garde`, sorties « condition remplie » / « délai dépassé »).
Les passages **go** attendent le top régie.

| # | Moment (acte) | Durée prévue | En salle | Téléphones | Écran scène | Le chef (streamer) | Figurants IA | Règle de passage |
|---|---|---|---|---|---|---|---|---|
| 1 | **Hall · connexion par QR** (I) | 14:17 | accueil, téléphones de prêt, placement ; 4 superviseurs en zone | QR, pseudo, couleur stable, PWA proposée ; puis « Patientez » | écrans du hall : QR + compteur ; en salle : « starting soon » | en position, test du flux | densité calme ; le chef « écrit » au public qui attend | dernier appel à 128 présents (ou 10:00 d'attente au plus) ; puis GO régie (fermeture des portes) quand 90 % sont assis (ou 05:00 d'attente au plus) |
| 2 | **Tutoriel des téléphones** (I) | 04:36 | voix off du modo ; répartition cour / jardin | 4 essais : couleur de son camp, vibration, son, emoji ; choix du mode calme | tutoriel en miroir, effectifs des deux camps, **mention des figurants IA** | — | aucun (mention avant la première exposition) | GO régie quand 95 % des téléphones sont prêts ; sinon jusqu'à 3 relances ciblées des retardataires |
| 3 | **Noir et ouverture** (I) | 02:22 | annonce de salle (flashs, vibrations, mode calme), noir | écran noir, **battement de cœur collectif** | noir | standby | coupés | auto, durée fixe de la musique |
| 4 | **Le chef se connecte** (II) | 03:14 | — | écran noir, puis **emojis seulement** | « Le live commence », puis bandeau EN DIRECT ; plan B « connexion perdue » | consigne « lance le live », bouton **Reçu** | segment *accueil*, chaud, 60 % de l'écran au plus | auto ; si pas de « Reçu » en 30 s : relance oreillette ; si le flux est perdu : plan B, puis la régie décide (top) au bout de 3 min |
| 5 | **Chat ouvert** (II) | 05:16 | — | clavier libre (tampon de modération 2 s) | pops autour du visage ; commentaires épinglés en VEDETTE | répond au chat, lit les messages épinglés, annonce le vote | chaud → normal ; s'effacent quand le vrai public écrit (bascule k = 1) ; montrent comment voter | **GO régie** (3 à 6 min) |
| 6 | **Le choix · où doit-il aller ?** (II) | 02:04 | lumière de vote | vote à 3 choix, chrono 60 s, vibration « plus que 10 s » aux retardataires | gabarit VOTE, barres en direct, **révélation** ; égalité → **roue** | attend, réagit | **silence, ne votent jamais** | auto ; tous ont voté ou 50 s + 10 s ; égalité → tirage à la roue |
| 7 | **La conséquence** (II) · entrée selon le vote | 08:44 | lumière des deux camps pendant le défi | « **Secouez !** » (taper l'écran en mode calme) | flux ; jauge des deux camps ; 🥐 géant si réussi | joue A **la boulangerie**, B **le toit** ou C **le métro** ; l'homme au sac passe au fond | segment *boulangerie* (toit et métro à écrire), souffleur « portefeuille », « la boulangère ment » | auto ; défi : jauge ≥ 600 / 1000 ou 01:30 |
| 8 | **Sur le chemin · questions au chef** (III) | 04:42 | respiration | clavier libre | pops, questions retenues en typographie cinétique | répond aux questions épinglées, raconte « la fois du pigeon » | kev puis Paulette quittent le live (sorties narratives) | auto |
| 9 | **Rôles secrets · les messagers** (III) | 03:22 | — | 3 joueurs tirés au sort reçoivent un **mot secret** à faire apparaître sur scène | rien de secret ; à la fin les mots s'assemblent | relève à voix haute les mots étranges | interdits : les trois mots secrets | auto ; les 3 mots validés par les superviseurs, ou 01:30 |
| 10 | **L'homme au sac** (III) | 04:41 | nappe grave, contre ambré | vote à 2 choix : « lui parler / rentrer vite » | cœurs ralentis, puis barres | sent qu'on le suit, demande l'avis du chat ; égalité → il se retourne | segment *mec_bizarre* : commentent ses actes, **jamais son physique** ; modération manuelle | **GO régie** (standby climax) |
| 11 | **Climax · le flux coupe** (III) · entrée selon le vote | 04:58 | folie de couleurs, **strobe 2 Hz 10 s**, puis noir total | écran levé vers la scène, vague cour → jardin, strobe (sauf mode calme), puis noir | FOLIE : danmaku, fusées d'emojis, combo ; puis **image figée « connexion perdue »** | A : l'homme lui tend le sac ; B : l'homme court derrière lui | vague d'émotes, puis COUPE | **GO régie** (silence tenu) |
| 12 | **Le final selon la soirée** (IV) | 04:44 | lumière chaude | message du chef sur chaque téléphone, puis « le mot de la fin » | retour du flux ; nuage de mots | joue l'une des 4 fins (tableau §2) | adieux | auto |
| 13 | **Générique, salut et après** (IV) | 06:02 | salut, service, sortie | « Rendez-vous demain » (notification avec accord) | générique des pseudos, **révélation des figurants IA** | salue en direct | — | fin (salle vide ou 07:00) |

---

## 2. Les mémoires de spectacle et les quatre fins

| Mémoire | Posée par | Valeurs | Sert à |
|---|---|---|---|
| `destination` | bloc Mémoire après la consigne (moment 7) | boulangerie · toit · metro | texte du message final, notification du lendemain |
| `defi` | bloc Mémoire après le défi | oui · non | ton du message final (remercie / taquine) |
| `jauge` | **extérieur** : variable JAUGE_SALLE (secousses agrégées) | 0 → 1000 | condition du défi (≥ 600) |
| `camp_gagnant` | **extérieur** : classement des équipes | Chocolatines · Pains au chocolat | salut au camp gagnant dans le message final |
| `missions` | **extérieur** : superviseurs (chaque mot secret validé : + 1) | 0 → 3 | fin A ou C |
| `homme` | bloc Mémoire après le second vote | parler · fuir | fin A, B, C ou D |
| `recu_lance` | **extérieur** : bouton « Reçu » de la vue privée du chef (ou signal `recu`) | oui · non | sortie du garde-fou du moment 4 |
| `flux_perdu` | **extérieur** : état du serveur vidéo | oui · non | plan B du moment 4 |

**Mémoires écrites de l'extérieur** : elles sont posées pendant la représentation par `Lecteur.poser(nom, valeur)` —
depuis le service concerné, ou à la main au **pupitre de la régie** (section RÉGIE du panneau, ou pupitre de représentation,
touche P). Chaque étape qui en attend une le déclare dans `params.entree` (`{ memoire, valeurs | pas, min, max, par }`) :
`co_recu` (recu_lance), `co_relance` et `co_flux` (flux_perdu), `cq_jauge` (jauge, pas de 100), `cq_podium` (camp_gagnant),
`rs_jeu` et `rs_garde` (missions, + 1). Quand le moment joue, le pupitre met ces mémoires en tête avec leurs valeurs.
Le garde-fou `co_recu` sort aussi par « condition remplie » sur le **signal** `recu` (`Lecteur.signal('recu')`, reçu pendant
l'attente) : mode « une seule suffit » entre `mem:recu_lance = oui` et `sig:recu ≥ 1`.

L'aiguillage du moment 12 lit les mémoires dans cet ordre (la première remplie gagne) :

| Fin | Condition | Ce qui se passe |
|---|---|---|
| **A · la religieuse était pour lui** | il a parlé **et** au moins 2 mots secrets sont passés | l'homme est le pâtissier : la religieuse « réservée » était pour l'anniversaire de la chaîne, un an après le pigeon ; une bougie, le chef la souffle avec le chat |
| **B · un sac sans signature** | il a parlé | une religieuse et un mot « pour le chef » ; le chat devine qui |
| **C · la boîte devant la porte** | il a fui, mais au moins 2 mots sont passés | de retour chez lui, une boîte et un mot du pâtissier : « tu es parti trop vite » |
| **D · le live ne reprend pas** | sinon | vingt secondes de flux dégradé, « je vous raconte demain », coupure |

Les mots secrets (PÂTISSIER, ANNIVERSAIRE, BOUGIE) sont les indices de la fin A : la salle peut la gagner sans le savoir.

---

## 3. Choix de mise en scène

- **Deux camps, un vieux débat** : la salle est coupée cour / jardin en **Chocolatines** et **Pains au chocolat** (running gag de la
  fiction). Les camps colorent le tutoriel, le défi des secousses, la vague du climax et le message final. Ils ne votent pas séparément.
- **Un seul fil narratif, trois décors** : quel que soit le lieu choisi, l'homme au sac de boulangerie apparaît. Le vote change la scène
  jouée, pas l'histoire ; la vraie conséquence arrive à la fin, par les mémoires.
- **Égalité au premier vote : une roue à l'écran** (`f:tirage`, rejouable en répétition, vraiment aléatoire en scène). Égalité au
  second vote : le chef hésite… et se retourne (le choix le plus théâtral).
- **Les figurants ne votent jamais** et ne comptent dans aucune règle de passage ; ils occupent 0 % de l'écran pendant les votes,
  montrent l'exemple au début de chaque mécanique, se retirent quand le vrai chat prend, quittent le live par des sorties narratives
  (kev, Paulette), sont coupés au climax. Ils sont **annoncés avant la première exposition** et **révélés au générique**.
- **Le chat ne commente jamais le physique** de l'homme au sac : consigne des figurants et modération manuelle sur ce moment.
- **La régie garde la main** (passages go) à cinq endroits : fermeture des portes, fin du tutoriel, fin du chat ouvert, avant le
  climax, après la coupure du flux. Partout ailleurs le direct enchaîne seul, pour garder le rythme d'un vrai live.
- **Sécurité** : annonce des flashs et vibrations à l'ouverture, mode calme à tout moment, strobe limité à 2 Hz pendant 10 s
  (plafond 3 Hz), préavis de 10 à 20 s sur la piste Sécurité avant chaque noir, strobe, vibration collective et mouvement de public.
- **Respiration avant l'acte III** (moment 8) : la courbe de tension redescend à 38 avant les rôles secrets et l'homme au sac.

### Pistes posées sur la conduite
Courbes (tension, lumière générale, participation), son (15 clips), lumière (14 mémoires), écran de scène (18 clips), téléphones
(18 écrans), textes et consignes (14), notes de régie (15 repères), sécurité (10 repères avec préavis).

### Catalogue
Sons, mémoires lumière, vidéos de l'écran de scène, images, textes et consignes au chef, **consignes des figurants** (une par segment),
rôles et équipes (dont messagers, superviseurs, mode calme, figurants IA), écrans téléphone, commandes OSC et MIDI.

---

## 4. Points à valider par l'équipe artistique

1. **La fiction** : le pâtissier, la religieuse d'anniversaire et les trois mots secrets sont une proposition sur le canevas de
   test (`prototypes/figurants/banques/repliques.json`) ; à remplacer ou confirmer par l'auteur.
2. **Les segments des figurants « toit » et « métro »** n'existent pas encore dans la banque de répliques : à écrire, ainsi que
   *défi*, *questions au chef*, *rôles secrets*, *folie* et *adieux*.
3. **Durée du spectacle** : ≈ 46 min du noir au salut. Allonger les scènes improvisées (moments 5, 7, 8, 10) si l'on vise 60 à 90 min.
4. **Jauge** : 142 places (celle de la salle simulée) ; seuils à recaler sur la vraie jauge (128 présents, 90 % assis, 95 % prêts).
5. **Les deux camps** : noms, couleurs, répartition par zone ; garder ou supprimer l'affrontement au défi.
6. **Égalité au premier vote** : la roue (`vo_roue`, `params.exaequo: true`) ne tire plus qu'entre les issues ex æquo du
   dernier vote (écart ≤ 4 points). Reste à trancher : la roue, ou le chef tranche ?
7. **Mémoires écrites de l'extérieur** : branchées (voir §2) ; `recu_lance`, `flux_perdu`, `jauge`, `missions` et
   `camp_gagnant` se posent par `Lecteur.poser()` ou au pupitre de la régie, et `recu_lance` a aussi le signal `recu`.
   Reste à brancher les vraies sources (vue privée du chef, serveur vidéo, JAUGE_SALLE, application des superviseurs,
   classement) sur ces entrées. En répétition, sans personne au pupitre, ces garde-fous partent par « délai dépassé ».
8. **Fin de la musique d'ouverture** : durée fixe aujourd'hui ; un OSC « fin de musique » quand le bloc Écoute d'un signal existera.
9. **Le salut** : le chef reste en direct depuis la rue, ou le comédien vient en salle (et le pâtissier) ?
10. **Rôles secrets** : trois messagers suffisent-ils ? Les superviseurs savent-ils qui ils sont ? Exclure mode calme et mineurs.
11. **Notification du lendemain** : texte selon `homme` et `destination`, consentement explicite ; à faire relire (données personnelles).
12. **Mention et révélation des figurants IA** : formulation à faire valider par un juriste (AI Act, article 50).
13. **Strobe** : le garder (2 Hz, 10 s, mode calme exclu) ou le remplacer par un flash unique avant la coupure.
14. **Bloc figurants** : les consignes des figurants sont aujourd'hui des `params.figurants` posés sur les étapes ; un bloc dédié
    (« Figurants : densité / dire ») manque au catalogue.
15. **Sortie du public** : la salle simulée ne sait pas faire baisser les présents ; en répétition le garde-fou « Salle vide ? » attend
    ses 07:00.
