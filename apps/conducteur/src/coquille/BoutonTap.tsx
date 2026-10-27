// Gros bouton TAP en bas de l'écran (spectacle du soir) : passe à l'étape suivante. Grisé tant que la lecture n'est pas
// arrêtée sur un passage « go » ; disponible seulement quand on peut passer. Avant le début : il lance la lecture.
import { useMagasin } from '../etat/magasin';

export function BoutonTap() {
  const lecture = useMagasin((s) => s.lecture);
  const projet = useMagasin((s) => s.projet);
  const top = useMagasin((s) => s.top);
  const lancer = useMagasin((s) => s.lancer);
  const pret = !!lecture?.attenteGo;
  const pasCommence = !lecture;
  const i = lecture ? projet.ev.findIndex((m) => m.id === lecture.moment) : -1;
  const suivant = i >= 0 ? projet.ev[i + 1]?.name : projet.ev[0]?.name;
  const actif = pret || pasCommence;
  return (
    <button type="button" className={'tap-geant' + (actif ? ' pret' : '')} disabled={!actif}
      onClick={() => (pasCommence ? lancer() : top())}
      title={actif ? 'Passer à l’étape suivante' : 'Attendre : l’étape en cours n’est pas finie'}>
      <b>{pasCommence ? 'DÉMARRER' : 'TAP'}</b>
      <span>{actif ? (suivant ? '→ ' + suivant : 'fin') : 'en cours…'}</span>
    </button>
  );
}
