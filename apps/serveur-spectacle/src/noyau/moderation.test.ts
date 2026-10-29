// Modération des textes du mur (moderation.ts) : nettoyage, normalisation (accents, casse, chiffres pour des lettres,
// lettres répétées ou isolées), masquage « *** », refus (vide, trop long, surtout interdit), expressions régulières,
// pseudos ; puis la vraie liste du dépôt (prototypes/figurants/banques/interdits.txt).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  COULEURS_HUMAINS, LONGUEUR_MAX_TEXTE, couleurPseudo, filtrerPseudo, hache, lireInterdits, nettoyer, verifierTexte,
} from './moderation';

const LISTE = ['connard', 'pute', 'sale con', 'encul*', '+conard', 're:\\b(https?:\\/\\/|www\\.)\\S+', 're:\\b[a-z0-9._%+-]+\\s?@\\s?[a-z0-9.-]+\\.[a-z]{2,}\\b'];
const v = (t: string, l: string[] = LISTE) => verifierTexte(t, l);

describe('verifierTexte', () => {
  it('un texte propre passe, nettoyé (espaces resserrés, caractères invisibles retirés)', () => {
    expect(v('  Bravo​   à   tous ! ')).toEqual({ verdict: 'ok', texte: 'Bravo à tous !' });
    expect(v('Il a raison', [])).toEqual({ verdict: 'ok', texte: 'Il a raison' });
    expect(v('😂😂😂')).toEqual({ verdict: 'ok', texte: '😂😂😂' });
  });

  it('vide après nettoyage : refusé', () => {
    expect(v('')).toMatchObject({ verdict: 'refuse', raison: 'vide' });
    expect(v('   ​‍  ')).toMatchObject({ verdict: 'refuse', raison: 'vide' });
  });

  it(`plus de ${LONGUEUR_MAX_TEXTE} caractères : refusé ; ${LONGUEUR_MAX_TEXTE} pile : accepté`, () => {
    expect(v('a'.repeat(LONGUEUR_MAX_TEXTE)).verdict).toBe('ok');
    expect(v('a'.repeat(LONGUEUR_MAX_TEXTE + 1))).toMatchObject({ verdict: 'refuse', raison: 'longueur' });
  });

  it('mot interdit masqué, quelle que soit la casse ou les accents', () => {
    expect(v('Tu es un CONNÂRD toi')).toEqual({ verdict: 'masque', texte: 'Tu es un *** toi' });
    expect(v('oh la pute de chat, quel bazar ce soir')).toMatchObject({ verdict: 'masque', texte: 'oh la *** de chat, quel bazar ce soir' });
  });

  it('chiffres et symboles mis pour des lettres, lettres répétées', () => {
    expect(v('t es un c0nn4rd mon vieux').texte).toBe('t es un *** mon vieux');
    expect(v('t es un cooonnnaaard mon vieux').texte).toBe('t es un *** mon vieux');
    expect(v('mais quelle put3 celle la vraiment').texte).toBe('mais quelle *** celle la vraiment');
    expect(v('quelle b!te ce mec franchement ce soir', ['bite']).texte).toBe('quelle *** ce mec franchement ce soir');
    expect(v('ah la pute! dit il en riant fort').texte).toBe('ah la ***! dit il en riant fort');
  });

  it('lettres isolées recollées et mot coupé en deux', () => {
    expect(v('oh le c o n n a r d qui passe la').texte).toBe('oh le *** qui passe la');
    expect(v('oh le c.o.n.n.a.r.d qui passe la').texte).toBe('oh le *** qui passe la');
    expect(v('oh le con nard qui passe par la').texte).toBe('oh le *** qui passe par la');
  });

  it('mot entier seulement (« con » ne touche pas « content »), expressions et préfixes', () => {
    expect(v('je suis content et constant', ['con'])).toEqual({ verdict: 'ok', texte: 'je suis content et constant' });
    expect(v('quel sale con celui la vraiment ce soir').texte).toBe('quel *** celui la vraiment ce soir');
    expect(v('bande d enculés va donc ce soir').texte).toBe('bande d *** va donc ce soir');
  });

  it('mot autorisé (« +mot ») jamais masqué', () => {
    expect(v('un conard nage sur le lac ce matin', ['conard*', '+conard']).verdict).toBe('ok');
  });

  it('expressions régulières (forme B, ponctuation gardée) : liens et adresses masqués', () => {
    expect(v('allez voir sur https://exemple.com/x ce soir').texte).toBe('allez voir sur *** ce soir');
    expect(v('écrivez moi à jean.dupont@exemple.fr si vous voulez').texte).toBe('écrivez moi à *** si vous voulez');
    expect(v('ok', ['re:(invalide'])).toEqual({ verdict: 'ok', texte: 'ok' });   // expression invalide : ignorée
  });

  it('surtout fait de mots interdits (la moitié au moins) : refusé', () => {
    expect(v('connard')).toMatchObject({ verdict: 'refuse', raison: 'interdits', texte: '***' });
    expect(v('CONNARD !!!')).toMatchObject({ verdict: 'refuse' });
    expect(v('pute connard toi')).toMatchObject({ verdict: 'refuse' });
    expect(v('www.exemple.com')).toMatchObject({ verdict: 'refuse' });
    expect(v('va voir ce connard')).toMatchObject({ verdict: 'masque' });
  });
});

