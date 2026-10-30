// L'émulateur sous Node, sans DOM : la salle émulée (vrai noyau du serveur) et ses téléphones émulés (vraie machine
// d'état du téléphone), sur le projet Écho converti (commandesVersEnvois + acteursEcho()) et sur un petit banc.
// Temps émulé : 1 h de spectacle se joue en quelques centaines de millisecondes.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chargerFichier, votesSalle, type Projet } from '@studio-real/modele';
import { transportMemoire } from '@studio-real/ui-telephone';
import { T0, projetBanc } from './banc-test';
import { creerEmulateur, type EmulateurSalle } from './emulateur';
import { Ordonnanceur } from './horloge';
import { MELANGES, PROFILS, facteurReaction, instantArrivee, population, tempsPresence, tempsQuorum } from './profils';
import { SalleEmulee } from './salle';
import { lireJournal } from './rejouer';
import { mulberry32, repartir } from './alea';
import { indexReponse } from './agent';
import type { EvenementSalle, OptionsEmulateur } from './types';

const chemin = fileURLToPath(new URL('../../../projets/echo/echo.conducteur.json', import.meta.url));
const echo = (): Projet => chargerFichier(readFileSync(chemin, 'utf8')).project;

async function soiree(o: Partial<OptionsEmulateur> = {}): Promise<EmulateurSalle> {
  const emu = creerEmulateur({ projet: echo(), graine: 2026, population: { nombre: 120, melange: 'soiree' }, arrivees: { surS: 20 }, horloge: { debut: T0 }, ...o });
  await emu.demarrer();
  return emu;
}

/** GO par GO (comme la régie d'Écho : chaque étape dure 10 s, puis le passage attend le top) jusqu'au moment voulu. */
async function jusqua(emu: EmulateurSalle, moment: string) {
  for (let i = 0; i < 40 && emu.bilan().lecture?.moment !== moment; i++) {
    await emu.avancer(11_000);
    emu.go();
  }
  expect(emu.bilan().lecture?.moment).toBe(moment);
}

/** Téléphones du public arrivés et en ligne. Sauf mention, les 120 arrivent dans les 20 premières secondes (le test
 *  des arrivées suit la vraie courbe pres : 10 min de salle, 3 s de calcul). */
const presents = (emu: EmulateurSalle) => emu.telephonesSalle().filter(t => t.acteur === 'public' && t.etat().enLigne);

describe('outils : hasard rejouable, horloge émulée', () => {
  it('mulberry32 : même graine, même suite, dans [0, 1)', () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const la = Array.from({ length: 50 }, a), lb = Array.from({ length: 50 }, b);
    expect(la).toEqual(lb);
    expect(la).not.toEqual(Array.from({ length: 50 }, c));
    expect(la.every(x => x >= 0 && x < 1)).toBe(true);
  });

  it('repartir : la somme vaut exactement n (plus forts restes)', () => {
    expect(repartir(120, MELANGES.soiree as Record<string, number>)).toEqual({ rapide: 42, 'iphone-muet': 30, lent: 14, '4g-salle-pleine': 16, distrait: 12, deconnecte: 6 });
    const r = repartir(7, { a: 1, b: 1, c: 1 });
    expect(r.a + r.b + r.c).toBe(7);
  });

  it('l’ordonnanceur exécute dans l’ordre (heure, puis ordre de planification), annule, et saute d’un rendez-vous à l’autre', () => {
    const h = new Ordonnanceur(1000);
    const vu: string[] = [];
    h.planifier(500, () => vu.push('b'));
    h.planifier(100, () => { vu.push('a'); h.planifier(0, () => vu.push('a2')); });
    const annuler = h.planifier(300, () => vu.push('x'));
    h.planifier(500, () => vu.push('c'));
    annuler();
    expect(h.avancer(400)).toBe(2);
    expect(vu).toEqual(['a', 'a2']);
    expect(h.maintenant()).toBe(1400);
    h.avancer(1000);
    expect(vu).toEqual(['a', 'a2', 'b', 'c']);
    expect(h.maintenant()).toBe(2400);
  });
});

