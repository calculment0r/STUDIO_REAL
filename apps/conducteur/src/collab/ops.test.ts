import { describe, expect, it } from 'vitest';
import { exempleDemo, type Projet } from '@studio-real/modele';
import { appliquerOps, appliquerSouple, copie, decouper, diffProjet, egal, ErreurOp, essayerOps, type Op } from './ops';

/** diff(avant, apres) appliqué à une copie d'avant redonne apres. */
function allerRetour(avant: Projet, modifier: (p: Projet) => void): { ops: Op[]; apres: Projet } {
  const apres = copie(avant);
  modifier(apres);
  const ops = diffProjet(avant, apres);
  const doc = copie(avant);
  appliquerOps(doc, ops);
  expect(egal(doc, apres)).toBe(true);
  expect(doc).toEqual(JSON.parse(JSON.stringify(apres)));
  return { ops, apres };
}

describe('application des opérations (même sémantique que le serveur)', () => {
  it('poser, inserer, retirer par clé, index, {id} et « - »', () => {
    const p = exempleDemo();
    const m0 = p.ev[0]!.id;
    appliquerOps(p, [
      { op: 'poser', chemin: ['ev', { id: m0 }, 'name'], valeur: 'Prologue revu' },
      { op: 'inserer', chemin: ['acts', '-'], valeur: { n: 'Épilogue' } },
      { op: 'retirer', chemin: ['acts', 0] },
      { op: 'poser', chemin: ['memoires'], valeur: { score: 3 } },
    ]);
    expect(p.ev[0]!.name).toBe('Prologue revu');
    expect(p.acts[p.acts.length - 1]).toEqual({ n: 'Épilogue' });
    expect(p.memoires).toEqual({ score: 3 });
  });

  it('tout ou rien : un échec restaure le document', () => {
    const p = exempleDemo(), avant = copie(p);
    expect(() => appliquerOps(p, [
      { op: 'poser', chemin: ['titre'], valeur: 'X' },
      { op: 'retirer', chemin: ['ev', { id: 'nexistepas' }] },
    ])).toThrow(ErreurOp);
    expect(p).toEqual(avant);
    expect(essayerOps(p, [{ op: 'retirer', chemin: ['ev', { id: 'nexistepas' }] }])).toBe(false);
  });

  it('application souple : garde ce qui passe', () => {
    const p = exempleDemo();
    const n = appliquerSouple(p, [
      { op: 'poser', chemin: ['titre'], valeur: 'Gardé' },
      { op: 'poser', chemin: ['ev', { id: 'absent' }, 'name'], valeur: 'perdu' },
    ]);
    expect(n).toBe(1);
    expect(p.titre).toBe('Gardé');
  });

  it('refuse les clés dangereuses', () => {
    expect(() => appliquerOps({}, [{ op: 'poser', chemin: ['__proto__'], valeur: 1 }])).toThrow(ErreurOp);
  });
});

