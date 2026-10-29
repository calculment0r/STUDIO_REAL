// Scénario d'une répétition technique : une liste d'étapes horodatées (secondes depuis le début), les réglages de la
// salle (téléphones, mélange, arrivées) et les seuils chiffrés. Module PUR : il lit, valide, trie et évalue ; il ne
// connaît ni le réseau ni l'émulateur (outils/repetition/repetition.ts s'en sert pour jouer le scénario).
//
// Format JSON (voir scenario-echo.json) :
//   { "nom", "description"?, "telephones": 150, "melange": "soiree", "duree": 300, "graine"?, "auto"?,
//     "arrivees": { "surS": 60 },
//     "seuils": { "p95AckMs": 2000, "refus": 0, "reconnexionsRatees": 0 },
//     "etapes": [ { "a": 65, "faire": "go" }, { "a": 70, "faire": "vote", "repartition": { "A": 60, "B": 40 }, "part": 0.7 }, … ] }
// Étapes : go · vote · ecrire · toucher · coupure · attendre (un repère, sans action).

export const ACTIONS = ['go', 'vote', 'ecrire', 'toucher', 'coupure', 'attendre'] as const;
export type Action = (typeof ACTIONS)[number];

export type EtapeScenario =
  | { a: number; faire: 'go'; note?: string }
  | { a: number; faire: 'vote'; repartition: Record<string, number>; dansS: number; part: number; note?: string }
  | { a: number; faire: 'ecrire'; parMinute: number; dureeS: number; part: number; note?: string }
  | { a: number; faire: 'toucher'; selecteur: string; dansS: number; part: number; note?: string }
  | { a: number; faire: 'coupure'; part: number; dureeS: number; note?: string }
  | { a: number; faire: 'attendre'; note?: string };

export interface Seuils {
  /** p95 des accusés d'affichage (ms) : au-delà, la répétition échoue */
  p95AckMs: number;
  /** nombre de refus du serveur toléré */
  refus: number;
  /** reconnexions ratées tolérées */
  reconnexionsRatees: number;
}

export interface Scenario {
  nom: string;
  description?: string;
  telephones: number;
  melange: string;
  /** durée de la répétition (secondes) */
  duree: number;
  graine: number;
  /** comportement automatique des téléphones (voter, toucher…) : faux dans un scénario scripté */
  auto: boolean;
  arrivees: { surS: number };
  seuils: Seuils;
  /** triées par temps (à égalité : l'ordre du fichier) */
  etapes: EtapeScenario[];
}

export const SEUILS_PAR_DEFAUT: Seuils = { p95AckMs: 2000, refus: 0, reconnexionsRatees: 0 };

export class ErreurScenario extends Error {
  readonly problemes: string[];
  constructor(problemes: string[]) {
    super(`Scénario invalide :\n  - ${problemes.join('\n  - ')}`);
    this.name = 'ErreurScenario';
    this.problemes = problemes;
  }
}

const estObjet = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Clés permises par action (au-delà de `a` et `faire`) : une faute de frappe est une erreur, pas un réglage perdu. */
const CLES: Record<Action, readonly string[]> = {
  go: ['note'],
  vote: ['repartition', 'dansS', 'part', 'note'],
  ecrire: ['parMinute', 'dureeS', 'part', 'note'],
  toucher: ['selecteur', 'dansS', 'part', 'note'],
  coupure: ['part', 'dureeS', 'note'],
  attendre: ['note'],
};

