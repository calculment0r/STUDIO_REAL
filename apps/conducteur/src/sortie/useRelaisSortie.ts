// Relais automatique magasin → sortie écran scène (chantier SORTIE SCÈNE). À monter UNE fois dans la coquille :
//   useRelaisSortie();
// Il traduit l'état du magasin (projet, lecture, vitesse, salle simulée) en scène (traduction.ts) et la publie sur
// le canal local (BroadcastChannel) et, si la coquille est connectée à une salle du serveur, par la salle (autre
// machine). La fin d'une vidéo « une seule fois » remonte au moteur en signal 'video.fin' (donnees.valeur = asset),
// lisible par une sortie de condition 'sig:video.fin' ou 'sigv:video.fin'.
import { useEffect } from 'react';
import { useMagasin } from '../etat/magasin';
import { identite, jetonAdmin, jetonProjet, urlServeur, useSalle } from '../etat/serveur';
import { transportLocal } from './canal';
import {
  ajouterTransport, arreterRelais, definirSalleFlux, definirTitreProjet, demarrerRelais, publierAuto, surFinVideo, surRelache, useSortie,
} from './relais';
import { TransportSalle } from './salle';
import { traduire } from './traduction';

/** Délai minimal entre deux états de scène quand rien d'important ne change (≤ 4 par seconde). */
const PAS_ETAT_MS = 250;

/** Branche le relais (hors React). Renvoie la fonction d'arrêt. */
export function brancherRelaisSortie(o: { salle?: boolean } = {}): () => void {
  demarrerRelais();
  const retirerLocal = ajouterTransport(transportLocal());

  let derniere = 0, minuteur: ReturnType<typeof setTimeout> | undefined, cleImportante = '';
  const calculer = () => {
    minuteur = undefined;
    derniere = Date.now();
    const s = useMagasin.getState();
    definirTitreProjet(s.projet.titre);
    let signaux;
    try { signaux = s.signaux(); } catch { signaux = undefined; }
    const r = traduire({
      projet: s.projet, lecture: s.lecture, enLecture: s.enLecture, vitesse: s.vitesse,
      config: useSortie.getState().config, ...(signaux ? { signaux } : {}),
    });
    publierAuto(r.scene, r.etat, r.precharger);
  };
  const planifier = () => {
    const s = useMagasin.getState(), l = s.lecture;
    const cle = [l?.moment, l?.etape, l?.phase, l?.attenteGo, l?.termine, s.enLecture, s.vitesse, l?.commandes?.length, l?.issue].join('|');
    const important = cle !== cleImportante;
    cleImportante = cle;
    if (important) { clearTimeout(minuteur); calculer(); return; }
    if (minuteur) return;
    minuteur = setTimeout(calculer, Math.max(0, PAS_ETAT_MS - (Date.now() - derniere)));
  };
  const desabonner = useMagasin.subscribe((s, p) => {
    if (s.projet !== p.projet || s.lecture !== p.lecture || s.enLecture !== p.enLecture || s.vitesse !== p.vitesse) planifier();
  });
  surRelache(calculer);
  calculer();

  // fin d'une vidéo jouée une seule fois → signal au moteur
  const finVideo = surFinVideo((asset) => {
    const s = useMagasin.getState();
    if (s.enLecture) s.envoyerSignal('video.fin', { valeur: asset, asset });
  });

  // autre machine : la salle du serveur, ouverte quand la coquille y est connectée
  let salle: { id: string; t: TransportSalle; retirer: () => void } | null = null;
  const suivreSalle = () => {
    const e = useSalle.getState();
    const id = o.salle === false || e.statut === 'ferme' ? null : e.projetId;
    if (salle && salle.id !== id) { salle.retirer(); salle.t.fermer(); salle = null; definirSalleFlux(null); }
    if (!id || salle) return;
    const jeton = jetonProjet(id) ?? jetonAdmin();
    if (!jeton) return;
    // la sortie (même machine) reçoit le flux du streamer de la même salle
    definirSalleFlux({ serveur: urlServeur(), projet: id, jeton });
    const qui = identite();
    const t = new TransportSalle({ serveur: urlServeur(), projet: id, jeton, role: 'regie', personne: qui.personne, nom: (qui.nom + ' · sortie').slice(0, 60) });
    salle = { id, t, retirer: ajouterTransport(t) };
  };
  const desabonnerSalle = useSalle.subscribe(suivreSalle);
  suivreSalle();

  // inspection (essais de bout en bout, console) : la conduite et la régie de sortie, comme __recepteur au moniteur
  if (typeof window !== 'undefined') (window as unknown as { __conduite?: unknown }).__conduite = { magasin: useMagasin, sortie: useSortie };

  return () => {
    desabonner(); desabonnerSalle(); finVideo();
    clearTimeout(minuteur);
    surRelache(null);
    if (salle) { salle.retirer(); salle.t.fermer(); salle = null; }
    definirSalleFlux(null);
    retirerLocal();
    arreterRelais();
  };
}

/** Hook de la coquille : relaie automatiquement le spectacle vers la sortie écran scène. */
export function useRelaisSortie(o: { salle?: boolean } = {}): void {
  const salle = o.salle !== false;
  useEffect(() => brancherRelaisSortie({ salle }), [salle]);
}
