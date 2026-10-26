// Testeur humain sur téléphone : pseudo, puis chat + saisie. Même chat que le public, sans origine.
import { connecter, libelleEtat } from '../commun/ws.js';
import { creerChat } from '../commun/chatvue.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const MAX = 80;
const CLE_PSEUDO = 'figurants.pseudo';

// ---------- viewport visible (clavier) : recette visualViewport simple ----------
const vv = window.visualViewport || null;
function caler() {
  if (vv && vv.scale <= 1.02) {
    app.style.setProperty('--k-h', vv.height + 'px');
    app.style.setProperty('--k-top', vv.offsetTop + 'px');
  } else {
    app.style.removeProperty('--k-h');
    app.style.removeProperty('--k-top');
  }
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);   // iOS fait défiler la page pour montrer le champ
}
if (vv) { vv.addEventListener('resize', caler); vv.addEventListener('scroll', caler); }
window.addEventListener('resize', caler);
document.addEventListener('focusin', () => [0, 150, 350, 700].forEach((d) => setTimeout(caler, d)));
caler();
try {   // couleur de la barre du navigateur = --bg (lue dans le thème)
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const m = document.querySelector('meta[name="theme-color"]');
  if (bg && m) m.setAttribute('content', bg);
} catch (e) { /* sans importance */ }

// ---------- pseudo ----------
let pseudo = '';
try { pseudo = localStorage.getItem(CLE_PSEUDO) || ''; } catch (e) { /* stockage indisponible */ }
$('pseudo').value = pseudo;

let ws = null;
let chat = null;

function validerPseudo(v) {
  const p = v.trim().replace(/\s+/g, ' ');
  if (p.length < 2) return { err: 'Au moins 2 caractères.' };
  if (p.length > 20) return { err: '20 caractères au plus.' };
  return { ok: p };
}

$('login').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const r = validerPseudo($('pseudo').value);
  if (r.err) { $('loginNote').textContent = r.err; return; }
  $('loginNote').textContent = '';
  pseudo = r.ok;
  try { localStorage.setItem(CLE_PSEUDO, pseudo); } catch (e) { /* rien */ }
  entrer();
});

$('changer').addEventListener('click', () => {
  $('vue').hidden = true;
  $('login').hidden = false;
  $('pseudo').focus();
  $('pseudo').select();
});

function entrer() {
  $('login').hidden = true;
  $('vue').hidden = false;
  $('moi').textContent = pseudo;
  if (!ws) {
    chat = creerChat($('chat'), { max: 40 });
    ws = connecter({
      role: 'telephone',
      pseudo,
      onEtat(etat, detail) {
        $('ws').dataset.etat = etat === 'attente' && detail.essai >= 1 ? 'indisponible' : etat;
        $('wsTxt').textContent = libelleEtat(etat, detail);
      },
      onMessage(m) {
        if (m.t === 'welcome') chat.historique(m.historique);
        else if (m.t === 'chat') chat.ajouter(m);
      },
    });
  } else {
    ws.setPseudo(pseudo);
  }
  $('msg').focus();
}

// ---------- saisie ----------
const champ = $('msg');
const compte = $('compte');

function majCompte() {
  compte.textContent = champ.value.length + '/' + MAX;
  compte.classList.toggle('plein', champ.value.length >= MAX);
}
champ.addEventListener('input', majCompte);

function envoyer() {
  const texte = champ.value.trim().slice(0, MAX);
  if (!texte || !ws) return;
  ws.msg(texte);
  champ.value = '';
  majCompte();
  champ.focus();           // le clavier reste ouvert
}

$('form').addEventListener('submit', (ev) => { ev.preventDefault(); envoyer(); });   // touche « envoyer » du clavier

// Le bouton ne prend jamais le focus : pointerdown + preventDefault garde le champ actif, donc le clavier ouvert.
const bouton = $('envoi');
bouton.addEventListener('pointerdown', (ev) => { ev.preventDefault(); envoyer(); });
bouton.addEventListener('click', (ev) => { if (ev.detail === 0) envoyer(); });         // clic clavier / lecteur d'écran

// pas de rebond ni tirer-pour-rafraîchir hors de la liste et des champs
document.addEventListener('touchmove', (e) => {
  if (e.touches && e.touches.length > 1) return;
  if (e.target.closest && e.target.closest('input')) return;
  e.preventDefault();
}, { passive: false });

if (pseudo && validerPseudo(pseudo).ok) $('pseudo').select();
