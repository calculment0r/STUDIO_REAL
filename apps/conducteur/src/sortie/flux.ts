// Flux du streamer sur la sortie écran scène (chantier SORTIE SCÈNE).
//
// Réception WebRTC : écrite par le chantier FLUX dans src/flux/ (export `recevoirFluxStreamer({ serveur, projet,
// jeton, nom?, signal? }) → Promise<MediaStream>`, signalisation par la salle du projet). On la trouve À LA
// CONSTRUCTION par import.meta.glob : sans ce dossier, la sortie fonctionne quand même avec une source de test
// (webcam locale sur clic, sinon mire). La salle vient de l'adresse de la sortie (?serveur=&projet=&jeton=) ou de la
// configuration envoyée par la régie connectée à une salle (ConfigSortie.flux).
// Surveillance : si le flux tombe (piste terminée, flux inactif, image figée plus de 3 s), l'état passe à 'tombe' —
// la scène streamer bascule alors sur la vidéo de secours désignée — et la réception est relancée (attente croissante).
export type StatutFlux = 'aucun' | 'connexion' | 'direct' | 'test' | 'tombe';
export interface EtatFlux { statut: StatutFlux; flux: MediaStream | null; source: 'webrtc' | 'webcam' | null; message?: string }

type Recevoir = (options?: Record<string, unknown>) => Promise<MediaStream>;

// Tous les modules de src/flux (hors tests), chargés à la demande : celui qui exporte recevoirFluxStreamer gagne.
const MODULES_FLUX = import.meta.glob(['../flux/*.ts', '../flux/*.tsx', '!../flux/*.test.ts', '!../flux/*.test.tsx']);

export async function trouverRecepteur(): Promise<Recevoir | null> {
  const cles = Object.keys(MODULES_FLUX).sort((a, b) => Number(!/index\.tsx?$/.test(a)) - Number(!/index\.tsx?$/.test(b)));
  for (const k of cles) {
    try {
      const m = (await MODULES_FLUX[k]()) as { recevoirFluxStreamer?: unknown };
      if (typeof m.recevoirFluxStreamer === 'function') return m.recevoirFluxStreamer as Recevoir;
    } catch { /* module illisible : suivant */ }
  }
  return null;
}

const ATTENTES = [1000, 2000, 4000, 8000];

export class GestionFlux {
  private _etat: EtatFlux = { statut: 'aucun', flux: null, source: null };
  private abonnes = new Set<(e: EtatFlux) => void>();
  private recepteur: Recevoir | null = null;
  private options: Record<string, unknown> = {};
  private abandon: AbortController | null = null;
  private cle = '';
  private essais = 0;
  private minuteur: ReturnType<typeof setTimeout> | undefined;
  private surveillance: ReturnType<typeof setInterval> | undefined;
  private arrete = false;
  /** élément vidéo qui affiche le flux (détection d'image figée) */
  ecran: HTMLVideoElement | null = null;

  get etat(): EtatFlux { return this._etat; }
  abonner(fn: (e: EtatFlux) => void): () => void { this.abonnes.add(fn); fn(this._etat); return () => { this.abonnes.delete(fn); }; }
  private maj(p: Partial<EtatFlux>) { this._etat = { ...this._etat, ...p }; for (const f of this.abonnes) f(this._etat); }

  /** Cherche la réception WebRTC et la lance pour une salle { serveur, projet, jeton } ; sans salle, rien ne part
   *  (source de test). Rappelée avec une autre salle, elle abandonne la précédente. */
  async demarrer(salle: { serveur: string; projet: string; jeton: string } | null): Promise<boolean> {
    const cle = salle ? JSON.stringify(salle) : '';
    if (cle === this.cle) return !!this.recepteur;
    this.cle = cle;
    this.abandon?.abort();
    this.abandon = null;
    clearTimeout(this.minuteur);
    if (this._etat.source === 'webrtc') this.maj({ statut: 'aucun', flux: null, source: null });
    if (!salle) { this.maj({ message: 'pas de salle : source de test' }); return false; }
    this.recepteur ??= await trouverRecepteur();
    if (!this.recepteur) {
      // src/flux absent de cette construction : webcam de test ou mire
      this.maj({ message: 'réception du streamer absente : source de test' });
      return false;
    }
    this.abandon = new AbortController();
    this.options = { ...salle, nom: 'Sortie scène', signal: this.abandon.signal };
    this.essais = 0;
    void this.recevoir();
    return true;
  }

