// Persistance sur disque (audit 2026-10, rapport 5 §4.5 et §4.6) :
// - instantané : exploitation/etat/<run>.instantane.json, écrit de façon atomique (.tmp puis rename) au plus 200 ms
//   après un changement, et à l'arrêt (écriture synchrone) ;
// - journal : exploitation/journaux/<run>.jsonl, une ligne par événement, ajout SYNCHRONE (rien n'est perdu si le
//   processus s'arrête net, l'ordre est garanti) ;
// - au démarrage : le plus récent instantané est relu (sauf SANS_REPRISE=1).
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, statfsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EtatRepresentation, EvenementJournal } from '../noyau';

/** Fichier d'instantané : l'état du noyau et ce que l'hôte veut retrouver. */
export interface FichierInstantane {
  format: 'studio-real/instantane-hote@1';
  /** heure d'écriture */
  ecrit: number;
  version: string | null;
  /** redémarrages du serveur pendant cette représentation */
  redemarrages: number;
  etat: EtatRepresentation;
}

const RE_RUN = /^[A-Za-z0-9_-]{1,80}$/;
const nomRun = (run: string | null) => (run && RE_RUN.test(run) ? run : 'hors-representation');

export class Persistance {
  readonly dossierEtat: string;
  readonly dossierJournaux: string;
  private minuterie: ReturnType<typeof setTimeout> | null = null;
  private source: (() => FichierInstantane) | null = null;
  private derniereEcriture = 0;
  private dernierJournal: string | null = null;

  constructor(dossierExploitation: string, private readonly delaiMs = 200) {
    this.dossierEtat = join(dossierExploitation, 'etat');
    this.dossierJournaux = join(dossierExploitation, 'journaux');
    mkdirSync(this.dossierEtat, { recursive: true });
    mkdirSync(this.dossierJournaux, { recursive: true });
  }

  fichierInstantane(run: string | null) { return join(this.dossierEtat, `${nomRun(run)}.instantane.json`); }
  fichierJournal(run: string | null) { return join(this.dossierJournaux, `${nomRun(run)}.jsonl`); }

  /** Ajoute les événements au journal de leur représentation (synchrone). */
  journaliser(evenements: EvenementJournal[]) {
    if (!evenements.length) return;
    const parFichier = new Map<string, string[]>();
    for (const e of evenements) {
      const f = this.fichierJournal(e.run);
      if (!parFichier.has(f)) parFichier.set(f, []);
      parFichier.get(f)!.push(JSON.stringify(e));
    }
    for (const [f, lignes] of parFichier) {
      appendFileSync(f, lignes.join('\n') + '\n', 'utf8');
      this.dernierJournal = f;
    }
  }

  /** Demande une écriture de l'instantané : au plus `delaiMs` après le premier changement non écrit. */
  planifier(source: () => FichierInstantane) {
    this.source = source;
    if (this.minuterie) return;
    this.minuterie = setTimeout(() => {
      this.minuterie = null;
      if (this.source) this.ecrire(this.source());
    }, this.delaiMs);
  }

  /** Écrit l'instantané tout de suite (arrêt, exception), de façon atomique. */
  ecrire(f: FichierInstantane) {
    const fichier = this.fichierInstantane(f.etat.run?.id ?? null);
    const tmp = `${fichier}.tmp`;
    writeFileSync(tmp, JSON.stringify(f), 'utf8');
    for (let essai = 0; ; essai++) {
      try { renameSync(tmp, fichier); break; } catch (e) {
        // Windows : un antivirus ou un indexeur peut tenir le fichier un instant.
        if (essai >= 5) throw e;
        const fin = Date.now() + 20;
        while (Date.now() < fin) { /* attente brève */ }
      }
    }
    this.derniereEcriture = Date.now();
  }

  /** Écrit ce qui attend (s'il y a lieu) et arrête la minuterie. */
  vider() {
    if (this.minuterie) clearTimeout(this.minuterie);
    this.minuterie = null;
    if (this.source) this.ecrire(this.source());
  }

  /** Arrête la minuterie sans écrire. */
  arreter() {
    if (this.minuterie) clearTimeout(this.minuterie);
    this.minuterie = null;
  }

  /** Le plus récent instantané lisible, ou null. */
  dernier(): { fichier: string; contenu: FichierInstantane } | null {
    if (!existsSync(this.dossierEtat)) return null;
    const fichiers = readdirSync(this.dossierEtat)
      .filter(f => f.endsWith('.instantane.json'))
      .map(f => join(this.dossierEtat, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    for (const fichier of fichiers) {
      try {
        const contenu = JSON.parse(readFileSync(fichier, 'utf8')) as FichierInstantane;
        if (contenu?.format === 'studio-real/instantane-hote@1' && contenu.etat) return { fichier, contenu };
      } catch { /* fichier abîmé : on essaie le précédent */ }
    }
    return null;
  }

  /** Pour la supervision : âge de l'instantané, taille du journal courant, espace libre. */
  etat() {
    let octetsJournal: number | null = null;
    let disqueLibreMo: number | null = null;
    try { if (this.dernierJournal) octetsJournal = statSync(this.dernierJournal).size; } catch { /* rien */ }
    try { const s = statfsSync(this.dossierJournaux); disqueLibreMo = Math.round((s.bavail * s.bsize) / 1048576); } catch { /* rien */ }
    return { ageInstantaneMs: this.derniereEcriture ? Date.now() - this.derniereEcriture : null, octetsJournal, disqueLibreMo };
  }
}
