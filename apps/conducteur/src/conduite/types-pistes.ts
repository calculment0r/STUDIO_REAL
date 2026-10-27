// Types de pistes de la conduite, leurs couleurs et le dessin de leurs clips et courbes
// (port de TT, wf, CLIPD de conception/conducteur/source/studio-real/conducteur-core.js).
// Couleur d'une piste : celle de ses données (`piste.col`) ou celle de son type, rendue par le jeton --piste-<type>
// du thème (qui porte aussi la variante claire, la table LIGHT du design).
import type { Piste, Projet, TypePiste } from '@studio-real/modele';
import { signal, type Plan } from './planning';

export interface TypePisteInfo { nom: string; description: string }

export const TYPES_PISTE: Record<TypePiste, TypePisteInfo> = {
  son: { nom: 'Son', description: 'Pistes son posées sur le temps' },
  lx: { nom: 'Lumière · cues', description: 'Mémoires de la console lumière' },
  video: { nom: 'Écran de scène', description: 'Vidéos et images projetées' },
  tel: { nom: 'Téléphones', description: 'Écrans poussés au public' },
  txt: { nom: 'Textes', description: 'Consignes, surtitres, messages' },
  notes: { nom: 'Notes de régie', description: 'Repères écrits pour l’équipe' },
  curve: { nom: 'Courbe libre', description: 'Une intensité dessinée à la main' },
  secu: { nom: 'Sécurité', description: 'Alertes avant strobe, fumée, entrées de public' },
};

/** Ordre du menu « Ajouter une piste ». */
export const ORDRE_TYPES: TypePiste[] = ['son', 'lx', 'video', 'tel', 'txt', 'notes', 'secu', 'curve'];

/** Teintes de la palette des pistes du design (valeurs que portent les données) → leur jeton. */
const JETON_DE_TEINTE: Record<string, string> = {
  '#e59578': '--piste-son', '#f0b49b': '--piste-lx', '#b9cfd8': '--piste-video', '#78b08f': '--piste-tel',
  '#d9a486': '--piste-txt', '#a3aea8': '--piste-notes', '#8fa5ad': '--piste-curve', '#c8311f': '--piste-secu',
};

/** La couleur CSS d'une piste : un jeton du thème si sa teinte en est un, sinon la teinte de ses données telle quelle. */
export function couleurPiste(tk: Pick<Piste, 'col' | 'type'>): string {
  if (!tk.col) return `var(--piste-${TYPES_PISTE[tk.type] ? tk.type : 'curve'})`;
  const j = JETON_DE_TEINTE[tk.col.toLowerCase()];
  return j ? `var(${j})` : tk.col;
}

/** Hauteur d'une piste (le design : repliée 24, courbe 76, repères 36, clips 46). */
export function hauteurPiste(tk: Piste): number {
  if (!tk.open) return 24;
  if (tk.type === 'curve') return 76;
  if (tk.marks) return 36;
  return 46;
}

/** Forme d'onde d'un clip son, stable pour un id (repère 100 × 20). */
const FORMES: Record<string, string> = {};
export function formeOnde(id: string): string {
  if (FORMES[id]) return FORMES[id];
  let sd = 0;
  for (const ch of id) sd = (sd * 31 + ch.charCodeAt(0)) % 9973;
  const n = 60, pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push((0.25 + 0.75 * Math.abs(Math.sin(u * 13 + sd) * Math.sin(u * 3.7 + sd * 0.3))) * (0.55 + 0.45 * Math.abs(Math.sin(u * 41 + sd * 1.7))));
  }
  let d = 'M0 10';
  pts.forEach((a, i) => { d += ' L' + (i / n * 100).toFixed(1) + ' ' + (10 - a * 9).toFixed(2); });
  for (let i = n; i >= 0; i--) d += ' L' + (i / n * 100).toFixed(1) + ' ' + (10 + pts[i] * 9).toFixed(2);
  return (FORMES[id] = d + ' Z');
}

