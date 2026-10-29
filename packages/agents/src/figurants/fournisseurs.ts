// Fournisseurs N2 (port de fournisseurs.mjs ; étude §7) : Ollama (local), Anthropic Haiku 5.5 (si ANTHROPIC_API_KEY),
// banque (sans IA). Chaque fournisseur stream la sortie et rappelle onLigne() dès qu'un objet JSON {persona, texte} est
// complet. Un disjoncteur par fournisseur bascule automatiquement sur le suivant (§7.6).
//
// Choix mesuré le 26/10 (qwen3:8b à chaud, 4 répliques) : un seul appel → plusieurs lignes JSON (1er jeton 0,19-0,28 s,
// 4e ligne 2,4-2,7 s) ; 4 appels parallèles d'une ligne : Ollama les sérialise et les répliques se ressemblent.
//
// La clé Anthropic est lue dans l'environnement à chaque appel ; elle n'est jamais copiée ailleurs ni journalisée, et
// aucune erreur ne porte d'en-tête ni de corps de requête.
import { Fenetre, percentile } from './util';

export type OnLigne = (obj: unknown, tLigne: number, tPremier: number | null, brut?: string) => void;

/** Extrait les objets JSON {…} complets d'un flux de texte, au fil de l'eau (chaînes et échappements gérés). */
export class ExtracteurJson {
  private buf = '';
  private prof = 0;
  private dansChaine = false;
  private echap = false;
  private debut = -1;
  private i = 0;
  constructor(private onObjet: (obj: unknown, brut?: string) => void) {}
  pousser(texte: string): void {
    this.buf += texte;
    for (; this.i < this.buf.length; this.i++) {
      const c = this.buf[this.i];
      if (this.dansChaine) {
        if (this.echap) this.echap = false;
        else if (c === '\\') this.echap = true;
        else if (c === '"') this.dansChaine = false;
        else if (c === '\n') { this.dansChaine = false; this.prof = 0; this.debut = -1; }   // ligne cassée : on repart
        continue;
      }
      if (c === '"' && this.prof > 0) this.dansChaine = true;
      else if (c === '{') { if (this.prof === 0) this.debut = this.i; this.prof++; }
      else if (c === '}' && this.prof > 0) {
        this.prof--;
        if (this.prof === 0 && this.debut >= 0) {
          const brut = this.buf.slice(this.debut, this.i + 1);
          this.debut = -1;
          try { this.onObjet(JSON.parse(brut)); } catch { this.onObjet(null, brut); }
        }
      }
    }
    if (this.prof === 0 && this.i > 4096) { this.buf = ''; this.i = 0; }
  }
}

export type TransitionDisjoncteur = 'ouvert' | 'ferme' | null;

/** Disjoncteur : 3 erreurs en 30 s, ou p95 « ligne prête » > 4 s sur ≥ 3 appels en 30 s → ouvert 60 s, puis un essai. */
export class Disjoncteur {
  etat: 'ferme' | 'ouvert' | 'demi' = 'ferme';
  raison = '';
  ouvertJusqua = 0;
  private evts: { ts: number; ok: boolean; lat?: number }[] = [];
  private fenetreMs: number;
  private pauseMs: number;
  private seuilErreurs: number;
  private seuilP95: number;
  constructor(public nom: string, { fenetreMs = 30_000, pauseMs = 60_000, seuilErreurs = 3, seuilP95 = 4000 } = {}) {
    this.fenetreMs = fenetreMs; this.pauseMs = pauseMs; this.seuilErreurs = seuilErreurs; this.seuilP95 = seuilP95;
  }
  private purger(t: number) { while (this.evts.length && t - this.evts[0]!.ts > this.fenetreMs) this.evts.shift(); }
  peutEssayer(t = Date.now()): boolean {
    if (this.etat === 'ouvert' && t >= this.ouvertJusqua) this.etat = 'demi';
    return this.etat !== 'ouvert';
  }
  succes(latMs: number, t = Date.now()): TransitionDisjoncteur {
    this.evts.push({ ts: t, ok: true, lat: latMs });
    this.purger(t);
    const lats = this.evts.filter(e => e.ok && Number.isFinite(e.lat)).map(e => e.lat as number);
    const p95 = percentile(lats, 95);
    if (lats.length >= 3 && p95 !== null && p95 > this.seuilP95) return this.ouvrir(`p95 ligne ${Math.round(p95)} ms > ${this.seuilP95} ms`, t);
    if (this.etat !== 'ferme') { this.etat = 'ferme'; this.raison = ''; return 'ferme'; }
    return null;
  }
  echec(raison: string, t = Date.now()): TransitionDisjoncteur {
    this.evts.push({ ts: t, ok: false });
    this.purger(t);
    if (this.etat === 'demi') return this.ouvrir(raison, t);
    if (this.evts.filter(e => !e.ok).length >= this.seuilErreurs) return this.ouvrir(raison, t);
    return null;
  }
  ouvrir(raison: string, t = Date.now(), pause = this.pauseMs): 'ouvert' {
    this.etat = 'ouvert'; this.ouvertJusqua = t + pause; this.raison = raison; this.evts = [];
    return 'ouvert';
  }
  resume(): { etat: string; raison: string; jusqua: number | null } {
    return { etat: this.etat, raison: this.raison, jusqua: this.etat === 'ouvert' ? this.ouvertJusqua : null };
  }
}

