// Hôte Node du serveur de spectacle : HTTP (clients construits, médias, /sante, /config.json) + WebSocket /ws.
// Il ne contient AUCUNE règle de spectacle : il vérifie les jetons, lit les messages (`lireMessageClient`), les passe
// au noyau (`Representation`), remet les sorties selon leur destination, écrit le journal et l'instantané.
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { chargerFichier, type Projet } from '@studio-real/modele';
import { LIMITES, lireMessageClient, type MessageServeur, type MsgRefus } from '@studio-real/protocole';
import { Representation, correspond, empreinteDe, type EvenementJournal, type InfoSession, type Sortie } from '../noyau';
import { ROLES_JETON, chemin, configPublique, type ConfigSpectacle, type RoleJeton } from './config';
import { Persistance, type FichierInstantane } from './persistance';
import { SondeTunnel, construireSante, type Sonde } from './sante';
import { servirFichier, servirStatique, type Montage } from './statique';

/** Pages d'exploitation et thème : fichiers du CODE (pas de la configuration), trouvés à partir de ce module. */
const DEPOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const PAGES = join(DEPOT, 'apps', 'serveur-spectacle', 'pages');
const PAGES_FIXES: Record<string, string> = {
  '/sante.html': join(PAGES, 'sante.html'),
  '/checklist.html': join(PAGES, 'checklist.html'),
  '/checklist.md': join(DEPOT, 'exploitation', 'CHECKLIST.md'),
};

/** Battement ping/pong des sockets : une socket qui n'a pas répondu au précédent ping est coupée. */
export const BATTEMENT_MS = 15_000;
/** Fermetures typées. */
export const FERMETURE = { jeton: 4003, refus: 4400, remplacee: 4001, arret: 1001 } as const;

export interface OptionsServeur {
  config: ConfigSpectacle;
  /** racine du dépôt (les chemins de la configuration y sont relatifs) */
  racine: string;
  /** jetons EN CLAIR par rôle (lus dans les secrets) ; seules leurs empreintes sont gardées */
  jetons: Record<RoleJeton, string>;
  /** projet déjà chargé (tests) ; sinon lu depuis config.projet */
  projet?: Projet;
  /** ne pas reprendre le dernier instantané (SANS_REPRISE=1) */
  sansReprise?: boolean;
  /** alarme 1 Hz du lecteur (défaut : oui) ; les tests la coupent et appellent tick() */
  alarme?: boolean;
  version?: string | null;
  /** où écrire les messages d'exploitation (défaut : console) */
  console?: (ligne: string) => void;
  /** sonde de l'adresse publique (défaut : GET <adresse>/sante) ; les tests en passent une fausse */
  sondeTunnel?: Sonde;
  /** intervalle de la sonde du tunnel (défaut 30 s) */
  intervalleSondeMs?: number;
  /**
   * Appelée après `POST /arret` (jeton de la régie, depuis cette machine seulement) : sur Windows aucun signal ne
   * demande un arrêt PROPRE à un processus Node, c'est la voie du script `arreter-spectacle.ps1`.
   */
  surDemandeArret?: () => void;
}

export interface ServeurSpectacle {
  port: number;
  representation: Representation;
  persistance: Persistance;
  /** fait passer le temps à la main (tests, alarme coupée) */
  tick(dt: number): void;
  sante(): Record<string, unknown>;
  /** arrêt propre : sockets fermées (1001), instantané écrit, ports libérés */
  arreter(): Promise<void>;
  /** exception non rattrapée : journal + instantané, synchrones */
  urgence(e: unknown): void;
}

interface Client {
  ws: WebSocket;
  info: InfoSession | null;
  vivant: boolean;
  /** remplacée par une connexion plus récente de la même session, ou fermée par l'arrêt : pas de `fermer` au noyau */
  ignoree: boolean;
}

const empreinteJeton = (j: string) => createHash('sha256').update(j, 'utf8').digest();

/** Erreur « port déjà pris » (code de sortie 2). */
export class ErreurPortPris extends Error {
  constructor(public readonly port: number) { super(`Le port ${port} est déjà pris.`); }
}

