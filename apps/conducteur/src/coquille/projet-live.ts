// Projets livrés avec l'application : le spectacle LIVE (projets/live/live.conducteur.json), embarqué au build par un
// import JSON (morceau séparé, chargé seulement quand on l'ouvre). Il s'ouvre EN LOCAL : si une salle collaborative
// est ouverte, on la quitte d'abord (sinon le projet de la salle serait remplacé pour tout le monde).
import { useMagasin } from '../etat/magasin';
import { deconnecterSalle, useSalle } from '../etat/serveur';

/** Ouvre le spectacle LIVE ; renvoie true s'il est ouvert. */
export async function chargerLive(): Promise<boolean> {
  const s = useMagasin.getState();
  if (s.verrou) { s.signaler('Verrouillé · mode scène. Désactive SCÈNE en haut pour ouvrir un autre projet.'); return false; }
  try {
    const module = await import('../../../../projets/live/live.conducteur.json');
    if (useSalle.getState().salle) deconnecterSalle(true);
    const avant = useMagasin.getState().projet;
    useMagasin.getState().importer(JSON.stringify(module.default));
    const m = useMagasin.getState();
    if (m.projet === avant) return false;
    m.revenirAuDebut();
    m.selectionner({});
    m.signaler('Spectacle LIVE ouvert · ' + m.projet.ev.length + ' moments');
    return true;
  } catch (e) {
    useMagasin.getState().signaler('Spectacle LIVE illisible : ' + (e as Error).message);
    return false;
  }
}

/** `?projet=live` dans l'adresse : ouvre le spectacle LIVE au démarrage (écran de régie préparé, captures). */
export function projetDemandeParAdresse(): 'live' | null {
  try { return new URLSearchParams(window.location.search).get('projet') === 'live' ? 'live' : null; } catch { return null; }
}
