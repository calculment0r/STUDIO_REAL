import { describe, expect, it } from 'vitest';
import type { CommandeLecture, EtatLecture, Projet } from '@studio-real/modele';
import brutLive from '../../../../projets/live/live.conducteur.json?raw';
import { configParDefaut, sceneValide, type ConfigSortie } from './protocole';
import { ASSET_FLUX_DEFAUT, clipActif, ECRANS_SORTIE, lireFxScene, sceneDeNom, sceneDeVue, tempsDansMoment, traduire } from './traduction';

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

// ── serveur de spectacle : vue de l'acteur `scene` → scène de rendu ────────────────────────────────────────────
describe('vue de l’acteur scene → scène (sceneDeVue)', () => {
  const vue = (ecran: string | null, params: Record<string, unknown> = {}, at = 5000) => sceneDeVue({ ecran, params, at }, CONFIG);
  const scene = (ecran: string | null, params: Record<string, unknown> = {}, at = 5000) => {
    const r = vue(ecran, params, at);
    if (!('scene' in r)) throw new Error(`refus ${r.refus} pour ${ecran}`);
    return r.scene;
  };

  it('noir, et aucun écran encore (null) : noir', () => {
    expect(scene('noir')).toEqual({ type: 'noir' });
    expect(scene(null)).toEqual({ type: 'noir' });
  });

  it('accueil-qr (et qr) : le QR de la configuration, réglable', () => {
    expect(scene('accueil-qr')).toEqual({ type: 'accueil-qr', adresse: 'https://exemple.test/live/?r=K7Q2', titre: 'LIVE', consigne: 'Scannez pour entrer', code: 'K7Q2' });
    expect(scene('qr', { titre: 'ÉCHO', code: 'Z9' })).toMatchObject({ type: 'accueil-qr', titre: 'ÉCHO', code: 'Z9', adresse: 'https://exemple.test/live/?r=Z9' });
  });

  it('video : asset local, boucle par défaut ; sans asset (ou avec un chemin) : refus invalide', () => {
    expect(scene('video', { asset: 'zoom_junon.mp4', boucle: false, son: true, cadrage: 'contain', legende: 'Junon' }))
      .toEqual({ type: 'video', asset: 'zoom_junon.mp4', boucle: false, son: true, cadrage: 'contain', legende: 'Junon' });
    expect(scene('video', { asset: 'a.mp4' })).toEqual({ type: 'video', asset: 'a.mp4' });
    expect(vue('video', {})).toEqual({ refus: 'invalide', ecran: 'video' });
    expect(vue('video', { asset: '../secret/a.mp4' })).toEqual({ refus: 'invalide', ecran: 'video' });
  });

  it('flux-video : la vidéo LOCALE du flux Instagram, lue une fois avec le son (plus de page flux/ en iframe)', () => {
    expect(scene('flux-video')).toEqual({ type: 'video', asset: ASSET_FLUX_DEFAUT, boucle: false, son: true, cadrage: 'contain' });
    expect(scene('flux-video', { asset: 'flux_b.mp4', boucle: true, son: false })).toMatchObject({ asset: 'flux_b.mp4', boucle: true, son: false });
  });

  it('titre : titre ou texte, surtitre, sous-titre', () => {
    expect(scene('titre', { titre: 'ENTRACTE', surtitre: 'Écho', sousTitre: '10 min' })).toEqual({ type: 'titre', titre: 'ENTRACTE', surtitre: 'Écho', sousTitre: '10 min' });
    expect(scene('titre', { texte: 'Fin' })).toEqual({ type: 'titre', titre: 'Fin' });
  });

  it('mur : messages, vote objet, audio repris depuis l’heure de la vue, titre, QR en coin', () => {
    const s = scene('mur', {
      titre: 'ÉCHO · LE MUR', qr: true, audio: 'junon_discours.mp3',
      messages: [{ id: 1, pseudo: '@zoe', texte: 'salut', couleur: '--cy', grand: true }, { pseudo: 'x', texte: '' }, { auteur: 'kev', texte: 'yo', couleur: 'red' }],
      vote: { etat: 'ouvert', numero: 1, question: 'Dur d’être un homme blanc ?', reponses: ['oui', 'non', 'bof', 'joker'], comptes: [4, 1, 0, 2] },
    }, 7000);
    expect(s).toEqual({
      type: 'mur', titre: 'ÉCHO · LE MUR', qr: 'https://exemple.test/live/?r=K7Q2', audio: { asset: 'junon_discours.mp3', depuis: 7000 },
      messages: [{ id: '1', pseudo: 'zoe', texte: 'salut', couleur: '--cy', grand: true }, { pseudo: 'kev', texte: 'yo' }],
      vote: { etat: 'ouvert', numero: 1, question: 'Dur d’être un homme blanc ?', reponses: ['oui', 'non', 'bof', 'joker'], comptes: [4, 1, 0, 2] },
    });
  });

  it('mur : forme des commandes converties ({vote:"revele", scores}) → pourcentages ; vote fermé et audio null : rien', () => {
    expect(scene('mur', { vote: 'revele', numero: 2, question: 'Q', reponses: ['a', 'b', 'c', 'd'], scores: [41, 9, 37, 13], resultat: 'Le public a choisi A' }))
      .toEqual({ type: 'mur', vote: { etat: 'revele', numero: 2, question: 'Q', reponses: ['a', 'b', 'c', 'd'], comptes: [41, 9, 37, 13], pourcents: [41, 9, 37, 13], resultat: 'Le public a choisi A' } });
    expect(scene('mur', { vote: 'ferme', audio: null })).toEqual({ type: 'mur' });
    expect(scene('mur', { audio: { asset: 'president.mp3', depuis: 1234, boucle: true } })).toEqual({ type: 'mur', audio: { asset: 'president.mp3', depuis: 1234, boucle: true } });
  });

  it('vote : la scène de vote existante, alimentée (réponses en options, comptes en résultats, gagnant à la révélation)', () => {
    expect(scene('vote', { question: 'Où ?', reponses: ['toit', 'métro'], comptes: [3, 7], etat: 'revele' }))
      .toEqual({ type: 'vote', question: 'Où ?', options: [{ cle: 'A', libelle: 'toit' }, { cle: 'B', libelle: 'métro' }], phase: 'revele', resultats: { A: 3, B: 7 }, gagnant: 'B' });
    expect(scene('vote', { question: 'Où ?', options: ['x', 'y'] })).toMatchObject({ phase: 'ouvert', options: [{ cle: 'A', libelle: 'x' }, { cle: 'B', libelle: 'y' }] });
  });

  it('visio : postes, son par poste (Franck coupé), noms, disposition côte à côte ou plein écran', () => {
    expect(scene('visio', { postes: ['franck', 'ministre'], son: { franck: false, ministre: true }, noms: { ministre: 'Junon Maréchal · ministre', franck: 'Jim' } }))
      .toEqual({ type: 'visio', disposition: 'cote', postes: [{ id: 'franck', nom: 'Jim', son: false }, { id: 'ministre', nom: 'Junon Maréchal · ministre', son: true }] });
    expect(scene('visio', { postes: ['franck', 'ministre'], son: { ministre: true }, disposition: 'plein' })).toMatchObject({ disposition: 'plein', plein: 'ministre' });
    expect(scene('visio', { son: { franck: false, ministre: true }, disposition: 'plein', plein: 'franck' })).toMatchObject({ plein: 'franck', postes: [{ id: 'franck' }, { id: 'ministre' }] });
    expect(vue('visio', {})).toEqual({ refus: 'invalide', ecran: 'visio' });
  });

  it('streamer, image, chrono, page ; écran inconnu : refus capacite', () => {
    expect(scene('streamer', { gabarit: 'folie', bandeau: 'EN DIRECT' })).toEqual({ type: 'streamer', gabarit: 'folie', bandeau: 'EN DIRECT' });
    expect(scene('image', { asset: 'affiche.png' })).toEqual({ type: 'image', asset: 'affiche.png' });
    expect(scene('chrono', { duree: 30, titre: 'Votez' })).toEqual({ type: 'chrono', duree: 30, titre: 'Votez' });
    expect(scene('page', { url: 'https://mur.test/' })).toEqual({ type: 'page', url: 'https://mur.test/' });
    expect(vue('page', { url: 'javascript:alert(1)' })).toEqual({ refus: 'invalide', ecran: 'page' });
    expect(vue('hologramme')).toEqual({ refus: 'capacite', ecran: 'hologramme' });
  });

  it('toute scène produite est valide pour le protocole de la sortie', () => {
    for (const e of ECRANS_SORTIE) {
      const r = vue(e, { asset: 'a.mp4', url: 'https://p.test/', postes: ['a'], question: 'q', reponses: ['x'] });
      expect('scene' in r && sceneValide(r.scene), e).toBe(true);
    }
  });
});

