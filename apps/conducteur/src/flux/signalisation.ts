// Connexion minimale à la salle du projet pour la signalisation WebRTC (chantier FLUX STREAMER).
// Volontairement indépendante du client collaboratif (src/etat, src/collab) : le téléphone du streamer et la sortie
// n'ont besoin que de `hello`, du relais `rtc` et du `ping` (horloge commune). Reconnexion automatique avec
// recul exponentiel, battement toutes les 10 s (une salle muette 25 s est tenue pour morte), reprise immédiate
// au retour de l'appli au premier plan ou du réseau (iOS gèle la page en arrière-plan : minuteurs arrêtés).
import { idAleatoire, lireMessageRtc, type MessageRtcRecu, type SignalRtc } from './protocole';

export type EtatSalle = 'connexion' | 'ouverte' | 'fermee';

export interface OptionsSalle {
  /** origine du serveur (« http://192.168.1.20:8787 »), vide = même origine que la page */
  serveur: string;
  projet: string;
  jeton: string;
  nom: string;
  role?: 'poste' | 'regie';
  /** identifiant stable de la personne (sinon tiré au hasard) */
  personne?: string;
  /** identifiant de la session (onglet) ; gardé pendant les reconnexions */
  session?: string;
  /** pour les tests : implémentation WebSocket */
  WebSocket?: typeof WebSocket;
}

