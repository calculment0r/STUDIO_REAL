// Inspecteur des envois et acteurs du projet (logique pure) : schémas des réglages, champs du formulaire, hérite /
// change / inchangé, opérations sur les envois et les acteurs, conversion des commandes du prototype (Écho), prochain cue.
import { describe, expect, it } from 'vitest';
import {
  acteursEcho, chargerFichier, validerProjet, type Acteur, type Etape, type Moment, type Projet,
} from '@studio-real/modele';
import echo from '../../../../projets/echo/echo.conducteur.json';
import {
  aConvertir, ajouterActeur, ajouterConditionSignal, ajouterEnvoi, autresParams, cheminDansMoment, cleConfigInterdite,
  convertirEtape, convertirProjet, deplacerEnvoi, ecrireAutres, ecrireChamp, estReference, etatAvantEtape, idLibre, lignesActeurs,
  lireChamp, lireQuand, nbAConvertir, poserActeursEcho, poserQuand, prochainCue, problemesEtape, referencesEtape, renommerActeur,
  retirerEnvoi, schemaEcran, supprimerActeur, usagesActeur, vueDeLEnvoi, type ChampParam,
} from './envois';

const st = (id: string, extra: Partial<Etape> = {}): Etape => ({ id, name: id, ty: 'k:scene', c: 0, r: 0, dx: 0, dy: 0, k: [0, 50, 50], ...extra });
const moment = (id: string, etapes: Etape[], tr: Moment['tr'] = []): Moment => ({ id, act: 0, name: id, entry: etapes[0]!.id, st: etapes, tr, gate: { mode: 'go', g: [] } });
const projet = (ev: Moment[], acteurs: Acteur[] | null = acteursEcho()): Projet => ({
  acts: [{ n: 'Acte' }], ev, sens: { aff: 50, part: 50, calme: 50, pen: 50 }, hold: {}, go: {}, ver: 1, nid: 100, tracks: [], ...(acteurs ? { acteurs } : {}),
});
const ACTEURS = acteursEcho();
const acteur = (id: string) => ACTEURS.find(a => a.id === id)!;
const echoProjet = (): Projet => chargerFichier(structuredClone(echo)).project;

describe('schémas des réglages par écran', () => {
  it('le schéma dépend du genre d’acteur : même écran, réglages différents', () => {
    expect(schemaEcran(acteur('public'), 'vote').map(c => c.cle)).toEqual(['numero', 'question', 'reponses', 'etiquette']);
    expect(schemaEcran(acteur('scene'), 'vote').map(c => c.cle)).toEqual(['question', 'reponses', 'phase']);
    expect(schemaEcran(acteur('scene'), 'mur').map(c => c.cle)).toEqual(['vote', 'numero', 'scores', 'resultat', 'audio', 'commentaires']);
    expect(schemaEcran(acteur('ministre'), 'vote-compteur').find(c => c.cle === 'scores')?.genre).toBe('nombres');
    expect(schemaEcran(acteur('figurants'), 'figurants.cmd').find(c => c.cle === 'densite')?.choix).toContain('calme');
    expect(schemaEcran(acteur('public'), 'noir')).toEqual([]);
    expect(schemaEcran(acteur('public'), 'inconnu')).toEqual([]);
    expect(schemaEcran(acteur('public'), undefined)).toEqual([]);
  });

  it('les agents n’ont aucun champ de secret', () => {
    for (const e of ['appel', 'raccrocher', 'ecouter', 'machine', 'figurants.cmd'])
      for (const c of schemaEcran({ type: 'agent', rendu: 'externe' }, e)) expect(cleConfigInterdite(c.cle)).toBe(false);
  });
});

