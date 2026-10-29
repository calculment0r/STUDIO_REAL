// Page ÉCO : la partie PURE (sans DOM, sans réseau, testée dans eco-appel.test.ts) :
//   - l'analyse du fragment d'adresse (`#spectacle=ws://…/ws&jeton=…&agent=…`) ;
//   - la machine d'état de l'appel : attente → sonne → en-cours → fini ;
//   - la traduction des messages du SDK ElevenLabs en entrées d'agent (`transcript`, `parle`) ;
//   - le suivi des commandes numérotées du serveur (idempotence sur `n`).
// Le SDK, le micro et le WebSocket sont dans eco.ts.

/** Version du SDK officiel ElevenLabs chargée par `import()` quand l'appel sonne. Fixée, jamais « latest » : une mise à jour
 *  inattendue le soir du spectacle changerait le comportement de l'appel. Relevée le 29/10/2026 avec
 *  `npm view @elevenlabs/client version` (1.32.0). À changer à la main, après une répétition. */
export const VERSION_SDK_ELEVENLABS = '1.32.0';
export const URL_SDK_ELEVENLABS = `https://esm.sh/@elevenlabs/client@${VERSION_SDK_ELEVENLABS}`;

// ── Adresse ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ParametresEco {
  /** adresse WebSocket du serveur de spectacle (ws:// ou wss://) */
  serveur: string | null;
  /** jeton du rôle agent */
  jeton: string | null;
  /** identifiant de l'agent ElevenLabs (adresse, sinon variable de construction) */
  agent: string | null;
  /** ce qui manque ou est invalide, en français (affiché sur la page) */
  problemes: string[];
}

const RE_SERVEUR = /^wss?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i;
const RE_AGENT = /^[A-Za-z0-9_-]{8,100}$/;

/**
 * Lit le fragment de l'adresse (avec ou sans le « # »). Le jeton et l'identifiant d'agent ne viennent que de là (jamais de
 * `?`, qui partirait au réseau) ; l'identifiant d'agent a pour repli `agentParDefaut` (VITE_ELEVENLABS_AGENT_ID, posée à
 * la construction) : il ne figure donc jamais dans le code.
 */
