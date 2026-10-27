// Mini-régie figurants (étude §8.5). Les fig.cmd sont envoyés tels que décrits dans ../../PROTOCOLE.md.
import { connecter, couleurJeton, libelleEtat } from '../commun/ws.js';

const $ = (id) => document.getElementById(id);
const DENSITES = ['silence', 'calme', 'normal', 'chaud', 'folie'];
const EMOJIS = ['😂', '🔥', '😭', '👏', '😮', '❤️', '💀', '🤡'];
const ORIGINES = ['humain', 'N0', 'N1', 'N2', 'souffleur', 'main'];
const ETAPES = [
  ['asr_decision', 'asr → décision'], ['premier_jeton', '1er jeton'],
  ['ligne', 'ligne'], ['filtre', 'filtre'], ['total', 'total'],
];

const etat = {
  densite: 'normal',
  valence: 0, energie: 0.5, etiquettes: [],
  marquage: 'masque', coupe: false,
  vague: EMOJIS[0],
};
const personas = new Map();        // pid -> { pid, pseudo, role, actif }
let main = null;                   // pid du persona dont on a pris la main
const comptes = Object.fromEntries(ORIGINES.map((o) => [o, 0]));

// ---------- utilitaires ----------
const hms = (ts) => new Date(typeof ts === 'number' ? ts : Date.now()).toLocaleTimeString('fr-FR', { hour12: false });
const virgule = (n, d) => Number(n).toFixed(d).replace('.', ',');
function fmtMs(ms) {
  if (typeof ms !== 'number' || !isFinite(ms)) return '—';
  return ms >= 1000 ? virgule(ms / 1000, 1) + ' s' : Math.round(ms) + ' ms';
}
function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}
function surDefilement(conteneur) {            // true si l'utilisateur est collé en bas
  return conteneur.scrollHeight - conteneur.scrollTop - conteneur.clientHeight < 40;
}
function ajouterDefilant(conteneur, noeud, max, avant) {
  const bas = surDefilement(conteneur);
  conteneur.insertBefore(noeud, avant || null);
  const enfants = conteneur.querySelectorAll(':scope > :not(.partiel)');
  for (let i = 0; i < enfants.length - max; i++) enfants[i].remove();
  if (bas) conteneur.scrollTop = conteneur.scrollHeight;
}

// ---------- journal ----------
function journal(ligne, ts, local) {
  const d = el('div', 'jl' + (local ? ' local' : ''));
  d.append(el('time', null, hms(ts)), document.createTextNode(ligne));
  ajouterDefilant($('journal'), d, 300);
}

// ---------- connexion ----------
const ws = connecter({
  role: 'regie',
  onEtat(e, detail) {
    $('ws').dataset.etat = e === 'attente' && detail.essai >= 1 ? 'indisponible' : e;
    $('wsTxt').textContent = libelleEtat(e, detail);
    if (e === 'ouvert') journal('connecté au serveur', Date.now(), true);
    else if (e === 'attente' || e === 'indisponible') journal(libelleEtat(e, detail), Date.now(), true);
  },
  onHorloge(h) {
    $('horloge').textContent = 'horloge serveur : ' + (h.decalage >= 0 ? '+' : '') + Math.round(h.decalage) + ' ms'
      + (h.rtt != null ? ' · aller-retour ' + Math.round(h.rtt) + ' ms' : '');
  },
  onMessage(m) {
    switch (m.t) {
      case 'welcome': recevoirWelcome(m); break;
      case 'chat': ligneChat(m, false); break;
      case 'asr': recevoirAsr(m); break;
      case 'fig.stat': recevoirStat(m); break;
      case 'fig.attente': recevoirAttente(m); break;
      case 'journal': journal(m.ligne, m.ts, false); break;
      case 'vote': recevoirVote(m); break;
      case 'tel': $('telEtat').textContent = { phrases: 'fil de phrases', flux: 'flux Insta', choix: 'abonne / désabonne' }[m.mode] || m.mode; break;
      case 'choix.stat': $('choixStat').textContent = `abonnés ${m.abonne} · désabonnés ${m.desabonne}`; break;
      default: break;
    }
  },
});

