// Panneau de droite. Pour la sélection, trois niveaux : l'essentiel visible → « Réglages » (ouvert) → « Avancé »
// (fermé). Puis « Où en est-on », la régie (entrées extérieures du moteur, journal ; ouverte), la salle simulée
// (fermée par défaut, comme le design), l'équipe (salle collaborative ; fermée) et « Projet · versions ».
// Pas de phrases d'aide ici : des valeurs, des noms, des actions.
import { useRef, type ReactNode } from 'react';
import { dureeEtape, type Condition, type Projet } from '@studio-real/modele';
import { useMagasin, type Selection } from '../etat/magasin';
import { prevoir, votesSalle, issueSalle } from '../etat/moteur';
import {
  CONDITIONS_AJOUTABLES, PLAGE_CONDITION, couperMoment, deplacerSortie, entreesDuMoment, joindreActeAvant, nouvelActeIci,
  nouvelleCondition, supprimerElementPiste, supprimerEtape, supprimerMoment, supprimerPiste, supprimerSortie,
} from '../etat/operations';
import { TYPES_PISTE } from '../etat/assets';
import { mmss, romain } from '../theme/format';
import { useInterface, type Accordeons } from './interface';
import { infoBloc, libelleCondition, regleSortie } from './derive';
import { useSituationVive, useStructure } from './structure-lecture';
import { Rotatif, RotatifSeul } from './Rotatif';
import { CHEVRON } from './icones';
import { nouveauMoment } from './raccourcis';
import { PupitreRegie } from './Regie';
import { Equipe, useCommentairesOuverts } from './Equipe';
import { chargerLive } from './projet-live';
import { ApercuSortie } from '../sortie';
import { EnCoursProchain, SectionAttend, SectionEnvois, cibleSignal } from './InspecteurEnvois';
import { signauxDuProjet } from '@studio-real/modele';
import { ajouterConditionSignal } from './envois';

type Modif = (fn: (p: Projet) => void, etiquette?: string) => void;

/** Applique une opération qui peut refuser (message pour la régie) ; renvoie ce message ou null. */
function appliquer(fn: (p: Projet) => string | null, etiquette: string): string | null {
  const r: { m: string | null } = { m: null };
  useMagasin.getState().modifierProjet(p => { r.m = fn(p); }, etiquette);
  return r.m;
}

function Accordeon({ k, titre, children }: { k: keyof Accordeons; titre: string; children: ReactNode }) {
  const ouvert = useInterface(s => s.acc[k]);
  const basculer = useInterface(s => s.basculerAcc);
  return (
    <>
      <button className={'pn-acc' + (ouvert ? ' on' : '')} onClick={() => basculer(k)} aria-expanded={ouvert}>
        <span>{titre}</span><span className="pn-chev">{CHEVRON}</span>
      </button>
      {ouvert && <div className="pn-bloc">{children}</div>}
    </>
  );
}

function Tete({ tag }: { tag: string }) {
  const selectionner = useMagasin(s => s.selectionner);
  return (
    <div className="pn-tete"><span className="pn-tag">{tag}</span><button className="pn-fermer" onClick={() => selectionner({})}>FERMER</button></div>
  );
}

const Ligne = ({ l, v }: { l: string; v: ReactNode }) => <div className="pn-ligne"><span className="l">{l}</span><span className="v">{v}</span></div>;
const Bouton = ({ children, danger, onClick }: { children: ReactNode; danger?: boolean; onClick: () => void }) =>
  <button className={'pn-bouton' + (danger ? ' danger' : '')} onClick={onClick}>{children}</button>;

