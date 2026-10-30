// Client régie du serveur de spectacle (etat/spectacle.ts), sur une paire de canaux en mémoire (transportMemoire de
// l'application téléphone) : le test joue le serveur. Projet ÉCHO embarqué, horloge simulée.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { creerLecteur, type Projet } from '@studio-real/modele';
import type { MessageClient } from '@studio-real/protocole';
import { transportMemoire, type CoteServeurMemoire } from '@studio-real/ui-telephone';
import echo from '../../../../projets/echo/echo.conducteur.json';
import { DELAI_ANTI_DOUBLE_GO_MS, avancerDe, useMagasin } from './magasin';
import { etatActeurs, oublierActeurs, resumeSalle } from './acteurs';
import { lienDeLActeur } from '../coquille/rail-etat';
import {
  ACCUSE_ROUGE_MS, adresseWebSocket, baseTelephone, jetonDeLActeur, jetonPublicSpectacle, lienActeur, lienPublic, lireFragmentRegie,
  lireJetonsColles, lireReglages, reglerSpectacle,
  reinitialiserSpectacle, relierSpectacle, surveiller, useSpectacle, voyantSpectacle,
} from './spectacle';

const s = () => useMagasin.getState();
const sp = () => useSpectacle.getState();
const projet = (echo as unknown as { project: Projet }).project;
const ids = projet.ev.map(m => m.id);
const JETON = 'jeton-regie-de-test-' + Math.random().toString(36).slice(2);

let serveur: CoteServeurMemoire;
let recus: MessageClient[];
let urlDemandee: string;
let jetonDemande: string;

/** Relie la régie à un « serveur » en mémoire, ligne ouverte, `bienvenue` envoyé. */
function relier(o: { cseq?: number; ouvrir?: boolean } = {}) {
  reglerSpectacle({ adresse: 'https://spectacle.exemple', jetonRegie: JETON });
  relierSpectacle({
    config: false,
    creerTransport: (url, jeton, hello) => {
      urlDemandee = url; jetonDemande = jeton;
      const p = transportMemoire({ hello, jeton });
      serveur = p.serveur;
      recus = [];
      serveur.surMessage(m => recus.push(m));
      return p.telephone;
    },
  });
  if (o.ouvrir === false) return;
  serveur.ouvrir();
  const hello = recus.find(m => m.t === 'hello');
  if (!hello || hello.t !== 'hello') throw new Error('hello attendu');
  serveur.envoyer({ t: 'bienvenue', v: 2, role: 'regie', session: hello.session, ts: Date.now(), vue: null, cseq: o.cseq ?? 0, lecture: null });
}
const conduites = () => recus.filter((m): m is Extract<MessageClient, { t: 'conduite' }> => m.t === 'conduite');
const apresAntiRebond = () => vi.advanceTimersByTime(DELAI_ANTI_DOUBLE_GO_MS + 200);

function ouvrirEchoEnSpectacle() {
  if (s().mode !== 'repetition') s().changerMode('repetition');
  s().importer(JSON.stringify(echo));
  s().revenirAuDebut();
  s().changerMode('spectacle');
  apresAntiRebond();
}

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T20:00:00Z')); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => { reinitialiserSpectacle(); oublierActeurs(); ouvrirEchoEnSpectacle(); });
afterEach(() => reinitialiserSpectacle());

