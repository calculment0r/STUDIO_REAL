// Moteur de lecture du conducteur : pur et déterministe (même projet + mêmes signaux + même graine = même déroulé).
//
// Règles (LISEZMOI-claude-code.md) :
// - une étape dure au minimum sa durée prévue (dureeEtape) ; ensuite ses sorties sont évaluées dans l'ordre, la
//   première remplie gagne, une sortie sans condition est le « sinon » ; aucune sortie remplie → « bloqué » (on reste,
//   le top régie force la sortie) ; une étape sans sortie, ou une sortie vers '' , termine le moment ;
// - conditions : t (temps dans l'étape), pres, quorum, prets, bruit, assis, issue, mem:<nom>, sig:<nom>, sigv:<nom> ;
//   mode all / any ;
// - passage entre moments (phase 'passage', etape = null, tEtape = temps dans le passage) : prêt quand toutes ses
//   conditions sont remplies (10:00 au plus) ; 'auto' enchaîne, 'go' attend le top() (attenteGo) et cumule l'attente
//   dans `retard` (et `attentes[moment]`) ; un top() pendant un passage pas encore prêt le franchit aussitôt ;
// - l'issue du vote (et sa répartition, Signaux.votes) est retenue à la sortie d'une étape de vote / décompte
//   (TYPES_VOTE) ou d'une sortie conditionnée par l'issue ; elle choisit l'entrée des moments à table issue → étape ;
// - blocs moteur (garde-fou, mémoire, tirage, boucle, signal, machine, message, chrono, reprise, séquence, figurants,
//   quand le comédien dit) : voir blocs-moteur.ts ;
// - entrées extérieures pendant la représentation : poser(nom, valeur) pose une mémoire, signal(nom, donnees) compte
//   un signal reçu ; les deux sont journalisés (`journal`) et réévaluent aussitôt l'étape (ou le passage) en cours ;
// - sorties vers l'extérieur : `commandes` (machine, message, chrono, figurants.cmd, reprise), numérotées ;
// - séquences : l'étape 'd:sequence' joue son sous-déroulé ; `etape` reste l'étape du moment, `sequence` dit où l'on
//   est dedans ; les étapes jouées dans une séquence vont au journal ('sous-etape'), pas au parcours ;
// - le spectacle est terminé à la fin du dernier moment (son passage est ignoré).
//
// Les signaux passés à avancer() sont ceux de l'instant : en répétition, signauxSalle(projet.sens, etat.tEtape, graine).
import type { Etape, Moment, Projet, Sequence, Sortie } from './types';
import { dureeEtape } from './types';
import type {
  AlerteLecture, CommandeLecture, EtatLecture, EvenementLecture, FabriqueLecteur, Lecteur, OptionsLecteur, PointReprise,
  Signaux, TypeCommande,
} from './moteur';
import {
  BORNE_BOUCLE, PROFONDEUR_SEQUENCES, TYPES_VOTE, appliquerMemoire, commandeFigurants, comportementBloc, creerPrng,
  issuesExaequo, motEntendu, normaliserNom, poidsExaequo, poidsTirage, reglagesBoucle, reglagesChrono, reglagesComedien,
  reglagesFigurants, reglagesGarde, reglagesMachine, reglagesMemoire, reglagesMessage, reglagesReprise, reglagesSequence,
  reglagesSignal, reglagesTirage, sortieApresSequence, sortiesBoucle, sortiesChrono, sortiesComedien, sortiesGarde,
  sortiesMachine, sortiesMessage, sortiesSignal, texteSignal, tirerIndex, trouverSequence,
} from './blocs-moteur';
import { SIGNAUX_VIDES, cleSignal, sortieRemplie, type ContexteCondition } from './conditions';
import { PLAFOND_ATTENTE, entreeMoment, formatMMSS, planifier } from './temps';
import { signauxSalle } from './salle';

/** Graine par défaut en répétition (tirages rejouables). */
export const GRAINE_REPETITION = 1;
/** Nombre maximal d'étapes sans durée enchaînées d'un coup (points de reprise, séquences vides…). */
export const LIMITE_ENCHAINEMENT = 200;

type Memoires = Record<string, number | string | boolean>;

/** Séquence en cours : l'étape appelante attend dans le conteneur parent. */
interface Cadre {
  seq: Sequence;
  appelant: string;
  /** t d'entrée dans l'étape appelante */
  debut: number;
  /** facteur des durées (durées globales des séquences imbriquées multipliées) */
  facteur: number;
  intensite: number;
}

interface Reprise extends PointReprise {
  votes?: Record<string, number>;
  cadres: Cadre[];
  /** nombre de commandes émises au passage (état plateau à rejouer) */
  nCommandes: number;
}