/** envoie une fig.cmd, la note au journal local, fait clignoter le bouton */
function cmd(c, libelle, bouton) {
  const envoye = ws.cmd(c);
  journal('→ ' + (libelle || JSON.stringify(c)) + (envoye ? '' : ' (en file : hors ligne)'), Date.now(), true);
  if (bouton) { bouton.classList.add('flash'); setTimeout(() => bouton.classList.remove('flash'), 250); }
}

// ---------- welcome ----------
function recevoirWelcome(m) {
  const e = m.etat || {};
  if (e.densite) majDensite(e.densite);
  if (e.humeur) {
    if (typeof e.humeur.valence === 'number') etat.valence = e.humeur.valence;
    if (typeof e.humeur.energie === 'number') etat.energie = e.humeur.energie;
    if (Array.isArray(e.humeur.etiquettes)) etat.etiquettes = e.humeur.etiquettes.slice();
    majHumeur();
  }
  if (e.marquage) majMarquage(e.marquage);
  if (e.fournisseur) $('fournisseur').value = e.fournisseur;
  if (e.segment != null && typeof e.segment !== 'object') $('segment').value = e.segment;
  if (Array.isArray(e.segments)) $('segments').replaceChildren(...e.segments.map((id) => Object.assign(document.createElement('option'), { value: id })));   // séquences du spectacle à choisir
  if (typeof e.coupe === 'boolean') majCoupe(e.coupe);
  if (e.personas) chargerPersonas(e.personas);
  for (const c of m.historique || []) ligneChat(c, true);
}

// ---------- densité ----------
const boitesDens = {};
DENSITES.forEach((d, i) => {
  const b = el('button', 'bt', d);
  b.type = 'button';
  b.append(el('kbd', null, String(i + 1)));
  b.addEventListener('click', () => choisirDensite(d));
  $('dens').append(b);
  boitesDens[d] = b;
});
function majDensite(d) {
  if (!boitesDens[d]) return;
  etat.densite = d;
  for (const k of DENSITES) boitesDens[k].classList.toggle('sel', k === d);
}
function choisirDensite(d) { majDensite(d); cmd({ densite: d }, 'densité ' + d); }
majDensite(etat.densite);

// ---------- humeur ----------
let minuteurHumeur = null;
function majHumeur() {
  $('valence').value = etat.valence;
  $('energie').value = etat.energie;
  $('valenceV').textContent = (etat.valence > 0 ? '+' : '') + virgule(etat.valence, 2);
  $('energieV').textContent = virgule(etat.energie, 2);
  const boite = $('etiquettes');
  boite.textContent = '';
  for (const t of etat.etiquettes) {
    const p = el('span', 'puce', t);
    const x = el('button', null, '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'retirer ' + t);
    x.addEventListener('click', () => { etat.etiquettes = etat.etiquettes.filter((v) => v !== t); majHumeur(); envoyerHumeur(); });
    p.append(x);
    boite.append(p);
  }
  $('humTxt').textContent = etat.etiquettes.length ? '' : 'aucune étiquette';
}
function envoyerHumeur() {
  clearTimeout(minuteurHumeur);
  const h = { valence: Number(etat.valence), energie: Number(etat.energie), etiquettes: etat.etiquettes.slice() };
  cmd({ humeur: h }, 'humeur ' + virgule(h.valence, 2) + ' / ' + virgule(h.energie, 2) + (h.etiquettes.length ? ' [' + h.etiquettes.join(', ') + ']' : ''));
}
for (const id of ['valence', 'energie']) {
  $(id).addEventListener('input', () => {
    etat[id] = parseFloat($(id).value);
    $('valenceV').textContent = (etat.valence > 0 ? '+' : '') + virgule(etat.valence, 2);
    $('energieV').textContent = virgule(etat.energie, 2);
    clearTimeout(minuteurHumeur);
    minuteurHumeur = setTimeout(envoyerHumeur, 250);
  });
}
$('formEtiq').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const v = $('nouvEtiq').value.trim().toLowerCase();
  if (!v || etat.etiquettes.includes(v) || etat.etiquettes.length >= 8) return;
  etat.etiquettes.push(v);
  $('nouvEtiq').value = '';
  majHumeur();
  envoyerHumeur();
});
majHumeur();

