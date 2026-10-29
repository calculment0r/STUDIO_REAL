// Calculs PURS de l'outil de fluidité (aucun navigateur ici) : statistiques, images, trace du navigateur, profil du
// processeur, différence entre deux photos de la sonde, comparaison de deux résultats. Séparés de mesurer.ts pour
// pouvoir être relus (et testés) sans lancer Edge.

export const arrondi = (x: number, d = 1) => { const k = 10 ** d; return Math.round(x * k) / k; };

/** Centile (0..100) par interpolation sur un tableau déjà trié. */
export function centile(tries: number[], p: number): number {
  if (!tries.length) return 0;
  const i = (p / 100) * (tries.length - 1), a = Math.floor(i), b = Math.ceil(i);
  return tries[a]! + (tries[b]! - tries[a]!) * (i - a);
}

export interface Distribution { n: number; moyenne: number; p50: number; p95: number; p99: number; max: number }
export function distribution(valeurs: number[], d = 2): Distribution {
  const t = [...valeurs].sort((a, b) => a - b);
  const somme = t.reduce((s, x) => s + x, 0);
  return { n: t.length, moyenne: arrondi(t.length ? somme / t.length : 0, d), p50: arrondi(centile(t, 50), d), p95: arrondi(centile(t, 95), d), p99: arrondi(centile(t, 99), d), max: arrondi(t.length ? t[t.length - 1]! : 0, d) };
}

// ── images ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface MesureImages {
  /** images dessinées pendant la phase */ n: number;
  /** images par seconde (n / durée) */ fps: number;
  /** écart entre deux images successives (ms) */ ecart: Distribution;
  /** nombre d'écarts > 16,7 ms (une image manquée si l'écran est à 60 Hz), > 20, > 33, > 50 et > 100 ms */
  sup16: number; sup20: number; sup33: number; sup50: number; sup100: number;
  /** part du temps passée en écarts > 20 ms, en % : la fluidité « vécue » */ partLentePct: number;
}
export function analyserImages(ts: number[], dureeS: number): MesureImages {
  const ecarts: number[] = [];
  for (let i = 1; i < ts.length; i++) ecarts.push(ts[i]! - ts[i - 1]!);
  const c = (s: number) => ecarts.filter((e) => e > s).length;
  const total = ecarts.reduce((s, e) => s + e, 0) || 1;
  const lent = ecarts.filter((e) => e > 20).reduce((s, e) => s + e, 0);
  return { n: ts.length, fps: arrondi(ts.length / Math.max(dureeS, 1e-9)), ecart: distribution(ecarts), sup16: c(16.7), sup20: c(20), sup33: c(33.4), sup50: c(50), sup100: c(100), partLentePct: arrondi((lent / total) * 100) };
}

// ── photos de la sonde : différence début / fin ─────────────────────────────────────────────────────────────────────
type Fiche = { appels: number; execs: number; ms: number; delai?: number };
export interface Photo {
  raf: Record<string, Fiche>; timeouts: Record<string, Fiche>; intervals: Record<string, Fiche>;
  stockage: { ecritures: number; octets: number; ms: number }; clone: { appels: number; ms: number }; canal: { messages: number };
  react: { commits: number; renderMs: number; racines: Record<string, number>; rendus: Record<string, number>; fibres: number; commitsVides: number; petits: Record<string, number> };
  actifs: { intervalles: Record<string, number>; nbIntervalles: number; timeoutsEnAttente: number }; t: number;
}
export interface LigneParSeconde { nom: string; appelsParS: number; execsParS: number; msParS: number; delai?: number }

function diffFiches(a: Record<string, Fiche>, b: Record<string, Fiche>, dureeS: number): LigneParSeconde[] {
  const r: LigneParSeconde[] = [];
  for (const [nom, f] of Object.entries(b)) {
    const p = a[nom] ?? { appels: 0, execs: 0, ms: 0 };
    const l = { nom, appelsParS: arrondi((f.appels - p.appels) / dureeS, 2), execsParS: arrondi((f.execs - p.execs) / dureeS, 2), msParS: arrondi((f.ms - p.ms) / dureeS, 3), ...(f.delai !== undefined ? { delai: f.delai } : {}) };
    if (l.appelsParS || l.execsParS) r.push(l);
  }
  return r.sort((x, y) => y.msParS - x.msParS || y.execsParS - x.execsParS);
}

