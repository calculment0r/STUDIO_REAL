// Temps de la conduite : format MM:SS et positions prévues des moments (chemin principal).
// Le calcul suit sched() du design (Studio Real Conducteur.dc.html) : chaque étape dure au moins sa durée prévue,
// sinon jusqu'à l'instant où la salle simulée remplit la sortie ; une étape qui ne peut pas sortir compte
// « durée + 10:00 » ; un passage est prêt quand toutes ses conditions le sont (10:00 au plus), puis un passage « go »
// ajoute l'attente mesurée (Projet.hold).
// Blocs à événements extérieurs (signal, machine, message, quand le comédien dit) : durée prévue et sortie nominale
// (reçu, confirmé, lu, dit) ; chrono : sa durée (moins 10 s si « 10 s restantes » est branchée) ; point de reprise :
// 0 s ; séquence : parcours linéaire de la séquence (dureeSequence), durées × durée globale.
import type { Condition, Moment, Projet, SalleSimulee, Sortie } from './types';
import { dureeEtape } from './types';
import { JAMAIS, instantFranchissement, issueSalle, votesSalle } from './salle';
import { comparer } from './conditions';
import {
  appliquerMemoire, comportementBloc, dureeSequence, issuesExaequo, poidsExaequo, poidsTirage, reglagesBoucle,
  reglagesChrono, reglagesGarde, reglagesMemoire, reglagesSequence, reglagesTirage, sortieApresSequence, sortiesBoucle,
  sortiesChrono, sortiesComedien, sortiesGarde, sortiesMachine, sortiesMessage, sortiesSignal, trouverSequence,
} from './blocs-moteur';

/** Plafond d'attente d'un passage dont les conditions ne viennent pas, et surcoût d'une étape bloquée (design : 600 s). */
export const PLAFOND_ATTENTE = 600;
/** Durée comptée pour un moment sans étape (design : 10 s). */
export const DUREE_MOMENT_VIDE = 10;

/** Temps en MM:SS entiers, jamais de décimale (fm() du design). Les minutes dépassent 99 si besoin. */
export function formatMMSS(s: number): string {
  const v = Math.max(0, Math.floor((Number.isFinite(+s) ? +s : 0) + 1e-6));
  return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
}

export interface OptionsPlanning {
  /** Salle simulée utilisée pour estimer les franchissements (défaut : projet.sens). */
  sens?: SalleSimulee;
  /** Issue du vote supposée (défaut : celle de la salle simulée). */
  issue?: string;
  /** Attentes mesurées aux passages « go » (défaut : projet.hold). */
  attentes?: Record<string, number>;
  /** Mémoires de départ (défaut : projet.memoires). */
  memoires?: Record<string, number | string | boolean>;
}

export interface EtapePrevue { id: string; debut: number; fin: number; sortie: Sortie | null; bloque: boolean }
export interface PassagePrevu { mode: 'auto' | 'go'; debut: number; pret: number; fin: number; attente: number }
export interface MomentPrevu {
  id: string;
  index: number;
  /** début et fin prévus du moment (fin = sortie de la dernière étape, avant le passage) */
  debut: number;
  fin: number;
  etapes: EtapePrevue[];
  /** passage vers le moment suivant (absent pour le dernier moment) */
  passage?: PassagePrevu;
}
export interface Planning { moments: MomentPrevu[]; total: number; issue: string }

type Memoires = Record<string, number | string | boolean>;

/** Instant de franchissement d'une condition, pour la planification. */
function franchissement(g: Condition, sens: SalleSimulee, issue: string, memoires: Memoires): number {
  if (g.k === 'issue') return comparer(g.op, issue, g.v) ? 0 : JAMAIS;
  if (typeof g.k === 'string' && g.k.startsWith('mem:')) return comparer(g.op, memoires[g.k.slice(4)] ?? 0, g.v) ? 0 : JAMAIS;
  return instantFranchissement(g, sens);
}
function franchissementSortie(s: Sortie, sens: SalleSimulee, issue: string, memoires: Memoires): number {
  if (!s.g.length) return 0;
  const c = s.g.map(g => franchissement(g, sens, issue, memoires));
  return s.mode === 'any' ? Math.min(...c) : Math.max(...c);
}

