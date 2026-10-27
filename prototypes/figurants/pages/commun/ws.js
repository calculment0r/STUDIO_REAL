// Client WebSocket partagé par les 4 pages (contrat : ../../PROTOCOLE.md).
// - connexion sur /ws du même hôte (wss si la page est en https)
// - reconnexion avec backoff exponentiel + gigue
// - hello à chaque ouverture, puis envoi de la file d'attente
// - ping/pong toutes les 4 s : décalage d'horloge client/serveur (échantillon au plus petit aller-retour)
// - cseq : entier croissant par client (persisté en sessionStorage pour survivre à un rechargement)

/** Nom de jeton CSS reçu du serveur (ex. "--coral-2") -> "var(--coral-2)". Refuse tout le reste. */
export function couleurJeton(nom, repli = '--ink') {
  const ok = typeof nom === 'string' && /^--[a-z0-9-]{1,32}$/.test(nom);
  return 'var(' + (ok ? nom : repli) + ')';
}

export function libelleEtat(etat, detail) {
  if (etat === 'attente' && detail && detail.essai >= 1) return 'serveur non joignable, nouvel essai…';
  return ({
    connexion: 'connexion…',
    ouvert: 'connecté',
    attente: 'reconnexion…',
    indisponible: 'serveur non joignable',
  })[etat] || etat;
}

const A_GARDER = new Set(['msg', 'fig.cmd', 'fig.valide']);

export function connecter(opts) {
  const {
    role,
    pseudo: pseudoInitial,
    chemin = '/ws',
    onMessage = () => {},
    onEtat = () => {},
    onHorloge = () => {},
  } = opts;

  let pseudo = pseudoInitial;
  let ws = null;
  let essai = 0;
  let ferme = false;
  let minuteurRelance = null;
  let minuteurPing = null;
  let etat = 'connexion';
  const file = [];
  const echantillons = [];
  let horloge = { decalage: 0, rtt: null, mesure: false };

  // cseq croissant, y compris après rechargement de la page
  const cle = 'figurants.cseq.' + role;
  let cseq = Math.floor(Date.now() / 1000);
  try {
    const stocke = parseInt(sessionStorage.getItem(cle) || '0', 10);
    if (stocke >= cseq) cseq = stocke;
  } catch (e) { /* stockage indisponible : on garde la base horaire */ }

  function changerEtat(e, detail) {
    etat = e;
    onEtat(e, detail || {});
  }

  function url() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return null;
    const params = new URLSearchParams(location.search);
    const force = params.get('ws');            // ?ws=hote:port pour viser un autre serveur (test)
    const hote = force || location.host;
    if (!hote) return null;
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + hote + chemin;
  }

  function ouvert() { return ws && ws.readyState === 1; }

  function brut(obj) {
    try { ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function envoyer(obj, garder) {
    if (garder === undefined) garder = A_GARDER.has(obj.t) || (obj.t === 'asr' && obj.kind === 'final');
    if (ouvert() && brut(obj)) return true;
    if (garder) {
      file.push(obj);
      if (file.length > 100) file.shift();
    }
    return false;
  }

  function vider() {
    while (file.length && ouvert()) {
      if (!brut(file[0])) break;
      file.shift();
    }
  }

  function ping() {
    if (ouvert()) brut({ t: 'ping', tc: Date.now() });
  }

  function recevoirPong(m) {
    const maintenant = Date.now();
    const rtt = maintenant - m.tc;
    if (!(rtt >= 0) || typeof m.ts !== 'number') return;
    const decalage = m.ts - (m.tc + rtt / 2);   // heure serveur - heure client
    echantillons.push({ rtt, decalage });
    if (echantillons.length > 10) echantillons.shift();
    const meilleur = echantillons.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    horloge = { decalage: meilleur.decalage, rtt, mesure: true };
    onHorloge(horloge);
  }

  function ouvrir() {
    if (ferme) return;
    const u = url();
    if (!u) { changerEtat('indisponible', { raison: 'page ouverte sans serveur' }); return; }
    changerEtat(essai === 0 ? 'connexion' : 'attente', { essai });
    try { ws = new WebSocket(u); } catch (e) { programmerRelance(); return; }

    ws.onopen = () => {
      essai = 0;
      // jeton de régie éventuel (?jeton=… dans l'adresse), exigé quand le serveur est lancé avec JETON_REGIE
      const jeton = new URLSearchParams(location.search).get('jeton') || undefined;
      brut({ t: 'hello', role, pseudo: pseudo || undefined, jeton, tc: Date.now() });
      changerEtat('ouvert');
      vider();
      ping();
      clearInterval(minuteurPing);
      minuteurPing = setInterval(ping, 4000);
    };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'pong') { recevoirPong(m); return; }
      if (m.t === 'welcome' && typeof m.ts === 'number' && !horloge.mesure) {
        horloge = { decalage: m.ts - Date.now(), rtt: null, mesure: false };
        onHorloge(horloge);
      }
      try { onMessage(m); } catch (e) { console.error('onMessage', e); }
    };
    ws.onclose = () => {
      clearInterval(minuteurPing);
      ws = null;
      if (!ferme) programmerRelance();
    };
    ws.onerror = () => { /* onclose suit toujours */ };
  }

  function programmerRelance() {
    if (ferme) return;
    essai += 1;
    const base = Math.min(10000, 500 * Math.pow(2, Math.min(essai, 5)));
    const delai = Math.round(base * (0.75 + Math.random() * 0.5));
    changerEtat('attente', { essai, delai });
    clearTimeout(minuteurRelance);
    minuteurRelance = setTimeout(ouvrir, delai);
  }

  ouvrir();

  return {
    envoyer,
    /** message de chat (idempotent par cseq) ; persona = la régie parle à la place d'un persona */
    msg(texte, persona) {
      cseq += 1;
      try { sessionStorage.setItem(cle, String(cseq)); } catch (e) { /* rien */ }
      const m = { t: 'msg', cseq, texte };
      if (persona) m.persona = persona;
      return envoyer(m, true);
    },
    cmd(cmd) { return envoyer({ t: 'fig.cmd', cmd }, true); },
    valide(id, ok, texte) {
      const m = { t: 'fig.valide', id, ok: !!ok };
      if (texte != null) m.texte = texte;
      return envoyer(m, true);
    },
    asr(kind, texte, tc, tFinPhrase) {
      const m = { t: 'asr', kind, texte, tc: tc || Date.now() };
      if (tFinPhrase) m.tFinPhrase = tFinPhrase;
      return envoyer(m, kind === 'final');
    },
    /** son brut du micro (PCM 16 bits, 16 kHz) : trame binaire, perdue si la connexion est coupée */
    audio(buf) { if (ouvert()) { try { ws.send(buf); } catch (e) { /* rien */ } } },
    setPseudo(p) {
      pseudo = p;
      if (ouvert()) brut({ t: 'hello', role, pseudo, tc: Date.now() });
    },
    etat: () => etat,
    horloge: () => horloge,
    heureServeur: () => Date.now() + horloge.decalage,
    fermer() { ferme = true; clearTimeout(minuteurRelance); clearInterval(minuteurPing); if (ws) ws.close(); },
  };
}
