// La visio d'un téléphone nommé de bout en bout, SANS navigateur : le vrai téléphone (machine + magasin + transport
// mémoire, le test joue le serveur de spectacle), un faux RTCPeerConnection et une fausse caméra injectés.
import { afterEach, describe, expect, it } from 'vitest';
import type { MessageClient, MsgHello } from '@studio-real/protocole';
import { transportMemoire, type CoteServeurMemoire } from '../transport';
import { demarrerTelephone, type Telephone } from '../telephone';
import { CAPACITES_NEUTRES } from '../capacites';
import { renderToStaticMarkup } from 'react-dom/server';
import { EcranTelephone } from '../ecrans';
import { vueEcran } from '../machine';
import { CONTRAINTES_CAMERA, demarrerVisioTelephone, type VisioTelephone } from './appel';
import { installerVisio } from './registre';
import { fournisseurIce } from './ice';

// ── faux navigateur ────────────────────────────────────────────────────────────────────────────────────────────────

class FaussePiste {
  arretee = false;
  constructor(readonly kind: 'audio' | 'video') {}
  stop() { this.arretee = true; }
}
class FauxFlux {
  pistes: FaussePiste[];
  constructor(...p: FaussePiste[]) { this.pistes = p; }
  getTracks() { return this.pistes; }
  addTrack(t: FaussePiste) { this.pistes.push(t); }
  removeTrack(t: FaussePiste) { this.pistes = this.pistes.filter(x => x !== t); }
}

class FauxPC {
  static tous: FauxPC[] = [];
  onicecandidate: ((e: { candidate: { toJSON(): RTCIceCandidateInit } | null }) => void) | null = null;
  ontrack: ((e: { track: FaussePiste; streams: FauxFlux[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState = 'new';
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  pistes: FaussePiste[] = [];
  candidats: RTCIceCandidateInit[] = [];
  ferme = false;
  readonly id: number;
  constructor(readonly config: RTCConfiguration) { this.id = FauxPC.tous.push(this) - 1; }
  addTrack(t: FaussePiste) { this.pistes.push(t); }
  getTransceivers() { return this.pistes.map(t => ({ sender: { track: t }, receiver: { track: { kind: t.kind } } })); }
  async createOffer() { return { type: 'offer', sdp: `offre-${this.id}` }; }
  async createAnswer() { return { type: 'answer', sdp: `reponse-${this.id}` }; }
  async setLocalDescription(d: { type: string; sdp: string }) { this.localDescription = d; }
  async setRemoteDescription(d: { type: string; sdp: string }) { this.remoteDescription = d; }
  async addIceCandidate(c: RTCIceCandidateInit) { if (!this.remoteDescription) throw new Error('trop tôt'); this.candidats.push(c); }
  close() { this.ferme = true; }
  // pour le test
  changer(s: string) { this.connectionState = s; this.onconnectionstatechange?.(); }
  candidatLocal(c: string) { this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: c, sdpMid: '0', sdpMLineIndex: 0 }) } }); }
}

const attendre = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise<void>(ok => setTimeout(ok, 0)); };

// ── montage : un téléphone nommé, sa visio, le test joue le serveur ─────────────────────────────────────────────────

interface Montage { tel: Telephone; visio: VisioTelephone; serveur: CoteServeurMemoire; cameras: FauxFlux[]; demandes: MediaStreamConstraints[]; heure: { t: number } }
let montes: Montage[] = [];
afterEach(() => { for (const m of montes) { m.visio.arreter(); m.tel.arreter(); } montes = []; FauxPC.tous = []; installerVisio(null); });

