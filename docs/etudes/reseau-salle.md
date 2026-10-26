# Étude : le réseau dans la salle (Wi-Fi, cellulaire, architecture, repérage)

*Étude du 26 octobre 2026. Prolonge [04 §5](../04-connexion-reprise-reseau.md) (« le réseau en salle, risque n° 1 ») et touche [07](../07-architecture-technique.md).*

## 0. Comment lire ce document

Chaque affirmation porte une étiquette :

| Étiquette | Sens |
|-----------|------|
| **[S]** | Sourcée : une page consultée le 26/10/2026 (URL en §10). |
| **[S?]** | Sourcée par un résumé de recherche seulement (page non relue en entier) ou par une source secondaire (blog éditeur, revendeur). À recouper. |
| **[E]** | Estimation ou raisonnement de l'auteur, **non sourcé**. C'est de l'ingénierie plausible, pas un fait. |
| **[T]** | **À tester** sur le terrain avant de s'y fier (comportement de téléphones, versions d'OS). |

Limites de cette passe : les pages d'aide de Ubiquiti (help.ui.com, fiches techniques) et la
documentation Aruba ont répondu 403 ; le budget de recherche web a été épuisé avant d'avoir pu vérifier
la durée de bail DHCP recommandée, l'isolation des clients sous UniFi, la bande 6 GHz en France et les
tarifs de location événementielle. Ces points sont marqués **[E]** et listés au §9.

## 1. Synthèse (à lire si on n'a que 2 minutes)

1. **Le Wi-Fi est le plan A, pas la 4G/5G.** Les répéteurs cellulaires sont **illégaux** en France sans accord
   de l'opérateur (6 mois de prison, 30 000 €) **[S]**. On ne « répare » donc pas la couverture 4G : on apporte
   notre propre réseau.
2. **Dimensionnement : une borne pour 60 à 65 spectateurs**, soit **8 bornes + 1 de secours pour 500 places**
   (ratios publiés : 25 à 30 clients actifs par canal radio ; 50 à 100 par radio chez Ubiquiti) **[S]**.
   Bornes **câblées** (pas de mesh), canaux de 20 MHz, 2,4 GHz coupé ou réduit, anciens débits désactivés.
3. **Pas de portail captif. Jamais.** Il casse les sondes de connectivité des téléphones, la mini-fenêtre iOS
   (Captive Network Assistant) n'est pas un vrai navigateur, et l'entrée par QR en dépend **[S]/[E]** (§2.5).
4. **Le téléphone doit croire que le Wi-Fi a Internet.** Sinon Android peut refuser ou quitter le réseau
   et iOS peut basculer en cellulaire **[S]** (§2.7). Solution robuste : **donner au Wi-Fi une vraie sortie Internet**
   (même faible : un routeur 4G/5G à antenne extérieure ou la fibre de la salle). Le jeu, lui, reste local.
5. **Architecture conseillée : « local d'abord, URL unique, hybride »** : un serveur de jeu dans la salle,
   joignable (a) en local par le Wi-Fi via un DNS local qui répond la même adresse web que sur Internet, avec un vrai
   certificat HTTPS (Let's Encrypt DNS-01), et (b) depuis Internet par un tunnel sortant (Cloudflare Tunnel) si
   la salle a une sortie. Un seul serveur fait foi, pas deux états à réconcilier (§5).
6. **Il faut servir la page elle-même depuis la salle**, pas depuis GitHub Pages (sinon le Wi-Fi sans Internet ne charge rien,
   et Chrome ajoute une demande de permission réseau local) **[S]** (§5.3).
7. **Kit chiffré** (prix boutique Ubiquiti UE du 26/10/2026, TVA à vérifier) : **≈ 6 k€ pour 500 places**,
   ≈ 3,5 k€ pour 300 places (§3). La location événementielle n'a pas de tarif public trouvé : devis à demander (§3.5).
8. **Go/no-go** : on ne joue pas « avec les téléphones comme condition de réussite » sans repérage chiffré
   (§7), puis un test en salle remplie ou avec marge de 5 dB (§7.5).

## 2. Wi-Fi haute densité pour 100 à 500 téléphones

### 2.1 Nature du trafic : le débit n'est pas le problème

Le trafic de jeu est minuscule (quelques Ko par joueur et par minute, [04 §5](../04-connexion-reprise-reseau.md)).
Estimation : 500 joueurs, un message de 200 octets par seconde vers chacun ≈ 100 Ko/s, soit environ 1 Mb/s au total **[E]**.
Ce qui limite, c'est :
- le **nombre d'associations** et la **contention** (chaque téléphone qui se réveille pour un paquet occupe l'air) ;
- les **retransmissions** quand le signal est médiocre ;
- les **pics de reconnexion** (800 requêtes DHCP + TLS + WebSocket en même temps après une coupure).

La vidéo vers les téléphones change tout : 500 × 1 Mb/s = 500 Mb/s ([04 §5](../04-connexion-reprise-reseau.md)), ce qui dépasse ce qu'un
Wi-Fi à 8 bornes tient de façon fiable **[E]**. La vidéo reste sur l'écran de scène.

### 2.2 Combien de bornes

Chiffres publiés **[S]** : « environ 25 à 30 clients actifs par canal » soit souvent ~50 par borne comme point de départ
(NetSpot) ; Ubiquiti conseille de limiter chaque radio à **50 à 100 clients actifs** (5 GHz et 6 GHz comptés séparément)
et au moins une borne par 95 m² en couverture ; Purple (blog éditeur **[S?]**) retient 100 à 150 par borne. Un article
français cite « jusqu'à 400 appareils par borne » mais précise que c'est théorique ; on l'écarte.

Formule de Purple **[S?]** : bornes = places × appareils/personne × taux de connexion ÷ clients visés par radio.
Appliquée à notre cas (1,1 appareil par spectateur, 80 % qui se connectent, **50 clients par radio** par prudence, le trafic étant très léger) :

| Salle | Clients Wi-Fi attendus | Bornes (calcul) | **Bornes recommandées** (dont 1 de secours) |
|------:|-----------------------:|----------------:|---------------------------------------------:|
| 100 | ~90 | 2 | **3 + 1** |
| 200 | ~180 | 3,6 | **4 + 1** |
| 300 | ~265 | 5,3 | **6 + 1** |
| 500 | ~440 | 8,8 (5 GHz seul) ; ~6 si le 6 GHz absorbe 30 % | **8 + 1** |

Le « + 1 » est une borne de secours **en caisse**, pas en réserve allumée **[E]**. La règle de couverture
(≥ 1 borne pour 95 m²) est presque toujours dominée par la règle de capacité dans un théâtre dense.

**Placement [E]** : bornes suspendues (perche, structure scénique, bord de balcon) à 3 à 5 m, orientées vers le bas,
réparties **en cellules d'environ 60 à 65 places** : une par tranche de parterre, une par balcon/galerie, une pour
le fond. Un téléphone doit voir 2 à 3 bornes (article Solutions Review **[S?]**) sans que ça tourne au bruit. Puissance d'émission
**basse** : on veut des petites cellules (NetSpot signale la puissance trop haute comme erreur classique **[S]**).

### 2.3 Wi-Fi 6, 6E ou 7 ?

