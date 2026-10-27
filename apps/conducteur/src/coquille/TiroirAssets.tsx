// Tiroir des assets (Ctrl+Espace) : catalogue par catégories, recherche, glisser vers la planche ou la conduite.
// Le glisser est le glisser-déposer natif : type MIME TYPE_ASSET, charge JSON { cat, nom, dur }. PLANCHE et CONDUITE
// peuvent l'accepter eux-mêmes (ils appellent alors preventDefault() sur le dépôt) ; sinon la coquille le pose
// (voir deposerAsset dans App.tsx).
import { useState } from 'react';
import { useMagasin } from '../etat/magasin';
import { PICTO_ASSET, couleurAsset } from '../etat/assets';
import { mmss } from '../theme/format';
import { useInterface } from './interface';
import { CHEVRON, Picto, Poignee, Points } from './icones';

export const TYPE_ASSET = 'application/x-studio-real-asset';
export interface AssetGlisse { cat: string; nom: string; dur: number }

export function TiroirAssets() {
  const assets = useMagasin(s => s.assets);
  const ouvert = useInterface(s => s.tiroir);
  const basculer = useInterface(s => s.basculer);
  const [q, setQ] = useState('');
  const [ouverts, setOuverts] = useState<Record<string, boolean>>({ son: true, lx: true });
  const aq = q.trim().toLowerCase();
  let total = 0;
  const cats = assets.map(cat => {
    const items = cat.items.filter(it => !aq || it[0].toLowerCase().includes(aq));
    total += items.length;
    return { cat, items, ouverte: aq ? items.length > 0 : !!ouverts[cat.k] };
  }).filter(c => !aq || c.items.length);

  return (
    <div className={'tiroir' + (ouvert ? ' ouvert' : '')}>
      <div className="tir-panneau">
        <div className="tir-tete">
          <div className="pn-tete">
            <span className="tir-titre">ASSETS</span>
            <span className="tir-compte"><span className="num">{total}</span> ÉLÉMENTS · CTRL+ESPACE</span>
          </div>
          <input className="pn-champ" style={{ height: 32, fontSize: 12.5 }} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Chercher un son, une mémoire…" tabIndex={ouvert ? 0 : -1} />
          <span className="tir-aide">Glisser vers la planche pour créer une étape, vers une piste pour poser un clip.</span>
        </div>
        <div className="tir-liste">
          {cats.map(({ cat, items, ouverte }) => {
            const col = couleurAsset(cat.k);
            return (
              <div key={cat.k}>
                <div className={'tir-cat' + (ouverte ? ' ouvert' : '')} onClick={() => setOuverts(o => ({ ...o, [cat.k]: !o[cat.k] }))}>
                  <span className={'pn-chev' + (ouverte ? ' chev-on' : '')}>{CHEVRON}</span>
                  <span className="tir-ic" style={{ boxShadow: 'inset 0 0 0 1px ' + col, color: col }}><Picto d={PICTO_ASSET[cat.k] ?? PICTO_ASSET.img} /></span>
                  <span className="tir-nom">{cat.n}</span>
                  <span className="num tir-n">{items.length}</span>
                </div>
                {ouverte && (
                  <div className="tir-items">
                    {items.map(it => (
                      <div key={it[0]} className="tir-item" draggable title="Glisser vers la planche ou une piste"
                        onDragStart={e => {
                          const a: AssetGlisse = { cat: cat.k, nom: it[0], dur: it[2] || 30 };
                          e.dataTransfer.setData(TYPE_ASSET, JSON.stringify(a));
                          e.dataTransfer.setData('text/plain', it[0]);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}>
                        <span className="tir-tuile" style={{ color: col }}><Picto d={PICTO_ASSET[cat.k] ?? PICTO_ASSET.img} taille={12} /></span>
                        <span className="tir-txt"><span className="n">{it[0]}</span><span className="m">{it[1]}</span></span>
                        <span className="num tir-dur">{it[2] ? mmss(it[2]) : ''}</span>
                        <Poignee />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <button className="tir-onglet" onClick={() => basculer('tiroir')} title="Assets · Ctrl + Espace" aria-expanded={ouvert}>
        <Points /><span className="v">ASSETS · CTRL+ESPACE</span><Points />
      </button>
    </div>
  );
}
