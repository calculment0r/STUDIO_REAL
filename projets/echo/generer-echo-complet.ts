// Générateur du projet ÉCHO, version DÉTAILLÉE (projets/echo/echo-complet.conducteur.json) : la version embarquée dans le
// Conducteur depuis le 27/10 est la SIMPLE (generer-echo-simple.ts, echo.conducteur.json) ; ce générateur ne l'écrase plus.
// Les textes de l'auteur sont EXTRAITS de DEROULE-AUTEUR.md (jamais retapés) : mot pour mot garanti.
// Usage (depuis la racine du dépôt) : npx tsx projets/echo/generer-echo-complet.ts
//   --verifier : régénère en mémoire et compare au fichier sur disque (« identique » → code 0, « différent » → code 1) ;
//   n'écrit jamais.
// Valide AVANT d'écrire : une erreur de validation bloque l'écriture (code 1, fichier inchangé) ; les avertissements
// s'affichent mais n'empêchent pas l'écriture. À relancer si l'auteur modifie DEROULE-AUTEUR.md (les modifications faites à
// la main dans le Conducteur seraient écrasées : exporter d'abord).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { planifier, validerProjet, formatMMSS, type Projet, type Etape, type Sortie, type Moment, type Condition, type Piste } from '../../packages/modele/src/index.ts';

const RACINE = fileURLToPath(new URL('.', import.meta.url));
const NOM_FICHIER = 'echo-complet.conducteur.json';
const VERIFIER = process.argv.includes('--verifier');
const MD = readFileSync(RACINE + 'DEROULE-AUTEUR.md', 'utf8').replace(/\r\n/g, '\n');
const L = MD.split('\n');

// ── extraction des textes de l'auteur ───────────────────────────────────────────────────────────────────────────
function ligne(re: RegExp): string { const l = L.find(x => re.test(x)); if (!l) throw new Error('introuvable ' + re); return l; }
function index(re: RegExp, depuis = 0): number { const i = L.findIndex((x, j) => j >= depuis && re.test(x)); if (i < 0) throw new Error('introuvable ' + re); return i; }
const paragraphes = (a: number, b: number) => L.slice(a, b + 1).filter(x => x.trim() !== '');

// Séquence 1
const s1Texte = ligne(/^Sur son téléphone, chaque spectateur fait défiler/);
const s1Intention = ligne(/^•\tIntention : Jim doit/).replace(/^•\t/, '');
// Séquence 2
const s2Texte = ligne(/^Une question apparaît sur les téléphones/);
const s2Question = s2Texte.match(/« Veux-tu t’abonner \? » ou « Masquer le profil \? »/)![0];
const [s2OptA, s2OptB] = [...s2Question.matchAll(/« (.*?) »/g)].map(m => m[1]);
if (!s2Texte.includes(s2OptA) || !s2Texte.includes(s2OptB)) throw new Error('options séquence 2');
// Séquence 3
const s3Texte = ligne(/^Jim entre sur scène\. Les réponses des spectateurs/);
const s3Viral = s3Texte.match(/Du jour au lendemain, il est redevenu viral\./)![0];
const s3Annonce = ligne(/^Puis le discours de Junon est retransmis/);
const iJ0 = index(/^« Mes chers concitoyens/);
const iJ1 = index(/accès Gold exclusif d’un mois pour tous nos concitoyens\. »$/);
const discoursJunon = paragraphes(iJ0, iJ1).join('\n\n');
// Séquence 4
const s4Texte = ligne(/^À l’issue du discours, les spectateurs reçoivent une notification/);
const notifTitre = ligne(/^MINISTÈRE DE LA SANTÉ MENTALE — ALERTE MODÉRATEUR$/);
const notifTexte = ligne(/^« Au vu de la pertinence et de la qualité de vos commentaires/);
// Séquence 5
const s5Jim1 = ligne(/^Jim : « Un accès Gold \?/).replace(/^Jim : /, '');
const s5Ligne2 = ligne(/^Il demande à Écho d’aller sur son profil Instagram/);
const s5Jim2 = s5Ligne2.match(/« Analyse-les et propose-moi une piste d’amélioration\. »/)![0];
const s5Q = ligne(/^Première question d’Écho envoyée sur les téléphones/);
// Séquence 6
const s6Texte = ligne(/^Jim se prend de fascination pour Écho/);
const s6Contrainte = ligne(/^Contrainte de mise en scène : /);
const s6Regle = ligne(/^Règle d’orientation : /);
const s6Fin = ligne(/^Au fil des réponses, Jim semble changer/);
const questions = L.filter(x => /^\d+\.\t« /.test(x)).map(x => { const m = x.match(/^(\d+)\.\t(.*)$/)!; return { n: +m[1], q: m[2] }; });
const syntheses = L.filter(x => /^\d+\t\d+ %\t/.test(x)).map(x => { const p = x.split('\t'); if (p.length !== 4) throw new Error('synthèse ' + x); return { n: +p[0], pct: p[1], s: p[2], effet: p[3] }; });
if (questions.length !== 15 || syntheses.length !== 15) throw new Error(`questions ${questions.length} synthèses ${syntheses.length}`);
questions.forEach((q, i) => { if (q.n !== i + 1 || syntheses[i].n !== i + 1) throw new Error('ordre'); });
// Séquence 7
const iZ0 = index(/^Visio avec Junon Maréchal/);
const zoomIntro = L[iZ0];
const dialogue = L.slice(iZ0).filter(x => /^(Junon|Jim) — /.test(x)).map(x => { const m = x.match(/^(Junon|Jim) — (.*)$/)!; return { qui: m[1] as 'Junon' | 'Jim', t: m[2] }; });
if (dialogue.length !== 16) throw new Error('dialogue ' + dialogue.length);
// Séquence 8
const s8Texte = ligne(/^Jim se prépare\. Dernier message à Écho/);
const s8Message = ligne(/^« Je suis un peu intimidé de me rendre à une sauterie/);
const iR = index(/^Réponses d’Écho \(synthèse\) :$/);
const iSort = index(/^Il sort, heureux\. Noir\. Un temps\.$/);
const s8Reponses = L.slice(iR + 1, iSort).filter(x => x.startsWith('•\t')).map(x => x.slice(2));
if (s8Reponses.length !== 4) throw new Error('réponses 8');
const s8Sort = L[iSort];
// Séquence 9
const s9Texte = ligne(/^Allocution radio du président Jean Boilot/);
const iP0 = index(/^« Mes chers compatriotes/);
const iDid = index(/^\(Les écrans des smartphones des spectateurs les plus virulents s’allument en rouge\.\)$/);
const iP2 = index(/^À celles et ceux dont l’écran vient de rougir/);
const iP3 = index(/^Je m’engage ce soir à la mise en place d’une cellule de crise/);
const iPf = index(/Vive la République et vive la France\. »$/);
const pres1 = paragraphes(iP0, iDid - 1);
const didRouge = L[iDid];
const pres2 = paragraphes(iP2, iP3 - 1);
const pres3 = paragraphes(iP3, iPf);
const s9Extinction = ligne(/^Les écrans s’éteignent\. Dans le noir de son téléphone/);
// Séquence 10
const s10Texte = ligne(/^Sur l’écran géant, le code d’Écho défile/);
const s10Morale = ligne(/^Tout n’était que manipulation/);

// ── outils ──────────────────────────────────────────────────────────────────────────────────────────────────────
const mots = (t: string) => t.replace(/[«»—–…•]/g, ' ').split(/\s+/).filter(Boolean).length;
/** temps de parole sur scène (s) : ≈ 2,4 mots/s + 2 s de respiration */
const parole = (t: string, debit = 2.4) => Math.ceil(mots(t) / debit) + 2;
/** temps de lecture d'un texte projeté (s) : ≈ 15 signes/s + 4 s */
const lecture = (t: string) => Math.ceil(t.length / 15) + 4;
const K0 = (s: number) => Math.max(0, Math.round((s - 10) / 6));
const posDelai = (s: number) => Math.round((s - 5) / 595 * 100);

