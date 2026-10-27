// Transports du canal régie ↔ sortie (chantier SORTIE SCÈNE).
//
// Un transport porte des messages JSON opaques (MessageRegie / MessageSortie, validés à l'arrivée par protocole.ts) :
//   - transportLocal()        : BroadcastChannel(NOM_CANAL) — régie et sortie dans le même navigateur, même machine ;
//   - new TransportSalle(...) : la salle du serveur (src/sortie/salle.ts) — régie et projecteur sur deux machines.
// La régie peut en tenir plusieurs à la fois (relais.ts) ; la sortie en écoute un seul, choisi par son adresse.
import { NOM_CANAL } from './protocole';

export type StatutTransport = 'connexion' | 'connecte' | 'hors-ligne' | 'ferme';

export interface Transport {
  readonly nom: 'local' | 'salle';
  envoyer(m: unknown): void;
  /** Abonne un écouteur ; renvoie la fonction de désabonnement. */
  ecouter(fn: (m: unknown) => void): () => void;
  /** Statut de la liaison (le local est toujours « connecte ») ; renvoie la fonction de désabonnement. */
  statut(fn: (s: StatutTransport) => void): () => void;
  fermer(): void;
}

/** Transport par BroadcastChannel ; sans BroadcastChannel (très vieux navigateur, tests), un transport muet. */
export function transportLocal(nomCanal = NOM_CANAL): Transport {
  const BC = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
  const canal = BC ? new BC(nomCanal) : null;
  const ecouteurs = new Set<(m: unknown) => void>();
  if (canal) canal.onmessage = (e: MessageEvent) => { for (const f of ecouteurs) f(e.data); };
  return {
    nom: 'local',
    envoyer(m) { try { canal?.postMessage(m); } catch { /* fermé */ } },
    ecouter(fn) { ecouteurs.add(fn); return () => { ecouteurs.delete(fn); }; },
    statut(fn) { fn(canal ? 'connecte' : 'ferme'); return () => {}; },
    fermer() { ecouteurs.clear(); try { canal?.close(); } catch { /* déjà fermé */ } },
  };
}

/** Deux transports reliés en mémoire (tests de la régie et de la sortie sans navigateur). */
export function paireMemoire(): [Transport, Transport] {
  type Ecouteurs = Set<(m: unknown) => void>;
  const fab = (moi: Ecouteurs, autre: Ecouteurs): Transport => ({
    nom: 'local',
    envoyer(m) { const copie = JSON.parse(JSON.stringify(m)) as unknown; for (const f of [...autre]) f(copie); },
    ecouter(fn) { moi.add(fn); return () => { moi.delete(fn); }; },
    statut(fn) { fn('connecte'); return () => {}; },
    fermer() { moi.clear(); },
  });
  const ea: Ecouteurs = new Set(), eb: Ecouteurs = new Set();
  return [fab(ea, eb), fab(eb, ea)];
}
