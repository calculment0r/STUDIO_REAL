// Noyau du serveur de spectacle sur un petit projet construit à la main (banc-test.ts) : vues, conduite, votes et
// quorum, effets, panique, forçage, agents, signaux des entrées, idempotence.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { lireMessageServeur } from '@studio-real/protocole';
import { Representation, correspond } from './representation';
import { T0, aleaFixe, banc, de, messages, projetBanc } from './banc-test';
import type { BanquesRepresentation, Sortie } from './types';

/** Banc lancé, salle connectée (régie, scène, ministre, 4 téléphones). */
function pret(n = 4) {
  const b = banc();
  b.lancer();
  b.salle(n);
  return b;
}
/** Jusqu'à l'étape de vote (10 s d'accueil). */
function auVote(n = 4) {
  const b = pret(n);
  b.secondes(10);
  expect(b.rep.etatLecture()!.etape).toBe('vote');
  return b;
}

describe('lancement et vues de chaque acteur', () => {
  it('lancer crée un run numéroté et journalisé, et le lecteur entre dans la première étape', () => {
    const b = banc();
    b.lancer();
    expect(b.rep.run).toMatchObject({ mode: 'scene', graine: 42, debut: T0 });
    expect(b.rep.run!.id).toMatch(/^r20261114-193000-[0-9a-f]{4}$/);
    expect(b.rep.etatLecture()).toMatchObject({ moment: 'm1', etape: 'accueil' });
    expect(b.rep.journal().map(e => e.type)).toContain('lancer');
  });

  it('bienvenue porte la vue courante de l’acteur, datée à l’heure serveur', () => {
    const b = banc();
    b.lancer();
    b.h.now += 500;
    const [s] = b.hello('pub_s1', 'acteur', 'public', 'tel_001');
    const m = s!.m;
    expect(s!.a).toEqual({ session: 'pub_s1' });
    expect(m).toMatchObject({ t: 'bienvenue', v: 2, role: 'acteur', acteur: 'public', cseq: 0 });
    if (m.t !== 'bienvenue') throw new Error();
    expect(m.vue).toMatchObject({ acteur: 'public', ecran: 'regardez', params: { texte: 'Bienvenue' }, cle: 'm1/accueil#1@0', at: T0 });
    expect(m.vue!.vseq).toBeGreaterThanOrEqual(1);
    expect(lireMessageServeur(JSON.stringify(m)).message).not.toBeNull();
  });

  it('chaque acteur a sa vue : scène, public, ministre', () => {
    const b = pret();
    expect(b.rep.vue('scene')!.ecran).toBe('accueil-qr');
    expect(b.rep.vue('public')!.ecran).toBe('regardez');
    expect(b.rep.vue('ministre')!.ecran).toBe('veille');
  });

  it('le temps passe : à l’étape de vote, nouvelle vue pour le public et la scène, vseq +1, $question résolu', () => {
    const b = pret();
    const avant = b.rep.vue('public')!.vseq;
    const out = b.secondes(10);
    const vues = messages(out, 'vue');
    const pub = vues.find(v => v.acteur === 'public')!;
    expect(pub).toMatchObject({ ecran: 'vote', vseq: avant + 1, params: { numero: 1, question: 'Faut-il continuer ?', reponses: ['Oui', 'Non'] } });
    expect(pub.at).toBe(b.h.now);
    expect(de(out, 'vue').find(s => s.m.acteur === 'public')!.a).toEqual({ acteur: 'public' });
    expect(vues.find(v => v.acteur === 'scene')).toMatchObject({ ecran: 'vote', params: { numero: 1 } });
    // la ministre ne change pas : pas de nouvelle vue
    expect(vues.some(v => v.acteur === 'ministre')).toBe(false);
  });

  it('un acteur inconnu, un agent pris pour un acteur, le rôle auteur : refus fatal, pas de session', () => {
    const b = banc();
    b.lancer();
    for (const out of [b.hello('xx_s01', 'acteur', 'fantome'), b.hello('xx_s02', 'acteur', 'figurants'), b.hello('xx_s03', 'auteur'), b.hello('xx_s04', 'agent', 'scene')]) {
      expect(out).toHaveLength(1);
      expect(out[0]!.m).toMatchObject({ t: 'refus', fatal: true });
    }
    expect(b.envoyer('xx_s01', { t: 'in', k: 'pret', data: { pret: true } })[0]!.m).toMatchObject({ t: 'refus', code: 'hello-requis' });
  });

  it('la régie reçoit la lecture et le résumé de salle à sa connexion, puis une lecture à chaque top', () => {
    const b = banc();
    b.lancer();
    const out = b.hello('regie_1', 'regie');
    const bienvenue = out[0]!.m;
    expect(bienvenue).toMatchObject({ t: 'bienvenue', role: 'regie', vue: null });
    if (bienvenue.t !== 'bienvenue') throw new Error();
    expect(bienvenue.lecture!.etat.moment).toBe('m1');
    expect(messages(out, 'salle')).toHaveLength(1);
    const apres = b.top();
    expect(apres[0]!.m).toMatchObject({ t: 'ack', cseq: 1, statut: 'ok' });
    expect(de(apres, 'lecture')[0]).toMatchObject({ a: { role: 'regie' }, m: { par: 'serveur' } });
  });
});

