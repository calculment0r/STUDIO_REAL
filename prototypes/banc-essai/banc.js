/* ============================================================
   BANC D'ESSAI P0.1 — noyau : déblocage, cartes, résumé, rapport.
   Les tests eux-mêmes sont dans tests.js. Aucun serveur, aucun build.
   ============================================================ */
import { creerTests } from './tests.js';

const CLE = 'banc-essai-p01-v1';
const VERSION_BANC = '0.1.1';

/* ── petits outils ───────────────────────────────────────── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SPECIAUX = new Set(['switch', 'list', 'style', 'for', 'form']);

function h(tag, attrs, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k in e && !SPECIAUX.has(k)) e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  const ajouter = (x) => {
    if (x == null || x === false) return;
    if (Array.isArray(x)) x.forEach(ajouter);
    else e.append(x instanceof Node ? x : document.createTextNode(String(x)));
  };
  enfants.forEach(ajouter);
  return e;
}

const erreur = (e) => `${e?.name || 'Erreur'}${e?.message ? ' : ' + e.message : ''}`;
const $ = (id) => document.getElementById(id);

/* ── détection appareil ──────────────────────────────────── */
const ua = navigator.userAgent || '';
const estIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const estAndroid = /Android/i.test(ua);
const standalone = () =>
  navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

const APPS_INTEGREES = [
  [/FBAN|FBAV|FB_IAB|FBIOS/, 'Facebook'],
  [/Instagram/i, 'Instagram'],
  [/Messenger|MessengerLite/i, 'Messenger'],
  [/Snapchat/i, 'Snapchat'],
  [/TikTok|musical_ly|BytedanceWebview|trill_|ByteLocale/i, 'TikTok'],
  [/Twitter|TwitterAndroid/i, 'Twitter / X'],
  [/LinkedInApp/i, 'LinkedIn'],
  [/MicroMessenger/i, 'WeChat'],
  [/Line\//i, 'LINE'],
  [/Pinterest/i, 'Pinterest'],
  [/WhatsApp/i, 'WhatsApp'],
  [/Telegram/i, 'Telegram'],
  [/KAKAOTALK/i, 'KakaoTalk'],
  [/Discord/i, 'Discord'],
  [/GSA\//, 'Appli Google'],
  [/Gmail|GoogleApp/i, 'Google (Gmail)'],
  [/Outlook/i, 'Outlook'],
];

function navigateurIntegre() {
  for (const [re, nom] of APPS_INTEGREES) if (re.test(ua)) return nom;
  if (estAndroid && /; wv\)/.test(ua)) return 'WebView Android (appli inconnue)';
  if (estIOS && !/Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return 'WKWebView iOS (appli inconnue)';
  return null;
}

function nomNavigateur() {
  if (/CriOS/.test(ua)) return 'Chrome iOS';
  if (/FxiOS/.test(ua)) return 'Firefox iOS';
  if (/EdgiOS|EdgA|Edg\//.test(ua)) return 'Edge';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/OPR\/|OPiOS/.test(ua)) return 'Opera';
  if (/Firefox/.test(ua)) return 'Firefox';
  if (/Chrome/.test(ua)) return 'Chrome';
  if (/Safari/.test(ua)) return 'Safari';
  return 'inconnu';
}

function versionOS() {
  let m;
  if (estIOS && (m = ua.match(/OS (\d+)[_.](\d+)(?:[_.](\d+))?/))) return `iOS ${m[1]}.${m[2]}${m[3] ? '.' + m[3] : ''}`;
  if (estAndroid && (m = ua.match(/Android (\d+(?:\.\d+)?)/))) return `Android ${m[1]}`;
  return null;
}

function infos() {
  const uad = navigator.userAgentData;
  const c = navigator.connection;
  return {
    userAgent: ua,
    plateforme: uad?.platform || navigator.platform || null,
    os: estIOS ? (/iPad/.test(ua) || navigator.platform === 'MacIntel' ? 'iPadOS/iOS' : 'iOS') : estAndroid ? 'Android' : 'autre',
    versionOS: versionOS(),
    mobileUAData: uad ? uad.mobile : null,
    marques: uad?.brands ? uad.brands.map((b) => `${b.brand} ${b.version}`) : null,
    navigateur: nomNavigateur(),
    navigateurIntegre: navigateurIntegre(),
    standalone: standalone(),
    modeAffichage: ['fullscreen', 'standalone', 'minimal-ui', 'browser'].find((m) => matchMedia(`(display-mode: ${m})`).matches) || null,
    contexteSecurise: window.isSecureContext,
    ecran: { w: screen.width, h: screen.height, dpr: window.devicePixelRatio, profondeur: screen.colorDepth },
    fenetre: { w: innerWidth, h: innerHeight, vvH: window.visualViewport ? Math.round(window.visualViewport.height) : null },
    orientation: screen.orientation?.type || null,
    langue: navigator.language,
    langues: navigator.languages ? [...navigator.languages] : null,
    fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone,
    pointsTactiles: navigator.maxTouchPoints,
    coeurs: navigator.hardwareConcurrency ?? null,
    memoireGo: navigator.deviceMemory ?? null,
    reseau: c ? { type: c.effectiveType, downlinkMbps: c.downlink, rttMs: c.rtt, economieDonnees: c.saveData } : null,
    enLigne: navigator.onLine,
    themeSystemeSombre: matchMedia('(prefers-color-scheme: dark)').matches,
    reduireMouvement: matchMedia('(prefers-reduced-motion: reduce)').matches,
    presseP: !!navigator.clipboard?.writeText,
  };
}

/* ── état global ─────────────────────────────────────────── */
const S = {
  id: Math.random().toString(36).slice(2, 8),
  nom: '',
  res: {},            // id -> { auto, detail, donnees, user, ts }
  deb: null,          // résultat du déblocage
  ctxAudio: null,
  wl: null,
  veutWL: false,
  wlReprises: 0,
  lumiereOK: false,
  reduit: matchMedia('(prefers-reduced-motion: reduce)').matches,
};

function sauver() {
  try { localStorage.setItem(CLE, JSON.stringify({ id: S.id, nom: S.nom, res: S.res, deb: S.deb })); } catch (_) { /* stockage indisponible */ }
}
function recharger() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE) || 'null');
    if (v && v.res) { S.id = v.id || S.id; S.nom = v.nom || ''; S.res = v.res; S.deb = v.deb || null; return true; }
  } catch (_) { /* ignore */ }
  return false;
}

