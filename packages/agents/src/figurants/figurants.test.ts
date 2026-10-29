// Tests des figurants : orchestrateur et agent branchés sur un faux serveur en mémoire (transportMemoire), temps simulé
// (vitest), hasard graine. Aucun réseau : les fournisseurs d'IA sont de faux objets, jamais un appel réel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transportMemoire, type MsgAgentIn, type MessageClient, type PaireMemoire } from '@studio-real/protocole';
import { creerClientAgent } from '../client-agent';
import { creerAgentFigurants, FileSortie, type AgentFigurants } from './agent';
import { chargerBanques, dossierDeBanques } from './banques';
import { DENSITES } from './orchestrateur';
import { fournisseursDepuisEnv, type DemandeGeneration, type Fournisseur, Disjoncteur } from './fournisseurs';
import { quasiDoublon } from './similarite';
import { styliser } from './styliseur';
import type { Banques, ItemReplique, Persona, Replique } from './types';
import { fixerAleatoire, graine } from './util';

// ── Banques de poche ───────────────────────────────────────────────────────────────────────────────────────────────

/** Un persona sans aucun accident de frappe : le styliseur ne change que la ponctuation finale. */
function persona(id: string, extra: Partial<Persona> = {}): Persona {
  return {
    id, pseudo: `${id}_pseudo`, couleur: '--coral-2', type: 'recurrent', archetype: 'fan', bio: 'un fan', registre: '', sujets: [], regles: [],
    presence: null, faits: [], actif: true, humeur_base: null, reagit: { N0: 1, N1: 1, N2: 1, N3: 1 },
    voix: {
      longueur: [2, 50], casse: 'normale', cris: 0, fautes: 0, fautes_typiques: [], accents: 1, point_final: 0, repetition_lettres: 0,
      abreviations: {}, emojis: [], emojis_par_msg: 0, emotes: [], tics: [], tic_proba: 0, exemples: [],
    },
    rythme: { reaction_s: [0.5, 1], frappe_cps: 30, activite: 1, rafale: 0 },
    ...extra,
  };
}

// Des phrases bien différentes : l'anti-répétition jette les quasi-doublons, une banque trop uniforme ne dirait presque rien.
const PHRASES = ['le décor est superbe', 'quelle voix incroyable', 'je rejoins le live à l instant', 'ça sent le pain grillé ici',
  'la lumière change tout', 'qui a vu le chat passer', 'bravo pour la musique', 'on dirait un film muet', 'mon voisin adore ce passage',
  'le rideau bouge encore', 'ce rythme est hypnotisant', 'toujours aussi surprenant'];
const AMBIANCES = ['bonne soirée à tous', 'ambiance de folie dans la salle', 'les yeux rivés sur la scène', 'un petit café pour tenir',
  'quel suspense insoutenable', 'on retient son souffle', 'la salle est conquise', 'ça démarre fort ce soir',
  'tout le monde est là', 'plus rien ne nous arrête', 'la tension monte', 'un moment rare'];

function banquesDePoche(nbPersonas = 8): Banques {
  const personas = Array.from({ length: nbPersonas }, (_, i) => persona(`p${i + 1}`));
  const repliques: Replique[] = PHRASES.map((texte, i) => ({
    id: `s1_${i}`, quand: 'libre', type: 'libre' as const, motif: null, top: null, persona: null, texte, ordre: i,
  }));
  repliques.push({ id: 's1_debut', quand: 'debut', type: 'debut', motif: null, top: null, persona: null, texte: 'bienvenue dans le segment', ordre: 99 });
  return {
    personas,
    reflexes: {
      humeurs: { neutre: { variantes: AMBIANCES, emotes: [], centre: { valence: 0, energie: 0.5 }, stylisable: true } },
      declencheurs: [{
        id: 'pizza', motifs: [/(^|[^a-z0-9])pizza($|[^a-z0-9])/i], priorite: 'haute', nb: [3, 3], delai_s: [0.1, 0.2], stylisable: true, segments_exclus: [],
        variantes: ['miam la pizza', 'pizza sans ananas', 'ouais la pizza'], par_humeur: {},
      }],
      vagues: [],
      relance: ['alors on fait quoi'],
    },
    segments: {
      s1: { titre: 'Segment un', ordre: 1, consigne: 'consigne', faits: [], interdits: ['le secret du chat'], humeur: null, densite: null, repliques },
      s2: { titre: 'Segment deux', ordre: 2, consigne: '', faits: [], interdits: [], humeur: { valence: 0.9, energie: 0.9, etiquettes: [] }, densite: 'chaud', repliques: [] },
    },
    fiction: null,
    prompts: {},
    interditsSegment: { s1: ['le secret du chat'], s2: [] },
    sources: {},
    premierSegment: () => 's1',
  };
}

