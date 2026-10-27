import { describe, expect, it } from 'vitest';
import { lireMessageRtc, lireSignal, messageConsigne, idAleatoire, CANAL_DEFAUT } from './protocole';
import { delaiReconnexion, estimerDecalage, SalleSignal, urlSalle } from './signalisation';
import { encoderIce, ICE_PAR_DEFAUT, lireIce, normaliserIce, parametreAdresse, serveursIce, aUnTurn } from './ice';
import { ordonnerCodecs } from './codec';
import { calculerStatsEmission, calculerStatsReception, libelleChemin, lireChemin, noteQualite, resumeStats, type StatBrute } from './stats';
import { BITS_MIRE, decoderMire, ecartMire, encoderMire, HAUTEUR_BANDE, lireMirePixels } from './mire';

describe('protocole de signalisation', () => {
  it('lit les signaux valides et rejette les mal formés', () => {
    expect(lireSignal({ type: 'annonce' })).toEqual({ type: 'annonce', canal: CANAL_DEFAUT });
    expect(lireSignal({ type: 'offre', canal: 'b', n: 'n1', sdp: 'v=0' })).toEqual({ type: 'offre', canal: 'b', n: 'n1', sdp: 'v=0' });
    expect(lireSignal({ type: 'offre', n: 'n1' })).toBeNull();
    expect(lireSignal({ type: 'candidat', n: 'n1', candidat: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0, pirate: 1 } }))
      .toEqual({ type: 'candidat', canal: CANAL_DEFAUT, n: 'n1', candidat: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 } });
    expect(lireSignal({ type: 'consigne', id: 'c1', texte: '  Va à gauche  ', niveau: 'urgent' })).toMatchObject({ texte: 'Va à gauche', niveau: 'urgent' });
    expect(lireSignal({ type: 'consigne', id: 'c1', texte: '   ' })).toBeNull();
    expect(lireSignal({ type: 'teleporter' })).toBeNull();
    expect(lireSignal('offre')).toBeNull();
  });

  it('lit un message rtc du serveur et fabrique une consigne', () => {
    expect(lireMessageRtc({ t: 'rtc', de: 'sess_abc', par: 'p1', vers: '*', signal: { type: 'recherche' }, ts: 5 }))
      .toEqual({ de: 'sess_abc', par: 'p1', signal: { type: 'recherche', canal: CANAL_DEFAUT }, ts: 5 });
    expect(lireMessageRtc({ t: 'scene', de: 'x' })).toBeNull();
    const m = messageConsigne('Rejoins la place', { niveau: 'urgent' });
    expect(m).toMatchObject({ t: 'rtc', vers: '*', signal: { type: 'consigne', texte: 'Rejoins la place', niveau: 'urgent', canal: CANAL_DEFAUT } });
    expect(idAleatoire('rtc_', 14)).toMatch(/^rtc_[a-z0-9]{14}$/);
  });
});

