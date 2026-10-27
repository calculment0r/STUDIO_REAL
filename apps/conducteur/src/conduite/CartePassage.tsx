// La carte d'un passage entre deux moments : enchaîne seul (auto) ou attend le top (go), ses conditions, son attente mesurée.
import type { PlanPassage } from './planning';
import { libelleCondition } from './planning';
import { fm } from './temps';

interface Props { g: PlanPassage; suivant?: string; gauche: number; onMode: (mode: 'auto' | 'go') => void; onFermer: () => void }

export function CartePassage({ g, suivant, gauche, onMode, onFermer }: Props) {
  const go = g.g.mode === 'go';
  return (
    <div className="cd-carte" style={{ left: gauche }} onPointerDown={(e) => e.stopPropagation()}>
      <span className="tag">Passage P{g.i + 1}<button title="Fermer" onClick={onFermer}>×</button></span>
      <span className="titre">{g.ev.name.toUpperCase()} → {suivant ? suivant.toUpperCase() : 'FIN'}</span>
      <div className="cd-seg">
        <button data-on={!go ? '' : undefined} onClick={() => onMode('auto')}>ENCHAÎNE SEUL</button>
        <button data-on={go ? '' : undefined} onClick={() => onMode('go')}>ATTEND LE TOP</button>
      </div>
      {g.g.g.map((c, k) => (
        <span key={k} className="cond"><i />{libelleCondition(c)}</span>
      ))}
      {go && <span className="cond"><i data-go="" />top donné par la régie</span>}
      {!g.g.g.length && !go && <span className="cond"><i />aucune condition</span>}
      <span className="temps">PRÉVU À {fm(g.S)}{g.ready > g.S ? ' · CONDITIONS À ' + fm(g.ready) : ''}{g.hold > 0 ? ' · ATTENTE ' + fm(g.hold) : ''}</span>
    </div>
  );
}
