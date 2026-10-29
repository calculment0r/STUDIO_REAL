// L'agent des figurants : l'orchestrateur (metteur en scène) branché sur le serveur de spectacle par un ClientAgent.
//   commandes reçues : `figurants.cmd` {densite?, humeur?, dire?, segment?, …} et `figurants.valider` {id, ok, texte?} ;
//   sorties          : `agent.in{k:'say', data:{persona, texte, couleur}}` cadencé (jamais plus d'une réplique par seconde),
//                      `agent.in{k:'stat', data:{niveau, densite, repliques, fournisseur, erreurs, …}}` toutes les 5 s,
//                      `agent.in{k:'attente', …}` quand une réplique du souffleur attend la décision de la régie,
//                      `agent.in{k:'journal', data:{ligne}}` pour les lignes destinées à la régie.
// `persona` est le pseudo affiché sur le mur ; `couleur` est un JETON du thème (`--coral-2`), jamais une valeur de couleur.
import type { MsgAgentCmd } from '@studio-real/protocole';
import type { ClientAgent, ResultatCommande } from '../client-agent';
import { Orchestrateur, type FournisseursOrch, type ConfigOrchestrateur } from './orchestrateur';
import type { Banques, EtatFigurants, Hote, ItemReplique } from './types';

/** Écart minimal entre deux répliques envoyées au serveur. */
export const ECART_SAY_MS = 1000;
/** Intervalle des `stat`. */
export const INTERVALLE_STAT_MS = 5000;
/** Une réplique qui attend plus longtemps que ça dans la file de sortie est jetée (elle serait hors sujet). */
export const PEREMPTION_FILE_MS = 15_000;
/** Taille maximale de la file de sortie. */
export const FILE_MAX = 30;

export type NiveauStat = 'N0' | 'N1' | 'N2' | 'N3' | 'main';

function niveauDe(origine: string): NiveauStat {
  if (origine === 'N1') return 'N1';
  if (origine === 'N2') return 'N2';
  if (origine === 'souffleur') return 'N3';
  if (origine === 'main') return 'main';
  return 'N0';
}

/** File de sortie des répliques : une toutes les `ecartMs` au plus. */
export class FileSortie {
  private file: { item: ItemReplique; ts: number }[] = [];
  private minuteur: ReturnType<typeof setTimeout> | null = null;
  private dernierEnvoi = 0;
  private envoyes: number[] = [];
  jetees = 0;
  total = 0;
  constructor(private envoyer: (item: ItemReplique) => void, private ecartMs = ECART_SAY_MS) {}

  pousser(item: ItemReplique): void {
    this.file.push({ item, ts: Date.now() });
    while (this.file.length > FILE_MAX) { this.file.shift(); this.jetees++; }
    this.programmer();
  }

  /** Débit réel : répliques envoyées sur la dernière minute, plus celles qui attendent. */
  debit(): number {
    const t = Date.now();
    while (this.envoyes.length && t - this.envoyes[0]! > 60_000) this.envoyes.shift();
    return this.envoyes.length + this.file.length;
  }

  taille(): number { return this.file.length; }

  vider(): number {
    const n = this.file.length;
    this.file = [];
    if (this.minuteur) { clearTimeout(this.minuteur); this.minuteur = null; }
    return n;
  }

  arreter(): void { this.vider(); }

  private programmer(): void {
    if (this.minuteur || !this.file.length) return;
    const delai = Math.max(0, this.dernierEnvoi + this.ecartMs - Date.now());
    this.minuteur = setTimeout(() => { this.minuteur = null; this.sortir(); }, delai);
  }

  private sortir(): void {
    const t = Date.now();
    // les réplique périmées ne partent pas : elles auraient l'air de répondre à autre chose
    while (this.file.length && t - this.file[0]!.ts > PEREMPTION_FILE_MS) { this.file.shift(); this.jetees++; }
    const x = this.file.shift();
    if (x) {
      this.dernierEnvoi = t;
      this.envoyes.push(t);
      this.total++;
      this.envoyer(x.item);
    }
    this.programmer();
  }
}

export interface OptionsAgentFigurants {
  client: ClientAgent;
  banques: Banques;
  fournisseurs?: FournisseursOrch;
  config?: Partial<ConfigOrchestrateur>;
  etat?: Partial<EtatFigurants>;
  /** journal détaillé (une ligne d'objet par événement) ; défaut : rien */
  journal?: (evt: Record<string, unknown>) => void;
  ecartSayMs?: number;
  statMs?: number;
}

