// Ce qui se pose par-dessus la mise en page : cadre « en lecture », alerte de sécurité (repères de la piste Sécurité,
// alertes du moteur et alertes des sorties : acteur perdu, sortie périmée, chute des connectés, écart, serveur muet),
// pupitre de représentation (avec le pupitre de la régie), ouverture de projet (onglets PROJET, SPECTACLE, LIENS), raccourcis,
// et la fenêtre détachable de l'émulateur de téléphones (Emulateur.tsx, touche E).
import { useMagasin } from '../etat/magasin';
import { prevoir } from '../etat/moteur';
import { deconnecterSalle, useSalle } from '../etat/serveur';
import { OuvrirProjet } from '../collab';
import { mmss, mmssSigne } from '../theme/format';
import { useInterface } from './interface';
import { situation } from './derive';
import { PupitreRegie } from './Regie';
import { chargerEcho, chargerLive } from './projet-live';
import { useGoRecent } from './useGoRecent';
import { useSpectacle } from '../etat/spectacle';
import { OngletsProjet, SpectacleProjet } from './LiensActeurs';
import { useOngletProjet } from './rail-etat';

export { FenetreEmulateur } from './Emulateur';

/** Une alerte du moteur reste au bandeau ce temps-là (horloge murale) si personne ne l'accuse. */
const DUREE_ALERTE_MS = 9000;

export function CadreEnLecture() {
  const on = useMagasin(s => s.enLecture);
  if (!on) return null;
  return (
    <>
      <span className="en-lecture-cadre" />
      <span className="en-lecture-onglet"><span />EN LECTURE</span>
    </>
  );
}

/** Repères de la piste Sécurité : bandeau rouge `lead` secondes avant (10 par défaut), à accuser réception. */
export function AlerteSecurite() {
  const projet = useMagasin(s => s.projet);
  const t = useMagasin(s => s.lecture?.t ?? null);
  const accuses = useInterface(s => s.accuses);
  const poser = useInterface(s => s.poser);
  const journal = useMagasin(s => s.journalRegie);
  const alertesSorties = useSpectacle(s => s.alertes);
  if (t === null) return null;
  const prev = prevoir(projet);
  const debut = (ev: string) => prev.moments.find(x => x.id === ev)?.debut ?? 0;
  for (const tk of projet.tracks) {
    if (tk.type !== 'secu') continue;
    for (const mk of tk.marks ?? []) {
      const abs = debut(mk.ev) + mk.off, lead = mk.lead ?? 10;
      if (accuses.includes(mk.id) || t < abs - lead || t > abs + 4) continue;
      return (
        <div className="alerte" role="alert">
          <span className="p" />
          <span className="t"><span className="q">SÉCURITÉ · {t < abs ? 'DANS ' + mmss(abs - t) : 'MAINTENANT'}</span><span className="x">{mk.txt}</span></span>
          <button onClick={() => poser({ accuses: [...accuses, mk.id] })}>BIEN REÇU</button>
        </div>
      );
    }
  }
  // Alertes des sorties (serveur de spectacle, rail) : tant que la condition dure, à accuser ; une nouvelle
  // occurrence de la même condition revient au bandeau.
  const sortie = alertesSorties.find(a => !accuses.includes('spec:' + a.cle));
  if (sortie) {
    return (
      <div className="alerte" role="alert">
        <span className="p" />
        <span className="t"><span className="q">SORTIES · {sortie.code.toUpperCase()}</span><span className="x">{sortie.texte}</span></span>
        <button onClick={() => poser({ accuses: [...accuses, 'spec:' + sortie.cle] })}>BIEN REÇU</button>
      </div>
    );
  }
  // Alertes du moteur (garde-fou échu, machine sans réponse, consigne non lue, étape bloquée…) : la plus récente,
  // quelques secondes, à accuser ; toutes restent dans le journal de régie.
  const maintenant = Date.now();
  for (let i = journal.length - 1; i >= 0; i--) {
    const l = journal[i]!;
    if (maintenant - l.recu > DUREE_ALERTE_MS) break;
    if (l.genre !== 'alerte' || accuses.includes('regie:' + l.n)) continue;
    return (
      <div className="alerte" role="alert">
        <span className="p" />
        <span className="t"><span className="q">ALERTE · {l.type} · {mmss(l.t)}</span><span className="x">{l.txt}</span></span>
        <button onClick={() => poser({ accuses: [...accuses, 'regie:' + l.n] })}>BIEN REÇU</button>
      </div>
    );
  }
  return null;
}

