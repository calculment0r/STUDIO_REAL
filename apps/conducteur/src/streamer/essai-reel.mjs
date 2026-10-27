#!/usr/bin/env node
// Essai RÉEL du flux streamer (vrai iPhone + PC de sortie), tout sur UNE adresse https (tunnel cloudflared) :
//   1. construit l'interface (Vite, sans contrôle de types : index.html, sortie.html, streamer.html → apps/conducteur/dist) ;
//   2. lance le serveur local (`npm run dev -w serveur` = wrangler dev : interface + API + salle WebSocket, même origine) ;
//   3. crée (ou reprend) le projet de test « Essai streamer » et son jeton, avec le JETON_ADMIN de apps/serveur/.dev.vars ;
//   4. facultatif : demande à Cloudflare des identifiants TURN ÉPHÉMÈRES si CF_TURN_CLE_ID et CF_TURN_CLE_JETON sont
//      posés dans l'environnement (aucune clé n'est créée ni stockée ici) ;
//   5. affiche l'adresse de la page de démarrage à ouvrir sur le PC.
// Le tunnel est lancé À PART par le propriétaire (voir ESSAI-REEL.md). Ctrl+C arrête le serveur.
//
// Usage (depuis C:\STUDIO_REAL) :
//   node apps/conducteur/src/streamer/essai-reel.mjs --tunnel https://xxxx.trycloudflare.com [--port 8787] [--sans-construire]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const CONDUCTEUR = join(ICI, '..', '..');
const RACINE = join(CONDUCTEUR, '..', '..');
const SERVEUR = join(RACINE, 'apps', 'serveur');
const MEMO = join(CONDUCTEUR, 'node_modules', '.cache', 'studio-real-essai-reel.json');   // hors git (node_modules)

const args = process.argv.slice(2);
const opt = (nom, def) => { const i = args.indexOf(nom); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };
const port = Number(opt('--port', '8787'));
const tunnel = (opt('--tunnel', '') || '').replace(/\/+$/, '');
const local = `http://127.0.0.1:${port}`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

if (tunnel && !/^https:\/\/[^/]+$/.test(tunnel)) { console.error('--tunnel : adresse https://… attendue (celle affichée par cloudflared)'); process.exit(2); }

// ── 1. construction ──
if (!args.includes('--sans-construire')) {
  console.log('[essai] construction de l\'interface (vite build)…');
  const code = `
    const { build } = await import('vite');
    const { existsSync } = await import('node:fs');
    const input = { main: 'index.html', streamer: 'streamer.html' };
    if (existsSync('sortie.html')) input.sortie = 'sortie.html';
    await build({ root: '.', logLevel: 'warn', build: { rollupOptions: { input } } });`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: CONDUCTEUR, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });
  if (r.status !== 0) { console.error('[essai] la construction a échoué'); process.exit(1); }
}

// ── 2. serveur local ──
function jetonAdmin() {
  const f = join(SERVEUR, '.dev.vars');
  const m = existsSync(f) && /^\s*JETON_ADMIN\s*=\s*"?([^"\r\n]+)"?/m.exec(readFileSync(f, 'utf8'));
  if (!m || m[1].trim().length < 16) { console.error('[essai] JETON_ADMIN absent de apps/serveur/.dev.vars (voir apps/serveur/README.md)'); process.exit(1); }
  return m[1].trim();
}
const admin = jetonAdmin();

console.log(`[essai] lancement du serveur local sur ${local}…`);
const serveur = spawn(`npm run dev -w serveur -- --ip 127.0.0.1 --port ${port} --show-interactive-dev-session=false`, {
  cwd: RACINE, shell: true, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
});
const arreter = () => {
  if (serveur.pid) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(serveur.pid), '/T', '/F'], { stdio: 'ignore' });
    else serveur.kill('SIGTERM');
  }
  process.exit(0);
};
process.on('SIGINT', arreter);
process.on('SIGTERM', arreter);

for (let i = 0; ; i++) {
  try { if ((await fetch(`${local}/api/sante`)).ok) break; } catch { /* pas encore prêt */ }
  if (serveur.exitCode !== null || i > 300) { console.error('[essai] le serveur ne démarre pas'); arreter(); }
  await pause(500);
}

// ── 3. projet de test ──
async function projet() {
  try {
    const m = JSON.parse(readFileSync(MEMO, 'utf8'));
    const r = await fetch(`${local}/api/projets/${m.id}`, { headers: { authorization: `Bearer ${m.jeton}` } });
    if (r.ok) return m;
  } catch { /* pas de mémo ou projet disparu */ }
  let corps = { titre: 'Essai streamer' };
  const live = join(RACINE, 'projets', 'live', 'live.conducteur.json');
  if (existsSync(live)) { try { corps = JSON.parse(readFileSync(live, 'utf8')); } catch { /* projet vide */ } }
  const r = await fetch(`${local}/api/projets`, {
    method: 'POST', headers: { authorization: `Bearer ${admin}`, 'content-type': 'application/json', 'x-auteur': 'essai-reel' }, body: JSON.stringify(corps),
  });
  if (!r.ok) { console.error('[essai] création du projet refusée :', r.status, await r.text()); arreter(); }
  const p = await r.json();
  mkdirSync(dirname(MEMO), { recursive: true });
  writeFileSync(MEMO, JSON.stringify({ id: p.id, jeton: p.jeton }));
  return { id: p.id, jeton: p.jeton };
}
const p = await projet();

// ── 4. TURN Cloudflare (facultatif, identifiants éphémères) ──
async function turnCloudflare() {
  const id = process.env.CF_TURN_CLE_ID, jeton = process.env.CF_TURN_CLE_JETON;
  if (!id || !jeton) return null;
  const ttl = Number(process.env.CF_TURN_DUREE ?? 6 * 3600);
  for (const chemin of ['generate-ice-servers', 'generate']) {
    try {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials/${chemin}`, {
        method: 'POST', headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, body: JSON.stringify({ ttl }),
      });
      if (!r.ok) { console.warn(`[essai] TURN Cloudflare (${chemin}) : ${r.status}`); continue; }
      let s = (await r.json()).iceServers;
      s = (Array.isArray(s) ? s : [s]).map((x) => ({ ...x, urls: (Array.isArray(x.urls) ? x.urls : [x.urls]).filter((u) => !/:53(\?|$)/.test(u)) }))   // port 53 bloqué par les navigateurs
        .filter((x) => x.urls.length);
      return s;
    } catch (e) { console.warn('[essai] TURN Cloudflare injoignable :', e.message); }
  }
  return null;
}
const ice = await turnCloudflare();
const iceB64 = ice ? Buffer.from(JSON.stringify(ice)).toString('base64url') : '';

// ── 5. adresse de démarrage ──
const base = tunnel || local;
const frag = new URLSearchParams({ role: 'accueil', projet: p.id, jeton: p.jeton, ...(iceB64 ? { ice: iceB64 } : {}) });
console.log(`
════════════════════════════════════════════════════════════════════════════
 ESSAI STREAMER prêt — projet ${p.id}${ice ? ' — TURN Cloudflare actif (éphémère)' : ' — STUN seul (même Wi-Fi)'}
 Ouvrez sur le PC :
   ${base}/streamer.html#${frag}
 ${tunnel ? 'Le téléphone recevra son adresse depuis cette page (bouton « Copier l\'adresse »).' : '⚠ Sans --tunnel : la caméra de l\'iPhone exige HTTPS, seul le PC peut tester.'}
 Ctrl+C pour tout arrêter.
════════════════════════════════════════════════════════════════════════════
`);