/** URL WebSocket de la salle : http → ws, https → wss ; jeton en paramètre (le navigateur ne pose pas d'en-tête). */
export function urlSalle(serveur: string, projet: string, jeton: string, origine?: string): string {
  const base = (serveur || origine || '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) throw new Error('serveur : adresse http(s) attendue');
  return `${base.replace(/^http/i, 'ws')}/api/projets/${encodeURIComponent(projet)}/salle?jeton=${encodeURIComponent(jeton)}`;
}

/** Délai avant la n-ième tentative de reconnexion (0, 0,5 s, 1 s, 2 s, 4 s, puis 5 s), avec ±20 % d'aléa. */
export function delaiReconnexion(tentative: number, alea = Math.random()): number {
  if (tentative <= 0) return 0;
  const base = Math.min(5000, 500 * 2 ** (tentative - 1));
  return Math.round(base * (0.8 + 0.4 * alea));
}

/**
 * Décalage d'horloge (heure serveur − heure locale) à partir d'un ping : on suppose le trajet symétrique.
 * Renvoie aussi l'aller-retour, pour ne garder que les meilleures mesures.
 */
export function estimerDecalage(envoi: number, reception: number, heureServeur: number): { decalage: number; allerRetour: number } {
  const allerRetour = Math.max(0, reception - envoi);
  return { decalage: heureServeur - (envoi + allerRetour / 2), allerRetour };
}

const BATTEMENT_MS = 10_000;
const SILENCE_MAX_MS = 25_000;

export class SalleSignal {
  readonly session: string;
  readonly personne: string;
  etat: EtatSalle = 'fermee';
  /** heure serveur − heure locale (ms), estimée par les pings */
  decalage = 0;
  allerRetourMs: number | null = null;

  onRtc: ((m: MessageRtcRecu) => void) | null = null;
  onEtat: ((e: EtatSalle) => void) | null = null;
  onOuverte: (() => void) | null = null;
  onErreur: ((code: string, message: string) => void) | null = null;

  private ws: WebSocket | null = null;
  private url: string;
  private tentative = 0;
  private minuteurReco: ReturnType<typeof setTimeout> | null = null;
  private minuteurBattement: ReturnType<typeof setInterval> | null = null;
  private dernierMessage = 0;
  private pings = new Map<number, number>();
  private idPing = 1;
  private mesures: { decalage: number; allerRetour: number }[] = [];
  private arretee = true;
  private readonly WS: typeof WebSocket;

  private readonly o: OptionsSalle;

  constructor(o: OptionsSalle) {
    this.o = o;
    this.session = o.session ?? idAleatoire('rtc_', 14);
    this.personne = o.personne ?? idAleatoire('pers_', 12);
    this.WS = o.WebSocket ?? WebSocket;
    const origine = typeof location !== 'undefined' ? location.origin : undefined;
    this.url = urlSalle(o.serveur, o.projet, o.jeton, origine);
  }

  /** Heure serveur estimée (ms depuis 1970), commune à tous les membres de la salle à quelques ms près. */
  heureServeur(): number { return Date.now() + this.decalage; }

  ouvrir(): void {
    if (!this.arretee) return;
    this.arretee = false;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.relancer);
      document.addEventListener('visibilitychange', this.auRetour);
      window.addEventListener('pageshow', this.relancer);
    }
    this.connecter();
  }

  fermer(): void {
    this.arretee = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.relancer);
      document.removeEventListener('visibilitychange', this.auRetour);
      window.removeEventListener('pageshow', this.relancer);
    }
    if (this.minuteurReco) clearTimeout(this.minuteurReco);
    if (this.minuteurBattement) clearInterval(this.minuteurBattement);
    this.minuteurReco = this.minuteurBattement = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'bye' })); } catch { /* fermé */ }
      try { ws.close(1000, 'fin'); } catch { /* fermé */ }
    }
    this.changer('fermee');
  }

  /** Envoie un signal ; faux si la salle n'est pas ouverte (le signal est perdu : l'appelant réessaiera). */
  envoyer(vers: string, signal: SignalRtc): boolean {
    return this.envoyerBrut({ t: 'rtc', vers, signal });
  }

  envoyerBrut(m: unknown): boolean {
    if (this.etat !== 'ouverte' || !this.ws) return false;
    try { this.ws.send(JSON.stringify(m)); return true; } catch { return false; }
  }

  // ─────────────────────────────────────────────

  private changer(e: EtatSalle) {
    if (this.etat === e) return;
    this.etat = e;
    this.onEtat?.(e);
  }

  private relancer = () => {
    if (this.arretee) return;
    if (this.etat === 'fermee' || !this.vivante()) { this.tentative = 0; this.reconnecter(); }
  };

  private auRetour = () => { if (document.visibilityState === 'visible') this.relancer(); };

  private vivante(): boolean {
    return !!this.ws && this.ws.readyState === 1 && Date.now() - this.dernierMessage < SILENCE_MAX_MS;
  }

  private connecter() {
    if (this.arretee) return;
    if (this.minuteurReco) { clearTimeout(this.minuteurReco); this.minuteurReco = null; }
    this.changer('connexion');
    let ws: WebSocket;
    try { ws = new this.WS(this.url); } catch { this.planifier(); return; }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.dernierMessage = Date.now();
      ws.send(JSON.stringify({
        t: 'hello', v: 1, personne: this.personne, session: this.session, nom: this.o.nom, role: this.o.role ?? 'poste',
      }));
    };
    ws.onmessage = (e) => { if (this.ws === ws) this.recevoir(String(e.data)); };
    ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.planifier(); } };
    ws.onerror = () => { /* onclose suit */ };
  }

  private reconnecter() {
    const ancien = this.ws;
    this.ws = null;
    if (ancien) { try { ancien.close(); } catch { /* déjà fermé */ } }
    this.connecter();
  }

  private planifier() {
    if (this.minuteurBattement) { clearInterval(this.minuteurBattement); this.minuteurBattement = null; }
    this.changer('fermee');
    if (this.arretee || this.minuteurReco) return;
    this.tentative++;
    this.minuteurReco = setTimeout(() => { this.minuteurReco = null; this.connecter(); }, delaiReconnexion(this.tentative));
  }

  private battre = () => {
    if (!this.ws || this.ws.readyState !== 1) return;
    if (Date.now() - this.dernierMessage > SILENCE_MAX_MS) { this.reconnecter(); return; }
    this.ping();
  };

  private ping() {
    const id = this.idPing++;
    this.pings.set(id, Date.now());
    if (this.pings.size > 20) this.pings.delete(this.pings.keys().next().value!);
    this.envoyerBrut({ t: 'ping', id });
  }

  private recevoir(brut: string) {
    this.dernierMessage = Date.now();
    let m: Record<string, unknown>;
    try { m = JSON.parse(brut); } catch { return; }
    switch (m.t) {
      case 'bienvenue':
        this.tentative = 0;
        this.changer('ouverte');
        if (this.minuteurBattement) clearInterval(this.minuteurBattement);
        this.minuteurBattement = setInterval(this.battre, BATTEMENT_MS);
        // trois pings rapprochés pour l'horloge, puis un par battement
        this.ping(); setTimeout(() => this.ping(), 300); setTimeout(() => this.ping(), 900);
        this.onOuverte?.();
        return;
      case 'pong': {
        const envoi = typeof m.id === 'number' ? this.pings.get(m.id) : undefined;
        if (envoi === undefined || typeof m.ts !== 'number') return;
        this.pings.delete(m.id as number);
        this.mesures.push(estimerDecalage(envoi, Date.now(), m.ts));
        if (this.mesures.length > 8) this.mesures.shift();
        // la mesure au plus court aller-retour est la plus juste
        const meilleure = this.mesures.reduce((a, b) => (b.allerRetour < a.allerRetour ? b : a));
        this.decalage = meilleure.decalage;
        this.allerRetourMs = this.mesures[this.mesures.length - 1]!.allerRetour;
        return;
      }
      case 'rtc': {
        const r = lireMessageRtc(m);
        if (r) this.onRtc?.(r);
        return;
      }
      case 'erreur':
        this.onErreur?.(String(m.code), String(m.message ?? ''));
        return;
    }
  }
}