function monter(acteur: string, o: { camera?: 'ok' | 'refus' } = {}): Montage {
  let serveur!: CoteServeurMemoire;
  const heure = { t: 1_000 };
  const tel = demarrerTelephone({
    etat: { acteur, personne: `tel_${acteur}`, session: `s_${acteur}` },
    creerTransport: hello => { const p = transportMemoire({ hello, jeton: 'jeton-acteur' }); serveur = p.serveur; return p.telephone; },
    app: { version: 'test', build: 'test' }, capacites: CAPACITES_NEUTRES, navigateur: false, prechargeur: null, horloge: () => heure.t, battementMs: 3_600_000,
  });
  const cameras: FauxFlux[] = [];
  const demandes: MediaStreamConstraints[] = [];
  const visio = demarrerVisioTelephone({
    transport: tel.transport, magasin: tel.magasin, graine: `${acteur}_`, intervalleMs: 0, horloge: () => heure.t, journal: () => {},
    RTCPeerConnection: FauxPC as unknown as new (c: RTCConfiguration) => RTCPeerConnection,
    getUserMedia: c => {
      demandes.push(c);
      if (o.camera === 'refus') return Promise.reject(Object.assign(new Error('refus'), { name: 'NotAllowedError' }));
      const f = new FauxFlux(new FaussePiste('video'), new FaussePiste('audio'));
      cameras.push(f);
      return Promise.resolve(f as unknown as MediaStream);
    },
    nouveauFlux: () => new FauxFlux() as unknown as MediaStream,
    configuration: fournisseurIce({ urlHttp: 'https://echo.test', jeton: 'jeton-acteur', fetch: (async () => new Response(JSON.stringify({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }, { urls: ['turn:turn.test:3478'], username: 'u', credential: 'c' }], turn: 'present', expire: 99_000_000_000_000 }))) as typeof fetch }),
  });
  const m = { tel, visio, serveur, cameras, demandes, heure };
  montes.push(m);
  serveur.ouvrir();
  serveur.envoyer({ t: 'bienvenue', v: 2, role: 'acteur', acteur, session: `s_${acteur}`, ts: 1, vue: null, cseq: 0 });
  return m;
}

const vueAppel = (m: Montage, vseq: number, params: Record<string, unknown>) =>
  m.serveur.envoyer({ t: 'vue', acteur: m.tel.magasin.lire().acteur, vseq, at: 1, ecran: 'visio-appel', params, cle: `appel#${vseq}` });
const rtcEnvoyes = (m: Montage) => (m.serveur.recus as readonly MessageClient[]).filter((x): x is Extract<MessageClient, { t: 'rtc' }> => x.t === 'rtc');
const rtc = (m: Montage, de: string, signal: Record<string, unknown>) => m.serveur.envoyer({ t: 'rtc', de, vers: m.tel.magasin.lire().acteur, signal: { canal: 'visio', ...signal }, ts: 1 });

