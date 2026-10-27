// Moteur de lecture du conducteur : pur et déterministe (même projet + mêmes signaux + même graine = même déroulé).
//
// Règles (LISEZMOI-claude-code.md) :
// - une étape dure au minimum sa durée prévue (dureeEtape) ; ensuite ses sorties sont évaluées dans l'ordre, la
//   première remplie gagne, une sortie sans condition est le « sinon » ; aucune sortie remplie → « bloqué » (on reste,
//   le top régie force la sortie) ; une étape sans sortie, ou une sortie vers '' , termine le moment ;
// - conditions : t (temps dans l'étape), pres, quorum, prets, bruit, assis, issue, mem:<nom> ; mode all / any ;
// - passage entre moments (phase 'passage', etape = null, tEtape = temps dans le passage) : prêt quand toutes ses
//   conditions sont remplies (10:00 au plus) ; 'auto' enchaîne, 'go' attend le top() (attenteGo) et cumule l'attente
//   dans `retard` (et `attentes[moment]`) ; un top() pendant un passage pas encore prêt le franchit aussitôt ;
// - l'issue du vote est retenue à la sortie d'une étape de vote / décompte (TYPES_VOTE) ou d'une sortie conditionnée
//   par l'issue ; elle choisit l'entrée des moments à table issue → étape ;
// - blocs moteur (garde-fou, mémoire, tirage, boucle) : voir blocs-moteur.ts ;
// - le spectacle est terminé à la fin du dernier moment (son passage est ignoré).
//
// Les signaux passés à avancer() sont ceux de l'instant : en répétition, signauxSalle(projet.sens, etat.tEtape, graine).
import type { Etape, Moment, Projet, Sortie } from './types';
import { dureeEtape } from './types';
import type { AlerteLecture, EtatLecture, FabriqueLecteur, Lecteur, OptionsLecteur, Signaux } from './moteur';
import {
  BORNE_BOUCLE, TYPES_VOTE, appliquerMemoire, comportementBloc, creerPrng, poidsTirage, reglagesBoucle,
  reglagesGarde, reglagesMemoire, sortiesBoucle, sortiesGarde, tirerIndex,
} from './blocs-moteur';
import { SIGNAUX_VIDES, sortieRemplie, type ContexteCondition } from './conditions';
import { PLAFOND_ATTENTE, entreeMoment, formatMMSS, planifier } from './temps';
import { signauxSalle } from './salle';

/** Graine par défaut en répétition (tirages rejouables). */
export const GRAINE_REPETITION = 1;

type Memoires = Record<string, number | string | boolean>;

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
  memoires: Memoires;
  parcours: [string, string, number][];
  attentes: Record<string, number>;
  alertes: AlerteLecture[];
  tours: Record<string, number>;
  /** index de la sortie tirée pour l'étape courante (bloc Tirage) */
  tirage: number | null;
}

