// Lecture des banques du prototype par chemin (port de banques.mjs, sans copie des JSON) : personas.json, reflexes.json,
// repliques.json, prompts.md. Dossier de banques en priorité, `serveur/secours/` du prototype sinon (fichier par fichier).
// Formats acceptés : celui de prototypes/figurants/banques/README.md et des formes simplifiées (tableaux de textes).
//
// Ce que ce port ne reprend PAS : la modération (moderation.mjs, listes d'interdits). Le filtre des textes affichés au mur est
// celui du serveur de spectacle (il refiltre tout `agent.in{k:'say'}`) ; l'agent ne garde ici que le contrôle des sujets
// à ne pas révéler d'un segment (spoilers), voir `interditsSegment`.
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Banques, Declencheur, Persona, Reflexes, Replique, Segment, TypeReplique, Vague } from './types';
import { cleTexte } from './similarite';

type Brut = any;

/** La racine du dépôt (ce fichier est dans packages/agents/src/figurants/). */
export const RACINE_DEPOT = fileURLToPath(new URL('../../../../', import.meta.url));
/** Les banques et le secours du prototype des figurants. */
export const DOSSIER_BANQUES = path.join(RACINE_DEPOT, 'prototypes', 'figurants', 'banques');
export const DOSSIER_SECOURS = path.join(RACINE_DEPOT, 'prototypes', 'figurants', 'serveur', 'secours');

const COULEURS = ['--coral-2', '--cy', '--or', '--grn', '--amb', '--coral-3', '--spec-3', '--grn2', '--rouge', '--coral-1', '--ink2', '--spec-2'];

