// Panneau ÉMULATEUR DE TÉLÉPHONES (audit 2026-10, rapport 2 §4.4) : de faux spectateurs pour répéter sans vrais
// téléphones. Fenêtre ancrée à droite ou détachée (flottante, déplaçable par sa barre), touche E, bouton de l'en-tête.
//   · ligne de commande : population, mélange, graine, arrivées, vitesse ×1 ×4 ×20, Démarrer / Arrêter / Remettre à zéro ;
//   · état : source des signaux (ÉMULÉE / SIMULÉE), signaux comptés, lecture de la salle émulée, latence des accusés ;
//   · nuage de la foule : un point par téléphone, couleur = écran affiché, contour = a répondu ; clic = témoin,
//     double-clic = vitrine ;
//   · actions en masse : faire voter, écrire, couper, recharger, cacher la page, toucher « son » ;
//   · vitrine : 1 à 12 téléphones rendus par la VRAIE application (iframes /t/?emule=1&id=…, 390 × 844 réduits) ;
//   · téléphone témoin épinglé : son écran, ses gestes à la main.
// Tout ce qui est émulé porte la marque « ÉMULÉ ». En SPECTACLE, l'émulateur est refusé.
import { useEffect, useRef, useState, type PointerEvent as EvenementPointeur } from 'react';
import { NOMS_MELANGES } from '@studio-real/emulateur';
import { useMagasin } from '../etat/magasin';
import {
  VITESSES_EMULATEUR, VITRINE_MAX, arreterEmulateur, changerVitesseEmulateur, demarrerEmulateur, emulateurCourant, epingler,
  mettreEnVitrine, rafraichirEmulateur, reglerAutoEmulateur, remettreAZero, retirerDeVitrine, sourceSignaux, telephoneEmule,
  useEmulateur, type PointFoule,
} from '../etat/emulateur';
import './emulateur.css';

const LIBELLES_MELANGES: Record<string, string> = { soiree: 'soirée', rapides: 'rapides', iphones: 'iPhones', difficile: 'difficile' };
/** Écrans connus du nuage (les autres : « autre »). */
const ECRANS_NUAGE = ['vote', 'video', 'phrases', 'choix', 'texte', 'notification', 'regardez', 'noir', 'merci', 'entree', 'attente', 'hors-ligne', 'absent'] as const;
const classeEcran = (e: string) => 'emu-e-' + ((ECRANS_NUAGE as readonly string[]).includes(e) ? e : 'autre');
const pourcent = (x: number) => Math.round(x) + ' %';
const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

/** Touche E (ouvrir / fermer) et Échap (fermer), sans gêner la saisie ni les raccourcis des autres. */
function useToucheEmulateur() {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return;
      const s = useEmulateur.getState();
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); s.basculer(); }
      else if (e.key === 'Escape' && s.ouvert) s.poser({ ouvert: false });
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, []);
}

