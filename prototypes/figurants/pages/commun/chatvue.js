// Rendu du chat « public » (pages chat, comedien, telephone) : pseudo coloré par jeton CSS + texte.
// Aucune indication d'origine, sauf le petit signe discret que la page comédien active
// quand le serveur envoie `origine` (marquage = discret).
import { couleurJeton } from './ws.js';

export function creerChat(el, opts = {}) {
  const { max = 60, pops = false, signe = false } = opts;
  const vus = new Set();
  const ordre = [];
  el.classList.add(pops ? 'cv-pops' : 'cv-liste');

  function ligne(m) {
    const d = document.createElement('div');
    d.className = 'lg';
    const p = document.createElement('span');
    p.className = 'lg-p';
    p.style.color = couleurJeton(m.couleur);
    p.textContent = m.pseudo || '?';
    const t = document.createElement('span');
    t.className = 'lg-t';
    t.textContent = m.texte || '';
    d.append(p, t);
    if (signe && m.origine && m.origine !== 'humain') d.classList.add('lg-fig');
    if (m.grand) d.classList.add('lg-grand');      // commentaire d'un spectateur : plus gros que ceux des figurants
    return d;
  }

  function pop(m) {
    const d = ligne(m);
    d.classList.add('pop');
    const w = el.clientWidth || window.innerWidth;
    const x = Math.random() * 0.62 + 0.04;               // bande horizontale 4 % - 66 %
    d.style.left = Math.round(x * w) + 'px';
    d.style.animationDuration = (7 + Math.random() * 3).toFixed(1) + 's';
    d.addEventListener('animationend', () => d.remove());
    el.appendChild(d);
    while (el.children.length > 30) el.firstChild.remove();
  }

  function ajouter(m, ancien) {
    if (m.id != null) {
      if (vus.has(m.id)) return false;
      vus.add(m.id); ordre.push(m.id);
      if (ordre.length > 400) vus.delete(ordre.shift());
    }
    if (pops) { if (!ancien) pop(m); return true; }
    const d = ligne(m);
    if (ancien) d.classList.add('lg-ancien');   // historique du welcome : pas d'animation d'entrée
    el.appendChild(d);
    while (el.children.length > max) el.firstChild.remove();
    return true;
  }

  return {
    ajouter(m) { return ajouter(m, false); },
    historique(liste) {
      for (const m of liste || []) if (m && m.texte !== undefined) ajouter(m, true);
    },
    vider() { el.textContent = ''; },
  };
}
