// Gros bouton TAP en bas de l'écran (spectacle du soir) : c'est le GO, la même action que l'en-tête, le pupitre, le
// panneau et Espace en SPECTACLE (magasin.go) : un appui = un cue. Il n'est plus grisé pendant l'étape (le GO termine
// l'étape et franchit le passage) ; il pulse quand un passage attend le top ; « GO ✓ » pendant l'anti-rebond.
// (La barre de scène qui le remplacera est un autre lot.)
import { useMagasin } from '../etat/magasin';
import { useGoRecent } from './useGoRecent';

export function BoutonTap() {
  const lecture = useMagasin((s) => s.lecture);
  const enLecture = useMagasin((s) => s.enLecture);
  const projet = useMagasin((s) => s.projet);
  const go = useMagasin((s) => s.go);
  const recent = useGoRecent();
  const termine = !!lecture?.termine;
  const attente = !!lecture?.attenteGo;
  const commence = !!lecture && (enLecture || lecture.t > 0 || (lecture.parcours?.length ?? 0) > 1);
  const i = lecture ? projet.ev.findIndex((m) => m.id === lecture.moment) : -1;
  const ici = i >= 0 ? projet.ev[i]?.name : projet.ev[0]?.name;
  const suivant = i >= 0 ? projet.ev[i + 1]?.name : projet.ev[1]?.name;
  const sous = termine ? 'spectacle terminé'
    : !commence ? '▶ ' + (ici ?? '')
    : attente ? 'attente du top → ' + (suivant ?? 'fin')
    : '→ ' + (suivant ?? 'fin');
  return (
    <button type="button" className={'tap-geant' + (termine ? '' : recent ? ' pret fait' : ' pret') + (attente && !recent ? ' attente' : '')}
      disabled={termine} onClick={() => go()}
      title={termine ? 'Le spectacle est terminé' : 'GO : le cue suivant, maintenant'}>
      <b>{recent ? 'GO ✓' : 'GO'}</b>
      <span>{sous}</span>
    </button>
  );
}
