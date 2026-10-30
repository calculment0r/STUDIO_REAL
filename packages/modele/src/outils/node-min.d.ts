// Déclarations minimales des modules Node utilisés par verifier-projets.ts (le dépôt n'installe pas @types/node).
declare module 'node:fs' {
  export function readFileSync(chemin: string, encodage: 'utf8'): string;
  export function readdirSync(chemin: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean; isFile(): boolean }[];
  export function existsSync(chemin: string): boolean;
}
declare module 'node:path' {
  export function join(...parties: string[]): string;
  export function dirname(chemin: string): string;
  export function relative(de: string, vers: string): string;
}
declare module 'node:url' {
  export function fileURLToPath(adresse: string | URL): string;
}
