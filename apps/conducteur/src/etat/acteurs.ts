// Ce que chaque acteur du spectacle AFFICHE vraiment (audit 2026-10, rapport 2 §4.2 a et §4.3) : le magasin des
// retours des sorties, lu par le rail des sorties (coquille/RailSorties.tsx), le panneau Régie et, plus tard, par la
// bande des acteurs de la planche et l'inspecteur Envois. Rempli par le client régie du serveur de spectacle
// (etat/spectacle.ts) et, en repli, par l'état local de la sortie écran scène (sortie/relais.ts).
//
// API (stable : d'autres lots la lisent)
//   poserEtatActeur(id, etat)     battement d'un acteur nommé (relais `etat` du serveur, ou repli local) ; fusionné
//                                 avec le précédent (un accusé d'affichage n'efface pas les médias du battement)
//   poserResumeSalle(msg)         résumé `salle` du serveur : présents, prêts, en ligne, vue DEMANDÉE, écrans affichés,
//                                 aller-retour médian, vote en cours
//   useEtatActeurs()              hook React : Record<id acteur, EtatActeur>
//   useResumesSalle()             hook React : { acteurs: Record<id, ResumeActeur>, vote, recu }
//   etatActeurs(), resumeSalle()  lecture hors React
//   oublierActeurs()              tout oublier (déliaison du serveur, tests)
// Calculs PURS (testés dans acteurs.test.ts) :
//   agregatsFoule(resume, vote?)  connectés, hors ligne, prêts, votes reçus, écran majoritaire, barre empilée
//   libelleBarre(barre)           « 118 vote Q3 · 4 noir · 2 hors ligne »
//   diagnosticActeur(entrée)      pastille (verte < 1 s de latence, ambre en attente, rouge perdu), affiché / demandé,
//                                 écart (ambre > 2 s, rouge > 5 s), latence, alertes
//   chuteConnectes(historique)    chute de plus de 10 % des connectés en 10 s
import { create } from 'zustand';
import type { Acteur } from '@studio-real/modele';
import type { AppClient, EcranAffiche, MediaActeur, MsgSalle, ResumeActeurSalle } from '@studio-real/protocole';

/** Écart demandé / affiché : ambre au-delà de 2 s, rouge au-delà de 5 s (rapport 2 §4.2 a). */
export const ECART_AMBRE_MS = 2000;
export const ECART_ROUGE_MS = 5000;
/** Un acteur nommé sans battement depuis ce délai est perdu (un téléphone bat toutes les 5 s, un écran toutes les 1 s). */
export const PERTE_ACTEUR_MS = 12_000;
/** Latence au-delà de laquelle la pastille n'est plus verte. */
export const LATENCE_VERTE_MS = 1000;
/** Chute des connectés : plus de 10 % en 10 s (rapport 2 §4.3). */
export const CHUTE_PART = 0.1;
export const CHUTE_FENETRE_MS = 10_000;

/** Battement d'un acteur nommé, tel que la régie le garde. */
export interface EtatActeur {
  acteur: string;
  personne?: string;
  /** heure LOCALE (régie) de réception */
  recu: number;
  /** heure du client (battement) et heure serveur (relais), si connues */
  heure?: number;
  ts?: number;
  /** ce qui est AFFICHÉ (pas ce qui a été demandé) */
  ecran: EcranAffiche | null;
  visible: boolean;
  enLigne?: boolean;
  rttMs?: number;
  media?: MediaActeur[];
  batterie?: number;
  erreurs?: string[];
  app?: AppClient;
  /** 'serveur' : relayé par le serveur de spectacle ; 'local' : repli (sortie écran scène de cette machine) */
  source: 'serveur' | 'local';
}

/** Résumé d'un acteur (message `salle`), avec l'heure locale où sa vue demandée courante a été vue la première fois. */
export interface ResumeActeur extends ResumeActeurSalle {
  /** heure locale où la `demande.vseq` courante est apparue (base de l'écart demandé / affiché) */
  demandeVueLe?: number;
}

