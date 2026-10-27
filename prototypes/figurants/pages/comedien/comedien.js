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
      asrServeur = !!m.asr_serveur && new URLSearchParams(location.search).get('asr') !== 'navigateur';
      majModeAsr();
    } else if (m.t === 'asr' && asrServeur) {
      // transcription Whisper renvoyée par le serveur
      if (m.kind === 'final') montrerFinal(m.texte); else $('partiel').textContent = m.texte;
    } else if (m.t === 'asr.etat') {
      if (m.etat === 'voix') $('micEtat').classList.add('voix');
      else if (m.etat === 'silence') $('micEtat').classList.remove('voix');
      else if (m.etat === 'erreur') alerter('Transcription en panne', 'Le service Whisper ne répond pas (' + (m.detail || '') + '). Le champ « dire au chat » reste utilisable.');
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
let minuteurSilence = null;
const SILENCE_MS = 1100; // fin de phrase décidée par nous : 1,1 s sans nouveau mot
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

  // Une session de reconnaissance = une phrase. Safari découpe la phrase en plusieurs résultats et
  // n'en marque « final » que tard (5 à 7 s mesurés le 27/10) : on recolle TOUS les résultats de la
  // session, et c'est nous qui finalisons après SILENCE_MS sans nouveau mot, puis on relance l'écoute.
  const session = rec;
  let envoye = false;
  const finaliser = () => {
    if (envoye || session !== rec) return;
    const txt = partielPrec.trim();
    if (!txt) return;
    envoye = true;
    const tc = Date.now();
    ws.asr('final', txt, tc, partielT || tc);   // tFinPhrase : dernier partiel vu pour cette phrase
    montrerFinal(txt);
    partielPrec = ''; partielT = 0; $('partiel').textContent = '';
    try { session.stop(); } catch (e) { /* déjà arrêtée : onend relance */ }
  };
  rec.onresult = (e) => {
    if (envoye || session !== rec) return;
    essais = 0; derniereErreur = null;
    const tout = Array.from(e.results, (r) => r[0].transcript).join(' ').replace(/\s+/g, ' ').trim();
    const toutFinal = e.results.length > 0 && Array.from(e.results).every((r) => r.isFinal);
    if (tout && tout !== partielPrec) {
      partielPrec = tout; partielT = Date.now();
      ws.asr('partial', tout, partielT);
      $('partiel').textContent = tout;
      $('micEtat').classList.add('voix');
      clearTimeout(minuteurVoix);
      minuteurVoix = setTimeout(() => $('micEtat').classList.remove('voix'), 500);
    }
    clearTimeout(minuteurSilence);
    if (toutFinal) finaliser();
    else minuteurSilence = setTimeout(finaliser, SILENCE_MS);
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
    clearTimeout(minuteurSilence);
    // phrase en cours non finalisée (coupure de Safari) : on l'envoie quand même
    if (partielPrec.trim()) { const tc = Date.now(); ws.asr('final', partielPrec.trim(), tc, partielT || tc); montrerFinal(partielPrec.trim()); }
    partielPrec = ''; partielT = 0;
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

// ---------- transcription côté serveur (Whisper sur un DGX) ----------
// Le micro part en brut vers le serveur : PCM 16 bits, mono, 16 kHz, trames de 100 ms. Le serveur découpe les
// phrases au silence et renvoie partiels et finals. Bien plus juste et plus rapide que la reconnaissance de Safari.
let asrServeur = false;
let flux = null;            // { ctx, source, proc, stream }

function majModeAsr() {
  $('modeAsr').textContent = asrServeur ? 'Whisper (serveur)' : 'reconnaissance du navigateur';
  if (asrServeur && !window.isSecureContext) bouton.disabled = true;
  else if (asrServeur) { bouton.disabled = false; alerter(null); }
}

async function demarrerFlux() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) { /* rien */ }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();                       // créé dans le geste (clic) : obligatoire sur iPhone
  etatMic('demarrage', 'démarrage du micro…');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    ctx.close();
    etatMic('erreur', 'micro refusé');
    alerter('Micro refusé', "Autorise le micro pour ce site, puis relance. (" + (e.name || e) + ')');
    return false;
  }
  await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const ratio = ctx.sampleRate / 16000;
  let acc = new Int16Array(1600); let n = 0; let pos = 0;   // pos : position fractionnaire dans l'entrée
  proc.onaudioprocess = (ev) => {
    const ent = ev.inputBuffer.getChannelData(0);
    // décimation par moyenne de la fenêtre (anti-repliement simple) vers 16 kHz
    for (; pos < ent.length; pos += ratio) {
      const a = Math.floor(pos); const b = Math.min(ent.length, Math.floor(pos + ratio)) || a + 1;
      let s = 0; for (let k = a; k < b; k++) s += ent[k];
      const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
      acc[n++] = v * 32767;
      if (n === acc.length) { ws.audio(acc.buffer); acc = new Int16Array(1600); n = 0; }
    }
    pos -= ent.length;
  };
  source.connect(proc);
  proc.connect(ctx.destination);                // nécessaire pour que le traitement tourne (sortie silencieuse)
  flux = { ctx, source, proc, stream };
  etatMic('ecoute', 'le micro écoute (Whisper)');
  return true;
}

function arreterFlux() {
  if (!flux) return;
  try { flux.proc.disconnect(); flux.source.disconnect(); } catch (e) { /* rien */ }
  flux.stream.getTracks().forEach((t) => t.stop());
  flux.ctx.close();
  flux = null;
  etatMic('arrete', 'micro arrêté');
  $('micEtat').classList.remove('voix');
}

async function basculerFlux() {
  if (flux) { arreterFlux(); voulu = false; }
  else { voulu = await demarrerFlux(); }
  majBouton();
}

bouton.addEventListener('click', () => (asrServeur ? basculerFlux() : basculer()));
if (!window.isSecureContext) {
  bouton.disabled = true;
  etatMic('erreur', 'contexte non sécurisé');
  alerter('Contexte non sécurisé', 'Le micro exige https ou http://localhost. Le champ « dire au chat » reste utilisable.');
} else if (!SR) {
  // sans reconnaissance du navigateur, le bouton ne sert que si le serveur fait la transcription (annoncé par welcome)
  bouton.disabled = true;
  etatMic('arrete', 'en attente du serveur…');
}
window.addEventListener('pagehide', () => { voulu = false; arreterFlux(); if (rec) { try { rec.abort(); } catch (e) { /* rien */ } } });
