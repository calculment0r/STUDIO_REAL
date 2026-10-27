import { describe, expect, it } from 'vitest';
import { lienRole, lienSortie, lireConfig } from './config';
import { adapterReduction, contraintesVideo } from './emetteur';
import type { StatsEmission } from '../flux/stats';

describe('configuration de streamer.html', () => {
  it('lit le fragment (prioritaire) et la requête', () => {
    expect(lireConfig('', '#projet=p_1&jeton=sr_x')).toEqual({ role: 'streamer', serveur: '', projet: 'p_1', jeton: 'sr_x' });
    expect(lireConfig('?projet=p_1&jeton=a', '#jeton=b&role=moniteur&mire=1&relais=1&ice=abc&canal=c2'))
      .toEqual({ role: 'moniteur', serveur: '', projet: 'p_1', jeton: 'b', mire: true, relais: true, ice: 'abc', canal: 'c2' });
    expect(lireConfig('', '#accueil&projet=p&jeton=j')?.role).toBe('accueil');
    expect(lireConfig('', '#projet=p')).toBeNull();
  });

  it('fabrique les liens des rôles et de la sortie', () => {
    const c = { serveur: '', projet: 'p_1', jeton: 'sr_x', ice: 'abc' };
    const l = lienRole('https://t.example/streamer.html#role=accueil', 'streamer', c);
    expect(l).toBe('https://t.example/streamer.html#role=streamer&projet=p_1&jeton=sr_x&ice=abc');
    expect(lireConfig('', new URL(l).hash)).toMatchObject({ role: 'streamer', projet: 'p_1', jeton: 'sr_x', ice: 'abc' });
    expect(lienSortie('https://t.example', c)).toBe('https://t.example/sortie.html?projet=p_1&jeton=sr_x');
  });
});

describe('émetteur (parties pures)', () => {
  it('caméra arrière par défaut en 720p30', () => {
    expect(contraintesVideo('arriere')).toMatchObject({ facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } });
    expect(contraintesVideo('avant').facingMode).toEqual({ ideal: 'user' });
  });

  it('réduit la définition quand la bande passante fait chuter les images/s, la rend quand ça va mieux', () => {
    const mauvais = { imagesParSeconde: 14, limitation: 'bandwidth' } as StatsEmission;
    const bon = { imagesParSeconde: 30, limitation: 'none' } as StatsEmission;
    let p = { reduction: 1, mauvais: 0, bons: 0 };
    for (let i = 0; i < 3; i++) p = adapterReduction(p, mauvais);
    expect(p.reduction).toBe(1.5);
    for (let i = 0; i < 9; i++) p = adapterReduction(p, mauvais);
    expect(p.reduction).toBe(4);                                   // plafond
    for (let i = 0; i < 10; i++) p = adapterReduction(p, bon);
    expect(p.reduction).toBeCloseTo(2.67, 2);
    // caméra à 20 i/s (fausse caméra, éclairage faible) : 19 i/s n'est pas une chute
    let q = { reduction: 1, mauvais: 0, bons: 0 };
    for (let i = 0; i < 5; i++) q = adapterReduction(q, { imagesParSeconde: 19, limitation: 'bandwidth' } as StatsEmission, 20);
    expect(q.reduction).toBe(1);
  });
});