function signalCombine(externe: AbortSignal | undefined, ms: number) {
  const c = new AbortController();
  const minuteur = setTimeout(() => c.abort(new Error('délai dépassé')), ms);
  if (externe) {
    if (externe.aborted) c.abort(externe.reason);
    else externe.addEventListener('abort', () => c.abort(externe.reason), { once: true });
  }
  return { signal: c.signal, annuler: (r: Error) => c.abort(r), fin: () => clearTimeout(minuteur) };
}

/** Lit un corps de réponse en flux, ligne par ligne. */
async function* lignes(corps: AsyncIterable<Uint8Array>, signal: AbortSignal): AsyncGenerator<string> {
  const dec = new TextDecoder();
  let buf = '';
  for await (const morceau of corps) {
    if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('annulé');
    buf += dec.decode(morceau, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) { yield buf.slice(0, i); buf = buf.slice(i + 1); }
  }
  if (buf) yield buf;
}

export interface DemandeGeneration {
  systeme: string;
  utilisateur: string;
  nb: number;
  signal?: AbortSignal;
  onLigne: OnLigne;
}
export interface ResultatGeneration {
  t0: number;
  t_premier_jeton: number | null;
  t_fin: number;
  jetons_entree: number;
  jetons_sortie: number;
  cout_usd: number;
  machine?: string;
  stop?: string | null;
}

/** Ce que l'orchestrateur attend d'un fournisseur. */
export interface Fournisseur {
  nom: 'ollama' | 'anthropic';
  modele: string;
  disjoncteur: { peutEssayer(t?: number): boolean; succes(lat: number, t?: number): TransitionDisjoncteur; echec(raison: string, t?: number): TransitionDisjoncteur; resume(): { etat: string; raison: string; jusqua: number | null } };
  joignable?: boolean | null;
  disponible(): boolean;
  generer(d: DemandeGeneration): Promise<ResultatGeneration>;
  prechauffer?(systeme?: string | null): Promise<boolean>;
  chauffe?(): Promise<Record<string, unknown>>;
}

export type Fetch = (url: string, init?: Record<string, unknown>) => Promise<Response>;

export interface OptionsOllama {
  url: string;
  modele: string;
  delaiPremierJeton?: number;
  delaiTotal?: number;
  keepAlive?: string;
  machine?: string;
  fetch?: Fetch;
}

export class FournisseurOllama implements Fournisseur {
  nom = 'ollama' as const;
  machine: string;
  url: string;
  modele: string;
  disjoncteur: Disjoncteur;
  joignable: boolean | null = null;
  private delaiPremierJeton: number;
  private delaiTotal: number;
  private keepAlive: string;
  private fetch: Fetch;
  constructor({ url, modele, delaiPremierJeton = 3000, delaiTotal = 12000, keepAlive = '30m', machine = 'ollama', fetch: f }: OptionsOllama) {
    this.machine = machine; this.url = url.replace(/\/+$/, ''); this.modele = modele;
    this.delaiPremierJeton = delaiPremierJeton; this.delaiTotal = delaiTotal; this.keepAlive = keepAlive;
    this.disjoncteur = new Disjoncteur('ollama:' + machine);
    this.fetch = f ?? ((u, init) => fetch(u, init as RequestInit));
  }
  disponible(): boolean { return true; }