/** Ouverture de projet : les projets du dépôt (spectacle LIVE, démonstration) en local, puis ceux du serveur, un fichier
 *  et l'identité dans la salle (<OuvrirProjet/> du chantier COLLAB). Sans serveur, tout marche en local. */
export function Projets() {
  const ouvert = useInterface(s => s.projets);
  const basculer = useInterface(s => s.basculer);
  const titre = useMagasin(s => s.projet.titre);
  const onglet = useOngletProjet(s => s.onglet);
  if (!ouvert) return null;
  const fermer = () => useInterface.getState().poser({ projets: false });
  const demo = () => {
    if (useSalle.getState().salle) deconnecterSalle(true);
    const m = useMagasin.getState();
    m.revenirDemo();
    m.revenirAuDebut();
    fermer();
  };
  return (
    <div className="voile" onPointerDown={() => basculer('projets')}>
      <div className="fenetre pj" onPointerDown={e => e.stopPropagation()} role="dialog" aria-label="Ouvrir un projet">
        <div className="pn-tete">
          <span className="disp" style={{ fontSize: 12, letterSpacing: '.14em' }}>PROJET</span>
          <span className="pn-droite pj-courant">{titre ?? 'Sans titre'}</span>
          <button className="pn-fermer" onClick={fermer}>ÉCHAP POUR FERMER</button>
        </div>
        <OngletsProjet />
        {onglet !== 'projet' ? <SpectacleProjet /> : <>
        <span className="pn-micro">PROJETS DU DÉPÔT · EN LOCAL</span>
        <div className="pj-cartes">
          <button className="pj-carte" onClick={() => void chargerLive().then(ok => { if (ok) fermer(); })}>
            <span className="t">SPECTACLE LIVE</span>
            <span className="d">Le chef, streamer en direct · la salle décide</span>
          </button>
          <button className="pj-carte" onClick={() => void chargerEcho().then(ok => { if (ok) fermer(); })}>
            <span className="t">SPECTACLE ÉCHO</span>
            <span className="d">Jim, influenceur · l’IA qui synthétise le public</span>
          </button>
          <button className="pj-carte" onClick={demo}>
            <span className="t">DÉMONSTRATION</span>
            <span className="d">L’exemple du design</span>
          </button>
        </div>
        <OuvrirProjet onOuvert={fermer} />
        </>}
      </div>
    </div>
  );
}

