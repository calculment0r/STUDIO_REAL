// Visio de la sortie écran scène (acteur `scene` du serveur de spectacle) : les téléphones nommés (franck, ministre)
// OFFRENT leur caméra, la sortie RÉPOND et pose chaque flux reçu dans le registre flux-visio.ts, que la scène native
// « visio » (visio.tsx) affiche déjà.
//
// Signalisation : message `rtc` du serveur de spectacle (client-spectacle.ts, surRtc / envoyerRtc). Format des signaux :
// celui du flux du streamer (flux/protocole.ts : offre → reponse → candidat, fin, recherche) avec `canal:'visio'` et
// `de: <acteur>` dans le signal (le serveur, lui, met la SESSION de l'émetteur dans `de` du message : on y répond).
//
// Règles :
// - un pair par acteur : une nouvelle offre remplace l'ancienne liaison ;
// - le flux part du registre sur `fin`, sur ICE `failed`, ou `disconnected` plus de 4 s ;
// - la scène passe à « visio » : `recherche` aux postes qui n'envoient rien (puis toutes les 5 s), les téléphones déjà
//   en appel offrent aussitôt ; la scène n'est plus « visio » : les liaisons sont fermées 10 s plus tard (retour rapide
//   possible sans renégocier) ; hors visio, une offre reçoit `fin` (le téléphone attendra la prochaine `recherche`) ;
// - statistiques de réception (flux/stats.ts) : une ligne sobre par poste dans la console, toutes les 30 s.
import { chercherIce, configurationRtc } from '../flux/ice';
import { preferH264 } from '../flux/codec';
import { lireSignal } from '../flux/protocole';
import { calculerStatsReception, resumeStats, versListe, type Compteurs } from '../flux/stats';
import { poserFluxVisio } from './flux-visio';

export const CANAL_VISIO = 'visio';
export const DELAI_COUPURE_MS = 4_000;
export const DELAI_FERMETURE_HORS_VISIO_MS = 10_000;
export const RELANCE_RECHERCHE_MS = 5_000;
export const INTERVALLE_STATS_MS = 30_000;

/** Message `rtc` reçu du serveur de spectacle (MsgRtcServeur). */
export interface RtcRecu { de: string; vers: string; signal: Record<string, unknown>; ts: number }

/** Ce dont la visio a besoin du client du serveur de spectacle. */
export interface ClientRtc {
  surRtc(fn: (m: RtcRecu) => void): () => void;
  envoyerRtc(vers: string, signal: Record<string, unknown>): boolean;
  surEtat?(fn: (e: { ligne: string }) => void): () => void;
}

