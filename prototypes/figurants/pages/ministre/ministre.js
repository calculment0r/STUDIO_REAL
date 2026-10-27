// Téléphone de la ministre (écran de scène, séquence 6) : rôle `ministre`, reçoit les messages `vote` du serveur.
import { connecter, libelleEtat } from '../commun/ws.js';

const $ = (id) => document.getElementById(id);
const LETTRES = ['A', 'B', 'C', 'D'];
const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');

function heure() { $('heure').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
heure(); setInterval(heure, 10_000);

document.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
});

let numeroAffiche = null;
function lignes(nb) {
  const box = $('lignes');
  box.textContent = '';
  for (let i = 0; i < nb; i++) {
    const l = document.createElement('div'); l.className = 'mi-ligne';
    const a = document.createElement('span'); a.className = 'mi-lettre'; a.textContent = LETTRES[i] || String(i + 1);
    const p = document.createElement('div'); p.className = 'mi-piste'; p.appendChild(document.createElement('i'));
    const n = document.createElement('span'); n.className = 'mi-nb'; n.textContent = '0';
    l.append(a, p, n); box.appendChild(l);
  }
}

function montrer(m) {
  const enVote = m.etat === 'compte' || m.etat === 'revele';
  $('veille').hidden = enVote;
  $('vote').hidden = !enVote;
  if (!enVote) { numeroAffiche = null; return; }
  if (m.numero !== numeroAffiche) { numeroAffiche = m.numero; lignes(m.nb || (m.comptes || []).length); }
  $('numero').textContent = m.numero;
  $('question').textContent = m.question || '';
  const c = m.comptes || [];
  const max = Math.max(1, ...c);
  [...$('lignes').children].forEach((l, i) => {
    l.querySelector('i').style.width = Math.round(((c[i] || 0) / max) * 100) + '%';
    l.querySelector('.mi-nb').textContent = fmt(c[i]);
  });
  $('total').textContent = fmt(m.total);
  const rev = m.etat === 'revele' && m.resultat;
  $('vote').classList.toggle('revele', !!rev);
  $('resultat').hidden = !rev;
  if (rev && $('resultat').textContent !== m.resultat) $('resultat').textContent = m.resultat;
}

connecter({
  role: 'ministre',
  onEtat(etat, detail) {
    const ok = etat === 'ouvert';
    $('hors').hidden = ok;
    if (!ok) $('hors').textContent = libelleEtat(etat, detail);
  },
  onMessage(m) { if (m.t === 'vote') montrer(m); },
});
