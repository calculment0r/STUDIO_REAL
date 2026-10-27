// Worker du Conducteur : API REST /api, WebSocket de la salle, et fichiers statiques (build de apps/conducteur)
// servis sur le même domaine (Workers Static Assets : voir `assets` dans wrangler.jsonc).
import { FORMAT, type FichierConducteur, type Projet } from '@studio-real/modele';
import { type Env, limites } from './env';
import { ajouterEvenements, creerProjet, creerRun, lireEvenements, lireProjet, lireRuns } from './depot';
import { auteur, avecCors, entetesCors, ErreurHttp, json, lireJson, originePermise, reponseErreur } from './http';
import { empreinte, exigerAccesProjet, exigerAdmin, nouveauJeton, nouvelId } from './securite';
import {
  RE_ID_PROJET, RE_ID_RUN, typeMediaAccepte, validerAssets, validerEvenements, validerExecution, validerFichier,
  validerNomMedia, validerProjet,
} from './logique/validation';

import type { SalleProjet } from './salle/SalleProjet';
export { SalleProjet } from './salle/SalleProjet';

const MAX_CORPS_JSON_RUNS = 1024 * 1024;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

    if (!originePermise(req, env)) return json({ erreur: 'origine-refusee', message: 'origine non autorisée' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: entetesCors(req, env) });
    try {
      const rep = await router(req, env, url);
      if (rep.status !== 101) rep.headers.set('x-content-type-options', 'nosniff');
      return avecCors(rep, req, env);
    } catch (e) {
      return avecCors(reponseErreur(e), req, env);
    }
  },
} satisfies ExportedHandler<Env>;

async function router(req: Request, env: Env, url: URL): Promise<Response> {
  const p = url.pathname.replace(/\/+$/, '').split('/').slice(2).map(decodeURIComponent); // après « /api »
  const m = req.method;

  if (p[0] === 'sante' && p.length === 1) return json({ ok: true, service: 'conducteur', format: FORMAT, ts: Date.now() });
  if (p[0] !== 'projets') throw new ErreurHttp(404, 'introuvable', 'route inconnue');

  if (p.length === 1) {
    if (m === 'GET') return listerProjets(req, env);
    if (m === 'POST') return creer(req, env);
    throw methode();
  }

  const id = p[1]!;
  if (!RE_ID_PROJET.test(id)) throw new ErreurHttp(404, 'introuvable', 'projet introuvable');
  const acces = await exigerAccesProjet(req, env, id);
  const sous = p[2];

  if (p.length === 2) {
    if (m === 'GET') return lire(env, id, url);
    if (m === 'PUT') return enregistrer(req, env, id);
    throw methode();
  }
  if (sous === 'salle' && p.length === 3) return salle(req, env, id);
  if (sous === 'export' && p.length === 3 && m === 'GET') return exporter(env, id);
  if (sous === 'versions') {
    if (p.length === 3 && m === 'GET') return listerVersions(env, id);
    if (p.length === 4 && m === 'GET') return lireVersion(env, id, p[3]!);
  }
  if (sous === 'medias') {
    if (p.length === 3 && m === 'GET') return listerMedias(env, id);
    if (p.length === 4) {
      const nom = validerNomMedia(p[3]!);
      if (m === 'PUT') return televerser(req, env, id, nom);
      if (m === 'GET' || m === 'HEAD') return lireMedia(req, env, id, nom);
      if (m === 'DELETE') { await env.MEDIAS.delete(cleMedia(id, nom)); return json({ ok: true }); }
    }
  }
  if (sous === 'runs') {
    if (p.length === 3 && m === 'GET') return json({ runs: await lireRuns(env.DB, id, false) });
    if (p.length === 3 && m === 'POST') return creerExecution(req, env, id);
    const runId = p[3]!;
    if (!RE_ID_RUN.test(runId)) throw new ErreurHttp(404, 'introuvable', 'exécution introuvable');
    if (p.length === 4 && m === 'GET') return lireExecution(env, id, runId);
    if (p.length === 5 && p[4] === 'evenements' && m === 'POST') return ajouter(req, env, id, runId);
  }
  void acces;
  throw new ErreurHttp(404, 'introuvable', 'route inconnue');
}

