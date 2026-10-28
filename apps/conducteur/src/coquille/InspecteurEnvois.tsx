// Inspecteur de l'étape, côté acteurs (audit 2026-10, rapport 2 §4.2 b ; rapport 3 §4.6) :
//   - ENVOIS : une ligne par acteur du projet avec sa puce d'état (hérite / change / inchangé) ; choisir un écran dans
//     ceux de l'acteur, régler ses `params` dans un formulaire (« $nom » lit un réglage de l'étape), `quand`, `tenir`,
//     ordre des envois, suppression ; aperçu en direct (vrai écran du téléphone, vignette de la scène) ; « Tester »
//     envoie la vue au téléphone témoin de l'émulateur s'il est branché ; erreurs de validation de l'étape ;
//     « Convertir en envois » pour les anciennes commandes du prototype (params.cmds).
//   - ATTEND : les signaux que renvoient les acteurs, à glisser (ou cliquer) dans une condition de sortie.
//   - EN COURS / PROCHAIN (mode SPECTACLE) : le cue en cours, le prochain et les envois qui partiront au GO.
// Toute modification passe par modifierProjet (annulable, synchronisée avec la salle collaborative).
import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { signauxDuProjet, type Acteur, type Envoi, type Etape, type Projet } from '@studio-real/modele';
import { useMagasin } from '../etat/magasin';
import { testerVue } from '../etat/acteurs';
import { useInterface } from './interface';
import {
  ajouterConditionSignal, ajouterEnvoi, aConvertir, autresParams, completerActeursEcho, convertirEtape, deplacerEnvoi,
  ecrireAutres, ecrireChamp, lignesActeurs, lireChamp, lireQuand, poserQuand, prochainCue, problemesEtape, referencesEtape,
  retirerEnvoi, schemaEcran, validerProjet, vueDeLEnvoi, type ChampParam, type LigneActeur,
} from './envois';
import { glypheActeur, puceEnvoi, resumeEnvoi } from '../planche/acteurs';
import { ApercuActeur } from './ApercuEnvoi';
import './acteurs.css';

/** Type MIME d'un signal d'acteur glissé (section ATTEND → sortie). */
export const TYPE_SIGNAL = 'application/x-studio-real-signal';

const TXT_STATUT = { herite: 'HÉRITE', change: 'CHANGE', inchange: 'INCHANGÉ' } as const;

/** Modifie l'étape (moment, etape) dans la copie du projet. */
function modifierEtape(moment: string, etape: string, fn: (st: Etape, p: Projet) => void, etiquette: string) {
  useMagasin.getState().modifierProjet(p => {
    const st = p.ev.find(m => m.id === moment)?.st.find(s => s.id === etape);
    if (st) fn(st, p);
  }, etiquette);
}

