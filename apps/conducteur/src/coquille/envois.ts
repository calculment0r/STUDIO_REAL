// Envois aux acteurs et acteurs du projet : logique PURE de l'inspecteur (sections ENVOIS et ATTEND), de la fenêtre
// Projet › Acteurs et du panneau EN COURS / PROCHAIN. Testée dans envois.test.ts. Les fonctions qui modifient
// travaillent sur la COPIE que donne modifierProjet(fn) (les modifications restent synchronisables : collab/ops.ts).
//
//   - schémas des réglages (`params`) par écran et par genre d'acteur, lecture / écriture d'un champ de formulaire ;
//     une valeur « $nom » lit le réglage `nom` de l'étape (resoudreParams du modèle) ;
//   - état de chaque acteur pour une étape : hérite (il garde l'écran précédent, calculé par vueActeur) / change /
//     inchangé ;
//   - opérations sur les envois (ajouter, monter, descendre, retirer, quand) et sur les acteurs (ajouter depuis le
//     catalogue, renommer en suivant envois et conditions, supprimer avec garde, poser les acteurs d'Écho) ;
//   - conversion des anciennes commandes du prototype (`params.cmds`) en envois (commandesVersEnvois du modèle).
import {
  CATALOGUE_ACTEURS, DENSITES_FIGURANTS, HUMEURS_FIGURANTS, RE_ID_ACTEUR, acteursEcho, cibleDansFoule, cleSignal,
  commandesVersEnvois, creerActeur, dureeEtape, lireSignalActeur, nomSignalActeur, planifier, resoudreParams,
  validerProjet, vueActeur,
  type Acteur, type Condition, type Envoi, type EtatLecture, type Etape, type Moment, type Probleme, type Projet, type Vue,
} from '@studio-real/modele';
import { puceEnvoi } from '../planche/acteurs';

// ── Schémas des réglages par écran ─────────────────────────────────────────────────────────────────────────────────

/** Genre d'un champ du formulaire : texte court, texte long, nombre, liste (une ligne par élément), nombres (séparés
 *  par des virgules), choix (menu), oui-non, média (nom d'un asset). */
export type GenreChamp = 'texte' | 'long' | 'nombre' | 'liste' | 'nombres' | 'choix' | 'oui-non' | 'asset';

export interface ChampParam { cle: string; libelle: string; genre: GenreChamp; choix?: readonly string[] }

const c = (cle: string, libelle: string, genre: GenreChamp = 'texte', choix?: readonly string[]): ChampParam =>
  (choix ? { cle, libelle, genre, choix } : { cle, libelle, genre });

/** Écrans des téléphones (public, comédien, téléphone nommé) : réglages lus par packages/ui-telephone/src/ecrans. */
const TELEPHONE: Record<string, ChampParam[]> = {
  qr: [c('texte', 'texte')],
  regardez: [c('texte', 'texte'), c('etiquette', 'étiquette')],
  video: [c('asset', 'vidéo', 'asset'), c('puis', 'puis', 'choix', ['', 'choix', 'phrases', 'regardez', 'vote', 'texte', 'noir']), c('boucle', 'en boucle', 'oui-non'), c('legende', 'légende')],
  phrases: [c('titre', 'titre'), c('phrases', 'phrases', 'liste'), c('emojis', 'émojis', 'liste'), c('vide', 'si vide')],
  vote: [c('numero', 'numéro', 'nombre'), c('question', 'question', 'long'), c('reponses', 'réponses', 'liste'), c('etiquette', 'étiquette')],
  texte: [c('question', 'question', 'long'), c('indice', 'indice'), c('max', 'caractères max', 'nombre'), c('duree', 'durée (s)', 'nombre')],
  choix: [c('question', 'question'), c('abonne', 'bouton 1'), c('desabonne', 'bouton 2'), c('compte', 'compte'), c('merci', 'merci')],
  notification: [c('titre', 'application'), c('texte', 'texte', 'long'), c('detail', 'détail'), c('bouton', 'bouton'), c('logo', 'logo', 'asset')],
  couleur: [c('couleur', 'couleur'), c('texte', 'texte')],
  noir: [],
  image: [c('image', 'image', 'asset'), c('legende', 'légende')],
  'image-onde': [c('image', 'image', 'asset'), c('legende', 'légende')],
  prompteur: [c('titre', 'titre'), c('numero', 'numéro', 'nombre'), c('texte', 'texte', 'long'), c('enAvant', 'question en avant', 'nombre')],
  'vote-compteur': [c('numero', 'numéro', 'nombre'), c('question', 'question', 'long'), c('scores', 'scores', 'nombres'), c('duree', 'durée (s)', 'nombre'), c('revele', 'révélé', 'oui-non'), c('resultat', 'résultat')],
  veille: [c('texte', 'texte'), c('sous', 'sous-titre')],
  'visio-appel': [c('nom', 'nom'), c('vers', 'vers', 'liste'), c('sonnerie', 'sonnerie', 'oui-non')],
};

