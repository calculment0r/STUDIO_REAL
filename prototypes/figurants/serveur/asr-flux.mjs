// Transcription côté serveur : le téléphone du comédien envoie son micro brut (PCM 16 bits, mono, 16 kHz,
// trames binaires sur /ws) ; on découpe les phrases au silence (détecteur d'énergie à plancher adaptatif)
// et on les fait transcrire par le service Whisper (asr/serveur_asr.py, sur un DGX).
// Mesuré le 27/10 sur dgx2 (GB10, whisper-large-v3-turbo fp16) : 8,4 s de parole → 190 ms, sans faute.
//  - partiel : toutes les PARTIEL_MS pendant la phrase (sert à repérer tôt une question au chat) ;
//  - final   : après FIN_SILENCE_MS de silence, ou à MAX_PHRASE_S.

const SR = 16000;
const TRAME = 320;               // 20 ms
const PRE_ROLL = 15;             // 300 ms gardés avant le début de la voix
const DEBUT_TRAMES = 3;          // 60 ms de voix pour ouvrir une phrase
const FIN_SILENCE_MS = 600;
const PARTIEL_MS = 700;
const MAX_PHRASE_S = 15;
const MIN_PAROLE_S = 0.25;
// Seuils de voix (RMS, pleine échelle = 1). Mesuré le 27/10 sur l'iPhone du comédien près d'une enceinte :
// voix 0,003 en moyenne, 0,015 à 0,04 en pointe, bruit 0,001. Ouvrir une phrase demande plus que la poursuivre (hystérésis).
const SEUIL_OUVRIR = { facteur: 2.5, min: 0.0025 };
const SEUIL_CONTINUER = { facteur: 1.8, min: 0.0018 };
// Phrases que Whisper invente sur du silence ou du bruit (connues, en français)
const HALLUCINATIONS = [/sous-titr/i, /amara\.org/i, /^merci\.?$/i, /^merci d'avoir regardé/i, /^\.+$/, /^musique$/i, /abonnez-vous/i];

export class FluxAsr {
  /**
   * @param {object} o
   * @param {string} o.url        service Whisper (POST /transcrire)
   * @param {(m: {kind: 'partial'|'final', texte: string, tc: number, tFinPhrase: number}) => void} o.onAsr
   * @param {(e: object) => void} [o.journal]
   * @param {(etat: string, detail?: string) => void} [o.onEtat]
   */
  constructor({ url, onAsr, journal = () => {}, onEtat = () => {} }) {
    Object.assign(this, { url: url.replace(/\/+$/, ''), onAsr, journal, onEtat });
    this.reste = new Int16Array(0);
    this.avant = [];               // trames de pré-roll
    this.phrase = null;            // { trames: Int16Array[], debut, derniereVoix, dernierPartiel, id }
    this.voixConsecutives = 0;
    this.plancher = 0.004;         // RMS du bruit de fond, adaptatif
    this.n = 0;
    this.enVol = false;
    this.ferme = false;
  }

  /** Reçoit un morceau de PCM 16 bits (Buffer ou ArrayBuffer). */
  pousser(buf) {
    if (this.ferme) return;
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    const nouv = new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + (b.byteLength & ~1)));
    const tout = new Int16Array(this.reste.length + nouv.length);
    tout.set(this.reste); tout.set(nouv, this.reste.length);
    let i = 0;
    for (; i + TRAME <= tout.length; i += TRAME) this._trame(tout.subarray(i, i + TRAME).slice());
    this.reste = tout.slice(i);
  }

  _trame(t) {
    let s = 0;
    for (let k = 0; k < t.length; k++) { const v = t[k] / 32768; s += v * v; }
    const rms = Math.sqrt(s / t.length);
    const seuil = this.phrase ? SEUIL_CONTINUER : SEUIL_OUVRIR;
    const voix = rms > Math.max(this.plancher * seuil.facteur, seuil.min);
    // relevé toutes les 2 s : niveau reçu, plancher de bruit, voix détectée (diagnostic du micro)
    const st = (this.stats ||= { n: 0, max: 0, somme: 0, voix: 0, t: Date.now() });
    st.n++; st.somme += rms; st.max = Math.max(st.max, rms); if (voix) st.voix++;
    if (Date.now() - st.t >= 2000) {
      this.journal({ e: 'audio_recu', trames: st.n, rms_moy: +(st.somme / st.n).toFixed(4), rms_max: +st.max.toFixed(4), plancher: +this.plancher.toFixed(4), trames_voix: st.voix, en_phrase: !!this.phrase });
      this.stats = null;
    }
    // le plancher suit le bruit de fond : descend vite, monte lentement (et pas pendant la voix)
    if (!voix) this.plancher = rms < this.plancher ? this.plancher * 0.9 + rms * 0.1 : this.plancher * 0.995 + rms * 0.005;
    const now = Date.now();

    if (!this.phrase) {
      this.avant.push(t); if (this.avant.length > PRE_ROLL) this.avant.shift();
      this.voixConsecutives = voix ? this.voixConsecutives + 1 : 0;
      if (this.voixConsecutives >= DEBUT_TRAMES) {
        this.phrase = { trames: [...this.avant], debut: now, derniereVoix: now, dernierPartiel: now, id: ++this.n, parole: 0 };
        this.avant = [];
        this.onEtat('voix');
      }
      return;
    }
    const p = this.phrase;
    p.trames.push(t);
    if (voix) { p.derniereVoix = now; p.parole += TRAME / SR; }
    const dureeS = p.trames.length * TRAME / SR;
    if (now - p.derniereVoix >= FIN_SILENCE_MS || dureeS >= MAX_PHRASE_S) { this._finir(); return; }
    if (now - p.dernierPartiel >= PARTIEL_MS && !this.enVol) { p.dernierPartiel = now; this._envoyer(p, 'partial'); }
  }

  _finir() {
    const p = this.phrase; this.phrase = null; this.voixConsecutives = 0;
    this.onEtat('silence');
    // une phrase dont Whisper a déjà rendu du texte (partiel) n'est jamais jetée, même courte
    if (p.parole < MIN_PAROLE_S && !p.aTexte) { this.journal({ e: 'asr_flux_ignore', raison: 'trop court', parole_s: +p.parole.toFixed(2) }); return; }
    this._envoyer(p, 'final');
  }

  async _envoyer(p, kind) {
    const pcm = new Int16Array(p.trames.length * TRAME);
    p.trames.forEach((t, k) => pcm.set(t, k * TRAME));
    const corps = Buffer.from(pcm.buffer);
    const tFinPhrase = p.derniereVoix;
    if (kind === 'partial') this.enVol = true;
    const t0 = Date.now();
    try {
      const r = await fetch(this.url + '/transcrire', { method: 'POST', body: corps, headers: { 'content-type': 'application/octet-stream' }, signal: AbortSignal.timeout(kind === 'final' ? 8000 : 3000) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erreur || 'HTTP ' + r.status);
      const texte = String(j.texte || '').trim();
      this.journal({ e: 'asr_flux', kind, id: p.id, duree_s: j.duree_s, ms_whisper: j.ms, ms_total: Date.now() - t0, texte: texte.slice(0, 200) });
      if (!texte || HALLUCINATIONS.some((h) => h.test(texte))) return;
      if (kind === 'partial') p.aTexte = true;
      // un partiel qui arrive après le final de sa phrase est périmé
      if (kind === 'partial' && this.phrase?.id !== p.id) return;
      this.onAsr({ kind, texte, tc: Date.now(), tFinPhrase });
    } catch (e) {
      this.journal({ e: 'asr_flux_erreur', kind, erreur: String(e.message || e).slice(0, 120) });
      if (kind === 'final') this.onEtat('erreur', String(e.message || e).slice(0, 80));
    } finally {
      if (kind === 'partial') this.enVol = false;
    }
  }

  fermer() { this.ferme = true; this.phrase = null; }
}

/** Le service Whisper répond-il ? */
export async function santeAsr(url) {
  try {
    const r = await fetch(url.replace(/\/+$/, '') + '/sante', { signal: AbortSignal.timeout(2000) });
    return r.ok ? await r.json() : { ok: false };
  } catch { return { ok: false }; }
}
