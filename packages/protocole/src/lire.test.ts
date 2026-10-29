import { describe, expect, it } from 'vitest';
import { LIMITES, OPS_CONDUITE, TYPES_CLIENT, TYPES_SERVEUR, VERSION_PROTOCOLE } from './spectacle';
import { lireMessageClient, lireMessageServeur, messageVue } from './lire';

const SESSION = 'onglet_7f3a';
const ok = (x: unknown) => {
  const r = lireMessageClient(x);
  expect(r.raison).toBeUndefined();
  return r.message!;
};
const refus = (x: unknown) => {
  const r = lireMessageClient(x);
  expect(r.message).toBeNull();
  return r.raison!;
};
const okS = (x: unknown) => {
  const r = lireMessageServeur(x);
  expect(r.raison).toBeUndefined();
  return r.message!;
};
const refusS = (x: unknown) => {
  const r = lireMessageServeur(x);
  expect(r.message).toBeNull();
  return r.raison!;
};

describe('lireMessageClient', () => {
  it('hello v2 : acteur du public, reprise, version de l’app et capacités (ex `bonjour` des sorties)', () => {
    const m = ok(JSON.stringify({
      t: 'hello', v: 2, role: 'acteur', acteur: 'public', personne: 'tel_8f3a', session: SESSION, jeton: 'j.abc-123',
      vseq: 17, cseq: 41, app: { version: '2.0.0', build: 'a1b2c3' }, capacites: ['video', 'vibrer'], inconnu: 'ignoré',
    }));
    expect(m).toEqual({
      t: 'hello', v: 2, role: 'acteur', acteur: 'public', personne: 'tel_8f3a', session: SESSION, jeton: 'j.abc-123',
      vseq: 17, cseq: 41, app: { version: '2.0.0', build: 'a1b2c3' }, capacites: ['video', 'vibrer'],
    });
    expect(VERSION_PROTOCOLE).toBe(2);
  });

  it('hello : pseudo du téléphone du public (2 à 20 caractères)', () => {
    const base = { t: 'hello', v: 2, role: 'acteur', acteur: 'public', session: SESSION, jeton: 'j' };
    expect(ok({ ...base, pseudo: 'lea_42' })).toMatchObject({ pseudo: 'lea_42' });
    expect(lireMessageClient({ ...base, pseudo: 'x' }).raison).toMatch(/pseudo/);
    expect(lireMessageClient({ ...base, pseudo: 'x'.repeat(21) }).raison).toMatch(/pseudo/);
  });

  it('hello refusé : version, rôle, acteur manquant, session, jeton', () => {
    const base = { t: 'hello', v: 2, role: 'regie', session: SESSION, jeton: 'j' };
    expect(ok(base)).toEqual(base);
    expect(refus({ ...base, v: 1 })).toMatch(/^version/);
    expect(refus({ ...base, role: 'poste' })).toMatch(/^champ-invalide : role/);
    expect(refus({ ...base, role: 'agent' })).toMatch(/acteur : obligatoire/);
    expect(refus({ ...base, role: 'acteur', acteur: 'scene.x' })).toMatch(/acteur/);
    expect(refus({ ...base, session: 'abc' })).toMatch(/session/);
    expect(refus({ ...base, jeton: 'a b' })).toMatch(/jeton/);
  });

  it('conduite : chaque op valide', () => {
    const c = (o: Record<string, unknown>) => ok({ t: 'conduite', cseq: 9, ...o });
    expect(c({ op: 'top' })).toEqual({ t: 'conduite', cseq: 9, op: 'top' });
    expect(c({ op: 'lancer', mode: 'scene', graine: 42 })).toMatchObject({ op: 'lancer', mode: 'scene', graine: 42 });
    expect(c({ op: 'pause' })).toMatchObject({ op: 'pause', pause: true });
    expect(c({ op: 'allerA', moment: 'b5_q1', etape: 'b5_q1_s' })).toMatchObject({ moment: 'b5_q1', etape: 'b5_q1_s' });
    expect(c({ op: 'reprendre' })).toEqual({ t: 'conduite', cseq: 9, op: 'reprendre' });
    expect(c({ op: 'poser', nom: 'missions', valeur: 3 })).toMatchObject({ nom: 'missions', valeur: 3 });
    expect(c({ op: 'signal', nom: 'go.story', donnees: { valeur: 1 } })).toMatchObject({ nom: 'go.story', donnees: { valeur: 1 } });
    expect(c({ op: 'forcer', acteur: 'scene', vue: { ecran: 'noir' } })).toMatchObject({ acteur: 'scene', vue: { ecran: 'noir' } });
    expect(c({ op: 'forcer', acteur: 'public:ont-vote:A', vue: { ecran: 'couleur', params: { couleur: 'rouge' } } })).toMatchObject({ acteur: 'public:ont-vote:A' });
    expect(c({ op: 'panique' })).toMatchObject({ op: 'panique', actif: true });
    expect(c({ op: 'valider', id: 'r12', ok: false, texte: 'corrigé' })).toMatchObject({ id: 'r12', ok: false, texte: 'corrigé' });
    expect(c({ op: 'retenir' })).toEqual({ t: 'conduite', cseq: 9, op: 'retenir', actif: true });
    expect(c({ op: 'retenir', actif: false })).toMatchObject({ op: 'retenir', actif: false });
    expect(c({ op: 'prolonger', secondes: 30 })).toEqual({ t: 'conduite', cseq: 9, op: 'prolonger', secondes: 30 });
    expect(OPS_CONDUITE).toHaveLength(12);
  });

  it('conduite refusée : cseq, op inconnue, mémoire objet, cible illisible', () => {
    expect(refus({ t: 'conduite', cseq: 0, op: 'top' })).toMatch(/^champ-invalide : cseq/);
    expect(refus({ t: 'conduite', cseq: 1, op: 'sauter' })).toMatch(/op/);
    expect(refus({ t: 'conduite', cseq: 1, op: 'poser', nom: 'x', valeur: { a: 1 } })).toMatch(/valeur/);
    expect(refus({ t: 'conduite', cseq: 1, op: 'forcer', acteur: 'public:lune', vue: { ecran: 'noir' } })).toMatch(/acteur/);
    expect(refus({ t: 'conduite', cseq: 1, op: 'allerA' })).toMatch(/moment/);
    expect(refus({ t: 'conduite', cseq: 1, op: 'retenir', actif: 'oui' })).toMatch(/actif/);
    expect(refus({ t: 'conduite', cseq: 1, op: 'prolonger' })).toMatch(/secondes/);
    expect(refus({ t: 'conduite', cseq: 1, op: 'prolonger', secondes: 0 })).toMatch(/secondes/);
    expect(refus({ t: 'conduite', cseq: 1, op: 'prolonger', secondes: 601 })).toMatch(/secondes/);
    expect(refus({ t: 'conduite', cseq: 1, op: 'prolonger', secondes: 'trente' })).toMatch(/secondes/);
  });

  it('in : vote, texte, réaction, prêt, présence, fin de vidéo, transcription, accusé d’affichage', () => {
    const i = (k: string, data: unknown, extra: Record<string, unknown> = {}) => ok({ t: 'in', cseq: 42, k, data, ...extra });
    expect(i('vote', { index: 2 }, { q: 'q1' })).toEqual({ t: 'in', cseq: 42, k: 'vote', q: 'q1', data: { index: 2 } });
    expect(i('texte', { texte: 'bravo' }, { heure: 1793000 })).toEqual({ t: 'in', cseq: 42, k: 'texte', data: { texte: 'bravo' }, heure: 1793000 });
    expect(i('reaction', { emoji: '😂', n: 3 })).toMatchObject({ data: { emoji: '😂', n: 3 } });
    expect(i('pret', {})).toMatchObject({ data: { pret: true } });
    expect(i('presence', { visible: false })).toMatchObject({ data: { visible: false } });
    expect(i('fin-video', { asset: 'zoom_junon.mp4', vseq: 18 })).toMatchObject({ data: { asset: 'zoom_junon.mp4', vseq: 18 } });
    expect(i('transcription', { texte: 'bonsoir', final: true })).toMatchObject({ data: { texte: 'bonsoir', final: true } });
    expect(i('accuse', { vseq: 18, affiche: 1793000123, refus: 'capacite' })).toMatchObject({ data: { vseq: 18, affiche: 1793000123, refus: 'capacite' } });
  });

  it('in refusé : genre inconnu, vote hors bornes, texte vide, accusé sans vseq', () => {
    expect(refus({ t: 'in', cseq: 1, k: 'danse', data: {} })).toMatch(/^champ-invalide : k/);
    expect(refus({ t: 'in', cseq: 1, k: 'vote', data: { index: 26 } })).toMatch(/data.index/);
    expect(refus({ t: 'in', cseq: 1, k: 'vote', data: { index: 1.5 } })).toMatch(/data.index/);
    expect(refus({ t: 'in', cseq: 1, k: 'texte', data: { texte: '   ' } })).toMatch(/vide/);
    expect(refus({ t: 'in', cseq: 1, k: 'accuse', data: { affiche: 1 } })).toMatch(/data.vseq/);
    expect(refus({ t: 'in', cseq: 1, k: 'texte' })).toMatch(/data/);
  });

  it('bornes : texte ≤ 2000, tableau ≤ 200, profondeur, clé interdite, message trop gros', () => {
    expect(ok({ t: 'in', cseq: 1, k: 'texte', data: { texte: 'x'.repeat(LIMITES.texte) } })).toBeTruthy();
    expect(refus({ t: 'in', cseq: 1, k: 'texte', data: { texte: 'x'.repeat(LIMITES.texte + 1) } })).toMatch(/^trop-long/);
    expect(ok({ t: 'agent.in', cseq: 1, k: 'say', data: { l: Array(200).fill(1) } })).toBeTruthy();
    expect(refus({ t: 'agent.in', cseq: 1, k: 'say', data: { l: Array(201).fill(1) } })).toMatch(/^trop-long : data.l/);
  });

  it('bornes : profondeur, clé interdite, message trop gros', () => {
    let profond: unknown = 1;
    for (let n = 0; n < 12; n++) profond = { a: profond };
    expect(refus({ t: 'agent.in', cseq: 1, k: 'say', data: profond })).toMatch(/^trop-profond/);
    expect(refus('{"t":"agent.in","cseq":1,"k":"say","data":{"__proto__":{"x":1}}}')).toMatch(/interdite/);
    expect(refus('x'.repeat(LIMITES.message + 1))).toMatch(/^trop-gros/);
  });

  it('etat (battement) : écran AFFICHÉ, médias, batterie', () => {
    const m = ok({
      t: 'etat', heure: 1793000, ecran: { vseq: 18, ecran: 'vote', cle: 'b5_q1/b5_q1_s#1@8', depuis: 1792990 }, visible: true,
      rttMs: 80, media: [{ asset: 'flux_insta_jim.mp4', pret: 0.5, lecture: 'attente' }], batterie: 64, erreurs: ['autoplay bloqué'],
    });
    expect(m).toMatchObject({ t: 'etat', ecran: { vseq: 18, ecran: 'vote' }, media: [{ pret: 0.5 }], batterie: 64 });
    expect(ok({ t: 'etat', heure: 1, ecran: null, visible: false })).toEqual({ t: 'etat', heure: 1, ecran: null, visible: false });
    expect(refus({ t: 'etat', heure: 1, ecran: null, visible: true, media: [{ asset: 'a', pret: 2, lecture: 'lit' }] })).toMatch(/pret/);
  });

  it('agents : agent.ack, agent.in', () => {
    expect(ok({ t: 'agent.ack', n: 57, statut: 'fait' })).toEqual({ t: 'agent.ack', n: 57, statut: 'fait' });
    expect(refus({ t: 'agent.ack', n: 0, statut: 'fait' })).toMatch(/n :/);
    expect(refus({ t: 'agent.ack', n: 3, statut: 'peut-être' })).toMatch(/statut/);
    expect(ok({ t: 'agent.in', cseq: 12, k: 'say', data: { persona: 'p_kev', texte: 'trop fort' } })).toMatchObject({ k: 'say' });
    expect(refus({ t: 'agent.in', cseq: 12, k: 'Say!', data: {} })).toMatch(/k :/);
  });

  it('ping, resync, rtc borné', () => {
    expect(ok({ t: 'ping', tc: 1793 })).toEqual({ t: 'ping', tc: 1793 });
    expect(ok({ t: 'resync' })).toEqual({ t: 'resync' });
    expect(ok({ t: 'rtc', vers: 'ministre', signal: { type: 'offre', sdp: 'v=0' } })).toMatchObject({ vers: 'ministre' });
    expect(refus({ t: 'rtc', vers: 'ministre', signal: { sdp: 'x'.repeat(LIMITES.rtc) } })).toMatch(/^trop-gros/);
  });

  it('JSON illisible, ancien type v1, pas un objet', () => {
    expect(refus('{pas du json')).toMatch(/^json-invalide/);
    expect(refus({ t: 'scene', message: {} })).toMatch(/^type-inconnu/);
    expect(refus([1, 2])).toMatch(/^message-invalide/);
    expect(TYPES_CLIENT).toHaveLength(9);
  });
});

