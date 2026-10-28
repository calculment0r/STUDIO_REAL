// Le magasin des retours des sorties (etat/acteurs.ts) : agrégats du public (écran majoritaire, barre empilée,
// compteurs), diagnostic d'un acteur (pastille, écart demandé / affiché, perte), chute des connectés.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  agregatsFoule, chuteConnectes, diagnosticActeur, etatActeurs, libelleBarre, oublierActeurs, poserEtatActeur, poserResumeSalle,
  resumeSalle, brancherTemoin, pastilleDiagnostic, testerVue, ECART_AMBRE_MS, ECART_ROUGE_MS, PERTE_ACTEUR_MS,
} from './acteurs';
import { vignettesSorties } from './spectacle';

const T = 1_793_000_000_000;
const PUBLIC = { id: 'public', cardinalite: 'n' as const, type: 'public' as const };
const FRANCK = { id: 'franck', cardinalite: 1 as const, type: 'comedien' as const };

beforeEach(() => oublierActeurs());

describe('agrégats du public', () => {
  it('écran majoritaire, barre empilée (hors ligne à la fin), compteurs ; la barre fait le compte des connectés', () => {
    const a = agregatsFoule({ presents: 124, enLigne: 122, prets: 100, parEcran: { noir: 4, vote: 118 } }, { q: '3', recus: 97, parts: [50, 47] });
    expect(a.connectes).toBe(124);
    expect(a.horsLigne).toBe(2);
    expect(a.prets).toBe(100);
    expect(a.votes).toBe(97);
    expect(a.majoritaire).toEqual({ ecran: 'vote', libelle: 'vote Q3', n: 118 });
    expect(a.barre.map(p => p.ecran)).toEqual(['vote', 'noir', 'hors-ligne']);
    expect(a.barre.reduce((s, p) => s + p.n, 0)).toBe(124);
    expect(libelleBarre(a.barre)).toBe('118 vote Q3 · 4 noir · 2 hors ligne');
  });

  it('« aucun écran » passe après les écrans à égalité ; sans résumé : rien', () => {
    const a = agregatsFoule({ presents: 4, enLigne: 4, parEcran: { '': 2, regardez: 2 } });
    expect(a.majoritaire?.ecran).toBe('regardez');
    expect(libelleBarre(a.barre)).toBe('2 regardez · 2 aucun écran');
    expect(a.votes).toBeNull();
    expect(agregatsFoule(undefined)).toMatchObject({ connectes: 0, majoritaire: null, barre: [] });
  });
});

describe('résumé de salle et battements', () => {
  it('poserResumeSalle date la vue demandée à sa première apparition (base de l’écart), garde la date tant que vseq ne change pas', () => {
    poserResumeSalle({ acteurs: { public: { presents: 3, prets: 0, enLigne: 3, demande: { vseq: 4, ecran: 'vote', at: 1 } } } }, T);
    poserResumeSalle({ acteurs: { public: { presents: 3, prets: 1, enLigne: 3, demande: { vseq: 4, ecran: 'vote', at: 1 } } } }, T + 1500);
    expect(resumeSalle().resumes.public!.demandeVueLe).toBe(T);
    poserResumeSalle({ acteurs: { public: { presents: 3, prets: 1, enLigne: 3, demande: { vseq: 5, ecran: 'noir', at: 2 } } } }, T + 3000);
    expect(resumeSalle().resumes.public!.demandeVueLe).toBe(T + 3000);
    expect(resumeSalle().historique.map(h => h.n)).toEqual([3, 3, 3]);
  });

  it('poserEtatActeur fusionne : un accusé d’affichage n’efface pas les médias du battement', () => {
    poserEtatActeur('scene', { ecran: { vseq: 2, ecran: 'mur', depuis: T }, visible: true, media: [{ asset: 'clip.mp4', pret: 1, lecture: 'lit' }], recu: T });
    poserEtatActeur('scene', { ecran: { vseq: 3, ecran: 'vote', depuis: T + 10 }, visible: true, recu: T + 20 });
    expect(etatActeurs().scene).toMatchObject({ acteur: 'scene', source: 'serveur', recu: T + 20, ecran: { vseq: 3, ecran: 'vote' }, media: [{ asset: 'clip.mp4' }] });
  });
});

