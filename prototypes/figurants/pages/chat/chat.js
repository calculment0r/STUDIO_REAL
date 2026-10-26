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
  },
});
