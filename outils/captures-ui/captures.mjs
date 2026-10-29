// Captures d'écran de l'interface globale (Edge sans tête, pilote CDP de apps/conducteur/src/test-outils/cdp.ts).
// Lancé À LA MAIN (pas dans la suite de tests) :
//   node outils/captures-ui/captures.mjs <avant|apres> [dossier de sortie]
// Dossier par défaut : docs/audit-2026-10/captures/angles-carres. Produit 0N-<nom>-<avant|apres>.png (1440×900, sauf le
// téléphone : 390×844). Il construit l'application téléphone (vite build dans apps/telephone, sans contrôle de types), lance `vite` pour le
// Conducteur (index.html, sortie.html, /t/) et un petit serveur factice pour la page de santé (les pages et le thème sont
// les vrais fichiers ; seule la réponse de /sante est inventée). Navigateur : SR_EDGE=<chemin> sinon Edge de Windows.
// Un PNG de plus de 250 Ko est réduit en palette (sharp) : les aplats du thème n'y perdent rien de visible.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EDGE, lancerEdge, pause, portLibre, tuer } from '../../apps/conducteur/src/test-outils/cdp.ts';

const DEPOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONDUCTEUR = join(DEPOT, 'apps', 'conducteur');
const PAGES = join(DEPOT, 'apps', 'serveur-spectacle', 'pages');
const THEME = join(DEPOT, 'packages', 'theme');
const [, , etiquette, sortieArg] = process.argv;
if (etiquette !== 'avant' && etiquette !== 'apres') { console.error('usage : node outils/captures-ui/captures.mjs <avant|apres> [dossier]'); process.exit(2); }
const SORTIE = resolve(sortieArg ?? join(DEPOT, 'docs', 'audit-2026-10', 'captures', 'angles-carres'));
mkdirSync(SORTIE, { recursive: true });
if (!existsSync(EDGE)) { console.error('Edge introuvable : ' + EDGE + ' (SR_EDGE=<chemin>)'); process.exit(3); }

const MAX_OCTETS = 250 * 1024;
let sharp = null;
try { sharp = createRequire(import.meta.url)('sharp'); } catch { /* sans réduction */ }

// 1. application téléphone construite (servie par le Conducteur sous /t/)
const b = spawnSync(process.execPath, [join(DEPOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: join(DEPOT, 'apps', 'telephone'), encoding: 'utf8' });
if (b.status !== 0) { console.error(b.stdout + b.stderr); process.exit(4); }

// 2. Conducteur en développement (vite)
const portVite = await portLibre();
const vite = spawn(process.execPath, [join(DEPOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(portVite), '--strictPort', '--host', '127.0.0.1'], { cwd: CONDUCTEUR, stdio: 'ignore' });
const base = `http://127.0.0.1:${portVite}`;
for (const limite = Date.now() + 60_000; ;) {
  try { if ((await fetch(base + '/')).ok) break; } catch { /* pas prêt */ }
  if (Date.now() > limite) throw new Error('vite ne démarre pas');
  await pause(300);
}

// 3. serveur factice de la page de santé
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const santeFactice = () => ({
  ok: true, version: 'abc1234', redemarrages: 0, depuisS: 5025, maintenant: Date.UTC(2026, 9, 29, 20, 15, 0), connexions: { total: 41 },
  persistance: { ageInstantaneMs: 800, disqueLibreMo: 182000, octetsJournal: 412000 },
  representation: { run: { id: 'rep-0001', mode: 'spectacle' }, lecture: { moment: 'M3', etape: 'vote', t: 142, termine: false, attenteGo: false }, panique: false, pause: false,
    acteurs: { public: 38, scene: 1, ministre: 1 }, connectes: { regie: 1 }, agents: {} },
  topRecu: { ts: Date.UTC(2026, 9, 29, 20, 14, 50), ilYaS: 10 },
  tunnel: { actif: true, etat: 'ok', latenceMs: 74, adresse: 'https://spectacle.exemple.fr', dernierSucces: Date.UTC(2026, 9, 29, 20, 14, 58) },
});
const factice = createServer((req, res) => {
  const chemin = (req.url ?? '/').split('?')[0];
  let fichier = null;
  if (chemin === '/sante.html') fichier = join(PAGES, 'sante.html');
  else if (chemin === '/checklist.html') fichier = join(PAGES, 'checklist.html');
  else if (chemin.startsWith('/theme/')) { const f = resolve(THEME, decodeURIComponent(chemin.slice(7))); if (f.startsWith(THEME)) fichier = f; }
  if (chemin === '/sante') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(santeFactice())); return; }
  if (!fichier || !existsSync(fichier) || statSync(fichier).isDirectory()) { res.statusCode = 404; res.end(); return; }
  res.setHeader('content-type', TYPES[extname(fichier)] ?? 'application/octet-stream');
  res.end(readFileSync(fichier));
});
await new Promise((ok) => factice.listen(0, '127.0.0.1', ok));
const baseSante = `http://127.0.0.1:${factice.address().port}`;

