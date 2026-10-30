// L'émulateur : une salle émulée (noyau du serveur en mémoire) et sa population de téléphones émulés, sur une horloge
// émulée. Sous Node (vitest) on avance le temps à la main (`avancer`) ; dans le Conducteur, `tempsReel(vitesse)`.
// Avec `transport: { url, jeton, jetonRegie? }`, la salle n'est plus en mémoire : c'est un vrai serveur de spectacle, les
// téléphones s'y connectent par WebSocket (transport-reel.ts), l'horloge suit le temps réel (×1) et `avancer` n'a pas
// d'effet. `creerEmulateur` renvoie alors un `EmulateurReel` (sans `salle` ni `changerProjet`, avec `reel` et ses mesures).
import type { Projet, SalleSimulee, Signaux } from '@studio-real/modele';
import type { MsgAck, OpConduite, VueDiffusee } from '@studio-real/protocole';
import { vueEcran } from '@studio-real/ui-telephone';
import { melanger, mulberry32, sousGraine } from './alea';
import { TelephoneSalle, type ContexteTelephone } from './agent';
import { Ordonnanceur } from './horloge';
import { instantArrivee, population, profil, pseudoEmule } from './profils';
import { rejouerJournal } from './rejouer';
import { SalleEmulee } from './salle';
import { SalleReelle, percentile, type MesuresReelles } from './transport-reel';
import type { BilanSalle, Cible, Emulateur, EvenementSalle, OptionsEmulateur, OptionsTransportReel, ProfilSpectateur, RapportRejeu } from './types';

/** Ce que l'émulateur offre en plus de l'interface du rapport (Conducteur, rejeu, vitrine). */
export interface EmulateurSalle extends Emulateur {
  readonly salle: SalleEmulee;
  readonly horloge: Ordonnanceur;
  /** téléphones (TelephoneEmule) avec leurs commandes internes */
  telephonesSalle(filtre?: Cible): TelephoneSalle[];
  /** le Conducteur a modifié le projet : la salle émulée le suit (noyau relancé au même moment) */
  changerProjet(projet: Projet): void;
  /** les rotatifs de la salle (aff, part, calme, pen) */
  reglerSens(sens: SalleSimulee): void;
  /** comportement automatique des agents */
  reglerAuto(auto: boolean): void;
  readonly actif: boolean;
  readonly vitesse: number;
}

/** L'émulateur branché sur un vrai serveur : pas de salle en mémoire, pas de changement de projet (le serveur le tient) ;
 *  `reel` donne les mesures prises sur le fil. */
export interface EmulateurReel extends Omit<EmulateurSalle, 'salle' | 'changerProjet'> {
  readonly reel: SalleReelle;
  /** les mesures du fil (accusés, ack, refus, octets, reconnexions…), à l'instant */
  mesures(): MesuresReelles;
  /** comme `conduite`, mais attend le vrai accusé du serveur */
  conduiteReelle(op: Parameters<Emulateur['conduite']>[0]): ReturnType<SalleReelle['conduiteReelle']>;
  /** comme `go`, mais rend la main quand le serveur a répondu aux `top` */
  goReel(): Promise<void>;
}

const estReel = (t: OptionsEmulateur['transport']): t is OptionsTransportReel => !!t && t !== 'memoire';

const numero = (i: number) => String(i).padStart(3, '0');