export interface DiffSonde {
  raf: LigneParSeconde[]; rafAppelsParS: number; rafMsParS: number;
  timeouts: LigneParSeconde[]; timeoutsParS: number; intervalles: LigneParSeconde[]; intervallesParS: number;
  intervallesActifs: Record<string, number>; nbIntervallesActifs: number; timeoutsEnAttente: number;
  stockage: { ecrituresParS: number; koParS: number; msParS: number }; clone: { appelsParS: number; msParS: number }; canalMessagesParS: number;
  react: { commitsParS: number; renderMsParS: number; racines: Record<string, number>; rendus: Array<{ composant: string; rendusParS: number }>; rendusParCommit: number; commitsVidesParS: number; petitsCommits: Array<{ composants: string; parS: number }> };
}
export function diffSonde(a: Photo, b: Photo, dureeS: number): DiffSonde {
  const d = Math.max(dureeS, 1e-9);
  const raf = diffFiches(a.raf, b.raf, d), to = diffFiches(a.timeouts, b.timeouts, d), iv = diffFiches(a.intervals, b.intervals, d);
  const somme = (l: LigneParSeconde[], k: 'appelsParS' | 'msParS' | 'execsParS') => arrondi(l.reduce((s, x) => s + x[k], 0), 2);
  const racines: Record<string, number> = {};
  for (const [k, v] of Object.entries(b.react.racines)) racines[k] = arrondi((v - (a.react.racines[k] ?? 0)) / d, 2);
  const rendus = Object.entries(b.react.rendus).map(([composant, v]) => ({ composant, rendusParS: arrondi((v - (a.react.rendus[composant] ?? 0)) / d, 2) }))
    .filter((x) => x.rendusParS > 0).sort((x, y) => y.rendusParS - x.rendusParS);
  const commits = b.react.commits - a.react.commits;
  return {
    raf, rafAppelsParS: somme(raf, 'appelsParS'), rafMsParS: somme(raf, 'msParS'),
    timeouts: to, timeoutsParS: somme(to, 'execsParS'), intervalles: iv, intervallesParS: somme(iv, 'execsParS'),
    intervallesActifs: b.actifs.intervalles, nbIntervallesActifs: b.actifs.nbIntervalles, timeoutsEnAttente: b.actifs.timeoutsEnAttente,
    stockage: { ecrituresParS: arrondi((b.stockage.ecritures - a.stockage.ecritures) / d, 2), koParS: arrondi((b.stockage.octets - a.stockage.octets) / 1024 / d, 1), msParS: arrondi((b.stockage.ms - a.stockage.ms) / d, 3) },
    clone: { appelsParS: arrondi((b.clone.appels - a.clone.appels) / d, 2), msParS: arrondi((b.clone.ms - a.clone.ms) / d, 3) },
    canalMessagesParS: arrondi((b.canal.messages - a.canal.messages) / d, 2),
    react: { commitsParS: arrondi(commits / d, 2), renderMsParS: arrondi((b.react.renderMs - a.react.renderMs) / d, 3), racines, rendus, rendusParCommit: commits ? arrondi((b.react.fibres - a.react.fibres) / commits, 1) : 0,
      commitsVidesParS: arrondi((b.react.commitsVides - a.react.commitsVides) / d, 2),
      petitsCommits: Object.entries(b.react.petits).map(([composants, v]) => ({ composants, parS: arrondi((v - (a.react.petits[composants] ?? 0)) / d, 2) })).filter((x) => x.parS > 0).sort((x, y) => y.parS - x.parS).slice(0, 8) },
  };
}

