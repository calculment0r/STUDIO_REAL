// Émetteur du TÉLÉPHONE du streamer (chantier FLUX STREAMER) : caméra (arrière par défaut) + micro, un
// RTCPeerConnection par récepteur (sortie écran scène, moniteur de régie), signalisation par la salle du projet.
//
// Choix : H.264 préféré (encodeur matériel de l'iPhone), 1280×720 à 30 i/s visés, débit plafonné (2,5 Mb/s par
// défaut) et adapté : le contrôle de congestion de WebRTC règle le débit, et si la bande passante limite au point
// de faire chuter les images/s on réduit la définition (×1,5 par palier, jusqu'à ÷4), puis on la rend quand ça va
// mieux. Reprise automatique : iOS coupe la caméra et gèle la page en arrière-plan ; au retour on rouvre la caméra,
// on remplace les pistes sans renégocier (replaceTrack), on rouvre la salle et on se ré-annonce. Wake Lock pendant
// le direct. Consignes privées de la régie reçues par la salle (signal `consigne`), accusées (`consigne-vue`).
import { configurationRtc, serveursIce } from '../flux/ice';
import { preferH264 } from '../flux/codec';
import { dessinerMire } from '../flux/mire';
import { CANAL_DEFAUT, type MessageRtcRecu, type NiveauConsigne } from '../flux/protocole';
import { SalleSignal, type EtatSalle } from '../flux/signalisation';
import { calculerStatsEmission, noteQualite, versListe, type Compteurs, type Qualite, type StatsEmission } from '../flux/stats';

export type Camera = 'arriere' | 'avant';
/** arret : rien d'ouvert · camera : ouverture · pret : aperçu, hors direct · direct : diffuse · reprise : retour
 *  d'arrière-plan en cours · erreur : caméra refusée ou absente */
export type PhaseEmetteur = 'arret' | 'camera' | 'pret' | 'direct' | 'reprise' | 'erreur';

export interface Consigne { id: string; texte: string; niveau: NiveauConsigne; de: string; recue: number }

export interface EtatEmetteur {
  phase: PhaseEmetteur;
  message: string;
  salle: EtatSalle;
  camera: Camera;
  micro: boolean;
  /** récepteurs connectés (images en route) / en cours de négociation */
  recepteurs: number;
  negociations: number;
  stats: StatsEmission | null;
  qualite: Qualite | null;
  /** réduction de définition appliquée par l'adaptation (1 = pleine) */
  reduction: number;
  apercu: MediaStream | null;
  ecranAllume: boolean;
}

export interface OptionsEmetteur {
  serveur: string;
  projet: string;
  jeton: string;
  canal?: string;
  nom?: string;
  personne?: string;
  session?: string;
  iceServers?: RTCIceServer[];
  relais?: boolean;
  /** plafond de débit vidéo (kb/s), défaut 2500 */
  debitMaxKbps?: number;
  /** remplace la caméra par une mire horodatée (mesure de latence) */
  mire?: boolean;
  onEtat?: (e: EtatEmetteur) => void;
  onConsigne?: (c: Consigne) => void;
}

interface Paire { pc: RTCPeerConnection; n: string; distantPose: boolean; candidats: RTCIceCandidateInit[]; compteurs: Compteurs | null; reduction: number; mauvais: number; bons: number }

/** Contraintes getUserMedia : 720p 30 i/s visés, caméra choisie (arrière = environment). */
export function contraintesVideo(camera: Camera): MediaTrackConstraints {
  return {
    facingMode: { ideal: camera === 'arriere' ? 'environment' : 'user' },
    width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 },
  };
}

export const CONTRAINTES_AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

/** Nouvelle réduction de définition selon la santé de l'envoi (pur). fpsSource = cadence de la caméra : on ne
 *  réduit que si la bande passante fait tomber les images/s sous 75 % de la source pendant 3 s, on rend après 10 s
 *  saines (≥ 90 % de la source, sans limitation de bande passante). */