const methode = () => new ErreurHttp(405, 'methode', 'méthode non permise');
const salleDe = (env: Env, id: string) => env.SALLE.getByName(id);

// ───────── projets ─────────

async function listerProjets(req: Request, env: Env) {
  exigerAdmin(req, env);
  const { results } = await env.DB.prepare('SELECT id, titre, version, cree_le, modifie_le, modifie_par FROM projets ORDER BY modifie_le DESC LIMIT 500').all();
  return json({ projets: results });
}

/** Crée un projet : corps vide ou {titre}, {project, assets?}, ou un fichier d'échange complet (import). */
async function creer(req: Request, env: Env) {
  exigerAdmin(req, env);
  const corps = (await lireJson(req, limites(env).projet + 1024 * 1024)) ?? {};
  if (typeof corps !== 'object' || Array.isArray(corps)) throw new ErreurHttp(400, 'corps-invalide', 'objet JSON attendu');
  const c = corps as Record<string, unknown>;
  let fichier: FichierConducteur;
  if (c.format !== undefined) fichier = validerFichier(c);
  else {
    const projet: Projet = c.project !== undefined ? validerProjet(c.project) : projetVide();
    fichier = { format: FORMAT, project: projet, assets: validerAssets(c.assets), runs: [] };
  }
  if (typeof c.titre === 'string' && c.titre.trim()) fichier.project.titre = c.titre.trim().slice(0, 200);

  const id = nouvelId('p_', 16);
  const jeton = nouveauJeton();
  await creerProjet(env.DB, { id, jetonHash: await empreinte(jeton), projet: fichier.project, assets: fichier.assets, auteur: auteur(req), maxTaille: limites(env).projet });
  for (const r of fichier.runs) {
    await creerRun(env.DB, id, r);
    for (let i = 0; i < r.evenements.length; i += 500) await ajouterEvenements(env.DB, id, r.id, i, r.evenements.slice(i, i + 500));
  }
  return json({
    id, jeton, version: 1, titre: fichier.project.titre ?? 'Sans titre',
    avertissement: 'conservez ce jeton : il ne sera plus affiché',
    salle: `/api/projets/${id}/salle`,
  }, 201, { location: `/api/projets/${id}` });
}

function projetVide(): Projet {
  return { titre: 'Sans titre', acts: [{ n: 'Acte 1' }], ev: [], sens: { aff: 50, part: 50, calme: 50, pen: 50 }, hold: {}, go: {}, ver: 1, nid: 1, tracks: [] };
}

async function lire(env: Env, id: string, url: URL) {
  if (url.searchParams.get('direct') === '1') {
    // (types RPC : Projet contient des « unknown », non sérialisables pour TypeScript ; la valeur l'est)
    const d = (await salleDe(env, id).lireDirect(id)) as unknown as Awaited<ReturnType<SalleProjet['lireDirect']>>;
    return json({ id, ...d }, 200, { 'x-version': String(d.version) });
  }
  const l = await lireProjet(env.DB, id);
  if (!l) throw new ErreurHttp(404, 'introuvable', 'projet introuvable');
  return json({
    id, titre: l.titre, version: l.version, cree_le: l.cree_le, modifie_le: l.modifie_le, modifie_par: l.modifie_par,
    project: JSON.parse(l.contenu), assets: JSON.parse(l.assets),
  }, 200, { etag: `"v${l.version}"`, 'x-version': String(l.version) });
}

/**
 * Enregistre une version. Corps : {version_base, project, assets?, message?} (ou en-tête If-Match: "v<n>").
 * 409 si la version actuelle n'est plus `version_base` (quelqu'un a enregistré entre-temps, ou des modifications
 * en direct de la salle viennent d'être enregistrées).
 */
