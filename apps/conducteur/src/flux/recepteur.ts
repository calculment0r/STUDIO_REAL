// Réception du flux du streamer côté SORTIE ÉCRAN SCÈNE (chantier FLUX STREAMER).
//
//   const flux = await recevoirFluxStreamer({ serveur: '', projet, jeton, onEtat: (e) => … });
//   video.muted = true; video.playsInline = true; video.srcObject = flux; await video.play();
//
// WebRTC pair-à-pair téléphone → sortie, signalisation par la salle du projet (message `rtc`, voir ./protocole.ts).
// Le MediaStream rendu reste LE MÊME pendant toute la vie du récepteur : à chaque renégociation (téléphone revenu
// d'arrière-plan, réseau changé, autre téléphone), ses pistes sont remplacées. Par prudence, `onEtat` signale
// aussi `nouvellesPistes` : la sortie peut réaffecter `video.srcObject = flux` (certains navigateurs ne suivent pas
// l'ajout de pistes à un flux déjà affecté).
import { configurationRtc, parametreAdresse, serveursIce } from './ice';
import { preferH264 } from './codec';
import { CANAL_DEFAUT, idAleatoire, type MessageRtcRecu, type NiveauConsigne, type SignalRtc } from './protocole';
import { SalleSignal, type EtatSalle } from './signalisation';
import { calculerStatsReception, noteQualite, resumeStats, versListe, type Compteurs, type StatsReception } from './stats';

/** attente : salle ouverte, pas de streamer en direct · negociation : offre reçue · direct : images reçues ·
 *  coupe : liaison perdue, reprise en cours · arrete : arrêté par la sortie */
export type PhaseFlux = 'connexion' | 'attente' | 'negociation' | 'direct' | 'coupe' | 'arrete';

export interface EtatFlux {
  phase: PhaseFlux;
  message: string;
  salle: EtatSalle;
  /** session et personne du téléphone qui diffuse */
  streamer: { session: string; personne: string; nom?: string } | null;
  stats: StatsReception | null;
  flux: MediaStream;
  /** vrai quand des pistes viennent d'être remplacées : réaffecter srcObject par prudence */
  nouvellesPistes?: boolean;
}

export interface OptionsRecepteur {
  /** origine du serveur, vide = même origine */
  serveur: string;
  projet: string;
  jeton: string;
  onEtat?: (e: EtatFlux) => void;
  /** canal du streamer (défaut 'streamer') */
  canal?: string;
  /** STUN/TURN ; défaut : configuration (adresse, localStorage, VITE_SERVEURS_ICE) puis STUN public */
  iceServers?: RTCIceServer[];
  /** force le relais TURN */
  relais?: boolean;
  nom?: string;
  /** arrête tout quand le signal est annulé */
  signal?: AbortSignal;
  /** cadence des statistiques (ms, défaut 1000) */
  intervalleStatsMs?: number;
  /** cible du tampon de gigue (ms) : 0 = au plus court (défaut navigateur si absent) */
  tamponMs?: number;
  /** pour les tests */
  WebSocket?: typeof WebSocket;
}

export interface RecepteurFlux {
  /** le flux (stable) ; vide tant que rien n'arrive */
  readonly flux: MediaStream;
  /** résolue à la première piste vidéo reçue */
  readonly pret: Promise<MediaStream>;
  /** le flux dès qu'une piste vidéo VIVANTE y est (tout de suite si c'est déjà le cas) ; si la piste a été
   *  arrêtée par l'appelant alors qu'on est en direct, relance une négociation */
  prochainFlux(): Promise<MediaStream>;
  /** remplace l'abonné aux changements d'état */
  surEtat(f: ((e: EtatFlux) => void) | undefined): void;
  etat(): EtatFlux;
  /** heure serveur estimée (pour la mire de latence) */
  heureServeur(): number;
  /** consigne privée au téléphone du streamer (affichée en grand) */
  envoyerConsigne(texte: string, niveau?: NiveauConsigne): string | null;
  /** relance une négociation complète */
  relancer(): void;
  arreter(): void;
}

const RELANCE_RECHERCHE_MS = 5000;
const DELAI_COUPURE_MS = 4000;
const DELAI_NEGOCIATION_MS = 12_000;

