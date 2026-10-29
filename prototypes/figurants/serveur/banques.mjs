// Chargement TOLÉRANT des banques : ../banques/ en priorité, serveur/secours/ sinon (fichier par fichier).
// Formats acceptés : celui de banques/README.md (personas.style{}, reflexes.humeurs{centre,variantes}, declencheurs[], vagues[],
// repliques.segments[] avec quand = debut|fin|libre|relance|mot:…|re:…|top:…) et des formes simplifiées (tableaux de textes).
// Les interdits sont cumulatifs : banques/interdits.txt + secours/interdits*.txt (+ banques/celebrites.txt) + interdits du segment.
// Rechargement automatique quand un fichier de banques/ change (les banques sont écrites en parallèle par d'autres).

import fs from 'node:fs';
import path from 'node:path';
import { Liste } from './moderation.mjs';

const COULEURS = ['--coral-2', '--cy', '--or', '--grn', '--amb', '--coral-3', '--spec-3', '--grn2', '--rouge', '--coral-1', '--ink2', '--spec-2'];

function lireJson(fichier) {
  let t;
  try { t = fs.readFileSync(fichier, 'utf8').replace(/^\uFEFF/, ''); } catch { return undefined; }
  try { return JSON.parse(t); } catch { /* tolérance : commentaires // et virgules finales */ }
  try { return JSON.parse(t.replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1')); } catch { return null; }
}
function lireTexte(fichier) { try { return fs.readFileSync(fichier, 'utf8'); } catch { return undefined; } }

/** Texte comparable aux motifs : minuscules, sans accents, apostrophes droites, tirets → espaces. */
export function texteMotif(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`´]/g, "'").replace(/[-–—_]/g, ' ').replace(/\s+/g, ' ').trim();
}

function echapper(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Compile un motif : « re:… » = expression régulière, sinon mot / expression entre limites de mots. */
export function compilerMotif(m) {
  if (typeof m !== 'string' || !m.trim()) return null;
  try {
    if (m.startsWith('re:')) return new RegExp(m.slice(3), 'i');
    const n = texteMotif(m.replace(/^mot:/, ''));
    return new RegExp(`(^|[^a-z0-9])${echapper(n)}($|[^a-z0-9])`, 'i');
  } catch { return null; }
}

function intervalle(v, defaut) {
  if (Array.isArray(v) && v.length >= 2 && v.every(Number.isFinite)) return [Math.min(v[0], v[1]), Math.max(v[0], v[1])];
  if (Number.isFinite(v)) return [v * 0.7, v * 1.3];
  return defaut;
}

function couleurJeton(c, i) {
  if (typeof c === 'string') {
    const m = c.trim().match(/^(?:var\(\s*)?(--[a-z0-9-]{1,32})\s*\)?$/i);
    if (m) return m[1].toLowerCase();
  }
  return COULEURS[i % COULEURS.length];
}

const num = (x, d) => (Number.isFinite(x) ? x : d);

/** Normalise une fiche persona quelle que soit sa forme. */
export function normaliserPersona(p, i) {
  const st = (p.style && typeof p.style === 'object') ? p.style : {};
  const v = { ...(p.voix || {}), ...st };
  for (const k of ['longueur', 'casse', 'fautes', 'accents', 'abreviations', 'emojis', 'emojis_par_msg', 'emotes', 'tic', 'tic_max', 'exemples']) {
    if (v[k] === undefined && p[k] !== undefined) v[k] = p[k];
  }
  const r = { ...(typeof p.rythme === 'object' && p.rythme ? p.rythme : {}) };
  if (typeof p.rythme === 'number') r.activite = p.rythme;
  const id = String(p.id || p.pid || p.pseudo || `p${i}`);
  // accents = probabilité de GARDER les accents (banques/README §1)
  const accents = typeof v.accents === 'number' ? v.accents : (/omis|jamais|sans/.test(String(v.accents || '')) ? 0.2 : 0.9);
  const casse = /cri|maj/i.test(String(v.casse || '')) ? 'CRIS' : (/minus/i.test(String(v.casse || '')) ? 'minuscules' : 'normale');
  let longueur = intervalle(v.longueur, null);
  if (!longueur && p.longueur_mots && typeof p.longueur_mots === 'object') longueur = [2, Math.min(80, Math.round(num(p.longueur_mots.max, 10) * 6))];
  let abreviations = {};
  if (Array.isArray(v.abreviations)) abreviations = Object.fromEntries(v.abreviations.filter((x) => typeof x === 'string').map((a) => [a, a]));
  else if (v.abreviations && typeof v.abreviations === 'object') abreviations = { ...v.abreviations };
  const tics = Array.isArray(p.tics) ? p.tics : (typeof v.tic === 'string' && v.tic ? [v.tic] : []);
  const reagit = p.reagit && typeof p.reagit === 'object' ? p.reagit : {};
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
      fautes_typiques: Array.isArray(v.fautes_typiques) ? v.fautes_typiques.filter((x) => Array.isArray(x) && x.length === 2) : [],
      accents: Math.max(0, Math.min(1, accents)),
      point_final: num(v.point_final, 0),
      repetition_lettres: num(v.repetition_lettres, 0.15),
      abreviations,
      emojis: Array.isArray(v.emojis) ? v.emojis : [],
      emojis_par_msg: num(v.emojis_par_msg, Array.isArray(v.emojis) && v.emojis.length ? 0.35 : 0),
      emotes: Array.isArray(v.emotes) ? v.emotes : [],
      tics,
      tic_proba: num(p.tic_proba, num(v.tic_max, 0.2)),
      exemples: (Array.isArray(p.exemples) ? p.exemples : (Array.isArray(v.exemples) ? v.exemples : [])).filter((x) => typeof x === 'string').slice(0, 6),
    },
    rythme: {
      reaction_s: intervalle(r.reaction_s, [1, 3]),
      frappe_cps: num(r.frappe_cps, 3.2),
      activite: Math.max(0.05, Math.min(1, num(r.activite, 0.55))),
      rafale: num(r.rafale, 0.2),
    },
  };
}

function listeDe(x, ...cles) {
  if (Array.isArray(x)) return x;
  if (x && typeof x === 'object') for (const k of cles) if (Array.isArray(x[k])) return x[k];
  return null;
}

function textes(arr) {
  if (typeof arr === 'string') return [arr];
  if (!Array.isArray(arr)) return [];
  return arr.map((e) => (typeof e === 'string' ? e : (e && (e.texte || e.t || e.text)))).filter((s) => typeof s === 'string' && s.trim());
}

/** reflexes.json → { humeurs: {cle: {variantes, emotes, centre, stylisable}}, declencheurs: [...], vagues: [...], relance: [] } */
function normaliserReflexes(j) {
  const r = { humeurs: {}, declencheurs: [], vagues: [], relance: [] };
  if (!j || typeof j !== 'object') return r;
  const humeurs = j.humeurs || j.humeur || j.moods || {};
  for (const [k, v] of Object.entries(humeurs)) {
    if (Array.isArray(v)) r.humeurs[k.toLowerCase()] = { variantes: textes(v), emotes: [], centre: null, stylisable: true };
    else if (v && typeof v === 'object') r.humeurs[k.toLowerCase()] = { variantes: textes(v.variantes || v.textes || v.repliques), emotes: textes(v.emotes), centre: v.centre || null, stylisable: v.stylisable !== false };
  }
  const decl = listeDe(j.declencheurs || j.triggers, 'liste') || [];
  for (const d of decl) {
    if (!d || typeof d !== 'object') continue;
    const motifs = (Array.isArray(d.motifs) ? d.motifs : (d.motif ? [d.motif] : (d.mot ? [d.mot] : []))).map(compilerMotif).filter(Boolean);
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
    for (const [k, v] of Object.entries(mots)) { const m = compilerMotif(k); if (m) r.declencheurs.push({ id: 'mot:' + k, motifs: [m], priorite: 'normale', nb: [1, 3], delai_s: [0.8, 3], stylisable: true, segments_exclus: [], variantes: textes(v), par_humeur: {} }); }
  }
  const q = textes(j.question || j.questions || j.reponses_question);
  if (q.length && !r.declencheurs.some((d) => d.id === 'question_chat')) {
    r.declencheurs.push({ id: 'question_chat', motifs: ['le chat', 'les gars', 'vous en pensez quoi', 'dites moi', 're:\\bvous\\b[^.?!]*\\?$'].map(compilerMotif), priorite: 'haute', nb: [2, 6], delai_s: [0.8, 3.5], stylisable: true, segments_exclus: [], variantes: q, par_humeur: {} });
  }
  for (const v of (listeDe(j.vagues, 'liste') || [])) {
    if (!v || typeof v !== 'object') continue;
    const variantes = textes(v.variantes);
    r.vagues.push({ id: String(v.id || v.cle), cle: String(v.cle || v.id || ''), taille: intervalle(v.taille, [5, 12]), etalement_s: intervalle(v.etalement_s, [0.5, 4]),
      copie_exacte: !!v.copie_exacte, ordonnee: !!v.ordonnee, stylisable: !!v.stylisable, variantes: variantes.length ? variantes : [String(v.cle)] });
  }
  r.relance = textes(j.relance || j.relances);
  return r;
}

/** repliques.json → { fiction, segments: { id: { titre, consigne, faits, interdits, humeur, densite, repliques: [{id, quand, type, motif, persona, texte, ordre}] } } } */
function normaliserRepliques(j) {
  const out = { fiction: null, segments: {} };
  if (!j || typeof j !== 'object') return out;
  out.fiction = j.fiction && typeof j.fiction === 'object' ? j.fiction : null;
  const segs = j.segments && typeof j.segments === 'object' ? j.segments : j;
  const entrees = Array.isArray(segs) ? segs.map((s) => [s && (s.id || s.segment), s]) : Object.entries(segs);
  for (const [id, s] of entrees) {
    if (!id || String(id).startsWith('_') || ['version', 'langue', 'note', 'fiction'].includes(id)) continue;
    const brut = Array.isArray(s) ? s : (listeDe(s, 'repliques', 'lignes', 'items') || []);
    if (!Array.isArray(s) && (!s || typeof s !== 'object')) continue;
    const repliques = brut.map((e, k) => {
      if (typeof e === 'string') e = { texte: e };
      if (!e || typeof e !== 'object') return null;
      const texte = e.texte || e.t || e.text;
      if (typeof texte !== 'string' || !texte.trim()) return null;
      const quand = String(e.quand || e.declencheur || (e.mot ? 'mot:' + e.mot : '') || 'libre');
      let type = 'libre'; let motif = null; let top = null;
      if (/^(debut|début|entree|entrée)$/i.test(quand)) type = 'debut';
      else if (/^fin$/i.test(quand)) type = 'fin';
      else if (/^relance$/i.test(quand)) type = 'relance';
      else if (/^top:/i.test(quand)) { type = 'top'; top = quand.slice(4).trim(); }
      else if (/^(mot|re):/i.test(quand)) { type = 'mot'; motif = compilerMotif(quand.startsWith('mot:') ? quand.slice(4) : quand); if (!motif) return null; }
      return { id: e.id || `${id}_${k}`, quand, type, motif, top, persona: e.persona || e.p || null, texte, ordre: num(e.ordre, k) };
    }).filter(Boolean);
    const o = Array.isArray(s) ? {} : s;
    out.segments[String(id)] = {
      titre: o.titre || String(id), ordre: num(o.ordre, 0),
      consigne: o.consigne || o.description || '',
      faits: Array.isArray(o.faits) ? o.faits : [],
      interdits: Array.isArray(o.interdits) ? o.interdits.filter((x) => typeof x === 'string') : [],
      humeur: o.humeur && typeof o.humeur === 'object' ? o.humeur : null,
      densite: typeof o.densite === 'string' ? o.densite : null,
      repliques,
    };
  }
  return out;
}

/** prompts.md (banques/README §5) : « ### <id> » suivi du premier bloc ```text. Renvoie { id: texte }. */
function lirePrompts(texte) {
  const res = {};
  if (!texte) return res;
  const re = /^### ([a-z0-9_.]+)[ \t]*$[\s\S]*?^```text\r?\n([\s\S]*?)\r?\n```/gm;
  let m;
  while ((m = re.exec(texte))) if (!res[m[1]]) res[m[1]] = m[2];
  return res;
}

export class Banques {
  constructor({ dirBanques, dirSecours, journal }) {
    this.dirBanques = dirBanques; this.dirSecours = dirSecours;
    this.journal = journal || (() => {});
    this.signature = '';
    this.charger();
  }

  _signature() {
    const f = ['personas.json', 'reflexes.json', 'repliques.json', 'interdits.txt', 'interdits-figurants.txt', 'celebrites.txt', 'prompts.md'];
    return f.map((n) => { try { return n + fs.statSync(path.join(this.dirBanques, n)).mtimeMs; } catch { return n + '-'; } }).join('|');
  }

  /** Recharge si un fichier de banques/ a changé. Renvoie true si rechargé. */
  verifier() {
    if (this._signature() === this.signature) return false;
    this.charger();
    return true;
  }

  charger() {
    this.signature = this._signature();
    const sources = {};
    const essayer = (nom, valide) => {
      const b = lireJson(path.join(this.dirBanques, nom));
      if (b && valide(b)) { sources[nom] = 'banques'; return b; }
      sources[nom] = b === null ? 'secours (banques illisible)' : 'secours';
      return lireJson(path.join(this.dirSecours, nom));
    };
    const pj = essayer('personas.json', (j) => (listeDe(j, 'personas', 'distribution', 'figurants') || []).length > 0);
    const vus = new Set();
    this.personas = (listeDe(pj, 'personas', 'distribution', 'figurants') || [])
      .filter((p) => p && typeof p === 'object').map(normaliserPersona).filter((p) => (vus.has(p.id) ? false : vus.add(p.id)));

    this.reflexes = normaliserReflexes(essayer('reflexes.json', (j) => j && typeof j === 'object' && (j.humeurs || j.declencheurs)));
    const sec = normaliserReflexes(lireJson(path.join(this.dirSecours, 'reflexes.json')));
    if (!Object.values(this.reflexes.humeurs).some((h) => h.variantes.length)) this.reflexes.humeurs = sec.humeurs;
    if (!this.reflexes.declencheurs.some((d) => d.id === 'question_chat')) this.reflexes.declencheurs.push(...sec.declencheurs.filter((d) => d.id === 'question_chat'));
    if (!this.reflexes.relance.length) this.reflexes.relance = sec.relance;

    const rp = normaliserRepliques(essayer('repliques.json', (j) => Object.keys(normaliserRepliques(j).segments).length > 0));
    this.segments = rp.segments;
    this.fiction = rp.fiction;

    this.prompts = lirePrompts(lireTexte(path.join(this.dirBanques, 'prompts.md')));
    sources['prompts.md'] = this.prompts['n2.haiku.system'] ? 'banques (' + Object.keys(this.prompts).length + ' prompts)' : 'intégré';

    const liste = new Liste();
    const ib = lireTexte(path.join(this.dirBanques, 'interdits.txt'));
    if (ib) liste.ajouterTexte(ib, { source: 'banques/interdits.txt' });
    const cb = lireTexte(path.join(this.dirBanques, 'celebrites.txt'));
    if (cb) liste.ajouterTexte(cb, { source: 'banques/celebrites.txt', figurantsSeulement: true });
    // banques/ remplace le secours quand le fichier est présent ; les célébrités du secours restent toujours chargées (figurants).
    if (!ib) liste.ajouterTexte(lireTexte(path.join(this.dirSecours, 'interdits.txt')) || '', { source: 'secours/interdits.txt' });
    const fb = lireTexte(path.join(this.dirBanques, 'interdits-figurants.txt'));
    liste.ajouterTexte(fb || lireTexte(path.join(this.dirSecours, 'interdits-figurants.txt')) || '', { source: fb ? 'banques/interdits-figurants.txt' : 'secours/interdits-figurants.txt', figurantsSeulement: true });
    liste.ajouterTexte(lireTexte(path.join(this.dirSecours, 'celebrites.txt')) || '', { source: 'secours/celebrites.txt', figurantsSeulement: true });
    sources['interdits.txt'] = ib ? 'banques' : 'secours';
    sources['interdits-figurants.txt'] = fb ? 'banques' : 'secours';
    this.liste = liste;
    // listes du segment (spoilers) : figurants seulement
    this.listesSegment = {};
    for (const [id, s] of Object.entries(this.segments)) {
      const l = new Liste();
      for (const x of s.interdits) l.ajouter(x, { categorie: 'segment', source: 'segment:' + id, figurantsSeulement: true });
      this.listesSegment[id] = l;
    }
    this.sources = sources;
    this.journal({ e: 'banques', sources, personas: this.personas.length, segments: Object.keys(this.segments), declencheurs: this.reflexes.declencheurs.length, vagues: this.reflexes.vagues.length, interdits: liste.entrees.length });
  }

  premierSegment() {
    const s = Object.entries(this.segments).sort((a, b) => a[1].ordre - b[1].ordre)[0];
    return s ? s[0] : 'accueil';
  }
}
