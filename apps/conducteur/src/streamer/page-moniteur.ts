// Moniteur de réception (PC de régie ou de scène) : la vidéo du streamer, son COUPÉ par défaut (bouton pour
// l'activer), chemin obtenu (direct / relais), statistiques (latence, images/s, débit), mire de latence quand le
// téléphone l'envoie, et envoi de consignes privées au téléphone. Sert de contrôle et de plan B à la sortie.
import { creerRecepteurFlux, type EtatFlux } from '../flux/recepteur';
import { lireIce } from '../flux/ice';
import { mesurerLatenceMire } from '../flux/mire';
import { noteQualite, resumeStats } from '../flux/stats';
import type { ConfigPage } from './config';
import { el } from './dom';

const LIBELLES: Record<EtatFlux['phase'], string> = {
  connexion: 'connexion…', attente: 'attente du streamer', negociation: 'négociation…', direct: 'en direct', coupe: 'coupure, reprise…', arrete: 'arrêté',
};

export function pageMoniteur(racine: HTMLElement, c: ConfigPage): void {
  const ice = lireIce(c.ice);
  const video = el('video', { playsinline: true, autoplay: true, muted: true });
  video.muted = true;
  const etatTxt = el('span', { class: 'st-pastille', 'data-phase': 'arret' }, 'connexion…');
  const statsTxt = el('span', { class: 'pc-stats' }, '');
  const mireTxt = el('span', { class: 'pc-stats' }, '');
  const btSon = el('button', { class: 'pc-bouton', onclick: () => {
    video.muted = !video.muted;
    btSon.textContent = video.muted ? 'Activer le son' : 'Couper le son';
    btSon.classList.toggle('actif', !video.muted);
    void video.play().catch(() => undefined);
  } }, 'Activer le son');
  const btPlein = el('button', { class: 'pc-bouton', onclick: () => void racine.requestFullscreen?.().catch(() => undefined) }, 'Plein écran');
  const saisie = el('input', { placeholder: 'Consigne privée au streamer (Entrée pour envoyer)', maxlength: 500 });
  const btUrgent = el('button', { class: 'pc-bouton', onclick: () => envoyer('urgent') }, 'Urgent');
  const vu = el('span', { class: 'pc-stats' }, '');
  saisie.addEventListener('keydown', (e) => { if (e.key === 'Enter') envoyer('info'); });

  racine.append(el('div', { class: 'pc' },
    el('header', { class: 'pc-tete' }, el('h1', {}, 'FLUX STREAMER'), etatTxt, statsTxt, mireTxt, el('span', { style: 'flex:1' }), btSon, btPlein),
    el('div', { class: 'pc-video' }, video),
    el('footer', { class: 'pc-bas' }, saisie, el('button', { class: 'pc-bouton', onclick: () => envoyer('info') }, 'Envoyer'), btUrgent, vu)));

  const r = creerRecepteurFlux({
    serveur: c.serveur, projet: c.projet, jeton: c.jeton, nom: 'Moniteur flux',
    ...(c.canal ? { canal: c.canal } : {}), ...(ice ? { iceServers: ice } : {}), ...(c.relais ? { relais: true } : {}),
    onEtat: (e) => rendre(e),
  });
  (window as unknown as { __recepteur: unknown }).__recepteur = r;   // inspection (tests, console)

  function envoyer(niveau: 'info' | 'urgent') {
    const id = r.envoyerConsigne(saisie.value, niveau);
    vu.textContent = id ? `consigne envoyée (${niveau})` : 'salle non connectée';
    if (id) saisie.value = '';
  }

  let flux: MediaStream | null = null;
  function rendre(e: EtatFlux) {
    etatTxt.textContent = LIBELLES[e.phase];
    etatTxt.dataset.phase = e.phase === 'direct' ? 'direct' : e.phase === 'attente' ? 'pret' : e.phase === 'coupe' ? 'reprise' : 'camera';
    if (e.nouvellesPistes || flux !== e.flux) {
      flux = e.flux;
      video.srcObject = e.flux;
      void video.play().catch(() => undefined);
    }
    statsTxt.textContent = e.stats && e.phase !== 'attente' ? `${resumeStats(e.stats)} · qualité ${noteQualite(e.stats)}` : e.message;
  }

  // mire de latence (si le téléphone l'envoie : streamer.html#…&mire=1)
  const toile = document.createElement('canvas');
  const mesures: number[] = [];
  setInterval(() => {
    if (r.etat().phase !== 'direct') return;
    const l = mesurerLatenceMire(video, () => r.heureServeur(), toile);
    if (l === null) return;
    mesures.push(l);
    if (mesures.length > 30) mesures.shift();
    const tri = [...mesures].sort((a, b) => a - b);
    mireTxt.textContent = `latence mesurée (mire) ${l} ms · médiane ${tri[Math.floor(tri.length / 2)]} ms`;
    (window as unknown as { __latences: number[] }).__latences = mesures;
  }, 250);
}
