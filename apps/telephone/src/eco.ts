// Page ÉCO (sans React) : l'ordinateur de Franck sur scène. Elle est un AGENT du serveur de spectacle (`role:'agent'`,
// `acteur:'eco'`) qui enveloppe l'agent vocal ElevenLabs :
//   agent.cmd{type:'appel'}      → « Décrocher » (le micro exige un geste de la personne) puis la conversation ElevenLabs ;
//   agent.cmd{type:'raccrocher'} → fin de la conversation ;
//   agent.in : transcript{de:'eco'|'personne', texte} à chaque message, parle{actif} aux changements de mode, fin-appel{}.
// S'ouvre avec  /t/eco.html#spectacle=ws://…/ws&jeton=<jeton agent>&agent=<identifiant ElevenLabs>
// (ou VITE_ELEVENLABS_AGENT_ID à la construction : l'identifiant ne figure jamais dans le code). Le fragment est effacé de
// l'adresse après lecture. Le SDK officiel n'est chargé qu'au moment où l'appel sonne, depuis esm.sh, à une version fixée
// (voir eco-appel.ts). Sans réseau ni SDK la page reste utilisable : elle le dit et accuse « echec ».
import '@studio-real/theme/noyau.css';
import './eco.css';
import urlVenus from '@studio-real/theme/polices/venus-rising.otf?url';
import { transportWebSocket, VERSION_PROTOCOLE, type MsgAgentCmd, type TransportSpectacle } from '@studio-real/protocole';
import {
  libelleEtat, lireParametres, SuiviCommandes, transitionAppel, URL_SDK_ELEVENLABS, versParle, versTranscript,
  type EntreeAgent, type EtatAppel, type EvenementAppel, type StatutCommande,
} from './eco-appel';

declare const __VERSION_APP__: string;
declare const __BUILD_APP__: string;

/** Ce que la page utilise du SDK officiel @elevenlabs/client (typé à la main : il est chargé à l'exécution). */
interface ConversationElevenLabs { endSession(): Promise<void> }
interface SdkElevenLabs {
  Conversation: { startSession(options: Record<string, unknown>): Promise<ConversationElevenLabs> };
}

const CLE_SESSION = 'studio-real:eco';

function chargerVenus(): void {
  if (typeof FontFace === 'undefined') return;
  const face = new FontFace('Venus Rising', `url("${urlVenus}") format("opentype")`, { weight: '100 900', style: 'normal', display: 'swap' });
  face.load().then(
    () => { document.fonts.add(face); document.documentElement.dataset.venus = 'oui'; },
    () => { document.documentElement.dataset.venus = 'repli'; },
  );
}

/** Le fragment : lu dans l'adresse puis effacé (le jeton ne reste pas dans l'historique) ; gardé pour un rechargement. */
function lireFragment(): string {
  let fragment = location.hash;
  try {
    if (fragment.length > 1) {
      sessionStorage.setItem(CLE_SESSION, fragment);
      history.replaceState(null, '', location.pathname + location.search);
    } else {
      fragment = sessionStorage.getItem(CLE_SESSION) ?? '';
    }
  } catch { /* stockage indisponible : on garde ce qu'on a lu */ }
  return fragment;
}

