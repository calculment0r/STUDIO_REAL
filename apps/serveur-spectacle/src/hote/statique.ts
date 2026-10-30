// Service des fichiers statiques : clients construits (téléphone, Conducteur) et médias.
// - chemins normalisés ; jamais de fichier caché (segment commençant par un point), jamais hors des dossiers montés
//   (y compris par lien symbolique ou jonction) ;
// - `Range` (Safari sur iPhone ne lit pas une vidéo sans), `ETag` faible (taille + date), 304 ;
// - `Cache-Control: public, max-age=31536000, immutable` pour les noms versionnés `<nom>.<8 hex>.<ext>`, `no-cache` sinon.
import { createReadStream, realpathSync, statSync, type Stats } from 'node:fs';
import { extname, join, posix, resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.vtt': 'text/vtt; charset=utf-8', '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json', '.md': 'text/markdown; charset=utf-8',
};

/** Nom versionné : `<nom>.<8 hexadécimaux>.<ext>` → mis en cache un an, immuable. */
export const RE_VERSIONNE = /\.[0-9a-f]{8}\.[A-Za-z0-9]+$/;

/** Un dossier servi sous un préfixe d'adresse. `spa` : une adresse sans extension inconnue rend index.html. */
export interface Montage { prefixe: string; dossier: string; spa?: boolean }

function repondre(res: ServerResponse, code: number, texte: string, entetes: Record<string, string> = {}) {
  res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', ...entetes });
  res.end(texte);
}

/** Chemin relatif sûr (segments sans point initial), ou null. `brut` : chemin d'adresse déjà décodé. */
export function cheminSur(brut: string): string | null {
  if (brut.includes('\0') || brut.includes('\\')) return null;
  const segments = brut.split('/').filter(Boolean);
  if (segments.some(s => s.startsWith('.'))) return null;
  const normal = posix.normalize('/' + segments.join('/'));
  return normal.replace(/^\/+/, '');
}

const dansDossier = (dossier: string, f: string) => f === dossier || f.startsWith(dossier.endsWith(sep) ? dossier : dossier + sep);

/** Fichier réel à servir pour ce chemin relatif dans ce montage, ou null. */
function trouver(m: Montage, relatif: string): { fichier: string; st: Stats } | null {
  let racine: string;
  try { racine = realpathSync(m.dossier); } catch { return null; }
  const essais = [relatif];
  if (m.spa && !extname(relatif)) essais.push('index.html');
  for (const r of essais) {
    const absolu = resolve(racine, r);
    if (!dansDossier(racine, absolu)) continue;
    try {
      const reel = realpathSync(absolu);
      if (!dansDossier(racine, reel)) continue;   // lien symbolique ou jonction qui sort du dossier
      let st = statSync(reel);
      let fichier = reel;
      if (st.isDirectory()) {
        fichier = join(reel, 'index.html');
        st = statSync(fichier);
      }
      if (st.isFile()) return { fichier, st };
    } catch { /* suivant */ }
  }
  return null;
}

/**
 * Sert la requête si elle tombe dans un montage (le plus long préfixe d'abord). Renvoie false si aucun montage ne
 * correspond (l'appelant répond 404).
 */
export function servirStatique(req: IncomingMessage, res: ServerResponse, chemin: string, montages: Montage[]): boolean {
  const m = [...montages].sort((a, b) => b.prefixe.length - a.prefixe.length)
    .find(x => chemin === x.prefixe.replace(/\/$/, '') || chemin.startsWith(x.prefixe.endsWith('/') ? x.prefixe : x.prefixe + '/'));
  if (!m) return false;
  if (chemin === m.prefixe.replace(/\/$/, '') && m.prefixe !== '/') { repondre(res, 301, '', { location: m.prefixe.replace(/\/?$/, '/') }); return true; }
  const relatif = cheminSur(chemin.slice(m.prefixe.replace(/\/$/, '').length));
  if (relatif === null) { repondre(res, 404, 'introuvable'); return true; }
  const t = trouver(m, relatif || 'index.html');
  if (!t) { repondre(res, 404, 'introuvable'); return true; }
  envoyerFichier(req, res, t.fichier, t.st);
  return true;
}

/** Sert UN fichier choisi par le code (page de santé, check-list) ; 404 s'il manque. Jamais un chemin venu du client. */
export function servirFichier(req: IncomingMessage, res: ServerResponse, fichier: string): void {
  try {
    const st = statSync(fichier);
    if (!st.isFile()) throw new Error('pas un fichier');
    envoyerFichier(req, res, fichier, st);
  } catch {
    repondre(res, 404, 'introuvable');
  }
}

function envoyerFichier(req: IncomingMessage, res: ServerResponse, fichier: string, st: Stats) {
  const type = MIME[extname(fichier).toLowerCase()] ?? 'application/octet-stream';
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const cache = RE_VERSIONNE.test(fichier) ? 'public, max-age=31536000, immutable' : 'no-cache';
  const base = { 'content-type': type, etag, 'cache-control': cache, 'accept-ranges': 'bytes', 'x-content-type-options': 'nosniff' };
  const inm = req.headers['if-none-match'];
  if (typeof inm === 'string' && inm.split(',').map(x => x.trim()).includes(etag)) {
    res.writeHead(304, { etag, 'cache-control': cache });
    res.end();
    return;
  }
  const plage = typeof req.headers.range === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range.trim()) : null;
  if (req.headers.range !== undefined && plage) {
    let debut: number;
    let fin: number;
    if (plage[1] === '' && plage[2] === '') { debut = NaN; fin = NaN; } else if (plage[1] === '') { debut = Math.max(0, st.size - Number(plage[2])); fin = st.size - 1; }
    else { debut = Number(plage[1]); fin = plage[2] === '' ? st.size - 1 : Math.min(Number(plage[2]), st.size - 1); }
    if (!Number.isFinite(debut) || !Number.isFinite(fin) || debut > fin || debut >= st.size) {
      res.writeHead(416, { 'content-range': `bytes */${st.size}`, 'x-content-type-options': 'nosniff' });
      res.end();
      return;
    }
    res.writeHead(206, { ...base, 'content-range': `bytes ${debut}-${fin}/${st.size}`, 'content-length': String(fin - debut + 1) });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(fichier, { start: debut, end: fin }).on('error', () => res.destroy()).pipe(res);
    return;
  }
  res.writeHead(200, { ...base, 'content-length': String(st.size) });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(fichier).on('error', () => res.destroy()).pipe(res);
}
