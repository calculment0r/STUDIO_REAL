// Modifications du projet depuis la conduite. Fonctions pures sur un brouillon de projet : on les appelle dans
// `modifierProjet(p => …)` du magasin (qui passe une copie). Testées dans edition.test.ts.
//
// Les clips et repères des pistes sont accrochés à un moment (ev) avec un décalage (off) : quand on insère ou coupe
// un moment, on note d'abord leur temps absolu, puis on les raccroche au moment qui joue à ce temps (le design :
// absAll / reanchor), pour qu'ils restent à leur place sur la conduite.
import type { Moment, Piste, Projet, TypePiste } from '@studio-real/modele';
import { debuts, entrees, indiceMomentA, limiteProche, planifier, type Plan } from './planning';
import { TYPES_PISTE } from './types-pistes';

type Clip = NonNullable<Piste['clips']>[number];
type Repere = NonNullable<Piste['marks']>[number];
type Element = Clip | Repere;

export interface Resultat { ok: boolean; message: string; id?: string }

import { nouvelId } from '../etat/ids';

/** Le temps absolu de chaque clip et repère. */
export function positionsAbsolues(p: Projet, plan: Plan = planifier(p)): [Element, number][] {
  const S = debuts(plan);
  const out: [Element, number][] = [];
  p.tracks.forEach((tk) => (tk.clips ?? tk.marks ?? []).forEach((it: Element) => out.push([it, (S[it.ev] ?? 0) + it.off])));
  return out;
}

/** Accroche un clip ou un repère au moment qui joue au temps `abs`. */
export function ancrer(it: Element, abs: number, plan: Plan): void {
  const i = indiceMomentA(plan, abs);
  if (i < 0) return;
  const e = plan.evs[i];
  it.ev = e.ev.id;
  it.off = Math.max(0, Math.round(abs - e.S));
}

function reancrer(p: Projet, avant: [Element, number][]): void {
  const plan = planifier(p);
  avant.forEach(([it, abs]) => ancrer(it, abs, plan));
}

function momentVide(p: Projet, act: number): Moment {
  const id = nouvelId(p, 'm'), sid = nouvelId(p, 'n');
  return {
    id, act, name: 'Nouveau moment', entry: sid,
    st: [{ id: sid, name: 'Nouvelle étape', ty: 'k:scene', c: 0, r: 0, dx: 0, dy: 0, k: [8, 60, 40] }],
    tr: [], gate: { mode: 'auto', g: [] },
  };
}

/** Insère un moment vide à l'index donné (0 → n), dans l'acte du moment qui le précède. */
export function insererMoment(p: Projet, index: number): string {
  const avant = positionsAbsolues(p);
  const k = Math.max(0, Math.min(p.ev.length, index));
  const voisin = p.ev[k - 1] ?? p.ev[k];
  const ne = momentVide(p, voisin ? voisin.act : 0);
  if (!p.acts.length) p.acts.push({ n: 'Nouvel acte' });
  p.ev.splice(k, 0, ne);
  p.tracks.forEach((tk) => { if (tk.pts) tk.pts[ne.id] = 50; });
  reancrer(p, avant);
  return ne.id;
}

/** « Nouveau moment ici » : à la limite entre moments la plus proche de t. */
export function nouveauMomentIci(p: Projet, t: number): string {
  return insererMoment(p, limiteProche(planifier(p), t));
}

/** « + » en fin de rangée des moments. */
export function ajouterMomentFin(p: Projet): string {
  return insererMoment(p, p.ev.length);
}

/** « + » en fin de rangée des actes : un nouvel acte, avec un premier moment. */
export function ajouterActeFin(p: Projet): string {
  p.acts.push({ n: 'Nouvel acte' });
  const ne = momentVide(p, p.acts.length - 1);
  p.ev.push(ne);
  p.tracks.forEach((tk) => { if (tk.pts) tk.pts[ne.id] = 50; });
  return ne.id;
}

/** « Couper ici » : le moment qui joue à t est coupé à la limite d'étape la plus proche (le design : splitAt). */
export function couperIci(p: Projet, t: number): Resultat {
  const plan = planifier(p);
  const i = indiceMomentA(plan, t);
  const e = plan.evs[i];
  if (!e || e.run.length < 2) return { ok: false, message: 'Ce moment n’a qu’une étape jouée : rien à couper.' };
  let b = 1, bd = 1e12;
  for (let j = 1; j < e.run.length; j++) { const dd = Math.abs(e.run[j].S - t); if (dd < bd) { bd = dd; b = j; } }
  const ev = p.ev[i];
  const cut = e.run[b].st.id, moved = new Set([cut]), q = [cut];
  while (q.length) {
    const a = q.shift() as string;
    ev.tr.forEach((x) => { if (x.a === a && x.b && !moved.has(x.b)) { moved.add(x.b); q.push(x.b); } });
  }
  if (entrees(ev).some((x) => moved.has(x))) return { ok: false, message: 'Impossible de couper ici : une branche revient au début.' };
  const avant = positionsAbsolues(p, plan);
  const nid = nouvelId(p, 'm');
  const ms = ev.st.filter((x) => moved.has(x.id));
  const minC = Math.min(...ms.map((x) => x.c));
  ms.forEach((x) => { x.c -= minC; });
  const ne: Moment = {
    id: nid, act: ev.act, name: ev.name + ' · suite', entry: cut, st: ms,
    tr: ev.tr.filter((x) => moved.has(x.a) && moved.has(x.b)), gate: ev.gate ?? { mode: 'auto', g: [] },
  };
  ev.st = ev.st.filter((x) => !moved.has(x.id));
  ev.tr = ev.tr.filter((x) => !moved.has(x.a) && !moved.has(x.b));
  ev.gate = { mode: 'auto', g: [] };
  p.ev.splice(i + 1, 0, ne);
  p.tracks.forEach((tk) => { if (tk.pts) tk.pts[nid] = tk.pts[ev.id] ?? 50; });
  reancrer(p, avant);
  return { ok: true, message: 'Moment coupé en deux · « ' + ne.name + ' »', id: nid };
}