describe('profils et rotatifs (salle.ts)', () => {
  it('les six profils du rapport 2 §4.4', () => {
    expect(Object.keys(PROFILS)).toEqual(['rapide', 'lent', 'distrait', 'deconnecte', 'iphone-muet', '4g-salle-pleine']);
    expect(PROFILS.rapide).toMatchObject({ reaction: { medianeS: 1.5 }, participation: 0.95, reseau: { rttMs: 40 } });
    expect(PROFILS.lent).toMatchObject({ reaction: { medianeS: 8 }, participation: 0.8, reseau: { rttMs: 300, debitKbps: 2000 } });
    expect(PROFILS.distrait).toMatchObject({ reaction: { medianeS: 20 }, participation: 0.4, visibilite: 0.7 });
    expect(PROFILS.deconnecte.coupures).toEqual({ parMinute: 1 / 3, dureeS: [5, 60] });
    expect(PROFILS['iphone-muet'].capacites).toMatchObject({ plateforme: 'ios', vibration: false, sonSansGeste: false, pleinEcran: false });
    expect(PROFILS['4g-salle-pleine'].reseau).toEqual({ rttMs: 600, debitKbps: 1500, perte: 0.03 });
  });

  it('population « soirée » de 120 : la somme fait 120, tous les profils sont là', () => {
    const p = population(120, 'soiree');
    expect(p.reduce((t, x) => t + x.nombre, 0)).toBe(120);
    expect(p.map(x => x.profil.nom).sort()).toEqual(['4g-salle-pleine', 'deconnecte', 'distrait', 'iphone-muet', 'lent', 'rapide']);
    expect(() => population(10, 'inconnu')).toThrow(/Mélange inconnu/);
  });

  it('les constantes de temps sont celles de salle.ts : T(pres) = 40 + (100 − aff)·2,2 ; T(quorum) = 20 + (100 − part)·1,2', () => {
    const sens = { aff: 70, part: 60, calme: 55, pen: 60 };
    expect(tempsPresence(sens)).toBeCloseTo(40 + 30 * 2.2, 6);
    expect(tempsQuorum(sens)).toBeCloseTo(20 + 40 * 1.2, 6);
    expect(facteurReaction({ ...sens, part: 50 })).toBeCloseTo(1, 6);
    expect(facteurReaction({ ...sens, part: 90 })).toBeLessThan(1);
  });

  it('arrivées « salle » : loi exponentielle de moyenne T(pres), plafonnée à 5 T ; « toutes » : dans les 2 premières secondes', () => {
    const sens = { aff: 70, part: 60, calme: 55, pen: 60 };
    const rnd = mulberry32(9);
    const l = Array.from({ length: 2000 }, () => instantArrivee(rnd, sens, 'salle'));
    const moyenne = l.reduce((a, b) => a + b, 0) / l.length / 1000;
    expect(moyenne).toBeGreaterThan(tempsPresence(sens) * 0.9);
    expect(moyenne).toBeLessThan(tempsPresence(sens) * 1.1);
    expect(Math.max(...l)).toBeLessThanOrEqual(5 * tempsPresence(sens) * 1000);
    expect(Array.from({ length: 50 }, () => instantArrivee(rnd, sens, 'toutes')).every(x => x >= 0 && x <= 2000)).toBe(true);
  });

  it('indexReponse : 0, « 2 », « A », « c »', () => {
    expect([indexReponse(0), indexReponse('2'), indexReponse('A'), indexReponse('c'), indexReponse('??')]).toEqual([0, 2, 0, 2, -1]);
  });
});

