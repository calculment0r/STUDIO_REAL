// Ce que la coquille calcule pour l'affichage : nature des blocs, libellés des conditions, « où en est-on ».
import { dureeEtape, type Condition, type EtatLecture, type Projet, type Signaux, type Sortie } from '@studio-real/modele';
import { trouverBloc, trouverFamille, formaterReglage, type DefBloc } from '../blocs';
import { conditionRemplie, entreeDuMoment, issueSalle, prevoir, valeurCondition } from '../etat/moteur';
import { mmss, romain } from '../theme/format';
import { libelleSignal } from '../planche/geometrie';

// ─── blocs ────────────────────────────────────────────────────────────────────────────────────────────
export interface InfoBloc { nature: string; nom: string; couleur: string; reglages: { nom: string; aff: (pos: number) => string }[] }

export function infoBloc(ty: string, clair: boolean): InfoBloc {
  const b: DefBloc | undefined = trouverBloc(ty);
  if (!b) return { nature: ty.replace(/^k:/, '').toUpperCase(), nom: ty, couleur: 'var(--fam-autre)', reglages: [] };
  const nature = b.base ? b.cle : (trouverFamille(b.famille)?.nom ?? b.famille).toUpperCase();
  return {
    nature, nom: b.nom, couleur: clair ? b.couleur.clair : b.couleur.sombre,
    reglages: b.reglages.slice(0, 2).map(r => ({ nom: r.nom, aff: (pos: number) => formaterReglage(r, pos) })),
  };
}

// ─── conditions ───────────────────────────────────────────────────────────────────────────────────────
export function libelleCondition(g: Condition): string {
  const v = Number(g.v);
  switch (g.k) {
    case 'issue': return 'le public choisit ' + (g.v === 'T' ? 'égalité' : String(g.v));
    case 'pres': return 'au moins ' + Math.round(v) + ' spectateurs assis';
    case 'quorum': return Math.round(v) + ' % des votes reçus';
    case 'prets': return Math.round(v) + ' % des téléphones prêts';
    case 'bruit': return 'salle calme · ≤ ' + Math.round(v) + ' dB';
    case 'assis': return Math.round(v) + ' % du public assis';
    case 't': return 'après ' + mmss(v);
    default: return g.k.startsWith('mem:') ? 'mémoire ' + g.k.slice(4) + ' ' + g.op + ' ' + String(g.v) : libelleSignal(g) ?? g.k + ' ' + g.op + ' ' + String(g.v);
  }
}

export function formatSignal(k: string, val: unknown): string {
  if (val === undefined || val === null) return '—';
  if (typeof val === 'string') return val;
  const v = Number(val);
  switch (k) {
    case 'pres': return String(Math.round(v));
    case 'quorum': case 'prets': case 'assis': return Math.round(v) + ' %';
    case 'bruit': return Math.round(v) + ' dB';
    case 't': return mmss(v);
    default: return String(Math.round(v * 10) / 10);
  }
}

export const regleSortie = (s: Sortie, plusieurs: boolean, long = false): string =>
  s.g.length ? s.g.map(libelleCondition).join(s.mode === 'any' ? ' ou ' : ' et ')
    : plusieurs ? (long ? 'sinon · à la fin de l’étape' : 'sinon · à la fin') : (long ? 'à la fin de l’étape' : 'à la fin');

// ─── où en est-on ─────────────────────────────────────────────────────────────────────────────────────
export interface LigneSituation { lab: string; val: string; ok: boolean; enCours: boolean; progres: number }
export interface Situation {
  tag: string; nom: string; sous: string;
  reste: number; resteLab: string; progres: number;
  ensuite: string; regle: string;
  lignes: LigneSituation[];
  /** index du moment courant, passage en cours, top possible maintenant */
  index: number; enPassage: boolean; peutGo: boolean; termine: boolean;
  /** passage « go » du moment courant : P{n}, et temps avant qu'il soit prêt (s) */
  passageGo: number | null; avantPret: number;
  acte: string; moment: string; etape: string;
}

const ligneCondition = (g: Condition, sig: Signaux, tau: number, mem: Record<string, unknown>): LigneSituation => {
  const ok = conditionRemplie(g, sig, tau, mem);
  if (g.k === 'issue' || g.k.startsWith('mem:')) return { lab: libelleCondition(g), val: ok ? 'oui' : 'non', ok, enCours: false, progres: ok ? 1 : 0 };
  const cur = Number(valeurCondition(g.k, sig, tau, mem) ?? 0), v = Number(g.v);
  const progres = g.op === '≤' || g.op === '<' ? (72 - cur) / Math.max(1, 72 - v) : cur / Math.max(1, v);
  return { lab: libelleCondition(g), val: formatSignal(g.k, cur), ok, enCours: !ok, progres: Math.max(0, Math.min(1, progres)) };
};

