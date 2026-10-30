// Signaux WebRTC de la visio (téléphones nommés ↔ scène), relayés par le serveur de spectacle (message `rtc`).
//
// COPIE de fonctions pures de apps/conducteur/src/flux/ (protocole.ts : lecture des signaux ; codec.ts : préférence
// H.264) : le paquet @studio-real/ui-telephone ne doit pas importer une application. Même format que le flux du
// streamer (`offre` → `reponse` → `candidat`, `fin`, `recherche`, numéro de négociation `n`), plus deux champs :
//   - `canal: 'visio'` (le flux du streamer garde son canal à lui) ;
//   - `de: <acteur>` : le serveur de spectacle pose `de` = SESSION de l'émetteur sur le message ; l'acteur (franck,
//     ministre, scene) voyage dans le signal.
// Envoi : rtc{vers: <acteur ou session>, signal}. Réception : rtc{de: <session>, vers, signal, ts}.

export const CANAL_VISIO = 'visio';
export const LIMITES_SIGNAL_VISIO = { sdp: 60_000, id: 64 } as const;

export type SignalVisio =
  | { type: 'recherche'; canal: typeof CANAL_VISIO; de: string }
  | { type: 'offre'; canal: typeof CANAL_VISIO; de: string; n: string; sdp: string }
  | { type: 'reponse'; canal: typeof CANAL_VISIO; de: string; n: string; sdp: string }
  | { type: 'candidat'; canal: typeof CANAL_VISIO; de: string; n: string; candidat: RTCIceCandidateInit }
  | { type: 'fin'; canal: typeof CANAL_VISIO; de: string; n?: string };

/** Un message `rtc` de la visio reçu du serveur : `session` = session de l'émetteur (pour lui répondre). */
export interface RtcVisioRecu { session: string; signal: SignalVisio }

const RE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const chaine = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
export const estIdVisio = (v: unknown): v is string => typeof v === 'string' && RE_ID.test(v);

/** Lit un signal de la visio ; null s'il est mal formé ou d'un autre canal (on l'ignore, sans lever). */
export function lireSignalVisio(s: unknown): SignalVisio | null {
  if (!estObjet(s) || s.canal !== CANAL_VISIO || !estIdVisio(s.de)) return null;
  const base = { canal: CANAL_VISIO, de: s.de } as const;
  switch (s.type) {
    case 'recherche':
      return { type: 'recherche', ...base };
    case 'offre':
    case 'reponse':
      if (!estIdVisio(s.n) || !chaine(s.sdp, LIMITES_SIGNAL_VISIO.sdp)) return null;
      return { type: s.type, ...base, n: s.n, sdp: s.sdp };
    case 'candidat': {
      if (!estIdVisio(s.n) || !estObjet(s.candidat) || typeof s.candidat.candidate !== 'string') return null;
      const c: RTCIceCandidateInit = { candidate: s.candidat.candidate };
      if (typeof s.candidat.sdpMid === 'string') c.sdpMid = s.candidat.sdpMid;
      if (typeof s.candidat.sdpMLineIndex === 'number') c.sdpMLineIndex = s.candidat.sdpMLineIndex;
      if (typeof s.candidat.usernameFragment === 'string') c.usernameFragment = s.candidat.usernameFragment;
      return { type: 'candidat', ...base, n: s.n, candidat: c };
    }
    case 'fin':
      return estIdVisio(s.n) ? { type: 'fin', ...base, n: s.n } : { type: 'fin', ...base };
    default:
      return null;
  }
}

/** Lit un message serveur `rtc{de, vers, signal, ts}` de la visio ; null sinon. */
export function lireRtcVisio(m: unknown): RtcVisioRecu | null {
  if (!estObjet(m) || m.t !== 'rtc' || !estIdVisio(m.de)) return null;
  const signal = lireSignalVisio(m.signal);
  return signal ? { session: m.de, signal } : null;
}

// ── Préférence H.264 (copie de apps/conducteur/src/flux/codec.ts) ──────────────────────────────────────────────────
// H.264 d'abord (encodeur matériel de l'iPhone, décodage partout), paquetisation 1 et profil 42e01f en tête.

export interface CodecLike { mimeType: string; sdpFmtpLine?: string }

function score(c: CodecLike, prefere: string): number {
  const mime = c.mimeType.toLowerCase();
  if (mime !== prefere.toLowerCase()) return /\/(rtx|red|ulpfec|flexfec-03)$/i.test(mime) ? 0 : 1;
  const f = (c.sdpFmtpLine ?? '').toLowerCase();
  let s = 10;
  if (f.includes('packetization-mode=1')) s += 4;
  if (f.includes('profile-level-id=42e01f')) s += 2;
  else if (f.includes('profile-level-id=42')) s += 1;
  return s;
}

/** Trie les codecs : le type préféré d'abord (tri stable). */
export function ordonnerCodecs<T extends CodecLike>(codecs: readonly T[], prefere = 'video/H264'): T[] {
  return codecs.map((c, i) => ({ c, i, s: score(c, prefere) })).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.c);
}

/** Applique la préférence H.264 à un transceiver vidéo, si le navigateur le permet. Renvoie vrai si appliquée. */
export function preferH264(t: RTCRtpTransceiver, sens: 'envoi' | 'reception'): boolean {
  try {
    const caps = sens === 'envoi'
      ? (typeof RTCRtpSender !== 'undefined' ? RTCRtpSender.getCapabilities?.('video') : null)
      : (typeof RTCRtpReceiver !== 'undefined' ? RTCRtpReceiver.getCapabilities?.('video') : null);
    if (!caps || !caps.codecs.some(c => c.mimeType.toLowerCase() === 'video/h264') || !t.setCodecPreferences) return false;
    t.setCodecPreferences(ordonnerCodecs(caps.codecs));
    return true;
  } catch {
    return false;
  }
}
