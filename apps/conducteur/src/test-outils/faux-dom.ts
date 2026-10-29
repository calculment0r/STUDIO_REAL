// Document minimal pour monter de VRAIS composants React dans vitest, sans navigateur ni jsdom (aucune dépendance de
// plus : jsdom n'est pas installé). Il ne dessine rien : il tient juste assez de l'interface du DOM pour que react-dom
// puisse créer, insérer, modifier et retirer des nœuds, et pour que les composants du Conducteur s'exécutent.
// À installer AVANT d'importer react-dom (voir rendus.ts : `installerFauxDom()`), puis à désinstaller avec la fonction
// renvoyée. Les mesures de mise en page (getBoundingClientRect, clientWidth…) répondent des zéros ou la taille donnée à
// `installerFauxDom({ largeur, hauteur })`. requestAnimationFrame est manuel (`declencherImage`).

type Ecouteur = (e: unknown) => void;

// ── écritures de style ──────────────────────────────────────────────────────────────────────────────────────────────
// Chaque écriture dans `element.style` (par React ou par du code qui écrit le DOM à la main) est comptée par propriété :
// c'est la mesure, sans navigateur, des écritures qui obligent le vrai navigateur à refaire une MISE EN PAGE (left, width…).
const ecritures = new Map<string, number>();
/** Propriétés dont le changement oblige le navigateur à refaire la mise en page (et non seulement à repeindre ou à composer). */
const GEOMETRIE = /^(left|right|top|bottom|width|height|min-?width|max-?width|min-?height|max-?height|margin.*|padding.*|display|position|flex.*|grid.*|font-?size|line-?height|border-?width|gap)$/i;
/** Écritures de style depuis la dernière remise à zéro : toutes, et celles qui changent la géométrie. */
export function ecrituresDeStyle(): { toutes: number; geometrie: number; parPropriete: Record<string, number> } {
  let toutes = 0, geometrie = 0;
  for (const [k, n] of ecritures) { toutes += n; if (GEOMETRIE.test(k)) geometrie += n; }
  return { toutes, geometrie, parPropriete: Object.fromEntries(ecritures) };
}
export function remettreAZeroEcritures(): void { ecritures.clear(); }
const compter = (k: string) => ecritures.set(k, (ecritures.get(k) ?? 0) + 1);
const creerStyle = (): Noeud['style'] => new Proxy({
  setProperty(n: string, v: string) { (this as Record<string, unknown>)[n] = v; },
  removeProperty(n: string) { delete (this as Record<string, unknown>)[n]; },
} as Noeud['style'], {
  set(t, k, v) { if (typeof k === 'string' && k !== 'setProperty' && k !== 'removeProperty') compter(k); (t as Record<string | symbol, unknown>)[k] = v; return true; },
});

