// Entrée de streamer.html : téléphone du streamer (défaut), moniteur de réception, ou accueil de l'essai réel.
import '../theme/index.css';
import './streamer.css';
import { CLE_CONFIG, lireConfig, type ConfigPage } from './config';
import { el } from './dom';
import { pageAccueil } from './page-accueil';
import { pageMoniteur } from './page-moniteur';
import { pageStreamer } from './page-streamer';

function configuration(): ConfigPage | null {
  const lue = lireConfig(location.search, location.hash);
  try {
    if (lue) {
      // le téléphone garde aussi son lien en mémoire ; l'adresse reste ENTIÈRE dans la barre (le fragment # ne part
      // jamais au serveur) pour qu'un favori ou « Sur l'écran d'accueil » (stockage séparé sur iOS) la retrouve
      if (lue.role === 'streamer') localStorage.setItem(CLE_CONFIG, JSON.stringify(lue));
      return lue;
    }
    const gardee = localStorage.getItem(CLE_CONFIG);
    return gardee ? (JSON.parse(gardee) as ConfigPage) : null;
  } catch {
    return lue;
  }
}

const racine = document.getElementById('app')!;
const c = configuration();
if (!c) {
  racine.append(el('div', { class: 'st' }, el('div', { class: 'st-voile' }, el('div', {},
    el('h1', {}, 'LIEN INCOMPLET'),
    el('p', {}, 'Ouvrez cette page avec l\'adresse préparée par la régie (favori ou icône sur l\'écran d\'accueil) : elle contient le serveur, le projet et le jeton.')))));
} else if (c.role === 'accueil') {
  document.title = 'Studio Real · Essai streamer';
  pageAccueil(racine, c);
} else if (c.role === 'moniteur') {
  document.title = 'Studio Real · Moniteur du flux';
  pageMoniteur(racine, c);
} else {
  pageStreamer(racine, c);
}
