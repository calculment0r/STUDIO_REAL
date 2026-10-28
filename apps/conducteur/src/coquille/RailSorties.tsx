// Le rail des sorties (audit 2026-10, rapport 2 §4.2 a et §4.3 ; rapport 3 §4.2) : un bandeau sous l'en-tête, une
// vignette vivante par acteur du projet (écran scène, public, téléphones nommés, agents) qui dit ce que la sortie
// AFFICHE vraiment (pas ce qui lui a été demandé), sa liaison, sa latence et ses alertes. Repliable en RÉPÉTITION,
// toujours visible en SPECTACLE. Un clic : le détail dans le panneau Régie (section SORTIES). Un clic droit : renvoyer
// la vue, copier le lien de l'acteur, montrer son QR, ouvrir la fenêtre (écran scène).
// Aussi : le voyant du serveur de spectacle (en-tête) et la section SORTIES du panneau Régie.
// Rafraîchi 4 fois par seconde au plus (les magasins changent plus souvent : on les lit à l'horloge du rail).
import { useEffect, type MouseEvent } from 'react';
import { vueActeur } from '@studio-real/modele';
import { useMagasin } from '../etat/magasin';
import { magasinActeurs, libelleBarre, libelleEcran, type Pastille } from '../etat/acteurs';
import { forcerVue, useSpectacle, type VignetteActeur } from '../etat/spectacle';
import { ApercuSortie, ouvrirSortieScene } from '../sortie';
import { useInterface } from './interface';
import { lienDeLActeur, useOngletProjet, useRail, useVignettes } from './rail-etat';
import './rail.css';

const fmtLatence = (ms: number | undefined) => (ms === undefined ? '' : ms >= 1000 ? (ms / 1000).toFixed(1).replace('.', ',') + ' s' : Math.round(ms) + ' ms');
const titrePastille: Record<Pastille, string> = { verte: 'relié', ambre: 'en attente', rouge: 'perdu', eteinte: 'inconnu' };

// ── voyant de l'en-tête ────────────────────────────────────────────────────────────────────────────────────────────

/** Voyant PONT de l'en-tête : liaison au serveur de spectacle, dernier GO accusé. Un clic ouvre Projet › Spectacle. */
export function VoyantSpectacle() {
  const voyant = useSpectacle(s => s.voyant);
  const ouvrir = () => { useOngletProjet.getState().poser({ onglet: 'spectacle' }); useInterface.getState().poser({ projets: true }); };
  return (
    <button type="button" className={'rs-voyant ' + voyant.pastille} onClick={ouvrir} title={voyant.detail} aria-label={'Serveur de spectacle : ' + voyant.detail}>
      <span className={'rs-p ' + voyant.pastille} /><b>PONT</b>{voyant.pastille === 'eteinte' ? '' : voyant.libelle}
    </button>
  );
}

// ── une vignette ───────────────────────────────────────────────────────────────────────────────────────────────────

function VueVignette({ v }: { v: VignetteActeur }) {
  if (v.type === 'ecran' && v.source === 'local') return <div className="rs-vue"><ApercuSortie /></div>;
  if (v.agregats) {
    const a = v.agregats;
    const total = Math.max(1, a.connectes);
    return (
      <div className="rs-vue" style={{ flexDirection: 'column', gap: 6, padding: '0 8px' }}>
        <span className={'rs-ecran' + (a.majoritaire ? '' : ' vide')}>{a.majoritaire ? a.majoritaire.libelle : a.connectes ? 'aucun écran' : 'personne'}</span>
        <span className="rs-barre" title={libelleBarre(a.barre)}>
          {a.barre.map(p => (
            <span key={p.ecran} className={p.ecran === 'hors-ligne' ? 'hors-ligne' : ''} style={{ width: (p.n * 100 / total).toFixed(1) + '%' }} />
          ))}
        </span>
      </div>
    );
  }
  const affiche = v.diag.affiche;
  if (v.type === 'agent') return <div className="rs-vue"><span className={'rs-ecran' + (affiche ? '' : ' vide')}>{affiche ?? 'absent'}</span></div>;
  if (v.type === 'ecran') return <div className="rs-vue"><span className={'rs-ecran' + (affiche ? '' : ' vide')}>{affiche ? libelleEcran(affiche) : '—'}</span></div>;
  return (
    <div className="rs-vue tel">
      <span className="rs-tel"><span className={'rs-ecran' + (affiche ? '' : ' vide')}>{affiche ?? '—'}</span></span>
      <span className="rs-ligne" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
        <span>affiché</span><span className="num">{affiche ? libelleEcran(affiche) : 'rien'}</span>
      </span>
    </div>
  );
}

