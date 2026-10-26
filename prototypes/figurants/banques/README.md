# Banques des figurants (P0.5)

Le contenu que le serveur `prototypes/figurants/serveur/` charge au démarrage : qui sont les figurants, ce qu'ils disent sans IA,
ce qu'ils ne doivent jamais dire, et les prompts de l'IA. Références : [PROTOCOLE.md](../PROTOCOLE.md),
[étude figurants](../../../docs/etudes/figurants-ia.md) §2, §3, §6, [modération](../../../docs/etudes/moderation-rgpd.md) §4.1.

| Fichier | Rôle | Niveau |
|---|---|---|
| `personas.json` | la distribution : 19 personas, dont 4 récurrents | tous |
| `reflexes.json` | réflexes instantanés par humeur, par déclencheur, et vagues | N0 |
| `repliques.json` | la fiction de test et 3 segments de répliques pré-écrites | N1 (+ contexte de N2/N3) |
| `interdits.txt` | liste de modération, pour TOUS les messages (public et figurants) | filtre |
| `interdits-figurants.txt` | règles en plus pour les figurants (sanctions, urgences, IA, vote) | filtre |
| `prompts.md` | prompts N2, souffleur, prendre la main ; Haiku 5.5 et qwen3:8b | N2, N3, N4 |

Tous les fichiers sont en UTF-8 sans BOM. Les JSON sont stricts (pas de commentaire, pas de virgule finale). Vérification rapide :
`node -e "for (const f of ['personas','reflexes','repliques']) JSON.parse(require('fs').readFileSync('prototypes/figurants/banques/'+f+'.json','utf8'))"`.

---

## 0. Conventions communes

### 0.1 Identifiants
- Persona : `p_<nom>` (`p_kev`). Réplique N1 : `<segment court>_<nnn>` (`bou_014`), unique dans le fichier.
- Segment : `id` en minuscules sans accent (`accueil`, `boulangerie`, `mec_bizarre`) ; c'est la valeur de `fig.cmd {segment: id}`.
- Humeurs : `hype`, `calme`, `moqueuse`, `inquiete`, `tendre`, `mefiante` (sans accent ; ce sont aussi les `etiquettes` de `fig.cmd humeur`).

