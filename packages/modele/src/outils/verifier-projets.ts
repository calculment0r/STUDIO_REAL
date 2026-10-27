// Vérifie tous les projets du dépôt (projets/**/*.conducteur.json) et l'exemple de démonstration.
// Usage : npm run verifier -w @studio-real/modele   (code de sortie 1 s'il y a au moins une erreur)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { chargerFichier, validerProjet, type Probleme } from '../valider';
import { exempleDemo } from '../exemple';

interface Processus { cwd(): string; exitCode?: number }
const processus = (globalThis as unknown as { process: Processus }).process;

/** Racine du dépôt : premier dossier parent dont le package.json déclare des workspaces. */
function racineDepot(depart: string): string {
  let d = depart;
  for (;;) {
    const pj = join(d, 'package.json');
    if (existsSync(pj)) {
      try { if (JSON.parse(readFileSync(pj, 'utf8')).workspaces) return d; } catch { /* on continue */ }
    }
    const parent = dirname(d);
    if (parent === d) return depart;
    d = parent;
  }
}

function chercher(dossier: string, out: string[] = []): string[] {
  if (!existsSync(dossier)) return out;
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dossier, e.name);
    if (e.isDirectory()) chercher(p, out);
    else if (e.isFile() && e.name.endsWith('.conducteur.json')) out.push(p);
  }
  return out;
}

function afficher(nom: string, problemes: Probleme[]): number {
  const erreurs = problemes.filter(p => p.niveau === 'erreur');
  const avts = problemes.filter(p => p.niveau === 'avertissement');
  console.log(`${erreurs.length ? 'ERREUR' : 'OK    '}  ${nom}  (${erreurs.length} erreur(s), ${avts.length} avertissement(s))`);
  for (const p of problemes) console.log(`        ${p.niveau === 'erreur' ? '✗' : '!'} ${p.message}`);
  return erreurs.length;
}

const racine = racineDepot(processus.cwd());
let total = afficher('exemple de démonstration (exempleDemo)', validerProjet(exempleDemo()));
const fichiers = chercher(join(racine, 'projets'));
for (const f of fichiers) {
  const nom = relative(racine, f);
  try {
    total += afficher(nom, validerProjet(chargerFichier(readFileSync(f, 'utf8')).project));
  } catch (e) {
    total += afficher(nom, [{ niveau: 'erreur', code: 'chargement', message: (e as Error).message }]);
  }
}
console.log(`\n${fichiers.length} fichier(s) projet + l'exemple vérifiés · ${total} erreur(s).`);
if (total) processus.exitCode = 1;
