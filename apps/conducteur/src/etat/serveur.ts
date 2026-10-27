// Serveur du Conducteur, côté interface (chantier COLLAB) : persistance réelle et salle temps réel.
//
//  1. Configuration : URL du serveur (import.meta.env.VITE_SERVEUR, défaut : même origine), identité de la personne,
//     jetons des projets (saisis une fois, gardés en localStorage). Aucune clé en dur.
//  2. `ClientApi` : l'API REST /api (projets, versions avec contrôle de conflit 409, médias, exécutions).
//  3. `SalleClient` : le WebSocket de la salle (PROTOCOLE.md v1) — reconnexion avec attente croissante, cseq
//     idempotents et renvoi des messages non acquittés, resync sur trou, instantanés, présence, curseurs, chat,
//     commentaires, verrous, mode, lecture. Le projet est synchronisé par différence (src/collab/synchro.ts) avec un
//     « document local » ; hors ligne, tout continue en local et repart au retour.
//  4. Le branchement sur le magasin (`connecterSalle`) : les modifications du magasin partent en `ops`, celles des
//     autres reviennent dans le magasin sans écho ni entrée d'annulation ; l'historique d'annulation reste local et
//     conserve les modifications des autres (annuler ne défait que les siennes, au mieux).
import { create } from 'zustand';
import type { CategorieAssets, EtatLecture, Execution, FichierConducteur, Projet } from '@studio-real/modele';
import { useMagasin, type Magasin } from './magasin';
import { appliquerSouple, copie, diffProjet, type Op } from '../collab/ops';
import { Synchro, type Effet } from '../collab/synchro';
import {
  raisonLisible, VERSION_PROTOCOLE,
  type Ack, type Ancre, type Commentaire, type Curseur, type MessageChat, type MessageClient, type MessageServeur,
  type ModeSalle, type Personne, type Role, type Verrou,
} from '../collab/protocole';

// ═════════════════════════════ 1. configuration ═════════════════════════════

const memoire = new Map<string, string>();
const stockage = {
  lire(cle: string): string | null {
    try { if (typeof localStorage !== 'undefined') return localStorage.getItem(cle); } catch { /* bloqué */ }
    return memoire.get(cle) ?? null;
  },
  ecrire(cle: string, v: string | null): void {
    try {
      if (typeof localStorage !== 'undefined') { if (v === null) localStorage.removeItem(cle); else localStorage.setItem(cle, v); return; }
    } catch { /* bloqué : mémoire */ }
    if (v === null) memoire.delete(cle); else memoire.set(cle, v);
  },
};

const CLES = {
  jetons: 'sr-collab-jetons',
  admin: 'sr-collab-jeton-admin',
  personne: 'sr-collab-personne',
  nom: 'sr-collab-nom',
  role: 'sr-collab-role',
  salle: 'sr-collab-salle',
} as const;

/** URL du serveur, sans « / » final ; '' = même origine que l'interface. */
export function urlServeur(): string {
  const v = (import.meta.env?.VITE_SERVEUR as string | undefined) ?? '';
  return v.trim().replace(/\/+$/, '');
}

