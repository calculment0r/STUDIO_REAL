// Orchestrateur des figurants (port de orchestrateur.mjs ; étude §5.5, §6) : « metteur en scène déterministe + plume LLM ».
// Décide quand réagir, combien, quels personas, quel niveau ; le LLM n'écrit que les textes demandés.
//
// Niveaux : N0 réflexes (banque par humeur / déclencheur) · N1 répliques écrites par segment · N2 IA en réaction à la
// transcription · souffleur (`dire`, validation facultative) · main (la régie écrit à la place d'un persona).
// Chaque réplique : styliseur → garde-fou local → anti-répétition → planificateur (délai humain simulé) → hôte.diffuserChat
// (l'agent branché sur le serveur ; le serveur refiltre). COUPE incrémente l'époque : tout ce qui est planifié ou en vol est jeté.
//
// Différences avec le prototype : plus de modérateur ni de pseudos du public (le serveur filtre), l'hôte est une interface
// (`Hote`), le journal est une fonction, l'état de la mise en scène appartient à l'orchestrateur.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { hasard, entier, choisir, proba, choisirPondere, logNormale, melanger, borne } from './util';
import { styliser, compterEmojis, couper } from './styliseur';
import { quasiDoublon, cleTexte, jaccard } from './similarite';
import { construirePrompt, lireReplique } from './prompt';
import { StatsLatence, type Fournisseur } from './fournisseurs';
import { texteMotif } from './banques';
import { verifierLocal } from './filtre';
import type {
  Banques, Declencheur, EtatFigurants, Hote, Humeur, ItemReplique, Niveau, NomDensite, Persona, Replique, SegmentCourant,
} from './types';

export interface ParamDensite { debit: number; mix: [number, number, number]; q: number; e: number; k: number }

// Débit cible des figurants (msg/min, chat réel nul) et part N0/N1/N2 ; q = répliques N2 sur question au chat ;
// e = répliques N2 attendues par énoncé significatif ; k = facteur des rafales N0.
export const DENSITES: Record<NomDensite, ParamDensite> = {
  silence: { debit: 0, mix: [0, 0, 0], q: 0, e: 0, k: 0 },
  calme: { debit: 6, mix: [0.4, 0.3, 0.3], q: 2, e: 0.4, k: 0.4 },
  normal: { debit: 20, mix: [0.5, 0.2, 0.3], q: 3, e: 1, k: 0.7 },
  chaud: { debit: 45, mix: [0.6, 0.15, 0.25], q: 4, e: 1.5, k: 1 },
  folie: { debit: 90, mix: [0.7, 0.15, 0.15], q: 5, e: 2, k: 1.4 },
};
export const estDensite = (x: unknown): x is NomDensite => typeof x === 'string' && Object.prototype.hasOwnProperty.call(DENSITES, x);