describe('salle émulée : le noyau du serveur en mémoire', () => {
  function banc() {
    const h = new Ordonnanceur(T0);
    const salle = new SalleEmulee({ projet: projetBanc(), horloge: h, graine: 1 });
    salle.lancer('repetition', 42);
    return { h, salle };
  }
  function telephone(salle: SalleEmulee, n: number) {
    const hello = () => ({ t: 'hello' as const, v: 2, role: 'acteur' as const, acteur: 'public', personne: `tel_00${n}`, session: `pub_s${n}x`, cseq: 0, vseq: 0 });
    const p = transportMemoire({ hello });
    const recus: { t: string; ecran?: string | null }[] = [];
    p.telephone.surMessage(m => recus.push(m as { t: string }));
    salle.brancher(`t${n}`, p.serveur);
    p.serveur.ouvrir();
    return { p, recus };
  }

  it('un téléphone branché par transportMemoire reçoit bienvenue avec la vue courante ; il compte dans pres', () => {
    const { salle } = banc();
    const { recus } = telephone(salle, 1);
    expect(recus[0]).toMatchObject({ t: 'bienvenue', vue: { ecran: 'regardez' } });
    telephone(salle, 2);
    expect(salle.signaux().pres).toBe(2);
    expect(salle.evenementsJournal().filter(e => e.type === 'connexion').length).toBe(3);   // régie + 2 téléphones
  });

  it('le temps émulé fait avancer le lecteur (tick 1 Hz) : à 10 s, l’écran de vote part vers les téléphones', () => {
    const { h, salle } = banc();
    const { recus } = telephone(salle, 1);
    h.avancer(10_000);
    expect(salle.lecture()).toMatchObject({ moment: 'm1', etape: 'vote' });
    expect(recus.filter(m => m.t === 'vue').map(m => m.ecran)).toContain('vote');
  });

  it('ligne coupée : le noyau ferme la session, pres diminue, l’événement deconnexion part', () => {
    const { salle } = banc();
    const ev: EvenementSalle[] = [];
    salle.surEvenement(e => ev.push(e));
    const { p } = telephone(salle, 1);
    telephone(salle, 2);
    p.serveur.couper();
    salle.ligneCoupee('pub_s1x');
    expect(salle.signaux().pres).toBe(1);
    expect(ev.map(e => e.type)).toContain('deconnexion');
  });

  it('conduite : refus d’un moment inconnu ; go() termine l’étape, et franchit le passage « go » si l’étape y menait', () => {
    const { salle } = banc();
    expect(salle.conduite({ op: 'allerA', moment: 'nulle-part' }).statut).toBe('refus');
    salle.go();   // accueil → vote (étape suivante)
    expect(salle.lecture()).toMatchObject({ moment: 'm1', etape: 'vote' });
    salle.go();   // vote → résultat
    expect(salle.lecture()).toMatchObject({ moment: 'm1', etape: 'resultat' });
    salle.go();   // résultat → passage « go » franchi dans la même action (règle du GO du magasin)
    expect(salle.lecture()).toMatchObject({ moment: 'm2', etape: 'fin' });
    expect(salle.evenementsJournal().filter(e => e.type === 'conduite' && e.op === 'top').length).toBe(4);
  });
});