// ─── conditions (sortie, passage) ─────────────────────────────────────────────────────────────────────
function Conditions({ g, modifier, chemin }: { g: Condition[]; modifier: Modif; chemin: (p: Projet) => Condition[] | undefined }) {
  return (
    <>
      <span className="pn-micro">CONDITIONS</span>
      {g.map((c, i) => {
        const avecRotatif = c.k !== 'issue' && !c.k.startsWith('mem:');
        const [a, b] = PLAGE_CONDITION[c.k] ?? [0, 100];
        const pos = ((Number(c.v) - a) / (b - a)) * 100;
        return (
          <div key={i} className="pn-cond">
            {avecRotatif && <RotatifSeul valeur={pos} couleur="var(--ort)" libelle={libelleCondition(c)}
              onChange={v => modifier(p => { const x = chemin(p)?.[i]; if (x) x.v = Math.round(a + v / 100 * (b - a)); }, 'condition')} />}
            <span className="lab">{libelleCondition(c)}</span>
            <button className="x" title="Retirer" onClick={() => modifier(p => { chemin(p)?.splice(i, 1); }, 'retrait de condition')}>✕</button>
          </div>
        );
      })}
      <div className="pn-ajouts">
        {CONDITIONS_AJOUTABLES.map(([t, k, v]) => (
          <button key={k} onClick={() => modifier(p => { chemin(p)?.push(nouvelleCondition(k, v)); }, 'ajout de condition')}>+ {t}</button>
        ))}
      </div>
      <SignalActeur onChoisir={nom => modifier(p => { const g = chemin(p); if (g) ajouterConditionSignal(g, nom); }, 'ajout de condition')} />
    </>
  );
}

/** « + signal d'un acteur » : les signaux que les acteurs du projet renvoient (condition sig:<acteur>.<signal> ≥ 1). */
function SignalActeur({ onChoisir }: { onChoisir: (nom: string) => void }) {
  const projet = useMagasin(s => s.projet);
  const signaux = signauxDuProjet(projet);
  if (!signaux.length) return null;
  return (
    <select className="pn-signal" value="" aria-label="Attendre le signal d’un acteur" onChange={e => { if (e.target.value) onChoisir(e.target.value); }}>
      <option value="">+ SIGNAL D’UN ACTEUR…</option>
      {signaux.map(s => <option key={s.nom} value={s.nom}>{s.acteurNom} · {s.signal}</option>)}
    </select>
  );
}

// ─── étape ────────────────────────────────────────────────────────────────────────────────────────────
function PanneauEtape({ sel }: { sel: Selection }) {
  const projet = useMagasin(s => s.projet);
  const clair = useMagasin(s => s.theme === 'clair');
  const { modifierProjet: modifier, selectionner, signaler } = useMagasin.getState();
  const m = projet.ev.find(x => x.id === sel.moment), st = m?.st.find(x => x.id === sel.etape);
  if (!m || !st) return null;
  const info = infoBloc(st.ty, clair);
  const sorties = m.tr.map((tr, i) => ({ tr, i })).filter(o => o.tr.a === st.id);
  const regler = (j: number) => (v: number) => modifier(p => { const e = p.ev.find(x => x.id === m.id)?.st.find(x => x.id === st.id); if (e) e.k[j] = v; }, 'réglage');
  return (
    <>
      <div className="pn-bloc">
        <Tete tag={'ÉTAPE · ' + info.nature} />
        <input className="pn-champ" value={st.name} aria-label="Nom de l’étape"
          onChange={e => { const v = e.target.value; modifier(p => { const x = p.ev.find(y => y.id === m.id)?.st.find(y => y.id === st.id); if (x) x.name = v; }, 'nom'); }} />
        <div className="pn-rotatifs">
          <Rotatif valeur={st.k[0] ?? 0} couleur="var(--ort)" affichage={mmss(dureeEtape(st))} libelle="DURÉE" onChange={regler(0)} />
          {info.reglages.map((r, j) => (
            <Rotatif key={j} valeur={st.k[j + 1] ?? 50} couleur={info.couleur} affichage={r.aff(st.k[j + 1] ?? 50)} libelle={r.nom.toUpperCase().slice(0, 9)} onChange={regler(j + 1)} />
          ))}
        </div>
        <span className="pn-micro">SORTIES</span>
        {sorties.map((o, k) => (
          <div key={o.i} className="pn-sortie" {...cibleSignal(m.id, o.i)} title="Glisser ici un signal de la section ATTEND">
            <span className="num no">{k + 1}</span>
            <span className="corps-s" onClick={() => selectionner({ moment: m.id, sortie: o.i })}>
              <span className="vers">→ {o.tr.b ? m.st.find(x => x.id === o.tr.b)?.name ?? '?' : 'fin du moment'}</span>
              <span className="regle">{regleSortie(o.tr, sorties.length > 1, true)}</span>
            </span>
            <span className="pn-ordre">
              <button disabled={k === 0} aria-label="Plus tôt" onClick={() => modifier(p => { deplacerSortie(p, m.id, o.i, -1); }, 'ordre des sorties')}>▲</button>
              <button disabled={k === sorties.length - 1} aria-label="Plus tard" onClick={() => modifier(p => { deplacerSortie(p, m.id, o.i, 1); }, 'ordre des sorties')}>▼</button>
            </span>
          </div>
        ))}
      </div>
      <SectionEnvois moment={m.id} etape={st.id} />
      <SectionAttend moment={m.id} etape={st.id} />
      <Accordeon k="r" titre="RÉGLAGES">
        <Ligne l="MOMENT" v={m.name} />
        <Ligne l="TYPE" v={info.nature} />
        <Ligne l="BLOC" v={info.nom} />
        <Ligne l="ASSET" v={st.asset ?? '—'} />
      </Accordeon>
      <Accordeon k="a" titre="AVANCÉ">
        <Ligne l="CODE" v={st.ty} />
        {!entreesDuMoment(m).includes(st.id) && (
          <Bouton danger onClick={() => {
            const err = appliquer(p => supprimerEtape(p, m.id, st.id), 'suppression');
            if (err) signaler(err); else selectionner({ moment: m.id });
          }}>SUPPRIMER L’ÉTAPE</Bouton>
        )}
      </Accordeon>
    </>
  );
}

