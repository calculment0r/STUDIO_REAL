// Styliseur déterministe (port de styliseur.mjs ; étude §6.3) : le LLM écrit le fond, ce module applique la voix du persona
// (casse, accents, abréviations, fautes réalistes, lettres répétées, tics, emojis) et retire les tics d'IA.
import { proba, choisir, entier } from './util';
import type { Persona } from './types';

const TICS_IA = [
  /^(absolument|bien sûr|bien sur|certainement|en effet|effectivement|haha|ah ah)\s*[,!.:]\s*/i,
  /\b(quelle aventure|n'hésite pas|n'hésitez pas|je comprends|en tant que)\b[^,.!?]*/gi,
];

// Voisins sur un clavier AZERTY (fautes de frappe plausibles).
const AZERTY: Record<string, string> = {
  a: 'zqs', z: 'aes', e: 'zrd', r: 'etf', t: 'ryg', y: 'tuh', u: 'yij', i: 'uok', o: 'ipl', p: 'om',
  q: 'asw', s: 'qdz', d: 'sfe', f: 'dgr', g: 'fht', h: 'gjy', j: 'hku', k: 'jli', l: 'kmo', m: 'lp',
  w: 'xq', x: 'wc', c: 'xv', v: 'cb', b: 'vn', n: 'b',
};
const HOMOPHONES: [RegExp, string][] = [
  [/\bça\b/g, 'sa'], [/\bà\b/g, 'a'], [/\bc'est\b/g, 'cest'], [/\bt'es\b/g, 'tes'], [/\bquoi\b/g, 'koi'],
  [/\bje sais pas\b/g, 'jsais pas'], [/\btrès\b/g, 'tro'], [/\bmais\b/g, 'mé'],
];
const ABREV_COMMUNES: Record<string, string> = {
  'je sais pas': 'jsp', 'pourquoi': 'pk', "s'il te plaît": 'stp', "s'il vous plaît": 'svp', 'mort de rire': 'mdr',
  'tout le monde': 'tlm', "quelqu'un": 'qqn', 'franchement': 'franchmt',
};

const EMOJI = /\p{Extended_Pictographic}/u;
export const compterEmojis = (s: string): number => (String(s).match(/\p{Extended_Pictographic}/gu) || []).length;

