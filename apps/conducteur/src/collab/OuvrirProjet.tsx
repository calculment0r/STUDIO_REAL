// <OuvrirProjet /> : ouvrir un projet du serveur (liste, ou identifiant + jeton), en créer un, importer un fichier,
// charger le projet du spectacle LIVE (projets/live/live.conducteur.json). Le nom de la personne et son rôle se
// règlent ici. Les jetons saisis sont gardés dans ce navigateur (localStorage), jamais dans le code.
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { FichierConducteur } from '@studio-real/modele';
import { useMagasin } from '../etat/magasin';
import { lireFichier } from '../etat/persistance';
import {
  ClientApi, changerIdentite, connecterSalle, deconnecterSalle, ErreurApi, identite, jetonAdmin, jetonProjet,
  memoriserJeton, memoriserJetonAdmin, urlServeur, useSalle, type ResumeProjet,
} from '../etat/serveur';
import type { Role } from './protocole';
import { heureMinute } from './ancres';
import urlLive from '../../../../projets/live/live.conducteur.json?url';
import './collab.css';

const date = (t: number) => {
  const d = new Date(t), auj = new Date();
  return d.toDateString() === auj.toDateString() ? heureMinute(t)
    : String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + heureMinute(t);
};
const message = (e: unknown) => (e instanceof ErreurApi && e.statut === 401 ? 'Jeton refusé.' : e instanceof ErreurApi && e.statut === 404 ? 'Projet introuvable (ou jeton faux).' : (e as Error).message);
const stop = (e: KeyboardEvent) => e.stopPropagation();

export interface PropsOuvrirProjet {
  /** appelé quand un projet est ouvert (fermer le panneau…) */
  onOuvert?: (id: string | null) => void;
  className?: string;
}