// ---------- actions ----------
function relance() { cmd({ relance: true }, 'relance', $('bRelance')); }
function vague() { cmd({ vague: etat.vague }, 'vague ' + etat.vague, $('bVague')); }
$('bRelance').addEventListener('click', relance);
$('bVague').addEventListener('click', vague);
$('bChut').addEventListener('click', () => cmd({ chut: true }, 'chut', $('bChut')));

for (const e of EMOJIS) {
  const b = el('button', null, e);
  b.type = 'button';
  b.setAttribute('aria-label', 'emoji ' + e);
  b.addEventListener('click', () => {
    etat.vague = e;
    $('vagueEmoji').textContent = e;
    for (const x of $('emojis').children) x.classList.toggle('sel', x === b);
  });
  if (e === etat.vague) b.classList.add('sel');
  $('emojis').append(b);
}

function majCoupe(v) {
  etat.coupe = !!v;
  $('bCoupe').setAttribute('aria-pressed', String(etat.coupe));
  $('bCoupe').textContent = etat.coupe ? 'COUPÉ · REPRENDRE' : 'COUPE';
  $('bandeauCoupe').hidden = !etat.coupe;
  document.body.classList.toggle('coupe', etat.coupe);
}
function basculerCoupe() {
  majCoupe(!etat.coupe);
  cmd({ coupe: etat.coupe }, etat.coupe ? 'COUPE : tous les figurants se taisent' : 'COUPE levée');
}
$('bCoupe').addEventListener('click', basculerCoupe);

// ---------- réglages ----------
$('fournisseur').addEventListener('change', () => cmd({ fournisseur: $('fournisseur').value }, 'fournisseur ' + $('fournisseur').value));
function majMarquage(v) {
  etat.marquage = v;
  for (const b of $('marquage').children) b.classList.toggle('sel', b.dataset.v === v);
}
for (const b of $('marquage').children) {
  b.addEventListener('click', () => { majMarquage(b.dataset.v); cmd({ marquage: b.dataset.v }, 'marquage ' + b.dataset.v); });
}
majMarquage(etat.marquage);
$('formSegment').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const v = $('segment').value.trim();
  if (v) cmd({ segment: v }, 'segment ' + v);
});

// ---------- souffleur ----------
$('formSouff').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const intention = $('intention').value.trim();
  if (!intention) return;
  const dire = { intention, nb: parseInt($('nb').value, 10), validation: $('valider').checked };
  cmd({ dire }, 'souffleur « ' + intention + ' » ×' + dire.nb + (dire.validation ? ' (à valider)' : ''));
  $('intention').value = '';
});