describe('diagnostic d’un acteur', () => {
  const resume = (vseq: number, ecran: string, demandeVueLe: number, presents = 1) => ({ presents, demande: { vseq, ecran, at: 0 }, demandeVueLe });

  it('acteur nommé qui suit la demande, latence < 1 s : vert ; latence ≥ 1 s : ambre', () => {
    const etat = { acteur: 'franck', recu: T, ecran: { vseq: 3, ecran: 'prompteur', depuis: T }, visible: true, rttMs: 52, source: 'serveur' as const };
    const d = diagnosticActeur({ acteur: FRANCK, etat, resume: resume(3, 'prompteur', T), salleConnue: true, maintenant: T + 500 });
    expect(d).toMatchObject({ pastille: 'verte', liaison: 'reliee', affiche: 'prompteur', demande: 'prompteur', ecartMs: 0, latenceMs: 52 });
    expect(diagnosticActeur({ acteur: FRANCK, etat: { ...etat, rttMs: 1200 }, salleConnue: true, maintenant: T }).pastille).toBe('ambre');
  });

  it('écart demandé / affiché : rien avant 2 s, ambre après 2 s, rouge après 5 s, avec « demandé : X · affiché : Y »', () => {
    const etat = { acteur: 'franck', recu: T, ecran: { vseq: 2, ecran: 'veille', depuis: T }, visible: true, source: 'serveur' as const };
    const r = resume(3, 'prompteur', T);
    const a = (dt: number) => diagnosticActeur({ acteur: FRANCK, etat: { ...etat, recu: T + dt }, resume: r, salleConnue: true, maintenant: T + dt });
    expect(a(1000).pastille).toBe('verte');
    expect(a(ECART_AMBRE_MS + 100)).toMatchObject({ pastille: 'ambre', alertes: ['demandé : prompteur · affiché : veille'] });
    expect(a(ECART_ROUGE_MS + 100).pastille).toBe('rouge');
  });

  it('perdu : hors ligne pour le serveur, ou muet depuis plus de 12 s ; jamais vu : rouge si le serveur répond', () => {
    const etat = { acteur: 'franck', recu: T, ecran: null, visible: true, source: 'serveur' as const };
    expect(diagnosticActeur({ acteur: FRANCK, etat, resume: { presents: 0 }, salleConnue: true, maintenant: T })).toMatchObject({ pastille: 'rouge', liaison: 'perdue' });
    expect(diagnosticActeur({ acteur: FRANCK, etat, salleConnue: true, maintenant: T + PERTE_ACTEUR_MS + 1 })).toMatchObject({ pastille: 'rouge', liaison: 'perdue' });
    expect(diagnosticActeur({ acteur: FRANCK, salleConnue: true, maintenant: T })).toMatchObject({ pastille: 'rouge', alertes: ['jamais connecté'] });
    expect(diagnosticActeur({ acteur: FRANCK, salleConnue: false, maintenant: T }).pastille).toBe('eteinte');
  });

  it('médias absents ou bloqués et erreurs : ambre, en alertes', () => {
    const etat = {
      acteur: 'scene', recu: T, ecran: { vseq: 1, ecran: 'video', depuis: T }, visible: true, source: 'serveur' as const,
      media: [{ asset: 'a.mp4', pret: 0, lecture: 'absent' as const }], erreurs: ['son bloqué'],
    };
    expect(diagnosticActeur({ acteur: { id: 'scene', cardinalite: 1 }, etat, salleConnue: true, maintenant: T }))
      .toMatchObject({ pastille: 'ambre', alertes: ['média absent : a.mp4', 'son bloqué'] });
  });

  it('public : majoritaire comparé à la demande (écart après 2 s) ; personne connecté : ambre', () => {
    const r = { presents: 10, enLigne: 10, prets: 0, parEcran: { noir: 7, vote: 3 }, demande: { vseq: 9, ecran: 'vote', at: 0 }, demandeVueLe: T };
    expect(diagnosticActeur({ acteur: PUBLIC, resume: r, salleConnue: true, maintenant: T + 1000 })).toMatchObject({ pastille: 'verte', affiche: 'noir', ecartMs: 1000 });
    expect(diagnosticActeur({ acteur: PUBLIC, resume: r, vote: { q: '3', recus: 0, parts: [] }, salleConnue: true, maintenant: T + 2500 }))
      .toMatchObject({ pastille: 'ambre', alertes: ['demandé : vote Q3 · affiché : noir'] });
    expect(diagnosticActeur({ acteur: PUBLIC, resume: { presents: 0, enLigne: 0 }, salleConnue: true, maintenant: T })).toMatchObject({ pastille: 'ambre', liaison: 'attente' });
  });
});