/* ── thème : couleur de la barre du navigateur, depuis le jeton --bg ── */
function poserCouleurBarre() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const m = document.querySelector('meta[name="theme-color"]');
  if (m && bg) m.setAttribute('content', bg);
}

/* icône d'écran d'accueil iOS dessinée à la volée avec les jetons (aucune couleur en dur) */
function poserIcone() {
  try {
    const cs = getComputedStyle(document.documentElement);
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const g = c.getContext('2d');
    g.fillStyle = cs.getPropertyValue('--bg').trim(); g.fillRect(0, 0, 180, 180);
    g.fillStyle = cs.getPropertyValue('--ort').trim(); g.fillRect(45, 45, 90, 90);
    g.fillStyle = cs.getPropertyValue('--on-ort').trim(); g.fillRect(78, 78, 24, 24);
    const l = h('link', { rel: 'apple-touch-icon', href: c.toDataURL('image/png') });
    document.head.append(l);
  } catch (_) { /* ignore */ }
}

/* ── audio / veille ──────────────────────────────────────── */
function audio() {
  if (!S.ctxAudio) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Web Audio absent');
    S.ctxAudio = new AC();
  }
  return S.ctxAudio;
}
async function audioPret() {
  const ctx = audio();
  if (ctx.state !== 'running') await Promise.race([ctx.resume().catch(() => {}), sleep(1200)]);
  return ctx;
}

async function prendreWL() {
  if (!navigator.wakeLock) throw new Error('navigator.wakeLock absent');
  S.veutWL = true;
  const s = await navigator.wakeLock.request('screen');
  S.wl = s;
  s.addEventListener('release', () => { if (S.wl === s) S.wl = null; majEntete(); });
  majEntete();
  return s;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.veutWL && !S.wl) {
    prendreWL().then(() => { S.wlReprises++; }).catch(() => {});
  }
});

/* ── service worker (notifications Android + PWA) ────────── */
let swPromesse = null;
function sw() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  swPromesse ??= navigator.serviceWorker.register('./sw.js')
    .then(() => Promise.race([navigator.serviceWorker.ready, sleep(4000).then(() => null)]))
    .catch(() => null);
  return swPromesse;
}