// ─── sortie ───────────────────────────────────────────────────────────────────────────────────────────
function PanneauSortie({ sel }: { sel: Selection }) {
  const projet = useMagasin(s => s.projet);
  const { modifierProjet: modifier, selectionner } = useMagasin.getState();
  const m = projet.ev.find(x => x.id === sel.moment), tr = m?.tr[sel.sortie ?? -1];
  if (!m || !tr) return null;
  const soeurs = m.tr.filter(x => x.a === tr.a), k = soeurs.indexOf(tr);
  const nom = (id: string) => (id ? m.st.find(x => x.id === id)?.name ?? '?' : 'fin du moment');
  const chemin = (p: Projet) => p.ev.find(x => x.id === m.id)?.tr[sel.sortie!]?.g;
  const deplacer = (d: -1 | 1) => { let i = sel.sortie!; modifier(p => { i = deplacerSortie(p, m.id, sel.sortie!, d); }, 'ordre des sorties'); selectionner({ moment: m.id, sortie: i }); };
  return (
    <>
      <div className="pn-bloc" {...cibleSignal(m.id, sel.sortie!)}>
        <Tete tag={soeurs.length > 1 ? 'SORTIE ' + (k + 1) + ' / ' + soeurs.length : 'SORTIE'} />
        <span className="pn-titre">{nom(tr.a)} → {nom(tr.b)}</span>
        <Conditions g={tr.g} modifier={modifier} chemin={chemin} />
      </div>
      <Accordeon k="r" titre="RÉGLAGES">
        <div className="seg-groupe fond">
          {([['all', 'TOUTES REQUISES'], ['any', 'UNE SEULE SUFFIT']] as const).map(([md, t]) => (
            <button key={md} className={'seg large' + (tr.mode === md ? ' on' : '')}
              onClick={() => modifier(p => { const x = p.ev.find(y => y.id === m.id)?.tr[sel.sortie!]; if (x) x.mode = md; }, 'sortie')}>{t}</button>
          ))}
        </div>
        <div className="pn-grille2">
          <Bouton onClick={() => deplacer(-1)}>▲ PLUS TÔT</Bouton>
          <Bouton onClick={() => deplacer(1)}>▼ PLUS TARD</Bouton>
        </div>
      </Accordeon>
      <Accordeon k="a" titre="AVANCÉ">
        <Bouton danger onClick={() => { modifier(p => supprimerSortie(p, m.id, sel.sortie!), 'suppression'); selectionner({ moment: m.id, etape: tr.a }); }}>SUPPRIMER LE LIEN</Bouton>
      </Accordeon>
    </>
  );
}

