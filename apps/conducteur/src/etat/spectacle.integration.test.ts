// Intégration : la régie (etat/spectacle.ts, vrai transport WebSocket) reliée au VRAI serveur de spectacle
// (apps/serveur-spectacle, hôte Node) sur un port éphémère, projet ÉCHO. Un GO de la régie fait avancer la
// représentation du serveur, la `lecture` revient et le magasin la reflète (lecture miroir) ; la salle et le battement
// de l'écran scène reviennent dans etat/acteurs.ts. Aucun serveur ne reste en marche (arrêt dans afterAll).
// Sauter : SR_SANS_SPECTACLE=1.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Projet } from '@studio-real/modele';
import echo from '../../../../projets/echo/echo.conducteur.json';
import { DELAI_ANTI_DOUBLE_GO_MS, avancerDe, useMagasin } from './magasin';
import { etatActeurs, oublierActeurs, resumeSalle } from './acteurs';
import { reglerSpectacle, reinitialiserSpectacle, relierSpectacle, useSpectacle } from './spectacle';

// L'hôte du serveur est chargé dynamiquement : il est écrit pour Node (types, `ws`) et n'entre pas dans le programme
// TypeScript du Conducteur. Ce qu'on en utilise :
interface Serveur {
  port: number;
  representation: { etatLecture(): { moment: string | null; etape: string | null; t: number; retenu?: boolean; prolonge?: number } | null };
  arreter(): Promise<void>;
}
interface ModuleServeur { demarrerServeur(o: Record<string, unknown>): Promise<Serveur> }
interface ModuleConfig { normaliserConfig(x: unknown): Record<string, unknown> }

const SAUTER = process.env.SR_SANS_SPECTACLE === '1';
const s = () => useMagasin.getState();
const projet = (echo as unknown as { project: Projet }).project;
const ids = projet.ev.map(m => m.id);
/** Jetons générés pour ce test (jamais écrits ailleurs que dans le dossier temporaire du serveur). */
const alea = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const JETONS = { regie: 'regie-' + alea(), agent: 'agent-' + alea(), public: 'public-' + alea(), acteurs: { scene: 'scene-' + alea() } as Record<string, string> };

let dossier = '';
let srv: Serveur | null = null;
const sockets: WebSocket[] = [];

beforeAll(async () => {
  if (SAUTER) return;
  dossier = mkdtempSync(join(tmpdir(), 'regie-spectacle-'));
  for (const d of ['tel', 'cond', 'medias']) mkdirSync(join(dossier, d));
  writeFileSync(join(dossier, 'tel', 'index.html'), '<!doctype html><title>Téléphone</title>');
  writeFileSync(join(dossier, 'cond', 'index.html'), '<!doctype html><title>Conducteur</title>');
  const hote = new URL('../../../serveur-spectacle/src/hote/', import.meta.url);
  const { demarrerServeur } = await import(/* @vite-ignore */ new URL('serveur.ts', hote).href) as ModuleServeur;
  const { normaliserConfig } = await import(/* @vite-ignore */ new URL('config.ts', hote).href) as ModuleConfig;
  const config = normaliserConfig({
    spectacle: 'echo-test', port: 0, hote: '127.0.0.1', projet: 'inutile.json', exploitation: 'exploitation',
    medias: { dossier: 'medias' }, clients: { telephone: 'tel', conducteur: 'cond' },
    adresses: { publique: 'https://spectacle.exemple', locale: 'http://127.0.0.1' },
  });
  srv = await demarrerServeur({ config, racine: dossier, jetons: JETONS, projet: structuredClone(projet), alarme: false, version: 'test', console: () => {} });
  // la régie : Écho, mode SPECTACLE
  if (s().mode !== 'repetition') s().changerMode('repetition');
  s().importer(JSON.stringify(echo));
  s().revenirAuDebut();
  s().changerMode('spectacle');
});

afterAll(async () => {
  reinitialiserSpectacle();
  oublierActeurs();
  for (const w of sockets) { try { w.close(); } catch { /* rien */ } }
  await srv?.arreter();
  srv = null;
  if (dossier) rmSync(dossier, { recursive: true, force: true });
});

const attendre = (ms: number) => new Promise(ok => setTimeout(ok, ms));