describe('adresses et liens', () => {
  it('adresse WebSocket, base de l’application téléphone, lien d’acteur (jeton dans le fragment), lien du public', () => {
    expect(adresseWebSocket('https://spectacle.exemple')).toBe('wss://spectacle.exemple/ws');
    expect(adresseWebSocket('http://127.0.0.1:8790')).toBe('ws://127.0.0.1:8790/ws');
    expect(adresseWebSocket('wss://x.exemple/autre')).toBe('wss://x.exemple/autre');
    expect(adresseWebSocket('ftp://x')).toBeNull();
    expect(baseTelephone('https://spectacle.exemple')).toBe('https://spectacle.exemple/t/');
    expect(baseTelephone('https://spectacle.exemple/t/')).toBe('https://spectacle.exemple/t/');
    const l = lienActeur('https://spectacle.exemple', 'franck', 'sr_acteur_a+b/c');
    expect(l).toBe('https://spectacle.exemple/t/#acteur=franck&jeton=sr_acteur_a%2Bb%2Fc');
    expect(l).not.toContain('?');
    expect(lienPublic('https://spectacle.exemple/')).toBe('https://spectacle.exemple/t/');
    expect(lienPublic('https://spectacle.exemple/', 'sr_public_a+b')).toBe('https://spectacle.exemple/t/#jeton=sr_public_a%2Bb');
    expect(lienPublic('')).toBeNull();
  });

  it('un jeton par acteur : chaque lien porte le jeton de SON acteur, le public celui du public, jamais l’un pour l’autre', () => {
    const secrets = { jetons: {
      regie: 'sr_regie_secret-0123456789', agent: 'sr_agent_secret-0123456789', public: 'sr_public_foule-0123456789',
      acteurs: { ministre: 'sr_acteur_ministre-0123456789', franck: 'sr_acteur_franck-0123456789' },
    } };
    const lu = lireJetonsColles(JSON.stringify(secrets));
    expect(lu).toEqual({ jetons: { public: secrets.jetons.public, acteurs: secrets.jetons.acteurs } });   // ni régie ni agent retenus
    expect(lireJetonsColles(JSON.stringify(secrets.jetons))).toEqual(lu);                                  // l'objet « jetons » seul
    reglerSpectacle({ adresse: 'https://spectacle.exemple', adressePublique: 'https://spectacle.exemple', jetonsActeurs: (lu as { jetons: never }).jetons });
    expect(lireReglages().jetonsActeurs).toBe(true);
    expect(jetonPublicSpectacle()).toBe('sr_public_foule-0123456789');
    expect(jetonDeLActeur('franck')).toBe('sr_acteur_franck-0123456789');
    expect(jetonDeLActeur('scene')).toBeNull();                                                              // pas de repli sur le jeton public
    const ministre = lienDeLActeur({ id: 'ministre', cardinalite: 1, type: 'telephone' });
    const franck = lienDeLActeur({ id: 'franck', cardinalite: 1, type: 'comedien' });
    const foule = lienDeLActeur({ id: 'public', cardinalite: 'n', type: 'public' });
    expect(ministre).toBe('https://spectacle.exemple/t/#acteur=ministre&jeton=sr_acteur_ministre-0123456789');
    expect(franck).toBe('https://spectacle.exemple/t/#acteur=franck&jeton=sr_acteur_franck-0123456789');
    expect(foule).toBe('https://spectacle.exemple/t/#jeton=sr_public_foule-0123456789');
    expect(lienDeLActeur({ id: 'scene', cardinalite: 1, type: 'ecran' })).toBeNull();
    expect(lienDeLActeur({ id: 'figurants', cardinalite: 1, type: 'agent' })).toBeNull();
    expect(lienDeLActeur({ id: 'inconnu', cardinalite: 1, type: 'telephone' })).toBeNull();                 // pas de jeton connu : pas de lien
    for (const l of [ministre, franck, foule]) { expect(l).not.toContain('secret'); expect(l).not.toContain('?'); }
    expect(ministre).not.toContain('franck-');
    expect(foule).not.toContain('acteur=');
  });

  it('JSON des jetons collé : refus clairs, sans citer le texte collé', () => {
    for (const mauvais of ['', 'pas du json', '[]', '{}', '{"jetons":{"acteurs":[]}}', '{"public":"avec espace"}', '{"acteurs":{"x y":"jeton-ok-0123456789"}}', '{"acteurs":{"franck":"court court"}}']) {
      const r = lireJetonsColles(mauvais);
      expect(r, mauvais).toHaveProperty('erreur');
    }
    const r = lireJetonsColles('{"public":"sr_public_secretissime-0123456789","acteurs":{"x y":"jeton"}}');
    expect(JSON.stringify(r)).not.toContain('secretissime');
    expect(lireJetonsColles('{"public":"sr_public_seul-0123456789"}')).toEqual({ jetons: { public: 'sr_public_seul-0123456789', acteurs: {} } });
  });

  it('les jetons restent dans l’onglet : les réglages disent seulement s’ils sont connus', () => {
    reglerSpectacle({ adresse: 'https://spectacle.exemple', jetonRegie: JETON, jetonsActeurs: { public: 'public-xyz', acteurs: { franck: 'acteur-xyz' } } });
    const r = lireReglages();
    expect(r).toEqual({ adresse: 'https://spectacle.exemple', adressePublique: '', jetonRegie: true, jetonsActeurs: true });
    expect(JSON.stringify(sp())).not.toContain(JETON);
  });
});

