// Page « chat » : ce que verrait le public. Pseudo coloré (jeton CSS reçu) + texte. Pas d'origine.
// ?pops=1 : bulles flottantes simples. ?fond=libre : fond transparent (incrustation).
import { connecter, libelleEtat } from '../commun/ws.js';
import { creerChat } from '../commun/chatvue.js';

const params = new URLSearchParams(location.search);
const pops = params.get('pops') === '1';
if (params.get('fond') === 'libre') document.body.classList.add('fond-libre');

const chat = creerChat(document.getElementById('chat'), { max: 40, pops });
const hors = document.getElementById('horsligne');

connecter({
  role: 'chat',
  onEtat(etat, detail) {
    const ok = etat === 'ouvert';
    hors.hidden = ok;
    if (!ok) hors.textContent = libelleEtat(etat, detail);
  },
  onMessage(m) {
    if (m.t === 'welcome') chat.historique(m.historique);
    else if (m.t === 'chat') chat.ajouter(m);
    else if (m.t === 'media') media(m);
  },
});

// Son de la salle : le mur joue l'audio que la régie lance (discours de Junon). Un navigateur n'autorise le son qu'après
// un premier clic sur la page : le bandeau le demande au chargement.
const audio = new Audio();
audio.preload = 'auto';
const sonOk = document.createElement('button');
sonOk.className = 'ch-son'; sonOk.type = 'button'; sonOk.textContent = '🔊 Cliquer ici pour autoriser le son du mur';
sonOk.addEventListener('click', () => { audio.muted = true; audio.play().catch(() => undefined).finally(() => { audio.pause(); audio.muted = false; }); sonOk.remove(); });
document.body.appendChild(sonOk);
function media(m) {
  if (m.action === 'stop') { audio.pause(); return; }
  if (m.action === 'play' && m.src) { audio.src = m.src; audio.currentTime = 0; audio.play().catch(() => { sonOk.textContent = '🔊 SON BLOQUÉ : cliquer ici'; if (!sonOk.isConnected) document.body.appendChild(sonOk); }); }
}
