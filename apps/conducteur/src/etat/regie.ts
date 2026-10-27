// Pupitre de la régie (chantier INTÉGRATION) : ce que la régie peut poser pendant la représentation (entrées extérieures
// du moteur : Lecteur.poser / signal / reprendre) et le journal de ce que le moteur a émis (commandes des blocs, entrées
// reçues, alertes). Fonctions PURES : le magasin et le panneau les utilisent, les tests les vérifient.
//
// Une étape peut déclarer la mémoire qu'elle attend de l'extérieur par `params.entree` (un objet ou une liste) :
//   { memoire: 'jauge', par: 'variable JAUGE_SALLE', pas: 50, min: 0, max: 1000 }
//   { memoire: 'recu_lance', valeurs: ['oui', 'non'], par: 'bouton « Reçu » du chef' }
// Le pupitre la met alors en tête quand son moment joue, avec ses valeurs proposées.
import {
  comportementBloc, normaliserNom, reglagesComedien, reglagesMachine, reglagesMemoire, reglagesMessage, reglagesSignal,
  type AlerteLecture, type CommandeLecture, type Condition, type Etape, type EvenementLecture, type Moment, type Projet,
} from '@studio-real/modele';

export type ValeurMemoire = number | string | boolean;

/** Entrée régie déclarée sur une étape (`params.entree`). */
export interface EntreeDeclaree { memoire: string; valeurs?: string[]; pas?: number; min?: number; max?: number; par?: string }

export interface MemoireRegie {
  nom: string;
  /** valeur au début du spectacle (Projet.memoires) */
  initiale?: ValeurMemoire;
  /** valeurs proposées : conditions qui la lisent, blocs Mémoire qui la posent, params.entree.valeurs */
  choix: string[];
  numerique: boolean;
  pas: number;
  min?: number;
  max?: number;
  /** qui l'écrit d'habitude (params.entree.par) */
  par?: string;
  /** lue ou attendue par le moment donné */
  ici: boolean;
  /** déclarée « écrite de l'extérieur » par une étape (params.entree) */
  exterieure: boolean;
}

/** Entrées déclarées par une étape (params.entree : objet ou liste d'objets). */
export function entreesDeclarees(st: Pick<Etape, 'params'>): EntreeDeclaree[] {
  const brut = st.params?.entree;
  const liste = Array.isArray(brut) ? brut : brut ? [brut] : [];
  const out: EntreeDeclaree[] = [];
  for (const x of liste) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (typeof o.memoire !== 'string' || !o.memoire.trim()) continue;
    const e: EntreeDeclaree = { memoire: o.memoire.trim() };
    if (Array.isArray(o.valeurs)) e.valeurs = o.valeurs.filter(v => typeof v === 'string' || typeof v === 'number').map(String);
    if (typeof o.pas === 'number' && o.pas > 0) e.pas = o.pas;
    if (typeof o.min === 'number') e.min = o.min;
    if (typeof o.max === 'number') e.max = o.max;
    if (typeof o.par === 'string') e.par = o.par;
    out.push(e);
  }
  return out;
}

const conditionsDu = (m: Moment): Condition[] => [...m.tr.flatMap(t => t.g), ...m.gate.g];
const estOuiNon = (v: string) => { const n = normaliserNom(v); return n === 'oui' || n === 'non'; };

