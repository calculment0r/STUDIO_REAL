// Écrans des téléphones NOMMÉS (rapport 1 §4.4, catalogue des acteurs) : le comédien (`prompteur`, `visio-appel`,
// `veille`) et le téléphone de scène de la ministre (`veille`, `vote-compteur`, `visio-appel`, `image`). Transposés de
// prototypes/figurants/pages/eco (prompteur de Franck) et pages/ministre (veille et compteurs).
import { useEffect, useRef } from 'react';
import { Etiquette, LETTRES, mmss, nombre, nombres, texte, textes, useMaintenant, type ProprietesEcran } from './communs';

// ── prompteur : les questions, celle de la régie mise en avant ────────────────────────────────────────────────────

interface QuestionPrompteur { numero: number; texte: string }

/** `params.questions` : [{numero, texte}] ou des textes (numérotés 1, 2, 3…) ; `params.texte` : un seul texte ;
 *  `params.enAvant` : numéro mis en avant par la régie (le comédien peut aussi toucher une question). */
function questionsDe(params: Record<string, unknown>): QuestionPrompteur[] {
  const brut = Array.isArray(params.questions) ? params.questions.slice(0, 50) : [];
  const out: QuestionPrompteur[] = [];
  brut.forEach((q, i) => {
    if (typeof q === 'string' && q.trim()) out.push({ numero: i + 1, texte: q.slice(0, 2000) });
    else if (q && typeof q === 'object') {
      const o = q as Record<string, unknown>;
      const t = typeof o.texte === 'string' ? o.texte.slice(0, 2000) : '';
      const n = typeof o.numero === 'number' && Number.isFinite(o.numero) ? o.numero : i + 1;
      if (t.trim()) out.push({ numero: n, texte: t });
    }
  });
  if (!out.length && texte(params, 'texte')) out.push({ numero: nombre(params, 'numero') ?? 1, texte: texte(params, 'texte') });
  return out;
}