export function Pupitre() {
  const ouvert = useInterface(s => s.pupitre);
  const basculer = useInterface(s => s.basculer);
  const projet = useMagasin(s => s.projet);
  const lecture = useMagasin(s => s.lecture);
  const enLecture = useMagasin(s => s.enLecture);
  const mode = useMagasin(s => s.mode);
  const sig = useMagasin(s => s.signaux)();
  const m = useMagasin.getState();
  const goRecent = useGoRecent();
  if (!ouvert) return null;
  const spectacle = mode === 'spectacle';
  const sit = situation(projet, lecture, sig);
  const pret = !!lecture?.attenteGo && sit.passageGo !== null;
  const go = goRecent ? 'GO ✓' : pret ? 'GO · P' + sit.passageGo : 'GO';
  return (
    <div className="pupitre" role="dialog" aria-label="Pupitre de représentation">
      <div className="pup-tete">
        <span className="disp" style={{ fontSize: 12, letterSpacing: '.14em' }}>PUPITRE · REPRÉSENTATION</span>
        <span className="mono" style={{ fontSize: 8, letterSpacing: '.14em', color: 'var(--ink3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {(sit.acte + ' › ' + sit.moment).toUpperCase()}
        </span>
        <div style={{ flex: 1 }} />
        <button className={'pup-btn' + (enLecture ? ' on' : '')} onClick={m.basculerLecture}>
          {(enLecture ? 'PAUSE · ' : 'LECTURE · ') + (spectacle ? 'MAJ+ESPACE' : 'ESPACE')}
        </button>
        <button className={'pup-btn' + (spectacle ? ' on' : '')} onClick={() => m.changerMode(spectacle ? 'repetition' : 'spectacle')}
          title="SPECTACLE : structure verrouillée, vitesse ×1, Espace = GO">SPECTACLE</button>
        <button className="pup-btn" onClick={() => basculer('pupitre')}>QUITTER · ÉCHAP</button>
      </div>
      <div className="pup-grille avec-regie">
        <div className="pup-col">
          <span className="mono" style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ort)', textTransform: 'uppercase' }}>{sit.tag}</span>
          <span className="disp" style={{ fontSize: 32, letterSpacing: '.08em', lineHeight: 1.2, textTransform: 'uppercase', textWrap: 'balance' }}>{sit.nom}</span>
          <span style={{ fontSize: 15, color: 'var(--ink2)' }}>{sit.sous}</span>
          <span className="num" style={{ fontSize: 124, lineHeight: 1, color: 'var(--cy)', letterSpacing: '.02em', marginTop: 10 }}>{mmss(sit.reste)}</span>
          <span className="mono" style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ink3)' }}>{sit.resteLab}</span>
          <span className="barre" style={{ height: 4, maxWidth: 520 }}><span style={{ width: (sit.progres * 100).toFixed(1) + '%', background: 'var(--ort)' }} /></span>
          <span style={{ fontSize: 15, color: 'var(--ink2)' }}>Ensuite : <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{sit.ensuite}</b></span>
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 8.5, letterSpacing: '.16em', color: 'var(--ink3)' }}>
            HORLOGE {mmss(lecture?.t ?? 0)} / {mmss(prevoir(projet).total)} · RETARD {mmssSigne(lecture?.retard ?? 0)}
          </span>
        </div>
        <div className="pup-col">
          <span className="mono" style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ort)' }}>POUR PASSER À LA SUITE</span>
          <span style={{ fontSize: 14, color: 'var(--ink2)', lineHeight: 1.45 }}>{sit.regle}</span>
          {sit.lignes.map((l, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={'point' + (l.enCours ? ' pulse' : '')} style={{ background: l.ok ? 'var(--gt)' : 'var(--ort)' }} />
                <span className="mono" style={{ flex: 1, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>{l.lab}</span>
                <span className="num" style={{ fontSize: 14 }}>{l.val}</span>
              </div>
              <span className="barre" style={{ height: 5, borderRadius: 'var(--rayon-petit)' }}><span style={{ width: (l.progres * 100).toFixed(1) + '%', background: l.ok ? 'var(--gt)' : 'var(--ort)' }} /></span>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <button className={'pup-go' + (pret ? ' pret' : ' attend')} onClick={() => m.go()} disabled={!!lecture?.termine}>{go}</button>
        </div>
        <div className="pup-col pup-regie">
          <span className="mono" style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ort)' }}>RÉGIE · ENTRÉES ET COMMANDES</span>
          <PupitreRegie large />
        </div>
      </div>
    </div>
  );
}

const RACCOURCIS: [string, string][] = [
  ['Espace', 'SPECTACLE : GO · RÉPÉTITION : lecture / pause'], ['Maj + Espace', 'SPECTACLE : lecture / pause'],
  ['T / G', 'GO (le cue suivant, maintenant)'], ['P', 'Pupitre de représentation'], ['Ctrl + Espace', 'Tiroir des assets'],
  ['E', 'Émulateur de téléphones'], ['Ctrl + Z', 'Annuler'], ['Ctrl + Maj + Z', 'Rétablir'], ['M', 'Nouveau moment'], ['K', 'Note de régie à la tête de lecture'],
  ['+ / −', 'Zoom de la conduite'], ['F', 'Plein écran (sur la planche : recadrer)'], ['V / C', 'Outils de la conduite : sélection / couper'], ['Ctrl + K', 'Rechercher'],
  ['Échap', 'Fermer / désélectionner'], ['?', 'Raccourcis'],
];

export function Aide() {
  const ouvert = useInterface(s => s.aide);
  const basculer = useInterface(s => s.basculer);
  if (!ouvert) return null;
  return (
    <div className="voile" onPointerDown={() => basculer('aide')}>
      <div className="fenetre" onPointerDown={e => e.stopPropagation()} role="dialog" aria-label="Raccourcis">
        <div className="pn-tete">
          <span className="disp" style={{ fontSize: 12, letterSpacing: '.14em' }}>RACCOURCIS</span>
          <button className="pn-fermer" onClick={() => basculer('aide')}>? OU ÉCHAP POUR FERMER</button>
        </div>
        <div className="aide-grille">
          {RACCOURCIS.map(([k, d]) => <div key={k} className="aide-ligne"><span className="k">{k}</span><span className="d">{d}</span></div>)}
        </div>
      </div>
    </div>
  );
}
