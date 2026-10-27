// Entrées extérieures (poser, signal, reprendre), blocs à événements, séquences, figurants et tirage parmi les ex æquo.
import { describe, expect, it } from 'vitest';
import { creerLecteur, simuler } from './lecteur';
import type { Lecteur, Signaux } from './moteur';
import {
  TY_CHRONO, TY_COMEDIEN_DIT, TY_FIGURANTS, TY_MACHINE, TY_MESSAGE, TY_MEMOIRE, TY_REPRISE, TY_SEQUENCE, TY_SIGNAL,
  TY_TIRAGE, comportementBloc, dureeSequence, indexChoix, issuesExaequo, motEntendu, reglagesChrono, reglagesComedien,
  reglagesFigurants, reglagesMachine, reglagesMessage, reglagesReprise, reglagesSignal,
} from './blocs-moteur';
import { planifier } from './temps';
import { chargerFichier, validerProjet } from './valider';
import type { Sequence } from './types';
import { cond, etape, moment, projet, sig, sortie } from './aides-test';

const avancerN = (L: Lecteur, n: number, s: Signaux = sig()) => {
  let e = L.etat();
  for (let i = 0; i < n; i++) e = L.avancer(1, s);
  return e;
};
const codes = (p: ReturnType<typeof validerProjet>) => p.map(x => x.code);

describe('entrées extérieures : poser() et signal()', () => {
  it('poser() pose une mémoire lue aussitôt par les conditions, et la journalise', () => {
    const L = creerLecteur(projet([moment('m', [etape('a'), etape('ok')], [sortie('a', 'ok', [cond('mem:missions', '≥', 3)])])]), { mode: 'scene', graine: 1 });
    expect(avancerN(L, 15).bloque).toBe(true);
    const e = L.poser('missions', 3);
    expect(e.etape).toBe('ok');
    expect(e.memoires.missions).toBe(3);
    expect(e.journal).toEqual([{ t: 15, type: 'memoire', nom: 'missions', valeur: 3, moment: 'm', etape: 'a' }]);
  });

  it('signal() : sig:<nom> compte les réceptions dans l’étape, sigv:<nom> lit la dernière valeur', () => {
    const p = projet([moment('m', [etape('a'), etape('deux'), etape('fort'), etape('apres')], [
      sortie('a', 'deux', [cond('sig:/pedale/1', '≥', 2)]),
      sortie('deux', 'fort', [cond('sigv:/lx/niveau', '≥', 0.8)]),
      sortie('fort', 'apres'),
    ])]);
    const L = creerLecteur(p, { mode: 'repetition' });
    avancerN(L, 10);
    expect(L.signal('/pedale/1').etape).toBe('a');
    let e = L.signal('/PEDALE/1 '); // nom normalisé
    expect(e.etape).toBe('deux');
    expect(e.receptions).toEqual({}); // repart de zéro dans la nouvelle étape
    avancerN(L, 10);
    e = L.signal('/lx/niveau', { valeur: 0.9 });
    expect(e.etape).toBe('fort');
    expect(e.journal?.filter(j => j.type === 'signal').map(j => j.nom)).toEqual(['/pedale/1', '/PEDALE/1 ', '/lx/niveau']);
  });

  it('un passage peut attendre un signal extérieur', () => {
    const p = projet([moment('m1', [etape('a')], [], { mode: 'auto', g: [cond('sig:porte', '≥', 1)] }), moment('m2', [etape('b')], [])]);
    const L = creerLecteur(p, { mode: 'repetition' });
    expect(avancerN(L, 30).phase).toBe('passage');
    expect(L.signal('porte').moment).toBe('m2');
  });
});

