// Petite aide DOM des pages du flux streamer (pas de React : page légère pour le téléphone).
type Attrs = Record<string, string | boolean | number | ((e: Event) => void) | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...enfants: (Node | string | null | undefined)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') e.addEventListener(k.replace(/^on/, ''), v);
    else if (k === 'class') e.className = String(v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, String(v));
  }
  for (const c of enfants) if (c !== null && c !== undefined) e.append(c);
  return e;
}

export const ICONES = {
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h3l2-2h6l2 2h3v11H4z"/><path d="M9 13a3 3 0 0 0 5.6 1.5M15 12a3 3 0 0 0-5.6-1.5"/><path d="M14.6 14.5V12.6h-1.8M9.4 10.5v1.9h1.8"/></svg>',
  micro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  microCoupe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M4 4l16 16"/></svg>',
};

export function icone(nom: keyof typeof ICONES): HTMLSpanElement {
  const s = document.createElement('span');
  s.innerHTML = ICONES[nom];
  return s;
}

export const heureCourte = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
