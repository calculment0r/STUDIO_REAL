// L'en-tête (comme le design) : marque, fil (acte › moment › étape en cours, en accent), vues, modes PRÉPARER / JOUER,
// scène verrouillée, annuler / rétablir, transport (début, lecture, vitesses ×1 ×20 ×60), horloge MM:SS / total,
// top régie, recherche, pupitre, raccourcis, plein écran, thème. Tous les chiffres qui changent : largeur fixe, tabulaires.
// Le retard est affiché dans la barre de la conduite (comme le design).
import { useMagasin, type ModeConducteur } from '../etat/magasin';
import { prevoir } from '../etat/moteur';
import { mmss } from '../theme/format';
import { useInterface } from './interface';
import { situation } from './derive';
import { IcoDebut, IcoLecture, IcoLoupe, IcoPause, IcoPleinEcran, IcoPupitre, IcoTheme, IcoVerrou, VUES } from './icones';
import { basculerPleinEcran } from './raccourcis';

const MODES: [ModeConducteur, string, string][] = [
  ['preparer', 'PRÉPARER', 'Écrire, régler et répéter avec la salle simulée : la caméra reste libre'],
  ['jouer', 'JOUER', 'La caméra suit le spectacle'],
];

export function EnTete() {
  const projet = useMagasin(s => s.projet);
  const lecture = useMagasin(s => s.lecture);
  const enLecture = useMagasin(s => s.enLecture);
  const mode = useMagasin(s => s.mode);
  const vitesse = useMagasin(s => s.vitesse);
  const verrou = useMagasin(s => s.verrou);
  const nPasse = useMagasin(s => s.passe.length);
  const nFutur = useMagasin(s => s.futur.length);
  const topArme = useMagasin(s => s.topArme);
  const sig = useMagasin(s => s.signaux)();
  const m = useMagasin.getState();
  const ui = useInterface();

  const sit = situation(projet, lecture, sig);
  const total = prevoir(projet).total;
  const t = lecture?.t ?? 0;

  const pret = !!lecture?.attenteGo && sit.passageGo !== null;
  const momentCourant = projet.ev[sit.index]?.id;
  const goTxt = pret ? 'GO · P' + sit.passageGo
    : sit.passageGo !== null ? (topArme && topArme === momentCourant ? 'P' + sit.passageGo + ' ARMÉ' : 'P' + sit.passageGo + ' ' + mmss(Math.ceil(sit.avantPret)))
    : 'GO';
  const goClasse = 'go' + (pret ? ' pret' : sit.passageGo !== null ? ' attend' : '');

  const etat = !lecture ? ['PRÊT', 'var(--gt)', false]
    : lecture.termine ? ['TERMINÉ', 'var(--gt)', false]
    : lecture.attenteGo ? ['ATTENTE DU TOP', 'var(--ort)', true]
    : lecture.bloque ? ['BLOQUÉ', 'var(--ort)', true]
    : enLecture ? ['EN LECTURE', 'var(--rec)', true]
    : ['EN PAUSE', 'var(--ink3)', false];


  return (
    <header className="ent">
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

      <div className="seg-groupe" role="group" aria-label="Vues">
        {VUES.map(([v, tip, g]) => (
          <button key={v} className={'seg ico' + (ui.vue === v ? ' on' : '')} title={tip} onClick={() => ui.poser({ vue: v })}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d={g} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
          </button>
        ))}
      </div>
      <div className="seg-groupe" role="group" aria-label="Modes">
        {MODES.map(([k, txt, tip]) => (
          <button key={k} className={'seg' + (mode === k ? ' on' : '')} title={tip} onClick={() => m.changerMode(k)}>{txt}</button>
        ))}
      </div>
      <button className={'verrou si-petit' + (verrou ? ' on' : '')} onClick={m.basculerVerrou}
        title={verrou ? 'Mode scène · verrouillé. Cliquer pour déverrouiller' : 'Verrouiller la conduite (scène)'}>
        <IcoVerrou ferme={verrou} /><span className="si-large">SCÈNE</span>
      </button>
      <div className="histo si-large">
        <button className={nPasse ? 'actif' : ''} onClick={m.annuler} title="Annuler · Ctrl+Z">↶</button>
        <span className="n">{nPasse}</span>
        <button className={nFutur ? 'actif' : ''} onClick={m.retablir} title="Rétablir · Ctrl+Maj+Z">↷</button>
      </div>

      <div className="ent-groupe">
        <button className="btn-carre" onClick={m.revenirAuDebut} title="Revenir au début"><IcoDebut /></button>
        <button className={'lecture' + (enLecture ? ' on' : '')} onClick={m.basculerLecture} title="Lecture / pause · Espace">
          {enLecture ? <IcoPause /> : <IcoLecture />}
        </button>
        <div className="seg-groupe si-moyen" role="group" aria-label="Vitesse">
          {[1, 20, 60].map(v => (
            <button key={v} className={'seg vit' + (vitesse === v ? ' on' : '')} onClick={() => m.changerVitesse(v)}>×{v}</button>
          ))}
        </div>
        <div className="horloge" title={etat[0] as string}>
          <span className="num t">{mmss(t)}</span>
          <span className="tot">/ {mmss(total)}</span>
        </div>
      </div>

      <button className={goClasse} onClick={m.top} title="Top régie · touche T">{goTxt}</button>
      <button className={'btn-carre si-moyen' + (ui.recherche ? ' on' : '')} onClick={() => ui.basculer('recherche')} title="Rechercher · Ctrl+K">
        <IcoLoupe />
      </button>
      <button className={'btn-carre si-moyen' + (ui.pupitre ? ' on' : '')} onClick={() => ui.basculer('pupitre')} title="Pupitre de représentation · touche P"><IcoPupitre /></button>
      <button className="btn-carre disp-txt si-moyen" onClick={() => ui.basculer('aide')} title="Raccourcis · touche ?">?</button>
      <button className="btn-carre" onClick={basculerPleinEcran} title={ui.pleinEcran ? 'Quitter le plein écran · F' : 'Plein écran · F'}>
        <IcoPleinEcran actif={ui.pleinEcran} />
      </button>
      <button className="btn-carre" onClick={m.basculerTheme} title="Thème clair / sombre"><IcoTheme /></button>
    </header>
  );
}