describe('écoute d’un signal (q:signal)', () => {
  const mk = (params: Record<string, unknown>) => projet([moment('m', [etape('ecoute', 10, TY_SIGNAL, { params }), etape('suite')], [
    sortie('ecoute', 'suite', [], 'all', { nom: 'reçu' }),
  ])]);

  it('sort par « reçu » dès N réceptions, sans attendre la durée prévue', () => {
    const L = creerLecteur(mk({ signal: '/qlab/fin', fois: 2 }), { mode: 'repetition' });
    avancerN(L, 2);
    L.signal('/qlab/fin');
    expect(L.etat().etape).toBe('ecoute');
    L.signal('autre');
    expect(L.signal('/qlab/fin').etape).toBe('suite');
  });

  it('signal absent : reste en attente, « bloqué » après la durée prévue avec alerte ; le top vaut le signal', () => {
    const L = creerLecteur(mk({ adresse: 'NOTE C3' }), { mode: 'repetition' });
    const e = avancerN(L, 12);
    expect(e.etape).toBe('ecoute');
    expect(e.bloque).toBe(true);
    expect(e.alertes?.map(a => a.type)).toEqual(['signal']);
    expect(L.top().etape).toBe('suite');
  });

  it('réglages par rotatifs : source k[1], reçu N fois k[2] (1 → 20)', () => {
    expect(reglagesSignal({ id: 's', k: [0, 0, 0] })).toEqual({ signal: 's', source: 'OSC', fois: 1 });
    expect(reglagesSignal({ id: 's', k: [0, 60, 100] })).toEqual({ signal: 's', source: 'clavier', fois: 20 });
  });
});

describe('commande machine (s:machine)', () => {
  const mk = () => projet([moment('m', [etape('go', 10, TY_MACHINE, { params: { cible: 'QLab', commande: '/qlab/cue/12 GO', delai: 2 } }), etape('ok'), etape('panne')], [
    sortie('go', 'ok', [], 'all', { nom: 'confirmé' }),
    sortie('go', 'panne', [], 'all', { nom: 'sans réponse' }),
  ])]);

  it('émet la commande à l’entrée et prend « confirmé » à l’accusé', () => {
    const L = creerLecteur(mk(), { mode: 'scene', graine: 1 });
    const c = L.etat().commandes!;
    expect(c).toEqual([{ n: 1, t: 0, type: 'machine', moment: 'm', etape: 'go', donnees: { cible: 'QLab', commande: '/qlab/cue/12 GO', accuse: 'accuse:go', delai: 2 } }]);
    avancerN(L, 1);
    expect(L.signal(String(c[0]!.donnees.accuse)).etape).toBe('ok');
    expect(L.etat().alertes).toEqual([]);
  });

  it('sans accusé dans le délai : « sans réponse » et alerte Sécurité', () => {
    const L = creerLecteur(mk(), { mode: 'scene', graine: 1 });
    expect(avancerN(L, 1).etape).toBe('go');
    const e = avancerN(L, 1);
    expect(e.etape).toBe('panne');
    expect(e.alertes?.[0]?.type).toBe('machine');
    expect(e.alertes?.[0]?.txt).toContain('QLab ne répond pas');
  });

  it('réglages : cible k[1], attente de l’accusé k[2] 0,5 → 10 s', () => {
    expect(reglagesMachine({ id: 'x', k: [0, 0, 0] })).toMatchObject({ cible: 'console LX', commande: '/lx/cue/12 GO', delai: 0.5, accuse: 'accuse:x' });
    expect(reglagesMachine({ id: 'x', k: [0, 100, 100] })).toMatchObject({ cible: 'sono', delai: 10 });
  });
});