interface Interne {
  t: number;
  im: number;
  etape: string | null;
  tEtape: number;
  phase: 'etape' | 'passage' | 'fin';
  attenteGo: boolean;
  retard: number;
  bloque: boolean;
  termine: boolean;
  issue?: string;
  votes?: Record<string, number>;
  memoires: Memoires;
  parcours: [string, string, number][];
  attentes: Record<string, number>;
  alertes: AlerteLecture[];
  tours: Record<string, number>;
  /** index de la sortie tirée pour l'étape courante (bloc Tirage) */
  tirage: number | null;
  cadres: Cadre[];
  /** réceptions de chaque signal depuis l'entrée dans l'étape (ou le passage) en cours */
  receptions: Record<string, number>;
  valeursSignaux: Memoires;
  journal: EvenementLecture[];
  commandes: CommandeLecture[];
  reprises: Reprise[];
  /** mot-clé entendu dans l'étape courante (Quand le comédien dit) */
  mot?: string;
  /** l'événement « 10 s restantes » du chrono courant est parti */
  dixSecondes: boolean;
  /** étape (ou passage) tenue : ni le temps ni un signal ne la terminent, seul le top régie sort */
  retenu: boolean;
  /** secondes ajoutées à la durée minimale de l'étape en cours (cumulables) */
  prolonge: number;
  /** étapes entrées depuis le dernier appel de l'API (garde-fou contre les enchaînements sans fin) */
  chaine: number;
}

/** Valeur lisible par 'sigv:' : la donnée elle-même, ou donnees.valeur, ou donnees.texte. */
function valeurDonnees(d: unknown): number | string | boolean | undefined {
  if (typeof d === 'number' || typeof d === 'string' || typeof d === 'boolean') return d;
  if (d && typeof d === 'object') {
    const o = d as Record<string, unknown>;
    for (const c of ['valeur', 'texte']) {
      const v = o[c];
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
    }
  }
  return undefined;
}
const virgule = (n: number) => String(n).replace('.', ',');
const capitale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Copie d'un tableau qui ne fait que grandir (parcours, alertes, journal, commandes) ou qui est remplacé d'un bloc (reprises) :
 *  tant que le tableau source est le même et de même longueur, la MÊME copie est rendue (la référence ne change pas) ; à
 *  l'ajout, une copie neuve ne copie que les éléments nouveaux ; un tableau source remplacé est recopié en entier. Les
 *  éléments déjà copiés ne sont jamais modifiés (le moteur ne fait que pousser dans ces tableaux). */
function copieurDeTableau<S, C = S>(copier: (x: S) => C): (a: S[]) => C[] {
  let source: S[] | null = null, n = 0, copie: C[] = [];
  return (a) => {
    if (a === source && a.length === n) return copie;
    copie = a === source && a.length > n ? [...copie, ...a.slice(n).map(copier)] : a.map(copier);
    source = a; n = a.length;
    return copie;
  };
}

/** Copie d'un dictionnaire de valeurs simples (mémoires, tours, réceptions, attentes, votes) : la même copie tant que
 *  le contenu est égal (clés et valeurs), une copie neuve dès qu'une valeur change. */
function copieurDeDictionnaire<V>(): (r: Record<string, V>) => Record<string, V> {
  let derniere: Record<string, V> | null = null;
  return (r) => {
    if (derniere) {
      const a = Object.keys(r), b = Object.keys(derniere);
      if (a.length === b.length && a.every(k => k in derniere! && derniere![k] === r[k])) return derniere;
    }
    derniere = { ...r };
    return derniere;
  };
}

