// Aperçus vivants des blocs, dessinés sur <canvas> à 216 × 92 (unités du design).
// Port fidèle de `D` (studio-real/blocs.js) et `KD` (conducteur-core.js), plus les 10 aperçus de l'étude et les 2 des
// figurants IA.
import { BORNE_BOUCLE, COMMANDES_MACHINE } from '@studio-real/modele';
import { trouverBloc, valeurReglage } from './catalogue';
import { F, MSGS, OPTS, TEAMS, av, dot, emb, feu, fm, fr, phone, ring, seats, seg7, sr, tx, wave, type Ctx } from './dessin';
import type { Palette } from './palette';
import type { Simulation } from './simulation';

/** Largeur et hauteur de référence d'un aperçu (le corps du bloc sur la planche). */
export const LARGEUR_APERCU = 216;
export const HAUTEUR_APERCU = 92;

export interface OptionsApercu {
  /** Couleur d'accent du bloc (déjà déclinée pour le thème). */
  k: string;
  /** L'étape est en cours (`actif`). */
  run: boolean;
  live: boolean;
  cur: boolean;
  /** Rotatifs k[1], k[2] ramenés à 0 → 1. */
  p: number[];
  /** Progression dans l'étape 0 → 1, temps restant et durée prévue (s), temps écoulé dans l'étape (s). */
  prog: number;
  rem: number;
  dur: number;
  te: number;
  /** Valeur lue (présents pour « attente », dB pour « calage »). */
  val: number | null;
  /** Issue : lettre, choisie ou non, % des voix. */
  lab: string;
  chosen: boolean;
  pct: number;
  /** Nom du média (son). */
  asset: string;
  /** État d'un point d'arrêt : ARMÉ, PASSAGE, RETENU. */
  gst?: string;
  params?: Record<string, unknown>;
}

export type DessinApercu = (c: Ctx, w: number, h: number, t: number, C: Palette, S: Simulation, o: OptionsApercu) => void;

const D: Record<string, DessinApercu> = {};

/* ───────────── étapes de base (KD de conducteur-core.js) ───────────── */

D['k:attente'] = (c, w, h, _t, C, _S, o) => {
  const n = Math.max(0, Math.round(o.val || 0)), cols = 17, rows = 4, cw = 7, g = 2.4, x0 = 12, y0 = 14, on = Math.round(n / 142 * cols * rows);
  for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) fr(c, x0 + i * (cw + g), y0 + r * (cw + g), cw, cw, r * cols + i < on ? o.k : C['--panel3']);
  tx(c, 'SCÈNE', x0, y0 + rows * (cw + g) + 7, F.m(6), C['--ink3'], 'left', '1px');
  tx(c, String(n), w - 12, h - 20, F.d(18), C['--cy'], 'right', '1px');
  tx(c, 'ASSIS · 142 PLACES', 12, h - 10, F.m(6.5), C['--ink3'], 'left', '1px');
};
D['k:calage'] = (c, w, h, _t, C, _S, o) => {
  const db = o.val == null ? 50 : o.val, segs = 26, x0 = 12, W = w - 24, sw = W / segs;
  for (let i = 0; i < segs; i++) { const lv = 32 + i * 40 / segs; fr(c, x0 + i * sw, 26, sw - 2, 18, lv <= db ? (lv > 40 ? C['--or'] : C['--grn2']) : C['--panel3']); }
  const sx = x0 + .2 * W; fr(c, sx - .75, 20, 1.5, 30, C['--ink']); tx(c, 'SEUIL 40 DB', sx, 12, F.m(6.5), C['--ink2'], 'center', '1px');
  tx(c, Math.round(db) + ' DB', 12, h - 16, F.d(15), db <= 40 ? C['--grn2'] : C['--or'], 'left', '1px');
  tx(c, db <= 40 ? 'SALLE CALME' : 'BRUIT DE SALLE', w - 12, h - 16, F.m(7), C['--ink3'], 'right', '1px');
};
D['k:scene'] = (c, w, h, _t, C, _S, o) => {
  tx(c, fm(o.run ? o.rem : o.dur), 12, 30, F.d(24), o.run ? o.k : C['--ink2'], 'left', '2px');
  tx(c, o.run ? 'EN SCÈNE' : o.prog >= 1 ? 'JOUÉE' : 'PRÊTE', w - 12, 14, F.m(7), o.run ? C['--or'] : C['--ink3'], 'right', '1px');
  const x0 = 12, W = w - 24; for (let i = 0; i <= 30; i++) fr(c, x0 + i * W / 30, 56, 1, i % 5 ? 4 : 8, C['--ink3']);
  fr(c, x0, 70, W, 2, C['--panel3']); fr(c, x0, 70, W * o.prog, 2, o.k);
  tx(c, 'DURÉE PRÉVUE ' + fm(o.dur), 12, h - 8, F.m(6.5), C['--ink3'], 'left', '1px');
};
D['k:son'] = (c, w, h, _t, C, _S, o) => {
  const x0 = 12, W = w - 24, mid = 36, A = 22, n = 110;
  for (let i = 0; i < n; i++) {
    const u = i / n, a = (.3 + .7 * Math.abs(Math.sin(u * 17.3 + 1.1) * Math.sin(u * 5.1 + .4))) * (.55 + .45 * Math.abs(Math.sin(u * 61 + .3)));
    c.globalAlpha = u <= o.prog ? 1 : .45; fr(c, x0 + u * W, mid - a * A, 1.1, Math.max(1, 2 * a * A), u <= o.prog ? o.k : C['--ink3']);
  }
  c.globalAlpha = 1;
  if (o.run) fr(c, x0 + W * o.prog - .75, mid - A - 4, 1.5, 2 * A + 8, C['--or']);
  tx(c, String(o.asset || 'piste son').slice(0, 22).toUpperCase(), 12, h - 9, F.m(6.5), C['--ink3'], 'left', '1px');
  tx(c, fm(o.run ? o.rem : o.dur), w - 12, h - 9, F.d(10), C['--cy'], 'right');
};
D['k:lumiere'] = (c, w, h, _t, C, _S, o) => {
  const tg = o.p[0] || 0, fr0 = Math.max(.05, Math.min(.9, (o.p[1] || .4) * .5)), cur = o.run ? tg * Math.min(1, o.prog / fr0) : o.prog >= 1 ? tg : 0;
  fr(c, 22, 12, 4, h - 24, C['--panel3']); const ky = 12 + (h - 24) * (1 - cur); fr(c, 13, ky - 4, 22, 8, C['--ink']); fr(c, 13, ky - .5, 22, 1, C['--panel3']);
  tx(c, Math.round(cur * 100) + ' %', 48, 24, F.d(18), C['--cy'], 'left', '1px'); tx(c, 'CIBLE ' + Math.round(tg * 100) + ' %', w - 12, 24, F.m(6.5), C['--ink3'], 'right', '1px');
  const x0 = 48, W = w - 60, yb = 78, H = 30; fr(c, x0, yb, W, 1, C['--panel3']);
  c.strokeStyle = o.k; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x0, yb); c.lineTo(x0 + W * fr0, yb - H * tg); c.lineTo(x0 + W, yb - H * tg); c.stroke();
  if (o.prog > 0) fr(c, x0 + W * Math.min(1, o.prog) - .75, yb - H - 4, 1.5, H + 6, C['--or']);
};
D['k:fondu'] = (c, w, h, _t, C, _S, o) => {
  const x0 = 14, W = w - 28, y0 = 14, H = 48; c.lineWidth = 1.5; c.strokeStyle = C['--ink3'];
  c.beginPath(); c.moveTo(x0, y0); c.bezierCurveTo(x0 + W * .55, y0, x0 + W * .45, y0 + H, x0 + W, y0 + H); c.stroke();
  c.strokeStyle = o.k; c.beginPath(); c.moveTo(x0, y0 + H); c.bezierCurveTo(x0 + W * .55, y0 + H, x0 + W * .45, y0, x0 + W, y0); c.stroke();
  fr(c, x0 + W * o.prog - .75, y0 - 4, 1.5, H + 8, C['--or']);
  tx(c, 'AVANT', x0, h - 10, F.m(6.5), C['--ink3'], 'left', '1px'); tx(c, 'APRÈS', x0 + W, h - 10, F.m(6.5), o.k, 'right', '1px');
  tx(c, fm(o.run ? o.rem : o.dur), w / 2, h - 10, F.d(10), C['--cy'], 'center');
};
D['k:passage'] = (c, w, h, t, C, _S, o) => {
  const y = 38, x0 = 12, W = w - 24; for (let i = 0; i < W / 8; i++) fr(c, x0 + i * 8, y, 4, 1.5, C['--ink3']);
  for (let k = 0; k < 3; k++) {
    const x = x0 + ((t * .5 + k / 3) % 1) * W; c.globalAlpha = o.run ? 1 : .35; c.fillStyle = o.k;
    c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 8, y + .75); c.lineTo(x, y + 7.5); c.closePath(); c.fill(); c.globalAlpha = 1;
  }
  tx(c, 'LIAISON', 12, h - 12, F.m(7), C['--ink3'], 'left', '1px'); tx(c, fm(o.run ? o.rem : o.dur), w - 12, h - 12, F.d(11), C['--cy'], 'right');
};
D['k:issue'] = (c, _w, _h, _t, C, _S, o) => {
  const ch = !!o.chosen; fr(c, 12, 14, 56, 56, ch ? o.k : C['--panel2']); tx(c, o.lab || 'A', 40, 43, F.d(26), ch ? C['--on-or'] : C['--ink3'], 'center');
  tx(c, ch ? 'CHOISIE' : 'NON CHOISIE', 82, 24, F.m(7), ch ? C['--grn2'] : C['--ink3'], 'left', '1px');
  tx(c, (o.pct || 0) + ' %', 82, 46, F.d(16), C['--cy'], 'left', '1px'); tx(c, 'DES VOIX', 82, 64, F.m(6.5), C['--ink3'], 'left', '1px');
};