// ── Montage : agent + faux serveur ─────────────────────────────────────────────────────────────────────────────────

interface Monture {
  agent: AgentFigurants;
  serveur: PaireMemoire['serveur'];
  /** les `agent.in` d'un nom donné, avec l'heure (simulée) à laquelle le serveur les a reçus */
  entrees(k: string): { cseq: number; data: Record<string, unknown>; ts: number }[];
  dits(): string[];
  acks(): { n: number; statut: string; detail?: string }[];
  cmd(n: number, type: string, donnees: Record<string, unknown>): void;
}

function monter(banques: Banques, options: { fournisseurs?: { ollama?: Fournisseur; anthropic?: Fournisseur }; config?: Record<string, unknown> } = {}): Monture {
  let paire!: PaireMemoire;
  const client = creerClientAgent({
    url: 'ws://memoire', jeton: 'jeton-de-test', acteur: 'figurants', session: 's_fig', app: { version: '0', build: 't' },
    fabriqueTransport: (hello, jeton) => { paire = transportMemoire({ hello, jeton }); return paire.client; },
  });
  const recus: { m: MessageClient; ts: number }[] = [];
  paire.serveur.surMessage(m => recus.push({ m, ts: Date.now() }));
  paire.serveur.ouvrir();
  const agent = creerAgentFigurants({ client, banques, ...(options.fournisseurs ? { fournisseurs: options.fournisseurs } : {}), ...(options.config ? { config: options.config } : {}) });
  const entrees = (k: string) => recus.filter((r): r is { m: MsgAgentIn; ts: number } => r.m.t === 'agent.in' && r.m.k === k)
    .map(r => ({ cseq: r.m.cseq, data: r.m.data, ts: r.ts }));
  return {
    agent, serveur: paire.serveur, entrees,
    dits: () => entrees('say').map(x => String(x.data.texte)),
    acks: () => recus.flatMap(r => (r.m.t === 'agent.ack' && r.m.statut !== 'recu' ? [{ n: r.m.n, statut: r.m.statut, ...(r.m.detail !== undefined ? { detail: r.m.detail } : {}) }] : [])),
    cmd: (n, type, donnees) => { paire.serveur.envoyer({ t: 'agent.cmd', n, type, etape: 'e1', donnees }); },
  };
}

/** Faux fournisseur : répond avec ce qu'on lui donne, ou échoue. */
function fauxFournisseur(reponse: (d: DemandeGeneration) => { persona: string; texte: string }[] | Error): Fournisseur & { appels: number } {
  const f = {
    nom: 'anthropic' as const, modele: 'faux', disjoncteur: new Disjoncteur('faux'), appels: 0,
    disponible: () => true,
    async generer(d: DemandeGeneration) {
      f.appels++;
      const t0 = Date.now();
      const r = reponse(d);
      if (r instanceof Error) throw r;
      for (const ligne of r) d.onLigne(ligne, Date.now(), t0);
      return { t0, t_premier_jeton: t0, t_fin: Date.now(), jetons_entree: 10, jetons_sortie: 10, cout_usd: 0 };
    },
  };
  return f;
}

const avancer = (ms: number) => vi.advanceTimersByTimeAsync(ms);

let monte: Monture | null = null;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
  fixerAleatoire(graine(42));
});
afterEach(() => {
  monte?.agent.fermer();
  monte = null;
  fixerAleatoire();
  vi.useRealTimers();
});