describe('effets de l’acteur scene (lireFxScene)', () => {
  it('message du mur, « @x a voté », pop, réactions ; inconnu : ignoré', () => {
    expect(lireFxScene('message', { id: 'm9', pseudo: 'lou', texte: 'bravo', couleur: '--ort' })).toEqual({ message: { id: 'm9', pseudo: 'lou', texte: 'bravo', couleur: '--ort' } });
    expect(lireFxScene('a-vote', { pseudo: '@lou', index: 2 })).toEqual({ vote: { pseudo: 'lou', index: 2 } });
    expect(lireFxScene('a-vote', { index: 99 })).toEqual({ vote: {} });
    expect(lireFxScene('pop', { pseudo: 'lou', texte: 'trop fort', style: 'vedette' })).toEqual({ evenement: { type: 'pop', auteur: 'lou', texte: 'trop fort', style: 'vedette' } });
    expect(lireFxScene('coeurs', { n: 1000 })).toEqual({ evenement: { type: 'coeurs', n: 200 } });
    expect(lireFxScene('gabarit', { gabarit: 'folie' })).toEqual({ evenement: { type: 'gabarit', gabarit: 'folie' } });
    expect(lireFxScene('message', { pseudo: 'x' })).toBeNull();
    expect(lireFxScene('vibrer', {})).toBeNull();
  });
});

