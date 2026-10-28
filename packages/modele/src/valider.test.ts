import { describe, expect, it } from 'vitest';
import { ErreurChargement, chargerFichier, validerProjet } from './valider';
import { exempleDemo } from './exemple';
import { FORMAT } from './types';
import { TY_BOUCLE, TY_GARDE, TY_SIGNAL } from './blocs-moteur';
import { creerActeur } from './acteurs';
import type { Acteur, Envoi, Projet } from './types';
import { cond, etape, moment, projet, sortie } from './aides-test';

const codes = (p: Parameters<typeof validerProjet>[0]) => validerProjet(p).map(x => `${x.niveau}:${x.code}`);

describe('validerProjet', () => {
  it('l’exemple de démonstration est propre', () => {
    expect(validerProjet(exempleDemo())).toEqual([]);
  });

  it('ids en double, sorties vers des étapes inexistantes, entrée invalide', () => {
    const p = projet([
      moment('m', [etape('a'), etape('a')], [sortie('a', 'zz'), sortie('yy', 'a')], undefined, 'nulle'),
      moment('m', [etape('b')], []),
    ]);
    const c = codes(p);
    expect(c).toContain('erreur:etape-id-double');
    expect(c).toContain('erreur:moment-id-double');
    expect(c).toContain('erreur:sortie-cible-inconnue');
    expect(c).toContain('erreur:sortie-source-inconnue');
    expect(c).toContain('erreur:entree-inconnue');
    const msg = validerProjet(p).find(x => x.code === 'sortie-cible-inconnue')!.message;
    expect(msg).toMatch(/vise l’étape « zz », qui n’existe pas/);
  });

  it('moment sans sortie de fin, étape inaccessible, sinon mal placé', () => {
    const p = projet([moment('m', [etape('a'), etape('b'), etape('isolee')], [
      sortie('a', 'b'), sortie('a', 'b', [cond('t', '≥', 30)]), sortie('b', 'a'),
    ])]);
    const c = codes(p);
    expect(c).toContain('erreur:moment-sans-fin');
    expect(c).toContain('avertissement:etape-inaccessible');
    expect(c).toContain('avertissement:sinon-pas-dernier');
  });

  it('conditions inconnues, opérateur, valeur, issue, mémoire jamais posée', () => {
    const p = projet([moment('m', [etape('a'), etape('b')], [
      sortie('a', 'b', [cond('lune', '≥', 3), cond('quorum', '≥', 'beaucoup'), cond('issue', '≥', 'A'), cond('mem:fuite', '=', 1)]),
      sortie('a', 'b', [{ k: 'pres', op: '~' as never, v: 3 }]),
    ])]);
    const c = codes(p);
    expect(c).toContain('erreur:condition-inconnue');
    expect(c).toContain('erreur:condition-valeur');
    expect(c).toContain('erreur:condition-issue-operateur');
    expect(c).toContain('erreur:condition-operateur');
    expect(c).toContain('avertissement:memoire-jamais-posee');
  });

  it('passages : mode invalide, go sur le dernier moment, table d’entrée incomplète sans vote', () => {
    const p = projet([
      moment('m1', [etape('a')], [], { mode: 'plus tard' as never, g: [] }),
      moment('m2', [etape('x'), etape('y')], [], { mode: 'go', g: [] }, { A: 'x', B: 'y' }),
    ]);
    const c = codes(p);
    expect(c).toContain('erreur:passage-mode');
    expect(c).toContain('avertissement:passage-dernier-moment');
    expect(c).toContain('avertissement:entree-issue-manquante');
    expect(c).toContain('avertissement:entree-sans-vote');
  });

  it('blocs moteur : garde-fou sans « délai dépassé », boucle sans « encore »', () => {
    const p = projet([moment('m', [etape('g', 10, TY_GARDE), etape('l', 10, TY_BOUCLE), etape('fin')], [
      sortie('g', 'l', [cond('quorum', '≥', 50)], 'all', { nom: 'condition remplie' }),
    ])]);
    const c = codes(p);
    expect(c).toContain('erreur:garde-sans-delai');
    expect(c).toContain('erreur:boucle-sans-encore');
  });
});

