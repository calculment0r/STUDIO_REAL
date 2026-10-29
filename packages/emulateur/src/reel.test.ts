// L'émulateur branché sur un VRAI serveur de spectacle (hôte Node, port éphémère, vraie WebSocket) : 40 faux
// téléphones, un GO, un vote à 60 %, 10 % de coupures. Le temps est le temps réel (le test dure une dizaine de
// secondes). Si le port ne peut pas être ouvert (environnement fermé), les tests sont sautés en le disant.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projetBanc } from './banc-test';
import { creerEmulateur, type EmulateurReel } from './emulateur';

/** Ce que le test utilise du serveur (l'hôte n'est pas dans le graphe de types de ce paquet : import dynamique). */
interface ServeurSpectacle { port: number; sante(): Record<string, unknown>; arreter(): Promise<void> }
const HOTE = '../../../apps/serveur-spectacle/src/hote/';

const JETONS = { regie: 'jeton-regie-de-test-0123456789', acteur: 'jeton-acteur-de-test-0123456789', agent: 'jeton-agent-de-test-0123456789' };

let dossier = '';
let srv: ServeurSpectacle | null = null;
let indisponible: string | null = null;

beforeAll(async () => {
  try {
    dossier = mkdtempSync(join(tmpdir(), 'emulateur-reel-'));
    for (const d of ['tel', 'cond', 'medias']) mkdirSync(join(dossier, d));
    const { normaliserConfig } = await import(/* @vite-ignore */ `${HOTE}config`) as { normaliserConfig: (x: unknown) => unknown };
    const { demarrerServeur } = await import(/* @vite-ignore */ `${HOTE}serveur`) as {
      demarrerServeur: (o: Record<string, unknown>) => Promise<ServeurSpectacle>;
    };
    const config = normaliserConfig({
      spectacle: 'banc', port: 0, hote: '127.0.0.1', projet: 'inutile.json', exploitation: 'exploitation',
      medias: { dossier: 'medias' }, clients: { telephone: 'tel', conducteur: 'cond' },
    });
    srv = await demarrerServeur({ config, racine: dossier, jetons: JETONS, projet: projetBanc(), sansReprise: true, version: 'test', console: () => {} });
  } catch (e) {
    indisponible = (e as Error).message;
  }
});

afterAll(async () => {
  await srv?.arreter();
  if (dossier) rmSync(dossier, { recursive: true, force: true });
});

/** Attend qu'une condition soit vraie (temps réel), ou échoue avec `quoi`. */
async function attendre(quoi: string, cond: () => boolean, ms = 8000): Promise<void> {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error(`Délai dépassé : ${quoi}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

describe('émulateur sur un vrai serveur (WebSocket)', () => {
  it('40 téléphones, un GO, vote à 60 %, 10 % de coupures : tous reconnectés, accusés sous 2 s, aucun refus', async ctx => {
    if (indisponible) ctx.skip(`serveur de test impossible à démarrer (${indisponible})`);
    const emu: EmulateurReel = creerEmulateur({
      projet: projetBanc(), graine: 7, population: { nombre: 40, melange: 'rapides' }, arrivees: { surS: 2 }, auto: false,
      transport: { url: `ws://127.0.0.1:${srv!.port}/ws`, jeton: JETONS.acteur, jetonRegie: JETONS.regie },
    });
    try {
      await emu.demarrer();
      const public_ = () => emu.telephones().filter(t => t.etat().genre === 'public');
      await attendre('les 40 téléphones en ligne', () => public_().filter(t => t.etat().enLigne).length === 40);
      expect(srv!.sante()).toMatchObject({ ok: true });
      expect(emu.bilan()).toMatchObject({ population: 40, arrives: 40, connectes: 40, horsLigne: 0 });
      await attendre('la lecture reçue par la régie', () => emu.bilan().lecture?.moment === 'm1');

      // un GO : l'accueil laisse la place au vote ; tous les téléphones l'affichent et l'accusent
      emu.go();
      await attendre('le vote affiché partout', () => public_().every(t => t.etat().ecran?.type === 'vote'));
      expect(emu.bilan().lecture).toMatchObject({ moment: 'm1', etape: 'vote' });
      expect(emu.vueDe('public')).toMatchObject({ ecran: 'vote' });

      // 60 % des téléphones votent (en 2 s) ; 10 % sont coupés 2 s
      const votants = emu.faireVoter({ repartition: { A: 70, B: 30 }, dansS: 2, part: 0.6 });
      expect(votants).toBeGreaterThanOrEqual(15);
      expect(votants).toBeLessThanOrEqual(33);
      const coupes = emu.coupure({ part: 0.1, dureeS: 2 });
      expect(coupes).toHaveLength(4);
      await attendre('les coupés hors ligne', () => emu.bilan().horsLigne >= 1, 3000);
      await attendre('tous reconnectés', () => emu.bilan().connectes === 40 && emu.mesures().reconnexions.reussies >= 4, 15_000);
      await attendre('les votes arrivés', () => Object.values(emu.bilan().votes).reduce((a, b) => a + b, 0) >= votants - coupes.length, 5000);

      const m = emu.mesures();
      expect(m.reconnexions).toMatchObject({ pertes: 4, reussies: 4, ratees: 0, enCours: 0 });
      expect(m.accuses.n).toBeGreaterThanOrEqual(40 * 2);   // l'accueil puis le vote, par téléphone
      expect(m.accuses.p95).toBeLessThan(2000);
      expect(m.refus.total, JSON.stringify(m.refus.exemples)).toBe(0);
      expect(m.entrees.vote).toBeGreaterThanOrEqual(votants - coupes.length);
      expect(m.messages.recus).toBeGreaterThan(80);
      expect(m.lecture.n).toBeGreaterThan(0);
      expect(emu.bilan().latenceAck).toMatchObject({ n: expect.any(Number) });
    } finally {
      await emu.arreter();
    }
  }, 20_000);

  it('avancer(ms) est sans effet et le dit ; le jeton de régie manque : conduite et go refusent clairement', async ctx => {
    if (indisponible) ctx.skip(`serveur de test impossible à démarrer (${indisponible})`);
    const emu = creerEmulateur({
      projet: projetBanc(), graine: 1, population: { nombre: 2, melange: 'rapides' }, arrivees: 'toutes', auto: false,
      transport: { url: `ws://127.0.0.1:${srv!.port}/ws`, jeton: JETONS.acteur },
    });
    const avis: string[] = [];
    const avertir = console.warn;
    console.warn = (...a: unknown[]) => { avis.push(a.join(' ')); };
    try {
      await emu.demarrer();
      const avant = emu.maintenant();
      await emu.avancer(60_000);
      expect(emu.maintenant() - avant).toBeLessThan(5000);
      expect(avis.join('\n')).toMatch(/sans effet/);
      expect(() => emu.conduite({ op: 'top' })).toThrow(/jeton de la régie/);
      expect(() => emu.go()).not.toThrow();   // go() ne bloque pas : l'erreur est dite sur la console
    } finally {
      console.warn = avertir;
      await emu.arreter();
    }
  }, 20_000);
});
