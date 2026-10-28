// Rendu de chaque écran. Ni happy-dom ni jsdom ne sont installés dans le dépôt (et le lot n'ajoute aucune dépendance) :
// on rend donc en HTML statique avec react-dom/server, qui fait partie de react-dom. Les effets (vidéo, chronos) ne
// tournent pas ici ; la logique qu'ils déclenchent est testée dans machine.test.ts.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MsgVue } from '@studio-real/protocole';
import { ECRANS, enchainer, etatInitial, vueEcran, type Evenement, type VueEcran } from './machine';
import { COMPOSANTS_ECRANS, EcranTelephone, type MediasEcran } from './ecrans';
import { CAPACITES_NEUTRES } from './capacites';
import { App } from './App';
import { demarrerTelephone } from './telephone';
import { transportMemoire } from './transport';

const SESSION = 's_123456';
const medias: MediasEcran = { video: null, url: (_a, s) => s?.[0] ?? null, repli: true };

/** La vue d'écran qu'aurait un téléphone après ces événements. */
function vueApres(ecran: string, params: Record<string, unknown> = {}, apres: Evenement[] = [], acteur = 'public'): VueEcran {
  const v: MsgVue = { t: 'vue', acteur, vseq: 1, at: 1, ecran, params, cle: 'etape#1' };
  const e = enchainer(etatInitial({ acteur, personne: 'tel_abcdef', session: SESSION, pseudo: 'lea' }), [
    { a: 'reseau', enLigne: true }, { t: 'bienvenue', v: 2, role: 'acteur', acteur, session: SESSION, ts: 1, vue: null, cseq: 0 }, v, ...apres,
  ], 1000).etat;
  return vueEcran(e);
}
const rendre = (vue: VueEcran) => renderToStaticMarkup(<EcranTelephone vue={vue} agir={() => undefined} capacites={CAPACITES_NEUTRES} medias={medias} />);

describe('catalogue', () => {
  it('un composant pour chaque écran de la machine, et rien d’autre', () => {
    expect(Object.keys(COMPOSANTS_ECRANS).sort()).toEqual([...ECRANS].sort());
  });
});

