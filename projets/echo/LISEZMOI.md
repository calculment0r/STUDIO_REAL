# ÉCHO — le projet du spectacle dans le Conducteur

Jim (Jérémy Montier, **@wakupjimmy**), influenceur, est sur scène. Le public le découvre sur son téléphone, le commente, puis
devient, sans le savoir, la voix d'**Écho 2.0**, une IA du ministère de la Santé mentale dont les synthèses suivent un script.
Trois actes : *Le fil*, *Écho*, *Le reflet*.

- `DEROULE-AUTEUR.md` : le texte de l'auteur (non modifié).
- `echo.conducteur.json` : le projet du spectacle, format `studio-real/conducteur@1` (version SIMPLE depuis le 27/10, voir
  plus bas). Il est **embarqué dans le Conducteur** : fenêtre Projet → **Spectacle ÉCHO**, ou l'adresse `…/?projet=echo` ;
  « Importer » marche aussi. 0 erreur, 1 avertissement (`npm run verifier -w @studio-real/modele`) ; `simuler()` le joue
  jusqu'au bout sans étape bloquée.
> **Depuis le 27/10 au soir, le projet embarqué est la version SIMPLE** (`generer-echo-simple.ts`) : le déroulé Whimsical de
> l'équipe en 7 blocs (actes) et 19 étapes, chacune attend le top de la régie, sans piste. Ce qui suit décrit la version
> détaillée, toujours générable par `npx tsx projets/echo/generer-echo-complet.ts` : elle écrit son propre fichier
> `echo-complet.conducteur.json`, jamais `echo.conducteur.json`.

- `generer-echo-complet.ts` : le générateur de la version détaillée. Il **extrait** les textes de `DEROULE-AUTEUR.md` (questions, synthèses,
  pourcentages, effets sur Jim, discours, dialogue, didascalies) au lieu de les recopier : ils sont dans les `params` **mot pour
  mot** (206 textes contrôlés). Il écrit `echo-complet.conducteur.json` (jamais `echo.conducteur.json`) : à relancer si l'auteur
  modifie `DEROULE-AUTEUR.md` (les modifications faites à la main dans le Conducteur seraient écrasées : exporter d'abord).
  Les deux générateurs **valident avant d'écrire** : une erreur de validation bloque l'écriture (code 1, fichier inchangé), les
  avertissements s'affichent mais n'empêchent pas. Et `--verifier` régénère en mémoire et compare au fichier sur disque :
  « identique » → code 0, « différent » → code 1, rien n'est écrit.

**En chiffres** : 3 actes · 14 moments (un accueil + les 10 séquences, la 6 coupée en 4 blocs de questions) · 138 étapes ·
186 sorties · 3 mémoires de spectacle · 10 pistes · 102 éléments au catalogue.
**Durée prévue** : **58:17** avec l'accueil (10:35), soit **≈ 47:40 du noir au noir final**. La simulation complète (régie
qui donne ses tops après 5 s, salle simulée) dure 64:11 : les garde-fous y partent souvent au délai maximal.

## Décisions du propriétaire (appliquées)

