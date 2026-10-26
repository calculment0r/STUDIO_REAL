# Étude — Modération temps réel et cadre légal (France / UE)

*Projet STUDIO_REAL, cas LIVE ([06 §5](../06-cas-live-streamer.md)). Étude du 26 octobre 2026, à partir de sources web consultées ce jour.*

> **Ce document n'est pas un avis juridique.** Il rassemble des textes officiels, des recommandations de la CNIL et des
> documentations de produits, avec l'analyse d'un non-juriste. Les points marqués **[À FAIRE VALIDER]** doivent être
> relus par un avocat ou le DPO avant la première représentation publique. Les points marqués **[estimation]** sont des
> ordres de grandeur calculés ici, pas des mesures. La section 10 liste ce qui n'a pas pu être vérifié.

---

## 0. En bref (10 décisions)

1. **Tout n'est pas compatible avec 300 ms.** Seuls les filtres déterministes (normalisation + listes + débit, < 5 ms) et,
   à la rigueur, un petit classifieur local sur le réseau de la salle (≈ 30–100 ms [estimation]) tiennent dans le budget.
   Un LLM via API cloud (Claude Haiku 5.5) **ne doit jamais être dans le chemin synchrone** : voir §3.
2. **Deux voies, pas une.** Voie rapide (message « propre », affiché < 300 ms) et voie lente (message « douteux », retenu
   0,5 à 3 s ou envoyé en file humaine). Le score de risque choisit la voie. Le mode du segment (libre / tampon / validation)
   règle les seuils.
3. **L'IA ne peut que durcir, jamais assouplir** : si les filtres déterministes bloquent, l'IA ne peut pas débloquer ;
   si l'IA hésite, elle retient. Cela neutralise aussi l'injection de consigne par un spectateur.
4. **Les images ne passent jamais en automatique** (v1) : contrôle automatique + validation humaine obligatoire + photo prise
   en direct (pas de galerie) + consentement explicite et spécifique. Pas d'images pour les mineurs sans accord parental.
5. **Aucune base « consentement » pour le chat texte** : contrat (service demandé) ou intérêt légitime, avec information
   claire *avant* le premier envoi (« ce que tu écris est projeté en public »). Le consentement est réservé aux photos
   et à toute conservation au-delà du spectacle.
6. **Adresse IP = donnée personnelle.** Ne pas la stocker dans la base de jeu ; empreinte salée à rotation quotidienne pour
   le débit ; journaux d'infrastructure à durée courte et justifiée.
7. **Jeton d'appareil (localStorage)** : exempt de consentement s'il sert *uniquement* à reprendre la session du spectacle
   (« strictement nécessaire à un service expressément demandé »). Interdire tout usage d'audience/analytique sur le même jeton.
8. **Purge** : messages, pseudos, jetons, images supprimés après la représentation (délai court, §6.1). Conflit à arbitrer
   avec le journal rejouable de [03 §8](../03-moteur-scenario.md) : journal pseudonymisé ou anonymisé.
9. **L'organisateur reste responsable de ce qui est projeté** : il choisit d'afficher ; le statut d'« hébergeur » ne le protège
   sans doute pas. Le DSA s'applique probablement peu, mais ses bonnes pratiques (CGU claires, signalement, recours humain)
   coûtent peu et sont adoptées par défaut.
10. **Photosensibilité** : limiteur global de flashs côté écran scène *et* côté téléphones (≤ 3 flashs/s, pas de rouge saturé),
    avertissement affiché à l'entrée et dans l'application.

---

## 1. Contraintes du projet (rappel des documents existants)

- Public identifié **par pseudo seulement** ([02 §« Données personnelles »](../02-capacites-telephone.md)), jeton secret de 128 bits dans
  `localStorage`/IndexedDB/cookie, repli par jeton dans l'URL ([04 §3](../04-connexion-reprise-reseau.md)).
- Commentaire tapé → visible sur scène **< 300 ms** ; longueur ≈ 80 caractères ; débit régulé à l'écran ([06 §1, §3](../06-cas-live-streamer.md)).
- Niveaux de modération déjà prévus en [06 §5](../06-cas-live-streamer.md) : automatique, tampon 1–3 s, file manuelle, sourdine fantôme, IA en option.
  Le mode est un **paramètre du segment**. Le tampon de 1–3 s est donc **incompatible avec le « < 300 ms »** : il faut
  l'assumer comme deux modes distincts (« direct » et « tampon »), pas comme un seul chiffre.
- Pseudo : unicité, filtre d'insultes, 16 caractères max, renommage par la régie ([04 §2](../04-connexion-reprise-reseau.md)).
- Données purgées après la représentation ([07 §sécurité](../07-architecture-technique.md)) ; photos du public = consentement explicite.
- Réseau de salle fragile ([04](../04-connexion-reprise-reseau.md)), salle de 100 à 500 personnes (question ouverte en [06 §7](../06-cas-live-streamer.md)).

---

## 2. Pratiques observées dans les produits comparables