### 0.2 Motifs sur la transcription (`reflexes.json` → `motifs`, `repliques.json` → `quand`)
La transcription du comédien est d'abord normalisée : NFKC, minuscules, **accents supprimés**, `’` → `'`, **traits d'union → espace**,
espaces réduites. Pas de leet. La ponctuation n'est pas garantie (la Web Speech API en met peu ou pas).
- **Motif simple** (`"vous en pensez quoi"`) : mot ou expression **entière**, bornée par le début, la fin ou un caractère qui n'est ni lettre ni chiffre.
  Équivalent : `new RegExp("(^|[^\\p{L}\\p{N}])" + echappe(motif) + "($|[^\\p{L}\\p{N}])", "u")`.
- **`re:`** + expression régulière JavaScript, drapeaux `iu`, testée sur le même texte normalisé (`"re:\\b(3|trois) heures\\b"`).
  Dans le JSON, les barres obliques inverses sont doublées.
- On teste les **partiels stables** et le texte **final** ; un même déclencheur ne repart pas avant 8 s (conseil, à régler).

### 0.3 Couleurs
`couleur` est le **nom d'un jeton CSS** de `design/tokens.css` (`--coral-2`), jamais une valeur. La page l'utilise en `color: var(--coral-2)`.
Jetons choisis, lisibles sur les fonds sombres (`--bg`, `--panel`) et redéfinis dans le thème clair : `--coral-3`, `--coral-2`, `--cy`, `--amb`,
`--grn2`, `--or`, `--ink`, `--ink2`, `--nd-ryt`, `--nd-har`, `--nd-tim`, `--nd-nrj`, `--nd-ten`. Plusieurs personas partagent une couleur (comme sur Twitch) ;
les 4 récurrents ont chacun la leur.

### 0.4 Limites de texte
Tout texte affiché : **80 caractères au plus** (écran scène, 06 §3). Répliques IA : **12 mots au plus** (prompts). Les banques respectent les deux.

---

## 1. `personas.json`

```json
{ "version": 1, "langue": "fr", "note": "…", "personas": [ { …persona… } ] }
```

| Champ | Type | Sens |
|---|---|---|
| `id` | chaîne | identifiant stable, utilisé partout (`pid` côté serveur peut être distinct) |
| `pseudo` | chaîne | pseudo affiché, ≤ 16 caractères conseillé ; inventé, aucune personne réelle ; vérifié contre les pseudos du public présent (étude §3.3) |
| `couleur` | chaîne | nom de jeton CSS (§0.3) |
| `recurrent` | booléen | `true` = personnage dramaturgique (fan, sceptique, troll, modo) ; `false` = silhouette caractérisée |
| `archetype` | chaîne | étiquette libre (`fan`, `troll_scenarise`, `lurker`…), utile au prompt et à la régie |
| `description` | chaîne | qui il est, en 1 à 3 phrases ; envoyée au LLM dans la fiche résumée |
| `style.registre` | chaîne | registre de langue, pour le LLM |
| `style.casse` | `"minuscules"` · `"normale"` · `"majuscules pour les rares mots"` | casse par défaut appliquée par le styliseur |
| `style.cris` | 0..1 | probabilité qu'un message passe tout en MAJUSCULES |
| `style.accents` | 0..1 | probabilité de **garder** les accents (0,05 = les enlève presque toujours) |
| `style.point_final` | 0..1 | probabilité de garder un point final |
| `style.ponctuation` | chaîne | description pour le LLM et l'auteur |
| `style.repetition_lettres` | 0..1 | probabilité d'étirer un mot expressif (« noooon ») |
| `style.emojis` | liste | emojis favoris |
| `style.emojis_par_msg` | 0..1 | probabilité d'ajouter un emoji (ou une emote) |
| `style.emotes` | liste | emotes texte façon Twitch (`KEKW`, `PogU`…) ; affichées telles quelles |
| `style.fautes` | 0..1 | probabilité d'appliquer une faute typique |
| `style.fautes_typiques` | liste de `[correct, fautif]` | remplacements que le styliseur peut faire (`["c'est","c"]`) |
| `style.abreviations` | objet `{forme pleine: abréviation}` | remplacements du styliseur (`{"pourquoi":"pk"}`) |
| `tics` | liste | expressions fétiches |
| `tic_proba` | 0..1 | au plus cette part des messages contient un tic |
| `longueur_mots` | `{moyenne, max}` | longueur visée, en mots |
| `rythme.activite` | 0..1 | **débit relatif** (1 = le plus bavard) ; poids de tirage et intervalle minimal ≈ `20 s / activite` |
| `rythme.reaction_s` | `[min, max]` | délai de lecture et de réaction, en secondes (étude §6.6) |
| `rythme.frappe_cps` | nombre | vitesse de frappe simulée, caractères/s |
| `rythme.rafale` | 0..1 | probabilité d'enchaîner un deuxième message court |
| `reagit` | `{N0, N1, N2, N3}` 0..1 | probabilité de réagir quand ce niveau se déclenche ; **`N2: 0` = jamais en IA automatique** (troll) |
| `humeur_base` | `{valence -1..1, energie 0..1}` | humeur propre, mêlée à celle de la foule |
| `sujets` | liste | ce dont il parle volontiers (prompt, choix de persona) |
| `faits` | liste | seuls faits qu'il peut citer en plus du contexte (le « lore ») |
| `presence` | liste | ids de segments où il est en scène ; `["*"]` = partout |
| `regles` | liste | contraintes propres, recopiées dans sa fiche résumée |
| `exemples` | 3 chaînes | messages écrits par l'auteur, dans sa voix (envoyés au LLM, et réutilisables en N1) |

Exemple (abrégé) :
```json
{
  "id": "p_lucie", "pseudo": "lucie_pasdupe", "couleur": "--cy", "recurrent": true, "archetype": "sceptique",
  "description": "Doute de tout, surtout des plans du streamer.",
  "style": { "registre": "familier, posé, ironique", "casse": "normale", "cris": 0.02, "accents": 0.9, "point_final": 0.1,
             "ponctuation": "…", "repetition_lettres": 0.05, "emojis": ["🙄"], "emojis_par_msg": 0.25, "emotes": ["Kappa"],
             "fautes": 0.05, "fautes_typiques": [], "abreviations": { "mort de rire": "mdr" } },
  "tics": ["mouais"], "tic_proba": 0.2, "longueur_mots": { "moyenne": 7, "max": 12 },
  "rythme": { "activite": 0.6, "reaction_s": [1.5, 3.5], "frappe_cps": 3.2, "rafale": 0.1 },
  "reagit": { "N0": 0.3, "N1": 0.7, "N2": 0.6, "N3": 0.7 },
  "humeur_base": { "valence": 0.1, "energie": 0.4 }, "sujets": ["les paris"], "faits": [], "presence": ["*"], "regles": [],
  "exemples": ["il va jamais oser, je vous le dis", "mouais... on a déjà vu ce plan", "ok là j'avoue, respect"]
}
```

### 1.1 Le styliseur (proposition d'ordre, déterministe avec une graine)
Appliqué aux textes **N2, N3 et N1 génériques** (`persona: null`) et aux variantes `stylisable: true` de N0. **Pas** aux répliques N1 attachées
à un persona (déjà écrites dans sa voix), ni aux vagues, ni à N4 tapé par la régie.
1. retirer les tics d'assistant (point-virgule, tiret cadratin, « Absolument », point final selon `point_final`) ;
2. `abreviations` (mot entier, 70 % des occurrences) ; 3. une faute de `fautes_typiques` avec la probabilité `fautes` ;
4. accents enlevés avec la probabilité `1 − accents` ; 5. casse (`minuscules`), puis tout en majuscules avec la probabilité `cris` ;
6. étirement d'une voyelle finale (`repetition_lettres`) ; 7. tic (`tic_proba`) s'il n'y est pas déjà ;
8. un emoji ou une emote (`emojis_par_msg`) s'il n'y en a pas ; 9. coupe à 80 caractères.
Les emotes (`KEKW`…) gardent toujours leur casse.

---

## 2. `reflexes.json` (N0)

```json
{ "version": 1, "langue": "fr", "note": "…",
  "humeurs": { "<humeur>": { …humeur… } },
  "declencheurs": [ { …déclencheur… } ],
  "vagues": [ { …vague… } ] }
