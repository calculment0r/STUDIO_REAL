# Rapports du banc d'essai (P0.1) sur vrais téléphones

Chaque rapport JSON copié depuis le [banc d'essai](https://calculment0r.github.io/STUDIO_REAL/prototypes/banc-essai/)
est rangé ici sous la forme `AAAA-MM-JJ-<appareil>-<navigateur>.json`. Ce tableau compile ce qu'on a appris.

## Appareils testés

| Date | Appareil | OS | Navigateur | Rapport |
|------|----------|----|-----------|---------|
| 26/10/2026 | iPhone (écran 320×693 @3x) | iOS 18.7.8 | Chrome iOS 155 (moteur WebKit, donc comme Safari) | [2026-10-26-iphone-ios18-chrome.json](2026-10-26-iphone-ios18-chrome.json) |

## Ce que l'iPhone a appris (26/10)

| Capacité | Résultat | Conséquence |
|----------|----------|-------------|
| **Lampe torche** | ✅ **marche** (confirmé à l'œil, 3 commandes, caméra arrière) | Contredit nos études, qui la donnaient ❌/❓ sur iPhone. La torche devient un effet utilisable sur iOS 18, à condition d'avoir la permission caméra. |
| **Son malgré le mode silencieux** | ✅ `audioSession.type = "playback"` accepté, et le bip est entendu | Le contournement du bouton silencieux fonctionne. À poser au « Toucher pour entrer ». |
| Son `<audio>`, Web Audio | ✅ (latence de sortie 17,9 ms) | — |
| Synthèse vocale | ✅ 20 voix françaises | — |
| **Vibration** | ❌ API absente | Confirmé : pas de vibration sur iPhone. |
| **Astuce haptique `switch`** | ❌ attribut reconnu, mais aucun tic ressenti | On abandonne ce repli. |
| Plein écran, verrouillage d'orientation | ❌ | Confirmé (seule la PWA donne le plein écran). |
| Wake Lock | ✅ | — |
| **Micro** | ❌ `InvalidStateError : AudioSession category is not compatible with audio capture` | **Bug d'ordre, pas une limite** : la session audio était restée en `playback`. **Règle : repasser en `play-and-record` avant d'ouvrir le micro.** Le banc est corrigé (v0.1.1) ; à retester. |
| Caméra | ✅ 720×1280, 30 i/s, 4 caméras | — |
| Accéléromètre | ✅ 40 évén./s, permission accordée, secousse nette (40 m/s²) | — |
| Orientation, boussole | ✅ `webkitCompassHeading` | — |
| **Clavier** | ✅ mesuré : clavier 378 px, `innerHeight` 634→532, **`visualViewport.offsetTop` jusqu'à 259 px** | iOS fait défiler la page à l'ouverture du clavier. Il faut la recette `visualViewport` de `docs/etudes/clavier-viewport.md` ; le prototype clavier doit être réaligné. |
| **Arrière-plan** | 13,8 s hors de la page, **minuteurs gelés 12,4 s** | Confirmé : la page est gelée dès qu'elle est masquée. Il faut une reprise par instantané au retour. |
| WebSocket | ✅ connexion 304 ms, aller-retour médian 79 ms (serveur d'écho public) | Ordre de grandeur pour la synchro d'horloge. |
| Notifications | ❌ API absente (onglet, pas PWA) | Confirmé. |
| Géolocalisation | refusée par l'utilisateur | Non testée. |
| Batterie, NFC | ❌ | Confirmé. |

## À tester ensuite
- Un iPhone en **Safari** (pas Chrome), et un iPhone récent sous iOS 26.
- Plusieurs **Android** : Chrome, Samsung Internet, Firefox.
- Les **navigateurs intégrés** : ouvrir le QR depuis Instagram et depuis l'appareil photo natif.
- Le **micro** sur iPhone, avec le banc v0.1.1.
- Relancer le banc le lendemain sur le même téléphone, pour tester la persistance du stockage.