async function enregistrer(req: Request, env: Env, id: string) {
  const c = (await lireJson(req, limites(env).projet + 64 * 1024)) as Record<string, unknown> | null;
  if (!c || typeof c !== 'object') throw new ErreurHttp(400, 'corps-invalide', 'objet JSON attendu');
  const ifMatch = /^"?v?(\d+)"?$/.exec(req.headers.get('if-match') ?? '')?.[1];
  const base = c.version_base ?? (ifMatch ? Number(ifMatch) : undefined);
  if (!Number.isSafeInteger(base)) throw new ErreurHttp(428, 'version-base-requise', 'version_base (ou If-Match) requis pour le contrôle de conflit');
  const projet = validerProjet(c.project);
  const assets = c.assets === undefined ? undefined : validerAssets(c.assets);
  const message = typeof c.message === 'string' ? c.message.slice(0, 200) : undefined;
  const res = await salleDe(env, id).enregistrerRest({
    id, base: base as number, projet, auteur: auteur(req), ...(assets ? { assets } : {}), ...(message ? { message } : {}),
  });
  if (!res.ok) {
    throw new ErreurHttp(409, 'conflit', `la version actuelle est ${res.version_actuelle}, pas ${base as number} : relire puis fusionner`, { version_actuelle: res.version_actuelle });
  }
  return json({ id, version: res.version }, 200, { etag: `"v${res.version}"`, 'x-version': String(res.version) });
}

async function exporter(env: Env, id: string) {
  const l = await lireProjet(env.DB, id);
  if (!l) throw new ErreurHttp(404, 'introuvable', 'projet introuvable');
  const fichier: FichierConducteur = { format: FORMAT, project: JSON.parse(l.contenu), assets: JSON.parse(l.assets), runs: await lireRuns(env.DB, id, true) };
  return json(fichier, 200, { 'content-disposition': `attachment; filename="${id}-v${l.version}.json"` });
}

async function listerVersions(env: Env, id: string) {
  const { results } = await env.DB.prepare('SELECT version, auteur, message, taille, cree_le FROM versions WHERE projet_id = ? ORDER BY version DESC LIMIT 200').bind(id).all();
  return json({ versions: results });
}

async function lireVersion(env: Env, id: string, n: string) {
  const v = await env.DB.prepare('SELECT version, contenu, assets, auteur, message, cree_le FROM versions WHERE projet_id = ? AND version = ?').bind(id, Number(n)).first<{ version: number; contenu: string; assets: string; auteur: string; message: string; cree_le: number }>();
  if (!v) throw new ErreurHttp(404, 'introuvable', 'version introuvable');
  return json({ version: v.version, auteur: v.auteur, message: v.message, cree_le: v.cree_le, project: JSON.parse(v.contenu), assets: JSON.parse(v.assets) });
}

// ───────── salle temps réel ─────────

async function salle(req: Request, env: Env, id: string) {
  if (req.method !== 'GET' || req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    throw new ErreurHttp(426, 'websocket-attendu', 'ouvrir en WebSocket : GET /api/projets/:id/salle?jeton=…');
  }
  const r = new Request(req);
  r.headers.set('x-projet-id', id);
  return salleDe(env, id).fetch(r);
}

// ───────── médias (R2) ─────────

const cleMedia = (id: string, nom: string) => `projets/${id}/${nom}`;

async function televerser(req: Request, env: Env, id: string, nom: string) {
  const max = limites(env).media;
  const longueur = Number(req.headers.get('content-length'));
  if (!Number.isFinite(longueur) || longueur <= 0) throw new ErreurHttp(411, 'longueur-requise', 'Content-Length requis');
  if (longueur > max) throw new ErreurHttp(413, 'media-trop-gros', `média > ${max} octets`);
  const type = req.headers.get('content-type') ?? 'application/octet-stream';
  if (!typeMediaAccepte(type)) throw new ErreurHttp(415, 'type-refuse', `type « ${type} » refusé (son, image, vidéo, texte, JSON, PDF)`);
  if (!req.body) throw new ErreurHttp(400, 'corps-vide', 'corps vide');
  // FixedLengthStream : R2 connaît la taille et le flux est coupé s'il dépasse la longueur annoncée.
  const { readable, writable } = new FixedLengthStream(longueur);
  const ecriture = req.body.pipeTo(writable);
  const objet = await env.MEDIAS.put(cleMedia(id, nom), readable, {
    httpMetadata: { contentType: type },
    customMetadata: { auteur: auteur(req), nom },
  });
  await ecriture;
  return json({ nom, taille: objet.size, type, etag: objet.httpEtag, url: `/api/projets/${id}/medias/${encodeURIComponent(nom)}` }, 201);
}

