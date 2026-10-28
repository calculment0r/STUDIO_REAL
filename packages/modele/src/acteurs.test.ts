import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CATALOGUE_ACTEURS, TYPES_ACTEUR, acteursEcho, cibleDansFoule, commandesVersEnvois, creerActeur, envoisDeLEtape,
  envoisPasses, personneConcernee, resoudreParams, vueActeur, vuesDesActeurs,
} from './acteurs';
import { lireSignalActeur, nomSignalActeur, signauxDuProjet } from './conditions';
import { creerLecteur, simuler } from './lecteur';
import { chargerFichier, validerProjet } from './valider';
import type { Lecteur } from './moteur';
import type { Acteur, Envoi, Projet } from './types';
import { etape, moment, projet, sig, sortie } from './aides-test';

/** Avance le lecteur de n secondes, seconde par seconde. */
const avancer = (L: Lecteur, n: number) => { for (let i = 0; i < n; i++) L.avancer(1, sig()); return L.etat(); };

const ACTEURS: Acteur[] = [
  creerActeur('ecran', 'scene', 'Écran scène'),
  creerActeur('public', 'public'),
  creerActeur('telephone', 'ministre', 'Téléphone de la ministre'),
];

/** Un moment de trois étapes de 10 s enchaînées a → b → c, avec les envois donnés. */
function troisEtapes(envois: { a?: Envoi[]; b?: Envoi[]; c?: Envoi[] }, extra: Partial<Projet> = {}): Projet {
  return projet([moment('m', [
    etape('a', 10, 'k:scene', envois.a ? { envois: envois.a } : {}),
    etape('b', 10, 'k:scene', envois.b ? { envois: envois.b } : {}),
    etape('c', 10, 'k:scene', envois.c ? { envois: envois.c } : {}),
  ], [sortie('a', 'b'), sortie('b', 'c'), sortie('c', '')])], { acteurs: ACTEURS, ...extra });
}

describe('catalogue des acteurs', () => {
  it('9 types (6 types, 4 genres d’agents), clés uniques, écrans et signaux par défaut', () => {
    expect(CATALOGUE_ACTEURS).toHaveLength(9);
    expect(new Set(CATALOGUE_ACTEURS.map(m => m.cle)).size).toBe(9);
    expect(new Set(CATALOGUE_ACTEURS.map(m => m.type))).toEqual(new Set(TYPES_ACTEUR));
    for (const m of CATALOGUE_ACTEURS) {
      expect(m.ecrans.length).toBeGreaterThan(0);
      expect(m.signaux.length).toBeGreaterThan(0);
    }
    expect(CATALOGUE_ACTEURS.find(m => m.cle === 'ecran')!.ecrans).toEqual(expect.arrayContaining(['noir', 'accueil-qr', 'mur', 'visio']));
  });

  it('creerActeur part du catalogue ; une clé inconnue est refusée', () => {
    const f = creerActeur('agent:figurants', 'figurants');
    expect(f).toMatchObject({ id: 'figurants', type: 'agent', agent: { genre: 'figurants' }, ecrans: ['figurants.cmd'], signaux: ['say', 'stat'] });
    expect(creerActeur('public', 'public').cardinalite).toBe('n');
    expect(() => creerActeur('lune', 'x')).toThrow(/inconnu/);
  });
});

