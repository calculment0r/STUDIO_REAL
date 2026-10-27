// Synchronisation sans réseau : un faux serveur qui suit les règles de la salle (ordre total, deltas tout ou rien,
// cseq idempotents par session, écho à tous) et des clients qui livrent leurs messages quand le test le décide.
import { describe, expect, it } from 'vitest';
import { exempleDemo, type Projet } from '@studio-real/modele';
import { appliquerOps, copie, ErreurOp, type Op } from './ops';
import { Synchro, type Effet } from './synchro';

type Recu =
  | { t: 'modif'; seq: number; ops: Op[]; par: string; session: string; cseq: number }
  | { t: 'ack'; cseq: number; statut: string; raison?: string }
  | { t: 'instantane'; seq: number; projet: Projet };

class FauxServeur {
  seq = 0;
  projet: Projet;
  derniers = new Map<string, number>();
  clients: Client[] = [];
  /** moments verrouillés : refus si quelqu'un d'autre modifie */
  verrous = new Map<string, string>();
  constructor(p: Projet) { this.projet = copie(p); }

  soumettre(c: Client, cseq: number, ops: Op[]) {
    const dernier = this.derniers.get(c.session) ?? 0;
    if (cseq <= dernier) { c.boite.push({ t: 'ack', cseq, statut: 'doublon' }); return; }
    this.derniers.set(c.session, cseq);
    for (const o of ops) {
      const s = o.chemin[1];
      const id = o.chemin[0] === 'ev' && typeof s === 'object' ? s.id : undefined;
      const tient = id ? this.verrous.get(id) : undefined;
      if (tient && tient !== c.session) { c.boite.push({ t: 'ack', cseq, statut: 'refus', raison: 'verrouille:moment:' + id + ':X' }); return; }
    }
    try { appliquerOps(this.projet, ops); } catch (e) {
      c.boite.push({ t: 'ack', cseq, statut: 'refus', raison: (e as ErreurOp).code });
      return;
    }
    this.seq++;
    for (const x of this.clients) if (x.connecte) x.boite.push({ t: 'modif', seq: this.seq, ops: copie(ops), par: c.session, session: c.session, cseq });
    c.boite.push({ t: 'ack', cseq, statut: 'ok' });
  }
}

class Client {
  local: Projet;
  s: Synchro;
  cseq = 0;
  boite: Recu[] = [];
  connecte = true;
  ecritures = 0;
  refus: string[] = [];
  session: string;
  serveur: FauxServeur;
  constructor(session: string, serveur: FauxServeur) {
    this.session = session;
    this.serveur = serveur;
    this.s = new Synchro(session);
    this.local = copie(serveur.projet);
    this.s.instantane(serveur.seq, serveur.projet, this.local, { premier: true });
    serveur.clients.push(this);
  }
  editer(f: (p: Projet) => void) { const p = copie(this.local); f(p); this.local = p; }
  envoyer() {
    if (!this.connecte) return;
    const { deltas } = this.s.preparer(this.local, () => ++this.cseq);
    for (const d of deltas) this.serveur.soumettre(this, d.cseq, d.ops);
  }
  private effet(e: Effet) {
    if (e.local) { this.local = e.local; this.ecritures++; }
    if (e.refus) this.refus.push(e.refus);
    if (e.resync) this.boite.push({ t: 'instantane', seq: this.serveur.seq, projet: copie(this.serveur.projet) });
  }
  livrer(n = Infinity) {
    while (this.boite.length && n-- > 0) {
      const m = this.boite.shift()!;
      if (m.t === 'modif') this.effet(this.s.recevoir(m, this.local));
      else if (m.t === 'ack') this.effet(this.s.accuse(m.cseq, m.statut, m.raison, this.local));
      else this.effet(this.s.instantane(m.seq, m.projet, this.local));
    }
  }
  couper() { this.connecte = false; this.boite = []; }
  /** Reconnexion : instantané (bienvenue) puis renvoi des deltas non acquittés avec leur cseq d'origine. */
  reconnecter() {
    this.connecte = true;
    this.effet(this.s.instantane(this.serveur.seq, copie(this.serveur.projet), this.local, { reconnexion: true }));
    for (const d of this.s.aRenvoyer()) this.serveur.soumettre(this, d.cseq, d.ops);
  }
}

const tout = (...cs: Client[]) => { for (let i = 0; i < 4; i++) for (const c of cs) { c.envoyer(); c.livrer(); } };