/** Lit un scénario (texte JSON ou objet déjà lu), le valide en entier (tous les problèmes d'un coup) et le trie. */
export function lireScenario(brut: unknown): Scenario {
  let x = brut;
  if (typeof brut === 'string') {
    try { x = JSON.parse(brut); } catch (e) { throw new ErreurScenario([`JSON illisible (${(e as Error).message})`]); }
  }
  if (!estObjet(x)) throw new ErreurScenario(['un objet JSON est attendu']);
  const p: string[] = [];

  const nombre = (v: unknown, quoi: string, o: { min?: number; max?: number; entier?: boolean; defaut?: number } = {}): number => {
    if (v === undefined && o.defaut !== undefined) return o.defaut;
    if (typeof v !== 'number' || !Number.isFinite(v)) { p.push(`${quoi} : un nombre est attendu`); return o.defaut ?? 0; }
    if (o.entier && !Number.isInteger(v)) p.push(`${quoi} : un entier est attendu (reçu ${v})`);
    if (o.min !== undefined && v < o.min) p.push(`${quoi} : ${v} est trop petit (minimum ${o.min})`);
    if (o.max !== undefined && v > o.max) p.push(`${quoi} : ${v} est trop grand (maximum ${o.max})`);
    return v;
  };
  const texte = (v: unknown, quoi: string, defaut?: string): string => {
    if (v === undefined && defaut !== undefined) return defaut;
    if (typeof v !== 'string' || !v.trim()) { p.push(`${quoi} : un texte non vide est attendu`); return defaut ?? ''; }
    return v.trim();
  };

  const nom = texte(x.nom, 'nom');
  const telephones = nombre(x.telephones, 'telephones', { min: 1, max: 5000, entier: true, defaut: 150 });
  const melange = texte(x.melange, 'melange', 'soiree');
  const graine = nombre(x.graine, 'graine', { min: 0, entier: true, defaut: 2026 });
  const auto = x.auto === undefined ? false : x.auto === true;
  if (x.auto !== undefined && typeof x.auto !== 'boolean') p.push('auto : vrai ou faux attendu');
  let surS = 60;
  if (x.arrivees !== undefined) {
    if (!estObjet(x.arrivees)) p.push('arrivees : un objet { "surS": secondes } est attendu');
    else surS = nombre(x.arrivees.surS, 'arrivees.surS', { min: 0, defaut: 60 });
  }

  const seuils: Seuils = { ...SEUILS_PAR_DEFAUT };
  if (x.seuils !== undefined) {
    if (!estObjet(x.seuils)) p.push('seuils : un objet est attendu');
    else {
      for (const k of Object.keys(x.seuils)) if (!(k in SEUILS_PAR_DEFAUT)) p.push(`seuils.${k} : seuil inconnu (permis : ${Object.keys(SEUILS_PAR_DEFAUT).join(', ')})`);
      seuils.p95AckMs = nombre(x.seuils.p95AckMs, 'seuils.p95AckMs', { min: 1, defaut: SEUILS_PAR_DEFAUT.p95AckMs });
      seuils.refus = nombre(x.seuils.refus, 'seuils.refus', { min: 0, entier: true, defaut: SEUILS_PAR_DEFAUT.refus });
      seuils.reconnexionsRatees = nombre(x.seuils.reconnexionsRatees, 'seuils.reconnexionsRatees', { min: 0, entier: true, defaut: SEUILS_PAR_DEFAUT.reconnexionsRatees });
    }
  }

  const etapes: EtapeScenario[] = [];
  if (!Array.isArray(x.etapes)) p.push('etapes : une liste est attendue');
  else {
    x.etapes.forEach((e: unknown, i: number) => {
      const q = `etapes[${i}]`;
      if (!estObjet(e)) { p.push(`${q} : un objet est attendu`); return; }
      const faire = e.faire;
      if (typeof faire !== 'string' || !(ACTIONS as readonly string[]).includes(faire)) {
        p.push(`${q}.faire : « ${String(faire)} » inconnu (permis : ${ACTIONS.join(', ')})`);
        return;
      }
      const action = faire as Action;
      for (const k of Object.keys(e)) if (k !== 'a' && k !== 'faire' && !CLES[action].includes(k)) p.push(`${q}.${k} : clé inconnue pour « ${action} » (permis : ${CLES[action].join(', ')})`);
      const a = nombre(e.a, `${q}.a`, { min: 0 });
      const note = typeof e.note === 'string' ? { note: e.note } : {};
      const part = () => nombre(e.part, `${q}.part`, { min: 0.0001, max: 1, defaut: 1 });
      switch (action) {
        case 'go': etapes.push({ a, faire: 'go', ...note }); break;
        case 'attendre': etapes.push({ a, faire: 'attendre', ...note }); break;
        case 'vote': {
          const r = e.repartition;
          let repartition: Record<string, number> = {};
          if (!estObjet(r) || !Object.keys(r).length) p.push(`${q}.repartition : un objet non vide { "A": 60, "B": 40 } est attendu`);
          else {
            repartition = {};
            for (const [k, v] of Object.entries(r)) {
              if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) p.push(`${q}.repartition.${k} : un poids positif est attendu`);
              else repartition[k] = v;
            }
            if (Object.keys(repartition).length && !Object.values(repartition).some(v => v > 0)) p.push(`${q}.repartition : au moins un poids doit être positif`);
          }
          etapes.push({ a, faire: 'vote', repartition, dansS: nombre(e.dansS, `${q}.dansS`, { min: 0, defaut: 20 }), part: part(), ...note });
          break;
        }
        case 'ecrire':
          etapes.push({ a, faire: 'ecrire', parMinute: nombre(e.parMinute, `${q}.parMinute`, { min: 0.01 }), dureeS: nombre(e.dureeS, `${q}.dureeS`, { min: 1, defaut: 60 }), part: part(), ...note });
          break;
        case 'toucher':
          etapes.push({ a, faire: 'toucher', selecteur: texte(e.selecteur, `${q}.selecteur`), dansS: nombre(e.dansS, `${q}.dansS`, { min: 0, defaut: 5 }), part: part(), ...note });
          break;
        case 'coupure':
          etapes.push({ a, faire: 'coupure', part: nombre(e.part, `${q}.part`, { min: 0.0001, max: 1 }), dureeS: nombre(e.dureeS, `${q}.dureeS`, { min: 1 }), ...note });
          break;
      }
    });
  }

  const dernier = etapes.reduce((m, e) => Math.max(m, e.a), 0);
  const duree = nombre(x.duree, 'duree', { min: 1, defaut: Math.ceil(dernier + 30) });
  if (p.length) throw new ErreurScenario(p);

  // tri stable par temps : à égalité, l'ordre du fichier est gardé
  const tries = etapes.map((e, i) => ({ e, i })).sort((u, v) => u.e.a - v.e.a || u.i - v.i).map(u => u.e);
  const sc: Scenario = { nom, telephones, melange, duree, graine, auto, arrivees: { surS }, seuils, etapes: tries };
  if (typeof x.description === 'string') sc.description = x.description;
  return sc;
}