export function creerRecepteurFlux(o: OptionsRecepteur): RecepteurFlux {
  const canal = o.canal ?? CANAL_DEFAUT;
  const flux = new MediaStream();
  const config = configurationRtc(o.iceServers ?? serveursIce(), o.relais);
  const salle = new SalleSignal({
    serveur: o.serveur, projet: o.projet, jeton: o.jeton, nom: o.nom ?? 'Sortie scène', role: 'poste',
    session: idAleatoire('sortie_', 12), personne: idAleatoire('sortie_', 10), ...(o.WebSocket ? { WebSocket: o.WebSocket } : {}),
  });

  let phase: PhaseFlux = 'connexion';
  let message = 'connexion à la salle…';
  let streamer: EtatFlux['streamer'] = null;
  let pc: RTCPeerConnection | null = null;
  let n: string | null = null;
  let candidatsEnAttente: RTCIceCandidateInit[] = [];
  let distantPose = false;
  let stats: StatsReception | null = null;
  let compteurs: Compteurs | null = null;
  let depuisPhase = Date.now();
  let minuteurCoupure: ReturnType<typeof setTimeout> | null = null;
  let arrete = false;
  let resoudre!: (f: MediaStream) => void;
  let rejeter!: (e: unknown) => void;
  const pret = new Promise<MediaStream>((ok, ko) => { resoudre = ok; rejeter = ko; });
  pret.catch(() => undefined);
  const attentes: { ok: (f: MediaStream) => void; ko: (e: unknown) => void }[] = [];
  let onEtat = o.onEtat;
  // ?stats=1 dans l'adresse de la page (sortie.html…) : incrustation de contrôle (chemin, latence, images/s, débit)
  const incrustation = typeof document !== 'undefined' && parametreAdresse('stats') === '1' ? creerIncrustation() : null;

  const etat = (): EtatFlux => ({ phase, message, salle: salle.etat, streamer, stats, flux });
  const publier = (extra?: Partial<EtatFlux>) => {
    if (incrustation) incrustation.textContent = `FLUX · ${phase.toUpperCase()} · ${stats && (phase === 'direct' || phase === 'coupe') ? `${resumeStats(stats)} · ${noteQualite(stats)}` : message}`;
    try { onEtat?.({ ...etat(), ...extra }); } catch (e) { console.error('[flux] onEtat', e); }
  };
  const changer = (p: PhaseFlux, m: string) => {
    if (p !== phase) depuisPhase = Date.now();
    phase = p; message = m;
    publier();
  };

  const fermerPc = () => {
    if (minuteurCoupure) { clearTimeout(minuteurCoupure); minuteurCoupure = null; }
    if (pc) { pc.ontrack = pc.onicecandidate = pc.onconnectionstatechange = null; try { pc.close(); } catch { /* déjà fermé */ } }
    pc = null; n = null; candidatsEnAttente = []; distantPose = false; compteurs = null;
  };

  const viderFlux = () => { for (const t of flux.getTracks()) { flux.removeTrack(t); } };

  const rechercher = (vers = '*') => salle.envoyer(vers, { type: 'recherche', canal });

  /** Flux perdu : on garde la dernière image (pistes en place) et on redemande au même téléphone, puis à tous. */
  const reprendre = (raison: string) => {
    if (arrete) return;
    const s = streamer;
    fermerPc();
    changer('coupe', raison);
    if (s) rechercher(s.session); else rechercher();
  };

  async function surOffre(m: MessageRtcRecu, sig: Extract<SignalRtc, { type: 'offre' }>) {
    fermerPc();
    streamer = { session: m.de, personne: m.par, ...(streamer?.session === m.de && streamer.nom ? { nom: streamer.nom } : {}) };
    n = sig.n;
    const ici = new RTCPeerConnection(config);
    pc = ici;
    changer('negociation', 'négociation avec le téléphone…');
    ici.onicecandidate = (e) => {
      if (e.candidate && pc === ici) salle.envoyer(m.de, { type: 'candidat', canal, n: sig.n, candidat: e.candidate.toJSON() });
    };
    ici.ontrack = (e) => {
      if (pc !== ici) return;
      const piste = e.track;
      for (const t of flux.getTracks()) if (t.kind === piste.kind) flux.removeTrack(t);
      flux.addTrack(piste);
      if (o.tamponMs !== undefined && 'jitterBufferTarget' in e.receiver) {
        try { (e.receiver as RTCRtpReceiver & { jitterBufferTarget: number | null }).jitterBufferTarget = o.tamponMs; } catch { /* non pris en charge */ }
      }
      publier({ nouvellesPistes: true });
      if (piste.kind === 'video') { resoudre(flux); for (const a of attentes.splice(0)) a.ok(flux); }
    };
    ici.onconnectionstatechange = () => {
      if (pc !== ici) return;
      const s = ici.connectionState;
      if (s === 'connected') {
        if (minuteurCoupure) { clearTimeout(minuteurCoupure); minuteurCoupure = null; }
        changer('direct', 'en direct');
      } else if (s === 'disconnected') {
        changer('coupe', 'liaison interrompue, attente de reprise…');
        minuteurCoupure ??= setTimeout(() => { minuteurCoupure = null; if (pc === ici && ici.connectionState !== 'connected') reprendre('liaison perdue, renégociation…'); }, DELAI_COUPURE_MS);
      } else if (s === 'failed') {
        reprendre('liaison perdue (ICE), renégociation…');
      }
    };
    try {
      await ici.setRemoteDescription({ type: 'offer', sdp: sig.sdp });
      for (const t of ici.getTransceivers()) if (t.receiver.track.kind === 'video') preferH264(t, 'reception');
      distantPose = true;
      for (const c of candidatsEnAttente.splice(0)) await ici.addIceCandidate(c).catch(() => undefined);
      const reponse = await ici.createAnswer();
      await ici.setLocalDescription(reponse);
      if (pc !== ici) return;
      salle.envoyer(m.de, { type: 'reponse', canal, n: sig.n, sdp: ici.localDescription!.sdp });
    } catch (e) {
      console.warn('[flux] négociation impossible', e);
      if (pc === ici) reprendre('négociation impossible, nouvel essai…');
    }
  }

  salle.onRtc = (m) => {
    const sig = m.signal;
    if (arrete || sig.canal !== canal) return;
    switch (sig.type) {
      case 'annonce':
        // un téléphone passe en direct (ou revient) : on le demande, sauf si on le reçoit déjà
        if (phase === 'direct' && streamer?.session === m.de) return;
        streamer = { session: m.de, personne: m.par, ...(sig.nom ? { nom: sig.nom } : {}) };
        rechercher(m.de);
        return;
      case 'offre':
        void surOffre(m, sig);
        return;
      case 'candidat':
        if (!pc || sig.n !== n || m.de !== streamer?.session) return;
        if (distantPose) pc.addIceCandidate(sig.candidat).catch(() => undefined);
        else candidatsEnAttente.push(sig.candidat);
        return;
      case 'fin':
        if (m.de !== streamer?.session || (sig.n && sig.n !== n)) return;
        fermerPc();
        viderFlux();
        publier({ nouvellesPistes: true });
        changer('attente', 'le streamer a coupé le direct');
        return;
    }
  };
  salle.onEtat = (e) => {
    if (arrete) return;
    if (e !== 'ouverte' && phase !== 'direct') changer(phase === 'connexion' ? 'connexion' : phase, e === 'connexion' ? 'connexion à la salle…' : 'salle injoignable, nouvel essai…');
    else publier();
  };
  salle.onOuverte = () => {
    if (phase === 'connexion' || phase === 'attente') changer('attente', 'en attente du streamer…');
    // un flux pair-à-pair déjà établi survit à une coupure de la salle : on ne le renégocie pas
    if (phase !== 'direct' && phase !== 'negociation') rechercher();
  };
  salle.onErreur = (code, msg) => {
    if (code === 'rtc-absent' && phase !== 'direct') { streamer = null; changer('attente', 'le téléphone a quitté la salle ; en attente…'); }
    else if (code !== 'rtc-absent') console.warn('[flux] salle :', code, msg);
  };

  // Battement : relance la recherche sans flux, débloque une négociation figée, relève les statistiques.
  const minuteur = setInterval(async () => {
    if (arrete) return;
    const ecoule = Date.now() - depuisPhase;
    if ((phase === 'attente' || phase === 'coupe') && salle.etat === 'ouverte' && ecoule >= RELANCE_RECHERCHE_MS) {
      depuisPhase = Date.now();
      rechercher();
    }
    if (phase === 'negociation' && ecoule > DELAI_NEGOCIATION_MS) reprendre('négociation trop longue, nouvel essai…');
    if (pc && (phase === 'direct' || phase === 'coupe')) {
      try {
        const r = calculerStatsReception(versListe(await pc.getStats()), compteurs);
        compteurs = r.compteurs;
        stats = r.stats;
        publier();
      } catch { /* pc fermé entre-temps */ }
    }
  }, o.intervalleStatsMs ?? 1000);

  const arreter = () => {
    if (arrete) return;
    arrete = true;
    clearInterval(minuteur);
    if (streamer && pc) salle.envoyer(streamer.session, { type: 'fin', canal, ...(n ? { n } : {}) });
    fermerPc();
    salle.fermer();
    for (const t of flux.getTracks()) t.stop();
    changer('arrete', 'arrêté');
    const abandon = new DOMException('réception arrêtée', 'AbortError');
    rejeter(abandon);
    for (const a of attentes.splice(0)) a.ko(abandon);
    incrustation?.remove();
  };
  if (o.signal) {
    if (o.signal.aborted) queueMicrotask(arreter);
    else o.signal.addEventListener('abort', arreter, { once: true });
  }

  salle.ouvrir();
  publier();

  return {
    flux, pret, etat,
    prochainFlux() {
      const v = flux.getVideoTracks()[0];
      if (arrete) return Promise.reject(new DOMException('réception arrêtée', 'AbortError'));
      if (v && v.readyState === 'live') return Promise.resolve(flux);
      const p = new Promise<MediaStream>((ok, ko) => attentes.push({ ok, ko }));
      // piste arrêtée chez l'appelant (image jugée figée) alors que la liaison tient : nouvelle négociation
      if (phase === 'direct') reprendre('flux redemandé, renégociation…');
      return p;
    },
    surEtat(f) { onEtat = f; },
    heureServeur: () => salle.heureServeur(),
    envoyerConsigne(texte, niveau = 'info') {
      const id = idAleatoire('cons_');
      const t = texte.trim();
      if (!t) return null;
      return salle.envoyer(streamer?.session ?? '*', { type: 'consigne', canal, id, texte: t, niveau }) ? id : null;
    },
    relancer: () => reprendre('relance demandée'),
    arreter,
  };
}

