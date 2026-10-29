/* ============================================================
   BANC D'ESSAI P0.1 — les tests.
   Chaque test : { id, groupe, titre, aide, subjectif?, passif?, support(), lancer(c), arreter?() }
   - lancer(c) renvoie { auto: 'ok'|'ko'|'partiel'|'attente', detail, donnees } ;
     un test « en direct » appelle c.actif(true) et c.maj({...}) pour mettre à jour la carte.
   - Aucune couleur en dur : les couleurs d'écran sont des var(--jeton) du thème (packages/theme/).
   ============================================================ */

export function creerTests(B) {
  const { h, sleep, S, erreur } = B;
  const nav = navigator;

  /* ── utilitaires locaux ─────────────────────────────────── */
  const arrondi = (x, n = 1) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10 ** n) / 10 ** n);

  /** Bloc de lectures en direct : const set = lecture(zone, ['A','B']); set('A', 12). */
  function lecture(zone, noms) {
    const vals = {};
    const dl = h('dl', { class: 'lecture' });
    for (const n of noms) {
      const dd = h('dd', {}, '—');
      vals[n] = dd;
      dl.append(h('dt', {}, n), dd);
    }
    zone.append(dl);
    return (n, v) => { if (vals[n]) vals[n].textContent = String(v); };
  }

  function jauge(zone) {
    const marque = h('b', {});
    const barre = h('i', {});
    const el = h('div', { class: 'jauge', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100' }, barre, marque);
    zone.append(el);
    return (pct, pic) => {
      barre.style.width = Math.max(0, Math.min(100, pct)) + '%';
      if (pic != null) marque.style.left = `calc(${Math.max(0, Math.min(100, pic))}% - 3px)`;
      el.setAttribute('aria-valuenow', String(Math.round(pct)));
    };
  }

  /** Bip Web Audio (sinusoïde avec enveloppe douce). */
  function bip(ctx, freq = 880, dur = 0.35, vol = 0.4, delai = 0) {
    const t = ctx.currentTime + delai;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** WAV 16 bits mono généré en mémoire (pour le test de l'élément <audio>). */
  function wavBlob(freq = 880, dur = 0.5, rate = 22050) {
    const n = Math.floor(rate * dur);
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const txt = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    txt(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    txt(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / (rate * 0.02), (n - i) / (rate * 0.06));
      v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * freq * i) / rate) * env * 0.4 * 32767, true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  const ko = (detail, donnees) => ({ auto: 'ko', detail, donnees });
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const modeAffichage = () =>
    ['fullscreen', 'standalone', 'minimal-ui', 'browser'].find((m) => matchMedia(`(display-mode: ${m})`).matches) || 'inconnu';

  /* ═══════════════════ ÉCRAN ET LUMIÈRE ═══════════════════ */

  const couleur = {
    id: 'couleur', groupe: 'lumiere', titre: 'Couleur plein écran', subjectif: true,
    aide: 'L’écran passe en plein cadre par six couleurs (une par seconde), puis s’arrête. À regarder : couleurs franches, rien ne reste des barres du navigateur.',
    support: () => true,
    async lancer() {
      if (!(await B.confirmerLumiere())) return { auto: 'attente', detail: 'Test annulé (avertissement lumière).' };
      const couleurs = ['--rouge', '--or', '--amb', '--grn2', '--cy', '--titre-clair'];
      const pas = B.reduit() ? 2400 : 1200;            // 1 changement / 1,2 s : très loin des 3 par seconde
      const p = B.ouvrirPlein({ fond: 'var(--black)' });
      let n = 0;
      for (let tour = 0; tour < 2 && !p.termine; tour++) {
        for (const v of couleurs) {
          if (p.termine) break;
          p.fond(`var(${v})`); n++;
          await Promise.race([sleep(pas), p.fin]);
        }
      }
      const h0 = innerHeight;
      p.fermer();
      return { auto: 'ok', detail: `${n} couleurs affichées, un changement toutes les ${pas} ms. Confirme ce que tu as vu.`, donnees: { changements: n, pasMs: pas, hauteurFenetre: h0 } };
    },
  };

  const flash = {
    id: 'flash', groupe: 'lumiere', titre: 'Flash blanc', subjectif: true,
    aide: 'Trois éclairs blancs sur fond noir (2,5 par seconde au plus). C’est le repli de la lampe torche sur iPhone.',
    support: () => true,
    async lancer() {
      if (!(await B.confirmerLumiere())) return { auto: 'attente', detail: 'Test annulé (avertissement lumière).' };
      const nb = B.reduit() ? 1 : 3;
      const p = B.ouvrirPlein({ fond: 'var(--black)' });
      await Promise.race([sleep(700), p.fin]);
      for (let i = 0; i < nb && !p.termine; i++) {
        p.fond('var(--titre-clair)');                        // éclair 150 ms…
        await Promise.race([sleep(150), p.fin]);
        p.fond('var(--black)');                              // …puis 250 ms de noir : période 400 ms = 2,5 / s
        await Promise.race([sleep(250), p.fin]);
      }
      await Promise.race([sleep(300), p.fin]);
      p.fermer();
      return { auto: 'ok', detail: `${nb} éclair(s) blanc(s), 150 ms allumé / 250 ms éteint.`, donnees: { eclairs: nb, periodeMs: 400 } };
    },
  };

  const torche = {
    id: 'torche', groupe: 'lumiere', titre: 'Lampe torche (flash de la caméra)', subjectif: true,
    aide: 'Allume la lampe arrière via la piste caméra (track.applyConstraints torch) : trois clignotements lents. Demande l’accès à la caméra. Attendu : Android oui, iPhone non.',
    support: () => !!nav.mediaDevices?.getUserMedia,
    async lancer(c) {
      if (!nav.mediaDevices?.getUserMedia) return ko('getUserMedia absent : torche impossible.');
      if (!(await B.confirmerLumiere())) return { auto: 'attente', detail: 'Test annulé (avertissement lumière).' };
      let flux;
      try {
        flux = await nav.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch (e) { return ko('Caméra refusée ou indisponible : ' + erreur(e)); }
      const piste = flux.getVideoTracks()[0];
      const video = h('video', { muted: true, playsInline: true, autoplay: true });
      video.setAttribute('playsinline', ''); video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
      document.body.append(video);
      try {
        video.srcObject = flux;
        await video.play().catch(() => {});
        const caps = piste.getCapabilities ? piste.getCapabilities() : {};
        const donnees = { capaciteTorch: 'torch' in caps, etiquette: piste.label, facing: piste.getSettings?.().facingMode || null };
        if (!('torch' in caps)) {
          return ko(B.estIOS ? 'Pas de capacité « torch » (normal sur iPhone : repli = écran blanc).' : 'La caméra n’expose pas de capacité « torch » (pas de flash, ou navigateur non compatible).', donnees);
        }
        const n = B.reduit() ? 1 : 3;
        for (let i = 0; i < n; i++) {                           // 400 ms allumée / 400 ms éteinte : 1,25 / s
          await piste.applyConstraints({ advanced: [{ torch: true }] });
          await sleep(400);
          await piste.applyConstraints({ advanced: [{ torch: false }] });
          await sleep(400);
        }
        return { auto: 'ok', detail: `Torche commandée ${n} fois sans erreur. Confirme si la lampe s’est bien allumée.`, donnees };
      } catch (e) {
        return ko('applyConstraints(torch) a échoué : ' + erreur(e));
      } finally {
        try { await piste.applyConstraints({ advanced: [{ torch: false }] }); } catch (_) { /* ignore */ }
        flux.getTracks().forEach((t) => t.stop());
        video.remove();
        c.zone.replaceChildren();
      }
    },
  };

  /* ═══════════════════ SON ET SENSATIONS ═══════════════════ */

  const vibration = {
    id: 'vibration', groupe: 'sens', titre: 'Vibration (motif)', subjectif: true,
    aide: 'Motif court, court, long. Attendu : Android oui, iPhone non (Safari ne l’implémente pas).',
    support: () => 'vibrate' in nav,
    async lancer() {
      if (!('vibrate' in nav)) return ko('navigator.vibrate absent (attendu sur Safari iOS).');
      const ok = nav.vibrate([200, 100, 200, 100, 500]);
      return {
        auto: ok ? 'partiel' : 'ko',
        detail: ok
          ? 'vibrate() a répondu « vrai » : le téléphone doit vibrer (court, court, long). Confirme ci-dessous ; sans retour tactile, vérifie le mode silencieux / économie d’énergie.'
          : 'vibrate() a répondu « faux » (bloqué par le navigateur ou un réglage système).',
        donnees: { retour: ok },
      };
    },
  };

  const haptique = (() => {
    return {
      id: 'haptique_ios', groupe: 'sens', titre: 'Astuce haptique iOS (interrupteur)', subjectif: true,
      aide: 'Safari iOS 17.4+ : un <input type="checkbox" switch> donne un petit « tic » dans le doigt quand on le bascule. Bascule l’interrupteur du doigt, puis essaie le bouton qui le fait par script (le tic n’est peut-être possible que sous le doigt).',
      support: () => 'switch' in HTMLInputElement.prototype,
      async lancer(c) {
        let doigt = 0; let script = 0;
        const maj = () => c.maj({
          auto: doigt + script ? 'partiel' : 'attente',
          detail: `${doigt} bascule(s) au doigt, ${script} par script. Dis ensuite si tu as senti un tic.`,
          donnees: { basculesDoigt: doigt, basculesScript: script, attributSwitchReconnu: 'switch' in HTMLInputElement.prototype },
        });
        const sw1 = h('input', { type: 'checkbox', id: 'hap-1' }); sw1.setAttribute('switch', '');
        const sw2 = h('input', { type: 'checkbox', id: 'hap-2' }); sw2.setAttribute('switch', '');
        sw1.addEventListener('change', () => { doigt++; maj(); });
        let viaScript = false;
        sw2.addEventListener('change', () => { if (viaScript) { script++; viaScript = false; } else { doigt++; } maj(); });
        const lab2 = h('label', { for: 'hap-2' }, 'Interrupteur n°2 (basculé par le bouton)');
        c.zone.append(
          h('label', { class: 'sw-ligne', for: 'hap-1' }, 'Interrupteur n°1 : touche-le', sw1),
          h('div', { class: 'sw-ligne' }, lab2, sw2),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { viaScript = true; lab2.click(); } }, 'Basculer le n°2 par script'),
        );
        return { auto: 'attente', detail: 'Bascule les interrupteurs puis réponds : as-tu senti un tic haptique ?', donnees: { attributSwitchReconnu: 'switch' in HTMLInputElement.prototype } };
      },
    };
  })();

  const son = {
    id: 'son', groupe: 'sens', titre: 'Son Web Audio (bip)', subjectif: true,
    aide: 'Deux bips (grave puis aigu). Rappel : sur iPhone, l’interrupteur latéral « silencieux » coupe le son Web Audio ; monte aussi le volume. Si tu n’entends rien, réponds « Rien » puis essaie les deux tests suivants.',
    support: () => !!(window.AudioContext || window.webkitAudioContext),
    async lancer() {
      let ctx;
      try { ctx = await B.audioPret(); } catch (e) { return ko(erreur(e)); }
      bip(ctx, 660, 0.35, 0.45, 0);
      bip(ctx, 990, 0.35, 0.45, 0.45);
      const donnees = { etat: ctx.state, frequenceHz: ctx.sampleRate, latenceBaseMs: arrondi((ctx.baseLatency || 0) * 1000, 1), latenceSortieMs: arrondi((ctx.outputLatency || 0) * 1000, 1) };
      return {
        auto: ctx.state === 'running' ? 'ok' : 'partiel',
        detail: `AudioContext « ${ctx.state} », ${ctx.sampleRate} Hz, latence de base ${donnees.latenceBaseMs} ms. Bips envoyés : les entends-tu ? (mode silencieux désactivé, volume monté)`,
        donnees,
      };
    },
  };

  const sonAudio = {
    id: 'son_audio', groupe: 'sens', titre: 'Son via <audio> (bip)', subjectif: true,
    aide: 'Un bip joué par un élément <audio> classique. Sur iPhone il passe parfois malgré l’interrupteur silencieux, contrairement au Web Audio : fais le test avec le mode silencieux activé.',
    support: () => typeof Audio !== 'undefined',
    async lancer() {
      const url = URL.createObjectURL(wavBlob(770, 0.5));
      const a = new Audio(url);
      try {
        await a.play();
        await sleep(650);
        return { auto: 'ok', detail: 'play() accepté. L’entends-tu avec le mode silencieux activé ? (réponds pour le cas silencieux)', donnees: { lecture: true } };
      } catch (e) {
        return ko('play() refusé : ' + erreur(e), { lecture: false });
      } finally {
        a.pause(); URL.revokeObjectURL(url);
      }
    },
  };

  const audioSession = {
    id: 'audiosession', groupe: 'sens', titre: 'navigator.audioSession (contournement du silencieux)', subjectif: true,
    aide: 'Safari récent : audioSession.type = "playback" doit faire sonner le Web Audio même en mode silencieux. Active le mode silencieux de l’iPhone AVANT de lancer, et dis si tu entends le bip.',
    support: () => 'audioSession' in nav,
    async lancer() {
      if (!('audioSession' in nav)) return ko('navigator.audioSession absent sur ce navigateur.');
      const s = nav.audioSession;
      const avant = s.type;
      let erreurType = null;
      try { s.type = 'playback'; } catch (e) { erreurType = erreur(e); }
      let ctx;
      try { ctx = await B.audioPret(); } catch (e) { return ko(erreur(e)); }
      bip(ctx, 523, 0.3, 0.45, 0);
      bip(ctx, 784, 0.3, 0.45, 0.4);
      const donnees = { typeAvant: avant, typeApres: s.type, etat: s.state ?? null, erreur: erreurType };
      return {
        auto: erreurType ? 'ko' : 'partiel',
        detail: `audioSession.type : « ${avant} » vers « ${s.type} »${erreurType ? ' (' + erreurType + ')' : ''}. Entends-tu le bip avec le mode silencieux activé ?`,
        donnees,
      };
    },
  };

  const voix = {
    id: 'voix', groupe: 'sens', titre: 'Synthèse vocale', subjectif: true,
    aide: 'Le téléphone dit une phrase en français (la voix d’un personnage dans la poche). Même remarque : mode silencieux et volume.',
    support: () => 'speechSynthesis' in window,
    async lancer() {
      if (!('speechSynthesis' in window)) return ko('speechSynthesis absent.');
      const ss = window.speechSynthesis;
      let voix_ = ss.getVoices();
      if (!voix_.length) {
        await new Promise((r) => { ss.addEventListener('voiceschanged', r, { once: true }); setTimeout(r, 1500); });
        voix_ = ss.getVoices();
      }
      const fr = voix_.filter((v) => (v.lang || '').toLowerCase().startsWith('fr'));
      const u = new SpeechSynthesisUtterance('Bonjour, ceci est un test de la voix du téléphone.');
      u.lang = 'fr-FR';
      if (fr[0]) u.voice = fr[0];
      let demarre = false; let err = null;
      await new Promise((res) => {
        u.onstart = () => { demarre = true; };
        u.onend = res;
        u.onerror = (e) => { err = e.error || 'erreur'; res(); };
        ss.cancel();
        ss.speak(u);
        setTimeout(res, 9000);
      });
      return {
        auto: err ? 'ko' : demarre ? 'ok' : 'partiel',
        detail: `${voix_.length} voix installées dont ${fr.length} en français${fr[0] ? ' (' + fr[0].name + ')' : ''}${err ? ' · erreur : ' + err : ''}${demarre ? '' : ' · la lecture n’a pas démarré'}. L’as-tu entendue ?`,
        donnees: { voix: voix_.length, voixFr: fr.length, choisie: fr[0]?.name || null, demarre, erreur: err },
      };
    },
  };

  /* ═══════════════════ SYSTÈME ═══════════════════ */

  const pleinEcran = {
    id: 'plein_ecran', groupe: 'systeme', titre: 'Plein écran (Fullscreen API)',
    aide: 'Demande le plein écran sur toute la page. Attendu : Android oui ; iPhone non (sauf PWA ajoutée à l’écran d’accueil) ; iPad oui.',
    support: () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen),
    async lancer() {
      const el = document.documentElement;
      const rf = el.requestFullscreen || el.webkitRequestFullscreen;
      const base = { modeAffichage: modeAffichage(), standalone: B.standalone() };
      if (!rf) {
        return ko(`Fullscreen API absente${B.estIOS ? ' (normal sur iPhone : seule la PWA de l’écran d’accueil donne le plein écran)' : ''}. Mode d’affichage actuel : ${base.modeAffichage}.`, base);
      }
      if (fsEl()) {
        try { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (_) { /* ignore */ }
        await sleep(500);
      }
      try { await rf.call(el); } catch (e) { return ko('requestFullscreen refusé : ' + erreur(e), base); }
      await sleep(600);
      const actif = !!fsEl();
      return {
        auto: actif ? 'ok' : 'ko',
        detail: `${actif ? 'Plein écran actif' : 'La demande a abouti mais le plein écran n’est pas actif'} (hauteur ${innerHeight}px). Pour en sortir : geste retour / touche Échap.`,
        donnees: { ...base, actif, hauteur: innerHeight },
      };
    },
  };

  const wakeLock = {
    id: 'wakelock', groupe: 'systeme', titre: 'Empêcher la mise en veille (Wake Lock)',
    aide: 'Demande à garder l’écran allumé. Pour une vraie preuve : active-le, laisse le téléphone sans y toucher plus longtemps que ta mise en veille automatique, et vérifie que l’écran reste allumé.',
    support: () => 'wakeLock' in nav,
    async lancer(c) {
      if (!('wakeLock' in nav)) return ko('navigator.wakeLock absent (iOS < 16.4 ou navigateur intégré).');
      if (S.wl) { try { await S.wl.release(); } catch (_) { /* ignore */ } S.wl = null; }
      try { await B.prendreWL(); } catch (e) { return ko('wakeLock.request a échoué : ' + erreur(e)); }
      c.zone.append(h('p', { class: 'aide' }, 'Verrou actif : l’indicateur « veille bloquée » en haut doit être allumé. Il est repris automatiquement quand tu reviens sur la page.'));
      return { auto: 'ok', detail: 'Verrou de veille obtenu. Il saute si la page passe en arrière-plan puis revient (reprise automatique).', donnees: { actif: !!S.wl, reprises: S.wlReprises } };
    },
  };

  const orientationLock = {
    id: 'orientation_lock', groupe: 'systeme', titre: 'Verrouiller l’orientation',
    aide: 'Essaie de forcer le portrait (screen.orientation.lock). Attendu : Android seulement en plein écran, iPhone non.',
    support: () => !!(screen.orientation && screen.orientation.lock),
    async lancer() {
      const o = screen.orientation;
      if (!o || !o.lock) return ko('screen.orientation.lock absent (normal sur Safari iOS).', { type: o?.type || null });
      const essai = async () => { await o.lock('portrait'); await sleep(300); const t = o.type; o.unlock(); return t; };
      try {
        const t = await essai();
        return { auto: 'ok', detail: `Verrouillage portrait accepté sans plein écran (orientation « ${t} »).`, donnees: { sansPleinEcran: true } };
      } catch (e1) {
        const rf = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
        if (rf && !fsEl()) {
          try {
            await rf.call(document.documentElement);
            await sleep(400);
            await essai();
            return { auto: 'partiel', detail: `Verrouillage accepté seulement en plein écran (sans : ${erreur(e1)}).`, donnees: { sansPleinEcran: false, erreurSans: erreur(e1) } };
          } catch (e2) {
            return ko(`Verrouillage refusé, même en plein écran : ${erreur(e2)}`, { erreurSans: erreur(e1), erreurAvec: erreur(e2) });
          }
        }
        return ko('Verrouillage refusé : ' + erreur(e1), { erreurSans: erreur(e1) });
      }
    },
  };

  /* Visibilité : on écoute dès le chargement de la page, le test ne fait qu'afficher. */
  const VIS = { n: 0, depuis: null, plusLong: 0, total: 0, gels: 0, plusLongGel: 0, journal: [], cb: null, t0: Date.now(), dernier: Date.now() };
  const logVis = (m) => { VIS.journal.push(`${((Date.now() - VIS.t0) / 1000).toFixed(1)} s ${m}`); if (VIS.journal.length > 14) VIS.journal.shift(); };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { VIS.n++; VIS.depuis = Date.now(); logVis('masquée'); }
    else {
      const d = VIS.depuis ? Date.now() - VIS.depuis : 0;
      VIS.depuis = null; VIS.total += d; VIS.plusLong = Math.max(VIS.plusLong, d);
      logVis(`visible (absente ${(d / 1000).toFixed(1)} s)`);
    }
    VIS.cb?.();
  });
  window.addEventListener('pagehide', (e) => logVis('pagehide' + (e.persisted ? ' (bfcache)' : '')));
  window.addEventListener('pageshow', (e) => { logVis('pageshow' + (e.persisted ? ' (bfcache)' : '')); VIS.cb?.(); });
  document.addEventListener('freeze', () => logVis('freeze'));
  document.addEventListener('resume', () => logVis('resume'));
  setInterval(() => {                           // un trou > 3 s alors qu'on attend 0,5 s = la page a été gelée
    const now = Date.now(); const gap = now - VIS.dernier; VIS.dernier = now;
    if (gap > 3000) { VIS.gels++; VIS.plusLongGel = Math.max(VIS.plusLongGel, gap); logVis(`timers gelés ${(gap / 1000).toFixed(1)} s`); VIS.cb?.(); }
  }, 500);

  const resumeVis = () => ({
    auto: VIS.n ? 'ok' : 'attente',
    detail: VIS.n
      ? `${VIS.n} passage(s) en arrière-plan, absence la plus longue ${(VIS.plusLong / 1000).toFixed(1)} s, ${VIS.gels} gel(s) des timers (max ${(VIS.plusLongGel / 1000).toFixed(1)} s). Journal : ${VIS.journal.join(' | ')}`
      : 'Aucun passage en arrière-plan pour l’instant : verrouille l’écran 10 s, ou change d’appli, puis reviens ici.',
    donnees: { passages: VIS.n, absenceMaxMs: VIS.plusLong, absenceTotaleMs: VIS.total, gelsTimers: VIS.gels, gelMaxMs: VIS.plusLongGel, journal: [...VIS.journal] },
  });

  const visibilite = {
    id: 'visibilite', groupe: 'systeme', titre: 'Visibilité de la page', passif: true,
    aide: 'Compte combien de fois la page passe en arrière-plan (écran verrouillé, autre appli, autre onglet) et si ses minuteurs sont gelés pendant ce temps. Appuie sur « Tester », verrouille l’écran quelques secondes, reviens.',
    support: () => 'hidden' in document,
    async lancer(c) {
      const reset = h('button', { class: 'btn ghost petit-btn', type: 'button', onclick: () => { Object.assign(VIS, { n: 0, depuis: null, plusLong: 0, total: 0, gels: 0, plusLongGel: 0, journal: [] }); c.maj(resumeVis()); } }, 'Remettre à zéro');
      c.zone.append(reset);
      VIS.cb = () => c.maj(resumeVis());
      return resumeVis();
    },
  };

  const clavier = (() => {
    let nettoie = null;
    return {
      id: 'clavier', groupe: 'systeme', titre: 'Clavier virtuel et hauteur visible', passif: true, subjectif: true,
      aide: 'Touche le champ : le clavier s’ouvre. Regarde window.innerHeight (zone de mise en page) contre visualViewport.height (zone réellement visible). Réponds « Ça marche » si la page ne saute pas et que le champ reste visible.',
      support: () => !!window.visualViewport,
      async lancer(c) {
        nettoie?.();
        const vv = window.visualViewport;
        const champ = h('input', { type: 'text', class: 'champ', placeholder: 'Touche ici : le clavier s’ouvre', autocomplete: 'off', enterkeyhint: 'done', 'aria-label': 'Champ de test du clavier' });
        c.zone.append(champ);
        const set = lecture(c.zone, ['window.innerHeight', 'visualViewport.height', 'Écart (clavier ?)', 'vv.offsetTop', 'Écart max vu', 'Variation innerHeight']);
        let kbMax = 0; let offMax = 0; let ihMin = innerHeight; let ihMax = innerHeight;
        const vitrine = () => ({
          auto: kbMax > 80 ? 'ok' : 'attente',
          detail: kbMax > 80
            ? `Clavier détecté : écart max ${Math.round(kbMax)} px. innerHeight ${ihMax - ihMin > 40 ? 'RÉTRÉCIT' : 'ne bouge pas'} (${ihMin}–${ihMax} px), offsetTop max ${Math.round(offMax)} px.`
            : 'Touche le champ pour ouvrir le clavier.',
          donnees: { clavierMaxPx: Math.round(kbMax), innerHeightMin: ihMin, innerHeightMax: ihMax, offsetTopMaxPx: Math.round(offMax), visualViewport: !!vv, virtualKeyboardAPI: 'virtualKeyboard' in nav },
        });
        const maj = () => {
          const vh = vv ? vv.height : innerHeight;
          const ecart = innerHeight - vh;
          kbMax = Math.max(kbMax, ecart); ihMin = Math.min(ihMin, innerHeight); ihMax = Math.max(ihMax, innerHeight);
          offMax = Math.max(offMax, vv ? vv.offsetTop : 0);
          set('window.innerHeight', innerHeight); set('visualViewport.height', arrondi(vh, 0)); set('Écart (clavier ?)', Math.round(ecart));
          set('vv.offsetTop', arrondi(vv ? vv.offsetTop : 0, 0)); set('Écart max vu', Math.round(kbMax)); set('Variation innerHeight', ihMax - ihMin);
          c.maj(vitrine());
        };
        window.addEventListener('resize', maj);
        vv?.addEventListener('resize', maj);
        vv?.addEventListener('scroll', maj);
        champ.addEventListener('focus', maj);
        champ.addEventListener('blur', maj);
        nettoie = () => { window.removeEventListener('resize', maj); vv?.removeEventListener('resize', maj); vv?.removeEventListener('scroll', maj); nettoie = null; };
        c.actif(false);
        maj();
        champ.focus();
        return vitrine();
      },
      arreter() { nettoie?.(); },
    };
  })();

  /* ═══════════════════ CAPTEURS ═══════════════════ */

  async function permissionCapteur(Cls) {
    if (Cls && typeof Cls.requestPermission === 'function') return Cls.requestPermission();
    return 'inutile';
  }

  const accelerometre = (() => {
    let off = null;
    return {
      id: 'accelerometre', groupe: 'capteurs', titre: 'Accéléromètre (secousse en direct)', live: true,
      aide: 'Secoue le téléphone : la jauge monte avec l’énergie de la secousse. iPhone : demande une autorisation « mouvement et orientation ».',
      support: () => 'DeviceMotionEvent' in window,
      async lancer(c) {
        off?.();
        if (!('DeviceMotionEvent' in window)) return ko('DeviceMotionEvent absent.');
        let perm;
        try { perm = await permissionCapteur(window.DeviceMotionEvent); } catch (e) { return ko('Permission impossible : ' + erreur(e)); }
        if (perm !== 'granted' && perm !== 'inutile') return ko(`Permission « ${perm} ». (iOS : fermer complètement Safari puis rouvrir la page pour redemander.)`, { permission: perm });
        const setJauge = jauge(c.zone);
        const set = lecture(c.zone, ['Secousse (m/s²)', 'Pic', 'Événements / s', 'Intervalle (ms)', 'Source']);
        let n = 0; let courant = 0; let pic = 0; let fenN = 0; let fenT = performance.now(); let hz = 0; let source = '—'; let interval = null; let rAF = 0;
        const onMotion = (e) => {
          const a = e.acceleration; const g = e.accelerationIncludingGravity; let m;
          if (a && a.x != null) { m = Math.hypot(a.x, a.y, a.z); source = 'acceleration (sans gravité)'; }
          else if (g && g.x != null) { m = Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81); source = 'avec gravité (corrigée)'; }
          else return;
          n++; fenN++; courant = m; pic = Math.max(pic, m); interval = e.interval;
        };
        const boucle = () => {
          const now = performance.now();
          if (now - fenT >= 1000) { hz = (fenN * 1000) / (now - fenT); fenN = 0; fenT = now; }
          setJauge((courant / 25) * 100, (pic / 25) * 100);
          set('Secousse (m/s²)', arrondi(courant, 1)); set('Pic', arrondi(pic, 1)); set('Événements / s', Math.round(hz));
          set('Intervalle (ms)', interval ?? '—'); set('Source', source);
          courant *= 0.92;
          if (n) c.maj({ auto: 'ok', detail: `${Math.round(hz)} événements / s, pic ${arrondi(pic, 1)} m/s²${pic > 15 ? ' : secousse nette détectée' : ' : secoue plus fort pour voir un pic'}.`, donnees: { evenementsParSeconde: Math.round(hz), pic: arrondi(pic, 1), intervalleMs: interval, source, permission: perm } });
          rAF = requestAnimationFrame(boucle);
        };
        window.addEventListener('devicemotion', onMotion);
        rAF = requestAnimationFrame(boucle);
        const arretAuto = setTimeout(() => { off?.(); c.actif(false); }, 45000);
        const verif = setTimeout(() => { if (!n) c.maj({ auto: 'ko', detail: 'Aucun événement reçu en 2 s : capteur absent, ou autorisation refusée.', donnees: { permission: perm, evenements: 0 } }); }, 2000);
        off = () => { window.removeEventListener('devicemotion', onMotion); cancelAnimationFrame(rAF); clearTimeout(arretAuto); clearTimeout(verif); off = null; };
        c.actif(true);
        return { auto: 'attente', detail: 'Écoute en cours… secoue le téléphone (arrêt automatique après 45 s).', donnees: { permission: perm } };
      },
      arreter() { off?.(); },
    };
  })();

  const orientation = (() => {
    let off = null;
    return {
      id: 'orientation', groupe: 'capteurs', titre: 'Orientation et boussole', live: true,
      aide: 'Tourne et incline le téléphone : angles alpha / bêta / gamma et aiguille de boussole. Sur iPhone, la boussole vient de webkitCompassHeading ; sur Android de l’événement « absolu ».',
      support: () => 'DeviceOrientationEvent' in window,
      async lancer(c) {
        off?.();
        if (!('DeviceOrientationEvent' in window)) return ko('DeviceOrientationEvent absent.');
        let perm;
        try { perm = await permissionCapteur(window.DeviceOrientationEvent); } catch (e) { return ko('Permission impossible : ' + erreur(e)); }
        if (perm !== 'granted' && perm !== 'inutile') return ko(`Permission « ${perm} ».`, { permission: perm });
        const aiguille = h('i', {});
        c.zone.append(h('div', { class: 'boussole', 'aria-hidden': 'true' }, h('span', {}, 'N'), aiguille));
        const set = lecture(c.zone, ['alpha (lacet)', 'bêta (avant/arrière)', 'gamma (gauche/droite)', 'Cap', 'Source du cap', 'Événement absolu']);
        let n = 0; let capSource = '—'; let absolu = false; let dernier = {};
        const traite = (e, estAbs) => {
          if (e.alpha == null && e.beta == null && e.webkitCompassHeading == null) return;
          n++;
          let cap = null;
          if (typeof e.webkitCompassHeading === 'number') { cap = e.webkitCompassHeading; capSource = 'webkitCompassHeading (iOS)'; }
          else if ((estAbs || e.absolute) && e.alpha != null) { cap = (360 - e.alpha) % 360; capSource = 'alpha absolu (Android)'; absolu = true; }
          else if (e.alpha != null && cap == null && capSource === '—') capSource = 'alpha relatif (pas de nord)';
          dernier = { alpha: e.alpha, beta: e.beta, gamma: e.gamma, cap };
          set('alpha (lacet)', arrondi(e.alpha, 0) ?? '—'); set('bêta (avant/arrière)', arrondi(e.beta, 0) ?? '—'); set('gamma (gauche/droite)', arrondi(e.gamma, 0) ?? '—');
          set('Cap', cap == null ? '—' : Math.round(cap) + '°'); set('Source du cap', capSource); set('Événement absolu', absolu ? 'oui' : 'non');
          if (cap != null) aiguille.style.transform = `rotate(${-cap}deg)`;
          c.maj({
            auto: 'ok',
            detail: `Angles reçus. Cap : ${capSource}.`,
            donnees: { permission: perm, boussole: capSource !== '—' && !capSource.startsWith('alpha relatif'), sourceCap: capSource, evenementAbsolu: absolu, dernier },
          });
        };
        const f1 = (e) => traite(e, false);
        const f2 = (e) => traite(e, true);
        window.addEventListener('deviceorientation', f1);
        window.addEventListener('deviceorientationabsolute', f2);
        const arretAuto = setTimeout(() => { off?.(); c.actif(false); }, 45000);
        const verif = setTimeout(() => { if (!n) c.maj({ auto: 'ko', detail: 'Aucun angle reçu en 2 s : capteur absent, ou autorisation refusée.', donnees: { permission: perm, evenements: 0 } }); }, 2000);
        off = () => { window.removeEventListener('deviceorientation', f1); window.removeEventListener('deviceorientationabsolute', f2); clearTimeout(arretAuto); clearTimeout(verif); off = null; };
        c.actif(true);
        return { auto: 'attente', detail: 'Écoute en cours… tourne le téléphone (arrêt automatique après 45 s).', donnees: { permission: perm } };
      },
      arreter() { off?.(); },
    };
  })();

  const geoloc = {
    id: 'geoloc', groupe: 'capteurs', titre: 'Géolocalisation (précision)',
    aide: 'Mesure la précision du GPS / réseau. En salle on attend 10 à 50 m, donc inutilisable pour placer un siège. La position elle-même n’est jamais copiée dans le rapport.',
    support: () => 'geolocation' in nav,
    async lancer() {
      if (!('geolocation' in nav)) return ko('navigator.geolocation absent.');
      const t0 = performance.now();
      return new Promise((res) => {
        nav.geolocation.getCurrentPosition(
          (p) => {
            const acc = Math.round(p.coords.accuracy);
            res({
              auto: acc <= 50 ? 'ok' : 'partiel',
              detail: `Précision ±${acc} m obtenue en ${Math.round((performance.now() - t0) / 100) / 10} s${acc > 50 ? ' (trop large pour une salle)' : ''}.`,
              donnees: { precisionM: acc, precisionAltitudeM: arrondi(p.coords.altitudeAccuracy, 0), delaiMs: Math.round(performance.now() - t0) },
            });
          },
          (e) => res(ko(`Erreur ${e.code} : ${e.message || (e.code === 1 ? 'permission refusée' : e.code === 2 ? 'position indisponible' : 'délai dépassé')}`, { codeErreur: e.code })),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
      });
    },
  };

  const batterie = {
    id: 'batterie', groupe: 'capteurs', titre: 'Batterie',
    aide: 'Niveau et état de charge (alerte « batterie faible » côté régie). Attendu : Chrome Android oui, iPhone non.',
    support: () => 'getBattery' in nav,
    async lancer() {
      if (!('getBattery' in nav)) return ko('navigator.getBattery absent (attendu sur Safari et Firefox).');
      try {
        const b = await nav.getBattery();
        return { auto: 'ok', detail: `Niveau ${Math.round(b.level * 100)} %, ${b.charging ? 'en charge' : 'sur batterie'}.`, donnees: { niveauPct: Math.round(b.level * 100), enCharge: b.charging } };
      } catch (e) { return ko(erreur(e)); }
    },
  };

  const nfc = {
    id: 'nfc', groupe: 'capteurs', titre: 'Web NFC',
    aide: 'Lecture d’un tag NFC (toucher un objet du décor). Attendu : Android Chrome seulement. Si tu as un tag, approche-le du dos du téléphone après avoir lancé le test (12 s).',
    support: () => 'NDEFReader' in window,
    async lancer() {
      if (!('NDEFReader' in window)) return ko('NDEFReader absent (attendu sur iPhone et sur Chrome de bureau).');
      const ctrl = new AbortController();
      try {
        // eslint-disable-next-line no-undef -- API Web NFC, absente des globals ESLint
        const lecteur = new NDEFReader();
        const lu = new Promise((res) => {
          lecteur.addEventListener('reading', (e) => res(e), { once: true });
          setTimeout(() => res(null), 12000);
        });
        await lecteur.scan({ signal: ctrl.signal });
        const e = await lu;
        ctrl.abort();
        if (e) return { auto: 'ok', detail: `Tag lu (série ${e.serialNumber || 'n/a'}, ${e.message?.records?.length ?? 0} enregistrement(s)).`, donnees: { tagLu: true } };
        return { auto: 'partiel', detail: 'Le scan NFC a démarré (API et NFC activés) mais aucun tag n’a été approché en 12 s.', donnees: { tagLu: false, scanDemarre: true } };
      } catch (e) {
        ctrl.abort();
        return ko(`Scan impossible : ${erreur(e)} (NFC éteint dans les réglages ? permission refusée ?)`, { scanDemarre: false });
      }
    },
  };

  /* ═══════════════════ MICRO ET CAMÉRA ═══════════════════ */

  const micro = (() => {
    let off = null;
    return {
      id: 'micro', groupe: 'medias', titre: 'Micro (niveau en direct)', live: true,
      aide: 'Demande le micro et affiche le niveau sonore en direct (applaudimètre). Parle, tape dans tes mains. Arrêt automatique après 30 s. Sur iPhone, ouvrir le micro peut baisser le volume des autres sons.',
      support: () => !!nav.mediaDevices?.getUserMedia,
      async lancer(c) {
        off?.();
        if (!nav.mediaDevices?.getUserMedia) return ko('getUserMedia absent (HTTPS requis, ou navigateur intégré).');
        // Une session audio en « playback » (test audioSession) interdit la capture sur iOS
        // (InvalidStateError, vu sur iPhone le 26/10) : on repasse en « play-and-record » le temps du micro.
        const session = nav.audioSession;
        const typeAvant = session?.type;
        if (session && typeAvant === 'playback') { try { session.type = 'play-and-record'; } catch {} }
        let flux;
        try { flux = await nav.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false }); }
        catch (e) { return ko('Micro refusé ou indisponible : ' + erreur(e) + (typeAvant ? ` (audioSession : ${typeAvant} → ${session.type})` : '')); }
        let ctx;
        try { ctx = await B.audioPret(); } catch (e) { flux.getTracks().forEach((t) => t.stop()); return ko(erreur(e)); }
        const src = ctx.createMediaStreamSource(flux);
        const an = ctx.createAnalyser(); an.fftSize = 1024;
        src.connect(an);
        const tampon = new Float32Array(an.fftSize);
        const setJauge = jauge(c.zone);
        const set = lecture(c.zone, ['Niveau (dBFS)', 'Pic', 'Appareil']);
        const piste = flux.getAudioTracks()[0];
        set('Appareil', piste?.label || '—');
        let pic = -120; let rAF = 0; let t0 = performance.now(); let signal = false;
        const boucle = () => {
          an.getFloatTimeDomainData(tampon);
          let s = 0; for (let i = 0; i < tampon.length; i++) s += tampon[i] * tampon[i];
          const rms = Math.sqrt(s / tampon.length);
          const db = rms > 0 ? 20 * Math.log10(rms) : -120;
          pic = Math.max(pic, db);
          if (db > -70) signal = true;
          setJauge(((db + 80) / 80) * 100, ((pic + 80) / 80) * 100);
          set('Niveau (dBFS)', arrondi(db, 0)); set('Pic', arrondi(pic, 0));
          c.maj({
            auto: signal ? 'ok' : performance.now() - t0 > 5000 ? 'partiel' : 'attente',
            detail: signal ? `Micro actif, pic ${arrondi(pic, 0)} dBFS.` : 'Micro ouvert mais silence total : micro coupé ? parle ou tape dans les mains.',
            donnees: { pic_dBFS: arrondi(pic, 0), appareil: piste?.label || null, parametres: piste?.getSettings?.() || null },
          });
          rAF = requestAnimationFrame(boucle);
        };
        rAF = requestAnimationFrame(boucle);
        const arretAuto = setTimeout(() => { off?.(); c.actif(false); }, 30000);
        off = () => { cancelAnimationFrame(rAF); clearTimeout(arretAuto); try { src.disconnect(); } catch (_) { /* ignore */ } flux.getTracks().forEach((t) => t.stop()); off = null; };
        c.actif(true);
        return { auto: 'attente', detail: 'Micro ouvert, en écoute…', donnees: { appareil: piste?.label || null } };
      },
      arreter() { off?.(); },
    };
  })();

  const camera = (() => {
    let off = null;
    return {
      id: 'camera', groupe: 'medias', titre: 'Caméra (aperçu)', live: true,
      aide: 'Demande la caméra et affiche l’aperçu. Tu peux basculer entre avant et arrière. Arrêt automatique après 60 s.',
      support: () => !!nav.mediaDevices?.getUserMedia,
      async lancer(c) {
        off?.();
        if (!nav.mediaDevices?.getUserMedia) return ko('getUserMedia absent (HTTPS requis, ou navigateur intégré).');
        const video = h('video', { class: 'apercu', muted: true, playsInline: true, autoplay: true });
        video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
        const set = lecture(c.zone, ['Résolution', 'Cadence', 'Caméra', 'Caméras vues']);
        let flux = null; let facing = 'user'; let dernier = null;
        const arretFlux = () => { flux?.getTracks().forEach((t) => t.stop()); flux = null; video.srcObject = null; };
        const ouvrir = async (f) => {
          arretFlux();
          flux = await nav.mediaDevices.getUserMedia({ video: { facingMode: { ideal: f }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
          facing = f;
          video.srcObject = flux;
          await video.play().catch(() => {});
          await new Promise((r) => { if (video.videoWidth) r(); else { video.addEventListener('loadedmetadata', r, { once: true }); setTimeout(r, 2500); } });
          const piste = flux.getVideoTracks()[0]; const st = piste.getSettings();
          let nb = null; try { nb = (await nav.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').length; } catch (_) { /* ignore */ }
          dernier = { largeur: video.videoWidth, hauteur: video.videoHeight, cadence: arrondi(st.frameRate, 0), facing: st.facingMode || f, etiquette: piste.label, nbCameras: nb };
          set('Résolution', `${video.videoWidth} × ${video.videoHeight}`); set('Cadence', (dernier.cadence ?? '—') + ' i/s');
          set('Caméra', `${dernier.etiquette || '—'} (${dernier.facing})`); set('Caméras vues', nb ?? '—');
          c.maj({ auto: video.videoWidth ? 'ok' : 'partiel', detail: video.videoWidth ? `Aperçu actif en ${video.videoWidth} × ${video.videoHeight}.` : 'Flux ouvert mais l’image n’arrive pas.', donnees: dernier });
        };
        const bascule = h('button', { class: 'btn ghost', type: 'button', onclick: async () => { try { await ouvrir(facing === 'user' ? 'environment' : 'user'); } catch (e) { c.maj({ auto: 'ko', detail: 'Bascule impossible : ' + erreur(e) }); } } }, 'Basculer avant / arrière');
        try { await ouvrir('user'); }
        catch (e) { return ko('Caméra refusée ou indisponible : ' + erreur(e)); }
        c.zone.prepend(video);
        c.zone.append(bascule);
        const arretAuto = setTimeout(() => { off?.(); c.actif(false); }, 60000);
        off = () => { clearTimeout(arretAuto); arretFlux(); c.zone.replaceChildren(); off = null; };
        c.actif(true);
        return { auto: 'ok', detail: dernier ? `Aperçu actif en ${dernier.largeur} × ${dernier.hauteur}.` : 'Aperçu actif.', donnees: dernier };
      },
      arreter() { off?.(); },
    };
  })();

  /* ═══════════════════ MESSAGES ET PARTAGE ═══════════════════ */

  const notifications = {
    id: 'notifications', groupe: 'messages', titre: 'Notifications système', subjectif: true,
    aide: 'Demande la permission puis envoie une notification. Garde la page ouverte, descends le rideau de notifications si besoin. iPhone : ne marche que si la page est ajoutée à l’écran d’accueil (PWA, iOS 16.4+).',
    support: () => 'Notification' in window,
    async lancer() {
      const pwa = B.standalone();
      const base = { standalone: pwa, serviceWorker: 'serviceWorker' in nav, pushManager: 'PushManager' in window };
      if (!('Notification' in window)) {
        return ko(B.estIOS && !pwa
          ? 'API Notification absente : sur iPhone la page doit d’abord être ajoutée à l’écran d’accueil (Partager > Sur l’écran d’accueil), puis rouverte depuis l’icône. PWA REQUISE.'
          : 'API Notification absente sur ce navigateur.', { ...base, pwaRequise: B.estIOS });
      }
      let perm = Notification.permission;
      if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch (e) { return ko('Demande de permission impossible : ' + erreur(e), base); } }
      if (perm !== 'granted') return ko(`Permission « ${perm} » (réglages du site pour la réactiver).`, { ...base, permission: perm });
      let voie = null;
      try {
        const reg = await B.sw();
        if (reg?.showNotification) {
          await reg.showNotification('STUDIO_REAL — banc d’essai', { body: 'Si tu lis ceci, les notifications marchent.', tag: 'banc-essai', vibrate: [100, 60, 100] });
          voie = 'serviceWorker';
        }
      } catch (_) { /* repli ci-dessous */ }
      if (!voie) {
        try { new Notification('STUDIO_REAL — banc d’essai', { body: 'Si tu lis ceci, les notifications marchent.', tag: 'banc-essai' }); voie = 'new Notification'; }
        catch (e) { return ko('Impossible d’afficher : ' + erreur(e), { ...base, permission: perm }); }
      }
      const iosHorsPwa = B.estIOS && !pwa;
      return {
        auto: iosHorsPwa ? 'partiel' : 'ok',
        detail: `Permission accordée, notification envoyée (${voie}). L’as-tu vue ?${iosHorsPwa ? ' (iPhone hors PWA : cas inattendu)' : ''}${'PushManager' in window ? ' · Push dispo' : ' · Push absent'}.`,
        donnees: { ...base, permission: perm, voie, pwaRequise: B.estIOS && !pwa },
      };
    },
  };

  const partage = {
    id: 'partage', groupe: 'messages', titre: 'Partage natif (Web Share)',
    aide: 'Ouvre la feuille de partage du système. Annule-la ensuite si tu ne veux rien envoyer : l’annulation compte comme un succès.',
    support: () => 'share' in nav,
    async lancer() {
      const donneesPartage = { title: 'STUDIO_REAL — banc d’essai', text: 'Test du partage natif.', url: location.href };
      let partageFichiers = false;
      try { partageFichiers = !!(nav.canShare && nav.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] })); } catch (_) { /* ignore */ }
      const base = { share: 'share' in nav, canShare: 'canShare' in nav, presse_papiers: !!nav.clipboard?.writeText, partageFichiers };
      if (!('share' in nav)) return ko('navigator.share absent (surtout les navigateurs de bureau).', base);
      try {
        await nav.share(donneesPartage);
        return { auto: 'ok', detail: 'Partage effectué.', donnees: base };
      } catch (e) {
        if (e?.name === 'AbortError') return { auto: 'ok', detail: 'Feuille de partage ouverte puis annulée : le partage fonctionne.', donnees: { ...base, annule: true } };
        return ko('Partage refusé : ' + erreur(e), base);
      }
    },
  };

  /* ═══════════════════ RÉSEAU ET DONNÉES ═══════════════════ */

  const CANDIDATS_WS = ['wss://echo.websocket.org', 'wss://ws.postman-echo.com/raw', 'wss://echo.websocket.events'];

  function essaiWS(url) {
    return new Promise((resolve) => {
      const t0 = performance.now(); const rtts = []; let connectMs = null; let fini = false; let envoi = 0; let tEnvoi = 0; let ws = null;
      const tm = setTimeout(() => fin({ ok: false, url, err: connectMs == null ? 'délai de connexion dépassé (6 s)' : 'pas d’écho reçu' }), 6000);
      function fin(r) {
        if (fini) return; fini = true; clearTimeout(tm);
        try { ws?.close(); } catch (_) { /* ignore */ }
        resolve(r);
      }
      try { ws = new WebSocket(url); } catch (e) { fin({ ok: false, url, err: erreur(e) }); return; }
      const ping = () => { tEnvoi = performance.now(); ws.send('banc:' + envoi); };
      ws.onopen = () => { connectMs = Math.round(performance.now() - t0); ping(); };
      ws.onmessage = (ev) => {
        if (ev.data !== 'banc:' + envoi) return;      // ignore le message d'accueil de certains serveurs
        rtts.push(Math.round(performance.now() - tEnvoi)); envoi++;
        if (envoi < 5) ping(); else fin({ ok: true, url, connectMs, rtts });
      };
      ws.onerror = () => fin({ ok: false, url, err: 'erreur réseau ou connexion bloquée' });
      ws.onclose = () => fin({ ok: false, url, err: 'connexion fermée' });
    });
  }

  const websocket = {
    id: 'websocket', groupe: 'reseau', titre: 'WebSocket (écho public)',
    aide: 'Ouvre un WebSocket sécurisé vers un serveur d’écho public (plusieurs essayés à la suite) et mesure 5 allers-retours. L’échec est toléré : il peut venir du serveur public ou du réseau de la salle.',
    support: () => 'WebSocket' in window,
    async lancer(c) {
      if (!('WebSocket' in window)) return ko('WebSocket absent.');
      const echecs = [];
      for (const url of CANDIDATS_WS) {
        c.maj({ auto: 'attente', detail: `Essai de ${url}…` });
        const r = await essaiWS(url);
        if (r.ok) {
          const tri = [...r.rtts].sort((a, b) => a - b);
          const med = tri[Math.floor(tri.length / 2)];
          return {
            auto: 'ok',
            detail: `${url} : connexion en ${r.connectMs} ms, aller-retour médian ${med} ms (${r.rtts.join(', ')}).${echecs.length ? ' Échecs avant : ' + echecs.map((e) => e.url + ' (' + e.err + ')').join(' ; ') : ''}`,
            donnees: { url, connexionMs: r.connectMs, rttMs: r.rtts, rttMedianMs: med, echecs },
          };
        }
        echecs.push(r);
      }
      return ko('Aucun serveur d’écho joignable : ' + echecs.map((e) => `${e.url} (${e.err})`).join(' ; '), { echecs });
    },
  };

  const horloge = {
    id: 'horloge', groupe: 'reseau', titre: 'Horloge : Date contre performance',
    aide: 'Mesure la précision des horloges du téléphone (résolution de performance.now, dérive de Date.now sur 2 s) et son décalage approximatif avec le serveur de cette page (en-tête HTTP Date, précis à ±1 s) : base de la synchronisation des effets.',
    support: () => 'performance' in window,
    async lancer(c) {
      c.maj({ auto: 'attente', detail: 'Mesure en cours (environ 3 s)…' });
      let res = Infinity; const debut = performance.now();
      while (performance.now() - debut < 60) { const a = performance.now(); let b = a; let k = 0; while ((b = performance.now()) === a && k++ < 1e6); if (b > a) res = Math.min(res, b - a); }
      const d0 = Date.now(); const p0 = performance.now();
      await sleep(2000);
      const dd = Date.now() - d0; const dp = performance.now() - p0;
      const derive = dd - dp;
      const ecartOrigine = Date.now() - (performance.timeOrigin + performance.now());
      let serveur = null;
      try {
        const mesures = [];
        for (let i = 0; i < 4; i++) {
          const w0 = Date.now(); const t0 = performance.now();
          const r = await fetch(location.pathname + '?h=' + Date.now() + i, { method: 'HEAD', cache: 'no-store' });
          const rtt = performance.now() - t0; const d = r.headers.get('date');
          if (d) mesures.push({ rtt, decalage: Date.parse(d) + 500 - (w0 + rtt / 2) });
          await sleep(150);
        }
        if (mesures.length) { mesures.sort((a, b) => a.rtt - b.rtt); serveur = { rttMs: Math.round(mesures[0].rtt), decalageMs: Math.round(mesures[0].decalage), precisionMs: 1000 + Math.round(mesures[0].rtt / 2) }; }
      } catch (_) { /* hors ligne */ }
      return {
        auto: 'ok',
        detail: `Résolution de performance.now : ${arrondi(res * 1000, 0)} µs. Sur 2 s, Date a dérivé de ${arrondi(derive, 1)} ms par rapport à performance.${serveur ? ` Décalage avec le serveur : ${serveur.decalageMs} ms (±${serveur.precisionMs} ms), aller-retour HTTP ${serveur.rttMs} ms.` : ' Décalage serveur non mesurable.'}`,
        donnees: { resolutionPerfUs: arrondi(res * 1000, 0), deriveDate2sMs: arrondi(derive, 2), ecartOrigineMs: arrondi(ecartOrigine, 1), serveur, fuseauDecalageMin: new Date().getTimezoneOffset() },
      };
    },
  };

  const stockage = {
    id: 'stockage', groupe: 'reseau', titre: 'Stockage local',
    aide: 'Écrit puis relit localStorage, sessionStorage, un cookie et IndexedDB. Si tu relances le test dans un autre onglet ou plus tard, il indique aussi si la visite précédente a survécu (Safari efface après 7 jours sans visite).',
    support: () => 'localStorage' in window,
    async lancer() {
      const jeton = 'j' + Math.random().toString(36).slice(2, 10);
      const ok = {};
      const essai = async (nom, f) => { try { ok[nom] = await f(); } catch (e) { ok[nom] = false; ok[nom + 'Erreur'] = erreur(e); } };
      await essai('localStorage', () => { localStorage.setItem('banc-test', jeton); const v = localStorage.getItem('banc-test') === jeton; localStorage.removeItem('banc-test'); return v; });
      await essai('sessionStorage', () => { sessionStorage.setItem('banc-test', jeton); const v = sessionStorage.getItem('banc-test') === jeton; sessionStorage.removeItem('banc-test'); return v; });
      await essai('cookie', () => { document.cookie = `banc_test=${jeton}; path=/; max-age=60; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; const v = document.cookie.includes(`banc_test=${jeton}`); document.cookie = 'banc_test=; path=/; max-age=0'; return v; });
      await essai('indexedDB', () => new Promise((res, rej) => {
        const rq = indexedDB.open('banc-essai', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('k');
        rq.onerror = () => rej(rq.error);
        rq.onsuccess = () => {
          const db = rq.result; const tx = db.transaction('k', 'readwrite');
          tx.objectStore('k').put(jeton, 'cle');
          tx.oncomplete = () => { const g = db.transaction('k').objectStore('k').get('cle'); g.onsuccess = () => { db.close(); res(g.result === jeton); }; g.onerror = () => rej(g.error); };
          tx.onerror = () => rej(tx.error);
        };
      }));
      let visitePrecedente = null;
      try {
        const k = 'banc-premiere-visite'; const avant = localStorage.getItem(k);
        if (avant) visitePrecedente = Math.round((Date.now() - Number(avant)) / 60000); else localStorage.setItem(k, String(Date.now()));
      } catch (_) { /* ignore */ }
      let quota = null; let persiste = null;
      try { const e = await nav.storage?.estimate?.(); if (e) quota = { utiliseMo: arrondi(e.usage / 1e6, 1), quotaMo: arrondi(e.quota / 1e6, 0) }; } catch (_) { /* ignore */ }
      try { persiste = await nav.storage?.persisted?.(); } catch (_) { /* ignore */ }
      const noms = ['localStorage', 'sessionStorage', 'cookie', 'indexedDB'];
      const nbOk = noms.filter((n) => ok[n] === true).length;
      return {
        auto: nbOk === 4 ? 'ok' : nbOk ? 'partiel' : 'ko',
        detail: `${noms.map((n) => `${n} ${ok[n] === true ? 'ok' : 'KO'}`).join(', ')}. ${visitePrecedente != null ? `Visite précédente retrouvée (il y a ${visitePrecedente} min).` : 'Première visite enregistrée : relance plus tard pour tester la persistance.'}${quota ? ` Quota ${quota.quotaMo} Mo.` : ''}`,
        donnees: { ...ok, visitePrecedenteMinutes: visitePrecedente, quota, persiste },
      };
    },
  };

  /* ═══════════════════ APPAREIL ═══════════════════ */

  const appareil = {
    id: 'appareil', groupe: 'appareil', titre: 'Infos appareil et navigateur',
    aide: 'Relève le navigateur, le système, le mode PWA et détecte les navigateurs intégrés (Instagram, Facebook, TikTok...) qui bloquent souvent caméra, capteurs ou plein écran.',
    support: () => true,
    async lancer() {
      const i = B.infos();
      const integre = i.navigateurIntegre;
      return {
        auto: integre ? 'partiel' : 'ok',
        detail: `${i.versionOS || i.os} ·${i.navigateur} · ${i.standalone ? 'PWA (écran d’accueil)' : 'onglet de navigateur'} · écran ${i.ecran.w}×${i.ecran.h} @${i.ecran.dpr}x.${integre ? ` ATTENTION : navigateur intégré détecté (${integre}) : ouvre la page dans Safari / Chrome pour des résultats fiables.` : ''}`,
        donnees: i,
      };
    },
  };

  return [
    couleur, flash, torche,
    vibration, haptique, son, sonAudio, audioSession, voix,
    pleinEcran, wakeLock, orientationLock, visibilite, clavier,
    accelerometre, orientation, geoloc, batterie, nfc,
    micro, camera,
    notifications, partage,
    websocket, horloge, stockage,
    appareil,
  ];
}
