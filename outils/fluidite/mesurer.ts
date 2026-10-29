// Outil de mesure de FLUIDITÉ du Conducteur (lot « fluidité » de l'audit d'octobre 2026). Il ne modifie aucun fichier du
// produit : il construit le Conducteur en mode développement (React non réduit, noms de composants lisibles), le sert
// sur un port local, lance Edge sans tête, ouvre la régie (projet Écho, mode SPECTACLE) et sa fenêtre de sortie comme le
// produit, déroule le scénario (scenario.ts) et écrit un JSON + un tableau lisible.
//
//   node --import tsx outils/fluidite/mesurer.ts --aide
//   node --import tsx outils/fluidite/mesurer.ts                       # tout le scénario (≈ 4 min)
//   node --import tsx outils/fluidite/mesurer.ts --phase lecture,go    # certaines phases seulement
//   node --import tsx outils/fluidite/mesurer.ts --comparer avant.json apres.json
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { cpus, tmpdir, totalmem } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, EDGE, Onglet, pause, portLibre, tuer } from '../../apps/conducteur/src/test-outils/cdp';
import {
  analyserImages, analyserProfil, analyserTrace, preparerTrace, arrondi, comparer, diffMetriques, diffSonde, type EvTrace, type Metriques, type Photo, type Resultat,
} from './analyse';
import {
  EXPR_BOUTON_GO, EXPR_ETAT, EXPR_GO, EXPR_LANCER, EXPR_MODIFIER, EXPR_OUVRIR_SORTIE, EXPR_REPETITION, EXPR_PAUSE, EXPR_PRET, EXPR_SORTIE_RELIEE, EXPR_SPECTACLE,
  FENETRE_REGIE, FENETRE_SORTIE, PHASES, PROJET, type Construction, type PhaseDef,
} from './scenario';
import { SONDE } from './sonde';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..', '..');
const CONDUCTEUR = join(RACINE, 'apps', 'conducteur');
const RESULTATS = join(ICI, 'resultats');

// ── options ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const AIDE = `Mesure de fluidité du Conducteur (Edge sans tête, projet ${PROJET}, mode SPECTACLE). Ne modifie aucun fichier du produit.