/* ── plein écran de test + avertissement photosensibilité ── */
function ouvrirPlein({ fond = 'var(--black)', texte = 'Touche l’écran pour arrêter' } = {}) {
  const o = h('div', { class: 'plein', role: 'dialog', 'aria-label': 'Test plein écran' },
    h('div', { class: 'plein-hint' }, texte));
  o.style.background = fond;
  document.body.append(o);
  let fini = false;
  const fin = new Promise((res) => {
    const f = () => { if (!fini) { fini = true; res('touche'); } };
    o.addEventListener('pointerdown', f, { once: true });
    window.addEventListener('keydown', f, { once: true });
  });
  return {
    fin,
    fond(f) { o.style.background = f; },
    get termine() { return fini; },
    fermer() { fini = true; o.remove(); },
  };
}

function confirmerLumiere() {
  if (S.lumiereOK) return Promise.resolve(true);
  return new Promise((res) => {
    const fermer = (v) => { v2.remove(); if (v) S.lumiereOK = true; res(v); };
    const v2 = h('div', { class: 'voile', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'mod-t' },
      h('div', { class: 'modale' },
        h('h2', { id: 'mod-t' }, 'Attention : lumière'),
        h('p', {}, 'Ce test change la couleur de l’écran ou le fait clignoter, ou allume la lampe. Au maximum 3 changements par seconde.'),
        h('p', {}, 'Ne le lance pas si tu es sensible aux lumières vives (épilepsie photosensible, migraines). Tu peux l’arrêter en touchant l’écran.'),
        h('button', { class: 'btn go', type: 'button', onclick: () => fermer(true) }, 'Je comprends, continuer'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => fermer(false) }, 'Annuler'),
      ));
    document.body.append(v2);
    v2.querySelector('.btn.ghost').focus();
  });
}

/* ── message flottant ────────────────────────────────────── */
let tStatut = 0;
function statut(msg) {
  const e = $('statut');
  e.textContent = msg; e.hidden = false;
  clearTimeout(tStatut);
  tStatut = setTimeout(() => { e.hidden = true; }, 3500);
}

/* ── pont vers tests.js ──────────────────────────────────── */
const B = {
  h, sleep, S, erreur, audio, audioPret, prendreWL, sw, ouvrirPlein, confirmerLumiere, infos,
  estIOS, estAndroid, standalone,
  reduit: () => S.reduit,
};
const TESTS = creerTests(B);

/* ── cartes ──────────────────────────────────────────────── */
const LIBELLE_ETAT = { ok: 'OK', ko: 'KO', partiel: 'Partiel', attente: 'En attente' };

function majBouton(t) {
  const u = t.ui;
  u.btn.disabled = !!t.enCours && !t.actif;
  u.btn.textContent = t.actif ? 'Arrêter' : t.enCours ? 'En cours…' : S.res[t.id] ? 'Retester' : 'Tester';
  u.btn.className = t.actif ? 'btn ghost' : 'btn go';
}

function majCarte(t) {
  const r = S.res[t.id];
  const u = t.ui;
  u.badge.dataset.etat = r?.auto || 'nt';
  u.badge.textContent = r ? LIBELLE_ETAT[r.auto] || r.auto : 'Non testé';
  u.detail.textContent = r?.detail || '';
  u.carte.classList.toggle('fait', !!r && r.auto === 'ok');
  if (t.subjectif) {
    u.rep.hidden = !r;
    u.repOk.setAttribute('aria-pressed', String(r?.user === 'ok'));
    u.repRien.setAttribute('aria-pressed', String(r?.user === 'rien'));
  }
  majBouton(t);
}

function enregistrer(id, patch) {
  const t = TESTS.find((x) => x.id === id);
  const prec = S.res[id] || {};
  S.res[id] = { ...prec, ...patch, ts: Date.now() };
  if (t) majCarte(t);
  planifierLourd();
}

/* La carte se met à jour tout de suite (peu coûteux) ; la sauvegarde, le résumé et le JSON
   sont regroupés (au plus un par 400 ms) car les tests en direct (capteurs, micro) appellent maj() à 60 Hz. */
let tLourd = 0;
function planifierLourd() {
  if (tLourd) return;
  tLourd = setTimeout(() => { tLourd = 0; sauver(); majResume(); majEntete(); }, 400);
}

async function arreterTest(t) {
  try { await t.arreter?.(); } catch (_) { /* ignore */ }
  t.actif = false;
  majBouton(t);
}

