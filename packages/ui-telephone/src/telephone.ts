// Démarrage d'un téléphone : relie la machine (magasin), le transport, le préchargeur et le navigateur, sans React.
// App.tsx l'affiche ; l'émulateur du Conducteur peut s'en servir pour un téléphone de la foule (`navigateur: false` :
// pas d'élément vidéo, pas d'écouteurs de page, battement par son horloge à lui).
// Ce qui se passe ici (rapport 4 §4.3, rapport 5 §4.6) :
// - toute sortie de la machine est exécutée : messages → transport, effets → vibreur, bip, flash, préchargeur, hello ;
// - battement `etat` toutes les 5 s (l'écran AFFICHÉ) ; visibilitychange → `in{k:'presence'}` ;
// - déblocage dans le geste (validation du pseudo, ou premier toucher d'un téléphone nommé) : play/pause sur l'unique
//   <video>, un AudioContext, et la demande de Wake Lock (reprise à chaque retour au premier plan) ;
// - pseudo et cseq gardés (identite.ts) à chaque changement.
import type { AppClient } from '@studio-real/protocole';
import { etatInitial, messageHello, type Effet, type EtatTelephone, type OptionsEtat, type Sortie } from './machine';
import { creerMagasin, type Magasin } from './magasin';
import { creerPrechargeur, type Prechargeur } from './medias';
import type { FabriqueHello, TransportTelephone } from './transport';
import { nomsCapacites, type Capacites } from './capacites';

export interface OptionsTelephone {
  etat: OptionsEtat;
  /** fabrique le transport ; reçoit le hello courant (vseq, cseq, pseudo) à envoyer à chaque ouverture */
  creerTransport: (hello: FabriqueHello) => TransportTelephone;
  app: AppClient;
  capacites: Capacites;
  /** faux : téléphone sans rendu (agent de la foule, tests) — ni vidéo, ni écouteurs de page, ni Wake Lock */
  navigateur?: boolean;
  /** préchargeur des médias (défaut : Cache Storage `medias-v1` dans un navigateur, aucun sinon) */
  prechargeur?: Prechargeur | null;
  persister?: { pseudo?: (p: string) => void; cseq?: (n: number) => void };
  horloge?: () => number;
  /** battement (défaut 5 s) */
  battementMs?: number;
}

export interface Telephone {
  magasin: Magasin;
  transport: TransportTelephone;
  prechargeur: Prechargeur | null;
  /** l'UNIQUE élément <video> du téléphone (null sans navigateur) */
  video: HTMLVideoElement | null;
  /** à appeler DANS un geste de la personne */
  debloquer(): void;
  /** flash demandé par un `fx` (l'application dessine le voile) */
  surFlash(fn: (ms: number) => void): () => void;
  arreter(): void;
}

type FenetreAudio = typeof globalThis & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };

function creerVideo(): HTMLVideoElement {
  const v = document.createElement('video');
  v.muted = true;
  v.defaultMuted = true;
  v.playsInline = true;
  v.setAttribute('muted', '');
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.preload = 'auto';
  v.className = 'tl-video-element';
  return v;
}

