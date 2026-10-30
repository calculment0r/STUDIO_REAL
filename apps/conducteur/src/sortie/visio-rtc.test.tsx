// Visio de la sortie écran scène (visio-rtc.ts) avec un FAUX RTCPeerConnection et de fausses minuteries, sans
// navigateur ; plus le relais `rtc` du client du serveur de spectacle (surRtc / envoyerRtc) et le son par poste de la
// scène « visio ».
import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { transportMemoire, type CoteServeurMemoire, type MessageClient } from '@studio-real/protocole';
import { ClientSortieSpectacle } from './client-spectacle';
import { configParDefaut } from './protocole';
import { fluxVisio, poserFluxVisio, viderFluxVisio } from './flux-visio';
import { SceneVisio } from './visio';
import {
  configurationVisio, creerVisioRtc, DELAI_COUPURE_MS, DELAI_FERMETURE_HORS_VISIO_MS, origineHttpDe, RELANCE_RECHERCHE_MS,
  type ClientRtc, type Minuteries, type RtcRecu, type VisioRtc,
} from './visio-rtc';

// ── faux navigateur ────────────────────────────────────────────────────────────────────────────────────────────────

class FauxFlux {
  pistes: { kind: string }[] = [];
  getTracks() { return this.pistes; }
  addTrack(t: { kind: string }) { this.pistes.push(t); }
  removeTrack(t: { kind: string }) { this.pistes = this.pistes.filter((x) => x !== t); }
}

