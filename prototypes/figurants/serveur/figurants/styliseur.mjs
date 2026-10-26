// Styliseur déterministe (étude §6.3) : le LLM écrit le fond, ce module applique la voix du persona
// (casse, accents, abréviations, fautes réalistes, lettres répétées, tics, emojis) et retire les tics d'IA.

import { proba, choisir, entier } from '../util.mjs';

const TICS_IA = [
  /^(absolument|bien sûr|bien sur|certainement|en effet|effectivement|haha|ah ah)\s*[,!.:]\s*/i,
  /\b(quelle aventure|n'hésite pas|n'hésitez pas|je comprends|en tant que)\b[^,.!?]*/gi,
];

// Voisins sur un clavier AZERTY (fautes de frappe plausibles).
const AZERTY = {
  a: 'zqs', z: 'aes', e: 'zrd', r: 'etf', t: 'ryg', y: 'tuh', u: 'yij', i: 'uok', o: 'ipl', p: 'om',
  q: 'asw', s: 'qdz', d: 'sfe', f: 'dgr', g: 'fht', h: 'gjy', j: 'hku', k: 'jli', l: 'kmo', m: 'lp',
  w: 'xq', x: 'wc', c: 'xv', v: 'cb', b: 'vn', n: 'b',
};
const HOMOPHONES = [[/\bça\b/g, 'sa'], [/\bà\b/g, 'a'], [/\bc'est\b/g, 'cest'], [/\bt'es\b/g, 'tes'], [/\bquoi\b/g, 'koi'], [/\bje sais pas\b/g, 'jsais pas'], [/\btrès\b/g, 'tro'], [/\bmais\b/g, 'mé']];
const ABREV_COMMUNES = { 'je sais pas': 'jsp', 'pourquoi': 'pk', "s'il te plaît": 'stp', "s'il vous plaît": 'svp', 'mort de rire': 'mdr', 'tout le monde': 'tlm', 'quelqu\'un': 'qqn', 'franchement': 'franchmt' };

const EMOJI = /\p{Extended_Pictographic}/u;
export const compterEmojis = (s) => (String(s).match(/\p{Extended_Pictographic}/gu) || []).length;

function sansAccents(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC'); }

function fauteClavier(texte) {
  const mots = texte.split(' ');
  const idx = mots.map((m, i) => [m, i]).filter(([m]) => /^[a-zà-ÿ]{4,}$/i.test(m));
  if (!idx.length) return texte;
  const [mot, i] = choisir(idx);
  const p = entier(1, mot.length - 2);
  const c = mot[p].toLowerCase();
  let nouveau;
  if (AZERTY[c] && proba(0.6)) nouveau = mot.slice(0, p) + choisir([...AZERTY[c]]) + mot.slice(p + 1);
  else if (proba(0.5)) nouveau = mot.slice(0, p) + mot.slice(p + 1);                 // lettre oubliée
  else nouveau = mot.slice(0, p) + mot[p + 1] + mot[p] + mot.slice(p + 2);          // inversion
  mots[i] = nouveau;
  return mots.join(' ');
}

function repeterLettre(texte) {
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
export function couper(texte, max) {
  const car = [...texte];
  if (car.length <= max) return texte;
  let t = car.slice(0, max).join('');
  const i = t.lastIndexOf(' ');
  if (i > max * 0.5) t = t.slice(0, i);
  return t.replace(/[\s,;:–-]+$/, '');
}

/** Nettoyage du texte brut produit par un LLM (avant la voix). */
export function nettoyerLLM(texte) {
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
 * @param {string} texte
 * @param {object} persona  persona normalisé (banques.mjs)
 * @param {{leger?: boolean, max?: number}} o  leger = textes écrits par l'auteur (pas de fautes, pas de tic)
 */
export function styliser(texte, persona, { leger = false, max = 80 } = {}) {
  const v = persona?.voix || {};
  let t = leger ? String(texte).trim() : nettoyerLLM(texte);
  if (!t) return '';
  if (!leger) {
    const abrev = { ...ABREV_COMMUNES, ...(v.abreviations || {}) };
    for (const [de, vers] of Object.entries(abrev)) {
      if (de === vers || !proba(0.7)) continue;
      t = t.replace(new RegExp(`\\b${de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), vers);
    }
    if (proba(v.fautes || 0)) {
      const typiques = (v.fautes_typiques || []).filter(([a]) => t.includes(a));
      if (typiques.length && proba(0.7)) { const [a, b] = choisir(typiques); t = t.replace(a, b); }
      else if (proba(0.5)) { const h = HOMOPHONES.filter(([r]) => r.test(t)); r0: if (h.length) { const [r, s] = choisir(h); r.lastIndex = 0; t = t.replace(r, s); break r0; } }
      else t = fauteClavier(t);
      for (const [r] of HOMOPHONES) r.lastIndex = 0;
    }
    if (proba(1 - (v.accents ?? 1))) t = sansAccents(t);           // accents = probabilité de les garder
    if (proba(v.repetition_lettres ?? 0.15)) t = repeterLettre(t);
    if (!proba(v.point_final || 0)) t = t.replace(/(?<!\.)\.$/, '');
    if (v.tics?.length && proba(v.tic_proba || 0) && !t.toLowerCase().includes(v.tics[0].toLowerCase())) {
      const tic = choisir(v.tics);
      t = proba(0.5) ? `${tic} ${t}` : `${t} ${tic}`;
    }
  }
  // casse
  if (v.casse === 'minuscules' && !leger) t = t.toLowerCase();
  if (proba(leger ? (v.cris || 0) * 0.3 : (v.cris || 0))) t = t.toUpperCase();
  // emojis et émotes (pas de doublon si le texte en contient déjà)
  if (!EMOJI.test(t) && v.emojis?.length && proba((v.emojis_par_msg || 0) * (leger ? 0.4 : 1))) {
    const e = choisir(v.emojis);
    t = `${t} ${proba(0.25) ? e.repeat(entier(2, 3)) : e}`;
  } else if (!leger && v.emotes?.length && proba(0.08)) {
    t = `${t} ${choisir(v.emotes)}`;
  }
  const maxPersona = Math.min(max, Math.max(10, (v.longueur?.[1] || max) + 15));
  return couper(t.replace(/\s+/g, ' ').trim(), maxPersona);
}