export async function demarrerServeur(o: OptionsServeur): Promise<ServeurSpectacle> {
  const dire = o.console ?? ((l: string) => console.log(l));
  const config = o.config;
  const version = o.version ?? null;
  const demarre = Date.now();

  // ── Jetons : empreintes seulement, comparaison à temps constant ──────────────────────────────────────────────────
  const empreintes = new Map<RoleJeton, Buffer>();
  for (const r of ROLES_JETON) empreintes.set(r, empreinteJeton(o.jetons[r]));
  const jetonValide = (role: string, jeton: string): boolean => {
    const attendu = empreintes.get(role as RoleJeton);
    return !!attendu && timingSafeEqual(attendu, empreinteJeton(jeton));
  };

  // ── Noyau, persistance, reprise ─────────────────────────────────────────────────────────────────────────────────
  const projet = o.projet ?? chargerFichier(readFileSync(chemin(o.racine, config.projet), 'utf8')).project;
  const rep = new Representation({ projet, horloge: () => Date.now(), alea: Math.random });
  const persistance = new Persistance(chemin(o.racine, config.exploitation));
  let redemarrages = 0;
  let annonce: string;
  const precedent = o.sansReprise ? null : persistance.dernier();
  if (precedent) {
    const r = rep.restaurer(precedent.contenu.etat);
    redemarrages = (precedent.contenu.redemarrages ?? 0) + 1;
    rep.redemarrer();
    annonce = `Reprise de la représentation ${rep.run?.id ?? '?'} (instantané du ${new Date(precedent.contenu.ecrit).toLocaleTimeString('fr-FR')}, `
      + `${redemarrages} redémarrage(s))${r.divergence ? ' — ATTENTION : état de lecture divergent' : ''}${r.projetModifie ? ' — ATTENTION : projet modifié' : ''}.`;
  } else {
    rep.lancer('scene');
    annonce = `Nouvelle représentation ${rep.run?.id ?? '?'}${o.sansReprise ? ' (SANS_REPRISE)' : ''} ; projet « ${rep.projet.titre ?? config.projet} » (acteurs : ${rep.preparation.origine}).`;
  }
  const instantane = (): FichierInstantane => ({ format: 'studio-real/instantane-hote@1', ecrit: Date.now(), version, redemarrages, etat: rep.instantane() });
  const ecrireJournal = (l: EvenementJournal[]) => {
    try { persistance.journaliser(l); } catch (e) { dire(`Journal : écriture impossible (${(e as Error).message}).`); }
  };
  // Rien n'est écrit sur le disque avant d'avoir le port : une seconde instance lancée par erreur ne doit pas écraser
  // l'instantané ni le journal de celle qui tourne.

  // ── Connexions ──────────────────────────────────────────────────────────────────────────────────────────────────
  const clients = new Set<Client>();
  const parSession = new Map<string, Client>();
  const envoyerA = (c: Client, m: MessageServeur | string) => {
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  };
  const distribuer = (sorties: Sortie[]) => {
    for (const s of sorties) {
      const texte = JSON.stringify(s.m);
      if ('session' in s.a) { const c = parSession.get(s.a.session); if (c) envoyerA(c, texte); continue; }
      for (const c of clients) if (c.info && !c.ignoree && correspond(s.a, c.info)) envoyerA(c, texte);
    }
  };
  /** Après chaque appel au noyau : journal tout de suite, instantané au plus 200 ms plus tard. */
  const apres = () => {
    ecrireJournal(rep.journal());
    persistance.planifier(instantane);
  };
  const traiter = (sorties: Sortie[]) => { distribuer(sorties); apres(); };

  const refuser = (c: Client, code: string, message: string, fatal = false) => {
    const m: MsgRefus = { t: 'refus', code, message };
    if (fatal) m.fatal = true;
    envoyerA(c, m);
  };

  const recevoir = (c: Client, donnees: RawData, binaire: boolean) => {
    if (binaire) { refuser(c, 'binaire', 'Messages JSON texte seulement.'); return; }
    const texte = Array.isArray(donnees) ? Buffer.concat(donnees).toString('utf8') : Buffer.from(donnees as ArrayBuffer).toString('utf8');
    const lu = lireMessageClient(texte);
    if (!lu.message) {
      const code = lu.raison.split(' : ')[0] ?? 'invalide';
      refuser(c, code, lu.raison);
      const cseq = Number(/"cseq"\s*:\s*(\d+)/.exec(texte)?.[1]);
      if (c.info && Number.isSafeInteger(cseq) && cseq > 0) envoyerA(c, { t: 'ack', cseq, statut: 'refus', raison: lu.raison });
      return;
    }
    const m = lu.message;
    if (m.t === 'hello') {
      if (c.info) { refuser(c, 'deja-connecte', 'hello déjà accepté sur cette connexion.'); return; }
      if (!jetonValide(m.role, m.jeton)) {
        refuser(c, 'jeton', 'Jeton refusé.', true);
        ecrireJournal([{ ts: Date.now(), run: rep.run?.id ?? null, src: 'serveur', type: 'refus', code: 'jeton', role: m.role, acteur: m.acteur ?? null }]);
        c.ignoree = true;
        c.ws.close(FERMETURE.jeton, 'jeton refuse');
        return;
      }
      const sorties = rep.recevoir(m.session, m);
      const fatal = sorties.find(s => s.m.t === 'refus' && s.m.fatal && 'session' in s.a && s.a.session === m.session);
      if (fatal) {
        envoyerA(c, fatal.m);
        apres();
        c.ignoree = true;
        c.ws.close(FERMETURE.refus, fatal.m.t === 'refus' ? fatal.m.code : 'refus');
        return;
      }
      // Le dernier gagne : une autre connexion de la même session est fermée (sans « déconnexion » au noyau).
      const ancien = parSession.get(m.session);
      if (ancien && ancien !== c) { ancien.ignoree = true; ancien.ws.close(FERMETURE.remplacee, 'session reprise ailleurs'); }
      c.info = { session: m.session, role: m.role, ...(m.acteur !== undefined ? { acteur: m.acteur } : {}), ...(m.personne !== undefined ? { personne: m.personne } : {}) };
      parSession.set(m.session, c);
      traiter(sorties);
      return;
    }
    if (!c.info) { refuser(c, 'hello-requis', 'Envoyer hello d’abord.'); return; }
    traiter(rep.recevoir(c.info.session, m));
  };

  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITES.message, perMessageDeflate: false });
  const accueillir = (ws: WebSocket) => {
    const c: Client = { ws, info: null, vivant: true, ignoree: false };
    clients.add(c);
    ws.on('message', (d, b) => {
      try { recevoir(c, d, b); } catch (e) { dire(`Message : erreur interne (${(e as Error).message}).`); refuser(c, 'interne', 'Erreur interne du serveur.'); }
    });
    ws.on('pong', () => { c.vivant = true; });
    ws.on('error', () => { /* la fermeture suit */ });
    ws.on('close', () => {
      clients.delete(c);
      if (!c.info) return;
      const session = c.info.session;
      if (parSession.get(session) === c) parSession.delete(session);
      if (!c.ignoree) traiter(rep.fermer(session));
    });
  };
  const battement = setInterval(() => {
    for (const c of clients) {
      if (!c.vivant) { c.ws.terminate(); continue; }
      c.vivant = false;
      try { c.ws.ping(); } catch { /* rien */ }
    }
  }, BATTEMENT_MS);

  // ── HTTP ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const montages: Montage[] = [
    { prefixe: '/conducteur/', dossier: chemin(o.racine, config.clients.conducteur), spa: true },
    { prefixe: '/medias/', dossier: chemin(o.racine, config.medias.dossier) },
    { prefixe: '/theme/', dossier: join(DEPOT, 'packages', 'theme') },
    // Le téléphone est construit avec la base `/t/` (apps/telephone/vite.config.ts) : ses fichiers sont référencés en
    // /t/assets/…, et les liens des acteurs (QR) pointent sur /t/. On le monte donc sous /t/ ET à la racine (une adresse
    // tapée sans /t/ rend quand même la page, dont les fichiers passent par /t/).
    { prefixe: '/t/', dossier: chemin(o.racine, config.clients.telephone), spa: true },
    { prefixe: '/', dossier: chemin(o.racine, config.clients.telephone), spa: true },
  ];
  const json = (res: ServerResponse, code: number, x: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify(x));
  };

  const tunnel = new SondeTunnel({ config, demarre, ...(o.sondeTunnel ? { sonde: o.sondeTunnel } : {}), ...(o.intervalleSondeMs ? { intervalleMs: o.intervalleSondeMs } : {}) });
  const sante = () => {
    const parRole: Record<string, number> = { regie: 0, acteur: 0, agent: 0 };
    for (const c of clients) if (c.info) parRole[c.info.role] = (parRole[c.info.role] ?? 0) + 1;
    return construireSante({
      version, demarre, redemarrages, parRole, total: clients.size, resume: rep.resume(), persistance: persistance.etat(),
      tunnel: tunnel.etat(), maintenant: Date.now(),
    });
  };

  /** Une requête passée par un tunnel ou un relais n'est JAMAIS « de cette machine » (cloudflared arrive en loopback). */
  const viaRelais = (req: IncomingMessage) => ['cf-connecting-ip', 'cf-ray', 'x-forwarded-for', 'x-forwarded-host', 'forwarded', 'x-real-ip'].some(h => req.headers[h] !== undefined);
  const depuisCetteMachine = (req: IncomingMessage) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') && !viaRelais(req);
  const jetonRegieDe = (req: IncomingMessage): string => {
    const a = req.headers.authorization;
    return typeof a === 'string' && a.startsWith('Bearer ') ? a.slice(7).trim() : '';
  };

  const http: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'POST' && (req.url ?? '').split('?')[0] === '/arret') {
      if (!o.surDemandeArret) { json(res, 404, { ok: false, erreur: 'introuvable' }); return; }
      if (!depuisCetteMachine(req)) { json(res, 403, { ok: false, erreur: 'cette machine seulement' }); return; }
      const jeton = jetonRegieDe(req);
      if (!jeton || !jetonValide('regie', jeton)) { json(res, 401, { ok: false, erreur: 'jeton refusé' }); return; }
      json(res, 202, { ok: true, arret: 'demande' });
      setImmediate(o.surDemandeArret);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' });
      res.end('méthode non permise');
      return;
    }
    let p: string;
    try { p = decodeURIComponent(new URL(req.url ?? '/', 'http://serveur').pathname); } catch {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('chemin invalide');
      return;
    }
    if (p === '/sante') { json(res, 200, sante()); return; }
    if (PAGES_FIXES[p]) { servirFichier(req, res, PAGES_FIXES[p]!); return; }
    if (p === '/config.json') { json(res, 200, configPublique(config, { version, run: rep.run?.id ?? null })); return; }
    if (servirStatique(req, res, p, montages)) return;
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' });
    res.end('introuvable');
  });
  http.on('upgrade', (req: IncomingMessage, socket: Duplex, tete: Buffer) => {
    let p = '';
    try { p = new URL(req.url ?? '/', 'http://serveur').pathname; } catch { /* rien */ }
    if (p !== '/ws') { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, tete, ws => accueillir(ws));
  });

  await new Promise<void>((ok, ko) => {
    const surErreur = (e: NodeJS.ErrnoException) => {
      clearInterval(battement);
      wss.close();
      ko(e.code === 'EADDRINUSE' ? new ErreurPortPris(config.port) : e);
    };
    http.once('error', surErreur);
    http.listen(config.port, config.hote, () => { http.off('error', surErreur); ok(); });
  });
  const adresse = http.address();
  const port = typeof adresse === 'object' && adresse ? adresse.port : config.port;
  ecrireJournal(rep.journal());
  persistance.ecrire(instantane());
  dire(annonce);
  tunnel.demarrer();

  // ── Alarme 1 Hz : le lecteur avance d'un nombre entier de secondes (rattrape un retard éventuel) ──────────────────
  let dernierTick = Date.now();
  const tick = (dt: number) => traiter(rep.tick(dt));
  const alarme = o.alarme === false ? null : setInterval(() => {
    const dt = Math.floor((Date.now() - dernierTick) / 1000);
    if (dt < 1) return;
    dernierTick += dt * 1000;
    tick(dt);
  }, 1000);

  let arrete = false;
  return {
    port, representation: rep, persistance, tick, sante,
    async arreter() {
      if (arrete) return;
      arrete = true;
      if (alarme) clearInterval(alarme);
      clearInterval(battement);
      tunnel.arreter();
      for (const c of clients) {
        if (c.info && !c.ignoree && parSession.get(c.info.session) === c) distribuer(rep.fermer(c.info.session));
        c.ignoree = true;
        c.ws.close(FERMETURE.arret, 'arret du serveur');
      }
      ecrireJournal([...rep.journal(), { ts: Date.now(), run: rep.run?.id ?? null, src: 'serveur', type: 'alerte', code: 'arret', empreinte: empreinteDe(rep.instantane()) }]);
      persistance.arreter();
      persistance.ecrire(instantane());
      await new Promise<void>(ok => wss.close(() => ok()));
      for (const c of clients) c.ws.terminate();
      http.closeAllConnections();
      await new Promise<void>(ok => http.close(() => ok()));
    },
    urgence(e: unknown) {
      try {
        ecrireJournal([...rep.journal(), { ts: Date.now(), run: rep.run?.id ?? null, src: 'serveur', type: 'alerte', code: 'exception', message: String((e as Error)?.message ?? e).slice(0, 500) }]);
        persistance.arreter();
        persistance.ecrire(instantane());
      } catch (e2) {
        dire(`Urgence : instantané impossible (${(e2 as Error).message}).`);
      }
    },
  };
}