/** Étape d'entrée d'un moment pour une issue donnée (table : issue, puis 'T', puis la première). */
export function entreeMoment(m: Pick<Moment, 'entry'>, issue?: string): string | undefined {
  if (typeof m.entry === 'string') return m.entry || undefined;
  if (!m.entry || typeof m.entry !== 'object') return undefined;
  if (issue !== undefined && m.entry[issue]) return m.entry[issue];
  return m.entry.T ?? Object.values(m.entry)[0];
}

/** Choix de sortie d'une étape normale, cohérent avec le lecteur : à la fin de la durée prévue, la première sortie
 *  (dans l'ordre) déjà remplie gagne ; sinon celle qui se remplit la première. */
function choisirSortie(outs: Sortie[], d: number, fr: (s: Sortie) => number): { s: Sortie | null; c: number } {
  if (!outs.length) return { s: null, c: 0 };
  const cs = outs.map(fr);
  const i0 = cs.findIndex(c => c <= d);
  if (i0 >= 0) return { s: outs[i0] ?? null, c: cs[i0] ?? 0 };
  let bi = 0;
  cs.forEach((c, i) => { if (c < (cs[bi] ?? JAMAIS)) bi = i; });
  return { s: outs[bi] ?? null, c: cs[bi] ?? JAMAIS };
}

