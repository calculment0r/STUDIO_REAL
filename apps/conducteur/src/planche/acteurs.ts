// Les acteurs sur la planche : logique PURE (sans React ni DOM), testée dans acteurs.test.ts.
//   - la bande des acteurs : un nœud par acteur, posé à l'écran (bande fixe à gauche, sous la barre d'outils) ;
//   - les liens étape → acteur (un par envoi) et acteur → sortie (une condition sig: / sigv: sur un signal de l'acteur),
//     calculés en coordonnées d'ÉCRAN à partir des cadres (monde) et de la caméra ;
//   - les puces d'ordres sous chaque bloc (« PUBLIC · vote 1 », « SCENE · mur · vote Q3 »).
// Couleurs : jetons du thème seulement (familles du catalogue des blocs : --fam-ui pour un téléphone, --fam-scene pour
// une sortie ou un agent, --fam-trig pour un signal attendu).
import {
  cibleDansFoule, cleSignal, lireSignalActeur, type Acteur, type Envoi, type Etape,
} from '@studio-real/modele';
import {
  hauteurBloc, intersecte, liensDuMoment, mondeVersEcran, rondSortie, cheminLien,
  type CadreMoment, type Camera, type Niveau, type Point, type Rect,
} from './geometrie';

// ── La bande des acteurs (coordonnées d'écran, dans la boîte de la planche) ─────────────────────────────────────────

/** Mesures de la bande : à gauche, sous la barre d'outils (≈ 52 px) et son en-tête (24 px), au-dessus de la légende (≈ 46 px). */
export const BANDE = { x: 34, haut: 82, bas: 48, largeur: 156, hauteurNoeud: 40, ecart: 6 } as const;

export interface NoeudActeur {
  id: string;
  acteur: Acteur;
  /** coin haut-gauche du nœud, à l'écran */
  x: number;
  y: number;
  l: number;
  h: number;
  /** point d'accroche des liens (milieu du bord droit) */
  ancre: Point;
  /** le nœud est hors de la zone visible de la bande (défilement) */
  cache: boolean;
}

/** Hauteur totale du contenu de la bande pour n acteurs. */
export const hauteurContenuBande = (n: number): number => (n <= 0 ? 0 : n * BANDE.hauteurNoeud + (n - 1) * BANDE.ecart);

/** Défilement maximal de la bande (quand les acteurs ne tiennent pas dans la hauteur de la planche). */
export function defilementMaxBande(n: number, hauteurVue: number): number {
  const dispo = Math.max(0, hauteurVue - BANDE.haut - BANDE.bas);
  return Math.max(0, hauteurContenuBande(n) - dispo);
}

/** Place un nœud par acteur (dans l'ordre du projet), de haut en bas, décalé du défilement de la bande. */
export function placerBande(acteurs: readonly Acteur[], hauteurVue: number, defilement = 0): NoeudActeur[] {
  const d = Math.max(0, Math.min(defilement, defilementMaxBande(acteurs.length, hauteurVue)));
  const bas = hauteurVue - BANDE.bas;
  return acteurs.filter(a => a && typeof a.id === 'string').map((acteur, i) => {
    const y = BANDE.haut + i * (BANDE.hauteurNoeud + BANDE.ecart) - d;
    const h = BANDE.hauteurNoeud, l = BANDE.largeur;
    return {
      id: acteur.id, acteur, x: BANDE.x, y, l, h, ancre: { x: BANDE.x + l, y: y + h / 2 },
      cache: y < BANDE.haut - 1 || y + h > bas + 1,
    };
  });
}

/** Nœud d'un acteur par son id (casse et accents ignorés, comme les signaux). */
export function noeudDe(noeuds: readonly NoeudActeur[], id: string): NoeudActeur | undefined {
  return noeuds.find(n => n.id === id) ?? noeuds.find(n => cleSignal(n.id) === cleSignal(id));
}

// ── Couleurs ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Couleur des liens et des puces d'un acteur : famille « Écrans du public » pour un téléphone, « Scène et régie » sinon. */
export function couleurActeur(a: Pick<Acteur, 'rendu'> | undefined): string {
  return a?.rendu === 'telephone' ? 'var(--fam-ui)' : 'var(--fam-scene)';
}
export const COULEUR_SIGNAL = 'var(--fam-trig)';

/** Glyphe (tracé SVG 24 × 24) du type d'acteur. */
export const GLYPHES_ACTEUR: Record<string, string> = {
  regie: 'M4 6h16M4 12h16M4 18h16M8 4v4M15 10v4M10 16v4',
  comedien: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 21c.8-4 3.6-6 7-6s6.2 2 7 6',
  public: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16.5 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM2.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M14 15.3c.8-.2 1.6-.3 2.5-.3 2.5 0 4.4 1.7 5 4.5',
  ecran: 'M3 5h18v12H3zM8 21h8M12 17v4',
  telephone: 'M8 2h8v20H8zM11 18h2',
  agent: 'M12 3l2.2 5.3L20 10.5l-5.8 2.2L12 18l-2.2-5.3L4 10.5l5.8-2.2zM18.5 16.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z',
};
export const glypheActeur = (type: string): string => GLYPHES_ACTEUR[type] ?? GLYPHES_ACTEUR.agent!;

