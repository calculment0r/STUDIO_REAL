// Message `lecture` allégé : calcul d'un `delta` côté serveur (une trace par session de la régie) et fusion côté régie.
// PUR : aucune entrée-sortie. Le serveur garde, par session, ce qu'il a déjà envoyé (`SuiviLecture`) ; la régie garde
// l'état reconstitué et applique chaque delta avec `fusionnerDelta`. Voir PROTOCOLE.md (section `lecture`).
import type { EtatLecture } from '@studio-real/modele';
import type { DeltaLecture } from './spectacle';

type Dico = Record<string, unknown>;

/** Champs toujours présents dans l'état : leur nouvelle valeur part quand elle change. */
const SCALAIRES = ['retard', 'moment', 'etape', 'attenteGo', 'bloque', 'termine'] as const;
/** Champs facultatifs : valeur nouvelle, ou nom dans `retires` s'ils disparaissent. */
const FACULTATIFS = ['phase', 'retenu', 'prolonge', 'issue', 'sequence'] as const;
/** Dictionnaires : seules les clés changées partent ; une clé disparue va dans `retires` (`champ.cle`). */
export const DICTIONNAIRES_LECTURE = ['memoires', 'receptions', 'tours', 'attentes', 'votes'] as const;
/** Tableaux qui ne font que grandir : seules les entrées ajoutées partent. */
export const TABLEAUX_LECTURE = ['parcours', 'journal', 'commandes', 'alertes'] as const;

type NomTableau = (typeof TABLEAUX_LECTURE)[number];

/** Ce qui a déjà été envoyé à une session : de quoi calculer le delta suivant sans garder une copie de l'état. */
export interface SuiviLecture {
  t: number;
  tEtape: number;
  /** valeur JSON de chaque champ simple (absent du dictionnaire : le champ n'existe pas) */
  simples: Record<string, string>;
  /** valeur JSON de chaque clé de chaque dictionnaire, en paires [clé, JSON] (null : le dictionnaire est absent) ; tout
   *  le suivi est du JSON ordinaire, il se range dans l'instantané du serveur */
  dicos: Record<string, [string, string][] | null>;
  /** nombre d'entrées déjà envoyées de chaque tableau */
  longueurs: Record<NomTableau, number>;
  /** JSON des points de reprise */
  reprises: string;
}

const json = (x: unknown): string | undefined => JSON.stringify(x);

function dicoDe(x: unknown): [string, string][] | null {
  if (x === undefined || x === null || typeof x !== 'object') return null;
  return Object.entries(x as Dico).map(([k, v]) => [k, json(v) ?? 'null']);
}

/** Trace de ce que contient `etat` (à appeler quand un `lecture` complet part). */
export function suivreLecture(etat: EtatLecture): SuiviLecture {
  const e = etat as unknown as Dico;
  const simples: SuiviLecture['simples'] = {};
  for (const c of [...SCALAIRES, ...FACULTATIFS]) { const j = json(e[c]); if (j !== undefined) simples[c] = j; }
  const dicos: SuiviLecture['dicos'] = {};
  for (const c of DICTIONNAIRES_LECTURE) dicos[c] = dicoDe(e[c]);
  const longueurs = { parcours: 0, journal: 0, commandes: 0, alertes: 0 } as Record<NomTableau, number>;
  for (const c of TABLEAUX_LECTURE) longueurs[c] = (e[c] as unknown[] | undefined)?.length ?? 0;
  return { t: etat.t, tEtape: etat.tEtape, simples, dicos, longueurs, reprises: json(etat.reprises ?? []) ?? '[]' };
}

/**
 * Delta entre ce qui est déjà parti (`suivi`) et `etat`, ou null si un delta ne peut pas le dire (un tableau a
 * rétréci : le lecteur a été relancé) → envoyer un `complet`. `change` est faux quand rien n'a bougé (t compris) : il
 * n'y a alors rien à envoyer. Quand le delta est retenu, `suivi` est mis à jour pour l'état envoyé.
 */
