// scene.js : écran de scène. Vidéo (dégradé animé ou webcam) + calque Pixi d'effets de réactions du public.
// Page statique sans build : PixiJS v8 est résolu par l'importmap de index.html (version épinglée).
import * as PIXI from 'pixi.js';
import { readTheme, hexToCss, mix } from './theme.js';
import { Crowd, EMOJIS } from './crowd.js';
import { Kit, Particles } from './kit.js';
import { Pops, Danmaku, Featured, Hearts, Fireworks, Gauge, VoteReveal, Density } from './fx.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LOGICAL_H = 1080;

async function main() {
  const theme = readTheme();
  const status = $('#status');
  if (!theme.fromTokens) status.textContent = 'thème introuvable (packages/theme) : couleurs neutres';

  /* ---------- Pixi ---------- */
  const host = $('#pixi');
  const app = new PIXI.Application();
  await app.init({
    resizeTo: host, backgroundAlpha: 0, antialias: false, autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2), powerPreference: 'high-performance',
  });
  host.appendChild(app.canvas);

  const kit = new Kit(theme);
  await kit.init();

  const world = new PIXI.Container();
  app.stage.addChild(world);
  const layers = {};
  for (const n of ['back', 'danmaku', 'bubbles', 'fx', 'front', 'hud', 'flash']) { layers[n] = new PIXI.Container(); world.addChild(layers[n]); }
  const mkAdd = (parent) => { const c = new PIXI.Container(); parent.addChild(c); return c; };
  const pBack = new Particles(layers.back, mkAdd(layers.back), 1000);
  const pFront = new Particles(layers.front, mkAdd(layers.front), 1300);

  /* ---------- contexte partagé par les effets ---------- */
  const ctx = {
    kit, theme, layers, pBack, pFront, W: 1920, H: LOGICAL_H, S: 1, time: 0,
    zone: null, zoneRaw: null, avoid: {}, videoRight: 1500,
    shakeAmp: 0, flashAlpha: 0,
    userColor: (u) => theme.palette[u.ci % theme.palette.length],
    avoidRects() { return [this.zone, ...Object.values(this.avoid)].filter(Boolean); },
    shake(a) { this.shakeAmp = Math.max(this.shakeAmp, a); },
    flash(color, a) { flashG.tint = color; this.flashAlpha = Math.max(this.flashAlpha, a); },
  };
  const flashG = new PIXI.Graphics();
  flashG.alpha = 0;
  layers.flash.addChild(flashG);

  const pops = new Pops(ctx), danmaku = new Danmaku(ctx), featured = new Featured(ctx), hearts = new Hearts(ctx);
  const fireworks = new Fireworks(ctx), gauge = new Gauge(ctx), vote = new VoteReveal(ctx), density = new Density(ctx);

  /* ---------- zone protégée (fractions du cadre vidéo) ---------- */
  const videoBox = $('#video-box'), zoneEl = $('#zone');
  let zf = { x: 0.34, y: 0.09, w: 0.32, h: 0.6 };
  try { const s = JSON.parse(localStorage.getItem('scene-pops.zone')); if (s && s.w > 0.05) zf = s; } catch (e) { /* stockage indisponible */ }
  const saveZone = () => { try { localStorage.setItem('scene-pops.zone', JSON.stringify(zf)); } catch (e) { /* ignoré */ } };

  /* ---------- mise en page ---------- */
  let lastW = 0, lastH = 0;
  function layout() {
    const W = app.screen.width, H = app.screen.height;
    lastW = W; lastH = H;
    const S = H / LOGICAL_H;
    world.scale.set(S);
    ctx.S = S; ctx.W = W / S; ctx.H = LOGICAL_H;
    const vw = Math.min(W * 0.58, H * 0.72 * 16 / 9), vh = vw * 9 / 16;
    const vx = (W - vw) / 2, vy = (H - vh) / 2;
    Object.assign(videoBox.style, { left: vx + 'px', top: vy + 'px', width: vw + 'px', height: vh + 'px' });
    Object.assign(zoneEl.style, { left: zf.x * 100 + '%', top: zf.y * 100 + '%', width: zf.w * 100 + '%', height: zf.h * 100 + '%' });
    ctx.videoRight = (vx + vw) / S;
    const raw = { x: (vx + zf.x * vw) / S, y: (vy + zf.y * vh) / S, w: (zf.w * vw) / S, h: (zf.h * vh) / S };
    ctx.zoneRaw = raw;
    const m = 36;   // marge de sécurité autour du visage
    ctx.zone = { x: raw.x - m, y: raw.y - m, w: raw.w + 2 * m, h: raw.h + 2 * m };
    pBack.zone = pFront.zone = ctx.zone;
    danmaku.layout();
    flashG.clear().rect(-50, -50, ctx.W + 100, ctx.H + 100).fill(theme.masque).rect(ctx.zone.x, ctx.zone.y, ctx.zone.w, ctx.zone.h).cut();
  }
  layout();
  window.addEventListener('resize', layout);

  // glisser / redimensionner la zone protégée
  (() => {
    let mode = null, sx = 0, sy = 0, z0 = null;
    zoneEl.addEventListener('pointerdown', (e) => {
      if (zoneEl.dataset.edit !== '1') return;
      mode = e.target.id === 'zone-handle' ? 'size' : 'move';
      sx = e.clientX; sy = e.clientY; z0 = { ...zf };
      zoneEl.setPointerCapture(e.pointerId); e.preventDefault();
    });
    zoneEl.addEventListener('pointermove', (e) => {
      if (!mode) return;
      const r = videoBox.getBoundingClientRect();
      const dx = (e.clientX - sx) / r.width, dy = (e.clientY - sy) / r.height;
      if (mode === 'move') { zf.x = clamp(z0.x + dx, 0, 1 - zf.w); zf.y = clamp(z0.y + dy, 0, 1 - zf.h); }
      else { zf.w = clamp(z0.w + dx, 0.08, 1 - zf.x); zf.h = clamp(z0.h + dy, 0.1, 1 - zf.y); }
      layout();
    });
    const end = () => { if (mode) { mode = null; saveZone(); } };
    zoneEl.addEventListener('pointerup', end); zoneEl.addEventListener('pointercancel', end);
  })();

  /* ---------- vidéo de remplacement : dégradé animé + silhouette dans la zone ---------- */
  const bd = $('#backdrop'), bg = bd.getContext('2d');
  bd.width = 384; bd.height = 216;
  const css = (n, a = 1) => hexToCss(n, a);
  function drawBackdrop(t) {
    const w = bd.width, h = bd.height;
    bg.fillStyle = hexToCss(mix(theme.bg, theme.panel3, 0.6)); bg.fillRect(0, 0, w, h);
    const blobs = [[theme.grn, 0.55, 0.0], [theme.cy, 0.28, 2.1], [theme.or, 0.3, 4.2], [theme.amb, 0.22, 5.3]];
    for (const [col, a, ph] of blobs) {
      const x = w * (0.5 + 0.4 * Math.sin(t * 0.21 + ph)), y = h * (0.5 + 0.35 * Math.cos(t * 0.17 + ph * 1.3));
      const g = bg.createRadialGradient(x, y, 0, x, y, w * 0.55);
      g.addColorStop(0, css(col, a)); g.addColorStop(1, css(col, 0));
      bg.fillStyle = g; bg.fillRect(0, 0, w, h);
    }
    // streamer factice, centré sur la zone protégée
    const cx = (zf.x + zf.w / 2) * w, top = zf.y * h, zw = zf.w * w, zh = zf.h * h;
    const bob = Math.sin(t * 1.4) * 1.2, headR = Math.min(zw * 0.3, zh * 0.26);
    const skin = css(mix(theme.coral3, theme.coral2, 0.35)), cloth = css(mix(theme.panel3, theme.ink2, 0.35));
    bg.fillStyle = cloth; bg.beginPath(); bg.ellipse(cx, top + zh * 1.02 + bob, zw * 0.52, zh * 0.32, 0, 0, Math.PI * 2); bg.fill();
    bg.fillStyle = skin; bg.beginPath(); bg.ellipse(cx, top + zh * 0.42 + bob, headR, headR * 1.2, 0, 0, Math.PI * 2); bg.fill();
    const blink = (t % 4) < 0.12 ? 0.2 : 1;
    bg.fillStyle = css(theme.bg);
    for (const s of [-1, 1]) { bg.beginPath(); bg.ellipse(cx + s * headR * 0.38, top + zh * 0.4 + bob, headR * 0.1, headR * 0.1 * blink, 0, 0, Math.PI * 2); bg.fill(); }
    bg.beginPath(); bg.ellipse(cx, top + zh * 0.5 + bob, headR * 0.22, headR * (0.07 + 0.05 * Math.max(0, Math.sin(t * 5))), 0, 0, Math.PI * 2); bg.fill();
  }

  // webcam
  const cam = $('#cam'); let camStream = null;
  async function toggleCamera() {
    const btn = $('#btn-cam');
    if (camStream) { camStream.getTracks().forEach((t) => t.stop()); camStream = null; cam.srcObject = null; cam.classList.remove('on'); btn.setAttribute('aria-pressed', 'false'); return; }
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      cam.srcObject = camStream; await cam.play(); cam.classList.add('on'); btn.setAttribute('aria-pressed', 'true');
    } catch (e) { camStream = null; note('Caméra indisponible : ' + (e.name || e.message)); }
  }
  let noteTimer = 0;
  function note(t) { status.textContent = t; clearTimeout(noteTimer); noteTimer = setTimeout(() => (status.textContent = ''), 4000); }

  /* ---------- faux public + régulation du débit ---------- */
  const crowd = new Crowd();
  const fx = { pops: true, danmaku: true, fireworks: true, hearts: true, gauge: true };
  const reg = { buf: [], tokens: 0, cap: 9, seen: new Map(), c: { in: 0, shown: 0, sur: 0, rea: 0 }, s: { in: 0, shown: 0, sur: 0, rea: 0 }, recent: [] };

  const surplus = (n = 1) => { reg.c.sur += n; density.surplus(n); };

  crowd.onMessage = (m) => {
    reg.c.in++; gauge.add(1);
    if (Math.random() < 0.28) m.emoji = EMOJIS[(Math.random() * EMOJIS.length) | 0];
    reg.buf.push({ m, t: ctx.time });
    if (reg.buf.length > 160) { reg.buf.shift(); surplus(1); }
  };
  crowd.onReaction = (r) => { reg.c.rea++; gauge.add(0.4); if (fx.fireworks) fireworks.tap(r.emoji); };
  crowd.onLike = () => { gauge.add(0.25); if (fx.hearts) hearts.like(); };
  crowd.onVote = (v) => vote.add(v.option);

  function display(m) {
    const long = m.text.length > 46;
    const wantD = fx.danmaku && (!fx.pops || Math.random() < (long ? 0.08 : 0.45));
    const order = wantD ? ['d', 'p'] : ['p', 'd'];
    let ok = false;
    for (const k of order) {
      if (k === 'p' && fx.pops) ok = pops.add(m);
      else if (k === 'd' && fx.danmaku) ok = danmaku.add(m);
      if (ok) break;
    }
    if (ok) { reg.c.shown++; reg.seen.set(m.user.id, ctx.time); reg.recent.push(m); if (reg.recent.length > 12) reg.recent.shift(); }
    else surplus(1);
  }

  /** plafond d'affichage : seaux à jetons ; priorité aux nouveaux auteurs, aux mentions, aux messages courts */
  function pump(dt) {
    reg.tokens = Math.min(reg.cap * 0.5 + 1, reg.tokens + reg.cap * dt);
    const b = reg.buf;
    while (b.length && ctx.time - b[0].t > 1.2) { b.shift(); surplus(1); }   // trop vieux : il nourrit la densité
    while (reg.tokens >= 1 && b.length) {
      let best = 0, bs = -1;
      const n = Math.min(b.length, 40);
      for (let i = 0; i < n; i++) {
        const { m, t } = b[i];
        const fresh = ctx.time - (reg.seen.get(m.user.id) ?? -99) > 25;
        const s = (fresh ? 3 : 0) + (m.text[0] === '@' ? 1 : 0) + (m.text.length < 40 ? 0.3 : 0) + (ctx.time - t) * 0.8 + Math.random() * 0.6;
        if (s > bs) { bs = s; best = i; }
      }
      const { m } = b.splice(best, 1)[0];
      reg.tokens -= 1;
      display(m);
    }
  }

  /* ---------- déclencheurs ---------- */
  const rndEmoji = () => EMOJIS[(Math.random() * EMOJIS.length) | 0];
  function triggerFeatured() {
    const pool = reg.recent.filter((m) => m.text.length >= 14);
    featured.show(pool.length ? pool[(Math.random() * pool.length) | 0] : crowd.featuredMessage());
  }
  function triggerVote() {
    if (vote.active) return;
    const opts = [{ label: 'Boulange', color: theme.or }, { label: 'Parc', color: theme.cy }, { label: 'Métro', color: theme.grn2 }];
    vote.start(opts, 6.5);
    const w = opts.map(() => 0.3 + Math.random());
    crowd.vote(w, 280, 6.2);
  }
  const triggerBurst = () => crowd.burst(rndEmoji(), 70, 1.8);
  const triggerRocket = () => fireworks.launch(rndEmoji(), true);

  /* ---------- panneau de régie ---------- */
  const panel = $('#panel');
  const rateEl = $('#rate'), capEl = $('#cap');
  function setRate(v) { crowd.rate = clamp(Math.round(v), 1, 60); rateEl.value = crowd.rate; $('#o-rate').textContent = crowd.rate; }
  function setCap(v) { reg.cap = clamp(Math.round(v), 1, 40); capEl.value = reg.cap; $('#o-cap').textContent = reg.cap; }
  rateEl.addEventListener('input', () => setRate(+rateEl.value));
  capEl.addEventListener('input', () => setCap(+capEl.value));

  function setFx(name, on) {
    fx[name] = on;
    if (name === 'gauge') gauge.setEnabled(on);
    const b = document.querySelector(`[data-fx="${name}"]`);
    if (b) b.setAttribute('aria-pressed', String(on));
  }
  const toggles = { pops: 'pops', danmaku: 'danmaku', fireworks: 'fireworks', hearts: 'hearts', gauge: 'gauge' };
  const actions = {
    featured: triggerFeatured, vote: triggerVote, burst: triggerBurst, rocket: triggerRocket,
    zone() { const on = zoneEl.dataset.edit !== '1'; zoneEl.dataset.edit = on ? '1' : '0'; zoneEl.classList.toggle('show', on); $('#btn-zone').setAttribute('aria-pressed', String(on)); },
    cam: toggleCamera,
    full() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); },
    pause() { crowd.paused = !crowd.paused; $('#btn-pause').setAttribute('aria-pressed', String(crowd.paused)); },
    panel() { panel.classList.toggle('closed'); $('#panel-toggle').setAttribute('aria-expanded', String(!panel.classList.contains('closed'))); },
    hud() { document.body.classList.toggle('clean'); },
  };
  const PRESETS = {
    calme: { rate: 5, cap: 5, fx: { pops: true, danmaku: false, fireworks: true, hearts: true, gauge: false } },
    chat: { rate: 20, cap: 9, fx: { pops: true, danmaku: true, fireworks: true, hearts: true, gauge: true } },
    folie: { rate: 50, cap: 14, fx: { pops: true, danmaku: true, fireworks: true, hearts: true, gauge: true } },
  };
  function preset(n) { const p = PRESETS[n]; setRate(p.rate); setCap(p.cap); for (const k in p.fx) setFx(k, p.fx[k]); crowd.autoBursts = n !== 'calme'; note('Gabarit : ' + n); }

  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.fx) setFx(b.dataset.fx, !fx[b.dataset.fx]);
    else if (b.dataset.act) actions[b.dataset.act]();
    else if (b.dataset.preset) preset(b.dataset.preset);
    b.blur();
  });
  $('#panel-toggle').addEventListener('click', actions.panel);

  const KEYS = {
    Digit1: () => setFx('pops', !fx.pops), Digit2: () => setFx('danmaku', !fx.danmaku), Digit3: triggerFeatured, Digit4: () => setFx('fireworks', !fx.fireworks),
    Digit5: () => setFx('hearts', !fx.hearts), Digit6: () => setFx('gauge', !fx.gauge), Digit7: triggerVote, Digit8: triggerBurst, Digit9: triggerRocket,
    KeyQ: () => preset('calme'), KeyW: () => preset('chat'), KeyE: () => preset('folie'),
    KeyZ: actions.zone, KeyP: actions.panel, KeyF: actions.full, KeyC: actions.cam, KeyH: actions.hud, Space: actions.pause,
    ArrowUp: () => setRate(crowd.rate + 5), ArrowDown: () => setRate(crowd.rate - 5),
    ArrowRight: () => setCap(reg.cap + 2), ArrowLeft: () => setCap(reg.cap - 2),
  };
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.code.startsWith('Arrow')) return;
    const code = e.code.replace('Numpad', 'Digit');
    const fn = KEYS[code]; if (!fn || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault(); fn();
  });
  // curseur masqué après 3 s d'inactivité (projecteur)
  let idle = 0;
  window.addEventListener('pointermove', () => { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('idle'), 3000); });

  setRate(20); setCap(9);
  ['pops', 'danmaku', 'fireworks', 'hearts', 'gauge'].forEach((k) => setFx(k, true));

  /* ---------- boucle ---------- */
  const hud = $('#fps'), hudInfo = $('#info');
  const frames = []; let hudT = 0, secT = 0, lastLoad = 0;
  const shakeEl = $('#shake');
  let bdT = 0;

  let jsMs = 0;
  app.ticker.add((tk) => {
    const t0 = performance.now();
    const dtRaw = tk.deltaMS / 1000;
    const dt = Math.min(dtRaw, 1 / 20);
    ctx.time += dt;
    frames.push(tk.deltaMS); if (frames.length > 90) frames.shift();
    if (app.screen.width !== lastW || app.screen.height !== lastH) layout();

    crowd.update(dt);
    pump(dt);
    pops.update(dt); danmaku.update(dt); featured.update(dt); hearts.update(dt); fireworks.update(dt);
    gauge.update(dt); vote.update(dt); density.update(dt);
    pBack.update(dt); pFront.update(dt);

    // tremblement et flash
    if (ctx.shakeAmp > 0.3) {
      const a = ctx.shakeAmp * ctx.S;
      shakeEl.style.transform = `translate(${((Math.random() - 0.5) * a).toFixed(1)}px,${((Math.random() - 0.5) * a).toFixed(1)}px)`;
      ctx.shakeAmp *= Math.exp(-dt * 7);
    } else if (ctx.shakeAmp !== 0) { ctx.shakeAmp = 0; shakeEl.style.transform = ''; }
    if (ctx.flashAlpha > 0.005) { flashG.alpha = ctx.flashAlpha; ctx.flashAlpha *= Math.exp(-dt * 5); } else { ctx.flashAlpha = 0; flashG.alpha = 0; }

    // fond (30 i/s suffisent)
    bdT += dt; if (!camStream && bdT > 1 / 30) { bdT = 0; drawBackdrop(ctx.time); }

    jsMs += (performance.now() - t0 - jsMs) * 0.1;

    // statistiques
    secT += dt;
    if (secT >= 1) {
      reg.s = { ...reg.c }; reg.c = { in: 0, shown: 0, sur: 0, rea: 0 }; secT = 0;
    }
    hudT += dtRaw;
    if (hudT > 0.25) {
      hudT = 0;
      const avg = frames.reduce((a, b) => a + b, 0) / frames.length, worst = Math.max(...frames);
      hud.textContent = Math.round(1000 / avg) + ' FPS';
      hud.dataset.level = avg < 20 ? 'bad' : avg < 30 ? 'warn' : 'ok';
      hudInfo.textContent = `min ${Math.round(1000 / worst)}  ·  reçus ${reg.s.in}/s  ·  affichés ${reg.s.shown}/s  ·  surplus ${reg.s.sur}/s  ·  taps ${reg.s.rea}/s\n` +
        `bulles ${pops.count}  danmaku ${danmaku.count}  particules ${pBack.count + pFront.count}  ·  js ${jsMs.toFixed(1)} ms`;
    }
  });

  window.sceneDebug = { ctx, app, crowd, reg, pops, danmaku, fireworks, vote, gauge, featured, hearts, setRate, setCap, setFx, preset, PIXI };
  $('#loading').remove();
}

main().catch((e) => {
  console.error(e);
  const l = document.querySelector('#loading');
  if (l) l.textContent = 'Erreur : ' + (e && e.message ? e.message : e);
});
