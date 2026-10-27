// Médias LOCAUX de la sortie écran scène : les vidéos précalculées sont lues sur la machine du projecteur, jamais
// téléchargées pendant le spectacle (chantier SORTIE SCÈNE). Trois sources, la première qui connaît l'asset gagne :
//   1. dossier choisi une fois (File System Access API, showDirectoryPicker) ; la poignée est gardée en IndexedDB,
//      le navigateur redemande seulement l'autorisation de lecture (un clic) à la réouverture ;
//   2. fichiers choisis à la main (<input type="file" multiple>), pour les navigateurs sans showDirectoryPicker ;
//   3. en développement, /medias-locales/ servi par vite.config.ts depuis C:\STUDIO_REAL\medias-locales\ (hors git) ;
//      pendant l'essai réel (build servi par wrangler dev), essai-reel.mjs copie ce dossier dans dist/medias-locales/.
// Un asset se retrouve par son nom exact, sans tenir compte de la casse, ou par son nom sans extension.

type Poignee = FileSystemFileHandle;
interface PoigneeDossier {
  name: string;
  values(): AsyncIterable<FileSystemHandle>;
  queryPermission?(o: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'read' }): Promise<PermissionState>;
}
type Fenetre = Window & { showDirectoryPicker?: (o?: { id?: string; mode?: 'read' }) => Promise<PoigneeDossier> };

export type SourceMedias = 'dossier' | 'fichiers' | 'dev' | 'aucun';
export interface EtatMedias {
  source: SourceMedias;
  /** nom du dossier choisi */
  dossier: string | null;
  /** le dossier est mémorisé mais le navigateur demande un clic pour le relire */
  aAutoriser: boolean;
  nombre: number;
  /** showDirectoryPicker existe dans ce navigateur */
  dossierPossible: boolean;
}

const BASE = 'studio-real-sortie';
const MAGASIN = 'poignees';
const EXT_MEDIA = /\.(mp4|webm|mov|m4v|mkv|ogv|png|jpe?g|webp|gif|avif|svg|mp3|wav|ogg|m4a)$/i;

/** Clés de recherche d'un nom : exact, minuscule, sans extension (minuscule). */
export function clesNom(nom: string): string[] {
  const n = nom.trim();
  const m = n.toLowerCase();
  const sans = m.replace(/\.[a-z0-9]{2,4}$/, '');
  return [...new Set([n, m, sans])];
}

function ouvrirBase(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  const db = await ouvrirBase();
  return new Promise((ok, ko) => {
    const tx = db.transaction(MAGASIN, mode);
    const req = fn(tx.objectStore(MAGASIN));
    req.onsuccess = () => ok(req.result as T);
    req.onerror = () => ko(req.error);
  });
}

export class BibliothequeMedias {
  private poignees = new Map<string, Poignee>();
  private fichiers = new Map<string, File>();
  private dev = new Map<string, string>();
  private urls = new Map<string, string>();
  private dossier: PoigneeDossier | null = null;
  private _etat: EtatMedias = { source: 'aucun', dossier: null, aAutoriser: false, nombre: 0, dossierPossible: !!(window as Fenetre).showDirectoryPicker };
  private abonnes = new Set<(e: EtatMedias) => void>();

  get etat(): EtatMedias { return this._etat; }
  abonner(fn: (e: EtatMedias) => void): () => void { this.abonnes.add(fn); fn(this._etat); return () => { this.abonnes.delete(fn); }; }
  private maj(p: Partial<EtatMedias>) {
    this._etat = { ...this._etat, ...p };
    const source: SourceMedias = this.poignees.size ? 'dossier' : this.fichiers.size ? 'fichiers' : this.dev.size ? 'dev' : 'aucun';
    this._etat.source = source;
    this._etat.nombre = this.poignees.size + this.fichiers.size + this.dev.size;
    for (const f of this.abonnes) f(this._etat);
  }

  private demarrage: Promise<void> | null = null;
  /** Au chargement : dossier mémorisé (si l'autorisation tient encore) et route de développement. Idempotent ;
   *  resoudre() l'attend, pour qu'une scène vidéo reçue dès l'ouverture trouve déjà ses médias. */
  demarrer(): Promise<void> {
    this.demarrage ??= Promise.all([this.restaurerDossier(), this.chargerDev()]).then(() => undefined);
    return this.demarrage;
  }

