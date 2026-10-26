// Test de bout en bout : démarre le serveur sur un port libre, se connecte comme regie + comedien + telephone + chat,
// envoie des asr simulés (questions au chat), un souffleur, un message humain interdit, puis COUPE, et vérifie :
//  - des chat de figurants arrivent ; - le message interdit n'est diffusé à personne ; - l'origine n'est pas visible
//    côté telephone/chat/comedien (marquage masqué) ; - rien de figurant n'arrive après COUPE ; - idempotence du cseq ;
//  - la régie reçoit fig.stat (lat {etape:{p50,p95}}, debit {reel, fig}), asr, journal, fig.attente.
// Usage : node test-bout-en-bout.mjs [banque|ollama|tous]   (défaut : tous = banque, puis ollama si OLLAMA_URL répond)

import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { analyser, formater, lireJournal } from './mesures.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODELE = process.env.MODELE_OLLAMA || 'qwen3:8b';
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

function portLibre() {
  return new Promise((ok, ko) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); s.on('error', ko); });
}

async function ollamaJoignable() {
  try {
    const r = await fetch(OLLAMA_URL + '/api/tags', { signal: AbortSignal.timeout(2000) });
    const j = await r.json();
    return (j.models || []).some((m) => m.name === MODELE || m.name === MODELE + ':latest');
  } catch { return false; }
}

