// Recherche (loupe de l'en-tête, Ctrl+K) : moments, étapes, clips, notes et assets. ↑ ↓ choisir · Entrée ouvrir ·
// Échap fermer. Reprend la fenêtre du design (Studio Real Conducteur.dc.html, `srchOn`).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMagasin } from '../etat/magasin';
import { prevoir } from '../etat/moteur';
import { couleurAsset } from '../etat/assets';
import { couleurPiste } from '../conduite/types-pistes';
import { mmss, romain } from '../theme/format';
import { useInterface } from './interface';
import { infoBloc } from './derive';

interface Resultat { t: string; sous: string; genre: string; couleur: string; go: () => void }

export function Recherche() {
  const ouvert = useInterface(s => s.recherche);
  const poser = useInterface(s => s.poser);
  const projet = useMagasin(s => s.projet);
  const assets = useMagasin(s => s.assets);
  const clair = useMagasin(s => s.theme) === 'clair';
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const champ = useRef<HTMLInputElement>(null);

  // Ctrl+K ouvre ou ferme la recherche, partout
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const ui = useInterface.getState();
        ui.poser({ recherche: !ui.recherche });
      }
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, []);
  useEffect(() => { if (ouvert) { setQ(''); setI(0); setTimeout(() => champ.current?.focus(), 30); } }, [ouvert]);

  const tous = useMemo<Resultat[]>(() => {
    if (!ouvert) return [];
    const fermer = () => poser({ recherche: false });
    const versPlanche = () => { if (useInterface.getState().vue === 'tracks') poser({ vue: 'both' }); };
    const versConduite = () => { if (useInterface.getState().vue === 'board') poser({ vue: 'both' }); };
    const prev = prevoir(projet);
    const debut: Record<string, number> = {};
    prev.moments.forEach(m => { debut[m.id] = m.debut; });
    const r: Resultat[] = [];
    projet.ev.forEach((ev, i) => {
      const acte = 'Acte ' + romain(ev.act) + ' · ' + (projet.acts[ev.act]?.n ?? '');
      r.push({
        t: ev.name, sous: 'Moment ' + (i + 1) + ' · ' + acte, genre: 'MOMENT', couleur: 'var(--rampe-' + ((ev.act % 5) + 1) + ')',
        go: () => { fermer(); versPlanche(); const s = useMagasin.getState(); s.allerA(ev.id); s.cadrerMoment(ev.id); },
      });
      ev.st.forEach(st => {
        const b = infoBloc(st.ty, clair);
        r.push({
          t: st.name, sous: b.nom + ' · ' + ev.name, genre: 'ÉTAPE', couleur: b.couleur,
          go: () => { fermer(); versPlanche(); useMagasin.getState().selectionner({ moment: ev.id, etape: st.id }); },
        });
      });
    });
    projet.tracks.forEach(tk => {
      const c = couleurPiste(tk);
      (tk.clips ?? []).forEach(cl => r.push({
        t: cl.name, sous: tk.name + ' · ' + mmss((debut[cl.ev] ?? 0) + cl.off), genre: 'CLIP', couleur: c,
        go: () => { fermer(); versConduite(); useMagasin.getState().selectionner({ piste: tk.id, clip: cl.id }); },
      }));
      (tk.marks ?? []).forEach(mk => r.push({
        t: mk.txt, sous: tk.name + ' · ' + mmss((debut[mk.ev] ?? 0) + mk.off), genre: tk.type === 'secu' ? 'ALERTE' : 'NOTE', couleur: c,
        go: () => { fermer(); versConduite(); useMagasin.getState().selectionner({ piste: tk.id, note: mk.id }); },
      }));
    });
    assets.forEach(cat => cat.items.forEach(it => r.push({
      t: it[0], sous: cat.n, genre: 'ASSET', couleur: couleurAsset(cat.k),
      go: () => { fermer(); poser({ tiroir: true }); },
    })));
    return r;
  }, [ouvert, projet, assets, clair, poser]);

  if (!ouvert) return null;
  const qq = q.toLowerCase().trim();
  const res = (qq ? tous.filter(x => (x.t + ' ' + x.sous + ' ' + x.genre).toLowerCase().includes(qq)) : tous).slice(0, 40);
  const si = Math.max(0, Math.min(i, res.length - 1));

  return (
    <div className="rch-fond" onPointerDown={() => poser({ recherche: false })}>
      <div className="rch" role="dialog" aria-label="Rechercher" onPointerDown={e => e.stopPropagation()}>
        <input ref={champ} value={q} placeholder="Chercher une étape, un moment, un clip, une note, un asset…"
          onChange={e => { setQ(e.target.value); setI(0); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(res.length - 1, si + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(0, si - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); res[si]?.go(); }
            else if (e.key === 'Escape') { e.preventDefault(); poser({ recherche: false }); }
            e.stopPropagation();
          }} />
        <div className="rch-liste">
          {res.map((x, k) => (
            <div key={k} className={'rch-ligne' + (k === si ? ' on' : '')} onClick={x.go} onPointerEnter={() => setI(k)}>
              <span className="pt" style={{ background: x.couleur }} />
              <span className="txt"><span className="t">{x.t}</span><span className="s">{x.sous}</span></span>
              <span className="g">{x.genre}</span>
            </div>
          ))}
          {!res.length && <span className="rch-vide">Aucun résultat.</span>}
        </div>
        <span className="rch-pied">↑ ↓ CHOISIR · ENTRÉE OUVRIR · ÉCHAP FERMER</span>
      </div>
    </div>
  );
}