// ---------- à valider ----------
const cartes = new Map();
function majNbAttente() {
  $('nbAttente').textContent = String(cartes.size);
  $('attenteVide').hidden = cartes.size > 0;
}
function recevoirAttente(m) {
  if (cartes.has(m.id)) return;
  const c = el('div', 'carte');
  const t = el('div', 'carte-t');
  t.append(el('b', null, m.pseudo || m.pid || '?'));
  if (m.origine) { const b = el('span', 'rl-b', m.origine); b.dataset.o = m.origine; t.append(b); }
  const txt = el('div', 'carte-txt', m.texte || '');
  const bt = el('div', 'carte-bt');
  const ok = el('button', 'bt ok', '✓'); ok.title = 'Valider';
  const non = el('button', 'bt non', '✗'); non.title = 'Rejeter';
  const ed = el('button', 'bt', '✎'); ed.title = 'Corriger puis valider';
  for (const b of [ok, non, ed]) b.type = 'button';
  bt.append(ok, non, ed);
  c.append(t, txt, bt);

  const fin = (accepte, texte) => {
    ws.valide(m.id, accepte, texte);
    journal((accepte ? '✓ validé' : '✗ rejeté') + ' : ' + (texte != null ? texte : m.texte), Date.now(), true);
    c.remove(); cartes.delete(m.id); majNbAttente();
  };
  ok.addEventListener('click', () => fin(true));
  non.addEventListener('click', () => fin(false));
  ed.addEventListener('click', () => {
    if (c.querySelector('.carte-edit')) return;
    const f = el('form', 'carte-edit');
    const champ = el('input', 'champ');
    champ.value = m.texte || '';
    champ.maxLength = 300;
    const go = el('button', 'bt ok', '✓ envoyer'); go.type = 'submit';
    f.append(champ, go);
    txt.hidden = true; bt.hidden = true;
    c.append(f);
    champ.focus(); champ.select();
    const annuler = () => { f.remove(); txt.hidden = false; bt.hidden = false; };
    champ.addEventListener('keydown', (k) => { if (k.key === 'Escape') { k.stopPropagation(); annuler(); } });
    f.addEventListener('submit', (s) => {
      s.preventDefault();
      const v = champ.value.trim();
      if (v) fin(true, v);
    });
  });
  $('attente').append(c);
  cartes.set(m.id, c);
  majNbAttente();
}
majNbAttente();

// ---------- personnages ----------
function normPersona(p, cle) {
  if (typeof p === 'string') return { pid: p, pseudo: p, role: '', actif: true };
  const pid = p.pid ?? p.id ?? p.persona ?? cle ?? p.pseudo;
  return {
    pid,
    pseudo: p.pseudo ?? p.nom ?? p.name ?? String(pid),
    role: p.role ?? p.archetype ?? p.type ?? p.profil ?? '',
    actif: !(p.actif === false || p.enScene === false || p.en_scene === false || p.horsScene === true || p.hors_scene === true),
  };
}
function chargerPersonas(liste) {
  const entrees = Array.isArray(liste) ? liste.map((p) => [undefined, p]) : Object.entries(liste || {});
  for (const [cle, p] of entrees) {
    const n = normPersona(p, cle);
    if (n.pid != null) personas.set(String(n.pid), n);
  }
  majPersonas();
}
function majPersonas() {
  const ul = $('personas');
  ul.textContent = '';
  if (!personas.size) { ul.append(el('li', 'vide', 'aucun personnage connu')); return; }
  for (const p of personas.values()) {
    const li = el('li', 'p' + (main === p.pid ? ' pris' : ''));
    li.append(el('i', 'pt' + (p.actif ? ' on' : '')));
    const nom = el('span', 'pn-nom', p.pseudo);
    if (p.role) nom.append(el('span', 'pn-role', p.role));
    const b = el('button', 'bt', main === p.pid ? 'Rendre la main' : 'Prendre la main');
    b.type = 'button';
    b.addEventListener('click', () => (main === p.pid ? rendreLaMain() : prendreLaMain(p)));
    li.append(nom, b);
    ul.append(li);
  }
}
function prendreLaMain(p) {
  main = p.pid;
  $('mainQui').textContent = p.pseudo;
  $('formMain').hidden = false;
  majPersonas();
  $('mainTexte').focus();
  journal('main prise sur ' + p.pseudo, Date.now(), true);
}
function rendreLaMain() {
  main = null;
  $('formMain').hidden = true;
  majPersonas();
}
$('mainFin').addEventListener('click', rendreLaMain);
$('formMain').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const v = $('mainTexte').value.trim();
  if (!v || main == null) return;
  ws.msg(v, String(main));        // msg avec persona : la régie écrit comme le persona
  $('mainTexte').value = '';
  $('mainTexte').focus();
});

