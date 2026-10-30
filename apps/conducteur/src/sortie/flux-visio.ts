// Registre des flux de la visio de scène (scène native « visio ») : poste → MediaStream.
// Rempli par visio-rtc.ts (liaisons WebRTC avec les téléphones nommés, signalisation `rtc` du serveur de spectacle) :
// poserFluxVisio(acteur, flux) à l'arrivée des pistes, poserFluxVisio(acteur, null) à la fin ou à la coupure ; vidé à
// la fermeture de la page. Sans flux, les cadres montrent la mire de flux/mire.ts avec « connexion… ».
import { useSyncExternalStore } from 'react';

const flux = new Map<string, MediaStream>();
const abonnes = new Set<() => void>();
let version = 0;

/** Pose (ou retire, null) le flux d'un poste ('franck', 'ministre'…). */
export function poserFluxVisio(poste: string, f: MediaStream | null): void {
  if (f) { if (flux.get(poste) === f) return; flux.set(poste, f); }
  else if (!flux.delete(poste)) return;
  version++;
  for (const a of [...abonnes]) a();
}

export function fluxVisio(poste: string): MediaStream | null { return flux.get(poste) ?? null; }

export function abonnerFluxVisio(fn: () => void): () => void {
  abonnes.add(fn);
  return () => { abonnes.delete(fn); };
}

/** Retire tous les flux (tests, fin de la visio). */
export function viderFluxVisio(): void {
  if (!flux.size) return;
  flux.clear();
  version++;
  for (const a of [...abonnes]) a();
}

/** Le flux d'un poste, suivi (re-rendu quand il arrive ou part). */
export function useFluxVisio(poste: string): MediaStream | null {
  useSyncExternalStore(abonnerFluxVisio, () => version, () => 0);
  return fluxVisio(poste);
}