describe('message à une personne (c:message)', () => {
  const mk = () => projet([moment('m', [etape('msg', 10, TY_MESSAGE, { name: 'Entre côté jardin', params: { delai: 30, destinataire: 'Milo · streamer' } }), etape('lu'), etape('relance')], [
    sortie('msg', 'lu', [], 'all', { nom: 'lu' }),
    sortie('msg', 'relance', [], 'all', { nom: 'non lu' }),
  ])]);

  it('émet le message, « lu » dès l’accusé de lecture', () => {
    const L = creerLecteur(mk(), { mode: 'repetition' });
    expect(L.etat().commandes?.[0]).toMatchObject({ type: 'message', donnees: { destinataire: 'Milo · streamer', texte: 'Entre côté jardin', accuse: 'lu:msg' } });
    avancerN(L, 5);
    expect(L.signal('lu:msg').etape).toBe('lu');
  });

  it('non lu au délai : sortie « non lu » et bandeau « Milo n’a pas lu la consigne »', () => {
    const L = creerLecteur(mk(), { mode: 'repetition' });
    const e = avancerN(L, 30);
    expect(e.etape).toBe('relance');
    expect(e.alertes?.[0]).toMatchObject({ type: 'message', moment: 'm', etape: 'msg' });
    expect(e.alertes?.[0]?.txt).toContain('Milo n’a pas lu la consigne');
    expect(reglagesMessage({ id: 'x', name: 'x', k: [0, 100, 0] })).toMatchObject({ destinataire: 'comédien', delai: 5 });
  });
});

describe('chrono visible (u:chrono)', () => {
  const mk = (avecDix: boolean) => projet([moment('m', [etape('chrono', 10, TY_CHRONO, { params: { duree: 20 } }), etape('zero'), etape('son')], [
    sortie('chrono', 'zero', [], 'all', { nom: 'zéro' }),
    ...(avecDix ? [sortie('chrono', 'son', [], 'all', { nom: '10 s restantes' })] : []),
  ])]);

  it('sort par « zéro » à la fin de sa durée et prévient à 10 s', () => {
    const L = creerLecteur(mk(false), { mode: 'repetition' });
    expect(L.etat().commandes?.[0]).toMatchObject({ type: 'chrono', donnees: { duree: 20, affichage: 'écran de scène', fin: 20 } });
    expect(avancerN(L, 19).etape).toBe('chrono');
    const e = avancerN(L, 1);
    expect(e.etape).toBe('zero');
    expect(e.commandes?.map(c => [c.type, c.t])).toEqual([['chrono', 0], ['chrono.10s', 10]]);
  });

  it('« 10 s restantes » branchée : elle est prise à 10 s de la fin ; planification cohérente', () => {
    const L = creerLecteur(mk(true), { mode: 'repetition' });
    expect(avancerN(L, 10).etape).toBe('son');
    expect(planifier(mk(true)).moments[0]!.etapes[0]).toMatchObject({ id: 'chrono', debut: 0, fin: 10 });
    expect(planifier(mk(false)).moments[0]!.etapes[0]).toMatchObject({ fin: 20 });
    expect(reglagesChrono({ k: [0, 0, 0] })).toEqual({ duree: 5, affichage: 'téléphones' });
  });
});

