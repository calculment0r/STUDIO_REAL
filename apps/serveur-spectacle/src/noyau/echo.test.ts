// Le noyau sur le vrai projet Écho (projets/echo/echo.conducteur.json), converti comme dans les tests du modèle
// (commandesVersEnvois + acteursEcho()) : vues de chaque acteur, vote, figurants, effets, soirée complète, reprise.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chargerFichier, simuler, vueActeur, type Projet } from '@studio-real/modele';
import { lireMessageServeur } from '@studio-real/protocole';
import { Representation } from './representation';
import { preparerProjet } from './projet';
import { T0, aleaFixe, de, messages } from './banc-test';
import { empreinteDe } from './outils';
import type { Sortie } from './types';

const chemin = fileURLToPath(new URL('../../../../projets/echo/echo.conducteur.json', import.meta.url));
const echo = (): Projet => chargerFichier(readFileSync(chemin, 'utf8')).project;

function salleEcho() {
  const h = { now: T0 };
  const rep = new Representation({ projet: echo(), horloge: () => h.now, alea: aleaFixe(5) });
  let cseq = 0;
  const out: Sortie[] = [];
  const garder = (l: Sortie[]) => { out.push(...l); return l; };
  garder(rep.lancer('scene', 2026));
  const hello = (session: string, role: 'regie' | 'acteur' | 'agent', acteur?: string, personne?: string) =>
    garder(rep.recevoir(session, { t: 'hello', v: 2, role, session, jeton: 'x', ...(acteur ? { acteur } : {}), ...(personne ? { personne } : {}) }));
  hello('regie_1', 'regie');
  hello('scene_1', 'acteur', 'scene');
  hello('mini_1', 'acteur', 'ministre');
  hello('agent_fig', 'agent', 'figurants');
  for (let i = 1; i <= 3; i++) hello(`pub_s${i}`, 'acteur', 'public', `tel_00${i}`);
  const secondes = (n: number) => { const l: Sortie[] = []; for (let i = 0; i < n; i++) { h.now += 1000; l.push(...rep.tick(1)); } return garder(l); };
  const top = () => garder(rep.recevoir('regie_1', { t: 'conduite', cseq: ++cseq, op: 'top' }));
  /** jusqu'au moment voulu : chaque étape d'Écho dure 10 s, puis le passage attend le top */
  const jusqua = (moment: string) => {
    const l: Sortie[] = [];
    for (let i = 0; i < 40 && rep.etatLecture()!.moment !== moment; i++) { l.push(...secondes(11)); l.push(...top()); }
    expect(rep.etatLecture()!.moment).toBe(moment);
    return l;
  };
  return { rep, h, hello, secondes, top, jusqua, out, garder };
}

