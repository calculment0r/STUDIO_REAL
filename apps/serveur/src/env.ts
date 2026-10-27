// Liaisons et variables du Worker (voir wrangler.jsonc). Les secrets viennent de .dev.vars en local
// (jamais dans le dépôt) et de `wrangler secret put` en production.
import type { SalleProjet } from './salle/SalleProjet';

export interface Env {
  /** D1 : projets, versions, exécutions. */
  DB: D1Database;
  /** R2 : médias des projets (clé `projets/<id>/<nom>`). */
  MEDIAS: R2Bucket;
  /** Durable Object : une salle par projet. */
  SALLE: DurableObjectNamespace<SalleProjet>;
  /** Build de apps/conducteur (Workers Static Assets). */
  ASSETS: Fetcher;

  /** Origines autorisées (CORS et WebSocket), séparées par des virgules. La même origine est toujours permise. */
  ORIGINES_AUTORISEES?: string;
  /** Taille max d'un média (octets). */
  TAILLE_MAX_MEDIA?: string;
  /** Taille max d'un projet enregistré (octets JSON ; D1 limite une ligne à 2 Mo). */
  TAILLE_MAX_PROJET?: string;
  /** SECRET : jeton d'administration (créer/lister les projets, accès à tous). */
  JETON_ADMIN?: string;
}

export const limites = (env: Env) => ({
  media: Number(env.TAILLE_MAX_MEDIA) || 50 * 1024 * 1024,
  projet: Math.min(Number(env.TAILLE_MAX_PROJET) || 1_800_000, 1_900_000),
});
