// Serveur du prototype P0.5 « figurants » : pages statiques (racine du dépôt) + WebSocket /ws (PROTOCOLE.md)
// + orchestrateur des figurants. Lancer : node index.mjs   (variables : voir README.md)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Journal } from './journal.mjs';
import { Banques } from './banques.mjs';
import { Moderateur } from './moderation.mjs';
import { Jeu } from './jeu.mjs';
import { Orchestrateur, DENSITES } from './figurants/orchestrateur.mjs';
import { FournisseurOllama, FournisseurAnthropic } from './figurants/fournisseurs.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '..', '..', '..');
const env = process.env;
const CONFIG = {
  port: parseInt(env.PORT || '8787', 10),
  hote: env.HOTE || '0.0.0.0',
  ollamaUrl: env.OLLAMA_URL || 'http://localhost:11434',
  modeleOllama: env.MODELE_OLLAMA || 'qwen3:8b',
  ollamaMode: env.OLLAMA_MODE === 'parallele' ? 'parallele' : 'multi',
  fournisseur: ['auto', 'ollama', 'anthropic', 'banque'].includes(env.FOURNISSEUR) ? env.FOURNISSEUR : 'auto',
  densite: DENSITES[env.DENSITE] ? env.DENSITE : 'normal',
  acceleration: Number(env.ACCELERATION) || 2,
  budgetUsd: Number(env.BUDGET_USD) || 5,
  maxAppelsMin: Number(env.MAX_APPELS_MIN) || 30,
  journaux: env.JOURNAUX_DIR ? path.resolve(env.JOURNAUX_DIR) : path.join(ICI, 'journaux'),
  banques: env.BANQUES_DIR ? path.resolve(env.BANQUES_DIR) : path.resolve(ICI, '..', 'banques'),
  jetonRegie: env.JETON_REGIE || null,
};

const journal = new Journal(CONFIG.journaux);
const banques = new Banques({ dirBanques: CONFIG.banques, dirSecours: path.join(ICI, 'secours'), journal: (e) => journal.ecrire(e) });
const moderateur = new Moderateur({ liste: banques.liste, journal: (e) => journal.ecrire(e) });
const fournisseurs = {
  ollama: new FournisseurOllama({ url: CONFIG.ollamaUrl, modele: CONFIG.modeleOllama }),
  anthropic: new FournisseurAnthropic({ budgetUsd: CONFIG.budgetUsd }),
};
const jeu = new Jeu({ moderateur, journal, banques, jetonRegie: CONFIG.jetonRegie, etatInitial: { fournisseur: CONFIG.fournisseur, densite: CONFIG.densite } });
const orch = new Orchestrateur({ banques, moderateur, journal, jeu, fournisseurs,
  config: { acceleration: CONFIG.acceleration, maxAppelsMin: CONFIG.maxAppelsMin, ollamaMode: CONFIG.ollamaMode } });
jeu.orchestrateur = orch;

// ------------------------------------------------------------------ HTTP statique

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm',
};
// Jamais servis : fichiers cachés (.git, .env…), journaux, dépendances.
const INTERDITS = [/(^|\/)\.[^/]/, /^prototypes\/figurants\/serveur\/(journaux|node_modules)(\/|$)/, /(^|\/)node_modules(\/|$)/];
let racineReelle = RACINE;
try { racineReelle = fs.realpathSync(RACINE); } catch { /* rien */ }

function repondre(res, code, texte, entetes = {}) {
  res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff', ...entetes });
  res.end(texte);
}

function servir(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return repondre(res, 405, 'méthode non permise', { allow: 'GET, HEAD' });
  let chemin;
  try { chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return repondre(res, 400, 'chemin invalide'); }
  if (chemin === '/') return repondre(res, 302, '', { location: '/prototypes/figurants/pages/regie/' });
  if (chemin.includes('\0') || chemin.includes('\\')) return repondre(res, 400, 'chemin invalide');
  const relatif = path.posix.normalize(chemin).replace(/^\/+/, '');
  if (relatif.split('/').includes('..') || INTERDITS.some((r) => r.test(relatif))) return repondre(res, 404, 'introuvable');
  const absolu = path.resolve(RACINE, relatif);
  if (absolu !== RACINE && !absolu.startsWith(RACINE + path.sep)) return repondre(res, 404, 'introuvable');
  fs.realpath(absolu, (err, reel) => {
    if (err) return repondre(res, 404, 'introuvable');
    if (reel !== racineReelle && !reel.startsWith(racineReelle + path.sep)) return repondre(res, 404, 'introuvable');   // lien symbolique sortant
    fs.stat(reel, (e2, st) => {
      if (e2) return repondre(res, 404, 'introuvable');
      if (st.isDirectory()) {
        if (!chemin.endsWith('/')) return repondre(res, 301, '', { location: chemin + '/' });
        const index = path.join(reel, 'index.html');
        return fs.stat(index, (e3, si) => (e3 || !si.isFile() ? repondre(res, 404, 'introuvable') : envoyerFichier(req, res, index, si)));
      }
      if (!st.isFile()) return repondre(res, 404, 'introuvable');
      envoyerFichier(req, res, reel, st);
    });
  });
}