// ---------- chat complet ----------
const tipsLignes = new WeakMap();
const dejaVus = new Set();
function ligneChat(m, ancien) {
  if (m.id != null) { if (dejaVus.has(m.id)) return; dejaVus.add(m.id); }
  const o = ORIGINES.includes(m.origine) ? m.origine : 'humain';
  comptes[o] += 1;
  majComptes();
  if (m.pid != null && !personas.has(String(m.pid))) {
    personas.set(String(m.pid), { pid: String(m.pid), pseudo: m.pseudo || String(m.pid), role: 'vu dans le chat', actif: true });
    majPersonas();
  }
  const d = el('div', 'rl');
  const p = el('span', 'rl-p', m.pseudo || '?');
  p.style.color = couleurJeton(m.couleur);
  const b = el('span', 'rl-b', o);
  b.dataset.o = o;
  d.append(el('span', 'rl-h', hms(m.ts)), b, p, el('span', 'rl-t', m.texte || ''));
  const infos = [['origine', o]];
  if (m.pid != null) infos.push(['persona', String(m.pid)]);
  if (m.ref != null) infos.push(['en réponse à', typeof m.ref === 'object' ? JSON.stringify(m.ref) : String(m.ref)]);
  if (m.lat && typeof m.lat === 'object') {
    for (const [cle, val] of Object.entries(m.lat)) {
      const nom = (ETAPES.find((x) => x[0] === cle) || [cle, cle])[1];
      infos.push([nom, typeof val === 'number' ? fmtMs(val) : JSON.stringify(val)]);
    }
  } else if (o !== 'humain') {
    infos.push(['latences', 'non fournies']);
  }
  tipsLignes.set(d, infos);
  ajouterDefilant($('chat'), d, 500);
}
function majComptes() {
  $('comptes').textContent = ORIGINES.filter((o) => comptes[o]).map((o) => o + ' ' + comptes[o]).join(' · ');
}

// infobulle au survol (une seule, positionnée à la souris)
const tip = $('tip');
$('chat').addEventListener('mouseover', (ev) => {
  const l = ev.target.closest('.rl');
  const infos = l && tipsLignes.get(l);
  if (!infos) { tip.hidden = true; return; }
  tip.textContent = '';
  for (const [k, v] of infos) {
    const r = document.createElement('div');
    r.append(el('span', null, k), el('span', null, v));
    tip.append(r);
  }
  tip.hidden = false;
  placerTip(ev);
});
function placerTip(ev) {
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = ev.clientX + 16, y = ev.clientY + 14;
  if (x + w > window.innerWidth - 8) x = ev.clientX - w - 16;
  if (y + h > window.innerHeight - 8) y = ev.clientY - h - 14;
  tip.style.left = Math.max(8, x) + 'px';
  tip.style.top = Math.max(8, y) + 'px';
}
$('chat').addEventListener('mousemove', (ev) => { if (!tip.hidden) placerTip(ev); });
$('chat').addEventListener('mouseleave', () => { tip.hidden = true; });

// ---------- transcription ----------
function recevoirAsr(m) {
  const zone = $('trans');
  const partiel = $('partiel');
  if (m.kind === 'partial') {
    partiel.textContent = m.texte || '';
    if (surDefilement(zone)) zone.scrollTop = zone.scrollHeight;
  } else {
    partiel.textContent = '';
    const d = el('div', 'fin');
    d.append(el('time', null, hms(m.ts)), document.createTextNode(m.texte || ''));
    ajouterDefilant(zone, d, 80, partiel);
  }
}

