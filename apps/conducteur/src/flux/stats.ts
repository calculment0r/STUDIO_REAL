// Statistiques WebRTC (PUR : prend la liste des objets de RTCPeerConnection.getStats(), testé sous Node).
// Réception (sortie) : débit, images/s, définition, pertes, gigue, aller-retour, tampon de gigue, décodage,
// latence estimée, codec, chemin (direct / relais). Émission (téléphone) : débit, images/s, définition, limitation,
// aller-retour vu par le récepteur, pertes, note de qualité.

export type StatBrute = Record<string, unknown> & { id: string; type: string; timestamp?: number };

/** direct = pair-à-pair (même réseau ou à travers les NAT grâce au STUN) ; relais = par un serveur TURN. */
export type CheminIce = 'direct' | 'relais' | 'inconnu';
/** local : deux candidats « host » (même réseau) ; internet : adresse publique (STUN) ; turn : relais. */
export type ReseauIce = 'local' | 'internet' | 'turn' | 'inconnu';

export interface InfoChemin { chemin: CheminIce; reseau: ReseauIce; protocole: string | null; rttMs: number | null; debitDispoKbps: number | null }

export interface StatsReception extends InfoChemin {
  debitKbps: number; imagesParSeconde: number; largeur: number; hauteur: number;
  pertePct: number; gigueMs: number; tamponMs: number | null; decodageMs: number | null;
  /** réseau (aller-retour / 2) + tampon de gigue + décodage ; hors capture, encodage et affichage (≈ +40 à 80 ms) */
  latenceEstimeeMs: number | null;
  codec: string | null; gels: number; imagesDecodees: number;
}

export interface StatsEmission extends InfoChemin {
  debitKbps: number; imagesParSeconde: number; largeur: number; hauteur: number;
  pertePct: number; encodageMs: number | null;
  /** cpu | bandwidth | none | other (WebRTC) */
  limitation: string | null; codec: string | null;
}

export type Qualite = 'bonne' | 'moyenne' | 'faible';

/** Compteurs cumulés gardés d'une mesure à l'autre (pour les débits). */
export interface Compteurs { t: number; octets: number; images: number; perdus: number; paquets: number; jbDelai: number; jbNb: number; decTemps: number; decNb: number; encTemps: number; encNb: number }

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const numOuNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const arrondi = (v: number, p = 0) => Math.round(v * 10 ** p) / 10 ** p;

export function versListe(r: RTCStatsReport | Iterable<StatBrute> | StatBrute[]): StatBrute[] {
  const l: StatBrute[] = [];
  const valeurs = typeof (r as RTCStatsReport).values === 'function' ? (r as RTCStatsReport).values() : (r as Iterable<StatBrute>);
  for (const s of valeurs as Iterable<StatBrute>) l.push(s);
  return l;
}

/** Paire de candidats retenue et ce qu'elle dit du chemin. */
export function lireChemin(stats: StatBrute[]): InfoChemin {
  const parId = new Map(stats.map((s) => [s.id, s]));
  const transport = stats.find((s) => s.type === 'transport' && typeof s.selectedCandidatePairId === 'string');
  let paire = transport ? parId.get(transport.selectedCandidatePairId as string) : undefined;
  paire ??= stats.find((s) => s.type === 'candidate-pair' && (s.selected === true || (s.nominated === true && s.state === 'succeeded')));
  if (!paire) return { chemin: 'inconnu', reseau: 'inconnu', protocole: null, rttMs: null, debitDispoKbps: null };
  const local = parId.get(paire.localCandidateId as string);
  const distant = parId.get(paire.remoteCandidateId as string);
  const tl = local?.candidateType as string | undefined;
  const td = distant?.candidateType as string | undefined;
  const relais = tl === 'relay' || td === 'relay';
  const reseau: ReseauIce = !tl || !td ? 'inconnu' : relais ? 'turn' : tl === 'host' && td === 'host' ? 'local' : 'internet';
  const rtt = numOuNull(paire.currentRoundTripTime);
  const dispo = numOuNull(paire.availableOutgoingBitrate) ?? numOuNull(paire.availableIncomingBitrate);
  return {
    chemin: !tl || !td ? 'inconnu' : relais ? 'relais' : 'direct', reseau,
    protocole: (local?.relayProtocol as string | undefined) ?? (local?.protocol as string | undefined) ?? null,
    rttMs: rtt === null ? null : arrondi(rtt * 1000), debitDispoKbps: dispo === null ? null : arrondi(dispo / 1000),
  };
}

