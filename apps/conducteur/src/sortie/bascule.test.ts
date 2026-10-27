// BASCULE : plusieurs régies (Conducteur, moniteur, autre machine) pilotent la même sortie (arbitrage.ts, relais.ts).
// Les deux régies sont deux instances RÉELLES du module relais (comme deux pages), reliées à la sortie par un vrai
// BroadcastChannel (Node) et, pour l'une, aussi par une « salle » en mémoire : la sortie simulée applique exactement
// ce que fait page.tsx (validation, doublons, arbitrage).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { arbitrerScene, FiltreDoublons, type DecisionScene } from './arbitrage';
import { paireMemoire, transportLocal, type Transport } from './canal';
import { lireMessageRegie, msgScene, VERSION_SORTIE, type Scene } from './protocole';

const pause = (ms = 30) => new Promise((r) => setTimeout(r, ms));

describe('arbitrage des scènes (dernière décision gagne)', () => {
  const m = (heure: number, source?: string, depuis?: number) => ({ heure, ...(source ? { source } : {}), ...(depuis !== undefined ? { depuis } : {}) });

  it('première scène acceptée ; plus récente d’une autre régie acceptée ; renvoi ancien ignoré', () => {
    const a = arbitrerScene(null, m(1000, 'regie_a', 1000), 50_000)!;
    expect(a).toEqual({ source: 'regie_a', depuis: 1000, local: 50_000 });
    const b = arbitrerScene(a, m(2000, 'regie_b', 2000), 51_000)!;
    expect(b.source).toBe('regie_b');
    // régie A renvoie sa scène (arrivée d'une sortie) : décidée il y a 5 s → plus ancienne que celle de B
    expect(arbitrerScene(b, m(6000, 'regie_a', 1000), 55_000)).toBeNull();
    // A décide de nouveau : elle reprend la main
    expect(arbitrerScene(b, m(7000, 'regie_a', 7000), 56_000)?.source).toBe('regie_a');
  });

  it('horloges décalées entre machines : seul l’âge de la décision compte', () => {
    // régie B a une heure en avance d'une heure, décide APRÈS A dans le temps réel
    const a = arbitrerScene(null, m(10_000, 'regie_a', 10_000), 100_000)!;
    const b = arbitrerScene(a, m(3_600_000 + 11_000, 'regie_b', 3_600_000 + 11_000), 101_000);
    expect(b?.source).toBe('regie_b');
    // et une régie en RETARD d'une heure qui décide après reste gagnante
    const c = arbitrerScene(b!, m(12_000 - 3_600_000, 'regie_c', 12_000 - 3_600_000), 102_000);
    expect(c?.source).toBe('regie_c');
  });

  it('même régie : ses propres heures font foi ; numéros n sans effet ; ancienne régie sans depuis = décidée à l’envoi', () => {
    const a = arbitrerScene(null, m(5000, 'regie_a', 5000), 1)!;
    expect(arbitrerScene(a, m(9000, 'regie_a', 4000), 2)).toBeNull();
    expect(arbitrerScene(a, m(9000, 'regie_a', 5000), 2)).not.toBeNull();   // renvoi identique : accepté (sans effet visuel)
    const vieux = arbitrerScene(a, m(9000), 3);
    expect(vieux).toEqual({ source: '', depuis: 9000, local: 3 });
  });

  it('doublons (canal local + salle) : traités une fois', () => {
    const f = new FiltreDoublons(1000);
    const msg = msgScene({ type: 'noir' }, 1, 600, 42, { source: 'regie_a', depuis: 42 });
    expect(f.nouveau(JSON.parse(JSON.stringify(msg)), 0)).toBe(true);
    expect(f.nouveau(JSON.parse(JSON.stringify(msg)), 10)).toBe(false);
    expect(f.nouveau({ ...msg, heure: 43 }, 20)).toBe(true);
    expect(f.nouveau(msg, 2000)).toBe(true);
  });

  it('protocole : source et depuis validés', () => {
    const ok = lireMessageRegie({ t: 'scene', v: VERSION_SORTIE, heure: 2, n: 1, fondu: 0, scene: { type: 'noir' }, source: 'regie_x1', depuis: 1 });
    expect(ok).toMatchObject({ source: 'regie_x1', depuis: 1 });
    expect(lireMessageRegie({ t: 'scene', v: VERSION_SORTIE, heure: 2, n: 1, fondu: 0, scene: { type: 'noir' }, source: 'a b' })).toBeNull();
    expect(lireMessageRegie({ t: 'scene', v: VERSION_SORTIE, heure: 2, n: 1, fondu: 0, scene: { type: 'noir' }, depuis: 'x' })).toBeNull();
  });
});

/** Sortie simulée : la logique de réception de page.tsx (canal local toujours, plus la salle). */
function sortieSimulee(transports: Transport[]) {
  const filtre = new FiltreDoublons();
  let decision: DecisionScene | null = null;
  const vue = { scene: { type: 'noir' } as Scene, fondus: 0, ignores: 0, recus: 0 };
  for (const t of transports) t.ecouter((brut) => {
    const m = lireMessageRegie(brut);
    if (!m || !filtre.nouveau(m)) return;
    if (m.t !== 'scene') return;
    vue.recus++;
    const d = arbitrerScene(decision, m, Date.now());
    if (!d) { vue.ignores++; return; }
    decision = d;
    if (JSON.stringify(vue.scene) !== JSON.stringify(m.scene)) { vue.scene = m.scene; vue.fondus++; }
  });
  const bonjour = () => { for (const t of transports) t.envoyer({ t: 'bonjour', v: VERSION_SORTIE, id: 'sortie_test', heure: Date.now() }); };
  return { vue, bonjour };
}