  /** Liste des médias servis sur la même origine : /medias-locales/ (serveur Vite, liste JSON) ou
   *  /medias-locales/index.json (build servi par wrangler dev pendant l'essai réel : essai-reel.mjs y copie
   *  C:\STUDIO_REAL\medias-locales\). Ailleurs (application monopage), la réponse est du HTML : ignorée. */
  private async chargerDev(): Promise<void> {
    for (const chemin of ['/medias-locales/', '/medias-locales/index.json']) {
      try {
        const r = await fetch(chemin, { headers: { accept: 'application/json' }, cache: 'no-store' });
        if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) continue;
        const l = (await r.json()) as unknown;
        if (!Array.isArray(l)) continue;
        for (const nom of l) if (typeof nom === 'string' && EXT_MEDIA.test(nom)) for (const k of clesNom(nom)) this.dev.set(k, '/medias-locales/' + encodeURIComponent(nom));
        this.maj({});
        return;
      } catch { /* pas de médias servis ici */ }
    }
  }

  private async restaurerDossier(): Promise<void> {
    if (!this._etat.dossierPossible || typeof indexedDB === 'undefined') return;
    try {
      const d = await idb<PoigneeDossier>('readonly', (s) => s.get('dossier'));
      if (!d) return;
      this.dossier = d;
      const p = await d.queryPermission?.({ mode: 'read' });
      if (p === 'granted') await this.indexer(d);
      else this.maj({ dossier: d.name, aAutoriser: true });
    } catch { /* base indisponible */ }
  }

  /** Choisit le dossier des médias (geste de l'utilisateur requis). */
  async choisirDossier(): Promise<boolean> {
    const f = window as Fenetre;
    if (!f.showDirectoryPicker) return false;
    try {
      const d = await f.showDirectoryPicker({ id: 'medias-sortie', mode: 'read' });
      this.dossier = d;
      try { await idb('readwrite', (s) => s.put(d, 'dossier')); } catch { /* non mémorisé */ }
      await this.indexer(d);
      return true;
    } catch { return false; }
  }

  /** Relit le dossier mémorisé après un clic (le navigateur redemande l'autorisation). */
  async autoriser(): Promise<boolean> {
    const d = this.dossier;
    if (!d) return false;
    try {
      const p = (await d.requestPermission?.({ mode: 'read' })) ?? 'granted';
      if (p !== 'granted') return false;
      await this.indexer(d);
      return true;
    } catch { return false; }
  }

  private async indexer(d: PoigneeDossier, profondeur = 0): Promise<void> {
    if (profondeur === 0) { this.poignees.clear(); this.oublierUrls(); }
    for await (const h of d.values()) {
      if (h.kind === 'file' && EXT_MEDIA.test(h.name)) { for (const k of clesNom(h.name)) if (!this.poignees.has(k)) this.poignees.set(k, h as Poignee); }
      else if (h.kind === 'directory' && profondeur < 2) await this.indexer(h as unknown as PoigneeDossier, profondeur + 1);
    }
    if (profondeur === 0) this.maj({ dossier: d.name, aAutoriser: false });
  }

  /** Fichiers choisis à la main. */
  ajouterFichiers(l: FileList | File[]): void {
    for (const f of Array.from(l)) if (EXT_MEDIA.test(f.name)) for (const k of clesNom(f.name)) this.fichiers.set(k, f);
    this.oublierUrls();
    this.maj({});
  }

  private oublierUrls() { for (const u of this.urls.values()) if (u.startsWith('blob:')) URL.revokeObjectURL(u); this.urls.clear(); }

  /** Adresse lisible par <video>/<img> pour un asset, ou null s'il est introuvable. */
  async resoudre(asset: string): Promise<string | null> {
    await this.demarrer();
    const cles = clesNom(asset);
    const deja = this.urls.get(cles[0]);
    if (deja) return deja;
    let url: string | null = null;
    for (const k of cles) {
      const h = this.poignees.get(k);
      if (h) { try { url = URL.createObjectURL(await h.getFile()); } catch { url = null; } break; }
    }
    if (!url) for (const k of cles) { const f = this.fichiers.get(k); if (f) { url = URL.createObjectURL(f); break; } }
    if (!url) for (const k of cles) { const u = this.dev.get(k); if (u) { url = u; break; } }
    if (url) this.urls.set(cles[0], url);
    return url;
  }
}
