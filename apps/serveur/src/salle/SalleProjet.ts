// Durable Object « SalleProjet » : UNE instance par projet (nom = id du projet).
//
// Rôle : salle de travail collaboratif temps réel (API WebSocket Hibernation).
//  - copie de travail du projet en mémoire, reconstruite après éveil depuis SQLite (dernier instantané + journal) ;
//  - deltas numérotés `seq` diffusés à tous ; instantané complet à la (re)connexion ou sur `resync` ;
//  - entrées idempotentes : `cseq` croissant par session (onglet) ; un renvoi reçoit le même acquittement (« doublon ») ;
//  - présence, curseurs, chat, commentaires épinglés, verrous par personne (mode Scène), état de lecture régie → postes ;
//  - enregistrement dans D1 : sur demande (`enregistrer`), automatique (alarme, 15 s après la dernière modification,
//    60 s au plus) et pour l'API REST (PUT) qui passe par ici pour que toutes les écritures d'un projet soient sérialisées.
// Protocole complet : apps/serveur/PROTOCOLE.md.
import { DurableObject } from 'cloudflare:workers';
import type { CategorieAssets, Projet } from '@studio-real/modele';
import { type Env, limites } from '../env';
import { enregistrerVersion, lireProjet, type ResultatEnregistrement } from '../depot';
import { appliquerOps, ErreurOp, type Op } from '../logique/ops';
import {
  ciblesDesOps, peutChangerMode, peutDiffuserLecture, peutForcer, peutModifier, peutPrendre,
  type ModeSalle, type Verrou,
} from '../logique/verrous';
import {
  couleurPour, ErreurProtocole, LIMITES_WS, lireMessageClient, VERSION_PROTOCOLE,
  type Ancre, type Commentaire, type Curseur, type MessageChat, type MessageClient, type MessageServeur, type Personne, type Role, type StatutAck,
} from '../logique/protocole';
import { nouvelId } from '../securite';

/** Attachement d'un socket (survit à l'hibernation, ≤ 16 Ko). */
interface Attache { personne?: string; session?: string; nom?: string; couleur?: string; role?: Role; depuis: number }

const DELAI_AUTO_MS = 15_000;
const DELAI_AUTO_MAX_MS = 60_000;
const INSTANTANE_TOUS_LES = 100;
const MAX_CHAT_GARDES = 500;

