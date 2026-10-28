// Fenêtre Projet › Acteurs (audit 2026-10, rapport 1 §4.4) : les acteurs du spectacle, une fois pour toutes. Ajout depuis
// le catalogue (régie, comédien, public, écran, téléphone, agents figurants / ElevenLabs / transcription / OSC), édition
// (identifiant, nom, type, rendu, cardinalité, écrans et signaux cochables, configuration d'agent SANS secret),
// suppression avec garde (acteur encore visé par des envois), « Acteurs d'Écho », conversion des anciennes commandes du
// prototype pour tout le projet. Tout passe par modifierProjet (annulable, synchronisé).
import { useMemo, useState } from 'react';
import {
  GENRES_AGENT, TYPES_ACTEUR, modeleActeur, type Acteur, type GenreAgent, type Projet, type RenduActeur, type TypeActeur,
} from '@studio-real/modele';
import { useMagasin } from '../etat/magasin';
import { pastilleEtat, useActeurs } from '../etat/acteurs';
import { useInterface } from './interface';
import {
  MODELES_ACTEURS, ajouterActeur, cleConfigInterdite, convertirProjet, nbAConvertir, poserActeursEcho, problemesActeurs,
  renommerActeur, supprimerActeur, usagesActeur, validerProjet,
} from './envois';
import { Glyphe } from './InspecteurEnvois';
import './acteurs.css';

const NOM_TYPE: Record<TypeActeur, string> = { regie: 'régie', comedien: 'comédien', public: 'public (foule)', ecran: 'écran', telephone: 'téléphone nommé', agent: 'agent' };
const NOM_RENDU: Record<RenduActeur, string> = { sortie: 'SORTIE', telephone: 'TÉLÉPHONE', externe: 'EXTERNE', conducteur: 'CONDUCTEUR' };

/** Modifie l'acteur `id` dans la copie du projet. */
function modifierActeur(id: string, fn: (a: Acteur, p: Projet) => void, etiquette = 'acteur') {
  useMagasin.getState().modifierProjet(p => { const a = p.acteurs?.find(x => x && x.id === id); if (a) fn(a, p); }, etiquette);
}