class Noeud {
  nodeType = 1;
  nodeName = '';
  tagName = '';
  namespaceURI = 'http://www.w3.org/1999/xhtml';
  parentNode: Noeud | null = null;
  childNodes: Noeud[] = [];
  ownerDocument: unknown = null;
  nodeValue: string | null = null;
  attributs = new Map<string, string>();
  style: Record<string, unknown> & { setProperty: (n: string, v: string) => void; removeProperty: (n: string) => void } = creerStyle();
  private ecouteurs = new Map<string, Set<Ecouteur>>();
  largeur = 0;
  hauteur = 0;

  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null; }
  get nextSibling(): Noeud | null { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) + 1] ?? null : null; }
  get previousSibling(): Noeud | null { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) - 1] ?? null : null; }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get clientWidth() { return this.largeur; }
  get clientHeight() { return this.hauteur; }
  get offsetWidth() { return this.largeur; }
  get offsetHeight() { return this.hauteur; }
  get scrollTop() { return 0; }
  get textContent(): string {
    if (this.nodeType === 3) return this.nodeValue ?? '';
    return this.childNodes.map((n) => n.textContent).join('');
  }
  set textContent(v: string) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    if (v) { const t = new Noeud(); t.nodeType = 3; t.nodeName = '#text'; t.nodeValue = v; t.ownerDocument = this.ownerDocument; this.appendChild(t); }
  }
  get data() { return this.nodeValue ?? ''; }
  set data(v: string) { this.nodeValue = v; }

  private detacher(n: Noeud) { n.parentNode?.removeChild(n); }
  appendChild(n: Noeud) { this.detacher(n); n.parentNode = this; this.childNodes.push(n); return n; }
  insertBefore(n: Noeud, ref: Noeud | null) {
    this.detacher(n);
    n.parentNode = this;
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
    return n;
  }
  removeChild(n: Noeud) {
    const i = this.childNodes.indexOf(n);
    if (i >= 0) this.childNodes.splice(i, 1);
    n.parentNode = null;
    return n;
  }
  replaceChild(nouveau: Noeud, ancien: Noeud) { this.insertBefore(nouveau, ancien); this.removeChild(ancien); return ancien; }
  remove() { this.parentNode?.removeChild(this); }
  contains(n: Noeud | null): boolean { for (let c: Noeud | null = n; c; c = c.parentNode) if (c === this) return true; return false; }
  setAttribute(n: string, v: unknown) { this.attributs.set(n, String(v)); }
  setAttributeNS(_ns: string | null, n: string, v: unknown) { this.attributs.set(n, String(v)); }
  getAttribute(n: string) { return this.attributs.get(n) ?? null; }
  hasAttribute(n: string) { return this.attributs.has(n); }
  removeAttribute(n: string) { this.attributs.delete(n); }
  removeAttributeNS(_ns: string | null, n: string) { this.attributs.delete(n); }
  addEventListener(t: string, f: Ecouteur) { let s = this.ecouteurs.get(t); if (!s) this.ecouteurs.set(t, (s = new Set())); s.add(f); }
  removeEventListener(t: string, f: Ecouteur) { this.ecouteurs.get(t)?.delete(f); }
  dispatchEvent(e: { type: string }) { for (const f of this.ecouteurs.get(e.type) ?? []) f(e); return true; }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: this.largeur, bottom: this.hauteur, width: this.largeur, height: this.hauteur }; }
  getContext() { return null; }
  closest() { return null; }
  matches() { return false; }
  /** Sélecteurs pris en charge : `.classe`, `.a.b`, `balise`, `balise.classe` (assez pour retrouver un nœud dans un test). */
  querySelectorAll(sel: string): Noeud[] {
    const m = /^([a-z0-9-]*)((?:\.[A-Za-z0-9_-]+)*)$/i.exec(sel.trim());
    const trouves: Noeud[] = [];
    if (!m) return trouves;
    const balise = (m[1] ?? '').toLowerCase(), classes = (m[2] ?? '').split('.').filter(Boolean);
    const visiter = (n: Noeud) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 1) {
          const portees = (c.getAttribute('class') ?? '').split(/\s+/);
          if ((!balise || c.nodeName.toLowerCase() === balise) && classes.every(k => portees.includes(k))) trouves.push(c);
          visiter(c);
        }
      }
    };
    visiter(this);
    return trouves;
  }
  querySelector(sel: string): Noeud | null { return this.querySelectorAll(sel)[0] ?? null; }
  getElementsByTagName() { return []; }
  focus() { /* rien */ }
  blur() { /* rien */ }
  scrollIntoView() { /* rien */ }
  setPointerCapture() { /* rien */ }
  releasePointerCapture() { /* rien */ }
  cloneNode() { return this; }
  get classList() {
    const classes = () => (this.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
    return {
      add: (...c: string[]) => this.setAttribute('class', [...new Set([...classes(), ...c])].join(' ')),
      remove: (...c: string[]) => this.setAttribute('class', classes().filter((x) => !c.includes(x)).join(' ')),
      contains: (c: string) => classes().includes(c),
      toggle: () => false,
    };
  }
  get dataset(): Record<string, string> { return {}; }
}

class ClasseHTML extends Noeud {}
class ClasseIframe extends ClasseHTML {}

export interface OptionsFauxDom { largeur?: number; hauteur?: number }

/** Installe `window`, `document` et quelques classes/observateurs sur `globalThis` ; renvoie la fonction qui les retire. */
export interface FauxDom {
  /** retire tout ce qui a été installé */
  retirer: () => void;
  /** exécute les rappels de requestAnimationFrame en attente (comme une image du navigateur) avec l'horodatage `ts` (ms) */
  declencherImage: (ts: number) => number;
}