/** Écrans de la sortie (écran scène) : scènes de apps/conducteur/src/sortie/protocole.ts, plus mur, visio, flux vidéo. */
const SCENE: Record<string, ChampParam[]> = {
  noir: [],
  'accueil-qr': [c('titre', 'titre'), c('consigne', 'consigne')],
  mur: [c('vote', 'vote', 'choix', ['', 'ouvert', 'revele', 'ferme']), c('numero', 'numéro', 'nombre'), c('scores', 'scores', 'nombres'), c('resultat', 'résultat'), c('audio', 'audio', 'asset'), c('commentaires', 'commentaires')],
  vote: [c('question', 'question', 'long'), c('reponses', 'réponses', 'liste'), c('phase', 'phase', 'choix', ['ouvert', 'decompte', 'revele'])],
  visio: [c('postes', 'postes', 'liste')],
  video: [c('asset', 'vidéo', 'asset'), c('boucle', 'en boucle', 'oui-non'), c('son', 'son', 'oui-non'), c('cadrage', 'cadrage', 'choix', ['auto', 'contain', 'cover']), c('legende', 'légende')],
  'flux-video': [c('asset', 'vidéo', 'asset')],
  titre: [c('surtitre', 'surtitre'), c('titre', 'titre'), c('sousTitre', 'sous-titre')],
  image: [c('asset', 'image', 'asset'), c('legende', 'légende')],
  chrono: [c('duree', 'durée (s)', 'nombre'), c('titre', 'titre')],
  streamer: [c('gabarit', 'gabarit', 'choix', ['', 'calme', 'chat', 'folie', 'vote', 'entracte']), c('bandeau', 'bandeau')],
  page: [c('url', 'adresse')],
};

/** Ordres des agents (jamais de clé ni d'identifiant secret ici : ils restent hors du dépôt). */
const AGENT: Record<string, ChampParam[]> = {
  'figurants.cmd': [
    c('densite', 'densité', 'choix', ['', ...DENSITES_FIGURANTS]), c('humeur', 'humeur', 'choix', ['', ...HUMEURS_FIGURANTS]),
    c('segment', 'segment'), c('dire', 'dire', 'long'),
  ],
  appel: [c('question', 'question n°', 'nombre'), c('prompt', 'consigne', 'long')],
  raccrocher: [],
  ecouter: [c('source', 'acteur écouté')],
  machine: [c('cible', 'cible'), c('commande', 'commande')],
};

const REGIE: Record<string, ChampParam[]> = { alerte: [c('texte', 'texte')], salle: [], validation: [c('texte', 'texte')] };

/** Les champs du formulaire d'un écran pour cet acteur ([] : écran sans réglage, ou inconnu). */
export function schemaEcran(acteur: Pick<Acteur, 'rendu' | 'type'> | undefined, ecran: string | undefined): ChampParam[] {
  if (!ecran) return [];
  const table = acteur?.rendu === 'sortie' ? SCENE
    : acteur?.type === 'regie' ? REGIE
      : acteur?.type === 'agent' || acteur?.rendu === 'externe' ? AGENT : TELEPHONE;
  return table[ecran] ?? [];
}

