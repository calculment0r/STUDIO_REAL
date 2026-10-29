// Pupitre de la régie : les entrées extérieures du moteur pendant la représentation (poser une mémoire, envoyer un
// signal, reprendre à un point de reprise) et le journal compact de ce que les blocs émettent (commandes machine,
// messages, chronos, figurants), des entrées reçues et des alertes. Dans le panneau (section RÉGIE) et dans le pupitre
// de représentation (touche P). Des valeurs, des noms, des actions : pas de phrases d'aide.
import { memo, useMemo, useState, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMagasin } from '../etat/magasin';
import {
  enNombre, lireValeur, memoiresRegie, signauxAttendus, type LigneRegie, type MemoireRegie, type SignalAttendu, type ValeurMemoire,
} from '../etat/regie';
import { mmss } from '../theme/format';
import { SectionSorties } from './RailSorties';

const arreter = (e: KeyboardEvent) => e.stopPropagation();
const affiche = (v: ValeurMemoire | undefined) => (v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'oui' : 'non') : String(v));

function LigneMemoire({ m, valeur }: { m: MemoireRegie; valeur: ValeurMemoire | undefined }) {
  const poser = useMagasin(s => s.poserMemoire);
  const [saisie, setSaisie] = useState('');
  const n = enNombre(valeur);
  const borne = (x: number) => Math.min(m.max ?? Infinity, Math.max(m.min ?? -Infinity, x));
  const valider = () => { if (saisie.trim()) { poser(m.nom, m.numerique ? borne(enNombre(lireValeur(saisie))) : lireValeur(saisie)); setSaisie(''); } };
  return (
    <div className={'rg-mem' + (m.ici ? ' ici' : '')} title={m.par}>
      <div className="rg-mem-h">
        <span className={'point' + (m.ici ? ' pulse' : '')} style={{ background: m.ici ? 'var(--ort)' : m.exterieure ? 'var(--cy)' : 'var(--ink3)' }} />
        <span className="rg-nom">{m.nom}</span>
        <span className="num rg-val">{affiche(valeur)}</span>
      </div>
      <div className="rg-ctrl">
        {m.numerique && (
          <>
            <button className="rg-b" aria-label={'Diminuer ' + m.nom} onClick={() => poser(m.nom, borne(n - m.pas))}>−{m.pas}</button>
            <button className="rg-b" aria-label={'Augmenter ' + m.nom} onClick={() => poser(m.nom, borne(n + m.pas))}>+{m.pas}</button>
          </>
        )}
        {m.choix.slice(0, 4).map(c => (
          <button key={c} className={'rg-b' + (affiche(valeur) === c ? ' on' : '')} onClick={() => poser(m.nom, c)}>{c}</button>
        ))}
        <input className="rg-champ" value={saisie} placeholder="valeur" aria-label={'Valeur de ' + m.nom}
          onChange={e => setSaisie(e.target.value)} onKeyDown={e => { arreter(e); if (e.key === 'Enter') valider(); }} />
        <button className="rg-b plein" disabled={!saisie.trim()} onClick={valider}>POSER</button>
      </div>
    </div>
  );
}

function LigneSignal({ s, joue }: { s: SignalAttendu; joue: boolean }) {
  const envoyer = useMagasin(s2 => s2.envoyerSignal);
  const [texte, setTexte] = useState('');
  const etiquette = s.genre === 'accuse' ? 'ACCUSÉ' : s.genre === 'lu' ? 'LU' : s.genre === 'transcription' ? 'DIT' : 'SIGNAL';
  if (s.genre === 'transcription') {
    const dire = (t: string) => { if (t.trim()) { envoyer(s.nom, t.trim()); setTexte(''); } };
    return (
      <div className={'rg-sig' + (joue ? ' ici' : '')}>
        <span className="rg-tag">{etiquette}</span>
        <span className="rg-sig-n" title={s.etape}>{s.etape ?? s.nom}</span>
        <div className="rg-ctrl">
          {(s.mots ?? []).slice(0, 3).map(m => <button key={m} className="rg-b" onClick={() => dire(m)}>{m}</button>)}
          <input className="rg-champ" value={texte} placeholder="texte entendu" aria-label="Texte entendu"
            onChange={e => setTexte(e.target.value)} onKeyDown={e => { arreter(e); if (e.key === 'Enter') dire(texte); }} />
        </div>
      </div>
    );
  }
  return (
    <button className={'rg-sig bouton' + (joue ? ' ici' : '')} onClick={() => envoyer(s.nom)} title={s.nom}>
      <span className="rg-tag">{etiquette}</span>
      <span className="rg-sig-n">{s.etape ?? s.nom}</span>
      <span className="rg-envoi">ENVOYER</span>
    </button>
  );
}

