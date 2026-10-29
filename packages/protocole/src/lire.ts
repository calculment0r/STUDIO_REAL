// Lecture et validation des messages du protocole de spectacle. Tout ce qui arrive d'un socket est une donnée non sûre :
// chaque message est vérifié champ par champ (validateurs écrits à la main, sans dépendance, dans le style de
// apps/conducteur/src/sortie/protocole.ts), borné (textes ≤ 2000 caractères, tableaux ≤ 200), puis reconstruit : les
// champs inconnus sont ignorés. PUR : aucune entrée-sortie.
import { RE_ID_ACTEUR, cibleDansFoule, type EtatLecture, type Vue } from '@studio-real/modele';
import { DICTIONNAIRES_LECTURE, TABLEAUX_LECTURE } from './lecture-delta';
import {
  GENRES_ENTREE, LIMITES, OPS_CONDUITE, ROLES, VERSION_PROTOCOLE,
  type EcranAffiche, type EntreeActeur, type GenreEntree, type MediaActeur, type MessageClient, type MessageServeur,
  type DeltaLecture, type LectureComplete, type MsgAgentAck, type MsgBienvenue, type MsgLecture, type MsgEtat, type MsgEtatActeur, type MsgHello, type MsgSalle, type NomOpConduite,
  type OpConduite, type RefusAffichage, type ResumeActeurSalle, type Role, type StatutAck, type VueDemandee, type VueDiffusee,
} from './spectacle';

export { VERSION_PROTOCOLE };

/** Résultat d'une lecture : le message typé, ou null et la raison du refus (« code : détail »). */
export type Lu<T> = { message: T; raison?: undefined } | { message: null; raison: string };

/** Refus interne (levé pendant la lecture, rendu en `raison`). */
// (sans propriété de paramètre : le paquet est aussi compilé par le Conducteur, en syntaxe effaçable seulement)
class Refus extends Error {
  readonly code: string;
  constructor(code: string, detail: string) { super(`${code} : ${detail}`); this.code = code; }
}

type Brut = Record<string, unknown>;

/** Session, personne : comme le protocole v1 de la salle. */
export const RE_SESSION = /^[A-Za-z0-9_-]{6,64}$/;
/** Jeton : caractères imprimables sans espace. */
export const RE_JETON = /^[\x21-\x7e]{1,512}$/;
/** Identifiant court (moment, étape, question, id d'effet). */
// eslint-disable-next-line no-control-regex -- on exclut volontairement les caractères de contrôle
const RE_COURT = /^[^\s\u0000-\u001f]{1,64}$/;
/** Nom de capacité, genre d'entrée d'agent, type de commande. */
const RE_NOM = /^[a-z][a-z0-9.:_-]{0,63}$/;
const CLES_INTERDITES = new Set(['__proto__', 'prototype', 'constructor']);
const REFUS_AFFICHAGE: readonly RefusAffichage[] = ['version', 'invalide', 'capacite'];
const STATUTS_ACK: readonly StatutAck[] = ['ok', 'doublon', 'refus', 'ferme'];
const STATUTS_AGENT: readonly MsgAgentAck['statut'][] = ['recu', 'fait', 'echec', 'refus'];
const LECTURES_MEDIA: readonly MediaActeur['lecture'][] = ['attente', 'lit', 'fin', 'bloque', 'absent'];

// ── Petits lecteurs de champs (lèvent Refus) ───────────────────────────────────────────────────────────────────────

const estObjet = (x: unknown): x is Brut => !!x && typeof x === 'object' && !Array.isArray(x);