export class SalleProjet extends DurableObject<Env> {
  private sql: SqlStorage;
  private projetId: string | null = null;
  private projet: Projet | null = null;
  private seq = 0;
  private seqInstantane = 0;
  private seqEnregistre = 0;
  private versionBase = 0;
  private saleDepuis: number | null = null;
  private mode: ModeSalle = 'ecrire';
  private lecture: { etat: unknown; par: string; ts: number } | null = null;
  private curseurs = new Map<string, Curseur>();
  private chargement: Promise<void> | null = null;
  private fileEnregistrement: Promise<unknown> = Promise.resolve();
  private enregistrementExterne = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS etat (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS journal (seq INTEGER PRIMARY KEY, t INTEGER NOT NULL, personne TEXT, session TEXT, cseq INTEGER, ops TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (session TEXT PRIMARY KEY, personne TEXT NOT NULL, last_cseq INTEGER NOT NULL DEFAULT 0, dernier_ack TEXT, vu_le INTEGER);
      CREATE TABLE IF NOT EXISTS verrous (cible TEXT PRIMARY KEY, personne TEXT NOT NULL, nom TEXT NOT NULL, pris_le INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS commentaires (id TEXT PRIMARY KEY, ancre TEXT NOT NULL, texte TEXT NOT NULL, auteur TEXT NOT NULL, nom TEXT NOT NULL, couleur TEXT NOT NULL, cree_le INTEGER NOT NULL, resolu INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, personne TEXT NOT NULL, nom TEXT NOT NULL, couleur TEXT NOT NULL, texte TEXT NOT NULL, t INTEGER NOT NULL);
    `);
    // Répond aux pings applicatifs sans réveiller l'objet.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
    this.restaurer();
  }

  // ───────────────────────── état persistant ─────────────────────────

  private lireEtat(cle: string): string | null {
    const r = this.sql.exec<{ valeur: string }>('SELECT valeur FROM etat WHERE cle = ?', cle).toArray()[0];
    return r ? r.valeur : null;
  }
  private ecrireEtat(cle: string, valeur: string) {
    this.sql.exec('INSERT INTO etat (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur', cle, valeur);
  }

  /** Après éveil ou redémarrage : dernier instantané + rejeu du journal. */
  private restaurer() {
    this.projetId = this.lireEtat('projet_id');
    this.mode = (this.lireEtat('mode') as ModeSalle | null) ?? 'ecrire';
    const lec = this.lireEtat('lecture');
    this.lecture = lec ? JSON.parse(lec) : null;
    const inst = this.lireEtat('instantane');
    if (!inst) return;
    const { seq, projet } = JSON.parse(inst) as { seq: number; projet: Projet };
    this.projet = projet;
    this.seqInstantane = seq;
    this.seq = seq;
    for (const l of this.sql.exec<{ seq: number; ops: string }>('SELECT seq, ops FROM journal WHERE seq > ? ORDER BY seq', seq)) {
      appliquerOps(this.projet, JSON.parse(l.ops) as Op[]);
      this.seq = l.seq;
    }
    this.versionBase = Number(this.lireEtat('version_base') ?? 0);
    this.seqEnregistre = Number(this.lireEtat('seq_enregistre') ?? 0);
    this.saleDepuis = this.seq > this.seqEnregistre ? Date.now() : null;
  }

  private ecrireInstantane() {
    if (!this.projet) return;
    this.ecrireEtat('instantane', JSON.stringify({ seq: this.seq, projet: this.projet }));
    this.sql.exec('DELETE FROM journal WHERE seq <= ?', this.seq);
    this.seqInstantane = this.seq;
  }

  /** Charge la copie de travail depuis D1 si la salle est neuve (une seule fois, même en cas d'appels concurrents). */
  private async charger(id: string): Promise<void> {
    if (this.projetId && this.projetId !== id) throw new Error('salle attribuée à un autre projet');
    if (this.projet) return;
    this.chargement ??= (async () => {
      const ligne = await lireProjet(this.env.DB, id);
      if (!ligne) throw new Error('projet introuvable');
      if (this.projet) return;
      this.projetId = id;
      this.ecrireEtat('projet_id', id);
      this.projet = JSON.parse(ligne.contenu) as Projet;
      this.versionBase = ligne.version;
      this.seqEnregistre = this.seq;
      this.ecrireEtat('version_base', String(this.versionBase));
      this.ecrireEtat('seq_enregistre', String(this.seqEnregistre));
      this.ecrireInstantane();
    })().finally(() => { this.chargement = null; });
    await this.chargement;
  }

  // ───────────────────────── entrées HTTP / RPC ─────────────────────────

  /** Ouverture d'un WebSocket (le Worker a déjà vérifié le jeton et l'origine). */
  override async fetch(req: Request): Promise<Response> {
    const id = req.headers.get('x-projet-id');
    if (!id) return new Response('x-projet-id manquant', { status: 400 });
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket attendu', { status: 426 });
    await this.charger(id);
    const paire = new WebSocketPair();
    const [client, serveur] = [paire[0], paire[1]];
    this.ctx.acceptWebSocket(serveur);
    serveur.serializeAttachment({ depuis: Date.now() } satisfies Attache);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** RPC : enregistrement venant de l'API REST (PUT /api/projets/:id), sérialisé avec ceux de la salle. */
  async enregistrerRest(o: { id: string; base: number; projet: Projet; assets?: CategorieAssets[]; auteur: string; message?: string }): Promise<ResultatEnregistrement> {
    await this.charger(o.id);
    return this.enFile(async () => {
      // Des modifications en direct non enregistrées : on les enregistre d'abord ; le client REST sera alors en conflit
      // (il n'a pas vu ces modifications) et devra relire.
      if (this.seq > this.seqEnregistre) await this.vider('salle', 'enregistrement automatique (avant écriture externe)');
      this.enregistrementExterne = true;
      try {
        const res = await enregistrerVersion(this.env.DB, { ...o, maxTaille: limites(this.env).projet });
        if (res.ok) {
          this.projet = o.projet;
          this.seq += 1;
          this.versionBase = res.version;
          this.seqEnregistre = this.seq;
          this.ecrireEtat('version_base', String(this.versionBase));
          this.ecrireEtat('seq_enregistre', String(this.seqEnregistre));
          this.ecrireInstantane();
          this.diffuser({ t: 'instantane', seq: this.seq, version: res.version, projet: this.projet, raison: 'version-externe' });
          this.diffuser({ t: 'version', version: res.version, par: o.auteur, seq: this.seq, ...(o.message ? { message: o.message } : {}) });
        }
        return res;
      } finally {
        this.enregistrementExterne = false;
      }
    });
  }

  /** RPC : copie de travail en direct (non encore enregistrée). */
  async lireDirect(id: string): Promise<{ seq: number; version: number; modifie: boolean; projet: Projet }> {
    await this.charger(id);
    return { seq: this.seq, version: this.versionBase, modifie: this.seq > this.seqEnregistre, projet: this.projet! };
  }

  /** Alarme : enregistrement automatique des modifications en direct. */
  override async alarm(): Promise<void> {
    if (this.seq > this.seqEnregistre) await this.enFile(() => this.vider('salle', 'enregistrement automatique'));
  }

  // ───────────────────────── enregistrement ─────────────────────────

  private enFile<T>(f: () => Promise<T>): Promise<T> {
    const p = this.fileEnregistrement.then(f, f);
    this.fileEnregistrement = p.catch(() => undefined);
    return p;
  }

  /** Enregistre la copie de travail dans D1 (nouvelle version). À appeler via enFile. */
  private async vider(auteur: string, message?: string): Promise<ResultatEnregistrement & { inchange?: boolean }> {
    if (!this.projet || !this.projetId) throw new Error('salle non chargée');
    if (this.seq === this.seqEnregistre) return { ok: true, version: this.versionBase, inchange: true };
    const seqVise = this.seq;
    const projet = JSON.parse(JSON.stringify(this.projet)) as Projet;
    const res = await enregistrerVersion(this.env.DB, {
      id: this.projetId, base: this.versionBase, projet, auteur, maxTaille: limites(this.env).projet, ...(message ? { message } : {}),
    });
    if (res.ok) {
      this.versionBase = res.version;
      this.seqEnregistre = seqVise;
      this.ecrireEtat('version_base', String(this.versionBase));
      this.ecrireEtat('seq_enregistre', String(this.seqEnregistre));
      this.ecrireInstantane();
      this.saleDepuis = this.seq > this.seqEnregistre ? Date.now() : null;
      this.diffuser({ t: 'version', version: res.version, par: auteur, seq: seqVise, ...(message ? { message } : {}) });
    } else {
      this.diffuser({ t: 'erreur', code: 'conflit-enregistrement', message: `la version ${res.version_actuelle} a été écrite hors de la salle` });
    }
    return res;
  }

  private async programmerAuto() {
    const now = Date.now();
    this.saleDepuis ??= now;
    await this.ctx.storage.setAlarm(Math.min(now + DELAI_AUTO_MS, this.saleDepuis + DELAI_AUTO_MAX_MS));
  }

  // ───────────────────────── WebSocket ─────────────────────────

  private attache(ws: WebSocket): Attache {
    return (ws.deserializeAttachment() as Attache | null) ?? { depuis: Date.now() };
  }

  private envoyer(ws: WebSocket, m: MessageServeur) {
    try { ws.send(JSON.stringify(m)); } catch { /* socket fermé */ }
  }

  /** Diffuse à tous les sockets identifiés (sauf `sauf`). */
  private diffuser(m: MessageServeur, sauf?: WebSocket) {
    const s = JSON.stringify(m);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === sauf || !this.attache(ws).personne) continue;
      try { ws.send(s); } catch { /* ignoré */ }
    }
  }

  private presents(sauf?: WebSocket): Personne[] {
    const vus = new Map<string, Personne>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === sauf) continue;
      const a = this.attache(ws);
      if (!a.personne || vus.has(a.personne)) continue;
      const p: Personne = { personne: a.personne, nom: a.nom!, couleur: a.couleur!, role: a.role! };
      const c = this.curseurs.get(a.personne);
      if (c) p.curseur = c;
      vus.set(a.personne, p);
    }
    return [...vus.values()];
  }

  private verrous(): Verrou[] {
    return this.sql.exec<{ cible: string; personne: string; nom: string; pris_le: number }>('SELECT cible, personne, nom, pris_le FROM verrous ORDER BY pris_le').toArray()
      .map((v) => ({ ...v }));
  }

  private commentaires(): Commentaire[] {
    return this.sql.exec<{ id: string; ancre: string; texte: string; auteur: string; nom: string; couleur: string; cree_le: number; resolu: number }>(
      'SELECT * FROM commentaires ORDER BY cree_le').toArray()
      .map((c) => ({ ...c, ancre: JSON.parse(c.ancre) as Ancre, resolu: !!c.resolu }));
  }

  private historiqueChat(): MessageChat[] {
    return this.sql.exec<{ id: number; personne: string; nom: string; couleur: string; texte: string; t: number }>(
      'SELECT * FROM chat ORDER BY id DESC LIMIT ?', LIMITES_WS.historiqueChat).toArray().reverse().map((m) => ({ ...m }));
  }

  override async webSocketMessage(ws: WebSocket, brut: string | ArrayBuffer): Promise<void> {
    let m: MessageClient;
    try {
      m = lireMessageClient(brut);
    } catch (e) {
      const err = e instanceof ErreurProtocole ? e : new ErreurProtocole('message-invalide', 'message illisible');
      // Un message porteur de cseq reçoit un ack de refus (le client peut le retirer de sa file).
      const cseq = typeof brut === 'string' ? Number(/"cseq"\s*:\s*(\d+)/.exec(brut)?.[1]) : NaN;
      if (Number.isSafeInteger(cseq) && cseq > 0) this.envoyer(ws, { t: 'ack', cseq, statut: 'refus', raison: err.code });
      else this.envoyer(ws, { t: 'erreur', code: err.code, message: err.message });
      return;
    }
    try {
      await this.traiter(ws, m);
    } catch (e) {
      console.error('salle : erreur de traitement', e);
      this.envoyer(ws, { t: 'erreur', code: 'interne', message: 'erreur interne de la salle' });
    }
  }

  private async traiter(ws: WebSocket, m: MessageClient) {
    const a = this.attache(ws);
    if (m.t === 'hello') return this.hello(ws, a, m);
    if (m.t === 'ping') return this.envoyer(ws, { t: 'pong', ts: Date.now(), ...(m.id !== undefined ? { id: m.id } : {}) });
    if (!a.personne || !a.session) return this.envoyer(ws, { t: 'erreur', code: 'hello-requis', message: 'envoyer hello d\'abord' });
    if (!this.projet) await this.charger(this.projetId!);

    switch (m.t) {
      case 'bye': this.partir(ws); ws.close(1000, 'au revoir'); return;
      case 'resync':
        return this.envoyer(ws, { t: 'instantane', seq: this.seq, version: this.versionBase, projet: this.projet!, raison: 'resync' });
      case 'curseur':
        if (m.curseur) this.curseurs.set(a.personne, m.curseur); else this.curseurs.delete(a.personne);
        return this.diffuser({ t: 'curseur', personne: a.personne, curseur: m.curseur }, ws);
      case 'lecture': {
        const v = peutDiffuserLecture(a.personne, a.role ?? 'auteur', this.verrous(), this.mode);
        if (!v.ok) { if (m.cseq !== undefined) this.envoyer(ws, { t: 'ack', cseq: m.cseq, statut: 'refus', raison: v.raison }); return; }
        this.lecture = { etat: m.etat, par: a.personne, ts: Date.now() };
        this.ecrireEtat('lecture', JSON.stringify(this.lecture));
        this.diffuser({ t: 'lecture', ...this.lecture }, ws);
        if (m.cseq !== undefined) this.envoyer(ws, { t: 'ack', cseq: m.cseq, statut: 'ok' });
        return;
      }
      // sortie écran scène : relais pur aux autres membres (rien n'est gardé ni journalisé)
      case 'scene':
        return this.diffuser({ t: 'scene', message: m.message, par: a.personne, session: a.session, ts: Date.now() }, ws);
      // signalisation WebRTC (flux du streamer) : relais pur vers une session (ou toutes, '*'), rien n'est gardé
      case 'rtc':
        return this.relayerRtc(ws, a as Required<Attache>, m);
    }

    // Messages idempotents (cseq) : un renvoi reçoit le même résultat, marqué « doublon », sans réapplication.
    const sess = this.sql.exec<{ last_cseq: number; dernier_ack: string | null }>('SELECT last_cseq, dernier_ack FROM sessions WHERE session = ?', a.session).toArray()[0];
    if (sess && m.cseq <= sess.last_cseq) {
      const precedent = m.cseq === sess.last_cseq && sess.dernier_ack ? JSON.parse(sess.dernier_ack) : undefined;
      return this.envoyer(ws, { t: 'ack', cseq: m.cseq, statut: 'doublon', ...(precedent ? { res: precedent } : {}) });
    }
    const ack = await this.traiterIdempotent(ws, a as Required<Attache>, m);
    this.sql.exec(
      `INSERT INTO sessions (session, personne, last_cseq, dernier_ack, vu_le) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session) DO UPDATE SET last_cseq = excluded.last_cseq, dernier_ack = excluded.dernier_ack, vu_le = excluded.vu_le`,
      a.session, a.personne, m.cseq, JSON.stringify(ack), Date.now(),
    );
    this.envoyer(ws, { t: 'ack', cseq: m.cseq, ...ack });
  }

  private async traiterIdempotent(
    ws: WebSocket, a: Required<Attache>, m: Extract<MessageClient, { cseq: number }>,
  ): Promise<{ statut: StatutAck; raison?: string; res?: unknown }> {
    const refus = (raison: string) => ({ statut: 'refus' as const, raison });
    switch (m.t) {
      case 'modif': {
        if (this.enregistrementExterne) return refus('enregistrement-en-cours');
        const v = peutModifier(a.personne, ciblesDesOps(this.projet, m.ops), this.verrous(), this.mode);
        if (!v.ok) return refus(v.raison);
        try {
          appliquerOps(this.projet, m.ops);
        } catch (e) {
          if (e instanceof ErreurOp) return refus(e.code);
          throw e;
        }
        this.seq += 1;
        this.sql.exec('INSERT INTO journal (seq, t, personne, session, cseq, ops) VALUES (?, ?, ?, ?, ?, ?)',
          this.seq, Date.now(), a.personne, a.session, m.cseq, JSON.stringify(m.ops));
        if (this.seq - this.seqInstantane >= INSTANTANE_TOUS_LES) this.ecrireInstantane();
        this.diffuser({ t: 'modif', seq: this.seq, ops: m.ops, par: a.personne, session: a.session, cseq: m.cseq });
        await this.programmerAuto();
        return { statut: 'ok', res: { seq: this.seq, base_en_retard: m.base < this.seq - 1 } };
      }
      case 'chat': {
        const t = Date.now();
        const id = this.sql.exec<{ id: number }>('INSERT INTO chat (personne, nom, couleur, texte, t) VALUES (?, ?, ?, ?, ?) RETURNING id',
          a.personne, a.nom, a.couleur, m.texte, t).one().id;
        this.sql.exec('DELETE FROM chat WHERE id <= ?', id - MAX_CHAT_GARDES);
        this.diffuser({ t: 'chat', message: { id, personne: a.personne, nom: a.nom, couleur: a.couleur, texte: m.texte, t } });
        return { statut: 'ok', res: { id } };
      }
      case 'commentaire': {
        if (m.action === 'ajouter') {
          const c: Commentaire = { id: nouvelId('c_', 12), ancre: m.ancre, texte: m.texte, auteur: a.personne, nom: a.nom, couleur: a.couleur, cree_le: Date.now(), resolu: false };
          this.sql.exec('INSERT INTO commentaires (id, ancre, texte, auteur, nom, couleur, cree_le, resolu) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
            c.id, JSON.stringify(c.ancre), c.texte, c.auteur, c.nom, c.couleur, c.cree_le);
          this.diffuser({ t: 'commentaire', action: 'ajoute', commentaire: c });
          return { statut: 'ok', res: { id: c.id } };
        }
        const existe = this.sql.exec<{ auteur: string }>('SELECT auteur FROM commentaires WHERE id = ?', m.id).toArray()[0];
        if (!existe) return refus('commentaire-introuvable');
        if (m.action === 'supprimer') {
          if (existe.auteur !== a.personne) return refus('auteur-seulement');
          this.sql.exec('DELETE FROM commentaires WHERE id = ?', m.id);
          this.diffuser({ t: 'commentaire', action: 'supprime', commentaire: { id: m.id } });
        } else {
          this.sql.exec('UPDATE commentaires SET resolu = ? WHERE id = ?', m.action === 'resoudre' ? 1 : 0, m.id);
          const c = this.commentaires().find((x) => x.id === m.id)!;
          this.diffuser({ t: 'commentaire', action: 'modifie', commentaire: c });
        }
        return { statut: 'ok' };
      }
      case 'verrou': {
        const verrous = this.verrous();
        if (m.action === 'prendre') {
          const v = peutPrendre(a.personne, m.cible, verrous);
          if (!v.ok) return refus(v.raison);
          this.prendreVerrou(m.cible, a);
        } else if (m.action === 'rendre') {
          if (!verrous.some((v) => v.cible === m.cible && v.personne === a.personne)) return refus('verrou-non-detenu');
          this.rendreVerrou(m.cible);
        } else {
          const connectes = new Set(this.presents().map((p) => p.personne));
          const v = peutForcer(m.cible, verrous, connectes);
          if (!v.ok) return refus(v.raison);
          this.rendreVerrou(m.cible);
        }
        return { statut: 'ok' };
      }
      case 'mode': {
        const verrous = this.verrous();
        const v = peutChangerMode(a.personne, this.mode, verrous);
        if (!v.ok) return refus(v.raison);
        this.mode = m.mode;
        this.ecrireEtat('mode', m.mode);
        this.diffuser({ t: 'mode', mode: m.mode, par: a.personne });
        // Passer en Scène donne le verrou du projet à qui le demande, s'il est libre.
        if (m.mode === 'jouer' && peutPrendre(a.personne, 'projet', verrous).ok && !verrous.some((x) => x.cible === 'projet')) {
          this.prendreVerrou('projet', a);
        }
        return { statut: 'ok' };
      }
      case 'enregistrer': {
        if (this.seq === this.seqEnregistre) return { statut: 'ok', res: { version: this.versionBase, inchange: true } };
        const res = await this.enFile(() => this.vider(a.nom, m.message));
        return res.ok ? { statut: 'ok', res: { version: res.version } } : { statut: 'conflit', res: { version_actuelle: res.version_actuelle } };
      }
    }
  }

  /**
   * Relais de signalisation WebRTC (téléphone du streamer ↔ sortie écran scène) : le `signal` part tel quel, avec
   * `de` = session de l'émetteur posée ici (un client ne peut pas se faire passer pour un autre). `vers` = une session
   * précise (tous ses sockets) ou '*' (tous les autres membres identifiés). Destinataire absent → erreur `rtc-absent`.
   */
  private relayerRtc(ws: WebSocket, a: Required<Attache>, m: Extract<MessageClient, { t: 'rtc' }>) {
    const sortant = JSON.stringify({ t: 'rtc', de: a.session, par: a.personne, vers: m.vers, signal: m.signal, ts: Date.now() } satisfies MessageServeur);
    let remis = 0;
    for (const autre of this.ctx.getWebSockets()) {
      if (autre === ws) continue;
      const b = this.attache(autre);
      if (!b.personne || (m.vers !== '*' && b.session !== m.vers)) continue;
      try { autre.send(sortant); remis++; } catch { /* socket fermé */ }
    }
    if (!remis && m.vers !== '*') this.envoyer(ws, { t: 'erreur', code: 'rtc-absent', message: `session ${m.vers} absente de la salle` });
  }

  private prendreVerrou(cible: string, a: Required<Attache>) {
    this.sql.exec('INSERT OR REPLACE INTO verrous (cible, personne, nom, pris_le) VALUES (?, ?, ?, ?)', cible, a.personne, a.nom, Date.now());
    this.diffuser({ t: 'verrou', cible, personne: a.personne, nom: a.nom });
  }

  private rendreVerrou(cible: string) {
    this.sql.exec('DELETE FROM verrous WHERE cible = ?', cible);
    this.diffuser({ t: 'verrou', cible, personne: null });
  }

  private hello(ws: WebSocket, a: Attache, m: Extract<MessageClient, { t: 'hello' }>) {
    if (!this.projet) return this.envoyer(ws, { t: 'erreur', code: 'salle-non-chargee', message: 'salle non chargée' });
    const dejaLa = this.presents(ws).some((p) => p.personne === m.personne);
    const nouvelle: Attache = {
      personne: m.personne, session: m.session, nom: m.nom, couleur: m.couleur ?? couleurPour(m.personne), role: m.role ?? 'auteur', depuis: a.depuis,
    };
    ws.serializeAttachment(nouvelle);
    const vous = { personne: m.personne, session: m.session, nom: nouvelle.nom!, couleur: nouvelle.couleur!, role: nouvelle.role! };
    const aJour = m.seq !== undefined && m.seq === this.seq;
    this.envoyer(ws, {
      t: 'bienvenue', v: VERSION_PROTOCOLE, vous,
      seq: this.seq, version: this.versionBase, a_jour: aJour, projet: aJour ? null : this.projet,
      mode: this.mode, lecture: this.lecture, presents: this.presents(), verrous: this.verrous(),
      commentaires: this.commentaires(), chat: this.historiqueChat(), ts: Date.now(),
    });
    if (!dejaLa) this.diffuser({ t: 'arrivee', personne: { personne: vous.personne, nom: vous.nom, couleur: vous.couleur, role: vous.role } }, ws);
  }

  /** Départ d'un socket : on annonce le départ si c'était le dernier socket de la personne. */
  private partir(ws: WebSocket) {
    const a = this.attache(ws);
    if (!a.personne) return;
    ws.serializeAttachment({ depuis: a.depuis } satisfies Attache);
    if (this.presents(ws).some((p) => p.personne === a.personne)) return;
    this.curseurs.delete(a.personne);
    this.diffuser({ t: 'depart', personne: a.personne }, ws);
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    this.partir(ws);
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'fermeture'); } catch { /* déjà fermé */ }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.partir(ws);
  }
}
