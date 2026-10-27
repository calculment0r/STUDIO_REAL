// Collaboration sur la planche (monté par le chantier INTÉGRATION) : pastilles des commentaires ouverts épinglés sur une
// étape ou un moment. Les curseurs (CurseursDistants, useEmettreCurseur) viennent de src/collab et sont posés dans
// Planche.tsx. Sans salle ouverte, rien ne s'affiche.
import { useMemo } from 'react';
import { useSalle } from '../etat/serveur';
import { useMagasin } from '../etat/magasin';
import { useInterface } from '../coquille/interface';
import { LARGEUR_BLOC, type CadreMoment } from './geometrie';

/** Pastille de compte (style partagé avec la conduite : classe .sr-pastille-com, dans planche.css). */
function Pastille({ n, titre, onClick }: { n: number; titre: string; onClick: () => void }) {
  return (
    <button type="button" className="sr-pastille-com" data-ui="1" title={titre}
      onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onClick={onClick}>
      <span className="planche-chiffre">{n > 9 ? '9+' : n}</span>
    </button>
  );
}

export function PastillesCommentaires({ cadres }: { cadres: CadreMoment[] }) {
  const commentaires = useSalle(s => s.commentaires);
  const comptes = useMemo(() => {
    const m = new Map<string, { n: number; dernier: string }>();
    for (const c of commentaires) {
      if (c.resolu || c.ancre.type === 'instant') continue;
      const k = c.ancre.type === 'etape' ? c.ancre.moment + '/' + c.ancre.etape : c.ancre.moment;
      const x = m.get(k);
      m.set(k, { n: (x?.n ?? 0) + 1, dernier: c.nom + ' : ' + c.texte });
    }
    return m;
  }, [commentaires]);
  if (!comptes.size) return null;
  const ouvrir = (moment: string, etape?: string) => {
    useMagasin.getState().selectionner(etape ? { moment, etape } : { moment });
    useInterface.getState().montrerEquipe('commentaires');
  };
  return (
    <>
      {cadres.flatMap(f => {
        const out = [];
        const cm = comptes.get(f.moment.id);
        if (cm) out.push(
          <div key={'cm' + f.moment.id} className="planche-ecran" style={{ left: f.r.x + f.r.w - 8, top: f.r.y + 8, zIndex: 9 }}>
            <Pastille n={cm.n} titre={cm.dernier} onClick={() => ouvrir(f.moment.id)} />
          </div>,
        );
        for (const st of f.moment.st) {
          const c = comptes.get(f.moment.id + '/' + st.id), P = f.P[st.id];
          if (!c || !P) continue;
          out.push(
            <div key={'ce' + st.id} className="planche-ecran" style={{ left: P.x + LARGEUR_BLOC - 6, top: P.y - 6, zIndex: 9 }}>
              <Pastille n={c.n} titre={c.dernier} onClick={() => ouvrir(f.moment.id, st.id)} />
            </div>,
          );
        }
        return out;
      })}
    </>
  );
}
