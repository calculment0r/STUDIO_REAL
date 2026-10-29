// SONDE injectée dans chaque page (Conducteur et sortie) AVANT son premier script, par le protocole DevTools
// (Page.addScriptToEvaluateOnNewDocument). Elle ne touche à aucun fichier du produit : elle observe, depuis le
// navigateur, ce que le produit fait. Le texte ci-dessous est du JavaScript pour le navigateur (pas pour Node).
//
// Ce qu'elle compte (tout est cumulatif ; l'outil fait la différence entre le début et la fin de chaque phase) :
//   - images : l'instant de chaque image dessinée (boucle requestAnimationFrame propre à la sonde) ;
//   - raf : les appels à requestAnimationFrame, par fonction appelante, avec le temps passé dans chaque rappel ;
//   - minuteurs : setTimeout / setInterval créés, actifs, déclenchés, par fonction appelante ;
//   - react : une fausse « extension DevTools de React » (c'est la porte d'entrée officielle que React propose aux
//     outils de mesure) : compte les validations de rendu (commits) et, sur demande, les rendus par composant ;
//   - stockage : écritures localStorage (nombre, octets, durée), structuredClone (nombre, durée),
//     BroadcastChannel.postMessage (nombre) ;
//   - longues : images longues (long-animation-frame), tâches longues (longtask), délai des clics (event timing).

