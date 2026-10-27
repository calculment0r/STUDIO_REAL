// Règles de verrouillage par personne (PURES). Voir PROTOCOLE.md § Verrous et mode Scène.
//
// Cibles :  'projet'          → tout le projet (la régie pendant la représentation)
//           'moment:<id>'     → un moment (ses étapes, sorties, passage)
//           'piste:<id>'      → une piste de la conduite
//           'lecture'         → le droit de diffuser l'état de lecture (régie → postes)
//
// Règles :
//  1. Un verrou appartient à une personne (pas à un onglet) : il survit à une reconnexion.
//  2. Une modification est refusée si elle touche une cible verrouillée par quelqu'un d'autre
//     (ou si quelqu'un d'autre tient 'projet').
//  3. En mode Scène ('jouer'), une modification est refusée si son auteur ne tient pas un verrou qui la couvre :
//     le projet est gelé, sauf pour qui l'a verrouillé.
//  4. On ne peut pas prendre 'projet' si d'autres tiennent des verrous, ni un verrou partiel si un autre tient 'projet'.
//  5. « forcer » ne réussit que si le détenteur n'est plus connecté.
import { resoudreChemin, type Op } from './ops';

export type ModeSalle = 'ecrire' | 'repeter' | 'jouer';
export const MODES: readonly ModeSalle[] = ['ecrire', 'repeter', 'jouer'];

export interface Verrou { cible: string; personne: string; nom: string; pris_le: number }

export type Verdict = { ok: true } | { ok: false; raison: string };
const OK: Verdict = { ok: true };
const non = (raison: string): Verdict => ({ ok: false, raison });

const RE_CIBLE = /^(projet|lecture|(moment|piste):[\w.:-]{1,64})$/;
export const cibleValide = (c: unknown): c is string => typeof c === 'string' && RE_CIBLE.test(c);

/** Cible touchée par un chemin de modification. */
export function cibleDeChemin(doc: unknown, chemin: Op['chemin']): string {
  const tete = chemin[0];
  if ((tete === 'ev' || tete === 'tracks') && chemin.length >= 2) {
    const seg = chemin[1]!;
    let id: string | undefined;
    if (typeof seg === 'object') id = seg.id;
    else {
      const res = resoudreChemin(doc, chemin.slice(0, 2));
      const tableau = (doc as Record<string, unknown> | null)?.[tete];
      if (res.length === 2 && Array.isArray(tableau)) {
        const e = tableau[res[1] as number] as { id?: unknown } | undefined;
        if (typeof e?.id === 'string') id = e.id;
      }
    }
    // Insérer un nouvel élément (index hors tableau, '-') touche la liste entière : c'est le projet.
    if (id) return `${tete === 'ev' ? 'moment' : 'piste'}:${id}`;
  }
  return 'projet';
}

export const ciblesDesOps = (doc: unknown, ops: Op[]): string[] => [...new Set(ops.map((o) => cibleDeChemin(doc, o.chemin)))];

const tient = (verrous: Verrou[], personne: string, cible: string) =>
  verrous.some((v) => v.personne === personne && v.cible === cible);

export function peutModifier(personne: string, cibles: string[], verrous: Verrou[], mode: ModeSalle): Verdict {
  for (const c of cibles) {
    const autre = verrous.find((v) => v.personne !== personne && (v.cible === 'projet' || v.cible === c));
    if (autre) return non(`verrouille:${autre.cible}:${autre.nom}`);
    if (mode === 'jouer' && !tient(verrous, personne, 'projet') && !tient(verrous, personne, c)) return non('mode-scene');
  }
  return OK;
}

export function peutDiffuserLecture(personne: string, role: string, verrous: Verrou[], mode: ModeSalle): Verdict {
  if (tient(verrous, personne, 'lecture') || tient(verrous, personne, 'projet')) return OK;
  const autre = verrous.find((v) => v.personne !== personne && (v.cible === 'lecture' || v.cible === 'projet'));
  if (autre) return non(`verrouille:${autre.cible}:${autre.nom}`);
  if (mode === 'jouer') return non('mode-scene');
  return role === 'regie' ? OK : non('role-regie-requis');
}

export function peutPrendre(personne: string, cible: string, verrous: Verrou[]): Verdict {
  if (!cibleValide(cible)) return non('cible-invalide');
  const actuel = verrous.find((v) => v.cible === cible);
  if (actuel) return actuel.personne === personne ? OK : non(`verrouille:${cible}:${actuel.nom}`);
  const autres = verrous.filter((v) => v.personne !== personne);
  if (cible === 'projet' && autres.some((v) => v.cible !== 'lecture')) return non('autres-verrous-actifs');
  const projet = autres.find((v) => v.cible === 'projet');
  if (projet && cible !== 'lecture') return non(`verrouille:projet:${projet.nom}`);
  return OK;
}

export function peutForcer(cible: string, verrous: Verrou[], connectes: Set<string>): Verdict {
  const actuel = verrous.find((v) => v.cible === cible);
  if (!actuel) return non('aucun-verrou');
  return connectes.has(actuel.personne) ? non('detenteur-connecte') : OK;
}

export function peutChangerMode(personne: string, actuel: ModeSalle, verrous: Verrou[]): Verdict {
  const projet = verrous.find((v) => v.cible === 'projet');
  if (actuel === 'jouer' && projet && projet.personne !== personne) return non(`verrouille:projet:${projet.nom}`);
  return OK;
}
