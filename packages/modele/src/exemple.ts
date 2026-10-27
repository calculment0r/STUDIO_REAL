// Projet de démonstration du design (port fidèle de mk() dans conception/conducteur/source/studio-real/conducteur-core.js).
import type { Condition, Etape, Projet, Sortie } from './types';

const S = (id: string, name: string, ty: string, dur: number, c: number, r: number, a?: number, b?: number): Etape =>
  ({ id, name, ty, c, r, dx: 0, dy: 0, k: [Math.round((dur - 10) / 6), a ?? 50, b ?? 50] });
const G = (k: string, op: Condition['op'], v: number | string): Condition => ({ k, op, v });
const T = (a: string, b: string, g: Condition[], mode: Sortie['mode'] = 'all'): Sortie => ({ a, b, g, mode });

export function exempleDemo(): Projet {
  return {
    titre: 'Démonstration du conducteur',
    acts: [{ n: 'Accueil' }, { n: 'Le choix' }, { n: 'Dénouement' }],
    ev: [
      { id: 'e1', act: 0, name: 'Entrée du public', entry: 'portes',
        st: [S('portes', 'Portes ouvertes', 'k:attente', 240, 0, 0, 40, 30), S('calage', 'Calage salle', 'k:calage', 90, 1, 0, 55, 40), S('noir', 'Noir salle', 'k:fondu', 22, 2, 0, 5, 80)],
        tr: [T('portes', 'calage', [G('pres', '≥', 114), G('t', '≥', 420)], 'any'), T('calage', 'noir', [G('bruit', '≤', 40)])],
        gate: { mode: 'go', g: [G('bruit', '≤', 40)] } },
      { id: 'e2', act: 0, name: 'Prologue', entry: 'voix',
        st: [{ ...S('voix', 'Voix off', 'k:son', 148, 0, 0, 75, 30), asset: 'ouverture.wav' }, S('aube', 'Lumière lente', 'k:lum', 178, 1, 0, 45, 90), S('appar', 'Apparition', 'k:scene', 118, 2, 0, 75, 30)],
        tr: [T('voix', 'aube', []), T('aube', 'appar', [])],
        gate: { mode: 'auto', g: [] } },
      { id: 'e3', act: 1, name: 'Vote du public', entry: 'quest',
        st: [S('quest', 'Question au public', 'u1', 34, 0, 0, 60), S('vote', 'Votes reçus', 'b3', 94, 1, 0, 20), S('depou', 'Décompte', 'd1', 16, 2, 0, 50),
          S('issA', 'La fuite', 'k:issue', 22, 3, -1, 70, 40), S('issB', 'Le pacte', 'k:issue', 22, 3, 0, 70, 40), S('tir', 'Égalité · tirage', 'k:issue', 22, 3, 1, 70, 40)],
        tr: [T('quest', 'vote', []), T('vote', 'depou', [G('quorum', '≥', 60), G('t', '≥', 90)]),
          T('depou', 'issA', [G('issue', '=', 'A')]), T('depou', 'issB', [G('issue', '=', 'B')]), T('depou', 'tir', [G('issue', '=', 'T')])],
        gate: { mode: 'go', g: [] } },
      { id: 'e4', act: 1, name: 'Scène selon le choix', entry: { A: 'jeuA', B: 'jeuB', T: 'jeuA' },
        st: [S('jeuA', 'Scène A · la fuite', 'k:scene', 418, 0, -0.55, 80, 40), S('jeuB', 'Scène B · le pacte', 'k:scene', 382, 0, 0.55, 65, 40), S('basc', 'Bascule', 'k:passage', 40, 1, 0, 30, 70)],
        tr: [T('jeuA', 'basc', []), T('jeuB', 'basc', [])],
        gate: { mode: 'auto', g: [] } },
      { id: 'e5', act: 1, name: 'Vague de lumière', entry: 'prep',
        st: [S('prep', 'Préparer les téléphones', 'u3', 58, 0, 0), S('vague', 'La vague', 'x2', 46, 1, 0, 50), S('retour', 'Retour au noir', 'k:fondu', 22, 2, 0, 5, 80)],
        tr: [T('prep', 'vague', [G('prets', '≥', 70)]), T('vague', 'retour', [])],
        gate: { mode: 'go', g: [G('bruit', '≤', 40)] } },
      { id: 'e6', act: 2, name: 'Climax', entry: 'montee',
        st: [{ ...S('montee', 'Montée', 'k:son', 238, 0, 0, 85, 60), asset: 'montee_climax.wav' }, S('pic', 'Le pic', 'x3', 28, 1, 0, 50), S('silence', 'Silence', 'k:fondu', 28, 2, 0, 0, 50)],
        tr: [T('montee', 'pic', []), T('pic', 'silence', [])],
        gate: { mode: 'auto', g: [] } },
      { id: 'e7', act: 2, name: 'Salut et sortie', entry: 'salut',
        st: [S('salut', 'Salut', 'k:scene', 118, 0, 0, 85, 40), S('sortie', 'Sortie du public', 'k:attente', 298, 1, 0, 50, 60)],
        tr: [T('salut', 'sortie', [])],
        gate: { mode: 'auto', g: [] } },
    ],
    sens: { aff: 60, part: 55, calme: 50, pen: 62 },
    hold: {}, go: {}, ver: 1, nid: 100,
    tracks: [
      { id: 't1', type: 'curve', src: 'tens', name: 'Tension dramatique', col: '#e59578', open: true, pts: { e1: 22, e2: 34, e3: 52, e4: 70, e5: 60, e6: 92, e7: 28 } },
      { id: 't2', type: 'curve', src: 'lum', name: 'Lumière générale', col: '#b9cfd8', open: false },
      { id: 't3', type: 'curve', src: 'pub', name: 'Participation', col: '#78b08f', open: false },
      { id: 't4', type: 'son', name: 'Son', open: true, clips: [{ id: 'c1', name: 'ouverture.wav', ev: 'e2', off: 0, dur: 148 }, { id: 'c2', name: 'pluie_toit.wav', ev: 'e4', off: 30, dur: 70 }, { id: 'c3', name: 'montee_climax.wav', ev: 'e6', off: 0, dur: 238 }] },
      { id: 't5', type: 'lx', name: 'Lumière · cues', open: true, clips: [{ id: 'c4', name: 'LX 12 · Noir salle', ev: 'e1', off: 330, dur: 22 }, { id: 'c5', name: 'LX 01 · Aube', ev: 'e2', off: 148, dur: 30 }, { id: 'c6', name: 'LX 31 · Vague bleue', ev: 'e5', off: 58, dur: 46 }, { id: 'c7', name: 'LX 99 · Salut', ev: 'e7', off: 0, dur: 118 }] },
      { id: 't7', type: 'secu', name: 'Sécurité', open: true, marks: [{ id: 's1', ev: 'e1', off: 40, txt: 'Ouverture des portes · public en mouvement', lead: 8 }, { id: 's2', ev: 'e6', off: 238, txt: 'Strobe 3 Hz · prévenir la salle', lead: 10 }, { id: 's3', ev: 'e7', off: 118, txt: 'Sortie du public · rallumer la salle', lead: 8 }] },
      { id: 't6', type: 'notes', name: 'Notes de régie', open: true, marks: [{ id: 'k1', ev: 'e1', off: 60, txt: 'Ouvrir les portes côté jardin' }, { id: 'k2', ev: 'e4', off: 0, txt: 'Vérifier le retour streamer' }, { id: 'k3', ev: 'e6', off: 200, txt: 'Prévenir la sécurité : strobe' }] },
    ],
  };
}