describe('conduite et idempotence', () => {
  it('conduite réservée à la régie, entrées réservées aux acteurs', () => {
    const b = pret();
    expect(b.envoyer('pub_s1', { t: 'conduite', op: 'top' })[0]!.m).toMatchObject({ t: 'ack', statut: 'refus' });
    expect(b.envoyer('regie_1', { t: 'in', k: 'pret', data: { pret: true } })[0]!.m).toMatchObject({ t: 'ack', statut: 'refus' });
    expect(b.envoyer('scene_1', { t: 'agent.in', k: 'say', data: {} })[0]!.m).toMatchObject({ t: 'ack', statut: 'refus' });
  });

  it('un cseq déjà vu reçoit « doublon » et n’est pas réappliqué (un seul top)', () => {
    const b = pret();
    b.secondes(10 + 10);   // vote bloqué (pas de quorum)
    const n = b.rep.instantane().entrees.length;
    expect(b.envoyer('regie_1', { t: 'conduite', op: 'top' }, 5)[0]!.m).toMatchObject({ t: 'ack', cseq: 5, statut: 'ok' });
    expect(b.rep.etatLecture()!.etape).toBe('resultat');
    const n2 = b.rep.instantane().entrees.length;
    expect(n2).toBeGreaterThan(n);
    expect(b.envoyer('regie_1', { t: 'conduite', op: 'top' }, 5)[0]!.m).toMatchObject({ t: 'ack', cseq: 5, statut: 'doublon' });
    expect(b.rep.instantane().entrees.length).toBe(n2);
    expect(b.rep.etatLecture()!.etape).toBe('resultat');
  });

  it('un renvoi dans le désordre (cseq 3 puis 2) est appliqué une fois, et bienvenue rend le dernier cseq reçu', () => {
    const b = pret();
    expect(b.envoyer('pub_s1', { t: 'in', k: 'pret', data: { pret: true } }, 3)[0]!.m).toMatchObject({ statut: 'ok' });
    expect(b.envoyer('pub_s1', { t: 'in', k: 'presence', data: { visible: true } }, 2)[0]!.m).toMatchObject({ statut: 'ok' });
    expect(b.envoyer('pub_s1', { t: 'in', k: 'presence', data: { visible: true } }, 2)[0]!.m).toMatchObject({ statut: 'doublon' });
    b.rep.fermer('pub_s1');
    const [s] = b.hello('pub_s1', 'acteur', 'public', 'tel_001', { cseq: 3 });
    expect(s!.m).toMatchObject({ t: 'bienvenue', cseq: 3 });
  });

  it('allerA, pause et moment inconnu', () => {
    const b = pret();
    b.envoyer('regie_1', { t: 'conduite', op: 'allerA', moment: 'm2' });
    expect(b.rep.etatLecture()).toMatchObject({ moment: 'm2', etape: 'fig' });
    expect(b.envoyer('regie_1', { t: 'conduite', op: 'allerA', moment: 'nulle-part' })[0]!.m).toMatchObject({ statut: 'refus' });
    b.envoyer('regie_1', { t: 'conduite', op: 'pause', pause: true });
    const t = b.rep.etatLecture()!.t;
    b.secondes(5);
    expect(b.rep.etatLecture()!.t).toBe(t);
    b.envoyer('regie_1', { t: 'conduite', op: 'pause', pause: false });
    b.secondes(5);
    expect(b.rep.etatLecture()!.t).toBe(t + 5);
  });

  it('ping → pong à l’heure serveur ; rtc relayé vers une session', () => {
    const b = pret();
    const [p] = b.brut('pub_s1', { t: 'ping', tc: 123 });
    expect(p).toEqual({ a: { session: 'pub_s1' }, m: { t: 'pong', tc: 123, ts: b.h.now } });
    const [r] = b.brut('pub_s1', { t: 'rtc', vers: 'scene_1', signal: { sdp: 'x' } });
    expect(r).toMatchObject({ a: { session: 'scene_1' }, m: { t: 'rtc', de: 'pub_s1', vers: 'scene_1', signal: { sdp: 'x' } } });
    expect(b.brut('pub_s1', { t: 'rtc', vers: 'personne_x', signal: {} })[0]!.m).toMatchObject({ t: 'refus', code: 'rtc-absent' });
  });
});

describe('votes, salle et passage au quorum', () => {
  it('pas de vote tant que l’écran de vote n’est pas montré', () => {
    const b = pret();
    expect(b.voter('pub_s1', 0)[0]!.m).toMatchObject({ t: 'ack', statut: 'refus' });
  });

  it('seule la foule vote : l’écran scène et la ministre sont refusés', () => {
    const b = auVote();
    expect(b.voter('scene_1', 0)[0]!.m).toMatchObject({ t: 'ack', statut: 'refus' });
    expect(b.voter('mini_1', 0)[0]!.m).toMatchObject({ t: 'ack', statut: 'refus' });
    expect(b.rep.signaux().quorum).toBe(0);
  });

  it('un vote accepté met à jour la salle de la régie (question, reçus, parts)', () => {
    const b = auVote();
    const out = b.voter('pub_s1', 1);
    expect(out[0]!.m).toMatchObject({ t: 'ack', statut: 'ok', res: { q: '1', recus: 1 } });
    const salle = [...messages(out, 'salle'), ...messages(b.secondes(1), 'salle')].pop()!;
    expect(salle.vote).toEqual({ q: '1', recus: 1, parts: [0, 1] });
    expect(salle.acteurs.public).toMatchObject({ presents: 4 });
    expect(salle.acteurs.scene).toMatchObject({ presents: 1 });
  });

  it('une voix par personne et par question : le second vote est un doublon, même depuis une autre session', () => {
    const b = auVote();
    b.voter('pub_s1', 0);
    expect(b.voter('pub_s1', 1)[0]!.m).toMatchObject({ t: 'ack', statut: 'doublon', raison: 'deja-vote' });
    b.hello('pub_s1b', 'acteur', 'public', 'tel_001');
    expect(b.voter('pub_s1b', 1)[0]!.m).toMatchObject({ statut: 'doublon', raison: 'deja-vote' });
    expect(b.rep.signaux()).toMatchObject({ quorum: 25, issue: 'A', votes: { A: 100 } });
  });

  it('quorum atteint par de vrais votes : passage automatique sans attendre l’alarme', () => {
    const b = auVote();
    b.voter('pub_s1', 0);
    b.secondes(12);   // durée prévue passée, 25 % : on reste
    expect(b.rep.etatLecture()!.etape).toBe('vote');
    const out = b.voter('pub_s2', 0);   // 50 % → la sortie « quorum ≥ 50 » est remplie
    expect(b.rep.etatLecture()!.etape).toBe('resultat');
    expect(messages(out, 'vue').find(v => v.acteur === 'public')).toMatchObject({ ecran: 'regardez', params: { texte: 'Résultat à l’écran' } });
    expect(messages(out, 'lecture')).toHaveLength(1);
    expect(b.rep.etatLecture()!.issue).toBe('A');
  });

  it('signaux réels : présents, prêts, quorum, répartition, issue ex æquo = T, sans capteur pour bruit et assis', () => {
    const b = auVote();
    expect(b.rep.signaux()).toEqual({ pres: 4, quorum: 0, prets: 0, bruit: 32, assis: 100 });
    b.envoyer('pub_s3', { t: 'in', k: 'pret', data: { pret: true } });
    b.voter('pub_s1', 0);
    expect(b.rep.signaux()).toMatchObject({ prets: 25, quorum: 25, issue: 'A' });
    b.rep.fermer('pub_s4');
    b.voter('pub_s2', 1);
    expect(b.rep.signaux()).toMatchObject({ pres: 3, quorum: 66.7, issue: 'T', votes: { A: 50, B: 50 } });
  });

  it('un téléphone qui affiche la vue courante compte comme prêt', () => {
    const b = auVote();
    const vseq = b.rep.vue('public')!.vseq;
    b.brut('pub_s1', { t: 'etat', heure: 1, visible: true, ecran: { vseq, ecran: 'vote', depuis: 1 } });
    b.envoyer('pub_s2', { t: 'in', k: 'accuse', data: { vseq, affiche: 2 } });
    expect(b.rep.signaux().prets).toBe(50);
  });

  it('une déconnexion fait baisser les présents', () => {
    const b = pret();
    expect(b.rep.signaux().pres).toBe(4);
    b.rep.fermer('pub_s1');
    b.rep.fermer('pub_s2');
    expect(b.rep.signaux().pres).toBe(2);
    expect(b.rep.journal().filter(e => e.type === 'deconnexion')).toHaveLength(2);
  });
});