type Scene = string | Record<string, unknown>;
const NOIR = 'noir';
const vid = (asset: string, o: { boucle?: boolean; son?: boolean; cadrage?: string; legende?: string } = {}) => ({ type: 'video', asset, ...o });
const titre = (t: string, surtitre?: string, sousTitre?: string) => ({ type: 'titre', titre: t, ...(surtitre ? { surtitre } : {}), ...(sousTitre ? { sousTitre } : {}) });

interface PistesEtape { tel?: string; son?: string; lx?: string; txt?: string }
interface Def { st: Etape; pistes: PistesEtape }
interface MomentDef { m: Moment; defs: Def[] }

const ACTES = [{ n: 'Le fil' }, { n: 'Écho' }, { n: 'Le reflet' }];
const moments: MomentDef[] = [];
let courant!: MomentDef;
let col = 0;

function moment(id: string, act: number, name: string, gate: 'auto' | 'go', g: Condition[] = []) {
  courant = { m: { id, act, name, entry: '', st: [], tr: [], gate: { mode: gate, g } }, defs: [] };
  moments.push(courant);
  col = 0;
}
function etape(id: string, name: string, ty: string, duree: number, k1: number, k2: number, sortie: Scene | null, params: Record<string, unknown> = {}, o: { asset?: string; pistes?: PistesEtape; r?: number; c?: number } = {}): string {
  const p: Record<string, unknown> = { ...params };
  if (sortie !== null) p.sortie = sortie;
  const st: Etape = { id, name, ty, c: o.c ?? col, r: o.r ?? 0, dx: 0, dy: 0, k: [K0(duree), k1, k2], ...(o.asset ? { asset: o.asset } : {}), params: p };
  if (o.c === undefined) col++;
  courant.m.st.push(st);
  courant.defs.push({ st, pistes: o.pistes ?? {} });
  if (!courant.m.entry) courant.m.entry = id;
  return id;
}
function suite(a: string, b: string, nom?: string, g: Condition[] = []) { courant.m.tr.push({ a, b, g, mode: 'all', ...(nom ? { nom } : {}) }); }
function fin(a: string) { courant.m.tr.push({ a, b: '', g: [], mode: 'all' }); }
function garde(id: string, name: string, delai: number, cond: Condition[], mode: 'all' | 'any', sortie: Scene | null, params: Record<string, unknown>, vers: string, o: { pistes?: PistesEtape } = {}) {
  etape(id, name, 'g:garde', 10, posDelai(delai), 20, sortie, { delai, echeance: 'continuer', ...params }, o);
  courant.m.tr.push({ a: id, b: vers, g: cond, mode, nom: 'condition remplie' });
  courant.m.tr.push({ a: id, b: vers, g: [], mode: 'all', nom: 'délai dépassé' });
}
/** enchaîne une liste d'étapes (sorties sans condition), la dernière finit le moment si `finir` */
function chaine(ids: string[], finir = true) { for (let i = 0; i < ids.length - 1; i++) suite(ids[i], ids[i + 1]); if (finir) fin(ids[ids.length - 1]); }

// Followers : PROPOSITION (à valider par l'auteur) — départ, viralité, + (pourcentage × 100) par synthèse, explosion.
const F_DEPART = 52000, F_VIRAL = 38000, F_EXPLOSION = 250000;

// Médias R2 (téléphones) — fournis par le propriétaire
const POSTS = [
  { f: 'insta_post_01.mp4', d: 20, role: 'post personnel, Jim centré sur lui-même (présentation du profil)', partenariat: null, echo: false },
  { f: 'insta_post_02.mp4', d: 25, role: 'post « conseils » au ton masculiniste', partenariat: null, echo: false },
  { f: 'insta_post_03.mp4', d: 20, role: 'partenariat de marque n° 1 (mention « Partenariat rémunéré »)', partenariat: 'marque à fixer', echo: false },
  { f: 'insta_post_04.mp4', d: 20, role: 'partenariat de marque n° 2', partenariat: 'marque à fixer', echo: false },
  { f: 'insta_post_05.mp4', d: 25, role: 'campagne Écho du ministère (partenariat Ministère de la Santé mentale)', partenariat: 'Ministère de la Santé mentale', echo: true },
  { f: 'insta_post_06.mp4', d: 20, role: 'post récent (le plus commenté)', partenariat: null, echo: false },
];
const STORIES_FIL = [
  { f: 'insta_story_01.mp4', d: 15, role: 'story du quotidien de Jim' },
  { f: 'insta_story_02.mp4', d: 15, role: 'story partenariat (code promo)' },
  { f: 'insta_story_03.mp4', d: 15, role: 'story campagne Écho 1.0 du ministère' },
  { f: 'insta_story_04.mp4', d: 15, role: 'story « sondage » adressée à ses abonnés' },
];
const FIL_ORDRE = ['insta_story_01.mp4', 'insta_post_01.mp4', 'insta_post_02.mp4', 'insta_story_02.mp4', 'insta_post_03.mp4', 'insta_post_04.mp4', 'insta_story_03.mp4', 'insta_post_05.mp4', 'insta_story_04.mp4', 'insta_post_06.mp4'];
const R2 = '/api/projets/<id du projet>/medias/<fichier>';
const MO_PAR_S = 0.2; // 720×1280 H.264 ≈ 1,5 Mb/s + AAC 96 kb/s
const dureeFil = [...POSTS, ...STORIES_FIL].reduce((a, x) => a + x.d, 0);
const poidsFil = Math.round(dureeFil * MO_PAR_S);

const ECHO_ECOUTE = 'echo2_interface_ecoute.mp4';
const ECHO_ANALYSE = 'echo2_interface_analyse.mp4';
/** Stories filmées EN DIRECT par Jim (téléphone → flux WebRTC du streamer) : cadre « story » demandé. */
const STORY_DIRECT = { type: 'streamer', gabarit: 'calme' };

// Vidéo du Zoom (UNE vidéo précalculée) : Junon parle, puis « écoute » pendant les répliques de Jim (créneaux muets).
const ZOOM_APPEL = 6, ZOOM_FIN = 4;
const zoomLignes: { tc: number; duree: number; qui: 'Junon' | 'Jim'; replique: string }[] = [];
{
  let t = ZOOM_APPEL;
  for (const d of dialogue) {
    const duree = d.qui === 'Junon' ? parole(d.t, 2.5) : parole(d.t, 2.3) + 1;
    zoomLignes.push({ tc: t, duree, qui: d.qui, replique: d.t });
    t += duree;
  }
}
const dZoom = zoomLignes[zoomLignes.length - 1].tc + zoomLignes[zoomLignes.length - 1].duree + ZOOM_FIN;
/** k[0] tel que la durée prévue de l'étape soit ≤ la vidéo (la fin de vidéo tombe dans le garde-fou qui suit) */
const dureeAvantFin = (video: number) => 10 + 6 * Math.floor((video - 10) / 6);

