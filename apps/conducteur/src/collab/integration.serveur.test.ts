// Intégration RÉELLE : lance le serveur local (`npm run dev -w serveur`, wrangler dev --local : D1, R2 et Durable
// Object simulés, aucun accès au compte Cloudflare) sur un port libre, puis branche DEUX clients du module
// src/etat/serveur.ts (WebSocket natif de Node 24) : présence, chat, modification propagée, conflits, verrou,
// coupure et reprise. Arrête le serveur à la fin.
// Désactiver (machine sans wrangler) : SR_SANS_SERVEUR=1.
// Test LENT (projet vitest « conducteur-lent », `npm run test:lent`). Quand il se saute, il l'annonce : nom de describe
// « [SAUTÉ : raison] … » et un avertissement en tête de sortie.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exempleDemo, type Projet } from '@studio-real/modele';
import { ClientApi, enregistrerAvecFusion, SalleClient, type DocumentLocal } from '../etat/serveur';
import { copie } from './ops';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SERVEUR = join(RACINE, 'apps', 'serveur');

/** Raison du saut, ou `null` si le test peut tourner (SR_SANS_SERVEUR=1, ou wrangler non installé). */
function raisonSaut(): string | null {
  if (process.env.SR_SANS_SERVEUR === '1') return 'SR_SANS_SERVEUR=1';
  try { createRequire(join(SERVEUR, 'package.json')).resolve('wrangler/package.json'); } catch { return 'wrangler introuvable (npm install)'; }
  return null;
}
const RAISON_SAUT = raisonSaut();
const SANS = RAISON_SAUT !== null;
if (SANS) console.warn(`[SAUTÉ : ${RAISON_SAUT}] salle réelle : aucun serveur lancé`);

let base = '';
let admin = '';
let processus: ChildProcess | null = null;
let journal = '';

const portLibre = () => new Promise<number>((ok, ko) => {
  const s = createServer();
  s.once('error', ko);
  s.listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => ok(typeof a === 'object' && a ? a.port : 0)); });
});

/** JETON_ADMIN de apps/serveur/.dev.vars (créé s'il manque : fichier local ignoré par git). */
function jetonAdminLocal(): string {
  const f = join(SERVEUR, '.dev.vars');
  if (!existsSync(f)) {
    const j = randomBytes(24).toString('base64url');
    writeFileSync(f, `# Créé par le test d'intégration COLLAB (local, ignoré par git).\nJETON_ADMIN=${j}\n`);
  }
  const m = /^\s*JETON_ADMIN\s*=\s*"?([^"\r\n]+)"?/m.exec(readFileSync(f, 'utf8'));
  if (!m || m[1]!.length < 16 || m[1]!.startsWith('remplacer')) throw new Error('JETON_ADMIN absent ou trop court dans apps/serveur/.dev.vars');
  return m[1]!.trim();
}

beforeAll(async () => {
  if (SANS) return;
  admin = jetonAdminLocal();
  const port = await portLibre();
  base = `http://127.0.0.1:${port}`;
  const args = `--ip 127.0.0.1 --port ${port} --inspector-port ${await portLibre()} --show-interactive-dev-session=false`;
  processus = spawn(`npm run dev -w serveur -- ${args}`, {
    cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1', NO_COLOR: '1' },
  });
  processus.stdout!.on('data', (d) => { journal += d; });
  processus.stderr!.on('data', (d) => { journal += d; });
  const limite = Date.now() + 150_000;
  for (;;) {
    try { if ((await fetch(`${base}/api/sante`)).ok) break; } catch { /* pas encore prêt */ }
    if (Date.now() > limite || processus.exitCode !== null) throw new Error('le serveur ne démarre pas :\n' + journal.slice(-4000));
    await new Promise((r) => setTimeout(r, 400));
  }
}, 180_000);

afterAll(() => {
  if (!processus?.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(processus.pid), '/T', '/F']);
  else processus.kill('SIGTERM');
});

/** Document local en mémoire (à la place du magasin) : chaque client a le sien. */
class DocMemoire implements DocumentLocal {
  p: Projet = { titre: 'vide', acts: [], ev: [], sens: { aff: 0, part: 0, calme: 0, pen: 0 }, hold: {}, go: {}, ver: 1, nid: 1, tracks: [] };
  ecritures = 0;
  private ecouteurs = new Set<() => void>();
  lire() { return this.p; }
  ecrire(p: Projet) { this.p = p; this.ecritures++; for (const f of this.ecouteurs) f(); }
  ecouter(f: () => void) { this.ecouteurs.add(f); return () => { this.ecouteurs.delete(f); }; }
  modifier(fn: (p: Projet) => void) { const c = copie(this.p); fn(c); this.p = c; for (const f of this.ecouteurs) f(); }
}