/** Bouton de l'en-tête : ouvre le panneau ; la pastille dit que l'émulateur tourne. */
export function BoutonEmulateur() {
  const ouvert = useEmulateur(s => s.ouvert);
  const actif = useEmulateur(s => s.actif);
  return (
    <button className={'btn-carre emu-bouton' + (ouvert ? ' on' : '') + (actif ? ' actif' : '')} onClick={() => useEmulateur.getState().basculer()}
      title={'Émulateur de téléphones · touche E' + (actif ? ' · en marche' : '')} aria-pressed={ouvert}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="4.5" y="1.5" width="7" height="13" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M7 12.4h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function LigneCommande() {
  const r = useEmulateur(s => s.reglages);
  const actif = useEmulateur(s => s.actif);
  const mode = useMagasin(s => s.mode);
  const poser = (p: Partial<typeof r>) => useEmulateur.getState().poser({ reglages: { ...r, ...p } });
  const spectacle = mode === 'spectacle';
  return (
    <div className="emu-commande">
      <label>POPULATION
        <input type="number" min={1} max={500} value={r.population} disabled={actif}
          onChange={e => poser({ population: Math.max(1, Math.min(500, Math.round(Number(e.target.value) || 1))) })} />
      </label>
      <label>MÉLANGE
        <select value={r.melange} disabled={actif} onChange={e => poser({ melange: e.target.value })}>
          {NOMS_MELANGES.map(m => <option key={m} value={m}>{LIBELLES_MELANGES[m] ?? m}</option>)}
        </select>
      </label>
      <label>GRAINE
        <input type="number" value={r.graine} disabled={actif} onChange={e => poser({ graine: Math.round(Number(e.target.value) || 0) })} />
      </label>
      <label>ARRIVÉES
        <select value={r.arrivees} disabled={actif} onChange={e => poser({ arrivees: e.target.value === 'toutes' ? 'toutes' : 'salle' })}>
          <option value="salle">courbe de la salle</option>
          <option value="toutes">tous présents</option>
        </select>
      </label>
      <div className="emu-seg" role="group" aria-label="Vitesse des spectateurs émulés">
        {VITESSES_EMULATEUR.map(v => (
          <button key={v} className={r.vitesse === v ? 'on' : ''} onClick={() => changerVitesseEmulateur(v)}>×{v}</button>
        ))}
      </div>
      <label className="emu-case"><input type="checkbox" checked={r.auto} onChange={e => reglerAutoEmulateur(e.target.checked)} />RÉPONSES AUTO</label>
      <div className="emu-boutons">
        {!actif
          ? <button className="emu-btn fort" disabled={spectacle} title={spectacle ? 'Refusé en SPECTACLE' : 'Démarrer la salle émulée'} onClick={() => demarrerEmulateur()}>DÉMARRER</button>
          : <button className="emu-btn" onClick={arreterEmulateur}>ARRÊTER</button>}
        <button className="emu-btn" disabled={!actif} onClick={() => remettreAZero()}>REMETTRE À ZÉRO</button>
      </div>
    </div>
  );
}

function Etat() {
  const actif = useEmulateur(s => s.actif);
  const b = useEmulateur(s => s.bilan);
  const sig = useEmulateur(s => s.signaux);
  const fil = useEmulateur(s => s.fil);
  const projet = useMagasin(s => s.projet);
  const tEtape = useMagasin(s => s.lecture?.tEtape ?? 0);
  const source = sourceSignaux(projet.sens, tEtape).source;
  return (
    <div className="emu-etat">
      <span className={'emu-source ' + source}>SIGNAUX · {source === 'emulee' ? 'ÉMULÉS (COMPTÉS)' : 'SALLE SIMULÉE'}</span>
      {actif && b && sig ? (
        <>
          <span className="emu-chiffres">
            <b>{sig.pres}</b> présents · quorum <b>{pourcent(sig.quorum)}</b> · prêts <b>{pourcent(sig.prets)}</b>
            {sig.issue ? <> · issue <b>{sig.issue}</b></> : null}
            {' '}· arrivés {b.arrives}/{b.population} · hors ligne {b.horsLigne}
          </span>
          <span className="emu-chiffres">
            salle émulée · {b.lecture ? `${b.lecture.moment ?? '—'} › ${b.lecture.etape ?? 'passage'}${b.lecture.attenteGo ? ' · attend le GO' : ''}` : 'pas lancée'}
            {' '}· accusés p50 <b>{b.latenceAck.p50} ms</b> p95 <b>{b.latenceAck.p95} ms</b> · {mmss(b.t)}
          </span>
          {b.question && <span className="emu-chiffres">question {b.question} · {Object.entries(b.votes).sort(([x], [y]) => (x < y ? -1 : 1)).map(([k, n]) => `${k} ${n}`).join(' · ') || 'aucun vote'} · textes {b.textes}</span>}
          {fil.length > 0 && <span className="emu-fil">{fil[fil.length - 1]}</span>}
        </>
      ) : <span className="emu-chiffres">Émulateur arrêté. Démarrer : la salle émulée suit le projet et les GO du Conducteur.</span>}
    </div>
  );
}

function Nuage() {
  const points = useEmulateur(s => s.points);
  const temoin = useEmulateur(s => s.temoin);
  if (!points.length) return null;
  const col = Math.max(10, Math.ceil(Math.sqrt(points.length * 2.4)));
  const pas = 14;
  const lignes = Math.ceil(points.length / col);
  const presents = new Set(points.map(p => p.ecran));
  return (
    <div className="emu-nuage">
      <svg viewBox={`0 0 ${col * pas} ${lignes * pas}`} width="100%" role="img" aria-label="Nuage de la foule émulée">
        {points.map((p: PointFoule, i) => (
          <circle key={p.id} cx={(i % col) * pas + pas / 2} cy={Math.floor(i / col) * pas + pas / 2} r={4.4}
            className={classeEcran(p.ecran) + (p.repondu ? ' repondu' : '') + (p.visible ? '' : ' cache') + (p.vitrine ? ' vitrine' : '') + (temoin === p.id ? ' temoin' : '')}
            onClick={() => epingler(p.id)} onDoubleClick={() => mettreEnVitrine(p.id)}>
            <title>{`${p.id} · ${p.profil} · ${p.ecran}${p.repondu ? ' · a répondu' : ''}${p.visible ? '' : ' · page cachée'}`}</title>
          </circle>
        ))}
      </svg>
      <div className="emu-legende">
        {ECRANS_NUAGE.filter(e => presents.has(e)).map(e => <span key={e}><i className={classeEcran(e)} />{e}</span>)}
        <span><i className="repondu" />a répondu</span>
      </div>
    </div>
  );
}

function ActionsEnMasse() {
  const actif = useEmulateur(s => s.actif);
  const [rep, setRep] = useState({ A: 60, B: 30, C: 10, D: 0, s: 20 });
  const [ecrire, setEcrire] = useState(30);
  const [coupe, setCoupe] = useState({ part: 10, s: 30 });
  const [recharge, setRecharge] = useState(5);
  const [cache, setCache] = useState({ part: 20, s: 30 });
  const emu = emulateurCourant();
  const fait = (texte: string) => { useMagasin.getState().signaler('ÉMULÉ · ' + texte); rafraichirEmulateur(); };
  const nombre = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
  if (!actif || !emu) return null;
  return (
    <div className="emu-actions">
      <div className="emu-action">
        <span>VOTER</span>
        {(['A', 'B', 'C', 'D'] as const).map(k => (
          <label key={k}>{k}<input type="number" min={0} max={100} value={rep[k]} onChange={e => setRep({ ...rep, [k]: nombre(e.target.value, 0, 100) })} /></label>
        ))}
        <label>EN<input type="number" min={0} max={300} value={rep.s} onChange={e => setRep({ ...rep, s: nombre(e.target.value, 0, 300) })} />S</label>
        <button className="emu-btn" onClick={() => fait(`${emu.faireVoter({ repartition: { A: rep.A, B: rep.B, C: rep.C, D: rep.D }, dansS: rep.s })} téléphones votent en ${rep.s} s`)}>FAIRE VOTER</button>
      </div>
      <div className="emu-action">
        <span>ÉCRIRE</span>
        <label><input type="number" min={0} max={100} value={ecrire} onChange={e => setEcrire(nombre(e.target.value, 0, 100))} />%</label>
        <button className="emu-btn" onClick={() => fait(`${emu.faireEcrire({ textes: 'banque', parMinute: 0, dureeS: 30, part: ecrire / 100 })} phrases de la banque en 30 s`)}>ÉCRIRE</button>
        <span>TOUCHER</span>
        <button className="emu-btn" onClick={() => fait(`${emu.faireToucher({ selecteur: 'son', dansS: 5 })} téléphones touchent « son »`)}>« SON »</button>
        <button className="emu-btn" onClick={() => fait(`${emu.faireToucher({ selecteur: 'bouton', dansS: 5 })} téléphones touchent le bouton`)}>BOUTON</button>
      </div>
      <div className="emu-action">
        <span>COUPER</span>
        <label><input type="number" min={0} max={100} value={coupe.part} onChange={e => setCoupe({ ...coupe, part: nombre(e.target.value, 0, 100) })} />%</label>
        <label><input type="number" min={1} max={600} value={coupe.s} onChange={e => setCoupe({ ...coupe, s: nombre(e.target.value, 1, 600) })} />S</label>
        <button className="emu-btn" onClick={() => fait(`${emu.coupure({ part: coupe.part / 100, dureeS: coupe.s }).length} téléphones coupés ${coupe.s} s`)}>COUPER</button>
        <span>CACHER</span>
        <label><input type="number" min={0} max={100} value={cache.part} onChange={e => setCache({ ...cache, part: nombre(e.target.value, 0, 100) })} />%</label>
        <label><input type="number" min={1} max={600} value={cache.s} onChange={e => setCache({ ...cache, s: nombre(e.target.value, 1, 600) })} />S</label>
        <button className="emu-btn" onClick={() => fait(`${emu.masquer({ part: cache.part / 100, dureeS: cache.s }).length} pages cachées ${cache.s} s`)}>CACHER</button>
      </div>
      <div className="emu-action">
        <span>RECHARGER</span>
        <label><input type="number" min={1} max={500} value={recharge} onChange={e => setRecharge(nombre(e.target.value, 1, 500))} /></label>
        <button className="emu-btn" onClick={() => {
          const ids = emu.telephones().filter(t => t.etat().enLigne).slice(0, recharge).map(t => t.id);
          emu.recharger(ids);
          fait(`${ids.length} téléphones rechargés`);
        }}>RECHARGER</button>
      </div>
    </div>
  );
}

/** Une case de la vitrine : la vraie application dans une iframe (mise en place à l'affichage, rendue à la foule au
 *  retrait de la case). */
function CaseVitrine({ id }: { id: string }) {
  const hote = useRef<HTMLDivElement>(null);
  const temoin = useEmulateur(s => s.temoin);
  useEffect(() => {
    const t = telephoneEmule(id);
    const div = hote.current;
    if (!t || !div) return;
    try { t.promouvoir(div); } catch (err) { useMagasin.getState().signaler((err as Error).message); }
    return () => { t.fermerVitrine(); };
  }, [id]);
  const t = telephoneEmule(id);
  return (
    <div className={'emu-case-vitrine' + (temoin === id ? ' temoin' : '')}>
      <div className="emu-case-tete">
        <span className="emu-marque">ÉMULÉ</span>
        <span className="emu-id">{id} · {t?.profil.nom ?? ''}</span>
        <button title="Épingler comme témoin" onClick={() => epingler(id)}>◎</button>
        <button title="Rendre à la foule" onClick={() => retirerDeVitrine(id)}>×</button>
      </div>
      <div className="emu-iframe-hote" ref={hote} />
    </div>
  );
}

function Vitrine() {
  const actif = useEmulateur(s => s.actif);
  const vitrine = useEmulateur(s => s.vitrine);
  if (!actif) return null;
  return (
    <div className="emu-vitrine">
      <div className="emu-titre-section">
        <span>VITRINE · {vitrine.length}/{VITRINE_MAX} · la vraie application téléphone</span>
        <button className="emu-btn" disabled={vitrine.length >= VITRINE_MAX} onClick={() => mettreEnVitrine()}>+ AJOUTER</button>
      </div>
      {vitrine.length === 0
        ? <span className="emu-aide">Double-clic sur un point du nuage, ou + AJOUTER : le téléphone s’ouvre ici, on peut toucher dedans.</span>
        : <div className="emu-grille-vitrine">{vitrine.map(id => <CaseVitrine key={id} id={id} />)}</div>}
    </div>
  );
}

function Temoin() {
  const id = useEmulateur(s => s.temoin);
  useEmulateur(s => s.points);   // relu à chaque rafraîchissement
  const [texte, setTexte] = useState('');
  const t = id ? telephoneEmule(id) : undefined;
  if (!id || !t) return null;
  const e = t.etat();
  return (
    <div className="emu-temoin">
      <div className="emu-titre-section">
        <span>TÉMOIN · {e.id} · {e.pseudo} · {e.profil}</span>
        <button className="emu-btn" onClick={() => epingler(null)}>DÉSÉPINGLER</button>
      </div>
      <span className="emu-chiffres">
        {e.enLigne ? 'en ligne' : 'hors ligne'}{e.visible ? '' : ' · page cachée'} · écran <b>{e.ecran?.type ?? '—'}</b> (vue {e.ecran?.n ?? 0})
        {e.dernierVote ? ` · a voté ${String.fromCharCode(65 + e.dernierVote.option)} (q ${e.dernierVote.question})` : ''}
        {' '}· file {e.fileEnvoi}{e.rttMs !== undefined ? ` · rtt ${e.rttMs} ms` : ''}{e.vibrations ? ` · bzz ×${e.vibrations}` : ''}
      </span>
      <div className="emu-action">
        {['A', 'B', 'C', 'D'].map(k => <button key={k} className="emu-btn" onClick={() => { t.voter(k); rafraichirEmulateur(); }}>{k}</button>)}
        <input className="emu-texte" value={texte} placeholder="texte du spectateur" maxLength={200} onChange={ev => setTexte(ev.target.value)}
          onKeyDown={ev => { if (ev.key === 'Enter' && texte.trim()) { t.ecrire(texte); setTexte(''); } }} />
        <button className="emu-btn" disabled={!texte.trim()} onClick={() => { t.ecrire(texte); setTexte(''); }}>ENVOYER</button>
        <button className="emu-btn" onClick={() => t.couper(20)}>COUPER 20 S</button>
        <button className="emu-btn" onClick={() => t.recharger()}>RECHARGER</button>
        {!e.vitrine && <button className="emu-btn" onClick={() => mettreEnVitrine(id)}>EN VITRINE</button>}
      </div>
    </div>
  );
}

/** Déplacement de la fenêtre détachée par sa barre de titre. */
function useDeplacer() {
  const [pos, setPos] = useState({ x: 80, y: 90 });
  const geste = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  return {
    pos,
    poignee: {
      onPointerDown: (e: EvenementPointeur<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('button')) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        geste.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
      },
      onPointerMove: (e: EvenementPointeur<HTMLDivElement>) => {
        const g = geste.current;
        if (!g) return;
        setPos({ x: Math.max(0, Math.min(window.innerWidth - 120, g.px + e.clientX - g.x)), y: Math.max(0, Math.min(window.innerHeight - 40, g.py + e.clientY - g.y)) });
      },
      onPointerUp: () => { geste.current = null; },
      onPointerCancel: () => { geste.current = null; },
    },
  };
}

/** La fenêtre de l'émulateur (posée par la coquille ; rien n'est rendu tant qu'elle est fermée). */
export function FenetreEmulateur() {
  useToucheEmulateur();
  const ouvert = useEmulateur(s => s.ouvert);
  const detache = useEmulateur(s => s.detache);
  const actif = useEmulateur(s => s.actif);
  const { pos, poignee } = useDeplacer();
  if (!ouvert) return null;
  const poser = useEmulateur.getState().poser;
  return (
    <section className={'emu-fenetre' + (detache ? ' detachee' : ' ancree') + (actif ? ' actif' : '')}
      style={detache ? { left: pos.x, top: pos.y } : undefined} role="dialog" aria-label="Émulateur de téléphones">
      <div className="emu-tete" {...(detache ? poignee : {})}>
        <span className="disp">ÉMULATEUR DE TÉLÉPHONES</span>
        {actif && <span className="emu-marque">ÉMULÉ</span>}
        <span className="emu-vide" />
        <button className="emu-btn" onClick={() => poser({ detache: !detache })} title={detache ? 'Ancrer à droite' : 'Détacher (fenêtre flottante)'}>
          {detache ? 'ANCRER' : 'DÉTACHER'}
        </button>
        <button className="pn-fermer" onClick={() => poser({ ouvert: false })}>E OU ÉCHAP</button>
      </div>
      <div className="emu-corps">
        <LigneCommande />
        <Etat />
        <Nuage />
        <ActionsEnMasse />
        <Temoin />
        <Vitrine />
      </div>
    </section>
  );
}
