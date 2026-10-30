// Identité (jeton d'appareil à deux endroits, accès par le fragment) et préchargement des médias (Cache Storage,
// concurrence 2, départ étalé, repli), avec des faux stockages et un faux réseau.
import { describe, expect, it } from 'vitest';
import { CLES, jetonAppareil, lireAcces, lireCseq, garderCseq, sessionOnglet, type Cookies, type Stockage } from './identite';
import { creerPrechargeur } from './medias';

class Memoire implements Stockage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}
class Pot implements Cookies {
  brut = '';
  lire() { return this.brut; }
  ecrire(v: string) { const [kv] = v.split(';'); this.brut = this.brut ? `${this.brut}; ${kv}` : kv!; }
}
const interdit: Stockage = { getItem() { throw new Error('interdit'); }, setItem() { throw new Error('interdit'); } };

describe('identité du téléphone', () => {
  it('jeton d’appareil : créé une fois, gardé en localStorage ET en cookie', () => {
    const local = new Memoire();
    const cookies = new Pot();
    const j = jetonAppareil(local, cookies);
    expect(j).toMatch(/^[A-Za-z0-9_-]{6,64}$/);
    expect(local.getItem(CLES.appareil)).toBe(j);
    expect(cookies.lire()).toContain(`${CLES.cookie}=${j}`);
    expect(jetonAppareil(local, cookies)).toBe(j);
  });

  it('un des deux endroits vidé : le jeton revient de l’autre (même personne pour le serveur)', () => {
    const local = new Memoire();
    const cookies = new Pot();
    const j = jetonAppareil(local, cookies);
    expect(jetonAppareil(new Memoire(), cookies)).toBe(j);           // localStorage vidé
    expect(jetonAppareil(local, new Pot())).toBe(j);                  // cookie effacé
  });

  it('lecture tolérante : stockage interdit, valeur abîmée → nouveau jeton, sans lever', () => {
    expect(jetonAppareil(interdit, null)).toMatch(/^[A-Za-z0-9_-]{6,64}$/);
    const local = new Memoire();
    local.setItem(CLES.appareil, 'pas bon !');
    expect(jetonAppareil(local, null)).not.toBe('pas bon !');
    expect(lireCseq(interdit)).toBe(0);
    garderCseq(interdit, 3);
  });

  it('session de l’onglet et cseq gardés', () => {
    const s = new Memoire();
    const id = sessionOnglet(s);
    expect(id).toMatch(/^s_[A-Za-z0-9]{6,}$/);
    expect(sessionOnglet(s)).toBe(id);
    garderCseq(s, 12);
    expect(lireCseq(s)).toBe(12);
  });

  it('accès par le FRAGMENT : rangé en sessionStorage, à effacer de l’adresse, relu après rechargement', () => {
    const s = new Memoire();
    expect(lireAcces('#acteur=franck&jeton=j.abc-123', s)).toEqual({ acces: { acteur: 'franck', jeton: 'j.abc-123' }, effacer: true });
    expect(lireAcces('', s)).toEqual({ acces: { acteur: 'franck', jeton: 'j.abc-123' }, effacer: false });
    expect(lireAcces('', new Memoire())).toEqual({ acces: { acteur: 'public', jeton: null }, effacer: false });
    expect(lireAcces('#acteur=../x', new Memoire()).acces.acteur).toBe('public');
  });
});

// ── Préchargement ──────────────────────────────────────────────────────────────────────────────────────────────────

function fauxCache() {
  const contenu = new Map<string, Blob>();
  const cache = {
    match: async (u: string) => (contenu.has(u) ? new Response(contenu.get(u)!) : undefined),
    put: async (u: string, r: Response) => { contenu.set(u, await r.blob()); },
  };
  const caches = { open: async () => cache } as unknown as CacheStorage;
  return { contenu, caches };
}

const attendre = () => new Promise(r => setTimeout(r, 0));