describe('listes, pseudos, couleurs', () => {
  it('lireInterdits : une entrée par ligne, lignes vides et commentaires retirés', () => {
    expect(lireInterdits('# titre\r\nconnard\n\n  pute  \n# fin\nre:\\bx\\b\n')).toEqual(['connard', 'pute', 're:\\bx\\b']);
  });

  it('filtrerPseudo : règle du prototype (espaces → _, 2 à 20 lettres, chiffres, _ . -, aucun mot interdit)', () => {
    expect(filtrerPseudo('Léa du 3e', LISTE)).toBe('Léa_du_3e');
    expect(filtrerPseudo('jean-marc.b', LISTE)).toBe('jean-marc.b');
    expect(filtrerPseudo('un_pseudo_beaucoup_trop_long', LISTE)).toBe('un_pseudo_beaucoup_t');
    expect(filtrerPseudo('x', LISTE)).toBeNull();
    expect(filtrerPseudo('<b>moi</b>', LISTE)).toBeNull();
    expect(filtrerPseudo('gros_connard', LISTE)).toBeNull();
    expect(filtrerPseudo(42, LISTE)).toBeNull();
  });

  it('couleur d’un pseudo : un jeton de la liste du prototype, toujours le même', () => {
    expect(COULEURS_HUMAINS).toContain(couleurPseudo('Zoé'));
    expect(couleurPseudo('Zoé')).toBe(couleurPseudo('Zoé'));
    expect(hache('a')).toBe(0xe40c292c);   // FNV-1a 32 bits, comme jeu.mjs
    expect(nettoyer('a\u0000b')).toBe('a b');
  });
});

describe('la liste du dépôt (prototypes/figurants/banques/interdits.txt)', () => {
  const chemin = (p: string) => fileURLToPath(new URL(`../../../../prototypes/figurants/banques/${p}`, import.meta.url));
  const liste = lireInterdits(readFileSync(chemin('interdits.txt'), 'utf8'));

  it('chaque entrée simple est masquée au milieu d’une phrase ordinaire', () => {
    const simples = liste.filter(e => !e.startsWith('re:') && !e.startsWith('+'));
    expect(simples.length).toBeGreaterThan(50);
    for (const e of simples) {
      const mot = e.replace(/^=/, '').replace(/\*$/, '');
      expect(verifierTexte(`bon alors ${mot} et voila quoi ce soir encore une fois`, liste).verdict, e).not.toBe('ok');
    }
  });

  it('pas de faux positif sur les réponses des votes d’Écho ni sur des phrases du spectacle', () => {
    const votes = JSON.parse(readFileSync(chemin('echo/votes.json'), 'utf8')) as { questions: { reponses: string[] }[] };
    const phrases = [
      ...votes.questions.flatMap(q => q.reponses),
      'Je suis content de vous voir', 'Il a raison, franchement', 'Coupe Insta quelque temps', 'Bravo à toute l’équipe !',
      'On ne critique pas qui tu es', 'Constance a voté B', 'La conférence était super',
    ];
    for (const p of phrases) expect(verifierTexte(p, liste).verdict, p).toBe('ok');
  });

  it('numéro de téléphone et adresse e-mail masqués', () => {
    expect(verifierTexte('appelle moi au 06 12 34 56 78 ce soir après le spectacle', liste).verdict).not.toBe('ok');
    expect(verifierTexte('mon mail est jean.dupont@exemple.fr pour la suite des choses', liste).verdict).not.toBe('ok');
  });
});