async function lireMedia(req: Request, env: Env, id: string, nom: string) {
  const cle = cleMedia(id, nom);
  const objet = await env.MEDIAS.get(cle, { range: req.headers, onlyIf: req.headers });
  if (!objet) throw new ErreurHttp(404, 'introuvable', 'média introuvable');
  const h = new Headers();
  objet.writeHttpMetadata(h);
  h.set('etag', objet.httpEtag);
  h.set('accept-ranges', 'bytes');
  h.set('cache-control', 'private, max-age=60');
  h.set('content-security-policy', "default-src 'none'; sandbox");
  if (!('body' in objet)) return new Response(null, { status: 304, headers: h }); // onlyIf non satisfait
  let statut = 200;
  if (objet.range && req.headers.has('range')) {
    const r = objet.range as { offset?: number; length?: number; suffix?: number };
    const debut = r.suffix !== undefined ? objet.size - r.suffix : (r.offset ?? 0);
    const longueur = r.suffix !== undefined ? r.suffix : (r.length ?? objet.size - debut);
    h.set('content-range', `bytes ${debut}-${debut + longueur - 1}/${objet.size}`);
    h.set('content-length', String(longueur));
    statut = 206;
  } else h.set('content-length', String(objet.size));
  return new Response(req.method === 'HEAD' ? null : objet.body, { status: statut, headers: h });
}

async function listerMedias(env: Env, id: string) {
  const medias: { nom: string; taille: number; type?: string; televerse_le: number; etag: string }[] = [];
  let curseur: string | undefined;
  do {
    const page = await env.MEDIAS.list({ prefix: `projets/${id}/`, include: ['httpMetadata'], ...(curseur ? { cursor: curseur } : {}) });
    for (const o of page.objects) {
      medias.push({ nom: o.key.slice(`projets/${id}/`.length), taille: o.size, ...(o.httpMetadata?.contentType ? { type: o.httpMetadata.contentType } : {}), televerse_le: o.uploaded.getTime(), etag: o.httpEtag });
    }
    curseur = page.truncated ? page.cursor : undefined;
  } while (curseur && medias.length < 5000);
  return json({ medias });
}

// ───────── exécutions (runs) ─────────

async function creerExecution(req: Request, env: Env, id: string) {
  const c = (await lireJson(req, MAX_CORPS_JSON_RUNS)) as Record<string, unknown>;
  const r = validerExecution({ id: nouvelId('r_', 12), debut: Date.now(), ...c });
  const cree = await creerRun(env.DB, id, r);
  let total = 0;
  if (r.evenements.length) total = (await ajouterEvenements(env.DB, id, r.id, 0, r.evenements)).total;
  return json({ id: r.id, mode: r.mode, debut: r.debut, cree, total }, cree ? 201 : 200);
}

async function lireExecution(env: Env, id: string, runId: string) {
  const r = await env.DB.prepare('SELECT id, mode, debut FROM runs WHERE projet_id = ? AND id = ?').bind(id, runId).first<{ id: string; mode: 'repetition' | 'scene'; debut: number }>();
  if (!r) throw new ErreurHttp(404, 'introuvable', 'exécution introuvable');
  return json({ ...r, evenements: await lireEvenements(env.DB, id, runId) });
}

/** Corps : {premier, evenements[]} ; l'événement i reçoit le rang premier+i (renvoi idempotent). */
async function ajouter(req: Request, env: Env, id: string, runId: string) {
  const c = (await lireJson(req, MAX_CORPS_JSON_RUNS)) as Record<string, unknown>;
  const existe = await env.DB.prepare('SELECT 1 AS x FROM runs WHERE projet_id = ? AND id = ?').bind(id, runId).first();
  if (!existe) throw new ErreurHttp(404, 'introuvable', 'exécution introuvable');
  if (!Number.isSafeInteger(c?.premier) || (c.premier as number) < 0) throw new ErreurHttp(400, 'premier-requis', 'premier : rang (≥ 0) du premier événement envoyé');
  const evenements = validerEvenements(c.evenements);
  return json(await ajouterEvenements(env.DB, id, runId, c.premier as number, evenements));
}