// ════════════════════════════════════════════ ACTE I — LE FIL ════════════════════════════════════════════════════
moment('accueil', 0, 'Accueil · connexion et préchargement du fil', 'go');
chaine([
  etape('ac_portes', 'Portes · QR et pseudo', 'k:attente', 300, 40, 30, 'accueil-qr', {
    telephone: 'QR → pseudo (16 caractères, filtré) ; aucune donnée personnelle demandée ; son coupé par défaut',
    accueil: 'téléphones de prêt chargés, mode calme proposé (sans vibration ni écran rouge brusque), placeurs',
    note: 'ajout de régie : l’accueil ne fait pas partie des 10 séquences de l’auteur',
  }, { asset: 'Accueil · QR et pseudo', pistes: { tel: 'Accueil · QR et pseudo', son: 'ambiance_accueil.wav', lx: 'LX 01 · Accueil' } }),
  etape('ac_precharge', 'Préchargement du fil Instagram', 'u3', 60, 50, 50, 'accueil-qr', {
    telephone: 'écran « Patientez » pendant que le téléphone télécharge les vidéos du fil (barre de progression)',
    medias: [...FIL_ORDRE],
    source: `serveur (apps/serveur, médias R2) : ${R2}`,
    lecture: 'sur les TÉLÉPHONES du public (pas sur la machine du projecteur) ; préchargées ici, lues hors ligne en séquence 1',
    poids: `≈ ${poidsFil} Mo par téléphone (${dureeFil} s de vidéo, 720×1280 H.264 + AAC ≈ 1,6 Mb/s), plus la photo du président (séquence 9)`,
    pret: 'le téléphone compte « prêt » quand toutes les vidéos sont en mémoire (signal prets)',
  }, { asset: 'Patientez · préchargement', pistes: { tel: 'Patientez · préchargement' } }),
  'ac_prets',
], false);
garde('ac_prets', 'Téléphones prêts ?', 600, [{ k: 'prets', op: '≥', v: 95 }], 'all', 'accueil-qr', {
  condition: '95 % des téléphones ont préchargé tout le fil', retardataires: 'téléphones de prêt (fil déjà chargé) proposés par l’accueil',
}, 'ac_assis');
garde('ac_assis', 'Public assis ?', 300, [{ k: 'assis', op: '≥', v: 90 }], 'all', 'accueil-qr', { condition: '90 % des présents assis' }, '');

moment('s1', 0, 'Séquence 1 · Le profil', 'auto');
etape('s1_noir', 'Noir salle · le fil s’ouvre', 'x5', 10, 40, 50, NOIR, {
  cible: 'tous', texte: 'notification Instagram (libellé à écrire par l’auteur)', mode_calme: 'son seul, sans vibration',
}, { asset: 'notif_instagram.wav', pistes: { son: 'notif_instagram.wav', lx: 'LX 02 · Noir salle, plateau noir' } });
etape('s1_fil', 'Fil Instagram de Jim', 'u3', 150, 50, 50, NOIR, {
  texte_auteur: s1Texte,
  intention: s1Intention,
  ecran_telephone: 'fil Instagram de @wakupjimmy : défilement vertical, posts vidéo et stories, légende, likes, mention partenariat',
  fil: FIL_ORDRE.map(f => {
    const p = POSTS.find(x => x.f === f); const s = STORIES_FIL.find(x => x.f === f);
    return p ? { fichier: f, type: 'post', duree_s: p.d, role: p.role, legende: 'à fournir par l’auteur', likes: 'à fournir par l’auteur', partenariat: p.partenariat, campagne_echo: p.echo }
      : { fichier: f, type: 'story', duree_s: s!.d, role: s!.role, legende: 'à fournir par l’auteur', campagne_echo: f === 'insta_story_03.mp4' };
  }),
  medias: 'servis par R2 (apps/serveur), préchargés à l’accueil ; son coupé par défaut, le spectateur peut l’activer',
  ecran_scene: 'noir (le plateau est vide, tout se passe sur les téléphones)',
}, { asset: 'Fil Instagram · @wakupjimmy', pistes: { tel: 'Fil Instagram · @wakupjimmy', txt: 'Séquence 1 · le profil' } });
garde('s1_garde', 'Fil parcouru ?', 90, [{ k: 'sigv:fil_termine_pct', op: '≥', v: 80 }], 'all', NOIR, {
  condition: '80 % des téléphones ont atteint le bas du fil (signal fil_termine_pct envoyé par le serveur)',
  entree: { signal: 'fil_termine_pct', min: 0, max: 100, par: 'serveur : part des téléphones arrivés en bas du fil' },
}, '');
chaine(['s1_noir', 's1_fil', 's1_garde'], false);

moment('s2', 0, 'Séquence 2 · S’abonner ou signaler', 'go');
etape('s2_choix', 'Choix : s’abonner ou masquer ?', 'u1', 25, 20, 50, NOIR, {
  texte_auteur: s2Texte,
  question: s2Question,
  options: { A: s2OptA, B: s2OptB },
  ecran_telephone: 'choix binaire en haut, champ de justification en dessous (même écran)',
  ecran_scene: 'noir',
}, { asset: 'Choix · s’abonner / masquer', pistes: { tel: 'Choix · s’abonner / masquer', son: 'tic_question.wav' } });
etape('s2_justif', 'Justification écrite', 'u3', 20, 50, 50, NOIR, {
  ecran_telephone: 'champ de texte « Pourquoi ? » obligatoire (280 signes), envoi',
  moderation: 'filtre automatique (insultes visant des personnes réelles, données personnelles) + file « à valider » en régie',
  sert: 'commentaires affichés autour de Jim (séquence 3)',
}, { asset: 'Justification · champ texte', pistes: { tel: 'Justification · champ texte' } });
garde('s2_garde', 'Justifications reçues ?', 60, [{ k: 'quorum', op: '≥', v: 90 }], 'all', NOIR, {
  condition: '90 % des présents ont choisi ET justifié (réponses comptées comme votes)',
  telephone_retard: 'les retardataires gardent l’écran ; envoi impossible après le délai',
}, 's2_decompte');
etape('s2_decompte', 'Décompte abonnés / masqués', 'd1', 10, 33, 50, NOIR, { gagnant: 'le plus de voix ; écart ≤ 4 points → égalité (T)', sert: 'ton de la lecture des commentaires par Jim' });
etape('s2_abonne', 'Majorité : abonnés', 'm:memoire', 10, 10, 0, NOIR, { nom: 'choix_majoritaire', op: 'poser', valeur: 'abonner', telephone: 'Merci. Ta réponse a été publiée.' }, { r: -1, c: 4 });
etape('s2_masque', 'Majorité : masqué', 'm:memoire', 10, 10, 0, NOIR, { nom: 'choix_majoritaire', op: 'poser', valeur: 'masquer', telephone: 'Merci. Ta réponse a été publiée.' }, { r: 0, c: 4 });
etape('s2_egal', 'Égalité', 'm:memoire', 10, 10, 0, NOIR, { nom: 'choix_majoritaire', op: 'poser', valeur: 'egalite', telephone: 'Merci. Ta réponse a été publiée.' }, { r: 1, c: 4 });
suite('s2_choix', 's2_justif'); suite('s2_justif', 's2_garde');
suite('s2_decompte', 's2_abonne', 'abonnés', [{ k: 'issue', op: '=', v: 'A' }]);
suite('s2_decompte', 's2_masque', 'masqué', [{ k: 'issue', op: '=', v: 'B' }]);
suite('s2_decompte', 's2_egal', 'sinon');
fin('s2_abonne'); fin('s2_masque'); fin('s2_egal');

