// Vrai pendant l'anti-rebond qui suit un GO accepté (DELAI_ANTI_DOUBLE_GO_MS) : les boutons GO affichent « GO ✓ ».
import { useEffect, useState } from 'react';
import { DELAI_ANTI_DOUBLE_GO_MS, useMagasin } from '../etat/magasin';

export function useGoRecent(): boolean {
  const dernierGo = useMagasin(s => s.dernierGo);
  const [recent, setRecent] = useState(false);
  useEffect(() => {
    const reste = dernierGo + DELAI_ANTI_DOUBLE_GO_MS - Date.now();
    if (!dernierGo || reste <= 0) { setRecent(false); return; }
    setRecent(true);
    const t = setTimeout(() => setRecent(false), reste);
    return () => clearTimeout(t);
  }, [dernierGo]);
  return recent;
}