| Norme | Ce qu'elle apporte ici | Verdict |
|-------|------------------------|---------|
| Wi-Fi 6 (5 GHz) | Tous les iPhone depuis le 11 et la grande majorité des Android récents | Suffisant sur le fond. |
| Wi-Fi 6E (+ 6 GHz) | Beaucoup de canaux propres (en Europe, 24 canaux de 20 MHz) **[E]** ; seulement les téléphones récents (iPhone 15 Pro et suivants) **[E]** | Utile en **délestage** : même les téléphones 6E ne sont qu'une partie du public. |
| Wi-Fi 7 | Plus de débit crête, canaux 320 MHz inutiles ici ; les bornes Wi-Fi 7 sont de toute façon tri-bandes avec 6 GHz | On l'achète pour le 6 GHz et la durée de vie, pas pour les 320 MHz. |

Ubiquiti recommande d'ailleurs des bornes compatibles 6 GHz « en haute densité, même au-delà de ce que la couverture exige » **[S]**
(academy.ui.com). La boutique UE indique que le 6 GHz n'est activé que dans certains pays **[S]** : **[T]** vérifier la liste pour la France
avant achat et sur la borne (la réglementation française du 6 GHz en intérieur n'a pas pu être vérifiée dans cette passe).

**Constat de planification [E]** : le public réel en 2026 est surtout en 5 GHz Wi-Fi 6. Le dimensionnement du §2.2 est donc fait
**comme si le 6 GHz n'existait pas** ; ce qu'il absorbe est une marge.

### 2.4 Canaux, largeur, puissance, débits (réglages de base)

| Réglage | Valeur conseillée | Pourquoi / source |
|---------|-------------------|-------------------|
| Câblage des bornes | **Filaire Ethernet, jamais de mesh** | Le mesh consomme l'air des clients **[S]** (NetSpot) |
| Largeur 5 GHz | **20 MHz** | Plus de canaux distincts, moins d'interférences en forte densité ; NetSpot déconseille les canaux trop larges **[S]** ; Ubiquiti dit que les canaux étroits sont plus prévisibles en dense **[S]** |
| Largeur 2,4 GHz | 20 MHz, et **idéalement 2,4 GHz désactivé** sur ce réseau | Seulement 3 à 4 canaux distincts **[E]** ; tous les téléphones courants sont bi-bandes **[E]** ; on retire ainsi le plus gros consommateur d'air. Si l'on garde le 2,4 GHz (anciens téléphones), l'activer sur une borne sur deux et à faible puissance **[E]** |
| Canaux 5 GHz | 8 bornes ⇒ 8 canaux distincts. Sans DFS il n'y en a qu'environ 4 (36 à 48) plus 4 à 5 (149 à 165) **[E]**. Avec DFS (52 à 64 et 100 à 140) on monte à une quinzaine **[E]**. | UniFi désactive le DFS par défaut **[S]**. Un radar détecté force le changement de canal et déconnecte les téléphones. **Stratégie [E] :** scanner la salle au repérage ; si le DFS est « propre » le garder, sinon rester sans DFS et accepter un peu de réutilisation de canal en gardant les APs bien séparées en puissance |
| Puissance | **Basse à moyenne** (petites cellules) | NetSpot **[S]** ; dimensionner par essai |
| Débit minimal (« minimum data rate ») | Couper les débits historiques (1, 2, 5,5, 11 Mb/s) et monter le débit de base à 6 ou 12 Mb/s | Réduit l'air pris par les diffusions **[S]** (Ubiquiti : « Minimum Data Rate » raccourcit l'occupation de l'air) ; valeur précise non publiée dans les sources lues → **[T]** |
| RSSI minimum (éjection des clients lointains) | environ −75 dBm (20 MHz) à −70 dBm | Recommandation d'un guide tiers **[S?]** ; Ubiquiti dit −70 dBm pour un recouvrement de roaming **[S]**. À régler après mesure |
| Proxy ARP, filtrage multicast, bloquer le trafic de découverte | Activés | Ubiquiti cite Proxy ARP et le filtrage multicast contre la charge de diffusion **[S?]** |
| Itinérance 802.11r/k/v | Laisser les défauts, tester | Les spectateurs sont assis : le roaming compte peu **[E]** |
| Sécurité | **WPA2/WPA3 (mode mixte) avec mot de passe simple imprimé**, SSID unique sur les 3 bandes | Le 6 GHz impose WPA3 **[E]**. Mot de passe dans le QR (§2.6). Un réseau ouvert est possible mais iOS affiche un avertissement « réseau non sécurisé » et n'importe qui dans la rue peut s'y joindre **[E]** |
| SSID | Un seul, court : `SPECTACLE` (+ code du jour optionnel) | |

### 2.5 Isolation des clients, DHCP, DNS

**Isolation des clients (« client isolation »)** **[E]** : à activer, pour que les téléphones ne se voient pas entre eux (sécurité
et moins de bruit de diffusion). Le serveur de jeu doit rester joignable : règles de pare-feu autorisant « clients → serveur » (ports 443 et 53)
et « clients → passerelle » (DHCP, DNS). **[T]** à vérifier sur le contrôleur retenu : sous UniFi le réglage s'appelle « Client Device Isolation »
et son périmètre exact (le serveur câblé est-il toujours joignable ?) n'a pas pu être confirmé ici.

**DHCP** :
| Paramètre | Valeur conseillée **[E]** (aucune source lue sur ce point) |
|-----------|--------------------------------------------------------------|
| Plage | **/22** (1 022 adresses) pour 500 clients ; au minimum 2 × le public attendu, car les adresses des soirs précédents expirent mal |
| Bail | **2 à 4 heures** : plus long que l'arrivée du public + le spectacle, pour qu'aucun renouvellement n'arrive pendant le jeu ; ne pas aller à 24 h (réutilisation des adresses sur une tournée) |
| Passerelle | La passerelle de la salle (ou le serveur) |
| DNS annoncé | **Le serveur local** (résolveur dnsmasq / CoreDNS / Unbound) : c'est lui qui répond avec l'adresse locale du jeu |
| Réserver | Adresses fixes pour : serveur principal, serveur de secours, régie, bornes, écran de scène |
| Autre | Couper IPv6 sur ce réseau, ou ne servir que ce qu'on contrôle, pour ne pas avoir de réponses AAAA publiques qui contournent le DNS local **[E]** |

**DNS** : le résolveur local sert (1) le nom du spectacle (§5), (2) les réponses aux sondes de connectivité (§2.7), (3) **NXDOMAIN pour
`mask.icloud.com` et `mask-h2.icloud.com`** : c'est la méthode documentée par Apple pour qu'un réseau désactive iCloud Private Relay
(qui sinon contournerait le DNS local du réseau) **[S]**. Apple demande NXDOMAIN ou « pas de réponse sans erreur », pas de timeouts.

### 2.6 Portails captifs : pourquoi ils cassent tout

Un portail captif intercepte le trafic d'un nouveau venu jusqu'à ce qu'il valide une page. Les systèmes détectent cela par des
**sondes HTTP en clair** **[S]** (SANS ISC) :

| Système | Sonde | Réponse « tout va bien » |
|---------|-------|--------------------------|
| iOS / macOS | `http://captive.apple.com/hotspot-detect.html` | page contenant « Success » |
| Android | `http://connectivitycheck.android.com/generate_204` (aussi `www.gstatic.com`, `clients3.google.com`) | HTTP 204, corps vide |
| Windows | `http://www.msftconnecttest.com/connecttest.txt` + DNS `dns.msftncsi.com` | « Microsoft Connect Test » |
| Firefox | `http://detectportal.firefox.com/canonical.html` | 200 avec redirection meta |

Conséquences pour notre entrée par QR :

1. **Redirection de la sonde ⇒ une fenêtre « Se connecter au Wi-Fi » s'ouvre.** Sur iOS, c'est le *Captive Network Assistant* (mini-navigateur) **[S]** ;
   ce n'est pas Safari : stockage du jeton, Wake Lock, plein écran, capteurs, notifications et Service Worker ne s'y comportent pas comme dans un onglet **[E]**,
   et la fenêtre se ferme à la validation, perdant la page **[E]**. Le contrat « le jeton survit au rafraîchissement » ([04 §3](../04-connexion-reprise-reseau.md)) est mis à mal **[E]**.
2. **Sans validation, Android affiche « Se connecter » ou « Connecté, sans Internet »**, et le trafic applicatif peut passer par le cellulaire **[S?]**
   (Purple) ; l'AOSP décrit l'évitement des réseaux non validés **[S]** (§2.7).
3. **HTTPS ne peut pas être intercepté proprement** : les portails ne redirigent que le HTTP. Un `wss://` vers un site non autorisé échoue ou
   affiche une erreur de certificat **[E]**.
4. **L'alternative moderne (option DHCP 114, API RFC 8908/8910)** existe, bien suivie sur Android, **inégale sur iOS** (rapports sur iOS 15.6 et 16 :
   iOS ne demandait pas l'URI de l'option 114 à la première connexion) **[S]** (forum Apple), et supportée de façon variable côté équipements **[S?]**. Hors sujet pour nous : on ne veut pas de portail du tout.

