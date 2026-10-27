// Jetons d'accès (prototype) :
//  - un jeton par projet, généré à la création, renvoyé UNE fois ; seul son empreinte SHA-256 est stockée (D1) ;
//  - un jeton d'administration (secret JETON_ADMIN) pour créer/lister les projets, valable sur tous les projets.
// Le jeton se passe en en-tête `Authorization: Bearer <jeton>` ou `X-Jeton-Projet: <jeton>`, ou en paramètre
// `?jeton=` (nécessaire pour le WebSocket et les balises <audio>/<img> du navigateur).
import type { Env } from './env';
import { ErreurHttp } from './http';

export function jetonDeRequete(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim() || null;
  const entete = req.headers.get('x-jeton-projet');
  if (entete) return entete.trim() || null;
  return new URL(req.url).searchParams.get('jeton');
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function empreinte(jeton: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jeton)));
}

/** Comparaison à temps constant de deux chaînes de même nature. */
export function egaliteConstante(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let d = 0;
  for (let i = 0; i < ea.length; i++) d |= ea[i]! ^ eb[i]!;
  return d === 0;
}

const base64url = (o: Uint8Array) => btoa(String.fromCharCode(...o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function nouveauJeton(): string {
  return 'sr_' + base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export function nouvelId(prefixe: string, n = 16): string {
  const alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const o = crypto.getRandomValues(new Uint8Array(n));
  return prefixe + [...o].map((x) => alpha[x % alpha.length]).join('');
}

export function estAdmin(req: Request, env: Env): boolean {
  const j = jetonDeRequete(req);
  return !!(j && env.JETON_ADMIN && env.JETON_ADMIN.length >= 16 && egaliteConstante(j, env.JETON_ADMIN));
}

export function exigerAdmin(req: Request, env: Env): void {
  if (!env.JETON_ADMIN || env.JETON_ADMIN.length < 16) {
    throw new ErreurHttp(503, 'admin-non-configure', 'JETON_ADMIN absent ou trop court (≥ 16 caractères) : voir .dev.vars.exemple');
  }
  if (!estAdmin(req, env)) throw new ErreurHttp(401, 'non-autorise', 'jeton d\'administration requis');
}

/** Vérifie l'accès à un projet ; renvoie la ligne minimale du projet. 404 si absent (et non 403, pour ne rien révéler). */
export async function exigerAccesProjet(req: Request, env: Env, id: string): Promise<{ id: string; version: number }> {
  const ligne = await env.DB.prepare('SELECT id, version, jeton_hash FROM projets WHERE id = ?').bind(id).first<{ id: string; version: number; jeton_hash: string }>();
  const jeton = jetonDeRequete(req);
  if (!jeton) throw new ErreurHttp(401, 'non-autorise', 'jeton de projet requis');
  if (estAdmin(req, env)) {
    if (!ligne) throw new ErreurHttp(404, 'introuvable', 'projet introuvable');
    return { id: ligne.id, version: ligne.version };
  }
  const h = await empreinte(jeton);
  if (!ligne || !egaliteConstante(h, ligne.jeton_hash)) throw new ErreurHttp(404, 'introuvable', 'projet introuvable ou jeton invalide');
  return { id: ligne.id, version: ligne.version };
}
