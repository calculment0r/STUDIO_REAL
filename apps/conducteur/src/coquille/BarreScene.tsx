// Barre de scène : la bande fixe en bas de la coquille, visible en RÉPÉTITION comme en SPECTACLE. De gauche à droite :
//   GO (grand) · EN COURS · PROCHAIN · RETENIR · SAUTER À… · +30 s · PAUSE / REPRISE · PANIQUE.
// Elle remplace le gros bouton TAP flottant. Le GO est la même action que partout (magasin.go, anti-double 800 ms).
// Raccourcis : Espace / T / G = GO (voir raccourcis.ts), H = RETENIR, J = +30 s, Maj+Espace = pause / reprise,
// Ctrl+Maj+K = SAUTER À… (Ctrl+K reste à la recherche). PANIQUE n'a aucun raccourci : appui long de 0,7 s (jauge visible) ou double-clic, jamais le clavier.
// Toutes les décisions (libellés, états, progression, liste des sauts) sont dans barre-etat.ts (pur, testé).
// Sous 900 px de large, les libellés passent en icône + info-bulle.
// Performance (lot performance-react) : la barre ne se ré-exécute que si la STRUCTURE de la lecture change (étape, attente du
// GO, retenue, pause…) ; le temps dans l'étape et la jauge (TempsEnCours) suivent l'horloge au quart de seconde.
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useMagasin } from '../etat/magasin';
import { useHorloge, useTempsArrondi } from '../etat/horloge';
import { mmss } from '../theme/format';
import { IcoAller, IcoLecture, IcoPause } from './icones';
import { useInterface } from './interface';
import { useGoRecent } from './useGoRecent';
import { lectureDepuis, useStructure } from './structure-lecture';
import {
  confirmationRequise, creerAppuiLong, dureeMinimale, filtrerSauts, listeSauts, phraseConfirmation, vueBarre, type Saut,
} from './barre-etat';
import './barre-scene.css';

const IcoRetenir = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2.5" y="6" width="9" height="6" rx="1.2" /><path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" />
  </svg>
);
const IcoPanique = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 1.5 L12.8 12 H1.2 Z" /><path d="M7 5.5v3" /><path d="M7 10.4v.1" />
  </svg>
);

/** Bouton de la barre : libellé (masqué sous 900 px) + icône (visible sous 900 px) + info-bulle. */
function Bouton(p: {
  classe?: string; libelle: string; icone: ReactNode; titre: string; aria: string; desactive?: boolean; enfonce?: boolean;
  onClick?: () => void; extra?: ReactNode;
}) {
  return (
    <button type="button" className={'bs-btn' + (p.classe ? ' ' + p.classe : '') + (p.enfonce ? ' enfonce' : '')}
      title={p.titre} aria-label={p.aria} aria-pressed={p.enfonce === undefined ? undefined : p.enfonce}
      disabled={p.desactive} onClick={p.onClick}>
      <span className="bs-ico" aria-hidden="true">{p.icone}</span>
      <span className="bs-txt" aria-hidden="true">{p.libelle}</span>
      {p.extra}
    </button>
  );
}

/** PANIQUE : appui long (jauge) ou double-clic ; le clavier n'a aucun effet. */
function BoutonPanique({ enfonce, libelle, titre, aria }: { enfonce: boolean; libelle: string; titre: string; aria: string }) {
  const [progres, setProgres] = useState(0);
  const basculer = () => useMagasin.getState().panique(!useMagasin.getState().enPanique);
  const appui = useRef(creerAppuiLong({ surProgres: setProgres, surDeclenche: () => basculer() }));
  useEffect(() => { const a = appui.current; return () => a.arreter(); }, []);
  const arreter = () => appui.current.arreter();
  const ignorerClavier = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); };
  return (
    <button type="button" className={'bs-btn bs-panique' + (enfonce ? ' enfonce' : '')} title={titre} aria-label={aria}
      aria-pressed={enfonce} aria-describedby="bs-aide-panique"
      onPointerDown={e => { if (e.button === 0) appui.current.commencer(); }}
      onPointerUp={arreter} onPointerLeave={arreter} onPointerCancel={arreter}
      onDoubleClick={() => { arreter(); basculer(); }}
      onKeyDown={ignorerClavier} onKeyUp={ignorerClavier}
      onContextMenu={e => e.preventDefault()}>
      <span className="bs-jauge" style={{ transform: 'scaleX(' + progres.toFixed(3) + ')' }} aria-hidden="true" />
      <span className="bs-ico" aria-hidden="true"><IcoPanique /></span>
      <span className="bs-txt" aria-hidden="true">{libelle}</span>
      <span id="bs-aide-panique" className="bs-cache">Appui long de 0,7 seconde ou double-clic. Aucun raccourci clavier.</span>
    </button>
  );
}

