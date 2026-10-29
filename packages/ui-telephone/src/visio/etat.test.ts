// Machine d'état pure des appels visio (visio/etat.ts) et lecture des signaux (visio/signaux.ts) : sans navigateur.
import { describe, expect, it } from 'vitest';
import {
  DELAI_COUPURE_MS, DELAI_NEGOCIATION_MS, DELAI_REPONSE_MS, RELANCE_APRES_FIN_MS, destinataire, destinatairesAppel, enchainerVisio, etatVisio,
  reduireVisio, type CommandeVisio, type EtatVisio, type EvenementVisio,
} from './etat';
import { lireRtcVisio, lireSignalVisio, ordonnerCodecs, type SignalVisio } from './signaux';
import { normaliserIce, origineHttp, configurationRtc } from './ice';

const V = 'visio' as const;
const sig = (s: Record<string, unknown>): SignalVisio => ({ ...s, canal: V } as unknown as SignalVisio);
const deScene = (s: Record<string, unknown>, session = 's_scene'): EvenementVisio => ({ e: 'signal', session, signal: sig({ ...s, de: 'scene' }) });
const types = (cs: CommandeVisio[]) => cs.map(c => c.c);

/** Franck en ligne, a répondu, caméra prête : offres parties vers la scène et la ministre. */
function franckEnAppel(): { e: EtatVisio; commandes: CommandeVisio[] } {
  const r = enchainerVisio(etatVisio({ moi: 'franck', graine: 'g_' }), [
    { e: 'reseau', enLigne: true },
    { e: 'demarrer', vers: ['scene', 'ministre'] },
    { e: 'camera', ok: true },
  ], 1000);
  return { e: r.etat, commandes: r.commandes };
}

describe('signaux de la visio', () => {
  it('lecture : offre, réponse, candidat, fin, recherche ; autre canal, acteur ou n invalides → ignorés', () => {
    expect(lireSignalVisio({ type: 'offre', canal: 'visio', de: 'franck', n: 'g_1', sdp: 'v=0' })).toEqual({ type: 'offre', canal: 'visio', de: 'franck', n: 'g_1', sdp: 'v=0' });
    expect(lireSignalVisio({ type: 'candidat', canal: 'visio', de: 'scene', n: 'g_1', candidat: { candidate: 'c', sdpMid: '0', sdpMLineIndex: 0, autre: 1 } }))
      .toEqual({ type: 'candidat', canal: 'visio', de: 'scene', n: 'g_1', candidat: { candidate: 'c', sdpMid: '0', sdpMLineIndex: 0 } });
    expect(lireSignalVisio({ type: 'fin', canal: 'visio', de: 'scene' })).toEqual({ type: 'fin', canal: 'visio', de: 'scene' });
    expect(lireSignalVisio({ type: 'recherche', canal: 'visio', de: 'scene' })).toMatchObject({ type: 'recherche' });
    expect(lireSignalVisio({ type: 'offre', canal: 'streamer', de: 'franck', n: 'g_1', sdp: 'v=0' })).toBeNull();
    expect(lireSignalVisio({ type: 'offre', canal: 'visio', de: 'fr anck', n: 'g_1', sdp: 'v=0' })).toBeNull();
    expect(lireSignalVisio({ type: 'offre', canal: 'visio', de: 'franck', n: '', sdp: 'v=0' })).toBeNull();
    expect(lireSignalVisio({ type: 'reponse', canal: 'visio', de: 'scene', n: 'g_1', sdp: 'x'.repeat(60_001) })).toBeNull();
    expect(lireSignalVisio({ type: 'inconnu', canal: 'visio', de: 'scene' })).toBeNull();
    // message serveur : `de` = session de l'émetteur
    expect(lireRtcVisio({ t: 'rtc', de: 's_scene', vers: 'franck', signal: { type: 'recherche', canal: 'visio', de: 'scene' }, ts: 1 }))
      .toEqual({ session: 's_scene', signal: { type: 'recherche', canal: 'visio', de: 'scene' } });
    expect(lireRtcVisio({ t: 'vue' })).toBeNull();
  });

  it('H.264 d’abord (paquetisation 1, profil 42e01f), codecs auxiliaires derrière ; ICE et adresse HTTP', () => {
    const l = ordonnerCodecs([
      { mimeType: 'video/VP8' }, { mimeType: 'video/rtx' }, { mimeType: 'video/H264', sdpFmtpLine: 'profile-level-id=640c1f' },
      { mimeType: 'video/H264', sdpFmtpLine: 'packetization-mode=1;profile-level-id=42e01f' },
    ]);
    expect(l.map(c => c.mimeType + (c.sdpFmtpLine ?? ''))).toEqual(['video/H264packetization-mode=1;profile-level-id=42e01f', 'video/H264profile-level-id=640c1f', 'video/VP8', 'video/rtx']);
    expect(normaliserIce({ iceServers: [{ urls: 'turn:t.test:3478' }] })).toBeNull();
    expect(normaliserIce({ iceServers: [{ urls: ['turn:t.test:3478'], username: 'u', credential: 'c' }] })).toEqual([{ urls: ['turn:t.test:3478'], username: 'u', credential: 'c' }]);
    expect(origineHttp('wss://echo.test/ws')).toBe('https://echo.test');
    expect(origineHttp('ws://localhost:8790/ws')).toBe('http://localhost:8790');
    expect(configurationRtc([], true)).toMatchObject({ iceTransportPolicy: 'relay' });
    expect(configurationRtc([])).not.toHaveProperty('iceTransportPolicy');
  });
});