function SignalLibre() {
  const envoyer = useMagasin(s => s.envoyerSignal);
  const [nom, setNom] = useState('');
  const go = () => { if (nom.trim()) { envoyer(nom.trim()); setNom(''); } };
  return (
    <div className="rg-ctrl">
      <input className="rg-champ large" value={nom} placeholder="signal (OSC, touche…)" aria-label="Nom du signal"
        onChange={e => setNom(e.target.value)} onKeyDown={e => { arreter(e); if (e.key === 'Enter') go(); }} />
      <button className="rg-b plein" disabled={!nom.trim()} onClick={go}>ENVOYER</button>
    </div>
  );
}

const GENRES: Record<LigneRegie['genre'], string> = { commande: 'var(--cy)', entree: 'var(--gt)', alerte: 'var(--rec)' };

export function JournalRegie({ max = 40 }: { max?: number }) {
  const journal = useMagasin(s => s.journalRegie);
  const lignes = journal.slice(-max).reverse();
  return (
    <div className="rg-journal" role="log" aria-label="Journal de régie">
      {lignes.length === 0 && <span className="rg-vide">AUCUNE COMMANDE</span>}
      {lignes.map(l => (
        <div key={l.n} className={'rg-l ' + l.genre} title={l.txt}>
          <span className="num rg-t">{mmss(l.t)}</span>
          <span className="rg-tag" style={{ color: GENRES[l.genre] }}>{l.type}</span>
          <span className="rg-txt">{l.txt}</span>
        </div>
      ))}
    </div>
  );
}

/** Le pupitre de la régie. `large` : version du pupitre de représentation (toutes les mémoires visibles). */
export const PupitreRegie = memo(function PupitreRegie({ large = false }: { large?: boolean }) {
  const projet = useMagasin(s => s.projet);
  const moment = useMagasin(s => s.lecture?.moment ?? null);
  const etape = useMagasin(s => s.lecture?.etape ?? null);
  // comparés par CONTENU (useShallow) : une lecture reçue du serveur, ou un lecteur recréé, ne ré-exécute pas le pupitre
  // quand les mémoires et les points de reprise sont les mêmes
  const memoires = useMagasin(useShallow(s => s.lecture?.memoires));
  const reprises = useMagasin(useShallow(s => s.lecture?.reprises));
  const reprendre = useMagasin(s => s.reprendreAuPoint);
  const [toutes, setToutes] = useState(large);

  const liste = useMemo(() => memoiresRegie(projet, moment), [projet, moment]);
  const signaux = useMemo(() => signauxAttendus(projet, moment, etape), [projet, moment, etape]);
  const visibles = toutes ? liste : liste.filter(m => m.ici || m.exterieure);
  const cachees = liste.length - visibles.length;
  const points = (reprises ?? []).slice().reverse();

  return (
    <div className="rg">
      <SectionSorties />
      <div className="pn-tete">
        <span className="pn-micro">MÉMOIRES · <span className="num">{liste.filter(m => m.ici).length}</span> ICI</span>
        {(cachees > 0 || (toutes && !large)) && (
          <button className="pn-fermer" onClick={() => setToutes(!toutes)}>{toutes ? 'EXTÉRIEURES' : 'TOUTES · ' + cachees}</button>
        )}
      </div>
      {visibles.length === 0 && <span className="rg-vide">AUCUNE MÉMOIRE</span>}
      {visibles.map(m => <LigneMemoire key={m.nom} m={m} valeur={memoires?.[m.nom] ?? m.initiale} />)}

      <span className="pn-micro">SIGNAUX ATTENDUS</span>
      {signaux.length === 0 && <span className="rg-vide">AUCUN DANS CE MOMENT</span>}
      {signaux.map(s => <LigneSignal key={s.nom} s={s} joue={!!etape && s.etapeId === etape} />)}
      <SignalLibre />

      <span className="pn-micro">POINTS DE REPRISE</span>
      {points.length === 0 && <span className="rg-vide">AUCUN POINT PASSÉ</span>}
      {points.slice(0, 4).map(p => (
        <button key={p.nom + p.t} className="rg-sig bouton" onClick={() => reprendre(p.nom)} title={'Restaure : ' + p.restaure}>
          <span className="num rg-t">{mmss(p.t)}</span>
          <span className="rg-sig-n">{p.nom}</span>
          <span className="rg-envoi">REPRENDRE ICI</span>
        </button>
      ))}

      <span className="pn-micro">JOURNAL DE RÉGIE</span>
      <JournalRegie max={large ? 60 : 30} />
    </div>
  );
});
