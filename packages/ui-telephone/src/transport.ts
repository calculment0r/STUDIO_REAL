// Transport du téléphone : une interface, deux implémentations (rapport 2 §4.4).
// - transportWebSocket : le vrai serveur de spectacle (téléphones du public en 4G par une adresse fixe).
//   Reprend la reconnexion et l'horloge de prototypes/figurants/pages/commun/ws.js, et y ajoute ce que le rapport 5
//   §4.6 (« Un téléphone recharge ») demande : `hello` avec vseq/cseq courants à chaque ouverture, file rejouée, ping
//   toutes les 4 s et socket déclarée morte après 2 `pong` manqués, reconnexion immédiate sur visibilitychange / online
//   / pageshow.
// - transportMemoire : une paire de canaux en mémoire (émulateur du Conducteur, tests). Le côté « serveur » est rendu à
//   l'appelant : il envoie des `MessageServeur`, lit les `MessageClient`, coupe et rouvre la ligne.
// Tout ce qui arrive du réseau passe par lireMessageServeur (validation du protocole) ; un message invalide est ignoré.
import { lireMessageServeur, type MessageClient, type MessageServeur, type MsgHello } from '@studio-real/protocole';

/** État de la ligne : connexion (premier essai), ouvert, attente (reconnexion programmée), ferme (fermer() appelé). */
export type EtatLigne = 'connexion' | 'ouvert' | 'attente' | 'ferme';
export interface EtatTransport {
  etat: EtatLigne;
  /** essais de reconnexion depuis la dernière ouverture */
  essai: number;
  /** aller-retour du dernier ping (ms) */
  rttMs?: number;
  /** heure serveur − heure client (ms), estimée au plus petit aller-retour des 10 derniers */
  decalageMs?: number;
}

export interface TransportTelephone {
  /** envoie (ou garde dans la file jusqu'à la prochaine ouverture) */
  envoyer(msg: MessageClient): void;
  surMessage(fn: (m: MessageServeur) => void): () => void;
  surEtat(fn: (e: EtatTransport) => void): () => void;
  /** renvoie `hello` tout de suite (nouveau pseudo, `resync` du serveur) */
  renouer(): void;
  fermer(): void;
}

/** Le `hello` courant, sans le jeton (fourni par l'application à partir de la machine d'état). */
export type FabriqueHello = () => Omit<MsgHello, 'jeton'>;

// ── Utilitaires communs ────────────────────────────────────────────────────────────────────────────────────────────

class Abonnes<T> {
  private fns = new Set<(x: T) => void>();
  ajouter(fn: (x: T) => void): () => void { this.fns.add(fn); return () => { this.fns.delete(fn); }; }
  emettre(x: T): void {
    for (const fn of [...this.fns]) {
      try { fn(x); } catch (e) { console.error('[telephone] abonné', e); }
    }
  }
}

const FILE_MAX = 200;
/** Ce qui ne mérite pas d'attendre la reconnexion : un battement périmé, un ping, un hello (refait à l'ouverture). */
const perissable = (m: MessageClient) => m.t === 'etat' || m.t === 'ping' || m.t === 'hello';

/** Délai avant le prochain essai : 500 ms × 2^essai, plafonné à 10 s, gigue ± 25 %. */
export function delaiReconnexion(essai: number, aleatoire: () => number = Math.random): number {
  const base = Math.min(10_000, 500 * Math.pow(2, Math.min(Math.max(essai, 1), 5)));
  return Math.round(base * (0.75 + aleatoire() * 0.5));
}

/** Échantillons d'horloge (ping → pong) : on garde le décalage mesuré au plus petit aller-retour. */
export class Horloge {
  private echantillons: { rtt: number; decalage: number }[] = [];
  rttMs?: number;
  decalageMs?: number;
  pong(tc: number, ts: number, maintenant: number): boolean {
    const rtt = maintenant - tc;
    if (!(rtt >= 0) || !Number.isFinite(ts)) return false;
    this.echantillons.push({ rtt, decalage: ts - (tc + rtt / 2) });
    if (this.echantillons.length > 10) this.echantillons.shift();
    const meilleur = this.echantillons.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    this.rttMs = rtt;
    this.decalageMs = Math.round(meilleur.decalage);
    return true;
  }
}

