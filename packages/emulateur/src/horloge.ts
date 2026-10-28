// Horloge ÉMULÉE de la salle : le temps n'avance que lorsqu'on le demande (`avancer`), d'un rendez-vous au suivant.
// Sous Node (vitest) on avance de 30 s en quelques millisecondes ; dans le Conducteur, une boucle l'avance au rythme
// réel multiplié par la vitesse (×1 à ×20). Les tâches dues au même instant passent dans l'ordre où elles ont été
// planifiées : l'exécution est entièrement déterministe.

export interface Horloge {
  /** heure émulée (ms) */
  maintenant(): number;
  /** exécute `fn` dans `ms` millisecondes de temps émulé ; renvoie de quoi l'annuler */
  planifier(ms: number, fn: () => void): () => void;
}

interface Tache { at: number; n: number; fn: () => void; annulee: boolean }

/** Plus d'exécutions que ça pendant un seul `avancer` : une boucle à délai nul, on s'arrête (et on le dit). */
const GARDE = 5_000_000;

export class Ordonnanceur implements Horloge {
  private t: number;
  private n = 0;
  private tas: Tache[] = [];
  /** tâches exécutées depuis la création */
  executees = 0;

  constructor(debut = 0) {
    this.t = debut;
  }

  maintenant(): number { return this.t; }

  planifier(ms: number, fn: () => void): () => void {
    const tache: Tache = { at: this.t + (Number.isFinite(ms) && ms > 0 ? ms : 0), n: this.n++, fn, annulee: false };
    this.pousser(tache);
    return () => { tache.annulee = true; };
  }

  /** Nombre de tâches en attente (annulées comprises tant qu'elles n'ont pas été retirées). */
  get enAttente(): number { return this.tas.length; }

  /** Prochain rendez-vous (ms émulées), ou null. */
  prochain(): number | null {
    while (this.tas.length && this.tas[0]!.annulee) this.retirer();
    return this.tas.length ? this.tas[0]!.at : null;
  }

  /** Avance le temps de `ms` en exécutant, dans l'ordre, tout ce qui est dû. Renvoie le nombre de tâches exécutées. */
  avancer(ms: number): number {
    const fin = this.t + Math.max(0, ms);
    let faites = 0;
    while (this.tas.length) {
      const tete = this.tas[0]!;
      if (tete.at > fin) break;
      this.retirer();
      if (tete.annulee) continue;
      this.t = Math.max(this.t, tete.at);
      tete.fn();
      faites++;
      if (faites > GARDE) throw new Error('Horloge émulée : trop de tâches à délai nul (boucle ?)');
    }
    this.t = fin;
    this.executees += faites;
    return faites;
  }

  /** Oublie toutes les tâches (arrêt de la salle). */
  vider(): void { this.tas = []; }

  // ── tas binaire (at, n) ──
  private avant(a: Tache, b: Tache) { return a.at < b.at || (a.at === b.at && a.n < b.n); }
  private pousser(x: Tache) {
    const tas = this.tas;
    tas.push(x);
    let i = tas.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.avant(tas[i]!, tas[p]!)) break;
      [tas[i], tas[p]] = [tas[p]!, tas[i]!];
      i = p;
    }
  }
  private retirer() {
    const tas = this.tas;
    const der = tas.pop()!;
    if (!tas.length) return;
    tas[0] = der;
    let i = 0;
    for (;;) {
      const g = 2 * i + 1, d = g + 1;
      let m = i;
      if (g < tas.length && this.avant(tas[g]!, tas[m]!)) m = g;
      if (d < tas.length && this.avant(tas[d]!, tas[m]!)) m = d;
      if (m === i) break;
      [tas[i], tas[m]] = [tas[m]!, tas[i]!];
      i = m;
    }
  }
}