moment('s3', 0, 'Séquence 3 · Les commentaires · live de Junon', 'auto');
const fondCom = vid('insta_commentaires_fond.mp4');
const dLive = parole(discoursJunon, 2.2) + 6;
const LIVE = vid('live_junon_discours.mp4', { boucle: false, son: true, cadrage: 'contain' });
chaine([
  etape('s3_lum', 'Lumière sur Jim', 'k:lum', 10, 70, 40, fondCom, { lx: 'LX 03 · Plateau, Jim face' }, { pistes: { lx: 'LX 03 · Plateau, Jim face' } }),
  etape('s3_entree', 'Jim entre sur scène', 'k:scene', 20, 70, 40, fondCom, { texte_auteur: s3Texte, telephone: 'écran « Regarde la scène » (téléphone posé)' }, { pistes: { tel: 'Regarde la scène' } }),
  etape('s3_commentaires', 'Commentaires du public autour de Jim', 's1', 150, 50, 50, fondCom, {
    source: 'justifications écrites de la séquence 2 (validées par la modération)',
    affichage: 'bulles de commentaires Instagram (pseudo + texte + cœur) qui apparaissent autour de Jim, une à une, au rythme de sa lecture',
    ordre: 'alternance abonnés / masqués ; la régie peut épingler',
    jim: 'les lit, un à un, à voix haute ; réagit selon choix_majoritaire',
    telephone: 'chaque spectateur voit quand SON commentaire est affiché (« Ton commentaire est à l’écran »)',
  }, { pistes: { txt: 'Commentaires du public (séquence 2)' } }),
  etape('s3_viral', 'Redevenu viral', 'm:memoire', 16, 50, 0, vid('followers_viral.mp4', { boucle: false }), {
    didascalie: s3Viral, nom: 'followers', op: 'ajouter', valeur: F_VIRAL, note: 'valeur proposée, à valider par l’auteur',
  }, { pistes: { son: 'notif_rafale.wav' } }),
  etape('s3_live', 'Live de Junon sur l’Instagram de Jim', 'k:scene', dureeAvantFin(dLive), 30, 40, LIVE, {
    texte_auteur: s3Annonce,
    discours: discoursJunon,
    video: `live_junon_discours.mp4 tournée à l’avance (≈ ${formatMMSS(dLive)}), cadre live Instagram vertical, lue en local par la sortie écran, son sur la sono ; clip posé sur la piste vidéo`,
    passage: 'auto à la fin de la vidéo',
    jim: 'regarde le live sur son téléphone, face public',
  }, { pistes: { son: 'live_junon_discours.mp4 (son)', lx: 'LX 04 · Jim en contre, écran dominant', txt: 'Discours de Junon' } }),
  's3_fin_live',
], false);
garde('s3_fin_live', 'Fin du discours ?', 20, [{ k: 'sigv:video.fin', op: '=', v: 'live_junon_discours.mp4' }], 'all', LIVE, {
  condition: 'la sortie écran signale la fin de live_junon_discours.mp4 (fin-video → signal video.fin, valeur = nom de la vidéo) ; passage auto',
}, '');

moment('s4', 0, 'Séquence 4 · Placés en tant que modérateurs', 'auto');
chaine([
  etape('s4_vibre', 'Alerte sur les téléphones', 'x4', 10, 70, 50, vid('live_junon_discours.mp4', { boucle: false, son: true, cadrage: 'contain' }), {
    cible: 'tous', motif: 'alerte (trois impulsions)', mode_calme: 'exclu (bandeau seul)',
  }, { pistes: { son: 'notif_alerte_moderateur.wav' } }),
  etape('s4_notif', 'Notification : alerte modérateur', 'x6', 30, 50, 50, vid('live_junon_discours.mp4', { boucle: false, son: true, cadrage: 'contain' }), {
    texte_auteur: s4Texte,
    titre: notifTitre,
    texte: notifTexte,
    cible: 'tous',
    ecran_telephone: 'notification système plein écran, logo du ministère, bouton « Accepter » (aucune donnée demandée)',
  }, { asset: 'Notification · alerte modérateur', pistes: { tel: 'Notification · alerte modérateur', txt: 'Notification · alerte modérateur' } }),
]);

// ════════════════════════════════════════════ ACTE II — ÉCHO ═════════════════════════════════════════════════════
moment('s5', 1, 'Séquence 5 · L’accès Gold', 'auto');
chaine([
  etape('s5_jim', 'Jim : un accès Gold ?', 'k:scene', parole(s5Jim1) + 4, 70, 40, NOIR, { replique: s5Jim1, qui: 'Jim' }, { pistes: { lx: 'LX 05 · Jim chez lui, lumière d’écran' } }),
  etape('s5_gold', 'Écho 2.0 · accès Gold activé', 'm:memoire', 12, 10, 0, vid('echo2_ouverture.mp4', { boucle: false, son: true }), {
    nom: 'echo_actif', op: 'poser', valeur: 'oui', telephone: 'Écho 2.0 · « banc des modérateurs test » (écran d’attente)',
  }, { asset: 'Écho · en attente', pistes: { tel: 'Écho · en attente', son: 'echo2_ouverture.mp4 (son)' } }),
  etape('s5_demande', 'Jim demande à Écho d’analyser ses commentaires', 'k:scene', 20, 70, 40, vid(ECHO_ECOUTE), { texte_auteur: s5Ligne2, replique: s5Jim2, qui: 'Jim' }),
  etape('s5_question', 'Première question d’Écho · téléphones', 'u3', 10, 50, 50, vid(ECHO_ECOUTE), {
    texte_auteur: s5Q,
    question: 'À ÉCRIRE PAR L’AUTEUR (texte de la première question d’Écho absent du déroulé)',
    synthese: 'À ÉCRIRE PAR L’AUTEUR',
    pourcentage: 'À FIXER PAR L’AUTEUR',
    effet: 'À ÉCRIRE PAR L’AUTEUR',
    ecran_telephone: 'question d’Écho + champ de réponse + compte à rebours 30 s',
  }, { asset: 'Écho · question + réponse 30 s', pistes: { tel: 'Écho · question + réponse 30 s', son: 'echo_question.wav' } }),
  's5_garde',
], false);
garde('s5_garde', 'Réponses · 30 s', 30, [{ k: 'quorum', op: '≥', v: 90 }], 'all', vid(ECHO_ANALYSE), { condition: '90 % des présents ont répondu, ou 30 s', telephone: 'Merci · Écho analyse' }, 's5_synthese', { pistes: { tel: 'Écho · merci, synthèse en cours' } });
etape('s5_synthese', 'Synthèse d’Écho (première)', 's1', 25, 50, 50, titre('—', 'ÉCHO 2.0 · PREMIÈRE SYNTHÈSE', 'texte à écrire par l’auteur'), {
  synthese: 'À ÉCRIRE PAR L’AUTEUR', pourcentage: 'À FIXER PAR L’AUTEUR', mode: 'cible (texte affiché mot pour mot)',
}, { pistes: { son: 'echo_synthese.wav' } });
fin('s5_synthese');