describe('synchro : deux postes, un serveur', () => {
  it('modifications de champs différents : les deux convergent et gardent tout', () => {
    const srv = new FauxServeur(exempleDemo());
    const a = new Client('sessA_1', srv), b = new Client('sessB_1', srv);
    const [m0, m1] = [srv.projet.ev[0]!.id, srv.projet.ev[1]!.id];
    a.editer((p) => { p.ev[0]!.name = 'par A'; });
    b.editer((p) => { p.ev[1]!.name = 'par B'; });
    a.envoyer(); b.envoyer();
    a.livrer(); b.livrer();
    for (const c of [a, b]) {
      expect(c.local).toEqual(srv.projet);
      expect(c.local.ev.find((m) => m.id === m0)!.name).toBe('par A');
      expect(c.local.ev.find((m) => m.id === m1)!.name).toBe('par B');
    }
  });

  it('même champ en même temps : l\'ordre du serveur décide, tous convergent', () => {
    const srv = new FauxServeur(exempleDemo());
    const a = new Client('sessA_2', srv), b = new Client('sessB_2', srv);
    a.editer((p) => { p.titre = 'A'; });
    b.editer((p) => { p.titre = 'B'; });
    a.envoyer(); b.envoyer();
    a.livrer(); b.livrer();
    expect(srv.projet.titre).toBe('B');
    expect(a.local).toEqual(srv.projet);
    expect(b.local).toEqual(srv.projet);
  });

  it('l\'écho de sa propre modification ne réécrit pas le local (pas de boucle)', () => {
    const srv = new FauxServeur(exempleDemo());
    const a = new Client('sessA_3', srv);
    a.editer((p) => { p.sens.aff = 3; });
    a.envoyer();
    const avant = a.local;
    a.livrer();
    expect(a.ecritures).toBe(0);
    expect(a.local).toBe(avant);
    expect(a.s.envoyes).toEqual([]);
  });

  it('modification locale non envoyée préservée quand un delta distant arrive', () => {
    const srv = new FauxServeur(exempleDemo());
    const a = new Client('sessA_4', srv), b = new Client('sessB_4', srv);
    b.editer((p) => { p.ev[0]!.name = 'distant'; });
    b.envoyer();
    a.editer((p) => { p.ev[1]!.st[0]!.k[2] = 99; });   // pas encore envoyé
    a.livrer();
    expect(a.local.ev[0]!.name).toBe('distant');
    expect(a.local.ev[1]!.st[0]!.k[2]).toBe(99);
    tout(a, b);
    expect(b.local.ev[1]!.st[0]!.k[2]).toBe(99);
    expect(a.local).toEqual(srv.projet);
  });

  it('insertions concurrentes dans le même moment : chemins par id, rien de perdu', () => {
    const srv = new FauxServeur(exempleDemo());
    const a = new Client('sessA_5', srv), b = new Client('sessB_5', srv);
    const etape = (id: string) => ({ id, name: id, ty: 'k:scene', c: 5, r: 0, dx: 0, dy: 0, k: [0, 50, 50] });
    a.editer((p) => { p.ev[0]!.st.push(etape('ea')); });
    b.editer((p) => { p.ev[0]!.st.push(etape('eb')); p.ev[0]!.st[0]!.name = 'renommée par B'; });
    a.envoyer(); b.envoyer();
    tout(a, b);
    const ids = srv.projet.ev[0]!.st.map((e) => e.id);
    expect(ids).toContain('ea');
    expect(ids).toContain('eb');
    expect(a.local).toEqual(srv.projet);
    expect(b.local).toEqual(srv.projet);
  });

  it('refus du serveur (verrou) : la modification refusée disparaît du local, raison remontée', () => {
    const srv = new FauxServeur(exempleDemo());
    const a = new Client('sessA_6', srv);
    srv.verrous.set(srv.projet.ev[0]!.id, 'quelquun');
    const nomAvant = a.local.ev[0]!.name;
    a.editer((p) => { p.ev[0]!.name = 'interdit'; });
    a.envoyer();
    a.livrer();
    expect(a.local.ev[0]!.name).toBe(nomAvant);
    expect(a.refus[0]).toMatch(/^verrouille:moment:/);
    expect(a.local).toEqual(srv.projet);
  });

  it('suppression concurrente puis modification de l\'élément supprimé : refus chemin-introuvable, convergence', () => {
    const srv = new FauxServeur(exempleDemo());
    const a = new Client('sessA_7', srv), b = new Client('sessB_7', srv);
    const id = srv.projet.ev[1]!.id;
    b.editer((p) => { p.ev.splice(1, 1); });
    b.envoyer();
    a.editer((p) => { p.ev[1]!.name = 'trop tard'; });
    a.envoyer();
    tout(a, b);
    expect(srv.projet.ev.some((m) => m.id === id)).toBe(false);
    expect(a.refus).toContain('chemin-introuvable');
    expect(a.local).toEqual(srv.projet);
  });

  it('trou dans les seq : resync puis instantané, local rebasé', () => {
    const srv = new FauxServeur(exempleDemo());
    const a = new Client('sessA_8', srv), b = new Client('sessB_8', srv);
    b.editer((p) => { p.titre = 'un'; }); b.envoyer();
    b.editer((p) => { p.titre = 'deux'; }); b.envoyer();
    a.boite.shift();                                       // un delta perdu
    a.editer((p) => { p.sens.calme = 1; });                // modification locale en cours
    a.livrer();
    expect(a.s.attenteInstantane).toBe(false);
    expect(a.local.titre).toBe('deux');
    expect(a.local.sens.calme).toBe(1);
    tout(a, b);
    expect(b.local.sens.calme).toBe(1);
    expect(a.local).toEqual(srv.projet);
  });
});