// ── WebSocket ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Ce dont le transport WebSocket a besoin du navigateur (injectable pour les tests). */
export interface EnvironnementWS {
  WebSocket: new (url: string) => WebSocketMinimal;
  maintenant: () => number;
  aleatoire: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  /** cibles des événements visibilitychange (document), online et pageshow (window) */
  document?: { visibilityState?: string; addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void };
  fenetre?: { addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void };
}
export interface WebSocketMinimal {
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface OptionsWebSocket {
  /** le hello courant (vseq, cseq, pseudo…) sans le jeton */
  hello: FabriqueHello;
  /** intervalle des ping (défaut 4 s) */
  pingMs?: number;
  /** pongs manqués avant de déclarer la socket morte (défaut 2) */
  pongsManques?: number;
  env?: Partial<EnvironnementWS>;
}

function environnementNavigateur(): EnvironnementWS {
  const g = globalThis as unknown as Record<string, unknown>;
  return {
    WebSocket: g.WebSocket as EnvironnementWS['WebSocket'],
    maintenant: () => Date.now(),
    aleatoire: Math.random,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: id => clearTimeout(id as ReturnType<typeof setTimeout>),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: id => clearInterval(id as ReturnType<typeof setInterval>),
    ...(typeof document !== 'undefined' ? { document } : {}),
    ...(typeof window !== 'undefined' ? { fenetre: window } : {}),
  };
}

/** Transport WebSocket vers le serveur de spectacle. `url` : ws:// ou wss://. Le jeton ne sort jamais du `hello`. */
export function transportWebSocket(url: string, jeton: string, options: OptionsWebSocket): TransportTelephone {
  const env: EnvironnementWS = { ...environnementNavigateur(), ...options.env } as EnvironnementWS;
  const pingMs = options.pingMs ?? 4000;
  const maxManques = options.pongsManques ?? 2;
  const messages = new Abonnes<MessageServeur>();
  const etats = new Abonnes<EtatTransport>();
  const horloge = new Horloge();
  const file: MessageClient[] = [];
  let ws: WebSocketMinimal | null = null;
  let essai = 0;
  let ferme = false;
  let etat: EtatLigne = 'connexion';
  let minuteurRelance: unknown = null;
  let minuteurPing: unknown = null;
  let sansPong = 0;

  const instantane = (): EtatTransport => ({
    etat, essai, ...(horloge.rttMs !== undefined ? { rttMs: horloge.rttMs } : {}),
    ...(horloge.decalageMs !== undefined ? { decalageMs: horloge.decalageMs } : {}),
  });
  const changer = (e: EtatLigne) => { etat = e; etats.emettre(instantane()); };
  const ouvert = () => !!ws && ws.readyState === 1;
  const brut = (m: unknown): boolean => {
    try { ws!.send(JSON.stringify(m)); return true; } catch { return false; }
  };
  const hello = () => brut({ ...options.hello(), jeton });

  function ping() {
    if (!ouvert()) return;
    if (sansPong >= maxManques) { tuer(); return; }        // 2 pongs manqués : la socket est morte
    sansPong += 1;
    brut({ t: 'ping', tc: env.maintenant() });
  }

  /** Socket morte (pas de pong, réseau changé) : on la lâche et on se reconnecte. */
  function tuer() {
    const s = ws;
    ws = null;
    env.clearInterval(minuteurPing);
    if (s) {
      s.onopen = s.onmessage = s.onclose = s.onerror = null;
      try { s.close(); } catch { /* déjà fermée */ }
    }
    if (!ferme) programmer();
  }

  function ouvrir() {
    if (ferme) return;
    env.clearTimeout(minuteurRelance);
    minuteurRelance = null;
    changer(essai === 0 ? 'connexion' : 'attente');
    let s: WebSocketMinimal;
    try { s = new env.WebSocket(url); } catch { programmer(); return; }
    ws = s;
    s.onopen = () => {
      essai = 0;
      sansPong = 0;
      hello();
      // la file : dans l'ordre, après le hello
      while (file.length && ouvert()) {
        if (!brut(file[0])) break;
        file.shift();
      }
      changer('ouvert');
      ping();
      env.clearInterval(minuteurPing);
      minuteurPing = env.setInterval(ping, pingMs);
    };
    s.onmessage = ev => {
      if (typeof ev.data !== 'string') return;
      let brutRecu: unknown;
      try { brutRecu = JSON.parse(ev.data); } catch { return; }
      const lu = lireMessageServeur(brutRecu);
      if (!lu.message) return;
      const m = lu.message;
      if (m.t === 'pong') {
        sansPong = 0;
        if (horloge.pong(m.tc, m.ts, env.maintenant())) etats.emettre(instantane());
        return;
      }
      messages.emettre(m);
    };
    s.onclose = () => {
      if (ws !== s) return;
      ws = null;
      env.clearInterval(minuteurPing);
      if (!ferme) programmer();
    };
    s.onerror = () => { /* onclose suit toujours */ };
  }

  function programmer() {
    if (ferme) return;
    essai += 1;
    changer('attente');
    env.clearTimeout(minuteurRelance);
    minuteurRelance = env.setTimeout(ouvrir, delaiReconnexion(essai, env.aleatoire));
  }

  /** Retour au premier plan, réseau revenu, page restaurée du cache : on vérifie tout de suite. */
  function reveil() {
    if (ferme) return;
    if (env.document?.visibilityState === 'hidden') return;
    if (ouvert()) { ping(); return; }
    if (ws && ws.readyState === 0) return;                  // une connexion est déjà en cours
    essai = 0;
    ouvrir();
  }
  env.document?.addEventListener('visibilitychange', reveil);
  env.fenetre?.addEventListener('online', reveil);
  env.fenetre?.addEventListener('pageshow', reveil);

  ouvrir();

  return {
    envoyer(m) {
      if (ferme) return;
      if (ouvert() && brut(m)) return;
      if (perissable(m)) return;
      file.push(m);
      if (file.length > FILE_MAX) file.shift();
    },
    surMessage: fn => messages.ajouter(fn),
    surEtat: fn => { const off = etats.ajouter(fn); fn(instantane()); return off; },
    renouer() { if (ouvert()) hello(); else reveil(); },
    fermer() {
      if (ferme) return;
      ferme = true;
      env.clearTimeout(minuteurRelance);
      env.clearInterval(minuteurPing);
      env.document?.removeEventListener('visibilitychange', reveil);
      env.fenetre?.removeEventListener('online', reveil);
      env.fenetre?.removeEventListener('pageshow', reveil);
      const s = ws;
      ws = null;
      if (s) { s.onclose = null; try { s.close(); } catch { /* rien */ } }
      changer('ferme');
    },
  };
}

// ── Mémoire ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Le côté serveur d'un transport mémoire (l'émulateur, ou un test, joue le serveur de spectacle). */
export interface CoteServeurMemoire {
  /** message du serveur vers le téléphone (validé comme s'il venait du réseau) ; perdu si la ligne est coupée */
  envoyer(m: MessageServeur | Record<string, unknown>): boolean;
  /** messages du téléphone vers le serveur */
  surMessage(fn: (m: MessageClient) => void): () => void;
  /** ouvre la ligne : le téléphone envoie son `hello` puis sa file */
  ouvrir(): void;
  /** coupe la ligne (le téléphone passe en attente et garde ses envois) */
  couper(): void;
  readonly ouverte: boolean;
  /** tout ce que le téléphone a envoyé (journal, pour les tests et l'émulateur) */
  readonly recus: readonly MessageClient[];
}

export interface PaireMemoire {
  telephone: TransportTelephone;
  serveur: CoteServeurMemoire;
}

export interface OptionsMemoire {
  hello: FabriqueHello;
  /** jeton porté par le hello (défaut 'emule') */
  jeton?: string;
  /** ouvrir la ligne tout de suite (défaut faux : on s'abonne d'abord, puis serveur.ouvrir()) */
  ouvrir?: boolean;
  /** livraison différée (latence émulée) ; défaut : immédiate */
  differer?: (fn: () => void) => void;
}

/** Une paire de canaux en mémoire : même contrat que le WebSocket, sans réseau. */
export function transportMemoire(options: OptionsMemoire): PaireMemoire {
  const versTelephone = new Abonnes<MessageServeur>();
  const versServeur = new Abonnes<MessageClient>();
  const etats = new Abonnes<EtatTransport>();
  const differer = options.differer ?? ((fn: () => void) => fn());
  const jeton = options.jeton ?? 'emule';
  const file: MessageClient[] = [];
  const recus: MessageClient[] = [];
  let ouverte = false;
  let ferme = false;
  let essai = 0;
  let etat: EtatLigne = 'connexion';

  const instantane = (): EtatTransport => ({ etat, essai });
  const changer = (e: EtatLigne) => { etat = e; etats.emettre(instantane()); };
  const livrerAuServeur = (m: MessageClient) => {
    // copie JSON : le serveur ne partage jamais d'objet avec le téléphone (comme sur le réseau)
    const copie = JSON.parse(JSON.stringify(m)) as MessageClient;
    differer(() => { recus.push(copie); versServeur.emettre(copie); });
  };
  const hello = () => livrerAuServeur({ ...options.hello(), jeton } as MsgHello);

  const serveur: CoteServeurMemoire = {
    envoyer(m) {
      if (!ouverte || ferme) return false;
      const lu = lireMessageServeur(JSON.parse(JSON.stringify(m)));
      if (!lu.message) return false;
      const msg = lu.message;
      differer(() => { if (ouverte && !ferme) versTelephone.emettre(msg); });
      return true;
    },
    surMessage: fn => versServeur.ajouter(fn),
    ouvrir() {
      if (ouverte || ferme) return;
      ouverte = true;
      essai = 0;
      hello();
      while (file.length) livrerAuServeur(file.shift()!);
      changer('ouvert');
    },
    couper() {
      if (!ouverte || ferme) return;
      ouverte = false;
      essai += 1;
      changer('attente');
    },
    get ouverte() { return ouverte; },
    get recus() { return recus; },
  };

  const telephone: TransportTelephone = {
    envoyer(m) {
      if (ferme) return;
      if (ouverte) { livrerAuServeur(m); return; }
      if (perissable(m)) return;
      file.push(m);
      if (file.length > FILE_MAX) file.shift();
    },
    surMessage: fn => versTelephone.ajouter(fn),
    surEtat: fn => { const off = etats.ajouter(fn); fn(instantane()); return off; },
    renouer() { if (ouverte) hello(); },
    fermer() { if (ferme) return; ferme = true; ouverte = false; changer('ferme'); },
  };

  if (options.ouvrir === true) serveur.ouvrir();
  return { telephone, serveur };
}