// ── métriques du navigateur (Performance.getMetrics) ────────────────────────────────────────────────────────────────
export type Metriques = Record<string, number>;
export interface DiffMetriques {
  tacheMsParS: number; scriptMsParS: number; styleMsParS: number; layoutMsParS: number;
  layoutsParS: number; recalculsStyleParS: number; nodes: number; ecouteurs: number; tasChargeMo: number; tasEcartMo: number;
}
export function diffMetriques(a: Metriques, b: Metriques, dureeS: number): DiffMetriques {
  const d = Math.max(dureeS, 1e-9), ms = (k: string) => arrondi(((b[k] ?? 0) - (a[k] ?? 0)) * 1000 / d, 2);
  return {
    tacheMsParS: ms('TaskDuration'), scriptMsParS: ms('ScriptDuration'), styleMsParS: ms('RecalcStyleDuration'), layoutMsParS: ms('LayoutDuration'),
    layoutsParS: arrondi(((b.LayoutCount ?? 0) - (a.LayoutCount ?? 0)) / d, 2), recalculsStyleParS: arrondi(((b.RecalcStyleCount ?? 0) - (a.RecalcStyleCount ?? 0)) / d, 2),
    nodes: b.Nodes ?? 0, ecouteurs: b.JSEventListeners ?? 0, tasChargeMo: arrondi((b.JSHeapUsedSize ?? 0) / 1048576), tasEcartMo: arrondi(((b.JSHeapUsedSize ?? 0) - (a.JSHeapUsedSize ?? 0)) / 1048576),
  };
}

// ── trace du navigateur (Tracing, catégorie devtools.timeline) ──────────────────────────────────────────────────────
export interface EvTrace { ph?: string; name?: string; cat?: string; ts?: number; dur?: number; pid?: number; tid?: number; args?: any }

export interface AnalyseTrace {
  /** processus de rendu analysé : celui dont le fil principal a travaillé le plus */ pid: number;
  /** durée de travail du fil principal par seconde (ms) */ occupationMsParS: number;
  /** décomposition en ms par seconde (les parties s'additionnent environ : un script peut contenir un recalcul forcé) */
  scriptMsParS: number; styleMsParS: number; layoutMsParS: number; peintureMsParS: number; gcMsParS: number;
  /** tâches du fil principal : nombre par seconde, durée (ms), nombre > 16,7 / 50 / 100 ms */
  taches: Distribution & { parS: number; sup16: number; sup50: number; sup100: number };
  /** travail du fil principal par image dessinée (ms) : tâches tombées entre deux images ; script seul */
  parImage: { occupation: Distribution; script: Distribution };
  /** les 5 tâches les plus longues : instant (s depuis le début de la phase), durée, et ce qu'elles contenaient */
  pires: Array<{ tS: number; dureeMs: number; contenu: string }>;
  /** peinture : nombre d'événements « Paint » par seconde et les éléments les plus souvent repeints */
  /** temps PROPRE par type d'événement (durée moins celle des événements contenus), en ms par seconde : où passe le temps */
  parNom: Array<{ nom: string; msParS: number }>;
  peinture: { evenementsParS: number; noeuds: Array<{ noeud: string; parS: number; msParS: number; aireMoyennePx: number }> };
}

const SCRIPT = new Set(['FunctionCall', 'EvaluateScript', 'v8.run', 'v8.callFunction', 'RunMicrotasks', 'v8.compile']);
const STYLE = new Set(['UpdateLayoutTree', 'RecalculateStyles']);
const LAYOUT = new Set(['Layout']);
const PEINTURE = new Set(['PrePaint', 'Paint', 'Layerize', 'Commit', 'UpdateLayer', 'UpdateLayerTree', 'CompositeLayers', 'HitTest']);
const GC = new Set(['MinorGC', 'MajorGC', 'V8.GC_MC_BACKGROUND_MARKING']);

/** Recolle les paires B/E en événements complets. */
function completer(evs: EvTrace[]): EvTrace[] {
  const sortie: EvTrace[] = [];
  const piles = new Map<string, EvTrace[]>();
  for (const e of evs) {
    if (e.ph === 'X' && e.dur !== undefined) sortie.push(e);
    else if (e.ph === 'B') { const k = `${e.pid}:${e.tid}`; (piles.get(k) ?? piles.set(k, []).get(k)!).push(e); }
    else if (e.ph === 'E') { const p = piles.get(`${e.pid}:${e.tid}`)?.pop(); if (p && p.ts !== undefined && e.ts !== undefined) sortie.push({ ...p, ph: 'X', dur: e.ts - p.ts }); }
  }
  return sortie;
}