export const creerLecteur: FabriqueLecteur = (projet: Projet, options: OptionsLecteur): Lecteur => {
  const graine = options.graine ?? (options.mode === 'repetition' ? GRAINE_REPETITION : Math.floor(Math.random() * 2 ** 32));
  let prng = creerPrng(graine);
  let s: Interne = initial();
  let signaux: Signaux = SIGNAUX_VIDES;

  function initial(): Interne {
    return {
      t: 0, im: -1, etape: null, tEtape: 0, phase: 'etape', attenteGo: false, retard: 0, bloque: false, termine: false,
      issue: undefined, votes: undefined, memoires: { ...(projet.memoires ?? {}) }, parcours: [], attentes: {}, alertes: [],
      tours: {}, tirage: null, cadres: [], receptions: {}, valeursSignaux: {}, journal: [], commandes: [], reprises: [],
      mot: undefined, dixSecondes: false, retenu: false, prolonge: 0, chaine: 0,
    };
  }

  const moment = (): Moment | undefined => projet.ev[s.im];
  const cadre = (): Cadre | undefined => s.cadres[s.cadres.length - 1];
  /** Étapes et sorties en cours : celles de la séquence la plus profonde, sinon celles du moment. */
  const conteneur = (): { st: Etape[]; tr: Sortie[] } | undefined => cadre()?.seq ?? moment();
  const etapeCourante = (): Etape | undefined => conteneur()?.st.find(x => x.id === s.etape);
  const sortiesDe = (id: string): Sortie[] => (conteneur()?.tr ?? []).filter(x => x.a === id);
  const facteur = () => cadre()?.facteur ?? 1;
  /** Étape du moment (l'étape 'd:sequence' quand on est dans une séquence). */
  const etapeMoment = (): string | null => s.cadres[0]?.appelant ?? s.etape;
  const cleTours = (id: string) => { const c = cadre(); return c ? `${c.seq.id}/${id}` : id; };
  const ctx = (): ContexteCondition => ({
    tEtape: s.tEtape, signaux, issue: s.issue, memoires: s.memoires, receptions: s.receptions, valeursSignaux: s.valeursSignaux,
  });
  const alerte = (type: AlerteLecture['type'], txt: string) =>
    s.alertes.push({ t: s.t, moment: moment()?.id ?? '', etape: etapeMoment() ?? undefined, type, txt });
  const journaliser = (type: EvenementLecture['type'], nom: string, valeur?: unknown) => {
    const e: EvenementLecture = { t: s.t, type, nom, moment: moment()?.id ?? '' };
    if (valeur !== undefined) e.valeur = valeur;
    if (s.etape) e.etape = s.etape;
    s.journal.push(e);
  };
  function emettre(type: TypeCommande, donnees: Record<string, unknown>) {
    const c = cadre();
    const d = c ? { ...donnees, sequence: c.seq.id, intensite: c.intensite } : { ...donnees };
    const cmd: CommandeLecture = { n: s.commandes.length + 1, t: s.t, type, moment: moment()?.id ?? '', donnees: d };
    if (s.etape) cmd.etape = s.etape;
    s.commandes.push(cmd);
  }

  // Copies mémoïsées pour etat() : une référence qui ne change que si le contenu change (voir copieurDeTableau).
  const copieMemoires = copieurDeDictionnaire<number | string | boolean>();
  const copieParcours = copieurDeTableau<[string, string, number]>(p => [...p] as [string, string, number]);
  const copieAttentes = copieurDeDictionnaire<number>();
  const copieAlertes = copieurDeTableau<AlerteLecture>(a => ({ ...a }));
  const copieTours = copieurDeDictionnaire<number>();
  const copieJournal = copieurDeTableau<EvenementLecture>(j => ({ ...j }));
  const copieCommandes = copieurDeTableau<CommandeLecture>(x => ({ ...x, donnees: { ...x.donnees } }));
  const copieReprises = copieurDeTableau<Reprise, PointReprise>(r => {
    const p: PointReprise = {
      nom: r.nom, t: r.t, moment: r.moment, etape: r.cadres[0]?.appelant ?? r.etape, restaure: r.restaure,
      memoires: { ...r.memoires },
    };
    if (r.issue !== undefined) p.issue = r.issue;
    return p;
  });
  const copieReceptions = copieurDeDictionnaire<number>();
  const copieVotes = copieurDeDictionnaire<number>();

  function etat(): EtatLecture {
    const c0 = s.cadres[0];
    const c = cadre();
    const e: EtatLecture = {
      t: s.t, moment: moment()?.id ?? null, etape: etapeMoment(), tEtape: c0 ? s.t - c0.debut : s.tEtape,
      attenteGo: s.attenteGo, retard: s.retard, bloque: s.bloque, termine: s.termine, issue: s.issue,
      memoires: copieMemoires(s.memoires), parcours: copieParcours(s.parcours),
      phase: s.phase, attentes: copieAttentes(s.attentes), alertes: copieAlertes(s.alertes), tours: copieTours(s.tours),
      journal: copieJournal(s.journal), commandes: copieCommandes(s.commandes), reprises: copieReprises(s.reprises),
      receptions: copieReceptions(s.receptions),
      retenu: s.retenu, prolonge: s.prolonge,
    };
    if (s.votes) e.votes = copieVotes(s.votes);
    if (c && s.etape) e.sequence = { id: c.seq.id, nom: c.seq.nom, etape: s.etape, tEtape: s.tEtape, chemin: s.cadres.map(x => x.seq.nom) };
    return e;
  }

  // ── Entrées ───────────────────────────────────────────────────────────────────────────────────────────────────────
  function entrerMoment(i: number, etapeId?: string) {
    s.im = i;
    s.tours = {};
    s.cadres = [];
    s.attenteGo = false;
    s.bloque = false;
    s.retenu = false;
    s.prolonge = 0;
    const m = moment();
    if (!m) { terminer(); return; }
    const id = etapeId ?? entreeMoment(m, s.issue);
    if (id && m.st.some(x => x.id === id)) entrerEtape(id);
    else finMoment();
  }

  function entrerEtape(id: string) {
    const m = moment()!;
    const st = conteneur()!.st.find(x => x.id === id)!;
    s.phase = 'etape';
    s.etape = id;
    s.tEtape = 0;
    s.bloque = false;
    s.attenteGo = false;
    s.tirage = null;
    s.receptions = {};
    s.mot = undefined;
    s.dixSecondes = false;
    s.retenu = false;
    s.prolonge = 0;
    const c = cadre();
    if (c) journaliser('sous-etape', c.seq.nom, id);
    else s.parcours.push([m.id, id, s.t]);
    if (++s.chaine > LIMITE_ENCHAINEMENT) {
      alerte('bloque', `Enchaînement sans durée interrompu à « ${st.name} » (${LIMITE_ENCHAINEMENT} étapes d’un coup).`);
      s.bloque = true;
      return;
    }
    const outs = sortiesDe(id);
    switch (comportementBloc(st.ty)) {
      case 'memoire': s.memoires = appliquerMemoire(s.memoires, reglagesMemoire(st)); break;
      case 'tirage': {
        const r = reglagesTirage(st);
        let p = poidsTirage(st, outs);
        if (r.exaequo) p = poidsExaequo(p, outs, issuesExaequo(s.votes ?? signaux.votes, s.issue ?? signaux.issue, r.ecart));
        s.tirage = tirerIndex(p, prng());
        break;
      }
      case 'boucle': { const k = cleTours(id); s.tours[k] = (s.tours[k] ?? 0) + 1; break; }
      case 'machine': {
        const r = reglagesMachine(st);
        emettre('machine', { cible: r.cible, commande: r.commande, accuse: r.accuse, delai: r.delai });
        break;
      }
      case 'message': {
        const r = reglagesMessage(st);
        emettre('message', { destinataire: r.destinataire, texte: r.texte, accuse: r.accuse, delai: r.delai });
        break;
      }
      case 'chrono': {
        const r = reglagesChrono(st);
        emettre('chrono', { duree: r.duree, affichage: r.affichage, fin: s.t + r.duree });
        break;
      }
      case 'figurants': emettre('figurants.cmd', commandeFigurants(reglagesFigurants(st))); break;
      case 'reprise':
        memoriserReprise(st);
        prendre(sortieDirecte(outs));
        break;
      case 'sequence': entrerSequence(st, outs); break;
      default: break;
    }
  }

  /** Sortie d'une étape qui ne dure pas : la première dont les conditions sont remplies, sinon le « sinon ». */
  const sortieDirecte = (outs: Sortie[]): Sortie | null =>
    outs.find(o => o.g.length > 0 && sortieRemplie(o, ctx())) ?? outs.find(o => !o.g.length) ?? outs[0] ?? null;

  function entrerSequence(st: Etape, outs: Sortie[]) {
    const r = reglagesSequence(st);
    const seq = trouverSequence(projet.sequences, r.sequence);
    let refus = '';
    if (!seq) refus = `Séquence « ${r.sequence || '(aucune)'} » introuvable : sortie directe de « ${st.name} ».`;
    else if (!seq.st.some(x => x.id === seq.entry)) refus = `Séquence « ${seq.nom} » sans étape d’entrée : sortie directe de « ${st.name} ».`;
    else if (s.cadres.length >= PROFONDEUR_SEQUENCES || s.cadres.some(c => c.seq.id === seq.id))
      refus = `Séquence « ${seq.nom} » imbriquée dans elle-même ou trop profondément : sortie directe de « ${st.name} ».`;
    if (refus || !seq) {
      alerte('sequence', refus);
      prendre(sortieApresSequence(outs, undefined) ?? null);
      return;
    }
    s.cadres.push({ seq, appelant: st.id, debut: s.t, facteur: facteur() * r.facteur, intensite: r.intensite });
    entrerEtape(seq.entry);
  }

  function memoriserReprise(st: Etape) {
    const r = reglagesReprise(st);
    const p: Reprise = {
      nom: r.nom, t: s.t, moment: moment()?.id ?? '', etape: st.id, restaure: r.restaure, memoires: { ...s.memoires },
      cadres: s.cadres.map(c => ({ ...c })), nCommandes: s.commandes.length,
    };
    if (s.issue !== undefined) p.issue = s.issue;
    if (s.votes) p.votes = { ...s.votes };
    s.reprises = s.reprises.filter(x => normaliserNom(x.nom) !== normaliserNom(r.nom));
    s.reprises.push(p);
  }

  /** Fin de l'étape courante sans suite : fin de la séquence en cours (sortie de même nom de l'appelant) ou du moment. */
  function finConteneur(nomFin?: string) {
    const c = s.cadres.pop();
    if (!c) { finMoment(); return; }
    s.etape = c.appelant;
    s.tEtape = s.t - c.debut;
    s.receptions = {};
    prendre(sortieApresSequence(sortiesDe(c.appelant), nomFin) ?? null);
  }

  function finMoment() {
    s.cadres = [];
    if (s.im >= projet.ev.length - 1) { terminer(); return; }
    s.phase = 'passage';
    s.etape = null;
    s.tEtape = 0;
    s.bloque = false;
    s.attenteGo = false;
    s.prolonge = 0;   // la prolongation ne vaut que pour l'étape où elle a été demandée
    s.receptions = {};
    // Sans condition, le passage se décide tout de suite ; avec conditions, on attend les signaux du passage
    // (prochain avancer), le temps du passage repartant de zéro comme dans le design.
    if (!moment()?.gate?.g.length) evaluerPassage(false);
  }

  function terminer() {
    s.phase = 'fin';
    s.etape = null;
    s.cadres = [];
    s.attenteGo = false;
    s.bloque = false;
    s.retenu = false;
    s.prolonge = 0;
    s.termine = true;
    if (s.im >= projet.ev.length) s.im = projet.ev.length - 1;
  }

  /** Quitte l'étape courante par la sortie `o` (null = fin de la séquence ou du moment). */
  function prendre(o: Sortie | null | undefined) {
    const st = etapeCourante();
    if (st && TYPES_VOTE.includes(st.ty)) {
      if (signaux.issue !== undefined) s.issue = signaux.issue;
      if (signaux.votes) s.votes = { ...signaux.votes };
    }
    const gi = o?.g.find(g => g.k === 'issue' && g.op === '=' && typeof g.v === 'string');
    if (gi) s.issue = String(gi.v);
    if (o && o.b && conteneur()?.st.some(x => x.id === o.b)) entrerEtape(o.b);
    else finConteneur(o?.nom);
  }

  // ── Évaluation d'une étape ──────────────────────────────────────────────────────────────────────────────────────
  /** force = top régie : on n'attend pas la durée prévue et une étape bloquée sort par son « sinon » (ou sa 1re sortie). */
  function evaluerEtape(force: boolean) {
    const st = etapeCourante();
    if (!moment() || !st) { finConteneur(); return; }
    // Étape tenue : seul le top régie (force) la termine ; les signaux restent comptés mais n'évaluent pas la sortie.
    if (s.retenu && !force) return;
    const d = dureeEtape(st) * facteur() + s.prolonge;
    const outs = sortiesDe(st.id);
    const c = ctx();
    const comp = comportementBloc(st.ty);

    if (comp === 'garde') {
      const { conditions, delai } = sortiesGarde(outs);
      if (s.attenteGo) { if (force) prendre(delai ?? null); return; }
      if (!force && s.tEtape < d) return;
      const ok = conditions.find(o => o.g.length > 0 && sortieRemplie(o, c));
      if (ok) { prendre(ok); return; }
      const r = reglagesGarde(st);
      if (force || s.tEtape >= Math.max(d, r.delai)) {
        if (!force) alerte('delai', `Garde-fou « ${st.name} » : délai dépassé à ${formatMMSS(s.tEtape)}.`);
        if (!force && r.echeance === 'top') { s.attenteGo = true; return; }
        prendre(delai ?? null);
      }
      return;
    }

    if (comp === 'signal') {
      const r = reglagesSignal(st);
      const n = s.receptions[cleSignal(r.signal)] ?? 0;
      if (force || n >= r.fois) { prendre(sortiesSignal(outs).recu ?? null); return; }
      if (s.tEtape >= d && !s.bloque) {
        s.bloque = true;
        alerte('signal', `« ${st.name} » attend toujours le signal « ${r.signal} » (${n}/${r.fois}).`);
      }
      return;
    }

    if (comp === 'machine') {
      const r = reglagesMachine(st);
      const { confirme, sansReponse } = sortiesMachine(outs);
      if ((s.receptions[cleSignal(r.accuse)] ?? 0) > 0) { prendre(confirme ?? null); return; }
      if (force) { prendre(sansReponse ?? confirme ?? null); return; }
      if (s.tEtape >= r.delai - 1e-9) {
        alerte('machine', `${capitale(r.cible)} ne répond pas : « ${r.commande} » sans accusé après ${virgule(r.delai)} s (« ${st.name} »).`);
        prendre(sansReponse ?? confirme ?? null);
      }
      return;
    }

    if (comp === 'message') {
      const r = reglagesMessage(st);
      const { lu, nonLu } = sortiesMessage(outs);
      if ((s.receptions[cleSignal(r.accuse)] ?? 0) > 0) { prendre(lu ?? null); return; }
      if (force) { prendre(nonLu ?? lu ?? null); return; }
      if (s.tEtape >= r.delai - 1e-9) {
        alerte('message', `${r.destinataire.split(' · ')[0]} n’a pas lu la consigne « ${st.name} » (${formatMMSS(r.delai)}).`);
        prendre(nonLu ?? lu ?? null);
      }
      return;
    }

    if (comp === 'chrono') {
      const r = reglagesChrono(st);
      const { zero, dixSecondes } = sortiesChrono(outs);
      if (force) { prendre(zero ?? null); return; }
      const reste = r.duree - s.tEtape;
      if (!s.dixSecondes && r.duree > 10 && reste <= 10 + 1e-9 && reste > 1e-9) {
        s.dixSecondes = true;
        emettre('chrono.10s', { restant: 10, affichage: r.affichage, fin: s.t + reste });
        if (dixSecondes) { prendre(dixSecondes); return; }
      }
      if (reste <= 1e-9) prendre(zero ?? null);
      return;
    }

    if (comp === 'comedien') {
      const r = reglagesComedien(st);
      const { dit, pasDit } = sortiesComedien(outs, s.mot);
      if (s.mot !== undefined || force) { prendre(dit ?? null); return; }
      if (pasDit && s.tEtape >= r.delai) { prendre(pasDit); return; }
      if (!pasDit && s.tEtape >= Math.max(d, r.delai) && !s.bloque) {
        s.bloque = true;
        alerte('signal', `« ${st.name} » attend toujours un mot-clé (${r.mots.join(', ') || 'aucun mot-clé réglé'}).`);
      }
      return;
    }

    if (comp === 'reprise') { prendre(sortieDirecte(outs)); return; }

    if (!force && s.tEtape < d) return;

    if (comp === 'tirage') {
      prendre(outs.length ? outs[s.tirage ?? 0] ?? outs[0] : null);
      return;
    }

    if (comp === 'boucle') {
      const { encore, termine } = sortiesBoucle(outs);
      const cle = cleTours(st.id);
      const n = s.tours[cle] ?? 0;
      const r = reglagesBoucle(st);
      let fini = n >= r.tours || (!!termine && termine.g.length > 0 && sortieRemplie(termine, c));
      if (!fini && n >= r.borne) {
        fini = true;
        alerte('boucle', `Boucle « ${st.name} » arrêtée à ${BORNE_BOUCLE} tours (borne de sécurité).`);
      }
      if (fini || !encore) { s.tours[cle] = 0; prendre(termine ?? null); }
      else prendre(encore);
      return;
    }

    // Étape normale (et Mémoire, Figurants).
    if (!outs.length) { prendre(null); return; }
    const ok = outs.find(o => sortieRemplie(o, c));
    if (ok) { prendre(ok); return; }
    if (force) {
      alerte('force', `Top régie : sortie forcée de « ${st.name} ».`);
      prendre(outs.find(o => !o.g.length) ?? outs[0]);
      return;
    }
    if (!s.bloque) alerte('bloque', `« ${st.name} » est bloquée : aucune sortie remplie après ${formatMMSS(d)}.`);
    s.bloque = true;
  }

  // ── Passage ───────────────────────────────────────────────────────────────────────────────────────────────────────
  function evaluerPassage(force: boolean) {
    const m = moment();
    if (!m) { terminer(); return; }
    if (force) { franchir(); return; }
    if (s.retenu || s.attenteGo) return;
    const g = m.gate ?? { mode: 'auto' as const, g: [] };
    const pret = sortieRemplie({ g: g.g, mode: 'all' }, ctx()) || s.tEtape >= PLAFOND_ATTENTE;
    if (!pret) return;
    if (g.mode === 'go') { s.attenteGo = true; s.attentes[m.id] = s.attentes[m.id] ?? 0; return; }
    franchir();
  }

  function franchir() {
    s.attenteGo = false;
    entrerMoment(s.im + 1);
  }

  /** Réévalue tout de suite l'étape ou le passage en cours (après une entrée extérieure). */
  function reevaluer() {
    if (s.termine) return;
    if (s.phase === 'etape') evaluerEtape(false);
    else if (s.phase === 'passage') evaluerPassage(false);
  }

  // ── API ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  function demarrerSiBesoin() {
    s.chaine = 0;
    if (s.im < 0 && !s.termine) {
      if (!projet.ev.length) { terminer(); return; }
      entrerMoment(0);
    }
  }

  /** Dernières commandes « état plateau » émises avant la n-ième : une par machine, plus la dernière des figurants. */
  function etatPlateau(n: number): CommandeLecture[] {
    const der = new Map<string, CommandeLecture>();
    for (const c of s.commandes.slice(0, n)) {
      if (c.type === 'machine') der.set('machine:' + String(c.donnees.cible), c);
      else if (c.type === 'figurants.cmd') der.set('figurants', c);
    }
    return [...der.values()].map(c => ({ ...c, donnees: { ...c.donnees } }));
  }

  const lecteur: Lecteur = {
    etat() {
      demarrerSiBesoin();
      return etat();
    },
    avancer(dt: number, sig: Signaux) {
      demarrerSiBesoin();
      signaux = sig ?? SIGNAUX_VIDES;
      if (s.termine) return etat();
      const pas = Math.max(0, Number.isFinite(dt) ? dt : 0);
      s.t += pas;
      s.tEtape += pas;
      if (s.attenteGo) {
        s.retard += pas;
        const id = moment()?.id;
        if (id && s.phase === 'passage') s.attentes[id] = (s.attentes[id] ?? 0) + pas;
      }
      if (s.phase === 'etape') evaluerEtape(false);
      else if (s.phase === 'passage') evaluerPassage(false);
      return etat();
    },
    top() {
      demarrerSiBesoin();
      if (s.termine) return etat();
      // Le top régie lève la retenue : l'étape tenue sort alors comme une étape bloquée (son « sinon »).
      s.retenu = false;
      if (s.phase === 'passage') evaluerPassage(true);
      else if (s.phase === 'etape') evaluerEtape(true);
      return etat();
    },
    allerA(momentId: string, etapeId?: string) {
      demarrerSiBesoin();
      const i = projet.ev.findIndex(x => x.id === momentId);
      if (i < 0) return etat();
      const m = projet.ev[i]!;
      const cible = etapeId && m.st.some(x => x.id === etapeId) ? etapeId : undefined;
      // La tête de lecture se place au début prévu du moment (et de l'étape si elle est sur le chemin principal).
      const pl = planifier(projet, { issue: s.issue, attentes: s.attentes }).moments[i];
      const ep = cible ? pl?.etapes.find(x => x.id === cible) : undefined;
      s.t = ep ? ep.debut : (pl?.debut ?? s.t);
      s.termine = false;
      s.phase = 'etape';
      s.retenu = false;
      s.prolonge = 0;
      entrerMoment(i, cible);
      return etat();
    },
    reinitialiser() {
      prng = creerPrng(graine);
      s = initial();
      signaux = SIGNAUX_VIDES;
      demarrerSiBesoin();
      return etat();
    },
    poser(nom: string, valeur: number | string | boolean) {
      demarrerSiBesoin();
      if (typeof nom !== 'string' || !nom.trim()) return etat();
      s.memoires = { ...s.memoires, [nom]: valeur };
      journaliser('memoire', nom, valeur);
      reevaluer();
      return etat();
    },
    signal(nom: string, donnees?: unknown) {
      demarrerSiBesoin();
      const cle = cleSignal(String(nom ?? ''));
      if (!cle) return etat();
      s.receptions[cle] = (s.receptions[cle] ?? 0) + 1;
      const v = valeurDonnees(donnees);
      if (v !== undefined) s.valeursSignaux[cle] = v;
      journaliser('signal', nom, donnees);
      if (s.termine) return etat();
      const st = s.phase === 'etape' ? etapeCourante() : undefined;
      if (st && comportementBloc(st.ty) === 'comedien' && s.mot === undefined) {
        const r = reglagesComedien(st);
        const texte = texteSignal(donnees);
        const mot = cleSignal(r.source) === cle ? motEntendu(texte, r) : undefined;
        if (mot !== undefined) { s.mot = mot; journaliser('mot', mot, texte); }
      }
      reevaluer();
      return etat();
    },
    retenir(actif: boolean) {
      demarrerSiBesoin();
      if (s.termine) return etat();
      const voulu = !!actif;
      if (voulu === s.retenu) return etat();
      s.retenu = voulu;
      journaliser('retenir', voulu ? 'retenu' : 'relâché', voulu);
      // Relâcher réévalue aussitôt : une étape dont la durée est échue repart sans attendre le prochain pas de temps.
      if (!voulu) reevaluer();
      return etat();
    },
    prolonger(secondes: number) {
      demarrerSiBesoin();
      if (s.termine || !Number.isFinite(secondes) || secondes <= 0) return etat();
      s.prolonge += secondes;
      journaliser('prolonger', 'prolonger', secondes);
      // Une étape déclarée bloquée (durée échue sans sortie remplie) retrouve du temps devant elle.
      if (s.bloque && s.phase === 'etape') {
        const st = etapeCourante();
        if (st && s.tEtape < dureeEtape(st) * facteur() + s.prolonge) s.bloque = false;
      }
      return etat();
    },
    reprendre(nomPoint?: string) {
      demarrerSiBesoin();
      const nom = typeof nomPoint === 'string' ? nomPoint.trim() : '';
      const dernier = s.reprises[s.reprises.length - 1];
      let p = nom ? [...s.reprises].reverse().find(x => normaliserNom(x.nom) === normaliserNom(nom)) : dernier;
      if (!p) {
        if (!dernier) {
          alerte('reprise', nom ? `Reprise impossible : le point « ${nom} » n’a pas encore été passé.` : 'Reprise impossible : aucun point de reprise passé.');
          return etat();
        }
        alerte('reprise', `Le point « ${nom} » n’a pas été passé : reprise au point précédent « ${dernier.nom} ».`);
        p = dernier;
      }
      const point = p;
      const i = projet.ev.findIndex(m => m.id === point.moment);
      if (i < 0) { alerte('reprise', `Reprise impossible : le moment « ${point.moment} » n’existe plus.`); return etat(); }
      if (point.restaure === 'tout' || point.restaure === 'memoires') {
        s.memoires = { ...point.memoires };
        s.issue = point.issue;
        s.votes = point.votes ? { ...point.votes } : undefined;
      }
      s.t = point.t;
      s.im = i;
      s.tours = {};
      s.termine = false;
      s.attenteGo = false;
      s.bloque = false;
      s.cadres = point.cadres.map(c => ({ ...c }));
      journaliser('reprise', point.nom, point.restaure);
      const donnees: Record<string, unknown> = { nom: point.nom, restaure: point.restaure };
      if (point.restaure === 'tout' || point.restaure === 'plateau') donnees.plateau = etatPlateau(point.nCommandes);
      emettre('reprise', donnees);
      // On repasse le point (nouvel instantané), puis sa sortie.
      if (conteneur()?.st.some(x => x.id === point.etape)) entrerEtape(point.etape);
      else entrerMoment(i);
      return etat();
    },
  };
  demarrerSiBesoin();
  return lecteur;
};