function envoyerFichier(req, res, fichier, st) {
  const type = MIME[path.extname(fichier).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(fichier).on('error', () => res.destroy()).pipe(res);
}

const serveur = http.createServer(servir);

// ------------------------------------------------------------------ WebSocket /ws

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
serveur.on('upgrade', (req, socket, tete) => {
  let p = '';
  try { p = new URL(req.url, 'http://x').pathname; } catch { /* rien */ }
  if (p !== '/ws') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, tete, (ws) => wss.emit('connection', ws, req));
});
wss.on('connection', (ws, req) => {
  const c = jeu.ajouter(ws, req.socket.remoteAddress);
  ws.vivant = true;
  ws.on('pong', () => { ws.vivant = true; });
  ws.on('message', (data) => jeu.recevoir(c, data.toString()));
  ws.on('close', () => jeu.retirer(ws));
  ws.on('error', () => {});
});
const battement = setInterval(() => {
  for (const ws of wss.clients) { if (!ws.vivant) { ws.terminate(); continue; } ws.vivant = false; try { ws.ping(); } catch { /* rien */ } }
}, 15000);

// ------------------------------------------------------------------ boucles

const minuteurStat = setInterval(() => {
  const s = jeu.stat();
  jeu.versRegie(s);
  journal.ecrire({ e: 'stat', fournisseur: s.fournisseur, lat: s.lat, rejets: s.rejets, debit: s.debit, cout_usd: s.cout_usd, doublons: s.doublons });
  if (s.fournisseur !== orch.fournisseurEffectif) {
    if (orch.fournisseurEffectif !== null) jeu.journalRegie(`fournisseur effectif : ${s.fournisseur}`);
    orch.fournisseurEffectif = s.fournisseur;
  }
}, 5000);

const minuteurBanques = setInterval(() => {
  if (banques.verifier()) { moderateur.remplacerListe(banques.liste); jeu.journalRegie('banques rechargées : ' + JSON.stringify(banques.sources)); }
}, 5000);

async function santeOllama() {
  if (!['auto', 'ollama'].includes(jeu.etat.fournisseur)) return;
  const f = fournisseurs.ollama;
  const avant = f.joignable;
  const r = await f.sante();
  if (r.ok && avant !== true) {
    jeu.journalRegie(`Ollama joignable (${CONFIG.modeleOllama}) : préchauffage`);
    const t0 = Date.now();
    const ok = await f.prechauffer();
    journal.ecrire({ e: 'prechauffage', fournisseur: 'ollama', ok, ms: Date.now() - t0 });
    await orch.prechaufferPrompt();
  } else if (!r.ok && avant !== false) {
    jeu.journalRegie(`Ollama injoignable (${r.raison}) : repli sur ${fournisseurs.anthropic.disponible() ? 'anthropic' : 'banque'}`);
  }
}
const minuteurSante = setInterval(santeOllama, 15000);

serveur.listen(CONFIG.port, CONFIG.hote, async () => {
  const adr = serveur.address();
  const config = { ...CONFIG, anthropic: fournisseurs.anthropic.disponible() ? 'clé présente' : 'absent' };
  delete config.jetonRegie;
  journal.ecrire({ e: 'demarrage', port: adr.port, config, banques: banques.sources });
  console.log(`figurants : http://localhost:${adr.port}/  (régie : /prototypes/figurants/pages/regie/)  port=${adr.port}`);
  console.log(`banques : ${JSON.stringify(banques.sources)}`);
  console.log(`fournisseur : ${CONFIG.fournisseur} · ollama ${CONFIG.ollamaUrl} ${CONFIG.modeleOllama} (${CONFIG.ollamaMode}) · anthropic ${config.anthropic} · journaux ${CONFIG.journaux}`);
  orch.demarrer();
  await santeOllama();
  console.log('PRET');
});

function arreter() {
  clearInterval(battement); clearInterval(minuteurStat); clearInterval(minuteurBanques); clearInterval(minuteurSante);
  orch.arreter();
  journal.ecrire({ e: 'arret' });
  for (const ws of wss.clients) ws.terminate();
  serveur.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', arreter);
process.on('SIGTERM', arreter);