describe('densités', () => {
  it('silence : rien ne part ; folie dit plus que calme', async () => {
    const compte = async (densite: string) => {
      fixerAleatoire(graine(7));
      const m = monte = monter(banquesDePoche(), {});
      m.cmd(1, 'figurants.cmd', { densite });
      await avancer(120_000);
      const n = m.dits().length;
      m.agent.fermer();
      return n;
    };
    const silence = await compte('silence');
    const calme = await compte('calme');
    const folie = await compte('folie');
    expect(silence).toBe(0);
    expect(calme).toBeGreaterThan(0);
    expect(folie).toBeGreaterThan(calme * 2);
    // les débits cibles du prototype sont repris tels quels
    expect(DENSITES.calme.debit).toBe(6);
    expect(DENSITES.folie.debit).toBe(90);
  });

  it('la cadence ne dépasse jamais 1 réplique par seconde, même en folie', async () => {
    const m = monte = monter(banquesDePoche(12));
    m.cmd(1, 'figurants.cmd', { densite: 'folie' });
    await avancer(120_000);
    const heures = m.entrees('say').map(x => x.ts);
    expect(heures.length).toBeGreaterThan(20);
    for (let i = 1; i < heures.length; i++) expect(heures[i]! - heures[i - 1]!).toBeGreaterThanOrEqual(1000);
    // chaque réplique porte le persona affiché et un jeton de couleur du thème
    const premiere = m.entrees('say')[0]!.data;
    expect(premiere).toMatchObject({ couleur: '--coral-2' });
    expect(String(premiere.persona)).toMatch(/^p\d+_pseudo$/);
  });

  it('FileSortie : cinq répliques d\'un coup sortent à une seconde d\'écart, les périmées sont jetées', async () => {
    const sorties: number[] = [];
    const file = new FileSortie(() => sorties.push(Date.now()), 1000);
    const item = (t: string): ItemReplique => ({ persona: persona('p1'), texte: t, origine: 'N0' });
    for (let i = 0; i < 5; i++) file.pousser(item(`r${i}`));
    await avancer(10_000);
    expect(sorties).toHaveLength(5);
    expect(sorties.slice(1).map((t, i) => t - sorties[i]!)).toEqual([1000, 1000, 1000, 1000]);
    // une réplique qui attend plus de 15 s n'a plus de sens
    const vieux = new FileSortie(() => sorties.push(-1), 20_000);
    vieux.pousser(item('a')); vieux.pousser(item('b'));
    await avancer(30_000);
    expect(vieux.jetees).toBe(1);
    file.arreter(); vieux.arreter();
  });
});

describe('souffleur : dire', () => {
  it('sans IA, l\'intention est reprise telle quelle par le persona demandé', async () => {
    const m = monte = monter(banquesDePoche());
    m.cmd(1, 'figurants.cmd', { densite: 'silence', dire: { intention: 'allez on y croit', personas: ['p3'], validation: false } });
    await avancer(5000);
    expect(m.entrees('say')).toHaveLength(1);
    expect(m.entrees('say')[0]!.data).toMatchObject({ persona: 'p3_pseudo', texte: 'allez on y croit' });
    expect(m.acks()).toEqual([{ n: 1, statut: 'fait' }]);
  });

  it('avec validation : la réplique attend la régie ; figurants.valider la libère, ok:false la jette, un id inconnu est refusé', async () => {
    const m = monte = monter(banquesDePoche());
    m.cmd(1, 'figurants.cmd', { densite: 'silence', dire: { intention: 'à valider', personas: ['p1'], validation: true } });
    m.cmd(2, 'figurants.cmd', { dire: { intention: 'à jeter', personas: ['p2'], validation: true } });
    await avancer(3000);
    expect(m.dits()).toEqual([]);                                 // rien n'est parti sans décision
    const attentes = m.entrees('attente').map(x => x.data);
    expect(attentes).toHaveLength(2);
    expect(attentes[0]).toMatchObject({ pseudo: 'p1_pseudo', texte: 'à valider', origine: 'souffleur' });
    m.cmd(3, 'figurants.valider', { id: attentes[0]!.id, ok: true });
    m.cmd(4, 'figurants.valider', { id: attentes[1]!.id, ok: false });
    m.cmd(5, 'figurants.valider', { id: 'a999', ok: true });
    await avancer(5000);
    expect(m.dits()).toEqual(['à valider']);
    const acks = m.acks();
    expect(acks.filter(a => a.n >= 3).map(a => [a.n, a.statut])).toEqual([[3, 'fait'], [4, 'fait'], [5, 'refus']]);
    expect(acks.find(a => a.n === 5)!.detail).toMatch(/inconnue ou expirée/);
  });

  it('une validation peut corriger le texte', async () => {
    const m = monte = monter(banquesDePoche());
    m.cmd(1, 'figurants.cmd', { dire: { intention: 'version brute', personas: ['p1'], validation: true } });
    await avancer(2000);
    const id = m.entrees('attente')[0]!.data.id;
    m.cmd(2, 'figurants.valider', { id, ok: true, texte: 'version corrigée' });
    await avancer(5000);
    expect(m.dits()).toEqual(['version corrigée']);
  });
});

