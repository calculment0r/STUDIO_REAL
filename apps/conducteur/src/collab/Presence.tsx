// <Presence /> : les membres présents dans la salle (pastilles à leurs couleurs) et l'état de la liaison.
import type { CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSalle } from '../etat/serveur';
import { jetonCouleur, type Personne } from './protocole';
import './collab.css';

const ROLES: Record<Personne['role'], string> = { auteur: 'auteur', regie: 'régie', poste: 'poste' };
const initiales = (nom: string) => {
  const m = nom.trim().split(/\s+/).filter(Boolean);
  return ((m[0]?.[0] ?? '?') + (m.length > 1 ? m[m.length - 1]![0] : m[0]?.[1] ?? '')).toUpperCase();
};

export const STATUTS = { ferme: 'Local', connexion: 'Connexion…', connecte: 'En salle', 'hors-ligne': 'Hors ligne · local' } as const;

export interface PropsPresence {
  /** nombre maximal de pastilles avant « +n » */
  max?: number;
  /** masque l'étiquette d'état */
  sansEtat?: boolean;
  className?: string;
}

export function Presence({ max = 6, sansEtat = false, className = '' }: PropsPresence) {
  const { statut, membres, vous, enAttente } = useSalle(useShallow((s) => ({ statut: s.statut, membres: s.membres, vous: s.vous, enAttente: s.enAttente })));
  const moi = vous?.personne;
  // soi d'abord, puis les autres dans l'ordre d'arrivée
  const tries = [...membres].sort((a, b) => (a.personne === moi ? -1 : b.personne === moi ? 1 : 0));
  const visibles = tries.slice(0, max), reste = tries.length - visibles.length;
  return (
    <div className={'sr-co sr-co-presence ' + className}>
      {!sansEtat && (
        <span className="sr-co-etat" title={enAttente ? `${enAttente} envoi(s) en attente d’accusé` : undefined}>
          <span className={'sr-co-voyant ' + statut} />
          <span className="sr-co-micro">{STATUTS[statut]}</span>
          {statut === 'connecte' && <span className="sr-co-micro sr-co-num" style={{ width: '2ch', textAlign: 'right' }}>{membres.length}</span>}
        </span>
      )}
      {visibles.length > 0 && (
        <span className="sr-co-pastilles">
          {visibles.map((p) => (
            <span
              key={p.personne}
              className={'sr-co-pastille' + (p.personne === moi ? ' moi' : '')}
              style={{ '--c': jetonCouleur(p.couleur, p.personne) } as CSSProperties}
              title={`${p.nom} · ${ROLES[p.role]}${p.personne === moi ? ' (vous)' : ''}`}
            >
              {initiales(p.nom)}
              {p.role !== 'auteur' && <span className={'role ' + p.role} />}
            </span>
          ))}
          {reste > 0 && <span className="sr-co-pastille plus sr-co-num" title={tries.slice(max).map((p) => p.nom).join(', ')}>+{reste}</span>}
        </span>
      )}
    </div>
  );
}
