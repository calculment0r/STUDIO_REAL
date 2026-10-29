// Configuration unique du serveur de spectacle (audit 2026-10, rapport 5 §4.2).
// - exploitation/spectacle.config.json : versionnable, SANS secret (adresses, port, projet, dossiers) ; à défaut,
//   exploitation/spectacle.config.exemple.json (versionné) ;
// - exploitation/spectacle.secrets.json : IGNORÉ par git, créé au premier lancement avec un jeton aléatoire par rôle
//   (regie, acteur, agent). Le serveur n'en garde que l'empreinte SHA-256 ; aucun jeton n'est écrit dans un journal.
// - Relais TURN de la visio (facultatif) : `turn.cleId` (identifiant de la clé Cloudflare Realtime TURN, pas secret) dans
//   la configuration, `turn.jeton` (le jeton de l'API, SECRET) dans les secrets ; ou les variables CF_TURN_CLE_ID et
//   CF_TURN_CLE_JETON. Il faut les deux, sinon STUN seul (voir ice.ts et exploitation/LISEZMOI.md, « Relais TURN »).
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { DUREE_TURN_DEFAUT_S, type ReglagesTurn } from './ice';

/** Racine du dépôt (apps/serveur-spectacle/src/hote → ../../../..). */
export const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
export const PORT_DEFAUT = 8790;
export const ROLES_JETON = ['regie', 'acteur', 'agent'] as const;
export type RoleJeton = (typeof ROLES_JETON)[number];

/** Tunnel qui donne au serveur son adresse publique (le script de lancement le démarre ; le serveur sonde l'adresse). */
export const TYPES_TUNNEL = ['aucun', 'cloudflare-nomme', 'tailscale-funnel'] as const;
export type TypeTunnel = (typeof TYPES_TUNNEL)[number];

export interface ConfigSpectacle {
  /** nom court du spectacle */
  spectacle: string;
  /** code de la soirée (affiché, journalisé) */
  representation?: string;
  adresses: { publique: string; locale: string; secours?: string };
  port: number;
  /** interface d'écoute (0.0.0.0 : toutes) */
  hote: string;
  /** fichier du projet (conducteur@1), relatif à la racine du dépôt */
  projet: string;
  medias: { dossier: string };
  /** clients construits servis par le serveur */
  clients: { telephone: string; conducteur: string };
  /** dossier d'exploitation : secrets, état, journaux */
  exploitation: string;
  /** tunnel de l'adresse publique : `nom` = nom du tunnel nommé Cloudflare (cloudflared tunnel run <nom>) */
  tunnel: { type: TypeTunnel; nom?: string };
  /** relais TURN de la visio : identifiant de la clé (le jeton est dans les secrets) et durée des identifiants (s) */
  turn?: { cleId?: string; dureeS?: number };
}

export interface Secrets {
  jetons: Record<RoleJeton, string>;
  /** jeton de l'API Cloudflare Realtime TURN (collé à la main par le propriétaire ; jamais créé par le code) */
  turn?: { jeton: string };
}

const DEFAUT: ConfigSpectacle = {
  spectacle: 'echo',
  adresses: { publique: 'http://localhost:8790', locale: 'http://localhost:8790' },
  port: PORT_DEFAUT,
  hote: '0.0.0.0',
  projet: 'projets/echo/echo.conducteur.json',
  medias: { dossier: 'medias-locales' },
  clients: { telephone: 'apps/telephone/dist', conducteur: 'apps/conducteur/dist' },
  exploitation: 'exploitation',
  tunnel: { type: 'aucun' },
};

const estObjet = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const texte = (x: unknown, defaut: string) => (typeof x === 'string' && x.trim() ? x.trim() : defaut);