export interface AgentFigurants {
  orchestrateur: Orchestrateur;
  sortie: FileSortie;
  /** envoie une `stat` tout de suite (et programme la suivante) */
  stat(): Record<string, unknown>;
  fermer(): void;
}

/** Ordre d'application des clés d'une commande : d'abord ce qui arrête, puis le segment (qui impose sa densité et son humeur : une densité ou une humeur
 *  données dans la même commande l'emportent), puis ce qui parle. */
const ORDRE_CLES = ['coupe', 'chut', 'segment', 'densite', 'humeur', 'fournisseur', 'vague', 'top', 'relance', 'parle', 'dire', 'chauffe'] as const;

export function creerAgentFigurants(options: OptionsAgentFigurants): AgentFigurants {
  const { client } = options;
  let dernierNiveau: NiveauStat = 'N0';
  let repliques = 0;

  const sortie = new FileSortie(item => {
    const couleur = item.persona.couleur;
    client.envoyer('say', { persona: item.persona.pseudo, texte: item.texte, couleur });
    repliques++;
    dernierNiveau = niveauDe(item.origine);
  }, options.ecartSayMs ?? ECART_SAY_MS);

  const hote: Hote = {
    diffuserChat(item) { sortie.pousser(item); return true; },
    versRegie(msg) {
      const { type: _type, ...reste } = msg;
      client.envoyer('attente', reste);
    },
    journalRegie(ligne) { client.envoyer('journal', { ligne: String(ligne).slice(0, 300) }); },
    debit: () => sortie.debit(),
    chatHumainsRecents: () => [],
  };

  const orch = new Orchestrateur({
    banques: options.banques,
    hote,
    ...(options.fournisseurs ? { fournisseurs: options.fournisseurs } : {}),
    ...(options.config ? { config: options.config } : {}),
    ...(options.etat ? { etat: options.etat } : {}),
    ...(options.journal ? { journal: options.journal } : {}),
  });

  function stat(): Record<string, unknown> {
    const s = orch.statistiques();
    const data = {
      niveau: dernierNiveau,
      densite: orch.etat.densite,
      repliques,
      fournisseur: s.fournisseur,
      erreurs: s.erreurs,
      // en plus : de quoi comprendre un chat silencieux ou sans IA
      ia: s.fournisseur !== 'banque',
      segment: orch.etat.segment,
      coupe: orch.etat.coupe,
      attente: s.attente,
      file: sortie.taille(),
      jetees: sortie.jetees,
      cout_usd: s.cout_usd,
    };
    client.envoyer('stat', data);
    return data;
  }

  function appliquerCmd(donnees: Record<string, unknown>): ResultatCommande {
    const presentes = ORDRE_CLES.filter(k => k in donnees);
    if (!presentes.length) return { statut: 'refus', detail: `figurants.cmd : rien d'exécutable (clés attendues : densite, humeur, dire, segment…)` };
    const refus: string[] = [];
    for (const k of presentes) {
      const ok = orch.commande({ [k]: donnees[k] });
      if (!ok) refus.push(k);
      else if ((k === 'coupe' && donnees[k]) || (k === 'chut' && donnees[k] !== false) || (k === 'densite' && donnees[k] === 'silence')) sortie.vider();
    }
    return refus.length ? { statut: 'refus', detail: `valeur refusée pour : ${refus.join(', ')}` } : 'fait';
  }

  client.surCommande((cmd: MsgAgentCmd): ResultatCommande => {
    const d = cmd.donnees ?? {};
    if (cmd.type === 'figurants.cmd') return appliquerCmd(d);
    if (cmd.type === 'figurants.valider') {
      if (typeof d.id !== 'string' && typeof d.id !== 'number') return { statut: 'refus', detail: 'figurants.valider : id manquant' };
      return orch.valider({ id: d.id, ok: d.ok, texte: d.texte })
        ? 'fait'
        : { statut: 'refus', detail: `figurants.valider : réplique ${String(d.id)} inconnue ou expirée` };
    }
    return { statut: 'refus', detail: `type de commande inconnu pour les figurants : ${cmd.type}` };
  });

  orch.demarrer();
  const minuteurStat = setInterval(stat, options.statMs ?? INTERVALLE_STAT_MS);
  stat();

  return {
    orchestrateur: orch,
    sortie,
    stat,
    fermer() {
      clearInterval(minuteurStat);
      orch.arreter();
      sortie.arreter();
    },
  };
}
