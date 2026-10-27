// Outils HTTP : réponses JSON, erreurs, CORS restreint, lecture bornée du corps.
import type { Env } from './env';
import { ErreurValidation } from './logique/validation';

export class ErreurHttp extends Error {
  constructor(public readonly statut: number, public readonly code: string, message: string, public readonly details?: Record<string, unknown>) {
    super(message);
  }
}

export const json = (donnees: unknown, statut = 200, entetes: HeadersInit = {}): Response =>
  new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...entetes },
  });

export function reponseErreur(e: unknown): Response {
  if (e instanceof ErreurHttp) return json({ erreur: e.code, message: e.message, ...e.details }, e.statut);
  if (e instanceof ErreurValidation) return json({ erreur: e.code, message: e.message }, e.statut);
  console.error('erreur interne', e);
  return json({ erreur: 'interne', message: 'erreur interne du serveur' }, 500);
}

function originesAutorisees(env: Env): Set<string> {
  return new Set((env.ORIGINES_AUTORISEES ?? '').split(',').map((o) => o.trim()).filter(Boolean));
}

/** Origine permise : absente (client non navigateur), même origine que la requête, ou dans la liste. */
export function originePermise(req: Request, env: Env): boolean {
  const origine = req.headers.get('origin');
  if (!origine) return true;
  if (origine === new URL(req.url).origin) return true;
  return originesAutorisees(env).has(origine);
}

export function entetesCors(req: Request, env: Env): Record<string, string> {
  const origine = req.headers.get('origin');
  if (!origine || !originePermise(req, env)) return {};
  return {
    'access-control-allow-origin': origine,
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, x-jeton-projet, x-auteur, if-match',
    'access-control-expose-headers': 'etag, x-version, content-length, content-range',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}

export function avecCors(rep: Response, req: Request, env: Env): Response {
  const cors = entetesCors(req, env);
  if (!Object.keys(cors).length) return rep;
  // Les réponses WebSocket (101) et certaines réponses du runtime sont immuables : on les recopie.
  if (rep.status === 101) return rep;
  const r = new Response(rep.body, rep);
  for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
  return r;
}

/** Lit un corps JSON en refusant au-delà de `max` octets (Content-Length ET taille réelle). */
export async function lireJson(req: Request, max: number): Promise<unknown> {
  const annonce = Number(req.headers.get('content-length') ?? '0');
  if (annonce > max) throw new ErreurHttp(413, 'trop-gros', `corps > ${max} octets`);
  const texte = await req.text();
  if (new TextEncoder().encode(texte).length > max) throw new ErreurHttp(413, 'trop-gros', `corps > ${max} octets`);
  try {
    return JSON.parse(texte);
  } catch {
    throw new ErreurHttp(400, 'json-invalide', 'corps JSON illisible');
  }
}

/** Nom de l'auteur d'une requête (en-tête X-Auteur, déclaratif dans ce prototype). */
export function auteur(req: Request): string {
  const a = (req.headers.get('x-auteur') ?? '').trim().slice(0, 60);
  return a || 'anonyme';
}