export function adapterReduction(p: { reduction: number; mauvais: number; bons: number }, s: StatsEmission, fpsSource = 30): { reduction: number; mauvais: number; bons: number } {
  const limite = s.limitation === 'bandwidth' && s.imagesParSeconde < fpsSource * 0.75;
  const mauvais = limite ? p.mauvais + 1 : 0;
  const bons = !limite && s.imagesParSeconde >= fpsSource * 0.9 && s.limitation !== 'bandwidth' ? p.bons + 1 : 0;
  if (mauvais >= 3 && p.reduction < 4) return { reduction: Math.min(4, Math.round(p.reduction * 1.5 * 100) / 100), mauvais: 0, bons: 0 };
  if (bons >= 10 && p.reduction > 1) return { reduction: Math.max(1, Math.round((p.reduction / 1.5) * 100) / 100), mauvais: 0, bons: 0 };
  return { reduction: p.reduction, mauvais, bons };
}

export interface Emetteur {
  etat(): EtatEmetteur;
  /** ouvre la salle et la caméra (à appeler sur un geste de l'utilisateur, exigence iOS) */
  demarrer(): Promise<void>;
  passerEnDirect(): Promise<void>;
  arreterDirect(): void;
  changerCamera(): Promise<void>;
  basculerMicro(): void;
  /** retour au premier plan : rouvre caméra, salle, Wake Lock (appelé tout seul sur visibilitychange) */
  reprendre(): Promise<void>;
  heureServeur(): number;
  fermer(): void;
}