/** Mémoires de spectacle connues du projet, celles du moment `ici` (lues ou attendues) en tête. */
export function memoiresRegie(projet: Projet, ici?: string | null): MemoireRegie[] {
  const parNom = new Map<string, MemoireRegie>();
  const ordre: string[] = [];
  const obtenir = (nom: string): MemoireRegie => {
    let m = parNom.get(nom);
    if (!m) {
      const initiale = projet.memoires?.[nom];
      m = { nom, choix: [], numerique: typeof initiale === 'number', pas: 1, ici: false, exterieure: false };
      if (initiale !== undefined) m.initiale = initiale;
      parNom.set(nom, m);
      ordre.push(nom);
    }
    return m;
  };
  const proposer = (m: MemoireRegie, v: unknown) => {
    if (typeof v === 'number') { m.numerique = true; return; }
    if (typeof v === 'boolean') v = v ? 'oui' : 'non';
    if (typeof v !== 'string' || !v.trim() || m.choix.includes(v)) return;
    m.choix.push(v);
  };
  for (const nom of Object.keys(projet.memoires ?? {})) obtenir(nom);
  for (const mo of projet.ev) {
    const local = mo.id === ici;
    for (const c of conditionsDu(mo)) {
      if (!c.k.startsWith('mem:')) continue;
      const m = obtenir(c.k.slice(4));
      if (c.op === '=' || c.op === '≠') proposer(m, c.v); else m.numerique = true;
      if (local) m.ici = true;
    }
    for (const st of mo.st) {
      if (comportementBloc(st.ty) === 'memoire') {
        const r = reglagesMemoire(st);
        const m = obtenir(r.nom);
        if (r.op === 'poser') proposer(m, r.valeur); else m.numerique = true;
      }
      for (const e of entreesDeclarees(st)) {
        const m = obtenir(e.memoire);
        m.exterieure = true;
        if (local) m.ici = true;
        for (const v of e.valeurs ?? []) proposer(m, v);
        if (e.pas !== undefined) { m.pas = e.pas; m.numerique = true; }
        if (e.min !== undefined) { m.min = e.min; m.numerique = true; }
        if (e.max !== undefined) { m.max = e.max; m.numerique = true; }
        if (e.par && !m.par) m.par = e.par;
      }
    }
  }
  for (const m of parNom.values()) {
    if (typeof m.initiale === 'string' && m.initiale && !m.choix.includes(m.initiale)) m.choix.push(m.initiale);
    if (m.choix.some(estOuiNon)) for (const v of ['oui', 'non']) if (!m.choix.includes(v)) m.choix.push(v);
    if (m.numerique) m.choix = m.choix.filter(v => !Number.isFinite(Number(v)));
  }
  const rang = (m: MemoireRegie) => (m.ici ? 0 : m.exterieure ? 1 : 2);
  return ordre.map(n => parNom.get(n)!).sort((a, b) => rang(a) - rang(b));
}

// ─── signaux attendus ───────────────────────────────────────────────────────────────────────────────────────────────
export interface SignalAttendu {
  nom: string;
  /** 'signal' (Écoute d'un signal) · 'accuse' (Commande machine) · 'lu' (Message) · 'transcription' (Quand le
   *  comédien dit) · 'condition' (sig: / sigv: d'une sortie ou du passage) */
  genre: 'signal' | 'accuse' | 'lu' | 'transcription' | 'condition';
  /** étape qui l'attend (nom affiché) */
  etape?: string;
  etapeId?: string;
  /** mots-clés (Quand le comédien dit) */
  mots?: string[];
}

/** Signaux attendus par les blocs (q:signal, s:machine, c:message, q:comedien-dit) et les conditions sig: / sigv: d'un
 *  moment ; l'étape `etape` (celle qui joue) en tête. */
export function signauxAttendus(projet: Projet, moment: string | null | undefined, etape?: string | null): SignalAttendu[] {
  const m = projet.ev.find(x => x.id === moment);
  if (!m) return [];
  const vus = new Set<string>();
  const out: SignalAttendu[] = [];
  const ajouter = (s: SignalAttendu) => {
    const cle = normaliserNom(s.nom);
    if (!cle || vus.has(cle)) return;
    vus.add(cle);
    out.push(s);
  };
  for (const st of m.st) {
    const c = comportementBloc(st.ty);
    if (c === 'signal') ajouter({ nom: reglagesSignal(st).signal, genre: 'signal', etape: st.name, etapeId: st.id });
    else if (c === 'machine') ajouter({ nom: reglagesMachine(st).accuse, genre: 'accuse', etape: st.name, etapeId: st.id });
    else if (c === 'message') ajouter({ nom: reglagesMessage(st).accuse, genre: 'lu', etape: st.name, etapeId: st.id });
    else if (c === 'comedien') { const r = reglagesComedien(st); ajouter({ nom: r.source, genre: 'transcription', etape: st.name, etapeId: st.id, mots: r.mots }); }
  }
  for (const c of conditionsDu(m)) {
    const r = /^(sig|sigv):(.+)$/.exec(c.k);
    if (r) ajouter({ nom: r[2]!, genre: 'condition' });
  }
  return out.sort((a, b) => Number(b.etapeId === etape && !!etape) - Number(a.etapeId === etape && !!etape));
}

