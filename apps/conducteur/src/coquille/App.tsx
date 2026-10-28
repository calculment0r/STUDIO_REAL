// La coquille du conducteur : en-tête, planche (haut) et panneau de droite, conduite (bas, pleine largeur),
// tiroir des assets, superpositions. Assemble <Planche/> (chantier PLANCHE) et <Conduite/> (chantier CONDUITE).
// Au démarrage : `?projet=live` ouvre le spectacle LIVE, `?projet=echo` le spectacle ÉCHO ; sinon la dernière salle collaborative est rouverte si son jeton
// est connu (sans serveur : statut « hors ligne », tout reste local, aucun message bloquant).
import { BoutonTap } from './BoutonTap';
import { useEffect, useRef, type DragEvent } from 'react';
import { reprendreDerniereSalle } from '../collab';
import { chargerEcho, chargerLive, projetDemandeParAdresse } from './projet-live';
import { useMagasin, demarrerBoucle } from '../etat/magasin';
import { ETAPE_DE_ASSET, PISTE_DE_ASSET, TYPES_PISTE } from '../etat/assets';
import { nouvelId } from '../etat/ids';
import { Planche } from '../planche/Planche';
import { Conduite } from '../conduite/Conduite';
import { useInterface } from './interface';
import { EnTete } from './EnTete';
import { Recherche } from './Recherche';
import { Panneau } from './Panneau';
import { TiroirAssets, TYPE_ASSET, type AssetGlisse } from './TiroirAssets';
import { AlerteSecurite, Aide, CadreEnLecture, Projets, Pupitre } from './Superpositions';
import { FenetreActeurs } from './FenetreActeurs';
import { useRaccourcis } from './raccourcis';
import { useRelaisSortie } from '../sortie';
import { demarrerSpectacle } from '../etat/spectacle';
import { RailSorties } from './RailSorties';
import './coquille.css';

/** Moment visé par un dépôt : la sélection, sinon le moment en cours, sinon le premier. */
const momentVise = (): string | undefined => {
  const s = useMagasin.getState();
  return s.selection.moment ?? s.lecture?.moment ?? s.projet.ev[0]?.id;
};

function lireAsset(e: DragEvent): AssetGlisse | null {
  try { return JSON.parse(e.dataTransfer.getData(TYPE_ASSET)) as AssetGlisse; } catch { return null; }
}

/** Asset lâché sur la planche (si la planche ne l'a pas pris) : une étape dans le moment visé, en fin de rangée. */
function deposerSurPlanche(a: AssetGlisse) {
  const s = useMagasin.getState(), ev = momentVise();
  if (!ev) return;
  let id = '';
  s.modifierProjet(p => {
    const m = p.ev.find(x => x.id === ev);
    if (!m) return;
    id = nouvelId(p, 'n');
    const c = m.st.length ? Math.max(...m.st.map(x => x.c)) + 1 : 0;
    m.st.push({ id, name: a.nom, ty: ETAPE_DE_ASSET[a.cat] ?? 'k:scene', c, r: 0, dx: 0, dy: 0, k: [Math.max(0, Math.min(100, Math.round((a.dur - 10) / 6))), 50, 50], asset: a.nom });
    p.ver++;
  }, 'asset');
  if (id) { s.selectionner({ moment: ev, etape: id }); s.signaler('« ' + a.nom + ' » ajouté. Relie-le pour qu’il soit joué.'); }
}

/** Asset lâché sur la conduite (si elle ne l'a pas pris) : un clip sur la piste de son type, au début du moment visé. */
function deposerSurConduite(a: AssetGlisse) {
  const s = useMagasin.getState(), ev = momentVise(), type = PISTE_DE_ASSET[a.cat];
  if (!ev) return;
  if (!type) { s.signaler('Les rôles se posent sur la planche, pas dans la conduite.'); return; }
  let ids: [string, string] = ['', ''];
  s.modifierProjet(p => {
    let tk = p.tracks.find(x => x.type === type);
    if (!tk) { tk = { id: nouvelId(p, 't'), type, name: TYPES_PISTE[type][0], open: true, clips: [] }; p.tracks.push(tk); }
    const id = nouvelId(p, 'c');
    (tk.clips ??= []).push({ id, name: a.nom, ev, off: 0, dur: a.dur || 30 });
    tk.open = true;
    ids = [tk.id, id];
    p.ver++;
  }, 'asset');
  if (ids[1]) { s.selectionner({ piste: ids[0], clip: ids[1] }); s.signaler('Clip « ' + a.nom + ' » posé.'); }
}