/** Une valeur « $nom » : lue dans les réglages de l'étape au moment de l'envoi. */
export const estReference = (v: unknown): boolean => typeof v === 'string' && /^\$[A-Za-z_][A-Za-z0-9_-]*$/.test(v.trim());

/** Valeur d'un champ, telle qu'elle s'écrit dans le formulaire. */
export function lireChamp(params: Record<string, unknown> | undefined, champ: ChampParam): string {
  const v = params?.[champ.cle];
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (Array.isArray(v)) return champ.genre === 'nombres' ? v.join(', ') : v.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n');
  return JSON.stringify(v);
}

/**
 * Nouveaux réglages après la saisie d'un champ (copie ; `params` n'est pas touché). Saisie vide : le réglage est
 * retiré. « $nom » est gardé tel quel. Un nombre illisible laisse le réglage inchangé.
 */
export function ecrireChamp(params: Record<string, unknown> | undefined, champ: ChampParam, saisie: string): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(params ?? {}) };
  const s = saisie.trim();
  if (!s) { delete out[champ.cle]; return out; }
  if (estReference(s)) { out[champ.cle] = s; return out; }
  switch (champ.genre) {
    case 'nombre': {
      const n = Number(s.replace(',', '.'));
      if (Number.isFinite(n)) out[champ.cle] = n;
      return out;
    }
    case 'liste':
      out[champ.cle] = saisie.split('\n').map(x => x.trim()).filter(Boolean);
      return out;
    case 'nombres':
      out[champ.cle] = s.split(/[\s,;]+/).map(x => Number(x.replace(',', '.'))).filter(Number.isFinite);
      return out;
    case 'oui-non':
      if (/^(oui|vrai|true|1)$/i.test(s)) out[champ.cle] = true;
      else if (/^(non|faux|false|0)$/i.test(s)) out[champ.cle] = false;
      return out;
    default:
      out[champ.cle] = saisie;
      return out;
  }
}

/** Réglages hors du schéma de l'écran (« autres réglages », édités en JSON). */
export function autresParams(params: Record<string, unknown> | undefined, schema: readonly ChampParam[]): Record<string, unknown> {
  const cles = new Set(schema.map(x => x.cle));
  return Object.fromEntries(Object.entries(params ?? {}).filter(([k]) => !cles.has(k)));
}

/** Remplace les « autres réglages » par ceux du texte JSON (objet attendu) ; erreur lisible sinon. */
export function ecrireAutres(params: Record<string, unknown> | undefined, schema: readonly ChampParam[], json: string): { params: Record<string, unknown> } | { erreur: string } {
  let autres: unknown = {};
  if (json.trim()) {
    try { autres = JSON.parse(json); } catch (e) { return { erreur: 'JSON illisible : ' + (e as Error).message }; }
  }
  if (!autres || typeof autres !== 'object' || Array.isArray(autres)) return { erreur: 'Les autres réglages doivent être un objet JSON { … }.' };
  const cles = new Set(schema.map(x => x.cle));
  const garde = Object.fromEntries(Object.entries(params ?? {}).filter(([k]) => cles.has(k)));
  for (const k of Object.keys(autres)) if (k === '__proto__' || k === 'constructor' || k === 'prototype') return { erreur: `Clé interdite : ${k}.` };
  return { params: { ...garde, ...(autres as Record<string, unknown>) } };
}

/** Références « $nom » utilisables dans les envois de l'étape (ses réglages simples). */
export function referencesEtape(st: Pick<Etape, 'params'>): string[] {
  return Object.entries(st.params ?? {}).filter(([k, v]) => k !== 'cmds' && k !== 'envois' && (typeof v !== 'object' || Array.isArray(v))).map(([k]) => '$' + k);
}

// ── Ce que chaque acteur montre : hérite / change / inchangé ───────────────────────────────────────────────────────

export const entreesDe = (m: Moment): string[] => (typeof m.entry === 'string' ? [m.entry] : Object.values(m.entry));