/* ───────────── blocs du canvas (D de blocs.js) ───────────── */

D.start = (c, w, _h, t, C, _S, o) => {
  const n = 9, g = 2, cw = (w - 24 - g * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const x = 12 + i * (cw + g); fr(c, x, 32, cw, 18, i === 4 ? C['--panel3'] : C['--panel2']); if (i < 4) fr(c, x, 48, cw, 2, C['--grn2']);
    tx(c, i === 5 ? '5' : String(i), x + cw / 2, 41, F.m(7), i === 4 ? C['--ink'] : C['--ink3'], 'center');
  }
  const x4 = 12 + 4 * (cw + g), p = o.run ? 1 : (Math.sin(t * 2.4) + 1) / 2; c.globalAlpha = .3 + .7 * p; fr(c, x4 - 2, 27, 3, 28, o.run ? C['--grn2'] : o.k); c.globalAlpha = 1;
  tx(c, 'ENTRÉE · SG—04', 12, 14, F.m(7), C['--ink3'], 'left', '1px'); tx(c, '4 le choix', 12, 72, F.u(11, 500), C['--ink2']);
  tx(c, o.run ? 'S’EXÉCUTE' : 'PRÊT', w - 12, 72, F.m(7), o.run ? C['--grn2'] : C['--ink3'], 'right', '1px');
};
D.timer = (c, w, h, _t, C, S, o) => {
  const y = 26, L = 12, W = w - 24; fr(c, L, y, W, 1, C['--line']);
  for (let i = 0; i <= 15; i++) { const x = L + i * W / 15; fr(c, x, y - (i % 5 ? 3 : 7), 1, i % 5 ? 3 : 7, C['--ink3']); }
  const T = o.p.length ? o.p[0] * 150 : 80, el = S.el % 150, mx = L + (T / 150) * W; fr(c, mx - 1, y - 12, 2, 18, o.k);
  tx(c, '+' + Math.round(T) + ' S', mx, y + 14, F.m(7), o.k, 'center', '1px'); const ph = L + (el / 150) * W; fr(c, ph - 1, y - 13, 2, 19, C['--or']);
  const rem = Math.max(0, T - el); tx(c, fm(rem), w / 2, h - 24, F.d(20), C['--cy'], 'center', '2px');
};
D.vote = (c, w, _h, t, C, S, o) => {
  const ux = 18, uy = 36; sr(c, ux, uy, 46, 40, o.k, 1.5); fr(c, ux + 12, uy - 1, 22, 3, C['--bg']); const ph = (t * 1.2) % 1;
  if (ph < .7) { c.globalAlpha = 1 - ph; fr(c, ux + 18, uy - 24 + ph * 30, 10, 7, C['--ink2']); c.globalAlpha = 1; }
  tx(c, String(S.voted), w - 14, 44, F.d(28), C['--cy'], 'right', '1px'); tx(c, 'VOTES REÇUS', w - 14, 70, F.m(7), C['--ink3'], 'right', '1px');
  const sp = t - S.lastVote;
  if (sp < .4) {
    c.strokeStyle = C['--grn2']; c.lineWidth = 1.2; c.globalAlpha = 1 - sp / .4;
    for (let i = 0; i < 6; i++) { const a = i * 1.047 + t; const r0 = 20 + sp * 30; c.beginPath(); c.moveTo(w - 50 + Math.cos(a) * r0, 44 + Math.sin(a) * r0 * .6); c.lineTo(w - 50 + Math.cos(a) * (r0 + 5), 44 + Math.sin(a) * (r0 + 5) * .6); c.stroke(); }
    c.globalAlpha = 1;
  }
};
D.text = (c, w, _h, t, C, S, o) => {
  const m = MSGS[S.msgI % MSGS.length]; fr(c, 12, 16, w - 24, 40, C['--panel2']); c.fillStyle = C['--panel2']; c.beginPath(); c.moveTo(22, 56); c.lineTo(32, 56); c.lineTo(22, 64); c.fill();
  const ch = Math.max(0, Math.min(m[0].length, Math.floor((t - S.msgT) * 22)));
  tx(c, m[0].slice(0, ch) + ((t * 2) % 1 < .5 && ch < m[0].length ? '▌' : ''), 20, 36, F.u(12, 500), C['--ink']);
  tx(c, '— ' + m[1], 34, 70, F.m(7.5), o.k, 'left', '1px'); tx(c, S.rate + ' / MIN', w - 14, 70, F.m(7.5), C['--ink3'], 'right', '1px');
};
D.seismo = (c, w, h, _t, C, S, o) => {
  const mid = h / 2 + 4; for (let i = 0; i <= 6; i++) fr(c, 10 + i * (w - 20) / 6, 16, 1, h - 24, C['--dot']); fr(c, 10, mid, w - 20, 1, C['--line']);
  c.beginPath(); const n = S.en.length;
  for (let i = 0; i < n; i++) { const x = 10 + i * (w - 20) / (n - 1), y = mid - S.en[i] * (h * .36); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
  c.strokeStyle = o.k; c.lineWidth = 1.3; c.stroke();
  tx(c, 'ÉNERGIE', 12, 10, F.m(7), C['--ink3'], 'left', '1px'); tx(c, String(Math.round(S.energy * 100)), w - 12, 10, F.m(8, 600), C['--cy'], 'right', '1px');
};
D.btn = (c, w, _h, t, C, S) => {
  const fl = Math.max(0, 1 - (t - S.btnT) * 2.2); fr(c, 22, 24, w - 44, 34, fl > 0 ? C['--or'] : C['--panel2']); sr(c, 22, 24, w - 44, 34, C['--line']);
  if (fl > 0) { c.globalAlpha = fl * .6; sr(c, 22 - fl * 6, 24 - fl * 6, w - 44 + fl * 12, 34 + fl * 12, C['--or'], 1.5); c.globalAlpha = 1; }
  tx(c, 'RÉVÉLER LE TRAÎTRE', w / 2, 41, F.u(10, 600), fl > .3 ? C['--on-or'] : C['--ink'], 'center', '1px'); tx(c, 'F1 · CLIC POUR ESSAYER', w / 2, 76, F.m(7), C['--ink3'], 'center', '1px');
};
D.osc = (c, w, h, t, C, _S, o) => {
  const on = (t * 2.7) % 1 < .18; dot(c, 20, 18, 4.5, on ? C['--grn2'] : C['--panel3']); tx(c, '/qlab/cue/12', 32, 18, F.m(9), C['--ink'], 'left', '.5px'); tx(c, 'UDP 53000', 12, 36, F.m(7), C['--ink3'], 'left', '1px');
  const n = 26, bw = (w - 24) / n; for (let i = 0; i < n; i++) { const v = (Math.sin(i * .6 + t * 2.2) + 1) / 2 * .8 + .1; fr(c, 12 + i * bw, h - 10 - v * 34, bw - 1.5, v * 34, i === n - 1 ? o.k : C['--panel3']); }
};
D.join = (c, w, _h, t, C) => {
  const k = Math.floor(t / 1.6); for (let i = 0; i < 6; i++) av(c, 14 + i * 15, 24, 20, (i + k) % 12, C);
  const ph = (t % 1.6) / 1.6; c.globalAlpha = 1 - ph; tx(c, '↘', 18 + 6 * 15 + 6, 20 - ph * 8, F.u(12), C['--grn2']); c.globalAlpha = 1;
  tx(c, '+3', w - 46, 34, F.d(13), C['--grn2'], 'right'); tx(c, '−1', w - 12, 34, F.d(13), C['--amb'], 'right'); tx(c, '138 PRÉSENTS · 4 PARTIS', 12, 72, F.m(7), C['--ink3'], 'left', '1px');
};
D.switch = (c, w, _h, _t, C, S, o) => {
  const act = o.run || o.live ? S.win : -1;
  OPTS.forEach((n, i) => {
    const y = 12 + i * 24, on = i === act; fr(c, 12, y, w - 24, 19, on ? C['--panel3'] : C['--panel2']); fr(c, 12, y, 2, 19, on ? C['--grn2'] : o.k);
    tx(c, n, 22, y + 10, F.u(10.5, on ? 600 : 500), on ? C['--ink'] : C['--ink3']); tx(c, String(S.votes[i]), w - 18, y + 10, F.m(8, 600), on ? C['--grn2'] : C['--ink3'], 'right');
  });
};
D.wait = (c, _w, h, t, C, _S, o) => {
  const dur = Math.max(.1, (o.p[0] ?? .3) * 10); const f = o.run ? 1 - (t % dur) / dur : 1;
  ring(c, 46, h / 2, 26, f, o.k, C['--panel3'], 4); tx(c, (dur * f).toFixed(1).replace('.', ','), 46, h / 2 - 2, F.u(13, 700), C['--cy'], 'center'); tx(c, 'S', 46, h / 2 + 11, F.m(7), C['--ink3'], 'center');
  tx(c, 'LATENT', 92, h / 2 - 9, F.m(7), C['--ink3'], 'left', '1px'); tx(c, o.run ? 'attend…' : 'au repos', 92, h / 2 + 8, F.u(11, 500), o.run ? C['--amb'] : C['--ink2']);
};
D.waituntil = (c, w, _h, _t, C, S) => {
  const ok = S.jauge > 600; tx(c, 'jauge_salle', 14, 22, F.m(9), C['--cy']); tx(c, '> 600', 14, 44, F.d(16), C['--ink']); const fx = w - 34;
  fr(c, fx, 12, 22, 60, C['--panel2']); dot(c, fx + 11, 28, 6.5, ok ? C['--panel3'] : C['--amb']); dot(c, fx + 11, 56, 6.5, ok ? C['--grn2'] : C['--panel3']);
  tx(c, ok ? 'VRAI · PASSE' : 'ATTEND · ' + Math.round(S.jauge), 14, 72, F.m(7), ok ? C['--grn2'] : C['--amb'], 'left', '1px');
};
D.wheel = (c, _w, h, t, C, _S, o) => {
  const ws = [.5, .3, .2], cols = [o.k, C['--cy'], C['--coral-3']], cx = 48, cy = h / 2, r = 33; let a = -Math.PI / 2;
  ws.forEach((p, i) => { c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, a, a + p * 6.283); c.closePath(); c.fillStyle = cols[i]; c.fill(); a += p * 6.283; });
  c.strokeStyle = C['--bg']; c.lineWidth = 1.5; a = -Math.PI / 2;
  ws.forEach((p) => { c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke(); a += p * 6.283; });
  const ph = (t % 4.5) / 4.5, e = Math.min(1, ph / .7), ang = -Math.PI / 2 + (1 - Math.pow(1 - e, 3)) * (6.283 * 3 + 2.1);
  c.strokeStyle = C['--ink']; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(ang) * (r + 5), cy + Math.sin(ang) * (r + 5)); c.stroke(); fr(c, cx - 3, cy - 3, 6, 6, C['--ink']);
  ['A · 50 %', 'B · 30 %', 'C · 20 %'].forEach((s, i) => { fr(c, 98, 22 + i * 18, 8, 8, cols[i]); tx(c, s, 112, 26 + i * 18, F.m(8), e >= 1 && i === 1 ? C['--ink'] : C['--ink2'], 'left', '1px'); });
};
D.counter = (c, w, _h, _t, C, S) => {
  const s = String(S.counter % 10000).padStart(4, '0'); const dw = 30, gap = 8, x0 = (w - (4 * dw + 3 * gap)) / 2;
  for (let i = 0; i < 4; i++) seg7(c, x0 + i * (dw + gap), 18, dw, 52, +s[i], C['--cy'], C['--panel2']);
  tx(c, 'PASSAGES', w / 2, 82, F.m(7), C['--ink3'], 'center', '1px');
};
D.lock = (c, w, _h, _t, C, S, o) => {
  const open = S.lockOpen; const x = w / 2 - 18, y = 40; c.strokeStyle = open ? C['--grn2'] : o.k; c.lineWidth = 4;
  c.beginPath(); c.moveTo(x + 8, y); c.lineTo(x + 8, y - 12); c.lineTo(x + 28, y - 12); c.lineTo(x + 28, open ? y - 20 : y); c.stroke();
  fr(c, x, y, 36, 28, open ? C['--grn2'] : o.k); fr(c, x + 16, y + 9, 4, 10, C['--bg']);
  tx(c, open ? 'OUVERTE' : 'FERMÉE', w / 2, 84, F.m(7.5), open ? C['--grn2'] : C['--ink3'], 'center', '1px');
};
D.histo = (c, w, h, _t, C, S) => {
  const mx = Math.max(...S.votes), bw = (w - 48) / 3;
  S.votes.forEach((v, i) => {
    const bh = (v / 80) * (h - 36), x = 16 + i * (bw + 8), y = h - 16 - bh; fr(c, x, y, bw, bh, v === mx ? C['--cy'] : C['--panel3']);
    tx(c, String(v), x + bw / 2, y - 7, F.m(8, 600), v === mx ? C['--cy'] : C['--ink3'], 'center'); tx(c, OPTS[i].slice(0, 5).toUpperCase(), x + bw / 2, h - 7, F.m(6.5), C['--ink3'], 'center', '.5px');
    if (v === mx) { c.fillStyle = C['--amb']; c.beginPath(); const cx = x + bw / 2, cy = y - 19; c.moveTo(cx - 7, cy + 4); c.lineTo(cx - 7, cy - 3); c.lineTo(cx - 3.5, cy + 1); c.lineTo(cx, cy - 5); c.lineTo(cx + 3.5, cy + 1); c.lineTo(cx + 7, cy - 3); c.lineTo(cx + 7, cy + 4); c.fill(); }
  });
};
D.var = (c, w, h, _t, C, S, o) => {
  tx(c, 'jauge_salle', 12, 14, F.m(8), C['--ink3']); tx(c, String(Math.round(S.jauge)), 12, 40, F.d(24), C['--cy'], 'left', '1px');
  const n = S.jh.length, x0 = 12, W = w - 24, y0 = h - 10, H = 30; fr(c, x0, y0 - H * (600 / 1000), W, 1, C['--amb']);
  c.beginPath(); S.jh.forEach((v, i) => { const x = x0 + i * W / (n - 1), y = y0 - (v / 1000) * H; if (i) c.lineTo(x, y); else c.moveTo(x, y); });
  c.strokeStyle = o.k; c.lineWidth = 1.4; c.stroke(); tx(c, '600', w - 12, y0 - H * .6 - 6, F.m(6.5), C['--amb'], 'right');
};
D.slot = (c, w, _h, t, C) => {
  const ph = (t % 3) / 3, stop = ph > .6;
  for (let col = 0; col < 3; col++) {
    const x = 24 + col * ((w - 48) / 3) + ((w - 48) / 3 - 36) / 2; fr(c, x - 3, 14, 42, 64, C['--panel2']);
    c.save(); c.beginPath(); c.rect(x - 3, 14, 42, 64); c.clip(); const off = stop ? 0 : ((t * (8 + col * 2)) % 1) * 40;
    for (let k = -1; k < 2; k++) av(c, x + 3, 26 + k * 40 + off, 30, ((col * 3 + k + (stop ? 7 : Math.floor(t * (8 + col * 2)))) % 12 + 12) % 12, C);
    c.restore(); if (stop) sr(c, x - 3, 14, 42, 64, C['--grn2'], 1.5);
  }
  tx(c, stop ? '3 ÉLUS' : 'TIRAGE…', w / 2, 86, F.m(7), stop ? C['--grn2'] : C['--ink3'], 'center', '1px');
};
D.podium = (c, w, h, _t, C) => {
  const ord = [1, 0, 2], hs = [44, 58, 32];
  ord.forEach((ti, i) => {
    const x = 24 + i * ((w - 48) / 3), bw = (w - 48) / 3 - 8, bh = hs[i], y = h - 12 - bh; fr(c, x, y, bw, bh, i === 1 ? C['--panel3'] : C['--panel2']);
    emb(c, ti, x + bw / 2, y - 12, 6, C['--eq-' + (ti + 1)]); tx(c, String(i === 1 ? 1 : i === 0 ? 2 : 3), x + bw / 2, y + 14, F.d(13), i === 1 ? C['--cy'] : C['--ink3'], 'center');
    tx(c, TEAMS[ti][0].slice(0, 7).toUpperCase(), x + bw / 2, h - 20, F.m(6), C['--ink3'], 'center', '.5px');
  });
};
D.cible = (c, w, _h, _t, C, _S, o) => {
  for (let i = 0; i < 7; i++) av(c, 12 + i * 13, 14, 20, i + 2, C); tx(c, '17', w - 12, 24, F.d(22), C['--ink'], 'right');
  [0, 1].forEach((i) => { fr(c, 12 + i * 58, 46, 52, 14, C['--panel2']); emb(c, i, 20 + i * 58, 53, 4, C['--eq-' + (i + 1)]); tx(c, TEAMS[i][0].slice(0, 6), 28 + i * 58, 53, F.m(7), C['--ink2']); });
  tx(c, 'a_voté:"A" - rôle:superv.', 12, 76, F.m(7), o.k, 'left', '.3px');
};
D.teams = (c, w, _h, _t, C) => {
  TEAMS.forEach((tm, i) => {
    const y = 10 + i * 19; fr(c, 12, y, w - 24, 16, C['--panel2']); fr(c, 12, y, 3, 16, C['--eq-' + (i + 1)]); emb(c, i, 26, y + 8, 4.5, C['--eq-' + (i + 1)]);
    tx(c, tm[0], 36, y + 8, F.u(10, 500), C['--ink']); if (i === 0) tx(c, '★ CAP.', w - 50, y + 8, F.m(6.5), C['--amb'], 'right'); tx(c, String(tm[1]), w - 18, y + 8, F.m(8, 600), C['--cy'], 'right');
  });
};
D.seats = (c, w, h, _t, C, _S, o) => {
  const rad = o.p[0] ?? .4; seats(c, w / 2, 14, C, (r) => (r >= 1 && r <= 1 + Math.round(rad * 4) ? o.k : null));
  tx(c, 'SCÈNE', w / 2, 7, F.m(6), C['--ink3'], 'center', '1px'); tx(c, 'RANGS C–F · 46 SIÈGES', w / 2, h - 6, F.m(6.5), C['--ink3'], 'center', '1px');
};
D.noresp = (c, w, _h, _t, C, S) => {
  for (let i = 0; i < 8; i++) av(c, 12 + i * 14, 18, 20, i + 4, C, true); const n = S.total - S.voted;
  tx(c, String(n), w - 12, 28, F.d(22), n ? C['--amb'] : C['--grn2'], 'right'); tx(c, n ? 'N’ONT PAS VOTÉ' : 'TOUT LE MONDE A VOTÉ', 12, 58, F.m(7), n ? C['--amb'] : C['--grn2'], 'left', '1px');
  fr(c, 12, 70, w - 24, 4, C['--panel3']); fr(c, 12, 70, (w - 24) * S.voted / S.total, 4, C['--grn2']);
};
D.color = (c, w, h, t, C) => {
  const col = C['--tel-demo']; fr(c, 12, 12, w - 84, h - 24, col); tx(c, '#7D5BD6', 18, h - 20, F.m(8, 600), C['--titre-clair'], 'left', '1px');
  phone(c, w - 58, 8, 34, h - 16, C, (x, y, W, H) => { const p = (Math.sin(t * 2) + 1) / 2; c.globalAlpha = .55 + .45 * p; fr(c, x, y, W, H, col); c.globalAlpha = 1; });
};
D.wave = (c, w, h, t, C, _S, o) => {
  const fx = ((t * .45) % 1.3) - .15;
  seats(c, w / 2, 14, C, (_r, _i, a) => { const u = 1 - (a - Math.PI * .12) / (Math.PI * .76); const d = Math.abs(u - fx); return d < .08 ? o.k : d < .18 ? C['--coral-1'] : null; });
  tx(c, 'SCÈNE', w / 2, 7, F.m(6), C['--ink3'], 'center', '1px'); tx(c, 'GAUCHE → DROITE', w / 2, h - 6, F.m(6.5), C['--ink3'], 'center', '1px');
};
D.strobe = (c, w, _h, t, C, _S, o) => {
  const hz = (o.p[0] ?? .8) * 5, ok = hz <= 3, on = ok && ((t * hz) % 1 < .5);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) fr(c, 12 + x * 13, 12 + y * 13, 12, 12, ((x + y) % 2 === 0) === on ? C['--ink'] : C['--panel3']);
  const gx = 74, gw = w - 86; fr(c, gx, 30, gw, 6, C['--panel3']); fr(c, gx, 30, gw * Math.min(1, hz / 5), 6, ok ? o.k : C['--amb']); fr(c, gx + gw * .6 - 1, 24, 2, 18, C['--rouge']);
  tx(c, '3 HZ', gx + gw * .6, 18, F.m(6.5), C['--rouge'], 'center', '1px'); tx(c, hz.toFixed(1).replace('.', ',') + ' HZ', gx, 52, F.u(13, 700), ok ? C['--cy'] : C['--amb']);
  tx(c, ok ? 'sous la limite' : 'refusé : > 3 flashs/s', gx, 70, F.u(9.5, 500), ok ? C['--ink3'] : C['--amb']);
};
D.vibe = (c, w, h, t, C, S, o) => {
  const pat = [1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0]; const sw = (w - 24) / pat.length, base = 46;
  c.beginPath(); c.moveTo(12, base); pat.forEach((p, i) => { const x = 12 + i * sw; c.lineTo(x, base - (p ? 24 : 0)); c.lineTo(x + sw, base - (p ? 24 : 0)); });
  c.strokeStyle = o.k; c.lineWidth = 1.5; c.stroke(); const ph = (t * .5) % 1; fr(c, 12 + ph * (w - 24), 16, 2, 34, C['--or']);
  for (let i = 0; i < 5; i++) fr(c, 12 + i * (w - 24) / 4, base + 4, 1, 4, C['--ink3']);
  tx(c, '0 MS', 12, base + 14, F.m(6.5), C['--ink3']); tx(c, '1 200 MS', w - 12, base + 14, F.m(6.5), C['--ink3'], 'right');
  tx(c, 'iOS : flash + clic', 12, h - 10, F.u(9.5, 500), S.vibeFix ? C['--grn2'] : C['--amb']);
};
D.sound = (c, w, _h, t, C, _S, o) => {
  wave(c, 12, 14, w - 24, 44, C, (t * .3) % 1); tx(c, 'CLOCHE.WAV · 0:04', 12, 70, F.m(7), C['--ink3'], 'left', '1px');
  tx(c, '38 SANS SON', w - 12, 70, F.m(7, 600), C['--amb'], 'right', '1px'); fr(c, 12, 82, w - 24, 3, C['--panel3']); fr(c, 12, 82, (w - 24) * (o.p[0] ?? .75), 3, o.k);
};
D.msg = (c, w, h, t, C, _S, o) => {
  phone(c, 12, 6, 44, h - 12, C, (x, y, W, H) => { fr(c, x, y, W, H, C['--bg']); const sl = Math.min(1, ((t % 4) / 1.2)); fr(c, x + 2, y + 6 - 14 * (1 - sl), W - 4, 14, C['--panel3']); fr(c, x + 2, y + 6 - 14 * (1 - sl), 2, 14, o.k); });
  const ex = 70, ey = 20, ew = w - 84, eh = 44; sr(c, ex, ey, ew, eh, o.k, 1.5); c.strokeStyle = o.k; c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex + ew / 2, ey + eh * .55); c.lineTo(ex + ew, ey); c.stroke();
  fr(c, ex + ew / 2 - 5, ey + eh * .55 - 5, 10, 10, C['--or']); tx(c, 'garde-le pour toi', ex, ey + eh + 14, F.u(9.5, 500), C['--ink2']);
};
D.vote_ui = (c, w, h, _t, C, S, o) => {
  const tot = S.voted || 1;
  OPTS.forEach((n, i) => {
    const y = 10 + i * 22, f = S.votes[i] / tot; fr(c, 12, y, w - 70, 18, C['--panel2']); fr(c, 12, y, (w - 70) * f, 18, i === S.win ? C['--grn'] : C['--panel3']);
    tx(c, n, 18, y + 9, F.u(9.5, 500), C['--ink']); tx(c, Math.round(f * 100) + ' %', w - 62, y + 9, F.m(7.5, 600), C['--cy'], 'right');
  });
  const rem = S.remain / 90; ring(c, w - 28, 40, 17, rem, S.remain <= 10 ? C['--amb'] : o.k, C['--panel3'], 3);
  tx(c, '0:' + String(Math.ceil(S.remain)).padStart(2, '0'), w - 28, 40, F.m(7.5, 600), C['--ink'], 'center'); tx(c, '« où doit-il aller ? »', 12, h - 8, F.u(9.5, 500), C['--ink3']);
};
// Les emojis couleur coûtent cher à rasteriser à une taille qui change à chaque image (≈ 25 ms pour 8) :
// on les dessine une fois dans une planche (sprite), puis on la recopie à l'échelle voulue.
const EMOJIS = ['🔥', '😱', '😂', '❤️', '👏', '🫣', '⚡', '🐀'];
const CASE_EMOJI = 48;
let plancheEmojis: HTMLCanvasElement | null | undefined;
function emojis(): HTMLCanvasElement | null {
  if (plancheEmojis !== undefined) return plancheEmojis;
  if (typeof document === 'undefined') return (plancheEmojis = null);
  const cv = document.createElement('canvas'); cv.width = CASE_EMOJI * EMOJIS.length; cv.height = CASE_EMOJI;
  const c = cv.getContext('2d'); if (!c) return (plancheEmojis = null);
  c.font = `${CASE_EMOJI * .78}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  EMOJIS.forEach((e, i) => c.fillText(e, i * CASE_EMOJI + CASE_EMOJI / 2, CASE_EMOJI / 2 + 2));
  return (plancheEmojis = cv);
}
D.react = (c, w, h, t, C, _S, o) => {
  const sp = emojis();
  EMOJIS.forEach((e, i) => {
    const x = 10 + (i % 4) * 36, y = 8 + Math.floor(i / 4) * 38, p = (Math.sin(t * 3 + i * 1.7) + 1) / 2; fr(c, x, y, 32, 34, C['--panel2']);
    const s = (14 + p * 3) / .78;
    if (sp) c.drawImage(sp, i * CASE_EMOJI, 0, CASE_EMOJI, CASE_EMOJI, x + 16 - s / 2, y + 13 - s / 2 - 1, s, s);
    else { c.font = `${14 + p * 3}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e, x + 16, y + 13); }
    tx(c, String(Math.round(40 + i * 13 + p * 9)), x + 16, y + 28, F.m(6.5, 600), C['--ink3'], 'center');
  });
  const tx0 = w - 22; fr(c, tx0, 8, 10, h - 16, C['--panel3']); const lv = (Math.sin(t * .8) + 1) / 2 * .6 + .3; fr(c, tx0, 8 + (h - 16) * (1 - lv), 10, (h - 16) * lv, o.k);
};
D.screen = (c, w, h, t, C, _S, o) => {
  phone(c, w / 2 - 24, 4, 48, h - 8, C, (x, y, W, H) => {
    fr(c, x, y, W, H, C['--bg']); fr(c, x + 2, y + 6, W - 4, 8, C['--panel3']); fr(c, x + 2, y + H - 30, W - 4, 6, C['--panel2']);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) fr(c, x + 2 + k * ((W - 4) / 7), y + H - 22 + r * 7, (W - 4) / 7 - 1, 5, C['--panel3']);
    if ((t * 1.5) % 1 < .5) fr(c, x + 4, y + H - 29, 1, 4, C['--ink']);
  });
  tx(c, 'VOTE', 14, 24, F.m(7), C['--ink3'], 'left', '1px'); tx(c, 'CLAVIER', 14, 40, F.m(7, 600), o.k, 'left', '1px'); tx(c, 'ATTENTE', 14, 56, F.m(7), C['--ink3'], 'left', '1px');
};
D.stage = (c, w, h, t, C, S, o) => {
  fr(c, 0, 0, w, h, C['--salle-noir']);
  for (let i = 0; i < 4; i++) { const y = 14 + i * 18, sp = 40 + i * 13, x = w - ((t * sp + i * 80) % (w + 120)); tx(c, MSGS[(i + S.msgI) % MSGS.length][0], x, y, F.u(10, 600), C['--titre-clair']); }
  const dens = o.p[0] ?? .5;
  for (let k = 0; k < Math.round(3 + dens * 5); k++) { const ph = ((t * .5 + k * .27) % 1), x = 24 + ((k * 53) % (w - 48)), y = h - 12 - ph * 60, r = 4 + ph * 9; c.globalAlpha = 1 - ph; dot(c, x, y, r, C['--pseudo-' + (k % 12 + 1)]); c.globalAlpha = 1; }
  fr(c, 8, h - 18, 52, 11, C['--rouge']); tx(c, 'EN DIRECT', 34, h - 12.5, F.m(6, 600), C['--on-rouge'], 'center', '.8px');
};
D.stream = (c, w, h, _t, C, S) => {
  fr(c, 10, 8, w - 20, h - 16, C['--panel3']); for (let i = 0; i < 40; i++) fr(c, 10 + ((i * 37) % (w - 20)), 8 + ((i * 53) % (h - 16)), 2, 2, C['--dot-hi']);
  const rec = S.recu; fr(c, 10, 8, w - 20, 28, rec ? C['--veil'] : C['--amb']); tx(c, 'VA VERS LA BOULANGERIE', w / 2, 22, F.d(8.5), rec ? C['--ink'] : C['--on-amb'], 'center', '.5px');
  fr(c, w / 2 - 34, h - 30, 68, 16, rec ? C['--grn'] : C['--panel2']); tx(c, rec ? 'REÇU ✓' : 'ENVOYÉE', w / 2, h - 22, F.m(7, 600), rec ? C['--on-grn'] : C['--amb'], 'center', '1px');
  tx(c, '24 I/S · 180 MS', w - 14, h - 40, F.m(6, 500), C['--cy'], 'right');
};
D.oscout = (c, _w, h, _t, C, S, o) => {
  const v = Math.max(0, Math.min(1, S.jauge / 1000 * ((o.p[0] ?? .5) * 2))); const fx = 26, fy = 12, fh = h - 24;
  fr(c, fx - 4, fy, 8, fh, C['--panel3']); fr(c, fx - 1, fy + 4, 2, fh - 8, C['--line']); fr(c, fx - 10, fy + fh * (1 - v) - 5, 20, 10, C['--ink']); fr(c, fx - 10, fy + fh * (1 - v) - .5, 20, 1, C['--ink3']);
  tx(c, '/lx/12', 52, 24, F.m(9), C['--ink'], 'left', '.5px'); tx(c, v.toFixed(2).replace('.', ','), 52, 52, F.d(20), C['--cy'], 'left', '1px'); tx(c, '→ CONSOLE LUMIÈRE', 52, 74, F.m(6.5), C['--ink3'], 'left', '1px');
};
D.gate = (c, w, _h, t, C, S, o) => {
  const st = o.gst || 'ARMÉ'; feu(c, 12, 14, st, C, t);
  tx(c, st, 44, 20, F.m(8, 600), st === 'PASSAGE' ? C['--grn2'] : st === 'RETENU' ? C['--rouge'] : C['--amb'], 'left', '1px');
  const q = S.voted / S.total; fr(c, 44, 36, w - 104, 5, C['--panel3']); fr(c, 44, 36, (w - 104) * q, 5, C['--grn2']);
  tx(c, S.voted + '/' + S.total + ' — ' + Math.round(q * 100) + ' %', 44, 52, F.m(7.5, 600), C['--cy'], 'left', '.5px'); tx(c, '100 % ou délai', 44, 68, F.u(9.5, 500), C['--ink3']);
  ring(c, w - 28, 44, 19, S.remain / 90, S.remain <= 10 ? C['--amb'] : C['--cy'], C['--panel3'], 3); tx(c, '0:' + String(Math.ceil(S.remain)).padStart(2, '0'), w - 28, 44, F.m(8, 600), C['--ink'], 'center');
};

