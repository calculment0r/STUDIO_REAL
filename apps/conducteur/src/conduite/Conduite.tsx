// LA CONDUITE (bas de l'écran, pleine largeur) : actes → moments → passages, puis les pistes.
// Zoom et défilement façon Premiere : molette = défilement horizontal, Alt (ou Ctrl) + molette = zoom centré sur la souris,
// barre de zoom à poignées en bas, touches + / − (zoom centré sur la tête), bouton TOUT.
// Clic (ou glisser) sur la règle ou dans le vide = aller à ce temps ; clic sur un moment = le choisir ; double-clic = l'ouvrir
// dans la planche ; clic droit = nouveau moment ici, couper ici, nouvel acte à partir d'ici.
//
// Performance : la lecture ne re-rend rien ici (voir TeteDeLecture) ; le défilement ne change qu'une variable CSS (--cd-x)
// sur le corps, les rangées et les pistes (memo) ne se redessinent qu'au changement du projet ou du zoom.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as EvPointeur } from 'react';
import type { Projet } from '@studio-real/modele';
import { useMagasin, type Magasin } from '../etat/magasin';
import { limiteProche, momentEtapeA, planifier } from './planning';
import {
  LARGEUR_ENTETES, PAS_ZOOM, borner, bornerDefilement, bornerZoom, fm, zoomCentre, zoomMolette, zoomPourTout,
} from './temps';
import {
  ajouterActeFin, ajouterMomentFin, ajouterPiste, ajouterRepere, basculerPiste, couperIci, deplacerElement, dureeClip,
  insererMoment, modePassage, nouveauMomentIci, nouvelActeIci, preavisRepere, redimensionnerMoment, reglerPoint, renommerActe,
} from './edition';
import { Regle, RangeeActes, RangeeMoments, RangeePassages } from './Rangees';
import { Pistes, type ActionsPistes } from './Pistes';
import { ORDRE_TYPES, TYPES_PISTE, couleurPiste } from './types-pistes';
import { TeteDeLecture } from './TeteDeLecture';
import { BarreZoom } from './BarreZoom';
import { CartePassage } from './CartePassage';
import { glisser } from './glisser';
import './conduite.css';

const LBL = LARGEUR_ENTETES;

function Retard({ attenteMesuree }: { attenteMesuree: number }) {
  // Ne se re-rend que lorsque la seconde du retard change.
  const r = useMagasin((s) => (s.lecture ? Math.floor(s.lecture.retard) : null));
  const v = r ?? attenteMesuree;
  return (
    <span className="cd-retard" title="Cumul des attentes du top aux passages « go »">
      RETARD <span data-fort={v > 30 ? '' : undefined}>+{fm(v)}</span>
    </span>
  );
}