export interface EtatActeursMagasin {
  etats: Record<string, EtatActeur>;
  resumes: Record<string, ResumeActeur>;
  vote: MsgSalle['vote'] | null;
  /** heure locale du dernier `salle` (0 : jamais) */
  recu: number;
  /** total des connectés de la foule, horodaté (fenêtre glissante de la chute des connectés) */
  historique: { t: number; n: number }[];
}

const vide = (): EtatActeursMagasin => ({ etats: {}, resumes: {}, vote: null, recu: 0, historique: [] });
const magasin = create<EtatActeursMagasin>(vide);

/** Pose (fusionne) le battement d'un acteur. `recu` : heure locale (défaut : maintenant). */
export function poserEtatActeur(id: string, etat: Omit<EtatActeur, 'acteur' | 'recu' | 'source'> & { recu?: number; source?: EtatActeur['source'] }): void {
  const avant = magasin.getState().etats[id];
  const suivant: EtatActeur = { ...(avant ?? {}), ...etat, acteur: id, recu: etat.recu ?? Date.now(), source: etat.source ?? 'serveur' } as EtatActeur;
  magasin.setState(s => ({ etats: { ...s.etats, [id]: suivant } }));
}

/** Oublie le battement d'un acteur (repli local retiré). */
export function oublierEtatActeur(id: string): void {
  const { [id]: _retire, ...reste } = magasin.getState().etats;
  void _retire;
  magasin.setState({ etats: reste });
}

/** Pose le résumé `salle` du serveur. `maintenant` : heure locale (défaut : maintenant). */
export function poserResumeSalle(m: Pick<MsgSalle, 'acteurs' | 'vote'>, maintenant = Date.now()): void {
  const avant = magasin.getState();
  const resumes: Record<string, ResumeActeur> = {};
  let foule = 0;
  for (const [id, r] of Object.entries(m.acteurs)) {
    const ancien = avant.resumes[id];
    const memeDemande = !!ancien?.demande && !!r.demande && ancien.demande.vseq === r.demande.vseq;
    resumes[id] = { ...r, ...(r.demande ? { demandeVueLe: memeDemande ? ancien!.demandeVueLe ?? maintenant : maintenant } : {}) };
    // connectés : acteurs de la salle (les agents n'ont que `presents`)
    if (r.prets !== undefined) foule += r.presents;
  }
  const historique = [...avant.historique.filter(x => maintenant - x.t <= CHUTE_FENETRE_MS), { t: maintenant, n: foule }];
  magasin.setState({ resumes, vote: m.vote ?? null, recu: maintenant, historique });
}

export function oublierActeurs(): void { magasin.setState(vide()); }
export const etatActeurs = (): Record<string, EtatActeur> => magasin.getState().etats;
export const resumeSalle = (): EtatActeursMagasin => magasin.getState();
/** Hook : battements des acteurs nommés (id → état). */
export const useEtatActeurs = (): Record<string, EtatActeur> => magasin(s => s.etats);
/** Hook : résumé de salle (acteurs, vote, heure de réception). */
export const useResumesSalle = <T = EtatActeursMagasin>(choix?: (s: EtatActeursMagasin) => T): T =>
  magasin(choix ?? ((s: EtatActeursMagasin) => s as unknown as T));
/** Accès direct au magasin (abonnement hors React, tests). */
export const magasinActeurs = magasin;

// ── Agrégats de la foule ───────────────────────────────────────────────────────────────────────────────────────────

export interface PartBarre {
  /** écran affiché ('' : aucun écran), ou 'hors-ligne' */
  ecran: string;
  libelle: string;
  n: number;
}
export interface AgregatsFoule {
  connectes: number;
  horsLigne: number;
  prets: number;
  /** votes reçus pour la question en cours (null : pas de vote) */
  votes: number | null;
  question: string | null;
  /** écran affiché par le plus grand nombre de personnes en ligne */
  majoritaire: { ecran: string; libelle: string; n: number } | null;
  /** écrans affichés, du plus montré au moins montré, puis les hors ligne (la somme vaut `connectes`) */
  barre: PartBarre[];
}

