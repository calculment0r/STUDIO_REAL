// Client commun des agents IA du serveur de spectacle (protocole v2, rôle `agent`).
// Ce que fait un agent, quel qu'il soit (figurants, ÉCO, plus tard Whisper et OSC) :
//   - il se présente avec `hello{role:'agent', acteur}` à chaque ouverture de la ligne ;
//   - il reçoit des `agent.cmd{n, …}` numérotées : le serveur les REJOUE à chaque reconnexion tant qu'elles ne sont
//     pas accusées `fait`, donc l'agent ne traite chaque `n` qu'une fois (table des `n` vus) et, si le `fait` s'est
//     perdu, le renvoie sans refaire le travail ;
//   - il accuse `recu` dès réception, puis `fait`, `echec` ou `refus` (avec un `detail` lisible) ;
//   - il envoie ses entrées par `agent.in{cseq, k, data}` (`cseq` croissant pour la session).
// Le transport est celui du paquet protocole (`transportWebSocket` : file, reconnexion, ping). Sous Node on lui donne le
// WebSocket du paquet `ws` ; dans les tests, `fabriqueTransport` branche `transportMemoire` (aucun port).
import {
  transportWebSocket, VERSION_PROTOCOLE,
  type AppClient, type EnvironnementWS, type EtatTransport, type FabriqueHello, type MsgAgentCmd, type MsgAgentIn,
  type MessageServeur, type TransportSpectacle,
} from '@studio-real/protocole';

/** Ce que l'agent répond à une commande une fois traitée. */
export type StatutFinal = 'fait' | 'echec' | 'refus';
export type ResultatCommande = StatutFinal | { statut: StatutFinal; detail?: string };
/** Le traitement d'une commande ; une exception vaut `echec` (avec son message comme `detail`). */
export type TraiterCommande = (cmd: MsgAgentCmd) => ResultatCommande | void | Promise<ResultatCommande | void>;

/** Forme des noms d'entrée acceptés par le serveur (`agent.in.k`). */
export const FORME_K = /^[a-z][a-z0-9.:_-]{0,63}$/;

export interface OptionsClientAgent {
  /** adresse du serveur : ws:// ou wss:// */
  url: string;
  /** jeton du rôle `agent` (jamais écrit dans un journal) */
  jeton: string;
  /** id de l'acteur incarné : 'figurants', 'eco'… */
  acteur: string;
  /** identifiant de la connexion logique, gardé pendant les reconnexions (défaut : tiré au hasard) */
  session?: string;
  app: AppClient;
  /** WebSocket et minuteurs injectables (sous Node : `{ WebSocket }` du paquet `ws`) */
  env?: Partial<EnvironnementWS>;
  /** remplace le transport (tests : `transportMemoire`) ; reçoit le `hello` courant sans jeton, et le jeton */
  fabriqueTransport?: (hello: FabriqueHello, jeton: string) => TransportSpectacle;
}

export interface EtatClientAgent {
  /** la ligne est ouverte */
  connecte: boolean;
  ligne: EtatTransport;
  session: string;
  acteur: string;
  /** dernier `cseq` d'`agent.in` envoyé */
  cseq: number;
  /** nombre de commandes différentes reçues depuis le début */
  commandesVues: number;
  /** dernier refus du serveur (hello invalide, jeton faux…), pour l'affichage */
  dernierRefus?: { code: string; message: string; fatal: boolean };
}

export interface ClientAgent {
  /** branche le traitement des commandes ; celles arrivées avant sont gardées puis livrées dans l'ordre */
  surCommande(fn: TraiterCommande): void;
  /** envoie `agent.in{k, data}` ; renvoie le `cseq` utilisé. Lève si `k` n'a pas la forme du protocole. */
  envoyer(k: string, data?: Record<string, unknown>): number;
  etat(): EtatClientAgent;
  surEtat(fn: (e: EtatClientAgent) => void): () => void;
  /** renvoie l'accusé d'une commande (utile à un agent dont le travail finit longtemps après la commande) */
  accuser(n: number, statut: 'recu' | StatutFinal, detail?: string): void;
  fermer(): void;
}

interface Vue { statut: 'recu' | StatutFinal; detail?: string }

function nouvelleSession(): string {
  return 's_agent_' + Math.random().toString(36).slice(2, 10);
}