Usage : node --import tsx outils/fluidite/mesurer.ts [options]

  --aide                    cette aide (code de sortie 0)
  --phase <nom[,nom…]>      ne joue que ces phases (répétable). Phases : ${PHASES.map((p) => p.nom).join(', ')}
  --hypotheses              joue les EXPÉRIENCES (zone masquée, animations coupées…) : phases hyp-*, ≈ 2,5 min, résultat à part
  --sans-sortie             n'ouvre pas la fenêtre de sortie (saute les phases qui en ont besoin)
  --duree <facteur>         multiplie les durées de mesure (0,2 = essai rapide ; défaut 1)
  --etiquette <nom>         nom du fichier de résultat (défaut : « complet » ou les phases jouées)
  --json <chemin>           écrit le résultat à cet endroit au lieu de outils/fluidite/resultats/
  --headless-new            lance Edge en « headless=new » au lieu de « headless=old » (défaut). ATTENTION : ce mode crée des fenêtres
                            listées par Windows (une par page) ; à n'utiliser que si le mode par défaut est refusé par votre Edge
  --sans-trace              pas de trace du navigateur (plus léger, moins de détails sur les images)
  --construction <c>        force la construction de TOUTES les phases : production ou developpement (défaut : chaque phase a la sienne)
  --reconstruire            force la construction du Conducteur (sinon réutilisée tant que les sources n'ont pas changé)
  --lister                  liste les phases et leur durée, sans rien lancer
  --comparer <avant> <après>  compare deux fichiers de résultat (même scénario, même machine) et n'ouvre aucun navigateur

Variables : SR_EDGE=<chemin de msedge.exe>. Durée : environ 4 minutes pour tout le scénario, plus 15 s pour une première construction.
Sans Edge (SR_SANS_NAVIGATEUR=1 ou SR_SANS_SERVEUR=1) : l'outil s'arrête avec un message, code 0.`;

interface Options { headlessNew: boolean; hypotheses: boolean; aide: boolean; lister: boolean; phases: string[] | null; sansSortie: boolean; facteur: number; etiquette: string | null; json: string | null; sansTrace: boolean; reconstruire: boolean; construction: Construction | null; comparer: [string, string] | null }
function lireOptions(argv: string[]): Options {
  const o: Options = { headlessNew: false, hypotheses: false, aide: false, lister: false, phases: null, sansSortie: false, facteur: 1, etiquette: null, json: null, sansTrace: false, reconstruire: false, construction: null, comparer: null };
  const valeur = (i: number, nom: string) => { const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) throw new Error(`${nom} attend une valeur`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--aide' || a === '-h' || a === '--help') o.aide = true;
    else if (a === '--lister') o.lister = true;
    else if (a === '--hypotheses') o.hypotheses = true;
    else if (a === '--headless-new') o.headlessNew = true;
    else if (a === '--phase') { (o.phases ??= []).push(...valeur(i, a).split(',').map((s) => s.trim()).filter(Boolean)); i++; }
    else if (a === '--sans-sortie') o.sansSortie = true;
    else if (a === '--duree') { o.facteur = Number(valeur(i, a).replace(',', '.')); i++; if (!(o.facteur > 0)) throw new Error('--duree attend un nombre > 0'); }
    else if (a === '--etiquette') { o.etiquette = valeur(i, a).replace(/[^\w.-]+/g, '-'); i++; }
    else if (a === '--json') { o.json = valeur(i, a); i++; }
    else if (a === '--sans-trace') o.sansTrace = true;
    else if (a === '--reconstruire') o.reconstruire = true;
    else if (a === '--construction') { const v = valeur(i, a); i++; if (v !== 'production' && v !== 'developpement') throw new Error('--construction attend production ou developpement'); o.construction = v; }
    else if (a === '--comparer') { const x = valeur(i, a), y = argv[i + 2]; if (!y) throw new Error('--comparer attend deux fichiers'); o.comparer = [x, y]; i += 2; }
    else throw new Error(`option inconnue : ${a} (voir --aide)`);
  }
  if (o.phases) for (const p of o.phases) if (!PHASES.some((x) => x.nom === p)) throw new Error(`phase inconnue : ${p} (phases : ${PHASES.map((x) => x.nom).join(', ')})`);
  return o;
}

// ── construction du Conducteur en mode développement ───────────────────────────────────────────────────────────────
function plusRecente(dossier: string, ignore = new Set(['node_modules', 'dist', '.git', 'resultats'])): number {
  let max = 0;
  if (!existsSync(dossier)) return 0;
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    if (ignore.has(e.name)) continue;
    const p = join(dossier, e.name);
    max = Math.max(max, e.isDirectory() ? plusRecente(p, ignore) : statSync(p).mtimeMs);
  }
  return max;
}

/** Construit (ou réutilise) le Conducteur : PRODUCTION (comme `npm run build`, code réduit) ou DÉVELOPPEMENT (React non réduit : noms de composants, durées de rendu). */
function construire(mode: Construction, force: boolean): { dist: string; reconstruit: boolean } {
  const dossier = join(tmpdir(), 'studio-real-fluidite', mode === 'production' ? 'prod' : 'dev');
  const dist = join(dossier, 'dist');
  const estampille = join(dossier, 'estampille.txt');
  mkdirSync(dossier, { recursive: true });
  const sources = Math.max(
    plusRecente(join(CONDUCTEUR, 'src')), ...readdirSync(join(RACINE, 'packages')).map((p) => plusRecente(join(RACINE, 'packages', p))),
    plusRecente(join(RACINE, 'projets', PROJET)), plusRecente(join(RACINE, 'projets', 'live')),
    ...['index.html', 'sortie.html', 'streamer.html', 'vite.config.ts'].map((f) => (existsSync(join(CONDUCTEUR, f)) ? statSync(join(CONDUCTEUR, f)).mtimeMs : 0)),
  );
  if (!force && existsSync(join(dist, 'index.html')) && existsSync(estampille) && Number(readFileSync(estampille, 'utf8')) >= sources) return { dist, reconstruit: false };
  const code = `
    const { build } = await import('vite');
    const { existsSync } = await import('node:fs');
    const input = { main: 'index.html', sortie: 'sortie.html' };
    await build({ root: '.', mode: ${JSON.stringify(mode === 'production' ? 'production' : 'development')}, logLevel: 'warn', build: { outDir: ${JSON.stringify(dist)}, emptyOutDir: true, ${mode === 'production' ? '' : 'minify: false,'} reportCompressedSize: false, rollupOptions: { input } } });`;
  const b = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: CONDUCTEUR, encoding: 'utf8', env: { ...process.env, NODE_ENV: mode === 'production' ? 'production' : 'development' } });
  if (b.status !== 0) throw new Error('construction du Conducteur : ' + b.stdout + b.stderr);
  writeFileSync(estampille, String(Date.now()));
  return { dist, reconstruit: true };
}

// ── petit serveur de fichiers (le Conducteur n'a besoin d'aucun serveur pour ce scénario) ──────────────────────────
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8',
};
const PREFIXE: Record<Construction, string> = { production: '/prod', developpement: '/dev' };
async function servir(dists: Partial<Record<Construction, string>>): Promise<{ base: string; serveur: Server }> {
  const serveur = createServer((q, r) => {
    let p = decodeURIComponent((q.url ?? '/').split('?')[0]!);
    if (p === '/__vide') { r.setHeader('content-type', TYPES['.html']!); r.end('<!doctype html><meta charset="utf-8"><title>vide</title><body style="background:#111"></body>'); return; }
    const mode = (Object.keys(PREFIXE) as Construction[]).find((m) => p.startsWith(PREFIXE[m] + '/'));
    const dist = mode ? dists[mode] : undefined;
    if (!mode || !dist) { r.statusCode = 404; r.end(); return; }
    p = p.slice(PREFIXE[mode].length);
    if (p === '/') p = '/index.html';
    const f = join(dist, p);
    if (!f.startsWith(dist) || !existsSync(f) || statSync(f).isDirectory()) { r.statusCode = 404; r.end(); return; }
    r.setHeader('content-type', TYPES[extname(f)] ?? 'application/octet-stream');
    r.setHeader('cache-control', 'no-store');
    r.end(readFileSync(f));
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  return { base: `http://127.0.0.1:${(serveur.address() as { port: number }).port}`, serveur };
}

// ── navigateur ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** Écoute les messages du protocole en plus du client commun (qui ne garde que les 500 derniers événements). */
function ecouter(cdp: Cdp, f: (m: any) => void) {
  (cdp as unknown as { ws: WebSocket }).ws.addEventListener('message', (e: MessageEvent) => { try { f(JSON.parse(String(e.data))); } catch { /* message illisible */ } });
}

/**
 * Tue les Edge sans tête laissés par un lancement précédent de CET outil (reconnus à leur dossier de profil
 * « fluidite-edge-… » dans le dossier temporaire), puis supprime ces dossiers. Ne touche jamais aux autres Edge.
 */
