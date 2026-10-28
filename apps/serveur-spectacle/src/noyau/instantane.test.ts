// Instantané et reprise : l'état complet se copie, se relit et repart à l'identique (empreinte JSON) ; le lecteur est
// reconstruit en rejouant ses entrées ; les clients reprennent avec leur vseq.
import { describe, expect, it } from 'vitest';
import { Representation } from './representation';
import { aleaFixe, banc, messages, projetBanc } from './banc-test';
import { empreinteDe, jsonStable } from './outils';

/** Une soirée du banc bien remplie : votes, fx, forçage, agents, panique levée, textes. */
function soiree() {
  const b = banc();
  b.lancer();
  b.salle(4);
  b.hello('agent_fig', 'agent', 'figurants');
  b.secondes(10);
  b.voter('pub_s1', 0);
  b.voter('pub_s2', 1);
  b.envoyer('pub_s3', { t: 'in', k: 'texte', data: { texte: 'Oui mais non' } });
  b.envoyer('regie_1', { t: 'conduite', op: 'forcer', acteur: 'ministre', vue: { ecran: 'vote-compteur', params: { numero: 1 } } });
  b.envoyer('regie_1', { t: 'conduite', op: 'panique', actif: true });
  b.envoyer('regie_1', { t: 'conduite', op: 'panique', actif: false });
  b.secondes(10);
  b.voter('pub_s3', 0);
  b.secondes(15);
  b.top();
  b.secondes(3);
  return b;
}

/** Nouvelle représentation du même projet, à la même heure, restaurée depuis `x`. */
function reprise(b: ReturnType<typeof banc>, x: unknown) {
  const rep = new Representation({ projet: projetBanc(), horloge: () => b.h.now, alea: aleaFixe(3) });
  const r = rep.restaurer(x);
  return { rep, r };
}

