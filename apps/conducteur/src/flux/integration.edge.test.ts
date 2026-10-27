// Intégration RÉELLE du flux streamer : construit streamer.html (+ sortie.html si présente), lance le serveur local
// (wrangler dev : interface + API + salle sur la même origine, comme derrière le tunnel), ouvre Microsoft Edge sans
// tête avec une fausse caméra, et pilote deux onglets par le protocole DevTools :
//   - « téléphone » : streamer.html#role=streamer → ACTIVER LA CAMÉRA → EN DIRECT ;
//   - « moniteur » : streamer.html#role=moniteur → doit recevoir une image (dimensions > 0), chemin, statistiques ;
// puis consigne régie → téléphone, reprise de la caméra (piste coupée), latence mesurée par mire horodatée, et
// sortie.html?…&stats=1 (réception par recevoirFluxStreamer dans la vraie page de sortie). Arrête tout à la fin.
// Désactiver : SR_SANS_NAVIGATEUR=1 (ou SR_SANS_SERVEUR=1). Navigateur : SR_EDGE=<chemin> (défaut : Edge x86).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONDUCTEUR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVEUR = join(CONDUCTEUR, '..', 'serveur');
const EDGE = process.env.SR_EDGE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SANS = process.env.SR_SANS_NAVIGATEUR === '1' || process.env.SR_SANS_SERVEUR === '1' || !existsSync(EDGE);
const ADMIN = 'jeton-admin-essai-flux-0123456789';
const ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1', NO_COLOR: '1' };

const tmp = mkdtempSync(join(tmpdir(), 'flux-streamer-'));
const sortieDist = join(tmp, 'dist');
const etatWrangler = join(tmp, 'etat');
let base = '';
let wrangler: ChildProcess | null = null;
let edge: ChildProcess | null = null;
let journal = '';
let cdp: Cdp | null = null;
let projet = { id: '', jeton: '' };
let avecSortie = false;

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
  /** événements reçus (console, exceptions) des onglets où Runtime est activé */
  evenements: any[] = [];
  ouvert: Promise<void>;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ouvert = new Promise((ok, ko) => { this.ws.onopen = () => ok(); this.ws.onerror = () => ko(new Error('CDP injoignable')); });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.method) { this.evenements.push(m); if (this.evenements.length > 500) this.evenements.shift(); }
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
  async onglet(url: string): Promise<Onglet> {
    const { targetId } = await this.envoyer('Target.createTarget', { url });
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
  /** Attend que l'expression soit vraie (truthy) ; renvoie sa valeur. */
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
}