describe('signalisation par la salle', () => {
  it('construit l\'URL WebSocket', () => {
    expect(urlSalle('https://x.trycloudflare.com/', 'p_1', 'sr_a b')).toBe('wss://x.trycloudflare.com/api/projets/p_1/salle?jeton=sr_a%20b');
    expect(urlSalle('', 'p_1', 'j', 'http://localhost:8787')).toBe('ws://localhost:8787/api/projets/p_1/salle?jeton=j');
    expect(() => urlSalle('', 'p', 'j')).toThrow();
  });

  it('recul de reconnexion et décalage d\'horloge', () => {
    expect(delaiReconnexion(0)).toBe(0);
    expect(delaiReconnexion(1, 0.5)).toBe(500);
    expect(delaiReconnexion(4, 0.5)).toBe(4000);
    expect(delaiReconnexion(20, 0.5)).toBe(5000);
    expect(estimerDecalage(1000, 1100, 5050)).toEqual({ decalage: 4000, allerRetour: 100 });
  });

  it('hello, bienvenue, relais rtc et horloge avec un WebSocket simulé', async () => {
    const envoyes: any[] = [];
    let sock: any = null;
    class FauxWS {
      readyState = 0;
      onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null; onclose: (() => void) | null = null; onerror: (() => void) | null = null;
      url: string;
      constructor(url: string) { this.url = url; sock = this; setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); }
      send(s: string) { envoyes.push(JSON.parse(s)); }
      close() { this.readyState = 3; }
    }
    const s = new SalleSignal({ serveur: 'http://h:1', projet: 'p_1', jeton: 'j', nom: 'Sortie', session: 'sess_test01', personne: 'pers_test01', WebSocket: FauxWS as unknown as typeof WebSocket });
    const recus: any[] = [];
    s.onRtc = (m) => recus.push(m);
    let ouverte = false;
    s.onOuverte = () => { ouverte = true; };
    expect(s.envoyer('*', { type: 'recherche', canal: 'streamer' })).toBe(false);
    s.ouvrir();
    await new Promise((r) => setTimeout(r, 5));
    expect(sock.url).toBe('ws://h:1/api/projets/p_1/salle?jeton=j');
    expect(envoyes[0]).toMatchObject({ t: 'hello', v: 1, session: 'sess_test01', personne: 'pers_test01', nom: 'Sortie', role: 'poste' });
    sock.onmessage({ data: JSON.stringify({ t: 'bienvenue', ts: 1 }) });
    expect(ouverte).toBe(true);
    expect(s.etat).toBe('ouverte');
    const ping = envoyes.find((m) => m.t === 'ping');
    sock.onmessage({ data: JSON.stringify({ t: 'pong', id: ping.id, ts: Date.now() + 60_000 }) });
    expect(Math.abs(s.decalage - 60_000)).toBeLessThan(200);
    expect(s.envoyer('sess_tel001', { type: 'recherche', canal: 'streamer' })).toBe(true);
    expect(envoyes[envoyes.length - 1]).toEqual({ t: 'rtc', vers: 'sess_tel001', signal: { type: 'recherche', canal: 'streamer' } });
    sock.onmessage({ data: JSON.stringify({ t: 'rtc', de: 'sess_tel001', par: 'p', vers: '*', signal: { type: 'annonce', canal: 'streamer' }, ts: 2 }) });
    sock.onmessage({ data: JSON.stringify({ t: 'rtc', de: 'sess_tel001', par: 'p', vers: '*', signal: { type: 'bidon' } }) });
    expect(recus).toHaveLength(1);
    expect(recus[0].signal.type).toBe('annonce');
    s.fermer();
    expect(envoyes[envoyes.length - 1]).toEqual({ t: 'bye' });
    expect(s.etat).toBe('fermee');
  });
});