function Vignette({ v, choisie }: { v: VignetteActeur; choisie: boolean }) {
  const d = v.diag;
  const alerte = d.alertes[0];
  const choisir = () => {
    useRail.setState({ choisi: v.id, menu: null });
    const ui = useInterface.getState();
    if (!ui.acc.g) ui.basculerAcc('g');
  };
  const menu = (e: MouseEvent) => { e.preventDefault(); useRail.setState({ menu: { id: v.id, x: e.clientX, y: e.clientY } }); };
  const a = v.agregats;
  return (
    <button type="button" className={'rs-carte ' + d.pastille + (choisie ? ' choisie' : '')} onClick={choisir} onContextMenu={menu}
      title={`${v.nom} · ${titrePastille[d.pastille]}${d.alertes.length ? ' · ' + d.alertes.join(' · ') : ''}`}>
      <span className="rs-carte-h">
        <span className={'rs-p ' + d.pastille} />
        <span className="rs-nom">{v.nom}</span>
        {a && <span className="rs-n">{a.connectes}</span>}
      </span>
      <VueVignette v={v} />
      {a ? (
        <span className="rs-ligne">
          <span className="num">{a.majoritaire?.n ?? 0}/{a.connectes}</span>
          {a.votes !== null && <span>· <span className="num">{a.votes}</span> votes</span>}
          <span>· <span className="num">{a.prets}</span> prêts</span>
          {d.latenceMs !== undefined && <span>· {fmtLatence(d.latenceMs)}</span>}
        </span>
      ) : (
        <span className="rs-ligne">
          <span>{libelleEcran(d.affiche)}</span>
          {d.latenceMs !== undefined && <span>· ● <span className="num">{fmtLatence(d.latenceMs)}</span></span>}
          {v.source === 'local' && <span>· local</span>}
        </span>
      )}
      {a && a.barre.length > 1 && <span className="rs-ligne">{libelleBarre(a.barre)}</span>}
      {alerte && <span className={'rs-alerte' + (d.pastille === 'rouge' ? ' rouge' : '')}>⚠ {alerte}</span>}
    </button>
  );
}

// ── menu du clic droit ─────────────────────────────────────────────────────────────────────────────────────────────

/** « Renvoyer la vue » : la vue demandée, avec ses réglages recalculés depuis la lecture miroir. */
function renvoyer(v: VignetteActeur) {
  const ecran = v.diag.demande;
  if (!ecran) return;
  const m = useMagasin.getState();
  const vue = m.lecture ? vueActeur(m.projet, m.lecture, v.id) : null;
  forcerVue(v.id, vue && vue.ecran === ecran ? { ecran, params: vue.params } : { ecran });
}

function copier(texte: string) {
  const fini = () => useMagasin.getState().signaler('Lien copié');
  try { void navigator.clipboard.writeText(texte).then(fini, () => useMagasin.getState().signaler(texte)); }
  catch { useMagasin.getState().signaler(texte); }
}

function MenuActeur({ vignettes }: { vignettes: VignetteActeur[] }) {
  const menu = useRail(s => s.menu);
  const relie = useSpectacle(s => s.ligne === 'ouverte');
  useEffect(() => {
    if (!menu) return;
    const fermer = () => useRail.setState({ menu: null });
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer(); };
    window.addEventListener('pointerdown', fermer);
    window.addEventListener('keydown', touche);
    return () => { window.removeEventListener('pointerdown', fermer); window.removeEventListener('keydown', touche); };
  }, [menu]);
  if (!menu) return null;
  const v = vignettes.find(x => x.id === menu.id);
  if (!v) return null;
  const lien = lienDeLActeur(v);
  const faire = (f: () => void) => (e: MouseEvent) => { e.stopPropagation(); f(); useRail.setState({ menu: null }); };
  return (
    <div className="rs-menu" role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 210), top: menu.y }} onPointerDown={e => e.stopPropagation()}>
      <span className="pn-micro">{v.nom}</span>
      <button role="menuitem" disabled={!relie || !v.diag.demande || v.type === 'agent'} onClick={faire(() => renvoyer(v))}
        title={relie ? 'Renvoie la vue demandée (conduite forcer, journalisé)' : 'Serveur de spectacle non relié'}>Renvoyer la vue{v.diag.demande ? ' · ' + libelleEcran(v.diag.demande) : ''}</button>
      <button role="menuitem" disabled={!lien} onClick={faire(() => { if (lien) copier(lien); })}
        title={lien ? lien : 'Adresse publique ou jeton des acteurs à régler (Projet › Spectacle)'}>Copier le lien</button>
      <button role="menuitem" disabled={v.type === 'agent' || v.type === 'ecran'} onClick={faire(() => {
        useOngletProjet.getState().poser({ onglet: 'liens', vise: v.id });
        useInterface.getState().poser({ projets: true });
      })}>Montrer le QR</button>
      {v.type === 'ecran' && <button role="menuitem" onClick={faire(() => ouvrirSortieScene())}>Ouvrir la fenêtre</button>}
      <button role="menuitem" onClick={faire(() => { useRail.setState({ choisi: v.id }); const ui = useInterface.getState(); if (!ui.acc.g) ui.basculerAcc('g'); })}>Détail dans la régie</button>
    </div>
  );
}

// ── le rail ────────────────────────────────────────────────────────────────────────────────────────────────────────