  async sante(): Promise<{ ok: boolean; raison?: string }> {
    try {
      const r = await this.fetch(this.url + '/api/tags', { signal: AbortSignal.timeout(2000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = (await r.json()) as { models?: { name?: string; model?: string }[] };
      const ok = (j.models || []).some(m => m.name === this.modele || m.model === this.modele || m.name === this.modele + ':latest');
      this.joignable = ok;
      return ok ? { ok } : { ok: false, raison: `modèle ${this.modele} absent` };
    } catch (e) { this.joignable = false; return { ok: false, raison: String((e as Error).message || e) }; }
  }

  /** Charge le modèle et le garde 30 min (keep_alive) : le premier vrai appel est à chaud. */
  async prechauffer(systeme: string | null = null): Promise<boolean> {
    try {
      const messages = systeme ? [{ role: 'system', content: systeme }, { role: 'user', content: 'ok' }] : [{ role: 'user', content: 'ok' }];
      await this.fetch(this.url + '/api/chat', {
        method: 'POST', signal: AbortSignal.timeout(60000),
        body: JSON.stringify({ model: this.modele, messages, stream: false, think: false, keep_alive: this.keepAlive, options: { num_predict: 1 } }),
      });
      return true;
    } catch { return false; }
  }

  /** Contrôle de chauffe : santé, chargement, puis une vraie petite réplique chronométrée. */
  async chauffe(): Promise<Record<string, unknown>> {
    const r = { machine: this.machine, modele: this.modele, ts: Date.now() };
    const s = await this.sante();
    if (!s.ok) return { ...r, etat: 'injoignable', raison: s.raison };
    const t0 = Date.now();
    if (!(await this.prechauffer())) return { ...r, etat: 'injoignable', raison: 'chargement du modèle impossible' };
    const chargement_ms = Date.now() - t0;
    try {
      let lignesOk = 0;
      const res = await this.generer({
        systeme: 'Réponds par un objet JSON sur une ligne : {"persona":"p","texte":"<4 mots de chat>"}',
        utilisateur: 'Le streamer dit : salut le chat !', nb: 1, onLigne: o => { if (o) lignesOk++; },
      });
      return { ...r, chargement_ms, etat: lignesOk ? 'pret' : 'douteux', premier_jeton_ms: res.t_premier_jeton ? res.t_premier_jeton - res.t0 : null, total_ms: res.t_fin - res.t0 };
    } catch (e) { return { ...r, chargement_ms, etat: 'injoignable', raison: String((e as Error).message || e).slice(0, 80) }; }
  }

  async generer({ systeme, utilisateur, nb, signal, onLigne }: DemandeGeneration): Promise<ResultatGeneration> {
    const t0 = Date.now();
    const s = signalCombine(signal, this.delaiTotal);
    let tPremier: number | null = null;
    let jetonsEntree = 0;
    let jetonsSortie = 0;
    const premier = setTimeout(() => { if (tPremier === null) s.annuler(new Error('pas de premier jeton')); }, this.delaiPremierJeton);
    const ext = new ExtracteurJson((obj, brut) => onLigne(obj, Date.now(), tPremier, brut));
    try {
      const r = await this.fetch(this.url + '/api/chat', {
        method: 'POST', signal: s.signal, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.modele, stream: true, think: false, keep_alive: this.keepAlive,
          messages: [{ role: 'system', content: systeme }, { role: 'user', content: utilisateur }],
          options: { temperature: 0.8, top_p: 0.8, top_k: 20, presence_penalty: 1.0, num_predict: 45 * nb + 30 },
        }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      for await (const l of lignes(r.body as unknown as AsyncIterable<Uint8Array>, s.signal)) {
        if (!l.trim()) continue;
        let j: { error?: unknown; message?: { content?: string }; done?: boolean; prompt_eval_count?: number; eval_count?: number };
        try { j = JSON.parse(l); } catch { continue; }
        if (j.error) throw new Error(String(j.error).slice(0, 200));
        const c = j.message?.content || '';
        if (c) { if (tPremier === null) tPremier = Date.now(); ext.pousser(c); }
        if (j.done) { jetonsEntree = j.prompt_eval_count || 0; jetonsSortie = j.eval_count || 0; }
      }
      return { t0, t_premier_jeton: tPremier, t_fin: Date.now(), jetons_entree: jetonsEntree, jetons_sortie: jetonsSortie, cout_usd: 0, machine: this.machine };
    } finally { clearTimeout(premier); s.fin(); }
  }
}

// Tarifs Claude Haiku 5.5 (étude §7.4) en $ par million de jetons.
const PRIX = { entree: 0.10, sortie: 0.50, cache_lecture: 0.01, cache_ecriture: 0.125 };

export interface OptionsAnthropic {
  modele?: string;
  delaiPremierJeton?: number;
  delaiTotal?: number;
  budgetUsd?: number;
  /** variables d'environnement (défaut : process.env) */
  env?: Record<string, string | undefined>;
  fetch?: Fetch;
}

export class FournisseurAnthropic implements Fournisseur {
  nom = 'anthropic' as const;
  modele: string;
  disjoncteur = new Disjoncteur('anthropic');
  coutTotal = 0;
  private delaiPremierJeton: number;
  private delaiTotal: number;
  private budgetUsd: number;
  private env: Record<string, string | undefined>;
  private fetch: Fetch;
  constructor({ modele = 'claude-haiku-5-5', delaiPremierJeton = 3000, delaiTotal = 10000, budgetUsd = 5, env, fetch: f }: OptionsAnthropic = {}) {
    this.modele = modele; this.delaiPremierJeton = delaiPremierJeton; this.delaiTotal = delaiTotal; this.budgetUsd = budgetUsd;
    this.env = env ?? process.env;
    this.fetch = f ?? ((u, init) => fetch(u, init as RequestInit));
  }
  // La clé est lue dans l'environnement à chaque appel.
  disponible(): boolean { return !!this.env.ANTHROPIC_API_KEY && this.coutTotal < this.budgetUsd; }

  async generer({ systeme, utilisateur, nb, signal, onLigne }: DemandeGeneration): Promise<ResultatGeneration> {
    const cle = this.env.ANTHROPIC_API_KEY;
    if (!cle) throw new Error('pas de clé');
    const t0 = Date.now();
    const s = signalCombine(signal, this.delaiTotal);
    let tPremier: number | null = null;
    const u = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const premier = setTimeout(() => { if (tPremier === null) s.annuler(new Error('pas de premier jeton')); }, this.delaiPremierJeton);
    const ext = new ExtracteurJson((obj, brut) => onLigne(obj, Date.now(), tPremier, brut));
    let stop: string | null = null;
    try {
      const r = await this.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: s.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': cle, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: this.modele, max_tokens: Math.min(400, 50 * nb + 40), stream: true,
          thinking: { type: 'disabled' }, output_config: { effort: 'low' },
          system: [{ type: 'text', text: systeme, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: utilisateur }],
        }),
      });
      if (!r.ok) {
        let type = '';
        try { type = ((await r.json()) as { error?: { type?: string } })?.error?.type || ''; } catch { /* rien */ }
        throw new Error(`HTTP ${r.status} ${type}`.trim());       // jamais d'en-têtes ni de corps de requête dans l'erreur
      }
      for await (const l of lignes(r.body as unknown as AsyncIterable<Uint8Array>, s.signal)) {
        if (!l.startsWith('data:')) continue;
        let j: { type?: string; message?: { usage?: Partial<typeof u> }; delta?: { type?: string; text?: string; stop_reason?: string }; usage?: { output_tokens?: number }; error?: { type?: string } };
        try { j = JSON.parse(l.slice(5)); } catch { continue; }
        if (j.type === 'message_start' && j.message?.usage) Object.assign(u, j.message.usage);
        else if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') { if (tPremier === null) tPremier = Date.now(); ext.pousser(j.delta.text ?? ''); }
        else if (j.type === 'message_delta') { if (j.usage?.output_tokens != null) u.output_tokens = j.usage.output_tokens; stop = j.delta?.stop_reason || stop; }
        else if (j.type === 'error') throw new Error('flux : ' + (j.error?.type || 'erreur'));
      }
      const cout = (u.input_tokens * PRIX.entree + u.output_tokens * PRIX.sortie + (u.cache_read_input_tokens || 0) * PRIX.cache_lecture + (u.cache_creation_input_tokens || 0) * PRIX.cache_ecriture) / 1e6;
      this.coutTotal += cout;
      if (stop === 'refusal') throw Object.assign(new Error('refus de sécurité'), { cout });
      return {
        t0, t_premier_jeton: tPremier, t_fin: Date.now(),
        jetons_entree: u.input_tokens + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), jetons_sortie: u.output_tokens, cout_usd: cout, stop,
      };
    } finally { clearTimeout(premier); s.fin(); }
  }
}