const lireJetons = (): Record<string, string> => {
  try { const o = JSON.parse(stockage.lire(CLES.jetons) ?? '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
};
/** Jeton d'un projet (saisi une fois, gardé dans ce navigateur). */
export const jetonProjet = (id: string): string | null => lireJetons()[id] ?? null;
export function memoriserJeton(id: string, jeton: string | null): void {
  const j = lireJetons();
  if (jeton) j[id] = jeton; else delete j[id];
  stockage.ecrire(CLES.jetons, JSON.stringify(j));
}
/** Jeton d'administration (liste et création des projets) : saisi par la régie, jamais dans le code. */
export const jetonAdmin = (): string | null => stockage.lire(CLES.admin);
export const memoriserJetonAdmin = (j: string | null): void => stockage.ecrire(CLES.admin, j?.trim() || null);
/** Dernière salle ouverte (reconnexion au rechargement). */
export const derniereSalle = (): string | null => stockage.lire(CLES.salle);

const aleatoire = (n: number): string => {
  const a = new Uint8Array(n);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
};

export interface Identite { personne: string; nom: string; role: Role }
/** Identité stable de la personne dans ce navigateur (déclarative dans ce prototype). */
export function identite(): Identite {
  let personne = stockage.lire(CLES.personne);
  if (!personne || !/^[A-Za-z0-9_-]{6,64}$/.test(personne)) { personne = 'pers_' + aleatoire(12); stockage.ecrire(CLES.personne, personne); }
  const nom = stockage.lire(CLES.nom)?.trim() || 'Membre ' + personne.slice(-4).toUpperCase();
  const r = stockage.lire(CLES.role);
  return { personne, nom, role: r === 'regie' || r === 'poste' ? r : 'auteur' };
}
export function changerIdentite(c: { nom?: string; role?: Role }): void {
  if (c.nom !== undefined) stockage.ecrire(CLES.nom, c.nom.trim().slice(0, 60) || null);
  if (c.role !== undefined) stockage.ecrire(CLES.role, c.role);
}

// ═════════════════════════════ 2. API REST ═════════════════════════════

export class ErreurApi extends Error {
  readonly statut: number; readonly code: string; readonly details: Record<string, unknown>;
  constructor(statut: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message); this.statut = statut; this.code = code; this.details = details;
  }
}

export interface ResumeProjet { id: string; titre: string; version: number; cree_le: number; modifie_le: number; modifie_par: string | null }
export interface ProjetServeur { id: string; titre: string; version: number; project: Projet; assets: CategorieAssets[]; modifie_le?: number; modifie_par?: string }
export interface ProjetDirect { id: string; seq: number; version: number; modifie: boolean; projet: Projet }
export interface ResumeVersion { version: number; auteur: string | null; message: string | null; taille: number; cree_le: number }
export interface Media { nom: string; taille: number; type?: string; televerse_le: number; etag: string }
export type ResultatEnregistrement = { ok: true; version: number } | { ok: false; conflit: true; version_actuelle: number };

export interface OptionsApi {
  /** URL du serveur ('' = même origine). Défaut : urlServeur(). */
  base?: string;
  /** Jeton à présenter pour un projet (défaut : jeton mémorisé du projet, sinon jeton admin). */
  jeton?: (projet?: string) => string | null;
  /** Nom de l'auteur (versions, médias). */
  auteur?: () => string;
  fetch?: typeof fetch;
}

export class ClientApi {
  readonly base: string;
  private jeton: (projet?: string) => string | null;
  private auteur: () => string;
  private f: typeof fetch;

  constructor(o: OptionsApi = {}) {
    this.base = o.base ?? urlServeur();
    this.jeton = o.jeton ?? ((p) => (p ? jetonProjet(p) : null) ?? jetonAdmin());
    this.auteur = o.auteur ?? (() => identite().nom);
    this.f = o.fetch ?? ((...a) => globalThis.fetch(...a));
  }

  private async requete<T>(chemin: string, o: { methode?: string; projet?: string; admin?: boolean; corps?: unknown; brut?: BodyInit; type?: string; entetes?: Record<string, string> } = {}): Promise<T> {
    const h: Record<string, string> = { ...o.entetes };
    const jeton = o.admin ? jetonAdmin() ?? this.jeton() : this.jeton(o.projet);
    if (jeton) h.authorization = `Bearer ${jeton}`;
    const auteur = this.auteur();
    // en-tête HTTP : Latin-1 seulement (le serveur le garde tel quel)
    if (auteur) h['x-auteur'] = auteur.replace(/[^\x20-\x7e\xa0-\xff]/g, '?').slice(0, 60);
    let body: BodyInit | undefined;
    if (o.corps !== undefined) { h['content-type'] = 'application/json'; body = JSON.stringify(o.corps); }
    else if (o.brut !== undefined) { h['content-type'] = o.type ?? 'application/octet-stream'; body = o.brut; }
    let r: Response;
    try {
      r = await this.f(this.base + chemin, { method: o.methode ?? 'GET', headers: h, ...(body !== undefined ? { body } : {}) });
    } catch (e) {
      throw new ErreurApi(0, 'hors-ligne', 'Serveur injoignable : ' + (e as Error).message);
    }
    const texte = await r.text();
    let corps: unknown = null;
    try { corps = texte ? JSON.parse(texte) : null; } catch { corps = texte; }
    if (!r.ok) {
      const c = (corps && typeof corps === 'object' ? corps : {}) as Record<string, unknown>;
      throw new ErreurApi(r.status, String(c.erreur ?? 'http-' + r.status), String(c.message ?? r.statusText), c);
    }
    return corps as T;
  }

  sante() { return this.requete<{ ok: boolean; format: string; ts: number }>('/api/sante'); }

  /** Liste des projets (jeton admin). */
  async listerProjets(): Promise<ResumeProjet[]> {
    return (await this.requete<{ projets: ResumeProjet[] }>('/api/projets', { admin: true })).projets;
  }

  /** Crée un projet (jeton admin) : vide, avec un titre, ou depuis un fichier d'échange complet (import). Le jeton du
   *  projet renvoyé n'est donné qu'une fois : il est mémorisé ici. */
  async creerProjet(contenu: { titre?: string; project?: Projet; assets?: CategorieAssets[] } | FichierConducteur = {}) {
    const r = await this.requete<{ id: string; jeton: string; version: number; titre: string }>('/api/projets', { methode: 'POST', admin: true, corps: contenu });
    memoriserJeton(r.id, r.jeton);
    return r;
  }

  lireProjet(id: string): Promise<ProjetServeur> { return this.requete(`/api/projets/${enc(id)}`, { projet: id }); }
  /** Copie de travail en direct de la salle (non encore enregistrée). */
  lireDirect(id: string): Promise<ProjetDirect> { return this.requete(`/api/projets/${enc(id)}?direct=1`, { projet: id }); }

  /** Enregistre une version fondée sur `version_base`. Conflit (409) → {ok:false, conflit:true, version_actuelle}. */
  async enregistrer(id: string, c: { version_base: number; project: Projet; assets?: CategorieAssets[]; message?: string }): Promise<ResultatEnregistrement> {
    try {
      const r = await this.requete<{ version: number }>(`/api/projets/${enc(id)}`, { methode: 'PUT', projet: id, corps: c });
      return { ok: true, version: r.version };
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 409) return { ok: false, conflit: true, version_actuelle: Number(e.details.version_actuelle) };
      throw e;
    }
  }

  async versions(id: string): Promise<ResumeVersion[]> {
    return (await this.requete<{ versions: ResumeVersion[] }>(`/api/projets/${enc(id)}/versions`, { projet: id })).versions;
  }
  version(id: string, n: number) {
    return this.requete<{ version: number; auteur: string; message: string; cree_le: number; project: Projet; assets: CategorieAssets[] }>(`/api/projets/${enc(id)}/versions/${n}`, { projet: id });
  }
  exporter(id: string): Promise<FichierConducteur> { return this.requete(`/api/projets/${enc(id)}/export`, { projet: id }); }

  async medias(id: string): Promise<Media[]> { return (await this.requete<{ medias: Media[] }>(`/api/projets/${enc(id)}/medias`, { projet: id })).medias; }
  /** URL d'un média pour <audio>/<img> (jeton en paramètre : ces balises ne posent pas d'en-tête). */
  urlMedia(id: string, nom: string): string {
    const j = this.jeton(id);
    return `${this.base}/api/projets/${enc(id)}/medias/${enc(nom)}${j ? '?jeton=' + enc(j) : ''}`;
  }
  televerserMedia(id: string, nom: string, corps: Blob | ArrayBuffer, type: string) {
    return this.requete<{ nom: string; taille: number; type: string; url: string }>(`/api/projets/${enc(id)}/medias/${enc(nom)}`, { methode: 'PUT', projet: id, brut: corps, type });
  }
  supprimerMedia(id: string, nom: string) { return this.requete<{ ok: true }>(`/api/projets/${enc(id)}/medias/${enc(nom)}`, { methode: 'DELETE', projet: id }); }

  async runs(id: string): Promise<Omit<Execution, 'evenements'>[]> {
    return (await this.requete<{ runs: Omit<Execution, 'evenements'>[] }>(`/api/projets/${enc(id)}/runs`, { projet: id })).runs;
  }
  creerRun(id: string, r: { id?: string; mode: Execution['mode']; debut?: number; evenements?: Execution['evenements'] }) {
    return this.requete<{ id: string; mode: string; debut: number; cree: boolean; total: number }>(`/api/projets/${enc(id)}/runs`, { methode: 'POST', projet: id, corps: r });
  }
  run(id: string, run: string): Promise<Execution> { return this.requete(`/api/projets/${enc(id)}/runs/${enc(run)}`, { projet: id }); }
  /** Ajoute des événements à partir du rang `premier` (renvoi idempotent). */
  ajouterEvenements(id: string, run: string, premier: number, evenements: Execution['evenements']) {
    return this.requete<{ recus: number; ignores: number; total: number }>(`/api/projets/${enc(id)}/runs/${enc(run)}/evenements`, { methode: 'POST', projet: id, corps: { premier, evenements } });
  }
}