describe('effets, panique, forçage', () => {
  it('un fx part une fois avec son ttl, est rejoué à une reconnexion dans le ttl, plus après', () => {
    const b = pret();
    const out = b.secondes(10);
    const fx = messages(out, 'fx');
    expect(fx).toHaveLength(1);
    expect(fx[0]).toMatchObject({ acteur: 'public', kind: 'vibrer', ttl: 3000, p: { motif: [200, 100, 200] }, at: b.h.now });
    expect(messages(b.secondes(1), 'fx')).toHaveLength(0);
    b.rep.fermer('pub_s1');
    expect(messages(b.hello('pub_s1', 'acteur', 'public', 'tel_001'), 'fx')).toHaveLength(1);
    b.rep.fermer('pub_s1');
    b.secondes(3);
    expect(messages(b.hello('pub_s1', 'acteur', 'public', 'tel_001'), 'fx')).toHaveLength(0);
  });

  it('panique : tous les acteurs sur leur écran de sécurité (pas les agents), puis retour aux vues calculées', () => {
    const b = auVote();
    const avant = { pub: b.rep.vue('public')!, scene: b.rep.vue('scene')! };
    const out = b.envoyer('regie_1', { t: 'conduite', op: 'panique', actif: true });
    const vues = messages(out, 'vue');
    expect(vues.find(v => v.acteur === 'public')).toMatchObject({ ecran: 'regardez', params: { texte: 'Regardez la scène' }, vseq: avant.pub.vseq + 1 });
    expect(vues.find(v => v.acteur === 'scene')).toMatchObject({ ecran: 'noir', vseq: avant.scene.vseq + 1 });
    expect(vues.find(v => v.acteur === 'ministre')).toMatchObject({ ecran: 'noir' });
    expect(vues.some(v => v.acteur === 'figurants' || v.acteur === 'pont')).toBe(false);
    expect(b.rep.journal().some(e => e.type === 'panique' && e.actif === true)).toBe(true);
    // pendant la panique, une nouvelle connexion reçoit l'écran de sécurité
    const [s] = b.hello('pub_s9', 'acteur', 'public', 'tel_009');
    expect(s!.m).toMatchObject({ t: 'bienvenue', vue: { ecran: 'regardez' } });
    const leve = messages(b.envoyer('regie_1', { t: 'conduite', op: 'panique', actif: false }), 'vue');
    expect(leve.find(v => v.acteur === 'public')).toMatchObject({ ecran: 'vote', params: avant.pub.params, vseq: avant.pub.vseq + 2 });
    expect(leve.find(v => v.acteur === 'scene')).toMatchObject({ ecran: 'vote' });
  });

  it('forcer : vue imposée et journalisée, remplacée au prochain envoi du lecteur', () => {
    const b = pret();
    const out = b.envoyer('regie_1', { t: 'conduite', op: 'forcer', acteur: 'scene', vue: { ecran: 'titre', params: { texte: 'Entracte' } } });
    expect(out[0]!.m).toMatchObject({ t: 'ack', statut: 'ok' });
    expect(messages(out, 'vue')[0]).toMatchObject({ acteur: 'scene', ecran: 'titre', params: { texte: 'Entracte' } });
    expect(b.rep.journal().some(e => e.type === 'forcer' && e.cible === 'scene')).toBe(true);
    b.secondes(5);
    expect(b.rep.vue('scene')!.ecran).toBe('titre');
    b.secondes(5);   // étape de vote : nouvel envoi à la scène
    expect(b.rep.vue('scene')!.ecran).toBe('vote');
  });

  it('forcer : acteur ou écran inconnus refusés', () => {
    const b = pret();
    expect(b.envoyer('regie_1', { t: 'conduite', op: 'forcer', acteur: 'lune', vue: { ecran: 'noir' } })[0]!.m).toMatchObject({ statut: 'refus' });
    expect(b.envoyer('regie_1', { t: 'conduite', op: 'forcer', acteur: 'scene', vue: { ecran: 'karaoke' } })[0]!.m).toMatchObject({ statut: 'refus' });
  });
});