/** Liste « SAUTER À… » : moments puis étapes, recherche par texte, Entrée = saut (confirmé en SPECTACLE). */
function Sauter({ fermer }: { fermer: () => void }) {
  const projet = useMagasin(s => s.projet);
  const mode = useMagasin(s => s.mode);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const [aConfirmer, setAConfirmer] = useState<Saut | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  const tous = useMemo(() => listeSauts(projet), [projet]);
  const liste = useMemo(() => filtrerSauts(tous, q).slice(0, 80), [tous, q]);
  const si = Math.max(0, Math.min(i, liste.length - 1));
  useEffect(() => { champ.current?.focus(); }, []);

  const sauter = (s: Saut) => {
    useMagasin.getState().allerA(s.moment, s.etape);
    fermer();
  };
  const choisir = (s: Saut) => {
    const dejaDemande = !!aConfirmer && aConfirmer.moment === s.moment && aConfirmer.etape === s.etape;
    if (confirmationRequise(mode) && !dejaDemande) { setAConfirmer(s); return; }
    sauter(s);
  };
  const touche = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAConfirmer(null); setI(Math.min(liste.length - 1, si + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAConfirmer(null); setI(Math.max(0, si - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const s = liste[si]; if (s) choisir(s); }
    else if (e.key === 'Escape') { e.preventDefault(); if (aConfirmer) setAConfirmer(null); else fermer(); }
    e.stopPropagation();
  };
  return (
    <>
      <div className="bs-fond" onPointerDown={fermer} />
      <div className="bs-saut" role="dialog" aria-label="Sauter à un moment ou une étape">
        <input ref={champ} value={q} placeholder="Chercher un moment ou une étape…" aria-label="Chercher un moment ou une étape"
          aria-controls="bs-saut-liste" aria-activedescendant={liste[si] ? 'bs-saut-' + si : undefined}
          onChange={e => { setQ(e.target.value); setI(0); setAConfirmer(null); }} onKeyDown={touche} />
        <div className="bs-saut-liste" id="bs-saut-liste" role="listbox" aria-label="Moments et étapes">
          {liste.map((s, k) => (
            <div key={s.moment + '/' + (s.etape ?? '')} id={'bs-saut-' + k} role="option" aria-selected={k === si}
              className={'bs-saut-ligne ' + s.niveau + (k === si ? ' on' : '')}
              onPointerEnter={() => setI(k)} onClick={() => choisir(s)}>
              <span className="t">{s.libelle}</span>
              <span className="s">{s.sous}</span>
            </div>
          ))}
          {!liste.length && <span className="bs-saut-vide">Aucun moment ni étape ne correspond.</span>}
        </div>
        {aConfirmer
          ? <span className="bs-saut-pied confirme" role="alert">{phraseConfirmation(aConfirmer)}</span>
          : <span className="bs-saut-pied">↑ ↓ CHOISIR · ENTRÉE SAUTER{confirmationRequise(mode) ? ' (À CONFIRMER)' : ''} · ÉCHAP FERMER</span>}
      </div>
    </>
  );
}

/** Temps dans l'étape (ou le passage), durée minimale et jauge : le seul morceau de la barre qui suit le temps (quart de seconde). */
const TempsEnCours = memo(function TempsEnCours({ passage, dureeS, cumulTxt }: { passage: boolean; dureeS: number | null; cumulTxt: string }) {
  const tEtape = useTempsArrondi('tEtape', 0.25);
  const temps = mmss(tEtape);
  const duree = passage || dureeS === null ? '' : mmss(dureeS);
  const progres = !passage && dureeS && dureeS > 0 ? Math.max(0, Math.min(1, tEtape / dureeS)) : 0;
  const depasse = !passage && dureeS !== null && tEtape >= dureeS - 1e-6;
  return (
    <>
      <span className="bs-temps num" aria-label={'Temps dans l’étape ' + temps + (duree ? ' sur ' + duree : '')}>
        {temps}{duree && <i> / {duree}</i>}
        {cumulTxt && <b className="bs-plus"> {cumulTxt}</b>}
      </span>
      {!passage && (
        <span className={'bs-prog' + (depasse ? ' depasse' : '')} role="progressbar" aria-label="Durée minimale de l’étape"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progres * 100)}>
          <span style={{ width: (progres * 100).toFixed(1) + '%' }} />
        </span>
      )}
    </>
  );
});