/** Chemin d'étapes de l'entrée du moment jusqu'à `cible` (première sortie qui y mène, en largeur) ; [cible] sinon. */
export function cheminDansMoment(m: Moment, cible: string): string[] {
  const parent = new Map<string, string | null>();
  const file: string[] = [];
  for (const e of entreesDe(m)) if (!parent.has(e)) { parent.set(e, null); file.push(e); }
  while (file.length) {
    const a = file.shift()!;
    if (a === cible) break;
    for (const s of m.tr) if (s.a === a && s.b && !parent.has(s.b)) { parent.set(s.b, a); file.push(s.b); }
  }
  if (!parent.has(cible)) return [cible];
  const out: string[] = [];
  for (let x: string | null = cible; x !== null; x = parent.get(x) ?? null) out.unshift(x);
  return out;
}

/**
 * État de lecture JUSTE AVANT l'entrée dans l'étape (moment, etape) : le parcours prévu des moments précédents
 * (planifier, salle simulée) puis le chemin dans le moment jusqu'à elle. Sert à calculer ce que chaque acteur
 * « hérite » (vueActeur), sans lecteur.
 */
export function etatAvantEtape(projet: Projet, moment: string, etape: string): EtatLecture {
  const plan = planifier(projet);
  const iM = projet.ev.findIndex(m => m.id === moment);
  const parcours: [string, string, number][] = [];
  for (let i = 0; i < Math.max(0, iM); i++) for (const e of plan.moments[i]?.etapes ?? []) parcours.push([projet.ev[i]!.id, e.id, e.debut]);
  let t = plan.moments[iM]?.debut ?? 0;
  const m = projet.ev[iM];
  if (m) {
    const prevues = plan.moments[iM]?.etapes ?? [];
    const k = prevues.findIndex(e => e.id === etape);
    if (k >= 0) {
      for (const e of prevues.slice(0, k)) parcours.push([m.id, e.id, e.debut]);
      t = prevues[k]!.debut;
    } else {
      for (const id of cheminDansMoment(m, etape).slice(0, -1)) {
        parcours.push([m.id, id, t]);
        const st = m.st.find(x => x.id === id);
        t += st ? dureeEtape(st) : 0;
      }
    }
  }
  return {
    t, moment, etape, tEtape: 0, phase: 'etape', attenteGo: false, retard: 0, bloque: false, termine: false, memoires: {}, parcours,
  };
}

export type StatutActeur = 'herite' | 'change' | 'inchange';

export interface LigneActeur {
  acteur: Acteur;
  statut: StatutActeur;
  /** envois de l'étape vers cet acteur (index dans etape.envois) */
  envois: { envoi: Envoi; index: number }[];
  /** ce que l'acteur montre en entrant dans l'étape avant ses envois (null : rien encore) */
  avant: Vue | null;
}

const memeValeur = (a: unknown, b: unknown) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

/** Une ligne par acteur du projet pour l'étape : hérite (aucun envoi), inchangé (il renvoie l'écran déjà montré),
 *  change (nouvel écran, autres réglages, effet). */
export function lignesActeurs(projet: Projet, moment: string, etape: string): LigneActeur[] {
  const acteurs = Array.isArray(projet.acteurs) ? projet.acteurs.filter(a => a && typeof a.id === 'string') : [];
  if (!acteurs.length) return [];
  const st = projet.ev.find(m => m.id === moment)?.st.find(s => s.id === etape);
  const etat = etatAvantEtape(projet, moment, etape);
  return acteurs.map(acteur => {
    const envois = (Array.isArray(st?.envois) ? st!.envois : [])
      .map((envoi, index) => ({ envoi, index }))
      .filter(x => x.envoi && cibleDansFoule(x.envoi.vers)?.acteur === acteur.id);
    const avant = vueActeur(projet, etat, acteur.id);
    let statut: StatutActeur = 'herite';
    if (envois.length) {
      const pareil = !!avant && envois.every(({ envoi }) => !envoi.fx && envoi.ecran === avant.ecran
        && memeValeur(resoudreParams(envoi.params, st ?? {}), avant.params) && envoi.vers === avant.vers);
      statut = pareil ? 'inchange' : 'change';
    }
    return { acteur, statut, envois, avant };
  });
}

