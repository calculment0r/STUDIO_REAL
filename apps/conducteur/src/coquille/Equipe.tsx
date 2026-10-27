// Section ÉQUIPE du panneau de droite : la salle collaborative (chantier COLLAB) en trois onglets — discussion,
// commentaires épinglés (sur la sélection), verrous et mode Scène. Hors salle, tout reste local : un seul bouton pour
// ouvrir un projet du serveur, aucun message d'erreur.
import { useSalle } from '../etat/serveur';
import { BoutonsVerrou, Commentaires, Discussion } from '../collab';
import { useInterface, type OngletEquipe } from './interface';

const ONGLETS: [OngletEquipe, string][] = [['discussion', 'DISCUSSION'], ['commentaires', 'COMMENTAIRES'], ['verrous', 'VERROUS']];

/** Nombre de commentaires ouverts (titre de la section). */
export const useCommentairesOuverts = () => useSalle(s => s.commentaires.reduce((n, c) => n + (c.resolu ? 0 : 1), 0));

export function Equipe() {
  const onglet = useInterface(s => s.ongletEquipe);
  const poser = useInterface(s => s.poser);
  const statut = useSalle(s => s.statut);
  const nChat = useSalle(s => s.chat.length);
  const nCom = useCommentairesOuverts();
  const compte: Record<OngletEquipe, number> = { discussion: nChat, commentaires: nCom, verrous: 0 };
  return (
    <>
      {statut === 'ferme' && (
        <div className="pn-ligne">
          <span className="l">HORS SALLE · LOCAL</span>
          <button className="pn-bouton" onClick={() => poser({ projets: true })}>OUVRIR UN PROJET…</button>
        </div>
      )}
      <div className="seg-groupe fond">
        {ONGLETS.map(([k, t]) => (
          <button key={k} className={'seg large' + (onglet === k ? ' on' : '')} onClick={() => poser({ ongletEquipe: k })}>
            {t}{compte[k] > 0 && <span className="num eq-n">{compte[k] > 99 ? '99+' : compte[k]}</span>}
          </button>
        ))}
      </div>
      {onglet === 'discussion' && <div className="eq-discussion"><Discussion /></div>}
      {onglet === 'commentaires' && <Commentaires />}
      {onglet === 'verrous' && <BoutonsVerrou />}
    </>
  );
}
