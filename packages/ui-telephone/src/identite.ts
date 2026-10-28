// Identité du téléphone (rapport 5 §4.6, « Un téléphone recharge ou perd le réseau ») :
// - jeton d'APPAREIL : identifiant aléatoire (crypto.randomUUID), gardé à DEUX endroits (localStorage et cookie) pour
//   survivre à un rechargement, à un onglet rouvert, ou à un stockage vidé d'un côté seulement. Ce n'est pas un secret :
//   c'est le `personne` du `hello`, qui permet au serveur de remplacer l'ancienne socket (« le dernier gagne ») et de
//   rendre l'instantané (vote fait, phrases envoyées).
// - session : par onglet (sessionStorage), gardée pendant les reconnexions ;
// - pseudo : localStorage ; cseq : sessionStorage (le compteur continue après un rechargement) ;
// - accès (`#acteur=<id>&jeton=<jeton>` du QR) : lu dans le FRAGMENT, rangé en sessionStorage, puis effacé de l'adresse.
// Lecture tolérante : stockage interdit (navigation privée, iframe), cookie bloqué, valeur abîmée → on régénère.

export interface Stockage {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
}
export interface Cookies {
  lire(): string;
  ecrire(valeur: string): void;
}

export const CLES = {
  appareil: 'studio-real:appareil',
  pseudo: 'studio-real:pseudo',
  session: 'studio-real:session',
  cseq: 'studio-real:cseq',
  acces: 'studio-real:acces',
  cookie: 'sr_appareil',
} as const;

/** Identifiant de personne ou de session accepté par le protocole (RE_SESSION). */
const RE_ID = /^[A-Za-z0-9_-]{6,64}$/;
/** Jeton d'accès (RE_JETON du protocole). */
const RE_JETON = /^[\x21-\x7e]{1,512}$/;
/** Identifiant d'acteur (RE_ID_ACTEUR du modèle). */
const RE_ACTEUR = /^[A-Za-z0-9_-]{1,40}$/;

function lire(s: Stockage | null | undefined, cle: string): string | null {
  try { return s?.getItem(cle) ?? null; } catch { return null; }
}
function ecrire(s: Stockage | null | undefined, cle: string, v: string): void {
  try { s?.setItem(cle, v); } catch { /* stockage indisponible */ }
}

/** Identifiant aléatoire : crypto.randomUUID si présent, sinon getRandomValues, sinon Math.random (dernier recours). */
export function nouvelIdentifiant(prefixe = ''): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return prefixe + c.randomUUID();
  const octets = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(octets);
  else for (let i = 0; i < octets.length; i++) octets[i] = Math.floor(Math.random() * 256);
  return prefixe + Array.from(octets, o => o.toString(16).padStart(2, '0')).join('');
}

function lireCookie(cookies: Cookies | null | undefined, nom: string): string | null {
  let brut = '';
  try { brut = cookies?.lire() ?? ''; } catch { return null; }
  for (const morceau of brut.split(';')) {
    const [k, ...v] = morceau.trim().split('=');
    if (k === nom) {
      try { return decodeURIComponent(v.join('=')); } catch { return null; }
    }
  }
  return null;
}

/** Jeton d'appareil : localStorage, sinon cookie, sinon nouveau ; réécrit aux deux endroits. */
export function jetonAppareil(local: Stockage | null | undefined, cookies: Cookies | null | undefined): string {
  const depuisLocal = lire(local, CLES.appareil);
  const depuisCookie = lireCookie(cookies, CLES.cookie);
  const jeton = [depuisLocal, depuisCookie].find((x): x is string => !!x && RE_ID.test(x)) ?? nouvelIdentifiant();
  if (depuisLocal !== jeton) ecrire(local, CLES.appareil, jeton);
  if (depuisCookie !== jeton) {
    try {
      // un an, tout le site, jamais envoyé à un autre site ; Secure si la page l'est
      const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
      cookies?.ecrire(`${CLES.cookie}=${encodeURIComponent(jeton)}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`);
    } catch { /* cookie bloqué */ }
  }
  return jeton;
}

/** Session de l'onglet (sessionStorage) : gardée pendant les reconnexions et les rechargements. */
export function sessionOnglet(session: Stockage | null | undefined): string {
  const s = lire(session, CLES.session);
  if (s && RE_ID.test(s)) return s;
  const n = nouvelIdentifiant('s_').replace(/-/g, '').slice(0, 34);
  ecrire(session, CLES.session, n);
  return n;
}

export function lirePseudo(local: Stockage | null | undefined): string | null {
  const p = lire(local, CLES.pseudo);
  return p && p.length <= 40 ? p : null;
}
export function garderPseudo(local: Stockage | null | undefined, pseudo: string): void {
  ecrire(local, CLES.pseudo, pseudo);
}

export function lireCseq(session: Stockage | null | undefined): number {
  const n = Number(lire(session, CLES.cseq));
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}
export function garderCseq(session: Stockage | null | undefined, cseq: number): void {
  ecrire(session, CLES.cseq, String(cseq));
}

export interface Acces {
  acteur: string;
  jeton: string | null;
}

/**
 * Accès donné par le QR dans le FRAGMENT (`#acteur=franck&jeton=…`) : jamais dans `?` (le fragment n'est ni envoyé au
 * serveur, ni écrit dans ses journaux, ni transmis en Referer). Rangé en sessionStorage puis effacé de l'adresse par
 * l'appelant (history.replaceState). Sans fragment : l'accès rangé, sinon l'acteur `public` sans jeton.
 */
export function lireAcces(fragment: string, session: Stockage | null | undefined): { acces: Acces; effacer: boolean } {
  const p = new URLSearchParams(fragment.replace(/^#/, ''));
  const acteur = p.get('acteur');
  const jeton = p.get('jeton');
  if ((acteur && RE_ACTEUR.test(acteur)) || (jeton && RE_JETON.test(jeton))) {
    const acces: Acces = { acteur: acteur && RE_ACTEUR.test(acteur) ? acteur : 'public', jeton: jeton && RE_JETON.test(jeton) ? jeton : null };
    ecrire(session, CLES.acces, JSON.stringify(acces));
    return { acces, effacer: true };
  }
  const efface = p.has('acteur') || p.has('jeton');
  try {
    const range = JSON.parse(lire(session, CLES.acces) ?? 'null') as Partial<Acces> | null;
    if (range && typeof range.acteur === 'string' && RE_ACTEUR.test(range.acteur)) {
      return { acces: { acteur: range.acteur, jeton: typeof range.jeton === 'string' && RE_JETON.test(range.jeton) ? range.jeton : null }, effacer: efface };
    }
  } catch { /* valeur abîmée */ }
  return { acces: { acteur: 'public', jeton: null }, effacer: efface };
}

/** Stockages du navigateur, sans lever si l'accès est interdit (iframe sandbox, navigation privée stricte). */
export function stockagesNavigateur(): { local: Stockage | null; session: Stockage | null; cookies: Cookies | null } {
  const sur = <T>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  return {
    local: sur(() => globalThis.localStorage ?? null),
    session: sur(() => globalThis.sessionStorage ?? null),
    cookies: typeof document === 'undefined' ? null : { lire: () => document.cookie, ecrire: v => { document.cookie = v; } },
  };
}