describe('liaison : hello / bienvenue, voyant', () => {
  it('hello{role:regie} avec le jeton, puis bienvenue : relié (vert) ; sans nouvelles depuis 5 s : périmé (rouge fixe)', () => {
    relier({ ouvrir: false });
    expect(sp().ligne).toBe('connexion');
    serveur.ouvrir();
    const hello = recus[0]!;
    expect(hello).toMatchObject({ t: 'hello', v: 2, role: 'regie', jeton: JETON });
    expect(urlDemandee).toBe('wss://spectacle.exemple/ws');
    expect(jetonDemande).toBe(JETON);
    if (hello.t !== 'hello') throw new Error();
    serveur.envoyer({ t: 'bienvenue', v: 2, role: 'regie', session: hello.session, ts: Date.now(), vue: null, cseq: 0 });
    expect(sp().ligne).toBe('ouverte');
    surveiller();
    expect(sp().voyant).toMatchObject({ pastille: 'verte', libelle: 'RELIÉ' });
    vi.advanceTimersByTime(5200);
    surveiller();
    expect(sp().voyant).toMatchObject({ pastille: 'rouge', libelle: 'PÉRIMÉ' });
    expect(sp().alertes.map(a => a.code)).toContain('muet');
  });

  it('pas de réglage : rien n’est tenté, voyant éteint', () => {
    expect(relierSpectacle()).toBe(false);
    expect(sp().voyant.pastille).toBe('eteinte');
  });

  it('coupure : absent (rouge) ; les ordres ne sont pas mis en file pendant la coupure', () => {
    relier();
    serveur.couper();
    expect(sp().ligne).toBe('absente');
    expect(voyantSpectacle(sp(), Date.now())).toMatchObject({ pastille: 'rouge', libelle: 'ABSENT' });
    s().go();
    serveur.ouvrir();
    expect(conduites()).toHaveLength(0);
  });
});

