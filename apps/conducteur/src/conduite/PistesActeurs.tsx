// Pistes par acteur de la conduite (facultatives, activables par acteur) : des pavés colorés par écran, dérivés des
// envois le long du temps prévu (pistes-acteurs.ts). Lecture seule : un clic sur un pavé choisit l'étape qui envoie
// (le panneau de droite montre alors ses ENVOIS). Elles se dessinent sous les pistes du projet.
import { memo, type CSSProperties } from 'react';
import type { Acteur, Projet } from '@studio-real/modele';
import { useMagasin } from '../etat/magasin';
import { useInterface } from '../coquille/interface';
import type { Plan } from './planning';
import { couleurEcran, pistesActeur } from './pistes-acteurs';
import { fm } from './temps';

/** Hauteur d'une piste d'acteur. */
export const HAUTEUR_PISTE_ACTEUR = 34;

/** Acteurs du projet dont la piste est montrée (dans l'ordre du projet). */
export function acteursMontres(projet: Projet, ids: readonly string[]): Acteur[] {
  return (Array.isArray(projet.acteurs) ? projet.acteurs : []).filter(a => a && ids.includes(a.id));
}

const PisteActeur = memo(function PisteActeur({ a, top, plan, pps, sel }: { a: Acteur; top: number; plan: Plan; pps: number; sel: string | null }) {
  const paves = pistesActeur(plan, a.id);
  const style = { top, height: HAUTEUR_PISTE_ACTEUR, ['--cd-piste' as string]: a.rendu === 'telephone' ? 'var(--fam-ui)' : 'var(--fam-scene)' } as CSSProperties;
  return (
    <div className="cd-piste cd-piste-acteur" style={style}>
      <div className="cd-piste-voie">
        <div className="cd-piste-defile">
          {paves.map((p, i) => {
            const w = Math.max(3, (p.E - p.S) * pps);
            const c = couleurEcran(p.ecran);
            return (
              <div key={i} className="cd-pave" data-actif={sel === p.moment + '/' + p.etape ? '' : undefined} data-passe={p.tenu ? undefined : ''}
                style={{ left: p.S * pps, width: w, ['--cd-pave' as string]: c } as CSSProperties}
                title={`${a.nom || a.id} · ${p.nom} · ${fm(p.S)} → ${fm(p.E)}${p.partiel ? ' · une partie de la foule' : ''}${p.tenu ? '' : ' · le temps de l’étape'}`}
                onPointerDown={e => { if (e.button !== 0) return; e.stopPropagation(); useMagasin.getState().selectionner({ moment: p.moment, etape: p.etape }); }}>
                {w > 30 && <span className="nom">{p.nom}</span>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="cd-piste-tete" onPointerDown={e => e.stopPropagation()}>
        <span className="cd-piste-nom" title={'Piste de ' + (a.nom || a.id) + ' : dérivée des envois (lecture seule)'}>{a.nom || a.id}</span>
        <button className="cd-muet" title="Cacher la piste de cet acteur" onClick={() => useInterface.getState().basculerPisteActeur(a.id)}>✕</button>
      </div>
    </div>
  );
});

/** Les pistes des acteurs montrés, à partir de `top` (px dans le calque des pistes). Renvoie aussi leur hauteur totale. */
export function PistesActeurs({ projet, plan, pps, top }: { projet: Projet; plan: Plan; pps: number; top: number }) {
  const ids = useInterface(s => s.pistesActeurs);
  const sel = useMagasin(s => (s.selection.moment && s.selection.etape ? s.selection.moment + '/' + s.selection.etape : null));
  const acteurs = acteursMontres(projet, ids);
  return (
    <>
      {acteurs.map((a, i) => (
        <PisteActeur key={a.id} a={a} top={top + i * (HAUTEUR_PISTE_ACTEUR + 1)} plan={plan} pps={pps} sel={sel} />
      ))}
    </>
  );
}

/** Entrées de menu « piste d'un acteur » (cases à cocher), pour les menus « + PISTE ». */
export function MenuPistesActeurs({ projet }: { projet: Projet }) {
  const ids = useInterface(s => s.pistesActeurs);
  const acteurs = Array.isArray(projet.acteurs) ? projet.acteurs.filter(a => a && typeof a.id === 'string') : [];
  if (!acteurs.length) return null;
  return (
    <>
      <span className="cd-menu-tete">PISTES PAR ACTEUR · DÉRIVÉES DES ENVOIS</span>
      {acteurs.map(a => (
        <button key={a.id} className="cd-menu-item" onClick={() => useInterface.getState().basculerPisteActeur(a.id)}>
          <span className="pastille" style={{ background: a.rendu === 'telephone' ? 'var(--fam-ui)' : 'var(--fam-scene)', opacity: ids.includes(a.id) ? 1 : 0.35 }} />
          <span className="col"><span className="n">{(ids.includes(a.id) ? '✓ ' : '') + (a.nom || a.id)}</span><span className="d">{a.id} · {ids.includes(a.id) ? 'cacher la piste' : 'montrer la piste'}</span></span>
        </button>
      ))}
    </>
  );
}
