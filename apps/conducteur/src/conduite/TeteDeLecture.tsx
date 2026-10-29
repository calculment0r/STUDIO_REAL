// La tête de lecture (commun/tete.css + tete.js : trait orange 2 px, onglet 11 px, déplacée par transform sur son calque).
// ISOLÉE : elle s'abonne à l'horloge de la lecture (etat/horloge.ts) hors de React et pose elle-même, à chaque image, sa
// position et celle du repère de la barre de zoom ; l'avancement des moments (variable --avance, attribut data-vif) et
// l'attente du top en cours (hachures) sont mis à jour à 10 Hz. Aucun composant de la conduite n'est re-rendu par la lecture.
//
// ZÉRO MISE EN PAGE PAR IMAGE (audit de fluidité 07, constat C9 : 60 mises en page par seconde, « l'assemblage des calques »
// à 194 ms/s) : rien de ce qui s'écrit ici ne change la géométrie d'un élément.
//   - la tête et le repère de zoom : `transform: translateX` (calque propre, will-change dans conduite.css) ;
//   - l'avancement d'un moment : `--avance` est lu par un `transform: scaleX(var(--avance))` du fond (conduite.css) ;
//   - les hachures de l'attente : l'élément garde une largeur fixe (posée au début de l'attente) et seul son `clip-path`
//     change (repeinture de 10 px de haut, pas de mise en page) ;
//   - la largeur de la barre de zoom est mesurée une fois (et à chaque redimensionnement), jamais par image.
import { useEffect, useRef, type RefObject } from 'react';
import { etatVif, useMagasin, type Magasin } from '../etat/magasin';
import { useHorloge } from '../etat/horloge';
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

/** Pas des mises à jour qui ne sont pas des déplacements (avancement des moments, hachures) : 10 par seconde. */
const PAS_LENT = 0.1;
/** Marge ajoutée à la largeur des hachures quand l'attente dépasse la largeur posée (secondes de conduite). */
const MARGE_HACHURES_S = 300;

export function TeteDeLecture({ plan, pps, temps, largeurVue, defilement, registre, repereZoom, onSuivre }: Props) {
  const tete = useRef<HTMLDivElement>(null);
  const attente = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const vus = new Map<string, string>();
    let dernier = '';
    let dernierLent = '';
    // hachures : moment dont l'attente est dessinée et largeur posée (px) ; la repeinture ne change que le clip-path
    let momentHachure: string | null = null;
    let largeurHachures = 0;
    // largeur de la barre de zoom : mesurée ici, à l'installation et au redimensionnement, jamais à l'image
    const barre = repereZoom.current?.parentElement ?? null;
    let largeurBarre = barre?.clientWidth ?? 0;
    let observateur: ResizeObserver | null = null;

    function poser() {
      // la lecture « à l'heure » : `lecture` n'est rafraîchie qu'au changement de structure et au battement lent
      const s = etatVif(useMagasin.getState());
      const t = temps(s);
      const enAttente = s.lecture?.attenteGo ? s.lecture.moment : null;
      const cle = t + '|' + enAttente;
      if (cle === dernier) return;
      dernier = cle;
      const x = t * pps;
      // à chaque image : deux transform, aucune mise en page
      if (tete.current) tete.current.style.transform = `translateX(${x}px)`;
      if (repereZoom.current) {
        repereZoom.current.style.transform = `translateX(${Math.min(1, Math.max(0, t / Math.max(1, plan.total))) * largeurBarre}px)`;
      }
      // pendant la lecture, la vue suit la tête
      if (s.enLecture) {
        const n = suivre(defilement.current ?? 0, x, largeurVue);
        if (n !== null) onSuivre(n);
      }
      // 10 fois par seconde (ou tout de suite si l'attente du top commence ou finit) : avancement des moments et hachures
      const cleLente = Math.floor(t / PAS_LENT) + '|' + enAttente;
      if (cleLente === dernierLent) return;
      dernierLent = cleLente;
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
        const g = enAttente ? plan.gates.find((p) => p.ev.id === enAttente) : undefined;
        if (g && t > g.pass) {
          const w = (t - g.pass) * pps;
          // (re)pose la géométrie seulement quand l'attente commence ou dépasse la largeur posée : une mise en page, rare
          if (momentHachure !== g.ev.id || w > largeurHachures) {
            momentHachure = g.ev.id;
            largeurHachures = Math.max(w, (plan.total - g.pass) * pps) + MARGE_HACHURES_S * pps;
            at.style.display = 'block';
            at.style.left = g.pass * pps + 'px';
            at.style.width = largeurHachures + 'px';
          }
          at.style.clipPath = `inset(0 ${(largeurHachures - w).toFixed(1)}px 0 0)`;
        } else if (momentHachure !== null) {
          momentHachure = null;
          largeurHachures = 0;
          at.style.display = 'none';
        }
      }
    }

    if (barre && typeof ResizeObserver !== 'undefined') {
      observateur = new ResizeObserver(() => { largeurBarre = barre.clientWidth; dernier = ''; poser(); });
      observateur.observe(barre);
    }
    // à chaque (ré)installation (zoom, plan modifié) les hachures repartent de zéro : poser() les redessine si une attente dure
    if (attente.current) attente.current.style.display = 'none';
    poser();
    const retirerMagasin = useMagasin.subscribe(poser);
    const retirerHorloge = useHorloge.subscribe(poser);
    return () => { retirerMagasin(); retirerHorloge(); observateur?.disconnect(); };
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
