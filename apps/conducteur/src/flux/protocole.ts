// Signalisation WebRTC du flux du streamer (chantier FLUX STREAMER). Logique PURE : types, constructeurs, lecture.
//
// Transport : la salle du projet (apps/serveur, message `rtc`) relaie un `signal` opaque vers une session précise
// (`vers`) ou vers tous les autres membres (`vers:'*'`). Le serveur pose `de` (session émettrice) et `par` (personne).
//
// Déroulé (le TÉLÉPHONE du streamer offre, la SORTIE répond ; pair-à-pair, un PeerConnection par récepteur) :
//   sortie    → *        recherche  « je veux le flux du canal »         (à l'ouverture, puis toutes les 5 s sans flux)
//   téléphone → *        annonce    « je diffuse » (passage EN DIRECT, reconnexion de la salle)
//   sortie    → tél.     recherche  (réponse à une annonce, ou flux perdu : renégociation complète)
//   téléphone → sortie   offre      SDP, numéro de négociation `n` (un nouveau `n` = un nouveau PeerConnection)
//   sortie    → tél.     reponse    SDP du même `n`
//   l'un      → l'autre  candidat   candidat ICE du même `n` (trickle)
//   l'un      → l'autre  fin        le direct s'arrête / la sortie se ferme
//   régie     → tél.|*   consigne   consigne privée affichée sur le téléphone (id, texte, niveau)
//   téléphone → régie    consigne-vue  accusé d'affichage
//
// Chaque signal porte `canal` (défaut 'streamer') : plusieurs téléphones peuvent coexister sur des canaux différents.

export const CANAL_DEFAUT = 'streamer';

export type NiveauConsigne = 'info' | 'urgent';

export type SignalRtc =
  | { type: 'annonce'; canal: string; nom?: string }
  | { type: 'recherche'; canal: string }
  | { type: 'offre'; canal: string; n: string; sdp: string }
  | { type: 'reponse'; canal: string; n: string; sdp: string }
  | { type: 'candidat'; canal: string; n: string; candidat: RTCIceCandidateInit }
  | { type: 'fin'; canal: string; n?: string }
  | { type: 'consigne'; canal: string; id: string; texte: string; niveau: NiveauConsigne }
  | { type: 'consigne-vue'; canal: string; id: string };

export type TypeSignal = SignalRtc['type'];

/** Message `rtc` reçu de la salle, validé. */
export interface MessageRtcRecu { de: string; par: string; signal: SignalRtc; ts: number }

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const chaine = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

export const LIMITES_SIGNAL = { sdp: 60_000, consigne: 500, id: 64, canal: 40 } as const;

/** Lit un `signal` (objet opaque relayé) ; renvoie null s'il est mal formé (on l'ignore, sans lever). */
export function lireSignal(s: unknown): SignalRtc | null {
  if (!estObjet(s) || typeof s.type !== 'string') return null;
  const canal = chaine(s.canal, LIMITES_SIGNAL.canal) ? s.canal : CANAL_DEFAUT;
  switch (s.type) {
    case 'annonce':
      return chaine(s.nom, 60) ? { type: 'annonce', canal, nom: s.nom } : { type: 'annonce', canal };
    case 'recherche':
      return { type: 'recherche', canal };
    case 'offre':
    case 'reponse':
      if (!chaine(s.n, LIMITES_SIGNAL.id) || !chaine(s.sdp, LIMITES_SIGNAL.sdp)) return null;
      return { type: s.type, canal, n: s.n, sdp: s.sdp };
    case 'candidat': {
      if (!chaine(s.n, LIMITES_SIGNAL.id) || !estObjet(s.candidat) || typeof s.candidat.candidate !== 'string') return null;
      const c: RTCIceCandidateInit = { candidate: s.candidat.candidate };
      if (typeof s.candidat.sdpMid === 'string') c.sdpMid = s.candidat.sdpMid;
      if (typeof s.candidat.sdpMLineIndex === 'number') c.sdpMLineIndex = s.candidat.sdpMLineIndex;
      if (typeof s.candidat.usernameFragment === 'string') c.usernameFragment = s.candidat.usernameFragment;
      return { type: 'candidat', canal, n: s.n, candidat: c };
    }
    case 'fin':
      return chaine(s.n, LIMITES_SIGNAL.id) ? { type: 'fin', canal, n: s.n } : { type: 'fin', canal };
    case 'consigne': {
      if (!chaine(s.id, LIMITES_SIGNAL.id) || typeof s.texte !== 'string') return null;
      const texte = s.texte.trim().slice(0, LIMITES_SIGNAL.consigne);
      if (!texte) return null;
      return { type: 'consigne', canal, id: s.id, texte, niveau: s.niveau === 'urgent' ? 'urgent' : 'info' };
    }
    case 'consigne-vue':
      return chaine(s.id, LIMITES_SIGNAL.id) ? { type: 'consigne-vue', canal, id: s.id } : null;
    default:
      return null;
  }
}

/** Lit un message serveur `{t:'rtc', de, par, signal, ts}` ; null si ce n'en est pas un ou s'il est mal formé. */
export function lireMessageRtc(m: unknown): MessageRtcRecu | null {
  if (!estObjet(m) || m.t !== 'rtc' || !chaine(m.de, 64) || typeof m.par !== 'string') return null;
  const signal = lireSignal(m.signal);
  if (!signal) return null;
  return { de: m.de, par: m.par, signal, ts: typeof m.ts === 'number' ? m.ts : 0 };
}

/** Message client complet à envoyer à la salle (utilisable tel quel par un autre client WebSocket, ex. la régie). */
export function messageRtc(vers: string, signal: SignalRtc): { t: 'rtc'; vers: string; signal: SignalRtc } {
  return { t: 'rtc', vers, signal };
}

/**
 * Consigne privée pour le streamer, prête à envoyer dans la salle par n'importe quel client déjà connecté
 * (`ws.send(JSON.stringify(messageConsigne('Rejoins la place')))`). `vers` : session du téléphone, ou '*'.
 */
export function messageConsigne(texte: string, o: { vers?: string; canal?: string; niveau?: NiveauConsigne; id?: string } = {}) {
  return messageRtc(o.vers ?? '*', {
    type: 'consigne', canal: o.canal ?? CANAL_DEFAUT, id: o.id ?? idAleatoire('cons_'),
    texte: texte.trim().slice(0, LIMITES_SIGNAL.consigne), niveau: o.niveau ?? 'info',
  });
}

/** Identifiant compatible avec la salle ([A-Za-z0-9_-]{6,64}). */
export function idAleatoire(prefixe = '', longueur = 12): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const octets = new Uint8Array(longueur);
  crypto.getRandomValues(octets);
  let s = prefixe;
  for (const o of octets) s += alphabet[o % alphabet.length];
  return s;
}