function lireJson(fichier: string): Brut | undefined | null {
  let t: string;
  try { t = fs.readFileSync(fichier, 'utf8').replace(/^﻿/, ''); } catch { return undefined; }
  try { return JSON.parse(t); } catch { /* tolérance : commentaires // et virgules finales */ }
  try { return JSON.parse(t.replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1')); } catch { return null; }
}
function lireTexte(fichier: string): string | undefined { try { return fs.readFileSync(fichier, 'utf8'); } catch { return undefined; } }

/** Texte comparable aux motifs : minuscules, sans accents, apostrophes droites, tirets → espaces. */
export function texteMotif(s: unknown): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[’‘`´]/g, "'").replace(/[-–—_]/g, ' ').replace(/\s+/g, ' ').trim();
}

function echapper(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Compile un motif : « re:… » = expression régulière, sinon mot / expression entre limites de mots. */
export function compilerMotif(m: unknown): RegExp | null {
  if (typeof m !== 'string' || !m.trim()) return null;
  try {
    if (m.startsWith('re:')) return new RegExp(m.slice(3), 'i');
    const n = texteMotif(m.replace(/^mot:/, ''));
    return new RegExp(`(^|[^a-z0-9])${echapper(n)}($|[^a-z0-9])`, 'i');
  } catch { return null; }
}

function intervalle(v: unknown, defaut: [number, number]): [number, number] {
  if (Array.isArray(v) && v.length >= 2 && v.every(Number.isFinite)) return [Math.min(v[0], v[1]), Math.max(v[0], v[1])];
  if (typeof v === 'number' && Number.isFinite(v)) return [v * 0.7, v * 1.3];
  return defaut;
}

function couleurJeton(c: unknown, i: number): string {
  if (typeof c === 'string') {
    const m = c.trim().match(/^(?:var\(\s*)?(--[a-z0-9-]{1,32})\s*\)?$/i);
    if (m) return m[1]!.toLowerCase();
  }
  return COULEURS[i % COULEURS.length]!;
}

const num = (x: unknown, d: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : d);

/** Normalise une fiche persona quelle que soit sa forme. */
export function normaliserPersona(p: Brut, i: number): Persona {
  const st = (p.style && typeof p.style === 'object') ? p.style : {};
  const v: Brut = { ...(p.voix || {}), ...st };
  for (const k of ['longueur', 'casse', 'fautes', 'accents', 'abreviations', 'emojis', 'emojis_par_msg', 'emotes', 'tic', 'tic_max', 'exemples']) {
    if (v[k] === undefined && p[k] !== undefined) v[k] = p[k];
  }
  const r: Brut = { ...(typeof p.rythme === 'object' && p.rythme ? p.rythme : {}) };
  if (typeof p.rythme === 'number') r.activite = p.rythme;
  const id = String(p.id || p.pid || p.pseudo || `p${i}`);
  // accents = probabilité de GARDER les accents (banques/README §1)
  const accents = typeof v.accents === 'number' ? v.accents : (/omis|jamais|sans/.test(String(v.accents || '')) ? 0.2 : 0.9);
  const casse = /cri|maj/i.test(String(v.casse || '')) ? 'CRIS' : (/minus/i.test(String(v.casse || '')) ? 'minuscules' : 'normale');
  let longueur: [number, number] | null = Array.isArray(v.longueur) || typeof v.longueur === 'number' ? intervalle(v.longueur, [2, 50]) : null;
  if (!longueur && p.longueur_mots && typeof p.longueur_mots === 'object') longueur = [2, Math.min(80, Math.round(num(p.longueur_mots.max, 10) * 6))];
  let abreviations: Record<string, string> = {};
  if (Array.isArray(v.abreviations)) abreviations = Object.fromEntries(v.abreviations.filter((x: unknown) => typeof x === 'string').map((a: string) => [a, a]));
  else if (v.abreviations && typeof v.abreviations === 'object') abreviations = { ...v.abreviations };
  const tics: string[] = Array.isArray(p.tics) ? p.tics : (typeof v.tic === 'string' && v.tic ? [v.tic] : []);
  const reagit: Brut = p.reagit && typeof p.reagit === 'object' ? p.reagit : {};
  const presence = Array.isArray(p.presence) && !p.presence.includes('*') ? p.presence.map(String) : null;
  const recurrent = p.recurrent === true || p.type === 'recurrent' || (p.recurrent === undefined && p.type !== 'silhouette' && !/^s_/.test(id));
  return {
    id,
    pseudo: String(p.pseudo || p.nom || id).slice(0, 25),
    couleur: couleurJeton(p.couleur, i),
    type: recurrent ? 'recurrent' : 'silhouette',
    archetype: String(p.archetype || p.role || p.profil || ''),
    bio: String(p.bio || p.description || (typeof p.style === 'string' ? p.style : '') || ''),
    registre: String(st.registre || ''),
    sujets: Array.isArray(p.sujets) ? p.sujets.slice(0, 6) : [],
    regles: Array.isArray(p.regles) ? p.regles.slice(0, 4) : [],
    presence,
    faits: Array.isArray(p.faits) ? p.faits.slice(0, 6) : [],
    actif: p.actif !== false,
    humeur_base: p.humeur_base || (p.attitude && p.attitude.humeur_base) || null,
    reagit: { N0: num(reagit.N0, 0.5), N1: num(reagit.N1, 0.6), N2: num(reagit.N2, 0.5), N3: num(reagit.N3, 0.5) },
    voix: {
      longueur: longueur || [2, 50],
      casse,
      cris: num(v.cris, casse === 'CRIS' ? 0.6 : 0.05),
      fautes: Math.max(0, Math.min(0.8, num(v.fautes, 0.15))),
      fautes_typiques: Array.isArray(v.fautes_typiques) ? v.fautes_typiques.filter((x: unknown) => Array.isArray(x) && x.length === 2) : [],
      accents: Math.max(0, Math.min(1, accents)),
      point_final: num(v.point_final, 0),
      repetition_lettres: num(v.repetition_lettres, 0.15),
      abreviations,
      emojis: Array.isArray(v.emojis) ? v.emojis : [],
      emojis_par_msg: num(v.emojis_par_msg, Array.isArray(v.emojis) && v.emojis.length ? 0.35 : 0),
      emotes: Array.isArray(v.emotes) ? v.emotes : [],
      tics,
      tic_proba: num(p.tic_proba, num(v.tic_max, 0.2)),
      exemples: (Array.isArray(p.exemples) ? p.exemples : (Array.isArray(v.exemples) ? v.exemples : [])).filter((x: unknown) => typeof x === 'string').slice(0, 6),
    },
    rythme: {
      reaction_s: intervalle(r.reaction_s, [1, 3]),
      frappe_cps: num(r.frappe_cps, 3.2),
      activite: Math.max(0.05, Math.min(1, num(r.activite, 0.55))),
      rafale: num(r.rafale, 0.2),
    },
  };
}

function listeDe(x: Brut, ...cles: string[]): Brut[] | null {
  if (Array.isArray(x)) return x;
  if (x && typeof x === 'object') for (const k of cles) if (Array.isArray(x[k])) return x[k];
  return null;
}

function textes(arr: Brut): string[] {
  if (typeof arr === 'string') return [arr];
  if (!Array.isArray(arr)) return [];
  return arr.map(e => (typeof e === 'string' ? e : (e && (e.texte || e.t || e.text)))).filter((s): s is string => typeof s === 'string' && !!s.trim());
}

/** reflexes.json → humeurs, déclencheurs, vagues, relances. */
export function normaliserReflexes(j: Brut): Reflexes {
  const r: Reflexes = { humeurs: {}, declencheurs: [], vagues: [], relance: [] };
  if (!j || typeof j !== 'object') return r;
  const humeurs = j.humeurs || j.humeur || j.moods || {};
  for (const [k, v] of Object.entries<Brut>(humeurs)) {
    if (Array.isArray(v)) r.humeurs[k.toLowerCase()] = { variantes: textes(v), emotes: [], centre: null, stylisable: true };
    else if (v && typeof v === 'object') r.humeurs[k.toLowerCase()] = { variantes: textes(v.variantes || v.textes || v.repliques), emotes: textes(v.emotes), centre: v.centre || null, stylisable: v.stylisable !== false };
  }
  const decl = listeDe(j.declencheurs || j.triggers, 'liste') || [];
  for (const d of decl) {
    if (!d || typeof d !== 'object') continue;
    const motifs = (Array.isArray(d.motifs) ? d.motifs : (d.motif ? [d.motif] : (d.mot ? [d.mot] : []))).map(compilerMotif).filter((m: RegExp | null): m is RegExp => !!m);
    if (!motifs.length) continue;
    r.declencheurs.push({
      id: String(d.id || d.mot || 'd' + r.declencheurs.length), motifs, priorite: d.priorite || 'normale',
      nb: intervalle(d.nb, [2, 5]), delai_s: intervalle(d.delai_s, [0.8, 3]), stylisable: d.stylisable !== false,
      segments_exclus: Array.isArray(d.segments_exclus) ? d.segments_exclus : [],
      variantes: textes(d.variantes || d.textes), par_humeur: d.par_humeur && typeof d.par_humeur === 'object' ? d.par_humeur : {},
    });
  }
  // forme simplifiée : { mots: {mot: [...]}, question: [...] }
  const mots = j.mots || j.mots_cles || j.keywords;
  if (mots && typeof mots === 'object' && !Array.isArray(mots)) {
    for (const [k, v] of Object.entries<Brut>(mots)) {
      const m = compilerMotif(k);
      if (m) r.declencheurs.push({ id: 'mot:' + k, motifs: [m], priorite: 'normale', nb: [1, 3], delai_s: [0.8, 3], stylisable: true, segments_exclus: [], variantes: textes(v), par_humeur: {} });
    }
  }
  const q = textes(j.question || j.questions || j.reponses_question);
  if (q.length && !r.declencheurs.some(d => d.id === 'question_chat')) {
    r.declencheurs.push({
      id: 'question_chat', priorite: 'haute', nb: [2, 6], delai_s: [0.8, 3.5], stylisable: true, segments_exclus: [], variantes: q, par_humeur: {},
      motifs: ['le chat', 'les gars', 'vous en pensez quoi', 'dites moi', 're:\\bvous\\b[^.?!]*\\?$'].map(compilerMotif).filter((m): m is RegExp => !!m),
    });
  }
  for (const v of (listeDe(j.vagues, 'liste') || [])) {
    if (!v || typeof v !== 'object') continue;
    const variantes = textes(v.variantes);
    const vague: Vague = {
      id: String(v.id || v.cle), cle: String(v.cle || v.id || ''), taille: intervalle(v.taille, [5, 12]), etalement_s: intervalle(v.etalement_s, [0.5, 4]),
      copie_exacte: !!v.copie_exacte, ordonnee: !!v.ordonnee, stylisable: !!v.stylisable, variantes: variantes.length ? variantes : [String(v.cle)],
    };
    r.vagues.push(vague);
  }
  r.relance = textes(j.relance || j.relances);
  return r;
}

/** repliques.json → fiction et segments { id: { titre, consigne, faits, interdits, humeur, densite, repliques } }. */
export function normaliserRepliques(j: Brut): { fiction: Record<string, unknown> | null; segments: Record<string, Segment> } {
  const out: { fiction: Record<string, unknown> | null; segments: Record<string, Segment> } = { fiction: null, segments: {} };
  if (!j || typeof j !== 'object') return out;
  out.fiction = j.fiction && typeof j.fiction === 'object' ? j.fiction : null;
  const segs = j.segments && typeof j.segments === 'object' ? j.segments : j;
  const entrees: [unknown, Brut][] = Array.isArray(segs) ? segs.map((s: Brut) => [s && (s.id || s.segment), s]) : Object.entries(segs);
  for (const [idBrut, s] of entrees) {
    const id = String(idBrut ?? '');
    if (!id || id.startsWith('_') || ['version', 'langue', 'note', 'fiction', 'undefined'].includes(id)) continue;
    const brut: Brut[] = Array.isArray(s) ? s : (listeDe(s, 'repliques', 'lignes', 'items') || []);
    if (!Array.isArray(s) && (!s || typeof s !== 'object')) continue;
    const repliques: Replique[] = [];
    brut.forEach((e0: Brut, k: number) => {
      const e = typeof e0 === 'string' ? { texte: e0 } : e0;
      if (!e || typeof e !== 'object') return;
      const texte = e.texte || e.t || e.text;
      if (typeof texte !== 'string' || !texte.trim()) return;
      const quand = String(e.quand || e.declencheur || (e.mot ? 'mot:' + e.mot : '') || 'libre');
      let type: TypeReplique = 'libre';
      let motif: RegExp | null = null;
      let top: string | null = null;
      if (/^(debut|début|entree|entrée)$/i.test(quand)) type = 'debut';
      else if (/^fin$/i.test(quand)) type = 'fin';
      else if (/^relance$/i.test(quand)) type = 'relance';
      else if (/^top:/i.test(quand)) { type = 'top'; top = quand.slice(4).trim(); }
      else if (/^(mot|re):/i.test(quand)) { type = 'mot'; motif = compilerMotif(quand.startsWith('mot:') ? quand.slice(4) : quand); if (!motif) return; }
      repliques.push({ id: e.id || `${id}_${k}`, quand, type, motif, top, persona: e.persona || e.p || null, texte, ordre: num(e.ordre, k) });
    });
    const o: Brut = Array.isArray(s) ? {} : s;
    out.segments[id] = {
      titre: o.titre || id, ordre: num(o.ordre, 0),
      consigne: o.consigne || o.description || '',
      faits: Array.isArray(o.faits) ? o.faits : [],
      interdits: Array.isArray(o.interdits) ? o.interdits.filter((x: unknown) => typeof x === 'string') : [],
      humeur: o.humeur && typeof o.humeur === 'object' ? o.humeur : null,
      densite: typeof o.densite === 'string' ? o.densite : null,
      repliques,
    };
  }
  return out;
}

/** prompts.md (banques/README §5) : « ### <id> » suivi du premier bloc ```text. Renvoie { id: texte }. */
export function lirePrompts(texte: string | undefined): Record<string, string> {
  const res: Record<string, string> = {};
  if (!texte) return res;
  const re = /^### ([a-z0-9_.]+)[ \t]*$[\s\S]*?^```text\r?\n([\s\S]*?)\r?\n```/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texte))) if (m[1] && m[2] !== undefined && !res[m[1]]) res[m[1]] = m[2];
  return res;
}

export interface OptionsBanques {
  /** dossier des banques (défaut : prototypes/figurants/banques) */
  dossier?: string;
  /** dossier de secours (défaut : prototypes/figurants/serveur/secours) */
  secours?: string;
}

/** Nom court (`echo`) ou chemin → dossier de banques : `echo` = prototypes/figurants/banques/echo. */
export function dossierDeBanques(nom?: string): string {
  if (!nom) return DOSSIER_BANQUES;
  if (/^[a-z0-9_-]+$/i.test(nom)) return path.join(DOSSIER_BANQUES, nom);
  return path.resolve(nom);
}

/** Charge les banques d'un dossier ; ce qui manque ou est illisible vient du secours, fichier par fichier. */
export function chargerBanques(options: OptionsBanques = {}): Banques {
  const dirBanques = options.dossier ?? DOSSIER_BANQUES;
  const dirSecours = options.secours ?? DOSSIER_SECOURS;
  const sources: Record<string, string> = {};
  const essayer = (nom: string, valide: (j: Brut) => boolean): Brut => {
    const b = lireJson(path.join(dirBanques, nom));
    if (b && valide(b)) { sources[nom] = 'banques'; return b; }
    sources[nom] = b === null ? 'secours (banques illisible)' : 'secours';
    return lireJson(path.join(dirSecours, nom));
  };

  const pj = essayer('personas.json', j => (listeDe(j, 'personas', 'distribution', 'figurants') || []).length > 0);
  const vus = new Set<string>();
  const personas = (listeDe(pj, 'personas', 'distribution', 'figurants') || [])
    .filter((p): p is Brut => !!p && typeof p === 'object').map(normaliserPersona).filter(p => (vus.has(p.id) ? false : (vus.add(p.id), true)));

  const reflexes = normaliserReflexes(essayer('reflexes.json', j => !!j && typeof j === 'object' && !!(j.humeurs || j.declencheurs)));
  const sec = normaliserReflexes(lireJson(path.join(dirSecours, 'reflexes.json')));
  if (!Object.values(reflexes.humeurs).some(h => h.variantes.length)) reflexes.humeurs = sec.humeurs;
  if (!reflexes.declencheurs.some((d: Declencheur) => d.id === 'question_chat')) reflexes.declencheurs.push(...sec.declencheurs.filter(d => d.id === 'question_chat'));
  if (!reflexes.relance.length) reflexes.relance = sec.relance;

  const rp = normaliserRepliques(essayer('repliques.json', j => Object.keys(normaliserRepliques(j).segments).length > 0));

  const prompts = lirePrompts(lireTexte(path.join(dirBanques, 'prompts.md')));
  sources['prompts.md'] = prompts['n2.haiku.system'] ? `banques (${Object.keys(prompts).length} prompts)` : 'intégré';

  // sujets à ne pas révéler (spoilers) par segment, sous la forme comparable de cleTexte
  const interditsSegment: Record<string, string[]> = {};
  for (const [id, s] of Object.entries(rp.segments)) interditsSegment[id] = s.interdits.map(cleTexte).filter(x => x.length >= 3);

  return {
    personas, reflexes, segments: rp.segments, fiction: rp.fiction, prompts, interditsSegment, sources,
    premierSegment() {
      const premier = Object.entries(rp.segments).sort((a, b) => a[1].ordre - b[1].ordre)[0];
      return premier ? premier[0] : 'accueil';
    },
  };
}
