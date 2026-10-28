// Outils communs aux tests d'intégration qui pilotent un VRAI navigateur (Edge sans tête) par le protocole DevTools
// (CDP) : lancement d'Edge, connexion, envoi de commandes, onglets, attente d'une condition, arrêt des processus.
// Extrait tel quel de integration.edge.test.ts (flux) et bascule.edge.test.ts (sortie) : ne pas y mettre de logique
// propre à un test. Ce fichier n'est importé que par des tests lents (*.edge.test.ts).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

/** Navigateur : SR_EDGE=<chemin> ; sinon Edge x86 de Windows (emplacement historique), puis Edge 64 bits. */
const CANDIDATS_EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
export const EDGE = process.env.SR_EDGE ?? CANDIDATS_EDGE.find((c) => existsSync(c)) ?? CANDIDATS_EDGE[0]!;

/**
 * Raison pour laquelle un test qui a besoin d'Edge doit se sauter, ou `null` s'il peut tourner.
 * Désactivation volontaire : SR_SANS_NAVIGATEUR=1 (ou SR_SANS_SERVEUR=1, qui coupe aussi wrangler).
 */
export function raisonSautNavigateur(): string | null {
  if (process.env.SR_SANS_NAVIGATEUR === '1') return 'SR_SANS_NAVIGATEUR=1';
  if (process.env.SR_SANS_SERVEUR === '1') return 'SR_SANS_SERVEUR=1';
  if (!existsSync(EDGE)) return `Edge introuvable : ${EDGE}`;
  return null;
}

/**
 * Nom de describe qui annonce le saut dans la sortie de vitest : « [SAUTÉ : raison] nom » quand `raison` est posée,
 * `nom` seul sinon. À utiliser avec `describe.skipIf(raison !== null)`.
 */
export const nomAvecSaut = (raison: string | null, nom: string) => (raison === null ? nom : `[SAUTÉ : ${raison}] ${nom}`);

export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const portLibre = () => new Promise<number>((ok, ko) => {
  const s = createServer();
  s.once('error', ko);
  s.listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => ok(typeof a === 'object' && a ? a.port : 0)); });
});

/** Arrête un processus lancé par le test, avec ses enfants sous Windows. */
export const tuer = (p: ChildProcess | null) => {
  if (!p?.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  else p.kill('SIGTERM');
};

/** Client minimal du protocole DevTools (WebSocket natif de Node 24). */
export class Cdp {
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
  /** Ouvre un onglet (dans un contexte de navigation isolé si `browserContextId` est donné : autre « profil »). */
  async onglet(url: string, browserContextId?: string): Promise<Onglet> {
    const { targetId } = await this.envoyer('Target.createTarget', { url, ...(browserContextId ? { browserContextId } : {}) });
    const { sessionId } = await this.envoyer('Target.attachToTarget', { targetId, flatten: true });
    return new Onglet(this, targetId, sessionId);
  }
  fermer() { try { this.ws.close(); } catch { /* fermé */ } }
}

export class Onglet {
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
  /** Met l'onglet au premier plan (la sortie est une fenêtre VISIBLE sur le projecteur ; un onglet caché retarde
   *  la lecture des vidéos). */
  devant() { return this.cdp.envoyer('Target.activateTarget', { targetId: this.targetId }); }
}

/**
 * Lance Edge sans tête (fausse caméra et faux micro, permissions accordées, lecture automatique permise), attend son
 * port DevTools et s'y connecte. `profil` : dossier de profil jetable. Arrêt : `cdp.fermer()` puis `tuer(edge)`.
 */
export async function lancerEdge(profil: string): Promise<{ edge: ChildProcess; cdp: Cdp }> {
  const portCdp = await portLibre();
  const edge = spawn(EDGE, [
    '--headless=new', `--remote-debugging-port=${portCdp}`, `--user-data-dir=${join(profil, 'profil')}`, '--no-first-run', '--no-default-browser-check',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank',
  ], { stdio: 'ignore' });
  try {
    let url = '';
    for (const limite = Date.now() + 30_000; !url;) {
      try { url = (await (await fetch(`http://127.0.0.1:${portCdp}/json/version`)).json()).webSocketDebuggerUrl; } catch { /* pas prêt */ }
      if (!url) { if (Date.now() > limite) throw new Error('Edge ne répond pas'); await pause(250); }
    }
    const cdp = new Cdp(url);
    await cdp.ouvert;
    return { edge, cdp };
  } catch (e) {
    tuer(edge); // pas d'Edge orphelin si la connexion échoue
    throw e;
  }
}