// ─── passage ──────────────────────────────────────────────────────────────────────────────────────────
function PanneauPassage({ sel }: { sel: Selection }) {
  const projet = useMagasin(s => s.projet);
  const { modifierProjet: modifier } = useMagasin.getState();
  const i = projet.ev.findIndex(x => x.id === sel.moment), m = projet.ev[i];
  if (!m) return null;
  const suivant = projet.ev[i + 1];
  const chemin = (p: Projet) => p.ev.find(x => x.id === m.id)?.gate.g;
  return (
    <>
      <div className="pn-bloc">
        <Tete tag={'PASSAGE P' + (i + 1)} />
        <span className="pn-titre">{m.name.toUpperCase()} → {suivant ? suivant.name.toUpperCase() : 'FIN'}</span>
        <Conditions g={m.gate.g} modifier={modifier} chemin={chemin} />
      </div>
      <Accordeon k="r" titre="RÉGLAGES">
        <div className="seg-groupe fond">
          {([['auto', 'ENCHAÎNE SEUL'], ['go', 'ATTEND LE TOP']] as const).map(([md, t]) => (
            <button key={md} className={'seg large' + (m.gate.mode === md ? ' on' : '')}
              onClick={() => modifier(p => { const x = p.ev.find(y => y.id === m.id); if (x) x.gate.mode = md; }, 'passage')}>{t}</button>
          ))}
        </div>
      </Accordeon>
      <Accordeon k="a" titre="AVANCÉ">
        <Ligne l="ATTENTE MESURÉE" v={<span className="num">{mmss(projet.hold[m.id] ?? 0)}</span>} />
        <Bouton onClick={() => modifier(p => { delete p.hold[m.id]; delete p.go[m.id]; }, 'passage')}>EFFACER L’ATTENTE</Bouton>
      </Accordeon>
    </>
  );
}