// Ping-pong : 4 blocs de questions
let followers = F_DEPART + F_VIRAL;
const blocs: { id: string; nom: string; qs: number[]; story: { nom: string; role: string }[] }[] = [
  { id: 's6a', nom: 'Séquence 6 · Ping-pong I · questions 1 à 4', qs: [1, 2, 3, 4], story: [{ nom: 'Story en direct · Jim promeut Écho', role: 'Jim promeut Écho 2.0 (après les questions 1 à 4)' }] },
  { id: 's6b', nom: 'Séquence 6 · Ping-pong II · questions 5 à 8', qs: [5, 6, 7, 8], story: [{ nom: 'Story en direct · ses changements', role: 'Jim promeut Écho 2.0 et ses changements positifs (après les questions 5 à 8)' }] },
  { id: 's6c', nom: 'Séquence 6 · Ping-pong III · questions 9 à 12', qs: [9, 10, 11, 12], story: [{ nom: 'Story en direct · excuses', role: 'story d’excuses (question 12 : « Poste une story d’excuses »)' }] },
  { id: 's6d', nom: 'Séquence 6 · Ping-pong IV · questions 13 à 15', qs: [13, 14, 15], story: [{ nom: 'Story en direct · transformé', role: 'Jim « transformé » remercie Écho ; les followers explosent (question 15)' }] },
];
const sceneSynthese = (n: number) => titre(syntheses[n - 1].pct, `ÉCHO 2.0 · SYNTHÈSE ${n} / 15`, syntheses[n - 1].s);
for (const [bi, b] of blocs.entries()) {
  moment(b.id, 1, b.nom, bi === blocs.length - 1 ? 'go' : 'auto');
  const ids: string[] = [];
  ids.push(etape(`${b.id}_reprise`, `Reprise · question ${b.qs[0]}`, 'p:reprise', 10, 0, 50, vid(ECHO_ECOUTE), {
    nom: `question ${b.qs[0]}`, restaure: 'tout', note: 'si le spectacle s’arrête : REPRENDRE ICI (mémoires followers et echo_actif restaurées)',
    ...(bi === 0 ? { texte_auteur: s6Texte, contrainte: s6Contrainte, regle_orientation: s6Regle } : {}),
  }));
  for (const n of b.qs) {
    const Q = questions[n - 1], S = syntheses[n - 1];
    const cible = { numero: n, question: Q.q, synthese: S.s, pourcentage: S.pct, effet: S.effet };
    const gain = n === 15 ? F_EXPLOSION : parseInt(S.pct, 10) * 100;
    followers += gain;
    ids.push(etape(`q${n}_jim`, `Q${n} · Jim demande`, 'k:scene', parole(Q.q) + 3, 70, 40, vid(ECHO_ECOUTE), {
      numero: n, replique: Q.q, qui: 'Jim', jeu: 'Jim tape et dit sa question à voix haute ; elle s’écrit sur l’interface d’Écho',
    }, { pistes: { txt: `Question ${n}` } }));
    ids.push(etape(`q${n}_tel`, `Q${n} · question sur les téléphones`, 'u3', 10, 50, 50, vid(ECHO_ECOUTE), {
      ...cible,
      ecran_telephone: 'question de Jim (mot pour mot) + champ de réponse libre + compte à rebours 30 s',
      synthese_ia: 'l’IA lit les réponses et reformule les idées compatibles avec la synthèse cible ; les autres sont écartées (règle d’orientation)',
    }, { asset: 'Écho · question + réponse 30 s', pistes: { tel: 'Écho · question + réponse 30 s', son: 'echo_question.wav' } }));
    ids.push(`q${n}_garde`);
    garde(`q${n}_garde`, `Q${n} · réponses · 30 s`, 30, [{ k: 'quorum', op: '≥', v: 90 }], 'all', vid(ECHO_ANALYSE), {
      numero: n, condition: '90 % des présents ont répondu, ou 30 s au plus', telephone: 'Merci · Écho analyse',
    }, `q${n}_synth`, { pistes: { tel: 'Écho · merci, synthèse en cours' } });
    ids.push(etape(`q${n}_synth`, `Q${n} · synthèse d’Écho · ${S.pct}`, 's1', lecture(S.s), 50, 50, sceneSynthese(n), {
      ...cible, mode: 'cible (texte affiché mot pour mot ; orientation IA à valider)', telephone: 'la synthèse s’affiche aussi sur le téléphone',
    }, { pistes: { son: 'echo_synthese.wav', txt: `Synthèse ${n} · ${S.pct}` } }));
    ids.push(etape(`q${n}_effet`, `Q${n} · effet sur Jim`, 'm:memoire', n === 8 ? 22 : n === 15 ? 16 : 12, 50, 0, sceneSynthese(n), {
      numero: n, effet: S.effet, qui: 'Jim', nom: 'followers', op: 'ajouter', valeur: gain,
      note: n === 15 ? 'explosion des followers (valeur proposée)' : 'followers + (pourcentage × 100) : règle proposée, à valider',
      ...(n === 8 ? { lumiere: 'point culminant de la séquence' } : {}),
    }, n === 8 ? { pistes: { lx: 'LX 06 · Q8, resserrement sur Jim' } } : {}));
  }
  // Story filmée EN DIRECT : GO régie pour ouvrir, flux du téléphone de Jim (streamer WebRTC) en cadre story, GO pour fermer.
  for (const s of b.story) {
    const ouvrir = `${b.id}_story_go`, story = `${b.id}_story`, fermer = `${b.id}_story_fin`;
    // les étapes sont créées ici, les sorties posées par chaine() (le garde-fou « ouvrir » a ses deux sorties propres)
    etape(ouvrir, `GO · ouvrir la story (${s.nom.toLowerCase()})`, 'g:garde', 10, posDelai(20), 100, sceneSynthese(b.qs[b.qs.length - 1]), {
      delai: 20, echeance: 'top', condition: 'GO régie (top ou signal go.story) quand Jim lève son téléphone et que son flux est reçu',
      flux: 'téléphone de Jim → flux WebRTC du streamer (techno validée), affiché en scène « streamer »',
    });
    courant.m.tr.push({ a: ouvrir, b: story, g: [{ k: 'sig:go.story', op: '≥', v: 1 }], mode: 'all', nom: 'condition remplie' });
    courant.m.tr.push({ a: ouvrir, b: story, g: [], mode: 'all', nom: 'délai dépassé' });
    etape(story, s.nom, 'k:scene', b.id === 's6d' ? 40 : 30, 60, 40, STORY_DIRECT, {
      story: s.role, ...(b.id === 's6a' || b.id === 's6d' ? { texte_auteur: s6Fin } : {}),
      jeu: 'Jim se filme EN DIRECT sur scène avec son téléphone (selfie vertical)',
      ecran_scene: 'scène « streamer » : flux de Jim dans un cadre « story Instagram » (gabarit story à créer ; en attendant gabarit calme) + compteur de followers qui monte (mémoire followers)',
      ...(b.id === 's6d' ? { compteur: 'les followers explosent (question 15)' } : {}),
      secours: 'flux perdu : la scène streamer joue sa vidéo de secours ; la régie ferme la story',
    }, { pistes: { lx: b.id === 's6d' ? 'LX 07 · Jim triomphant' : 'LX 05 · Jim chez lui, lumière d’écran', ...(b.id === 's6d' ? { son: 'notif_rafale.wav' } : {}), txt: s.nom } });
    etape(fermer, 'GO · fermer la story', 'g:garde', 10, posDelai(30), 100, STORY_DIRECT, {
      delai: 30, echeance: 'top', condition: 'GO régie (top ou signal go.story.fin) à la fin de la story',
    });
    courant.m.tr.push({ a: fermer, b: '', g: [{ k: 'sig:go.story.fin', op: '≥', v: 1 }], mode: 'all', nom: 'condition remplie' });
    courant.m.tr.push({ a: fermer, b: '', g: [], mode: 'all', nom: 'délai dépassé' });
    suite(story, fermer);
    ids.push(ouvrir);
  }
  chaine(ids, false);
}

moment('s7', 1, 'Séquence 7 · Le Zoom avec Junon', 'auto');
const ZOOM = vid('zoom_junon.mp4', { boucle: false, son: true });
etape('s7_visio', 'Visio avec Junon (vidéo + Jim en direct)', 'k:scene', dureeAvantFin(dZoom), 50, 40, ZOOM, {
  texte_auteur: zoomIntro,
  video: `zoom_junon.mp4 tournée à l’avance (≈ ${formatMMSS(dZoom)}) : sonnerie et décroché (${ZOOM_APPEL} s), Junon dit ses répliques et ÉCOUTE pendant les créneaux de Jim (silences calés au minutage), fin d’appel (${ZOOM_FIN} s) ; lue en local, clip posé sur la piste vidéo`,
  jeu: 'Jim joue face à la vidéo, au minutage : chaque réplique doit tomber dans son créneau (répéter avec la vidéo)',
  dialogue: zoomLignes.map(z => ({ tc: formatMMSS(z.tc), duree_s: z.duree, qui: z.qui, replique: z.replique })),
  passage: 'auto à la fin de la vidéo',
}, { pistes: { lx: 'LX 08 · Visio, Jim de trois-quarts', son: 'zoom_junon.mp4 (son)' } });
garde('s7_fin', 'Fin de la visio ?', 20, [{ k: 'sigv:video.fin', op: '=', v: 'zoom_junon.mp4' }], 'all', ZOOM, {
  condition: 'la sortie écran signale la fin de zoom_junon.mp4 (signal video.fin, valeur = nom de la vidéo) ; passage auto',
}, '');
suite('s7_visio', 's7_fin');

