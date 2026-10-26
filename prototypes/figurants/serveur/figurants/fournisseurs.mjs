// Fournisseurs N2 (étude §7) : Ollama (local, dgx2), Anthropic Haiku 5.5 (si ANTHROPIC_API_KEY), banque (sans IA).
// Chaque fournisseur stream la sortie et rappelle onLigne() dès qu'un objet JSON {persona, texte} est complet.
// Un disjoncteur par fournisseur bascule automatiquement sur le suivant (§7.6).
//
// Choix mesuré le 26/10 (tunnel vers dgx2, qwen3:8b à chaud, 4 répliques) :
//  - 1 appel → 4 lignes JSON : 1er jeton 0,19-0,28 s, 1re ligne 0,62-0,97 s, 4e ligne 2,4-2,7 s ;
//  - 4 appels parallèles d'une ligne : Ollama les SÉRIALISE (1ers jetons 0,19 / 0,84 / 1,4 / 2,1 s), fin à 2,6-2,7 s,
//    et les 4 répliques se ressemblent (« elle a l'air sincère » ×2) faute de voir les autres.
//  → un seul appel multi-personas : même durée totale, 1re réplique aussi rapide, foule plus variée, préfixe système réutilisé.

import { Fenetre, percentile } from '../util.mjs';

/** Extrait les objets JSON {…} complets d'un flux de texte, au fil de l'eau (chaînes et échappements gérés). */
export class ExtracteurJson {
  constructor(onObjet) { this.onObjet = onObjet; this.buf = ''; this.prof = 0; this.dansChaine = false; this.echap = false; this.debut = -1; this.i = 0; }
  pousser(texte) {
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

/** Disjoncteur : 3 erreurs en 30 s, ou p95 « ligne prête » > 4 s sur ≥ 3 appels en 30 s → ouvert 60 s, puis un essai. */
export class Disjoncteur {
  constructor(nom, { fenetreMs = 30_000, pauseMs = 60_000, seuilErreurs = 3, seuilP95 = 4000 } = {}) {
    Object.assign(this, { nom, fenetreMs, pauseMs, seuilErreurs, seuilP95 });
    this.evts = []; this.ouvertJusqua = 0; this.etat = 'ferme'; this.raison = '';
  }
  _purger(t) { while (this.evts.length && t - this.evts[0].ts > this.fenetreMs) this.evts.shift(); }
  peutEssayer(t = Date.now()) {
    if (this.etat === 'ouvert' && t >= this.ouvertJusqua) this.etat = 'demi';
    return this.etat !== 'ouvert';
  }
  succes(latMs, t = Date.now()) {
    this.evts.push({ ts: t, ok: true, lat: latMs }); this._purger(t);
    const lats = this.evts.filter((e) => e.ok && Number.isFinite(e.lat)).map((e) => e.lat);
    if (lats.length >= 3 && percentile(lats, 95) > this.seuilP95) return this.ouvrir(`p95 ligne ${Math.round(percentile(lats, 95))} ms > ${this.seuilP95} ms`, t);
    if (this.etat !== 'ferme') { this.etat = 'ferme'; this.raison = ''; return 'ferme'; }
    return null;
  }
  echec(raison, t = Date.now()) {
    this.evts.push({ ts: t, ok: false }); this._purger(t);
    if (this.etat === 'demi') return this.ouvrir(raison, t);
    if (this.evts.filter((e) => !e.ok).length >= this.seuilErreurs) return this.ouvrir(raison, t);
    return null;
  }
  ouvrir(raison, t = Date.now(), pause = this.pauseMs) {
    this.etat = 'ouvert'; this.ouvertJusqua = t + pause; this.raison = raison; this.evts = [];
    return 'ouvert';
  }
  resume() { return { etat: this.etat, raison: this.raison, jusqua: this.etat === 'ouvert' ? this.ouvertJusqua : null }; }
}

function signalCombine(externe, ms) {
  const c = new AbortController();
  const minuteur = setTimeout(() => c.abort(new Error('délai dépassé')), ms);
  if (externe) { if (externe.aborted) c.abort(externe.reason); else externe.addEventListener('abort', () => c.abort(externe.reason), { once: true }); }
  return { signal: c.signal, annuler: (r) => c.abort(r), fin: () => clearTimeout(minuteur) };
}

/** Lit un corps de réponse en flux, ligne par ligne. */
async function* lignes(corps, signal) {
  const dec = new TextDecoder(); let buf = '';
  for await (const morceau of corps) {
    if (signal?.aborted) throw signal.reason || new Error('annulé');
    buf += dec.decode(morceau, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { yield buf.slice(0, i); buf = buf.slice(i + 1); }
  }
  if (buf) yield buf;
}

export class FournisseurOllama {
  constructor({ url, modele, delaiPremierJeton = 3000, delaiTotal = 12000 }) {
    this.nom = 'ollama'; this.url = url.replace(/\/+$/, ''); this.modele = modele;
    this.delaiPremierJeton = delaiPremierJeton; this.delaiTotal = delaiTotal;
    this.disjoncteur = new Disjoncteur('ollama');
    this.joignable = null;
  }
  disponible() { return true; }

  async sante() {
    try {
      const r = await fetch(this.url + '/api/tags', { signal: AbortSignal.timeout(2000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const ok = (j.models || []).some((m) => m.name === this.modele || m.model === this.modele || m.name === this.modele + ':latest');
      this.joignable = ok;
      return ok ? { ok } : { ok: false, raison: `modèle ${this.modele} absent` };
    } catch (e) { this.joignable = false; return { ok: false, raison: String(e.message || e) }; }
  }

  /** Charge le modèle et le garde 30 min (keep_alive) : le premier vrai appel est à chaud. */
  async prechauffer(systeme = null) {
    try {
      const messages = systeme ? [{ role: 'system', content: systeme }, { role: 'user', content: 'ok' }] : [{ role: 'user', content: 'ok' }];
      await fetch(this.url + '/api/chat', { method: 'POST', signal: AbortSignal.timeout(60000),
        body: JSON.stringify({ model: this.modele, messages, stream: false, think: false, keep_alive: '30m', options: { num_predict: 1 } }) });
      return true;
    } catch { return false; }
  }

  async generer({ systeme, utilisateur, nb, signal, onLigne }) {
    const t0 = Date.now();
    const s = signalCombine(signal, this.delaiTotal);
    let tPremier = null; let jetonsEntree = 0; let jetonsSortie = 0;
    const premier = setTimeout(() => { if (tPremier === null) s.annuler(new Error('pas de premier jeton')); }, this.delaiPremierJeton);
    const ext = new ExtracteurJson((obj) => onLigne(obj, Date.now(), tPremier));
    try {
      const r = await fetch(this.url + '/api/chat', {
        method: 'POST', signal: s.signal, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.modele, stream: true, think: false, keep_alive: '30m',
          messages: [{ role: 'system', content: systeme }, { role: 'user', content: utilisateur }],
          options: { temperature: 0.8, top_p: 0.8, top_k: 20, presence_penalty: 1.0, num_predict: 45 * nb + 30 },
        }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      for await (const l of lignes(r.body, s.signal)) {
        if (!l.trim()) continue;
        let j; try { j = JSON.parse(l); } catch { continue; }
        if (j.error) throw new Error(String(j.error).slice(0, 200));
        const c = j.message?.content || '';
        if (c) { if (tPremier === null) tPremier = Date.now(); ext.pousser(c); }
        if (j.done) { jetonsEntree = j.prompt_eval_count || 0; jetonsSortie = j.eval_count || 0; }
      }
      return { t0, t_premier_jeton: tPremier, t_fin: Date.now(), jetons_entree: jetonsEntree, jetons_sortie: jetonsSortie, cout_usd: 0 };
    } finally { clearTimeout(premier); s.fin(); }
  }
}

// Tarifs Claude Haiku 5.5 (étude §7.4) en $ par million de jetons.
const PRIX = { entree: 0.10, sortie: 0.50, cache_lecture: 0.01, cache_ecriture: 0.125 };

export class FournisseurAnthropic {
  constructor({ modele = 'claude-haiku-5-5', delaiPremierJeton = 3000, delaiTotal = 10000, budgetUsd = 5 } = {}) {
    this.nom = 'anthropic'; this.modele = modele;
    this.delaiPremierJeton = delaiPremierJeton; this.delaiTotal = delaiTotal; this.budgetUsd = budgetUsd;
    this.disjoncteur = new Disjoncteur('anthropic');
    this.coutTotal = 0;
  }
  // La clé est lue dans l'environnement à chaque appel ; elle n'est jamais copiée ailleurs ni journalisée.
  disponible() { return !!process.env.ANTHROPIC_API_KEY && this.coutTotal < this.budgetUsd; }

  async generer({ systeme, utilisateur, nb, signal, onLigne }) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('pas de clé');
    const t0 = Date.now();
    const s = signalCombine(signal, this.delaiTotal);
    let tPremier = null; const u = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const premier = setTimeout(() => { if (tPremier === null) s.annuler(new Error('pas de premier jeton')); }, this.delaiPremierJeton);
    const ext = new ExtracteurJson((obj) => onLigne(obj, Date.now(), tPremier));
    let stop = null;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: s.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: this.modele, max_tokens: Math.min(400, 50 * nb + 40), stream: true,
          thinking: { type: 'disabled' }, output_config: { effort: 'low' },
          system: [{ type: 'text', text: systeme, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: utilisateur }],
        }),
      });
      if (!r.ok) {
        let type = ''; try { type = (await r.json())?.error?.type || ''; } catch { /* rien */ }
        throw new Error(`HTTP ${r.status} ${type}`.trim());       // jamais d'en-têtes ni de corps de requête dans l'erreur
      }
      for await (const l of lignes(r.body, s.signal)) {
        if (!l.startsWith('data:')) continue;
        let j; try { j = JSON.parse(l.slice(5)); } catch { continue; }
        if (j.type === 'message_start' && j.message?.usage) Object.assign(u, j.message.usage);
        else if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') { if (tPremier === null) tPremier = Date.now(); ext.pousser(j.delta.text); }
        else if (j.type === 'message_delta') { if (j.usage?.output_tokens != null) u.output_tokens = j.usage.output_tokens; stop = j.delta?.stop_reason || stop; }
        else if (j.type === 'error') throw new Error('flux : ' + (j.error?.type || 'erreur'));
      }
      const cout = (u.input_tokens * PRIX.entree + u.output_tokens * PRIX.sortie + (u.cache_read_input_tokens || 0) * PRIX.cache_lecture + (u.cache_creation_input_tokens || 0) * PRIX.cache_ecriture) / 1e6;
      this.coutTotal += cout;
      if (stop === 'refusal') throw Object.assign(new Error('refus de sécurité'), { cout });
      return { t0, t_premier_jeton: tPremier, t_fin: Date.now(), jetons_entree: u.input_tokens + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), jetons_sortie: u.output_tokens, cout_usd: cout, stop };
    } finally { clearTimeout(premier); s.fin(); }
  }
}

/** Statistiques de latence par fournisseur et par étape (100 dernières valeurs). */
export class StatsLatence {
  constructor() { this.par = {}; }
  ajouter(fournisseur, etape, ms) {
    if (!Number.isFinite(ms)) return;
    for (const f of [fournisseur, '*']) ((this.par[f] ||= {})[etape] ||= new Fenetre(100)).ajouter(ms);
  }
  resume(fournisseur = '*') {
    const o = {};
    for (const [etape, w] of Object.entries(this.par[fournisseur] || {})) { const r = w.resume(); o[etape] = { p50: r.p50, p95: r.p95 }; }
    return o;
  }
}
