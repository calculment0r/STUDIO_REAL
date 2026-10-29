// Serveurs ICE de la visio (GET /ice) : STUN sans clé ; identifiants TURN éphémères avec une clé (faux fetch : aucun
// appel réseau, aucune ressource Cloudflare) ; cache, expiration, repli STUN sur échec ; réglages lus dans la
// configuration et les secrets.
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FournisseurIce, MARGE_RENOUVELLEMENT_MS, STUN_PAR_DEFAUT, normaliserServeursIce, type ReglagesTurn } from './ice';
import { configPublique, lireJetonTurn, lireOuCreerSecrets, normaliserConfig, reglagesTurn } from './config';

const TURN: ReglagesTurn = { cleId: 'cle-essai-0123', jeton: 'jeton-secret-de-la-cle-turn', dureeS: 3600 };
const REPONSE_CF = {
  iceServers: [
    {
      urls: [
        'stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53',
        'turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp',
        'turn:turn.cloudflare.com:3478?transport=tcp', 'turns:turn.cloudflare.com:5349?transport=tcp',
      ],
      username: 'utilisateur-ephemere', credential: 'mot-de-passe-ephemere',
    },
  ],
};

interface Appel { url: string; init: RequestInit }
function fauxFetch(reponses: (() => Response | Promise<Response>)[]) {
  const appels: Appel[] = [];
  let i = 0;
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    appels.push({ url: String(url), init: init ?? {} });
    const r = reponses[Math.min(i++, reponses.length - 1)]!;
    return r();
  }) as typeof fetch;
  return { f, appels };
}
const json = (x: unknown, status = 200) => () => new Response(JSON.stringify(x), { status, headers: { 'content-type': 'application/json' } });

describe('fournisseur ICE', () => {
  it('sans clé : STUN par défaut (Cloudflare et Google), turn absent, aucun appel', async () => {
    const { f, appels } = fauxFetch([json(REPONSE_CF)]);
    const ice = new FournisseurIce({ turn: null, fetch: f, dire: () => {} });
    const r = await ice.obtenir();
    expect(r).toEqual({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }], turn: 'absent' });
    expect(appels).toHaveLength(0);
    expect(ice.configure).toBe(false);
    expect(ice.etat().etat).toBe('non-configure');
  });

  it('avec clé : identifiants éphémères demandés à Cloudflare, normalisés, port 53 filtré, expiration', async () => {
    const { f, appels } = fauxFetch([json(REPONSE_CF)]);
    let t = 1_000_000;
    const ice = new FournisseurIce({ turn: TURN, fetch: f, maintenant: () => t, dire: () => {} });
    const r = await ice.obtenir();
    expect(appels).toHaveLength(1);
    expect(appels[0]!.url).toBe('https://rtc.live.cloudflare.com/v1/turn/keys/cle-essai-0123/credentials/generate-ice-servers');
    expect(appels[0]!.init.method).toBe('POST');
    expect((appels[0]!.init.headers as Record<string, string>).authorization).toBe(`Bearer ${TURN.jeton}`);
    expect(JSON.parse(String(appels[0]!.init.body))).toEqual({ ttl: 3600 });
    expect(r.turn).toBe('present');
    expect(r.expire).toBe(t + 3600_000);
    expect(r.iceServers).toEqual([{
      urls: ['stun:stun.cloudflare.com:3478', 'turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:3478?transport=tcp', 'turns:turn.cloudflare.com:5349?transport=tcp'],
      username: 'utilisateur-ephemere', credential: 'mot-de-passe-ephemere',
    }]);
    expect(JSON.stringify(r)).not.toContain(TURN.jeton);
    expect(ice.etat()).toMatchObject({ etat: 'actif', expire: t + 3600_000, erreur: null });
    expect(JSON.stringify(ice.etat())).not.toMatch(/jeton-secret|ephemere|cle-essai/);
    t += 1000;
  });

  it('cache : pas de nouvel appel jusqu’à 5 min avant l’expiration, puis renouvellement', async () => {
    const { f, appels } = fauxFetch([json(REPONSE_CF)]);
    let t = 5_000_000;
    const ice = new FournisseurIce({ turn: TURN, fetch: f, maintenant: () => t, dire: () => {} });
    const [a, b] = await Promise.all([ice.obtenir(), ice.obtenir()]);   // deux téléphones en même temps : un appel
    expect(appels).toHaveLength(1);
    expect(a).toEqual(b);
    t += 3600_000 - MARGE_RENOUVELLEMENT_MS - 1;
    expect((await ice.obtenir()).turn).toBe('present');
    expect(appels).toHaveLength(1);
    t += 2;
    const r = await ice.obtenir();
    expect(appels).toHaveLength(2);
    expect(r.expire).toBe(t + 3600_000);
  });

  it('échec de Cloudflare (refus, réseau, réponse vide) : STUN seul, une ligne de journal, pas d’erreur ; nouvel essai après 30 s', async () => {
    const journal: string[] = [];
    let t = 0;
    const { f, appels } = fauxFetch([json({ erreur: 'refus' }, 401), json({ erreur: 'refus' }, 401), json(REPONSE_CF)]);
    const ice = new FournisseurIce({ turn: TURN, fetch: f, maintenant: () => t, dire: l => journal.push(l) });
    const r = await ice.obtenir();
    expect(r).toEqual({ iceServers: STUN_PAR_DEFAUT.map(s => ({ urls: [...s.urls] })), turn: 'absent' });
    expect(appels.map(a => a.url.split('/').pop())).toEqual(['generate-ice-servers', 'generate']);   // repli `generate`
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatch(/TURN.*http-401.*STUN seul/);
    expect(journal[0]).not.toContain(TURN.jeton);
    expect(ice.etat()).toMatchObject({ etat: 'echec', erreur: 'http-401' });
    t += 10_000;
    expect((await ice.obtenir()).turn).toBe('absent');
    expect(appels).toHaveLength(2);                       // pas de nouvel appel avant 30 s
    t += 25_000;
    expect((await ice.obtenir()).turn).toBe('present');
    expect(journal[1]).toMatch(/de nouveau/);

    const enPanne = new FournisseurIce({ turn: TURN, fetch: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch, dire: () => {} });
    expect(await enPanne.obtenir()).toMatchObject({ turn: 'absent' });
    expect(enPanne.etat()).toMatchObject({ etat: 'echec', erreur: 'reseau' });
    const vide = new FournisseurIce({ turn: TURN, fetch: fauxFetch([json({ iceServers: [{ urls: ['turn:x.test:3478'] }] })]).f, dire: () => {} });
    expect(await vide.obtenir()).toMatchObject({ turn: 'absent' });   // TURN sans identifiants : inutilisable
  });

  it('normalisation : objet seul (ancien `generate`), URL invalides et port 53 retirés', () => {
    expect(normaliserServeursIce({ iceServers: { urls: 'turn:t.test:3478', username: 'u', credential: 'c' } })).toEqual([{ urls: ['turn:t.test:3478'], username: 'u', credential: 'c' }]);
    expect(normaliserServeursIce({ iceServers: [{ urls: ['http://x', 'stun:s.test:53'] }] })).toBeNull();
    expect(normaliserServeursIce(null)).toBeNull();
  });
});

