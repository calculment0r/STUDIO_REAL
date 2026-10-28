// Préparation du projet joué par le serveur : il lui faut des acteurs et des envois.
// - Un projet qui déclare ses acteurs est joué tel quel.
// - Un projet du prototype (Écho : `params.cmds` / `params.sortie` sur les étapes, aucun acteur) est converti avec
//   `commandesVersEnvois` et reçoit les acteurs d'Écho (`acteursEcho()`), comme dans les tests du modèle.
// - Sinon, les acteurs sont déduits des cibles des envois (« public » = la foule).
// PUR : aucune entrée-sortie.
import {
  acteursEcho, cibleDansFoule, commandesVersEnvois, creerActeur, type Acteur, type Projet,
} from '@studio-real/modele';
import { cloner } from './outils';

export interface ProjetPrepare {
  projet: Projet;
  /** comment les acteurs ont été obtenus */
  origine: 'declares' | 'conversion-echo' | 'deduits';
  /** étapes dont les commandes du prototype ont été converties en envois */
  converties: number;
}

export function preparerProjet(source: Projet): ProjetPrepare {
  if (Array.isArray(source.acteurs) && source.acteurs.length) return { projet: source, origine: 'declares', converties: 0 };
  const projet = cloner(source);
  let converties = 0;
  for (const m of projet.ev) for (const st of m.st) {
    if (Array.isArray(st.envois) && st.envois.length) continue;
    const envois = commandesVersEnvois(st.params?.cmds, st.params?.sortie);
    if (envois.length) { st.envois = envois; converties++; }
  }
  if (converties) {
    projet.acteurs = acteursEcho();
    return { projet, origine: 'conversion-echo', converties };
  }
  const ids = new Set<string>();
  for (const m of projet.ev) for (const st of m.st) for (const e of st.envois ?? []) {
    const c = cibleDansFoule(e.vers);
    if (c) ids.add(c.acteur);
  }
  projet.acteurs = [...ids].sort().map(id => (id === 'public' ? creerActeur('public', id) : creerActeur('ecran', id, id)));
  return { projet, origine: 'deduits', converties: 0 };
}

/** Acteurs « foule » (cardinalité n) : ce sont eux qui font `pres`, `quorum`, `prets` et les votes. */
export const acteursFoule = (projet: Projet): Acteur[] => (projet.acteurs ?? []).filter(a => a.cardinalite === 'n');

/** Acteurs visés par au moins un envoi ciblé dans la foule ('public:ont-vote:A') : leur vue se calcule par personne. */
export function acteursCibles(projet: Projet): Set<string> {
  const out = new Set<string>();
  const parcourir = (st: { envois?: { vers: string }[] }[]) => {
    for (const s of st) for (const e of s.envois ?? []) {
      const c = cibleDansFoule(e.vers);
      if (c?.filtre) out.add(c.acteur);
    }
  };
  for (const m of projet.ev) parcourir(m.st);
  for (const q of projet.sequences ?? []) parcourir(q.st);
  return out;
}

/** Agent qui exécute une commande du lecteur : 'figurants.cmd' → l'agent des figurants, 'machine' → le pont OSC.
 *  null : commande pour la régie seule (message, chrono, reprise). */
export function agentPour(projet: Projet, type: string): string | null {
  const genre = type === 'figurants.cmd' || type === 'figurants.valider' ? 'figurants' : type === 'machine' ? 'osc' : null;
  if (!genre) return null;
  const a = (projet.acteurs ?? []).find(x => x.type === 'agent' && x.agent?.genre === genre);
  return a ? a.id : genre;
}
