// Supervision (audit 2026-10, rapport 5 §4.4, lot L7) : ce que dit `GET /sante` et la sonde du tunnel.
// - JAMAIS de donnée personnelle (pseudo, texte libre, identifiant d'appareil) ni de jeton : seulement des compteurs,
//   des heures et des états. Le test `sante.test.ts` le vérifie sur le JSON complet.
// - La sonde du tunnel fait l'aller-retour par l'adresse PUBLIQUE (`<adresse>/sante`) toutes les 30 s : c'est la seule
//   façon de savoir que le public, lui, nous atteint. Elle ne tourne que si un tunnel est configuré et si l'adresse
//   publique est une vraie adresse (pas `localhost`, pas la valeur à remplacer de l'exemple).
import type { Representation } from '../noyau';
import type { Persistance } from './persistance';
import type { ConfigSpectacle } from './config';

export const INTERVALLE_SONDE_MS = 30_000;
export const DELAI_SONDE_MS = 5_000;

export type EtatTunnel = 'desactive' | 'inconnu' | 'ok' | 'muet';
export interface ResultatSonde { ok: boolean; latenceMs?: number; erreur?: string }
/** Interroge `<adresse>/sante` ; `demarre` = heure de démarrage de CE serveur (preuve que la réponse vient de nous). */
export type Sonde = (adresse: string, demarre: number) => Promise<ResultatSonde>;

/** Sonde réelle : GET <adresse>/sante, réponse JSON `ok` et même `demarre`. Le message d'erreur est un CODE court. */
export const sondeHttp: Sonde = async (adresse, demarre) => {
  const debut = Date.now();
  try {
    const r = await fetch(`${adresse.replace(/\/+$/, '')}/sante`, { signal: AbortSignal.timeout(DELAI_SONDE_MS), cache: 'no-store', headers: { accept: 'application/json' } });
    if (!r.ok) return { ok: false, erreur: `http-${r.status}` };
    const j = await r.json() as { ok?: unknown; demarre?: unknown };
    if (j.ok !== true) return { ok: false, erreur: 'reponse-inattendue' };
    if (j.demarre !== demarre) return { ok: false, erreur: 'autre-instance' };
    return { ok: true, latenceMs: Date.now() - debut };
  } catch (e) {
    const cause = (e as { cause?: { code?: unknown } }).cause;
    const code = typeof cause?.code === 'string' ? cause.code : (e as Error).name === 'TimeoutError' ? 'delai' : 'reseau';
    return { ok: false, erreur: code };
  }
};

/** Adresse publique exploitable ? (https, ni localhost ni IP privée, ni valeur à remplacer de l'exemple). */
export function adressePubliqueReelle(adresse: string): { ok: true } | { ok: false; raison: string } {
  if (/<|>|%3c|%3e/i.test(adresse)) return { ok: false, raison: 'valeur-a-remplacer' };
  let u: URL;
  try { u = new URL(adresse); } catch { return { ok: false, raison: 'adresse-illisible' }; }
  if (u.protocol !== 'https:') return { ok: false, raison: 'pas-https' };
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || /^(127\.|10\.|192\.168\.|169\.254\.)/.test(h) || h === '[::1]') return { ok: false, raison: 'adresse-locale' };
  if (/(^|\.)example\.(org|com|net)$/.test(h)) return { ok: false, raison: 'valeur-a-remplacer' };
  return { ok: true };
}

export interface OptionsSonde {
  config: ConfigSpectacle;
  demarre: number;
  sonde?: Sonde;
  intervalleMs?: number;
  maintenant?: () => number;
}

/** Sonde périodique de l'adresse publique. `etat()` est sûr à publier. */
export class SondeTunnel {
  private minuterie: ReturnType<typeof setInterval> | null = null;
  private readonly sonde: Sonde;
  private readonly maintenant: () => number;
  private readonly intervalleMs: number;
  private readonly adresse: string;
  private readonly type: ConfigSpectacle['tunnel']['type'];
  private readonly actif: boolean;
  private readonly raison: string | null;
  private etatCourant: EtatTunnel;
  private dernierEssai: number | null = null;
  private dernierSucces: number | null = null;
  private latenceMs: number | null = null;
  private erreur: string | null = null;
  private total = 0;
  private echecs = 0;
  private enCours = false;
  private readonly depuis: number;

