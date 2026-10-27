// Identifiants des nouveaux éléments du projet. Le format historique est `préfixe + ++p.nid` ; en collaboratif, deux
// postes peuvent incrémenter `nid` en même temps et créer le même id. On y ajoute donc une marque propre à ce poste
// (tirée une fois par page), ce qui garde les ids lisibles (« st104·k3f ») et uniques entre postes.
import type { Projet } from '@studio-real/modele';

export const MARQUE_POSTE = Math.random().toString(36).slice(2, 5);

export function nouvelId(p: Projet, prefixe: string): string {
  return `${prefixe}${++p.nid}·${MARQUE_POSTE}`;
}