describe('GO → conduite, accusés', () => {
  it('chaque GO en SPECTACLE part en conduite{op:top} (un par top joué localement), accusé par le serveur', () => {
    relier();
    s().go();                               // le spectacle commence : aucun top, la lecture repart
    expect(conduites().map(c => c.op)).toEqual(['pause']);
    expect(conduites()[0]).toMatchObject({ pause: false });
    apresAntiRebond();
    avancerDe(3);
    s().go();                               // fin de l'étape + passage « go » : deux tops
    const tops = conduites().filter(c => c.op === 'top');
    expect(tops).toHaveLength(2);
    expect(tops[1]!.cseq).toBe(tops[0]!.cseq + 1);
    expect(sp().enAttente.map(o => o.op)).toEqual(['pause', 'top', 'top']);
    surveiller();
    expect(sp().voyant).toMatchObject({ pastille: 'ambre', libelle: 'GO…' });
    for (const c of conduites()) serveur.envoyer({ t: 'ack', cseq: c.cseq, statut: 'ok' });
    expect(sp().enAttente).toHaveLength(0);
    expect(sp().dernierAccuse).toMatchObject({ op: 'top', statut: 'ok' });
    surveiller();
    expect(sp().voyant.pastille).toBe('verte');
  });

  it('GO non accusé : ambre, puis rouge à 5 s (le serveur reste vivant)', () => {
    relier();
    s().go();
    apresAntiRebond();
    for (const c of conduites()) serveur.envoyer({ t: 'ack', cseq: c.cseq, statut: 'ok' });
    s().go();
    surveiller();
    expect(sp().voyant).toMatchObject({ pastille: 'ambre', libelle: 'GO…' });
    vi.advanceTimersByTime(4000);
    serveur.envoyer({ t: 'salle', ts: Date.now(), acteurs: {} });   // le serveur parle : pas « muet »
    surveiller();
    expect(sp().voyant.pastille).toBe('ambre');
    vi.advanceTimersByTime(ACCUSE_ROUGE_MS - 4000 + 200);
    surveiller();
    expect(sp().voyant).toMatchObject({ pastille: 'rouge', libelle: 'GO NON ACCUSÉ' });
    expect(sp().alertes.map(a => a.code)).toContain('go');
  });

  it('en RÉPÉTITION, rien ne part ; ordre refusé par le serveur : message et refus gardé', () => {
    relier();
    s().changerMode('repetition');
    s().go();
    expect(conduites()).toHaveLength(0);
    s().changerMode('spectacle');
    s().poserMemoire('missions', 3);
    const c = conduites()[conduites().length - 1]!;
    expect(c).toMatchObject({ op: 'poser', nom: 'missions', valeur: 3 });
    serveur.envoyer({ t: 'ack', cseq: c.cseq, statut: 'refus', raison: 'aucune-representation : lancer d’abord' });
    expect(sp().refus).toMatchObject({ code: 'conduite' });
    expect(s().message).toMatch(/refusé/);
  });

  it('bienvenue après une coupure : les ordres non reçus ne sont pas renvoyés, la régie est prévenue', () => {
    relier();
    s().go();
    const n = conduites().length;
    serveur.couper();
    serveur.ouvrir();
    const hellos = recus.filter(m => m.t === 'hello');
    const hello = hellos[hellos.length - 1]!;
    if (hello.t !== 'hello') throw new Error();
    serveur.envoyer({ t: 'bienvenue', v: 2, role: 'regie', session: hello.session, ts: Date.now(), vue: null, cseq: 0 });
    expect(conduites()).toHaveLength(n);
    expect(sp().enAttente).toHaveLength(0);
    expect(s().message).toMatch(/non reçu/);
  });
});

describe('lecture miroir', () => {
  it('chaque lecture{etat} recale le magasin : même moment, même étape, même horloge', () => {
    relier();
    const L = creerLecteur(projet, { mode: 'scene' });
    L.allerA(ids[3]!);
    L.avancer(2, { pres: 0, quorum: 0, prets: 0, bruit: 32, assis: 100 });
    const etat = L.etat();
    serveur.envoyer({ t: 'lecture', etat, par: 'serveur', ts: Date.now() });
    expect(s().miroir).toBe(true);
    expect(s().lecture).toMatchObject({ moment: ids[3], etape: etat.etape, t: etat.t });
    // le lecteur local continue d'animer à partir de là
    s().lancer();
    avancerDe(1);
    expect(s().lecture!.moment).toBe(ids[3]);
    expect(s().lecture!.t).toBeCloseTo(etat.t + 1, 5);
  });

  it('en RÉPÉTITION la lecture reçue ne touche pas le magasin', () => {
    relier();
    s().changerMode('repetition');
    const L = creerLecteur(projet, { mode: 'scene' });
    L.allerA(ids[5]!);
    serveur.envoyer({ t: 'lecture', etat: L.etat(), par: 'serveur', ts: Date.now() });
    expect(s().lecture!.moment).toBe(ids[0]);
    expect(s().miroir).toBe(false);
  });
});

