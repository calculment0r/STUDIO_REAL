// Ouverture de la fenêtre de sortie depuis la régie (chantier SORTIE SCÈNE).
//
// Une fenêtre déjà ouverte est REPRISE sans rechargement… sauf si elle est périmée : si la version de protocole
// qu'elle annonce (bonjour / present, via le relais) n'est pas VERSION_SORTIE, ou si elle ne dit rien dans les
// REPRISE_MS qui suivent la reprise, elle est rechargée à la dernière adresse (le ?v= de adresseSortie ne vaut que
// pour une fenêtre qu'on charge, pas pour une fenêtre reprise).
import { NOM_FENETRE, VERSION_SORTIE } from './protocole';
import { retenirFenetre, useSortie, type EtatRelais } from './relais';

let ref: Window | null = null;
let attenteReprise: ReturnType<typeof setTimeout> | undefined;

/** Délai laissé à une fenêtre reprise pour donner signe de vie avant d'être rechargée (ms). */
export const REPRISE_MS = 2000;

/** Adresse de la page de sortie (même origine que la régie). */
export function adresseSortie(): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  // ?v= : la fenêtre charge toujours la dernière version (GitHub Pages garde l'ancienne en cache quelques minutes)
  return new URL(base.replace(/\/?$/, '/') + 'sortie.html?v=' + Date.now(), location.href).toString();
}

/**
 * Décision sur une fenêtre de sortie reprise (PUR) :
 *   'recharger' — elle annonce une autre version, ou REPRISE_MS sont passées sans signe de vie depuis la reprise ;
 *   'garder'    — elle a répondu depuis la reprise, avec la bonne version ;
 *   'attendre'  — pas encore de réponse, délai non écoulé.
 */
export function decisionReprise(s: Pick<EtatRelais, 'versionSortie' | 'vuLe'>, reprise: number, maintenant: number): 'recharger' | 'garder' | 'attendre' {
  if (s.versionSortie !== null && s.versionSortie !== VERSION_SORTIE) return 'recharger';
  if (s.vuLe >= reprise && s.versionSortie === VERSION_SORTIE) return 'garder';
  return maintenant - reprise >= REPRISE_MS ? 'recharger' : 'attendre';
}

function recharger(w: Window) {
  try { if (!w.closed) w.location.href = adresseSortie(); } catch { /* fenêtre fermée ou inaccessible */ }
}

/** Fenêtre reprise : contrôle tout de suite, puis jusqu'à REPRISE_MS (rechargée si périmée ou muette). */
function surveillerReprise(w: Window) {
  clearTimeout(attenteReprise);
  const reprise = Date.now();
  const verifier = () => {
    const d = decisionReprise(useSortie.getState(), reprise, Date.now());
    if (d === 'recharger') recharger(w);
    else if (d === 'attendre') attenteReprise = setTimeout(verifier, 250);
  };
  verifier();
}

const retenir = (w: Window) => { ref = w; retenirFenetre(w, () => recharger(w)); };

interface EcranDetaille { left: number; top: number; availLeft?: number; availTop?: number; width: number; height: number; isPrimary?: boolean }
interface DetailsEcrans { screens: EcranDetaille[]; currentScreen: EcranDetaille }

/** Position d'un écran secondaire (Window Management API, Chrome / Edge, permission demandée au premier usage). */
async function ecranSecondaire(): Promise<EcranDetaille | null> {
  const w = window as Window & { getScreenDetails?: () => Promise<DetailsEcrans> };
  if (!w.getScreenDetails) return null;
  try {
    const d = await w.getScreenDetails();
    return d.screens.find((s) => s !== d.currentScreen && !s.isPrimary) ?? d.screens.find((s) => s !== d.currentScreen) ?? null;
  } catch { return null; }
}

/**
 * Ouvre la sortie écran scène dans une fenêtre séparée au nom fixe, ou ramène au premier plan celle qui est déjà
 * ouverte (sans la recharger si elle est à jour). Avec `ecran: 'secondaire'`, la fenêtre est posée sur le second écran
 * s'il est connu (sinon : à glisser à la main sur le projecteur, puis F ou double-clic pour le plein écran).
 */
export function ouvrirSortieScene(o: { ecran?: 'secondaire' | 'courant' } = {}): Window | null {
  if (ref && !ref.closed) { ref.focus(); retenir(ref); surveillerReprise(ref); return ref; }
  const url = adresseSortie();
  const ouvrir = (x?: EcranDetaille | null) => {
    const pos = x ? `,left=${x.availLeft ?? x.left},top=${x.availTop ?? x.top},width=${x.width},height=${x.height}` : ',width=1280,height=720';
    // 1. une fenêtre de ce nom existe déjà (ouverte par un autre onglet de régie) : on la reprend sans la recharger,
    //    sauf si elle s'avère périmée ou muette (surveillerReprise)
    const w = window.open('', NOM_FENETRE, 'popup' + pos);
    if (!w) return null;
    let vierge = true;
    try { vierge = w.location.href === 'about:blank'; } catch { vierge = false; }
    if (vierge) w.location.href = url;
    w.focus();
    retenir(w);
    if (!vierge) surveillerReprise(w);
    return w;
  };
  if (o.ecran === 'secondaire') {
    // la permission et la recherche sont asynchrones : on ouvre tout de suite (le geste de l'utilisateur est requis
    // par le bloqueur de fenêtres), puis on déplace si un second écran est trouvé
    const w = ouvrir();
    void ecranSecondaire().then((x) => { if (x && w && !w.closed) { try { w.moveTo(x.availLeft ?? x.left, x.availTop ?? x.top); w.resizeTo(x.width, x.height); } catch { /* refusé */ } } });
    return w;
  }
  return ouvrir();
}

/** Ferme la fenêtre de sortie ouverte par cette régie. */
export function fermerSortieScene(): void {
  clearTimeout(attenteReprise);
  if (ref && !ref.closed) ref.close();
  ref = null;
  retenirFenetre(null);
}