describe('chute des connectés', () => {
  it('plus de 10 % en 10 s : alerte ; 10 % ou moins, ou chute plus ancienne : rien', () => {
    expect(chuteConnectes([{ t: T, n: 120 }, { t: T + 4000, n: 118 }, { t: T + 8000, n: 100 }], T + 8000)).toEqual({ avant: 120, apres: 100, part: 20 / 120 });
    expect(chuteConnectes([{ t: T, n: 100 }, { t: T + 5000, n: 90 }], T + 5000)).toBeNull();
    expect(chuteConnectes([{ t: T, n: 120 }, { t: T + 12_000, n: 100 }], T + 12_000)).toBeNull();
    expect(chuteConnectes([], T)).toBeNull();
  });
});

describe('planche des acteurs : pastille, témoin', () => {
  const local = { fenetre: 'fermee' as const, demande: null, affiche: null, ecartDepuis: 0, perimee: false, vuLe: 0 };
  const projet = { acteurs: [{ id: 'franck', nom: 'Franck', type: 'comedien', cardinalite: 1 }, { id: 'public', nom: 'Public', type: 'public', cardinalite: 'n' }] };

  it('la bande se colore quand poserEtatActeur / poserResumeSalle sont appelés (diagnostic du rail → pastilleDiagnostic)', () => {
    const pastilles = (maintenant: number) => Object.fromEntries(
      vignettesSorties({ projet: projet as never, acteurs: resumeSalle(), local, spectacle: true, maintenant }).map(v => [v.id, pastilleDiagnostic(v.diag, v.agregats)]),
    );
    // rien posé : gris « inconnu »
    expect(pastilles(T).franck).toEqual({ texte: 'inconnu', couleur: 'rgba(var(--lr), .35)' });
    poserResumeSalle({ acteurs: { franck: { presents: 1, enLigne: 1 }, public: { presents: 12, enLigne: 12, prets: 12, parEcran: { noir: 12 } } } } as never, T);
    poserEtatActeur('franck', { ecran: { vseq: 1, ecran: 'noir', depuis: T }, visible: true, recu: T });
    const p = pastilles(T + 500);
    expect(p.franck).toEqual({ texte: 'connecté', couleur: 'var(--gt)' });
    expect(p.public).toEqual({ texte: '12 présents', couleur: 'var(--gt)' });
    // Franck se tait : rouge
    expect(pastilles(T + PERTE_ACTEUR_MS + 1000).franck.couleur).toBe('var(--rec)');
  });

  it('pastilleDiagnostic : ambre avec la première alerte, rouge avec la cause, gris sans diagnostic', () => {
    expect(pastilleDiagnostic(undefined)).toEqual({ texte: 'inconnu', couleur: 'rgba(var(--lr), .35)' });
    expect(pastilleDiagnostic({ pastille: 'ambre', liaison: 'reliee', affiche: null, demande: null, ecartMs: 0, alertes: ['écran masqué'] })).toEqual({ texte: 'écran masqué', couleur: 'var(--amb)' });
    expect(pastilleDiagnostic({ pastille: 'rouge', liaison: 'perdue', affiche: null, demande: null, ecartMs: 0, alertes: ['hors ligne'] })).toEqual({ texte: 'hors ligne', couleur: 'var(--rec)' });
  });

  it('testerVue : sans témoin rien ne part ; avec témoin la vue part ; débranché ou refus : message', () => {
    const vue = { acteur: 'public', ecran: 'noir', params: {} };
    expect(testerVue(vue).envoye).toBe(false);
    const recu: unknown[] = [];
    const debrancher = brancherTemoin(v => { recu.push(v); });
    expect(testerVue(vue)).toMatchObject({ envoye: true });
    expect(recu).toEqual([vue]);
    oublierActeurs();   // la déliaison du serveur ne débranche pas l'émulateur
    expect(testerVue(vue).envoye).toBe(true);
    debrancher();
    expect(testerVue(vue).envoye).toBe(false);
    const refus = brancherTemoin(() => false);
    expect(testerVue(vue)).toMatchObject({ envoye: false, message: expect.stringContaining('refusé') });
    refus();
  });
});
