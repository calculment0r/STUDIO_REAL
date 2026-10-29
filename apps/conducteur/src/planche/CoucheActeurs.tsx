// Les acteurs sur la planche (audit 2026-10, rapport 1 §4.4, rapport 3 §4.6) : calque à l'ÉCRAN posé sur le monde.
//   - bande des acteurs (rail PLATEAU) fixe à gauche : un nœud par acteur (glyphe du type, nom, pastille d'état tirée
//     de etat/acteurs.ts), vignette au survol (dernière vue connue, sinon la vue attendue d'après la lecture) ;
//   - liens étape → acteur (un par envoi, couleur de la famille « Écrans du public » ou « Scène et régie ») et
//     acteur → sortie (condition sig: / sigv:, couleur « Quand ») ; seuls les blocs visibles en donnent ; ceux de l'étape
//     choisie et de l'acteur survolé sont appuyés ;
//   - création : tirer la poignée « envoyer » d'un bloc vers un nœud ouvre le menu des écrans de cet acteur ; clic
//     droit sur un nœud : « envoyer un écran ici » (étape choisie), « attendre un signal » (sortie choisie).
// Géométrie pure : ./acteurs.ts. Rien n'est écrit ailleurs que par modifierProjet.
// Performance (lot performance-react) : le composant est mémorisé (la planche ne le re-rend que si la caméra, la taille, le
// projet ou la sélection changent), ne lit PAS la lecture (seule la vignette survolée lit le moment et l'étape) et ses
// nœuds sont mémorisés avec des rappels stables.
import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type Ref } from 'react';
import { vueActeur, type Acteur, type Projet } from '@studio-real/modele';
import { useMagasin, type Selection } from '../etat/magasin';
import { useEtatActeurs, type EtatActeur } from '../etat/acteurs';
import { usePastillesActeurs } from '../coquille/rail-etat';
import { useInterface } from '../coquille/interface';
import { ajouterConditionSignal, ajouterEnvoi } from '../coquille/envois';
import { ApercuActeur } from '../coquille/ApercuEnvoi';
import { Glyphe } from '../coquille/InspecteurEnvois';
import {
  BANDE, glypheActeur, liensEnvois, liensSignaux, placerBande, resumeEnvoi, cheminVersActeur, type NoeudActeur,
} from './acteurs';
import type { CadreMoment, Camera, Niveau, Point, Rect } from './geometrie';

export interface ApiCoucheActeurs {
  /** Poignée « envoyer » d'un bloc saisie : on tire un lien vers un nœud acteur. */
  commencerEnvoi: (e: { clientX: number; clientY: number }, moment: string, etape: string) => void;
}

type Menu =
  | { genre: 'ecrans'; x: number; y: number; acteur: string; moment: string; etape: string }
  | { genre: 'acteur'; x: number; y: number; acteur: string }
  | { genre: 'signaux'; x: number; y: number; acteur: string; moment: string; sortie: number };

interface Proprietes {
  ref?: Ref<ApiCoucheActeurs>;
  projet: Projet;
  cadres: CadreMoment[];
  cam: Camera;
  niveau: Niveau;
  taille: { l: number; h: number };
  /** rectangle du monde visible (null tant que la boîte n'est pas mesurée) */
  vue: Rect | null;
  selection: Selection;
  editable: boolean;
  /** coordonnées d'écran (clientX/Y) → coordonnées dans la boîte de la planche */
  relatif: (cx: number, cy: number) => Point;
  dire: (t: string) => void;
}