describe('lireMessageServeur', () => {
  const vue = { acteur: 'public', vseq: 18, at: 1793000, ecran: 'vote', params: { question: 'Q', reponses: ['a', 'b'], numero: 1 }, cle: 'b5_q1/b5_q1_s#1@8' };

  it('bienvenue avec la vue courante, vue, fx', () => {
    expect(okS({ t: 'bienvenue', v: 2, role: 'acteur', acteur: 'public', session: SESSION, ts: 1793000, vue, cseq: 41 }))
      .toEqual({ t: 'bienvenue', v: 2, role: 'acteur', acteur: 'public', session: SESSION, ts: 1793000, vue, cseq: 41 });
    expect(okS({ t: 'vue', ...vue })).toEqual({ t: 'vue', ...vue });
    expect(okS({ t: 'vue', acteur: 'scene', vseq: 1, at: 0, ecran: null, params: {} })).toMatchObject({ ecran: null });
    expect(okS({ t: 'fx', acteur: 'public', id: 'x7:12', at: 1793000, kind: 'vibrer', p: { motif: [200, 100, 200] }, ttl: 2000 })).toMatchObject({ kind: 'vibrer' });
    expect(refusS({ t: 'fx', acteur: 'public', id: 'x', at: 0, kind: 'vibrer', p: {}, ttl: LIMITES.ttl + 1 })).toMatch(/ttl/);
    expect(refusS({ t: 'bienvenue', v: 1, role: 'acteur', session: SESSION, ts: 0, vue: null, cseq: 0 })).toMatch(/^version/);
  });

  it('lecture : forme contrôlée, journal long accepté', () => {
    const etat = { t: 12, moment: 'b5_q1', etape: 'b5_q1_s', tEtape: 2, parcours: [['b1_entree', 'b1_entree_s', 0]], journal: Array(500).fill({ t: 1 }) };
    expect(okS({ t: 'lecture', etat, par: 'serveur', ts: 1 })).toMatchObject({ t: 'lecture', par: 'serveur' });
    expect(refusS({ t: 'lecture', etat: { t: 'x' }, par: 'serveur', ts: 1 })).toMatch(/etat.t/);
  });

  it('salle (résumé pour la régie), agent.cmd', () => {
    expect(okS({ t: 'salle', ts: 1, acteurs: { public: { presents: 138, prets: 131 }, ministre: { presents: 1 } }, vote: { q: 'q1', recus: 121, parts: [41, 9, 37, 13] } }))
      .toMatchObject({ acteurs: { public: { presents: 138 } }, vote: { recus: 121 } });
    expect(okS({ t: 'agent.cmd', n: 57, type: 'figurants.cmd', etape: 'b5_q1_s', donnees: { densite: 'calme' } })).toMatchObject({ n: 57 });
  });

  it('salle pour le rail des sorties : vue demandée, écrans affichés, aller-retour médian', () => {
    const acteurs = {
      public: { presents: 124, prets: 100, enLigne: 122, demande: { vseq: 7, ecran: 'vote', at: 1793000, cle: 'b5_q1/b5_q1_s#1@8' }, parEcran: { vote: 118, noir: 4, '': 2 }, rttMs: 380 },
      scene: { presents: 0, demande: { vseq: 3, ecran: null, at: 1793000 } },
    };
    expect(okS({ t: 'salle', ts: 1, acteurs })).toEqual({ t: 'salle', ts: 1, acteurs });
    expect(refusS({ t: 'salle', ts: 1, acteurs: { public: { presents: 1, parEcran: { vote: -1 } } } })).toMatch(/parEcran/);
    expect(refusS({ t: 'salle', ts: 1, acteurs: { public: { presents: 1, demande: { ecran: 'vote', at: 1 } } } })).toMatch(/demande.vseq/);
  });

  it('etat relayé à la régie (acteur nommé) : ce qui est AFFICHÉ, latence, médias, erreurs, version', () => {
    const m = {
      t: 'etat', acteur: 'scene', personne: 'poste_projecteur', ts: 1793000, heure: 1792990,
      ecran: { vseq: 3, ecran: 'mur', cle: 'k', depuis: 1792900 }, visible: true, enLigne: true, rttMs: 38,
      media: [{ asset: 'clip.mp4', pret: 1, lecture: 'lit' }], erreurs: ['son bloqué'], app: { version: '0.1.0', build: 'abc1234' },
    };
    expect(okS(m)).toEqual(m);
    expect(okS({ t: 'etat', acteur: 'franck', ts: 1, heure: 1, ecran: null, visible: false })).toEqual({ t: 'etat', acteur: 'franck', ts: 1, heure: 1, ecran: null, visible: false });
    expect(refusS({ t: 'etat', acteur: 'scene', ts: 1, heure: 1, ecran: null })).toMatch(/visible/);
    expect(refusS({ t: 'etat', acteur: 'sc ène', ts: 1, heure: 1, ecran: null, visible: true })).toMatch(/acteur/);
  });

  it('ack, refus, pong, resync, rtc ; type client refusé côté serveur', () => {
    expect(okS({ t: 'ack', cseq: 42, statut: 'doublon' })).toEqual({ t: 'ack', cseq: 42, statut: 'doublon' });
    expect(refusS({ t: 'ack', cseq: 42, statut: 'conflit' })).toMatch(/statut/);
    expect(okS({ t: 'refus', code: 'jeton-invalide', message: 'Jeton refusé.', fatal: true })).toMatchObject({ fatal: true });
    expect(okS({ t: 'pong', tc: 1, ts: 2 })).toEqual({ t: 'pong', tc: 1, ts: 2 });
    expect(okS({ t: 'resync', raison: 'redemarrage' })).toEqual({ t: 'resync', raison: 'redemarrage' });
    expect(okS({ t: 'rtc', de: 'franck', vers: 'scene', signal: { type: 'ice' }, ts: 3 })).toMatchObject({ de: 'franck' });
    expect(refusS({ t: 'hello', v: 2 })).toMatch(/^type-inconnu/);
    expect(TYPES_SERVEUR).toHaveLength(12);
  });

  it('messageVue relie la Vue du modèle au message diffusé', () => {
    const v = { acteur: 'public', ecran: 'vote', params: { numero: 1 }, depuis: 60, moment: 'b5_q1', etape: 'b5_q1_s', vers: 'public', cle: 'k', tenue: true };
    const m = messageVue('public', v, 3, 1793000);
    expect(m).toEqual({ t: 'vue', acteur: 'public', vseq: 3, at: 1793000, ecran: 'vote', params: { numero: 1 }, cle: 'k' });
    expect(okS(m)).toEqual(m);
    expect(messageVue('scene', null, 1, 0)).toEqual({ t: 'vue', acteur: 'scene', vseq: 1, at: 0, ecran: null, params: {} });
  });
});
