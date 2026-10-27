// Préférence de codec vidéo : H.264 d'abord (encodeur matériel de l'iPhone, décodage partout), en mode de
// paquetisation 1 et profil « constrained baseline » (42e01f) en tête pour la compatibilité, puis le reste.

export interface CodecLike { mimeType: string; sdpFmtpLine?: string }

function score(c: CodecLike, prefere: string): number {
  const mime = c.mimeType.toLowerCase();
  if (mime !== prefere.toLowerCase()) {
    // les codecs auxiliaires (rtx, red, ulpfec) restent derrière les vrais codecs
    return /\/(rtx|red|ulpfec|flexfec-03)$/i.test(mime) ? 0 : 1;
  }
  const f = (c.sdpFmtpLine ?? '').toLowerCase();
  let s = 10;
  if (f.includes('packetization-mode=1')) s += 4;
  if (f.includes('profile-level-id=42e01f')) s += 2;
  else if (f.includes('profile-level-id=42')) s += 1;
  return s;
}

/** Trie les codecs : le type préféré d'abord (tri stable). */
export function ordonnerCodecs<T extends CodecLike>(codecs: readonly T[], prefere = 'video/H264'): T[] {
  return codecs.map((c, i) => ({ c, i, s: score(c, prefere) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.c);
}

/** Applique la préférence H.264 à un transceiver vidéo, si le navigateur le permet. Renvoie vrai si appliquée. */
export function preferH264(t: RTCRtpTransceiver, sens: 'envoi' | 'reception'): boolean {
  try {
    const caps = sens === 'envoi' ? RTCRtpSender.getCapabilities?.('video') : RTCRtpReceiver.getCapabilities?.('video');
    if (!caps || !caps.codecs.some((c) => c.mimeType.toLowerCase() === 'video/h264') || !t.setCodecPreferences) return false;
    t.setCodecPreferences(ordonnerCodecs(caps.codecs));
    return true;
  } catch {
    return false;
  }
}
