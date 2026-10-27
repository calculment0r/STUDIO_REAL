// Opérations sur le projet (reprises des actions du design : addMoment, splitAt, newAct, mergeAct, delSel…).
// Elles travaillent sur la COPIE que donne modifierProjet(fn) et renvoient, si besoin, un message pour la régie.
import type { Condition, Moment, Projet, TypePiste } from '@studio-real/modele';
import { TYPES_PISTE } from './assets';

import { nouvelId } from './ids';

export const entreesDuMoment = (m: Moment): string[] => (typeof m.entry === 'string' ? [m.entry] : Object.values(m.entry));

/** Nouveau moment après `apresId` (ou en fin) : une étape « scène », passage auto. Renvoie son id. */
export function ajouterMoment(p: Projet, apresId?: string): string {
  let i = apresId ? p.ev.findIndex(x => x.id === apresId) : p.ev.length - 1;
  if (i < 0) i = p.ev.length - 1;
  const prev = p.ev[i];
  const id = nouvelId(p, 'm'), sid = nouvelId(p, 'n');
  const m: Moment = {
    id, act: prev ? prev.act : 0, name: 'Nouveau moment', entry: sid,
    st: [{ id: sid, name: 'Nouvelle étape', ty: 'k:scene', c: 0, r: 0, dx: 0, dy: 0, k: [8, 60, 40] }],
    tr: [], gate: { mode: 'auto', g: [] },
  };
  if (!p.acts.length) p.acts.push({ n: 'Acte' });
  p.ev.splice(i + 1, 0, m);
  p.tracks.forEach(tk => { if (tk.pts) tk.pts[id] = 50; });
  p.ver++;
  return id;
}

export function supprimerEtape(p: Projet, momentId: string, etapeId: string): string | null {
  const m = p.ev.find(x => x.id === momentId);
  if (!m) return null;
  if (entreesDuMoment(m).includes(etapeId)) return 'La première étape d’un moment ne se supprime pas.';
  m.st = m.st.filter(x => x.id !== etapeId);
  m.tr = m.tr.filter(x => x.a !== etapeId && x.b !== etapeId);
  p.ver++;
  return null;
}

export function supprimerSortie(p: Projet, momentId: string, i: number): void {
  const m = p.ev.find(x => x.id === momentId);
  if (m && m.tr[i]) { m.tr.splice(i, 1); p.ver++; }
}

/** Monte (−1) ou descend (+1) une sortie parmi celles de la même étape source ; renvoie son nouvel index. */
export function deplacerSortie(p: Projet, momentId: string, i: number, sens: -1 | 1): number {
  const m = p.ev.find(x => x.id === momentId);
  const s = m?.tr[i];
  if (!m || !s) return i;
  const soeurs = m.tr.filter(x => x.a === s.a), k = soeurs.indexOf(s), j = k + sens;
  if (j < 0 || j >= soeurs.length) return i;
  const i2 = m.tr.indexOf(soeurs[j]);
  m.tr[i] = soeurs[j]; m.tr[i2] = s; p.ver++;
  return i2;
}

export function supprimerMoment(p: Projet, momentId: string): string | null {
  if (p.ev.length < 2) return 'Il faut garder au moins un moment.';
  const i = p.ev.findIndex(x => x.id === momentId);
  if (i < 0) return null;
  const a = p.ev[i].act;
  p.ev.splice(i, 1);
  if (!p.ev.some(x => x.act === a)) { p.acts.splice(a, 1); p.ev.forEach(x => { if (x.act > a) x.act--; }); }
  p.tracks.forEach(tk => {
    if (tk.pts) delete tk.pts[momentId];
    if (tk.clips) tk.clips = tk.clips.filter(c => c.ev !== momentId);
    if (tk.marks) tk.marks = tk.marks.filter(c => c.ev !== momentId);
  });
  p.ver++;
  return null;
}