/** Valide et complète une configuration lue (les champs manquants prennent la valeur par défaut). */
export function normaliserConfig(x: unknown): ConfigSpectacle {
  if (!estObjet(x)) throw new Error('Configuration illisible : objet JSON attendu.');
  const a = estObjet(x.adresses) ? x.adresses : {};
  const m = estObjet(x.medias) ? x.medias : {};
  const c = estObjet(x.clients) ? x.clients : {};
  const t = estObjet(x.tunnel) ? x.tunnel : {};
  const typeTunnel = t.type === undefined ? DEFAUT.tunnel.type : t.type;
  if (!(TYPES_TUNNEL as readonly unknown[]).includes(typeTunnel)) throw new Error(`Configuration : tunnel.type invalide (${String(t.type)}) ; attendu : ${TYPES_TUNNEL.join(', ')}.`);
  const port = x.port === undefined ? DEFAUT.port : Number(x.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Configuration : port invalide (${String(x.port)}).`);
  const config: ConfigSpectacle = {
    spectacle: texte(x.spectacle, DEFAUT.spectacle),
    adresses: { publique: texte(a.publique, DEFAUT.adresses.publique), locale: texte(a.locale, DEFAUT.adresses.locale) },
    port,
    hote: texte(x.hote, DEFAUT.hote),
    projet: texte(x.projet, DEFAUT.projet),
    medias: { dossier: texte(m.dossier, DEFAUT.medias.dossier) },
    clients: { telephone: texte(c.telephone, DEFAUT.clients.telephone), conducteur: texte(c.conducteur, DEFAUT.clients.conducteur) },
    exploitation: texte(x.exploitation, DEFAUT.exploitation),
    tunnel: { type: typeTunnel as TypeTunnel },
  };
  if (typeof t.nom === 'string' && t.nom.trim()) config.tunnel.nom = t.nom.trim();
  if (typeof x.representation === 'string' && x.representation.trim()) config.representation = x.representation.trim();
  if (typeof a.secours === 'string' && a.secours.trim()) config.adresses.secours = a.secours.trim();
  if (estObjet(x.turn)) {
    const turn: NonNullable<ConfigSpectacle['turn']> = {};
    const cle = x.turn.cleId;
    // vide, ou la valeur exemple (« <…> ») : pas de clé
    if (typeof cle === 'string' && cle.trim() && !/[<>]/.test(cle)) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(cle.trim())) throw new Error('Configuration : turn.cleId invalide (lettres, chiffres, - et _ seulement).');
      turn.cleId = cle.trim();
    }
    if (x.turn.dureeS !== undefined) {
      const d = Number(x.turn.dureeS);
      if (!Number.isInteger(d) || d < 600 || d > 172_800) throw new Error(`Configuration : turn.dureeS invalide (${String(x.turn.dureeS)}) ; attendu : 600 à 172800 secondes.`);
      turn.dureeS = d;
    }
    config.turn = turn;
  }
  return config;
}

/** Chemin absolu d'un réglage relatif à la racine du dépôt. */
export const chemin = (racine: string, p: string) => (isAbsolute(p) ? p : join(racine, p));

/**
 * Lit la configuration : SPECTACLE_CONFIG (chemin) sinon exploitation/spectacle.config.json, sinon l'exemple versionné.
 * PORT remplace le port de la configuration.
 */
export function lireConfig(racine = RACINE, env: NodeJS.ProcessEnv = process.env): { config: ConfigSpectacle; source: string } {
  const candidats = env.SPECTACLE_CONFIG
    ? [chemin(racine, env.SPECTACLE_CONFIG)]
    : [join(racine, 'exploitation', 'spectacle.config.json'), join(racine, 'exploitation', 'spectacle.config.exemple.json')];
  const source = candidats.find(f => existsSync(f));
  if (!source) throw new Error(`Configuration introuvable : ${candidats.join(' ou ')}.`);
  let brut: unknown;
  try { brut = JSON.parse(readFileSync(source, 'utf8')); } catch (e) { throw new Error(`Configuration illisible (${source}) : ${(e as Error).message}`); }
  const config = normaliserConfig(brut);
  if (env.PORT) config.port = normaliserConfig({ port: env.PORT }).port;
  return { config, source };
}

/** Jeton aléatoire (32 octets, base64url) préfixé par son rôle. */
export const nouveauJeton = (role: RoleJeton) => `sr_${role}_${randomBytes(32).toString('base64url')}`;

/**
 * Lit les secrets ; crée le fichier (et les jetons manquants) au premier lancement. Ne renvoie jamais les jetons au
 * journal : l'appelant n'affiche que le CHEMIN du fichier.
 */
export function lireOuCreerSecrets(fichier: string): { secrets: Secrets; cree: boolean } {
  let brut: unknown = {};
  const existe = existsSync(fichier);
  if (existe) {
    try { brut = JSON.parse(readFileSync(fichier, 'utf8')); } catch (e) { throw new Error(`Secrets illisibles (${fichier}) : ${(e as Error).message}`); }
  }
  const jetonsLus = estObjet(brut) && estObjet(brut.jetons) ? brut.jetons : {};
  const jetons = {} as Record<RoleJeton, string>;
  let cree = !existe;
  for (const role of ROLES_JETON) {
    const j = jetonsLus[role];
    if (typeof j === 'string' && j.length >= 16) jetons[role] = j;
    else { jetons[role] = nouveauJeton(role); cree = true; }
  }
  if (cree) {
    mkdirSync(dirname(fichier), { recursive: true });
    // les autres entrées (ex. `turn`, collée à la main) sont gardées telles quelles
    const autres = estObjet(brut) ? brut : {};
    writeFileSync(fichier, JSON.stringify({ ...autres, jetons }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  }
  const turn = jetonTurnDe(brut);
  return { secrets: { jetons, ...(turn ? { turn: { jeton: turn } } : {}) }, cree };
}

function jetonTurnDe(brut: unknown): string | null {
  const j = estObjet(brut) && estObjet(brut.turn) ? brut.turn.jeton : undefined;
  // vide, ou la valeur exemple (« <…> ») : pas de jeton
  return typeof j === 'string' && j.trim() && !/[<>]/.test(j) ? j.trim() : null;
}

/** Jeton TURN lu dans le fichier des secrets, sans le créer ni le modifier ; null s'il n'y en a pas. */
export function lireJetonTurn(fichier: string): string | null {
  if (!existsSync(fichier)) return null;
  try { return jetonTurnDe(JSON.parse(readFileSync(fichier, 'utf8'))); } catch { return null; }
}

/**
 * Réglages TURN complets, ou null (STUN seul) : identifiant de la clé (configuration, sinon CF_TURN_CLE_ID) ET jeton
 * (secrets, sinon CF_TURN_CLE_JETON). Durée des identifiants : turn.dureeS, sinon 3600 s.
 */
export function reglagesTurn(config: ConfigSpectacle, jetonSecrets: string | null, env: NodeJS.ProcessEnv = process.env): ReglagesTurn | null {
  const cleId = config.turn?.cleId ?? (env.CF_TURN_CLE_ID?.trim() || null);
  const jeton = jetonSecrets ?? (env.CF_TURN_CLE_JETON?.trim() || null);
  if (!cleId || !jeton) return null;
  return { cleId, jeton, dureeS: config.turn?.dureeS ?? DUREE_TURN_DEFAUT_S };
}

/** Version du code (git), ou null. */
export function versionGit(racine = RACINE): string | null {
  try {
    return execFileSync('git', ['-C', racine, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

/** Partie publique de la configuration (`GET /config.json`) : aucune donnée secrète, aucun chemin de fichier. */
export function configPublique(config: ConfigSpectacle, extra: { version: string | null; run: string | null; turn?: boolean }) {
  return {
    spectacle: config.spectacle,
    representation: config.representation ?? null,
    adresses: config.adresses,
    ws: '/ws',
    protocole: 2,
    version: extra.version,
    run: extra.run,
    /** un relais TURN est configuré (jamais la clé) ; les serveurs ICE se demandent à GET /ice, avec un jeton */
    turn: extra.turn ?? false,
  };
}
