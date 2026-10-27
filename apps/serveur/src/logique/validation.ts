// Validation des corps REST (PURE).
import { FORMAT, type CategorieAssets, type Execution, type FichierConducteur, type Projet } from '@studio-real/modele';

export class ErreurValidation extends Error {
  constructor(public readonly code: string, message: string, public readonly statut = 400) { super(message); }
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Contrôle de forme minimal d'un projet `studio-real/conducteur@1` (le détail appartient au modèle). */
export function validerProjet(p: unknown): Projet {
  if (!estObjet(p)) throw new ErreurValidation('projet-invalide', 'project : objet attendu');
  for (const champ of ['acts', 'ev', 'tracks'] as const) {
    if (!Array.isArray(p[champ])) throw new ErreurValidation('projet-invalide', `project.${champ} : tableau attendu`);
  }
  if (!estObjet(p.sens)) throw new ErreurValidation('projet-invalide', 'project.sens : objet attendu');
  for (const m of p.ev as unknown[]) {
    if (!estObjet(m) || typeof m.id !== 'string' || !Array.isArray(m.st) || !Array.isArray(m.tr)) {
      throw new ErreurValidation('projet-invalide', 'project.ev : moments {id, st[], tr[]} attendus');
    }
  }
  return p as unknown as Projet;
}

export function validerAssets(a: unknown): CategorieAssets[] {
  if (a === undefined) return [];
  if (!Array.isArray(a) || !a.every((c) => estObjet(c) && typeof c.k === 'string' && Array.isArray(c.items))) {
    throw new ErreurValidation('assets-invalides', 'assets : [{k, n, items[]}] attendu');
  }
  return a as CategorieAssets[];
}

/** Fichier d'échange complet (import). */
export function validerFichier(f: unknown): FichierConducteur {
  if (!estObjet(f) || f.format !== FORMAT) throw new ErreurValidation('format-invalide', `format « ${FORMAT} » attendu`);
  const runs = f.runs === undefined ? [] : f.runs;
  if (!Array.isArray(runs)) throw new ErreurValidation('runs-invalides', 'runs : tableau attendu');
  return { format: FORMAT, project: validerProjet(f.project), assets: validerAssets(f.assets), runs: runs.map(validerExecution) };
}

export function validerExecution(r: unknown): Execution {
  if (!estObjet(r)) throw new ErreurValidation('run-invalide', 'exécution : objet attendu');
  if (typeof r.id !== 'string' || !RE_ID_RUN.test(r.id)) throw new ErreurValidation('run-invalide', 'id : [A-Za-z0-9_-]{1,64}');
  if (r.mode !== 'repetition' && r.mode !== 'scene') throw new ErreurValidation('run-invalide', 'mode : repetition | scene');
  if (!Number.isFinite(r.debut)) throw new ErreurValidation('run-invalide', 'debut : horodatage ms');
  const evenements = r.evenements === undefined ? [] : validerEvenements(r.evenements);
  return { id: r.id, mode: r.mode, debut: r.debut as number, evenements };
}

export const RE_ID_RUN = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_EVENEMENTS_PAR_ENVOI = 1000;

export function validerEvenements(e: unknown): Execution['evenements'] {
  if (!Array.isArray(e)) throw new ErreurValidation('evenements-invalides', 'evenements : tableau attendu');
  if (e.length > MAX_EVENEMENTS_PAR_ENVOI) throw new ErreurValidation('trop-d-evenements', `au plus ${MAX_EVENEMENTS_PAR_ENVOI} événements par envoi`, 413);
  for (const ev of e) {
    if (!estObjet(ev) || !Number.isFinite(ev.t) || typeof ev.type !== 'string' || ev.type.length > 64) {
      throw new ErreurValidation('evenements-invalides', 'événement : {t: nombre, type: texte, …} attendu');
    }
  }
  return e as Execution['evenements'];
}

/** Nom de média : lettres (accents compris), chiffres, espace, . _ - ; pas de chemin. */
const RE_NOM_MEDIA = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,119}$/u;
export function validerNomMedia(nom: string): string {
  const n = nom.normalize('NFC');
  if (!RE_NOM_MEDIA.test(n) || n.includes('..')) throw new ErreurValidation('nom-invalide', 'nom de média : 1 à 120 caractères (lettres, chiffres, espace . _ -)');
  return n;
}

/** Types de médias acceptés (son, image, vidéo, texte, données). */
export function typeMediaAccepte(type: string): boolean {
  const t = type.split(';')[0]!.trim().toLowerCase();
  if (t === 'image/svg+xml') return false; // SVG = script possible sur notre origine
  return /^(audio|video|image)\/[\w.+-]+$/.test(t) || ['text/plain', 'text/csv', 'application/json', 'application/pdf', 'application/octet-stream'].includes(t);
}

export const RE_ID_PROJET = /^p_[A-Za-z0-9]{10,32}$/;
