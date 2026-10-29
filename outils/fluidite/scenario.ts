// SCÉNARIO de référence de l'audit de fluidité : ce qu'on fait au Conducteur, dans quel ordre, avec quelles durées.
// Rien ici ne lance de navigateur : ce sont des DONNÉES (les phases) et des expressions JavaScript que l'outil
// (mesurer.ts) fait évaluer dans la page par le protocole DevTools.
//
// Scénario (brief du lot « fluidité ») : projet Écho, mode SPECTACLE, sortie ouverte (fenêtre sortie.html), émulateur
// fermé ; lecture en cours 60 s sans GO, puis 5 GO espacés de 5 s ; puis les mêmes conditions avec l'onglet caché, avec
// la fenêtre de sortie cachée, et sans fenêtre de sortie. Les durées sont les valeurs par défaut (option --duree <facteur>).
// Deux constructions du Conducteur : PRODUCTION pour les chiffres (ce que la régie vit), DÉVELOPPEMENT pour savoir QUI coûte.

export const PROJET = 'echo';
/** Fenêtre de la régie (pixels CSS), comme un portable 1440×900. */
export const FENETRE_REGIE = { l: 1440, h: 900 };
/** Fenêtre de sortie telle que le produit l'ouvre quand il n'y a pas de second écran (window.open … width=1280,height=720). */
export const FENETRE_SORTIE = { l: 1280, h: 720 };
/** Nom de la fenêtre de sortie (sortie/protocole.ts NOM_FENETRE) : même nom que le produit. */
export const NOM_FENETRE_SORTIE = 'studio-real-sortie-scene';

export type EtatSortie = 'ouverte' | 'cachee' | 'fermee';
export type EtatOnglet = 'visible' | 'cache';
/** 'production' : le Conducteur construit comme pour le spectacle (code réduit) = les vrais chiffres ; 'developpement' : React non
 *  réduit, noms de composants lisibles et durées de rendu = l'attribution des causes (mais plus lent que la réalité). */
export type Construction = 'production' | 'developpement';

export interface PhaseDef {
  nom: string;
  titre: string;
  construction: Construction;
  /** durée de mesure en secondes (hors attente de stabilisation) */
  dureeS: number;
  sortie: EtatSortie;
  onglet: EtatOnglet;
  /** 'pause' : SPECTACLE chargé mais lecture non lancée ; 'en-cours' : lecture lancée (sans GO sauf `go`) */
  lecture: 'pause' | 'en-cours';
  /** GO donnés pendant la phase : `n` appuis sur le gros bouton GO, le premier à `premierS`, puis tous les `espaceS` */
  go?: { n: number; premierS: number; espaceS: number };
  /** ralentissement du processeur simulé par le navigateur (4 = quatre fois plus lent : un portable modeste) */
  ralentissement?: number;
  /** feuille de style injectée dans la régie pendant la phase : EXPÉRIENCE (« et si cette zone n'existait pas ? »), le produit n'est pas modifié */
  css?: string;
  /** faux : la phase ne fait pas partie du déroulé par défaut (à demander par --phase ou --hypotheses) */
  defaut?: boolean;
  /** nombre de modifications du projet faites à la main pendant la phase (en RÉPÉTITION) : coût de structuredClone + localStorage */
  edition?: number;
  /** compte les rendus de chaque composant (la sonde parcourt l'arbre React à chaque validation : plus lourd) */
  comptage?: boolean;
  /** enregistre un profil du processeur JavaScript (échantillonnage toutes les 0,5 ms) */
  profil?: boolean;
  /** pas de trace du navigateur (arrêter une trace coûte ≈ 6 s : on ne la garde que là où elle apporte quelque chose) */
  sansTrace?: boolean;
}