/** Somme des durées des événements les plus externes d'un ensemble (ceux qui ne sont pas dans un autre du même ensemble). */
function sommeExterne(evs: EvTrace[], noms: Set<string>): number {
  let total = 0, fin = -Infinity;
  for (const e of evs) {
    if (!noms.has(e.name ?? '')) continue;
    const t = e.ts!, f = t + e.dur!;
    if (t >= fin) { total += e.dur!; fin = f; } else if (f > fin) { total += f - fin; fin = f; }
  }
  return total;
}

/** Trace préparée une fois : événements complets du fil principal du processus de rendu le plus occupé, triés. */
export interface TracePreparee { pid: number; evs: EvTrace[]; taches: EvTrace[] }

/**
 * Prépare la trace : garde le fil principal (CrRendererMain) du processus le plus occupé (la page de la régie ; la sortie,
 * si elle partage le processus, y est comprise). Si la trace contient les tâches (RunTask) on les utilise ; sinon on
 * reconstitue des « tâches » en fusionnant les événements qui se touchent (à 0,1 ms près).
 */
export function preparerTrace(brut: EvTrace[]): TracePreparee | null {
  const fils = new Map<string, string>();
  for (const e of brut) if (e.ph === 'M' && e.name === 'thread_name') fils.set(`${e.pid}:${e.tid}`, String(e.args?.name ?? ''));
  const principaux = completer(brut.filter((e) => e.ts !== undefined && e.ph !== 'M' && fils.get(`${e.pid}:${e.tid}`) === 'CrRendererMain'));
  const occupation = new Map<string, number>();
  for (const e of principaux) occupation.set(`${e.pid}:${e.tid}`, (occupation.get(`${e.pid}:${e.tid}`) ?? 0) + (e.name === 'RunTask' ? e.dur! : 0));
  let meilleur = [...occupation.entries()].sort((a, b) => b[1] - a[1])[0];
  if (meilleur && meilleur[1] === 0) {
    const somme = new Map<string, number>();
    for (const e of principaux) if (SCRIPT.has(e.name ?? '') || STYLE.has(e.name ?? '') || LAYOUT.has(e.name ?? '')) somme.set(`${e.pid}:${e.tid}`, (somme.get(`${e.pid}:${e.tid}`) ?? 0) + e.dur!);
    meilleur = [...somme.entries()].sort((a, b) => b[1] - a[1])[0];
  }
  if (!meilleur) return null;
  const evs = principaux.filter((e) => `${e.pid}:${e.tid}` === meilleur![0]).sort((a, b) => a.ts! - b.ts! || b.dur! - a.dur!);
  let taches = evs.filter((e) => e.name === 'RunTask');
  if (!taches.length) {
    taches = [];
    for (const e of evs) {
      const dernier = taches[taches.length - 1];
      if (dernier && e.ts! <= dernier.ts! + dernier.dur! + 100) { const fin = Math.max(dernier.ts! + dernier.dur!, e.ts! + e.dur!); dernier.dur = fin - dernier.ts!; }
      else taches.push({ name: 'RunTask', ts: e.ts, dur: e.dur, pid: e.pid, tid: e.tid, ph: 'X' });
    }
  }
  return { pid: Number(meilleur[0].split(':')[0]), evs, taches };
}