/* ───────────── les 10 blocs de l'étude ───────────── */

/** Valeur réelle du réglage i d'un bloc pour l'aperçu courant. */
const reglage = (ty: string, i: number, o: OptionsApercu): number => {
  const r = trouverBloc(ty)?.reglages[i];
  return r ? valeurReglage(r, (o.p[i] ?? r.defaut / 100) * 100) : 0;
};
const choix = (ty: string, i: number, o: OptionsApercu): string => {
  const r = trouverBloc(ty)?.reglages[i];
  return r?.choix?.[Math.round(reglage(ty, i, o))] ?? '';
};
const param = (o: OptionsApercu, cle: string, defaut: string): string => {
  const v = o.params?.[cle];
  return v == null || v === '' ? defaut : String(v);
};
/** Petit hachage déterministe 0 → 1 (tirages rejouables). */
const hache = (n: number): number => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function coche(c: Ctx, x: number, y: number, col: string) {
  c.strokeStyle = col; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 2.5, y + 2.5); c.lineTo(x + 7, y - 3); c.stroke();
}
function rondRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r); c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r); c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
}

// 1 · Garde-fou de temps : barre de temps qui se remplit en corail, seuil de la condition en vert.
D['g:garde'] = (c, w, h, t, C, S, o) => {
  const ty = 'g:garde', delai = Math.max(1, reglage(ty, 0, o));
  const el = o.run ? o.te : (t % 16) / 10 * delai;
  const f = Math.min(1, el / delai), q = S.voted / S.total, seuil = .6, remplie = q >= seuil, depasse = !remplie && f >= 1;
  tx(c, 'GARDE-FOU', 12, 12, F.m(7), C['--ink3'], 'left', '1px');
  tx(c, remplie ? 'CONDITION REMPLIE' : depasse ? 'DÉLAI DÉPASSÉ' : 'ATTEND', w - 12, 12, F.m(7, 600), remplie ? C['--grn2'] : depasse ? C['--or'] : C['--amb'], 'right', '1px');
  const x0 = 12, W = w - 24;
  fr(c, x0, 24, W, 12, C['--panel3']); fr(c, x0, 24, W * f, 12, depasse ? C['--or'] : C['--coral-2']);
  for (let i = 1; i < 10; i++) fr(c, x0 + i * W / 10, 24, 1, 3, C['--bg']);
  fr(c, x0, 42, W, 4, C['--panel3']); fr(c, x0, 42, W * Math.min(1, q), 4, C['--grn2']);
  fr(c, x0 + W * seuil - 1, 39, 2, 10, C['--grn2']); tx(c, '≥ 60 % VOTES', x0 + W * seuil + 4, 54, F.m(6.5), C['--grn2'], 'left', '1px');
  tx(c, fm(Math.max(0, delai - el)), 12, h - 18, F.d(16), depasse ? C['--or'] : C['--cy'], 'left', '1px');
  tx(c, 'PUIS : ' + choix(ty, 1, o).toUpperCase(), w - 12, h - 18, F.m(6.5), C['--ink3'], 'right', '1px');
  tx(c, 'MAX ' + fm(delai), 12, h - 6, F.m(6.5), C['--ink3'], 'left', '1px');
};