describe('Écho converti, 120 spectateurs « soirée »', () => {
  it('la salle joue Écho converti (commandesVersEnvois + acteursEcho()) : 19 étapes converties, les 6 acteurs d’Écho', async () => {
    const emu = await soiree({ population: { nombre: 4, melange: 'rapides' } });
    expect(emu.salle.rep.preparation).toEqual({ origine: 'conversion-echo', converties: 19 });
    expect(emu.salle.rep.projet.acteurs!.map(a => a.id)).toEqual(['public', 'scene', 'ministre', 'franck', 'eco', 'figurants']);
    await emu.avancer(5000);
    expect(emu.vueDe('public')).toMatchObject({ ecran: 'regardez', params: { texte: 'Regardez la vidéo' } });
  });

  it('les arrivées suivent la courbe pres ; pres (compté par le noyau) = téléphones en ligne', async () => {
    const emu = await soiree({ arrivees: 'salle' });
    await emu.avancer(60_000);
    const a60 = emu.bilan().arrives;
    expect(a60).toBeGreaterThan(30);
    expect(a60).toBeLessThan(90);
    await emu.avancer(600_000 - 60_000);
    const b = emu.bilan();
    expect(b.arrives).toBe(120);
    expect(emu.signaux().pres).toBe(b.connectes);
    expect(b.connectes).toBeGreaterThanOrEqual(110);
  }, 60_000);   // 3 s seul ; le poste de régie fait tourner plusieurs agents de code et la suite en parallèle

  it('GO par GO jusqu’à Q1 : 95 % affichent le vote en moins de 1 s ; faireVoter → quorum de 90 % avant 30 s ; le passage part au top', async () => {
    const emu2 = await soiree({ auto: false });
    await emu2.avancer(25_000);
    await jusqua(emu2, 'b4_notif');
    await emu2.avancer(11_000);
    const avant = presents(emu2);
    emu2.go();
    expect(emu2.bilan().lecture?.moment).toBe('b5_q1');
    await emu2.avancer(1000);
    const affichent = avant.filter(t => { const e = t.etat(); return e.ecran?.type === 'vote' && t.magasin?.lire().vue?.params.numero === 1; });
    expect(affichent.length / avant.length).toBeGreaterThanOrEqual(0.95);

    const quorum: number[] = [];
    emu2.faireVoter({ repartition: { A: 60, B: 30, C: 10 }, dansS: 20 });
    for (let s = 1; s <= 30; s++) { await emu2.avancer(1000); quorum.push(emu2.signaux().quorum); }
    const atteint = quorum.findIndex(q => q >= 90);
    expect(atteint).toBeGreaterThanOrEqual(0);
    expect(atteint + 1).toBeLessThan(30);
    const sig = emu2.signaux();
    expect(sig.issue).toBe('A');
    expect(sig.votes!.A!).toBeGreaterThan(sig.votes!.B!);
    emu2.go();
    expect(emu2.bilan().lecture?.moment).toBe('b5_q1_res');
  }, 60_000);

  it('coupure de 30 % pendant 20 s, un GO pendant la coupure ; au retour, tous accusent la vue courante', async () => {
    const emu = await soiree({ auto: false, population: { nombre: 120, melange: 'rapides' } });
    await emu.avancer(25_000);
    await jusqua(emu, 'b5_q1');
    const coupes = emu.coupure({ part: 0.3, dureeS: 20 });
    expect(coupes.length).toBe(36);
    expect(emu.signaux().pres).toBe(84);
    await emu.avancer(11_000);
    emu.go();
    expect(emu.bilan().lecture?.moment).toBe('b5_q1_res');
    await emu.avancer(15_000);
    const vue = emu.vueDe('public')!;
    const tels = emu.telephonesSalle().filter(t => t.acteur === 'public');
    expect(tels.every(t => t.etat().enLigne)).toBe(true);
    expect(tels.filter(t => t.etat().ecran?.n !== vue.vseq).map(t => t.id)).toEqual([]);
    expect(emu.signaux().prets).toBe(100);
  }, 60_000);

  it('déterminisme : deux salles de même graine donnent le même bilan et le même journal ; une autre graine, non', async () => {
    const jouer = async (graine: number) => {
      const emu = await soiree({ graine, population: { nombre: 60, melange: 'soiree' } });
      await emu.avancer(25_000);
      await jusqua(emu, 'b5_q1');
      emu.faireVoter({ repartition: { A: 50, B: 50 }, dansS: 10 });
      emu.coupure({ part: 0.1, dureeS: 15 });
      await emu.avancer(30_000);
      return { bilan: emu.bilan(), journal: emu.journal() };
    };
    const a = await jouer(7), b = await jouer(7), c = await jouer(8);
    expect(b.bilan).toEqual(a.bilan);
    expect(b.journal).toBe(a.journal);
    expect(c.journal).not.toBe(a.journal);
  }, 60_000);

  it('comportement automatique : les profils votent selon leur participation, le penchant de la salle se retrouve', async () => {
    const emu = await soiree();
    await emu.avancer(25_000);
    await jusqua(emu, 'b5_q1');
    await emu.avancer(120_000);
    const parProfil = (nom: string) => {
      const l = emu.telephonesSalle(`groupe:${nom}`);
      return l.filter(t => t.etat().dernierVote).length / l.length;
    };
    expect(parProfil('rapide')).toBeGreaterThan(0.8);
    expect(parProfil('distrait')).toBeLessThan(parProfil('rapide'));
    const pen = votesSalle(echo().sens);
    const sig = emu.signaux();
    expect(sig.issue).toBe(pen.A > pen.B ? 'A' : 'B');
    expect(sig.quorum).toBeGreaterThan(60);
  }, 60_000);

  it('latence des accusés : p95 sous 2 s avec le mélange « soirée »', async () => {
    const emu = await soiree({ auto: false });
    await emu.avancer(25_000);
    await jusqua(emu, 'b5_q1');
    await emu.avancer(3000);
    const l = emu.bilan().latenceAck;
    expect(l.n).toBeGreaterThan(500);
    expect(l.p50).toBeLessThan(400);
    expect(l.p95).toBeLessThan(2000);
    expect(l.partA2s).toBeGreaterThan(0.95);
  }, 60_000);

  it('notification (b4) : vibration sur Android, rien sur l’iPhone muet ; le bouton « vu » rend les téléphones prêts', async () => {
    const emu = await soiree({ population: [{ profil: 'rapide', nombre: 10 }, { profil: 'iphone-muet', nombre: 10 }], arrivees: 'toutes' });
    await emu.avancer(5000);
    await jusqua(emu, 'b4_notif');
    await emu.avancer(1000);
    const vib = (nom: string) => emu.telephonesSalle(`groupe:${nom}`).reduce((t, x) => t + x.etat().vibrations, 0);
    expect(vib('rapide')).toBeGreaterThanOrEqual(10);
    expect(vib('iphone-muet')).toBe(0);
    expect(emu.faireToucher({ selecteur: 'bouton', dansS: 2 })).toBe(20);
    await emu.avancer(4000);
    expect(emu.signaux().prets).toBe(100);
  }, 60_000);

  it('rechargement : même personne, le vote n’est pas compté deux fois, la vue courante revient', async () => {
    const emu = await soiree({ auto: false, population: { nombre: 10, melange: 'rapides' }, arrivees: 'toutes' });
    await emu.avancer(5000);
    await jusqua(emu, 'b5_q1');
    emu.faireVoter({ repartition: { B: 1 }, dansS: 1 });
    await emu.avancer(3000);
    expect(emu.bilan().votes).toEqual({ B: 10 });
    const ids = emu.telephonesSalle().slice(0, 3).map(t => t.id);
    emu.recharger(ids);
    expect(emu.signaux().pres).toBe(7);
    await emu.avancer(6000);
    expect(emu.signaux().pres).toBe(10);
    // la machine rechargée a oublié son vote : elle revote… et le serveur répond « déjà voté »
    emu.faireVoter({ repartition: { A: 1 }, dansS: 1, cible: { ids } });
    await emu.avancer(3000);
    expect(emu.bilan().votes).toEqual({ B: 10 });
    for (const id of ids) expect(emu.telephone(id)!.etat()).toMatchObject({ enLigne: true, ecran: { type: 'vote' } });
  }, 60_000);

  it('page cachée : la présence part au serveur, les réponses automatiques attendent le retour au premier plan', async () => {
    const emu = await soiree({ population: { nombre: 10, melange: 'rapides' }, arrivees: 'toutes' });
    await emu.avancer(5000);
    await jusqua(emu, 'b5_q1_res');
    const caches = emu.masquer({ part: 1, dureeS: 60 });
    expect(caches.length).toBe(10);
    await emu.avancer(1000);
    const x = emu.salle.rep.instantane();
    expect(Object.values(x.salle.public!).every(p => !p.visible)).toBe(true);
    await emu.avancer(10_000);
    emu.go();
    expect(emu.bilan().lecture?.moment).toBe('b5_q2');
    await emu.avancer(30_000);
    expect(emu.signaux().quorum).toBe(0);
    await emu.avancer(60_000);
    expect(emu.signaux().quorum).toBeGreaterThan(50);
  }, 60_000);

  it('faireEcrire au fil de phrases : les textes arrivent au serveur, signés par la personne', async () => {
    const emu = await soiree({ auto: false, population: { nombre: 20, melange: 'rapides' }, arrivees: 'toutes' });
    await emu.avancer(5000);
    await jusqua(emu, 'b1_flux');
    await emu.avancer(1000);
    const ecran = emu.telephonesSalle()[0]!.etat().ecran?.type;
    const n = emu.faireEcrire({ textes: ['on veut la suite', 'bravo'], parMinute: 30, dureeS: 20 });
    expect(n).toBe(10);
    await emu.avancer(25_000);
    const textes = emu.salle.rep.instantane().textes;
    if (ecran === 'phrases' || ecran === 'texte' || ecran === 'choix') expect(textes.length).toBeGreaterThan(0);
    for (const t of textes) expect(['on veut la suite', 'bravo']).toContain(t.texte);
  }, 60_000);

  it('cibles : tous, sans-reponse, groupe, joueur, ids', async () => {
    const emu = await soiree({ population: [{ profil: 'rapide', nombre: 3 }, { profil: 'lent', nombre: 2 }], arrivees: 'toutes', auto: false });
    await emu.avancer(3000);
    expect(emu.telephones().length).toBe(5);
    expect(emu.telephones('groupe:lent').length).toBe(2);
    expect(emu.telephones('joueur:t002').map(t => t.id)).toEqual(['t002']);
    expect(emu.telephones({ ids: ['t001', 't005', 'x'] }).length).toBe(2);
    expect(emu.telephones('sans-reponse').length).toBe(5);
    emu.retirer(['t001']);
    expect(emu.telephones().length).toBe(4);
    expect(emu.ajouter(2, 'distrait').map(t => t.profil.nom)).toEqual(['distrait', 'distrait']);
  });

  it('téléphones nommés émulés : la ministre en veille, puis le compteur au vote', async () => {
    const emu = await soiree({ population: { nombre: 5, melange: 'rapides' }, acteurs: [{ acteur: 'ministre' }], arrivees: 'toutes' });
    await emu.avancer(3000);
    const ministre = emu.telephone('ministre')!;
    expect(ministre.etat()).toMatchObject({ genre: 'acteur', acteur: 'ministre', ecran: { type: 'veille' } });
    await jusqua(emu, 'b5_q1');
    await emu.avancer(1000);
    expect(ministre.etat().ecran?.type).toBe('vote-compteur');
  }, 60_000);

  it('transport vers un vrai serveur : le jeton « acteur » est obligatoire, et sans jeton de régie conduite/go le disent', async () => {
    expect(() => creerEmulateur({ projet: echo(), graine: 1, population: [], transport: { url: 'ws://127.0.0.1:1/ws' } })).toThrow(/jeton/);
    const emu = creerEmulateur({ projet: echo(), graine: 1, population: [], transport: { url: 'ws://127.0.0.1:1/ws', jeton: 'x'.repeat(20) } });
    expect(() => emu.conduite({ op: 'top' })).toThrow(/jeton de la régie/);
    expect(() => (emu as unknown as { salle: unknown }).salle).toThrow(/pas de salle en mémoire/);
    expect(() => emu.rejouer('')).toThrow(/transport mémoire/);
    await emu.arreter();
  });
});