describe('lecture allégée : deltas et trou de seq', () => {
  const sig = { pres: 0, quorum: 0, prets: 0, bruit: 32, assis: 100 };
  const base = () => {
    const L = creerLecteur(projet, { mode: 'scene' });
    L.allerA(ids[3]!);
    L.avancer(2, sig);
    return L.etat();
  };
  const complet = (etat: ReturnType<typeof base>, seq: number) => serveur.envoyer({ t: 'lecture', mode: 'complet', etat, par: 'serveur', ts: Date.now(), seq });
  const delta = (seq: number, d: Record<string, unknown>) =>
    serveur.envoyer({ t: 'lecture', mode: 'delta', seq, par: 'serveur', ts: Date.now(), d } as never);
  const resyncs = () => recus.filter(m => m.t === 'resync');

  it('un delta se fusionne dans l’état reçu : temps, mémoires fusionnées, journal concaténé', () => {
    relier();
    const etat = base();
    complet(etat, 1);
    expect(s().lecture).toMatchObject({ moment: ids[3], t: etat.t });
    delta(2, { t: etat.t + 1, tEtape: etat.tEtape + 1 });
    expect(s().lecture).toMatchObject({ moment: ids[3], etape: etat.etape, t: etat.t + 1, tEtape: etat.tEtape + 1 });
    delta(3, { t: etat.t + 2, tEtape: etat.tEtape + 2, memoires: { missions: 3 }, journal: [{ t: etat.t + 2, type: 'memoire', nom: 'missions', valeur: 3, moment: ids[3] }] });
    expect(s().lecture!.memoires).toMatchObject({ ...etat.memoires, missions: 3 });
    expect(s().lecture!.journal).toHaveLength((etat.journal?.length ?? 0) + 1);
    delta(4, { t: etat.t + 3, tEtape: etat.tEtape + 3, memoires: { missions: 4 } });
    expect(s().lecture!.memoires).toMatchObject({ missions: 4 });
    expect(s().lecture!.journal).toHaveLength((etat.journal?.length ?? 0) + 1);
    expect(resyncs()).toHaveLength(0);
    expect(sp().lectureRecue).toBeGreaterThan(0);
  });

  it('trou de seq : le delta est ignoré, la régie demande un resync (un seul), et reprend au complet suivant', () => {
    relier();
    const etat = base();
    complet(etat, 1);
    delta(2, { t: etat.t + 1, tEtape: etat.tEtape + 1 });
    delta(4, { t: etat.t + 3, tEtape: etat.tEtape + 3 });          // le 3 s'est perdu
    expect(resyncs()).toHaveLength(1);
    expect(s().lecture!.t).toBe(etat.t + 1);                         // l’état n’a pas bougé
    delta(5, { t: etat.t + 4, tEtape: etat.tEtape + 4 });
    expect(resyncs()).toHaveLength(1);                               // pas de rafale tant que le complet n’est pas là
    complet({ ...etat, t: etat.t + 5, tEtape: etat.tEtape + 5 }, 6);
    expect(s().lecture!.t).toBe(etat.t + 5);
    delta(7, { t: etat.t + 6, tEtape: etat.tEtape + 6 });
    expect(s().lecture!.t).toBe(etat.t + 6);
    expect(resyncs()).toHaveLength(1);
    // un nouveau trou, plus tard : nouvelle demande
    vi.advanceTimersByTime(3000);
    delta(10, { t: etat.t + 9, tEtape: etat.tEtape + 9 });
    expect(resyncs()).toHaveLength(2);
  });

  it('un delta sans état de base (rien reçu encore) demande aussi un resync', () => {
    relier();
    delta(1, { t: 5, tEtape: 5 });
    expect(resyncs()).toHaveLength(1);
    expect(s().miroir).toBe(false);
  });

  it('une nouvelle liaison oublie l’état de base : un delta d’avant la coupure est refusé', () => {
    relier();
    const etat = base();
    complet(etat, 1);
    relierSpectacle({ config: false, creerTransport: (_u, j, hello) => { const p = transportMemoire({ hello, jeton: j }); serveur = p.serveur; recus = []; serveur.surMessage(m => recus.push(m)); return p.telephone; } });
    serveur.ouvrir();
    delta(2, { t: etat.t + 1, tEtape: etat.tEtape + 1 });
    expect(resyncs()).toHaveLength(1);
  });

  it('miroir : un delta rafraîchit la lecture sans replacer le lecteur local tant que moment, étape et attente ne changent pas', () => {
    relier();
    const etat = base();
    complet(etat, 1);
    expect(s().miroir).toBe(true);
    s().lancer();
    avancerDe(1);
    const apres = s().lecture!;
    delta(2, { t: etat.t + 1, tEtape: etat.tEtape + 1 });
    expect(s().miroir).toBe(true);
    expect(s().lecture).toMatchObject({ moment: ids[3], etape: etat.etape, t: etat.t + 1 });
    avancerDe(0.5);
    // le lecteur local a continué sa route (horloge recalée sur le serveur, jamais d'allerA)
    expect(s().lecture!.t).toBeCloseTo(etat.t + 1.5, 5);
    expect(s().lecture!.moment).toBe(apres.moment);
  });

  it('miroir : la position du serveur n’a pas changé → le lecteur local, même en avance, n’est pas replacé', () => {
    relier();
    const etat = base();
    complet(etat, 1);
    s().lancer();
    avancerDe(60);                                   // le lecteur local file bien au-delà de l’étape du serveur
    const enAvance = s().lecture!;
    expect(enAvance.moment !== etat.moment || enAvance.etape !== etat.etape).toBe(true);
    delta(2, { t: etat.t + 1, tEtape: etat.tEtape + 1 });
    avancerDe(0.01);
    expect(s().lecture).toMatchObject({ moment: enAvance.moment, etape: enAvance.etape });
    // un complet à la même position (rafraîchissement de la minute) ne replace pas non plus
    complet({ ...etat, t: etat.t + 2, tEtape: etat.tEtape + 2 }, 3);
    avancerDe(0.01);
    expect(s().lecture).toMatchObject({ moment: enAvance.moment, etape: enAvance.etape });
    // dès que le serveur change d’étape, le lecteur local le suit
    delta(4, { t: etat.t + 3, tEtape: 0, moment: ids[5], etape: null, phase: 'passage' });
    avancerDe(0.01);
    expect(s().lecture!.moment).toBe(ids[5]);
  });

  it('miroir : un delta qui change d’étape ou de moment replace le lecteur local', () => {
    relier();
    const etat = base();
    complet(etat, 1);
    s().lancer();
    delta(2, { t: etat.t + 1, tEtape: 0, moment: ids[5], etape: null, phase: 'passage' });
    expect(s().lecture).toMatchObject({ moment: ids[5] });
    avancerDe(0.1);
    expect(s().lecture!.moment).toBe(ids[5]);
  });
});