export const PHASES: PhaseDef[] = [
  // ── construction de PRODUCTION : les chiffres à retenir (comme au spectacle) ──
  // L'ordre compte : le spectacle Écho ATTEND un GO au moment 1 ; tant qu'aucun GO n'est donné, l'état est le même
  // (c'est la situation la plus fréquente d'un soir), donc les variantes se comparent entre elles. Les GO viennent en dernier.
  { nom: 'repos', titre: 'Repos : SPECTACLE chargé, lecture en pause, sortie ouverte', construction: 'production', dureeS: 8, sortie: 'ouverte', onglet: 'visible', lecture: 'pause', sansTrace: true },
  { nom: 'lecture', titre: 'Lecture en cours, sans GO (référence)', construction: 'production', dureeS: 60, sortie: 'ouverte', onglet: 'visible', lecture: 'en-cours' },
  { nom: 'onglet-cache', titre: 'Onglet de la régie caché, sortie visible', construction: 'production', dureeS: 12, sortie: 'ouverte', onglet: 'cache', lecture: 'en-cours', sansTrace: true },
  { nom: 'sortie-cachee', titre: 'Fenêtre de sortie cachée (réduite), régie visible', construction: 'production', dureeS: 12, sortie: 'cachee', onglet: 'visible', lecture: 'en-cours', sansTrace: true },
  { nom: 'sans-sortie', titre: 'Aucune fenêtre de sortie, régie visible', construction: 'production', dureeS: 12, sortie: 'fermee', onglet: 'visible', lecture: 'en-cours', sansTrace: true },
  { nom: 'go', titre: '5 GO espacés de 5 s', construction: 'production', dureeS: 25, sortie: 'ouverte', onglet: 'visible', lecture: 'en-cours', go: { n: 5, premierS: 2, espaceS: 5 } },
  { nom: 'go-lent', titre: 'Processeur 4 fois plus lent (portable modeste) : 3 GO, sortie ouverte', construction: 'production', dureeS: 14, sortie: 'ouverte', onglet: 'visible', lecture: 'en-cours', go: { n: 3, premierS: 2, espaceS: 4 }, ralentissement: 4 },
  // ── construction de DÉVELOPPEMENT : attribution (quel composant, quelle fonction) ──
  { nom: 'lecture-dev', titre: 'Lecture en cours, construction de développement (écart avec la production)', construction: 'developpement', dureeS: 10, sortie: 'ouverte', onglet: 'visible', lecture: 'en-cours', sansTrace: true },
  { nom: 'profil', titre: 'Profil du processeur JavaScript, lecture en cours', construction: 'developpement', dureeS: 15, sortie: 'ouverte', onglet: 'visible', lecture: 'en-cours', profil: true, sansTrace: true },
  { nom: 'rendus', titre: 'Lecture + 2 GO, avec comptage des rendus par composant', construction: 'developpement', dureeS: 16, sortie: 'ouverte', onglet: 'visible', lecture: 'en-cours', go: { n: 2, premierS: 4, espaceS: 6 }, comptage: true, sansTrace: true },
  // ── EXPÉRIENCES (--hypotheses) : on cache ou on fige une zone par une feuille de style injectée, et on regarde ce que la
  //    régie y gagne. Sans fenêtre de sortie, pour ne mesurer que la régie. Rien n'est modifié dans le produit. ──
  { nom: 'hyp-reference', titre: 'Expérience : référence (aucune injection)', construction: 'production', dureeS: 10, sortie: 'fermee', onglet: 'visible', lecture: 'en-cours', defaut: false },
  { nom: 'hyp-sans-animations', titre: 'Expérience : toutes les animations et transitions CSS coupées', construction: 'production', dureeS: 10, sortie: 'fermee', onglet: 'visible', lecture: 'en-cours', defaut: false, css: "*,*::before,*::after{animation:none!important;transition:none!important}" },
  { nom: 'hyp-sans-planche', titre: 'Expérience : zone de la planche masquée (display:none ; React continue de la rendre)', construction: 'production', dureeS: 10, sortie: 'fermee', onglet: 'visible', lecture: 'en-cours', defaut: false, css: ".zone-planche{display:none!important}" },
  { nom: 'hyp-sans-conduite', titre: 'Expérience : zone de la conduite masquée', construction: 'production', dureeS: 10, sortie: 'fermee', onglet: 'visible', lecture: 'en-cours', defaut: false, css: ".zone-conduite{display:none!important}" },
  { nom: 'hyp-sans-panneau', titre: 'Expérience : panneau de droite masqué', construction: 'production', dureeS: 10, sortie: 'fermee', onglet: 'visible', lecture: 'en-cours', defaut: false, css: ".panneau{display:none!important}" },
  { nom: 'hyp-sans-svg-planche', titre: 'Expérience : liens SVG de la planche masqués', construction: 'production', dureeS: 10, sortie: 'fermee', onglet: 'visible', lecture: 'en-cours', defaut: false, css: ".planche-svg{display:none!important}" },
  { nom: 'hyp-planche-contenue', titre: 'Expérience : planche et conduite isolées (contain: layout paint)', construction: 'production', dureeS: 10, sortie: 'fermee', onglet: 'visible', lecture: 'en-cours', defaut: false, css: ".planche,.cd{contain:layout paint!important}" },
  { nom: 'hyp-sans-calque-tete', titre: 'Expérience : tête de lecture de la conduite entière masquée (calque cd-calque-tete)', construction: 'production', dureeS: 10, sortie: 'fermee', onglet: 'visible', lecture: 'en-cours', defaut: false, css: ".cd-calque-tete{display:none!important}" },
  { nom: 'hyp-sans-repere-zoom', titre: 'Expérience : repère de la barre de zoom masqué (écrit en left à chaque image)', construction: 'production', dureeS: 10, sortie: 'fermee', onglet: 'visible', lecture: 'en-cours', defaut: false, css: ".cd-zb-tete{display:none!important}" },
  { nom: 'hyp-sans-avance', titre: 'Expérience : remplissage des moments (variable --avance) et cadre du moment en cours masqués', construction: 'production', dureeS: 10, sortie: 'fermee', onglet: 'visible', lecture: 'en-cours', defaut: false, css: ".cd-moment::before{display:none!important}.cd-moment{box-shadow:none!important}" },
  { nom: 'hyp-sans-pulse-tete', titre: 'Expérience : animation de fond de la tête de lecture coupée (cd-pulse)', construction: 'production', dureeS: 10, sortie: 'fermee', onglet: 'visible', lecture: 'en-cours', defaut: false, css: ".sr-ph i,.sr-ph i::before,.sr-ph i::after{animation:none!important}" },
  { nom: 'hyp-edition', titre: 'Expérience : 20 modifications du projet en RÉPÉTITION (clone + écriture localStorage de tout le projet)', construction: 'production', dureeS: 10, sortie: 'fermee', onglet: 'visible', lecture: 'en-cours', defaut: false, sansTrace: true, edition: 20 },
];