function demarrerServeur(port, mode, dossier) {
  return new Promise((ok, ko) => {
    const env = { ...process.env, PORT: String(port), HOTE: '127.0.0.1', FOURNISSEUR: mode, DENSITE: 'normal', JOURNAUX_DIR: dossier, ACCELERATION: '2.5', OLLAMA_URL };
    if (mode !== 'anthropic') delete env.ANTHROPIC_API_KEY;   // le test ne dépense rien
    const p = spawn(process.execPath, [path.join(ICI, 'index.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let sortie = '';
    const minuteur = setTimeout(() => { p.kill(); ko(new Error('serveur non prêt en 90 s :\n' + sortie)); }, 90_000);
    p.stdout.on('data', (d) => { sortie += d; if (sortie.includes('PRET')) { clearTimeout(minuteur); ok(p); } });
    p.stderr.on('data', (d) => { sortie += d; process.stderr.write('[serveur] ' + d); });
    p.on('exit', (c) => { clearTimeout(minuteur); if (!sortie.includes('PRET')) ko(new Error('serveur arrêté (' + c + ') :\n' + sortie)); });
  });
}

function client(port, role, pseudo) {
  return new Promise((ok, ko) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const c = { ws, role, recus: [], cseq: Date.now(), envoyer: (o) => ws.send(JSON.stringify(o)) };
    ws.on('message', (d) => { const m = JSON.parse(d.toString()); m._recu = Date.now(); c.recus.push(m); if (m.t === 'welcome') ok(c); });
    ws.on('open', () => c.envoyer({ t: 'hello', role, pseudo, tc: Date.now() }));
    ws.on('error', ko);
    setTimeout(() => ko(new Error('pas de welcome pour ' + role)), 5000);
  });
}

async function scenario(mode) {
  const port = await portLibre();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), `figurants-test-${mode}-`));
  console.log(`\n=== mode ${mode} · port ${port} · journal ${dossier}`);
  const serveur = await demarrerServeur(port, mode, dossier);
  const echecs = [];
  const verifier = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'ÉCHEC'} ${msg}`); if (!cond) echecs.push(msg); };
  try {
    const regie = await client(port, 'regie');
    const comedien = await client(port, 'comedien');
    const tel = await client(port, 'telephone', 'testeur_1');
    const chat = await client(port, 'chat');
    const w = regie.recus.find((m) => m.t === 'welcome');
    verifier(Array.isArray(w.etat.personas) && w.etat.personas.length > 0 && w.etat.personas.every((p) => p.pid && p.pseudo && /^--/.test(p.couleur)),
      `welcome régie : ${w.etat.personas?.length} personas {pid, pseudo, couleur}`);
    verifier(!tel.recus.find((m) => m.t === 'welcome').etat.personas, 'welcome téléphone : pas de liste de personas');

    regie.envoyer({ t: 'fig.cmd', cmd: { segment: 'boulangerie' } });
    regie.envoyer({ t: 'fig.cmd', cmd: { densite: 'chaud' } });
    await attendre(1500);

    const phrases = [
      ['bon les gars', 'bon les gars vous en pensez', 'bon les gars vous en pensez quoi elle ment la boulangère ou pas'],
      ['dites-moi en commentaire', 'dites-moi en commentaire je prends les chouquettes', 'dites-moi en commentaire je prends les chouquettes ou la religieuse'],
      ['le chat vous croyez', 'le chat vous croyez qu elle va me la vendre', 'le chat vous croyez qu elle va me la vendre cette religieuse'],
    ];
    for (const [p1, p2, fin] of phrases) {
      comedien.envoyer({ t: 'asr', kind: 'partial', texte: p1, tc: Date.now() });
      await attendre(400);
      comedien.envoyer({ t: 'asr', kind: 'partial', texte: p2, tc: Date.now() });
      await attendre(500);
      const tFin = Date.now();
      comedien.envoyer({ t: 'asr', kind: 'final', texte: fin, tc: tFin + 300, tFinPhrase: tFin });
      await attendre(5000);
    }
    regie.envoyer({ t: 'fig.cmd', cmd: { dire: { intention: "lui faire remarquer qu'il a oublié son portefeuille sur le comptoir", nb: 2, validation: false } } });
    // message humain interdit (déguisé), puis un message normal envoyé deux fois avec le même cseq
    tel.envoyer({ t: 'msg', cseq: ++tel.cseq, texte: "t'es qu'un c.o.n.n.a.r.d" });
    tel.envoyer({ t: 'msg', cseq: ++tel.cseq, texte: 'salut tout le monde' });
    tel.envoyer({ t: 'msg', cseq: tel.cseq, texte: 'salut tout le monde' });
    await attendre(5000);
    // souffleur avec validation → fig.attente → fig.valide
    regie.envoyer({ t: 'fig.cmd', cmd: { dire: { intention: 'demander au chef combien coûte la religieuse', nb: 1, validation: true } } });
    let attente = null;
    for (let i = 0; i < 40 && !attente; i++) { await attendre(250); attente = regie.recus.find((m) => m.t === 'fig.attente'); }
    verifier(!!attente, `fig.attente reçu (${attente ? attente.pseudo + ' : « ' + attente.texte + ' »' : 'rien'})`);
    if (attente) regie.envoyer({ t: 'fig.valide', id: attente.id, ok: true });
    regie.envoyer({ t: 'fig.cmd', cmd: { vague: '😂' } });
    await attendre(5000);

    // COUPE
    regie.envoyer({ t: 'fig.cmd', cmd: { coupe: true } });
    let marque = -1;
    for (let i = 0; i < 20 && marque < 0; i++) { await attendre(100); marque = regie.recus.findIndex((m) => m.t === 'journal' && /COUPE/.test(m.ligne)); }
    verifier(marque >= 0, 'journal « COUPE » reçu par la régie');
    const tCoupe = regie.recus[marque]?._recu ?? Date.now();
    comedien.envoyer({ t: 'asr', kind: 'final', texte: 'les gars vous en pensez quoi de cette boulangerie', tc: Date.now() });
    regie.envoyer({ t: 'fig.cmd', cmd: { vague: 'GG' } });
    regie.envoyer({ t: 'fig.cmd', cmd: { relance: true } });
    regie.envoyer({ t: 'msg', cseq: ++regie.cseq, texte: 'je parle pendant la coupe', persona: w.etat.personas[0].pid });
    tel.envoyer({ t: 'msg', cseq: ++tel.cseq, texte: 'toujours là ?' });
    await attendre(7000);

    // ---------------------------------------------------------------- vérifications
    const origine = new Map(regie.recus.filter((m) => m.t === 'chat').map((m) => [m.id, m.origine]));
    const figAvant = regie.recus.filter((m) => m.t === 'chat' && m.origine !== 'humain' && m._recu < tCoupe);
    const parOrigine = figAvant.reduce((o, m) => ((o[m.origine] = (o[m.origine] || 0) + 1), o), {});
    verifier(figAvant.length >= 5, `chats de figurants avant COUPE : ${figAvant.length} ${JSON.stringify(parOrigine)}`);
    const figTel = tel.recus.filter((m) => m.t === 'chat' && origine.get(m.id) && origine.get(m.id) !== 'humain' && m._recu < tCoupe);
    verifier(figTel.length >= 5, `le téléphone reçoit les figurants : ${figTel.length}`);
    if (mode === 'ollama') {
      const n2 = figAvant.filter((m) => m.origine === 'N2' && m.lat?.premier_jeton != null);
      verifier(n2.length >= 1, `répliques N2 générées par Ollama : ${n2.length}`);
      for (const m of n2.slice(0, 6)) console.log(`      N2 ${m.pseudo} : « ${m.texte} » · asr→affiché ${m.lat.total} ms, 1er jeton ${m.lat.premier_jeton} ms, ligne ${m.lat.ligne} ms`);
    }
    const souffleur = figAvant.filter((m) => m.origine === 'souffleur');
    verifier(souffleur.length >= 1, `répliques du souffleur affichées : ${souffleur.length} (${souffleur.map((m) => '« ' + m.texte + ' »').join(', ')})`);
    const tous = [regie, comedien, tel, chat].flatMap((c) => c.recus.filter((m) => m.t === 'chat'));
    verifier(!tous.some((m) => /c\W*o\W*n\W*n\W*a\W*r\W*d/i.test(m.texte)), 'message interdit diffusé à personne');
    for (const c of [tel, chat, comedien]) {
      const fuite = c.recus.filter((m) => m.t === 'chat' && ['origine', 'pid', 'ref', 'lat'].some((k) => k in m));
      verifier(fuite.length === 0, `${c.role} : aucun champ origine/pid/ref/lat (${c.recus.filter((m) => m.t === 'chat').length} chats)`);
    }
    verifier(regie.recus.filter((m) => m.t === 'chat').every((m) => 'origine' in m), 'régie : origine présente sur chaque chat');
    const salut = tel.recus.filter((m) => m.t === 'chat' && m.texte === 'salut tout le monde');
    verifier(salut.length === 1, `idempotence cseq : « salut tout le monde » reçu ${salut.length} fois`);
    const apres = regie.recus.filter((m) => m.t === 'chat' && m._recu > tCoupe && m.origine !== 'humain');
    verifier(apres.length === 0, `aucune réplique de figurant après COUPE (${apres.map((m) => m.origine + ':' + m.texte).join(' | ') || 'aucune'})`);
    const apresTel = tel.recus.filter((m) => m.t === 'chat' && m._recu > tCoupe && origine.get(m.id) !== 'humain');
    verifier(apresTel.length === 0, 'téléphone : aucun figurant après COUPE');
    verifier(tel.recus.some((m) => m.t === 'chat' && m.texte === 'toujours là ?'), 'les humains écrivent toujours pendant la COUPE');
    const stats = regie.recus.filter((m) => m.t === 'fig.stat');
    const st = stats[stats.length - 1];
    verifier(!!st && typeof st.lat === 'object' && st.debit && typeof st.debit.reel === 'number' && typeof st.debit.fig === 'number'
      && Object.values(st.lat).every((v) => 'p50' in v && 'p95' in v), `fig.stat reçus : ${stats.length} (dernier : fournisseur ${st?.fournisseur}, rejets ${st?.rejets}, débit ${JSON.stringify(st?.debit)})`);
    verifier(regie.recus.some((m) => m.t === 'asr' && m.kind === 'final') && comedien.recus.some((m) => m.t === 'asr'), 'écho asr vers régie et comédien');
    verifier(regie.recus.filter((m) => m.t === 'journal').length >= 2, `journal régie : ${regie.recus.filter((m) => m.t === 'journal').length} lignes`);
    verifier(!tel.recus.some((m) => ['fig.stat', 'journal', 'fig.attente', 'asr'].includes(m.t)), 'téléphone : ni télémétrie, ni journal, ni transcription');
    // latences vues par la régie
    const tot = figAvant.filter((m) => m.lat?.total != null).map((m) => m.lat.total).sort((a, b) => a - b);
    if (tot.length) console.log(`      asr→affiché (toutes réactions) : n=${tot.length} p50=${tot[Math.floor(tot.length / 2)]} ms`);
    for (const c of [regie, comedien, tel, chat]) c.ws.close();
  } finally {
    serveur.kill('SIGTERM');
    await attendre(800);
  }
  console.log('\n' + formater(analyser(lireJournal(dossier))));
  return echecs;
}

const mode = process.argv[2] || 'tous';
const modes = mode === 'tous' ? ['banque', 'ollama'] : [mode];
let echecs = [];
for (const m of modes) {
  if (m === 'ollama' && !(await ollamaJoignable())) {
    console.log(`\n=== mode ollama : ${OLLAMA_URL} ne répond pas (ou ${MODELE} absent) : sauté`);
    if (mode === 'ollama') echecs.push('ollama injoignable');
    continue;
  }
  echecs = echecs.concat((await scenario(m)).map((e) => `[${m}] ${e}`));
}
console.log(echecs.length ? `\n${echecs.length} ÉCHEC(S) :\n- ${echecs.join('\n- ')}` : '\nTOUT EST VERT');
process.exit(echecs.length ? 1 : 0);