/** Analyse d'une fenêtre [debutUs, finUs] (horloge de la trace, µs) ; `imagesUs` : instants des images, sur la même horloge. */
export function analyserTrace(prep: TracePreparee | null, debutUs: number, finUs: number, imagesUs: number[]): AnalyseTrace | null {
  if (!prep) return null;
  const dans = (e: EvTrace) => e.ts! + e.dur! >= debutUs && e.ts! <= finUs;
  const mien = prep.evs.filter(dans);
  const taches = prep.taches.filter(dans);
  const dureeS = (finUs - debutUs) / 1e6;
  const tMs = taches.map((e) => e.dur! / 1000);
  const parS = (noms: Set<string>) => arrondi(sommeExterne(mien, noms) / 1000 / dureeS, 2);

  // travail par image : on découpe l'axe du temps par les instants d'images de la page
  const bornes = imagesUs.filter((t) => t >= debutUs && t <= finUs).sort((a, b) => a - b);
  const occImage: number[] = [], scrImage: number[] = [];
  if (bornes.length > 1) {
    let k = 0, kEv = 0;
    for (let i = 1; i < bornes.length; i++) {
      const a = bornes[i - 1]!, b = bornes[i]!;
      let occ = 0;
      while (k < taches.length && taches[k]!.ts! + taches[k]!.dur! < a) k++;
      for (let j = k; j < taches.length && taches[j]!.ts! < b; j++) {
        const t = taches[j]!, d = Math.min(b, t.ts! + t.dur!) - Math.max(a, t.ts!);
        if (d > 0) occ += d;
      }
      while (kEv < mien.length && mien[kEv]!.ts! + mien[kEv]!.dur! < a && mien[kEv]!.ts! + 1e6 < a) kEv++;
      const dedans: EvTrace[] = [];
      for (let j = kEv; j < mien.length && mien[j]!.ts! < b; j++) {
        const e = mien[j]!;
        if (e.ts! + e.dur! > a && SCRIPT.has(e.name ?? '')) dedans.push({ ...e, ts: Math.max(e.ts!, a), dur: Math.min(e.ts! + e.dur!, b) - Math.max(e.ts!, a) });
      }
      occImage.push(occ / 1000);
      scrImage.push(sommeExterne(dedans, SCRIPT) / 1000);
    }
  }

  const pires = [...taches].sort((a, b) => b.dur! - a.dur!).slice(0, 5).map((t) => {
    const interieur = mien.filter((e) => e.ts! >= t.ts! && e.ts! + e.dur! <= t.ts! + t.dur! + 1 && e.dur! > t.dur! * 0.1 && e.name !== 'RunTask');
    const parNom = new Map<string, number>();
    for (const e of interieur) { const n = e.name === 'FunctionCall' ? 'FunctionCall ' + (e.args?.data?.functionName ?? '') : (e.name ?? ''); parNom.set(n, Math.max(parNom.get(n) ?? 0, e.dur!)); }
    const contenu = [...parNom.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, d]) => `${n.trim()} ${arrondi(d / 1000, 1)} ms`).join(' ; ');
    return { tS: arrondi((t.ts! - debutUs) / 1e6), dureeMs: arrondi(t.dur! / 1000), contenu };
  });

  const propre = new Map<string, number>();
  const pile: Array<{ fin: number; nom: string }> = [];
  for (const e of mien) {
    const debut = Math.max(e.ts!, debutUs), fin = Math.min(e.ts! + e.dur!, finUs), nom = e.name ?? '?';
    if (fin <= debut || nom === 'RunTask' || nom.startsWith('AnimationFrame')) continue;
    while (pile.length && pile[pile.length - 1]!.fin <= debut) pile.pop();
    const d = fin - debut;
    propre.set(nom, (propre.get(nom) ?? 0) + d);
    if (pile.length) { const p = pile[pile.length - 1]!; propre.set(p.nom, (propre.get(p.nom) ?? 0) - d); }
    pile.push({ fin, nom });
  }
  const parNom = [...propre.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([nom, us]) => ({ nom, msParS: arrondi(us / 1000 / dureeS, 2) }));
  const parNoeud = new Map<string, { n: number; ms: number; aire: number }>();
  let nbPaint = 0;
  for (const e of mien) {
    if (e.name !== 'Paint') continue;
    nbPaint++;
    const d = e.args?.data ?? {}, c: number[] | undefined = d.clip;
    const nom = String(d.nodeName ?? '?').replace(/s+/g, ' ').slice(0, 70);
    const f = parNoeud.get(nom) ?? { n: 0, ms: 0, aire: 0 };
    f.n++; f.ms += e.dur! / 1000;
    if (c && c.length >= 8) f.aire += Math.abs((c[2]! - c[0]!) * (c[5]! - c[3]!));
    parNoeud.set(nom, f);
  }
  const peinture = {
    evenementsParS: arrondi(nbPaint / dureeS, 1),
    noeuds: [...parNoeud.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 8).map(([noeud, f]) => ({ noeud, parS: arrondi(f.n / dureeS, 1), msParS: arrondi(f.ms / dureeS, 2), aireMoyennePx: Math.round(f.aire / f.n) })),
  };
  return {
    pid: prep.pid,
    occupationMsParS: arrondi(taches.reduce((s, e) => s + e.dur!, 0) / 1000 / dureeS, 1),
    scriptMsParS: parS(SCRIPT), styleMsParS: parS(STYLE), layoutMsParS: parS(LAYOUT), peintureMsParS: parS(PEINTURE), gcMsParS: parS(GC),
    taches: { ...distribution(tMs), parS: arrondi(taches.length / dureeS, 1), sup16: tMs.filter((x) => x > 16.7).length, sup50: tMs.filter((x) => x > 50).length, sup100: tMs.filter((x) => x > 100).length },
    parImage: { occupation: distribution(occImage), script: distribution(scrImage) },
    pires, peinture, parNom,
  };
}