**Règle** : Wi-Fi sans portail, sans page de conditions, sans inspection HTTPS. Ni « Accepter » ni « Se connecter ».
Si la salle impose un portail sur son propre Wi-Fi, **on n'utilise pas le Wi-Fi de la salle** : on apporte le nôtre.

### 2.7 QR code Wi-Fi et comportement « sans Internet »

**Format** **[S]** (ZXing, Wikipédia) :

```
WIFI:S:<SSID>;T:<WPA|WEP|nopass>;P:<mot de passe>;H:<true|vide>;;
```

Les caractères `\ ; , " :` sont précédés d'un antislash dans le SSID et le mot de passe. Exemple : `WIFI:S:SPECTACLE;T:WPA;P:bonsoir2026;;`.
Éviter tout caractère spécial dans le SSID et le mot de passe pour ne pas dépendre de l'échappement.

**Support** :
| Plateforme | Support du QR `WIFI:` |
|------------|-----------------------|
| iOS | L'appareil photo natif lit le QR depuis iOS 11 **[S]** ; une bannière propose de rejoindre, il faut **toucher/valider** (l'attente de l'utilisateur est que le réseau soit rejoint « après confirmation ») **[S]** (forum Apple) |
| Android | Appareil photo/Google Lens depuis Android 10 environ **[S?]** (résumés de presse). Certains anciens modèles demandent une application tierce **[S?]**. **[T]** les surcouches constructeur (Samsung, Xiaomi, Oppo) varient |
| Applications tierces | Elles n'ont pas le droit d'appeler la fenêtre native `WIFI:` d'iOS ; Apple conseille de parser soi-même et d'utiliser `NEHotspotConfigurationManager` **[S]**. Notre page web **ne peut donc pas** rejoindre un Wi-Fi à la place de l'appareil photo |

**Ce que ça implique pour le parcours d'entrée** : il y a **deux gestes distincts**, pas un seul :
1. QR n° 1 « Wi-Fi » (appareil photo ⇒ valider) ;
2. QR n° 2 « Spectacle » (URL, ouvre le navigateur).
Un QR Wi-Fi n'ouvre **pas** de page web et n'entre pas dans la représentation. Prévoir : une affiche en deux temps (« 1. Rejoins le réseau SPECTACLE, 2. Scanne le code
du spectacle »), mot de passe aussi en clair sous le QR, code de représentation à taper en secours ([04 §1](../04-connexion-reprise-reseau.md)).
Le QR Wi-Fi sur le programme ou le dossier de siège ne peut être scanné que dans la salle ; en dehors, il est inoffensif.

**Quand le Wi-Fi n'a pas Internet** : c'est le point le plus risqué **[T]**.

