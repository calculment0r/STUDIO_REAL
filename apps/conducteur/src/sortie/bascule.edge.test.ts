// BASCULE de la sortie écran scène, de bout en bout dans un VRAI navigateur (Edge sans tête, fausse caméra) :
// construit index.html + streamer.html + sortie.html, sert C:\STUDIO_REAL\medias-locales\ sous /medias-locales/
// (comme essai-reel.mjs), lance wrangler dev (interface + API + salle, même origine) et pilote par le protocole
// DevTools :
//   1. téléphone (streamer.html#role=streamer) EN DIRECT ;
//   2. sortie ouverte comme par la page de démarrage (sortie.html?projet=…&jeton=…&stats=1) ;
//   3. MONITEUR, même navigateur : DIRECT / VIDÉO / NOIR / QR PUBLIC → la sortie bascule, avec fondu ; vidéo absente
//      → message clair sur la sortie et retour au moniteur ;
//   4. CONDUITE du Conducteur (index.html, même navigateur) : un clip de la piste vidéo lu → la sortie bascule ;
//      puis le moniteur reprend la main (la dernière commande gagne, quelle que soit la régie) ;
//   5. par la SALLE : un moniteur dans un contexte de navigation isolé (autre « profil » : aucun BroadcastChannel
//      commun) pilote la même sortie.
// Arrête tout à la fin. Désactiver : SR_SANS_NAVIGATEUR=1 (ou SR_SANS_SERVEUR=1). Navigateur : SR_EDGE=<chemin>.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONDUCTEUR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVEUR = join(CONDUCTEUR, '..', 'serveur');
const MEDIAS = join(CONDUCTEUR, '..', '..', 'medias-locales');
const EDGE = process.env.SR_EDGE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SANS = process.env.SR_SANS_NAVIGATEUR === '1' || process.env.SR_SANS_SERVEUR === '1' || !existsSync(EDGE);
const ADMIN = 'jeton-admin-essai-bascule-0123456789';
const ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1', NO_COLOR: '1' };
const VIDEO = 'test-h3.mp4';
const AVEC_VIDEO = existsSync(join(MEDIAS, VIDEO));

const tmp = mkdtempSync(join(tmpdir(), 'bascule-sortie-'));
const dist = join(tmp, 'dist');
const etatWrangler = join(tmp, 'etat');
let base = '';
let wrangler: ChildProcess | null = null;
let edge: ChildProcess | null = null;
let journal = '';
let cdp: Cdp | null = null;
let projet = { id: '', jeton: '' };

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const portLibre = () => new Promise<number>((ok, ko) => {
  const s = createServer();
  s.once('error', ko);
  s.listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => ok(typeof a === 'object' && a ? a.port : 0)); });
});
const tuer = (p: ChildProcess | null) => {
  if (!p?.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  else p.kill('SIGTERM');
};

/** Client minimal du protocole DevTools (WebSocket natif de Node 24). */
class Cdp {
  private id = 0;
  private attente = new Map<number, { ok: (v: any) => void; ko: (e: Error) => void }>();
  private ws: WebSocket;
  ouvert: Promise<void>;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ouvert = new Promise((ok, ko) => { this.ws.onopen = () => ok(); this.ws.onerror = () => ko(new Error('CDP injoignable')); });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      const a = m.id !== undefined ? this.attente.get(m.id) : undefined;
      if (!a) return;
      this.attente.delete(m.id);
      if (m.error) a.ko(new Error(m.error.message)); else a.ok(m.result);
    };
  }
  envoyer(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((ok, ko) => this.attente.set(id, { ok, ko }));
  }
  async onglet(url: string, browserContextId?: string): Promise<Onglet> {
    const { targetId } = await this.envoyer('Target.createTarget', { url, ...(browserContextId ? { browserContextId } : {}) });
    const { sessionId } = await this.envoyer('Target.attachToTarget', { targetId, flatten: true });
    return new Onglet(this, targetId, sessionId);
  }
  fermer() { try { this.ws.close(); } catch { /* fermé */ } }
}