const enc = encodeURIComponent;

/**
 * Enregistre `local` comme nouvelle version en gérant le conflit 409 : on relit la dernière version, on y rejoue nos
 * modifications (diff entre la version chargée et le local), puis on réessaie. Renvoie la version écrite et le projet
 * fusionné (à reposer dans le magasin s'il diffère du local).
 */
export async function enregistrerAvecFusion(
  api: ClientApi, id: string,
  c: { base: { version: number; projet: Projet }; local: Projet; assets?: CategorieAssets[]; message?: string },
  essais = 3,
): Promise<{ version: number; projet: Projet; fusionne: boolean }> {
  let base = c.base, local = c.local, fusionne = false;
  for (let i = 0; i < essais; i++) {
    const r = await api.enregistrer(id, { version_base: base.version, project: local, ...(c.assets ? { assets: c.assets } : {}), ...(c.message ? { message: c.message } : {}) });
    if (r.ok) return { version: r.version, projet: local, fusionne };
    const derniere = await api.lireProjet(id);
    const nous = diffProjet(base.projet, local);
    const fusion = copie(derniere.project);
    appliquerSouple(fusion, nous);
    base = { version: derniere.version, projet: derniere.project };
    local = fusion;
    fusionne = true;
  }
  throw new ErreurApi(409, 'conflit', 'Conflit persistant : d’autres enregistrent en même temps. Réessayez.');
}

// ═════════════════════════════ 3. salle (WebSocket) ═════════════════════════════

/** Le projet local que la salle synchronise (le magasin dans l'application ; un objet simple dans les tests). */
export interface DocumentLocal {
  lire(): Projet;
  /** Pose un projet venu de la salle. `premier` : première arrivée dans ce projet (remplace tout, sans historique). */
  ecrire(p: Projet, o: { premier: boolean }): void;
  /** Prévient à chaque changement du projet local. Renvoie la fonction de désabonnement. */
  ecouter(f: () => void): () => void;
}

export type StatutSalle = 'ferme' | 'connexion' | 'connecte' | 'hors-ligne';

