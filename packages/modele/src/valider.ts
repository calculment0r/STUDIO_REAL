// Validation d'un projet et chargement d'un fichier « studio-real/conducteur@1 » (ou d'un Projet nu).
import type { Condition, Etape, FichierConducteur, Moment, Passage, Projet, SalleSimulee, Sortie } from './types';
import { FORMAT } from './types';
import { OPERATEURS, estCleCondition } from './conditions';
import {
  TY_BOUCLE, TY_GARDE, TY_MEMOIRE, TY_TIRAGE, TYPES_VOTE, comportementBloc, poidsTirage, reglagesMemoire,
  sortiesBoucle, sortiesGarde,
} from './blocs-moteur';

export type NiveauProbleme = 'erreur' | 'avertissement';

export interface Probleme {
  niveau: NiveauProbleme;
  /** code stable (pour filtrer ou traduire) */
  code: string;
  /** phrase lisible en français */
  message: string;
  moment?: string;
  etape?: string;
}

const ISSUES = ['A', 'B', 'T'];

/** Vérifie un projet : erreurs (le lecteur ne peut pas le jouer correctement) et avertissements (à regarder). */
export function validerProjet(p: Projet): Probleme[] {
  const out: Probleme[] = [];
  const err = (code: string, message: string, moment?: string, etape?: string) => out.push({ niveau: 'erreur', code, message, moment, etape });
  const avt = (code: string, message: string, moment?: string, etape?: string) => out.push({ niveau: 'avertissement', code, message, moment, etape });

  if (!p || typeof p !== 'object') { err('projet-invalide', 'Le projet est vide ou illisible.'); return out; }
  if (!Array.isArray(p.ev)) { err('moments-absents', 'Le projet n’a pas de liste de moments (« ev »).'); return out; }
  if (!Array.isArray(p.acts)) err('actes-absents', 'Le projet n’a pas de liste d’actes (« acts »).');
  if (!p.ev.length) avt('aucun-moment', 'Le projet ne contient aucun moment.');

  // Mémoires posées par un bloc Mémoire (ou déclarées dans le projet) : pour repérer les conditions mem: orphelines.
  const memoiresConnues = new Set(Object.keys(p.memoires ?? {}));
  for (const m of p.ev) for (const st of m.st ?? []) if (st && st.ty === TY_MEMOIRE) memoiresConnues.add(reglagesMemoire(st).nom);

  const idsMoments = new Map<string, number>();
  p.ev.forEach((m, i) => {
    const nomM = `Moment « ${m?.name || m?.id || i + 1} »`;
    if (!m || typeof m.id !== 'string' || !m.id) { err('moment-sans-id', `Le moment n° ${i + 1} n’a pas d’identifiant.`); return; }
    if (idsMoments.has(m.id)) err('moment-id-double', `${nomM} : l’identifiant « ${m.id} » est déjà utilisé par un autre moment.`, m.id);
    idsMoments.set(m.id, i);
    if (Array.isArray(p.acts) && (typeof m.act !== 'number' || m.act < 0 || m.act >= p.acts.length))
      err('acte-inconnu', `${nomM} : il est rangé dans l’acte n° ${Number(m.act) + 1}, qui n’existe pas.`, m.id);
    if (!Array.isArray(m.st)) { err('etapes-absentes', `${nomM} : la liste des étapes (« st ») manque.`, m.id); return; }
    if (!Array.isArray(m.tr)) { err('sorties-absentes', `${nomM} : la liste des sorties (« tr ») manque.`, m.id); return; }

    const etapes = new Map<string, Etape>();
    for (const st of m.st) {
      if (!st || typeof st.id !== 'string' || !st.id) { err('etape-sans-id', `${nomM} : une étape n’a pas d’identifiant.`, m.id); continue; }
      if (etapes.has(st.id)) err('etape-id-double', `${nomM} : deux étapes portent l’identifiant « ${st.id} ».`, m.id, st.id);
      etapes.set(st.id, st);
      if (!Array.isArray(st.k) || typeof st.k[0] !== 'number' || !Number.isFinite(st.k[0]))
        err('duree-invalide', `${nomM} : l’étape « ${st.name || st.id} » n’a pas de durée prévue lisible (k[0]).`, m.id, st.id);
      if (typeof st.ty !== 'string' || !st.ty) err('type-absent', `${nomM} : l’étape « ${st.name || st.id} » n’a pas de type de bloc.`, m.id, st.id);
    }
    const nomE = (id: string) => `« ${etapes.get(id)?.name || id} »`;

    // Entrée.
    const entrees: string[] = [];
    if (typeof m.entry === 'string') {
      if (!m.entry) err('entree-absente', `${nomM} : aucune étape d’entrée.`, m.id);
      else entrees.push(m.entry);
    } else if (m.entry && typeof m.entry === 'object') {
      const cles = Object.keys(m.entry);
      if (!cles.length) err('entree-absente', `${nomM} : la table d’entrée par issue est vide.`, m.id);
      for (const [iss, id] of Object.entries(m.entry)) {
        if (typeof id !== 'string' || !id) err('entree-invalide', `${nomM} : l’entrée pour l’issue ${iss} est vide.`, m.id);
        else entrees.push(id);
      }
      for (const iss of ISSUES) if (!(iss in m.entry))
        avt('entree-issue-manquante', `${nomM} : pas d’entrée prévue pour l’issue ${iss === 'T' ? 'égalité (T)' : iss} ; la première de la table sera jouée.`, m.id);
      const avant = p.ev.slice(0, i).some(x => (x.st ?? []).some(s => TYPES_VOTE.includes(s.ty)) || (x.tr ?? []).some(t => (t.g ?? []).some(g => g.k === 'issue')));
      if (!avant) avt('entree-sans-vote', `${nomM} : l’entrée dépend de l’issue du vote, mais aucun vote ne la précède.`, m.id);
    } else err('entree-absente', `${nomM} : aucune étape d’entrée.`, m.id);
    for (const id of entrees) if (!etapes.has(id)) err('entree-inconnue', `${nomM} : l’étape d’entrée « ${id} » n’existe pas.`, m.id, id);

    // Sorties.
    const parSource = new Map<string, Sortie[]>();
    m.tr.forEach((s, j) => {
      if (!s || typeof s.a !== 'string') { err('sortie-invalide', `${nomM} : la sortie n° ${j + 1} est illisible.`, m.id); return; }
      if (!etapes.has(s.a)) err('sortie-source-inconnue', `${nomM} : une sortie part de l’étape « ${s.a} », qui n’existe pas.`, m.id, s.a);
      if (s.b && !etapes.has(s.b)) err('sortie-cible-inconnue', `${nomM} : la sortie de ${nomE(s.a)} vise l’étape « ${s.b} », qui n’existe pas dans ce moment.`, m.id, s.a);
      if (s.mode !== 'all' && s.mode !== 'any') err('sortie-mode', `${nomM} : la sortie de ${nomE(s.a)} a un mode « ${String(s.mode)} » (attendu : all ou any).`, m.id, s.a);
      if (!Array.isArray(s.g)) err('sortie-conditions', `${nomM} : la sortie de ${nomE(s.a)} n’a pas de liste de conditions.`, m.id, s.a);
      else s.g.forEach(g => verifierCondition(g, `${nomM}, sortie de ${nomE(s.a)}`, m.id, s.a));
      if (s.b === s.a) avt('sortie-sur-elle-meme', `${nomM} : la sortie de ${nomE(s.a)} revient sur elle-même.`, m.id, s.a);
      const l = parSource.get(s.a) ?? [];
      l.push(s);
      parSource.set(s.a, l);
    });

    for (const [src, outs] of parSource) {
      const st = etapes.get(src);
      const comp = st ? comportementBloc(st.ty) : 'normal';
      if (comp === 'normal' || comp === 'memoire') {
        const iSinon = outs.findIndex(o => Array.isArray(o.g) && !o.g.length);
        if (iSinon >= 0 && iSinon < outs.length - 1)
          avt('sinon-pas-dernier', `${nomM} : la sortie sans condition de ${nomE(src)} n’est pas la dernière ; les sorties placées après elle ne seront jamais prises.`, m.id, src);
      }
    }

    // Blocs moteur.
    for (const st of etapes.values()) {
      const outs = parSource.get(st.id) ?? [];
      const nom = `${nomM}, ${BLOC[st.ty] ?? 'étape'} « ${st.name || st.id} »`;
      if (st.ty === TY_GARDE) {
        const { conditions, delai } = sortiesGarde(outs);
        if (!delai) err('garde-sans-delai', `${nom} : il manque la sortie « délai dépassé ».`, m.id, st.id);
        if (!conditions.some(o => o.g.length)) avt('garde-sans-condition', `${nom} : aucune sortie « condition remplie » avec une condition.`, m.id, st.id);
      } else if (st.ty === TY_BOUCLE) {
        const { encore, termine } = sortiesBoucle(outs);
        if (!encore) err('boucle-sans-encore', `${nom} : il manque la sortie « encore ».`, m.id, st.id);
        if (!termine) avt('boucle-sans-termine', `${nom} : pas de sortie « terminé » ; la boucle finira le moment.`, m.id, st.id);
      } else if (comportementBloc(st.ty) === 'tirage') {
        if (outs.length < 2) avt('tirage-une-sortie', `${nom} : un tirage au sort demande au moins 2 sorties.`, m.id, st.id);
        if (outs.length > 6) avt('tirage-trop-de-sorties', `${nom} : plus de 6 sorties.`, m.id, st.id);
        if (outs.length && poidsTirage(st, outs).every(x => x === 0)) avt('tirage-poids-nuls', `${nom} : tous les poids sont à 0 ; la sortie 1 sera toujours prise.`, m.id, st.id);
      }
    }

    // Accessibilité et fin du moment.
    const accessibles = new Set<string>();
    const pile = entrees.filter(id => etapes.has(id));
    while (pile.length) {
      const id = pile.pop()!;
      if (accessibles.has(id)) continue;
      accessibles.add(id);
      for (const o of parSource.get(id) ?? []) if (o.b && etapes.has(o.b)) pile.push(o.b);
    }
    for (const id of etapes.keys()) if (entrees.length && !accessibles.has(id))
      avt('etape-inaccessible', `${nomM} : l’étape ${nomE(id)} n’est jamais atteinte depuis l’entrée.`, m.id, id);
    const finit = [...accessibles].some(id => {
      const outs = parSource.get(id) ?? [];
      return !outs.length || outs.some(o => !o.b);
    });
    if (etapes.size && accessibles.size && !finit)
      err('moment-sans-fin', `${nomM} : aucune étape ne termine le moment (il faut une étape sans sortie ou une sortie vers la fin).`, m.id);

    // Passage.
    const g = m.gate as Passage | undefined;
    if (!g || (g.mode !== 'auto' && g.mode !== 'go')) err('passage-mode', `${nomM} : le passage vers le moment suivant doit être « auto » ou « go ».`, m.id);
    else {
      if (!Array.isArray(g.g)) err('passage-conditions', `${nomM} : le passage n’a pas de liste de conditions.`, m.id);
      else {
        g.g.forEach(c => verifierCondition(c, `${nomM}, passage`, m.id));
        if (g.g.some(c => c.k === 't')) avt('passage-condition-t', `${nomM} : une condition de durée sur un passage compte depuis la fin du moment.`, m.id);
      }
      if (i === p.ev.length - 1 && (g.mode === 'go' || (Array.isArray(g.g) && g.g.length)))
        avt('passage-dernier-moment', `${nomM} : c’est le dernier moment, son passage ne sera jamais joué.`, m.id);
    }
  });

  if (p.sens && typeof p.sens === 'object') {
    for (const k of ['aff', 'part', 'calme', 'pen'] as const) {
      const v = p.sens[k];
      if (typeof v !== 'number' || v < 0 || v > 100) avt('salle-reglage', `Salle simulée : le réglage « ${k} » doit être entre 0 et 100.`);
    }
  }
  return out;

  function verifierCondition(g: Condition, ou: string, moment: string, etape?: string) {
    if (!g || typeof g !== 'object') { err('condition-illisible', `${ou} : une condition est illisible.`, moment, etape); return; }
    if (!estCleCondition(g.k)) { err('condition-inconnue', `${ou} : la condition « ${String(g.k)} » est inconnue (t, pres, quorum, prets, bruit, assis, issue, mem:<nom>).`, moment, etape); return; }
    if (!OPERATEURS.includes(g.op)) err('condition-operateur', `${ou} : l’opérateur « ${String(g.op)} » est inconnu.`, moment, etape);
    if (g.k === 'issue') {
      if (typeof g.v !== 'string' || !g.v) err('condition-issue', `${ou} : la condition sur l’issue attend une lettre (A, B, T…).`, moment, etape);
      if (g.op !== '=' && g.op !== '≠') err('condition-issue-operateur', `${ou} : l’issue se compare avec = ou ≠.`, moment, etape);
    } else if (g.k.startsWith('mem:')) {
      const nom = g.k.slice(4);
      if (!memoiresConnues.has(nom)) avt('memoire-jamais-posee', `${ou} : la mémoire « ${nom} » n’est posée par aucun bloc Mémoire (elle vaudra 0).`, moment, etape);
    } else if (typeof g.v !== 'number' || !Number.isFinite(g.v)) {
      err('condition-valeur', `${ou} : la condition « ${g.k} » attend un nombre.`, moment, etape);
    }
  }
}

