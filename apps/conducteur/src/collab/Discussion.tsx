// <Discussion /> : le fil de discussion de la salle (100 derniers messages à l'arrivée).
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSalle } from '../etat/serveur';
import { actionsCollab } from './useCollab';
import { jetonCouleur, LIMITES_WS } from './protocole';
import { heureMinute } from './ancres';
import './collab.css';

export function Discussion({ className = '' }: { className?: string }) {
  const { chat, statut, moi } = useSalle(useShallow((s) => ({ chat: s.chat, statut: s.statut, moi: s.vous?.personne })));
  const [texte, setTexte] = useState('');
  const [erreur, setErreur] = useState('');
  const fil = useRef<HTMLDivElement>(null);
  const connecte = statut === 'connecte';

  useEffect(() => {
    const el = fil.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  const envoyer = () => {
    const t = texte.trim();
    if (!t) return;
    setTexte('');
    setErreur('');
    actionsCollab.ecrire(t).then((a) => { if (a.statut === 'refus') setErreur('Message refusé.'); }, (e: Error) => { setErreur(e.message); setTexte(t); });
  };
  const touche = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); }
    e.stopPropagation(); // pas de raccourcis du conducteur pendant la frappe
  };

  return (
    <div className={'sr-co sr-co-discussion ' + className}>
      <div className="sr-co-fil" ref={fil}>
        {chat.length === 0 && <div className="sr-co-vide">{connecte ? 'Aucun message' : 'Hors salle'}</div>}
        {chat.map((m) => (
          <div key={m.id} className={'sr-co-msg' + (m.personne === moi ? ' moi' : '')} style={{ '--c': jetonCouleur(m.couleur, m.personne) } as CSSProperties}>
            <div className="tete"><span className="qui">{m.nom}</span><span className="quand sr-co-num">{heureMinute(m.t)}</span></div>
            <div className="texte">{m.texte}</div>
          </div>
        ))}
      </div>
      {erreur && <div className="sr-co-note alerte">{erreur}</div>}
      <div className="sr-co-ligne">
        <textarea
          className="sr-co-champ pousse" rows={2} maxLength={LIMITES_WS.chat} value={texte} disabled={!connecte}
          placeholder={connecte ? 'Message à la salle… (Entrée pour envoyer)' : 'Hors salle'}
          onChange={(e) => setTexte(e.target.value)} onKeyDown={touche}
        />
        <button className="sr-co-bouton plein" disabled={!connecte || !texte.trim()} onClick={envoyer}>Envoyer</button>
      </div>
    </div>
  );
}
