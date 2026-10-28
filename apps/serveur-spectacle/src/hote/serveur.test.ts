// Test d'intégration de l'hôte : un vrai serveur sur un port éphémère, de vrais WebSocket (régie, écran scène, deux
// téléphones du public, agent des figurants), le petit projet du banc ; arrêt puis redémarrage → état restauré.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import type { MessageServeur } from '@studio-real/protocole';
import { projetBanc } from '../noyau/banc-test';
import { empreinteDe } from '../noyau';
import { normaliserConfig, type ConfigSpectacle } from './config';
import { ErreurPortPris, demarrerServeur, type ServeurSpectacle } from './serveur';
import type { FichierInstantane } from './persistance';

const JETONS = { regie: 'jeton-regie-de-test-0123456789', acteur: 'jeton-acteur-de-test-0123456789', agent: 'jeton-agent-de-test-0123456789' };

/** Client WebSocket de test : garde tout ce qu'il reçoit, attend un message donné. */
class Client {
  recus: MessageServeur[] = [];
  private lu = 0;
  private attentes: (() => void)[] = [];
  fermeture: Promise<number>;
  private constructor(readonly ws: WebSocket) {
    ws.on('message', d => {
      this.recus.push(JSON.parse(String(d)) as MessageServeur);
      for (const f of this.attentes) f();
    });
    this.fermeture = new Promise(ok => ws.on('close', code => ok(code)));
  }
  static ouvrir(port: number): Promise<Client> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    return new Promise((ok, ko) => { ws.once('open', () => ok(new Client(ws))); ws.once('error', ko); });
  }
  envoyer(m: Record<string, unknown>) { this.ws.send(JSON.stringify(m)); }
  /** Prochain message (après le dernier attendu) qui vérifie `pred`. */
  attendre<T extends MessageServeur['t']>(t: T, pred: (m: Extract<MessageServeur, { t: T }>) => boolean = () => true, ms = 3000): Promise<Extract<MessageServeur, { t: T }>> {
    return new Promise((ok, ko) => {
      const chercher = () => {
        for (let i = this.lu; i < this.recus.length; i++) {
          const m = this.recus[i]!;
          if (m.t === t && pred(m as Extract<MessageServeur, { t: T }>)) {
            this.lu = i + 1;
            this.attentes = this.attentes.filter(f => f !== chercher);
            clearTimeout(minuterie);
            ok(m as Extract<MessageServeur, { t: T }>);
            return;
          }
        }
      };
      const minuterie = setTimeout(() => { this.attentes = this.attentes.filter(f => f !== chercher); ko(new Error(`${t} attendu, reçus : ${this.recus.map(x => x.t).join(', ')}`)); }, ms);
      this.attentes.push(chercher);
      chercher();
    });
  }
  fermer() { this.ws.close(); return this.fermeture; }
}

let dossier: string;
let config: ConfigSpectacle;
let srv: ServeurSpectacle | null = null;
const ouverts: Client[] = [];

async function connecter(role: string, jeton: string, acteur?: string, personne?: string, session = `s_${role}_${acteur ?? ''}_${personne ?? ''}_${ouverts.length}`, extra: Record<string, unknown> = {}) {
  const c = await Client.ouvrir(srv!.port);
  ouverts.push(c);
  c.envoyer({ t: 'hello', v: 2, role, session, jeton, ...(acteur ? { acteur } : {}), ...(personne ? { personne } : {}), ...extra });
  return c;
}
const demarrer = () => demarrerServeur({ config, racine: dossier, jetons: JETONS, projet: projetBanc(), alarme: false, version: 'test', console: () => {} });