const BLOC: Record<string, string> = { [TY_GARDE]: 'garde-fou', [TY_BOUCLE]: 'boucle', [TY_TIRAGE]: 'tirage', [TY_MEMOIRE]: 'mémoire', f3: 'tirage' };

/** Ne garde que les erreurs. */
export const erreursSeules = (l: Probleme[]) => l.filter(x => x.niveau === 'erreur');

// ── Chargement ─────────────────────────────────────────────────────────────────────────────────────────────────────

export class ErreurChargement extends Error {
  constructor(message: string) { super(message); this.name = 'ErreurChargement'; }
}

export const SALLE_PAR_DEFAUT: SalleSimulee = { aff: 60, part: 55, calme: 50, pen: 62 };

type Brut = Record<string, unknown>;
const estObjet = (x: unknown): x is Brut => !!x && typeof x === 'object' && !Array.isArray(x);
const nombre = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const texte = (x: unknown, d: string) => (typeof x === 'string' ? x : d);

/**
 * Lit un fichier conducteur (texte JSON ou objet déjà lu) : accepte un FichierConducteur complet ou un Projet nu,
 * et complète les valeurs par défaut (moment sans sortie, étape sans rotatifs, salle simulée absente…).
 * Ne valide pas la cohérence : appeler validerProjet() ensuite. Lève ErreurChargement si la forme est méconnaissable.
 */