export interface EtatSalle {
  statut: StatutSalle;
  projetId: string | null;
  vous: (Personne & { session: string }) | null;
  membres: Personne[];
  curseurs: Record<string, Curseur>;
  chat: MessageChat[];
  commentaires: Commentaire[];
  verrous: Verrou[];
  mode: ModeSalle;
  version: number;
  seq: number;
  lecture: { etat: unknown; par: string; ts: number } | null;
  /** messages non acquittés (dont les modifications en route) */
  enAttente: number;
  /** dernier refus du serveur, en clair */
  refus: string | null;
  erreur: string | null;
  tentatives: number;
}

export const ETAT_SALLE_INITIAL: EtatSalle = {
  statut: 'ferme', projetId: null, vous: null, membres: [], curseurs: {}, chat: [], commentaires: [], verrous: [],
  mode: 'ecrire', version: 0, seq: 0, lecture: null, enAttente: 0, refus: null, erreur: null, tentatives: 0,
};

export interface OptionsSalle {
  projet: string;
  jeton: string;
  document: DocumentLocal;
  base?: string;
  personne?: string; nom?: string; role?: Role; couleur?: string;
  /** délai de regroupement des modifications locales (ms) */
  delaiEnvoi?: number;
  /** implémentation WebSocket (défaut : globalThis.WebSocket, natif dans le navigateur et Node 24) */
  WebSocket?: typeof WebSocket;
  surRefus?: (raison: string, brut: string) => void;
}

type EnvoiIdempotent = Extract<MessageClient, { cseq: number }>;
type SansCseq<T> = T extends unknown ? Omit<T, 'cseq'> : never;
interface EnFile { msg: EnvoiIdempotent; ok: (a: Ack) => void }

const MAX_CHAT = 200;
const PING_MS = 20_000;
const SILENCE_MAX_MS = 50_000;

export class SalleClient {
  readonly session = 'ong_' + aleatoire(12);
  private o: Required<Pick<OptionsSalle, 'delaiEnvoi'>> & OptionsSalle;
  private ws: WebSocket | null = null;
  private synchro: Synchro;
  private cseq = 0;
  private file = new Map<number, EnFile>();
  private ecriture = false;
  private ferme = true;
  private dejaConnecte = false;
  private minuteurEnvoi: ReturnType<typeof setTimeout> | undefined;
  private minuteurReconnexion: ReturnType<typeof setTimeout> | undefined;
  private minuteurPing: ReturnType<typeof setInterval> | undefined;
  private derniereReception = 0;
  private curseurEnAttente: { c: Curseur | null } | null = null;
  private minuteurCurseur: ReturnType<typeof setTimeout> | undefined;
  private derniereLecture = 0;
  private lectureEnAttente: unknown = undefined;
  private minuteurLecture: ReturnType<typeof setTimeout> | undefined;
  private desabonner: (() => void) | null = null;
  private abonnes = new Set<(e: EtatSalle) => void>();
  private _etat: EtatSalle;

  constructor(o: OptionsSalle) {
    this.o = { delaiEnvoi: 40, ...o };
    this.synchro = new Synchro(this.session);
    this._etat = { ...ETAT_SALLE_INITIAL, projetId: o.projet };
  }

  get etat(): EtatSalle { return this._etat; }
  abonner(f: (e: EtatSalle) => void): () => void { this.abonnes.add(f); return () => { this.abonnes.delete(f); }; }
  private majEtat(p: Partial<EtatSalle>) {
    this._etat = { ...this._etat, ...p, enAttente: this.file.size };
    for (const f of this.abonnes) f(this._etat);
  }

  // ───── cycle de vie ─────

  ouvrir(): void {
    if (!this.ferme) return;
    this.ferme = false;
    this.desabonner = this.o.document.ecouter(() => { if (!this.ecriture) this.planifierEnvoi(); });
    if (typeof window !== 'undefined') window.addEventListener('online', this.enLigne);
    this.connecter();
  }