// 2 · Mémoire de spectacle : nom en capitales, valeur en chiffres LCD, historique des 5 dernières valeurs.
D['m:memoire'] = (c, w, h, t, C, _S, o) => {
  const ty = 'm:memoire', op = Math.round(reglage(ty, 0, o)), v = Math.round(reglage(ty, 1, o));
  const n = Math.floor((o.run ? o.te : t) / 2.2);
  const valeurA = (k: number): number => {
    if (k < 0) return 0;
    if (op === 2) return k % 3 === 0 ? 0 : Math.round(hache(k) * 9);
    if (op === 1) return (k * Math.max(1, v)) % 1000;
    return k % 2 ? v : Math.round(hache(k) * 99);
  };
  const cur = op === 2 ? 0 : op === 0 ? v : valeurA(n);
  tx(c, 'MÉMOIRE', 12, 12, F.m(6.5), C['--ink3'], 'left', '1px');
  tx(c, param(o, 'nom', 'fuite').toUpperCase(), 12, 26, F.d(10), o.k, 'left', '1px');
  const s = String(Math.min(999, Math.abs(cur))).padStart(3, '0'), dw = 18, gap = 5;
  for (let i = 0; i < 3; i++) seg7(c, 12 + i * (dw + gap), 38, dw, 34, +s[i], C['--cy'], C['--panel2']);
  const hx = 102, hw = (w - hx - 12 - 4 * 3) / 5;
  tx(c, 'HISTORIQUE', hx, 12, F.m(6.5), C['--ink3'], 'left', '1px');
  for (let i = 0; i < 5; i++) {
    const k = n - 4 + i, x = hx + i * (hw + 3), dern = i === 4;
    fr(c, x, 34, hw, 22, dern ? C['--panel3'] : C['--panel2']); if (dern) fr(c, x, 54, hw, 2, o.k);
    tx(c, k < 0 ? '—' : String(dern ? cur : valeurA(k)), x + hw / 2, 45, F.m(7.5, 600), dern ? C['--ink'] : C['--ink3'], 'center');
  }
  const libOp = op === 0 ? 'POSER = ' + v : op === 1 ? 'AJOUTER + ' + Math.max(1, v) : 'REMETTRE À ZÉRO';
  tx(c, libOp, hx, h - 14, F.m(7, 600), C['--ink2'], 'left', '1px');
};