function sansAccents(s: string): string { return s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC'); }

function fauteClavier(texte: string): string {
  const mots = texte.split(' ');
  const idx = mots.map((m, i) => [m, i] as const).filter(([m]) => /^[a-zà-ÿ]{4,}$/i.test(m));
  const tire = choisir(idx);
  if (!tire) return texte;
  const [mot, i] = tire;
  const p = entier(1, mot.length - 2);
  const c = (mot[p] ?? '').toLowerCase();
  const voisins = AZERTY[c];
  let nouveau: string;
  if (voisins && proba(0.6)) nouveau = mot.slice(0, p) + (choisir([...voisins]) ?? c) + mot.slice(p + 1);
  else if (proba(0.5)) nouveau = mot.slice(0, p) + mot.slice(p + 1);                 // lettre oubliée
  else nouveau = mot.slice(0, p) + (mot[p + 1] ?? '') + (mot[p] ?? '') + mot.slice(p + 2); // inversion
  mots[i] = nouveau;
  return mots.join(' ');
}

function repeterLettre(texte: string): string {
  // « non » → « nooon », « trop » → « troooop » : sur un mot court expressif
  const m = texte.match(/\b(non|oui|nan|trop|mais|allez|go|oh|ah|wsh|chef|grave|ouf)\b/i);
  if (!m) return texte;
  const mot = m[0];
  const voyelle = mot.match(/[aeiouy](?=[^aeiouy]*$)/i);
  if (!voyelle) return texte;
  const p = mot.lastIndexOf(voyelle[0]);
  const rep = mot.slice(0, p) + voyelle[0].repeat(entier(3, 5)) + mot.slice(p + 1);
  return texte.replace(mot, rep);
}

/** Coupe à la longueur max sur une frontière de mot. */
export function couper(texte: string, max: number): string {
  const car = [...texte];
  if (car.length <= max) return texte;
  let t = car.slice(0, max).join('');
  const i = t.lastIndexOf(' ');
  if (i > max * 0.5) t = t.slice(0, i);
  return t.replace(/[\s,;:–-]+$/, '');
}

/** Nettoyage du texte brut produit par un LLM (avant la voix). */
export function nettoyerLLM(texte: string): string {
  let t = String(texte || '').trim();
  t = t.replace(/^["'«»“”\s]+|["'«»“”\s]+$/g, '');
  t = t.replace(/^[a-z0-9_]{2,25}\s*:\s+/i, '');           // « pseudo : texte »
  for (const r of TICS_IA) t = t.replace(r, '');
  t = t.replace(/\s*[—–]\s*/g, ', ').replace(/;/g, ',').replace(/…/g, '...');
  t = t.replace(/\s+/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '');
  return t;
}

/**
 * Applique la voix d'un persona.
 * `leger` = textes écrits par l'auteur (pas de fautes, pas de tic).
 */
export function styliser(texte: string, persona: Persona | null | undefined, { leger = false, max = 80 }: { leger?: boolean; max?: number } = {}): string {
  const v = persona?.voix;
  let t = leger ? String(texte).trim() : nettoyerLLM(texte);
  if (!t) return '';
  if (v && !leger) {
    const abrev = { ...ABREV_COMMUNES, ...(v.abreviations || {}) };
    for (const [de, vers] of Object.entries(abrev)) {
      if (de === vers || !proba(0.7)) continue;
      t = t.replace(new RegExp(`\\b${de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), vers);
    }
    if (proba(v.fautes || 0)) {
      const typiques = (v.fautes_typiques || []).filter(([a]) => t.includes(a));
      if (typiques.length && proba(0.7)) {
        const f = choisir(typiques);
        if (f) t = t.replace(f[0], f[1]);
      } else if (proba(0.5)) {
        const courant = t;
        const h = HOMOPHONES.filter(([r]) => { r.lastIndex = 0; return r.test(courant); });
        const f = choisir(h);
        if (f) { f[0].lastIndex = 0; t = t.replace(f[0], f[1]); }
      } else t = fauteClavier(t);
      for (const [r] of HOMOPHONES) r.lastIndex = 0;
    }
    if (proba(1 - (v.accents ?? 1))) t = sansAccents(t);           // accents = probabilité de les garder
    if (proba(v.repetition_lettres ?? 0.15)) t = repeterLettre(t);
    if (!proba(v.point_final || 0)) t = t.replace(/(?<!\.)\.$/, '');
    if (v.tics?.length && proba(v.tic_proba || 0) && !t.toLowerCase().includes(v.tics[0]!.toLowerCase())) {
      const tic = choisir(v.tics);
      if (tic) t = proba(0.5) ? `${tic} ${t}` : `${t} ${tic}`;
    }
  }
  if (v) {
    // casse
    if (v.casse === 'minuscules' && !leger) t = t.toLowerCase();
    if (proba(leger ? (v.cris || 0) * 0.3 : (v.cris || 0))) t = t.toUpperCase();
    // emojis et émotes (pas de doublon si le texte en contient déjà)
    if (!EMOJI.test(t) && v.emojis?.length && proba((v.emojis_par_msg || 0) * (leger ? 0.4 : 1))) {
      const e = choisir(v.emojis) ?? '';
      t = `${t} ${proba(0.25) ? e.repeat(entier(2, 3)) : e}`;
    } else if (!leger && v.emotes?.length && proba(0.08)) {
      t = `${t} ${choisir(v.emotes) ?? ''}`;
    }
  }
  const maxPersona = Math.min(max, Math.max(10, (v?.longueur?.[1] || max) + 15));
  return couper(t.replace(/\s+/g, ' ').trim(), maxPersona);
}
