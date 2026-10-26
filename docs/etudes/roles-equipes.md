# Étude — Le modèle des participants : rôles, équipes, groupes, places, permissions

> Statut : **étude** (proposition à discuter), rédigée le 26 octobre 2026.
> Elle **remplace et élargit** le tableau des rôles de [01 — Vision et rôles](../01-vision-et-roles.md), jugé trop faible :
> « il y a plus de rôles que ça », « on doit pouvoir créer des équipes ».
> Portée : **tout le studio** (n'importe quel spectacle), pas seulement le cas LIVE de [06](../06-cas-live-streamer.md).

---

## 0. En une page

**Ce que le document 01 disait** : « un rôle = un type d'écran + des droits + des informations visibles ; un téléphone n'a qu'un rôle à la fois ».
Ce modèle mélange cinq choses différentes et ne permet ni les équipes, ni le cumul (« superviseur **et** membre de l'équipe rouge »),
ni les rôles secrets qui durent un seul segment, ni les participants qui ne sont pas des personnes (écran du hall, bot, IA).

**Ce que cette étude propose** — dix décisions :

1. **Séparer cinq axes indépendants** pour chaque participant : **FONCTION** (ce qu'il est dans la production : spectateur, superviseur,
   régisseur, écran scène…), **RÔLE DE JEU** (ce qu'il est dans la fiction ou la mécanique : traître, oracle, capitaine, élu…),
   **ÉQUIPE** (appartenance de jeu exclusive), **GROUPES / ÉTIQUETTES** (ciblage, non exclusif), **PLACE** (zone, rang, siège, ou « à distance »).
   Les **PERMISSIONS** ne sont pas un sixième axe : elles **découlent** des cinq autres.
2. **Tout est une « attribution »** : un lien daté entre un participant et une chose (fonction, rôle, équipe, étiquette, place),
   avec une **source** (qui l'a donné), une **durée** (toute la représentation, ce segment, 2 minutes, un seul usage) et une **visibilité**
   (qui le sait). Le cumul, les rôles temporaires, la reprise et le journal en découlent gratuitement.
3. Une **fonction principale** choisit l'**application** (téléphone joueur, écran scène, régie, vue streamer, borne d'accueil) ; les autres
   attributions ajoutent des **panneaux** (onglet Supervision, onglet Capitaine, canal d'équipe) et des **capacités**.
4. Les équipes vivent dans des **répartitions** : une répartition est un ensemble d'équipes **mutuellement exclusives**
   (« les Maisons » pour tout le spectacle, « les Binômes » pour le segment 4). Plusieurs répartitions peuvent coexister.
5. Une **douzaine de modes de création d'équipe** (aléatoire équilibré, par zone, par choix, par QR, à la main, par vote, par quiz,
   draft par capitaines, par ordre d'arrivée, par affinité, par héritage…) et une **politique de rééquilibrage** explicite.
6. Les **secrets sont des faits** dont la liste de lecteurs est connue du serveur : le serveur **n'envoie jamais** une information à un appareil
   qui n'a pas le droit de la lire (pas de filtrage côté téléphone : un spectateur curieux qui ouvre les outils de développement ne doit rien trouver).
7. Un **plafond par famille de fonction** : quoi que dise le scénario, un téléphone du public ne peut jamais obtenir `régie.go` ou `régie.panique`.
   Et **on ne peut attribuer que ce qu'on possède soi-même** (principe repris de Discord et Twitch).
8. Des **cloisons** (séparation des tâches) : un superviseur qui joue dans une équipe ne voit pas les secrets de l'équipe adverse,
   sauf choix explicite de l'auteur.
9. Le moteur gagne des **nœuds d'équipes et de rôles** (répartir, distribuer des rôles, désigner un capitaine, fusionner, éliminer, révéler…),
   un **ciblage étendu** (`équipe:rouge`, `capitaine(équipe:rouge)`, `coéquipiers(moi)`…) et des **quantificateurs d'équipe** dans les règles de passage
   (« **chaque** équipe a rendu sa réponse », « **la première** équipe qui… »).
10. La régie gagne une **vue par équipes** (colonnes, glisser-déposer, carte de salle colorée), une **feuille de distribution** (qui tient quel rôle),
    un **mode « voir comme »** et un **masque anti-fuite** des secrets quand l'écran de régie est visible.

---

## 1. Ce qui existe ailleurs : ce qu'on en retient

| Référence | Ce qui s'y passe | Ce que le studio en retient |
|---|---|---|
| **Loup-Garou de Thiercelieux** ([Vikidia](https://fr.vikidia.org/wiki/Loup-Garou_Le_jeu)) | Rôles secrets à pouvoirs (Voyante qui voit une carte par nuit, Sorcière à deux potions à usage unique), Capitaine élu, phases nuit/jour, éliminés | **Pouvoirs à usage limité** (jetons de capacité), **rôle élu** par la salle, **phases** où seuls certains rôles agissent, statut **éliminé** distinct du rôle |
| **Secret Hitler** ([règles officielles](https://secrethitler.io/rules), [Wikipédia](https://en.wikipedia.org/wiki/Secret_Hitler)) | Libéraux / Fascistes / Hitler ; les Fascistes se connaissent, Hitler ne les connaît pas forcément ; **la règle de connaissance dépend du nombre de joueurs** ; carte « parti » distincte de la carte « rôle » | Un **graphe de connaissance** entre rôles (« qui sait qui est qui ») paramétrable, qui peut **dépendre de la taille de la salle** ; distinguer **appartenance** (équipe) et **rôle** (fonction secrète) |
| **Among Us** ([réglages des rôles](https://dotesports.com/general/news/how-to-set-roles-in-among-us), [guide](https://progameguides.com/among-us/best-roles-settings-in-among-us/), [Digital Trends](https://digitaltrends.com/gaming/among-us-roles-guide)) | L'hôte règle pour chaque rôle un **nombre (0–15)** et une **probabilité** ; Ingénieur (conduits limités dans le temps), Scientifique (signes vitaux à distance), **Ange gardien = joueur mort** qui protège les vivants, Métamorphe | Un nœud **« Distribuer des rôles »** avec nombre + probabilité ; **pouvoirs à recharge** ; les **éliminés continuent à jouer** autrement (fantôme, ange) au lieu de décrocher |
| **Jackbox** ([Quiplash, blog PlayStation](https://blog.playstation.com/2015/06/30/quiplash-new-party-game-expands-audience-participation-to-10000/), [grands groupes](https://www.jackboxgames.com/best-jackbox-games-for-large-groups/), [guide streamers](https://jackboxgames.com/the-jackbox-party-pack-5-streamers-guide/)) | Les **8 premiers connectés sont joueurs**, les suivants deviennent **public** (jusqu'à 10 000) ; le public vote, et dans certains jeux il peut battre les joueurs ; on peut **cacher le code** pour garder les retardataires dehors | Attribution de fonction **par ordre d'arrivée** ; un public **agrégé** (une voix collective pondérée) à côté de joueurs individuels ; une politique explicite pour les **retardataires** |
| **Kahoot, mode équipe** ([support Kahoot](https://support.kahoot.com/hc/en-us/articles/4408679135891-Kahoot-game-play-in-team-mode), [blog 2021](https://kahoot.com/blog/2021/09/22/kahoots-new-team-mode/)) | Équipes sur **un appareil partagé** ou **appareils individuels** ; **affectation automatique** et **rééquilibrage automatique** quand des gens partent ; option « le joueur choisit son équipe » ; **« team talk »** (5 s de concertation avant chaque question) ; score = **moyenne** de l'équipe | Modes « aléatoire » et « au choix » ; **rééquilibrage** ; **temps de concertation** comme phase de segment ; **agrégation normalisée** pour ne pas avantager les grosses équipes ; le **téléphone partagé** (un appareil = plusieurs personnes) |
| **Discord** ([permissions, doc développeur](https://docs.discord.com/developers/topics/permissions.md), [guide discord.js](https://discordjs.guide/legacy/popular-topics/permissions)) | Permissions de base par rôle, **surcharges par salon** pour un rôle ou un membre, **hiérarchie** (on ne gère que ce qui est en dessous de soi), cumul des rôles par union | **Surcharges par segment** (comme par salon), **hiérarchie d'attribution**, cumul par union **plus** refus explicites et plafonds (l'union pure de Discord est un piège connu : un rôle qui autorise l'emporte sur un refus) |
| **Twitch** ([rôle Lead Moderator](https://discuss.dev.twitch.com/t/lead-moderator-role-and-chat-badge-introduced/64488), [badges](https://blog.eklipse.gg/beginner-guide-2/twitch-badges-guide.html)) | Diffuseur → nomme des modérateurs ; **modérateur principal** ; **VIP** = badge visible, exempté de certaines limitations du chat, sans pouvoir de modération | Le **VIP** comme rôle de prestige sans pouvoir (badge + exemptions anti-spam) ; une **chaîne de délégation** (régisseur → modérateur principal → modérateurs) |
| **Slido** ([co-organisateurs](https://community.slido.com/setting-up-a-slido-82/use-co-hosts-to-collaborate-and-help-manage-slidos-501/index2.html), [rôles Slido/Webex](https://community.slido.com/slido-for-webex-90/slido-and-webex-role-comparison-2015)) | Co-organisateur : modère, lance des sondages, **mais ne touche pas aux réglages** ; co-organisateur externe limité à **un seul** événement ; un non-organisateur doit **confirmer deux fois** avant de lancer un sondage en direct | Rôles d'encadrement **bornés à une représentation** ; **double confirmation** pour les actions publiques déclenchées depuis une régie de poche |
| **Sleep No More, Punchdrunk** ([Wikipédia](https://en.wikipedia.org/wiki/Sleep_No_More_(2011_play)), [article Borrowers](https://borrowers-ojs-azsu.tdl.org/borrowers/article/view/107)) | Public **masqué et anonyme** ; **intendants en masque noir** qui aident public et comédiens et gardent les zones interdites ; **« one-on-one »** : un comédien choisit un spectateur pour une scène privée | Le **technicien d'accompagnement** (l'« ange gardien » de la salle) ; l'**élu** choisi par un comédien (pas seulement tiré au sort) ; l'anonymat comme réglage |
| **Rimini Protokoll** ([Situation Rooms](https://kulturstiftung-des-bundes.de/en/programmes_projects/theatre_and_movement/detail/situation_rooms.html), [Remote Copenhagen](https://www.metropolis.dk/en/remote-copenhagen-rimini-protokoll/)) | *Situation Rooms* : chaque spectateur **change d'identité toutes les 8 minutes** ; *Remote X* : une voix de synthèse guide un groupe où chacun **décide individuellement** tout en restant dans le groupe | **Rotation des rôles** par segment ; consignes individuelles à l'intérieur d'un groupe ; voix de synthèse comme **personnage** |
| **Jeux en réalité alternée** ([essai unfiction sur le « puppetmaster »](https://unfiction.com/compendium/2007/12/15/the-puppetmaster-player-communication-dynamic-in-alternate-reality-gaming-and-chaotic-fiction/2)) | Le **marionnettiste** pilote l'histoire en direct derrière un **rideau** ; le **terrier du lapin** est le point d'entrée ; intelligence collective des joueurs | Le **PNJ piloté par la régie** (un humain derrière le rideau) ; le **QR d'équipe** comme terrier du lapin ; des rôles « enquêteurs » qui partagent ce qu'ils trouvent |
| **Rééquilibrage dans les jeux en ligne** ([wiki Team Fortress 2](https://wiki.teamfortress.com/wiki/Autobalance), [mod Better Team Balance](https://thunderstore.io/c/northstar/p/MentalEdge/BetterTeamBalance/v/3.0.0/), [modèle UEFN](https://uefncentral.com/cs/library/nn6n-game-balance-teams)) | TF2 : déplacement aléatoire depuis l'équipe la plus nombreuse avec compte à rebours, puis **volontaires d'abord**, sinon déplacement au prochain « temps mort », sinon forcé ; les déplacements forcés **frustrent** ; d'autres font le rééquilibrage **entre deux manches** ou envoient les arrivants dans **la plus petite équipe** | Politique de rééquilibrage **graduée** : arrivants d'abord → volontaires → au prochain point d'arrêt → forcé en dernier recours, **jamais** au milieu d'une interaction |

Deux références connues ont été mobilisées sans pouvoir être revérifiées en ligne pendant cette étude (budget de recherche épuisé),
à confirmer : les **Voyageurs** de *Blood on the Clocktower* (des rôles conçus pour les joueurs qui **arrivent en cours de partie**
ou partent tôt, sous la main d'un « conteur » qui tient le grimoire de tous les rôles — <https://wiki.bloodontheclocktower.com/Travellers>)
et le **modèle RBAC du NIST** (rôles, hiérarchie de rôles, **activation de rôle par session**, **séparation des tâches** —
<https://csrc.nist.gov/projects/role-based-access-control>).

---

## 2. Vocabulaire

| Terme | Définition | Exemple |
|---|---|---|
| **Participant** | Une entité reliée à une représentation qui reçoit des effets et/ou agit. Personne **ou** dispositif **ou** machine. | Zoé42, l'écran scène, le bot n° 17, le PNJ « la Voix » |
| **Appareil** (connexion) | Un navigateur connecté (un jeton). Un participant peut avoir **plusieurs** appareils ; un appareil peut porter **plusieurs** personnes (téléphone partagé). | la tablette **et** le téléphone d'un superviseur |
| **Fonction** | Ce qu'est le participant **dans la production**. Choisit l'application et le plafond de droits. | spectateur, superviseur, régisseur, écran scène |
| **Rôle de jeu** | Ce qu'est le participant **dans la mécanique ou la fiction**. Souvent secret, souvent temporaire. | traître, oracle, capitaine, élu, juré |
| **Personnage** | Une identité **fictive** qui parle au public. Distinct de celui qui l'**incarne** (comédien, régie, IA). | « le Docteur », « la Voix du standard » |
| **Répartition** | Un ensemble d'équipes **exclusives** entre elles. | « Maisons » = {Rouges, Bleus, Verts} |
| **Équipe** | Un camp à l'intérieur d'une répartition, avec identité, membres, capitaine, ressources, canal. | les Rouges |
| **Étiquette** (groupe, tag) | Un marqueur **non exclusif** servant au ciblage. Posée à la main, par un nœud, ou **calculée**. | `son_ok`, `a_voté_A`, `tiré_acte2`, `anglophone` |
| **Place** | Position spatiale : lieu > zone > rang > siège, avec coordonnées ; ou « à distance ». | `salle/parterre/G/12` |
| **Permission** | Une capacité atomique : *verbe* sur *ressource* dans une *portée*. | `canal.écrire @ mon_équipe` |
| **Attribution** | Le lien daté qui relie un participant à une fonction, un rôle, une équipe, une étiquette, une place ou une permission. | « Zoé42 est traître, attribué par le nœud *Distribuer*, du segment 6 à la fin, connu d'elle et des superviseurs » |
| **Fait secret** | Une information dont la liste de lecteurs est contrôlée par le serveur. | « Max est le saboteur » |
| **Statut** | État de jeu (actif, éliminé, en sourdine, exclu) — distinct de l'état réseau (présent, caché, déconnecté). | Léa : présente, éliminée |

---

## 3. Catalogue des rôles

Chaque fiche dit : **ce qu'il voit**, **ce qu'il peut faire**, **qui l'attribue**, **quand**. Les familles déterminent le **plafond de droits** (§4.6).

Légende « quand » : **A** = avant la représentation (préparation, billetterie, distribution) · **E** = à l'entrée (QR, accueil) ·
**S** = pendant, par un nœud du scénario · **R** = pendant, à la main par la régie · **P** = par un autre participant (capitaine, comédien).

### 3.1 Famille PUBLIC — en salle

| Rôle | Voit | Peut | Attribué par | Quand |
|---|---|---|---|---|
| **Joueur** (défaut) | l'écran du moment, ses effets, ses résultats, ce que son équipe partage | voter, écrire, réagir, bouger (capteurs), rejoindre/quitter une équipe si permis | automatique à l'entrée | E |
| **Observateur** (sans interaction) | les effets « ambiance » (couleur, sons) mais **aucune interface d'action** ; option : résultats et scène | rien, sauf repasser joueur s'il le demande | lui-même (« je préfère regarder »), l'accueil, la régie | E, R |
| **Spectateur en mode calme** | comme joueur, mais **sans** flash, vibration ni son (profil photosensible, enceinte, migraine, enfant qui dort…) | jouer normalement | lui-même au tutoriel | E |
| **Retardataire** | un **écran de rattrapage** : « voici ce que tu as manqué » + son équipe (attribuée d'office) + l'écran du moment dès que possible | rejoindre au prochain point d'arrêt, ou tout de suite si le segment le permet | automatique (arrivée après le segment « Accueil ») | E |
| **Retour** (revenant) | l'instantané exact de la salle | reprendre là où il était | automatique (jeton retrouvé) | E |
| **Sans téléphone** | rien sur appareil ; il est **représenté** par un téléphone de prêt ou rattaché à un voisin | jouer via le téléphone de prêt ; compter dans son équipe | l'accueil | E, R |
| **Téléphone partagé** (foyer, duo, parent + enfant) | un seul écran pour 2–4 personnes | un vote **pondéré** (option : la voix compte pour N) | lui-même à l'entrée (« nous sommes 2 »), l'accueil | E |
| **Mineur / jeune public** | contenus filtrés, pas de texte libre projeté | jouer avec un clavier restreint (suggestions seulement) | l'accueil, la billetterie | A, E |
| **Spectateur accessibilité** (malvoyant, malentendant, LSF) | voix de synthèse / sous-titres / vibrations à la place du son | jouer avec une interface adaptée | lui-même au tutoriel, l'accueil | E |
| **Fantôme / éliminé** | une interface réduite et différente (chuchoter, hanter, parier sur la suite) ; option : voit les secrets (les morts savent) | des actions de « fantôme » prévues par l'auteur (ange gardien, jury) | le moteur (élimination) | S |
| **Exclu / en sourdine** | écran normal ; en sourdine fantôme, il croit que ses messages partent | rien qui sorte de son téléphone | modérateur, régie | R |

### 3.2 Famille PUBLIC — à distance

| Rôle | Voit | Peut | Attribué par | Quand |
|---|---|---|---|---|
| **Spectateur à distance** | le flux vidéo du spectacle (scène + calques) dans le navigateur, avec 2 à 10 s de retard s'il passe par un flux classique | réagir (emojis), parfois voter | la billetterie (billet « en ligne »), son lien d'accès | A, E |
| **Joueur à distance** | le flux à faible latence (WebRTC) + l'interface de jeu | voter, écrire ; sa voix peut être **pondérée** différemment de la salle (choix artistique : la salle décide, Internet influence) | billetterie, régie | A, E |
| **Public agrégé** (au-delà de la jauge) | le flux + une interface simplifiée | une **voix collective** : son vote est agrégé et compte comme « un joueur » ou comme « une équipe » (modèle Jackbox) | automatique au-delà de N inscrits | E |
| **Invité distant** | le flux + une vue privée (consignes) | intervenir à l'écran (sa caméra projetée), comme un mini-streamer | la régie | A, R |

### 3.3 Famille PUBLIC — distingués (rôles de prestige ou de pouvoir, souvent visibles)

| Rôle | Voit | Peut | Attribué par | Quand |
|---|---|---|---|---|
| **VIP / invité** | un badge, un écran d'accueil personnalisé | les mêmes actions + exemptions (pas de limite de débit, message toujours affiché), un emoji réservé | billetterie (place VIP), tirage, régie | A, S, R |
| **Élu** (monte sur scène) | une **télécommande spéciale** : grands boutons, consignes privées « avance jusqu'au cercle » | ce que la scène lui demande (choisir la fin, appuyer sur le bouton rouge) ; son écran peut être **dupliqué sur l'écran scène** | tirage au sort, comédien (choisi du regard, à la Punchdrunk), vote de la salle | S, P, R |
| **Capitaine / leader** | l'onglet **Capitaine** : état de son équipe (qui a répondu), propositions des membres, ressources | valider la réponse de l'équipe, dépenser les jetons, renommer l'équipe, désigner un vice-capitaine | voir §5.6 (tirage, élection interne, régie, premier arrivé…) | S, P, R |
| **Vice-capitaine** | idem en lecture | prend la main si le capitaine décroche plus de X s | le capitaine, ou automatique | P, S |
| **Porte-parole** | la synthèse de son équipe | parler à voix haute pour l'équipe (micro tendu), écrire le message d'équipe projeté | l'équipe (vote), le capitaine | S, P |
| **Juré / jury** | les propositions anonymisées | noter, départager | tirage, éliminés reconvertis | S |
| **Détenteur du veto** | le résultat du vote avant révélation | annuler le choix de la salle (une fois) | tirage | S |
| **Confident** | un **fil privé** avec un personnage | répondre au personnage ; parfois transmettre à la salle | tirage, comédien | S, P |
| **Témoin / enquêteur** | des indices que les autres n'ont pas | partager (ou non) avec son équipe | scénario | S |
| **Gagnant / récompensé** | son trophée, un écran de fin spécial | — | moteur (classement) | S |

### 3.4 Famille PUBLIC — rôles secrets de jeu

Un rôle secret est défini par cinq propriétés : **ce qu'il sait** (connaissance), **ce qu'il peut** (pouvoir, avec usages ou recharge),
**son camp** (équipe, éventuellement différente de son équipe visible), **sa condition de victoire**, **ce qui le révèle**.

| Rôle | Connaissance | Pouvoir | Camp / victoire | Inspiration |
|---|---|---|---|---|
| **Traître / imposteur** | connaît les autres traîtres (réglable) | une mission privée, saboter une réponse d'équipe | équipe secrète « traîtres » ; gagne si non démasqué | Among Us, Secret Hitler |
| **Oracle / voyante** | — | **voir** le rôle d'un joueur, N fois | camp de la salle | Loup-Garou |
| **Saboteur** | voit la réponse de son équipe avant envoi | **modifier** ou **retarder** une réponse, une fois | adverse, caché dans l'équipe | — |
| **Messager** | reçoit un message d'un personnage | doit le **faire passer** à un joueur désigné (à voix basse, par écrit) | camp de la salle | téléphone arabe (08 #22) |
| **Espion** | lit le **canal d'une autre équipe** (en différé ou partiellement) | rapporter à son équipe | son équipe | — |
| **Ange gardien / protecteur** | voit qui est menacé | **protéger** un joueur d'une élimination | camp de la salle ; souvent un éliminé | Among Us |
| **Agent double** | connaît les deux camps | — | gagne si les deux camps sont à égalité | — |
| **Complice** | connaît le traître, pas l'inverse | aide en silence | camp du traître | Secret Hitler (Hitler / Fascistes) |
| **Corbeau** | — | son vote compte **double** contre une cible | — | Loup-Garou (variantes) |
| **Amoureux / liés** | connaissent leur lien | si l'un est éliminé, l'autre aussi | condition de victoire commune | Loup-Garou (Cupidon) |
| **Chuchoteur** | — | envoyer **une rumeur** anonyme à une zone | — | — |
| **Gardien du secret** | connaît la fin (ou un mot de passe) | le révéler au bon moment débloque une branche | camp de la salle | jeux en réalité alternée |
| **Muet / contraint** | — | ne peut **pas** écrire (seulement des emojis), ou seulement un mot | — | contrainte ludique |

**Distribution** : par un nœud *Distribuer des rôles* (nombre fixe, proportion de la salle, ou probabilité, comme les réglages d'Among Us),
avec contraintes (« jamais deux fois la même personne », « pas un superviseur », « au moins un par équipe »).
**Révélation** : nœud *Révéler* (à la salle, à une équipe, à l'écran scène), ou automatique à l'élimination.

### 3.5 Famille ARTISTIQUE

| Rôle | Voit | Peut | Attribué par | Quand |
|---|---|---|---|---|
| **Streamer** (filmé, ailleurs) | retour caméra, réactions, bandeau de consignes privées, chrono (voir 06) | publier vidéo/audio, « Reçu », déclencher ses effets autorisés, lire des commentaires choisis | régie / feuille de distribution | A |
| **Comédien en salle** | consignes privées discrètes (téléphone en poche, vibration codée, oreillette), chrono, **prénom ou siège** d'un spectateur à interpeller | « Reçu », **choisir un spectateur** (désigner un élu en scannant son QR ou en tapant son siège), déclencher un top autorisé | distribution | A |
| **Comédien à distance** | comme le streamer, sans obligation vidéo (voix seule, texte) | parler (audio), écrire au nom d'un personnage | distribution | A |
| **Comédien infiltré** (le « complice » caché dans le public) | **apparaît comme un joueur** pour tout le public ; voit en plus ses consignes | jouer comme un spectateur, mais ses actions sont **scénarisées** (premier à voter, provoque un débat) | distribution — **fait secret** même pour les superviseurs si l'auteur le veut | A |
| **Marionnettiste** (personnage non joueur piloté par la régie) | la **boîte de réception** du personnage (messages privés reçus), un historique par spectateur | écrire **au nom du personnage** à une cible, avec réponses préparées | distribution | A, R |
| **Personnage IA** | — (machine) | répondre dans un cadre écrit par l'auteur ; ses messages passent par une **file de relecture** si l'auteur l'exige | auteur (configuration), régie (allumer/couper) | A, R |
| **Voix off / narrateur** | la conduite | déclencher ses textes (synthèse ou enregistrés) | distribution | A |
| **Musicien live** | tops et tempo, jauges du public | envoyer un tempo (le public vibre en rythme), déclencher des tops | distribution | A |
| **Metteur en scène** | en répétition : tout + annotations ; en représentation : lecture seule de la régie | annoter, demander « on reprend à… » (en répétition) | administrateur du spectacle | A |
| **Auteur / développeur** | l'éditeur | écrire le scénario | administrateur du studio | A |

### 3.6 Famille ENCADREMENT (production, technique, salle)

| Rôle | Voit | Peut | Attribué par | Quand |
|---|---|---|---|---|
| **Régisseur général** | tout (sauf faits cloisonnés « auteur seulement ») | GO, retenir, sauter, pause, panique ; attribuer/retirer toute fonction inférieure | administrateur | A |
| **Régisseur plateau** | conduite, état des comédiens et de l'élu, consignes plateau | « Reçu », signaler « plateau prêt » (peut faire passer un point d'arrêt), envoyer une consigne aux comédiens | régisseur général | A |
| **Opérateur son / lumière / vidéo** | les tops qui le concernent, le standby (« attention top lumière 14 »), jauges utiles | confirmer, déclencher les sorties OSC/MIDI de son domaine | régisseur général | A |
| **Modérateur** | file de modération, historique des messages, liste des joueurs avec avertissements | valider, refuser, mettre en vedette, sourdine fantôme, avertir, exclure | régisseur général ; **modérateur principal** qui nomme les autres (modèle Twitch) | A, R |
| **Superviseur joueur** | son écran de joueur **+** onglet Supervision (compteurs, consignes, secrets autorisés) | jouer, et agir dans les limites accordées segment par segment | régie, scénario | A, S, R |
| **Superviseur neutre** (maître du jeu de zone, animateur de table) | onglet Supervision complet, **pas** d'écran de joueur | relancer sa zone, valider des réponses orales, arbitrer, signaler un problème | régie | A |
| **Accueil / billetterie** | une **borne** : liste des inscrits, places, prêts de téléphone | inscrire un spectateur sans QR, rattacher une place, prêter un téléphone, déclarer un téléphone partagé, poser une étiquette (VIP, mineur, accessibilité) | régisseur général | A |
| **Technicien d'accompagnement** (« ange » de salle, l'intendant de Punchdrunk) | une vue « qui a un problème » : déconnectés, son coupé, capteurs refusés, batterie faible, **carte des sièges** | ouvrir l'**écran d'un spectateur** à distance (voir comme lui), relancer son tutoriel, lui renvoyer un instantané, **fusionner** deux identités (« j'étais déjà là »), basculer en mode calme | régisseur général | A |
| **Responsable sécurité** | état de la salle | **panique** et message d'évacuation (prioritaire sur tout) | administrateur | A |
| **Observateur de production** (producteur, programmateur invité) | la régie en **lecture seule**, secrets masqués | rien | régisseur général | A |
| **Analyste** | après la représentation : journal anonymisé, statistiques | exporter | administrateur | après |
| **Administrateur du studio** | comptes, gabarits, spectacles | créer des représentations, nommer les régisseurs | — | — |

### 3.7 Famille DISPOSITIFS (participants sans personne)

| Dispositif | Reçoit | Envoie | Attribué par | Quand |
|---|---|---|---|---|
| **Écran scène** | calques, vidéo du streamer, résultats, révélations | rien (ou « prêt » / fréquence d'image) | appairage depuis la régie (code affiché) | A |
| **Écran secondaire** (hall, foyer, bar, entrée) | contenus d'attente, QR d'entrée, compteur d'inscrits, scores d'équipes | rien | appairage | A |
| **Écran retour plateau** (prompteur des comédiens) | consignes plateau, chrono, prénoms à citer | rien | appairage | A |
| **Tableau des scores** | classement des équipes, jauges | rien | appairage | A |
| **Téléphone de prêt** | comme un joueur ; **réinitialisable** entre deux personnes | comme un joueur | accueil | E |
| **Borne d'accueil** (tablette en libre-service) | formulaire d'entrée | inscrire, imprimer/afficher un QR personnel | appairage | A |
| **Enregistreur** | **tout ce qui est public** (écran scène, résultats), jamais les secrets sauf réglage « archive complète » | rien | régie | A |
| **Bot** | comme un joueur | des entrées simulées (profils rapide, lent, distrait, décrocheur) | répétition, tests de charge | A |
| **Pont OSC / MIDI** | les sorties OSC/MIDI | les entrées des consoles (top fini, mémoire lancée) | configuration | A |
| **Accessoire connecté** (objet du décor, lumière DMX, bracelet LED) | effets ciblés (couleur, clignotement) | capteurs éventuels | configuration | A |
| **Caméra de salle** | — | flux vidéo (vers l'écran scène ou l'enregistreur) | configuration | A |

### 3.8 Le PERSONNAGE, séparé de celui qui l'incarne

Le public reçoit des messages « de la part du Docteur ». Le Docteur peut être incarné par un comédien à distance, par le marionnettiste
en régie, par l'IA, ou **à tour de rôle** (l'IA répond, le marionnettiste reprend la main sur les conversations importantes).

- Un **personnage** a : un nom, un avatar, une couleur, un style de messages, une voix (synthèse), une **boîte de réception**.
- Une **incarnation** relie un personnage à un ou plusieurs participants (opérateurs), avec une priorité.
- Le public ne voit **jamais** qui incarne : seulement le personnage.
- Conséquence pour le moteur : la cible d'un message peut être `personnage:docteur` (les opérateurs reçoivent) et l'expéditeur d'un
  message peut être un personnage.

---

## 4. Le modèle générique

### 4.1 Les cinq axes

```
                          ┌──────────── PARTICIPANT ────────────┐
                          │  pseudo, statut, appareils, profil  │
                          └──┬───────┬────────┬───────┬───────┬─┘
                             │       │        │       │       │
                    FONCTION │  RÔLE │  ÉQUIPE│ ÉTIQ. │ PLACE │
                (production) │ (jeu) │ (camp) │(cible)│(espace)
                             ▼       ▼        ▼       ▼       ▼
                     1 principale  0..n   0..1 par   0..n   0..1 (+ zone
                     + 0..n        tempo- répartition       distante)
                     secondaires   raires
                             │       │        │       │       │
                             └───────┴────┬───┴───────┴───────┘
                                          ▼
                                  PERMISSIONS EFFECTIVES
                       (calculées, jamais stockées à la main)
                                          ▼
                     application + panneaux + actions + informations visibles
```

| Axe | Exclusif ? | Durée typique | Visible par défaut | Sert surtout à |
|---|---|---|---|---|
| **Fonction** | 1 principale (choisit l'application), secondaires cumulables | toute la représentation | publique pour l'équipe de production, invisible au public pour les infiltrés | quelle application, quel plafond de droits |
| **Rôle de jeu** | non (on peut être capitaine **et** traître) | un segment, quelques minutes, un seul usage | souvent **secret** | pouvoirs, connaissance, conditions de victoire |
| **Équipe** | **oui, à l'intérieur d'une répartition** | une ou plusieurs scènes | publique ou secrète selon la répartition | appartenance de jeu, score, canal, décision collective |
| **Étiquette** | non | variable | invisible au public (sert au ciblage) | ciblage, filtres régie, statistiques |
| **Place** | oui (une place à la fois) | la représentation | régie | effets spatiaux (vague, mosaïque), équipes par zone |

Pourquoi distinguer **équipe** et **étiquette** ? Une équipe a une **identité** (nom, couleur, emblème), des **ressources** et un **canal**,
et on raisonne en « une seule équipe à la fois » (ce qui permet de colorer la salle, d'afficher un classement, d'écrire « chaque équipe a répondu »).
Une étiquette n'est qu'un **filtre** : `iOS`, `son_ok`, `a_voté_A`, `tiré_au_sort`. Mélanger les deux mène à des bugs du type
« ce joueur est à la fois rouge et bleu, de quelle couleur est son écran ? ».

Pourquoi distinguer **fonction** et **rôle de jeu** ? La fonction est une affaire de **production** (sécurité, droits, application) ;
le rôle de jeu est une affaire d'**écriture** (fiction, mécanique). L'auteur distribue des traîtres sans jamais risquer de donner
à un spectateur un bouton de régie.

### 4.2 L'attribution : la brique unique

Toute appartenance est une **attribution** :

```jsonc
{
  "id": "att_8f2",
  "participant": "p_zoe42",
  "type": "role",                 // fonction | role | equipe | etiquette | place | permission
  "valeur": "traitre",
  "source": { "par": "noeud", "ref": "fg_seg6/distribuer_1" },   // ou { "par": "regie", "ref": "poste_rg" }, { "par": "participant", "ref": "p_max" }
  "debut": { "seq": 4812, "segment": "seg6_roles_secrets" },
  "fin": { "mode": "fin_segment", "segment": "seg7_climax" },    // voir §4.7
  "usages": null,                 // ou 1 pour un pouvoir à usage unique
  "visibilite": "secret:roles_secrets",   // référence à une règle de connaissance (§4.5)
  "priorite": 0
}
```

Avantages :
- **Cumul** naturel : un participant a autant d'attributions qu'il veut ; les contraintes (exclusivité d'équipe, une seule place) sont des **règles de cohérence** vérifiées par le moteur.
- **Temporalité** : chaque attribution a sa fin ; le moteur les expire et **restaure** ce qu'il y avait avant.
- **Journal et rejouabilité** : attribuer/retirer sont des événements du journal ; l'état des rôles à n'importe quel instant se recalcule (03 §8).
- **Reprise** : l'instantané d'un appareil contient les attributions **qu'il a le droit de connaître** (§4.5).
- **Audit** : « pourquoi Zoé voit-elle ce panneau ? » → la régie affiche la chaîne d'attributions et de permissions qui l'explique.

### 4.3 Les permissions

Une permission = `verbe` + `ressource` + `portée`.

| Famille | Exemples de verbes | Portées possibles |
|---|---|---|
| **Jouer** | `interagir`, `écrire`, `réagir`, `capteurs`, `voter` | soi |
| **Équipe** | `canal.lire`, `canal.écrire`, `réponse.proposer`, `réponse.valider`, `ressources.dépenser`, `équipe.renommer`, `équipe.rejoindre`, `équipe.quitter` | mon équipe, une équipe nommée, toutes |
| **Voir** | `voir.compteurs`, `voir.qui_a_répondu`, `voir.rôle_de`, `voir.équipe_de`, `voir.canal`, `voir.place_de`, `voir.écran_de`, `voir.journal` | soi, mon équipe, ma zone, tous |
| **Encadrer** | `modérer.valider`, `modérer.sourdine`, `modérer.exclure`, `relancer`, `envoyer_effet`, `envoyer_message` | ma zone, mon équipe, tous |
| **Attribuer** | `attribuer.rôle:X`, `attribuer.équipe`, `attribuer.étiquette`, `attribuer.fonction:superviseur` | ma zone, mon équipe, tous |
| **Conduire** | `régie.go`, `régie.retenir`, `régie.sauter`, `régie.pause`, `régie.panique`, `régie.variables` | représentation |
| **Publier** | `média.publier_vidéo`, `média.publier_audio`, `scène.épingler` | — |
| **Personnage** | `personnage.parler_comme:docteur`, `personnage.lire_boîte:docteur` | — |

**Paquets** : une fonction ou un rôle de jeu est un **paquet de permissions** nommé, par exemple :

```
capitaine      = réponse.valider@mon_équipe + ressources.dépenser@mon_équipe + équipe.renommer@mon_équipe
                 + voir.qui_a_répondu@mon_équipe + attribuer.rôle:vice_capitaine@mon_équipe
oracle         = voir.rôle_de@tous (usages: 2)
superviseur    = joueur + voir.compteurs@tous + voir.qui_a_répondu@ma_zone + relancer@ma_zone + modérer.valider@ma_zone
modérateur     = modérer.*@tous + voir.journal@messages
```

### 4.4 Héritage

- **Héritage de paquets** : `superviseur` hérite de `joueur` ; `capitaine` hérite de `membre` ; `régisseur_général` hérite de `modérateur`
  + `régisseur_plateau`. L'éditeur montre la liste à plat pour éviter les surprises.
- **Droits d'équipe** : une équipe peut porter des permissions accordées à **tous ses membres** (« l'équipe qui a gagné la manche voit l'indice »).
- **Droits de zone** : une zone peut porter des permissions (« le balcon n'écrit pas pendant la scène 3 »).
- **Surcharges par segment** (comme les surcharges par salon de Discord) : un segment peut **accorder** ou **refuser** des permissions à une cible
  pour sa durée (« pendant le vote, les superviseurs ne voient pas les résultats partiels »).

### 4.5 Résolution : comment on calcule ce qu'un participant peut faire

Ordre de calcul, à chaque changement d'attribution ou de segment :

1. **Base** = paquet de la fonction principale + fonctions secondaires.
2. **+** paquets des rôles de jeu actifs (non expirés, usages restants).
3. **+** permissions portées par ses équipes, ses zones, ses étiquettes.
4. **+ / −** surcharges du segment courant (d'abord celles qui ciblent un groupe, puis celles qui ciblent ce participant : la plus précise gagne).
5. **− refus explicites** (un refus l'emporte sur une autorisation de même précision — contrairement à Discord, où l'union des rôles fait gagner l'autorisation).
6. **∩ plafond de la famille** de sa fonction principale (§4.6) : ce qui dépasse est **ignoré et signalé** dans l'éditeur et en régie.
7. **− statut** : éliminé, en sourdine, exclu, observateur retirent les verbes correspondants.
8. **∩ cloisons** (§4.8).

Le résultat est un **ensemble de permissions effectives** mis en cache par participant, recalculé seulement quand une attribution ou le segment change.
Il se traduit directement en : application à charger, panneaux affichés, boutons actifs, et **filtre de diffusion** côté serveur.

### 4.6 Plafonds par famille et hiérarchie d'attribution

| Famille | Plafond (ce qu'on ne peut **jamais** obtenir, quoi que dise le scénario) |
|---|---|
| Public | toute permission `régie.*`, `attribuer.fonction:*`, `voir.journal`, `média.publier_vidéo` sans accord régie, `personnage.*` |
| Artistique | `régie.sauter`, `régie.panique` (sauf réglage), `attribuer.fonction:*` |
| Encadrement | rien hors de sa portée nommée (un superviseur de zone n'agit pas sur une autre zone) |
| Dispositif | toute action ; un dispositif ne fait que recevoir (sauf ponts et capteurs) |

**Hiérarchie d'attribution** (Discord, Twitch) : on ne peut attribuer qu'une chose qu'on a le droit d'attribuer **et** dont le paquet est
**inclus dans ses propres droits**. Un capitaine peut nommer un vice-capitaine dans **son** équipe ; il ne peut pas nommer un superviseur.
Le régisseur général peut nommer un superviseur ; il ne peut pas créer d'administrateur.

**Sécurité** : la fonction encadrement ou artistique ne s'obtient **jamais** par le QR public. Elle passe par un lien d'invitation
**à usage unique** (ou un code affiché en régie, ou Tailscale pour la régie elle-même, voir 07 §5), et la régie confirme.
Un spectateur promu « superviseur » en direct obtient une fonction **secondaire** limitée par le plafond « superviseur depuis le public ».

### 4.7 Temporalité : rôles temporaires par segment

| Mode de fin | Exemple |
|---|---|
| `representation` | fonction, place |
| `fin_segment` (ce segment ou un segment nommé) | « pendant la scène du procès, Léa est jurée » |
| `duree` (en secondes d'horloge de spectacle, donc **pausable**) | « 120 s pour accomplir ta mission » |
| `usages` (N utilisations) | « tu peux voir le rôle d'un joueur, une fois » |
| `tant_que` (condition) | « capitaine tant que tu es présent » → succession automatique |
| `jusqu_a_revocation` | rôles donnés par la régie |

Les attributions temporaires forment une **pile** : quand « juré » expire, Léa retrouve exactement ses droits d'avant.
Exemple *Situation Rooms* (identité qui change toutes les 8 minutes) : un nœud *Rotation des rôles* qui fait tourner une liste de rôles
entre les membres d'une équipe à chaque segment.

### 4.8 Cumul et cloisons

Cumuls courants, tous permis par le modèle :

| Cumul | Ce que ça donne | Point de vigilance |
|---|---|---|
| Superviseur **et** membre de l'équipe rouge | il joue pour les Rouges et a l'onglet Supervision | il voit `qui_a_répondu` de toutes les équipes → **avantage** ; cloison recommandée : sa supervision se limite à son équipe, ou il est déclaré **neutre** (non compté dans les scores) |
| Comédien infiltré **et** équipe bleue **et** traître | il joue un spectateur bleu qui est en fait traître | les superviseurs ne doivent peut-être pas savoir qu'il est comédien : fait secret « auteur + régie seulement » |
| Streamer **et** capitaine d'une équipe | le streamer mène une équipe du public | son écran doit montrer l'onglet Capitaine en version compacte |
| Capitaine **et** traître | le chef sabote son équipe | connaissance : le traître sait qu'il est capitaine, l'équipe ne sait pas qu'il est traître — rien à faire, le modèle le gère |
| Régisseur **et** joueur (répétition) | le régisseur teste depuis son téléphone | fonction principale = régie ; une **identité de test** séparée pour le téléphone (sinon ses droits de régie fuiraient dans l'application joueur) |
| Éliminé **et** ange gardien | le fantôme protège un vivant | statut « éliminé » retire `voter`, le rôle « ange » ajoute `protéger` |

**Cloisons** (inspirées de la séparation des tâches du modèle RBAC) : des règles du type
« **un participant qui a une équipe dans la répartition X ne peut pas avoir `voir.*@tous` sur cette répartition** », vérifiées au calcul (§4.5 étape 8).
L'auteur peut les lever explicitement (« superviseurs complices »).

### 4.9 La visibilité : un graphe de connaissance

Un **fait** = « participant P a l'attribution A ». Chaque fait a une **règle de connaissance** qui calcule la liste de ses lecteurs.
Le serveur s'en sert pour **filtrer ce qu'il envoie** : un appareil ne reçoit que les faits qu'il peut lire.

Règles prêtes à l'emploi :

| Règle | Lecteurs |
|---|---|
| `public` | tout le monde, écran scène compris |
| `production` | encadrement + artistique |
| `soi` | le participant lui-même |
| `soi+equipe` | lui et ses coéquipiers (dans la répartition concernée) |
| `pairs` | ceux qui ont le même rôle (les traîtres se connaissent) |
| `pairs_partiel` | A connaît B mais pas l'inverse (Secret Hitler) ; peut dépendre du **nombre de joueurs** |
| `superviseurs` / `régie` / `auteur` | de plus en plus restreint |
| `après:<événement>` | devient public à la révélation ou à l'élimination |
| `personnalisée` | une expression de ciblage (§6.3) |

**Matrice de visibilité par défaut** (modifiable par spectacle) :

| Information sur un participant P | P lui-même | Coéquipier | Autre équipe | Capitaine de P | Superviseur | Modérateur | Régie | Écran scène | Streamer / comédiens | Enregistreur / analyse |
|---|---|---|---|---|---|---|---|---|---|---|
| Pseudo | oui | oui | oui | oui | oui | oui | oui | oui (si affiché) | oui | anonymisé |
| Couleur / emblème d'équipe | oui | oui | oui si équipe publique | oui | oui | oui | oui | oui | oui | oui |
| Appartenance à une **équipe secrète** | oui | membres seulement | non | non | selon cloison | non | oui | non | non | après coup |
| **Rôle de jeu secret** | oui | non (sauf `pairs`) | non | non | selon règle | non | oui (masquable) | à la révélation | selon besoin (« cite le traître ») | après coup |
| Rôle de prestige (VIP, élu, capitaine) | oui | oui | oui | oui | oui | oui | oui | oui | oui | oui |
| Place (siège) | oui | non | non | non | sa zone | non | oui | non (carte agrégée seulement) | le siège de l'élu | agrégé |
| Son vote individuel | oui | réglable (vote ouvert d'équipe) | non | réglable | `qui a voté` sans le contenu | non | oui | non (agrégat) | non | agrégé |
| Ses messages | oui | canal d'équipe : oui | non | oui | file de modération | oui | oui | si validés | ceux qu'on lui pousse | anonymisé |
| État réseau (présent, caché, déconnecté) | — | réglable (« ton coéquipier a décroché ») | non | oui | sa zone | non | oui | non | non | agrégé |
| Capacités (son, vibration, capteurs) | oui | non | non | non | sa zone | non | oui | non | non | agrégé |
| Statut (éliminé, sourdine) | éliminé : oui ; sourdine fantôme : **non** | éliminé : oui | éliminé : oui | oui | oui | oui | oui | éliminé : oui | oui | oui |
| Score individuel | oui | oui | classement public si activé | oui | oui | non | oui | classement | non | oui |
| Ressources d'équipe | — | oui | réglable | oui | oui | non | oui | réglable | non | oui |

**Mode « voir comme »** : la régie (et l'éditeur) peut afficher l'écran d'un participant **ou** d'une combinaison (« un joueur rouge, capitaine, traître »)
pour vérifier qu'aucun secret ne fuit. Indispensable en répétition.

### 4.10 Statuts et cycle de vie

```
            ┌──────────── statut réseau (déjà dans 03/04) ─────────────┐
            │  inscrit → présent ⇄ caché ⇄ déconnecté → parti          │
            └──────────────────────────────────────────────────────────┘
            ┌──────────── statut de jeu (nouveau) ─────────────────────┐
            │  en_attente (retardataire) → actif → éliminé (fantôme)   │
            │                              ↘ observateur ↗            │
            │  transversaux : en_sourdine, exclu, en_pause (téléphone  │
            │  de prêt entre deux personnes)                           │
            └──────────────────────────────────────────────────────────┘
```

- Les **populations** de 03 §3.4 deviennent **croisables** avec les statuts et les équipes : `présents ∩ actifs ∩ équipe:rouge`.
- Un éliminé **ne compte plus** dans le dénominateur des règles « tous ont voté » (sauf s'il a une action de fantôme dans ce segment).
- Un observateur ne compte **jamais** dans les dénominateurs.
- Un téléphone partagé compte pour **1 appareil** mais pour **N voix** si l'auteur l'a voulu.

---

## 5. Les équipes en profondeur

### 5.1 Concepts

```
RÉPARTITION « Maisons »  (exclusives entre elles, durée : tout le spectacle, visibilité : publique)
 ├─ ÉQUIPE « Rouges »   couleur #E63946, emblème ▲, capitaine Zoé42, score 120, jetons 3, canal #rouges
 ├─ ÉQUIPE « Bleus »    couleur #1D4ED8, emblème ●, capitaine Max, …
 └─ ÉQUIPE « Verts »    …
RÉPARTITION « Binômes »  (segment 4 seulement, 70 équipes de 2, visibilité : membres)
RÉPARTITION « Traîtres » (équipe secrète unique, visibilité : membres + régie)
```

Une **répartition** porte : son **mode de création**, ses **contraintes** (taille min/max, nombre d'équipes, équilibrage), sa **politique de rééquilibrage**,
sa **politique pour les retardataires**, sa **visibilité**, sa **durée** (début/fin) et la manière de produire les **identités** d'équipe.

### 5.2 Les modes de création

| Mode | Comment | Bon pour | Risques / parades |
|---|---|---|---|
| **Aléatoire équilibré** | tirage avec contraintes : tailles égales à ±1, mélanger iOS/Android et capacités (son, vibration) pour que chaque équipe puisse jouer, garder **ensemble** les téléphones partagés et les groupes d'amis, séparer les superviseurs | défaut, rapide | les amis veulent être ensemble → contrainte « ensemble » par code de groupe |
| **Par zone / siège** | jardin = Rouges, cour = Bleus ; ou par rang | effets visuels (la salle se colore par blocs), batailles « gauche contre droite » | zones déséquilibrées si la salle est mal remplie → mixer avec rééquilibrage par les retardataires |
| **Au choix du joueur** | le joueur choisit parmi les équipes ouvertes | engagement, identité | ruée vers l'équipe « cool » → **plafond** par équipe, équipe pleine grisée, « file d'attente » ; ou choix **à l'aveugle** (on choisit un symbole, pas l'équipe) |
| **Par QR d'équipe** | billets, bracelets, cartes posées sur les sièges, autocollants dans le hall : chaque QR porte l'équipe | spectacles déambulatoires, accueil physique, « terrier du lapin » | QR partagés entre amis → plafond, contrôle par l'accueil |
| **À la main par la régie** | glisser-déposer dans la vue par équipes (§7.1) | petites jauges, corrections | lent au-delà de 50 joueurs → toujours partir d'un mode automatique puis corriger |
| **Par le résultat d'un vote** | « ceux qui ont voté *porte rouge* forment l'équipe rouge » | dramaturgie : chacun assume son choix | équipes très déséquilibrées → option « plafond puis débordement vers le second choix » |
| **Par quiz / profil** | questionnaire façon « maisons » : les réponses donnent un profil | fiction, personnalisation | prévoir l'équilibrage final |
| **Par performance** | niveau au quiz d'échauffement, vitesse au buzzer → équipes de niveau égal (somme des niveaux équilibrée, pas une alternance naïve, comme le mod *Better Team Balance*) | compétition équitable | données faibles en début de spectacle |
| **Draft par capitaines** | les capitaines choisissent leurs membres tour à tour (ordre **serpent** : A B C C B A…), avec un chrono par choix | moment de spectacle (projeté sur scène) | humiliation des derniers choisis → limiter le draft aux premiers tours, le reste en aléatoire ; ou draft **sur pseudos masqués** |
| **Par ordre d'arrivée** | les N premiers sont joueurs (ou dans l'équipe 1), les suivants public (modèle Jackbox) | jauges massives, rôles rares | pénalise les retardataires → annoncer la règle |
| **Par affinité** | un **code de groupe** saisi à l'entrée (« nous sommes la bande à Léa ») garantit qu'on reste ensemble ; ou au contraire qu'on est **séparés** | sorties entre amis, scolaires | les groupes très gros cassent l'équilibre → plafond par groupe |
| **Par héritage** | reprendre une répartition existante (les Maisons de l'acte 1), ou celle de la représentation précédente pour un spectacle en plusieurs épisodes | feuilletons, saisons | identifiants stables entre représentations → choix de confidentialité (07 §5) |
| **Par tirage pondéré de rôles** | « 10 % de la salle dans l'équipe secrète des traîtres » | rôles cachés | voir distribution §3.4 |
| **Par subdivision** | chaque équipe se scinde en binômes, trinômes | jeux en petits groupes | membres absents → binômes recomposés au passage |
| **Mixte** | séquence de modes : par QR, puis aléatoire pour ceux sans QR, puis correction régie | réalité du terrain | — |

### 5.3 Taille, nombre, débordement

- On fixe **soit** le nombre d'équipes (« 3 équipes »), **soit** la taille cible (« des équipes de 6 ») ; le moteur calcule l'autre selon les **présents**.
- `taille.min` : en dessous, l'équipe est **fragile** (alerte régie) puis, selon la politique, **fusionnée** avec la plus petite voisine.
- `taille.max` : au-dessus, les arrivants vont ailleurs, ou une **nouvelle équipe** est ouverte (« ouvrir une 4e équipe quand toutes dépassent 40 »).
- **Équipe vide** (tous déconnectés) : ignorée par les règles de passage, mais **conservée** (ils peuvent revenir).

### 5.4 Rééquilibrage (quand des gens partent ou arrivent)

Politique graduée, du moins au plus intrusif (inspirée des retours d'expérience de TF2 : les déplacements forcés en pleine partie font partir les joueurs) :

| Niveau | Action | Quand |
|---|---|---|
| 0. **Jamais** | rien ne bouge, la régie est alertée | équipes à forte identité (personnages, maisons) |
| 1. **Arrivants d'abord** | les retardataires et revenants sans équipe vont dans l'équipe la plus petite (en **présents**, pas en inscrits) | défaut |
| 2. **Volontaires** | proposition « l'équipe Verte manque de bras, tu veux la rejoindre ? (+10 points) » | déséquilibre > seuil (ex. 25 %) |
| 3. **Au prochain point d'arrêt** | déplacement de joueurs **sans rôle particulier** (pas de capitaine, pas de rôle secret, pas de membre d'un groupe d'amis), annoncé sur leur écran | déséquilibre persistant |
| 4. **Forcé** | immédiat, uniquement sur ordre de la régie | exceptionnel |

Règles communes : ne **jamais** déplacer quelqu'un pendant qu'il répond ; ne jamais déplacer un capitaine ou un rôle secret sans règle explicite ;
toujours **annoncer** le changement (écran + couleur qui bascule) ; journaliser ; recalculer les dénominateurs. Le **score individuel** suit le joueur,
le **score d'équipe** reste à l'équipe.

### 5.5 Identité d'équipe : noms, couleurs, emblèmes

- **Générés** par le moteur depuis une liste fournie par l'auteur (« les Corbeaux, les Renards… ») ou un générateur (adjectif + animal).
- **Choisis** par l'équipe : propositions des membres + vote interne ; ou saisis par le capitaine → **modération obligatoire** (le nom sera projeté).
- **Couleurs** : palette **sûre pour les daltoniens** (éviter rouge/vert comme seule différence), contrastée sur fond noir (03 recommande le noir par défaut),
  et pas trop lumineuse (un écran blanc éclaire tout le rang, voir 02).
- **Emblème** = **forme + couleur** (triangle rouge, rond bleu, carré jaune) : identifiable par tous, y compris à 15 m sur l'écran scène et pour les daltoniens.
- **Signature sonore et haptique** : un son et un motif de vibration par équipe (« quand ton équipe marque, ton téléphone fait *ça* »).
- La couleur d'équipe peut devenir l'**état persistant** du fond du téléphone (03 §6) : la salle se lit d'un coup d'œil depuis la scène.

### 5.6 Le capitaine

| Mode de désignation | Détails |
|---|---|
| Tirage au sort | parmi les présents de l'équipe, en excluant (option) superviseurs et rôles secrets |
| Premier arrivé / premier qui lève la main | bouton « je veux être capitaine » pendant 10 s, puis tirage parmi les volontaires |
| Élection interne | vote dans l'équipe (avec règle de passage par équipe) |
| Désignation par la régie ou un comédien | glisser-déposer, scan du QR d'un spectateur par le comédien |
| Rotation | le capitaine change à chaque manche (tous passent) |
| Méritocratie | le meilleur score de la manche précédente |

**Pouvoirs** (paquet `capitaine`, réglable) : valider la réponse d'équipe, dépenser les ressources, renommer, désigner vice-capitaine et porte-parole,
voir qui n'a pas répondu dans son équipe, relancer ses coéquipiers (une vibration, avec limite).
**Succession** : si le capitaine est déconnecté ou caché plus de X s (défaut 15 s) au moment où on a besoin de lui, le **vice-capitaine** prend la main ;
à défaut, le membre le plus actif ; l'attribution `capitaine` a une fin `tant_que: présent`.

### 5.7 Canal d'équipe

- **Chat d'équipe** (texte court, réactions), passé par la même modération que le reste (06 §5), avec un réglage par segment : fermé, ouvert, réactions seulement.
- **Temps de concertation** (« team talk » de Kahoot) : une phase de segment où seul le canal d'équipe est ouvert, avant la réponse.
- **Visibilité** : membres ; superviseurs (selon cloison) ; régie ; **espion** (rôle secret) éventuellement en différé ou partiel.
- **Messages de personnage à une équipe** : un personnage peut écrire dans le canal d'une équipe (indice, menace).
- En salle, le canal d'équipe est surtout utile pour les équipes **dispersées** (par choix ou QR) ; les équipes par zone se parlent à voix haute.

### 5.8 Score et ressources d'équipe

- **Variables d'équipe** (déjà prévues en 03 §4.3) : `score`, `jetons`, `vies`, `inventaire`, `jauge`.
- **Agrégation** des contributions individuelles : somme, **moyenne** (Kahoot le fait pour ne pas avantager les grosses équipes), somme **normalisée par présents**,
  meilleur, médiane, « au moins un a trouvé ».
- **Dépenses** : seul le capitaine (ou un vote interne) dépense ; chaque dépense est un événement journalisé.
- **Historique** : la courbe de score par équipe alimente l'écran scène (bataille de jauges) et l'analyse après représentation.

### 5.9 Décisions et votes internes à l'équipe

Une **réponse d'équipe** est un objet avec un statut : `vide → en_cours → proposée → rendue → verrouillée`.

| Mode de décision | Fonctionnement | Rendue quand |
|---|---|---|
| **Capitaine décide** | les membres proposent, le capitaine valide | le capitaine valide |
| **Majorité interne** | vote dans l'équipe | règle de passage interne (100 % des présents de l'équipe, ou quorum, ou délai) |
| **Unanimité** | tous doivent choisir la même chose | tous d'accord, sinon forçage |
| **Premier qui répond engage l'équipe** | buzzer d'équipe | première réponse |
| **Moyenne** | curseurs → moyenne | délai |
| **Consensus avec veto** | majorité, mais un membre tiré au sort peut bloquer | délai du veto écoulé |
| **Pondéré** | la voix du capitaine compte double, ou celle des meilleurs | règle interne |

Chaque réponse d'équipe a sa propre **mini-règle de passage** (même syntaxe que 03 §3.2), évaluée sur la **population de l'équipe**.

### 5.10 Dynamique : fusion, scission, élimination, transfert

| Opération | Effet | Ce que devient… |
|---|---|---|
| **Fusion** | deux équipes deviennent une (nouveau nom ou celui de la plus grande) | scores : somme, max ou remise à zéro ; capitaines : élection, ou le capitaine de la plus grande ; canaux : fusionnés |
| **Scission** | une équipe se divise (aléatoire, par zone, par vote interne — « ceux qui veulent trahir, à gauche ») | ressources partagées au prorata ; nouveau capitaine pour la nouvelle équipe |
| **Élimination** | l'équipe sort du jeu | membres → **fantômes**, **jury**, **observateurs**, ou **absorbés** par une autre équipe (au choix de l'auteur) ; leur couleur passe au gris |
| **Transfert** | un joueur change d'équipe (trahison, recrutement, rééquilibrage) | score individuel suit, score d'équipe reste ; annoncé à l'ancienne et à la nouvelle équipe (ou pas, si trahison secrète) |
| **Absorption** | une équipe gagnante « capture » les membres d'une autre | idem élimination + transfert en masse |
| **Équipe temporaire** | binômes pour un segment, puis retour aux équipes d'origine | la répartition temporaire expire, la répartition principale n'a jamais bougé |
| **Révélation** | une équipe secrète devient publique | sa couleur apparaît sur les téléphones de ses membres et sur la carte de salle |

### 5.11 Équipes secrètes et équipes cachées

- **Équipe secrète** : seuls les membres (et la régie) savent qu'ils en font partie. Exemple : les traîtres. Elle a un canal privé.
  Un membre d'une équipe secrète est **aussi** dans une équipe publique (deux répartitions) : c'est tout l'intérêt du modèle à répartitions.
- **Équipe cachée aux membres eux-mêmes** : le joueur ne sait pas dans quelle équipe il est (expérience : « l'une des deux moitiés de la salle a reçu une
  fausse information » — 08 #21). La régie et l'auteur savent.
- **Équipe à révélation progressive** : on donne d'abord la forme, puis la couleur, puis le nom.

### 5.12 Affichage sur scène

Gabarits de l'écran scène à prévoir : **classement** (barres, podium), **bataille de jauges** (chaque équipe pousse sa barre), **carte de la salle**
colorée par équipe (si les places sont connues), **mise en avant du capitaine** (pseudo en grand), **révélation** d'une équipe secrète,
**draft en direct** (les capitaines choisissent, les pseudos glissent vers leur colonne), **fusion / élimination** animées.
Le streamer et les comédiens reçoivent une version compacte (« les Rouges mènent de 40 points, cite leur capitaine Zoé »).

### 5.13 Équipes et règles de passage

Les règles de 03 §3 s'étendent avec des **quantificateurs d'équipe** :

| Règle | Écriture | Notes |
|---|---|---|
| Chaque équipe a rendu sa réponse | `pour_chaque(équipe ∈ maisons, actives) : réponse(équipe).statut = rendue` | les équipes **vides** ou **éliminées** sont ignorées |
| Au moins 80 % de chaque équipe a voté | `pour_chaque(équipe) : ratio(votes, présents(équipe)) ≥ 0,8` | dénominateur par équipe |
| La première équipe qui… | `existe(équipe) : jauge(équipe) ≥ 1000` → branche avec `équipe_gagnante` | renvoie l'équipe en sortie de gate |
| N équipes sur M | `compte(équipe : réponse rendue) ≥ 2` | |
| Toutes sauf une | `compte(équipe : réponse rendue) ≥ nb_équipes − 1` | dernière équipe = perdante |
| Majorité d'équipes | « 2 équipes sur 3 ont choisi A » | vote par équipe (chaque équipe = 1 voix) |

**Forçage par équipe** : si le délai max est atteint, chaque équipe qui n'a pas rendu reçoit l'action `siForcé` **de l'équipe** :
réponse de la majorité actuelle, réponse du capitaine, réponse vide, ou **pénalité**. La régie voit « Rouges ✔ · Bleus ✔ · Verts en cours (4/7) ».

**Avertir** peut cibler `capitaines(équipes sans réponse)` ou `membres(équipes sans réponse) ∩ n_a_pas_voté`.

---

## 6. Ce que cela implique pour le moteur

### 6.1 Nouveaux nœuds

**Équipes**

| Nœud | Entrées | Sorties | Notes |
|---|---|---|---|
| `Créer une répartition` | nom, mode, contraintes, durée, visibilité, identités | répartition | déclarée dans le scénario, instanciée à l'exécution |
| `Répartir` | répartition, population (défaut : présents actifs), mode, graine | équipes | **latent** si le mode attend les joueurs (choix, QR, draft) |
| `Draft` | répartition, capitaines, ordre (serpent, alterné), chrono par choix, tours | équipes | latent ; affichable sur scène |
| `Ajouter à l'équipe` / `Retirer de l'équipe` / `Transférer` | joueurs, équipe, annonce oui/non | — | |
| `Rééquilibrer` | répartition, niveau (§5.4), seuil | joueurs déplacés | |
| `Fusionner` / `Scinder` / `Éliminer l'équipe` / `Absorber` | équipes, politiques (scores, capitaine, devenir des membres) | équipe(s) | |
| `Nommer / colorer l'équipe` | équipe, mode (généré, vote, capitaine) | identité | latent si vote |
| `Désigner un capitaine` | équipe(s), mode (§5.6), vice-capitaine oui/non | capitaine(s) | |
| `Ouvrir / fermer le canal d'équipe` | équipes, mode (texte, réactions, fermé) | — | état persistant |
| `Collecter la réponse d'équipe` | équipes, écran, mode de décision (§5.9), règle interne | réponses | latent |
| `Pour chaque équipe` | répartition, filtre (actives, non vides) | équipe (boucle) | |
| `Agréger par équipe` | mesure, opération (somme, moyenne normalisée…) | table équipe → valeur | |
| `Classement d'équipes` | répartition, variable | liste ordonnée | |
| `Révéler l'équipe` | équipe secrète, à qui | — | change la visibilité des faits |

**Rôles et permissions**

| Nœud | Entrées | Sorties | Notes |
|---|---|---|---|
| `Attribuer un rôle` | joueurs, rôle, fin (§4.7), usages, visibilité | attributions | |
| `Distribuer des rôles` | population, liste `{rôle, nombre | proportion | probabilité}`, contraintes (« au moins un par équipe », « jamais tiré », « pas de superviseur »), graine | joueurs par rôle | déterministe (graine du journal, 03 §8) |
| `Retirer un rôle` / `Échanger des rôles` / `Rotation des rôles` | | | Rotation = *Situation Rooms* |
| `Accorder / refuser une permission` | cible, permission, fin | — | surcharge dynamique, bornée par les plafonds |
| `Utiliser un pouvoir` (déclencheur) | rôle, pouvoir | joueur, cible choisie | décrémente les usages |
| `Révéler un rôle` | joueur(s), à qui (salle, équipe, scène) | — | |
| `Éliminer` / `Ressusciter` | joueurs, devenir (fantôme, jury, observateur) | — | change le statut |
| `Promouvoir` | joueur, fonction secondaire (superviseur depuis le public, élu) | — | soumis au plafond et, si réglé, à confirmation régie |
| `Choisir un élu` | mode (tirage, comédien, vote, régie), filtre | joueur | latent pour « comédien » et « vote » |
| `Changer de place` | joueur, place | — | correction (« il a changé de siège ») |
| `Étiqueter` / `Retirer l'étiquette` | cible, étiquette, fin | — | |

**Déclencheurs nouveaux** : `Équipe a rendu sa réponse` · `Équipe vide / sous le minimum` · `Joueur change d'équipe` · `Capitaine absent` ·
`Rôle attribué / expiré / révélé` · `Pouvoir utilisé` · `Joueur éliminé` · `Retardataire arrive` · `Équipe a gagné la manche` · `Déséquilibre détecté`.

### 6.2 Variables

La portée « groupe / équipe » de 03 §4.3 devient « **équipe** » (avec la répartition en préfixe : `maisons.rouges.score`) et on ajoute :
- portée **rôle** (`traîtres.mission_accomplie`),
- portée **personnage** (`docteur.humeur`),
- variables **calculées** en lecture seule : `nb_présents(équipe)`, `capitaine(équipe)`, `rang(équipe)`, `a_rendu(équipe)`.

### 6.3 Ciblage étendu

La syntaxe de 03 §5 s'étend ainsi :

```
équipe:rouges                         équipe de la répartition par défaut
équipe:binômes/12                     équipe d'une répartition nommée
équipes(maisons)                      toutes les équipes (pour une boucle)
membres(équipe:rouges)                = équipe:rouges
capitaine(équipe:rouges)              capitaines(maisons)
coéquipiers(moi)                      dans un écouteur : les coéquipiers de l'auteur de l'événement
adversaires(moi)
rôle_jeu:traître                      (seuls les nœuds serveur peuvent le lire ; jamais un client)
pairs(rôle_jeu:traître)
fonction:superviseur
statut:éliminé                        statut:actif
étiquette:son_ok                      étiquette:a_voté_A
zone:balcon & équipe:bleus            intersection
place:parterre/G/*                    rangée G
à_distance                            tous les participants hors salle
personnage:docteur                    les opérateurs du personnage
équipes_sans_réponse(maisons)         équipes dont la réponse n'est pas rendue
aléatoire(1, parmi: membres(équipe:rouges) - capitaine(équipe:rouges))
```

Règle de sécurité : **une cible fondée sur un secret ne révèle pas le secret**. Envoyer « vibre » à `rôle_jeu:traître` est permis ; l'effet arrive
sans dire pourquoi. En revanche, afficher à l'écran scène la liste de `rôle_jeu:traître` exige une **révélation** explicite.

### 6.4 Validation dans l'éditeur (nouvelles alertes)

- Une règle « chaque équipe… » sur une répartition qui **peut être vide** à ce moment → alerte.
- Un rôle secret sans **règle de connaissance** → alerte.
- Une permission au-dessus du **plafond** de la fonction visée → erreur.
- Un écran scène qui affiche un fait **non public** sans révélation préalable → erreur.
- Des couleurs d'équipe **trop proches** ou indiscernables pour un daltonien → avertissement.
- Un capitaine requis sans **succession** prévue → avertissement.
- Un cumul qui viole une **cloison** → avertissement avec la chaîne d'attributions.
- Une répartition sans politique **retardataires** → valeur par défaut affichée (« vers la plus petite équipe »).

### 6.5 Exemple : un segment « manche d'équipes »

```jsonc
"seg4_manche": {
  "duree": { "mode": "minmax", "min": 20, "max": 120 },
  "onEnter": "fg_manche",          // Ouvrir le canal d'équipe 30 s, puis Collecter la réponse d'équipe (capitaine décide)
  "sortie": "gate_manche"
},
"gates": {
  "gate_manche": {
    "quand": {
      "type": "pour_chaque_equipe",
      "repartition": "maisons",
      "filtre": "actives_non_vides",
      "condition": { "type": "reponse_equipe", "statut": "rendue" }
    },
    "auPlusTard": 120,
    "pasAvant": 20,
    "avertir": { "avant": 15, "cible": "capitaines(equipes_sans_reponse(maisons))", "effets": ["vibrer:alerte"] },
    "siForce": { "par_equipe": "majorite_actuelle", "sinon": "penalite:-10" },
    "vers": [
      { "si": "rang(equipe:verts) == 3 && nb_presents(equipe:verts) < 5", "segment": "seg5_fusion" },
      { "sinon": true, "segment": "seg5_revelation" }
    ]
  }
}
```

---

## 7. Ce que cela implique pour la régie

### 7.1 Vue par équipes

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ÉQUIPES — répartition [Maisons ▼]   Rééquilibrage: arrivants d'abord   [Répartir…] [Annuler] │
├──────────────────────┬──────────────────────┬──────────────────────┬───────────────────┤
│ ▲ ROUGES  46 (44 ●)  │ ● BLEUS  45 (41 ●)   │ ■ VERTS  31 (27 ●) ⚠ │ SANS ÉQUIPE  6    │
│ score 120 · jetons 3 │ score 95 · jetons 1  │ score 60 · jetons 0  │ (retardataires)   │
│ réponse : RENDUE ✔   │ réponse : en cours   │ réponse : en cours   │                   │
│ ★ Zoé42 (cap.)       │ ★ Max (cap.)         │ ★ — absent 0:18 ⚠    │ ○ Ana   ○ Tom     │
│ ☆ Léa (vice)         │   Inès  ✓            │   Paul ✓             │                   │
│   Sam ✓  Noé ✓       │   Jade               │   …                  │                   │
│   …  [+40]           │   …  [+42]           │   [+28]              │ [Répartir ceux-là]│
└──────────────────────┴──────────────────────┴──────────────────────┴───────────────────┘
  glisser-déposer un pseudo = Transférer (confirmation si capitaine / rôle secret)
  sélection multiple (Maj / Ctrl) → [Envoyer à…] [Étiqueter] [Changer d'équipe] [Attribuer un rôle]
```

- **Colonnes** par équipe (style tableau Kanban), en-tête = identité, effectif (inscrits / **présents**), score, ressources, **statut de la réponse**.
- **Glisser-déposer** pour transférer ; **confirmation** si la personne est capitaine, porte un rôle secret, ou si le déplacement crée un déséquilibre > seuil.
- **Annuler** la dernière opération (toutes les opérations d'équipe sont des événements réversibles du journal).
- **Répartir à nouveau** avec aperçu (« voici ce que donnerait un tirage équilibré ») avant d'appliquer.
- **Alertes** : équipe sous le minimum, capitaine absent, équipe sans réponse à 15 s du max, déséquilibre.
- **Carte de la salle** colorée par équipe (si les places sont connues) : on sélectionne au lasso une zone → cible.

### 7.2 Feuille de distribution (rôles)

- **Avant la représentation** : la liste des rôles artistiques et d'encadrement du spectacle (streamer, comédiens, modérateurs, superviseurs…)
  avec, pour chacun, la personne et son **lien d'invitation** ; état « invité / connecté / prêt ».
- **Pendant** : un tableau participants × attributions, filtrable (« montre-moi tous les rôles secrets actifs », « tous les élus de ce soir »),
  avec la **chaîne d'explication** des permissions d'un participant (« pourquoi voit-il ça ? »).
- **Masque anti-fuite** : un bouton (et un réglage par poste) qui masque les rôles secrets et équipes secrètes à l'écran, pour une régie visible du public
  ou filmée ; les secrets réapparaissent au survol maintenu.

### 7.3 Postes et régies de poche

- Chaque poste régie a une **fonction** (régisseur général, modérateur, technicien d'accompagnement, accueil, observateur) et donc ses panneaux.
- La **régie de poche** du superviseur (05 §3) et l'**onglet capitaine** sont la même mécanique : des panneaux accordés par permissions,
  restreints à une portée (sa zone, son équipe).
- Les actions publiques depuis une régie de poche demandent une **double confirmation** (modèle Slido/Webex).

### 7.4 Voir comme

Un sélecteur « voir comme » : un participant réel, ou une **combinaison fictive** (fonction + équipe + rôles) pour vérifier ce que verrait
« un joueur bleu, capitaine, traître » à ce segment. Disponible dans l'éditeur (aperçus de rôle de 05 §1) et en répétition.

---

## 8. Proposition de schéma de données

Deux parties : ce qui est **écrit dans le spectacle** (définitions, versionnées dans Git) et ce qui **existe pendant une représentation** (état, dans l'instantané et le journal).

### 8.1 Dans le fichier du spectacle (définitions)

```jsonc
{
  "participants": {

    "permissions_paquets": {
      "joueur":        { "accorde": ["jouer.*@soi", "equipe.canal.lire@mon_equipe", "equipe.canal.ecrire@mon_equipe", "equipe.reponse.proposer@mon_equipe"] },
      "observateur":   { "accorde": [], "refuse": ["jouer.*"] },
      "membre":        { "herite": ["joueur"] },
      "capitaine":     { "herite": ["membre"], "accorde": ["equipe.reponse.valider@mon_equipe", "equipe.ressources.depenser@mon_equipe",
                         "equipe.renommer@mon_equipe", "voir.qui_a_repondu@mon_equipe", "attribuer.role:vice_capitaine@mon_equipe", "relancer@mon_equipe"] },
      "superviseur":   { "herite": ["joueur"], "accorde": ["voir.compteurs@tous", "voir.qui_a_repondu@ma_zone", "relancer@ma_zone", "moderer.valider@ma_zone"] },
      "moderateur":    { "accorde": ["moderer.*@tous", "voir.journal@messages"] },
      "regisseur_general": { "herite": ["moderateur"], "accorde": ["regie.*", "attribuer.*", "voir.*@tous"] }
    },

    "fonctions": {
      "spectateur":       { "famille": "public",       "application": "joueur",   "paquet": "joueur", "attribution": ["entree_qr"] },
      "spectateur_distant": { "famille": "public",     "application": "joueur_distant", "paquet": "joueur", "poids_vote": 0.5, "attribution": ["lien_billet"] },
      "observateur":      { "famille": "public",       "application": "joueur",   "paquet": "observateur", "attribution": ["soi", "accueil", "regie"] },
      "superviseur":      { "famille": "encadrement",  "application": "joueur",   "paquet": "superviseur", "panneaux": ["supervision"],
                            "attribution": ["invitation", "regie"], "cloisons": ["pas_voir_autres_equipes_si_membre"] },
      "streamer":         { "famille": "artistique",   "application": "streamer", "paquet": "streamer", "attribution": ["invitation"] },
      "comedien_salle":   { "famille": "artistique",   "application": "consignes", "paquet": "comedien", "attribution": ["invitation"] },
      "comedien_infiltre":{ "famille": "artistique",   "application": "joueur",   "paquet": "joueur", "panneaux": ["consignes"],
                            "masque_public": true, "connaissance": "regie" },
      "marionnettiste":   { "famille": "artistique",   "application": "regie",    "paquet": "marionnettiste", "personnages": ["docteur"] },
      "accueil":          { "famille": "encadrement",  "application": "borne",    "paquet": "accueil" },
      "technicien_salle": { "famille": "encadrement",  "application": "regie",    "paquet": "accompagnement" },
      "regisseur_general":{ "famille": "encadrement",  "application": "regie",    "paquet": "regisseur_general" },
      "ecran_scene":      { "famille": "dispositif",   "application": "scene",    "paquet": null, "lit": "public" },
      "ecran_hall":       { "famille": "dispositif",   "application": "scene",    "gabarit": "hall", "lit": "public" },
      "bot":              { "famille": "dispositif",   "application": null,       "paquet": "joueur", "profil": "aleatoire" }
    },

    "plafonds": {
      "public":      { "jamais": ["regie.*", "attribuer.fonction:*", "voir.journal", "personnage.*"] },
      "artistique":  { "jamais": ["regie.sauter", "regie.panique", "attribuer.fonction:*"] },
      "dispositif":  { "jamais": ["*.ecrire", "jouer.*"] }
    },

    "roles_jeu": {
      "traitre": {
        "paquet": { "accorde": ["equipe.canal.lire@equipe:traitres", "equipe.canal.ecrire@equipe:traitres", "pouvoir.saboter@mon_equipe"] },
        "pouvoirs": { "saboter": { "usages": 1 } },
        "equipe_secrete": "traitres/traitres",
        "connaissance": { "regle": "pairs", "plus": ["regie", "superviseurs"] },
        "victoire": "non_demasque_a_la_fin",
        "revelation": ["elimination", "noeud"]
      },
      "oracle": {
        "pouvoirs": { "voir_role": { "usages": 2, "cible": "un_joueur" } },
        "connaissance": { "regle": "soi", "plus": ["regie"] }
      },
      "capitaine": { "paquet": "capitaine", "connaissance": { "regle": "public" }, "fin_par_defaut": { "mode": "tant_que", "condition": "present" },
                     "succession": ["vice_capitaine", "plus_actif"] },
      "elu":       { "panneaux": ["telecommande_scene"], "connaissance": { "regle": "public" }, "duplique_sur": "ecran_scene" },
      "jure":      { "paquet": { "accorde": ["noter@propositions"] }, "connaissance": { "regle": "public" } },
      "fantome":   { "paquet": { "accorde": ["chuchoter@zone", "parier@issue"], "refuse": ["voter"] }, "connaissance": { "regle": "public" } }
    },

    "personnages": {
      "docteur": { "nom": "Le Docteur", "avatar": "media/docteur.png", "couleur": "#7C3AED", "voix": "fr-FR-grave",
                   "incarnations": [{ "par": "fonction:marionnettiste", "priorite": 1 }, { "par": "ia:docteur", "priorite": 2, "relecture": "superviseur" }] }
    },

    "repartitions": {
      "maisons": {
        "creation": { "mode": "aleatoire_equilibre", "contraintes": ["ensemble:groupe_amis", "ensemble:appareil_partage",
                      "equilibrer:plateforme", "equilibrer:capacite_son", "repartir:superviseurs"] },
        "equipes": { "nombre": 3 },
        "taille": { "min": 5, "max": 60 },
        "identites": { "mode": "liste", "liste": [
          { "id": "rouges", "nom": "Les Rouges", "couleur": "#E63946", "embleme": "triangle", "son": "media/rouge.mp3", "vibration": "court-court" },
          { "id": "bleus",  "nom": "Les Bleus",  "couleur": "#1D4ED8", "embleme": "rond" },
          { "id": "verts",  "nom": "Les Verts",  "couleur": "#2A9D8F", "embleme": "carre" } ] },
        "capitaine": { "mode": "volontaires_puis_tirage", "vice": true, "exclure": ["fonction:superviseur", "role_jeu:*secret*"] },
        "canal": { "defaut": "ferme" },
        "variables": { "score": 0, "jetons": 3 },
        "agregation_score": "moyenne_presents",
        "retardataires": "plus_petite_equipe",
        "reequilibrage": { "niveau": 2, "seuil": 0.25, "jamais_pendant": "reponse" },
        "visibilite": "publique",
        "duree": { "debut": "seg2_maisons", "fin": "representation" }
      },
      "traitres": {
        "creation": { "mode": "par_role", "role": "traitre" },
        "equipes": { "liste": ["traitres"] },
        "canal": { "defaut": "ouvert" },
        "visibilite": "membres+regie"
      },
      "binomes": {
        "creation": { "mode": "subdivision", "source": "maisons", "taille": 2 },
        "duree": { "debut": "seg4_binomes", "fin": { "fin_segment": "seg4_binomes" } },
        "visibilite": "membres"
      }
    },

    "lieu": {
      "zones": [
        { "id": "parterre", "rangs": "A-P", "sieges_par_rang": 20, "origine": [0, 0] },
        { "id": "balcon",   "rangs": "A-F", "sieges_par_rang": 24, "origine": [0, 18] },
        { "id": "distant",  "hors_salle": true }
      ]
    },

    "etiquettes": {
      "statiques": ["vip", "mineur", "accessibilite_visuelle", "accessibilite_auditive", "mode_calme"],
      "calculees": {
        "son_ok": "capacites.son == true",
        "ios": "appareil.plateforme == 'ios'",
        "jamais_tire": "!historique.contient('tirage')"
      }
    }
  }
}
```

### 8.2 Pendant la représentation (état)

```jsonc
{
  "representation": "K7Q2",
  "participants": {
    "p_zoe42": {
      "pseudo": "Zoé42",
      "fonction_principale": "spectateur",
      "statut": { "jeu": "actif", "reseau": "present" },
      "appareils": [ { "id": "d_9a1", "plateforme": "ios", "capacites": { "son": true, "vibration": false, "capteurs": true }, "dernier_seq": 4830 } ],
      "voix": 1,
      "place": "parterre/G/12",
      "profil": { "mode_calme": false, "langue": "fr" },
      "groupe_amis": "bande_lea",
      "variables": { "points": 40 }
    },
    "p_scene": { "pseudo": "Écran scène", "fonction_principale": "ecran_scene", "statut": { "reseau": "present" } },
    "p_doc_ia": { "pseudo": "IA Docteur", "fonction_principale": "personnage_ia", "personnage": "docteur" }
  },

  "attributions": [
    { "id": "a1", "participant": "p_zoe42", "type": "equipe",  "valeur": "maisons/rouges",
      "source": { "par": "noeud", "ref": "fg_seg2/repartir" }, "debut": { "seq": 1204 }, "fin": { "mode": "representation" }, "visibilite": "public" },
    { "id": "a2", "participant": "p_zoe42", "type": "role",    "valeur": "capitaine", "portee": "maisons/rouges",
      "source": { "par": "noeud", "ref": "fg_seg2/capitaine" }, "debut": { "seq": 1260 }, "fin": { "mode": "tant_que", "condition": "present" }, "visibilite": "public" },
    { "id": "a3", "participant": "p_zoe42", "type": "role",    "valeur": "traitre",
      "source": { "par": "noeud", "ref": "fg_seg6/distribuer" }, "debut": { "seq": 4812 }, "fin": { "mode": "fin_segment", "segment": "seg7_climax" },
      "usages": { "saboter": 1 }, "visibilite": "role:traitre" },
    { "id": "a4", "participant": "p_zoe42", "type": "equipe",  "valeur": "traitres/traitres",
      "source": { "par": "derive", "ref": "a3" }, "visibilite": "membres+regie" },
    { "id": "a5", "participant": "p_zoe42", "type": "etiquette", "valeur": "tire_seg6",
      "source": { "par": "noeud", "ref": "fg_seg6/distribuer" }, "visibilite": "regie" }
  ],

  "equipes": {
    "maisons/rouges": {
      "nom": "Les Rouges", "couleur": "#E63946", "embleme": "triangle",
      "capitaine": "p_zoe42", "vice": "p_lea",
      "variables": { "score": 120, "jetons": 3 },
      "canal": { "etat": "ouvert", "mode": "reactions" },
      "reponse": { "segment": "seg4_manche", "statut": "rendue", "valeur": "B", "par": "p_zoe42", "seq": 3990 },
      "statut": "active"
    },
    "maisons/verts": { "statut": "active", "capitaine": null, "alertes": ["capitaine_absent", "sous_minimum"] }
  },

  "permissions_effectives_cache": {
    "p_zoe42": { "calcule_au_seq": 4812, "application": "joueur", "panneaux": ["capitaine", "canal:rouges", "canal:traitres", "mission"],
                 "verbes": ["jouer.*@soi", "equipe.reponse.valider@maisons/rouges", "pouvoir.saboter@maisons/rouges", "…"] }
  }
}
```

### 8.3 Ce qui part dans l'instantané d'un appareil (04 §3.3)

Le serveur **projette** l'état ci-dessus pour chaque appareil, à travers les règles de connaissance :

```jsonc
// instantané envoyé au téléphone de Zoé42
{
  "moi": { "pseudo": "Zoé42", "place": "parterre/G/12", "statut": "actif",
           "equipes": [ { "repartition": "maisons", "id": "rouges", "nom": "Les Rouges", "couleur": "#E63946", "embleme": "triangle" },
                        { "repartition": "traitres", "id": "traitres", "secret": true } ],
           "roles": [ { "id": "capitaine", "public": true }, { "id": "traitre", "secret": true, "usages": { "saboter": 1 }, "fin": "seg7_climax" } ],
           "panneaux": ["capitaine", "canal:rouges", "canal:traitres", "mission"] },
  "connu": {
    "coequipiers_rouges": { "presents": 44, "ont_repondu": 41 },
    "autres_traitres": ["Max"]                 // règle « pairs »
  }
  // rien sur les rôles des autres joueurs, rien sur les places des autres, rien sur la composition des autres équipes secrètes
}
```

---

## 9. Ce que ça change dans les autres documents (à reporter si l'étude est validée)

| Document | Changement |
|---|---|
| [01](../01-vision-et-roles.md) | Remplacer le tableau « Les rôles » par un renvoi à cette étude ; supprimer « un même téléphone n'a qu'un rôle à la fois » ; ajouter au vocabulaire : fonction, rôle de jeu, répartition, équipe, étiquette, place, attribution, personnage |
| [03](../03-moteur-scenario.md) | Populations croisées avec statuts et équipes ; quantificateurs d'équipe dans les règles de passage ; nouveaux nœuds (§6.1) ; ciblage étendu (§6.3) ; portées de variables équipe/rôle/personnage |
| [04](../04-connexion-reprise-reseau.md) | L'instantané est une **projection filtrée** des attributions ; entrée avec code de groupe d'amis, téléphone partagé, QR d'équipe ; liens d'invitation pour les fonctions de production |
| [05](../05-regie-et-studio.md) | Vue par équipes, feuille de distribution, masque anti-fuite, « voir comme », postes par fonction, borne d'accueil, vue du technicien d'accompagnement |
| [06](../06-cas-live-streamer.md) | Le segment 6 (rôles secrets) s'écrit avec *Distribuer des rôles* ; le streamer peut être capitaine ; les consignes peuvent viser `capitaine(équipe:…)` |
| [07](../07-architecture-technique.md) | `packages/schema` : schémas Zod de §8 ; le **filtre de diffusion** par règles de connaissance est une pièce de sécurité (tests dédiés) ; jetons vidéo LiveKit émis selon les permissions effectives |
| [08](../08-catalogue-mecaniques.md) | Ajouter : draft par capitaines, fusion/élimination d'équipes, ange gardien, espion, rotation des rôles, vote d'équipes |

---

## 10. Découpage proposé (pour ne pas tout construire d'un coup)

| Étape | Contenu | Pourquoi d'abord |
|---|---|---|
| **Socle (phase 1)** | Participant, appareil, **attribution** ; fonctions principales (spectateur, superviseur, streamer, écran scène, régie, bot) ; **une** répartition aléatoire équilibrée + retardataires vers la plus petite ; étiquettes posées ; ciblage `équipe:` ; filtre de diffusion par règles `public / soi / soi+équipe / régie` | c'est la structure ; la changer plus tard coûterait cher |
| **LIVE (phase 2)** | Rôles secrets avec *Distribuer des rôles* et règle `pairs` ; capitaine avec succession ; réponse d'équipe + quantificateur « chaque équipe » ; vue par équipes avec glisser-déposer ; masque anti-fuite | le segment 6 de LIVE en a besoin |
| **Studio (phase 3)** | Tous les modes de création, draft, fusion/scission/élimination, canal d'équipe, personnages et incarnations, voir comme, validations de l'éditeur | richesse d'écriture |
| **Extension (phase 4)** | Places et carte de salle (mosaïque, équipes par zone), public à distance et pondération, téléphone partagé, borne d'accueil, héritage entre représentations | dépend du lieu et de la billetterie |

Tâches délégables aux agents locaux (selon les règles du projet) : schémas Zod de §8, tests du calcul des permissions effectives (§4.5)
et du rééquilibrage (§5.4), générateur d'identités d'équipe, vue Kanban de la régie. À garder pour Claude : le **filtre de diffusion** des secrets
(sécurité) et le moteur de résolution des permissions.

---

## 11. Questions ouvertes pour le propriétaire

1. **Équipes dans LIVE** : faut-il des équipes dès la première création, ou d'abord des rôles secrets seuls ?
2. **Public à distance** : est-il envisagé (billet « en ligne ») ? Si oui, sa voix pèse-t-elle autant que celle de la salle ?
3. **Places** : connaîtra-t-on les sièges (billetterie numérotée, QR par siège) ? Sans places, pas de mosaïque ni d'équipes par zone.
4. **Superviseurs** : sont-ils **neutres** (encadrement pur) ou **joueurs** dans une équipe ? (cloisons, §4.8)
5. **Comédiens infiltrés** : les superviseurs doivent-ils savoir qui ils sont ?
6. **Draft par capitaines** : moment de spectacle souhaitable, ou risque d'humiliation trop fort pour le public visé ?
7. **Éliminés** : que deviennent-ils par défaut — fantômes actifs, jury, simples observateurs ?
8. **Personnage IA** : relecture humaine obligatoire de chaque message, ou seulement des messages signalés ?
9. **Téléphone partagé** : une voix par appareil ou une voix par personne déclarée ?
10. **Mémoire entre représentations** (feuilletons) : garde-t-on l'équipe d'un spectateur d'une soirée à l'autre ? (implique un identifiant durable, donc RGPD)

---

## Sources

Consultées pour cette étude :

- Loup-Garou de Thiercelieux — <https://fr.vikidia.org/wiki/Loup-Garou_Le_jeu>
- Secret Hitler — règles officielles <https://secrethitler.io/rules> ; <https://en.wikipedia.org/wiki/Secret_Hitler>
- Among Us — réglages des rôles <https://dotesports.com/general/news/how-to-set-roles-in-among-us> ; <https://progameguides.com/among-us/best-roles-settings-in-among-us/> ; <https://digitaltrends.com/gaming/among-us-roles-guide>
- Jackbox — <https://blog.playstation.com/2015/06/30/quiplash-new-party-game-expands-audience-participation-to-10000/> ; <https://www.jackboxgames.com/best-jackbox-games-for-large-groups/> ; <https://jackboxgames.com/the-jackbox-party-pack-5-streamers-guide/>
- Kahoot, mode équipe — <https://support.kahoot.com/hc/en-us/articles/4408679135891-Kahoot-game-play-in-team-mode> ; <https://kahoot.com/blog/2021/09/22/kahoots-new-team-mode/>
- Discord, permissions — <https://docs.discord.com/developers/topics/permissions.md> ; <https://discordjs.guide/legacy/popular-topics/permissions> ; comportement d'union des autorisations signalé par la communauté : <https://support.discord.com/hc/tr/community/posts/360037617211-Channel-Permission-Hierachy>
- Twitch — <https://discuss.dev.twitch.com/t/lead-moderator-role-and-chat-badge-introduced/64488> ; <https://blog.eklipse.gg/beginner-guide-2/twitch-badges-guide.html>
- Slido — <https://community.slido.com/setting-up-a-slido-82/use-co-hosts-to-collaborate-and-help-manage-slidos-501/index2.html> ; <https://community.slido.com/slido-for-webex-90/slido-and-webex-role-comparison-2015>
- Punchdrunk, *Sleep No More* — <https://en.wikipedia.org/wiki/Sleep_No_More_(2011_play)> ; <https://borrowers-ojs-azsu.tdl.org/borrowers/article/view/107>
- Rimini Protokoll — <https://kulturstiftung-des-bundes.de/en/programmes_projects/theatre_and_movement/detail/situation_rooms.html> ; <https://www.metropolis.dk/en/remote-copenhagen-rimini-protokoll/>
- Jeux en réalité alternée — <https://unfiction.com/compendium/2007/12/15/the-puppetmaster-player-communication-dynamic-in-alternate-reality-gaming-and-chaotic-fiction/2>
- Rééquilibrage d'équipes — <https://wiki.teamfortress.com/wiki/Autobalance> ; <https://thunderstore.io/c/northstar/p/MentalEdge/BetterTeamBalance/v/3.0.0/> ; <https://uefncentral.com/cs/library/nn6n-game-balance-teams>

Citées de mémoire, **non revérifiées** pendant l'étude (à confirmer) :

- *Blood on the Clocktower*, rôles « Voyageurs » pour arrivées tardives — <https://wiki.bloodontheclocktower.com/Travellers>
- NIST, modèle RBAC (hiérarchie de rôles, activation par session, séparation des tâches) — <https://csrc.nist.gov/projects/role-based-access-control>

Limites : certaines sources sont des guides de joueurs ou des blogs (Among Us, Twitch VIP) et peuvent ne plus refléter les versions actuelles ;
le détail des règles de connaissance de Secret Hitler varie selon les sources et le nombre de joueurs (ce qui illustre justement le besoin
d'une règle de connaissance paramétrable).
