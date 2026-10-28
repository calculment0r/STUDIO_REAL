// Générateur du projet ÉCHO, version SIMPLE du 27/10 (projets/echo/echo.conducteur.json) : le déroulé Whimsical de
// l'équipe, en 7 blocs (actes) et 19 étapes. Chaque bloc est un acte, chaque étape est un moment qui attend le TOP de la
// régie (passage « go »), sans durée imposée ni garde automatique : la régie force les tops à la main. Pas de piste lumière.
// Les lignes du déroulé (écran, plateau, téléphones) sont dans les paramètres de chaque étape.
// Usage (depuis la racine du dépôt) : npx tsx projets/echo/generer-echo-simple.ts
//   --verifier : régénère en mémoire et compare au fichier sur disque (« identique » → code 0, « différent » → code 1) ;
//   n'écrit jamais.
// Valide AVANT d'écrire : une erreur de validation bloque l'écriture (code 1, fichier inchangé) ; les avertissements
// s'affichent mais n'empêchent pas l'écriture. L'ancien projet détaillé (10 séquences, textes de l'auteur) reste générable
// par generer-echo-complet.ts, qui écrit echo-complet.conducteur.json (jamais echo.conducteur.json).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { planifier, validerProjet, formatMMSS, type Projet, type Moment } from '../../packages/modele/src/index.ts';

const RACINE = fileURLToPath(new URL('.', import.meta.url));
const NOM_FICHIER = 'echo.conducteur.json';
const VERIFIER = process.argv.includes('--verifier');

interface EtapeDef {
  id: string; nom: string; minutes: number;
  ecran: string; plateau: string; telephones: string;
  outil?: string;             // ce qui fait le travail ce soir (page, appel, régie)
  cmds?: Record<string, unknown>[];   // envoyées au serveur du spectacle à l'entrée de l'étape (pont-figurants du Conducteur)
  sortie?: string | Record<string, unknown>;
}
interface Bloc { nom: string; etapes: EtapeDef[] }

const BLOCS: Bloc[] = [
  // Le cheminement du soir (27/10) : chaque étape = un tap de la « conduite écho » de la régie figurants (champ outil).
  { nom: '1 · Le fil', etapes: [
    { id: 'b1_entree', cmds: [{ t: 'tel.cmd', mode: 'video' }, { t: 'ecran', mode: 'qr' }, { t: 'vote.cmd', cmd: 'fermer' }], nom: 'Entrée du public · QR', minutes: 5, ecran: 'QR code du public', plateau: 'chaise / table',
      telephones: 'scan du QR, pseudo, puis « Regardez la vidéo »', outil: 'régie : tap 1 · Téléphones « Regardez la vidéo »', sortie: 'accueil-qr' },
    { id: 'b1_flux', cmds: [{ t: 'tel.cmd', mode: 'flux' }, { t: 'ecran', mode: 'mur' }], nom: 'Flux Instagram', minutes: 1, ecran: 'mur (vide)', plateau: 'chaise / table', telephones: 'FLUX Instagram (vidéo)',
      outil: 'régie : tap 2 · FLUX INSTA' },
    { id: 'b1_choix', nom: 'Abonne / désabonne + pourquoi', minutes: 2, ecran: 'mur : les réponses avec le pseudo, au fil de l’eau', plateau: 'chaise / table',
      telephones: 'à la fin de la vidéo : ABONNEZ-VOUS / DÉSABONNEZ-VOUS, puis « pourquoi ? » et valider', outil: 'automatique en fin de vidéo (tap 3 pour forcer)' },
  ] },
  { nom: '2 · Les commentaires', etapes: [
    { id: 'b2_lecture', nom: 'Franck lit les commentaires · pause', minutes: 4, ecran: 'mur : les commentaires restent affichés',
      plateau: 'Franck entre sur scène et lit', telephones: 'merci, regardez l’écran', outil: 'aucun tap : on est en pause' },
  ] },
  { nom: '3 · La ministre', etapes: [
    { id: 'b3_junon', cmds: [{ t: 'junon', cmd: 'lancer' }, { t: 'ecran', mode: 'mur' }], nom: 'Discours de la ministre Junon (audio)', minutes: 2, ecran: 'mur : commentaires pré-écrits calés sur le discours',
      plateau: 'Franck écoute', telephones: '« Regardez la scène »', outil: 'régie : tap 4 · JUNON' },
  ] },
  { nom: '4 · Modérateurs et Écho', etapes: [
    { id: 'b4_notif', cmds: [{ t: 'tel.cmd', mode: 'notif' }, { t: 'ecran', mode: 'noir' }], nom: 'Notification « modérateur »', minutes: 1, ecran: 'noir', plateau: 'Franck lance l’appel à ÉCO sur son ordinateur',
      telephones: 'notification : vous êtes désormais modérateur', outil: 'régie : tap 5 · notification + écran noir · page eco de Franck' },
  ] },
  { nom: '5 · Les questions à Écho', etapes: [1, 2, 3, 4, 15].flatMap((n): EtapeDef[] => [
    { id: `b5_q${n}`, cmds: [{ t: 'ecran', mode: 'mur' }, { t: 'vote.cmd', cmd: 'ouvrir', numero: n }], nom: `Q${n} · réponses`, minutes: 1, ecran: 'mur : la question et les 4 réponses en grand, « @x a voté »',
      plateau: `Franck pose la question ${n} à ÉCO`, telephones: 'les 4 réponses, un vote', outil: `régie : tap Q${n} · réponses` },
    { id: `b5_q${n}_res`, cmds: [{ t: 'vote.cmd', cmd: 'reveler' }], nom: `Q${n} · résultat`, minutes: 2, ecran: 'mur : les pourcentages forcés, la réponse gagnante en avant',
      plateau: 'ÉCO argumente le résultat, Franck se défend', telephones: 'résultat à l’écran', outil: `régie : tap Q${n} · RÉSULTAT` },
  ]) },
  { nom: '6 · La visio de la ministre', etapes: [
    { id: 'b6_visio', cmds: [{ t: 'vote.cmd', cmd: 'fermer' }, { t: 'ecran', mode: 'noir' }, { t: 'tel.cmd', mode: 'scene' }], nom: 'Visio Franck ↔ ministre', minutes: 4, ecran: 'les deux vidéos (page visio/scene), son de la ministre seul',
      plateau: 'Franck sur son téléphone (page visio/franck)', telephones: '« Regardez la scène »', outil: 'régie : tap « Fin des questions » · puis fenêtre visio/scene en plein écran' },
    { id: 'b6_pause', nom: 'La ministre raccroche · pause', minutes: 1, ecran: 'noir', plateau: '', telephones: '« Regardez la scène »', outil: 'aucun tap : pause' },
  ] },
  { nom: '7 · Le président Boilot', etapes: [
    { id: 'b7_president', cmds: [{ t: 'junon', cmd: 'president' }, { t: 'tel.cmd', mode: 'scene' }], nom: 'Discours du président Jean Boilot', minutes: 2, ecran: 'mur (audio du discours)', plateau: '', telephones: '« Regardez la scène »',
      outil: 'régie : tap PRÉSIDENT BOILOT' },
  ] },
];

