// Transport par la salle du serveur (apps/serveur, WebSocket du Durable Object) : régie et projecteur sur deux
// machines (chantier SORTIE SCÈNE).
//
// Chaque côté ouvre sa propre connexion à la salle du projet :
//   GET <serveur>/api/projets/<projet>/salle?jeton=<jeton>   (Upgrade: websocket ; PROTOCOLE.md)
// puis envoie `hello` (régie : role 'regie' ; sortie : role 'poste', nom « Sortie scène »). Les messages de la
// sortie voyagent dans le message de diffusion `scene` du serveur :
//   client → serveur  { t: 'scene', message: MessageRegie | MessageSortie }
//   serveur → autres  { t: 'scene', message, par, session, ts }      (rien n'est gardé ; pas d'écho à l'émetteur)
// Le serveur diffuse aussi `lecture` (état du moteur) et `bienvenue.projet` : la sortie s'en sert en secours pour
// traduire elle-même l'état de lecture si aucune régie ne lui parle (page.tsx).
//
// Côté sortie, l'adresse porte la salle : sortie.html?serveur=https://…&projet=p_…&jeton=sr_…
// Côté régie, useRelaisSortie() ouvre ce transport tout seul quand la coquille est connectée à une salle.
import type { StatutTransport, Transport } from './canal';

export interface OptionsTransportSalle {
  /** URL du serveur (http(s)://…) ; '' = même origine */
  serveur: string;
  projet: string;
  jeton: string;
  role: 'regie' | 'poste';
  /** identifiant de personne [A-Za-z0-9_-]{6,64} */
  personne: string;
  nom: string;
  WebSocket?: typeof WebSocket;
}

/** Messages bruts du serveur utiles à la sortie (bienvenue, lecture, instantane). */
export type MessageSalleBrut = { t: string; [cle: string]: unknown };

const PING_MS = 15_000;
const SILENCE_MAX_MS = 45_000;
const ATTENTES_MS = [500, 1000, 2000, 4000, 8000, 10_000];

const aleatoire = (n: number): string => {
  const a = new Uint8Array(n);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
};

export function urlSalle(o: Pick<OptionsTransportSalle, 'serveur' | 'projet' | 'jeton'>): string {
  let base = o.serveur.trim().replace(/\/+$/, '');
  if (!base && typeof location !== 'undefined') base = location.origin;
  return base.replace(/^http/i, 'ws') + `/api/projets/${encodeURIComponent(o.projet)}/salle?jeton=${encodeURIComponent(o.jeton)}`;
}

export class TransportSalle implements Transport {
  readonly nom = 'salle' as const;
  readonly session = 'sortie_' + aleatoire(12);
  private readonly o: OptionsTransportSalle;
  private ws: WebSocket | null = null;
  private accueilli = false;
  private ferme = false;
  private essais = 0;
  private derniere = 0;
  private minuteurPing: ReturnType<typeof setInterval> | undefined;
  private minuteurReconnexion: ReturnType<typeof setTimeout> | undefined;
  private ecouteurs = new Set<(m: unknown) => void>();
  private ecouteursStatut = new Set<(s: StatutTransport) => void>();
  private ecouteursBruts = new Set<(m: MessageSalleBrut) => void>();
  private _statut: StatutTransport = 'connexion';

  constructor(o: OptionsTransportSalle) {
    this.o = o;
    this.connecter();
  }

  get statutActuel(): StatutTransport { return this._statut; }

  private poserStatut(s: StatutTransport) {
    if (s === this._statut) return;
    this._statut = s;
    for (const f of this.ecouteursStatut) f(s);
  }