describe('chargerFichier', () => {
  it('accepte un fichier complet (texte JSON) et le rend identique', () => {
    const f = { format: FORMAT, project: exempleDemo(), assets: [], runs: [] };
    expect(chargerFichier(JSON.stringify(f))).toEqual(f);
  });

  it('accepte un projet nu et complète les valeurs par défaut', () => {
    const f = chargerFichier({ ev: [{ id: 'm', st: [{ id: 'a', k: [3] }, { id: 'b' }], tr: [{ a: 'a', b: 'b', g: [{ k: 'bruit', op: '<=', v: 40 }] }] }] });
    expect(f.format).toBe(FORMAT);
    expect(f.assets).toEqual([]);
    const p = f.project;
    expect(p.acts).toEqual([{ n: 'Acte 1' }]);
    expect(p.sens).toEqual({ aff: 60, part: 55, calme: 50, pen: 62 });
    expect(p.hold).toEqual({});
    const m = p.ev[0]!;
    expect(m.entry).toBe('a');
    expect(m.gate).toEqual({ mode: 'auto', g: [] });
    expect(m.st[0]).toMatchObject({ id: 'a', name: 'a', k: [3, 50, 50], dx: 0, dy: 0 });
    expect(m.tr[0]).toEqual({ a: 'a', b: 'b', mode: 'all', g: [{ k: 'bruit', op: '≤', v: 40 }] });
    expect(validerProjet(p)).toEqual([]);
  });

  it('refuse ce qui n’est pas un conducteur', () => {
    expect(() => chargerFichier('{pas du json')).toThrow(ErreurChargement);
    expect(() => chargerFichier({ bonjour: 1 })).toThrow(/project/);
    expect(() => chargerFichier({ format: 'autre@2', project: {} })).toThrow(/inconnu/);
  });
});

