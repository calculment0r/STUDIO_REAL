// Transports du téléphone : le transport mémoire (émulateur, tests), le transport WebSocket sur une fausse socket, et
// un téléphone complet (machine + transport mémoire) de bout en bout, sans navigateur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageClient, MsgHello } from '@studio-real/protocole';
import { transportMemoire, transportWebSocket, delaiReconnexion, type EtatTransport, type WebSocketMinimal } from './transport';
import { demarrerTelephone } from './telephone';
import { CAPACITES_NEUTRES } from './capacites';

const SESSION = 's_123456';
const hello = (): Omit<MsgHello, 'jeton'> => ({ t: 'hello', v: 2, role: 'acteur', acteur: 'public', personne: 'tel_abcdef', session: SESSION, vseq: 0, cseq: 0 });
const bienvenue = (cseq = 0, vue: Record<string, unknown> | null = null) =>
  ({ t: 'bienvenue', v: 2, role: 'acteur', acteur: 'public', session: SESSION, ts: 1, vue, cseq });

describe('transport mémoire', () => {
  it('ouvrir : le téléphone envoie son hello (avec le jeton), puis les messages passent dans les deux sens', () => {
    const { telephone, serveur } = transportMemoire({ hello, jeton: 'public' });
    const recus: MessageClient[] = [];
    const vus: unknown[] = [];
    serveur.surMessage(m => recus.push(m));
    telephone.surMessage(m => vus.push(m));
    serveur.ouvrir();
    expect(recus[0]).toMatchObject({ t: 'hello', jeton: 'public', personne: 'tel_abcdef' });
    telephone.envoyer({ t: 'in', cseq: 1, k: 'pret', data: { pret: true } });
    expect(recus[1]).toEqual({ t: 'in', cseq: 1, k: 'pret', data: { pret: true } });
    expect(serveur.envoyer(bienvenue())).toBe(true);
    expect(vus).toEqual([bienvenue()]);
  });

  it('un message serveur invalide n’arrive pas au téléphone', () => {
    const { telephone, serveur } = transportMemoire({ hello, ouvrir: true });
    const vus: unknown[] = [];
    telephone.surMessage(m => vus.push(m));
    expect(serveur.envoyer({ t: 'vue', acteur: 'public', vseq: -1, at: 0, ecran: 'vote', params: {} })).toBe(false);
    expect(serveur.envoyer({ t: 'inconnu' })).toBe(false);
    expect(vus).toEqual([]);
  });

  it('coupé : les entrées attendent (pas les battements) ; rouvert : hello d’abord, puis la file dans l’ordre', () => {
    const { telephone, serveur } = transportMemoire({ hello, ouvrir: true });
    const etats: EtatTransport['etat'][] = [];
    telephone.surEtat(e => etats.push(e.etat));
    serveur.couper();
    telephone.envoyer({ t: 'in', cseq: 1, k: 'pret', data: { pret: true } });
    telephone.envoyer({ t: 'etat', heure: 1, ecran: null, visible: true });
    telephone.envoyer({ t: 'in', cseq: 2, k: 'reaction', data: { emoji: '👏' } });
    const avant = serveur.recus.length;
    serveur.ouvrir();
    expect(serveur.recus.slice(avant).map(m => (m.t === 'in' ? `in${m.cseq}` : m.t))).toEqual(['hello', 'in1', 'in2']);
    expect(etats).toEqual(['ouvert', 'attente', 'ouvert']);
  });

  it('fermé : plus rien ne passe', () => {
    const { telephone, serveur } = transportMemoire({ hello, ouvrir: true });
    telephone.fermer();
    const avant = serveur.recus.length;
    telephone.envoyer({ t: 'in', cseq: 1, k: 'pret', data: { pret: true } });
    expect(serveur.recus.length).toBe(avant);
    expect(serveur.envoyer(bienvenue())).toBe(false);
  });

  it('livraison différée (latence émulée)', () => {
    const attente: (() => void)[] = [];
    const { telephone, serveur } = transportMemoire({ hello, differer: fn => attente.push(fn) });
    serveur.ouvrir();
    telephone.envoyer({ t: 'ping', tc: 1 });
    expect(serveur.recus).toEqual([]);
    attente.splice(0).forEach(f => f());
    expect(serveur.recus.map(m => m.t)).toEqual(['hello', 'ping']);
  });
});

// ── WebSocket sur une fausse socket ────────────────────────────────────────────────────────────────────────────────

