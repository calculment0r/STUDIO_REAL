// Entrée de l'application téléphone (adresse /t/ par défaut).
// - Vrai téléphone : `#acteur=<id>&jeton=<jeton>` dans le FRAGMENT du QR (jamais dans `?`), rangé en sessionStorage puis
//   effacé de l'adresse ; sans fragment : l'acteur `public`. Le serveur se lit dans /config.json (même origine), avec
//   repli sur l'origine de la page. Transport WebSocket.
// - Téléphone émulé (`?emule=1&id=t042[&acteur=franck][&pseudo=lea]`) : transport MÉMOIRE, exposé sur
//   `window.studioRealTelephone` pour l'émulateur du Conducteur (même origine, en iframe), aucun stockage partagé.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@studio-real/theme/noyau.css';
import '@studio-real/ui-telephone/telephone.css';
import urlVenus from '@studio-real/theme/polices/venus-rising.otf?url';
import {
  App, demarrerTelephone, detecterCapacites, garderCseq, garderPseudo, jetonAppareil, lireAcces, lireCseq, lirePseudo,
  sessionOnglet, stockagesNavigateur, transportMemoire, transportWebSocket,
  type CoteServeurMemoire, type Magasin, type Telephone,
} from '@studio-real/ui-telephone';

declare const __VERSION_APP__: string;
declare const __BUILD_APP__: string;

/** Ce que le serveur de spectacle publie à côté de l'application (/config.json). Rien de secret. */
interface Config {
  /** origine du serveur (https://…) ou adresse WebSocket complète (wss://…/chemin) ; défaut : l'origine de la page */
  serveur?: string;
  /** chemin du WebSocket quand `serveur` est une origine (défaut /ws) */
  chemin?: string;
  /** titre de l'écran d'entrée */
  titre?: string;
}

/** Ce que l'émulateur du Conducteur trouve dans chaque iframe de vitrine. */
export interface TelephoneExpose {
  id: string;
  serveur: CoteServeurMemoire;
  magasin: Magasin;
  telephone: Telephone;
}
declare global {
  interface Window { studioRealTelephone?: TelephoneExpose }
}

async function lireConfig(): Promise<Config> {
  try {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch('/config.json', { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(minuteur);
    if (!r.ok) return {};
    const j = (await r.json()) as Record<string, unknown>;
    const texte = (x: unknown, max: number) => (typeof x === 'string' && x.length <= max ? x : undefined);
    const c: Config = {};
    const serveur = texte(j.serveur, 300);
    const chemin = texte(j.chemin, 200);
    const titre = texte(j.titre, 40);
    if (serveur) c.serveur = serveur;
    if (chemin && chemin.startsWith('/')) c.chemin = chemin;
    if (titre) c.titre = titre;
    return c;
  } catch {
    return {};
  }
}

/** Adresse WebSocket : config.serveur (ws/wss complète, ou origine http/https + chemin), sinon l'origine de la page. */
export function adresseWebSocket(config: Config, origine: string): string {
  let base: URL;
  try { base = new URL(config.serveur ?? origine); } catch { base = new URL(origine); }
  if ((base.protocol === 'ws:' || base.protocol === 'wss:') && base.pathname !== '/' && !config.chemin) return base.href;
  const u = new URL(config.chemin ?? '/ws', base);
  if (u.protocol === 'https:') u.protocol = 'wss:';
  else if (u.protocol === 'http:') u.protocol = 'ws:';
  return u.href;
}

function chargerVenus() {
  if (typeof FontFace === 'undefined') return;
  const face = new FontFace('Venus Rising', `url("${urlVenus}") format("opentype")`, { weight: '100 900', style: 'normal', display: 'swap' });
  face.load().then(
    () => { document.fonts.add(face); document.documentElement.dataset.venus = 'oui'; },
    () => { document.documentElement.dataset.venus = 'repli'; },
  );
}

const nettoyer = (x: string | null, repli: string) => (x ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || repli;

async function demarrer() {
  chargerVenus();
  const app = { version: __VERSION_APP__, build: __BUILD_APP__ };
  const capacites = detecterCapacites();
  const q = new URLSearchParams(location.search);
  const emule = q.get('emule') === '1';
  let telephone: Telephone;
  let titre: string | undefined;

  if (emule) {
    // émulé : identité tirée de l'adresse, rien dans les stockages (les iframes d'une même origine les partagent)
    const id = nettoyer(q.get('id'), 't000');
    const acteur = nettoyer(q.get('acteur'), 'public');
    let serveur!: CoteServeurMemoire;
    telephone = demarrerTelephone({
      etat: { acteur, personne: `emule-${id}`.padEnd(6, '0'), session: `emule-${id}-s`.padEnd(6, '0'), pseudo: q.get('pseudo') },
      creerTransport: hello => { const p = transportMemoire({ hello, jeton: 'emule' }); serveur = p.serveur; return p.telephone; },
      app, capacites,
    });
    window.studioRealTelephone = { id, serveur, magasin: telephone.magasin, telephone };
    try { window.parent?.postMessage({ type: 'studio-real:telephone-pret', id }, location.origin); } catch { /* pas de parent */ }
  } else {
    const { local, session, cookies } = stockagesNavigateur();
    const { acces, effacer } = lireAcces(location.hash, session);
    // le jeton ne reste jamais dans l'adresse (ni dans l'historique, ni dans une capture d'écran partagée)
    if (effacer) history.replaceState(null, '', location.pathname + location.search);
    const config = await lireConfig();
    titre = config.titre;
    telephone = demarrerTelephone({
      etat: { acteur: acces.acteur, personne: jetonAppareil(local, cookies), session: sessionOnglet(session), pseudo: lirePseudo(local), cseq: lireCseq(session) },
      // public sans jeton dans le QR : 'public' (le serveur décide s'il l'accepte)
      creerTransport: hello => transportWebSocket(adresseWebSocket(config, location.origin), acces.jeton ?? 'public', { hello }),
      app, capacites,
      persister: { pseudo: p => garderPseudo(local, p), cseq: n => garderCseq(session, n) },
    });
  }

  createRoot(document.getElementById('racine')!).render(
    <StrictMode>
      <App telephone={telephone} capacites={capacites} emule={emule} {...(titre ? { titre } : {})} />
    </StrictMode>,
  );
}

void demarrer();