describe('retours des acteurs', () => {
  it('etat d’un acteur → etat/acteurs.ts ; salle → résumé', () => {
    relier();
    serveur.envoyer({ t: 'etat', acteur: 'scene', ts: Date.now(), heure: Date.now(), ecran: { vseq: 3, ecran: 'mur', depuis: Date.now() }, visible: true, rttMs: 38 });
    expect(etatActeurs().scene).toMatchObject({ source: 'serveur', ecran: { ecran: 'mur' }, rttMs: 38 });
    serveur.envoyer({ t: 'salle', ts: Date.now(), acteurs: { public: { presents: 3, prets: 1, enLigne: 3, parEcran: { vote: 3 }, demande: { vseq: 2, ecran: 'vote', at: 1 } } }, vote: { q: '1', recus: 2, parts: [1, 1] } });
    expect(resumeSalle().resumes.public).toMatchObject({ presents: 3, parEcran: { vote: 3 } });
    expect(resumeSalle().vote).toMatchObject({ recus: 2 });
  });

  it('refus du jeton : pastille rouge « jeton refusé », plus de reconnexion, alerte', () => {
    relier({ ouvrir: false });
    serveur.ouvrir();
    serveur.envoyer({ t: 'refus', code: 'jeton', message: 'Jeton refusé.', fatal: true });
    expect(sp().ligne).toBe('jeton-refuse');
    surveiller();
    expect(sp().voyant).toMatchObject({ pastille: 'rouge', libelle: 'JETON REFUSÉ' });
    expect(sp().alertes.map(a => a.code)).toContain('jeton');
    s().go();
    expect(conduites()).toHaveLength(0);
  });
});

