// Tests du client des agents : un faux serveur en mémoire (transportMemoire), aucun port, aucun réseau.
import { describe, expect, it } from 'vitest';
import { transportMemoire, type MessageClient, type PaireMemoire } from '@studio-real/protocole';
import { creerClientAgent, type ClientAgent, type TraiterCommande } from './client-agent';

const APP = { version: '0.1.0', build: 'test' };
const tick = () => new Promise<void>(r => setTimeout(r, 0));

function monter() {
  let paire!: PaireMemoire;
  const client = creerClientAgent({
    url: 'ws://memoire', jeton: 'jeton-agent-de-test', acteur: 'figurants', session: 's_test', app: APP,
    fabriqueTransport: (hello, jeton) => { paire = transportMemoire({ hello, jeton }); return paire.client; },
  });
  paire.serveur.ouvrir();
  const recus = <T extends MessageClient['t']>(t: T) => paire.serveur.recus.filter((m): m is Extract<MessageClient, { t: T }> => m.t === t);
  const cmd = (n: number, extra: Record<string, unknown> = {}) =>
    paire.serveur.envoyer({ t: 'agent.cmd', n, type: 'figurants.cmd', etape: 'b1', donnees: { densite: 'calme' }, ...extra });
  return { client, serveur: paire.serveur, recus, cmd };
}

describe('client des agents', () => {
  it('se présente avec hello{role:agent, acteur} et le jeton', () => {
    const { recus } = monter();
    const h = recus('hello')[0]!;
    expect(h).toMatchObject({ t: 'hello', v: 2, role: 'agent', acteur: 'figurants', session: 's_test', jeton: 'jeton-agent-de-test', app: APP, cseq: 0 });
  });

  it('accuse recu dès réception puis fait quand le traitement finit', async () => {
    const { client, recus, cmd } = monter();
    let fin!: (s: 'fait') => void;
    client.surCommande(() => new Promise(r => { fin = r; }));
    cmd(1);
    expect(recus('agent.ack').map(a => [a.n, a.statut])).toEqual([[1, 'recu']]);
    fin('fait');
    await tick();
    expect(recus('agent.ack').map(a => [a.n, a.statut])).toEqual([[1, 'recu'], [1, 'fait']]);
  });

  it('ne traite chaque n qu\'une fois (le serveur rejoue) et répète le fait perdu', async () => {
    const { client, recus, cmd } = monter();
    let appels = 0;
    client.surCommande(() => { appels++; return 'fait'; });
    cmd(7);
    await tick();
    cmd(7);                                   // rejouée à la reconnexion
    cmd(7);
    await tick();
    expect(appels).toBe(1);
    // la 2e et la 3e fois, l'agent répète seulement ce qu'il avait dit : fait
    expect(recus('agent.ack').map(a => a.statut)).toEqual(['recu', 'fait', 'fait', 'fait']);
    expect(client.etat().commandesVues).toBe(1);
  });

  it('accuse echec avec le message d\'une exception et refus avec son detail', async () => {
    const { client, recus, cmd } = monter();
    const traiter: TraiterCommande = c => {
      if (c.n === 1) throw new Error('modèle absent');
      return { statut: 'refus', detail: 'type inconnu' };
    };
    client.surCommande(traiter);
    cmd(1);
    cmd(2);
    await tick();
    const finals = recus('agent.ack').filter(a => a.statut !== 'recu');
    expect(finals).toEqual([
      { t: 'agent.ack', n: 1, statut: 'echec', detail: 'modèle absent' },
      { t: 'agent.ack', n: 2, statut: 'refus', detail: 'type inconnu' },
    ]);
  });

  it('numérote les agent.in avec un cseq croissant et refuse un nom d\'entrée invalide', () => {
    const { client, recus } = monter();
    expect(client.envoyer('say', { persona: 'kev', texte: 'salut' })).toBe(1);
    expect(client.envoyer('stat', { niveau: 'N0' })).toBe(2);
    expect(recus('agent.in').map(m => [m.cseq, m.k])).toEqual([[1, 'say'], [2, 'stat']]);
    expect(() => client.envoyer('Say')).toThrow(/invalide/);
    expect(() => client.envoyer('1say')).toThrow();
    expect(client.etat().cseq).toBe(2);
  });

  it('à la reconnexion : nouveau hello avec le cseq courant, envois gardés pendant la coupure, commande rejouée sans retraitement', async () => {
    const { client, serveur, recus, cmd } = monter();
    let appels = 0;
    let fin!: (s: 'fait') => void;
    client.surCommande(() => { appels++; return new Promise(r => { fin = r; }); });
    client.envoyer('stat', { a: 1 });
    cmd(3);
    await tick();
    serveur.couper();
    expect(client.etat().connecte).toBe(false);
    client.envoyer('say', { persona: 'kev', texte: 'pendant la coupure', couleur: '--coral-2' });
    serveur.ouvrir();
    // le serveur rejoue la commande non accusée fait : pas de nouveau traitement, un recu de plus
    cmd(3);
    await tick();
    expect(appels).toBe(1);
    expect(recus('hello')).toHaveLength(2);
    expect(recus('hello')[1]).toMatchObject({ cseq: 2, session: 's_test' });   // dernier cseq attribué (stat=1, say=2)
    expect(recus('agent.in').map(m => m.k)).toEqual(['stat', 'say']);
    expect(recus('agent.ack').map(a => a.statut)).toEqual(['recu', 'recu']);
    fin('fait');
    await tick();
    expect(recus('agent.ack').at(-1)).toMatchObject({ n: 3, statut: 'fait' });
    expect(client.etat().connecte).toBe(true);
  });

  it('garde les commandes arrivées avant surCommande et les livre dans l\'ordre', async () => {
    const { client, cmd } = monter();
    cmd(1);
    cmd(2);
    const vues: number[] = [];
    client.surCommande(c => { vues.push(c.n); });
    await tick();
    expect(vues).toEqual([1, 2]);
  });

  it('renvoie hello sur resync et note un refus du serveur sans le jeton', async () => {
    const { client, serveur, recus } = monter();
    serveur.envoyer({ t: 'resync', raison: 'redemarrage' });
    expect(recus('hello')).toHaveLength(2);
    serveur.envoyer({ t: 'refus', code: 'jeton', message: 'Jeton refusé.', fatal: true });
    expect(client.etat().dernierRefus).toEqual({ code: 'jeton', message: 'Jeton refusé.', fatal: true });
    expect(JSON.stringify(client.etat())).not.toContain('jeton-agent-de-test');
  });

  it('fermer coupe la ligne et ne laisse plus rien partir', () => {
    const { client, recus } = monter() as { client: ClientAgent; recus: ReturnType<typeof monter>['recus'] };
    client.fermer();
    const avant = recus('agent.in').length;
    client.envoyer('stat', {});
    expect(recus('agent.in')).toHaveLength(avant);
    expect(client.etat().ligne.etat).toBe('ferme');
  });
});
