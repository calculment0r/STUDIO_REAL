// Projets livrés avec l'application : le spectacle LIVE (projets/live/live.conducteur.json) et ÉCHO
// (projets/echo/echo.conducteur.json), embarqués au build par un import JSON (morceaux séparés, chargés seulement quand
// on les ouvre). Ils s'ouvrent EN LOCAL : si une salle collaborative est ouverte, on la quitte d'abord (sinon le projet
// de la salle serait remplacé pour tout le monde).
import { useMagasin } from '../etat/magasin';
import { deconnecterSalle, useSalle } from '../etat/serveur';

export type ProjetEmbarque = 'live' | 'echo';

const PROJETS: Record<ProjetEmbarque, { nom: string; charger: () => Promise<{ default: unknown }> }> = {
  live: { nom: 'Spectacle LIVE', charger: () => import('../../../../projets/live/live.conducteur.json') },
  echo: { nom: 'Spectacle ÉCHO', charger: () => import('../../../../projets/echo/echo.conducteur.json') },
};

/** Ouvre un projet embarqué ; renvoie true s'il est ouvert. */
export async function chargerProjetEmbarque(id: ProjetEmbarque): Promise<boolean> {
  const { nom, charger } = PROJETS[id];
  const s = useMagasin.getState();
  if (s.mode === 'spectacle') { s.signaler('SPECTACLE : structure verrouillée. Passe en RÉPÉTITION pour ouvrir un autre projet.'); return false; }
  try {
    const module = await charger();
    if (useSalle.getState().salle) deconnecterSalle(true);
    const avant = useMagasin.getState().projet;
    useMagasin.getState().importer(JSON.stringify(module.default));
    const m = useMagasin.getState();
    if (m.projet === avant) return false;
    m.revenirAuDebut();
    m.selectionner({});
    m.signaler(nom + ' ouvert · ' + m.projet.ev.length + ' moments');
    return true;
  } catch (e) {
    useMagasin.getState().signaler(nom + ' illisible : ' + (e as Error).message);
    return false;
  }
}

/** Ouvre le spectacle LIVE ; renvoie true s'il est ouvert. */
export const chargerLive = (): Promise<boolean> => chargerProjetEmbarque('live');

/** Ouvre le spectacle ÉCHO ; renvoie true s'il est ouvert. */
export const chargerEcho = (): Promise<boolean> => chargerProjetEmbarque('echo');

/** `?projet=live` ou `?projet=echo` dans l'adresse : ouvre ce spectacle au démarrage (écran de régie préparé, captures). */
export function projetDemandeParAdresse(): ProjetEmbarque | null {
  try {
    const p = new URLSearchParams(window.location.search).get('projet');
    return p === 'live' || p === 'echo' ? p : null;
  } catch { return null; }
}