describe('fragment d’adresse du script de lancement', () => {
  it('lit #spectacle=…&jeton=… (forme posée par lancer-spectacle.ps1)', () => {
    expect(lireFragmentRegie('#spectacle=ws://localhost:8790/ws&jeton=sr_regie_abc')).toEqual({ adresse: 'ws://localhost:8790/ws', jetonRegie: 'sr_regie_abc' });
    expect(lireFragmentRegie('spectacle=wss://spectacle.exemple/ws&jeton=j')).toEqual({ adresse: 'wss://spectacle.exemple/ws', jetonRegie: 'j' });
  });
  it('refuse un fragment incomplet ou une adresse illisible', () => {
    expect(lireFragmentRegie('')).toBeNull();
    expect(lireFragmentRegie('#jeton=j')).toBeNull();
    expect(lireFragmentRegie('#spectacle=ws://localhost:8790/ws')).toBeNull();
    expect(lireFragmentRegie('#spectacle=pas-une-adresse&jeton=j')).toBeNull();
    expect(lireFragmentRegie('#acteur=scene&jeton=j')).toBeNull();
  });
});

describe('barre de scène · RETENIR, +30 s, PANIQUE relayés en ordres de conduite', () => {
  it('en SPECTACLE relié : retenir part en {op:retenir}, jamais en mémoire « retenir »', () => {
    relier();
    s().retenir(true);
    s().retenir();                           // bascule : relâche
    const ops = conduites().filter(c => c.op === 'retenir');
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ op: 'retenir', actif: true });
    expect(ops[1]).toMatchObject({ op: 'retenir', actif: false });
    expect(conduites().some(c => c.op === 'poser' && (c as { nom?: string }).nom === 'retenir')).toBe(false);
  });

  it('+30 s part en {op:prolonger, secondes}, panique en {op:panique, actif}', () => {
    relier();
    s().go();
    apresAntiRebond();
    avancerDe(2);
    s().prolonger(30);
    expect(conduites().find(c => c.op === 'prolonger')).toMatchObject({ op: 'prolonger', secondes: 30 });
    s().panique(true);
    s().panique(false);
    const p = conduites().filter(c => c.op === 'panique');
    expect(p.map(c => (c as { actif?: boolean }).actif)).toEqual([true, false]);
  });

  it('les gestes sont acquittés comme les autres ordres', () => {
    relier();
    s().go();
    apresAntiRebond();
    s().retenir(true);
    const c = conduites().find(x => x.op === 'retenir')!;
    expect(sp().enAttente.some(o => o.cseq === c.cseq && o.op === 'retenir')).toBe(true);
    serveur.envoyer({ t: 'ack', cseq: c.cseq, statut: 'ok' });
    expect(sp().enAttente.some(o => o.cseq === c.cseq)).toBe(false);
  });

  it('en RÉPÉTITION, rien ne part (le lecteur local agit seul)', () => {
    relier();
    s().changerMode('repetition');
    const avant = conduites().length;
    s().retenir(true);
    s().prolonger(30);
    s().panique(true);
    s().panique(false);
    expect(conduites()).toHaveLength(avant);
    expect(s().lecture?.retenu).toBe(true);
  });

  it('lecture miroir : la retenue et la prolongation du serveur calent le lecteur local', () => {
    relier();
    const L = creerLecteur(projet, { mode: 'scene' });
    L.allerA(ids[2]!);
    L.avancer(2, { pres: 0, quorum: 0, prets: 0, bruit: 32, assis: 100 });
    L.retenir(true);
    L.prolonger(30);
    serveur.envoyer({ t: 'lecture', etat: L.etat(), par: 'serveur', ts: Date.now() });
    expect(s().lecture).toMatchObject({ moment: ids[2], retenu: true, prolonge: 30 });
    s().lancer();
    avancerDe(40);                           // le lecteur local ne laisse pas filer l’étape tenue
    expect(s().lecture).toMatchObject({ moment: ids[2], retenu: true });
    expect(s().lecture!.etape).not.toBeNull();
    // le serveur relâche : le lecteur local suit
    L.retenir(false);
    serveur.envoyer({ t: 'lecture', etat: L.etat(), par: 'serveur', ts: Date.now() });
    expect(s().lecture!.retenu).toBe(false);
  });
});
