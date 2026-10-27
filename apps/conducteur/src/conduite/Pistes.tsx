// Les pistes de la conduite : courbes (points éditables), clips (son, lumière, vidéo, téléphones, textes),
// repères (notes, sécurité avec préavis). Pistes repliables. Glisser un clip ou un repère le décale ; ses poignées
// règlent sa durée (ou le préavis d'une alerte). Pendant un geste, l'aperçu est local ; le projet n'est modifié qu'au lâcher.
import { memo, useState, type CSSProperties, type ReactNode } from 'react';
import type { Piste, Projet, TypePiste } from '@studio-real/modele';
import { debuts, type Plan } from './planning';
import { couleurPiste, dessinClip, hauteurPiste, traceCourbe, ORDRE_TYPES, TYPES_PISTE } from './types-pistes';
import { fm } from './temps';
import { glisser } from './glisser';
import { useMagasin } from '../etat/magasin';

export interface ActionsPistes {
  basculer: (piste: string) => void;
  deplacer: (piste: string, id: string, abs: number) => void;
  duree: (piste: string, id: string, dur: number) => void;
  preavis: (piste: string, id: string, lead: number) => void;
  point: (piste: string, ev: string, v: number) => void;
  repere: (piste: string, abs: number) => void;
  ajouter: (type: TypePiste) => void;
  /** choisir la piste, un de ses clips ou une de ses notes (sélection du magasin, pour le panneau de droite) */
  choisir: (sel: { piste: string; clip?: string; note?: string }) => void;
}

interface Apercu { id: string; abs?: number; dur?: number; lead?: number; v?: number }

interface PropsPiste { tk: Piste; top: number; h: number; projet: Projet; plan: Plan; S: Record<string, number>; pps: number; actions: ActionsPistes; sel: string | null; pisteChoisie: boolean }

