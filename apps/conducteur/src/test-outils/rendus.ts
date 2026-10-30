// Compteur de rendus React pour les tests du Conducteur (lot performance-react) : combien de fois chaque composant a été
// RÉ-EXÉCUTÉ par React, et en combien de validations (« commits »). Aucun navigateur : le DOM est celui de faux-dom.ts.
//
// Principe : la « fausse extension DevTools de React » (la porte officielle que react-dom appelle à chaque validation),
// la même que celle de l'outil de mesure navigateur `outils/fluidite/sonde.ts`. À chaque validation on parcourt la
// partie de l'arbre qui a changé et on compte les fibres de composants marquées « travail effectué » (PerformedWork).
//
// ORDRE OBLIGATOIRE : le crochet et le faux DOM doivent exister AVANT que react-dom soit importé. Dans un test :
//
//   const { rendus } = await vi.hoisted(async () => (await import('../test-outils/rendus')).preparer());
//   // …puis seulement les import statiques des composants.
//
// puis `const monte = await monter(<Composant />)`, `await image(() => …)` pour chaque changement d'état, et
// `rendus.lire()` pour les chiffres. `rendus.remettreAZero()` entre deux phases d'un scénario.
import type { ReactElement } from 'react';
import { creerConteneurFaux, installerFauxDom } from './faux-dom';

export { ecrituresDeStyle, remettreAZeroEcritures } from './faux-dom';

export interface BilanRendus {
  /** validations (une par passage de React qui a modifié l'arbre) */
  commits: number;
  /** composants ré-exécutés, tous noms confondus */
  total: number;
  /** nom du composant → nombre de ré-exécutions */
  parComposant: Record<string, number>;
}

export interface CompteurRendus {
  lire: () => BilanRendus;
  remettreAZero: () => void;
  /** ré-exécutions d'un composant depuis la dernière remise à zéro (0 s'il n'a pas été rendu) */
  de: (nom: string) => number;
}

// étiquettes de fibres de react-reconciler : FunctionComponent, ClassComponent, ForwardRef, MemoComponent, SimpleMemoComponent
const TAGS_COMPOSANTS = new Set([0, 1, 11, 14, 15]);
const TRAVAIL_EFFECTUE = 1;

interface Fibre {
  tag: number; type: unknown; flags: number; child: Fibre | null; sibling: Fibre | null; alternate: Fibre | null;
}

function nomDeFibre(f: Fibre): string {
  const t = f.type as { displayName?: string; name?: string; render?: { displayName?: string; name?: string }; type?: { displayName?: string; name?: string } } | ((...a: unknown[]) => unknown) | null;
  if (!t) return '(?)';
  if (typeof t === 'function') return (t as { displayName?: string }).displayName || t.name || '(anonyme)';
  if (t.displayName) return t.displayName;
  if (t.render) return t.render.displayName || t.render.name || 'ForwardRef';
  if (t.type) return t.type.displayName || t.type.name || 'Memo';
  return '(?)';
}

/** Installe le crochet DevTools sur `globalThis` (à faire avant d'importer react-dom). */
export function installerCrochetReact(): CompteurRendus {
  let commits = 0, total = 0;
  let parComposant: Record<string, number> = {};

  const parcourir = (racine: Fibre) => {
    const pile: Fibre[] = [racine];
    while (pile.length) {
      const x = pile.pop()!;
      const alt = x.alternate;
      if (TAGS_COMPOSANTS.has(x.tag) && (x.flags & TRAVAIL_EFFECTUE)) {
        const nom = nomDeFibre(x);
        parComposant[nom] = (parComposant[nom] ?? 0) + 1;
        total++;
      }
      // on ne descend que dans ce qui a été recalculé (même règle que la sonde navigateur)
      if (x.child && (!alt || x.child !== alt.child)) for (let c: Fibre | null = x.child; c; c = c.sibling) pile.push(c);
    }
  };

  let idRendu = 0;
  (globalThis as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, isDisabled: false, renderers: new Map(),
    inject(r: unknown) { const id = ++idRendu; (this as { renderers: Map<number, unknown> }).renderers.set(id, r); return id; },
    checkDCE() { /* rien */ }, onScheduleFiberRoot() { /* rien */ }, onPostCommitFiberRoot() { /* rien */ },
    onCommitFiberUnmount() { /* rien */ }, setStrictMode() { /* rien */ },
    onCommitFiberRoot(_id: number, racine: { current: Fibre }) {
      commits++;
      parcourir(racine.current);
    },
  };

  return {
    lire: () => ({ commits, total, parComposant: { ...parComposant } }),
    remettreAZero: () => { commits = 0; total = 0; parComposant = {}; },
    de: (nom) => parComposant[nom] ?? 0,
  };
}

/** Tout ce qu'il faut avant l'import de react-dom : faux DOM + crochet. À appeler depuis `vi.hoisted`. */
export function preparer(o: { largeur?: number; hauteur?: number } = {}): {
  rendus: CompteurRendus; retirerDom: () => void; declencherImage: (ts: number) => number;
} {
  const dom = installerFauxDom(o);
  return { rendus: installerCrochetReact(), retirerDom: dom.retirer, declencherImage: dom.declencherImage };
}

/** Exécute `fn` dans `act` (React valide alors tout ce qui en découle avant de rendre la main). L'indicateur d'environnement
 *  de test n'est levé que pendant ce temps : les mises à jour venues d'ailleurs (minuteries) ne produisent pas d'avertissements. */
async function dansAct(fn: () => void | Promise<void>): Promise<void> {
  const { act } = await import('react');
  const g = globalThis as Record<string, unknown>;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  try { await act(async () => { await fn(); }); } finally { g.IS_REACT_ACT_ENVIRONMENT = false; }
}

export interface Monte {
  /** exécute `fn` (changement d'état du magasin, appel d'action…) puis laisse React valider tout ce qui en découle */
  image: (fn?: () => void) => Promise<void>;
  demonter: () => Promise<void>;
  /** texte de la page montée (pour vérifier qu'un composant affiche bien ce qu'on attend) */
  texte: () => string;
  /** premier nœud de la page montée qui porte cette classe (`.sr-ph`) : son `style` dit ce que le code y a écrit ; null s'il n'y est pas */
  trouver: (selecteur: string) => { style: Record<string, string>; attributs: Map<string, string> } | null;
}

/** Monte `element` dans le faux DOM (react-dom/client est importé ICI, après le crochet). */
export async function monter(element: ReactElement): Promise<Monte> {
  const { createRoot } = await import('react-dom/client');
  const conteneur = creerConteneurFaux();
  const racine = createRoot(conteneur);
  await dansAct(() => { racine.render(element); });
  return {
    image: async (fn) => { await dansAct(() => { fn?.(); }); },
    demonter: async () => { await dansAct(() => { racine.unmount(); }); },
    texte: () => conteneur.textContent ?? '',
    trouver: (selecteur) => (conteneur as unknown as { querySelector: (s: string) => ReturnType<Monte['trouver']> }).querySelector(selecteur),
  };
}