  constructor(private readonly o: OptionsSonde) {
    this.sonde = o.sonde ?? sondeHttp;
    this.maintenant = o.maintenant ?? Date.now;
    this.intervalleMs = o.intervalleMs ?? INTERVALLE_SONDE_MS;
    this.adresse = o.config.adresses.publique;
    this.type = o.config.tunnel.type;
    this.depuis = this.maintenant();
    const verdict = this.type === 'aucun' ? { ok: false as const, raison: 'aucun-tunnel' } : adressePubliqueReelle(this.adresse);
    this.actif = verdict.ok;
    this.raison = verdict.ok ? null : verdict.raison;
    this.etatCourant = this.actif ? 'inconnu' : 'desactive';
  }

  demarrer() {
    if (!this.actif || this.minuterie) return;
    void this.essayer();
    this.minuterie = setInterval(() => { void this.essayer(); }, this.intervalleMs);
    this.minuterie.unref?.();
  }

  arreter() {
    if (this.minuterie) clearInterval(this.minuterie);
    this.minuterie = null;
  }

  /** Une sonde (publique pour les tests). Ne se chevauche jamais. */
  async essayer(): Promise<void> {
    if (!this.actif || this.enCours) return;
    this.enCours = true;
    try {
      let r: ResultatSonde;
      try { r = await this.sonde(this.adresse, this.o.demarre); } catch { r = { ok: false, erreur: 'sonde' }; }
      this.total++;
      this.dernierEssai = this.maintenant();
      if (r.ok) {
        this.dernierSucces = this.dernierEssai;
        this.latenceMs = r.latenceMs ?? null;
        this.erreur = null;
        this.etatCourant = 'ok';
      } else {
        this.echecs++;
        this.erreur = r.erreur ?? 'inconnue';
        this.latenceMs = null;
        this.etatCourant = 'muet';
      }
    } finally {
      this.enCours = false;
    }
  }

  etat() {
    const maintenant = this.maintenant();
    return {
      type: this.type,
      actif: this.actif,
      raison: this.raison,
      /** adresse publique (publique par nature : elle est imprimée dans le QR) */
      adresse: this.actif ? this.adresse : null,
      etat: this.etatCourant,
      dernierEssai: this.dernierEssai,
      dernierSucces: this.dernierSucces,
      latenceMs: this.latenceMs,
      /** secondes sans aller-retour réussi (depuis le démarrage tant qu'il n'y en a pas eu) */
      silenceDepuisS: this.actif ? Math.round((maintenant - (this.dernierSucces ?? this.depuis)) / 1000) : null,
      erreur: this.erreur,
      sondes: { total: this.total, echecs: this.echecs },
      intervalleS: Math.round(this.intervalleMs / 1000),
    };
  }
}

export interface EntreeSante {
  version: string | null;
  demarre: number;
  redemarrages: number;
  /** sockets avec hello accepté, par rôle */
  parRole: Record<string, number>;
  /** sockets ouvertes (hello accepté ou non) */
  total: number;
  resume: ReturnType<Representation['resume']>;
  persistance: ReturnType<Persistance['etat']>;
  tunnel: ReturnType<SondeTunnel['etat']>;
  maintenant: number;
}

/**
 * Le JSON de `GET /sante`. Compatible avec l'ancien (ok, version, demarre, depuisS, redemarrages, connexions,
 * representation, persistance) ; ajoute l'heure du serveur, le dernier top, le tunnel.
 */
export function construireSante(e: EntreeSante) {
  const dernierTop = e.resume.dernierTop;
  return {
    ok: true as const,
    version: e.version,
    demarre: e.demarre,
    depuisS: Math.round((e.maintenant - e.demarre) / 1000),
    maintenant: e.maintenant,
    redemarrages: e.redemarrages,
    connexions: { total: e.total, parRole: e.parRole },
    representation: e.resume,
    topRecu: { ts: dernierTop, ilYaS: dernierTop === null ? null : Math.max(0, Math.round((e.maintenant - dernierTop) / 1000)) },
    persistance: e.persistance,
    tunnel: e.tunnel,
  };
}
