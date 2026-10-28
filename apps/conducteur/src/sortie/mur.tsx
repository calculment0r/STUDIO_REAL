// Scène native « mur » de la sortie écran scène (audit 2026-10, rapport 1 §4.5 ; rapport 2 §4.2 e) : le mur du 27/10
// (prototypes/figurants/pages/chat + pages/commun/chatvue.js) transposé, sans iframe ni tunnel :
//   - le chat façon Twitch : pseudo coloré (jeton du thème) et texte, les messages des spectateurs (`grand`) plus gros ;
//   - le vote en grand : question, réponses, compteurs qui montent pendant le vote, pourcentages et réponse gagnante à
//     la révélation, phrase de résultat ;
//   - un bandeau titre (Venus Rising), le QR d'accueil en coin si demandé.
// Les pops « @x a voté » passent par le calque de réactions (page.tsx) ; l'audio de salle par son-salle.ts.
// Données : les réglages de la vue (Scene 'mur', traduction.ts sceneDeVue) + ce que les effets du serveur ajoutent
// depuis (messages, voix), tenus par DonneesMur — la scène n'est pas remontée à chaque message (pas de fondu).
// La sortie ne lit JAMAIS de fichier de banque. Couleurs : jetons du thème uniquement.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { MUR_MAX_MESSAGES, type MessageMur, type Scene, type VoteMur } from './protocole';
import { indexGagnant, pourcentsDe } from './traduction';

type SceneMur = Extract<Scene, { type: 'mur' }>;

/** Messages montrés à la fois (les plus récents, en bas). */
export const MUR_MESSAGES_VISIBLES = 40;
const LETTRES = 'ABCDEFGH';

// ── données vivantes du mur (effets du serveur) ─────────────────────────────────────────────────────────────────

export interface InstantaneMur { messages: readonly MessageMur[]; voix: readonly number[] }
const VIDE: InstantaneMur = { messages: [], voix: [] };

/** Ce que les effets ajoutent au mur entre deux vues : messages, voix. Abonnable (useSyncExternalStore). */
export class DonneesMur {
  private messages: MessageMur[] = [];
  private voix: number[] = [];
  private cleVote = '';
  private instant: InstantaneMur = VIDE;
  private readonly abonnes = new Set<() => void>();

  private changer() {
    this.instant = { messages: this.messages, voix: this.voix };
    for (const f of [...this.abonnes]) f();
  }

  abonner = (fn: () => void): (() => void) => { this.abonnes.add(fn); return () => { this.abonnes.delete(fn); }; };
  instantane = (): InstantaneMur => this.instant;

  /** Un message arrivé par effet (dédoublonné par id). */
  ajouterMessage(m: MessageMur): void {
    if (m.id && this.messages.some((x) => x.id === m.id)) return;
    this.messages = [...this.messages, m].slice(-MUR_MAX_MESSAGES);
    this.changer();
  }

  /** Une voix arrivée par effet sur la réponse `index`. */
  ajouterVoix(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index > 7) return;
    const v = [...this.voix];
    while (v.length <= index) v.push(0);
    v[index] += 1;
    this.voix = v;
    this.changer();
  }

  /** Une nouvelle vue : ses messages font foi (doublons retirés) ; un autre vote (ou ses comptes) remet les voix à zéro. */
  nouvelleVue(s: Scene): void {
    if (s.type !== 'mur') { if (this.messages.length || this.voix.length) { this.messages = []; this.voix = []; this.cleVote = ''; this.changer(); } return; }
    const ids = new Set((s.messages ?? []).map((m) => m.id).filter(Boolean));
    const messages = this.messages.filter((m) => !m.id || !ids.has(m.id));
    const cle = s.vote ? JSON.stringify([s.vote.numero, s.vote.question, s.vote.etat, s.vote.comptes]) : '';
    const voix = cle === this.cleVote ? this.voix : [];
    this.cleVote = cle;
    if (messages.length === this.messages.length && voix === this.voix) return;
    this.messages = messages;
    this.voix = voix;
    this.changer();
  }
}

/** Messages de la vue suivis de ceux arrivés depuis, sans doublon, les plus récents. */
export function messagesDuMur(vue: readonly MessageMur[] | undefined, vivants: readonly MessageMur[]): MessageMur[] {
  const ids = new Set<string>();
  const out: MessageMur[] = [];
  for (const m of [...(vue ?? []), ...vivants]) {
    if (m.id) { if (ids.has(m.id)) continue; ids.add(m.id); }
    out.push(m);
  }
  return out.slice(-MUR_MESSAGES_VISIBLES);
}

/** Comptes affichés : ceux de la vue plus les voix arrivées depuis. */
export function comptesDuVote(v: VoteMur, voix: readonly number[]): number[] {
  return v.reponses.map((_, i) => (v.comptes?.[i] ?? 0) + (voix[i] ?? 0));
}

// ── compteur qui monte ──────────────────────────────────────────────────────────────────────────────────────────