// ── Liens ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Poignée « envoyer » d'un bloc (monde) : son coin bas-gauche. Le lien d'un envoi part d'ici. */
export function pointEnvoi(pos: Point, niveau: Niveau): Point {
  return { x: pos.x, y: pos.y + hauteurBloc(niveau) };
}

/** Courbe d'un point (à droite) vers l'accroche d'un acteur (dans la bande, à gauche) : départ vers la gauche. */
export function cheminVersActeur(ax: number, ay: number, bx: number, by: number): string {
  const d = Math.max(40, Math.abs(ax - bx) * 0.45), f = (v: number) => Math.round(v * 10) / 10;
  return `M${f(ax)} ${f(ay)} C${f(ax - d)} ${f(ay)} ${f(bx + d)} ${f(by)} ${f(bx)} ${f(by)}`;
}

export interface LienActeur {
  /** clé React stable */
  cle: string;
  genre: 'envoi' | 'signal';
  acteur: string;
  moment: string;
  /** envoi : l'étape qui envoie ; signal : l'étape source de la sortie */
  etape: string;
  /** envoi : index dans etape.envois ; signal : index de la sortie dans moment.tr */
  index: number;
  /** extrémité côté planche (écran) */
  a: Point;
  /** extrémité côté acteur (écran) */
  b: Point;
  d: string;
  couleur: string;
}

/** Étendue (monde) d'une étape et de ses puces, pour ne garder que les liens visibles. */
const rectEtape = (p: Point, niveau: Niveau): Rect => ({ x: p.x - 40, y: p.y - 40, w: 240 + 80, h: hauteurBloc(niveau) + 120 });

/** Liens étape → acteur : un par envoi lisible dont l'acteur a un nœud dans la bande. `vue` (monde) : seuls les blocs
 *  visibles donnent un lien. */
export function liensEnvois(cadres: readonly CadreMoment[], cam: Camera, noeuds: readonly NoeudActeur[], niveau: Niveau, vue?: Rect): LienActeur[] {
  const out: LienActeur[] = [];
  if (!noeuds.length) return out;
  for (const f of cadres) {
    if (vue && !intersecte(f.r, vue)) continue;
    for (const st of f.moment.st) {
      if (!Array.isArray(st.envois) || !st.envois.length) continue;
      const pos = f.P[st.id];
      if (!pos || (vue && !intersecte(rectEtape(pos, niveau), vue))) continue;
      const a = mondeVersEcran(cam, pointEnvoi(pos, niveau).x, pointEnvoi(pos, niveau).y);
      st.envois.forEach((e, index) => {
        const cible = cibleDansFoule(e?.vers);
        const n = cible ? noeudDe(noeuds, cible.acteur) : undefined;
        if (!n || !cible) return;
        out.push({
          cle: `e|${f.moment.id}|${st.id}|${index}`, genre: 'envoi', acteur: n.id, moment: f.moment.id, etape: st.id, index,
          a, b: n.ancre, d: cheminVersActeur(a.x, a.y, n.ancre.x, n.ancre.y), couleur: couleurActeur(n.acteur),
        });
      });
    }
  }
  return out;
}

/** Acteur visé par une clé de condition 'sig:<acteur>.<signal>' ou 'sigv:<acteur>.<signal>' (null sinon). */
export function acteurDeCondition(k: string): { acteur: string; signal: string } | null {
  const r = /^(sig|sigv):(.+)$/.exec(k);
  return r ? lireSignalActeur(r[2]!) : null;
}

/** Liens acteur → sortie d'étape : un par (sortie, acteur) pour les conditions sig: / sigv: sur un signal de l'acteur.
 *  L'extrémité est la règle de la sortie (milieu du lien) ou, pour une sortie vers la fin du moment, son rond. */