/** Coupe un moment en deux à l'étape `coupeId` : elle et tout ce qui la suit partent dans un nouveau moment. */
export function couperMoment(p: Projet, momentId: string, coupeId: string): { id?: string; erreur?: string } {
  const i = p.ev.findIndex(x => x.id === momentId), m = p.ev[i];
  if (!m) return {};
  const part = new Set([coupeId]), file = [coupeId];
  while (file.length) { const a = file.shift()!; m.tr.forEach(x => { if (x.a === a && x.b && !part.has(x.b)) { part.add(x.b); file.push(x.b); } }); }
  if (entreesDuMoment(m).some(x => part.has(x))) return { erreur: 'Impossible de couper ici : une branche revient au début.' };
  const id = nouvelId(p, 'm'), etapes = m.st.filter(x => part.has(x.id)), minC = Math.min(...etapes.map(x => x.c));
  etapes.forEach(x => { x.c -= minC; });
  const suite: Moment = {
    id, act: m.act, name: m.name + ' · suite', entry: coupeId, st: etapes,
    tr: m.tr.filter(x => part.has(x.a) && part.has(x.b)), gate: m.gate ?? { mode: 'auto', g: [] },
  };
  m.st = m.st.filter(x => !part.has(x.id));
  m.tr = m.tr.filter(x => !part.has(x.a) && !part.has(x.b));
  m.gate = { mode: 'auto', g: [] };
  p.ev.splice(i + 1, 0, suite);
  p.tracks.forEach(tk => { if (tk.pts) tk.pts[id] = tk.pts[m.id] ?? 50; });
  p.ver++;
  return { id };
}

export function nouvelActeIci(p: Projet, momentId: string): string | null {
  const i = p.ev.findIndex(x => x.id === momentId);
  if (i <= 0) return 'Ce moment ouvre déjà un acte.';
  const a = p.ev[i].act;
  if (p.ev[i - 1].act !== a) return 'Ce moment ouvre déjà un acte.';
  p.acts.splice(a + 1, 0, { n: 'Nouvel acte' });
  p.ev.forEach((x, j) => { if (x.act > a) x.act++; else if (x.act === a && j >= i) x.act = a + 1; });
  p.ver++;
  return null;
}

export function joindreActeAvant(p: Projet, momentId: string): void {
  const m = p.ev.find(x => x.id === momentId);
  if (!m || m.act === 0) return;
  const a = m.act;
  p.ev.forEach(x => { if (x.act === a) x.act = a - 1; else if (x.act > a) x.act--; });
  p.acts.splice(a, 1);
  p.ver++;
}

export function supprimerElementPiste(p: Projet, pisteId: string, elementId: string): void {
  const tk = p.tracks.find(x => x.id === pisteId);
  if (!tk) return;
  if (tk.clips) tk.clips = tk.clips.filter(x => x.id !== elementId);
  if (tk.marks) tk.marks = tk.marks.filter(x => x.id !== elementId);
  p.ver++;
}

export function supprimerPiste(p: Projet, pisteId: string): void {
  p.tracks = p.tracks.filter(x => x.id !== pisteId);
  p.ver++;
}

export function ajouterPiste(p: Projet, type: TypePiste): string {
  const id = nouvelId(p, 't');
  const tk: Projet['tracks'][number] = { id, type, name: TYPES_PISTE[type][0], open: true };
  if (type === 'notes' || type === 'secu') tk.marks = [];
  else if (type === 'curve') { tk.src = 'custom'; tk.pts = {}; p.ev.forEach(e => { tk.pts![e.id] = 50; }); }
  else tk.clips = [];
  p.tracks.push(tk);
  p.ver++;
  return id;
}

/** Note de régie posée sur un moment, à un décalage (s). Renvoie [piste, note]. */
export function ajouterNote(p: Projet, momentId: string, off: number): [string, string] {
  let tk = p.tracks.find(x => x.type === 'notes');
  if (!tk) { tk = { id: nouvelId(p, 't'), type: 'notes', name: TYPES_PISTE.notes[0], open: true, marks: [] }; p.tracks.push(tk); }
  const id = nouvelId(p, 'k');
  (tk.marks ??= []).push({ id, ev: momentId, off: Math.max(0, Math.round(off)), txt: 'Nouvelle note' });
  tk.open = true;
  p.ver++;
  return [tk.id, id];
}

/** Conditions ajoutables à une sortie ou un passage (boutons « + » du design). */
export const CONDITIONS_AJOUTABLES: [string, Condition['k'], number][] = [
  ['DURÉE', 't', 60], ['VOTES', 'quorum', 50], ['TÉLÉPHONES', 'prets', 60], ['SILENCE', 'bruit', 40], ['PUBLIC ASSIS', 'pres', 100],
];
export const nouvelleCondition = (k: string, v: number): Condition => ({ k, op: k === 'bruit' ? '≤' : '≥', v });

/** Plage des rotatifs de condition (RNG du design). */
export const PLAGE_CONDITION: Record<string, [number, number]> = { t: [0, 600], quorum: [0, 100], prets: [0, 100], bruit: [32, 72], pres: [0, 142], assis: [0, 100] };
