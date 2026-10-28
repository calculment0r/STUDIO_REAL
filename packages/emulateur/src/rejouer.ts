// Rejeu d'un journal de représentation (exploitation/journaux/<run>.jsonl, écrit par le serveur de spectacle) dans la
// salle émulée : chaque personne du journal devient un téléphone émulé (même personne, même session), et ses entrées
// (votes, textes, prêt, présence, fin de vidéo, réactions) sont rejouées PAR SA MACHINE D'ÉTAT, à l'heure du journal
// en temps ÉMULÉ (le noyau compte ses étapes sur la même horloge) : la vitesse du rejeu est celle de l'horloge (×1 à
// ×20 dans le Conducteur, instantanée sous vitest). Les ordres de la régie (lancer, top, aller à, forcer, panique…)
// sont rejoués par la régie émulée. Une entrée que la machine refuse (l'écran n'est pas le même au moment du rejeu) est comptée `refusees` :
// c'est l'écart entre la soirée et sa répétition.
import type { EvenementJournal } from '@studio-real/serveur-spectacle';
import type { OpConduite } from '@studio-real/protocole';
import type { Ordonnanceur } from './horloge';
import type { TelephoneSalle } from './agent';
import type { SalleEmulee } from './salle';
import type { RapportRejeu } from './types';

export interface HoteRejeu {
  horloge: Ordonnanceur;
  salle: SalleEmulee;
  demarrer(): Promise<void>;
  /** le téléphone d'une personne du journal (créé au besoin) */
  telephone(personne: string, session: string, acteur: string): TelephoneSalle;
}

const RE_ID = /^[A-Za-z0-9_-]{6,64}$/;

function estEvenement(x: unknown): x is EvenementJournal {
  return !!x && typeof x === 'object' && typeof (x as EvenementJournal).ts === 'number' && typeof (x as EvenementJournal).type === 'string';
}

function lignes(texte: string): unknown[] {
  const out: unknown[] = [];
  for (const l of texte.split(/\r?\n/)) {
    const t = l.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* ligne illisible : ignorée */ }
  }
  return out;
}

/** Lit un journal : texte JSONL, ou suite (synchrone ou non) de lignes de texte et / ou d'objets. */
export async function lireJournal(journal: AsyncIterable<unknown> | Iterable<unknown> | string): Promise<EvenementJournal[]> {
  const brut: unknown[] = [];
  const prendre = (x: unknown) => { if (typeof x === 'string') brut.push(...lignes(x)); else brut.push(x); };
  if (typeof journal === 'string') prendre(journal);
  else if (Symbol.asyncIterator in (journal as object)) for await (const x of journal as AsyncIterable<unknown>) prendre(x);
  else for (const x of journal as Iterable<unknown>) prendre(x);
  return brut.filter(estEvenement).filter(e => e.src === undefined || e.src === 'serveur').sort((a, b) => a.ts - b.ts);
}

const texte = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined);

export async function rejouerJournal(
  hote: HoteRejeu,
  journal: AsyncIterable<unknown> | Iterable<unknown> | string,
  o: { avancer?: boolean } = {},
): Promise<RapportRejeu> {
  const evenements = await lireJournal(journal);
  await hote.demarrer();
  const rapport: RapportRejeu = { entrees: 0, rejouees: 0, refusees: 0, personnes: 0, dureeMs: 0 };
  if (!evenements.length) return rapport;
  const t0 = evenements[0]!.ts;
  rapport.dureeMs = evenements[evenements.length - 1]!.ts - t0;
  const parSession = new Map<string, TelephoneSalle>();
  const personnes = new Set<string>();
  const { horloge, salle } = hote;

  const jouer = (e: EvenementJournal): boolean | null => {
    switch (e.type) {
      case 'lancer': {
        const mode = e.mode === 'scene' ? 'scene' : 'repetition';
        salle.lancer(mode, typeof e.graine === 'number' ? e.graine : undefined);
        return true;
      }
      case 'conduite': {
        const { ts: _ts, run: _run, src: _src, type: _type, session: _session, ...op } = e;
        if (op.op === 'lancer' || typeof op.op !== 'string') return null;   // le lancement vient de l'événement 'lancer'
        return salle.conduite(op as unknown as OpConduite).statut === 'ok';
      }
      case 'forcer': {
        const acteur = texte(e.cible), ecran = texte(e.ecran);
        if (!acteur || !ecran) return null;
        const params = e.params && typeof e.params === 'object' ? e.params as Record<string, unknown> : {};
        return salle.conduite({ op: 'forcer', acteur, vue: { ecran, params } }).statut === 'ok';
      }
      case 'panique':
        return salle.conduite({ op: 'panique', actif: e.actif !== false }).statut === 'ok';
      case 'connexion': {
        if (e.role !== 'acteur') return null;
        const session = texte(e.session), acteur = texte(e.acteur);
        if (!session || !acteur || !RE_ID.test(session)) return null;
        const personne = texte(e.personne) && RE_ID.test(String(e.personne)) ? String(e.personne) : session;
        const t = hote.telephone(personne, session, acteur);
        parSession.set(session, t);
        personnes.add(personne);
        if (!t.arrive) t.arriver();
        else if (t.coupe) t.retablir();
        return true;
      }
      case 'deconnexion': {
        if (e.role !== 'acteur') return null;
        const t = parSession.get(String(e.session));
        if (!t) return null;
        t.couper();
        return true;
      }
      case 'entree': {
        if (e.k === 'etat' || e.k === 'accuse') return null;
        const personne = texte(e.personne);
        const t = [...parSession.values()].find(x => x.personne === personne);
        if (!t || !t.magasin) return false;
        switch (e.k) {
          case 'vote': return typeof e.index === 'number' && t.voterIndex(e.index);
          case 'texte': return typeof e.texte === 'string' && t.ecrireTexte(e.texte);
          case 'pret': t.action({ a: 'pret', pret: e.pret !== false }); return true;
          case 'presence': t.poserVisible(e.visible !== false); return true;
          case 'fin-video': t.action({ a: 'fin-video', asset: String(e.asset ?? '') }); return true;
          case 'reaction': t.action({ a: 'reagir', emoji: String(e.emoji ?? '') }); return true;
          default: return null;
        }
      }
      default:
        return null;
    }
  };

  let derniere = 0;
  for (const e of evenements) {
    const at = e.ts - t0;
    derniere = Math.max(derniere, at);
    horloge.planifier(at, () => {
      const r = jouer(e);
      if (r === null) return;
      rapport.entrees++;
      if (r) rapport.rejouees++;
      else rapport.refusees++;
      rapport.personnes = personnes.size;
    });
  }
  const fin = new Promise<RapportRejeu>(res => { horloge.planifier(derniere + 1, () => res(rapport)); });
  if (o.avancer) horloge.avancer(derniere + 2000);
  return fin;
}
