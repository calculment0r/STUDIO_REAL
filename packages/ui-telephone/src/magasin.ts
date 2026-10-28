// Le magasin : la machine d'état pure, plus l'horloge et l'exécution des sorties. Sans React : l'application s'y
// abonne (useSyncExternalStore), l'émulateur l'utilise tel quel pour un téléphone de la foule (sans rendu).
// Les événements arrivés pendant qu'on en traite un (un transport mémoire répond tout de suite) attendent leur tour :
// chaque sortie est exécutée une fois, dans l'ordre.
import { reduire, type EtatTelephone, type Evenement, type Sortie } from './machine';

export interface Magasin {
  envoyer(ev: Evenement): void;
  lire(): EtatTelephone;
  abonner(fn: () => void): () => void;
}

export function creerMagasin(
  initial: EtatTelephone,
  executer: (sorties: Sortie[], etat: EtatTelephone) => void,
  horloge: () => number = () => Date.now(),
): Magasin {
  let etat = initial;
  const abonnes = new Set<() => void>();
  const attente: Evenement[] = [];
  let enCours = false;

  return {
    envoyer(ev) {
      attente.push(ev);
      if (enCours) return;
      enCours = true;
      const avant = etat;
      try {
        while (attente.length) {
          const r = reduire(etat, attente.shift()!, horloge());
          etat = r.etat;
          if (r.sorties.length) {
            try { executer(r.sorties, etat); } catch (e) { console.error('[telephone] sorties', e); }
          }
        }
      } finally {
        enCours = false;
      }
      if (etat !== avant) for (const fn of [...abonnes]) fn();
    },
    lire: () => etat,
    abonner(fn) { abonnes.add(fn); return () => { abonnes.delete(fn); }; },
  };
}
