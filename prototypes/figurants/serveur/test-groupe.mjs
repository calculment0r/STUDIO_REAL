// Test du groupe de machines Ollama (mode spectacle), sans réseau : fausses machines.
//   node test-groupe.mjs
import assert from 'node:assert/strict';
import { GroupeOllama, Disjoncteur } from './figurants/fournisseurs.mjs';

function machine(nom, comportement) {
  return { machine: nom, modele: 'qwen3:8b', joignable: true, disjoncteur: new Disjoncteur(nom), appels: 0,
    async generer(o) { this.appels++; return comportement(o); } };
}
const ok = (nom) => async (o) => { o.onLigne({ persona: 'p', texte: 'salut ' + nom }, Date.now(), Date.now()); return { t0: Date.now() - 300, t_premier_jeton: Date.now() - 200, t_fin: Date.now(), machine: nom }; };
const panne = async () => { throw new Error('pas de premier jeton'); };
const vus = [];
const o = (signal) => ({ systeme: '', utilisateur: '', nb: 1, signal, onLigne: (x) => vus.push(x.texte) });

// 1. la 1re machine tombe avant toute ligne : le même appel repart sur la 2e
const a = machine('3090', panne); const b = machine('dgx2', ok('dgx2'));
const g = new GroupeOllama([a, b]);
const r1 = await g.generer(o());
assert.equal(r1.machine, 'dgx2'); assert.deepEqual(vus, ['salut dgx2']); assert.equal(a.appels, 1);
console.log('OK   bascule dans le même appel : 3090 en panne → dgx2');

// 2. trois pannes : le disjoncteur de la 3090 s'ouvre, elle n'est plus essayée ; le groupe reste utilisable
await g.generer(o()); await g.generer(o());
const avant = a.appels; await g.generer(o());
assert.equal(a.appels, avant); assert.equal(a.disjoncteur.resume().etat, 'ouvert'); assert.ok(g.disjoncteur.peutEssayer());
console.log('OK   3090 disjonctée après 3 pannes, plus essayée ; groupe toujours utilisable');

// 3. toutes les machines en panne : erreur, et le disjoncteur du groupe finit par s'ouvrir (repli Anthropic / banque)
const g2 = new GroupeOllama([machine('x', panne), machine('y', panne)]);
for (let i = 0; i < 3; i++) await assert.rejects(g2.generer(o()));
assert.equal(g2.disjoncteur.peutEssayer(), false); assert.equal(g2.disjoncteur.resume().etat, 'ouvert');
console.log('OK   toutes les machines en panne : le groupe se déclare ouvert');

// 4. une annulation (COUPE, phrase suivante) n'est pas une panne et ne passe pas à la machine suivante
const c = new AbortController(); c.abort();
const m1 = machine('m1', async () => { throw new Error('annulé'); }); const m2 = machine('m2', ok('m2'));
await assert.rejects(new GroupeOllama([m1, m2]).generer(o(c.signal)));
assert.equal(m2.appels, 0); assert.equal(m1.disjoncteur.evts.filter((e) => !e.ok).length, 0);
console.log('OK   annulation : ni bascule, ni panne comptée');

// 5. des répliques déjà servies puis une panne : on ne recommence pas ailleurs (pas de doublons)
const m3 = machine('m3', async (x) => { x.onLigne({ persona: 'p', texte: 'déjà' }, Date.now(), Date.now()); throw new Error('coupure'); });
const m4 = machine('m4', ok('m4'));
await assert.rejects(new GroupeOllama([m3, m4]).generer(o()));
assert.equal(m4.appels, 0);
console.log('OK   panne après une réplique servie : pas de relance ailleurs');

// 6. une machine injoignable (santé) est sautée sans être appelée
const m5 = machine('m5', ok('m5')); m5.joignable = false; const m6 = machine('m6', ok('m6'));
const r6 = await new GroupeOllama([m5, m6]).generer(o());
assert.equal(r6.machine, 'm6'); assert.equal(m5.appels, 0);
console.log('OK   machine injoignable sautée');
console.log('TOUT EST VERT');
