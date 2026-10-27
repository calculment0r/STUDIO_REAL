// SEUL point d'import du chantier BLOCS dans la planche (contrat : src/blocs/index.ts → `CATALOGUE`, `<ApercuBloc />`).
// Pour rebrancher sur une autre source, il suffit de changer cet import et ces deux fonctions.
import { memo } from 'react';
import { ApercuBloc, CATALOGUE, formaterReglage, rotatifsParDefaut, type DefBloc } from '../blocs';

export type ThemePlanche = 'sombre' | 'clair';

export interface InfoReglage { nom: string; formater: (position: number) => string }

export interface InfoBloc {
  /** Micro-étiquette (« ATTENTE », « QUAND »…). */
  label: string;
  nom: string;
  /** Couleur d'accent de la famille, déclinée pour le thème (vient du catalogue, jamais en dur ici). */
  couleur: string;
  reglages: InfoReglage[];
  description: string;
}

const PAR_TY = new Map<string, DefBloc>(CATALOGUE.blocs.map(b => [b.ty, b]));
const NOM_FAMILLE = new Map<string, string>(CATALOGUE.familles.map(f => [f.id, f.nom]));
const CACHE = new Map<string, InfoBloc>();

export function infoBloc(ty: string, theme: ThemePlanche): InfoBloc {
  const cle = theme + '|' + ty;
  const deja = CACHE.get(cle);
  if (deja) return deja;
  const b = PAR_TY.get(ty);
  const info: InfoBloc = b
    ? {
      label: (b.base ? b.cle : (NOM_FAMILLE.get(b.famille) ?? b.famille)).toUpperCase(),
      nom: b.nom,
      couleur: theme === 'clair' ? b.couleur.clair : b.couleur.sombre,
      reglages: b.reglages.slice(0, 2).map(r => ({ nom: r.nom, formater: (p: number) => formaterReglage(r, p) })),
      description: b.description,
    }
    : { label: 'BLOC', nom: 'bloc', couleur: 'var(--fam-autre)', reglages: [], description: '' };
  CACHE.set(cle, info);
  return info;
}

export interface ProprietesApercu { ty: string; k: number[]; t: number; actif: boolean; theme: ThemePlanche; echelle: number }

/** Aperçu vivant d'une étape (216 × 92, dans le bloc). */
export const ApercuEtape = memo(function ApercuEtape({ ty, k, t, actif, theme, echelle }: ProprietesApercu) {
  return <ApercuBloc ty={ty} k={k} t={t} actif={actif} theme={theme} echelle={echelle} />;
});

// ── Bibliothèque (+ BLOC, clic droit) ──
export interface EntreeBibliotheque { ty: string; nom: string; couleur: string; k: number[] }
export interface FamilleBibliotheque { id: string; nom: string; couleur: string; blocs: EntreeBibliotheque[] }

/** Les blocs du catalogue rangés par famille, dans l'ordre du catalogue. */
export function bibliotheque(theme: ThemePlanche): FamilleBibliotheque[] {
  return CATALOGUE.familles.map(f => ({
    id: f.id, nom: f.nom, couleur: theme === 'clair' ? f.couleur.clair : f.couleur.sombre,
    blocs: CATALOGUE.blocs.filter(b => b.famille === f.id).map(b => ({
      ty: b.ty, nom: b.nom, couleur: theme === 'clair' ? b.couleur.clair : b.couleur.sombre, k: rotatifsParDefaut(b),
    })),
  })).filter(f => f.blocs.length);
}
