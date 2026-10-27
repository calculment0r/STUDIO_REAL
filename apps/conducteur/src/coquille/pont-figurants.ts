// Pont vers le serveur du spectacle (prototype figurants : téléphones du public, mur, vote, audio) : à chaque moment
// où entre la lecture (top de la régie), le Conducteur envoie les commandes posées dans l'étape (params.cmds).
// Adresse et jeton de la régie : ?figurants=wss://…/ws&jeton_regie=… une fois dans l'adresse, puis retenus dans ce
// navigateur (jamais dans le dépôt).
import { useMagasin } from '../etat/magasin';

const CLE = 'studio-real:pont-figurants';

export function demarrerPontFigurants(): void {
  let conf: { url: string; jeton: string } | null = null;
  try {
    const q = new URLSearchParams(location.search);
    const url = q.get('figurants'), jeton = q.get('jeton_regie');
    if (url && jeton) localStorage.setItem(CLE, JSON.stringify({ url, jeton }));
    conf = JSON.parse(localStorage.getItem(CLE) || 'null');
  } catch { /* stockage indisponible */ }
  if (!conf?.url || !conf.jeton) return;
  const { url, jeton } = conf;

  let ws: WebSocket | null = null;
  const signaler = (t: string) => useMagasin.getState().signaler(t);
  const ouvrir = () => {
    ws = new WebSocket(url);
    ws.onopen = () => { ws?.send(JSON.stringify({ t: 'hello', role: 'regie', pseudo: 'conducteur', jeton, tc: Date.now() })); signaler('Spectacle relié : téléphones, mur et vote suivent les tops'); };
    ws.onclose = () => { ws = null; setTimeout(ouvrir, 2000); };
    ws.onerror = () => { try { ws?.close(); } catch { /* rien */ } };
  };
  ouvrir();

  let dernier: string | null = null;
  useMagasin.subscribe((s) => {
    const m = s.lecture?.moment ?? null;
    if (!m || m === dernier) return;
    dernier = m;
    const mo = s.projet.ev.find((x) => x.id === m);
    const cmds = (mo?.st[0]?.params as { cmds?: unknown[] } | undefined)?.cmds;
    if (!Array.isArray(cmds) || !cmds.length) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) { signaler('⚠ Spectacle NON relié : commandes de « ' + mo?.name + ' » non envoyées'); return; }
    for (const c of cmds) ws.send(JSON.stringify(c));
  });
}