export interface Minuteries {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export interface OptionsVisioRtc {
  client: ClientRtc;
  /** acteur de la sortie (défaut 'scene') */
  moi?: string;
  /** configuration RTC (serveurs ICE de GET /ice) ; défaut : configuration habituelle (flux/ice.ts) */
  configuration?: () => Promise<RTCConfiguration>;
  RTCPeerConnection?: new (c: RTCConfiguration) => RTCPeerConnection;
  /** flux vide (piste reçue sans flux) ; défaut new MediaStream() */
  nouveauFlux?: () => MediaStream;
  /** registre des flux (défaut : poserFluxVisio de flux-visio.ts) */
  poser?: (poste: string, flux: MediaStream | null) => void;
  minuteries?: Minuteries;
  /** 0 : pas de statistiques */
  intervalleStatsMs?: number;
  journal?: (ligne: string) => void;
}

export type PhaseVisio = 'negociation' | 'connecte' | 'coupe';
export interface EtatPairVisio { acteur: string; session: string; n: string; phase: PhaseVisio; flux: boolean }

export interface VisioRtc {
  /** la scène affichée est « visio » avec ces postes (ids d'acteurs) ; null : autre scène */
  scene(postes: readonly string[] | null): void;
  pairs(): EtatPairVisio[];
  /** ferme tout (fermeture de la page) : `fin` à chaque téléphone, flux retirés du registre */
  fermer(): void;
}

interface Pair {
  acteur: string;
  session: string;
  n: string;
  pc: RTCPeerConnection | null;
  phase: PhaseVisio;
  chaine: Promise<void>;
  distantPose: boolean;
  candidats: RTCIceCandidateInit[];
  flux: MediaStream | null;
  coupure: unknown;
  compteurs: Compteurs | null;
  ferme: boolean;
}

const RE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Origine HTTP(S) du serveur de spectacle à partir de son adresse WebSocket (wss://hote/ws → https://hote). */
export function origineHttpDe(adresseWs: string): string {
  try {
    const u = new URL(adresseWs);
    u.protocol = u.protocol === 'wss:' ? 'https:' : u.protocol === 'ws:' ? 'http:' : u.protocol;
    return u.origin;
  } catch {
    return '';
  }
}

/**
 * Configuration RTC de la visio : serveurs ICE de `GET /ice` du serveur de spectacle (jeton de la sortie), gardés
 * 10 min (les identifiants TURN éphémères en durent 60 par défaut) ; `?relais=1` dans l'adresse force le relais.
 */
export function configurationVisio(source: { url: string; jeton: string }, f?: typeof fetch, maintenant: () => number = Date.now): () => Promise<RTCConfiguration> {
  let cache: { t: number; serveurs: Promise<RTCIceServer[]> } | null = null;
  return async () => {
    if (!cache || maintenant() - cache.t > 10 * 60_000) cache = { t: maintenant(), serveurs: chercherIce(origineHttpDe(source.url), source.jeton, f) };
    return configurationRtc(await cache.serveurs);
  };
}
const MINUTERIES: Minuteries = {
  setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  setInterval: (f, ms) => setInterval(f, ms), clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
};

export function creerVisioRtc(o: OptionsVisioRtc): VisioRtc {
  const moi = o.moi ?? 'scene';
  const PC = o.RTCPeerConnection ?? (globalThis as { RTCPeerConnection?: new (c: RTCConfiguration) => RTCPeerConnection }).RTCPeerConnection;
  const configuration = o.configuration ?? (async () => configurationRtc());
  const nouveauFlux = o.nouveauFlux ?? (() => new MediaStream());
  const poser = o.poser ?? poserFluxVisio;
  const m = o.minuteries ?? MINUTERIES;
  const journal = o.journal ?? ((l: string) => console.info(l));
  const pairs = new Map<string, Pair>();
  let postes: string[] = [];
  let actif = false;
  let fermetureDifferee: unknown = null;
  let ferme = false;

  const envoyer = (vers: string, signal: Record<string, unknown>) => o.client.envoyerRtc(vers, { ...signal, canal: CANAL_VISIO, de: moi });

  function fermerPair(p: Pair, dire: boolean) {
    if (p.ferme) return;
    p.ferme = true;
    if (pairs.get(p.acteur) === p) pairs.delete(p.acteur);
    if (p.coupure !== null) { m.clearTimeout(p.coupure); p.coupure = null; }
    if (dire) envoyer(p.session, { type: 'fin', n: p.n });
    if (p.pc) {
      p.pc.onicecandidate = null; p.pc.ontrack = null; p.pc.onconnectionstatechange = null;
      try { p.pc.close(); } catch { /* déjà fermé */ }
    }
  }

  /** Liaison perdue ou finie : le pair est fermé et son flux quitte le registre (la scène remontre la mire). */
  function perdre(p: Pair, raison: string, dire = false) {
    if (p.ferme) return;
    journal(`[visio] ${p.acteur} : ${raison}`);
    fermerPair(p, dire);
    if (!pairs.has(p.acteur)) poser(p.acteur, null);
  }

  function rechercher() {
    if (!actif || ferme) return;
    for (const a of postes) if (!pairs.has(a)) envoyer(a, { type: 'recherche' });
  }

  async function surOffre(session: string, acteur: string, n: string, sdp: string) {
    const ancien = pairs.get(acteur);
    if (ancien) fermerPair(ancien, false);                     // nouvelle offre = remplacement (le téléphone a abandonné l'ancien n)
    const p: Pair = {
      acteur, session, n, pc: null, phase: 'negociation', chaine: Promise.resolve(), distantPose: false, candidats: [],
      flux: null, coupure: null, compteurs: null, ferme: false,
    };
    pairs.set(acteur, p);
    p.chaine = (async () => {
      if (!PC) throw new Error('WebRTC indisponible');
      const config = await configuration();
      if (p.ferme) return;
      const pc = new PC(config);
      p.pc = pc;
      pc.onicecandidate = (e) => {
        if (!p.ferme && e.candidate) envoyer(p.session, { type: 'candidat', n: p.n, candidat: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        if (p.ferme) return;
        let flux = e.streams[0];
        if (!flux) {
          flux = p.flux ?? nouveauFlux();
          for (const t of flux.getTracks()) if (t.kind === e.track.kind) flux.removeTrack(t);
          flux.addTrack(e.track);
        }
        p.flux = flux;
        poser(acteur, flux);
      };
      pc.onconnectionstatechange = () => {
        if (p.ferme) return;
        const s = pc.connectionState;
        if (s === 'connected') {
          if (p.coupure !== null) { m.clearTimeout(p.coupure); p.coupure = null; }
          if (p.phase !== 'connecte') journal(`[visio] ${acteur} : connecté`);
          p.phase = 'connecte';
        } else if (s === 'disconnected') {
          p.phase = 'coupe';
          p.coupure ??= m.setTimeout(() => { p.coupure = null; if (pc.connectionState !== 'connected') perdre(p, 'liaison coupée plus de 4 s'); }, DELAI_COUPURE_MS);
        } else if (s === 'failed') {
          perdre(p, 'liaison en échec (ICE)');
        }
      };
      await pc.setRemoteDescription({ type: 'offer', sdp });
      for (const t of pc.getTransceivers()) if (t.receiver.track?.kind === 'video') preferH264(t, 'reception');
      p.distantPose = true;
      for (const c of p.candidats.splice(0)) await pc.addIceCandidate(c).catch(() => undefined);
      await pc.setLocalDescription(await pc.createAnswer());
      if (p.ferme) return;
      envoyer(session, { type: 'reponse', n, sdp: pc.localDescription!.sdp });
    })().catch((e) => { if (!p.ferme) perdre(p, `négociation impossible (${(e as Error)?.message ?? e})`); });
  }

  const desabonner: (() => void)[] = [];
  desabonner.push(o.client.surRtc((msg) => {
    if (ferme) return;
    const brut = msg.signal;
    const acteur = brut.de;
    const sig = lireSignal(brut);
    if (!sig || sig.canal !== CANAL_VISIO || typeof acteur !== 'string' || !RE_ID.test(acteur) || acteur === moi) return;
    const p = pairs.get(acteur);
    switch (sig.type) {
      case 'offre':
        if (!actif) { envoyer(msg.de, { type: 'fin', n: sig.n }); return; }   // hors visio : le téléphone attendra la recherche
        void surOffre(msg.de, acteur, sig.n, sig.sdp);
        return;
      case 'candidat':
        if (!p || p.n !== sig.n || p.session !== msg.de) return;
        p.chaine = p.chaine.then(async () => {
          if (p.ferme) return;
          if (p.distantPose && p.pc) await p.pc.addIceCandidate(sig.candidat).catch(() => undefined);
          else p.candidats.push(sig.candidat);
        });
        return;
      case 'fin':
        if (!p || p.session !== msg.de || (sig.n && sig.n !== p.n)) return;
        perdre(p, 'fin de l’appel');
        return;
      default:
        return;
    }
  }));
  // ligne revenue : on redemande les postes qui n'envoient rien (les téléphones renégocient aussi de leur côté)
  let ligne = '';
  if (o.client.surEtat) desabonner.push(o.client.surEtat((e) => {
    if (e.ligne === 'ouvert' && ligne !== 'ouvert') rechercher();
    ligne = e.ligne;
  }));

  const relance = m.setInterval(rechercher, RELANCE_RECHERCHE_MS);
  const intervalleStats = o.intervalleStatsMs ?? INTERVALLE_STATS_MS;
  const stats = intervalleStats > 0 ? m.setInterval(async () => {
    for (const p of [...pairs.values()]) {
      if (!p.pc || p.phase !== 'connecte') continue;
      try {
        const r = calculerStatsReception(versListe(await p.pc.getStats()), p.compteurs);
        p.compteurs = r.compteurs;
        journal(`[visio] ${p.acteur} : ${resumeStats(r.stats)}`);
      } catch { /* fermé entre-temps */ }
    }
  }, intervalleStats) : null;

  return {
    scene(liste) {
      if (ferme) return;
      if (liste) {
        if (fermetureDifferee !== null) { m.clearTimeout(fermetureDifferee); fermetureDifferee = null; }
        postes = liste.filter((a) => RE_ID.test(a) && a !== moi);
        const relancer = !actif || postes.some((a) => !pairs.has(a));
        actif = true;
        if (relancer) rechercher();
        return;
      }
      if (!actif || fermetureDifferee !== null) return;
      // autre scène : on garde les liaisons 10 s (retour rapide sur la visio sans renégocier), puis on ferme
      fermetureDifferee = m.setTimeout(() => {
        fermetureDifferee = null;
        actif = false;
        postes = [];
        for (const p of [...pairs.values()]) { fermerPair(p, true); poser(p.acteur, null); }
      }, DELAI_FERMETURE_HORS_VISIO_MS);
    },
    pairs: () => [...pairs.values()].map((p) => ({ acteur: p.acteur, session: p.session, n: p.n, phase: p.phase, flux: p.flux !== null })),
    fermer() {
      if (ferme) return;
      for (const p of [...pairs.values()]) { fermerPair(p, true); poser(p.acteur, null); }
      ferme = true;
      if (fermetureDifferee !== null) m.clearTimeout(fermetureDifferee);
      m.clearInterval(relance);
      if (stats !== null) m.clearInterval(stats);
      for (const d of desabonner) d();
    },
  };
}
