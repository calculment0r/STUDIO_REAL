// Page TÉLÉPHONE du streamer : aperçu plein écran, gros boutons en bas (une main), état et qualité en haut,
// consignes privées de la régie en grand. Le premier toucher ouvre la caméra (exigence iOS : geste requis).
import { lireIce } from '../flux/ice';
import { libelleChemin } from '../flux/stats';
import type { ConfigPage } from './config';
import { el, heureCourte, icone } from './dom';
import { creerEmetteur, type Consigne, type EtatEmetteur } from './emetteur';

const LIBELLES: Record<EtatEmetteur['phase'], string> = {
  arret: 'hors ligne', camera: 'caméra…', pret: 'prêt', direct: 'en direct', reprise: 'reprise…', erreur: 'problème',
};

export function pageStreamer(racine: HTMLElement, c: ConfigPage): void {
  const ice = lireIce(c.ice);
  // L'émetteur appelle onEtat dès sa création, avant que les éléments de la page ci-dessous existent
  // (ReferenceError « before initialization » vu sur le vrai essai) : on garde le dernier état et on rend quand tout est prêt.
  let pageConstruite = false;
  let dernierEtat: EtatEmetteur | null = null;
  const em = creerEmetteur({
    serveur: c.serveur, projet: c.projet, jeton: c.jeton, nom: 'Streamer',
    ...(c.canal ? { canal: c.canal } : {}), ...(ice ? { iceServers: ice } : {}), ...(c.relais ? { relais: true } : {}), ...(c.mire ? { mire: true } : {}),
    personne: identifiantStable(),
    onEtat: (e) => { dernierEtat = e; if (pageConstruite) rendre(e); },
    onConsigne: (k) => montrerConsigne(k),
  });
  (window as unknown as { __emetteur: unknown }).__emetteur = em;   // inspection (tests, console)

  const video = el('video', { class: 'st-apercu', playsinline: true, autoplay: true, muted: true });
  video.muted = true;
  const pastille = el('div', { class: 'st-pastille', 'data-phase': 'arret' }, 'hors ligne');
  const barres = el('span', { class: 'st-qualite', 'data-q': '' }, el('i'), el('i'), el('i'));
  const chiffres = el('span', { class: 'chiffres-fixes' }, '');
  const ligneSortie = el('span', { class: 'chiffres-fixes' }, '');
  const ligneChemin = el('span', {}, '');
  const infos = el('div', { class: 'st-infos' }, el('div', { class: 'st-ligne' }, chiffres, barres), ligneSortie, ligneChemin);
  const consigneTexte = el('p');
  const consigneHeure = el('div', { class: 'f-micro' });
  const consigne = el('section', { class: 'st-consigne', hidden: true, role: 'alert', onclick: () => { consigne.hidden = true; } }, consigneHeure, consigneTexte);

  const btCamera = el('button', { class: 'st-rond', 'aria-label': 'changer de caméra', onclick: () => void em.changerCamera() }, icone('camera'), 'caméra');
  const btMicro = el('button', { class: 'st-rond', 'aria-pressed': 'true', 'aria-label': 'micro', onclick: () => em.basculerMicro() });
  const btDirect = el('button', { class: 'st-direct', 'aria-pressed': 'false', disabled: true, onclick: () => {
    const e = em.etat();
    if (e.phase === 'direct' || e.phase === 'reprise') em.arreterDirect(); else void em.passerEnDirect();
  } }, 'EN DIRECT');

  const voileTitre = el('h1', {}, 'STREAMER');
  const voileTexte = el('p', {}, 'Touchez pour ouvrir la caméra arrière et le micro. Gardez cette page au premier plan pendant le direct.');
  const voileBouton = el('button', { class: 'st-gros', onclick: () => void demarrer() }, 'ACTIVER LA CAMÉRA');
  const voile = el('div', { class: 'st-voile' }, el('div', {}, voileTitre, voileTexte, voileBouton));

  racine.append(el('div', { class: 'st' }, video,
    el('header', { class: 'st-haut' }, pastille, infos), consigne,
    el('footer', { class: 'st-bas' }, btCamera, btDirect, btMicro), voile));
  pageConstruite = true;
  if (dernierEtat) queueMicrotask(() => rendre(dernierEtat as EtatEmetteur));

  async function demarrer() {
    voileBouton.disabled = true;
    voileTexte.textContent = 'Ouverture de la caméra…';
    try {
      await em.demarrer();
      voile.hidden = true;
    } catch {
      voileBouton.disabled = false;
      voileBouton.textContent = 'RÉESSAYER';
    }
  }

  let fluxAffiche: MediaStream | null = null;
  let pistesAffichees = '';
  function rendre(e: EtatEmetteur) {
    pastille.dataset.phase = e.phase;
    pastille.textContent = e.phase === 'direct' && e.recepteurs === 0 ? 'en direct · attente sortie' : LIBELLES[e.phase];
    const ids = e.apercu?.getTracks().map((t) => t.id).join() ?? '';
    if (e.apercu && (e.apercu !== fluxAffiche || ids !== pistesAffichees)) {
      fluxAffiche = e.apercu; pistesAffichees = ids;
      video.srcObject = e.apercu;
      void video.play().catch(() => undefined);
    }
    video.classList.toggle('miroir', e.camera === 'avant');
    const direct = e.phase === 'direct' || e.phase === 'reprise';
    btDirect.disabled = !(e.phase === 'pret' || direct);
    btDirect.setAttribute('aria-pressed', String(direct));
    btDirect.textContent = direct ? 'COUPER' : 'EN DIRECT';
    btMicro.setAttribute('aria-pressed', String(e.micro));
    btMicro.replaceChildren(icone(e.micro ? 'micro' : 'microCoupe'), e.micro ? 'micro' : 'coupé');
    barres.dataset.q = e.qualite ?? '';
    const s = e.stats;
    chiffres.textContent = s ? `${Math.round(s.imagesParSeconde)} i/s · ${s.debitKbps >= 1000 ? (s.debitKbps / 1000).toFixed(1) + ' Mb/s' : s.debitKbps + ' kb/s'}` : '';
    ligneSortie.textContent = direct
      ? `sortie ${e.recepteurs ? '✓ ×' + e.recepteurs : '—'}${s ? ` · ${s.largeur}×${s.hauteur}` : ''}${s?.rttMs != null ? ` · RTT ${s.rttMs} ms` : ''}${e.reduction > 1 ? ` · ÷${e.reduction}` : ''}`
      : e.salle === 'ouverte' ? 'salle connectée' : e.salle === 'connexion' ? 'connexion salle…' : 'salle injoignable';
    ligneChemin.textContent = s && direct ? libelleChemin(s) : '';
    if (e.phase === 'erreur') {
      voile.hidden = false; voileTitre.textContent = 'CAMÉRA';
      voileTexte.textContent = e.message; voileBouton.disabled = false; voileBouton.textContent = 'RÉESSAYER';
      voileBouton.onclick = () => { voileBouton.disabled = true; void em.reprendre().then(() => { if (em.etat().phase !== 'erreur') voile.hidden = true; }); };
    }
  }

  function montrerConsigne(k: Consigne) {
    consigneHeure.textContent = `consigne régie · ${heureCourte(k.recue)}${k.niveau === 'urgent' ? ' · urgent' : ''}`;
    consigneTexte.textContent = k.texte;
    consigne.dataset.niveau = k.niveau;
    consigne.hidden = false;
    consigne.classList.remove('flash');
    void consigne.offsetWidth;
    consigne.classList.add('flash');
    navigator.vibrate?.(k.niveau === 'urgent' ? [200, 100, 200] : 120);   // Android seulement (pas d'API sur iPhone)
  }

  window.addEventListener('pagehide', (e) => { if (!e.persisted) em.fermer(); });
  // page restaurée depuis le cache de navigation : on repart proprement
  window.addEventListener('pageshow', (e) => { if (e.persisted && em.etat().phase === 'arret') location.reload(); });
}

function identifiantStable(): string {
  try {
    const k = 'studio-real:personne-streamer';
    let v = localStorage.getItem(k);
    if (!v || !/^[A-Za-z0-9_-]{6,64}$/.test(v)) { v = 'streamer_' + Math.random().toString(36).slice(2, 12); localStorage.setItem(k, v); }
    return v;
  } catch {
    return 'streamer_' + Math.random().toString(36).slice(2, 12);
  }
}
