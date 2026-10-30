// Les acteurs sur la planche : bande, liens étape → acteur et acteur → sortie, puces d'ordres (logique pure).
import { describe, expect, it } from 'vitest';
import { acteursEcho, type Etape, type Moment } from '@studio-real/modele';
import {
  BANDE, acteurDeCondition, cheminVersActeur, couleurActeur, defilementMaxBande, hauteurContenuBande, liensEnvois, liensSignaux,
  noeudDe, placerBande, pointEnvoi, pointPuces, puceEnvoi, pucesEtape, resumeEnvoi, suffixeQuand,
} from './acteurs';
import { hauteurBloc, liensDuMoment, mondeVersEcran, placerMoments, rondSortie, type Camera } from './geometrie';

const st = (id: string, extra: Partial<Etape> = {}): Etape => ({ id, name: id, ty: 'k:scene', c: 0, r: 0, dx: 0, dy: 0, k: [0, 50, 50], ...extra });
const moment = (id: string, etapes: Etape[], tr: Moment['tr'] = []): Moment => ({ id, act: 0, name: id, entry: etapes[0]!.id, st: etapes, tr, gate: { mode: 'auto', g: [] } });

describe('bande des acteurs', () => {
  const acteurs = acteursEcho();

  it('pose un nœud par acteur, de haut en bas, accroche au milieu du bord droit', () => {
    const N = placerBande(acteurs, 900);
    expect(N.map(n => n.id)).toEqual(['public', 'scene', 'ministre', 'franck', 'eco', 'figurants']);
    N.forEach((n, i) => {
      expect(n.x).toBe(BANDE.x);
      expect(n.y).toBe(BANDE.haut + i * (BANDE.hauteurNoeud + BANDE.ecart));
      expect(n.ancre).toEqual({ x: BANDE.x + BANDE.largeur, y: n.y + BANDE.hauteurNoeud / 2 });
      expect(n.cache).toBe(false);
    });
  });

  it('hauteur du contenu, défilement borné, nœuds hors de la zone visible marqués cachés', () => {
    expect(hauteurContenuBande(0)).toBe(0);
    expect(hauteurContenuBande(3)).toBe(3 * BANDE.hauteurNoeud + 2 * BANDE.ecart);
    const h = BANDE.haut + BANDE.bas + 2 * BANDE.hauteurNoeud + BANDE.ecart;   // tient 2 nœuds
    expect(defilementMaxBande(6, h)).toBe(hauteurContenuBande(6) - (2 * BANDE.hauteurNoeud + BANDE.ecart));
    expect(defilementMaxBande(2, h)).toBe(0);
    const N = placerBande(acteurs, h);
    expect(N.filter(n => !n.cache).map(n => n.id)).toEqual(['public', 'scene']);
    const D = placerBande(acteurs, h, 10_000);   // borné au maximum
    expect(D[5]!.cache).toBe(false);
    expect(D[0]!.cache).toBe(true);
    expect(D[5]!.y).toBe(BANDE.haut + 5 * (BANDE.hauteurNoeud + BANDE.ecart) - defilementMaxBande(6, h));
  });

  it('retrouve un nœud par id, casse et accents ignorés', () => {
    const N = placerBande(acteurs, 900);
    expect(noeudDe(N, 'ministre')?.id).toBe('ministre');
    expect(noeudDe(N, 'MINISTRE')?.id).toBe('ministre');
    expect(noeudDe(N, 'personne')).toBeUndefined();
  });

  it('couleurs : famille « Écrans du public » pour un téléphone, « Scène et régie » sinon', () => {
    expect(couleurActeur({ rendu: 'telephone' })).toBe('var(--fam-ui)');
    expect(couleurActeur({ rendu: 'sortie' })).toBe('var(--fam-scene)');
    expect(couleurActeur({ rendu: 'externe' })).toBe('var(--fam-scene)');
    expect(couleurActeur(undefined)).toBe('var(--fam-scene)');
  });
});

