// Modération des textes affichés au mur (messages du public, répliques des figurants) et des pseudos. PUR : ni Node,
// ni fichier ; la liste des mots interdits est passée par l'hôte (prototypes/figurants/banques/interdits.txt).
//
// Reprend les règles du prototype du 27/10 (prototypes/figurants/serveur/moderation.mjs), avec une différence voulue :
// un mot interdit est MASQUÉ (« *** ») au lieu de faire refuser tout le message ; le message n'est refusé que s'il est
// vide après nettoyage, trop long, ou surtout fait de mots interdits.
//
// Normalisation (forme A, pour les entrées simples) : NFKC, caractères invisibles retirés, minuscules, accents retirés,
// homoglyphes cyrilliques et grecs ramenés au latin, chiffres et symboles mis pour des lettres (« c0nn4rd »), lettres
// répétées réduites (« cooonnard »), lettres isolées recollées (« c o n n a r d »), mots coupés en deux (« con nard »).
// Forme B, pour les entrées « re: » (expressions régulières) : minuscules, sans accents, homoglyphes ramenés, chiffres et
// ponctuation gardés (liens, adresses e-mail, numéros de téléphone).
//
// Syntaxe d'une liste : une entrée par ligne ; lignes vides et « # … » ignorées ; « mot » ou « une expression » (mot
// entier, jamais une sous-chaîne : « con » ne touche pas « content ») ; « mot* » préfixe ; « =mot » mot exact ;
// « +mot » mot autorisé (jamais masqué) ; « re:<expression> » expression régulière JavaScript (drapeaux « iu »).

export type Verdict = 'ok' | 'masque' | 'refuse';
export interface ResultatModeration {
  verdict: Verdict;
  /** texte nettoyé, mots interdits remplacés par « *** » */
  texte: string;
  /** pourquoi le texte est refusé : vide, longueur, interdits */
  raison?: 'vide' | 'longueur' | 'interdits';
}

/** Longueur maximale d'un texte affiché au mur (caractères). */
export const LONGUEUR_MAX_TEXTE = 200;
/** Ce qui remplace un mot interdit. */
export const MASQUE = '***';
/** Couleurs des pseudos des spectateurs (jetons CSS du thème), comme le prototype du 27/10. */
export const COULEURS_HUMAINS = ['--cy', '--or', '--grn2', '--amb', '--coral-3', '--ink2', '--coral-2'] as const;
/** Couleur d'un figurant sans couleur valide. */
export const COULEUR_DEFAUT = '--ink2';
/** Jeton de couleur accepté au mur (même règle que la sortie). */
export const RE_JETON_COULEUR = /^--[a-z0-9-]{1,32}$/;
/** Pseudo accepté : 2 à 20 lettres, chiffres, « _ », « . », « - ». */
export const RE_PSEUDO = /^[\p{L}\p{N}_.-]{2,20}$/u;

const LEET: Record<string, string> = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '€': 'e', '!': 'i', '|': 'i' };
const HOMOGLYPHES: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'к': 'k', 'м': 'm',
  'т': 't', 'в': 'b', 'н': 'h', 'α': 'a', 'ε': 'e', 'ο': 'o', 'ρ': 'p', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'τ': 't', 'υ': 'u',
  'χ': 'x', 'œ': 'oe', 'æ': 'ae', 'ß': 'ss',
};