```

**Humeur** — `centre {valence, energie}` (pour choisir l'humeur la plus proche quand la régie règle seulement les curseurs),
`stylisable` (booléen), `emotes` (liste), `variantes` (15 à 40 chaînes). Choix de l'humeur courante : la première `etiquette` de `fig.cmd humeur`
qui existe ici ; sinon l'humeur dont le `centre` est le plus proche (distance euclidienne) de `{valence, energie}`.

**Déclencheur** — réaction à un motif de la transcription :

| Champ | Type | Sens |
|---|---|---|
| `id` | chaîne | nom (`question_chat`, `rire`, `argent`…) |
| `motifs` | liste | motifs simples ou `re:` (§0.2) ; un seul suffit |
| `priorite` | `"haute"` · `"normale"` · `"basse"` | `haute` passe avant N1/N2 et ignore une partie du plafond de densité |
| `nb` | `[min, max]` | nombre de messages dans la rafale, avant le plafond de densité |
| `delai_s` | `[min, max]` | fenêtre d'affichage après le déclencheur (le planificateur y étale les messages) |
| `stylisable` | booléen | le styliseur du persona tiré s'applique-t-il ? |
| `segments_exclus` | liste | ids de segments où le déclencheur est muet (`"vote"` : tout segment de vote) |
| `variantes` | liste | 15 à 40 textes ; tirés **sans remise** par segment, remis en jeu quand la liste est épuisée |
| `par_humeur` | objet facultatif `{humeur: [textes]}` | ajoutés aux `variantes` quand cette humeur est active |
| `note` | chaîne facultative | pour l'auteur |

Exemple :
```json
{ "id": "rire", "motifs": ["haha", "mdr", "re:\\b(ha){2,}\\b"], "priorite": "normale", "nb": [3, 10], "delai_s": [0.6, 3.0],
  "stylisable": true, "segments_exclus": [], "variantes": ["mdrrr", "😂😂", "je meurs"] }
