// <ApercuBloc> : l'aperçu VIVANT d'un bloc, dessiné sur un petit <canvas> par la boucle d'animation commune.
// Aucun rendu React par image : le composant s'inscrit une fois, la boucle lit ses dernières propriétés.
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { APERCUS, APERCU_PAR_DEFAUT, HAUTEUR_APERCU, LARGEUR_APERCU } from './apercus';
import { abonner, simulation } from './boucle';
import { trouverBloc } from './catalogue';
import { construireOptions } from './options';
import { palette, type ThemeApercu } from './palette';

export interface ProprietesApercu {
  /** Code du bloc (`Etape.ty`). */
  ty: string;
  /** Rotatifs de l'étape : k[0] durée codée, k[1], k[2] réglages 0 → 100. */
  k: number[];
  /** Secondes écoulées dans l'étape. */
  t: number;
  /** L'étape est en cours. */
  actif: boolean;
  /** Réglages propres (`Etape.params`) et valeurs lues : valeur, issue, choisie, pct, asset, nom, heure, couleur… */
  params?: Record<string, unknown>;
  /** Thème forcé ; sinon lu sur l'ancêtre `[data-theme]` (« light » = clair). */
  theme?: ThemeApercu;
  /** Démonstration en boucle (bibliothèque, galerie). */
  boucle?: boolean;
  /** Largeur affichée en pixels CSS (hauteur proportionnelle) ; 216 par défaut. */
  largeur?: number;
  /** Multiplicateur de netteté (ex. zoom de la planche quand le bloc est agrandi par transform). */
  echelle?: number;
  /** Remplit le fond avec le jeton --bg (vrai par défaut, comme le design). */
  fond?: boolean;
  className?: string;
  style?: CSSProperties;
}

const themeDe = (el: Element): ThemeApercu => (el.closest('[data-theme]')?.getAttribute('data-theme') === 'light' ? 'clair' : 'sombre');
let erreurSignalee = false;

export function ApercuBloc(props: ProprietesApercu) {
  const toile = useRef<HTMLCanvasElement>(null);
  const dernieres = useRef(props);
  useLayoutEffect(() => { dernieres.current = props; });

  useEffect(() => {
    const cv = toile.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    let themeLu: ThemeApercu = themeDe(cv);
    let n = 0;
    return abonner({
      element: cv,
      dessiner: (now) => {
        const p = dernieres.current;
        const largeur = p.largeur ?? LARGEUR_APERCU;
        const ratio = Math.min(4, (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1) * (p.echelle ?? 1));
        const pw = Math.round(largeur * ratio), ph = Math.round(largeur * HAUTEUR_APERCU / LARGEUR_APERCU * ratio);
        if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
        if (n++ % 30 === 0) themeLu = themeDe(cv);
        const theme = p.theme ?? themeLu;
        const C = palette(theme);
        const def = trouverBloc(p.ty);
        const dessin = APERCUS[def?.apercu ?? ''] ?? APERCUS[APERCU_PAR_DEFAUT];
        const o = construireOptions(def, p, theme, now);
        const s = pw / LARGEUR_APERCU;
        ctx.setTransform(s, 0, 0, s, 0, 0);
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, LARGEUR_APERCU, HAUTEUR_APERCU);
        if (p.fond !== false) { ctx.fillStyle = C['--bg']; ctx.fillRect(0, 0, LARGEUR_APERCU, HAUTEUR_APERCU); }
        try {
          dessin(ctx, LARGEUR_APERCU, HAUTEUR_APERCU, now, C, simulation, o);
        } catch (err) {
          ctx.globalAlpha = 1;
          if (!erreurSignalee) { erreurSignalee = true; console.warn('aperçu', p.ty, err); }
        }
      },
    });
  }, []);

  const largeur = props.largeur ?? LARGEUR_APERCU;
  const def = trouverBloc(props.ty);
  return (
    <canvas
      ref={toile}
      className={props.className}
      role="img"
      aria-label={def ? 'aperçu : ' + def.nom : 'aperçu'}
      width={largeur}
      height={Math.round(largeur * HAUTEUR_APERCU / LARGEUR_APERCU)}
      style={{ display: 'block', width: largeur, height: largeur * HAUTEUR_APERCU / LARGEUR_APERCU, ...props.style }}
    />
  );
}

export default ApercuBloc;