export function chargerFichier(json: unknown): FichierConducteur {
  let x = json;
  if (typeof x === 'string') {
    try { x = JSON.parse(x); } catch (e) { throw new ErreurChargement(`Le fichier n’est pas du JSON valide : ${(e as Error).message}`); }
  }
  if (!estObjet(x)) throw new ErreurChargement('Le fichier ne contient pas un objet JSON.');
  let projetBrut: unknown;
  let assets: unknown = [];
  let runs: unknown = [];
  if ('project' in x) {
    if (x.format !== undefined && x.format !== FORMAT) throw new ErreurChargement(`Format « ${String(x.format)} » inconnu (attendu : ${FORMAT}).`);
    projetBrut = x.project;
    assets = x.assets ?? [];
    runs = x.runs ?? [];
  } else if ('ev' in x) projetBrut = x;
  else throw new ErreurChargement(`Ni fichier « ${FORMAT} » (champ project) ni projet nu (champ ev).`);
  if (!estObjet(projetBrut)) throw new ErreurChargement('Le projet est illisible.');
  return {
    format: FORMAT,
    project: normaliserProjet(projetBrut),
    assets: Array.isArray(assets) ? (assets as FichierConducteur['assets']) : [],
    runs: Array.isArray(runs) ? (runs as FichierConducteur['runs']) : [],
  };
}

