// Serveurs ICE de la visio côté téléphone : `GET /ice` du serveur de spectacle (jeton de l'acteur), repli STUN public.
// Le serveur donne des identifiants TURN éphémères quand le propriétaire a collé une clé Cloudflare (sinon STUN seul) :
// rien n'est jamais écrit en dur ici. `?relais=1` dans l'adresse force le passage par le TURN (iceTransportPolicy
// 'relay'), pour l'essayer. Copie de la logique de apps/conducteur/src/flux/ice.ts (normaliserIce, chercherIce) : le
// paquet ne doit pas importer une application.

export const ICE_PAR_DEFAUT: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

const RE_URL_ICE = /^(stun|stuns|turn|turns):[^\s]+$/i;

/** Valide et normalise une liste de serveurs ICE (RTCIceServer[] ou `{iceServers}`) ; null si inutilisable. */
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
    if (urls.some(u => /^turns?:/i.test(u)) && (!serveur.username || !serveur.credential)) return null;
    r.push(serveur);
  }
  return r.length ? r : null;
}

export interface IceObtenu { iceServers: RTCIceServer[]; turn: boolean; expire: number | null }

/**
 * Demande les serveurs ICE à `<urlHttp>/ice` (Authorization: Bearer <jeton>). Ne lève jamais : sur refus, délai
 * (4 s) ou réponse illisible, STUN public seul.
 */
export async function chercherIce(urlHttp: string, jeton: string, f: typeof fetch = (...a) => fetch(...a)): Promise<IceObtenu> {
  const repli: IceObtenu = { iceServers: ICE_PAR_DEFAUT, turn: false, expire: null };
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const minuteur = ctrl ? setTimeout(() => ctrl.abort(), 4000) : null;
    const r = await f(`${urlHttp.replace(/\/+$/, '')}/ice`, {
      headers: { authorization: `Bearer ${jeton}` }, cache: 'no-store', ...(ctrl ? { signal: ctrl.signal } : {}),
    });
    if (minuteur) clearTimeout(minuteur);
    if (!r.ok) return repli;
    const j = (await r.json()) as { iceServers?: unknown; turn?: unknown; expire?: unknown };
    const serveurs = normaliserIce(j.iceServers);
    if (!serveurs) return repli;
    return { iceServers: serveurs, turn: j.turn === 'present', expire: typeof j.expire === 'number' ? j.expire : null };
  } catch {
    return repli;
  }
}

/** Origine HTTP(S) du serveur à partir de l'adresse WebSocket (wss://hote/ws → https://hote). */
export function origineHttp(adresseWs: string): string {
  try {
    const u = new URL(adresseWs);
    u.protocol = u.protocol === 'wss:' ? 'https:' : u.protocol === 'ws:' ? 'http:' : u.protocol;
    return u.origin;
  } catch {
    return '';
  }
}

/** Configuration RTCPeerConnection : serveurs ICE + relais forcé éventuel (essai du TURN). */
export function configurationRtc(serveurs: RTCIceServer[], relais = false): RTCConfiguration {
  return { iceServers: serveurs, ...(relais ? { iceTransportPolicy: 'relay' as const } : {}), bundlePolicy: 'max-bundle' };
}

/**
 * Fournisseur d'ICE pour la visio : une demande au serveur, gardée tant que les identifiants ne sont pas à moins de
 * 5 min de leur expiration (STUN seul : redemandé au plus toutes les 60 s, une clé a pu être collée entre-temps).
 */
export function fournisseurIce(o: { urlHttp: string; jeton: string; relais?: boolean; fetch?: typeof fetch; maintenant?: () => number }): () => Promise<RTCConfiguration> {
  const maintenant = o.maintenant ?? (() => Date.now());
  let cache: { obtenu: IceObtenu; valideJusqua: number } | null = null;
  let enCours: Promise<IceObtenu> | null = null;
  return async () => {
    const t = maintenant();
    if (!cache || t >= cache.valideJusqua) {
      enCours ??= chercherIce(o.urlHttp, o.jeton, o.fetch).finally(() => { enCours = null; });
      const obtenu = await enCours;
      cache = { obtenu, valideJusqua: obtenu.expire !== null ? obtenu.expire - 5 * 60_000 : t + 60_000 };
    }
    return configurationRtc(cache.obtenu.iceServers, o.relais);
  };
}