describe('champs du formulaire', () => {
  const nombre: ChampParam = { cle: 'numero', libelle: 'numéro', genre: 'nombre' };
  const liste: ChampParam = { cle: 'reponses', libelle: 'réponses', genre: 'liste' };
  const nombres: ChampParam = { cle: 'scores', libelle: 'scores', genre: 'nombres' };
  const ouiNon: ChampParam = { cle: 'revele', libelle: 'révélé', genre: 'oui-non' };
  const texte: ChampParam = { cle: 'question', libelle: 'question', genre: 'long' };

  it('lit chaque genre de valeur', () => {
    expect(lireChamp({ numero: 3 }, nombre)).toBe('3');
    expect(lireChamp({ reponses: ['A', 'B'] }, liste)).toBe('A\nB');
    expect(lireChamp({ scores: [41, 9] }, nombres)).toBe('41, 9');
    expect(lireChamp({ revele: true }, ouiNon)).toBe('oui');
    expect(lireChamp({}, texte)).toBe('');
    expect(lireChamp({ question: '$question' }, texte)).toBe('$question');
  });

  it('écrit sans toucher l’original, retire le réglage vide, garde « $nom »', () => {
    const p = { numero: 1, question: 'Q' };
    expect(ecrireChamp(p, nombre, '4')).toEqual({ numero: 4, question: 'Q' });
    expect(p).toEqual({ numero: 1, question: 'Q' });
    expect(ecrireChamp(p, nombre, '2,5')).toEqual({ numero: 2.5, question: 'Q' });
    expect(ecrireChamp(p, nombre, 'abc')).toEqual(p);                       // nombre illisible : inchangé
    expect(ecrireChamp(p, nombre, '$numero')).toEqual({ numero: '$numero', question: 'Q' });
    expect(ecrireChamp(p, texte, '  ')).toEqual({ numero: 1 });
    expect(ecrireChamp(undefined, liste, 'oui\n\n non \n')).toEqual({ reponses: ['oui', 'non'] });
    expect(ecrireChamp(undefined, nombres, '41, 9; 37 13')).toEqual({ scores: [41, 9, 37, 13] });
    expect(ecrireChamp(undefined, ouiNon, 'non')).toEqual({ revele: false });
    expect(ecrireChamp(undefined, texte, '$question')).toEqual({ question: '$question' });
  });

  it('références « $nom » et réglages hors schéma', () => {
    expect(estReference('$question')).toBe(true);
    expect(estReference('$ 3')).toBe(false);
    expect(estReference(3)).toBe(false);
    expect(referencesEtape(st('s', { params: { numero: 1, question: 'Q', cmds: [], reponses: ['a'], objet: { x: 1 } } }))).toEqual(['$numero', '$question', '$reponses']);
    const schema = schemaEcran(acteur('public'), 'vote');
    expect(autresParams({ numero: 1, puis: 'choix' }, schema)).toEqual({ puis: 'choix' });
    expect(ecrireAutres({ numero: 1, puis: 'choix' }, schema, '{"motif":[200]}')).toEqual({ params: { numero: 1, motif: [200] } });
    expect(ecrireAutres({ numero: 1 }, schema, '')).toEqual({ params: { numero: 1 } });
    expect(ecrireAutres({}, schema, '[1]')).toHaveProperty('erreur');
    expect(ecrireAutres({}, schema, '{')).toHaveProperty('erreur');
  });
});