beforeAll(async () => {
  if (SANS) return;
  // 1. construction (sans contrôle de types) dans un dossier temporaire
  const code = `
    const { build } = await import('vite');
    const { existsSync } = await import('node:fs');
    const input = { streamer: 'streamer.html' };
    if (existsSync('sortie.html')) input.sortie = 'sortie.html';
    await build({ root: '.', logLevel: 'error', build: { outDir: ${JSON.stringify(sortieDist)}, emptyOutDir: true, rollupOptions: { input } } });`;
  let b = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: CONDUCTEUR, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' } });
  if (b.status !== 0) {
    // la sortie (autre chantier) peut être en travaux : on construit au moins la page streamer
    b = spawnSync(process.execPath, ['--input-type=module', '-e', code.replace("if (existsSync('sortie.html')) input.sortie = 'sortie.html';", '')], { cwd: CONDUCTEUR, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' } });
    if (b.status !== 0) throw new Error('construction : ' + b.stdout + b.stderr);
  }
  avecSortie = existsSync(join(sortieDist, 'sortie.html'));

  // 2. serveur local (même origine pour l'interface, l'API et la salle)
  const WR = join(dirname(createRequire(join(SERVEUR, 'package.json')).resolve('wrangler/package.json')), 'bin', 'wrangler.js');
  const mig = spawnSync(process.execPath, [WR, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', etatWrangler], { cwd: SERVEUR, env: ENV, encoding: 'utf8' });
  if (mig.status !== 0) throw new Error('migrations : ' + mig.stdout + mig.stderr);
  const port = await portLibre();
  base = `http://127.0.0.1:${port}`;
  wrangler = spawn(process.execPath, [WR, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(await portLibre()),
    '--persist-to', etatWrangler, '--assets', sortieDist, '--show-interactive-dev-session=false', '--var', `JETON_ADMIN:${ADMIN}`],
  { cwd: SERVEUR, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  wrangler.stdout!.on('data', (d) => { journal += d; });
  wrangler.stderr!.on('data', (d) => { journal += d; });
  for (const limite = Date.now() + 150_000; ;) {
    try { if ((await fetch(`${base}/api/sante`)).ok) break; } catch { /* pas prêt */ }
    if (Date.now() > limite || wrangler.exitCode !== null) throw new Error('wrangler ne démarre pas :\n' + journal.slice(-3000));
    await pause(300);
  }
  const r = await fetch(`${base}/api/projets`, { method: 'POST', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, body: '{"titre":"Essai flux"}' });
  projet = await r.json();

  // 3. Edge sans tête, fausse caméra et faux micro, permissions accordées
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

describe.skipIf(SANS)('flux streamer de bout en bout (Edge sans tête, fausse caméra)', () => {
  const lien = (role: string, extra = '') => `${base}/streamer.html#role=${role}&projet=${projet.id}&jeton=${projet.jeton}${extra}`;
  let moniteur: Onglet;
  let telephone: Onglet;

  it('téléphone → moniteur : image reçue, chemin direct, statistiques, H.264', async () => {
    moniteur = await cdp!.onglet(lien('moniteur'));
    await moniteur.attendre(`window.__recepteur?.etat().phase === 'attente'`, 20_000, 'moniteur en attente');
    telephone = await cdp!.onglet(lien('streamer'));
    await telephone.attendre(`!!document.querySelector('.st-gros')`);
    await telephone.eval(`document.querySelector('.st-gros').click()`);
    await telephone.attendre(`window.__emetteur.etat().phase === 'pret'`, 20_000, 'caméra prête');
    const debut = Date.now();
    await telephone.eval(`document.querySelector('.st-direct').click()`);
    const dims = await moniteur.attendre<{ l: number; h: number }>(
      `(() => { const v = document.querySelector('video'); return v && v.videoWidth > 0 ? { l: v.videoWidth, h: v.videoHeight } : null })()`, 30_000, 'image reçue');
    const delaiPremiereImage = Date.now() - debut;
    expect(dims.l).toBeGreaterThan(0);
    expect(dims.h).toBeGreaterThan(0);
    const s = await moniteur.attendre<any>(`(() => { const e = window.__recepteur.etat(); return e.phase === 'direct' && e.stats && e.stats.imagesParSeconde > 0 ? e.stats : null })()`, 20_000, 'statistiques');
    await pause(3000);
    const s2 = await moniteur.eval<any>(`window.__recepteur.etat().stats`);
    await pause(5000);
    const s3 = await moniteur.eval<any>(`window.__recepteur.etat().stats`);
    const e = await telephone.eval<any>(`(() => { const e = window.__emetteur.etat(); return { phase: e.phase, recepteurs: e.recepteurs, qualite: e.qualite, stats: e.stats } })()`);
    const reglages = await telephone.eval<any>(`window.__emetteur.etat().apercu.getVideoTracks()[0].getSettings()`);
    console.log(`[flux] après 8 s : reçu ${s3.largeur}×${s3.hauteur} ${s3.imagesParSeconde} i/s ${s3.debitKbps} kb/s ; caméra ${reglages.width}×${reglages.height}@${reglages.frameRate} ; envoi ${e.stats?.largeur}×${e.stats?.hauteur} limitation ${e.stats?.limitation} encodage ${e.stats?.encodageMs} ms ; réduction ${await telephone.eval('window.__emetteur.etat().reduction')}`);
    console.log(`[flux] première image ${delaiPremiereImage} ms après EN DIRECT ; reçu ${dims.l}×${dims.h} ; ${s2.imagesParSeconde} i/s ; ${s2.debitKbps} kb/s ; codec ${s2.codec} ; chemin ${s2.chemin}/${s2.reseau} ; RTT ${s2.rttMs} ms ; latence estimée ${s2.latenceEstimeeMs} ms ; téléphone : ${e.recepteurs} récepteur, qualité ${e.qualite}`);
    expect(s.chemin).toBe('direct');
    expect(s2.codec).toMatch(/H264/i);
    expect(s2.imagesParSeconde).toBeGreaterThan(10);
    expect(e).toMatchObject({ phase: 'direct', recepteurs: 1 });
  }, 120_000);

  it('consigne privée régie → téléphone, affichée et accusée', async () => {
    const id = await moniteur.eval<string>(`window.__recepteur.envoyerConsigne('Rejoins la fontaine', 'urgent')`);
    expect(id).toMatch(/^cons_/);
    const texte = await telephone.attendre<string>(`(() => { const c = document.querySelector('.st-consigne'); return c && !c.hidden ? c.textContent : '' })()`, 10_000, 'consigne affichée');
    expect(texte).toContain('Rejoins la fontaine');
    expect(texte).toContain('urgent');
  });

  it('reprise : caméra coupée (comme au retour d\'arrière-plan) → nouvelle piste sans renégocier, images toujours reçues', async () => {
    const avant = await moniteur.eval<number>(`window.__recepteur.etat().stats.imagesDecodees`);
    await telephone.eval(`(async () => { window.__emetteur.etat().apercu.getVideoTracks()[0].stop(); await window.__emetteur.reprendre(); })()`);
    await pause(2500);
    const apres = await moniteur.attendre<number>(`(() => { const n = window.__recepteur.etat().stats?.imagesDecodees ?? 0; return n > ${avant} + 20 ? n : 0 })()`, 15_000, 'images après reprise');
    expect(apres).toBeGreaterThan(avant);
    expect(await telephone.eval(`window.__emetteur.etat().phase`)).toBe('direct');
  }, 60_000);

  it('latence de bout en bout mesurée par mire horodatée (changement de téléphone : renégociation)', async () => {
    const tard = await moniteur.eval<any>(`window.__recepteur.etat().stats`);
    console.log(`[flux] après ~20 s de direct : reçu ${tard.largeur}×${tard.hauteur} ${tard.imagesParSeconde} i/s ${tard.debitKbps} kb/s`);
    await telephone.fermer();
    telephone = await cdp!.onglet(lien('streamer', '&mire=1'));
    await telephone.attendre(`!!document.querySelector('.st-gros')`);
    await telephone.eval(`document.querySelector('.st-gros').click()`);
    await telephone.attendre(`window.__emetteur.etat().phase === 'pret'`);
    await telephone.eval(`document.querySelector('.st-direct').click()`);
    const latences = await moniteur.attendre<number[]>(`(window.__latences || []).length >= 12 ? window.__latences : null`, 40_000, 'mesures de mire');
    const tri = [...latences].sort((a, b) => a - b);
    const mediane = tri[Math.floor(tri.length / 2)]!;
    const est = await moniteur.eval<any>(`window.__recepteur.etat().stats`);
    console.log(`[flux] latence mire (heure serveur codée dans l'image → relue à l'affichage) : médiane ${mediane} ms, min ${tri[0]} ms, max ${tri[tri.length - 1]} ms ; estimée par les stats ${est?.latenceEstimeeMs} ms`);
    expect(mediane).toBeGreaterThan(0);
    expect(mediane).toBeLessThan(1000);
  }, 90_000);

  it('sortie.html (chantier SORTIE) reçoit le flux par recevoirFluxStreamer, incrustation ?stats=1', async (ctx) => {
    if (!avecSortie) { console.log('[flux] sortie.html non construite : vérification sautée'); ctx.skip(); return; }
    const sortie = await cdp!.onglet(`${base}/sortie.html?projet=${projet.id}&jeton=${projet.jeton}&stats=1`);
    await cdp!.envoyer('Runtime.enable', {}, sortie.sessionId);
    await pause(6000);
    console.log('[flux] sortie (console) :', JSON.stringify(cdp!.evenements.filter((m) => m.sessionId === sortie.sessionId && /console|exception/i.test(m.method)).map((m) => m.params?.exceptionDetails?.exception?.description ?? m.params?.args?.map((a: any) => a.value ?? a.description).join(' '))).slice(0, 3000));
    console.log('[flux] téléphone :', JSON.stringify(await telephone.eval('(() => { const e = window.__emetteur.etat(); return { r: e.recepteurs, n: e.negociations } })()')));
    console.log('[flux] sortie (diagnostic) :', JSON.stringify(await sortie.eval(`({ url: location.href, incrustation: document.querySelector('[data-flux-stats]')?.textContent ?? null, texte: document.body.innerText.slice(0, 300), scripts: [...document.scripts].map((s) => s.src) })`)));
    const txt = await sortie.attendre<string>(`(() => { const d = document.querySelector('[data-flux-stats]'); return d && /DIRECT · (DIRECT|RELAIS)/.test(d.textContent) ? d.textContent : '' })()`, 30_000, 'incrustation de la sortie');
    console.log('[flux] sortie.html :', txt);
    expect(txt).toMatch(/i\/s/);
    expect(await telephone.eval(`window.__emetteur.etat().recepteurs`)).toBe(2);
    await sortie.fermer();
  }, 60_000);
});