async function attendre(pred: () => boolean, quoi: string, ms = 10_000) {
  const fin = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > fin) throw new Error('attente dépassée : ' + quoi);
    await new Promise((r) => setTimeout(r, 20));
  }
}

const json = (p: Projet) => JSON.stringify(p);

describe.skipIf(SANS)(SANS ? `[SAUTÉ : ${RAISON_SAUT}] salle réelle : deux clients du module serveur.ts` : 'salle réelle : deux clients du module serveur.ts', () => {
  let api: ClientApi;
  let id = '', jeton = '';
  const docA = new DocMemoire(), docB = new DocMemoire();
  let A: SalleClient, B: SalleClient;

  it('crée un projet (API admin) et ouvre deux salles : présence des deux côtés', async () => {
    api = new ClientApi({ base, jeton: (p) => (p && p === id ? jeton : admin), auteur: () => 'test-collab' });
    const r = await api.creerProjet({ titre: 'Essai COLLAB', project: exempleDemo() });
    id = r.id; jeton = r.jeton;
    expect(id).toMatch(/^p_/);
    expect(jeton).toBeTruthy();

    A = new SalleClient({ base, projet: id, jeton, document: docA, personne: 'pers_alice_' + id.slice(2, 10), nom: 'Alice', role: 'regie', delaiEnvoi: 10 });
    B = new SalleClient({ base, projet: id, jeton, document: docB, personne: 'pers_bruno_' + id.slice(2, 10), nom: 'Bruno', delaiEnvoi: 10 });
    A.ouvrir();
    await attendre(() => A.etat.statut === 'connecte' && docA.p.ev.length > 0, 'A connecté');
    B.ouvrir();
    await attendre(() => B.etat.statut === 'connecte' && docB.p.ev.length > 0, 'B connecté');
    expect(json(docA.p)).toBe(json(docB.p));
    await attendre(() => A.etat.membres.some((m) => m.nom === 'Bruno'), 'A voit Bruno arriver');
    expect(B.etat.membres.map((m) => m.nom).sort()).toEqual(['Alice', 'Bruno']);
    expect(A.etat.vous?.role).toBe('regie');
  }, 30_000);

  it('chat : le message d’Alice arrive chez Bruno', async () => {
    const ack = await A.chat('Bonsoir la régie');
    expect(ack.statut).toBe('ok');
    await attendre(() => B.etat.chat.some((m) => m.texte === 'Bonsoir la régie' && m.nom === 'Alice'), 'chat chez B');
  });

  it('modification propagée de A vers B, sans écho chez A', async () => {
    const ecrituresA = docA.ecritures;
    const m0 = docA.p.ev[0]!.id;
    docA.modifier((p) => { p.ev[0]!.name = 'Prologue revu par Alice'; p.ev[0]!.st[0]!.k[1] = 73; });
    await attendre(() => docB.p.ev.find((m) => m.id === m0)?.name === 'Prologue revu par Alice', 'nom chez B');
    expect(docB.p.ev[0]!.st[0]!.k[1]).toBe(73);
    await attendre(() => A.etat.enAttente === 0, 'accusés chez A');
    expect(docA.ecritures).toBe(ecrituresA);       // l'écho de sa propre modification ne réécrit pas le local
    expect(json(docA.p)).toBe(json(docB.p));
    const direct = await api.lireDirect(id);
    expect(direct.projet.ev[0]!.name).toBe('Prologue revu par Alice');
  });

  it('conflit en direct : même champ modifié des deux côtés → l’ordre du serveur tranche, les deux convergent', async () => {
    docA.modifier((p) => { p.ev[1]!.name = 'version A'; });
    docB.modifier((p) => { p.ev[1]!.name = 'version B'; p.ev[2]!.name = 'seulement B'; });
    await attendre(() => A.etat.enAttente === 0 && B.etat.enAttente === 0 && json(docA.p) === json(docB.p), 'convergence');
    expect(['version A', 'version B']).toContain(docA.p.ev[1]!.name);
    expect(docA.p.ev[2]!.name).toBe('seulement B');
    const direct = await api.lireDirect(id);
    expect(json(direct.projet)).toBe(json(docA.p));
  });

  it('insertions concurrentes dans le même moment : les deux étapes restent', async () => {
    const etape = (x: string) => ({ id: x, name: x, ty: 'k:scene', c: 9, r: 0, dx: 0, dy: 0, k: [0, 50, 50] });
    docA.modifier((p) => { p.ev[0]!.st.push(etape('etape_alice')); });
    docB.modifier((p) => { p.ev[0]!.st.push(etape('etape_bruno')); });
    await attendre(() => json(docA.p) === json(docB.p) && docA.p.ev[0]!.st.some((e) => e.id === 'etape_bruno') && docB.p.ev[0]!.st.some((e) => e.id === 'etape_alice'), 'deux étapes');
  });

  it('verrou : Bruno tient un moment, la modification d’Alice est refusée et annulée chez elle', async () => {
    const m = docA.p.ev[3]!.id, avant = docA.p.ev[3]!.name;
    expect((await B.verrou('prendre', 'moment:' + m)).statut).toBe('ok');
    await attendre(() => A.etat.verrous.some((v) => v.cible === 'moment:' + m && v.nom === 'Bruno'), 'verrou vu par A');
    docA.modifier((p) => { p.ev[3]!.name = 'interdit'; });
    await attendre(() => A.etat.refus !== null, 'refus');
    expect(A.etat.refus).toContain('Bruno');
    await attendre(() => docA.p.ev[3]!.name === avant, 'retour arrière chez A');
    expect(docB.p.ev[3]!.name).toBe(avant);
    expect((await B.verrou('rendre', 'moment:' + m)).statut).toBe('ok');
  });

  it('conflit d’enregistrement (409) puis fusion : la version externe arrive dans la salle', async () => {
    const v0 = await api.lireProjet(id);                        // version enregistrée lue par un client REST
    const ack = await A.enregistrer('point de répétition');     // la salle enregistre entre-temps
    expect(ack.statut).toBe('ok');
    const v1 = (ack.res as { version: number }).version;
    expect(v1).toBeGreaterThan(v0.version);

    const local = copie(v0.project);
    local.titre = 'Titre posé hors salle';
    const r = await api.enregistrer(id, { version_base: v0.version, project: local });
    expect(r).toEqual({ ok: false, conflit: true, version_actuelle: v1 });

    const f = await enregistrerAvecFusion(api, id, { base: { version: v0.version, projet: v0.project }, local, message: 'fusion' });
    expect(f.fusionne).toBe(true);
    expect(f.version).toBe(v1 + 1);
    expect(f.projet.titre).toBe('Titre posé hors salle');
    expect(f.projet.ev[0]!.name).toBe('Prologue revu par Alice');  // le travail de la salle est gardé
    await attendre(() => docA.p.titre === 'Titre posé hors salle' && docB.p.titre === 'Titre posé hors salle', 'instantané version-externe');
    expect(json(docA.p)).toBe(json(docB.p));
    await attendre(() => A.etat.version === f.version, 'annonce de version');
    const versions = await api.versions(id);
    expect(versions[0]!.version).toBe(f.version);
  });

  it('coupure : A modifie hors ligne, se reconnecte seule, tout repart ; commentaires', async () => {
    A.couper();
    expect(A.etat.statut).toBe('hors-ligne');
    docA.modifier((p) => { p.ev[4]!.name = 'écrit hors ligne'; });
    docB.modifier((p) => { p.ev[5]!.name = 'pendant la coupure'; });
    await attendre(() => A.etat.statut === 'connecte', 'reconnexion de A', 20_000);
    await attendre(() => docB.p.ev[4]!.name === 'écrit hors ligne' && docA.p.ev[5]!.name === 'pendant la coupure', 'resynchronisation');
    await attendre(() => json(docA.p) === json(docB.p), 'convergence après reprise');

    const m = docB.p.ev[0]!.id;
    const c = await B.commenter({ type: 'moment', moment: m }, 'Lumière trop tôt ici');
    expect(c.statut).toBe('ok');
    await attendre(() => A.etat.commentaires.some((x) => x.texte === 'Lumière trop tôt ici' && x.nom === 'Bruno'), 'commentaire chez A');
    const cid = (c.res as { id: string }).id;
    expect((await A.commentaire('resoudre', cid)).statut).toBe('ok');
    await attendre(() => B.etat.commentaires.find((x) => x.id === cid)?.resolu === true, 'résolu chez B');
    expect((await A.commentaire('supprimer', cid)).statut).toBe('refus');  // seul l'auteur supprime
  }, 40_000);

  it('départ : Bruno quitte, Alice le voit partir', async () => {
    B.fermer();
    await attendre(() => !A.etat.membres.some((m) => m.nom === 'Bruno'), 'départ de Bruno');
    A.fermer();
    expect(A.etat.statut).toBe('ferme');
  });
});
