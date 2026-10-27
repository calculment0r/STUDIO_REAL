// Bouton de la régie : ouvre (ou ramène) la fenêtre de sortie écran scène et montre son état (et, dans sa bulle,
// une vidéo introuvable sur la sortie ou une autre régie qui a pris la main).
//   fermée    → pastille éteinte
//   ouverte   → pastille ambre (la fenêtre existe mais ne répond pas encore)
//   connectée → pastille verte (battement reçu il y a moins de 3,5 s)
import { ouvrirSortieScene } from './fenetre';
import { useSortie, type EtatFenetre } from './relais';
import './sortie.css';

const LIBELLES: Record<EtatFenetre, string> = {
  fermee: 'Sortie écran scène fermée · ouvrir la fenêtre à glisser sur le projecteur',
  ouverte: 'Sortie écran scène ouverte · en attente de connexion',
  connectee: 'Sortie écran scène connectée · ramener la fenêtre',
};

export const IcoSortieScene = () => (
  <svg width="15" height="14" viewBox="0 0 15 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="1.5" y="1.5" width="12" height="8" rx="1" /><path d="M5 12.5h5M7.5 9.5v3" /><path d="M6 4l3 1.5L6 7z" fill="currentColor" stroke="none" />
  </svg>
);

export function BoutonSortieScene({ ecran = 'secondaire', className = 'btn-carre' }: { ecran?: 'secondaire' | 'courant'; className?: string }) {
  const fenetre = useSortie((s) => s.fenetre);
  const salle = useSortie((s) => s.salle);
  const absent = useSortie((s) => (s.fenetre === 'connectee' ? s.sortie?.absent : undefined));
  const autre = useSortie((s) => s.fenetre === 'connectee' && s.autreRegie);
  const titre = LIBELLES[fenetre] + (salle === 'connecte' ? ' · relais par la salle actif' : '')
    + (autre ? ' · une autre régie a la main (moniteur, autre machine)' : '')
    + (absent ? ` · ⚠ ${absent} introuvable sur la sortie : choisir le dossier médias (touche M sur la sortie)` : '');
  return (
    <button
      type="button"
      className={className + ' so-bouton' + (fenetre === 'connectee' ? ' on' : '')}
      data-etat={fenetre}
      data-alerte={absent ? 'media-absent' : undefined}
      onClick={() => ouvrirSortieScene({ ecran })}
      title={titre}
      aria-label={titre}
    >
      <IcoSortieScene />
      <span className="so-pastille" />
    </button>
  );
}
