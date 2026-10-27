// Page de démarrage de l'essai réel (ouverte sur le PC par le lien que donne essai-reel.mjs) : un bouton par
// rôle, avec le bon projet et le bon jeton. Le streamer n'a PAS de QR code (le QR est réservé au public, projeté
// par la sortie) : il reçoit une ADRESSE préparée avec lui (serveur, projet, rôle, jeton), envoyée par SMS ou
// AirDrop, qu'il garde en favori ou sur l'écran d'accueil de son téléphone et ouvre seul, sans rien taper.
import { aUnTurn, CLE_STOCKAGE_ICE, encoderIce, ICE_PAR_DEFAUT, lireIce } from '../flux/ice';
import { lienRole, lienSortie, type ConfigPage } from './config';
import { el } from './dom';

export function pageAccueil(racine: HTMLElement, c: ConfigPage): void {
  const base = location.origin + location.pathname;
  const ice = lireIce(c.ice);
  // la sortie (sortie.html, même origine) lit sa configuration ICE ici : on pose ou on retire le TURN de l'essai
  try {
    if (ice) localStorage.setItem(CLE_STOCKAGE_ICE, encoderIce(ice)); else localStorage.removeItem(CLE_STOCKAGE_ICE);
  } catch { /* stockage indisponible */ }
  // l'adresse du streamer porte le serveur explicitement (elle doit marcher seule, ouverte d'un favori)
  const commun = { serveur: c.serveur || location.origin, projet: c.projet, jeton: c.jeton, ...(c.canal ? { canal: c.canal } : {}), ...(c.ice ? { ice: c.ice } : {}), ...(c.relais ? { relais: true } : {}) };
  const lienTel = lienRole(base, 'streamer', commun);
  const lienTelMire = lienRole(base, 'streamer', { ...commun, mire: true });
  const lienMoniteur = lienRole(base, 'moniteur', { ...commun, serveur: c.serveur });
  // stats=1 : incrustation de contrôle du flux (chemin, latence, images/s, débit) posée par src/flux sur la sortie
  const lienSortieScene = lienSortie(location.origin, { ...commun, serveur: c.serveur }) + '&stats=1';

  const securise = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  const ouvrir = (u: string) => () => { window.open(u, '_blank'); };
  const reseau = ice && aUnTurn(ice) ? 'STUN + TURN (relais possible : 4G, NAT stricts)' : `STUN seul (${(ice ?? ICE_PAR_DEFAUT).length} serveur) : même Wi-Fi conseillé`;

  const blocAdresse = (lien: string, etiquette: string) => {
    const zone = el('textarea', { class: 'acc-adresse', readonly: true, rows: 4, spellcheck: 'false', 'aria-label': etiquette });
    zone.value = lien;
    zone.addEventListener('focus', () => zone.select());
    const retour = el('span', { class: 'acc-copie' }, '');
    const copier = el('button', { class: 'st-gros', onclick: async () => {
      try { await navigator.clipboard.writeText(lien); retour.textContent = 'copiée ✓ — envoyez-la au comédien (SMS, AirDrop)'; }
      catch { zone.focus(); zone.select(); retour.textContent = 'sélectionnée : Ctrl+C pour copier'; }
    } }, 'COPIER L\'ADRESSE');
    return el('div', { class: 'acc-bloc' }, zone, el('div', { class: 'st-ligne' }, copier, retour));
  };

  racine.append(el('div', { class: 'acc' }, el('div', { class: 'acc-boite' },
    el('div', {}, el('div', { class: 'f-micro' }, 'studio real · essai réel du flux streamer'), el('h1', {}, 'QUI ÊTES-VOUS ?')),
    securise ? null : el('p', { class: 'acc-note' }, '⚠ Page servie sans HTTPS : la caméra du téléphone sera refusée. Passez par l\'adresse https du tunnel.'),
    el('section', { class: 'acc-carte' },
      el('h2', {}, 'L\'adresse du streamer'),
      el('p', {}, 'À envoyer au comédien. Sur son iPhone : ouvrir le lien, « Partager › Sur l\'écran d\'accueil » (ou favori), puis l\'ouvrir de là. Elle contient le serveur, le projet, le rôle et le jeton : ne la diffusez pas.'),
      blocAdresse(lienTel, 'adresse du streamer')),
    el('div', { class: 'acc-roles' },
      el('section', { class: 'acc-carte' },
        el('h2', {}, 'Sortie écran (PC du projecteur)'),
        el('p', {}, 'Ouvre la sortie écran scène. Glissez la fenêtre sur le projecteur, puis plein écran.'),
        el('button', { class: 'st-gros', onclick: ouvrir(lienSortieScene) }, 'SORTIE ÉCRAN'),
        el('p', {}, 'Contrôle du flux seul (vidéo, son, chemin, statistiques, consignes) :'),
        el('button', { class: 'st-gros second', onclick: ouvrir(lienMoniteur) }, 'MONITEUR DU FLUX')),
      el('section', { class: 'acc-carte' },
        el('h2', {}, 'Téléphone du streamer'),
        el('p', {}, 'Si cette page est ouverte sur le téléphone :'),
        el('button', { class: 'st-gros', onclick: () => { location.href = lienTel; } }, 'JE SUIS LE STREAMER'),
        el('p', {}, 'Mesure de latence (option) : cette adresse envoie une mire horodatée au lieu de la caméra ; le moniteur affiche la latence mesurée de bout en bout.'),
        blocAdresse(lienTelMire, 'adresse du streamer en mode mire'))),
    el('p', { class: 'acc-note' }, `Réseau : ${reseau}. Projet `, el('code', {}, c.projet), '.'),
  )));
}
