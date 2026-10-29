// La visio d'un téléphone nommé, branchée sur le téléphone (magasin + transport) : exécute les commandes de la machine
// pure etat.ts avec de vrais RTCPeerConnection (INJECTABLES : un faux en test, sans navigateur).
//
// - L'appel démarre quand l'écran montré est `visio-appel` et que la personne a touché Répondre (état d'appel
//   `en-cours` de machine.ts) ; il s'arrête à Raccrocher ou quand la vue change. getUserMedia est appelé DANS le
//   geste (l'abonnement au magasin est appelé de façon synchrone par le clic) : caméra avant, 1280×720 au plus, micro
//   avec annulation d'écho.
// - Les messages `rtc` du serveur (canal 'visio') sont lus ici, hors de la machine du téléphone (qui les ignore).
// - Les flux reçus (ex. Franck chez la ministre) et l'aperçu local sont publiés pour l'écran (registre.ts).
import type { MessageServeur } from '@studio-real/protocole';
import type { Magasin } from '../magasin';
import { vueEcran } from '../machine';
import type { TransportTelephone } from '../transport';
import {
  cleReception, destinataire, destinatairesAppel, etatVisio, reduireVisio, type CommandeVisio, type EtatVisio, type EvenementVisio,
} from './etat';
import { CANAL_VISIO, lireRtcVisio, preferH264 as preferH264Navigateur, type SignalVisio } from './signaux';

/** Contraintes de la caméra (comme le prototype) : caméra avant, 1280×720 au plus, micro sans écho. */
export const CONTRAINTES_CAMERA: MediaStreamConstraints = {
  video: { facingMode: 'user', width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 } },
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

export interface OptionsVisioTelephone {
  transport: Pick<TransportTelephone, 'envoyer' | 'surMessage' | 'surEtat'>;
  magasin: Pick<Magasin, 'lire' | 'abonner'>;
  /** configuration RTC (serveurs ICE de GET /ice, relais forcé) ; défaut : STUN public */
  configuration?: () => Promise<RTCConfiguration>;
  /** défaut : globalThis.RTCPeerConnection */
  RTCPeerConnection?: new (c: RTCConfiguration) => RTCPeerConnection;
  /** défaut : navigator.mediaDevices.getUserMedia */
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  /** fabrique d'un MediaStream vide (piste reçue sans flux) ; défaut : new MediaStream() */
  nouveauFlux?: () => MediaStream;
  preferH264?: (t: RTCRtpTransceiver, sens: 'envoi' | 'reception') => boolean;
  horloge?: () => number;
  /** préfixe des numéros de négociation ; défaut aléatoire */
  graine?: string;
  /** cadence des délais (ms, défaut 1000) ; 0 : pas de minuterie (les tests appellent tick()) */
  intervalleMs?: number;
  journal?: (ligne: string) => void;
}

export interface VisioTelephone {
  etat(): EtatVisio;
  /** l'aperçu de la caméra (null tant qu'elle n'est pas prête) */
  local(): MediaStream | null;
  /** flux reçus, par acteur */
  distants(): ReadonlyMap<string, MediaStream>;
  /** numéro de version (change à chaque changement visible) */
  version(): number;
  abonner(fn: () => void): () => void;
  /** fait passer les délais (tests) */
  tick(): void;
  arreter(): void;
}

interface PairRtc {
  n: string;
  acteur: string;
  pc: RTCPeerConnection | null;
  /** les opérations d'un pair s'enchaînent (offre/réponse → description distante → candidats) */
  chaine: Promise<void>;
  distantPose: boolean;
  candidats: RTCIceCandidateInit[];
  ferme: boolean;
}

