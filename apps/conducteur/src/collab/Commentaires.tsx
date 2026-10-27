// <Commentaires /> : fils de commentaires épinglés sur une étape, un moment ou un instant de la conduite.
//   <Commentaires />                    tous les fils, groupés par ancre ; on épingle sur la sélection courante
//   <Commentaires ancre={{type:'etape', moment, etape}} />   le fil d'une ancre précise (bulle sur la planche…)
import { useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMagasin } from '../etat/magasin';
import { useSalle } from '../etat/serveur';
import { actionsCollab } from './useCollab';
import { ancreDeSelection, cleAncre, heureMinute, libelleAncre } from './ancres';
import { jetonCouleur, LIMITES_WS, type Ancre, type Commentaire } from './protocole';
import './collab.css';

export interface PropsCommentaires {
  ancre?: Ancre;
  className?: string;
}

export function Commentaires({ ancre, className = '' }: PropsCommentaires) {
  const { commentaires, statut, moi } = useSalle(useShallow((s) => ({ commentaires: s.commentaires, statut: s.statut, moi: s.vous?.personne })));
  const projet = useMagasin((s) => s.projet);
  const selection = useMagasin((s) => s.selection);
  const tLecture = useMagasin((s) => s.lecture?.t ?? null);
  const [tous, setTous] = useState(false);
  const [texte, setTexte] = useState('');
  const [erreur, setErreur] = useState('');
  const connecte = statut === 'connecte';

  const cible = ancre ?? ancreDeSelection(selection, tLecture);
  const groupes = useMemo(() => {
    const k = ancre ? cleAncre(ancre) : null;
    const m = new Map<string, Commentaire[]>();
    for (const c of commentaires) {
      if (!tous && c.resolu) continue;
      const kc = cleAncre(c.ancre);
      if (k && kc !== k) continue;
      m.set(kc, [...(m.get(kc) ?? []), c]);
    }
    return [...m.values()].sort((a, b) => b[b.length - 1]!.cree_le - a[a.length - 1]!.cree_le);
  }, [commentaires, tous, ancre]);

  const epingler = () => {
    const t = texte.trim();
    if (!t || !cible) return;
    setErreur('');
    actionsCollab.commenter(cible, t).then((a) => {
      if (a.statut === 'refus') setErreur('Commentaire refusé.'); else setTexte('');
    }, (e: Error) => setErreur(e.message));
  };
  const touche = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); epingler(); }
    e.stopPropagation();
  };
  const aller = (a: Ancre) => {
    const s = useMagasin.getState();
    if (a.type === 'etape') s.selectionner({ moment: a.moment, etape: a.etape });
    else if (a.type === 'moment') s.selectionner({ moment: a.moment });
    else if (a.moment) s.selectionner({ moment: a.moment });
  };

  const lib = cible ? libelleAncre(cible, projet) : null;
  return (
    <div className={'sr-co sr-co-commentaires ' + className}>
      <div className="sr-co-ligne">
        <span className="sr-co-micro pousse">Commentaires <span className="sr-co-num">{groupes.reduce((n, g) => n + g.length, 0)}</span></span>
        <span className="sr-co-filtres">
          <button className={'sr-co-bouton' + (!tous ? ' on' : '')} onClick={() => setTous(false)}>Ouverts</button>
          <button className={'sr-co-bouton' + (tous ? ' on' : '')} onClick={() => setTous(true)}>Tous</button>
        </span>
      </div>

      {groupes.length === 0 && <div className="sr-co-vide">{connecte ? 'Aucun commentaire' : 'Hors salle'}</div>}
      {groupes.map((g) => {
        const a = g[0]!.ancre, l = libelleAncre(a, projet);
        return (
          <div key={cleAncre(a)} className="sr-co-groupe">
            {!ancre && (
              <button className="sr-co-ancre" onClick={() => aller(a)} title="Aller à l’ancre">
                <span className="sr-co-epingle" /><span className="sr-co-micro">{l.type}</span><span className="lib">{l.nom}</span>
              </button>
            )}
            {g.map((c) => (
              <div key={c.id} className={'sr-co-com' + (c.resolu ? ' resolu' : '')} style={{ '--c': jetonCouleur(c.couleur, c.auteur) } as CSSProperties}>
                <div className="tete">
                  <span className="qui">{c.nom}</span>
                  <span className="quand sr-co-num">{heureMinute(c.cree_le)}</span>
                  <span className="actions">
                    {c.resolu
                      ? <button className="sr-co-lien" disabled={!connecte} onClick={() => void actionsCollab.rouvrir(c.id)}>Rouvrir</button>
                      : <button className="sr-co-lien" disabled={!connecte} onClick={() => void actionsCollab.resoudre(c.id)}>Résolu</button>}
                    {c.auteur === moi && <button className="sr-co-lien" disabled={!connecte} onClick={() => void actionsCollab.supprimerCommentaire(c.id)}>Retirer</button>}
                  </span>
                </div>
                <div className="texte">{c.texte}</div>
              </div>
            ))}
          </div>
        );
      })}

      <div className="sr-co-bloc">
        <span className="sr-co-micro">{lib ? <>Épingler sur · {lib.type} « {lib.nom} »</> : 'Choisissez une étape, un moment ou un instant'}</span>
        <textarea
          className="sr-co-champ" rows={2} maxLength={LIMITES_WS.commentaire} value={texte} disabled={!connecte || !cible}
          placeholder={connecte ? 'Note pour l’équipe… (Ctrl+Entrée)' : 'Hors salle'}
          onChange={(e) => setTexte(e.target.value)} onKeyDown={touche}
        />
        {erreur && <div className="sr-co-note alerte">{erreur}</div>}
        <div className="sr-co-ligne"><span className="pousse" /><button className="sr-co-bouton plein" disabled={!connecte || !cible || !texte.trim()} onClick={epingler}>Épingler</button></div>
      </div>
    </div>
  );
}
