# Étude — Interactions capteurs, son, haptique, lumière, UX de participation

*Date : 26 octobre 2026. Complète [02 — Capacités du téléphone](../02-capacites-telephone.md) et fournit une fiche de faisabilité pour chaque mécanique concernée de [08 — Catalogue](../08-catalogue-mecaniques.md).*

## 0. Comment lire ce document

**Niveaux de confiance.** Chaque affirmation importante porte une marque :

- **[S]** : établie par une source consultée pour cette étude (URL en section 9).
- **[G]** : connaissance générale de l'auteur, non vérifiée par une source ce jour. **À confirmer au banc d'essai** (voir section 8).
- **[?]** : sources contradictoires ou incertaines, à trancher sur appareil réel.

**Limite de la recherche.** Le budget de recherches web de la session a été épuisé avant d'avoir pu vérifier quelques points secondaires (latences de sortie typiques des Android, comportement exact de l'événement `interrupted` sur iOS, recommandations d'associations d'épilepsie sur les événements en salle). Ils sont marqués [G]. Les versions d'iOS citées (26.4, 26.5, 27) viennent de rapports tiers et de bugs WebKit ouverts en 2026 : à re-tester sur de vrais iPhone.

### Verdicts, en résumé

| Sujet | Verdict | À retenir |
|---|---|---|
| Secousse (jauge, course d'équipes) | **Faisable** | Énergie du signal sans gravité, indépendante du signe des axes ; envoi agrégé à 2-5 Hz ; bouton à marteler en repli |
| Inclinaison | **Faisable** avec calibrage | Calibrer la position neutre ; éviter la verticale stricte (blocage de cardan) |
| Boussole en salle | **Non** en absolu | Remplacer par un pointage **relatif** calibré sur la scène |
| Son synchronisé | **Faisable** à ±20-40 ms, **avec** conditions | Horloge serveur + `AudioContext` + latence de sortie ; pas de Bluetooth ; contourner le bouton silencieux iOS ; sons tolérants à la gigue |
| Micro (applaudimètre) | **Avec repli** | iOS dégrade la lecture audio quand le micro est ouvert (bugs WebKit 2026) ; préférer un micro de salle ou des taps |
| Vibration | **Android seulement** | iOS : aucune vibration pilotable par le serveur ; repli visuel + sonore |
| Lumière / mosaïque / vague | **Faisable** | On diffuse un *programme*, pas des ordres téléphone par téléphone ; garde-fou photosensibilité obligatoire |
| Lampe torche | **Avec repli** (Android seulement, optionnel) | Écran blanc par défaut |

---

## 1. Capteurs

### 1.1 Permissions, échantillonnage réel, agrégation

**Permissions.** `DeviceMotionEvent.requestPermission()` et `DeviceOrientationEvent.requestPermission()` existent sur iOS et doivent être appelés **dans un geste utilisateur** ; il faut tester `typeof ... === "function"` car Android n'en a pas [S: MDN]. Le même geste d'entrée (« Toucher pour entrer ») doit donc enchaîner : reprise de l'`AudioContext`, permission de mouvement, Wake Lock. Le micro, la caméra et les notifications sont demandés **plus tard, au moment où une scène en a besoin** (section 6).

**Fréquence réelle.** Ne jamais supposer une fréquence.
- Chrome plafonne l'API historique `DeviceOrientation` autour de **60 Hz** [S: issue w3c/sensors #98].
- Safari iOS émettait ~20 Hz en 2015 ; un correctif visait 60 Hz [S: WebKit 145814], mais le débit final actuel n'est pas documenté : **à mesurer** [?].
- `DeviceMotionEvent.interval` donne la période du matériel en millisecondes [S: MDN]. Il faut en plus mesurer le delta réel avec `performance.now()` (les événements peuvent arriver par paquets, un onglet en économie d'énergie peut ralentir).
- Règle : tous les filtres sont écrits en fonction de `dt` mesuré (constante de temps en ms), jamais « par échantillon ».

**Agrégation côté téléphone** (déjà posée en principe dans le doc 02) :

| Donnée | Traitement local | Envoi |
|---|---|---|
| Secousse | énergie RMS sur 200 ms + détection de « coups » | 1 octet (0-255) à 2-5 Hz, **seulement quand la scène est armée** |
| Inclinaison | passe-bas (τ ≈ 150 ms), zone morte, normalisation -1..1 | 1 octet signé à 5 Hz, seulement si changement ≥ 2 % |
| Micro | RMS en dB relatifs au calme mesuré | 1 octet à 5 Hz |
| Rythme | liste d'instants de taps/pics convertis en temps serveur | un message toutes les 2 s : `{bpm, régularité, n}` |

Ordre de grandeur [G, calcul de l'auteur] : 300 téléphones × 5 msg/s = 1 500 msg/s. Le serveur le supporte sans peine ; c'est la **contention du Wi-Fi de salle** (nombre de paquets, pas le débit) qui limite. Défaut conseillé : **2-4 Hz**, envoi sur changement, capteurs **arrêtés** hors des scènes qui les utilisent (batterie, réseau). Le serveur renvoie aux téléphones l'agrégat à 2 Hz maximum (retour visuel) et à l'écran de scène à 10-20 Hz.

### 1.2 Détection de secousse

**Principe.** On mesure l'énergie du mouvement **sans la gravité** et on ignore la direction.

- Source des données : `event.acceleration` (accélération linéaire, gravité retirée par le système) quand elle est non nulle ; sinon `accelerationIncludingGravity` avec un filtre passe-haut maison. Les deux existent sur iOS et Android [S: MDN].
- **Signe des axes.** La spécification place `z = +9,81` pour un téléphone à plat écran vers le haut ; Chrome Android suit la spécification, **Safari iOS a historiquement renvoyé le signe inverse** (y compris sur x) [S: fil public-geolocation, W3C, 2014 ; MDN avertit que Firefox et Chrome ne gèrent pas les axes de la même façon]. Dans ce document, la secousse n'utilise que la **norme** du vecteur : le signe n'a aucune importance. Pour l'inclinaison, on calibre (1.3) au lieu de deviner la plateforme.
- **Unités.** Mètres par seconde carré (m/s²) selon la spécification [S: MDN]. Par prudence, le code ci-dessous détecte les « g » : si la norme moyenne de la première seconde est < 3, c'est du g (valeur de repos ≈ 1) et on multiplie par 9,81.
- **Seuils de départ.** Un tutoriel courant place le repos à ~9,8 (norme brute) et déclenche à ~15 avec 1 s d'anti-rebond [S: slicker.me]. Pour la norme **sans gravité**, valeurs de départ [G] : repos/tremblement de main 0,1-0,5 m/s² ; marche 1-3 ; secousse volontaire 8-25+ ; seuil de « coup » 7 m/s².
- **Fréquence humaine.** Une secousse vigoureuse dépasse rarement 6-8 coups/s [G] : espacer les pics d'au moins 70 ms et plafonner côté serveur.

```js
// shake.js — énergie de secousse, indépendante des axes, des signes et de l'unité
export function createShakeDetector({
  onFrame,                  // ({energy, peak}) toutes les windowMs : RMS et pic, en m/s² sans gravité
  onShake,                  // ({strength}) quand >= minPeaks coups dans peaksWindowMs
  windowMs = 200, tauMs = 300, peakThreshold = 7, minPeaks = 3,
  peaksWindowMs = 1000, minPeakGapMs = 70, cooldownMs = 600,
} = {}) {
  let lp = null, tPrev = 0, unit = 1, nUnit = 0, sumUnit = 0;
  let m1 = 0, m2 = 0, lastPeakT = 0, lastShake = 0, peaks = [];
  let win = { s2: 0, n: 0, peak: 0, t0: 0 };

  return function onMotion(e) {
    const t = performance.now();
    const dt = tPrev ? t - tPrev : 16; tPrev = t;
    const g = e.accelerationIncludingGravity; if (!g || g.x == null) return;
    const lin = e.acceleration && e.acceleration.x != null ? e.acceleration : null;

    // 1) unité : g ou m/s² ? (moyenne de la norme sur ~1 s)
    if (nUnit < 60) { sumUnit += Math.hypot(g.x, g.y, g.z); if (++nUnit === 60) unit = sumUnit / 60 < 3 ? 9.81 : 1; }

    // 2) accélération sans gravité : linéaire du système, sinon passe-haut (gravité = passe-bas, constante de temps tauMs)
    let hp;
    if (lin) hp = Math.hypot(lin.x, lin.y, lin.z) * unit;
    else {
      const x = g.x * unit, y = g.y * unit, z = g.z * unit, k = dt / (tauMs + dt);
      if (!lp) lp = [x, y, z];
      lp[0] += k * (x - lp[0]); lp[1] += k * (y - lp[1]); lp[2] += k * (z - lp[2]);
      hp = Math.hypot(x - lp[0], y - lp[1], z - lp[2]);
    }

    // 3) énergie par fenêtre (pour les jauges)
    if (!win.t0) win.t0 = t;
    win.s2 += hp * hp; win.n++; win.peak = Math.max(win.peak, hp);
    if (t - win.t0 >= windowMs) { onFrame?.({ energy: Math.sqrt(win.s2 / win.n), peak: win.peak }); win = { s2: 0, n: 0, peak: 0, t0: t }; }

    // 4) « coups » : maxima locaux de |hp| au-dessus du seuil, espacés d'au moins minPeakGapMs
    if (m1 > peakThreshold && m1 >= m2 && m1 > hp && t - lastPeakT > minPeakGapMs) { lastPeakT = t; peaks.push({ t, v: m1 }); }
    m2 = m1; m1 = hp;
    peaks = peaks.filter(p => t - p.t < peaksWindowMs);
    if (peaks.length >= minPeaks && t - lastShake > cooldownMs) {
      onShake?.({ strength: peaks.reduce((a, p) => a + p.v, 0) / peaks.length }); lastShake = t; peaks = [];
    }
  };
}
// usage : window.addEventListener('devicemotion', createShakeDetector({ onFrame: f => send(Math.min(255, f.energy * 10)) }));
```

**Anti-triche et équité** (côté serveur) : plafonner l'énergie par joueur (≈ 25 m/s² RMS), rejeter > 8 coups/s, pondérer par le nombre de joueurs capables dans l'équipe (voir fiche 14).

### 1.3 Inclinaison et orientation fiable

- Angles de `deviceorientation` : `alpha` 0-360, `beta` -180..180, `gamma` -90..90 [S: MDN]. Ce sont des **angles d'Euler** : près de `beta = ±90°` (téléphone tenu vertical comme pour filmer, ou pointé vers le plafond), `alpha` et `gamma` deviennent instables (**blocage de cardan**) [G, propriété mathématique connue].
- **Inclinaison gauche/droite** (jeux de pilotage) : deux options robustes.
  1. Utiliser `gamma` tant que le téléphone reste entre 20° et 80° de `beta` (posture de lecture normale).
  2. Utiliser le vecteur gravité (passe-bas de `accelerationIncludingGravity`), **calibré** : on demande « tenez votre téléphone comme pour lire », on moyenne 1 s pour obtenir `g_ref`, puis on mesure l'angle entre `g` courant et `g_ref` dans le plan de l'écran. Le calibrage supprime la question du signe iOS/Android et le défaut de posture de chacun.
- **Rotation d'écran** : on ne peut pas verrouiller l'orientation sur iPhone [doc 02]. Les capteurs sont dans le repère de l'appareil, donc la mesure n'est pas affectée ; seul l'affichage peut basculer. Demander dans le tutoriel de désactiver le verrouillage de rotation inverse, ou concevoir l'écran pour qu'il reste lisible dans les deux sens.
- **Zone morte et plage** conseillées [G] : zone morte ± 5°, plage utile ± 30° ramenée à -1..1, passe-bas τ ≈ 150 ms, envoi 5 Hz.
- **Quaternions.** Chrome Android propose `AbsoluteOrientationSensor`/`RelativeOrientationSensor` (quaternions, pas de cardan) mais pas Safari [G] : on reste sur `deviceorientation` et on convertit en vecteurs (ci-dessous) plutôt que de raisonner en angles.

**Direction pointée sans cardan** : on calcule où pointe le **haut du téléphone** (comme une télécommande), ce qui ne dépend pas de `gamma` :

```js
// Direction du bord haut du téléphone, repère Terre (x=est, y=nord, z=haut), convention W3C Z-X'-Y''
function topEdge({ alpha, beta }) {
  const a = alpha * Math.PI / 180, b = beta * Math.PI / 180;
  const east = -Math.sin(a) * Math.cos(b), north = Math.cos(a) * Math.cos(b), up = Math.sin(b);
  return { bearing: (Math.atan2(east, north) * 180 / Math.PI + 360) % 360,   // cap, degrés
           elevation: Math.asin(up) * 180 / Math.PI };                       // = beta
}
```

### 1.4 Boussole en intérieur

- iOS expose `webkitCompassHeading` et `webkitCompassAccuracy` (non standard ; l'exactitude annoncée est typiquement de ±10°) [S: MDN]. Android expose l'orientation absolue via l'événement `deviceorientationabsolute` [S: MDN]. Chrome/Firefox Android dérivent l'orientation de la boussole magnétique et y sont **vulnérables aux perturbations magnétiques** [S: fil W3C 2014, ancien].
- Une salle de spectacle réunit tout ce que la boussole supporte mal : structure métallique, haut-parleurs (aimants), projecteurs, 300 autres téléphones [G]. **Conclusion : la boussole absolue n'est pas fiable en salle** (Non), et sa précision varie d'un modèle à l'autre.
- **Solution recommandée : pointage relatif calibré.** Demander « pointez la scène, touchez l'écran » ; on enregistre `alpha0` (ou le cap relatif) puis on mesure l'écart. La fusion gyroscope/accéléromètre est stable sur quelques minutes [G] ; on recalibre au début de chaque scène de pointage. Les caps sont ensuite exprimés par rapport à la scène, ce qui est de toute façon le référentiel utile.
- À conserver : `webkitCompassAccuracy` et un test d'écart-type du cap sur 2 s comme indicateur de qualité, pour éliminer les téléphones instables du vote.

### 1.5 « Téléphone levé » et « téléphone posé »

Heuristiques [G], à calibrer sur le banc d'essai :

- **Posé** : norme sans gravité < 0,15 m/s² pendant 2 s **et** `|beta| < 15°` (à plat) ou écran vers le bas (`z` brut proche de -g au sens spec) → plusieurs états : « face dessus », « face dessous ».
- **Levé / présenté vers la scène** : `beta` entre 65° et 110°, variance de `beta` < 5° sur 1 s, et un mouvement ascendant précédent (pic d'énergie 0,3-1,5 s plus tôt). Distinguer de la posture de lecture (`beta` 30-60°).
- Utile pour : constellation (« levez vos téléphones »), mosaïque, détection de lassitude (la salle a baissé ses bras), économie de batterie (téléphone posé → effets plus doux).

### 1.6 Comptage de rythme

Deux sources : **taps** (`pointerdown`, `event.timeStamp`) ou **pics de secousse** (section 1.2).

1. Garder les 8 derniers instants ; intervalles `IOI[i]`.
2. `BPM = 60000 / médiane(IOI)` ; régularité = écart-type / médiane (< 0,15 = « en rythme »).
3. Pour noter la justesse par rapport à la musique de scène : convertir chaque instant en temps serveur (section 3.1) et comparer à la grille de battues ; tolérance à partir de ±80 ms [G] car le toucher mobile ajoute une latence de 20-60 ms [G].
4. Pour limiter la latence, utiliser `pointerdown`, `touch-action: manipulation` (supprime le délai de double tap), pas de `click`.

### 1.7 Niveau du micro

```js
// Niveau sonore relatif (dB au-dessus du calme mesuré) — aucune connexion à destination (pas de larsen)
const stream = await navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
const an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0;  // 1024 éch. ≈ 21 ms à 48 kHz
ctx.createMediaStreamSource(stream).connect(an);
const buf = new Float32Array(an.fftSize);
setInterval(() => {
  an.getFloatTimeDomainData(buf);                       // [S: MDN AnalyserNode]
  let s = 0; for (const v of buf) s += v * v;
  const db = 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-8);
  report(db - baselineDb);                              // baselineDb = médiane des 2 premières secondes
}, 200);
```

Points d'attention :
- Couper antiécho, réduction de bruit et gain automatique : ils lissent exactement ce que l'on veut mesurer [G]. **Mais** sur iOS, désactiver l'antiécho a un effet de bord grave (ci-dessous).
- On ne peut pas obtenir de dB SPL absolus (micros et gains différents) : on travaille en **relatif au calme**, puis on prend la **médiane ou la moyenne tronquée** sur toute la salle (robuste aux téléphones dans les poches).
- **iPhone : lecture audio dégradée quand le micro est ouvert.** WebKit 311451 (avril 2026, iOS 26.4) : qualité de lecture dégradée (taux d'échantillonnage réduit, stéréo en mono) tant que le micro est actif, avec ou sans `echoCancellation:false`. WebKit 326286 (octobre 2026, iOS 27) : avec antiécho actif, craquements sur toute la sortie, qui **persistent après libération du micro jusqu'à la fermeture de Safari** ; avec antiécho désactivé, la sortie bascule sur l'écouteur à bas volume [S: bugs WebKit]. **Règle : ne jamais lire de son pendant que le micro est ouvert sur iPhone ; appeler `track.stop()` dès la mesure finie ; faire du micro une capacité facultative (opt-in), avec les taps en repli.**
- Un seul micro de salle relié à la régie est plus fiable que 300 micros de poche [G] : privilégier cette option quand elle existe.

---

## 2. Fiabilité des capteurs par plateforme (synthèse)

| Point | Android (Chrome) | iPhone (Safari) | Conséquence |
|---|---|---|---|
| Permission mouvement | automatique | explicite, geste, [?] refus durable jusqu'aux réglages | écran de pré-explication, chemin de reprise |
| Signe des axes | conforme à la spec | inversé historiquement [S] | norme pour la secousse, calibrage pour l'inclinaison |
| Fréquence | ~60 Hz max [S] | à mesurer [?] | filtres en fonction de `dt` |
| Alpha / cap | relatif ; absolu via `deviceorientationabsolute` | relatif ; absolu via `webkitCompassHeading` | pointage relatif calibré |
| Micro + son | aucun problème signalé | dégradation de lecture [S] | pas de son pendant le micro |
| Wake Lock | oui | oui (Safari 16.4+) ; bug en PWA corrigé en 18.4-18.5 [?] | tester la PWA installée |

---

## 3. Son synchronisé multi-téléphones

### 3.1 Horloge partagée (la base de tout)

Synchroniser des téléphones, c'est d'abord leur donner **la même horloge de référence** (le serveur), puis y ancrer l'horloge audio. Les projets de l'IRCAM (Soundworks) le font par un service de synchronisation d'horloge dédié [S: Nü Soundworks] ; la bibliothèque `@ircam/sync` implémente un ping/pong WebSocket et conseille de convertir en temps local **au dernier moment** pour minimiser la dérive [S: npm].

```js
// Horloge partagée : serverNow() = performance.now() + offset (millisecondes serveur)
let offset = 0;
async function syncClock(ping, rounds = 8) {              // ping() -> temps serveur (ms) mesuré à la réception
  const s = [];
  for (let i = 0; i < rounds; i++) {
    const t0 = performance.now(), ts = await ping(), t1 = performance.now();
    s.push({ rtt: t1 - t0, off: ts - (t0 + t1) / 2 });    // hypothèse : trajets aller et retour symétriques
    await new Promise(r => setTimeout(r, 100 + Math.random() * 100));
  }
  s.sort((a, b) => a.rtt - b.rtt);                         // les meilleurs RTT sont les moins biaisés
  const best = s.slice(0, 3).map(x => x.off).sort((a, b) => a - b);
  offset = best[1];                                        // médiane des 3 meilleurs
}
const serverNow = () => performance.now() + offset;       // monotone, contrairement à Date.now()
// Relancer toutes les 30-60 s et à chaque reprise (visibilitychange) ; ignorer une série dont le meilleur RTT dépasse ~300 ms.
```

**Précision réaliste** [G] : ±5-30 ms sur un Wi-Fi de salle (l'asymétrie aller/retour est l'erreur principale). C'est suffisant (voir 3.5), à condition que **le serveur envoie les ordres en avance** : chaque effet sonore est ordonné « à T serveur » avec un délai d'avance de **1,5 à 3 s** (p99 du réseau de salle + marge). Sans avance, il n'y a pas de synchronisation, seulement du « au plus tôt ».

### 3.2 Ordonnancement avec Web Audio

Principe : les événements `start()` planifiés sur l'horloge audio sont exécutés par le fil audio et restent précis même si le fil principal est occupé ; il ne faut **pas** s'appuyer sur `setTimeout` pour déclencher le son lui-même [S: web.dev, « A tale of two clocks »]. Le schéma conseillé : une boucle `setTimeout` (~25 ms) qui planifie ce qui tombe dans une courte fenêtre d'avance (~100 ms, à augmenter sur machine lente ou latence système élevée) [S: web.dev].

Pour des téléphones, il faut un pont **temps serveur → temps du contexte audio tel que le haut-parleur le restitue**. `getOutputTimestamp()` renvoie `contextTime` (échantillon actuellement rendu par le périphérique de sortie) et `performanceTime` (équivalent `performance.now()`) [S: MDN] ; `outputLatency` est l'estimation du délai entre la remise du tampon au système et le traitement du premier échantillon, qui dépend de la plateforme et du matériel [S: MDN, spec Web Audio]. `outputLatency` est disponible dans Chrome 102, Firefox 70, Safari 18.4 [S: web.dev] (donc iOS 18.4 au minimum).

```js
// audio-sync.js — déclencher un son à un instant serveur
let ctx, master;
export async function unlockAudio() {             // À APPELER DANS le handler du bouton « Entrer »
  if ('audioSession' in navigator) navigator.audioSession.type = 'playback';   // ignore le bouton silencieux iOS [S, voir 3.4]
  ctx ??= new AudioContext({ latencyHint: 'interactive' });
  if (!master) { master = ctx.createGain(); master.connect(ctx.destination); }
  await ctx.resume();
  const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); s.connect(ctx.destination); s.start(0); // amorce silencieuse
}

// Temps serveur (ms) -> temps du contexte (s) auquel l'échantillon SORT du haut-parleur
export function ctxTimeForServerMs(serverMs) {
  const perfMs = serverMs - offset;                                    // horloge locale
  const ts = ctx.getOutputTimestamp?.();
  if (ts && ts.performanceTime > 0 && Math.abs(ts.contextTime - ctx.currentTime) < 0.5)   // garde-fou (Safari ancien : valeurs aberrantes signalées)
    return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
  const lat = ctx.outputLatency || ctx.baseLatency || 0;               // repli
  return ctx.currentTime + (perfMs - performance.now()) / 1000 - lat;
}

export function playAtServerMs(buffer, serverMs, { gain = 1, loop = false, maxLateMs = 120 } = {}) {
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buffer; src.loop = loop; g.gain.value = gain; src.connect(g).connect(master);
  const T = ctxTimeForServerMs(serverMs), now = ctx.currentTime;
  if (T >= now) src.start(T);
  else {                                                               // en retard : « entrer » dans le son pour rester en phase
    const late = now - T;
    if (!loop && late * 1000 > maxLateMs) return null;                 // ponctuel trop tard : on saute
    src.start(0, loop ? late % buffer.duration : late);
  }
  return src;
}

// Séquence : boucle « deux horloges », la correspondance serveur/audio est recalculée à chaque tour (corrige la dérive)
export function runSequence(events, { tickMs = 25, lookaheadMs = 200 } = {}) {   // events triés : {t: ms serveur, buffer, gain}
  let i = 0;
  const id = setInterval(() => {
    const horizon = serverNow() + lookaheadMs;
    while (i < events.length && events[i].t <= horizon) { const e = events[i++]; playAtServerMs(e.buffer, e.t, { gain: e.gain }); }
    if (i >= events.length) clearInterval(id);
  }, tickMs);
  return () => clearInterval(id);
}
```

Remarques :
- Si l'on utilise `getOutputTimestamp`, on ne retranche **pas** `outputLatency` en plus (la mesure inclut déjà la sortie) ; on ne retranche que dans le repli [G, raisonnement sur la spec].
- Les minuteries sont limitées en arrière-plan : l'onglet doit rester visible (Wake Lock), sinon l'ordre est perdu [S: doc 02].
- Une **valeur d'étalonnage par modèle** (en ms) peut s'ajouter, apprise en répétition (plusieurs téléphones enregistrés par un même micro).

### 3.3 Latence de sortie, Bluetooth, plateformes

- Android : un appareil déclarant `android.hardware.audio.low_latency` s'engage à ≤ 45 ms de latence de sortie continue ; `audio.pro` à 20 ms aller-retour [S: developer.android.com]. Tous les modèles ne sont pas « low latency » : une grande partie du parc milieu/bas de gamme a davantage [G]. Les tailles de tampon typiques vont de 96 à 512 images ; les contextes tournent à 44,1 ou 48 kHz [S: Android].
- iOS : tous les contextes de test publiés sont à 48 kHz [S: WebKit 326286] ; la latence est en général faible et stable [G].
- **Bluetooth** : à bannir pour le son synchronisé. Mesures RTINGS : SBC ≈ 173 ms, aptX ≈ 166 ms, aptX Low Latency ≈ 34 ms ; Apple ne prend pas aptX, donc SBC/AAC [S: RTINGS, NextPit]. Le navigateur ne connaît pas toujours cette latence : `outputLatency` est une *estimation* qui peut être sous-évaluée [G]. Conséquence : consigne explicite au tutoriel (« débranchez vos écouteurs, le son sort du téléphone ») et alerte si `outputLatency > 0,08 s`.
- Un test de latence automatique n'est pas possible en JavaScript pur sans boucle micro ; le banc d'essai (section 8) mesure par enregistrement.

### 3.4 Débloquer l'audio, mode silencieux, interruptions

- **Geste obligatoire** : un son lancé hors événement utilisateur est soumis aux règles de lecture automatique [S: MDN Autoplay]. Créer/reprendre l'`AudioContext` dans le geste d'entrée.
- **Bouton silencieux iOS** : par défaut, le Web Audio est traité comme « ambient » (se mélange aux autres sons) et respecte donc le bouton silencieux ; la lecture média ignore ce bouton [S: WebKit 264473 et fil associé ; adactio]. Contournement : `navigator.audioSession.type = 'playback'` (API Audio Session) [S: MDN, marquée expérimentale et à disponibilité limitée ; WebKit]. Compromis : le type `playback` interrompt les autres sons du téléphone (musique en fond) [S: WebKit]. Pour les iPhone plus anciens, une bibliothèque comme `unmute` joue un son HTML silencieux pour que le Web Audio passe outre [S: GitHub swevans/unmute].
- **Interruptions** : le contexte peut passer `suspended` (verrouillage, appel, autre appli) ou `interrupted` (état défini dans la spécification Web Audio ; interruptions système) [S: spec]. Écouter `ctx.onstatechange`, `audioSession.onstatechange` et `visibilitychange` : à la reprise, relancer `ctx.resume()` sur le premier toucher et afficher « Touchez pour réactiver le son ». Remonter l'état `audio:suspended` à la régie (télémétrie du doc 02).
- **Volume** : aucune API pour lire ou régler le volume système. Parades : (1) test sonore dans le tutoriel avec bouton « Je l'entends / je n'entends rien » ; (2) fichiers normalisés (par exemple -16 LUFS [G]) + `GainNode` ; (3) consigne « volume aux 3/4 » ; (4) liste des « sans son » visible dans la régie, qui bascule sur la variante visuelle.

### 3.5 Quelle précision vise-t-on ?

- **Physique** : le son voyage à ~343 m/s [S: physique] ; 10 m = 29 ms, une salle de 30 m de profondeur = 87 ms d'étalement naturel entre la scène et le fond. Chercher mieux que ±20 ms entre téléphones est donc sans objet pour des spectateurs répartis dans la salle.
- **Perception** [G] : deux sons de même attaque sont perçus comme un seul geste en dessous de ~20-30 ms ; en musique en ensemble, une gigue de 30-50 ms donne un effet de « chœur » naturel. Pour son + lumière, les seuils de détection de l'ITU-R BT.1359 tolèrent environ +45 ms (son en avance) à -125 ms (son en retard).
- **Cible conseillée** : ±30 ms entre téléphones, ±50 ms entre le son des téléphones et la lumière de scène, avec des sons conçus pour **tolérer la gigue** : attaques lentes (≥ 100-150 ms), nappes, voyelles tenues, glissandi ; éviter les unissons percussifs rapides. Ne pas promettre un métronome collectif à la milliseconde.

### 3.6 Préchargement et formats

- **Tout précharger à l'entrée** (ou au tutoriel) : le Wi-Fi de salle est le point faible, et le projet *Musique Concrète Choir* a décidé de charger toutes les ressources sonores sur les téléphones en avance, avec cache par Service Worker, après des pannes de serveur lors de la Web Audio Conference de 2015 [S: Georgia Tech]. Ne jamais diffuser du son en flux pendant la représentation.
- Format : AAC/M4A (lisible partout) ou MP3 ; Opus selon support [G]. Mono pour les sons ponctuels.
- **Budget mémoire** [G, calcul] : un `AudioBuffer` décodé coûte ~192 Ko/s en mono et ~384 Ko/s en stéréo à 48 kHz (flottants 32 bits), soit ~23 Mo par minute de stéréo. Viser **≤ 40-60 Mo de sons décodés** par téléphone (≈ 2 min de stéréo ou 4 min de mono) ; pour les plages plus longues, utiliser un `<audio>` (moins précis, ±50-100 ms [G]).
- Garder les ressources dans l'IndexedDB/Cache Storage, avec une version versionnée dans le scénario ; télémétrie « sons chargés : n/n ».

### 3.7 Haut-parleurs de téléphone

[G sauf mention] Utilisable ≈ **300 Hz - 8 kHz** ; chute nette sous 200 Hz sur les mesures de téléphones (ex. une mesure de test montre la chute sous 200 Hz et un pic vers 3 kHz [S: Notebookcheck, source faible]). Conséquences de conception :
- Pas de basses ni de sub : éviter les fondamentales < 220 Hz (La3). Pour une voix de basse, écrire en octave haute ou compter sur les harmoniques.
- Timbres riches en médiums (voix, cloche, bois, synthés avec harmoniques) ; chuchotements et voix « téléphone » parfaitement adaptés.
- Un téléphone en poche perd 10-20 dB ; face à la cuisse, davantage. Volume fortement variable d'un modèle à l'autre → ne jamais bâtir un effet sur un équilibre fin entre téléphones.
- Un seul haut-parleur (mono) : pas de stéréo ; la spatialisation vient des *positions* des téléphones.

### 3.8 Projets de référence (chœurs et concerts distribués)

| Projet | Ce qu'on en retient | Source |
|---|---|---|
| **Soundworks / CoSiMa (IRCAM)** : *Drops*, *Collective Loops* | Phones comme haut-parleurs et instruments ; ~60 joueurs à la première démonstration ; séquenceur à 8 pas réparti entre les téléphones | cosima.ircam.fr |
| **Nü Soundworks** (WAC 2017) | Cadre JS avec **service de synchronisation d'horloge** et chargement de fichiers ; parfois emballé en Cordova pour Bluetooth et micro | QMUL |
| **Chloé × Ircam** (Nuit Blanche 2015) | Public connecté à un Wi-Fi local, positions sur une carte de la salle, sons répartis par position | cosima.ircam.fr |
| **Musique Concrète Choir** (Georgia Tech) | Précharger tous les sons, cache Service Worker, pannes serveur à 2015 | repository.gatech.edu |
| **SmartVox** (J. Bell) | Partitions et pistes distribuées sur les téléphones des chanteurs, synchro d'un petit ensemble sur Wi-Fi | NIME 2019 |
| *Constellation* (Princeton), *Michigan Mobile Phone Ensemble* | Téléphones comme haut-parleurs/contrôleurs, rôles différents par section | recherches |

**Leçons pour STUDIO_REAL** : serveur local ou très proche, tout préchargé, horloge partagée explicite, rôles par zone, expérimenter à plus grande échelle que 60 (le projet cible ~300 ; les publications consultées ne donnent pas de mesures de précision, **c'est une inconnue à lever en répétition**).

---

## 4. Haptique

### 4.1 Android (Vibration API)

- `navigator.vibrate(motif)` : un entier (ms) ou un tableau alternant **vibrer / pause**, en commençant par vibrer ; `vibrate(0)` annule [S: MDN].
- La spécification exige une **activation utilisateur persistante** (« sticky activation ») et une page **visible** ; sinon l'appel retourne `false`. La vibration est interrompue quand la page passe en arrière-plan. La spécification prévoit aussi un plafond de débit global, et au minimum 10 entrées de motif et 10 000 ms par durée [S: W3C Vibration]. Garder ≤ 10 entrées et enchaîner par minuterie ; certains moteurs acceptent plus [?].
- Pas de contrôle d'amplitude. Les bibliothèques d'haptique web simulent l'intensité par **modulation en largeur d'impulsion** (rapport vibrer/pause) [G, d'après la description d'une bibliothèque] ; le rendu dépend du moteur : LRA haut de gamme, ERM plus lents, appareils d'entrée de gamme faibles voire muets [S: mintlify.wiki web-haptics].
- Durées utiles [G] : impulsion minimale perceptible 15-25 ms (ERM : latence de démarrage 20-50 ms) ; éviter > 1,5 s continu (agaçant, batterie) ; pauses ≥ 40 ms pour que deux impulsions soient distinctes.

**Motifs expressifs** (durées en ms) [G, à ajuster sur appareils] :

| Nom | Motif | Usage |
|---|---|---|
| `tap` | `[15]` | confirmation d'un geste |
| `battement(bpm)` | `[50, 90, 70, P-210]`, `P = 60000/bpm` | cœur : « lub-dub », relancé à chaque battement par la minuterie serveur |
| `alerte` | `[200, 100, 200, 100, 200]` | danger, notification |
| `pulsation lente` | `[300, 700]` en boucle | respiration, attente |
| `montée` | `[10, 90, 20, 80, 40, 60, 70, 30, 100]` | tension qui monte (intensité simulée par le rapport) |
| `morse(texte)` | point 80, trait 240, pause intra 80, entre lettres 240 | message codé |

Le **déclenchement** doit passer par la même planification serveur que le son (section 3), avec une avance d'étalonnage de 20-50 ms [G] pour compenser le démarrage du moteur. Mais personne ne sent la vibration des voisins : la synchronisation fine n'a d'importance que **par rapport à la scène** (±80 ms suffisent pour un cœur qui bat).

### 4.2 iPhone : alternatives

- `navigator.vibrate` n'existe pas ou ne produit rien sur Safari iOS [S: sources concordantes 2026 ; une ancienne remarque contraire dans un ticket MDN non reproduite [?]].
- **Astuce de la case `switch`** : une `<input type="checkbox" switch>` produit un retour haptique natif au basculement (Safari 17.4, comportement présent dès iOS 18.0). WebKit a corrigé le 3 janvier 2025 le fait de pouvoir le déclencher sans geste (bug 285120 : il faut une activation utilisateur) [S: WebKit]. Des bibliothèques rapportent que l'astuce fonctionne d'iOS 17.4 à 26.4 et que **Apple l'aurait supprimée en iOS 26.5** [S: README ios-haptics ; une seule famille de sources, non confirmée par une note de version Apple [?]]. **Décision de conception : sur iPhone, l'haptique pilotée par le serveur est « Non » ; l'haptique en réponse à un toucher du spectateur est « peut-être, non garanti ».**
- **Repli standard** (déjà noté dans doc 02) : pulsation d'écran **douce** (voir 5.2, variation de luminance < 10 % pour ne pas compter comme flash) + « tic » sonore court à large bande (les haut-parleurs ne rendent pas les basses, un « thump » grave n'aurait aucun effet).
- Annoncer honnêtement au tutoriel : « Sur iPhone, pas de vibration : vous verrez et entendrez le battement. »

### 4.3 Bonnes pratiques

1. Toujours **détecter** (`'vibrate' in navigator`) et déclarer la capacité dans le tutoriel ; ne jamais supposer.
2. Toujours doubler d'un signal visuel (jamais l'haptique seul) ; l'haptique est un bonus.
3. Courtes, rares, signifiantes ; limiter la durée totale de vibration par minute [G].
4. Respecter un mode « sans vibrations » (accessibilité sensorielle, personnes portant un stimulateur ou sensibles) [G].
5. Cancel (`vibrate(0)`) à la sortie de scène et à la perte de focus.

---

## 5. Lumière

### 5.1 Effets à l'échelle de la salle : on diffuse un programme

Au lieu d'envoyer N ordres, le serveur envoie **un programme** et un instant de départ ; chaque téléphone calcule sa propre couleur en fonction de sa position :

```js
// frame(t) -> couleur du téléphone situé en (row, col) à l'instant serveur t
const wave = ({ row, col }, t, { t0, speed = 6 /*rangs/s*/, color = [255,160,0] }) => {
  const phase = (t - t0) / 1000 * speed - row;           // la vague arrive au rang `row` quand phase = 0
  const k = Math.max(0, 1 - Math.abs(phase) / 1.5);      // enveloppe lisse, largeur ≈ 3 rangs
  return color.map(c => Math.round(c * k));
};
// rAF : el.style.backgroundColor = `rgb(${guard(wave(seat, serverNow(), params)).join(',')})`;
```

- **Mosaïque** : table `siège → couleur` (ou fonction d'une image) ; chaque téléphone ne reçoit que sa case ou la petite image entière à échantillonner. Palette de **2 à 4 couleurs très contrastées** : les écrans (OLED/LCD, réglages de luminosité, luminosité automatique, True Tone) rendent les teintes différemment d'un téléphone à l'autre [G].
- **Vague** : délai par rang ≥ ~100 ms (la gigue de synchronisation de ±30 ms ne doit pas brouiller le front) ; vitesse 3-10 rangs/s ; une vague par seconde au maximum.
- **Constellation** : un petit **point lumineux** (dégradé radial) sur fond noir, et non un écran plein ; limite l'éblouissement ; scintillement lent (< 1 Hz) décalé par un hasard dérivé du siège ; la précision de synchronisation n'a aucune importance.
- **Posture physique** : une mosaïque vue **de la scène** suppose que les écrans soient tournés vers la scène (donc le dos du téléphone vers le spectateur, bras levé). C'est fatigant au-delà de ~15-20 s [G] ; à prévoir en conséquence ou à filmer depuis la scène/balcon.
- **Rendu** : `requestAnimationFrame` ; le mode économie d'énergie d'iOS peut limiter la cadence à 30 Hz [G] → fondus de ≥ 100 ms ; pas de dépendance à 60 fps.
- **Noir** : fond `#000` par défaut ; sur écran OLED les pixels sont éteints, sur LCD un halo gris subsiste dans le noir de la salle [G] → demander dans le tutoriel de baisser la luminosité, d'activer « Ne pas déranger » (une notification allume l'écran) et de laisser l'application au premier plan.

### 5.2 Photosensibilité (WCAG 2.3.1 et au-delà)

**Ce que dit la norme [S: W3C Understanding 2.3.1]** :
- Pas plus de **3 flashs par seconde** (général ou rouge), *sauf* si le flash reste sous les seuils.
- **Flash général** : paire de changements opposés de luminance relative d'au moins **10 %** de la luminance maximale, la valeur la plus sombre étant sous **0,80**.
- **Flash rouge** : paire de transitions opposées impliquant un **rouge saturé** : une des deux couleurs doit avoir `R/(R+G+B) ≥ 0,8` et la différence de chromaticité (CIE 1976 UCS) doit dépasser 0,2.
- **Surface** : le seuil ne s'applique que si la surface flashante concomitante dépasse **0,006 stéradian** (≈ 25 % d'un champ visuel de 10°) ; approximation : un rectangle de 341 × 256 px sur un écran 1024 × 768.
- Luminance relative sRGB : `L = 0,2126 R + 0,7152 G + 0,0722 B` après linéarisation. Techniques : G19 (≤ 3 flashs/s), G176 (surface réduite), G15 (outil d'analyse).
- WCAG 2.3.2 (AAA) interdit tout dépassement des 3 flashs/s, sans exception de seuil [G].

**Ce que cela implique pour un téléphone** :
1. Un téléphone tenu à 30 cm remplit largement plus de 10° du champ visuel [G, géométrie] → l'exception de surface **ne s'applique jamais** : appliquer la règle des 3 flashs/s sans condition.
2. Une salle entière qui clignote ensemble est une **seule grande surface flashante** : pas d'exception non plus.
3. **Règle d'équipe : maximum 2 flashs/s** (marge de sécurité sous les 3), aucun stroboscope par défaut, et **aucun flash du tout** en mode « effets réduits ».
4. **Pulsations douces exemptées par construction** : un changement < 10 % de luminance relative n'est pas un flash. Exemple : noir → gris `#555555` (L ≈ 0,09). Utile pour le « cœur qui bat » à 140 bpm, qui ferait sinon près de 5 flashs/s.
5. **Rouge** : éviter les va-et-vient autour du rouge saturé. `#FF0000` : R/(R+G+B) = 1. `#E04040` : ≈ 0,64 (hors définition), mais prudence quand même ; transitions vers/depuis le rouge pur en fondu ≥ 300 ms.
6. Fonds blanc ↔ noir à plus de 3 Hz : jamais.

```js
// Garde-fou côté téléphone : refuse une couleur qui ferait dépasser N flashs/s (approche image à image simplifiée)
const lin = c => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export function makeFlashGuard({ maxFlashesPerSec = 2, dL = 0.1 } = {}) {
  let last = { rgb: [0, 0, 0], L: 0 }, stamps = [];
  return (rgb, now = performance.now()) => {
    const L = lum(rgb);
    if (Math.abs(L - last.L) >= dL) {                       // une « transition » significative (= demi-flash)
      stamps = stamps.filter(t => now - t < 1000);
      if (stamps.length >= maxFlashesPerSec * 2) return last.rgb;   // refus : on garde la couleur précédente
      stamps.push(now);
    }
    last = { rgb, L }; return rgb;
  };
}
```
Ce garde-fou est un **filet de sécurité** ; il ne remplace pas la revue des scénarios avec un outil d'analyse (G15) et le test sur une vidéo de l'effet.

**Autres mesures**
- Consentement : avertissement au début du spectacle ; **option « effets doux »** (pas de flashs, vibrations réduites, fondus allongés), enregistrée **côté serveur** pour survivre à un rafraîchissement.
- `prefers-reduced-motion: reduce` [S: MDN] : le respecter pour les animations de mouvement (vagues rapides, défilements, pulsations) en les remplaçant par des fondus plus lents. Attention : ce réglage concerne la **sensibilité vestibulaire**, pas la sécurité vis-à-vis des flashs ; la garde 2.3.1 s'applique en toutes circonstances.
- Une alerte sur grand-écran de scène doit aussi respecter 2.3.1 (une surface projetée est large).

### 5.3 Éblouissement dans le noir

[G] L'œil adapté à l'obscurité est gêné pour plusieurs minutes par un écran blanc plein à 30 cm ; un rang de 10 écrans blancs éclaire les visages voisins.
- Défaut `#000`. Plafond de luminosité d'un effet « d'ambiance » : gris ≤ 25-30 % (`#404040` ≈ L 0,05) ; blanc plein réservé à la « lampe » annoncée.
- **Montées en 300-800 ms**, pas de passage instantané noir → blanc.
- On ne peut pas régler la luminosité du téléphone (pas d'API, doc 02) : le niveau de gris est le seul levier ; une luminosité automatique ou à fond change donc le rendu d'un téléphone à l'autre.
- Après une scène lumineuse, ménager 3-5 s de noir avant un effet faible.
- Lampe torche arrière : aveugle les comédiens (voir fiche 11).

---

## 6. UX de participation

### 6.1 Onboarding en moins de 30 secondes

| Étape | Durée visée | Contenu |
|---|---|---|
| 1. Scan + chargement | 0-5 s | page < 100 Ko avant interaction, pas de grosse bibliothèque, mise en cache |
| 2. Pseudo | 5-10 s | pseudo suggéré en un toucher (« Renard-Bleu »), modifiable |
| 3. **Entrer** | 10-15 s | un seul bouton déclenche : `AudioContext.resume()`, `audioSession`, permission de mouvement iOS, Wake Lock. Un message d'avant-plan explique la fenêtre système (« pour que vous puissiez secouer ») |
| 4. Tutoriel testeur | 15-27 s | **4 micro-tests de 2-3 s** (ci-dessous) |
| 5. Prêt | 27-30 s | écran noir « Le spectacle commence ; posez votre téléphone, il vous guidera » |

**Le tutoriel qui teste les capacités** (résultat renvoyé à la régie, doc 02 télémétrie) :
1. **Son** : « Vous entendez ce bip ? » + bouton « Oui / Non ». Rappelle : sortir du silencieux, ne pas brancher d'écouteurs.
2. **Vibration** : Android déclenche `vibrate(200)` : « Vous l'avez senti ? » ; iPhone : saute l'étape et marque `vibration:false`.
3. **Secouer** : « Secouez ! » avec jauge locale en direct ; valide la permission de mouvement.
4. **Lumière** : un fondu de couleur douce, rappelle de baisser la luminosité et d'activer « Ne pas déranger ».
Pas de micro, pas de caméra, pas de notifications ici : **demande au moment du besoin**, avec pré-explication (une seule vraie fenêtre système ; chaque refus est durable, prévoir le chemin de reprise : réglages Safari ou site). Prévoir qu'un spectateur peut tout refuser et jouer avec les boutons de repli.

### 6.2 Ergonomie à une main, dans le noir

- Contrôles dans le **tiers bas** de l'écran (zone du pouce) ; actions principales en grandes zones, jusqu'à **tout l'écran** pour le buzzer ou le tap en rythme.
- **Tailles de cibles** : WCAG 2.5.8 (AA) impose au moins 24 × 24 px CSS ou un espacement équivalent ; 2.5.5 (AAA) vise 44 × 44 px [S: W3C]. Les lignes directrices d'Apple (44 pt) et de Material (48 dp) recommandent davantage [G]. **Règle du studio : 56 px minimum, 72 px pour les actions principales dans le noir, espacement ≥ 12 px.**
- Éviter les bords : marges de 24 px et `env(safe-area-inset-bottom)` pour ne pas déclencher les gestes système (retour, accueil).
- CSS indispensable : `touch-action: manipulation` (ou `none` pour les surfaces de dessin), `user-select: none`, `-webkit-touch-callout: none`, `overscroll-behavior: none` (pas de tirer-pour-rafraîchir), `meta viewport` sans zoom involontaire, interdire le menu contextuel sur l'appui long.
- Texte : polices grandes (≥ 20 px), fort contraste sur noir, jamais de texte blanc plein écran.

### 6.3 Retour immédiat

- Retour **local en < 100 ms** avant l'accusé du serveur : ondulation visuelle + tic sonore + `vibrate(15)` (Android).
- Puis un état « reçu » discret ; en cas d'échec réseau : file locale + « renvoi automatique » sans bloquer le jeu (principe 5 du README).
- Pas de spinners en plein spectacle.

### 6.4 Accessibilité

| Public | Mesures |
|---|---|
| Malvoyants | contraste élevé, zoom du texte système respecté, régions `aria-live="polite"` doublant chaque consigne, retour sonore + haptique des actions ; vérifier les conflits de gestes avec VoiceOver/TalkBack |
| Sourds / malentendants | toute information sonore possède un équivalent visuel et textuel (sous-titres des voix de poche) |
| Photosensibles, sensibles aux mouvements | mode « effets doux » (section 5.2), `prefers-reduced-motion` |
| Difficultés motrices | **chaque capteur a un bouton équivalent** (secouer → marteler ; pencher → deux flèches ; micro → tap) ; durées d'appui réglables |
| Daltonisme | équipe jamais indiquée par la seule couleur : forme/icône + nom |
| Troubles cognitifs / stress | une consigne à la fois, phrase courte, icône |
| Sans téléphone / batterie vide | téléphones de prêt, ou « spectateur compagnon » partageant le téléphone d'un voisin ; mécaniques qui ne pénalisent pas un absent (agrégats rapportés au nombre de participants) |

### 6.5 Éviter la fatigue

- Durées d'effort : secousse ≤ 20 s, bras levé ≤ 15 s, 3 efforts physiques maximum par heure [G].
- Alterner avec des phases « téléphone posé » : écran noir, aucune demande.
- Proportion de temps interactif ≤ 30-40 % du spectacle [G] ; une consigne par scène.
- **Batterie** : écran allumé 90 min + Wi-Fi + capteurs + Wake Lock coûtent plus d'un dixième de batterie par heure [G] ; noir par défaut (OLED), capteurs coupés hors scène, alerte de la régie sous 20 % (API Battery sur Android, doc 02). Prévoir des spectacles ≤ 90 min.
- Sécurité : « secouez doucement, tenez fort » (risque de lancer l'appareil sur les voisins) ; rester assis.

---

## 7. Fiches de faisabilité par mécanique

**Légende** : ✅ faisable · 🟡 avec repli · ❌ non en l'état. Paramètres = valeurs de départ [G] à valider au banc d'essai.

### Fiche 2 — Vote pondéré / jauge (lumière ou musique pilotée) ✅
- Mécanisme : curseur 0-100, envoi à ≤ 10 Hz + valeur finale au relâchement ; agrégat serveur (médiane ou moyenne) ; la scène lisse avec τ ≈ 300 ms.
- Paramètres : curseur ≥ 56 px de haut, pas de zone de bord ; lisser la sortie lumineuse (pas de saut brutal, voir 5.3).
- Repli : boutons − / +.

### Fiche 6 — Mosaïque humaine ✅ *(si les téléphones sont levés vers la scène)*
- Mécanisme : programme `siège → couleur`, départ à T serveur avec avance 2 s ; la couleur est calculée localement.
- Paramètres : 2-4 couleurs saturées et contrastées, fondu 150-300 ms, durée ≤ 15-20 s, aucune alternance > 2/s, luminance plafonnée (5.3).
- Repli : si le public ne lève pas les bras, filmer depuis la scène ou le balcon et projeter ; ou palette en « fond coloré » visible seulement des voisins.
- Risques : carte des sièges obligatoire (doc 03/04) ; dispersion colorimétrique entre écrans.

### Fiche 7 — La vague ✅
- Mécanisme : fonction `frame(t, rang, col)` (5.1) ; version sonore par `playAtServerMs` avec décalage par zone ; version haptique Android seulement.
- Paramètres : 3-10 rangs/s, délai ≥ 100 ms par rang, largeur 2-3 rangs, fondus ≥ 200 ms, 1 vague/s max, ordre envoyé avec 2 s d'avance.
- Repli iPhone (haptique) : pulsation douce + tic.
- Risques : acoustique : le son « vague » est surtout perçu par la physique (distances), pas par la synchronisation numérique.

### Fiche 8 — Chœur de téléphones 🟡
- Mécanisme : un fichier (mono, ≤ 30 s) par voix, préchargé ; 3-4 voix réparties par zone ; démarrage par `playAtServerMs` ; les « signes du comédien » sont des **cues quantifiés** (voir ci-dessous).
- Paramètres : tessiture ≥ 220 Hz ; attaques ≥ 150 ms ; gigue visée ±30 ms ; niveau normalisé ; chaque téléphone à 60-80 % du volume maximal ; avance des ordres 2 s.
- **Cues quantifiés** : le comédien « dirige » en envoyant un cue qui prend effet à la prochaine barre d'une grille de tempo commune (comme la quantification de lancement d'un logiciel de musique) ; la latence réseau est ainsi absorbée.
- Repli : variante visuelle (les téléphones « chantent » en lumière) pour les sans-son et les iPhone muets ; écouteurs Bluetooth détectés → alerte.
- Risques : iOS silencieux (`audioSession`), Bluetooth, volumes dispersés, haut-parleurs sans graves.

### Fiche 9 — Constellation ✅
- Mécanisme : points lumineux sur noir, densité croissante programmée ; scintillement dérivé du siège.
- Paramètres : point 10-20 % de la largeur, scintillement ≤ 0,5 Hz, luminosité ≤ 60 %, fondus 500 ms ; Wake Lock + « Ne pas déranger ».
- Risques : LCD qui ne sont pas vraiment noirs ; batterie ; aucune exigence de synchro.

### Fiche 10 — Le cœur qui bat 🟡
- Mécanisme : battement envoyé comme ordre `bpm(t0, valeur)` ; chaque téléphone recalcule son prochain battement ; Android : `battement(bpm)` (4.1) ; iPhone : pulsation douce + tic.
- Paramètres : 50-140 bpm, avance d'étalonnage 20-50 ms ; **pulsation visuelle ΔL < 10 %** (noir → `#555`) pour rester hors définition de flash ; pas de rouge saturé clignotant ; si bpm > 100, une seule impulsion visuelle par battement.
- Repli : tous les iPhone + sans-vibration ; piste sonore de scène.
- Risques : sur iPhone, le résultat est visuel seulement : annoncer.

### Fiche 11 — Lampes torches 🟡
- Mécanisme : **écran blanc** par défaut pour tout le monde (cohérent iOS/Android) ; la lampe LED arrière via la piste caméra (`torch`, Android Chrome compatible seulement, permission caméra, voyant, chauffe) en **option facultative**, désactivée par défaut [doc 02].
- Paramètres : montée 400-800 ms ; durée ≤ 20-30 s ; levée volontaire annoncée (« levez vos téléphones »), pas imposée.
- Risques : **la LED arrière éblouit les comédiens** (elle éclaire la scène) → valider avec la distribution ; luminosité écran variable ; consommation.
- Repli : écran blanc plein ou halo.

### Fiche 12 — Son dans la poche 🟡
- Mécanisme : audio ciblé sur un petit sous-ensemble, préchargé, déclenché à T ; la synthèse vocale (`speechSynthesis`) varie par plateforme : préférer des fichiers enregistrés.
- Paramètres : bande 300-3400 Hz (timbre « téléphone » naturel), 3-10 s, normalisé, 5-10 % de la salle simultanément, texte affiché en repli (sous-titre discret).
- Risques : poche = -10 à -20 dB ; un chuchotement est inaudible dans le bruit de fond de 300 personnes ; bouton silencieux iOS (3.4).
- Repli : texte sur l'écran allumé à faible luminosité.

### Fiche 13 — Secouez pour l'aider ✅
- Mécanisme : détecteur 1.2, énergie sur 200 ms → 0-255 à 3-5 Hz ; le serveur additionne avec un plafond par joueur et l'écran de scène lisse.
- Paramètres : `peakThreshold` 7 m/s², `energy` ×10 → 0-255, plafond joueur 25 m/s² RMS, rejet > 8 coups/s, durée ≤ 20 s, jauge normalisée par le nombre de joueurs *armés*.
- Repli : « marteler » un bouton (≤ 8 taps/s retenus), équivalence un tap = 0,6 d'unité de secousse.
- Risques : permission iOS ; téléphone qui glisse des mains (sangle ou consigne).

### Fiche 14 — Course d'équipes ✅
- Mécanisme : comme 13 ; fenêtre de 20 s armée par T serveur, compte à rebours commun, départ au même instant serveur.
- Paramètres : score = moyenne par joueur capable (et non somme) pour compenser les tailles d'équipe ; joueurs sans capteur : bouton avec équivalence plafonnée ; résultats intermédiaires toutes les 500 ms.
- Risques : équité (modèles de téléphone, lassitude, bras), tricherie (plafonds), fatigue (≤ 2 courses/heure).

### Fiche 15 — Pencher pour diriger ✅ *(avec calibrage)*
- Mécanisme : inclinaison calibrée (1.3), -1..1, médiane serveur ; l'écran de scène lisse.
- Paramètres : calibrage 1 s, zone morte ±5°, plage ±30°, passe-bas 150 ms, envoi 5 Hz, évitement de `beta` ≈ 90°.
- Repli : flèches gauche/droite (appui long = rampe).
- Risques : rotation d'écran, posture de chacun (le calibrage individuel règle cela), cardan.

### Fiche 16 — Applaudimètre 🟡
- Mécanisme (par ordre de préférence) : (1) **micro de salle de la régie** ; (2) taps en rythme / applaudissements simulés ; (3) micro des téléphones.
- Paramètres (option 3) : `fftSize` 1024, relevé 5 Hz, dB relatifs au calme de 2 s, **médiane** salle, ≥ 20 participants, antiécho/AGC désactivés, `track.stop()` après.
- Repli : taps (moyenne des taps/s × facteur).
- Risques : **iOS** : dégradation/craquements de la lecture audio tant que le micro est ouvert (WebKit 311451, 326286) ; permission refusée ; téléphones en poche.

### Fiche 17 — Silence ! 🟡
- Mécanisme : ne pas bouger, ne pas toucher : échec si `touchstart` ou énergie sans gravité > 1,0 m/s² pendant ≥ 200 ms, après 1 s de grâce ; contrôle « face dessous » toléré.
- Paramètres : repos humain 0,05-0,3 m/s² RMS [G] ; seuil de bruit capteur ≈ 0,02-0,05 ; décider *par équipe* (≥ 3 mouvements simultanés) pour éviter le blâme d'un voisin qui heurte un siège ; fenêtre ≤ 30 s.
- Repli : sans capteur de mouvement, seul le toucher compte (confiance) ; expliquer.
- Risques : fausses détections (siège secoué, vibration du plancher) ; permission iOS ; usage d'un autre doigt.

### Fiche 18 — Pointer 🟡 (absolu : ❌)
- Mécanisme : pointage **relatif** à la scène (1.4), cap du bord haut (`topEdge`, 1.3) ; histogramme serveur par pas de 15-20° ; le « fantôme » se cache dans un secteur de ≥ 30°.
- Paramètres : calibrage « pointez la scène » juste avant la scène (≤ 3 min d'écart) ; consigne « comme une télécommande, bras tendu, écran vers vous » ; filtre médian 500 ms ; rejeter les téléphones instables (écart-type du cap > 10° sur 2 s).
- Repli : carte de la salle à toucher (écran « carte de la salle », doc 02) ; boussole absolue comme bonus seulement.
- Risques : perturbations magnétiques et précision variable ±10° ou pire.

### Fiche 25 — Dessin collectif ✅ *(geste tactile)*
- Mécanisme : `PointerEvent` + `touch-action: none`, lissage et simplification (Douglas-Peucker), envoi à la fin du trait (≤ 64 points).
- Paramètres : case 128 × 128 px, annuler/refaire, bords à 24 px, aucune mise à l'échelle par pincement.
- Risques : gestes de bord iOS ; coalescence des événements pour les traits rapides.

### Fiche 29 — Buzzer ✅
- Mécanisme : zone plein écran, `pointerdown` ; **arbitrage par horodatage local converti en temps serveur** (3.1) et non par ordre d'arrivée (gigue réseau ±50-200 ms).
- Paramètres : armement à T serveur (écran « prêt » grisé), faux départ rejeté, égalités à moins de 30 ms tranchées au hasard.
- Risques : latence tactile 20-60 ms ; avantage aux bons réseaux (atténué par l'horodatage).

### Mécaniques non listées (pas de capteur/son/lumière) : 1, 3, 4, 5, 19-22, 24, 26-28, 30-34
Hors périmètre de cette étude, sauf mention : 23 (pops) ajoute seulement un `vibrate(10)`/tic à l'envoi ; 26 (mur de visages) dépend de la caméra (étude séparée).

---

## 8. Banc d'essai : à mesurer avant de figer les paramètres

1. **Fréquence réelle** de `devicemotion`/`deviceorientation` : consigner `event.interval`, delta réel et variance sur au moins 10 modèles (iPhone récent + ancien, Pixel, Samsung milieu/bas de gamme).
2. **Signe et unité** : à plat face vers le haut, noter `accelerationIncludingGravity` et `acceleration` (valeur de `z`, norme) sur chaque plateforme.
3. **Seuils de secousse** : enregistrer 20 secousses, marche, tremblement de main ; régler `peakThreshold` et les énergies.
4. **Latence audio de bout en bout** : plusieurs téléphones jouent un clic planifié par `playAtServerMs`, un micro externe enregistre ; mesurer l'écart par modèle. Comparer `getOutputTimestamp` et `outputLatency` aux mesures. Tester avec casque Bluetooth.
5. **Safari iOS** : bouton silencieux avec/sans `audioSession`, comportement à l'interruption (appel, verrouillage), `getOutputTimestamp` plausible ?
6. **Micro + lecture sur iOS 26.x/27** : reproduire WebKit 311451/326286 avec les contraintes réelles.
7. **Haptique** : motifs de 4.1 sur 5 moteurs différents ; vérifier la limite de longueur de motif ; tester l'astuce `switch` sur iOS 26.4 et 26.5.
8. **Boussole** : cap relatif vs absolu dans la salle cible, sur 10 téléphones.
9. **Wake Lock en PWA installée** sur iOS 18.4+.
10. **Wi-Fi de salle** : charge à 300 clients × 4 Hz (bots, doc 07) ; mesurer la précision d'horloge réelle (écart-type entre deux téléphones comparant `serverNow()` à un flash d'écran filmé).
11. **Photosensibilité** : passer toutes les séquences lumineuses dans un outil d'analyse (G15) et valider avec un spécialiste.

### Écarts à reporter dans le doc 02 (sans modifier ce fichier ici)
- Haptique iOS : l'astuce `switch` est « peut-être sur iOS 17.4-26.4, avec geste, probablement supprimée depuis 26.5 » ; classer iOS en ❌ pour le serveur.
- Boussole : ✅ trop optimiste ; ajouter « non fiable en salle, utiliser un pointage relatif ».
- Micro : ajouter l'avertissement iOS (dégradation de lecture) et la règle « pas de son pendant le micro ».
- Photosensibilité : porter la règle de 3 à **2 flashs/s** et ajouter l'argument de surface (le téléphone plein champ + salle entière).
- Son : ajouter la règle « pas de Bluetooth » et le tableau de latences.
- Wake Lock iOS : préciser le cas de la PWA installée.

### Paramètres par défaut proposés (à placer dans la configuration du studio)

```json
{
  "capteurs":  { "envoiHz": 4, "secousse": { "peakThreshold": 7, "tauMs": 300, "plafondJoueur": 25, "maxCoupsParSec": 8 },
                  "inclinaison": { "zoneMorteDeg": 5, "plageDeg": 30, "passeBasMs": 150, "calibrageMs": 1000 },
                  "micro": { "fftSize": 1024, "hz": 5, "baselineMs": 2000, "minParticipants": 20 } },
  "son":       { "avanceOrdreMs": 2000, "lookaheadMs": 200, "tickMs": 25, "maxLateMs": 120, "budgetMemoireMo": 50,
                  "alerteOutputLatencyS": 0.08, "resyncHorlogeS": 45 },
  "lumiere":   { "maxFlashsParSec": 2, "dLMinFlash": 0.1, "plafondAmbiance": "#404040", "fonduMinMs": 200, "noirParDefaut": true },
  "haptique":  { "maxEntreesMotif": 10, "pauseMinMs": 40, "dureeMaxContinueMs": 1500 },
  "ux":        { "cibleMinPx": 56, "ciblePrincipalePx": 72, "retourLocalMsMax": 100, "efforts": { "secousseMaxS": 20, "brasLevesMaxS": 15 } }
}
```

---

## 9. Sources

Consultées pour cette étude (26 octobre 2026). Les URL de la forme « version miroir » sont signalées.

**Normes et spécifications**
- WCAG 2.2, Understanding 2.3.1 Three Flashes or Below Threshold : https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
- WCAG 2.2, Understanding 2.5.8 Target Size (Minimum) : https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- Web Audio API (spécification) : https://webaudio.github.io/web-audio-api/
- W3C Vibration API : https://w3c.github.io/vibration/
- W3C Sensors, plafond ~60 Hz de DeviceOrientation : https://github.com/w3c/sensors/issues/98
- Fil W3C public-geolocation (signe des axes iOS/Android, 2014) : https://lists.w3.org/Archives/Public/public-geolocation/2014Nov/0001.html

**MDN / web.dev**
- AudioSession : https://developer.mozilla.org/en-US/docs/Web/API/AudioSession
- AudioContext.outputLatency : https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency
- AudioContext.getOutputTimestamp : https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp
- Synchronize audio and video playback (outputLatency) : https://web.dev/articles/audio-output-latency
- A tale of two clocks (ordonnancement Web Audio) : https://web.dev/articles/audio-scheduling
- Autoplay guide : https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- AnalyserNode : https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
- Vibration API : https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API
- Detecting device orientation : https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events/Detecting_device_orientation
- DeviceMotionEvent.accelerationIncludingGravity : https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/accelerationIncludingGravity
- DeviceMotionEvent.interval (version miroir consultée) : https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/interval
- deviceorientationabsolute (miroir) : https://developer.mozilla.org/en-US/docs/Web/API/Window/deviceorientationabsolute_event
- prefers-reduced-motion : https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion

**WebKit / Apple**
- Bug 264473 (audio Web et bouton silencieux) : https://bugs.webkit.org/show_bug.cgi?id=264473 ; 261554 : https://bugs.webkit.org/show_bug.cgi?id=261554 ; 251532 : https://bugs.webkit.org/show_bug.cgi?id=251532
- Bug 285120 (haptique `switch` : activation utilisateur) : https://bugs.webkit.org/show_bug.cgi?id=285120
- Bug 311451 (dégradation audio avec micro) : https://bugs.webkit.org/show_bug.cgi?id=311451
- Bug 326286 (craquements, iOS 27) : https://bugs.webkit.org/show_bug.cgi?id=326286
- Bug 145814 (fréquence de deviceorientation sur iOS) : https://bugs.webkit.org/show_bug.cgi?id=145814
- Bug 254545 (Wake Lock en PWA) : https://bugs.webkit.org/show_bug.cgi?id=254545 ; synthèse : https://progressier.com/pwa-capabilities/screen-wake-lock
- Web Audio sur iOS (commentaire) : https://adactio.com/journal/19929

**Haptique, son, appareils**
- ios-haptics (README) : https://unpkg.com/ios-haptics@3.1.1/README.md ; https://npmjs.com/package/ios-haptics
- web-haptics (support navigateurs) : https://mintlify.wiki/lochie/web-haptics/advanced/browser-support
- unmute (bouton silencieux iOS) : https://github.com/swevans/unmute
- Android, latence audio : https://developer.android.com/ndk/guides/audio/audio-latency
- RTINGS, latence Bluetooth : https://www.rtings.com/headphones/learn/latency ; NextPit : https://nextpit.com/bluetooth-audio-codecs
- Tutoriel de détection de secousse : https://slicker.me/javascript/shake/shake.htm
- Mesure de haut-parleur de téléphone (source faible) : https://www.notebookcheck.net/Our-review-reveals-where-the-German-alternative-to-the-Samsung-Galaxy-A57-falls-short.1376130.0.html

**Projets de téléphones comme instruments**
- Nü Soundworks (Poirier-Quinot et al., WAC 2017) : https://qmro.qmul.ac.uk/xmlui/handle/123456789/26084
- CoSiMa / Soundworks, IRCAM : https://cosima.ircam.fr/ ; Chloé × Ircam : https://cosima.ircam.fr/2015/10/03/chloe-x-ircam-nuit-blanche-2015/
- Musique Concrète Choir : https://repository.gatech.edu/entities/publication/d7de6056-7b79-4e84-9770-e1226fcc0d38
- SmartVox (NIME 2019) : https://nime.org/proc/nime2019_bell/
- Synchronisation d'horloge : https://www.npmjs.com/package/@ircam/sync ; https://github.com/DRIFTsync/driftsync
