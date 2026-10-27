// Pictogrammes de la coquille (tracés du design). Couleur : currentColor.

export const CHEVRON = <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M2 1 L6 4 L2 7" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>;

export const IcoDebut = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="1.5" width="1.6" height="9" fill="currentColor" /><path d="M11 1.5 L4 6 L11 10.5 Z" fill="currentColor" /></svg>
);
export const IcoPause = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1.5" width="2.6" height="9" fill="currentColor" /><rect x="7.4" y="1.5" width="2.6" height="9" fill="currentColor" /></svg>
);
export const IcoLecture = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.2 L11 6 L2.5 10.8 Z" fill="currentColor" /></svg>
);
export const IcoVerrou = ({ ferme }: { ferme: boolean }) => (
  <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden="true">
    <rect x="1" y="5" width="9" height="6.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <path d={ferme ? 'M3 5V3.5a2.5 2.5 0 0 1 5 0V5' : 'M3 5V3.5a2.5 2.5 0 0 1 5 0'} fill="none" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);
export const IcoPupitre = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="1.5" y="2.5" width="11" height="7" rx="1" /><path d="M4.5 12h5M7 9.5V12" />
  </svg>
);
export const IcoAller = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 3.5h6M2 7h6M2 10.5h4" /><path d="M10 5l2.5 2-2.5 2" />
  </svg>
);
export const IcoPleinEcran = ({ actif }: { actif: boolean }) => actif ? (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
    <path d="M5 1.5 V5 H1.5" /><path d="M12.5 5 H9 V1.5" /><path d="M9 12.5 V9 H12.5" /><path d="M1.5 9 H5 V12.5" />
  </svg>
) : (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
    <path d="M1.5 5 V1.5 H5" /><path d="M9 1.5 H12.5 V5" /><path d="M12.5 9 V12.5 H9" /><path d="M5 12.5 H1.5 V9" />
  </svg>
);
export const IcoLoupe = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
    <circle cx="6" cy="6" r="4" /><path d="M9 9l3.5 3.5" />
  </svg>
);
export const IcoTheme = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M7 1.8 A5.2 5.2 0 0 1 7 12.2 Z" fill="currentColor" />
  </svg>
);
export const Picto = ({ d, taille = 13, epaisseur = 1.7 }: { d: string; taille?: number; epaisseur?: number }) => (
  <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth={epaisseur} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const Points = () => (
  <svg width="6" height="22" viewBox="0 0 6 22" aria-hidden="true">
    <circle cx="3" cy="2" r="1.2" fill="currentColor" /><circle cx="3" cy="7" r="1.2" fill="currentColor" /><circle cx="3" cy="12" r="1.2" fill="currentColor" /><circle cx="3" cy="17" r="1.2" fill="currentColor" />
  </svg>
);
export const Poignee = () => (
  <svg width="8" height="12" viewBox="0 0 8 12" style={{ flex: 'none', color: 'var(--ink3)' }} aria-hidden="true">
    <circle cx="2" cy="2" r="1" fill="currentColor" /><circle cx="6" cy="2" r="1" fill="currentColor" /><circle cx="2" cy="6" r="1" fill="currentColor" />
    <circle cx="6" cy="6" r="1" fill="currentColor" /><circle cx="2" cy="10" r="1" fill="currentColor" /><circle cx="6" cy="10" r="1" fill="currentColor" />
  </svg>
);

/** Vues : planche seule, planche et conduite, conduite seule. */
export const VUES: ['board' | 'both' | 'tracks', string, string][] = [
  ['board', 'Planche seule', 'M2 2h12v12H2z'],
  ['both', 'Planche et conduite', 'M2 2h12v6H2zM2 10h12v4H2z'],
  ['tracks', 'Conduite seule', 'M2 3h12M2 7h12M2 11h12'],
];