describe('point de reprise (p:reprise)', () => {
  const mk = () => projet([
    moment('m1', [
      etape('pose', 10, TY_MEMOIRE, { params: { nom: 'score', op: 'poser', valeur: 1 } }),
      etape('sur', 10, TY_REPRISE, { name: 'avant le vote', k: [0, 0, 0] }),
      etape('ajoute', 10, TY_MEMOIRE, { params: { nom: 'score', op: 'ajouter', valeur: 5 } }),
      etape('jeu', 40),
    ], [sortie('pose', 'sur'), sortie('sur', 'ajoute'), sortie('ajoute', 'jeu')]),
    moment('m2', [etape('fin')], []),
  ]);

  it('ne dure pas, mémorise un instantané ; reprendre() restaure mémoires et position', () => {
    const L = creerLecteur(mk(), { mode: 'repetition' });
    let e = avancerN(L, 10);
    expect(e.parcours.map(x => x[1])).toEqual(['pose', 'sur', 'ajoute']);
    expect(e.reprises).toEqual([{ nom: 'avant le vote', t: 10, moment: 'm1', etape: 'sur', restaure: 'tout', memoires: { score: 1 } }]);
    e = avancerN(L, 50);
    expect(e.memoires.score).toBe(6);
    expect(e.moment).toBe('m2');
    e = L.reprendre('Avant le vote');
    expect(e.moment).toBe('m1');
    expect(e.etape).toBe('ajoute'); // repassé par le point, puis sa sortie
    expect(e.t).toBe(10);
    expect(e.memoires.score).toBe(6); // 1 restauré, puis +5 en repassant « ajoute »
    expect(e.commandes?.at(-1)).toMatchObject({ type: 'reprise', donnees: { nom: 'avant le vote', restaure: 'tout', plateau: [] } });
    expect(e.journal?.some(j => j.type === 'reprise')).toBe(true);
  });

  it('point jamais passé → le précédent, avec alerte ; aucun point → alerte et rien ne bouge', () => {
    const L = creerLecteur(mk(), { mode: 'repetition' });
    let e = L.reprendre('inconnu');
    expect(e.alertes?.map(a => a.type)).toEqual(['reprise']);
    expect(e.etape).toBe('pose');
    avancerN(L, 30);
    e = L.reprendre('inconnu');
    expect(e.etape).toBe('ajoute');
    expect(e.alertes?.at(-1)?.txt).toContain('avant le vote');
  });

  it('réglage « ce qui est restauré » : k[1] ou params.restaure', () => {
    expect(reglagesReprise({ id: 'r', name: 'R', k: [0, 0, 0] }).restaure).toBe('tout');
    expect(reglagesReprise({ id: 'r', name: 'R', k: [0, 40, 0] }).restaure).toBe('memoires');
    expect(reglagesReprise({ id: 'r', name: 'R', k: [0, 0, 0], params: { restaure: 'écrans publics' } }).restaure).toBe('ecrans');
  });
});

