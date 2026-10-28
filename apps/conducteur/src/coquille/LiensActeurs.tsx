// Fenêtre Projet, onglets SPECTACLE et LIENS (audit 2026-10, rapport 2 §4.2 d ; rapport 5 §4.2 et §4.4).
// - SPECTACLE : réglages du client régie (etat/spectacle.ts) : adresse du serveur de spectacle, adresse publique (celle
//   des téléphones en 4G), jeton de la régie et jeton des acteurs. Les jetons ne sont JAMAIS lus dans l'adresse de la
//   page ni écrits ailleurs que dans le sessionStorage de cet onglet : `/config.json` ne les publie pas, la régie les
//   saisit une fois (ils sont dans exploitation/spectacle.secrets.json, sur la machine du serveur).
// - LIENS : pour chaque acteur nommé, l'adresse de l'application téléphone `<adresse publique>/t/#acteur=<id>&jeton=<jeton>`
//   (jeton dans le FRAGMENT), son QR et son état de connexion ; le QR du public (sans jeton nommé) est celui que la
//   sortie projette (sortie/protocole.ts le lit dans le même réglage). Généralise streamer/page-accueil.ts.
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import QRCode from 'qrcode';
import {
  delierSpectacle, jetonActeurSpectacle, lienActeur, lienPublic, reglerSpectacle, relierSpectacle, useSpectacle,
} from '../etat/spectacle';
import { magasinActeurs, libelleEcran } from '../etat/acteurs';
import { ouvrirSortieScene } from '../sortie';
import { useOngletProjet, useVignettes, type OngletProjet } from './rail-etat';
import './rail.css';


const arreter = (e: KeyboardEvent) => e.stopPropagation();

/** Onglets de la fenêtre Projet. */
export function OngletsProjet() {
  const onglet = useOngletProjet(s => s.onglet);
  const poser = useOngletProjet(s => s.poser);
  const ONGLETS: [OngletProjet, string][] = [['projet', 'PROJET'], ['spectacle', 'SPECTACLE'], ['liens', 'LIENS']];
  return (
    <div className="pj-onglets" role="tablist" aria-label="Projet">
      {ONGLETS.map(([k, t]) => (
        <button key={k} role="tab" aria-selected={onglet === k} className={onglet === k ? 'on' : ''} onClick={() => poser({ onglet: k })}>{t}</button>
      ))}
    </div>
  );
}

/** Tracé SVG d'un QR (modules sombres en une seule <path>, couleurs posées par la feuille de style). */
function traceQr(texte: string): { taille: number; d: string } | null {
  try {
    const qr = QRCode.create(texte, { errorCorrectionLevel: 'M' });
    const { size, data } = qr.modules;
    let d = '';
    for (let y = 0; y < size; y++) {
      let x = 0;
      while (x < size) {
        if (!data[y * size + x]) { x++; continue; }
        let l = 1;
        while (x + l < size && data[y * size + x + l]) l++;
        d += `M${x} ${y}h${l}v1h-${l}z`;
        x += l;
      }
    }
    return { taille: size, d };
  } catch { return null; }
}

export function Qr({ texte, etiquette }: { texte: string | null; etiquette: string }) {
  const qr = useMemo(() => (texte ? traceQr(texte) : null), [texte]);
  if (!qr) return <div className="li-qr vide" aria-label={etiquette}>LIEN À RÉGLER</div>;
  const m = 2;
  return (
    <div className="li-qr" role="img" aria-label={etiquette}>
      <svg viewBox={`${-m} ${-m} ${qr.taille + 2 * m} ${qr.taille + 2 * m}`} shapeRendering="crispEdges">
        <rect className="fond" x={-m} y={-m} width={qr.taille + 2 * m} height={qr.taille + 2 * m} />
        <path className="modules" d={qr.d} />
      </svg>
    </div>
  );
}

// ── onglet SPECTACLE : réglages du client régie ────────────────────────────────────────────────────────────────────

