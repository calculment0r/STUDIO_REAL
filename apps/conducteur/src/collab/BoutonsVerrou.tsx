// <BoutonsVerrou /> : verrous personnels et mode Scène de la salle.
//   « Prendre la main »  : verrou du projet (la régie pendant la représentation) ;
//   « Tenir ce moment »  : verrou du moment choisi (personne d'autre ne le modifie) ;
//   « Passer en Scène »  : le projet est gelé pour tous, sauf pour qui tient la main.
// Un verrou appartient à une personne et survit à sa reconnexion ; « Forcer » ne marche que si son détenteur est parti.
import { useState, type CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMagasin } from '../etat/magasin';
import { useSalle } from '../etat/serveur';
import { actionsCollab } from './useCollab';
import { jetonCouleur, raisonLisible, type Ack, type ModeSalle } from './protocole';
import './collab.css';

const MODES: Record<ModeSalle, string> = { ecrire: 'Écriture', repeter: 'Répétition', jouer: 'Scène' };

export interface PropsBoutonsVerrou {
  /** moment visé par « Tenir ce moment » (défaut : la sélection) */
  moment?: string;
  /** masque la liste des verrous tenus */
  compact?: boolean;
  className?: string;
}

export function BoutonsVerrou({ moment, compact = false, className = '' }: PropsBoutonsVerrou) {
  const { statut, verrous, membres, moi, mode } = useSalle(useShallow((s) => ({ statut: s.statut, verrous: s.verrous, membres: s.membres, moi: s.vous?.personne, mode: s.mode })));
  const selMoment = useMagasin((s) => s.selection.moment);
  const projet = useMagasin((s) => s.projet);
  const [note, setNote] = useState('');
  const connecte = statut === 'connecte';
  const idMoment = moment ?? selMoment;
  const nomMoment = idMoment ? projet.ev.find((m) => m.id === idMoment)?.name : undefined;

  const present = (p: string) => membres.some((m) => m.personne === p);
  const couleur = (p: string) => jetonCouleur(membres.find((m) => m.personne === p)?.couleur, p);
  const vProjet = verrous.find((v) => v.cible === 'projet');
  const cibleMoment = idMoment ? 'moment:' + idMoment : null;
  const vMoment = cibleMoment ? verrous.find((v) => v.cible === cibleMoment) : undefined;

  const faire = (p: Promise<Ack>, ok?: string) => {
    setNote('');
    p.then((a) => setNote(a.statut === 'refus' ? raisonLisible(a.raison ?? 'refus') : ok ?? ''), (e: Error) => setNote(e.message));
  };

  const boutonVerrou = (cible: string, v: typeof vProjet, prendre: string, rendre: string) => {
    if (!v) return <button className="sr-co-bouton" disabled={!connecte} onClick={() => faire(actionsCollab.prendre(cible))}>{prendre}</button>;
    if (v.personne === moi) return <button className="sr-co-bouton on" disabled={!connecte} onClick={() => faire(actionsCollab.rendre(cible))}>{rendre}</button>;
    return (
      <button className="sr-co-bouton danger" disabled={!connecte || present(v.personne)} title={present(v.personne) ? `${v.nom} est en salle` : `${v.nom} est parti : reprendre son verrou`}
        onClick={() => faire(actionsCollab.forcer(cible), 'Verrou libéré.')}>
        Forcer · {v.nom}
      </button>
    );
  };

  const enScene = mode === 'jouer';
  const peutQuitterScene = !vProjet || vProjet.personne === moi;
  return (
    <div className={'sr-co sr-co-verrous ' + className}>
      <div className="sr-co-ligne">
        <span className="sr-co-mode pousse"><span className="sr-co-micro">Salle</span><span className={'val' + (enScene ? ' scene' : '')}>{MODES[mode]}</span></span>
        {enScene
          ? <button className="sr-co-bouton rec" disabled={!connecte || !peutQuitterScene} onClick={() => faire(actionsCollab.changerMode('repeter'))}>Quitter la Scène</button>
          : <button className="sr-co-bouton plein" disabled={!connecte} onClick={() => faire(actionsCollab.changerMode('jouer'), 'Scène : le projet est gelé, vous avez la main.')}>Passer en Scène</button>}
      </div>
      <div className="sr-co-ligne">
        {boutonVerrou('projet', vProjet, 'Prendre la main', 'Rendre la main')}
        {cibleMoment
          ? boutonVerrou(cibleMoment, vMoment, 'Tenir ce moment', 'Libérer ce moment')
          : <button className="sr-co-bouton" disabled>Tenir ce moment</button>}
      </div>
      {nomMoment && <span className="sr-co-micro">Moment · {nomMoment}</span>}
      {!compact && verrous.length > 0 && (
        <div className="sr-co-bloc">
          {verrous.map((v) => {
            const lib = v.cible === 'projet' ? 'le projet' : v.cible === 'lecture' ? 'la lecture'
              : v.cible.startsWith('moment:') ? '« ' + (projet.ev.find((m) => 'moment:' + m.id === v.cible)?.name ?? v.cible.slice(7)) + ' »'
              : '« ' + (projet.tracks.find((t) => 'piste:' + t.id === v.cible)?.name ?? v.cible.slice(6)) + ' »';
            return (
              <div key={v.cible} className="sr-co-tenu" style={{ '--c': couleur(v.personne) } as CSSProperties}>
                <span className="point" />
                <span className="pousse">{v.personne === moi ? 'Vous tenez' : v.nom + ' tient'} {lib}{present(v.personne) ? '' : ' · absent'}</span>
              </div>
            );
          })}
        </div>
      )}
      {note && <div className="sr-co-note">{note}</div>}
    </div>
  );
}