describe('séquence réutilisable (d:sequence)', () => {
  const noir: Sequence = {
    id: 'q_noir', nom: 'noir salle', entry: 'noir',
    st: [etape('noir', 10), etape('voix', 16), etape('lum', 10, TY_MACHINE, { params: { cible: 'console LX', delai: 1 } })],
    tr: [sortie('noir', 'voix'), sortie('voix', 'lum'), sortie('lum', '', [], 'all', { nom: 'confirmé' }), sortie('lum', '', [], 'all', { nom: 'sans réponse' })],
  };
  const mk = (ref = 'noir salle', duree = 100) => projet([moment('m', [
    etape('seq', 10, TY_SEQUENCE, { params: { sequence: ref, duree } }), etape('apres'),
  ], [sortie('seq', 'apres', [], 'all', { nom: 'fin' })])], { sequences: [noir] });

  it('joue le sous-déroulé : etape reste le bloc du moment, `sequence` dit où l’on est', () => {
    const L = creerLecteur(mk(), { mode: 'repetition' });
    let e = L.etat();
    expect(e.etape).toBe('seq');
    expect(e.sequence).toEqual({ id: 'q_noir', nom: 'noir salle', etape: 'noir', tEtape: 0, chemin: ['noir salle'] });
    e = avancerN(L, 10);
    expect(e.sequence?.etape).toBe('voix');
    expect(e.tEtape).toBe(10);
    e = avancerN(L, 16);
    expect(e.sequence?.etape).toBe('lum');
    expect(e.commandes?.[0]).toMatchObject({ type: 'machine', etape: 'lum', donnees: { sequence: 'q_noir', intensite: 50 } });
    e = L.signal('accuse:lum');
    expect(e.etape).toBe('apres');
    expect(e.sequence).toBeUndefined();
    expect(e.parcours.map(x => x[1])).toEqual(['seq', 'apres']);
    expect(e.journal?.filter(j => j.type === 'sous-etape').map(j => j.valeur)).toEqual(['noir', 'voix', 'lum']);
  });

  it('durée globale : les durées de la séquence sont multipliées ; planification linéaire', () => {
    const L = creerLecteur(mk('q_noir', 200), { mode: 'repetition' });
    expect(avancerN(L, 19).sequence?.etape).toBe('noir');
    expect(avancerN(L, 1).sequence?.etape).toBe('voix');
    expect(dureeSequence([noir], noir, 1)).toBe(36);
    expect(planifier(mk()).moments[0]!.etapes.map(x => [x.id, x.fin])).toEqual([['seq', 36], ['apres', 46]]);
  });

  it('séquence introuvable : sortie directe et alerte ; validation le signale', () => {
    const L = creerLecteur(mk('disparue'), { mode: 'repetition' });
    const e = L.etat();
    expect(e.etape).toBe('apres');
    expect(e.alertes?.map(a => a.type)).toEqual(['sequence']);
    expect(codes(validerProjet(mk('disparue')))).toContain('sequence-inconnue');
    expect(validerProjet(mk())).toEqual([]);
  });

  it('séquences imbriquées et appel récursif borné', () => {
    const interne: Sequence = { id: 'q_in', nom: 'interne', entry: 'x', st: [etape('x', 10)], tr: [] };
    const externe: Sequence = { id: 'q_ex', nom: 'externe', entry: 'appel', st: [etape('appel', 10, TY_SEQUENCE, { params: { sequence: 'q_in', duree: 100 } }), etape('y', 10)], tr: [sortie('appel', 'y')] };
    const boucle: Sequence = { id: 'q_moi', nom: 'moi', entry: 'moi', st: [etape('moi', 10, TY_SEQUENCE, { params: { sequence: 'q_moi' } })], tr: [] };
    const p = projet([moment('m', [etape('s', 10, TY_SEQUENCE, { params: { sequence: 'externe', duree: 100 } }), etape('r', 10, TY_SEQUENCE, { params: { sequence: 'moi' } })], [sortie('s', 'r')])],
      { sequences: [interne, externe, boucle] });
    const L = creerLecteur(p, { mode: 'repetition' });
    expect(L.etat().sequence?.chemin).toEqual(['externe', 'interne']);
    let e = avancerN(L, 10);
    expect(e.sequence).toMatchObject({ id: 'q_ex', etape: 'y', chemin: ['externe'] });
    e = avancerN(L, 10);
    expect(e.parcours.map(x => x[1])).toEqual(['s', 'r']);
    expect(e.alertes?.map(a => a.type)).toEqual(['sequence']);
    expect(codes(validerProjet(p))).toContain('sequence-recursive');
  });

  it('chargerFichier garde les séquences', () => {
    const f = chargerFichier(JSON.stringify({ format: 'studio-real/conducteur@1', project: mk(), assets: [], runs: [] }));
    expect(f.project.sequences?.[0]?.id).toBe('q_noir');
    expect(f.project.sequences?.[0]?.st.map(x => x.id)).toEqual(['noir', 'voix', 'lum']);
  });
});

describe('figurants (x:figurants)', () => {
  it('émet figurants.cmd (densité, humeur, intention soufflée) puis sort par « fini » à la fin de la durée prévue', () => {
    const p = projet([moment('m', [
      etape('fig', 16, TY_FIGURANTS, { k: [1, 75, 0], params: { humeur: 'moqueuse, méfiante', intention: 'il a oublié son portefeuille', personas: ['p_kev'] } }),
      etape('suite'),
    ], [sortie('fig', 'suite', [], 'all', { nom: 'fini' })])]);
    const L = creerLecteur(p, { mode: 'repetition' });
    expect(L.etat().commandes).toEqual([{
      n: 1, t: 0, type: 'figurants.cmd', moment: 'm', etape: 'fig',
      donnees: { densite: 'chaud', humeur: 'moqueuse, méfiante', dire: { intention: 'il a oublié son portefeuille', personas: ['p_kev'], validation: true } },
    }]);
    expect(avancerN(L, 15).etape).toBe('fig');
    expect(avancerN(L, 1).etape).toBe('suite');
    expect(validerProjet(p)).toEqual([]);
  });

  it('réglages : densité silence → folie (k[1]), humeur (k[2]) ; sans intention, pas de « dire »', () => {
    expect(reglagesFigurants({ k: [0, 0, 0] })).toMatchObject({ densite: 'silence', humeur: 'neutre', personas: 'auto' });
    expect(reglagesFigurants({ k: [0, 100, 100], params: { densite: 'Calme' } })).toMatchObject({ densite: 'calme', humeur: 'méfiante' });
    expect(comportementBloc(TY_FIGURANTS)).toBe('figurants');
  });
});

