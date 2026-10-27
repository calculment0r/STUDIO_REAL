// Accès D1 : projets, versions, exécutions. Toutes les écritures de versions passent par le Durable Object
// du projet (sérialisation), qui appelle `enregistrerVersion` ; le contrôle de conflit est fait ici, en SQL.
import type { CategorieAssets, Execution, Projet } from '@studio-real/modele';
import { ErreurHttp } from './http';

export interface LigneProjet {
  id: string; titre: string; version: number; contenu: string; assets: string;
  cree_le: number; modifie_le: number; modifie_par: string | null;
}

export type ResultatEnregistrement =
  | { ok: true; version: number }
  | { ok: false; version_actuelle: number };

export const titreDe = (p: Projet) => (typeof p.titre === 'string' && p.titre.trim() ? p.titre.trim().slice(0, 200) : 'Sans titre');

export async function lireProjet(db: D1Database, id: string): Promise<LigneProjet | null> {
  return db.prepare('SELECT id, titre, version, contenu, assets, cree_le, modifie_le, modifie_par FROM projets WHERE id = ?').bind(id).first<LigneProjet>();
}

export async function creerProjet(
  db: D1Database,
  o: { id: string; jetonHash: string; projet: Projet; assets: CategorieAssets[]; auteur: string; maxTaille: number },
): Promise<void> {
  const contenu = JSON.stringify(o.projet);
  const assets = JSON.stringify(o.assets);
  const taille = contenu.length + assets.length;
  if (taille > o.maxTaille) throw new ErreurHttp(413, 'projet-trop-gros', `projet > ${o.maxTaille} octets`);
  const t = Date.now();
  await db.batch([
    db.prepare('INSERT INTO projets (id, titre, jeton_hash, version, contenu, assets, cree_le, modifie_le, modifie_par) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)')
      .bind(o.id, titreDe(o.projet), o.jetonHash, contenu, assets, t, t, o.auteur),
    db.prepare('INSERT INTO versions (projet_id, version, contenu, assets, auteur, message, taille, cree_le) VALUES (?, 1, ?, ?, ?, ?, ?, ?)')
      .bind(o.id, contenu, assets, o.auteur, 'création', taille, t),
  ]);
}

/**
 * Enregistre une nouvelle version SI la version actuelle vaut `base` (contrôle de conflit optimiste).
 * Les deux écritures sont dans un même lot D1 (transaction) ; l'insertion de l'historique n'a lieu que si la mise
 * à jour a touché une ligne.
 */
export async function enregistrerVersion(
  db: D1Database,
  o: { id: string; base: number; projet: Projet; assets?: CategorieAssets[]; auteur: string; message?: string; maxTaille: number },
): Promise<ResultatEnregistrement> {
  const contenu = JSON.stringify(o.projet);
  const assets = o.assets === undefined ? null : JSON.stringify(o.assets);
  const taille = contenu.length + (assets?.length ?? 0);
  if (taille > o.maxTaille) throw new ErreurHttp(413, 'projet-trop-gros', `projet > ${o.maxTaille} octets (limite D1 : 2 Mo par ligne)`);
  const t = Date.now();
  const [maj] = await db.batch([
    db.prepare('UPDATE projets SET version = version + 1, contenu = ?, assets = COALESCE(?, assets), titre = ?, modifie_le = ?, modifie_par = ? WHERE id = ? AND version = ?')
      .bind(contenu, assets, titreDe(o.projet), t, o.auteur, o.id, o.base),
    db.prepare(`INSERT INTO versions (projet_id, version, contenu, assets, auteur, message, taille, cree_le)
                SELECT id, version, contenu, assets, ?, ?, ?, ? FROM projets WHERE id = ? AND version = ? AND changes() > 0`)
      .bind(o.auteur, o.message ?? null, taille, t, o.id, o.base + 1),
  ]);
  if (maj && maj.meta.changes === 1) return { ok: true, version: o.base + 1 };
  const ligne = await db.prepare('SELECT version FROM projets WHERE id = ?').bind(o.id).first<{ version: number }>();
  if (!ligne) throw new ErreurHttp(404, 'introuvable', 'projet introuvable');
  return { ok: false, version_actuelle: ligne.version };
}

export async function lireRuns(db: D1Database, projetId: string, avecEvenements: boolean): Promise<Execution[]> {
  const { results } = await db.prepare('SELECT id, mode, debut FROM runs WHERE projet_id = ? ORDER BY debut').bind(projetId).all<{ id: string; mode: Execution['mode']; debut: number }>();
  if (!avecEvenements) return results.map((r) => ({ ...r, evenements: [] }));
  const runs: Execution[] = [];
  for (const r of results) runs.push({ ...r, evenements: await lireEvenements(db, projetId, r.id) });
  return runs;
}

export async function lireEvenements(db: D1Database, projetId: string, runId: string): Promise<Execution['evenements']> {
  const { results } = await db.prepare('SELECT donnees FROM evenements WHERE projet_id = ? AND run_id = ? ORDER BY n').bind(projetId, runId).all<{ donnees: string }>();
  return results.map((e) => JSON.parse(e.donnees) as Execution['evenements'][number]);
}

/** Crée l'exécution si elle n'existe pas (idempotent sur l'id). Renvoie true si créée. */
export async function creerRun(db: D1Database, projetId: string, r: Pick<Execution, 'id' | 'mode' | 'debut'>): Promise<boolean> {
  const res = await db.prepare('INSERT OR IGNORE INTO runs (projet_id, id, mode, debut, cree_le) VALUES (?, ?, ?, ?, ?)')
    .bind(projetId, r.id, r.mode, r.debut, Date.now()).run();
  return res.meta.changes === 1;
}

/** Ajoute des événements aux rangs premier, premier+1… ; les rangs déjà présents sont ignorés (renvoi sans doublon). */
export async function ajouterEvenements(
  db: D1Database, projetId: string, runId: string, premier: number, evenements: Execution['evenements'],
): Promise<{ recus: number; ignores: number; total: number }> {
  let recus = 0;
  if (evenements.length) {
    const stmt = db.prepare('INSERT OR IGNORE INTO evenements (projet_id, run_id, n, t, type, donnees) VALUES (?, ?, ?, ?, ?, ?)');
    const res = await db.batch(evenements.map((e, i) => stmt.bind(projetId, runId, premier + i, e.t, e.type, JSON.stringify(e))));
    recus = res.reduce((s, r) => s + r.meta.changes, 0);
  }
  const total = await db.prepare('SELECT COUNT(*) AS n FROM evenements WHERE projet_id = ? AND run_id = ?').bind(projetId, runId).first<{ n: number }>();
  return { recus, ignores: evenements.length - recus, total: total?.n ?? 0 };
}