// ─── moment ───────────────────────────────────────────────────────────────────────────────────────────
function PanneauMoment({ sel }: { sel: Selection }) {
  const projet = useMagasin(s => s.projet);
  const { modifierProjet: modifier, selectionner, signaler, allerA } = useMagasin.getState();
  const i = projet.ev.findIndex(x => x.id === sel.moment), m = projet.ev[i];
  if (!m) return null;
  const mp = prevoir(projet).moments[i];
  const dernier = i >= projet.ev.length - 1;
  const couper = () => {
    const chemin = mp?.etapes ?? [];
    if (chemin.length < 2) { signaler('Ce moment n’a qu’une étape jouée : rien à couper.'); return; }
    let r: { id?: string; erreur?: string } = {};
    modifier(p => { r = couperMoment(p, m.id, chemin[Math.floor(chemin.length / 2)].id); }, 'coupe');
    const res = r as { id?: string; erreur?: string };
    if (res.erreur) signaler(res.erreur);
    else if (res.id) { selectionner({ moment: res.id }); signaler('Moment coupé en deux'); }
  };
  return (
    <>
      <div className="pn-bloc">
        <Tete tag={'MOMENT ' + (i + 1) + ' · ACTE ' + romain(m.act)} />
        <input className="pn-champ" value={m.name} aria-label="Nom du moment"
          onChange={e => { const v = e.target.value; modifier(p => { const x = p.ev.find(y => y.id === m.id); if (x) x.name = v; }, 'nom'); }} />
        <div className="pn-grille3">
          <span className="pn-stat"><span className="num v">{m.st.length}</span><span className="l">ÉTAPES</span></span>
          <span className="pn-stat"><span className="num v">{mmss(mp ? mp.fin - mp.debut : 0)}</span><span className="l">DURÉE</span></span>
          <span className="pn-stat"><span className="num v">{mmss(mp?.debut ?? 0)}</span><span className="l">DÉBUT</span></span>
        </div>
        <div className="pn-grille2">
          <Bouton onClick={nouveauMoment}>+ MOMENT APRÈS</Bouton>
          <Bouton onClick={couper}>COUPER EN DEUX</Bouton>
        </div>
      </div>
      <Accordeon k="r" titre="RÉGLAGES">
        {!dernier && (
          <>
            <span className="pn-micro">PASSAGE P{i + 1}</span>
            <div className="seg-groupe fond">
              {([['auto', 'ENCHAÎNE SEUL'], ['go', 'ATTEND LE TOP']] as const).map(([md, t]) => (
                <button key={md} className={'seg large' + (m.gate.mode === md ? ' on' : '')}
                  onClick={() => modifier(p => { const x = p.ev.find(y => y.id === m.id); if (x) x.gate.mode = md; }, 'passage')}>{t}</button>
              ))}
            </div>
          </>
        )}
        <Bouton onClick={() => allerA(m.id)}>ALLER À CE MOMENT</Bouton>
      </Accordeon>
      <Accordeon k="a" titre="AVANCÉ">
        <div className="pn-grille2">
          {i > 0 && projet.ev[i - 1].act === m.act && <Bouton onClick={() => {
            const err = appliquer(p => nouvelActeIci(p, m.id), 'nouvel acte');
            if (err) signaler(err); else selectionner({ acte: m.act + 1 });
          }}>NOUVEL ACTE ICI</Bouton>}
          {m.act > 0 && (i === 0 || projet.ev[i - 1].act !== m.act) && <Bouton onClick={() => modifier(p => joindreActeAvant(p, m.id), 'acte')}>JOINDRE À L’ACTE AVANT</Bouton>}
          {projet.ev.length > 1 && <Bouton danger onClick={() => {
            const err = appliquer(p => supprimerMoment(p, m.id), 'suppression');
            if (err) signaler(err); else selectionner({});
          }}>SUPPRIMER</Bouton>}
        </div>
      </Accordeon>
    </>
  );
}

// ─── acte ─────────────────────────────────────────────────────────────────────────────────────────────
function PanneauActe({ sel }: { sel: Selection }) {
  const projet = useMagasin(s => s.projet);
  const { modifierProjet: modifier } = useMagasin.getState();
  const a = projet.acts[sel.acte ?? -1];
  if (!a) return null;
  const prev = prevoir(projet).moments.filter((_, i) => projet.ev[i]?.act === sel.acte);
  const duree = prev.length ? prev[prev.length - 1].fin - prev[0].debut : 0;
  return (
    <>
      <div className="pn-bloc">
        <Tete tag={'ACTE ' + romain(sel.acte!)} />
        <input className="pn-champ" value={a.n} aria-label="Nom de l’acte"
          onChange={e => { const v = e.target.value; modifier(p => { const x = p.acts[sel.acte!]; if (x) x.n = v; }, 'nom'); }} />
      </div>
      <Accordeon k="r" titre="RÉGLAGES">
        <Ligne l="CONTENU" v={prev.length + ' moments · ' + mmss(duree) + ' prévues'} />
      </Accordeon>
    </>
  );
}

