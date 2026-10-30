#!/usr/bin/env node
// Banc de charge vidéo : N clients tirent le même fichier comme Safari (HEAD, Range bytes=0-1, puis plages successives).
// Aucune dépendance (Node >= 20 : fetch, node:perf_hooks). Aucune adresse par défaut : --cible est obligatoire.
import { performance } from 'node:perf_hooks';
import { resume, debitMbps, arrondi } from './stats.mjs';

const USAGE = `Usage : node outils/banc-media/charge.mjs --cible <url> [options]

  --cible <url>       OBLIGATOIRE. Adresse du fichier vidéo à tirer (aucune valeur par défaut).
  --clients <n>       Nombre de clients simultanés (défaut 50).
  --duree <s>         Durée maximale en secondes (défaut 60). Les requêtes en cours sont coupées à l'échéance.
  --plage <octets>    Taille de chaque plage Range (défaut 1048576 = 1 Mio).
  --etalement <s>     Secondes sur lesquelles les démarrages sont répartis (défaut 0 = tous au même instant, comme un top).
  --aide              Affiche cet usage et quitte (code 0).

Chaque client : HEAD, puis GET « Range: bytes=0-1 », puis des plages successives de --plage octets jusqu'à la fin du
fichier ou jusqu'à --duree secondes. Un 429, un 5xx ou une erreur réseau est compté puis la plage est redemandée
après une courte attente (Retry-After si présent, sinon 500 ms).
Sortie : résumé JSON sur stdout, tableau lisible sur stderr. Code de sortie 0 (2 si les arguments sont invalides).`;

function echec(message) {
  console.error(`Erreur : ${message}\n\n${USAGE}`);
  process.exit(2);
}

function lireArguments(argv) {
  const opts = { clients: 50, duree: 60, plage: 1048576, etalement: 0, cible: null };
  const entiers = { '--clients': ['clients', 1], '--plage': ['plage', 1] };
  const reels = { '--duree': ['duree', 0.001], '--etalement': ['etalement', 0] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--aide' || a === '-h' || a === '--help') { console.log(USAGE); process.exit(0); }
    const egal = a.indexOf('=');
    const nom = egal > 0 ? a.slice(0, egal) : a;
    if (nom !== '--cible' && !(nom in entiers) && !(nom in reels)) echec(`option inconnue : ${a}`);
    const valeur = egal > 0 ? a.slice(egal + 1) : argv[++i];
    if (valeur === undefined) echec(`${nom} attend une valeur`);
    if (nom === '--cible') { opts.cible = valeur; continue; }
    const n = Number(valeur);
    const [cle, minimum] = entiers[nom] ?? reels[nom];
    if (!Number.isFinite(n) || n < minimum || (nom in entiers && !Number.isInteger(n))) echec(`${nom} invalide : « ${valeur} »`);
    opts[cle] = n;
  }
  if (!opts.cible) echec("--cible obligatoire (aucune adresse par défaut : le script ne frappe jamais une adresse qu'on ne lui a pas donnée)");
  try {
    const u = new URL(opts.cible);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocole');
  } catch {
    echec(`--cible n'est pas une URL http(s) valide : « ${opts.cible} »`);
  }
  return opts;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
/** Dort ms millisecondes, ou moins si le signal d'arrêt tombe (l'échéance ne doit pas attendre les départs étalés). */
const dormirJusqua = (ms, signal) => new Promise((r) => {
  if (signal.aborted) return r();
  const t = setTimeout(r, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true });
});

/** Attente avant de redemander : Retry-After si présent (borné à 5 s), sinon 500 ms. */
function attente(r) {
  const ra = Number(r.entetes?.get('retry-after'));
  return Number.isFinite(ra) && ra > 0 ? Math.min(ra, 5) * 1000 : 500;
}

