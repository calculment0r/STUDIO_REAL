// @studio-real/theme : Venus Rising, chargée SEULEMENT si elle est présente en local. Script classique :
//   <script src="<chemin relatif>/packages/theme/venus.js" defer></script>
// La police n'a pas de licence connue : elle n'est jamais copiée dans ce paquet. On essaie l'adresse posée en
// data-src sur la balise, puis le fichier hors git du design (conception/conducteur/source/uploads/, à deux dossiers
// de ce paquet dans le dépôt), puis /polices-privees/ (le serveur de dev du Conducteur). Absente (dépôt cloné,
// GitHub Pages) : rien ne casse, <html data-venus="repli"> et le texte reste en Chakra Petch 700 (repli de --f-disp).
// Installée dans le système, polices.css la prend aussi par local() (les deux faces coexistent sans gêne).
(function () {
  'use strict';
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
  var racine = document.documentElement;
  var balise = document.currentScript;
  var base = (balise && balise.src) || document.baseURI;
  var essais = [];
  if (balise && balise.dataset.src) essais.push(new URL(balise.dataset.src, document.baseURI).href);
  essais.push(new URL('../../conception/conducteur/source/uploads/Venus%20Rising%20Rg.otf', base).href);
  essais.push(new URL('/polices-privees/Venus%20Rising%20Rg.otf', document.baseURI).href);

  (function suivant(i) {
    if (i >= essais.length) { racine.dataset.venus = 'repli'; return; }
    var face = new FontFace('Venus Rising', 'url("' + essais[i] + '") format("opentype")', { weight: '100 900', style: 'normal', display: 'swap' });
    face.load().then(
      function () { document.fonts.add(face); racine.dataset.venus = 'oui'; },
      function () { suivant(i + 1); }
    );
  })(0);
})();