export function OuvrirProjet({ onOuvert, className = '' }: PropsOuvrirProjet) {
  const projetCourant = useSalle((s) => s.projetId);
  const statut = useSalle((s) => s.statut);
  const [id0] = useState(identite);
  const [nom, setNom] = useState(id0.nom);
  const [role, setRole] = useState<Role>(id0.role);
  const [admin, setAdmin] = useState(() => jetonAdmin() ?? '');
  const [adminConnu, setAdminConnu] = useState(() => !!jetonAdmin());
  const [projets, setProjets] = useState<ResumeProjet[] | null>(null);
  const [titre, setTitre] = useState('');
  const [idSaisi, setIdSaisi] = useState('');
  const [jetonSaisi, setJetonSaisi] = useState('');
  const [note, setNote] = useState<{ t: string; ok?: boolean } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const fichier = useRef<HTMLInputElement>(null);

  const api = useRef(new ClientApi()).current;

  const rafraichir = useCallback(async () => {
    if (!jetonAdmin()) { setProjets(null); return; }
    try { setProjets(await api.listerProjets()); } catch (e) {
      setProjets(null);
      setNote({ t: message(e) });
      if (e instanceof ErreurApi && (e.statut === 401 || e.statut === 403)) setAdminConnu(false);
    }
  }, [api]);
  useEffect(() => { void rafraichir(); }, [rafraichir, adminConnu]);

  const tache = async (f: () => Promise<void>) => {
    setOccupe(true); setNote(null);
    try { await f(); } catch (e) { setNote({ t: message(e) }); } finally { setOccupe(false); }
  };

  const ouvrir = (id: string, jeton?: string) => {
    if (!jeton && !jetonProjet(id) && !jetonAdmin()) { setIdSaisi(id); setNote({ t: 'Jeton du projet requis.' }); return; }
    connecterSalle(id, jeton);
    setNote({ t: 'Salle ouverte : le projet arrive du serveur.', ok: true });
    onOuvert?.(id);
  };

  /** Fichier d'échange : sur le serveur (nouveau projet) si le jeton de régie est connu, sinon en local. */
  const charger = (texte: string, origine: string) => tache(async () => {
    const f: FichierConducteur = lireFichier(texte);
    if (jetonAdmin()) {
      const r = await api.creerProjet(f);
      await rafraichir();
      ouvrir(r.id, r.jeton);
      setNote({ t: `« ${r.titre} » créé sur le serveur depuis ${origine}.`, ok: true });
    } else {
      deconnecterSalle(true);
      useMagasin.getState().importer(texte);
      setNote({ t: `${origine} ouvert en local (sans jeton de régie, rien n'est envoyé au serveur).`, ok: true });
      onOuvert?.(null);
    }
  });

  const importer = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) void f.text().then((t) => charger(t, '« ' + f.name + ' »'));
  };
  const live = () => tache(async () => {
    const r = await fetch(urlLive);
    if (!r.ok) throw new Error('live.conducteur.json introuvable');
    await charger(await r.text(), 'LIVE');
  });

  const retenirIdentite = () => {
    changerIdentite({ nom, role });
    // le nom part avec le hello : on se reconnecte (même salle, rien de local n'est perdu)
    useSalle.getState().salle?.couper();
    setNote({ t: 'Identité retenue.', ok: true });
  };

  return (
    <div className={'sr-co sr-co-ouvrir ' + className} onKeyDown={stop}>
      <section className="sr-co-section">
        <span className="sr-co-micro">Vous</span>
        <div className="sr-co-ligne">
          <input className="sr-co-champ pousse" value={nom} maxLength={60} placeholder="Votre nom" onChange={(e) => setNom(e.target.value)} />
          <select className="sr-co-champ" style={{ width: 96 }} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="auteur">Auteur</option><option value="regie">Régie</option><option value="poste">Poste</option>
          </select>
          <button className="sr-co-bouton" onClick={retenirIdentite}>Retenir</button>
        </div>
      </section>

      <section className="sr-co-section">
        <div className="sr-co-ligne">
          <span className="sr-co-micro pousse">Projets du serveur{urlServeur() ? ' · ' + urlServeur() : ''}</span>
          {adminConnu && <button className="sr-co-lien" onClick={() => void rafraichir()}>Actualiser</button>}
          {adminConnu && <button className="sr-co-lien" onClick={() => { memoriserJetonAdmin(null); setAdmin(''); setAdminConnu(false); setProjets(null); }}>Oublier le jeton</button>}
        </div>
        {!adminConnu ? (
          <div className="sr-co-ligne">
            <input className="sr-co-champ pousse" type="password" autoComplete="off" value={admin} placeholder="Jeton de régie (liste et création)" onChange={(e) => setAdmin(e.target.value)} />
            <button className="sr-co-bouton" disabled={!admin.trim()} onClick={() => { memoriserJetonAdmin(admin); setAdminConnu(true); }}>Retenir</button>
          </div>
        ) : (
          <>
            <div className="sr-co-liste">
              {projets === null && <div className="sr-co-vide">…</div>}
              {projets?.length === 0 && <div className="sr-co-vide">Aucun projet</div>}
              {projets?.map((p) => (
                <button key={p.id} className={'sr-co-projet' + (p.id === projetCourant ? ' courant' : '')} disabled={occupe} onClick={() => ouvrir(p.id)} title={p.id}>
                  <span className="titre">{p.titre || 'Sans titre'}</span>
                  <span className="v sr-co-num">v{p.version}</span>
                  <span className="quand sr-co-num">{date(p.modifie_le)}</span>
                </button>
              ))}
            </div>
            <div className="sr-co-ligne">
              <input className="sr-co-champ pousse" value={titre} maxLength={200} placeholder="Titre du nouveau projet" onChange={(e) => setTitre(e.target.value)} />
              <button className="sr-co-bouton" disabled={occupe} onClick={() => tache(async () => {
                const r = await api.creerProjet(titre.trim() ? { titre: titre.trim() } : {});
                setTitre('');
                await rafraichir();
                ouvrir(r.id, r.jeton);
              })}>Nouveau</button>
            </div>
          </>
        )}
      </section>

      <section className="sr-co-section">
        <span className="sr-co-micro">Ouvrir par identifiant</span>
        <div className="sr-co-ligne">
          <input className="sr-co-champ" style={{ width: '42%' }} value={idSaisi} placeholder="p_…" onChange={(e) => setIdSaisi(e.target.value.trim())} />
          <input className="sr-co-champ pousse" type="password" autoComplete="off" value={jetonSaisi} placeholder="Jeton du projet (sr_…)" onChange={(e) => setJetonSaisi(e.target.value.trim())} />
          <button className="sr-co-bouton" disabled={!idSaisi || occupe} onClick={() => tache(async () => {
            if (jetonSaisi) memoriserJeton(idSaisi, jetonSaisi);
            await api.lireProjet(idSaisi); // vérifie le jeton avant d'ouvrir la salle
            ouvrir(idSaisi, jetonSaisi || undefined);
            setJetonSaisi('');
          })}>Ouvrir</button>
        </div>
      </section>

      <section className="sr-co-section">
        <span className="sr-co-micro">Fichier</span>
        <div className="sr-co-ligne">
          <button className="sr-co-bouton" disabled={occupe} onClick={() => fichier.current?.click()}>Importer un fichier</button>
          <button className="sr-co-bouton" disabled={occupe} onClick={() => void live()}>Charger LIVE</button>
          {projetCourant && <button className="sr-co-bouton pousse" onClick={() => { deconnecterSalle(true); setNote({ t: 'Salle quittée : travail en local.', ok: true }); onOuvert?.(null); }}>Quitter la salle</button>}
          <input ref={fichier} className="sr-co-fichier" type="file" accept=".json,application/json" onChange={importer} />
        </div>
        <span className="sr-co-note">{adminConnu ? 'Un fichier importé devient un nouveau projet du serveur.' : 'Sans jeton de régie, le fichier s’ouvre en local.'}</span>
      </section>

      {projetCourant && <span className="sr-co-micro">Salle · {projetCourant} · {statut === 'connecte' ? 'en salle' : statut === 'ferme' ? 'fermée' : 'reconnexion…'}</span>}
      {note && <div className={'sr-co-note' + (note.ok ? ' ok' : ' alerte')}>{note.t}</div>}
    </div>
  );
}