const PisteRangee = memo(function PisteRangee({ tk, top, h, projet, plan, S, pps, actions, sel, pisteChoisie }: PropsPiste) {
  const [ap, setAp] = useState<Apercu | null>(null);
  const cl = couleurPiste(tk);
  const ouverte = !!tk.open;
  const style = { top, height: h, ['--cd-piste' as string]: cl } as CSSProperties;

  let contenu: ReactNode = null;
  if (tk.type === 'curve') {
    const H = ouverte ? h - 14 : h - 10, haut = ouverte ? 8 : 5;
    const tkv = ap && ap.v !== undefined ? { ...tk, pts: { ...(tk.pts ?? {}), [ap.id]: ap.v } } : tk;
    const { d, points } = traceCourbe(tkv, projet, plan, pps, haut, H);
    const largeur = Math.max(1, plan.total * pps);
    contenu = (
      <>
        <svg className="cd-courbe" width={largeur} height={h} viewBox={`0 0 ${largeur} ${h}`} preserveAspectRatio="none">
          {d && tk.src !== 'lum' && <path d={d + ` L${largeur} ${h} L0 ${h} Z`} style={{ fill: cl, opacity: 0.08, stroke: 'none' }} />}
          <path d={d} style={{ fill: 'none', stroke: cl, strokeWidth: ouverte ? 1.6 : 1.2 }} vectorEffect="non-scaling-stroke" />
        </svg>
        {ouverte && tk.src !== 'lum' && tk.src !== 'pub' && points.map((p) => (
          <span key={p.id} className="cd-point" style={{ left: p.x, top: p.y }} title={'Tirer pour régler · ' + p.v}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              const y0 = e.clientY, v0 = p.v;
              let v = v0;
              glisser(e, (m) => { v = Math.max(0, Math.min(100, Math.round(v0 - ((m.clientY - y0) / H) * 100))); setAp({ id: p.id, v }); },
                () => { setAp(null); if (v !== v0) actions.point(tk.id, p.id, v); });
            }} />
        ))}
      </>
    );
  } else if (tk.clips) {
    contenu = tk.clips.map((c) => {
      const actif = ap?.id === c.id || sel === c.id;
      const s0 = ap?.id === c.id && ap.abs !== undefined ? ap.abs : (S[c.ev] ?? 0) + c.off;
      const dur = ap?.id === c.id && ap.dur !== undefined ? ap.dur : c.dur;
      const w = Math.max(3, dur * pps);
      return (
        <div key={c.id} className="cd-clip" data-actif={actif ? '' : undefined} title={c.name + ' · ' + fm(s0) + ' · ' + fm(dur)}
          style={{ left: s0 * pps, width: w, top: ouverte ? 5 : 4, height: ouverte ? h - 10 : h - 8 }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            actions.choisir({ piste: tk.id, clip: c.id });
            const x0 = e.clientX, a0 = (S[c.ev] ?? 0) + c.off;
            let a = a0;
            glisser(e, (m) => { a = Math.max(0, Math.round(a0 + (m.clientX - x0) / pps)); setAp({ id: c.id, abs: a }); },
              () => { setAp(null); if (a !== a0) actions.deplacer(tk.id, c.id, a); });
          }}>
          <svg viewBox="0 0 100 20" preserveAspectRatio="none"><path d={dessinClip(tk.type, c.id)} style={{ fill: cl, opacity: tk.type === 'son' ? 0.5 : 0.28 }} /></svg>
          {ouverte && w > 34 && <span className="nom">{c.name}</span>}
          <span className="poignee" title="Tirer pour régler la durée"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              const x0 = e.clientX, d0 = c.dur;
              let d = d0;
              glisser(e, (m) => { d = Math.max(2, Math.round(d0 + (m.clientX - x0) / pps)); setAp({ id: c.id, dur: d }); },
                () => { setAp(null); if (d !== d0) actions.duree(tk.id, c.id, d); });
            }} />
        </div>
      );
    });
  } else if (tk.marks) {
    contenu = tk.marks.map((m) => {
      const actif = ap?.id === m.id || sel === m.id;
      const s0 = ap?.id === m.id && ap.abs !== undefined ? ap.abs : (S[m.ev] ?? 0) + m.off;
      const lead = ap?.id === m.id && ap.lead !== undefined ? ap.lead : (m.lead ?? 0);
      return (
        <span key={m.id}>
          {tk.type === 'secu' && lead > 0 && <span className="cd-preavis" style={{ left: (s0 - lead) * pps, width: lead * pps }} />}
          {tk.type === 'secu' && ouverte && (
            <span className="cd-preavis-poignee" style={{ left: (s0 - lead) * pps }} title={'Préavis ' + fm(lead) + ' · tirer pour le régler'}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                const x0 = e.clientX, l0 = m.lead ?? 0;
                let l = l0;
                glisser(e, (mv) => { l = Math.max(0, Math.round(l0 - (mv.clientX - x0) / pps)); setAp({ id: m.id, lead: l }); },
                  () => { setAp(null); if (l !== l0) actions.preavis(tk.id, m.id, l); });
              }} />
          )}
          <div className="cd-repere" data-actif={actif ? '' : undefined} style={{ left: s0 * pps }}
            title={m.txt + ' · ' + fm(s0) + (tk.type === 'secu' && lead ? ' · préavis ' + fm(lead) : '')}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              actions.choisir({ piste: tk.id, note: m.id });
              const x0 = e.clientX, a0 = (S[m.ev] ?? 0) + m.off;
              let a = a0;
              glisser(e, (mv) => { a = Math.max(0, Math.round(a0 + (mv.clientX - x0) / pps)); setAp({ id: m.id, abs: a }); },
                () => { setAp(null); if (a !== a0) actions.deplacer(tk.id, m.id, a); });
            }}>
            <span className="drapeau" />
            {ouverte && <span className="txt">{m.txt}</span>}
          </div>
        </span>
      );
    });
  }

  return (
    <div className="cd-piste" data-ouverte={ouverte ? '' : undefined} data-sel={pisteChoisie ? '' : undefined} style={style}>
      <div className="cd-piste-voie"
        onDoubleClick={(e) => {
          if (!tk.marks) return;
          const r = (e.currentTarget.firstElementChild as HTMLElement).getBoundingClientRect();
          actions.repere(tk.id, Math.max(0, Math.round((e.clientX - r.left) / pps)));
        }}>
        <div className="cd-piste-defile">{contenu}</div>
      </div>
      <div className="cd-piste-tete" onPointerDown={(e) => e.stopPropagation()}>
        <button className="cd-chevron" title="Ouvrir ou replier la piste" onClick={() => actions.basculer(tk.id)}>
          <svg width="8" height="8" viewBox="0 0 8 8"><path d="M2 1 L6 4 L2 7" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
        </button>
        <span className="cd-piste-nom" title={tk.name} onClick={() => actions.choisir({ piste: tk.id })}>{tk.name}</span>
      </div>
    </div>
  );
});

interface PropsPistes { projet: Projet; plan: Plan; pps: number; actions: ActionsPistes }

export function Pistes({ projet, plan, pps, actions }: PropsPistes) {
  const [menu, setMenu] = useState(false);
  const selection = useMagasin((s) => s.selection);
  const S = debuts(plan);
  let y = 0;
  const rangs = projet.tracks.map((tk) => { const h = hauteurPiste(tk), top = y; y += h + 1; return { tk, h, top }; });
  return (
    <div className="cd-pistes-in" style={{ height: y + 44 }}>
      {rangs.map(({ tk, h, top }) => (
        <PisteRangee key={tk.id} tk={tk} top={top} h={h} projet={projet} plan={plan} S={S} pps={pps} actions={actions}
          sel={selection.piste === tk.id ? (selection.clip ?? selection.note ?? null) : null}
          pisteChoisie={selection.piste === tk.id && !selection.clip && !selection.note} />
      ))}
      <button className="cd-ajout-piste" style={{ top: y + 6 }} onPointerDown={(e) => e.stopPropagation()} onClick={() => setMenu((m) => !m)}>
        <b>+</b>AJOUTER UNE PISTE
      </button>
      {menu && (
        <div className="cd-menu" style={{ left: 22, top: Math.max(0, y - 230) }} onPointerDown={(e) => e.stopPropagation()}>
          {ORDRE_TYPES.map((ty) => (
            <button key={ty} className="cd-menu-item" onClick={() => { actions.ajouter(ty); setMenu(false); }}>
              <span className="pastille" style={{ background: couleurPiste({ type: ty }) }} />
              <span className="col"><span className="n">{TYPES_PISTE[ty].nom}</span><span className="d">{TYPES_PISTE[ty].description}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