// 3 · Tirage au sort : roue à secteurs colorés, aiguille qui tourne 1,5 s puis s'arrête.
const POIDS: Record<number, number[]> = { 2: [60, 40], 3: [50, 30, 20], 4: [40, 30, 20, 10], 5: [30, 25, 20, 15, 10], 6: [25, 20, 20, 15, 10, 10] };
D['f:tirage'] = (c, _w, h, t, C, _S, o) => {
  const ty = 'f:tirage', ns = Math.max(2, Math.min(6, Math.round(reglage(ty, 0, o)))), vrai = Math.round(reglage(ty, 1, o)) === 1;
  const pp = o.params?.poids, perso = Array.isArray(pp) && pp.length >= 2 && pp.every((x) => typeof x === 'number' && x >= 0) ? (pp as number[]).slice(0, 6) : null;
  const somme = perso ? perso.reduce((a, b) => a + b, 0) : 0;
  const ws = perso && somme > 0 ? perso.map((x) => Math.round(x / somme * 100)) : POIDS[perso ? perso.length : ns], cols = [C['--or'], C['--cy'], C['--coral-1'], C['--grn2'], C['--coral-3'], C['--ink3']];
  const cx = 48, cy = h / 2, r = 33, T = o.run ? o.te : t, cycle = 3.2, tour = Math.floor(T / cycle), ph = T % cycle;
  // résultat du tour : graine fixe (suite rejouable) ou aléa vrai (autre suite, illustrative)
  const u = hache(vrai ? tour * 13.7 + 101 : tour * 7.3 + 42);
  let acc = 0, res = 0; for (let i = 0; i < ws.length; i++) { acc += ws[i] / 100; if (u <= acc) { res = i; break; } res = i; }
  let a = -Math.PI / 2; const debut: number[] = [];
  ws.forEach((p, i) => { debut.push(a); c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, a, a + p / 100 * 6.283); c.closePath(); c.fillStyle = cols[i]; c.fill(); a += p / 100 * 6.283; });
  c.strokeStyle = C['--bg']; c.lineWidth = 1.5; debut.forEach((d) => { c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(d) * r, cy + Math.sin(d) * r); c.stroke(); });
  const cible = debut[res] + ws[res] / 100 * 3.1415, e = Math.min(1, ph / 1.5);
  const ang = -Math.PI / 2 + (1 - Math.pow(1 - e, 3)) * (6.283 * 3 + (cible + Math.PI / 2));
  c.strokeStyle = C['--ink']; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(ang) * (r + 5), cy + Math.sin(ang) * (r + 5)); c.stroke(); fr(c, cx - 3, cy - 3, 6, 6, C['--ink']);
  const pas = ws.length > 4 ? 12 : 16, y0 = h / 2 - (ws.length - 1) * pas / 2 - 4;
  ws.forEach((p, i) => {
    const y = y0 + i * pas, gagne = e >= 1 && i === res;
    fr(c, 98, y - 4, 8, 8, cols[i]); tx(c, String.fromCharCode(65 + i) + ' · ' + p + ' %', 112, y, F.m(7.5, gagne ? 600 : 500), gagne ? C['--ink'] : C['--ink2'], 'left', '1px');
  });
  tx(c, vrai ? 'ALÉA VRAI' : 'GRAINE FIXE', 98, h - 7, F.m(6.5), vrai ? C['--amb'] : C['--ink3'], 'left', '1px');
};