describe('Écho converti', () => {
  it('le projet du prototype est converti : 19 étapes (16 à commandes, 3 à sortie seule), les 6 acteurs d’Écho', () => {
    const p = preparerProjet(echo());
    expect(p.origine).toBe('conversion-echo');
    expect(p.converties).toBe(19);
    expect(p.projet.acteurs!.map(a => a.id)).toEqual(['public', 'scene', 'ministre', 'franck', 'eco', 'figurants']);
  });

  it('au lancement : QR sur l’écran scène, « Regardez la vidéo » sur les téléphones, ministre en veille', () => {
    const { rep } = salleEcho();
    expect(rep.vue('scene')).toMatchObject({ ecran: 'accueil-qr' });
    expect(rep.vue('public')).toMatchObject({ ecran: 'regardez', params: { texte: 'Regardez la vidéo' } });
    expect(rep.vue('ministre')).toMatchObject({ ecran: 'veille' });
  });

  it('b3_junon : commande numérotée aux figurants (segment junon), mur avec l’audio du discours', () => {
    const e = salleEcho();
    const l = e.jusqua('b3_junon');
    const cmd = de(l, 'agent.cmd');
    expect(cmd.map(c => c.m)).toContainEqual(expect.objectContaining({ type: 'figurants.cmd', etape: 'b3_junon_s', donnees: { segment: 'junon' } }));
    expect(cmd[0]!.a).toEqual({ acteur: 'figurants' });
    expect(e.rep.vue('scene')).toMatchObject({ ecran: 'mur', params: { audio: 'junon_discours.mp3', commentaires: 'junon' } });
  });

  it('b4_notif : notification et vibration sur les téléphones', () => {
    const e = salleEcho();
    const l = e.jusqua('b4_notif');
    expect(e.rep.vue('public')).toMatchObject({ ecran: 'notification', params: { texte: 'Vous êtes désormais modérateur' } });
    expect(messages(l, 'fx')).toContainEqual(expect.objectContaining({ acteur: 'public', kind: 'vibrer', ttl: 5000 }));
    expect(e.rep.vue('scene')!.ecran).toBe('noir');
  });

  it('b5_q1 : vote n° 1 sur les téléphones, compteur chez la ministre, mur ouvert ; les votes q = « 1 » comptent', () => {
    const e = salleEcho();
    e.jusqua('b5_q1');
    expect(e.rep.vue('public')).toMatchObject({ ecran: 'vote', params: { numero: 1 } });
    expect(e.rep.vue('ministre')).toMatchObject({ ecran: 'vote-compteur', params: { numero: 1 } });
    expect(e.rep.vue('scene')).toMatchObject({ ecran: 'mur', params: { vote: 'ouvert', numero: 1 } });
    expect(e.rep.recevoir('pub_s1', { t: 'in', cseq: 1, k: 'vote', q: '1', data: { index: 2 } })[0]!.m).toMatchObject({ statut: 'ok' });
    expect(e.rep.recevoir('pub_s2', { t: 'in', cseq: 1, k: 'vote', q: '2', data: { index: 0 } })[0]!.m).toMatchObject({ statut: 'refus' });
    expect(e.rep.recevoir('pub_s2', { t: 'in', cseq: 2, k: 'vote', data: { index: 2 } })[0]!.m).toMatchObject({ statut: 'ok' });
    expect(e.rep.signaux()).toMatchObject({ pres: 3, quorum: 66.7, issue: 'C' });
  });

  it('soirée complète : fin du spectacle, mêmes vues finales que la répétition du modèle, messages tous valides', () => {
    const e = salleEcho();
    for (let i = 0; i < 40 && !e.rep.etatLecture()!.termine; i++) { e.secondes(11); e.top(); }
    expect(e.rep.etatLecture()!.termine).toBe(true);
    const p = preparerProjet(echo()).projet;
    const { etat } = simuler(p);
    for (const a of ['scene', 'public', 'ministre']) {
      const attendu = vueActeur(p, etat, a)!;
      expect(e.rep.vue(a), a).toMatchObject({ ecran: attendu.ecran, params: attendu.params });
    }
    expect(e.rep.vue('scene')).toMatchObject({ ecran: 'mur', params: { audio: 'president_boilot_speech.mp3' } });
    for (const s of e.out) expect(lireMessageServeur(JSON.stringify(s.m)).raison, s.m.t).toBeUndefined();
    expect(e.rep.instantane().entrees.length).toBeLessThan(200);
  });

  it('reprise au milieu de la soirée (b5_q2) : même état, mêmes vues, et la suite est identique', () => {
    const e = salleEcho();
    e.jusqua('b5_q2');
    e.rep.recevoir('pub_s1', { t: 'in', cseq: 1, k: 'vote', q: '2', data: { index: 1 } });
    const x = JSON.parse(JSON.stringify(e.rep.instantane()));
    const rep2 = new Representation({ projet: echo(), horloge: () => e.h.now, alea: aleaFixe(5) });
    expect(rep2.restaurer(x)).toEqual({ divergence: false, projetModifie: false });
    expect(empreinteDe(rep2.instantane())).toBe(empreinteDe(x));
    for (const a of ['scene', 'public', 'ministre']) expect(rep2.vue(a)).toEqual(e.rep.vue(a));
    const t = e.h.now;
    const suite = (r: Representation) => { const l: Sortie[] = []; for (let i = 0; i < 11; i++) { e.h.now += 1000; l.push(...r.tick(1)); } l.push(...r.recevoir('regie_1', { t: 'conduite', cseq: 999, op: 'top' })); return l; };
    const a = suite(e.rep);
    e.h.now = t;
    const b = suite(rep2);
    expect(empreinteDe(b)).toBe(empreinteDe(a));
    expect(rep2.etatLecture()!.moment).toBe('b5_q2_res');
  });
});
