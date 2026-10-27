// Simule le téléphone du comédien : envoie un WAV (16 kHz, mono, 16 bits) en temps réel par trames de 100 ms
// sur /ws, comme la page comédien en mode Whisper, puis affiche transcription et répliques de figurants.
//   node test-micro-serveur.mjs <fichier.wav> [ws://localhost:8788/ws] [jeton-régie]
import fs from 'node:fs';
import WebSocket from 'ws';

const [fichier, url = 'ws://localhost:8788/ws', jeton] = process.argv.slice(2);
const wav = fs.readFileSync(fichier);
const pcm = wav.subarray(44);                                     // en-tête WAV standard de 44 octets
const silence = Buffer.alloc(16000 * 2 * 1.5);                    // 1,5 s de silence à la fin : déclenche le final
const audio = Buffer.concat([pcm, silence]);

const regie = new WebSocket(url);
const t0 = { debut: 0, finVoix: 0 };
regie.on('open', () => regie.send(JSON.stringify({ t: 'hello', role: 'regie', jeton, tc: Date.now() })));
regie.on('message', (b) => {
  const m = JSON.parse(b);
  const dt = t0.finVoix ? `${((Date.now() - t0.finVoix) / 1000).toFixed(1)} s après la fin de la voix` : '';
  if (m.t === 'asr') console.log(`asr ${m.kind.padEnd(7)} ${dt.padEnd(28)} « ${m.texte} »`);
  if (m.t === 'chat' && m.origine === 'N2') console.log(`N2      ${dt.padEnd(28)} ${m.pseudo} : ${m.texte}`);
});

const com = new WebSocket(url);
await new Promise((r) => com.on('open', r));
com.send(JSON.stringify({ t: 'hello', role: 'comedien', tc: Date.now() }));
await new Promise((r) => setTimeout(r, 800));
t0.debut = Date.now();
const TRAME = 3200;                                               // 100 ms
for (let i = 0; i < audio.length; i += TRAME) {
  com.send(audio.subarray(i, i + TRAME));
  if (i >= pcm.length && !t0.finVoix) t0.finVoix = Date.now();
  await new Promise((r) => setTimeout(r, 100));
}
await new Promise((r) => setTimeout(r, 9000));
regie.close(); com.close();