// ---------- télémétrie ----------
function lire(lat, etape, q) {
  if (!lat || typeof lat !== 'object') return null;
  const e = lat[etape];
  if (e && typeof e === 'object' && !Array.isArray(e) && q in e) return e[q];
  if (Array.isArray(e)) return e[q === 'p50' ? 0 : 1];
  if (lat[q] && typeof lat[q] === 'object' && etape in lat[q]) return lat[q][etape];
  for (const k of [etape + '_' + q, q + '_' + etape]) if (typeof lat[k] === 'number') return lat[k];
  if (typeof e === 'number') return q === 'p50' ? e : null;
  return null;
}
function paire(lat, etape) {
  const a = lire(lat, etape, 'p50');
  const b = lire(lat, etape, 'p95');
  if (a == null && b == null) return '—';
  return fmtMs(a) + ' / ' + fmtMs(b);
}
function nombre(v, ...cles) {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') for (const k of cles) if (typeof v[k] === 'number') return v[k];
  return null;
}
function recevoirStat(m) {
  const f = m.fournisseur;
  $('stFourTxt').textContent = f == null ? '—' : String(f);
  const pt = document.querySelector('.st-dot');
  pt.className = 'st-dot' + (f == null ? '' : (String(f).toLowerCase().includes('banque') ? ' degrade' : ' ok'));
  $('stTotal').textContent = paire(m.lat, 'total');
  $('stJeton').textContent = paire(m.lat, 'premier_jeton');
  $('stLigne').textContent = paire(m.lat, 'ligne');
  $('stFiltre').textContent = paire(m.lat, 'filtre');
  $('stDecision').textContent = paire(m.lat, 'asr_decision');
  $('stRejets').textContent = m.rejets == null ? '—' : String(m.rejets);
  $('stCout').textContent = typeof m.cout_usd === 'number' ? virgule(m.cout_usd, 2) + ' $' : '—';

  let pf = typeof m.part_fig === 'number' ? m.part_fig : null;
  if (pf != null) { if (pf <= 1) pf *= 100; $('stPart').textContent = 'réel ' + Math.round(100 - pf) + ' % / fig. ' + Math.round(pf) + ' %'; }
  else $('stPart').textContent = '—';

  const reel = nombre(m.debit, 'reel', 'reels', 'réel', 'humain', 'humains');
  const fig = nombre(m.debit, 'fig', 'figurants', 'ia');
  if (reel != null || fig != null) {
    $('stDebit').textContent = (reel != null ? 'réel ' + virgule(reel, 0) : '') + (reel != null && fig != null ? ' · ' : '') + (fig != null ? 'fig. ' + virgule(fig, 0) : '') + ' /min';
  } else if (typeof m.debit === 'number') {
    $('stDebit').textContent = virgule(m.debit, 0) + ' /min';
  } else $('stDebit').textContent = '—';
  if (Array.isArray(m.machines)) afficherMachines(m.machines);
}

// ---------- machines Ollama (mode spectacle : 3090 › dgx2 › dgx1) ----------
const ETATS_MACHINE = { pret: 'prête', douteux: 'douteuse', injoignable: 'injoignable', disjoncte: 'disjonctée', inconnu: '…' };
function afficherMachines(liste) {
  const ul = $('machines');
  ul.replaceChildren(...liste.map((x) => {
    const li = document.createElement('li');
    li.dataset.etat = x.etat;
    if (x.active) li.classList.add('active');
    const lat = x.premier_jeton_ms != null ? `1er mot ${fmtMs(x.premier_jeton_ms)} · réplique ${fmtMs(x.total_ms)}` : '';
    li.title = [x.raison, x.ts ? 'chauffe ' + new Date(x.ts).toLocaleTimeString('fr-FR') : ''].filter(Boolean).join(' · ');
    li.innerHTML = '<i></i><b></b><span class="et"></span><small></small>';
    li.querySelector('b').textContent = `${x.rang}. ${x.machine}`;
    li.querySelector('.et').textContent = `${x.modele} · ${ETATS_MACHINE[x.etat] || x.etat}${x.active ? ' · active' : ''}`;
    li.querySelector('small').textContent = lat;
    return li;
  }));
}
$('bChauffe').addEventListener('click', () => cmd({ chauffe: true }, 'contrôle de chauffe'));

