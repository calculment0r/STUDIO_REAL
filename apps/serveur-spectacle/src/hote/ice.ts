// Serveurs ICE (STUN/TURN) de la visio, servis par `GET /ice` (jeton de n'importe quel rôle).
//
// - Sans clé TURN : STUN public seul (Cloudflare et Google), `turn:'absent'`. C'est l'état normal tant que le propriétaire
//   n'a pas créé de clé : la visio marche alors en pair-à-pair (même réseau, ou NAT traversés grâce au STUN).
// - Avec une clé (identifiant `turn.cleId` dans spectacle.config.json ET jeton `turn.jeton` dans spectacle.secrets.json,
//   ou variables CF_TURN_CLE_ID / CF_TURN_CLE_JETON) : identifiants ÉPHÉMÈRES demandés à Cloudflare Realtime TURN
//   (POST https://rtc.live.cloudflare.com/v1/turn/keys/<id>/credentials/generate-ice-servers, repli `generate`),
//   valables `turn.dureeS` secondes, gardés en cache jusqu'à 5 min avant leur expiration. Le code ne crée RIEN chez
//   Cloudflare : il se contente d'utiliser une clé existante.
// - Cloudflare injoignable ou clé refusée : STUN seul, `turn:'absent'`, UNE ligne de journal ; jamais d'erreur
//   bloquante (la visio essaie quand même en direct). Nouvel essai au plus tôt 30 s plus tard.
// Le jeton de la clé n'apparaît jamais dans une réponse, un journal ni /sante.

/** Un serveur ICE tel que l'attend RTCPeerConnection (forme JSON, sans dépendre des types du navigateur). */
export interface ServeurIce { urls: string[]; username?: string; credential?: string }

export interface ReponseIce {
  iceServers: ServeurIce[];
  turn: 'present' | 'absent';
  /** heure d'expiration des identifiants TURN (ms depuis 1970) */
  expire?: number;
}

/** Réglages TURN complets (identifiant + jeton) ; null = pas de TURN. */
export interface ReglagesTurn { cleId: string; jeton: string; dureeS: number }

export const STUN_PAR_DEFAUT: readonly ServeurIce[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
export const DUREE_TURN_DEFAUT_S = 3600;
/** Les identifiants sont renouvelés 5 min avant leur expiration. */
export const MARGE_RENOUVELLEMENT_MS = 5 * 60_000;
/** Après un échec, on ne redemande pas avant 30 s (STUN seul en attendant). */
export const ATTENTE_APRES_ECHEC_MS = 30_000;
const DELAI_APPEL_MS = 5_000;
const API_TURN = 'https://rtc.live.cloudflare.com/v1/turn/keys';

const RE_URL_ICE = /^(stun|stuns|turn|turns):[^\s]+$/i;
/** Port 53 : bloqué ou très lent dans les navigateurs (recommandation Cloudflare) : on le retire. */
const RE_PORT_53 = /:53(\?|$)/;

/** Normalise la réponse de l'API TURN (`{iceServers: [...]}` ou `{iceServers: {...}}`) ; null si inutilisable. */
export function normaliserServeursIce(x: unknown): ServeurIce[] | null {
  let v: unknown = x;
  if (v && typeof v === 'object' && !Array.isArray(v) && 'iceServers' in v) v = (v as { iceServers: unknown }).iceServers;
  const liste = Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : [];
  const r: ServeurIce[] = [];
  for (const s of liste) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    const urls = (Array.isArray(o.urls) ? o.urls : [o.urls])
      .filter((u): u is string => typeof u === 'string' && RE_URL_ICE.test(u) && !RE_PORT_53.test(u));
    if (!urls.length) continue;
    const serveur: ServeurIce = { urls };
    if (typeof o.username === 'string' && o.username) serveur.username = o.username;
    if (typeof o.credential === 'string' && o.credential) serveur.credential = o.credential;
    // un TURN sans identifiants ne sert à rien (et ferait échouer RTCPeerConnection)
    if (urls.some(u => /^turns?:/i.test(u)) && (!serveur.username || !serveur.credential)) continue;
    r.push(serveur);
  }
  return r.length ? r : null;
}

const aUnTurn = (l: readonly ServeurIce[]) => l.some(s => s.urls.some(u => /^turns?:/i.test(u)));

export type EtatTurn = 'non-configure' | 'inconnu' | 'actif' | 'echec';

export interface OptionsFournisseurIce {
  turn: ReglagesTurn | null;
  /** fetch injectable (tests) */
  fetch?: typeof fetch;
  maintenant?: () => number;
  /** journal d'exploitation (une ligne par échec ; jamais le jeton) */
  dire?: (ligne: string) => void;
}