describe('serveurs ICE', () => {
  it('normalise les formes RTCIceServer[] et la réponse de l\'API TURN Cloudflare', () => {
    const cf = { iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }, { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' }] };
    expect(normaliserIce(cf)).toHaveLength(2);
    expect(normaliserIce({ iceServers: { urls: 'turn:t:3478', username: 'u', credential: 'c' } })).toEqual([{ urls: ['turn:t:3478'], username: 'u', credential: 'c' }]);
    expect(normaliserIce([{ urls: 'turn:t:3478' }])).toBeNull();          // TURN sans identifiants
    expect(normaliserIce([{ urls: 'http://pirate' }])).toBeNull();
    expect(aUnTurn(normaliserIce(cf)!)).toBe(true);
    expect(aUnTurn(ICE_PAR_DEFAUT)).toBe(false);
  });

  it('encode pour une adresse et relit (base64url ou JSON)', () => {
    const s = [{ urls: ['turn:t:3478'], username: 'é/+', credential: 'c' }];
    const e = encoderIce(s);
    expect(e).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(lireIce(e)).toEqual(s);
    expect(lireIce(JSON.stringify(s))).toEqual(s);
    expect(lireIce('%%%')).toBeNull();
    expect(parametreAdresse('ice', { search: '?a=1', hash: '#ice=xyz' })).toBe('xyz');
    expect(serveursIce()).toEqual(ICE_PAR_DEFAUT);
    expect(serveursIce(s)).toBe(s);
  });
});

describe('codec', () => {
  it('met H.264 (paquetisation 1, baseline contrainte) en tête, auxiliaires derrière', () => {
    const codecs = [
      { mimeType: 'video/VP8' }, { mimeType: 'video/rtx', sdpFmtpLine: 'apt=96' },
      { mimeType: 'video/H264', sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42e01f' },
      { mimeType: 'video/H264', sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640c1f' },
      { mimeType: 'video/H264', sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f' },
      { mimeType: 'video/VP9' },
    ];
    const r = ordonnerCodecs(codecs).map((c) => `${c.mimeType} ${c.sdpFmtpLine ?? ''}`);
    expect(r[0]).toContain('packetization-mode=1;profile-level-id=42e01f');
    expect(r[1]).toContain('640c1f');
    expect(r[2]).toContain('packetization-mode=0');
    expect(r.slice(3, 5)).toEqual(['video/VP8 ', 'video/VP9 ']);
    expect(r[5]).toContain('rtx');
  });
});

describe('statistiques', () => {
  const base = (t: number, octets: number, images: number, typeLocal = 'host', typeDistant = 'host'): StatBrute[] => [
    { id: 'T', type: 'transport', timestamp: t, selectedCandidatePairId: 'CP' },
    { id: 'CP', type: 'candidate-pair', timestamp: t, localCandidateId: 'L', remoteCandidateId: 'R', currentRoundTripTime: 0.024, availableIncomingBitrate: 3_000_000 },
    { id: 'L', type: 'local-candidate', candidateType: typeLocal, protocol: 'udp' },
    { id: 'R', type: 'remote-candidate', candidateType: typeDistant },
    { id: 'C', type: 'codec', mimeType: 'video/H264' },
    { id: 'IV', type: 'inbound-rtp', kind: 'video', timestamp: t, codecId: 'C', bytesReceived: octets, framesDecoded: images, framesPerSecond: 30, frameWidth: 1280, frameHeight: 720,
      packetsLost: images / 30, packetsReceived: images * 3, jitter: 0.004, jitterBufferDelay: images * 0.03, jitterBufferEmittedCount: images, totalDecodeTime: images * 0.002, freezeCount: 0 },
    { id: 'IA', type: 'inbound-rtp', kind: 'audio', timestamp: t, bytesReceived: octets / 50 },
  ];

  it('réception : débit, images/s, latence estimée, chemin', () => {
    const a = calculerStatsReception(base(1000, 0, 0), null);
    const b = calculerStatsReception(base(2000, 250_000, 30), a.compteurs);
    expect(b.stats.debitKbps).toBe(2040);           // (250 000 + 5 000) octets × 8 / 1 s
    expect(b.stats).toMatchObject({ imagesParSeconde: 30, largeur: 1280, hauteur: 720, codec: 'H264', chemin: 'direct', reseau: 'local', rttMs: 24, tamponMs: 30, decodageMs: 2 });
    expect(b.stats.latenceEstimeeMs).toBe(44);      // 12 + 30 + 2
    expect(b.stats.pertePct).toBeCloseTo(1.1, 1);
    expect(resumeStats(b.stats)).toContain('DIRECT · RÉSEAU LOCAL');
    expect(noteQualite(b.stats)).toBe('bonne');
  });

  it('chemin relais / internet / inconnu', () => {
    expect(libelleChemin(lireChemin(base(1, 0, 0, 'relay', 'srflx')))).toBe('RELAIS (TURN)');
    expect(lireChemin(base(1, 0, 0, 'srflx', 'prflx'))).toMatchObject({ chemin: 'direct', reseau: 'internet' });
    expect(lireChemin([]).chemin).toBe('inconnu');
  });

  it('émission : débit, limitation, aller-retour vu par le récepteur', () => {
    const s = (t: number, o: number, f: number): StatBrute[] => [
      { id: 'OV', type: 'outbound-rtp', kind: 'video', timestamp: t, bytesSent: o, framesEncoded: f, framesPerSecond: 18, frameWidth: 640, frameHeight: 360, qualityLimitationReason: 'bandwidth', totalEncodeTime: f * 0.005 },
      { id: 'RV', type: 'remote-inbound-rtp', kind: 'video', roundTripTime: 0.31, fractionLost: 0.03 },
    ];
    const a = calculerStatsEmission(s(0, 0, 0), null);
    const b = calculerStatsEmission(s(2000, 100_000, 36), a.compteurs).stats;
    expect(b).toMatchObject({ debitKbps: 400, imagesParSeconde: 18, limitation: 'bandwidth', rttMs: 310, pertePct: 3, encodageMs: 5 });
    expect(noteQualite(b)).toBe('moyenne');
    expect(noteQualite({ ...b, imagesParSeconde: 10 })).toBe('faible');
  });
});

describe('mire de latence', () => {
  it('encode puis décode l\'heure, détecte une case fausse', () => {
    const h = 1_793_102_124_925;
    const cases = encoderMire(h);
    expect(cases).toHaveLength(BITS_MIRE);
    expect(decoderMire(cases)).toBe(h & 0xffffff);
    const abimees = [...cases]; abimees[5] = !abimees[5];
    expect(decoderMire(abimees)).toBeNull();
    expect(ecartMire(h & 0xffffff, h + 87)).toBe(87);
    expect(ecartMire(0xfffff0, 0x1000005)).toBe(0x15);   // passage du tour de 24 bits
  });

  it('relit la bande dans des pixels (image redimensionnée)', () => {
    const L = 640, H = 360, hb = Math.ceil(H * HAUTEUR_BANDE);
    const px = new Uint8ClampedArray(L * hb * 4);
    const h = 123_456_789;
    encoderMire(h).forEach((blanc, i) => {
      for (let x = Math.floor((i * L) / 32); x < Math.floor(((i + 1) * L) / 32); x++) for (let y = 0; y < hb; y++) {
        const k = (y * L + x) * 4; const v = blanc ? 235 : 16; px[k] = px[k + 1] = px[k + 2] = v; px[k + 3] = 255;
      }
    });
    expect(lireMirePixels(px, L, H)).toBe(h & 0xffffff);
  });
});