/** Complète un projet avec les valeurs par défaut. */
export function normaliserProjet(p: Brut): Projet {
  if (!Array.isArray(p.ev)) throw new ErreurChargement('Le projet n’a pas de liste de moments (« ev »).');
  const ev: Moment[] = (p.ev as unknown[]).filter(estObjet).map((m, i) => normaliserMoment(m, i));
  const acts = Array.isArray(p.acts) ? (p.acts as unknown[]).map((a, i) => ({ n: estObjet(a) ? texte(a.n, `Acte ${i + 1}`) : `Acte ${i + 1}` })) : [];
  const actMax = ev.reduce((mx, m) => Math.max(mx, m.act), -1);
  while (acts.length <= actMax) acts.push({ n: `Acte ${acts.length + 1}` });
  const sens = estObjet(p.sens) ? p.sens : {};
  const out: Projet = {
    acts, ev,
    sens: {
      aff: nombre(sens.aff, SALLE_PAR_DEFAUT.aff), part: nombre(sens.part, SALLE_PAR_DEFAUT.part),
      calme: nombre(sens.calme, SALLE_PAR_DEFAUT.calme), pen: nombre(sens.pen, SALLE_PAR_DEFAUT.pen),
    },
    hold: estObjet(p.hold) ? (p.hold as Record<string, number>) : {},
    go: estObjet(p.go) ? (p.go as Record<string, number>) : {},
    ver: nombre(p.ver, 1),
    nid: nombre(p.nid, 100),
    tracks: Array.isArray(p.tracks) ? (p.tracks as Projet['tracks']) : [],
  };
  if (typeof p.titre === 'string') out.titre = p.titre;
  if (estObjet(p.memoires)) out.memoires = p.memoires as Projet['memoires'];
  return out;
}