class FausseSocket implements WebSocketMinimal {
  static toutes: FausseSocket[] = [];
  readyState = 0;
  envoyes: Record<string, unknown>[] = [];
  ferme = false;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(public url: string) { FausseSocket.toutes.push(this); }
  send(d: string) { if (this.readyState !== 1) throw new Error('fermée'); this.envoyes.push(JSON.parse(d)); }
  close() { this.ferme = true; this.readyState = 3; }
  // côté test
  ouvrir() { this.readyState = 1; this.onopen?.({}); }
  recevoir(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
  couper() { this.readyState = 3; this.onclose?.({}); }
}

class Cible {
  ecouteurs = new Map<string, Set<() => void>>();
  visibilityState = 'visible';
  addEventListener(t: string, f: () => void) { if (!this.ecouteurs.has(t)) this.ecouteurs.set(t, new Set()); this.ecouteurs.get(t)!.add(f); }
  removeEventListener(t: string, f: () => void) { this.ecouteurs.get(t)?.delete(f); }
  emettre(t: string) { this.ecouteurs.get(t)?.forEach(f => f()); }
}

describe('transport WebSocket', () => {
  let doc: Cible;
  let fen: Cible;
  let maintenant = 1000;
  beforeEach(() => {
    vi.useFakeTimers();
    FausseSocket.toutes = [];
    doc = new Cible();
    fen = new Cible();
    maintenant = 1000;
  });
  afterEach(() => vi.useRealTimers());

  const creer = () => transportWebSocket('wss://salle.example/ws', 'jeton-public', {
    hello,
    env: {
      WebSocket: FausseSocket, maintenant: () => maintenant, aleatoire: () => 0.5,
      setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: id => clearTimeout(id as never),
      setInterval: (f, ms) => setInterval(f, ms), clearInterval: id => clearInterval(id as never),
      document: doc, fenetre: fen,
    },
  });

  it('à l’ouverture : hello avec le jeton, puis la file, puis un ping', () => {
    const t = creer();
    t.envoyer({ t: 'in', cseq: 5, k: 'pret', data: { pret: true } });
    t.envoyer({ t: 'etat', heure: 1, ecran: null, visible: true });       // périssable : pas gardé
    const s = FausseSocket.toutes[0]!;
    expect(s.url).toBe('wss://salle.example/ws');
    s.ouvrir();
    expect(s.envoyes.map(m => m.t)).toEqual(['hello', 'in', 'ping']);
    expect(s.envoyes[0]).toMatchObject({ jeton: 'jeton-public', session: SESSION });
    t.fermer();
  });

  it('messages reçus validés ; pong : aller-retour et décalage d’horloge', () => {
    const t = creer();
    const vus: unknown[] = [];
    const etats: EtatTransport[] = [];
    t.surMessage(m => vus.push(m));
    t.surEtat(e => etats.push(e));
    const s = FausseSocket.toutes[0]!;
    s.ouvrir();
    s.recevoir({ t: 'nimporte' });
    s.recevoir(bienvenue());
    expect(vus).toEqual([bienvenue()]);
    maintenant = 1100;
    s.recevoir({ t: 'pong', tc: 1000, ts: 5050 });
    expect(etats.at(-1)).toMatchObject({ etat: 'ouvert', rttMs: 100, decalageMs: 4000 });
    t.fermer();
  });

  it('2 pongs manqués : la socket est déclarée morte, on se reconnecte avec attente croissante', () => {
    const t = creer();
    const s = FausseSocket.toutes[0]!;
    s.ouvrir();                                   // ping n°1 (sans réponse)
    vi.advanceTimersByTime(4000);                 // ping n°2 (sans réponse)
    expect(s.envoyes.filter(m => m.t === 'ping')).toHaveLength(2);
    vi.advanceTimersByTime(4000);                 // 2 manqués : morte
    expect(s.ferme).toBe(true);
    expect(FausseSocket.toutes).toHaveLength(1);
    vi.advanceTimersByTime(delaiReconnexion(1, () => 0.5));
    expect(FausseSocket.toutes).toHaveLength(2);
    t.fermer();
  });

  it('un pong remet le compte à zéro', () => {
    const t = creer();
    const s = FausseSocket.toutes[0]!;
    s.ouvrir();
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(4000);
      s.recevoir({ t: 'pong', tc: maintenant, ts: maintenant });
    }
    expect(s.ferme).toBe(false);
    t.fermer();
  });

  it('coupure : reconnexion programmée ; « online » ou retour au premier plan : reconnexion immédiate', () => {
    const t = creer();
    FausseSocket.toutes[0]!.ouvrir();
    FausseSocket.toutes[0]!.couper();
    expect(FausseSocket.toutes).toHaveLength(1);
    fen.emettre('online');
    expect(FausseSocket.toutes).toHaveLength(2);
    FausseSocket.toutes[1]!.ouvrir();
    FausseSocket.toutes[1]!.couper();
    doc.emettre('visibilitychange');
    expect(FausseSocket.toutes).toHaveLength(3);
    FausseSocket.toutes[2]!.couper();
    fen.emettre('pageshow');
    expect(FausseSocket.toutes).toHaveLength(4);
    t.fermer();
    fen.emettre('online');
    expect(FausseSocket.toutes).toHaveLength(4);
  });

  it('attente croissante plafonnée à 10 s, avec gigue', () => {
    expect(delaiReconnexion(1, () => 0.5)).toBe(1000);
    expect(delaiReconnexion(3, () => 0.5)).toBe(4000);
    expect(delaiReconnexion(9, () => 0.5)).toBe(10_000);
    expect(delaiReconnexion(9, () => 0)).toBe(7500);
    expect(delaiReconnexion(9, () => 1)).toBe(12_500);
  });
});

