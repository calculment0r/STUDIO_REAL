// Un moment sur la planche : cadre, titre, étapes (blocs ou pastilles), sorties en courbes avec leurs règles, ronds.
// Tout est posé en coordonnées du MONDE dans le calque transformé de la planche : le panoramique et le zoom ne
// re-rendent pas ce composant (seul le niveau de zoom sémantique, l'état de lecture ou le projet le font).
import { memo, useMemo, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { dureeEtape, type Etape } from '@studio-real/modele';
import {
  entreesDe, fm, hauteurBloc, liensDuMoment, regleSortie, libelleCondition, rondEntree, rondSortie, statutSortie,
  LARGEUR_BLOC, type CadreMoment, type Niveau, type StatutEtape,
} from './geometrie';
import { ApercuEtape, infoBloc, type ThemePlanche } from './pont-blocs';
import { LIGNE, px, teinte } from './styles';

export interface ApiPlanche {
  saisirEtape: (e: RPointerEvent, moment: string, etape: string, poignee: boolean) => void;
  saisirSortie: (e: RPointerEvent, moment: string, etape: string, x: number, y: number) => void;
  choisirSortie: (e: RPointerEvent, moment: string, index: number) => void;
  deplacerSortie: (moment: string, index: number, sens: -1 | 1) => void;
  saisirRotatif: (e: RPointerEvent, moment: string, etape: string, i: number, v0: number) => void;
}

export interface EtatActif { etape: string; tEtape: number; bloque: boolean }
export interface RotatifProvisoire { etape: string; i: number; v: number }

export interface ProprietesMoment {
  cadre: CadreMoment;
  niveau: Niveau;
  /** Moment dans la vue (sinon on ne dessine que le cadre et son titre). */
  detail: boolean;
  theme: ThemePlanche;
  /** Statuts des étapes encodés « id=statut|… » ('' sans lecture) : chaîne stable pour la mémoïsation. */
  statuts: string;
  /** Étapes jouées dans ce moment, dans l'ordre, jointes par « | ». */
  parcours: string;
  actif: EtatActif | null;
  vif: boolean;
  enAttenteTop: boolean;
  terne: boolean;
  selMoment: boolean;
  selEtape: string | null;
  selSortie: number;
  /** Étape d'où part un lien en cours de création dans ce moment. */
  lienDepuis: string | null;
  editable: boolean;
  rotatif: RotatifProvisoire | null;
  tag: string;
  api: ApiPlanche;
}

const COULEUR_STATUT: Record<string, string> = { joue: 'var(--gt)', actif: 'var(--ort)' };

export const MomentPlanche = memo(function MomentPlanche(p: ProprietesMoment) {
  const { cadre: f, niveau, theme } = p;
  const m = f.moment;
  const loin = niveau === 'loin';
  const NH = hauteurBloc(niveau);

  const statuts = useMemo(() => {
    const r: Record<string, StatutEtape> = {};
    if (p.statuts) for (const kv of p.statuts.split('|')) { const [k, v] = kv.split('='); r[k] = v as StatutEtape; }
    return r;
  }, [p.statuts]);
  const parcours = useMemo(() => (p.parcours ? p.parcours.split('|') : []), [p.parcours]);
  const liens = useMemo(() => (p.detail ? liensDuMoment(f, niveau) : []), [f, niveau, p.detail]);
  const parSource = useMemo(() => {
    const r = new Map<string, number[]>();
    m.tr.forEach((s, i) => r.set(s.a, [...(r.get(s.a) ?? []), i]));
    return r;
  }, [m.tr]);
  const entrees = useMemo(() => entreesDe(m), [m]);

  const nom = m.name.toUpperCase();
  const fondCadre = p.vif ? teinte('var(--gt)', 8) : LIGNE(0.02);
  const anneauCadre = p.selMoment ? `inset 0 0 0 ${px(1.5)} var(--cy)` : p.vif ? `inset 0 0 0 ${px(1)} ${teinte('var(--gt)', 60)}` : `inset 0 0 0 ${px(1)} ${LIGNE(0.13)}`;

  return (
    <>
      {/* Cadre du moment */}
      <div className="planche-cadre" style={{ left: f.r.x, top: f.r.y, width: f.r.w, height: f.r.h, background: fondCadre, boxShadow: anneauCadre, opacity: p.terne ? 0.4 : 1, pointerEvents: 'none' }} />
      <div className="planche-ecran" style={{ left: f.r.x, top: f.r.y, pointerEvents: 'none' }}>
        {loin ? (
          <div style={{ position: 'absolute', left: 0, bottom: 10, width: `calc(${f.r.w}px * var(--z))`, display: 'flex', flexDirection: 'column-reverse', gap: 6, opacity: p.terne ? 0.5 : 1 }}>
            <span className="planche-micro" style={{ color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{p.tag}</span>
            <span className="planche-titre" style={{ fontSize: `clamp(9px, calc((${f.r.w}px * var(--z) - 10px) / ${(nom.length * 1.02).toFixed(2)}), 20px)`, letterSpacing: '.08em', lineHeight: 1.2, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</span>
          </div>
        ) : (
          <div style={{ position: 'absolute', left: 18, top: 16, display: 'flex', flexDirection: 'column', gap: 6, opacity: p.terne ? 0.5 : 1 }}>
            <span className="planche-micro" style={{ color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{p.tag}</span>
            <span className="planche-titre" style={{ fontSize: 14, letterSpacing: '.08em', lineHeight: 1.2, color: 'var(--ink)', maxWidth: `max(60px, calc(${f.r.w}px * var(--z) - 120px))` }}>{nom}</span>
          </div>
        )}
      </div>
      {(p.vif || p.enAttenteTop) && (
        <div className="planche-ecran" style={{ left: f.r.x + f.r.w, top: f.r.y, pointerEvents: 'none' }}>
          <span className="planche-micro" style={{ position: 'absolute', right: 0, top: -26, color: p.enAttenteTop ? 'var(--bg)' : 'var(--gink)', background: p.enAttenteTop ? 'var(--ort)' : 'var(--gdeep)', padding: '5px 8px', borderRadius: 5, whiteSpace: 'nowrap' }}
            >{p.enAttenteTop ? 'ATTENTE DU TOP' : 'EN COURS'}</span>
        </div>
      )}

      {p.detail && (
        <>
          {/* Sorties : courbes */}
          <svg className="planche-svg" style={{ opacity: p.terne ? 0.4 : 1 }}>
            {liens.map(l => {
              const ws = statutSortie(l.sortie, statuts, parcours);
              const sel = p.selSortie === l.index;
              const st: CSSProperties = {
                stroke: sel ? 'var(--cy)' : ws === 'franchie' ? 'var(--gt)' : ws === 'evaluee' ? 'var(--ort)' : ws === 'ignoree' ? LIGNE(0.25) : LIGNE(0.45),
                strokeWidth: sel || ws === 'evaluee' ? 2 : ws === 'franchie' ? 1.2 : 1.4,
                strokeDasharray: ws === 'ignoree' ? '3 6' : ws === 'evaluee' ? '7 5' : undefined,
                opacity: ws === 'ignoree' ? 0.7 : 1,
              };
              return <path key={l.index} d={l.d} style={st} className={ws === 'evaluee' ? 'planche-lien--actif' : undefined} />;
            })}
          </svg>
          {liens.filter(l => statutSortie(l.sortie, statuts, parcours) === 'evaluee').map(l => (
            <span key={'imp' + l.index} className="planche-impulsion" style={{ offsetPath: `path('${l.d}')` } as CSSProperties}>
              <span style={{ transform: 'scale(calc(1 / var(--z)))' }} />
            </span>
          ))}

          {/* Règles lisibles sur les liens */}
          {!loin && liens.map(l => {
            const ws = statutSortie(l.sortie, statuts, parcours);
            const sel = p.selSortie === l.index;
            const lignes = l.sortie.g.length ? l.sortie.g.map(libelleCondition) : [regleSortie(l.sortie, l.nb)];
            const point = ws === 'franchie' ? 'var(--gt)' : ws === 'evaluee' ? 'var(--ort)' : LIGNE(0.5);
            const creux = ws !== 'franchie' && ws !== 'evaluee';
            return (
              <div key={'r' + l.index} className="planche-ecran" style={{ left: l.milieu.x, top: l.milieu.y, zIndex: 3 }}>
                <div data-ui="1" className="planche-regle" title="Cliquer pour choisir cette sortie"
                  onPointerDown={e => p.api.choisirSortie(e, m.id, l.index)}
                  style={{ maxWidth: `max(90px, calc(320px * var(--z) - 20px))`, boxShadow: `inset 0 0 0 1px ${sel ? 'var(--cy)' : ws === 'evaluee' ? teinte('var(--ort)', 70) : LIGNE(0.2)}`, opacity: p.terne ? 0.4 : ws === 'ignoree' ? 0.6 : 1 }}>
                  {l.nb > 1 && <span className="planche-chiffre" style={{ fontSize: 7, letterSpacing: '.14em', color: 'var(--ort)' }}>SORTIE {l.ordre + 1} / {l.nb}</span>}
                  {l.sortie.g.length > 1 && <span className="planche-micro" style={{ fontSize: 7, letterSpacing: '.2em', color: 'var(--ink3)' }}>{l.sortie.mode === 'any' ? 'une seule suffit' : 'toutes requises'}</span>}
                  {lignes.map((t, i) => (
                    <span key={i} className="planche-regle__ligne">
                      <span className={'planche-point' + (ws === 'evaluee' ? ' planche-pulse' : '')} style={{ width: 7, height: 7, background: creux ? 'transparent' : point, boxShadow: creux ? `inset 0 0 0 1.2px ${point}` : 'none' }} />
                      <span className="planche-regle__txt">{t}</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Étapes */}
          {m.st.map((st, si) => (
            <BlocEtape key={st.id} st={st} si={si} pos={f.P[st.id]} momentId={m.id} niveau={niveau} NH={NH} theme={theme}
              statut={statuts[st.id] ?? 'neutre'} actif={p.actif && p.actif.etape === st.id ? p.actif : null}
              sel={p.selEtape === st.id} terne={p.terne} entree={entrees.includes(st.id)}
              sorties={parSource.get(st.id) ?? []} moment={m} selSortie={p.selSortie}
              rotatif={p.rotatif && p.rotatif.etape === st.id ? p.rotatif : null}
              cibleLien={!!p.lienDepuis && p.lienDepuis !== st.id} editable={p.editable} api={p.api} />
          ))}
        </>
      )}
    </>
  );
});

interface ProprietesBloc {
  st: Etape; si: number; pos: { x: number; y: number }; momentId: string; niveau: Niveau; NH: number; theme: ThemePlanche;
  statut: StatutEtape; actif: EtatActif | null; sel: boolean; terne: boolean; entree: boolean;
  sorties: number[]; moment: CadreMoment['moment']; selSortie: number; rotatif: RotatifProvisoire | null;
  cibleLien: boolean; editable: boolean; api: ApiPlanche;
}

const TXT_STATUT: Record<StatutEtape, string> = { neutre: 'à jouer', joue: 'joué', actif: 'en cours', avenir: 'à venir', ignore: 'non choisi' };

function BlocEtape(b: ProprietesBloc) {
  const { st, pos, niveau, NH, momentId, api } = b;
  const info = infoBloc(st.ty, b.theme);
  const acc = info.couleur;
  const loin = niveau === 'loin';
  const act = b.statut === 'actif';
  const ignore = b.statut === 'ignore';
  const d = dureeEtape(st);
  const prog = act && b.actif ? Math.max(0, Math.min(1, b.actif.tEtape / d)) : b.statut === 'joue' ? 1 : 0;
  const bloque = !!(act && b.actif?.bloque);
  const k = b.rotatif ? st.k.map((v, i) => (i === b.rotatif!.i ? b.rotatif!.v : v)) : st.k;

  const ronds = (
    <Ronds b={b} acc={acc} act={act} />
  );

  if (loin) {
    const fond = act ? 'var(--ort)' : b.statut === 'joue' ? 'var(--gt)' : ignore ? 'transparent' : 'var(--tile)';
    const anneau = b.sel ? `inset 0 0 0 ${px(1.5)} var(--cy), 0 0 0 ${px(3)} ${teinte('var(--cy)', 18)}`
      : act ? `0 0 0 ${px(4)} ${teinte('var(--ort)', 16)}` : ignore ? 'none' : `inset 0 0 0 ${px(1)} ${LIGNE(0.35)}`;
    return (
      <>
        <div className="planche-ecran" style={{ left: pos.x, top: pos.y, pointerEvents: 'none' }}>
          <span className="planche-titre" style={{ position: 'absolute', left: 0, top: -17, width: `max(70px, calc(240px * var(--z) + 40px))`, fontSize: 8.5, letterSpacing: '.08em', textTransform: 'uppercase', color: act ? 'var(--ort)' : b.sel ? 'var(--cy)' : 'var(--ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: ignore ? 0.5 : b.terne ? 0.45 : 1 }}>{st.name}</span>
        </div>
        <div data-etape={st.id} data-moment={momentId} className={'planche-pastille' + (bloque ? ' planche-pulse' : '')} title={st.name}
          onPointerDown={e => api.saisirEtape(e, momentId, st.id, true)} onDoubleClick={e => e.stopPropagation()}
          style={{ left: pos.x, top: pos.y, width: LARGEUR_BLOC, height: NH, background: fond, boxShadow: anneau, border: ignore ? `${px(1)} dashed ${LIGNE(0.35)}` : 'none', opacity: b.terne ? 0.45 : 1 }} />
        {ronds}
      </>
    );
  }

  const anneau = bloque ? `inset 0 0 0 ${px(2)} var(--ort), 0 0 0 ${px(6)} ${teinte('var(--ort)', 22)}`
    : act ? `inset 0 0 0 ${px(1.5)} var(--ort), 0 0 0 ${px(5)} ${teinte('var(--ort)', 13)}`
      : b.sel ? `inset 0 0 0 ${px(1.5)} var(--cy), 0 0 0 ${px(4)} ${teinte('var(--cy)', 16)}`
        : b.cibleLien ? `inset 0 0 0 ${px(1)} ${teinte('var(--cy)', 50)}` : `inset 0 0 0 ${px(1)} ${LIGNE(0.18)}`;
  const long = st.name.length > 14;
  const pointCouleur = COULEUR_STATUT[b.statut] ?? acc;
  const resteOuDuree = act && b.actif ? fm(Math.max(0, d - b.actif.tEtape)) : fm(d);
  const nbS = b.sorties.length;

  return (
    <>
      <div data-etape={st.id} data-moment={momentId} className="planche-bloc"
        onPointerDown={e => api.saisirEtape(e, momentId, st.id, false)} onDoubleClick={e => e.stopPropagation()}
        style={{ left: pos.x, top: pos.y, width: LARGEUR_BLOC, height: NH, borderRadius: `max(12px, ${px(4)})`, background: act ? 'var(--tile2)' : 'var(--tile)', boxShadow: anneau, opacity: ignore ? 0.5 : b.terne ? 0.4 : 1 }}>
        <div className="planche-bloc__tete" onPointerDown={e => api.saisirEtape(e, momentId, st.id, true)} style={{ cursor: b.editable ? 'grab' : 'pointer' }}>
          <span className={'planche-point' + (act ? ' planche-pulse' : '')} style={{ background: ignore ? 'transparent' : pointCouleur, boxShadow: ignore ? `inset 0 0 0 1.2px ${pointCouleur}` : 'none' }} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
            <span className="planche-bloc__nom">
              {long
                ? <span className="planche-defile" style={{ '--duree': `${(6 + st.name.length * 0.25).toFixed(1)}s` } as CSSProperties}>{st.name}{'   ·   '}{st.name}{'   ·   '}</span>
                : st.name}
            </span>
            <span className="planche-bloc__sous">{String(b.si + 1).padStart(2, '0')} · {info.label} · {TXT_STATUT[b.statut]}</span>
          </span>
          <span className="planche-chiffre" style={{ fontSize: 11, color: act ? 'var(--ort)' : 'var(--ink2)', flex: 'none', width: 40, textAlign: 'right' }}>{resteOuDuree}</span>
          <span className="planche-bloc__prog"><span style={{ width: (prog * 100).toFixed(1) + '%', background: act ? 'var(--ort)' : 'var(--gt)' }} /></span>
          {bloque && <span className="planche-bloque planche-pulse">BLOQUÉ</span>}
        </div>
        <div className="planche-bloc__apercu">
          <ApercuEtape ty={st.ty} k={k} t={act && b.actif ? b.actif.tEtape : 0} actif={act} theme={b.theme} echelle={niveau === 'pres' ? 2 : 1} />
        </div>
        {niveau === 'pres' && (
          <>
            <div className="planche-rotatifs">
              <Rotatif lab="durée" disp={fm(dureeEtape({ k }))} v={k[0] ?? 0} couleur="var(--ort)" echelle={1} editable={b.editable}
                onSaisir={e => api.saisirRotatif(e, momentId, st.id, 0, st.k[0] ?? 0)} />
              {info.reglages.map((r, j) => (
                <Rotatif key={j} lab={r.nom.slice(0, 9)} disp={r.formater(k[j + 1] ?? 0)} v={k[j + 1] ?? 0} couleur={acc} echelle={1} editable={b.editable}
                  onSaisir={e => api.saisirRotatif(e, momentId, st.id, j + 1, st.k[j + 1] ?? 0)} />
              ))}
            </div>
            <div className="planche-sorties" data-scroll="1">
              <span className="planche-micro" style={{ fontSize: 6.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                SORTIES · {nbS > 1 ? 'DE HAUT EN BAS · LA PREMIÈRE REMPLIE GAGNE' : nbS ? 'UNE SEULE' : 'AUCUNE · TIRER LE ROND +'}
              </span>
              {b.sorties.map((ti, k2) => {
                const s = b.moment.tr[ti];
                const vers = s.b ? (b.moment.st.find(x => x.id === s.b)?.name ?? '?') : 'fin du moment';
                return (
                  <span key={ti} className={'planche-sortie' + (b.selSortie === ti ? ' planche-sortie--sel' : '')} data-ui="1"
                    onPointerDown={e => api.choisirSortie(e, momentId, ti)}>
                    <span className="planche-chiffre" style={{ fontSize: 8, color: 'var(--ink3)', width: 10 }}>{k2 + 1}</span>
                    <span className="planche-point" style={{ width: 6, height: 6, background: acc }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vers}</span>
                    <span className="planche-micro" style={{ fontSize: 6.5, letterSpacing: '.08em', color: 'var(--ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80 }}>
                      {s.g.length ? s.g.map(libelleCondition).join(s.mode === 'any' ? ' ou ' : ' et ') : nbS > 1 ? 'sinon · à la fin' : 'à la fin'}
                    </span>
                    {b.editable && nbS > 1 && (
                      <>
                        <span className="planche-sortie__fl" role="button" aria-disabled={k2 === 0} title="Monter (évaluée plus tôt) · Alt + ↑"
                          onPointerDown={e => { e.stopPropagation(); if (k2 > 0) api.deplacerSortie(momentId, ti, -1); }}>▲</span>
                        <span className="planche-sortie__fl" role="button" aria-disabled={k2 === nbS - 1} title="Descendre · Alt + ↓"
                          onPointerDown={e => { e.stopPropagation(); if (k2 < nbS - 1) api.deplacerSortie(momentId, ti, 1); }}>▼</span>
                      </>
                    )}
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>
      {ronds}
    </>
  );
}

/** Ronds d'entrée (gauche) et de sortie (droite, numérotés dans l'ordre d'évaluation), à taille d'écran constante. */
function Ronds({ b, acc, act }: { b: ProprietesBloc; acc: string; act: boolean }) {
  const { st, pos, niveau, momentId, api } = b;
  const loin = niveau === 'loin';
  const t = loin ? 10 : 13;
  const e = rondEntree(pos);
  const nb = b.sorties.length;
  const outs: { k: number; plus: boolean; titre: string }[] = loin
    ? [{ k: 0, plus: false, titre: 'Sorties de l’étape' }]
    : [
      ...b.sorties.map((ti, k) => {
        const s = b.moment.tr[ti];
        return { k, plus: false, titre: `Sortie ${k + 1} → ${s.b ? (b.moment.st.find(x => x.id === s.b)?.name ?? '') : 'fin du moment'}` };
      }),
      ...(b.editable ? [{ k: nb, plus: true, titre: 'Nouvelle sortie : tirer vers une étape, ou dans le vide pour créer une étape' }] : []),
    ];
  const couleurEntree = b.cibleLien ? 'var(--cy)' : 'var(--port)';
  return (
    <>
      <div className="planche-ecran" style={{ left: e.x, top: e.y, zIndex: 4 }}>
        <span data-ui="1" data-etape={st.id} data-moment={momentId} className="planche-rond" title="Entrée de l’étape"
          onPointerDown={ev => ev.stopPropagation()}
          style={{ left: -t / 2, top: -t / 2, width: t, height: t, background: b.entree ? couleurEntree : 'var(--bg)', boxShadow: `inset 0 0 0 2px ${couleurEntree}${b.cibleLien ? `, 0 0 0 5px ${teinte('var(--cy)', 22)}` : ''}` }} />
      </div>
      {outs.map(o => {
        const r = rondSortie(pos, o.k, niveau);
        return (
          <div key={o.k} className="planche-ecran" style={{ left: r.x, top: r.y, zIndex: 4 }}>
            <span data-ui="1" className="planche-rond" title={o.titre}
              onPointerDown={ev => api.saisirSortie(ev, momentId, st.id, r.x, r.y)}
              style={{ left: -t / 2, top: -t / 2, width: t, height: t, background: act && !o.plus ? acc : 'var(--bg)', boxShadow: `inset 0 0 0 ${o.plus ? 1.5 : 2}px ${acc}`, opacity: o.plus ? 0.7 : 1 }}>
              {!loin && (o.plus
                ? <span className="planche-rond__no" style={{ color: acc, fontSize: 9 }}>+</span>
                : nb > 1 && <span className="planche-rond__no" style={{ color: act ? 'var(--bg)' : acc }}>{o.k + 1}</span>)}
            </span>
          </div>
        );
      })}
    </>
  );
}

/** Rotatif (même dessin que le design) : glisser verticalement pour régler. */
function Rotatif({ lab, disp, v, couleur, editable, onSaisir }: { lab: string; disp: string; v: number; couleur: string; echelle: number; editable: boolean; onSaisir: (e: RPointerEvent) => void }) {
  const val = Math.max(0, Math.min(100, v));
  return (
    <span className="planche-rotatif">
      <span className="planche-rotatif__bouton" data-ui="1" style={{ cursor: editable ? 'ns-resize' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (editable) onSaisir(e); }}>
        <svg viewBox="0 0 40 40" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
          <circle cx="20" cy="20" r="19" fill="none" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="0.01 4.97" style={{ stroke: LIGNE(0.4) }} />
          <circle cx="20" cy="20" r="14.5" style={{ fill: 'var(--tile2)' }} />
          <circle cx="20" cy="20" r="14.5" fill="none" strokeWidth="2.6" strokeDasharray="68.3 200" transform="rotate(135 20 20)" style={{ stroke: LIGNE(0.14) }} />
          <circle cx="20" cy="20" r="14.5" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeDasharray={`${(val / 100 * 68.3).toFixed(2)} 200`} transform="rotate(135 20 20)" style={{ stroke: couleur }} />
        </svg>
        <span style={{ position: 'absolute', left: '50%', top: '50%', width: 2, height: '31%', marginLeft: -1, borderRadius: 1, background: couleur, transformOrigin: '50% 0', transform: `rotate(${val * 2.7 + 45}deg)` }} />
      </span>
      <span className="planche-rotatif__val">{disp}</span>
      <span className="planche-rotatif__lab">{lab}</span>
    </span>
  );
}