// 4. Edge
const tmp = mkdtempSync(join(tmpdir(), 'captures-ui-'));
const { edge, cdp } = await lancerEdge(tmp);

async function capturer(onglet, nom, { l = 1440, h = 900, mobile = false } = {}) {
  await cdp.envoyer('Emulation.setDeviceMetricsOverride', { width: l, height: h, deviceScaleFactor: 1, mobile }, onglet.sessionId);
  await pause(600);
  const r = await cdp.envoyer('Page.captureScreenshot', { format: 'png' }, onglet.sessionId);
  let png = Buffer.from(r.data, 'base64');
  const brut = png.length;
  if (png.length > MAX_OCTETS && sharp) {
    for (const couleurs of [256, 128, 64, 32]) {
      png = await sharp(Buffer.from(r.data, 'base64')).png({ palette: true, colours: couleurs, effort: 10, dither: 0 }).toBuffer();
      if (png.length <= MAX_OCTETS) break;
    }
  }
  const fichier = join(SORTIE, `${nom}-${etiquette}.png`);
  writeFileSync(fichier, png);
  console.log(`${nom}-${etiquette}.png  ${Math.round(png.length / 1024)} Ko (brut ${Math.round(brut / 1024)} Ko)`);
}

const ouvrir = async (url) => {
  const o = await cdp.onglet('about:blank');
  await cdp.envoyer('Page.enable', {}, o.sessionId);
  await cdp.envoyer('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, o.sessionId);
  await cdp.envoyer('Page.navigate', { url }, o.sessionId);
  return o;
};
const fonts = (o) => o.eval(`document.fonts.ready.then(() => true)`);

let code = 0;
try {
  // 01 : Conducteur, projet Écho (en-tête + panneau + conduite ; planche visible)
  let o = await ouvrir(`${base}/index.html?projet=echo`);
  await o.attendre(`!!document.querySelector('.coquille') && !!document.querySelector('canvas')`, 30_000, 'coquille');
  await o.attendre(`import('/src/etat/magasin.ts').then(m => m.useMagasin.getState().projet.ev.length > 0)`, 30_000, 'projet Écho chargé');
  await fonts(o); await pause(2500);
  await capturer(o, '01-conducteur');

  // 02 : fenêtre Projet › Acteurs
  await o.eval(`import('/src/coquille/interface.ts').then(m => m.useInterface.getState().poser({ acteurs: true }))`);
  await pause(800);
  // le projet Écho n'a pas encore d'acteurs ni d'envois : on pose les acteurs d'Écho, puis la conversion des commandes (boutons de la fenêtre)
  const cliquer = (texte) => o.eval('(() => { const b = Array.from(document.querySelectorAll("button")).find(x => x.textContent.includes(' + JSON.stringify(texte) + ')); if (b) b.click(); return !!b; })()');
  await cliquer('ACTEURS D’ÉCHO');
  await pause(800);
  await cliquer('CONVERTIR EN ENVOIS');
  await pause(1200);
  await capturer(o, '02-acteurs');
  await o.eval(`import('/src/coquille/interface.ts').then(m => m.useInterface.getState().poser({ acteurs: false }))`);

  // 03 : inspecteur, section ENVOIS d'une étape qui a des envois
  const cible = await o.eval(`import('/src/etat/magasin.ts').then(m => {
    const p = m.useMagasin.getState().projet;
    for (const ev of p.ev) for (const st of ev.st) if (Array.isArray(st.envois) && st.envois.length > 1) return { moment: ev.id, etape: st.id };
    for (const ev of p.ev) for (const st of ev.st) if (Array.isArray(st.envois) && st.envois.length) return { moment: ev.id, etape: st.id };
    return null; })`);
  if (!cible) throw new Error('aucune étape avec des envois dans le projet Écho');
  await o.eval(`import('/src/etat/magasin.ts').then(m => m.useMagasin.getState().selectionner(${JSON.stringify(cible)}))`);
  await o.attendre(`!!Array.from(document.querySelectorAll('.pn-tag')).find(e => e.textContent === 'ENVOIS')`, 10_000, 'section ENVOIS');
  await o.eval(`Array.from(document.querySelectorAll('.pn-tag')).find(e => e.textContent === 'ENVOIS').scrollIntoView({ block: 'start' })`);
  await pause(1200);
  await capturer(o, '03-envois');
  await o.eval(`import('/src/etat/magasin.ts').then(m => m.useMagasin.getState().selectionner({}))`);

  // 04 : émulateur ouvert (touche E)
  await o.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))`);
  await pause(1000);
  await cliquer('DÉMARRER');   // la foule émulée (x4 pour qu'elle se remplisse vite)
  await pause(3500);
  await capturer(o, '04-emulateur');
  await o.fermer();

  // 05 : un écran du téléphone (vote), application construite, téléphone émulé
  o = await ouvrir(`${base}/t/?emule=1&id=t042&pseudo=lea`);
  await o.attendre(`!!window.studioRealTelephone`, 20_000, 'téléphone émulé');
  await o.eval(`(() => { const s = window.studioRealTelephone.serveur; s.ouvrir(); })()`);
  await pause(800);
  await o.eval(`(() => { const s = window.studioRealTelephone.serveur; s.envoyer({ t: 'vue', acteur: 'public', vseq: 1, at: Date.now(), ecran: 'vote', params: { numero: 3, question: 'Que fait le ministre ?', reponses: ['Il signe', 'Il hésite', 'Il s’enfuit', 'Il appelle sa mère'] }, cle: 'm3_q1#1' }); })()`);
  await o.attendre(`document.querySelector('.tl-app')?.dataset.ecran === 'vote'`, 15_000, 'écran de vote');
  await pause(800);
  await capturer(o, '05-telephone-vote', { l: 390, h: 844, mobile: true });
  await o.fermer();

  // 06 : sortie en scène « mur »
  o = await ouvrir(`${base}/sortie.html?scene=mur&titre=${encodeURIComponent('La Fontaine')}`);
  await o.attendre(`document.body.innerText.length > 0 || !!document.querySelector('canvas')`, 20_000, 'sortie');
  await pause(3000);
  await capturer(o, '06-sortie-mur');
  await o.fermer();

  // 07 : page de santé
  o = await ouvrir(`${baseSante}/sante.html`);
  await o.attendre(`document.getElementById('global-titre')?.textContent !== 'Connexion…'`, 15_000, 'page de santé');
  await fonts(o); await pause(800);
  await capturer(o, '07-sante');
  await o.fermer();

  // 08 : check-list d'exploitation
  o = await ouvrir(`${baseSante}/checklist.html`);
  await pause(1500);
  await capturer(o, '08-checklist');
  await o.fermer();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  cdp.fermer(); tuer(edge); tuer(vite); factice.close();
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* verrouillé */ }
}
process.exit(code);