- **Android (AOSP)** **[S]** : un réseau jugé sans Internet reçoit un score de 0 si le téléphone est connecté à un autre réseau avec Internet
  (le 4G), et l'AOSP « évite de l'utiliser comme réseau par défaut, ce qui déclenche une bascule vers les données mobiles ». Après des échecs de validation, le BSSID peut être bloqué
  temporairement, et **le SSID peut être désactivé de façon permanente** (réactivation seulement par choix manuel de l'utilisateur) ; si l'utilisateur choisit de rester connecté, la désactivation n'est que temporaire (10 minutes de base). En
  pratique : une proportion des spectateurs Android verront « Connecté, sans Internet », répondront « Non / ne pas rester connecté », et seront renvoyés vers le 4G **[E]**.
- **iOS** : réglage « Connectivity Assist » (anciennement Wi-Fi Assist) qui utilise le cellulaire quand le Wi-Fi est lent ou inutilisable ; il peut être
  désactivé par réseau **[S]**. La page ne dit pas explicitement si un Wi-Fi sans Internet y entre ; **[T]**. Il n'est pas utilisé en itinérance internationale ni en mode données réduites **[S]**.
- **DNS** : si le téléphone envoie sa résolution de noms par le cellulaire (parce qu'il a basculé), il n'interroge **pas** notre DNS local ⇒ il obtient l'adresse publique (cloud) du nom, pas l'adresse locale **[E]**.
  C'est le piège principal de l'architecture « même URL, deux résolutions » (§5).

**Parades, par ordre de préférence** :
1. **Donner une sortie Internet réelle au Wi-Fi** (fibre de la salle, ou routeur 4G/5G avec antenne extérieure/en toiture, y compris si la couverture à l'intérieur est mauvaise). Les sondes passent, le réseau est « validé », pas de bascule. Le débit importe peu **[E]**. Cette liaison sert aussi au tunnel public et à la régie à distance. **Recommandé.**
2. **Répondre aux sondes depuis le serveur local** (DNS local pour `captive.apple.com`, `connectivitycheck.gstatic.com`, etc. + petit serveur HTTP qui renvoie `Success` / 204). Ça devrait satisfaire iOS (sondes en HTTP simple) **[S]**
   mais **ne suffit probablement pas sur Android**, dont la validation utilise aussi une sonde HTTPS (il faudrait un certificat de `google.com`) **[E]** ⇒ Android pourrait afficher un statut « partiel/limité ». **[T]** sur 4 à 5 modèles.
3. **Consigne verbale/affichée** : « Si le téléphone propose de rester connecté sans Internet : *Oui*. » En plus de 1 ou 2, jamais seule.

## 3. Matériel concret, alimentation, prix

### 3.1 Prix relevés le 26/10/2026

| Produit | Prix | Source / remarque |
|---------|-----:|-------------------|
| Ubiquiti **U7 Pro** (Wi-Fi 7, 6 flux, plafond) | à partir de **160 €** | boutique UE **[S]** |
| Ubiquiti **U7 Pro Max** (Wi-Fi 7, 8 flux, tri-bande) | **250 €** (boutique UE ; HT/TTC non précisé) ; **319 € TTC** chez un revendeur français (prix conseillé 399 €) | boutique UE **[S]**, Powerplanet FR **[S?]** ; des revendeurs listent « 500+ clients simultanés » **[S?]** |
| Ubiquiti U7 Pro XGS (8 flux, radio de scan spectral dédiée, uplink 10 GbE) | 269 € | **[S]** ; la radio de scan aide au repérage |
| Ubiquiti U7 Pro Wall / U7 Outdoor / E7 | 185 € / 185 € / 449 € | **[S]** |
| Passerelle **Cloud Gateway Ultra** | 90 € (« 300+ clients ») | **[S]** |
| Passerelle **Cloud Gateway Max** | à partir de 179 € (« 300+ clients, 30+ appareils UniFi ») | **[S]** |
| **Dream Machine SE** (UDM-SE) | 449 € (« 1 000+ clients, 100+ appareils UniFi ») | **[S]** |
| Switch **Pro Max 16 PoE** (16 × 2,5 GbE, 180 W PoE) | 359 € | **[S]** |
| Switch **Pro Max 24 PoE** (24 ports, 400 W PoE) | 739 € | **[S]** |
| Switch Lite 16 PoE (45 W de PoE seulement) | 179 € | **[S]** ; **trop faible** pour plus de 1 ou 2 bornes |
| TP-Link **Omada EAP683 UR/LR** (Wi-Fi 6, AX6000, PoE+ 802.3at) | ≈ 155 € HT / 186 € TTC (France) ; ≈ 192 € TTC (revendeur allemand) | officeeasy.fr, industry-electronics.de **[S?]** |
| TP-Link **Omada EAP670** (Wi-Fi 6, AX3000) | ≈ 188 € TTC | officeeasy.fr **[S?]** |
| TP-Link **Omada EAP783** (Wi-Fi 7 tri-bande, BE19000) | 475 € (public 830 €) à 568 € | officeeasy.fr, Bechtle **[S?]** |
| TP-Link contrôleurs OC200 / OC300 | **non trouvé** | **à chercher** |
| **Ruckus R770** (Wi-Fi 7, annoncé « jusqu'à 1 024 utilisateurs ») | **1 740 à 2 855 US$** par borne (revendeurs US) | CDW, Connection **[S?]**, abonnement Ruckus One non trouvé |
| Location événementielle Wi-Fi haute densité (France) | **aucun tarif public trouvé** | Beam (lieux événementiels, > 200 bornes) ; à demander **[S?]** |

### 3.2 Choix entre les marques

| Critère | UniFi (Ubiquiti) | Omada (TP-Link) | Ruckus |
|---------|------------------|-----------------|--------|
| Prix par borne | 160 à 270 € | 155 à 570 € | 1 500 à 2 600 € |
| Gestion | Contrôleur local (UDM, UCG), config sauvegardable, application | Contrôleur logiciel ou matériel | Ruckus One / Unleashed |
| Haute densité | Guides publics ; 50 à 100 clients/radio ; scan spectral (XGS) | Pas de source lue sur ce point | Réputation haute densité ; coût élevé |
| Adapté à une tournée de ~10 bornes | **Oui** : prix, poids, config clonable | Oui | Non (budget) sauf location/intégrateur pour très grandes salles |
| Risque | 6 GHz selon pays ; fiches techniques inaccessibles ici | À vérifier : contrôleur matériel | Coût, abonnement |

**Choix [E]** : UniFi, car c'est le meilleur compromis prix/contrôle pour un kit de tournée et le plus documenté publiquement sur la haute densité ;
Omada est une alternative crédible moins chère ; Ruckus se loue plutôt que de s'acheter.

### 3.3 Alimentation (PoE) et câblage

- Les bornes se branchent **en PoE**. L'ordre de grandeur d'une borne Wi-Fi 7 tri-bande est **20 à 25 W** à pleine charge ; les revendeurs listent « PoE+ » (802.3at, 30 W max côté switch)
  pour la U7 Pro Max **[S?]** ; la fiche technique officielle n'a pas pu être lue ⇒ **[T]**.
- **Budget PoE** : 8 bornes × 25 W (pire cas) = **200 W** ⇒ le switch **Pro Max 16 PoE (180 W) est juste insuffisant** pour 8 bornes au pire cas ;
  le **Pro Max 24 PoE (400 W)** convient et laisse de la marge **[E]**. Pour 6 bornes : 150 W ⇒ le 16 ports/180 W suffit.
- Câbles **Cat6 de 20 à 50 m** pré-sertis, étiquetés au numéro de borne (jamais plus de 90 m en tout) **[E]**. Chemin de câbles et passe-câbles selon les règles de sécurité du lieu (ERP) : à valider
  avec le régisseur et le responsable sécurité **[E]**. Fixation des bornes en hauteur : accord du lieu.
- **Onduleur (UPS)** 1 000 à 1 500 VA pour passerelle + serveur(s) **[E]** ; les bornes et le switch sur le même circuit électrique que la régie, jamais sur celui des projecteurs (parasites, délestage).

### 3.4 Kits chiffrés (prix boutique UE, hors TVA incertaine)

**Kit A, 500 places (recommandé)**

| Poste | Qté | Prix unitaire | Total |
|-------|----:|--------------:|------:|
| UniFi U7 Pro Max (8 en jeu + 1 de secours) | 9 | 250 € | 2 250 € |
| UniFi Dream Machine SE (DHCP/pare-feu/contrôleur, 1 000+ clients) | 1 | 449 € | 449 € |
| Switch Pro Max 24 PoE (400 W) | 1 | 739 € | 739 € |
| **Sous-total réseau (sourcé)** | | | **3 438 €** |
| Serveur de jeu local + serveur de secours identique (mini-PC) **[E]** | 2 | 500 € | 1 000 € |
| Routeur 4G/5G avec antenne extérieure, forfait inclus **[E]** | 1 | 400 € | 400 € |
| Câbles Cat6 étiquetés, passe-câbles **[E]** | – | – | 300 € |
| Fixations, pieds/perches, colliers **[E]** | – | – | 300 € |
| Onduleur 1 000–1 500 VA **[E]** | 1 | 250 € | 250 € |
| Valise de transport / rack roulant **[E]** | 1 | 250 € | 250 € |
| **Total estimé** | | | **≈ 5 940 €** (≈ 7 000 € avec +20 % pour prix France/TVA) |

**Kit B, 300 places**

| Poste | Qté | Total |
|-------|----:|------:|
| U7 Pro (6 + 1 de secours) | 7 × 160 € | 1 120 € |
| Cloud Gateway Max (300+ clients) | 179 € | 179 € |
| Switch Pro Max 16 PoE (180 W) | 359 € | 359 € |
| Sous-total sourcé | | 1 658 € |
| Un mini-PC serveur + ordinateur de régie en secours, routeur 4G/5G, câbles, supports, onduleur, valise **[E]** | | ≈ 1 800 € |
| **Total estimé** | | **≈ 3 500 €** |

**Kit C, 100 à 150 places** : 3 bornes + 1 de secours (4 × U7 Pro = 640 €), Cloud Gateway Ultra (90 €), Pro Max 16 PoE (359 €) ≈ **1 100 € + ~1 200 € d'accessoires**.
*Pourquoi pas le Lite 16 PoE à 179 € ? Son budget PoE de 45 W ne nourrit qu'une ou deux bornes (§3.1).*

### 3.5 Location ou achat ?

- Aucun tarif public trouvé en France pour la location de Wi-Fi événementiel haute densité. Demander des devis (prestataires de lieux comme Beam,
  intégrateurs réseaux évènementiels) avec : nombre de places, plan de salle, durée, pas de portail captif, serveur local hébergé, installation et dépose, présence technique pendant le spectacle.
- **Règle [E]** : au-delà d'environ **6 représentations par an**, l'achat d'un kit A (≈ 6 k€) devient plus économique qu'une location récurrente à plusieurs centaines d'euros par soir ; en deçà, ou pour une salle
  de plus de 800 places, louer à un intégrateur.

### 3.6 Mise en place rapide en tournée **[E]**

1. **Pré-configurer** : site UniFi complet sauvegardé (SSID, canaux, DHCP, DNS, règles de pare-feu, isolation) ; chaque borne adoptée, **numérotée et étiquetée** avec le câble correspondant.
2. **Plan d'accrochage type** par jauge (schéma de 8 positions) à reporter sur le plan de la salle.
3. **Équipe de 2** : ≈ 2 heures de pose, ≈ 1 heure de réglage et de test **[E, à vérifier en vrai]**.
4. **Un seul geste de config** : importer la sauvegarde, puis ajuster canaux et puissance selon le scan de la salle.
5. **Fiche de mise en route** de 1 page (ordre de branchement, adresses, mot de passe, qui appeler).
6. **Dépose** : même ordre inverse, comptage des bornes et des câbles.

## 4. Couverture cellulaire en salle

### 4.1 Légalité des répéteurs

**[S]** (ANFR, ARCEP) : les fréquences mobiles (700 MHz à 3,5 GHz, 2G à 5G) sont attribuées à chaque opérateur sur une base **exclusive**.
Installer et utiliser un répéteur ou amplificateur GSM/UMTS/LTE de sa propre initiative, **sans l'accord des opérateurs concernés, est une infraction**
(art. L.39-1 du CPCE, jusqu'à **6 mois de prison et 30 000 €** d'amende ; l'ANFR cite aussi des frais d'intervention de 450 €).
Raison technique : un répéteur non supervisé peut brouiller le réseau sur une grande zone. L'ANFR et l'ARCEP renvoient vers les opérateurs ; l'ANFR cite les
**systèmes d'antennes distribuées (DAS)** installés par les opérateurs et le **Wi-Fi calling / SMS** comme solutions sans accord préalable.
Acheter un répéteur est permis, l'utiliser ne l'est pas.

**Décision** : **jamais de répéteur** dans le kit. Si un lieu en possède un, le demander à l'opérateur ou au lieu comme DAS officiel (c'est lui qui assume).
Pas d'attente de solution cellulaire pour le spectacle : voir §5.

### 4.2 Mesurer la couverture cellulaire (pour information, pas pour décider du réseau)

Outils **[E]** : application de mesure type *Network Cell Info* / *Cellular-Z* (Android), mode Field Test d'iOS, test de débit/latence (nPerf, Speedtest) ;
mesurer **les 3 opérateurs principaux** (SIM de test) à 5 à 8 points : hall, parterre, balcon, fond. Rapporter RSRP (4G) ou SS-RSRP (5G) et débit.
Interprétation : **si les 3 opérateurs donnent un débit descendant ≥ 5 Mb/s et une latence < 100 ms partout**, la voie « tout Internet » (cloud, §5.1) est possible comme option **secondaire** ;
sinon, le cellulaire n'est qu'un plus. Le tunnel sortant du §5.3 se contente d'une liaison faible.

## 5. Architectures et mode dégradé

### 5.1 Comparaison

| | A. Tout Internet (cloud) | B. Serveur local + Wi-Fi local | C. **Hybride, URL unique** (recommandé) |
|---|---|---|---|
| Principe | Les téléphones joignent un serveur cloud par 4G/5G ou Wi-Fi de la salle avec Internet | Un serveur dans la salle, Wi-Fi isolé sans Internet | Serveur local qui fait foi ; la même adresse web est résolue localement dans la salle et par un tunnel depuis Internet |
| Dépend de la couverture 4G ? | **Oui, entièrement** (le risque n° 1) | Non | Non (sauf pour ceux qui restent en 4G) |
| Dépend d'Internet en salle ? | Oui | Non, **mais** voir « validation » §2.7 | Idéalement une sortie faible ; sans elle on retombe sur B |
| Latence | 50 à 300 ms variables | quelques ms | quelques ms en local |
| Complexité | Faible | Moyenne (DNS, certificat, matériel) | Moyenne à élevée |
| Panne du serveur | Cloud : redondance simple | Local : il faut un serveur de secours | Idem B, plus un chemin d'Internet |
| Écran de scène, régie | Via Internet | Locaux, très fiables | Locaux |
| Verdict | Seulement quand la salle a une excellente 4G **et** un bon Wi-Fi public (mesuré) | Très bon, mais fragile aux « sans Internet » | **Conseillée** |

### 5.2 Architecture conseillée

```
                           Internet (si sortie disponible)
                                      │
                       ┌──────────────┴────────────────┐
                       │ routeur 4G/5G ou fibre salle   │  ← donne le « vrai Internet » au Wi-Fi
                       └──────────────┬────────────────┘
                                      │
                         ┌────────────┴───────────┐
                         │ passerelle (DHCP/pare-feu)│
                         └────────────┬───────────┘
                                      │
              ┌───────────────────────┼─────────────────────────┐
         switch PoE               serveur local              serveur secours
           │ │ │ │                 (DNS + web + wss             (même image,
         8 bornes Wi-Fi             + journal)                  répliqué)
           │                          │  ▲
       téléphones ──────────────────► │  │ tunnel sortant (cloudflared)
     (SPECTACLE)  même URL, DNS local │  └──────────► Cloudflare ──► téléphones en 4G / régie distante
```

Principes :
1. **Une adresse unique pour le public** : `https://spectacle.<domaine>/?r=K7Q2` (domaine du studio, pas `github.io`).
2. **Dans la salle** : le DNS local répond l'adresse du serveur de la salle. **Hors de la salle** : le DNS public pointe vers le tunnel (Cloudflare Tunnel) qui aboutit au **même** serveur de la salle.
   Donc **un seul serveur d'état**, pas de réplication entre cloud et local.
3. **Mode « tout cloud » conservé comme secours de dernier niveau** (le serveur sur un VPS) : on bascule l'enregistrement DNS public en cas de salle sans énergie ou panne totale.
4. Le Wi-Fi a un **vrai Internet faible** si possible (§2.7), sinon on est en B et il faut tester le comportement des téléphones.

### 5.3 Pourquoi servir la page depuis la salle (impact sur 04/07)

- Si l'entrée reste `github.io` (page statique), un Wi-Fi sans Internet ne charge pas la page ; or c'est le cas à éviter **[E]**.
- **Chrome** a introduit une permission « accès au réseau local » : une page publique qui appelle une adresse privée
  (192.168.x.x, 10.x, nom `.local`) déclenche une invite ; elle est prévue dans Chrome 142 ; elle couvre `fetch()` et sous-ressources ; les WebSockets n'étaient pas encore couverts à Chrome 138 mais prévus **[S]**.
  Un nom public qui résout vers une adresse privée n'est pas exempté du contrôle de contenu mixte **[S]**. Conséquence : une **page servie par la même origine que le WebSocket** (la salle) évite ce chemin **[E]**.
- **HTTPS obligatoire** : le Wake Lock **[S]** et la demande de permission des capteurs de mouvement sur iOS **[S]** n'existent que dans un contexte sécurisé ; et `ws://` depuis une page HTTPS est bloqué comme contenu mixte **[S]**. On ne peut pas se contenter de `http://192.168.x.x` : on veut un **vrai certificat** sur le nom public.
- **PWA / Service Worker** : une fois la page chargée une fois (avant le spectacle, dans le hall), la coque de l'application peut être mise en cache et se recharger sans réseau **[E]** ; cela protège les rafraîchissements accidentels pendant une coupure.

### 5.4 HTTPS pour un serveur local : options

| Option | Comment | Verdict |
|--------|---------|---------|
| **Let's Encrypt DNS-01 + domaine à soi** | Un certificat (même **joker** `*.spectacle.<domaine>`) validé par un enregistrement TXT `_acme-challenge` ; marche pour un serveur non joignable depuis Internet **[S]**. Valide 90 jours, à renouveler tous les 60 jours **[S]** (option 6 jours existe). | **Recommandé.** Émettre sur une machine connectée **la veille**, copier clé + certificat sur les serveurs. Prévoir des identifiants DNS à portée limitée **[S]**. Attention : propagation DNS parfois longue **[S]** |
| **Cloudflare Tunnel** | `cloudflared` établit des connexions **sortantes** seulement ; aucune IP publique requise **[S]** ; le proxy Cloudflare supporte les WebSockets (réglage à activer), ferme les connexions inactives et peut en couper pendant ses mises à jour, d'où ping/pong et reconnexion **[S]** | **Recommandé pour l'accès Internet** (régie distante, spectateurs restés en 4G). Ne sert **pas** les téléphones en Wi-Fi local sans Internet |
| **Tailscale Funnel** | Expose un service en public, mais uniquement sur des noms du tailnet `*.ts.net`, ports **443, 8443, 10000**, TLS obligatoire, **bande passante limitée non configurable**, certificats gérés par Tailscale **[S]** | Bien pour **tester** et la régie distante ; **pas** pour 500 spectateurs (pas de nom de domaine à soi, limites opaques). Aucun mot sur les WebSockets dans la doc **[S]** ⇒ **[T]** |
| Certificat autosigné / autorité privée | Installer une CA sur chaque téléphone | **Non** : impossible à grande échelle |
| `http://IP` | Pas de certificat | **Non** : plus de Wake Lock, capteurs iOS, etc. (voir ci-dessus) |

### 5.5 DNS : split horizon, concrètement

- Domaine public `studio.example` (à choisir) : `spectacle.studio.example` → **CNAME vers le tunnel** (public).
- Sur le réseau de la salle : le résolveur local répond **`spectacle.studio.example` → 10.42.0.10** (serveur).
- Même certificat des deux côtés. Les téléphones ne voient pas la différence.
- **Piège** : un téléphone qui a basculé en cellulaire (§2.7) résout par le public ⇒ il atteint le serveur via le tunnel, ce qui marche **si** la salle a une sortie et si cette 4G est correcte ; sinon, il ne joue pas.
- **Autre variante** [E] : enregistrement DNS **public** `local.spectacle.studio.example → 10.42.0.10` (adresse privée). Ça marche sans DNS local si le téléphone a un DNS public joignable, mais certains routeurs filtrent les réponses publiques vers des adresses privées (protection contre le « DNS rebinding ») **[E]** ; pas de DNS local = pas de maîtrise ; on garde le DNS local.

### 5.6 Échelle de dégradation

| Niveau | Situation | Ce qui se passe | Action |
|--------|-----------|-----------------|--------|
| N0 | Nominal | Local + sortie Internet + tunnel | – |
| N1 | Sortie Internet perdue | Le Wi-Fi reste local ; les sondes échouent ⇒ certains téléphones affichent « sans Internet » ; les connexions WebSocket **déjà ouvertes** continuent **[T]** | Rien d'obligatoire ; informer la régie du nombre de joueurs en baisse |
| N2 | Serveur principal en panne | Les téléphones se reconnectent (reprise [04 §3](../04-connexion-reprise-reseau.md)) | Basculer vers le **serveur de secours** local (même IP via changement de DNS local ou IP flottante) en moins de 60 s ; le journal est répliqué ([03 §8](../03-moteur-scenario.md)) |
| N3 | Wi-Fi saturé ou en panne | Les joueurs s'éteignent ; règles « 100 % des présents » les excluent, délai max pour passer ([04 §5](../04-connexion-reprise-reseau.md)) | Le spectacle continue sans les téléphones ; message sur l'écran de scène ; bouton panique |
| N4 | Panne électrique | Onduleur ⇒ serveur + passerelle quelques minutes | Arrêt propre ; le spectacle est celui du plateau |

**Règle [E]** : le déroulé scénique doit rester jouable à N3 et N4 (principe 5 du README).

## 6. Impacts sur les documents existants (à reporter par l'équipe, rien n'est modifié ici)

- [04 §1](../04-connexion-reprise-reseau.md) : le parcours « QR → page `github.io` » devient « QR → page du **domaine du studio** servie par le serveur de la salle ».
  Ajouter l'étape QR n° 1 (Wi-Fi) avant le QR n° 2 (spectacle) (§2.7).
- [04 §5](../04-connexion-reprise-reseau.md) : « serveur joignable à la fois par Internet et par Wi-Fi local » devient la règle C du §5 de cette étude ; ajouter « Wi-Fi avec vraie sortie Internet ».
- [07](../07-architecture-technique.md) : GitHub Pages reste pour l'éditeur/régie et pour les démos, **pas** pour la page spectateur en salle.
- Ajouter à la page « banc d'essai » : test de reconnexion après coupure de 10 s, indication « le réseau dit : sans Internet ? », temps de chargement, RTT WebSocket.

## 7. Protocole de repérage d'une salle avant spectacle

### 7.1 Outils

| Besoin | Outil |
|--------|-------|
| Plan et heatmap Wi-Fi | NetSpot (relevés signal, bruit, SNR, cartes de chaleur **[S]**) ou équivalent (Ekahau, WiFi Explorer, application d'analyse Wi-Fi Android) |
| Environnement radio (canaux voisins, radars DFS) | Scan RF des bornes UniFi ; U7 Pro XGS à radio de scan dédiée **[S]** |
| Test de débit local | iperf3 entre un portable en Wi-Fi et le serveur câblé **[E]** |
| Test de ce qu'on construit | **La page « banc d'essai »** du studio : ouvrir sur ≥ 20 téléphones, RTT WebSocket, perte de messages, temps de reconnexion ([04 §5](../04-connexion-reprise-reseau.md)) |
| Charge | 300 à 500 bots WebSocket + 20 téléphones réels pendant 15 minutes ([07](../07-architecture-technique.md)) |
| Cellulaire | Application de mesure + SIM des 3 opérateurs (§4.2) |
| Parc de téléphones d'essai | 1 iPhone ancien (iOS bas de gamme supporté), 1 iPhone récent (6E/7), 1 Samsung, 1 Android d'entrée de gamme, 1 Xiaomi/Oppo **[E]** |

### 7.2 Combien de points de mesure

**[E]** Une maille de **5 à 6 m** dans les zones de public, plus les points critiques :

| Zone | Points |
|------|-------:|
| Parterre (rangées avant, milieu, fond, côtés) | 9 à 12 |
| Chaque balcon/galerie (avant, milieu, fond) | 3 à 4 par niveau |
| Loges, strapontins, places extrêmes (derrière un pilier, sous un balcon) | 3 à 6 |
| Hall d'accueil (le QR est scanné là, donc le Wi-Fi + le chargement initial) | 2 |
| Régie et plateau (câbles, écran de scène) | 2 |
| **Total** | **≈ 20 à 30 points pour 500 places** (≈ 12 pour 150 places) |

À chaque point : signal (RSSI), bruit, SNR, canaux voisins vus, **RTT WebSocket (moyenne, p95), perte, rechargement de page, reconnexion** avec 2 téléphones d'essai.

### 7.3 Pré-repérage (à distance, 1 à 2 semaines avant)

- [ ] Plan de la salle coté (jauge, niveaux, matériaux : béton, rideaux, balcons) ; photos de plafond et accès.
- [ ] Le lieu a-t-il son Wi-Fi ? Qui le gère ? Portail captif ? (si oui : on n'utilise pas, §2.6)
- [ ] Accès Internet disponible (fibre, ports, IP, quelle sortie pour le routeur dédié) ; sinon : où poser l'antenne 4G/5G.
- [ ] Puissance électrique et circuit disponibles pour le kit, **onduleur autorisé** ?
- [ ] Possibilité d'accrocher des bornes en hauteur, parcours des câbles, règles ERP, qui valide.
- [ ] Accord du lieu pour de la radio (bornes, SSID visible) et pour les horaires d'installation.
- [ ] Dates de répétition/générale où l'on peut tester **avec du public**.
- [ ] Couverture cellulaire : mesure à distance impossible ; prévoir sur place (§4.2).

### 7.4 Jour de repérage (salle vide, 2 à 3 heures)

1. **Scan RF** : canaux 2,4/5/6 GHz utilisés, voisins, radars DFS ⇒ choix de plan de canaux (§2.4).
2. **Pose des bornes** à leurs positions prévues (provisoirement, avec le vrai kit).
3. **Parcours des 20 à 30 points** (§7.2), avec 2 téléphones d'essai de modèles différents.
4. **Test des sondes** : sur iOS et Android, rejoindre avec le QR Wi-Fi, noter ce qu'affiche le téléphone (« sans Internet », invite « rester connecté ? »), si le téléphone **reste** sur le Wi-Fi 10 minutes, et si la page se charge **avec le 4G allumé** (§2.7).
5. **Test DNS** : la page se charge via le nom public en Wi-Fi local ; test sur un téléphone en 4G seul via le tunnel ; vérifier Private Relay désactivé (NXDOMAIN) **[S]**.
6. **Test de coupure** : débrancher la sortie Internet, puis le serveur principal ⇒ mesurer le temps de reprise (N1, N2).
7. **Test de charge** : 300 à 500 bots + 20 téléphones, 15 minutes ⇒ perte, p95.
8. **Test de portée « mauvaise place »** : le pire siège (fond sous balcon, derrière pilier).
9. **Test de reprise** : verrouiller 10 s, rafraîchir, changer d'application ⇒ retour au bon état ([04 §3](../04-connexion-reprise-reseau.md)).

### 7.5 Critères go / no-go **[E]**

Seuils proposés, à affiner avec les premières salles ; marge de **5 dB** pour la salle remplie (les corps absorbent le signal) **[E]**.

| Critère | GO | GO avec réserve | NO-GO (réseau) |
|---------|----|-----------------|----------------|
| RSSI 5 GHz aux points de public | ≥ −65 dBm sur ≥ 95 % des points, jamais < −70 dBm | ≥ −70 dBm sur ≥ 90 % | > 10 % des points sous −72 dBm |
| SNR | ≥ 25 dB | 20 à 25 dB sur ≤ 10 % des points | < 20 dB sur > 10 % |
| RTT WebSocket local | p95 < 100 ms, p99 < 300 ms | p95 100 à 200 ms | p95 > 200 ms |
| Perte de messages | < 0,5 % | < 2 % | ≥ 2 % |
| Reconnexion après coupure 10 s | < 3 s pour ≥ 95 % | < 6 s | ≥ 6 s ou échecs |
| Test de charge 500 bots + 20 téléphones, 15 min | aucune déconnexion non expliquée | quelques-unes, récupérées seules | pertes durables |
| « Sans Internet » : rester connecté 10 min | 100 % des modèles testés restent | invite à valider mais restent | un modèle majeur quitte le Wi-Fi |
| Téléphones d'essai | tous OK | 1 modèle de bas de gamme défaillant | plusieurs OK→KO |
| Plan de repli | N2 et N3 testés | N3 testé | non testé |

**Décision** :
- **GO** : mécaniques téléphone actives comme prévu.
- **GO avec réserve** : le spectacle reste **jouable sans le téléphone d'une partie du public** (mécaniques en « bonus », scénario avec repli défini au niveau du point d'arrêt).
- **NO-GO** : ajouter des bornes/déplacer, ou le spectacle se joue **sans dépendance téléphone** (écran de scène et régie seulement) ; ne pas improviser le jour J.

**Test final avec public** (générale) : mêmes mesures avec les spectateurs, comparaison avec la salle vide ; si l'écart dépasse 5 dB, ajouter une borne de secours.

## 8. Checklist de repérage (version imprimable)

**Avant**
- [ ] Plan, jauge, niveaux, photos ; matériaux ; hauteur sous plafond
- [ ] Wi-Fi du lieu : existe ? portail captif ? (si oui, on utilise le nôtre)
- [ ] Sortie Internet disponible pour le routeur du kit (fibre / emplacement antenne 4G/5G)
- [ ] Électricité : circuit dédié, onduleur autorisé
- [ ] Accroche des bornes, passage de câbles, règles ERP, interlocuteur sécurité
- [ ] Domaine du studio à jour ; certificat Let's Encrypt (DNS-01) émis < 60 jours avant ; copié sur serveurs principal et de secours
- [ ] Sauvegarde de la config réseau importée ; bornes numérotées ; câbles étiquetés
- [ ] Parc de 5 téléphones d'essai chargés ; bots de charge prêts

**Sur place, salle vide**
- [ ] Scan RF, plan de canaux validé (DFS oui/non)
- [ ] Bornes en place, puissance réglée, 2,4 GHz désactivé ou réduit, débits historiques coupés
- [ ] SSID `SPECTACLE`, QR Wi-Fi imprimé et scanné sur iOS **et** Android
- [ ] DHCP /22, bail 2 à 4 h, DNS annoncé = serveur local, NXDOMAIN Private Relay
- [ ] Parcours des 20 à 30 points : RSSI, SNR, RTT, perte, reconnexion
- [ ] Tests « sans Internet », DNS local vs public, 4G allumée, 10 minutes de maintien
- [ ] Test de coupure (sortie Internet, serveur principal), basculement < 60 s
- [ ] Test de charge 500 bots + 20 téléphones, 15 min
- [ ] Pire siège testé ; hall testé (chargement initial)
- [ ] Décision go / réserve / no-go consignée avec captures

**Jour J**
- [ ] Relire les adresses ; test de bout en bout avec 2 téléphones avant l'ouverture des portes
- [ ] Compteur « inscrits / présents » en régie ; seuil d'alerte à −20 % de présents
- [ ] Affiche en deux temps (QR Wi-Fi puis QR spectacle) + code à taper
- [ ] Une personne désignée pour l'assistance Wi-Fi à l'accueil
- [ ] Bornes et câbles de secours à portée de main

## 9. Questions ouvertes (à traiter avec l'équipe)

1. **Tests téléphones** : comportement réel des Wi-Fi sans Internet (iOS 17 à 19, Android 12 à 16, Samsung, Xiaomi) : est-ce qu'ils restent, basculent, demandent ? **C'est le test le plus important.**
2. **Réglementation 6 GHz en France** (intérieur seulement ? liste des pays de l'application Ubiquiti) : non vérifiée ici.
3. **Durée de bail DHCP et isolation des clients** sous UniFi : conseils non sourcés (§2.5), à confirmer par essai.
4. **Fiches techniques officielles** (consommation en watts, nombre de clients) des bornes retenues : 403 sur help.ui.com.
5. **Tarifs de location** événementielle en France : à obtenir par devis.
6. **Tarif des contrôleurs Omada et des licences Ruckus One** : non trouvés.
7. **Web** : les WebSockets sont-ils soumis à la permission « réseau local » de Chrome (récent) ? Impact limité si la page et le WebSocket viennent de la même origine.
8. **Domaine** : choisir un domaine du studio pour `spectacle.<domaine>` et son fournisseur DNS (API requise pour DNS-01).
9. **Durée de vie des certificats** : surveiller toute annonce de raccourcissement de la durée de validité chez Let's Encrypt (la FAQ lue indique 90 jours, avec option de 6 jours).

## 10. Sources (consultées le 26/10/2026)

**Wi-Fi haute densité**
- NetSpot, déploiement Wi-Fi pour événements : <https://www.netspotapp.com/blog/wifi-deployment/event-wifi-deployment.html> **[lue]**
- Ubiquiti Academy, Fundamentals of UniFi WiFi design : <https://academy.ui.com/topics/fundamentals-of-unifi-wifi-design> **[lue]**
- UniHosted, Minimum Data Rate Control : <https://www.unihosted.com/blog/unifi-minimum-data-rate-control> **[lue]**
- UniHosted, Minimum RSSI : <https://unihosted.com/blog/unifi-minimum-rssi> *(résumé de recherche)*
- Purple, High-density Wi-Fi : <https://www.purple.ai/blogs/high-density-wifi> *(résumé de recherche)*
- Solutions Review, top practices WLAN haute densité : <https://solutionsreview.com/wireless-network/top-practices-designing-wlan-high-density-environments/> *(résumé de recherche)*
- Journal du Net, Wi-Fi pour un événement : <https://www.journaldunet.com/solutions/mobilite/deployer-un-reseau-wifi-pour-un-evenement.shtml> *(résumé de recherche)*
- Aruba, Large Public Venues (403) : <https://arubanetworking.hpe.com/techdocs/aos/wifi-design-deploy/design-guides/lpv/design-fundamentals/>

**QR code Wi-Fi, sondes, portails captifs, comportement sans Internet**
- ZXing, Barcode Contents (format `WIFI:`) : <https://github.com/zxing/zxing/wiki/Barcode-Contents> **[lue]**
- Wikipédia, QR code (Wi-Fi network login) : <https://en.wikipedia.org/wiki/QR_code> **[lue en partie]**
- Apple Developer Forums, rejoindre un Wi-Fi depuis un QR : <https://developer.apple.com/forums/thread/97060> **[lue]**
- Neowin, QR Wi-Fi sur Android 10 : <https://www.neowin.net/news/android-10-how-to-easily-share-wi-fi-networks-using-qr-code/> *(résumé de recherche, page en 403)*
- SANS ISC, Captive Portal Detection : <https://isc.sans.edu/diary/Captive%20Portal%20Detection/33172> **[lue]**
- Purple, détection de portail captif (CNA, Android) : <https://www.purple.ai/guides/captive-portal-detection-cna-android-ncsi> *(résumé de recherche)*
- AOSP, Wi-Fi network selection (évitement des réseaux non validés) : <https://source.android.com/docs/core/connect/wifi-network-selection> **[lue]**
- Apple, Connectivity Assist : <https://support.apple.com/en-us/127686> **[lue]**
- Apple, hôtes et ports pour les réseaux d'entreprise (`captive.apple.com`) : <https://support.apple.com/en-us/101555> **[lue]**
- Apple Developer Forums, DHCP Option 114 : <https://developer.apple.com/forums/thread/712120> **[lue]**
- pfSense, support de l'API RFC 8908 : <https://redmine.pfsense.org/issues/15904> *(résumé de recherche)*
- Apple, préparer son réseau pour iCloud Private Relay : <https://developer.apple.com/support/prepare-your-network-for-icloud-private-relay/> **[lue]**

**Matériel et prix**
- Boutique Ubiquiti UE, Wi-Fi : <https://eu.store.ui.com/eu/en/category/all-wifi> ; U7 Pro Max : <https://eu.store.ui.com/eu/en/pro/category/all-wifi/products/u7-pro-max> **[lues]**
- Boutique Ubiquiti UE, switches : <https://eu.store.ui.com/eu/en/category/all-switching> **[lue]** ; passerelles : <https://eu.store.ui.com/eu/en/category/all-cloud-gateways> **[lue]**
- Powerplanet (revendeur FR), U7 Pro Max : <https://www.powerplanetonline.com/fr/ubiquiti-unifi-u7-pro-max-wifi7> *(résumé de recherche)*
- CDW, U7 Pro Max (« 500+ clients », PoE+) : <https://www.cdw.com/product/ubiquiti-unifi-u7-pro-max-wireless-access-point-wi-fi-7/7957900> *(résumé de recherche, page en 403)*
- OfficeEasy.fr, TP-Link EAP783 : <https://www.officeeasy.fr/tp-link-eap783-access-point-wi-fi-7-tri-band-be19000.html> ; EAP670/683 : <https://www.officeeasy.fr/tp-link?p=4> *(résumés de recherche)*
- Industry-Electronics, EAP683 LR : <https://industry-electronics.de/tp-link/eap683-lr-wireless-ap-wifi6-ax6000-4x4-indoor-2.5-gbe-eap683lr-omada-druckansicht-2119220.htm> *(résumé de recherche)*
- CDW, Ruckus R770 : <https://www.cdwg.com/product/ruckus-r770-indoor-access-point/8343586> *(résumé de recherche)*
- Beam (lieux événementiels, Wi-Fi) : <https://www.beam.fr/nos-services/audiovisuel-numerique> *(résumé de recherche)*

**Cellulaire et réglementation**
- ANFR, répéteur de téléphonie mobile non autorisé : <https://www.anfr.fr/controler/sources-possibles/repeteur-de-telephonie-mobile-non-autorise> **[lue]**
- ARCEP, brouilleurs et répéteurs de réseaux mobiles (mise à jour 7/12/2020) : <https://www.arcep.fr/la-regulation/grands-dossiers-reseaux-mobiles/les-brouilleurs-et-repeteurs-de-reseaux-mobiles.html> **[lue]**

**Web, HTTPS, architecture**
- Chrome, Local Network Access : <https://developer.chrome.com/blog/local-network-access> **[lue]**
- MDN, Mixed content : <https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content> **[lue]**
- MDN, Screen Wake Lock API : <https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API> **[lue]**
- MDN, DeviceMotionEvent.requestPermission : <https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/requestPermission_static> **[lue]**
- Let's Encrypt, types de défis (DNS-01) : <https://letsencrypt.org/docs/challenge-types/> **[lue]** ; FAQ (durée de validité) : <https://letsencrypt.org/docs/faq/> **[lue]**
- Cloudflare Tunnel : <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/> **[lue]** ; WebSockets : <https://developers.cloudflare.com/network/websockets/> **[lue]**
- Tailscale Funnel : <https://tailscale.com/kb/1223/funnel> **[lue]**
