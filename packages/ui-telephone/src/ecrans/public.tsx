// Écrans du téléphone du PUBLIC (et écrans propres à l'application : entree, attente, merci). Transposés des écrans
// d'Écho du 27/10 (prototypes/figurants/pages/echo/) : fil de phrases et émojis, vote, choix + pourquoi, notification,
// « regardez ». La vidéo est dans video.tsx. Chaque écran est un composant pur de sa vue : il lit `vue`, il agit par
// `agir`, la machine décide (un vote par question, une phrase une fois…).
import { useState, type FormEvent } from 'react';
import { nombreReponses } from '../machine';
import { adresseImage, couleur, Etiquette, LETTRES, mmss, nombre, texte, textes, useMaintenant, type ProprietesEcran } from './communs';

// ── entree : le pseudo ─────────────────────────────────────────────────────────────────────────────────────────────

/** Pseudo : LA règle (2 à 20 caractères) est dans la machine ; ici, le champ et le geste qui débloque la vidéo et le
 *  son (iOS : play/pause sur l'unique <video> et un AudioContext, DANS le gestionnaire du toucher). */
export function EcranEntree({ vue, agir, medias }: ProprietesEcran) {
  const [valeur, setValeur] = useState(vue.pseudo ?? '');
  const soumettre = (ev: FormEvent) => {
    ev.preventDefault();
    medias.debloquer?.();
    agir({ a: 'pseudo', pseudo: valeur });
  };
  const titre = texte(vue.params, 'titre', 'Studio Real');
  return (
    <form className="tl-ecran tl-entree" onSubmit={soumettre} autoComplete="off">
      <Etiquette ton="ort">{texte(vue.params, 'etiquette', 'Studio Real · spectacle')}</Etiquette>
      <h1 className="tl-titre tl-grand">{titre}</h1>
      <label className="tl-et" htmlFor="tl-pseudo">Ton pseudo</label>
      <input
        id="tl-pseudo" className="tl-champ" type="text" minLength={2} maxLength={20} value={valeur}
        onChange={e => setValeur(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false}
        enterKeyHint="go" placeholder="@pseudo" aria-describedby="tl-pseudo-note"
      />
      <button className="tl-bouton plein" type="submit">Entrer</button>
      <p className="tl-note" id="tl-pseudo-note" role="alert">{vue.erreurPseudo ?? ''}</p>
      <p className="tl-aide">Le son reste coupé : tu pourras l’activer pendant le spectacle.</p>
    </form>
  );
}

// ── attente, regardez, merci ───────────────────────────────────────────────────────────────────────────────────────

export function EcranAttente({ vue }: ProprietesEcran) {
  const part = vue.chargement;
  return (
    <section className="tl-ecran tl-plein" aria-live="polite">
      <Etiquette ton="ort">{texte(vue.params, 'etiquette', vue.pseudo ? `@${vue.pseudo}` : 'Studio Real')}</Etiquette>
      <h2 className="tl-titre">{texte(vue.params, 'texte', 'Le spectacle va commencer')}</h2>
      <p className="tl-sous">{texte(vue.params, 'sous', 'Garde cette page ouverte.')}</p>
      {part !== null && (
        <div className="tl-chargement" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(part * 100)}
          aria-label="Préparation des vidéos">
          <i style={{ width: `${Math.round(part * 100)}%` }} />
          <span className="tl-et">{part >= 1 ? 'prêt' : `préparation ${Math.round(part * 100)} %`}</span>
        </div>
      )}
    </section>
  );
}

export function EcranRegardez({ vue }: ProprietesEcran) {
  return (
    <section className={`tl-ecran tl-plein${vue.source === 'panique' ? ' tl-panique' : ''}`} aria-live="assertive">
      <Etiquette ton="ort">{texte(vue.params, 'etiquette', 'Studio Real')}</Etiquette>
      <h2 className="tl-titre tl-grand">{texte(vue.params, 'texte', 'Regardez la scène')}</h2>
    </section>
  );
}

export function EcranMerci({ vue }: ProprietesEcran) {
  return (
    <section className="tl-ecran tl-plein">
      <h2 className="tl-titre tl-grand">{texte(vue.params, 'texte', 'Merci')}</h2>
      <p className="tl-sous">{texte(vue.params, 'sous', 'Tu peux fermer cette page.')}</p>
    </section>
  );
}

// ── phrases : le fil à toucher et les émojis ───────────────────────────────────────────────────────────────────────