beforeAll(async () => {
  dossier = mkdtempSync(join(tmpdir(), 'serveur-spectacle-'));
  for (const d of ['tel', 'cond', 'medias']) mkdirSync(join(dossier, d));
  writeFileSync(join(dossier, 'tel', 'index.html'), '<!doctype html><title>Téléphone</title>');
  writeFileSync(join(dossier, 'cond', 'index.html'), '<!doctype html><title>Conducteur</title>');
  writeFileSync(join(dossier, 'medias', 'clip.0123abcd.mp4'), Buffer.from('0123456789'));
  writeFileSync(join(dossier, 'medias', 'notes.txt'), 'bonjour');
  writeFileSync(join(dossier, 'medias', '.cache'), 'secret');
  writeFileSync(join(dossier, 'secret.txt'), 'hors des dossiers servis');
  config = normaliserConfig({
    spectacle: 'banc', port: 0, hote: '127.0.0.1', projet: 'inutile.json', exploitation: 'exploitation',
    medias: { dossier: 'medias' }, clients: { telephone: 'tel', conducteur: 'cond' },
    adresses: { publique: 'https://spectacle.exemple', locale: 'http://localhost:8790' },
  });
  srv = await demarrer();
});

afterAll(async () => {
  for (const c of ouverts) c.ws.terminate();
  await srv?.arreter();
  srv = null;
  rmSync(dossier, { recursive: true, force: true });
});