export function liensSignaux(cadres: readonly CadreMoment[], cam: Camera, noeuds: readonly NoeudActeur[], niveau: Niveau, vue?: Rect): LienActeur[] {
  const out: LienActeur[] = [];
  if (!noeuds.length) return out;
  for (const f of cadres) {
    if (vue && !intersecte(f.r, vue)) continue;
    const geo = new Map(liensDuMoment(f, niveau).map(l => [l.index, l]));
    f.moment.tr.forEach((s, index) => {
      const vus = new Set<string>();
      for (const g of s.g ?? []) {
        const sa = acteurDeCondition(g.k);
        const n = sa ? noeudDe(noeuds, sa.acteur) : undefined;
        if (!n || vus.has(n.id)) continue;
        vus.add(n.id);
        let w: Point | undefined = geo.get(index)?.milieu;
        if (!w) {
          const pa = f.P[s.a];
          if (!pa) continue;
          const ordre = Math.max(0, f.moment.tr.filter(x => x.a === s.a).indexOf(s));
          w = rondSortie(pa, ordre, niveau);
        }
        const a = mondeVersEcran(cam, w.x, w.y);
        out.push({
          cle: `s|${f.moment.id}|${index}|${n.id}`, genre: 'signal', acteur: n.id, moment: f.moment.id, etape: s.a, index,
          a, b: n.ancre, d: cheminLien(n.ancre.x, n.ancre.y, a.x, a.y), couleur: COULEUR_SIGNAL,
        });
      }
    });
  }
  return out;
}

// ── Puces d'ordres sous les blocs ──────────────────────────────────────────────────────────────────────────────────

const court = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const estNombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Ce que dit un envoi, en quelques mots : « vote 1 », « mur · vote Q3 », « regardez « Regardez la scène » ». */
export function resumeEnvoi(e: Pick<Envoi, 'ecran' | 'fx' | 'params'>): string {
  const p = e.params && typeof e.params === 'object' && !Array.isArray(e.params) ? e.params : {};
  const base = e.ecran || (e.fx ? 'effet ' + e.fx : '—');
  let detail = '';
  if (typeof p.vote === 'string' && p.vote) {
    detail = p.vote === 'ouvert' ? 'vote' + (estNombre(p.numero) || typeof p.numero === 'string' ? ' Q' + String(p.numero) : '')
      : p.vote === 'revele' ? 'résultat' : p.vote === 'ferme' ? 'vote fermé' : 'vote ' + p.vote;
    return base + ' · ' + detail;
  }
  if (p.revele === true) return base + ' · résultat';
  if (estNombre(p.numero)) detail = ' ' + p.numero;
  else if (typeof p.numero === 'string' && p.numero) detail = ' ' + p.numero;
  else if (typeof p.texte === 'string' && p.texte) detail = ' « ' + court(p.texte, 22) + ' »';
  else if (typeof p.asset === 'string' && p.asset) detail = ' ' + court(p.asset, 24);
  else if (typeof p.audio === 'string' && p.audio) detail = ' ' + court(p.audio, 24);
  else if (typeof p.segment === 'string' && p.segment) detail = ' ' + p.segment;
  else if (typeof p.densite === 'string' && p.densite) detail = ' ' + p.densite;
  const fx = e.ecran && e.fx ? ' + ' + e.fx : '';
  return base + detail + fx;
}

/** Étiquette d'un acteur dans une puce : son id en capitales (une cible dans la foule garde son filtre). */
export function etiquetteCible(vers: string): string {
  return String(vers ?? '').toUpperCase();
}

/** Moment d'un envoi, en suffixe de puce : rien à l'entrée, « +5 s », « à la sortie ». */
export function suffixeQuand(e: Pick<Envoi, 'quand'>): string {
  const q = e.quand;
  if (q === 'sortie') return ' · à la sortie';
  if (q && typeof q === 'object' && estNombre((q as { apres?: unknown }).apres)) return ` · +${(q as { apres: number }).apres} s`;
  return '';
}

/** Texte d'une puce d'ordre : « PUBLIC · vote 1 ». */
export function puceEnvoi(e: Envoi): string {
  return `${etiquetteCible(e.vers)} · ${resumeEnvoi(e)}${suffixeQuand(e)}`;
}

export interface PuceOrdre { index: number; texte: string; acteur: string; couleur: string; tenu: boolean }

/** Les puces d'ordres d'une étape, dans l'ordre d'envoi écrit. `acteurs` : pour la couleur (absent = sortie). */
export function pucesEtape(st: Pick<Etape, 'envois'>, acteurs?: readonly Acteur[]): PuceOrdre[] {
  if (!Array.isArray(st.envois)) return [];
  const out: PuceOrdre[] = [];
  st.envois.forEach((e, index) => {
    if (!e || typeof e !== 'object' || typeof e.vers !== 'string') return;
    const id = cibleDansFoule(e.vers)?.acteur ?? e.vers;
    const a = acteurs?.find(x => x && x.id === id);
    out.push({ index, texte: puceEnvoi(e), acteur: id, couleur: couleurActeur(a), tenu: e.tenir !== false });
  });
  return out;
}

/** Point (monde) où se posent les puces d'un bloc : sous lui, à gauche. */
export function pointPuces(pos: Point, niveau: Niveau): Point {
  return { x: pos.x, y: pos.y + hauteurBloc(niveau) + 8 };
}