describe('préchargement étendu : envois à venir vers l’écran scène et params.sortie', () => {
  const e = (id: string, o: Partial<Projet['ev'][number]['st'][number]> = {}) => ({ id, name: id, ty: 'k:scene', c: 0, r: 0, dx: 0, dy: 0, k: [5], ...o });
  const P: Projet = {
    titre: 'Essai', acts: [{ n: 'I' }],
    ev: [
      {
        id: 'm', act: 0, name: 'M', entry: 'a', gate: { mode: 'auto', g: [] },
        st: [
          e('a', { envois: [{ vers: 'scene', ecran: 'mur', params: { audio: 'junon_discours.mp3' } }, { vers: 'public', ecran: 'video', params: { asset: 'telephone.mp4' } }] }),
          e('b', { params: { zoom: 'zoom_junon.mp4' }, envois: [{ vers: 'scene', ecran: 'video', params: { asset: '$zoom' } }] }),
          e('c', { envois: [{ vers: 'scene', ecran: 'video', params: { asset: 'jamais.mp4' } }] }),
        ],
        tr: [{ a: 'a', b: 'b', g: [], mode: 'all' }, { a: 'b', b: 'c', g: [], mode: 'all' }],
      },
      {
        id: 'n', act: 0, name: 'N', entry: 'x', gate: { mode: 'auto', g: [] }, tr: [],
        st: [e('x', { params: { sortie: { type: 'page', url: 'https://tunnel.test/prototypes/figurants/pages/flux/' } } })],
      },
    ],
    sens: { aff: 50, part: 50, calme: 50, pen: 50 }, hold: {}, go: {}, ver: 1, nid: 10, tracks: [],
  };

  it('l’étape courante, ses suivantes, l’entrée du moment suivant ; pas les envois au public ni les étapes lointaines', () => {
    const r = traduire({ projet: P, lecture: etat('m', 'a', 1, { tEtape: 1 }), enLecture: true, config: CONFIG });
    expect(r.precharger).toEqual(['junon_discours.mp3', 'zoom_junon.mp4', ASSET_FLUX_DEFAUT, 'connexion_perdue.mp4']);
  });

  it('la page flux/ du prototype devient la vidéo locale native', () => {
    const r = traduire({ projet: P, lecture: etat('n', 'x', 1, { tEtape: 1 }), enLecture: true, config: CONFIG });
    expect(r.scene).toEqual({ type: 'video', asset: ASSET_FLUX_DEFAUT, boucle: false, son: true, cadrage: 'contain' });
  });
});
