// L'en-tête (comme le design) : marque, fil (acte › moment › étape en cours, en accent), vues, modes RÉPÉTITION /
// SPECTACLE (SPECTACLE = structure verrouillée, l'ancien verrou SCÈNE), annuler / rétablir, transport (début, lecture,
// vitesses ×1 ×5 ×20 en RÉPÉTITION seulement), horloge MM:SS / total suivie du badge d'état de la représentation
// (PRÊT, EN LECTURE, ATTENTE DU TOP, EN PAUSE, BLOQUÉ, TERMINÉ), GO, recherche, pupitre, raccourcis, plein écran,
// thème. Tous les chiffres qui changent : largeur fixe, tabulaires.
// Salle collaborative : pastilles de présence (chantier COLLAB) dans un bouton qui ouvre « Projet » (dépôt, serveur, fichier).
// Le retard est affiché dans la barre de la conduite (comme le design).
// Voyant PONT (serveur de spectacle : relié, périmé, absent, jeton refusé, GO non accusé) à côté de la sortie écran scène.
import { VITESSES_REPETITION, useMagasin, type ModeConducteur } from '../etat/magasin';
import { prevoir } from '../etat/moteur';
import { mmss } from '../theme/format';
import { useInterface } from './interface';
import { situation } from './derive';
import { IcoDebut, IcoLecture, IcoLoupe, IcoPause, IcoPleinEcran, IcoProjet, IcoPupitre, IcoTheme, VUES } from './icones';
import { Presence } from '../collab';
import { basculerPleinEcran } from './raccourcis';
import { BoutonSortieScene } from '../sortie';
import { BoutonEmulateur } from './Emulateur';
import { etatRepresentation } from './etat-scene';
import { useGoRecent } from './useGoRecent';
import { VoyantSpectacle } from './RailSorties';

const MODES: [ModeConducteur, string, string][] = [
  ['repetition', 'RÉPÉTITION', 'Écrire, régler, répéter (×1 ×5 ×20) : Espace = lecture / pause, T = GO, la caméra reste libre'],
  ['spectacle', 'SPECTACLE', 'Représentation : structure verrouillée, vitesse ×1, Espace = GO, Maj+Espace = pause, la caméra suit'],
];

