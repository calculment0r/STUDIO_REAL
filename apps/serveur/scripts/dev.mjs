// Lancement local : applique les migrations D1 (base locale simulée), puis `wrangler dev --local`.
// Si l'interface (apps/conducteur/dist) n'est pas encore construite, sert la page d'attente ./attente.
// Arguments supplémentaires transmis à wrangler dev (ex. npm run dev -w serveur -- --port 8790).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(dirname(fileURLToPath(import.meta.url)));
const wrangler = join(dirname(createRequire(import.meta.url).resolve('wrangler/package.json')), 'bin', 'wrangler.js');
const lancer = (args) => spawnSync(process.execPath, [wrangler, ...args], { cwd: ici, stdio: 'inherit' }).status ?? 1;

const statut = lancer(['d1', 'migrations', 'apply', 'DB', '--local']);
if (statut !== 0) process.exit(statut);

const args = ['dev', '--local', ...process.argv.slice(2)];
if (!existsSync(join(ici, '..', 'conducteur', 'dist'))) {
  console.log('\n[serveur] apps/conducteur/dist absent : page d\'attente servie à la place (npm run build pour l\'interface).\n');
  args.push('--assets', './attente');
}
process.exit(lancer(args));