export const creerLecteur: FabriqueLecteur = (projet: Projet, options: OptionsLecteur): Lecteur => {
  const graine = options.graine ?? (options.mode === 'repetition' ? GRAINE_REPETITION : Math.floor(Math.random() * 2 ** 32));
  let prng = creerPrng(graine);
  let s: Interne = initial();
  let signaux: Signaux = SIGNAUX_VIDES;

  function initial(): Interne {
    return {
      t: 0, im: -1, etape: null, tEtape: 0, phase: 'etape', attenteGo: false, retard: 0, bloque: false, termine: false,
      issue: undefined, memoires: { ...(projet.memoires ?? {}) }, parcours: [], attentes: {}, alertes: [], tours: {}, tirage: null,
    };
  }

  const moment = (): Moment | undefined => projet.ev[s.im];
  const etapeCourante = (): Etape | undefined => moment()?.st.find(x => x.id === s.etape);
  const sortiesDe = (m: Moment, id: string): Sortie[] => m.tr.filter(x => x.a === id);
  const ctx = (): ContexteCondition => ({ tEtape: s.tEtape, signaux, issue: s.issue, memoires: s.memoires });
  const alerte = (type: AlerteLecture['type'], txt: string) =>
    s.alertes.push({ t: s.t, moment: moment()?.id ?? '', etape: s.etape ?? undefined, type, txt });

  function etat(): EtatLecture {
    return {
      t: s.t, moment: moment()?.id ?? null, etape: s.etape, tEtape: s.tEtape, attenteGo: s.attenteGo, retard: s.retard,
      bloque: s.bloque, termine: s.termine, issue: s.issue, memoires: { ...s.memoires },
      parcours: s.parcours.map(p => [...p] as [string, string, number]),
      phase: s.phase, attentes: { ...s.attentes }, alertes: s.alertes.map(a => ({ ...a })), tours: { ...s.tours },
    };
  }

  // ── Entrées ───────────────────────────────────────────────────────────────────────────────────────────────────────
  function entrerMoment(i: number, etapeId?: string) {
    s.im = i;
    s.tours = {};
    s.attenteGo = false;
    s.bloque = false;
    const m = moment();
    if (!m) { terminer(); return; }
    const id = etapeId ?? entreeMoment(m, s.issue);
    if (id && m.st.some(x => x.id === id)) entrerEtape(id);
    else finMoment();
  }

  function entrerEtape(id: string) {
    const m = moment()!;
    const st = m.st.find(x => x.id === id)!;
    s.phase = 'etape';
    s.etape = id;
    s.tEtape = 0;
    s.bloque = false;
    s.attenteGo = false;
    s.tirage = null;
    s.parcours.push([m.id, id, s.t]);
    const comp = comportementBloc(st.ty);
    if (comp === 'memoire') s.memoires = appliquerMemoire(s.memoires, reglagesMemoire(st));
    else if (comp === 'tirage') s.tirage = tirerIndex(poidsTirage(st, sortiesDe(m, id)), prng());
    else if (comp === 'boucle') s.tours[id] = (s.tours[id] ?? 0) + 1;
  }

  function finMoment() {
    if (s.im >= projet.ev.length - 1) { terminer(); return; }
    s.phase = 'passage';
    s.etape = null;
    s.tEtape = 0;
    s.bloque = false;
    s.attenteGo = false;
    // Sans condition, le passage se décide tout de suite ; avec conditions, on attend les signaux du passage
    // (prochain avancer), le temps du passage repartant de zéro comme dans le design.
    if (!moment()?.gate?.g.length) evaluerPassage(false);
  }

  function terminer() {
    s.phase = 'fin';
    s.etape = null;
    s.attenteGo = false;
    s.bloque = false;
    s.termine = true;
    if (s.im >= projet.ev.length) s.im = projet.ev.length - 1;
  }

  /** Quitte l'étape courante par la sortie `o` (null = fin du moment). */
  function prendre(o: Sortie | null | undefined) {
    const st = etapeCourante();
    if (st && TYPES_VOTE.includes(st.ty) && signaux.issue !== undefined) s.issue = signaux.issue;
    const gi = o?.g.find(g => g.k === 'issue' && g.op === '=' && typeof g.v === 'string');
    if (gi) s.issue = String(gi.v);
    const m = moment()!;
    if (o && o.b && m.st.some(x => x.id === o.b)) entrerEtape(o.b);
    else finMoment();
  }

  // ── Évaluation d'une étape ──────────────────────────────────────────────────────────────────────────────────────
  /** force = top régie : on n'attend pas la durée prévue et une étape bloquée sort par son « sinon » (ou sa 1re sortie). */
  function evaluerEtape(force: boolean) {
    const m = moment();
    const st = etapeCourante();
    if (!m || !st) { finMoment(); return; }
    const d = dureeEtape(st);
    const outs = sortiesDe(m, st.id);
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

    if (!force && s.tEtape < d) return;

    if (comp === 'tirage') {
      prendre(outs.length ? outs[s.tirage ?? 0] ?? outs[0] : null);
      return;
    }

    if (comp === 'boucle') {
      const { encore, termine } = sortiesBoucle(outs);
      const n = s.tours[st.id] ?? 0;
      const r = reglagesBoucle(st);
      let fini = n >= r.tours || (!!termine && termine.g.length > 0 && sortieRemplie(termine, c));
      if (!fini && n >= r.borne) {
        fini = true;
        alerte('boucle', `Boucle « ${st.name} » arrêtée à ${BORNE_BOUCLE} tours (borne de sécurité).`);
      }
      if (fini || !encore) { s.tours[st.id] = 0; prendre(termine ?? null); }
      else prendre(encore);
      return;
    }

    // Étape normale (et Mémoire).
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
    if (s.attenteGo) return;
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

  // ── API ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  function demarrerSiBesoin() {
    if (s.im < 0 && !s.termine) {
      if (!projet.ev.length) { terminer(); return; }
      entrerMoment(0);
    }
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