export interface OptionsSimulation {
  mode?: OptionsLecteur['mode'];
  graine?: number;
  /** pas de temps (s), défaut 1 */
  pas?: number;
  /** la régie donne le top après ce délai d'attente (s) au passage « go » ou au garde-fou ; défaut 5 */
  topApres?: number;
  /** la régie force une étape bloquée après ce délai (s) ; défaut 60 */
  forcerBloqueApres?: number;
  /** durée maximale simulée (s), défaut 4 h */
  max?: number;
  /** signaux de la salle (défaut : salle simulée du projet, sans bruit) */
  signaux?: (t: number, etat: EtatLecture) => Signaux;
  /** appelé après chaque pas : envoie des signaux ou pose des mémoires (accusés, OSC, transcription…) */
  evenements?: (etat: EtatLecture, lecteur: Lecteur) => void;
}

/**
 * Répétition complète avec la salle simulée : avance pas à pas, donne les tops et force les blocages comme le ferait
 * la régie. Renvoie l'état final et le nombre de tops donnés.
 */
export function simuler(projet: Projet, o: OptionsSimulation = {}): { etat: EtatLecture; tops: number } {
  const L = creerLecteur(projet, { mode: o.mode ?? 'repetition', graine: o.graine });
  const pas = o.pas ?? 1;
  const topApres = o.topApres ?? 5;
  const forcer = o.forcerBloqueApres ?? 60;
  const max = o.max ?? 4 * 3600;
  const sig = o.signaux ?? ((tEtape: number) => signauxSalle(projet.sens, tEtape));
  let e = L.etat();
  let tops = 0;
  let attente = 0;
  let bloque = 0;
  while (!e.termine && e.t < max) {
    e = L.avancer(pas, sig(e.tEtape + pas, e));
    if (o.evenements) { o.evenements(e, L); e = L.etat(); }
    attente = e.attenteGo ? attente + pas : 0;
    bloque = e.bloque ? bloque + pas : 0;
    if ((e.attenteGo && attente >= topApres) || (e.bloque && bloque >= forcer)) {
      e = L.top();
      tops++;
      attente = 0;
      bloque = 0;
    }
  }
  return { etat: e, tops };
}