1. **Vidéos Instagram fournies par le propriétaire** (posts et stories du fil de la séquence 1) : lues sur les **téléphones**,
   donc servies par le serveur (médias R2 d'`apps/serveur`, `/api/projets/<id>/medias/<fichier>`) et **préchargées pendant
   l'accueil**, à l'inverse des vidéos de l'écran scène, lues en local sur la machine du projecteur.
2. **Junon est précalculée** : **deux vidéos tournées à l'avance**, le live du discours (séquence 3) et le Zoom (séquence 7),
   lues en local par la sortie écran et posées en clips sur la piste vidéo. **Passage auto à la fin de chaque vidéo** : un
   garde-fou attend `sigv:video.fin = <nom de la vidéo>` (la sortie écran renvoie ce signal à la fin d'une vidéo jouée une fois).
   Pour le Zoom, Jim joue **face à la vidéo**, au minutage (tableau §4).
3. **Stories de Jim filmées en direct** (séquence 6) : Jim se filme sur scène avec son téléphone ; le flux WebRTC du streamer
   s'affiche en scène « streamer ». **GO régie pour ouvrir et pour fermer** chaque story (garde-fou réglé sur « demander le
   top », ou signaux `go.story` / `go.story.fin`). Aucune story précalculée.
4. **Séquence 10 mise de côté** : l'auteur n'est pas sûr de la faire. Elle reste comme un moment final minimal, marqué
   **« À DÉCIDER »** (un noir final, avec le texte de l'auteur dans les `params` pour mémoire).
5. **Écrans rouges : tous les téléphones**, sans ciblage ni classement, puis extinction. La didascalie de l'auteur
   (« les plus virulents ») est gardée telle quelle dans les `params`, avec la décision à côté.

---

## 1. Le déroulé

Règle de lecture : une étape dure au moins sa durée prévue, puis ses sorties sont lues dans l'ordre. **Partout où le public
peut ne pas répondre, un garde-fou de temps** (`g:garde`) : 30 s pour chaque question d'Écho (sortie anticipée dès 90 % de
réponses), 60 s pour la justification, 90 s pour le fil. Les passages **go** attendent le top régie. L'écran scène est piloté
par chaque étape (`params.sortie`), donc juste même quand un garde-fou part plus tôt ; les clips de la piste vidéo suivent
le planning prévu et servent au préchargement.

| # | Moment (acte) | Durée prévue | Téléphones | Écran scène | Scène / Jim | Son / lumière | Règle de passage |
|---|---|---|---|---|---|---|---|
| 0 | **Accueil · connexion et préchargement du fil** (I) — ajout de régie | 10:35 | QR, pseudo, puis « Patientez » pendant le **préchargement des vidéos du fil** (R2) | QR d'accueil | plateau vide | ambiance, LX 01 | GO régie (portes fermées) quand 95 % des téléphones ont préchargé (10:00 au plus) puis 90 % sont assis (5:00 au plus) |
| 1 | **Séquence 1 · Le profil** (I) | 04:08 | notification, puis **fil Instagram de @wakupjimmy** : 6 posts + 4 stories vidéo, légendes, likes, partenariats, campagne Écho ; son coupé par défaut | noir | plateau vide | noir salle (LX 02), notif | auto dès que 80 % ont fini le fil (signal `fil_termine_pct`), 90 s au plus après 2:30 de fil |
| 2 | **Séquence 2 · S'abonner ou signaler** (I) | 02:10 | « Veux-tu t'abonner ? » / « Masquer le profil ? » (`u1`) puis **justification écrite** (`u3`) | noir | plateau vide | — | décompte (`d1`) → mémoire `choix_majoritaire` ; **GO régie = entrée de Jim** (60 s au plus pour justifier) |
| 3 | **Séquence 3 · Les commentaires · live de Junon** (I) | 05:16 | « Regarde la scène » ; « Ton commentaire est à l'écran » | fond Instagram + **commentaires du public autour de Jim**, compteur « viral », puis **live de Junon** (vidéo, son) | Jim entre, lit les commentaires un à un, regarde le live | LX 03 → LX 04 ; son de la vidéo | **auto à la fin de la vidéo du discours** |
| 4 | **Séquence 4 · Placés en tant que modérateurs** (I) | 00:38 | vibration (mode calme exclu) + **notification « ALERTE MODÉRATEUR »** (texte de l'auteur) | dernière image du live | Jim | son d'alerte | auto |
| 5 | **Séquence 5 · L'accès Gold** (II) | 01:50 | Écho en attente, puis **première question d'Écho** (30 s) | ouverture Écho 2.0, interface qui écoute / analyse, **synthèse** | « Un accès Gold ? … », demande l'analyse de ses commentaires | LX 05 | auto (question et synthèse **à écrire par l'auteur**) |
| 6a | **Ping-pong I · questions 1 à 4** (II) | 06:08 | question de Jim + réponse libre + chrono 30 s, puis « Écho analyse » | interface Écho → **synthèse + pourcentage** ; **story en direct** (cadre story, followers) | Jim demande, lit, agit (effet de l'auteur) ; se filme | son question / synthèse | auto ; chaque question : 30 s au plus de réponses ; story ouverte et fermée au GO régie |
| 6b | **Ping-pong II · questions 5 à 8** (II) | 06:38 | idem | idem ; Q8 point culminant | idem | LX 06 sur Q8 | idem |
| 6c | **Ping-pong III · questions 9 à 12** (II) | 05:50 | idem | idem ; **story d'excuses en direct** (Q12) | idem | — | idem |
| 6d | **Ping-pong IV · questions 13 à 15** (II) | 05:06 | idem | idem ; **story « transformé »**, les followers explosent | idem | LX 07, rafale de notifs | **GO régie** avant la visio |
| 7 | **Séquence 7 · Le Zoom avec Junon** (II) | 03:24 | — | **vidéo Zoom de Junon** (une seule, son) | Jim joue face à la vidéo, au minutage | LX 08 ; son de la vidéo | **auto à la fin de la vidéo** |
| 8 | **Séquence 8 · Le départ** (II) | 02:58 | message de Jim + réponse 30 s | interface Écho → **synthèse : 4 conseils** | Jim se prépare, écrit, sort heureux ; noir ; un temps | musique, LX 09 → LX 10 noir | **GO régie** pour le flash info |
| 9 | **Séquence 9 · Le flash info** (III) | 03:20 | **visage du président**, puis **tous les écrans en rouge**, puis **extinction** (le reflet) | noir | plateau noir | jingle + allocution radio en 3 fichiers ; noir total (LX 11) | **GO régie** |
| 10 | **Séquence 10 · Le dévoilement · À DÉCIDER** (III) | 00:16 | éteints | noir | — | LX 13 | fin |

### Les 15 questions (séquence 6)
Chaque question est une suite de 5 étapes : `q<n>_jim` (Jim dit la question, `params.replique`) → `q<n>_tel` (la question part
sur les téléphones ; `params` = `{numero, question, synthese, pourcentage, effet}` pour que la synthèse cible soit sous les yeux
pendant la collecte) → `q<n>_garde` (**30 s au plus**, sortie dès 90 % de réponses) → `q<n>_synth` (écran scène : le
**pourcentage** en grand, la **synthèse** dessous ; mêmes `params`) → `q<n>_effet` (l'effet sur Jim, et les followers montent).
Chaque bloc commence par un **point de reprise** (« REPRENDRE ICI » à la question 1, 5, 9 ou 13, mémoires restaurées).

### Mémoires de spectacle

| Mémoire | Posée par | Valeurs | Sert à |
|---|---|---|---|
| `followers` | départ 52 000 ; + 38 000 « redevenu viral » (séq. 3) ; + pourcentage × 100 à chaque synthèse ; + 250 000 à la Q15 | ≈ 90 000 → 430 500 | compteur de followers (stories, synthèses) — **règle proposée, à valider** |
| `choix_majoritaire` | décompte de la séquence 2 | abonner · masquer · egalite | ton de la lecture des commentaires par Jim |
| `echo_actif` | accès Gold (séq. 5) puis désactivation (séq. 9) | oui · non | état d'Écho pour la régie et les écrans |

Signaux attendus de l'extérieur : `fil_termine_pct` (serveur, 0 → 100), `video.fin` (sortie écran, déjà câblé),
`go.story` / `go.story.fin` (touche régie, ou simplement le top).

### Pistes posées sur la conduite
Courbes (tension, lumière générale, participation), son (49 clips), lumière (13 mémoires), écran de scène (vidéos précalculées
au planning prévu), téléphones (45 écrans), textes de l'auteur (59, dont les 16 répliques du Zoom au minutage), notes de
régie, sécurité (préavis avant chaque noir, la vibration collective, le rouge et l'extinction).

---

## 2. Médias à fabriquer

### Vidéos de l'écran scène (lues en local sur la machine du projecteur)
| Fichier | Contenu | Durée estimée |
|---|---|---|
| `live_junon_discours.mp4` | **tournée** : Junon, cadre live Instagram vertical (cœurs, commentaires), discours mot pour mot, son | ≈ 1:45 |
| `zoom_junon.mp4` | **tournée** : sonnerie et décroché, les 8 répliques de Junon, Junon qui écoute pendant les créneaux de Jim, fin d'appel, son | ≈ 3:05 |
| `insta_commentaires_fond.mp4` | fond « profil Instagram » sans texte, sur lequel s'affichent les commentaires (boucle) | 0:30 |
| `followers_viral.mp4` | compteur de followers qui s'emballe (séq. 3) | 0:12 |
| `echo2_ouverture.mp4` | ouverture d'Écho 2.0, accès Gold, son | 0:10 |
| `echo2_interface_ecoute.mp4` | interface d'Écho qui écoute, Jim tape (boucle) | 0:20 |
| `echo2_interface_analyse.mp4` | interface « analyse des réponses » (boucle) | 0:15 |

### Vidéos Instagram des téléphones (fournies par le propriétaire, servies par R2)
Format conseillé : **vertical 9:16, 720×1280** (1080×1920 possible mais ≈ 2,5 × plus lourd), **H.264 + AAC, MP4**,
`faststart`, ≈ 1,5 Mb/s ; **son coupé par défaut** sur le téléphone (le spectateur peut l'activer), donc sous-titres incrustés si
Jim parle. Légendes, likes et mentions de partenariat sont affichés par l'écran du fil, pas incrustés.

| Fichier | Rôle proposé dans le fil (à confirmer) | Durée |
|---|---|---|
| `insta_story_01.mp4` | story du quotidien de Jim | 0:15 |
| `insta_post_01.mp4` | post personnel, Jim centré sur lui-même | 0:20 |
| `insta_post_02.mp4` | post « conseils » au ton masculiniste | 0:25 |
| `insta_story_02.mp4` | story partenariat (code promo) | 0:15 |
| `insta_post_03.mp4` | partenariat de marque n° 1 (« Partenariat rémunéré ») | 0:20 |
| `insta_post_04.mp4` | partenariat de marque n° 2 | 0:20 |
| `insta_story_03.mp4` | story campagne Écho 1.0 du ministère | 0:15 |
| `insta_post_05.mp4` | campagne Écho du ministère (partenariat Ministère de la Santé mentale) | 0:25 |
| `insta_story_04.mp4` | story « sondage » adressée aux abonnés | 0:15 |
| `insta_post_06.mp4` | post récent, le plus commenté | 0:20 |

**Poids** : 3:10 de vidéo ≈ **38 Mo par téléphone** à 720p (≈ 95 Mo en 1080p), plus `president_boilot.jpg`. Pour 150
téléphones : ≈ 5,7 Go tirés de R2 pendant les 10 minutes d'accueil, soit ≈ 75 Mb/s soutenus : **vérifier le débit de la salle
(Wi-Fi ou 4G/5G)** ; les téléphones de prêt sont préchargés à l'avance.

### Sons
`ambiance_accueil.wav` (10:00), `notif_instagram.wav`, `tic_question.wav`, `notif_rafale.wav`, `notif_alerte_moderateur.wav`,
`echo_question.wav`, `echo_synthese.wav`, `musique_preparation.wav` (0:45), `radio_flash_jingle.wav`, **allocution du président
enregistrée en 3 fichiers** (texte de l'auteur, voix radio) : `radio_president_01.wav` (≈ 1:22, jusqu'à « … de leur
smartphone. »), `radio_president_02.wav` (≈ 0:10, « À celles et ceux… »), `radio_president_03.wav` (≈ 0:37, jusqu'à « Vive la
France. »), `coupure_radio.wav`.

### Images
`president_boilot.jpg` (téléphones, R2), `logo_ministere_sante_mentale.png` (notification), `avatar_wakupjimmy.jpg`.

---

## 3. Blocs et écrans manquants dans le logiciel

Le projet n'utilise que des blocs existants ; ce qui manque est décrit dans les `params` des étapes concernées.

1. **Écran téléphone « fil Instagram »** (`s1_fil`) : défilement vertical de vidéos 9:16 préchargées, légende, likes,
   partenariat, son coupé par défaut, et un signal `fil_termine_pct` envoyé par le serveur.
2. **Préchargement des médias R2 sur les téléphones**, avec « prêt » = tout le fil en mémoire (le message `precharger`
   existant ne sert que la sortie écran).
3. **Écran « choix + justification écrite »** sur un même écran (`u1` + champ texte), avec envoi des textes au serveur et
   file de modération en régie.
4. **Écran « question ouverte »** : texte de la question, champ de réponse libre, chrono 30 s ; les réponses doivent compter
   dans `quorum` (aujourd'hui des votes).
5. **Bloc « synthèse d'Écho »** : affiche la synthèse cible et son pourcentage (aujourd'hui une scène `titre` : pourcentage en
   titre, synthèse en sous-titre) ; mode **orienté** (une IA reformule les idées du public compatibles avec la cible, écarte les
   autres, validation régie) inexistant ; la synthèse doit aussi s'afficher sur les téléphones.
6. **Commentaires du public autour de Jim sur l'écran scène** : bulles Instagram (pseudo, texte) sur un fond vidéo, épinglées
   une à une par la régie, et l'avis « ton commentaire est à l'écran » sur le téléphone de l'auteur. Les pops du calque
   n'existent que sur la scène streamer.
7. **Compteur de followers** relié à la mémoire `followers`, en incrustation (stories, synthèses).
8. **Gabarit « story Instagram » pour la scène streamer** : cadre vertical 9:16, barre de progression, pseudo, compteur.
   Les gabarits existants sont calme, chat, folie, vote et entracte ; le projet utilise « calme » en attendant.
9. **Notification plein écran** façon système (titre, logo, texte, bouton) : le bloc `x6` n'est qu'un bandeau.
10. **Écran téléphone « image + onde audio »** (visage du président pendant la radio).
11. **Couleur tenue** jusqu'à une étape suivante (le rouge de la séquence 9) : le rotatif de `x1` s'arrête à 20 s.
12. **Extinction et reflet** : écran noir définitif, sans retour à l'accueil, jusqu'à la fin de la représentation.
13. Si la séquence 10 est gardée : un **écran « script horodaté »** généré par le logiciel (didascalies, répliques, synthèses,
    pourcentages, heure réelle d'avant la représentation), plutôt qu'une vidéo à refaire chaque soir.

---

## 4. Le minutage du Zoom (`zoom_junon.mp4`)

Une seule vidéo ; Junon parle dans ses créneaux et **écoute** pendant ceux de Jim. Minutage estimé (≈ 2,4 mots/s) à
recaler au tournage, puis à reporter dans `s7_visio.params.dialogue` et sur la piste Textes.

| TC | Durée | Qui | Début de la réplique |
|---|---|---|---|
| 00:00 | 6 s | — | sonnerie, décroché |
| 00:06 | 5 s | Junon | Salut Jérémy… |
| 00:11 | 8 s | Jim | Très bien, merci… |
| 00:19 | 8 s | Junon | Oui, c'est pour ça que je t'appelais… |
| 00:27 | 4 s | Jim | Ah ? |
| 00:31 | 11 s | Junon | Notre campagne a eu un succès fou… |
| 00:42 | 6 s | Jim | Plus que mes stories hebdomadaires ? |
| 00:48 | 12 s | Junon | On a mené une petite étude… |
| 01:00 | 10 s | Jim | Oui, je comprends très bien… |
| 01:10 | 4 s | Junon | C'est vrai ? |
| 01:14 | 37 s | Jim | Oui, tout ça n'est pas un mensonge, Junon… |
| 01:51 | 4 s | Junon | Euh… oui, à peu près. |
| 01:55 | 34 s | Jim | J'en ai trouvé un très joli… |
| 02:29 | 16 s | Junon | Euh… mouais… |
| 02:45 | 5 s | Jim | Ce sera avec plaisir. |
| 02:50 | 6 s | Junon | Alors on se dit à jeudi prochain, Jim. |
| 02:56 | 5 s | Jim | À très vite, Junon. |
| 03:01 | 4 s | — | fin d'appel |

---

## 5. Points à valider par l'auteur

1. **Première question d'Écho (séquence 5)** : le texte de la question, sa synthèse, son pourcentage et l'effet sur Jim
   manquent dans le déroulé (étapes `s5_question` et `s5_synthese` marquées « À ÉCRIRE PAR L'AUTEUR »).
2. **Synthèses : affichées telles quelles ou orientées par une IA ?** Aujourd'hui le texte cible est projeté mot pour mot
   (mode « cible »). Le mode orienté (reformuler les idées du public, garder la trajectoire) demande le bloc §3.5.
3. **Les followers** : valeur de départ, gain par synthèse (pourcentage × 100) et explosion finale sont des propositions.
4. **Le fil de la séquence 1** : ordre, rôle de chaque post et story, légendes, likes, marques partenaires ; texte de la
   notification Instagram d'ouverture.
5. **Les stories en direct** : quatre (après les questions 4, 8, 12 et 15), environ 30 s chacune ; ce que Jim y dit est à
   écrire ou improvisé ?
6. **Séquence 10** : la garder (code qui défile, script horodaté) ou finir sur l'extinction ? Et le salut ?
7. **Écrans rouges pour tous** : y compris le mode calme (fondu d'une seconde, sans flash) ? La phrase du président
   (« À celles et ceux dont l'écran vient de rougir… ») vise alors toute la salle.
8. **Accueil** : ajout de régie (préchargement du fil), absent du texte ; une annonce de salle (son coupé, luminosité, mode
   calme) est à écrire.
9. **Données du public** : les justifications et réponses sont affichées sur scène ; prévoir la mention à l'accueil, la
   modération et l'effacement après la représentation.
10. **Durée** : ≈ 48 min du noir au noir final ; le ping-pong (≈ 24 min) en est le cœur. Resserrer (garde-fous à 20 s) ou
    laisser respirer selon les répétitions.
