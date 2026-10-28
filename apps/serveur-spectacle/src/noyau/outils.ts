// Petits outils PURS du noyau (aucune dépendance à Node : le noyau doit pouvoir tourner dans un Durable Object).

/** Copie profonde d'une donnée JSON (l'état du noyau n'est fait que de données JSON). */
export const cloner = <T>(x: T): T => (x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T));

/** JSON à clés triées : deux objets égaux donnent le même texte, quel que soit l'ordre d'insertion des clés. */
export function jsonStable(x: unknown): string {
  if (x === null || typeof x !== 'object') return JSON.stringify(x) ?? 'null';
  if (Array.isArray(x)) return `[${x.map(v => (v === undefined ? 'null' : jsonStable(v))).join(',')}]`;
  const o = x as Record<string, unknown>;
  return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${jsonStable(o[k])}`).join(',')}}`;
}

/** Empreinte rapide (FNV-1a 32 bits et une seconde passe) : 16 caractères hexadécimaux. Pas une empreinte de sécurité. */
export function empreinte(texte: string): string {
  let a = 0x811c9dc5;
  let b = (0x01000193 ^ texte.length) >>> 0;
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c ^ (i & 0xff), 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** Empreinte d'une donnée JSON (clés triées). */
export const empreinteDe = (x: unknown): string => empreinte(jsonStable(x));

/** Lettre d'une réponse : 0 → 'A', 1 → 'B'… (comme les issues 'A' | 'B' du lecteur). */
export const lettre = (index: number): string => String.fromCharCode(65 + index);

/** Identifiant d'une représentation : r20261028-203512-4f2a (heure UTC du lancement + 4 hexadécimaux tirés). */
export function idRepresentation(ms: number, alea: () => number): string {
  const d = new Date(ms).toISOString();
  const jour = d.slice(0, 10).replace(/-/g, '');
  const heure = d.slice(11, 19).replace(/:/g, '');
  const suffixe = Math.floor(alea() * 0x10000).toString(16).padStart(4, '0');
  return `r${jour}-${heure}-${suffixe}`;
}
