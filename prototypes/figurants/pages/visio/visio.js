// Visio d'Écho : le téléphone de Franck et celui de la ministre filment ; l'écran scène montre les deux.
// Liaisons (WebRTC pair à pair, signalisation par le serveur, message `rtc`) :
//   franck → scène (image + son, son COUPÉ par défaut sur la scène : Franck est dans la salle)
//   franck → ministre (pour qu'elle le voie et l'entende)
//   ministre → scène (image + son, sur la sono)
import { connecter, libelleEtat } from '../commun/ws.js';

const $ = (id) => document.getElementById(id);
const poste = document.body.dataset.poste;                 // franck | ministre | scene
const ENVOIE = { franck: ['scene', 'ministre'], ministre: ['scene'], scene: [] }[poste];
const ICE = [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }];

let local = null;
const connus = new Set();          // postes présents
const pcs = new Map();             // autre poste → RTCPeerConnection
const etats = new Map();

const ws = connecter({
  role: 'visio',
  pseudo: poste,
  onEtat(e, d) { $('ws').textContent = libelleEtat(e, d); if (e === 'ouvert') envoyer({ type: 'present', poste }); },
  onMessage(m) { if (m.t === 'rtc') void recevoir(m); },
});
function envoyer(o) { ws.envoyer({ t: 'rtc', ...o }, false); }

function majEtat() { $('liaisons').textContent = [...etats].map(([k, v]) => `${k} : ${v}`).join(' · ') || 'en attente des autres postes'; }

function nouveauPc(autre) {
  pcs.get(autre)?.close();
  const pc = new RTCPeerConnection({ iceServers: ICE });
  pc.onicecandidate = (e) => { if (e.candidate) envoyer({ type: 'ice', vers: autre, data: e.candidate }); };
  pc.ontrack = (e) => montrerDistant(autre, e.streams[0]);
  pc.onconnectionstatechange = () => { etats.set(autre, pc.connectionState); majEtat(); };
  pcs.set(autre, pc);
  return pc;
}

async function appeler(autre) {
  if (!local || !ENVOIE.includes(autre)) return;
  const pc = nouveauPc(autre);
  for (const t of local.getTracks()) pc.addTrack(t, local);
  await pc.setLocalDescription(await pc.createOffer());
  envoyer({ type: 'offre', vers: autre, data: pc.localDescription });
}

async function recevoir(m) {
  if (m.type === 'presents') { for (const p of m.postes || []) { connus.add(p); void appeler(p); } return; }
  if (m.type === 'present') { connus.add(m.de); void appeler(m.de); return; }
  if (m.type === 'offre') {
    const pc = nouveauPc(m.de);
    await pc.setRemoteDescription(m.data);
    await pc.setLocalDescription(await pc.createAnswer());
    envoyer({ type: 'reponse', vers: m.de, data: pc.localDescription });
    return;
  }
  const pc = pcs.get(m.de);
  if (!pc) return;
  if (m.type === 'reponse') await pc.setRemoteDescription(m.data);
  else if (m.type === 'ice') { try { await pc.addIceCandidate(m.data); } catch (e) { /* candidat périmé */ } }
}

function montrerDistant(autre, flux) {
  const v = $('v_' + autre);
  if (!v || v.srcObject === flux) return;
  v.srcObject = flux;
  v.play().catch(() => { const b = $('sonBloque'); if (b) b.hidden = false; });
}

// caméra (téléphones) : le geste de l'utilisateur est obligatoire sur iPhone
const bCam = $('camera');
if (bCam) bCam.addEventListener('click', async () => {
  bCam.disabled = true; bCam.textContent = 'Ouverture…';
  try {
    local = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    $('moi').srcObject = local;
    $('moi').play().catch(() => undefined);
    bCam.hidden = true;
    for (const p of connus) void appeler(p);
    const v = $('v_franck'); if (v) v.play().catch(() => undefined);   // la ministre : le son de Franck, débloqué par ce geste
  } catch (e) {
    bCam.disabled = false; bCam.textContent = 'RÉESSAYER (' + (e.name || 'erreur') + ')';
  }
});

// écran scène : son de la ministre sur la sono, son de Franck coupé par défaut
const bSonFranck = $('sonFranck');
if (bSonFranck) bSonFranck.addEventListener('click', () => {
  const v = $('v_franck'); v.muted = !v.muted;
  bSonFranck.textContent = v.muted ? 'son de Franck : COUPÉ' : 'son de Franck : ACTIF';
  bSonFranck.classList.toggle('actif', !v.muted);
});
const bSon = $('sonBloque');
if (bSon) bSon.addEventListener('click', () => { for (const v of document.querySelectorAll('video.distant')) v.play().catch(() => undefined); bSon.hidden = true; });
document.addEventListener('keydown', (e) => {
  if ((e.key === 'f' || e.key === 'F') && poste === 'scene') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
});
majEtat();
