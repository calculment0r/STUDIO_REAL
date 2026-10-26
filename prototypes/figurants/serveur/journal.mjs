// Journal JSONL : serveur/journaux/AAAA-MM-JJ.jsonl (un fichier par jour, heure locale), une ligne par événement.
// Écriture synchrone en ajout : l'ordre est garanti et rien n'est perdu si le processus s'arrête net.

import fs from 'node:fs';
import path from 'node:path';
import { dateLocale } from './util.mjs';

export class Journal {
  constructor(dossier) {
    this.dossier = dossier;
    fs.mkdirSync(dossier, { recursive: true });
    this.ecouteurs = [];
    this.session = Math.random().toString(36).slice(2, 8);
  }
  fichier(d = new Date()) { return path.join(this.dossier, `${dateLocale(d)}.jsonl`); }
  ecouter(fn) { this.ecouteurs.push(fn); }
  ecrire(evt) {
    const ligne = { ts: Date.now(), s: this.session, ...evt };
    try { fs.appendFileSync(this.fichier(), JSON.stringify(ligne) + '\n'); } catch (e) { console.error('journal :', e.message); }
    for (const fn of this.ecouteurs) { try { fn(ligne); } catch { /* rien */ } }
    return ligne;
  }
}
