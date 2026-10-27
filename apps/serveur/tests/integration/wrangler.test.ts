// Test d'intégration : lance `wrangler dev --local` (D1, R2 et Durable Object simulés sur la machine, aucun accès
// au compte Cloudflare) sur un port libre, avec un dossier d'état temporaire, puis exerce l'API REST et la salle
// WebSocket comme le ferait l'interface. Arrête wrangler à la fin.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exempleDemo } from '@studio-real/modele';

const ICI = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const WRANGLER = join(dirname(createRequire(import.meta.url).resolve('wrangler/package.json')), 'bin', 'wrangler.js');
const ADMIN = 'jeton-admin-de-test-0123456789';
const ENV = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1', NO_COLOR: '1' };

let base = '';
let wrangler: ChildProcess | null = null;
let journal = '';
const etat = mkdtempSync(join(tmpdir(), 'serveur-conducteur-'));

const portLibre = () => new Promise<number>((ok, ko) => {
  const s = createServer();
  s.once('error', ko);
  s.listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => ok(typeof a === 'object' && a ? a.port : 0)); });
});

beforeAll(async () => {
  const mig = spawnSync(process.execPath, [WRANGLER, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', etat], { cwd: ICI, env: ENV, encoding: 'utf8' });
  if (mig.status !== 0) throw new Error('migrations : ' + mig.stdout + mig.stderr);
  const port = await portLibre();
  base = `http://127.0.0.1:${port}`;
  wrangler = spawn(process.execPath, [
    WRANGLER, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(await portLibre()),
    '--persist-to', etat, '--assets', './attente', '--show-interactive-dev-session=false',
    '--var', `JETON_ADMIN:${ADMIN}`, '--var', 'TAILLE_MAX_MEDIA:2048',
  ], { cwd: ICI, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  wrangler.stdout!.on('data', (d) => { journal += d; });
  wrangler.stderr!.on('data', (d) => { journal += d; });
  const limite = Date.now() + 120_000;
  for (;;) {
    try { if ((await fetch(`${base}/api/sante`)).ok) break; } catch { /* pas encore prêt */ }
    if (Date.now() > limite || wrangler.exitCode !== null) throw new Error('wrangler dev ne démarre pas :\n' + journal);
    await new Promise((r) => setTimeout(r, 300));
  }
});

afterAll(() => {
  if (wrangler?.pid) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(wrangler.pid), '/T', '/F']);
    else wrangler.kill('SIGTERM');
  }
  try { rmSync(etat, { recursive: true, force: true }); } catch { /* fichiers encore verrouillés sous Windows */ }
});

// ───────── outils ─────────

type Rep = { statut: number; corps: any; entetes: Headers };
async function api(chemin: string, o: { methode?: string; jeton?: string; corps?: unknown; entetes?: Record<string, string> } = {}): Promise<Rep> {
  const h: Record<string, string> = { ...o.entetes };
  if (o.jeton) h.authorization = `Bearer ${o.jeton}`;
  if (o.corps !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + chemin, { method: o.methode ?? 'GET', headers: h, ...(o.corps !== undefined ? { body: JSON.stringify(o.corps) } : {}) });
  const texte = await r.text();
  let corps: unknown = texte;
  try { corps = JSON.parse(texte); } catch { /* texte brut */ }
  return { statut: r.status, corps, entetes: r.headers };
}

class Client {
  messages: any[] = [];
  private attentes: { pred: (m: any) => boolean; ok: (m: any) => void }[] = [];
  ws: WebSocket;
  ouvert: Promise<void>;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ouvert = new Promise((ok, ko) => { this.ws.onopen = () => ok(); this.ws.onerror = () => ko(new Error('websocket : ouverture impossible')); });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      this.messages.push(m);
      this.attentes = this.attentes.filter((a) => (a.pred(m) ? (a.ok(m), false) : true));
    };
  }
  envoyer(m: unknown) { this.ws.send(JSON.stringify(m)); }
  /** Attend un message (déjà reçu ou à venir) qui satisfait le prédicat. */
  attendre(pred: (m: any) => boolean, ms = 5000): Promise<any> {
    const deja = this.messages.find(pred);
    if (deja) return Promise.resolve(deja);
    return new Promise((ok, ko) => {
      const t = setTimeout(() => ko(new Error('délai dépassé ; reçus : ' + JSON.stringify(this.messages.map((x) => x.t)))), ms);
      this.attentes.push({ pred, ok: (m) => { clearTimeout(t); ok(m); } });
    });
  }
  vider() { this.messages = []; }
  fermer() { this.ws.close(); }
}