describe('synchro : coupures et idempotence', () => {
  it('hors ligne : tout continue en local, puis se resynchronise', () => {
    const srv = new FauxServeur(exempleDemo());
    const a = new Client('sessA_9', srv), b = new Client('sessB_9', srv);
    a.couper();
    a.editer((p) => { p.ev[0]!.name = 'hors ligne'; });
    a.envoyer();                                           // rien ne part
    b.editer((p) => { p.ev[2]!.name = 'pendant ce temps'; });
    tout(b);
    a.reconnecter();
    tout(a, b);
    expect(a.local.ev[0]!.name).toBe('hors ligne');
    expect(a.local.ev[2]!.name).toBe('pendant ce temps');
    expect(a.local).toEqual(srv.projet);
    expect(b.local).toEqual(srv.projet);
  });

  it('envoi appliqué mais accusé perdu : le renvoi est un doublon, rien n\'est appliqué deux fois', () => {
    const srv = new FauxServeur(exempleDemo());
    const a = new Client('sessA_10', srv), b = new Client('sessB_10', srv);
    const etape = { id: 'unique', name: 'u', ty: 'k:scene', c: 1, r: 0, dx: 0, dy: 0, k: [0, 0, 0] };
    a.editer((p) => { p.ev[0]!.st.push(etape); });
    a.envoyer();                                           // appliqué par le serveur…
    a.couper();                                            // …mais l'écho et l'accusé sont perdus
    expect(a.s.envoyes.length).toBe(1);
    a.reconnecter();                                       // instantané (contient l'étape) + renvoi même cseq
    expect(a.boite.map((m) => m.t)).toEqual(['ack']);
    expect((a.boite[0] as { statut: string }).statut).toBe('doublon');
    a.livrer();
    tout(a, b);
    const n = (p: Projet) => p.ev[0]!.st.filter((e) => e.id === 'unique').length;
    expect(n(srv.projet)).toBe(1);
    expect(n(a.local)).toBe(1);
    expect(n(b.local)).toBe(1);
    expect(a.local).toEqual(srv.projet);
  });

  it('envoi jamais arrivé : le renvoi après reconnexion l\'applique une fois', () => {
    const srv = new FauxServeur(exempleDemo());
    const a = new Client('sessA_11', srv);
    a.editer((p) => { p.acts.push({ n: 'Acte perdu' }); });
    const { deltas } = a.s.preparer(a.local, () => ++a.cseq); // préparé mais pas soumis (coupure)
    expect(deltas.length).toBe(1);
    a.couper();
    a.reconnecter();
    a.livrer();
    expect(srv.projet.acts.filter((x) => x.n === 'Acte perdu').length).toBe(1);
    expect(a.local).toEqual(srv.projet);
    expect(a.s.envoyes).toEqual([]);
  });

  it('cseq renvoyés tels quels : le serveur reconnaît chaque doublon', () => {
    const srv = new FauxServeur(exempleDemo());
    const a = new Client('sessA_12', srv);
    for (let i = 0; i < 5; i++) { a.editer((p) => { p.sens.pen = i; }); a.envoyer(); }
    const cseqs = a.s.envoyes.map((d) => d.cseq);
    expect(cseqs).toEqual([1, 2, 3, 4, 5]);
    a.couper();
    a.reconnecter();
    a.livrer();
    expect(srv.seq).toBe(5);
    expect(a.local.sens.pen).toBe(4);
    expect(a.local).toEqual(srv.projet);
  });

  it('fuzz : trois postes, éditions et livraisons dans un ordre aléatoire, convergence finale', () => {
    let graine = 7;
    const alea = () => ((graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const srv = new FauxServeur(exempleDemo());
    const cs = [new Client('sessF_a', srv), new Client('sessF_b', srv), new Client('sessF_c', srv)];
    for (let i = 0; i < 400; i++) {
      const c = cs[Math.floor(alea() * cs.length)]!;
      const r = alea();
      if (r < 0.45) {
        c.editer((p) => {
          const m = p.ev[Math.floor(alea() * p.ev.length)]!;
          const x = alea();
          if (x < 0.3) m.name = `${c.session}-${i}`;
          else if (x < 0.5 && m.st.length) m.st[Math.floor(alea() * m.st.length)]!.k[0] = i % 100;
          else if (x < 0.7) m.st.push({ id: `${c.session}_${i}`, name: 'n', ty: 'k:scene', c: 1, r: 0, dx: 0, dy: 0, k: [0, 0, 0] });
          else if (x < 0.85 && m.st.length > 1) m.st.splice(Math.floor(alea() * m.st.length), 1);
          else p.sens.part = i % 100;
        });
      } else if (r < 0.75) c.envoyer();
      else c.livrer(1 + Math.floor(alea() * 3));
    }
    tout(...cs);
    for (const c of cs) expect(c.local).toEqual(srv.projet);
  });
});
