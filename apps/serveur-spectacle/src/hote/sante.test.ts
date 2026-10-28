// Supervision : le JSON de `GET /sante` a les champs attendus et ne contient JAMAIS de pseudo ni de jeton ; la sonde
// du tunnel (fausse, sans réseau) ; `POST /arret` (jeton de la régie, cette machine seulement) ; pages d'exploitation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { WebSocket } from 'ws';
import { projetBanc } from '../noyau/banc-test';
import { normaliserConfig, type ConfigSpectacle } from './config';
import { SondeTunnel, adressePubliqueReelle, type Sonde } from './sante';
import { demarrerServeur, type ServeurSpectacle } from './serveur';

const JETONS = { regie: 'jeton-regie-de-test-0123456789', acteur: 'jeton-acteur-de-test-0123456789', agent: 'jeton-agent-de-test-0123456789' };
const PSEUDO = 'Pseudo_Secret_42';

let dossier: string;
let config: ConfigSpectacle;
let srv: ServeurSpectacle;
let demandesArret = 0;
let appels = 0;
const sondeFausse: Sonde = async () => { appels++; return { ok: true, latenceMs: 42 }; };
const ouverts: WebSocket[] = [];

const base = () => `http://127.0.0.1:${srv.port}`;
const sante = async () => await (await fetch(`${base()}/sante`)).json() as Record<string, any>;

function connecter(role: string, jeton: string, acteur: string | undefined, session: string, extra: Record<string, unknown> = {}): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
  ouverts.push(ws);
  return new Promise((ok, ko) => {
    ws.once('error', ko);
    ws.once('open', () => {
      ws.send(JSON.stringify({ t: 'hello', v: 2, role, session, jeton, ...(acteur ? { acteur } : {}), ...extra }));
    });
    ws.on('message', d => { if (JSON.parse(String(d)).t === 'bienvenue') ok(ws); });
  });
}

/** POST local sans passer par fetch (pour poser des en-têtes de relais à volonté). */
function poster(chemin: string, entetes: Record<string, string>): Promise<{ statut: number; corps: string }> {
  return new Promise((ok, ko) => {
    const r = http.request({ host: '127.0.0.1', port: srv.port, path: chemin, method: 'POST', headers: entetes }, res => {
      let corps = '';
      res.on('data', d => { corps += String(d); });
      res.on('end', () => ok({ statut: res.statusCode ?? 0, corps }));
    });
    r.on('error', ko);
    r.end();
  });
}

beforeAll(async () => {
  dossier = mkdtempSync(join(tmpdir(), 'serveur-sante-'));
  config = normaliserConfig({
    spectacle: 'banc', port: 0, hote: '127.0.0.1', projet: 'inutile.json', exploitation: 'exploitation',
    adresses: { publique: 'https://spectacle.exemple-test.fr', locale: 'http://localhost:8790' },
    tunnel: { type: 'cloudflare-nomme', nom: 'studio-real-test' },
  });
  srv = await demarrerServeur({
    config, racine: dossier, jetons: JETONS, projet: projetBanc(), alarme: false, version: 'abc1234', console: () => {},
    sondeTunnel: sondeFausse, intervalleSondeMs: 60_000, surDemandeArret: () => { demandesArret++; },
  });
});

afterAll(async () => {
  for (const w of ouverts) w.terminate();
  await srv?.arreter();
  rmSync(dossier, { recursive: true, force: true });
});

describe('GET /sante', () => {
  it('a les champs attendus', async () => {
    await new Promise(r => setTimeout(r, 50));   // la première sonde (fausse) a répondu
    const s = await sante();
    expect(s).toMatchObject({
      ok: true, version: 'abc1234', redemarrages: 0,
      connexions: { total: 0, parRole: { regie: 0, acteur: 0, agent: 0 } },
      representation: { run: { mode: 'scene' }, connectes: { regie: 0, acteur: 0 }, acteurs: {}, agents: {}, dernierTop: null },
      topRecu: { ts: null, ilYaS: null },
      tunnel: { type: 'cloudflare-nomme', actif: true, etat: 'ok', latenceMs: 42, adresse: 'https://spectacle.exemple-test.fr', erreur: null },
    });
    expect(typeof s.demarre).toBe('number');
    expect(typeof s.maintenant).toBe('number');
    expect(s.depuisS).toBeGreaterThanOrEqual(0);
    // âge de l'instantané et espace disque du dossier des journaux
    expect(s.persistance.ageInstantaneMs).toBeGreaterThanOrEqual(0);
    expect(s.persistance.disqueLibreMo === null || s.persistance.disqueLibreMo > 0).toBe(true);
    expect('octetsJournal' in s.persistance).toBe(true);
    expect(s.tunnel.dernierSucces).toBeGreaterThan(0);
    expect(s.tunnel.sondes).toMatchObject({ total: expect.any(Number), echecs: 0 });
  });

  it('connectés par rôle et par acteur, dernier top : sans pseudo ni jeton', async () => {
    const regie = await connecter('regie', JETONS.regie, undefined, 's_regie');
    await connecter('acteur', JETONS.acteur, 'scene', 's_scene');
    await connecter('acteur', JETONS.acteur, 'public', 's_pub1', { personne: 'tel_001', pseudo: PSEUDO });
    await connecter('acteur', JETONS.acteur, 'public', 's_pub2', { personne: 'tel_002', pseudo: 'Autre_Pseudo_77' });
    regie.send(JSON.stringify({ t: 'conduite', cseq: 1, op: 'top' }));
    await new Promise(r => setTimeout(r, 150));
    const s = await sante();
    expect(s.connexions.parRole).toMatchObject({ regie: 1, acteur: 3, agent: 0 });
    expect(s.representation.connectes).toMatchObject({ regie: 1, acteur: 3 });
    expect(s.representation.acteurs).toMatchObject({ scene: 1, public: 2 });
    expect(s.topRecu.ts).toBeGreaterThan(0);
    expect(s.topRecu.ilYaS).toBeGreaterThanOrEqual(0);
    expect(s.representation.dernierTop).toBe(s.topRecu.ts);

    const brut = JSON.stringify(s);
    for (const interdit of [PSEUDO, 'Autre_Pseudo_77', 'tel_001', 's_pub1', ...Object.values(JETONS)]) expect(brut, interdit).not.toContain(interdit);
    // aucune CLÉ jeton / pseudo / secret n'existe dans le JSON, à aucun niveau
    const cles: string[] = [];
    const parcourir = (x: unknown) => { if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { cles.push(k); parcourir(v); } };
    parcourir(s);
    expect(cles.filter(k => /jeton|pseudo|token|secret|session|personne|empreinte/i.test(k))).toEqual([]);
  });
});