  /** Ferme la salle (bye) ; le projet local reste tel quel. */
  fermer(): void {
    this.ferme = true;
    clearTimeout(this.minuteurReconnexion); clearTimeout(this.minuteurEnvoi); clearInterval(this.minuteurPing);
    clearTimeout(this.minuteurCurseur); clearTimeout(this.minuteurLecture);
    if (typeof window !== 'undefined') window.removeEventListener('online', this.enLigne);
    this.desabonner?.(); this.desabonner = null;
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify({ t: 'bye' })); } catch { /* fermé */ } }
    try { ws?.close(1000, 'au revoir'); } catch { /* déjà fermé */ }
    this.majEtat({ statut: 'ferme', membres: [], curseurs: {} });
  }

  private enLigne = () => {
    if (this.ferme || this._etat.statut === 'connecte') return;
    clearTimeout(this.minuteurReconnexion);
    this.connecter();
  };

  private url(): string {
    let base = this.o.base ?? urlServeur();
    if (!base && typeof location !== 'undefined') base = location.origin;
    return base.replace(/^http/i, 'ws') + `/api/projets/${enc(this.o.projet)}/salle?jeton=${enc(this.o.jeton)}`;
  }

  private connecter(): void {
    if (this.ferme) return;
    const WS = this.o.WebSocket ?? globalThis.WebSocket;
    this.majEtat({ statut: this._etat.statut === 'connecte' ? 'connexion' : this._etat.tentatives ? 'hors-ligne' : 'connexion' });
    let ws: WebSocket;
    try { ws = new WS(this.url()); } catch (e) { this.majEtat({ erreur: (e as Error).message }); this.planifierReconnexion(); return; }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      const id = this.identite();
      this.derniereReception = Date.now();
      this.envoyerBrut({
        t: 'hello', v: VERSION_PROTOCOLE, personne: id.personne, session: this.session, nom: id.nom, role: id.role,
        ...(this.o.couleur ? { couleur: this.o.couleur } : {}),
        ...(this.synchro.pret ? { seq: this.synchro.seq } : {}),
      });
      clearInterval(this.minuteurPing);
      this.minuteurPing = setInterval(() => this.battement(), PING_MS);
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      this.derniereReception = Date.now();
      let m: MessageServeur;
      try { m = JSON.parse(String(e.data)) as MessageServeur; } catch { return; }
      this.recevoir(m);
    };
    ws.onclose = () => { if (this.ws === ws) this.connexionPerdue(); };
    ws.onerror = () => { /* onclose suit */ };
  }

  private connexionPerdue(): void {
    const ws = this.ws;
    this.ws = null;
    clearInterval(this.minuteurPing);
    if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(); } catch { /* déjà fermé */ } }
    if (this.ferme) return;
    this.majEtat({ statut: 'hors-ligne', membres: [], curseurs: {} });
    this.planifierReconnexion();
  }

  /** Coupe la connexion comme une panne réseau (essais, diagnostic) : la reconnexion automatique suit. */
  couper(): void { if (this.ws) this.connexionPerdue(); }

  private identite(): Identite {
    const i = identite();
    return { personne: this.o.personne ?? i.personne, nom: this.o.nom ?? i.nom, role: this.o.role ?? i.role };
  }

  private planifierReconnexion(): void {
    if (this.ferme) return;
    const n = this._etat.tentatives;
    const delai = Math.min(15_000, 500 * 2 ** n) * (0.75 + Math.random() * 0.5);
    this.majEtat({ tentatives: n + 1, statut: 'hors-ligne' });
    clearTimeout(this.minuteurReconnexion);
    this.minuteurReconnexion = setTimeout(() => this.connecter(), delai);
  }

  private battement(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return;
    if (Date.now() - this.derniereReception > SILENCE_MAX_MS) { this.connexionPerdue(); return; }
    try { ws.send('{"t":"ping"}'); } catch { /* fermé */ }
  }

  private envoyerBrut(m: MessageClient): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1 || (m.t !== 'hello' && this._etat.statut !== 'connecte')) return false;
    try { ws.send(JSON.stringify(m)); return true; } catch { return false; }
  }

  /** Message idempotent : numéroté, gardé jusqu'à son accusé, renvoyé tel quel après une reconnexion. */
  private envoyerIdempotent(m: SansCseq<EnvoiIdempotent>, cseq = ++this.cseq): Promise<Ack> {
    const msg = { ...m, cseq } as EnvoiIdempotent;
    return new Promise<Ack>((ok) => {
      this.file.set(cseq, { msg, ok });
      this.majEtat({});
      this.envoyerBrut(msg);
    });
  }

  // ───── réception ─────

  private recevoir(m: MessageServeur): void {
    switch (m.t) {
      case 'bienvenue': return this.bienvenue(m);
      case 'ack': return this.accuse(m);
      case 'modif': return this.appliquer(this.synchro.recevoir(m, this.o.document.lire()));
      case 'instantane':
        this.appliquer(this.synchro.instantane(m.seq, m.projet as Projet, this.o.document.lire()));
        this.majEtat({ seq: m.seq, version: m.version });
        this.planifierEnvoi(0);
        return;
      case 'arrivee': {
        const membres = this._etat.membres.filter((p) => p.personne !== m.personne.personne);
        return this.majEtat({ membres: [...membres, m.personne] });
      }
      case 'depart': {
        const curseurs = { ...this._etat.curseurs };
        delete curseurs[m.personne];
        return this.majEtat({ membres: this._etat.membres.filter((p) => p.personne !== m.personne), curseurs });
      }
      case 'curseur': {
        const curseurs = { ...this._etat.curseurs };
        if (m.curseur) curseurs[m.personne] = m.curseur; else delete curseurs[m.personne];
        return this.majEtat({ curseurs });
      }
      case 'chat': {
        if (this._etat.chat.some((x) => x.id === m.message.id)) return;
        return this.majEtat({ chat: [...this._etat.chat, m.message].slice(-MAX_CHAT) });
      }
      case 'commentaire': {
        const autres = this._etat.commentaires.filter((c) => c.id !== m.commentaire.id);
        if (m.action === 'supprime') return this.majEtat({ commentaires: autres });
        const c = m.commentaire as Commentaire;
        const i = this._etat.commentaires.findIndex((x) => x.id === c.id);
        const liste = i < 0 ? [...autres, c] : this._etat.commentaires.map((x) => (x.id === c.id ? c : x));
        return this.majEtat({ commentaires: liste });
      }
      case 'verrou': {
        const autres = this._etat.verrous.filter((v) => v.cible !== m.cible);
        return this.majEtat({ verrous: m.personne ? [...autres, { cible: m.cible, personne: m.personne, nom: m.nom ?? '', pris_le: Date.now() }] : autres });
      }
      case 'mode': return this.majEtat({ mode: m.mode });
      case 'lecture': return this.majEtat({ lecture: { etat: m.etat, par: m.par, ts: m.ts } });
      case 'version': return this.majEtat({ version: m.version });
      case 'erreur': return this.majEtat({ erreur: m.message });
      case 'pong': return;
    }
  }

  private bienvenue(m: Extract<MessageServeur, { t: 'bienvenue' }>): void {
    const reconnexion = this.dejaConnecte;
    const premier = !this.synchro.pret;
    this.dejaConnecte = true;
    const curseurs: Record<string, Curseur> = {};
    for (const p of m.presents) if (p.curseur) curseurs[p.personne] = p.curseur;
    this.majEtat({
      statut: 'connecte', tentatives: 0, erreur: null, vous: m.vous, membres: m.presents, curseurs,
      chat: m.chat.slice(-MAX_CHAT), commentaires: m.commentaires, verrous: m.verrous, mode: m.mode, version: m.version,
      seq: m.seq, lecture: m.lecture,
    });
    if (m.projet) this.appliquer(this.synchro.instantane(m.seq, m.projet as Projet, this.o.document.lire(), { premier, reconnexion }), premier);
    else this.synchro.aJour(m.seq);
    // renvoi, dans l'ordre, de tout ce qui n'a pas été acquitté (le serveur ignore les doublons)
    for (const { msg } of this.file.values()) this.envoyerBrut(msg.t === 'modif' ? { ...msg, base: this.synchro.seq } : msg);
    this.planifierEnvoi(0);
  }

  private accuse(a: Ack): void {
    const f = this.file.get(a.cseq);
    if (!f) return;
    this.file.delete(a.cseq);
    if (f.msg.t === 'modif') {
      this.appliquer(this.synchro.accuse(a.cseq, a.statut, a.raison, this.o.document.lire()));
      if (this.synchro.attenteInstantane === false && !this.synchro.enRattrapage) this.planifierEnvoi();
    } else if (a.statut === 'refus') {
      this.signalerRefus(a.raison ?? 'refus');
    }
    this.majEtat({});
    f.ok(a);
  }

  private signalerRefus(brut: string): void {
    const t = raisonLisible(brut);
    this.majEtat({ refus: t });
    this.o.surRefus?.(t, brut);
  }

  private appliquer(e: Effet, premier = false): void {
    if (e.local) {
      this.ecriture = true;
      try { this.o.document.ecrire(e.local, { premier }); } finally { this.ecriture = false; }
    }
    if (e.resync) this.envoyerBrut({ t: 'resync' });
    if (e.refus) this.signalerRefus(e.refus);
    if (this._etat.seq !== this.synchro.seq) this.majEtat({ seq: this.synchro.seq });
  }

  // ───── envoi des modifications du projet ─────

  private planifierEnvoi(delai = this.o.delaiEnvoi): void {
    clearTimeout(this.minuteurEnvoi);
    this.minuteurEnvoi = setTimeout(() => this.envoyerModifs(), delai);
  }

  /** Envoie tout de suite les modifications locales en attente (sinon : après `delaiEnvoi`). */
  envoyerModifs(): void {
    clearTimeout(this.minuteurEnvoi);
    if (this._etat.statut !== 'connecte' || !this.synchro.pret || this.synchro.attenteInstantane) return;
    const { deltas, tropGros } = this.synchro.preparer(this.o.document.lire(), () => ++this.cseq);
    for (const d of deltas) void this.envoyerIdempotent({ t: 'modif', base: this.synchro.seq, ops: d.ops }, d.cseq);
    if (tropGros) this.signalerRefus('trop-gros');
  }

  /** Vrai si des modifications locales ne sont pas encore parties (ou pas encore acquittées). */
  get modificationsEnAttente(): boolean {
    return this.synchro.envoyes.length > 0 || (this.synchro.pret && this.synchro.aEnvoyer(this.o.document.lire()));
  }

  // ───── actions ─────

  chat(texte: string): Promise<Ack> { return this.envoyerIdempotent({ t: 'chat', texte }); }
  commenter(ancre: Ancre, texte: string): Promise<Ack> { return this.envoyerIdempotent({ t: 'commentaire', action: 'ajouter', ancre, texte }); }
  commentaire(action: 'resoudre' | 'rouvrir' | 'supprimer', id: string): Promise<Ack> { return this.envoyerIdempotent({ t: 'commentaire', action, id }); }
  verrou(action: 'prendre' | 'rendre' | 'forcer', cible: string): Promise<Ack> { return this.envoyerIdempotent({ t: 'verrou', action, cible }); }
  mode(mode: ModeSalle): Promise<Ack> { return this.envoyerIdempotent({ t: 'mode', mode }); }
  /** Enregistre la copie de travail comme nouvelle version (après envoi des modifications locales). */
  enregistrer(message?: string): Promise<Ack> {
    this.envoyerModifs();
    return this.envoyerIdempotent({ t: 'enregistrer', ...(message ? { message: message.slice(0, 200) } : {}) });
  }
  resync(): void { this.envoyerBrut({ t: 'resync' }); }

  /** Curseur (≤ 20 par seconde, le dernier gagne ; non conservé hors connexion). */
  curseur(c: Curseur | null): void {
    this.curseurEnAttente = { c };
    if (this.minuteurCurseur) return;
    const partir = () => {
      this.minuteurCurseur = undefined;
      const p = this.curseurEnAttente;
      this.curseurEnAttente = null;
      if (p) { this.envoyerBrut({ t: 'curseur', curseur: p.c }); this.minuteurCurseur = setTimeout(partir, 50); }
    };
    partir();
  }

  /** État de lecture (régie → postes), ≤ 4 par seconde. */
  lecture(etat: EtatLecture | Record<string, unknown>): void {
    this.lectureEnAttente = etat;
    const reste = 250 - (Date.now() - this.derniereLecture);
    if (reste > 0) {
      if (!this.minuteurLecture) this.minuteurLecture = setTimeout(() => { this.minuteurLecture = undefined; this.lecture(this.lectureEnAttente as EtatLecture); }, reste);
      return;
    }
    this.derniereLecture = Date.now();
    this.envoyerBrut({ t: 'lecture', etat });
  }
}

