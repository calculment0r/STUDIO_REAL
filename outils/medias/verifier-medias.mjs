// Vérificateur de médias du spectacle : lit `ffprobe`, applique les règles de diffusion
// (H.264 + AAC, moov en tête, tailles et débits plafonnés) et écrit un manifeste `medias.json`.
//
// Usage :
//   node outils/medias/verifier-medias.mjs <dossier> [--manifeste medias.json] [--cible telephone|scene] [--images-cles]
//
// Code de sortie : 0 si tout est conforme, 1 s'il y a au moins un refus, 2 en cas d'erreur d'utilisation.
// La logique de décision (`verifier`) est une fonction pure ; seul `sonder` appelle ffprobe.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, createReadStream, fstatSync, openSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const EXTENSIONS = {
  '.mp4': 'video',
  '.mp3': 'audio',
  '.m4a': 'audio',
  '.wav': 'audio',
  '.jpg': 'image',
  '.png': 'image',
  '.webp': 'image',
};

/** Plafonds par cible : dimensions (portrait ou paysage accepté) et débit total en bits/s. */
export const LIMITES = {
  telephone: { largeur: 720, hauteur: 1280, debit: 2_000_000 },
  scene: { largeur: 1920, hauteur: 1080, debit: 10_000_000 },
};
export const DEBIT_AUDIO_MAX = 192_000;
export const INTERVALLE_IMAGES_CLES_MAX = 2.5; // secondes

const CODECS_IMAGE = new Set(['mjpeg', 'png', 'webp', 'bmp', 'gif', 'tiff']);

// ---------------------------------------------------------------------------
// Règles (fonction pure)
// ---------------------------------------------------------------------------

/** Déduit le type (video / audio / image) à partir de la sortie ffprobe. */
export function typeDepuisInfo(info) {
  const flux = info?.streams ?? [];
  const format = String(info?.format?.format_name ?? '');
  const video = flux.find(s => s.codec_type === 'video');
  if (video) {
    const conteneurVideo = /mp4|mov|matroska|webm/.test(format);
    if (/image2|_pipe|webp/.test(format) || (CODECS_IMAGE.has(video.codec_name) && !conteneurVideo && !flux.some(s => s.codec_type === 'audio'))) {
      return 'image';
    }
    return 'video';
  }
  return 'audio';
}

/** Vrai si largeur × hauteur tient dans le plafond, en portrait ou en paysage. */
function tientDans(largeur, hauteur, max) {
  const droit = largeur <= max.largeur && hauteur <= max.hauteur;
  const tourne = largeur <= max.hauteur && hauteur <= max.largeur;
  return droit || tourne;
}

/**
 * Applique les règles de diffusion à une sortie `ffprobe -print_format json`.
 * @param info    objet ffprobe ({ format, streams }) ; champ optionnel `intervalleImagesCles` (secondes)
 * @param options { cible: 'telephone'|'scene', moovEnTete: boolean, type?: 'video'|'audio'|'image' }
 * @returns { ok: boolean, raisons: string[] }
 */
export function verifier(info, options = {}) {
  const cible = options.cible ?? 'telephone';
  const raisons = [];
  const flux = info?.streams ?? [];
  const type = options.type ?? typeDepuisInfo(info);

  if (type === 'image') return { ok: true, raisons };

  const debit = info?.format?.bit_rate === undefined ? NaN : Number(info.format.bit_rate);

  if (type === 'audio') {
    const audio = flux.filter(s => s.codec_type === 'audio');
    if (!audio.length) raisons.push('aucune piste audio');
    for (const a of audio) {
      if (a.codec_name !== 'mp3' && a.codec_name !== 'aac') {
        raisons.push(`codec audio « ${a.codec_name} » refusé (mp3 ou aac attendu)`);
      }
    }
    if (!Number.isFinite(debit)) raisons.push('débit inconnu');
    else if (debit > DEBIT_AUDIO_MAX) raisons.push(`débit audio ${debit} b/s au-dessus de ${DEBIT_AUDIO_MAX}`);
    return { ok: raisons.length === 0, raisons };
  }

  // Vidéo
  const limites = LIMITES[cible];
  if (!limites) return { ok: false, raisons: [`cible inconnue « ${cible} » (telephone ou scene)`] };

  const videos = flux.filter(s => s.codec_type === 'video');
  if (!videos.length) raisons.push('aucune piste vidéo');
  for (const v of videos) {
    if (v.codec_name !== 'h264') raisons.push(`codec vidéo « ${v.codec_name} » refusé (h264 obligatoire)`);
    if (!tientDans(Number(v.width), Number(v.height), limites)) {
      raisons.push(`dimensions ${v.width}×${v.height} au-dessus de ${limites.largeur}×${limites.hauteur} (cible ${cible})`);
    }
  }
  for (const a of flux.filter(s => s.codec_type === 'audio')) {
    if (a.codec_name !== 'aac') raisons.push(`codec audio « ${a.codec_name} » refusé (aac attendu)`);
  }
  for (const d of flux.filter(s => s.codec_type === 'data')) {
    raisons.push(`piste de données refusée (${d.codec_tag_string || d.codec_name || 'data'})`);
  }
  if (options.moovEnTete !== true) raisons.push('atome moov pas en tête de fichier (faststart manquant)');
  if (!Number.isFinite(debit)) raisons.push('débit inconnu');
  else if (debit > limites.debit) raisons.push(`débit ${debit} b/s au-dessus de ${limites.debit} (cible ${cible})`);

  const iv = info?.intervalleImagesCles;
  if (typeof iv === 'number' && iv > INTERVALLE_IMAGES_CLES_MAX) {
    raisons.push(`intervalle d'images clés ${iv.toFixed(2)} s au-dessus de ${INTERVALLE_IMAGES_CLES_MAX} s`);
  }
  return { ok: raisons.length === 0, raisons };
}

