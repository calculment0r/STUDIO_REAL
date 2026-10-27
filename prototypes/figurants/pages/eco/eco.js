// Prompteur de Franck : les 5 questions (texte de l'auteur), la question ouverte par la régie en avant.
import { connecter } from '../commun/ws.js';

const QUESTIONS = [
  [1, 'Je trouve ça dur d’être un homme blanc aujourd’hui. Ça a l’air plus facile d’être une femme dans le milieu de l’influence. T’as vu ce qu’il y a écrit dans mes commentaires Insta ? J’ai l’impression que tout le monde me déteste. Est-ce que t’as une solution ?'],
  [2, 'Comment faire pour que les gens arrêtent de me détester ? Suis-je le monstre que tout le monde décrit ?'],
  [3, 'J’ai remarqué que c’est surtout les femmes qui me crachent dessus. J’ai l’impression que je ne les comprends pas. Pourtant, moi, j’adore les femmes. Est-ce que tu peux m’aider à les comprendre ?'],
  [4, 'C’est qui, Mona Chollet ?'],
  [15, 'Apparemment, le consentement doit se demander à chaque instant. Mais comment faire, pendant l’acte sexuel, pour s’en assurer sans tout casser ?'],
];

const liste = document.getElementById('liste');
const cartes = new Map();
for (const [n, q] of QUESTIONS) {
  const d = document.createElement('section');
  d.className = 'eco-q';
  const num = document.createElement('div'); num.className = 'eco-num'; num.textContent = 'Question ' + n;
  const t = document.createElement('p'); t.textContent = q;
  d.append(num, t);
  d.addEventListener('click', () => mettreEnAvant(n));    // Franck peut aussi la choisir lui-même
  liste.appendChild(d);
  cartes.set(n, d);
}

function mettreEnAvant(n) {
  for (const [k, d] of cartes) d.classList.toggle('active', k === n);
  cartes.get(n)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

connecter({
  role: 'ministre',
  onEtat(etat) { document.getElementById('ws').textContent = etat === 'ouvert' ? 'régie connectée' : 'régie : ' + etat; },
  onMessage(m) { if (m.t === 'vote' && m.numero && m.etat !== 'ferme') mettreEnAvant(m.numero); },
});
