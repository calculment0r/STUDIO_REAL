// Les rangées du haut de la conduite : la règle (MM:SS), les actes, les moments, les passages.
// Elles se dessinent en pixels du contenu (x = t × pps) dans un calque que la conduite fait défiler par transform :
// ni le défilement ni la lecture ne les re-rendent (memo), seuls le projet et le zoom.
import { memo, useMemo, useState, type CSSProperties } from 'react';
import type { Acte } from '@studio-real/modele';
import { useMagasin, type Magasin } from '../etat/magasin';
import type { Plan } from './planning';
import { MARGE_FIN, fm, graduations } from './temps';
import { glisser } from './glisser';

const ROM = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const romain = (a: number): string => ROM[a] ?? String(a + 1);

// ── la règle ────────────────────────────────────────────────
export const Regle = memo(function Regle({ pps, total, largeurVue }: { pps: number; total: number; largeurVue: number }) {
  const g = useMemo(() => graduations(pps, 0, total * pps + Math.max(MARGE_FIN, largeurVue)), [pps, total, largeurVue]);
  return (
    <div className="cd-regle" aria-hidden="true">
      {g.map((k) => (
        <span key={k.t} className={k.sous ? 'cd-gr sub' : 'cd-gr'} style={{ left: k.x }}>
          {k.libelle && <span className="cd-gr-l">{k.libelle}</span>}
        </span>
      ))}
    </div>
  );
});

// ── les actes ───────────────────────────────────────────────
interface PropsActes { plan: Plan; acts: Acte[]; pps: number; onRenommer: (a: number, n: string) => void; onChoisir: (a: number) => void; onAjouter: () => void }

export const RangeeActes = memo(function RangeeActes({ plan, acts, pps, onRenommer, onChoisir, onAjouter }: PropsActes) {
  const [edite, setEdite] = useState<number | null>(null);
  const selActe = useMagasin((s) => s.selection.acte);
  return (
    <>
      {acts.map((A, a) => {
        const es = plan.evs.filter((e) => e.ev.act === a);
        if (!es.length) return null;
        const der = es[es.length - 1], g = plan.gates.find((x) => x.i === der.i);
        // comme le design : l'acte couvre aussi le passage vers un moment du même acte
        const S = es[0].S, E = g && plan.evs[g.i + 1]?.ev.act === a ? g.pass : der.E;
        const w = Math.max(4, (E - S) * pps - 3);
        const nom = A.n.toUpperCase();
        return (
          <div key={a} className="cd-acte" data-n={a % 5} data-sel={selActe === a ? '' : undefined} style={{ left: S * pps, width: w }}
            title={'Acte ' + romain(a) + ' · ' + A.n + ' — clic : choisir · double-clic : renommer'}
            onPointerDown={(e) => { if (e.button !== 0) return; e.stopPropagation(); onChoisir(a); }}
            onDoubleClick={(e) => { e.stopPropagation(); setEdite(a); }}>
            {w > 40 && <span className="num">{romain(a)}</span>}
            {edite === a
              ? <input autoFocus defaultValue={A.n}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { onRenommer(a, e.currentTarget.value); setEdite(null); }
                    else if (e.key === 'Escape') setEdite(null);
                    e.stopPropagation();
                  }}
                  onBlur={(e) => { onRenommer(a, e.currentTarget.value); setEdite(null); }} />
              : w > nom.length * 8.6 + 54 && <span className="nom">{nom}</span>}
          </div>
        );
      })}
      <button className="cd-plus" title="Nouvel acte en fin de conduite" style={{ left: plan.total * pps + 8, top: 30, height: 26 }}
        onPointerDown={(e) => e.stopPropagation()} onClick={onAjouter}>+</button>
    </>
  );
});

// ── les moments ─────────────────────────────────────────────
interface PropsMoments {
  plan: Plan; pps: number; selMoment?: string;
  /** registre des éléments des moments : la tête de lecture y pose l'avancement sans re-rendu */
  registre: Map<string, HTMLDivElement>;
  onChoisir: (id: string, clientX?: number) => void; onOuvrir: (id: string) => void;
  onRedimensionner: (id: string, ratio: number) => void; onAjouter: () => void;
}