export function EnTete() {
  const projet = useMagasin(s => s.projet);
  const lecture = useMagasin(s => s.lecture);
  const enLecture = useMagasin(s => s.enLecture);
  const mode = useMagasin(s => s.mode);
  const vitesse = useMagasin(s => s.vitesse);
  const enAttente = useMagasin(s => s.modificationsEnAttente);
  const nPasse = useMagasin(s => s.passe.length);
  const nFutur = useMagasin(s => s.futur.length);
  const sig = useMagasin(s => s.signaux)();
  const m = useMagasin.getState();
  const ui = useInterface();
  const goRecent = useGoRecent();

  const sit = situation(projet, lecture, sig);
  const total = prevoir(projet).total;
  const t = lecture?.t ?? 0;
  const spectacle = mode === 'spectacle';

  const pret = !!lecture?.attenteGo && sit.passageGo !== null;
  const goTxt = goRecent ? 'GO ✓' : pret ? 'GO · P' + sit.passageGo : 'GO';
  const goClasse = 'go' + (lecture?.termine ? '' : pret ? ' pret' : ' attend');
  const etat = etatRepresentation(lecture, enLecture);

  return (
    <header className={'ent ' + (spectacle ? 'en-spectacle' : 'en-repetition')}>
      <div className="ent-logo">
        <span className="ent-carre"><span /></span>
        <span className="ent-titres">
          <span className="ent-marque">STUDIO REAL</span>
          <span className="ent-projet" title={projet.titre ?? 'Sans titre'}>conducteur du spectacle</span>
        </span>
      </div>
      <nav className="ent-fil" aria-label="Où en est-on">
        <span>{sit.acte}</span><span className="sep">›</span><span>{sit.moment}</span><span className="sep">›</span><span className="cur">{sit.etape}</span>
      </nav>
      <div className="ent-vide" />

      <button className={'ent-salle' + (ui.projets ? ' on' : '')} onClick={() => ui.basculer('projets')}
        title="Projet et salle : spectacle LIVE, projets du serveur, fichier, présence de l’équipe">
        <IcoProjet /><Presence max={4} />
      </button>

      <div className="seg-groupe" role="group" aria-label="Vues">
        {VUES.map(([v, tip, g]) => (
          <button key={v} className={'seg ico' + (ui.vue === v ? ' on' : '')} title={tip} onClick={() => ui.poser({ vue: v })}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d={g} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
          </button>
        ))}
      </div>
      <div className="seg-groupe" role="group" aria-label="Modes">
        {MODES.map(([k, txt, tip]) => (
          <button key={k} className={'seg mode-' + k + (mode === k ? ' on' : '')} title={tip} aria-pressed={mode === k}
            onClick={() => m.changerMode(k)}>{txt}</button>
        ))}
      </div>
      {spectacle && enAttente > 0 && (
        <span className="pastille-attente" title="Modifications reçues de la salle : le lecteur les prendra à l’entrée du prochain moment">
          {enAttente} MODIF. EN ATTENTE
        </span>
      )}
      <div className="histo si-large">
        <button className={nPasse ? 'actif' : ''} onClick={m.annuler} title="Annuler · Ctrl+Z">↶</button>
        <span className="n">{nPasse}</span>
        <button className={nFutur ? 'actif' : ''} onClick={m.retablir} title="Rétablir · Ctrl+Maj+Z">↷</button>
      </div>

      <div className="ent-groupe">
        <button className="btn-carre" onClick={m.revenirAuDebut} title="Revenir au début"><IcoDebut /></button>
        <button className={'lecture' + (enLecture ? ' on' : '')} onClick={m.basculerLecture}
          title={spectacle ? 'Lecture / pause · Maj+Espace' : 'Lecture / pause · Espace'}>
          {enLecture ? <IcoPause /> : <IcoLecture />}
        </button>
        {!spectacle && (
          <div className="seg-groupe si-moyen" role="group" aria-label="Vitesse de répétition">
            {VITESSES_REPETITION.map(v => (
              <button key={v} className={'seg vit' + (vitesse === v ? ' on' : '')} onClick={() => m.changerVitesse(v)}>×{v}</button>
            ))}
          </div>
        )}
        {!spectacle && <span className={'pastille-repetition' + (vitesse !== 1 ? ' rapide' : ' si-moyen')}>RÉPÉTITION ×{vitesse}</span>}
        <div className="horloge" title={etat.libelle}>
          <span className="num t">{mmss(t)}</span>
          <span className="tot">/ {mmss(total)}</span>
        </div>
        <span className={'badge-etat ' + etat.ton + (etat.pulse ? ' pulse' : '')} role="status" aria-live="polite">{etat.libelle}</span>
      </div>

      <button className={goClasse} onClick={() => m.go()} disabled={!!lecture?.termine}
        title={spectacle ? 'GO · le cue suivant, maintenant · Espace' : 'GO · le cue suivant, maintenant · touche T'}>{goTxt}</button>
      <button className={'btn-carre si-moyen' + (ui.recherche ? ' on' : '')} onClick={() => ui.basculer('recherche')} title="Rechercher · Ctrl+K">
        <IcoLoupe />
      </button>
      <button className={'btn-carre si-moyen' + (ui.pupitre ? ' on' : '')} onClick={() => ui.basculer('pupitre')} title="Pupitre de représentation · touche P"><IcoPupitre /></button>
      <button className="btn-carre disp-txt si-moyen" onClick={() => ui.basculer('aide')} title="Raccourcis · touche ?">?</button>
      <VoyantSpectacle />
      <BoutonSortieScene />
      <BoutonEmulateur />
      <button className="btn-carre" onClick={basculerPleinEcran} title={ui.pleinEcran ? 'Quitter le plein écran · F' : 'Plein écran · F'}>
        <IcoPleinEcran actif={ui.pleinEcran} />
      </button>
      <button className="btn-carre" onClick={m.basculerTheme} title="Thème clair / sombre"><IcoTheme /></button>
    </header>
  );
}
