// Mire de latence : une bande de 32 cases noir/blanc en haut de l'image code l'heure SERVEUR (24 bits de ms, soit
// un tour toutes les 4 h 39) + 8 bits de contrôle. Le téléphone (mode mire) la dessine à chaque image ; la sortie
// la relit sur la vidéo reçue et compare à sa propre heure serveur : latence « verre à verre » mesurée, à l'erreur
// d'horloge près (chaque côté se cale sur le serveur par ping, quelques ms). Partie PURE + aides canvas.

export const BITS_MIRE = 32;
/** hauteur de la bande, en fraction de la hauteur de l'image */
export const HAUTEUR_BANDE = 0.1;
const MASQUE = 0xffffff;

const controle = (v: number) => ((v & 0xff) ^ ((v >> 8) & 0xff) ^ ((v >> 16) & 0xff) ^ 0x5a) & 0xff;

/** Valeur (heure en ms) → 32 cases (vrai = blanc). */
export function encoderMire(heure: number): boolean[] {
  const v = Math.floor(heure) & MASQUE;
  const mot = (v << 8) | controle(v);
  return Array.from({ length: BITS_MIRE }, (_, i) => ((mot >>> (BITS_MIRE - 1 - i)) & 1) === 1);
}

/** 32 cases → valeur sur 24 bits, ou null si le contrôle échoue (image floue, mire absente). */
export function decoderMire(cases: readonly boolean[]): number | null {
  if (cases.length !== BITS_MIRE) return null;
  let mot = 0;
  for (const c of cases) mot = ((mot << 1) | (c ? 1 : 0)) >>> 0;
  const v = mot >>> 8;
  return controle(v) === (mot & 0xff) ? v : null;
}

/** Écart (ms) entre l'heure codée et l'heure de lecture, en tenant compte du tour de 24 bits. */
export function ecartMire(code: number, maintenant: number): number {
  return ((Math.floor(maintenant) & MASQUE) - code + MASQUE + 1) % (MASQUE + 1);
}

/** Lit la bande dans des pixels RGBA (largeur × hauteur de l'image entière ou de sa partie haute). */
export function lireMirePixels(donnees: Uint8ClampedArray, largeur: number, hauteurImage: number): number | null {
  const y = Math.floor(hauteurImage * HAUTEUR_BANDE * 0.5);
  const cases: boolean[] = [];
  for (let i = 0; i < BITS_MIRE; i++) {
    const x = Math.floor(((i + 0.5) * largeur) / BITS_MIRE);
    let somme = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const k = ((y + dy) * largeur + (x + dx)) * 4;
      if (k < 0 || k + 2 >= donnees.length) continue;
      somme += 0.299 * donnees[k]! + 0.587 * donnees[k + 1]! + 0.114 * donnees[k + 2]!;
      n++;
    }
    cases.push(n > 0 && somme / n > 128);
  }
  return decoderMire(cases);
}

/** Dessine la bande (et laisse le reste au dessinateur). */
export function dessinerMire(ctx: CanvasRenderingContext2D, largeur: number, hauteur: number, heure: number): void {
  const h = Math.round(hauteur * HAUTEUR_BANDE);
  const w = largeur / BITS_MIRE;
  encoderMire(heure).forEach((blanc, i) => {
    ctx.fillStyle = blanc ? '#ffffff' : '#000000';
    ctx.fillRect(Math.floor(i * w), 0, Math.ceil(w), h);
  });
}

/** Mesure la latence sur une vidéo qui affiche la mire ; null si la mire est illisible. */
export function mesurerLatenceMire(video: HTMLVideoElement, heureServeur: () => number, toile?: HTMLCanvasElement): number | null {
  const L = video.videoWidth, H = video.videoHeight;
  if (!L || !H) return null;
  const c = toile ?? document.createElement('canvas');
  const hb = Math.ceil(H * HAUTEUR_BANDE);
  c.width = L; c.height = hb;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, L, hb, 0, 0, L, hb);
  const maintenant = heureServeur();
  const code = lireMirePixels(ctx.getImageData(0, 0, L, hb).data, L, H);
  if (code === null) return null;
  const e = ecartMire(code, maintenant);
  return e < 60_000 ? e : null;
}