const graineAleatoire = () => {
  const a = new Uint8Array(6);
  globalThis.crypto?.getRandomValues?.(a);
  return 'v' + Array.from(a, x => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('') + '_';
};

export function demarrerVisioTelephone(o: OptionsVisioTelephone): VisioTelephone {
  const horloge = o.horloge ?? (() => Date.now());
  const PC = o.RTCPeerConnection ?? (globalThis as { RTCPeerConnection?: new (c: RTCConfiguration) => RTCPeerConnection }).RTCPeerConnection;
  const gum = o.getUserMedia ?? (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia
    ? (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c) : undefined);
  const configuration = o.configuration ?? (async () => ({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }] }));
  const nouveauFlux = o.nouveauFlux ?? (() => new MediaStream());
  const prefere = o.preferH264 ?? preferH264Navigateur;
  const journal = o.journal ?? ((l: string) => console.info(l));

  let etat: EtatVisio = etatVisio({ moi: o.magasin.lire().acteur, graine: o.graine ?? graineAleatoire() });
  let local: MediaStream | null = null;
  const distants = new Map<string, MediaStream>();
  const pairs = new Map<string, PairRtc>();
  const abonnes = new Set<() => void>();
  let version = 0;
  let arrete = false;

  const notifier = () => { version++; for (const f of [...abonnes]) f(); };

  const envoyerRtc = (vers: string, signal: SignalVisio) => {
    // hors ligne : rien ne part (un signal périmé rejoué après reconnexion ferait plus de mal que de bien)
    if (!etat.enLigne) return;
    o.transport.envoyer({ t: 'rtc', vers, signal: signal as unknown as Record<string, unknown> });
  };

  function evenement(ev: EvenementVisio) {
    if (arrete) return;
    const r = reduireVisio(etat, ev, horloge());
    const change = r.etat !== etat;
    etat = r.etat;
    for (const c of r.commandes) executer(c);
    if (change || r.commandes.length) notifier();
  }

  function fermerPair(cle: string) {
    const p = pairs.get(cle);
    if (!p) return;
    p.ferme = true;
    pairs.delete(cle);
    if (p.pc) {
      p.pc.onicecandidate = null; p.pc.ontrack = null; p.pc.onconnectionstatechange = null;
      try { p.pc.close(); } catch { /* déjà fermé */ }
    }
    if (cle === cleReception(p.acteur) && distants.delete(p.acteur)) notifier();
  }

  function brancher(p: PairRtc, cle: string, pc: RTCPeerConnection) {
    pc.onicecandidate = ev => {
      if (p.ferme || !ev.candidate) return;
      const vers = destinataire(etat, cle, p.n);
      if (vers) envoyerRtc(vers, { type: 'candidat', canal: CANAL_VISIO, de: etat.moi, n: p.n, candidat: ev.candidate.toJSON() });
    };
    pc.ontrack = ev => {
      if (p.ferme) return;
      let flux = ev.streams[0];
      if (!flux) {
        flux = distants.get(p.acteur) ?? nouveauFlux();
        for (const t of flux.getTracks()) if (t.kind === ev.track.kind) flux.removeTrack(t);
        flux.addTrack(ev.track);
      }
      distants.set(p.acteur, flux);
      notifier();
    };
    pc.onconnectionstatechange = () => {
      if (p.ferme) return;
      const s = pc.connectionState;
      const e = s === 'connected' ? 'connecte' : s === 'disconnected' ? 'coupe' : s === 'failed' ? 'echec' : null;
      if (e) {
        if (e !== 'connecte') journal(`[visio] ${p.acteur} : liaison ${s}`);
        evenement({ e: 'liaison', cle, n: p.n, etat: e });
      }
    };
  }

  function nouveauPair(cle: string, acteur: string, n: string): PairRtc {
    fermerPair(cle);
    const p: PairRtc = { n, acteur, pc: null, chaine: Promise.resolve(), distantPose: false, candidats: [], ferme: false };
    pairs.set(cle, p);
    return p;
  }

  const echouer = (cle: string, p: PairRtc) => (e: unknown) => {
    if (p.ferme) return;
    journal(`[visio] ${p.acteur} : négociation impossible (${(e as Error)?.message ?? e})`);
    evenement({ e: 'erreur', cle, n: p.n });
  };

  async function poserCandidats(p: PairRtc) {
    p.distantPose = true;
    for (const c of p.candidats.splice(0)) await p.pc?.addIceCandidate(c).catch(() => undefined);
  }

  function executer(c: CommandeVisio) {
    switch (c.c) {
      case 'camera': {
        if (!gum) { queueMicrotask(() => evenement({ e: 'camera', ok: false, erreur: 'indisponible' })); return; }
        let promesse: Promise<MediaStream>;
        // appelé tout de suite (pas d'attente avant) : on reste dans le geste de la personne
        try { promesse = gum(CONTRAINTES_CAMERA); } catch (e) { promesse = Promise.reject(e); }
        promesse.then(
          flux => {
            if (arrete || !etat.actif || etat.camera !== 'demande') { for (const t of flux.getTracks()) t.stop(); return; }
            local = flux;
            evenement({ e: 'camera', ok: true });
          },
          e => evenement({ e: 'camera', ok: false, erreur: (e as Error)?.name || 'refusee' }),
        );
        return;
      }
      case 'liberer-camera':
        if (local) { for (const t of local.getTracks()) t.stop(); local = null; }
        return;
      case 'offrir': {
        const p = nouveauPair(c.cle, c.acteur, c.n);
        p.chaine = (async () => {
          if (!PC) throw new Error('WebRTC indisponible');
          const config = await configuration();
          if (p.ferme) return;
          const pc = new PC(config);
          p.pc = pc;
          brancher(p, c.cle, pc);
          if (local) for (const t of local.getTracks()) pc.addTrack(t, local);
          for (const t of pc.getTransceivers()) if (t.sender.track?.kind === 'video') prefere(t, 'envoi');
          await pc.setLocalDescription(await pc.createOffer());
          if (p.ferme) return;
          envoyerRtc(c.acteur, { type: 'offre', canal: CANAL_VISIO, de: etat.moi, n: c.n, sdp: pc.localDescription!.sdp });
        })().catch(echouer(c.cle, p));
        return;
      }
      case 'repondre': {
        const p = nouveauPair(c.cle, c.acteur, c.n);
        p.chaine = (async () => {
          if (!PC) throw new Error('WebRTC indisponible');
          const config = await configuration();
          if (p.ferme) return;
          const pc = new PC(config);
          p.pc = pc;
          brancher(p, c.cle, pc);
          await pc.setRemoteDescription({ type: 'offer', sdp: c.sdp });
          for (const t of pc.getTransceivers()) if (t.receiver.track?.kind === 'video') prefere(t, 'reception');
          await poserCandidats(p);
          await pc.setLocalDescription(await pc.createAnswer());
          if (p.ferme) return;
          envoyerRtc(c.session, { type: 'reponse', canal: CANAL_VISIO, de: etat.moi, n: c.n, sdp: pc.localDescription!.sdp });
        })().catch(echouer(c.cle, p));
        return;
      }
      case 'distant': {
        const p = pairs.get(c.cle);
        if (!p || p.n !== c.n) return;
        p.chaine = p.chaine.then(async () => {
          if (p.ferme || !p.pc) return;
          await p.pc.setRemoteDescription({ type: 'answer', sdp: c.sdp });
          await poserCandidats(p);
        }).catch(echouer(c.cle, p));
        return;
      }
      case 'candidat': {
        const p = pairs.get(c.cle);
        if (!p || p.n !== c.n) return;
        p.chaine = p.chaine.then(async () => {
          if (p.ferme) return;
          if (p.distantPose && p.pc) await p.pc.addIceCandidate(c.candidat).catch(() => undefined);
          else p.candidats.push(c.candidat);
        });
        return;
      }
      case 'fermer':
        fermerPair(c.cle);
        return;
      case 'envoyer':
        envoyerRtc(c.vers, c.signal);
        return;
    }
  }

  // ── branchements : transport (rtc, ligne) et magasin (écran, état d'appel) ─────────────────────────────────────
  const desabonner: (() => void)[] = [];
  desabonner.push(o.transport.surMessage((m: MessageServeur) => {
    if (m.t !== 'rtc') return;
    const lu = lireRtcVisio(m);
    if (lu) evenement({ e: 'signal', session: lu.session, signal: lu.signal });
  }));
  desabonner.push(o.transport.surEtat(t => {
    const enLigne = t.etat === 'ouvert';
    if (enLigne !== etat.enLigne) evenement({ e: 'reseau', enLigne });
  }));
  const suivreEcran = () => {
    const tel = o.magasin.lire();
    const v = vueEcran(tel);
    const voulu = v.source === 'vue' && v.ecran === 'visio-appel' && v.appel === 'en-cours';
    if (voulu && !etat.actif) evenement({ e: 'demarrer', moi: tel.acteur, vers: destinatairesAppel(v.params.vers, tel.acteur) });
    else if (!voulu && etat.actif) evenement({ e: 'arreter' });
  };
  desabonner.push(o.magasin.abonner(suivreEcran));
  suivreEcran();

  const intervalle = o.intervalleMs ?? 1000;
  const minuteur = intervalle > 0 ? setInterval(() => evenement({ e: 'tick' }), intervalle) : null;

  return {
    etat: () => etat,
    local: () => local,
    distants: () => distants,
    version: () => version,
    abonner(fn) { abonnes.add(fn); return () => { abonnes.delete(fn); }; },
    tick: () => evenement({ e: 'tick' }),
    arreter() {
      if (arrete) return;
      evenement({ e: 'arreter' });
      arrete = true;
      if (minuteur) clearInterval(minuteur);
      for (const d of desabonner) d();
      for (const cle of [...pairs.keys()]) fermerPair(cle);
      if (local) { for (const t of local.getTracks()) t.stop(); local = null; }
      abonnes.clear();
    },
  };
}