function codecDe(stats: StatBrute[], rtp: StatBrute | undefined): string | null {
  const c = rtp && stats.find((s) => s.id === rtp.codecId);
  return c && typeof c.mimeType === 'string' ? c.mimeType.replace(/^video\//i, '') : null;
}

const vide = (t: number): Compteurs => ({ t, octets: 0, images: 0, perdus: 0, paquets: 0, jbDelai: 0, jbNb: 0, decTemps: 0, decNb: 0, encTemps: 0, encNb: 0 });

/** Statistiques de réception à partir de getStats() ; `precedent` = compteurs de la mesure d'avant (null au début). */
export function calculerStatsReception(stats: StatBrute[], precedent: Compteurs | null): { stats: StatsReception; compteurs: Compteurs } {
  const entrants = stats.filter((s) => s.type === 'inbound-rtp');
  const video = entrants.find((s) => s.kind === 'video' || s.mediaType === 'video');
  const t = num(video?.timestamp ?? entrants[0]?.timestamp ?? Date.now());
  const c: Compteurs = {
    ...vide(t),
    octets: entrants.reduce((a, s) => a + num(s.bytesReceived), 0),
    images: num(video?.framesDecoded),
    perdus: num(video?.packetsLost), paquets: num(video?.packetsReceived),
    jbDelai: num(video?.jitterBufferDelay), jbNb: num(video?.jitterBufferEmittedCount),
    decTemps: num(video?.totalDecodeTime), decNb: num(video?.framesDecoded),
  };
  const p = precedent && precedent.t < t ? precedent : null;
  const dt = p ? (t - p.t) / 1000 : 0;
  const d = (k: keyof Compteurs) => (p ? Math.max(0, c[k] - p[k]) : 0);
  const chemin = lireChemin(stats);
  const fps = numOuNull(video?.framesPerSecond) ?? (dt > 0 ? d('images') / dt : 0);
  const paquets = d('paquets') + d('perdus');
  const tampon = d('jbNb') > 0 ? (d('jbDelai') / d('jbNb')) * 1000 : c.jbNb > 0 ? (c.jbDelai / c.jbNb) * 1000 : null;
  const decodage = d('decNb') > 0 ? (d('decTemps') / d('decNb')) * 1000 : c.decNb > 0 ? (c.decTemps / c.decNb) * 1000 : null;
  const latence = chemin.rttMs !== null && tampon !== null ? chemin.rttMs / 2 + tampon + (decodage ?? 0) : null;
  return {
    compteurs: c,
    stats: {
      ...chemin,
      debitKbps: dt > 0 ? arrondi((d('octets') * 8) / dt / 1000) : 0,
      imagesParSeconde: arrondi(fps, 1),
      largeur: num(video?.frameWidth), hauteur: num(video?.frameHeight),
      pertePct: paquets > 0 ? arrondi((d('perdus') / paquets) * 100, 1) : 0,
      gigueMs: arrondi(num(video?.jitter) * 1000, 1),
      tamponMs: tampon === null ? null : arrondi(tampon),
      decodageMs: decodage === null ? null : arrondi(decodage, 1),
      latenceEstimeeMs: latence === null ? null : arrondi(latence),
      codec: codecDe(stats, video), gels: num(video?.freezeCount), imagesDecodees: c.images,
    },
  };
}

/** Statistiques d'émission (téléphone) à partir de getStats() d'un PeerConnection. */
export function calculerStatsEmission(stats: StatBrute[], precedent: Compteurs | null): { stats: StatsEmission; compteurs: Compteurs } {
  const sortants = stats.filter((s) => s.type === 'outbound-rtp');
  // avec plusieurs couches, on prend celle qui envoie le plus d'images
  const video = sortants.filter((s) => s.kind === 'video' || s.mediaType === 'video').sort((a, b) => num(b.framesEncoded) - num(a.framesEncoded))[0];
  const distant = stats.find((s) => s.type === 'remote-inbound-rtp' && (s.kind === 'video' || s.mediaType === 'video'));
  const t = num(video?.timestamp ?? sortants[0]?.timestamp ?? Date.now());
  const c: Compteurs = {
    ...vide(t),
    octets: sortants.reduce((a, s) => a + num(s.bytesSent), 0),
    images: num(video?.framesEncoded), encTemps: num(video?.totalEncodeTime), encNb: num(video?.framesEncoded),
  };
  const p = precedent && precedent.t < t ? precedent : null;
  const dt = p ? (t - p.t) / 1000 : 0;
  const d = (k: keyof Compteurs) => (p ? Math.max(0, c[k] - p[k]) : 0);
  const chemin = lireChemin(stats);
  const rttDistant = numOuNull(distant?.roundTripTime);
  const enc = d('encNb') > 0 ? (d('encTemps') / d('encNb')) * 1000 : c.encNb > 0 ? (c.encTemps / c.encNb) * 1000 : null;
  return {
    compteurs: c,
    stats: {
      ...chemin,
      rttMs: chemin.rttMs ?? (rttDistant === null ? null : arrondi(rttDistant * 1000)),
      debitKbps: dt > 0 ? arrondi((d('octets') * 8) / dt / 1000) : 0,
      imagesParSeconde: arrondi(numOuNull(video?.framesPerSecond) ?? (dt > 0 ? d('images') / dt : 0), 1),
      largeur: num(video?.frameWidth), hauteur: num(video?.frameHeight),
      pertePct: arrondi(num(distant?.fractionLost) * 100, 1),
      encodageMs: enc === null ? null : arrondi(enc, 1),
      limitation: typeof video?.qualityLimitationReason === 'string' ? video.qualityLimitationReason : null,
      codec: codecDe(stats, video),
    },
  };
}

/** Note simple pour l'indicateur du téléphone et de la sortie. */
export function noteQualite(s: { imagesParSeconde: number; pertePct: number; rttMs: number | null; debitKbps: number; limitation?: string | null }): Qualite {
  const rtt = s.rttMs ?? 0;
  // pas de seuil de débit : une image calme se code avec peu de bits sans être de mauvaise qualité
  if (s.imagesParSeconde < 15 || s.pertePct > 5 || rtt > 400) return 'faible';
  if (s.imagesParSeconde < 25 || s.pertePct > 2 || rtt > 200 || s.limitation === 'bandwidth') return 'moyenne';
  return 'bonne';
}

/** Libellé court du chemin (affiché sur les deux pages). */
export function libelleChemin(s: Pick<InfoChemin, 'chemin' | 'reseau'>): string {
  if (s.chemin === 'relais') return 'RELAIS (TURN)';
  if (s.reseau === 'local') return 'DIRECT · RÉSEAU LOCAL';
  if (s.reseau === 'internet') return 'DIRECT · INTERNET';
  return 'CHEMIN INCONNU';
}

/** Résumé d'une ligne, pour un affichage de contrôle (sortie, moniteur). */
export function resumeStats(s: StatsReception): string {
  const morceaux = [
    libelleChemin(s),
    `${s.largeur}×${s.hauteur}`,
    `${Math.round(s.imagesParSeconde)} i/s`,
    `${s.debitKbps >= 1000 ? (s.debitKbps / 1000).toFixed(1) + ' Mb/s' : s.debitKbps + ' kb/s'}`,
    s.latenceEstimeeMs !== null ? `≈ ${s.latenceEstimeeMs} ms` : null,
    s.rttMs !== null ? `RTT ${s.rttMs} ms` : null,
    s.pertePct > 0 ? `pertes ${s.pertePct} %` : null,
    s.codec,
  ];
  return morceaux.filter(Boolean).join(' · ');
}
