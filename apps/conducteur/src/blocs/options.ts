// Passage des propriétés d'une étape (ty, rotatifs k, temps t, actif, params) aux options d'un aperçu,
// comme le faisait la planche du design (objet `PV[key]`).
import { dureeEtape } from '@studio-real/modele';
import type { OptionsApercu } from './apercus';
import type { ThemeApercu } from './palette';
import { VOIX } from './simulation';
import type { DefBloc } from './types';

export interface EntreeApercu {
  k?: number[];
  /** Secondes écoulées dans l'étape. */
  t: number;
  actif: boolean;
  params?: Record<string, unknown>;
  /** Démonstration en boucle (bibliothèque, galerie) : l'étape se rejoue toutes les 8 s. */
  boucle?: boolean;
}

const borne = (x: number) => Math.max(0, Math.min(1, x));
const nombre = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function construireOptions(def: DefBloc | undefined, e: EntreeApercu, theme: ThemeApercu, now: number): OptionsApercu {
  const k = e.k && e.k.length ? e.k : [8];
  const dur = dureeEtape({ k });
  const params = e.params;
  let run = e.actif, te = Math.max(0, e.t || 0), prog = borne(te / dur), rem = run ? Math.max(0, dur - te) : dur;
  if (e.boucle) { prog = (now % 8) / 8; te = prog * dur; rem = dur * (1 - prog); run = true; }
  const r0 = def?.reglages[0]?.defaut ?? 50, r1 = def?.reglages[1]?.defaut ?? 50;
  const p = [(k[1] ?? r0) / 100, (k[2] ?? r1) / 100];
  const fini = !run && prog >= 1;

  let val = nombre(params?.valeur);
  if (val == null && def?.apercu === 'k:attente') val = run ? 142 * (1 - Math.exp(-te / Math.max(20, dur / 3))) : fini ? 142 : 0;
  if (val == null && def?.apercu === 'k:calage') val = run ? 32 + 40 * Math.exp(-te / Math.max(10, dur / 3)) : fini ? 32 : 72;

  const issue = String(params?.issue ?? 'A');
  const lab = issue === 'T' ? '=' : issue;
  const chosen = typeof params?.choisie === 'boolean' ? params.choisie : run || fini;
  const pct = nombre(params?.pct) ?? (issue === 'B' ? VOIX.B : issue === 'A' ? VOIX.A : VOIX.C);

  const couleur = typeof params?.couleur === 'string' ? params.couleur : def ? def.couleur[theme] : '#8fa5ad';
  const gst = typeof params?.etatArret === 'string' ? params.etatArret : run ? 'ARMÉ' : fini ? 'PASSAGE' : 'RETENU';
  return {
    k: couleur, run, live: run, cur: run, p, prog, rem, dur, te, val, lab, chosen, pct,
    asset: String(params?.asset ?? params?.nom ?? ''), gst, params,
  };
}
