// Scène native « mur » : rendu des réglages de la vue (react-dom/server, sans navigateur) et données vivantes.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { comptesDuVote, DonneesMur, messagesDuMur, MUR_MESSAGES_VISIBLES, SceneMur } from './mur';
import type { Scene } from './protocole';
import { traceQr } from './scenes';
import { positionAudio } from './son-salle';
import { sceneDeVue } from './traduction';
import { configParDefaut } from './protocole';

type Mur = Extract<Scene, { type: 'mur' }>;
const rendu = (scene: Mur, donnees?: DonneesMur) => renderToStaticMarkup(<SceneMur scene={scene} donnees={donnees ?? null} traceQr={traceQr} />);
/** Texte visible, balises retirées. */
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('scène mur : rendu des réglages', () => {
  it('chat façon Twitch : pseudo coloré par un JETON du thème, messages des spectateurs plus gros', () => {
    const html = rendu({ type: 'mur', messages: [
      { id: '1', pseudo: 'zoe', texte: 'trop bien', couleur: '--ort' },
      { id: '2', pseudo: 'kev', texte: 'je suis dans la salle', grand: true },
    ] });
    expect(html).toContain('style="color:var(--ort)"');
    expect(html).toContain('style="color:var(--cy)"');           // couleur par défaut : un jeton aussi
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);           // aucune couleur en dur
    expect(html).toMatch(/class="so-mur-ligne grand"[^>]*>.*je suis dans la salle/);
    expect(texte(html)).toContain('zoe trop bien');
  });

  it('bandeau titre en Venus Rising (classe f-disp), QR d’accueil en coin', () => {
    const html = rendu({ type: 'mur', titre: 'ÉCHO · LE MUR', qr: 'https://echo.test/?r=K7' });
    expect(html).toMatch(/class="so-mur-titre f-disp"[^>]*>ÉCHO · LE MUR</);
    expect(html).toContain('class="so-mur-qr"');
    expect(html).toContain('aria-label="QR code : https://echo.test/?r=K7"');
    expect(rendu({ type: 'mur' })).not.toContain('so-mur-qr');
  });

  it('vote ouvert : question, 4 réponses lettrées, compteurs (pas encore de pourcentages)', () => {
    const html = rendu({ type: 'mur', vote: { etat: 'ouvert', numero: 1, question: 'Dur d’être un homme blanc ?', reponses: ['oui', 'non', 'bof', 'joker'], comptes: [4, 1, 0, 2] } });
    const t = texte(html);
    expect(t).toContain('Question 1 · le public répond');
    expect(t).toContain('7 voix');
    expect(t).toContain('Dur d’être un homme blanc ?');
    expect(t).toMatch(/A oui 4 B non 1 C bof 0 D joker 2/);
    expect(t).not.toContain('%');
    expect(html).not.toContain('gagne');
  });

  it('vote révélé : pourcentages, réponse gagnante en avant, les autres ternes, phrase de résultat', () => {
    const r = sceneDeVue({ ecran: 'mur', params: { vote: 'revele', numero: 1, question: 'Q', reponses: ['a', 'b', 'c', 'd'], scores: [41, 9, 37, 13], resultat: 'Le public a choisi A' } }, configParDefaut('É'));
    if (!('scene' in r) || r.scene.type !== 'mur') throw new Error('mur attendu');
    const html = rendu(r.scene);
    const t = texte(html);
    expect(t).toContain('le public a répondu');
    expect(t).toMatch(/A a 41 % B b 9 % C c 37 % D d 13 %/);
    expect(html.match(/so-mur-rep gagne/g)).toHaveLength(1);
    expect(html.match(/so-mur-rep terne/g)).toHaveLength(3);
    expect(html).toContain('width:41%');
    expect(t).toContain('Le public a choisi A');
  });
});

describe('données vivantes du mur (effets du serveur)', () => {
  it('messages arrivés par effet : ajoutés sans doublon, dédoublonnés contre la vue suivante, visibles au rendu', () => {
    const d = new DonneesMur();
    d.ajouterMessage({ id: 'f1', pseudo: 'lou', texte: 'premier' });
    d.ajouterMessage({ id: 'f1', pseudo: 'lou', texte: 'premier' });
    d.ajouterMessage({ pseudo: 'max', texte: 'sans id' });
    expect(d.instantane().messages).toHaveLength(2);
    expect(texte(rendu({ type: 'mur', messages: [{ id: 'v1', pseudo: 'zoe', texte: 'de la vue' }] }, d))).toMatch(/zoe de la vue.*lou premier.*max sans id/);
    // la vue suivante contient f1 : il n'est plus compté deux fois
    d.nouvelleVue({ type: 'mur', messages: [{ id: 'f1', pseudo: 'lou', texte: 'premier' }] });
    expect(d.instantane().messages.map((m) => m.texte)).toEqual(['sans id']);
    const longs = Array.from({ length: 80 }, (_, i) => ({ id: 'm' + i, pseudo: 'p', texte: 't' + i }));
    expect(messagesDuMur(longs, [])).toHaveLength(MUR_MESSAGES_VISIBLES);
    expect(messagesDuMur(longs, []).slice(-1)[0]?.texte).toBe('t79');
  });

  it('voix arrivées par effet : ajoutées aux comptes de la vue ; un autre vote les remet à zéro', () => {
    const d = new DonneesMur();
    const v = { etat: 'ouvert' as const, numero: 1, question: 'Q', reponses: ['a', 'b'], comptes: [2, 0] };
    d.nouvelleVue({ type: 'mur', vote: v });
    d.ajouterVoix(1); d.ajouterVoix(1); d.ajouterVoix(9);
    expect(comptesDuVote(v, d.instantane().voix)).toEqual([2, 2]);
    expect(texte(rendu({ type: 'mur', vote: v }, d))).toContain('4 voix');
    d.nouvelleVue({ type: 'mur', vote: { ...v, numero: 2 } });
    expect(d.instantane().voix).toEqual([]);
  });

  it('audio de salle : repris à heure serveur − depuis, en boucle modulo la durée', () => {
    expect(positionAudio({ depuis: 10_000 }, 25_500)).toBe(15.5);
    expect(positionAudio({}, 25_500)).toBe(0);
    expect(positionAudio({ depuis: 10_000, boucle: true }, 25_500, 10)).toBeCloseTo(5.5);
    expect(positionAudio({ depuis: 30_000 }, 25_500)).toBe(0);
  });
});
