// Modération (étude §8.2, étages 0-1) : une seule fonction `verifier`, appelée pour TOUT texte affiché
// (humains, figurants N0 à N4, textes corrigés en régie). Il n'existe aucune autre voie vers la diffusion.
//
// Étapes : nettoyage (caractères invisibles, homoglyphes) → motifs de données personnelles (URL, e-mail, téléphone)
// sur le texte brut → normalisation (minuscules, accents, leet, lettres répétées, lettres isolées recollées)
// → listes (mot, expression, préfixe « mot* », version compacte sans séparateurs) → règles « figurant » plus strictes.

export const LONGUEUR_MAX = 80;

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '€': 'e', '!': 'i', '|': 'i' };
// Homoglyphes courants (cyrillique / grec) vers le latin.
const HOMOGLYPHES = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'к': 'k', 'м': 'm', 'т': 't', 'в': 'b', 'н': 'h', 'α': 'a', 'ε': 'e', 'ο': 'o', 'ρ': 'p', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'τ': 't', 'υ': 'u', 'χ': 'x' };

/** Nettoyage d'affichage : NFKC, sans caractères de contrôle ni invisibles, espaces resserrés. */
export function nettoyer(texte) {
  return String(texte ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g, '')
    .replace(/[\p{Cc}\p{Cs}\p{Co}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sansAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Texte de base pour les motifs : minuscules, sans accents, homoglyphes ramenés au latin. */
function base(s) {
  return sansAccents(nettoyer(s).toLowerCase()).replace(/./gu, (c) => HOMOGLYPHES[c] || c);
}

const reduire1 = (m) => m.replace(/([a-z])\1+/g, '$1');      // nooooon → non ; connard → conard (listes normalisées pareil)
const reduire2 = (m) => m.replace(/([a-z])\1{2,}/g, '$1$1');  // forme « orthographique » pour la liste des mots autorisés

/**
 * Normalisation complète → { mots, espace, compact, paires }.
 * `autorises` (facultatif) : mots autorisés (forme reduire2) neutralisés avant la recherche (« baisse » ≠ « baise »).
 */
export function normaliser(texte, autorises = null) {
  let s = base(texte);
  s = s.replace(/(?<=[a-z0-9])[!|](?=[a-z0-9])/g, 'i');   // « p!ute », « c|on » ; un « ! » final reste une ponctuation
  s = s.replace(/[013457@$€]/g, (c) => LEET[c] || c);
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();
  const bruts = s ? s.split(' ') : [];
  // lettres isolées recollées : « c o n n a r d », « c.o.n », « p u t e »
  const recolles = [];
  for (let i = 0; i < bruts.length;) {
    if (bruts[i].length === 1) {
      let j = i; let acc = '';
      while (j < bruts.length && bruts[j].length === 1) { acc += bruts[j]; j++; }
      if (j - i >= 3) { recolles.push(acc); i = j; continue; }
    }
    recolles.push(bruts[i]); i++;
  }
  const mots = recolles.map((m) => (autorises && autorises.has(reduire2(m)) ? '_' : reduire1(m)));
  // morceaux coupés en deux (« pu te », « con nard ») : paires de mots voisins recollées
  const paires = [];
  for (let i = 0; i + 1 < mots.length; i++) if (mots[i] !== '_' && mots[i + 1] !== '_') paires.push(reduire1(mots[i] + mots[i + 1]));
  return { mots, espace: mots.join(' '), compact: mots.filter((m) => m !== '_').join(''), paires };
}

const RE_URL = [
  /\b(?:https?|ftp)\s*:\s*\/\s*\//,
  /\bwww\s*\./,
  /\b[a-z0-9-]{2,}\s*(?:\.|\(\s*(?:dot|point)\s*\)|\[\s*(?:dot|point)\s*\]|\s(?:dot|point)\s)\s*(?:com|fr|net|org|io|gg|tv|be|ch|ly|me|xyz|co|info|biz|app|link|site|online|ru|de|uk|eu|sh|to|cc|tk|live|stream|shop)\b/,
  /\b(?:discord|t\.me|telegram|onlyfans|bit\.ly|tinyurl)\b/,
];
const RE_MAIL = /[a-z0-9._%+-]+\s*(?:@|\(\s*at\s*\)|\[\s*at\s*\]|\sarobase\s)\s*[a-z0-9-]+\s*(?:\.|\spoint\s)\s*[a-z]{2,}/;
const RE_TEL = /(?:\+?\d[\s.\-()/]{0,2}){9,}/;                 // 9 chiffres ou plus, séparateurs compris
const RE_CHIFFRES_FIG = /\d[\s.-]?\d[\s.-]?\d[\s.-]?\d/;     // figurants : pas de nombre de 4 chiffres (numéro, adresse)

/**
 * Une liste compilée : entrées normalisées.
 * Syntaxe d'un fichier : une entrée par ligne ; `#` commentaire ; `[section]` ; `mot*` préfixe ; `+mot` mot autorisé
 * (retiré avant la recherche compacte, ex. « +salopette ») ; `=mot` correspondance exacte seulement (pas de recherche compacte).
 * Les sections dont le nom contient « figurant », « strict », « celebr », « personne » ne s'appliquent qu'aux figurants.
 */
export class Liste {
  constructor() { this.entrees = []; this.autorises = new Set(); this.cles = new Set(); }

  ajouterTexte(texte, { source = '?', figurantsSeulement = false } = {}) {
    let section = '';
    for (let ligne of String(texte).split(/\r?\n/)) {
      ligne = ligne.trim();
      const titre = ligne.match(/^#\s*-{3,}\s*(.+)$/);                 // « # ------ insultes » (banques/interdits.txt)
      if (titre) { section = titre[1].toLowerCase(); continue; }
      if (!ligne || ligne.startsWith('#') || ligne.startsWith('//')) continue;
      if (ligne.startsWith('re:')) {                                    // regex JavaScript (iu) sur la forme B
        try {
          const re = new RegExp(ligne.slice(3), 'iu');
          this.entrees.push({ re, mots: [], compact: '', categorie: section || 'general', source, brut: ligne, figurantsSeulement: figurantsSeulement || /figurant|strict|celebr|personne/.test(section) });
        } catch { /* regex invalide : ignorée */ }
        continue;
      }
      ligne = ligne.replace(/\s+#.*$/, '').trim();
      const m = ligne.match(/^\[(.+)\]$/);
      if (m) { section = m[1].toLowerCase(); continue; }
      // tolérance : « categorie: mot » ou « mot, mot, mot »
      const morceaux = ligne.includes(',') ? ligne.split(',') : [ligne];
      for (let brut of morceaux) {
        brut = brut.trim();
        let cat = section;
        const mc = brut.match(/^([a-zé_ -]{2,20})\s*:\s*(.+)$/i);
        if (mc && !/^https?$/i.test(mc[1])) { cat = mc[1].toLowerCase(); brut = mc[2].trim(); }
        if (!brut) continue;
        this.ajouter(brut, { categorie: cat || 'general', source, figurantsSeulement: figurantsSeulement || /figurant|strict|celebr|personne/.test(cat) });
      }
    }
    return this;
  }

  ajouter(brut, { categorie = 'general', source = '?', figurantsSeulement = false } = {}) {
    if (brut.startsWith('+')) {
      let s = base(brut.slice(1)).replace(/[013457@$€]/g, (c) => LEET[c] || c).replace(/[^a-z0-9]+/g, '');
      if (s) this.autorises.add(reduire2(s));
      return;
    }
    let exact = false; let prefixe = false;
    if (brut.startsWith('=')) { exact = true; brut = brut.slice(1); }
    if (brut.endsWith('*')) { prefixe = true; brut = brut.slice(0, -1); }
    const n = normaliser(brut);
    if (!n.mots.length) return;
    const cle = n.espace + (prefixe ? '*' : '') + (figurantsSeulement ? '!f' : '');
    if (this.cles.has(cle)) return;
    this.cles.add(cle);
    this.entrees.push({ mots: n.mots, compact: n.compact, prefixe, exact, categorie, source, figurantsSeulement, brut });
  }

  /** Cherche dans un texte brut. Renvoie l'entrée trouvée ou null. */
  chercherTexte(texte, { figurant }) {
    const n = normaliser(texte, this.autorises); n.formeB = base(texte);
    return this.chercher(n, { figurant });
  }

  chercher(norm, { figurant }) {
    for (const e of this.entrees) {
      if (e.figurantsSeulement && !figurant) continue;
      if (e.re) { if (norm.formeB != null && e.re.test(norm.formeB)) return e; continue; }
      if (correspondMots(norm.mots, e)) return e;
      if (e.mots.length === 1 && norm.paires.some((p) => (e.prefixe ? p.startsWith(e.mots[0]) : p === e.mots[0]))) return e;
      // recherche compacte (séparateurs insérés à l'intérieur d'un mot) : entrées longues, non exactes, hors listes « figurant »
      if (!e.exact && !e.figurantsSeulement && e.compact.length >= 6 && norm.compact.includes(e.compact)) return e;
    }
    return null;
  }
}

function correspondMots(mots, e) {
  const n = e.mots.length;
  for (let i = 0; i + n <= mots.length; i++) {
    let ok = true;
    for (let k = 0; k < n; k++) {
      const dernier = k === n - 1;
      if (dernier && e.prefixe ? !mots[i + k].startsWith(e.mots[k]) : mots[i + k] !== e.mots[k]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

export class Moderateur {
  /** @param {{liste: Liste, journal?: (evt)=>void}} o */
  constructor({ liste, journal }) {
    this.liste = liste;
    this.journal = journal || (() => {});
    this.compteurs = { verifies: 0, rejets: 0, rejets_figurants: 0, rejets_humains: 0, par_raison: {} };
  }

  remplacerListe(liste) { this.liste = liste; }

  /**
   * @param {string} texte
   * @param {{figurant: boolean, contexte?: object}} o
   * @returns {{ok: boolean, texte: string, raison?: string, motif?: string, duree_ms: number}}
   */
  verifier(texte, { figurant = false, contexte = {}, listeSup = null } = {}) {
    const t0 = performance.now();
    const propre = nettoyer(texte);
    const v = this._verifier(propre, figurant, listeSup);
    const duree_ms = +(performance.now() - t0).toFixed(3);
    this.compteurs.verifies++;
    if (!v.ok) {
      this.compteurs.rejets++;
      this.compteurs[figurant ? 'rejets_figurants' : 'rejets_humains']++;
      this.compteurs.par_raison[v.raison] = (this.compteurs.par_raison[v.raison] || 0) + 1;
      this.journal({ e: 'rejet', raison: v.raison, motif: v.motif, figurant, texte: propre.slice(0, 200), ...contexte });
    }
    return { ...v, texte: propre, duree_ms };
  }

  _verifier(t, figurant, listeSup) {
    if (!t) return { ok: false, raison: 'vide' };
    if ([...t].length > LONGUEUR_MAX) return { ok: false, raison: 'longueur' };
    const b = base(t);
    if (RE_MAIL.test(b)) return { ok: false, raison: 'email' };
    if (RE_URL.some((r) => r.test(b))) return { ok: false, raison: 'url' };
    if (RE_TEL.test(b)) return { ok: false, raison: 'telephone' };
    if (figurant && RE_CHIFFRES_FIG.test(b)) return { ok: false, raison: 'chiffres' };
    const norm = normaliser(t, this.liste.autorises);
    norm.formeB = b;
    // URL déguisée en leet / espaces (« d1sc0rd point gg »)
    if (/\b(?:discord|telegram|onlyfans)\b/.test(norm.espace) || /(?:www|http)/.test(norm.compact.slice(0, 8))) return { ok: false, raison: 'url' };
    const e = this.liste.chercher(norm, { figurant }) || (listeSup && figurant ? listeSup.chercher(norm, { figurant }) : null);
    if (e) return { ok: false, raison: e.figurantsSeulement ? `figurant:${e.categorie}` : `liste:${e.categorie}`, motif: e.brut };
    if (figurant) {
      // Pas d'apostrophe d'IA ni de format technique qui fuit (JSON, balises).
      if (/[{}]|<\/?[a-z]|"persona"|"texte"/i.test(t)) return { ok: false, raison: 'figurant:format' };   // « <3 » reste permis
      // Pas de cris prolongés d'urgence ni de « @pseudo » vers une personne réelle.
      if (/(^|\s)@\w/.test(t)) return { ok: false, raison: 'figurant:mention' };
    }
    return { ok: true };
  }
}
