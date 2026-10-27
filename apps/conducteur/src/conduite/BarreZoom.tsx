// La barre de zoom façon Premiere : la barre représente toute la conduite, le pouce la partie visible.
// Glisser le pouce = défiler ; tirer ses ronds = zoomer ; cliquer ailleurs = centrer la vue là.
import type { PointerEvent as EvPointeur, RefObject } from 'react';
import { fenetreVisible, pxVersTemps, vueDepuisFenetre } from './temps';
import { glisser } from './glisser';

interface Props {
  total: number; pps: number; defilement: number; largeurVue: number;
  repere: RefObject<HTMLSpanElement | null>;
  onVue: (pps: number, defilement: number) => void;
}

export function BarreZoom({ total, pps, defilement, largeurVue, repere, onVue }: Props) {
  const f = fenetreVisible(defilement, pps, largeurVue, total);
  const tot = Math.max(1, total);
  const t0 = pxVersTemps(defilement, pps), span = pxVersTemps(largeurVue, pps);

  const geste = (mode: 'mv' | 'g' | 'd') => (e: EvPointeur<HTMLElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const barre = (e.currentTarget.closest('.cd-zb') as HTMLElement).getBoundingClientRect();
    const x0 = e.clientX;
    glisser(e, (m) => {
      const ds = ((m.clientX - x0) / barre.width) * tot;
      if (mode === 'mv') onVue(pps, Math.max(0, (t0 + ds) * pps));
      else if (mode === 'g') { const nt = Math.min(t0 + span - 20, Math.max(0, t0 + ds)); const v = vueDepuisFenetre(nt, t0 + span - nt, largeurVue, total); onVue(v.pps, v.defilement); }
      else { const v = vueDepuisFenetre(t0, span + ds, largeurVue, total); onVue(v.pps, v.defilement); }
    });
  };

  return (
    <div className="cd-zb" title="Glisser la barre pour défiler, ses ronds pour zoomer"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        const c = ((e.clientX - r.left) / r.width) * tot;
        onVue(pps, Math.max(0, (c - span / 2) * pps));
      }}>
      <span ref={repere} className="cd-zb-tete" />
      <span className="cd-zb-pouce" style={{ left: f.debut * 100 + '%', width: Math.max(0.2, f.largeur * 100) + '%' }} onPointerDown={geste('mv')}>
        <span className="cd-zb-rond g" onPointerDown={geste('g')} />
        <span className="cd-zb-rond d" onPointerDown={geste('d')} />
      </span>
    </div>
  );
}
