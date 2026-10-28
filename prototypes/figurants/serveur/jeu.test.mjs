// Tests unitaires du serveur de jeu (classe Jeu) : doublures, aucun port, index.mjs non lancé.
// Vérité de référence = le code actuel de jeu.mjs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Jeu } from './jeu.mjs';

const QUESTION = { numero: 3, question: 'Q ?', reponses: ['A', 'B', 'C', 'D'], scores: [40, 10, 30, 20], resultat: 'A gagne', duree_s: 3 };

function wsFactice() {
  return { readyState: 1, envoyes: [], send(s) { this.envoyes.push(JSON.parse(s)); }, close() {}, terminate() {} };
}

function moderateurFait() {
  return {
    compteurs: { rejets: 0, rejets_figurants: 0, rejets_humains: 0, par_raison: {} },
    verifier: (texte, _opt) => ({ ok: true, texte }),
  };
}

function journalFait() {
  return { lignes: [], ecrire(e) { this.lignes.push(e); } };
}

function banquesFaits() {
  return {
    premierSegment: () => 'vote',
    segments: { vote: { titre: 'Le vote' } },
    personas: [{ id: 'p1', pseudo: 'FigA', couleur: '--cy' }],
  };
}

function orchestrateurFait() {
  return {
    personasActifs: () => [],
    statistiques: () => ({}),
    onAsr: () => {},
    commande: () => true,
    valider: () => {},
    parleRegie: () => {},
  };
}

function faireJeu() {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'jeu-'));
  const fichierVotes = path.join(dossier, 'votes.json');
  const fichierPropositions = path.join(dossier, 'propositions.json');
  fs.writeFileSync(fichierVotes, JSON.stringify({ questions: [QUESTION] }));
  fs.writeFileSync(fichierPropositions, JSON.stringify({ segments: { vote: { phrases: ['Regardez ce flux !'], emojis: ['🔥'] } } }));
  const journal = journalFait();
  const jeu = new Jeu({ moderateur: moderateurFait(), journal, banques: banquesFaits(), jetonRegie: 'secret', fichierPropositions, fichierVotes });
  jeu.orchestrateur = orchestrateurFait();
  return { jeu, journal, dossier };
}

function connecter(jeu, role, extra = {}) {
  const ws = wsFactice();
  const c = jeu.ajouter(ws, '127.0.0.1');
  jeu.recevoir(c, JSON.stringify({ t: 'hello', role, ...extra }));
  return { ws, c };
}

const de = (ws, t) => ws.envoyes.filter((m) => m.t === t);

