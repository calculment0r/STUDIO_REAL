// Gros bouton TAP en bas de l'écran (spectacle du soir). La lecture se met en pause sur chaque passage (losange) ;
// le TAP donne le top et repart. Grisé pendant qu'une étape se joue : disponible seulement quand on peut passer.
import { useMagasin } from '../etat/magasin';

export function BoutonTap() {
  const lecture = useMagasin((s) => s.lecture);
  const enLecture = useMagasin((s) => s.enLecture);
  const projet = useMagasin((s) => s.projet);
  const top = useMagasin((s) => s.top);
  const lancer = useMagasin((s) => s.lancer);
  const auPassage = !!lecture?.attenteGo;
  const actif = !enLecture;
  const i = lecture ? projet.ev.findIndex((m) => m.id === lecture.moment) : -1;
  const ici = i >= 0 ? projet.ev[i]?.name : projet.ev[0]?.name;
  const suivant = i >= 0 ? projet.ev[i + 1]?.name : projet.ev[0]?.name;
  return (
    <button type="button" className={'tap-geant' + (actif ? ' pret' : '')} disabled={!actif}
      onClick={() => { if (auPassage) top(); lancer(); }}
      title={actif ? 'Passer à l’étape suivante' : 'Attendre : l’étape en cours se joue'}>
      <b>TAP</b>
      <span>{!actif ? 'en cours : ' + (ici ?? '') : auPassage ? '→ ' + (suivant ?? 'fin') : '▶ ' + (ici ?? '')}</span>
    </button>
  );
}