/** k[0] tel que la durée prévue (k0 × 6 + 10 s) approche les minutes données : la durée n'est qu'un repère, le top fait foi. */
const k0 = (min: number) => Math.max(0, Math.round((min * 60 - 10) / 6));

// Ce que montre la sortie Écran scène du Conducteur à chaque étape : le QR et le noir en natif ; le mur du serveur du
// spectacle (réponses, vote, « @x a voté ») et la visio en page plein écran.
const SERVEUR = 'https://highway-regions-temperatures-penn.trycloudflare.com';
const MUR = { type: 'page', url: SERVEUR + '/prototypes/figurants/pages/chat/' };
const VISIO = { type: 'page', url: SERVEUR + '/prototypes/figurants/pages/visio/scene.html' };
const SORTIES: Record<string, string | Record<string, unknown>> = {
  b1_entree: 'accueil-qr', b1_flux: { type: 'page', url: SERVEUR + '/prototypes/figurants/pages/flux/' }, b1_choix: MUR, b2_lecture: MUR, b3_junon: MUR, b4_notif: 'noir',
  b6_visio: VISIO, b6_pause: 'noir', b7_president: MUR,
};

const ev: Moment[] = [];
BLOCS.forEach((b, act) => {
  for (const e of b.etapes) {
    const params: Record<string, unknown> = { ecran: e.ecran, plateau: e.plateau, telephones: e.telephones, ...(e.outil ? { outil: e.outil } : {}), ...(e.cmds ? { cmds: e.cmds } : {}) };
    const sortie = SORTIES[e.id] ?? (e.id.startsWith('b5_') ? MUR : e.sortie);
    if (sortie) params.sortie = sortie;
    ev.push({
      id: e.id, act, name: e.nom, entry: e.id + '_s',
      st: [{ id: e.id + '_s', name: e.nom, ty: 'k:scene', c: 0, r: 0, dx: 0, dy: 0, k: [0, 50, 50], params: { ...params, duree_reperes_min: e.minutes } }],   // 10 s puis ATTENTE DU TOP
      tr: [{ a: e.id + '_s', b: '', g: [], mode: 'all' }],
      gate: { mode: 'go', g: [] },
    });
  }
});

const projet: Projet = {
  titre: 'ÉCHO',
  acts: BLOCS.map(b => ({ n: b.nom })),
  ev,
  sens: { aff: 70, part: 60, calme: 55, pen: 60 },
  hold: {}, go: {}, ver: 1, nid: 100,
  tracks: [],
};

const fichier = { format: 'studio-real/conducteur@1', project: projet, assets: [], runs: [] };
const serialise = JSON.stringify(fichier, null, 2) + '\n';

// --verifier : compare la régénération en mémoire au fichier sur disque (même sérialisation) ; n'écrit jamais.
if (VERIFIER) {
  const surDisque = existsSync(RACINE + NOM_FICHIER) ? readFileSync(RACINE + NOM_FICHIER, 'utf8') : null;
  if (surDisque === serialise) { console.log(NOM_FICHIER + ' : identique'); process.exit(0); }
  console.log(NOM_FICHIER + ' : différent' + (surDisque === null ? ' (fichier absent)' : ' (relancer sans --verifier pour réécrire)'));
  process.exit(1);
}

// Valide AVANT d'écrire : une erreur bloque (code 1, fichier inchangé) ; les avertissements s'affichent mais n'empêchent pas.
const pb = validerProjet(projet);
const erreurs = pb.filter(p => p.niveau === 'erreur');
if (erreurs.length) {
  console.error('problèmes :', pb.length, pb.map(p => p.niveau + ' ' + p.message));
  console.error(erreurs.length + ' erreur(s) : ' + NOM_FICHIER + ' n’a PAS été écrit.');
  process.exit(1);
}

writeFileSync(RACINE + NOM_FICHIER, serialise, 'utf8');
console.log('problèmes :', pb.length, pb.map(p => p.niveau + ' ' + p.message));
const plan = planifier(projet);
for (const mp of plan.moments) console.log(mp.id.padEnd(14), formatMMSS(mp.fin - mp.debut), mp.passage?.mode ?? '');
console.log('blocs', BLOCS.length, '· étapes', ev.length, '· total prévu', formatMMSS(plan.total));
