// Tests de la partie pure de la page ÉCO : aucun DOM, aucun réseau, aucun SDK. Lancés par le projet vitest « agents ».
import { describe, expect, it } from 'vitest';
import {
  lireParametres, libelleEtat, SuiviCommandes, transitionAppel, URL_SDK_ELEVENLABS, VERSION_SDK_ELEVENLABS, versParle, versTranscript,
  type EtatAppel, type EvenementAppel,
} from './eco-appel';

describe('page ÉCO : adresse', () => {
  it('lit serveur, jeton et identifiant d\'agent dans le fragment', () => {
    const p = lireParametres('#spectacle=ws://localhost:8790/ws&jeton=abc123&agent=agent_exemple_0123');
    expect(p).toEqual({ serveur: 'ws://localhost:8790/ws', jeton: 'abc123', agent: 'agent_exemple_0123', problemes: [] });
  });

  it('l\'identifiant d\'agent vient à défaut de la construction ; l\'adresse l\'emporte', () => {
    expect(lireParametres('#spectacle=wss://exemple.org/ws&jeton=j', 'agent_de_construction').agent).toBe('agent_de_construction');
    expect(lireParametres('#spectacle=wss://exemple.org/ws&jeton=j&agent=agent_de_adresse', 'agent_de_construction').agent).toBe('agent_de_adresse');
  });

  it('dit en français ce qui manque ou ne va pas, sans rien deviner', () => {
    const vide = lireParametres('');
    expect(vide).toMatchObject({ serveur: null, jeton: null, agent: null });
    expect(vide.problemes).toHaveLength(3);
    expect(vide.problemes.join(' ')).toMatch(/serveur.*jeton.*ElevenLabs/);
    expect(lireParametres('#spectacle=http://x/ws&jeton=j&agent=agent_exemple_0123').problemes[0]).toMatch(/ws:\/\//);
    expect(lireParametres('#spectacle=ws://x/ws&jeton=j&agent=a b').problemes[0]).toMatch(/invalide/);
  });
});

describe('page ÉCO : machine d\'état de l\'appel', () => {
  const suite = (depart: EtatAppel, evenements: EvenementAppel[]) => evenements.reduce<EtatAppel>(transitionAppel, depart);

  it('suit attente → sonne → en-cours → fini', () => {
    expect(transitionAppel('attente', 'appel')).toBe('sonne');
    expect(transitionAppel('sonne', 'decrocher')).toBe('sonne');      // le micro démarre, pas encore en ligne
    expect(transitionAppel('sonne', 'connecte')).toBe('en-cours');
    expect(transitionAppel('en-cours', 'raccrocher')).toBe('fini');
    expect(suite('attente', ['appel', 'decrocher', 'connecte', 'fin'])).toBe('fini');
  });

  it('ignore ce qui n\'a pas de sens et accepte un nouvel appel après la fin', () => {
    expect(transitionAppel('attente', 'connecte')).toBe('attente');
    expect(transitionAppel('attente', 'raccrocher')).toBe('attente');
    expect(transitionAppel('en-cours', 'appel')).toBe('en-cours');    // appel rejoué pendant la conversation
    expect(transitionAppel('fini', 'decrocher')).toBe('fini');
    expect(suite('fini', ['appel', 'connecte'])).toBe('en-cours');
  });

  it('un échec ou un raccroché pendant que ça sonne termine l\'appel', () => {
    expect(suite('attente', ['appel', 'echec'])).toBe('fini');
    expect(suite('attente', ['appel', 'raccrocher'])).toBe('fini');
    expect(libelleEtat('sonne')).toBe('ÇA SONNE');
  });
});

describe('page ÉCO : entrées vers le serveur', () => {
  it('traduit les messages du SDK en transcript{de, texte}', () => {
    expect(versTranscript({ message: ' Allô, ici ÉCO ', source: 'ai' })).toEqual({ k: 'transcript', data: { de: 'eco', texte: 'Allô, ici ÉCO' } });
    expect(versTranscript({ message: 'question numéro deux', source: 'user' })).toEqual({ k: 'transcript', data: { de: 'personne', texte: 'question numéro deux' } });
    expect(versTranscript({ message: '', source: 'user' })).toBeNull();
    expect(versTranscript({ message: 'x', source: 'système' })).toBeNull();
    expect(versTranscript(null)).toBeNull();
    // les noms d'entrée respectent la forme du protocole
    expect('transcript').toMatch(/^[a-z][a-z0-9.:_-]{0,63}$/);
  });

  it('n\'envoie parle{actif} qu\'aux changements de mode', () => {
    expect(versParle({ mode: 'speaking' }, null)).toEqual({ k: 'parle', data: { actif: true } });
    expect(versParle({ mode: 'speaking' }, true)).toBeNull();
    expect(versParle({ mode: 'listening' }, true)).toEqual({ k: 'parle', data: { actif: false } });
    expect(versParle({ mode: 'bizarre' }, null)).toBeNull();
  });

  it('charge un SDK d\'une version fixée, jamais « latest »', () => {
    expect(VERSION_SDK_ELEVENLABS).toMatch(/^\d+\.\d+\.\d+$/);
    expect(URL_SDK_ELEVENLABS).toBe(`https://esm.sh/@elevenlabs/client@${VERSION_SDK_ELEVENLABS}`);
  });
});

describe('page ÉCO : commandes numérotées', () => {
  it('ne traite chaque n qu\'une fois et répète le dernier accusé', () => {
    const s = new SuiviCommandes();
    expect(s.nouvelle(5)).toBe(true);
    expect(s.nouvelle(5)).toBe(false);
    s.noter(5, 'fait');
    s.noter(5, 'recu');                                       // un recu tardif ne remplace pas un fait
    expect(s.dernier(5)).toEqual({ statut: 'fait' });
    s.noter(6, 'echec', 'pas d\'identifiant d\'agent');
    expect(s.dernier(6)).toEqual({ statut: 'echec', detail: 'pas d\'identifiant d\'agent' });
    expect(s.taille).toBe(2);
  });
});