describe('IA facultative (N2)', () => {
  it('sans variable d\'environnement, aucun fournisseur : la stat dit « banque »', async () => {
    expect(fournisseursDepuisEnv({})).toEqual({});
    expect(fournisseursDepuisEnv({ MODELE_OLLAMA: 'qwen3:8b' })).toEqual({});           // le modèle seul n'active rien
    expect(fournisseursDepuisEnv({ OLLAMA_URL: 'http://localhost:11434' }).ollama?.nom).toBe('ollama');
    expect(fournisseursDepuisEnv({ ANTHROPIC_API_KEY: 'sk-faux' }).anthropic?.disponible()).toBe(true);
    const m = monte = monter(banquesDePoche());
    await avancer(100);
    const stat = m.entrees('stat').at(-1)!.data;
    expect(stat).toMatchObject({ fournisseur: 'banque', ia: false, densite: 'normal', repliques: 0, erreurs: 0 });
    // même une demande de fournisseur « anthropic » retombe sur la banque quand il n'y a pas de clé
    m.cmd(1, 'figurants.cmd', { fournisseur: 'anthropic' });
    await avancer(100);
    expect(m.entrees('stat').at(-1)!.data.fournisseur).toBe('banque');
  });

  it('avec un fournisseur, le souffleur écrit via le modèle, une ligne JSON par persona', async () => {
    const f = fauxFournisseur(d => {
      expect(d.systeme + d.utilisateur).toContain('allez on y croit');
      return [{ persona: 'p1', texte: 'on y croit à fond' }, { persona: 'p2', texte: 'grave on lâche rien' }];
    });
    const m = monte = monter(banquesDePoche(), { fournisseurs: { anthropic: f } });
    m.cmd(1, 'figurants.cmd', { densite: 'silence', dire: { intention: 'allez on y croit', personas: ['p1', 'p2'] } });
    await avancer(20_000);
    expect(f.appels).toBe(1);
    expect(m.dits().sort()).toEqual(['grave on lâche rien', 'on y croit à fond']);
    expect(m.entrees('stat').at(-1)!.data).toMatchObject({ fournisseur: 'anthropic', ia: true });
  });

  it('si le fournisseur échoue, la banque prend le relais et la stat compte l\'erreur', async () => {
    const f = fauxFournisseur(() => new Error('HTTP 529'));
    const m = monte = monter(banquesDePoche(), { fournisseurs: { anthropic: f } });
    m.cmd(1, 'figurants.cmd', { densite: 'silence', dire: { intention: 'repli sur la banque', personas: ['p4'] } });
    await avancer(20_000);
    expect(m.dits()).toEqual(['repli sur la banque']);
    m.agent.stat();
    expect(m.entrees('stat').at(-1)!.data.erreurs).toBe(1);
  });
});

describe('transcription (prête, pas encore branchée sur le serveur)', () => {
  it('un mot déclencheur du comédien lance une rafale de réflexes N0', async () => {
    const m = monte = monter(banquesDePoche());
    m.cmd(1, 'figurants.cmd', { densite: 'chaud' });
    await avancer(100);
    const avant = m.dits().length;
    m.agent.orchestrateur.onAsr({ kind: 'final', texte: 'bon moi ce soir je veux une pizza', ts: Date.now() });
    await avancer(8000);
    const apres = m.dits().slice(avant).filter(t => /pizza/.test(t));
    expect(apres.length).toBeGreaterThanOrEqual(2);
  });
});