describe('agents : commandes numérotées et accusées', () => {
  /** Au moment m2 (figurants), agent des figurants connecté. */
  function auxFigurants() {
    const b = pret();
    b.hello('agent_fig', 'agent', 'figurants');
    b.hello('agent_osc', 'agent', 'pont');
    const out = b.envoyer('regie_1', { t: 'conduite', op: 'allerA', moment: 'm2' });
    return { b, out };
  }

  it('un envoi à un acteur agent devient agent.cmd numéroté (n = 1), adressé à l’agent', () => {
    const { b, out } = auxFigurants();
    const cmd = de(out, 'agent.cmd');
    expect(cmd).toHaveLength(1);
    expect(cmd[0]).toEqual({ a: { acteur: 'figurants' }, m: { t: 'agent.cmd', n: 1, type: 'figurants.cmd', moment: 'm2', etape: 'fig', donnees: { segment: 'junon' }, at: b.h.now } });
  });

  it('un agent qui se (re)connecte reçoit les commandes non accusées', () => {
    const { b } = auxFigurants();
    b.rep.fermer('agent_fig');
    const out = b.hello('agent_fig', 'agent', 'figurants');
    expect(messages(out, 'agent.cmd').map(c => c.n)).toEqual([1]);
    b.brut('agent_fig', { t: 'agent.ack', n: 1, statut: 'recu' });
    b.rep.fermer('agent_fig');
    expect(messages(b.hello('agent_fig', 'agent', 'figurants'), 'agent.cmd').map(c => c.n)).toEqual([1]);
  });

  it('agent.ack « fait » → signal accuse:<étape> → le lecteur passe ; la commande machine du lecteur va au pont OSC', () => {
    const { b } = auxFigurants();
    b.secondes(10);
    expect(b.rep.etatLecture()!.etape).toBe('fig');
    const out = b.brut('agent_fig', { t: 'agent.ack', n: 1, statut: 'fait' });
    expect(b.rep.etatLecture()!.etape).toBe('lumiere');
    const machine = de(out, 'agent.cmd');
    expect(machine).toHaveLength(1);
    expect(machine[0]).toMatchObject({ a: { acteur: 'pont' }, m: { n: 2, type: 'machine', etape: 'lumiere', donnees: { cible: 'console', commande: 'go 12' } } });
    b.brut('agent_osc', { t: 'agent.ack', n: 2, statut: 'fait' });
    expect(b.rep.etatLecture()).toMatchObject({ termine: true });
    expect(b.rep.commandes().map(c => c.statut)).toEqual(['fait', 'fait']);
  });

  it('accusé rejoué : sans effet ; accusé d’un autre agent : refusé', () => {
    const { b } = auxFigurants();
    b.brut('agent_fig', { t: 'agent.ack', n: 1, statut: 'fait' });
    b.rep.journal();
    b.brut('agent_fig', { t: 'agent.ack', n: 1, statut: 'fait' });
    expect(b.rep.journal().filter(e => e.type === 'agent.ack')).toHaveLength(0);
    expect(b.brut('agent_osc', { t: 'agent.ack', n: 1, statut: 'fait' })[0]!.m).toMatchObject({ t: 'refus', code: 'commande-inconnue' });
    expect(b.brut('agent_fig', { t: 'agent.ack', n: 99, statut: 'fait' })[0]!.m).toMatchObject({ t: 'refus' });
  });

  it('valider (régie) → agent.cmd figurants.valider ; agent.in stat gardé pour la supervision', () => {
    const { b } = auxFigurants();
    const out = b.envoyer('regie_1', { t: 'conduite', op: 'valider', id: 'r12', ok: true, texte: 'bien vu' });
    expect(messages(out, 'agent.cmd')[0]).toMatchObject({ n: 2, type: 'figurants.valider', donnees: { id: 'r12', ok: true, texte: 'bien vu' } });
    expect(b.envoyer('agent_fig', { t: 'agent.in', k: 'stat', data: { appels: 3 } })[0]!.m).toMatchObject({ statut: 'ok' });
    expect(b.rep.resume().agents.figurants).toMatchObject({ connectes: 1, derniereStat: b.h.now });
  });
});

describe('entrées des acteurs → signaux du lecteur', () => {
  it('fin-video → video.fin (asset) et scene.fin-video ; transcription → transcription', () => {
    const b = pret();
    b.envoyer('scene_1', { t: 'in', k: 'fin-video', data: { asset: 'flux.mp4' } });
    b.hello('franck_s', 'acteur', 'ministre');
    b.envoyer('franck_s', { t: 'in', k: 'transcription', data: { texte: 'bonjour Junon', final: true } });
    const j = b.rep.etatLecture()!.journal!.filter(e => e.type === 'signal').map(e => [e.nom, e.valeur]);
    expect(j).toContainEqual(['video.fin', 'flux.mp4']);
    expect(j).toContainEqual(['scene.fin-video', 'flux.mp4']);
    expect(j).toContainEqual(['transcription', { texte: 'bonjour Junon', final: true }]);
    expect(j).toContainEqual(['ministre.transcription', { texte: 'bonjour Junon', final: true }]);
  });

  it('textes et réactions : gardés, journalisés, sans toucher au vote', () => {
    const b = pret();
    b.envoyer('pub_s1', { t: 'in', k: 'texte', data: { texte: 'Pourquoi pas ?' } });
    b.envoyer('pub_s2', { t: 'in', k: 'reaction', data: { emoji: '😂', n: 2 } });
    const etat = b.rep.instantane();
    expect(etat.textes).toEqual([{
      ts: b.h.now, acteur: 'public', personne: 'tel_001', texte: 'Pourquoi pas ?', pseudo: expect.stringMatching(/^spectateur_\d{3}$/), verdict: 'ok',
    }]);
    expect(etat.reactions).toEqual({ public: { '😂': 2 } });
  });
});

