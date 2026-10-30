// Validation d'un projet et chargement d'un fichier « studio-real/conducteur@1 » (ou d'un Projet nu).
import type { Acteur, Condition, Etape, FichierConducteur, Moment, Passage, Projet, SalleSimulee, Sequence, Sortie } from './types';
import { FORMAT } from './types';
import { OPERATEURS, cleSignal, estCleCondition, lireSignalActeur } from './conditions';
import { RE_ID_ACTEUR, TYPES_ACTEUR, cibleDansFoule, cleQuand, modeleActeur, quandValide } from './acteurs';
import {
  BLOCS_MOTEUR, SORTIES_NOMMEES, TY_BOUCLE, TY_GARDE, TY_MEMOIRE, TY_TIRAGE, TYPES_VOTE, comportementBloc, normaliserNom,
  poidsTirage, reglagesComedien, reglagesMemoire, reglagesSequence, reglagesSignal, sortiesBoucle, sortiesGarde, trouverSequence,
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
  for (const m of [...p.ev, ...(Array.isArray(p.sequences) ? p.sequences : [])])
    for (const st of m?.st ?? []) if (st && st.ty === TY_MEMOIRE) memoiresConnues.add(reglagesMemoire(st).nom);

  // Acteurs du spectacle (rapport 1 §4.4) : pour vérifier les envois et les signaux attendus.
  const acteurs = verifierActeurs();
  let envoisSansActeurs = false;

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
      if (comp === 'normal' || comp === 'memoire' || comp === 'figurants') {
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
      verifierBlocEvenement(st, outs, nom, m.id);
      verifierEnvois(st, nom, m.id);
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

  // Séquences réutilisables.
  if (p.sequences !== undefined && !Array.isArray(p.sequences)) err('sequences-invalides', 'La liste des séquences (« sequences ») est illisible.');
  else if (Array.isArray(p.sequences)) {
    const ids = new Set<string>();
    for (const q of p.sequences) {
      if (!q || typeof q.id !== 'string' || !q.id) { err('sequence-sans-id', 'Une séquence n’a pas d’identifiant.'); continue; }
      const nomS = `Séquence « ${q.nom || q.id} »`;
      if (ids.has(q.id)) err('sequence-id-double', `${nomS} : l’identifiant « ${q.id} » est déjà utilisé.`);
      ids.add(q.id);
      if (!Array.isArray(q.st) || !Array.isArray(q.tr)) { err('sequence-illisible', `${nomS} : étapes (« st ») ou sorties (« tr ») manquantes.`); continue; }
      const etapesS = new Set(q.st.map(x => x?.id));
      if (!q.st.length) avt('sequence-vide', `${nomS} : elle ne contient aucune étape.`);
      else if (!etapesS.has(q.entry)) err('sequence-entree-inconnue', `${nomS} : l’étape d’entrée « ${String(q.entry)} » n’existe pas.`);
      for (const o of q.tr) {
        if (!o || typeof o.a !== 'string') { err('sortie-invalide', `${nomS} : une sortie est illisible.`); continue; }
        if (!etapesS.has(o.a)) err('sortie-source-inconnue', `${nomS} : une sortie part de l’étape « ${o.a} », qui n’existe pas.`);
        if (o.b && !etapesS.has(o.b)) err('sortie-cible-inconnue', `${nomS} : une sortie vise l’étape « ${o.b} », qui n’existe pas dans la séquence.`);
        if (Array.isArray(o.g)) o.g.forEach(g => verifierCondition(g, `${nomS}, sortie de « ${o.a} »`, ''));
      }
      for (const st of q.st) {
        if (!st || typeof st.id !== 'string') continue;
        verifierBlocEvenement(st, q.tr.filter(o => o && o.a === st.id), `${nomS}, ${BLOC[st.ty] ?? 'étape'} « ${st.name || st.id} »`, '');
        verifierEnvois(st, `${nomS}, étape « ${st.name || st.id} »`, '');
        if (Array.isArray(st.envois) && st.envois.length)
          avt('envoi-dans-sequence', `${nomS}, étape « ${st.name || st.id} » : les envois d’une étape de séquence ne sont pas encore joués (vueActeur) ; placez-les sur l’étape « Séquence » du moment.`, '', st.id);
        if (comportementBloc(st.ty) === 'sequence' && appelle(p.sequences, st, q.id, 0))
          avt('sequence-recursive', `${nomS} : elle s’appelle elle-même (directement ou non) ; le lecteur sortira directement.`);
      }
    }
  }

  if (envoisSansActeurs)
    avt('envois-sans-acteurs', 'Des étapes ont des envois, mais le projet ne déclare aucun acteur (« acteurs ») : les cibles ne sont pas vérifiées.');

  if (p.sens && typeof p.sens === 'object') {
    for (const k of ['aff', 'part', 'calme', 'pen'] as const) {
      const v = p.sens[k];
      if (typeof v !== 'number' || v < 0 || v > 100) avt('salle-reglage', `Salle simulée : le réglage « ${k} » doit être entre 0 et 100.`);
    }
  }
  return out;

  /** Blocs à événements extérieurs, figurants et séquences (moments et séquences). */
  function verifierBlocEvenement(st: Etape, outs: Sortie[], nom: string, moment: string) {
    const comp = comportementBloc(st.ty);
    const a = (n: string) => outs.some(o => normaliserNom(o.nom) === normaliserNom(n));
    const etape = st.id;
    if (comp === 'machine' && !a(SORTIES_NOMMEES.sansReponse))
      avt('machine-sans-secours', `${nom} : pas de sortie « sans réponse » ; sans accusé, la suite partira par « confirmé ».`, moment, etape);
    else if (comp === 'message' && !a(SORTIES_NOMMEES.nonLu))
      avt('message-sans-secours', `${nom} : pas de sortie « non lu » ; sans accusé de lecture, la suite partira par « lu ».`, moment, etape);
    else if (comp === 'signal' && typeof st.params?.signal !== 'string' && typeof st.params?.adresse !== 'string')
      avt('signal-sans-nom', `${nom} : aucun signal nommé (params.signal ou params.adresse) ; il attend le signal « ${st.id} ».`, moment, etape);
    else if (comp === 'comedien' && !reglagesComedien(st).mots.length)
      avt('comedien-sans-mot', `${nom} : aucun mot-clé (params.mots) ; seul le top régie le fera avancer.`, moment, etape);
    else if (comp === 'sequence') {
      const r = reglagesSequence(st);
      if (!trouverSequence(p.sequences, r.sequence))
        avt('sequence-inconnue', `${nom} : la séquence « ${r.sequence || '(aucune)'} » n’existe pas ; sortie directe.`, moment, etape);
    }
    if (comp === 'signal') verifierSignalActeur(reglagesSignal(st).signal, nom, moment, etape);
    if (st.params && Object.prototype.hasOwnProperty.call(st.params, 'cmds'))
      avt('cmds-a-convertir', `${nom} : params.cmds (commandes du prototype) est encore présent ; à convertir en envois aux acteurs (commandesVersEnvois).`, moment, etape);
  }

  /** Liste des acteurs : identifiants uniques, type connu, listes lisibles, aucun secret dans la configuration d'un agent. */
  function verifierActeurs(): Map<string, Acteur> {
    const vus = new Map<string, Acteur>();
    if (p.acteurs === undefined) return vus;
    if (!Array.isArray(p.acteurs)) { err('acteurs-illisibles', 'La liste des acteurs (« acteurs ») est illisible.'); return vus; }
    p.acteurs.forEach((a, i) => {
      if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !RE_ID_ACTEUR.test(a.id)) {
        err('acteur-sans-id', `L’acteur n° ${i + 1} n’a pas d’identifiant valable (lettres, chiffres, - et _, sans point ni deux-points).`);
        return;
      }
      const nomA = `Acteur « ${a.nom || a.id} »`;
      if (vus.has(a.id)) err('acteur-id-double', `${nomA} : l’identifiant « ${a.id} » est déjà utilisé par un autre acteur.`);
      vus.set(a.id, a);
      if (!TYPES_ACTEUR.includes(a.type)) err('acteur-type-inconnu', `${nomA} : le type « ${String(a.type)} » est inconnu (${TYPES_ACTEUR.join(', ')}).`);
      else if (a.type === 'agent' && !modeleActeur(a)) avt('agent-genre-inconnu', `${nomA} : agent sans genre connu (figurants, elevenlabs, asr, osc).`);
      if (a.cardinalite !== 1 && a.cardinalite !== 'n') err('acteur-cardinalite', `${nomA} : la cardinalité doit être 1 (acteur nommé) ou 'n' (foule).`);
      if (!Array.isArray(a.ecrans) || !a.ecrans.every(e => typeof e === 'string')) err('acteur-ecrans', `${nomA} : la liste des écrans (« ecrans ») est illisible.`);
      if (!Array.isArray(a.signaux) || !a.signaux.every(e => typeof e === 'string')) err('acteur-signaux', `${nomA} : la liste des signaux (« signaux ») est illisible.`);
      const config = a.agent?.config;
      if (config && typeof config === 'object' && Object.keys(config).some(k => /cle|key|secret|token|jeton|password|mot.?de.?passe/i.test(k)))
        avt('agent-secret', `${nomA} : la configuration de l’agent semble contenir une clé ou un secret ; il ne doit jamais être écrit dans le projet.`);
    });
    return vus;
  }

  /** Envois d'une étape : cible, acteur, écran qu'il sait afficher, effet, quand, envois contradictoires. */
  function verifierEnvois(st: Etape, ou: string, moment: string) {
    const envois: unknown = st.envois;
    if (envois === undefined) return;
    if (!Array.isArray(envois)) { err('envois-illisibles', `${ou} : la liste des envois (« envois ») est illisible.`, moment, st.id); return; }
    if (envois.length && !acteurs.size) envoisSansActeurs = true;
    const ecrans = new Map<string, number>();
    envois.forEach((x: unknown, j) => {
      const nomE = `${ou}, envoi n° ${j + 1}`;
      if (!x || typeof x !== 'object' || Array.isArray(x)) { err('envoi-illisible', `${nomE} : illisible.`, moment, st.id); return; }
      const e = x as Record<string, unknown>;
      const cible = cibleDansFoule(e.vers);
      if (!cible) {
        err('envoi-cible-invalide', `${nomE} : la cible « ${String(e.vers)} » est illisible (ex. scene, public, public:ont-vote:A, public:aleatoire:3).`, moment, st.id);
        return;
      }
      const a = acteurs.get(cible.acteur);
      const nomA = a ? `« ${a.nom || a.id} »` : `« ${cible.acteur} »`;
      if (acteurs.size && !a) err('envoi-acteur-inconnu', `${nomE} : l’acteur « ${cible.acteur} » n’existe pas dans le projet.`, moment, st.id);
      if (a && cible.filtre && a.cardinalite !== 'n') avt('envoi-filtre-sans-foule', `${nomE} : la cible « ${String(e.vers)} » filtre une foule, mais ${nomA} est un acteur nommé.`, moment, st.id);
      if (e.ecran === undefined && e.fx === undefined) avt('envoi-vide', `${nomE} : ni écran ni effet pour ${nomA}.`, moment, st.id);
      if (e.ecran !== undefined && (typeof e.ecran !== 'string' || !e.ecran)) err('envoi-ecran-illisible', `${nomE} : l’écran doit être un nom.`, moment, st.id);
      else if (typeof e.ecran === 'string' && a && Array.isArray(a.ecrans) && !a.ecrans.includes(e.ecran))
        err('envoi-ecran-inconnu', `${nomE} : ${nomA} ne sait pas afficher l’écran « ${e.ecran} » (écrans : ${a.ecrans.join(', ') || 'aucun'}).`, moment, st.id);
      if (e.fx !== undefined && (typeof e.fx !== 'string' || !e.fx)) err('envoi-effet-illisible', `${nomE} : l’effet doit être un nom.`, moment, st.id);
      else if (typeof e.fx === 'string' && a) {
        const m = modeleActeur(a);
        if (m && !m.fx.includes(e.fx)) avt('envoi-effet-inconnu', `${nomE} : effet « ${e.fx} » inconnu pour ${nomA} (effets : ${m.fx.join(', ') || 'aucun'}).`, moment, st.id);
      }
      if (e.params !== undefined && (!e.params || typeof e.params !== 'object' || Array.isArray(e.params)))
        err('envoi-params-illisibles', `${nomE} : les réglages (« params ») doivent être un objet.`, moment, st.id);
      if (e.quand !== undefined && !quandValide(e.quand))
        err('envoi-quand-invalide', `${nomE} : « quand » attend 'entree', 'sortie' ou { apres: secondes ≥ 0 }.`, moment, st.id);
      if (e.tenir !== undefined && typeof e.tenir !== 'boolean') err('envoi-tenir-invalide', `${nomE} : « tenir » attend vrai ou faux.`, moment, st.id);
      if (typeof e.ecran === 'string' && e.ecran) {
        const cle = `${cible.acteur}|${JSON.stringify(cible.filtre)}|${cleQuand(e.quand)}`;
        const avant = ecrans.get(cle);
        if (avant !== undefined)
          avt('envois-contradictoires', `${ou} : les envois n° ${avant + 1} et ${j + 1} donnent chacun un écran à « ${String(e.vers)} » au même instant ; seul le dernier restera.`, moment, st.id);
        ecrans.set(cle, j);
      }
    });
  }

  /** Un signal attendu de la forme « <acteur>.<signal> » doit être déclaré par cet acteur (Acteur.signaux). */
  function verifierSignalActeur(nom: string, ou: string, moment: string, etape?: string) {
    if (!acteurs.size) return;
    const sa = lireSignalActeur(nom);
    if (!sa) return;
    const a = [...acteurs.values()].find(x => cleSignal(x.id) === cleSignal(sa.acteur));
    if (!a) return;   // pas un signal d'acteur (ex. 'go.story', 'video.fin')
    const signaux = Array.isArray(a.signaux) ? a.signaux : [];
    if (!signaux.some(s => typeof s === 'string' && cleSignal(s) === cleSignal(sa.signal)))
      avt('signal-jamais-renvoye', `${ou} : on attend « ${nom} », mais ${a.nom || a.id} ne renvoie pas le signal « ${sa.signal} » (signaux : ${signaux.join(', ') || 'aucun'}).`, moment, etape);
  }

  function verifierCondition(g: Condition, ou: string, moment: string, etape?: string) {
    if (!g || typeof g !== 'object') { err('condition-illisible', `${ou} : une condition est illisible.`, moment, etape); return; }
    if (!estCleCondition(g.k)) { err('condition-inconnue', `${ou} : la condition « ${String(g.k)} » est inconnue (t, pres, quorum, prets, bruit, assis, issue, mem:<nom>, sig:<nom>, sigv:<nom>).`, moment, etape); return; }
    if (!OPERATEURS.includes(g.op)) err('condition-operateur', `${ou} : l’opérateur « ${String(g.op)} » est inconnu.`, moment, etape);
    if (g.k.startsWith('sig:')) verifierSignalActeur(g.k.slice(4), ou, moment, etape);
    else if (g.k.startsWith('sigv:')) verifierSignalActeur(g.k.slice(5), ou, moment, etape);
    if (g.k === 'issue') {
      if (typeof g.v !== 'string' || !g.v) err('condition-issue', `${ou} : la condition sur l’issue attend une lettre (A, B, T…).`, moment, etape);
      if (g.op !== '=' && g.op !== '≠') err('condition-issue-operateur', `${ou} : l’issue se compare avec = ou ≠.`, moment, etape);
    } else if (g.k.startsWith('sigv:')) {
      // valeur libre (nombre ou texte)
    } else if (g.k.startsWith('mem:')) {
      const nom = g.k.slice(4);
      if (!memoiresConnues.has(nom)) avt('memoire-jamais-posee', `${ou} : la mémoire « ${nom} » n’est posée par aucun bloc Mémoire (elle vaudra 0).`, moment, etape);
    } else if (typeof g.v !== 'number' || !Number.isFinite(g.v)) {
      err('condition-valeur', `${ou} : la condition « ${g.k} » attend un nombre.`, moment, etape);
    }
  }
}

