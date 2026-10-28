// Registre des flux de la visio de scène (scène native « visio ») : poste → MediaStream.
// Ce lot n'ouvre AUCUNE liaison WebRTC : le registre reste vide et les cadres montrent la mire de flux/mire.ts avec
// « connexion… ». Le lot visio le remplira (signalisation `rtc` du serveur de spectacle entre les acteurs franck,
// ministre et scene, rapport 4 §4.6) avec poserFluxVisio(poste, flux) ; la scène suit sans rien changer d'autre.
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