// ---------------------------------------------------------------------------
// Atomes MP4
// ---------------------------------------------------------------------------

/** Lecteur d'octets sur un tampon ou un fichier : lire(position, longueur) -> Buffer (peut être plus court). */
function lecteur(source) {
  if (typeof source !== 'string') {
    const tampon = Buffer.from(source.buffer ?? source, source.byteOffset ?? 0, source.byteLength);
    return { taille: tampon.length, lire: (pos, n) => tampon.subarray(pos, Math.min(tampon.length, pos + n)), fermer() {} };
  }
  const fd = openSync(source, 'r');
  const taille = fstatSync(fd).size;
  return {
    taille,
    lire(pos, n) {
      const b = Buffer.alloc(n);
      const lu = readSync(fd, b, 0, n, pos);
      return b.subarray(0, lu);
    },
    fermer() { closeSync(fd); },
  };
}

/**
 * Vrai si l'atome `moov` apparaît avant `mdat` parmi les atomes de haut niveau d'un MP4.
 * Accepte un chemin de fichier ou un tampon (Buffer / Uint8Array).
 * Taille sur 4 octets big-endian puis type sur 4 octets ; taille 1 = taille étendue sur 8 octets ;
 * taille 0 = jusqu'à la fin du fichier.
 */
export function moovEnTete(source) {
  const l = lecteur(source);
  try {
    let pos = 0;
    while (pos + 8 <= l.taille) {
      const entete = l.lire(pos, 16);
      if (entete.length < 8) return false;
      let taille = entete.readUInt32BE(0);
      const type = entete.toString('latin1', 4, 8);
      if (type === 'moov') return true;
      if (type === 'mdat') return false;
      if (taille === 1) {
        if (entete.length < 16) return false;
        taille = Number(entete.readBigUInt64BE(8));
      } else if (taille === 0) {
        taille = l.taille - pos;
      }
      if (taille < 8) return false; // atome invalide : on s'arrête plutôt que de boucler
      pos += taille;
    }
    return false;
  } finally {
    l.fermer();
  }
}

// ---------------------------------------------------------------------------
// Empreinte, nom versionné, images clés
// ---------------------------------------------------------------------------

/** SHA-256 d'un fichier, calculé en flux. */
export function sha256Fichier(chemin) {
  return new Promise((ok, ko) => {
    const h = createHash('sha256');
    createReadStream(chemin).on('data', d => h.update(d)).on('error', ko).on('end', () => ok(h.digest('hex')));
  });
}

/** `<nom sans extension>.<8 premiers caractères du sha256>.<extension>` (ex. intro.mp4 -> intro.1a2b3c4d.mp4). */
export function nomVersionne(nomFichier, sha256) {
  const ext = extname(nomFichier);
  return `${basename(nomFichier, ext)}.${String(sha256).slice(0, 8)}${ext}`;
}

/**
 * Plus grand écart (secondes) entre deux images clés consécutives, à partir de la sortie CSV de
 * `ffprobe -select_streams v:0 -show_entries frame=key_frame,pts_time -of csv`.
 * Renvoie undefined s'il y a moins de deux images clés.
 */
export function intervalleImagesClesDepuisCsv(texte) {
  const dates = [];
  for (const ligne of String(texte).split(/\r?\n/)) {
    const c = ligne.trim().split(',');
    if (c[0] !== 'frame' || c[1] !== '1') continue;
    const t = Number(c[2]);
    if (Number.isFinite(t)) dates.push(t);
  }
  dates.sort((a, b) => a - b);
  if (dates.length < 2) return undefined;
  let max = 0;
  for (let i = 1; i < dates.length; i++) max = Math.max(max, dates[i] - dates[i - 1]);
  return max;
}