describe.skipIf(SAUTER)('régie reliée au vrai serveur de spectacle', () => {
  it('relie, envoie les GO, la représentation avance, la lecture revient et le magasin la reflète', async () => {
    const adresse = `http://127.0.0.1:${srv!.port}`;
    reglerSpectacle({ adresse, jetonRegie: JETONS.regie });
    expect(relierSpectacle()).toBe(true);
    await vi.waitFor(() => expect(useSpectacle.getState().ligne).toBe('ouverte'), { timeout: 5000 });
    // bienvenue porte la lecture du serveur : le magasin est calé dessus
    await vi.waitFor(() => expect(s().miroir).toBe(true));
    expect(s().lecture!.moment).toBe(srv!.representation.etatLecture()!.moment);
    // /config.json : l'adresse publique vient du serveur
    await vi.waitFor(() => expect(useSpectacle.getState().reglages.adressePublique).toBe('https://spectacle.exemple'));

    // GO 1 : le spectacle commence (aucun top) ; GO 2 : fin de l'étape et passage « go » → moment 2, sur le SERVEUR
    s().go();
    await attendre(DELAI_ANTI_DOUBLE_GO_MS + 100);
    avancerDe(2);
    s().go();
    await vi.waitFor(() => expect(srv!.representation.etatLecture()!.moment).toBe(ids[1]), { timeout: 5000 });
    await vi.waitFor(() => expect(useSpectacle.getState().enAttente).toHaveLength(0), { timeout: 5000 });
    expect(useSpectacle.getState().dernierAccuse).toMatchObject({ op: 'top', statut: 'ok' });
    // la lecture du serveur revient : la régie est au même endroit que le serveur
    await vi.waitFor(() => expect(s().lecture!.moment).toBe(ids[1]), { timeout: 5000 });
    expect(s().lecture!.etape).toBe(srv!.representation.etatLecture()!.etape);
  });

  it('l’écran scène qui se connecte et bat : son état revient dans etat/acteurs.ts, la salle le compte', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv!.port}/ws`);
    sockets.push(ws);
    const recus: { t: string; vue?: { vseq: number; ecran: string | null } }[] = [];
    ws.onmessage = ev => recus.push(JSON.parse(String(ev.data)));
    await new Promise<void>((ok, ko) => { ws.onopen = () => ok(); ws.onerror = () => ko(new Error('connexion de l’écran scène')); });
    ws.send(JSON.stringify({ t: 'hello', v: 2, role: 'acteur', acteur: 'scene', session: 'scene_integration', jeton: JETONS.acteurs.scene, app: { version: 'test', build: 'test' } }));
    await vi.waitFor(() => expect(recus.some(m => m.t === 'bienvenue')).toBe(true));
    const vue = recus.find(m => m.t === 'bienvenue')!.vue;
    ws.send(JSON.stringify({ t: 'etat', heure: Date.now(), ecran: vue && vue.ecran ? { vseq: vue.vseq, ecran: vue.ecran, depuis: Date.now() } : null, visible: true, rttMs: 21 }));
    await vi.waitFor(() => expect(etatActeurs().scene).toMatchObject({ source: 'serveur', rttMs: 21, app: { version: 'test' } }), { timeout: 5000 });
    await vi.waitFor(() => expect(resumeSalle().resumes.scene?.presents).toBe(1), { timeout: 5000 });
  });

  it('barre de scène : RETENIR et +30 s arrivent au serveur, qui les applique à son lecteur', async () => {
    await vi.waitFor(() => expect(useSpectacle.getState().ligne).toBe('ouverte'), { timeout: 5000 });
    await attendre(DELAI_ANTI_DOUBLE_GO_MS + 100);
    s().retenir(true);
    await vi.waitFor(() => expect(srv!.representation.etatLecture()!.retenu).toBe(true), { timeout: 5000 });
    // la lecture officielle revient : la régie reflète la retenue
    await vi.waitFor(() => expect(s().lecture!.retenu).toBe(true), { timeout: 5000 });
    s().prolonger(30);
    await vi.waitFor(() => expect(srv!.representation.etatLecture()!.prolonge).toBe(30), { timeout: 5000 });
    s().retenir(false);
    await vi.waitFor(() => expect(srv!.representation.etatLecture()!.retenu).toBe(false), { timeout: 5000 });
  });
});