const accepte = (e: DragEvent) => { if (e.dataTransfer.types.includes(TYPE_ASSET)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } };
const depot = (f: (a: AssetGlisse) => void) => (e: DragEvent) => {
  if (e.defaultPrevented) return;             // la planche ou la conduite l'a déjà pris
  const a = lireAsset(e);
  if (!a) return;
  e.preventDefault();
  f(a);
};

/** Poignée qu'on tire pour redimensionner (panneau de droite, hauteur de la conduite). */
function useGlisser(sens: 'x' | 'y') {
  const geste = useRef<{ p: number; v: number } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const ui = useInterface.getState();
      geste.current = { p: sens === 'x' ? e.clientX : e.clientY, v: sens === 'x' ? ui.largeurPanneau : ui.hauteurConduite };
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const g = geste.current;
      if (!g) return;
      if (sens === 'x') useInterface.getState().poser({ largeurPanneau: Math.max(240, Math.min(560, g.v - (e.clientX - g.p))) });
      else useInterface.getState().poser({ hauteurConduite: Math.max(200, Math.min(window.innerHeight - 220, g.v - (e.clientY - g.p))) });
    },
    onPointerUp: () => { geste.current = null; },
    onPointerCancel: () => { geste.current = null; },
  };
}

export function App() {
  const vue = useInterface(s => s.vue);
  const hauteur = useInterface(s => s.hauteurConduite);
  const message = useMagasin(s => s.message);
  const glisserX = useGlisser('x'), glisserY = useGlisser('y');

  useRaccourcis();
  useEffect(() => demarrerBoucle(), []);
  useRelaisSortie();   // traduit la lecture en scènes pour la sortie Écran scène (une seule fois pour toute l'app)
  useEffect(() => demarrerSpectacle(), []);   // client régie du serveur de spectacle (relié si l'onglet a ses réglages)
  const demarre = useRef(false);
  useEffect(() => {
    if (demarre.current) return;   // StrictMode monte deux fois en développement
    demarre.current = true;
    const demande = projetDemandeParAdresse();
    if (demande === 'live') void chargerLive();
    else if (demande === 'echo') void chargerEcho();
    else reprendreDerniereSalle();
  }, []);

  return (
    <div className="coquille">
      <CadreEnLecture />
      <EnTete />
      <RailSorties />
      <div className="corps">
        {vue !== 'tracks' && (
          <div className="haut">
            <div className="zone-planche" onDragOver={accepte} onDrop={depot(deposerSurPlanche)}>
              <Planche />
              {message && <span className="toast" role="status">{message}</span>}
            </div>
            <div className="vsplit" title="Glisser pour élargir le panneau" {...glisserX}><span /></div>
            <Panneau />
          </div>
        )}
        {vue === 'both' && <div className="hsplit" title="Glisser pour agrandir la conduite" {...glisserY}><span /></div>}
        {vue !== 'board' && (
          <div className={'zone-conduite' + (vue === 'tracks' ? ' seule' : '')} style={vue === 'tracks' ? undefined : { height: hauteur }}
            onDragOver={accepte} onDrop={depot(deposerSurConduite)}>
            <Conduite />
            {vue === 'tracks' && message && <span className="toast" role="status">{message}</span>}
          </div>
        )}
      </div>
      <BoutonTap />
      <TiroirAssets />
      <Recherche />
      <AlerteSecurite />
      <Pupitre />
      <Projets />
      <FenetreActeurs />
      <Aide />
    </div>
  );
}

export default App;