// ── Un téléphone complet, sans navigateur ──────────────────────────────────────────────────────────────────────────

describe('téléphone de bout en bout (machine + transport mémoire)', () => {
  afterEach(() => vi.useRealTimers());

  it('connexion, vote, coupure, vote hors ligne, reconnexion : la file est rejouée après le hello', () => {
    vi.useFakeTimers();
    let paire!: ReturnType<typeof transportMemoire>;
    const tel = demarrerTelephone({
      etat: { acteur: 'public', personne: 'tel_abcdef', session: SESSION, pseudo: 'lea' },
      creerTransport: h => (paire = transportMemoire({ hello: h, jeton: 'public' })).telephone,
      app: { version: '0.1.0', build: 'essai' }, capacites: CAPACITES_NEUTRES, navigateur: false, horloge: () => 5000,
    });
    const serveur = paire.serveur;
    // le « serveur » : bienvenue à chaque hello, ack à chaque entrée
    serveur.surMessage(m => {
      if (m.t === 'hello') serveur.envoyer(bienvenue(0, { acteur: 'public', vseq: 1, at: 1, ecran: 'vote', params: { numero: 1, reponses: ['a', 'b'] } }));
    });
    serveur.ouvrir();
    expect(serveur.recus[0]).toMatchObject({ t: 'hello', pseudo: 'lea', app: { version: '0.1.0' }, capacites: ['video', 'plateforme:autre'] });
    tel.magasin.envoyer({ a: 'affiche' });
    tel.magasin.envoyer({ a: 'voter', index: 1 });
    const ins = () => serveur.recus.filter((m): m is Extract<MessageClient, { t: 'in' }> => m.t === 'in').map(m => `${m.k}${m.cseq}`);
    expect(ins()).toEqual(['accuse1', 'vote2']);

    serveur.couper();
    expect(tel.magasin.lire().connecte).toBe(false);
    serveur.envoyer(bienvenue());                                        // ligne coupée : perdu
    tel.magasin.envoyer({ a: 'reagir', emoji: '👏' });
    expect(ins()).toEqual(['accuse1', 'vote2']);

    vi.advanceTimersByTime(5000);                                        // battement : rien hors ligne
    expect(serveur.recus.some(m => m.t === 'etat')).toBe(false);

    serveur.ouvrir();                                                    // hello (cseq 3) → bienvenue{cseq:0} → rejeu
    const hello2 = serveur.recus.filter(m => m.t === 'hello')[1];
    expect(hello2).toMatchObject({ cseq: 3, vseq: 1 });
    expect(ins()).toEqual(['accuse1', 'vote2', 'accuse1', 'vote2', 'reaction3']);

    vi.advanceTimersByTime(5000);
    expect(serveur.recus.at(-1)).toMatchObject({ t: 'etat', ecran: { vseq: 1, ecran: 'vote' }, enLigne: true });
    tel.arreter();
  });

  it('persistance : le pseudo et le cseq sont gardés à chaque changement', () => {
    const gardes: string[] = [];
    let paire!: ReturnType<typeof transportMemoire>;
    const tel = demarrerTelephone({
      etat: { acteur: 'public', personne: 'tel_abcdef', session: SESSION },
      creerTransport: h => (paire = transportMemoire({ hello: h })).telephone,
      app: { version: '0.1.0', build: 'essai' }, capacites: CAPACITES_NEUTRES, navigateur: false,
      persister: { pseudo: p => gardes.push(`pseudo:${p}`), cseq: n => gardes.push(`cseq:${n}`) },
    });
    paire.serveur.surMessage(m => { if (m.t === 'hello') paire.serveur.envoyer(bienvenue()); });
    paire.serveur.ouvrir();
    tel.magasin.envoyer({ a: 'pseudo', pseudo: 'lea' });
    tel.magasin.envoyer({ a: 'pret' });
    expect(gardes).toEqual(['pseudo:lea', 'cseq:1']);
    // nouveau pseudo une fois connecté : hello renvoyé
    expect(paire.serveur.recus.filter(m => m.t === 'hello').at(-1)).toMatchObject({ pseudo: 'lea' });
    tel.arreter();
  });
});
