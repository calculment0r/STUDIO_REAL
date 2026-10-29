// Répétition technique scriptée : N faux spectateurs (l'émulateur, packages/emulateur) se connectent par WebSocket au VRAI
// serveur de spectacle et jouent un scénario horodaté (GO, votes, messages, coupures…). Le script mesure ce que la salle
// vit (accusés d'affichage, reconnexions, refus, débit) et ce que coûte le serveur (CPU, mémoire), puis juge des seuils
// chiffrés. Audit 2026-10, rapport 5 §4.8. Mode d'emploi : outils/repetition/LISEZMOI.md.
//
//   node --import tsx outils/repetition/repetition.ts --scenario outils/repetition/scenario-echo.json
//   node --import tsx outils/repetition/repetition.ts --scenario … --cible ws://localhost:8790/ws --secrets exploitation/spectacle.secrets.json
//
// Sortie : tableau lisible sur stderr, rapport JSON sur stdout (ou --sortie fichier).
// Codes : 0 seuils tenus · 1 un seuil est dépassé · 2 arguments invalides · 3 la répétition n'a pas pu avoir lieu.
import { fork, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { chargerFichier } from '@studio-real/modele';
import { NOMS_MELANGES, creerEmulateur, type EmulateurReel } from '@studio-real/emulateur';
import {
  ErreurScenario, appliquerReglages, etapesJouables, evaluerSeuils, libelleEtape, lireScenario,
  type EtapeScenario, type Scenario, type Verdict,
} from './scenario';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROJET_PAR_DEFAUT = 'projets/echo/echo.conducteur.json';

const USAGE = `Usage : node --import tsx outils/repetition/repetition.ts --scenario <fichier.json> [options]

  --scenario <fichier>   OBLIGATOIRE. Le scénario (voir outils/repetition/scenario-echo.json).
  --cible <ws://…/ws>    Serveur de spectacle à éprouver. Sans --cible, le script démarre son propre serveur (processus
                         enfant, port libre, jetons jetables, projet Écho) et l'arrête à la fin.
  --jeton <jeton>        Avec --cible : jeton du rôle « acteur » (les téléphones). Ou REPETITION_JETON.
  --jeton-regie <jeton>  Avec --cible : jeton du rôle « regie » (les GO). Ou REPETITION_JETON_REGIE.
  --secrets <fichier>    Avec --cible : lit les deux jetons dans exploitation/spectacle.secrets.json (jamais affichés).
  --telephones <n>       Nombre de téléphones (défaut : celui du scénario, 150 pour Écho).
  --melange <nom>        Mélange de profils : ${NOMS_MELANGES.join(', ')} (défaut : celui du scénario).
  --duree <s>            Durée de la répétition en secondes ; les étapes au-delà sont ignorées (défaut : celle du scénario).
  --projet <fichier>     Projet joué par le serveur (défaut ${PROJET_PAR_DEFAUT}) ; avec --cible, celui du serveur visé.
  --sortie <fichier>     Écrit le rapport JSON dans ce fichier au lieu de stdout.
  --aide                 Affiche cet usage et quitte (code 0).

Les téléphones se connectent tous depuis CE poste : sur un poste faible, le générateur peut devenir le goulot (le rapport
donne son CPU et le retard de sa boucle d'événements pour le dire).
Sortie : tableau lisible sur stderr, rapport JSON sur stdout. Codes : 0 seuils tenus · 1 seuil dépassé · 2 arguments
invalides · 3 répétition impossible (serveur injoignable, jeton refusé…).`;

class ErreurArguments extends Error {}
class ErreurRepetition extends Error {}

interface Options {
  scenario: string;
  cible: string | null;
  jeton: string | null;
  jetonRegie: string | null;
  secrets: string | null;
  telephones: number | undefined;
  melange: string | undefined;
  duree: number | undefined;
  projet: string;
  sortie: string | null;
}

function lireArguments(argv: string[], env: NodeJS.ProcessEnv = process.env): Options | 'aide' {
  const o: Options = {
    scenario: '', cible: null, jeton: env.REPETITION_JETON ?? null, jetonRegie: env.REPETITION_JETON_REGIE ?? null,
    secrets: null, telephones: undefined, melange: undefined, duree: undefined, projet: PROJET_PAR_DEFAUT, sortie: null,
  };
  const textes = new Set(['--scenario', '--cible', '--jeton', '--jeton-regie', '--secrets', '--melange', '--projet', '--sortie']);
  const nombres = new Set(['--telephones', '--duree']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--aide' || a === '-h' || a === '--help') return 'aide';
    const egal = a.indexOf('=');
    const nom = egal > 0 ? a.slice(0, egal) : a;
    if (!textes.has(nom) && !nombres.has(nom)) throw new ErreurArguments(`option inconnue : ${a}`);
    const valeur = egal > 0 ? a.slice(egal + 1) : argv[++i];
    if (valeur === undefined || valeur === '') throw new ErreurArguments(`${nom} attend une valeur`);
    if (nombres.has(nom)) {
      const n = Number(valeur);
      if (!Number.isFinite(n) || n <= 0 || (nom === '--telephones' && !Number.isInteger(n))) throw new ErreurArguments(`${nom} invalide : « ${valeur} »`);
      if (nom === '--telephones') o.telephones = n; else o.duree = n;
      continue;
    }
    switch (nom) {
      case '--scenario': o.scenario = valeur; break;
      case '--cible': o.cible = valeur; break;
      case '--jeton': o.jeton = valeur; break;
      case '--jeton-regie': o.jetonRegie = valeur; break;
      case '--secrets': o.secrets = valeur; break;
      case '--melange': o.melange = valeur; break;
      case '--projet': o.projet = valeur; break;
      case '--sortie': o.sortie = valeur; break;
    }
  }
  if (!o.scenario) throw new ErreurArguments('--scenario obligatoire');
  if (o.melange !== undefined && !NOMS_MELANGES.includes(o.melange)) throw new ErreurArguments(`--melange inconnu : « ${o.melange} » (connus : ${NOMS_MELANGES.join(', ')})`);
  if (o.cible) {
    try {
      const u = new URL(o.cible);
      if (u.protocol !== 'ws:' && u.protocol !== 'wss:') throw new Error('protocole');
    } catch {
      throw new ErreurArguments(`--cible n'est pas une adresse WebSocket valide (ws://hôte:port/ws ou wss://…) : « ${o.cible} »`);
    }
    if (o.secrets) {
      let brut: { jetons?: Record<string, unknown> };
      try { brut = JSON.parse(readFileSync(resolve(o.secrets), 'utf8')); } catch (e) { throw new ErreurArguments(`--secrets illisible (${o.secrets}) : ${(e as Error).message}`); }
      const lire = (r: string) => (typeof brut.jetons?.[r] === 'string' ? (brut.jetons[r] as string) : null);
      o.jeton = o.jeton ?? lire('acteur');
      o.jetonRegie = o.jetonRegie ?? lire('regie');
    }
    if (!o.jeton) throw new ErreurArguments('avec --cible, le jeton « acteur » est obligatoire (--jeton, --secrets ou REPETITION_JETON)');
  } else if (o.jeton || o.jetonRegie || o.secrets) {
    throw new ErreurArguments('--jeton, --jeton-regie et --secrets n’ont de sens qu’avec --cible (sans cible, le serveur local a ses propres jetons jetables)');
  }
  return o;
}

// ── Mesures de processus (serveur enfant, générateur) ───────────────────────────────────────────────────────────

interface Echantillon { ts: number; cpuUs: number; rss: number; heap: number }

function resumeProcessus(e: Echantillon[]) {
  if (e.length < 2) return null;
  const mo = (x: number) => Math.round((x / 1048576) * 10) / 10;
  let pic = 0;
  for (let i = 1; i < e.length; i++) {
    const dt = e[i]!.ts - e[i - 1]!.ts;
    if (dt > 200) pic = Math.max(pic, ((e[i]!.cpuUs - e[i - 1]!.cpuUs) / 1000 / dt) * 100);
  }
  const premier = e[0]!, dernier = e[e.length - 1]!;
  const moyenne = ((dernier.cpuUs - premier.cpuUs) / 1000 / Math.max(1, dernier.ts - premier.ts)) * 100;
  return {
    cpuMoyenPct: Math.round(moyenne), cpuPicPct: Math.round(pic),
    rssMaxMo: mo(Math.max(...e.map(x => x.rss))), heapMaxMo: mo(Math.max(...e.map(x => x.heap))), echantillons: e.length,
  };
}

interface ServeurLocal {
  url: string;
  jetons: { regie: string; acteur: string; agent: string };
  echantillons: Echantillon[];
  arreter(): Promise<void>;
}

/** Démarre le serveur de spectacle dans un processus enfant et attend son annonce (port, jetons). */
async function demarrerServeurLocal(projet: string): Promise<ServeurLocal> {
  const enfant: ChildProcess = fork(resolve(RACINE, 'outils', 'repetition', 'serveur-local.ts'), [], {
    execArgv: ['--import', import.meta.resolve('tsx')],
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    env: { ...process.env, REPETITION_PROJET: projet },
  });
  const echantillons: Echantillon[] = [];
  const pret = await new Promise<{ port: number; jetons: ServeurLocal['jetons'] }>((ok, ko) => {
    const delai = setTimeout(() => ko(new ErreurRepetition('Le serveur local n’a pas démarré en 30 s.')), 30_000);
    enfant.once('exit', code => { clearTimeout(delai); ko(new ErreurRepetition(`Le serveur local s’est arrêté au démarrage (code ${code}).`)); });
    enfant.on('message', (m: { t?: string; port?: number; jetons?: ServeurLocal['jetons']; ts?: number; cpuUs?: number; rss?: number; heap?: number }) => {
      if (m.t === 'pret') { clearTimeout(delai); ok({ port: m.port!, jetons: m.jetons! }); }
      else if (m.t === 'mesure') echantillons.push({ ts: m.ts!, cpuUs: m.cpuUs!, rss: m.rss!, heap: m.heap! });
    });
  });
  const sonde = setInterval(() => { if (enfant.connected) enfant.send({ t: 'mesure' }); }, 1000);
  return {
    url: `ws://127.0.0.1:${pret.port}/ws`, jetons: pret.jetons, echantillons,
    async arreter() {
      clearInterval(sonde);
      if (!enfant.connected) return;
      const fini = new Promise<void>(ok => enfant.once('exit', () => ok()));
      enfant.send({ t: 'arret' });
      const delai = setTimeout(() => enfant.kill(), 10_000);
      await fini;
      clearTimeout(delai);
    },
  };
}

// ── La répétition ───────────────────────────────────────────────────────────────────────────────────────────────

interface EtapeJouee { a: number; reelS: number; faire: string; libelle: string; resultat?: unknown }

const dormir = (ms: number) => new Promise<void>(ok => setTimeout(ok, ms));
const pct = (x: number) => `${Math.round(x * 1000) / 10} %`;

async function jouer(emu: EmulateurReel, sc: Scenario, jouees: EtapeScenario[], progres: (s: number) => void): Promise<EtapeJouee[]> {
  const t0 = Date.now();
  const faites: EtapeJouee[] = [];
  const executer = (e: EtapeScenario): unknown => {
    switch (e.faire) {
      case 'go': { const avant = emu.bilan().lecture; emu.go(); return { momentAvant: avant?.moment ?? null }; }
      case 'attendre': return null;
      case 'vote': return { sollicites: emu.faireVoter({ repartition: e.repartition, dansS: e.dansS, part: e.part }) };
      case 'ecrire': return { auteurs: emu.faireEcrire({ textes: 'banque', parMinute: e.parMinute, dureeS: e.dureeS, part: e.part }) };
      case 'toucher': return { sollicites: emu.faireToucher({ selecteur: e.selecteur, dansS: e.dansS, part: e.part }) };
      case 'coupure': return { coupes: emu.coupure({ part: e.part, dureeS: e.dureeS }).length };
    }
  };
  const suivantes = [...jouees];
  let dernierProgres = 0;
  for (;;) {
    const s = (Date.now() - t0) / 1000;
    if (s >= sc.duree) break;
    while (suivantes.length && suivantes[0]!.a <= s) {
      const e = suivantes.shift()!;
      faites.push({ a: e.a, reelS: Math.round(s * 10) / 10, faire: e.faire, libelle: libelleEtape(e), resultat: executer(e) });
    }
    if (s - dernierProgres >= 10) { dernierProgres = s; progres(s); }
    const prochaine = suivantes[0] ? suivantes[0].a * 1000 - (Date.now() - t0) : Infinity;
    await dormir(Math.max(5, Math.min(100, prochaine, sc.duree * 1000 - (Date.now() - t0))));
  }
  return faites;
}

function tableau(r: Rapport): string {
  const m = r.mesures;
  const l: string[] = [];
  const t = (s: string) => l.push(s);
  t('');
  t(`Répétition technique · « ${r.scenario.nom} »`);
  t(`  ${r.parametres.telephones} téléphones (mélange ${r.parametres.melange}) · ${r.duree.reelleS} s sur ${r.duree.voulueS} s voulues · cible ${r.cible.url}${r.cible.locale ? ' (serveur local)' : ''}`);
  t('');
  t('Salle à la fin');
  t(`  arrivés ${r.salle.arrives}/${r.salle.population} · en ligne ${r.salle.connectes} · hors ligne ${r.salle.horsLigne} · écrans : ${Object.entries(r.salle.parEcran).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}`);
  t('');
  t(`Accusés d'affichage (de la vue du serveur à l'accusé, ${m.accuses.n} mesures)`);
  t(`  p50 ${m.accuses.p50} ms · p95 ${m.accuses.p95} ms · max ${m.accuses.max} ms · sous 1 s : ${pct(m.accuses.partA1s)} · sous 2 s : ${pct(m.accuses.partA2s)}`);
  t(`  délai moyen vue → accusé côté téléphone : ${m.delaiVueAccuse.moyenneMs} ms (p95 ${m.delaiVueAccuse.p95Ms} ms)`);
  t('');
  t('Connexions');
  t(`  premières connexions ${m.connexions} · lignes perdues ${m.reconnexions.pertes} · reconnexions réussies ${m.reconnexions.reussies} · ratées ${m.reconnexions.ratees} · en cours ${m.reconnexions.enCours}`);
  t(`  délai de reconnexion : p50 ${m.reconnexions.delaiP50Ms} ms · p95 ${m.reconnexions.delaiP95Ms} ms · max ${m.reconnexions.delaiMaxMs} ms`);
  t('');
  t('Serveur : réponses et refus');
  t(`  ack ok ${m.acks.ok} · doublon ${m.acks.doublon} · refus ${m.acks.refus} · fermé ${m.acks.ferme}`);
  t(`  refus inattendus ${m.refus.total}${m.refus.total ? ` (${Object.entries(m.refus.parCode).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''} · refus d'envois tardifs (livrés après une coupure, normaux) ${m.refus.tardifs}`);
  for (const e of m.refus.exemples.slice(0, 5)) t(`    ${e}`);
  t(`  entrées acceptées : votes ${m.entrees.vote} · messages ${m.entrees.texte} · prêts ${m.entrees.pret} · autres ${m.entrees.autres}`);
  t('');
  t('Débit (reçu par tous les téléphones et la régie)');
  t(`  ${m.messages.recus} messages (${m.messages.parSecondeMoyenne}/s en moyenne, pic ${m.messages.parSecondePic}/s) · ${Math.round(m.messages.octetsRecus / 1024)} Kio (${Math.round(m.messages.octetsRecusParS / 1024 * 10) / 10} Kio/s)`);
  t(`  lecture reçue par la régie : ${m.lecture.n} messages · moyenne ${m.lecture.moyenneOctets} o · maximum ${m.lecture.maxOctets} o · ${m.lecture.octetsParS} o/s`);
  t('');
  t('Ressources');
  const sv = r.serveur;
  t(sv.mesure ? `  serveur : CPU moyen ${sv.cpuMoyenPct} % (pic ${sv.cpuPicPct} %, 100 % = un cœur) · mémoire max ${sv.rssMaxMo} Mo (tas ${sv.heapMaxMo} Mo)` : `  serveur : non mesuré (${sv.raison})`);
  const g = r.generateur;
  t(`  générateur (ce script) : ${g.cpuMoyenPct !== null ? `CPU moyen ${g.cpuMoyenPct} % (pic ${g.cpuPicPct} %)` : 'CPU non mesuré'} · mémoire max ${g.rssMaxMo ?? '?'} Mo · retard de boucle p99 ${g.retardBoucleP99Ms} ms (max ${g.retardBoucleMaxMs} ms)`);
  if (g.retardBoucleP99Ms > 200) t('  ATTENTION : le générateur est saturé (boucle en retard) ; les latences mesurées sont pessimistes.');
  t('');
  t(`Étapes jouées : ${r.etapes.length}${r.etapesIgnorees.length ? ` · ignorées (après la durée) : ${r.etapesIgnorees.length}` : ''}`);
  for (const e of r.etapes) t(`  +${String(e.reelS).padStart(5)} s  ${e.libelle}${e.resultat ? ` → ${JSON.stringify(e.resultat)}` : ''}`);
  t('');
  t(`Seuils : p95 des accusés ≤ ${r.seuils.definis.p95AckMs} ms · refus ≤ ${r.seuils.definis.refus} · reconnexions ratées ≤ ${r.seuils.definis.reconnexionsRatees}`);
  t(r.seuils.ok ? '  RÉSULTAT : TENUS' : `  RÉSULTAT : DÉPASSÉS\n${r.seuils.depassements.map(d => `    - ${d}`).join('\n')}`);
  t('');
  return l.join('\n');
}

interface Rapport {
  format: 'studio-real/repetition@1';
  date: string;
  scenario: { nom: string; fichier: string };
  cible: { url: string; locale: boolean };
  parametres: { telephones: number; melange: string; graine: number; arriveesSurS: number };
  duree: { voulueS: number; reelleS: number };
  salle: { population: number; arrives: number; connectes: number; horsLigne: number; parEcran: Record<string, number> };
  mesures: ReturnType<EmulateurReel['mesures']>;
  serveur: { mesure: true; cpuMoyenPct: number; cpuPicPct: number; rssMaxMo: number; heapMaxMo: number; echantillons: number } | { mesure: false; raison: string };
  generateur: { cpuMoyenPct: number | null; cpuPicPct: number | null; rssMaxMo: number | null; retardBoucleP99Ms: number; retardBoucleMaxMs: number };
  etapes: EtapeJouee[];
  etapesIgnorees: string[];
  seuils: Verdict & { definis: Scenario['seuils']; constates: { p95AckMs: number; refus: number; reconnexionsRatees: number; accuses: number } };
}

async function repetition(o: Options): Promise<{ rapport: Rapport; verdict: Verdict }> {
  let texte: string;
  try { texte = readFileSync(resolve(o.scenario), 'utf8'); } catch (e) { throw new ErreurArguments(`scénario illisible (${o.scenario}) : ${(e as Error).message}`); }
  const reglages = { ...(o.telephones !== undefined ? { telephones: o.telephones } : {}), ...(o.melange !== undefined ? { melange: o.melange } : {}), ...(o.duree !== undefined ? { duree: o.duree } : {}) };
  let sc: Scenario;
  try { sc = appliquerReglages(lireScenario(texte), reglages); } catch (e) {
    if (e instanceof ErreurScenario) throw new ErreurArguments(`${o.scenario} : ${e.message}`);
    throw e;
  }
  const { jouees, ignorees } = etapesJouables(sc);
  if (jouees.some(e => e.faire === 'go') && o.cible && !o.jetonRegie) throw new ErreurArguments('le scénario contient des GO : avec --cible, le jeton de la régie est obligatoire (--jeton-regie ou --secrets)');
  const fichierProjet = resolve(RACINE, o.projet);
  if (!existsSync(fichierProjet)) throw new ErreurArguments(`--projet introuvable : ${o.projet}`);
  const projet = chargerFichier(readFileSync(fichierProjet, 'utf8')).project;

  let local: ServeurLocal | null = null;
  let emu: EmulateurReel | null = null;
  const generateur: Echantillon[] = [];
  const retard = monitorEventLoopDelay({ resolution: 20 });
  let sondeGenerateur: ReturnType<typeof setInterval> | null = null;
  try {
    let url: string, jeton: string, jetonRegie: string | undefined;
    if (o.cible) { url = o.cible; jeton = o.jeton!; jetonRegie = o.jetonRegie ?? undefined; }
    else {
      console.error(`Démarrage du serveur de spectacle local (projet ${o.projet})…`);
      local = await demarrerServeurLocal(o.projet);
      url = local.url; jeton = local.jetons.acteur; jetonRegie = local.jetons.regie;
    }
    emu = creerEmulateur({
      projet, graine: sc.graine, population: { nombre: sc.telephones, melange: sc.melange }, arrivees: { surS: sc.arrivees.surS }, auto: sc.auto,
      transport: { url, jeton, ...(jetonRegie ? { jetonRegie } : {}) },
    });
    const echantillon = (): Echantillon => { const c = process.cpuUsage(); const m = process.memoryUsage(); return { ts: Date.now(), cpuUs: c.user + c.system, rss: m.rss, heap: m.heapUsed }; };
    generateur.push(echantillon());
    sondeGenerateur = setInterval(() => generateur.push(echantillon()), 1000);
    retard.enable();
    console.error(`Connexion de ${sc.telephones} téléphones à ${url}… (arrivées sur ${sc.arrivees.surS} s, durée ${sc.duree} s)`);
    try { await emu.demarrer(); } catch (e) { throw new ErreurRepetition((e as Error).message); }
    const debut = Date.now();
    const etapes = await jouer(emu, sc, jouees, s => {
      const b = emu!.bilan(), m = emu!.mesures();
      console.error(`  [${String(Math.round(s)).padStart(4)} s] en ligne ${b.connectes}/${b.population} · accusés p95 ${m.accuses.p95} ms (n=${m.accuses.n}) · refus ${m.refus.total} · reconnexions ${m.reconnexions.reussies}/${m.reconnexions.pertes}`);
    });
    const reelleS = Math.round((Date.now() - debut) / 100) / 10;
    generateur.push(echantillon());
    retard.disable();
    const mesures = emu.mesures();
    if (mesures.refus.fatals > 0 && mesures.connexions === 0) {
      throw new ErreurRepetition(`aucun téléphone n'a pu se connecter : le serveur les refuse (${mesures.refus.exemples[0] ?? 'refus fatal'}). Jeton « acteur » faux ?`);
    }
    const bilan = emu.bilan();
    const verdict = evaluerSeuils(sc.seuils, { p95AckMs: mesures.accuses.p95, accuses: mesures.accuses.n, refus: mesures.refus.total, reconnexionsRatees: mesures.reconnexions.ratees });
    const resSrv = local ? resumeProcessus(local.echantillons) : null;
    const resGen = resumeProcessus(generateur);
    const rapport: Rapport = {
      format: 'studio-real/repetition@1', date: new Date().toISOString(),
      scenario: { nom: sc.nom, fichier: o.scenario },
      cible: { url, locale: local !== null },
      parametres: { telephones: sc.telephones, melange: sc.melange, graine: sc.graine, arriveesSurS: sc.arrivees.surS },
      duree: { voulueS: sc.duree, reelleS },
      salle: { population: bilan.population, arrives: bilan.arrives, connectes: bilan.connectes, horsLigne: bilan.horsLigne, parEcran: bilan.parEcran },
      mesures,
      serveur: local
        ? (resSrv ? { mesure: true, ...resSrv } : { mesure: false, raison: 'trop peu d’échantillons (répétition trop courte)' })
        : { mesure: false, raison: 'serveur distant : le script ne voit pas son processus (regarder /sante et le gestionnaire de tâches de la machine du serveur)' },
      generateur: {
        cpuMoyenPct: resGen?.cpuMoyenPct ?? null, cpuPicPct: resGen?.cpuPicPct ?? null, rssMaxMo: resGen?.rssMaxMo ?? null,
        retardBoucleP99Ms: Math.round(retard.percentile(99) / 1e6), retardBoucleMaxMs: Math.round(retard.max / 1e6),
      },
      etapes,
      etapesIgnorees: ignorees.map(e => `+${e.a} s ${libelleEtape(e)}`),
      seuils: { ...verdict, definis: sc.seuils, constates: { p95AckMs: mesures.accuses.p95, refus: mesures.refus.total, reconnexionsRatees: mesures.reconnexions.ratees, accuses: mesures.accuses.n } },
    };
    return { rapport, verdict };
  } finally {
    if (sondeGenerateur) clearInterval(sondeGenerateur);
    retard.disable();
    try { await emu?.arreter(); } catch { /* déjà arrêté */ }
    await local?.arreter();
  }
}

async function principal(): Promise<number> {
  let o: Options | 'aide';
  try { o = lireArguments(process.argv.slice(2)); } catch (e) {
    console.error(`Erreur : ${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (o === 'aide') { console.log(USAGE); return 0; }
  try {
    const { rapport, verdict } = await repetition(o);
    console.error(tableau(rapport));
    const json = JSON.stringify(rapport, null, 2) + '\n';
    if (o.sortie) { writeFileSync(resolve(o.sortie), json, 'utf8'); console.error(`Rapport JSON écrit dans ${o.sortie}`); } else process.stdout.write(json);
    return verdict.ok ? 0 : 1;
  } catch (e) {
    if (e instanceof ErreurArguments) { console.error(`Erreur : ${e.message}\n\n${USAGE}`); return 2; }
    console.error(`Répétition impossible : ${(e as Error).message}`);
    return 3;
  }
}

process.exitCode = await principal();
// tout est fermé ; si un reliquat tenait encore le processus, on sort au bout de 3 s (sans couper la sortie en cours)
setTimeout(() => process.exit(process.exitCode ?? 0), 3000).unref();
