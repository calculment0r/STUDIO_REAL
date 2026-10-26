// Lit un journal JSONL et sort le tableau des latences (p50/p95/p99 par étape et par fournisseur),
// le taux de rejet et la part de quasi-doublons (étude §10.3).
// Usage : node mesures.mjs [fichier.jsonl | dossier]   (défaut : le journal le plus récent de serveur/journaux/)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { percentile } from './util.mjs';
import { quasiDoublon, cleTexte } from './figurants/similarite.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));

export function lireJournal(cible) {
  let fichiers = [];
  const st = fs.statSync(cible);
  if (st.isDirectory()) fichiers = fs.readdirSync(cible).filter((f) => f.endsWith('.jsonl')).sort().map((f) => path.join(cible, f));
  else fichiers = [cible];
  const evts = [];
  for (const f of fichiers) for (const l of fs.readFileSync(f, 'utf8').split('\n')) { if (!l.trim()) continue; try { evts.push(JSON.parse(l)); } catch { /* ligne cassée */ } }
  return evts;
}

const ETAPES = ['asr_decision', 'premier_jeton', 'ligne', 'filtre', 'pret', 'attente', 'total'];

export function analyser(evts) {
  const groupes = {};       // `${niveau}/${fournisseur}` → étape → valeurs
  const aff = evts.filter((e) => e.e === 'affiche');
  const fig = aff.filter((e) => e.origine !== 'humain');
  for (const e of fig) {
    const g = `${e.origine}/${e.fournisseur || '?'}`;
    for (const k of ETAPES) if (Number.isFinite(e.lat?.[k])) ((groupes[g] ||= {})[k] ||= []).push(e.lat[k]);
  }
  // première réplique N2 après chaque question au chat (critère go : p50 ≤ 3 s, p95 ≤ 5 s)
  const premiere = {};
  const vus = new Set();
  for (const e of fig) {
    if (e.origine !== 'N2' || !e.t?.asr) continue;
    const k = `${e.fournisseur}:${e.t.asr}`;
    if (vus.has(k)) continue;
    vus.add(k);
    (premiere[e.fournisseur] ||= []).push(e.lat.total);
  }
  const appels = {};
  for (const e of evts.filter((x) => x.e === 'n2_appel')) {
    const g = `${e.fournisseur}${e.mode ? '/' + e.mode : ''}`;
    const a = (appels[g] ||= { n: 0, premier_jeton: [], premiere_ligne: [], fin: [], jetons_entree: 0, jetons_sortie: 0, cout_usd: 0, lignes: 0, demandees: 0 });
    a.n++; a.lignes += e.servis || 0; a.demandees += e.nb || 0;
    if (e.t_premier_jeton) a.premier_jeton.push(e.t_premier_jeton - e.t_requete);
    if (e.t_premiere_ligne) a.premiere_ligne.push(e.t_premiere_ligne - e.t_requete);
    if (e.t_fin) a.fin.push(e.t_fin - e.t_requete);
    a.jetons_entree += e.jetons_entree || 0; a.jetons_sortie += e.jetons_sortie || 0; a.cout_usd += e.cout_usd || 0;
  }
  const rejets = evts.filter((e) => e.e === 'rejet');
  const parRaison = {};
  for (const r of rejets) parRaison[r.raison] = (parRaison[r.raison] || 0) + 1;
  const rejFig = rejets.filter((r) => r.figurant).length;
  const rejHum = rejets.filter((r) => !r.figurant).length;
  const affHum = aff.length - fig.length;
  const doublonsFiltres = evts.filter((e) => e.e === 'doublon').length;
  // quasi-doublons parmi les messages de figurants AFFICHÉS (hors vagues voulues)
  const histo = []; let qd = 0; let base = 0;
  for (const e of fig) {
    if (e.vague) continue;
    base++;
    if (quasiDoublon(e.texte, histo, e.ts)) qd++;
    histo.push({ texte: e.texte, cle: cleTexte(e.texte), ts: e.ts });
  }
  const compte = (t) => evts.filter((e) => e.e === t).length;
  return {
    groupes, premiere, appels,
    rejets: { figurants: rejFig, humains: rejHum, taux_figurants: rejFig / Math.max(1, rejFig + fig.length), taux_humains: rejHum / Math.max(1, rejHum + affHum), par_raison: parRaison },
    doublons: { filtres: doublonsFiltres, part_filtree: doublonsFiltres / Math.max(1, doublonsFiltres + fig.length), affiches: qd, part_affichee: qd / Math.max(1, base) },
    volumes: { affiches: aff.length, figurants: fig.length, humains: affHum, par_origine: fig.reduce((o, e) => ((o[e.origine] = (o[e.origine] || 0) + 1), o), {}) },
    incidents: { perimes: compte('perime'), n2_erreur: compte('n2_erreur'), n2_annule: compte('n2_annule'), disjoncteur: compte('disjoncteur'), lignes_invalides: compte('ligne_invalide') },
  };
}

