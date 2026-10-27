// Paramètres de la page streamer.html (PUR, testé). Une seule page, trois rôles :
//   #role=accueil   page de démarrage de l'essai (PC) : boutons « Sortie écran », « Moniteur », adresse du streamer à copier
//   #role=streamer  le TÉLÉPHONE du streamer (défaut)
//   #role=moniteur  contrôle de réception sur PC (vidéo, son, chemin, statistiques, consignes, mire de latence)
// Le jeton passe dans le fragment (#…) : il ne part pas dans les requêtes ni dans les journaux du serveur. On lit
// aussi ?… (forme de sortie.html). Champs : serveur (vide = même origine), projet, jeton, canal, ice (base64url),
// mire=1 (mire de latence au lieu de la caméra), relais=1 (TURN forcé).

export type Role = 'accueil' | 'streamer' | 'moniteur';

export interface ConfigPage {
  role: Role;
  serveur: string;
  projet: string;
  jeton: string;
  canal?: string;
  ice?: string;
  mire?: boolean;
  relais?: boolean;
}

export const CLE_CONFIG = 'studio-real:streamer';

const ROLES: readonly Role[] = ['accueil', 'streamer', 'moniteur'];

/** Lit la configuration dans ?… puis #… (le fragment l'emporte). null si projet ou jeton manque. */
export function lireConfig(search: string, hash: string): ConfigPage | null {
  const q = new URLSearchParams(search);
  const h = new URLSearchParams(hash.replace(/^#/, ''));
  const v = (k: string) => (h.get(k) ?? q.get(k) ?? '').trim();
  const projet = v('projet'), jeton = v('jeton');
  if (!projet || !jeton) return null;
  const role = ROLES.includes(v('role') as Role) ? (v('role') as Role) : h.has('accueil') || q.has('accueil') ? 'accueil' : 'streamer';
  const c: ConfigPage = { role, serveur: v('serveur'), projet, jeton };
  if (v('canal')) c.canal = v('canal');
  if (v('ice')) c.ice = v('ice');
  if (v('mire') === '1') c.mire = true;
  if (v('relais') === '1') c.relais = true;
  return c;
}

function fragment(c: Omit<ConfigPage, 'role'> & { role?: Role }): string {
  const p = new URLSearchParams();
  if (c.role) p.set('role', c.role);
  if (c.serveur) p.set('serveur', c.serveur);
  p.set('projet', c.projet);
  p.set('jeton', c.jeton);
  if (c.canal) p.set('canal', c.canal);
  if (c.ice) p.set('ice', c.ice);
  if (c.mire) p.set('mire', '1');
  if (c.relais) p.set('relais', '1');
  return p.toString();
}

/** Lien d'une page de rôle (`base` = adresse absolue de streamer.html). */
export function lienRole(base: string, role: Role, c: Omit<ConfigPage, 'role'>): string {
  return `${base.split('#')[0]!.split('?')[0]}#${fragment({ ...c, role })}`;
}

/** Lien de la sortie écran scène (sortie.html?serveur=&projet=&jeton=, forme de src/sortie/salle.ts). */
export function lienSortie(origine: string, c: Pick<ConfigPage, 'serveur' | 'projet' | 'jeton'> & { relais?: boolean }): string {
  const u = new URL('/sortie.html', origine);
  if (c.serveur) u.searchParams.set('serveur', c.serveur);
  u.searchParams.set('projet', c.projet);
  u.searchParams.set('jeton', c.jeton);
  if (c.relais) u.searchParams.set('relais', '1');
  return u.toString();
}