/** Statistiques de latence par fournisseur et par étape (100 dernières valeurs). */
export class StatsLatence {
  par: Record<string, Record<string, Fenetre>> = {};
  ajouter(fournisseur: string, etape: string, ms: number): void {
    if (!Number.isFinite(ms)) return;
    for (const f of [fournisseur, '*']) ((this.par[f] ||= {})[etape] ||= new Fenetre(100)).ajouter(ms);
  }
  resume(fournisseur = '*'): Record<string, { p50: number | null; p95: number | null }> {
    const o: Record<string, { p50: number | null; p95: number | null }> = {};
    for (const [etape, w] of Object.entries(this.par[fournisseur] || {})) { const r = w.resume(); o[etape] = { p50: r.p50, p95: r.p95 }; }
    return o;
  }
}

/** Les fournisseurs disponibles selon l'environnement : Ollama si OLLAMA_URL est posée, Anthropic si ANTHROPIC_API_KEY l'est. */
export function fournisseursDepuisEnv(env: Record<string, string | undefined>, f?: Fetch): { ollama?: Fournisseur; anthropic?: Fournisseur } {
  const res: { ollama?: Fournisseur; anthropic?: Fournisseur } = {};
  if (env.OLLAMA_URL) {
    res.ollama = new FournisseurOllama({ url: env.OLLAMA_URL, modele: env.MODELE_OLLAMA || 'qwen3:8b', ...(f ? { fetch: f } : {}) });
  }
  if (env.ANTHROPIC_API_KEY) res.anthropic = new FournisseurAnthropic({ env, ...(f ? { fetch: f } : {}) });
  return res;
}
