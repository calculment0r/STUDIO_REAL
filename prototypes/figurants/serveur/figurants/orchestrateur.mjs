// Orchestrateur des figurants (étude §5.5, §6) : « metteur en scène déterministe + plume LLM ».
// Décide quand réagir, combien, quels personas, quel niveau ; le LLM n'écrit que les textes demandés.
//
// Niveaux : N0 réflexes (banque par humeur / déclencheur) · N1 répliques écrites par segment · N2 IA en réaction à la
// transcription · souffleur (fig.cmd dire, validation facultative) · main (la régie écrit à la place d'un persona).
// Chaque réplique : styliseur → filtre (moderation.mjs) → anti-répétition → planificateur (délai humain simulé) → jeu.diffuserChat
// (qui refiltre : aucune voie de contournement). COUPE incrémente l'époque : tout ce qui est planifié ou en vol est jeté.

import { hasard, entier, choisir, proba, choisirPondere, logNormale, melanger, borne } from '../util.mjs';
import { styliser, compterEmojis, couper } from './styliseur.mjs';
import { quasiDoublon, cleTexte } from './similarite.mjs';
import { construirePrompt, lireReplique } from './prompt.mjs';
import { StatsLatence } from './fournisseurs.mjs';
import { texteMotif } from '../banques.mjs';

// Débit cible des figurants (msg/min, chat réel nul) et part N0/N1/N2 ; q = répliques N2 sur question au chat ;
// e = répliques N2 attendues par énoncé significatif ; k = facteur des rafales N0.
export const DENSITES = {
  silence: { debit: 0, mix: [0, 0, 0], q: 0, e: 0, k: 0 },
  calme: { debit: 6, mix: [0.4, 0.3, 0.3], q: 2, e: 0.4, k: 0.4 },
  normal: { debit: 20, mix: [0.5, 0.2, 0.3], q: 3, e: 1, k: 0.7 },
  chaud: { debit: 45, mix: [0.6, 0.15, 0.25], q: 4, e: 1.5, k: 1 },
  folie: { debit: 90, mix: [0.7, 0.15, 0.15], q: 5, e: 2, k: 1.4 },
};

