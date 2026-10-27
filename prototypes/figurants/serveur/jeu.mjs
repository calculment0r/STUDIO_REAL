// Mini serveur de jeu (PROTOCOLE.md) : clients par rôle, état, historique, idempotence des `msg`,
// diffusion des `chat` avec retrait des champs secrets selon le rôle. C'est le SEUL endroit qui diffuse un `chat`,
// et il refiltre tout texte (humain ou figurant) avant diffusion : aucune voie de contournement.

import fs from 'node:fs';
import { Fenetre } from './util.mjs';
import { FluxAsr } from './asr-flux.mjs';

const ROLES = new Set(['chat', 'regie', 'comedien', 'telephone']);
const COULEURS_HUMAINS = ['--cy', '--or', '--grn2', '--amb', '--coral-3', '--ink2', '--coral-2'];
const CHAMPS_PUBLICS = ['t', 'id', 'pseudo', 'couleur', 'texte', 'ts', 'grand'];   // grand : commentaire d'un spectateur (plus gros à l'écran)

function hache(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export class Jeu {
  constructor({ moderateur, journal, banques, etatInitial = {}, jetonRegie = null, asrUrl = null, fichierPropositions = null }) {
    this.moderateur = moderateur; this.journal = journal; this.banques = banques;
    this.fichierPropositions = fichierPropositions;   // propositions.json : phrases et émojis à toucher, par segment (relu à chaque changement)
    this.jetonRegie = jetonRegie;
    this.asrUrl = asrUrl;              // service Whisper : le micro du comédien arrive en binaire sur /ws
    this.clients = new Map();          // ws → client
    this.historique = [];              // chats complets (200 derniers)
    this.vus = new Map();              // clé client → Set(cseq)
    this.seq = 0;
    this.prefixe = Date.now().toString(36);
    this.affichages = [];              // {ts, fig} pour le débit
    this.etat = { segment: banques.premierSegment(), densite: 'normal', humeur: { valence: 0.3, energie: 0.5, etiquettes: [] },
      marquage: 'masque', coupe: false, fournisseur: 'auto', ...etatInitial };
    this.orchestrateur = null;
    this.latFiltreHumains = new Fenetre(100);
  }

  // ------------------------------------------------------------------ connexions

  ajouter(ws, ip) {
    const c = { ws, role: null, pseudo: null, cle: null, couleur: null, ip, fenetre: [], nMsg: [] };
    this.clients.set(ws, c);
    return c;
  }
  retirer(ws) { this.clients.get(ws)?.flux?.fermer(); this.clients.delete(ws); }

  /** Audio brut du micro du comédien (PCM 16 bits, mono, 16 kHz) → transcription Whisper côté serveur. */
  recevoirAudio(c, buf) {
    if (c.role !== 'comedien' || !this.asrUrl) return;
    c.flux ||= new FluxAsr({
      url: this.asrUrl,
      onAsr: (m) => this._asr(c, m),
      journal: (e) => this.journal.ecrire(e),
      onEtat: (etat, detail) => {
        this.envoyer(c, { t: 'asr.etat', etat, detail });
        if (etat === 'erreur') this.journalRegie('transcription Whisper en erreur : ' + (detail || ''));
      },
    });
    c.flux.pousser(buf);
  }

  envoyer(c, obj) { if (c.ws.readyState === 1) { try { c.ws.send(JSON.stringify(obj)); } catch { /* rien */ } } }
  versRole(role, obj) { const s = JSON.stringify(obj); for (const c of this.clients.values()) if (c.role === role && c.ws.readyState === 1) { try { c.ws.send(s); } catch { /* rien */ } } }
  versRegie(obj) { this.versRole('regie', obj); }
  journalRegie(ligne) {
    this.journal.ecrire({ e: 'journal', ligne });
    this.versRegie({ t: 'journal', ts: Date.now(), ligne: String(ligne).slice(0, 300) });
  }

  pseudosHumains() {
    const s = new Set();
    for (const c of this.clients.values()) if (c.role === 'telephone' && c.pseudo) s.add(c.pseudo);
    return s;
  }
  chatHumainsRecents(n) { return this.historique.filter((m) => m.origine === 'humain').slice(-n).map((m) => m.texte); }

  etatPour(role) {
    const e = { segment: this.etat.segment, densite: this.etat.densite, humeur: this.etat.humeur, marquage: this.etat.marquage, coupe: this.etat.coupe };
    if (role === 'regie') {
      e.fournisseur = this.etat.fournisseur;
      e.segments = Object.keys(this.banques.segments);
      e.personas = this.orchestrateur.personasActifs().map((p) => ({ pid: p.id, pseudo: p.pseudo, couleur: p.couleur, recurrent: p.type === 'recurrent', archetype: p.archetype }));
    } else if (role === 'comedien' && this.etat.marquage === 'discret') {
      e.personas = this.orchestrateur.personasActifs().map((p) => ({ pid: p.id, pseudo: p.pseudo, couleur: p.couleur, recurrent: p.type === 'recurrent' }));
    }
    return e;
  }

  /** Vue d'un chat selon le rôle : l'origine n'est jamais envoyée à chat/telephone, et au comédien seulement en marquage discret. */
  vue(m, role) {
    if (role === 'regie') return m;
    const o = {};
    for (const k of CHAMPS_PUBLICS) o[k] = m[k];
    if (role === 'comedien' && this.etat.marquage === 'discret') o.origine = m.origine;
    return o;
  }

  /** Phrases et émojis proposés aux téléphones pour le segment courant (fichier relu à chaque appel : modifiable en direct). */
  propositions() {
    const seg = this.etat.segment;
    let p = null;
    try { p = JSON.parse(fs.readFileSync(this.fichierPropositions, 'utf8'))?.segments?.[seg] ?? null; } catch { /* pas de fichier */ }
    const textes = (l, n) => (Array.isArray(l) ? l : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, n));
    return { t: 'props', segment: seg, titre: this.banques.segments?.[seg]?.titre ?? '', phrases: textes(p?.phrases, 120), emojis: textes(p?.emojis, 16) };
  }

  // ------------------------------------------------------------------ diffusion

  /**
   * Seule porte de sortie d'un `chat`. Refiltre toujours.
   * @returns {object|null} le message complet diffusé, ou null s'il est refusé
   */
  diffuserChat(item, { figurant, listeSup = null }) {
    const v = this.moderateur.verifier(item.texte, { figurant, listeSup, contexte: { origine: item.origine, pid: item.pid ?? null, porte: 'diffusion' } });
    if (!v.ok) return null;
    const ts = Date.now();
    const m = { t: 'chat', id: `${this.prefixe}-${++this.seq}`, pseudo: item.pseudo, couleur: item.couleur, texte: v.texte, ts,
      origine: item.origine, pid: item.pid ?? null, ref: item.ref ?? null, lat: item.lat || {}, ...(item.origine === 'humain' ? { grand: true } : {}) };
    this.historique.push(m); if (this.historique.length > 200) this.historique.shift();
    this.affichages.push({ ts, fig: item.origine !== 'humain' });
    for (const c of this.clients.values()) if (c.role) this.envoyer(c, this.vue(m, c.role));
    this.journal.ecrire({ e: 'affiche', id: m.id, pid: m.pid, pseudo: m.pseudo, origine: m.origine, fournisseur: item.fournisseur || (item.origine === 'humain' ? 'humain' : 'banque'),
      ref: m.ref, texte: m.texte, vague: !!item.vague, version: item.version, lat: m.lat, t: item.t || null });
    return m;
  }

  debit() {
    const t = Date.now();
    while (this.affichages.length && t - this.affichages[0].ts > 60_000) this.affichages.shift();
    const fig = this.affichages.filter((x) => x.fig).length;
    const reel = this.affichages.length - fig;
    return { reel, fig, part_fig: this.affichages.length ? +(fig / this.affichages.length).toFixed(3) : 0 };
  }

  stat() {
    const o = this.orchestrateur.statistiques();
    const d = this.debit();
    const c = this.moderateur.compteurs;
    return { t: 'fig.stat', ts: Date.now(), fournisseur: o.fournisseur, lat: o.lat, rejets: c.rejets, rejets_figurants: c.rejets_figurants, rejets_humains: c.rejets_humains,
      rejets_par_raison: c.par_raison, cout_usd: o.cout_usd, debit: { reel: d.reel, fig: d.fig }, part_fig: d.part_fig,
      doublons: o.doublons, perimes: o.perimes, appels: o.appels, erreurs: o.erreurs, planifies: o.planifies, attente: o.attente,
      disjoncteurs: o.disjoncteurs, lat_par_fournisseur: o.lat_par_fournisseur,
      machines: this.orchestrateur.fournisseurs?.ollama?.tableau?.() ?? null, etat: { densite: this.etat.densite, coupe: this.etat.coupe, segment: this.etat.segment } };
  }

  // ------------------------------------------------------------------ messages entrants

  recevoir(c, brut) {
    const t = Date.now();
    c.fenetre = c.fenetre.filter((x) => t - x < 1000); c.fenetre.push(t);
    if (c.fenetre.length > 40) return;                     // plus de 40 messages/s : ignorés
    let m;
    try { m = JSON.parse(brut); } catch { return; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    if (m.t === 'ping') { this.envoyer(c, { t: 'pong', tc: m.tc, ts: Date.now() }); return; }
    if (m.t === 'hello') { this._hello(c, m); return; }
    if (!c.role) return;                                    // rien avant hello
    switch (m.t) {
      case 'asr': return this._asr(c, m);
      case 'msg': return this._msg(c, m);
      case 'fig.cmd': return this._cmd(c, m);
      case 'fig.valide': return this._valide(c, m);
      case 'diag':                                          // diagnostic de la page comédien (micro, moteur audio)
        if (c.role !== 'comedien') return;
        this.journal.ecrire({ e: 'diag_client', etape: String(m.etape || '').slice(0, 40), detail: JSON.stringify(m.detail ?? null).slice(0, 400) });
        this.journalRegie(`téléphone du comédien : ${String(m.etape || '').slice(0, 40)} ${JSON.stringify(m.detail ?? '').slice(0, 120)}`);
        return;
      default: return;
    }
  }

  _hello(c, m) {
    const role = String(m.role || '');
    if (!ROLES.has(role)) return;
    if (role === 'regie' && this.jetonRegie && m.jeton !== this.jetonRegie) { this.envoyer(c, { t: 'journal', ts: Date.now(), ligne: 'jeton régie refusé' }); return; }
    c.role = role;
    if (role === 'telephone') {
      let p = typeof m.pseudo === 'string' ? m.pseudo.replace(/\s+/g, '_').slice(0, 20) : '';
      const v = p ? this.moderateur.verifier(p, { figurant: false, contexte: { origine: 'pseudo' } }) : { ok: false };
      if (!v.ok || !/^[\p{L}\p{N}_.-]{2,20}$/u.test(p)) p = 'spectateur_' + Math.floor(100 + Math.random() * 900);
      const pris = new Set([...this.banques.personas.map((x) => x.pseudo.toLowerCase())]);
      for (const x of this.clients.values()) if (x !== c && x.role === 'telephone' && x.pseudo) pris.add(x.pseudo.toLowerCase());
      let base = p; let k = 2;
      while (pris.has(p.toLowerCase())) p = `${base}_${k++}`;
      c.pseudo = p;
      c.couleur = COULEURS_HUMAINS[hache(p) % COULEURS_HUMAINS.length];
    } else {
      c.pseudo = typeof m.pseudo === 'string' ? m.pseudo.slice(0, 20) : role;
    }
    c.cle = `${role}:${c.pseudo}`;
    this.journal.ecrire({ e: 'hello', role, pseudo: c.pseudo, tc: m.tc });
    const historique = this.historique.slice(-30).map((x) => this.vue(x, role));
    this.envoyer(c, { t: 'welcome', ts: Date.now(), etat: this.etatPour(role), historique, ...(role === 'telephone' ? { pseudo: c.pseudo } : {}),
      ...(role === 'comedien' ? { asr_serveur: !!this.asrUrl } : {}) });
    if (role === 'telephone') this.envoyer(c, this.propositions());
  }

  _asr(c, m) {
    if (c.role !== 'comedien' && c.role !== 'regie') return;
    const kind = m.kind === 'final' ? 'final' : 'partial';
    const texte = typeof m.texte === 'string' ? m.texte.slice(0, 1000) : '';
    if (!texte.trim()) return;
    const ts = Date.now();
    const echo = { t: 'asr', kind, texte, ts };
    this.versRole('regie', echo); this.versRole('comedien', echo);
    this.orchestrateur.onAsr({ kind, texte, ts, tc: Number(m.tc), tFinPhrase: m.tFinPhrase != null ? Number(m.tFinPhrase) : undefined });
  }

  _dejaVu(c, cseq) {
    let s = this.vus.get(c.cle);
    if (!s) { s = new Set(); this.vus.set(c.cle, s); }
    if (s.has(cseq)) return true;
    s.add(cseq);
    if (s.size > 1000) s.delete(s.values().next().value);
    return false;
  }

  _msg(c, m) {
    if (c.role !== 'telephone' && c.role !== 'regie') return;
    const cseq = Number(m.cseq);
    if (!Number.isFinite(cseq)) return;
    if (this._dejaVu(c, cseq)) { this.journal.ecrire({ e: 'msg_doublon', cle: c.cle, cseq }); return; }
    const texte = typeof m.texte === 'string' ? m.texte : '';
    if (c.role === 'regie') {
      if (m.persona == null) { this.journalRegie('msg de la régie sans persona : ignoré'); return; }
      this.orchestrateur.parleRegie({ persona: m.persona, texte, ref: 'main:' + cseq });
      return;
    }
    // humain (téléphone) : limite de débit puis même filtre que les figurants (sans les règles « figurant »)
    const t = Date.now();
    c.nMsg = c.nMsg.filter((x) => t - x < 10_000);
    if (c.nMsg.length >= 8) { this.journal.ecrire({ e: 'rejet', raison: 'debit', figurant: false, pseudo: c.pseudo }); return; }
    c.nMsg.push(t);
    const publie = this.diffuserChat({ pseudo: c.pseudo, couleur: c.couleur, texte, origine: 'humain', pid: null, ref: 'cseq:' + cseq, fournisseur: 'humain', t: { recu: t } }, { figurant: false });
    if (!publie) this.journalRegie(`message de ${c.pseudo} refusé par le filtre`);
  }

  _cmd(c, m) {
    if (c.role !== 'regie') return;
    const ok = this.orchestrateur.commande(m.cmd);
    const resume = JSON.stringify(m.cmd ?? null).slice(0, 200);
    this.journal.ecrire({ e: 'cmd', cmd: m.cmd ?? null, ok });
    if (!ok) { this.journalRegie(`commande refusée : ${resume}`); return; }
    if (m.cmd && 'coupe' in m.cmd && !m.cmd.coupe) this.journalRegie('COUPE levée');
    else if (!(m.cmd && 'coupe' in m.cmd)) this.journalRegie(`commande : ${resume}`);
    this.versRegie({ t: 'etat', ts: Date.now(), etat: this.etatPour('regie') });   // extension : état à jour pour la régie
    if (m.cmd && 'segment' in m.cmd) this.versRole('telephone', this.propositions());   // nouvelles phrases sur les téléphones
  }

  _valide(c, m) {
    if (c.role !== 'regie') return;
    this.orchestrateur.valider({ id: m.id, ok: !!m.ok, texte: typeof m.texte === 'string' ? m.texte : undefined });
  }
}