export function lireParametres(fragment: string, agentParDefaut?: string): ParametresEco {
  const p = new URLSearchParams(fragment.replace(/^#/, ''));
  const problemes: string[] = [];
  const serveurBrut = (p.get('spectacle') ?? '').trim();
  const jetonBrut = (p.get('jeton') ?? '').trim();
  const agentBrut = (p.get('agent') ?? '').trim() || (agentParDefaut ?? '').trim();
  let serveur: string | null = null;
  let jeton: string | null = null;
  let agent: string | null = null;
  if (!serveurBrut) problemes.push('adresse du serveur manquante (#spectacle=ws://…/ws)');
  else if (!RE_SERVEUR.test(serveurBrut)) problemes.push('adresse du serveur invalide (elle doit commencer par ws:// ou wss://)');
  else serveur = serveurBrut;
  if (!jetonBrut) problemes.push('jeton de l\'agent manquant (#jeton=…)');
  else jeton = jetonBrut;
  if (!agentBrut) problemes.push('identifiant de l\'agent ElevenLabs manquant (#agent=… ou VITE_ELEVENLABS_AGENT_ID à la construction)');
  else if (!RE_AGENT.test(agentBrut)) problemes.push('identifiant de l\'agent ElevenLabs invalide');
  else agent = agentBrut;
  return { serveur, jeton, agent, problemes };
}

// ── Machine d'état de l'appel ──────────────────────────────────────────────────────────────────────────────────────

/** attente : rien à faire · sonne : le serveur demande un appel, la personne doit décrocher · en-cours · fini. */
export type EtatAppel = 'attente' | 'sonne' | 'en-cours' | 'fini';
/** appel : commande du serveur · decrocher : clic de la personne (geste obligatoire pour le micro) · connecte : la
 *  conversation est établie · raccrocher : commande du serveur ou clic · fin : la conversation s'est terminée d'elle-même ·
 *  echec : démarrage ou conversation en erreur. */
export type EvenementAppel = 'appel' | 'decrocher' | 'connecte' | 'raccrocher' | 'fin' | 'echec';

export function transitionAppel(etat: EtatAppel, evenement: EvenementAppel): EtatAppel {
  switch (etat) {
    case 'attente':
      return evenement === 'appel' ? 'sonne' : etat;
    case 'sonne':
      // « decrocher » ne change pas l'état : la conversation démarre, on passe en-cours quand elle est connectée
      if (evenement === 'connecte') return 'en-cours';
      return evenement === 'raccrocher' || evenement === 'fin' || evenement === 'echec' ? 'fini' : etat;
    case 'en-cours':
      return evenement === 'raccrocher' || evenement === 'fin' || evenement === 'echec' ? 'fini' : etat;
    case 'fini':
      return evenement === 'appel' ? 'sonne' : etat;
  }
}

/** Le texte de l'état, pour la page. */
export function libelleEtat(etat: EtatAppel): string {
  return { attente: 'En attente d\'un appel', sonne: 'ÇA SONNE', 'en-cours': 'En ligne', fini: 'Appel terminé' }[etat];
}

// ── Entrées vers le serveur ────────────────────────────────────────────────────────────────────────────────────────

export interface EntreeAgent { k: string; data: Record<string, unknown> }

/**
 * Un message du SDK ({ message, source }) → `transcript{de, texte}`. `source` : 'ai' / 'agent' (ÉCO parle) ou 'user' (la
 * personne). Un message vide ou d'une source inconnue ne donne rien.
 */
export function versTranscript(m: unknown): EntreeAgent | null {
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  const texte = typeof o.message === 'string' ? o.message.trim() : (typeof o.text === 'string' ? o.text.trim() : '');
  const source = String(o.source ?? o.role ?? '');
  if (!texte) return null;
  const de = source === 'ai' || source === 'agent' ? 'eco' : source === 'user' ? 'personne' : null;
  return de ? { k: 'transcript', data: { de, texte: texte.slice(0, 2000) } } : null;
}

/** Changement de mode du SDK ({ mode: 'speaking' | 'listening' }) → `parle{actif}` ; `precedent` évite les doublons. */
export function versParle(m: unknown, precedent: boolean | null): EntreeAgent | null {
  const mode = m && typeof m === 'object' ? (m as Record<string, unknown>).mode : null;
  if (mode !== 'speaking' && mode !== 'listening') return null;
  const actif = mode === 'speaking';
  return actif === precedent ? null : { k: 'parle', data: { actif } };
}

// ── Commandes numérotées du serveur ────────────────────────────────────────────────────────────────────────────────

export type StatutCommande = 'recu' | 'fait' | 'echec' | 'refus';

/**
 * Le serveur rejoue chaque `agent.cmd` à chaque reconnexion tant qu'elle n'est pas accusée « fait » : on ne traite chaque `n`
 * qu'une fois, et on répète seulement le dernier accusé donné.
 */
export class SuiviCommandes {
  private vues = new Map<number, { statut: StatutCommande; detail?: string }>();
  /** `true` si ce `n` est nouveau (il est alors noté « recu »). */
  nouvelle(n: number): boolean {
    if (this.vues.has(n)) return false;
    this.vues.set(n, { statut: 'recu' });
    return true;
  }
  /** note l'accusé donné ; un statut final n'est jamais remplacé par « recu » */
  noter(n: number, statut: StatutCommande, detail?: string): void {
    const v = this.vues.get(n);
    if (v && v.statut !== 'recu' && statut === 'recu') return;
    this.vues.set(n, { statut, ...(detail !== undefined ? { detail } : {}) });
  }
  dernier(n: number): { statut: StatutCommande; detail?: string } | undefined { return this.vues.get(n); }
  get taille(): number { return this.vues.size; }
}