function objet(x: unknown, champ: string): Brut {
  if (!estObjet(x)) throw new Refus('champ-invalide', `${champ} : objet attendu`);
  return x;
}
function texte(x: unknown, champ: string, max: number = LIMITES.texte, vide = false): string {
  if (typeof x !== 'string') throw new Refus('champ-invalide', `${champ} : texte attendu`);
  if (x.length > max) throw new Refus('trop-long', `${champ} : ${max} caractères au plus`);
  if (!vide && !x.trim()) throw new Refus('champ-invalide', `${champ} : vide`);
  return x;
}
function motif(x: unknown, champ: string, re: RegExp, aide: string): string {
  if (typeof x !== 'string' || !re.test(x)) throw new Refus('champ-invalide', `${champ} : ${aide}`);
  return x;
}
function nombre(x: unknown, champ: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Refus('champ-invalide', `${champ} : nombre attendu`);
  return x;
}
function entier(x: unknown, champ: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(x) || (x as number) < min || (x as number) > max)
    throw new Refus('champ-invalide', `${champ} : entier entre ${min} et ${max} attendu`);
  return x as number;
}
function booleen(x: unknown, champ: string): boolean {
  if (typeof x !== 'boolean') throw new Refus('champ-invalide', `${champ} : vrai ou faux attendu`);
  return x;
}
function parmi<T extends string>(x: unknown, liste: readonly T[], champ: string): T {
  if (typeof x !== 'string' || !(liste as readonly string[]).includes(x)) throw new Refus('champ-invalide', `${champ} : ${liste.join(' | ')}`);
  return x as T;
}
function tableau(x: unknown, champ: string, max: number = LIMITES.tableau): unknown[] {
  if (!Array.isArray(x)) throw new Refus('champ-invalide', `${champ} : tableau attendu`);
  if (x.length > max) throw new Refus('trop-long', `${champ} : ${max} éléments au plus`);
  return x;
}
const acteurId = (x: unknown, champ = 'acteur') => motif(x, champ, RE_ID_ACTEUR, 'identifiant d’acteur [A-Za-z0-9_-]{1,40}');
const court = (x: unknown, champ: string) => motif(x, champ, RE_COURT, 'identifiant de 1 à 64 caractères, sans espace');

/** Donnée libre (params, données d'entrée) : JSON borné en taille et en profondeur, sans clé dangereuse. */
function donnee(x: unknown, champ: string, profondeur = 0): unknown {
  if (x === null || typeof x === 'boolean') return x;
  if (typeof x === 'number') return nombre(x, champ);
  if (typeof x === 'string') return texte(x, champ, LIMITES.texte, true);
  if (profondeur >= LIMITES.profondeur) throw new Refus('trop-profond', `${champ} : ${LIMITES.profondeur} niveaux au plus`);
  if (Array.isArray(x)) {
    tableau(x, champ).forEach((v, i) => donnee(v, `${champ}[${i}]`, profondeur + 1));
    return x;
  }
  if (estObjet(x)) {
    const cles = Object.keys(x);
    if (cles.length > LIMITES.cles) throw new Refus('trop-long', `${champ} : ${LIMITES.cles} clés au plus`);
    for (const k of cles) {
      if (CLES_INTERDITES.has(k)) throw new Refus('champ-invalide', `${champ} : clé « ${k} » interdite`);
      if (k.length > 64) throw new Refus('trop-long', `${champ} : clé de 64 caractères au plus`);
      donnee(x[k], `${champ}.${k}`, profondeur + 1);
    }
    return x;
  }
  throw new Refus('champ-invalide', `${champ} : donnée JSON attendue`);
}
const objetLibre = (x: unknown, champ: string): Record<string, unknown> => donnee(objet(x, champ), champ) as Record<string, unknown>;