describe('quand le comédien dit (q:comedien-dit)', () => {
  const mk = (params: Record<string, unknown>, pasDit = true) => projet([moment('m', [
    etape('ecoute', 10, TY_COMEDIEN_DIT, { params }), etape('religieuse'), etape('dit'), etape('rien'),
  ], [
    sortie('ecoute', 'religieuse', [], 'all', { nom: 'religieuse' }),
    sortie('ecoute', 'dit', [], 'all', { nom: 'dit' }),
    ...(pasDit ? [sortie('ecoute', 'rien', [], 'all', { nom: 'pas dit' })] : []),
  ])]);

  it('un mot-clé entendu dans la transcription prend sa sortie nommée (sinon « dit »), aussitôt', () => {
    const L = creerLecteur(mk({ mots: 'religieuse, gâteau', delai: 60 }), { mode: 'scene', graine: 1 });
    avancerN(L, 2);
    expect(L.signal('transcription', 'bonjour madame').etape).toBe('ecoute');
    const e = L.signal('transcription', { texte: 'Je voudrais une Religieuse, s’il vous plaît.' });
    expect(e.etape).toBe('religieuse');
    expect(e.journal?.find(j => j.type === 'mot')).toMatchObject({ nom: 'religieuse', etape: 'ecoute' });
    const L2 = creerLecteur(mk({ mots: ['religieuse', 'gâteau'] }), { mode: 'scene', graine: 1 });
    expect(L2.signal('transcription', 'un GATEAU au chocolat').etape).toBe('dit');
  });

  it('mot entier par défaut, approchant sur réglage ; « pas dit » au délai', () => {
    expect(motEntendu('les gâteaux', { mots: ['gâteau'], approchant: false })).toBeUndefined();
    expect(motEntendu('les gâteaux', { mots: ['gâteau'], approchant: true })).toBe('gâteau');
    expect(reglagesComedien({ k: [0, 0, 100] })).toMatchObject({ delai: 5, approchant: true, source: 'transcription', mots: [] });
    const L = creerLecteur(mk({ mots: ['religieuse'], delai: 20 }), { mode: 'repetition' });
    expect(avancerN(L, 20).etape).toBe('rien');
    const L2 = creerLecteur(mk({ mots: ['religieuse'], delai: 20 }, false), { mode: 'repetition' });
    const e = avancerN(L2, 25);
    expect(e.etape).toBe('ecoute');
    expect(e.bloque).toBe(true);
    expect(L2.top().etape).toBe('dit');
  });
});