function creerIncrustation(): HTMLDivElement {
  const d = document.createElement('div');
  d.setAttribute('data-flux-stats', '');
  d.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;pointer-events:none;padding:4px 8px;'
    + 'font:11px/1.3 var(--f-mono, monospace);letter-spacing:.04em;color:var(--cy);background:var(--ombre-3);border-radius:var(--r1, 4px)';
  document.body.append(d);
  return d;
}

/** Récepteurs ouverts par recevoirFluxStreamer, un par (serveur, projet, jeton, canal). */
const ACTIFS = new Map<string, RecepteurFlux>();

/**
 * Point d'entrée de la sortie : se connecte à la salle, attend le téléphone du streamer et résout avec le flux
 * dès la première image vivante. Le récepteur continue ensuite (reprises automatiques) jusqu'à `signal.abort()`.
 *
 * RAPPELABLE sans fuite : un nouvel appel avec les mêmes serveur/projet/jeton/canal réutilise le récepteur ouvert
 * (une seule liaison avec le téléphone) et résout au prochain flux vivant — tout de suite si la vidéo arrive déjà ;
 * si l'appelant a arrêté les pistes (image jugée figée), une renégociation est lancée.
 */
export function recevoirFluxStreamer(o: OptionsRecepteur): Promise<MediaStream> {
  if (!o || !o.projet || !o.jeton) return Promise.reject(new Error('recevoirFluxStreamer : projet et jeton requis'));
  const cle = JSON.stringify([o.serveur ?? '', o.projet, o.jeton, o.canal ?? CANAL_DEFAUT]);
  let r = ACTIFS.get(cle);
  if (r && r.etat().phase === 'arrete') { ACTIFS.delete(cle); r = undefined; }
  if (!r) {
    const { signal, ...reste } = o;
    const nouveau = creerRecepteurFlux({ ...reste, serveur: o.serveur ?? '' });
    r = nouveau;
    ACTIFS.set(cle, nouveau);
    if (signal) {
      const fin = () => { nouveau.arreter(); if (ACTIFS.get(cle) === nouveau) ACTIFS.delete(cle); };
      if (signal.aborted) queueMicrotask(fin); else signal.addEventListener('abort', fin, { once: true });
    }
    return nouveau.pret;
  }
  if (o.onEtat) r.surEtat(o.onEtat);
  return r.prochainFlux();
}
