// @studio-real/theme : Venus Rising, chargée à l'exécution. Script classique :
//   <script src="<chemin relatif>/packages/theme/venus.js" defer></script>
// La police est VERSIONNÉE dans ce paquet (polices/venus-rising.otf), à la demande du propriétaire (commit 88e2925).
// On essaie l'adresse posée en data-src sur la balise, puis le fichier à côté de ce script (polices/venus-rising.otf).
// Fichier introuvable (page qui a copié le script ailleurs) : rien ne casse, <html data-venus="repli"> et le texte reste
// en Chakra Petch 700 (repli de --f-disp). Installée dans le système, polices.css la prend aussi par local() (les deux
// faces coexistent sans gêne). Le Conducteur, lui, charge la même police par src/theme/polices.ts.
(function () {
  'use strict';
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
  var racine = document.documentElement;
  var balise = document.currentScript;
  var base = (balise && balise.src) || document.baseURI;
  var essais = [];
  if (balise && balise.dataset.src) essais.push(new URL(balise.dataset.src, document.baseURI).href);
  essais.push(new URL('polices/venus-rising.otf', base).href);

  (function suivant(i) {
    if (i >= essais.length) { racine.dataset.venus = 'repli'; return; }
    var face = new FontFace('Venus Rising', 'url("' + essais[i] + '") format("opentype")', { weight: '100 900', style: 'normal', display: 'swap' });
    face.load().then(
      function () { document.fonts.add(face); racine.dataset.venus = 'oui'; },
      function () { suivant(i + 1); }
    );
  })(0);
})();