// ═════════════════════════════ 4. branchement sur le magasin ═════════════════════════════

const ETIQUETTE_SALLE = '\u0000salle';
type MagasinEtendu = Magasin & { remplacerProjetDistant?: (p: Projet, o?: { premier?: boolean }) => void };

/**
 * Le magasin vu comme document local de la salle. Les projets venus de la salle remplacent celui du magasin sans
 * entrée d'annulation. L'historique d'annulation reste local : chaque état gardé (passe / futur) est marqué du nombre
 * de changements distants reçus à ce moment ; annuler ou rétablir vers un état plus ancien y rejoue les changements
 * distants arrivés depuis (annuler ne défait donc que ses propres gestes).
 */
export class DocumentMagasin implements DocumentLocal {
  private journal: { n: number; ops: Op[] }[] = [];
  private n = 0;
  private marques = new WeakMap<object, number>();
  private interne = false;

  lire(): Projet { return useMagasin.getState().projet; }

  ecrire(p: Projet, o: { premier: boolean }): void {
    if (o.premier) { this.journal = []; }
    else {
      this.n++;
      this.journal.push({ n: this.n, ops: diffProjet(this.lire(), p) });
      if (this.journal.length > 400) this.journal.splice(0, this.journal.length - 400);
    }
    this.interne = true;
    try { poserProjetDistant(p, o.premier); } finally { this.interne = false; }
  }