export function creerEmetteur(o: OptionsEmetteur): Emetteur {
  const canal = o.canal ?? CANAL_DEFAUT;
  const config = configurationRtc(o.iceServers ?? serveursIce(), o.relais);
  const debitMax = (o.debitMaxKbps ?? 2500) * 1000;
  const salle = new SalleSignal({
    serveur: o.serveur, projet: o.projet, jeton: o.jeton, nom: o.nom ?? 'Streamer', role: 'poste',
    ...(o.personne ? { personne: o.personne } : {}), ...(o.session ? { session: o.session } : {}),
  });
  const paires = new Map<string, Paire>();
  let phase: PhaseEmetteur = 'arret';
  let message = '';
  let camera: Camera = 'arriere';
  let micro = true;
  let apercu: MediaStream | null = null;
  let stats: StatsEmission | null = null;
  let verrouEcran: WakeLockSentinel | null = null;
  let minuteurStats: ReturnType<typeof setInterval> | null = null;
  let mireMinuteur: ReturnType<typeof setInterval> | null = null;
  let enReprise: Promise<void> | null = null;
  let compteurN = 0;

  const connectes = () => [...paires.values()].filter((p) => p.pc.connectionState === 'connected');
  const etat = (): EtatEmetteur => ({
    phase, message, salle: salle.etat, camera, micro,
    recepteurs: connectes().length, negociations: paires.size - connectes().length,
    stats, qualite: stats && connectes().length ? noteQualite(stats) : null,
    reduction: connectes()[0]?.reduction ?? 1, apercu, ecranAllume: !!verrouEcran && !verrouEcran.released,
  });
  const publier = () => { try { o.onEtat?.(etat()); } catch (e) { console.error('[streamer] onEtat', e); } };
  const changer = (p: PhaseEmetteur, m: string) => { phase = p; message = m; publier(); };

  // ───────── caméra et micro ─────────

  function sessionAudioEnregistrement() {
    // iOS : la session audio doit être en play-and-record AVANT d'ouvrir le micro (banc d'essai du 26/10)
    const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (s) { try { s.type = 'play-and-record'; } catch { /* ancien WebKit */ } }
  }

  function flux_mire(): MediaStream {
    const toile = document.createElement('canvas');
    toile.width = 1280; toile.height = 720;
    const ctx = toile.getContext('2d')!;
    let i = 0;
    if (mireMinuteur) clearInterval(mireMinuteur);
    mireMinuteur = setInterval(() => {
      i++;
      ctx.fillStyle = '#1a3f2c'; ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = '#e0674a'; ctx.fillRect((i * 12) % 1280, 300, 80, 200);
      ctx.fillStyle = '#e6eae7'; ctx.font = '48px sans-serif';
      ctx.fillText(`MIRE ${new Date(salle.heureServeur()).toISOString().slice(11, 23)}`, 40, 650);
      dessinerMire(ctx, 1280, 720, salle.heureServeur());
    }, 1000 / 30);
    return toile.captureStream(30);
  }

  async function ouvrirVideo(c: Camera): Promise<MediaStreamTrack> {
    if (o.mire) return flux_mire().getVideoTracks()[0]!;
    const f = await navigator.mediaDevices.getUserMedia({ video: contraintesVideo(c), audio: false });
    return f.getVideoTracks()[0]!;
  }

  async function ouvrirAudio(): Promise<MediaStreamTrack | null> {
    if (o.mire) return null;
    sessionAudioEnregistrement();
    try {
      const f = await navigator.mediaDevices.getUserMedia({ audio: CONTRAINTES_AUDIO, video: false });
      const t = f.getAudioTracks()[0] ?? null;
      if (t) t.enabled = micro;
      return t;
    } catch (e) {
      console.warn('[streamer] micro indisponible', e);
      return null;
    }
  }

  function surveiller(t: MediaStreamTrack) {
    t.addEventListener('ended', () => { if (document.visibilityState === 'visible' && phase !== 'arret') void reprendre(); });
  }

  /** Installe une piste dans l'aperçu et dans tous les PeerConnection (sans renégocier). */
  async function poser(t: MediaStreamTrack) {
    if (!apercu) apercu = new MediaStream();
    for (const ancienne of apercu.getTracks()) if (ancienne.kind === t.kind && ancienne !== t) { apercu.removeTrack(ancienne); ancienne.stop(); }
    if (!apercu.getTracks().includes(t)) apercu.addTrack(t);
    surveiller(t);
    for (const p of paires.values()) {
      const tr = p.pc.getTransceivers().find((x) => x.sender.track?.kind === t.kind || x.receiver.track.kind === t.kind);
      if (tr) await tr.sender.replaceTrack(t).catch((e) => console.warn('[streamer] replaceTrack', e));
    }
  }

  async function ouvrirMedias() {
    changer('camera', 'ouverture de la caméra…');
    // iOS n'ouvre pas deux caméras : on libère l'ancienne d'abord
    for (const t of apercu?.getVideoTracks() ?? []) t.stop();
    const video = await ouvrirVideo(camera);
    await poser(video);
    const audio = apercu?.getAudioTracks().find((t) => t.readyState === 'live') ?? (await ouvrirAudio());
    if (audio) await poser(audio);
  }

  // ───────── pairs WebRTC ─────────

  function fermerPaire(session: string, prevenir: boolean) {
    const p = paires.get(session);
    if (!p) return;
    paires.delete(session);
    if (prevenir) salle.envoyer(session, { type: 'fin', canal, n: p.n });
    p.pc.onicecandidate = p.pc.onconnectionstatechange = null;
    try { p.pc.close(); } catch { /* déjà fermé */ }
    publier();
  }

  async function nouvellePaire(vers: string) {
    fermerPaire(vers, false);
    if (!apercu) return;
    const n = `n${Date.now().toString(36)}${(++compteurN).toString(36)}`;
    const pc = new RTCPeerConnection(config);
    const p: Paire = { pc, n, distantPose: false, candidats: [], compteurs: null, reduction: 1, mauvais: 0, bons: 0 };
    paires.set(vers, p);
    const video = apercu.getVideoTracks()[0];
    const audio = apercu.getAudioTracks()[0];
    if (video) {
      const t = pc.addTransceiver(video, { direction: 'sendonly', streams: [apercu], sendEncodings: [{ maxBitrate: debitMax, maxFramerate: 30 }] });
      preferH264(t, 'envoi');
    }
    if (audio) pc.addTransceiver(audio, { direction: 'sendonly', streams: [apercu] });
    pc.onicecandidate = (e) => { if (e.candidate && paires.get(vers) === p) salle.envoyer(vers, { type: 'candidat', canal, n, candidat: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (paires.get(vers) !== p) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') fermerPaire(vers, false);   // la sortie redemandera
      else publier();
    };
    try {
      const offre = await pc.createOffer();
      await pc.setLocalDescription(offre);
      if (paires.get(vers) !== p) return;
      if (!salle.envoyer(vers, { type: 'offre', canal, n, sdp: pc.localDescription!.sdp })) fermerPaire(vers, false);
    } catch (e) {
      console.warn('[streamer] offre impossible', e);
      fermerPaire(vers, false);
    }
    publier();
  }

  async function surReponse(m: MessageRtcRecu, n: string, sdp: string) {
    const p = paires.get(m.de);
    if (!p || p.n !== n || p.distantPose) return;
    try {
      await p.pc.setRemoteDescription({ type: 'answer', sdp });
      p.distantPose = true;
      for (const c of p.candidats.splice(0)) await p.pc.addIceCandidate(c).catch(() => undefined);
    } catch (e) {
      console.warn('[streamer] réponse refusée', e);
      fermerPaire(m.de, true);
    }
  }

  salle.onRtc = (m) => {
    const s = m.signal;
    if (s.type === 'consigne') {
      // les consignes sans canal précis (ou du nôtre) sont pour nous
      if (s.canal !== canal) return;
      o.onConsigne?.({ id: s.id, texte: s.texte, niveau: s.niveau, de: m.de, recue: Date.now() });
      salle.envoyer(m.de, { type: 'consigne-vue', canal, id: s.id });
      return;
    }
    if (s.canal !== canal) return;
    switch (s.type) {
      case 'recherche':
        if (phase === 'direct' || (phase === 'reprise' && apercu)) void nouvellePaire(m.de);
        return;
      case 'reponse':
        void surReponse(m, s.n, s.sdp);
        return;
      case 'candidat': {
        const p = paires.get(m.de);
        if (!p || p.n !== s.n) return;
        if (p.distantPose) p.pc.addIceCandidate(s.candidat).catch(() => undefined);
        else p.candidats.push(s.candidat);
        return;
      }
      case 'fin':
        fermerPaire(m.de, false);
        return;
    }
  };
  salle.onEtat = () => publier();
  salle.onOuverte = () => { if (phase === 'direct') salle.envoyer('*', { type: 'annonce', canal, nom: o.nom ?? 'Streamer' }); publier(); };

  // ───────── statistiques et adaptation ─────────

  async function releverStats() {
    let premiere: StatsEmission | null = null;
    for (const p of connectes()) {
      try {
        const r = calculerStatsEmission(versListe(await p.pc.getStats()), p.compteurs);
        p.compteurs = r.compteurs;
        premiere ??= r.stats;
        const a = adapterReduction(p, r.stats, apercu?.getVideoTracks()[0]?.getSettings().frameRate || 30);
        if (a.reduction !== p.reduction) {
          const envoi = p.pc.getSenders().find((x) => x.track?.kind === 'video');
          if (envoi) {
            const params = envoi.getParameters();
            if (params.encodings?.[0]) {
              params.encodings[0].scaleResolutionDownBy = a.reduction;
              await envoi.setParameters(params).catch(() => undefined);
            }
          }
        }
        Object.assign(p, a);
      } catch { /* pc fermé entre-temps */ }
    }
    stats = premiere;
    publier();
  }

  // ───────── écran allumé (Wake Lock) ─────────

  async function garderEcran() {
    if (verrouEcran && !verrouEcran.released) return;
    try {
      verrouEcran = (await navigator.wakeLock?.request('screen')) ?? null;
      verrouEcran?.addEventListener('release', publier);
    } catch { verrouEcran = null; }
    publier();
  }
  function libererEcran() { void verrouEcran?.release().catch(() => undefined); verrouEcran = null; }

  // ───────── reprise après arrière-plan ─────────

  async function reprendre(): Promise<void> {
    if (phase === 'arret' || phase === 'erreur') return;
    enReprise ??= (async () => {
      const etaitDirect = phase === 'direct' || phase === 'reprise';
      const video = apercu?.getVideoTracks()[0];
      const audio = apercu?.getAudioTracks()[0];
      try {
        if (!video || video.readyState === 'ended' || video.muted) {
          if (etaitDirect) changer('reprise', 'reprise de la caméra…');
          await poser(await ouvrirVideo(camera));
        }
        if (!o.mire && (!audio || audio.readyState === 'ended')) {
          const a = await ouvrirAudio();
          if (a) await poser(a);
        }
        changer(etaitDirect ? 'direct' : 'pret', etaitDirect ? 'en direct' : 'caméra prête');
        if (etaitDirect) {
          await garderEcran();
          // les sorties dont la liaison a lâché redemanderont ; on se signale pour les autres
          salle.envoyer('*', { type: 'annonce', canal, nom: o.nom ?? 'Streamer' });
        }
      } catch (e) {
        changer('erreur', `caméra indisponible : ${(e as Error).message ?? e}`);
      }
    })().finally(() => { enReprise = null; });
    return enReprise;
  }

  const surVisibilite = () => { if (document.visibilityState === 'visible') void reprendre(); };

  return {
    etat,
    heureServeur: () => salle.heureServeur(),
    async demarrer() {
      if (phase !== 'arret' && phase !== 'erreur') return;
      salle.ouvrir();
      document.addEventListener('visibilitychange', surVisibilite);
      window.addEventListener('pageshow', surVisibilite);
      minuteurStats ??= setInterval(() => void releverStats(), 1000);
      try {
        await ouvrirMedias();
        changer('pret', 'caméra prête');
      } catch (e) {
        const err = e as DOMException;
        changer('erreur', err?.name === 'NotAllowedError' ? 'caméra refusée : autorisez-la dans les réglages du navigateur' : `caméra indisponible : ${err?.message ?? e}`);
        throw e;
      }
    },
    async passerEnDirect() {
      if (phase !== 'pret') return;
      changer('direct', 'en direct');
      await garderEcran();
      salle.envoyer('*', { type: 'annonce', canal, nom: o.nom ?? 'Streamer' });
    },
    arreterDirect() {
      if (phase !== 'direct' && phase !== 'reprise') return;
      for (const s of [...paires.keys()]) fermerPaire(s, true);
      libererEcran();
      stats = null;
      changer('pret', 'direct coupé');
    },
    async changerCamera() {
      camera = camera === 'arriere' ? 'avant' : 'arriere';
      const avant = phase;
      try {
        for (const t of apercu?.getVideoTracks() ?? []) t.stop();
        await poser(await ouvrirVideo(camera));
        changer(avant === 'camera' ? 'pret' : avant, avant === 'direct' ? 'en direct' : 'caméra prête');
      } catch (e) {
        camera = camera === 'arriere' ? 'avant' : 'arriere';
        changer('erreur', `caméra indisponible : ${(e as Error).message}`);
      }
    },
    basculerMicro() {
      micro = !micro;
      for (const t of apercu?.getAudioTracks() ?? []) t.enabled = micro;
      publier();
    },
    reprendre,
    fermer() {
      for (const s of [...paires.keys()]) fermerPaire(s, true);
      if (minuteurStats) clearInterval(minuteurStats);
      if (mireMinuteur) clearInterval(mireMinuteur);
      minuteurStats = mireMinuteur = null;
      document.removeEventListener('visibilitychange', surVisibilite);
      window.removeEventListener('pageshow', surVisibilite);
      libererEcran();
      for (const t of apercu?.getTracks() ?? []) t.stop();
      apercu = null;
      salle.fermer();
      changer('arret', 'arrêté');
    },
  };
}