moment('s8', 1, 'Séquence 8 · Le départ', 'go');
chaine([
  etape('s8_prepare', 'Jim se prépare', 'k:scene', 45, 70, 40, vid(ECHO_ECOUTE), { texte_auteur: s8Texte }, { pistes: { lx: 'LX 09 · Jim se prépare, miroir', son: 'musique_preparation.wav' } }),
  etape('s8_message', 'Jim : dernier message à Écho', 'k:scene', parole(s8Message) + 3, 70, 40, vid(ECHO_ECOUTE), { replique: s8Message, qui: 'Jim' }, { pistes: { txt: 'Dernier message à Écho' } }),
  etape('s8_tel', 'Question sur les téléphones', 'u3', 10, 50, 50, vid(ECHO_ECOUTE), {
    question: s8Message, synthese: s8Reponses, ecran_telephone: 'message de Jim + champ de réponse + compte à rebours 30 s',
  }, { asset: 'Écho · question + réponse 30 s', pistes: { tel: 'Écho · question + réponse 30 s', son: 'echo_question.wav' } }),
  's8_garde',
], false);
garde('s8_garde', 'Réponses · 30 s', 30, [{ k: 'quorum', op: '≥', v: 90 }], 'all', vid(ECHO_ANALYSE), { condition: '90 % des présents ont répondu, ou 30 s', telephone: 'Merci · Écho analyse' }, 's8_synthese', { pistes: { tel: 'Écho · merci, synthèse en cours' } });
chaine([
  etape('s8_synthese', 'Synthèse d’Écho · conseils', 's1', lecture(s8Reponses.join(' ')) + 4, 50, 50, titre('ÉCHO 2.0', 'SYNTHÈSE', s8Reponses.join('\n')), {
    synthese: s8Reponses, pourcentage: 'aucun dans le déroulé', mode: 'cible (texte affiché mot pour mot)',
  }, { pistes: { son: 'echo_synthese.wav', txt: 'Synthèse · conseils' } }),
  etape('s8_sortie', 'Il sort, heureux', 'k:scene', 15, 70, 40, titre('ÉCHO 2.0', 'SYNTHÈSE', s8Reponses.join('\n')), { didascalie: s8Sort }),
  etape('s8_noir', 'Noir', 'k:fondu', 10, 10, 60, NOIR, { lx: 'LX 10 · Noir' }, { pistes: { lx: 'LX 10 · Noir' } }),
  etape('s8_temps', 'Un temps', 'k:passage', 15, 30, 50, NOIR, { didascalie: 'Un temps.', telephone: 'écran noir' }),
]);

// ════════════════════════════════════════════ ACTE III — LE REFLET ══════════════════════════════════════════════
moment('s9', 2, 'Séquence 9 · Le flash info', 'go');
const dP1 = parole(pres1.join(' '), 2.1), dP2 = parole(pres2.join(' '), 2.0), dP3 = parole(pres3.join(' '), 2.1);
chaine([
  etape('s9_jingle', 'Flash info · jingle radio', 'k:son', 10, 80, 0, NOIR, { texte_auteur: s9Texte }, { asset: 'radio_flash_jingle.wav', pistes: { son: 'radio_flash_jingle.wav', lx: 'LX 11 · Noir total, salle comprise' } }),
  etape('s9_visage', 'Visage du président sur les téléphones', 'u3', 10, 50, 50, NOIR, {
    ecran_telephone: 'photo du président Jean Boilot plein écran, bandeau « ALLOCUTION — EN DIRECT », onde audio',
    image: 'president_boilot.jpg (servie par R2, préchargée à l’accueil)',
  }, { asset: 'Visage du président', pistes: { tel: 'Visage du président' } }),
  etape('s9_discours1', 'Allocution · 1', 'k:son', dP1, 85, 0, NOIR, { texte: pres1.join('\n\n'), qui: 'le président Jean Boilot (radio)' }, { asset: 'radio_president_01.wav', pistes: { son: 'radio_president_01.wav', txt: 'Allocution du président · 1' } }),
  etape('s9_rouge', 'Écrans rouges · tous les téléphones', 'x1', 10, 20, 50, NOIR, {
    didascalie: didRouge,
    decision: 'décision du propriétaire : TOUS les téléphones passent en rouge, sans ciblage ni classement (la didascalie de l’auteur est gardée telle quelle)',
    cible: 'tous', couleur: '#d0021b', duree: 'tenu jusqu’à l’extinction', montee: 'fondu 1 s (pas de flash), mode calme compris',
  }, { asset: 'Écran rouge · tous', pistes: { tel: 'Écran rouge · tous' } }),
  etape('s9_discours2', 'Allocution · 2 · vous savez pourquoi', 'k:son', Math.max(10, dP2), 85, 0, NOIR, { texte: pres2.join('\n\n'), qui: 'le président Jean Boilot (radio)' }, { asset: 'radio_president_02.wav', pistes: { son: 'radio_president_02.wav', txt: 'Allocution du président · 2' } }),
  etape('s9_discours3', 'Allocution · 3', 'k:son', dP3, 85, 0, NOIR, { texte: pres3.join('\n\n'), qui: 'le président Jean Boilot (radio)' }, { asset: 'radio_president_03.wav', pistes: { son: 'radio_president_03.wav', txt: 'Allocution du président · 3' } }),
  etape('s9_desactive', 'Écho désactivé', 'm:memoire', 10, 10, 0, NOIR, { nom: 'echo_actif', op: 'poser', valeur: 'non' }),
  etape('s9_extinction', 'Extinction · le reflet', 'u3', 25, 50, 50, NOIR, {
    didascalie: s9Extinction,
    ecran_telephone: 'écran entièrement noir, luminosité au maximum puis coupée : le téléphone devient miroir (aucune caméra utilisée)',
    rouges: 'les écrans rouges s’éteignent en même temps',
  }, { asset: 'Extinction · reflet', pistes: { tel: 'Extinction · reflet', son: 'coupure_radio.wav' } }),
]);

moment('s10', 2, 'Séquence 10 · Le dévoilement · À DÉCIDER', 'auto');
chaine([
  etape('s10_noir', 'Noir final (dévoilement à décider)', 'k:fondu', 15, 10, 80, NOIR, {
    a_decider: 'séquence mise de côté par le propriétaire : l’auteur n’est pas sûr de la faire ; seul le noir final est monté',
    texte_auteur: s10Texte, sens: s10Morale,
    si_gardee: 'écran scène : code d’Écho qui défile puis script horodaté (didascalies, répliques, synthèses et pourcentages)',
  }, { pistes: { lx: 'LX 13 · Noir final' } }),
]);

// ── projet ──────────────────────────────────────────────────────────────────────────────────────────────────────
const projet: Projet = {
  titre: 'ÉCHO',
  acts: ACTES,
  ev: moments.map(x => x.m),
  sens: { aff: 70, part: 60, calme: 55, pen: 60 },
  hold: {}, go: {}, ver: 1, nid: 2000,
  tracks: [],
  memoires: { followers: F_DEPART, echo_actif: 'non', choix_majoritaire: '' },
};