/** Libellé court d'un écran : « vote Q3 » pendant la question 3, « aucun écran », sinon son nom. */
export function libelleEcran(ecran: string | null | undefined, question?: string | null): string {
  if (!ecran) return 'aucun écran';
  if (ecran === 'vote' && question) return 'vote Q' + question;
  return ecran;
}

export function agregatsFoule(r: ResumeActeurSalle | undefined, vote?: MsgSalle['vote'] | null): AgregatsFoule {
  const question = vote?.q ?? null;
  if (!r) return { connectes: 0, horsLigne: 0, prets: 0, votes: vote ? vote.recus : null, question, majoritaire: null, barre: [] };
  const enLigne = r.enLigne ?? r.presents;
  const horsLigne = Math.max(0, r.presents - enLigne);
  const parts = Object.entries(r.parEcran ?? {})
    .filter(([, n]) => n > 0)
    .sort(([a, x], [b, y]) => y - x || (a === '' ? 1 : b === '' ? -1 : a < b ? -1 : a > b ? 1 : 0))
    .map(([ecran, n]) => ({ ecran, libelle: libelleEcran(ecran, question), n }));
  const premier = parts[0];
  const barre = horsLigne ? [...parts, { ecran: 'hors-ligne', libelle: 'hors ligne', n: horsLigne }] : parts;
  return {
    connectes: r.presents, horsLigne, prets: r.prets ?? 0, votes: vote ? vote.recus : null, question,
    majoritaire: premier ? { ...premier } : null, barre,
  };
}

/** « 118 vote Q3 · 4 noir · 2 hors ligne » */
export const libelleBarre = (barre: readonly PartBarre[]): string => barre.map(p => `${p.n} ${p.libelle}`).join(' · ');

// ── Diagnostic d'un acteur (pastille, écart, latence, alertes) ─────────────────────────────────────────────────────

export type Pastille = 'verte' | 'ambre' | 'rouge' | 'eteinte';

export interface Diagnostic {
  pastille: Pastille;
  /** reliee : nouvelles récentes · attente : connecté mais pas encore de battement, ou personne · perdue · inconnue */
  liaison: 'reliee' | 'attente' | 'perdue' | 'inconnue';
  /** écran effectivement affiché (majoritaire pour la foule) */
  affiche: string | null;
  /** écran demandé (vue diffusée par le serveur) */
  demande: string | null;
  /** depuis combien de temps l'affiché ne suit pas le demandé (0 : il suit) */
  ecartMs: number;
  latenceMs?: number;
  /** alertes courtes : « son bloqué », « média absent : clip.mp4 », « demandé : vote Q3 · affiché : noir »… */
  alertes: string[];
}

export interface EntreeDiagnostic {
  acteur: Pick<Acteur, 'id' | 'cardinalite'> & { type?: Acteur['type'] };
  etat?: EtatActeur;
  resume?: ResumeActeur;
  vote?: MsgSalle['vote'] | null;
  /** le serveur a-t-il déjà envoyé un résumé (sinon : rien n'est connu de cet acteur côté serveur) */
  salleConnue: boolean;
  maintenant: number;
}

const pire = (a: Pastille, b: Pastille): Pastille => {
  const rang: Record<Pastille, number> = { eteinte: 0, verte: 1, ambre: 2, rouge: 3 };
  return rang[a] >= rang[b] ? a : b;
};