export function demarrerTelephone(o: OptionsTelephone): Telephone {
  const navigateur = o.navigateur ?? typeof document !== 'undefined';
  const horloge = o.horloge ?? (() => Date.now());
  const video = navigateur ? creerVideo() : null;
  const flashs = new Set<(ms: number) => void>();
  const capacites = nomsCapacites(o.capacites);
  let audio: AudioContext | null = null;
  let verrou: { release(): Promise<void> } | null = null;
  let veilleVoulue = false;
  let debloque = false;

  let magasin: Magasin;
  const transport = o.creerTransport(() => messageHello(magasin.lire(), { app: o.app, capacites }));
  const prechargeur = o.prechargeur !== undefined ? o.prechargeur : navigateur
    ? creerPrechargeur({ surProgression: (asset, pret) => magasin.envoyer({ a: 'media', asset, pret }) })
    : null;

  function bip(nom: string) {
    if (!audio || audio.state !== 'running') return;
    try {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = nom === 'grave' ? 440 : 880;
      gain.gain.setValueAtTime(0.2, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.3);
      osc.connect(gain).connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + 0.3);
    } catch { /* pas de son */ }
  }

  function effet(e: Effet) {
    switch (e.e) {
      case 'vibrer':
        if (navigateur && o.capacites.vibration) { try { navigator.vibrate(e.motif); } catch { /* rien */ } }
        return;
      case 'son': bip(e.nom); return;
      case 'flash': for (const f of flashs) f(e.ms); return;
      case 'precharger': prechargeur?.precharger(e.medias); return;
      case 'hello': transport.renouer(); return;
      case 'arreter': transport.fermer(); return;
    }
  }

  function executer(sorties: Sortie[]) {
    for (const s of sorties) {
      if ('e' in s) effet(s);
      else transport.envoyer(s);
    }
  }

  magasin = creerMagasin(etatInitial(o.etat), executer, horloge);

  // persistance (pseudo, cseq) à chaque changement
  let avant: EtatTelephone = magasin.lire();
  const desabonnements: (() => void)[] = [];
  desabonnements.push(magasin.abonner(() => {
    const e = magasin.lire();
    if (e.pseudo && e.pseudo !== avant.pseudo) o.persister?.pseudo?.(e.pseudo);
    if (e.cseq !== avant.cseq) o.persister?.cseq?.(e.cseq);
    avant = e;
  }));

  desabonnements.push(transport.surMessage(m => magasin.envoyer(m)));
  desabonnements.push(transport.surEtat(t => magasin.envoyer({
    a: 'reseau', enLigne: t.etat === 'ouvert',
    ...(t.rttMs !== undefined ? { rttMs: t.rttMs } : {}), ...(t.decalageMs !== undefined ? { decalageMs: t.decalageMs } : {}),
  })));

  const minuteur = setInterval(() => magasin.envoyer({ a: 'battement' }), o.battementMs ?? 5000);

  async function demanderVeille() {
    veilleVoulue = true;
    if (!navigateur || !o.capacites.wakeLock || verrou || document.visibilityState !== 'visible') return;
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void>; addEventListener?(t: string, f: () => void): void }> } }).wakeLock;
      const v = await wl?.request('screen');
      if (!v) return;
      verrou = v;
      v.addEventListener?.('release', () => { verrou = null; });
    } catch { /* refusé (économie d'énergie, pas de geste) : on réessaiera au prochain retour */ }
  }

  const surVisibilite = () => {
    const visible = document.visibilityState === 'visible';
    magasin.envoyer({ a: 'visible', visible });
    if (visible && veilleVoulue) void demanderVeille();
  };
  if (navigateur) {
    document.addEventListener('visibilitychange', surVisibilite);
    void demanderVeille();
  }

  return {
    magasin, transport, prechargeur, video,
    debloquer() {
      if (!navigateur) return;
      if (video && !debloque) {
        try {
          const p = video.play();
          p?.then(() => video.pause(), () => undefined);
          video.pause();
        } catch { /* rien */ }
      }
      if (!audio) {
        const AC = (globalThis as FenetreAudio).AudioContext ?? (globalThis as FenetreAudio).webkitAudioContext;
        if (AC) { try { audio = new AC(); } catch { audio = null; } }
      }
      void audio?.resume?.().catch(() => undefined);
      debloque = true;
      void demanderVeille();
    },
    surFlash(fn) { flashs.add(fn); return () => { flashs.delete(fn); }; },
    arreter() {
      clearInterval(minuteur);
      for (const d of desabonnements) d();
      if (navigateur) document.removeEventListener('visibilitychange', surVisibilite);
      void verrou?.release().catch(() => undefined);
      void audio?.close?.().catch(() => undefined);
      prechargeur?.vider();
      transport.fermer();
    },
  };
}