export const CoucheActeurs = memo(function CoucheActeurs({ ref, projet, cadres, cam, niveau, taille, vue, selection, editable, relatif, dire }: Proprietes) {
  const repliee = useInterface(s => s.bandeRepliee);
  const liensOn = useInterface(s => s.liensActeurs);
  const etats = useEtatActeurs();
  const pastilles = usePastillesActeurs();
  const [defil, setDefil] = useState(0);
  const [survol, setSurvol] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  // rappels des nœuds de la bande : les mêmes d'un rendu à l'autre (NoeudBande est mémorisé), l'acteur est passé en argument
  const entrer = useCallback((id: string) => setSurvol(id), []);
  const sortir = useCallback((id: string) => setSurvol(s => (s === id ? null : s)), []);
  const menuActeur = useCallback((id: string, x: number, y: number) => setMenu({ genre: 'acteur', x, y, acteur: id }), []);
  const [trait, setTrait] = useState<{ a: Point; b: Point; moment: string; etape: string } | null>(null);
  const acteurs = useMemo(() => (Array.isArray(projet.acteurs) ? projet.acteurs.filter(a => a && typeof a.id === 'string') : []), [projet.acteurs]);
  const noeuds = useMemo(() => (repliee ? [] : placerBande(acteurs, taille.h, defil)), [acteurs, taille.h, defil, repliee]);
  const visibles = useMemo(() => noeuds.filter(n => !n.cache), [noeuds]);

  // ── tirer un envoi depuis la poignée d'un bloc ──
  const etat = useRef({ relatif, editable, dire });
  etat.current = { relatif, editable, dire };
  const commencerEnvoi = useCallback((e: { clientX: number; clientY: number }, moment: string, etape: string) => {
    const { relatif: rel, editable: ed, dire: d } = etat.current;
    if (!ed) { d('SPECTACLE : la planche est verrouillée.'); return; }
    if (useInterface.getState().bandeRepliee) useInterface.getState().poser({ bandeRepliee: false });
    const a = rel(e.clientX, e.clientY);
    setMenu(null);
    setTrait({ a, b: a, moment, etape });
    const bouger = (ev: PointerEvent) => setTrait(t => (t ? { ...t, b: etat.current.relatif(ev.clientX, ev.clientY) } : t));
    const lacher = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', bouger);
      window.removeEventListener('pointerup', lacher);
      window.removeEventListener('pointercancel', lacher);
      setTrait(null);
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-acteur]') as HTMLElement | null;
      const id = el?.dataset.acteur;
      if (!id) return;
      const p = etat.current.relatif(ev.clientX, ev.clientY);
      setMenu({ genre: 'ecrans', x: p.x, y: p.y, acteur: id, moment, etape });
    };
    window.addEventListener('pointermove', bouger);
    window.addEventListener('pointerup', lacher);
    window.addEventListener('pointercancel', lacher);
  }, []);
  useImperativeHandle(ref, () => ({ commencerEnvoi }), [commencerEnvoi]);

  // Échap ferme le menu
  useEffect(() => {
    if (!menu) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [menu]);

  // ── liens ──
  const liens = useMemo(() => {
    if (!visibles.length || !vue) return [];
    return [...liensEnvois(cadres, cam, visibles, niveau, vue), ...liensSignaux(cadres, cam, visibles, niveau, vue)];
  }, [cadres, cam, visibles, niveau, vue]);
  const appuye = (l: { acteur: string; moment: string; etape: string; genre: string; index: number }) =>
    l.acteur === survol || (selection.moment === l.moment && (l.genre === 'envoi' ? selection.etape === l.etape : selection.sortie === l.index || selection.etape === l.etape));
  const liensMontres = liensOn ? liens : liens.filter(appuye);

  // ── actions ──
  const { modifierProjet, selectionner } = useMagasin.getState();
  const envoyer = (acteur: Acteur, moment: string, etape: string, ecran: string) => {
    let ok = false;
    modifierProjet(p => { const st = p.ev.find(m => m.id === moment)?.st.find(s => s.id === etape); if (st) { ajouterEnvoi(st, acteur.id, ecran); ok = true; } }, 'envoi');
    setMenu(null);
    if (ok) { selectionner({ moment, etape }); dire(`Envoi ajouté : ${acteur.id.toUpperCase()} · ${ecran}. Réglez-le dans le panneau.`); }
  };
  const attendre = (acteur: Acteur, moment: string, sortie: number, signal: string) => {
    let ok = false;
    modifierProjet(p => { const s = p.ev.find(m => m.id === moment)?.tr[sortie]; if (s) ok = ajouterConditionSignal(s.g, `${acteur.id}.${signal}`); }, 'condition');
    setMenu(null);
    dire(ok ? `La sortie attend maintenant « ${acteur.id}.${signal} ».` : 'Cette sortie attend déjà ce signal.');
  };

  const acteurDe = (id: string) => acteurs.find(a => a.id === id);
  const menuX = (x: number) => Math.max(8, Math.min(x, taille.l - 250));
  const menuY = (y: number) => Math.max(8, Math.min(y, taille.h - 260));
  const enAttente = (m: Menu) => {
    const a = acteurDe(m.acteur);
    if (!a) return null;
    if (m.genre === 'ecrans') {
      const st = projet.ev.find(x => x.id === m.moment)?.st.find(x => x.id === m.etape);
      return (
        <>
          <span className="planche-menu__tete">ENVOYER À {(a.nom || a.id).toUpperCase()} · {st?.name ?? ''}</span>
          {(a.ecrans ?? []).map(e => (
            <button key={e} type="button" className="planche-menu__item planche-menu__item--ligne" onClick={() => envoyer(a, m.moment, m.etape, e)}>
              <span className="planche-point" style={{ background: a.rendu === 'telephone' ? 'var(--fam-ui)' : 'var(--fam-scene)' }} /><span className="n">{e}</span>
            </button>
          ))}
          {!(a.ecrans ?? []).length && <span className="planche-menu__tete">aucun écran déclaré pour cet acteur</span>}
        </>
      );
    }
    if (m.genre === 'signaux') {
      return (
        <>
          <span className="planche-menu__tete">ATTENDRE UN SIGNAL DE {(a.nom || a.id).toUpperCase()}</span>
          {(a.signaux ?? []).map(s => (
            <button key={s} type="button" className="planche-menu__item planche-menu__item--ligne" onClick={() => attendre(a, m.moment, m.sortie, s)}>
              <span className="planche-point" style={{ background: 'var(--fam-trig)' }} /><span className="n">{a.id}.{s}</span>
            </button>
          ))}
          {!(a.signaux ?? []).length && <span className="planche-menu__tete">aucun signal déclaré pour cet acteur</span>}
        </>
      );
    }
    const st = selection.moment && selection.etape ? projet.ev.find(x => x.id === selection.moment)?.st.find(x => x.id === selection.etape) : undefined;
    const sortie = selection.moment && selection.sortie !== undefined ? projet.ev.find(x => x.id === selection.moment)?.tr[selection.sortie] : undefined;
    const items: { n: string; d: string; ok: boolean; go: () => void }[] = [
      { n: 'Envoyer un écran ici', d: st ? `depuis « ${st.name} »` : 'choisissez d’abord une étape', ok: !!st && editable,
        go: () => { if (st && selection.moment) setMenu({ genre: 'ecrans', x: m.x, y: m.y, acteur: a.id, moment: selection.moment, etape: st.id }); } },
      { n: 'Attendre un signal', d: sortie ? 'sur la sortie choisie' : 'choisissez d’abord une sortie', ok: !!sortie && editable,
        go: () => { if (sortie && selection.moment && selection.sortie !== undefined) setMenu({ genre: 'signaux', x: m.x, y: m.y, acteur: a.id, moment: selection.moment, sortie: selection.sortie }); } },
      { n: 'Piste dans la conduite', d: useInterface.getState().pistesActeurs.includes(a.id) ? 'la cacher' : 'la montrer', ok: true,
        go: () => { useInterface.getState().basculerPisteActeur(a.id); setMenu(null); } },
      { n: 'Fiche de l’acteur…', d: 'Projet › Acteurs', ok: true, go: () => { setMenu(null); useInterface.getState().poser({ acteurs: true, acteurChoisi: a.id }); } },
    ];
    return (
      <>
        <span className="planche-menu__tete">ACTEUR · {(a.nom || a.id).toUpperCase()}</span>
        {items.map(it => (
          <button key={it.n} type="button" className="planche-menu__item" disabled={!it.ok} onClick={it.go}>
            <span className="n">{it.n}</span><span className="d">{it.d}</span>
          </button>
        ))}
      </>
    );
  };

  const stopper = { onPointerDown: (e: RPointerEvent) => e.stopPropagation(), onDoubleClick: (e: RMouseEvent) => e.stopPropagation() };
  const noeudSurvol = survol ? noeuds.find(n => n.id === survol && !n.cache) : undefined;

  return (
    <>
      {/* Liens (écran) */}
      {(liensMontres.length > 0 || trait) && (
        <svg className="acp-liens" width={taille.l} height={taille.h} aria-hidden="true">
          {liensMontres.map(l => (
            <path key={l.cle} d={l.d} className={'acp-lien ' + l.genre + (appuye(l) ? ' fort' : '')} style={{ stroke: l.couleur }} />
          ))}
          {trait && <path d={cheminVersActeur(trait.a.x, trait.a.y, trait.b.x, trait.b.y)} className="acp-lien envoi fort tire" style={{ stroke: 'var(--fam-ui)' }} />}
        </svg>
      )}

      {/* Bande des acteurs */}
      {acteurs.length > 0 && repliee && (
        <button type="button" className="acp-rouvrir" data-ui="1" {...stopper} onClick={() => useInterface.getState().poser({ bandeRepliee: false })}
          title="Montrer la bande des acteurs">PLATEAU · {acteurs.length} ›</button>
      )}
      {!repliee && (
        <div className="acp-bande" data-ui="1" style={{ left: BANDE.x, top: BANDE.haut - 24, width: BANDE.largeur }} {...stopper}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}>
          <div className="acp-tete">
            <span className="planche-micro">PLATEAU</span>
            <span className="acp-espace" />
            {acteurs.length > 0 && (
              <button type="button" className={'acp-bt' + (liensOn ? ' on' : '')} title={liensOn ? 'Cacher les liens (sauf l’étape choisie)' : 'Montrer tous les liens visibles'}
                onClick={() => useInterface.getState().basculer('liensActeurs')}>LIENS</button>
            )}
            <button type="button" className="acp-bt" title="Acteurs du projet…" onClick={() => useInterface.getState().poser({ acteurs: true })}>+</button>
            <button type="button" className="acp-bt" title="Replier la bande" onClick={() => useInterface.getState().poser({ bandeRepliee: true })}>‹</button>
          </div>
          <div className="acp-liste" data-scroll="1" style={{ height: Math.max(0, taille.h - BANDE.haut - BANDE.bas) }}
            onScroll={e => setDefil(e.currentTarget.scrollTop)}>
            <div style={{ position: 'relative', height: noeuds.length ? noeuds.length * (BANDE.hauteurNoeud + BANDE.ecart) - BANDE.ecart : 0 }}>
              {noeuds.map((n, i) => (
                <NoeudBande key={n.id} n={n} top={i * (BANDE.hauteurNoeud + BANDE.ecart)} etat={pastilles[n.id] ?? INCONNU}
                  cible={!!trait} survole={survol === n.id}
                  onEntrer={entrer} onSortir={sortir} onMenu={menuActeur} relatif={relatif} />
              ))}
            </div>
            {!acteurs.length && (
              <button type="button" className="acp-vide" onClick={() => useInterface.getState().poser({ acteurs: true })}>
                <span>+ ACTEURS</span><span className="d">écran scène, public, téléphones, agents</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Vignette au survol d'un acteur */}
      {noeudSurvol && !menu && !trait && (
        <Vignette n={noeudSurvol} projet={projet} etat={etats[noeudSurvol.id]} hauteurVue={taille.h} />
      )}

      {/* Menus */}
      {menu && (
        <div className="planche-menu" data-ui="1" style={{ left: menuX(menu.x), top: menuY(menu.y) }} {...stopper}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}>
          {enAttente(menu)}
          <button type="button" className="planche-menu__item planche-menu__item--ligne" onClick={() => setMenu(null)}><span className="d">fermer · Échap</span></button>
        </div>
      )}
    </>
  );
});

const NoeudBande = memo(function NoeudBande({ n, top, etat, cible, survole, onEntrer, onSortir, onMenu, relatif }: {
  n: NoeudActeur; top: number; etat: { texte: string; couleur: string }; cible: boolean; survole: boolean;
  onEntrer: (id: string) => void; onSortir: (id: string) => void; onMenu: (id: string, x: number, y: number) => void; relatif: (cx: number, cy: number) => Point;
}) {
  const a = n.acteur;
  return (
    <div className={'acp-noeud' + (cible ? ' cible' : '') + (survole ? ' survol' : '')} data-acteur={a.id} style={{ top, height: n.h }}
      title={`${a.nom || a.id} · ${a.id} · ${etat.texte} · clic droit : envoyer, attendre`}
      onPointerEnter={() => onEntrer(a.id)} onPointerLeave={() => onSortir(a.id)}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); const p = relatif(e.clientX, e.clientY); onMenu(a.id, p.x, p.y); }}
      onClick={e => { const p = relatif(e.clientX, e.clientY); onMenu(a.id, p.x, p.y); }}>
      <span className="acp-glyphe" style={{ color: a.rendu === 'telephone' ? 'var(--fam-ui)' : 'var(--fam-scene)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d={glypheActeur(a.type)} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span className="acp-txt">
        <span className="acp-nom">{a.nom || a.id}</span>
        <span className="acp-etat">{etat.texte}</span>
      </span>
      <span className="planche-point" style={{ width: 8, height: 8, background: etat.couleur }} />
      <span className="acp-ancre" />
    </div>
  );
});