function element<K extends keyof HTMLElementTagNameMap>(nom: K, classe: string, texte?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(nom);
  e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

function demarrer(): void {
  chargerVenus();
  const racine = document.getElementById('eco');
  if (!racine) return;
  const parametres = lireParametres(lireFragment(), import.meta.env.VITE_ELEVENLABS_AGENT_ID as string | undefined);

  // ── La page ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const entete = element('header', 'eco-tete');
  const marque = element('span', 'eco-marque', 'ÉCO');
  const liaison = element('span', 'sr-micro eco-liaison', 'régie…');
  entete.append(marque, liaison);
  const statut = element('p', 'eco-statut', libelleEtat('attente'));
  const detail = element('p', 'eco-detail');
  const decrocher = element('button', 'sr-bouton plein grand eco-bouton', 'Décrocher');
  const raccrocher = element('button', 'sr-bouton rec grand eco-bouton', 'Raccrocher');
  const parle = element('span', 'sr-micro eco-parle', 'ÉCO parle');
  const journal = element('ol', 'eco-journal');
  decrocher.type = 'button';
  raccrocher.type = 'button';
  racine.replaceChildren(entete, statut, detail, decrocher, raccrocher, parle, journal);

  // ── L'état ───────────────────────────────────────────────────────────────────────────────────────────────────────
  let etat: EtatAppel = 'attente';
  let message = parametres.problemes.join(' · ');
  let appelN: number | null = null;           // commande « appel » dont le « fait » attend la connexion
  let conversation: ConversationElevenLabs | null = null;
  let demarrage = false;
  let sdk: Promise<SdkElevenLabs> | null = null;
  let parlait: boolean | null = null;
  let cseq = 0;
  let transport: TransportSpectacle | null = null;
  const suivi = new SuiviCommandes();

  function afficher(): void {
    statut.textContent = libelleEtat(etat);
    statut.dataset.etat = etat;
    detail.textContent = message;
    decrocher.hidden = etat !== 'sonne';
    decrocher.disabled = demarrage;
    decrocher.textContent = demarrage ? 'Connexion…' : 'Décrocher';
    decrocher.classList.toggle('pret', etat === 'sonne' && !demarrage);
    raccrocher.hidden = etat !== 'en-cours' && !(etat === 'sonne' && demarrage);
    parle.hidden = !(etat === 'en-cours' && parlait === true);
  }

  function ligneJournal(de: 'eco' | 'personne', texte: string): void {
    const li = element('li', `eco-ligne ${de}`);
    li.append(element('span', 'sr-micro', de === 'eco' ? 'ÉCO' : 'Vous'), element('span', 'eco-texte', texte));
    journal.append(li);
    while (journal.children.length > 8) journal.firstElementChild?.remove();
  }

  function evenement(e: EvenementAppel): void { etat = transitionAppel(etat, e); afficher(); }

  // ── Vers le serveur ──────────────────────────────────────────────────────────────────────────────────────────────
  function envoyerIn(entree: EntreeAgent): void {
    cseq += 1;
    transport?.envoyer({ t: 'agent.in', cseq, k: entree.k, data: entree.data });
  }
  function accuser(n: number, statutAck: StatutCommande, raison?: string): void {
    suivi.noter(n, statutAck, raison);
    transport?.envoyer({ t: 'agent.ack', n, statut: statutAck, ...(raison !== undefined ? { detail: raison } : {}) });
  }

  // ── La conversation ElevenLabs ───────────────────────────────────────────────────────────────────────────────────
  function chargerSdk(): Promise<SdkElevenLabs> {
    // import() d'une adresse : le navigateur le charge à ce moment-là (et le garde pour la suite)
    sdk ??= import(/* @vite-ignore */ URL_SDK_ELEVENLABS) as Promise<SdkElevenLabs>;
    sdk.catch(() => { sdk = null; });          // un échec réseau n'est pas définitif : le prochain essai recharge
    return sdk;
  }

  function finDeConversation(raison: string, e: EvenementAppel): void {
    const avait = etat === 'sonne' || etat === 'en-cours';
    conversation = null;
    demarrage = false;
    parlait = null;
    if (avait) { evenement(e); envoyerIn({ k: 'fin-appel', data: { raison } }); } else afficher();
  }

  async function decrocherAppel(): Promise<void> {
    if (etat !== 'sonne' || demarrage) return;
    const n = appelN;
    if (!parametres.agent) { echecAppel(n, 'identifiant d\'agent ElevenLabs manquant'); return; }
    demarrage = true;
    message = '';
    afficher();
    try {
      const { Conversation } = await chargerSdk();
      conversation = await Conversation.startSession({
        agentId: parametres.agent,
        onMessage: (m: unknown) => {
          const entree = versTranscript(m);
          if (!entree) return;
          ligneJournal(entree.data.de === 'eco' ? 'eco' : 'personne', String(entree.data.texte));
          envoyerIn(entree);
        },
        onModeChange: (m: unknown) => {
          const entree = versParle(m, parlait);
          if (!entree) return;
          parlait = entree.data.actif === true;
          afficher();
          envoyerIn(entree);
        },
        onDisconnect: () => { if (etat === 'en-cours') finDeConversation('deconnecte', 'fin'); },
        onError: (m: unknown) => { message = `Erreur ElevenLabs : ${typeof m === 'string' ? m : 'voir la console'}`; afficher(); },
      });
      demarrage = false;
      if (etat === 'sonne') {
        evenement('connecte');
        if (n !== null) { accuser(n, 'fait'); appelN = null; }
      } else {
        // raccroché pendant la connexion : on ferme tout de suite
        void conversation.endSession().catch(() => undefined);
        conversation = null;
      }
    } catch (e) {
      const raison = e instanceof Error ? e.message : String(e);
      echecAppel(n, `SDK ou micro indisponible : ${raison}`.slice(0, 200));
    }
  }

  function echecAppel(n: number | null, raison: string): void {
    message = raison;
    appelN = null;
    if (n !== null) accuser(n, 'echec', raison);
    finDeConversation('echec', 'echec');
  }

  async function raccrocherAppel(): Promise<void> {
    const c = conversation;
    conversation = null;
    if (c) { try { await c.endSession(); } catch { /* déjà fermée */ } }
  }

  decrocher.addEventListener('click', () => { void decrocherAppel(); });
  raccrocher.addEventListener('click', () => { void raccrocherAppel().then(() => finDeConversation('raccroche', 'raccrocher')); });

  // ── Les commandes du serveur ─────────────────────────────────────────────────────────────────────────────────────
  function surCommande(cmd: MsgAgentCmd): void {
    if (!suivi.nouvelle(cmd.n)) {
      // rejouée à la reconnexion : on répète ce qu'on avait dit
      const d = suivi.dernier(cmd.n);
      if (d) transport?.envoyer({ t: 'agent.ack', n: cmd.n, statut: d.statut, ...(d.detail !== undefined ? { detail: d.detail } : {}) });
      return;
    }
    accuser(cmd.n, 'recu');
    if (cmd.type === 'appel') {
      if (!parametres.agent) { message = 'identifiant d\'agent ElevenLabs manquant'; afficher(); accuser(cmd.n, 'echec', message); return; }
      if (etat === 'en-cours') { accuser(cmd.n, 'fait'); return; }       // déjà en ligne
      appelN = cmd.n;
      message = '';
      evenement('appel');
      void chargerSdk().catch(() => undefined);                          // le SDK se charge pendant que ça sonne
    } else if (cmd.type === 'raccrocher') {
      void raccrocherAppel().then(() => {
        finDeConversation('raccroche', 'raccrocher');
        accuser(cmd.n, 'fait');
      });
    } else {
      accuser(cmd.n, 'refus', `type de commande inconnu pour ÉCO : ${cmd.type}`);
    }
  }

  // ── La liaison avec le serveur de spectacle ──────────────────────────────────────────────────────────────────────
  if (parametres.serveur && parametres.jeton) {
    const session = 's_eco_' + Math.random().toString(36).slice(2, 10);
    const app = { version: __VERSION_APP__, build: __BUILD_APP__ };
    transport = transportWebSocket(parametres.serveur, parametres.jeton, {
      hello: () => ({ t: 'hello', v: VERSION_PROTOCOLE, role: 'agent', acteur: 'eco', session, app, cseq }),
    });
    transport.surMessage(m => {
      if (m.t === 'agent.cmd') surCommande(m);
      else if (m.t === 'resync') transport?.renouer();
      else if (m.t === 'refus') { message = `Le serveur refuse : ${m.message}`; afficher(); }
    });
    transport.surEtat(e => {
      liaison.textContent = e.etat === 'ouvert' ? 'régie connectée' : e.etat === 'ferme' ? 'régie fermée' : 'régie…';
      liaison.dataset.etat = e.etat;
    });
  } else {
    liaison.textContent = 'hors ligne';
    liaison.dataset.etat = 'hors-ligne';
  }
  afficher();
}

demarrer();