export function Glyphe({ type, taille = 14 }: { type: string; taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className="ac-glyphe">
      <path d={glypheActeur(type)} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── ENVOIS ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export function SectionEnvois({ moment, etape }: { moment: string; etape: string }) {
  const projet = useMagasin(s => s.projet);
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [heriteOuvert, setHeriteOuvert] = useState<string | null>(null);
  const m = projet.ev.find(x => x.id === moment), st = m?.st.find(x => x.id === etape);
  const lignes = useMemo(() => lignesActeurs(projet, moment, etape), [projet, moment, etape]);
  const problemes = useMemo(() => problemesEtape(validerProjet(projet), moment, etape), [projet, moment, etape]);
  if (!m || !st) return null;
  const acteurs = Array.isArray(projet.acteurs) ? projet.acteurs : [];
  const envois = Array.isArray(st.envois) ? st.envois : [];
  const connus = new Set(acteurs.map(a => a.id));
  const orphelins = envois.map((envoi, index) => ({ envoi, index })).filter(x => {
    const id = String(x.envoi?.vers ?? '').split(':')[0];
    return !connus.has(id);
  });
  const ouvrirActeurs = () => useInterface.getState().poser({ acteurs: true });

  const convertir = () => {
    let vises: string[] = [], ajoutes: string[] = [];
    modifierEtape(moment, etape, (x, p) => { vises = convertirEtape(x); ajoutes = completerActeursEcho(p, vises); }, 'conversion en envois');
    useMagasin.getState().signaler(`Commandes converties en ${vises.length ? 'envois' : 'rien'}${ajoutes.length ? ' · acteurs ajoutés : ' + ajoutes.join(', ') : ''}.`);
  };

  return (
    <div className="pn-bloc ev-bloc">
      <div className="pn-tete">
        <span className="pn-tag">ENVOIS</span>
        <span className="pn-droite">{envois.length ? envois.length + ' envoi' + (envois.length > 1 ? 's' : '') : 'aucun'}</span>
      </div>
      {aConvertir(st) && (
        <div className="ev-alerte">
          <span>Cette étape porte encore des commandes du prototype (params.cmds).</span>
          <button className="pn-bouton" onClick={convertir}>CONVERTIR EN ENVOIS</button>
        </div>
      )}
      {problemes.map((pb, i) => (
        <div key={i} className={'ev-pb ' + (pb.niveau === 'erreur' ? 'err' : 'avt')} role={pb.niveau === 'erreur' ? 'alert' : undefined}>{pb.message}</div>
      ))}
      {!acteurs.length && (
        <div className="ev-vide">
          <span>Le projet ne déclare aucun acteur : personne à qui envoyer un écran.</span>
          <button className="pn-bouton" onClick={ouvrirActeurs}>ACTEURS DU PROJET…</button>
        </div>
      )}
      {lignes.map(l => (
        <LigneActeurEnvois key={l.acteur.id} l={l} st={st} moment={moment} titreProjet={projet.titre}
          ouvert={ouvert} setOuvert={setOuvert} heriteOuvert={heriteOuvert === l.acteur.id}
          basculerHerite={() => setHeriteOuvert(h => (h === l.acteur.id ? null : l.acteur.id))} nbEnvois={envois.length} />
      ))}
      {orphelins.length > 0 && (
        <div className="ev-acteur">
          <div className="ev-acteur-tete"><span className="ev-nom">ACTEUR INCONNU</span></div>
          {orphelins.map(({ envoi, index }) => (
            <LigneEnvoi key={index} envoi={envoi} index={index} acteur={undefined} st={st} moment={moment} titreProjet={projet.titre}
              ouvert={ouvert === index} basculer={() => setOuvert(o => (o === index ? null : index))} nbEnvois={envois.length} setOuvert={setOuvert} />
          ))}
        </div>
      )}
    </div>
  );
}

function LigneActeurEnvois({ l, st, moment, titreProjet, ouvert, setOuvert, heriteOuvert, basculerHerite, nbEnvois }: {
  l: LigneActeur; st: Etape; moment: string; titreProjet?: string; ouvert: number | null; setOuvert: (f: (o: number | null) => number | null) => void;
  heriteOuvert: boolean; basculerHerite: () => void; nbEnvois: number;
}) {
  const [menu, setMenu] = useState(false);
  const a = l.acteur;
  const ajouter = (ecran: string) => {
    let i = -1;
    modifierEtape(moment, st.id, x => { i = ajouterEnvoi(x, a.id, ecran); }, 'envoi');
    setMenu(false);
    if (i >= 0) setOuvert(() => i);
  };
  const ecrans = Array.isArray(a.ecrans) ? a.ecrans : [];
  return (
    <div className={'ev-acteur ev-' + l.statut}>
      <div className="ev-acteur-tete">
        <Glyphe type={a.type} />
        <span className="ev-nom" title={a.id}>{a.nom || a.id}</span>
        <button className={'ev-statut ' + l.statut} title={l.statut === 'herite' ? 'Il garde l’écran précédent · cliquer pour le voir' : undefined}
          onClick={l.statut === 'herite' ? basculerHerite : undefined}>{TXT_STATUT[l.statut]}</button>
        <span className="ev-espace" />
        <span className="ev-ajout">
          <button title={'Envoyer un écran à ' + (a.nom || a.id)} onClick={() => setMenu(v => !v)} disabled={!ecrans.length}>+</button>
          {menu && (
            <span className="ev-menu" role="menu">
              {ecrans.map(e => <button key={e} role="menuitem" onClick={() => ajouter(e)}>{e}</button>)}
            </span>
          )}
        </span>
      </div>
      {l.statut === 'herite' && (
        <span className="ev-herite">garde : {l.avant ? resumeEnvoi({ ecran: l.avant.ecran, params: l.avant.params }) : 'rien encore'}</span>
      )}
      {l.statut === 'herite' && heriteOuvert && (
        <div className="ev-apercu grise"><ApercuActeur acteur={a} vue={l.avant} titreProjet={titreProjet} /></div>
      )}
      {l.envois.map(({ envoi, index }) => (
        <LigneEnvoi key={index} envoi={envoi} index={index} acteur={a} st={st} moment={moment} titreProjet={titreProjet}
          ouvert={ouvert === index} basculer={() => setOuvert(o => (o === index ? null : index))} nbEnvois={nbEnvois} setOuvert={setOuvert} />
      ))}
    </div>
  );
}

function LigneEnvoi({ envoi, index, acteur, st, moment, titreProjet, ouvert, basculer, nbEnvois, setOuvert }: {
  envoi: Envoi; index: number; acteur: Acteur | undefined; st: Etape; moment: string; titreProjet?: string;
  ouvert: boolean; basculer: () => void; nbEnvois: number; setOuvert: (f: (o: number | null) => number | null) => void;
}) {
  const modif = (fn: (e: Envoi, x: Etape) => void, etiquette = 'envoi') =>
    modifierEtape(moment, st.id, x => { const e = x.envois?.[index]; if (e) fn(e, x); }, etiquette);
  const deplacer = (sens: -1 | 1) => {
    let j = index;
    modifierEtape(moment, st.id, x => { j = deplacerEnvoi(x, index, sens); }, 'ordre des envois');
    setOuvert(o => (o === index ? j : o));
  };
  const retirer = () => { modifierEtape(moment, st.id, x => retirerEnvoi(x, index), 'retrait d’envoi'); setOuvert(() => null); };
  const ecrans = [...new Set([...(acteur?.ecrans ?? []), ...(envoi.ecran ? [envoi.ecran] : [])])];
  return (
    <div className={'ev-envoi' + (ouvert ? ' ouvert' : '')}>
      <div className="ev-envoi-tete">
        <span className="num ev-no" title="Ordre d’envoi">{index + 1}</span>
        <button className="ev-resume" onClick={basculer} aria-expanded={ouvert} title={puceEnvoi(envoi)}>{resumeEnvoi(envoi)}{envoi.quand ? ' · ' + libelleQuand(envoi) : ''}</button>
        <span className="pn-ordre">
          <button disabled={index === 0} aria-label="Envoyer plus tôt" onClick={() => deplacer(-1)}>▲</button>
          <button disabled={index >= nbEnvois - 1} aria-label="Envoyer plus tard" onClick={() => deplacer(1)}>▼</button>
        </span>
        <button className="ev-x" title="Retirer l’envoi" onClick={retirer}>✕</button>
      </div>
      {ouvert && (
        <div className="ev-detail">
          <div className="ev-form">
            <label className="ev-champ">
              <span className="pn-micro">ÉCRAN</span>
              <select value={envoi.ecran ?? ''} onChange={e => { const v = e.target.value; modif(x => { if (v) x.ecran = v; else delete x.ecran; }); }}>
                <option value="">— aucun (effet seul)</option>
                {ecrans.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
            {acteur?.cardinalite === 'n' && (
              <label className="ev-champ">
                <span className="pn-micro">QUI DANS LA FOULE</span>
                <input className="pn-champ" defaultValue={envoi.vers} key={envoi.vers} placeholder={acteur.id + ' · ou ' + acteur.id + ':ont-vote:A'}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== envoi.vers) modif(x => { x.vers = v; }, 'cible'); }} />
              </label>
            )}
            <FormulaireParams envoi={envoi} acteur={acteur} st={st} onChange={params => modif(x => { if (Object.keys(params).length) x.params = params; else delete x.params; }, 'réglage d’envoi')} />
            <Quand envoi={envoi} onChange={(g, n) => modif(x => poserQuand(x, g, n), 'quand')} />
            <label className="ev-coche">
              <input type="checkbox" checked={envoi.tenir !== false} onChange={e => { const v = e.target.checked; modif(x => { if (v) delete x.tenir; else x.tenir = false; }, 'tenir'); }} />
              <span>tenir l’écran après l’étape</span>
            </label>
          </div>
          <div className="ev-cote">
            <div className="ev-apercu"><ApercuActeur acteur={acteur} vue={vueDeLEnvoi(envoi, st)} titreProjet={titreProjet} /></div>
            <button className="pn-bouton ev-tester" title="Envoie cette vue au téléphone témoin de l’émulateur (jamais au public)"
              onClick={() => {
                const v = vueDeLEnvoi(envoi, st);
                const r = testerVue({ acteur: acteur?.id ?? envoi.vers, ecran: v?.ecran, fx: envoi.fx, params: v?.params ?? {} });
                useMagasin.getState().signaler(r.message);
              }}>TESTER</button>
          </div>
        </div>
      )}
    </div>
  );
}

