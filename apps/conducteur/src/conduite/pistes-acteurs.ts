// Pistes par acteur de la conduite (audit 2026-10, rapport 2 §4.2 c) : logique PURE, testée dans pistes-acteurs.test.ts.
// Une piste par acteur, DÉRIVÉE des envois (rien n'est écrit dans le projet) : des pavés colorés par écran le long du
// temps prévu (le plan de la conduite, qui suit le parcours prévu par le moteur). Même règle que vueActeur : à chaque
// instant l'acteur montre le dernier écran envoyé qui est encore montré (un écran « tenir: false » cesse à la fin de son
// étape, l'acteur retrouve alors le dernier écran tenu).
// Les pistes affichées sont un réglage d'affichage du poste (useInterface.pistesActeurs), pas une donnée du projet :
// TypePiste du modèle n'est pas touché, les projets existants restent tels quels.
import { cibleDansFoule, resoudreParams, type Envoi } from '@studio-real/modele';
import type { Plan } from './planning';
import { resumeEnvoi } from '../planche/acteurs';

export interface PaveActeur {
  /** début et fin (s, temps de la conduite) */
  S: number;
  E: number;
  ecran: string;
  /** libellé du pavé (« vote 1 », « mur · vote Q3 ») */
  nom: string;
  moment: string;
  etape: string;
  /** index de l'envoi dans etape.envois */
  index: number;
  /** false : écran montré le temps de l'étape seulement */
  tenu: boolean;
  /** envoi ciblé dans la foule (« public:ont-vote:A ») : ne concerne qu'une partie de l'acteur */
  partiel: boolean;
}

interface EvenementEnvoi { t: number; finEtape: number; ordre: number; envoi: Envoi; moment: string; etape: string; index: number; params: Record<string, unknown> }

/** Envois (avec écran) à l'acteur le long du plan, datés : entrée, entrée + délai (s'il tient dans l'étape), sortie. */
function evenements(plan: Plan, acteur: string): EvenementEnvoi[] {
  const out: EvenementEnvoi[] = [];
  let ordre = 0;
  for (const pm of plan.evs) for (const c of pm.run) {
    const l = Array.isArray(c.st.envois) ? c.st.envois : [];
    l.forEach((envoi, index) => {
      if (!envoi || typeof envoi.ecran !== 'string' || !envoi.ecran) return;
      if (cibleDansFoule(envoi.vers)?.acteur !== acteur) return;
      const q = envoi.quand;
      let t: number;
      if (q === 'sortie') t = c.E;
      else if (q && typeof q === 'object' && typeof (q as { apres?: unknown }).apres === 'number') {
        t = c.S + Math.max(0, (q as { apres: number }).apres);
        if (t > c.E) return;   // l'étape finit avant : l'envoi ne part pas
      } else t = c.S;
      out.push({ t, finEtape: c.E, ordre: ordre++, envoi, moment: pm.ev.id, etape: c.st.id, index, params: resoudreParams(envoi.params, c.st) });
    });
  }
  // ordre d'envoi : par instant, puis ordre écrit (entrée, délais, sortie d'une même étape)
  return out.sort((a, b) => a.t - b.t || a.ordre - b.ordre);
}

/** L'écran montré à l'instant x : le dernier envoi parti (t ≤ x) encore montré (tenu, ou étape pas finie). */
function montreA(ev: EvenementEnvoi[], x: number): EvenementEnvoi | null {
  for (let i = ev.length - 1; i >= 0; i--) {
    const e = ev[i]!;
    if (e.t > x) continue;
    if (e.envoi.tenir === false && x >= e.finEtape) continue;
    return e;
  }
  return null;
}

/** Les pavés de la piste d'un acteur, de 0 à la fin du plan. Deux envois successifs identiques font un seul pavé. */
export function pistesActeur(plan: Plan, acteur: string): PaveActeur[] {
  const ev = evenements(plan, acteur);
  if (!ev.length) return [];
  const fin = Math.max(plan.total, ...ev.map(e => e.finEtape));
  const bornes = [...new Set([...ev.map(e => e.t), ...ev.filter(e => e.envoi.tenir === false).map(e => e.finEtape), fin])]
    .filter(x => x <= fin).sort((a, b) => a - b);
  const out: PaveActeur[] = [];
  for (let i = 0; i < bornes.length - 1; i++) {
    const S = bornes[i]!, E = bornes[i + 1]!;
    if (E - S < 1e-6) continue;
    const e = montreA(ev, S);
    if (!e) continue;
    const prec = out[out.length - 1];
    const meme = prec && prec.E === S && prec.moment === e.moment && prec.etape === e.etape && prec.index === e.index;
    if (meme) { prec.E = E; continue; }
    out.push({
      S, E, ecran: e.envoi.ecran!, nom: resumeEnvoi({ ...e.envoi, params: e.params }), moment: e.moment, etape: e.etape, index: e.index,
      tenu: e.envoi.tenir !== false, partiel: !!cibleDansFoule(e.envoi.vers)?.filtre,
    });
  }
  return out;
}

/** Jetons de couleur des pavés : un par écran, stable (même écran = même couleur dans toutes les pistes). */
const TEINTES = ['--fam-ui', '--fam-scene', '--fam-data', '--fam-trig', '--fam-flow', '--fam-cible', '--fam-gate', '--fam-fx'];
const FIXES: Record<string, string> = { noir: 'var(--ink3)', veille: 'var(--ink3)', regardez: 'var(--fam-flow)', vote: 'var(--fam-data)', mur: 'var(--fam-scene)' };

export function couleurEcran(ecran: string): string {
  if (FIXES[ecran]) return FIXES[ecran]!;
  let h = 0;
  for (const ch of ecran) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return `var(${TEINTES[h % TEINTES.length]})`;
}
