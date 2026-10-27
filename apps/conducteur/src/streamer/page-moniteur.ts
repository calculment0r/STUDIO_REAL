// Moniteur de réception (PC de régie ou de scène) : la vidéo du streamer, son COUPÉ par défaut (bouton pour
// l'activer), chemin obtenu (direct / relais), statistiques (latence, images/s, débit), mire de latence quand le
// téléphone l'envoie, et envoi de consignes privées au téléphone. Sert de contrôle et de plan B à la sortie.
import { creerRecepteurFlux, type EtatFlux } from '../flux/recepteur';
import { lireIce } from '../flux/ice';
import { mesurerLatenceMire } from '../flux/mire';
import { noteQualite, resumeStats } from '../flux/stats';
import type { ConfigPage } from './config';
import { el } from './dom';
import { ajouterTransport, definirSalleFlux, demarrerRelais, publierScene, useSortie, type EtatRelais } from '../sortie/relais';
import { transportLocal } from '../sortie/canal';
import { TransportSalle } from '../sortie/salle';

/** Identifiant de personne pour la salle ([A-Za-z0-9_-]{6,64}). */
function idMoniteur(): string {
  const a = new Uint8Array(10);
  crypto.getRandomValues(a);
  return 'moniteur_' + Array.from(a, (x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
}

/** Retour de la sortie lu dans le battement « present » : connectée ou non, scène montrée, média introuvable. */
export function texteRetourSortie(s: Pick<EtatRelais, 'fenetre' | 'sceneVue' | 'sortie' | 'salle' | 'autreRegie'>): string {
  const salle = s.salle === 'connecte' ? ' · salle connectée' : s.salle === 'aucune' ? '' : ` · salle ${s.salle}`;
  if (s.fenetre !== 'connectee') return `sortie : non vue (ouvrez-la depuis la page de démarrage)${salle}`;
  const absent = s.sortie?.absent ? ` · ⚠ ${s.sortie.absent} introuvable — choisir le dossier médias sur la sortie (touche M)` : '';
  return `sortie : connectée · montre ${s.sceneVue ?? '?'}${s.autreRegie ? ' (autre régie)' : ''}${absent}${salle}`;
}

/**
 * Barre « SCÈNE » : pilotage manuel de la sortie Écran scène — direct du streamer, vidéo précalculée (lue en local par
 * la sortie, depuis ses médias), noir, QR du public, avec le temps de fondu. Publie sur le canal local (sortie dans ce
 * navigateur) ET par la salle du projet (sortie sur une autre machine) ; la sortie garde la commande la plus récente,
 * d'où qu'elle vienne (Conducteur, autre moniteur). Le retour de la sortie (scène montrée, vidéo introuvable)
 * s'affiche au bout de la barre. En spectacle, c'est la conduite qui pilote, par le même chemin.
 */
function barreScene(c: ConfigPage): HTMLElement {
  ajouterTransport(transportLocal());
  if (c.projet && c.jeton) {
    // la sortie de ce navigateur, ouverte sans adresse de salle, reçoit le flux du streamer de la même salle
    definirSalleFlux({ serveur: c.serveur, projet: c.projet, jeton: c.jeton });
    ajouterTransport(new TransportSalle({ serveur: c.serveur, projet: c.projet, jeton: c.jeton, role: 'regie', personne: idMoniteur(), nom: 'Moniteur · scène' }));
  }
  demarrerRelais();
  const fondu = el('input', { type: 'range', min: 0, max: 2000, step: 100, value: 800, title: 'fondu (ms)' });
  const fonduTxt = el('span', { class: 'pc-stats' }, '0,8 s');
  fondu.addEventListener('input', () => { fonduTxt.textContent = (Number(fondu.value) / 1000).toFixed(1).replace('.', ',') + ' s'; });
  const asset = el('input', { value: 'test-h3.mp4', size: 18, title: 'nom du fichier dans le dossier médias de la sortie', 'data-asset-scene': '' });
  const retour = el('span', { class: 'pc-stats', 'data-retour-sortie': '' }, '');
  const majRetour = () => { retour.textContent = texteRetourSortie(useSortie.getState()); };
  useSortie.subscribe(majRetour);
  majRetour();
  const boucle = el('input', { type: 'checkbox', checked: true });
  const f = () => Number(fondu.value);
  const bouton = (txt: string, cmd: () => void) => el('button', { class: 'pc-bouton', onclick: cmd }, txt);
  return el('div', { class: 'pc-bas' },
    el('span', { class: 'pc-stats' }, 'SCÈNE'),
    bouton('DIRECT', () => publierScene({ scene: 'streamer' }, { fondu: f() })),
    bouton('VIDÉO', () => { const a = asset.value.trim(); if (a) publierScene({ scene: 'video', asset: a, boucle: boucle.checked, cadrage: 'contain' }, { fondu: f() }); }),
    asset, el('label', { class: 'pc-stats' }, boucle, ' boucle'),
    bouton('NOIR', () => publierScene({ scene: 'noir' }, { fondu: f() })),
    bouton('QR PUBLIC', () => publierScene({ scene: 'accueil-qr' }, { fondu: f() })),
    el('span', { class: 'pc-stats' }, 'fondu'), fondu, fonduTxt, retour);
}

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
    barreScene(c),
    el('div', { class: 'pc-video' }, video),
    el('footer', { class: 'pc-bas' }, saisie, el('button', { class: 'pc-bouton', onclick: () => envoyer('info') }, 'Envoyer'), btUrgent, vu)));

  // Déclaré AVANT le récepteur : il appelle onEtat dès sa création (ReferenceError « before initialization » sinon).
  let flux: MediaStream | null = null;
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