export function BarreScene() {
  const st = useStructure();
  // « la représentation a commencé » (horloge > 0) : bascule une seule fois, au début de la lecture
  const commence = useHorloge(h => h.t > 0);
  const enLecture = useMagasin(s => s.enLecture);
  const projet = useMagasin(s => s.projet);
  const enPanique = useMagasin(s => s.enPanique);
  const mode = useMagasin(s => s.mode);
  const saut = useInterface(s => s.allerA);
  const poser = useInterface(s => s.poser);
  const goRecent = useGoRecent();
  // tout ce que la barre affiche, sauf le temps passé dans l'étape : calculé sur la structure (temps de l'étape à 0)
  const v = useMemo(
    () => vueBarre({ lecture: lectureDepuis(st, { t: commence ? 1 : 0, tEtape: 0 }), enLecture, projet, enPanique, goRecent }),
    [st, commence, enLecture, projet, enPanique, goRecent],
  );
  const dureeS = useMemo(() => dureeMinimale(projet, st), [projet, st]);
  const m = useMagasin.getState();
  const e = v.enCours;

  return (
    <div className={'barre-scene' + (enPanique ? ' en-panique' : '') + (mode === 'spectacle' ? ' en-spectacle' : '')}
      role="toolbar" aria-label="Barre de scène">
      {enPanique && <div className="bs-bandeau" role="alert">PANIQUE · écrans de sécurité, sortie au noir</div>}
      <button type="button" className={'bs-go' + (v.go.attente ? ' attente' : '') + (goRecent ? ' fait' : '')}
        title={v.go.titre} aria-label={v.go.aria} disabled={v.go.desactive} onClick={() => m.go()}>
        {v.go.libelle}
      </button>

      <div className="bs-cue en-cours" aria-label="Étape en cours">
        <span className="bs-micro">{e?.passage ? 'PASSAGE' : 'EN COURS'}</span>
        <span className="bs-nom">{e?.nom ?? (v.termine ? 'FIN DU SPECTACLE' : '—')}</span>
        {e && <TempsEnCours passage={e.passage} dureeS={dureeS} cumulTxt={v.prolonger.cumulTxt} />}
      </div>
      <div className="bs-cue prochain" aria-label="Prochaine étape">
        <span className="bs-micro">PROCHAIN</span>
        <span className="bs-nom">{v.prochain ?? '—'}</span>
      </div>

      <div className="bs-groupe">
        <Bouton classe="bs-retenir" libelle={v.retenir.libelle} icone={<IcoRetenir />} titre={v.retenir.titre} aria={v.retenir.aria}
          enfonce={v.retenir.enfonce} desactive={v.retenir.desactive} onClick={() => m.retenir()}
          extra={v.retenir.enfonce ? <span className="bs-pastille" aria-hidden="true" /> : undefined} />
        <Bouton classe="bs-sauter" libelle={v.sauter.libelle} icone={<IcoAller />} titre={v.sauter.titre} aria={v.sauter.aria}
          desactive={v.sauter.desactive} onClick={() => poser({ allerA: !saut, recherche: false })} />
        <Bouton classe="bs-prolonger" libelle={v.prolonger.libelle} icone={<span className="bs-plus30">+30</span>} titre={v.prolonger.titre}
          aria={v.prolonger.aria} desactive={v.prolonger.desactive} onClick={() => m.prolonger(30)}
          extra={v.prolonger.cumulTxt ? <span className="bs-cumul" aria-hidden="true">{v.prolonger.cumulTxt}</span> : undefined} />
        <Bouton classe="bs-pause" libelle={v.pause.libelle} icone={enLecture ? <IcoPause /> : <IcoLecture />} titre={v.pause.titre}
          aria={v.pause.aria} enfonce={v.pause.enfonce} desactive={v.pause.desactive} onClick={() => m.basculerLecture()} />
        <BoutonPanique enfonce={v.panique.enfonce} libelle={v.panique.libelle} titre={v.panique.titre} aria={v.panique.aria} />
      </div>
      {saut && <Sauter fermer={() => poser({ allerA: false })} />}
    </div>
  );
}
