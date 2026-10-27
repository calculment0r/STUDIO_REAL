// Réception côté SORTIE quand plusieurs régies et plusieurs chemins arrivent (chantier BASCULE). Logique PURE.
//
//   - FiltreDoublons : le même message arrivé par le canal local ET par la salle (une régie sur la même machine qui
//     tient les deux) n'est traité qu'une fois — sinon un vote ou une réaction compterait double ;
//   - arbitrerScene  : plusieurs régies (Conducteur, moniteur, autre machine) publient des scènes ; la sortie garde la
//     DÉCISION LA PLUS RÉCENTE. Les numéros `n` de chaque régie repartent à 1 à son ouverture : ils ne servent pas.
//     Une régie renvoie sa scène (arrivée d'une sortie, reconnexion) avec l'heure de décision d'origine (`depuis`) :
//     un renvoi ancien ne reprend donc pas la main à une commande plus récente d'une autre régie.

/** Décision de scène retenue par la sortie. */
export interface DecisionScene {
  /** régie qui l'a prise ('' : régie sans identifiant, ancienne version) */
  source: string;
  /** heure de la décision dans l'horloge de la régie */
  depuis: number;
  /** heure de la décision ramenée à l'horloge de la sortie */
  local: number;
}

/**
 * Décide si une scène reçue remplace la scène retenue. Renvoie la nouvelle décision, ou null si la scène est plus
 * ancienne que la décision en cours (elle est alors ignorée).
 *   - même régie : on compare ses propres heures (exact) ;
 *   - autre régie : on compare les heures ramenées à l'horloge de la sortie (âge de la décision = heure - depuis,
 *     mesuré dans l'horloge de la régie, retranché de l'heure d'arrivée) : aucune synchronisation d'horloges requise.
 * Un message sans `depuis` (ancienne régie) compte comme décidé à son envoi.
 */
export function arbitrerScene(
  courante: DecisionScene | null,
  m: { heure: number; source?: string; depuis?: number },
  recuLocal: number,
): DecisionScene | null {
  const source = m.source ?? '';
  const depuis = m.depuis ?? m.heure;
  const age = Math.max(0, m.heure - depuis);
  const d: DecisionScene = { source, depuis, local: recuLocal - age };
  if (!courante) return d;
  if (source && source === courante.source) return depuis >= courante.depuis ? d : null;
  return d.local >= courante.local ? d : null;
}

/** Retient les messages vus pendant `dureeMs` : le même message (même contenu, même heure d'envoi) est un doublon. */
export class FiltreDoublons {
  private vus = new Map<string, number>();
  private readonly dureeMs: number;
  constructor(dureeMs = 10_000) { this.dureeMs = dureeMs; }

  /** true si le message est nouveau (à traiter), false si c'est un doublon. */
  nouveau(m: unknown, maintenant = Date.now()): boolean {
    let cle: string;
    try { cle = JSON.stringify(m); } catch { return true; }
    if (this.vus.size > 200) for (const [k, t] of this.vus) if (maintenant - t > this.dureeMs) this.vus.delete(k);
    const t = this.vus.get(cle);
    if (t !== undefined && maintenant - t <= this.dureeMs) return false;
    this.vus.set(cle, maintenant);
    return true;
  }
}