describe('visio du téléphone (faux RTCPeerConnection)', () => {
  it('Répondre → caméra (avant, 1280×720, sans écho) DANS le geste → une offre H.264 par destinataire, ICE de GET /ice', async () => {
    const m = monter('franck');
    vueAppel(m, 1, { nom: 'Scène', vers: ['scene', 'ministre'] });
    expect(m.demandes).toEqual([]);
    m.tel.magasin.envoyer({ a: 'appel', geste: 'repondre' });
    expect(m.demandes).toEqual([CONTRAINTES_CAMERA]);                      // synchrone : dans le geste
    await attendre();
    expect(FauxPC.tous).toHaveLength(2);
    expect(FauxPC.tous[0]!.config.iceServers).toEqual([{ urls: ['stun:stun.cloudflare.com:3478'] }, { urls: ['turn:turn.test:3478'], username: 'u', credential: 'c' }]);
    expect(FauxPC.tous[0]!.pistes.map(p => p.kind)).toEqual(['video', 'audio']);
    const offres = rtcEnvoyes(m);
    expect(offres.map(o => [o.vers, o.signal.type, o.signal.de, o.signal.canal])).toEqual([['scene', 'offre', 'franck', 'visio'], ['ministre', 'offre', 'franck', 'visio']]);
    expect(offres[0]!.signal.sdp).toBe('offre-0');
    expect(m.visio.local()).toBe(m.cameras[0]);
    // le hello du téléphone annonce toujours ses capacités ; la machine n'a rien gardé des rtc
    expect((m.serveur.recus as readonly MessageClient[]).filter((x): x is MsgHello => x.t === 'hello')).toHaveLength(1);
  });

  it('réponse de la scène → description distante, candidats échangés (vers la session), état connecté affiché', async () => {
    const m = monter('franck');
    vueAppel(m, 1, { vers: ['scene'] });
    m.tel.magasin.envoyer({ a: 'appel', geste: 'repondre' });
    await attendre();
    const n = rtcEnvoyes(m)[0]!.signal.n as string;
    const pc = FauxPC.tous[0]!;
    rtc(m, 's_scene', { type: 'candidat', de: 'scene', n, candidat: { candidate: 'trop-tot' } });   // avant la réponse : gardé
    rtc(m, 's_scene', { type: 'reponse', de: 'scene', n, sdp: 'rep-scene' });
    rtc(m, 's_scene', { type: 'candidat', de: 'scene', n, candidat: { candidate: 'c-scene' } });
    await attendre();
    expect(pc.remoteDescription).toEqual({ type: 'answer', sdp: 'rep-scene' });
    expect(pc.candidats.map(c => c.candidate)).toEqual(['trop-tot', 'c-scene']);   // le premier, gardé, posé après la réponse
    pc.candidatLocal('c-franck');
    expect(rtcEnvoyes(m).at(-1)).toMatchObject({ vers: 's_scene', signal: { type: 'candidat', de: 'franck', n, candidat: { candidate: 'c-franck' } } });
    pc.changer('connected');
    expect(m.visio.etat().pairs['vers:scene']!.phase).toBe('connecte');
    installerVisio(m.visio);
    const html = renderToStaticMarkup(<EcranTelephone vue={vueEcran(m.tel.magasin.lire())} agir={() => {}} capacites={CAPACITES_NEUTRES} medias={{ video: null, url: () => null, repli: true }} />);
    expect(html).toContain('scene : connecté');
    expect(html).toContain('<video');                                     // aperçu local en vignette
  });

  it('la ministre reçoit l’offre de Franck pendant que ça sonne, y répond à Répondre ; le flux reçu s’affiche avec son', async () => {
    const m = monter('ministre');
    vueAppel(m, 1, { nom: 'Franck', vers: ['scene'], son: { franck: true } });
    rtc(m, 's_franck', { type: 'offre', de: 'franck', n: 'f1', sdp: 'offre-franck' });
    await attendre();
    expect(FauxPC.tous).toHaveLength(0);                                   // ça sonne : gardée
    m.tel.magasin.envoyer({ a: 'appel', geste: 'repondre' });
    await attendre();
    const recepteur = FauxPC.tous.find(p => p.remoteDescription?.sdp === 'offre-franck')!;
    expect(recepteur.pistes).toEqual([]);                                  // réception seule
    expect(rtcEnvoyes(m)).toContainEqual(expect.objectContaining({ vers: 's_franck', signal: expect.objectContaining({ type: 'reponse', de: 'ministre', n: 'f1' }) }));
    expect(rtcEnvoyes(m)).toContainEqual(expect.objectContaining({ vers: 'scene', signal: expect.objectContaining({ type: 'offre', de: 'ministre' }) }));
    const flux = new FauxFlux(new FaussePiste('video'), new FaussePiste('audio'));
    recepteur.ontrack?.({ track: flux.pistes[0]!, streams: [flux] });
    expect(m.visio.distants().get('franck')).toBe(flux);
    installerVisio(m.visio);
    const html = renderToStaticMarkup(<EcranTelephone vue={vueEcran(m.tel.magasin.lire())} agir={() => {}} capacites={CAPACITES_NEUTRES} medias={{ video: null, url: () => null, repli: true }} />);
    expect(html).toContain('franck');
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);                   // aucune couleur en dur
    // fin de Franck : le flux disparaît
    rtc(m, 's_franck', { type: 'fin', de: 'franck', n: 'f1' });
    expect(recepteur.ferme).toBe(true);
    expect(m.visio.distants().has('franck')).toBe(false);
  });

  it('Raccrocher : fin à chacun, liaisons fermées, caméra libérée ; la vue qui change raccroche aussi', async () => {
    const m = monter('franck');
    vueAppel(m, 1, { vers: ['scene'] });
    m.tel.magasin.envoyer({ a: 'appel', geste: 'repondre' });
    await attendre();
    const n = rtcEnvoyes(m)[0]!.signal.n as string;
    rtc(m, 's_scene', { type: 'reponse', de: 'scene', n, sdp: 'r' });
    await attendre();
    m.tel.magasin.envoyer({ a: 'appel', geste: 'raccrocher' });
    expect(rtcEnvoyes(m).at(-1)).toMatchObject({ vers: 's_scene', signal: { type: 'fin', de: 'franck', n } });
    expect(FauxPC.tous[0]!.ferme).toBe(true);
    expect(m.cameras[0]!.pistes.every(p => p.arretee)).toBe(true);
    expect(m.visio.etat()).toMatchObject({ actif: false, camera: 'eteinte' });

    const m2 = monter('franck');
    vueAppel(m2, 1, { vers: ['scene'] });
    m2.tel.magasin.envoyer({ a: 'appel', geste: 'repondre' });
    await attendre();
    m2.serveur.envoyer({ t: 'vue', acteur: 'franck', vseq: 2, at: 2, ecran: 'veille', params: {}, cle: 'veille#2' });
    expect(m2.visio.etat().actif).toBe(false);
    expect(m2.cameras[0]!.pistes.every(p => p.arretee)).toBe(true);
  });

  it('reconnexion du WebSocket : nouvelle offre (nouveau n) ; hors ligne, rien ne part', async () => {
    const m = monter('franck');
    vueAppel(m, 1, { vers: ['scene'] });
    m.tel.magasin.envoyer({ a: 'appel', geste: 'repondre' });
    await attendre();
    const n1 = rtcEnvoyes(m)[0]!.signal.n;
    m.serveur.couper();
    const avant = rtcEnvoyes(m).length;
    m.heure.t += 60_000;
    m.visio.tick();
    await attendre();
    expect(rtcEnvoyes(m).length).toBe(avant);
    m.serveur.ouvrir();
    await attendre();
    const offres = rtcEnvoyes(m).filter(x => x.signal.type === 'offre');
    expect(offres).toHaveLength(2);
    expect(offres[1]!.signal.n).not.toBe(n1);
    expect(FauxPC.tous[0]!.ferme).toBe(true);
  });

  it('caméra refusée : l’écran le dit, aucune offre ; sans visio installée (émulateur) : la place du flux', async () => {
    const m = monter('franck', { camera: 'refus' });
    vueAppel(m, 1, { vers: ['scene'] });
    m.tel.magasin.envoyer({ a: 'appel', geste: 'repondre' });
    await attendre();
    expect(m.visio.etat()).toMatchObject({ camera: 'refusee', erreurCamera: 'NotAllowedError' });
    expect(rtcEnvoyes(m)).toEqual([]);
    const vue = vueEcran(m.tel.magasin.lire());
    const rendre = () => renderToStaticMarkup(<EcranTelephone vue={vue} agir={() => {}} capacites={CAPACITES_NEUTRES} medias={{ video: null, url: () => null, repli: true }} />);
    expect(rendre()).toContain('flux vidéo indisponible');
    installerVisio(m.visio);
    expect(rendre()).toContain('caméra refusée (NotAllowedError)');
  });
});