const DESSINS: Partial<Record<TypePiste, string>> = {
  lx: 'M0 20 L12 3 L100 3 L100 20 Z',
  video: Array.from({ length: 10 }, (_, i) => 'M' + (i * 10 + 1) + ' 3h8v14h-8z').join(''),
  tel: Array.from({ length: 20 }, (_, i) => 'M' + (i * 5 + 1) + ' 8h2v4h-2z').join(''),
  txt: 'M2 5h60v2h-60zM2 10h80v2h-80zM2 15h45v2h-45z',
};
export function dessinClip(type: TypePiste, id: string): string {
  return type === 'son' ? formeOnde(id) : (DESSINS[type] ?? DESSINS.txt!);
}

export interface PointCourbe { id: string; x: number; y: number; v: number }

/**
 * Le tracé d'une courbe (x en px du contenu, y en px dans la piste). `hauteurUtile` et `haut` : la bande où 0 → 100 se dessine.
 * tens / libre : points éditables au milieu de chaque moment, reliés en S ; lum : niveaux des étapes lumière, avec leurs fondus ;
 * pub : participation simulée (votes, téléphones prêts, entrée).
 */
export function traceCourbe(tk: Piste, projet: Projet, plan: Plan, pps: number, haut: number, hauteurUtile: number): { d: string; points: PointCourbe[] } {
  const X = (t: number) => t * pps;
  const Y = (v: number) => haut + hauteurUtile - (v / 100) * hauteurUtile;
  let d = '';
  const points: PointCourbe[] = [];
  if (tk.src === 'lum') {
    let prev = 0;
    plan.evs.forEach((e) => e.run.forEach((rr) => {
      const base = rr.st.ty.startsWith('k:');
      const lv = base ? (rr.st.k[1] ?? 50) : prev;
      const fondu = Math.min(30, (rr.E - rr.S) / 2) * (base ? (rr.st.k[2] ?? 50) : 50) / 100;
      d += (d ? ' L' : 'M') + X(rr.S).toFixed(1) + ' ' + Y(prev).toFixed(1) + ' L' + X(rr.S + fondu).toFixed(1) + ' ' + Y(lv).toFixed(1) + ' L' + X(rr.E).toFixed(1) + ' ' + Y(lv).toFixed(1);
      prev = lv;
    }));
    return { d, points };
  }
  if (tk.src === 'pub') {
    const n = Math.max(40, Math.min(600, Math.round((plan.total * pps) / 6)));
    const ref = projet.tracks.find((x) => x.pts)?.pts ?? {};
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * plan.total;
      let v = 40;
      const e = plan.evs.find((x) => t >= x.S && t < x.E);
      if (e) {
        const rr = e.run.find((x) => t >= x.S && t < x.E);
        const tau = rr ? t - rr.S : 0, ty = rr ? rr.st.ty : '';
        v = ty === 'b3' ? signal('quorum', projet.sens).val(tau)
          : ty === 'u3' ? signal('prets', projet.sens).val(tau)
            : rr && rr.st.ty === 'k:attente' ? signal('pres', projet.sens).val(tau) / 1.42
              : 35 + (ref[e.ev.id] ?? 40) * 0.45;
      }
      d += (i ? ' L' : 'M') + X(t).toFixed(1) + ' ' + Y(v).toFixed(1);
    }
    return { d, points };
  }
  const pts = tk.pts ?? {};
  plan.evs.forEach((e) => { const v = pts[e.ev.id] ?? 50; points.push({ id: e.ev.id, x: X((e.S + e.E) / 2), y: Y(v), v }); });
  if (points.length) {
    d = 'M0 ' + points[0].y.toFixed(1) + ' L' + points[0].x.toFixed(1) + ' ' + points[0].y.toFixed(1);
    points.forEach((p, i) => {
      if (!i) return;
      const q = points[i - 1], mx = (q.x + p.x) / 2;
      d += ' C' + mx.toFixed(1) + ' ' + q.y.toFixed(1) + ' ' + mx.toFixed(1) + ' ' + p.y.toFixed(1) + ' ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
    });
    d += ' L' + X(plan.total).toFixed(1) + ' ' + points[points.length - 1].y.toFixed(1);
  }
  return { d, points };
}