export interface Reglages {
  telephones?: number;
  melange?: string;
  duree?: number;
}

/** Les réglages de la ligne de commande l'emportent sur ceux du fichier. */
export function appliquerReglages(s: Scenario, r: Reglages): Scenario {
  const p: string[] = [];
  if (r.telephones !== undefined && (!Number.isInteger(r.telephones) || r.telephones < 1 || r.telephones > 5000)) p.push(`telephones : un entier de 1 à 5000 est attendu (reçu ${r.telephones})`);
  if (r.duree !== undefined && !(r.duree > 0)) p.push(`duree : un nombre de secondes positif est attendu (reçu ${r.duree})`);
  if (r.melange !== undefined && !r.melange.trim()) p.push('melange : un nom est attendu');
  if (p.length) throw new ErreurScenario(p);
  return {
    ...s,
    ...(r.telephones !== undefined ? { telephones: r.telephones } : {}),
    ...(r.melange !== undefined ? { melange: r.melange.trim() } : {}),
    ...(r.duree !== undefined ? { duree: r.duree } : {}),
  };
}

/** Les étapes qui tombent avant la fin de la répétition, et celles qui sont hors durée (ignorées, mais dites). */
export function etapesJouables(s: Scenario): { jouees: EtapeScenario[]; ignorees: EtapeScenario[] } {
  return { jouees: s.etapes.filter(e => e.a < s.duree), ignorees: s.etapes.filter(e => e.a >= s.duree) };
}

/** Une ligne lisible pour une étape. */
export function libelleEtape(e: EtapeScenario): string {
  const pc = (x: number) => `${Math.round(x * 100)} %`;
  switch (e.faire) {
    case 'go': return 'GO';
    case 'attendre': return `repère${e.note ? ` « ${e.note} »` : ''}`;
    case 'vote': return `vote de ${pc(e.part)} des téléphones en ${e.dansS} s (${Object.entries(e.repartition).map(([k, v]) => `${k} ${v}`).join(', ')})`;
    case 'ecrire': return `messages : ${e.parMinute}/min pendant ${e.dureeS} s`;
    case 'toucher': return `« ${e.selecteur} » touché par ${pc(e.part)} en ${e.dansS} s`;
    case 'coupure': return `coupure de ${pc(e.part)} des téléphones pendant ${e.dureeS} s`;
  }
}

/** Ce que les seuils jugent. */
export interface Constats {
  p95AckMs: number;
  /** accusés mesurés (zéro : rien n'a été prouvé) */
  accuses: number;
  refus: number;
  reconnexionsRatees: number;
}

export interface Verdict {
  ok: boolean;
  depassements: string[];
}

export function evaluerSeuils(seuils: Seuils, c: Constats): Verdict {
  const d: string[] = [];
  if (c.accuses === 0) d.push('aucun accusé d’affichage mesuré : rien n’a été prouvé (la salle est-elle arrivée ? le GO est-il parti ?)');
  if (c.p95AckMs > seuils.p95AckMs) d.push(`p95 des accusés ${c.p95AckMs} ms > seuil ${seuils.p95AckMs} ms`);
  if (c.refus > seuils.refus) d.push(`${c.refus} refus du serveur > seuil ${seuils.refus}`);
  if (c.reconnexionsRatees > seuils.reconnexionsRatees) d.push(`${c.reconnexionsRatees} reconnexion(s) ratée(s) > seuil ${seuils.reconnexionsRatees}`);
  return { ok: d.length === 0, depassements: d };
}