// ── profil du processeur (Profiler) ─────────────────────────────────────────────────────────────────────────────────
export interface NoeudProfil { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }
export interface ProfilBrut { nodes: NoeudProfil[]; samples: number[]; timeDeltas: number[]; startTime: number; endTime: number }
export interface LigneProfil { fonction: string; fichier: string; proprePct: number; inclusifPct: number; propreMs: number; inclusifMs: number }
export interface AnalyseProfil { dureeMs: number; occupePct: number; inactifPct: number; propre: LigneProfil[]; composants: LigneProfil[]; notables: LigneProfil[]; parFichier: Array<{ fichier: string; propreMs: number; pct: number }> }

const NOTABLES = /^(renderWithHooks|performUnitOfWork|performWorkOnRoot|commitRoot|commitRootImpl|flushPassiveEffects|flushSpawnedWork|recursivelyTraversePassiveMountEffects|updateReducer|reconcileChildren|beginWork|completeWork|createElement|structuredClone|stringify|parse|setItem|image|tick|_tick|render|renderStart|update|publier|avancerLecture|etat|JSON\.stringify|garbage collector|\(garbage collector\)|\(program\))$/;

export function analyserProfil(p: ProfilBrut, nbHaut = 25): AnalyseProfil {
  const noeud = new Map<number, NoeudProfil>(); const parent = new Map<number, number>();
  for (const n of p.nodes) { noeud.set(n.id, n); for (const c of n.children ?? []) parent.set(c, n.id); }
  const propre = new Map<number, number>();
  const n = p.samples.length;
  for (let i = 0; i < n; i++) propre.set(p.samples[i]!, (propre.get(p.samples[i]!) ?? 0) + (p.timeDeltas[i + 1] ?? p.timeDeltas[i] ?? 0) / 1000);
  const cle = (id: number) => { const c = noeud.get(id)!.callFrame; return (c.functionName || '(anonyme)') + '\u0000' + (c.url.split('/').pop() ?? '').replace(/-[A-Za-z0-9_-]{8}\.js/, '.js') + ':' + (c.lineNumber + 1); };
  const sp = new Map<string, number>(), si = new Map<string, number>();
  let total = 0, inactif = 0;
  const parFichier = new Map<string, number>();
  for (const [id, ms] of propre) {
    total += ms;
    const nom = noeud.get(id)!.callFrame.functionName;
    if (nom === '(idle)') inactif += ms;
    const k = cle(id); sp.set(k, (sp.get(k) ?? 0) + ms);
    if (nom !== '(idle)' && nom !== '(program)') { const f = k.split('\u0000')[1]!.split(':')[0]!; parFichier.set(f, (parFichier.get(f) ?? 0) + ms); }
    const vus = new Set<string>();
    for (let x: number | undefined = id; x !== undefined; x = parent.get(x)) { const kk = cle(x); if (!vus.has(kk)) { vus.add(kk); si.set(kk, (si.get(kk) ?? 0) + ms); } }
  }
  const occupe = total - inactif;
  const ligne = (k: string): LigneProfil => {
    const [fonction, fichier] = k.split('\u0000') as [string, string];
    return { fonction, fichier, propreMs: arrondi(sp.get(k) ?? 0), inclusifMs: arrondi(si.get(k) ?? 0), proprePct: arrondi(((sp.get(k) ?? 0) / (total || 1)) * 100), inclusifPct: arrondi(((si.get(k) ?? 0) / (total || 1)) * 100) };
  };
  const toutes = [...new Set([...sp.keys(), ...si.keys()])];
  const hors = (k: string) => !/^\((idle|program|root)\)/.test(k);
  return {
    dureeMs: arrondi(total), occupePct: arrondi((occupe / (total || 1)) * 100), inactifPct: arrondi((inactif / (total || 1)) * 100),
    propre: toutes.filter(hors).sort((a, b) => (sp.get(b) ?? 0) - (sp.get(a) ?? 0)).slice(0, nbHaut).map(ligne),
    composants: toutes.filter((k) => /^[A-Z][A-Za-z0-9]+\u0000/.test(k) && !/^(Object|Array|Map|Set|Promise|Error|Date|Number|String|Symbol|Function|Math|JSON|Proxy|Reflect)\u0000/.test(k))
      .sort((a, b) => (si.get(b) ?? 0) - (si.get(a) ?? 0)).slice(0, nbHaut).map(ligne),
    notables: toutes.filter((k) => NOTABLES.test(k.split('\u0000')[0]!)).sort((a, b) => (si.get(b) ?? 0) - (si.get(a) ?? 0)).slice(0, 15).map(ligne),
    parFichier: [...parFichier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([fichier, ms]) => ({ fichier, propreMs: arrondi(ms), pct: arrondi((ms / (occupe || 1)) * 100) })),
  };
}

