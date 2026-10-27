// Serveurs ICE (STUN/TURN) du flux du streamer. Aucun secret dans le code : STUN public de Google par défaut ;
// un TURN (ex. Cloudflare Realtime TURN, identifiants éphémères) s'ajoute PAR CONFIGURATION, dans cet ordre :
//   1. l'option `iceServers` passée par le code ;
//   2. le paramètre `ice` de l'adresse (?ice= ou #ice=), JSON ou base64url du JSON (lien/QR de la page d'accueil) ;
//   3. localStorage['studio-real:ice'] (posé par la page d'accueil d'essai sur la même origine) ;
//   4. la variable de construction VITE_SERVEURS_ICE (JSON, fichier .env.local hors git) ;
//   5. le STUN public par défaut.
// `?relais=1` force le passage par le TURN (iceTransportPolicy 'relay') pour vérifier qu'il marche.

export const ICE_PAR_DEFAUT: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
export const CLE_STOCKAGE_ICE = 'studio-real:ice';

const RE_URL_ICE = /^(stun|stuns|turn|turns):[^\s]+$/i;

/** Valide et normalise une liste de serveurs ICE (forme RTCIceServer[], ou réponse de l'API TURN de Cloudflare). */
export function normaliserIce(v: unknown): RTCIceServer[] | null {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'iceServers' in v) v = (v as { iceServers: unknown }).iceServers;
  const liste = Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : null;
  if (!liste) return null;
  const r: RTCIceServer[] = [];
  for (const s of liste) {
    if (!s || typeof s !== 'object') return null;
    const o = s as Record<string, unknown>;
    const urls = (Array.isArray(o.urls) ? o.urls : [o.urls]).filter((u): u is string => typeof u === 'string' && RE_URL_ICE.test(u));
    if (!urls.length) return null;
    const serveur: RTCIceServer = { urls };
    if (typeof o.username === 'string') serveur.username = o.username;
    if (typeof o.credential === 'string') serveur.credential = o.credential;
    if (urls.some((u) => /^turns?:/i.test(u)) && (!serveur.username || !serveur.credential)) return null;
    r.push(serveur);
  }
  return r.length ? r : null;
}

/** Encode pour une adresse (base64url du JSON). */
export function encoderIce(serveurs: RTCIceServer[]): string {
  const octets = new TextEncoder().encode(JSON.stringify(serveurs));
  let bin = '';
  for (const o of octets) bin += String.fromCharCode(o);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Lit une configuration ICE écrite en JSON ou en base64url du JSON ; null si illisible. */
export function lireIce(texte: string | null | undefined): RTCIceServer[] | null {
  if (!texte) return null;
  const t = texte.trim();
  try {
    if (t.startsWith('[') || t.startsWith('{')) return normaliserIce(JSON.parse(t));
    const b64 = t.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const octets = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return normaliserIce(JSON.parse(new TextDecoder().decode(octets)));
  } catch {
    return null;
  }
}

/** Paramètre lu dans ?… ou #… de l'adresse. */
export function parametreAdresse(nom: string, adresse?: { search: string; hash: string }): string | null {
  const a = adresse ?? (typeof location !== 'undefined' ? location : null);
  if (!a) return null;
  return new URLSearchParams(a.search).get(nom) ?? new URLSearchParams(a.hash.replace(/^#/, '')).get(nom);
}

function lireStockage(): string | null {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(CLE_STOCKAGE_ICE) : null; } catch { return null; }
}

/** Configuration ICE effective (voir l'ordre en tête de fichier). */
export function serveursIce(explicites?: RTCIceServer[]): RTCIceServer[] {
  if (explicites?.length) return explicites;
  const env = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_SERVEURS_ICE;
  return lireIce(parametreAdresse('ice')) ?? lireIce(lireStockage()) ?? lireIce(env) ?? ICE_PAR_DEFAUT;
}

/** Configuration RTCPeerConnection : serveurs ICE + relais forcé éventuel (?relais=1). */
export function configurationRtc(explicites?: RTCIceServer[], relaisForce?: boolean): RTCConfiguration {
  const relais = relaisForce ?? parametreAdresse('relais') === '1';
  return { iceServers: serveursIce(explicites), ...(relais ? { iceTransportPolicy: 'relay' as const } : {}), bundlePolicy: 'max-bundle' };
}

/** Un TURN est-il configuré ? (affiché sur les pages : « relais possible ») */
export const aUnTurn = (s: RTCIceServer[]) => s.some((x) => (Array.isArray(x.urls) ? x.urls : [x.urls]).some((u) => /^turns?:/i.test(u)));