async function lancer(t) {
  if (t.enCours && !t.actif) return;
  if (t.actif) { await arreterTest(t); t.enCours = false; majBouton(t); return; }
  for (const u of TESTS) if (u !== t && u.actif && !u.passif) await arreterTest(u);
  t.enCours = true;
  t.ui.zone.replaceChildren();
  majBouton(t);
  const c = {
    zone: t.ui.zone,
    maj: (p) => enregistrer(t.id, p),
    actif: (v) => { t.actif = !!v; majBouton(t); },
  };
  try {
    const r = await t.lancer(c);
    if (r) enregistrer(t.id, r);
  } catch (e) {
    enregistrer(t.id, { auto: 'ko', detail: erreur(e) });
  }
  t.enCours = false;
  majBouton(t);
}

function repondre(t, v) {
  const r = S.res[t.id];
  if (!r) return;
  r.user = r.user === v ? null : v;
  majCarte(t);
  sauver();
  majResume();
}

function support(t) {
  try { return t.support ? t.support() : null; } catch (_) { return null; }
}

function construireCarte(t) {
  const badge = h('span', { class: 'badge' }, 'Non testé');
  const api = h('span', { class: 'api' });
  const s = support(t);
  if (s === true) { api.dataset.etat = 'oui'; api.textContent = 'API présente'; }
  else if (s === false) { api.dataset.etat = 'non'; api.textContent = 'API absente'; }
  else api.hidden = true;
  const detail = h('p', { class: 'detail' });
  detail.setAttribute('aria-live', 'polite');
  const zone = h('div', { class: 'zone' });
  const btn = h('button', { class: 'btn go', type: 'button', onclick: () => lancer(t) }, 'Tester');
  const repOk = h('button', { class: 'btn ok', type: 'button', 'aria-pressed': 'false', onclick: () => repondre(t, 'ok') }, 'Ça marche');
  const repRien = h('button', { class: 'btn ghost', type: 'button', 'aria-pressed': 'false', onclick: () => repondre(t, 'rien') }, 'Rien');
  const rep = h('div', { class: 'rep', hidden: true }, repOk, repRien);
  const carte = h('article', { class: 'carte', id: 'test-' + t.id },
    h('h2', {}, t.titre),
    h('div', { class: 'etat' }, badge, api),
    h('p', { class: 'aide' }, t.aide),
    detail, zone, btn,
    t.subjectif ? rep : null,
  );
  t.ui = { carte, badge, api, detail, zone, btn, rep, repOk, repRien };
  majCarte(t);
  return carte;
}

/* ── carte « déblocage » ─────────────────────────────────── */
function carteDeblocage() {
  const d = S.deb;
  const chips = h('div', { class: 'chips' });
  const nom = { audio: 'Son', pleinEcran: 'Plein écran', wakeLock: 'Veille bloquée', mouvement: 'Mouvement', orientation: 'Orientation' };
  if (d) {
    for (const [k, lib] of Object.entries(nom)) {
      const x = d[k];
      if (!x) continue;
      const etat = x.ok ? (x.neutre ? 'attente' : 'ok') : 'ko';
      chips.append(h('span', { class: 'badge', 'data-etat': etat, title: x.detail || '' }, `${lib} : ${x.ok ? x.detail || 'oui' : 'non'}`));
    }
  } else {
    chips.append(h('span', { class: 'badge', 'data-etat': 'attente' }, 'Rien d’autorisé (déblocage passé)'));
  }
  const details = d ? h('p', { class: 'detail' },
    Object.entries(nom).map(([k, lib]) => (d[k] && !d[k].ok ? `${lib} : ${d[k].detail}. ` : '')).join('')) : null;
  return h('article', { class: 'carte' },
    h('h2', {}, 'Déblocage au premier toucher'),
    h('p', { class: 'aide' }, 'Résultat des autorisations demandées en un seul geste. Chaque test ci-dessous peut les redemander.'),
    chips, details);
}

/* ── résumé + rapport ────────────────────────────────────── */
function rapport() {
  const tests = {};
  const cpt = { ok: 0, ko: 0, partiel: 0, attente: 0, non_teste: 0 };
  for (const t of TESTS) {
    const r = S.res[t.id];
    const auto = r?.auto || 'non_teste';
    cpt[auto] = (cpt[auto] || 0) + 1;
    tests[t.id] = {
      titre: t.titre,
      apiPresente: support(t),
      auto,
      utilisateur: r?.user ?? null,
      detail: r?.detail ?? null,
      donnees: r?.donnees ?? null,
    };
  }
  return {
    banc: 'STUDIO_REAL P0.1',
    versionBanc: VERSION_BANC,
    rapportId: S.id,
    date: new Date().toISOString(),
    modele: S.nom || null,
    deblocage: S.deb,
    appareil: infos(),
    resume: cpt,
    tests,
  };
}
const rapportJSON = () => JSON.stringify(rapport(), null, 2);

