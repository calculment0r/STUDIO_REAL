// Banc de pertinence N2 : envoie des phrases du comédien au serveur qui tourne, puis mesure
// combien de répliques N2 reprennent un mot concret de la phrase, et le délai phrase → affichage.
//   node banc-pertinence.mjs [ws://localhost:8787/ws] [jeton-régie]
import WebSocket from 'ws';

const URL = process.argv[2] || 'ws://localhost:8787/ws';
const JETON = process.argv[3];
const PHRASES = [
  'Bon le chat, je vois un chien qui porte une baguette, je le suis ou pas ?',
  'Attendez, la boulangère vient de me donner un gâteau tout vert, je le goûte ?',
  "Il y a un vélo rouge abandonné devant la pharmacie, c'est bizarre non ?",
  "Je viens de marcher dans une flaque énorme, mes chaussettes sont trempées",
  "Bon j'entre dans la librairie ou je continue vers la fontaine",
  'Le chat, vous préférez que je prenne le métro ou que je marche jusqu\'au parc ?',
  "Quelqu'un a laissé un parapluie jaune accroché à l'arbre, je le prends ?",
];
const VIDES = new Set('alors avant avec bien bizarre cette chat comme dans elle encore être faire jusqu laissé mais même mes moins plus pour quelqu quoi sont tout tous très vient viens vous attendez enorme énorme abandonné accroché donner porte prenne préférez'.split(' '));
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const racines = (s) => new Set(norm(s).match(/[a-z]{4,}/g)?.filter((m) => !VIDES.has(m)).map((m) => m.slice(0, 5)) || []);

const ws = new WebSocket(URL);
const n2 = [];
ws.on('message', (b) => {
  const m = JSON.parse(b);
  if (m.t === 'chat' && m.origine === 'N2') n2.push({ texte: m.texte, ts: m.ts, pseudo: m.pseudo });
});
await new Promise((r) => ws.on('open', r));
ws.send(JSON.stringify({ t: 'hello', role: 'regie', jeton: JETON, tc: Date.now() }));
const com = new WebSocket(URL);
await new Promise((r) => com.on('open', r));
com.send(JSON.stringify({ t: 'hello', role: 'comedien', tc: Date.now() }));
await new Promise((r) => setTimeout(r, 1500));

const res = [];
for (const phrase of PHRASES) {
  const debut = Date.now(); const avant = n2.length;
  com.send(JSON.stringify({ t: 'asr', kind: 'final', texte: phrase, tc: Date.now(), tFinPhrase: Date.now() }));
  await new Promise((r) => setTimeout(r, 11000));
  const lignes = n2.slice(avant).filter((l) => l.ts >= debut);
  const cles = racines(phrase);
  for (const l of lignes) {
    const commun = [...racines(l.texte)].filter((x) => cles.has(x));
    res.push({ phrase: phrase.slice(0, 40), texte: l.texte, delai: l.ts - debut, pertinent: commun.length > 0 });
  }
  console.log(`\n« ${phrase} »`);
  for (const l of lignes) console.log(`  ${String(l.ts - debut).padStart(5)} ms  ${l.pseudo}: ${l.texte}`);
  if (!lignes.length) console.log('  (aucune réplique N2)');
}
const d = res.map((r) => r.delai).sort((a, b) => a - b);
const q = (p) => d.length ? d[Math.min(d.length - 1, Math.floor(p * d.length))] : NaN;
const premiers = PHRASES.map((p) => res.filter((r) => r.phrase === p.slice(0, 40))[0]?.delai).filter(Number.isFinite).sort((a, b) => a - b);
console.log(`\nRÉSUMÉ : ${res.length} répliques N2 · pertinentes (reprennent un mot de la phrase) : ${res.filter((r) => r.pertinent).length}/${res.length}`
  + ` · délai médian ${q(0.5)} ms · p90 ${q(0.9)} ms · 1re réplique médiane ${premiers[Math.floor(premiers.length / 2)] ?? '—'} ms`);
ws.close(); com.close();
