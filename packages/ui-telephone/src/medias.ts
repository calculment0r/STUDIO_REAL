// Préchargement des médias, piloté par la vue (rapport 4 §4.2, « on conçoit pour l'iPhone d'abord ») :
// 1. la vue annonce ce qu'il faudra jouer : `params.precharger: [{asset, sources[]}]` (souvent sur un écran `attente`),
//    ou l'`asset` d'un écran `video` ; la machine en fait un effet `precharger` ;
// 2. chaque téléphone démarre à un moment tiré entre 0 et 20 s (on lisse la pointe sur le serveur), 2 téléchargements
//    au plus à la fois ;
// 3. Cache Storage `medias-v1` (survit au rechargement et au gel d'iOS) → Blob → URL.createObjectURL : au top, le
//    premier play() part de la mémoire, ni Range ni réseau ;
// 4. repli si le Cache Storage est indisponible (navigation privée) : la source réseau en `preload="auto"` sur l'unique
//    <video> ; « prêt » se mesure alors à `buffered` (écran vidéo).
// La progression (0 → 1, par paliers de 25 %) remonte à la machine (`media`), donc au battement `etat.media[]`.
import type { MediaAPrecharger } from './machine';

export type MethodeMedia = 'cache' | 'reseau';

export interface DependancesMedias {
  fetch: (url: string) => Promise<Response>;
  /** null : Cache Storage indisponible (repli) */
  caches: CacheStorage | null;
  creerUrl: (b: Blob) => string;
  revoquerUrl: (u: string) => void;
  setTimeout: (fn: () => void, ms: number) => unknown;
  aleatoire: () => number;
}

export interface OptionsPrechargeur {
  /** progression d'un média (0 → 1) */
  surProgression: (asset: string, pret: number, methode: MethodeMedia) => void;
  surErreur?: (asset: string, erreur: string) => void;
  /** téléchargements simultanés (défaut 2) */
  concurrence?: number;
  /** départ tiré entre 0 et cette durée (défaut 20 s) */
  etalementMs?: number;
  /** nom du cache (défaut 'medias-v1') */
  nomCache?: string;
  deps?: Partial<DependancesMedias>;
}

export interface Prechargeur {
  /** ajoute des médias à précharger (ceux déjà connus sont ignorés) */
  precharger(liste: readonly MediaAPrecharger[]): void;
  /** adresse à donner au <video> : l'URL blob si le média est prêt, sinon la première source réseau */
  url(asset: string, sources?: readonly string[]): string | null;
  etat(asset: string): { pret: number; methode: MethodeMedia; erreur?: string } | undefined;
  /** vrai si le Cache Storage manque (repli preload=auto) */
  readonly repli: boolean;
  /** libère les URL blob */
  vider(): void;
}

interface Suivi {
  sources: string[];
  pret: number;
  methode: MethodeMedia;
  url?: string;
  erreur?: string;
  essais: number;
}

function dependancesNavigateur(): DependancesMedias {
  const g = globalThis as unknown as { caches?: CacheStorage; fetch?: typeof fetch; URL: typeof URL };
  return {
    fetch: (u: string) => g.fetch!(u),
    caches: g.caches ?? null,
    creerUrl: b => g.URL.createObjectURL(b),
    revoquerUrl: u => g.URL.revokeObjectURL(u),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    aleatoire: Math.random,
  };
}

const PALIERS = [0, 0.25, 0.5, 0.75, 1];

export function creerPrechargeur(o: OptionsPrechargeur): Prechargeur {
  const d: DependancesMedias = { ...dependancesNavigateur(), ...o.deps };
  const concurrence = Math.max(1, o.concurrence ?? 2);
  const etalement = Math.max(0, o.etalementMs ?? 20_000);
  const nomCache = o.nomCache ?? 'medias-v1';
  const suivis = new Map<string, Suivi>();
  const fileAttente: string[] = [];
  let actifs = 0;
  const repli = !d.caches;

  const signaler = (asset: string, s: Suivi) => {
    try { o.surProgression(asset, s.pret, s.methode); } catch { /* l'abonné ne casse pas le préchargement */ }
  };

  async function telecharger(asset: string, s: Suivi): Promise<void> {
    const source = s.sources[0];
    if (!source) throw new Error('aucune source');
    if (!d.caches) return;                                   // repli : le <video> chargera la source réseau
    const cache = await d.caches.open(nomCache);
    const deja = await cache.match(source);
    if (deja) {
      s.url = d.creerUrl(await deja.blob());
      s.pret = 1;
      signaler(asset, s);
      return;
    }
    const rep = await d.fetch(source);
    if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
    const type = rep.headers.get('content-type') ?? 'application/octet-stream';
    const total = Number(rep.headers.get('content-length')) || 0;
    let blob: Blob;
    if (rep.body && total > 0) {
      const lecteur = rep.body.getReader();
      const morceaux: Uint8Array[] = [];
      let recus = 0;
      let palier = 0;
      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        if (value) { morceaux.push(value); recus += value.byteLength; }
        const part = Math.min(0.99, recus / total);
        // paliers de 25 % : la régie n'a pas besoin de plus fin, le réseau de la salle non plus
        while (palier + 1 < PALIERS.length - 1 && part >= PALIERS[palier + 1]!) {
          palier += 1;
          s.pret = PALIERS[palier]!;
          signaler(asset, s);
        }
      }
      blob = new Blob(morceaux as BlobPart[], { type });
    } else {
      blob = await rep.blob();
    }
    try {
      await cache.put(source, new Response(blob, { headers: { 'content-type': type, 'content-length': String(blob.size) } }));
    } catch { /* quota plein : le blob en mémoire suffit pour ce soir */ }
    s.url = d.creerUrl(blob);
    s.pret = 1;
    signaler(asset, s);
  }

  function pomper() {
    while (actifs < concurrence && fileAttente.length) {
      const asset = fileAttente.shift()!;
      const s = suivis.get(asset);
      if (!s || s.pret >= 1) continue;
      actifs += 1;
      s.essais += 1;
      telecharger(asset, s)
        .catch((e: unknown) => {
          s.erreur = e instanceof Error ? e.message : String(e);
          o.surErreur?.(asset, s.erreur);
          // un second essai, plus tard (réseau de la salle saturé au moment du premier)
          if (s.essais < 2) d.setTimeout(() => { fileAttente.push(asset); pomper(); }, 5000 + d.aleatoire() * 5000);
        })
        .finally(() => { actifs -= 1; pomper(); });
    }
  }

  return {
    precharger(liste) {
      for (const m of liste) {
        if (!m.asset || suivis.has(m.asset)) continue;
        const s: Suivi = { sources: m.sources.filter(Boolean), pret: 0, methode: repli ? 'reseau' : 'cache', essais: 0 };
        suivis.set(m.asset, s);
        signaler(m.asset, s);
        if (repli) continue;
        const depart = Math.round(d.aleatoire() * etalement);
        d.setTimeout(() => { fileAttente.push(m.asset); pomper(); }, depart);
      }
    },
    url(asset, sources) {
      const s = suivis.get(asset);
      if (s?.url) return s.url;
      return s?.sources[0] ?? sources?.[0] ?? null;
    },
    etat(asset) {
      const s = suivis.get(asset);
      return s ? { pret: s.pret, methode: s.methode, ...(s.erreur ? { erreur: s.erreur } : {}) } : undefined;
    },
    get repli() { return repli; },
    vider() {
      for (const s of suivis.values()) if (s.url) { try { d.revoquerUrl(s.url); } catch { /* rien */ } }
      suivis.clear();
      fileAttente.length = 0;
    },
  };
}
