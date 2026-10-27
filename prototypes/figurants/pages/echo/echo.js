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
      else if (m.t === 'vote') montrerVote(m);
      else if (m.t === 'tel') montrerTel(m);
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

// ---------- vote (séquence 6) : la question et 4 gros boutons ; un seul vote par question ----------
const LETTRES = ['A', 'B', 'C', 'D'];
function montrerVote(m) {
  const sec = $('vote');
  if (m.etat === 'ferme' || !m.numero) { sec.hidden = true; return; }
  sec.hidden = false;
  $('voteQ').textContent = m.question || '';
  const choisi = typeof m.choisi === 'number' ? m.choisi : null;
  const ouvert = m.etat === 'compte';
  const box = $('voteChoix');
  box.textContent = '';
  (m.reponses || []).forEach((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ec-vote-bt' + (choisi === i ? ' choisi' : '');
    b.disabled = !ouvert || choisi !== null;
    const l = document.createElement('b'); l.textContent = LETTRES[i] || String(i + 1);
    const t = document.createElement('span'); t.textContent = r;
    b.append(l, t);
    b.addEventListener('click', () => {
      if (!ws || b.disabled) return;
      ws.envoyer({ t: 'vote.choix', numero: m.numero, index: i }, true);
      navigator.vibrate?.(40);
      for (const x of box.children) x.disabled = true;
      b.classList.add('choisi');
      $('voteEtat').textContent = 'Vote enregistré ✓';
    });
    box.appendChild(b);
  });
  $('voteEtat').textContent = m.etat === 'revele' ? 'Résultat à l’écran' : choisi !== null ? 'Vote enregistré ✓' : ouvert ? 'Touche ta réponse' : '';
}

// ---------- bloc 1 : flux Instagram (vidéo plein écran), puis abonne / désabonne et pourquoi ----------
// La régie choisit l'écran (message `tel`) ; à la fin de la vidéo, le téléphone passe seul au choix. La réponse écrite
// part aussitôt sur le mur (`choix.reponse`).
let etapeChoix = 0;            // 0 pas commencé · 1 le choix · 2 pourquoi · 3 merci
let monChoix = null;
const video = $('fluxVideo');

function montrerTel(m) {
  if (m.video && !video.getAttribute('src')) { video.src = m.video; video.load(); }   // préchargée dès l'entrée
  $('attente').hidden = !(m.mode === 'video' || m.mode === 'scene');
  $('attenteTexte').textContent = m.mode === 'scene' ? 'Regardez la scène' : 'Regardez la vidéo';
  $('notif').hidden = m.mode !== 'notif';
  if (m.mode === 'notif') navigator.vibrate?.([200, 100, 200]);
  if (m.mode === 'video' || m.mode === 'scene' || m.mode === 'notif') { arreterFlux(); $('choix').hidden = true; return; }
  if (m.mode === 'flux') { if (etapeChoix === 0) jouerFlux(); }
  else if (m.mode === 'choix') { arreterFlux(); ouvrirChoix(); }
  else { arreterFlux(); $('choix').hidden = true; }
}
function jouerFlux() {
  $('choix').hidden = true; $('flux').hidden = false;
  video.currentTime = 0;
  video.muted = false;
  video.play().catch(() => {           // pas de son sans geste (iPhone) : lecture muette + bouton
    video.muted = true; $('fluxSon').hidden = false;
    video.play().catch(() => { $('fluxSon').hidden = false; });
  });
}
function arreterFlux() { $('flux').hidden = true; try { video.pause(); } catch (e) { /* rien */ } }
$('fluxSon').addEventListener('click', () => { video.muted = false; video.play().catch(() => undefined); $('fluxSon').hidden = true; });
video.addEventListener('ended', () => { arreterFlux(); ouvrirChoix(); });

function ouvrirChoix() {
  $('choix').hidden = false;
  if (etapeChoix === 0) etapeChoix = 1;
  for (const n of [1, 2, 3]) $('choixEtape' + n).hidden = n !== etapeChoix;
}
function choisir(c) {
  monChoix = c;
  if (ws) ws.envoyer({ t: 'choix.reponse', choix: c }, true);
  navigator.vibrate?.(30);
  $('choixRappel').textContent = c === 'abonne' ? 'tu t’abonnes' : 'tu te désabonnes';
  $('choixPourquoi').textContent = c === 'abonne' ? 'Pourquoi tu t’abonnes ?' : 'Pourquoi tu te désabonnes ?';
  etapeChoix = 2; ouvrirChoix();
  setTimeout(() => $('pourquoi').focus(), 50);
}
$('bAbonne').addEventListener('click', () => choisir('abonne'));
$('bDesabonne').addEventListener('click', () => choisir('desabonne'));
$('choixEtape2').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const texte = $('pourquoi').value.trim();
  if (!texte || !ws || !monChoix) return;
  ws.envoyer({ t: 'choix.reponse', choix: monChoix, texte }, true);
  $('pourquoi').blur();
  etapeChoix = 3; ouvrirChoix();
});