/** Champ facultatif : absent → undefined, présent → lu. */
function opt<T>(x: unknown, lire: (v: unknown) => T): T | undefined {
  return x === undefined ? undefined : lire(x);
}
/** Ajoute les champs définis (pas de clé `undefined` dans le message reconstruit). */
function avec<T extends object>(base: T, extra: Record<string, unknown>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** Texte JSON → objet, ou objet tel quel ; le champ `t` doit être un texte. */
function entree(x: unknown): Brut {
  let m = x;
  if (typeof m === 'string') {
    if (m.length > LIMITES.message) throw new Refus('trop-gros', `message de plus de ${LIMITES.message} caractères`);
    try { m = JSON.parse(m); } catch { throw new Refus('json-invalide', 'JSON illisible'); }
  }
  if (!estObjet(m)) throw new Refus('message-invalide', 'objet JSON attendu');
  if (typeof m.t !== 'string') throw new Refus('message-invalide', 'champ t manquant');
  return m;
}

function lire<T>(x: unknown, f: (m: Brut) => T): Lu<T> {
  try {
    return { message: f(entree(x)) };
  } catch (e) {
    if (e instanceof Refus) return { message: null, raison: e.message };
    throw e;
  }
}

// ── Client → serveur ───────────────────────────────────────────────────────────────────────────────────────────────

function lireHello(m: Brut): MsgHello {
  if (m.v !== VERSION_PROTOCOLE) throw new Refus('version', `protocole v${VERSION_PROTOCOLE} attendu (reçu : ${String(m.v)})`);
  const role = parmi<Role>(m.role, ROLES, 'role');
  const acteur = opt(m.acteur, v => acteurId(v));
  if ((role === 'acteur' || role === 'agent') && acteur === undefined) throw new Refus('champ-invalide', `acteur : obligatoire pour le rôle ${role}`);
  const app = opt(m.app, v => {
    const a = objet(v, 'app');
    return { version: texte(a.version, 'app.version', 40), build: texte(a.build, 'app.build', 80) };
  });
  const capacites = opt(m.capacites, v => tableau(v, 'capacites', 50).map((c, i) => motif(c, `capacites[${i}]`, RE_NOM, 'nom en minuscules')));
  return avec<MsgHello>({
    t: 'hello', v: VERSION_PROTOCOLE, role,
    session: motif(m.session, 'session', RE_SESSION, 'identifiant [A-Za-z0-9_-]{6,64}'),
    jeton: motif(m.jeton, 'jeton', RE_JETON, 'jeton de 1 à 512 caractères imprimables, sans espace'),
  }, {
    acteur,
    personne: opt(m.personne, v => motif(v, 'personne', RE_SESSION, 'identifiant [A-Za-z0-9_-]{6,64}')),
    vseq: opt(m.vseq, v => entier(v, 'vseq')),
    cseq: opt(m.cseq, v => entier(v, 'cseq')),
    app, capacites,
    pseudo: opt(m.pseudo, v => {
      const p = texte(v, 'pseudo', 20);
      if (p.trim().length < 2) throw new Refus('champ-invalide', 'pseudo : 2 à 20 caractères');
      return p;
    }),
  });
}

function lireOp(m: Brut): OpConduite {
  const op = parmi<NomOpConduite>(m.op, OPS_CONDUITE, 'op');
  switch (op) {
    case 'top': return { op };
    case 'lancer':
      return avec<OpConduite>({ op }, {
        mode: opt(m.mode, v => parmi(v, ['repetition', 'scene'] as const, 'mode')),
        graine: opt(m.graine, v => entier(v, 'graine', 0, 2 ** 32 - 1)),
      });
    case 'pause': return { op, pause: m.pause === undefined ? true : booleen(m.pause, 'pause') };
    case 'allerA': return avec<OpConduite>({ op, moment: court(m.moment, 'moment') }, { etape: opt(m.etape, v => court(v, 'etape')) });
    case 'reprendre': return avec<OpConduite>({ op }, { point: opt(m.point, v => texte(v, 'point', 64)) });
    case 'poser': {
      const valeur = m.valeur;
      if (typeof valeur !== 'number' && typeof valeur !== 'string' && typeof valeur !== 'boolean')
        throw new Refus('champ-invalide', 'valeur : nombre, texte ou vrai/faux attendu');
      if (typeof valeur === 'number') nombre(valeur, 'valeur');
      if (typeof valeur === 'string') texte(valeur, 'valeur', LIMITES.texte, true);
      return { op, nom: texte(m.nom, 'nom', 64), valeur };
    }
    case 'signal': return avec<OpConduite>({ op, nom: texte(m.nom, 'nom', 64) }, { donnees: opt(m.donnees, v => donnee(v, 'donnees')) });
    case 'forcer': {
      const acteur = texte(m.acteur, 'acteur', 200);
      if (!cibleDansFoule(acteur)) throw new Refus('champ-invalide', 'acteur : acteur ou cible dans la foule (public:ont-vote:A…)');
      const vue = objet(m.vue, 'vue');
      return {
        op, acteur,
        vue: avec<{ ecran: string; params?: Record<string, unknown> }>({ ecran: texte(vue.ecran, 'vue.ecran', 64) }, {
          params: opt(vue.params, v => objetLibre(v, 'vue.params')),
        }),
      };
    }
    case 'panique': return { op, actif: m.actif === undefined ? true : booleen(m.actif, 'actif') };
    case 'retenir': return { op, actif: m.actif === undefined ? true : booleen(m.actif, 'actif') };
    case 'prolonger': return { op, secondes: entier(m.secondes, 'secondes', 1, 600) };
    case 'valider':
      return avec<OpConduite>({ op, id: court(m.id, 'id'), ok: booleen(m.ok, 'ok') }, { texte: opt(m.texte, v => texte(v, 'texte')) });
  }
}

function lireEntreeActeur(m: Brut): EntreeActeur {
  const k = parmi<GenreEntree>(m.k, GENRES_ENTREE, 'k');
  const d = objet(m.data, 'data');
  const q = opt(m.q, v => court(v, 'q'));
  switch (k) {
    case 'vote':
      return avec<EntreeActeur>({ k, data: avec({ index: entier(d.index, 'data.index', 0, 25) }, { numero: opt(d.numero, v => nombre(v, 'data.numero')) }) }, { q });
    case 'texte': return avec<EntreeActeur>({ k, data: { texte: texte(d.texte, 'data.texte') } }, { q });
    case 'reaction':
      return { k, data: avec({ emoji: texte(d.emoji, 'data.emoji', 16) }, { n: opt(d.n, v => entier(v, 'data.n', 1, 100)) }) };
    case 'pret': return { k, data: { pret: d.pret === undefined ? true : booleen(d.pret, 'data.pret') } };
    case 'presence': return { k, data: { visible: booleen(d.visible, 'data.visible') } };
    case 'fin-video': return { k, data: avec({ asset: texte(d.asset, 'data.asset', 200) }, { vseq: opt(d.vseq, v => entier(v, 'data.vseq')) }) };
    case 'transcription':
      return { k, data: avec({ texte: texte(d.texte, 'data.texte', LIMITES.texte, true) }, { final: opt(d.final, v => booleen(v, 'data.final')) }) };
    case 'accuse':
      return {
        k, data: avec({ vseq: entier(d.vseq, 'data.vseq'), affiche: nombre(d.affiche, 'data.affiche') }, {
          refus: opt(d.refus, v => parmi(v, REFUS_AFFICHAGE, 'data.refus')),
        }),
      };
  }
}

function lireEcranAffiche(x: unknown): EcranAffiche | null {
  if (x === null) return null;
  const e = objet(x, 'ecran');
  return avec<EcranAffiche>({ vseq: entier(e.vseq, 'ecran.vseq'), ecran: texte(e.ecran, 'ecran.ecran', 64), depuis: nombre(e.depuis, 'ecran.depuis') }, {
    cle: opt(e.cle, v => texte(v, 'ecran.cle', 200)),
  });
}

/** Champs du battement communs au message de l'acteur (`etat`) et à son relais vers la régie. */
function champsEtat(m: Brut) {
  return {
    enLigne: opt(m.enLigne, v => booleen(v, 'enLigne')),
    rttMs: opt(m.rttMs, v => nombre(v, 'rttMs')),
    media: opt(m.media, v => tableau(v, 'media').map((x, i) => {
      const o = objet(x, `media[${i}]`);
      const pret = nombre(o.pret, `media[${i}].pret`);
      if (pret < 0 || pret > 1) throw new Refus('champ-invalide', `media[${i}].pret : entre 0 et 1`);
      return { asset: texte(o.asset, `media[${i}].asset`, 200), pret, lecture: parmi(o.lecture, LECTURES_MEDIA, `media[${i}].lecture`) };
    })),
    batterie: opt(m.batterie, v => {
      const b = nombre(v, 'batterie');
      if (b < 0 || b > 100) throw new Refus('champ-invalide', 'batterie : entre 0 et 100');
      return b;
    }),
    erreurs: opt(m.erreurs, v => tableau(v, 'erreurs').map((x, i) => texte(x, `erreurs[${i}]`))),
  };
}

function lireEtat(m: Brut): MsgEtat {
  return avec<MsgEtat>({ t: 'etat', heure: nombre(m.heure, 'heure'), ecran: lireEcranAffiche(m.ecran), visible: booleen(m.visible, 'visible') }, {
    ...champsEtat(m),
    decalageMs: opt(m.decalageMs, v => nombre(v, 'decalageMs')),
  });
}

function lireRtc(m: Brut, champVers: string): Record<string, unknown> {
  const signal = objet(m.signal, 'signal');
  if (JSON.stringify(signal).length > LIMITES.rtc) throw new Refus('trop-gros', `signal WebRTC de plus de ${LIMITES.rtc} caractères`);
  motif(m[champVers], champVers, /^[A-Za-z0-9_-]{1,64}$/, 'acteur ou session');
  return signal;
}

/** Lit et valide un message client → serveur. */
export function lireMessageClient(x: unknown): Lu<MessageClient> {
  return lire<MessageClient>(x, m => {
    switch (m.t) {
      case 'hello': return lireHello(m);
      case 'conduite': return { t: 'conduite', cseq: entier(m.cseq, 'cseq', 1), ...lireOp(m) };
      case 'in': return avec<MessageClient>({ t: 'in', cseq: entier(m.cseq, 'cseq', 1), ...lireEntreeActeur(m) }, { heure: opt(m.heure, v => nombre(v, 'heure')) });
      case 'etat': return lireEtat(m);
      case 'agent.ack':
        return avec<MessageClient>({ t: 'agent.ack', n: entier(m.n, 'n', 1), statut: parmi(m.statut, STATUTS_AGENT, 'statut') }, {
          detail: opt(m.detail, v => texte(v, 'detail')),
        });
      case 'agent.in':
        return { t: 'agent.in', cseq: entier(m.cseq, 'cseq', 1), k: motif(m.k, 'k', RE_NOM, 'nom en minuscules (say, stat, fin-appel…)'), data: objetLibre(m.data, 'data') };
      case 'ping': return { t: 'ping', tc: nombre(m.tc, 'tc') };
      case 'resync': return { t: 'resync' };
      case 'rtc': {
        const signal = lireRtc(m, 'vers');
        return { t: 'rtc', vers: m.vers as string, signal };
      }
      default: throw new Refus('type-inconnu', `type « ${m.t as string} » inconnu`);
    }
  });
}

// ── Serveur → client ───────────────────────────────────────────────────────────────────────────────────────────────

function lireVue(m: Brut, champ: string): VueDiffusee {
  return avec<VueDiffusee>({
    acteur: acteurId(m.acteur, `${champ}.acteur`),
    vseq: entier(m.vseq, `${champ}.vseq`),
    at: nombre(m.at, `${champ}.at`),
    ecran: m.ecran === null ? null : texte(m.ecran, `${champ}.ecran`, 64),
    params: objetLibre(m.params ?? {}, `${champ}.params`),
  }, { cle: opt(m.cle, v => texte(v, `${champ}.cle`, 200)) });
}

/** État de lecture : contrôle de forme seulement (il vient du serveur et son journal peut dépasser 200 entrées). */
function lireEtatLecture(x: unknown, champ: string): LectureComplete & { mode: 'complet' } {
  const l = objet(x, champ);
  const e = objet(l.etat, `${champ}.etat`);
  nombre(e.t, `${champ}.etat.t`);
  if (e.moment !== null && typeof e.moment !== 'string') throw new Refus('champ-invalide', `${champ}.etat.moment : texte ou null`);
  if (e.etape !== null && typeof e.etape !== 'string') throw new Refus('champ-invalide', `${champ}.etat.etape : texte ou null`);
  if (!Array.isArray(e.parcours)) throw new Refus('champ-invalide', `${champ}.etat.parcours : tableau attendu`);
  const lu: LectureComplete & { mode: 'complet' } = { mode: 'complet', etat: e as unknown as EtatLecture, par: texte(l.par, `${champ}.par`, 64), ts: nombre(l.ts, `${champ}.ts`) };
  if (l.seq !== undefined) lu.seq = entier(l.seq, `${champ}.seq`);
  return lu;
}

/** Plus de lignes qu'un tableau ordinaire : un delta qui suit une longue coupure peut porter beaucoup d'entrées. */
const MAX_ENTREES_DELTA = 5000;
const CHAMPS_RETIRES = new Set<string>(['issue', 'phase', 'retenu', 'prolonge', 'sequence', ...DICTIONNAIRES_LECTURE]);

/** Variation de l'état de lecture : contrôle de forme seulement (le serveur est la source). */
function lireDeltaLecture(x: unknown, champ: string): DeltaLecture {
  const d = objet(x, champ);
  nombre(d.t, `${champ}.t`);
  nombre(d.tEtape, `${champ}.tEtape`);
  if (d.retard !== undefined) nombre(d.retard, `${champ}.retard`);
  if (d.prolonge !== undefined) nombre(d.prolonge, `${champ}.prolonge`);
  for (const c of ['moment', 'etape'] as const)
    if (d[c] !== undefined && d[c] !== null && typeof d[c] !== 'string') throw new Refus('champ-invalide', `${champ}.${c} : texte ou null`);
  for (const c of ['attenteGo', 'bloque', 'termine', 'retenu'] as const) if (d[c] !== undefined) booleen(d[c], `${champ}.${c}`);
  if (d.phase !== undefined) parmi(d.phase, ['etape', 'passage', 'fin'] as const, `${champ}.phase`);
  if (d.issue !== undefined) texte(d.issue, `${champ}.issue`, LIMITES.texte, true);
  if (d.sequence !== undefined) objet(d.sequence, `${champ}.sequence`);
  for (const c of DICTIONNAIRES_LECTURE) if (d[c] !== undefined) objet(d[c], `${champ}.${c}`);
  for (const c of [...TABLEAUX_LECTURE, 'reprises'] as const) if (d[c] !== undefined) tableau(d[c], `${champ}.${c}`, MAX_ENTREES_DELTA);
  if (d.retires !== undefined) {
    for (const r of tableau(d.retires, `${champ}.retires`, MAX_ENTREES_DELTA)) {
      const nom = texte(r, `${champ}.retires`, 300);
      if (!CHAMPS_RETIRES.has(nom.split('.')[0]!)) throw new Refus('champ-invalide', `${champ}.retires : champ inconnu (${nom})`);
    }
  }
  return d as unknown as DeltaLecture;
}

/** Message `lecture` : `complet` (par défaut : un ancien message sans `mode` est un complet) ou `delta`. */
function lireMsgLecture(m: Brut): MsgLecture {
  const mode = m.mode === undefined ? 'complet' : parmi(m.mode, ['complet', 'delta'] as const, 'mode');
  if (mode === 'complet') return { t: 'lecture', ...lireEtatLecture(m, 'lecture') };
  return {
    t: 'lecture', mode: 'delta', seq: entier(m.seq, 'seq', 0), ts: nombre(m.ts, 'ts'), par: texte(m.par, 'par', 64),
    d: lireDeltaLecture(m.d, 'd'),
  };
}

function lireSalle(m: Brut): MsgSalle {
  const a = objet(m.acteurs, 'acteurs');
  if (Object.keys(a).length > LIMITES.tableau) throw new Refus('trop-long', `acteurs : ${LIMITES.tableau} au plus`);
  const acteurs: MsgSalle['acteurs'] = {};
  for (const [id, v] of Object.entries(a)) {
    acteurId(id, 'acteurs');
    const o = objet(v, `acteurs.${id}`);
    acteurs[id] = avec<ResumeActeurSalle>({ presents: entier(o.presents, `acteurs.${id}.presents`) }, {
      prets: opt(o.prets, x => entier(x, `acteurs.${id}.prets`)),
      enLigne: opt(o.enLigne, x => entier(x, `acteurs.${id}.enLigne`)),
      demande: opt(o.demande, x => {
        const d = objet(x, `acteurs.${id}.demande`);
        return avec<VueDemandee>({
          vseq: entier(d.vseq, `acteurs.${id}.demande.vseq`), at: nombre(d.at, `acteurs.${id}.demande.at`),
          ecran: d.ecran === null ? null : texte(d.ecran, `acteurs.${id}.demande.ecran`, 64),
        }, { cle: opt(d.cle, c => texte(c, `acteurs.${id}.demande.cle`, 200)) });
      }),
      parEcran: opt(o.parEcran, x => {
        const p = objet(x, `acteurs.${id}.parEcran`);
        if (Object.keys(p).length > LIMITES.tableau) throw new Refus('trop-long', `acteurs.${id}.parEcran : ${LIMITES.tableau} écrans au plus`);
        const out: Record<string, number> = {};
        for (const [e, n] of Object.entries(p)) {
          if (e.length > 64 || CLES_INTERDITES.has(e)) throw new Refus('champ-invalide', `acteurs.${id}.parEcran : écran invalide`);
          out[e] = entier(n, `acteurs.${id}.parEcran.${e}`);
        }
        return out;
      }),
      rttMs: opt(o.rttMs, x => nombre(x, `acteurs.${id}.rttMs`)),
    });
  }
  return avec<MsgSalle>({ t: 'salle', ts: nombre(m.ts, 'ts'), acteurs }, {
    vote: opt(m.vote, v => {
      const o = objet(v, 'vote');
      return avec<NonNullable<MsgSalle['vote']>>(
        { q: court(o.q, 'vote.q'), recus: entier(o.recus, 'vote.recus'), parts: tableau(o.parts, 'vote.parts', 26).map((p, i) => nombre(p, `vote.parts[${i}]`)) },
        { force: opt(o.force, x => booleen(x, 'vote.force')) },
      );
    }),
  });
}

/** Lit et valide un message serveur → client. */
export function lireMessageServeur(x: unknown): Lu<MessageServeur> {
  return lire<MessageServeur>(x, m => {
    switch (m.t) {
      case 'bienvenue': {
        if (m.v !== VERSION_PROTOCOLE) throw new Refus('version', `protocole v${VERSION_PROTOCOLE} attendu (reçu : ${String(m.v)})`);
        return avec<MsgBienvenue>({
          t: 'bienvenue', v: VERSION_PROTOCOLE, role: parmi<Role>(m.role, ROLES, 'role'),
          session: motif(m.session, 'session', RE_SESSION, 'identifiant [A-Za-z0-9_-]{6,64}'),
          ts: nombre(m.ts, 'ts'), vue: m.vue === null || m.vue === undefined ? null : lireVue(objet(m.vue, 'vue'), 'vue'),
          cseq: entier(m.cseq ?? 0, 'cseq'),
        }, {
          acteur: opt(m.acteur, v => acteurId(v)),
          lecture: m.lecture === null ? null : opt(m.lecture, v => lireEtatLecture(v, 'lecture')),
          pseudo: opt(m.pseudo, v => {
            const p = texte(v, 'pseudo', 20);
            if (p.trim().length < 2) throw new Refus('champ-invalide', 'pseudo : 2 à 20 caractères');
            return p;
          }),
        });
      }
      case 'vue': return { t: 'vue', ...lireVue(m, 'vue') };
      case 'fx':
        return {
          t: 'fx', acteur: acteurId(m.acteur), id: texte(m.id, 'id', 80), at: nombre(m.at, 'at'), kind: motif(m.kind, 'kind', RE_NOM, 'nom en minuscules'),
          p: objetLibre(m.p ?? {}, 'p'), ttl: entier(m.ttl, 'ttl', 0, LIMITES.ttl),
        };
      case 'lecture': return lireMsgLecture(m);
      case 'salle': return lireSalle(m);
      case 'etat':
        return avec<MsgEtatActeur>({
          t: 'etat', acteur: acteurId(m.acteur), ts: nombre(m.ts, 'ts'), heure: nombre(m.heure, 'heure'),
          ecran: lireEcranAffiche(m.ecran), visible: booleen(m.visible, 'visible'),
        }, {
          ...champsEtat(m),
          personne: opt(m.personne, v => motif(v, 'personne', RE_SESSION, 'identifiant [A-Za-z0-9_-]{6,64}')),
          app: opt(m.app, v => {
            const a = objet(v, 'app');
            return { version: texte(a.version, 'app.version', 64), build: texte(a.build, 'app.build', 64, true) };
          }),
        });
      case 'agent.cmd':
        return avec<MessageServeur>({
          t: 'agent.cmd', n: entier(m.n, 'n', 1), type: motif(m.type, 'type', RE_NOM, 'nom en minuscules (figurants.cmd, appel…)'),
          etape: court(m.etape, 'etape'), donnees: objetLibre(m.donnees ?? {}, 'donnees'),
        }, { moment: opt(m.moment, v => court(v, 'moment')), at: opt(m.at, v => nombre(v, 'at')) });
      case 'ack':
        return avec<MessageServeur>({ t: 'ack', cseq: entier(m.cseq, 'cseq', 1), statut: parmi(m.statut, STATUTS_ACK, 'statut') }, {
          raison: opt(m.raison, v => texte(v, 'raison')), res: opt(m.res, v => donnee(v, 'res')),
        });
      case 'refus':
        return avec<MessageServeur>({ t: 'refus', code: motif(m.code, 'code', RE_NOM, 'code en minuscules'), message: texte(m.message, 'message', LIMITES.texte, true) }, {
          fatal: opt(m.fatal, v => booleen(v, 'fatal')),
        });
      case 'pong': return { t: 'pong', tc: nombre(m.tc, 'tc'), ts: nombre(m.ts, 'ts') };
      case 'resync': return { t: 'resync', raison: texte(m.raison ?? 'resync', 'raison', 200) };
      case 'rtc': {
        const signal = lireRtc(m, 'vers');
        return { t: 'rtc', de: motif(m.de, 'de', /^[A-Za-z0-9_-]{1,64}$/, 'acteur ou session'), vers: m.vers as string, signal, ts: nombre(m.ts, 'ts') };
      }
      default: throw new Refus('type-inconnu', `type « ${m.t as string} » inconnu`);
    }
  });
}

// ── Pont avec le modèle ────────────────────────────────────────────────────────────────────────────────────────────

/** Message `vue` à diffuser pour une Vue calculée par le modèle (vueActeur) ; null → « aucun écran encore ». */
export function messageVue(acteur: string, vue: Vue | null, vseq: number, at: number): Extract<MessageServeur, { t: 'vue' }> {
  if (!vue) return { t: 'vue', acteur, vseq, at, ecran: null, params: {} };
  return { t: 'vue', acteur, vseq, at, ecran: vue.ecran, params: vue.params, cle: vue.cle };
}
