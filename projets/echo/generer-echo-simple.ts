// Générateur du projet ÉCHO, version SIMPLE du 27/10 (projets/echo/echo.conducteur.json) : le déroulé Whimsical de
// l'équipe, en 6 blocs. Chaque bloc est un acte, chaque étape est un moment qui attend le TOP de la régie (passage « go »),
// sans durée imposée ni garde automatique : la régie force les tops à la main. Pas de piste lumière.
// Les lignes du déroulé (écran, plateau, téléphones) sont dans les paramètres de chaque étape.
// Usage (depuis la racine du dépôt) : npx tsx projets/echo/generer-echo-simple.ts
// L'ancien projet détaillé (10 séquences, textes de l'auteur) reste générable par generer-echo-complet.ts.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { planifier, validerProjet, formatMMSS, type Projet, type Moment } from '../../packages/modele/src/index.ts';

const RACINE = fileURLToPath(new URL('.', import.meta.url));

interface EtapeDef {
  id: string; nom: string; minutes: number;
  ecran: string; plateau: string; telephones: string;
  outil?: string;             // ce qui fait le travail ce soir (page, appel, régie)
  sortie?: string | Record<string, unknown>;
}
interface Bloc { nom: string; etapes: EtapeDef[] }

const BLOCS: Bloc[] = [
  { nom: '1 · Le fil', etapes: [
    { id: 'b1_entree', nom: 'Entrée du public · QR', minutes: 5, ecran: 'QR code du public', plateau: 'chaise / table', telephones: 'scan du QR, pseudo',
      outil: 'QR → page téléphone (serveur figurants)', sortie: 'accueil-qr' },
    { id: 'b1_flux', nom: 'Flux Instagram', minutes: 3, ecran: 'rien', plateau: 'chaise / table', telephones: 'FLUX Instagram (vidéo)', sortie: 'noir' },
    { id: 'b1_choix', nom: 'Abonnez-vous / désabonnez-vous', minutes: 1, ecran: 'rien', plateau: 'chaise / table',
      telephones: 'fin du flux, question : ABONNEZ-VOUS À SON COMPTE / DÉSABONNEZ-VOUS DE SON COMPTE' },
    { id: 'b1_pourquoi', nom: 'Pourquoi ce choix', minutes: 2, ecran: 'rien', plateau: 'chaise / table',
      telephones: 'une fois le choix fait au clic, une case avec champ texte s’affiche : écrire pourquoi ce choix' },
  ] },
  { nom: '2 · Les commentaires', etapes: [
    { id: 'b2_lecture', nom: 'Jim lit les commentaires', minutes: 4, ecran: 'textes des spectateurs affichés sur le grand écran',
      plateau: 'l’acteur entre sur le plateau et lit', telephones: 'rien', outil: 'mur de commentaires (page chat du serveur figurants)' },
  ] },
  { nom: '3 · La ministre', etapes: [
    { id: 'b3_voix_junon', nom: 'Voix off de la ministre Junon', minutes: 3, ecran: 'VOIX OFF DE LA MINISTRE JUNON',
      plateau: 's’assoit et clique sur son ordi', telephones: 'rien' },
  ] },
  { nom: '4 · Les questions à Écho', etapes: [
    { id: 'b4_question', nom: '(1) Franck pose sa question à Écho', minutes: 1, ecran: 'téléphone de la ministre : la question',
      plateau: '(1) Franck pose des questions à ÉCHO', telephones: 'rien', outil: 'page ministre · régie VOTE : choisir la question 1 à 5' },
    { id: 'b4_reponses', nom: '(2) Le public répond', minutes: 1, ecran: 'téléphone de la ministre : les votes montent (sans les réponses)',
      plateau: 'Franck attend', telephones: '(2) écrivent leur réponse · ce soir : 4 réponses proposées, un vote', outil: 'régie VOTE : OUVRIR' },
    { id: 'b4_synthese', nom: '(3) Synthèse d’Écho', minutes: 1, ecran: '(3) synthèse d’Écho : la phrase de résultat',
      plateau: 'Franck lit', telephones: 'résultat à l’écran', outil: 'régie VOTE : RÉVÉLER' },
    { id: 'b4_dialogue', nom: 'Franck discute avec Écho', minutes: 3, ecran: 'résultat affiché', plateau: 'Franck appelle Écho : « question numéro X », il se défend',
      telephones: 'rien', outil: 'appel ElevenLabs « ECO » sur l’ordinateur à part · puis régie VOTE : FERMER, question suivante (×5)' },
  ] },
  { nom: '5 · Le Google Meet', etapes: [
    { id: 'b5_meet', nom: 'Google Meet Junon / Nora', minutes: 4, ecran: 'Google Meet de Junon', plateau: 'Google Meet de Nora', telephones: 'rien' },
    { id: 'b5_voix_echo', nom: 'Voix d’Écho · question de Franck', minutes: 3, ecran: 'voix d’Écho', plateau: 'question de Franck', telephones: 'rien',
      outil: 'appel ElevenLabs « ECO »' },
  ] },
  { nom: '6 · Ellipse et président', etapes: [
    { id: 'b6_ellipse', nom: 'Ellipse', minutes: 1, ecran: 'ellipse', plateau: 'ellipse', telephones: 'ellipse', sortie: 'noir' },
    { id: 'b6_president', nom: 'Le président Boilot · pitch', minutes: 3, ecran: 'président Boilot pitch', plateau: '', telephones: '' },
  ] },
];

/** k[0] tel que la durée prévue (k0 × 6 + 10 s) approche les minutes données : la durée n'est qu'un repère, le top fait foi. */
const k0 = (min: number) => Math.max(0, Math.round((min * 60 - 10) / 6));

const ev: Moment[] = [];
BLOCS.forEach((b, act) => {
  for (const e of b.etapes) {
    const params: Record<string, unknown> = { ecran: e.ecran, plateau: e.plateau, telephones: e.telephones, ...(e.outil ? { outil: e.outil } : {}) };
    if (e.sortie) params.sortie = e.sortie;
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
writeFileSync(RACINE + 'echo.conducteur.json', JSON.stringify(fichier, null, 2) + '\n', 'utf8');

const pb = validerProjet(projet);
console.log('problèmes :', pb.length, pb.map(p => p.niveau + ' ' + p.message));
const plan = planifier(projet);
for (const mp of plan.moments) console.log(mp.id.padEnd(14), formatMMSS(mp.fin - mp.debut), mp.passage?.mode ?? '');
console.log('blocs', BLOCS.length, '· étapes', ev.length, '· total prévu', formatMMSS(plan.total));
