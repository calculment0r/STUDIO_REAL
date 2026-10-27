// Le rotatif du design (graduations, arc 270°, aiguille) : on le tire vers le haut ou le bas (0,6 point par pixel).
import { useRef } from 'react';

interface Props {
  /** Position 0 → 100. */
  valeur: number;
  /** Couleur de l'arc et de l'aiguille (un jeton : 'var(--ort)'…). */
  couleur: string;
  taille?: number;
  affichage: string;
  libelle: string;
  largeur?: 'normale' | 'auto';
  /** Sans piste de fond (rotatif de condition du design). */
  sansPiste?: boolean;
  onChange: (v: number) => void;
}

export function Rotatif({ valeur, couleur, taille = 38, affichage, libelle, largeur = 'normale', sansPiste, onChange }: Props) {
  const geste = useRef<{ v0: number; y0: number; dernier: number } | null>(null);
  const v = Math.max(0, Math.min(100, valeur));

  const surAppui = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    geste.current = { v0: v, y0: e.clientY, dernier: v };
  };
  const surDeplacement = (e: React.PointerEvent<HTMLSpanElement>) => {
    const g = geste.current;
    if (!g) return;
    const n = Math.max(0, Math.min(100, Math.round(g.v0 + (g.y0 - e.clientY) * 0.6)));
    if (n !== g.dernier) { g.dernier = n; onChange(n); }
  };
  const surFin = () => { geste.current = null; };
  const surTouche = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    const pas = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); onChange(Math.min(100, v + pas)); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); onChange(Math.max(0, v - pas)); }
  };

  return (
    <span className={'rot' + (largeur === 'auto' ? ' auto' : '')}>
      <span className="rot-bouton" style={{ width: taille, height: taille }} role="slider" tabIndex={0}
        aria-label={libelle} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-valuetext={affichage}
        onPointerDown={surAppui} onPointerMove={surDeplacement} onPointerUp={surFin} onPointerCancel={surFin} onKeyDown={surTouche}>
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <circle cx="20" cy="20" r="19" fill="none" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="0.01 4.97" style={{ stroke: 'rgba(var(--lr),.4)' }} />
          <circle cx="20" cy="20" r="14.5" style={{ fill: 'var(--tile2)' }} />
          {!sansPiste && <circle cx="20" cy="20" r="14.5" fill="none" strokeWidth="2.6" strokeDasharray="68.3 200" transform="rotate(135 20 20)" style={{ stroke: 'rgba(var(--lr),.14)' }} />}
          <circle cx="20" cy="20" r="14.5" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeDasharray={(v / 100 * 68.3).toFixed(2) + ' 200'}
            transform="rotate(135 20 20)" style={{ stroke: couleur }} />
        </svg>
        <span className="rot-aiguille" style={{ background: couleur, transform: `rotate(${v * 2.7 + 45}deg)` }} />
      </span>
      <span className="rot-val">{affichage}</span>
      <span className="rot-lab">{libelle}</span>
    </span>
  );
}

/** Seulement l'organe (sans valeur ni libellé) : rotatif de condition, à gauche de sa ligne. */
export function RotatifSeul({ valeur, couleur, onChange, libelle }: { valeur: number; couleur: string; libelle: string; onChange: (v: number) => void }) {
  const geste = useRef<{ v0: number; y0: number; dernier: number } | null>(null);
  const v = Math.max(0, Math.min(100, valeur));
  return (
    <span className="rot-bouton" style={{ width: 32, height: 32, flex: 'none' }} role="slider" tabIndex={0} aria-label={libelle}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}
      onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); geste.current = { v0: v, y0: e.clientY, dernier: v }; }}
      onPointerMove={(e) => { const g = geste.current; if (!g) return; const n = Math.max(0, Math.min(100, Math.round(g.v0 + (g.y0 - e.clientY) * 0.6))); if (n !== g.dernier) { g.dernier = n; onChange(n); } }}
      onPointerUp={() => { geste.current = null; }} onPointerCancel={() => { geste.current = null; }}
      onKeyDown={(e) => { if (e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(100, v + 1)); } else if (e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(0, v - 1)); } }}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="19" fill="none" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="0.01 4.97" style={{ stroke: 'rgba(var(--lr),.4)' }} />
        <circle cx="20" cy="20" r="14.5" style={{ fill: 'var(--tile2)' }} />
        <circle cx="20" cy="20" r="14.5" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeDasharray={(v / 100 * 68.3).toFixed(2) + ' 200'}
          transform="rotate(135 20 20)" style={{ stroke: couleur }} />
      </svg>
      <span className="rot-aiguille" style={{ background: couleur, transform: `rotate(${v * 2.7 + 45}deg)` }} />
    </span>
  );
}
