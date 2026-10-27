// Ce qui se pose par-dessus la mise en page : cadre « en lecture », alerte de sécurité, pupitre de représentation,
// raccourcis.
import { useMagasin } from '../etat/magasin';
import { prevoir } from '../etat/moteur';
import { mmss, mmssSigne } from '../theme/format';
import { useInterface } from './interface';
import { situation } from './derive';

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
  return null;
}

export function Pupitre() {
  const ouvert = useInterface(s => s.pupitre);
  const basculer = useInterface(s => s.basculer);
  const projet = useMagasin(s => s.projet);
  const lecture = useMagasin(s => s.lecture);
  const enLecture = useMagasin(s => s.enLecture);
  const verrou = useMagasin(s => s.verrou);
  const sig = useMagasin(s => s.signaux)();
  const m = useMagasin.getState();
  if (!ouvert) return null;
  const sit = situation(projet, lecture, sig);
  const pret = !!lecture?.attenteGo && sit.passageGo !== null;
  const go = pret ? 'GO · P' + sit.passageGo : sit.passageGo !== null ? 'P' + sit.passageGo + ' ' + mmss(Math.ceil(sit.avantPret)) : 'GO';
  return (
    <div className="pupitre" role="dialog" aria-label="Pupitre de représentation">
      <div className="pup-tete">
        <span className="disp" style={{ fontSize: 12, letterSpacing: '.14em' }}>PUPITRE · REPRÉSENTATION</span>
        <span className="mono" style={{ fontSize: 8, letterSpacing: '.14em', color: 'var(--ink3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {(sit.acte + ' › ' + sit.moment).toUpperCase()}
        </span>
        <div style={{ flex: 1 }} />
        <button className={'pup-btn' + (enLecture ? ' on' : '')} onClick={m.basculerLecture}>{enLecture ? 'PAUSE · ESPACE' : 'LECTURE · ESPACE'}</button>
        <button className={'pup-btn' + (verrou ? ' on' : '')} onClick={m.basculerVerrou}>SCÈNE</button>
        <button className="pup-btn" onClick={() => basculer('pupitre')}>QUITTER · ÉCHAP</button>
      </div>
      <div className="pup-grille">
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
              <span className="barre" style={{ height: 5, borderRadius: 3 }}><span style={{ width: (l.progres * 100).toFixed(1) + '%', background: l.ok ? 'var(--gt)' : 'var(--ort)' }} /></span>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <button className={'pup-go' + (pret ? ' pret' : sit.passageGo !== null ? ' attend' : '')} onClick={m.top}>{go}</button>
        </div>
      </div>
    </div>
  );
}

const RACCOURCIS: [string, string][] = [
  ['Espace', 'Lecture / pause'], ['T', 'Top régie'], ['P', 'Pupitre de représentation'], ['Ctrl + Espace', 'Tiroir des assets'],
  ['Ctrl + Z', 'Annuler'], ['Ctrl + Maj + Z', 'Rétablir'], ['M', 'Nouveau moment'], ['K', 'Note de régie à la tête de lecture'],
  ['+ / −', 'Zoom de la conduite'], ['F', 'Plein écran (sur la planche : recadrer)'], ['Échap', 'Fermer / désélectionner'], ['?', 'Raccourcis'],
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