export function creerEmulateur(o: OptionsEmulateur & { transport: OptionsTransportReel }): EmulateurReel;
export function creerEmulateur(o: OptionsEmulateur): EmulateurSalle;
export function creerEmulateur(o: OptionsEmulateur): EmulateurSalle | EmulateurReel {
  const graine = o.graine >>> 0;
  const reel = estReel(o.transport) ? new SalleReelle({ reseau: o.transport, projet: o.projet }) : null;
  // en réel l'horloge émulée suit l'heure réelle (les accusés des téléphones portent cette heure)
  const debut = reel ? Date.now() : o.horloge?.debut ?? Date.now();
  const horloge = new Ordonnanceur(debut);
  const salle = reel ? null : new SalleEmulee({ projet: o.projet, horloge, graine, ...(o.mode ? { mode: o.mode } : {}) });
  let sens: SalleSimulee = o.sens ?? o.projet.sens;
  if (salle) sens = o.sens ?? salle.rep.projet.sens;
  let auto = o.auto ?? true;
  let actif = false;
  let demarre = false;
  let vitesse = 0;
  let minuteur: ReturnType<typeof setInterval> | null = null;
  const urlTelephone = o.rendu && o.rendu !== 'aucun' ? o.rendu.urlTelephone ?? '/t/' : null;
  const rndActions = mulberry32(sousGraine(graine, 'actions'));

  const ctx: ContexteTelephone = {
    horloge, salle, reel, graine, sens: () => sens, auto: () => auto, actif: () => actif, urlTelephone,
  };

  /** Les téléphones, dans l'ordre de création. */
  const tels: TelephoneSalle[] = [];
  const parId = new Map<string, TelephoneSalle>();
  let suivant = 1;

  const creer = (p: ProfilSpectateur, acteur = 'public', id?: string, extra: { auto?: boolean; personne?: string; session?: string } = {}) => {
    const n = suivant++;
    const ident = id ?? `t${numero(n)}`;
    const t = new TelephoneSalle(ctx, {
      id: ident, profil: p, acteur, pseudo: acteur === 'public' ? pseudoEmule(n) : null, ...extra,
    });
    tels.push(t);
    parId.set(ident, t);
    return t;
  };

  // Population : profils mêlés (l'ordre des numéros ne regroupe pas les profils), tirage fixé par la graine.
  const pop = Array.isArray(o.population)
    ? o.population.map(x => ({ profil: profil(x.profil), nombre: Math.max(0, Math.floor(x.nombre)) }))
    : population(o.population.nombre, o.population.melange);
  const liste: ProfilSpectateur[] = [];
  for (const x of pop) for (let i = 0; i < x.nombre; i++) liste.push(x.profil);
  for (const p of melanger(mulberry32(sousGraine(graine, 'population')), liste)) creer(p);
  for (const a of o.acteurs ?? []) creer(profil('rapide'), a.acteur, a.id ?? a.acteur, { auto: false });

  const arriver = (t: TelephoneSalle, ms: number) => {
    horloge.planifier(ms, () => { if (actif && !t.retire) t.arriver(); });
  };

  const choisir = (filtre: Cible = 'tous'): TelephoneSalle[] => {
    const vivants = tels.filter(t => !t.retire);
    if (filtre === 'tous') return vivants;
    if (filtre === 'sans-reponse') return vivants.filter(t => t.arrive && !t.etat().aRepondu);
    if (typeof filtre === 'object') { const ids = new Set(filtre.ids); return vivants.filter(t => ids.has(t.id)); }
    if (filtre.startsWith('groupe:')) { const g = filtre.slice(7); return vivants.filter(t => t.profil.nom === g || t.acteur === g); }
    if (filtre.startsWith('joueur:')) { const id = filtre.slice(7); return vivants.filter(t => t.id === id); }
    return [];
  };

  /** Tâche de la salle (s'éteint quand l'émulateur s'arrête). */
  const planifier = (ms: number, fn: () => void) => horloge.planifier(ms, () => { if (actif) fn(); });

  /** La salle en mémoire ; en réel il n'y en a pas, et le dire vaut mieux qu'un undefined. */
  const memoire = (): SalleEmulee => {
    if (!salle) throw new Error('Émulateur réel : pas de salle en mémoire (le noyau tourne sur le serveur) ; voir .reel.');
    return salle;
  };
  const exigerMemoire = (quoi: string): SalleEmulee => {
    if (!salle) throw new Error(`Émulateur réel : ${quoi} n'existe qu'avec le transport mémoire.`);
    return salle;
  };
  let avertiAvancer = false;

  const emu: EmulateurSalle = {
    get salle() { return memoire(); },
    horloge,
    get actif() { return actif; },
    get vitesse() { return vitesse; },

    async demarrer() {
      if (actif) return;
      actif = true;
      if (!demarre) {
        demarre = true;
        if (reel) {
          // le serveur a déjà sa représentation : on ouvre la régie (si on a son jeton), le temps devient le temps réel
          try { await reel.demarrer(); } catch (e) { actif = false; demarre = false; throw e; }
          emu.tempsReel(1);
        } else salle!.lancer(o.mode ?? 'repetition', graine);
        const mode = o.arrivees ?? 'salle';
        for (const t of tels) {
          const rnd = mulberry32(sousGraine(graine, 'arrivee', t.id));
          arriver(t, t.acteur === 'public' ? instantArrivee(rnd, sens, mode) : 0);
        }
      }
    },

    async arreter() {
      emu.tempsReel(0);
      for (const t of tels) t.retirer();
      (reel ?? salle)!.arreter();
      actif = false;
      horloge.vider();
    },

    telephones: (filtre) => choisir(filtre),
    telephonesSalle: (filtre) => choisir(filtre),
    telephone: (id) => parId.get(id),

    ajouter(nombre, nomProfil = 'rapide') {
      const p = profil(nomProfil);
      const out: TelephoneSalle[] = [];
      for (let i = 0; i < Math.max(0, Math.floor(nombre)); i++) {
        const t = creer(p);
        out.push(t);
        if (demarre) arriver(t, Math.round(rndActions() * 2000));
      }
      return out;
    },

    retirer(ids) {
      const l = new Set(ids);
      for (const t of tels) if (l.has(t.id)) t.retirer();
    },

    faireVoter({ repartition, dansS, part = 1, cible = 'tous' }) {
      let n = 0;
      for (const t of choisir(cible)) {
        if (!t.arrive || t.tirage() >= part) continue;
        n++;
        t.annulerPrevu('reponse');
        planifier(t.tirage() * Math.max(0, dansS) * 1000, () => {
          const m = t.magasin;
          if (!m) return;
          const v = vueEcran(m.lire());
          if (v.ecran !== 'vote' || v.vote !== null) return;
          t.voterIndex(t.tirerOption(v.params, repartition));
        });
      }
      return n;
    },

    faireEcrire({ textes, parMinute, dureeS = 60, part = 1, cible = 'tous' }) {
      const choisis = choisir(cible).filter(t => t.arrive && t.tirage() < part);
      const max = parMinute > 0 ? Math.round((parMinute * dureeS) / 60) : choisis.length;
      const auteurs = melanger(rndActions, choisis).slice(0, max);
      for (const t of auteurs) {
        t.annulerPrevu('reponse');
        planifier(t.tirage() * Math.max(0, dureeS) * 1000, () => { t.ecrireTexte(t.tirerTexte(textes)); });
      }
      return auteurs.length;
    },

    faireToucher({ selecteur, dansS, part = 1, cible = 'tous' }) {
      let n = 0;
      for (const t of choisir(cible)) {
        if (!t.arrive || t.tirage() >= part) continue;
        n++;
        planifier(t.tirage() * Math.max(0, dansS) * 1000, () => t.toucher(selecteur));
      }
      return n;
    },

    coupure({ part, dureeS, cible = 'tous' }) {
      const enLigne = choisir(cible).filter(t => t.arrive && t.etat().enLigne);
      const l = melanger(rndActions, enLigne).slice(0, Math.round(Math.max(0, Math.min(1, part)) * enLigne.length));
      for (const t of l) t.couper(dureeS);
      return l.map(t => t.id);
    },

    recharger(ids) {
      const l = new Set(ids);
      for (const t of tels) if (l.has(t.id)) t.recharger();
    },

    masquer({ part, dureeS, cible = 'tous' }) {
      const vis = choisir(cible).filter(t => t.arrive && t.visible);
      const l = melanger(rndActions, vis).slice(0, Math.round(Math.max(0, Math.min(1, part)) * vis.length));
      for (const t of l) t.masquer(dureeS);
      return l.map(t => t.id);
    },

    conduite: (op: OpConduite): MsgAck => (reel ?? salle)!.conduite(op),
    go: (): void => {
      if (reel) {
        // les `top` partent après la réponse du premier : on ne bloque pas l'appelant ; une erreur (régie absente) est dite tout de suite
        reel.go().catch(e => console.error('[emulateur] go :', e instanceof Error ? e.message : e));
        return;
      }
      salle!.go();
    },
    vueDe: (acteur: string, personne?: string): VueDiffusee | null => (reel ?? salle)!.vueDe(acteur, personne),

    bilan(): BilanSalle {
      const parEcran: Record<string, number> = {};
      let arrives = 0, connectes = 0, horsLigne = 0, population = 0;
      for (const t of tels) {
        if (t.retire) continue;
        population++;
        if (!t.arrive) continue;
        arrives++;
        const e = t.etat();
        const cle = e.enLigne ? e.ecran?.type ?? 'attente' : 'hors-ligne';
        parEcran[cle] = (parEcran[cle] ?? 0) + 1;
        if (e.enLigne) connectes++;
        else horsLigne++;
      }
      const { question, votes, textes } = (reel ?? salle)!.votes();
      const lat = reel ? reel.latencesRecentes : salle!.latences;
      const L = (reel ?? salle)!.lecture();
      return {
        population, arrives, connectes, horsLigne, parEcran, votes, question, textes,
        latenceAck: {
          p50: percentile(lat, 0.5), p95: percentile(lat, 0.95), n: lat.length,
          partA1s: lat.length ? lat.filter(x => x <= 1000).length / lat.length : 0,
          partA2s: lat.length ? lat.filter(x => x <= 2000).length / lat.length : 0,
        },
        lecture: L ? { moment: L.moment, etape: L.etape, attenteGo: L.attenteGo, termine: L.termine } : null,
        t: horloge.maintenant() - debut,
      };
    },

    signaux: (): Signaux => (reel ?? salle)!.signaux(),
    surEvenement: (fn: (e: EvenementSalle) => void) => (reel ?? salle)!.surEvenement(fn),

    rejouer(journal, opts = {}): Promise<RapportRejeu> {
      const laSalle = exigerMemoire('rejouer');
      // la vitesse du rejeu est celle de l'horloge émulée (le noyau compte ses étapes sur la même horloge)
      if (opts.vitesse && opts.vitesse > 0 && minuteur !== null) emu.tempsReel(opts.vitesse);
      return rejouerJournal({
        horloge, salle: laSalle, demarrer: () => emu.demarrer(),
        telephone: (personne, session, acteur) => {
          const deja = tels.find(t => t.personne === personne && !t.retire);
          if (deja) return deja;
          return creer(profil('rapide'), acteur, `j${numero(suivant)}`, { auto: false, personne, session });
        },
      }, journal, opts.avancer ? { avancer: true } : {});
    },

    async avancer(ms) {
      if (reel) {
        // temps réel : on ne saute pas dans le temps d'un vrai serveur
        if (!avertiAvancer) { avertiAvancer = true; console.warn(`[emulateur] avancer(${ms}) sans effet avec le transport réel : le temps est le temps réel.`); }
        await Promise.resolve();
        return;
      }
      horloge.avancer(ms);
      await Promise.resolve();
    },

    tempsReel(v) {
      if (minuteur !== null) { clearInterval(minuteur); minuteur = null; }
      vitesse = Math.max(0, Math.min(20, v));
      if (reel && vitesse !== 0 && vitesse !== 1) {
        console.warn(`[emulateur] tempsReel(${v}) : le serveur réel ne s'accélère pas, vitesse ramenée à ×1.`);
        vitesse = 1;
      }
      if (!vitesse || typeof setInterval === 'undefined') return;
      const maintenantReel = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      let dernier = maintenantReel();
      minuteur = setInterval(() => {
        const now = maintenantReel();
        const dt = Math.min(500, now - dernier);
        dernier = now;
        if (actif) horloge.avancer(dt * vitesse);
      }, 50);
    },

    journal: () => (reel ?? salle)!.journal(),
    maintenant: () => horloge.maintenant(),

    changerProjet(projet) {
      const laSalle = exigerMemoire('changerProjet (le serveur tient son projet)');
      laSalle.changerProjet(projet);
      if (!o.sens) sens = laSalle.rep.projet.sens;
      for (const t of tels) if (t.arrive && !t.retire) t.renouerLigne();
    },
    reglerSens(s) { sens = { ...s }; },
    reglerAuto(a) { auto = a; },
  };
  if (reel) {
    Object.assign(emu, {
      reel,
      mesures: () => reel.mesures(),
      conduiteReelle: (op: Parameters<Emulateur['conduite']>[0]) => reel.conduiteReelle(op),
      goReel: () => reel.go(),
    });
  }
  return emu;
}