describe('cibles dans la foule', () => {
  it('lit les formes connues', () => {
    expect(cibleDansFoule('public')).toEqual({ acteur: 'public', filtre: null });
    expect(cibleDansFoule('public:tous')).toEqual({ acteur: 'public', filtre: null });
    expect(cibleDansFoule('public:ont-vote:A')).toEqual({ acteur: 'public', filtre: { genre: 'ont-vote', reponse: 'A' } });
    expect(cibleDansFoule('public:ont-vote:B:q2')).toEqual({ acteur: 'public', filtre: { genre: 'ont-vote', reponse: 'B', question: 'q2' } });
    expect(cibleDansFoule('public:sans-reponse')).toEqual({ acteur: 'public', filtre: { genre: 'sans-reponse' } });
    expect(cibleDansFoule('public:aleatoire:3')).toEqual({ acteur: 'public', filtre: { genre: 'aleatoire', n: 3 } });
    expect(cibleDansFoule('public:groupe:rouges')).toEqual({ acteur: 'public', filtre: { genre: 'groupe', nom: 'rouges' } });
    expect(cibleDansFoule('public:personne:tel_8f3a')).toEqual({ acteur: 'public', filtre: { genre: 'personne', id: 'tel_8f3a' } });
  });

  it('refuse les cibles illisibles', () => {
    for (const x of ['', 'pub lic', 'scene.fin', 'public:aleatoire:0', 'public:aleatoire:x', 'public:ont-vote', 'public:lune:3',
      'public:groupe:a:b', 'public:ont-vote:A:q1:z', 42, null, undefined])
      expect(cibleDansFoule(x), String(x)).toBeNull();
  });

  it('personneConcernee : vote, sans réponse, tirage, groupe, personne', () => {
    const foule = { personne: 'tel_1', votes: { q1: 'A' }, dernierVote: 'A', groupes: ['Rouges'], tirages: ['m/a#0@0'] };
    const f = (v: string) => cibleDansFoule(v)!.filtre;
    expect(personneConcernee(f('public:ont-vote:a'), foule)).toBe(true);
    expect(personneConcernee(f('public:ont-vote:B'), foule)).toBe(false);
    expect(personneConcernee(f('public:ont-vote:A:q1'), foule)).toBe(true);
    expect(personneConcernee(f('public:sans-reponse:q2'), foule)).toBe(true);
    expect(personneConcernee(f('public:sans-reponse'), foule)).toBe(false);
    expect(personneConcernee(f('public:aleatoire:3'), foule, 'm/a#0@0')).toBe(true);
    expect(personneConcernee(f('public:aleatoire:3'), foule, 'm/b#0@1')).toBe(false);
    expect(personneConcernee(f('public:groupe:rouges'), foule)).toBe(true);
    expect(personneConcernee(f('public:personne:tel_2'), foule)).toBe(false);
    expect(personneConcernee(f('public:ont-vote:A'), undefined)).toBe(false);
    expect(personneConcernee(null, undefined)).toBe(true);
  });
});

describe('envois d’une étape', () => {
  const st = etape('a', 30, 'k:scene', {
    params: { question: 'Qui ?', reponses: ['X', 'Y'] },
    envois: [
      { vers: 'public', ecran: 'regardez', quand: { apres: 10 } },
      { vers: 'scene', ecran: 'noir', quand: 'sortie' },
      { vers: 'public', ecran: 'vote', params: { question: '$question', reponses: '$reponses', numero: 1, note: '$absent' } },
      { vers: 'scene', fx: 'flash', quand: { apres: 5 } },
    ],
  });

  it('ordre d’envoi : entrée, délais croissants, sortie', () => {
    expect(envoisDeLEtape(st, 0).map(e => e.ecran ?? e.fx)).toEqual(['vote']);
    expect(envoisDeLEtape(st, 7).map(e => e.ecran ?? e.fx)).toEqual(['vote', 'flash']);
    expect(envoisDeLEtape(st, 12).map(e => e.ecran ?? e.fx)).toEqual(['vote', 'flash', 'regardez']);
    expect(envoisDeLEtape(st, 12, true).map(e => e.ecran ?? e.fx)).toEqual(['vote', 'flash', 'regardez', 'noir']);
  });

  it('resoudreParams lit les « $nom » dans les params de l’étape', () => {
    expect(resoudreParams(st.envois![2]!.params, st)).toEqual({ question: 'Qui ?', reponses: ['X', 'Y'], numero: 1, note: '$absent' });
    expect(resoudreParams(undefined, st)).toEqual({});
  });
});

