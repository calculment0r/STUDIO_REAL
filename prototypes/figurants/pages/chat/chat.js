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
    else if (m.t === 'ecran') { document.getElementById('noir').hidden = m.mode !== 'noir'; document.getElementById('qr').hidden = m.mode !== 'qr'; }
    else if (m.t === 'vote') montrerVote(m);
    else if (m.t === 'vote.pop') pop(m.pseudo);
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

// Vote (questions à Écho) : 1er tap = la question et les 4 réponses en grand, les « @x a voté » qui apparaissent ;
// 2e tap = les pourcentages forcés, la réponse gagnante en avant.
const LETTRES = ['A', 'B', 'C', 'D'];
let voteNum = null;
function montrerVote(m) {
  const sec = document.getElementById('vote');
  if (m.etat === 'ferme' || !m.numero) { sec.hidden = true; voteNum = null; return; }
  sec.hidden = false;
  document.getElementById('voteNum').textContent = m.numero;
  document.getElementById('voteQ').textContent = m.question || '';
  const box = document.getElementById('voteRep');
  if (voteNum !== m.numero) { voteNum = m.numero; document.getElementById('votePops').textContent = ''; }
  const pc = m.pourcents || null;
  const max = pc ? Math.max(...pc) : -1;
  box.textContent = '';
  (m.reponses || []).forEach((r, i) => {
    const l = document.createElement('div'); l.className = 'ch-rep' + (pc && pc[i] === max ? ' gagne' : '') + (pc ? ' revele' : '');
    const b = document.createElement('b'); b.textContent = LETTRES[i] || String(i + 1);
    const t = document.createElement('span'); t.textContent = r;
    const p = document.createElement('em'); p.textContent = pc ? pc[i] + ' %' : '';
    const barre = document.createElement('i'); barre.style.width = pc ? pc[i] + '%' : '0';
    l.append(barre, b, t, p); box.appendChild(l);
  });
}
function pop(pseudo) {
  const box = document.getElementById('votePops');
  const d = document.createElement('span'); d.className = 'ch-pop'; d.textContent = '@' + String(pseudo || '').replace(/^@+/, '') + ' a voté';
  box.prepend(d);
  while (box.children.length > 8) box.lastChild.remove();
}