function libelleQuand(e: Envoi): string {
  const q = lireQuand(e);
  return q.genre === 'sortie' ? 'à la sortie' : q.genre === 'apres' ? '+' + q.apres + ' s' : 'à l’entrée';
}

function Quand({ envoi, onChange }: { envoi: Envoi; onChange: (g: 'entree' | 'sortie' | 'apres', n?: number) => void }) {
  const q = lireQuand(envoi);
  return (
    <div className="ev-champ">
      <span className="pn-micro">QUAND</span>
      <div className="ev-quand">
        <div className="seg-groupe fond">
          {([['entree', 'ENTRÉE'], ['apres', 'APRÈS'], ['sortie', 'SORTIE']] as const).map(([g, t]) => (
            <button key={g} className={'seg' + (q.genre === g ? ' on' : '')} onClick={() => onChange(g, q.apres || 5)}>{t}</button>
          ))}
        </div>
        {q.genre === 'apres' && (
          <input className="pn-champ ev-nombre" type="number" min={0} step={1} value={q.apres} aria-label="secondes après l’entrée"
            onChange={e => onChange('apres', Number(e.target.value))} />
        )}
        {q.genre === 'apres' && <span className="pn-micro">S</span>}
      </div>
    </div>
  );
}

function FormulaireParams({ envoi, acteur, st, onChange }: { envoi: Envoi; acteur: Acteur | undefined; st: Etape; onChange: (p: Record<string, unknown>) => void }) {
  const schema = schemaEcran(acteur, envoi.ecran);
  const autres = autresParams(envoi.params, schema);
  const [erreur, setErreur] = useState('');
  const refs = referencesEtape(st);
  return (
    <>
      {schema.map(c => <Champ key={c.cle + '|' + (envoi.ecran ?? '')} champ={c} params={envoi.params} onChange={onChange} />)}
      <label className="ev-champ">
        <span className="pn-micro">AUTRES RÉGLAGES (JSON)</span>
        <textarea className="pn-champ ev-json" rows={2} key={JSON.stringify(autres)} defaultValue={Object.keys(autres).length ? JSON.stringify(autres) : ''}
          placeholder="{ }" spellCheck={false}
          onBlur={e => {
            const r = ecrireAutres(envoi.params, schema, e.target.value);
            if ('erreur' in r) { setErreur(r.erreur); return; }
            setErreur('');
            if (JSON.stringify(r.params) !== JSON.stringify(envoi.params ?? {})) onChange(r.params);
          }} />
      </label>
      {erreur && <div className="ev-pb err">{erreur}</div>}
      {refs.length > 0 && <span className="ev-refs">« $nom » lit un réglage de l’étape : {refs.join(' · ')}</span>}
    </>
  );
}

