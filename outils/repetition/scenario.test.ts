// Tests du scénario de répétition (module pur) : analyse, tri par temps, seuils, erreurs, et le scénario d'Écho livré.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ErreurScenario, SEUILS_PAR_DEFAUT, appliquerReglages, etapesJouables, evaluerSeuils, libelleEtape, lireScenario,
} from './scenario';

const base = { nom: 'essai', etapes: [] as unknown[] };
const echo = readFileSync(fileURLToPath(new URL('./scenario-echo.json', import.meta.url)), 'utf8');

function problemes(x: unknown): string[] {
  try { lireScenario(x); } catch (e) {
    if (e instanceof ErreurScenario) return e.problemes;
    throw e;
  }
  return [];
}

describe('analyse', () => {
  it('un scénario minimal prend les valeurs par défaut (150 téléphones, mélange soirée, arrivées sur 60 s, seuils de l’audit)', () => {
    const s = lireScenario(base);
    expect(s).toMatchObject({ nom: 'essai', telephones: 150, melange: 'soiree', graine: 2026, auto: false, arrivees: { surS: 60 }, seuils: SEUILS_PAR_DEFAUT, etapes: [] });
    expect(SEUILS_PAR_DEFAUT).toEqual({ p95AckMs: 2000, refus: 0, reconnexionsRatees: 0 });
  });

  it('lit un texte JSON ou un objet, et complète les étapes (vote : 20 s, part 1 ; toucher : 5 s ; ecrire : 60 s)', () => {
    const s = lireScenario(JSON.stringify({
      ...base, duree: 120,
      etapes: [
        { a: 10, faire: 'vote', repartition: { A: 60, B: 40 } },
        { a: 20, faire: 'toucher', selecteur: 'bouton' },
        { a: 30, faire: 'ecrire', parMinute: 30 },
        { a: 40, faire: 'coupure', part: 0.1, dureeS: 20 },
        { a: 50, faire: 'go' },
        { a: 60, faire: 'attendre', note: 'repère' },
      ],
    }));
    expect(s.duree).toBe(120);
    expect(s.etapes).toEqual([
      { a: 10, faire: 'vote', repartition: { A: 60, B: 40 }, dansS: 20, part: 1 },
      { a: 20, faire: 'toucher', selecteur: 'bouton', dansS: 5, part: 1 },
      { a: 30, faire: 'ecrire', parMinute: 30, dureeS: 60, part: 1 },
      { a: 40, faire: 'coupure', part: 0.1, dureeS: 20 },
      { a: 50, faire: 'go' },
      { a: 60, faire: 'attendre', note: 'repère' },
    ]);
  });

  it('la durée par défaut est la dernière étape + 30 s', () => {
    expect(lireScenario({ ...base, etapes: [{ a: 100, faire: 'go' }] }).duree).toBe(130);
    expect(lireScenario(base).duree).toBe(30);
  });

  it('le scénario d’Écho livré est valide : 150 téléphones, 5 minutes, arrivées sur 60 s, des GO, des votes, des messages, des coupures', () => {
    const s = lireScenario(echo);
    expect(s).toMatchObject({ telephones: 150, melange: 'soiree', duree: 300, arrivees: { surS: 60 }, auto: false });
    const faire = s.etapes.map(e => e.faire);
    for (const f of ['go', 'vote', 'ecrire', 'toucher', 'coupure']) expect(faire).toContain(f);
    expect(s.etapes.every(e => e.a < s.duree)).toBe(true);
    // les arrivées sont finies avant la première étape
    expect(s.etapes[0]!.a).toBeGreaterThanOrEqual(s.arrivees.surS);
    const vote = s.etapes.find(e => e.faire === 'vote');
    expect(vote).toMatchObject({ part: 0.7 });
    expect(s.etapes.find(e => e.faire === 'ecrire')).toMatchObject({ parMinute: 30 });
    expect(s.etapes.find(e => e.faire === 'coupure')).toMatchObject({ part: 0.1, dureeS: 20 });
  });
});

describe('tri par temps', () => {
  it('les étapes sont rangées par heure, et à heure égale dans l’ordre du fichier', () => {
    const s = lireScenario({
      ...base,
      etapes: [
        { a: 30, faire: 'go', note: 'troisième' },
        { a: 10, faire: 'go', note: 'premier' },
        { a: 20, faire: 'attendre', note: 'deuxième a' },
        { a: 20, faire: 'go', note: 'deuxième b' },
      ],
    });
    expect(s.etapes.map(e => e.note)).toEqual(['premier', 'deuxième a', 'deuxième b', 'troisième']);
  });

  it('etapesJouables : ce qui tombe après la durée est ignoré mais dit', () => {
    const s = appliquerReglages(lireScenario({ ...base, duree: 100, etapes: [{ a: 10, faire: 'go' }, { a: 99, faire: 'go' }, { a: 100, faire: 'go' }, { a: 250, faire: 'go' }] }), { duree: 90 });
    const { jouees, ignorees } = etapesJouables(s);
    expect(jouees.map(e => e.a)).toEqual([10]);
    expect(ignorees.map(e => e.a)).toEqual([99, 100, 250]);
  });
});

describe('réglages de la ligne de commande', () => {
  it('--telephones, --melange, --duree l’emportent sur le fichier ; des valeurs absurdes sont refusées', () => {
    const s = lireScenario(echo);
    expect(appliquerReglages(s, { telephones: 40, melange: 'difficile', duree: 90 })).toMatchObject({ telephones: 40, melange: 'difficile', duree: 90, nom: s.nom });
    expect(appliquerReglages(s, {})).toEqual(s);
    expect(() => appliquerReglages(s, { telephones: 0 })).toThrow(/telephones/);
    expect(() => appliquerReglages(s, { telephones: 2.5 })).toThrow(ErreurScenario);
    expect(() => appliquerReglages(s, { duree: -3 })).toThrow(/duree/);
  });
});