/** Vue qu'un envoi donnera (réglages résolus « $nom »), pour l'aperçu. */
export function vueDeLEnvoi(envoi: Envoi, st: Pick<Etape, 'params'>): { ecran: string; params: Record<string, unknown> } | null {
  if (!envoi?.ecran) return null;
  return { ecran: envoi.ecran, params: resoudreParams(envoi.params, st) };
}

// ── Opérations sur les envois d'une étape ──────────────────────────────────────────────────────────────────────────

/** Ajoute un envoi (en fin de liste) ; renvoie son index. */
export function ajouterEnvoi(st: Etape, vers: string, ecran?: string): number {
  const e: Envoi = ecran ? { vers, ecran } : { vers };
  (st.envois ??= []).push(e);
  return st.envois.length - 1;
}

/** Monte (−1) ou descend (+1) un envoi ; renvoie son nouvel index (inchangé au bord). */
export function deplacerEnvoi(st: Etape, i: number, sens: -1 | 1): number {
  const l = st.envois;
  const j = i + sens;
  if (!Array.isArray(l) || i < 0 || i >= l.length || j < 0 || j >= l.length) return i;
  [l[i], l[j]] = [l[j]!, l[i]!];
  return j;
}

/** Retire un envoi ; la liste vide disparaît. */
export function retirerEnvoi(st: Etape, i: number): void {
  if (!Array.isArray(st.envois) || i < 0 || i >= st.envois.length) return;
  st.envois.splice(i, 1);
  if (!st.envois.length) delete st.envois;
}

/** Pose le moment d'un envoi : à l'entrée (défaut, la clé disparaît), à la sortie, ou n secondes après l'entrée. */
export function poserQuand(e: Envoi, genre: 'entree' | 'sortie' | 'apres', n = 5): void {
  if (genre === 'entree') delete e.quand;
  else if (genre === 'sortie') e.quand = 'sortie';
  else e.quand = { apres: Math.max(0, Number.isFinite(n) ? n : 0) };
}

/** Genre et délai d'un `quand`. */
export function lireQuand(e: Pick<Envoi, 'quand'>): { genre: 'entree' | 'sortie' | 'apres'; apres: number } {
  const q = e.quand;
  if (q === 'sortie') return { genre: 'sortie', apres: 0 };
  if (q && typeof q === 'object' && typeof (q as { apres?: unknown }).apres === 'number') return { genre: 'apres', apres: (q as { apres: number }).apres };
  return { genre: 'entree', apres: 0 };
}

/** Condition « le signal de l'acteur est arrivé » ajoutée à une sortie (rien si elle y est déjà). */
export function ajouterConditionSignal(g: Condition[], nom: string): boolean {
  const k = 'sig:' + nom;
  if (g.some(x => x.k === k)) return false;
  g.push({ k, op: '≥', v: 1 });
  return true;
}

// ── Problèmes de validation de l'étape (envois, cibles, signaux) ───────────────────────────────────────────────────

const CODES_ENVOIS = /^(envoi|envois|cmds-a-convertir|signal-jamais-renvoye)/;

/** Les problèmes de validerProjet qui concernent les envois et signaux de cette étape. */
export function problemesEtape(problemes: readonly Probleme[], moment: string, etape: string): Probleme[] {
  return problemes.filter(x => x.etape === etape && (x.moment === moment || x.moment === '') && CODES_ENVOIS.test(x.code));
}

/** Les problèmes de validation qui concernent les acteurs (fenêtre Projet › Acteurs). */
export function problemesActeurs(problemes: readonly Probleme[]): Probleme[] {
  return problemes.filter(x => /^(acteur|acteurs|agent|envois-sans-acteurs)/.test(x.code));
}

export { validerProjet };

// ── Acteurs du projet ──────────────────────────────────────────────────────────────────────────────────────────────

/** Identifiant proposé pour un acteur créé depuis une clé du catalogue. */
const BASE_ID: Record<string, string> = {
  regie: 'regie', comedien: 'comedien', public: 'public', ecran: 'scene', telephone: 'telephone',
  'agent:figurants': 'figurants', 'agent:elevenlabs': 'voix', 'agent:asr': 'transcription', 'agent:osc': 'osc',
};

