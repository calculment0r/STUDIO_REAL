// <CurseursDistants zone="planche"|"conduite" /> : les curseurs des autres membres sur une zone.
// À poser DANS le conteneur positionné (position: relative) de la zone : calque absolu, transparent aux clics.
// `projeter` convertit les coordonnées du monde (planche : pixels du monde ; conduite : x = temps en s) en pixels
// du calque ; la zone la fournit (zoom, défilement). Défaut : identité.
import type { CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSalle } from '../etat/serveur';
import { jetonCouleur, type Curseur } from './protocole';
import './collab.css';

export interface PropsCurseursDistants {
  zone: Curseur['zone'];
  projeter?: (x: number, y: number, c: Curseur) => { x: number; y: number } | null;
  /** n'affiche que les curseurs posés sur ce moment (planche d'un moment) */
  moment?: string;
}

const identite = (x: number, y: number) => ({ x, y });

export function CurseursDistants({ zone, projeter = identite, moment }: PropsCurseursDistants) {
  const { curseurs, membres, moi } = useSalle(useShallow((s) => ({ curseurs: s.curseurs, membres: s.membres, moi: s.vous?.personne })));
  const items = membres.flatMap((p) => {
    const c = curseurs[p.personne];
    if (!c || c.zone !== zone || p.personne === moi) return [];
    if (moment && c.moment && c.moment !== moment) return [];
    const pos = projeter(c.x, c.y, c);
    return pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) ? [{ p, pos }] : [];
  });
  if (!items.length) return null;
  return (
    <div className="sr-co-curseurs" aria-hidden>
      {items.map(({ p, pos }) => (
        <div
          key={p.personne}
          className={'sr-co-curseur ' + zone}
          style={{ '--c': jetonCouleur(p.couleur, p.personne), transform: `translate(${pos.x}px, ${pos.y}px)` } as CSSProperties}
        >
          {zone === 'conduite' && <span className="trait" />}
          <svg width="14" height="18" viewBox="0 0 14 18"><path d="M1 1 L1 15 L4.6 11.6 L7.2 17 L9.4 16 L6.9 10.8 L12 10.6 Z" /></svg>
          <span className="nom">{p.nom}</span>
        </div>
      ))}
    </div>
  );
}