describe('réglages TURN : configuration + secrets (ou variables), jamais publiés', () => {
  it('il faut l’identifiant ET le jeton ; la valeur exemple vaut « pas de clé »', () => {
    const avec = normaliserConfig({ turn: { cleId: 'abc123', dureeS: 7200 } });
    expect(reglagesTurn(avec, 'jeton-xyz', {})).toEqual({ cleId: 'abc123', jeton: 'jeton-xyz', dureeS: 7200 });
    expect(reglagesTurn(avec, null, {})).toBeNull();
    expect(reglagesTurn(normaliserConfig({}), 'jeton-xyz', {})).toBeNull();
    expect(reglagesTurn(normaliserConfig({ turn: { cleId: '<identifiant-de-la-cle>' } }), 'jeton-xyz', {})).toBeNull();
    expect(reglagesTurn(normaliserConfig({}), null, { CF_TURN_CLE_ID: 'id-env', CF_TURN_CLE_JETON: 'jeton-env' }))
      .toEqual({ cleId: 'id-env', jeton: 'jeton-env', dureeS: 3600 });
    expect(() => normaliserConfig({ turn: { dureeS: 10 } })).toThrow(/dureeS/);
    expect(() => normaliserConfig({ turn: { cleId: 'a b' } })).toThrow(/cleId/);
  });

  it('le jeton TURN est lu dans les secrets, gardé quand le fichier est complété ; /config.json ne dit que vrai/faux', () => {
    const d = mkdtempSync(join(tmpdir(), 'secrets-turn-'));
    try {
      const f = join(d, 'spectacle.secrets.json');
      expect(lireJetonTurn(f)).toBeNull();
      writeFileSync(f, JSON.stringify({ turn: { jeton: 'jeton-turn-colle-a-la-main' } }));
      const { secrets, cree } = lireOuCreerSecrets(f);           // jetons des rôles manquants : complétés
      expect(cree).toBe(true);
      expect(secrets.turn).toEqual({ jeton: 'jeton-turn-colle-a-la-main' });
      expect(JSON.parse(readFileSync(f, 'utf8')).turn).toEqual({ jeton: 'jeton-turn-colle-a-la-main' });
      expect(lireJetonTurn(f)).toBe('jeton-turn-colle-a-la-main');
      const pub = configPublique(normaliserConfig({ turn: { cleId: 'abc123' } }), { version: null, run: null, turn: true });
      expect(pub.turn).toBe(true);
      expect(JSON.stringify(pub)).not.toMatch(/abc123|jeton/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