describe('hérite / change / inchangé', () => {
  // m1 : q1 envoie au public l'écran vote, à la scène le mur ; res renvoie le même mur à la scène et rien au public.
  const m1 = moment('m1', [
    st('q1', { params: { numero: 1, question: 'Dur ?' }, envois: [{ vers: 'scene', ecran: 'mur' }, { vers: 'public', ecran: 'vote', params: { numero: '$numero', question: '$question' } }] }),
    st('res', { c: 1, envois: [{ vers: 'scene', ecran: 'mur' }, { vers: 'ministre', ecran: 'vote-compteur', params: { revele: true } }] }),
  ], [{ a: 'q1', b: 'res', g: [], mode: 'all' }]);
  const m2 = moment('m2', [st('fin', { envois: [{ vers: 'public', ecran: 'regardez', tenir: false }] }), st('apres', { c: 1 })], [{ a: 'fin', b: 'apres', g: [], mode: 'all' }]);
  const p = projet([m1, m2]);

  it('état avant une étape : parcours prévu des moments précédents puis chemin dans le moment', () => {
    expect(etatAvantEtape(p, 'm1', 'q1').parcours).toEqual([]);
    expect(etatAvantEtape(p, 'm1', 'res').parcours.map(x => x[1])).toEqual(['q1']);
    expect(etatAvantEtape(p, 'm2', 'fin').parcours.map(x => x[1])).toEqual(['q1', 'res']);
    expect(cheminDansMoment(m1, 'res')).toEqual(['q1', 'res']);
    expect(cheminDansMoment(m1, 'perdu')).toEqual(['perdu']);
  });

  it('au début rien n’est hérité ; une étape qui envoie « change »', () => {
    const L = lignesActeurs(p, 'm1', 'q1');
    expect(L.map(l => [l.acteur.id, l.statut])).toEqual([['public', 'change'], ['scene', 'change'], ['ministre', 'herite'], ['franck', 'herite'], ['eco', 'herite'], ['figurants', 'herite']]);
    expect(L.find(l => l.acteur.id === 'ministre')!.avant).toBeNull();
    expect(L.find(l => l.acteur.id === 'public')!.envois.map(x => x.index)).toEqual([1]);
  });

  it('un acteur sans envoi hérite de l’écran précédent (vueActeur, « $nom » résolu) ; renvoyer le même écran est « inchangé »', () => {
    const L = lignesActeurs(p, 'm1', 'res');
    const pub = L.find(l => l.acteur.id === 'public')!;
    expect(pub.statut).toBe('herite');
    expect(pub.avant).toMatchObject({ ecran: 'vote', params: { numero: 1, question: 'Dur ?' }, etape: 'q1' });
    expect(L.find(l => l.acteur.id === 'scene')!.statut).toBe('inchange');
    expect(L.find(l => l.acteur.id === 'ministre')!.statut).toBe('change');
  });

  it('un écran non tenu n’est plus hérité après son étape', () => {
    const L = lignesActeurs(p, 'm2', 'apres');
    expect(L.find(l => l.acteur.id === 'public')!.avant?.ecran).toBe('vote');
  });

  it('sans acteurs déclarés : aucune ligne', () => {
    expect(lignesActeurs(projet([m1], null), 'm1', 'q1')).toEqual([]);
  });

  it('vue d’un envoi pour l’aperçu (réglages résolus)', () => {
    expect(vueDeLEnvoi(m1.st[0]!.envois![1]!, m1.st[0]!)).toEqual({ ecran: 'vote', params: { numero: 1, question: 'Dur ?' } });
    expect(vueDeLEnvoi({ vers: 'public', fx: 'vibrer' }, m1.st[0]!)).toBeNull();
  });
});

describe('opérations sur les envois', () => {
  it('ajoute, monte, descend, retire ; la liste vide disparaît', () => {
    const e = st('e');
    expect(ajouterEnvoi(e, 'public', 'vote')).toBe(0);
    expect(ajouterEnvoi(e, 'scene', 'mur')).toBe(1);
    expect(deplacerEnvoi(e, 1, -1)).toBe(0);
    expect(e.envois!.map(x => x.vers)).toEqual(['scene', 'public']);
    expect(deplacerEnvoi(e, 0, -1)).toBe(0);      // au bord : inchangé
    retirerEnvoi(e, 0);
    retirerEnvoi(e, 0);
    expect(e.envois).toBeUndefined();
  });

  it('quand : entrée (clé retirée), sortie, n secondes après', () => {
    const x = { vers: 'public', ecran: 'vote' } as Parameters<typeof poserQuand>[0];
    poserQuand(x, 'apres', 12);
    expect(x.quand).toEqual({ apres: 12 });
    expect(lireQuand(x)).toEqual({ genre: 'apres', apres: 12 });
    poserQuand(x, 'sortie');
    expect(lireQuand(x).genre).toBe('sortie');
    poserQuand(x, 'entree');
    expect('quand' in x).toBe(false);
  });

  it('ajoute une condition « signal reçu » une seule fois', () => {
    const g: Moment['tr'][number]['g'] = [];
    expect(ajouterConditionSignal(g, 'ministre.raccroche')).toBe(true);
    expect(ajouterConditionSignal(g, 'ministre.raccroche')).toBe(false);
    expect(g).toEqual([{ k: 'sig:ministre.raccroche', op: '≥', v: 1 }]);
  });

  it('montre les erreurs de validation des envois de l’étape (acteur inconnu, écran inconnu, contradiction)', () => {
    const p = projet([moment('m', [st('s', { envois: [{ vers: 'personne', ecran: 'x' }, { vers: 'public', ecran: 'mur' }, { vers: 'scene', ecran: 'noir' }, { vers: 'scene', ecran: 'mur' }] })])]);
    const codes = problemesEtape(validerProjet(p), 'm', 's').map(x => x.code);
    expect(codes).toEqual(expect.arrayContaining(['envoi-acteur-inconnu', 'envoi-ecran-inconnu', 'envois-contradictoires']));
    expect(problemesEtape(validerProjet(p), 'm', 'autre')).toEqual([]);
  });
});

