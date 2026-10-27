// Cœur de la synchronisation du projet avec la salle : PUR (ni réseau, ni React, ni magasin), testé sous vitest.
//
// Trois états du projet :
//   confirme : la copie de travail du serveur au numéro `seq` (deltas appliqués dans l'ordre reçu) ;
//   envoyes  : nos deltas envoyés, pas encore revenus (écho `modif` de notre session) ;
//   base     : confirme + envoyes = ce que le serveur aura quand nos envois seront passés.
// Le projet LOCAL (celui du magasin) = base + les modifications pas encore envoyées. Celles-ci se calculent toujours
// par différence : diffProjet(base, local). Rien n'est donc perdu hors ligne : au retour, on rebase et on envoie.
//
// Quand un delta d'un autre arrive : confirme ← delta ; base ← confirme + envoyes ; local ← base + (local − ancienne base).
// Quand notre delta revient (écho) : il passe de envoyes à confirme ; base et local ne changent pas.
// Refus du serveur : le delta est retiré d'envoyes et le local rebasé (la modification refusée disparaît).
// Après une reconnexion (instantané) : les envois non acquittés sont renvoyés avec le même cseq (le serveur ignore les
// doublons) ; tant que leurs accusés ne sont pas revenus, on ne rebase pas le local (un delta déjà appliqué pourrait
// l'être deux fois dans la prévision).
import type { Projet } from '@studio-real/modele';
import { appliquerOps, appliquerSouple, copie, decouper, diffProjet, essayerOps, type Op } from './ops';

export interface DeltaEnvoye { cseq: number; ops: Op[]; renvoye?: boolean }

export interface ModifRecue { seq: number; ops: Op[]; par: string; session: string; cseq: number }

/** Résultat d'un événement : `local` = nouveau projet local à poser (absent : inchangé) ; `resync` : demander un instantané. */
export interface Effet { local?: Projet; resync?: boolean; refus?: string; tropGros?: number }

export class Synchro {
  seq = 0;
  confirme: Projet | null = null;
  envoyes: DeltaEnvoye[] = [];
  private base: Projet | null = null;
  /** en attente d'un instantané demandé (trou dans les seq) : les deltas reçus d'ici là sont ignorés */
  attenteInstantane = false;
  readonly session: string;

  constructor(session: string) { this.session = session; }

  get pret(): boolean { return this.confirme !== null; }
  get enRattrapage(): boolean { return this.envoyes.some((d) => d.renvoye); }
  /** Modifications locales pas encore envoyées ? */
  aEnvoyer(local: Projet): boolean { return !!this.base && diffProjet(this.base, local).length > 0; }

  /**
   * Instantané (bienvenue, resync, version externe). `premier` : première connexion à ce projet → le local est remplacé
   * par le serveur. Sinon les modifications locales non envoyées sont rebasées dessus.
   */
  instantane(seq: number, projet: Projet, local: Projet | null, o: { premier?: boolean; reconnexion?: boolean } = {}): Effet {
    const nonEnvoye = !o.premier && this.base && local ? diffProjet(this.base, local) : [];
    this.seq = seq;
    this.confirme = copie(projet);
    this.attenteInstantane = false;
    if (o.premier) this.envoyes = [];
    if (o.reconnexion) for (const d of this.envoyes) d.renvoye = true;
    if (this.enRattrapage) {
      // on garde la prévision actuelle jusqu'aux accusés des renvois
      if (!this.base) this.base = copie(projet);
      return {};
    }
    this.base = this.recalculerBase();
    const nouveau = copie(this.base);
    appliquerSouple(nouveau, nonEnvoye);
    return { local: nouveau };
  }

  /** Bienvenue « à jour » (le serveur n'a rien appliqué depuis, aucun de nos envois non plus) : on garde tout,
   *  les envois non acquittés seront renvoyés tels quels. */
  aJour(seq: number): void {
    this.seq = seq;
    this.attenteInstantane = false;
  }

  /** Prépare l'envoi des modifications locales : deltas avec leur cseq (fourni par `cseq()`), déjà comptés comme envoyés. */
  preparer(local: Projet, cseq: () => number): { deltas: DeltaEnvoye[]; tropGros: number } {
    if (!this.base) return { deltas: [], tropGros: 0 };
    const ops = diffProjet(this.base, local);
    if (!ops.length) return { deltas: [], tropGros: 0 };
    const { deltas, tropGros } = decouper(ops);
    const res = deltas.map((d) => ({ cseq: cseq(), ops: d }));
    this.envoyes.push(...res);
    this.base = copie(local);
    return { deltas: res, tropGros: tropGros.length };
  }

  /** Les deltas à renvoyer après une reconnexion (dans l'ordre des cseq). */
  aRenvoyer(): DeltaEnvoye[] { return [...this.envoyes]; }

  /** Delta reçu du serveur (`modif`). */
  recevoir(m: ModifRecue, local: Projet): Effet {
    if (!this.confirme) return {};
    const nous = m.session === this.session;
    if (this.attenteInstantane) {
      // l'instantané demandé contiendra ce delta ; notre écho sort simplement de la file
      if (nous) this.envoyes = this.envoyes.filter((d) => d.cseq !== m.cseq);
      return {};
    }
    if (m.seq <= this.seq) return {};                       // déjà vu (rejeu)
    if (m.seq !== this.seq + 1) { this.attenteInstantane = true; return { resync: true }; }
    try {
      appliquerOps(this.confirme, m.ops);
    } catch {
      this.attenteInstantane = true;                          // copie divergente : on repart de l'instantané
      return { resync: true };
    }
    this.seq = m.seq;
    const i = nous ? this.envoyes.findIndex((d) => d.cseq === m.cseq) : -1;
    if (i >= 0) {
      const tete = i === 0 && !this.envoyes[0]!.renvoye;
      this.envoyes.splice(i, 1);
      if (tete) return {};                                  // cas normal : base et local déjà à jour
      return this.rebaser(local);
    }
    return this.rebaser(local);
  }

  /** Accusé d'une modification (statut du serveur). */
  accuse(cseq: number, statut: string, raison: string | undefined, local: Projet): Effet {
    const i = this.envoyes.findIndex((d) => d.cseq === cseq);
    if (i < 0) return {};
    if (statut === 'ok') {
      // l'écho `modif` arrive avant l'accusé : s'il manque, la copie a un trou
      if (this.attenteInstantane) { this.envoyes.splice(i, 1); return {}; }
      return { resync: true };
    }
    this.envoyes.splice(i, 1);
    if (statut === 'doublon') {
      // déjà appliqué avant la coupure : l'instantané reçu le contient
      return this.enRattrapage ? {} : this.rebaser(local);
    }
    const e = this.enRattrapage ? {} : this.rebaser(local);
    return { ...e, refus: raison ?? statut };
  }

  /** Repose base = confirme + envoyes et rebase les modifications locales non envoyées. */
  rebaser(local: Projet): Effet {
    if (!this.confirme || this.enRattrapage) return {};
    const nonEnvoye = this.base ? diffProjet(this.base, local) : [];
    this.base = this.recalculerBase();
    const nouveau = copie(this.base);
    appliquerSouple(nouveau, nonEnvoye);
    return { local: nouveau };
  }

  private recalculerBase(): Projet {
    const b = copie(this.confirme!);
    // comme le serveur : chaque delta tout ou rien ; un delta qui ne s'applique plus sera refusé
    for (const d of this.envoyes) essayerOps(b, d.ops);
    return b;
  }
}
