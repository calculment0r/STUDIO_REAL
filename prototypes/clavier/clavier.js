/* ============================================================
   P0.2 - le clavier qui ne mange pas l'ecran (page statique, sans build)
   Recette : docs/06-cas-live-streamer.md section 4.
   1. Android / Chrome : la meta viewport interactive-widget=resizes-content reduit la page ;
      ce script ne fait que CONFIRMER la hauteur visible (visualViewport) et pose l'etat "clavier ouvert".
   2. iOS / Safari : la meta est ignoree, le clavier recouvre la page. On ecoute visualViewport
      (resize + scroll) et on cale la boite .k-app SUR la zone visible (hauteur + decalage vertical).
   ============================================================ */
(() => {
  'use strict';

  const MAX = 80;            // caracteres par message
  const COOLDOWN = 2000;     // anti-spam, ms
  const HOLD_MS = 420;       // appui long = reaction forte
  const KBD_MIN = 80;        // px : en dessous, ce n'est pas un clavier
  const EMOJIS = [
    ['❤️', 'Coeur'], ['😂', 'Rire'], ['😮', 'Surprise'], ['👏', 'Applaudir'],
    ['🔥', 'Feu'], ['😭', 'Pleurer'], ['🤯', 'Tete qui explose'], ['✨', 'Etincelles']
  ];
  const CHIPS = ['Bravo !', 'Vas-y !', 'À gauche', 'À droite', 'Derrière toi !', 'Cours !', 'Hein ?!', 'Trop fort'];

  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;
  const app = $('#app'), stage = $('#stage'), react = $('#react'), chips = $('#chips');
  const form = $('#form'), field = $('#field'), input = $('#msg'), count = $('#count');
  const sendBtn = $('#send'), hint = $('#hint');
  const dbg = $('#dbg'), dbgBtn = $('#dbgBtn'), dbgList = $('#dbgList'), dbgCopy = $('#dbgCopy'), probe = $('#probe');

  const vv = window.visualViewport || null;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const haptic = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) { /* iOS : pas de vibration */ } };

  // la couleur de la barre du navigateur = --bg (lue dans le theme packages/theme/, jamais ecrite ici)
  try {
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    const m = document.querySelector('meta[name="theme-color"]');
    if (bg && m) m.setAttribute('content', bg);
  } catch (_) { /* sans importance */ }

  /* ------------------------------------------------------------
     1. Viewport : hauteur visible, decalage, clavier estime
     ------------------------------------------------------------ */
  const st = { baseline: 0, lastW: window.innerWidth, kbd: 0, open: false, raf: 0, settle: 0,
               n: { resize: 0, vvResize: 0, vvScroll: 0, focus: 0, blur: 0 }, sendKept: null };

  const visBottom = () => (vv ? vv.height + vv.offsetTop : window.innerHeight);
  st.baseline = Math.max(window.innerHeight, visBottom());

  const isTextFocused = () => {
    const a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  };

  function sync() {
    st.raf = 0;
    const h = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    const bottom = h + top;

    if (window.innerWidth !== st.lastW) {            // rotation : on repart de zero
      st.lastW = window.innerWidth;
      st.baseline = Math.max(bottom, window.innerHeight);
    } else {
      st.baseline = Math.max(st.baseline, bottom, window.innerHeight);   // ne baisse jamais ici (voir settle())
    }
    st.kbd = Math.max(0, Math.round(st.baseline - bottom));
    st.open = st.kbd > KBD_MIN;

    const zoomed = vv && vv.scale > 1.02;            // pincement : on rend la main au navigateur
    if (vv && !zoomed) {
      app.style.setProperty('--k-h', h + 'px');
      app.style.setProperty('--k-top', top + 'px');
    } else {
      app.style.removeProperty('--k-h');
      app.style.removeProperty('--k-top');
    }
    app.classList.toggle('kbd', st.open);
    app.classList.toggle('tiny', h < 430);
    app.classList.toggle('micro', h < 270);

    // iOS fait defiler la page pour montrer le champ : on la ramene (la boite suit le viewport visuel)
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);

    if (!dbg.hidden) renderDebug();
  }
  const schedule = () => { if (!st.raf) st.raf = requestAnimationFrame(sync); };

  // apres la fermeture du clavier la base peut REDESCENDRE (barre d'adresse iOS qui reapparait)
  function settle() {
    clearTimeout(st.settle);
    st.settle = setTimeout(() => {
      if (!isTextFocused()) st.baseline = Math.max(visBottom(), 0);
      sync();
    }, 600);
  }

  if (vv) {
    vv.addEventListener('resize', () => { st.n.vvResize++; schedule(); });
    vv.addEventListener('scroll', () => { st.n.vvScroll++; schedule(); });
  }
  window.addEventListener('resize', () => { st.n.resize++; schedule(); });
  window.addEventListener('orientationchange', () => { setTimeout(() => { st.baseline = visBottom(); sync(); }, 350); });
  window.addEventListener('scroll', schedule, { passive: true });
  document.addEventListener('focusin', () => {
    st.n.focus++;
    // le clavier arrive en animation : plusieurs mesures, les evenements viewport tardent parfois (iOS)
    [0, 120, 300, 600].forEach((d) => setTimeout(sync, d));
  });
  document.addEventListener('focusout', () => { st.n.blur++; [0, 150, 400].forEach((d) => setTimeout(sync, d)); settle(); });

  // pas de rebond, pas de tirer-pour-rafraichir : on bloque tout geste de defilement hors zones autorisees
  document.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches.length > 1) return;                  // pincement : accessibilite
    if (e.target.closest && e.target.closest('[data-scroll], input')) return;
    e.preventDefault();
  }, { passive: false });

  /* ------------------------------------------------------------
     2. Garder le focus : envoyer / reagir SANS fermer le clavier
     ------------------------------------------------------------ */
  const refocus = () => { try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); } };
  // un bouton ne doit jamais voler le focus au champ (souris et appui tactile "compat")
  [sendBtn, chips, react].forEach((el) => el.addEventListener('mousedown', (e) => e.preventDefault()));

  /* ------------------------------------------------------------
     3. La scene simulee
     ------------------------------------------------------------ */
  const pops = [];
  function popMessage(text) {
    const el = document.createElement('div');
    el.className = 'k-pop';
    const who = document.createElement('b'); who.textContent = 'toi';
    const t = document.createElement('span'); t.textContent = text;
    el.append(who, t);
    el.style.setProperty('--r', rand(-3, 3).toFixed(1) + 'deg');
    el.style.visibility = 'hidden';
    stage.appendChild(el);

    const sw = stage.clientWidth, sh = stage.clientHeight;
    const w = el.offsetWidth, h = el.offsetHeight;
    const xmin = w / 2 + 8, xmax = Math.max(xmin, sw - w / 2 - 8);
    const ymin = h / 2 + 18, ymax = Math.max(ymin, sh - h / 2 - 8);
    let best = null;
    for (let i = 0; i < 10; i++) {                   // 10 essais : on garde le plus loin des autres
      const c = { x: rand(xmin, xmax), y: rand(ymin, ymax) };
      const d = pops.reduce((m, p) => Math.min(m, Math.hypot(p.x - c.x, (p.y - c.y) * 1.6)), 1e9);
      if (!best || d > best.d) best = { x: c.x, y: c.y, d };
    }
    el.style.left = best.x + 'px';
    el.style.top = best.y + 'px';
    el.style.visibility = '';
    const rec = { el, x: best.x, y: best.y };
    pops.push(rec);
    stage.classList.add('used');

    const kill = () => {
      clearTimeout(rec.t1);
      el.classList.add('out');
      setTimeout(() => el.remove(), 520);
      const i = pops.indexOf(rec); if (i >= 0) pops.splice(i, 1);
    };
    rec.t1 = setTimeout(kill, 6000);
    if (pops.length > 6) { const old = pops[0]; clearTimeout(old.t1); old.el.classList.add('out'); setTimeout(() => old.el.remove(), 520); pops.shift(); }
  }

  function floatEmoji(emoji, strong) {
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const n = strong ? 9 : 1;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('span');
      el.className = 'k-float';
      el.textContent = emoji;
      const size = strong ? rand(30, 54) : 34;
      el.style.fontSize = size + 'px';
      const x = strong ? rand(size, Math.max(size + 1, sw - size)) : rand(sw * 0.3, sw * 0.7);
      el.style.left = x + 'px';
      stage.appendChild(el);
      stage.classList.add('used');
      const rise = -(Math.max(40, sh - size - 8)) * (strong ? rand(0.55, 1) : 0.85);
      const sway = rand(-28, 28);
      if (!el.animate) { setTimeout(() => el.remove(), 800); continue; }
      const a = el.animate(reduce
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }]
        : [
          { transform: 'translate(-50%, 0) scale(.3)', opacity: 0 },
          { transform: 'translate(calc(-50% + ' + (sway * 0.3) + 'px), ' + (rise * 0.25) + 'px) scale(' + (strong ? 1.25 : 1) + ')', opacity: 1, offset: 0.18 },
          { transform: 'translate(calc(-50% + ' + sway + 'px), ' + rise + 'px) scale(' + (strong ? 1 : 0.9) + ')', opacity: 0 }
        ], { duration: (strong ? rand(1100, 1800) : 1300), delay: strong ? i * 45 : 0, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' });
      a.onfinish = () => el.remove();
    }
    if (strong) {
      stage.classList.remove('flash'); void stage.offsetWidth; stage.classList.add('flash');
    }
  }

  /* ------------------------------------------------------------
     4. La barre des 8 emojis (tap / appui long)
     ------------------------------------------------------------ */
  function doReact(btn, emoji, strong) {
    floatEmoji(emoji, strong);
    if (btn.animate && !reduce) {
      btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + (strong ? 1.5 : 1.3) + ')' }, { transform: 'scale(1)' }], { duration: 280, easing: 'ease-out' });
    }
    haptic(strong ? [20, 40, 20] : 10);
  }

  EMOJIS.forEach(([emoji, label]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'k-e'; b.textContent = emoji;
    b.setAttribute('aria-label', label + ' (appui long : plus fort)');
    let timer = 0, down = false, fired = false, hadFocus = false;
    const stop = () => { clearTimeout(timer); b.classList.remove('holding'); };
    b.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      down = true; fired = false; hadFocus = document.activeElement === input;
      b.classList.add('holding');
      timer = setTimeout(() => { fired = true; stop(); doReact(b, emoji, true); }, HOLD_MS);
    });
    b.addEventListener('pointerup', () => {
      if (!down) return;
      down = false; stop();
      if (!fired) doReact(b, emoji, false);
      if (hadFocus && document.activeElement !== input) refocus();
    });
    const cancel = () => { if (down) { down = false; stop(); } };
    b.addEventListener('pointercancel', cancel);
    b.addEventListener('pointerleave', cancel);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('click', (e) => { if (e.detail === 0) doReact(b, emoji, false); });   // clavier / lecteur d'ecran
    react.appendChild(b);
  });

  /* ------------------------------------------------------------
     5. Suggestions rapides (chips) au-dessus du champ
     ------------------------------------------------------------ */
  CHIPS.forEach((txt) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'k-chip'; b.textContent = txt;
    b.addEventListener('click', () => {
      const cur = input.value.trim();
      input.value = (cur ? cur + ' ' + txt : txt).slice(0, MAX);
      updateCount();
      refocus();                                     // le geste utilisateur ouvre le clavier sur iOS
    });
    chips.appendChild(b);
  });

  /* ------------------------------------------------------------
     6. Champ : compteur, envoi, anti-spam
     ------------------------------------------------------------ */
  function updateCount() {
    const n = input.value.length;
    count.textContent = n + '/' + MAX;
    count.classList.toggle('warn', n >= 64 && n < MAX);
    count.classList.toggle('max', n >= MAX);
  }
  input.addEventListener('input', updateCount);

  let hintT = 0, lastSend = 0;
  function say(msg, kind, ms) {
    clearTimeout(hintT);
    hint.textContent = msg; hint.className = 'k-hint' + (kind ? ' ' + kind : '');
    if (ms) hintT = setTimeout(() => { hint.textContent = ''; hint.className = 'k-hint'; }, ms);
  }
  function shake() {
    field.classList.remove('shake'); void field.offsetWidth; field.classList.add('shake');
    haptic([30, 30, 30]);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const wasFocused = document.activeElement === input;
    const text = input.value.trim().replace(/\s+/g, ' ');
    const now = Date.now();
    if (!text) {
      shake(); say('Écris quelque chose d’abord', 'err', 1800);
    } else if (now - lastSend < COOLDOWN) {
      shake(); say('Attends ' + ((COOLDOWN - (now - lastSend)) / 1000).toFixed(1).replace('.', ',') + ' s', 'err', 1500);
    } else {
      lastSend = now;
      popMessage(text);
      input.value = '';
      updateCount();
      say('Ton message est parti sur scène ✨', 'ok', 2200);
      haptic(15);
      sendBtn.classList.remove('cooling', 'sent'); void sendBtn.offsetWidth; sendBtn.classList.add('cooling', 'sent');
      setTimeout(() => sendBtn.classList.remove('cooling', 'sent'), COOLDOWN);
    }
    // LE point cle : le clavier reste ouvert, on enchaine
    if (document.activeElement !== input && (wasFocused || st.open)) refocus();
    st.sendKept = document.activeElement === input;
    if (!dbg.hidden) renderDebug();
  });

  /* ------------------------------------------------------------
     7. Panneau de debogage
     ------------------------------------------------------------ */
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const platform = isIOS ? 'iOS' : /Android/.test(ua) ? 'Android' : 'autre / bureau';
  const browser = /CriOS/.test(ua) ? 'Chrome iOS' : /FxiOS/.test(ua) ? 'Firefox iOS' : /EdgA|EdgiOS|Edg\//.test(ua) ? 'Edge'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox/.test(ua) ? 'Firefox' : /Chrome/.test(ua) ? 'Chrome'
    : /Safari/.test(ua) ? 'Safari' : '?';
  const osVer = (ua.match(/(?:OS|Android) ([\d_.]+)/) || [])[1];
  const standalone = () => !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  const fx = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');

  function rows() {
    const h = vv ? vv.height : window.innerHeight;
    const a = document.activeElement;
    return [
      ['innerHeight', fx(window.innerHeight) + ' px'],
      ['100dvh (sonde)', probe.offsetHeight + ' px'],
      ['visualViewport.height', vv ? fx(vv.height) + ' px' : 'absent'],
      ['visualViewport.offsetTop', vv ? fx(vv.offsetTop) + ' px' : 'absent'],
      ['visualViewport.scale', vv ? fx(vv.scale) : 'absent'],
      ['largeur inner / vv', window.innerWidth + ' / ' + (vv ? fx(vv.width) : '-') + ' px'],
      ['base (hauteur sans clavier)', fx(st.baseline) + ' px', 0],
      ['clavier estime', st.kbd + ' px', st.open ? 'hot' : 0],
      ['mode clavier (compact)', st.open ? 'OUVERT' : 'ferme', st.open ? 'hot' : 0],
      ['boite appli (--k-h / --k-top)', app.style.getPropertyValue('--k-h') || 'css 100dvh', 0],
      ['plateforme', platform + (osVer ? ' ' + osVer.replace(/_/g, '.') : '')],
      ['navigateur', browser],
      ['mode standalone (PWA)', standalone() ? 'oui' : 'non'],
      ['champ actif', a && a !== document.body ? a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') : '-'],
      ['focus garde apres envoi', st.sendKept === null ? '-' : (st.sendKept ? 'oui' : 'NON'), st.sendKept === false ? 'hot' : 0],
      ['pageYOffset', fx(window.pageYOffset) + ' px'],
      ['DPR / orientation', window.devicePixelRatio + ' / ' + (screen.orientation ? screen.orientation.type : (window.innerWidth > h ? 'paysage' : 'portrait'))],
      ['VirtualKeyboard API', 'virtualKeyboard' in navigator ? 'presente' : 'absente'],
      ['evts resize / vvResize / vvScroll', st.n.resize + ' / ' + st.n.vvResize + ' / ' + st.n.vvScroll],
      ['evts focus / blur', st.n.focus + ' / ' + st.n.blur]
    ];
  }
  function renderDebug() {
    const r = rows();
    if (dbgList.children.length !== r.length * 2) {
      dbgList.textContent = '';
      r.forEach(() => { dbgList.append(document.createElement('dt'), document.createElement('dd')); });
    }
    r.forEach((row, i) => {
      const dt = dbgList.children[i * 2], dd = dbgList.children[i * 2 + 1];
      if (dt.textContent !== row[0]) dt.textContent = row[0];
      if (dd.textContent !== row[1]) dd.textContent = row[1];
      dd.className = row[2] || '';
    });
  }
  let dbgTimer = 0;
  function setDebug(open) {
    dbg.hidden = !open;
    dbgBtn.setAttribute('aria-expanded', String(open));
    clearInterval(dbgTimer);
    if (open) { renderDebug(); dbgTimer = setInterval(renderDebug, 400); }   // certains navigateurs n'emettent pas tous les evenements
  }
  dbgBtn.addEventListener('mousedown', (e) => e.preventDefault());
  dbgBtn.addEventListener('click', () => setDebug(dbg.hidden));
  dbgCopy.addEventListener('mousedown', (e) => e.preventDefault());
  dbgCopy.addEventListener('click', () => {
    const txt = rows().map((r) => r[0] + ': ' + r[1]).join('\n');
    try { navigator.clipboard.writeText(txt).then(() => { dbgCopy.textContent = 'Copié'; setTimeout(() => { dbgCopy.textContent = 'Copier'; }, 1200); }); } catch (_) { /* HTTP / refus */ }
  });
  if (/[?&]debug=1\b/.test(location.search)) setDebug(true);

  updateCount();
  sync();
})();