/** Valeur affichée qui MONTE vers la cible (≈ 600 ms), sans redescendre en animation. */
function useMontee(cible: number): number {
  const [v, setV] = useState(cible);
  const depart = useRef(cible);
  useEffect(() => {
    if (cible <= v) { setV(cible); return; }
    depart.current = v;
    let raf = 0;
    const t0 = performance.now();
    const pas = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      setV(Math.round(depart.current + (cible - depart.current) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(pas);
    };
    raf = requestAnimationFrame(pas);
    // minuteur de secours (fenêtre cachée : requestAnimationFrame suspendu)
    const fin = setTimeout(() => setV(cible), 700);
    return () => { cancelAnimationFrame(raf); clearTimeout(fin); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cible]);
  return v;
}

function Compte({ n }: { n: number }) {
  const v = useMontee(n);
  return <>{v}</>;
}

// ── la scène ────────────────────────────────────────────────────────────────────────────────────────────────────

function LigneChat({ m }: { m: MessageMur }) {
  return (
    <div className={'so-mur-ligne' + (m.grand ? ' grand' : '')}>
      <span className="so-mur-pseudo" style={{ color: `var(${m.couleur ?? '--cy'})` }}>{m.pseudo}</span>
      <span className="so-mur-texte">{m.texte}</span>
    </div>
  );
}

function VoteEnGrand({ v, voix }: { v: VoteMur; voix: readonly number[] }) {
  const revele = v.etat === 'revele';
  const comptes = comptesDuVote(v, voix);
  const pourcents = revele ? (v.pourcents ?? pourcentsDe(comptes)) : null;
  const gagnant = revele ? indexGagnant(pourcents ?? comptes) : -1;
  const total = comptes.reduce((a, b) => a + b, 0);
  return (
    <section className={'so-mur-vote' + (revele ? ' revele' : '')} aria-label="Vote">
      <div className="so-micro so-mur-vote-et">
        {v.numero !== undefined ? `Question ${v.numero} · ` : ''}{revele ? 'le public a répondu' : 'le public répond'}
        {!revele && total > 0 && <span className="so-mur-vote-total so-chiffres"> · <Compte n={total} /> voix</span>}
      </div>
      {v.question && <p className="so-mur-vote-q">{v.question}</p>}
      <div className="so-mur-reponses">
        {v.reponses.map((r, i) => {
          const part = pourcents ? pourcents[i] ?? 0 : total > 0 ? Math.round(((comptes[i] ?? 0) / total) * 100) : 0;
          return (
            <div key={i} className={'so-mur-rep' + (i === gagnant ? ' gagne' : '') + (revele && i !== gagnant ? ' terne' : '')}>
              <i className="so-mur-rep-barre" style={{ width: `${part}%` }} />
              <b className="f-disp">{LETTRES[i]}</b>
              <span className="so-mur-rep-texte">{r}</span>
              <em className="f-disp so-chiffres">{pourcents ? `${pourcents[i] ?? 0} %` : <Compte n={comptes[i] ?? 0} />}</em>
            </div>
          );
        })}
      </div>
      {revele && v.resultat && <p className="so-mur-resultat">{v.resultat}</p>}
    </section>
  );
}

/** Le QR d'accueil en coin (tracé fourni par scenes.tsx : pas de dépendance circulaire). */
export type TraceQr = (texte: string) => { taille: number; d: string };

function QrCoin({ adresse, trace }: { adresse: string; trace: TraceQr }) {
  const qr = useMemo(() => { try { return trace(adresse); } catch { return null; } }, [adresse, trace]);
  if (!qr) return null;
  const marge = 4;
  return (
    <div className="so-mur-qr">
      <svg viewBox={`${-marge} ${-marge} ${qr.taille + 2 * marge} ${qr.taille + 2 * marge}`} shapeRendering="crispEdges" role="img" aria-label={'QR code : ' + adresse}>
        <rect x={-marge} y={-marge} width={qr.taille + 2 * marge} height={qr.taille + 2 * marge} className="so-qr-fond" />
        <path d={qr.d} className="so-qr-modules" />
      </svg>
      <span className="so-micro">Scannez pour entrer</span>
    </div>
  );
}

export function SceneMur({ scene, donnees, traceQr }: { scene: SceneMur; donnees?: DonneesMur | null; traceQr?: TraceQr }) {
  const d = useSyncExternalStore(donnees?.abonner ?? abonnerRien, donnees?.instantane ?? instantaneVide, donnees?.instantane ?? instantaneVide);
  const messages = messagesDuMur(scene.messages, d.messages);
  return (
    <div className={'so-mur' + (scene.titre ? ' avec-titre' : '')}>
      {scene.titre && <div className="so-mur-titre f-disp">{scene.titre}</div>}
      <main className="so-mur-flux" aria-live="off" aria-label="Chat">
        {messages.map((m, i) => <LigneChat key={m.id ?? 'i' + i + ':' + m.pseudo} m={m} />)}
      </main>
      {scene.vote && <VoteEnGrand v={scene.vote} voix={d.voix} />}
      {scene.qr && traceQr && <QrCoin adresse={scene.qr} trace={traceQr} />}
    </div>
  );
}

const abonnerRien = () => () => {};
const instantaneVide = () => VIDE;
