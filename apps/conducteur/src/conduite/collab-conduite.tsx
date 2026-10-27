// Collaboration sur la conduite (monté par le chantier INTÉGRATION) : pastilles des commentaires ouverts épinglés sur un
// instant ou un moment, posées dans la rangée TEMPS. Les curseurs (CurseursDistants, useEmettreCurseur) viennent de
// src/collab et sont posés dans Conduite.tsx. Sans salle ouverte, rien ne s'affiche.
import { memo, useMemo } from 'react';
import { useSalle } from '../etat/serveur';
import { useMagasin } from '../etat/magasin';
import { useInterface } from '../coquille/interface';
import type { Plan } from './planning';

interface Props { plan: Plan; pps: number; defilement: number; gauche: number; largeur: number }

export const PastillesConduite = memo(function PastillesConduite({ plan, pps, defilement, gauche, largeur }: Props) {
  const commentaires = useSalle((s) => s.commentaires);
  const points = useMemo(() => {
    const debut = new Map(plan.evs.map((e) => [e.ev.id, e.S]));
    const m = new Map<number, { t: number; n: number; moment?: string; dernier: string }>();
    for (const c of commentaires) {
      if (c.resolu) continue;
      const a = c.ancre;
      const t = a.type === 'instant' ? a.t : debut.get(a.moment);
      if (t === undefined) continue;
      const k = Math.round(t);
      const x = m.get(k);
      m.set(k, { t, n: (x?.n ?? 0) + 1, moment: x?.moment ?? ('moment' in a ? a.moment : undefined), dernier: c.nom + ' : ' + c.texte });
    }
    return [...m.values()];
  }, [commentaires, plan]);
  if (!points.length) return null;
  return (
    <>
      {points.map((p) => {
        const x = gauche + p.t * pps - defilement;
        if (x < gauche - 2 || x > largeur) return null;
        return (
          <button key={Math.round(p.t)} type="button" className="cd-com" style={{ left: x }} title={p.dernier}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              if (p.moment) useMagasin.getState().selectionner({ moment: p.moment });
              useInterface.getState().montrerEquipe('commentaires');
            }}>
            {p.n > 9 ? '9+' : p.n}
          </button>
        );
      })}
    </>
  );
});
