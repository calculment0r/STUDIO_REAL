// Anti-répétition (port de similarite.mjs ; étude §6.5) : quasi-doublon si le Jaccard des trigrammes de caractères
// est ≥ 0,5 ou si les 3 premiers mots sont les mêmes, contre les messages de figurants des 3 dernières minutes.
// Textes très courts (« oui », « GG ») : doublon seulement s'ils sont identiques dans les 20 dernières secondes.

export const FENETRE_MS = 180_000;
export const FENETRE_COURT_MS = 20_000;

export function cleTexte(s: string): string {
  return String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/([a-z])\1+/g, '$1').replace(/\s+/g, ' ').trim();
}

function trigrammes(s: string): Set<string> {
  const t = ` ${s} `;
  const g = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) g.add(t.slice(i, i + 3));
  return g;
}

export function jaccard(a: string, b: string): number {
  const A = trigrammes(a);
  const B = trigrammes(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

export interface EntreeHistorique { texte: string; cle?: string; ts: number }

export function quasiDoublon(texte: string, historique: readonly EntreeHistorique[], maintenant = Date.now()): { avec: string; score: number } | null {
  const k = cleTexte(texte);
  if (!k) return null;   // emojis seuls : laissés à la vague / au hasard
  const mots = k.split(' ');
  for (let i = historique.length - 1; i >= 0; i--) {
    const h = historique[i]!;
    const age = maintenant - h.ts;
    if (age > FENETRE_MS) break;
    const kh = h.cle ?? cleTexte(h.texte);
    if (!kh) continue;
    if (k.length < 6 || kh.length < 6) {
      if (k === kh && age <= FENETRE_COURT_MS) return { avec: h.texte, score: 1 };
      continue;
    }
    if (mots.length >= 3 && kh.split(' ').slice(0, 3).join(' ') === mots.slice(0, 3).join(' ')) return { avec: h.texte, score: 1 };
    const s = jaccard(k, kh);
    if (s >= 0.5) return { avec: h.texte, score: +s.toFixed(2) };
  }
  return null;
}
