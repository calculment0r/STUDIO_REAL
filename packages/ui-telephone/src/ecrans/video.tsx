// Écran `video` : règles de la page du public pour l'iPhone (rapport 4 §4.3).
// 1. UN SEUL élément <video muted playsinline webkit-playsinline preload="auto"> pour tout le téléphone (iOS limite les
//    décodeurs, et le déblocage par geste vaut pour CET élément) : l'écran l'accroche dans son cadre, le décroche en
//    partant, et ne change que sa `src`.
// 2. Lecture TOUJOURS muette d'abord (décision du propriétaire) ; un bouton « Activer le son ».
// 3. Si play() est refusé (économie d'énergie) : « Touchez l'écran pour lancer la vidéo » en plein écran, et la machine
//    remonte `lecture: 'bloque'` dans le battement (la régie voit combien de téléphones sont concernés).
// 4. Fin de la vidéo → `fin-video` ; `params.puis: 'choix'` enchaîne l'écran de choix sur le téléphone même.
// Réglages : asset (nom du média), sources[] ou src (adresses), puis, boucle (vrai/faux), legende.
import { useEffect, useRef, useState } from 'react';
import { texte, textes, type ProprietesEcran } from './communs';

export function EcranVideo({ vue, agir, medias }: ProprietesEcran) {
  const cadre = useRef<HTMLDivElement>(null);
  const [bloquee, setBloquee] = useState(false);
  const [absente, setAbsente] = useState(false);
  const [muette, setMuette] = useState(true);
  const asset = texte(vue.params, 'asset');
  const sources = textes(vue.params.sources, 4);
  const src = texte(vue.params, 'src');
  const boucle = vue.params.boucle === true;
  const sansVideo = !medias.video;

  useEffect(() => {
    const v = medias.video;
    const ici = cadre.current;
    if (!v || !ici) return;
    const adresse = medias.url(asset, sources.length ? sources : src ? [src] : undefined);
    ici.appendChild(v);
    v.muted = true;
    v.loop = boucle;
    v.preload = 'auto';
    if (adresse && v.getAttribute('src') !== adresse) {
      v.src = adresse;
      try { v.load(); } catch { /* rien */ }
    }
    setMuette(true);
    setAbsente(false);
    try { v.currentTime = 0; } catch { /* pas encore de métadonnées */ }
    const lancer = () => {
      const p = v.play();
      if (!p) return;
      p.then(
        () => { setBloquee(false); agir({ a: 'media', asset, lecture: 'lit' }); },
        (e: unknown) => {
          // fichier introuvable ou illisible : « absent » (la régie le voit) ; sinon lecture refusée sans geste : « bloque »
          if (v.error || (e instanceof Error && e.name === 'NotSupportedError')) { setAbsente(true); agir({ a: 'media', asset, lecture: 'absent' }); return; }
          setBloquee(true);
          agir({ a: 'media', asset, lecture: 'bloque' });
        },
      );
    };
    const fin = () => { if (!v.loop) agir({ a: 'fin-video', asset }); };
    // repli sans Cache Storage : « prêt » se lit dans la mémoire tampon de l'élément
    const progres = () => {
      if (!medias.repli || !v.duration || !v.buffered.length) return;
      agir({ a: 'media', asset, pret: Math.min(1, v.buffered.end(v.buffered.length - 1) / v.duration) });
    };
    const erreur = () => { setAbsente(true); setBloquee(false); agir({ a: 'media', asset, lecture: 'absent' }); };
    v.addEventListener('ended', fin);
    v.addEventListener('progress', progres);
    v.addEventListener('error', erreur);
    lancer();
    return () => {
      v.removeEventListener('ended', fin);
      v.removeEventListener('progress', progres);
      v.removeEventListener('error', erreur);
      try { v.pause(); } catch { /* rien */ }
      v.remove();
    };
    // la vue (vseq) change → on recommence ; les autres valeurs en découlent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vue.vseq, asset]);

  const toucherPourLancer = () => {
    const v = medias.video;
    if (!v) return;
    v.play().then(() => { setBloquee(false); agir({ a: 'media', asset, lecture: 'lit' }); }, () => setBloquee(true));
  };
  const activerSon = () => {
    const v = medias.video;
    if (!v) return;
    v.muted = false;
    setMuette(false);
    agir({ a: 'son', actif: true });
    if (v.paused) v.play().catch(() => setBloquee(true));
  };
  const couperSon = () => {
    if (medias.video) medias.video.muted = true;
    setMuette(true);
    agir({ a: 'son', actif: false });
  };

  return (
    <section className="tl-ecran tl-video" aria-label={texte(vue.params, 'legende', 'vidéo')}>
      <div className="tl-video-cadre" ref={cadre}>{sansVideo && <span className="tl-et">vidéo · {asset || 'sans média'}</span>}</div>
      {absente ? (
        <p className="tl-video-absente" role="status">Vidéo indisponible. Regardez la scène.</p>
      ) : bloquee ? (
        <button type="button" className="tl-toucher-lancer" onClick={toucherPourLancer}>Touchez l’écran pour lancer la vidéo</button>
      ) : muette ? (
        <button type="button" className="tl-son" onClick={activerSon}>🔊 Activer le son</button>
      ) : (
        <button type="button" className="tl-son" onClick={couperSon} aria-label="Couper le son">🔇</button>
      )}
    </section>
  );
}
