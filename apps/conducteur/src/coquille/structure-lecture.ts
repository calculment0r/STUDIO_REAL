// La STRUCTURE de la lecture vue par les composants (lot performance-react) : ce qui change à un GO, à une pause, à une
// attente du top, à une mémoire posée… et JAMAIS parce que le temps passe. Un composant qui lit ceci n'est ré-exécuté que
// quand la structure change ; ce qui dépend du temps passe par l'horloge (etat/horloge.ts), arrondie.
//
//   useStructure()        les scalaires de `lecture` (moment, étape, attente du GO…), comparés valeur à valeur
//   lectureDepuis(…)      une `EtatLecture` COMPLÈTE reconstruite à partir de la structure et du temps donné, pour les
//                         fonctions pures de la coquille (situation, vueBarre, etatRepresentation, prochainCue) qui
//                         attendent une lecture entière ; ne contient ni journal, ni mémoires, ni alertes
//   useSituationVive()    « Où en est-on » : `situation()` recalculée au quart de seconde au plus
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SIGNAUX_VIDES, type EtatLecture } from '@studio-real/modele';
import { useMagasin, type Magasin } from '../etat/magasin';
import { useHorloge } from '../etat/horloge';
import { situation, type Situation } from './derive';

export interface StructureLecture {
  moment: string | null;
  etape: string | null;
  phase: 'etape' | 'passage' | 'fin' | undefined;
  attenteGo: boolean;
  bloque: boolean;
  termine: boolean;
  retenu: boolean;
  prolonge: number;
  /** nombre de passages joués (le parcours lui-même n'est pas copié) */
  nParcours: number;
}

/** Sélecteur de la structure (à passer à useShallow : l'objet est neuf à chaque appel, ses champs sont comparés). */
export const structureDe = (s: Pick<Magasin, 'lecture'>): StructureLecture | null => {
  const l = s.lecture;
  if (!l) return null;
  return {
    moment: l.moment, etape: l.etape, phase: l.phase, attenteGo: l.attenteGo, bloque: l.bloque, termine: l.termine,
    retenu: !!l.retenu, prolonge: l.prolonge ?? 0, nParcours: l.parcours?.length ?? 0,
  };
};

/** La structure de la lecture ; ne change que si l'un de ses champs change. */
export function useStructure(): StructureLecture | null {
  return useMagasin(useShallow(structureDe));
}

const PARCOURS_FACTICES = new Map<number, [string, string, number][]>();
const parcoursDeLongueur = (n: number): [string, string, number][] => {
  let p = PARCOURS_FACTICES.get(n);
  if (!p) { p = Array.from({ length: n }, () => ['', '', 0] as [string, string, number]); PARCOURS_FACTICES.set(n, p); }
  return p;
};

/** Une EtatLecture complète pour les fonctions pures qui en attendent une (voir l'en-tête). `attentes` : celles de l'horloge. */
export function lectureDepuis(
  st: StructureLecture | null, temps: { t: number; tEtape: number; retard?: number; attentes?: Record<string, number> } = { t: 0, tEtape: 0 },
): EtatLecture | null {
  if (!st) return null;
  return {
    t: temps.t, tEtape: temps.tEtape, retard: temps.retard ?? 0, moment: st.moment, etape: st.etape, attenteGo: st.attenteGo,
    bloque: st.bloque, termine: st.termine, memoires: {}, parcours: parcoursDeLongueur(st.nParcours),
    ...(st.phase ? { phase: st.phase } : {}), ...(temps.attentes ? { attentes: temps.attentes } : {}), retenu: st.retenu, prolonge: st.prolonge,
  };
}

/**
 * « Où en est-on » (situation) recalculée quand le projet ou la structure change, ou toutes les `pas` secondes du temps
 * passé dans l'étape (le quart de seconde par défaut : 4 rendus par seconde au plus, jamais 60). Les signaux de la salle
 * sont ceux de l'instant du calcul.
 */
export function useSituationVive(pas = 0.25): Situation {
  const projet = useMagasin(s => s.projet);
  const st = useStructure();
  const cran = useHorloge(h => Math.floor(h.tEtape / pas + 1e-9));
  return useMemo(() => {
    const h = useHorloge.getState();
    return situation(projet, lectureDepuis(st, h), useMagasin.getState().signaux());
  }, [projet, st, cran]);   // eslint-disable-line react-hooks/exhaustive-deps -- `cran` ne sert qu'à déclencher le recalcul
}

/** La situation « de structure » : ce qui n'en dépend pas du temps (acte, moment, étape, passage GO). Sans signaux. */
export function useSituationFixe(): Situation {
  const projet = useMagasin(s => s.projet);
  const st = useStructure();
  return useMemo(() => situation(projet, lectureDepuis(st), SIGNAUX_VIDES), [projet, st]);
}