class FauxPC {
  static tous: FauxPC[] = [];
  onicecandidate: ((e: { candidate: { toJSON(): RTCIceCandidateInit } | null }) => void) | null = null;
  ontrack: ((e: { track: { kind: string }; streams: FauxFlux[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState = 'new';
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  candidats: RTCIceCandidateInit[] = [];
  ferme = false;
  config: RTCConfiguration;
  constructor(config: RTCConfiguration) { this.config = config; FauxPC.tous.push(this); }
  getTransceivers() { return [{ receiver: { track: { kind: 'video' } }, setCodecPreferences: () => {} }]; }
  async createAnswer() { return { type: 'answer', sdp: `reponse-${FauxPC.tous.indexOf(this)}` }; }
  async setLocalDescription(d: { type: string; sdp: string }) { this.localDescription = d; }
  async setRemoteDescription(d: { type: string; sdp: string }) { this.remoteDescription = d; }
  async addIceCandidate(c: RTCIceCandidateInit) { if (!this.remoteDescription) throw new Error('trop tôt'); this.candidats.push(c); }
  async getStats() { return [] as unknown as RTCStatsReport; }
  close() { this.ferme = true; }
  changer(s: string) { this.connectionState = s; this.onconnectionstatechange?.(); }
}

/** Minuteries à la main : avancer(ms) déclenche ce qui est échu. */
function faussesMinuteries() {
  let t = 0;
  let id = 0;
  const attentes = new Map<number, { quand: number; fn: () => void; tous?: number }>();
  const m: Minuteries & { avancer(ms: number): void } = {
    setTimeout: (fn, ms) => { attentes.set(++id, { quand: t + ms, fn }); return id; },
    clearTimeout: (x) => { attentes.delete(x as number); },
    setInterval: (fn, ms) => { attentes.set(++id, { quand: t + ms, fn, tous: ms }); return id; },
    clearInterval: (x) => { attentes.delete(x as number); },
    avancer(ms) {
      const fin = t + ms;
      for (;;) {
        const prochain = [...attentes.entries()].filter(([, a]) => a.quand <= fin).sort((a, b) => a[1].quand - b[1].quand)[0];
        if (!prochain) break;
        const [cle, a] = prochain;
        t = a.quand;
        if (a.tous) a.quand += a.tous; else attentes.delete(cle);
        a.fn();
      }
      t = fin;
    },
  };
  return m;
}

const attendre = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise<void>((ok) => setTimeout(ok, 0)); };

/** Faux client du serveur de spectacle : garde les rtc envoyés, en livre à la sortie. */
function fauxClient() {
  const abonnes = new Set<(m: RtcRecu) => void>();
  const envoyes: { vers: string; signal: Record<string, unknown> }[] = [];
  const client: ClientRtc = {
    surRtc: (fn) => { abonnes.add(fn); return () => { abonnes.delete(fn); }; },
    envoyerRtc: (vers, signal) => { envoyes.push({ vers, signal }); return true; },
  };
  const recevoir = (de: string, signal: Record<string, unknown>) => { for (const f of [...abonnes]) f({ de, vers: 'scene', signal: { canal: 'visio', ...signal }, ts: 1 }); };
  return { client, envoyes, recevoir };
}

let ouvertes: VisioRtc[] = [];
afterEach(() => { for (const v of ouvertes) v.fermer(); ouvertes = []; FauxPC.tous = []; viderFluxVisio(); });

function monter(postes: string[] | null = ['franck', 'ministre']) {
  const c = fauxClient();
  const minuteries = faussesMinuteries();
  const poses: [string, unknown][] = [];
  const v = creerVisioRtc({
    client: c.client, minuteries, intervalleStatsMs: 0, journal: () => {},
    RTCPeerConnection: FauxPC as unknown as new (c: RTCConfiguration) => RTCPeerConnection,
    nouveauFlux: () => new FauxFlux() as unknown as MediaStream,
    configuration: async () => ({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }] }),
    poser: (poste, flux) => { poses.push([poste, flux]); poserFluxVisio(poste, flux); },
  });
  ouvertes.push(v);
  v.scene(postes);
  return { ...c, v, minuteries, poses };
}

describe('visio de la sortie (faux RTCPeerConnection)', () => {
  it('scène visio : recherche aux postes ; offre → réponse à la SESSION de l’émetteur, H.264, candidats dans les deux sens', async () => {
    const t = monter();
    expect(t.envoyes).toEqual([
      { vers: 'franck', signal: { type: 'recherche', canal: 'visio', de: 'scene' } },
      { vers: 'ministre', signal: { type: 'recherche', canal: 'visio', de: 'scene' } },
    ]);
    t.envoyes.length = 0;
    t.recevoir('s_franck', { type: 'offre', de: 'franck', n: 'f1', sdp: 'offre-franck' });
    t.recevoir('s_franck', { type: 'candidat', de: 'franck', n: 'f1', candidat: { candidate: 'c1' } });   // arrive pendant la négociation
    await attendre();
    const pc = FauxPC.tous[0]!;
    expect(pc.config.iceServers).toEqual([{ urls: ['stun:stun.cloudflare.com:3478'] }]);
    expect(pc.remoteDescription).toEqual({ type: 'offer', sdp: 'offre-franck' });
    expect(pc.candidats.map((c) => c.candidate)).toEqual(['c1']);
    expect(t.envoyes).toEqual([{ vers: 's_franck', signal: { type: 'reponse', canal: 'visio', de: 'scene', n: 'f1', sdp: 'reponse-0' } }]);
    pc.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'c-scene' }) } });
    expect(t.envoyes[t.envoyes.length - 1]).toEqual({ vers: 's_franck', signal: { type: 'candidat', canal: 'visio', de: 'scene', n: 'f1', candidat: { candidate: 'c-scene' } } });
    // candidat d'une autre session ou d'un vieux n : ignoré
    t.recevoir('s_autre', { type: 'candidat', de: 'franck', n: 'f1', candidat: { candidate: 'x' } });
    t.recevoir('s_franck', { type: 'candidat', de: 'franck', n: 'vieux', candidat: { candidate: 'y' } });
    await attendre();
    expect(pc.candidats.map((c) => c.candidate)).toEqual(['c1']);
    expect(t.v.pairs()).toEqual([{ acteur: 'franck', session: 's_franck', n: 'f1', phase: 'negociation', flux: false }]);
  });

  it('pistes reçues → flux dans le registre (poserFluxVisio), piste sans flux regroupée ; fin → retrait', async () => {
    const t = monter();
    t.recevoir('s_min', { type: 'offre', de: 'ministre', n: 'm1', sdp: 'o' });
    await attendre();
    const pc = FauxPC.tous[0]!;
    pc.ontrack?.({ track: { kind: 'video' }, streams: [] });
    pc.ontrack?.({ track: { kind: 'audio' }, streams: [] });
    const flux = fluxVisio('ministre') as unknown as FauxFlux;
    expect(flux.getTracks().map((p) => p.kind)).toEqual(['video', 'audio']);
    pc.changer('connected');
    expect(t.v.pairs()[0]).toMatchObject({ phase: 'connecte', flux: true });
    t.recevoir('s_autre', { type: 'fin', de: 'ministre', n: 'm1' });     // pas la bonne session : ignoré
    expect(fluxVisio('ministre')).not.toBeNull();
    t.recevoir('s_min', { type: 'fin', de: 'ministre', n: 'm1' });
    expect(fluxVisio('ministre')).toBeNull();
    expect(pc.ferme).toBe(true);
    expect(t.v.pairs()).toEqual([]);
  });

  it('un pair par acteur : une nouvelle offre remplace l’ancienne liaison (le flux suit)', async () => {
    const t = monter();
    t.recevoir('s_franck', { type: 'offre', de: 'franck', n: 'f1', sdp: 'o1' });
    await attendre();
    const premier = new FauxFlux();
    FauxPC.tous[0]!.ontrack?.({ track: { kind: 'video' }, streams: [premier] });
    expect(fluxVisio('franck')).toBe(premier);
    t.recevoir('s_franck_2', { type: 'offre', de: 'franck', n: 'f2', sdp: 'o2' });   // le téléphone a rechargé
    await attendre();
    expect(FauxPC.tous[0]!.ferme).toBe(true);
    expect(FauxPC.tous).toHaveLength(2);
    expect(t.v.pairs()).toEqual([expect.objectContaining({ acteur: 'franck', session: 's_franck_2', n: 'f2' })]);
    const second = new FauxFlux();
    FauxPC.tous[1]!.ontrack?.({ track: { kind: 'video' }, streams: [second] });
    expect(fluxVisio('franck')).toBe(second);
    // les signaux de l'ancienne liaison ne touchent plus rien
    t.recevoir('s_franck', { type: 'fin', de: 'franck', n: 'f1' });
    expect(fluxVisio('franck')).toBe(second);
  });

  it('coupure : ICE failed → retrait tout de suite ; disconnected → retrait après 4 s, sauf reprise', async () => {
    const t = monter();
    t.recevoir('s_franck', { type: 'offre', de: 'franck', n: 'f1', sdp: 'o' });
    t.recevoir('s_min', { type: 'offre', de: 'ministre', n: 'm1', sdp: 'o' });
    await attendre();
    const [pf, pm] = FauxPC.tous as [FauxPC, FauxPC];
    pf.ontrack?.({ track: { kind: 'video' }, streams: [new FauxFlux()] });
    pm.ontrack?.({ track: { kind: 'video' }, streams: [new FauxFlux()] });
    pf.changer('failed');
    expect(fluxVisio('franck')).toBeNull();
    pm.changer('disconnected');
    t.minuteries.avancer(DELAI_COUPURE_MS - 1);
    expect(fluxVisio('ministre')).not.toBeNull();
    pm.changer('connected');                                           // reprise : rien n'est retiré
    t.minuteries.avancer(DELAI_COUPURE_MS);
    expect(fluxVisio('ministre')).not.toBeNull();
    pm.changer('disconnected');
    t.minuteries.avancer(DELAI_COUPURE_MS);
    expect(fluxVisio('ministre')).toBeNull();
    expect(pm.ferme).toBe(true);
  });

  it('changement de scène : liaisons fermées 10 s plus tard (fin aux téléphones), pas avant ; retour rapide : gardées', async () => {
    const t = monter();
    t.recevoir('s_franck', { type: 'offre', de: 'franck', n: 'f1', sdp: 'o' });
    await attendre();
    FauxPC.tous[0]!.ontrack?.({ track: { kind: 'video' }, streams: [new FauxFlux()] });
    t.v.scene(null);
    t.minuteries.avancer(DELAI_FERMETURE_HORS_VISIO_MS - 1);
    expect(FauxPC.tous[0]!.ferme).toBe(false);
    t.v.scene(['franck', 'ministre']);                                // retour sur la visio : rien n'est fermé
    t.minuteries.avancer(DELAI_FERMETURE_HORS_VISIO_MS * 2);
    expect(FauxPC.tous[0]!.ferme).toBe(false);
    t.envoyes.length = 0;
    t.v.scene(null);
    t.minuteries.avancer(DELAI_FERMETURE_HORS_VISIO_MS);
    expect(FauxPC.tous[0]!.ferme).toBe(true);
    expect(fluxVisio('franck')).toBeNull();
    expect(t.envoyes.filter((e) => e.signal.type === 'fin')).toEqual([{ vers: 's_franck', signal: { type: 'fin', canal: 'visio', de: 'scene', n: 'f1' } }]);
    // hors visio : une offre reçoit `fin`, aucune liaison n'est ouverte
    t.recevoir('s_franck', { type: 'offre', de: 'franck', n: 'f2', sdp: 'o' });
    await attendre();
    expect(FauxPC.tous).toHaveLength(1);
    expect(t.envoyes[t.envoyes.length - 1]).toEqual({ vers: 's_franck', signal: { type: 'fin', canal: 'visio', de: 'scene', n: 'f2' } });
  });

  it('relance : recherche toutes les 5 s aux postes sans liaison ; signaux d’un autre canal ou de soi ignorés ; fermeture de la page', async () => {
    const t = monter(['franck']);
    t.recevoir('s_x', { type: 'offre', canal: 'streamer', de: 'franck', n: 'z', sdp: 'o' });
    t.recevoir('s_x', { type: 'offre', de: 'scene', n: 'z', sdp: 'o' });
    await attendre();
    expect(FauxPC.tous).toHaveLength(0);
    t.envoyes.length = 0;
    t.minuteries.avancer(RELANCE_RECHERCHE_MS);
    expect(t.envoyes).toEqual([{ vers: 'franck', signal: { type: 'recherche', canal: 'visio', de: 'scene' } }]);
    t.recevoir('s_franck', { type: 'offre', de: 'franck', n: 'f1', sdp: 'o' });
    await attendre();
    t.envoyes.length = 0;
    t.minuteries.avancer(RELANCE_RECHERCHE_MS);
    expect(t.envoyes).toEqual([]);                                     // il envoie : plus de recherche
    t.v.fermer();
    expect(FauxPC.tous[0]!.ferme).toBe(true);
    expect(t.envoyes[t.envoyes.length - 1]).toMatchObject({ vers: 's_franck', signal: { type: 'fin', n: 'f1' } });
  });

  it('configuration : GET /ice du serveur de spectacle (jeton de la sortie), gardée 10 min ; adresse HTTP déduite du WebSocket', async () => {
    expect(origineHttpDe('wss://echo.test/ws')).toBe('https://echo.test');
    const appels: string[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      appels.push(`${url} ${(init?.headers as Record<string, string>).authorization}`);
      return new Response(JSON.stringify({ iceServers: [{ urls: ['turn:t.test:3478'], username: 'u', credential: 'c' }], turn: 'present' }));
    }) as unknown as typeof fetch;
    let t = 0;
    const conf = configurationVisio({ url: 'wss://echo.test/ws', jeton: 'sr_scene' }, f, () => t);
    expect((await conf()).iceServers).toEqual([{ urls: ['turn:t.test:3478'], username: 'u', credential: 'c' }]);
    await conf();
    expect(appels).toEqual(['https://echo.test/ice Bearer sr_scene']);
    t += 11 * 60_000;
    await conf();
    expect(appels).toHaveLength(2);
    const refus = configurationVisio({ url: 'wss://echo.test/ws', jeton: 'x' }, (async () => new Response('non', { status: 401 })) as unknown as typeof fetch);
    expect((await refus()).iceServers!.length).toBeGreaterThan(0);     // repli : STUN de la configuration habituelle
  });
});