export function FenetreActeurs() {
  const ouvert = useInterface(s => s.acteurs);
  const choisi = useInterface(s => s.acteurChoisi);
  const projet = useMagasin(s => s.projet);
  const etats = useActeurs(s => s.etats);
  const [menu, setMenu] = useState(false);
  const problemes = useMemo(() => (ouvert ? problemesActeurs(validerProjet(projet)) : []), [ouvert, projet]);
  if (!ouvert) return null;
  const fermer = () => useInterface.getState().poser({ acteurs: false });
  const choisir = (id: string | null) => useInterface.getState().poser({ acteurChoisi: id });
  const acteurs = (Array.isArray(projet.acteurs) ? projet.acteurs : []).filter(a => a && typeof a.id === 'string');
  const a = acteurs.find(x => x.id === choisi) ?? acteurs[0];
  const aConvertir = nbAConvertir(projet);
  const { signaler, modifierProjet } = useMagasin.getState();

  const ajouter = (cle: string) => {
    let id = '';
    modifierProjet(p => { id = ajouterActeur(p, cle); }, 'nouvel acteur');
    setMenu(false);
    if (id) choisir(id);
  };
  const echo = () => {
    let n = 0;
    modifierProjet(p => { n = poserActeursEcho(p); }, 'acteurs d’Écho');
    signaler(n ? `${n} acteur${n > 1 ? 's' : ''} d’Écho ajouté${n > 1 ? 's' : ''}.` : 'Les acteurs d’Écho sont déjà là.');
  };
  const convertir = () => {
    let r = { etapes: 0, acteursAjoutes: [] as string[] };
    modifierProjet(p => { r = convertirProjet(p); }, 'conversion en envois');
    signaler(`${r.etapes} étape${r.etapes > 1 ? 's' : ''} convertie${r.etapes > 1 ? 's' : ''} en envois${r.acteursAjoutes.length ? ' · acteurs ajoutés : ' + r.acteursAjoutes.join(', ') : ''}.`);
  };

  return (
    <div className="voile" onPointerDown={fermer}>
      <div className="fenetre ac-fenetre" onPointerDown={e => e.stopPropagation()} role="dialog" aria-label="Acteurs du projet">
        <div className="pn-tete">
          <span className="disp" style={{ fontSize: 12, letterSpacing: '.14em' }}>PROJET › ACTEURS</span>
          <span className="pn-droite">{acteurs.length} acteur{acteurs.length > 1 ? 's' : ''}</span>
          <button className="pn-fermer" onClick={fermer}>ÉCHAP POUR FERMER</button>
        </div>
        <div className="ac-corps">
          <div className="ac-liste">
            {acteurs.map(x => {
              const e = pastilleEtat(etats[x.id], x.cardinalite === 'n');
              return (
                <button key={x.id} className={'ac-item' + (a?.id === x.id ? ' on' : '')} onClick={() => choisir(x.id)}>
                  <Glyphe type={x.type} taille={16} />
                  <span className="ac-item-txt">
                    <span className="n">{x.nom || x.id}</span>
                    <span className="d">{x.id} · {NOM_TYPE[x.type] ?? x.type}{x.agent ? ' · ' + x.agent.genre : ''}</span>
                  </span>
                  <span className="point" style={{ background: e.couleur }} title={e.texte} />
                </button>
              );
            })}
            {!acteurs.length && <span className="ac-aide">Aucun acteur : ajoutez-les depuis le catalogue, ou posez ceux d’Écho.</span>}
            <div className="ac-ajouts">
              <span className="ac-ajout">
                <button className="pn-bouton" onClick={() => setMenu(v => !v)}>+ AJOUTER</button>
                {menu && (
                  <span className="ac-catalogue" role="menu">
                    {MODELES_ACTEURS.map(mo => (
                      <button key={mo.cle} role="menuitem" onClick={() => ajouter(mo.cle)}>
                        <Glyphe type={mo.type} />
                        <span className="ac-item-txt"><span className="n">{mo.nom}</span><span className="d">{mo.exemple}</span></span>
                      </button>
                    ))}
                  </span>
                )}
              </span>
              <button className="pn-bouton" onClick={echo} title="Le public, l’écran scène, la ministre, Franck, ÉCO, les figurants">ACTEURS D’ÉCHO</button>
            </div>
          </div>
          <div className="ac-detail">{a ? <EditeurActeur key={a.id} a={a} projet={projet} onRenomme={choisir} /> : null}</div>
        </div>
        {problemes.length > 0 && (
          <div className="ac-problemes">
            {problemes.map((pb, i) => <div key={i} className={'ev-pb ' + (pb.niveau === 'erreur' ? 'err' : 'avt')}>{pb.message}</div>)}
          </div>
        )}
        {aConvertir > 0 && (
          <div className="ev-alerte">
            <span>{aConvertir} étape{aConvertir > 1 ? 's portent' : ' porte'} encore des commandes du prototype (params.cmds). La conversion
              les remplace par des envois aux acteurs d’Écho ; le pont figurants du prototype (qui lit params.cmds) ne les enverra plus. Ctrl + Z annule.</span>
            <button className="pn-bouton" onClick={convertir}>CONVERTIR EN ENVOIS</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Cases({ titre, valeurs, proposees, onChange }: { titre: string; valeurs: string[]; proposees: readonly string[]; onChange: (l: string[]) => void }) {
  const [nouveau, setNouveau] = useState('');
  const toutes = [...new Set([...proposees, ...valeurs])];
  const ajouter = () => { const v = nouveau.trim(); if (v && !valeurs.includes(v)) onChange([...valeurs, v]); setNouveau(''); };
  return (
    <div className="ac-cases">
      <span className="pn-micro">{titre}</span>
      <div className="ac-cases-liste">
        {toutes.map(v => (
          <label key={v} className={'ac-case' + (valeurs.includes(v) ? ' on' : '')}>
            <input type="checkbox" checked={valeurs.includes(v)} onChange={e => onChange(e.target.checked ? [...valeurs, v] : valeurs.filter(x => x !== v))} />
            <span>{v}</span>
          </label>
        ))}
        <input className="pn-champ ac-nouveau" value={nouveau} placeholder="+ autre" aria-label={'Ajouter : ' + titre}
          onChange={e => setNouveau(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ajouter(); }} onBlur={ajouter} />
      </div>
    </div>
  );
}

function EditeurActeur({ a, projet, onRenomme }: { a: Acteur; projet: Projet; onRenomme: (id: string) => void }) {
  const [erreurId, setErreurId] = useState('');
  const [erreur, setErreur] = useState('');
  const [cle, setCle] = useState('');
  const modele = modeleActeur(a);
  const usages = useMemo(() => usagesActeur(projet, a.id), [projet, a.id]);
  const { signaler, selectionner } = useMagasin.getState();

  const renommer = (v: string) => {
    let err: string | null = null;
    useMagasin.getState().modifierProjet(p => { err = renommerActeur(p, a.id, v); }, 'identifiant d’acteur');
    const e = err as string | null;
    setErreurId(e ?? '');
    if (!e && v.trim() !== a.id) onRenomme(v.trim());
  };
  const changerType = (t: TypeActeur) => modifierActeur(a.id, x => {
    x.type = t;
    if (t === 'agent') { x.agent = { genre: x.agent?.genre ?? 'figurants', ...(x.agent?.config ? { config: x.agent.config } : {}) }; x.rendu = 'externe'; }
    else delete x.agent;
    const mo = modeleActeur(x);
    if (mo && t !== 'agent') { x.rendu = mo.rendu; x.cardinalite = mo.cardinalite; }
  }, 'type d’acteur');
  const config = a.agent?.config ?? {};
  const poserConfig = (k: string, v: string | null) => modifierActeur(a.id, x => {
    if (!x.agent) return;
    const c = { ...(x.agent.config ?? {}) };
    if (v === null) delete c[k];
    else c[k] = v.trim() !== '' && Number.isFinite(Number(v)) && !/^0\d/.test(v.trim()) ? Number(v) : v;
    if (Object.keys(c).length) x.agent.config = c; else delete x.agent.config;
  }, 'configuration d’agent');
  const ajouterCle = () => {
    const k = cle.trim();
    if (!k) return;
    if (cleConfigInterdite(k)) { setErreur(`« ${k} » ressemble à un secret : jamais de clé ni de jeton dans le projet (ils restent hors du dépôt).`); return; }
    setErreur('');
    poserConfig(k, '');
    setCle('');
  };
  const supprimer = () => {
    let err: string | null = null;
    useMagasin.getState().modifierProjet(p => { err = supprimerActeur(p, a.id); }, 'suppression d’acteur');
    const e = err as string | null;
    if (e) signaler(e); else { signaler(`Acteur « ${a.nom || a.id} » supprimé.`); useInterface.getState().poser({ acteurChoisi: null }); }
  };
  const aller = (moment: string, etape: string) => { selectionner({ moment, etape }); useInterface.getState().poser({ acteurs: false }); };

  return (
    <div className="ac-editeur">
      <div className="pn-grille2">
        <label className="ev-champ">
          <span className="pn-micro">IDENTIFIANT</span>
          <input className="pn-champ" defaultValue={a.id} key={a.id} spellCheck={false}
            onBlur={e => renommer(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        </label>
        <label className="ev-champ">
          <span className="pn-micro">NOM</span>
          <input className="pn-champ" value={a.nom} onChange={e => { const v = e.target.value; modifierActeur(a.id, x => { x.nom = v; }, 'nom d’acteur'); }} />
        </label>
      </div>
      {erreurId && <div className="ev-pb err">{erreurId}</div>}
      <div className="pn-grille2">
        <label className="ev-champ">
          <span className="pn-micro">TYPE</span>
          <select value={a.type} onChange={e => changerType(e.target.value as TypeActeur)}>
            {TYPES_ACTEUR.map(t => <option key={t} value={t}>{NOM_TYPE[t]}</option>)}
          </select>
        </label>
        {a.type === 'agent' && (
          <label className="ev-champ">
            <span className="pn-micro">SERVICE</span>
            <select value={a.agent?.genre ?? ''} onChange={e => { const g = e.target.value as GenreAgent; modifierActeur(a.id, x => { x.agent = { ...(x.agent ?? {}), genre: g }; }, 'agent'); }}>
              {GENRES_AGENT.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="ev-champ">
        <span className="pn-micro">RENDU</span>
        <div className="seg-groupe fond">
          {(Object.keys(NOM_RENDU) as RenduActeur[]).map(r => (
            <button key={r} className={'seg large' + (a.rendu === r ? ' on' : '')} onClick={() => modifierActeur(a.id, x => { x.rendu = r; }, 'rendu')}>{NOM_RENDU[r]}</button>
          ))}
        </div>
      </div>
      <div className="ev-champ">
        <span className="pn-micro">CARDINALITÉ</span>
        <div className="seg-groupe fond">
          {([[1, '1 · ACTEUR NOMMÉ'], ['n', 'N · FOULE']] as const).map(([c, t]) => (
            <button key={String(c)} className={'seg large' + (a.cardinalite === c ? ' on' : '')} onClick={() => modifierActeur(a.id, x => { x.cardinalite = c; }, 'cardinalité')}>{t}</button>
          ))}
        </div>
      </div>
      <Cases titre="ÉCRANS QU’IL SAIT AFFICHER" valeurs={Array.isArray(a.ecrans) ? a.ecrans : []} proposees={modele?.ecrans ?? []}
        onChange={l => modifierActeur(a.id, x => { x.ecrans = l; }, 'écrans')} />
      <Cases titre="SIGNAUX QU’IL RENVOIE" valeurs={Array.isArray(a.signaux) ? a.signaux : []} proposees={modele?.signaux ?? []}
        onChange={l => modifierActeur(a.id, x => { x.signaux = l; }, 'signaux')} />
      {a.type === 'agent' && (
        <div className="ac-cases">
          <span className="pn-micro">CONFIGURATION DE L’AGENT · SANS SECRET</span>
          {Object.entries(config).map(([k, v]) => (
            <div key={k} className="ac-config">
              <span className="k">{k}</span>
              <input className="pn-champ" key={k + String(v)} defaultValue={typeof v === 'string' || typeof v === 'number' ? String(v) : JSON.stringify(v)}
                onBlur={e => poserConfig(k, e.target.value)} />
              <button className="ev-x" title="Retirer" onClick={() => poserConfig(k, null)}>✕</button>
            </div>
          ))}
          <div className="ac-config">
            <input className="pn-champ" value={cle} placeholder="+ réglage (banques, agent, voix…)" onChange={e => setCle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') ajouterCle(); }} />
            <button className="pn-bouton" onClick={ajouterCle}>AJOUTER</button>
          </div>
          {erreur && <div className="ev-pb err">{erreur}</div>}
        </div>
      )}
      <div className="ac-cases">
        <span className="pn-micro">VISÉ PAR · {usages.envois.length} ENVOI{usages.envois.length > 1 ? 'S' : ''} · {usages.conditions.length} CONDITION{usages.conditions.length > 1 ? 'S' : ''}</span>
        <div className="ac-usages">
          {usages.envois.slice(0, 40).map((u, i) => (
            <button key={i} className="ac-usage" onClick={() => aller(u.moment, u.etape)}>{u.nom}</button>
          ))}
        </div>
      </div>
      <button className="pn-bouton danger" onClick={supprimer} disabled={usages.envois.length > 0}
        title={usages.envois.length ? 'Retirez d’abord les envois qui visent cet acteur' : undefined}>SUPPRIMER L’ACTEUR</button>
    </div>
  );
}
