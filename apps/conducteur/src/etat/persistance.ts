// Persistance locale (localStorage) et échange JSON au format « studio-real/conducteur@1 ».
// C'est la forme à stocker côté serveur (D1 pour `project`, R2 pour les médias d'`assets`) : le jour où l'API
// existe, seules ces fonctions changent.
import { FORMAT, type CategorieAssets, type Execution, type FichierConducteur, type Projet } from '@studio-real/modele';

const CLE_VERSIONS = 'sr-conducteur-versions';
const CLE_COURANT = 'sr-conducteur-courant';
const MAX_VERSIONS = 12;

export interface VersionLocale { n: string; d: string; data: FichierConducteur }

export function emballer(project: Projet, assets: CategorieAssets[], runs: Execution[]): FichierConducteur {
  return { format: FORMAT, project, assets, runs };
}

/** Contrôle minimal d'un projet lu (stockage local ou fichier importé). */
export function projetValide(p: unknown): p is Projet {
  const x = p as Projet | null;
  return !!x && Array.isArray(x.acts) && Array.isArray(x.ev) && Array.isArray(x.tracks) && !!x.sens
    && typeof x.nid === 'number' && x.ev.every(m => typeof m.id === 'string' && Array.isArray(m.st) && Array.isArray(m.tr) && !!m.gate);
}

export function lireFichier(texte: string): FichierConducteur {
  let f: Partial<FichierConducteur>;
  try { f = JSON.parse(texte); } catch { throw new Error('Fichier illisible : ce n’est pas du JSON.'); }
  if (f.format !== FORMAT) throw new Error('Format inconnu : « ' + String(f.format ?? '—') + ' » (attendu ' + FORMAT + ').');
  if (!projetValide(f.project)) throw new Error('Projet incomplet dans le fichier.');
  const project = f.project;
  project.hold ??= {}; project.go ??= {}; project.ver ??= 1;
  return { format: FORMAT, project, assets: Array.isArray(f.assets) ? f.assets : [], runs: Array.isArray(f.runs) ? f.runs : [] };
}

export function telecharger(fichier: FichierConducteur, nom = 'conducteur.json'): void {
  const blob = new Blob([JSON.stringify(fichier, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

export function lireVersions(): VersionLocale[] {
  try { const l = JSON.parse(localStorage.getItem(CLE_VERSIONS) ?? '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}

export function ecrireVersions(l: VersionLocale[]): boolean {
  try { localStorage.setItem(CLE_VERSIONS, JSON.stringify(l.slice(0, MAX_VERSIONS))); return true; } catch { return false; }
}

/** Le projet en cours, enregistré à chaque modification (reprise après rechargement). */
export function lireCourant(): FichierConducteur | null {
  try {
    const t = localStorage.getItem(CLE_COURANT);
    return t ? lireFichier(t) : null;
  } catch { return null; }
}

let minuteur: ReturnType<typeof setTimeout> | undefined;
export function ecrireCourant(f: FichierConducteur): void {
  clearTimeout(minuteur);
  minuteur = setTimeout(() => { try { localStorage.setItem(CLE_COURANT, JSON.stringify(f)); } catch { /* stockage plein : on garde la mémoire */ } }, 500);
}

export function oublierCourant(): void {
  clearTimeout(minuteur);
  try { localStorage.removeItem(CLE_COURANT); } catch { /* rien */ }
}