describe('rejeu d’un journal de représentation', () => {
  const ev = (ts: number, type: string, detail: Record<string, unknown> = {}) => ({ ts: T0 + ts, run: 'r1', src: 'serveur', type, ...detail });
  /** Petit journal écrit à la main sur le projet du banc : 3 téléphones arrivent, l'accueil dure 10 s, puis le vote
   *  (sortie au quorum de 90 %) ; tel_003 vote hors ligne (son vote attend dans sa file et part à la reconnexion). */
  const JOURNAL = [
    ev(0, 'lancer', { mode: 'repetition', graine: 42 }),
    ev(50, 'connexion', { session: 'pub_s1x', role: 'acteur', acteur: 'public', personne: 'tel_001' }),
    ev(80, 'connexion', { session: 'pub_s2x', role: 'acteur', acteur: 'public', personne: 'tel_002' }),
    ev(90, 'connexion', { session: 'pub_s3x', role: 'acteur', acteur: 'public', personne: 'tel_003' }),
    ev(5000, 'entree', { k: 'etat', acteur: 'public', personne: 'tel_001', ecran: { vseq: 1, ecran: 'regardez', depuis: 0 } }),
    ev(11_000, 'deconnexion', { session: 'pub_s3x', role: 'acteur', acteur: 'public' }),
    ev(11_500, 'entree', { k: 'vote', acteur: 'public', personne: 'tel_003', q: '1', index: 0 }),
    ev(12_000, 'connexion', { session: 'pub_s3x', role: 'acteur', acteur: 'public', personne: 'tel_003' }),
    ev(13_000, 'entree', { k: 'vote', acteur: 'public', personne: 'tel_001', q: '1', index: 0 }),
    ev(13_500, 'entree', { k: 'vote', acteur: 'public', personne: 'tel_002', q: '1', index: 1 }),
    ev(17_000, 'entree', { k: 'texte', acteur: 'public', personne: 'tel_002', texte: 'hors sujet' }),
  ];

  it('lireJournal : texte JSONL, liste d’objets, suite asynchrone ; trié par heure, lignes illisibles ignorées', async () => {
    const jsonl = JOURNAL.map(e => JSON.stringify(e)).join('\n') + '\n{pas du json\n';
    expect((await lireJournal(jsonl)).length).toBe(JOURNAL.length);
    expect((await lireJournal([...JOURNAL].reverse()))[0]!.type).toBe('lancer');
    async function* suite() { for (const e of JOURNAL) yield JSON.stringify(e); }
    expect((await lireJournal(suite())).length).toBe(JOURNAL.length);
  });

  it('rejouer un petit journal fait à la main : les personnes reviennent, leurs votes sont rejoués par leur machine', async () => {
    const emu = creerEmulateur({ projet: projetBanc(), graine: 3, population: [], horloge: { debut: T0 } });
    const r = await emu.rejouer(JOURNAL, { avancer: true });
    expect(r.personnes).toBe(3);
    expect(r.dureeMs).toBe(17_000);
    // le vote de tel_003 hors ligne est gardé dans sa file et rejoué à la reconnexion ; le 3e vote fait le quorum
    expect(emu.bilan().votes).toEqual({ A: 2, B: 1 });
    // l'étape de vote dure 10 s (10 → 20 s) ; sa sortie est gardée par le quorum (100 % ≥ 90 %)
    await emu.avancer(5000);
    expect(emu.bilan().lecture).toMatchObject({ moment: 'm1', etape: 'resultat' });
    expect(r.rejouees).toBe(r.entrees - r.refusees);
    expect(r.refusees).toBe(1);   // le texte : pas d'écran de texte sur le banc
    expect(emu.telephonesSalle().map(t => t.personne).sort()).toEqual(['tel_001', 'tel_002', 'tel_003']);
  });

  it('aller-retour : le journal d’une salle émulée, rejoué dans une salle neuve, redonne les mêmes votes', async () => {
    const emu = await soiree({ auto: false, population: { nombre: 30, melange: 'rapides' }, arrivees: 'toutes' });
    await emu.avancer(3000);
    await jusqua(emu, 'b5_q1');
    emu.faireVoter({ repartition: { A: 20, B: 50, C: 30 }, dansS: 8 });
    await emu.avancer(12_000);
    const attendu = emu.bilan().votes;
    const neuve = creerEmulateur({ projet: echo(), graine: 99, population: [], horloge: { debut: T0 } });
    const r = await neuve.rejouer(emu.journal(), { avancer: true });
    expect(r.personnes).toBe(30);
    expect(r.refusees).toBe(0);
    expect(neuve.bilan().lecture?.moment).toBe('b5_q1');
    expect(neuve.bilan().votes).toEqual(attendu);
  }, 60_000);
});