describe('vueActeur', () => {
  it('héritage d’écran sur un parcours de 3 étapes', () => {
    const p = troisEtapes({
      a: [{ vers: 'scene', ecran: 'mur' }, { vers: 'public', ecran: 'vote', params: { numero: 1 } }],
      b: [{ vers: 'public', ecran: 'regardez' }],
    });
    const L = creerLecteur(p, { mode: 'repetition' });
    let e = avancer(L, 3);
    expect(e.etape).toBe('a');
    expect(vueActeur(p, e, 'scene')).toMatchObject({ ecran: 'mur', etape: 'a', depuis: 0, tenue: true });
    expect(vueActeur(p, e, 'public')).toMatchObject({ ecran: 'vote', params: { numero: 1 } });
    e = avancer(L, 10);
    expect(e.etape).toBe('b');
    expect(vueActeur(p, e, 'scene')!.ecran).toBe('mur');
    expect(vueActeur(p, e, 'public')).toMatchObject({ ecran: 'regardez', etape: 'b', depuis: 10 });
    e = avancer(L, 10);
    expect(e.etape).toBe('c');
    expect(vueActeur(p, e, 'scene')).toMatchObject({ ecran: 'mur', etape: 'a' });
    expect(vueActeur(p, e, 'public')!.ecran).toBe('regardez');
    expect(vueActeur(p, e, 'ministre')).toBeNull();
    e = avancer(L, 15);
    expect(e.termine).toBe(true);
    expect(vueActeur(p, e, 'scene')!.ecran).toBe('mur');
  });

  it('tenir: false : écran le temps de l’étape, puis retour au dernier écran tenu', () => {
    const p = troisEtapes({
      a: [{ vers: 'public', ecran: 'vote' }],
      b: [{ vers: 'public', ecran: 'notification', params: { texte: 'Vous êtes modérateur' }, tenir: false }],
    });
    const L = creerLecteur(p, { mode: 'repetition' });
    let e = avancer(L, 12);
    expect(vueActeur(p, e, 'public')).toMatchObject({ ecran: 'notification', tenue: false });
    e = avancer(L, 10);
    expect(e.etape).toBe('c');
    expect(vueActeur(p, e, 'public')).toMatchObject({ ecran: 'vote', etape: 'a', tenue: true });
  });

  it('quand: { apres } part pendant l’étape, et jamais si l’étape finit avant', () => {
    const p = troisEtapes({
      a: [{ vers: 'public', ecran: 'vote' }, { vers: 'public', ecran: 'regardez', quand: { apres: 5 } }, { vers: 'scene', ecran: 'noir', quand: { apres: 30 } }],
    });
    const L = creerLecteur(p, { mode: 'repetition' });
    let e = avancer(L, 3);
    expect(vueActeur(p, e, 'public')!.ecran).toBe('vote');
    e = avancer(L, 3);
    expect(vueActeur(p, e, 'public')).toMatchObject({ ecran: 'regardez', depuis: 5 });
    e = avancer(L, 10);
    expect(e.etape).toBe('b');
    expect(vueActeur(p, e, 'scene')).toBeNull();
  });

  it('quand: sortie part quand on quitte l’étape', () => {
    const p = troisEtapes({ a: [{ vers: 'scene', ecran: 'mur' }, { vers: 'scene', ecran: 'noir', quand: 'sortie' }] });
    const L = creerLecteur(p, { mode: 'repetition' });
    let e = avancer(L, 5);
    expect(vueActeur(p, e, 'scene')!.ecran).toBe('mur');
    e = avancer(L, 6);
    expect(e.etape).toBe('b');
    expect(vueActeur(p, e, 'scene')).toMatchObject({ ecran: 'noir', depuis: 10, etape: 'a' });
  });

  it('pendant un passage « go » l’acteur garde son écran ; le top relance', () => {
    const p = projet([
      moment('m1', [etape('a', 10, 'k:scene', { envois: [{ vers: 'scene', ecran: 'accueil-qr' }] })], [sortie('a', '')], { mode: 'go', g: [] }),
      moment('m2', [etape('b', 10, 'k:scene', { envois: [{ vers: 'scene', ecran: 'mur' }] })], [sortie('b', '')]),
    ], { acteurs: ACTEURS });
    const L = creerLecteur(p, { mode: 'repetition' });
    let e = avancer(L, 20);
    expect(e.attenteGo).toBe(true);
    expect(vueActeur(p, e, 'scene')!.ecran).toBe('accueil-qr');
    e = L.top();
    expect(vueActeur(p, e, 'scene')).toMatchObject({ ecran: 'mur', moment: 'm2' });
  });

  it('envoi ciblé dans la foule : vue commune sans contexte, vue ciblée pour les personnes concernées', () => {
    const p = troisEtapes({
      a: [{ vers: 'public', ecran: 'vote' }],
      b: [{ vers: 'public:ont-vote:A', ecran: 'couleur', params: { couleur: 'rouge' } }],
    });
    const L = creerLecteur(p, { mode: 'repetition' });
    const e = avancer(L, 12);
    expect(vueActeur(p, e, 'public')!.ecran).toBe('vote');
    expect(vueActeur(p, e, 'public', { dernierVote: 'A' })).toMatchObject({ ecran: 'couleur', vers: 'public:ont-vote:A' });
    expect(vueActeur(p, e, 'public', { dernierVote: 'B' })!.ecran).toBe('vote');
  });

  it('acteur inconnu du projet → null ; projet sans acteurs déclarés : calcul quand même', () => {
    const p = troisEtapes({ a: [{ vers: 'scene', ecran: 'mur' }] });
    const e = avancer(creerLecteur(p, { mode: 'repetition' }), 2);
    expect(vueActeur(p, e, 'lune')).toBeNull();
    const nu: Projet = { ...p, acteurs: undefined };
    expect(vueActeur(nu, e, 'scene')!.ecran).toBe('mur');
  });

  it('pure et déterministe ; params résolus ; clé stable ; vues de tous les acteurs', () => {
    const p = troisEtapes({ a: [{ vers: 'public', ecran: 'vote', params: { question: '$question' } }] });
    p.ev[0]!.st[0]!.params = { question: 'Je trouve ça dur ?' };
    const e = avancer(creerLecteur(p, { mode: 'repetition' }), 2);
    const copie = JSON.parse(JSON.stringify(e));
    const v1 = vueActeur(p, e, 'public');
    expect(vueActeur(p, e, 'public')).toEqual(v1);
    expect(e).toEqual(copie);
    expect(v1).toMatchObject({ params: { question: 'Je trouve ça dur ?' }, cle: 'm/a#0@0' });
    expect(vuesDesActeurs(p, e)).toEqual({ scene: null, public: v1, ministre: null });
    expect(envoisPasses(p, e)).toHaveLength(1);
  });
});