/** État affiché par « Où en est-on » et le pupitre ; sans lecture, la position de départ. */
export function situation(projet: Projet, lecture: EtatLecture | null, sig: Signaux): Situation {
  const prev = prevoir(projet);
  const e: EtatLecture = lecture ?? {
    t: 0, moment: projet.ev[0]?.id ?? null, etape: projet.ev[0] ? entreeDuMoment(projet.ev[0], issueSalle(projet.sens)) ?? null : null,
    tEtape: 0, attenteGo: false, retard: 0, bloque: false, termine: false, memoires: {}, parcours: [],
  };
  const index = Math.max(0, projet.ev.findIndex(m => m.id === e.moment));
  const m = projet.ev[index];
  const vide: Situation = {
    tag: '', nom: 'Aucun moment', sous: '', reste: 0, resteLab: '', progres: 0, ensuite: '', regle: '', lignes: [], index: 0,
    enPassage: false, peutGo: false, termine: true, passageGo: null, avantPret: 0, acte: '', moment: '', etape: '',
  };
  if (!m) return vide;
  const acte = 'Acte ' + romain(m.act) + ' · ' + (projet.acts[m.act]?.n ?? '');
  const dernier = index >= projet.ev.length - 1;
  const mp = prev.moments[index];
  const goIci = !dernier && m.gate.mode === 'go';
  const tau = e.tEtape, mem = e.memoires ?? {};

  if (e.termine) {
    return { ...vide, tag: 'moment ' + (index + 1), nom: 'Fin du spectacle', sous: m.name, ensuite: '—', acte, moment: m.name, etape: '', index, progres: 1 };
  }

  if (!e.etape) {
    // passage entre deux moments
    const suivant = projet.ev[index + 1];
    const lignes = m.gate.g.map(g => ligneCondition(g, sig, tau, mem));
    if (goIci) lignes.push({ lab: 'top donné par la régie', val: 'attente', ok: false, enCours: true, progres: 0 });
    const attente = mp?.passage ? Math.max(0, mp.passage.pret - mp.passage.debut) : 0;
    const attendu = goIci && e.attenteGo;
    return {
      tag: 'passage P' + (index + 1), nom: 'Passage P' + (index + 1),
      sous: 'Entre « ' + m.name + ' » et « ' + (suivant?.name ?? 'fin') + ' »',
      reste: attendu ? (e.attentes?.[m.id] ?? Math.max(0, tau - attente)) : Math.max(0, attente - tau),
      resteLab: attendu ? 'ON ATTEND LE TOP' : 'AVANT QUE CE SOIT PRÊT',
      progres: attente > 0 ? Math.min(1, tau / attente) : 1,
      ensuite: suivant?.name ?? 'fin du spectacle',
      regle: goIci ? 'Ce passage attend le top de la régie, une fois les conditions remplies.' : 'Ce passage enchaîne tout seul dès que les conditions sont remplies.',
      lignes, index, enPassage: true, peutGo: goIci, termine: false,
      passageGo: goIci ? index + 1 : null, avantPret: attendu ? 0 : Math.max(0, attente - tau),
      acte, moment: m.name, etape: 'Passage P' + (index + 1),
    };
  }

  const st = m.st.find(x => x.id === e.etape);
  if (!st) return { ...vide, acte, moment: m.name, index };
  const d = dureeEtape(st);
  const ep = mp?.etapes.find(x => x.id === st.id);
  const prevue = ep ? ep.fin - ep.debut : d;
  const sorties = m.tr.filter(x => x.a === st.id);
  const tr = sorties.find(x => !x.g.length || x.g.every(g => conditionRemplie(g, sig, tau, mem))) ?? sorties[0];
  const lignes: LigneSituation[] = [{ lab: 'durée prévue ' + mmss(d), val: mmss(Math.min(tau, d)), ok: tau >= d, enCours: tau < d, progres: Math.min(1, tau / d) }];
  tr?.g.forEach(g => lignes.push(ligneCondition(g, sig, tau, mem)));
  const ensuite = tr ? (tr.b ? m.st.find(x => x.id === tr.b)?.name ?? '?' : (dernier ? 'fin du spectacle' : 'Passage P' + (index + 1)))
    : (dernier ? 'fin du spectacle' : 'Passage P' + (index + 1));
  // temps avant que le passage « go » de ce moment soit prêt : reste de l'étape + étapes prévues après + attente du passage
  let avantPret = Math.max(0, prevue - tau);
  if (mp && ep) {
    const i = mp.etapes.indexOf(ep);
    mp.etapes.slice(i + 1).forEach(x => { avantPret += x.fin - x.debut; });
    if (mp.passage) avantPret += mp.passage.pret - mp.passage.debut;
  }
  const n = m.st.indexOf(st) + 1;
  return {
    tag: 'moment ' + (index + 1) + ' · étape ' + n, nom: st.name, sous: m.name,
    reste: Math.max(0, prevue - tau), resteLab: 'AVANT LA SUITE', progres: Math.min(1, tau / Math.max(1, prevue)),
    ensuite,
    regle: e.bloque ? 'Bloqué : une condition ne peut pas être remplie avec la salle actuelle.'
      : !tr || !tr.g.length ? 'On passe à la suite quand la durée prévue est écoulée.'
      : tr.g.some(g => g.k === 'issue') ? 'Le vote décide de la branche. La durée prévue doit aussi être écoulée.'
      : tr.mode === 'any' ? 'Il suffit qu’une des conditions soit remplie, après la durée prévue.'
      : 'Il faut que toutes les conditions soient remplies, après la durée prévue.',
    lignes, index, enPassage: false, peutGo: false, termine: false,
    passageGo: goIci ? index + 1 : null, avantPret, acte, moment: m.name, etape: st.name,
  };
}