  ecouter(f: () => void): () => void {
    return useMagasin.subscribe((s, prev) => {
      if (this.interne) return;
      if (s.passe !== prev.passe) for (const e of s.passe) if (!this.marques.has(e.projet)) this.marques.set(e.projet, this.n);
      if (s.futur !== prev.futur) for (const p of s.futur) if (!this.marques.has(p)) this.marques.set(p, this.n);
      if (s.projet === prev.projet) return;
      const m = this.marques.get(s.projet);
      if (m !== undefined && m < this.n) {
        const rebase = copie(s.projet);
        for (const j of this.journal) if (j.n > m) appliquerSouple(rebase, j.ops);
        this.interne = true;
        try { useMagasin.setState({ projet: rebase }); } finally { this.interne = false; }
      }
      f();
    });
  }
}

/** Remplace le projet du magasin par celui de la salle : nouvelle révision (le lecteur suit), pas d'entrée d'annulation. */
function poserProjetDistant(p: Projet, premier: boolean): void {
  const st = useMagasin.getState() as MagasinEtendu;
  if (st.remplacerProjetDistant) st.remplacerProjetDistant(p, { premier });
  else {
    // En attendant une action dédiée du magasin : modifierProjet (qui renouvelle la révision du lecteur), puis on
    // restaure l'historique tel qu'il était. Le verrou local de scène ne doit pas bloquer les changements des autres.
    const { passe, futur, verrou } = st;
    if (verrou) useMagasin.setState({ verrou: false });
    st.modifierProjet((c) => {
      for (const k of Object.keys(c)) delete (c as unknown as Record<string, unknown>)[k];
      Object.assign(c, p);
    }, ETIQUETTE_SALLE);
    useMagasin.setState(premier ? { passe: [], futur: [], selection: {}, verrou } : { passe, futur, verrou });
  }
  const s = useMagasin.getState(), sel = s.selection;
  if (sel.moment && !s.projet.ev.some((m) => m.id === sel.moment)) s.selectionner({});
}

// ───── l'état partagé de la collaboration (zustand), lu par useCollab() et les composants de src/collab ─────

export interface EtatCollab extends EtatSalle {
  /** la salle courante (null : travail local) */
  salle: SalleClient | null;
}

export const useSalle = create<EtatCollab>(() => ({ ...ETAT_SALLE_INITIAL, salle: null }));

