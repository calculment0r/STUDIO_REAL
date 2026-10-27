// Salle simulée partagée par tous les aperçus (port de newS / stepS de conducteur-core.js) :
// un seul état, avancé une fois par image par la boucle d'animation commune.

export interface Simulation {
  el: number; voted: number; total: number; lastVote: number; msgI: number; msgT: number; rate: number;
  en: number[]; energy: number; btnT: number; win: number; votes: number[]; counter: number; lockOpen: boolean;
  jauge: number; jh: number[]; remain: number; recu: boolean; vibeFix: boolean;
  _e: number; _vc: number; _m: number; _c: number; _b: number;
}

export function nouvelleSimulation(): Simulation {
  return {
    el: 0, voted: 0, total: 142, lastVote: 0, msgI: 0, msgT: 0, rate: 38, en: Array(60).fill(.25), energy: .3, btnT: -9,
    win: 0, votes: [0, 0, 0], counter: 0, lockOpen: false, jauge: 420, jh: Array(40).fill(420), remain: 90, recu: false,
    vibeFix: true, _e: 0, _vc: 0, _m: 0, _c: 0, _b: 0,
  };
}

/** Répartition des voix A / B / C (salle simulée par défaut du design : pen = 62). */
export const VOIX = { A: Math.round(28 + 62 * .4), B: 100 - Math.round(28 + 62 * .4) - 12, C: 12 };

/** Avance la salle simulée de `dt` secondes ; `now` = horloge des aperçus (secondes). */
export function avancerSimulation(S: Simulation, dt: number, now: number, V = VOIX) {
  S.el += dt; S.remain = 90 - (S.el % 90);
  S.energy = Math.max(0, Math.min(1, S.energy + (Math.random() - .5) * dt * 1.6)); S._e += dt;
  if (S._e > .08) {
    S._e = 0; S.en.push(S.energy); S.en.shift();
    S.jauge = Math.max(0, Math.min(1000, S.jauge + (Math.random() - .45) * 30)); S.jh.push(S.jauge); S.jh.shift();
  }
  S._vc += dt; const nv = Math.round(S.total * Math.min(1, (S._vc % 16) / 12)); if (nv > S.voted) S.lastVote = now; S.voted = nv;
  const f = S.voted / S.total; S.votes = [V.A, V.B, V.C].map((v) => Math.round(v * .8 * f)); S.win = S.votes.indexOf(Math.max(...S.votes));
  S._m += dt; if (S._m > 3.2) { S._m = 0; S.msgI++; S.msgT = now; }
  S._c += dt; if (S._c > 1.4) { S._c = 0; S.counter++; }
  S.lockOpen = Math.floor(now / 4) % 2 === 0; S.recu = Math.floor(now / 5) % 2 === 1;
  const b = Math.floor(now / 6); if (b !== S._b) { S._b = b; S.btnT = now; }
}
