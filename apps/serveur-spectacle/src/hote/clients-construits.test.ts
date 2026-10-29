// Les clients CONSTRUITS (apps/conducteur/dist, apps/telephone/dist) servis par l'hôte sous /conducteur/, /t/ et / :
// chaque page doit retrouver ses fichiers (scripts, styles, polices) à ces préfixes. Le 29/10, la sortie servie sous
// /conducteur/sortie.html était noire : le build référençait /assets/… (base `/`), que l'hôte ne sert pas.
// Ce test lit les vrais dossiers dist s'ils existent (après `npm run build`) ; sinon il est sauté en le disant.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projetBanc } from '../noyau/banc-test';
import { normaliserConfig } from './config';
import { demarrerServeur, type ServeurSpectacle } from './serveur';

const DEPOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const DIST_CONDUCTEUR = join(DEPOT, 'apps', 'conducteur', 'dist');
const DIST_TELEPHONE = join(DEPOT, 'apps', 'telephone', 'dist');
const CONSTRUITS = existsSync(join(DIST_CONDUCTEUR, 'sortie.html')) && existsSync(join(DIST_TELEPHONE, 'index.html'));
const RAISON = 'clients non construits (npm run build)';

const JETONS = { regie: 'jeton-regie-de-test-0123456789', acteur: 'jeton-acteur-de-test-0123456789', agent: 'jeton-agent-de-test-0123456789' };

/** Les adresses des fichiers qu'une page HTML charge (src=, href=), sans les liens externes ni les ancres. */
function fichiersDe(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    const u = m[1]!;
    if (/^(?:https?:)?\/\//.test(u) || u.startsWith('#') || u.startsWith('data:') || u.startsWith('mailto:')) continue;
    out.push(u);
  }
  return out;
}

let dossier = '';
let srv: ServeurSpectacle | null = null;

describe.skipIf(!CONSTRUITS)(CONSTRUITS ? 'clients construits servis par l\'hôte' : `[SAUTÉ : ${RAISON}] clients construits servis par l'hôte`, () => {
  beforeAll(async () => {
    dossier = mkdtempSync(join(tmpdir(), 'serveur-spectacle-clients-'));
    const config = normaliserConfig({
      spectacle: 'banc', port: 0, hote: '127.0.0.1', projet: 'inutile.json', exploitation: dossier,
      medias: { dossier: join(dossier, 'medias') }, clients: { telephone: DIST_TELEPHONE, conducteur: DIST_CONDUCTEUR },
      adresses: { publique: 'https://spectacle.exemple', locale: 'http://localhost:8790' },
    });
    srv = await demarrerServeur({ config, racine: DEPOT, jetons: JETONS, projet: projetBanc(), alarme: false, version: 'test', console: () => {} });
  });
  afterAll(async () => {
    await srv?.arreter();
    srv = null;
    if (dossier) rmSync(dossier, { recursive: true, force: true });
  });

  it.each(['/conducteur/sortie.html', '/conducteur/', '/t/', '/'])('%s : la page et chacun de ses fichiers répondent 200, avec le bon type', async (page) => {
    const base = `http://127.0.0.1:${srv!.port}`;
    const r = await fetch(base + page);
    expect(r.status, page).toBe(200);
    expect(r.headers.get('content-type') ?? '').toContain('text/html');
    const html = await r.text();
    const fichiers = fichiersDe(html);
    expect(fichiers.length, `aucun fichier référencé par ${page}`).toBeGreaterThan(0);
    for (const f of fichiers) {
      const url = new URL(f, base + page);
      // Un chemin absolu `/assets/…` est précisément le bug : le build doit référencer ses fichiers en relatif.
      expect(url.pathname, `${page} → ${f}`).not.toMatch(/^\/assets\//);
      const rf = await fetch(url);
      expect(rf.status, `${page} → ${f}`).toBe(200);
      const type = rf.headers.get('content-type') ?? '';
      if (url.pathname.endsWith('.css')) expect(type, `${page} → ${f}`).toContain('text/css');
      if (url.pathname.endsWith('.js')) expect(type, `${page} → ${f}`).toContain('javascript');
      await rf.arrayBuffer();
    }
  });
});