describe('machine d’état des appels', () => {
  it('destinataires : vue.params.vers (ids d’acteurs), défaut [scene], jamais soi-même', () => {
    expect(destinatairesAppel(undefined, 'franck')).toEqual(['scene']);
    expect(destinatairesAppel(['scene', 'ministre', 'franck', 'scene', 'pas bon'], 'franck')).toEqual(['scene', 'ministre']);
  });

  it('Répondre → caméra demandée → une offre par destinataire (n distincts), H.264 côté contrôleur', () => {
    const r1 = enchainerVisio(etatVisio({ moi: 'franck', graine: 'g_' }), [{ e: 'reseau', enLigne: true }, { e: 'demarrer', vers: ['scene', 'ministre'] }]);
    expect(r1.commandes).toEqual([{ c: 'camera' }]);
    expect(r1.etat.camera).toBe('demande');
    const { e, commandes } = franckEnAppel();
    const offres = commandes.filter((c): c is Extract<CommandeVisio, { c: 'offrir' }> => c.c === 'offrir');
    expect(offres.map(o => [o.acteur, o.cle])).toEqual([['scene', 'vers:scene'], ['ministre', 'vers:ministre']]);
    expect(new Set(offres.map(o => o.n)).size).toBe(2);
    expect(e.pairs['vers:scene']).toMatchObject({ phase: 'offre', session: null, sens: 'emission' });
    // avant la réponse, les candidats vont à l'acteur ; après, à sa session
    expect(destinataire(e, 'vers:scene', offres[0]!.n)).toBe('scene');
    expect(destinataire(e, 'vers:scene', 'autre-n')).toBeNull();
  });

  it('réponse : description distante, session fixée ; second onglet « scene » → fin ; vieille réponse ignorée', () => {
    const { e } = franckEnAppel();
    const n = e.pairs['vers:scene']!.n;
    const r = reduireVisio(e, deScene({ type: 'reponse', n, sdp: 'rep' }), 2000);
    expect(r.commandes).toEqual([{ c: 'distant', cle: 'vers:scene', n, sdp: 'rep' }]);
    expect(r.etat.pairs['vers:scene']).toMatchObject({ session: 's_scene', phase: 'negociation' });
    expect(destinataire(r.etat, 'vers:scene', n)).toBe('s_scene');
    const r2 = reduireVisio(r.etat, deScene({ type: 'reponse', n, sdp: 'rep2' }, 's_scene_2'), 2100);
    expect(r2.commandes).toEqual([{ c: 'envoyer', vers: 's_scene_2', signal: { type: 'fin', canal: 'visio', de: 'franck', n } }]);
    expect(reduireVisio(r.etat, deScene({ type: 'reponse', n: 'vieux', sdp: 'x' }), 2200).commandes).toEqual([]);
    // candidats : seulement ceux de la bonne session et du bon n
    expect(reduireVisio(r.etat, deScene({ type: 'candidat', n, candidat: { candidate: 'c1' } }), 2300).commandes)
      .toEqual([{ c: 'candidat', cle: 'vers:scene', n, candidat: { candidate: 'c1' } }]);
    expect(reduireVisio(r.etat, deScene({ type: 'candidat', n, candidat: { candidate: 'c1' } }, 's_autre'), 2300).commandes).toEqual([]);
  });

  it('offre reçue pendant que ça sonne : gardée, puis traitée à Répondre (la ministre reçoit Franck)', () => {
    const offre: EvenementVisio = { e: 'signal', session: 's_franck', signal: sig({ type: 'offre', de: 'franck', n: 'f1', sdp: 'o' }) };
    let r = enchainerVisio(etatVisio({ moi: 'ministre', graine: 'm_' }), [{ e: 'reseau', enLigne: true }, offre]);
    expect(r.commandes).toEqual([]);
    expect(r.etat.attente.franck).toMatchObject({ session: 's_franck', n: 'f1' });
    r = enchainerVisio(r.etat, [{ e: 'demarrer', vers: ['scene'] }]);
    expect(types(r.commandes)).toEqual(['camera', 'repondre']);
    expect(r.commandes[1]).toEqual({ c: 'repondre', cle: 'de:franck', acteur: 'franck', session: 's_franck', n: 'f1', sdp: 'o' });
    expect(r.etat.attente).toEqual({});
    // nouvelle offre du même acteur pendant l'appel : l'ancienne réception est remplacée
    const r2 = reduireVisio(r.etat, { e: 'signal', session: 's_franck', signal: sig({ type: 'offre', de: 'franck', n: 'f2', sdp: 'o2' }) }, 10);
    expect(types(r2.commandes)).toEqual(['fermer', 'repondre']);
    expect(r2.etat.pairs['de:franck']!.n).toBe('f2');
  });

  it('délais : sans réponse 10 s, sans connexion 15 s, coupée 4 s → nouvelle offre (nouveau n) ; connectée : rien', () => {
    const { e } = franckEnAppel();
    const n1 = e.pairs['vers:scene']!.n;
    expect(reduireVisio(e, { e: 'tick' }, 1000 + DELAI_REPONSE_MS - 1).commandes).toEqual([]);
    const r = reduireVisio(e, { e: 'tick' }, 1000 + DELAI_REPONSE_MS);
    const offres = r.commandes.filter(c => c.c === 'offrir');
    expect(offres).toHaveLength(2);
    expect(r.etat.pairs['vers:scene']!.n).not.toBe(n1);
    // l'ancien numéro est abandonné chez le destinataire
    expect(r.commandes).toContainEqual({ c: 'envoyer', vers: 'scene', signal: { type: 'fin', canal: 'visio', de: 'franck', n: n1 } });

    let s = reduireVisio(e, deScene({ type: 'reponse', n: n1, sdp: 'r' }), 2000).etat;
    expect(reduireVisio(s, { e: 'tick' }, 2000 + DELAI_NEGOCIATION_MS).etat.pairs['vers:scene']!.n).not.toBe(n1);
    s = reduireVisio(s, { e: 'liaison', cle: 'vers:scene', n: n1, etat: 'connecte' }, 3000).etat;
    expect(s.pairs['vers:scene']!.phase).toBe('connecte');
    expect(reduireVisio(s, { e: 'tick' }, 60_000).commandes.filter(c => c.c === 'offrir' && c.acteur === 'scene')).toEqual([]);
    s = reduireVisio(s, { e: 'liaison', cle: 'vers:scene', n: n1, etat: 'coupe' }, 70_000).etat;
    expect(reduireVisio(s, { e: 'tick' }, 70_000 + DELAI_COUPURE_MS - 1).etat.pairs['vers:scene']!.n).toBe(n1);
    expect(reduireVisio(s, { e: 'tick' }, 70_000 + DELAI_COUPURE_MS).etat.pairs['vers:scene']!.n).not.toBe(n1);
    // échec ICE : tout de suite
    const ech = reduireVisio(s, { e: 'liaison', cle: 'vers:scene', n: n1, etat: 'echec' }, 70_001);
    expect(ech.commandes.some(c => c.c === 'offrir' && c.acteur === 'scene')).toBe(true);
  });

  it('fin du destinataire : pair fermé, nouvel essai 15 s plus tard ou dès sa recherche', () => {
    const { e } = franckEnAppel();
    const n1 = e.pairs['vers:scene']!.n;
    const r = reduireVisio(e, deScene({ type: 'fin', n: n1 }), 5000);
    expect(r.commandes).toEqual([{ c: 'fermer', cle: 'vers:scene' }]);
    expect(r.etat.pairs['vers:scene']).toBeUndefined();
    const avant = reduireVisio(r.etat, { e: 'tick' }, 5000 + RELANCE_APRES_FIN_MS - 1);
    expect(avant.commandes.filter(c => c.c === 'offrir' && c.acteur === 'scene')).toEqual([]);
    expect(reduireVisio(r.etat, { e: 'tick' }, 5000 + RELANCE_APRES_FIN_MS).commandes).toContainEqual(expect.objectContaining({ c: 'offrir', acteur: 'scene' }));
    expect(reduireVisio(r.etat, deScene({ type: 'recherche' }), 5001).commandes).toContainEqual(expect.objectContaining({ c: 'offrir', acteur: 'scene' }));
    // recherche pendant une négociation récente : on ne la casse pas
    expect(reduireVisio(e, deScene({ type: 'recherche' }), 2000).commandes).toEqual([]);
  });

  it('reconnexion WebSocket : renégociation (nouveau n) des émissions non établies ; la liaison établie survit', () => {
    const { e } = franckEnAppel();
    const nScene = e.pairs['vers:scene']!.n;
    const nMin = e.pairs['vers:ministre']!.n;
    let s = reduireVisio(e, { e: 'liaison', cle: 'vers:ministre', n: nMin, etat: 'connecte' }, 2000).etat;
    s = reduireVisio(s, { e: 'reseau', enLigne: false }, 3000).etat;
    // hors ligne : rien ne part, même à l'échéance
    expect(reduireVisio(s, { e: 'tick' }, 30_000).commandes.filter(c => c.c === 'offrir' || c.c === 'envoyer')).toEqual([]);
    const r = reduireVisio(s, { e: 'reseau', enLigne: true }, 4000);
    expect(r.commandes.filter(c => c.c === 'offrir').map(c => (c as { acteur: string }).acteur)).toEqual(['scene']);
    expect(r.etat.pairs['vers:scene']!.n).not.toBe(nScene);
    expect(r.etat.pairs['vers:ministre']!.n).toBe(nMin);
  });

  it('caméra refusée : pas d’émission, la réception marche ; Raccrocher : fin à chacun, caméra libérée, tout fermé', () => {
    const refus = enchainerVisio(etatVisio({ moi: 'ministre', graine: 'm_' }), [{ e: 'reseau', enLigne: true }, { e: 'demarrer', vers: ['scene'] }, { e: 'camera', ok: false, erreur: 'NotAllowedError' }]);
    expect(refus.etat).toMatchObject({ camera: 'refusee', erreurCamera: 'NotAllowedError' });
    expect(refus.commandes.filter(c => c.c === 'offrir')).toEqual([]);
    expect(types(reduireVisio(refus.etat, { e: 'signal', session: 's_f', signal: sig({ type: 'offre', de: 'franck', n: 'f1', sdp: 'o' }) }, 1).commandes)).toEqual(['repondre']);

    const { e } = franckEnAppel();
    const n = e.pairs['vers:scene']!.n;
    const s = reduireVisio(e, deScene({ type: 'reponse', n, sdp: 'r' }), 2000).etat;
    const r = reduireVisio(s, { e: 'arreter' }, 3000);
    expect(r.commandes).toEqual([
      { c: 'envoyer', vers: 's_scene', signal: { type: 'fin', canal: 'visio', de: 'franck', n } },
      { c: 'fermer', cle: 'vers:scene' },
      { c: 'envoyer', vers: 'ministre', signal: expect.objectContaining({ type: 'fin' }) },
      { c: 'fermer', cle: 'vers:ministre' },
      { c: 'liberer-camera' },
    ]);
    expect(r.etat).toMatchObject({ actif: false, camera: 'eteinte', pairs: {} });
    // caméra arrivée après Raccrocher : rendue tout de suite
    expect(reduireVisio(r.etat, { e: 'camera', ok: true }, 3100).commandes).toEqual([{ c: 'liberer-camera' }]);
  });
});