class Onglet {
  readonly cdp: Cdp; readonly targetId: string; readonly sessionId: string;
  constructor(cdp: Cdp, targetId: string, sessionId: string) { this.cdp = cdp; this.targetId = targetId; this.sessionId = sessionId; }
  async eval<T = any>(expression: string): Promise<T> {
    const r = await this.cdp.envoyer('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, this.sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value as T;
  }
  async attendre<T = any>(expression: string, ms = 20_000, quoi = expression): Promise<T> {
    const fin = Date.now() + ms;
    let derniere: unknown;
    for (;;) {
      try { derniere = await this.eval(expression); if (derniere) return derniere as T; } catch (e) { derniere = (e as Error).message; }
      if (Date.now() > fin) throw new Error(`délai dépassé : ${quoi} (dernier : ${JSON.stringify(derniere)})`);
      await pause(250);
    }
  }
  fermer() { return this.cdp.envoyer('Target.closeTarget', { targetId: this.targetId }); }
  /** Met l'onglet au premier plan (la sortie est une fenêtre VISIBLE sur le projecteur ; un onglet caché retarde
   *  la lecture des vidéos). */
  devant() { return this.cdp.envoyer('Target.activateTarget', { targetId: this.targetId }); }
}

/** Ce que montre la sortie : la couche du dessus (la scène qui entre par fondu). */
const SCENE_SORTIE = `(() => {
  const l = [...document.querySelectorAll('.so-1080 > .so-couche')]; const c = l[l.length - 1]; if (!c) return null;
  const v = c.querySelector('.so-lecteur video'), f = c.querySelector('video.so-flux');
  const type = c.querySelector('.so-noir') ? 'noir' : c.querySelector('.so-qr') ? 'accueil-qr' : c.querySelector('.so-lecteur') ? 'video' : f ? 'streamer' : '?';
  return { type, couches: l.length, opacite: c.style.opacity, transition: c.style.transition, flux: f ? f.videoWidth : 0,
    video: v ? { asset: v.dataset.asset, t: v.currentTime, l: v.videoWidth, pause: v.paused } : null, texte: c.innerText.slice(0, 200) };
})()`;

/** Clique le bouton de la barre SCÈNE du moniteur dont le texte est `txt`. */
const cliquer = (txt: string) => `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(txt)}); if (!b) throw new Error('bouton ${txt} absent'); b.click(); return true })()`;
const poserAsset = (a: string) => `(() => { const i = document.querySelector('input[data-asset-scene]') || document.querySelector('input[title^="nom du fichier"]'); i.value = ${JSON.stringify(a)}; return true })()`;

beforeAll(async () => {
  if (SANS) return;
  // 1. construction (sans contrôle de types) + médias locaux servis sous /medias-locales/ (comme essai-reel.mjs)
  const code = `
    const { build } = await import('vite');
    await build({ root: '.', logLevel: 'error', build: { outDir: ${JSON.stringify(dist)}, emptyOutDir: true,
      rollupOptions: { input: { main: 'index.html', streamer: 'streamer.html', sortie: 'sortie.html' } } } });`;
  const b = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: CONDUCTEUR, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' } });
  if (b.status !== 0) throw new Error('construction : ' + b.stdout + b.stderr);
  if (existsSync(MEDIAS)) {
    const dest = join(dist, 'medias-locales');
    mkdirSync(dest, { recursive: true });
    const noms = readdirSync(MEDIAS).filter((n) => /\.(mp4|webm|mov|m4v|png|jpe?g|webp)$/i.test(n));
    for (const n of noms) copyFileSync(join(MEDIAS, n), join(dest, n));
    writeFileSync(join(dest, 'index.json'), JSON.stringify(noms));
  }

  // 2. serveur local
  const WR = join(dirname(createRequire(join(SERVEUR, 'package.json')).resolve('wrangler/package.json')), 'bin', 'wrangler.js');
  const mig = spawnSync(process.execPath, [WR, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', etatWrangler], { cwd: SERVEUR, env: ENV, encoding: 'utf8' });
  if (mig.status !== 0) throw new Error('migrations : ' + mig.stdout + mig.stderr);
  const port = await portLibre();
  base = `http://127.0.0.1:${port}`;
  wrangler = spawn(process.execPath, [WR, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(await portLibre()),
    '--persist-to', etatWrangler, '--assets', dist, '--show-interactive-dev-session=false', '--var', `JETON_ADMIN:${ADMIN}`],
  { cwd: SERVEUR, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  wrangler.stdout!.on('data', (d) => { journal += d; });
  wrangler.stderr!.on('data', (d) => { journal += d; });
  for (const limite = Date.now() + 150_000; ;) {
    try { if ((await fetch(`${base}/api/sante`)).ok) break; } catch { /* pas prêt */ }
    if (Date.now() > limite || wrangler.exitCode !== null) throw new Error('wrangler ne démarre pas :\n' + journal.slice(-3000));
    await pause(300);
  }
  const r = await fetch(`${base}/api/projets`, { method: 'POST', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, body: '{"titre":"Essai bascule"}' });
  projet = await r.json();

  // 3. Edge sans tête, fausse caméra, lecture automatique permise
  const portCdp = await portLibre();
  edge = spawn(EDGE, [
    '--headless=new', `--remote-debugging-port=${portCdp}`, `--user-data-dir=${join(tmp, 'profil')}`, '--no-first-run', '--no-default-browser-check',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank',
  ], { stdio: 'ignore' });
  let url = '';
  for (const limite = Date.now() + 30_000; !url;) {
    try { url = (await (await fetch(`http://127.0.0.1:${portCdp}/json/version`)).json()).webSocketDebuggerUrl; } catch { /* pas prêt */ }
    if (!url) { if (Date.now() > limite) throw new Error('Edge ne répond pas'); await pause(250); }
  }
  cdp = new Cdp(url);
  await cdp.ouvert;
}, 240_000);

afterAll(() => {
  cdp?.fermer();
  tuer(edge);
  tuer(wrangler);
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* fichiers verrouillés sous Windows */ }
});

describe.skipIf(SANS)('bascule de la sortie écran scène (Edge sans tête)', () => {
  const lien = (role: string) => `${base}/streamer.html#role=${role}&projet=${projet.id}&jeton=${projet.jeton}`;
  let sortie: Onglet;
  let moniteur: Onglet;
  let conducteur: Onglet;

  const attendreScene = async (cond: string, quoi: string, ms = 15_000) => {
    try { return await sortie.attendre<any>(`(() => { const s = ${SCENE_SORTIE}; return s && (${cond}) ? s : null })()`, ms, quoi); }
    catch (e) { throw new Error(`${(e as Error).message}\nsortie : ${JSON.stringify(await sortie.eval(SCENE_SORTIE).catch(() => null))}`); }
  };

  it('moniteur (même navigateur) → sortie ouverte avec ?projet&jeton : direct, vidéo, noir, QR, avec fondu', async () => {
    const telephone = await cdp!.onglet(lien('streamer'));
    await telephone.attendre(`!!document.querySelector('.st-gros')`);
    await telephone.eval(`document.querySelector('.st-gros').click()`);
    await telephone.attendre(`window.__emetteur.etat().phase === 'pret'`, 20_000, 'caméra prête');
    await telephone.eval(`document.querySelector('.st-direct').click()`);

    // la sortie, ouverte exactement comme par le bouton SORTIE ÉCRAN de la page de démarrage
    sortie = await cdp!.onglet(`${base}/sortie.html?projet=${projet.id}&jeton=${projet.jeton}&stats=1`);
    await sortie.attendre(`!!document.querySelector('.so-1080 > .so-couche')`, 15_000, 'sortie dessinée');
    moniteur = await cdp!.onglet(lien('moniteur'));
    await moniteur.attendre(`!!document.querySelector('.pc-bouton')`, 15_000, 'moniteur prêt');
    await sortie.devant();

    await moniteur.eval(cliquer('DIRECT'));
    const direct = await attendreScene(`s.type === 'streamer' && s.flux > 0 && s.opacite === '1'`, 'sortie sur le direct (image du téléphone)', 30_000);
    console.log('[bascule] DIRECT :', JSON.stringify(direct));

    if (AVEC_VIDEO) {
      await moniteur.eval(poserAsset(VIDEO));
      await moniteur.eval(cliquer('VIDÉO'));
      const v = await attendreScene(`s.type === 'video' && s.opacite === '1' && s.video && s.video.l > 0 && s.video.t > 0.3 && !s.video.pause`, `sortie sur ${VIDEO} (lue)`);
      console.log('[bascule] VIDÉO :', JSON.stringify(v));
      expect(v.transition).toMatch(/opacity 800ms/);
      expect(v.video.asset).toBe(VIDEO);
    }
    await moniteur.eval(cliquer('NOIR'));
    console.log('[bascule] NOIR :', JSON.stringify(await attendreScene(`s.type === 'noir' && s.opacite === '1'`, 'sortie au noir')));
    await moniteur.eval(cliquer('QR PUBLIC'));
    console.log('[bascule] QR :', JSON.stringify(await attendreScene(`s.type === 'accueil-qr' && s.opacite === '1'`, 'sortie sur le QR')));
    await moniteur.eval(cliquer('DIRECT'));
    await attendreScene(`s.type === 'streamer' && s.flux > 0`, 'retour au direct', 20_000);
  }, 150_000);

  it('vidéo introuvable : message clair sur la sortie, retour au moniteur', async () => {
    await moniteur.eval(poserAsset('absente-xyz.mp4'));
    await moniteur.eval(cliquer('VIDÉO'));
    const s = await attendreScene(`s.type === 'video' && /absente-xyz\\.mp4 introuvable/.test(s.texte)`, 'message « introuvable » sur la sortie');
    console.log('[bascule] absente (sortie) :', JSON.stringify(s.texte));
    expect(s.texte).toMatch(/dossier médias/i);
    const retour = await moniteur.attendre<string>(`(() => { const r = document.querySelector('[data-retour-sortie]'); return r && /absente-xyz\\.mp4 introuvable/.test(r.textContent) ? r.textContent : '' })()`, 10_000, 'retour au moniteur');
    console.log('[bascule] absente (moniteur) :', retour);
    await moniteur.eval(cliquer('NOIR'));
    await attendreScene(`s.type === 'noir'`, 'noir');
  }, 60_000);

  it('conduite du Conducteur (index.html, même navigateur) : un clip de la piste vidéo fait basculer la sortie', async (ctx) => {
    if (!AVEC_VIDEO) { ctx.skip(); return; }
    conducteur = await cdp!.onglet(`${base}/index.html`);
    await conducteur.attendre(`!!window.__conduite`, 30_000, 'Conducteur chargé');
    await sortie.devant();
    // une piste « vidéo » : le clip test-h3.mp4 posé au début de chaque moment, puis lecture
    await conducteur.eval(`(() => {
      const m = window.__conduite.magasin.getState();
      m.modifierProjet((p) => { p.tracks.push({ id: 'tv_essai', type: 'video', name: 'Écran de scène', open: true,
        clips: p.ev.map((e, i) => ({ id: 'cv' + i, name: ${JSON.stringify(VIDEO)}, ev: e.id, off: 0, dur: 3600 })) }); }, 'essai bascule');
      window.__conduite.magasin.getState().lancer();
      return true })()`);
    const v = await attendreScene(`s.type === 'video' && s.opacite === '1' && s.video && s.video.asset === ${JSON.stringify(VIDEO)} && s.video.t > 0.3`, 'sortie sur le clip de la conduite', 20_000);
    console.log('[bascule] conduite → clip :', JSON.stringify(v), '· régie :', JSON.stringify(await conducteur.eval(`window.__conduite.sortie.getState().scene`)));
    // le moniteur reprend la main : la dernière commande gagne, d'où qu'elle vienne
    await moniteur.eval(cliquer('NOIR'));
    await attendreScene(`s.type === 'noir'`, 'moniteur après la conduite : noir');
    await conducteur.fermer();
  }, 90_000);

  it('par la salle : un moniteur d’un autre profil (contexte isolé, sans canal local commun) pilote la sortie', async () => {
    await moniteur.fermer();
    const { browserContextId } = await cdp!.envoyer('Target.createBrowserContext', { disposeOnDetach: true });
    const distant = await cdp!.onglet(lien('moniteur'), browserContextId);
    await distant.attendre(`!!document.querySelector('.pc-bouton')`, 15_000, 'moniteur distant prêt');
    await sortie.devant();
    await distant.attendre(`(() => { const r = document.querySelector('[data-retour-sortie]'); return r && /salle connectée/.test(r.textContent) })()`, 15_000, 'salle connectée côté moniteur distant');
    await distant.eval(cliquer('QR PUBLIC'));
    await attendreScene(`s.type === 'accueil-qr'`, 'QR par la salle');
    if (AVEC_VIDEO) {
      await distant.eval(poserAsset(VIDEO));
      await distant.eval(cliquer('VIDÉO'));
      console.log('[bascule] salle → VIDÉO :', JSON.stringify(await attendreScene(`s.type === 'video' && s.video && s.video.t > 0.3`, 'vidéo par la salle')));
    }
    await distant.eval(cliquer('DIRECT'));
    await attendreScene(`s.type === 'streamer' && s.flux > 0`, 'direct par la salle', 20_000);
    const retour = await distant.attendre<string>(`(() => { const r = document.querySelector('[data-retour-sortie]'); return r && /connectée/.test(r.textContent) && /streamer/.test(r.textContent) ? r.textContent : '' })()`, 10_000, 'retour de la sortie par la salle');
    console.log('[bascule] retour par la salle :', retour);
  }, 90_000);
});