describe('diff du projet → ops', () => {
  it('aucun changement : aucune opération', () => {
    const p = exempleDemo();
    expect(diffProjet(p, copie(p))).toEqual([]);
  });

  it('renommer un moment : une seule opération, chemin par id', () => {
    const p = exempleDemo();
    const id = p.ev[1]!.id;
    const { ops } = allerRetour(p, (q) => { q.ev[1]!.name = 'Nouveau nom'; });
    expect(ops).toEqual([{ op: 'poser', chemin: ['ev', { id }, 'name'], valeur: 'Nouveau nom' }]);
  });

  it('rotatif d\'une étape : chemin jusqu\'à l\'index du rotatif', () => {
    const p = exempleDemo();
    const m = p.ev[0]!, e = m.st[0]!;
    const { ops } = allerRetour(p, (q) => { q.ev[0]!.st[0]!.k[1] = 77; q.ver++; });
    expect(ops).toContainEqual({ op: 'poser', chemin: ['ev', { id: m.id }, 'st', { id: e.id }, 'k', 1], valeur: 77 });
    expect(ops).toContainEqual({ op: 'poser', chemin: ['ver'], valeur: p.ver + 1 });
  });

  it('ajouter une étape en fin : inserer « - » ; au milieu : index', () => {
    const p = exempleDemo();
    const etape = { id: 'n999', name: 'Nouvelle', ty: 'k:scene', c: 9, r: 0, dx: 0, dy: 0, k: [10, 50, 50] };
    const fin = allerRetour(p, (q) => { q.ev[0]!.st.push(etape); });
    expect(fin.ops).toEqual([{ op: 'inserer', chemin: ['ev', { id: p.ev[0]!.id }, 'st', '-'], valeur: etape }]);
    const milieu = allerRetour(p, (q) => { q.ev[0]!.st.splice(1, 0, etape); });
    expect(milieu.ops).toEqual([{ op: 'inserer', chemin: ['ev', { id: p.ev[0]!.id }, 'st', 1], valeur: etape }]);
  });

  it('retirer un moment : retirer par id', () => {
    const p = exempleDemo();
    const id = p.ev[2]!.id;
    const { ops } = allerRetour(p, (q) => { q.ev.splice(2, 1); });
    expect(ops).toEqual([{ op: 'retirer', chemin: ['ev', { id }] }]);
  });

  it('déplacer un moment : seul l\'élément déplacé bouge (pas tout le tableau)', () => {
    const p = exempleDemo();
    const { ops } = allerRetour(p, (q) => { const [m] = q.ev.splice(0, 1); q.ev.push(m!); });
    expect(ops.length).toBe(2);
    expect(ops[0]).toEqual({ op: 'retirer', chemin: ['ev', { id: p.ev[0]!.id }] });
    expect(ops[1]!.op).toBe('inserer');
  });

  it('tableaux sans id : ajout en fin, coupe, ou tableau reposé', () => {
    const p = exempleDemo();
    const m = p.ev[0]!;
    allerRetour(p, (q) => { q.acts.push({ n: 'Acte bonus' }); });
    allerRetour(p, (q) => { q.acts.pop(); });
    const { ops } = allerRetour(p, (q) => { q.ev[0]!.tr.unshift({ a: m.st[0]!.id, b: '', g: [], mode: 'all' }); });
    expect(ops).toEqual([{ op: 'poser', chemin: ['ev', { id: m.id }, 'tr'], valeur: expect.any(Array) }]);
  });

  it('clé ajoutée, clé retirée, valeur undefined = absente', () => {
    const p = exempleDemo();
    allerRetour(p, (q) => { q.memoires = { a: 1 }; q.titre = undefined; });
    const { ops } = allerRetour({ ...p, titre: 'T' } as Projet, (q) => { delete q.titre; });
    expect(ops).toEqual([{ op: 'retirer', chemin: ['titre'] }]);
  });

  it('profondeur bornée à 16 segments', () => {
    let profond: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 25; i++) profond = { s: profond };
    const p = exempleDemo();
    p.ev[0]!.st[0]!.params = { arbre: copie(profond) };
    const { ops } = allerRetour(p, (q) => {
      let o = q.ev[0]!.st[0]!.params!.arbre as Record<string, unknown>;
      while (o.s) o = o.s as Record<string, unknown>;
      o.v = 2;
    });
    for (const o of ops) expect(o.chemin.length).toBeLessThanOrEqual(16);
  });

  it('fuzz : 300 mutations aléatoires, aller-retour exact', () => {
    let graine = 42;
    const alea = () => ((graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = <T>(t: T[]) => t[Math.floor(alea() * t.length)]!;
    let p = exempleDemo();
    for (let i = 0; i < 300; i++) {
      const res = allerRetour(p, (q) => {
        const nb = 1 + Math.floor(alea() * 4);
        for (let j = 0; j < nb; j++) {
          const m = pick(q.ev);
          switch (Math.floor(alea() * 9)) {
            case 0: m.name = 'm' + i; break;
            case 1: if (m.st.length) pick(m.st).k[0] = Math.round(alea() * 100); break;
            case 2: m.st.splice(Math.floor(alea() * (m.st.length + 1)), 0, { id: `z${i}_${j}`, name: 'z', ty: 'k:scene', c: 1, r: 0, dx: 0, dy: 0, k: [1, 2, 3] }); break;
            case 3: if (m.st.length > 1) m.st.splice(Math.floor(alea() * m.st.length), 1); break;
            case 4: { const k = Math.floor(alea() * q.ev.length); const [x] = q.ev.splice(k, 1); q.ev.splice(Math.floor(alea() * (q.ev.length + 1)), 0, x!); break; }
            case 5: m.gate = { mode: m.gate.mode === 'go' ? 'auto' : 'go', g: [] }; break;
            case 6: q.tracks.reverse(); break;
            case 7: q.sens.aff = Math.round(alea() * 100); break;
            case 8: m.tr.push({ a: m.st[0]?.id ?? '', b: '', g: [{ k: 't', op: '≥', v: 5 }], mode: 'any' }); break;
          }
        }
      });
      p = res.apres;
    }
  });
});

describe('découpage en deltas', () => {
  it('≤ 200 opérations par delta', () => {
    const ops: Op[] = Array.from({ length: 450 }, (_, i) => ({ op: 'poser', chemin: ['x' + i], valeur: i }));
    const { deltas, tropGros } = decouper(ops);
    expect(deltas.map((d) => d.length)).toEqual([200, 200, 50]);
    expect(tropGros).toEqual([]);
  });
  it('taille bornée ; une opération seule trop lourde est mise à part', () => {
    const lourd = 'x'.repeat(300 * 1024);
    const moyen = 'y'.repeat(80 * 1024);
    const { deltas, tropGros } = decouper([
      { op: 'poser', chemin: ['a'], valeur: moyen }, { op: 'poser', chemin: ['b'], valeur: moyen },
      { op: 'poser', chemin: ['c'], valeur: moyen }, { op: 'poser', chemin: ['d'], valeur: lourd },
    ]);
    expect(deltas.map((d) => d.length)).toEqual([2, 1]);
    expect(tropGros.length).toBe(1);
  });
});