describe('sonde du tunnel', () => {
  it('ok puis muet (le silence se compte depuis le dernier succès) puis ok', async () => {
    let t = 1_000_000;
    let reponse: { ok: boolean; latenceMs?: number; erreur?: string } = { ok: true, latenceMs: 80 };
    const sonde = new SondeTunnel({ config, demarre: 5, sonde: async () => reponse, maintenant: () => t });
    expect(sonde.etat()).toMatchObject({ actif: true, etat: 'inconnu', dernierSucces: null });
    await sonde.essayer();
    expect(sonde.etat()).toMatchObject({ etat: 'ok', latenceMs: 80, silenceDepuisS: 0, erreur: null });
    t += 45_000;
    reponse = { ok: false, erreur: 'delai' };
    await sonde.essayer();
    expect(sonde.etat()).toMatchObject({ etat: 'muet', erreur: 'delai', silenceDepuisS: 45, sondes: { total: 2, echecs: 1 } });
    reponse = { ok: true, latenceMs: 90 };
    await sonde.essayer();
    expect(sonde.etat()).toMatchObject({ etat: 'ok', silenceDepuisS: 0 });
  });

  it('désactivée sans tunnel, sur localhost ou sur la valeur exemple : aucune requête', async () => {
    let n = 0;
    const sonde: Sonde = async () => { n++; return { ok: true }; };
    for (const [c, raison] of [
      [{ tunnel: { type: 'aucun' }, adresses: { publique: 'https://spectacle.exemple-test.fr' } }, 'aucun-tunnel'],
      [{ tunnel: { type: 'cloudflare-nomme' }, adresses: { publique: 'http://localhost:8790' } }, 'pas-https'],
      [{ tunnel: { type: 'cloudflare-nomme' }, adresses: { publique: 'https://localhost:8790' } }, 'adresse-locale'],
      [{ tunnel: { type: 'cloudflare-nomme' }, adresses: { publique: 'https://spectacle.example.org' } }, 'valeur-a-remplacer'],
      [{ tunnel: { type: 'cloudflare-nomme' }, adresses: { publique: 'https://spectacle.<DOMAINE>' } }, 'valeur-a-remplacer'],
    ] as const) {
      const s = new SondeTunnel({ config: normaliserConfig(c), demarre: 1, sonde });
      s.demarrer();
      await s.essayer();
      s.arreter();
      expect(s.etat(), JSON.stringify(c)).toMatchObject({ actif: false, etat: 'desactive', raison, adresse: null });
    }
    expect(n).toBe(0);
    expect(adressePubliqueReelle('https://spectacle.exemple-test.fr').ok).toBe(true);
  });

  it('le serveur sonde l\'adresse publique au démarrage', () => {
    expect(appels).toBeGreaterThanOrEqual(1);
  });
});

describe('POST /arret', () => {
  it('refuse sans jeton, avec un mauvais jeton, et à travers un relais ; accepte le jeton de la régie', async () => {
    expect((await poster('/arret', {})).statut).toBe(401);
    expect((await poster('/arret', { authorization: 'Bearer pas-le-bon' })).statut).toBe(401);
    expect((await poster('/arret', { authorization: `Bearer ${JETONS.acteur}` })).statut).toBe(401);
    expect((await poster('/arret', { authorization: `Bearer ${JETONS.regie}`, 'cf-connecting-ip': '203.0.113.9' })).statut).toBe(403);
    expect((await poster('/arret', { authorization: `Bearer ${JETONS.regie}`, 'x-forwarded-for': '203.0.113.9' })).statut).toBe(403);
    expect(demandesArret).toBe(0);
    const ok = await poster('/arret', { authorization: `Bearer ${JETONS.regie}` });
    expect(ok.statut).toBe(202);
    expect(ok.corps).not.toContain(JETONS.regie);
    await new Promise(r => setTimeout(r, 50));
    expect(demandesArret).toBe(1);
    // les autres chemins en POST restent refusés
    expect((await poster('/sante', {})).statut).toBe(405);
  });
});

describe('pages d\'exploitation', () => {
  it('/sante.html, /checklist.html, /checklist.md et le thème sont servis', async () => {
    const page = await fetch(`${base()}/sante.html`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    const html = await page.text();
    expect(html).toContain('/sante');
    expect(html).toContain('/checklist.html');
    expect(html).toContain('/theme/venus.js');
    expect((await fetch(`${base()}/theme/theme.css`)).status).toBe(200);
    expect((await fetch(`${base()}/theme/polices/venus-rising.otf`)).status).toBe(200);
    expect((await fetch(`${base()}/checklist.html`)).status).toBe(200);
    const md = await fetch(`${base()}/checklist.md`);
    expect(md.status).toBe(200);
    expect(await md.text()).toContain('J-1');
  });
});