export function EcranPhrases({ vue, agir }: ProprietesEcran) {
  const envoyees = new Set(vue.textes);
  const fil = textes(vue.params.phrases).filter(p => !envoyees.has(p.trim()));
  const emojis = textes(vue.params.emojis, 12).filter(e => e.length <= 16);
  const derniere = vue.textes[vue.textes.length - 1];
  return (
    <section className="tl-ecran tl-phrases">
      <div className="tl-phrases-titre"><Etiquette ton="ort">{texte(vue.params, 'titre', vue.pseudo ? `@${vue.pseudo}` : '')}</Etiquette></div>
      {fil.length ? (
        <div className="tl-fil" role="list" aria-label="Commentaires à envoyer">
          {fil.map(p => (
            <button key={p} type="button" role="listitem" className="tl-carte" onClick={() => agir({ a: 'ecrire', texte: p, phrase: true })}>{p}</button>
          ))}
        </div>
      ) : (
        <div className="tl-vide">{texte(vue.params, 'vide', 'Regarde la scène…')}</div>
      )}
      <div className="tl-envoye" aria-live="polite">{derniere ? `envoyé : ${derniere}` : ''}</div>
      {emojis.length > 0 && (
        <nav className="tl-emojis" aria-label="Émojis">
          {emojis.map(e => (
            <button key={e} type="button" className="tl-emoji" aria-label={`envoyer ${e}`} onClick={() => agir({ a: 'reagir', emoji: e })}>{e}</button>
          ))}
        </nav>
      )}
    </section>
  );
}

// ── vote : 2 à 6 réponses, un vote par question ────────────────────────────────────────────────────────────────────

export function EcranVote({ vue, agir }: ProprietesEcran) {
  const reponses = textes(vue.params.reponses, 6);
  const nb = nombreReponses(vue.params);
  const ferme = vue.params.ferme === true;
  const choisi = vue.vote;
  const numero = nombre(vue.params, 'numero');
  return (
    <section className="tl-ecran tl-vote" aria-live="polite">
      <Etiquette ton="ort">{texte(vue.params, 'etiquette', numero !== null ? `Question ${numero}` : 'Ton avis')}</Etiquette>
      {texte(vue.params, 'question') && <p className="tl-question">{texte(vue.params, 'question')}</p>}
      <div className="tl-reponses">
        {Array.from({ length: nb }, (_, i) => (
          <button
            key={i} type="button" className={`tl-reponse${choisi === i ? ' choisie' : ''}`}
            disabled={ferme || choisi !== null} aria-pressed={choisi === i}
            onClick={() => agir({ a: 'voter', index: i })}
          >
            <b className="tl-lettre">{LETTRES[i]}</b>
            <span>{reponses[i] ?? `Réponse ${LETTRES[i]}`}</span>
          </button>
        ))}
      </div>
      <p className="tl-etat-vote">{choisi !== null ? 'Vote enregistré ✓' : ferme ? 'Vote fermé' : 'Touche ta réponse'}</p>
    </section>
  );
}

// ── texte : question ouverte, champ, chrono ────────────────────────────────────────────────────────────────────────

export function EcranTexte({ vue, agir }: ProprietesEcran) {
  const [valeur, setValeur] = useState('');
  const duree = nombre(vue.params, 'duree');
  const envoye = vue.textes[0];
  const maintenant = useMaintenant(vue.recue, duree !== null && !envoye, 500);
  const reste = duree !== null ? duree - (maintenant - vue.recue) / 1000 : null;
  const echu = reste !== null && reste <= 0;
  const max = Math.min(2000, Math.max(1, nombre(vue.params, 'max') ?? 280));
  const soumettre = (ev: FormEvent) => {
    ev.preventDefault();
    if (valeur.trim()) agir({ a: 'ecrire', texte: valeur });
  };
  return (
    <form className="tl-ecran tl-texte" onSubmit={soumettre} autoComplete="off">
      <div className="tl-ligne">
        <Etiquette ton="ort">{texte(vue.params, 'etiquette', 'Ta réponse')}</Etiquette>
        {reste !== null && <span className={`tl-chrono chiffres${echu ? ' echu' : ''}`} aria-label="temps restant">{mmss(reste)}</span>}
      </div>
      <p className="tl-question">{texte(vue.params, 'question')}</p>
      {envoye ? (
        <>
          <blockquote className="tl-citation">{envoye}</blockquote>
          <p className="tl-etat-vote">Réponse envoyée ✓</p>
        </>
      ) : (
        <>
          <textarea
            className="tl-champ tl-zone" maxLength={max} rows={4} value={valeur} disabled={echu}
            onChange={e => setValeur(e.target.value)} placeholder={texte(vue.params, 'indice', 'Écris ici…')} aria-label="Ta réponse"
          />
          <button className="tl-bouton plein" type="submit" disabled={echu || !valeur.trim()}>{echu ? 'Temps écoulé' : 'Envoyer'}</button>
        </>
      )}
    </form>
  );
}

// ── choix : abonne / désabonne, puis pourquoi, puis merci ──────────────────────────────────────────────────────────

