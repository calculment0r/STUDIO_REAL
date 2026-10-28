// Raccourcis clavier globaux de la coquille.
//   Espace : GO en SPECTACLE (Maj+Espace lecture / pause), lecture / pause en RÉPÉTITION · T (ou G) GO ·
//   M nouveau moment · K note de régie · + / − zoom de la conduite ·
//   Ctrl+Z annuler · Ctrl+Maj+Z (ou Ctrl+Y) rétablir · F plein écran · P pupitre · ? raccourcis · Ctrl+Espace assets ·
//   Échap fermer / désélectionner · S (mode Jouer) reprendre le suivi de la caméra : écouteur posé par la planche
//   (planche/Planche.tsx, elle seule porte l'état de la caméra) ; la coquille n'a rien à faire. F reste le plein écran.
// Convention avec PLANCHE et CONDUITE : une touche qu'ils traitent eux-mêmes est marquée `preventDefault()` (ou
// arrêtée) ; la coquille l'ignore alors (ex. F sur la planche = recadrer, + / − au-dessus de la conduite).
import { useEffect } from 'react';
import { useMagasin } from '../etat/magasin';
import { prevoir } from '../etat/moteur';
import { ajouterMoment, ajouterNote } from '../etat/operations';
import { useInterface } from './interface';
import { actionTouche } from './etat-scene';

export function basculerPleinEcran(): void {
  const d = document;
  if (d.fullscreenElement) { void d.exitFullscreen?.(); return; }
  const p = d.documentElement.requestFullscreen?.();
  p?.catch(() => useMagasin.getState().signaler('Plein écran bloqué ici. Ouvre la page dans son propre onglet.'));
}

export function nouveauMoment(): void {
  const s = useMagasin.getState();
  const apres = s.selection.moment ?? s.lecture?.moment ?? undefined;
  let id = '';
  s.modifierProjet(p => { id = ajouterMoment(p, apres); }, 'nouveau moment');
  if (id && useMagasin.getState().projet.ev.some(m => m.id === id)) {
    s.selectionner({ moment: id });
    s.signaler('Moment ajouté. Double-clic dans son cadre pour ajouter des étapes.');
  }
}

export function nouvelleNote(): void {
  const s = useMagasin.getState();
  const prev = prevoir(s.projet);
  const i = Math.max(0, s.projet.ev.findIndex(m => m.id === (s.lecture?.moment ?? s.selection.moment)));
  const m = s.projet.ev[i];
  if (!m) return;
  const off = Math.max(0, (s.lecture?.t ?? prev.moments[i]?.debut ?? 0) - (prev.moments[i]?.debut ?? 0));
  let ids: [string, string] | null = null;
  s.modifierProjet(p => { ids = ajouterNote(p, m.id, off); }, 'note');
  const r = ids as [string, string] | null;
  if (r) s.selectionner({ piste: r[0], note: r[1] });
}

export function useRaccourcis(): void {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const s = useMagasin.getState(), ui = useInterface.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.code === 'Space') { e.preventDefault(); ui.basculer('tiroir'); return; }
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) {
        if (e.key === 'Escape') tg.blur();
        return;
      }
      const k = e.key;
      if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) s.retablir(); else s.annuler(); return; }
      if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault(); s.retablir(); return; }
      if (ctrl || e.altKey) return;
      const lecture = actionTouche(e, s.mode);
      if (lecture) { e.preventDefault(); if (e.repeat) return; if (lecture === 'go') s.go(); else s.basculerLecture(); }
      else if (k === 'm' || k === 'M') nouveauMoment();
      else if (k === 'k' || k === 'K') nouvelleNote();
      else if (k === '+' || k === '=') { e.preventDefault(); s.zoomerConduite(s.zoomConduite * 1.5); }
      else if (k === '-' || k === '−' || k === '_') { e.preventDefault(); s.zoomerConduite(s.zoomConduite / 1.5); }
      else if (k === 'f' || k === 'F') basculerPleinEcran();
      else if (k === 'p' || k === 'P') ui.basculer('pupitre');
      else if (k === '?') ui.basculer('aide');
      else if (k === 'Escape') {
        if (ui.aide || ui.pupitre || ui.allerA || ui.recherche || ui.projets) ui.poser({ aide: false, pupitre: false, allerA: false, recherche: false, projets: false });
        else if (ui.tiroir) ui.poser({ tiroir: false });
        else s.selectionner({});
      }
    };
    const plein = () => useInterface.getState().poser({ pleinEcran: !!document.fullscreenElement });
    window.addEventListener('keydown', touche);
    document.addEventListener('fullscreenchange', plein);
    return () => { window.removeEventListener('keydown', touche); document.removeEventListener('fullscreenchange', plein); };
  }, []);
}