export function calculerDelta(suivi: SuiviLecture, etat: EtatLecture): { d: DeltaLecture; change: boolean } | null {
  const e = etat as unknown as Dico;
  const d: Dico = { t: etat.t, tEtape: etat.tEtape };
  let change = etat.t !== suivi.t || etat.tEtape !== suivi.tEtape;
  const suivant = suivreLecture(etat);

  for (const c of TABLEAUX_LECTURE) {
    const tab = (e[c] as unknown[] | undefined) ?? [];
    if (tab.length < suivi.longueurs[c]) return null;
    if (tab.length > suivi.longueurs[c]) { d[c] = tab.slice(suivi.longueurs[c]); change = true; }
  }

  const retires: string[] = [];
  for (const c of SCALAIRES) {
    if (suivant.simples[c] === suivi.simples[c]) continue;
    d[c] = e[c];
    change = true;
  }
  for (const c of FACULTATIFS) {
    if (suivant.simples[c] === suivi.simples[c]) continue;
    change = true;
    if (e[c] === undefined) retires.push(c); else d[c] = e[c];
  }
  for (const c of DICTIONNAIRES_LECTURE) {
    const avant = suivi.dicos[c] ? new Map(suivi.dicos[c]) : null, apres = suivant.dicos[c];
    if (!apres) {
      if (avant) { retires.push(c); change = true; }
      continue;
    }
    const valeurs = e[c] as Dico;
    const changees: Dico = {};
    let n = 0;
    for (const [k, v] of apres) if (avant?.get(k) !== v) { Object.defineProperty(changees, k, { value: valeurs[k], enumerable: true, writable: true, configurable: true }); n++; }
    if (avant) { const presentes = new Set(apres.map(x => x[0])); for (const k of avant.keys()) if (!presentes.has(k)) { retires.push(`${c}.${k}`); change = true; } }
    if (n > 0 || !avant) { d[c] = changees; change = true; }
  }
  if (suivant.reprises !== suivi.reprises) { d.reprises = etat.reprises ?? []; change = true; }
  if (retires.length) d.retires = retires;

  // Le delta est retenu : la trace passe à l'état envoyé.
  Object.assign(suivi, suivant);
  return { d: d as unknown as DeltaLecture, change };
}

const CHAMPS_SIMPLES = new Set<string>([...SCALAIRES, ...FACULTATIFS]);
const CHAMPS_DICOS = new Set<string>(DICTIONNAIRES_LECTURE);

/** Applique un delta à l'état reconstitué : tableaux concaténés, dictionnaires fusionnés. Renvoie un nouvel objet. */
export function fusionnerDelta(etat: EtatLecture, d: DeltaLecture): EtatLecture {
  const base = etat as unknown as Dico;
  const src = d as unknown as Dico;
  const e: Dico = { ...base, t: d.t, tEtape: d.tEtape };
  for (const c of CHAMPS_SIMPLES) if (c in src && src[c] !== undefined) e[c] = src[c];
  for (const c of DICTIONNAIRES_LECTURE) if (src[c] !== undefined) e[c] = { ...(base[c] as Dico | undefined), ...(src[c] as Dico) };
  for (const c of TABLEAUX_LECTURE) if (src[c] !== undefined) e[c] = [...((base[c] as unknown[] | undefined) ?? []), ...(src[c] as unknown[])];
  if (d.reprises !== undefined) e.reprises = d.reprises;
  for (const r of d.retires ?? []) {
    const i = r.indexOf('.');
    if (i < 0) { if (CHAMPS_SIMPLES.has(r) || CHAMPS_DICOS.has(r)) delete e[r]; continue; }
    const champ = r.slice(0, i), cle = r.slice(i + 1);
    if (!CHAMPS_DICOS.has(champ) || !e[champ] || typeof e[champ] !== 'object') continue;
    const copie = { ...(e[champ] as Dico) };
    delete copie[cle];
    e[champ] = copie;
  }
  return e as unknown as EtatLecture;
}