describe('acteurs du projet', () => {
  it('ajoute depuis le catalogue avec un identifiant libre', () => {
    const p = projet([moment('m', [st('s')])], []);
    expect(ajouterActeur(p, 'public')).toBe('public');
    expect(ajouterActeur(p, 'public')).toBe('public-2');
    expect(ajouterActeur(p, 'ecran')).toBe('scene');
    expect(ajouterActeur(p, 'agent:figurants')).toBe('figurants');
    expect(p.acteurs!.find(a => a.id === 'figurants')!.agent).toEqual({ genre: 'figurants' });
    expect(idLibre({ acteurs: [] }, 'un id avec espaces')).toBe('un-id-avec-espaces');
  });

  it('pose les acteurs d’Écho qui manquent, sans doublon', () => {
    const p = projet([moment('m', [st('s')])], [{ ...acteursEcho()[0]!, nom: 'Mon public' }]);
    expect(poserActeursEcho(p)).toBe(5);
    expect(p.acteurs!.map(a => a.id)).toEqual(['public', 'scene', 'ministre', 'franck', 'eco', 'figurants']);
    expect(p.acteurs![0]!.nom).toBe('Mon public');
    expect(poserActeursEcho(p)).toBe(0);
  });

  it('usages, suppression gardée, renommage qui suit envois et conditions', () => {
    const m = moment('m', [st('a', { envois: [{ vers: 'public:ont-vote:A', ecran: 'texte' }, { vers: 'ministre', ecran: 'veille' }] }), st('b', { c: 1 })],
      [{ a: 'a', b: 'b', g: [{ k: 'sig:ministre.raccroche', op: '≥', v: 1 }, { k: 'sigv:Ministre.present', op: '=', v: 1 }], mode: 'any' }]);
    const p = projet([m]);
    expect(usagesActeur(p, 'ministre')).toEqual({
      envois: [{ moment: 'm', etape: 'a', nom: 'a', index: 1 }],
      conditions: [{ moment: 'm', sortie: 0, k: 'sig:ministre.raccroche' }, { moment: 'm', sortie: 0, k: 'sigv:Ministre.present' }],
    });
    expect(supprimerActeur(p, 'ministre')).toMatch(/1 envoi vise encore cet acteur/);
    expect(p.acteurs!.some(a => a.id === 'ministre')).toBe(true);
    expect(supprimerActeur(p, 'eco')).toBeNull();
    expect(p.acteurs!.some(a => a.id === 'eco')).toBe(false);

    expect(renommerActeur(p, 'ministre', 'mi nistre')).toMatch(/Identifiant/);
    expect(renommerActeur(p, 'ministre', 'public')).toMatch(/déjà pris/);
    expect(renommerActeur(p, 'ministre', 'junon')).toBeNull();
    expect(p.ev[0]!.st[0]!.envois!.map(e => e.vers)).toEqual(['public:ont-vote:A', 'junon']);
    expect(p.ev[0]!.tr[0]!.g.map(g => g.k)).toEqual(['sig:junon.raccroche', 'sigv:junon.present']);
    expect(renommerActeur(p, 'public', 'salle')).toBeNull();
    expect(p.ev[0]!.st[0]!.envois![0]!.vers).toBe('salle:ont-vote:A');
  });

  it('refuse les clés de configuration qui ressemblent à un secret', () => {
    for (const k of ['cle', 'apiKey', 'secret', 'token', 'jeton', 'password', 'mot_de_passe']) expect(cleConfigInterdite(k)).toBe(true);
    for (const k of ['banques', 'agent', 'voix', 'langue']) expect(cleConfigInterdite(k)).toBe(false);
  });
});