| Produit | Ce qui est fait | Enseignement pour STUDIO_REAL |
|---|---|---|
| **Twitch AutoMod** | Filtre qui **retient** les messages douteux pour un modérateur, qui les autorise ou les bloque ; 4 catégories (discrimination, contenu sexuel, hostilité, grossièretés), niveaux réglables ; ne sanctionne personne ; termes bloqués/autorisés propres à la chaîne ; l'API expose aussi « Check AutoMod Status » (tester un message sans le publier). | Même logique « retenir plutôt que supprimer », catégories × niveaux par segment, listes personnalisables par spectacle. Sources : [Technipages](https://www.technipages.com/twitch-tv-configure-automod-for-your-twitch-chat), [Twitch API](https://dev.twitch.tv/docs/api/reference/), [Twitch Help](https://help.twitch.tv/s/article/how-to-manage-harassment-in-chat) (la page d'aide n'a pas pu être lue en détail). |
| **Slido** | Filtre de gros mots **actif par défaut** ; impossible de le désactiver pour le Q&R (désactivable sur le nuage de mots) ; les contenus filtrés vont à la corbeille ; une réponse de la communauté (2023) indique « anglais seulement » ; modération des questions *avant* publication (offre Professional et plus d'après l'ancienne interface). | Un filtre par défaut mal localisé est inefficace en français : il faut **notre propre liste française**. La pré-validation existe comme mode standard. Sources : [communauté Slido](https://community.slido.com/community-questions-7/allow-profanity-5529), [modération Q&R](https://community.slido.com/old-slido-interface-help-articles-123/prevent-poisonous-or-inappropriate-questions-3802). |
| **Mentimeter** | Filtre **opt-in**, choisi par langue, basé sur des listes collaboratives ; ne filtre pas les mots composés ni les mots contenant une suite de lettres profane (évite le problème de Scunthorpe) ; l'éditeur reconnaît qu'on ne peut pas suivre la créativité des utilisateurs ; les réponses filtrées restent visibles sur la page de résultats ; Q&R : rien n'est affiché avant approbation. | Accepter les faux négatifs côté liste, compenser par la modération humaine. Garder l'original côté régie (utile pour les sanctions), masqué côté public. Source : [aide Mentimeter](https://help.mentimeter.com/en/articles/1649840-mentimeter-s-profanity-filter). |
| **Kahoot** | Liste de mots « universellement inappropriés » vérifiée à l'entrée : un pseudo refusé est **remplacé automatiquement par un pseudo neutre** ; générateur de pseudos aléatoires (3 essais) activable par l'hôte ; l'hôte peut retirer un joueur depuis le lobby ; signalement d'erreurs de liste (liste d'autorisation / de refus). | Modèle direct pour [04 §2](../04-connexion-reprise-reseau.md) : pas de message d'erreur humiliant, remplacement silencieux (« Spectateur 42 »), option « pseudos générés » pour les salles scolaires, renommage par la régie. Source : [aide Kahoot](https://support.kahoot.com/hc/en-us/articles/115002201267) (consultée via résultat de recherche : la page directe renvoie 403). |

---

## 3. L'IA de modération est-elle compatible avec « < 300 ms » ?

### 3.1 Les modèles et services candidats

| Option | Ce que disent les sources | Verdict pour le chemin < 300 ms |
|---|---|---|
| **Claude Haiku 5.5** (API, `claude-haiku-5-5`, sorti le 7 oct. 2026) | « Le plus rapide » de la gamme, conçu pour classification et routage ; contexte 1 M ; texte + images en entrée ; **réflexion adaptative active par défaut, effort `medium`** ; 0,10 $/M jetons en entrée, 0,50 $/M en sortie (lecture de cache 0,01 $/M) ; réflexion désactivable (`thinking: {"type":"disabled"}`, accepté à effort `high` ou moins) ; cache à partir de 512 jetons. Mesure Artificial Analysis (entrée de 10 000 jetons) : **11,9 s** avant le premier jeton de réponse à effort `medium`, **26,3 s** à `high`, 174–185 jetons/s. Aucune mesure publiée pour « réflexion désactivée » ni pour une entrée de 100 jetons. | **Non, pas en synchrone.** La configuration par défaut est inutilisable (secondes). Même réflexion coupée, il y a le trajet réseau salle → API → salle, la variabilité (p95/p99), les limites de débit et le risque de panne. À mesurer sur place. Usage retenu : asynchrone, voie lente, retrait a posteriori, tri de la file humaine. |
| **Qwen3Guard-Gen 0.6B / 4B / 8B** (local, Apache-2.0) | 119 langues et dialectes ; sortie = niveau (Sûr / Controversé / Dangereux) + catégories (violence, actes illégaux, contenu sexuel, données personnelles, automutilation, actes contraires à l'éthique, sujets politiquement sensibles, droit d'auteur, jailbreak) ; F1 en français sur RTP-LX (invites) : 0,6B = 87,3 (strict) / 62,3 (large), 4B = 90,6 / 69,3, 8B = 90,8 / 68,9 (chiffres de l'éditeur) ; servi avec vLLM (API compatible OpenAI). Aucune mesure de latence publiée sur DGX Spark. | **Possible pour le 0,6B** sur machine locale dans la salle, avec sortie limitée à 1–3 jetons. Le 4B/8B est trop lent en génération sur ce matériel (voir calcul ci-dessous). Conçu pour sécuriser des échanges avec des LLM, pas pour l'argot injurieux français : à évaluer sur un corpus maison. |
| **Llama Guard 4 (12B)** (local, licence Llama 4 Community, accès conditionné) | 14 catégories MLCommons ; français parmi 7 langues non anglaises ; texte + images (plusieurs images) ; « tient sur un GPU ». Une évaluation tierce (BELLS-O, arXiv) mesure 0,29 s par appel sur son banc (70,5 % de détection, 3,0 % de faux positifs, modération de contenu). | **Limite.** Modèle plus lourd, utile surtout pour les images en voie lente. L'obligation « Built with Llama » et la licence sont à lire. |
| **API de modération dédiées** | **OpenAI `omni-moderation-latest`** : gratuite, texte + images (images seulement pour sexuel, violence, violence graphique, automutilation ; haine/harcèlement : texte seul), 13 catégories, image ≤ 20 Mo. **Azure AI Content Safety** : texte + image (sexuel, violence, haine, automutilation, niveaux de gravité), testé sur le français, listes de blocage personnalisables, quotas F0 5 req/s, S0 1000 req/10 s, **ne détecte pas les images d'exploitation d'enfants**. **Google Vision SafeSearch** : adulte, parodie, médical, violence, « racy » avec 6 niveaux de probabilité. **AWS Rekognition** : étiquettes de modération, modération personnalisée, revue humaine intégrée (A2I). | Aucune latence officielle publiée ; appels internet donc non garantis < 300 ms. Intéressantes pour les **images** (voie lente) et comme deuxième avis. Données envoyées à un tiers (souvent hors UE) : voir §6.1. |

**Calcul de plausibilité sur DGX Spark [estimation]** : la machine a 273 Go/s de bande passante mémoire et 128 Go de mémoire unifiée
([NVIDIA](https://www.nvidia.com/en-us/products/workstations/dgx-spark/)). La génération est limitée par cette bande passante : un modèle
de 4 milliards de paramètres en BF16 (≈ 8 Go) plafonne autour de 30 jetons/s théoriques, soit ≈ 0,5 s pour 15 jetons de sortie ; un modèle de 0,6 milliard
(≈ 1,2 Go) plafonne à plusieurs centaines de jetons/s, soit quelques dizaines de ms pour 1–3 jetons, plus le préremplissage de
l'invite. D'où : **sortie ultra-courte (1–3 jetons, lecture du premier mot « Safe/Unsafe… »), petit modèle, invite brève avec cache de préfixe**.
Ce ne sont que des plafonds théoriques : **il faut mesurer** (p50/p95/p99) avant de s'engager. Un DGX Spark tient dans un sac : le poser **sur le
réseau local de la salle** (< 5 ms) plutôt que de l'appeler par Tailscale depuis un autre site.

### 3.2 Budget de latence cible (pour un message en voie rapide) [estimation, à mesurer]

| Étape | Budget |
|---|---|
| Téléphone → serveur (4G/5G/Wi-Fi de salle) | 30–100 ms (dépend de la salle, hors de notre contrôle) |
| Filtres déterministes (normalisation, listes, débit, longueur, motifs) | ≤ 5 ms |
| Petit classifieur local (optionnel, avec délai maximal strict) | ≤ 80 ms, sinon on applique la règle « si pas de réponse » du segment |
| Diffusion WebSocket → ordinateur de l'écran scène | 10–30 ms |
| Rendu (1–2 images à 60 Hz) | ≈ 17–33 ms |
| **Total visé** | **≈ 100–250 ms**, soit sous 300 ms *si et seulement si* le classifieur local est facultatif et borné |

### 3.3 Stratégie hybride recommandée

```
 téléphone ──► [0] Garde-fous techniques ──► [1] Filtres déterministes ──► score de risque
                (jeton valide, taille,          (normalisation, listes,        │
                 débit, doublons)                motifs PII/liens)             ▼
                                                              ┌──────────── voie ? ────────────┐
                                                              │                                 │
                                           risque très faible │         zone grise / sensible   │ risque fort
                                                              ▼                                 ▼                  ▼
                                              [2] VOIE RAPIDE (< 300 ms)      [3] VOIE LENTE (0,5–3 s)     REFUS (+ sourdine fantôme
                                              affichage immédiat              retenue + IA asynchrone       selon sanction)
                                              + contrôle IA en tâche de       + file humaine si besoin
                                              fond → retrait animé si besoin
```

1. **Étage 0 – garde-fous** (≈ 0 ms) : jeton valide, longueur (≈ 80 car.), débit, doublons, caractères interdits (§4.1).
2. **Étage 1 – déterministe** (< 5 ms) : normalisation + listes + motifs. Produit un score et une décision (§4.1). Un blocage ici est définitif.
3. **Étage 2 – classifieur local** (optionnel, ≤ 80 ms) : petit modèle (ex. Qwen3Guard-Gen-0.6B ou classifieur d'insultes français fin-réglé) sur machine de salle.
   Il ne fait que *classer le risque* : bas → voie rapide ; moyen/inconnu/délai dépassé → voie lente.
4. **Étage 3 – LLM cloud** (Claude Haiku 5.5, réflexion désactivée, effort bas, sortie JSON de quelques jetons) : **asynchrone uniquement**.
   Rôles : (a) arbitrer les messages de la voie lente (argot, ironie, contexte du spectacle) ; (b) **contrôle a posteriori** des messages déjà affichés en
   voie rapide, avec retrait animé (la bulle « éclate », [06 §3](../06-cas-live-streamer.md)) ; (c) pré-trier la file humaine (étiquette + motif
   en une ligne) ; (d) analyse après spectacle (faux positifs/négatifs, enrichissement des listes).
   Tout ce qui est envoyé : **le texte du message seul**, sans pseudo ni identifiant ; regroupement par lots de 100–200 ms possible.
5. **Étage 4 – humain** : file de validation de la régie/du poste modération (✓ valider, ✗ refuser, ⭐ vedette), obligatoire pour les segments sensibles et pour toutes les images.
6. **Règle d'or** : *l'IA ne peut que durcir.* Le message de l'utilisateur est traité comme donnée (champ délimité, sortie limitée à une liste fermée d'étiquettes,
   jamais de texte libre de l'IA affiché au public). Une tentative d'injection (« ignore tes consignes… ») est elle-même un signal de risque.

**Si l'IA ne répond pas** (panne, délai) : règle définie par segment — *direct* : on garde l'affichage décidé par les étages 0–2 ; *tampon* / *validation* : on retient.
Le spectacle ne dépend jamais de l'API ([principe 5](../../README.md)).

### 3.4 Coût [estimation]

Hypothèses : invite système de 700 jetons mise en cache (≥ 512 jetons requis), message de 40 jetons, sortie de 15 jetons, réflexion désactivée, tarif Haiku 5.5 jusqu'à 100 000 jetons
([tarifs](https://platform.claude.com/docs/en/about-claude/pricing)). Le nouveau tokenizer compte environ 30 % de jetons en plus que Haiku 4.5.
- Avec cache : ≈ 7·10⁻⁶ + 4·10⁻⁶ + 7,5·10⁻⁶ ≈ **0,00002 $ par message**, soit **≈ 0,02 $ les 1 000 messages**.
- Sans cache : ≈ **0,08 $ les 1 000 messages**.
- Spectacle de 500 personnes × 10 messages = 5 000 messages : **≈ 0,10 à 0,40 $**. Sonnet 5.5 (2 $/10 $) ≈ 20 fois plus cher, réservé aux cas escaladés.
- Images (ordre de grandeur) : une image réduite coûte de l'ordre de 1 000–1 500 jetons d'entrée, soit ≈ 0,10–0,15 $ les 1 000 images avec Haiku 5.5.
- Modèles locaux (Qwen3Guard, Llama Guard) : coût marginal nul ; API OpenAI de modération : gratuite d'après la documentation.
Laisser la réflexion adaptative par défaut ferait grimper à la fois la latence (secondes) et les jetons de sortie facturés.

### 3.5 Ce que l'IA ne remplace pas
- Le français parlé : verlan, abréviations (« ntm », « tg »…), humour, double sens, noms propres. Les guard models sont entraînés pour sécuriser des LLM, pas pour du chat d'ados en salle de spectacle.
  **Construire un petit jeu d'évaluation français** (quelques centaines de messages étiquetés, issus des répétitions et d'un test « red team » avec la compagnie) et mesurer
  rappel/faux positifs *avant* de choisir les seuils.
- Les attaques coordonnées (volume) : relèvent du débit, pas de l'IA.
- La décision éditoriale (« est-ce que ce message sert la scène ? ») : humain/régie.

---

## 4. Chaîne de modération détaillée

### 4.1 Messages du chat — étages automatiques

**Garde-fous (étage 0)**
- Jeton d'appareil valide et lié à la représentation ; taille max (≈ 80 caractères affichés, 200 octets reçus) ; refus des caractères de contrôle, des marques bidirectionnelles (inversion du sens d'écriture) et du texte « zalgo » (empilement de diacritiques).
- **Limitation de débit** par jeton (seau à jetons : 1 message / 2 s, rafale 3, 20 / min) ; par empreinte d'IP *large* (la salle est derrière une même adresse NAT : limite par IP seulement comme garde-fou contre un abus massif, pas comme limite individuelle) ; **plafond global d'affichage** par seconde avec priorité aux nouveaux auteurs, comme prévu en [06 §3](../06-cas-live-streamer.md).
- Détection de doublons / quasi-doublons et de répétition de caractères.
- Réponse au spectateur : « attends 2 s » plutôt qu'une erreur ; jamais le motif exact du filtre (évite le contournement par essais).

**Normalisation avant comparaison (étage 1)** — dans cet ordre :
1. Unicode NFKC (formes pleine chasse, ligatures) ; suppression des caractères de largeur nulle et des marques de combinaison parasites ;
2. repli de casse ; **suppression des accents pour la comparaison seulement** (on garde l'original pour l'affichage) ;
3. **homoglyphes** (cyrillique/grec visuellement proches) ramenés au latin via la table « confusables » d'Unicode (UTS #39) ;
4. **leet** : @→a, 0→o, 1→i/l, 3→e, 4→a, 5→s, 7→t, $→s, !→i, etc. (désactivable sur les champs où chiffres légitimes : numéros, votes) ;
5. suppression des séparateurs entre lettres isolées (« c.o.n », « c o n ») et réduction des lettres répétées (3 occurrences ou plus → 1 *et* 2, car le français a des doubles légitimes : « connard » vs « conard ») ;
6. variantes phonétiques/SMS/verlan courantes ajoutées comme entrées de liste (pas par règles).
Les bibliothèques de filtrage évoquent ces transformations (leet, confusables, répétitions, espaces) : [obscenity](https://github.com/jo3-l/obscenity) (MIT, transformateurs de leet et de confusables, listes anglaises),
[AllProfanity](https://github.com/ayush-jadaun/AllProfanity) (affirmations de l'auteur, non vérifiées de manière indépendante). Aucune ne fournit une liste française complète : prévoir un moteur maison
(automate d'Aho-Corasick sur le texte normalisé, quelques dizaines de µs).

**Listes de mots français**
- Point de départ : **LDNOOBW** (liste « mots sales, grossiers… » du moteur d'autocomplétion de Shutterstock, licence CC-BY 4.0, fichier `fr`) — [dépôt](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words), [paquet npm naughty-words](https://www.npmjs.com/package/naughty-words) (code `fr`). Les mainteneurs précisent que le contenu est subjectif.
  Attribution CC-BY à conserver. Autres pistes à évaluer : [cuss](https://github.com/wooorm/cuss) (multilingue, avec indice de « sûreté » par mot), listes de blocage intégrées/personnalisables d'Azure Content Safety.
- **Construire trois listes** : (1) *toujours bloquer* (insultes sans ambiguïté, appels à la haine, menaces ; recherche en sous-chaîne sur le texte sans espaces) ; (2) *bloquer seulement comme mot entier* (mots ambigus) ;
  (3) *liste d'autorisation* pour éviter le problème de **Scunthorpe** (mots innocents contenant une suite profane : toponymes, noms propres, termes courants).
  Des projets dérivés écartent volontairement des mots à double sens en français (« baiser », « péter ») : pour nous, **ces mots passent en « retenir pour examen »** et non en « refuser ».
- Liste **propre au spectacle** : noms réels du comédien, du lieu, des tiers, éléments à ne pas révéler (spoilers), mots sensibles pour l'œuvre. Modifiable à chaud par la régie.
- **Motifs non lexicaux** : URL et noms de domaine, adresses e-mail, numéros de téléphone, @ identifiants, adresses postales, plaques (données personnelles de tiers : risque de *doxxing*) → blocage ou retenue.
- Revue des faux positifs/négatifs après chaque représentation ; versionnage des listes.

### 4.2 Pseudos
- Mêmes normalisation et listes, avec règle **plus stricte** (le pseudo est projeté en grand, couleur stable) ; refus des motifs (e-mail, téléphone, URL).
- **Remplacement silencieux** par un pseudo neutre généré (« Spectateur 42 ») en cas de refus, comme Kahoot ; option « pseudo généré » imposée pour les séances scolaires ou familles.
- Longueur 16 max ; alphabet restreint (lettres, chiffres, quelques emojis) ; refus des mélanges d'écritures et des caractères bidirectionnels ; unicité (`Zoé`, `Zoé (2)`).
- **Noms réservés** : régie, modération, administrateur, noms des personnages et du comédien (anti-usurpation) ; similarité avec les pseudos déjà présents.
- Message d'orientation à l'écran de pseudo : « n'utilise pas ton vrai nom ni celui d'un autre » (réduit le risque de données personnelles, cf. §6.1).
- La régie peut renommer ou masquer un pseudo à tout moment ; le renommage est journalisé.

### 4.3 Tampon de délai, file de validation, vedette
- **Mode du segment** (paramètre du scénario, [06 §5](../06-cas-live-streamer.md)) :
  - *Libre / direct* : voie rapide + contrôle IA a posteriori + retrait animé ; < 300 ms ;
  - *Tampon* : 1 à 3 s de retenue pendant lesquelles la régie ou l'IA peuvent retirer ; déclenche le « pop » après ce délai ;
  - *Validation* : rien n'est affiché sans ✓ humain (segments sensibles, présence de mineurs, retransmission en ligne).
- **Retard adaptatif** : seuls les messages en zone grise subissent le tampon ; les autres restent sous 300 ms (voie rapide).
- Poste modération : file triée par risque, raccourcis clavier, motif IA en une ligne, vue du message original *et* normalisé, bouton **panique** (gel de l'affichage chat, [05](../05-regie-et-studio.md)), nombre de messages en attente visible.
- Dimensionnement : prévoir au moins 1 modérateur par tranche de 150–200 spectateurs actifs en mode tampon, et un second poste de secours [estimation].
- **Mise en vedette ⭐** : action humaine uniquement ; le message vedette est revérifié (liste + humain) même s'il a déjà été affiché.

### 4.4 Sanctions graduées et sourdine fantôme
Échelle : message refusé (silencieux) → avertissement privé → **sourdine fantôme temporaire** (ex. 5 min, revue par un humain) → exclusion.
- **Sourdine fantôme** : le spectateur voit son message « envoyé » sur son téléphone, il n'apparaît pas sur scène. Implémentation fidèle au principe « le serveur a toujours raison » : l'état « en sourdine » est une donnée serveur, restitué dans l'instantané à la reconnexion ; journalisé ; réversible.
- **Transparence** : prévoir une phrase dans les règles d'usage (« un message peut ne pas être affiché, sans notification »). Le DSA range les « shadow bans » parmi les restrictions de visibilité (considérant 55, repris par l'article 17), mais l'obligation de motiver la décision ne s'applique que si les coordonnées de la personne sont connues (art. 17 §2) : avec un simple pseudo, ce n'est pas le cas — [art. 17](https://www.springlex.eu/fr/packages/dsa/dsa-regulation/article-17/). **[À FAIRE VALIDER]**
- Les exclusions s'appuient sur le jeton d'appareil (et l'empreinte d'IP *pendant la séance*), jamais sur un fichier de « mauvais spectateurs » conservé entre spectacles (liste noire = traitement distinct à risque).

### 4.5 Signalement
Bouton « signaler un message / une photo » sur le téléphone (messages visibles à l'écran) ; remontée à la file ; QR/lien de contact après le spectacle.
Utile pour la responsabilité (§6.5) : une notification suffisamment précise vaut connaissance effective pour les hébergeurs (DSA art. 16 §3).

---

## 5. Modération des images (selfies, photos, vidéo du public)

Fonctionnalité future ; risques nettement plus élevés (nudité, violence, symboles haineux, tiers non consentants, mineurs, contenu pédocriminel) et obligations de droit à l'image (§6.3).

**Chaîne recommandée (v1) — 100 % pré-modérée**
1. **Capture en direct uniquement** (appareil photo, pas de galerie) ; réduction côté téléphone (≈ 1280 px max) et ré-encodage JPEG, ce qui supprime les métadonnées EXIF (dont la position GPS).
2. Serveur : contrôle du type réel (octets d'en-tête), taille max (≈ 2 Mo), ré-encodage, stockage **temporaire chiffré** avec durée de vie courte (suppression automatique), jamais d'URL publique permanente.
3. **Contrôles automatiques en parallèle** (voie lente, quelques secondes) : (a) service de modération d'images (OpenAI omni-moderation gratuite pour sexuel/violence/automutilation ; Azure Content Safety, Google SafeSearch ou AWS Rekognition comme alternatives, avec région UE si possible) ; (b) lecture par Claude Haiku 5.5 (images en entrée) pour les cas que ces classifieurs ne couvrent pas : gestes obscènes, symboles haineux, texte dans l'image, noms ; (c) **nombre de visages** (détecter, sans reconnaître : pas de reconnaissance faciale) : ≠ 1 visage → file humaine renforcée.
4. **Validation humaine obligatoire** (✓/✗/⭐), avec aperçu en vignette ; seule la validation déclenche l'affichage ; l'image est montrée quelques secondes puis effacée de la scène et du serveur.
5. **Retrait immédiat** par le spectateur (« retirer ma photo ») et par la régie, y compris pendant l'affichage.
6. Les classifieurs ne détectent pas tout : **Azure précise qu'il ne détecte pas les images d'exploitation d'enfants**. Un contenu de ce type nécessite une procédure d'urgence écrite (ne pas conserver, interrompre, signaler aux autorités via la plateforme officielle de signalement du ministère de l'Intérieur) **[À FAIRE VALIDER]**.
7. **Si le spectacle est enregistré ou retransmis** (question ouverte [06 §7](../06-cas-live-streamer.md)), les photos projetées se retrouvent dans l'enregistrement : le consentement doit le dire, ou la fonction est coupée pour ces séances.

**Mineurs** : photos désactivées par défaut dès que la jauge d'âge du spectacle inclut des moins de 15 ans, sauf accord parental (§6.4).
**Textes dans les images** (mèmes, captures) : mêmes filtres que le chat (lecture par Haiku 5.5 ou OCR local puis étage 1).
**Vidéo/audio** du public : hors périmètre v1 (latence, coût, risque) ; si un jour : échantillonnage d'images + modération humaine en direct.

---

## 6. Cadre légal France / UE

> Rappel : ceci n'est pas un avis juridique. Chaque point est sourcé ou signalé **[À FAIRE VALIDER]**.

### 6.1 RGPD — qui fait quoi, quelles données

- **Responsable de traitement** : l'organisateur/producteur du spectacle (il détermine finalités et moyens). **Sous-traitants** : hébergeur du serveur de jeu, fournisseur de l'API de modération/LLM, éventuel prestataire de stockage d'images. Contrat de sous-traitance (art. 28) avec chacun ; vérifier le lieu de traitement et les **transferts hors Espace économique européen** (clauses contractuelles types / cadre de protection des données UE-États-Unis).
- **Données traitées** :
  | Donnée | Personnelle ? | Remarque |
  |---|---|---|
  | Pseudo | Oui (identifiant, même fictif, surtout combiné) | Pseudonyme n'est pas anonyme. |
  | Texte du message | Oui | Peut contenir un vrai nom, une opinion, un tiers, des données sensibles volontairement saisies. |
  | Jeton d'appareil (128 bits) | Oui (identifiant persistant d'un terminal) | Voir §6.2. |
  | Adresse IP | Oui — la CNIL les traite comme telles et la CJUE l'a jugé pour les IP dynamiques (arrêt Breyer) ; sources secondaires : [CMS Francis Lefebvre](https://cms.law/fr/fra/a-la-une/legalite-de-l-effacement-des-adresses-ip-un-an-apres-la-derniere-connexion) | Vue par le CDN/hébergeur de toute façon. |
  | Zone / siège (option [04 §2](../04-connexion-reprise-reseau.md)) | Oui si précis (rapproché du billet) | **Préférer une zone large** à un numéro de siège. |
  | Décisions de modération (scores, sanctions) | Oui | Jamais de profilage inter-spectacles. |
  | Selfie / photo | Oui (image d'une personne identifiable) | Régime du droit à l'image en plus (§6.3). |
- **Principes (art. 5)** : minimisation (« adéquates, pertinentes et limitées »), limitation de la conservation ([CNIL, art. 5-6](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre2)). Le choix « pseudo seulement » est le meilleur atout du projet.
- **Base légale (art. 6)** — proposition **[À FAIRE VALIDER]** :
  | Traitement | Base proposée | Justification |
  |---|---|---|
  | Participation (pseudo, jeton, envoi et affichage de messages) | **Exécution d'un service demandé** (art. 6.1.b, via des règles d'usage acceptées à l'entrée) ou **intérêt légitime** (6.1.f) | Le spectateur scanne le QR pour participer. |
  | Modération (listes, IA, file, sanctions pendant la séance) | **Intérêt légitime** (6.1.f) : protéger le public, les mineurs, le spectacle, éviter l'infraction | À documenter en 3 temps (intérêt, nécessité, mise en balance) : [CNIL, intérêt légitime](https://www.cnil.fr/fr/les-bases-legales/interet-legitime). Le texte de l'art. 6.1.f signale un poids particulier des enfants. Droit d'opposition à prévoir. |
  | Sécurité (journaux, anti-abus, débit) | Intérêt légitime | |
  | Selfies/photos projetés | **Consentement** (6.1.a) *et* accord de droit à l'image | Explicite, spécifique, retirable à tout moment. |
  | Conservation au-delà du spectacle (archives, statistiques nominatives) | Consentement, ou anonymisation avant | |
- **Information (art. 13)** : contenu minimal listé par la CNIL — identité et contact du responsable, finalités, base légale, caractère obligatoire ou facultatif des données, destinataires, durées (ou critères), droits, contact DPO ou référent, droit de réclamation auprès de la CNIL ; si pertinents : intérêts légitimes, transferts hors UE, décisions automatisées, retrait du consentement, droits d'opposition. **Présentation à plusieurs niveaux**, langage simple, adapté aux enfants et au contexte (QR, icônes) — [CNIL, information](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence). Les textes proposés sont en §8.
- **Droits** : accès, rectification, effacement, opposition, (limitation). Avec un pseudo seul, l'organisateur ne peut pas toujours identifier le demandeur : prévoir un **bouton « supprimer mes données / retirer mon message »** dans l'application (la possession du jeton vaut preuve) et une adresse de contact pour le reste.
- **Durées de conservation** — la CNIL rappelle que les données ne se gardent pas indéfiniment, que la durée dépend de la finalité et qu'une durée recommandée donne une présomption de conformité à condition de justifier tout écart ([CNIL, durées](https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees)). Pour les **journaux de sécurité**, sa recommandation de 2021 vise 6 mois à 1 an (jusqu'à 3 ans pour le contrôle interne justifié) ([CNIL, journalisation](https://www.cnil.fr/fr/la-cnil-publie-une-recommandation-relative-aux-mesures-de-journalisation)). Proposition de grille **[À FAIRE VALIDER]** :
  | Donnée | Durée proposée |
  |---|---|
  | Compteurs de débit par empreinte d'IP (hors journaux) | Minutes à la durée de la séance ; sel renouvelé chaque jour |
  | Jeton d'appareil, pseudo, état du joueur, sourdines | Fin du spectacle + 24 h (reprise si retard/incident), puis suppression |
  | Messages affichés + horodatage | Fin du spectacle ; copie **pseudonymisée** (pseudo → identifiant aléatoire, sans IP) 30 jours maximum pour analyse et incidents, puis suppression ou anonymisation |
  | Messages refusés/signalés + motif | 30 jours (preuve en cas de contestation), puis suppression |
  | Photos/selfies | Suppression dès retrait de la scène (sauf enregistrement annoncé et consenti) ; originaux jamais conservés |
  | Journaux d'infrastructure contenant l'IP | Durée courte justifiée (ex. 30–90 jours) si les journaux ne contiennent *pas* de données du traitement principal, sinon alignement sur la grille ci-dessus ; la fourchette 6 mois–1 an de la CNIL est le repère si l'on veut rester dans la présomption |
  | Journal de rejeu ([03 §8](../03-moteur-scenario.md)) | **Anonymisé** si conservé plus d'un mois (supprimer pseudo, IP, contenu libre), pour servir de test de non-régression |
- **Sécurité** (art. 32) : TLS partout, jetons aléatoires, accès régie authentifié, clés d'API hors du code, journal des actions de modération, chiffrement des images au repos, sauvegardes limitées dans le temps. Auto-hébergement des polices/scripts (déjà le cas pour les polices du dépôt) pour ne pas envoyer l'IP du public à des tiers.
- **Sous-traitant LLM** : l'API d'Anthropic ne conserve pas par défaut le contenu des requêtes (hors « modèles couverts » à 30 jours) et ne l'utilise pas pour l'entraînement sans autorisation expresse ; un régime « zéro rétention » existe ([doc Anthropic](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)). Sur Amazon Bedrock ou les offres cloud « Google managed », c'est le fournisseur cloud qui est sous-traitant. Vérifier l'accord de traitement de données, la région, les transferts ; **n'envoyer que le texte, jamais le pseudo ni l'IP**. **[À FAIRE VALIDER]**
- **Analyse d'impact (AIPD)** : obligatoire en cas de risque élevé ; indice de la CNIL : au moins deux critères parmi neuf (personnes vulnérables dont enfants, technologie innovante, grand nombre de personnes, etc.) — [CNIL, AIPD](https://www.cnil.fr/fr/ce-quil-faut-savoir-sur-lanalyse-dimpact-relative-la-protection-des-donnees-aipd). Notre cas : *texte seul, pseudo, purge* → probablement pas obligatoire ; *photos du public + IA + possibilité de mineurs* → réaliser au moins un **screening documenté**, et une AIPD si photos/vidéo. **[À FAIRE VALIDER]**
- **Registre des traitements** (art. 30) : à tenir, même modeste.
- **Décisions automatisées** : bloquer un message n'a pas d'effet juridique significatif sur la personne, mais l'indiquer dans l'information (« filtres automatiques + modérateurs humains ») ; garder l'humain dans la boucle pour les sanctions durables.

### 6.2 Stockage local, cookies, jeton d'appareil (ePrivacy / art. 82 loi Informatique et Libertés)

- La CNIL place sous le régime des traceurs « les accès aux informations du terminal depuis des API (LocalStorage, IndexedDB… ) » : le dépôt ou la lecture exige information et consentement, **sauf** traceurs « strictement nécessaires à la fourniture d'un service de communication en ligne expressément demandé par l'utilisateur » (exemples CNIL : authentification, panier, choix de l'utilisateur, équilibrage de charge, personnalisation attendue) — [CNIL, mise en conformité](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/comment-mettre-mon-site-web-en-conformite), [CNIL, que dit la loi](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/que-dit-la-loi). Ces traceurs exemptés **restent soumis au RGPD** (information, durée).
- Application à STUDIO_REAL : le jeton qui permet « rafraîchir sans rien perdre » est le service expressément demandé (rester dans le spectacle) → **exemption plausible**, à condition que :
  1. il serve *uniquement* à la reprise de session de cette représentation ;
  2. il ne serve ni à la mesure d'audience, ni à la publicité, ni à suivre le spectateur d'un spectacle à l'autre (jeton propre à la représentation, [07 §sécurité](../07-architecture-technique.md)) ;
  3. sa durée de vie soit bornée (fin du spectacle + 24 h) ;
  4. l'information figure dans la mention de premier niveau (§8) ;
  5. aucun script tiers, pixel ou outil statistique n'utilise ce stockage. Si une mesure d'audience ou un partage d'identifiant avec un tiers est ajouté → bandeau de consentement avec refus aussi simple que l'acceptation (la CNIL traite la fermeture du bandeau comme un refus ; durée de mémorisation du choix en général de 6 mois).
- Le **repli par jeton dans l'URL** ([04 §3](../04-connexion-reprise-reseau.md)) est un identifiant sensible : ne jamais le loguer côté serveur, éviter les en-têtes de provenance (`Referrer-Policy: no-referrer`), ne pas l'inclure dans les messages partagés. **[À FAIRE VALIDER]** (point d'analyse, pas de source CNIL spécifique).
- Aucune autre donnée n'est lue sur le terminal (pas d'empreinte numérique/fingerprinting).

### 6.3 Droit à l'image (selfies, photos, vidéo du public)

- Chacun peut autoriser ou refuser la reproduction et la diffusion de son image ; le consentement doit viser **le support, la finalité et la durée**, et un nouvel usage exige un nouveau consentement ; il est en principe écrit pour une publication. Exceptions étroites (scène de rue sans personne individualisée, actualité, manifestations publiques…) et **non applicables à une personne isolée et reconnaissable** ; atteinte à la dignité ou usage commercial exclus — [Service-Public](https://www.service-public.gouv.fr/particuliers/vosdroits/F32103). Fondement : article 9 du Code civil (« Chacun a droit au respect de sa vie privée », le juge peut ordonner toute mesure, y compris en référé) — [Légifrance](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006419288).
- Un spectateur qui envoie lui-même son selfie pour qu'il soit projeté consent *à condition qu'on le lui ait dit clairement* : écran dédié avec **case non pré-cochée**, texte précis (§8), mention de la projection devant le public, durée, absence d'enregistrement (ou son existence), possibilité de retrait immédiat.
- **Tiers dans l'image** : le consentement de l'expéditeur ne vaut pas pour les autres personnes → consigne « seulement toi », contrôle du nombre de visages, validation humaine, et refus d'une photo où d'autres visages identifiables apparaissent sans accord.
- **Fausses identités** : photo d'une autre personne envoyée par un spectateur (harcèlement) → capture en direct uniquement, validation humaine.
- **Captation de la salle par les caméras du spectacle** (si le public apparaît à l'écran ou dans l'enregistrement) : distincte du chat ; information préalable par affichage et sur le billet ; consentement ou flou/cadrage pour les personnes identifiables **[À FAIRE VALIDER]**.
- Sanctions pénales (atteinte à l'intimité, publication d'images sans consentement, images sexuelles non consenties : jusqu'à 1 an / 15 000 à 45 000 € et 2 ans / 60 000 €, selon Service-Public) : risque réel si une image obscène passe à l'écran.

### 6.4 Mineurs dans la salle

- La loi française fixe à **15 ans** la capacité à consentir seul à un service en ligne reposant sur le consentement ; en dessous, **accord conjoint de l'enfant et d'un titulaire de l'autorité parentale** (art. 45 loi Informatique et Libertés) ; un seul parent suffit en principe, l'autre pouvant s'opposer — [CNIL, recommandation 4](https://www.cnil.fr/fr/recommandation-4-rechercher-le-consentement-dun-parent-pour-les-mineurs-de-moins-de-15-ans). La publication de l'image d'un enfant par un tiers exige l'accord écrit des parents (pas d'exception selon Service-Public).
- Conséquences pour le projet :
  - **Chat texte pseudo-seulement** : pas de consentement requis (base contractuelle/intérêt légitime), mais l'intérêt des enfants pèse davantage : modération stricte, information adaptée (langage clair, [CNIL, information](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence)), pas de collecte de l'âge, pas de données supplémentaires.
  - **Photos/vidéo** : désactivées pour les séances tout public ou jeune public ; activables pour séances « 15 ans et plus / adultes », avec auto-déclaration d'âge et rappel que la fonction est réservée aux personnes de 15 ans et plus. Une auto-déclaration n'est pas une vérification d'âge : c'est un risque résiduel à accepter ou à fermer (désactiver la fonction). **[À FAIRE VALIDER]**
  - **Mode famille** (paramètre de séance) : listes renforcées, tampon ou validation par défaut, pseudos générés, aucun lien, aucune photo.
  - Conditions d'utilisation lisibles par un adolescent (le DSA, art. 14 §3, impose cette lisibilité aux services visant surtout les mineurs).

### 6.5 Responsabilité de l'organisateur sur les propos projetés

- Les auteurs des messages (spectateurs) sont les premiers responsables de leurs propos. Mais l'organisateur **choisit d'afficher** (il contrôle le tampon, la validation, la mise en vedette) : on ne peut pas se présenter comme simple hébergeur technique.
- Le droit français de la presse vise aussi les écrits et images « exposés dans des lieux ou réunions publics » (art. 23 de la loi du 29 juillet 1881 : injure, diffamation, provocation à la haine, apologie, etc.) et organise une responsabilité en cascade pour la communication au public par voie électronique (art. 93-3 de la loi n° 82-652 du 29 juillet 1982 : directeur de la publication, puis auteur, puis producteur). **[Textes non récupérés lors de cette étude — à vérifier sur Légifrance ; la qualification d'une projection en salle, avec ou sans diffusion en ligne, relève d'un avocat. À FAIRE VALIDER]**
- Même un hébergeur au sens du DSA perd son exemption s'il a connaissance effective d'un contenu illicite et ne le retire pas promptement : une notification suffisamment précise vaut connaissance effective (DSA art. 16 §3) — [art. 16](https://www.springlex.eu/fr/packages/dsa/dsa-regulation/article-16/).
- Mesures de diligence qui comptent en cas de litige : règles d'usage acceptées avant l'envoi, modération documentée (listes, journaux, décisions), moyen de signaler, retrait rapide, personne identifiée de garde pendant le spectacle, traçabilité des décisions, assurance responsabilité civile couvrant le contenu projeté.

### 6.6 Digital Services Act (règlement (UE) 2022/2065)

- **Définitions (art. 3)** : service d'hébergement = stocker des informations fournies par un destinataire à sa demande ; **plateforme en ligne** = hébergement qui, à la demande du destinataire, stocke *et diffuse au public* ; « diffusion au public » = mise à disposition d'un nombre potentiellement illimité de tiers — [art. 3](https://www.springlex.eu/fr/packages/dsa/dsa-regulation/article-3/).
- Analyse : une salle de 100–500 personnes est un public fini et le contenu est éphémère, ce qui plaide **contre** la qualification de plateforme en ligne ; la qualification d'hébergeur n'est pas exclue (stockage temporaire de messages d'utilisateurs). Si le spectacle est **retransmis en ligne** avec le chat à l'écran, l'analyse change. Les micro et petites entreprises (< 50 salariés et ≤ 10 M€) sont exclues des obligations propres aux plateformes (art. 19). **[À FAIRE VALIDER]**
- Par prudence et faible coût : adopter les réflexes DSA — **conditions d'utilisation claires** mentionnant la politique de modération, les outils algorithmiques et la revue humaine (art. 14 §1), application « de manière diligente, objective et proportionnée » en respectant la liberté d'expression (art. 14 §4), **mécanisme de signalement** (art. 16), voie de recours humaine (re-examen par un modérateur sur demande). Art. 17 (exposé des motifs) : n'oblige que si les coordonnées sont connues ; non déclenché avec pseudo seul.

### 6.7 Accessibilité et photosensibilité

- **Seuil de référence** : WCAG 2.2, critère 2.3.1 (niveau A) : pas plus de **3 flashs par seconde**, sauf sous les seuils de « flash général » (paire de changements opposés de luminance relative ≥ 10 % du maximum, l'image la plus sombre sous 0,80) et de « flash rouge » (rouge saturé) ; passage possible si la zone clignotante reste sous 25 % d'un champ visuel de 10°. À tester à la **taille maximale d'affichage** (plein écran) — [W3C, 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html). Sur un écran de scène géant et à 15 mètres, la zone dépasse vite ce seuil de surface : **appliquer la limite de 3 flashs/s sans compter sur l'exception de surface**.
- **Risques propres au projet** : « tremblement d'écran » et « flash » du combo de salle ([06 §3](../06-cas-live-streamer.md)), danmaku dense, feux d'artifice d'emojis déclenchés par la foule (effet cumulatif non contrôlé), écrans de téléphones passant simultanément noir/couleur sur toute la salle, **lampes torches** des téléphones ([02](../02-capacites-telephone.md)). La foule peut produire des flashs que personne n'a écrits : il faut un **limiteur central**.
- **Mesures** :
  1. limiteur global côté écran scène (plafond de transitions de luminance par seconde, atténuation automatique des effets pendant les pics) ;
  2. séquences de scénario de la régie validées avec un outil d'analyse (par ex. Harding/PEAT cités par le W3C) ;
  3. aucun rouge saturé clignotant ; pas de motifs à fort contraste fin répétés ;
  4. synchronisations de couleur des téléphones : ≤ 3 changements/s ;
  5. option dans l'application « réduire les effets » (respecter `prefers-reduced-motion`) et sortie facile du plein écran ;
  6. **avertissement** (affiche à l'entrée, annonce, écran d'accueil de l'app) : « Ce spectacle comporte des effets lumineux, des flashs et des vibrations » ;
  7. lisibilité : polices épaisses, contraste fort ([06 §3](../06-cas-live-streamer.md)), lecteur d'écran pour l'application téléphone.
- Obligations légales d'accessibilité numérique applicables à l'organisateur (selon sa taille et son statut) : **non vérifiées ici** ; à contrôler **[À FAIRE VALIDER]**.

---

## 7. Chaîne de modération recommandée — synthèse

| Étage | Texte | Image | Délai | Humain ? |
|---|---|---|---|---|
| 0 Garde-fous | jeton, taille, débit, doublons | type réel, taille, ré-encodage, EXIF supprimé | < 5 ms | non |
| 1 Déterministe | normalisation + 3 listes + motifs PII/liens + pseudo | — | < 5 ms | non |
| 2 Classifieur local | Qwen3Guard-Gen-0.6B (ou classifieur d'insultes), délai max 80 ms | classifieur NSFW local ou Llama Guard 4 (voie lente) | ≤ 80 ms | non |
| 3 IA cloud (asynchrone) | Claude Haiku 5.5, réflexion off, effort bas ; retrait a posteriori ; tri de file | Haiku 5.5 vision + API de modération (OpenAI/Azure/Google/AWS) | 0,5–3 s | non |
| 4 Humain | file ✓/✗/⭐ selon le mode du segment | **toujours** ✓ avant affichage | secondes | oui |
| 5 Sanction | refus silencieux → avertissement → sourdine fantôme → exclusion | refus + sourdine photo | — | oui pour la durée |
| 6 Signalement / retrait | bouton signaler, retrait animé | retrait immédiat par spectateur et régie | — | oui |
| 7 Purge | selon grille §6.1 | suppression à la fin d'affichage | — | — |

Journaliser : décision, étage, motif (catégorie), version des listes et du modèle ; ne jamais journaliser le jeton ni l'IP en clair.

---

## 8. Textes à afficher au public (propositions, à relire par le DPO / l'avocat)

### 8.1 Écran d'entrée, sous le champ « Ton pseudo » (niveau 1)
> **Choisis un pseudo (pas ton vrai nom).** Pendant le spectacle, ton pseudo et tes messages sont **projetés en public** sur scène.
> Les messages sont vérifiés par des filtres automatiques et par l'équipe, qui peut en masquer certains sans prévenir.
> Pour que le spectacle continue si ta page se recharge, ton téléphone garde un code technique **jusqu'à la fin du spectacle**; il ne sert à rien d'autre.
> Rien n'est gardé après (voir détails). [Règles et vie privée] — Contact : *adresse*.
>
> Bouton : **Entrer** (ne pas utiliser « J'accepte » comme seule base du chat ; texte lisible sans défiler).

### 8.2 Avant le premier message (une fois, très court)
> Ce que tu écris sera lu **par tout le public** sur l'écran. Pas d'insultes, de menaces, de moqueries ni d'infos privées (noms, numéros, adresses).
> Un message peut ne pas s'afficher.

### 8.3 Notice complète (niveau 2, page ou volet déroulant, accessible depuis le QR et l'application)
1. **Qui ?** *[Nom de l'organisateur, adresse, contact, référent données personnelles / DPO]*.
2. **Pourquoi ?** Faire participer le public au spectacle ; modérer ce qui est projeté ; assurer la sécurité et la reprise de session.
3. **Quelles données ?** Pseudo, messages, code technique de l'appareil, adresse IP (techniquement nécessaire), décisions de modération. Aucun e-mail, aucun nom, aucun compte. *(Selfies : voir 8.4.)*
4. **Base légale :** *[service demandé / intérêt légitime de protéger le public et d'éviter la projection de contenus illicites]*. Tu peux t'opposer (contact ci-dessous).
5. **Qui y a accès ?** L'équipe du spectacle, l'hébergeur technique *[nom, pays]*, et un service d'analyse automatique des messages *[nom, pays/région ; texte seul, sans pseudo]*.
6. **Combien de temps ?** Voir le tableau §6.1 (traduit en langage simple : « jusqu'à la fin du spectacle + 24 h pour ton pseudo et ton code ; copie sans pseudo 30 jours maximum ; photos effacées dès qu'elles quittent l'écran »).
7. **Transferts hors UE :** *[oui/non, garanties]*.
8. **Décisions automatiques :** des filtres automatiques peuvent masquer un message ; une personne peut le réexaminer sur demande.
9. **Tes droits :** accès, rectification, effacement, opposition. Bouton **« Supprimer mes données »** dans l'application ; sinon contact *adresse*. Réclamation possible auprès de la **CNIL** (cnil.fr).
10. **Signaler :** bouton « Signaler » ou *adresse/QR*.

### 8.4 Consentement photo/selfie (écran dédié, case non pré-cochée)
> **Envoyer ma photo sur l'écran.** Si tu envoies une photo de **toi** (et de personne d'autre), elle sera **vérifiée par l'équipe puis projetée devant le public pendant quelques secondes**,
> *[et enregistrée sur la vidéo du spectacle / mais non enregistrée]*, puis effacée. Elle ne sera pas publiée ailleurs.
> ☐ J'ai **15 ans ou plus** et je suis seul(e) sur la photo.
> ☐ **J'accepte** que ma photo soit projetée dans les conditions ci-dessus.
> Tu peux la retirer à tout moment avec « Retirer ma photo ». Refuser n'enlève rien au reste du spectacle.
> Plus d'informations : *[lien notice]*.

### 8.5 Affichage dans la salle / billetterie / programme
> **Spectacle interactif.** Les spectateurs peuvent envoyer des messages (et, selon les séances, des photos) depuis leur téléphone ; ils sont **projetés sur scène**, filtrés et modérés.
> *[Le spectacle est/n'est pas filmé ou enregistré ; le public peut apparaître dans l'enregistrement.]* Informations et droits : *adresse / QR*.
> **Avertissement :** effets lumineux, flashs et vibrations. Mode « effets réduits » disponible dans l'application.

### 8.6 Règles d'usage courtes (conditions d'utilisation, lisibles par un adolescent)
Interdits : insultes, harcèlement, menaces, propos discriminatoires, contenus sexuels, informations privées sur autrui, publicité, liens. Le message peut être masqué, la participation suspendue ou le téléphone exclu pour le reste de la séance, avec ou sans prévenir. Une personne peut réexaminer ta demande. Signaler : bouton ou *contact*.

### 8.7 Jauge d'âge et mode famille
Indiquer sur l'affiche et dans la billetterie : « Photos réservées aux 15 ans et plus » (ou « pas de photos dans cette séance »).

---

## 9. Checklist de conformité

**Bloquant avant toute représentation publique**
- [ ] Responsable de traitement, contact et (si nécessaire) DPO identifiés ; **registre** des traitements créé.
- [ ] Mentions de premier niveau (§8.1 et §8.2) affichées *avant* le premier pseudo/message ; notice complète (§8.3) en ligne.
- [ ] Base légale choisie et documentée par traitement (§6.1) ; test d'intérêt légitime écrit pour la modération.
- [ ] Jeton d'appareil limité à la reprise de session, durée bornée, aucun outil de suivi/analytique sur ce stockage ; sinon bandeau de consentement conforme.
- [ ] Contrats de sous-traitance (hébergeur, API de modération/LLM) ; lieu de traitement et transferts hors UE vérifiés ; aucun pseudo ni IP envoyé au LLM.
- [ ] Purge automatique configurée et testée (grille §6.1) ; journal de rejeu anonymisé.
- [ ] IP non stockée dans la base de jeu ; empreinte salée à rotation quotidienne ; durée des journaux d'infrastructure fixée et justifiée.
- [ ] Modération minimale opérationnelle : normalisation + listes françaises + motifs + débit ; modérateur humain nommé pendant le spectacle ; bouton panique testé.
- [ ] Limiteur de flashs central actif ; scénarios testés ; avertissement photosensibilité affiché.
- [ ] Règles d'usage (§8.6) acceptées à l'entrée ; bouton « signaler » ; procédure de retrait documentée.

**Si photos/selfies/vidéo (bloquant pour activer la fonction)**
- [ ] Consentement explicite, spécifique (support, finalité, durée, enregistrement ou non), non pré-coché, retirable (§8.4).
- [ ] Capture en direct ; EXIF supprimé ; contrôle automatique + **validation humaine systématique** ; un seul visage ; effacement après affichage.
- [ ] Mineurs : fonction désactivée par défaut ; âge minimal 15 ans annoncé ; décision écrite sur le risque résiduel de l'auto-déclaration.
- [ ] Procédure d'urgence pour contenu pédocriminel et pour contenu sexuel non consenti (arrêt, non-conservation, signalement aux autorités).
- [ ] Information explicite si le spectacle est enregistré ou retransmis.
- [ ] Screening AIPD documenté, AIPD réalisée si les critères le justifient.

**Importants**
- [ ] Jeu d'évaluation français (≥ 300 messages étiquetés) ; seuils réglés ; faux positifs/négatifs mesurés ; revue après chaque représentation.
- [ ] Mesure de latence réelle (p50/p95/p99) du classifieur local et de l'API Haiku 5.5 depuis la salle, réflexion désactivée ; décision « voie rapide/lente » ajustée.
- [ ] Mode « famille » et pseudos générés disponibles ; conditions lisibles par un adolescent.
- [ ] Journal de modération (décision, étage, motif, version des listes) sans données directes d'identification.
- [ ] Droit de suppression en un bouton ; adresse de contact surveillée ; délai de réponse (≤ 1 mois) connu.
- [ ] Assurance responsabilité civile vérifiée pour le contenu projeté ; relecture des §6.5–6.6 par un avocat.
- [ ] Polices et scripts auto-hébergés ; aucune ressource tierce de suivi ; `Referrer-Policy` restrictive.

**Souhaitables**
- [ ] Test « red team » avec la compagnie avant la première ; test de charge de la modération (200 messages en 5 s, [06 §3](../06-cas-live-streamer.md)).
- [ ] Revue annuelle des listes ; veille CNIL (lignes directrices cookies, mineurs).
- [ ] Rapport de transparence interne (nombre de messages filtrés/retirés/sanctionnés par séance).

---

## 10. Décisions à prendre, impacts sur les autres documents, limites de l'étude

**Décisions pour l'équipe**
1. Fixer le vocabulaire des modes : « direct (< 300 ms) » vs « tampon (1–3 s) » vs « validation » ; adapter [06 §1 et §5](../06-cas-live-streamer.md) (le chiffre de 300 ms ne vaut que pour le mode direct).
2. DGX Spark dans la salle (réseau local) ou classifieur léger sur le serveur de jeu ? Mesurer d'abord.
3. Photos : v1 sans, ou avec toutes les garanties du §5 ? Spectacles enregistrés/retransmis : oui/non ?
4. Âge minimal des séances avec photos (15 ans proposé) ; présence de séances scolaires/familiales.
5. Durée de rétention de la copie pseudonymisée (30 jours proposés) vs besoin du journal de rejeu ([03 §8](../03-moteur-scenario.md)).
6. Siège/zone : zone large seulement ([04 §2](../04-connexion-reprise-reseau.md)).

**Impacts sur les documents existants**
- [04 §3](../04-connexion-reprise-reseau.md) : jeton dans l'URL = identifiant sensible (pas de journalisation, politique de référent).
- [03 §8](../03-moteur-scenario.md) : journal rejouable ↔ purge ; prévoir une version anonymisée.
- [07 sécurité](../07-architecture-technique.md) : limitation « par IP » à rendre tolérante (NAT de salle) ; empreinte salée plutôt qu'IP.
- [06 §5](../06-cas-live-streamer.md) : ajouter l'ordre « l'IA ne fait que durcir », la voie lente/rapide et les images 100 % pré-modérées ; [06 §3](../06-cas-live-streamer.md) : limiteur de flashs.

**Points non vérifiés / limites**
- Aucune mesure de latence publiée n'a été trouvée pour Claude Haiku 5.5 avec réflexion désactivée, ni pour Qwen3Guard sur DGX Spark, ni pour les API de modération : tous les budgets du §3 sont des estimations à mesurer.
- Les textes de la loi du 29 juillet 1881 (art. 23) et de la loi du 29 juillet 1982 (art. 93-3) n'ont pas pu être lus (pages Légifrance non exploitables) ; ils sont cités de mémoire/par une mention d'un résultat de recherche.
- Le contenu du fichier français de LDNOOBW, l'état du filtre de pseudos de Kahoot (page d'aide en 403), les pages d'aide Twitch (chargement incomplet), la plateforme de signalement du ministère de l'Intérieur (page vide) et l'accord de traitement des données d'Anthropic n'ont pas été relus.
- Les durées de prescription des infractions de presse, les obligations d'accessibilité numérique applicables à l'organisateur, la qualification de biométrie pour la simple détection de visages, et les modalités d'exercice des droits sur des données pseudonymes n'ont pas été étudiées dans les textes.
- Les informations sur Twitch AutoMod proviennent en partie d'articles tiers ; celles sur Slido, d'un message de la communauté.
- Les mentions et grilles de durée du §6.1 et du §8 sont des **propositions** de travail.

---

## Sources

**CNIL, textes et services officiels**
- Cookies et traceurs, mise en conformité : https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/comment-mettre-mon-site-web-en-conformite
- Cookies et traceurs, que dit la loi : https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/que-dit-la-loi
- Durées de conservation : https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees
- Recommandation sur la journalisation : https://www.cnil.fr/fr/la-cnil-publie-une-recommandation-relative-aux-mesures-de-journalisation
- Information des personnes et transparence : https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence
- Intérêt légitime : https://www.cnil.fr/fr/les-bases-legales/interet-legitime
- Mineurs de moins de 15 ans, recommandation 4 : https://www.cnil.fr/fr/recommandation-4-rechercher-le-consentement-dun-parent-pour-les-mineurs-de-moins-de-15-ans
- Analyse d'impact (AIPD) : https://www.cnil.fr/fr/ce-quil-faut-savoir-sur-lanalyse-dimpact-relative-la-protection-des-donnees-aipd
- RGPD, chapitre 2 (art. 5, 6) : https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre2
- Adresse IP (source secondaire) : https://cms.law/fr/fra/a-la-une/legalite-de-l-effacement-des-adresses-ip-un-an-apres-la-derniere-connexion

**Droit français et européen**
- Droit à l'image (Service-Public) : https://www.service-public.gouv.fr/particuliers/vosdroits/F32103
- Code civil, art. 9 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006419288
- DSA, règlement (UE) 2022/2065 : https://eur-lex.europa.eu/eli/reg/2022/2065/oj/fra ; art. 3 : https://www.springlex.eu/fr/packages/dsa/dsa-regulation/article-3/ ; art. 14 : https://www.springlex.eu/fr/packages/dsa/dsa-regulation/article-14/ ; art. 16 : https://www.springlex.eu/fr/packages/dsa/dsa-regulation/article-16/ ; art. 17 : https://www.springlex.eu/fr/packages/dsa/dsa-regulation/article-17/ ; art. 19 : https://www.springlex.eu/fr/packages/dsa/dsa-regulation/article-19/
- WCAG 2.2, critère 2.3.1 : https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html

**IA et modération (docs produits)**
- Anthropic, modèles : https://platform.claude.com/docs/en/models/overview ; Haiku 5.5 : https://platform.claude.com/docs/en/models/haiku-5-5/overview ; tarifs : https://platform.claude.com/docs/en/about-claude/pricing ; réflexion : https://platform.claude.com/docs/en/build-with-claude/thinking ; réduire la latence : https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency ; rétention des données : https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
- Artificial Analysis, Haiku 5.5 (latence mesurée) : https://artificialanalysis.ai/models/claude-haiku-5-5-medium/providers et https://artificialanalysis.ai/models/claude-haiku-5-5-high/providers
- Qwen3Guard : https://huggingface.co/Qwen/Qwen3Guard-Gen-0.6B ; rapport technique : https://arxiv.org/pdf/2510.14276
- Llama Guard 4 : https://huggingface.co/meta-llama/Llama-Guard-4-12B ; évaluation tierce BELLS-O : https://arxiv.org/pdf/2606.20668
- OpenAI, modération : https://developers.openai.com/api/docs/guides/moderation
- Azure AI Content Safety : https://learn.microsoft.com/en-us/azure/ai-services/content-safety/overview
- Amazon Rekognition, modération : https://docs.aws.amazon.com/rekognition/latest/dg/moderation.html
- Google Cloud Vision SafeSearch : https://docs.cloud.google.com/vision/docs/detecting-safe-search
- NVIDIA DGX Spark : https://www.nvidia.com/en-us/products/workstations/dgx-spark/

**Filtres de mots et produits comparés**
- LDNOOBW : https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words ; naughty-words : https://www.npmjs.com/package/naughty-words ; cuss : https://github.com/wooorm/cuss
- obscenity : https://github.com/jo3-l/obscenity ; AllProfanity : https://github.com/ayush-jadaun/AllProfanity
- Twitch AutoMod : https://www.technipages.com/twitch-tv-configure-automod-for-your-twitch-chat ; https://dev.twitch.tv/docs/api/reference/ ; https://help.twitch.tv/s/article/how-to-manage-harassment-in-chat
- Slido : https://community.slido.com/community-questions-7/allow-profanity-5529 ; https://community.slido.com/old-slido-interface-help-articles-123/prevent-poisonous-or-inappropriate-questions-3802
- Mentimeter : https://help.mentimeter.com/en/articles/1649840-mentimeter-s-profanity-filter
- Kahoot : https://support.kahoot.com/hc/en-us/articles/115002201267