// ── expressions évaluées dans la page de la régie ──────────────────────────────────────────────────────────────────
const M = 'window.__conduite.magasin.getState()';

/** Vrai quand le projet est chargé et la lecture posée (le Conducteur expose window.__conduite). */
export const EXPR_PRET = `!!window.__conduite && ${M}.projet.ev.length > 5 && !!${M}.lecture`;
export const EXPR_SPECTACLE = `(() => { ${M}.changerMode('spectacle'); return ${M}.mode })()`;
export const EXPR_LANCER = `(() => { ${M}.lancer(); return ${M}.enLecture })()`;
/** Une modification du projet (RÉPÉTITION) : renomme le premier moment, comme une frappe dans le panneau. */
export const EXPR_MODIFIER = (n: number) => `(() => { ${M}.modifierProjet((p) => { p.ev[0].name = 'Entrée du public · QR' + ' '.repeat(${n % 3}); }, 'essai fluidité ' + ${n}); return true })()`;
export const EXPR_REPETITION = `(() => { ${M}.changerMode('repetition'); return ${M}.mode })()`;
export const EXPR_PAUSE = `(() => { ${M}.pause(); return !${M}.enLecture })()`;
export const EXPR_GO = `(() => { ${M}.go(); return true })()`;
/** Position du gros bouton GO (centre, en pixels de la page), ou null. */
export const EXPR_BOUTON_GO = `(() => { const b = document.querySelector('.tap-geant'); if (!b) return null; const r = b.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null })()`;
/** État du spectacle, pour situer chaque phase dans le déroulé d'Écho. */
export const EXPR_ETAT = `(() => { const s = ${M}, l = s.lecture; const so = window.__conduite.sortie.getState();
  return { mode: s.mode, enLecture: s.enLecture, moment: l ? l.moment : null, momentNom: l ? (s.projet.ev.find((m) => m.id === l.moment) || {}).name : null,
    nbMoments: s.projet.ev.length, tLecture: l ? Math.round(l.t * 10) / 10 : null, attenteGo: l ? l.attenteGo : null, termine: l ? l.termine : null,
    journal: l ? l.journal.length : 0, commandes: l ? l.commandes.length : 0, parcours: l ? l.parcours.length : 0, alertes: l ? l.alertes.length : 0,
    sortie: { versionSortie: so.versionSortie, scene: so.scene ? so.scene.type : null, vuLe: so.vuLe } } })()`;
/** Ouvre la fenêtre de sortie comme le produit (window.open au nom fixe, même origine) ; doit être appelée avec un geste. */
export const EXPR_OUVRIR_SORTIE = `(() => { const w = window.open(new URL('sortie.html', location.href).toString(), ${JSON.stringify(NOM_FENETRE_SORTIE)}, 'popup,width=${FENETRE_SORTIE.l},height=${FENETRE_SORTIE.h}'); return !!w })()`;
/** Vrai quand la sortie a dit bonjour à la régie (relais local par BroadcastChannel). */
export const EXPR_SORTIE_RELIEE = `window.__conduite.sortie.getState().versionSortie !== null`;