export function ReglagesSpectacle() {
  const reglages = useSpectacle(s => s.reglages);
  const voyant = useSpectacle(s => s.voyant);
  const ligne = useSpectacle(s => s.ligne);
  const config = useSpectacle(s => s.config);
  const refus = useSpectacle(s => s.refus);
  const [adresse, setAdresse] = useState(reglages.adresse);
  const [publique, setPublique] = useState(reglages.adressePublique);
  const [jetonRegie, setJetonRegie] = useState('');
  const [jetonActeur, setJetonActeur] = useState('');
  useEffect(() => { setPublique(reglages.adressePublique); }, [reglages.adressePublique]);

  const enregistrer = () => {
    reglerSpectacle({
      adresse, adressePublique: publique,
      ...(jetonRegie.trim() ? { jetonRegie } : {}), ...(jetonActeur.trim() ? { jetonActeur } : {}),
    });
    setJetonRegie(''); setJetonActeur('');
  };
  const relier = () => { enregistrer(); relierSpectacle(); };
  const pret = !!adresse.trim() && (reglages.jetonRegie || !!jetonRegie.trim());
  return (
    <div className="sr-co-bloc">
      <div className="sp-etat">
        <span className={'rs-p ' + voyant.pastille} />
        <span>{voyant.detail}</span>
      </div>
      {config && (
        <span className="sp-note">
          Spectacle « {config.spectacle ?? '?'} »{config.representation ? ` · soirée ${config.representation}` : ''}{config.run ? ` · représentation ${config.run}` : ''}{config.version ? ` · serveur ${config.version}` : ''}
        </span>
      )}
      {refus && <span className="sp-note alerte">Refus du serveur ({refus.code}) : {refus.message}</span>}
      <div className="sp-form">
        <label htmlFor="sp-adresse">Serveur de spectacle</label>
        <input id="sp-adresse" className="sp-champ" value={adresse} placeholder="https://spectacle.exemple.fr" spellCheck={false}
          onChange={e => setAdresse(e.target.value)} onKeyDown={arreter} />
        <label htmlFor="sp-publique">Adresse publique</label>
        <input id="sp-publique" className="sp-champ" value={publique} placeholder="lue dans /config.json du serveur" spellCheck={false}
          onChange={e => setPublique(e.target.value)} onKeyDown={arreter} />
        <label htmlFor="sp-jeton-regie">Jeton de la régie</label>
        <input id="sp-jeton-regie" className="sp-champ" type="password" autoComplete="off" value={jetonRegie}
          placeholder={reglages.jetonRegie ? 'connu dans cet onglet · saisir pour remplacer' : 'exploitation/spectacle.secrets.json'}
          onChange={e => setJetonRegie(e.target.value)} onKeyDown={arreter} />
        <label htmlFor="sp-jeton-acteur">Jeton des acteurs</label>
        <input id="sp-jeton-acteur" className="sp-champ" type="password" autoComplete="off" value={jetonActeur}
          placeholder={reglages.jetonActeur ? 'connu dans cet onglet · saisir pour remplacer' : 'pour les liens des téléphones nommés'}
          onChange={e => setJetonActeur(e.target.value)} onKeyDown={arreter} />
      </div>
      <div className="sp-actions">
        <button className="sp-bouton plein" disabled={!pret} onClick={relier}>{ligne === 'eteinte' ? 'RELIER' : 'RELIER DE NOUVEAU'}</button>
        <button className="sp-bouton" onClick={enregistrer}>ENREGISTRER</button>
        <button className="sp-bouton" disabled={ligne === 'eteinte'} onClick={delierSpectacle}>DÉLIER</button>
      </div>
      <span className="sp-note">
        Les jetons restent dans cet onglet (sessionStorage) : ni dans l’adresse, ni dans le projet, ni dans un journal.
        En SPECTACLE relié, chaque GO part au serveur, qui fait tourner le lecteur ; la conduite suit sa lecture.
      </span>
    </div>
  );
}

