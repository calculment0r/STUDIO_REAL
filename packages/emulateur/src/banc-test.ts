// Petit banc des tests (pas exporté par index.ts) : l'heure de départ et un projet construit à la main, le même que
// celui des tests du noyau (apps/serveur-spectacle/src/noyau/banc-test.ts, réduit au premier moment et au second).
import type { Acteur, Condition, Envoi, Etape, Moment, Projet, Sortie } from '@studio-real/modele';

export const T0 = Date.UTC(2026, 10, 14, 19, 30, 0);

const etape = (id: string, envois: Envoi[] = [], extra: Partial<Etape> = {}): Etape =>
  ({ id, name: id, ty: 'k:scene', c: 0, r: 0, dx: 0, dy: 0, k: [0, 50, 50], envois, ...extra });
const cond = (k: string, op: Condition['op'], v: number | string): Condition => ({ k, op, v });
const sortie = (a: string, b: string, g: Condition[] = []): Sortie => ({ a, b, g, mode: 'all' });
const moment = (id: string, st: Etape[], tr: Sortie[]): Moment => ({ id, act: 0, name: id, entry: st[0]!.id, st, tr, gate: { mode: 'go', g: [] } });

const ACTEURS: Acteur[] = [
  { id: 'scene', type: 'ecran', nom: 'Écran scène', rendu: 'sortie', cardinalite: 1, ecrans: ['noir', 'accueil-qr', 'vote', 'titre', 'mur'], signaux: ['fin-video'] },
  { id: 'public', type: 'public', nom: 'Le public', rendu: 'telephone', cardinalite: 'n', ecrans: ['regardez', 'vote', 'notification', 'noir'], signaux: ['vote', 'pret'] },
  { id: 'ministre', type: 'telephone', nom: 'Ministre', rendu: 'telephone', cardinalite: 1, ecrans: ['veille', 'vote-compteur'], signaux: [] },
];

/** m1 = accueil (10 s) → vote (10 s ; sortie au quorum ≥ 90 %) → résultat ; m2 = fin. Passages « go ». */
export function projetBanc(): Projet {
  return {
    titre: 'Banc', acts: [{ n: 'Acte' }], sens: { aff: 50, part: 50, calme: 50, pen: 50 }, hold: {}, go: {}, ver: 1, nid: 100, tracks: [],
    acteurs: ACTEURS,
    ev: [
      moment('m1', [
        etape('accueil', [{ vers: 'scene', ecran: 'accueil-qr' }, { vers: 'public', ecran: 'regardez', params: { texte: 'Bienvenue' } }, { vers: 'ministre', ecran: 'veille' }]),
        etape('vote', [
          { vers: 'public', ecran: 'vote', params: { numero: 1, question: '$question', reponses: ['Oui', 'Non'] } },
          { vers: 'scene', ecran: 'vote', params: { numero: 1 } },
        ], { ty: 'u1', params: { question: 'Faut-il continuer ?' } }),
        etape('resultat', [{ vers: 'public', ecran: 'regardez', params: { texte: 'Résultat à l’écran' } }]),
      ], [sortie('accueil', 'vote'), sortie('vote', 'resultat', [cond('quorum', '≥', 90)]), sortie('resultat', '')]),
      moment('m2', [etape('fin', [{ vers: 'public', ecran: 'regardez', params: { texte: 'Merci' } }])], [sortie('fin', '')]),
    ],
  };
}