export function diagnosticActeur(x: EntreeDiagnostic): Diagnostic {
  const { acteur, etat, resume, maintenant } = x;
  const question = x.vote?.q ?? null;
  const alertes: string[] = [];
  const demande = resume?.demande?.ecran ?? null;
  const ecartDepuis = (suit: boolean): number =>
    suit || !resume?.demande || resume.demande.ecran === null ? 0 : Math.max(0, maintenant - (resume.demandeVueLe ?? maintenant));

  if (acteur.cardinalite === 'n') {
    // la foule : le résumé de salle seulement
    if (!resume) return { pastille: x.salleConnue ? 'ambre' : 'eteinte', liaison: x.salleConnue ? 'attente' : 'inconnue', affiche: null, demande: null, ecartMs: 0, alertes };
    const ag = agregatsFoule(resume, x.vote);
    const affiche = ag.majoritaire?.ecran ?? null;
    const ecartMs = ag.connectes ? ecartDepuis(affiche === demande) : 0;
    let pastille: Pastille = ag.connectes ? 'verte' : 'ambre';
    if (resume.rttMs !== undefined && resume.rttMs >= LATENCE_VERTE_MS) pastille = pire(pastille, 'ambre');
    if (ecartMs > ECART_AMBRE_MS) {
      pastille = pire(pastille, ecartMs > ECART_ROUGE_MS ? 'rouge' : 'ambre');
      alertes.push(`demandé : ${libelleEcran(demande, question)} · affiché : ${libelleEcran(affiche, question)}`);
    }
    return {
      pastille, liaison: ag.connectes ? 'reliee' : 'attente', affiche, demande, ecartMs, alertes,
      ...(resume.rttMs !== undefined ? { latenceMs: resume.rttMs } : {}),
    };
  }

  // un acteur nommé : son battement (relayé, ou local), et sa présence dans le résumé de salle
  const absentServeur = !!resume && resume.presents === 0 && etat?.source !== 'local';
  const age = etat ? maintenant - etat.recu : Infinity;
  if (absentServeur || (etat && age > PERTE_ACTEUR_MS)) {
    return {
      pastille: 'rouge', liaison: 'perdue', affiche: etat?.ecran?.ecran ?? null, demande, ecartMs: 0,
      alertes: [absentServeur ? 'hors ligne' : `muet depuis ${Math.round(age / 1000)} s`],
    };
  }
  if (!etat) {
    const connu = !!resume && resume.presents > 0;
    return { pastille: connu ? 'ambre' : x.salleConnue ? 'rouge' : 'eteinte', liaison: connu ? 'attente' : x.salleConnue ? 'perdue' : 'inconnue', affiche: null, demande, ecartMs: 0, alertes: connu ? ['en attente du battement'] : x.salleConnue ? ['jamais connecté'] : [] };
  }
  const affiche = etat.ecran?.ecran ?? null;
  const suit = !resume?.demande || (etat.ecran !== null && etat.ecran.vseq >= resume.demande.vseq);
  const ecartMs = ecartDepuis(suit);
  let pastille: Pastille = 'verte';
  if (etat.rttMs !== undefined && etat.rttMs >= LATENCE_VERTE_MS) pastille = 'ambre';
  if (!etat.visible) { pastille = pire(pastille, 'ambre'); alertes.push('écran masqué'); }
  if (etat.enLigne === false) { pastille = pire(pastille, 'ambre'); alertes.push('hors ligne'); }
  if (ecartMs > ECART_AMBRE_MS) {
    pastille = pire(pastille, ecartMs > ECART_ROUGE_MS ? 'rouge' : 'ambre');
    alertes.push(`demandé : ${libelleEcran(demande, question)} · affiché : ${libelleEcran(affiche, question)}`);
  }
  for (const m of etat.media ?? []) {
    if (m.lecture === 'absent') { pastille = pire(pastille, 'ambre'); alertes.push('média absent : ' + m.asset); }
    else if (m.lecture === 'bloque') { pastille = pire(pastille, 'ambre'); alertes.push('média bloqué : ' + m.asset); }
  }
  for (const e of etat.erreurs ?? []) { pastille = pire(pastille, 'ambre'); alertes.push(e); }
  return {
    pastille, liaison: 'reliee', affiche, demande, ecartMs, alertes,
    ...(etat.rttMs !== undefined ? { latenceMs: etat.rttMs } : {}),
  };
}

/** Chute des connectés : le maximum des 10 dernières secondes comparé au dernier compte. null : pas de chute. */
export function chuteConnectes(historique: readonly { t: number; n: number }[], maintenant: number): { avant: number; apres: number; part: number } | null {
  const fenetre = historique.filter(x => maintenant - x.t <= CHUTE_FENETRE_MS);
  const dernier = fenetre[fenetre.length - 1];
  if (!dernier) return null;
  const avant = Math.max(...fenetre.map(x => x.n));
  if (avant <= 0) return null;
  const part = (avant - dernier.n) / avant;
  return part > CHUTE_PART ? { avant, apres: dernier.n, part } : null;
}