// ─── pistes de la conduite : piste, clip, note ────────────────────────────────────────────────────────
function PanneauPiste({ sel }: { sel: Selection }) {
  const projet = useMagasin(s => s.projet);
  const { modifierProjet: modifier, selectionner } = useMagasin.getState();
  const tk = projet.tracks.find(x => x.id === sel.piste);
  if (!tk) return null;
  const prev = prevoir(projet), debut = (ev: string) => prev.moments.find(x => x.id === ev)?.debut ?? 0;
  const nomMoment = (ev: string) => projet.ev.find(x => x.id === ev)?.name ?? '—';
  const typeTxt = (TYPES_PISTE[tk.type]?.[0] ?? 'Courbe').toUpperCase();

  if (sel.clip) {
    const c = tk.clips?.find(x => x.id === sel.clip);
    if (!c) return null;
    const pos = Math.sqrt(Math.max(0, (c.dur - 2) / 598)) * 100;
    const chemin = (p: Projet) => p.tracks.find(x => x.id === tk.id)?.clips?.find(x => x.id === c.id);
    return (
      <>
        <div className="pn-bloc">
          <Tete tag={'CLIP · ' + tk.name} />
          <input className="pn-champ" value={c.name} aria-label="Nom du clip"
            onChange={e => { const v = e.target.value; modifier(p => { const x = chemin(p); if (x) x.name = v; }, 'nom'); }} />
          <div className="pn-rotatifs">
            <Rotatif valeur={pos} couleur={`var(--piste-${tk.type})`} affichage={mmss(c.dur)} libelle="DURÉE"
              onChange={v => modifier(p => { const x = chemin(p); if (x) x.dur = Math.round(2 + Math.pow(v / 100, 2) * 598); }, 'durée de clip')} />
          </div>
        </div>
        <Accordeon k="r" titre="RÉGLAGES">
          <Ligne l="MOMENT" v={nomMoment(c.ev)} />
          <Ligne l="DÉCALAGE" v={<span className="num">+{mmss(c.off)}</span>} />
          <Ligne l="DÉBUT" v={<span className="num">{mmss(debut(c.ev) + c.off)}</span>} />
        </Accordeon>
        <Accordeon k="a" titre="AVANCÉ">
          <Bouton danger onClick={() => { modifier(p => supprimerElementPiste(p, tk.id, c.id), 'suppression'); selectionner({ piste: tk.id }); }}>SUPPRIMER LE CLIP</Bouton>
        </Accordeon>
      </>
    );
  }

  if (sel.note) {
    const n = tk.marks?.find(x => x.id === sel.note);
    if (!n) return null;
    const chemin = (p: Projet) => p.tracks.find(x => x.id === tk.id)?.marks?.find(x => x.id === n.id);
    return (
      <>
        <div className="pn-bloc">
          <Tete tag={(tk.type === 'secu' ? 'SÉCURITÉ · ' : 'NOTE · ') + mmss(debut(n.ev) + n.off)} />
          <input className="pn-champ" value={n.txt} aria-label="Texte de la note"
            onChange={e => { const v = e.target.value; modifier(p => { const x = chemin(p); if (x) x.txt = v; }, 'note'); }} />
        </div>
        <Accordeon k="r" titre="RÉGLAGES">
          <Ligne l="MOMENT" v={nomMoment(n.ev)} />
          <Ligne l="DÉCALAGE" v={<span className="num">+{mmss(n.off)}</span>} />
          {tk.type === 'secu' && (
            <div className="pn-rotatifs">
              <Rotatif valeur={(n.lead ?? 10) / 60 * 100} couleur="var(--rec)" affichage={mmss(n.lead ?? 10)} libelle="PRÉAVIS"
                onChange={v => modifier(p => { const x = chemin(p); if (x) x.lead = Math.round(v / 100 * 60); }, 'préavis')} />
            </div>
          )}
        </Accordeon>
        <Accordeon k="a" titre="AVANCÉ">
          <Bouton danger onClick={() => { modifier(p => supprimerElementPiste(p, tk.id, n.id), 'suppression'); selectionner({ piste: tk.id }); }}>SUPPRIMER LA NOTE</Bouton>
        </Accordeon>
      </>
    );
  }

  return (
    <>
      <div className="pn-bloc">
        <Tete tag={'PISTE · ' + typeTxt} />
        <input className="pn-champ" value={tk.name} aria-label="Nom de la piste"
          onChange={e => { const v = e.target.value; modifier(p => { const x = p.tracks.find(y => y.id === tk.id); if (x) x.name = v; }, 'nom'); }} />
      </div>
      <Accordeon k="r" titre="RÉGLAGES">
        <Ligne l="TYPE" v={typeTxt} />
        <Ligne l="ÉLÉMENTS" v={<span className="num">{tk.clips?.length ?? tk.marks?.length ?? Object.keys(tk.pts ?? {}).length}</span>} />
        <div className="seg-groupe fond">
          {([[true, 'OUVERTE'], [false, 'REPLIÉE']] as const).map(([o, t]) => (
            <button key={t} className={'seg large' + (tk.open === o ? ' on' : '')}
              onClick={() => modifier(p => { const x = p.tracks.find(y => y.id === tk.id); if (x) x.open = o; }, 'piste')}>{t}</button>
          ))}
        </div>
      </Accordeon>
      <Accordeon k="a" titre="AVANCÉ">
        <Bouton danger onClick={() => { modifier(p => supprimerPiste(p, tk.id), 'suppression'); selectionner({}); }}>SUPPRIMER LA PISTE</Bouton>
      </Accordeon>
    </>
  );
}