const ANGLES = ['reaction', 'blague', 'question', 'doute', 'encouragement', 'conseil', 'moquerie_douce'];
const ANGLES_SOUFFLEUR = ['alerte_amicale', 'constat_bref', 'moquerie_douce', 'question', 'doute'];
const IDS_QUESTION = new Set(['question_chat', 'avis', 'oui_non', 'tapez_1']);
const RE_QUESTION = [/\b(le chat|les gars|les amis|tout le monde)\b/, /\bvous en pensez quoi\b/, /\b(dites|dis) moi\b/, /\bvotre avis\b/,
  /\bje (fais|prends|choisis|dis) quoi\b/, /\bou pas\b/, /\boui ou non\b/, /\b(est ce que|qu'est ce que) vous\b/,
  /\bvous (preferez|voulez|croyez|pensez|trouvez|savez|avez)\b/,
  // la transcription n'a souvent pas de « ? » : tournures orales de question en fin de phrase
  /\b(non|hein|ou quoi|ou bien|c est ca)$/, /\bje (le|la|les|l) ?\w+$/, /\bje (fais|prends|goute|suis|y vais|rentre|continue)\b.*$/];
const MOTS_MAX_IA = 12;

export type FournisseursOrch = { ollama?: Fournisseur | undefined; anthropic?: Fournisseur | undefined };

export interface ConfigOrchestrateur {
  acceleration: number;
  peremptionMs: number;
  maxAppelsMin: number;
  ollamaMode: 'multi' | 'parallele';
  expirationAttenteMs: number;
  ordreAuto?: ('anthropic' | 'ollama')[];
}

export interface OptionsOrchestrateur {
  banques: Banques;
  hote: Hote;
  fournisseurs?: FournisseursOrch;
  config?: Partial<ConfigOrchestrateur>;
  etat?: Partial<EtatFigurants>;
  journal?: (evt: Record<string, unknown>) => void;
}

interface Planifie { timer: ReturnType<typeof setTimeout>; item: ItemReplique; epoch: number }
interface DemandeN2 {
  evenement: string;
  origine: 'N2' | 'souffleur';
  nb: number;
  tAsr: number;
  ref: string;
  sur?: string;
  texte?: string;
  reaction?: boolean;
  intention?: string;
  validation?: boolean;
  prioritaire?: boolean;
  personas?: Persona[] | null;
  tDecision?: number;
  epoch?: number;
  rang?: number;
  acceptees?: number;
}
interface Enonce {
  debut: number; declenches: Set<string>; n1: Set<string>; n2: boolean; question: boolean; budgetN0: number; partiel?: string;
}
interface OptionsPreparer { origine: string; ref?: string | undefined; fournisseur?: string; sansDoublon?: boolean; iaBrute?: boolean }
interface OptionsBanque {
  origine: string; ref: string; delaiMs?: number; tBase?: number; ambiance?: boolean; t?: Record<string, number | undefined>;
  sansDoublon?: boolean; vague?: boolean; regie?: boolean;
}

export class Orchestrateur {
  readonly banques: Banques;
  readonly hote: Hote;
  readonly fournisseurs: FournisseursOrch;
  readonly config: ConfigOrchestrateur;
  readonly etat: EtatFigurants;
  private journalFn: (evt: Record<string, unknown>) => void;
  epoch = 0;
  private seq = 0;
  private planifies = new Map<number, Planifie>();
  private attente = new Map<string, { item: ItemReplique; ts: number; epoch: number }>();
  private enVol = new Set<AbortController>();
  private memoire = new Map<string, { derniers: string[]; prochainLibre: number }>();
  private histoFig: { texte: string; cle: string; ts: number }[] = [];
  private transcription: { texte: string; ts: number }[] = [];
  private enonce: Enonce | null = null;
  private dernierAsr = 0;
  private contagion = 0;
  private n1Utilises = new Set<string>();
  private n1LibresRecents: string[] = [];
  private variantesUtilisees = new Map<string, Set<string>>();
  private declencheursRecents = new Map<string, number>();
  private fileN2: DemandeN2[] = [];
  private reactionsEnVol = new Set<{ ctrl: AbortController; remplacee: boolean }>();
  private n2EnCours = 0;
  private appels: number[] = [];
  private densiteAvantChut: NomDensite | undefined;
  coutUsd = 0;
  readonly compteurs = { doublons: 0, perimes: 0, appels: 0, erreurs: 0, lignes_invalides: 0, annules: 0, rejets: 0, recopies: 0, emises: 0 };
  readonly stats = new StatsLatence();
  private minuteurs: ReturnType<typeof setInterval>[] = [];

  constructor({ banques, hote, fournisseurs = {}, config = {}, etat = {}, journal }: OptionsOrchestrateur) {
    this.banques = banques;
    this.hote = hote;
    this.fournisseurs = fournisseurs;
    this.journalFn = journal ?? (() => {});
    this.config = { acceleration: 2, peremptionMs: 10_000, maxAppelsMin: 30, ollamaMode: 'multi', expirationAttenteMs: 120_000, ...config };
    this.etat = {
      segment: banques.premierSegment(), densite: 'normal', humeur: { valence: 0.3, energie: 0.5, etiquettes: [] },
      coupe: false, fournisseur: 'auto', ...etat,
    };
  }

  private journal(evt: Record<string, unknown>): void { try { this.journalFn(evt); } catch { /* un journal fautif ne coupe rien */ } }

  demarrer(): void {
    this.minuteurs.push(setInterval(() => this.tickAmbiance(), 500));
    this.minuteurs.push(setInterval(() => this.menage(), 5000));
  }
  arreter(): void { for (const m of this.minuteurs) clearInterval(m); this.minuteurs = []; this.annulerTout('arret'); }

  // ------------------------------------------------------------------ personas

  personasActifs(): Persona[] {
    const seg = this.etat.segment;
    return this.banques.personas.filter(p => p.actif && (!p.presence || p.presence.includes(seg)));
  }
  persona(idOuPseudo: unknown): Persona | null {
    const k = String(idOuPseudo || '');
    return this.banques.personas.find(p => p.id === k || p.pseudo === k) || null;
  }
  private mem(pid: string) {
    let m = this.memoire.get(pid);
    if (!m) { m = { derniers: [], prochainLibre: 0 }; this.memoire.set(pid, m); }
    return m;
  }

  private densite(): ParamDensite { return DENSITES[this.etat.densite] ?? DENSITES.normal; }

  private ecartMin(p: Persona): number {
    const d = this.densite();
    const n = Math.max(1, this.personasActifs().length);
    return Math.min(20 / p.rythme.activite, Math.max(1.5, 0.5 * n * 60 / Math.max(1, d.debit))) * 1000;
  }

  /** Tire n personas distincts pour un niveau (poids reagit[niveau] × activité, en respectant l'écart minimal). */
  choisirPersonas(n: number, niveau: Niveau, { exclure = new Set<string>(), ignorerEcart = false } = {}): Persona[] {
    const t = Date.now();
    let cand = this.personasActifs().filter(p => !exclure.has(p.id) && (p.reagit[niveau] ?? 0.5) > 0);
    const libres = cand.filter(p => ignorerEcart || this.mem(p.id).prochainLibre <= t);
    if (libres.length >= n || !ignorerEcart) cand = libres.length ? libres : cand.filter(p => this.mem(p.id).prochainLibre <= t + 3000);
    const choisis: Persona[] = [];
    while (choisis.length < n && cand.length) {
      const p = choisirPondere(cand, x => (x.reagit[niveau] ?? 0.5) * (0.3 + x.rythme.activite));
      if (!p) break;
      choisis.push(p);
      cand = cand.filter(x => x !== p);
    }
    return choisis;
  }

  delaiHumain(p: Persona, texte: string, { niveau = 'N2' }: { niveau?: string } = {}): number {
    const [a, b] = p.rythme.reaction_s;
    const accel = borne(this.config.acceleration, 1, 3);
    const reaction = borne(logNormale((a + b) / 2, 0.35), a * 0.6, b * 1.8);
    const longueur = [...texte.replace(/\p{Extended_Pictographic}/gu, '')].length;
    const frappe = longueur / (p.rythme.frappe_cps * accel);
    const emoji = compterEmojis(texte) * 0.6 / accel;
    return (niveau === 'N0' ? reaction * 0.7 : reaction) * 1000 + (frappe + emoji) * 1000;
  }

  /** Charge le préfixe système du segment dans le cache d'Ollama (le 1er appel réel est alors à chaud). */
  async prechaufferPrompt(): Promise<void> {
    const f = this.fournisseurs.ollama;
    if (!f?.prechauffer || f.joignable === false || !['auto', 'ollama'].includes(this.etat.fournisseur) || this.n2EnCours) return;
    const p = this.personasActifs()[0];
    if (!p) return;
    const pr = construirePrompt(this.banques, {
      type: 'n2', mode: 'multi', segment: this.segmentCourant(), humeur: this.etat.humeur, distribution: this.personasActifs(),
      aEcrire: [{ persona: p, angle: 'reaction' }],
    });
    const t0 = Date.now();
    const ok = await f.prechauffer(pr.systeme);
    this.journal({ e: 'prechauffage', fournisseur: 'ollama', segment: this.etat.segment, ok, ms: Date.now() - t0 });
  }

  humeurCle(): string {
    const H = this.banques.reflexes.humeurs;
    const h = this.etat.humeur;
    const et = (h.etiquettes || []).map(x => texteMotif(x)).find(x => H[x]);
    if (et) return et;
    let best: string | null = null;
    let bd = Infinity;
    for (const [k, v] of Object.entries(H)) {
      if (!v.centre) continue;
      const d = (v.centre.valence - (h.valence ?? 0)) ** 2 + (v.centre.energie - (h.energie ?? 0.5)) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return best || (H.neutre ? 'neutre' : Object.keys(H)[0] ?? 'neutre');
  }

  segmentCourant(): SegmentCourant {
    const id = this.etat.segment;
    const s = this.banques.segments[id];
    return s ? { id, ...s } : { id, titre: id, ordre: 0, consigne: '', faits: [], interdits: [], humeur: null, densite: null, repliques: [] };
  }

  // ------------------------------------------------------------------ garde-fou + anti-répétition + planification

  /** Passe un texte de figurant au garde-fou local et à l'anti-répétition. */
  preparer(texte: string, p: Persona, { origine, ref, fournisseur, sansDoublon = false, iaBrute = false }: OptionsPreparer): { ok: boolean; texte: string; raison?: string } {
    const contexte = { origine, pid: p.id, ref, fournisseur };
    if (iaBrute && texte.split(/\s+/).filter(Boolean).length > MOTS_MAX_IA + 3) {   // +3 : tic et emoji ajoutés par le styliseur
      this.journal({ e: 'rejet', raison: 'mots', figurant: true, texte, ...contexte });
      this.compteurs.rejets++;
      return { ok: false, texte, raison: 'mots' };
    }
    const v = verifierLocal(texte, this.banques.interditsSegment[this.etat.segment]);
    if (!v.ok) {
      this.compteurs.rejets++;
      this.journal({ e: 'rejet', raison: v.raison, figurant: true, texte: v.texte.slice(0, 200), ...contexte });
      return v;
    }
    if (!sansDoublon) {
      const d = quasiDoublon(v.texte, this.histoFig);
      if (d) {
        this.compteurs.doublons++;
        this.journal({ e: 'doublon', texte: v.texte, avec: d.avec, score: d.score, ...contexte });
        return { ok: false, texte: v.texte, raison: 'doublon' };
      }
    }
    return v;
  }

  /** Planifie l'affichage d'une réplique déjà filtrée. */
  planifier(item: ItemReplique, tAffiche: number): number | null {
    if (this.etat.coupe) return null;
    const id = ++this.seq;
    const delai = Math.max(0, tAffiche - Date.now());
    item.t = { ...(item.t || {}), prevu: Math.round(tAffiche) };
    const timer = setTimeout(() => this.afficher(id), delai);
    this.planifies.set(id, { timer, item, epoch: this.epoch });
    this.histoFig.push({ texte: item.texte, cle: cleTexte(item.texte), ts: Date.now() });
    const m = this.mem(item.persona.id);
    m.prochainLibre = Math.max(m.prochainLibre, tAffiche + (item.regie ? 0 : this.ecartMin(item.persona)));
    return id;
  }

  private afficher(id: number): void {
    const pl = this.planifies.get(id);
    this.planifies.delete(id);
    if (!pl) return;
    if (this.etat.coupe || pl.epoch !== this.epoch) { this.compteurs.annules++; return; }
    const it = pl.item;
    const t = it.t || {};
    const maintenant = Date.now();
    const lat: Record<string, number> = {};
    if (t.asr != null && t.decision != null) lat.asr_decision = t.decision - t.asr;
    if (t.requete != null && t.premier_jeton != null) lat.premier_jeton = t.premier_jeton - t.requete;
    if (t.requete != null && t.ligne != null) lat.ligne = t.ligne - t.requete;
    if (t.filtre_ms != null) lat.filtre = t.filtre_ms;
    if (t.pret != null) lat.attente = maintenant - t.pret;
    if (t.asr != null) { lat.pret = (t.pret ?? maintenant) - t.asr; lat.total = maintenant - t.asr; }
    const p = it.persona;
    const publie = this.hote.diffuserChat({ ...it, t: { ...t, affiche: maintenant } });
    if (!publie) return;
    this.compteurs.emises++;
    const m = this.mem(p.id);
    m.derniers.push(it.texte);
    if (m.derniers.length > 5) m.derniers.shift();
    const groupe = ['N2', 'souffleur'].includes(it.origine) ? (it.fournisseur || 'banque') : 'reflexe';
    for (const [k, v] of Object.entries(lat)) this.stats.ajouter(groupe, k, v);
    if (!it.vague && !it.regie) this.contagion = Math.min(2, this.contagion + 0.25 * (1 + p.rythme.rafale));
  }

  annulerTout(raison: string): number {
    this.epoch++;
    let n = 0;
    for (const [, pl] of this.planifies) { clearTimeout(pl.timer); n++; }
    this.planifies.clear();
    for (const c of this.enVol) c.abort(new Error(raison));
    this.enVol.clear();
    this.fileN2 = [];
    this.journal({ e: 'annulation', raison, planifies: n });
    return n;
  }

  // ------------------------------------------------------------------ ambiance (débit cible)

  /** Un pas d'ambiance (appelé toutes les 500 ms par `demarrer`) ; public pour les tests. */
  tickAmbiance(): void {
    const d = DENSITES[this.etat.densite];
    this.contagion *= 0.85;
    if (!d || !d.debit || this.etat.coupe) return;
    const parole = Date.now() - this.dernierAsr < 20_000;
    const part = d.mix[0] + d.mix[1];
    const debit = parole ? d.debit * part : d.debit;
    let enAttente = 0;
    for (const [, pl] of this.planifies) if (pl.item.ambiance) enAttente++;
    if (enAttente > Math.max(2, d.debit / 10)) return;
    if (this.hote.debit() + this.planifies.size > d.debit * 1.2) return;     // les réactions ont déjà rempli la minute
    if (!proba(debit / 60 * 0.5 * (1 + this.contagion))) return;
    if (proba(d.mix[1] / part) && this.ambianceN1()) return;
    this.ambianceN0();
  }

  ambianceN0(p: Persona | null = null): boolean {
    const cle = this.humeurCle();
    const h = this.banques.reflexes.humeurs[cle];
    if (!h) return false;
    const perso = p ?? this.choisirPersonas(1, 'N0')[0];
    if (!perso) return false;
    const pool = [...h.variantes, ...(proba(0.25) ? h.emotes : [])];
    const texte = this.tirerVariante(`humeur:${cle}`, pool);
    if (!texte) return false;
    return this.planifierBanque(perso, h.stylisable ? styliser(texte, perso, { leger: false }) : texte, {
      origine: 'N0', ref: 'humeur:' + cle, delaiMs: hasard(300, 2500), ambiance: true,
    });
  }

  ambianceN1(): boolean {
    const seg = this.segmentCourant();
    let libres = seg.repliques.filter(r => r.type === 'libre' && !this.n1Utilises.has(r.id));
    if (!libres.length) {
      // réserve épuisée : remise en jeu en évitant les 20 dernières
      for (const r of seg.repliques) if (r.type === 'libre' && !this.n1LibresRecents.includes(r.id)) this.n1Utilises.delete(r.id);
      libres = seg.repliques.filter(r => r.type === 'libre' && !this.n1Utilises.has(r.id));
    }
    for (const r of melanger(libres).slice(0, 4)) {
      if (this.direN1(r, { delaiMs: hasard(500, 2500), ambiance: true, ref: 'n1:libre' })) {
        this.n1LibresRecents.push(r.id);
        if (this.n1LibresRecents.length > 20) this.n1LibresRecents.shift();
        return true;
      }
    }
    return false;
  }

  /** Dit une réplique N1 (persona attitré si présent et libre, sinon un autre pour une générique). */
  private direN1(r: Replique, { delaiMs = 0, tBase = Date.now(), ambiance = false, ref = 'n1', ignorerEcart = false, t = {} }:
    { delaiMs?: number; tBase?: number; ambiance?: boolean; ref?: string; ignorerEcart?: boolean; t?: Record<string, number | undefined> } = {}): boolean {
    let p: Persona | null = null;
    if (r.persona) {
      p = this.persona(r.persona);
      if (!p || !this.personasActifs().includes(p)) return false;
      if (!ignorerEcart && this.mem(p.id).prochainLibre > Date.now() + delaiMs) return false;
    } else {
      p = this.choisirPersonas(1, 'N1', { ignorerEcart })[0] ?? null;
      if (!p) return false;
    }
    const texte = r.persona ? couper(r.texte, 80) : styliser(r.texte, p);
    const ok = this.planifierBanque(p, texte, { origine: 'N1', ref: `${ref}:${r.id}`, delaiMs, tBase, ambiance, t, sansDoublon: !ambiance });
    if (ok) this.n1Utilises.add(r.id);
    return ok;
  }

  private planifierBanque(p: Persona, texte: string, { origine, ref, delaiMs = 0, tBase = Date.now(), ambiance = false, t = {}, sansDoublon = false, vague = false, regie = false }: OptionsBanque): boolean {
    if (this.etat.coupe) return false;
    const v = this.preparer(texte, p, { origine, ref, fournisseur: 'banque', sansDoublon: sansDoublon || vague });
    if (!v.ok) return false;
    const item: ItemReplique = {
      persona: p, texte: v.texte, origine, ref, fournisseur: 'banque', ambiance, vague, regie,
      t: { ...t, pret: Date.now() },
    };
    return this.planifier(item, Math.max(tBase + delaiMs, Date.now() + 50)) != null;
  }

  private tirerVariante(cle: string, pool: string[]): string | undefined {
    const k = `${this.etat.segment}:${cle}`;
    let deja = this.variantesUtilisees.get(k);
    if (!deja) { deja = new Set(); this.variantesUtilisees.set(k, deja); }
    let libres = pool.filter(x => !deja!.has(x));
    if (!libres.length) { deja.clear(); libres = pool.slice(); }
    const x = choisir(libres);
    if (x) deja.add(x);
    return x;
  }

  // ------------------------------------------------------------------ transcription
  // Le serveur ne transmet pas encore les transcriptions du comédien aux agents : cette entrée est prête (testée), pas branchée.

  onAsr({ kind, texte, ts, tc, tFinPhrase }: { kind: 'partiel' | 'final' | string; texte: string; ts: number; tc?: number; tFinPhrase?: number }): void {
    const t = texteMotif(texte);
    this.journal({ e: 'asr', kind, texte: String(texte).slice(0, 500), t_asr: ts, tc, tFinPhrase });
    if (!t) return;
    this.dernierAsr = ts;
    const e = this.enonce ||= {
      debut: ts, declenches: new Set(), n1: new Set(), n2: false, question: false,
      budgetN0: Math.ceil((DENSITES[this.etat.densite]?.debit || 0) / 6),    // plafond de densité : ≈ 10 s de débit cible par énoncé
    };
    if (this.etat.coupe) { if (kind === 'final') this.finEnonce(texte, ts); return; }
    const d = this.densite();
    const mots = t.split(' ').length;
    const seg = this.segmentCourant();

    // N0 : déclencheurs de reflexes.json (sur partiels et final ; pas deux fois par énoncé ni avant 8 s)
    const humeur = this.humeurCle();
    for (const dec of this.banques.reflexes.declencheurs) {
      if (e.declenches.has(dec.id) || dec.segments_exclus.includes(seg.id)) continue;
      if (!dec.motifs.some(m => m.test(t))) continue;
      e.declenches.add(dec.id);
      if (IDS_QUESTION.has(dec.id)) e.question = true;
      if (ts - (this.declencheursRecents.get(dec.id) || 0) < 8000) continue;
      this.declencheursRecents.set(dec.id, ts);
      if (!d.k) continue;
      e.budgetN0 -= this.rafaleN0(dec, humeur, ts, d, e.question, e.budgetN0);
    }
    // N1 : répliques « mot: » / « re: » du segment (une fois par représentation)
    for (const r of seg.repliques) {
      if (r.type !== 'mot' || e.n1.has(r.id) || this.n1Utilises.has(r.id) || !r.motif?.test(t)) continue;
      e.n1.add(r.id);
      const tDec = Date.now();
      this.direN1(r, { tBase: ts, delaiMs: hasard(900, 2500) + e.n1.size * 1200, ref: 'n1:' + r.quand, ignorerEcart: true, t: { asr: ts, decision: tDec } });
    }
    // N2 : question au chat détectée tôt (dès un partiel de 4 mots), sinon fin d'énoncé significative
    const tq = t.replace(/[\s.!?…]+$/, '');
    const question = e.question || /\?\s*$/.test(t) || RE_QUESTION.some(r => r.test(tq));
    if (question && !e.n2 && mots >= 4 && d.q > 0) {
      e.n2 = true;
      this.demanderN2({ evenement: 'question_au_chat', origine: 'N2', nb: d.q, tAsr: ts, ref: `asr:${kind}`, sur: kind, texte, reaction: true });
    }
    if (kind === 'final') {
      if (!e.n2 && mots >= 5 && d.e > 0) {
        const nb = Math.floor(d.e) + (proba(d.e % 1) ? 1 : 0);
        if (nb > 0) { e.n2 = true; this.demanderN2({ evenement: 'fin_enonce', origine: 'N2', nb, tAsr: ts, ref: 'asr:final', sur: kind, texte, reaction: true }); }
      }
      this.finEnonce(texte, ts);
    } else {
      e.partiel = texte;
    }
  }

  private finEnonce(texte: string, ts: number): void {
    this.transcription.push({ texte: String(texte).slice(0, 300), ts });
    while (this.transcription.length && ts - this.transcription[0]!.ts > 25_000) this.transcription.shift();
    this.enonce = null;
  }

  /** Ce qui a été dit avant ; les phrases de `sauf` (celles auxquelles on réagit) sont retirées, elles sont données à part. */
  private texteTranscription(sauf: string[] = []): string {
    const exclues = new Set(sauf);
    const parts = this.transcription.map(x => x.texte).filter(t => !exclues.has(t));
    if (this.enonce?.partiel && !exclues.has(this.enonce.partiel)) parts.push(this.enonce.partiel);
    return parts.join(' … ').slice(-500);
  }

  private rafaleN0(dec: Declencheur, humeur: string, tBase: number, d: ParamDensite, avecN2: boolean, budget = Infinity): number {
    let n = Math.round(hasard(dec.nb[0], dec.nb[1]) * d.k * (dec.priorite === 'haute' ? 1 : 0.8));
    if (avecN2) n = Math.ceil(n * 0.6);                  // place laissée aux réponses N2
    // plafond : « haute » en ignore une partie (au moins 2 messages), les autres s'arrêtent au budget
    n = Math.min(n, dec.priorite === 'haute' ? Math.max(2, budget) : budget);
    if (n <= 0) return 0;
    const pool = [...dec.variantes, ...((dec.par_humeur || {})[humeur] || [])];
    const personas = this.choisirPersonas(n, 'N0', { ignorerEcart: dec.priorite === 'haute' });
    const tDec = Date.now();
    for (const p of personas) {
      const texte = this.tirerVariante('decl:' + dec.id, pool);
      if (!texte) break;
      this.planifierBanque(p, dec.stylisable ? styliser(texte, p) : texte, {
        origine: 'N0', ref: 'decl:' + dec.id, tBase, delaiMs: hasard(dec.delai_s[0], dec.delai_s[1]) * 1000, t: { asr: tBase, decision: tDec },
      });
    }
    return personas.length;
  }

  // ------------------------------------------------------------------ N2 / souffleur

  choisirFournisseur(): Fournisseur | null {
    const ordres: Record<string, ('anthropic' | 'ollama')[]> = {
      auto: this.config.ordreAuto || ['anthropic', 'ollama'], ollama: ['ollama'], anthropic: ['anthropic'], banque: [],
    };
    const ordre = ordres[this.etat.fournisseur] || [];
    const t = Date.now();
    while (this.appels.length && t - this.appels[0]! > 60_000) this.appels.shift();
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

  demanderN2(req: DemandeN2): void {
    if (this.etat.coupe) return;
    req.tDecision = Date.now();
    req.epoch = this.epoch;
    const f = this.choisirFournisseur();
    if (!f) { this.n2Banque(req, null); return; }
    if (req.reaction) {
      // une nouvelle phrase du comédien rend obsolètes les réactions à la phrase d'avant :
      // on vide la file et on interrompt la génération en cours (sauf souffleur), sinon le chat répond en retard
      this.fileN2 = this.fileN2.filter(x => !x.reaction);
      for (const r of this.reactionsEnVol) { r.remplacee = true; r.ctrl.abort(); }
    }
    if (this.n2EnCours >= 1) {
      // une génération à la fois (Ollama sérialise de toute façon) ; on garde les demandes prioritaires et la plus récente
      this.fileN2 = this.fileN2.filter(x => x.prioritaire);
      this.fileN2.push(req);
      return;
    }
    void this.executerN2(req, f);
  }

  private suivantN2(): void {
    while (this.fileN2.length) {
      const req = this.fileN2.shift()!;
      if (req.epoch !== this.epoch || this.etat.coupe) continue;
      if (!req.prioritaire && Date.now() - (req.tDecision ?? 0) > 4000) { this.n2Banque(req, null); continue; }
      const f = this.choisirFournisseur();
      if (!f) { this.n2Banque(req, null); continue; }
      void this.executerN2(req, f);
      return;
    }
  }

  private async executerN2(req: DemandeN2, f: Fournisseur): Promise<void> {
    const souffleur = req.origine === 'souffleur';
    const niveau: Niveau = souffleur ? 'N3' : 'N2';
    const personas = req.personas?.length ? req.personas : this.choisirPersonas(req.nb, niveau, { ignorerEcart: souffleur || req.evenement === 'question_au_chat' });
    if (!personas.length) return;
    const angles = souffleur ? melanger(ANGLES_SOUFFLEUR) : (req.evenement === 'question_au_chat' ? ['reponse_question', ...melanger(ANGLES)] : (req.evenement === 'relance' ? ['question', 'conseil', 'encouragement'] : melanger(ANGLES)));
    const aEcrire = personas.map((p, i) => ({ persona: p, angle: angles[i % angles.length]! }));
    const seg = this.segmentCourant();
    let dernierePhrase = req.texte || this.transcription.at(-1)?.texte || '';
    // La transcription découpe au silence : une phrase courte (« vous en pensez quoi ? ») n'a de sens qu'avec
    // ce qui précède. On y recolle les phrases des 8 dernières secondes.
    const recentes = dernierePhrase.split(/\s+/).length < 8
      ? this.transcription.filter(x => x.ts >= (req.tAsr || Date.now()) - 8000 && x.texte !== dernierePhrase) : [];
    if (recentes.length) dernierePhrase = [...recentes.map(x => x.texte), dernierePhrase].join(' ');
    const base = {
      type: souffleur ? 'souffleur' as const : 'n2' as const, segment: seg, humeur: this.etat.humeur,
      // Anthropic : tous les personas du segment (préfixe système identique, donc en cache) ;
      // Ollama : seulement ceux de l'appel, un petit modèle se perd dans 19 fiches
      distribution: f.nom === 'ollama' ? personas : this.personasActifs(), leger: f.nom === 'ollama',
      transcription: this.texteTranscription(recentes.length ? recentes.map(x => x.texte) : [dernierePhrase]), dernierePhrase, evenement: req.evenement,
      chatReel: this.hote.chatHumainsRecents(12), dejaDit: this.histoFig.slice(-20).map(x => x.texte),
      ...(req.intention !== undefined ? { intention: req.intention } : {}),
    };
    this.n2EnCours++;
    this.compteurs.appels++;
    this.appels.push(Date.now());
    const ctrl = new AbortController();
    this.enVol.add(ctrl);
    const vol = { ctrl, remplacee: false };
    if (req.reaction) this.reactionsEnVol.add(vol);
    const epoch = this.epoch;
    const servis = new Set<string>();
    const tRequete = Date.now();
    let tPremiereLigne: number | null = null;
    let version = '';
    req.rang = 0;
    req.acceptees = 0;
    const onLigne = (lot: Persona[]) => (obj: unknown, tLigne: number, tPremier: number | null) => {
      if (epoch !== this.epoch || this.etat.coupe || vol.remplacee) return;
      const r = lireReplique(obj);
      const p = r && lot.find(x => x.id === r.persona || x.pseudo === r.persona);
      if (!r || !p || servis.has(p.id)) { this.compteurs.lignes_invalides++; this.journal({ e: 'ligne_invalide', fournisseur: f.nom, obj: obj ?? null }); return; }
      servis.add(p.id);
      if (tPremiereLigne === null) tPremiereLigne = tLigne;
      this.ligneN2(req, p, r.texte, { fournisseur: f.nom, tRequete, tLigne, tPremier, version });
    };
    try {
      let res: { t_premier_jeton: number | null; t_fin: number; jetons_entree: number; jetons_sortie: number; cout_usd: number; machine?: string };
      if (f.nom === 'ollama' && this.config.ollamaMode === 'parallele') {
        // N requêtes d'une réplique (gabarits n2.qwen.*), lancées ensemble
        const rs = await Promise.all(aEcrire.map(async a => {
          const pr = construirePrompt(this.banques, { ...base, mode: 'unique', aEcrire: [a] });
          version = pr.version;
          return f.generer({ systeme: pr.systeme, utilisateur: pr.utilisateur, nb: 1, signal: ctrl.signal, onLigne: onLigne([a.persona]) });
        }));
        res = {
          t_premier_jeton: Math.min(...rs.map(x => x.t_premier_jeton ?? Infinity)), t_fin: Math.max(...rs.map(x => x.t_fin)),
          jetons_entree: rs.reduce((s, x) => s + x.jetons_entree, 0), jetons_sortie: rs.reduce((s, x) => s + x.jetons_sortie, 0), cout_usd: 0,
        };
      } else {
        const pr = construirePrompt(this.banques, { ...base, mode: 'multi', aEcrire });
        version = pr.version;
        res = await f.generer({ systeme: pr.systeme, utilisateur: pr.utilisateur, nb: aEcrire.length, signal: ctrl.signal, onLigne: onLigne(personas) });
      }
      this.coutUsd += res.cout_usd || 0;
      this.journal({
        e: 'n2_appel', fournisseur: f.nom, machine: res.machine ?? null, mode: f.nom === 'ollama' ? this.config.ollamaMode : 'multi', evenement: req.evenement,
        nb: aEcrire.length, servis: servis.size, t_asr: req.tAsr, t_decision: req.tDecision, t_requete: tRequete,
        t_premier_jeton: Number.isFinite(res.t_premier_jeton) ? res.t_premier_jeton : null, t_premiere_ligne: tPremiereLigne, t_fin: res.t_fin,
        jetons_entree: res.jetons_entree, jetons_sortie: res.jetons_sortie, cout_usd: res.cout_usd || 0, version,
      });
      if (servis.size === 0) this.signalerDisjoncteur(f, f.disjoncteur.echec('aucune ligne valide'));
      else this.signalerDisjoncteur(f, f.disjoncteur.succes((tPremiereLigne ?? tRequete) - tRequete));
      // toutes les lignes refusées (filtre, doublon, péremption) : la banque prend le relais
      if (req.acceptees === 0 && epoch === this.epoch) {
        this.journal({ e: 'n2_vide', fournisseur: f.nom, evenement: req.evenement, servis: servis.size });
        this.n2Banque(req, personas);
      }
    } catch (err) {
      const coupe = epoch !== this.epoch || this.etat.coupe || vol.remplacee;
      const message = String((err as Error)?.message || err).slice(0, 200);
      this.journal({ e: coupe ? 'n2_annule' : 'n2_erreur', fournisseur: f.nom, erreur: message, servis: servis.size });
      if (!coupe) {
        this.compteurs.erreurs++;
        this.signalerDisjoncteur(f, f.disjoncteur.echec(message.slice(0, 80)));
        const restants = personas.filter(p => !servis.has(p.id));
        if (restants.length && Date.now() - req.tAsr < 6000) this.n2Banque(req, restants);
      }
    } finally {
      this.enVol.delete(ctrl);
      this.reactionsEnVol.delete(vol);
      this.n2EnCours--;
      this.suivantN2();
    }
  }

  private signalerDisjoncteur(f: Fournisseur, transition: 'ouvert' | 'ferme' | null): void {
    if (!transition) return;
    const r = f.disjoncteur.resume();
    this.journal({ e: 'disjoncteur', fournisseur: f.nom, ...r });
    this.hote.journalRegie(transition === 'ouvert' ? `disjoncteur ${f.nom} OUVERT (${r.raison}) : repli sur le fournisseur suivant` : `disjoncteur ${f.nom} refermé`);
  }

  private ligneN2(req: DemandeN2, p: Persona, texteBrut: string, { fournisseur, tRequete, tLigne, tPremier, version }:
    { fournisseur: string; tRequete: number; tLigne: number; tPremier: number | null; version: string }): void {
    const souffleur = req.origine === 'souffleur';
    // Une réplique d'IA qui ne fait que recopier un exemple de la fiche du persona n'a rien à voir avec la phrase :
    // on la jette (la banque N0/N1 sait déjà dire ces phrases-là, plus vite).
    if (!souffleur) {
      const cle = cleTexte(texteBrut);
      const exemple = (p.voix?.exemples || []).find(e => jaccard(cle, cleTexte(e)) >= 0.5);
      if (exemple) { this.compteurs.recopies++; this.journal({ e: 'n2_recopie', pid: p.id, texte: texteBrut, exemple }); return; }
    }
    const texte = styliser(texteBrut, p);
    const v = this.preparer(texte, p, { origine: req.origine, ref: req.ref, fournisseur, iaBrute: true });
    if (!v.ok) return;
    const tPret = Date.now();
    if (!souffleur && tPret - req.tAsr > this.config.peremptionMs) {
      this.compteurs.perimes++;
      this.journal({ e: 'perime', texte: v.texte, pid: p.id, age_ms: tPret - req.tAsr, fournisseur });
      return;
    }
    const item: ItemReplique = {
      persona: p, texte: v.texte, origine: req.origine, ref: req.ref, fournisseur, version, brut: texteBrut,
      t: { asr: req.tAsr, decision: req.tDecision, requete: tRequete, premier_jeton: tPremier ?? undefined, ligne: tLigne, pret: tPret },
    };
    req.acceptees = (req.acceptees ?? 0) + 1;
    if (souffleur && (req.validation || p.reagit.N2 === 0)) { this.mettreEnAttente(item); return; }
    const rang = req.rang ?? 0;
    req.rang = rang + 1;
    // Les vrais spectateurs tapent pendant que le streamer parle : la première réponse sort dès qu'elle est prête,
    // les suivantes s'étalent (≈ 0,9 s d'écart), et le délai humain simulé est plafonné à 1,8 s + 0,9 s par rang.
    const humain = Math.min(this.delaiHumain(p, v.texte), 1800 + rang * 900);
    const tAff = souffleur
      ? Math.max(tPret + 100, (req.tDecision ?? tPret) + [1500, 4000, 7000, 9500, 12000][rang % 5]!)
      : Math.max(req.tAsr + humain, tPret + 100 + rang * 600);
    this.planifier(item, tAff);
  }

  /** Sans LLM (mode banque, disjoncteurs ouverts, erreur) : on puise dans les banques. */
  private n2Banque(req: DemandeN2, personas: Persona[] | null): void {
    if (this.etat.coupe || req.epoch !== this.epoch) return;
    const seg = this.segmentCourant();
    const tDec = Date.now();
    const base = { asr: req.tAsr, decision: req.tDecision ?? tDec };
    const nb = personas?.length || req.nb || 1;
    if (req.origine === 'souffleur') {
      // la régie a écrit l'intention : elle est reprise telle quelle par un seul persona (pas de reformulation sans IA)
      // (le prototype ignorait les personas demandés ici : on les respecte)
      const p = (personas && personas[0]) || req.personas?.[0] || this.choisirPersonas(1, 'N3', { ignorerEcart: true })[0];
      if (!p || !req.intention) return;
      const v = this.preparer(couper(req.intention, 80), p, { origine: 'souffleur', ref: req.ref, fournisseur: 'banque', sansDoublon: true });
      if (!v.ok) { this.hote.journalRegie(`souffleur : intention refusée par le filtre (${v.raison})`); return; }
      const item: ItemReplique = { persona: p, texte: v.texte, origine: 'souffleur', ref: req.ref, fournisseur: 'banque', t: { ...base, pret: Date.now() } };
      this.hote.journalRegie('souffleur en mode banque : intention reprise telle quelle par ' + p.pseudo);
      if (req.validation || p.reagit.N2 === 0) this.mettreEnAttente(item); else this.planifier(item, Date.now() + 1500);
      return;
    }
    if (req.evenement === 'relance') {
      const lignes = seg.repliques.filter(r => r.type === 'relance' && !this.n1Utilises.has(r.id));
      if (!lignes.length) {
        const p = this.choisirPersonas(1, 'N1', { ignorerEcart: true })[0];
        const tx = this.tirerVariante('relance', this.banques.reflexes.relance);
        if (p && tx) this.planifierBanque(p, styliser(tx, p), { origine: 'N0', ref: 'relance', delaiMs: hasard(800, 2500), t: base });
        return;
      }
      for (const r of lignes.slice(0, nb)) this.direN1(r, { delaiMs: hasard(800, 3000), ref: 'relance', ignorerEcart: true, t: base });
      return;
    }
    if (req.evenement === 'question_au_chat') {
      const dec = this.banques.reflexes.declencheurs.find(x => x.id === 'question_chat');
      if (!dec) return;
      const humeur = this.humeurCle();
      const pool = [...dec.variantes, ...((dec.par_humeur || {})[humeur] || [])];
      const ps = personas?.length ? personas : this.choisirPersonas(nb, 'N1', { ignorerEcart: true });
      for (const p of ps) {
        const tx = this.tirerVariante('decl:question_chat', pool);
        if (tx) this.planifierBanque(p, styliser(tx, p), { origine: 'N0', ref: 'question:banque', tBase: req.tAsr, delaiMs: this.delaiHumain(p, tx), t: base });
      }
      return;
    }
    // fin d'énoncé : répliques libres du segment
    for (let i = 0; i < nb; i++) this.ambianceN1();
  }

  private mettreEnAttente(item: ItemReplique): void {
    const id = 'a' + (++this.seq);
    this.attente.set(id, { item, ts: Date.now(), epoch: this.epoch });
    this.journal({ e: 'attente', id, pid: item.persona.id, texte: item.texte, origine: item.origine });
    this.hote.versRegie({ type: 'attente', id, pid: item.persona.id, pseudo: item.persona.pseudo, texte: item.texte, origine: item.origine });
  }

  /** Décision de la régie sur une réplique en attente. Renvoie faux si l'identifiant est inconnu ou expiré. */
  valider({ id, ok, texte }: { id: unknown; ok: unknown; texte?: unknown }): boolean {
    const cle = String(id);
    const a = this.attente.get(cle);
    if (!a) { this.hote.journalRegie(`validation ${cle} : inconnue ou expirée`); return false; }
    this.attente.delete(cle);
    this.journal({ e: 'validation', id: cle, ok: !!ok, corrige: typeof texte === 'string' });
    if (!ok) return true;
    if (this.etat.coupe) { this.hote.journalRegie(`COUPE active : « ${a.item.texte} » n'est pas affiché`); return true; }
    const p = a.item.persona;
    const brut = typeof texte === 'string' && texte.trim() ? texte : a.item.texte;
    const v = this.preparer(brut, p, { origine: a.item.origine, ref: a.item.ref ?? undefined, fournisseur: a.item.fournisseur ?? 'banque', sansDoublon: true });
    if (!v.ok) { this.hote.journalRegie(`validation ${cle} refusée par le filtre (${v.raison})`); return true; }
    const item: ItemReplique = { ...a.item, texte: v.texte, regie: true };
    this.planifier(item, Date.now() + hasard(300, 1200));
    return true;
  }

  /** N4 « prendre la main » : la régie écrit à la place d'un persona (même garde-fou, pas de styliseur). */
  parleRegie({ persona, texte, ref = 'regie' }: { persona: unknown; texte: unknown; ref?: string }): boolean {
    const p = this.persona(persona);
    if (!p) { this.hote.journalRegie(`prendre la main : persona inconnu « ${String(persona).slice(0, 30)} »`); return false; }
    if (this.etat.coupe) { this.hote.journalRegie(`COUPE active : message de ${p.pseudo} non envoyé`); return false; }
    const v = this.preparer(String(texte ?? ''), p, { origine: 'main', ref, fournisseur: 'regie', sansDoublon: true });
    if (!v.ok) { this.hote.journalRegie(`message de ${p.pseudo} refusé par le filtre (${v.raison})`); return false; }
    const tNow = Date.now();
    this.planifier({ persona: p, texte: v.texte, origine: 'main', ref, fournisseur: 'regie', regie: true, t: { decision: tNow, pret: tNow } }, tNow);
    return true;
  }

  lancerVague(cle: unknown): void {
    if (this.etat.coupe) return;
    const V = this.banques.reflexes.vagues;
    const c = String(cle ?? '').slice(0, 40);
    const v = V.find(x => x.cle === c) || V.find(x => x.id === c) || V.find(x => x.cle.toLowerCase() === c.toLowerCase());
    const d = this.densite();
    const facteur = ({ silence: 0.6, calme: 0.6, normal: 0.8, chaud: 1, folie: 1.3 } as Record<string, number>)[this.etat.densite] ?? 0.8;
    const variantes = v ? v.variantes : [c];
    const [a, b] = v ? v.taille : [5, 10];
    const n = Math.max(3, Math.round(hasard(a, b) * facteur));
    const personas = this.choisirPersonas(n, 'N0', { ignorerEcart: true });
    while (personas.length < n && personas.length) personas.push(choisir(personas)!);   // plus de messages que de personas : certains écrivent deux fois
    const tDec = Date.now();
    const [e0, e1] = v ? v.etalement_s : [0.5, 4];
    personas.forEach((p, k) => {
      let texte: string;
      let delai: number;
      if (v?.ordonnee) { const etape = Math.floor(k * variantes.length / n); texte = variantes[etape] ?? c; delai = etape * 1000 + hasard(0, 700); }
      else { texte = v?.copie_exacte ? (variantes[0] ?? c) : (choisir(variantes) ?? c); delai = hasard(e0, e1) * 1000; }
      this.planifierBanque(p, texte, { origine: 'N0', ref: 'vague:' + (v?.id || c), delaiMs: delai, vague: true, t: { decision: tDec } });
    });
    this.journal({ e: 'vague', cle: c, connue: !!v, n, debit: d.debit });
  }

  changerSegment(id: string): void {
    const ancien = this.segmentCourant();
    for (const r of ancien.repliques.filter(x => x.type === 'fin' && !this.n1Utilises.has(x.id)).sort((x, y) => x.ordre - y.ordre).slice(0, 3)) {
      this.direN1(r, { delaiMs: hasard(300, 1500), ref: 'fin', ignorerEcart: true });
    }
    this.etat.segment = id;
    const s = this.banques.segments[id];
    if (s?.densite && estDensite(s.densite)) this.etat.densite = s.densite;
    if (s?.humeur) {
      const h = s.humeur as Record<string, any>;
      this.etat.humeur = { valence: h.valence ?? 0, energie: h.energie ?? 0.5, etiquettes: Array.isArray(h.etiquettes) ? h.etiquettes.slice(0, 8) : [] };
    }
    if (!s) { this.hote.journalRegie(`segment « ${id} » absent des banques : ambiance N0 seulement`); return; }
    void this.prechaufferPrompt();
    let t = 1500;
    for (const r of s.repliques.filter(x => x.type === 'debut').sort((x, y) => x.ordre - y.ordre)) {
      this.direN1(r, { delaiMs: t, ref: 'debut', ignorerEcart: true });
      t += hasard(1800, 3500);
    }
  }

  top(id: unknown): void {
    const c = String(id ?? '').slice(0, 40);
    const seg = this.segmentCourant();
    const lignes: Replique[] = seg.repliques.filter(r => r.type === 'top' && r.top === c);
    if (!lignes.length) for (const s of Object.values(this.banques.segments)) lignes.push(...s.repliques.filter(r => r.type === 'top' && r.top === c));
    if (!lignes.length) { this.hote.journalRegie(`top « ${c} » : aucune réplique`); return; }
    let t = 800;
    for (const r of lignes.sort((x, y) => x.ordre - y.ordre)) { this.direN1(r, { delaiMs: t, ref: 'top:' + c, ignorerEcart: true }); t += hasard(1500, 3000); }
  }

  // ------------------------------------------------------------------ commandes de la régie

  /** Une commande à une clé (`densite`, `humeur`, `dire`, `segment`…) ; faux si elle est inconnue ou invalide. */
  commande(cmd: unknown): boolean {
    if (!cmd || typeof cmd !== 'object') return false;
    const c = cmd as Record<string, any>;
    const e = this.etat;
    if ('densite' in c) {
      if (!estDensite(c.densite)) return false;
      e.densite = c.densite;
      if (c.densite === 'silence') this.annulerAmbiance();
      return true;
    }
    if ('humeur' in c) {
      const h = c.humeur || {};
      e.humeur = {
        valence: borne(Number(h.valence) || 0, -1, 1), energie: borne(Number(h.energie ?? 0.5), 0, 1),
        etiquettes: Array.isArray(h.etiquettes) ? h.etiquettes.filter((x: unknown) => typeof x === 'string').map((x: string) => x.slice(0, 20)).slice(0, 8) : [],
      } satisfies Humeur;
      return true;
    }
    if ('dire' in c) {
      const d = c.dire || {};
      const intention = typeof d.intention === 'string' ? d.intention.trim().slice(0, 300) : '';
      if (!intention) return false;
      const nb = borne(parseInt(d.nb, 10) || 2, 1, 5);
      const personas = Array.isArray(d.personas) ? d.personas.map((x: unknown) => this.persona(x)).filter((x: Persona | null): x is Persona => !!x).slice(0, 5) : null;
      this.demanderN2({ evenement: 'souffleur', origine: 'souffleur', nb, intention, validation: !!d.validation, tAsr: Date.now(), ref: 'souffleur', prioritaire: true, personas });
      return true;
    }
    if ('parle' in c) return this.parleRegie({ persona: c.parle?.persona, texte: c.parle?.texte, ref: 'parle' });
    if ('relance' in c) {
      this.demanderN2({ evenement: 'relance', origine: 'N2', nb: entier(1, 2), tAsr: Date.now(), ref: 'relance', prioritaire: true });
      return true;
    }
    if ('vague' in c) { this.lancerVague(c.vague); return true; }
    if ('chut' in c) {
      if (c.chut === false) { if (this.densiteAvantChut) e.densite = this.densiteAvantChut; return true; }
      this.densiteAvantChut = e.densite !== 'silence' ? e.densite : this.densiteAvantChut;
      e.densite = 'silence';
      this.annulerTout('chut');
      return true;
    }
    if ('coupe' in c) {
      e.coupe = !!c.coupe;
      if (e.coupe) {
        const n = this.annulerTout('coupe');
        const na = this.attente.size;
        for (const [id] of this.attente) this.journal({ e: 'attente_abandonnee', id, raison: 'coupe' });
        this.attente.clear();
        this.hote.journalRegie(`COUPE : ${n} réplique(s) planifiée(s) annulée(s)` + (na ? `, ${na} en attente abandonnée(s) (leur validation sera ignorée)` : ''));
      }
      return true;
    }
    if ('fournisseur' in c) {
      if (!['auto', 'ollama', 'anthropic', 'banque'].includes(c.fournisseur)) return false;
      e.fournisseur = c.fournisseur;
      if (c.fournisseur === 'anthropic' && !this.fournisseurs.anthropic?.disponible()) this.hote.journalRegie('anthropic indisponible (pas de clé ANTHROPIC_API_KEY, ou budget atteint) : repli banque');
      return true;
    }
    if ('segment' in c) {
      const id = String(c.segment ?? '').trim().slice(0, 40);
      if (!id) return false;
      this.changerSegment(id);
      return true;
    }
    if ('top' in c) { this.top(c.top); return true; }
    if ('chauffe' in c) { void this.chauffe(); return true; }
    return false;
  }

  /** Contrôle de chauffe des machines Ollama (avant le lever de rideau, ou sur demande de la régie). */
  async chauffe(): Promise<Record<string, unknown>[]> {
    const f = this.fournisseurs.ollama;
    if (!f?.chauffe) return [];
    this.hote.journalRegie('contrôle de chauffe des machines…');
    const rs = [await f.chauffe()];
    this.journal({ e: 'chauffe', machines: rs });
    for (const r of rs as Record<string, any>[]) {
      this.hote.journalRegie(r.etat === 'pret'
        ? `${r.machine} (${r.modele}) PRÊTE : 1er mot ${r.premier_jeton_ms} ms, réplique ${r.total_ms} ms`
        : `${r.machine} (${r.modele}) ${String(r.etat).toUpperCase()} : ${r.raison || 'réponse inattendue'}`);
    }
    return rs;
  }

  private annulerAmbiance(): void {
    for (const [id, pl] of this.planifies) if (pl.item.ambiance) { clearTimeout(pl.timer); this.planifies.delete(id); }
  }

  private menage(): void {
    const t = Date.now();
    while (this.histoFig.length && t - this.histoFig[0]!.ts > 180_000) this.histoFig.shift();
    for (const [id, a] of this.attente) {
      if (t - a.ts > this.config.expirationAttenteMs) {
        this.attente.delete(id);
        this.journal({ e: 'attente_expiree', id });
        this.hote.journalRegie(`réplique en attente ${id} expirée (${a.item.persona.pseudo} : « ${a.item.texte} ») : elle ne sera plus affichée`);
      }
    }
  }

  // ------------------------------------------------------------------ télémétrie

  /** Le fournisseur qui répondrait maintenant ('banque' si aucun n'est utilisable). */
  nomFournisseur(): string {
    const f = this.choisirFournisseur();
    return f ? f.nom : 'banque';
  }

  nbEnAttente(): number { return this.attente.size; }
  nbPlanifies(): number { return this.planifies.size; }

  statistiques() {
    const actif = this.nomFournisseur();
    const groupe = this.stats.par[actif] ? actif : (this.stats.par['*'] ? '*' : null);
    const lat = groupe ? this.stats.resume(groupe) : {};
    const disj: Record<string, unknown> = {};
    for (const [n, f] of Object.entries(this.fournisseurs)) if (f) disj[n] = { ...f.disjoncteur.resume(), disponible: f.disponible(), joignable: f.joignable ?? null };
    return {
      fournisseur: actif, lat, cout_usd: +this.coutUsd.toFixed(5), doublons: this.compteurs.doublons, perimes: this.compteurs.perimes,
      appels: this.compteurs.appels, erreurs: this.compteurs.erreurs, planifies: this.planifies.size, attente: this.attente.size, disjoncteurs: disj,
    };
  }
}