export const SONDE = String.raw`(() => {
  // fenêtre ouverte par window.open : le navigateur réutilise l'objet window de la page vide initiale pour la première
  // vraie page ; la sonde est donc déjà là, mais la boucle d'images de l'ancien document est perdue : on la relance.
  if (window.__fl) { window.__fl.boucler(); return; }
  const nat = {
    raf: window.requestAnimationFrame.bind(window), caf: window.cancelAnimationFrame.bind(window),
    st: window.setTimeout.bind(window), si: window.setInterval.bind(window),
    ct: window.clearTimeout.bind(window), ci: window.clearInterval.bind(window),
  };
  const F = window.__fl = {
    raf: {}, timeouts: {}, intervals: {}, stockage: { ecritures: 0, octets: 0, ms: 0 }, clone: { appels: 0, ms: 0 }, canal: { messages: 0 },
    react: { commits: 0, renderMs: 0, racines: {}, rendus: {}, compter: false, fibres: 0, commitsVides: 0, petits: {} },
    enregistrer: false, images: [], longues: [], tachesLongues: [], evenements: [], ivs: new Map(), pend: new Set(),
  };

  // --- nom lisible de la fonction appelante : "nom @ fichier:ligne" ---------------------------------------------
  const lieu = () => {
    const l = (new Error().stack || '').split('\n').slice(1);
    for (const x of l) {
      if (x.includes('__fl_') || x.includes('lieu') || x.includes('nomDe')) continue;
      const m = /at (?:(.*?) \()?(?:.*\/)?([^\/:()]*?)(?:-[A-Za-z0-9_-]{8})?\.js:(\d+):\d+\)?/.exec(x);
      if (m) return (m[1] || '(anonyme)') + ' @ ' + m[2] + ':' + m[3];
    }
    return '(inconnu)';
  };
  const nomDe = (cb) => (cb && cb.name && !cb.name.startsWith('bound ') ? cb.name : lieu());
  const fiche = (t, nom, extra) => (t[nom] ||= Object.assign({ appels: 0, execs: 0, ms: 0 }, extra || {}));

  // --- requestAnimationFrame -------------------------------------------------------------------------------------
  window.requestAnimationFrame = function __fl_raf(cb) {
    if (typeof cb !== 'function') return nat.raf(cb);
    const e = fiche(F.raf, nomDe(cb)); e.appels++;
    return nat.raf(function (ts) {
      const t0 = performance.now();
      try { return cb.call(this, ts); } finally { e.execs++; e.ms += performance.now() - t0; }
    });
  };

  // --- minuteurs -------------------------------------------------------------------------------------------------
  window.setTimeout = function __fl_st(cb, d, ...a) {
    if (typeof cb !== 'function') return nat.st(cb, d, ...a);
    const e = fiche(F.timeouts, nomDe(cb), { delai: d ?? 0 }); e.appels++;
    let id;
    id = nat.st(function () {
      F.pend.delete(id); e.execs++;
      const t0 = performance.now();
      try { return cb.apply(this, a); } finally { e.ms += performance.now() - t0; }
    }, d);
    F.pend.add(id);
    return id;
  };
  window.clearTimeout = function __fl_ct(id) { F.pend.delete(id); return nat.ct(id); };
  window.setInterval = function __fl_si(cb, d, ...a) {
    if (typeof cb !== 'function') return nat.si(cb, d, ...a);
    const nom = nomDe(cb);
    const e = fiche(F.intervals, nom, { delai: d ?? 0 }); e.appels++;
    const id = nat.si(function () {
      e.execs++;
      const t0 = performance.now();
      try { return cb.apply(this, a); } finally { e.ms += performance.now() - t0; }
    }, d);
    F.ivs.set(id, { nom, delai: d ?? 0 });
    return id;
  };
  window.clearInterval = function __fl_ci(id) { F.ivs.delete(id); return nat.ci(id); };

  // --- écritures de stockage, clones, canal ----------------------------------------------------------------------
  try {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function __fl_set(k, v) {
      const t0 = performance.now();
      try { return set.call(this, k, v); } finally { const s = F.stockage; s.ecritures++; s.octets += String(v).length; s.ms += performance.now() - t0; }
    };
  } catch (e) { /* stockage bloqué */ }
  try {
    const sc = window.structuredClone;
    window.structuredClone = function __fl_clone(v, o) {
      const t0 = performance.now();
      try { return sc.call(this, v, o); } finally { F.clone.appels++; F.clone.ms += performance.now() - t0; }
    };
  } catch (e) { /* pas de structuredClone */ }
  try {
    const pm = BroadcastChannel.prototype.postMessage;
    BroadcastChannel.prototype.postMessage = function __fl_pm(m) { F.canal.messages++; return pm.call(this, m); };
  } catch (e) { /* pas de BroadcastChannel */ }

  // --- images (boucle de la sonde) -------------------------------------------------------------------------------
  F.boucler = () => { if (F.boucleDoc === document) return; const doc = F.boucleDoc = document; (function boucle(t) { if (document !== doc) return; if (F.enregistrer) F.images.push(t); nat.raf(boucle); })(0); };
  F.boucler();
  F.demarrer = () => { F.boucler(); F.enregistrer = true; };

  // --- longues images, tâches longues, délai des clics ----------------------------------------------------------
  const observer = (type, init, f) => { try { new PerformanceObserver((l) => { for (const e of l.getEntries()) f(e); }).observe(Object.assign({ type }, init)); } catch (e) { /* non géré */ } };
  observer('long-animation-frame', {}, (e) => {
    if (!F.enregistrer) return;
    F.longues.push({ t: Math.round(e.startTime), d: Math.round(e.duration), bloc: Math.round(e.blockingDuration || 0),
      scripts: (e.scripts || []).slice(0, 4).map((s) => ({ inv: s.invoker, fn: s.sourceFunctionName, url: (s.sourceURL || '').split('/').pop(), d: Math.round(s.duration) })) });
  });
  observer('longtask', {}, (e) => { if (F.enregistrer) F.tachesLongues.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }); });
  observer('event', { durationThreshold: 16 }, (e) => {
    if (F.enregistrer) F.evenements.push({ type: e.name, t: Math.round(e.startTime), d: Math.round(e.duration), traitement: Math.round(e.processingEnd - e.processingStart) });
  });

  // --- fausse extension DevTools de React : commits et rendus par composant --------------------------------------
  const nomFibre = (f) => {
    const t = f.type; if (!t) return '(?)';
    if (typeof t === 'function') return t.displayName || t.name || '(anonyme)';
    if (t.displayName) return t.displayName;
    if (t.render) return t.render.displayName || t.render.name || 'ForwardRef';
    if (t.type) return (typeof t.type === 'function' ? t.type.displayName || t.type.name : '') || 'Memo';
    return '(?)';
  };
  const parcourir = (racine) => {
    const R = F.react.rendus, pile = [racine], noms = [];
    while (pile.length) {
      const x = pile.pop(), alt = x.alternate;
      if ((x.tag === 0 || x.tag === 1 || x.tag === 11 || x.tag === 14 || x.tag === 15) && (x.flags & 1)) { const n = nomFibre(x); R[n] = (R[n] || 0) + 1; F.react.fibres++; noms.push(n); }
      if (x.child && (!alt || x.child !== alt.child)) for (let c = x.child; c; c = c.sibling) pile.push(c);
    }
    // commits « légers » (≤ 6 composants rendus) : qui les déclenche ? histogramme par liste de composants
    if (noms.length === 0) F.react.commitsVides++;
    else if (noms.length <= 6) { const k = noms.sort().join(' + '); F.react.petits[k] = (F.react.petits[k] || 0) + 1; }
  };
  let idRendu = 0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, isDisabled: false, renderers: new Map(),
    inject(r) { const id = ++idRendu; this.renderers.set(id, r); return id; },
    checkDCE() {}, onScheduleFiberRoot() {}, onPostCommitFiberRoot() {}, onCommitFiberUnmount() {}, setStrictMode() {},
    onCommitFiberRoot(id, root) {
      const R = F.react; R.commits++;
      const cible = root.containerInfo; const nom = cible ? (cible.id || cible.className || cible.tagName || '?') : '?';
      R.racines[nom] = (R.racines[nom] || 0) + 1;
      R.renderMs += (root.current && root.current.actualDuration) || 0;
      if (R.compter) parcourir(root.current);
    },
  };

  // --- lecture de l'état ------------------------------------------------------------------------------------------
  F.photo = () => {
    const iv = {};
    for (const v of F.ivs.values()) { const k = v.nom + ' (' + v.delai + ' ms)'; iv[k] = (iv[k] || 0) + 1; }
    return JSON.parse(JSON.stringify({ raf: F.raf, timeouts: F.timeouts, intervals: F.intervals, stockage: F.stockage, clone: F.clone, canal: F.canal,
      react: F.react, actifs: { intervalles: iv, nbIntervalles: F.ivs.size, timeoutsEnAttente: F.pend.size }, t: performance.now() }));
  };
  F.prendreImages = () => { const r = F.images; F.images = []; const l = F.longues, tl = F.tachesLongues, ev = F.evenements; F.longues = []; F.tachesLongues = []; F.evenements = []; return { images: r, longues: l, tachesLongues: tl, evenements: ev }; };
  F.noeuds = () => {
    const q = (s) => document.querySelectorAll(s).length;
    const dans = (s) => { const e = document.querySelector(s); return e ? e.querySelectorAll('*').length + 1 : 0; };
    return { total: document.getElementsByTagName('*').length, conduite: dans('.cd'), planche: dans('.planche'), panneau: dans('.panneau'),
      svg: q('svg *'), iframes: q('iframe'), canvas: q('canvas'), animationsCss: document.getAnimations ? document.getAnimations().length : -1,
      animations: F.animations(), couches: F.couches() };
  };
  // animations CSS en cours : nom, élément, propriétés animées (celles qui ne sont ni transform ni opacity obligent à repeindre)
  F.animations = () => {
    const agr = {};
    for (const a of (document.getAnimations ? document.getAnimations() : [])) {
      const e = a.effect, t = e && e.target;
      const kf = e && e.getKeyframes ? e.getKeyframes() : [];
      const props = new Set();
      kf.forEach((k) => Object.keys(k).forEach((p) => { if (!['offset', 'easing', 'composite', 'computedOffset'].includes(p)) props.add(p); }));
      const cible = t ? t.tagName.toLowerCase() + (typeof t.className === 'string' && t.className.trim() ? '.' + t.className.trim().split(/s+/).slice(0, 3).join('.') : '') : '?';
      const cle = (a.animationName || a.transitionProperty || a.constructor.name) + ' | ' + cible + ' | ' + [...props].join(',') + ' | ' + a.playState;
      agr[cle] = (agr[cle] || 0) + 1;
    }
    return Object.entries(agr).map(([k, n]) => k + ' ×' + n).slice(0, 20);
  };
  // éléments qui obligent le navigateur à créer ou repeindre des couches : will-change, filtres, mélanges, canvas
  F.couches = () => {
    const r = { willChange: 0, filtre: 0, flouArrierePlan: 0, melange: 0, transform3d: 0 };
    for (const e of document.querySelectorAll('*')) {
      const c = getComputedStyle(e);
      if (c.willChange && c.willChange !== 'auto') r.willChange++;
      if (c.filter && c.filter !== 'none') r.filtre++;
      if (c.backdropFilter && c.backdropFilter !== 'none') r.flouArrierePlan++;
      if (c.mixBlendMode && c.mixBlendMode !== 'normal') r.melange++;
      if (c.transform && c.transform.startsWith('matrix3d')) r.transform3d++;
    }
    return r;
  };
})();`;