// ─── où en est-on ─────────────────────────────────────────────────────────────────────────────────────
// Se ré-exécute à la structure (étape, attente du GO…) et au quart de seconde pour le temps restant et les jauges (jamais 60 fois par seconde).
function OuEnEstOn() {
  const st = useStructure();
  const go = useMagasin(s => s.go);
  const sit = useSituationVive();
  const compte = sit.passageGo !== null && !st?.attenteGo && sit.avantPret > 0 && sit.avantPret <= 10 && !!st;
  // le GO (magasin.go) est toujours possible tant que le spectacle n'est pas terminé : un appui = un cue
  const goPossible = !!st && !st.termine;
  return (
    <div className="pn-bloc large">
      <div className="pn-tete"><span className="pn-tag">OÙ EN EST-ON</span><span className="pn-droite">{sit.tag}</span></div>
      <span className="ou-nom">{sit.nom}</span>
      <div className="ou-reste">
        <span className={'num v' + (compte ? ' compte' : '')}>{mmss(compte ? sit.avantPret : sit.reste)}</span>
        <span className="l">{compte ? 'AVANT LE TOP' : sit.resteLab}</span>
      </div>
      <span className="barre"><span style={{ width: (sit.progres * 100).toFixed(1) + '%', background: 'var(--ort)' }} /></span>
      <span className="ou-ensuite">Ensuite : <b>{sit.ensuite}</b></span>
      {sit.lignes.map((l, i) => (
        <div key={i} className="ou-ligne">
          <div className="h">
            <span className={'point' + (l.enCours ? ' pulse' : '')} style={{ background: l.ok ? 'var(--gt)' : 'var(--ort)' }} />
            <span className="lab">{l.lab}</span>
            <span className="num val">{l.val}</span>
          </div>
          <span className="barre"><span style={{ width: (l.progres * 100).toFixed(1) + '%', background: l.ok ? 'var(--gt)' : 'var(--ort)' }} /></span>
        </div>
      ))}
      {goPossible && <button className="ou-go" onClick={() => go()}>TOP · GO</button>}
      <ApercuSortie />
    </div>
  );
}

// ─── salle simulée (Préparer : elle produit les signaux de la salle) ──────────────────────────────────────────────────────────────────────────
function SalleSimulee() {
  const sens = useMagasin(s => s.projet.sens);
  const regler = useMagasin(s => s.reglerSalle);
  const v = votesSalle(sens), iss = issueSalle(sens);
  const rot: [keyof typeof sens, string][] = [['aff', 'AFFLUENCE'], ['part', 'PARTICIPATION'], ['calme', 'CALME'], ['pen', 'PENCHANT A']];
  return (
    <Accordeon k="s" titre="SALLE SIMULÉE">
      <div className="pn-grille4">
        {rot.map(([k, lab]) => (
          <Rotatif key={k} taille={34} largeur="auto" valeur={sens[k]} couleur={k === 'pen' ? 'var(--ort)' : 'var(--vert-pale)'}
            affichage={String(sens[k])} libelle={lab} onChange={x => regler(k, x)} />
        ))}
      </div>
      <Ligne l="VOTE A · B · C" v={<span className="num">{v.A} · {v.B} · {v.C}</span>} />
      <Ligne l="ISSUE" v={iss === 'A' ? 'Issue A' : iss === 'B' ? 'Issue B' : 'Égalité · tirage'} />
    </Accordeon>
  );
}