/** Premier identifiant libre « base », « base-2 », « base-3 »… */
export function idLibre(p: Pick<Projet, 'acteurs'>, base: string): string {
  const pris = new Set((p.acteurs ?? []).map(a => a?.id));
  const b = base.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 34) || 'acteur';
  if (!pris.has(b)) return b;
  for (let i = 2; ; i++) if (!pris.has(`${b}-${i}`)) return `${b}-${i}`;
}

/** Ajoute un acteur du catalogue (clé 'public', 'ecran', 'agent:figurants'…) ; renvoie son id. */
export function ajouterActeur(p: Projet, cle: string): string {
  const id = idLibre(p, BASE_ID[cle] ?? cle);
  (p.acteurs ??= []).push(creerActeur(cle, id));
  return id;
}

/** Pose les acteurs d'Écho qui manquent (par id) ; renvoie le nombre d'acteurs ajoutés. */
export function poserActeursEcho(p: Projet): number {
  const l = (p.acteurs ??= []);
  let n = 0;
  for (const a of acteursEcho()) if (!l.some(x => x && x.id === a.id)) { l.push(a); n++; }
  return n;
}

export interface UsagesActeur {
  envois: { moment: string; etape: string; nom: string; index: number }[];
  conditions: { moment: string; sortie: number; k: string }[];
}

/** Où l'acteur est visé : envois des étapes (moments et séquences) et conditions sig: / sigv: des sorties et passages. */
export function usagesActeur(p: Projet, id: string): UsagesActeur {
  const out: UsagesActeur = { envois: [], conditions: [] };
  const lots: { id: string; st: Etape[]; tr: Moment['tr']; gate?: Moment['gate'] }[] = [
    ...p.ev.map(m => ({ id: m.id, st: m.st, tr: m.tr, gate: m.gate })),
    ...(Array.isArray(p.sequences) ? p.sequences.map(q => ({ id: q.id, st: q.st, tr: q.tr })) : []),
  ];
  for (const m of lots) {
    for (const st of m.st ?? []) (Array.isArray(st.envois) ? st.envois : []).forEach((e, index) => {
      if (cibleDansFoule(e?.vers)?.acteur === id) out.envois.push({ moment: m.id, etape: st.id, nom: st.name, index });
    });
    (m.tr ?? []).forEach((s, i) => (s.g ?? []).forEach(g => {
      const sa = /^(sig|sigv):(.+)$/.exec(g.k);
      const x = sa ? lireSignalActeur(sa[2]!) : null;
      if (x && cleSignal(x.acteur) === cleSignal(id)) out.conditions.push({ moment: m.id, sortie: i, k: g.k });
    }));
    for (const g of m.gate?.g ?? []) {
      const sa = /^(sig|sigv):(.+)$/.exec(g.k);
      const x = sa ? lireSignalActeur(sa[2]!) : null;
      if (x && cleSignal(x.acteur) === cleSignal(id)) out.conditions.push({ moment: m.id, sortie: -1, k: g.k });
    }
  }
  return out;
}

/** Supprime un acteur, SAUF s'il est encore visé par des envois (message pour la régie). */
export function supprimerActeur(p: Projet, id: string): string | null {
  const u = usagesActeur(p, id);
  if (u.envois.length) {
    const ou = [...new Set(u.envois.map(x => '« ' + x.nom + ' »'))].slice(0, 4).join(', ');
    return `Impossible : ${u.envois.length} envoi${u.envois.length > 1 ? 's visent' : ' vise'} encore cet acteur (${ou}${u.envois.length > 4 ? '…' : ''}).`;
  }
  if (!Array.isArray(p.acteurs)) return null;
  p.acteurs = p.acteurs.filter(a => a && a.id !== id);
  return null;
}

