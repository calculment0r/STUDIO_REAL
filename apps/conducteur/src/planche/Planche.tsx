// La planche (haut de l'écran) : machine à états de chaque moment — étapes reliées par leurs sorties ordonnées.
// Planche maison (HTML + SVG) : un calque « monde » transformé (translate + scale) porte cadres, blocs, liens et ronds ;
// le panoramique et le zoom ne changent que ce transform (et --z), sans re-rendre les moments.
// Zoom sémantique : < 50 % vue d'ensemble · 50–100 % étapes · > 100 % réglages. En mode Jouer, la caméra suit l'étape en cours.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react';
import type { EtatLecture, Projet } from '@studio-real/modele';
import { useMagasin } from '../etat/magasin';
import {
  ajouterSortie, appliquerProvisoire, bornerZoom, cadreAuPoint, cadrer, cameraProche, cheminLien, creerEtape, deplacerSortie,
  ecranVersMonde, entreesDe, etapeDEntree, etapeDeFin, intersecte, niveauZoom, placerMoments, pointSurLien, rapprocher,
  rondEntree, statutsMoment, supprimerEtape, unionRect, vueMonde, zoomerAutour, LARGEUR_BLOC, Y_ENTREE, ZOOM_NIVEAU,
  type Camera, type DecalageProvisoire, type Niveau, type Point, type Rect,
} from './geometrie';
import { MomentPlanche, type ApiPlanche, type RotatifProvisoire } from './MomentPlanche';
import type { ThemePlanche } from './pont-blocs';
import { teinte } from './styles';
import './planche.css';

const ROMAINS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const romain = (a: number) => ROMAINS[a] ?? String(a + 1);

type Geste =
  | { type: 'pan'; x0: number; y0: number; px0: number; py0: number; bouge: boolean; sx: number; sy: number }
  | { type: 'etape'; moment: string; etape: string; x0: number; y0: number; bouge: boolean; poignee: boolean }
  | { type: 'lien' }
  | { type: 'rotatif'; moment: string; etape: string; i: number; v0: number; y0: number }
  | { type: 'pince'; d0: number; z0: number; m0: Point; cam0: Camera };

interface LienEnCours { moment: string; a: string; sx: number; sy: number; mx: number; my: number }
interface SortieChoisie { moment: string; i: number }

const LIBELLE_NIVEAU: [string, Niveau][] = [['VUE D’ENSEMBLE', 'loin'], ['ÉTAPES', 'moyen'], ['RÉGLAGES', 'pres']];

