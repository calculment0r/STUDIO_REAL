import { describe, expect, it } from 'vitest';
import { Horloge, mmssRebours, restantCompteur } from './horloge';
import { clesNom } from './medias';
import {
  adresseEntree, adresseLisible, borneFondu, BUILD_SORTIE, cleScene, examinerMessageRegie, lireMessageRegie, lireMessageSortie, msgBonjour,
  msgConfig, msgEtat, msgEvenement, msgHeure, msgPrecharger, msgPresent, msgRecharger, msgScene, sceneValide, VERSION_SORTIE,
} from './protocole';
import { clePage, hotePage, pourcentages, traceQr } from './scenes';
import { cadrageAuto } from './videos';

describe('protocole du canal régie → sortie', () => {
  it('les messages construits sont relus à l’identique', () => {
    const etat = { moment: 'm', etape: 'e', phase: 'etape' as const, t: 12, tEtape: 3, attenteGo: false, enLecture: true, compteur: { restant: 9, duree: 30, enCours: true, vitesse: 1 } };
    for (const m of [
      msgEtat(etat, 5), msgScene({ type: 'noir' }, 1, 600, 5), msgEvenement({ type: 'pop', auteur: 'Zoé', texte: 'trop fort' }, 5),
      msgConfig({ titre: 'LIVE', adresse: 'https://a.test/', consigne: 'Scannez', code: 'K7Q2', secours: 'b.mp4', flux: { serveur: '', projet: 'p_1', jeton: 'sr_x' } }, 5),
      msgHeure(5), msgPrecharger(['a.mp4'], 5),
    ]) expect(lireMessageRegie(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });

  it('refuse ce qui n’a pas la forme attendue (données non sûres)', () => {
    expect(lireMessageRegie(null)).toBeNull();
    expect(lireMessageRegie({ t: 'heure', v: 99, heure: 1 })).toBeNull();
    expect(lireMessageRegie({ t: 'scene', v: VERSION_SORTIE, heure: 1, n: 1, fondu: 0, scene: { type: 'cinema' } })).toBeNull();
    expect(lireMessageRegie({ t: 'scene', v: VERSION_SORTIE, heure: 1, n: 1, fondu: 0, scene: { type: 'video' } })).toBeNull();
    expect(lireMessageRegie({ t: 'evenement', v: VERSION_SORTIE, heure: 1, evenement: { type: 'pop', auteur: 'x', texte: 'y'.repeat(500) } })).toBeNull();
    expect(lireMessageRegie({ t: 'precharger', v: VERSION_SORTIE, heure: 1, assets: Array(20).fill('a.mp4') })).toBeNull();
    expect(lireMessageRegie({ t: 'inconnu', v: VERSION_SORTIE, heure: 1 })).toBeNull();
  });

  it('fondu enchaîné borné à 0 → 2 s', () => {
    expect(borneFondu(5000)).toBe(2000);
    expect(borneFondu(-3)).toBe(0);
    expect(borneFondu('x')).toBe(600);
    const m = lireMessageRegie({ t: 'scene', v: VERSION_SORTIE, heure: 1, n: 2, fondu: 9999, scene: { type: 'video', asset: 'a.mp4', boucle: false, son: true, cadrage: 'contain' } });
    expect(m).toMatchObject({ fondu: 2000, scene: { type: 'video', asset: 'a.mp4', boucle: false, son: true, cadrage: 'contain' } });
  });

  it('scènes : validation de chaque type', () => {
    expect(sceneValide({ type: 'streamer', gabarit: 'folie', secours: 'x.mp4' })).toBe(true);
    expect(sceneValide({ type: 'streamer', gabarit: 'disco' })).toBe(false);
    expect(sceneValide({ type: 'vote', question: 'Q ?', options: [{ cle: 'A', libelle: 'Oui' }], phase: 'revele', gagnant: 'A', resultats: { A: 3 } })).toBe(true);
    expect(sceneValide({ type: 'vote', question: 'Q ?', options: [], phase: 'fini' })).toBe(false);
    expect(sceneValide({ type: 'chrono', duree: 30 })).toBe(true);
    expect(sceneValide({ type: 'image', asset: '' })).toBe(false);
  });

  it('messages de la sortie : bonjour, present, fin-video, au-revoir', () => {
    expect(lireMessageSortie({ t: 'bonjour', v: 1, id: 'sortie_abc', heure: 1 })).not.toBeNull();
    expect(lireMessageSortie({ t: 'present', v: 1, id: 'sortie_abc', heure: 1, scene: 'video', n: 3 })).not.toBeNull();
    expect(lireMessageSortie({ t: 'present', v: 1, id: 'sortie_abc', heure: 1, scene: 'cinema', n: 3 })).toBeNull();
    expect(lireMessageSortie({ t: 'fin-video', v: VERSION_SORTIE, id: 'sortie_abc', heure: 1, asset: 'a.mp4', n: 3 })).not.toBeNull();
    expect(lireMessageSortie({ t: 'au-revoir', v: 1, id: 'sortie_abc' })).not.toBeNull();
    expect(lireMessageSortie({ t: 'bonjour', v: 1, heure: 1 })).toBeNull();
  });

  it('version 2 du protocole (scène « page », refus, recharger)', () => {
    expect(VERSION_SORTIE).toBe(2);
    expect(typeof BUILD_SORTIE).toBe('string');
    expect(BUILD_SORTIE.length).toBeGreaterThan(0);
  });

  it('bonjour et present portent la version et le build ; present porte la scène vue', () => {
    const b = msgBonjour('sortie_abc', 5);
    expect(b).toMatchObject({ t: 'bonjour', v: VERSION_SORTIE, version: VERSION_SORTIE, build: BUILD_SORTIE });
    expect(lireMessageSortie(JSON.parse(JSON.stringify(b)))).toEqual(b);
    const p = msgPresent({ id: 'sortie_abc', vue: { type: 'page', url: 'https://mur.test/salle' }, n: 4, source: 'regie_x1' }, 5);
    expect(p).toMatchObject({ t: 'present', version: VERSION_SORTIE, build: BUILD_SORTIE, scene: 'page', vue: { type: 'page', url: 'https://mur.test/salle' }, n: 4 });
    expect(lireMessageSortie(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(msgPresent({ id: 'sortie_abc', vue: null, n: 0 }, 5)).toMatchObject({ scene: null, vue: null });
    // une vue illisible est retirée, le battement reste lu
    expect(lireMessageSortie({ ...p, vue: { type: 'cinema' } })).not.toHaveProperty('vue');
    // une sortie PÉRIMÉE (v1, sans version ni build) reste lisible : la régie la repère
    expect(lireMessageSortie({ t: 'present', v: 1, id: 'sortie_abc', heure: 1, scene: 'titre', n: 1 })).toMatchObject({ v: 1 });
    // fin-video : version exacte
    expect(lireMessageSortie({ t: 'fin-video', v: 1, id: 'sortie_abc', heure: 1, asset: 'a.mp4', n: 3 })).toBeNull();
  });

  it('une scène de type inconnu produit un refus (plus d’abandon silencieux) et une carte', () => {
    const r = examinerMessageRegie({ t: 'scene', v: VERSION_SORTIE, heure: 1, n: 1, fondu: 0, scene: { type: 'cinema' }, source: 'regie_x1' });
    expect(r).toEqual({ refus: { raison: 'invalide', recu: 'scene:cinema', carte: true, versionRecue: VERSION_SORTIE, source: 'regie_x1', typeScene: 'cinema' } });
    // une régie PLUS RÉCENTE (protocole inconnu) : refus « version » et carte (c'est la sortie qu'il faut recharger)
    expect(examinerMessageRegie({ t: 'scene', v: VERSION_SORTIE + 1, heure: 1, n: 1, fondu: 0, scene: { type: 'hologramme' } }))
      .toMatchObject({ refus: { raison: 'version', recu: `scene:hologramme v${VERSION_SORTIE + 1}`, carte: true } });
    // une régie PLUS ANCIENNE : refus « version », mais la scène en cours reste (pas de carte)
    expect(examinerMessageRegie({ t: 'scene', v: 1, heure: 1, n: 1, fondu: 0, scene: { type: 'noir' } }))
      .toMatchObject({ refus: { raison: 'version', carte: false } });
    // un autre message illisible : refus sans carte
    expect(examinerMessageRegie({ t: 'heure', v: 99, heure: 1 })).toMatchObject({ refus: { raison: 'version', recu: 'heure v99', carte: false } });
    expect(examinerMessageRegie({ t: 'evenement', v: VERSION_SORTIE, heure: 1, evenement: { type: 'laser' } })).toMatchObject({ refus: { raison: 'invalide', carte: false } });
    // texte reçu nettoyé
    expect(examinerMessageRegie({ t: 'scene', v: VERSION_SORTIE, heure: 1, n: 1, fondu: 0, scene: { type: '<img src=x>' } }))
      .toMatchObject({ refus: { typeScene: 'imgsrcx' } });
    // les messages d'une autre sortie et ce qui n'est pas un objet sont ignorés ; un message valide passe
    expect(examinerMessageRegie({ t: 'present', v: 1, id: 'sortie_b', heure: 1, scene: 'noir', n: 0 })).toBeNull();
    expect(examinerMessageRegie({ t: 'refus', v: 2, id: 'sortie_b', heure: 1, raison: 'invalide', version: 2 })).toBeNull();
    expect(examinerMessageRegie('bonjour')).toBeNull();
    expect(examinerMessageRegie(msgHeure(5))).toEqual({ message: msgHeure(5) });
  });

  it('recharger est un message de régie valide, quelle que soit sa version', () => {
    const m = msgRecharger(5);
    expect(m).toEqual({ t: 'recharger', v: VERSION_SORTIE, heure: 5 });
    expect(lireMessageRegie(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(lireMessageRegie({ t: 'recharger', v: 99, heure: 5 })).toEqual({ t: 'recharger', v: 99, heure: 5 });
    expect(lireMessageRegie({ t: 'recharger', v: 99 })).toBeNull();
    expect(examinerMessageRegie(m)).toEqual({ message: m });
  });

  it('refus : lu par la régie', () => {
    const r = { t: 'refus', v: VERSION_SORTIE, id: 'sortie_abc', heure: 1, raison: 'invalide', version: VERSION_SORTIE, recu: 'scene:cinema', versionRecue: VERSION_SORTIE };
    expect(lireMessageSortie(r)).toEqual(r);
    expect(lireMessageSortie({ ...r, raison: 'autre' })).toBeNull();
    expect(lireMessageSortie({ ...r, source: 'a b' })).toBeNull();
  });

  it('scène « page » : clé par adresse, hôte dans la vignette', () => {
    expect(clePage('https://mur.test/salle?x=1')).toBe('page:https://mur.test/salle?x=1');
    expect(hotePage('https://mur.test:8443/salle')).toBe('mur.test:8443');
    expect(hotePage('pas une adresse')).toBe('pas une adresse');
  });

  it('adresse d’entrée du public : code de représentation en ?r=', () => {
    expect(adresseEntree({ adresse: 'https://calculment0r.github.io/STUDIO_REAL/', code: 'K7Q2' })).toBe('https://calculment0r.github.io/STUDIO_REAL/?r=K7Q2');
    expect(adresseEntree({ adresse: 'https://a.test/?x=1', code: ' Z9 ' })).toBe('https://a.test/?x=1&r=Z9');
    expect(adresseEntree({ adresse: 'https://a.test/' })).toBe('https://a.test/');
    expect(adresseLisible('https://a.test/live/')).toBe('a.test/live');
  });

  it('clé de scène stable', () => {
    expect(cleScene({ type: 'video', asset: 'a.mp4' })).toBe(cleScene({ type: 'video', asset: 'a.mp4' }));
    expect(cleScene({ type: 'video', asset: 'a.mp4' })).not.toBe(cleScene({ type: 'video', asset: 'b.mp4' }));
  });
});

describe('horloge et comptes à rebours', () => {
  it('décalage : l’échantillon de plus faible latence', () => {
    const h = new Horloge();
    h.noter(1000, 1050);   // latence 50 ms, décalage vrai 0
    h.noter(2000, 2005);   // latence 5 ms
    h.noter(3000, 3200);
    expect(h.decalage).toBe(-5);
    expect(h.maintenant(10_000)).toBe(9995);
  });

  it('compteur extrapolé selon la vitesse, figé à l’arrêt', () => {
    const c = { restant: 20, duree: 30, enCours: true, vitesse: 2 };
    expect(restantCompteur(c, 1000, 4000)).toBe(14);
    expect(restantCompteur({ ...c, enCours: false }, 1000, 4000)).toBe(20);
    expect(restantCompteur(c, 1000, 100_000)).toBe(0);
    expect(mmssRebours(9.2)).toBe('00:10');
    expect(mmssRebours(0.0000001)).toBe('00:00');
    expect(mmssRebours(125)).toBe('02:05');
  });
});

describe('outils de la sortie', () => {
  it('médias : recherche par nom exact, casse, sans extension', () => {
    expect(clesNom('Starting_Soon.MP4')).toEqual(['Starting_Soon.MP4', 'starting_soon.mp4', 'starting_soon']);
  });
  it('cadrage automatique : la vidéo de test 1312 × 512 est montrée entière', () => {
    expect(cadrageAuto(1312, 512)).toBe('contain');
    expect(cadrageAuto(1920, 1080)).toBe('cover');
    expect(cadrageAuto(1440, 1080)).toBe('contain');
  });
  it('vote : pourcentages arrondis', () => {
    expect(pourcentages([{ cle: 'A' }, { cle: 'B' }, { cle: 'C' }], { A: 52, B: 30, C: 18 })).toEqual([52, 30, 18]);
    expect(pourcentages([{ cle: 'A' }, { cle: 'B' }], undefined)).toEqual([0, 0]);
  });
  it('QR : un tracé carré de modules sombres', () => {
    const q = traceQr('https://calculment0r.github.io/STUDIO_REAL/?r=K7Q2');
    expect(q.taille).toBeGreaterThanOrEqual(21);
    expect(q.d.startsWith('M0 0h7')).toBe(true);   // motif de repérage en haut à gauche
  });
});
