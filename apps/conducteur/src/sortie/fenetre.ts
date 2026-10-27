// Ouverture de la fenêtre de sortie depuis la régie (chantier SORTIE SCÈNE).
import { NOM_FENETRE } from './protocole';
import { retenirFenetre } from './relais';

let ref: Window | null = null;

/** Adresse de la page de sortie (même origine que la régie). */
export function adresseSortie(): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  // ?v= : la fenêtre charge toujours la dernière version (GitHub Pages garde l'ancienne en cache quelques minutes)
  return new URL(base.replace(/\/?$/, '/') + 'sortie.html?v=' + Date.now(), location.href).toString();
}

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
 * ouverte (sans la recharger). Avec `ecran: 'secondaire'`, la fenêtre est posée sur le second écran s'il est connu
 * (sinon : à glisser à la main sur le projecteur, puis F ou double-clic pour le plein écran).
 */
export function ouvrirSortieScene(o: { ecran?: 'secondaire' | 'courant' } = {}): Window | null {
  if (ref && !ref.closed) { ref.focus(); retenirFenetre(ref); return ref; }
  const url = adresseSortie();
  const ouvrir = (x?: EcranDetaille | null) => {
    const pos = x ? `,left=${x.availLeft ?? x.left},top=${x.availTop ?? x.top},width=${x.width},height=${x.height}` : ',width=1280,height=720';
    // 1. une fenêtre de ce nom existe déjà (ouverte par un autre onglet de régie) : on la reprend sans la recharger
    const w = window.open('', NOM_FENETRE, 'popup' + pos);
    if (!w) return null;
    let vierge = true;
    try { vierge = w.location.href === 'about:blank'; } catch { vierge = false; }
    if (vierge) w.location.href = url;
    w.focus();
    ref = w;
    retenirFenetre(w);
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
  if (ref && !ref.closed) ref.close();
  ref = null;
  retenirFenetre(null);
}