/** Positions prévues de tous les moments selon le chemin principal. */
export function planifier(projet: Projet, opts: OptionsPlanning = {}): Planning {
  const sens = opts.sens ?? projet.sens;
  const issue = opts.issue ?? issueSalle(sens);
  const attentes = opts.attentes ?? projet.hold ?? {};
  let memoires: Memoires = { ...(opts.memoires ?? projet.memoires ?? {}) };
  let T = 0;
  const moments: MomentPrevu[] = [];

  projet.ev.forEach((ev, i) => {
    const debut = T;
    const etapes: EtapePrevue[] = [];
    const vus: Record<string, number> = {};
    const tours: Record<string, number> = {};
    let sid = entreeMoment(ev, issue);
    let pas = 0;
    while (sid && pas++ < 1000) {
      const st = ev.st.find(x => x.id === sid);
      if (!st) break;
      vus[sid] = (vus[sid] ?? 0) + 1;
      const d = dureeEtape(st);
      const outs = ev.tr.filter(x => x.a === st.id);
      const fr = (s: Sortie) => franchissementSortie(s, sens, issue, memoires);
      const comp = comportementBloc(st.ty);
      let sortie: Sortie | null = null;
      let ex = d;
      let bloque = false;
      let encore = false;
      if (comp === 'memoire') memoires = appliquerMemoire(memoires, reglagesMemoire(st));
      if (comp === 'garde') {
        const { conditions, delai } = sortiesGarde(outs);
        const lim = Math.max(d, reglagesGarde(st).delai);
        const ch = choisirSortie(conditions, d, fr);
        if (ch.s && ch.c <= lim) { sortie = ch.s; ex = Math.max(d, ch.c); } else { sortie = delai ?? null; ex = lim; }
      } else if (comp === 'signal' || comp === 'machine' || comp === 'message' || comp === 'comedien') {
        sortie = (comp === 'signal' ? sortiesSignal(outs).recu : comp === 'machine' ? sortiesMachine(outs).confirme
          : comp === 'message' ? sortiesMessage(outs).lu : sortiesComedien(outs).dit) ?? null;
      } else if (comp === 'chrono') {
        const r = reglagesChrono(st);
        const { zero, dixSecondes } = sortiesChrono(outs);
        const dix = !!dixSecondes && r.duree > 10;
        sortie = (dix ? dixSecondes : zero) ?? null;
        ex = dix ? r.duree - 10 : r.duree;
      } else if (comp === 'reprise') {
        sortie = outs.find(o => !o.g.length) ?? outs[0] ?? null;
        ex = 0;
      } else if (comp === 'sequence') {
        const r = reglagesSequence(st);
        const seq = trouverSequence(projet.sequences, r.sequence);
        ex = seq ? dureeSequence(projet.sequences, seq, r.facteur) : 0;
        sortie = sortieApresSequence(outs, undefined) ?? null;
      } else if (comp === 'tirage') {
        const rt = reglagesTirage(st);
        let p = poidsTirage(st, outs);
        if (rt.exaequo) p = poidsExaequo(p, outs, issuesExaequo(votesSalle(sens), issue, rt.ecart));
        let bi = 0;
        p.forEach((v, j) => { if (v > (p[bi] ?? 0)) bi = j; });
        sortie = outs[bi] ?? null;
      } else if (comp === 'boucle') {
        const { encore: enc, termine } = sortiesBoucle(outs);
        const n = (tours[st.id] = (tours[st.id] ?? 0) + 1);
        const r = reglagesBoucle(st);
        const fini = n >= Math.min(r.tours, r.borne) || (!!termine && termine.g.length > 0 && fr(termine) <= d);
        if (fini || !enc) { sortie = termine ?? null; tours[st.id] = 0; } else { sortie = enc; encore = true; }
      } else {
        const ch = choisirSortie(outs, d, fr);
        sortie = ch.s;
        bloque = ch.c >= JAMAIS / 10;
        ex = bloque ? d + PLAFOND_ATTENTE : Math.max(d, ch.c);
      }
      etapes.push({ id: st.id, debut: T, fin: T + ex, sortie, bloque });
      T += ex;
      sid = sortie && sortie.b ? sortie.b : undefined;
      // Un cycle ordinaire s'arrête au second passage (comme le design) ; une boucle peut repasser.
      if (sid && (vus[sid] ?? 0) > 0 && !encore && !Object.keys(tours).some(b => (tours[b] ?? 0) > 0)) break;
    }
    if (!etapes.length) T += DUREE_MOMENT_VIDE;
    const mp: MomentPrevu = { id: ev.id, index: i, debut, fin: T, etapes };
    if (i < projet.ev.length - 1) {
      const g = ev.gate ?? { mode: 'auto', g: [] };
      const cc = g.g.length ? Math.max(...g.g.map(x => franchissement(x, sens, issue, memoires))) : 0;
      const pret = T + Math.min(cc, PLAFOND_ATTENTE);
      const attente = g.mode === 'go' ? Math.max(0, attentes[ev.id] ?? 0) : 0;
      mp.passage = { mode: g.mode, debut: T, pret, fin: pret + attente, attente };
      T = pret + attente;
    }
    moments.push(mp);
  });
  return { moments, total: T, issue };
}

/** Durée prévue d'un moment (étapes du chemin principal, sans le passage). */
export function dureeMoment(projet: Projet, momentId: string, opts?: OptionsPlanning): number {
  const m = planifier(projet, opts).moments.find(x => x.id === momentId);
  return m ? m.fin - m.debut : 0;
}

/** Durée totale prévue du spectacle (passages et attentes compris). */
export function dureeTotale(projet: Projet, opts?: OptionsPlanning): number {
  return planifier(projet, opts).total;
}

/** Début et fin prévus de chaque moment (id → [début, fin du passage]) pour placer les moments sur la conduite. */
export function positionsMoments(projet: Projet, opts?: OptionsPlanning): Record<string, { debut: number; fin: number; finPassage: number }> {
  const out: Record<string, { debut: number; fin: number; finPassage: number }> = {};
  for (const m of planifier(projet, opts).moments) out[m.id] = { debut: m.debut, fin: m.fin, finPassage: m.passage?.fin ?? m.fin };
  return out;
}