/** Remplace l'acteur au début d'une cible (« public:ont-vote:A » → « salle:ont-vote:A »). */
const renommerCible = (vers: string, ancien: string, nouveau: string): string => {
  const i = vers.indexOf(':');
  const tete = i < 0 ? vers : vers.slice(0, i);
  return tete === ancien ? nouveau + (i < 0 ? '' : vers.slice(i)) : vers;
};

/** Renomme l'identifiant d'un acteur et suit ses envois et ses conditions sig: / sigv:. Renvoie un message d'erreur, ou null. */
export function renommerActeur(p: Projet, ancien: string, nouveau: string): string | null {
  const n = nouveau.trim();
  if (n === ancien) return null;
  if (!RE_ID_ACTEUR.test(n)) return 'Identifiant : lettres, chiffres, - et _ seulement (ni espace, ni point, ni deux-points).';
  if ((p.acteurs ?? []).some(a => a && a.id === n)) return `L’identifiant « ${n} » est déjà pris.`;
  const a = (p.acteurs ?? []).find(x => x && x.id === ancien);
  if (!a) return null;
  a.id = n;
  const condition = (g: Condition) => {
    const r = /^(sig|sigv):(.+)$/.exec(g.k);
    const x = r ? lireSignalActeur(r[2]!) : null;
    if (x && cleSignal(x.acteur) === cleSignal(ancien)) g.k = `${r![1]}:${nomSignalActeur(n, x.signal)}`;
  };
  const lots = [...p.ev, ...(Array.isArray(p.sequences) ? p.sequences : [])];
  for (const m of lots) {
    for (const st of m.st ?? []) for (const e of Array.isArray(st.envois) ? st.envois : []) if (e && typeof e.vers === 'string') e.vers = renommerCible(e.vers, ancien, n);
    for (const s of m.tr ?? []) (s.g ?? []).forEach(condition);
    if ('gate' in m && m.gate) (m.gate.g ?? []).forEach(condition);
  }
  return null;
}

/** Clé de configuration d'agent qui ressemble à un secret (refusée : les secrets restent hors du dépôt). */
export const RE_SECRET = /cle|key|secret|token|jeton|password|mot.?de.?passe/i;
export const cleConfigInterdite = (k: string): boolean => RE_SECRET.test(k);

/** Modèles du catalogue proposés à l'ajout. */
export const MODELES_ACTEURS = CATALOGUE_ACTEURS;

// ── Conversion des anciennes commandes du prototype ────────────────────────────────────────────────────────────────

/** L'étape porte-t-elle encore `params.cmds` (commandes du prototype) ? */
export const aConvertir = (st: Pick<Etape, 'params'>): boolean => !!st.params && Object.prototype.hasOwnProperty.call(st.params, 'cmds');

/**
 * Convertit `params.cmds` (et `params.sortie`) d'une étape en envois aux acteurs d'Écho (commandesVersEnvois), puis
 * retire `cmds`. Des envois déjà écrits sont gardés tels quels. `params.sortie` reste (la sortie scène actuelle la lit).
 * Renvoie les acteurs visés par les envois produits.
 */
export function convertirEtape(st: Etape): string[] {
  if (!aConvertir(st)) return [];
  let envois: Envoi[] = [];
  if (!(Array.isArray(st.envois) && st.envois.length)) {
    envois = commandesVersEnvois(st.params!.cmds, st.params!.sortie);
    if (envois.length) st.envois = envois;
  }
  delete st.params!.cmds;
  return [...new Set(envois.map(e => cibleDansFoule(e.vers)?.acteur).filter((x): x is string => !!x))];
}

/** Ajoute les acteurs d'Écho visés par des envois convertis et absents du projet ; renvoie leurs ids. */
export function completerActeursEcho(p: Projet, vises: readonly string[]): string[] {
  const l = (p.acteurs ??= []);
  const ajoutes: string[] = [];
  for (const a of acteursEcho()) if (vises.includes(a.id) && !l.some(x => x && x.id === a.id)) { l.push(a); ajoutes.push(a.id); }
  if (!l.length) delete p.acteurs;
  return ajoutes;
}

/** Convertit toutes les étapes du projet (moments et séquences) ; renvoie le nombre d'étapes converties et les
 *  acteurs d'Écho ajoutés. */
