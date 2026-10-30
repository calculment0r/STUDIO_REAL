// Intégration RÉELLE du flux streamer : construit streamer.html (+ sortie.html si présente), lance le serveur local
// (wrangler dev : interface + API + salle sur la même origine, comme derrière le tunnel), ouvre Microsoft Edge sans
// tête avec une fausse caméra, et pilote deux onglets par le protocole DevTools :
//   - « téléphone » : streamer.html#role=streamer → ACTIVER LA CAMÉRA → EN DIRECT ;
//   - « moniteur » : streamer.html#role=moniteur → doit recevoir une image (dimensions > 0), chemin, statistiques ;
// puis consigne régie → téléphone, reprise de la caméra (piste coupée), latence mesurée par mire horodatée, et
// sortie.html?…&stats=1 (réception par recevoirFluxStreamer dans la vraie page de sortie). Arrête tout à la fin.
// Désactiver : SR_SANS_NAVIGATEUR=1 (ou SR_SANS_SERVEUR=1). Navigateur : SR_EDGE=<chemin> (défaut : Edge x86).
// Test LENT (projet vitest « conducteur-lent », `npm run test:lent`). Pilote CDP : ../test-outils/cdp.ts.
// Quand il se saute, il l'annonce : nom de describe « [SAUTÉ : raison] … » et un avertissement en tête de sortie.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lancerEdge, nomAvecSaut, pause, portLibre, raisonSautNavigateur, tuer, type Cdp, type Onglet } from '../test-outils/cdp';

const CONDUCTEUR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVEUR = join(CONDUCTEUR, '..', 'serveur');
const RAISON_SAUT = raisonSautNavigateur();
const SANS = RAISON_SAUT !== null;
if (SANS) console.warn(`[SAUTÉ : ${RAISON_SAUT}] flux streamer de bout en bout : aucun serveur ni navigateur lancé`);
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
  ({ edge, cdp } = await lancerEdge(tmp));
}, 240_000);

afterAll(() => {
  cdp?.fermer();
  tuer(edge);
  tuer(wrangler);
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* fichiers verrouillés sous Windows */ }
});

describe.skipIf(SANS)(nomAvecSaut(RAISON_SAUT, 'flux streamer de bout en bout (Edge sans tête, fausse caméra)'), () => {
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
    if (!avecSortie) { console.warn('[SAUTÉ : sortie.html non construite] vérification de la sortie : la construction de sortie.html a échoué ou la page est absente'); ctx.skip('sortie.html non construite'); return; }
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