  private connecter(): void {
    if (this.ferme) return;
    const WS = this.o.WebSocket ?? globalThis.WebSocket;
    this.accueilli = false;
    this.poserStatut(this.essais ? 'hors-ligne' : 'connexion');
    let ws: WebSocket;
    try { ws = new WS(urlSalle(this.o)); } catch { this.planifier(); return; }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.derniere = Date.now();
      ws.send(JSON.stringify({ t: 'hello', v: 1, personne: this.o.personne, session: this.session, nom: this.o.nom, role: this.o.role }));
      clearInterval(this.minuteurPing);
      this.minuteurPing = setInterval(() => {
        if (Date.now() - this.derniere > SILENCE_MAX_MS) { this.perdue(); return; }
        try { ws.send(JSON.stringify({ t: 'ping' })); } catch { /* onclose suit */ }
      }, PING_MS);
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      this.derniere = Date.now();
      let m: MessageSalleBrut;
      try { m = JSON.parse(String(e.data)) as MessageSalleBrut; } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'bienvenue') { this.accueilli = true; this.essais = 0; this.poserStatut('connecte'); }
      if (m.t === 'scene') for (const f of this.ecouteurs) f(m.message);
      for (const f of this.ecouteursBruts) f(m);
    };
    ws.onclose = () => { if (this.ws === ws) this.perdue(); };
    ws.onerror = () => { /* onclose suit */ };
  }

  private perdue(): void {
    const ws = this.ws;
    this.ws = null;
    this.accueilli = false;
    clearInterval(this.minuteurPing);
    if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(); } catch { /* déjà fermé */ } }
    if (this.ferme) return;
    this.poserStatut('hors-ligne');
    this.planifier();
  }

  private planifier(): void {
    clearTimeout(this.minuteurReconnexion);
    const attente = ATTENTES_MS[Math.min(this.essais, ATTENTES_MS.length - 1)];
    this.essais++;
    this.minuteurReconnexion = setTimeout(() => this.connecter(), attente);
  }

  envoyer(m: unknown): void {
    if (!this.ws || !this.accueilli || this.ws.readyState !== 1) return;   // l'état se rejoue à la reconnexion
    try { this.ws.send(JSON.stringify({ t: 'scene', message: m })); } catch { /* onclose suit */ }
  }

  ecouter(fn: (m: unknown) => void): () => void { this.ecouteurs.add(fn); return () => { this.ecouteurs.delete(fn); }; }

  statut(fn: (s: StatutTransport) => void): () => void {
    this.ecouteursStatut.add(fn);
    fn(this._statut);
    return () => { this.ecouteursStatut.delete(fn); };
  }

  /** Messages bruts du serveur (bienvenue, lecture, instantane…) : secours de la sortie sans régie. */
  ecouterSalle(fn: (m: MessageSalleBrut) => void): () => void { this.ecouteursBruts.add(fn); return () => { this.ecouteursBruts.delete(fn); }; }

  fermer(): void {
    this.ferme = true;
    clearTimeout(this.minuteurReconnexion);
    clearInterval(this.minuteurPing);
    const ws = this.ws;
    this.ws = null;
    if (ws) { try { ws.send(JSON.stringify({ t: 'bye' })); ws.close(1000); } catch { /* déjà fermé */ } }
    this.poserStatut('ferme');
    this.ecouteurs.clear(); this.ecouteursBruts.clear(); this.ecouteursStatut.clear();
  }
}

/** Paramètres de salle lus dans l'adresse de la sortie (?serveur=&projet=&jeton=), ou null. */
export function salleDansAdresse(recherche: string): { serveur: string; projet: string; jeton: string } | null {
  const q = new URLSearchParams(recherche);
  const projet = q.get('projet')?.trim(), jeton = q.get('jeton')?.trim();
  if (!projet || !jeton) return null;
  return { serveur: q.get('serveur')?.trim() ?? '', projet, jeton };
}

/** Adresse d'une sortie distante (à ouvrir sur la machine du projecteur). Le jeton du projet y figure : à ne pas
 *  afficher en public. */
export function adresseSortieDistante(baseSortie: string, o: { serveur: string; projet: string; jeton: string }): string {
  const u = new URL(baseSortie);
  if (o.serveur) u.searchParams.set('serveur', o.serveur);
  u.searchParams.set('projet', o.projet);
  u.searchParams.set('jeton', o.jeton);
  return u.toString();
}