// 4 · Écoute d'un signal : oscillogramme plat qui pique à chaque réception, compteur de réceptions.
const ADRESSES = ['/pedale/1', 'NOTE C3 · CANAL 1', 'TOUCHE F5', 'GPIO 4 · PORTE'];
D['q:signal'] = (c, w, h, t, C, _S, o) => {
  const ty = 'q:signal', src = Math.round(reglage(ty, 0, o)), N = Math.max(1, Math.round(reglage(ty, 1, o)));
  const T = o.run ? o.te : t % 9, fen = 5, x0 = 12, W = w - 24, base = 50, A = 26;
  const rec = (j: number) => .8 + j * 2.1 + .6 * Math.sin(j * 1.7);
  let compte = 0; while (rec(compte) <= T && compte < 999) compte++;
  const dernier = compte ? rec(compte - 1) : -9, flash = T - dernier < .3;
  dot(c, 18, 12, 4, flash ? C['--grn2'] : C['--panel3']);
  tx(c, choix(ty, 0, o) + ' · ' + param(o, 'adresse', ADRESSES[src] ?? ''), 28, 12, F.m(7.5), C['--ink'], 'left', '.5px');
  for (let i = 0; i <= 5; i++) fr(c, x0 + i * W / 5, 24, 1, 42, C['--dot']);
  fr(c, x0, base, W, 1, C['--line']);
  c.beginPath();
  for (let i = 0; i <= 90; i++) {
    const u = i / 90, tau = T - (1 - u) * fen; let y = Math.sin(tau * 37 + i) * .6;
    for (let j = Math.max(0, compte - 4); j < compte; j++) { const d = (tau - rec(j)) * 12; if (d > -1.5 && d < 3) y -= A * Math.exp(-d * d) * Math.cos(d * 2.2); }
    if (i) c.lineTo(x0 + u * W, base + y); else c.moveTo(x0 + u * W, base + y);
  }
  c.strokeStyle = o.k; c.lineWidth = 1.3; c.stroke();
  const recu = compte >= N;
  tx(c, String(compte), w - 12, h - 10, F.d(14), recu ? C['--grn2'] : C['--cy'], 'right', '1px');
  tx(c, recu ? 'REÇU · ' + N + ' FOIS' : 'EN ÉCOUTE · ' + compte + '/' + N, 12, h - 10, F.m(7), recu ? C['--grn2'] : C['--ink3'], 'left', '1px');
};

// 5 · Commande machine : ligne de commande mono, pastille verte à l'accusé, rouge sinon.
const COMMANDES: readonly string[] = COMMANDES_MACHINE;
D['s:machine'] = (c, w, h, t, C, _S, o) => {
  const ty = 's:machine', cible = Math.round(reglage(ty, 0, o)), attente = reglage(ty, 1, o);
  const cmd = param(o, 'commande', COMMANDES[cible] ?? COMMANDES[1]);
  const cycle = 4.6, T = o.run ? o.te : t, n = Math.floor(T / cycle), ph = o.run ? T : T % cycle;
  const muet = !o.run && n % 3 === 2, typ = .8, ack = typ + .35, limite = typ + Math.min(attente, 3.2);
  const ch = Math.min(cmd.length, Math.floor(ph / typ * cmd.length));
  const etat = ph < typ ? 'ENVOI' : muet ? (ph >= limite ? 'MUET' : 'ATTENTE') : ph >= ack ? 'OK' : 'ATTENTE';
  fr(c, 12, 12, w - 24, 26, C['--panel2']); fr(c, 12, 12, 2, 26, o.k);
  tx(c, '›', 20, 25, F.m(10, 600), o.k); tx(c, cmd.slice(0, ch) + (ph < typ && (t * 3) % 1 < .5 ? '▌' : ''), 30, 25, F.m(9), C['--ink'], 'left', '.5px');
  const pulse = (Math.sin(t * 8) + 1) / 2, px = 22, py = 58;
  if (etat === 'ATTENTE') { c.globalAlpha = .35 + .65 * pulse; dot(c, px, py, 6, C['--amb']); c.globalAlpha = 1; }
  else dot(c, px, py, 6, etat === 'OK' ? C['--grn2'] : etat === 'MUET' ? C['--rouge'] : C['--panel3']);
  tx(c, etat === 'OK' ? 'CONFIRMÉ · 38 MS' : etat === 'MUET' ? 'SANS RÉPONSE' : etat === 'ATTENTE' ? 'ATTEND L’ACCUSÉ' : 'ENVOI…', 34, py, F.m(7.5, 600),
    etat === 'OK' ? C['--grn2'] : etat === 'MUET' ? C['--rouge'] : C['--ink2'], 'left', '1px');
  tx(c, '→ ' + choix(ty, 0, o).toUpperCase(), 12, h - 8, F.m(6.5), C['--ink3'], 'left', '1px');
  tx(c, 'ACCUSÉ < ' + attente.toFixed(1).replace('.', ',') + ' S', w - 12, h - 8, F.m(6.5), C['--ink3'], 'right', '1px');
};

