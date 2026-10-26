// Page comédien : micro (Web Speech API, fr-FR) -> événements asr ; champ de secours ; chat vu du streamer.
import { connecter, libelleEtat } from '../commun/ws.js';
import { creerChat } from '../commun/chatvue.js';

const $ = (id) => document.getElementById(id);
const chat = creerChat($('chat'), { max: 30, signe: true });   // signe : seulement si le serveur envoie `origine` (marquage = discret)

// ---------- connexion ----------
const ws = connecter({
  role: 'comedien',
  onEtat(etat, detail) {
    $('ws').dataset.etat = etat === 'attente' && detail.essai >= 1 ? 'indisponible' : etat;
    $('wsTxt').textContent = libelleEtat(etat, detail);
  },
  onMessage(m) {
    if (m.t === 'welcome') {
      chat.historique(m.historique);
      majMarquage(m.etat && m.etat.marquage);
    } else if (m.t === 'chat') {
      chat.ajouter(m);
      if (m.origine) majMarquage('discret');      // origine reçue = le serveur est en mode discret
    }
  },
});

function majMarquage(v) {
  if (!v) return;
  $('marqVal').textContent = v === 'discret'
    ? 'discret (un point creux suit les répliques de figurants)'
    : 'masqué (rien ne distingue les figurants)';
}

// ---------- champ de secours ----------
$('formSecours').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const champ = $('dire');
  const texte = champ.value.trim();
  if (!texte) return;
  const tc = Date.now();
  ws.asr('final', texte, tc, tc);
  montrerFinal(texte);
  champ.value = '';
  champ.focus();
});

function montrerFinal(texte) {
  $('final').textContent = texte;
  $('partiel').textContent = '';
}

// ---------- reconnaissance vocale ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const bouton = $('micro');
const alerte = $('alerte');

function alerter(titre, detail) {
  alerte.hidden = !titre;
  alerte.textContent = '';
  if (!titre) return;
  const s = document.createElement('strong');
  s.textContent = titre;
  alerte.append(s, detail || '');
}

function etatMic(etat, texte) {
  $('micEtat').dataset.etat = etat;
  $('micTxt').textContent = texte;
}

let voulu = false;       // l'utilisateur veut le micro allumé
let rec = null;
let essais = 0;          // erreurs consécutives (backoff)
let derniereErreur = null;
let partielPrec = '';
let partielT = 0;        // heure client du dernier partiel de la phrase en cours (~ fin de la voix)
let minuteurVoix = null;
let minuteurRelance = null;

function lancer() {
  clearTimeout(minuteurRelance);
  if (!voulu) return;
  rec = new SR();
  rec.lang = 'fr-FR';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onstart = () => { etatMic('ecoute', 'le micro écoute'); alerter(null); };

  rec.onresult = (e) => {
    essais = 0; derniereErreur = null;
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const txt = r[0].transcript.trim();
      if (r.isFinal) {
        if (txt) {
          const tc = Date.now();
          ws.asr('final', txt, tc, partielT || tc);   // tFinPhrase : dernier partiel vu pour cette phrase
          montrerFinal(txt);
        }
        partielPrec = ''; partielT = 0;
      } else {
        interim += r[0].transcript;
      }
    }
    interim = interim.trim();
    if (interim && interim !== partielPrec) {
      partielPrec = interim; partielT = Date.now();
      ws.asr('partial', interim, partielT);
      $('partiel').textContent = interim;
      $('micEtat').classList.add('voix');
      clearTimeout(minuteurVoix);
      minuteurVoix = setTimeout(() => $('micEtat').classList.remove('voix'), 500);
    }
  };

  rec.onerror = (e) => {
    derniereErreur = e.error;
    switch (e.error) {
      case 'not-allowed':
      case 'service-not-allowed':
        voulu = false;
        etatMic('erreur', 'micro refusé');
        alerter('Micro refusé', "Autorise le micro pour ce site (icône à gauche de la barre d'adresse), puis relance.");
        break;
      case 'audio-capture':
        etatMic('erreur', 'aucun micro détecté');
        alerter('Aucun micro détecté', 'Branche un micro ou choisis-en un dans les réglages du navigateur. Nouvel essai automatique.');
        break;
      case 'network':
        etatMic('erreur', 'réseau : relance automatique');
        alerter('Service vocal injoignable', "Chrome n'arrive pas à joindre le service de reconnaissance (réseau). Nouvel essai automatique.");
        break;
      case 'no-speech':
      case 'aborted':
        derniereErreur = null;       // banal : onend relance tout de suite
        break;
      default:
        etatMic('erreur', 'erreur : ' + e.error);
    }
  };

  rec.onend = () => {
    rec = null;
    $('micEtat').classList.remove('voix');
    if (!voulu) {
      if (derniereErreur !== 'not-allowed' && derniereErreur !== 'service-not-allowed') etatMic('arrete', 'micro arrêté');
      majBouton();
      return;
    }
    if (derniereErreur) essais += 1;
    const delai = derniereErreur ? Math.min(8000, 400 * Math.pow(2, essais)) : 150;
    if (!derniereErreur) etatMic('relance', 'relance du micro…');
    minuteurRelance = setTimeout(lancer, delai);
  };

  try {
    etatMic('demarrage', 'démarrage du micro…');
    rec.start();
  } catch (err) {
    // InvalidStateError : une session tourne encore ; on réessaie bientôt
    minuteurRelance = setTimeout(lancer, 500);
  }
}

function majBouton() {
  bouton.textContent = voulu ? 'Arrêter le micro' : 'Démarrer le micro';
  bouton.classList.toggle('actif', voulu);
}

function basculer() {
  if (voulu) {
    voulu = false;
    clearTimeout(minuteurRelance);
    if (rec) { try { rec.stop(); } catch (e) { /* déjà arrêté */ } }
    else etatMic('arrete', 'micro arrêté');
  } else {
    voulu = true; essais = 0; derniereErreur = null;
    lancer();
  }
  majBouton();
}

if (!SR) {
  bouton.disabled = true;
  etatMic('erreur', 'reconnaissance vocale absente');
  alerter('Ouvrir dans Chrome sur ordinateur', "Ce navigateur n'a pas la reconnaissance vocale (Web Speech API). Le champ « dire au chat » reste utilisable.");
} else if (!window.isSecureContext) {
  bouton.disabled = true;
  etatMic('erreur', 'contexte non sécurisé');
  alerter('Contexte non sécurisé', 'Le micro exige https ou http://localhost. Ouvre http://localhost:8787 sur la machine du serveur (ou via un tunnel ssh), ou passe par https avec « tailscale serve ». Le champ « dire au chat » reste utilisable.');
} else {
  bouton.addEventListener('click', basculer);
}
window.addEventListener('pagehide', () => { voulu = false; if (rec) { try { rec.abort(); } catch (e) { /* rien */ } } });
