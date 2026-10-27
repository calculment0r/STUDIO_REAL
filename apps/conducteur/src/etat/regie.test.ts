import { describe, expect, it } from 'vitest';
import { chargerFichier, creerLecteur, exempleDemo, planifier, signauxSalle, type Projet } from '@studio-real/modele';
import live from '../../../../projets/live/live.conducteur.json';
import { enNombre, ligneAlerte, ligneCommande, ligneEvenement, lireValeur, memoiresRegie, resumeCommande, signauxAttendus } from './regie';

const projetLive = (): Projet => chargerFichier(JSON.stringify(live)).project;

describe('pupitre de la régie · mémoires', () => {
  it('liste les mémoires du LIVE, celles écrites de l’extérieur déclarées, celles du moment en tête', () => {
    const p = projetLive();
    const l = memoiresRegie(p, 'connexion');
    const noms = l.map(m => m.nom);
    for (const n of ['recu_lance', 'flux_perdu', 'jauge', 'missions', 'camp_gagnant', 'homme', 'destination', 'defi']) expect(noms).toContain(n);
    expect(l[0]!.ici).toBe(true);
    expect(l.filter(m => m.ici).map(m => m.nom).sort()).toEqual(['flux_perdu', 'recu_lance']);
    const ext = l.filter(m => m.exterieure).map(m => m.nom).sort();
    expect(ext).toEqual(['camp_gagnant', 'flux_perdu', 'jauge', 'missions', 'recu_lance']);
    const jauge = l.find(m => m.nom === 'jauge')!;
    expect(jauge).toMatchObject({ numerique: true, pas: 100, min: 0, max: 1000 });
    expect(l.find(m => m.nom === 'recu_lance')!.choix).toEqual(expect.arrayContaining(['oui', 'non']));
    expect(l.find(m => m.nom === 'camp_gagnant')!.choix).toEqual(['Chocolatines', 'Pains au chocolat']);
    expect(l.find(m => m.nom === 'destination')!.choix).toEqual(expect.arrayContaining(['boulangerie', 'toit', 'metro']));
  });

  it('valeurs saisies et lues', () => {
    expect(lireValeur(' 600 ')).toBe(600);
    expect(lireValeur('2,5')).toBe(2.5);
    expect(lireValeur('oui')).toBe('oui');
    expect(enNombre('oui')).toBe(1);
    expect(enNombre(undefined)).toBe(0);
    expect(enNombre(3)).toBe(3);
  });
});

describe('pupitre de la régie · signaux attendus', () => {
  it('signal « recu » du garde-fou du moment 4 (condition sig:)', () => {
    const s = signauxAttendus(projetLive(), 'connexion', 'co_recu');
    expect(s.map(x => x.nom)).toContain('recu');
  });

  it('blocs à événements : Écoute d’un signal, Commande machine, Message, Quand le comédien dit', () => {
    const p = exempleDemo();
    const m = p.ev[0]!;
    m.st.push(
      { id: 'sg', name: 'Fin de musique', ty: 'q:signal', c: 9, r: 0, dx: 0, dy: 0, k: [0, 0, 0], params: { signal: '/qlab/fin' } },
      { id: 'mc', name: 'Console', ty: 's:machine', c: 10, r: 0, dx: 0, dy: 0, k: [0, 0, 50] },
      { id: 'ms', name: 'Consigne', ty: 'c:message', c: 11, r: 0, dx: 0, dy: 0, k: [0, 0, 50] },
      { id: 'cd', name: 'Il dit', ty: 'q:comedien-dit', c: 12, r: 0, dx: 0, dy: 0, k: [0, 50, 0], params: { mots: 'pigeon, gâteau' } },
    );
    const s = signauxAttendus(p, m.id, 'mc');
    expect(s[0]).toMatchObject({ nom: 'accuse:mc', genre: 'accuse' });
    expect(s.map(x => x.nom)).toEqual(expect.arrayContaining(['/qlab/fin', 'accuse:mc', 'lu:ms', 'transcription']));
    expect(s.find(x => x.genre === 'transcription')!.mots).toEqual(['pigeon', 'gâteau']);
    expect(signauxAttendus(p, 'inconnu')).toEqual([]);
  });
});

describe('LIVE : entrées extérieures branchées sur le moteur', () => {
  it('le bouton Reçu (signal recu ou mémoire posée) fait sortir le garde-fou du moment 4 par « condition remplie »', () => {
    for (const entree of ['signal', 'memoire'] as const) {
      const p = projetLive();
      const l = creerLecteur(p, { mode: 'repetition' });
      let e = l.allerA('connexion');
      for (let i = 0; i < 400 && e.etape !== 'co_recu'; i++) e = l.avancer(0.5, signauxSalle(p.sens, e.tEtape));
      expect(e.etape).toBe('co_recu');
      e = entree === 'signal' ? l.signal('recu') : l.poser('recu_lance', 'oui');
      for (let i = 0; i < 20 && e.etape === 'co_recu'; i++) e = l.avancer(0.5, signauxSalle(p.sens, e.tEtape));
      expect(e.etape).toBe('co_direct');
      expect(e.journal?.some(j => j.type === (entree === 'signal' ? 'signal' : 'memoire'))).toBe(true);
    }
  });

  it('la roue ne tire qu’entre les ex æquo et la durée prévue reste calculable', () => {
    const p = projetLive();
    const roue = p.ev.find(m => m.id === 'choix')!.st.find(s => s.id === 'vo_roue')!;
    expect(roue.params?.exaequo).toBe(true);
    expect(planifier(p).total).toBeGreaterThan(30 * 60);
  });
});

describe('journal de régie', () => {
  it('commandes, entrées et alertes en lignes compactes', () => {
    expect(resumeCommande({ type: 'machine', donnees: { cible: 'QLab', commande: '/qlab/go/climax' } })).toBe('QLab · /qlab/go/climax');
    expect(ligneCommande({ n: 1, t: 12, type: 'figurants.cmd', moment: 'm', donnees: { densite: 'chaud', humeur: 'neutre' } }, 7, 0))
      .toMatchObject({ n: 7, genre: 'commande', type: 'FIGURANTS', txt: 'chaud · neutre' });
    expect(ligneEvenement({ t: 3, type: 'memoire', nom: 'jauge', valeur: 600, moment: 'm' }, 1, 0)).toMatchObject({ type: 'MÉMOIRE', txt: 'jauge = 600' });
    expect(ligneEvenement({ t: 3, type: 'sous-etape', nom: 'x', moment: 'm' }, 1, 0)).toBeNull();
    expect(ligneAlerte({ t: 5, moment: 'm', type: 'machine', txt: 'QLab ne répond pas' }, 2, 0)).toMatchObject({ genre: 'alerte', type: 'MACHINE' });
  });
});