describe('instantané et restauration', () => {
  it('instantané → restauration → instantané : empreinte JSON identique', () => {
    const b = soiree();
    const avant = b.rep.instantane();
    expect(avant.entrees.length).toBeGreaterThan(3);
    expect(Object.keys(avant.votes)).toEqual(['1']);
    const { rep, r } = reprise(b, JSON.parse(JSON.stringify(avant)));
    expect(r).toEqual({ divergence: false, projetModifie: false });
    expect(empreinteDe(rep.instantane())).toBe(empreinteDe(avant));
    expect(jsonStable(rep.etatLecture())).toBe(jsonStable(b.rep.etatLecture()));
  });

  it('l’instantané contient les cseq vus par session et les vseq de chaque flux', () => {
    const b = soiree();
    const x = b.rep.instantane();
    expect(x.sessions.regie_1).toMatchObject({ role: 'regie', cseq: 4, connectee: true });
    expect(x.sessions.pub_s1!.cseq).toBe(1);
    expect(x.flux.public!.vue.vseq).toBeGreaterThan(2);
    const { rep } = reprise(b, x);
    // un top rejoué avec un cseq déjà vu reste un doublon après la reprise
    expect(rep.recevoir('regie_1', { t: 'conduite', cseq: 4, op: 'top' })[0]!.m).toMatchObject({ t: 'ack', statut: 'doublon' });
  });

  it('après la reprise, le futur est le même que sans interruption (mêmes sorties, même état)', () => {
    const b = soiree();
    const { rep } = reprise(b, b.rep.instantane());
    const suite = (r: Representation) => {
      const out = [];
      for (let i = 0; i < 12; i++) { b.h.now += 1000; out.push(...r.tick(1)); }
      out.push(...r.recevoir('agent_fig', { t: 'agent.ack', n: 1, statut: 'fait' }));
      return out;
    };
    const t0 = b.h.now;
    const a = suite(b.rep);
    b.h.now = t0;
    const c = suite(rep);
    expect(jsonStable(c)).toBe(jsonStable(a));
    expect(empreinteDe(rep.instantane())).toBe(empreinteDe(b.rep.instantane()));
    expect(rep.etatLecture()!.etape).toBe('lumiere');
  });

  it('reprise d’une session avec un vseq en retard : bienvenue porte la vue courante', () => {
    const b = soiree();
    const courante = b.rep.vue('public')!;
    const { rep } = reprise(b, b.rep.instantane());
    rep.redemarrer();
    const [s] = rep.recevoir('pub_s1', { t: 'hello', v: 2, role: 'acteur', acteur: 'public', personne: 'tel_001', session: 'pub_s1', jeton: 'x', vseq: 1, cseq: 1 });
    expect(s!.m).toMatchObject({ t: 'bienvenue', cseq: 1, vue: { ecran: courante.ecran, vseq: courante.vseq, params: courante.params } });
    expect(courante.vseq).toBeGreaterThan(1);
    // resync : la vue courante, encore
    expect(rep.recevoir('pub_s1', { t: 'resync' })[0]!.m).toMatchObject({ t: 'vue', vseq: courante.vseq });
  });

  it('les vseq continuent après la reprise (jamais de recul)', () => {
    const b = soiree();
    const { rep } = reprise(b, b.rep.instantane());
    const vseq = rep.vue('public')!.vseq;
    rep.recevoir('regie_1', { t: 'conduite', cseq: 50, op: 'allerA', moment: 'm1' });
    expect(rep.vue('public')!.vseq).toBe(vseq + 1);
  });

  it('redémarrage : toutes les sessions sont fermées, les présents tombent à 0, le journal le dit', () => {
    const b = soiree();
    const { rep } = reprise(b, b.rep.instantane());
    rep.journal();
    rep.redemarrer();
    expect(rep.signaux().pres).toBe(0);
    expect(Object.values(rep.instantane().sessions).some(s => s.connectee)).toBe(false);
    expect(rep.journal().find(e => e.type === 'demarrage')).toMatchObject({ sessionsFermees: 8 });
  });

  it('instantané illisible refusé ; état de lecture divergent signalé', () => {
    const b = soiree();
    expect(() => reprise(b, { format: 'autre' })).toThrow(/illisible/);
    expect(() => reprise(b, null)).toThrow();
    const x = b.rep.instantane();
    x.lecture = '0000000000000000';
    const { rep, r } = reprise(b, x);
    expect(r.divergence).toBe(true);
    expect(rep.journal().some(e => e.type === 'alerte' && e.code === 'reprise-divergente')).toBe(true);
  });

  it('les avances identiques sont comptées, pas recopiées (instantané compact)', () => {
    const b = banc();
    b.lancer();
    b.secondes(10);   // jusqu'au vote
    const n = b.rep.instantane().entrees.length;
    b.secondes(500);   // vote bloqué, rien ne change
    const x = b.rep.instantane();
    expect(x.entrees.length).toBeLessThanOrEqual(n + 1);
    expect(x.entrees[x.entrees.length - 1]).toMatchObject({ k: 'avancer', dt: 1 });
    expect((x.entrees[x.entrees.length - 1] as { x?: number }).x).toBeGreaterThan(400);
  });

  it('nouvelle représentation (lancer) : votes et commandes repartent de zéro, les vseq continuent', () => {
    const b = soiree();
    const vseq = b.rep.vue('public')!.vseq;
    const out = b.envoyer('regie_1', { t: 'conduite', op: 'lancer' });
    expect(out[0]!.m).toMatchObject({ t: 'ack', statut: 'ok' });
    const x = b.rep.instantane();
    expect(x.votes).toEqual({});
    expect(x.commandes).toEqual([]);
    expect(messages(out, 'vue').find(v => v.acteur === 'public')!.vseq).toBe(vseq + 1);
    expect(b.rep.etatLecture()).toMatchObject({ moment: 'm1', etape: 'accueil' });
  });
});