/** « Nouvel acte à partir d'ici » : l'acte commence au moment qui suit la limite la plus proche de t (le design : newAct). */
export function nouvelActeIci(p: Projet, t: number): Resultat {
  const k = limiteProche(planifier(p), t);
  if (k >= p.ev.length) { const id = ajouterActeFin(p); return { ok: true, message: 'Nouvel acte créé en fin de conduite.', id }; }
  const a = p.ev[k].act;
  if (k === 0 || p.ev[k - 1].act !== a) return { ok: false, message: 'Ce moment ouvre déjà un acte.' };
  p.acts.splice(a + 1, 0, { n: 'Nouvel acte' });
  p.ev.forEach((x, j) => { if (x.act > a) x.act++; else if (x.act === a && j >= k) x.act = a + 1; });
  return { ok: true, message: 'Nouvel acte créé à partir de « ' + p.ev[k].name + ' ».', id: p.ev[k].id };
}

export function renommerActe(p: Projet, a: number, n: string): void {
  if (p.acts[a]) p.acts[a].n = n.trim() || p.acts[a].n;
}

/** Poignée de durée d'un moment : les durées prévues des étapes jouées sont mises à l'échelle (le design : mr). */
export function redimensionnerMoment(p: Projet, evId: string, ratio: number): void {
  const plan = planifier(p);
  const e = plan.evs.find((x) => x.ev.id === evId);
  if (!e) return;
  const r = Math.max(0.1, ratio);
  const ids = new Set(e.run.map((x) => x.st.id));
  const ev = p.ev.find((x) => x.id === evId);
  ev?.st.forEach((st) => {
    if (!ids.has(st.id)) return;
    const k0 = st.k[0] ?? 0;
    st.k[0] = Math.max(0, Math.min(100, Math.round(((10 + k0 * 6) * r - 10) / 6)));
  });
}

function trouver(p: Projet, pisteId: string, id: string): Element | undefined {
  const tk = p.tracks.find((x) => x.id === pisteId);
  return (tk?.clips as Element[] | undefined)?.find((x) => x.id === id) ?? tk?.marks?.find((x) => x.id === id);
}

/** Glisser un clip ou un repère : il est raccroché au moment qui joue à son nouveau temps. */
export function deplacerElement(p: Projet, pisteId: string, id: string, abs: number): void {
  const it = trouver(p, pisteId, id);
  if (it) ancrer(it, Math.max(0, abs), planifier(p));
}

export function dureeClip(p: Projet, pisteId: string, id: string, dur: number): void {
  const c = p.tracks.find((x) => x.id === pisteId)?.clips?.find((x) => x.id === id);
  if (c) c.dur = Math.max(2, Math.round(dur));
}

export function preavisRepere(p: Projet, pisteId: string, id: string, lead: number): void {
  const m = p.tracks.find((x) => x.id === pisteId)?.marks?.find((x) => x.id === id);
  if (m) m.lead = Math.max(0, Math.round(lead));
}

export function reglerPoint(p: Projet, pisteId: string, evId: string, v: number): void {
  const tk = p.tracks.find((x) => x.id === pisteId);
  if (!tk) return;
  tk.pts = tk.pts ?? {};
  tk.pts[evId] = Math.max(0, Math.min(100, Math.round(v)));
}

export function basculerPiste(p: Projet, pisteId: string): void {
  const tk = p.tracks.find((x) => x.id === pisteId);
  if (tk) tk.open = !tk.open;
}

export function ajouterPiste(p: Projet, type: TypePiste): string {
  const id = nouvelId(p, 't');
  const tt = TYPES_PISTE[type];
  const tk: Piste = { id, type, name: tt.nom, open: true };
  if (type === 'curve') { tk.src = 'libre'; tk.pts = {}; p.ev.forEach((e) => { tk.pts![e.id] = 50; }); }
  else if (type === 'notes' || type === 'secu') tk.marks = [];
  else tk.clips = [];
  p.tracks.push(tk);
  return id;
}

/** Double-clic dans une piste de repères : une note (ou une alerte de sécurité, avec 10 s de préavis) au temps abs. */
export function ajouterRepere(p: Projet, pisteId: string, abs: number): string | undefined {
  const tk = p.tracks.find((x) => x.id === pisteId);
  if (!tk?.marks) return undefined;
  const m: Repere = { id: nouvelId(p, 'k'), ev: '', off: 0, txt: tk.type === 'secu' ? 'Nouvelle alerte' : 'Nouvelle note' };
  if (tk.type === 'secu') m.lead = 10;
  ancrer(m, abs, planifier(p));
  tk.marks.push(m);
  return m.id;
}

export function modePassage(p: Projet, evId: string, mode: 'auto' | 'go'): void {
  const ev = p.ev.find((x) => x.id === evId);
  if (ev) ev.gate = { ...(ev.gate ?? { g: [] }), mode };
}
