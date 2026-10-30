// Capacités du téléphone (celles que le banc d'essai prototypes/banc-essai/tests.js mesure sur un vrai appareil) :
// annoncées au serveur dans `hello.capacites`, et données aux écrans (un iPhone n'a pas `navigator.vibrate`, pas de
// plein écran, et pas de son sans geste). L'émulateur fournit les siennes (profil « iPhone muet »…).

export type Plateforme = 'ios' | 'android' | 'autre';

export interface Capacites {
  plateforme: Plateforme;
  vibration: boolean;
  /** le son peut partir sans geste de la personne (faux sur iPhone) */
  sonSansGeste: boolean;
  pleinEcran: boolean;
  wakeLock: boolean;
  camera: boolean;
  /** RTCPeerConnection présent : la visio (écran visio-appel) peut envoyer et recevoir des flux */
  webrtc?: boolean;
  /** Cache Storage (préchargement des vidéos) */
  cache: boolean;
}

export const CAPACITES_NEUTRES: Capacites = {
  plateforme: 'autre', vibration: false, sonSansGeste: false, pleinEcran: false, wakeLock: false, camera: false, cache: false,
};

/** Lecture des capacités du navigateur courant (sans rien demander à la personne). */
export function detecterCapacites(): Capacites {
  if (typeof navigator === 'undefined') return CAPACITES_NEUTRES;
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  const plateforme: Plateforme = ios ? 'ios' : /Android/.test(ua) ? 'android' : 'autre';
  return {
    plateforme,
    vibration: typeof navigator.vibrate === 'function',
    sonSansGeste: false,                                         // jamais supposé : son muet par défaut (28/10)
    pleinEcran: typeof document !== 'undefined' && !!document.documentElement?.requestFullscreen,
    wakeLock: 'wakeLock' in navigator,
    camera: !!navigator.mediaDevices?.getUserMedia,
    webrtc: typeof RTCPeerConnection !== 'undefined',
    cache: typeof caches !== 'undefined',
  };
}

/** Les capacités en noms du protocole (`hello.capacites`, motif [a-z][a-z0-9.:_-]*). */
export function nomsCapacites(c: Capacites): string[] {
  const l = ['video', `plateforme:${c.plateforme}`];
  if (c.vibration) l.push('vibrer');
  if (c.sonSansGeste) l.push('son');
  if (c.pleinEcran) l.push('plein-ecran');
  if (c.wakeLock) l.push('wake-lock');
  if (c.camera) l.push('camera');
  if (c.webrtc) l.push('webrtc');
  if (c.cache) l.push('cache');
  return l;
}