// ─── projet · versions ────────────────────────────────────────────────────────────────────────────────
function ProjetVersions() {
  const versions = useMagasin(s => s.versions);
  const executions = useMagasin(s => s.executions);
  const m = useMagasin.getState();
  const fichier = useRef<HTMLInputElement>(null);
  const dernier = executions[executions.length - 1];
  const retard = dernier ? Number(dernier.evenements.find(e => e.type === 'fin')?.retard ?? 0) : 0;
  return (
    <Accordeon k="v" titre="PROJET · VERSIONS">
      <div className="pn-grille2">
        <Bouton onClick={m.enregistrerVersion}>ENREGISTRER</Bouton>
        <Bouton onClick={m.exporter}>EXPORTER JSON</Bouton>
        <Bouton onClick={() => fichier.current?.click()}>IMPORTER JSON</Bouton>
        <Bouton onClick={m.revenirDemo}>DÉMONSTRATION</Bouton>
        <Bouton onClick={() => void chargerLive()}>SPECTACLE LIVE</Bouton>
        <Bouton onClick={() => useInterface.getState().poser({ projets: true })}>OUVRIR…</Bouton>
        <Bouton onClick={() => useInterface.getState().poser({ acteurs: true })}>ACTEURS…</Bouton>
      </div>
      <input ref={fichier} type="file" accept="application/json,.json" hidden
        onChange={async e => { const f = e.target.files?.[0]; if (f) m.importer(await f.text()); e.target.value = ''; }} />
      {versions.map((v, i) => (
        <div key={v.d + i} className="pn-version">
          <span className="corps-v">
            <span className="n">{v.n}</span>
            <span className="d">{new Date(v.d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
          </span>
          <button className="ouvrir" onClick={() => m.ouvrirVersion(i)}>OUVRIR</button>
          <button className="x" aria-label="Supprimer la version" onClick={() => m.supprimerVersion(i)}>✕</button>
        </div>
      ))}
      <Ligne l="SOIRS JOUÉS" v={executions.length ? executions.length + ' · dernier retard ' + (retard >= 0 ? '+' : '−') + mmss(Math.abs(retard)) : 'aucun'} />
    </Accordeon>
  );
}

// ─── équipe (salle collaborative) ─────────────────────────────────────────────────────────────────────
function SectionEquipe() {
  const n = useCommentairesOuverts();
  return (
    <Accordeon k="e" titre={n ? 'ÉQUIPE · ' + n : 'ÉQUIPE'}>
      <Equipe />
    </Accordeon>
  );
}

// ─── le panneau ───────────────────────────────────────────────────────────────────────────────────────
export function Panneau() {
  const sel = useMagasin(s => s.selection);
  const largeur = useInterface(s => s.largeurPanneau);
  const spectacle = useMagasin(s => s.mode === 'spectacle');
  let contenu: ReactNode = null;
  if (sel.piste) contenu = <PanneauPiste sel={sel} />;
  else if (sel.acte !== undefined) contenu = <PanneauActe sel={sel} />;
  else if (sel.moment && sel.etape) contenu = <PanneauEtape sel={sel} />;
  else if (sel.moment && sel.sortie !== undefined) contenu = <PanneauSortie sel={sel} />;
  else if (sel.moment && sel.passage) contenu = <PanneauPassage sel={sel} />;
  else if (sel.moment) contenu = <PanneauMoment sel={sel} />;
  return (
    <aside className="panneau" style={{ width: largeur }} aria-label="Panneau de la sélection">
      {spectacle && <EnCoursProchain />}
      {contenu}
      <OuEnEstOn />
      <Accordeon k="g" titre="RÉGIE">
        <PupitreRegie />
      </Accordeon>
      <SalleSimulee />
      <SectionEquipe />
      <ProjetVersions />
    </aside>
  );
}