describe('préchargement des médias', () => {
  it('2 téléchargements au plus, départs étalés, Cache Storage puis URL blob, progression jusqu’à 1', async () => {
    const { contenu, caches } = fauxCache();
    const minuteurs: { ms: number; fn: () => void }[] = [];
    const enCours = new Set<string>();
    let maxSimultanes = 0;
    const liberer = new Map<string, () => void>();
    const progression: [string, number][] = [];
    const p = creerPrechargeur({
      surProgression: (a, pret) => progression.push([a, pret]),
      deps: {
        caches,
        fetch: (u: string) => new Promise<Response>(ok => {
          enCours.add(u);
          maxSimultanes = Math.max(maxSimultanes, enCours.size);
          liberer.set(u, () => { enCours.delete(u); ok(new Response(new Blob(['video:' + u]), { headers: { 'content-type': 'video/mp4' } })); });
        }),
        creerUrl: b => `blob:${b.size}`,
        revoquerUrl: () => undefined,
        setTimeout: (fn, ms) => { minuteurs.push({ ms, fn }); return minuteurs.length; },
        aleatoire: () => 0.25,
      },
    });
    p.precharger([{ asset: 'a', sources: ['/a.mp4'] }, { asset: 'b', sources: ['/b.mp4'] }, { asset: 'c', sources: ['/c.mp4'] }]);
    expect(minuteurs.map(m => m.ms)).toEqual([5000, 5000, 5000]);        // 0,25 × 20 s
    expect(p.url('a')).toBe('/a.mp4');                                   // pas encore prêt : la source réseau
    minuteurs.splice(0).forEach(m => m.fn());
    await attendre();
    expect(maxSimultanes).toBe(2);
    liberer.get('/a.mp4')!();
    await attendre(); await attendre(); await attendre();
    expect(enCours.has('/c.mp4')).toBe(true);
    liberer.get('/b.mp4')!(); liberer.get('/c.mp4')!();
    for (let i = 0; i < 6; i++) await attendre();
    expect(maxSimultanes).toBe(2);
    expect(p.url('a')).toMatch(/^blob:/);
    expect(p.etat('c')).toEqual({ pret: 1, methode: 'cache' });
    expect([...contenu.keys()].sort()).toEqual(['/a.mp4', '/b.mp4', '/c.mp4']);
    expect(progression.filter(([a]) => a === 'a').map(([, x]) => x)).toEqual([0, 1]);
  });

  it('déjà dans le cache (rechargement de la page) : prêt sans réseau', async () => {
    const { contenu, caches } = fauxCache();
    contenu.set('/a.mp4', new Blob(['deja']));
    let appels = 0;
    const p = creerPrechargeur({
      surProgression: () => undefined,
      deps: { caches, fetch: async () => { appels += 1; return new Response('x'); }, creerUrl: () => 'blob:a', revoquerUrl: () => undefined, setTimeout: fn => { fn(); return 0; }, aleatoire: () => 0 },
    });
    p.precharger([{ asset: 'a', sources: ['/a.mp4'] }]);
    for (let i = 0; i < 4; i++) await attendre();
    expect(appels).toBe(0);
    expect(p.url('a')).toBe('blob:a');
  });

  it('repli sans Cache Storage (navigation privée) : rien n’est téléchargé, la source réseau va au <video>', () => {
    let appels = 0;
    const p = creerPrechargeur({
      surProgression: () => undefined,
      deps: { caches: null, fetch: async () => { appels += 1; return new Response('x'); }, setTimeout: fn => { fn(); return 0; } },
    });
    p.precharger([{ asset: 'a', sources: ['/a.mp4'] }]);
    expect(p.repli).toBe(true);
    expect(appels).toBe(0);
    expect(p.url('a')).toBe('/a.mp4');
    expect(p.etat('a')).toEqual({ pret: 0, methode: 'reseau' });
  });
});