// ─── journal de régie ───────────────────────────────────────────────────────────────────────────────────────────────
export interface LigneRegie {
  /** numéro d'ordre dans le journal (clé) */
  n: number;
  t: number;
  genre: 'commande' | 'entree' | 'alerte';
  /** étiquette courte en capitales (MACHINE, MESSAGE, SIGNAL, MÉMOIRE, SÉCURITÉ…) */
  type: string;
  txt: string;
  moment: string;
  etape?: string;
  /** horodatage mural de réception (alertes : affichage temporaire du bandeau) */
  recu: number;
}

const ETIQUETTES_COMMANDE: Record<string, string> = {
  machine: 'MACHINE', message: 'MESSAGE', chrono: 'CHRONO', 'chrono.10s': 'CHRONO', 'figurants.cmd': 'FIGURANTS', reprise: 'REPRISE',
};

const court = (v: unknown, n = 90): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v) ?? '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

/** Résumé lisible des données d'une commande. */
export function resumeCommande(c: Pick<CommandeLecture, 'type' | 'donnees'>): string {
  const d = c.donnees ?? {};
  const t = (k: string) => (typeof d[k] === 'string' || typeof d[k] === 'number' ? String(d[k]) : '');
  if (c.type === 'machine') return [t('cible'), t('commande')].filter(Boolean).join(' · ');
  if (c.type === 'message') return [t('destinataire'), court(t('texte'), 70)].filter(Boolean).join(' · ');
  if (c.type === 'chrono') return ['chrono ' + (t('duree') || '?') + ' s', t('affichage')].filter(Boolean).join(' · ');
  if (c.type === 'chrono.10s') return '10 s restantes';
  if (c.type === 'figurants.cmd') return [t('densite'), t('humeur'), d.dire ? '« ' + court(d.dire, 50) + ' »' : ''].filter(Boolean).join(' · ');
  if (c.type === 'reprise') return ['reprise « ' + t('nom') + ' »', t('restaure')].filter(Boolean).join(' · ');
  return court(d);
}

export function ligneCommande(c: CommandeLecture, n: number, recu: number): LigneRegie {
  const l: LigneRegie = { n, t: c.t, genre: 'commande', type: ETIQUETTES_COMMANDE[c.type] ?? c.type.toUpperCase(), txt: resumeCommande(c), moment: c.moment, recu };
  if (c.etape) l.etape = c.etape;
  return l;
}

/** Ligne d'un événement du journal du moteur ; les étapes jouées dans une séquence ne vont pas au journal de régie. */
export function ligneEvenement(e: EvenementLecture, n: number, recu: number): LigneRegie | null {
  if (e.type === 'sous-etape') return null;
  const type = e.type === 'signal' ? 'SIGNAL' : e.type === 'memoire' ? 'MÉMOIRE' : e.type === 'mot' ? 'MOT' : 'REPRISE';
  const v = e.valeur === undefined || e.valeur === null ? '' : typeof e.valeur === 'object' ? ' · ' + court(e.valeur, 50) : (e.type === 'memoire' ? ' = ' : ' · ') + String(e.valeur);
  const l: LigneRegie = { n, t: e.t, genre: 'entree', type, txt: e.nom + v, moment: e.moment, recu };
  if (e.etape) l.etape = e.etape;
  return l;
}

const ETIQUETTES_ALERTE: Record<AlerteLecture['type'], string> = {
  delai: 'DÉLAI', boucle: 'BOUCLE', bloque: 'BLOQUÉ', force: 'FORCÉ', signal: 'SIGNAL', machine: 'MACHINE', message: 'MESSAGE',
  sequence: 'SÉQUENCE', reprise: 'REPRISE',
};

export function ligneAlerte(a: AlerteLecture, n: number, recu: number): LigneRegie {
  const l: LigneRegie = { n, t: a.t, genre: 'alerte', type: ETIQUETTES_ALERTE[a.type] ?? 'ALERTE', txt: a.txt, moment: a.moment, recu };
  if (a.etape) l.etape = a.etape;
  return l;
}

/** Valeur saisie au pupitre → valeur de mémoire (nombre si c'en est un, oui/non tels quels, sinon texte). */
export function lireValeur(texte: string): ValeurMemoire {
  const s = texte.trim();
  if (s !== '' && Number.isFinite(Number(s.replace(',', '.')))) return Number(s.replace(',', '.'));
  return s;
}

/** Valeur numérique d'une mémoire (non définie → 0, oui → 1, non → 0). */
export function enNombre(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') { const n = normaliserNom(v); if (n === 'oui') return 1; if (n === 'non' || n === '') return 0; const x = Number(v); return Number.isFinite(x) ? x : 0; }
  return 0;
}
