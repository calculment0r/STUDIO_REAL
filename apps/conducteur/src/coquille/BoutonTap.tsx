// Gros bouton TAP en bas de l'écran (spectacle du soir) : passe à l'étape suivante. Grisé tant que l'étape en cours n'est
// pas arrivée à son passage « go » ; disponible seulement quand on peut passer. Lecture arrêtée : il la lance.
import { useMagasin } from '../etat/magasin';

export function BoutonTap() {
  const lecture = useMagasin((s) => s.lecture);
  const enLecture = useMagasin((s) => s.enLecture);
  const projet = useMagasin((s) => s.projet);
  const top = useMagasin((s) => s.top);
  const lancer = useMagasin((s) => s.lancer);
  const pret = enLecture && !!lecture?.attenteGo;
  const arrete = !enLecture;
  const i = lecture ? projet.ev.findIndex((m) => m.id === lecture.moment) : -1;
  const ici = i >= 0 ? projet.ev[i]?.name : projet.ev[0]?.name;
  const suivant = i >= 0 ? projet.ev[i + 1]?.name : projet.ev[0]?.name;
  const actif = pret || arrete;
  return (
    <button type="button" className={'tap-geant' + (actif ? ' pret' : '')} disabled={!actif}
      onClick={() => (arrete ? lancer() : top())}
      title={actif ? 'Passer à l’étape suivante' : 'Attendre : l’étape en cours n’est pas finie'}>
      <b>{arrete ? '▶ LECTURE' : 'TAP'}</b>
      <span>{arrete ? (ici ?? '') : pret ? (suivant ? '→ ' + suivant : 'fin') : 'en cours : ' + (ici ?? '')}</span>
    </button>
  );
}