// ───────── scénario ─────────

describe('serveur local (wrangler dev)', () => {
  let id = '';
  let jeton = '';

  it('sert la page statique et répond sur /api/sante', async () => {
    const r = await fetch(base + '/');
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('Conducteur');
    expect((await api('/api/sante')).corps.ok).toBe(true);
  });

  it('crée un projet (jeton admin requis) et protège son accès', async () => {
    expect((await api('/api/projets', { methode: 'POST', corps: {} })).statut).toBe(401);
    const r = await api('/api/projets', { methode: 'POST', jeton: ADMIN, corps: { titre: 'Spectacle test', project: exempleDemo() } });
    expect(r.statut).toBe(201);
    ({ id, jeton } = r.corps);
    expect(id).toMatch(/^p_/);
    expect(jeton).toMatch(/^sr_/);
    expect((await api(`/api/projets/${id}`)).statut).toBe(401);
    expect((await api(`/api/projets/${id}`, { jeton: 'sr_faux' })).statut).toBe(404);
    const l = await api(`/api/projets/${id}`, { jeton });
    expect(l.statut).toBe(200);
    expect(l.corps.version).toBe(1);
    expect(l.corps.project.titre).toBe('Spectacle test');
    expect((await api('/api/projets', { jeton: ADMIN })).corps.projets.some((p: any) => p.id === id)).toBe(true);
  });

  it('enregistre avec numéro de version et détecte le conflit', async () => {
    const lu = (await api(`/api/projets/${id}`, { jeton })).corps;
    const p1 = { ...lu.project, titre: 'Version A' };
    const a = await api(`/api/projets/${id}`, { methode: 'PUT', jeton, corps: { version_base: 1, project: p1, message: 'A' } });
    expect(a.statut).toBe(200);
    expect(a.corps.version).toBe(2);
    // Deuxième enregistrement sur la même base : conflit.
    const b = await api(`/api/projets/${id}`, { methode: 'PUT', jeton, corps: { version_base: 1, project: { ...lu.project, titre: 'Version B' } } });
    expect(b.statut).toBe(409);
    expect(b.corps.erreur).toBe('conflit');
    expect(b.corps.version_actuelle).toBe(2);
    expect((await api(`/api/projets/${id}`, { methode: 'PUT', jeton, corps: { project: p1 } })).statut).toBe(428);
    const v = await api(`/api/projets/${id}/versions`, { jeton });
    expect(v.corps.versions.map((x: any) => x.version)).toEqual([2, 1]);
    expect((await api(`/api/projets/${id}/versions/1`, { jeton })).corps.project.titre).toBe('Spectacle test');
  });

  it('salle : présence, diffusion des deltas, idempotence, chat, commentaires, verrous, lecture, reconnexion', async () => {
    const url = `${base.replace('http', 'ws')}/api/projets/${id}/salle?jeton=${jeton}`;
    const A = new Client(url);
    const B = new Client(url);
    await Promise.all([A.ouvert, B.ouvert]);

    A.envoyer({ t: 'hello', v: 1, personne: 'pers_alice', session: 'sess_alice1', nom: 'Alice', role: 'regie' });
    const bA = await A.attendre((m) => m.t === 'bienvenue');
    expect(bA.projet.titre).toBe('Version A');
    expect(bA.version).toBe(2);
    expect(bA.presents.map((p: any) => p.personne)).toEqual(['pers_alice']);

    B.envoyer({ t: 'hello', v: 1, personne: 'pers_bruno', session: 'sess_bruno1', nom: 'Bruno' });
    const bB = await B.attendre((m) => m.t === 'bienvenue');
    expect(bB.presents.map((p: any) => p.personne).sort()).toEqual(['pers_alice', 'pers_bruno']);
    const arrivee = await A.attendre((m) => m.t === 'arrivee');
    expect(arrivee.personne).toMatchObject({ personne: 'pers_bruno', nom: 'Bruno' });
    expect(arrivee.personne.couleur).toMatch(/^#[0-9a-f]{6}$/i);

    // Curseur.
    A.envoyer({ t: 'curseur', curseur: { zone: 'planche', x: 120, y: 40, etape: 'voix' } });
    expect((await B.attendre((m) => m.t === 'curseur')).curseur).toMatchObject({ zone: 'planche', x: 120 });

    // Delta numéroté diffusé à tous, puis renvoi du même cseq : « doublon », pas de seconde diffusion.
    const seq0 = bA.seq;
    const modif = { t: 'modif', cseq: 1, base: seq0, ops: [{ op: 'poser', chemin: ['ev', { id: 'e2' }, 'name'], valeur: 'Prologue revu' }] };
    A.envoyer(modif);
    const dB = await B.attendre((m) => m.t === 'modif');
    expect(dB).toMatchObject({ seq: seq0 + 1, par: 'pers_alice', cseq: 1 });
    expect((await A.attendre((m) => m.t === 'ack' && m.cseq === 1)).statut).toBe('ok');
    A.vider();
    A.envoyer(modif);
    expect((await A.attendre((m) => m.t === 'ack' && m.cseq === 1)).statut).toBe('doublon');
    await new Promise((r) => setTimeout(r, 300));
    expect(B.messages.filter((m) => m.t === 'modif')).toHaveLength(1);

    // Opération invalide : refus, document inchangé.
    A.envoyer({ t: 'modif', cseq: 2, base: seq0 + 1, ops: [{ op: 'poser', chemin: ['ev', { id: 'absent' }, 'name'], valeur: 'x' }] });
    expect(await A.attendre((m) => m.t === 'ack' && m.cseq === 2)).toMatchObject({ statut: 'refus', raison: 'chemin-introuvable' });

    // Chat et commentaire épinglé.
    B.envoyer({ t: 'chat', cseq: 1, texte: 'On reprend au prologue ?' });
    expect((await A.attendre((m) => m.t === 'chat')).message).toMatchObject({ nom: 'Bruno', texte: 'On reprend au prologue ?' });
    B.envoyer({ t: 'commentaire', cseq: 2, action: 'ajouter', ancre: { type: 'etape', moment: 'e2', etape: 'voix' }, texte: 'Voix trop forte' });
    const com = await A.attendre((m) => m.t === 'commentaire');
    expect(com.commentaire).toMatchObject({ ancre: { type: 'etape', moment: 'e2', etape: 'voix' }, auteur: 'pers_bruno', resolu: false });

    // Mode Scène : Alice (régie) prend le verrou du projet ; Bruno ne peut plus modifier ; la lecture est diffusée.
    A.envoyer({ t: 'mode', cseq: 3, mode: 'jouer' });
    expect((await B.attendre((m) => m.t === 'mode')).mode).toBe('jouer');
    expect(await B.attendre((m) => m.t === 'verrou')).toMatchObject({ cible: 'projet', personne: 'pers_alice' });
    B.envoyer({ t: 'modif', cseq: 3, base: seq0 + 1, ops: [{ op: 'poser', chemin: ['titre'], valeur: 'pirate' }] });
    const refus = await B.attendre((m) => m.t === 'ack' && m.cseq === 3);
    expect(refus.statut).toBe('refus');
    expect(refus.raison).toMatch(/^verrouille:projet/);
    A.envoyer({ t: 'lecture', etat: { t: 42, moment: 'e2', etape: 'voix', tEtape: 3, attenteGo: false, retard: 0, bloque: false, termine: false, memoires: {}, parcours: [] } });
    expect((await B.attendre((m) => m.t === 'lecture')).etat).toMatchObject({ t: 42, moment: 'e2' });

    // Enregistrement depuis la salle → version 3, annoncé à tous ; un PUT REST sur l'ancienne base est en conflit.
    A.envoyer({ t: 'enregistrer', cseq: 4, message: 'après répétition' });
    expect((await A.attendre((m) => m.t === 'ack' && m.cseq === 4)).res).toMatchObject({ version: 3 });
    expect((await B.attendre((m) => m.t === 'version')).version).toBe(3);
    expect((await api(`/api/projets/${id}`, { jeton })).corps.project.ev[1].name).toBe('Prologue revu');
    expect((await api(`/api/projets/${id}`, { methode: 'PUT', jeton, corps: { version_base: 2, project: exempleDemo() } })).statut).toBe(409);

    // Départ de Bruno, puis reconnexion à jour (seq connu → pas de projet renvoyé) et resync.
    B.fermer();
    expect((await A.attendre((m) => m.t === 'depart')).personne).toBe('pers_bruno');
    const seqActuel = (await api(`/api/projets/${id}?direct=1`, { jeton })).corps.seq;
    const B2 = new Client(url);
    await B2.ouvert;
    B2.envoyer({ t: 'hello', v: 1, personne: 'pers_bruno', session: 'sess_bruno2', nom: 'Bruno', seq: seqActuel });
    const b2 = await B2.attendre((m) => m.t === 'bienvenue');
    expect(b2).toMatchObject({ a_jour: true, projet: null, mode: 'jouer' });
    expect(b2.commentaires).toHaveLength(1);
    expect(b2.chat.map((c: any) => c.texte)).toContain('On reprend au prologue ?');
    expect(b2.lecture.etat.t).toBe(42);
    B2.envoyer({ t: 'resync' });
    expect((await B2.attendre((m) => m.t === 'instantane')).projet.ev[1].name).toBe('Prologue revu');

    // Messages invalides.
    B2.envoyer({ t: 'teleporter' });
    expect((await B2.attendre((m) => m.t === 'erreur')).code).toBe('type-inconnu');
    A.fermer();
    B2.fermer();
  });

  it('salle : relais des messages de la sortie écran scène (scene), sans écho ni mémoire', async () => {
    const url = `${base.replace('http', 'ws')}/api/projets/${id}/salle?jeton=${jeton}`;
    const R = new Client(url);
    const S = new Client(url);
    await Promise.all([R.ouvert, S.ouvert]);
    R.envoyer({ t: 'hello', v: 1, personne: 'pers_regie', session: 'sess_relais1', nom: 'Relais sortie', role: 'regie' });
    S.envoyer({ t: 'hello', v: 1, personne: 'sortie_proj', session: 'sess_sortie1', nom: 'Sortie scène', role: 'poste' });
    await Promise.all([R.attendre((m) => m.t === 'bienvenue'), S.attendre((m) => m.t === 'bienvenue')]);
    S.envoyer({ t: 'scene', message: { t: 'bonjour', v: 1, id: 'sortie_proj', heure: 1 } });
    const b = await R.attendre((m) => m.t === 'scene');
    expect(b).toMatchObject({ t: 'scene', par: 'sortie_proj', session: 'sess_sortie1', message: { t: 'bonjour', id: 'sortie_proj' } });
    R.envoyer({ t: 'scene', message: { t: 'scene', v: 1, heure: 2, n: 1, fondu: 600, scene: { type: 'noir' } } });
    expect((await S.attendre((m) => m.t === 'scene')).message.scene.type).toBe('noir');
    R.envoyer({ t: 'ping', id: 9 });
    await R.attendre((m) => m.t === 'pong');
    expect(R.messages.filter((m) => m.t === 'scene')).toHaveLength(1);   // pas d'écho à l'émetteur
    R.envoyer({ t: 'scene', message: 'noir' });
    expect((await R.attendre((m) => m.t === 'erreur')).code).toBe('champ-invalide');
    R.fermer();
    S.fermer();
  });

  it('salle : relais de signalisation WebRTC (rtc) ciblé par session ou diffusé, `de` posé par le serveur', async () => {
    const url = `${base.replace('http', 'ws')}/api/projets/${id}/salle?jeton=${jeton}`;
    const T = new Client(url);   // téléphone du streamer
    const S = new Client(url);   // sortie écran scène
    const X = new Client(url);   // un tiers (ne doit pas recevoir les messages ciblés)
    await Promise.all([T.ouvert, S.ouvert, X.ouvert]);
    T.envoyer({ t: 'hello', v: 1, personne: 'pers_stream', session: 'sess_tel001', nom: 'Streamer', role: 'poste' });
    S.envoyer({ t: 'hello', v: 1, personne: 'pers_sortie', session: 'sess_sor001', nom: 'Sortie', role: 'poste' });
    X.envoyer({ t: 'hello', v: 1, personne: 'pers_tiers', session: 'sess_tie001', nom: 'Tiers' });
    await Promise.all([T, S, X].map((c) => c.attendre((m) => m.t === 'bienvenue')));

    // Diffusion '*' : tous les autres, pas l'émetteur ; `de` usurpé par le client ignoré.
    S.envoyer({ t: 'rtc', vers: '*', de: 'sess_pirate', signal: { type: 'recherche', canal: 'streamer' } });
    const r1 = await T.attendre((m) => m.t === 'rtc');
    expect(r1).toMatchObject({ t: 'rtc', de: 'sess_sor001', par: 'pers_sortie', vers: '*', signal: { type: 'recherche', canal: 'streamer' } });
    expect(typeof r1.ts).toBe('number');
    await X.attendre((m) => m.t === 'rtc');

    // Ciblé : seule la session visée reçoit l'offre SDP, à l'identique.
    const sdp = 'v=0\r\no=- 46117317 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n';
    T.envoyer({ t: 'rtc', vers: 'sess_sor001', signal: { type: 'offre', n: 1, sdp } });
    expect((await S.attendre((m) => m.t === 'rtc' && m.signal.type === 'offre')).signal).toEqual({ type: 'offre', n: 1, sdp });
    S.envoyer({ t: 'rtc', vers: 'sess_tel001', signal: { type: 'candidat', n: 1, candidat: { candidate: 'candidate:1 1 udp 2122260223 192.168.1.2 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 } } });
    expect((await T.attendre((m) => m.t === 'rtc' && m.signal.type === 'candidat')).de).toBe('sess_sor001');
    T.envoyer({ t: 'ping', id: 3 });
    X.envoyer({ t: 'ping', id: 4 });
    await Promise.all([T.attendre((m) => m.t === 'pong'), X.attendre((m) => m.t === 'pong')]);
    expect(X.messages.filter((m) => m.t === 'rtc')).toHaveLength(1);   // le ciblé n'a pas fuité
    expect(S.messages.filter((m) => m.t === 'rtc')).toHaveLength(1);   // pas d'écho de sa propre diffusion

    // Destinataire absent, signal invalide.
    T.envoyer({ t: 'rtc', vers: 'sess_absente', signal: { type: 'offre' } });
    expect((await T.attendre((m) => m.t === 'erreur')).code).toBe('rtc-absent');
    T.vider();
    T.envoyer({ t: 'rtc', vers: '*', signal: 'offre' });
    expect((await T.attendre((m) => m.t === 'erreur')).code).toBe('champ-invalide');
    T.fermer(); S.fermer(); X.fermer();
  });

  it('refuse le WebSocket sans jeton ou depuis une origine non autorisée', async () => {
    const sansJeton = new Client(`${base.replace('http', 'ws')}/api/projets/${id}/salle`);
    await expect(sansJeton.ouvert).rejects.toThrow(/ouverture impossible/);
    expect((await api(`/api/projets/${id}/salle`, { jeton })).statut).toBe(426);
    expect((await api(`/api/projets/${id}`, { jeton, entetes: { origin: 'https://pirate.example' } })).statut).toBe(403);
    const pre = await fetch(`${base}/api/projets/${id}`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'PUT' } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('médias : téléversement, liste, lecture (plage), taille max', async () => {
    const contenu = 'bonjour la salle';
    const r = await fetch(`${base}/api/projets/${id}/medias/${encodeURIComponent('Thème été.txt')}`, {
      method: 'PUT', headers: { authorization: `Bearer ${jeton}`, 'content-type': 'text/plain' }, body: contenu,
    });
    expect(r.status).toBe(201);
    const liste = await api(`/api/projets/${id}/medias`, { jeton });
    expect(liste.corps.medias).toEqual([expect.objectContaining({ nom: 'Thème été.txt', taille: contenu.length, type: 'text/plain' })]);
    const lu = await fetch(`${base}/api/projets/${id}/medias/${encodeURIComponent('Thème été.txt')}?jeton=${jeton}`);
    expect(await lu.text()).toBe(contenu);
    const plage = await fetch(`${base}/api/projets/${id}/medias/${encodeURIComponent('Thème été.txt')}`, { headers: { authorization: `Bearer ${jeton}`, range: 'bytes=0-6' } });
    expect(plage.status).toBe(206);
    expect(await plage.text()).toBe('bonjour');
    const gros = await fetch(`${base}/api/projets/${id}/medias/gros.wav`, {
      method: 'PUT', headers: { authorization: `Bearer ${jeton}`, 'content-type': 'audio/wav' }, body: new Uint8Array(4096),
    });
    expect(gros.status).toBe(413);
    const svg = await fetch(`${base}/api/projets/${id}/medias/x.svg`, { method: 'PUT', headers: { authorization: `Bearer ${jeton}`, 'content-type': 'image/svg+xml' }, body: '<svg/>' });
    expect(svg.status).toBe(415);
  });

  it('exécutions : création, ajout idempotent d\'événements, lecture, export', async () => {
    const c = await api(`/api/projets/${id}/runs`, { methode: 'POST', jeton, corps: { id: 'rep1', mode: 'repetition', debut: 1_790_000_000_000 } });
    expect(c.statut).toBe(201);
    const evs = [{ t: 0, type: 'debut' }, { t: 12.5, type: 'etape', moment: 'e1', etape: 'portes' }];
    expect((await api(`/api/projets/${id}/runs/rep1/evenements`, { methode: 'POST', jeton, corps: { premier: 0, evenements: evs } })).corps).toEqual({ recus: 2, ignores: 0, total: 2 });
    // Renvoi (réseau incertain) + un nouvel événement : seul le nouveau est ajouté.
    const r2 = await api(`/api/projets/${id}/runs/rep1/evenements`, { methode: 'POST', jeton, corps: { premier: 1, evenements: [evs[1], { t: 30, type: 'top' }] } });
    expect(r2.corps).toEqual({ recus: 1, ignores: 1, total: 3 });
    const run = await api(`/api/projets/${id}/runs/rep1`, { jeton });
    expect(run.corps.evenements.map((e: any) => e.type)).toEqual(['debut', 'etape', 'top']);
    const exp = await api(`/api/projets/${id}/export`, { jeton });
    expect(exp.corps.format).toBe('studio-real/conducteur@1');
    expect(exp.corps.runs[0].evenements).toHaveLength(3);
    // Import du fichier exporté = nouveau projet.
    const imp = await api('/api/projets', { methode: 'POST', jeton: ADMIN, corps: exp.corps });
    expect(imp.statut).toBe(201);
    expect((await api(`/api/projets/${imp.corps.id}/runs/rep1`, { jeton: imp.corps.jeton })).corps.evenements).toHaveLength(3);
  });
});
