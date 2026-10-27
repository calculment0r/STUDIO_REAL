// Galerie : tous les blocs du catalogue, animés, en sombre et en clair (page de démonstration que la coquille peut ouvrir).
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ApercuBloc } from './ApercuBloc';
import { CATALOGUE, formaterReglage, sortiesExec } from './catalogue';
import { IconeBloc } from './IconeBloc';
import { fm } from './dessin';
import { palette, type ThemeApercu } from './palette';
import type { DefBloc, IdFamille } from './types';

type VueTheme = 'deux' | ThemeApercu;
type Etat = 'boucle' | 'actif' | 'repos';

const POLICE_TEXTE = 'var(--f-ui, "Chakra Petch", sans-serif)';
const POLICE_MONO = 'var(--f-mono, "Azeret Mono", ui-monospace, monospace)';
const POLICE_TITRE = 'var(--f-disp, "Venus Rising", "Chakra Petch", sans-serif)';

function Carte({ b, theme, etat, t }: { b: DefBloc; theme: ThemeApercu; etat: Etat; t: number }) {
  const C = palette(theme);
  const k = [8, b.reglages[0]?.defaut ?? 50, b.reglages[1]?.defaut ?? 50];
  const sorties = sortiesExec(b);
  const micro: CSSProperties = { fontFamily: POLICE_MONO, fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: C['--ink3'] };
  return (
    <div style={{ width: 232, boxSizing: 'border-box', padding: 8, borderRadius: 10, background: C['--panel'], boxShadow: `inset 0 0 0 1px ${C['--line']}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <IconeBloc ty={b.ty} taille={14} />
        <span style={{ fontFamily: POLICE_TITRE, fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: C['--ink'], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{b.nom}</span>
        <span style={{ ...micro, color: b.couleur[theme] }}>{b.ty}</span>
      </div>
      <div style={{ borderRadius: 7, overflow: 'hidden' }}>
        <ApercuBloc ty={b.ty} k={k} t={etat === 'actif' ? t : 0} actif={etat === 'actif'} boucle={etat === 'boucle'} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', ...micro }}>
        <span>durée {fm(58)}</span>
        {b.reglages.slice(0, 2).map((r) => <span key={r.nom}>{r.nom} {formaterReglage(r, r.defaut)}</span>)}
      </div>
      {sorties.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {sorties.map((s, i) => (
            <span key={i} style={{ ...micro, fontSize: 7.5, padding: '2px 6px', borderRadius: 999, background: C['--panel2'], color: s.nom ? C['--ink2'] : C['--ink3'] }}>
              → {s.nom || 'suite'}
            </span>
          ))}
        </div>
      )}
      {b.nouveau && <span style={{ ...micro, color: C['--or'] }}>nouveau · {b.origine ?? 'étude des 10 blocs'}</span>}
    </div>
  );
}

function Planche({ theme, etat, t, famille }: { theme: ThemeApercu; etat: Etat; t: number; famille: IdFamille | 'toutes' }) {
  const C = palette(theme);
  const groupes = CATALOGUE.familles
    .filter((f) => famille === 'toutes' || f.id === famille)
    .map((f) => ({ f, blocs: CATALOGUE.blocs.filter((b) => b.famille === f.id) }))
    .filter((g) => g.blocs.length);
  return (
    <section data-theme={theme === 'clair' ? 'light' : 'dark'} style={{ background: C['--bg'], color: C['--ink'], padding: 16, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      <div style={{ fontFamily: POLICE_MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C['--ink3'] }}>thème {theme}</div>
      {groupes.map(({ f, blocs }) => (
        <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.couleur[theme], alignSelf: 'center' }} />
            <span style={{ fontFamily: POLICE_TITRE, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase' }}>{f.nom}</span>
            <span style={{ fontFamily: POLICE_TEXTE, fontSize: 12, color: C['--ink2'] }}>{f.description}</span>
            <span style={{ fontFamily: POLICE_TITRE, fontSize: 10, color: C['--cy'], fontVariantNumeric: 'tabular-nums' }}>{blocs.length}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {blocs.map((b) => <Carte key={b.ty} b={b} theme={theme} etat={etat} t={t} />)}
          </div>
        </div>
      ))}
    </section>
  );
}

export function Galerie() {
  const [vue, setVue] = useState<VueTheme>('deux');
  const [etat, setEtat] = useState<Etat>('boucle');
  const [famille, setFamille] = useState<IdFamille | 'toutes'>('toutes');
  const [t, setT] = useState(0);

  // Un seul minuteur pour toute la page, et seulement en mode « actif » (temps de l'étape en secondes entières).
  useEffect(() => {
    if (etat !== 'actif') return;
    setT(0);
    const id = window.setInterval(() => setT((x) => (x + 1) % 60), 1000);
    return () => window.clearInterval(id);
  }, [etat]);

  const themes: ThemeApercu[] = vue === 'deux' ? ['sombre', 'clair'] : [vue];
  const nb = CATALOGUE.blocs.length;
  const nbBase = useMemo(() => CATALOGUE.blocs.filter((b) => b.base).length, []);
  const nbNouveaux = useMemo(() => CATALOGUE.blocs.filter((b) => b.nouveau).length, []);
  const C = palette('sombre');
  const bouton = (on: boolean): CSSProperties => ({
    fontFamily: POLICE_MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: on ? C['--panel3'] : 'transparent', color: on ? C['--ink'] : C['--ink3'], boxShadow: `inset 0 0 0 1px ${C['--line']}`,
  });

  return (
    <div style={{ background: C['--bg'], color: C['--ink'], minHeight: '100%', padding: 16, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: POLICE_TEXTE, boxSizing: 'border-box' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
        <h1 style={{ margin: 0, fontFamily: POLICE_TITRE, fontSize: 16, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 400 }}>Galerie des blocs</h1>
        <span style={{ fontFamily: POLICE_MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C['--ink3'], fontVariantNumeric: 'tabular-nums' }}>
          {nbBase} étapes de base · {nb - nbBase - nbNouveaux} blocs du design · {nbNouveaux} nouveaux · une seule boucle d’animation
        </span>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {(['deux', 'sombre', 'clair'] as VueTheme[]).map((v) => <button key={v} style={bouton(vue === v)} onClick={() => setVue(v)}>{v === 'deux' ? 'les deux' : v}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['boucle', 'actif', 'repos'] as Etat[]).map((v) => <button key={v} style={bouton(etat === v)} onClick={() => setEtat(v)}>{v === 'boucle' ? 'en boucle' : v === 'actif' ? 'en cours ' + fm(t) : 'au repos'}</button>)}
        </div>
        <select value={famille} onChange={(e) => setFamille(e.target.value as IdFamille | 'toutes')}
          style={{ ...bouton(false), appearance: 'auto' }}>
          <option value="toutes">toutes les familles</option>
          {CATALOGUE.familles.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
        </select>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${themes.length}, minmax(0, 1fr))`, gap: 14 }}>
        {themes.map((th) => <Planche key={th} theme={th} etat={etat} t={t} famille={famille} />)}
      </div>
    </div>
  );
}

export default Galerie;