describe('commandes', () => {
  it('densité inconnue, commande vide et type inconnu sont refusés avec un detail ; segment et humeur sont acceptés', async () => {
    const m = monte = monter(banquesDePoche());
    m.cmd(1, 'figurants.cmd', { densite: 'furieuse' });
    m.cmd(2, 'figurants.cmd', {});
    m.cmd(3, 'machine', { x: 1 });
    m.cmd(4, 'figurants.cmd', { segment: 's2', humeur: { valence: 0.8, energie: 0.9, etiquettes: ['hype'] } });
    await avancer(100);
    const acks = m.acks();
    expect(acks.map(a => [a.n, a.statut])).toEqual([[1, 'refus'], [2, 'refus'], [3, 'refus'], [4, 'fait']]);
    expect(acks[0]!.detail).toContain('densite');
    expect(acks[2]!.detail).toContain('machine');
    expect(m.agent.orchestrateur.etat).toMatchObject({ segment: 's2', densite: 'chaud' });   // s2 impose sa densité
    expect(m.agent.orchestrateur.etat.humeur.etiquettes).toEqual(['hype']);
  });

  it('coupe : les répliques en cours sont jetées et plus rien ne part', async () => {
    const m = monte = monter(banquesDePoche());
    m.cmd(1, 'figurants.cmd', { densite: 'folie' });
    await avancer(30_000);
    expect(m.dits().length).toBeGreaterThan(0);
    m.cmd(2, 'figurants.cmd', { coupe: true });
    await avancer(100);
    const n = m.dits().length;
    expect(m.agent.sortie.taille()).toBe(0);
    await avancer(60_000);
    expect(m.dits()).toHaveLength(n);
    m.cmd(3, 'figurants.cmd', { coupe: false });
    await avancer(60_000);
    expect(m.dits().length).toBeGreaterThan(n);
  });

  it('la stat part toutes les 5 secondes avec niveau, densité, répliques, fournisseur et erreurs', async () => {
    const m = monte = monter(banquesDePoche());
    await avancer(20_000);
    const stats = m.entrees('stat');
    expect(stats.length).toBeGreaterThanOrEqual(4);
    expect(stats[1]!.ts - stats[0]!.ts).toBe(5000);
    expect(Object.keys(stats[0]!.data)).toEqual(expect.arrayContaining(['niveau', 'densite', 'repliques', 'fournisseur', 'erreurs']));
  });
});

describe('garde-fous locaux', () => {
  it('jette une URL, une mention et un spoiler du segment ; l\'anti-répétition refuse un doublon', async () => {
    const m = monte = monter(banquesDePoche());
    const o = m.agent.orchestrateur;
    expect(o.parleRegie({ persona: 'p1', texte: 'va sur discord point gg' })).toBe(false);
    expect(o.parleRegie({ persona: 'p1', texte: 'hey @quelquun' })).toBe(false);
    expect(o.parleRegie({ persona: 'p1', texte: 'je connais le secret du chat' })).toBe(false);
    expect(o.parleRegie({ persona: 'p1', texte: 'un texte tout à fait normal' })).toBe(true);
    expect(o.parleRegie({ persona: 'inconnu', texte: 'x' })).toBe(false);
    const h = [{ texte: 'franchement trop bien ce truc', ts: Date.now() }];
    expect(quasiDoublon('franchement trop bien ce truc !!', h)).not.toBeNull();
    expect(quasiDoublon('rien à voir avec le reste', h)).toBeNull();
  });
});

describe('banques du prototype', () => {
  it('se lisent par chemin, sans copie : générales et Écho', () => {
    const generales = chargerBanques();
    expect(generales.personas.length).toBeGreaterThan(5);
    expect(generales.reflexes.declencheurs.length).toBeGreaterThan(0);
    expect(Object.keys(generales.reflexes.humeurs).length).toBeGreaterThan(0);
    const echo = chargerBanques({ dossier: dossierDeBanques('echo') });
    expect(Object.keys(echo.segments).length).toBeGreaterThan(3);
    expect(echo.premierSegment()).toBeTruthy();
    expect(echo.sources['repliques.json']).toBe('banques');
    // couleurs : toujours des jetons du thème
    for (const p of [...generales.personas, ...echo.personas]) expect(p.couleur).toMatch(/^--[a-z0-9-]+$/);
  });

  it('jouent d\'elles-mêmes avec les banques Écho (N0 et N1), sans réseau', async () => {
    const echo = chargerBanques({ dossier: dossierDeBanques('echo') });
    const m = monte = monter(echo);
    m.cmd(1, 'figurants.cmd', { densite: 'chaud' });
    await avancer(90_000);
    expect(m.dits().length).toBeGreaterThan(5);
    for (const x of m.entrees('say')) expect(String(x.data.texte).length).toBeLessThanOrEqual(80);
  });

  it('le styliseur applique la voix : minuscules, sans point final', () => {
    const p = persona('p1', { voix: { ...persona('x').voix, casse: 'minuscules', point_final: 0 } });
    expect(styliser('Vraiment GÉNIAL.', p)).toBe('vraiment génial');
  });
});
