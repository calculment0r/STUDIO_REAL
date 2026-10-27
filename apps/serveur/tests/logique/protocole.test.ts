import { describe, expect, it } from 'vitest';
import { couleurPour, ErreurProtocole, lireMessageClient, PALETTE_PRESENCE } from '../../src/logique/protocole';
import { typeMediaAccepte, validerFichier, validerNomMedia } from '../../src/logique/validation';
import { exempleDemo, FORMAT } from '@studio-real/modele';

const lire = (m: unknown) => lireMessageClient(JSON.stringify(m));
const code = (f: () => unknown) => { try { f(); return null; } catch (e) { return (e as ErreurProtocole).code; } };

describe('protocole : lecture des messages client', () => {
  it('hello valide, avec valeurs par défaut absentes', () => {
    expect(lire({ t: 'hello', v: 1, personne: 'pers_abc', session: 'sess_123', nom: '  Lou ' })).toEqual({ t: 'hello', v: 1, personne: 'pers_abc', session: 'sess_123', nom: 'Lou' });
    expect(code(() => lire({ t: 'hello', v: 9, personne: 'pers_abc', session: 'sess_123', nom: 'x' }))).toBe('version');
    expect(code(() => lire({ t: 'hello', v: 1, personne: 'a b', session: 'sess_123', nom: 'x' }))).toBe('champ-invalide');
    expect(code(() => lire({ t: 'hello', v: 1, personne: 'pers_abc', session: 'sess_123', nom: 'x', role: 'dieu' }))).toBe('champ-invalide');
  });

  it('modif : cseq, base et ops vérifiés', () => {
    const m = lire({ t: 'modif', cseq: 3, base: 10, ops: [{ op: 'poser', chemin: ['titre'], valeur: 'T' }] });
    expect(m).toMatchObject({ t: 'modif', cseq: 3, base: 10 });
    expect(code(() => lire({ t: 'modif', cseq: 0, base: 1, ops: [] }))).toBe('cseq-invalide');
    expect(code(() => lire({ t: 'modif', cseq: 1, base: 1, ops: [{ op: 'poser', chemin: ['constructor'], valeur: 1 }] }))).toBe('chemin-invalide');
  });

  it('commentaires ancrés sur une étape ou un instant', () => {
    expect(lire({ t: 'commentaire', cseq: 1, action: 'ajouter', ancre: { type: 'etape', moment: 'e1', etape: 'portes' }, texte: 'Trop long' }))
      .toMatchObject({ ancre: { type: 'etape', moment: 'e1', etape: 'portes' } });
    expect(lire({ t: 'commentaire', cseq: 2, action: 'ajouter', ancre: { type: 'instant', t: 125 }, texte: 'Ici' }))
      .toMatchObject({ ancre: { type: 'instant', t: 125 } });
    expect(code(() => lire({ t: 'commentaire', cseq: 1, action: 'ajouter', ancre: { type: 'instant', t: -1 }, texte: 'x' }))).toBe('champ-invalide');
  });

  it('limites de taille et messages inconnus', () => {
    expect(code(() => lire({ t: 'chat', cseq: 1, texte: 'x'.repeat(2001) }))).toBe('trop-long');
    expect(code(() => lireMessageClient('x'.repeat(300_000)))).toBe('trop-gros');
    expect(code(() => lireMessageClient('{pas du json'))).toBe('json-invalide');
    expect(code(() => lire({ t: 'teleporter' }))).toBe('type-inconnu');
    expect(code(() => lireMessageClient(new ArrayBuffer(4)))).toBe('binaire-refuse');
  });

  it('verrou, mode, lecture, curseur', () => {
    expect(lire({ t: 'verrou', cseq: 1, action: 'prendre', cible: 'moment:e1' })).toMatchObject({ cible: 'moment:e1' });
    expect(code(() => lire({ t: 'verrou', cseq: 1, action: 'prendre', cible: 'tout' }))).toBe('champ-invalide');
    expect(code(() => lire({ t: 'mode', cseq: 1, mode: 'danser' }))).toBe('champ-invalide');
    expect(lire({ t: 'lecture', etat: { t: 12 } })).toEqual({ t: 'lecture', etat: { t: 12 } });
    expect(lire({ t: 'curseur', curseur: { zone: 'planche', x: 1.5, y: -3, etape: 'voix' } })).toMatchObject({ curseur: { zone: 'planche', etape: 'voix' } });
    expect(lire({ t: 'curseur', curseur: null })).toEqual({ t: 'curseur', curseur: null });
  });

  it('couleur de présence stable et dans la palette', () => {
    expect(couleurPour('pers_abc')).toBe(couleurPour('pers_abc'));
    expect(PALETTE_PRESENCE).toContain(couleurPour('quelquun'));
  });
});

describe('validation REST', () => {
  it('fichier d\'échange', () => {
    const f = validerFichier({ format: FORMAT, project: exempleDemo(), assets: [] });
    expect(f.runs).toEqual([]);
    expect(() => validerFichier({ format: 'autre', project: exempleDemo() })).toThrow();
    expect(() => validerFichier({ format: FORMAT, project: { acts: [] } })).toThrow();
  });

  it('noms et types de médias', () => {
    expect(validerNomMedia('ouverture.wav')).toBe('ouverture.wav');
    expect(validerNomMedia('Thème été 2.mp3')).toBe('Thème été 2.mp3');
    expect(() => validerNomMedia('../secret')).toThrow();
    expect(() => validerNomMedia('a/b.wav')).toThrow();
    expect(typeMediaAccepte('audio/wav')).toBe(true);
    expect(typeMediaAccepte('image/svg+xml')).toBe(false);
    expect(typeMediaAccepte('text/html')).toBe(false);
  });
});