function normaliser(r: ResultatCommande | void): { statut: StatutFinal; detail?: string } {
  if (r === undefined) return { statut: 'fait' };
  if (typeof r === 'string') return { statut: r };
  return r.detail !== undefined ? { statut: r.statut, detail: r.detail } : { statut: r.statut };
}

export function creerClientAgent(options: OptionsClientAgent): ClientAgent {
  const session = options.session ?? nouvelleSession();
  let cseq = 0;
  let traiter: TraiterCommande | null = null;
  let derniereLigne: EtatTransport = { etat: 'connexion', essai: 0 };
  let dernierRefus: EtatClientAgent['dernierRefus'];
  let ferme = false;
  /** n → ce qu'on en a dit au serveur (une commande n'est traitée qu'une fois) */
  const vues = new Map<number, Vue>();
  /** commandes reçues avant `surCommande` */
  const enAttente: MsgAgentCmd[] = [];
  const abonnes = new Set<(e: EtatClientAgent) => void>();

  const hello: FabriqueHello = () => ({
    t: 'hello', v: VERSION_PROTOCOLE, role: 'agent', acteur: options.acteur, session, app: options.app, cseq,
  });
  const transport: TransportSpectacle = options.fabriqueTransport
    ? options.fabriqueTransport(hello, options.jeton)
    : transportWebSocket(options.url, options.jeton, { hello, ...(options.env ? { env: options.env } : {}) });

  const etat = (): EtatClientAgent => ({
    connecte: derniereLigne.etat === 'ouvert', ligne: derniereLigne, session, acteur: options.acteur, cseq,
    commandesVues: vues.size, ...(dernierRefus ? { dernierRefus } : {}),
  });
  const prevenir = () => { const e = etat(); for (const fn of [...abonnes]) { try { fn(e); } catch { /* un abonné fautif ne coupe rien */ } } };

  function accuser(n: number, statut: 'recu' | StatutFinal, detail?: string) {
    if (ferme) return;
    const v = vues.get(n);
    // un statut final est définitif : un `recu` tardif ne le remplace pas
    if (v && v.statut !== 'recu' && statut === 'recu') return;
    vues.set(n, { statut, ...(detail !== undefined ? { detail } : {}) });
    transport.envoyer({ t: 'agent.ack', n, statut, ...(detail !== undefined ? { detail } : {}) });
  }

  async function executer(cmd: MsgAgentCmd, fn: TraiterCommande) {
    let res: { statut: StatutFinal; detail?: string };
    try {
      res = normaliser(await fn(cmd));
    } catch (e) {
      res = { statut: 'echec', detail: String((e as Error)?.message ?? e).slice(0, 200) };
    }
    accuser(cmd.n, res.statut, res.detail);
  }

  function recevoir(cmd: MsgAgentCmd) {
    const deja = vues.get(cmd.n);
    if (deja) {
      // rejouée par le serveur : pas de nouveau travail ; on répète seulement ce qu'on avait dit (le `fait` perdu)
      transport.envoyer({ t: 'agent.ack', n: cmd.n, statut: deja.statut, ...(deja.detail !== undefined ? { detail: deja.detail } : {}) });
      return;
    }
    accuser(cmd.n, 'recu');
    prevenir();
    if (!traiter) { enAttente.push(cmd); return; }
    void executer(cmd, traiter);
  }

  const offMessage = transport.surMessage((m: MessageServeur) => {
    if (m.t === 'agent.cmd') recevoir(m);
    else if (m.t === 'resync') transport.renouer();
    else if (m.t === 'refus') { dernierRefus = { code: m.code, message: m.message, fatal: m.fatal === true }; prevenir(); }
  });
  const offEtat = transport.surEtat(e => { derniereLigne = e; prevenir(); });

  return {
    surCommande(fn) {
      traiter = fn;
      while (enAttente.length) void executer(enAttente.shift()!, fn);
    },
    envoyer(k, data = {}) {
      if (!FORME_K.test(k)) throw new Error(`agent.in : nom d'entrée invalide « ${k} »`);
      cseq += 1;
      const m: MsgAgentIn = { t: 'agent.in', cseq, k, data };
      transport.envoyer(m);
      return cseq;
    },
    etat,
    surEtat(fn) { abonnes.add(fn); return () => { abonnes.delete(fn); }; },
    accuser,
    fermer() {
      if (ferme) return;
      ferme = true;
      transport.fermer();      // l'état « ferme » est publié avant qu'on se désabonne
      offMessage();
      offEtat();
    },
  };
}
