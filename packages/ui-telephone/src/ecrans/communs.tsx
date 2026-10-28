// Ce que partagent les écrans : le contrat d'un écran, et de petits lecteurs de réglages (les `params` d'une vue sont
// des données du projet : on les lit avec méfiance, un réglage absent ou abîmé prend sa valeur par défaut).
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import type { Action, VueEcran } from '../machine';
import type { Capacites } from '../capacites';

/** Ce qu'un écran sait des médias : l'UNIQUE élément <video> du téléphone (iOS limite les décodeurs, et le déblocage
 *  par geste vaut pour cet élément), l'adresse d'un média (URL blob préchargée ou source réseau). */
export interface MediasEcran {
  /** null hors navigateur (tests, agent de la foule de l'émulateur) */
  video: HTMLVideoElement | null;
  url(asset: string, sources?: readonly string[]): string | null;
  /** Cache Storage indisponible : la vidéo se charge par le réseau (preload=auto) */
  repli: boolean;
  /** à appeler DANS un geste (validation du pseudo) : débloque la vidéo et le son pour la suite (iOS) */
  debloquer?: () => void;
}

/** Un écran : un composant pur de sa vue. Il ne parle au monde que par `agir` (et l'élément vidéo prêté). */
export interface ProprietesEcran {
  vue: VueEcran;
  agir: (a: Action) => void;
  capacites: Capacites;
  medias: MediasEcran;
}
export type Ecran = (p: ProprietesEcran) => ReactElement;

// ── Lecture des réglages ───────────────────────────────────────────────────────────────────────────────────────────

export function texte(params: Record<string, unknown>, cle: string, defaut = ''): string {
  const v = params[cle];
  if (typeof v === 'string') return v.slice(0, 2000);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return defaut;
}
export function nombre(params: Record<string, unknown>, cle: string): number | null {
  const v = params[cle];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
export function textes(x: unknown, max = 200): string[] {
  return Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, max).map(s => s.slice(0, 2000)) : [];
}
export function nombres(x: unknown, max = 26): number[] {
  return Array.isArray(x) ? x.slice(0, max).map(n => (typeof n === 'number' && Number.isFinite(n) ? n : 0)) : [];
}

/** Adresse d'image ou de logo acceptée : chemin du site, http(s), blob, ou image en data. */
export function adresseImage(x: unknown): string | null {
  if (typeof x !== 'string' || x.length > 4096) return null;
  return /^(\/|\.\/|https?:\/\/|blob:|data:image\/)/i.test(x) ? x : null;
}

/** Couleur d'un réglage : un nom de jeton du thème ('--ort', 'ort') ou un #rvb / #rrvvbb ; sinon le repli. */
export function couleur(x: unknown, repli = '--ort'): string {
  if (typeof x === 'string') {
    const s = x.trim();
    if (/^--[a-z0-9-]{1,32}$/.test(s)) return `var(${s})`;
    if (/^[a-z][a-z0-9-]{0,31}$/.test(s)) return `var(--${s})`;
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s;
  }
  return `var(${repli})`;
}

export const LETTRES = ['A', 'B', 'C', 'D', 'E', 'F'];

/** MM:SS (un temps s'écrit sans décimale). */
export function mmss(secondes: number): string {
  const s = Math.max(0, Math.ceil(secondes));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Heure qui avance (chronos, compteurs) ; au premier rendu, l'heure de départ donnée (rendu stable, testable). */
export function useMaintenant(depart: number, actif: boolean, pasMs = 250): number {
  const [t, setT] = useState(depart || 0);
  useEffect(() => {
    if (!actif) return;
    setT(Date.now());
    const id = setInterval(() => setT(Date.now()), pasMs);
    return () => clearInterval(id);
  }, [actif, pasMs]);
  return t;
}

/** Micro-étiquette (Azeret Mono capitales). */
export function Etiquette({ children, ton }: { children: ReactNode; ton?: 'ort' | 'cy' | 'ink3' }) {
  return <span className={`tl-et${ton ? ` ${ton}` : ''}`}>{children}</span>;
}