describe('liens étape → acteur et acteur → sortie', () => {
  const acteurs = acteursEcho();
  const noeuds = placerBande(acteurs, 900);
  const cam: Camera = { px: 300, py: 200, z: 0.75 };
  const m1 = moment('m1', [
    st('q1', { envois: [{ vers: 'scene', ecran: 'mur', params: { vote: 'ouvert', numero: 1 } }, { vers: 'public', ecran: 'vote' }, { vers: 'inconnu', ecran: 'x' }] }),
    st('res', { c: 1 }),
  ], [{ a: 'q1', b: 'res', g: [{ k: 'sig:ministre.raccroche', op: '≥', v: 1 }, { k: 'quorum', op: '≥', v: 90 }], mode: 'any' }, { a: 'res', b: '', g: [{ k: 'sigv:scene.fin-video', op: '=', v: 'a.mp4' }], mode: 'all' }]);
  const cadres = placerMoments([m1]);

  it('un lien par envoi dont l’acteur est dans la bande, du coin bas-gauche du bloc à l’accroche de l’acteur', () => {
    const L = liensEnvois(cadres, cam, noeuds, 'moyen');
    expect(L.map(l => l.acteur)).toEqual(['scene', 'public']);
    const p = cadres[0]!.P.q1!;
    const a = mondeVersEcran(cam, p.x, p.y + hauteurBloc('moyen'));
    expect(L[0]!.a).toEqual(a);
    expect(L[0]!.b).toEqual(noeudDe(noeuds, 'scene')!.ancre);
    expect(L[0]!.couleur).toBe('var(--fam-scene)');
    expect(L[1]!.couleur).toBe('var(--fam-ui)');
    expect(L[1]).toMatchObject({ genre: 'envoi', moment: 'm1', etape: 'q1', index: 1 });
    expect(L[0]!.d.startsWith(`M${Math.round(a.x * 10) / 10} `)).toBe(true);
  });

  it('point d’envoi : coin bas-gauche du bloc selon le niveau de zoom', () => {
    expect(pointEnvoi({ x: 10, y: 20 }, 'loin')).toEqual({ x: 10, y: 20 + hauteurBloc('loin') });
    expect(pointEnvoi({ x: 10, y: 20 }, 'pres')).toEqual({ x: 10, y: 20 + hauteurBloc('pres') });
  });

  it('ne garde que les blocs visibles quand une vue est donnée', () => {
    expect(liensEnvois(cadres, cam, noeuds, 'moyen', { x: 1e6, y: 1e6, w: 10, h: 10 })).toEqual([]);
    expect(liensEnvois(cadres, cam, [], 'moyen')).toEqual([]);
  });

  it('un lien acteur → sortie par condition sig: / sigv: : vers la règle de la sortie, ou le rond d’une sortie vers la fin', () => {
    const L = liensSignaux(cadres, cam, noeuds, 'moyen');
    expect(L.map(l => [l.acteur, l.index])).toEqual([['ministre', 0], ['scene', 1]]);
    const milieu = liensDuMoment(cadres[0]!, 'moyen').find(x => x.index === 0)!.milieu;
    expect(L[0]!.a).toEqual(mondeVersEcran(cam, milieu.x, milieu.y));
    const rond = rondSortie(cadres[0]!.P.res!, 0, 'moyen');
    expect(L[1]!.a).toEqual(mondeVersEcran(cam, rond.x, rond.y));
    expect(L.every(l => l.couleur === 'var(--fam-trig)' && l.genre === 'signal')).toBe(true);
  });

  it('lit l’acteur d’une clé de condition', () => {
    expect(acteurDeCondition('sig:ministre.present')).toEqual({ acteur: 'ministre', signal: 'present' });
    expect(acteurDeCondition('sigv:scene.fin-video')).toEqual({ acteur: 'scene', signal: 'fin-video' });
    expect(acteurDeCondition('sig:go')).toBeNull();
    expect(acteurDeCondition('quorum')).toBeNull();
  });

  it('courbe vers la bande : départ vers la gauche', () => {
    expect(cheminVersActeur(500, 100, 166, 80)).toBe('M500 100 C349.7 100 316.3 80 166 80');
  });
});

describe('puces d’ordres sous les blocs', () => {
  it('« ACTEUR · écran détail » à partir des envois', () => {
    expect(puceEnvoi({ vers: 'public', ecran: 'vote', params: { numero: 1 } })).toBe('PUBLIC · vote 1');
    expect(puceEnvoi({ vers: 'scene', ecran: 'mur', params: { vote: 'ouvert', numero: 3 } })).toBe('SCENE · mur · vote Q3');
    expect(puceEnvoi({ vers: 'scene', ecran: 'mur', params: { vote: 'revele' } })).toBe('SCENE · mur · résultat');
    expect(puceEnvoi({ vers: 'public', ecran: 'regardez', params: { texte: 'Regardez la scène' } })).toBe('PUBLIC · regardez « Regardez la scène »');
    expect(puceEnvoi({ vers: 'public', ecran: 'notification', fx: 'vibrer' })).toBe('PUBLIC · notification + vibrer');
    expect(puceEnvoi({ vers: 'public', fx: 'vibrer' })).toBe('PUBLIC · effet vibrer');
    expect(puceEnvoi({ vers: 'public:ont-vote:A', ecran: 'texte', quand: { apres: 5 } })).toBe('PUBLIC:ONT-VOTE:A · texte · +5 s');
    expect(puceEnvoi({ vers: 'figurants', ecran: 'figurants.cmd', params: { segment: 'junon' }, quand: 'sortie' })).toBe('FIGURANTS · figurants.cmd junon · à la sortie');
  });

  it('résumé court et suffixe de moment', () => {
    expect(resumeEnvoi({ ecran: 'video', params: { asset: 'flux_insta_jim.mp4' } })).toBe('video flux_insta_jim.mp4');
    expect(resumeEnvoi({ ecran: 'vote-compteur', params: { revele: true } })).toBe('vote-compteur · résultat');
    expect(resumeEnvoi({ ecran: 'regardez', params: { texte: 'Un texte beaucoup trop long pour une puce' } })).toBe('regardez « Un texte beaucoup tro… »');
    expect(suffixeQuand({})).toBe('');
    expect(suffixeQuand({ quand: 'entree' })).toBe('');
  });

  it('une puce par envoi lisible, couleur de l’acteur, envoi non tenu marqué', () => {
    const P = pucesEtape({ envois: [{ vers: 'scene', ecran: 'mur' }, { vers: 'public', ecran: 'vote', tenir: false }, null as never] }, acteursEcho());
    expect(P).toEqual([
      { index: 0, texte: 'SCENE · mur', acteur: 'scene', couleur: 'var(--fam-scene)', tenu: true },
      { index: 1, texte: 'PUBLIC · vote', acteur: 'public', couleur: 'var(--fam-ui)', tenu: false },
    ]);
    expect(pucesEtape({})).toEqual([]);
  });

  it('les puces se posent sous le bloc', () => {
    expect(pointPuces({ x: 5, y: 7 }, 'moyen')).toEqual({ x: 5, y: 7 + hauteurBloc('moyen') + 8 });
  });
});