/** Hachage FNV-1a 32 bits sur les points de code (celui du prototype : mêmes couleurs pour les mêmes pseudos). */
export function hache(s: string): number {
  let h = 2166136261;
  for (const c of s) { h ^= c.codePointAt(0)!; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Couleur d'un pseudo de spectateur : stable (même pseudo, même couleur). */
export const couleurPseudo = (pseudo: string): string => COULEURS_HUMAINS[hache(pseudo) % COULEURS_HUMAINS.length]!;

/** Nettoyage d'affichage : NFKC, sans caractères invisibles ni de contrôle, espaces resserrés. */
export function nettoyer(texte: string): string {
  return String(texte ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g, '')   // caractères invisibles (largeur nulle, sens d'écriture, BOM, trait d'union conditionnel), écrits en codes Unicode pour rester lisibles
    .replace(/[\p{Cc}\p{Cs}\p{Co}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Un caractère en forme B : minuscule, sans accent, homoglyphe ramené au latin. */
function caractereB(c: string): string {
  const s = c.toLowerCase().normalize('NFD').replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g, '');
  return [...s].map(x => HOMOGLYPHES[x] ?? x).join('');
}

/** Forme A d'un mot : forme B, chiffres et symboles mis pour des lettres, seulement [a-z0-9]. */
function motA(mot: string): string {
  return [...mot].map(caractereB).join('').replace(/[013457@$€!|]/g, c => LEET[c] ?? c).replace(/[^a-z0-9]+/g, '');
}

/** Lettres répétées réduites à une : « cooonnard » → « conard » (les entrées sont réduites de la même façon). */
const reduire = (m: string) => m.replace(/([a-z])\1+/g, '$1');
/** Forme « orthographique » (3 lettres répétées ou plus → 2) : celle des mots autorisés (« +conard » ≠ « connard »). */
const reduire2 = (m: string) => m.replace(/([a-z])\1{2,}/g, '$1$1');

/** Lignes d'un fichier de liste : une entrée par ligne, lignes vides et commentaires « # » retirés. */
export function lireInterdits(texte: string): string[] {
  return String(texte ?? '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
}

interface EntreeMots { mots: string[]; prefixe: boolean }
interface ListeCompilee { mots: EntreeMots[]; re: RegExp[]; autorises: Set<string> }

const compilees = new WeakMap<readonly string[], ListeCompilee>();

function compiler(interdits: readonly string[]): ListeCompilee {
  const deja = compilees.get(interdits);
  if (deja) return deja;
  const l: ListeCompilee = { mots: [], re: [], autorises: new Set() };
  const vues = new Set<string>();
  for (const brute of interdits) {
    let e = String(brute ?? '').trim();
    if (!e || e.startsWith('#')) continue;
    if (e.startsWith('re:')) {
      try { l.re.push(new RegExp(e.slice(3), 'giu')); } catch { /* expression invalide : ignorée */ }
      continue;
    }
    e = e.replace(/\s+#.*$/, '').trim();
    if (e.startsWith('+')) {
      const m = reduire2(motA(e.slice(1)));
      if (m) l.autorises.add(m);
      continue;
    }
    if (e.startsWith('=')) e = e.slice(1);
    const prefixe = e.endsWith('*');
    if (prefixe) e = e.slice(0, -1);
    const mots = e.split(/[^\p{L}\p{N}@$€!|]+/u).map(motA).filter(Boolean).map(reduire);
    if (!mots.length) continue;
    const cle = mots.join(' ') + (prefixe ? '*' : '');
    if (vues.has(cle)) continue;
    vues.add(cle);
    l.mots.push({ mots, prefixe });
  }
  compilees.set(interdits, l);
  return l;
}

/** Un mot du texte : sa forme A réduite (`mot`), sa forme orthographique (`ortho`) et sa place dans le texte nettoyé. */
interface Unite { mot: string; ortho: string; debut: number; fin: number }

/** Mots du texte nettoyé, avec leur place ; « ! » et « | » comptent comme lettres seulement à l'intérieur d'un mot. */
function unites(t: string, autorises: Set<string>): Unite[] {
  const bruts: Unite[] = [];
  for (const m of t.matchAll(/[\p{L}\p{N}\p{M}@$€]+(?:[!|][\p{L}\p{N}\p{M}@$€]+)*/gu)) {
    const a = motA(m[0]);
    const mot = reduire(a);
    if (mot) bruts.push({ mot, ortho: reduire2(a), debut: m.index!, fin: m.index! + m[0].length });
  }
  // lettres isolées recollées (au moins 3) : « c o n n a r d », « c.o.n »
  const out: Unite[] = [];
  for (let i = 0; i < bruts.length;) {
    let j = i;
    while (j < bruts.length && bruts[j]!.mot.length === 1) j++;
    if (j - i >= 3) {
      const colle = bruts.slice(i, j).map(u => u.ortho).join('');
      out.push({ mot: reduire(colle), ortho: reduire2(colle), debut: bruts[i]!.debut, fin: bruts[j - 1]!.fin });
      i = j;
      continue;
    }
    out.push(bruts[i]!);
    i++;
  }
  return out.map(u => (autorises.has(u.ortho) ? { ...u, mot: '_' } : u));
}

const egal = (mot: string, e: string, prefixe: boolean) => (prefixe ? mot.startsWith(e) : mot === e);

/** Forme B du texte, avec pour chaque unité de code la place du caractère d'origine. */
function formeB(t: string): { b: string; place: { debut: number; fin: number }[] } {
  let b = '';
  const place: { debut: number; fin: number }[] = [];
  let i = 0;
  for (const c of t) {
    const x = caractereB(c);
    for (let k = 0; k < x.length; k++) place.push({ debut: i, fin: i + c.length });
    b += x;
    i += c.length;
  }
  return { b, place };
}

/**
 * Vérifie un texte à afficher : nettoyé, mots interdits masqués (« *** »). Refus si le texte est vide après nettoyage,
 * dépasse LONGUEUR_MAX_TEXTE caractères, ou si la moitié de ses mots au moins sont interdits.
 */
export function verifierTexte(texte: string, interdits: readonly string[] = []): ResultatModeration {
  const t = nettoyer(texte);
  if (!t) return { verdict: 'refuse', texte: '', raison: 'vide' };
  if ([...t].length > LONGUEUR_MAX_TEXTE) return { verdict: 'refuse', texte: t, raison: 'longueur' };
  const l = compiler(interdits);
  const u = unites(t, l.autorises);
  const zones: [number, number][] = [];
  const touches = new Set<number>();
  for (const e of l.mots) {
    const n = e.mots.length;
    for (let i = 0; i + n <= u.length; i++) {
      let ok = true;
      for (let k = 0; k < n && ok; k++) ok = egal(u[i + k]!.mot, e.mots[k]!, e.prefixe && k === n - 1);
      if (ok) { zones.push([u[i]!.debut, u[i + n - 1]!.fin]); for (let k = 0; k < n; k++) touches.add(i + k); }
    }
    // mot coupé en deux (« con nard », « pu te ») : entrées d'au moins 4 lettres
    if (n === 1 && e.mots[0]!.length >= 4) {
      for (let i = 0; i + 1 < u.length; i++) {
        const a = u[i]!, b = u[i + 1]!;
        if (a.mot === '_' || b.mot === '_' || touches.has(i) || touches.has(i + 1)) continue;
        if (egal(reduire(a.mot + b.mot), e.mots[0]!, e.prefixe)) { zones.push([a.debut, b.fin]); touches.add(i); touches.add(i + 1); }
      }
    }
  }
  if (l.re.length) {
    const { b, place } = formeB(t);
    for (const re of l.re) {
      re.lastIndex = 0;
      for (const m of b.matchAll(re)) {
        if (!m[0].length) continue;
        const debut = place[m.index!]!.debut, fin = place[m.index! + m[0].length - 1]!.fin;
        zones.push([debut, fin]);
        u.forEach((x, i) => { if (x.debut < fin && x.fin > debut) touches.add(i); });
      }
    }
  }
  if (!zones.length) return { verdict: 'ok', texte: t };
  zones.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let masque = '';
  let pos = 0;
  for (const [d, f] of zones) {
    if (f <= pos) continue;
    masque += t.slice(pos, Math.max(pos, d)) + (d >= pos ? MASQUE : '');
    pos = f;
  }
  masque += t.slice(pos);
  const surtout = touches.size * 2 >= Math.max(1, u.length);
  return surtout ? { verdict: 'refuse', texte: masque, raison: 'interdits' } : { verdict: 'masque', texte: masque };
}

/**
 * Pseudo proposé par un téléphone, filtré comme au prototype : espaces → « _ », 20 caractères, lettres, chiffres,
 * « _ . - » seulement, aucun mot interdit. null : pseudo refusé (le serveur en attribue un).
 */
export function filtrerPseudo(brut: unknown, interdits: readonly string[] = []): string | null {
  if (typeof brut !== 'string') return null;
  const p = nettoyer(brut).replace(/\s+/g, '_').slice(0, 20);
  if (!RE_PSEUDO.test(p)) return null;
  return verifierTexte(p.replace(/[_.-]+/g, ' '), interdits).verdict === 'ok' ? p : null;
}
