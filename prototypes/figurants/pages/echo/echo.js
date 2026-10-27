// Téléphone du spectateur d'Écho : pseudo, puis le fil des commentaires proposés pour la séquence en cours (message
// `props` du serveur). Un toucher envoie le commentaire à l'écran (`msg`) et le retire du fil ; les émojis s'envoient
// autant qu'on veut (le serveur limite à 8 messages par 10 s).
import { connecter, libelleEtat } from '../commun/ws.js';

const $ = (id) => document.getElementById(id);
const CLE_PSEUDO = 'studio-real:echo:pseudo';

let pseudo = '';
try { pseudo = localStorage.getItem(CLE_PSEUDO) || ''; } catch (e) { /* stockage indisponible */ }
pseudo = pseudo.replace(/^@+/, '');
$('pseudo').value = pseudo;

function validerPseudo(v) {
  const p = v.trim().replace(/^@+/, '').replace(/\s+/g, '_');
  if (p.length < 2) return { err: 'Au moins 2 caractères.' };
  if (p.length > 20) return { err: '20 caractères au plus.' };
  return { ok: p };
}

let ws = null;
let segment = null;
const envoyes = new Set();     // par segment : les phrases déjà envoyées ne reviennent pas après une reconnexion

$('login').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const r = validerPseudo($('pseudo').value);
  if (r.err) { $('loginNote').textContent = r.err; return; }
  $('loginNote').textContent = '';
  pseudo = r.ok;
  try { localStorage.setItem(CLE_PSEUDO, pseudo); } catch (e) { /* rien */ }
  $('pseudo').blur();
  entrer();
});

function entrer() {
  $('login').hidden = true;
  $('vue').hidden = false;
  $('moi').textContent = '@' + pseudo;
  if (ws) { ws.setPseudo(pseudo); return; }
  ws = connecter({
    role: 'telephone',
    pseudo,
    onEtat(etat, detail) {
      $('ws').dataset.etat = etat === 'attente' && detail.essai >= 1 ? 'indisponible' : etat;
      $('wsTxt').textContent = libelleEtat(etat, detail);
    },
    onMessage(m) {
      if (m.t === 'welcome' && m.pseudo) $('moi').textContent = '@' + m.pseudo;
      else if (m.t === 'props') montrer(m);
    },
  });
}

function melanger(l) {
  const a = l.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function montrer(m) {
  if (m.segment !== segment) { segment = m.segment; envoyes.clear(); }
  $('titre').textContent = m.titre || '';
  const fil = $('fil');
  fil.textContent = '';
  melanger(m.phrases || []).filter((p) => !envoyes.has(p)).forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ec-carte arrive'; b.textContent = p;
    b.style.animationDelay = Math.min(i * 40, 600) + 'ms';
    b.addEventListener('click', () => envoyerPhrase(b, p));
    fil.appendChild(b);
  });
  fil.scrollTop = 0;
  majVide();
  const em = $('emojis');
  em.textContent = '';
  for (const e of m.emojis || []) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ec-emoji'; b.textContent = e; b.setAttribute('aria-label', 'envoyer ' + e);
    b.addEventListener('click', () => { if (ws) { ws.msg(e); confirmer(e); } });
    em.appendChild(b);
  }
  em.hidden = !(m.emojis || []).length;
}

function envoyerPhrase(b, p) {
  if (!ws || b.classList.contains('partie')) return;
  ws.msg(p);
  envoyes.add(p);
  confirmer(p);
  navigator.vibrate?.(30);
  b.classList.add('partie');
  setTimeout(() => { b.remove(); majVide(); }, 450);
}

let tConfirme = 0;
function confirmer(t) {
  $('envoye').textContent = 'envoyé : ' + t;
  clearTimeout(tConfirme);
  tConfirme = setTimeout(() => { $('envoye').textContent = ''; }, 2500);
}

function majVide() { $('vide').hidden = $('fil').children.length > 0; $('fil').hidden = !$('vide').hidden; }

if (pseudo && validerPseudo(pseudo).ok) entrer();
