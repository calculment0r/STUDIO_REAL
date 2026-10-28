// Configuration unique du serveur de spectacle (audit 2026-10, rapport 5 §4.2).
// - exploitation/spectacle.config.json : versionnable, SANS secret (adresses, port, projet, dossiers) ; à défaut,
//   exploitation/spectacle.config.exemple.json (versionné) ;
// - exploitation/spectacle.secrets.json : IGNORÉ par git, créé au premier lancement avec un jeton aléatoire par rôle
//   (regie, acteur, agent). Le serveur n'en garde que l'empreinte SHA-256 ; aucun jeton n'est écrit dans un journal.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

/** Racine du dépôt (apps/serveur-spectacle/src/hote → ../../../..). */
export const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
export const PORT_DEFAUT = 8790;
export const ROLES_JETON = ['regie', 'acteur', 'agent'] as const;
export type RoleJeton = (typeof ROLES_JETON)[number];

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
}

export interface Secrets { jetons: Record<RoleJeton, string> }

const DEFAUT: ConfigSpectacle = {
  spectacle: 'echo',
  adresses: { publique: 'http://localhost:8790', locale: 'http://localhost:8790' },
  port: PORT_DEFAUT,
  hote: '0.0.0.0',
  projet: 'projets/echo/echo.conducteur.json',
  medias: { dossier: 'medias-locales' },
  clients: { telephone: 'apps/telephone/dist', conducteur: 'apps/conducteur/dist' },
  exploitation: 'exploitation',
};

const estObjet = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const texte = (x: unknown, defaut: string) => (typeof x === 'string' && x.trim() ? x.trim() : defaut);

/** Valide et complète une configuration lue (les champs manquants prennent la valeur par défaut). */
export function normaliserConfig(x: unknown): ConfigSpectacle {
  if (!estObjet(x)) throw new Error('Configuration illisible : objet JSON attendu.');
  const a = estObjet(x.adresses) ? x.adresses : {};
  const m = estObjet(x.medias) ? x.medias : {};
  const c = estObjet(x.clients) ? x.clients : {};
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
  };
  if (typeof x.representation === 'string' && x.representation.trim()) config.representation = x.representation.trim();
  if (typeof a.secours === 'string' && a.secours.trim()) config.adresses.secours = a.secours.trim();
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
    writeFileSync(fichier, JSON.stringify({ jetons }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  }
  return { secrets: { jetons }, cree };
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
export function configPublique(config: ConfigSpectacle, extra: { version: string | null; run: string | null }) {
  return {
    spectacle: config.spectacle,
    representation: config.representation ?? null,
    adresses: config.adresses,
    ws: '/ws',
    protocole: 2,
    version: extra.version,
    run: extra.run,
  };
}
