// Serveur de spectacle LOCAL pour la répétition : un vrai hôte (le même code que `npm run dev:spectacle`), lancé dans un
// processus enfant par repetition.ts quand on ne donne pas de --cible. Port libre, jetons jetables, dossier
// d'exploitation temporaire (rien n'est écrit dans exploitation/ du dépôt), projet Écho préparé comme le fait l'hôte.
// Le parent parle à cet enfant par IPC : { t: 'pret', port, jetons } à l'ouverture ; { t: 'mesure' } → { t: 'mesure', … }
// (CPU et mémoire de CE processus, donc du serveur seul) ; { t: 'arret' } → arrêt propre puis sortie.
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliserConfig } from '../../apps/serveur-spectacle/src/hote/config';
import { demarrerServeur } from '../../apps/serveur-spectacle/src/hote/serveur';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const jeton = (role: string) => `rep_${role}_${randomBytes(24).toString('hex')}`;

const dossier = mkdtempSync(join(tmpdir(), 'repetition-serveur-'));
for (const d of ['tel', 'cond', 'medias']) mkdirSync(join(dossier, d));
const jetons = { regie: jeton('regie'), public: jeton('public'), agent: jeton('agent'), acteurs: {} as Record<string, string> };
const config = normaliserConfig({
  spectacle: 'repetition', port: 0, hote: '127.0.0.1', projet: process.env.REPETITION_PROJET || 'projets/echo/echo.conducteur.json',
  exploitation: join(dossier, 'exploitation'), medias: { dossier: join(dossier, 'medias') },
  clients: { telephone: join(dossier, 'tel'), conducteur: join(dossier, 'cond') },
});

if (typeof process.send !== 'function') throw new Error('serveur-local.ts se lance depuis repetition.ts (processus enfant avec IPC).');

const serveur = await demarrerServeur({ config, racine: RACINE, jetons, sansReprise: true, version: 'repetition', console: () => {} });
let arret = false;
const arreter = async () => {
  if (arret) return;
  arret = true;
  try { await serveur.arreter(); } finally {
    rmSync(dossier, { recursive: true, force: true });
    process.exit(0);
  }
};

process.on('message', (m: { t?: string }) => {
  if (m.t === 'mesure') {
    const c = process.cpuUsage();
    const mem = process.memoryUsage();
    process.send!({ t: 'mesure', ts: Date.now(), cpuUs: c.user + c.system, rss: mem.rss, heap: mem.heapUsed });
  } else if (m.t === 'arret') void arreter();
});
process.on('disconnect', () => { void arreter(); });
process.on('uncaughtException', e => { console.error('Serveur local : exception', e); void arreter(); });

process.send({ t: 'pret', port: serveur.port, jetons });