/** Une requête mesurée. Renvoie {methode, statut, ttfb, duree, octets, entetes, erreur, interrompu}. */
async function requete(url, methode, plageEntete, arret) {
  const t0 = performance.now();
  const r = { methode, statut: 0, ttfb: null, duree: null, octets: 0, entetes: null, erreur: null, interrompu: false };
  try {
    const headers = plageEntete ? { Range: plageEntete } : {};
    const rep = await fetch(url, { method: methode, headers, signal: arret, redirect: 'follow' });
    r.statut = rep.status;
    r.entetes = rep.headers;
    if (rep.body) {
      const lecteur = rep.body.getReader();
      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        if (r.ttfb === null && value.length > 0) r.ttfb = performance.now() - t0;
        r.octets += value.length;
      }
    }
    // Sans corps (HEAD, 429 vide...) : le « premier octet » est l'arrivée des en-têtes.
    if (r.ttfb === null) r.ttfb = performance.now() - t0;
  } catch (e) {
    if (arret.aborted) r.interrompu = true;
    else r.erreur = e?.cause?.code ?? e?.cause?.errors?.[0]?.code ?? e?.code ?? e?.name ?? String(e);
  }
  r.duree = performance.now() - t0;
  return r;
}

async function lancer(opts) {
  const { cible, clients, duree, plage, etalement } = opts;
  const echeance = new AbortController();
  const debutGlobal = performance.now();
  const minuteur = setTimeout(() => echeance.abort(), duree * 1000);
  const mesures = [];        // toutes les requêtes terminées (hors interrompues à l'échéance)
  const premiersOctets = []; // par client : du démarrage au 1er octet du GET bytes=0-1
  let clientsFinis = 0, interrompues = 0, octetsTotal = 0;

  function noter(r, client) {
    octetsTotal += r.octets;
    if (r.interrompu) { interrompues++; return; }
    mesures.push({ client, methode: r.methode, statut: r.statut, ttfb: r.ttfb, duree: r.duree, octets: r.octets, erreur: r.erreur });
  }

  async function unClient(i) {
    await dormirJusqua(etalement > 0 ? (etalement * 1000 * i) / clients : 0, echeance.signal);
    if (echeance.signal.aborted) return;
    const debut = performance.now();
    let total = null;

    const tete = await requete(cible, 'HEAD', null, echeance.signal);
    noter(tete, i);
    const cl = tete.entetes?.get('content-length');
    if (cl) total = Number(cl);

    // Sonde de Safari : bytes=0-1 (redemandée tant que le serveur répond 429/5xx/erreur)
    while (!echeance.signal.aborted) {
      const sonde = await requete(cible, 'GET', 'bytes=0-1', echeance.signal);
      noter(sonde, i);
      if (sonde.interrompu) return;
      if (sonde.statut === 206 || sonde.statut === 200) {
        premiersOctets.push(performance.now() - debut - (sonde.duree - sonde.ttfb));
        const cr = sonde.entetes?.get('content-range')?.match(/\/(\d+)\s*$/);
        if (cr) total = Number(cr[1]);
        if (sonde.statut === 200 && sonde.octets > 2) { clientsFinis++; return; } // serveur sans Range : tout est déjà venu
        break;
      }
      await dormir(attente(sonde));
    }

    // Plages successives, depuis le début du fichier
    let decalage = 0;
    while (!echeance.signal.aborted) {
      if (total !== null && decalage >= total) { clientsFinis++; return; }
      const fin = total !== null ? Math.min(decalage + plage - 1, total - 1) : decalage + plage - 1;
      const r = await requete(cible, 'GET', `bytes=${decalage}-${fin}`, echeance.signal);
      noter(r, i);
      if (r.interrompu) return;
      if (r.statut === 206) {
        decalage += r.octets > 0 ? r.octets : plage;
        if (total === null && r.octets < fin - decalage + r.octets + 1) { clientsFinis++; return; } // plage plus courte que demandée
      } else if (r.statut === 200 || r.statut === 416) {
        clientsFinis++; return; // fichier entier renvoyé, ou décalage hors fichier
      } else {
        await dormir(attente(r)); // 429, 5xx, erreur réseau : on redemande la même plage
      }
    }
  }

  await Promise.all(Array.from({ length: clients }, (_, i) => unClient(i)));
  clearTimeout(minuteur);
  const dureeTotale = (performance.now() - debutGlobal) / 1000;
  return { mesures, premiersOctets, clientsFinis, interrompues, octetsTotal, dureeTotale };
}