function Champ({ champ, params, onChange }: { champ: ChampParam; params: Record<string, unknown> | undefined; onChange: (p: Record<string, unknown>) => void }) {
  const valeur = lireChamp(params, champ);
  const poser = (saisie: string) => {
    const p = ecrireChamp(params, champ, saisie);
    if (JSON.stringify(p) !== JSON.stringify(params ?? {})) onChange(p);
  };
  let entree: ReactNode;
  if (champ.genre === 'choix') {
    entree = (
      <select value={valeur} onChange={e => poser(e.target.value)}>
        {[...new Set([...(champ.choix ?? []), valeur])].map(o => <option key={o} value={o}>{o || '—'}</option>)}
      </select>
    );
  } else if (champ.genre === 'oui-non') {
    entree = (
      <div className="seg-groupe fond">
        {([['', '—'], ['oui', 'OUI'], ['non', 'NON']] as const).map(([v, t]) => (
          <button key={v} className={'seg' + (valeur === v ? ' on' : '')} onClick={() => poser(v)}>{t}</button>
        ))}
      </div>
    );
  } else if (champ.genre === 'long' || champ.genre === 'liste') {
    entree = <textarea className="pn-champ" rows={champ.genre === 'liste' ? 3 : 2} key={valeur} defaultValue={valeur}
      placeholder={champ.genre === 'liste' ? 'une ligne par élément' : ''} onBlur={e => poser(e.target.value)} />;
  } else {
    entree = <input className="pn-champ" key={valeur} defaultValue={valeur}
      placeholder={champ.genre === 'nombres' ? '41, 9, 37, 13' : champ.genre === 'nombre' ? '0 ou $nom' : champ.genre === 'asset' ? 'nom du média' : ''}
      onBlur={e => poser(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
  }
  return (
    <label className="ev-champ">
      <span className="pn-micro">{champ.libelle.toUpperCase()}</span>
      {entree}
    </label>
  );
}

// ─── ATTEND ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export function SectionAttend({ moment, etape }: { moment: string; etape: string }) {
  const projet = useMagasin(s => s.projet);
  const signaux = useMemo(() => signauxDuProjet(projet), [projet]);
  const m = projet.ev.find(x => x.id === moment);
  const sorties = (m?.tr ?? []).map((tr, i) => ({ tr, i })).filter(o => o.tr.a === etape);
  const [cible, setCible] = useState<number | null>(null);
  if (!m || !signaux.length) return null;
  const choisie = sorties.some(o => o.i === cible) ? cible : sorties[0]?.i ?? null;
  const nomEtape = (id: string) => (id ? m.st.find(x => x.id === id)?.name ?? '?' : 'fin du moment');
  const ajouter = (nom: string) => {
    if (choisie === null) { useMagasin.getState().signaler('L’étape n’a pas de sortie : tire le rond + sur la planche.'); return; }
    ajouterSignalASortie(moment, choisie, nom);
  };
  const parActeur = new Map<string, typeof signaux>();
  for (const s of signaux) parActeur.set(s.acteur, [...(parActeur.get(s.acteur) ?? []), s]);
  return (
    <div className="pn-bloc ev-bloc">
      <div className="pn-tete"><span className="pn-tag">ATTEND</span><span className="pn-droite">signaux des acteurs</span></div>
      {sorties.length ? (
        <label className="ev-champ">
          <span className="pn-micro">AJOUTER À</span>
          <select value={choisie ?? ''} onChange={e => setCible(Number(e.target.value))}>
            {sorties.map((o, k) => <option key={o.i} value={o.i}>{`Sortie ${k + 1} → ${nomEtape(o.tr.b)}`}</option>)}
          </select>
        </label>
      ) : <span className="ev-herite">aucune sortie : tire le rond + de l’étape sur la planche</span>}
      {[...parActeur.entries()].map(([id, l]) => (
        <div key={id} className="ev-signaux">
          <span className="ev-signaux-acteur">{l[0]!.acteurNom}</span>
          <span className="ev-puces">
            {l.map(s => (
              <button key={s.nom} className="ev-puce-signal" draggable title={`Glisser sur une sortie, ou cliquer : sig:${s.nom} ≥ 1`}
                onDragStart={e => { e.dataTransfer.setData(TYPE_SIGNAL, s.nom); e.dataTransfer.effectAllowed = 'copy'; }}
                onClick={() => ajouter(s.nom)}>{s.signal}</button>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Ajoute la condition « signal reçu » à la sortie n° i du moment. */
export function ajouterSignalASortie(moment: string, i: number, nom: string) {
  let ok = false;
  useMagasin.getState().modifierProjet(p => {
    const s = p.ev.find(x => x.id === moment)?.tr[i];
    if (s) ok = ajouterConditionSignal(s.g, nom);
  }, 'condition');
  useMagasin.getState().signaler(ok ? `Condition ajoutée : signal ${nom} reçu.` : 'Cette sortie attend déjà ce signal.');
}

/** Rend une zone capable de recevoir un signal glissé depuis ATTEND. */
export function cibleSignal(moment: string, sortie: number) {
  return {
    onDragOver: (e: DragEvent) => { if (e.dataTransfer.types.includes(TYPE_SIGNAL)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } },
    onDrop: (e: DragEvent) => {
      const nom = e.dataTransfer.getData(TYPE_SIGNAL);
      if (!nom) return;
      e.preventDefault();
      ajouterSignalASortie(moment, sortie, nom);
    },
  };
}

// ─── EN COURS / PROCHAIN (SPECTACLE) ──────────────────────────────────────────────────────────────────────────────────
export function EnCoursProchain() {
  const projet = useMagasin(s => s.projet);
  const lecture = useMagasin(s => s.lecture);
  const cle = lecture ? `${lecture.moment}|${lecture.etape}|${lecture.termine}` : '';
  // ne se recalcule qu'au changement de cue (pas à chaque image de la lecture)
  const r = useMemo(() => prochainCue(projet, lecture), [projet, cle]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="pn-bloc ec-bloc" aria-label="Cue en cours et prochain">
      <div className="ec-cue">
        <span className="pn-micro">EN COURS</span>
        <span className="ec-nom">{r.enCours?.nom ?? (lecture?.termine ? 'FIN DU SPECTACLE' : '—')}</span>
        {r.enCours && r.enCours.momentNom !== r.enCours.nom && <span className="ec-moment">{r.enCours.momentNom}</span>}
      </div>
      <div className="ec-cue prochain">
        <span className="pn-micro">PROCHAIN · AU GO</span>
        <span className="ec-nom">{r.prochain?.nom ?? '—'}</span>
        {r.prochain && r.prochain.momentNom !== r.prochain.nom && <span className="ec-moment">{r.prochain.momentNom}</span>}
      </div>
      {r.envois.length > 0 ? (
        <ul className="ec-envois">
          {r.envois.map((e, i) => <li key={i} className={'ac-puce q-' + e.quand}>{e.texte}</li>)}
        </ul>
      ) : r.prochain && <span className="ev-herite">aucun envoi au prochain GO</span>}
    </div>
  );
}
