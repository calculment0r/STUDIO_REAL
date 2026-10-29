// Boucle PixiJS du calque de réactions (lot performance-react, audit de fluidité 07, cause 7) : arrêtée quand le calque est
// invisible, relancée quand il est montré. Sans WebGL : on construit l'objet sans passer par `creer` et on lui donne un
// faux « ticker » et un faux conteneur ; seul le raisonnement d'arrêt et de reprise est testé ici.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalqueReactions } from './calque';

interface Interne {
  hote: { style: { opacity: string } };
  app: { ticker: { stop: () => void; start: () => void }; canvas: { style: { opacity: string } } };
  suspendu: boolean;
  regulerTicker: () => void;
  recevoir: CalqueReactions['recevoir'];
  afficher: CalqueReactions['afficher'];
  detruire: CalqueReactions['detruire'];
}

function faux() {
  const ticker = { stop: vi.fn(), start: vi.fn() };
  const c = Object.create(CalqueReactions.prototype) as unknown as Interne;
  c.hote = { style: { opacity: '1' } };
  c.app = { ticker, canvas: { style: { opacity: '1' } } };
  c.suspendu = false;
  return { c, ticker };
}

describe('calque PixiJS : la boucle s’arrête quand le calque est invisible', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('visible : la boucle tourne et rien n’est arrêté', () => {
    const { c, ticker } = faux();
    c.regulerTicker();
    vi.advanceTimersByTime(5000);
    expect(ticker.stop).not.toHaveBeenCalled();
    expect(c.suspendu).toBe(false);
  });

  it('invisible (opacité du conteneur posée par la page de sortie) : la boucle s’arrête APRÈS le fondu de 500 ms, pas avant', () => {
    const { c, ticker } = faux();
    c.hote.style.opacity = '0';
    c.regulerTicker();
    vi.advanceTimersByTime(400);
    expect(ticker.stop).not.toHaveBeenCalled();     // le fondu de sortie.css n'est pas fini : on le laisse s'effacer
    vi.advanceTimersByTime(300);
    expect(ticker.stop).toHaveBeenCalledTimes(1);
    expect(c.suspendu).toBe(true);
  });

  it('remontré avant la fin du fondu : la boucle n’est jamais arrêtée ; remontré après : elle repart', () => {
    const { c, ticker } = faux();
    c.hote.style.opacity = '0';
    c.regulerTicker();
    vi.advanceTimersByTime(300);
    c.hote.style.opacity = '1';
    c.regulerTicker();
    vi.advanceTimersByTime(2000);
    expect(ticker.stop).not.toHaveBeenCalled();
    c.hote.style.opacity = '0';
    c.regulerTicker();
    vi.advanceTimersByTime(700);
    expect(ticker.stop).toHaveBeenCalledTimes(1);
    c.hote.style.opacity = '1';
    c.regulerTicker();
    expect(ticker.start).toHaveBeenCalledTimes(1);
    expect(c.suspendu).toBe(false);
  });

  it('afficher(false) cache le canevas et arrête la boucle ; afficher(true) la relance', () => {
    const { c, ticker } = faux();
    c.afficher(false);
    expect(c.app.canvas.style.opacity).toBe('0');
    vi.advanceTimersByTime(700);
    expect(ticker.stop).toHaveBeenCalledTimes(1);
    c.afficher(true);
    expect(ticker.start).toHaveBeenCalledTimes(1);
  });

  it('arrêté, le calque ignore les événements du public (ils se déverseraient en rafale au retour) mais garde le gabarit', () => {
    const { c } = faux();
    const pousser = vi.fn();
    const gabarit = vi.fn();
    Object.assign(c, { pousser, gabarit, vedette: { montrer: pousser }, jauge: { ajouter: pousser }, feux: { taper: pousser, lancer: pousser }, coeurs: { aimer: pousser }, reglages: { feux: true, coeurs: true } });
    c.suspendu = true;
    c.recevoir({ type: 'pop', auteur: 'zoe', texte: 'salut' } as never);
    c.recevoir({ type: 'coeurs', n: 3 } as never);
    expect(pousser).not.toHaveBeenCalled();
    c.recevoir({ type: 'gabarit', gabarit: 'chat' } as never);
    expect(gabarit).toHaveBeenCalledWith('chat');
  });
});