// ── onglet LIENS : un lien et un QR par acteur ─────────────────────────────────────────────────────────────────────

export function LiensActeurs() {
  const vignettes = useVignettes();
  const reglages = useSpectacle(s => s.reglages);
  const vise = useOngletProjet(s => s.vise);
  const jeton = reglages.jetonActeur ? jetonActeurSpectacle() : null;
  const publique = reglages.adressePublique;
  const lienDuPublic = lienPublic(publique);
  const [copie, setCopie] = useState<string | null>(null);
  const copier = (id: string, l: string) => {
    try { void navigator.clipboard.writeText(l).then(() => setCopie(id), () => setCopie(null)); } catch { setCopie(null); }
  };
  useEffect(() => {
    if (!vise) return;
    document.getElementById('lien-' + vise)?.scrollIntoView({ block: 'nearest' });
  }, [vise]);
  const etats = magasinActeurs.getState().etats;
  return (
    <div className="sr-co-bloc">
      {!publique && <span className="sp-note alerte">Adresse publique inconnue : la régler dans l’onglet SPECTACLE (ou relier le serveur, qui la donne).</span>}
      {publique && !jeton && <span className="sp-note">Jeton des acteurs non saisi dans cet onglet : seuls le public et l’écran scène ont un lien.</span>}
      <div className="li-liste">
        {vignettes.filter(v => v.type !== 'agent').map(v => {
          const foule = v.cardinalite === 'n';
          const lien = v.type === 'ecran' ? null : foule ? lienDuPublic : jeton ? lienActeur(publique, v.id, jeton) : null;
          const e = etats[v.id];
          const etat = foule
            ? `${v.agregats?.connectes ?? 0} connectés · ${v.agregats?.majoritaire?.libelle ?? 'aucun écran'}`
            : v.diag.liaison === 'reliee'
              ? `connecté · affiche ${libelleEcran(v.diag.affiche)}${e?.app ? ` · ${e.app.version}` : ''}${e?.batterie !== undefined ? ` · ${Math.round(e.batterie)} %` : ''}`
              : v.diag.liaison === 'perdue' ? 'hors ligne' : v.diag.liaison === 'attente' ? 'en attente' : 'état inconnu (serveur non relié)';
          return (
            <div key={v.id} id={'lien-' + v.id} className={'li-acteur' + (vise === v.id ? ' vise' : '')}>
              {v.type === 'ecran'
                ? <div className="li-qr vide">SORTIE DE CETTE MACHINE</div>
                : <Qr texte={lien} etiquette={'QR de ' + v.nom} />}
              <div className="li-texte">
                <span className="li-nom"><span className={'rs-p ' + v.diag.pastille} />{v.nom}{foule ? ' · QR projeté par la sortie' : ''}</span>
                <span className="li-etat">{etat}</span>
                {v.type === 'ecran' ? (
                  <div className="sp-actions"><button className="sp-bouton" onClick={() => ouvrirSortieScene()}>OUVRIR LA FENÊTRE DE SORTIE</button></div>
                ) : lien ? (
                  <>
                    <span className="li-lien">{lien}</span>
                    <div className="sp-actions">
                      <button className="sp-bouton" onClick={() => copier(v.id, lien)}>COPIER LE LIEN</button>
                      {copie === v.id && <span className="sp-note">copié ✓ {foule ? '' : '· à envoyer au comédien (SMS, AirDrop), pas à diffuser'}</span>}
                    </div>
                  </>
                ) : <span className="sp-note">Lien à régler (adresse publique{foule ? '' : ', jeton des acteurs'}).</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Contenu de la fenêtre Projet pour les onglets SPECTACLE et LIENS. */
export function SpectacleProjet() {
  const onglet = useOngletProjet(s => s.onglet);
  if (onglet === 'spectacle') return <ReglagesSpectacle />;
  if (onglet === 'liens') return <LiensActeurs />;
  return null;
}
