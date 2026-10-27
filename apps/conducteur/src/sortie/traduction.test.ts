import { describe, expect, it } from 'vitest';
import type { CommandeLecture, EtatLecture, Projet } from '@studio-real/modele';
import brutLive from '../../../../projets/live/live.conducteur.json?raw';
import { configParDefaut, type ConfigSortie } from './protocole';
import { clipActif, sceneDeNom, tempsDansMoment, traduire } from './traduction';

const LIVE = (JSON.parse(brutLive) as { project: Projet }).project;
const CONFIG: ConfigSortie = { ...configParDefaut('LIVE'), adresse: 'https://exemple.test/live/', code: 'K7Q2', secours: 'connexion_perdue.mp4' };

/** État de lecture minimal : dans `moment`, à l'étape `etape`, entré dans le moment à `debut`, dans l'étape depuis tEtape. */
function etat(moment: string, etape: string | null, t: number, o: Partial<EtatLecture> & { debut?: number; avant?: [string, string, number][] } = {}): EtatLecture {
  const tEtape = o.tEtape ?? 0;
  const parcours: [string, string, number][] = [...(o.avant ?? []), ...(etape ? [[moment, etape, t - tEtape] as [string, string, number]] : [])];
  if (o.debut !== undefined && !o.avant) parcours.unshift([moment, '__entree', o.debut]);
  return {
    t, moment, etape, tEtape, attenteGo: false, retard: 0, bloque: false, termine: false, memoires: {}, parcours,
    phase: etape ? 'etape' : 'passage', ...o,
  };
}
const tr = (l: EtatLecture | null, p: Projet = LIVE, enLecture = true) => traduire({ projet: p, lecture: l, enLecture, config: CONFIG });

describe('traduction état de lecture → scène (projet LIVE)', () => {
  it('rien de lancé : QR d’accueil avec le code de la représentation', () => {
    const r = tr(null);
    expect(r.origine).toBe('arret');
    expect(r.scene).toEqual({ type: 'accueil-qr', adresse: 'https://exemple.test/live/?r=K7Q2', titre: 'LIVE', consigne: 'Scannez pour entrer', code: 'K7Q2' });
    expect(r.etat.phase).toBe('arret');
  });

  it('hall : le clip « attente_qr.mp4 » donne le QR généré, puis « starting_soon.mp4 » une vidéo locale', () => {
    expect(tr(etat('hall', 'h_portes', 10, { tEtape: 10 })).scene.type).toBe('accueil-qr');
    const r = tr(etat('hall', 'h_placement', 600, { tEtape: 10, avant: [['hall', 'h_portes', 0]] }));
    expect(r.origine).toBe('clip');
    expect(r.scene).toEqual({ type: 'video', asset: 'starting_soon.mp4' });
  });

  it('étape neutre sans clip : la scène est héritée de l’étape précédente du moment', () => {
    const r = tr(etat('hall', 'h_garde', 400, { tEtape: 100, avant: [['hall', 'h_portes', 0]] }));
    expect(r.origine).toBe('heritee');
    expect(r.scene.type).toBe('accueil-qr');
  });

  it('noir salle (fondu) l’emporte sur tout clip', () => {
    const r = tr(etat('noir', 'no_noir', 900, { tEtape: 2, avant: [['noir', 'no_annonce', 880]] }));
    expect(r.scene).toEqual({ type: 'noir' });
  });

  it('vote : ouvert avec question, options et compte à rebours ; décompte ; issue révélée', () => {
    const avant: [string, string, number][] = [['choix', 'vo_gabarit', 1000]];
    const o = tr(etat('choix', 'vo_question', 1010, { tEtape: 5, avant }));
    expect(o.scene).toMatchObject({ type: 'vote', phase: 'ouvert', question: 'Où doit-il aller ?' });
    expect(o.scene.type === 'vote' && o.scene.options.map((x) => x.libelle)).toEqual(['La boulangerie', 'Le toit', 'Le métro']);
    expect(o.etat.compteur).toMatchObject({ enCours: true, vitesse: 1 });
    expect(o.etat.compteur!.restant).toBeGreaterThan(0);
    expect(tr(etat('choix', 'vo_decompte', 1100, { tEtape: 1, avant })).scene).toMatchObject({ type: 'vote', phase: 'decompte' });
    const rev = tr(etat('choix', 'vo_A', 1110, { tEtape: 1, avant, issue: 'A', votes: { A: 52, B: 30, C: 18 } }));
    expect(rev.scene).toMatchObject({ type: 'vote', phase: 'revele', gagnant: 'A', resultats: { A: 52, B: 30, C: 18 } });
  });

  it('chat libre : le clip « flux_chef (WebRTC) » donne le direct avec le gabarit de l’étape', () => {
    const r = tr(etat('chat', 'ch_libre', 2000, { tEtape: 5, avant: [['chat', 'ch_ouvre', 1990]] }));
    expect(r.origine).toBe('clip');
    expect(r.scene).toEqual({ type: 'streamer', gabarit: 'calme' });
  });

  it('clips qui se chevauchent : le plus récent, à départ égal le plus court', () => {
    expect(clipActif(LIVE, 'connexion', 86)?.name).toBe('habillage_en_direct.mp4');
    expect(clipActif(LIVE, 'connexion', 95)?.name).toBe('flux_chef (WebRTC)');
    expect(clipActif(LIVE, 'choix', 105)?.name).toBe('revelation_vote.mp4');
    expect(clipActif(LIVE, 'climax', 270)?.name).toBe('coupure_flux.mp4');
  });

  it('préchargement : la vidéo qui arrive dans les 20 s et la vidéo de secours', () => {
    const r = tr(etat('hall', 'h_garde', 560, { tEtape: 100, avant: [['hall', 'h_portes', 0]] }));
    expect(r.precharger).toEqual(['starting_soon.mp4', 'connexion_perdue.mp4']);
  });

  it('fin du spectacle : noir', () => {
    expect(tr(etat('apres', null, 9000, { termine: true, phase: 'fin' })).scene).toEqual({ type: 'noir' });
  });

  it('temps dans le moment : depuis la première étape de la série en cours', () => {
    expect(tempsDansMoment(etat('hall', 'h_garde', 400, { avant: [['tuto', 'x', 0], ['hall', 'h_portes', 100]] }))).toBe(300);
  });

  it('noms d’assets : flux, QR, noir, image, vidéo, page ignorée', () => {
    expect(sceneDeNom('flux_chef (WebRTC)', CONFIG)).toEqual({ type: 'streamer' });
    expect(sceneDeNom('Écran noir', CONFIG)).toEqual({ type: 'noir' });
    expect(sceneDeNom('affiche_live.png', CONFIG)).toEqual({ type: 'image', asset: 'affiche_live.png' });
    expect(sceneDeNom('coupure_flux.mp4', CONFIG)).toEqual({ type: 'video', asset: 'coupure_flux.mp4' });
    expect(sceneDeNom('tutoriel_miroir.html', CONFIG)).toBeNull();
  });
});