export function convertirProjet(p: Projet): { etapes: number; acteursAjoutes: string[] } {
  let etapes = 0;
  const vises = new Set<string>();
  for (const m of [...p.ev, ...(Array.isArray(p.sequences) ? p.sequences : [])]) for (const st of m.st ?? []) {
    if (!aConvertir(st)) continue;
    etapes++;
    for (const a of convertirEtape(st)) vises.add(a);
  }
  return { etapes, acteursAjoutes: completerActeursEcho(p, [...vises]) };
}

/** Nombre d'étapes à convertir dans le projet. */
export function nbAConvertir(p: Projet): number {
  let n = 0;
  for (const m of [...p.ev, ...(Array.isArray(p.sequences) ? p.sequences : [])]) for (const st of m.st ?? []) if (aConvertir(st)) n++;
  return n;
}

// ── EN COURS / PROCHAIN (mode SPECTACLE) ───────────────────────────────────────────────────────────────────────────

export interface CueResume { moment: string; etape: string; nom: string; momentNom: string }
export interface EnvoiProchain { texte: string; acteur: string; quand: 'entree' | 'sortie' | 'apres' }

/**
 * Le cue en cours et le prochain (celui que le GO lancera), d'après le déroulé prévu (planifier) : l'étape suivante du
 * moment, sinon la première du moment suivant. `envois` : ce qui partira au GO (les envois « à la sortie » de l'étape
 * en cours, puis ceux de l'étape suivante, dans l'ordre écrit).
 */
export function prochainCue(projet: Projet, lecture: Pick<EtatLecture, 'moment' | 'etape' | 'termine'> | null): { enCours: CueResume | null; prochain: CueResume | null; envois: EnvoiProchain[] } {
  const vide = { enCours: null, prochain: null, envois: [] as EnvoiProchain[] };
  if (!lecture || lecture.termine || !lecture.moment) return vide;
  const plan = planifier(projet);
  const iM = projet.ev.findIndex(m => m.id === lecture.moment);
  const m = projet.ev[iM];
  if (!m) return vide;
  const cue = (mm: Moment | undefined, id: string | undefined): CueResume | null => {
    const st = mm && id ? mm.st.find(x => x.id === id) : undefined;
    return mm && st ? { moment: mm.id, etape: st.id, nom: st.name, momentNom: mm.name } : null;
  };
  const enCours = cue(m, lecture.etape ?? undefined);
  let prochain: CueResume | null = null;
  if (lecture.etape) {
    const prevues = plan.moments[iM]?.etapes ?? [];
    const k = prevues.findIndex(e => e.id === lecture.etape);
    if (k >= 0 && k + 1 < prevues.length) prochain = cue(m, prevues[k + 1]!.id);
  }
  if (!prochain) {
    const suivant = projet.ev[iM + 1];
    prochain = cue(suivant, plan.moments[iM + 1]?.etapes[0]?.id ?? (suivant ? entreesDe(suivant)[0] : undefined));
  }
  const envois: EnvoiProchain[] = [];
  const stCours = enCours ? m.st.find(x => x.id === enCours.etape) : undefined;
  for (const e of Array.isArray(stCours?.envois) ? stCours!.envois : []) {
    if (e && e.quand === 'sortie') envois.push({ texte: puceEnvoi(e), acteur: cibleDansFoule(e.vers)?.acteur ?? e.vers, quand: 'sortie' });
  }
  const mp = prochain ? projet.ev.find(x => x.id === prochain!.moment) : undefined;
  const stP = prochain ? mp?.st.find(x => x.id === prochain!.etape) : undefined;
  for (const e of Array.isArray(stP?.envois) ? stP!.envois : []) {
    if (!e || e.quand === 'sortie') continue;
    const apres = !!e.quand && typeof e.quand === 'object';
    envois.push({ texte: puceEnvoi(e), acteur: cibleDansFoule(e.vers)?.acteur ?? e.vers, quand: apres ? 'apres' : 'entree' });
  }
  return { enCours, prochain, envois };
}
