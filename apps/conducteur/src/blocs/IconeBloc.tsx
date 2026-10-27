// <IconeBloc> : le glyphe d'un bloc (le sien ou celui de sa famille), à la couleur du bloc dans le thème courant.
// La couleur passe par deux propriétés CSS (--ic-sombre / --ic-clair) et une seule règle globale qui suit `data-theme`.
import { useInsertionEffect, type CSSProperties } from 'react';
import { trouverBloc, trouverFamille } from './catalogue';

const REGLE = '.srb-icone{color:var(--ic-sombre)}[data-theme="light"] .srb-icone,.srb-icone[data-theme="light"]{color:var(--ic-clair)}';
let regleAjoutee = false;

export interface ProprietesIcone {
  ty: string;
  /** Côté en pixels (16 par défaut). */
  taille?: number;
  /** Épaisseur du trait (1,6 par défaut). */
  trait?: number;
  className?: string;
  style?: CSSProperties;
  titre?: string;
}

export function IconeBloc({ ty, taille = 16, trait = 1.6, className, style, titre }: ProprietesIcone) {
  useInsertionEffect(() => {
    if (regleAjoutee || typeof document === 'undefined') return;
    regleAjoutee = true;
    const el = document.createElement('style');
    el.setAttribute('data-srb', 'icones');
    el.textContent = REGLE;
    document.head.appendChild(el);
  }, []);
  const def = trouverBloc(ty);
  const fam = def ? trouverFamille(def.famille) : undefined;
  const chemin = def?.icone ?? fam?.icone ?? 'M4 6h16M4 12h10M4 18h13';
  const c = def?.couleur ?? fam?.couleur;
  const vars = { '--ic-sombre': c?.sombre ?? 'currentColor', '--ic-clair': c?.clair ?? 'currentColor' } as CSSProperties;
  return (
    <svg
      className={'srb-icone' + (className ? ' ' + className : '')}
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={trait}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...vars, flex: 'none', ...style }}
      role="img"
      aria-label={titre ?? def?.nom ?? ty}
    >
      <path d={chemin} />
    </svg>
  );
}

export default IconeBloc;