export function EcranPrompteur({ vue, agir }: ProprietesEcran) {
  const questions = questionsDe(vue.params);
  const enAvant = vue.enAvant ?? nombre(vue.params, 'enAvant');
  const liste = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = liste.current?.querySelector<HTMLElement>('.tl-prompteur-q.active');
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [enAvant, vue.vseq]);
  return (
    <section className="tl-ecran tl-prompteur">
      <div className="tl-ligne">
        <span className="tl-titre">{texte(vue.params, 'titre', 'Prompteur')}</span>
        <Etiquette ton={vue.enLigne ? 'cy' : 'ort'}>{vue.enLigne ? 'régie connectée' : 'régie : reconnexion…'}</Etiquette>
      </div>
      <div className="tl-prompteur-liste" ref={liste}>
        {questions.length === 0 && <p className="tl-sous">En attente du texte.</p>}
        {questions.map(q => (
          <button
            key={`${q.numero}-${q.texte.slice(0, 20)}`} type="button"
            className={`tl-prompteur-q${q.numero === enAvant ? ' active' : ''}`} aria-current={q.numero === enAvant}
            onClick={() => agir({ a: 'toucher', cible: `question:${q.numero}` })}
          >
            <span className="tl-prompteur-num">Question {q.numero}</span>
            <span className="tl-prompteur-texte">{q.texte}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ── vote-compteur : la question, les compteurs qui montent, le résultat ────────────────────────────────────────────

/** `scores` : totaux à atteindre en `duree` secondes depuis l'arrivée de la vue (le vote du spectacle) ; ou `comptes`
 *  (valeurs en direct) ; `revele` + `resultat` : la phrase de résultat ; `question`, `numero`, `nb`. */
export function EcranVoteCompteur({ vue }: ProprietesEcran) {
  const direct = Array.isArray(vue.params.comptes);
  const cibles = nombres(direct ? vue.params.comptes : vue.params.scores, 6);
  const nb = Math.max(cibles.length, Math.min(6, Math.max(2, nombre(vue.params, 'nb') ?? (cibles.length || 4))));
  const duree = direct ? 0 : Math.max(0, nombre(vue.params, 'duree') ?? 0);
  const revele = vue.params.revele === true;
  const maintenant = useMaintenant(vue.recue, duree > 0 && !revele, 250);
  const part = revele || duree === 0 ? 1 : Math.min(1, Math.max(0, (maintenant - vue.recue) / (duree * 1000)));
  const valeurs = Array.from({ length: nb }, (_, i) => Math.round((cibles[i] ?? 0) * part));
  const max = Math.max(1, ...valeurs);
  const total = nombre(vue.params, 'total') ?? valeurs.reduce((a, b) => a + b, 0);
  const numero = nombre(vue.params, 'numero');
  const resultat = texte(vue.params, 'resultat');
  const fmt = (n: number) => n.toLocaleString('fr-FR');
  return (
    <section className={`tl-ecran tl-compteur${revele ? ' revele' : ''}`}>
      <Etiquette ton="ort">{numero !== null ? `Question ${numero}` : 'Vote'}{texte(vue.params, 'de') ? ` · ${texte(vue.params, 'de')}` : ''}</Etiquette>
      {!revele && texte(vue.params, 'question') && <p className="tl-question">{texte(vue.params, 'question')}</p>}
      <div className="tl-compteur-lignes">
        {valeurs.map((v, i) => (
          <div key={i} className="tl-compteur-ligne">
            <span className="tl-lettre">{LETTRES[i]}</span>
            <div className="tl-piste"><i style={{ width: `${Math.round((v / max) * 100)}%` }} /></div>
            <span className="tl-nb chiffres">{fmt(v)}</span>
          </div>
        ))}
      </div>
      <div className="tl-total"><span className="tl-et">total</span><b className="chiffres">{fmt(total)}</b></div>
      {revele && resultat && <p className="tl-resultat">{resultat}</p>}
    </section>
  );
}

// ── veille ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export function EcranVeille({ vue }: ProprietesEcran) {
  const maintenant = useMaintenant(vue.recue, true, 10_000);
  const heure = maintenant ? new Date(maintenant).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
  return (
    <section className="tl-ecran tl-plein tl-veille">
      <span className="tl-veille-heure chiffres">{heure}</span>
      <div className="tl-veille-logo">{texte(vue.params, 'texte', texte(vue.params, 'logo', 'Studio Real'))}</div>
      {texte(vue.params, 'sous') && <div className="tl-et">{texte(vue.params, 'sous')}</div>}
    </section>
  );
}

// ── visio-appel : l'écran d'appel (la visio réelle, WebRTC, est un autre lot) ─────────────────────────────────────

/** `nom` (qui appelle), `vers` (postes de l'appel), `sonnerie`. État : sonne → en cours (place du flux) → fini. */
export function EcranVisioAppel({ vue, agir }: ProprietesEcran) {
  const nom = texte(vue.params, 'nom', texte(vue.params, 'de', 'Appel vidéo'));
  const vers = textes(vue.params.vers, 6);
  const debut = useRef<number | null>(null);
  const enCours = vue.appel === 'en-cours';
  const maintenant = useMaintenant(vue.recue, enCours, 1000);
  if (enCours && debut.current === null) debut.current = maintenant;
  if (vue.appel === 'fini') {
    return (
      <section className="tl-ecran tl-plein tl-visio">
        <Etiquette ton="ink3">appel terminé</Etiquette>
        <h2 className="tl-titre">{nom}</h2>
      </section>
    );
  }
  return (
    <section className={`tl-ecran tl-visio${enCours ? ' en-cours' : ' sonne'}`}>
      <div className="tl-visio-tete">
        <Etiquette ton="cy">{enCours ? `en cours · ${mmss((maintenant - (debut.current ?? maintenant)) / 1000)}` : 'appel entrant'}</Etiquette>
        <h2 className="tl-titre">{nom}</h2>
        {vers.length > 0 && <span className="tl-et">avec {vers.join(' · ')}</span>}
      </div>
      <div className="tl-visio-flux" aria-label="flux vidéo de l’appel">
        <span className="tl-et">{enCours ? 'flux vidéo (lot visio)' : ''}</span>
      </div>
      <div className="tl-visio-boutons">
        {!enCours && (
          <button type="button" className="tl-rond repondre" onClick={() => agir({ a: 'appel', geste: 'repondre' })} aria-label="Répondre">Répondre</button>
        )}
        <button type="button" className="tl-rond raccrocher" onClick={() => agir({ a: 'appel', geste: 'raccrocher' })} aria-label="Raccrocher">Raccrocher</button>
      </div>
    </section>
  );
}