  private async recevoir(): Promise<void> {
    if (!this.recepteur || this.arrete) return;
    if (this._etat.source !== 'webcam') this.maj({ statut: this._etat.statut === 'tombe' ? 'tombe' : 'connexion' });
    const options = this.options;
    try {
      const flux = await this.recepteur(options);
      if (this.arrete || options !== this.options) return;   // salle changée entre-temps
      this.essais = 0;
      this.brancher(flux, 'webrtc');
    } catch (e) {
      if (options !== this.options) return;
      this.maj({ message: (e as Error)?.message ?? 'réception impossible' });
      this.relancer();
    }
  }

  private relancer(): void {
    clearTimeout(this.minuteur);
    if (this.arrete || !this.recepteur) return;
    const a = ATTENTES[Math.min(this.essais, ATTENTES.length - 1)];
    this.essais++;
    this.minuteur = setTimeout(() => void this.recevoir(), a);
  }

  /** Branche un MediaStream (WebRTC venu d'ailleurs, ou test). Utilisable par une intégration extérieure. */
  brancher(flux: MediaStream, source: 'webrtc' | 'webcam'): void {
    const tomber = () => {
      if (this._etat.flux !== flux) return;
      this.maj({ statut: source === 'webrtc' ? 'tombe' : 'aucun', flux: null, source: null });
      if (source === 'webrtc') this.relancer();
    };
    flux.getVideoTracks().forEach((t) => { t.addEventListener('ended', tomber); });
    flux.addEventListener('inactive', tomber);
    this.maj({ statut: source === 'webrtc' ? 'direct' : 'test', flux, source, message: undefined });
    this.surveiller();
  }

  /** Image figée plus de 3 s sur un flux direct → tombé. */
  private surveiller(): void {
    clearInterval(this.surveillance);
    let derniere = -1, depuis = Date.now();
    this.surveillance = setInterval(() => {
      const v = this.ecran;
      if (this._etat.statut !== 'direct' || !v) { depuis = Date.now(); return; }
      const q = (v as HTMLVideoElement & { getVideoPlaybackQuality?: () => { totalVideoFrames: number } }).getVideoPlaybackQuality?.();
      const n = q ? q.totalVideoFrames : v.currentTime;
      if (n !== derniere) { derniere = n; depuis = Date.now(); return; }
      if (Date.now() - depuis > 3000) {
        // les pistes appartiennent au récepteur (src/flux) : on ne les coupe pas, on attend le flux suivant
        this.maj({ statut: 'tombe', flux: null, source: null });
        this.relancer();
      }
    }, 500);
  }

  /** Source de test : webcam locale (geste de l'utilisateur requis). */
  async webcam(): Promise<boolean> {
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      this.brancher(flux, 'webcam');
      return true;
    } catch (e) {
      this.maj({ message: 'webcam indisponible : ' + ((e as Error).name || (e as Error).message) });
      return false;
    }
  }

  /** Coupe la source de test. */
  arreterTest(): void {
    if (this._etat.source !== 'webcam') return;
    this._etat.flux?.getTracks().forEach((t) => t.stop());
    this.maj({ statut: 'aucun', flux: null, source: null });
  }

  arreter(): void {
    this.arrete = true;
    clearTimeout(this.minuteur); clearInterval(this.surveillance);
    this.abandon?.abort();
    if (this._etat.source === 'webcam') this._etat.flux?.getTracks().forEach((t) => t.stop());
  }
}