function normaliserMoment(m: Brut, i: number): Moment {
  const id = texte(m.id, `e${i + 1}`);
  const st: Etape[] = Array.isArray(m.st) ? (m.st as unknown[]).filter(estObjet).map((e, j) => normaliserEtape(e, j)) : [];
  const tr: Sortie[] = Array.isArray(m.tr) ? (m.tr as unknown[]).filter(estObjet).map(normaliserSortie) : [];
  let entry: Moment['entry'];
  if (typeof m.entry === 'string' && m.entry) entry = m.entry;
  else if (estObjet(m.entry)) entry = m.entry as Record<string, string>;
  else entry = st[0]?.id ?? '';
  const g = estObjet(m.gate) ? m.gate : {};
  const gate: Passage = {
    mode: g.mode === 'go' ? 'go' : 'auto',
    g: Array.isArray(g.g) ? (g.g as unknown[]).filter(estObjet).map(normaliserCondition) : [],
  };
  return { id, act: Math.max(0, Math.floor(nombre(m.act, 0))), name: texte(m.name, id), entry, st, tr, gate };
}

function normaliserEtape(e: Brut, j: number): Etape {
  const id = texte(e.id, `s${j + 1}`);
  const kb = Array.isArray(e.k) ? (e.k as unknown[]) : [];
  const k = [nombre(kb[0], 0), nombre(kb[1], 50), nombre(kb[2], 50), ...kb.slice(3).map(v => nombre(v, 50))];
  const out: Etape = {
    id, name: texte(e.name, id), ty: texte(e.ty, 'k:passage'),
    c: nombre(e.c, j), r: nombre(e.r, 0), dx: nombre(e.dx, 0), dy: nombre(e.dy, 0), k,
  };
  if (typeof e.asset === 'string') out.asset = e.asset;
  if (estObjet(e.params)) out.params = e.params;
  return out;
}

function normaliserSortie(s: Brut): Sortie {
  const out: Sortie = {
    a: texte(s.a, ''), b: texte(s.b, ''),
    g: Array.isArray(s.g) ? (s.g as unknown[]).filter(estObjet).map(normaliserCondition) : [],
    mode: s.mode === 'any' ? 'any' : 'all',
  };
  if (typeof s.nom === 'string') out.nom = s.nom;
  if (typeof s.poids === 'number') out.poids = s.poids;
  return out;
}

function normaliserCondition(c: Brut): Condition {
  // Le design n'écrit que ≥ et ≤ ; on accepte aussi les formes ASCII.
  const ops: Record<string, Condition['op']> = { '>=': '≥', '<=': '≤', '==': '=', '!=': '≠' };
  const op = typeof c.op === 'string' ? (ops[c.op] ?? (c.op as Condition['op'])) : '≥';
  return { k: texte(c.k, ''), op, v: typeof c.v === 'number' || typeof c.v === 'string' ? c.v : 0 };
}