async function copier(texte) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(texte); return true; }
  } catch (_) { /* repli */ }
  try {
    const ta = h('textarea', { value: texte });
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(ta);
    ta.focus(); ta.select(); ta.setSelectionRange(0, texte.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (_) { return false; }
}

let elResume = null;
function majResume() {
  if (!elResume) return;
  const corps = elResume.tbody;
  corps.replaceChildren();
  for (const t of TESTS) {
    const r = S.res[t.id];
    const cls = r ? 't-' + r.auto : 't-nt';
    const toi = r?.user === 'ok' ? 'Ça marche' : r?.user === 'rien' ? 'Rien' : t.subjectif ? '—' : '';
    corps.append(h('tr', {},
      h('td', {}, t.titre),
      h('td', { class: cls }, r ? LIBELLE_ETAT[r.auto] || r.auto : 'Non testé'),
      h('td', { class: r?.user === 'rien' ? 't-ko' : r?.user === 'ok' ? 't-ok' : 't-nt' }, toi)));
  }
  elResume.json.value = rapportJSON();
}

function carteResume() {
  const tbody = h('tbody');
  const json = h('textarea', { class: 'json', readOnly: true, 'aria-label': 'Rapport JSON' });
  json.addEventListener('focus', () => json.select());
  const champNom = h('input', {
    class: 'champ', type: 'text', placeholder: 'Modèle du téléphone (ex. iPhone 13, Pixel 8)',
    autocomplete: 'off', value: S.nom, 'aria-label': 'Modèle du téléphone',
  });
  champNom.addEventListener('input', () => { S.nom = champNom.value.trim(); sauver(); json.value = rapportJSON(); });

  const btnCopier = h('button', { class: 'btn go', type: 'button' }, 'Copier le rapport');
  btnCopier.addEventListener('click', async () => {
    const ok = await copier(rapportJSON());
    statut(ok ? 'Rapport copié dans le presse-papiers.' : 'Copie impossible : ouvre « Voir le JSON » et copie à la main.');
  });
  const btnPartager = h('button', { class: 'btn ok', type: 'button' }, 'Partager');
  btnPartager.addEventListener('click', async () => {
    const texte = rapportJSON();
    if (!navigator.share) {
      const ok = await copier(texte);
      statut(ok ? 'Partage indisponible : rapport copié à la place.' : 'Partage et copie indisponibles : copie le JSON à la main.');
      return;
    }
    try {
      await navigator.share({ title: `Banc d’essai STUDIO_REAL — ${S.nom || S.id}`, text: texte });
      statut('Rapport partagé.');
    } catch (e) {
      if (e?.name === 'AbortError') return;
      const ok = await copier(texte);
      statut(ok ? `Partage refusé (${e?.name}) : rapport copié.` : `Partage refusé (${e?.name}).`);
    }
  });
  const btnEffacer = h('button', { class: 'btn ghost petit-btn', type: 'button' }, 'Effacer tous les résultats');
  btnEffacer.addEventListener('click', () => {
    if (!confirm('Effacer tous les résultats de ce téléphone ?')) return;
    S.res = {};
    sauver();
    for (const t of TESTS) { t.ui.zone.replaceChildren(); majCarte(t); }
    majResume(); majEntete();
  });

  elResume = { tbody, json };
  const carte = h('article', { class: 'carte', id: 'resume' },
    h('h2', {}, 'Résumé et rapport'),
    h('p', { class: 'aide' }, 'Quand tu as fini, copie le rapport (ou partage-le) et envoie-le : on compile les téléphones à la main. Aucune donnée n’est envoyée automatiquement. La position GPS n’est jamais incluse.'),
    champNom,
    h('table', { class: 'resume' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Test'), h('th', {}, 'Auto'), h('th', {}, 'Toi'))), tbody),
    h('div', { class: 'rangee' }, btnCopier, btnPartager),
    h('details', {}, h('summary', {}, 'Voir le JSON'), json),
    btnEffacer);
  majResume();
  return carte;
}

/* ── en-tête ─────────────────────────────────────────────── */
function majEntete() {
  const n = Object.keys(S.res).length;
  $('progres').textContent = `${n} / ${TESTS.length} testés`;
  const v = $('veille');
  v.dataset.etat = S.wl ? 'oui' : 'non';
  v.textContent = S.wl ? 'veille bloquée' : 'veille libre';
}

/* ── construction de la liste ────────────────────────────── */
const GROUPES = [
  ['lumiere', 'Écran et lumière'],
  ['sens', 'Son et sensations'],
  ['systeme', 'Écran, système, mise en page'],
  ['capteurs', 'Capteurs'],
  ['medias', 'Micro et caméra'],
  ['messages', 'Messages et partage'],
  ['reseau', 'Réseau et données'],
  ['appareil', 'Appareil'],
];

function construireListe() {
  const contenu = $('contenu');
  contenu.replaceChildren();

  contenu.append(
    h('article', { class: 'carte' },
      h('h2', {}, 'Avant de commencer'),
      h('div', { class: 'avert', role: 'note' },
        h('b', {}, 'Photosensibilité'),
        'Les tests de lumière (couleurs, flash, lampe) demandent une confirmation et ne dépassent jamais 3 changements par seconde. Touche l’écran pour les arrêter.'),
      h('label', { class: 'option' },
        h('input', { type: 'checkbox', checked: S.reduit, onchange: (e) => { S.reduit = e.target.checked; } }),
        'Réduire les effets lumineux (plus lent, un seul flash)'),
      h('p', { class: 'aide' }, 'Pour chaque test : appuie sur « Tester ». Quand le résultat dépend de ce que tu vois, entends ou sens, dis-le avec « Ça marche » ou « Rien ». Les tests peuvent se faire dans n’importe quel ordre.'),
    ),
    carteDeblocage(),
  );

  for (const [g, titre] of GROUPES) {
    const liste = TESTS.filter((t) => t.groupe === g);
    if (!liste.length) continue;
    contenu.append(h('h2', { class: 'groupe' }, titre));
    liste.forEach((t) => contenu.append(construireCarte(t)));
  }

  contenu.append(h('h2', { class: 'groupe' }, 'Fin'), carteResume());
  majEntete();
}

/* ── déblocage en un geste ───────────────────────────────── */
/* Tout est DÉMARRÉ de façon synchrone dans le gestionnaire du toucher (iOS exige le geste utilisateur
   pour requestPermission et le plein écran) ; on n'attend les promesses qu'ensuite. */
function pSure(fn) {
  try { return Promise.resolve(fn()).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e })); }
  catch (e) { return Promise.resolve({ ok: false, e }); }
}