describe('rendu des écrans du public', () => {
  it('entree : champ pseudo de 2 à 20 caractères, titre, message d’erreur', () => {
    const e = enchainer(etatInitial({ acteur: 'public', personne: 'tel_abcdef', session: SESSION }), [{ a: 'pseudo', pseudo: 'x' }]).etat;
    const html = rendre({ ...vueEcran(e), params: { titre: 'ÉCHO' } });
    expect(html).toContain('ÉCHO');
    expect(html).toMatch(/minLength="2"[^>]*maxLength="20"/);
    expect(html).toContain('Au moins 2 caractères.');
  });

  it('attente : texte et préparation des vidéos', () => {
    const html = rendre(vueApres('attente', { texte: 'Bientôt', precharger: ['a.mp4'] }, [{ a: 'media', asset: 'a.mp4', pret: 0.5 }]));
    expect(html).toContain('Bientôt');
    expect(html).toContain('préparation 50 %');
    expect(html).toContain('aria-valuenow="50"');
  });

  it('regardez et merci', () => {
    expect(rendre(vueApres('regardez', { texte: 'Regardez la vidéo' }))).toContain('Regardez la vidéo');
    expect(rendre(vueApres('merci'))).toContain('Merci');
  });

  it('video : le cadre de l’unique <video> et le bouton « Activer le son » (muet d’abord)', () => {
    const html = rendre(vueApres('video', { asset: 'flux.mp4' }));
    expect(html).toContain('tl-video-cadre');
    expect(html).toContain('Activer le son');
    expect(html).not.toContain('<video');                       // l'élément est prêté par l'application, jamais rendu par React
  });

  it('phrases : les phrases non envoyées, les émojis, la dernière envoyée', () => {
    const html = rendre(vueApres('phrases', { phrases: ['Bravo', 'Jamais'], emojis: ['😂', '👏'] }, [{ a: 'ecrire', texte: 'Bravo', phrase: true }]));
    expect(html).toContain('Jamais');
    expect(html).not.toMatch(/tl-carte[^>]*>Bravo/);
    expect(html).toContain('envoyé : Bravo');
    expect(html).toContain('envoyer 👏');
  });

  it('vote : 2 à 6 réponses ; après le vote, « vote enregistré » et boutons désactivés', () => {
    const avant = rendre(vueApres('vote', { numero: 3, question: 'Et alors ?', reponses: ['Oui', 'Non', 'Bof'] }));
    expect(avant).toContain('Question 3');
    expect((avant.match(/class="tl-reponse( choisie)?"/g) ?? []).length).toBe(3);
    expect(avant).toContain('Touche ta réponse');
    const apres = rendre(vueApres('vote', { numero: 3, reponses: ['Oui', 'Non', 'Bof'] }, [{ a: 'voter', index: 1 }]));
    expect(apres).toContain('Vote enregistré ✓');
    expect(apres).toMatch(/tl-reponse choisie"[^>]*disabled/);
    expect((rendre(vueApres('vote', { reponses: Array(9).fill('x') })).match(/class="tl-reponse( choisie)?"/g) ?? []).length).toBe(6);
  });

  it('texte : question, champ, chrono en MM:SS ; après envoi, la réponse', () => {
    const html = rendre(vueApres('texte', { question: 'Pourquoi ?', duree: 90 }));
    expect(html).toContain('Pourquoi ?');
    expect(html).toContain('01:30');
    expect(html).toContain('<textarea');
    const apres = rendre(vueApres('texte', { question: 'Pourquoi ?' }, [{ a: 'ecrire', texte: 'Parce que.' }]));
    expect(apres).toContain('Parce que.');
    expect(apres).toContain('Réponse envoyée');
  });

  it('choix : les deux boutons, puis le pourquoi, puis merci', () => {
    expect(rendre(vueApres('choix', { compte: '@wakupjimmy' }))).toContain('Abonnez-vous à son compte');
    expect(rendre(vueApres('choix', {}, [{ a: 'choisir', choix: 'desabonne' }]))).toContain('Pourquoi tu te désabonnes ?');
    expect(rendre(vueApres('choix', {}, [{ a: 'choisir', choix: 'abonne' }, { a: 'ecrire', texte: 'ok' }]))).toContain('Merci.');
  });

  it('notification : titre, texte, bouton ; une fois touché, le bouton est validé', () => {
    const p = { titre: 'Ministère de la Santé mentale', texte: 'Vous êtes désormais modérateur', bouton: 'Accepter' };
    const html = rendre(vueApres('notification', p));
    expect(html).toContain('Ministère de la Santé mentale');
    expect(html).toContain('Vous êtes désormais modérateur');
    expect(html).toContain('Accepter');
    expect(rendre(vueApres('notification', p, [{ a: 'toucher', cible: 'bouton' }]))).toMatch(/disabled="">✓/);
  });

  it('couleur : un jeton du thème (jamais une couleur arbitraire) ; noir ; image ; image-onde', () => {
    expect(rendre(vueApres('couleur', { couleur: '--rec' }))).toContain('background:var(--rec)');
    expect(rendre(vueApres('couleur', { couleur: 'url(x)' }))).toContain('background:var(--ort)');
    expect(rendre(vueApres('noir'))).toContain('tl-noir');
    expect(rendre(vueApres('image', { src: '/medias/a.jpg', legende: 'Junon' }))).toContain('src="/medias/a.jpg"');
    expect(rendre(vueApres('image', { src: 'javascript:alert(1)' }))).toContain('image absente');
    expect((rendre(vueApres('image-onde', { image: '/medias/visage.jpg' })).match(/<i /g) ?? []).length).toBe(24);
  });
});

describe('rendu des téléphones nommés', () => {
  it('prompteur : les questions, celle de la régie en avant', () => {
    const html = rendre(vueApres('prompteur', { questions: [{ numero: 1, texte: 'Première' }, { numero: 15, texte: 'Quinzième' }], enAvant: 15 }, [], 'franck'));
    expect(html).toContain('Question 15');
    expect(html).toMatch(/tl-prompteur-q active"[^>]*>.*Quinzième/);
  });

  it('vote-compteur : compteurs ; au résultat, la phrase', () => {
    const html = rendre(vueApres('vote-compteur', { numero: 1, scores: [41, 9, 37, 13], question: 'Q1' }, [], 'ministre'));
    expect(html).toContain('41');
    expect(html).toContain('total');
    expect(html).toContain('100');
    expect(rendre(vueApres('vote-compteur', { revele: true, scores: [1, 2], resultat: 'A gagne' }, [], 'ministre'))).toContain('A gagne');
  });

  it('veille et visio-appel (écran d’appel sans WebRTC)', () => {
    expect(rendre(vueApres('veille', { texte: 'ÉCHO' }, [], 'ministre'))).toContain('ÉCHO');
    const appel = rendre(vueApres('visio-appel', { nom: 'Franck' }, [], 'ministre'));
    expect(appel).toContain('Répondre');
    expect(appel).toContain('Raccrocher');
    const enCours = rendre(vueApres('visio-appel', { nom: 'Franck' }, [{ a: 'appel', geste: 'repondre' }], 'ministre'));
    expect(enCours).toContain('flux vidéo');
    expect(enCours).not.toContain('Répondre');
  });

  it('écran inconnu : la carte « écran non pris en charge : <nom> » (et aucune clé héritée prise pour un écran)', () => {
    expect(rendre(vueApres('hologramme'))).toContain('écran non pris en charge : <b>hologramme</b>');
    expect(rendre(vueApres('constructor'))).toContain('écran non pris en charge : <b>constructor</b>');
  });
});

describe('application', () => {
  it('bandeau ÉMULÉ, écran d’entrée avec le titre, et l’indication de reconnexion hors entrée', () => {
    let paire!: ReturnType<typeof transportMemoire>;
    const tel = demarrerTelephone({
      etat: { acteur: 'public', personne: 'emule-t042', session: SESSION },
      creerTransport: h => (paire = transportMemoire({ hello: h })).telephone,
      app: { version: '0.1.0', build: 'essai' }, capacites: CAPACITES_NEUTRES, navigateur: false,
    });
    let html = renderToStaticMarkup(<App telephone={tel} capacites={CAPACITES_NEUTRES} emule titre="ÉCHO" />);
    expect(html).toContain('ÉMULÉ · emule-t042');
    expect(html).toContain('ÉCHO');
    expect(html).not.toContain('reconnexion');
    tel.magasin.envoyer({ a: 'pseudo', pseudo: 'lea' });
    html = renderToStaticMarkup(<App telephone={tel} capacites={CAPACITES_NEUTRES} />);
    expect(html).toContain('reconnexion…');
    expect(html).not.toContain('ÉMULÉ');
    expect(paire.serveur.ouverte).toBe(false);
    tel.arreter();
  });
});