function synthese(opts, res) {
  const { mesures } = res;
  const compte = {
    ok_2xx_206: mesures.filter((m) => m.statut >= 200 && m.statut < 300).length,
    http_429: mesures.filter((m) => m.statut === 429).length,
    http_5xx: mesures.filter((m) => m.statut >= 500).length,
    autres_4xx: mesures.filter((m) => m.statut >= 400 && m.statut < 500 && m.statut !== 429).length,
    erreurs_reseau: mesures.filter((m) => m.erreur !== null).length,
    interrompues_a_l_echeance: res.interrompues,
  };
  const arr = (s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'n' ? v : arrondi(v, 1)]));
  const erreursParCode = {};
  for (const m of mesures) if (m.erreur) erreursParCode[m.erreur] = (erreursParCode[m.erreur] ?? 0) + 1;
  const debit = debitMbps(res.octetsTotal, res.dureeTotale);
  return {
    cible: opts.cible,
    parametres: { clients: opts.clients, duree_s: opts.duree, plage_octets: opts.plage, etalement_s: opts.etalement },
    duree_totale_s: arrondi(res.dureeTotale, 2),
    octets_recus: res.octetsTotal,
    debit_total_mbps: arrondi(debit, 2),
    debit_moyen_par_client_mbps: arrondi(debit / opts.clients, 2),
    ttfb_ms: arr(resume(mesures.filter((m) => m.erreur === null).map((m) => m.ttfb))),
    premier_octet_client_ms: arr(resume(res.premiersOctets)),
    requetes: { total: mesures.length, ...compte },
    erreurs_reseau_par_code: erreursParCode,
    clients_ayant_fini_le_fichier: res.clientsFinis,
    clients_total: opts.clients,
  };
}

function tableau(s) {
  const l = (k, v) => `  ${k.padEnd(38)} ${v}`;
  const t = s.ttfb_ms, p = s.premier_octet_client_ms, q = s.requetes;
  return [
    `Banc de charge : ${s.cible}`,
    l('clients / durée max / plage', `${s.parametres.clients} / ${s.parametres.duree_s} s / ${s.parametres.plage_octets} o (étalement ${s.parametres.etalement_s} s)`),
    l('durée totale', `${s.duree_totale_s} s`),
    l('octets reçus', `${s.octets_recus}`),
    l('débit total', `${s.debit_total_mbps} Mb/s (${s.debit_moyen_par_client_mbps} Mb/s par client)`),
    l('TTFB p50 / p95 / max (toutes requêtes)', `${t.p50} / ${t.p95} / ${t.max} ms (n=${t.n})`),
    l('1er octet client p50 / p95 / max', `${p.p50} / ${p.p95} / ${p.max} ms (n=${p.n})`),
    l('requêtes 2xx / 206', q.ok_2xx_206),
    l('429', q.http_429),
    l('5xx', q.http_5xx),
    l('autres 4xx', q.autres_4xx),
    l('erreurs réseau', `${q.erreurs_reseau} ${JSON.stringify(s.erreurs_reseau_par_code)}`),
    l("interrompues à l'échéance", q.interrompues_a_l_echeance),
    l('clients ayant fini le fichier', `${s.clients_ayant_fini_le_fichier} / ${s.clients_total}`),
  ].join('\n');
}

const opts = lireArguments(process.argv.slice(2));
const res = await lancer(opts);
const s = synthese(opts, res);
console.error(tableau(s));
console.log(JSON.stringify(s, null, 2));