describe('HTTP', () => {
  it('/sante : JSON sans donnée personnelle ; /config.json : partie publique', async () => {
    const s = await (await fetch(`http://127.0.0.1:${srv!.port}/sante`)).json() as Record<string, unknown>;
    expect(s).toMatchObject({ ok: true, version: 'test', redemarrages: 0, representation: { run: { mode: 'scene' } } });
    const c = await fetch(`http://127.0.0.1:${srv!.port}/config.json`);
    expect(c.headers.get('cache-control')).toBe('no-store');
    const config = await c.json();
    expect(config).toMatchObject({ spectacle: 'banc', ws: '/ws', protocole: 2, adresses: { publique: 'https://spectacle.exemple' } });
    expect(JSON.stringify(config)).not.toMatch(/jeton|exploitation|medias/);
  });

  it('statique : Range, ETag, 304, cache immuable des noms versionnés, no-cache sinon', async () => {
    const base = `http://127.0.0.1:${srv!.port}`;
    const r = await fetch(`${base}/medias/clip.0123abcd.mp4`, { headers: { range: 'bytes=2-5' } });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await r.text()).toBe('2345');
    expect(r.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect((await fetch(`${base}/medias/clip.0123abcd.mp4`, { headers: { range: 'bytes=50-60' } })).status).toBe(416);
    const n = await fetch(`${base}/medias/notes.txt`);
    expect(n.headers.get('cache-control')).toBe('no-cache');
    const etag = n.headers.get('etag')!;
    expect(etag).toMatch(/^W\//);
    expect((await fetch(`${base}/medias/notes.txt`, { headers: { 'if-none-match': etag } })).status).toBe(304);
    expect(await (await fetch(`${base}/`)).text()).toContain('Téléphone');
    expect(await (await fetch(`${base}/conducteur/regie`)).text()).toContain('Conducteur');
  });

  it('jamais de fichier caché ni hors des dossiers servis', async () => {
    const base = `http://127.0.0.1:${srv!.port}`;
    for (const p of ['/medias/.cache', '/medias/%2e%2e/secret.txt', '/medias/..%2fsecret.txt', '/%2e%2e/secret.txt', '/medias/..%5csecret.txt', '/exploitation/spectacle.secrets.json'])
      expect((await fetch(base + p)).status, p).toBe(404);
    expect((await fetch(`${base}/sante`, { method: 'POST' })).status).toBe(405);
  });
});

describe('WebSocket : une soirée du banc', () => {
  let regie: Client;
  let scene: Client;
  let pub1: Client;
  let pub2: Client;
  let agent: Client;

  it('bienvenue avec la vue de chaque acteur ; la régie reçoit la lecture', async () => {
    regie = await connecter('regie', JETONS.regie);
    scene = await connecter('acteur', JETONS.acteur, 'scene');
    pub1 = await connecter('acteur', JETONS.acteur, 'public', 'tel_001', 'pub_session_1');
    pub2 = await connecter('acteur', JETONS.acteur, 'public', 'tel_002', 'pub_session_2');
    agent = await connecter('agent', JETONS.agent, 'figurants');
    const br = await regie.attendre('bienvenue');
    expect(br.lecture!.etat).toMatchObject({ moment: 'm1', etape: 'accueil' });
    expect((await scene.attendre('bienvenue')).vue).toMatchObject({ ecran: 'accueil-qr' });
    expect((await pub1.attendre('bienvenue')).vue).toMatchObject({ ecran: 'regardez', params: { texte: 'Bienvenue' } });
    expect((await pub2.attendre('bienvenue')).vue).toMatchObject({ ecran: 'regardez' });
    expect((await agent.attendre('bienvenue')).role).toBe('agent');
    const pong = new Promise(ok => { pub1.ws.on('message', d => { if (JSON.parse(String(d)).t === 'pong') ok(true); }); });
    pub1.envoyer({ t: 'ping', tc: 1 });
    await pong;
  });

  it('top de la régie → nouvelles vues sur les téléphones et la scène, ack et lecture à la régie', async () => {
    regie.envoyer({ t: 'conduite', cseq: 1, op: 'top' });
    expect(await regie.attendre('ack', a => a.cseq === 1)).toMatchObject({ statut: 'ok' });
    await regie.attendre('lecture', l => l.etat.etape === 'vote');
    expect(await pub1.attendre('vue', v => v.ecran === 'vote')).toMatchObject({ params: { numero: 1, question: 'Faut-il continuer ?' } });
    await pub2.attendre('vue', v => v.ecran === 'vote');
    await scene.attendre('vue', v => v.ecran === 'vote');
    expect(await pub1.attendre('fx')).toMatchObject({ kind: 'vibrer', ttl: 3000 });
  });

  it('votes → résumé de salle à la régie ; passage au quorum', async () => {
    pub1.envoyer({ t: 'in', cseq: 1, k: 'vote', q: '1', data: { index: 0 } });
    expect(await pub1.attendre('ack', a => a.cseq === 1)).toMatchObject({ statut: 'ok' });
    pub1.envoyer({ t: 'in', cseq: 2, k: 'vote', q: '1', data: { index: 1 } });
    expect(await pub1.attendre('ack', a => a.cseq === 2)).toMatchObject({ statut: 'doublon', raison: 'deja-vote' });
    pub2.envoyer({ t: 'in', cseq: 1, k: 'vote', q: '1', data: { index: 0 } });
    await pub2.attendre('ack', a => a.cseq === 1);
    srv!.tick(1);
    expect(await regie.attendre('salle', s => s.vote?.recus === 2)).toMatchObject({ vote: { q: '1', parts: [2] }, acteurs: { public: { presents: 2 } } });
    for (let i = 0; i < 10; i++) srv!.tick(1);   // durée prévue du vote : le quorum (100 %) fait passer
    expect(await pub1.attendre('vue', v => v.ecran === 'regardez')).toMatchObject({ params: { texte: 'Résultat à l’écran' } });
    expect(srv!.representation.etatLecture()).toMatchObject({ etape: 'resultat', issue: 'A' });
  });

  it('reconnexion d’un téléphone avec un vseq en retard → vue courante ; le dernier gagne', async () => {
    const courante = srv!.representation.vue('public')!;
    await pub2.fermer();
    const pub2b = await connecter('acteur', JETONS.acteur, 'public', 'tel_002', 'pub_session_2', { vseq: 1, cseq: 1 });
    expect(await pub2b.attendre('bienvenue')).toMatchObject({ cseq: 1, vue: { vseq: courante.vseq, ecran: 'regardez' } });
    // même session ouverte ailleurs : l'ancienne connexion est fermée (4001)
    const pub2c = await connecter('acteur', JETONS.acteur, 'public', 'tel_002', 'pub_session_2');
    await pub2c.attendre('bienvenue');
    expect(await pub2b.fermeture).toBe(4001);
    expect(srv!.representation.signaux().pres).toBe(2);
  });

  it('agent : commande numérotée, accusé → le lecteur avance', async () => {
    regie.envoyer({ t: 'conduite', cseq: 2, op: 'allerA', moment: 'm2' });
    const cmd = await agent.attendre('agent.cmd');
    expect(cmd).toMatchObject({ n: 1, type: 'figurants.cmd', etape: 'fig', donnees: { segment: 'junon' } });
    for (let i = 0; i < 10; i++) srv!.tick(1);
    agent.envoyer({ t: 'agent.ack', n: 1, statut: 'fait' });
    await regie.attendre('lecture', l => l.etat.etape === 'lumiere');
  });

  it('jeton faux → refus fatal et fermeture 4003', async () => {
    const intrus = await connecter('regie', 'jeton-faux-0123456789');
    expect(await intrus.attendre('refus')).toMatchObject({ code: 'jeton', fatal: true });
    expect(await intrus.fermeture).toBe(4003);
    const mauvaisRole = await connecter('regie', JETONS.acteur);
    expect(await mauvaisRole.fermeture).toBe(4003);
  });

  it('une seconde instance sur le même port échoue (port pris) sans toucher à l’instantané ni au journal', async () => {
    const etat = join(dossier, 'exploitation', 'etat');
    const lire = () => readdirSync(etat).map(f => readFileSync(join(etat, f), 'utf8')).join('|');
    srv!.persistance.vider();
    const avant = lire();
    await expect(demarrerServeur({ config: { ...config, port: srv!.port }, racine: dossier, jetons: JETONS, projet: projetBanc(), alarme: false, console: () => {} }))
      .rejects.toBeInstanceOf(ErreurPortPris);
    expect(lire()).toBe(avant);
  });

  it('arrêt du serveur puis redémarrage → état restauré identique, les clients reprennent', async () => {
    const avant = srv!.representation.etatLecture();
    await srv!.arreter();
    for (const c of [regie, scene, pub1, agent]) expect(await c.fermeture).toBe(1001);
    const etat = join(dossier, 'exploitation', 'etat');
    const fichiers = readdirSync(etat).filter(f => f.endsWith('.instantane.json'));
    expect(fichiers).toHaveLength(1);
    const ecrit = JSON.parse(readFileSync(join(etat, fichiers[0]!), 'utf8')) as FichierInstantane;
    expect(Object.values(ecrit.etat.sessions).some(s => s.connectee)).toBe(false);
    const journal = readFileSync(join(dossier, 'exploitation', 'journaux', fichiers[0]!.replace('.instantane.json', '.jsonl')), 'utf8');
    expect(journal).not.toContain(JETONS.regie);
    expect(journal).not.toContain('jeton-faux');
    expect(journal.split('\n').filter(Boolean).map(l => JSON.parse(l).type)).toEqual(expect.arrayContaining(['lancer', 'connexion', 'vue', 'entree', 'agent.cmd', 'agent.ack', 'refus', 'deconnexion']));

    srv = await demarrer();
    expect(empreinteDe(srv.representation.instantane())).toBe(empreinteDe(ecrit.etat));
    expect(srv.representation.etatLecture()).toEqual(avant);
    expect(srv.sante()).toMatchObject({ redemarrages: 1 });
    const pub = await connecter('acteur', JETONS.acteur, 'public', 'tel_001', 'pub_session_1', { vseq: 1 });
    expect(await pub.attendre('bienvenue')).toMatchObject({ cseq: 2, vue: { ecran: 'regardez' } });
    pub.envoyer({ t: 'in', cseq: 2, k: 'vote', q: '1', data: { index: 1 } });
    expect(await pub.attendre('ack', a => a.cseq === 2)).toMatchObject({ statut: 'doublon' });
  });
});