const ANGLES = ['reaction', 'blague', 'question', 'doute', 'encouragement', 'conseil', 'moquerie_douce'];
const ANGLES_SOUFFLEUR = ['alerte_amicale', 'constat_bref', 'moquerie_douce', 'question', 'doute'];
const IDS_QUESTION = new Set(['question_chat', 'avis', 'oui_non', 'tapez_1']);
const RE_QUESTION = [/\b(le chat|les gars|les amis|tout le monde)\b/, /\bvous en pensez quoi\b/, /\b(dites|dis) moi\b/, /\bvotre avis\b/,
  /\bje (fais|prends|choisis|dis) quoi\b/, /\bou pas\b/, /\boui ou non\b/, /\b(est ce que|qu'est ce que) vous\b/,
  /\bvous (preferez|voulez|croyez|pensez|trouvez|savez|avez)\b/, /\?\s*$/];
const MOTS_MAX_IA = 12;

export class Orchestrateur {
  /**
   * @param {object} o
   * @param {import('../banques.mjs').Banques} o.banques
   * @param {import('../moderation.mjs').Moderateur} o.moderateur
   * @param {{ecrire: Function}} o.journal
   * @param {object} o.jeu   { etat, diffuserChat(item), versRegie(msg), journalRegie(txt), chatHumainsRecents(n), pseudosHumains() }
   * @param {{ollama?: object, anthropic?: object}} o.fournisseurs
   * @param {object} o.config { acceleration, peremptionMs, maxAppelsMin, ollamaMode }
   */
  constructor({ banques, moderateur, journal, jeu, fournisseurs, config = {} }) {
    Object.assign(this, { banques, moderateur, journal, jeu, fournisseurs });
    this.config = { acceleration: 2, peremptionMs: 10_000, maxAppelsMin: 30, ollamaMode: 'multi', expirationAttenteMs: 120_000, ...config };
    this.epoch = 0;
    this.seq = 0;
    this.planifies = new Map();      // id → {timer, item, epoch}
    this.attente = new Map();        // id → {item, ts}
    this.enVol = new Set();          // AbortController des appels LLM
    this.memoire = new Map();        // pid → {derniers: [], prochainLibre}
    this.histoFig = [];              // {texte, cle, ts} : anti-répétition (3 min)
    this.transcription = [];         // finals récents {texte, ts}
    this.enonce = null;              // énoncé en cours (partiels)
    this.dernierAsr = 0;
    this.contagion = 0;
    this.n1Utilises = new Set();     // ids de répliques N1 déjà dites (une fois par représentation, sauf « libre » épuisé)
    this.n1LibresRecents = [];
    this.variantesUtilisees = new Map(); // `${segment}:${declencheur}` → Set de textes
    this.declencheursRecents = new Map(); // id → ts (pas de redéclenchement avant 8 s)
    this.fileN2 = [];
    this.n2EnCours = 0;
    this.appels = [];                // horodatages des appels LLM (plafond / min)
    this.coutUsd = 0;
    this.compteurs = { doublons: 0, perimes: 0, appels: 0, erreurs: 0, lignes_invalides: 0, annules: 0 };
    this.stats = new StatsLatence();
    this.fournisseurEffectif = null;
    this.minuteurs = [];
  }

  get etat() { return this.jeu.etat; }

  demarrer() {
    this.minuteurs.push(setInterval(() => this._tickAmbiance(), 500));
    this.minuteurs.push(setInterval(() => this._menage(), 5000));
  }
  arreter() { for (const m of this.minuteurs) clearInterval(m); this.annulerTout('arret'); }

  // ------------------------------------------------------------------ personas

  personasActifs() {
    const seg = this.etat.segment;
    return this.banques.personas.filter((p) => p.actif && (!p.presence || p.presence.includes(seg)));
  }
  persona(idOuPseudo) {
    const k = String(idOuPseudo || '');
    return this.banques.personas.find((p) => p.id === k || p.pseudo === k) || null;
  }
  _mem(pid) { let m = this.memoire.get(pid); if (!m) { m = { derniers: [], prochainLibre: 0 }; this.memoire.set(pid, m); } return m; }

  _ecartMin(p) {
    const d = DENSITES[this.etat.densite] || DENSITES.normal;
    const n = Math.max(1, this.personasActifs().length);
    return Math.min(20 / p.rythme.activite, Math.max(1.5, 0.5 * n * 60 / Math.max(1, d.debit))) * 1000;
  }

  /** Tire n personas distincts pour un niveau (poids reagit[niveau] × activité, en respectant l'écart minimal). */
  choisirPersonas(n, niveau, { exclure = new Set(), ignorerEcart = false } = {}) {
    const t = Date.now();
    let cand = this.personasActifs().filter((p) => !exclure.has(p.id) && (p.reagit[niveau] ?? 0.5) > 0);
    const libres = cand.filter((p) => ignorerEcart || this._mem(p.id).prochainLibre <= t);
    if (libres.length >= n || !ignorerEcart) cand = libres.length ? libres : cand.filter((p) => this._mem(p.id).prochainLibre <= t + 3000);
    const choisis = [];
    while (choisis.length < n && cand.length) {
      const p = choisirPondere(cand, (x) => (x.reagit[niveau] ?? 0.5) * (0.3 + x.rythme.activite));
      if (!p) break;
      choisis.push(p); cand = cand.filter((x) => x !== p);
    }
    return choisis;
  }

  delaiHumain(p, texte, { niveau = 'N2' } = {}) {
    const [a, b] = p.rythme.reaction_s;
    const accel = borne(this.config.acceleration, 1, 3);
    const reaction = borne(logNormale((a + b) / 2, 0.35), a * 0.6, b * 1.8);
    const longueur = [...texte.replace(/\p{Extended_Pictographic}/gu, '')].length;
    const frappe = longueur / (p.rythme.frappe_cps * accel);
    const emoji = compterEmojis(texte) * 0.6 / accel;
    return (niveau === 'N0' ? reaction * 0.7 : reaction) * 1000 + (frappe + emoji) * 1000;
  }

  delaiFrappe(p, texte) {
    const accel = borne(this.config.acceleration, 1, 3);
    return [...texte.replace(/\p{Extended_Pictographic}/gu, '')].length / (p.rythme.frappe_cps * accel) * 1000;
  }

  /** Charge le préfixe système du segment dans le cache d'Ollama (le 1er appel réel est alors à chaud). */
  async prechaufferPrompt() {
    const f = this.fournisseurs.ollama;
    if (!f || f.joignable === false || !['auto', 'ollama'].includes(this.etat.fournisseur) || this.n2EnCours) return;
    const p = this.personasActifs()[0];
    if (!p) return;
    const pr = construirePrompt(this.banques, { type: 'n2', mode: 'multi', segment: this.segmentCourant(), humeur: this.etat.humeur, distribution: this.personasActifs(), aEcrire: [{ persona: p, angle: 'reaction' }] });
    const t0 = Date.now();
    const ok = await f.prechauffer(pr.systeme);
    this.journal.ecrire({ e: 'prechauffage', fournisseur: 'ollama', segment: this.etat.segment, ok, ms: Date.now() - t0 });
  }

  humeurCle() {
    const H = this.banques.reflexes.humeurs; const h = this.etat.humeur || {};
    const et = (h.etiquettes || []).map((x) => texteMotif(x)).find((x) => H[x]);
    if (et) return et;
    let best = null; let bd = Infinity;
    for (const [k, v] of Object.entries(H)) {
      if (!v.centre) continue;
      const d = (v.centre.valence - (h.valence ?? 0)) ** 2 + (v.centre.energie - (h.energie ?? 0.5)) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return best || (H.neutre ? 'neutre' : Object.keys(H)[0]);
  }

  segmentCourant() {
    const id = this.etat.segment;
    const s = this.banques.segments[id];
    return s ? { id, ...s } : { id, titre: id, consigne: '', faits: [], interdits: [], repliques: [] };
  }

  // ------------------------------------------------------------------ filtre + anti-répétition + planification

  /** Passe un texte de figurant au filtre et à l'anti-répétition. */
  preparer(texte, p, { origine, ref, fournisseur, sansDoublon = false, iaBrute = false }) {
    const contexte = { origine, pid: p.id, ref, fournisseur };
    if (iaBrute && texte.split(/\s+/).filter(Boolean).length > MOTS_MAX_IA + 3) {   // +3 : tic et emoji ajoutés par le styliseur
      this.journal.ecrire({ e: 'rejet', raison: 'mots', figurant: true, texte, ...contexte });
      this.moderateur.compteurs.rejets++; this.moderateur.compteurs.rejets_figurants++;
      return { ok: false, raison: 'mots' };
    }
    const v = this.moderateur.verifier(texte, { figurant: true, contexte, listeSup: this.banques.listesSegment?.[this.etat.segment] });
    if (!v.ok) return v;
    const t = cleTexte(v.texte);
    for (const ps of this.jeu.pseudosHumains()) {
      const k = cleTexte(ps);
      if (k.length >= 3 && (` ${t} `).includes(` ${k} `)) {
        this.journal.ecrire({ e: 'rejet', raison: 'figurant:pseudo_public', figurant: true, texte: v.texte, ...contexte });
        this.moderateur.compteurs.rejets++; this.moderateur.compteurs.rejets_figurants++;
        return { ok: false, raison: 'figurant:pseudo_public' };
      }
    }
    if (!sansDoublon) {
      const d = quasiDoublon(v.texte, this.histoFig);
      if (d) {
        this.compteurs.doublons++;
        this.journal.ecrire({ e: 'doublon', texte: v.texte, avec: d.avec, score: d.score, ...contexte });
        return { ok: false, raison: 'doublon' };
      }
    }
    return v;
  }

  /** Planifie l'affichage d'une réplique déjà filtrée. */
  planifier(item, tAffiche) {
    if (this.etat.coupe) return null;
    const id = ++this.seq;
    const delai = Math.max(0, tAffiche - Date.now());
    item.t = { ...(item.t || {}), prevu: Math.round(tAffiche) };
    const timer = setTimeout(() => this._afficher(id), delai);
    this.planifies.set(id, { timer, item, epoch: this.epoch });
    this.histoFig.push({ texte: item.texte, cle: cleTexte(item.texte), ts: Date.now() });
    const m = this._mem(item.persona.id);
    m.prochainLibre = Math.max(m.prochainLibre, tAffiche + (item.regie ? 0 : this._ecartMin(item.persona)));
    return id;
  }

  _afficher(id) {
    const pl = this.planifies.get(id);
    this.planifies.delete(id);
    if (!pl) return;
    if (this.etat.coupe || pl.epoch !== this.epoch) { this.compteurs.annules++; return; }
    const it = pl.item; const t = it.t || {};
    const maintenant = Date.now();
    const lat = {};
    if (t.asr != null && t.decision != null) lat.asr_decision = t.decision - t.asr;
    if (t.requete != null && t.premier_jeton != null) lat.premier_jeton = t.premier_jeton - t.requete;
    if (t.requete != null && t.ligne != null) lat.ligne = t.ligne - t.requete;
    if (t.filtre_ms != null) lat.filtre = t.filtre_ms;
    if (t.pret != null) lat.attente = maintenant - t.pret;
    if (t.asr != null) { lat.pret = (t.pret ?? maintenant) - t.asr; lat.total = maintenant - t.asr; }
    const p = it.persona;
    const publie = this.jeu.diffuserChat({
      pid: p.id, pseudo: p.pseudo, couleur: p.couleur, texte: it.texte, origine: it.origine, ref: it.ref ?? null,
      lat, fournisseur: it.fournisseur || 'banque', t: { ...t, affiche: maintenant }, vague: !!it.vague, version: it.version,
    }, { figurant: true, listeSup: this.banques.listesSegment?.[this.etat.segment] });
    if (!publie) return;
    const m = this._mem(p.id);
    m.derniers.push(it.texte); if (m.derniers.length > 5) m.derniers.shift();
    const groupe = ['N2', 'souffleur'].includes(it.origine) ? (it.fournisseur || 'banque') : 'reflexe';
    for (const [k, v] of Object.entries(lat)) this.stats.ajouter(groupe, k, v);
    if (!it.vague && !it.regie) this.contagion = Math.min(2, this.contagion + 0.25 * (1 + p.rythme.rafale));
  }

  annulerTout(raison) {
    this.epoch++;
    let n = 0;
    for (const [, pl] of this.planifies) { clearTimeout(pl.timer); n++; }
    this.planifies.clear();
    for (const c of this.enVol) c.abort(new Error(raison));
    this.enVol.clear();
    this.fileN2 = [];
    this.journal.ecrire({ e: 'annulation', raison, planifies: n });
    return n;
  }

  // ------------------------------------------------------------------ ambiance (débit cible)

  _tickAmbiance() {
    const d = DENSITES[this.etat.densite];
    this.contagion *= 0.85;
    if (!d || !d.debit || this.etat.coupe) return;
    const parole = Date.now() - this.dernierAsr < 20_000;
    const part = d.mix[0] + d.mix[1];
    const debit = parole ? d.debit * part : d.debit;
    let enAttente = 0; for (const [, pl] of this.planifies) if (pl.item.ambiance) enAttente++;
    if (enAttente > Math.max(2, d.debit / 10)) return;
    if (this.jeu.debit().fig + this.planifies.size > d.debit * 1.2) return;     // les réactions ont déjà rempli la minute
    if (!proba(debit / 60 * 0.5 * (1 + this.contagion))) return;
    if (proba(d.mix[1] / part) && this._ambianceN1()) return;
    this._ambianceN0();
  }

  _ambianceN0(p = null) {
    const cle = this.humeurCle();
    const h = this.banques.reflexes.humeurs[cle];
    if (!h) return false;
    p ||= this.choisirPersonas(1, 'N0')[0];
    if (!p) return false;
    const pool = [...h.variantes, ...(proba(0.25) ? h.emotes : [])];
    const texte = this._tirerVariante(`humeur:${cle}`, pool);
    if (!texte) return false;
    return this._planifierBanque(p, h.stylisable ? styliser(texte, p, { leger: false }) : texte, {
      origine: 'N0', ref: 'humeur:' + cle, delaiMs: hasard(300, 2500), ambiance: true });
  }

  _ambianceN1() {
    const seg = this.segmentCourant();
    let libres = seg.repliques.filter((r) => r.type === 'libre' && !this.n1Utilises.has(r.id));
    if (!libres.length) {
      // réserve épuisée : remise en jeu en évitant les 20 dernières
      for (const r of seg.repliques) if (r.type === 'libre' && !this.n1LibresRecents.includes(r.id)) this.n1Utilises.delete(r.id);
      libres = seg.repliques.filter((r) => r.type === 'libre' && !this.n1Utilises.has(r.id));
    }
    for (const r of melanger(libres).slice(0, 4)) {
      if (this._direN1(r, { delaiMs: hasard(500, 2500), ambiance: true, ref: 'n1:libre' })) {
        this.n1LibresRecents.push(r.id); if (this.n1LibresRecents.length > 20) this.n1LibresRecents.shift();
        return true;
      }
    }
    return false;
  }

  /** Dit une réplique N1 (persona attitré si présent et libre, sinon un autre pour une générique). */
  _direN1(r, { delaiMs = 0, tBase = Date.now(), ambiance = false, ref = 'n1', ignorerEcart = false, t = {} } = {}) {
    let p = null;
    if (r.persona) {
      p = this.persona(r.persona);
      if (!p || !this.personasActifs().includes(p)) return false;
      if (!ignorerEcart && this._mem(p.id).prochainLibre > Date.now() + delaiMs) return false;
    } else {
      p = this.choisirPersonas(1, 'N1', { ignorerEcart })[0];
      if (!p) return false;
    }
    const texte = r.persona ? couper(r.texte, 80) : styliser(r.texte, p);
    const ok = this._planifierBanque(p, texte, { origine: 'N1', ref: `${ref}:${r.id}`, delaiMs, tBase, ambiance, t, sansDoublon: !ambiance });
    if (ok) this.n1Utilises.add(r.id);
    return ok;
  }

  _planifierBanque(p, texte, { origine, ref, delaiMs = 0, tBase = Date.now(), ambiance = false, t = {}, sansDoublon = false, vague = false, regie = false }) {
    if (this.etat.coupe) return false;
    const v = this.preparer(texte, p, { origine, ref, fournisseur: 'banque', sansDoublon: sansDoublon || vague });
    if (!v.ok) return false;
    const item = { persona: p, texte: v.texte, origine, ref, fournisseur: 'banque', ambiance, vague, regie,
      t: { ...t, filtre_ms: v.duree_ms, pret: Date.now() } };
    return this.planifier(item, Math.max(tBase + delaiMs, Date.now() + 50)) != null;
  }

  _tirerVariante(cle, pool) {
    const k = `${this.etat.segment}:${cle}`;
    let deja = this.variantesUtilisees.get(k);
    if (!deja) { deja = new Set(); this.variantesUtilisees.set(k, deja); }
    let libres = pool.filter((x) => !deja.has(x));
    if (!libres.length) { deja.clear(); libres = pool.slice(); }
    const x = choisir(libres);
    if (x) deja.add(x);
    return x;
  }

  // ------------------------------------------------------------------ transcription

  onAsr({ kind, texte, ts, tc, tFinPhrase }) {
    const t = texteMotif(texte);
    const tFinSrv = Number.isFinite(tc) && Number.isFinite(tFinPhrase) ? ts - (tc - tFinPhrase) : null;   // décalage d'horloge ≈ 0 en local
    this.journal.ecrire({ e: 'asr', kind, texte: String(texte).slice(0, 500), t_asr: ts, tc, tFinPhrase, t_fin_phrase_srv: tFinSrv });
    if (!t) return;
    this.dernierAsr = ts;
    const e = this.enonce ||= { debut: ts, declenches: new Set(), n1: new Set(), n2: false, question: false,
      budgetN0: Math.ceil((DENSITES[this.etat.densite]?.debit || 0) / 6) };   // plafond de densité : ≈ 10 s de débit cible par énoncé
    if (this.etat.coupe) { if (kind === 'final') this._finEnonce(texte, ts); return; }
    const d = DENSITES[this.etat.densite] || DENSITES.normal;
    const mots = t.split(' ').length;
    const seg = this.segmentCourant();

    // N0 : déclencheurs de reflexes.json (sur partiels et final ; pas deux fois par énoncé ni avant 8 s)
    const humeur = this.humeurCle();
    for (const dec of this.banques.reflexes.declencheurs) {
      if (e.declenches.has(dec.id) || dec.segments_exclus.includes(seg.id)) continue;
      if (!dec.motifs.some((m) => m.test(t))) continue;
      e.declenches.add(dec.id);
      if (IDS_QUESTION.has(dec.id)) e.question = true;
      if (ts - (this.declencheursRecents.get(dec.id) || 0) < 8000) continue;
      this.declencheursRecents.set(dec.id, ts);
      if (!d.k) continue;
      e.budgetN0 -= this._rafaleN0(dec, humeur, ts, d, e.question, e.budgetN0);
    }
    // N1 : répliques « mot: » / « re: » du segment (une fois par représentation)
    for (const r of seg.repliques) {
      if (r.type !== 'mot' || e.n1.has(r.id) || this.n1Utilises.has(r.id) || !r.motif.test(t)) continue;
      e.n1.add(r.id);
      const tDec = Date.now();
      this._direN1(r, { tBase: ts, delaiMs: hasard(900, 2500) + e.n1.size * 1200, ref: 'n1:' + r.quand, ignorerEcart: true, t: { asr: ts, decision: tDec } });
    }
    // N2 : question au chat détectée tôt (dès un partiel de 4 mots), sinon fin d'énoncé significative
    const question = e.question || RE_QUESTION.some((r) => r.test(t));
    if (question && !e.n2 && mots >= 4 && d.q > 0) {
      e.n2 = true;
      this.demanderN2({ evenement: 'question_au_chat', origine: 'N2', nb: d.q, tAsr: ts, ref: `asr:${kind}`, sur: kind });
    }
    if (kind === 'final') {
      if (!e.n2 && mots >= 5 && d.e > 0) {
        const nb = Math.floor(d.e) + (proba(d.e % 1) ? 1 : 0);
        if (nb > 0) { e.n2 = true; this.demanderN2({ evenement: 'fin_enonce', origine: 'N2', nb, tAsr: ts, ref: 'asr:final', sur: kind }); }
      }
      this._finEnonce(texte, ts);
    } else {
      e.partiel = texte;
    }
  }

  _finEnonce(texte, ts) {
    this.transcription.push({ texte: String(texte).slice(0, 300), ts });
    while (this.transcription.length && ts - this.transcription[0].ts > 25_000) this.transcription.shift();
    this.enonce = null;
  }

  texteTranscription() {
    const parts = this.transcription.map((x) => x.texte);
    if (this.enonce?.partiel) parts.push(this.enonce.partiel);
    return parts.join(' … ').slice(-500);
  }

  _rafaleN0(dec, humeur, tBase, d, avecN2, budget = Infinity) {
    let n = Math.round(hasard(dec.nb[0], dec.nb[1]) * d.k * (dec.priorite === 'haute' ? 1 : 0.8));
    if (avecN2) n = Math.ceil(n * 0.6);                  // place laissée aux réponses N2
    // plafond : « haute » en ignore une partie (au moins 2 messages), les autres s'arrêtent au budget
    n = Math.min(n, dec.priorite === 'haute' ? Math.max(2, budget) : budget);
    if (n <= 0) return 0;
    const pool = [...dec.variantes, ...((dec.par_humeur || {})[humeur] || [])];
    const personas = this.choisirPersonas(n, 'N0', { ignorerEcart: dec.priorite === 'haute' });
    const tDec = Date.now();
    for (const p of personas) {
      const texte = this._tirerVariante('decl:' + dec.id, pool);
      if (!texte) break;
      this._planifierBanque(p, dec.stylisable ? styliser(texte, p) : texte, {
        origine: 'N0', ref: 'decl:' + dec.id, tBase, delaiMs: hasard(dec.delai_s[0], dec.delai_s[1]) * 1000, t: { asr: tBase, decision: tDec } });
    }
    return personas.length;
  }

  // ------------------------------------------------------------------ N2 / souffleur

  choisirFournisseur() {
    const ordre = { auto: ['anthropic', 'ollama'], ollama: ['ollama'], anthropic: ['anthropic'], banque: [] }[this.etat.fournisseur] || [];
    const t = Date.now();
    while (this.appels.length && t - this.appels[0] > 60_000) this.appels.shift();
    if (this.appels.length >= this.config.maxAppelsMin) return null;
    for (const n of ordre) {
      const f = this.fournisseurs[n];
      if (!f || !f.disponible()) continue;
      if (f.joignable === false) continue;
      if (!f.disjoncteur.peutEssayer(t)) continue;
      return f;
    }
    return null;
  }

  demanderN2(req) {
    if (this.etat.coupe) return;
    req.tDecision = Date.now();
    req.epoch = this.epoch;
    const f = this.choisirFournisseur();
    if (!f) { this._n2Banque(req, null); return; }
    if (this.n2EnCours >= 1) {
      // une génération à la fois (Ollama sérialise de toute façon) ; on garde les demandes prioritaires et la plus récente
      this.fileN2 = this.fileN2.filter((x) => x.prioritaire);
      this.fileN2.push(req);
      return;
    }
    this._executerN2(req, f);
  }

  _suivantN2() {
    while (this.fileN2.length) {
      const req = this.fileN2.shift();
      if (req.epoch !== this.epoch || this.etat.coupe) continue;
      if (!req.prioritaire && Date.now() - req.tDecision > 4000) { this._n2Banque(req, null); continue; }
      const f = this.choisirFournisseur();
      if (!f) { this._n2Banque(req, null); continue; }
      this._executerN2(req, f);
      return;
    }
  }

  async _executerN2(req, f) {
    const souffleur = req.origine === 'souffleur';
    const niveau = souffleur ? 'N3' : 'N2';
    const personas = req.personas?.length ? req.personas : this.choisirPersonas(req.nb, niveau, { ignorerEcart: souffleur || req.evenement === 'question_au_chat' });
    if (!personas.length) return;
    const angles = souffleur ? melanger(ANGLES_SOUFFLEUR) : (req.evenement === 'question_au_chat' ? ['reponse_question', ...melanger(ANGLES)] : (req.evenement === 'relance' ? ['question', 'conseil', 'encouragement'] : melanger(ANGLES)));
    const aEcrire = personas.map((p, i) => ({ persona: p, angle: angles[i % angles.length] }));
    const seg = this.segmentCourant();
    const base = {
      type: souffleur ? 'souffleur' : 'n2', segment: seg, humeur: this.etat.humeur,
      distribution: this.personasActifs(),          // identique pour tous les appels du segment : préfixe système réutilisé (cache)
      transcription: this.texteTranscription(), evenement: req.evenement,
      chatReel: this.jeu.chatHumainsRecents(12), dejaDit: this.histoFig.slice(-20).map((x) => x.texte), intention: req.intention,
    };
    this.n2EnCours++;
    this.compteurs.appels++;
    this.appels.push(Date.now());
    const ctrl = new AbortController(); this.enVol.add(ctrl);
    const epoch = this.epoch;
    const servis = new Set();
    const tRequete = Date.now();
    let tPremiereLigne = null; let version = '';
    req.rang = 0; req.acceptees = 0;
    const onLigne = (lot) => (obj, tLigne, tPremier) => {
      if (epoch !== this.epoch || this.etat.coupe) return;
      const r = lireReplique(obj);
      const p = r && lot.find((x) => x.id === r.persona || x.pseudo === r.persona);
      if (!r || !p || servis.has(p.id)) { this.compteurs.lignes_invalides++; this.journal.ecrire({ e: 'ligne_invalide', fournisseur: f.nom, obj: obj ?? null }); return; }
      servis.add(p.id);
      if (tPremiereLigne === null) tPremiereLigne = tLigne;
      this._ligneN2(req, p, r.texte, { fournisseur: f.nom, tRequete, tLigne, tPremier, version });
    };
    try {
      let res;
      if (f.nom === 'ollama' && this.config.ollamaMode === 'parallele') {
        // N requêtes d'une réplique (gabarits n2.qwen.*), lancées ensemble
        const rs = await Promise.all(aEcrire.map(async (a) => {
          const pr = construirePrompt(this.banques, { ...base, mode: 'unique', aEcrire: [a] }); version = pr.version;
          return f.generer({ systeme: pr.systeme, utilisateur: pr.utilisateur, nb: 1, signal: ctrl.signal, onLigne: onLigne([a.persona]) });
        }));
        res = { t_premier_jeton: Math.min(...rs.map((x) => x.t_premier_jeton ?? Infinity)), t_fin: Math.max(...rs.map((x) => x.t_fin)),
          jetons_entree: rs.reduce((s, x) => s + x.jetons_entree, 0), jetons_sortie: rs.reduce((s, x) => s + x.jetons_sortie, 0), cout_usd: 0 };
      } else {
        const pr = construirePrompt(this.banques, { ...base, mode: 'multi', aEcrire }); version = pr.version;
        res = await f.generer({ systeme: pr.systeme, utilisateur: pr.utilisateur, nb: aEcrire.length, signal: ctrl.signal, onLigne: onLigne(personas) });
      }
      this.coutUsd += res.cout_usd || 0;
      this.journal.ecrire({ e: 'n2_appel', fournisseur: f.nom, mode: f.nom === 'ollama' ? this.config.ollamaMode : 'multi', evenement: req.evenement, nb: aEcrire.length, servis: servis.size,
        t_asr: req.tAsr, t_decision: req.tDecision, t_requete: tRequete, t_premier_jeton: Number.isFinite(res.t_premier_jeton) ? res.t_premier_jeton : null, t_premiere_ligne: tPremiereLigne, t_fin: res.t_fin,
        jetons_entree: res.jetons_entree, jetons_sortie: res.jetons_sortie, cout_usd: res.cout_usd || 0, version });
      if (servis.size === 0) {
        this._signalerDisjoncteur(f, f.disjoncteur.echec('aucune ligne valide'));
      } else {
        this._signalerDisjoncteur(f, f.disjoncteur.succes(tPremiereLigne - tRequete));
      }
      // toutes les lignes refusées (filtre, doublon, péremption) : la banque prend le relais
      if (req.acceptees === 0 && epoch === this.epoch) {
        this.journal.ecrire({ e: 'n2_vide', fournisseur: f.nom, evenement: req.evenement, servis: servis.size });
        this._n2Banque(req, personas);
      }
    } catch (err) {
      const coupe = epoch !== this.epoch || this.etat.coupe;
      this.journal.ecrire({ e: coupe ? 'n2_annule' : 'n2_erreur', fournisseur: f.nom, erreur: String(err?.message || err).slice(0, 200), servis: servis.size });
      if (!coupe) {
        this.compteurs.erreurs++;
        this._signalerDisjoncteur(f, f.disjoncteur.echec(String(err?.message || err).slice(0, 80)));
        const restants = personas.filter((p) => !servis.has(p.id));
        if (restants.length && Date.now() - req.tAsr < 6000) this._n2Banque(req, restants);
      }
    } finally {
      this.enVol.delete(ctrl);
      this.n2EnCours--;
      this._suivantN2();
    }
  }

  _signalerDisjoncteur(f, transition) {
    if (!transition) return;
    const r = f.disjoncteur.resume();
    this.journal.ecrire({ e: 'disjoncteur', fournisseur: f.nom, ...r });
    this.jeu.journalRegie(transition === 'ouvert' ? `disjoncteur ${f.nom} OUVERT (${r.raison}) : repli sur le fournisseur suivant` : `disjoncteur ${f.nom} refermé`);
  }

  _ligneN2(req, p, texteBrut, { fournisseur, tRequete, tLigne, tPremier, version }) {
    const souffleur = req.origine === 'souffleur';
    const texte = styliser(texteBrut, p);
    const v = this.preparer(texte, p, { origine: req.origine, ref: req.ref, fournisseur, iaBrute: true });
    if (!v.ok) return;
    const tPret = Date.now();
    if (!souffleur && tPret - req.tAsr > this.config.peremptionMs) {
      this.compteurs.perimes++;
      this.journal.ecrire({ e: 'perime', texte: v.texte, pid: p.id, age_ms: tPret - req.tAsr, fournisseur });
      return;
    }
    const item = { persona: p, texte: v.texte, origine: req.origine, ref: req.ref, fournisseur, version, brut: texteBrut,
      t: { asr: req.tAsr, decision: req.tDecision, requete: tRequete, premier_jeton: tPremier, ligne: tLigne, filtre_ms: v.duree_ms, pret: tPret } };
    req.acceptees++;
    if (souffleur && (req.validation || p.reagit.N2 === 0)) { this.mettreEnAttente(item); return; }
    const rang = req.rang++;
    // question au chat : les spectateurs tapent déjà pendant la question (anticipation ≤ 2 s, moitié de la frappe)
    const anticipation = req.evenement === 'question_au_chat' ? Math.min(2000, this.delaiFrappe(p, v.texte) / 2) : 0;
    const tAff = souffleur
      ? Math.max(tPret + 100, req.tDecision + [1500, 4000, 7000, 9500, 12000][rang % 5])
      : Math.max(req.tAsr + this.delaiHumain(p, v.texte) - anticipation, tPret + 100);
    this.planifier(item, tAff);
  }

  /** Sans LLM (mode banque, disjoncteurs ouverts, erreur) : on puise dans les banques. */
  _n2Banque(req, personas) {
    if (this.etat.coupe || req.epoch !== this.epoch) return;
    const seg = this.segmentCourant();
    const tDec = Date.now();
    const base = { asr: req.tAsr, decision: req.tDecision ?? tDec };
    const nb = personas?.length || req.nb || 1;
    if (req.origine === 'souffleur') {
      // la régie a écrit l'intention : elle est reprise telle quelle par un seul persona (pas de reformulation sans IA)
      const p = (personas && personas[0]) || this.choisirPersonas(1, 'N3', { ignorerEcart: true })[0];
      if (!p || !req.intention) return;
      const v = this.preparer(couper(req.intention, 80), p, { origine: 'souffleur', ref: req.ref, fournisseur: 'banque', sansDoublon: true });
      if (!v.ok) { this.jeu.journalRegie(`souffleur : intention refusée par le filtre (${v.raison})`); return; }
      const item = { persona: p, texte: v.texte, origine: 'souffleur', ref: req.ref, fournisseur: 'banque', t: { ...base, filtre_ms: v.duree_ms, pret: Date.now() } };
      this.jeu.journalRegie('souffleur en mode banque : intention reprise telle quelle par ' + p.pseudo);
      if (req.validation || p.reagit.N2 === 0) this.mettreEnAttente(item); else this.planifier(item, Date.now() + 1500);
      return;
    }
    let lignes = [];
    if (req.evenement === 'relance') {
      lignes = seg.repliques.filter((r) => r.type === 'relance' && !this.n1Utilises.has(r.id));
      if (!lignes.length) {
        const p = this.choisirPersonas(1, 'N1', { ignorerEcart: true })[0];
        const tx = this._tirerVariante('relance', this.banques.reflexes.relance);
        if (p && tx) this._planifierBanque(p, styliser(tx, p), { origine: 'N0', ref: 'relance', delaiMs: hasard(800, 2500), t: base });
        return;
      }
      for (const r of lignes.slice(0, nb)) this._direN1(r, { delaiMs: hasard(800, 3000), ref: 'relance', ignorerEcart: true, t: base });
      return;
    }
    if (req.evenement === 'question_au_chat') {
      const dec = this.banques.reflexes.declencheurs.find((x) => x.id === 'question_chat');
      if (!dec) return;
      const humeur = this.humeurCle();
      const pool = [...dec.variantes, ...((dec.par_humeur || {})[humeur] || [])];
      const ps = personas?.length ? personas : this.choisirPersonas(nb, 'N1', { ignorerEcart: true });
      for (const p of ps) {
        const tx = this._tirerVariante('decl:question_chat', pool);
        if (tx) this._planifierBanque(p, styliser(tx, p), { origine: 'N0', ref: 'question:banque', tBase: req.tAsr, delaiMs: this.delaiHumain(p, tx), t: base });
      }
      return;
    }
    // fin d'énoncé : répliques libres du segment
    for (let i = 0; i < nb; i++) this._ambianceN1();
  }

  mettreEnAttente(item) {
    const id = 'a' + (++this.seq);
    this.attente.set(id, { item, ts: Date.now(), epoch: this.epoch });
    this.journal.ecrire({ e: 'attente', id, pid: item.persona.id, texte: item.texte, origine: item.origine });
    this.jeu.versRegie({ t: 'fig.attente', id, pid: item.persona.id, pseudo: item.persona.pseudo, texte: item.texte, origine: item.origine });
  }

  valider({ id, ok, texte }) {
    const a = this.attente.get(String(id));
    if (!a) { this.jeu.journalRegie(`validation ${id} : inconnue ou expirée`); return; }
    this.attente.delete(String(id));
    this.journal.ecrire({ e: 'validation', id, ok: !!ok, corrige: typeof texte === 'string' });
    if (!ok) return;
    if (this.etat.coupe) { this.jeu.journalRegie(`COUPE active : « ${a.item.texte} » n'est pas affiché`); return; }
    const p = a.item.persona;
    const brut = typeof texte === 'string' && texte.trim() ? texte : a.item.texte;
    const v = this.preparer(brut, p, { origine: a.item.origine, ref: a.item.ref, fournisseur: a.item.fournisseur, sansDoublon: true });
    if (!v.ok) { this.jeu.journalRegie(`validation ${id} refusée par le filtre (${v.raison})`); return; }
    const item = { ...a.item, texte: v.texte, regie: true, t: { ...a.item.t, filtre_ms: v.duree_ms } };
    this.planifier(item, Date.now() + hasard(300, 1200));
  }

  /** N4 « prendre la main » : la régie écrit à la place d'un persona (même filtre, pas de styliseur). */
  parleRegie({ persona, texte, ref = 'regie' }) {
    const p = this.persona(persona);
    if (!p) { this.jeu.journalRegie(`prendre la main : persona inconnu « ${String(persona).slice(0, 30)} »`); return false; }
    if (this.etat.coupe) { this.jeu.journalRegie(`COUPE active : message de ${p.pseudo} non envoyé`); return false; }
    const v = this.preparer(String(texte ?? ''), p, { origine: 'main', ref, fournisseur: 'regie', sansDoublon: true });
    if (!v.ok) { this.jeu.journalRegie(`message de ${p.pseudo} refusé par le filtre (${v.raison})`); return false; }
    const tNow = Date.now();
    this.planifier({ persona: p, texte: v.texte, origine: 'main', ref, fournisseur: 'regie', regie: true, t: { decision: tNow, filtre_ms: v.duree_ms, pret: tNow } }, tNow);
    return true;
  }

  lancerVague(cle) {
    if (this.etat.coupe) return;
    const V = this.banques.reflexes.vagues;
    const c = String(cle ?? '').slice(0, 40);
    const v = V.find((x) => x.cle === c) || V.find((x) => x.id === c) || V.find((x) => x.cle.toLowerCase() === c.toLowerCase());
    const d = DENSITES[this.etat.densite] || DENSITES.normal;
    const facteur = { silence: 0.6, calme: 0.6, normal: 0.8, chaud: 1, folie: 1.3 }[this.etat.densite] ?? 0.8;
    const variantes = v ? v.variantes : [c];
    const [a, b] = v ? v.taille : [5, 10];
    const n = Math.max(3, Math.round(hasard(a, b) * facteur));
    const personas = this.choisirPersonas(n, 'N0', { ignorerEcart: true });
    while (personas.length < n && personas.length) personas.push(choisir(personas));   // plus de messages que de personas : certains écrivent deux fois
    const tDec = Date.now();
    const [e0, e1] = v ? v.etalement_s : [0.5, 4];
    personas.forEach((p, k) => {
      let texte; let delai;
      if (v?.ordonnee) { const etape = Math.floor(k * variantes.length / n); texte = variantes[etape]; delai = etape * 1000 + hasard(0, 700); }
      else { texte = v?.copie_exacte ? variantes[0] : choisir(variantes); delai = hasard(e0, e1) * 1000; }
      this._planifierBanque(p, texte, { origine: 'N0', ref: 'vague:' + (v?.id || c), delaiMs: delai, vague: true, t: { decision: tDec } });
    });
    this.journal.ecrire({ e: 'vague', cle: c, connue: !!v, n, debit: d.debit });
  }

  changerSegment(id) {
    const ancien = this.segmentCourant();
    for (const r of ancien.repliques.filter((x) => x.type === 'fin' && !this.n1Utilises.has(x.id)).sort((x, y) => x.ordre - y.ordre).slice(0, 3)) {
      this._direN1(r, { delaiMs: hasard(300, 1500), ref: 'fin', ignorerEcart: true });
    }
    this.etat.segment = id;
    const s = this.banques.segments[id];
    if (s?.densite && DENSITES[s.densite]) this.etat.densite = s.densite;
    if (s?.humeur) this.etat.humeur = { valence: s.humeur.valence ?? 0, energie: s.humeur.energie ?? 0.5, etiquettes: Array.isArray(s.humeur.etiquettes) ? s.humeur.etiquettes.slice(0, 8) : [] };
    if (!s) { this.jeu.journalRegie(`segment « ${id} » absent des banques : ambiance N0 seulement`); return; }
    this.prechaufferPrompt();
    let t = 1500;
    for (const r of s.repliques.filter((x) => x.type === 'debut').sort((x, y) => x.ordre - y.ordre)) {
      this._direN1(r, { delaiMs: t, ref: 'debut', ignorerEcart: true });
      t += hasard(1800, 3500);
    }
  }

  top(id) {
    const c = String(id ?? '').slice(0, 40);
    const seg = this.segmentCourant();
    let lignes = seg.repliques.filter((r) => r.type === 'top' && r.top === c);
    if (!lignes.length) for (const s of Object.values(this.banques.segments)) lignes.push(...s.repliques.filter((r) => r.type === 'top' && r.top === c));
    if (!lignes.length) { this.jeu.journalRegie(`top « ${c} » : aucune réplique`); return; }
    let t = 800;
    for (const r of lignes.sort((x, y) => x.ordre - y.ordre)) { this._direN1(r, { delaiMs: t, ref: 'top:' + c, ignorerEcart: true }); t += hasard(1500, 3000); }
  }

  // ------------------------------------------------------------------ commandes de la régie

  commande(cmd) {
    if (!cmd || typeof cmd !== 'object') return false;
    const e = this.etat;
    if ('densite' in cmd) {
      if (!DENSITES[cmd.densite]) return false;
      e.densite = cmd.densite;
      if (cmd.densite === 'silence') this._annulerAmbiance();
      return true;
    }
    if ('humeur' in cmd) {
      const h = cmd.humeur || {};
      e.humeur = { valence: borne(Number(h.valence) || 0, -1, 1), energie: borne(Number(h.energie ?? 0.5), 0, 1),
        etiquettes: Array.isArray(h.etiquettes) ? h.etiquettes.filter((x) => typeof x === 'string').map((x) => x.slice(0, 20)).slice(0, 8) : [] };
      return true;
    }
    if ('dire' in cmd) {
      const d = cmd.dire || {};
      const intention = typeof d.intention === 'string' ? d.intention.trim().slice(0, 300) : '';
      if (!intention) return false;
      const nb = borne(parseInt(d.nb, 10) || 2, 1, 5);
      const personas = Array.isArray(d.personas) ? d.personas.map((x) => this.persona(x)).filter(Boolean).slice(0, 5) : null;
      this.demanderN2({ evenement: 'souffleur', origine: 'souffleur', nb, intention, validation: !!d.validation, tAsr: Date.now(), ref: 'souffleur', prioritaire: true, personas });
      return true;
    }
    if ('parle' in cmd) return this.parleRegie({ persona: cmd.parle?.persona, texte: cmd.parle?.texte, ref: 'parle' });
    if ('relance' in cmd) {
      this.demanderN2({ evenement: 'relance', origine: 'N2', nb: entier(1, 2), tAsr: Date.now(), ref: 'relance', prioritaire: true });
      return true;
    }
    if ('vague' in cmd) { this.lancerVague(cmd.vague); return true; }
    if ('chut' in cmd) {
      if (cmd.chut === false) { if (this.densiteAvantChut) e.densite = this.densiteAvantChut; return true; }
      this.densiteAvantChut = e.densite !== 'silence' ? e.densite : this.densiteAvantChut;
      e.densite = 'silence';
      this.annulerTout('chut');
      return true;
    }
    if ('coupe' in cmd) {
      e.coupe = !!cmd.coupe;
      if (e.coupe) {
        const n = this.annulerTout('coupe');
        const na = this.attente.size;
        for (const [id] of this.attente) this.journal.ecrire({ e: 'attente_abandonnee', id, raison: 'coupe' });
        this.attente.clear();
        this.jeu.journalRegie(`COUPE : ${n} réplique(s) planifiée(s) annulée(s)` + (na ? `, ${na} en attente abandonnée(s) (leur validation sera ignorée)` : ''));
      }
      return true;
    }
    if ('fournisseur' in cmd) {
      if (!['auto', 'ollama', 'anthropic', 'banque'].includes(cmd.fournisseur)) return false;
      e.fournisseur = cmd.fournisseur;
      if (cmd.fournisseur === 'anthropic' && !this.fournisseurs.anthropic?.disponible()) this.jeu.journalRegie('anthropic indisponible (pas de clé ANTHROPIC_API_KEY sur le serveur, ou budget atteint) : repli banque');
      return true;
    }
    if ('segment' in cmd) {
      const id = String(cmd.segment ?? '').trim().slice(0, 40);
      if (!id) return false;
      this.changerSegment(id);
      return true;
    }
    if ('marquage' in cmd) {
      if (!['masque', 'discret'].includes(cmd.marquage)) return false;
      e.marquage = cmd.marquage;
      return true;
    }
    if ('top' in cmd) { this.top(cmd.top); return true; }
    return false;
  }

  _annulerAmbiance() {
    for (const [id, pl] of this.planifies) if (pl.item.ambiance) { clearTimeout(pl.timer); this.planifies.delete(id); }
  }

  _menage() {
    const t = Date.now();
    while (this.histoFig.length && t - this.histoFig[0].ts > 180_000) this.histoFig.shift();
    for (const [id, a] of this.attente) {
      if (t - a.ts > this.config.expirationAttenteMs) {
        this.attente.delete(id);
        this.journal.ecrire({ e: 'attente_expiree', id });
        this.jeu.journalRegie(`réplique en attente ${id} expirée (${a.item.persona.pseudo} : « ${a.item.texte} ») : elle ne sera plus affichée`);
      }
    }
  }

  // ------------------------------------------------------------------ télémétrie

  nomFournisseur() {
    const f = this.choisirFournisseur();
    return f ? f.nom : 'banque';
  }

  statistiques() {
    const actif = this.nomFournisseur();
    const groupe = this.stats.par[actif] ? actif : (this.stats.par['*'] ? '*' : null);
    const lat = groupe ? this.stats.resume(groupe) : {};
    const disj = {};
    for (const [n, f] of Object.entries(this.fournisseurs)) if (f) disj[n] = { ...f.disjoncteur.resume(), disponible: f.disponible(), joignable: f.joignable ?? null };
    return { fournisseur: actif, lat, lat_par_fournisseur: Object.fromEntries(Object.keys(this.stats.par).map((k) => [k, this.stats.resume(k)])),
      cout_usd: +this.coutUsd.toFixed(5), doublons: this.compteurs.doublons, perimes: this.compteurs.perimes, appels: this.compteurs.appels,
      erreurs: this.compteurs.erreurs, planifies: this.planifies.size, attente: this.attente.size, disjoncteurs: disj };
  }
}