// ---------------------------------------------------------------------------
// Appels ffprobe (isolés)
// ---------------------------------------------------------------------------

export async function sonder(chemin) {
  const { stdout } = await execFileAsync(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', chemin],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

export async function mesurerImagesCles(chemin) {
  const { stdout } = await execFileAsync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=key_frame,pts_time', '-of', 'csv', chemin],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  return intervalleImagesClesDepuisCsv(stdout);
}

// ---------------------------------------------------------------------------
// Dossier -> manifeste
// ---------------------------------------------------------------------------

/** Vérifie chaque média d'un dossier ; renvoie les entrées du manifeste (sans les écrire). */
export async function analyserDossier(dossier, { cible = 'telephone', imagesCles = false, journal = () => {} } = {}) {
  const fichiers = readdirSync(dossier, { withFileTypes: true })
    .filter(e => e.isFile() && EXTENSIONS[extname(e.name).toLowerCase()])
    .map(e => e.name)
    .sort();
  const manifeste = [];
  for (const nomFichier of fichiers) {
    const chemin = join(dossier, nomFichier);
    const ext = extname(nomFichier);
    const type = EXTENSIONS[ext.toLowerCase()];
    const info = await sonder(chemin);
    const sha256 = await sha256Fichier(chemin);
    let verdict;
    if (type === 'image') {
      verdict = { ok: true, raisons: [] };
    } else if (type === 'video') {
      if (imagesCles) info.intervalleImagesCles = await mesurerImagesCles(chemin);
      verdict = verifier(info, { cible, moovEnTete: moovEnTete(chemin), type });
    } else {
      verdict = verifier(info, { cible, moovEnTete: false, type });
    }
    const duree = Number(info?.format?.duration);
    manifeste.push({
      nom: basename(nomFichier, ext),
      fichier: nomFichier,
      fichierVersionne: nomVersionne(nomFichier, sha256),
      taille: statSync(chemin).size,
      sha256,
      duree: Number.isFinite(duree) ? duree : null,
      type,
      cible: type === 'video' ? cible : null,
      ok: verdict.ok,
      raisons: verdict.raisons,
    });
    journal(manifeste[manifeste.length - 1]);
  }
  return manifeste;
}

function lireArguments(argv) {
  const r = { dossier: undefined, manifeste: undefined, cible: 'telephone', imagesCles: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifeste') r.manifeste = argv[++i];
    else if (a === '--cible') r.cible = argv[++i];
    else if (a === '--images-cles') r.imagesCles = true;
    else if (a.startsWith('--')) throw new Error(`option inconnue : ${a}`);
    else if (!r.dossier) r.dossier = a;
    else throw new Error(`argument en trop : ${a}`);
  }
  if (!r.dossier) throw new Error('dossier manquant');
  if (!LIMITES[r.cible]) throw new Error(`cible inconnue « ${r.cible} » (telephone ou scene)`);
  return r;
}

export async function principal(argv) {
  let args;
  try {
    args = lireArguments(argv);
  } catch (e) {
    console.error(`${e.message}\nUsage : node verifier-medias.mjs <dossier> [--manifeste medias.json] [--cible telephone|scene] [--images-cles]`);
    return 2;
  }
  const dossier = resolve(args.dossier);
  const sortie = resolve(args.manifeste ?? join(dossier, 'medias.json'));
  let manifeste;
  try {
    manifeste = await analyserDossier(dossier, {
      cible: args.cible,
      imagesCles: args.imagesCles,
      journal: m => {
        console.log(`${m.ok ? 'OK     ' : 'REFUSÉ '} ${m.fichier}`);
        for (const r of m.raisons) console.log(`        ✗ ${r}`);
      },
    });
  } catch (e) {
    if (e.code === 'ENOENT' && String(e.syscall ?? '').includes('ffprobe')) {
      console.error('ffprobe est introuvable dans le PATH : installer ffmpeg (ex. winget install Gyan.FFmpeg).');
    } else {
      console.error(`Erreur : ${e.message}`);
    }
    return 2;
  }
  writeFileSync(sortie, JSON.stringify(manifeste, null, 2) + '\n', 'utf8');
  const refus = manifeste.filter(m => !m.ok).length;
  console.log(`\n${manifeste.length} fichier(s) · ${refus} refus · manifeste : ${sortie}`);
  return refus ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal(process.argv.slice(2)).then(code => { process.exitCode = code; });
}