const BLOC: Record<string, string> = {
  ...Object.fromEntries(Object.values(BLOCS_MOTEUR).map(b => [b.ty, b.nom])),
  [TY_GARDE]: 'garde-fou', [TY_BOUCLE]: 'boucle', [TY_TIRAGE]: 'tirage', [TY_MEMOIRE]: 'mémoire', f3: 'tirage',
};

/** La séquence appelée par l'étape `st` finit-elle par appeler `cible` ? */
function appelle(sequences: Sequence[], st: Etape, cible: string, profondeur: number): boolean {
  if (profondeur > 16) return true;
  const q = trouverSequence(sequences, reglagesSequence(st).sequence);
  if (!q) return false;
  if (q.id === cible) return true;
  return (q.st ?? []).some(x => x && comportementBloc(x.ty) === 'sequence' && appelle(sequences, x, cible, profondeur + 1));
}

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
  if (Array.isArray(p.sequences)) out.sequences = (p.sequences as unknown[]).filter(estObjet).map(normaliserSequence);
  // Acteurs et envois (rapport 1 §4.4) : gardés tels quels, validerProjet() les contrôle.
  if (p.acteurs !== undefined) out.acteurs = p.acteurs as Projet['acteurs'];
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

function normaliserSequence(q: Brut, i: number): Sequence {
  const id = texte(q.id, `q${i + 1}`);
  const st: Etape[] = Array.isArray(q.st) ? (q.st as unknown[]).filter(estObjet).map((e, j) => normaliserEtape(e, j)) : [];
  const tr: Sortie[] = Array.isArray(q.tr) ? (q.tr as unknown[]).filter(estObjet).map(normaliserSortie) : [];
  const out: Sequence = { id, nom: texte(q.nom, id), entry: typeof q.entry === 'string' && q.entry ? q.entry : st[0]?.id ?? '', st, tr };
  if (Array.isArray(q.sorties)) out.sorties = (q.sorties as unknown[]).filter((x): x is string => typeof x === 'string');
  return out;
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
  if (e.envois !== undefined) out.envois = e.envois as Etape['envois'];
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