let arretSalle: (() => void) | null = null;

/** Ouvre la salle d'un projet du serveur et y branche le magasin. Le jeton est mémorisé pour les prochaines fois. */
export function connecterSalle(projet: string, jeton?: string, o: Partial<OptionsSalle> = {}): SalleClient {
  deconnecterSalle();
  const j = jeton ?? jetonProjet(projet) ?? jetonAdmin();
  if (!j) throw new ErreurApi(401, 'jeton-requis', 'Jeton du projet requis.');
  if (jeton) memoriserJeton(projet, jeton);
  stockage.ecrire(CLES.salle, projet);

  const salle = new SalleClient({
    projet, jeton: j, document: new DocumentMagasin(),
    surRefus: (t) => useMagasin.getState().signaler(t),
    ...o,
  });
  const desabonner = salle.abonner((e) => useSalle.setState({ ...e, salle }));
  useSalle.setState({ ...salle.etat, salle });

  // régie → postes : l'état de lecture part (≤ 4 Hz) quand on joue ; un poste suit la lecture de la régie
  const lecture = useMagasin.subscribe((s, p) => {
    if (s.lecture === p.lecture || !s.lecture || !s.enLecture) return;
    if (salle.etat.vous?.role === 'regie' && salle.etat.statut === 'connecte') salle.lecture(s.lecture);
  });
  const suivre = salle.abonner((e) => {
    const s = useMagasin.getState();
    if (e.vous?.role === 'poste' && e.lecture && !s.enLecture && e.lecture.etat !== s.lecture) useMagasin.setState({ lecture: e.lecture.etat as EtatLecture });
  });

  // les médias et catégories (assets) ne passent pas par la salle : on les lit une fois par l'API
  const api = new ClientApi(o.base !== undefined ? { base: o.base } : {});
  api.lireProjet(projet).then((r) => { if (r.assets?.length && useSalle.getState().salle === salle) useMagasin.setState({ assets: r.assets }); }, () => { /* hors ligne */ });

  salle.ouvrir();
  arretSalle = () => { lecture(); suivre(); desabonner(); salle.fermer(); };
  return salle;
}

/** Quitte la salle : le projet reste dans le magasin, en travail local. */
export function deconnecterSalle(oublier = false): void {
  arretSalle?.();
  arretSalle = null;
  if (oublier) stockage.ecrire(CLES.salle, null);
  useSalle.setState({ ...ETAT_SALLE_INITIAL, salle: null });
}

/** Rouvre la dernière salle (au démarrage de l'application) si son jeton est connu. */
export function reprendreDerniereSalle(): SalleClient | null {
  const id = derniereSalle();
  if (!id || !(jetonProjet(id) ?? jetonAdmin())) return null;
  try { return connecterSalle(id); } catch { return null; }
}

/**
 * Enregistre une version sur le serveur : par la salle si elle est ouverte (elle sérialise toutes les écritures),
 * sinon par l'API avec gestion du conflit 409 (relecture + rejeu des modifications).
 */
export async function enregistrerSurServeur(message?: string): Promise<{ version: number } | { conflit: true; version_actuelle: number }> {
  const { salle, projetId } = useSalle.getState();
  if (salle && salle.etat.statut === 'connecte') {
    const a = await salle.enregistrer(message);
    const res = (a.res ?? {}) as { version?: number; version_actuelle?: number };
    if (a.statut === 'conflit') return { conflit: true, version_actuelle: res.version_actuelle ?? 0 };
    if (a.statut === 'refus') throw new ErreurApi(400, a.raison ?? 'refus', raisonLisible(a.raison ?? 'refus'));
    return { version: res.version ?? salle.etat.version };
  }
  const id = projetId ?? derniereSalle();
  if (!id) throw new ErreurApi(400, 'aucun-projet', 'Aucun projet du serveur ouvert.');
  const api = new ClientApi();
  const s = useMagasin.getState();
  const derniere = await api.lireProjet(id);
  const base = { version: derniere.version, projet: derniere.project };
  const r = await enregistrerAvecFusion(api, id, { base, local: s.projet, assets: s.assets, ...(message ? { message } : {}) });
  if (r.fusionne) s.modifierProjet((c) => { for (const k of Object.keys(c)) delete (c as unknown as Record<string, unknown>)[k]; Object.assign(c, r.projet); }, 'fusion');
  return { version: r.version };
}

/** Versions enregistrées du projet ouvert. */
export async function versionsServeur(): Promise<ResumeVersion[]> {
  const id = useSalle.getState().projetId ?? derniereSalle();
  return id ? new ClientApi().versions(id) : [];
}

/** Ouvre une version enregistrée : elle devient l'état courant (geste annulable, propagé à la salle). */
export async function ouvrirVersionServeur(n: number): Promise<void> {
  const id = useSalle.getState().projetId ?? derniereSalle();
  if (!id) return;
  const v = await new ClientApi().version(id, n);
  const s = useMagasin.getState();
  s.modifierProjet((c) => { for (const k of Object.keys(c)) delete (c as unknown as Record<string, unknown>)[k]; Object.assign(c, v.project); }, 'version');
  s.signaler('Version ' + n + ' ouverte');
}