export const RangeeMoments = memo(function RangeeMoments({ plan, pps, selMoment, registre, onChoisir, onOuvrir, onRedimensionner, onAjouter }: PropsMoments) {
  const [rs, setRs] = useState<{ id: string; ratio: number } | null>(null);
  return (
    <>
      {plan.evs.map((e) => {
        const ratio = rs && rs.id === e.ev.id ? rs.ratio : 1;
        const duree = e.E - e.S;
        const w = Math.max(3, duree * ratio * pps - 2);
        const acc: CSSProperties = { left: e.S * pps, width: w, ['--cd-acc' as string]: 'var(--cd-acte-' + (e.ev.act % 5) + ')' };
        return (
          <div key={e.ev.id} className="cd-moment" style={acc} data-sel={selMoment === e.ev.id ? '' : undefined}
            ref={(el) => { if (el) registre.set(e.ev.id, el); else registre.delete(e.ev.id); }}
            title={e.ev.name + ' · ' + fm(duree) + ' — clic : choisir · double-clic : cadrer dans la planche'}
            onPointerDown={(ev) => { if (ev.button !== 0) return; ev.stopPropagation(); onChoisir(e.ev.id, ev.clientX); }}
            onDoubleClick={(ev) => { ev.stopPropagation(); onOuvrir(e.ev.id); }}>
            {e.run.slice(1).map((r) => (
              <span key={r.st.id} className="cran" style={{ left: ((r.S - e.S) / Math.max(1, duree)) * 100 + '%' }} />
            ))}
            {w > 60 && <span className="nom">{e.ev.name}</span>}
            <span className="poignee" title="Tirer pour allonger ou raccourcir le moment"
              onPointerDown={(ev) => {
                if (ev.button !== 0) return;
                ev.stopPropagation();
                const x0 = ev.clientX, base = e.run.reduce((a, r) => a + (r.E - r.S), 0) || 1;
                let r = 1;
                glisser(ev, (m) => { r = Math.max(0.1, (base + (m.clientX - x0) / pps) / base); setRs({ id: e.ev.id, ratio: r }); },
                  () => { setRs(null); if (Math.abs(r - 1) > 0.001) onRedimensionner(e.ev.id, r); });
              }} />
          </div>
        );
      })}
      <button className="cd-plus" title="Nouveau moment en fin de conduite" style={{ left: plan.total * pps + 8, top: 62, height: 40 }}
        onPointerDown={(e) => e.stopPropagation()} onClick={onAjouter}>+</button>
    </>
  );
});

// ── les passages ────────────────────────────────────────────
interface PropsPassages { plan: Plan; pps: number; ouvert: string | null; temps: (s: Magasin) => number; onOuvrir: (id: string) => void }

export const RangeePassages = memo(function RangeePassages({ plan, pps, ouvert, temps, onOuvrir }: PropsPassages) {
  // Ne re-rend que lorsqu'un passage est franchi ou qu'une attente du top commence (pas à chaque image).
  const franchis = useMagasin((s) => {
    const t = temps(s);
    let n = 0;
    for (const g of plan.gates) if (t >= g.pass && !g.pend) n++;
    return n;
  });
  const attend = useMagasin((s) => (s.lecture?.attenteGo ? s.lecture.moment : null));
  const gates = plan.gates.filter((g) => g.i < plan.evs.length - 1);
  return (
    <>
      {gates.map((g, k) => {
        const go = g.g.mode === 'go', x = g.S * pps;
        return (
          <span key={g.ev.id}>
            <span className="cd-passage-attente" style={{ left: x, width: Math.max(0, (g.ready - g.S) * pps) }} />
            {g.hold > 0 && <span className="cd-passage-retenue" style={{ left: g.ready * pps, width: g.hold * pps }} />}
            <button className="cd-passage" style={{ left: x }}
              data-go={go ? '' : undefined} data-franchi={k < franchis ? '' : undefined}
              data-ouvert={ouvert === g.ev.id ? '' : undefined} data-attend={attend === g.ev.id && go ? '' : undefined}
              title={'Passage P' + (g.i + 1) + (go ? ' · attend le top' : ' · enchaîne seul') + ' — cliquer pour voir les conditions'}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onOuvrir(g.ev.id)}><i /></button>
          </span>
        );
      })}
    </>
  );
});