async function debloquer() {
  const pAudio = pSure(() => {
    const ctx = audio();
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
    return ctx.resume().then(() => ctx.state);
  });
  const pFs = pSure(() => {
    const el = document.documentElement;
    const rf = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!rf) throw new Error('Fullscreen API absente');
    return rf.call(el);
  });
  const pWL = pSure(() => prendreWL());
  const demande = (Cls, nom) => pSure(() => {
    if (!Cls) throw new Error(nom + ' absent');
    return typeof Cls.requestPermission === 'function' ? Cls.requestPermission() : 'inutile';
  });
  const pMouv = demande(window.DeviceMotionEvent, 'DeviceMotionEvent');
  const pOri = demande(window.DeviceOrientationEvent, 'DeviceOrientationEvent');
  sw();

  const [a, f, w, m, o] = await Promise.all([pAudio, pFs, pWL, pMouv, pOri]);
  const perm = (x) => (x.ok
    ? { ok: x.v === 'granted' || x.v === 'inutile', neutre: x.v === 'inutile', detail: x.v === 'inutile' ? 'pas de demande nécessaire' : x.v }
    : { ok: false, detail: erreur(x.e) });
  S.deb = {
    audio: a.ok ? { ok: a.v === 'running', detail: `AudioContext ${a.v}` } : { ok: false, detail: erreur(a.e) },
    pleinEcran: f.ok ? { ok: true, detail: 'activé' } : { ok: false, detail: erreur(f.e) },
    wakeLock: w.ok ? { ok: true, detail: 'actif' } : { ok: false, detail: erreur(w.e) },
    mouvement: perm(m),
    orientation: perm(o),
  };
  sauver();
}

function entrer() {
  $('accueil').hidden = true;
  $('banc').hidden = false;
  construireListe();
  scrollTo(0, 0);
}

function init() {
  poserCouleurBarre();
  poserIcone();
  recharger();
  $('go').addEventListener('click', async () => {
    const b = $('go');
    b.disabled = true; b.textContent = 'Un instant…';
    await debloquer();
    entrer();
  });
  $('sans').addEventListener('click', () => { S.deb = null; entrer(); });
}

init();
