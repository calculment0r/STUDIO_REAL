# Étude de faisabilité vidéo : le streamer mobile vers la scène (cas LIVE)

*Date : 26 octobre 2026. Étude documentaire (sources web récentes citées en fin de document). **Aucune latence n'a été mesurée par nous** : les chiffres sont soit des revendications d'éditeurs, soit des estimations de ce document (marquées « estimation »). Le §8 décrit le protocole pour les mesurer. Les prix sont ceux publiés par les fournisseurs, en dollars, sans conversion, à revérifier avant tout engagement.*

Contexte repris de [06](../06-cas-live-streamer.md) et [07](../07-architecture-technique.md) : un comédien filme en extérieur, souvent en mouvement, en 4G/5G ; son flux doit arriver à l'ordinateur de scène du théâtre avec une latence visée **< 500 ms** ; le public réagit sur téléphone ; le streamer est sur Internet public (donc pas sur le Tailscale des DGX).

---

## 1. Verdict en dix lignes

1. **< 500 ms de bout en bout (caméra du streamer → projection) n'est tenable que par WebRTC, sur une bonne liaison 5G/4G, et sans agrégation de liens.** C'est cohérent avec les revendications des éditeurs (Cloudflare : « moins de 500 ms » en WebRTC) mais **non mesuré indépendamment** pour du mobile en mouvement.
2. **Le SRT « résilient » ne tient pas sous 500 ms.** Les guides donnent 400 à 1000 ms de tampon SRT pour du cellulaire aggloméré, avant même l'encodage, le serveur et l'affichage : attendre **1 à 2 s** de bout en bout avec agrégation (estimation).
3. **Il faut donc deux profils**, choisis par la régie selon le segment : **A « interactif »** (WebRTC direct, 0,3 à 0,6 s, une seule liaison, qualité qui s'adapte) et **B « mobile difficile »** (SRTLA agrégé, 1 à 2 s, très résilient). Le scénario doit tolérer 1 à 2 s sur les segments en B (réponse du streamer aux commentaires légèrement différée, ce qui se joue dramaturgiquement).
4. **Streamer** : un iPhone récent avec **Moblin** (gratuit, open source, SRTLA + RIST + WHIP) ; Android : **IRL Pro** (SRTLA) ou **Larix** (SRT/WHIP, sans SRTLA confirmé). Le navigateur mobile reste un **plan de dépannage**, pas un plan principal (iOS suspend caméra/micro quand l'écran se verrouille).
5. **Serveur** : un **VPS public** (pas les DGX : Tailscale Funnel est un proxy TCP/HTTPS, inadapté au média UDP) qui héberge le récepteur SRTLA + MediaMTX ; **LiveKit** (cloud « Ship » à 50 $/mois, ou auto-hébergé) pour la salle, le canal retour et le chemin A ; **Cloudflare Stream WHIP/WHEP** comme **plan C** managé, d'un autre fournisseur.
6. **Théâtre** : Chrome en kiosque plein écran comme écran de scène (page unique, lecteur WHEP/LiveKit, chien de garde), OBS en option pour mixer/enregistrer ; plan B automatique en 3 niveaux (source de secours, boucle locale, commutateur HDMI matériel).
7. **Canal retour** : audio-seul WebRTC (LiveKit) vers un **second petit téléphone** + oreillette Bluetooth du streamer, séparé de l'application qui diffuse.
8. **Diffusion aux 200-500 téléphones** : par défaut non. Si oui, **LL-HLS (2-3 s)** est plus simple et moins cher à cette échelle ; WebRTC reste possible (≈ 40 à 85 $ par représentation de 500 spectateurs sur LiveKit Cloud, ≈ 8 $ sur Cloudflare Realtime SFU hors franchise, voir §10).
9. **Coût de base d'une production** : ≈ 50 $/mois (LiveKit Ship) + 10-30 €/mois (VPS, estimation) + forfaits mobiles du streamer ; sans audience vidéo, le coût marginal par représentation est quasi nul.
10. **Risques majeurs** : (a) la cible 500 ms en mouvement est improbable sans bonne couverture ; (b) la chaîne SRTLA reste peu documentée et son récepteur d'origine est déclaré « non adapté à la production » (§4) ; (c) conversion SRT vers WebRTC (audio AAC vers Opus, B-frames) à valider ; (d) Moblin est iOS seulement ; (e) aucune mesure indépendante trouvée : le banc d'essai du §8 est obligatoire avant d'engager le spectacle.

---

## 2. Tableau comparatif des serveurs et protocoles

Légende de la latence : **[R]** revendiquée par l'éditeur/une source tierce ; **[E]** estimation de ce document ; aucune n'est une mesure à nous.

| Option | Rôle | Entrées (streamer) | Sorties (théâtre / public) | Latence attendue vers l'écran de scène | Résilience / adaptation | Enregistrement | Licence / hébergement | Verdict |
|---|---|---|---|---|---|---|---|---|
| **LiveKit Cloud** | SFU managé + SDK | SDK navigateur/natif ; **WHIP** et RTMP via le service Ingress ; URL SRT en « tirage » (non détaillé) | SDK WebRTC (simulcast, adaptive stream) | 0,3 à 0,6 s **[E]** ; revendiqué sub-seconde | simulcast, reconnexion SDK ; **WHIP sans transcodage gratuit** | Egress (piste, composite) : 0,001 $/min de piste, 600 min incluses en Ship | Apache 2.0 pour le serveur ; Cloud payant (§10) | **Retenu** pour le chemin A, la salle, le retour audio, les jetons |
| **LiveKit auto-hébergé** | idem | idem (Ingress = service séparé + Redis, ≥ 4 vCPU/4 Go) | idem | idem | idem | Egress = service séparé | VPS public obligatoire, domaine + certificat CA, ports TCP 7880/7881/5349, UDP 50000-60000 (+ 443 TURN) | Bon pour répéter et pour un coût fixe ; plus d'exploitation. Banc : 3000 abonnés/16 cœurs (donc 500 abonnés ≈ 3 à 4 cœurs, estimation) |
| **Cloudflare Realtime SFU** (ex-Calls) | SFU « pistes/sessions » sans notion de salle | WebRTC via API Cloudflare (la doc consultée ne détaille ni WHIP, ni simulcast, ni enregistrement) | WebRTC | 0,3 à 0,6 s **[E]** | à construire côté application | non fourni | Service managé ; 0,05 $/Go sortant, 1000 Go/mois gratuits (partagés avec TURN) ; l'entrant est gratuit | Très bon marché pour une audience, mais bas niveau : plus de développement |
| **Cloudflare Stream WebRTC (WHIP/WHEP)** | Entrée/sortie WebRTC managées | **WHIP** (draft 06) depuis Larix, OBS, Moblin, navigateur ; H.264 CB 3.1, VP8, VP9 | **WHEP** ; pas de limite de spectateurs annoncée | « moins de 500 ms » **[R]** (page Cloudflare) ; GA, facturation depuis le 15 oct. 2026 | pas de simulcast ni de lecture HLS d'une entrée WHIP ; WHIP et WHEP vont de pair | **Non** (« WebRTC streams can't be recorded ») | Managé ; 1 $ / 1000 min **délivrées** | **Plan C** : sans exploitation, un autre fournisseur que le chemin principal |
| **Cloudflare Stream (SRT/RTMPS) + HLS** | Distribution HLS | SRT ou RTMPS | HLS/DASH (latence non précisée dans la doc consultée) | 3 à 10 s **[E]** | bonne | **Automatique** (5 $/1000 min enregistrées) | Managé | Utile pour l'archive et l'audience tolérante, pas pour l'écran de scène |
| **mediasoup** | Bibliothèque SFU Node | pas de WHIP/ingress prêt à l'emploi (à écrire) | WebRTC | idem WebRTC | très bon contrôle, peu d'overhead CPU **[R]** | à écrire | MIT ; vous écrivez la signalisation, les jetons, l'enregistrement | **Écarté** : tout ce que LiveKit livre prêt est à développer |
| **Janus** | Passerelle WebRTC à plugins (C) | WHIP via module dédié (VideoRoom ; le mainteneur ne prévoit pas WHEP dans VideoRoom : plugin Streaming) | WebRTC, plugin Streaming | idem WebRTC | selon la configuration | plugin Record&Play (local) | GPL v3 ; exploitation plus lourde | **Écarté** : utile surtout avec SIP/hybride, pas ici |
| **OvenMediaEngine (OME)** | Serveur de diffusion | WebRTC, **WHIP (simulcast)**, **SRT**, RTMP, TS ; SRT : H.264/H.265 + AAC | **WebRTC**, **LL-HLS**, HLS ; transcodeur intégré (Opus/AAC/H.264, ABR) | sub-seconde **[R]** (pas de chiffre) ; LL-HLS : 2 à 3 s **[R]** (sources tierces) | ABR WebRTC/LL-HLS ; enregistrement fichier | oui (« File Recording ») | **AGPL-3.0** ; un VPS | **Alternative sérieuse au couple MediaMTX+ffmpeg** si l'audio AAC→Opus pose problème ; LL-HLS intégré pour l'audience |
| **MediaMTX** | Serveur/proxy média (binaire unique) | **SRT**, **WebRTC (WHIP)**, RTSP, RTMP, HLS, MPEG-TS | **SRT**, **WebRTC (WHEP)**, HLS/LL-HLS, RTSP | WebRTC 0,2 à 1 s **[R]** ; SRT 0,5 à 3 s **[R]** (source tierce, pas propre à MediaMTX) | conversion automatique entre protocoles ; **audio AAC (SRT) non lisible en WHEP** : il faut le transcoder en Opus (ffmpeg via hook) | **oui** (fMP4 / MPEG-TS) | **MIT** ; un VPS | **Retenu** pour le chemin B et le plan de secours, simple, standard WHIP/WHEP |
| **SRT pur** (Larix / Moblin → récepteur) | Transport | Larix, Moblin, OBS, IRL Pro | décodeur (OBS, ffmpeg, vMix) | tampon 80-250 ms (bon Internet) à 400-1000 ms (cellulaire aggloméré) **[R]** ; total **1 à 2 s [E]** | retransmission, chiffrement ; ne résout pas la perte de réseau prolongée | côté serveur ou OBS | Protocole ouvert | Excellent en qualité/résilience ; **ne tient pas 500 ms** |
| **SRTLA (agrégation)** | Transport SRT sur plusieurs liens | Moblin (iOS), IRL Pro (Android), Brix (Android, bêta), BELABOX | récepteur `srtla_rec` puis serveur SRT | tampon à régler (exemple de la doc : 2000 ms) ; **1,5 à 2,5 s [E]** | répartition dynamique selon la capacité de chaque lien ; **experimental** | via serveur SRT | `srtla_rec` d'origine : « plus développé, non adapté à la production » ; un fork (irlserver/srtla, AGPL-3.0) ajoute récupération de lien et métriques Prometheus, statut de maintenance non confirmé | **Retenu pour le profil B**, avec le risque ci-dessus |
| **NDI** | Vidéo LAN | non | non | LAN : très faible ; WAN : inadapté | NDI Bridge possible entre sites contrôlés (H.264/HEVC), pas conçu pour le cellulaire | OBS | propriétaire (outils gratuits) | **Hors sujet pour le streamer** ; seulement utile dans le théâtre (OBS vers projecteurs) |

**Précision sur l'agrégation de liens.** Un routeur « multi-SIM » en répartition de charge ou en bascule ne combine pas les liens pour un seul flux UDP : il bascule ou répartit des connexions. Une vraie agrégation d'un flux unique demande un protocole comme SRTLA, ou une solution propriétaire de type SpeedFusion (Peplink), avec un point de terminaison de l'autre côté. Un témoignage de forum Peplink indique qu'un modem lent peut faire dépasser la seconde au flux aggloméré (source anecdotique).

---

## 3. Publication : navigateur mobile ou application dédiée

| Critère | Navigateur / PWA (SDK LiveKit) | Application dédiée (Moblin, Larix, IRL Pro) |
|---|---|---|
| Mise en place | zéro installation, un lien | installation, configuration, profils |
| Écran verrouillé / arrière-plan | **iOS suspend caméra et micro** dès que l'écran se verrouille ou que Safari passe en arrière-plan (fils Apple Developer et bogues WebKit : il faut rappeler `getUserMedia`) ; Android plus tolérant en avant-plan avec Wake Lock | prévu pour le direct (Larix : mode arrière-plan Android, audio seul sur iOS) |
| Qualité vidéo | limitée (résolution/débit imposés par le navigateur, peu de contrôle de l'exposition, des objectifs) | H.264/HEVC, 1080p, débit contrôlé, stabilisation, objectifs, micros externes |
| Agrégation de liens | **non** (une seule liaison, bascule Wi-Fi/4G seulement par ICE) | **oui** (Moblin et IRL Pro : SRTLA ; Moblin : Wi-Fi + cellulaire + Ethernet) |
| Débit adaptatif | **très bon** (contrôle de congestion WebRTC + simulcast) | SRT : bitrate adaptatif ; WHIP (Larix, Moblin) : une seule couche, contrôle de congestion WebRTC |
| Retour audio | possible dans la même page (mais voir §7) | séparé (Larix « Talkback » est une option premium) |
| Verdict | **plan de dépannage et répétitions** | **plan principal** |

Notes :
- **Moblin** : application iOS (aussi iPad, Mac limité), gratuite et open source ; envoie RTMP/RTMPS/SRT/**SRTLA**/RIST/**WHIP**, reçoit RTMP/SRT/RIST/WHIP, affiche les statistiques par lien et gère des priorités. Fonction « Moblink » pour des connexions supplémentaires. **Pas d'Android**.
- **Larix Broadcaster** (Softvelum) : iOS et Android, SRT (appelant/écouteur/rendez-vous, paramètre `latency`), RIST, RTMP, RTSP, **WHIP** (H.264 + Opus, **fonction premium**) ; l'agrégation citée est Zixi (iOS/macOS, premium) ; SRTLA non confirmé par la page consultée.
- **IRL Pro** (Android) : documenté par IRL Toolkit pour le direct agrégé en SRTLA (les téléphones recommandés dans cette page datent de 2023). **Brix** (F-Droid) : SRTLA, SRT, RTMP/WHIP, encore en bêta et testé sur un seul appareil.

---

## 4. Architecture recommandée

```
                       INTERNET PUBLIC
 ┌─────────────────────────────┐
 │ STREAMER (iPhone + Moblin)  │
 │  profil A : WHIP, 1 lien    │──── WebRTC/WHIP ─────────────┐
 │  profil B : SRTLA, N liens  │──── SRTLA (UDP) ──────┐      │
 │ 2e téléphone : retour audio │◄─── LiveKit audio ──┐ │      │
 └─────────────────────────────┘                     │ │      │
                                                     │ │      │
        ┌────────────────────────────────────────────┴─▼──────▼───────────────┐
        │ VPS PUBLIC (région proche du théâtre ; IP fixe ; Docker)             │
        │  • LiveKit (ou LiveKit Cloud) : salle, jetons, Ingress WHIP, retour  │
        │  • srtla_rec (récepteur) → MediaMTX (SRT) → WHEP + enregistrement    │
        │    (audio AAC transcodé en Opus par ffmpeg ; ou OME)                 │
        └───────────────┬────────────────────────────────┬────────────────────┘
                        │ source 1 : LiveKit (A)         │ source 2 : WHEP MediaMTX (B)
        ┌───────────────▼────────────────────────────────▼────────────────────┐
        │ THÉÂTRE : PC écran scène (Chrome kiosque, plein écran, HDMI)        │
        │  lecteur unique + chien de garde → bascule source 1 → 2 → 3 → boucle │
        │  source 3 : Cloudflare Stream WHEP (plan C, même flux via WHIP)     │
        └──────────────────────────────────────────────────────────────────────┘
   Serveur de jeu (réactions, consignes) : canal séparé, inchangé (doc 07).
   DGX : répétitions, bots, modération, post-traitement ; PAS de rôle d'entrée publique.
```

### 4.1 Les deux profils

| | **A : interactif** | **B : mobile difficile** |
|---|---|---|
| Quand | ville, bonne 5G, segments où le streamer répond en direct | marche, transports, zones faibles, coupures probables |
| Chemin | Moblin/Larix **WHIP** → LiveKit Ingress (sans transcodage) → théâtre via SDK LiveKit | Moblin **SRTLA** → `srtla_rec` → MediaMTX → théâtre en **WHEP** |
| Latence attendue | 0,3 à 0,6 s **[E]** | 1,5 à 2,5 s **[E]** |
| Qualité | WebRTC la baisse si le réseau se dégrade (une couche en WHIP depuis une application) | tampon SRT absorbe les pertes ; image plus propre |
| Basculement | décidé par la régie avant le segment (ou automatique si le flux A reste mauvais plus de N secondes) ; le streamer peut avoir **les deux flux actifs** (coût réseau doublé) | idem |

**Pourquoi pas tout en WebRTC ?** Parce qu'en mouvement un seul lien sature ou coupe, et que le WebRTC ne se répare pas par retransmission longue. **Pourquoi pas tout en SRTLA ?** Parce que la latence casse l'objectif.

### 4.2 Points techniques à valider (risques identifiés)

1. **Audio AAC (SRT) vers Opus (WebRTC).** MediaMTX lit en WHEP l'Opus, le G722 et le G711, pas l'AAC ; le motif documenté par la communauté est un hook `runOnReady` qui lance ffmpeg pour transcoder l'audio vers un second chemin (discussion #2787, avec des cas de crépitement audio signalés). OME a un transcodeur intégré (AAC/Opus) et accepte H.264/H.265 + AAC en SRT, c'est l'alternative. À tester d'abord.
2. **B-frames H.264** : à désactiver côté encodeur (réglage de l'application) pour le chemin WebRTC ; sinon latence et problèmes de décodage possibles (connaissance générale, à confirmer au banc).
3. **HEVC** : plus économe en débit, mais lecture WebRTC navigateur inégale ; rester en **H.264** pour la sortie WebRTC.
4. **Récepteur SRTLA** : l'original BELABOX est « expérimental » et « `srtla_rec` n'est plus développé et n'est pas adapté à la production » (README). Le fork `irlserver/srtla` (AGPL-3.0, « recovery mode », pondération par qualité de lien, métriques Prometheus) est le candidat, mais **sa maintenance n'est pas confirmée** ; prévoir de figer une version testée en répétition. Il faut aussi la bibliothèque SRT patchée de BELABOX en réception (sinon trop de retransmissions en cas de paquets déséquilibrés).
5. **Jamais en Tailscale pour la production** : Tailscale Funnel fait passer du TCP/HTTPS, pas de l'UDP média public ; le streamer et le théâtre atteignent le VPS en direct. Les DGX restent derrière Tailscale et ne reçoivent aucun flux du streamer.
6. **TURN et réseaux restrictifs** : prévoir TURN/TLS sur 443 (LiveKit Cloud le fournit ; en auto-hébergé, domaine et certificat dédiés). Le théâtre doit pouvoir sortir en UDP, sinon repli TCP (+ latence).

### 4.3 Plan B (et C, D) d'ensemble

| Niveau | Déclencheur | Action | Où |
|---|---|---|---|
| **B1 : second chemin du même flux** | pas de trame décodée depuis > 1,5 s | la page bascule sur la source suivante (A → B → C) | page écran scène |
| **B2 : plan C managé** | pannes du VPS ou de LiveKit | le streamer pousse en **WHIP vers Cloudflare Stream** (autre fournisseur) ; l'écran lit en WHEP ; aucun enregistrement | Cloudflare Stream |
| **B3 : image de repli** | aucune source > 4 s | calque « Connexion perdue… » dans le style du personnage, puis **boucle vidéo locale préchargée** (hors réseau) | page écran scène |
| **B4 : matériel** | plantage du PC ou du navigateur | commutateur HDMI vers un second PC (ou lecteur) qui diffuse la boucle ; la régie a un bouton (ou une pédale) | théâtre |
| Manuel | décision artistique | bouton panique (doc 05) | régie |

Les sources A, B et C peuvent être **connectées en attente** (« hot standby ») pour que la bascule soit immédiate ; le flux n'est publié que par un chemin à la fois.

---

## 5. Résilience : perte de réseau, reprise, qualité adaptative

| Situation | WebRTC (profil A) | SRT/SRTLA (profil B) |
|---|---|---|
| Baisse de débit | le contrôleur de congestion baisse le débit ; image dégradée mais continue | débit adaptatif de l'application ; tampon qui se vide |
| Perte d'un lien sur plusieurs | n/a (un seul lien) | les autres liens portent le flux ; le fork `irlserver/srtla` réactive les liens désactivés (« recovery mode ») |
| Coupure totale de 5 à 30 s | ICE se rétablit (redémarrage ICE) ; le SDK LiveKit se reconnecte ; **à mesurer** | SRT peut reprendre si la coupure < tampon, sinon reconnexion ; **à mesurer** |
| Changement de cellule (handover) | brève interruption (secondes dans le pire cas selon un brevet cité, non mesuré) | absorbé par le tampon si assez grand |
| Écran verrouillé (iOS navigateur) | caméra et micro coupés | non concerné (application) |
| Simulcast | LiveKit : oui depuis le SDK ; depuis WHIP Larix/Moblin : une couche ; OBS 32.1+ : 1 à 4 couches | sans objet (ABR côté application) |

Recommandations :
- Régler Moblin/Larix en **débit adaptatif** ; plafonner le débit vidéo à ≈ **50 à 60 %** du débit montant mesuré (guide : ne pas régler le débit sur la vitesse maximale mesurée).
- Profil B : démarrer à `latency` **≈ 1500-2000 ms** (exemple du README SRTLA, plage 400-1000 ms annoncée pour le cellulaire aggloméré par un autre guide), puis descendre pas à pas pendant ≥ 30 min de test en conditions réelles.
- Garder un **GOP/keyframe de 1 s** pour qu'une reprise réaffiche vite.
- Le streamer a un **indicateur de qualité** sur son écran privé (doc 06 §2) ; la régie reçoit débit, perte, latence.

---

## 6. Réception côté théâtre

| Option | + | − | Verdict |
|---|---|---|---|
| **Chrome en kiosque plein écran** (`--kiosk`) | une seule page (vidéo + calques PixiJS) ; peu de couches = peu de latence ; mise à jour par déploiement web | autoplay avec son bloqué par défaut (indicateur `--autoplay-policy=no-user-gesture-required` ou politique d'entreprise `AutoplayAllowed`, ou un clic de régie au démarrage) ; pas d'enregistrement intégré | **Principal** |
| **OBS** (source navigateur + sorties) | mixage, enregistrement de la vidéo **avec** les calques, sources de secours, sortie NDI/HDMI, scènes de repli | une couche de plus, plus de latence ; OBS ne fait pas de WHEP natif dans nos sources (OBS 30+ : WHIP en sortie, simulcast à partir de 32.1) | **Option** pour l'enregistrement et le mixage |
| **Sortie HDMI** | carte graphique du PC | veiller à 1080p60 fixe, mise en veille et notifications désactivées, compte dédié | standard |
| **Plan B** | voir §4.3 | | |

Réglages conseillés : PC filaire (Ethernet) ou deux liaisons (Ethernet + 4G de secours en routage distinct), carte graphique avec décodage matériel H.264, profil Chrome dédié, mises à jour automatiques désactivées pendant les représentations, **zone protégée** du visage (doc 06) conservée, lecteur avec **jitter buffer minimal** (réglage `playoutDelayHint`/`jitterBufferTarget` à tester), chien de garde sur `requestVideoFrameCallback`.

---

## 7. Canal retour audio (oreillette)

Le streamer doit entendre la régie (et éventuellement l'ambiance de salle). Options :

| Option | Latence attendue | Avantages | Inconvénients |
|---|---|---|---|
| **Audio-seul WebRTC (LiveKit) sur un 2e téléphone** + oreillette Bluetooth/filaire | 150 à 300 ms **[E]** | indépendant de l'application qui diffuse ; coupe-circuit facile ; la régie parle via la page de régie | un 2e appareil à charger et à porter |
| Larix « Talkback » | non communiqué | intégré à l'application | fonction premium ; liée à la configuration SRT |
| Appel téléphonique / messagerie vocale | 200 à 400 ms **[E]** | rien à développer, très fiable | audio non synchronisé avec le jeu, pas de pilotage par le scénario |
| Même page navigateur que le flux | bas | simple | fragile (verrouillage iOS) et risque d'écho |

**Reco** : 2e téléphone avec page LiveKit « audio seul » (jeton de rôle `retour`), oreillette **mono** (pour garder l'oreille libre), **micro du streamer jamais renvoyé** vers l'oreillette (anti-écho) ; consignes urgentes aussi par vibration (doc 06). Test : mesurer la latence « bouche de la régie → oreille du streamer » (§8).

---

## 8. Protocole de test de latence

### 8.1 Objectif et critères
Mesurer la latence **verre à verre** (caméra du streamer → image projetée) dans chaque profil et chaque condition, avant toute décision.

| Critère | Profil A | Profil B |
|---|---|---|
| Médiane (p50) | ≤ 500 ms | ≤ 2000 ms |
| p95 | ≤ 800 ms | ≤ 3000 ms |
| Gel > 1 s | 0 sur 10 min en condition bonne | ≤ 1 / 10 min |
| Reprise après coupure 10 s | ≤ 5 s | ≤ 8 s |

(Seuils proposés par ce document, à valider par la production.)

### 8.2 Méthode de mesure (sans instrument spécial)
1. Écran « horloge » : une page qui affiche le temps en millisecondes (`performance.now()` ou un code de temps visible) sur un moniteur près du streamer ; la caméra du streamer le filme.
2. Sur l'écran de scène, afficher la vidéo reçue **à côté** de l'horloge locale du théâtre (même PC, deux zones) ; les deux horloges doivent être synchronisées (même PC pour l'horloge de référence, ou les deux écrans pilotés par la même source de temps).
3. Photographier ensemble, avec un 3e appareil photo (1/1000 s ou plus rapide) : horloge locale et image reçue. La latence = différence des deux valeurs affichées. **≥ 30 photos par condition**, noter p50/p95.
4. Variante simple : mesurer à l'œil/vidéo au ralenti le délai entre un geste (clap) et son affichage.
5. Mesures internes en complément : `getStats()` (RTT, `jitterBufferDelay`, `freezeCount`, `framesDropped`), `webrtc-internals` de Chrome, statistiques Moblin par lien, métriques Prometheus de `srtla_rec`, débit d'envoi.

### 8.3 Matrice de conditions

| # | Condition | Profil(s) |
|---|---|---|
| 1 | Référence : Wi-Fi/fibre, même ville que le serveur | A, B |
| 2 | 5G bonne couverture, immobile | A, B |
| 3 | 4G moyenne, immobile | A, B |
| 4 | Marche continue (10 min) en ville, 1 SIM | A, B |
| 5 | Marche + 2 liaisons (2 SIM, ou SIM + Wi-Fi/Moblink) | B |
| 6 | Passage en zone faible (sous-sol, tunnel), puis retour | A, B |
| 7 | Coupure forcée : mode avion 5 s, 15 s, 60 s, puis réactivation | A, B |
| 8 | Dégradation simulée (perte 2 %, 5 % ; gigue 50 ms ; plafond 2 Mbps) avec `tc netem` ou un outil équivalent | A, B |
| 9 | Écran verrouillé 30 s (navigateur iOS vs application) | navigateur, app |
| 10 | Endurance 90 min : batterie, chaleur, dérive de latence | A, B |
| 11 | Basculement automatique A → B → C → boucle (couper chaque source) | page écran scène |
| 12 | Retour audio : bouche de la régie → oreille du streamer ; test d'écho | retour |
| 13 | Charge : 500 bots (DGX) sur la salle pendant que le flux passe | A |

Pour chaque condition : débit vidéo, résolution, latence réglée (SRT), version des logiciels, opérateurs, lieu, heure. Répéter à des heures différentes (heure de pointe réseau).

### 8.4 Sortie
Un tableau p50/p95/pire cas par condition, les temps de reprise, et une décision par profil : « tient / tient avec réserve / ne tient pas ». C'est cette table, et non les revendications ci-dessus, qui fixe la promesse artistique (« le streamer répond en direct » ou « avec 1-2 s de décalage »).

---

## 9. Matériel conseillé pour le streamer

*Les modèles et prix ne sont pas issus de sources consultées : ce sont des ordres de grandeur du chargé d'étude, à vérifier. Seules les capacités logicielles ci-dessus sont sourcées.*

| Rôle | Recommandation | Remarque |
|---|---|---|
| **Téléphone principal** | iPhone récent (15/16 Pro ou équivalent) avec **Moblin** | iOS seulement pour Moblin ; encodage H.264/HEVC matériel ; stabilisation. Alternative Android : appareil récent de haut de gamme avec **IRL Pro** (SRTLA) ou **Larix** (SRT/WHIP) |
| **Liens** | 2 cartes SIM d'**opérateurs différents** (eSIM + physique) ou 1 SIM + point d'accès d'un 2e téléphone via **Moblink**/Wi-Fi ; en option un modem/routeur 5G en USB-C ou Ethernet | l'agrégation n'a de sens qu'avec des réseaux indépendants ; essai de couverture sur le parcours **par opérateur** avant de choisir |
| **Routeur multi-SIM** | utile pour la **redondance** (bascule), pas pour l'agrégation d'un flux UDP unique, sauf solution propriétaire (ex. SpeedFusion, avec point de terminaison dédié) | à choisir seulement si le dispositif matériel est préféré à la solution logicielle |
| **Option « sac à dos »** | boîtier BELABOX (matériel libre à base de carte ARM + modems USB) ou équivalent commercial | plus de liens, meilleure antenne, mais plus lourd et plus technique ; SRTLA d'origine |
| **Alimentation** | batterie externe PD 20 000 mAh minimum, 2e batterie pour le 2e téléphone | 90 min d'encodage + 4G chauffent le téléphone : coque ventilée, éviter le plein soleil |
| **Stabilisateur** | cardan pour téléphone (ou DockKit, supporté par Moblin) | |
| **Audio** | micro cravate sans fil vers le téléphone (récepteur USB-C/Lightning) ; coupe-vent | le son est ce que le public tolère le moins mal d'être dégradé |
| **Retour** | 2e téléphone + oreillette Bluetooth mono (ou intra-auriculaire discret) | voir §7 |
| **Données** | forfaits avec data large ; compter ≈ 2,7 Go par SIM pour 90 min à 4 Mbps (profil A) | prévoir 2 à 3 fois plus pour la répétition |
| **Secours** | 3e téléphone chargé avec le navigateur + lien de dépannage LiveKit ; lien WHIP Cloudflare préconfiguré | |

Avant la représentation : test de couverture sur le trajet exact, comme à la répétition, à la même heure.

---

## 10. Enregistrement

| Source | Ce qu'elle capte | Qualité | Remarque |
|---|---|---|---|
| **Enregistrement local sur le téléphone** (Larix, Moblin) | flux d'origine, sans perte | **meilleure** | fichiers à récupérer après coup ; recommandé pour l'archive |
| **MediaMTX** (chemin B) | flux reçu | bonne | fMP4/MPEG-TS sur disque du VPS |
| **LiveKit Egress** (chemin A) | pistes ou composite | bonne | 0,001 $/min de piste ; 600 min incluses en Ship ; service séparé à héberger |
| **OBS au théâtre** | vidéo **avec** calques d'animation | bonne | seul moyen d'archiver exactement ce que le public a vu (avec réactions) |
| **Cloudflare Stream WHIP** | rien | n/a | « WebRTC streams can't be recorded » |

Conseil : **enregistrement local téléphone + OBS (en parallèle de l'écran de scène)** ; le serveur est une troisième copie. Prévoir l'information et le consentement (public visible, voix) pour l'archive.

---

## 11. Diffusion optionnelle du flux aux 200-500 téléphones

| Critère | WebRTC (LiveKit / Cloudflare SFU) | LL-HLS (OME, MediaMTX, Cloudflare Stream) |
|---|---|---|
| Latence | 0,3 à 0,6 s | 2 à 3 s **[R]** (sources tierces) ; 3 à 5 s selon d'autres |
| Mise à l'échelle | un SFU : 100 à 500 spectateurs par instance sans cascade **[R]** ; LiveKit : 3000 abonnés sur 16 cœurs au banc | CDN, ~1000 spectateurs sur 4 cœurs **[R]** ; extensible |
| Coût | par Go sortant (LiveKit 0,12 $/Go en Ship ; Cloudflare 0,05 $/Go) + minutes participants | par minute délivrée (Cloudflare 1 $/1000 min) ou par Go de CDN |
| Réseau de la salle | **c'est la 4G des spectateurs** qui est sollicitée, pas le Wi-Fi du théâtre ; 500 flux simultanés saturent un Wi-Fi de salle non dimensionné | idem |
| Mobile | WebRTC sur iOS/Android très inégal en lecture sur réseau chargé | HLS natif iOS/Android, très robuste |
| Impact sur le jeu | batterie et chaleur, concurrence avec les capteurs/vibration | idem, plus léger |

**Reco** : par défaut **pas de vidéo dans les téléphones** (comme doc 06). Si une mini-vue est voulue : **LL-HLS basse définition (≈ 400 à 600 kbps)** à 2-3 s ; le décalage avec la scène est acceptable pour une vue secondaire et c'est plus robuste. WebRTC uniquement pour un petit groupe (superviseurs, régie).

---

## 12. Coûts

Hypothèses : **8 représentations par mois, 90 min chacune**. Prix publiés par les fournisseurs (dollars) ; VPS et forfaits mobiles = estimations.

### 12.1 Socle (sans vidéo aux spectateurs)

| Poste | Mensuel | Par représentation | Source / note |
|---|---|---|---|
| LiveKit Cloud « Ship » | 50 $ | 6 $ | 150 000 min, 250 Go inclus, 1000 connexions ; la régie, le théâtre et 2 streamers consomment < 1000 min |
| (alternative) LiveKit Cloud « Build » | 0 $ | 0 $ | 5 000 min et 50 Go : suffisant pour les essais, pas pour la production |
| VPS public (srtla_rec + MediaMTX, ou LiveKit auto-hébergé) | ≈ 10-30 € (estimation) | ≈ 1-4 € | tarifs Hetzner en hausse en 2026 (avril, puis juin) ; ≈ 20 To de trafic inclus en région UE selon les sources |
| Cloudflare Stream WHIP/WHEP (plan C) | quasi nul | ≈ 0,09 $ | 1 $/1000 min délivrées : 90 min × 1 spectateur (le théâtre) |
| Enregistrement (disque VPS ou 600 min Egress incluses) | ≈ 0 | ≈ 0 | |
| Forfaits mobiles du streamer (2 SIM) | ≈ 30-80 € (estimation) | ≈ 4-10 € | ≈ 2,7 Go par SIM et par représentation (profil A) |
| **Total socle** | **≈ 100-160 €/mois** | **≈ 12-20 € par représentation** | |

### 12.2 Option « vidéo aux 500 spectateurs », par représentation de 90 min

Volume : 500 spectateurs × 90 min × débit. À **0,5 Mbps** : ≈ 0,34 Go par spectateur, ≈ **170 Go** ; à **1,5 Mbps** : ≈ 1 Go, ≈ **510 Go**. Minutes participants : 500 × 90 = 45 000.

| Option | À 0,5 Mbps (170 Go) | À 1,5 Mbps (510 Go) | Remarque |
|---|---|---|---|
| **LiveKit Cloud (Ship)** : 0,12 $/Go sortant au-delà de 250 Go/mois ; 0,0005 $/min au-delà de 150 000 min | ≈ 20 $ (Go) + ≈ 22 $ (minutes) ≈ **40 $** (≈ 300 $/mois pour 8 représentations, franchises comprises) | ≈ 61 $ + 22 $ ≈ **85 $** (≈ 600 $/mois) | le prix grimpe vite : privilégier la basse définition |
| **Cloudflare Realtime SFU** : 0,05 $/Go, 1000 Go/mois gratuits | ≈ 0 $ les premières (franchise), puis ≈ **8 $** | ≈ **25 $** | développement de la signalisation à votre charge |
| **Cloudflare Stream WebRTC (WHEP)** : 1 $/1000 min délivrées | **45 $** | **45 $** (indépendant du débit) | sans exploitation ; pas d'enregistrement |
| **Cloudflare Stream (SRT/RTMPS → HLS)** : 1 $/1000 min délivrées ; enregistrement automatique 5 $/1000 min | **45 $** (+ 0,45 $ d'enregistrement) | idem | latence plus élevée (LL-HLS non précisé dans la doc consultée) |
| **VPS auto-hébergé** (OME ou LiveKit) | trafic inclus (20 To UE) : coût du VPS + CPU suffisant (LiveKit : ≈ 3 à 4 cœurs pour 500 abonnés, estimation tirée du banc 3000/16 cœurs) | idem | exploitation et sécurité à votre charge |

---

## 13. Rôle des DGX Spark

- **Utiles** : répétitions et bancs d'essai (LiveKit ou MediaMTX auto-hébergés, joignables par le streamer **via l'application Tailscale** sur son téléphone pour des essais de fonctionnement, pas de performances réelles), bots (500 joueurs), modération assistée par IA, transcodage/post-production des enregistrements.
- **Inadaptés** : point d'entrée **public** du flux du streamer (Tailscale Funnel fait du TCP/HTTPS ; un média UDP public demande une IP publique et des redirections de ports), et machine critique du jour J (réseau domestique, pas de redondance).
- **Décision** : le chemin de production passe par un **VPS public** (ou LiveKit Cloud) ; les DGX n'y touchent pas.

---

## 14. Plan de mise en œuvre proposé

1. **Semaine 1 : essai A.** LiveKit Cloud (Build), page de publication navigateur + page écran scène minimale ; mesure en conditions 1 à 4 du §8.
2. **Semaine 2 : essai B.** VPS, `srtla_rec` + MediaMTX (audio AAC → Opus), Moblin SRTLA ; conditions 4 à 7 ; comparer à OME si l'audio pose problème.
3. **Semaine 3 : Moblin en WHIP vers LiveKit Ingress et vers Cloudflare Stream** (profil A et plan C) ; chien de garde et bascule (condition 11).
4. **Semaine 4 : retour audio et matériel.** 2e téléphone, oreillette ; essai de bout en bout 90 min avec bots (DGX).
5. **Décision de la production** : latence promise au scénario (500 ms ou 1-2 s selon les segments), profil par défaut, budget.

## 15. Questions ouvertes pour la production
- Le streamer doit-il répondre aux commentaires **en direct** (profil A obligatoire) ou une réponse différée de 1-2 s est-elle jouable ? Quelle part du spectacle se joue en mouvement ?
- iPhone imposé (Moblin) ou Android (IRL Pro/Larix) ? Le comédien possède-t-il un appareil adapté ?
- Public : vidéo dans les téléphones oui/non ? Si oui, basse définition ?
- Archive : enregistrement avec ou sans calques d'animation ? Consentement du public ?
- Théâtre : débit montant et UDP sortant autorisé ? Ethernet disponible près de la régie ?

---

## Sources (consultées le 26/10/2026)

**LiveKit**
- Tarifs Cloud : https://livekit.com/pricing.md
- Auto-hébergement (vue d'ensemble) : https://docs.livekit.io/transport/self-hosting/
- Déploiement (ports, TLS, TURN) : https://docs.livekit.io/transport/self-hosting/deployment/
- Ingress (WHIP, RTMP, URL, SRT) : https://docs.livekit.io/transport/media/ingress-egress/ingress/
- Ingress auto-hébergé : https://docs.livekit.io/transport/self-hosting/ingress/
- Banc de charge (3000 abonnés, 16 cœurs) : https://docs.livekit.io/transport/self-hosting/benchmark/

**Cloudflare**
- Realtime SFU, tarifs : https://developers.cloudflare.com/realtime/sfu/pricing
- Realtime SFU, présentation : https://developers.cloudflare.com/realtime/sfu/
- Stream WebRTC (WHIP/WHEP, GA, tarif) : https://developers.cloudflare.com/stream/webrtc-beta/
- Stream Live (RTMPS/SRT, enregistrement, tarif) : https://developers.cloudflare.com/stream/stream-live/

**Serveurs de diffusion**
- MediaMTX : https://github.com/bluenviron/mediamtx
- MediaMTX, discussion sur l'audio AAC → Opus : https://github.com/bluenviron/mediamtx/discussions/2787
- OvenMediaEngine, vue d'ensemble : https://ovenmedia.com/docs/ome
- OvenMediaEngine, entrée SRT : https://ovenmedia.com/docs/ome/live-source/srt
- OvenMediaEngine, dépôt : https://github.com/AirenSoft/OvenMediaEngine
- Janus, VideoRoom et WHEP : https://janus.discourse.group/t/are-there-plans-to-update-the-video-rooms-plugin-to-support-whep/1086
- Comparatif SFU (mediasoup, Janus, LiveKit) : https://www.forasoft.com/learn/video-streaming/articles-streaming/sfu-comparison-mediasoup-janus-livekit-jitsi-pion et https://www.pistack.xyz/posts/2026-04-25-janus-gateway-vs-mediasoup-vs-livekit-self-hosted-webrtc-sfu-guide-2026/
- Protocoles RTMP/SRT/WHIP : https://onestream.live/blog/video-streaming-protocols-explained/

**Applications et agrégation**
- Moblin : https://github.com/eerimoq/moblin
- Larix Broadcaster : https://softvelum.com/larix/ et https://softvelum.com/larix/docs/ ; WHIP : https://blog.wmspanel.com/2023/03/webrtc-whip-larix-broadcaster.html
- IRL Pro (SRTLA, Android) : https://account.irltoolkit.com/plugin/support_manager/knowledgebase/view/18/irl-pro-app
- Brix (Android, SRTLA/WHIP, bêta) : https://f-droid.org/fr/packages/app.brix/
- SRTLA (BELABOX) : https://github.com/BELABOX/srtla
- Récepteur SRTLA (fork) : https://github.com/irlserver/srtla
- Réglage du tampon SRT (cellulaire, agrégé) : https://articles.medialooks.com/srt-latency-buffer-explained-how-to-tune-srt-for-cellular-satellite-and-public-internet/
- Peplink, témoignage de forum : https://forum.peplink.com/t/lte-speedfusion-is-slower-than-the-fastest-link-in-the-bonding/

**NDI, OBS, navigateur, réseau**
- NDI sur Internet : https://articles.medialooks.com/ndi-over-internet-a-complete-engineering-guide/ ; NDI Bridge : https://docs.ndi.video/all/developing-with-ndi/developer-guides/ndi-bridge-deployment
- OBS, WHIP : https://obsproject.com/kb/whip-streaming-guide
- Chrome, autoplay : https://developer.chrome.com/blog/autoplay
- iOS, WebRTC en arrière-plan : https://developer.apple.com/forums/thread/774239 et https://bugs.webkit.org/show_bug.cgi?id=259337
- Tailscale Funnel : https://tailscale.com/kb/1223/funnel
- WHIP, latence (qualitatif) : https://openvidu.io/blog/2026/09/08/low-latency-whip-ingestion/

**WebRTC vs LL-HLS**
- https://www.forasoft.com/blog/article/webrtc-video-steaming-app-vs-hls
- https://antmedia.io/?p=125850
- https://mux.com/articles/low-latency-live-streaming-developers-guide-ll-hls-webrtc-cmaf

**VPS**
- Hausses de prix Hetzner 2026 (à vérifier sur la page officielle) : https://wz-it.com/en/blog/hetzner-price-increase-june-2026-cpx-ccx-alternatives/
