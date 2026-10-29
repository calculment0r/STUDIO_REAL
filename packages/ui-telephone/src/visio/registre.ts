// La visio du téléphone, installée par l'application (apps/telephone/src/main.tsx) et lue par l'écran `visio-appel`.
// Un registre plutôt qu'une propriété : l'écran reste un composant pur des réglages de la vue ; sans visio installée
// (émulateur du Conducteur, tests de rendu), il montre la place du flux sans rien ouvrir.
import { useSyncExternalStore } from 'react';
import type { VisioTelephone } from './appel';

let courante: VisioTelephone | null = null;
let desabonner: (() => void) | null = null;
let version = 0;
const abonnes = new Set<() => void>();
const prevenir = () => { version++; for (const f of [...abonnes]) f(); };

/** Installe (ou retire, null) la visio du téléphone. */
export function installerVisio(v: VisioTelephone | null): void {
  desabonner?.();
  desabonner = null;
  courante = v;
  if (v) desabonner = v.abonner(prevenir);
  prevenir();
}

export function visioInstallee(): VisioTelephone | null { return courante; }

const abonner = (fn: () => void) => { abonnes.add(fn); return () => { abonnes.delete(fn); }; };

/** La visio installée, suivie (re-rendu à chaque changement : caméra, flux reçus, liaisons). */
export function useVisio(): VisioTelephone | null {
  useSyncExternalStore(abonner, () => version, () => version);
  return courante;
}