describe('signaux des acteurs', () => {
  it('convention acteur.signal et signauxDuProjet', () => {
    expect(nomSignalActeur('ministre', 'present')).toBe('ministre.present');
    expect(lireSignalActeur('scene.fin-video')).toEqual({ acteur: 'scene', signal: 'fin-video' });
    expect(lireSignalActeur('go')).toBeNull();
    expect(lireSignalActeur('.x')).toBeNull();
    const l = signauxDuProjet({ acteurs: acteursEcho() });
    expect(l.map(s => s.nom)).toContain('ministre.raccroche');
    expect(l.find(s => s.nom === 'scene.fin-video')).toEqual({ nom: 'scene.fin-video', acteur: 'scene', signal: 'fin-video', acteurNom: 'Écran scène' });
    expect(signauxDuProjet({})).toEqual([]);
  });
});

describe('commandesVersEnvois (prototype d’Écho → envois)', () => {
  it('question : le mur montre le vote ouvert, le public vote, la ministre compte', () => {
    expect(commandesVersEnvois([{ t: 'ecran', mode: 'mur' }, { t: 'vote.cmd', cmd: 'ouvrir', numero: 3 }])).toEqual([
      { vers: 'scene', ecran: 'mur', params: { vote: 'ouvert', numero: 3 } },
      { vers: 'public', ecran: 'vote', params: { numero: 3 } },
      { vers: 'ministre', ecran: 'vote-compteur', params: { numero: 3 } },
    ]);
  });

  it('entrée du public : QR sur scène, « Regardez la vidéo » sur les téléphones, vote fermé (le QR reste)', () => {
    expect(commandesVersEnvois([{ t: 'tel.cmd', mode: 'video' }, { t: 'ecran', mode: 'qr' }, { t: 'vote.cmd', cmd: 'fermer' }], 'accueil-qr')).toEqual([
      { vers: 'scene', ecran: 'accueil-qr' },
      { vers: 'public', ecran: 'regardez', params: { texte: 'Regardez la vidéo' } },
      { vers: 'ministre', ecran: 'veille' },
    ]);
  });

  it('la sortie l’emporte sur la commande `ecran` (visio), sauf la page du mur qui la suit', () => {
    const visio = commandesVersEnvois([{ t: 'vote.cmd', cmd: 'fermer' }, { t: 'ecran', mode: 'noir' }, { t: 'tel.cmd', mode: 'scene' }],
      { type: 'page', url: 'https://x.trycloudflare.com/prototypes/figurants/pages/visio/scene.html' });
    expect(visio[0]).toEqual({ vers: 'scene', ecran: 'visio', params: { postes: ['franck', 'ministre'], son: { franck: false, ministre: true } } });
    expect(visio[1]).toEqual({ vers: 'public', ecran: 'regardez', params: { texte: 'Regardez la scène' } });
    const mur = { type: 'page', url: 'https://x/prototypes/figurants/pages/chat/' };
    expect(commandesVersEnvois([{ t: 'ecran', mode: 'noir' }], mur)).toEqual([{ vers: 'scene', ecran: 'noir' }]);
    expect(commandesVersEnvois([], mur)).toEqual([{ vers: 'scene', ecran: 'mur' }]);
    expect(commandesVersEnvois(undefined, { type: 'page', url: 'https://x/prototypes/figurants/pages/flux/' })).toEqual([{ vers: 'scene', ecran: 'flux-video' }]);
    expect(commandesVersEnvois([{ t: 'inconnu' }, 'pas un objet'])).toEqual([]);
  });

  it('Junon et le président : audio sur le mur, segment des figurants, téléphones', () => {
    expect(commandesVersEnvois([{ t: 'junon', cmd: 'lancer' }, { t: 'ecran', mode: 'mur' }])).toEqual([
      { vers: 'scene', ecran: 'mur', params: { audio: 'junon_discours.mp3', commentaires: 'junon' } },
      { vers: 'public', ecran: 'regardez', params: { texte: 'Regardez la scène' } },
      { vers: 'figurants', ecran: 'figurants.cmd', params: { segment: 'junon' } },
    ]);
    const p = commandesVersEnvois([{ t: 'junon', cmd: 'president' }]);
    expect(p).toEqual([{ vers: 'scene', ecran: 'mur', params: { audio: 'president_boilot_speech.mp3' } }, { vers: 'public', ecran: 'image-onde' }]);
    expect(commandesVersEnvois([{ t: 'tel.cmd', mode: 'notif' }])).toEqual([
      { vers: 'public', ecran: 'notification', fx: 'vibrer', params: { texte: 'Vous êtes désormais modérateur', motif: [200, 100, 200] } },
    ]);
  });

  it('Écho simple complet : chaque étape à cmds donne des envois, b5_q1 vote n° 1, le projet converti est valide et se joue', () => {
    const chemin = fileURLToPath(new URL('../../../projets/echo/echo.conducteur.json', import.meta.url));
    const p = chargerFichier(readFileSync(chemin, 'utf8')).project;
    let avecCmds = 0;
    for (const m of p.ev) for (const st of m.st) {
      const cmds = st.params?.cmds;
      const envois = commandesVersEnvois(cmds, st.params?.sortie);
      if (Array.isArray(cmds)) {
        avecCmds++;
        expect(envois.length, `${m.id}/${st.id}`).toBeGreaterThan(0);
      }
      if (envois.length) {
        st.envois = envois;
        const { cmds: _c, sortie: _s, ...reste } = st.params ?? {};
        st.params = reste;
      }
    }
    expect(avecCmds).toBe(16);
    const q1 = p.ev.find(m => m.id === 'b5_q1')!.st[0]!.envois!;
    expect(q1).toContainEqual({ vers: 'public', ecran: 'vote', params: { numero: 1 } });

    p.acteurs = acteursEcho();
    const pb = validerProjet(p);
    expect(pb.filter(x => x.niveau === 'erreur')).toEqual([]);
    expect(pb.map(x => x.code).filter(c => c.startsWith('envoi') || c === 'cmds-a-convertir')).toEqual([]);

    // Toute la soirée jouée (un top à chaque passage) : au dernier moment, le mur joue le discours du président.
    const { etat } = simuler(p);
    expect(etat.termine).toBe(true);
    expect(vueActeur(p, etat, 'scene')).toMatchObject({ ecran: 'mur', params: { audio: 'president_boilot_speech.mp3' } });
    expect(vueActeur(p, etat, 'public')).toMatchObject({ ecran: 'regardez', params: { texte: 'Regardez la scène' } });
    expect(vueActeur(p, etat, 'ministre')!.ecran).toBe('veille');
  });
});