export function nettoyerOrphelins(): number {
  let tues = 0;
  if (process.platform === 'win32') {
    const r = spawnSync('powershell', ['-NoProfile', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Where-Object { $_.CommandLine -match 'fluidite-edge-' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null; $_.ProcessId }"], { encoding: 'utf8' });
    tues = r.stdout.split(/s+/).filter((x) => /^d+$/.test(x)).length;
  } else {
    spawnSync('pkill', ['-f', 'fluidite-edge-']);
  }
  for (const d of readdirSync(tmpdir())) if (d.startsWith('fluidite-')) { try { rmSync(join(tmpdir(), d), { recursive: true, force: true }); } catch { /* verrouillé : le prochain lancement réessaiera */ } }
  return tues;
}

interface Cible { onglet: Onglet; info: any }
class Navigateur {
  edge!: ChildProcess; cdp!: Cdp; profil = '';
  cibles = new Map<string, Cible>();
  erreurs: string[] = [];
  private evsTrace: EvTrace[] = [];
  private finTrace: (() => void) | null = null;

  async lancer(headlessNew = false): Promise<void> {
    this.profil = mkdtempSync(join(tmpdir(), 'fluidite-edge-'));
    // quoi qu'il arrive (échec, Ctrl+C, fin normale) le navigateur est tué avec tous ses processus
    const tuerSync = () => { tuer(this.edge); };
    process.once('exit', tuerSync);
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.once(sig, () => { tuerSync(); process.exit(130); });
    const portCdp = await portLibre();
    // Mêmes options que test-outils/cdp.ts lancerEdge, SAUF celles qui désactivent la mise en veille des onglets cachés :
    // ici on veut le comportement réel du navigateur quand un onglet ou une fenêtre est caché.
    this.edge = spawn(EDGE, [
      headlessNew ? '--headless=new' : '--headless=old', `--remote-debugging-port=${portCdp}`, `--user-data-dir=${join(this.profil, 'profil')}`, '--no-first-run', '--no-default-browser-check',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-extensions', '--disable-component-extensions-with-background-pages',
      `--window-size=${FENETRE_REGIE.l},${FENETRE_REGIE.h}`, '--force-device-scale-factor=1', 'about:blank',
    ], { stdio: 'ignore' });
    try {
      let url = '';
      for (const limite = Date.now() + 30_000; !url;) {
        try { url = (await (await fetch(`http://127.0.0.1:${portCdp}/json/version`)).json()).webSocketDebuggerUrl; } catch { /* pas prêt */ }
        if (!url && this.edge.exitCode !== null) throw new Error(headlessNew ? "Edge s'est arrêté au démarrage" : "Edge s'est arrêté au démarrage : cette version refuse peut-être --headless=old (retiré des versions récentes d'Edge). Voir l'option --headless-new (elle crée des fenêtres visibles dans la liste de Windows).");
        if (!url) { if (Date.now() > limite) throw new Error('Edge ne répond pas'); await pause(250); }
      }
      this.cdp = new Cdp(url);
      await this.cdp.ouvert;
    } catch (e) { tuer(this.edge); throw e; }
    ecouter(this.cdp, (m) => this.surMessage(m));
    await this.cdp.envoyer('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  }

  private surMessage(m: any) {
    if (m.method === 'Target.attachedToTarget') void this.surAttache(m.params);
    else if (m.method === 'Target.detachedFromTarget') { for (const [id, c] of this.cibles) if (c.onglet.sessionId === m.params.sessionId) this.cibles.delete(id); }
    else if (m.method === 'Tracing.dataCollected') { for (const e of m.params.value) this.evsTrace.push(e); }
    else if (m.method === 'Tracing.tracingComplete') this.finTrace?.();
    else if (m.method === 'Runtime.exceptionThrown' && this.erreurs.length < 12) this.erreurs.push(`exception : ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`.slice(0, 300));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error' && this.erreurs.length < 12) this.erreurs.push(`console.error : ${(m.params.args ?? []).map((a: any) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 300));
  }

  private async surAttache(p: any) {
    const { sessionId, targetInfo: info } = p, send = (meth: string, params: Record<string, unknown> = {}) => this.cdp.envoyer(meth, params, sessionId).catch(() => undefined);
    if (info.type === 'page') {
      await send('Page.enable');
      await send('Page.addScriptToEvaluateOnNewDocument', { source: SONDE });
      await send('Performance.enable');
      await send('Runtime.enable');
      const dim = info.openerId ? FENETRE_SORTIE : FENETRE_REGIE;
      await send('Emulation.setDeviceMetricsOverride', { width: dim.l, height: dim.h, deviceScaleFactor: 1, mobile: false });
      this.cibles.set(info.targetId, { onglet: new Onglet(this.cdp, info.targetId, sessionId), info });
    }
    if (p.waitingForDebugger) await send('Runtime.runIfWaitingForDebugger');
  }

  async cible(targetId: string, ms = 20_000): Promise<Onglet> {
    for (const fin = Date.now() + ms; Date.now() < fin;) { const c = this.cibles.get(targetId); if (c) return c.onglet; await pause(50); }
    throw new Error('la page ne s\'est pas attachée au pilote');
  }

  /** Ouvre un onglet (instrumenté avant son premier script) et y charge `url`. */
  async ouvrir(url: string): Promise<Onglet> {
    const { targetId } = await this.cdp.envoyer('Target.createTarget', { url: 'about:blank' });
    const o = await this.cible(targetId);
    if (url !== 'about:blank') await this.cdp.envoyer('Page.navigate', { url }, o.sessionId);
    return o;
  }

  /** Nouvelle fenêtre ouverte par la page `opener` (window.open) : renvoie son onglet. */
  async fenetreOuverteePar(opener: Onglet, expression: string): Promise<Onglet> {
    const avant = new Set(this.cibles.keys());
    const r = await this.cdp.envoyer('Runtime.evaluate', { expression, userGesture: true, returnByValue: true }, opener.sessionId);
    if (r.exceptionDetails || !r.result.value) throw new Error('window.open refusé par le navigateur');
    for (const fin = Date.now() + 15_000; Date.now() < fin; await pause(50)) {
      for (const [id, c] of this.cibles) if (!avant.has(id) && c.info.openerId === opener.targetId) return c.onglet;
    }
    throw new Error('la fenêtre de sortie ne s\'est pas ouverte');
  }

  async metriques(o: Onglet): Promise<Metriques> {
    const r = await this.cdp.envoyer('Performance.getMetrics', {}, o.sessionId);
    return Object.fromEntries(r.metrics.map((x: { name: string; value: number }) => [x.name, x.value]));
  }
  gc(o: Onglet) { return this.cdp.envoyer('HeapProfiler.collectGarbage', {}, o.sessionId).catch(() => undefined); }

  async traceDemarrer() {
    this.evsTrace = [];
    await this.cdp.envoyer('Tracing.start', { traceConfig: { recordMode: 'recordContinuously', includedCategories: ['devtools.timeline'] }, transferMode: 'ReportEvents' });
  }
  async traceArreter(): Promise<EvTrace[]> {
    const fin = new Promise<void>((ok) => { this.finTrace = ok; });
    await this.cdp.envoyer('Tracing.end');
    await Promise.race([fin, pause(60_000)]);
    const r = this.evsTrace; this.evsTrace = []; return r;
  }

  async fermer() {
    try { this.cdp?.fermer(); } catch { /* déjà fermé */ }
    tuer(this.edge);
    nettoyerOrphelins();   // filet de sécurité : plus aucun processus Edge de cet outil ne survit
    for (let i = 0; i < 8; i++) {   // Windows garde les fichiers verrouillés un court instant après l'arrêt
      await pause(400);
      try { rmSync(this.profil, { recursive: true, force: true }); return; } catch { /* nouvel essai */ }
    }
  }
}

// ── déroulé ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Temps cumulés de tous les cœurs (occupé, total) : sert à mesurer la charge de la MACHINE pendant une phase (les autres programmes comptent). */
const tempsCoeurs = () => { let occupe = 0, total = 0; for (const c of cpus()) { const t = c.times; occupe += t.user + t.nice + t.sys + t.irq; total += t.user + t.nice + t.sys + t.irq + t.idle; } return { occupe, total }; };
/**
 * Alimentation du poste : sur batterie, le processeur tourne plus lentement (pas de « turbo ») et TOUS les chiffres
 * doublent à peu près (constaté : 410 ms/s sur secteur, 820 ms/s sur batterie pour la même phase).
 */
function alimentation(): 'secteur' | 'batterie' | 'inconnue' {
  if (process.platform !== 'win32') return 'inconnue';
  try {
    const r = spawnSync('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Battery | Select-Object -First 1).BatteryStatus'], { encoding: 'utf8', timeout: 8000 }).stdout.trim();
    if (!r) return 'secteur';   // pas de batterie (poste fixe)
    return r === '1' ? 'batterie' : 'secteur';
  } catch { return 'inconnue'; }
}

const limiter = <T>(l: T[], n: number) => l.slice(0, n);
const mo = (x: number | undefined) => arrondi((x ?? 0) / 1048576, 1);

class Banc {
  regie!: Onglet; sortie: Onglet | null = null; vide: Onglet | null = null;
  sortieReduite = false; onglet: 'visible' | 'cache' = 'visible';
  derniere: { onglet: string; sortie: string } | null = null;
  /** adresse de la construction en cours de session */
  adresse = '';
  constructor(readonly nav: Navigateur, readonly base: string, readonly o: Options) {}
  private get cdp() { return this.nav.cdp; }
  private ev<T = any>(o: Onglet, e: string): Promise<T> { return o.eval<T>(e); }

  /** Ferme les pages de la session précédente. */
  async terminerSession() {
    for (const o of [this.regie, this.sortie, this.vide]) if (o) await o.fermer().catch(() => undefined);
    this.sortie = null; this.vide = null; this.sortieReduite = false; this.onglet = 'visible'; this.derniere = null;
    await pause(500);
  }

  async demarrerRegie(construction: Construction) {
    this.adresse = `${this.base}${PREFIXE[construction]}`;
    this.regie = await this.nav.ouvrir(`${this.adresse}/index.html?projet=${PROJET}`);
    await this.regie.attendre(EXPR_PRET, 60_000, 'Conducteur chargé avec Écho');
    await this.regie.attendre(`!!window.__fl && !!document.querySelector('.planche')`, 20_000, 'sonde et planche');
    await this.ev(this.regie, EXPR_SPECTACLE);
    await pause(1500);
  }

  async ouvrirSortie() {
    this.sortie = await this.nav.fenetreOuverteePar(this.regie, EXPR_OUVRIR_SORTIE);
    await this.sortie.attendre(`!!window.__fl && !!document.querySelector('.so-1080, #racine > *')`, 30_000, 'sortie dessinée');
    await this.regie.attendre(EXPR_SORTIE_RELIEE, 20_000, 'sortie reliée à la régie');
    this.sortieReduite = false;
    await pause(1500);
  }
  private async fenetre(o: Onglet) { return (await this.cdp.envoyer('Browser.getWindowForTarget', { targetId: o.targetId })).windowId as number; }
  async reduireSortie() {
    if (!this.sortie || this.sortieReduite) return;
    await this.cdp.envoyer('Browser.setWindowBounds', { windowId: await this.fenetre(this.sortie), bounds: { windowState: 'minimized' } });
    await pause(600);
    if ((await this.ev<string>(this.sortie, 'document.visibilityState')) !== 'hidden') throw new Error('la fenêtre de sortie réduite reste « visible » pour le navigateur : mesure impossible');
    this.sortieReduite = true;
  }
  async restaurerSortie() {
    if (!this.sortie || !this.sortieReduite) return;
    await this.cdp.envoyer('Browser.setWindowBounds', { windowId: await this.fenetre(this.sortie), bounds: { windowState: 'normal' } });
    await pause(600);
    this.sortieReduite = false;
  }
  async fermerSortie() {
    if (!this.sortie) return;
    await this.cdp.envoyer('Target.closeTarget', { targetId: this.sortie.targetId }).catch(() => undefined);
    this.sortie = null; this.sortieReduite = false;
    await pause(800);
  }
  async cacherOnglet() {
    if (this.onglet === 'cache') return;
    this.vide = await this.nav.ouvrir('about:blank');
    await this.vide.devant();
    await pause(700);
    if ((await this.ev<string>(this.regie, 'document.visibilityState')) !== 'hidden') throw new Error('l\'onglet de la régie reste « visible » pour le navigateur : mesure impossible');
    this.onglet = 'cache';
  }
  async montrerOnglet() {
    if (this.onglet === 'visible') return;
    await this.regie.devant();
    if (this.vide) { await this.vide.fermer().catch(() => undefined); this.vide = null; }
    await pause(700);
    this.onglet = 'visible';
  }

  async mettreEnPlace(def: PhaseDef) {
    const avait = !!this.sortie;
    if (def.sortie === 'fermee') await this.fermerSortie();
    else {
      if (!this.sortie) await this.ouvrirSortie();
      if (def.sortie === 'cachee') await this.reduireSortie(); else await this.restaurerSortie();
    }
    if (def.onglet === 'cache') await this.cacherOnglet(); else await this.montrerOnglet();
    const etat = await this.ev<{ enLecture: boolean }>(this.regie, EXPR_ETAT);
    if (def.lecture === 'en-cours' && !etat.enLecture) await this.ev(this.regie, EXPR_LANCER);
    if (def.lecture === 'pause' && etat.enLecture) await this.ev(this.regie, EXPR_PAUSE);
    const change = !avait && !!this.sortie || def.onglet !== this.derniere?.onglet || def.sortie !== this.derniere?.sortie;
    this.derniere = { onglet: def.onglet, sortie: def.sortie };
    await pause(change ? 3000 : 1500);   // stabilisation (chargement des polices, du calque, des premiers rendus)
  }

  /** Clique le gros bouton GO avec une vraie souris (entrée de confiance) ; à défaut, appelle l'action GO du magasin. */
  async cliquerGo(): Promise<string> {
    const p = await this.ev<{ x: number; y: number } | null>(this.regie, EXPR_BOUTON_GO);
    if (!p) { await this.ev(this.regie, EXPR_GO); return 'action'; }
    const s = this.regie.sessionId;
    await this.cdp.envoyer('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }, s);
    await this.cdp.envoyer('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 }, s);
    await this.cdp.envoyer('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 }, s);
    return 'souris';
  }

  async marqueur(o: Onglet, nom: string): Promise<number> { return this.ev<number>(o, `(() => { const t = performance.now(); console.timeStamp(${JSON.stringify(nom)}); return t })()`); }

  async mesurerPhase(def: PhaseDef): Promise<Record<string, any>> {
    const { nav, regie } = this;
    const dureeS = def.dureeS * this.o.facteur;
    await this.mettreEnPlace(def);
    const sortie = this.sortie;
    const pages: Onglet[] = [regie, ...(sortie ? [sortie] : [])];
    const avecTrace = !def.sansTrace && !this.o.sansTrace;
    if (def.css) { await this.ev(regie, `(() => { const s = document.createElement('style'); s.id = 'fl-hyp'; s.textContent = ${JSON.stringify(def.css)}; document.head.appendChild(s); return true })()`); await pause(800); }
    if (def.ralentissement) await this.cdp.envoyer('Emulation.setCPUThrottlingRate', { rate: def.ralentissement }, regie.sessionId);
    for (const p of pages) await this.ev(p, `__fl.react.compter = ${p === regie && !!def.comptage}`);

    await nav.gc(regie);
    const cpu0 = tempsCoeurs();
    const courant = alimentation();
    const etat0 = await this.ev<any>(regie, EXPR_ETAT);
    const m0 = await nav.metriques(regie), ms0 = sortie ? await nav.metriques(sortie) : null;
    const ph0 = await this.ev<Photo>(regie, '__fl.photo()'), ps0 = sortie ? await this.ev<Photo>(sortie, '__fl.photo()') : null;
    for (const p of pages) { await this.ev(p, '__fl.prendreImages()'); await this.ev(p, '__fl.demarrer()'); }
    if (avecTrace) await nav.traceDemarrer();
    if (def.profil) {
      await this.cdp.envoyer('Profiler.enable', {}, regie.sessionId);
      await this.cdp.envoyer('Profiler.setSamplingInterval', { interval: 500 }, regie.sessionId);
      await this.cdp.envoyer('Profiler.start', {}, regie.sessionId);
    }
    const tDebut = avecTrace ? await this.marqueur(regie, 'fl-debut') : 0;

    // déroulé : attente simple, ou GO aux instants prévus
    const gos: Array<{ tPage: number; moyen: string; avant: Photo | null; apres: Photo | null }> = [];
    const debut = Date.now();
    const attendreJusqua = async (s: number) => { const d = debut + s * 1000 - Date.now(); if (d > 0) await pause(d); };
    if (def.go) {
      for (let i = 0; i < def.go.n; i++) {
        await attendreJusqua((def.go.premierS + i * def.go.espaceS) * Math.max(this.o.facteur, 0.4));
        const avant = def.comptage ? await this.ev<Photo>(regie, '__fl.photo()') : null;
        const tPage = await this.ev<number>(regie, 'performance.now()');
        const moyen = await this.cliquerGo();
        await pause(1500);
        gos.push({ tPage, moyen, avant, apres: def.comptage ? await this.ev<Photo>(regie, '__fl.photo()') : null });
      }
    }
    if (def.edition) {
      await this.ev(regie, EXPR_REPETITION);
      for (let i = 0; i < def.edition; i++) { await this.ev(regie, EXPR_MODIFIER(i)); await pause(Math.max(150, (dureeS * 1000 - 600) / def.edition)); }
    }
    await attendreJusqua(dureeS);
    if (def.edition) await this.ev(regie, EXPR_SPECTACLE);

    if (avecTrace) await this.marqueur(regie, 'fl-fin');
    const ph1 = await this.ev<Photo>(regie, '__fl.photo()'), ps1 = sortie ? await this.ev<Photo>(sortie, '__fl.photo()') : null;
    const m1 = await nav.metriques(regie), ms1 = sortie ? await nav.metriques(sortie) : null;
    for (const p of pages) await this.ev(p, '__fl.enregistrer = false');
    const imR = await this.ev<{ images: number[]; longues: any[]; tachesLongues: any[]; evenements: any[] }>(regie, '__fl.prendreImages()');
    const imS = sortie ? await this.ev<{ images: number[]; longues: any[]; tachesLongues: any[]; evenements: any[] }>(sortie, '__fl.prendreImages()') : null;
    const tArret = Date.now();
    const brut = avecTrace ? await nav.traceArreter() : [];
    if (process.env.FL_DEBUG) for (const nom of ['Paint', 'PrePaint', 'Layerize', 'UpdateLayoutTree']) console.log(nom, JSON.stringify(brut.filter((e) => e.name === nom).slice(100, 103)).slice(0, 900));
    if (process.env.FL_DEBUG) { const h: Record<string, number> = {}; for (const e of brut) { const k = (e.cat ?? '') + ' | ' + e.name; h[k] = (h[k] ?? 0) + 1; } console.log(Object.entries(h).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => v + ' ' + k).join(String.fromCharCode(10))); }
    if (process.env.FL_DEBUG) console.log(`           [debug] arrêt de la trace : ${((Date.now() - tArret) / 1000).toFixed(1)} s, ${brut.length} événements`);
    let profilBrut: any = null;
    if (def.profil) profilBrut = (await this.cdp.envoyer('Profiler.stop', {}, regie.sessionId)).profile;
    const etat1 = await this.ev<any>(regie, EXPR_ETAT);
    const noeudsR = await this.ev<any>(regie, '__fl.noeuds()');
    const noeudsS = sortie ? await this.ev<any>(sortie, '__fl.noeuds()') : null;
    await nav.gc(regie);
    const m2 = await nav.metriques(regie);

    const tAnalyse = Date.now();
    if (def.ralentissement) await this.cdp.envoyer('Emulation.setCPUThrottlingRate', { rate: 1 }, regie.sessionId);
    if (def.css) await this.ev(regie, `document.getElementById('fl-hyp')?.remove()`);
    const cpu1 = tempsCoeurs();
    const chargeMachinePct = arrondi(((cpu1.occupe - cpu0.occupe) / Math.max(1, cpu1.total - cpu0.total)) * 100, 0);
    const dR = (ph1.t - ph0.t) / 1000;
    const metR = diffMetriques(m0, m1, dR);
    const sondeR = diffSonde(ph0, ph1, dR);

    // trace : décalage entre l'horloge de la page et celle de la trace, puis analyse
    let trace: any = null, apresGo: any[] = [];
    if (avecTrace && brut.length) {
      const marque = (nom: string) => brut.find((e) => e.name === 'TimeStamp' && e.args?.data?.message === nom);
      const a = marque('fl-debut'), b = marque('fl-fin');
      if (a?.ts !== undefined && b?.ts !== undefined) {
        const decalage = a.ts - tDebut * 1000;
        const imagesUs = imR.images.map((t) => t * 1000 + decalage);
        const prep = preparerTrace(brut);
        trace = analyserTrace(prep, a.ts, b.ts, imagesUs);
        for (const g of gos) {
          const d0 = g.tPage * 1000 + decalage, t = analyserTrace(prep, d0, d0 + 1_500_000, imagesUs);
          const ecartsApres = imR.images.filter((x) => x >= g.tPage && x <= g.tPage + 1500);
          let pireEcart = 0;
          for (let i = 1; i < ecartsApres.length; i++) pireEcart = Math.max(pireEcart, ecartsApres[i]! - ecartsApres[i - 1]!);
          const clic = imR.evenements.filter((e) => e.t >= g.tPage - 20 && e.t <= g.tPage + 400 && (e.type === 'click' || e.type === 'pointerup' || e.type === 'pointerdown'));
          const sonde = g.avant && g.apres ? diffSonde(g.avant, g.apres, 1.5) : null;
          apresGo.push({
            moyen: g.moyen, tacheMaxMs: t?.taches.max ?? null, occupationMsParS: t?.occupationMsParS ?? null, travailParImageMaxMs: t?.parImage.occupation.max ?? null,
            ecartImageMaxMs: arrondi(pireEcart), delaiClicMs: clic.length ? Math.max(...clic.map((e) => e.d)) : null,
            commits: sonde ? Math.round(sonde.react.commitsParS * 1.5) : null,
            rendus: sonde ? limiter(sonde.react.rendus.map((x) => ({ composant: x.composant, rendus: arrondi(x.rendusParS * 1.5, 0) })), 12) : null,
          });
        }
      }
    } else if (gos.length) {
      apresGo = gos.map((g) => {
        const sonde = g.avant && g.apres ? diffSonde(g.avant, g.apres, 1.5) : null;
        return { moyen: g.moyen, commits: sonde ? Math.round(sonde.react.commitsParS * 1.5) : null, rendus: sonde ? limiter(sonde.react.rendus.map((x) => ({ composant: x.composant, rendus: arrondi(x.rendusParS * 1.5, 0) })), 12) : null };
      });
    }

    const memeProcessus = ms0 && ms1 ? (() => {
      const a = m1.TaskDuration! - m0.TaskDuration!, b = ms1.TaskDuration! - ms0.TaskDuration!;
      return a > 0 && Math.abs(a - b) / a < 0.02;
    })() : null;

    const regieRes = {
      images: analyserImages(imR.images, dR), metriques: metR, trace, sonde: {
        ...sondeR, raf: limiter(sondeR.raf, 12), timeouts: limiter(sondeR.timeouts, 12), intervalles: limiter(sondeR.intervalles, 12),
        react: { ...sondeR.react, rendus: limiter(sondeR.react.rendus, 30), petitsCommits: limiter(sondeR.react.petitsCommits, 6) },
      },
      noeuds: noeudsR,
      memoire: { debutMo: mo(m0.JSHeapUsedSize), finMo: mo(m1.JSHeapUsedSize), apresGcMo: mo(m2.JSHeapUsedSize), croissanceMo: arrondi(((m2.JSHeapUsedSize ?? 0) - (m0.JSHeapUsedSize ?? 0)) / 1048576, 2), documents: m2.Documents, ecouteurs: m2.JSEventListeners },
      longues: { imagesLongues: limiter(imR.longues.sort((a, b) => b.d - a.d), 8), nbImagesLongues: imR.longues.length, tachesLongues: imR.tachesLongues.length, pireTacheLongueMs: Math.max(0, ...imR.tachesLongues.map((t) => t.d)) },
      clics: limiter(imR.evenements.filter((e) => e.type === 'click' || e.type === 'pointerdown' || e.type === 'pointerup'), 10),
    };
    const dS = ps0 && ps1 ? (ps1.t - ps0.t) / 1000 : 0;
    const sondeS = ps0 && ps1 ? diffSonde(ps0, ps1, dS) : null;
    const tickers = sondeS ? sondeS.raf.filter((l) => /tick/i.test(l.nom) && l.execsParS > 0) : [];
    const sortieRes = sortie && imS && ms0 && ms1 && sondeS ? {
      etat: this.sortieReduite ? 'réduite (cachée)' : 'visible', images: analyserImages(imS.images, dS), metriques: diffMetriques(ms0, ms1, dS),
      sonde: { ...sondeS, raf: limiter(sondeS.raf, 10), timeouts: limiter(sondeS.timeouts, 8), intervalles: limiter(sondeS.intervalles, 8), react: { ...sondeS.react, rendus: [] } },
      tickerPixi: { actif: tickers.length > 0, execsParS: arrondi(tickers.reduce((s, l) => s + l.execsParS, 0)), rappels: tickers.map((t) => t.nom) },
      noeuds: noeudsS, longues: { nbImagesLongues: imS.longues.length, pireTacheLongueMs: Math.max(0, ...imS.tachesLongues.map((t) => t.d)) },
    } : null;

    if (process.env.FL_DEBUG) console.log(`           [debug] analyse : ${((Date.now() - tAnalyse) / 1000).toFixed(1)} s`);
    return {
      nom: def.nom, titre: def.titre, dureeS: arrondi(dR, 1), chargeMachinePct, alimentation: courant,
      conditions: { construction: def.construction, ralentissementCpu: def.ralentissement ?? 1, sortie: def.sortie, onglet: def.onglet, lecture: def.lecture, go: def.go ? `${def.go.n} GO` : 'aucun', comptageRendus: !!def.comptage, profil: !!def.profil, trace: avecTrace },
      etat: { debut: etat0, fin: etat1 },
      regie: regieRes, sortie: sortieRes, memeProcessus, apresGo: apresGo.length ? apresGo : undefined,
      profil: profilBrut ? analyserProfil(profilBrut) : undefined,
    };
  }

  /** Bruit du banc : une page vide, 3 s. Sert à savoir ce qu'est une image « normale » sur cette machine, avec ces options. */
  async calibrer(): Promise<Record<string, any>> {
    const p = await this.nav.ouvrir(`${this.base}/__vide`);
    await p.attendre('!!window.__fl', 10_000, 'sonde sur la page vide');
    await pause(500);
    await this.ev(p, '__fl.prendreImages(); __fl.demarrer()');
    const t0 = await this.ev<number>(p, 'performance.now()');
    await pause(4000);
    const t1 = await this.ev<number>(p, 'performance.now()');
    await this.ev(p, '__fl.enregistrer = false');
    const im = await this.ev<{ images: number[] }>(p, '__fl.prendreImages()');
    const r = analyserImages(im.images, (t1 - t0) / 1000);
    await p.fermer().catch(() => undefined);
    return r as unknown as Record<string, any>;
  }
}

// ── affichage ──────────────────────────────────────────────────────────────────────────────────────────────────────
function tableau(res: Resultat): string {
  const cols: Array<[string, (p: any) => string | number]> = [
    ['phase', (p) => p.nom], ['constr.', (p) => (p.conditions.construction === 'production' ? 'prod' : 'dev') + (p.conditions.ralentissementCpu > 1 ? ' x' + p.conditions.ralentissementCpu : '')], ['durée s', (p) => p.dureeS],
    ['i/s', (p) => p.regie.images.fps], ['>20ms', (p) => p.regie.images.sup20], ['>50ms', (p) => p.regie.images.sup50], ['écart p95', (p) => p.regie.images.ecart.p95],
    ['fil ms/s', (p) => p.regie.metriques.tacheMsParS], ['machine %', (p) => p.chargeMachinePct + (p.alimentation === 'batterie' ? ' BAT' : '')], ['script ms/s', (p) => p.regie.metriques.scriptMsParS],
    ['commits/s', (p) => p.regie.sonde.react.commitsParS], ['React ms/s', (p) => p.regie.sonde.react.renderMsParS],
    ['rAF/s', (p) => p.regie.sonde.rafAppelsParS], ['minut./s', (p) => arrondi(p.regie.sonde.timeoutsParS + p.regie.sonde.intervallesParS, 1)],
    ['nœuds', (p) => p.regie.noeuds.total], ['tas Mo', (p) => p.regie.memoire.apresGcMo],
    ['sortie i/s', (p) => p.sortie?.images.fps ?? '-'], ['sortie ms/s', (p) => p.sortie?.metriques.scriptMsParS ?? '-'],
  ];
  const lignes = [cols.map((c) => c[0]), ...res.phases.map((p) => cols.map(([, f]) => String(f(p))))];
  const larg = cols.map((_, i) => Math.max(...lignes.map((l) => l[i]!.length)));
  return lignes.map((l, k) => l.map((c, i) => (i === 0 ? c.padEnd(larg[i]!) : c.padStart(larg[i]!))).join('  ') + (k === 0 ? '\n' + larg.map((n) => '-'.repeat(n)).join('  ') : '')).join('\n');
}

// ── programme principal ─────────────────────────────────────────────────────────────────────────────────────────────
async function principal(): Promise<number> {
  const o = lireOptions(process.argv.slice(2));
  if (o.aide) { console.log(AIDE); return 0; }
  if (o.lister) {
    for (const p of PHASES) console.log(`${p.nom.padEnd(14)} ${String(arrondi(p.dureeS * o.facteur, 1)).padStart(5)} s  ${(o.construction ?? p.construction).padEnd(13)} ${p.titre}${p.defaut === false ? '  [à la demande]' : ''}`);
    return 0;
  }
  if (o.comparer) {
    const [a, b] = o.comparer.map((f) => JSON.parse(readFileSync(f, 'utf8')) as Resultat);
    console.log(comparer(a!, b!));
    return 0;
  }
  if (process.env.SR_SANS_NAVIGATEUR === '1' || process.env.SR_SANS_SERVEUR === '1') { console.log('[SAUTÉ : SR_SANS_NAVIGATEUR=1 ou SR_SANS_SERVEUR=1] mesure de fluidité : aucun navigateur lancé'); return 0; }
  if (!existsSync(EDGE)) { console.log(`[SAUTÉ : Edge introuvable : ${EDGE}] indiquer SR_EDGE=<chemin de msedge.exe>`); return 0; }

  const choisies = PHASES.filter((p) => (o.hypotheses ? p.nom.startsWith('hyp-') : o.phases ? o.phases.includes(p.nom) : p.defaut !== false)).map((p) => (o.construction ? { ...p, construction: o.construction } : p));
  // --sans-sortie : toutes les phases se jouent sans fenêtre de sortie ; celles qui n'ont de sens qu'avec elle sont sautées
  const phases: PhaseDef[] = o.sansSortie ? choisies.filter((p) => p.nom !== 'sortie-cachee' && p.nom !== 'sans-sortie').map((p) => ({ ...p, sortie: 'fermee' as const })) : choisies;
  const sautees = choisies.filter((p) => !phases.some((x) => x.nom === p.nom));
  const orphelins = nettoyerOrphelins();
  if (orphelins) console.log(`[fluidite] ${orphelins} processus Edge orphelin(s) d'un lancement précédent arrêté(s)`);
  const t0 = Date.now();
  const constructions = (['production', 'developpement'] as Construction[]).filter((c) => phases.some((p) => p.construction === c));
  const dists: Partial<Record<Construction, string>> = {};
  for (const c of constructions) {
    console.log(`[fluidite] Conducteur en construction de ${c}…`);
    const r = construire(c, o.reconstruire);
    dists[c] = r.dist;
    console.log(`[fluidite] ${r.reconstruit ? 'construit' : 'réutilisé'} (${((Date.now() - t0) / 1000).toFixed(0)} s) : ${r.dist}`);
  }
  const { base, serveur } = await servir(dists);
  const nav = new Navigateur();
  try {
    await nav.lancer(o.headlessNew);
    const version = await nav.cdp.envoyer('Browser.getVersion');
    let gpu = 'inconnu';
    try { const g = (await nav.cdp.envoyer('SystemInfo.getInfo')).gpu; gpu = `${g.devices?.[0]?.deviceString ?? '?'} (${g.auxAttributes?.glRenderer ?? g.devices?.[0]?.driverVersion ?? ''})`; } catch { /* non fourni */ }
    const banc = new Banc(nav, base, o);
    console.log('[fluidite] calibrage (page vide, 4 s)…');
    const bruit = await banc.calibrer();
    const resultats: Array<Record<string, any>> = [];
    for (const c of constructions) {
      console.log(`[fluidite] chargement du Conducteur (Écho, SPECTACLE, ${c})…`);
      await banc.demarrerRegie(c);
      for (const def of phases.filter((p) => p.construction === c)) {
        const d = Date.now();
        console.log(`[fluidite] phase « ${def.nom} » (${arrondi(def.dureeS * o.facteur, 1)} s) : ${def.titre}`);
        resultats.push(await banc.mesurerPhase(def));
        console.log(`           fait en ${((Date.now() - d) / 1000).toFixed(0)} s`);
      }
      await banc.terminerSession();
    }
    let commit = '';
    try { commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: RACINE, encoding: 'utf8' }).stdout.trim(); } catch { /* pas de git */ }
    const resultat: Resultat = {
      meta: {
        date: new Date().toISOString(), commit, outil: 'outils/fluidite/mesurer.ts', projet: PROJET, mode: 'SPECTACLE', construction: constructions.join(' + ') + ' (production : code réduit comme au spectacle ; developpement : React non réduit)',
        machine: { processeur: cpus()[0]?.model.trim(), coeurs: cpus().length, memoireGo: arrondi(totalmem() / 1073741824, 0), carteGraphique: gpu, node: process.version, navigateur: version.product },
        fenetres: { regie: `${FENETRE_REGIE.l}x${FENETRE_REGIE.h}`, sortie: `${FENETRE_SORTIE.l}x${FENETRE_SORTIE.h}` },
        options: { facteurDuree: o.facteur, sansTrace: o.sansTrace, sansSortie: o.sansSortie, phases: phases.map((p) => p.nom), sautees: sautees.map((p) => p.nom) },
        bruitPageVide: { fps: (bruit as any).fps, sup16: (bruit as any).sup16, sup20: (bruit as any).sup20, sup33: (bruit as any).sup33, sup50: (bruit as any).sup50, ecartP95: (bruit as any).ecart.p95 },
        alimentation: alimentation(),
        erreursPage: nav.erreurs,
        dureeTotaleS: arrondi((Date.now() - t0) / 1000, 0),
      },
      phases: resultats as Resultat['phases'],
    };
    const etiquette = o.etiquette ?? (o.hypotheses ? 'hypotheses' : o.phases ? o.phases.join('+') : 'complet');
    const sortieJson = o.json ?? join(RESULTATS, `${new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}-${etiquette}.json`);
    mkdirSync(dirname(sortieJson), { recursive: true });
    writeFileSync(sortieJson, JSON.stringify(resultat));
    console.log('\n' + tableau(resultat));
    console.log(`\nbruit de la page vide : ${(bruit as any).fps} i/s, ${(bruit as any).sup16} écarts > 16,7 ms et ${(bruit as any).sup20} > 20 ms sur ${(bruit as any).n} images`);
    if (resultats.some((p) => p.alimentation === 'batterie')) console.log('ATTENTION : poste sur BATTERIE pendant la mesure (BAT) : processeur plus lent, chiffres ≈ deux fois plus élevés. Brancher le secteur et relancer pour comparer.');
    if (nav.erreurs.length) console.log(`erreurs de page (${nav.erreurs.length}) : ${nav.erreurs[0]}`);
    console.log(`résultat : ${sortieJson} (${(statSync(sortieJson).size / 1024).toFixed(0)} Ko) · ${resultat.meta.dureeTotaleS} s`);
    if (statSync(sortieJson).size > 100 * 1024) console.log('attention : fichier de plus de 100 Ko');
    return 0;
  } finally {
    await nav.fermer();
    serveur.close();
  }
}

principal().then((c) => process.exit(c), (e) => { console.error('[fluidite] ÉCHEC :', e instanceof Error ? e.stack ?? e.message : e); process.exit(1); });