describe('serveur de jeu (Jeu) sans port, avec doublures', () => {
  let jeu, journal, dossier;

  beforeEach(() => {
    ({ jeu, journal, dossier } = faireJeu());
  });

  afterEach(() => {
    if (!jeu) return;
    clearInterval(jeu.minuteurVote);
    jeu.minuteurVote = null;
    if (jeu.minuteurPops) { clearTimeout(jeu.minuteurPops); jeu.minuteurPops = null; }
    if (dossier) fs.rmSync(dossier, { recursive: true, force: true });
  });

  it('un hello telephone reçoit un welcome, les propositions du segment et le mode des téléphones', () => {
    const { ws, c } = connecter(jeu, 'telephone', { pseudo: 'Alice' });
    const w = ws.envoyes[0];
    expect(w.t).toBe('welcome');
    expect(w.pseudo).toBe('Alice');
    expect(w.etat.segment).toBe('vote');
    expect(w.historique).toEqual([]);
    expect(de(ws, 'props')[0]).toMatchObject({ t: 'props', segment: 'vote', titre: 'Le vote', phrases: ['Regardez ce flux !'], emojis: ['🔥'] });
    expect(de(ws, 'tel')[0]).toMatchObject({ t: 'tel', mode: 'video' });
    // aucun vote ouvert : la vue du vote du téléphone est « ferme » (le code ne diffuse un `vote` qu'au cours d'un vote)
    expect(jeu.vueVote('telephone', c)).toEqual({ t: 'vote', etat: 'ferme' });
  });

  it('un telephone qui se connecte pendant un vote ouvert reçoit la vue du vote en cours', () => {
    const regie = connecter(jeu, 'regie', { jeton: 'secret' });
    jeu.recevoir(regie.c, JSON.stringify({ t: 'vote.cmd', cmd: 'ouvrir', numero: 3 }));
    const { ws } = connecter(jeu, 'telephone', { pseudo: 'Alice' });
    expect(de(ws, 'vote')[0]).toMatchObject({ t: 'vote', etat: 'compte', numero: 3, question: 'Q ?', nb: 4, reponses: ['A', 'B', 'C', 'D'] });
    expect(de(ws, 'vote')[0]).not.toHaveProperty('comptes');
  });

  it('un hello regie sans le bon jeton ne devient pas régie et ses tel.cmd sont ignorés', () => {
    const { ws, c } = connecter(jeu, 'regie', { pseudo: 'Regie', jeton: 'faux' });
    expect(c.role).toBeNull();
    expect(de(ws, 'journal')[0]).toMatchObject({ t: 'journal', ligne: 'jeton régie refusé' });
    jeu.recevoir(c, JSON.stringify({ t: 'tel.cmd', mode: 'flux' }));
    expect(jeu.tel.mode).toBe('video');
    expect(de(ws, 'tel')).toEqual([]);
  });

  it('avec le bon jeton, tel.cmd flux change le mode et est diffusé à chaque telephone connecté', () => {
    const regie = connecter(jeu, 'regie', { pseudo: 'Regie', jeton: 'secret' });
    expect(regie.c.role).toBe('regie');
    const t1 = connecter(jeu, 'telephone', { pseudo: 'Alice' });
    const t2 = connecter(jeu, 'telephone', { pseudo: 'Bob' });
    jeu.recevoir(regie.c, JSON.stringify({ t: 'tel.cmd', mode: 'flux' }));
    expect(jeu.tel.mode).toBe('flux');
    for (const { ws } of [t1, t2, regie]) expect(de(ws, 'tel').some((m) => m.mode === 'flux')).toBe(true);
    expect(journal.lignes.some((e) => e.e === 'tel_cmd' && e.mode === 'flux')).toBe(true);
  });

  it('un tel.cmd de mode inconnu est ignoré', () => {
    const regie = connecter(jeu, 'regie', { jeton: 'secret' });
    jeu.recevoir(regie.c, JSON.stringify({ t: 'tel.cmd', mode: 'hologramme' }));
    expect(jeu.tel.mode).toBe('video');
    expect(de(regie.ws, 'journal').some((m) => m.ligne.startsWith('téléphones'))).toBe(false);
  });

  it('ecran noir : jeu.ecran passe à noir et le role chat reçoit ecran {mode: noir}', () => {
    const regie = connecter(jeu, 'regie', { jeton: 'secret' });
    const chat = connecter(jeu, 'chat');
    jeu.recevoir(regie.c, JSON.stringify({ t: 'ecran', mode: 'noir' }));
    expect(jeu.ecran).toBe('noir');
    expect(de(chat.ws, 'ecran')[0]).toEqual({ t: 'ecran', mode: 'noir' });
    // seule la page du mur (chat) reçoit l'instruction ; pas la régie elle-même
    expect(de(regie.ws, 'ecran')).toEqual([]);
    jeu.recevoir(regie.c, JSON.stringify({ t: 'ecran', mode: 'mur' }));
    expect(jeu.ecran).toBe('mur');
    expect(de(chat.ws, 'ecran').at(-1)).toEqual({ t: 'ecran', mode: 'mur' });
  });
  it('vote.cmd ouvrir : le vote est ouvert, telephones sans comptes, mur et regie avec comptes', () => {
    const regie = connecter(jeu, 'regie', { jeton: 'secret' });
    const tel = connecter(jeu, 'telephone', { pseudo: 'Alice' });
    const chat = connecter(jeu, 'chat');
    jeu.recevoir(regie.c, JSON.stringify({ t: 'vote.cmd', cmd: 'ouvrir', numero: 3 }));
    expect(jeu.vote.numero).toBe(3);
    expect(jeu.vote.etat).toBe('compte');
    expect(jeu.vote.comptes).toEqual([0, 0, 0, 0]);
    const vt = de(tel.ws, 'vote');
    expect(vt).toHaveLength(1);
    expect(vt[0]).toMatchObject({ t: 'vote', etat: 'compte', numero: 3, question: 'Q ?', nb: 4, reponses: ['A', 'B', 'C', 'D'] });
    expect(vt[0]).not.toHaveProperty('comptes');
    expect(de(chat.ws, 'vote')[0]).toMatchObject({ etat: 'compte', comptes: [0, 0, 0, 0], total: 0 });
    expect(de(regie.ws, 'vote').at(-1)).toMatchObject({ etat: 'compte', comptes: [0, 0, 0, 0], scores: [40, 10, 30, 20], reels: [0, 0, 0, 0] });
    expect(journal.lignes.some((e) => e.e === 'vote_cmd' && e.cmd === 'ouvrir' && e.numero === 3)).toBe(true);
  });

  it('vote.choix : accepté une seule fois par telephone, journalisé vote_reel, pop sur le mur', () => {
    const regie = connecter(jeu, 'regie', { jeton: 'secret' });
    const tel = connecter(jeu, 'telephone', { pseudo: 'Alice' });
    const chat = connecter(jeu, 'chat');
    jeu.recevoir(regie.c, JSON.stringify({ t: 'vote.cmd', cmd: 'ouvrir', numero: 3 }));
    jeu.recevoir(tel.c, JSON.stringify({ t: 'vote.choix', numero: 3, index: 1 }));
    jeu.recevoir(tel.c, JSON.stringify({ t: 'vote.choix', numero: 3, index: 2 }));
    expect([...jeu.vote.reels.values()]).toEqual([1]);
    expect(jeu.vote.reels.size).toBe(1);
    expect(journal.lignes.filter((e) => e.e === 'vote_reel')).toEqual([{ e: 'vote_reel', numero: 3, pseudo: 'Alice', index: 1 }]);
    expect(de(chat.ws, 'vote.pop').filter((m) => m.pseudo === 'Alice')).toHaveLength(1);
    expect(de(tel.ws, 'vote').at(-1)).toMatchObject({ etat: 'compte', choisi: 1 });
  });

  it('vueVote renvoie choisi seulement pour les clients qui ont voté', () => {
    const regie = connecter(jeu, 'regie', { jeton: 'secret' });
    const a = connecter(jeu, 'telephone', { pseudo: 'Alice' });
    const b = connecter(jeu, 'telephone', { pseudo: 'Bob' });
    const k = connecter(jeu, 'telephone', { pseudo: 'Chloe' });
    jeu.recevoir(regie.c, JSON.stringify({ t: 'vote.cmd', cmd: 'ouvrir', numero: 3 }));
    jeu.recevoir(a.c, JSON.stringify({ t: 'vote.choix', numero: 3, index: 1 }));
    jeu.recevoir(b.c, JSON.stringify({ t: 'vote.choix', numero: 3, index: 2 }));
    expect(jeu.vueVote('telephone', a.c).choisi).toBe(1);
    expect(jeu.vueVote('telephone', b.c).choisi).toBe(2);
    expect(jeu.vueVote('telephone', k.c)).not.toHaveProperty('choisi');
  });

  it('vote.cmd reveler : etat revele, pourcents (somme ~100) et resultat pour le mur', () => {
    const regie = connecter(jeu, 'regie', { jeton: 'secret' });
    const tel = connecter(jeu, 'telephone', { pseudo: 'Alice' });
    const chat = connecter(jeu, 'chat');
    jeu.recevoir(regie.c, JSON.stringify({ t: 'vote.cmd', cmd: 'ouvrir', numero: 3 }));
    jeu.recevoir(regie.c, JSON.stringify({ t: 'vote.cmd', cmd: 'reveler' }));
    expect(jeu.vote.etat).toBe('revele');
    expect(jeu.vote.comptes).toEqual([40, 10, 30, 20]);
    const vc = de(chat.ws, 'vote').at(-1);
    expect(vc).toMatchObject({ etat: 'revele', resultat: 'A gagne', total: 100 });
    expect(Math.abs(vc.pourcents.reduce((x, y) => x + y, 0) - 100)).toBeLessThanOrEqual(1);
    const vt = de(tel.ws, 'vote').at(-1);
    expect(vt).toMatchObject({ etat: 'revele', resultat: 'A gagne' });
    expect(vt).not.toHaveProperty('comptes');
  });

  it('vote.cmd fermer : jeu.vote remis à null et vote {etat: ferme} diffusé', () => {
    const regie = connecter(jeu, 'regie', { jeton: 'secret' });
    const tel = connecter(jeu, 'telephone', { pseudo: 'Alice' });
    const chat = connecter(jeu, 'chat');
    jeu.recevoir(regie.c, JSON.stringify({ t: 'vote.cmd', cmd: 'ouvrir', numero: 3 }));
    jeu.recevoir(regie.c, JSON.stringify({ t: 'vote.cmd', cmd: 'fermer' }));
    expect(jeu.vote).toBeNull();
    expect(de(chat.ws, 'vote').at(-1)).toEqual({ t: 'vote', etat: 'ferme' });
    expect(de(tel.ws, 'vote').at(-1)).toEqual({ t: 'vote', etat: 'ferme' });
    expect(journal.lignes.some((e) => e.e === 'vote_fin' && e.numero === 3)).toBe(true);
  });

  it('choix.reponse : la regie reçoit choix.stat avec les compteurs après deux réponses différentes', () => {
    const regie = connecter(jeu, 'regie', { jeton: 'secret' });
    const a = connecter(jeu, 'telephone', { pseudo: 'Alice' });
    const b = connecter(jeu, 'telephone', { pseudo: 'Bob' });
    jeu.recevoir(a.c, JSON.stringify({ t: 'choix.reponse', choix: 'abonne', texte: "je m'abonne" }));
    jeu.recevoir(b.c, JSON.stringify({ t: 'choix.reponse', choix: 'desabonne', texte: "je m'en vais" }));
    const stats = de(regie.ws, 'choix.stat');
    // le premier choix.stat part au hello de la régie (compteurs à zéro), puis un par réponse
    expect(stats).toHaveLength(3);
    expect(stats[0]).toEqual({ t: 'choix.stat', abonne: 0, desabonne: 0 });
    expect(stats[1]).toEqual({ t: 'choix.stat', abonne: 1, desabonne: 0 });
    expect(stats[2]).toEqual({ t: 'choix.stat', abonne: 1, desabonne: 1 });
    const chats = de(a.ws, 'chat');
    expect(chats).toHaveLength(2);
    expect(chats[0]).toMatchObject({ t: 'chat', pseudo: 'Alice', texte: "✅ abonné · je m'abonne", grand: true });
    expect(chats[1]).toMatchObject({ t: 'chat', pseudo: 'Bob', texte: "🚫 désabonné · je m'en vais" });
  });

  it("un msg de telephone avec un cseq déjà vu ne produit qu'un seul chat diffusé", () => {
    const tel = connecter(jeu, 'telephone', { pseudo: 'Alice' });
    const chat = connecter(jeu, 'chat');
    const msg = { t: 'msg', cseq: 7, texte: 'bonsoir' };
    jeu.recevoir(tel.c, JSON.stringify(msg));
    jeu.recevoir(tel.c, JSON.stringify(msg));
    const chats = de(chat.ws, 'chat');
    expect(chats).toHaveLength(1);
    expect(chats[0]).toMatchObject({ t: 'chat', pseudo: 'Alice', texte: 'bonsoir', grand: true });
    expect(journal.lignes.some((e) => e.e === 'msg_doublon' && e.cseq === 7)).toBe(true);
    jeu.recevoir(tel.c, JSON.stringify({ t: 'msg', cseq: 8, texte: 'encore un mot' }));
    expect(de(chat.ws, 'chat')).toHaveLength(2);
  });
});
