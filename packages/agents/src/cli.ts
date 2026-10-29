// Lancement des agents en ligne de commande (Node 24) :
//   node --import tsx packages/agents/src/cli.ts figurants --url ws://localhost:8790/ws --jeton <jeton agent> [--acteur figurants] [--banques echo]
// Le jeton vient aussi de SPECTACLE_JETON_AGENT (à préférer : un argument se voit dans la liste des processus). Il n'est jamais
// écrit dans le journal. Code de sortie : 2 sans --url ou sans jeton (ou argument inconnu), 0 à l'arrêt demandé (Ctrl+C).
import { pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import type { EnvironnementWS } from '@studio-real/protocole';
import { creerClientAgent } from './client-agent';
import { creerAgentFigurants } from './figurants/agent';
import { chargerBanques, dossierDeBanques } from './figurants/banques';
import { fournisseursDepuisEnv } from './figurants/fournisseurs';

export const AIDE = `agents : lance un agent IA de STUDIO_REAL comme client du serveur de spectacle.

Usage :
  node --import tsx packages/agents/src/cli.ts figurants --url ws://localhost:8790/ws --jeton <jeton agent> [options]

Options :
  --url <ws://hote:port/ws>   adresse WebSocket du serveur de spectacle (obligatoire)
  --jeton <jeton>             jeton du rôle agent (ou variable SPECTACLE_JETON_AGENT, à préférer)
  --acteur <id>               acteur incarné (défaut : figurants)
  --banques <nom|dossier>     banques des figurants : « echo » = prototypes/figurants/banques/echo (défaut : banques générales)
  --verbeux                   journalise aussi chaque réplique et chaque décision
  --aide                      affiche cet usage

Variables : OLLAMA_URL (+ MODELE_OLLAMA) active l'IA locale ; ANTHROPIC_API_KEY active Haiku 5.5. Sans elles, les figurants
jouent leurs banques (niveaux N0 et N1) et le disent dans leur « stat ».
Code de sortie : 2 sans --url ou sans jeton.`;

export interface ArgumentsCli {
  agent: 'figurants';
  url: string;
  jeton: string;
  acteur: string;
  banques?: string;
  verbeux: boolean;
}
export type AnalyseCli = { aide: true } | { erreur: string } | { arguments: ArgumentsCli };

/** Lit la ligne de commande (sans `node` ni le script). Pur : testable sans lancer quoi que ce soit. */
export function analyserArguments(argv: readonly string[], env: Record<string, string | undefined>): AnalyseCli {
  const args = [...argv];
  if (args.includes('--aide') || args.includes('-h') || args.includes('--help')) return { aide: true };
  const agent = args.shift();
  if (agent !== 'figurants') return { erreur: agent ? `agent inconnu « ${agent} » (seul « figurants » existe pour l'instant)` : 'précisez l\'agent : figurants' };
  const valeurs: Record<string, string> = {};
  let verbeux = false;
  while (args.length) {
    const a = args.shift()!;
    if (a === '--verbeux') { verbeux = true; continue; }
    const m = /^--(url|jeton|acteur|banques)(?:=(.*))?$/.exec(a);
    if (!m) return { erreur: `argument inconnu « ${a.startsWith('--jeton') ? '--jeton…' : a} »` };
    const v = m[2] ?? args.shift();
    if (v === undefined || v.startsWith('--')) return { erreur: `--${m[1]} attend une valeur` };
    valeurs[m[1]!] = v;
  }
  const url = valeurs.url ?? '';
  const jeton = valeurs.jeton ?? env.SPECTACLE_JETON_AGENT ?? '';
  if (!url) return { erreur: 'il manque --url (adresse WebSocket du serveur de spectacle)' };
  if (!/^wss?:\/\//.test(url)) return { erreur: '--url doit commencer par ws:// ou wss://' };
  if (!jeton) return { erreur: 'il manque le jeton agent (--jeton ou variable SPECTACLE_JETON_AGENT)' };
  return { arguments: { agent, url, jeton, acteur: valeurs.acteur || 'figurants', ...(valeurs.banques ? { banques: valeurs.banques } : {}), verbeux } };
}

/** Événements du journal de l'orchestrateur qui méritent une ligne même hors `--verbeux`. */
const EVENEMENTS_UTILES = new Set(['n2_erreur', 'disjoncteur', 'n2_vide', 'prechauffage', 'annulation', 'vague', 'validation', 'attente', 'attente_expiree']);

function heure(): string { return new Date().toTimeString().slice(0, 8); }
function ligne(texte: string): void { console.log(`[${heure()}] ${texte}`); }

export function lancer(a: ArgumentsCli, env: Record<string, string | undefined>): { arreter(): void } {
  const banques = chargerBanques({ dossier: dossierDeBanques(a.banques) });
  const fournisseurs = fournisseursDepuisEnv(env);
  ligne(`figurants : ${banques.personas.length} personas, ${Object.keys(banques.segments).length} segments, ${banques.reflexes.declencheurs.length} déclencheurs`);
  ligne(`  banques : ${Object.entries(banques.sources).map(([k, v]) => `${k}=${v}`).join(' ; ')}`);
  ligne(`  IA : ollama ${fournisseurs.ollama ? 'actif (' + fournisseurs.ollama.modele + ')' : 'absent (OLLAMA_URL non posée)'} ; anthropic ${fournisseurs.anthropic ? 'actif' : 'absent (ANTHROPIC_API_KEY non posée)'}${!fournisseurs.ollama && !fournisseurs.anthropic ? ' : réponses de banque seulement (N0/N1)' : ''}`);

  const client = creerClientAgent({
    url: a.url, jeton: a.jeton, acteur: a.acteur, app: { version: '0.1.0', build: 'agents' },
    env: { WebSocket: WebSocket as unknown as EnvironnementWS['WebSocket'] },
  });
  let derniereLigne = '';
  client.surEtat(e => {
    if (e.ligne.etat !== derniereLigne) {
      derniereLigne = e.ligne.etat;
      ligne(`liaison ${e.ligne.etat}${e.ligne.etat === 'attente' ? ` (essai ${e.ligne.essai})` : ''}`);
    }
    if (e.dernierRefus) ligne(`refus du serveur : ${e.dernierRefus.code} - ${e.dernierRefus.message}`);
  });

  const agent = creerAgentFigurants({
    client, banques, fournisseurs,
    journal: evt => { if (a.verbeux || EVENEMENTS_UTILES.has(String(evt.e))) ligne(`  ${JSON.stringify(evt)}`); },
  });
  ligne(`agent « ${a.acteur} » lancé vers ${a.url.replace(/\/\/[^/@]*@/, '//')}`);
  return { arreter() { agent.fermer(); client.fermer(); } };
}

function principal(): number | null {
  const analyse = analyserArguments(process.argv.slice(2), process.env);
  if ('aide' in analyse) { console.log(AIDE); return 0; }
  if ('erreur' in analyse) { console.error(`agents : ${analyse.erreur}\n\n${AIDE}`); return 2; }
  const agent = lancer(analyse.arguments, process.env);
  const fin = () => { ligne('arrêt demandé'); agent.arreter(); setTimeout(() => process.exit(0), 200); };
  process.on('SIGINT', fin);
  process.on('SIGTERM', fin);
  return null;
}

// Lancé directement (et non importé par un test) ?
const direct = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) {
  const code = principal();
  if (code !== null) process.exit(code);
}
