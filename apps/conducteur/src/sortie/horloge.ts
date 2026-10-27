// Synchro de l'heure régie ↔ sortie (PUR). Chaque message de la régie porte son Date.now() à l'envoi ; à la
// réception, échantillon = heure régie − heure locale = décalage vrai − latence. Le plus grand échantillon récent est
// celui de plus faible latence : c'est l'estimation retenue (même machine : ≈ 0 ; autre machine : écart d'horloge).
import type { Compteur } from './protocole';

export class Horloge {
  private echantillons: number[] = [];
  private readonly taille: number;
  constructor(taille = 24) { this.taille = taille; }

  /** Ajoute un échantillon (heure de la régie dans le message, heure locale de réception). */
  noter(heureRegie: number, heureLocale: number): void {
    this.echantillons.push(heureRegie - heureLocale);
    if (this.echantillons.length > this.taille) this.echantillons.shift();
  }

  /** Décalage estimé (ms) : heure régie ≈ heure locale + decalage. */
  get decalage(): number {
    return this.echantillons.length ? Math.max(...this.echantillons) : 0;
  }

  /** Heure de la régie maintenant. */
  maintenant(local = Date.now()): number { return local + this.decalage; }
}

/** Secondes restantes d'un compteur reçu à `heureMsg` (heure régie), lues à `heureRegie`. */
export function restantCompteur(c: Compteur, heureMsg: number, heureRegie: number): number {
  if (!c.enCours) return Math.max(0, c.restant);
  return Math.max(0, c.restant - Math.max(0, heureRegie - heureMsg) / 1000 * c.vitesse);
}

/** Affichage MM:SS d'un compte à rebours : arrondi vers le haut (on voit « 00:01 » jusqu'au bout, puis « 00:00 »). */
export function mmssRebours(s: number): string {
  const v = Math.max(0, Math.ceil(s - 1e-6));
  return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
}