// ── comparaison de deux résultats (avant / après) ───────────────────────────────────────────────────────────────────
export interface ResultatPhase { nom: string; [k: string]: any }
export interface Resultat { meta: any; phases: ResultatPhase[] }
const CHEMINS: Array<[string, string, 'bas' | 'haut']> = [
  ['régie · images par seconde', 'regie.images.fps', 'haut'],
  ['régie · images > 20 ms', 'regie.images.sup20', 'bas'],
  ['régie · images > 50 ms', 'regie.images.sup50', 'bas'],
  ['régie · écart d\'image p95 (ms)', 'regie.images.ecart.p95', 'bas'],
  ['régie · fil principal occupé (ms/s)', 'regie.metriques.tacheMsParS', 'bas'],
  ['régie · script (ms/s)', 'regie.metriques.scriptMsParS', 'bas'],
  ['régie · trace : travail par image p95 (ms)', 'regie.trace.parImage.occupation.p95', 'bas'],
  ['régie · rendus React validés par seconde', 'regie.sonde.react.commitsParS', 'bas'],
  ['régie · temps de rendu React (ms/s)', 'regie.sonde.react.renderMsParS', 'bas'],
  ['régie · rappels d\'image par seconde', 'regie.sonde.rafAppelsParS', 'bas'],
  ['régie · nœuds du document', 'regie.noeuds.total', 'bas'],
  ['régie · mémoire JS après nettoyage (Mo)', 'regie.memoire.apresGcMo', 'bas'],
  ['sortie · images par seconde', 'sortie.images.fps', 'haut'],
  ['sortie · script (ms/s)', 'sortie.metriques.scriptMsParS', 'bas'],
];
const lire = (o: any, chemin: string): number | undefined => chemin.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o) as number | undefined;

/** Tableau texte « avant | après | variation » pour chaque phase commune. */
export function comparer(a: Resultat, b: Resultat): string {
  const l: string[] = [];
  for (const pa of a.phases) {
    const pb = b.phases.find((x) => x.nom === pa.nom);
    if (!pb) continue;
    l.push(`\n== phase « ${pa.nom} » ==`, `${'mesure'.padEnd(46)}${'avant'.padStart(10)}${'après'.padStart(10)}${'variation'.padStart(12)}`);
    for (const [nom, chemin, mieux] of CHEMINS) {
      const x = lire(pa, chemin), y = lire(pb, chemin);
      if (x === undefined || y === undefined) continue;
      const v = x === 0 ? (y === 0 ? '=' : '+') : `${y >= x ? '+' : ''}${arrondi(((y - x) / Math.abs(x)) * 100, 0)} %`;
      const bien = y === x ? '' : (mieux === 'bas') === (y < x) ? '  mieux' : '  pire';
      l.push(`${nom.padEnd(46)}${String(arrondi(x, 2)).padStart(10)}${String(arrondi(y, 2)).padStart(10)}${v.padStart(12)}${bien}`);
    }
  }
  return l.join('\n');
}