```

**Vague** — un effet de foule déclenché par la régie (`fig.cmd {vague: "<cle>"}`) ou par un nœud :

| Champ | Type | Sens |
|---|---|---|
| `id` | chaîne | nom |
| `cle` | chaîne | ce que la régie envoie (`"😂"`, `"F"`, `"GG"`, `"+1"`, `"IL A OSÉ"`, `"3-2-1"`) ; le serveur cherche par `cle` puis par `id` |
| `taille` | `[min, max]` | nombre de messages |
| `etalement_s` | `[min, max]` | fenêtre d'étalement |
| `stylisable` | booléen | toujours `false` ici |
| `copie_exacte` | booléen | `true` = même texte en chœur (copypasta) : **exception voulue à l'anti-répétition** |
| `ordonnee` | booléen | `true` = les `variantes` sont des étapes jouées dans l'ordre, ≈ 1 s d'écart, plusieurs figurants par étape |
| `variantes` | liste | textes |

---

## 3. `repliques.json` (N1)

```json
{ "version": 1, "langue": "fr", "note": "…",
  "fiction": { "titre": "…", "streamer": "…", "running_gags": ["…"] },
  "segments": [ { …segment… } ] }
```

`fiction` alimente `{{fiction}}` des prompts : ce que tout le chat « sait » depuis toujours.

**Segment**

| Champ | Type | Sens |
|---|---|---|
| `id`, `titre`, `ordre` | | identité ; `ordre` = position dans le canevas |
| `consigne` | chaîne | situation et ton du chat, écrits par l'auteur ; va dans le prompt (`{{segment_consigne}}`) |
| `faits` | liste | **faits vrais de la fiction** que l'IA peut citer ; rien d'autre (§3 des règles des prompts) |
| `interdits` | liste | ce qu'il ne faut pas révéler (spoilers) ; va dans `<ne_pas_reveler>` ; peut aussi alimenter la liste propre au spectacle |
| `humeur` | `{valence, energie, etiquettes}` | humeur appliquée à l'entrée du segment |
| `densite` | `silence` · `calme` · `normal` · `chaud` · `folie` | préréglage appliqué à l'entrée du segment |
| `intentions` | liste de `{id, intention, nb}` | intentions préparées pour le souffleur : boutons de la régie (`fig.cmd {dire: {intention, nb}}`) |
| `repliques` | liste | les répliques N1 (ci-dessous) |

**Réplique**

| Champ | Type | Sens |
|---|---|---|
| `id` | chaîne | unique |
| `quand` | chaîne | voir tableau suivant |
| `ordre` | entier, facultatif | ordre de passage dans une séquence (`debut`, `top:…`) |
| `persona` | id ou `null` | `null` = générique : l'orchestrateur la donne à un persona présent (de préférence une silhouette) et la stylise |
| `texte` | chaîne | ≤ 80 caractères |
| `stylisable` | booléen, facultatif | force le choix ; par défaut `false` si `persona` est fixé, `true` si `null` |

| `quand` | Déclenchement |
|---|---|
| `debut` | à l'entrée du segment, dans l'ordre de `ordre`, espacées par le planificateur (≈ 2 à 5 s) |
| `libre` | réserve tirée **sans remise** quand l'orchestrateur veut une ligne N1 (part N1 de la densité) |
| `mot:<motif>` | motif simple sur la transcription (§0.2) |
| `re:<regex>` | regex sur la transcription (§0.2) |
| `top:<id>` | top de régie ou de nœud (bouton) ; séquence dans l'ordre de `ordre` ; ignoré si le serveur n'a pas encore de tops |
| `relance` | bouton **RELANCE** ou silence du chat réel prolongé |
| `fin` | sortie narrative à la fin du segment (le persona dit au revoir) |

Chaque réplique ne sert **qu'une fois par représentation** (sauf `libre` épuisé : remise en jeu, en évitant les 20 dernières).
Une réplique dont le persona n'est pas présent (`presence`) ou est coupé est sautée, ou donnée à un autre persona si elle est générique.

Exemple :
```json
{ "id": "bou_017", "quand": "re:\\breserve(e|es|s)?\\b", "persona": "p_lou", "texte": "réservée pour qui ? 🔍" }
```

---

## 4. `interdits.txt` et `interdits-figurants.txt`

Une entrée par ligne ; `#` = commentaire ; entrée simple = mot ou expression **entière** en forme de base normalisée
(minuscules, sans accents, sans apostrophe ni trait d'union) ; `re:` + regex JavaScript (`iu`). La normalisation est faite **par le serveur**,
en deux formes, décrites en tête de `interdits.txt` :
- **forme A** pour les entrées simples (accents, homoglyphes, leet, ponctuation → espace, lettres isolées recollées, répétitions réduites) ;
- **forme B** pour les `re:` (minuscules et accents seulement, ponctuation et chiffres gardés : liens, e-mails, téléphones).

`interdits.txt` vaut pour **tous** les messages ; `interdits-figurants.txt` s'ajoute pour les figurants (sanctions, urgences réelles,
auto-description d'IA et refus du modèle, vote, place dans la salle). Les mots à double sens (« baiser », « malaise »…) n'y sont pas :
ils iront dans une future liste « retenir pour examen ».

## 5. `prompts.md`

Voir l'en-tête du fichier : identifiants des prompts (`### n2.haiku.system`…), variables `{{…}}`, sortie en lignes JSON
`{"persona":"p_kev","texte":"…"}`, paramètres d'appel Haiku 5.5 et Ollama. Écart volontaire avec l'étude §6.8 : la sortie n'a que
`persona` et `texte` (les champs `angle` et `appui` sont gardés côté orchestrateur, qui les connaît déjà).

---

## 6. Écrire ses propres personas et répliques (pour l'auteur du spectacle)

**Une distribution, pas une foule.** 4 à 6 récurrents qui ont une fonction (chauffer, douter, contredire, annoncer, poser les questions du public),
puis 10 à 15 silhouettes qui se distinguent **en une ligne** : un registre, une obsession, une façon d'écrire. Si deux personas pourraient
échanger leurs messages sans qu'on le remarque, fusionnez-les.

**Le style, c'est la forme, pas le fond.** Décrivez la voix avec les champs `style` (casse, accents, fautes, abréviations, emojis) : le styliseur
s'en charge. Dans `exemples`, écrivez trois messages **vraiment différents** (une réaction, une question, une marotte) : le LLM les imite
beaucoup ; trois exemples identiques donnent un perroquet.

**Des faits, pas des envies.** `faits` (persona) et `faits` (segment) sont la seule mémoire autorisée. Tout ce qui n'y est pas, l'IA ne doit pas l'affirmer.
Pour un running gag, écrivez-le en entier une fois (« la fois du pigeon : un pigeon a volé le croissant du chef »), puis laissez l'ancien le citer.
Mettez dans `interdits` du segment ce qu'il ne faut pas révéler.

**Courts.** Un message de chat fait 2 à 8 mots ; au-delà de 12, ça sent le texte écrit. Pas de point final, pas de point-virgule,
pas de « N'hésite pas ». Un emoji suffit.

**Écrire N1 plutôt qu'espérer N2 pour les moments clés.** Ce qui doit être dit à un moment précis (« derrière toi », le portefeuille)
s'écrit en `top:` ou `debut` avec un `ordre`. Prévoyez 2 à 4 formulations par moment, par des personas différents : le premier dit le
détail, le deuxième l'amplifie, le troisième doute.

**Écrire pour être ignoré.** Le comédien doit pouvoir ne pas répondre sans casser la scène : préférez les remarques et les questions ouvertes
aux injonctions.

**Le troll et le modo sont les plus dangereux.** Le troll ne vise **que le personnage du streamer**, jamais le public ni un groupe de personnes ;
ses répliques sont N1, relues (`reagit.N2: 0`). Le modo n'a **aucune autorité** sur un vrai spectateur : pas de « banni », « exclu », « averti ».

**Jamais.** Personne réelle (pseudo, style d'un streamer existant, élu, artiste), marque réelle, vrai club de foot, vraie ville, école ou métier ;
physique d'une personne filmée ; fausse alerte (malaise, incendie, police) ; vote ou appel au vote ; pseudo d'un vrai spectateur.

**Les génériques.** Une réplique `persona: null` doit pouvoir être dite par n'importe qui : neutre, sans tic, écrite « propre » (le styliseur
ajoutera la voix). Visez autant de génériques que de répliques attribuées pour les segments longs.

**Relire à voix haute, puis en masse.** Lisez chaque segment d'un trait, dans l'ordre de `debut`, comme le verrait la salle. Puis passez les
fichiers au filtre (`interdits.txt`) : une réplique bloquée par erreur est un faux positif à signaler, pas une raison de retirer le mot de la liste.