// ── pistes de la conduite, calées sur le planning prévu ─────────────────────────────────────────────────────────
const plan = planifier(projet);
const debutEtape = new Map<string, { off: number; dur: number }>();
for (const mp of plan.moments) for (const e of mp.etapes) debutEtape.set(mp.id + '/' + e.id, { off: Math.round(e.debut - mp.debut), dur: Math.max(1, Math.round(e.fin - e.debut)) });
let nc = 0;
type Clip = { id: string; name: string; ev: string; off: number; dur: number };
const clips: Record<'video' | 'tel' | 'son' | 'lx' | 'txt', Clip[]> = { video: [], tel: [], son: [], lx: [], txt: [] };
function poser(piste: keyof typeof clips, name: string, ev: string, off: number, dur: number, fusion = true) {
  const l = clips[piste];
  const der = l[l.length - 1];
  if (fusion && der && der.name === name && der.ev === ev && der.off + der.dur >= off - 1) { der.dur = Math.max(der.dur, off + dur - der.off); return; }
  l.push({ id: 'c' + ++nc, name, ev, off, dur });
}
for (const md of moments) for (const d of md.defs) {
  const pos = debutEtape.get(md.m.id + '/' + d.st.id);
  if (!pos) continue;
  const sc = d.st.params?.sortie as Scene | undefined;
  if (sc && typeof sc === 'object' && sc.type === 'video') poser('video', String(sc.asset), md.m.id, pos.off, pos.dur);
  if (d.pistes.tel) poser('tel', d.pistes.tel, md.m.id, pos.off, pos.dur);
  if (d.pistes.son) poser('son', d.pistes.son, md.m.id, pos.off, pos.dur, false);
  if (d.pistes.lx) poser('lx', d.pistes.lx, md.m.id, pos.off, pos.dur, false);
  if (d.pistes.txt) poser('txt', d.pistes.txt, md.m.id, pos.off, pos.dur);
}
for (const z of zoomLignes) clips.txt.push({ id: 'c' + ++nc, name: `${z.qui} : ${z.replique.length > 48 ? z.replique.slice(0, 47) + '…' : z.replique}`, ev: 's7', off: z.tc, dur: z.duree });
const pts = (v: number[]) => Object.fromEntries(moments.map((m, i) => [m.m.id, v[i]]));
//                 acc s1  s2  s3  s4  s5  6a  6b  6c  6d  s7  s8  s9  s10
const TENSION = [10, 25, 35, 45, 52, 48, 50, 62, 58, 66, 55, 60, 95, 85];
const LUMIERE = [70, 5, 5, 60, 55, 50, 50, 45, 50, 60, 55, 30, 0, 5];
const PARTICIP = [40, 70, 90, 55, 40, 30, 85, 85, 85, 85, 10, 60, 5, 0];
let nr = 0;
const mk = (ev: string, off: number, txt: string, lead?: number) => ({ id: 'r' + ++nr, ev, off, txt, ...(lead ? { lead } : {}) });
const NOTES = [
  mk('accueil', 0, 'Portes ouvertes : QR, téléphones de prêt (fil déjà préchargé), mode calme expliqué'),
  mk('accueil', 300, 'Surveiller le préchargement (prets) : un téléphone lent → téléphone de prêt'),
  mk('s1', 0, 'GO régie donné = portes fermées, noir salle : le fil s’ouvre sur tous les téléphones'),
  mk('s2', 0, 'Modération : file « à valider » ouverte pendant les justifications'),
  mk('s3', 0, 'GO régie = entrée de Jim (top quand Jim est en coulisse prêt)'),
  mk('s3', 40, 'Épingler les commentaires dans l’ordre de lecture de Jim'),
  mk('s3', debutEtape.get('s3/s3_live')?.off ?? 0, 'Live de Junon : vidéo locale, passage AUTO à la fin de la vidéo (signal video.fin)'),
  mk('s4', 0, 'Notification partie automatiquement à la fin de la vidéo du discours'),
  mk('s6a', 0, 'Ping-pong : vérifier chaque synthèse avant affichage (mode cible)'),
  mk('s6a', debutEtape.get('s6a/s6a_story_go')?.off ?? 0, 'Story en direct : GO pour ouvrir quand le flux du téléphone de Jim est reçu, GO pour fermer'),
  mk('s6b', 0, 'Q8 = point culminant : laisser respirer l’effet'),
  mk('s6d', 0, 'Fin de la séquence 6 : GO régie avant la visio (zoom_junon.mp4 prête, Jim en place)'),
  mk('s7', 0, 'Visio : une seule vidéo, Jim joue au minutage ; ne pas toucher, passage auto à la fin'),
  mk('s8', 0, 'Après « Un temps » : GO régie pour le flash info'),
  mk('s9', debutEtape.get('s9/s9_rouge')?.off ?? 0, 'Écrans rouges : TOUS les téléphones, sans ciblage'),
  mk('s10', 0, 'Séquence 10 à décider : aujourd’hui noir final seul'),
];
const SECU = [
  mk('accueil', 0, 'Public en mouvement, téléphones de prêt : placeurs aux escaliers', 10),
  mk('s1', 0, 'Noir salle avec téléphones allumés : veilleuses de sortie', 15),
  mk('s3', 0, 'Entrée de Jim dans la pénombre', 10),
  mk('s4', 0, 'Vibration collective (mode calme exclu)', 10),
  mk('s8', Math.round((debutEtape.get('s8/s8_noir')?.off ?? 0)), 'Noir plateau', 10),
  mk('s9', 0, 'Noir total + son radio fort : niveau sonore à surveiller', 15),
  mk('s9', debutEtape.get('s9/s9_rouge')?.off ?? 0, 'Toute la salle passe au rouge, puis extinction : placeurs prêts pour un spectateur affecté', 20),
  mk('s9', debutEtape.get('s9/s9_extinction')?.off ?? 0, 'Extinction des téléphones : noir complet', 10),
];
projet.tracks = [
  { id: 't_tension', type: 'curve', name: 'Tension dramatique', open: true, col: '#e59578', src: 'tens', pts: pts(TENSION) },
  { id: 't_lum', type: 'curve', name: 'Lumière générale', open: true, col: '#b9cfd8', src: 'lum', pts: pts(LUMIERE) },
  { id: 't_part', type: 'curve', name: 'Participation', open: true, col: '#78b08f', src: 'pub', pts: pts(PARTICIP) },
  { id: 't_son', type: 'son', name: 'Son', open: true, clips: clips.son },
  { id: 't_lx', type: 'lx', name: 'Lumière · cues', open: true, clips: clips.lx },
  { id: 't_video', type: 'video', name: 'Écran de scène · vidéos précalculées', open: true, clips: clips.video },
  { id: 't_tel', type: 'tel', name: 'Téléphones', open: true, clips: clips.tel },
  { id: 't_txt', type: 'txt', name: 'Textes de l’auteur', open: true, clips: clips.txt },
  { id: 't_secu', type: 'secu', name: 'Sécurité', open: true, marks: SECU },
  { id: 't_notes', type: 'notes', name: 'Notes de régie', open: true, marks: NOTES },
] as Piste[];