describe('deux régies réelles, une sortie (canal local + salle)', () => {
  const ouverts: Transport[] = [];
  afterEach(() => { for (const t of ouverts.splice(0)) t.fermer(); vi.resetModules(); });

  it('moniteur et conduite pilotent la même sortie ; la dernière commande gagne ; les renvois ne volent pas la main', async () => {
    const canal = 'studio-real-sortie-test-' + Math.random().toString(36).slice(2);
    vi.resetModules();
    const conducteur = await import('./relais');
    vi.resetModules();
    const moniteur = await import('./relais');
    expect(conducteur.SOURCE_REGIE).not.toBe(moniteur.SOURCE_REGIE);

    // la salle (autre machine) : le moniteur y publie aussi ; la sortie l'écoute en plus du canal local
    const [salleRegie, salleSortie] = paireMemoire();
    const tC = transportLocal(canal), tM = transportLocal(canal), tS = transportLocal(canal);
    ouverts.push(tC, tM, tS);
    conducteur.ajouterTransport(tC);
    moniteur.ajouterTransport(tM);
    moniteur.ajouterTransport(salleRegie);
    const { vue, bonjour } = sortieSimulee([tS, salleSortie]);

    // la conduite (mode auto) montre le QR d'accueil
    const ETAT = { moment: 'm1', etape: 'e1', phase: 'etape' as const, t: 0, tEtape: 0, attenteGo: false, enLecture: false };
    conducteur.publierAuto({ type: 'accueil-qr', adresse: 'https://a.test/', titre: 'LIVE', consigne: 'Scannez' }, ETAT, []);
    await pause();
    expect(vue.scene.type).toBe('accueil-qr');

    // le moniteur (numéros n qui repartent à 1) : VIDÉO → la sortie bascule, une seule fois malgré les deux chemins
    await pause(5);
    moniteur.publierScene({ scene: 'video', asset: 'test-h3.mp4', cadrage: 'contain' }, { fondu: 800 });
    await pause();
    expect(vue.scene).toMatchObject({ type: 'video', asset: 'test-h3.mp4' });
    expect(moniteur.useSortie.getState().n).toBe(1);

    // la sortie se reconnecte : les deux régies renvoient leur scène ; celle du Conducteur (plus ancienne) est ignorée
    bonjour();
    await pause();
    expect(vue.scene.type).toBe('video');
    expect(vue.ignores).toBeGreaterThan(0);

    // la conduite lit un clip de la piste vidéo : nouvelle décision → elle gagne
    await pause(5);
    conducteur.publierAuto({ type: 'video', asset: 'clip.mp4' }, { ...ETAT, enLecture: true }, []);
    await pause();
    expect(vue.scene).toMatchObject({ type: 'video', asset: 'clip.mp4' });

    // le moniteur redemande NOIR, puis la conduite repart sur le direct, puis le moniteur re-clique NOIR :
    // le second NOIR doit repartir (le moniteur croyait déjà montrer le noir)
    await pause(5);
    moniteur.publierScene({ scene: 'noir' });
    await pause();
    expect(vue.scene.type).toBe('noir');
    await pause(5);
    conducteur.publierAuto({ type: 'streamer' }, { ...ETAT, enLecture: true }, []);
    await pause();
    expect(vue.scene.type).toBe('streamer');
    await pause(5);
    moniteur.publierScene({ scene: 'noir' });
    await pause();
    expect(vue.scene.type).toBe('noir');
    const fondus = vue.fondus;

    // un renvoi du Conducteur après tout ça ne reprend pas la main
    bonjour();
    await pause();
    expect(vue.scene.type).toBe('noir');
    expect(vue.fondus).toBe(fondus);

    conducteur.arreterRelais(); moniteur.arreterRelais();
  });

  it('retour de la sortie : vidéo introuvable et autre régie remontent à la régie', async () => {
    vi.resetModules();
    const r = await import('./relais');
    const [regie, sortie] = paireMemoire();
    r.ajouterTransport(regie);
    sortie.envoyer({ t: 'present', v: VERSION_SORTIE, id: 'sortie_test', heure: Date.now(), scene: 'video', n: 3, source: 'regie_autre',
      etat: { flux: 'direct', secours: false, medias: 'aucun', pleinEcran: false, absent: 'test-h3.mp4' } });
    const s = r.useSortie.getState();
    expect(s.fenetre).toBe('connectee');
    expect(s.sortie?.absent).toBe('test-h3.mp4');
    expect(s.autreRegie).toBe(true);
    const { texteRetourSortie } = await import('../streamer/page-moniteur');
    expect(texteRetourSortie(s)).toMatch(/test-h3\.mp4 introuvable — choisir le dossier médias/);
    expect(texteRetourSortie(s)).toMatch(/autre régie/);
    // la même fin de vidéo par deux chemins : un seul signal
    const fins: string[] = [];
    r.surFinVideo((a) => fins.push(a));
    const fin = { t: 'fin-video', v: VERSION_SORTIE, id: 'sortie_test', heure: 123, asset: 'a.mp4', n: 1 };
    sortie.envoyer(fin); sortie.envoyer(fin);
    expect(fins).toEqual(['a.mp4']);
  });
});