export function Planche() {
  const projet = useMagasin(s => s.projet);
  const selection = useMagasin(s => s.selection);
  const mode = useMagasin(s => s.mode);
  const lecture = useMagasin(s => s.lecture);
  const themeMagasin = useMagasin(s => (s as { theme?: string }).theme);
  const selectionner = useMagasin(s => s.selectionner);
  const modifierProjet = useMagasin(s => s.modifierProjet);
  const zoomerPlanche = useMagasin(s => s.zoomerPlanche);
  const theme: ThemePlanche = themeMagasin === 'clair' ? 'clair' : 'sombre';
  const editable = mode !== 'jouer';

  const refBoite = useRef<HTMLDivElement>(null);
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const [cam, setCam] = useState<Camera>(() => ({ px: 80, py: 300, z: bornerZoom(useMagasin.getState().zoomPlanche) }));
  const [suivre, setSuivre] = useState(true);
  const [prov, setProv] = useState<DecalageProvisoire | null>(null);
  const [lien, setLien] = useState<LienEnCours | null>(null);
  const [sortieSel, setSortieSel] = useState<SortieChoisie | null>(null);
  const [rotatif, setRotatif] = useState<(RotatifProvisoire & { moment: string }) | null>(null);
  const [pan, setPan] = useState(false);
  const [message, setMessage] = useState('');

  const niveau = niveauZoom(cam.z);
  const cadresBase = useMemo(() => placerMoments(projet.ev), [projet.ev]);
  const cadres = useMemo(() => appliquerProvisoire(cadresBase, prov), [cadresBase, prov]);
  const parId = useMemo(() => new Map(cadres.map(f => [f.moment.id, f])), [cadres]);

  // ── Références vers l'état courant (les écouteurs globaux sont posés une seule fois) ──
  const etat = useRef({ cam, cadres, parId, taille, lien, prov, rotatif, sortieSel, selection, editable, projet, suivre });
  etat.current = { cam, cadres, parId, taille, lien, prov, rotatif, sortieSel, selection, editable, projet, suivre };
  const geste = useRef<Geste | null>(null);
  const pointeurs = useRef(new Map<number, Point>());
  const selectionInterne = useRef(false);
  const dernierZoomPousse = useRef(cam.z);
  const minuterieMessage = useRef<number | undefined>(undefined);

  const dire = useCallback((t: string) => {
    setMessage(t);
    window.clearTimeout(minuterieMessage.current);
    minuterieMessage.current = window.setTimeout(() => setMessage(''), 2600);
  }, []);
  const choisir = useCallback((s: { moment?: string; etape?: string }) => { selectionInterne.current = true; selectionner(s); }, [selectionner]);
  const modifierMoment = useCallback((id: string, fn: (p: Projet, m: Projet['ev'][number]) => void) => {
    modifierProjet(p => { const m = p.ev.find(e => e.id === id); if (m) fn(p, m); });
  }, [modifierProjet]);

  const relatif = useCallback((cx: number, cy: number): Point => {
    const r = refBoite.current?.getBoundingClientRect();
    return { x: cx - (r?.left ?? 0), y: cy - (r?.top ?? 0) };
  }, []);

  // ── Taille de la boîte ──
  useEffect(() => {
    const b = refBoite.current;
    if (!b) return;
    const mesurer = () => setTaille(t => (t.l === b.clientWidth && t.h === b.clientHeight ? t : { l: b.clientWidth, h: b.clientHeight }));
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(b);
    return () => ro.disconnect();
  }, []);

  // ── Zoom partagé avec le magasin (zoomPlanche) ──
  // Nos propres envois sont marqués (l'abonnement zustand est synchrone) : seul un zoom venu d'ailleurs déplace la caméra.
  const enPoussee = useRef(false);
  useEffect(() => {
    if (Math.abs(cam.z - dernierZoomPousse.current) <= 0.004) return;
    dernierZoomPousse.current = cam.z;
    enPoussee.current = true;
    try { zoomerPlanche(cam.z); } finally { enPoussee.current = false; }
  }, [cam.z, zoomerPlanche]);
  useEffect(() => useMagasin.subscribe((s, avant) => {
    if (enPoussee.current || s.zoomPlanche === avant.zoomPlanche) return;
    const z = s.zoomPlanche;
    dernierZoomPousse.current = z;
    const { l, h } = etat.current.taille;
    setCam(c => (Math.abs(c.z - z) < 1e-3 ? c : zoomerAutour(c, z, l / 2, h / 2)));
    setSuivre(false);
  }), []);

  // ── Cadrage : moment sélectionné (ou en cours) ──
  const indexCourant = lecture?.moment ? projet.ev.findIndex(e => e.id === lecture.moment) : -1;
  const rectFocus = useCallback((l: EtatLecture | null): Rect | null => {
    const { cadres: F, parId: P, selection: s } = etat.current;
    if (l?.moment) {
      const f = P.get(l.moment);
      if (f) {
        const suivant = l.attenteGo ? F[f.index + 1] : undefined;
        return suivant ? unionRect(f.r, suivant.r) : f.r;
      }
    }
    const f = (s.moment && P.get(s.moment)) || F[0];
    return f ? f.r : null;
  }, []);

  const premierCadrage = useRef(false);
  useEffect(() => {
    if (premierCadrage.current || taille.l < 50) return;
    premierCadrage.current = true;
    const r = rectFocus(mode === 'jouer' ? lecture : null);
    if (r) setCam(cadrer(r, taille.l, taille.h));
    // cadrage initial seulement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taille.l, taille.h]);

  // Sélection venue d'ailleurs (conduite, panneau) : on cadre le moment, ou on amène l'étape à l'écran.
  useEffect(() => {
    if (selectionInterne.current) { selectionInterne.current = false; return; }
    const { taille: T, parId: P, cam: c } = etat.current;
    if (T.l < 50 || !selection.moment || (mode === 'jouer' && etat.current.suivre)) return;
    const f = P.get(selection.moment);
    if (!f) return;
    const p = selection.etape ? f.P[selection.etape] : undefined;
    if (p) {
      const z = Math.max(0.75, c.z);
      setCam({ z, px: T.l / 2 - (p.x + LARGEUR_BLOC / 2) * z, py: T.h / 2 - (p.y + 100) * z });
    } else setCam(cadrer(f.r, T.l, T.h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.moment, selection.etape]);

  // ── Mode Jouer : la caméra suit l'étape en cours et cadre le moment ──
  useEffect(() => { if (mode === 'jouer') setSuivre(true); }, [mode]);
  const cleSuivi = mode === 'jouer' && suivre && lecture?.moment ? `${lecture.moment}|${lecture.attenteGo ? 1 : 0}|${taille.l}x${taille.h}|${cadresBase.length}` : '';
  useEffect(() => {
    if (!cleSuivi) return;
    const r = rectFocus(useMagasin.getState().lecture);
    if (!r) return;
    const cible = cadrer(r, etat.current.taille.l, etat.current.taille.h);
    let raf = 0, avant = performance.now();
    const pas = (now: number) => {
      const dt = Math.min(0.1, (now - avant) / 1000);
      avant = now;
      if (!geste.current) {
        setCam(c => (cameraProche(c, cible) ? c : rapprocher(c, cible, dt * 3.2)));
      }
      raf = requestAnimationFrame(pas);
    };
    raf = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(raf);
  }, [cleSuivi, rectFocus]);

  // ── Molette : Ctrl / pincement du pavé = zoom ; deux doigts = panoramique ; molette de souris = zoom ──
  useEffect(() => {
    const b = refBoite.current;
    if (!b) return;
    const surMolette = (e: WheelEvent) => {
      const cible = e.target as Element | null;
      if (cible?.closest?.('[data-scroll]') && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = b.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const pince = e.ctrlKey || e.metaKey;
      const ligne = e.deltaMode === 1 ? 33 : 1;
      const pave = !pince && (e.shiftKey || Math.abs(e.deltaX) > 0.5 || (e.deltaMode === 0 && Math.abs(e.deltaY) < 40));
      if (pave) {
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX, dy = e.shiftKey ? 0 : e.deltaY;
        setCam(c => ({ ...c, px: c.px - dx * ligne, py: c.py - dy * ligne }));
      } else {
        setCam(c => zoomerAutour(c, c.z * Math.exp(-e.deltaY * ligne * (pince ? 0.01 : 0.0016)), mx, my));
      }
      setSuivre(false);
    };
    b.addEventListener('wheel', surMolette, { passive: false });
    return () => b.removeEventListener('wheel', surMolette);
  }, []);

  // ── Gestes au pointeur (écouteurs globaux, posés une fois) ──
  useEffect(() => {
    const bouger = (e: PointerEvent) => {
      if (pointeurs.current.has(e.pointerId)) pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = geste.current;
      if (!g) return;
      const { cam: c } = etat.current;
      if (g.type === 'pince') {
        const pts = [...pointeurs.current.values()];
        if (pts.length < 2) return;
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const m = relatif((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
        const z = bornerZoom(g.z0 * d / Math.max(1, g.d0));
        const base = zoomerAutour(g.cam0, z, g.m0.x, g.m0.y);
        setCam({ z: base.z, px: base.px + m.x - g.m0.x, py: base.py + m.y - g.m0.y });
        return;
      }
      if (g.type === 'pan') {
        const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
        if (!g.bouge && Math.abs(dx) + Math.abs(dy) > 3) { g.bouge = true; setPan(true); setSuivre(false); }
        if (g.bouge) setCam({ z: c.z, px: g.px0 + dx, py: g.py0 + dy });
        return;
      }
      if (g.type === 'etape') {
        const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
        if (!g.bouge && Math.abs(dx) + Math.abs(dy) > 3) g.bouge = true;
        if (g.bouge && g.poignee && etat.current.editable) setProv({ moment: g.moment, etape: g.etape, ddx: dx / c.z, ddy: dy / c.z });
        return;
      }
      if (g.type === 'lien') {
        const p = relatif(e.clientX, e.clientY), w = ecranVersMonde(c, p.x, p.y);
        setLien(l => (l ? { ...l, mx: w.x, my: w.y } : l));
        return;
      }
      if (g.type === 'rotatif') {
        const v = Math.max(0, Math.min(100, Math.round(g.v0 + (g.y0 - e.clientY) * 0.6)));
        setRotatif(r => (r && r.v === v ? r : { moment: g.moment, etape: g.etape, i: g.i, v }));
      }
    };

    const lacher = (e: PointerEvent) => {
      pointeurs.current.delete(e.pointerId);
      const g = geste.current;
      if (!g) return;
      if (g.type === 'pince') { if (pointeurs.current.size < 2) geste.current = null; return; }
      geste.current = null;
      const { cam: c, cadres: F, parId: P, lien: lk, prov: pv, rotatif: rt } = etat.current;
      if (g.type === 'pan') {
        setPan(false);
        if (!g.bouge) {
          // clic dans le vide : choisir le moment sous le pointeur, désélectionner l'étape et la sortie
          const w = ecranVersMonde(c, g.sx, g.sy);
          const f = F.find(x => w.x >= x.r.x && w.x <= x.r.x + x.r.w && w.y >= x.r.y && w.y <= x.r.y + x.r.h);
          setSortieSel(null);
          choisir({ moment: f ? f.moment.id : etat.current.selection.moment });
        }
        return;
      }
      if (g.type === 'etape') {
        if (pv && g.bouge) {
          const ddx = Math.round(pv.ddx), ddy = Math.round(pv.ddy);
          if (ddx || ddy) modifierMoment(pv.moment, (_p, m) => { const st = m.st.find(x => x.id === pv.etape); if (st) { st.dx += ddx; st.dy += ddy; } });
        }
        setProv(null);
        return;
      }
      if (g.type === 'rotatif') {
        if (rt) modifierMoment(rt.moment, (_p, m) => { const st = m.st.find(x => x.id === rt.etape); if (st) { while (st.k.length <= rt.i) st.k.push(50); st.k[rt.i] = rt.v; } });
        setRotatif(null);
        return;
      }
      if (g.type === 'lien' && lk) {
        setLien(null);
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const cible = el?.closest?.('[data-etape]') as HTMLElement | null;
        if (cible) {
          const mo = cible.dataset.moment, b = cible.dataset.etape;
          if (!mo || !b || b === lk.a) return;
          if (mo !== lk.moment) { dire('Entre deux moments, on passe par un passage de la conduite.'); return; }
          const m = etat.current.projet.ev.find(x => x.id === mo);
          if (m?.tr.some(s => s.a === lk.a && s.b === b)) { dire('Cette sortie existe déjà.'); return; }
          let index = -1;
          modifierMoment(mo, (_p, mm) => { if (ajouterSortie(mm, lk.a, b)) index = mm.tr.length - 1; });
          if (index >= 0) { setSortieSel({ moment: mo, i: index }); choisir({ moment: mo, etape: lk.a }); dire('Sortie créée. Règle sa condition dans le panneau.'); }
          return;
        }
        // lâché dans le vide : nouvelle étape reliée, posée au point de lâcher
        const p0 = { x: lk.sx * c.z + c.px, y: lk.sy * c.z + c.py }, p1 = relatif(e.clientX, e.clientY);
        if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 24) return;
        const f = P.get(lk.moment);
        if (!f) return;
        let id: string | null = null;
        modifierMoment(lk.moment, (p, m) => {
          id = creerEtape(p, m.id, f.fx, lk.mx, lk.my - Y_ENTREE);
          if (id) ajouterSortie(m, lk.a, id);
        });
        if (id) { choisir({ moment: lk.moment, etape: id }); dire('Étape créée et reliée.'); }
      }
    };
    window.addEventListener('pointermove', bouger);
    window.addEventListener('pointerup', lacher);
    window.addEventListener('pointercancel', lacher);
    return () => {
      window.removeEventListener('pointermove', bouger);
      window.removeEventListener('pointerup', lacher);
      window.removeEventListener('pointercancel', lacher);
    };
  }, [choisir, dire, modifierMoment, relatif]);

  // ── API stable passée aux moments ──
  const api = useMemo<ApiPlanche>(() => ({
    saisirEtape: (e, moment, etape, poignee) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      refBoite.current?.focus({ preventScroll: true });
      setSortieSel(null);
      const s = etat.current.selection;
      if (s.moment !== moment || s.etape !== etape) choisir({ moment, etape });
      geste.current = { type: 'etape', moment, etape, x0: e.clientX, y0: e.clientY, bouge: false, poignee };
    },
    saisirSortie: (e, moment, etape, x, y) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      refBoite.current?.focus({ preventScroll: true });
      if (!etat.current.editable) { dire('Mode Jouer : la planche est en lecture seule.'); return; }
      geste.current = { type: 'lien' };
      setLien({ moment, a: etape, sx: x, sy: y, mx: x, my: y });
    },
    choisirSortie: (e, moment, index) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      refBoite.current?.focus({ preventScroll: true });
      setSortieSel({ moment, i: index });
      const m = etat.current.projet.ev.find(x => x.id === moment);
      const s = m?.tr[index];
      if (s) choisir({ moment, etape: s.a });
    },
    deplacerSortie: (moment, index, sens) => {
      if (!etat.current.editable) return;
      let j = -1;
      modifierMoment(moment, (_p, m) => { j = deplacerSortie(m, index, sens); });
      if (j >= 0) setSortieSel({ moment, i: j });
    },
    saisirRotatif: (e, moment, etape, i, v0) => {
      if (e.button !== 0 || !etat.current.editable) return;
      e.stopPropagation();
      geste.current = { type: 'rotatif', moment, etape, i, v0, y0: e.clientY };
      setRotatif({ moment, etape, i, v: v0 });
    },
  }), [choisir, dire, modifierMoment]);

  // ── Fond de la planche : panoramique, pincement, clic ──
  const surFond = (e: RPointerEvent<HTMLDivElement>) => {
    refBoite.current?.focus({ preventScroll: true });
    pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointeurs.current.size >= 2) {
      const pts = [...pointeurs.current.values()];
      const m0 = relatif((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      geste.current = { type: 'pince', d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), z0: cam.z, m0, cam0: cam };
      setProv(null);
      setSuivre(false);
      return;
    }
    if (e.button !== 0 && e.button !== 1) return;
    if (e.button === 1) e.preventDefault();
    const p = relatif(e.clientX, e.clientY);
    geste.current = { type: 'pan', x0: e.clientX, y0: e.clientY, px0: cam.px, py0: cam.py, bouge: false, sx: p.x, sy: p.y };
  };

  const surDoubleClic = (e: RMouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('[data-ui],[data-etape]')) return;
    if (!editable) { dire('Mode Jouer : la planche est en lecture seule.'); return; }
    const p = relatif(e.clientX, e.clientY), w = ecranVersMonde(cam, p.x, p.y);
    const f = cadreAuPoint(cadres, w.x, w.y);
    if (!f) return;
    let id: string | null = null;
    modifierMoment(f.moment.id, (pp, m) => { id = creerEtape(pp, m.id, f.fx, w.x - LARGEUR_BLOC / 2, w.y - Y_ENTREE); });
    if (id) { choisir({ moment: f.moment.id, etape: id }); dire(`Étape ajoutée dans « ${f.moment.name} ». Relie-la pour qu’elle soit jouée.`); }
  };

  const supprimer = () => {
    if (!editable) return;
    if (sortieSel) {
      modifierMoment(sortieSel.moment, (_p, m) => { m.tr.splice(sortieSel.i, 1); });
      setSortieSel(null);
      dire('Sortie supprimée.');
      return;
    }
    const { moment, etape } = selection;
    if (!moment || !etape) return;
    const m = projet.ev.find(x => x.id === moment);
    if (!m) return;
    if (entreesDe(m).includes(etape)) { dire('La première étape d’un moment ne se supprime pas.'); return; }
    let ok = false;
    modifierMoment(moment, (_p, mm) => { ok = supprimerEtape(mm, etape); });
    if (ok) { choisir({ moment }); dire('Étape supprimée.'); }
  };

  const allerNiveau = (n: Niveau) => {
    const z = ZOOM_NIVEAU[n];
    const f = selection.moment ? parId.get(selection.moment) : cadres[0];
    if (!f) return;
    const p = selection.etape ? f.P[selection.etape] : undefined;
    const fx = p ? p.x + LARGEUR_BLOC / 2 : f.r.x + f.r.w / 2, fy = p ? p.y + 120 : f.r.y + Math.min(f.r.h / 2, 220);
    setCam({ z, px: taille.l / 2 - fx * z, py: taille.h / 2 - fy * z + 20 });
    setSuivre(false);
  };
  const zoomerDe = (k: number) => { setCam(c => zoomerAutour(c, c.z * k, taille.l / 2, taille.h / 2)); setSuivre(false); };
  const recadrer = () => {
    if (mode === 'jouer') { setSuivre(true); return; }
    const r = rectFocus(null);
    if (r) setCam(cadrer(r, taille.l, taille.h));
  };

  const surTouche = (e: RKeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
    let fait = true;
    if (e.key === 'Delete' || e.key === 'Backspace') supprimer();
    else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && sortieSel) api.deplacerSortie(sortieSel.moment, sortieSel.i, e.key === 'ArrowUp' ? -1 : 1);
    else if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) recadrer();
    else if (e.key === 'Escape') { if (lien) { geste.current = null; setLien(null); } else setSortieSel(null); }
    else fait = false;
    if (fait) { e.preventDefault(); e.stopPropagation(); }
  };

  // ── Données de lecture par moment (chaînes stables → pas de re-rendu des moments inchangés) ──
  const parcoursParMoment = useMemo(() => {
    const r = new Map<string, string[]>();
    for (const [mo, et] of lecture?.parcours ?? []) r.set(mo, [...(r.get(mo) ?? []), et]);
    return r;
  }, [lecture?.parcours]);
  const lectureMin = lecture ? { moment: lecture.moment, etape: lecture.etape, parcours: lecture.parcours } : null;

  const vue = taille.l ? vueMonde(cam, taille.l, taille.h, 0.5) : null;
  const vifSuivant = lecture?.attenteGo && indexCourant >= 0 ? projet.ev[indexCourant + 1]?.id : undefined;

  // ── Passages entre moments (pointillés + losange) ──
  const passages = useMemo(() => cadres.slice(0, -1).map((fa, i) => {
    const fb = cadres[i + 1];
    const pa = parcoursParMoment.get(fa.moment.id);
    const a = etapeDeFin(fa.moment, fa, indexCourant > i ? pa : undefined), b = etapeDEntree(fb.moment, lecture?.issue);
    const A = a ? fa.P[a] : undefined, B = b ? fb.P[b] : undefined;
    if (!A || !B) return null;
    const ax = A.x + LARGEUR_BLOC, ay = A.y + Y_ENTREE, e = rondEntree(B);
    const passe = indexCourant > i, ici = indexCourant === i && !!lecture?.attenteGo;
    const go = fa.moment.gate.mode === 'go';
    return { i, d: cheminLien(ax, ay, e.x, e.y), mil: pointSurLien(ax, ay, e.x, e.y, 0.5), passe, ici, go };
  }).filter(x => x !== null), [cadres, parcoursParMoment, lecture?.issue, lecture?.attenteGo, indexCourant]);

  // ── Mini-carte ──
  const mini = useMemo(() => {
    if (!cadres.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of cadres) { x0 = Math.min(x0, f.r.x); y0 = Math.min(y0, f.r.y - 40); x1 = Math.max(x1, f.r.x + f.r.w); y1 = Math.max(y1, f.r.y + f.r.h); }
    const W = 168, H = 84, k = Math.min(W / (x1 - x0), H / (y1 - y0));
    return { k, bx: x0 - (W / k - (x1 - x0)) / 2, by: y0 - (H / k - (y1 - y0)) / 2 };
  }, [cadres]);

  const styleMonde = { transform: `translate(${cam.px}px, ${cam.py}px) scale(${cam.z})` } as CSSProperties;
  const styleBoite = { '--z': String(cam.z) } as CSSProperties;

  return (
    <div ref={refBoite} className={'planche' + (pan ? ' planche--pan' : '')} style={styleBoite} tabIndex={0}
      aria-label="Planche du moment" onPointerDown={surFond} onDoubleClick={surDoubleClic} onKeyDown={surTouche}
      onContextMenu={e => e.preventDefault()}>
      <div className="planche-grille" style={{ backgroundSize: `${24 * cam.z}px ${24 * cam.z}px`, backgroundPosition: `${cam.px}px ${cam.py}px` }} />

      <div className="planche-monde" style={styleMonde}>
        {/* Passages entre moments */}
        <svg className="planche-svg">
          {passages.map(g => (
            <path key={g.i} d={g.d} style={{ stroke: g.ici ? 'var(--ort)' : g.passe ? 'var(--gt)' : 'rgba(var(--lr),.4)', strokeWidth: g.ici ? 2 : 1.3, strokeDasharray: '2 5', strokeLinecap: 'round' }} />
          ))}
        </svg>
        {passages.map(g => (
          <div key={'p' + g.i} className="planche-ecran" style={{ left: g.mil.x, top: g.mil.y, zIndex: 3 }}>
            <div className="planche-passage" data-ui="1" title={g.go ? 'Passage : attend le top régie' : 'Passage : enchaîne automatiquement'}
              onPointerDown={e => { e.stopPropagation(); choisir({ moment: cadres[g.i].moment.id }); }}>
              <span className={'planche-passage__losange' + (g.ici ? ' planche-pulse' : '')}
                style={{ background: g.passe ? (g.go ? 'var(--ort)' : 'var(--gt)') : 'var(--bg)', boxShadow: `inset 0 0 0 1.5px ${g.go ? 'var(--ort)' : 'var(--gt)'}` }} />
              {niveau !== 'loin' && <span className="planche-micro" style={{ color: 'var(--ink2)', whiteSpace: 'nowrap', background: 'var(--bg)', padding: '3px 5px', borderRadius: 4 }}>P{g.i + 1} · {g.go ? 'top régie' : 'auto'}</span>}
            </div>
          </div>
        ))}

        {cadres.map(f => {
          const m = f.moment;
          const sigStatuts = lectureMin ? Object.entries(statutsMoment(m, f.index, indexCourant, lectureMin)).map(([k, v]) => k + '=' + v).join('|') : '';
          const vif = !!lecture?.moment && (lecture.moment === m.id || vifSuivant === m.id);
          const actif = lecture && lecture.moment === m.id && lecture.etape ? { etape: lecture.etape, tEtape: lecture.tEtape, bloque: lecture.bloque } : null;
          return (
            <MomentPlanche key={m.id} cadre={f} niveau={niveau} detail={!vue || intersecte(f.r, vue)} theme={theme}
              statuts={sigStatuts} parcours={(parcoursParMoment.get(m.id) ?? []).join('|')} actif={actif}
              vif={vif} enAttenteTop={!!lecture?.attenteGo && lecture.moment === m.id} terne={mode === 'jouer' && !!lecture?.moment && !vif}
              selMoment={selection.moment === m.id && !selection.etape} selEtape={selection.moment === m.id ? selection.etape ?? null : null}
              selSortie={sortieSel && sortieSel.moment === m.id ? sortieSel.i : -1}
              lienDepuis={lien && lien.moment === m.id ? lien.a : null} editable={editable}
              rotatif={rotatif && rotatif.moment === m.id ? rotatif : null}
              tag={`Moment ${f.index + 1} · acte ${romain(m.act)} · ${m.st.length} étape${m.st.length > 1 ? 's' : ''}`} api={api} />
          );
        })}

        {lien && (
          <svg className="planche-svg">
            <path d={cheminLien(lien.sx, lien.sy, lien.mx, lien.my)} style={{ stroke: 'var(--ort)', strokeWidth: 1.5, strokeDasharray: '5 4' }} />
          </svg>
        )}
      </div>

      {/* Barre d'outils de la planche */}
      <div className="planche-outils" data-ui="1" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
        <div className="planche-groupe">
          {LIBELLE_NIVEAU.map(([t, n]) => (
            <button key={n} type="button" className={'planche-seg' + (niveau === n ? ' planche-seg--on' : '')} onClick={() => allerNiveau(n)}>{t}</button>
          ))}
        </div>
        <div className="planche-groupe" style={{ height: 32 }}>
          <button type="button" className="planche-btn" title="Dézoomer la planche" onClick={() => zoomerDe(1 / 1.2)}>−</button>
          <span className="planche-zoom" title="Molette ou Ctrl + molette pour zoomer, deux doigts pour se déplacer">{Math.round(cam.z * 100)}%</span>
          <button type="button" className="planche-btn" title="Zoomer la planche" onClick={() => zoomerDe(1.2)}>+</button>
        </div>
        <div className="planche-groupe">
          {mode === 'jouer'
            ? <button type="button" className={'planche-seg' + (suivre ? ' planche-seg--on' : '')} title="La caméra suit l’étape en cours · F" onClick={() => setSuivre(true)}>SUIVRE</button>
            : <button type="button" className="planche-seg" title="Cadrer le moment sélectionné · F" onClick={recadrer}>CADRER</button>}
        </div>
      </div>

      {/* Mini-carte */}
      {mini && taille.h >= 300 && niveau !== 'loin' && (
        <div className="planche-mini" data-ui="1" title="Mini-carte · cliquer pour déplacer la vue"
          onPointerDown={e => {
            e.stopPropagation();
            if (e.button !== 0) return;
            const r = e.currentTarget.getBoundingClientRect();
            const wx = mini.bx + (e.clientX - r.left) / mini.k, wy = mini.by + (e.clientY - r.top) / mini.k;
            setCam(c => ({ z: c.z, px: taille.l / 2 - wx * c.z, py: taille.h / 2 - wy * c.z }));
            setSuivre(false);
          }}>
          {cadres.map(f => (
            <span key={f.moment.id} style={{
              left: (f.r.x - mini.bx) * mini.k, top: (f.r.y - mini.by) * mini.k, width: f.r.w * mini.k, height: f.r.h * mini.k,
              background: f.index === indexCourant ? teinte('var(--ort)', 45) : indexCourant > f.index ? teinte('var(--gt)', 35) : selection.moment === f.moment.id ? teinte('var(--cy)', 30) : 'rgba(var(--lr),.14)',
            }} />
          ))}
          <span style={{ left: (-cam.px / cam.z - mini.bx) * mini.k, top: (-cam.py / cam.z - mini.by) * mini.k, width: taille.l / cam.z * mini.k, height: taille.h / cam.z * mini.k, boxShadow: 'inset 0 0 0 1px var(--cy)', pointerEvents: 'none' }} />
        </div>
      )}

      {lecture?.bloque && mode !== 'ecrire' && (
        <div className="planche-bandeau planche-micro" style={{ bottom: message ? 52 : 14, color: 'var(--ort)', boxShadow: `inset 0 0 0 1px ${teinte('var(--ort)', 60)}` }}>
          ÉTAPE BLOQUÉE · AUCUNE SORTIE REMPLIE · TOP RÉGIE POUR FORCER
        </div>
      )}
      {message && <div className="planche-bandeau" style={{ fontSize: 12 }}>{message}</div>}
    </div>
  );
}

export default Planche;