describe('envois ciblés dans la foule', () => {
  function projetCible() {
    const p = projetBanc();
    p.ev[0]!.st[2]!.envois!.push({ vers: 'public:ont-vote:A', ecran: 'notification', params: { texte: 'Bravo' } });
    return p;
  }

  it('« public:ont-vote:A » : vue par personne, seuls ceux qui ont voté A la reçoivent, vseq sans recul', () => {
    const b = banc(projetCible());
    b.lancer();
    b.salle(4);
    const base = b.rep.vue('public', 'tel_001')!.vseq;
    b.secondes(10);
    b.voter('pub_s1', 0);
    b.secondes(10);   // durée prévue du vote passée, quorum à 25 %
    const out = b.voter('pub_s2', 1);   // 50 % → résultat
    const vues = de(out, 'vue').filter(s => s.m.acteur === 'public');
    const parPersonne = Object.fromEntries(vues.map(s => [(s.a as { personne: string }).personne, s.m]));
    expect(parPersonne.tel_001).toMatchObject({ ecran: 'notification', params: { texte: 'Bravo' } });
    expect(parPersonne.tel_002).toMatchObject({ ecran: 'regardez' });
    expect(parPersonne.tel_001!.vseq).toBeGreaterThan(base);
    expect(b.rep.vue('public', 'tel_003')!.ecran).toBe('regardez');
  });

  it('« public:aleatoire:2 » : deux personnes tirées parmi les présentes, tirage gardé', () => {
    const p = projetBanc();
    p.ev[0]!.st[0]!.envois!.push({ vers: 'public:aleatoire:2', ecran: 'notification', params: { texte: 'Tiré au sort' } });
    const b = banc(p);
    b.salle(4);   // connectés avant le lancement
    b.lancer();
    const tires = ['tel_001', 'tel_002', 'tel_003', 'tel_004'].filter(x => b.rep.vue('public', x)!.ecran === 'notification');
    expect(tires).toHaveLength(2);
    expect(Object.values(b.rep.instantane().tirages)).toEqual([expect.arrayContaining(tires)]);
  });
});

describe('remise : destinations', () => {
  it('correspond() : session, rôle, tous, acteur, personne', () => {
    const tel = { session: 's1', role: 'acteur' as const, acteur: 'public', personne: 'p1' };
    const regie = { session: 'r1', role: 'regie' as const };
    expect(correspond({ session: 's1' }, tel)).toBe(true);
    expect(correspond({ role: 'regie' }, regie)).toBe(true);
    expect(correspond({ role: 'regie' }, tel)).toBe(false);
    expect(correspond({ tous: true }, regie)).toBe(true);
    expect(correspond({ acteur: 'public' }, tel)).toBe(true);
    expect(correspond({ acteur: 'public' }, regie)).toBe(false);
    expect(correspond({ acteur: 'public', personne: 'p1' }, tel)).toBe(true);
    expect(correspond({ acteur: 'public', personne: 'p2' }, tel)).toBe(false);
    expect(correspond({ acteur: 'figurants' }, { session: 'a', role: 'agent', acteur: 'figurants' })).toBe(true);
  });

  it('tous les messages sortants d’une soirée du banc sont valides pour le protocole', () => {
    const b = pret();
    const out: Sortie[] = [...b.secondes(10), ...b.voter('pub_s1', 0), ...b.voter('pub_s2', 1), ...b.voter('pub_s3', 1), ...b.secondes(15), ...b.top()];
    b.hello('agent_fig', 'agent', 'figurants');
    out.push(...b.secondes(12), ...b.brut('agent_fig', { t: 'agent.ack', n: 1, statut: 'fait' }));
    expect(out.length).toBeGreaterThan(10);
    for (const s of out) expect(lireMessageServeur(JSON.stringify(s.m)).raison, s.m.t).toBeUndefined();
  });
});