// 6 · Boucle : anneau gradué, tours faits en corail, tour courant en chiffres.
D['f:boucle'] = (c, w, h, t, C, _S, o) => {
  const ty = 'f:boucle', brut = reglage(ty, 0, o), sansFin = !Number.isFinite(brut), N = sansFin ? BORNE_BOUCLE : Math.max(1, Math.round(brut));
  const parTour = o.run ? Math.max(1, o.dur / N) : 1.6;
  const T = o.run ? o.te : t % (Math.min(N, 12) * parTour + 2.4), tour = Math.min(N, Math.floor(T / parTour)), fini = !sansFin && tour >= N;
  const cx = 46, cy = h / 2, R = 28, nt = Math.min(N, 24), part = Math.PI * 2 / nt, jeu = Math.min(.12, part * .18);
  const dansTour = fini ? 1 : (T % parTour) / parTour;
  c.lineCap = 'butt';
  for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; fr(c, cx + Math.cos(a) * (R + 6) - .5, cy + Math.sin(a) * (R + 6) - .5, 1, 1, C['--ink3']); }
  for (let i = 0; i < nt; i++) {
    const a0 = -Math.PI / 2 + i * part + jeu, a1 = -Math.PI / 2 + (i + 1) * part - jeu;
    const fait = (tour % nt > i) || fini, courant = !fini && i === tour % nt;
    c.lineWidth = 6; c.strokeStyle = fait ? C['--coral-2'] : C['--panel3'];
    c.beginPath(); c.arc(cx, cy, R, a0, a1); c.stroke();
    if (courant) { c.strokeStyle = o.k; c.globalAlpha = .6 + .4 * (Math.sin(t * 6) + 1) / 2; c.beginPath(); c.arc(cx, cy, R, a0, a0 + (a1 - a0) * dansTour); c.stroke(); c.globalAlpha = 1; }
  }
  tx(c, String(Math.min(N, tour + (fini ? 0 : 1))), cx, cy - 3, F.d(15), C['--cy'], 'center');
  tx(c, 'TOUR', cx, cy + 12, F.m(6), C['--ink3'], 'center', '1px');
  tx(c, 'TOURS ' + (sansFin ? '∞ · BORNE ' + BORNE_BOUCLE : String(N)), 90, 18, F.m(7), C['--ink3'], 'left', '1px');
  tx(c, 'ARRÊT : ' + choix(ty, 1, o), 90, 32, F.u(9.5, 500), C['--ink2']);
  fr(c, 90, 48, w - 102, 14, fini ? C['--panel2'] : C['--panel3']); fr(c, 90, 48, 2, 14, fini ? C['--panel3'] : o.k);
  tx(c, 'ENCORE', 98, 55, F.m(7, 600), fini ? C['--ink3'] : C['--ink'], 'left', '1px');
  fr(c, 90, 66, w - 102, 14, fini ? C['--panel3'] : C['--panel2']); fr(c, 90, 66, 2, 14, fini ? C['--grn2'] : C['--panel3']);
  tx(c, 'TERMINÉ', 98, 73, F.m(7, 600), fini ? C['--grn2'] : C['--ink3'], 'left', '1px');
};

// 7 · Séquence réutilisable : miniature du sous-graphe en pastilles, étape en cours allumée.
const PASTILLES: [string, string][] = [['NOIR', '--fam-scene'], ['VOIX', '--coral-2'], ['LUM.', '--coral-1'], ['FONDU', '--fam-scene'], ['FIN', '--grn2']];
D['d:sequence'] = (c, w, h, t, C, _S, o) => {
  const supprimee = !!o.params?.supprimee, n = PASTILLES.length, T = o.run ? o.te : t;
  const cur = o.run ? Math.min(n - 1, Math.floor(o.prog * n)) : Math.floor(T / 1.1) % n;
  tx(c, 'SÉQUENCE', 12, 12, F.m(6.5), C['--ink3'], 'left', '1px');
  tx(c, param(o, 'sequence', 'noir salle').toUpperCase(), 64, 12, F.d(8.5), supprimee ? C['--rouge'] : C['--ink'], 'left', '.5px');
  const pw = 32, ph = 16, gap = (w - 24 - n * pw) / (n - 1), y = 30;
  fr(c, 12 + pw / 2, y + ph / 2 - .5, w - 24 - pw, 1, C['--line']);
  PASTILLES.forEach(([lib, coulVar], i) => {
    const x = 12 + i * (pw + gap), on = i === cur && !supprimee;
    rondRect(c, x, y, pw, ph, 8); c.fillStyle = on ? o.k : C['--panel2']; c.fill();
    if (on) { c.globalAlpha = .35 + .3 * (Math.sin(t * 5) + 1) / 2; rondRect(c, x - 3, y - 3, pw + 6, ph + 6, 11); c.strokeStyle = o.k; c.lineWidth = 1.5; c.stroke(); c.globalAlpha = 1; }
    dot(c, x + 7, y + ph / 2, 2.5, on ? C['--bg'] : C[coulVar]);
    tx(c, lib, x + pw / 2 + 4, y + ph / 2 + .5, F.m(5.5, 600), on ? C['--bg'] : C['--ink3'], 'center');
  });
  if (supprimee) { c.setLineDash([4, 3]); sr(c, 4, 4, w - 8, h - 8, C['--rouge'], 1.5); c.setLineDash([]); }
  tx(c, supprimee ? 'SÉQUENCE SUPPRIMÉE · SORTIE DIRECTE' : 'PROLOGUE › ' + param(o, 'sequence', 'noir salle').toUpperCase(), 12, h - 22, F.m(6.5), supprimee ? C['--rouge'] : C['--ink2'], 'left', '1px');
  tx(c, 'DOUBLE-CLIC POUR ENTRER', 12, h - 9, F.m(6), C['--ink3'], 'left', '1px');
  tx(c, (cur + 1) + '/' + n, w - 12, h - 9, F.d(10), C['--cy'], 'right');
};

// 8 · Message à une personne : bulle, nom du rôle, coche double à la lecture, horodatage.
D['c:message'] = (c, w, h, t, C, _S, o) => {
  const ty = 'c:message', role = choix(ty, 0, o), delai = reglage(ty, 1, o);
  const cycle = 6, T = o.run ? o.te : t, n = Math.floor(T / cycle), ph = o.run ? T : T % cycle;
  const jamais = !o.run && n % 3 === 2, lu = !jamais && ph >= 2.6, nonLu = jamais && ph >= 4.2;
  const sl = Math.min(1, ph / .5);
  tx(c, 'À · ' + role.toUpperCase(), 12, 11, F.m(7, 600), o.k, 'left', '1px');
  c.globalAlpha = sl; const by = 20 + (1 - sl) * 8, bw = w - 24;
  rondRect(c, 12, by, bw, 32, 8); c.fillStyle = C['--panel2']; c.fill();
  c.beginPath(); c.moveTo(bw - 6, by + 32); c.lineTo(bw + 6, by + 32); c.lineTo(bw + 8, by + 39); c.closePath(); c.fill();
  tx(c, param(o, 'texte', 'entre côté jardin à mon signal'), 20, by + 16, F.u(10, 500), C['--ink']);
  c.globalAlpha = 1;
  const heure = param(o, 'heure', '21:04');
  tx(c, (lu ? 'LU ' : 'ENVOYÉ ') + heure, 12, h - 22, F.m(7), C['--ink3'], 'left', '1px');
  const cx = w - 32, cy = h - 22;
  coche(c, cx, cy, lu ? C['--grn2'] : C['--ink3']); if (lu) coche(c, cx + 5, cy, C['--grn2']);
  tx(c, nonLu ? 'NON LU · ' + fm(delai) : lu ? 'LU' : 'NON LU APRÈS ' + fm(delai), 12, h - 8, F.m(6.5, nonLu ? 600 : 500), nonLu ? C['--amb'] : lu ? C['--grn2'] : C['--ink3'], 'left', '1px');
};

// 9 · Chrono visible : chiffres LCD géants, arc qui se vide, dernier tiers en corail.
D['u:chrono'] = (c, w, h, t, C, _S, o) => {
  const ty = 'u:chrono', duree = Math.max(1, Math.round(reglage(ty, 0, o)));
  const T = o.run ? o.te : t % (duree + 2), rem = Math.max(0, duree - T), reste = Math.ceil(rem - 1e-6), f = rem / duree, dernierTiers = f <= 1 / 3;
  const col = dernierTiers ? C['--coral-2'] : C['--cy'];
  const s = String(Math.floor(reste / 60)).padStart(2, '0') + String(reste % 60).padStart(2, '0');
  const dw = 22, gap = 5, y = 14, dh = 46; let x = 12;
  for (let i = 0; i < 4; i++) {
    seg7(c, x, y, dw, dh, +s[i], col, C['--panel2']); x += dw + gap;
    if (i === 1) { fr(c, x, y + 13, 4, 4, col); fr(c, x, y + 29, 4, 4, col); x += 4 + gap; }
  }
  ring(c, w - 34, 37, 22, f, dernierTiers ? C['--coral-2'] : o.k, C['--panel3'], 5);
  tx(c, rem <= 0 ? 'ZÉRO' : reste <= 10 ? '10 S' : 'RESTE', w - 34, 37, F.m(6.5, 600), rem <= 10 ? C['--coral-2'] : C['--ink3'], 'center', '1px');
  tx(c, choix(ty, 1, o).toUpperCase(), 12, h - 10, F.m(6.5), C['--ink3'], 'left', '1px');
  if (reste <= 10 && rem > 0 && (t * 2) % 1 < .6) tx(c, '10 S RESTANTES', w - 12, h - 10, F.m(6.5, 600), C['--coral-2'], 'right', '1px');
};