export function RailSorties() {
  const vignettes = useVignettes();
  const mode = useMagasin(s => s.mode);
  const replie = useRail(s => s.replie);
  const choisi = useRail(s => s.choisi);
  const spectacle = mode === 'spectacle';
  const ouvert = spectacle || !replie;
  return (
    <section className="rs" aria-label="Rail des sorties">
      <div className="rs-tete">
        <span className="pn-micro">SORTIES</span>
        <span className="rs-resume">
          {!ouvert && vignettes.map(v => (
            <span key={v.id} className="rs-resume-a" title={v.diag.alertes.join(' · ') || titrePastille[v.diag.pastille]}>
              <span className={'rs-p ' + v.diag.pastille} />{v.nom}{v.agregats ? ' · ' + v.agregats.connectes : ''}
            </span>
          ))}
        </span>
        {!spectacle && (
          <button type="button" className="rs-replier" onClick={() => useRail.setState({ replie: !replie })} aria-expanded={ouvert}>
            {ouvert ? 'REPLIER' : 'DÉPLIER'}
          </button>
        )}
      </div>
      {ouvert && (
        <div className="rs-cartes">
          {vignettes.map(v => <Vignette key={v.id} v={v} choisie={choisi === v.id} />)}
        </div>
      )}
      <MenuActeur vignettes={vignettes} />
    </section>
  );
}

// ── section SORTIES du panneau Régie ───────────────────────────────────────────────────────────────────────────────

function DetailActeur({ v }: { v: VignetteActeur }) {
  const etat = magasinActeurs.getState().etats[v.id];
  const resume = magasinActeurs.getState().resumes[v.id];
  const d = v.diag;
  const lignes: [string, string][] = [
    ['affiché', libelleEcran(d.affiche)],
    ['demandé', d.demande ? libelleEcran(d.demande) : '—'],
  ];
  if (d.ecartMs) lignes.push(['écart', Math.round(d.ecartMs / 1000) + ' s']);
  if (d.latenceMs !== undefined) lignes.push(['latence', fmtLatence(d.latenceMs)]);
  if (v.agregats) {
    lignes.push(['connectés', String(v.agregats.connectes) + (v.agregats.horsLigne ? ` (${v.agregats.horsLigne} hors ligne)` : '')]);
    lignes.push(['écrans', libelleBarre(v.agregats.barre) || '—']);
    if (v.agregats.votes !== null) lignes.push(['votes', `${v.agregats.votes} · Q${v.agregats.question}`]);
    lignes.push(['prêts', String(v.agregats.prets)]);
  } else if (resume && v.type !== 'ecran') lignes.push(['présents', String(resume.presents)]);
  if (etat?.media?.length) lignes.push(['médias', etat.media.map(m => `${m.asset} ${Math.round(m.pret * 100)} % ${m.lecture}`).join(' · ')]);
  if (etat?.batterie !== undefined) lignes.push(['batterie', Math.round(etat.batterie) + ' %']);
  if (etat?.app) lignes.push(['version', `${etat.app.version} · ${etat.app.build}`]);
  lignes.push(['source', v.source === 'local' ? 'sortie de cette machine' : v.source === 'serveur' ? 'serveur de spectacle' : 'aucune']);
  return (
    <div className="rs-so-d">
      {lignes.map(([k, val]) => <span key={k} style={{ display: 'contents' }}><span className="k">{k}</span><span className="v" title={val}>{val}</span></span>)}
      {d.alertes.map(a => <span key={a} style={{ gridColumn: '1 / -1' }} className={'rs-alerte' + (d.pastille === 'rouge' ? ' rouge' : '')}>⚠ {a}</span>)}
    </div>
  );
}

/** Section SORTIES (panneau Régie, pupitre) : une ligne par acteur ; l'acteur choisi dans le rail est déplié. */
export function SectionSorties() {
  const vignettes = useVignettes();
  const choisi = useRail(s => s.choisi);
  const relie = useSpectacle(s => s.ligne === 'ouverte');
  return (
    <div className="rs-sorties">
      <span className="pn-micro">SORTIES · <span className="num">{vignettes.filter(v => v.diag.pastille === 'verte').length}/{vignettes.length}</span> RELIÉES</span>
      {vignettes.map(v => (
        <div key={v.id} className={'rs-so' + (choisi === v.id ? ' choisie' : '')} onClick={() => useRail.setState({ choisi: choisi === v.id ? null : v.id })}
          onContextMenu={e => { e.preventDefault(); useRail.setState({ menu: { id: v.id, x: e.clientX, y: e.clientY } }); }}>
          <div className="rs-so-h">
            <span className={'rs-p ' + v.diag.pastille} />
            <span className="rs-nom">{v.nom}</span>
            <span className="rs-ligne">{v.agregats ? `${v.agregats.connectes} · ${v.agregats.majoritaire?.libelle ?? '—'}` : libelleEcran(v.diag.affiche)}</span>
          </div>
          {choisi === v.id && (
            <>
              <DetailActeur v={v} />
              <div className="rs-so-act" onClick={e => e.stopPropagation()}>
                {v.type !== 'agent' && <button className="rg-b" disabled={!relie || !v.diag.demande} onClick={() => renvoyer(v)}>RENVOYER LA VUE</button>}
                {v.type === 'ecran' && <button className="rg-b" onClick={() => ouvrirSortieScene()}>OUVRIR LA FENÊTRE</button>}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