/** Fournisseur des serveurs ICE (cache des identifiants éphémères, repli STUN). */
export class FournisseurIce {
  private readonly turn: ReglagesTurn | null;
  private readonly fetch: typeof fetch;
  private readonly maintenant: () => number;
  private readonly dire: (l: string) => void;
  private cache: { serveurs: ServeurIce[]; expire: number } | null = null;
  private enCours: Promise<ReponseIce> | null = null;
  private echecDepuis: number | null = null;
  private derniereErreur: string | null = null;
  private demandes = 0;

  constructor(o: OptionsFournisseurIce) {
    this.turn = o.turn;
    this.fetch = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.maintenant = o.maintenant ?? Date.now;
    this.dire = o.dire ?? (l => console.log(l));
  }

  /** Un TURN est-il configuré (clé présente) ? Dit par /config.json (`turn: true|false`). */
  get configure(): boolean { return this.turn !== null; }

  private stun(): ReponseIce { return { iceServers: STUN_PAR_DEFAUT.map(s => ({ urls: [...s.urls] })), turn: 'absent' }; }

  /** Les serveurs ICE à donner à un client. Ne lève jamais. */
  async obtenir(): Promise<ReponseIce> {
    if (!this.turn) return this.stun();
    const t = this.maintenant();
    if (this.cache && t < this.cache.expire - MARGE_RENOUVELLEMENT_MS) {
      return { iceServers: this.cache.serveurs.map(s => ({ ...s, urls: [...s.urls] })), turn: 'present', expire: this.cache.expire };
    }
    if (this.echecDepuis !== null && t - this.echecDepuis < ATTENTE_APRES_ECHEC_MS) return this.stun();
    // plusieurs téléphones qui demandent en même temps : un seul appel à Cloudflare
    this.enCours ??= this.demander(this.turn).finally(() => { this.enCours = null; });
    return this.enCours;
  }

  private async demander(turn: ReglagesTurn): Promise<ReponseIce> {
    this.demandes++;
    let erreur = 'reponse-inutilisable';
    for (const chemin of ['generate-ice-servers', 'generate']) {
      try {
        const r = await this.fetch(`${API_TURN}/${encodeURIComponent(turn.cleId)}/credentials/${chemin}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${turn.jeton}`, 'content-type': 'application/json' },
          body: JSON.stringify({ ttl: turn.dureeS }),
          signal: AbortSignal.timeout(DELAI_APPEL_MS),
        });
        if (!r.ok) { erreur = `http-${r.status}`; continue; }
        const serveurs = normaliserServeursIce(await r.json());
        if (!serveurs || !aUnTurn(serveurs)) { erreur = 'reponse-inutilisable'; continue; }
        // le STUN public reste en tête de liste si Cloudflare n'en donne pas
        const avecStun = serveurs.some(s => s.urls.some(u => /^stuns?:/i.test(u))) ? serveurs : [...STUN_PAR_DEFAUT.map(s => ({ urls: [...s.urls] })), ...serveurs];
        const expire = this.maintenant() + turn.dureeS * 1000;
        this.cache = { serveurs: avecStun, expire };
        if (this.echecDepuis !== null) this.dire('TURN : identifiants Cloudflare de nouveau obtenus.');
        this.echecDepuis = null;
        this.derniereErreur = null;
        return { iceServers: avecStun.map(s => ({ ...s, urls: [...s.urls] })), turn: 'present', expire };
      } catch (e) {
        const nom = (e as Error)?.name;
        erreur = nom === 'TimeoutError' || nom === 'AbortError' ? 'delai' : 'reseau';
      }
    }
    this.cache = null;
    this.echecDepuis = this.maintenant();
    this.derniereErreur = erreur;
    this.dire(`TURN : identifiants Cloudflare indisponibles (${erreur}) ; STUN seul, la visio essaie en direct.`);
    return this.stun();
  }

  /** Ligne `turn` de /sante : sûre à publier (ni identifiant de clé, ni jeton, ni identifiants éphémères). */
  etat(): { etat: EtatTurn; expire: number | null; erreur: string | null; demandes: number } {
    const etat: EtatTurn = !this.turn ? 'non-configure'
      : this.cache && this.maintenant() < this.cache.expire ? 'actif'
        : this.echecDepuis !== null ? 'echec' : 'inconnu';
    return { etat, expire: this.cache?.expire ?? null, erreur: this.derniereErreur, demandes: this.demandes };
  }
}