describe('conversion des anciennes commandes (params.cmds)', () => {
  it('convertit une étape, retire cmds, garde params.sortie et des envois déjà écrits', () => {
    const e = st('q', { params: { cmds: [{ t: 'ecran', mode: 'mur' }, { t: 'vote.cmd', cmd: 'ouvrir', numero: 2 }], sortie: 'noir' } });
    expect(aConvertir(e)).toBe(true);
    expect(convertirEtape(e).sort()).toEqual(['ministre', 'public', 'scene']);
    expect(aConvertir(e)).toBe(false);
    expect(e.params).toEqual({ sortie: 'noir' });
    expect(e.envois!.map(x => `${x.vers}/${x.ecran}`)).toEqual(['scene/noir', 'public/vote', 'ministre/vote-compteur']);
    const deja = st('d', { params: { cmds: [{ t: 'tel.cmd', mode: 'scene' }] }, envois: [{ vers: 'public', ecran: 'noir' }] });
    expect(convertirEtape(deja)).toEqual([]);
    expect(deja.envois).toEqual([{ vers: 'public', ecran: 'noir' }]);
    expect(deja.params).toEqual({});
    expect(convertirEtape(st('rien'))).toEqual([]);
  });

  it('Écho : après conversion du projet, plus aucun avertissement sur les commandes, les envois ni les acteurs', () => {
    const p = echoProjet();
    const avant = validerProjet(p);
    expect(avant.filter(x => x.code === 'cmds-a-convertir').length).toBe(nbAConvertir(p));
    expect(nbAConvertir(p)).toBeGreaterThan(10);
    const r = convertirProjet(p);
    expect(r.etapes).toBe(avant.filter(x => x.code === 'cmds-a-convertir').length);
    expect(r.acteursAjoutes.sort()).toEqual(['figurants', 'ministre', 'public', 'scene']);
    expect(nbAConvertir(p)).toBe(0);
    const apres = validerProjet(p);
    expect(apres.filter(x => x.niveau === 'erreur')).toEqual([]);
    // le seul avertissement restant ne concerne ni les envois ni les acteurs (passage du dernier moment)
    expect(apres.filter(x => /^(cmds|envoi|envois|acteur|agent|signal)/.test(x.code))).toEqual([]);
    expect(apres.map(x => x.code)).toEqual(['passage-dernier-moment']);
    // une étape convertie : les envois d'Écho du rapport 1 (vote Q1)
    const q1 = p.ev.flatMap(m => m.st).find(s => s.id.startsWith('b5_q1') && !s.id.includes('res'))!;
    expect(q1.envois).toEqual([
      { vers: 'scene', ecran: 'mur', params: { vote: 'ouvert', numero: 1 } },
      { vers: 'public', ecran: 'vote', params: { numero: 1 } },
      { vers: 'ministre', ecran: 'vote-compteur', params: { numero: 1 } },
    ]);
  });
});

describe('EN COURS / PROCHAIN', () => {
  const m1 = moment('m1', [st('a', { envois: [{ vers: 'scene', ecran: 'noir', quand: 'sortie' }] }), st('b', { c: 1, envois: [{ vers: 'public', ecran: 'vote', params: { numero: 1 } }, { vers: 'scene', ecran: 'mur', quand: { apres: 5 } }] })],
    [{ a: 'a', b: 'b', g: [], mode: 'all' }]);
  const m2 = moment('m2', [st('c', { envois: [{ vers: 'public', ecran: 'regardez' }] })]);
  const p = projet([m1, m2]);

  it('pendant une étape : l’étape suivante et les envois qui partiront au GO', () => {
    const r = prochainCue(p, { moment: 'm1', etape: 'a', termine: false });
    expect(r.enCours).toMatchObject({ etape: 'a', momentNom: 'm1' });
    expect(r.prochain).toMatchObject({ moment: 'm1', etape: 'b' });
    expect(r.envois).toEqual([
      { texte: 'SCENE · noir · à la sortie', acteur: 'scene', quand: 'sortie' },
      { texte: 'PUBLIC · vote 1', acteur: 'public', quand: 'entree' },
      { texte: 'SCENE · mur · +5 s', acteur: 'scene', quand: 'apres' },
    ]);
  });

  it('dernière étape d’un moment : la première du moment suivant ; à la fin : rien', () => {
    expect(prochainCue(p, { moment: 'm1', etape: 'b', termine: false }).prochain).toMatchObject({ moment: 'm2', etape: 'c' });
    expect(prochainCue(p, { moment: 'm1', etape: null, termine: false }).prochain).toMatchObject({ moment: 'm2', etape: 'c' });
    expect(prochainCue(p, { moment: 'm2', etape: 'c', termine: false }).prochain).toBeNull();
    expect(prochainCue(p, { moment: 'm2', etape: 'c', termine: true })).toEqual({ enCours: null, prochain: null, envois: [] });
    expect(prochainCue(p, null).prochain).toBeNull();
  });
});