describe('seuils', () => {
  const seuils = SEUILS_PAR_DEFAUT;
  const bon = { p95AckMs: 120, accuses: 3000, refus: 0, reconnexionsRatees: 0 };

  it('tenus : p95 ≤ 2000 ms, aucun refus, aucune reconnexion ratée', () => {
    expect(evaluerSeuils(seuils, bon)).toEqual({ ok: true, depassements: [] });
    expect(evaluerSeuils(seuils, { ...bon, p95AckMs: 2000 }).ok).toBe(true);
  });

  it('chaque dépassement est dit, avec le chiffre et le seuil', () => {
    const v = evaluerSeuils(seuils, { p95AckMs: 2300, accuses: 10, refus: 3, reconnexionsRatees: 2 });
    expect(v.ok).toBe(false);
    expect(v.depassements).toHaveLength(3);
    expect(v.depassements.join('\n')).toMatch(/2300 ms > seuil 2000 ms/);
    expect(v.depassements.join('\n')).toMatch(/3 refus .* seuil 0/);
    expect(v.depassements.join('\n')).toMatch(/2 reconnexion\(s\) ratée\(s\) .* seuil 0/);
  });

  it('des seuils plus larges s’appliquent (refus tolérés)', () => {
    const large = lireScenario({ ...base, seuils: { p95AckMs: 3000, refus: 5 } }).seuils;
    expect(large).toEqual({ p95AckMs: 3000, refus: 5, reconnexionsRatees: 0 });
    expect(evaluerSeuils(large, { ...bon, p95AckMs: 2500, refus: 5 }).ok).toBe(true);
  });

  it('zéro accusé mesuré n’est pas une réussite : rien n’a été prouvé', () => {
    const v = evaluerSeuils(seuils, { ...bon, accuses: 0, p95AckMs: 0 });
    expect(v.ok).toBe(false);
    expect(v.depassements[0]).toMatch(/aucun accusé/);
  });
});

describe('erreurs', () => {
  it('JSON illisible, objet absent, étapes absentes', () => {
    expect(problemes('{ pas du json')[0]).toMatch(/JSON illisible/);
    expect(problemes([1, 2])[0]).toMatch(/objet JSON/);
    expect(problemes({ nom: 'x' })).toContain('etapes : une liste est attendue');
    expect(problemes({ etapes: [] })).toContain('nom : un texte non vide est attendu');
  });

  it('tous les problèmes sont rendus d’un coup, avec le rang de l’étape fautive', () => {
    const p = problemes({
      ...base, telephones: 0, duree: -1, arrivees: 'vite', seuils: { p95: 100, refus: -1 },
      etapes: [
        { a: -5, faire: 'go' },
        { a: 10, faire: 'danser' },
        { a: 20, faire: 'vote' },
        { a: 30, faire: 'vote', repartition: { A: 60 }, dureS: 5 },
        { a: 40, faire: 'coupure', part: 1.5, dureeS: 0 },
        { a: 50, faire: 'toucher' },
        { a: 60, faire: 'ecrire', parMinute: 0 },
        'go',
      ],
    });
    const texte = p.join('\n');
    expect(texte).toMatch(/telephones : 0 est trop petit/);
    expect(texte).toMatch(/duree : -1 est trop petit/);
    expect(texte).toMatch(/arrivees : un objet/);
    expect(texte).toMatch(/seuils\.p95 : seuil inconnu/);
    expect(texte).toMatch(/seuils\.refus : -1 est trop petit/);
    expect(texte).toMatch(/etapes\[0\]\.a : -5 est trop petit/);
    expect(texte).toMatch(/etapes\[1\]\.faire : « danser » inconnu/);
    expect(texte).toMatch(/etapes\[2\]\.repartition/);
    expect(texte).toMatch(/etapes\[3\]\.dureS : clé inconnue pour « vote »/);
    expect(texte).toMatch(/etapes\[4\]\.part : 1\.5 est trop grand/);
    expect(texte).toMatch(/etapes\[4\]\.dureeS : 0 est trop petit/);
    expect(texte).toMatch(/etapes\[5\]\.selecteur/);
    expect(texte).toMatch(/etapes\[6\]\.parMinute/);
    expect(texte).toMatch(/etapes\[7\] : un objet est attendu/);
  });

  it('l’erreur porte un message en français qui liste les problèmes', () => {
    expect(() => lireScenario({ ...base, etapes: [{ a: 1, faire: 'danser' }] })).toThrow(/^Scénario invalide :\n {2}- etapes\[0\]\.faire/);
  });
});

describe('libellés', () => {
  it('une ligne lisible par étape', () => {
    expect(libelleEtape({ a: 1, faire: 'go' })).toBe('GO');
    expect(libelleEtape({ a: 1, faire: 'vote', repartition: { A: 60, B: 40 }, dansS: 15, part: 0.7 })).toBe('vote de 70 % des téléphones en 15 s (A 60, B 40)');
    expect(libelleEtape({ a: 1, faire: 'coupure', part: 0.1, dureeS: 20 })).toBe('coupure de 10 % des téléphones pendant 20 s');
    expect(libelleEtape({ a: 1, faire: 'ecrire', parMinute: 30, dureeS: 60, part: 1 })).toBe('messages : 30/min pendant 60 s');
    expect(libelleEtape({ a: 1, faire: 'toucher', selecteur: 'bouton', dansS: 5, part: 0.9 })).toBe('« bouton » touché par 90 % en 5 s');
    expect(libelleEtape({ a: 1, faire: 'attendre', note: 'pause café' })).toBe('repère « pause café »');
  });
});