// ── projet minimal : chrono visible et scène déclarée ───────────────────────────────────────────────────────────
function projet(st: Projet['ev'][number]['st'], act = 1): Projet {
  return {
    titre: 'Essai', acts: [{ n: 'I' }, { n: 'II' }],
    ev: [{ id: 'm', act, name: 'Moment', entry: st[0].id, st, tr: [], gate: { mode: 'auto', g: [] } }],
    sens: { aff: 50, part: 50, calme: 50, pen: 50 }, hold: {}, go: {}, ver: 1, nid: 10, tracks: [],
  };
}
const cmd = (n: number, type: CommandeLecture['type'], donnees: Record<string, unknown>, t = 100): CommandeLecture => ({ n, t, type, moment: 'm', etape: 'ch', donnees });

describe('traduction : chrono visible et scène déclarée', () => {
  const P = projet([{ id: 'ch', name: 'Il reste…', ty: 'u:chrono', c: 0, r: 0, dx: 0, dy: 0, k: [5, 50, 100], params: { duree: 30 } }, { id: 'jeu', name: 'Jeu', ty: 'k:scene', c: 1, r: 0, dx: 0, dy: 0, k: [5] }]);

  it('chrono « écran de scène » : chrono géant et compteur', () => {
    const l = etat('m', 'ch', 110, { tEtape: 10, commandes: [cmd(1, 'chrono', { duree: 30, affichage: 'écran de scène', fin: 130 })] });
    const r = traduire({ projet: P, lecture: l, enLecture: true, vitesse: 2, config: CONFIG });
    expect(r.scene).toEqual({ type: 'chrono', duree: 30, titre: 'Il reste…' });
    expect(r.etat.compteur).toEqual({ restant: 20, duree: 30, enCours: true, vitesse: 2 });
  });

  it('le compte continue après la sortie « 10 s restantes » ; pas de chrono s’il est réservé aux téléphones', () => {
    const l = etat('m', 'jeu', 125, { tEtape: 5, commandes: [cmd(1, 'chrono', { duree: 30, affichage: 'les deux', fin: 130 }), cmd(2, 'chrono.10s', { restant: 10, affichage: 'les deux', fin: 130 }, 120)] });
    const r = traduire({ projet: P, lecture: l, enLecture: false, config: CONFIG });
    expect(r.scene.type).toBe('chrono');
    expect(r.etat.compteur).toMatchObject({ restant: 5, duree: 30, enCours: false });
    const tel = etat('m', 'ch', 110, { tEtape: 10, commandes: [cmd(1, 'chrono', { duree: 30, affichage: 'téléphones', fin: 130 })] });
    expect(traduire({ projet: P, lecture: tel, enLecture: true, config: CONFIG }).scene.type).not.toBe('chrono');
  });

  it('params.sortie : l’étape déclare sa scène (texte ou objet)', () => {
    const Q = projet([
      { id: 'a', name: 'Entracte', ty: 'k:attente', c: 0, r: 0, dx: 0, dy: 0, k: [5], params: { sortie: 'titre', texte: 'ENTRACTE' } },
      { id: 'b', name: 'Carton', ty: 'k:scene', c: 1, r: 0, dx: 0, dy: 0, k: [5], params: { sortie: { type: 'titre', titre: 'Fin', sousTitre: 'merci' } } },
    ]);
    expect(traduire({ projet: Q, lecture: etat('m', 'a', 5, { tEtape: 5 }), enLecture: true, config: CONFIG }).scene).toEqual({ type: 'titre', titre: 'ENTRACTE' });
    expect(traduire({ projet: Q, lecture: etat('m', 'b', 5, { tEtape: 5 }), enLecture: true, config: CONFIG }).scene).toEqual({ type: 'titre', titre: 'Fin', sousTitre: 'merci' });
  });

  it('défaut : QR dans le premier acte, direct ensuite', () => {
    const neutre = [{ id: 'x', name: 'Attendre', ty: 'f2', c: 0, r: 0, dx: 0, dy: 0, k: [5] }];
    expect(traduire({ projet: projet(neutre, 0), lecture: etat('m', 'x', 1), enLecture: true, config: CONFIG }).scene.type).toBe('accueil-qr');
    expect(traduire({ projet: projet(neutre, 1), lecture: etat('m', 'x', 1), enLecture: true, config: CONFIG }).scene).toEqual({ type: 'streamer' });
  });
});