describe('validerProjet : acteurs et envois', () => {
  const acteurs = (): Acteur[] => [
    creerActeur('ecran', 'scene', 'Écran scène'),
    creerActeur('public', 'public'),
    { ...creerActeur('telephone', 'ministre', 'Téléphone de la ministre'), signaux: ['present'] },
  ];
  const avec = (envois: unknown[], extra: Partial<Projet> = {}) =>
    projet([moment('m', [etape('a', 10, 'k:scene', { envois: envois as Envoi[] })], [])], { acteurs: acteurs(), ...extra });

  it('des envois corrects ne lèvent rien', () => {
    expect(validerProjet(avec([
      { vers: 'scene', ecran: 'mur' }, { vers: 'public', ecran: 'vote', params: { numero: 1 } },
      { vers: 'public', fx: 'vibrer', quand: { apres: 3 } }, { vers: 'public:ont-vote:A', ecran: 'couleur', tenir: false },
      { vers: 'scene', ecran: 'noir', quand: 'sortie' },
    ]))).toEqual([]);
  });

  it('acteur inconnu, écran que l’acteur ne sait pas afficher, cible illisible, quand et tenir invalides', () => {
    const c = codes(avec([
      { vers: 'lune', ecran: 'mur' }, { vers: 'ministre', ecran: 'mur' }, { vers: 'public:aleatoire:0', ecran: 'vote' },
      { vers: 'public', ecran: 'vote', quand: 'demain' }, { vers: 'scene', fx: 'pop', tenir: 'oui' }, 'n’importe quoi',
    ]));
    expect(c).toContain('erreur:envoi-acteur-inconnu');
    expect(c).toContain('erreur:envoi-ecran-inconnu');
    expect(c).toContain('erreur:envoi-cible-invalide');
    expect(c).toContain('erreur:envoi-quand-invalide');
    expect(c).toContain('erreur:envoi-tenir-invalide');
    expect(c).toContain('erreur:envoi-illisible');
  });

  it('envois contradictoires, filtre sur un acteur nommé, effet inconnu, envoi vide', () => {
    const c = codes(avec([
      { vers: 'scene', ecran: 'mur' }, { vers: 'scene', ecran: 'noir' }, { vers: 'ministre:ont-vote:A', ecran: 'veille' },
      { vers: 'public', fx: 'confettis' }, { vers: 'public' },
    ]));
    expect(c).toContain('avertissement:envois-contradictoires');
    expect(c).toContain('avertissement:envoi-filtre-sans-foule');
    expect(c).toContain('avertissement:envoi-effet-inconnu');
    expect(c).toContain('avertissement:envoi-vide');
    // un écran à l'entrée et un autre à la sortie ne se contredisent pas
    expect(codes(avec([{ vers: 'scene', ecran: 'mur' }, { vers: 'scene', ecran: 'noir', quand: 'sortie' }]))).toEqual([]);
  });

  it('liste des acteurs : id double ou illisible, type inconnu, cardinalité, secret dans la configuration d’un agent', () => {
    const p = avec([], {
      acteurs: [
        creerActeur('public', 'public'), creerActeur('public', 'public'), { ...creerActeur('ecran', 'scene'), type: 'robot' as never },
        { ...creerActeur('telephone', 'a.b') }, { ...creerActeur('comedien', 'franck'), cardinalite: 2 as never },
        { ...creerActeur('agent:elevenlabs', 'eco'), agent: { genre: 'elevenlabs', config: { api_key: 'x' } } },
      ],
    });
    const c = codes(p);
    expect(c).toContain('erreur:acteur-id-double');
    expect(c).toContain('erreur:acteur-type-inconnu');
    expect(c).toContain('erreur:acteur-sans-id');
    expect(c).toContain('erreur:acteur-cardinalite');
    expect(c).toContain('avertissement:agent-secret');
  });

  it('signal attendu qu’aucun acteur ne renvoie (conditions et bloc Signal) ; signaux hors acteurs ignorés', () => {
    const p = projet([moment('m', [etape('a'), etape('b'), etape('s', 10, TY_SIGNAL, { params: { signal: 'scene.applaudit' } })], [
      sortie('a', 'b', [cond('sig:ministre.raccroche', '≥', 1)]),
      sortie('a', 'b', [cond('sigv:scene.fin-video', '=', 'zoom.mp4'), cond('sig:ministre.present', '≥', 1), cond('sig:go.story', '≥', 1)]),
      sortie('a', 's'), sortie('b', ''), sortie('s', ''),
    ])], { acteurs: acteurs() });
    const l = validerProjet(p).filter(x => x.code === 'signal-jamais-renvoye');
    expect(l.map(x => x.message.match(/attend « ([^»]+) »/)?.[1])).toEqual(['ministre.raccroche', 'scene.applaudit']);
  });

  it('params.cmds encore présent → avertissement « à convertir » ; envois sans acteurs déclarés → avertissement', () => {
    const p = projet([moment('m', [etape('a', 10, 'k:scene', { params: { cmds: [{ t: 'ecran', mode: 'mur' }] }, envois: [{ vers: 'scene', ecran: 'mur' }] })], [])]);
    const c = codes(p);
    expect(c).toContain('avertissement:cmds-a-convertir');
    expect(c).toContain('avertissement:envois-sans-acteurs');
    expect(c.filter(x => x.startsWith('erreur'))).toEqual([]);
  });

  it('chargerFichier garde acteurs et envois', () => {
    const p = avec([{ vers: 'scene', ecran: 'mur' }]);
    const f = chargerFichier(JSON.stringify({ format: FORMAT, project: p, assets: [], runs: [] }));
    expect(f.project.acteurs).toEqual(p.acteurs);
    expect(f.project.ev[0]!.st[0]!.envois).toEqual([{ vers: 'scene', ecran: 'mur' }]);
  });
});
