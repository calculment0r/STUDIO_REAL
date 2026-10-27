// Branchement du moteur de lecture (chantier MODÈLE) : LE SEUL endroit où la coquille appelle le moteur.
// @studio-real/modele exporte creerLecteur, signauxSalle (contrat moteur.ts), planifier, votesSalle, issueSalle,
// entreeMoment. Pour changer de moteur (serveur, signaux réels de la salle), on ne touche qu'à ce fichier.
import {
  creerLecteur as creerLecteurModele, signauxSalle as signauxSalleModele, planifier,
  votesSalle as votesSalleModele, issueSalle as issueSalleModele, entreeMoment,
  type Condition, type FabriqueLecteur, type FonctionSignauxSalle, type Moment, type Projet, type SalleSimulee, type Signaux,
} from '@studio-real/modele';

export const creerLecteur: FabriqueLecteur = (projet, options) => creerLecteurModele(projet, options);

/** Signaux de la salle simulée ; t = temps passé dans l'étape (ou le passage) en cours. Sans graine : les valeurs
 *  exactes du design (mêmes que les positions prévues). */
export const signauxSalle: FonctionSignauxSalle = (sens, t, graine) => signauxSalleModele(sens, t, graine);

// ─── Positions prévues ────────────────────────────────────────────────────────────────────────────────
export interface EtapePrevue { id: string; debut: number; fin: number }
export interface PassagePrevu { mode: 'auto' | 'go'; debut: number; pret: number; fin: number }
export interface MomentPrevu { id: string; index: number; debut: number; fin: number; etapes: EtapePrevue[]; passage?: PassagePrevu }
export interface Prevision { moments: MomentPrevu[]; total: number }

const cachePrevision = new WeakMap<Projet, Prevision>();

/** Positions prévues des moments (chemin principal, salle simulée) ; mémorisé par projet. */
export function prevoir(projet: Projet): Prevision {
  const deja = cachePrevision.get(projet);
  if (deja) return deja;
  const p: Prevision = planifier(projet);
  cachePrevision.set(projet, p);
  return p;
}

// ─── Votes de la salle simulée ────────────────────────────────────────────────────────────────────────
export const votesSalle = (sens: SalleSimulee): { A: number; B: number; C: number } => votesSalleModele(sens);
export const issueSalle = (sens: SalleSimulee): 'A' | 'B' | 'T' => issueSalleModele(sens);

// ─── Conditions (affichage « Où en est-on ») ──────────────────────────────────────────────────────────
export function valeurCondition(k: string, sig: Signaux, tEtape: number, memoires: Record<string, unknown> = {}): number | string | undefined {
  if (k === 't') return tEtape;
  if (k === 'issue') return sig.issue;
  if (k.startsWith('mem:')) return memoires[k.slice(4)] as number | string | undefined;
  return (sig as unknown as Record<string, number>)[k];
}
function comparer(op: Condition['op'], a: unknown, b: unknown): boolean {
  if (op === '=') return String(a) === String(b);
  if (op === '≠') return String(a) !== String(b);
  const x = Number(a), y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return op === '≥' ? x >= y - 0.01 : op === '≤' ? x <= y + 0.01 : op === '>' ? x > y : x < y;
}
export const conditionRemplie = (g: Condition, sig: Signaux, tEtape: number, mem?: Record<string, unknown>): boolean =>
  comparer(g.op, valeurCondition(g.k, sig, tEtape, mem), g.v);

export const entreeDuMoment = (m: Pick<Moment, 'entry'>, issue?: string): string | undefined => entreeMoment(m, issue);