describe('tirage parmi les ex æquo du dernier vote', () => {
  const mk = () => projet([
    moment('vote', [etape('v', 10, 'u1')], []),
    moment('roue', [etape('roue', 10, TY_TIRAGE, { params: { exaequo: true } }), etape('A'), etape('B'), etape('C')], [
      sortie('roue', 'A', [cond('issue', '=', 'A')]),
      sortie('roue', 'B', [cond('issue', '=', 'B')]),
      sortie('roue', 'C', [cond('issue', '=', 'C')]),
    ]),
  ]);
  const tirer = (graine: number, votes: Record<string, number>, issue: string) => {
    const L = creerLecteur(mk(), { mode: 'repetition', graine });
    const e = avancerN(L, 20, sig({ issue, votes }));
    return { etape: e.etape, issue: e.issue };
  };

  it('égalité A/B (C loin derrière) : jamais C, A et B à peu près à parts égales', () => {
    const n: Record<string, number> = {};
    for (let g = 1; g <= 400; g++) { const r = tirer(g, { A: 45, B: 43, C: 12 }, 'T'); n[r.etape!] = (n[r.etape!] ?? 0) + 1; expect(r.issue).toBe(r.etape); }
    expect(n.C).toBeUndefined();
    expect(n.A! / 400).toBeGreaterThan(0.4);
    expect(n.B! / 400).toBeGreaterThan(0.4);
  });

  it('vote tranché : toujours l’issue gagnante ; répartition inconnue : toutes les sorties', () => {
    for (let g = 1; g <= 30; g++) expect(tirer(g, { A: 20, B: 70, C: 10 }, 'B').etape).toBe('B');
    expect(issuesExaequo(undefined, 'T')).toBeNull();
    expect(issuesExaequo({ A: 40, B: 40, C: 20 }, 'T')).toEqual(['A', 'B']);
    expect(issuesExaequo({ A: 40, B: 37, C: 23 }, undefined, 2)).toEqual(['A']);
  });

  it('la salle simulée donne la répartition (Signaux.votes) ; la planification tire parmi les ex æquo', () => {
    const p = mk();
    p.sens.pen = 30; // A = 40, B = 48 : B l'emporte
    expect(planifier(p).moments[1]!.etapes.map(x => x.id)).toEqual(['roue', 'B']);
    expect(simuler(p).etat.parcours.map(x => x[1])).toEqual(['v', 'roue', 'B']);
  });
});

describe('simulation avec événements extérieurs', () => {
  it('simuler({ evenements }) envoie les accusés comme le ferait la régie', () => {
    const p = projet([moment('m', [etape('go', 10, TY_MACHINE, { params: { delai: 3 } }), etape('ok'), etape('ko')], [
      sortie('go', 'ok', [], 'all', { nom: 'confirmé' }), sortie('go', 'ko', [], 'all', { nom: 'sans réponse' }),
    ])]);
    const avec = simuler(p, { evenements: (e, L) => { for (const c of e.commandes ?? []) if (c.type === 'machine' && e.etape === 'go') L.signal(String(c.donnees.accuse)); } });
    expect(avec.etat.parcours.map(x => x[1])).toEqual(['go', 'ok']);
    expect(simuler(p).etat.parcours.map(x => x[1])).toEqual(['go', 'ko']);
  });

  it('indexChoix découpe le rotatif en parts égales (comme le catalogue)', () => {
    expect([0, 25, 26, 50, 51, 75, 76, 100].map(v => indexChoix(4, v))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect([0, 33, 34, 66, 67, 100].map(v => indexChoix(3, v))).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('validation : avertit des blocs sans sortie de secours, sans signal nommé, sans mot-clé', () => {
    const p = projet([moment('m', [
      etape('a', 10, TY_MACHINE), etape('b', 10, TY_MESSAGE), etape('c', 10, TY_SIGNAL), etape('d', 10, TY_COMEDIEN_DIT),
    ], [sortie('a', 'b', [], 'all', { nom: 'confirmé' }), sortie('b', 'c', [], 'all', { nom: 'lu' }), sortie('c', 'd'), sortie('d', '', [cond('sig:x', '≥', 1)])])]);
    const c = codes(validerProjet(p));
    for (const x of ['machine-sans-secours', 'message-sans-secours', 'signal-sans-nom', 'comedien-sans-mot']) expect(c).toContain(x);
    expect(c).not.toContain('condition-inconnue');
  });
});