// ---------- raccourcis clavier ----------
const estSaisie = (t) => t && t.matches && t.matches('input, textarea, select, [contenteditable]');
document.addEventListener('keydown', (ev) => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const saisie = estSaisie(ev.target);
  if (ev.key === 'Escape') {
    ev.preventDefault();
    if (saisie) ev.target.blur();
    basculerCoupe();
  } else if (ev.key === ' ' && !saisie) {
    ev.preventDefault();
    if (!ev.repeat) relance();
  } else if (/^[1-5]$/.test(ev.key) && !saisie) {
    ev.preventDefault();
    choisirDensite(DENSITES[parseInt(ev.key, 10) - 1]);
  }
});
document.addEventListener('keyup', (ev) => {       // évite qu'espace « clique » le bouton resté focalisé
  if (ev.key === ' ' && !estSaisie(ev.target)) ev.preventDefault();
});
document.addEventListener('click', (ev) => {       // un bouton cliqué ne garde pas le focus : l'espace reste « relance »
  const b = ev.target.closest && ev.target.closest('button');
  if (b) b.blur();
});

journal('régie prête', Date.now(), true);

// ---------- vote truqué (séquence 6) : tops forcés à la main ----------
function voteCmd(cmd, bouton) {
  const m = { t: 'vote.cmd', cmd };
  if (cmd === 'ouvrir') m.numero = Number($('voteNumero').value);
  const envoye = ws.envoyer(m, true);
  journal('→ vote ' + cmd + (m.numero ? ' question ' + m.numero : '') + (envoye ? '' : ' (en file : hors ligne)'), Date.now(), true);
  if (bouton) { bouton.classList.add('flash'); setTimeout(() => bouton.classList.remove('flash'), 250); }
}
$('bVoteOuvrir').addEventListener('click', (e) => voteCmd('ouvrir', e.currentTarget));
$('bVoteReveler').addEventListener('click', (e) => voteCmd('reveler', e.currentTarget));
$('bVoteFermer').addEventListener('click', (e) => voteCmd('fermer', e.currentTarget));

function recevoirVote(m) {
  const libelle = { compte: 'compteurs en cours', revele: 'résultat affiché', ferme: 'fermé' }[m.etat] || m.etat;
  $('voteEtat').textContent = m.numero ? 'question ' + m.numero + ' · ' + libelle : libelle;
  const d = $('voteDetail');
  d.textContent = '';
  if (!m.numero) return;
  (m.reponses || []).forEach((r, i) => {
    const l = el('div', 'vt-ligne');
    l.append(el('b', '', 'ABCD'[i] || String(i + 1)), el('span', 'vt-r', r),
      el('span', 'vt-n', (m.comptes?.[i] ?? 0) + ' / ' + (m.scores?.[i] ?? '?') + ' · réels ' + (m.reels?.[i] ?? 0)));
    d.appendChild(l);
  });
  if (m.resultat) d.appendChild(el('p', 'vt-res', m.resultat));
}

// ---------- écran des téléphones (bloc 1) : flux Insta, abonne / désabonne + pourquoi, fil de phrases ----------
function telCmd(mode) {
  const envoye = ws.envoyer({ t: 'tel.cmd', mode }, true);
  journal('→ téléphones : ' + mode + (envoye ? '' : ' (en file : hors ligne)'), Date.now(), true);
}
$('bTelFlux').addEventListener('click', () => telCmd('flux'));
$('bTelChoix').addEventListener('click', () => telCmd('choix'));
$('bTelPhrases').addEventListener('click', () => telCmd('phrases'));