// ── catalogue d'assets ──────────────────────────────────────────────────────────────────────────────────────────
const vScene: [string, string, number][] = [
  ['insta_commentaires_fond.mp4', 'séq. 3 · fond Instagram (cadre de profil, sans texte) pour les commentaires autour de Jim · boucle', 30],
  ['followers_viral.mp4', 'séq. 3 · compteur de followers qui s’emballe, « redevenu viral »', 12],
  ['live_junon_discours.mp4', 'séq. 3 · live Instagram de Junon (cadre vertical, cœurs, commentaires), discours mot pour mot, son', dLive],
  ['echo2_ouverture.mp4', 'séq. 5 · ouverture d’Écho 2.0, accès Gold', 10],
  [ECHO_ECOUTE, 'séq. 5 à 8 · interface d’Écho 2.0 qui écoute (Jim tape) · boucle', 20],
  [ECHO_ANALYSE, 'séq. 5 à 8 · interface d’Écho 2.0 « analyse des réponses » · boucle', 15],
  ['zoom_junon.mp4', 'séq. 7 · visio Zoom de Junon Maréchal tournée à l’avance : sonnerie, 8 répliques de Junon, créneaux d’écoute pendant les répliques de Jim (minutage dans s7_visio.params.dialogue), fin d’appel · son', dZoom],
];
const vInsta: [string, string, number][] = [
  ...POSTS.map((p): [string, string, number] => [p.f, `séq. 1 · post vertical · ${p.role} · légende et likes à fournir`, p.d]),
  ...STORIES_FIL.map((s): [string, string, number] => [s.f, `séq. 1 · story verticale · ${s.role}`, s.d]),
];
const assets = [
  { k: 'video', n: 'Vidéos · écran scène (lues en local sur la machine du projecteur)', items: vScene },
  { k: 'video', n: `Vidéos Instagram · téléphones (fournies par le propriétaire, servies par R2, préchargées à l’accueil ; 720×1280 H.264 + AAC ; ≈ ${poidsFil} Mo par téléphone)`, items: vInsta },
  { k: 'img', n: 'Images', items: [
    ['president_boilot.jpg', 'séq. 9 · visage du président Jean Boilot, téléphones (R2, préchargée)', 0],
    ['logo_ministere_sante_mentale.png', 'séq. 4 · logo de la notification modérateur, téléphones (R2)', 0],
    ['avatar_wakupjimmy.jpg', 'séq. 1 et 3 · photo de profil de Jim', 0],
  ] as [string, string, number][] },
  { k: 'son', n: 'Sons', items: [
    ['ambiance_accueil.wav', 'accueil · nappe', 600],
    ['notif_instagram.wav', 'séq. 1 · notification sur les téléphones', 2],
    ['tic_question.wav', 'séq. 2 · arrivée de la question', 2],
    ['notif_rafale.wav', 'séq. 3 et 6 · rafale de notifications (viralité), sono', 6],
    ['notif_alerte_moderateur.wav', 'séq. 4 · alerte du ministère, téléphones', 3],
    ['echo_question.wav', 'séq. 5 à 8 · question envoyée par Écho, téléphones', 2],
    ['echo_synthese.wav', 'séq. 5 à 8 · la synthèse tombe, sono', 3],
    ['musique_preparation.wav', 'séq. 8 · Jim se prépare', 45],
    ['radio_flash_jingle.wav', 'séq. 9 · jingle flash info radio', 8],
    ['radio_president_01.wav', `séq. 9 · allocution, partie 1 (jusqu’à « … de leur smartphone. »), voix radio`, dP1],
    ['radio_president_02.wav', 'séq. 9 · allocution, partie 2 (« À celles et ceux dont l’écran vient de rougir… »)', dP2],
    ['radio_president_03.wav', 'séq. 9 · allocution, partie 3 (cellule de crise → « Vive la France. »)', dP3],
    ['coupure_radio.wav', 'séq. 9 · coupure sèche à l’extinction', 2],
  ] as [string, string, number][] },
  { k: 'lx', n: 'Lumières · mémoires', items: [
    ['LX 01 · Accueil', 'salle 70 %', 3], ['LX 02 · Noir salle, plateau noir', 'téléphones seuls', 5], ['LX 03 · Plateau, Jim face', '70 %', 3],
    ['LX 04 · Jim en contre, écran dominant', 'live de Junon', 3], ['LX 05 · Jim chez lui, lumière d’écran', 'acte II', 4], ['LX 06 · Q8, resserrement sur Jim', 'point culminant', 6],
    ['LX 07 · Jim triomphant', 'followers qui explosent', 2], ['LX 08 · Visio, Jim de trois-quarts', 'Zoom', 3], ['LX 09 · Jim se prépare, miroir', 'départ', 4],
    ['LX 10 · Noir', 'fin acte II', 3], ['LX 11 · Noir total, salle comprise', 'flash info', 0], ['LX 12 · Salle dans le noir, écran seul', 'dévoilement', 3], ['LX 13 · Noir final', 'fin', 6],
  ] as [string, string, number][] },
  { k: 'tel', n: 'Écrans téléphone', items: [
    ['Accueil · QR et pseudo', 'écran type', 30], ['Patientez · préchargement', 'barre de progression du fil', 60], ['Fil Instagram · @wakupjimmy', 'MANQUANT · fil vertical vidéo', 150],
    ['Choix · s’abonner / masquer', 'MANQUANT · choix + justification', 25], ['Justification · champ texte', 'MANQUANT · champ libre (même écran que le choix)', 20],
    ['Regarde la scène', 'écran type', 10], ['Notification · alerte modérateur', 'notification plein écran', 30], ['Écho · en attente', 'écran type', 10],
    ['Écho · question + réponse 30 s', 'MANQUANT · question + champ libre + chrono', 40], ['Écho · merci, synthèse en cours', 'écran type', 20],
    ['Visage du président', 'image plein écran + onde', 10], ['Écran rouge · tous', 'couleur pleine tenue (bloc x1), fondu 1 s', 60], ['Extinction · reflet', 'MANQUANT · noir définitif', 25],
  ] as [string, string, number][] },
  { k: 'txt', n: 'Textes de l’auteur (mot pour mot dans les étapes)', items: [
    ['Discours de Junon', 'séq. 3 · s3_live.params.discours', dLive],
    ['Notification · alerte modérateur', 'séq. 4 · s4_notif.params.titre / texte', 30],
    ...questions.map((q, i): [string, string, number] => [`Question ${i + 1}`, `séq. 6 · q${i + 1}_jim.params.replique`, parole(q.q)]),
    ...syntheses.map((s, i): [string, string, number] => [`Synthèse ${i + 1} · ${s.pct}`, `séq. 6 · q${i + 1}_synth.params.synthese`, lecture(s.s)]),
    ['Dialogue du Zoom', 'séq. 7 · s7_visio.params.dialogue (16 répliques minutées)', dZoom],
    ['Dernier message à Écho', 'séq. 8 · s8_message.params.replique', parole(s8Message)],
    ['Synthèse · conseils', 'séq. 8 · s8_synthese.params.synthese (4 réponses)', 0],
    ['Allocution du président', 'séq. 9 · s9_discours1/2/3.params.texte', dP1 + dP2 + dP3],
  ] as [string, string, number][] },
  { k: 'role', n: 'Rôles', items: [
    ['Jim (Jérémy Montier, @wakupjimmy)', '1 comédien, en scène des séquences 3 à 8', 0],
    ['Junon Maréchal, ministre de la Santé mentale', 'comédienne filmée à l’avance : 2 vidéos (live, Zoom)', 0],
    ['Le président Jean Boilot', 'voix radio + photo sur les téléphones', 0],
    ['Écho 2.0', 'l’interface : synthèses scriptées', 0],
    ['Régie', 'tops, modération, validation des synthèses et des ciblés', 0],
    ['Modération', 'file « à valider » des commentaires (séq. 2) et réponses', 0],
    ['Accueil', 'QR, téléphones de prêt, mode calme', 0],
  ] as [string, string, number][] },
];

const fichier = { format: 'studio-real/conducteur@1', project: projet, assets, runs: [] };
// vérifications
for (const md of moments) for (const s of md.m.st) {
  const sc = s.params?.sortie as Record<string, unknown> | string | undefined;
  if (sc && typeof sc === 'object') for (const c of ['titre', 'sousTitre']) if (typeof sc[c] === 'string' && (sc[c] as string).length > 600) throw new Error('trop long ' + s.id);
  if (sc && typeof sc === 'object' && typeof sc.surtitre === 'string' && sc.surtitre.length > 400) throw new Error('surtitre ' + s.id);
}
const nomsAssets = new Set(assets.flatMap(a => a.items.map(i => i[0])));
for (const md of moments) for (const s of md.m.st) {
  if (s.asset && !nomsAssets.has(s.asset)) throw new Error('asset absent du catalogue : ' + s.asset);
  const sc = s.params?.sortie as Record<string, unknown> | undefined;
  if (sc && typeof sc === 'object' && sc.type === 'video' && !nomsAssets.has(String(sc.asset))) throw new Error('vidéo absente : ' + sc.asset);
}
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

// rapport
console.log('problèmes :', pb.length, pb.map(p => p.niveau + ' ' + p.message));
const nSt = moments.reduce((a, m) => a + m.m.st.length, 0), nTr = moments.reduce((a, m) => a + m.m.tr.length, 0);
console.log(`moments ${moments.length} · étapes ${nSt} · sorties ${nTr} · catalogue ${assets.reduce((a, c) => a + c.items.length, 0)} · clips vidéo ${clips.video.length} tel ${clips.tel.length} son ${clips.son.length} lx ${clips.lx.length} txt ${clips.txt.length}`);
for (const mp of plan.moments) console.log(mp.id.padEnd(8), formatMMSS(mp.fin - mp.debut), mp.passage?.mode ?? '');
console.log('total', formatMMSS(plan.total), '· followers fin', followers, '· fil', dureeFil, 's', poidsFil, 'Mo · live', dLive, '· zoom', dZoom, '· prés', dP1, dP2, dP3);