export function EcranChoix({ vue, agir }: ProprietesEcran) {
  const [valeur, setValeur] = useState('');
  const compte = texte(vue.params, 'compte', '');
  if (!vue.choix) {
    return (
      <section className="tl-ecran tl-plein tl-choix">
        {compte && <Etiquette ton="ort">{compte}</Etiquette>}
        <h2 className="tl-titre tl-grand">{texte(vue.params, 'question', 'Et toi ?')}</h2>
        <button type="button" className="tl-bouton plein tl-gros" onClick={() => agir({ a: 'choisir', choix: 'abonne' })}>
          {texte(vue.params, 'abonne', 'Abonnez-vous à son compte')}
        </button>
        <button type="button" className="tl-bouton tl-gros" onClick={() => agir({ a: 'choisir', choix: 'desabonne' })}>
          {texte(vue.params, 'desabonne', 'Désabonnez-vous de son compte')}
        </button>
      </section>
    );
  }
  if (!vue.textes.length) {
    const abonne = vue.choix === 'abonne';
    return (
      <form className="tl-ecran tl-plein tl-choix" autoComplete="off" onSubmit={ev => { ev.preventDefault(); if (valeur.trim()) agir({ a: 'ecrire', texte: valeur }); }}>
        <Etiquette ton="ort">{abonne ? 'tu t’abonnes' : 'tu te désabonnes'}</Etiquette>
        <h2 className="tl-titre">{abonne ? 'Pourquoi tu t’abonnes ?' : 'Pourquoi tu te désabonnes ?'}</h2>
        <textarea className="tl-champ tl-zone" maxLength={160} rows={4} value={valeur} onChange={e => setValeur(e.target.value)}
          placeholder="Écris ta raison…" aria-label="Pourquoi" />
        <button className="tl-bouton plein tl-gros" type="submit" disabled={!valeur.trim()}>Envoyer</button>
      </form>
    );
  }
  return (
    <section className="tl-ecran tl-plein tl-choix">
      <h2 className="tl-titre tl-grand">Merci.</h2>
      <p className="tl-sous">{texte(vue.params, 'merci', 'Ta réponse est sur le grand écran. Lève les yeux.')}</p>
    </section>
  );
}

// ── notification : plein écran façon système ───────────────────────────────────────────────────────────────────────

export function EcranNotification({ vue, agir }: ProprietesEcran) {
  const logo = adresseImage(vue.params.logo);
  const nomApp = texte(vue.params, 'titre', texte(vue.params, 'app', 'Notification'));
  const bouton = texte(vue.params, 'bouton', '');
  const touche = vue.touches.includes('bouton');
  return (
    <section className="tl-ecran tl-notification" role="alertdialog" aria-label={nomApp}>
      <div className="tl-notif-carte">
        <div className="tl-notif-tete">
          {logo ? <img className="tl-notif-logo" src={logo} alt="" /> : <span className="tl-notif-logo tl-notif-initiale" aria-hidden="true">{(texte(vue.params, 'logo') || nomApp).slice(0, 2)}</span>}
          <span className="tl-notif-app">{nomApp}</span>
          <span className="tl-notif-heure">maintenant</span>
        </div>
        <p className="tl-notif-texte">{texte(vue.params, 'texte')}</p>
        {texte(vue.params, 'detail') && <p className="tl-notif-detail">{texte(vue.params, 'detail')}</p>}
      </div>
      {bouton && (
        <button type="button" className="tl-bouton plein tl-gros" disabled={touche} onClick={() => agir({ a: 'toucher', cible: 'bouton' })}>
          {touche ? '✓' : bouton}
        </button>
      )}
    </section>
  );
}

// ── couleur, noir, image, image-onde ───────────────────────────────────────────────────────────────────────────────

export function EcranCouleur({ vue }: ProprietesEcran) {
  const t = texte(vue.params, 'texte');
  return (
    <section className="tl-ecran tl-aplat" style={{ background: couleur(vue.params.couleur), color: couleur(vue.params.encre, '--ink') }}
      aria-label={t || 'couleur'}>
      {t && <h2 className="tl-titre tl-grand">{t}</h2>}
    </section>
  );
}

export function EcranNoir(_: ProprietesEcran) {
  return <section className="tl-ecran tl-noir" aria-label="écran noir" />;
}

export function EcranImage({ vue }: ProprietesEcran) {
  const src = adresseImage(vue.params.src) ?? adresseImage(vue.params.image);
  const legende = texte(vue.params, 'legende');
  return (
    <figure className="tl-ecran tl-image">
      {src ? <img src={src} alt={legende} /> : <span className="tl-et">image absente</span>}
      {legende && <figcaption>{legende}</figcaption>}
    </figure>
  );
}

/** Visage et onde audio (le discours du président) : l'onde est une animation, le son passe sur scène. */
export function EcranImageOnde({ vue }: ProprietesEcran) {
  const src = adresseImage(vue.params.image) ?? adresseImage(vue.params.src);
  const legende = texte(vue.params, 'legende');
  return (
    <section className="tl-ecran tl-plein tl-image-onde">
      {src ? <img className="tl-visage" src={src} alt={legende} /> : <span className="tl-visage tl-visage-vide" aria-hidden="true" />}
      <div className="tl-onde" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 137) % 900}ms` }} />)}
      </div>
      {legende && <p className="tl-sous">{legende}</p>}
    </section>
  );
}
