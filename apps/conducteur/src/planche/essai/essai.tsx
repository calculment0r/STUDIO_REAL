// Banc d'essai de la planche seule (développement) : http://localhost:5173/src/planche/essai/
// Simule une lecture qui parcourt le spectacle de démonstration pour vérifier le suivi caméra et les états.
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../theme/index.css';
import { useMagasin } from '../../etat/magasin';
import { Planche } from '../Planche';

function Banc() {
  const mode = useMagasin(s => s.mode);
  const [marche, setMarche] = useState(false);
  useEffect(() => {
    if (!marche) return;
    const ev = useMagasin.getState().projet.ev;
    const chemin: [string, string][] = ev.flatMap(m => m.st.filter(e => !e.id.startsWith('iss') && e.id !== 'tir' && e.id !== 'jeuB').map(e => [m.id, e.id] as [string, string]));
    let i = 0, tE = 0, t = 0;
    const parcours: [string, string, number][] = [[chemin[0][0], chemin[0][1], 0]];
    const id = setInterval(() => {
      tE += 1; t += 1;
      if (tE > 12) { i = (i + 1) % chemin.length; tE = 0; parcours.push([chemin[i][0], chemin[i][1], t]); }
      useMagasin.setState({ lecture: { t, moment: chemin[i][0], etape: chemin[i][1], tEtape: tE, attenteGo: false, retard: 0, bloque: tE > 9, termine: false, memoires: {}, parcours: parcours.slice() } });
    }, 250);
    return () => clearInterval(id);
  }, [marche]);
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--ink)' }}>
      <div style={{ display: 'flex', gap: 8, padding: 8 }}>
        {(['preparer', 'jouer'] as const).map(m => <button key={m} onClick={() => useMagasin.getState().changerMode(m)} style={{ fontWeight: mode === m ? 700 : 400 }}>{m}</button>)}
        <button onClick={() => setMarche(v => !v)}>{marche ? 'arrêter' : 'lecture simulée'}</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}><Planche /></div>
    </div>
  );
}

createRoot(document.getElementById('racine')!).render(<StrictMode><Banc /></StrictMode>);