describe('le noyau reste pur', () => {
  it('aucun import de node:, de ws, ni de process dans src/noyau (hors tests)', () => {
    const dossier = fileURLToPath(new URL('.', import.meta.url));
    for (const f of readdirSync(dossier).filter(x => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
      const s = readFileSync(join(dossier, f), 'utf8');
      expect(s, f).not.toMatch(/from\s+['"](node:|ws['"])|require\(|process\.|Date\.now\(|Math\.random\(/);
    }
  });
});

describe('rail des sorties de la régie : ce que chaque acteur AFFICHE', () => {
  it('le battement d’un acteur nommé est relayé à la régie ; celui d’un téléphone du public ne l’est pas', () => {
    const b = pret();
    const vseq = b.rep.vue('scene')!.vseq;
    const out = b.brut('scene_1', { t: 'etat', heure: T0 + 5, ecran: { vseq, ecran: 'accueil-qr', depuis: T0 + 1 }, visible: true, rttMs: 38, erreurs: ['son bloqué'] });
    const relais = de(out, 'etat');
    expect(relais).toHaveLength(1);
    expect(relais[0]!.a).toEqual({ role: 'regie' });
    expect(relais[0]!.m).toMatchObject({ acteur: 'scene', heure: T0 + 5, ecran: { vseq, ecran: 'accueil-qr' }, visible: true, rttMs: 38, erreurs: ['son bloqué'] });
    expect(lireMessageServeur(JSON.stringify(relais[0]!.m)).message).not.toBeNull();
    const pub = b.brut('pub_s1', { t: 'etat', heure: T0 + 5, ecran: { vseq: b.rep.vue('public', 'tel_001')!.vseq, ecran: 'regardez', depuis: T0 + 1 }, visible: true, rttMs: 120 });
    expect(de(pub, 'etat')).toHaveLength(0);
  });

  it('le résumé de salle porte la vue demandée, les écrans affichés par la foule et l’aller-retour médian', () => {
    const b = pret();
    const v = b.rep.vue('public')!;
    b.brut('pub_s1', { t: 'etat', heure: T0, ecran: { vseq: v.vseq, ecran: 'regardez', depuis: T0 }, visible: true, rttMs: 104 });
    b.brut('pub_s2', { t: 'etat', heure: T0, ecran: { vseq: v.vseq, ecran: 'regardez', depuis: T0 }, visible: true, rttMs: 300 });
    const salle = messages(b.secondes(1), 'salle').pop()!;
    expect(salle.acteurs.public).toMatchObject({ presents: 4, demande: { vseq: v.vseq, ecran: 'regardez' }, parEcran: { regardez: 2, '': 2 }, rttMs: 100 });
    expect(salle.acteurs.scene!.demande).toMatchObject({ ecran: 'accueil-qr' });
    expect(lireMessageServeur(JSON.stringify(salle)).message).not.toBeNull();
  });
});

describe('barre de scène : retenir et prolonger', () => {
  it('retenir tient l’étape malgré le temps ; top() la libère ; l’ordre est journalisé et rejouable', () => {
    const b = pret();
    expect(b.envoyer('regie_1', { t: 'conduite', op: 'retenir', actif: true })[0]!.m).toMatchObject({ t: 'ack', statut: 'ok' });
    b.secondes(30);
    expect(b.rep.etatLecture()).toMatchObject({ etape: 'accueil', retenu: true });
    expect(b.rep.journal().some(e => e.type === 'conduite' && e.op === 'retenir')).toBe(true);
    // les entrées sont journalisées pour reconstruire le lecteur à l'identique
    expect(b.rep.instantane().entrees.some(x => x.k === 'retenir' && x.actif === true)).toBe(true);
    b.top();
    expect(b.rep.etatLecture()!.etape).not.toBe('accueil');
    expect(b.rep.etatLecture()!.retenu).toBe(false);
  });

  it('prolonger décale la fin de l’étape (cumulable)', () => {
    const b = pret();
    b.envoyer('regie_1', { t: 'conduite', op: 'prolonger', secondes: 30 });
    b.envoyer('regie_1', { t: 'conduite', op: 'prolonger', secondes: 30 });
    expect(b.rep.etatLecture()!.prolonge).toBe(60);
    b.secondes(10);
    expect(b.rep.etatLecture()!.etape).toBe('accueil'); // la durée prévue (10 s) est passée mais pas 10 + 60
    b.secondes(60);
    expect(b.rep.etatLecture()!.etape).not.toBe('accueil'); // 70 s écoulées
  });

  it('un instantané rejoue la retenue et la prolongation (reprise après redémarrage)', () => {
    const b = pret();
    b.secondes(3);
    b.envoyer('regie_1', { t: 'conduite', op: 'retenir', actif: true });
    b.envoyer('regie_1', { t: 'conduite', op: 'prolonger', secondes: 30 });
    const rep = new Representation({ projet: projetBanc(), horloge: () => b.h.now, alea: aleaFixe(3) });
    expect(rep.restaurer(JSON.parse(JSON.stringify(b.rep.instantane())))).toEqual({ divergence: false, projetModifie: false });
    expect(rep.etatLecture()).toMatchObject({ etape: 'accueil', retenu: true, prolonge: 30 });
  });

  it('réservé à la régie', () => {
    const b = pret();
    const out = b.envoyer('pub_s1', { t: 'conduite', op: 'retenir', actif: true });
    expect(out[0]!.m).toMatchObject({ t: 'ack', statut: 'refus' });
    expect(b.rep.etatLecture()!.retenu).toBe(false);
  });
});

describe('le mur nourri par le serveur : pseudos, messages, figurants, voix, question du vote', () => {
  const INTERDITS = ['connard', 'pute', 're:\\b(https?:\\/\\/|www\\.)\\S+'];
  const QUESTIONS = [
    { numero: 1, question: 'Faut-il continuer ?', reponses: ['Oui', 'Non'] },
    { numero: 2, question: 'Et maintenant ?', reponses: ['Rester', 'Partir', 'Rire'], scores: [64, 13, 23], resultat: 'Le public a choisi de rester.' },
  ];
  /** Banc dont l'écran scène montre le mur : vote ouvert (numéro seul, comme la conversion d'Écho), puis révélé. */
  function projetMur(numero = 1) {
    const p = projetBanc();
    p.ev[0]!.st[1]!.envois = [
      { vers: 'public', ecran: 'vote', params: { numero } },
      { vers: 'scene', ecran: 'mur', params: { vote: 'ouvert', numero } },
    ];
    p.ev[0]!.st[2]!.envois = [
      { vers: 'public', ecran: 'regardez', params: { texte: 'Résultat à l’écran' } },
      { vers: 'scene', ecran: 'mur', params: { vote: 'revele' } },
    ];
    return p;
  }
  function murPret(numero = 1, banques: BanquesRepresentation = { interdits: INTERDITS, votes: QUESTIONS }) {
    const b = banc(projetMur(numero), 42, banques);
    b.lancer();
    b.salle(4);
    return b;
  }
  const bienvenue = (l: Sortie[]) => messages(l, 'bienvenue')[0]!;
  const texte = (b: ReturnType<typeof murPret>, session: string, t: string) => b.envoyer(session, { t: 'in', k: 'texte', data: { texte: t } });

  it('pseudo : filtré comme au prototype, unique dans l’acteur, gardé à la reconnexion ; bienvenue le porte', () => {
    const b = murPret();
    expect(bienvenue(b.hello('p1_____', 'acteur', 'public', 'tel_101', { pseudo: 'Léa du 3e' })).pseudo).toBe('Léa_du_3e');
    expect(bienvenue(b.hello('p2_____', 'acteur', 'public', 'tel_102', { pseudo: 'léa_DU_3e' })).pseudo).toBe('léa_DU_3e_2');
    expect(bienvenue(b.hello('p3_____', 'acteur', 'public', 'tel_103', { pseudo: 'gros connard' })).pseudo).toMatch(/^spectateur_\d{3}$/);
    expect(bienvenue(b.hello('p4_____', 'acteur', 'public', 'tel_104', { pseudo: '<script>' })).pseudo).toMatch(/^spectateur_\d{3}$/);
    const sans = bienvenue(b.hello('p5_____', 'acteur', 'public', 'tel_105')).pseudo;
    expect(sans).toMatch(/^spectateur_\d{3}$/);
    // reconnexion (nouvelle session, même personne, autre pseudo proposé) : le pseudo ne change pas
    expect(bienvenue(b.hello('p1b____', 'acteur', 'public', 'tel_101', { pseudo: 'Autre' })).pseudo).toBe('Léa_du_3e');
    expect(bienvenue(b.hello('p5b____', 'acteur', 'public', 'tel_105')).pseudo).toBe(sans);
    // un acteur nommé prend son id ; un agent et la régie n'ont pas de pseudo
    expect(bienvenue(b.hello('mini_2_', 'acteur', 'ministre', 'mini_2_')).pseudo).toBe('ministre_2');
    expect(bienvenue(b.hello('fig_1__', 'agent', 'figurants'))).not.toHaveProperty('pseudo');
    expect(bienvenue(b.hello('regie_2', 'regie'))).not.toHaveProperty('pseudo');
    const salle = b.rep.instantane().salle.public!;
    expect(salle.tel_101).toMatchObject({ pseudo: 'Léa_du_3e', couleur: expect.stringMatching(/^--(cy|or|grn2|amb|coral-3|ink2|coral-2)$/) });
    for (const s of b.hello('p6_____', 'acteur', 'public', 'tel_106', { pseudo: 'Zoé' })) expect(lireMessageServeur(JSON.stringify(s.m)).raison).toBeUndefined();
  });

  it('message du public : fx `message` chez l’écran scène et la régie, pas chez le public ; accusé en premier', () => {
    const b = murPret();
    b.hello('p1_____', 'acteur', 'public', 'tel_101', { pseudo: 'Zoé' });
    const out = texte(b, 'p1_____', '  Trop   bien  ');
    expect(out[0]!.m).toMatchObject({ t: 'ack', statut: 'ok' });
    const fx = de(out, 'fx');
    expect(fx.map(f => f.a)).toEqual([{ acteur: 'scene' }, { role: 'regie' }]);
    const couleur = b.rep.instantane().salle.public!.tel_101!.couleur;
    expect(fx[0]!.m).toMatchObject({ acteur: 'scene', kind: 'message', ttl: 30_000, p: { pseudo: 'Zoé', texte: 'Trop bien', couleur, grand: true } });
    expect(fx[0]!.m.p.id).toMatch(/^public\/tel_101\/\d+$/);
    expect(fx[0]!.m.id).toBe(fx[0]!.m.p.id);
    expect(fx[1]!.m).toMatchObject({ acteur: 'public', kind: 'message', p: { texte: 'Trop bien' } });
    for (const f of fx) expect(lireMessageServeur(JSON.stringify(f.m)).raison).toBeUndefined();
    expect(b.rep.instantane().textes.at(-1)).toMatchObject({ pseudo: 'Zoé', texte: '  Trop   bien  ', verdict: 'ok' });
    // la sortie qui se reconnecte retrouve les messages encore valables, plus ceux qui ont expiré
    b.rep.fermer('scene_1');
    b.h.now += 5000;
    expect(messages(b.hello('scene_1', 'acteur', 'scene'), 'fx')).toContainEqual(expect.objectContaining({ kind: 'message', p: expect.objectContaining({ texte: 'Trop bien' }) }));
    b.rep.fermer('scene_1');
    b.h.now += 30_000;
    b.secondes(1);
    expect(messages(b.hello('scene_1', 'acteur', 'scene'), 'fx').filter(f => f.kind === 'message')).toHaveLength(0);
  });

  it('8 messages par 10 s et par personne : le 9e est refusé (trop-vite), puis ça repart', () => {
    const b = murPret();
    for (let i = 0; i < 8; i++) expect(texte(b, 'pub_s1', `message ${i}`)[0]!.m).toMatchObject({ statut: 'ok' });
    const neuvieme = texte(b, 'pub_s1', 'encore');
    expect(neuvieme[0]!.m).toMatchObject({ t: 'ack', statut: 'refus', raison: 'trop-vite' });
    expect(de(neuvieme, 'fx')).toHaveLength(0);
    expect(texte(b, 'pub_s2', 'moi aussi')[0]!.m).toMatchObject({ statut: 'ok' });   // une autre personne n'est pas freinée
    b.h.now += 10_000;
    expect(texte(b, 'pub_s1', 'me revoilà')[0]!.m).toMatchObject({ statut: 'ok' });
  });

  it('modération : mot interdit masqué, message surtout interdit refusé (filtre), lien masqué', () => {
    const b = murPret();
    const masque = texte(b, 'pub_s1', 'tu es un c0nnaaard toi');
    expect(masque[0]!.m).toMatchObject({ statut: 'ok' });
    expect(messages(masque, 'fx')[0]!.p).toMatchObject({ texte: 'tu es un *** toi' });
    expect(b.rep.instantane().textes.at(-1)).toMatchObject({ texte: 'tu es un c0nnaaard toi', verdict: 'masque', affiche: 'tu es un *** toi' });
    const refuse = texte(b, 'pub_s2', 'CONNARD !!!');
    expect(refuse[0]!.m).toMatchObject({ statut: 'refus', raison: 'filtre' });
    expect(de(refuse, 'fx')).toHaveLength(0);
    expect(b.rep.instantane().textes.at(-1)).toMatchObject({ verdict: 'refuse' });
    expect(messages(texte(b, 'pub_s3', 'allez voir sur www.exemple.com ce soir'), 'fx')[0]!.p.texte).toBe('allez voir sur *** ce soir');
  });

  it('réplique d’un figurant (agent.in say) : même modération, fx `message` grand:false, couleur valide sinon --ink2', () => {
    const b = murPret();
    b.hello('fig_1__', 'agent', 'figurants');
    const out = b.envoyer('fig_1__', { t: 'agent.in', k: 'say', data: { persona: '@MarieL', texte: 'Il a raison', couleur: '--coral-2' } });
    expect(out[0]!.m).toMatchObject({ t: 'ack', statut: 'ok' });
    const fx = de(out, 'fx');
    expect(fx.map(f => f.a)).toEqual([{ acteur: 'scene' }, { role: 'regie' }]);
    expect(fx[0]!.m).toMatchObject({ kind: 'message', p: { pseudo: 'MarieL', texte: 'Il a raison', couleur: '--coral-2', grand: false } });
    expect(fx[0]!.m.p.id).toMatch(/^fig\/\d+$/);
    const sansCouleur = messages(b.envoyer('fig_1__', { t: 'agent.in', k: 'say', data: { persona: 'Jo', texte: 'ok', couleur: 'red' } }), 'fx');
    expect(sansCouleur[0]!.p.couleur).toBe('--ink2');
    expect(b.envoyer('fig_1__', { t: 'agent.in', k: 'say', data: { persona: 'Jo', texte: 'pute' } })[0]!.m).toMatchObject({ statut: 'refus', raison: 'filtre' });
    // les autres `k` restent journalisés seulement ; le pont OSC ne parle pas au mur
    expect(de(b.envoyer('fig_1__', { t: 'agent.in', k: 'proposition', data: { texte: 'x' } }), 'fx')).toHaveLength(0);
    b.hello('pont_1_', 'agent', 'pont');
    expect(de(b.envoyer('pont_1_', { t: 'agent.in', k: 'say', data: { persona: 'Jo', texte: 'bonjour' } }), 'fx')).toHaveLength(0);
  });

  it('vote accepté : fx `a-vote` {pseudo, index} chez l’écran scène seulement, 10 s', () => {
    const b = murPret();
    b.secondes(10);
    const out = b.voter('pub_s1', 1);
    expect(out[0]!.m).toMatchObject({ t: 'ack', statut: 'ok' });
    const fx = de(out, 'fx');
    expect(fx).toHaveLength(1);
    expect(fx[0]!.a).toEqual({ acteur: 'scene' });
    const pseudo = b.rep.instantane().salle.public!.tel_001!.pseudo;
    expect(fx[0]!.m).toMatchObject({ kind: 'a-vote', ttl: 10_000, p: { pseudo, index: 1 } });
    expect(de(b.voter('pub_s1', 0), 'fx')).toHaveLength(0);   // doublon : pas de seconde voix
  });

  it('vue `mur` ouverte : question et réponses de la banque ; vue `vote` du public aussi', () => {
    const b = murPret();
    b.secondes(10);
    expect(b.rep.vue('scene')).toMatchObject({ ecran: 'mur', params: { vote: { etat: 'ouvert', numero: 1, question: 'Faut-il continuer ?', reponses: ['Oui', 'Non'] } } });
    expect(b.rep.vue('scene')!.params.vote).not.toHaveProperty('comptes');
    expect(b.rep.vue('public')).toMatchObject({ ecran: 'vote', params: { numero: 1, question: 'Faut-il continuer ?', reponses: ['Oui', 'Non'] } });
    expect(messages(b.secondes(1), 'vue')).toHaveLength(0);   // rien ne change tant que personne ne vote
  });

  it('révélé : comptes réels, pourcentages arrondis, gagnant', () => {
    const b = murPret();
    b.secondes(10);
    b.voter('pub_s1', 1);
    b.secondes(12);   // durée prévue passée : on attend le quorum
    const out = b.voter('pub_s2', 1);   // 50 % : passage au résultat
    expect(b.rep.etatLecture()!.etape).toBe('resultat');
    const mur = messages(out, 'vue').find(v => v.acteur === 'scene')!;
    expect(mur.params.vote).toEqual({ etat: 'revele', numero: 1, question: 'Faut-il continuer ?', reponses: ['Oui', 'Non'], comptes: [0, 2], pourcents: [0, 100], gagnant: 1 });
    expect(lireMessageServeur(JSON.stringify(mur)).raison).toBeUndefined();
  });

  it('révélé avec `scores` dans la banque : résultat forcé, et la régie le sait (salle.vote.force)', () => {
    const b = murPret(2);
    b.secondes(10);
    b.voter('pub_s1', 0);
    b.secondes(12);
    const salle = [...messages(b.voter('pub_s2', 0), 'salle'), ...messages(b.secondes(1), 'salle')].pop()!;
    expect(salle.vote).toMatchObject({ q: '2', recus: 2, parts: [2], force: true });
    expect(b.rep.vue('scene')!.params.vote).toEqual({
      etat: 'revele', numero: 2, question: 'Et maintenant ?', reponses: ['Rester', 'Partir', 'Rire'],
      comptes: [64, 13, 23], pourcents: [64, 13, 23], gagnant: 0, resultat: 'Le public a choisi de rester.',
    });
  });

  it('projet écrit à la main (question déjà dans la vue) ou sans banque : rien n’est remplacé', () => {
    const p = projetMur(1);
    p.ev[0]!.st[1]!.envois![1] = { vers: 'scene', ecran: 'mur', params: { vote: 'ouvert', numero: 1, question: 'À la main', reponses: ['x', 'y'] } };
    const b = banc(p, 42, { votes: QUESTIONS });
    b.lancer();
    b.salle(2);
    b.secondes(10);
    expect(b.rep.vue('scene')!.params).toEqual({ vote: 'ouvert', numero: 1, question: 'À la main', reponses: ['x', 'y'] });
    const sans = murPret(1, {});
    sans.secondes(10);
    expect(sans.rep.vue('scene')!.params).toEqual({ vote: 'ouvert', numero: 1 });
  });

  it('banques données après coup (hôte) : la vue complétée part au tick suivant', () => {
    const b = murPret(1, {});
    b.secondes(10);
    b.rep.definirBanques({ votes: QUESTIONS });
    const vues = messages(b.secondes(1), 'vue');
    expect(vues.find(v => v.acteur === 'scene')).toMatchObject({ params: { vote: { question: 'Faut-il continuer ?' } } });
  });

  it('panique : aucun fx `message` ni `a-vote` ne part', () => {
    const b = murPret();
    b.secondes(10);
    b.hello('fig_1__', 'agent', 'figurants');
    b.envoyer('regie_1', { t: 'conduite', op: 'panique', actif: true });
    b.rep.journal();
    expect(texte(b, 'pub_s1', 'coucou')[0]!.m).toMatchObject({ statut: 'ok' });
    expect(de(texte(b, 'pub_s2', 'coucou'), 'fx')).toHaveLength(0);
    expect(de(b.envoyer('fig_1__', { t: 'agent.in', k: 'say', data: { persona: 'Jo', texte: 'salut' } }), 'fx')).toHaveLength(0);
    expect(de(b.voter('pub_s3', 0), 'fx')).toHaveLength(0);
    expect(b.rep.journal().filter(e => e.type === 'fx' && e.supprime === 'panique')).toHaveLength(4);
    expect(b.rep.instantane().fxActifs.filter(f => f.m.kind === 'message' || f.m.kind === 'a-vote')).toHaveLength(0);
  });

  it('effets actifs bornés à 200 (les plus récents)', () => {
    const b = murPret();
    for (let i = 0; i < 30; i++) b.hello(`pp_${String(i).padStart(4, '0')}`, 'acteur', 'public', `tel_9${String(i).padStart(2, '0')}`);
    for (let k = 0; k < 8; k++) for (let i = 0; i < 30; i++) texte(b, `pp_${String(i).padStart(4, '0')}`, `n ${k}`);
    const actifs = b.rep.instantane().fxActifs;
    expect(actifs).toHaveLength(200);
    expect(actifs.at(-1)!.m.p).toMatchObject({ texte: 'n 7' });
  });
});