describe('client du serveur de spectacle : relais rtc', () => {
  it('surRtc reçoit les rtc ; envoyerRtc ne part que ligne ouverte ; rtc-absent n’est pas un refus de la sortie', () => {
    let serveur!: CoteServeurMemoire;
    const c = new ClientSortieSpectacle({
      ouvrir: (hello) => { const p = transportMemoire({ hello, jeton: 'sr_scene' }); serveur = p.serveur; return p.client; },
      config: () => configParDefaut('ÉCHO'), session: 's_sortie_essai',
    });
    const recus: RtcRecu[] = [];
    c.surRtc((m) => recus.push(m));
    expect(c.envoyerRtc('franck', { type: 'recherche', canal: 'visio', de: 'scene' })).toBe(false);   // pas encore ouverte
    serveur.ouvrir();
    expect(c.envoyerRtc('franck', { type: 'recherche', canal: 'visio', de: 'scene' })).toBe(true);
    expect((serveur.recus as readonly MessageClient[]).filter((m) => m.t === 'rtc')).toEqual([{ t: 'rtc', vers: 'franck', signal: { type: 'recherche', canal: 'visio', de: 'scene' } }]);
    serveur.envoyer({ t: 'rtc', de: 's_franck', vers: 'scene', signal: { type: 'offre', canal: 'visio', de: 'franck', n: 'f1', sdp: 'o' }, ts: 5 });
    expect(recus).toEqual([{ t: 'rtc', de: 's_franck', vers: 'scene', signal: { type: 'offre', canal: 'visio', de: 'franck', n: 'f1', sdp: 'o' }, ts: 5 }]);
    serveur.envoyer({ t: 'refus', code: 'rtc-absent', message: 'Destinataire franck absent.' });
    expect(c.etatCourant.refus).toBeUndefined();
    c.fermer();
  });
});

describe('scène visio : le son de chaque poste est respecté', () => {
  it('poste à son coupé : vidéo muette ; poste au son actif : pas muette', () => {
    const html = renderToStaticMarkup(<SceneVisio miniature={false} scene={{ type: 'visio', disposition: 'cote', postes: [{ id: 'franck', nom: 'Jim', son: false }, { id: 'ministre', nom: 'Junon', son: true }] }} />);
    const cadres = html.split('data-poste=').slice(1);
    expect(cadres[0]).toMatch(/^"franck"[^]*<video[^>]*muted=""/);
    expect(cadres[1]).toMatch(/^"ministre"/);
    expect(cadres[1]).not.toMatch(/<video[^>]*muted=""/);
  });
});