const INCONNU = { texte: 'inconnu', couleur: 'rgba(var(--lr), .35)' };

/** « 42 ms · 82 % batterie » : ce que le battement dit de plus que l'écran affiché. */
function detailBattement(e: EtatActeur | undefined): string {
  if (!e) return '';
  return [e.rttMs !== undefined ? Math.round(e.rttMs) + ' ms' : '', e.batterie !== undefined ? Math.round(e.batterie) + ' % batterie' : ''].filter(Boolean).join(' · ');
}

function Vignette({ n, projet, etat, hauteurVue }: {
  n: NoeudActeur; projet: Projet; etat: EtatActeur | undefined; hauteurVue: number;
}) {
  const a = n.acteur;
  // la vue attendue ne dépend que du moment et de l'étape en cours (et du parcours, lu à cet instant) : jamais du temps
  const moment = useMagasin(s => s.lecture?.moment ?? null);
  const etape = useMagasin(s => s.lecture?.etape ?? null);
  const attendue = useMemo(() => {
    const lecture = useMagasin.getState().lecture;
    return lecture ? vueActeur(projet, lecture, a.id) : null;
  }, [projet, moment, etape, a.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  // le battement dit l'écran AFFICHÉ, pas ses réglages : ceux de la vue attendue s'il s'agit du même écran
  const vu = etat?.ecran ? { ecran: etat.ecran.ecran, params: attendue && attendue.ecran === etat.ecran.ecran ? attendue.params : {} } : null;
  const montre = vu ?? (attendue ? { ecran: attendue.ecran, params: attendue.params } : null);
  return (
    <div className="acp-vignette" style={{ left: n.x + n.l + 10, top: Math.max(8, Math.min(n.y, hauteurVue - 260)) }} aria-hidden="true">
      <span className="acp-vignette-tete"><Glyphe type={a.type} /> {(a.nom || a.id).toUpperCase()}</span>
      <span className="planche-micro">{vu ? 'VU · ' + resumeEnvoi(vu) : attendue ? 'ATTENDU · ' + resumeEnvoi(attendue) : 'RIEN ENCORE'}</span>
      <ApercuActeur acteur={a} vue={montre} titreProjet={projet.titre} petit />
      {detailBattement(etat) && <span className="planche-micro">{detailBattement(etat)}</span>}
    </div>
  );
}
