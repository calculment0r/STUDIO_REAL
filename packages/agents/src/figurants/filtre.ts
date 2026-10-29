// Garde-fou LOCAL des répliques de figurants. Ce n'est pas la modération du prototype (moderation.mjs, listes d'interdits) :
// le filtre qui fait foi est celui du serveur de spectacle, qui refiltre tout `agent.in{k:'say'}` avant le mur. L'agent ne
// jette ici que ce qui ne doit jamais partir, même vers le serveur : texte vide ou trop long, données personnelles,
// format technique qui fuit (JSON, balises), mention d'une personne, nombre de 4 chiffres, et les sujets à ne pas révéler
// du segment courant (spoilers).
import { cleTexte } from './similarite';

export const LONGUEUR_MAX = 80;

/** Nettoyage d'affichage : NFKC, sans caractères de contrôle ni invisibles, espaces resserrés. */
export function nettoyer(texte: unknown): string {
  return String(texte ?? '')
    .normalize('NFKC')
    .replace(/[​-‏‪-‮⁠-⁤﻿­]/g, '')
    .replace(/[\p{Cc}\p{Cs}\p{Co}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function base(s: string): string {
  return nettoyer(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

const RE_URL = [
  /\b(?:https?|ftp)\s*:\s*\/\s*\//,
  /\bwww\s*\./,
  /\b[a-z0-9-]{2,}\s*(?:\.|\(\s*(?:dot|point)\s*\)|\[\s*(?:dot|point)\s*\]|\s(?:dot|point)\s)\s*(?:com|fr|net|org|io|gg|tv|be|ch|ly|me|xyz|co|info|biz|app|link|site|online|ru|de|uk|eu|sh|to|cc|tk|live|stream|shop)\b/,
  /\b(?:discord|t\.me|telegram|onlyfans|bit\.ly|tinyurl)\b/,
];
const RE_MAIL = /[a-z0-9._%+-]+\s*(?:@|\(\s*at\s*\)|\[\s*at\s*\]|\sarobase\s)\s*[a-z0-9-]+\s*(?:\.|\spoint\s)\s*[a-z]{2,}/;
const RE_TEL = /(?:\+?\d[\s.\-()/]{0,2}){9,}/;
const RE_CHIFFRES = /\d[\s.\-]?\d[\s.\-]?\d[\s.\-]?\d/;

export interface VerdictLocal { ok: boolean; texte: string; raison?: string }

/**
 * @param interdits sujets à ne pas révéler (déjà sous la forme de `cleTexte`) ; une réplique qui en contient un est jetée
 */
export function verifierLocal(texte: string, interdits: readonly string[] = []): VerdictLocal {
  const t = nettoyer(texte);
  if (!t) return { ok: false, texte: t, raison: 'vide' };
  if ([...t].length > LONGUEUR_MAX) return { ok: false, texte: t, raison: 'longueur' };
  const b = base(t);
  if (RE_MAIL.test(b)) return { ok: false, texte: t, raison: 'email' };
  if (RE_URL.some(r => r.test(b))) return { ok: false, texte: t, raison: 'url' };
  if (RE_TEL.test(b)) return { ok: false, texte: t, raison: 'telephone' };
  if (RE_CHIFFRES.test(b)) return { ok: false, texte: t, raison: 'chiffres' };
  // pas de format technique qui fuit (« <3 » reste permis) ni de « @pseudo » vers une personne réelle
  if (/[{}]|<\/?[a-z]|"persona"|"texte"/i.test(t)) return { ok: false, texte: t, raison: 'format' };
  if (/(^|\s)@\w/.test(t)) return { ok: false, texte: t, raison: 'mention' };
  if (interdits.length) {
    const k = ` ${cleTexte(t)} `;
    if (interdits.some(x => k.includes(` ${x} `))) return { ok: false, texte: t, raison: 'segment' };
  }
  return { ok: true, texte: t };
}
