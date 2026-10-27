// La tête de lecture (commun/tete.css + tete.js : trait orange 2 px, onglet 11 px, déplacée par transform sur son calque).
// ISOLÉE : elle s'abonne au magasin hors de React et pose elle-même, à chaque image de la lecture, sa position,
// l'avancement des moments (variable --avance, attribut data-vif), l'attente du top en cours (hachures) et le repère
// de la barre de zoom. Aucun composant de la conduite n'est re-rendu par la lecture.
import { useEffect, useRef, type RefObject } from 'react';
import { useMagasin, type Magasin } from '../etat/magasin';
import type { Plan } from './planning';
import { suivre } from './temps';

interface Props {
  plan: Plan; pps: number; largeurVue: number;
  /** le temps à montrer : la lecture, ou le temps cliqué sur la règle tant que la lecture n'a pas bougé depuis */
  temps: (s: Magasin) => number;
  defilement: RefObject<number>;
  registre: Map<string, HTMLDivElement>;
  repereZoom: RefObject<HTMLSpanElement | null>;
  onSuivre: (x: number) => void;
}

export function TeteDeLecture({ plan, pps, temps, largeurVue, defilement, registre, repereZoom, onSuivre }: Props) {
  const tete = useRef<HTMLDivElement>(null);
  const attente = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const vus = new Map<string, string>();
    let dernier = '';
    const poser = (s: Magasin) => {
      const t = temps(s);
      const enAttente = s.lecture?.attenteGo ? s.lecture.moment : null;
      const cle = t + '|' + enAttente;
      if (cle === dernier) return;
      dernier = cle;
      const x = t * pps;
      if (tete.current) tete.current.style.transform = `translateX(${x}px)`;
      if (repereZoom.current) repereZoom.current.style.left = (Math.min(1, Math.max(0, t / Math.max(1, plan.total))) * 100) + '%';
      // l'avancement de chaque moment : fait (1), en cours (fraction, data-vif), à venir (0)
      for (const e of plan.evs) {
        const el = registre.get(e.ev.id);
        if (!el) continue;
        const vif = t >= e.S && t < e.E;
        const a = t >= e.E ? 1 : t <= e.S ? 0 : (t - e.S) / Math.max(1, e.E - e.S);
        const v = (vif ? 'v' : '') + a.toFixed(3);
        if (vus.get(e.ev.id) === v) continue;
        vus.set(e.ev.id, v);
        el.style.setProperty('--avance', a.toFixed(3));
        if (vif) el.setAttribute('data-vif', ''); else el.removeAttribute('data-vif');
      }
      // l'attente du top en cours : hachurée depuis la fin de l'attente déjà mesurée jusqu'à la tête
      const at = attente.current;
      if (at) {
        const g = enAttente ? plan.gates.find((x) => x.ev.id === enAttente) : undefined;
        if (g && t > g.pass) { at.style.display = 'block'; at.style.left = g.pass * pps + 'px'; at.style.width = (t - g.pass) * pps + 'px'; }
        else at.style.display = 'none';
      }
      // pendant la lecture, la vue suit la tête
      if (s.enLecture) {
        const n = suivre(defilement.current ?? 0, x, largeurVue);
        if (n !== null) onSuivre(n);
      }
    };
    poser(useMagasin.getState());
    return useMagasin.subscribe(poser);
  }, [plan, pps, temps, largeurVue, defilement, registre, repereZoom, onSuivre]);

  return (
    <div className="cd-calque-tete" aria-hidden="true">
      <div className="cd-defile">
        <span ref={attente} className="cd-attente-vive" />
        <div ref={tete} className="sr-ph"><i /></div>
      </div>
    </div>
  );
}