const ms = (v) => (v == null ? '—' : `${Math.round(v)}`);
const pc = (x) => `${(100 * x).toFixed(1)} %`;
function ligneStats(nom, v) { return `| ${nom} | ${v.length} | ${ms(percentile(v, 50))} | ${ms(percentile(v, 95))} | ${ms(percentile(v, 99))} |`; }

export function formater(a) {
  const out = [];
  out.push('## Latences par étape (ms) — répliques de figurants affichées', '', '| niveau/fournisseur · étape | n | p50 | p95 | p99 |', '|---|---|---|---|---|');
  for (const g of Object.keys(a.groupes).sort()) for (const k of ETAPES) if (a.groupes[g][k]) out.push(ligneStats(`${g} · ${k}`, a.groupes[g][k]));
  out.push('', '## Première réplique N2 après une question / un énoncé (asr → affichage, ms)', '', '| fournisseur | n | p50 | p95 | p99 |', '|---|---|---|---|---|');
  for (const [f, v] of Object.entries(a.premiere)) out.push(ligneStats(f, v));
  out.push('', '## Appels LLM (ms depuis la requête)', '', '| fournisseur · mesure | n | p50 | p95 | p99 |', '|---|---|---|---|---|');
  for (const [f, x] of Object.entries(a.appels)) {
    out.push(ligneStats(`${f} · premier jeton`, x.premier_jeton), ligneStats(`${f} · première ligne`, x.premiere_ligne), ligneStats(`${f} · fin`, x.fin));
  }
  for (const [f, x] of Object.entries(a.appels)) out.push(`- ${f} : ${x.n} appels, ${x.lignes}/${x.demandees} lignes utiles, jetons ${x.jetons_entree} entrée / ${x.jetons_sortie} sortie, coût ${x.cout_usd.toFixed(5)} $`);
  out.push('', '## Filtre et répétition', '');
  out.push(`- rejets figurants : ${a.rejets.figurants} (${pc(a.rejets.taux_figurants)}) · rejets humains : ${a.rejets.humains} (${pc(a.rejets.taux_humains)})`);
  out.push(`- rejets par raison : ${JSON.stringify(a.rejets.par_raison)}`);
  out.push(`- quasi-doublons écartés avant affichage : ${a.doublons.filtres} (${pc(a.doublons.part_filtree)}) · quasi-doublons parmi les affichés (hors vagues) : ${a.doublons.affiches} (${pc(a.doublons.part_affichee)})`);
  out.push(`- volumes : ${JSON.stringify(a.volumes)}`);
  out.push(`- incidents : ${JSON.stringify(a.incidents)}`);
  return out.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let cible = process.argv[2];
  if (!cible) {
    const d = path.join(ICI, 'journaux');
    const f = fs.existsSync(d) ? fs.readdirSync(d).filter((x) => x.endsWith('.jsonl')).sort().pop() : null;
    if (!f) { console.error('aucun journal dans serveur/journaux/'); process.exit(1); }
    cible = path.join(d, f);
  }
  console.log(`# Mesures : ${cible}\n`);
  console.log(formater(analyser(lireJournal(cible))));
}