export function Conduite() {
  const projet = useMagasin((s) => s.projet);
  const selMoment = useMagasin((s) => s.selection.moment);
  const pps = useMagasin((s) => s.zoomConduite);
  const modifierProjet = useMagasin((s) => s.modifierProjet);
  const selectionner = useMagasin((s) => s.selectionner);
  const allerA = useMagasin((s) => s.allerA);
  const zoomerConduite = useMagasin((s) => s.zoomerConduite);

  const plan = useMemo(() => planifier(projet), [projet]);

  const racine = useRef<HTMLElement>(null);
  const corps = useRef<HTMLDivElement>(null);
  const pistes = useRef<HTMLDivElement>(null);
  const repereZoom = useRef<HTMLSpanElement>(null);
  const registre = useRef(new Map<string, HTMLDivElement>()).current;
  const survol = useRef(false);

  const [largeur, setLargeur] = useState(0);
  const largeurVue = Math.max(100, largeur - LBL - 14);
  const [defilement, setDefilementBrut] = useState(0);
  const defRef = useRef(0);
  const [tLocal, setTLocal] = useState(0);
  const [message, setMessage] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; t: number } | null>(null);
  const [menuPiste, setMenuPiste] = useState(false);
  const [passage, setPassage] = useState<string | null>(null);

  // ── vue : défilement et zoom ──────────────────────────────
  const vue = useRef({ total: plan.total, pps, largeurVue });
  vue.current = { total: plan.total, pps, largeurVue };

  const defiler = useCallback((x: number) => {
    const v = vue.current;
    const d = bornerDefilement(x, v.total, v.pps, v.largeurVue);
    defRef.current = d;
    setDefilementBrut(d);
  }, []);

  const appliquerVue = useCallback((ppsN: number, x: number) => {
    const p = bornerZoom(ppsN);
    const v = vue.current;
    vue.current = { ...v, pps: p };
    zoomerConduite(p);
    const d = bornerDefilement(x, v.total, p, v.largeurVue);
    defRef.current = d;
    setDefilementBrut(d);
  }, [zoomerConduite]);

  /** Zoom centré : le temps sous `ancre` (px depuis le bord gauche des pistes) y reste. */
  const zoomer = useCallback((ppsN: number, ancre: number) => {
    const p0 = vue.current.pps, p = bornerZoom(ppsN);
    appliquerVue(p, zoomCentre(defRef.current, p0, p, ancre));
  }, [appliquerVue]);

  // Le temps montré par la tête : celui de la lecture ; mais juste après un clic sur la règle, `allerA` place la lecture
  // au début de l'étape visée : on garde alors le temps cliqué tant que la lecture n'a pas bougé depuis.
  const lectureAller = useRef<unknown>(null);
  const temps = useCallback((s: Magasin) => (s.lecture && s.lecture !== lectureAller.current ? s.lecture.t : tLocal), [tLocal]);
  const tTete = useCallback(() => temps(useMagasin.getState()), [temps]);

  /** Touches et boutons : centré sur la tête si elle est visible, sinon sur le milieu de la vue. */
  const zoomerPas = useCallback((k: number) => {
    const v = vue.current, x = tTete() * v.pps - defRef.current;
    zoomer(v.pps * k, x >= 0 && x <= v.largeurVue ? x : v.largeurVue / 2);
  }, [zoomer, tTete]);

  const toutVoir = useCallback(() => { const v = vue.current; appliquerVue(zoomPourTout(v.total, v.largeurVue), 0); }, [appliquerVue]);

  // la taille du corps
  useEffect(() => {
    const el = corps.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLargeur(el.clientWidth));
    ro.observe(el);
    setLargeur(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // au premier affichage : toute la conduite (comme le design)
  const cadre = useRef(false);
  useEffect(() => {
    if (cadre.current || largeur <= 0) return;
    cadre.current = true;
    toutVoir();
  }, [largeur, toutVoir]);

  // la durée, le zoom ou la largeur changent : le défilement reste dans ses bornes
  useEffect(() => { defiler(defRef.current); }, [plan.total, pps, largeurVue, defiler]);

  // un moment choisi ailleurs (la planche) et hors de vue : la conduite y va
  useEffect(() => {
    const e = plan.evs.find((x) => x.ev.id === selMoment);
    if (!e) return;
    const v = vue.current, x0 = e.S * v.pps, x1 = e.E * v.pps;
    if (x1 < defRef.current || x0 > defRef.current + v.largeurVue) defiler(x0 - 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selMoment]);

  // molette (non passive pour pouvoir empêcher le défilement de la page)
  useEffect(() => {
    const el = corps.current;
    if (!el) return;
    const roue = (e: WheelEvent) => {
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dx = e.deltaX * k, dy = e.deltaY * k;
      const mod = e.altKey || e.ctrlKey || e.metaKey;
      if (mod) {
        e.preventDefault();
        const r = el.getBoundingClientRect();
        zoomer(zoomMolette(vue.current.pps, dy || dx), Math.max(0, e.clientX - r.left - LBL));
        return;
      }
      const sc = pistes.current;
      if (e.shiftKey && sc && sc.contains(e.target as Node)) {
        // Maj + molette dans les pistes : défilement vertical des pistes
        e.preventDefault();
        sc.scrollTop += dy || dx;
        return;
      }
      e.preventDefault();
      defiler(defRef.current + (Math.abs(dx) > Math.abs(dy) ? dx : dy));
    };
    el.addEventListener('wheel', roue, { passive: false });
    return () => el.removeEventListener('wheel', roue);
  }, [zoomer, defiler]);

  // touches + / − (quand la souris est sur la conduite ou qu'elle a le focus)
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!survol.current && !racine.current?.contains(document.activeElement)) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomerPas(PAS_ZOOM); }
      else if (e.key === '-' || e.key === '−' || e.key === '_') { e.preventDefault(); zoomerPas(1 / PAS_ZOOM); }
      else if (e.key === 'Escape') { setMenu(null); setPassage(null); setMenuPiste(false); }
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [zoomerPas]);

  // le menu du clic droit se ferme au premier clic ailleurs
  useEffect(() => {
    if (!menu) return;
    const fermer = (e: PointerEvent) => { if (e.button !== 2) setMenu(null); };
    window.addEventListener('pointerdown', fermer);
    return () => window.removeEventListener('pointerdown', fermer);
  }, [menu]);

  // ── messages ─────────────────────────────────────────────
  const minuterie = useRef<number | undefined>(undefined);
  const dire = useCallback((m: string) => {
    setMessage(m);
    window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(() => setMessage(''), 2800);
  }, []);
  useEffect(() => () => window.clearTimeout(minuterie.current), []);

  // ── aller à un temps (règle, vide de la conduite) ───────────
  const dernierAller = useRef('');
  const aller = useCallback((t: number) => {
    const tt = borner(t, 0, plan.total);
    setTLocal(tt);
    const me = momentEtapeA(plan, tt);
    if (!me) return;
    const cle = me.moment + '/' + (me.etape ?? '');
    if (cle === dernierAller.current) return;
    dernierAller.current = cle;
    allerA(me.moment, me.etape);
    lectureAller.current = useMagasin.getState().lecture;
  }, [plan, allerA]);

  const tempsA = useCallback((clientX: number) => {
    const r = corps.current!.getBoundingClientRect();
    return (clientX - r.left - LBL + defRef.current) / vue.current.pps;
  }, []);

  const appuiCorps = (e: EvPointeur<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const r = corps.current!.getBoundingClientRect();
    if (e.clientX - r.left < LBL) return;
    const sc = pistes.current;
    if (sc && e.target === sc && e.clientX > sc.getBoundingClientRect().right - 12) return; // la barre de défilement
    setPassage(null);
    setMenuPiste(false);
    dernierAller.current = '';
    aller(tempsA(e.clientX));
    glisser(e, (m) => aller(tempsA(m.clientX)));
  };

  // ── modifications du projet ──────────────────────────────
  /** Modifie le projet (une copie, via le magasin) ; rend ce que rend fn, ou undefined si le magasin a refusé (verrou). */
  const modifier = useCallback(<T,>(fn: (p: Projet) => T, etiquette?: string): T | undefined => {
    let r: T | undefined;
    modifierProjet((p) => { r = fn(p); }, etiquette);
    return r;
  }, [modifierProjet]);

  const actionsPistes = useMemo<ActionsPistes>(() => ({
    basculer: (id) => { modifier((p) => basculerPiste(p, id), 'piste'); },
    deplacer: (tk, id, abs) => { modifier((p) => deplacerElement(p, tk, id, abs), 'déplacement'); },
    duree: (tk, id, d) => { modifier((p) => dureeClip(p, tk, id, d), 'durée de clip'); },
    preavis: (tk, id, l) => { modifier((p) => preavisRepere(p, tk, id, l), 'préavis'); },
    point: (tk, ev, v) => { modifier((p) => reglerPoint(p, tk, ev, v), 'courbe'); },
    repere: (tk, abs) => {
      const id = modifier((p) => ajouterRepere(p, tk, abs), 'note');
      if (id) selectionner({ piste: tk, note: id });
    },
    ajouter: (ty) => {
      const id = modifier((p) => ajouterPiste(p, ty), 'nouvelle piste');
      if (id) selectionner({ piste: id });
    },
    choisir: (sel) => { setPassage(null); selectionner(sel); },
  }), [modifier, selectionner]);

  const choisirMoment = useCallback((id: string) => { setPassage(null); selectionner({ moment: id }); }, [selectionner]);
  const ouvrirMoment = useCallback((id: string) => {
    const ev = useMagasin.getState().projet.ev.find((x) => x.id === id);
    const entree = ev ? (typeof ev.entry === 'string' ? ev.entry : Object.values(ev.entry)[0]) : undefined;
    selectionner({ moment: id, etape: entree });
  }, [selectionner]);
  const redimensionner = useCallback((id: string, ratio: number) => { modifier((p) => redimensionnerMoment(p, id, ratio), 'durée du moment'); }, [modifier]);
  const momentFin = useCallback(() => {
    const id = modifier(ajouterMomentFin, 'nouveau moment');
    if (id) { selectionner({ moment: id }); dire('Nouveau moment en fin de conduite.'); }
  }, [modifier, selectionner, dire]);
  const acteFin = useCallback(() => {
    const id = modifier(ajouterActeFin, 'nouvel acte');
    if (id) { selectionner({ moment: id }); dire('Nouvel acte créé. Double-clic sur son nom pour le renommer.'); }
  }, [modifier, selectionner, dire]);
  const renommer = useCallback((a: number, n: string) => { modifier((p) => renommerActe(p, a, n), 'acte'); }, [modifier]);
  const choisirActe = useCallback((a: number) => { setPassage(null); selectionner({ acte: a }); }, [selectionner]);
  const ouvrirPassage = useCallback((id: string) => {
    setPassage((g) => (g === id ? null : id));
    selectionner({ moment: id, passage: true });
  }, [selectionner]);

  const nouveauMoment = () => {
    const i = selMoment ? projet.ev.findIndex((x) => x.id === selMoment) : -1;
    const k = i >= 0 ? i + 1 : limiteProche(plan, tTete());
    const id = modifier((p) => insererMoment(p, k), 'nouveau moment');
    if (!id) return;
    selectionner({ moment: id });
    dire(i >= 0 ? 'Nouveau moment après le moment choisi.' : 'Nouveau moment à la tête de lecture.');
  };
  const nouvelleNote = () => {
    const t = tTete();
    const ok = modifier((p) => {
      let tk = p.tracks.find((x) => x.type === 'notes');
      if (!tk) { const id = ajouterPiste(p, 'notes'); tk = p.tracks.find((x) => x.id === id)!; }
      tk.open = true;
      return ajouterRepere(p, tk.id, t);
    }, 'note');
    if (ok) dire('Note posée à ' + fm(t) + '.');
  };

  const commandesMenu = menu ? [
    { n: 'Nouveau moment ici', d: 'à la limite la plus proche', go: () => { const id = modifier((p) => nouveauMomentIci(p, menu.t), 'nouveau moment'); if (id) { selectionner({ moment: id }); dire('Nouveau moment à ' + fm(menu.t) + '.'); } } },
    { n: 'Couper ici', d: 'à la limite d’étape la plus proche', go: () => { const r = modifier((p) => couperIci(p, menu.t), 'coupe'); if (!r) return; dire(r.message); if (r.ok && r.id) selectionner({ moment: r.id }); } },
    { n: 'Nouvel acte à partir d’ici', d: 'le moment qui suit ouvre l’acte', go: () => { const r = modifier((p) => nouvelActeIci(p, menu.t), 'nouvel acte'); if (r) dire(r.message); } },
    { n: 'Aller ici', d: fm(menu.t), go: () => { dernierAller.current = ''; aller(menu.t); } },
  ] : [];

  const gate = passage ? plan.gates.find((g) => g.ev.id === passage) : undefined;
  const attenteMesuree = Math.round(Object.values(projet.hold).reduce((a, b) => a + (b || 0), 0));
  const surTout = zoomPourTout(plan.total, largeurVue);

  return (
    <section ref={racine} className="cd" tabIndex={0} aria-label="Conduite"
      onPointerEnter={() => { survol.current = true; }} onPointerLeave={() => { survol.current = false; }}>
      <header className="cd-barre">
        <span className="cd-titre">CONDUITE</span>
        <button className="cd-bt" title="Ajouter un moment après le moment choisi" onClick={nouveauMoment}><b>+</b>MOMENT</button>
        <button className="cd-bt" title="Poser une note de régie à la tête de lecture" onClick={nouvelleNote}><b>+</b>NOTE</button>
        <span style={{ position: 'relative', display: 'flex' }}>
          <button className="cd-bt" title="Ajouter une piste" onClick={() => setMenuPiste((m) => !m)}><b>+</b>PISTE</button>
          {menuPiste && (
            <div className="cd-menu" style={{ left: 0, top: 32 }}>
              <span className="cd-menu-tete">+ PISTE</span>
              {ORDRE_TYPES.map((ty) => (
                <button key={ty} className="cd-menu-item" onClick={() => { actionsPistes.ajouter(ty); setMenuPiste(false); }}>
                  <span className="pastille" style={{ background: couleurPiste({ type: ty }) }} />
                  <span className="col"><span className="n">{TYPES_PISTE[ty].nom}</span><span className="d">{TYPES_PISTE[ty].description}</span></span>
                </button>
              ))}
            </div>
          )}
        </span>
        <span className="cd-message" role="status">{message}</span>
        <span className="cd-espace" />
        <span className="cd-zoom">
          <button title="Dézoomer la conduite · touche −" onClick={() => zoomerPas(1 / PAS_ZOOM)}>−</button>
          <span className="cd-zoom-val" title="Alt + molette sur la conduite pour zoomer">×{(pps / surTout).toFixed(1)}</span>
          <button title="Zoomer la conduite · touche +" onClick={() => zoomerPas(PAS_ZOOM)}>+</button>
          <button className="cd-tout" title="Voir toute la conduite" onClick={toutVoir}>TOUT</button>
        </span>
        <Retard attenteMesuree={attenteMesuree} />
      </header>

      <div ref={corps} className="cd-corps" style={{ ['--cd-x' as string]: -defilement + 'px' } as CSSProperties}
        onPointerDown={appuiCorps}
        onContextMenu={(e) => {
          e.preventDefault();
          const r = corps.current!.getBoundingClientRect();
          if (e.clientX - r.left < LBL) return;
          setMenu({ x: e.clientX, y: e.clientY, t: Math.max(0, Math.round(tempsA(e.clientX))) });
        }}>
        <div className="cd-etiquettes">
          <span style={{ top: 6 }}>TEMPS</span>
          <span style={{ top: 39 }}>ACTES</span>
          <span style={{ top: 78 }}>MOMENTS</span>
          <span style={{ top: 111 }}>PASSAGES</span>
        </div>
        <div className="cd-voie">
          <div className="cd-defile">
            <Regle pps={pps} total={plan.total} largeurVue={largeurVue} />
            <RangeeActes plan={plan} acts={projet.acts} pps={pps} onRenommer={renommer} onChoisir={choisirActe} onAjouter={acteFin} />
            <RangeeMoments plan={plan} pps={pps} selMoment={selMoment} registre={registre}
              onChoisir={choisirMoment} onOuvrir={ouvrirMoment} onRedimensionner={redimensionner} onAjouter={momentFin} />
            <RangeePassages plan={plan} pps={pps} ouvert={passage} temps={temps} onOuvrir={ouvrirPassage} />
          </div>
        </div>
        <div ref={pistes} className="cd-pistes">
          <Pistes projet={projet} plan={plan} pps={pps} actions={actionsPistes} />
        </div>
        <TeteDeLecture plan={plan} pps={pps} temps={temps} largeurVue={largeurVue} defilement={defRef}
          registre={registre} repereZoom={repereZoom} onSuivre={defiler} />
        <BarreZoom total={plan.total} pps={pps} defilement={defilement} largeurVue={largeurVue} repere={repereZoom} onVue={appliquerVue} />
        {gate && (
          <CartePassage g={gate} suivant={plan.evs[gate.i + 1]?.ev.name}
            gauche={Math.max(LBL, Math.min(largeur - 310, LBL + gate.S * pps - defilement - 40))}
            onMode={(m) => { modifier((p) => modePassage(p, gate.ev.id, m), 'passage'); }} onFermer={() => setPassage(null)} />
        )}
      </div>

      {menu && (
        <div className="cd-menu fixe" style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 200) }}
          onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
          <span className="cd-menu-tete">À {fm(menu.t)}</span>
          {commandesMenu.map((c) => (
            <button key={c.n} className="cd-menu-item" onClick={() => { setMenu(null); c.go(); }}>
              <span className="col"><span className="n">{c.n}</span><span className="d">{c.d}</span></span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default Conduite;