export function installerFauxDom(o: OptionsFauxDom = {}): FauxDom {
  const g = globalThis as Record<string, unknown>;
  const anciens = new Map<string, unknown>();
  const poser = (nom: string, valeur: unknown) => {
    if (!anciens.has(nom)) anciens.set(nom, Object.getOwnPropertyDescriptor(g, nom));
    Object.defineProperty(g, nom, { value: valeur, configurable: true, writable: true, enumerable: true });
  };

  const creer = (nom: string, ns = 'http://www.w3.org/1999/xhtml'): Noeud => {
    const n = nom.toLowerCase() === 'iframe' ? new ClasseIframe() : new ClasseHTML();
    n.nodeName = ns.endsWith('xhtml') ? nom.toUpperCase() : nom;
    n.tagName = n.nodeName;
    n.namespaceURI = ns;
    n.ownerDocument = document;
    return n;
  };
  const document = new Noeud() as Noeud & Record<string, unknown>;
  document.nodeType = 9;
  document.nodeName = '#document';
  document.ownerDocument = null;
  const racine = creer('html'), corps = creer('body');
  racine.appendChild(corps);
  document.appendChild(racine);
  Object.assign(document, {
    documentElement: racine, body: corps, head: creer('head'), activeElement: corps, hidden: false, visibilityState: 'visible',
    defaultView: null as unknown,
    createElement: (n: string) => creer(n),
    createElementNS: (ns: string, n: string) => creer(n, ns),
    createTextNode: (t: string) => { const n = new Noeud(); n.nodeType = 3; n.nodeName = '#text'; n.nodeValue = t; n.ownerDocument = document; return n; },
    createComment: (t: string) => { const n = new Noeud(); n.nodeType = 8; n.nodeName = '#comment'; n.nodeValue = t; n.ownerDocument = document; return n; },
    getElementById: () => null,
    hasFocus: () => true,
    fonts: { ready: Promise.resolve(), addEventListener() { /* rien */ } },
  });
  racine.ownerDocument = document;
  corps.ownerDocument = document;

  const ecouteursFenetre = new Map<string, Set<Ecouteur>>();
  const fenetre: Record<string, unknown> = {
    document, innerWidth: o.largeur ?? 1440, innerHeight: o.hauteur ?? 900, devicePixelRatio: 1, event: undefined,
    addEventListener: (t: string, f: Ecouteur) => { let s = ecouteursFenetre.get(t); if (!s) ecouteursFenetre.set(t, (s = new Set())); s.add(f); },
    removeEventListener: (t: string, f: Ecouteur) => { ecouteursFenetre.get(t)?.delete(f); },
    dispatchEvent: () => true,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    getSelection: () => null,
    matchMedia: () => ({ matches: false, addEventListener() { /* rien */ }, removeEventListener() { /* rien */ }, addListener() { /* rien */ }, removeListener() { /* rien */ } }),
    open: () => null,
    HTMLElement: ClasseHTML, HTMLIFrameElement: ClasseIframe, Element: Noeud, Node: Noeud, SVGElement: Noeud,
  };
  // `window` : l'objet ci-dessus, et pour tout le reste (setTimeout, performance, localStorage…) les globales de Node, lues
  // au moment de l'appel (les minuteries simulées de vitest restent donc prises en compte).
  const fenetreProxy = new Proxy(fenetre, {
    get: (t, k) => (k in t ? t[k as string] : (globalThis as Record<string | symbol, unknown>)[k]),
    has: (t, k) => k in t || k in globalThis,
  });
  (document as Record<string, unknown>).defaultView = fenetreProxy;
  poser('window', fenetreProxy);
  poser('document', document);
  for (const nom of ['HTMLElement', 'HTMLIFrameElement', 'Element', 'Node', 'SVGElement']) poser(nom, fenetre[nom]);
  poser('getComputedStyle', fenetre.getComputedStyle);
  poser('matchMedia', fenetre.matchMedia);
  // requestAnimationFrame ne tourne PAS tout seul : le test décide du moment de chaque image (declencherImage), donc
  // la lecture avance de façon déterministe, sans dépendre de l'horloge réelle de la machine.
  let rappels = new Map<number, (t: number) => void>();
  let numeroRappel = 0;
  poser('requestAnimationFrame', (f: (t: number) => void) => { rappels.set(++numeroRappel, f); return numeroRappel; });
  poser('cancelAnimationFrame', (id: number) => { rappels.delete(id); });
  const declencherImage = (ts: number): number => {
    const courants = rappels;
    rappels = new Map();
    for (const f of courants.values()) f(ts);
    return courants.size;
  };
  fenetre.requestAnimationFrame = g.requestAnimationFrame;
  fenetre.cancelAnimationFrame = g.cancelAnimationFrame;
  class Observateur { observe() { /* rien */ } unobserve() { /* rien */ } disconnect() { /* rien */ } takeRecords() { return []; } }
  poser('ResizeObserver', Observateur);
  poser('IntersectionObserver', Observateur);
  poser('MutationObserver', Observateur);

  const conteneurs: Noeud[] = [];
  const creerConteneur = (largeur = o.largeur ?? 1440, hauteur = o.hauteur ?? 900): Noeud => {
    const c = creer('div');
    c.largeur = largeur; c.hauteur = hauteur;
    corps.appendChild(c);
    conteneurs.push(c);
    return c;
  };
  (fenetre as Record<string, unknown>).__creerConteneur = creerConteneur;

  const retirer = () => {
    for (const [nom, d] of anciens) {
      if (d) Object.defineProperty(g, nom, d as PropertyDescriptor); else delete g[nom];
    }
    anciens.clear();
  };
  return { retirer, declencherImage };
}

/** Un élément racine pour `createRoot` (à utiliser après `installerFauxDom`). */
export function creerConteneurFaux(largeur?: number, hauteur?: number): HTMLElement {
  const w = (globalThis as unknown as { window: { __creerConteneur: (l?: number, h?: number) => HTMLElement } }).window;
  return w.__creerConteneur(largeur, hauteur);
}
