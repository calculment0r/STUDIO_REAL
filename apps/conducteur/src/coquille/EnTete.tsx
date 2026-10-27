// L'en-tête : marque et titre du projet, fil (acte › moment › étape), vues, modes Écrire / Répéter / Jouer, scène
// verrouillée, annuler / rétablir, transport (début, lecture, vitesse), horloge MM:SS, retard et état, top régie,
// aller au moment, pupitre, raccourcis, plein écran, thème. Tous les chiffres qui changent : largeur fixe, tabulaires.
import { useRef } from 'react';
import { useMagasin, type ModeConducteur } from '../etat/magasin';
import { prevoir } from '../etat/moteur';
import { mmss, mmssSigne } from '../theme/format';
import { useInterface } from './interface';
import { situation } from './derive';
import { IcoAller, IcoDebut, IcoLecture, IcoPause, IcoPleinEcran, IcoPupitre, IcoTheme, IcoVerrou, VUES } from './icones';
import { basculerPleinEcran } from './raccourcis';

const MODES: [ModeConducteur, string, string][] = [
  ['ecrire', 'ÉCRIRE', 'Écrire et régler, la caméra reste libre'],
  ['repeter', 'RÉPÉTER', 'Répéter avec la salle simulée'],
  ['jouer', 'JOUER', 'Représentation : la caméra suit le spectacle'],
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
  const refAller = useRef<HTMLButtonElement>(null);

  const sit = situation(projet, lecture, sig);
  const total = prevoir(projet).total;
  const t = lecture?.t ?? 0;
  const retard = lecture?.retard ?? 0;

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

  const ouvrirAller = () => {
    const r = refAller.current?.getBoundingClientRect();
    ui.poser({ allerA: !ui.allerA });
    if (r) document.documentElement.style.setProperty('--menu-aller-x', Math.max(8, r.right - 280) + 'px');
  };

  return (
    <header className="ent">
      <div className="ent-logo">
        <span className="ent-carre"><span /></span>
        <span className="ent-titres">
          <span className="ent-marque">STUDIO REAL</span>
          <span className="ent-projet" title={projet.titre ?? 'Sans titre'}>{projet.titre ?? 'Sans titre'}</span>
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
        <div className="horloge">
          <span className="num t">{mmss(t)}</span>
          <span className="tot">/ <span className="num">{mmss(total)}</span></span>
          <span className="ret">
            <span className="ret-l">RETARD <span className={'num ret-v' + (retard > 30 ? ' fort' : '')}>{mmssSigne(retard)}</span></span>
            <span className="etat"><span className={'point' + (etat[2] ? ' pulse' : '')} style={{ background: etat[1] as string }} />{etat[0] as string}</span>
          </span>
        </div>
      </div>

      <button className={goClasse} onClick={m.top} title="Top régie · touche T">{goTxt}</button>
      <button ref={refAller} className={'btn-carre si-moyen' + (ui.allerA ? ' on' : '')} onClick={ouvrirAller} title="Aller au moment">
        <IcoAller />
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

/** Menu « aller au moment » : liste des moments, début prévu, clic = la lecture saute à ce moment. */
export function MenuAller() {
  const projet = useMagasin(s => s.projet);
  const courant = useMagasin(s => s.lecture?.moment);
  const ouvert = useInterface(s => s.allerA);
  const poser = useInterface(s => s.poser);
  if (!ouvert) return null;
  const prev = prevoir(projet);
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 119 }} onPointerDown={() => poser({ allerA: false })} />
      <div className="menu" style={{ left: 'var(--menu-aller-x, 50%)', top: 52 }} role="menu">
        <span className="menu-titre">ALLER AU MOMENT</span>
        {projet.ev.map((ev, i) => (
          <button key={ev.id} role="menuitem" className={'menu-ligne' + (courant === ev.id ? ' cur' : '')}
            onClick={() => { useMagasin.getState().allerA(ev.id); poser({ allerA: false }); }}>
            <span className="num no">{String(i + 1).padStart(2, '0')}</span>
            <span className="nm">{ev.name}</span>
            <span className="num tc">{mmss(prev.moments[i]?.debut ?? 0)}</span>
          </button>
        ))}
      </div>
    </>
  );
}