// 10 · Point de reprise : drapeau à damier, heure du dernier passage, bouton « REPRENDRE ICI ».
D['p:reprise'] = (c, w, h, t, C, _S, o) => {
  const ty = 'p:reprise', mat = 14, fy = 14, cell = 6, cols = 6, rows = 4;
  fr(c, mat, fy - 2, 2, h - 24, C['--ink2']);
  for (let i = 0; i < cols; i++) {
    const dy = Math.sin(t * 3 - i * .8) * 1.6 * (i / cols);
    for (let j = 0; j < rows; j++) fr(c, mat + 2 + i * cell, fy + j * cell + dy, cell, cell, (i + j) % 2 ? C['--panel3'] : C['--ink']);
  }
  const x0 = 64;
  tx(c, param(o, 'nom', 'avant le vote'), x0, 14, F.u(10.5, 600), C['--ink']);
  tx(c, 'DERNIER PASSAGE', x0, 30, F.m(6.5), C['--ink3'], 'left', '1px');
  tx(c, param(o, 'heure', '20:41'), w - 12, 30, F.d(11), C['--cy'], 'right', '1px');
  const pulse = (Math.sin(t * 2.2) + 1) / 2;
  rondRect(c, x0, 44, w - x0 - 12, 20, 5); c.fillStyle = C['--panel2']; c.fill();
  c.globalAlpha = .5 + .5 * pulse; c.strokeStyle = o.k; c.lineWidth = 1.5; c.stroke(); c.globalAlpha = 1;
  tx(c, 'REPRENDRE ICI', x0 + (w - x0 - 12) / 2, 54.5, F.m(7.5, 600), o.k, 'center', '1px');
  tx(c, 'RESTAURE : ' + choix(ty, 0, o).toUpperCase(), 12, h - 8, F.m(6.5), C['--ink3'], 'left', '1px');
};

/* ───────────── les blocs de l'étude des figurants IA ───────────── */

/** Répliques de démonstration des figurants (pseudo, texte), dans l'esprit de la banque de répliques du prototype. */
const FIG_MSGS: [string, string][] = [
  ['kev_lamouette', 'frr ton portefeuille 😭'], ['lucie.b', 'elle ment la boulangère'], ['troll_gégé', 'KEKW'],
  ['paulette', 'oh non 😬'], ['modo_flo', 'on se calme les amis'], ['nico', 'LETS GOOO 🔥'], ['inès_b', 'derrière toi !!'],
  ['sacha', 'mdrrr le malaise'],
];
/** Période entre deux bulles (s) et débit cible (msg/min) par densité : silence, calme, normal, chaud, folie (§6.7). */
const PERIODES_FIG = [0, 2.4, 1.3, .7, .35];
const DEBITS_FIG = [0, 6, 20, 60, 180];

// Figurants : bulles de chat qui défilent au rythme de la densité, humeur ou intention soufflée en pied.
D['x:figurants'] = (c, w, h, t, C, _S, o) => {
  const ty = 'x:figurants', di = Math.max(0, Math.min(4, Math.round(reglage(ty, 0, o))));
  const dens = param(o, 'densite', choix(ty, 0, o)), humeur = param(o, 'humeur', choix(ty, 1, o)), intention = param(o, 'intention', '');
  tx(c, 'FIGURANTS', 12, 9, F.m(6.5), C['--ink3'], 'left', '1px');
  for (let i = 0; i < 4; i++) fr(c, w - 12 - (4 - i) * 7, 6, 5, 6, i < di ? o.k : C['--panel3']);
  tx(c, dens.toUpperCase(), w - 12 - 4 * 7 - 4, 9, F.m(6.5, 600), di === 0 ? C['--ink3'] : o.k, 'right', '1px');
  const y0 = 16, y1 = h - 15, bh = 15, pas = bh + 3;
  c.save(); c.beginPath(); c.rect(10, y0, w - 20, y1 - y0); c.clip();
  if (di === 0) {
    tx(c, 'CHUT · LE CHAT SE TAIT', w / 2, (y0 + y1) / 2, F.m(7, 600), C['--ink3'], 'center', '1px');
  } else {
    const per = PERIODES_FIG[di] ?? 1.3, T = o.run ? o.te : t, n = Math.floor(T / per), f = Math.min(1, ((T % per) / per) / .35);
    for (let j = 0; j < 5; j++) {
      const k = n - j;
      if (k < 0) break;
      const [pseudo, texte] = FIG_MSGS[(k * 5 + 3) % FIG_MSGS.length], y = y1 - bh - j * pas + (1 - f) * pas;
      const bw = Math.min(w - 42, 14 + pseudo.length * 4.2 + texte.length * 4.6);
      c.globalAlpha = j === 0 ? f : 1;
      av(c, 12, y + 2, 11, k % 12, C);
      rondRect(c, 27, y, bw, bh, 5); c.fillStyle = j === 0 ? C['--panel3'] : C['--panel2']; c.fill();
      tx(c, pseudo, 32, y + bh / 2, F.m(6, 600), o.k, 'left');
      tx(c, texte, 36 + pseudo.length * 4.2, y + bh / 2 + .5, F.u(8.5, 500), C['--ink']);
      c.globalAlpha = 1;
    }
  }
  c.restore();
  const pied = intention ? '› « ' + (intention.length > 30 ? intention.slice(0, 29) + '…' : intention) + ' »' : 'HUMEUR : ' + humeur.toUpperCase();
  tx(c, pied, 12, h - 7, intention ? F.u(8.5, 500) : F.m(6.5), intention ? C['--amb'] : C['--ink2'], 'left', intention ? undefined : '1px');
  tx(c, (DEBITS_FIG[di] ?? 0) + '/MIN', w - 12, h - 7, F.d(8), C['--cy'], 'right');
};

// Quand le comédien dit : onde de voix qui défile, transcription mot à mot, mot-clé surligné quand il est entendu.
const PHRASE = ['je', 'voudrais', 'une', '*', 'pour', 'ce', 'soir'];
D['q:comedien-dit'] = (c, w, h, t, C, _S, o) => {
  const ty = 'q:comedien-dit', pm = o.params?.mots;
  const mots = (Array.isArray(pm) ? pm.map(String) : typeof pm === 'string' ? pm.split(/[,;|]/) : []).map((x) => x.trim()).filter(Boolean);
  const mot = mots[0] ?? 'religieuse', ecoute = Math.max(1, reglage(ty, 0, o));
  const parMot = .55, cycle = PHRASE.length * parMot + 2.2, T = o.run ? o.te : t % cycle, iMot = PHRASE.indexOf('*');
  const dits = Math.min(PHRASE.length, Math.floor(T / parMot) + 1), entendu = dits > iMot, pasDit = o.run && !entendu && T >= ecoute;
  const parle = (tau: number) => tau >= 0 && tau < PHRASE.length * parMot;
  const surMot = (tau: number) => tau >= iMot * parMot && tau < (iMot + 1) * parMot;
  // en-tête : micro ouvert, état
  c.globalAlpha = .5 + .5 * (Math.sin(t * 5) + 1) / 2; dot(c, 16, 9, 3, C['--rouge']); c.globalAlpha = 1;
  tx(c, 'COMÉDIEN · TRANSCRIPTION', 24, 9, F.m(6.5), C['--ink3'], 'left', '1px');
  tx(c, entendu ? 'ENTENDU' : pasDit ? 'PAS DIT' : 'ÉCOUTE…', w - 12, 9, F.m(6.5, 600), entendu ? C['--grn2'] : pasDit ? C['--rouge'] : C['--amb'], 'right', '1px');
  // onde de voix : 3 s glissantes, le passage du mot-clé en couleur du bloc
  const x0 = 12, W = w - 24, mid = 32, A = 13, n = 72, fen = 3;
  fr(c, x0, mid, W, 1, C['--line']);
  for (let i = 0; i < n; i++) {
    const u = i / n, tau = T - (1 - u) * fen, on = parle(tau);
    const a = on ? (.25 + .75 * Math.abs(Math.sin(tau * 23.7 + i * .9) * Math.sin(tau * 5.3 + 1.2))) : .06 + .04 * Math.abs(Math.sin(i * 1.7 + t * 3));
    fr(c, x0 + u * W, mid - a * A, 1.6, Math.max(1, 2 * a * A), on && surMot(tau) ? o.k : on ? C['--cy'] : C['--panel3']);
  }
  // transcription mot à mot
  let x = 12;
  const y = 58;
  for (let i = 0; i < dits && i < PHRASE.length; i++) {
    const m = PHRASE[i] === '*' ? mot : PHRASE[i], lw = m.length * 5.2 + 6;
    if (x + lw > w - 12) break;
    if (PHRASE[i] === '*') {
      rondRect(c, x - 2, y - 7, lw, 14, 4); c.fillStyle = o.k; c.fill();
      tx(c, m, x + 1, y + .5, F.u(9, 700), C['--bg']);
    } else tx(c, m, x, y + .5, F.u(9, 500), C['--ink2']);
    x += lw + 2;
  }
  if (dits < PHRASE.length && (t * 2) % 1 < .5) fr(c, x, y - 5, 1.5, 10, C['--ink3']);
  tx(c, 'MOTS : ' + (mots.length ? mots.join(' · ') : mot).toUpperCase(), 12, h - 8, F.m(6.5), C['--ink3'], 'left', '1px');
  tx(c, choix(ty, 1, o).toUpperCase(), w - 12, h - 8, F.m(6.5), C['--ink3'], 'right', '1px');
};

/** Aperçu générique (bloc inconnu) : une liaison. */
export const APERCU_PAR_DEFAUT = 'k:passage';

/** Table des aperçus, par clé `apercu` du catalogue. */
export const APERCUS: Readonly<Record<string, DessinApercu>> = D;
