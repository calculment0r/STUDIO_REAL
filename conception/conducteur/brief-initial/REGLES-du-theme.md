## Le thème — règles dures (les mêmes que Character Factory)

`commun/tokens.css` est la seule source des couleurs, `commun/base.css`
les composants (repris du rack de Character Factory), `commun/shell.css`
le portail.

1. **Aucune couleur en dur.** Une teinte manque : on ajoute un jeton.
2. **Deux thèmes, par les seuls jetons.** Décision de Cal du 29/09/2026 :
   « on a l'éditeur de thème par exemple car on devra avoir un thème clair
   aussi ». Le sombre reste le défaut (`:root` de `commun/tokens.css`) ; le
   clair redonne les mêmes noms sous `[data-theme="light"]`, dans le même
   fichier ; « le mien » (l'éditeur, `commun/theme.html`) ne fait que
   surcharger ces noms, en ligne sur `<html>`. `commun/theme.js` pose le
   thème au chargement (préférence Général, `commun/prefs.js`). Rien d'autre
   ne change : aucune couleur en dur, un composant ne sait jamais quel thème
   est posé ; un jeton neuf se déclare dans les deux blocs, et le clair se
   tient au contraste AA (`docs/etudes/preferences.md`).
3. **Filets, jamais de bordures** : `box-shadow: inset 0 0 0 1px`.
4. **Un seul `.tb.go` orange par écran.** L'orange est l'action.
5. **Les capitales sont pour la machine** (mono, espacé, petit). La prose
   reste en bas de casse.
6. **Norelli ne contient que A-Z, a-z et l'espace** : le logotype et le
   titre de l'accueil seulement. Le reste de l'affichage : Venus Rising.
7. Une action désactivée dit pourquoi et mène à ce qui la débloque ; rien
   à « enregistrer » qui pourrait s'enregistrer seul.

## Le code

- `server/` : Python 3.12, **bibliothèque standard** (+ PIL, présent sur
  les DGX). Un module par outil dans `server/tools/`, qui expose
  `register(app)`. Le socle : `server/core/`.
- **Toute adresse de machine passe par `server/core/config.py`** (`MACHINES`, `adresse()`, `url()`, `autre()` ;
  les scripts : `tools/relais_aide.py`) : jamais une IP de DGX en dur dans le code (hors textes d'aide et essais).
  La machine elle-même est
  127.0.0.1, l'autre est jointe par le câble — c'est ce qui permet au même code de servir le portail sur DGX1
  (le relais, 16/10). Un réglage de `showrunner.local.json` écrit pour une machine se traduit pour l'autre
  (`config.traduire`).
- Les pages : HTML + modules ES sans étape de construction ; tout ce qui
  est commun passe par `commun/shell.js` (`api`, `jobs`, `pick`,
  `mountHeader`, `thumb`, `refBoard`, `uploadFile`).
- **Toute zone qui accepte un asset accepte aussi un fichier du disque**, via `commun/depot.js` (`dropZone`, ou
  `envoyerFichiers` dans un écouteur propre) : le fichier devient un asset, puis fait ce que ferait une carte du panneau
  Asset lâchée au même endroit. Jamais de garde-fou `dragover`/`drop` sur la fenêtre dans un outil (`gardeMessage`) :
  celui d'Image refusait tout fichier (16/10, `docs/ARCHITECTURE.md` § 14).
- **Comment s'écrit une référence dans un texte** (Cal, 16/10) : tout ce qui n'est pas un élément (image, capture collée, son, vidéo) par son
  SEUL jeton (`@image1`, `@video1`, `@audio1`), jamais un nom tiré du titre ni « Nommer… » ; un élément de la bibliothèque d'éléments (personnage
  de Character Factory, objet 3D, lieu) par son nom (`@Auguste`). **Le titre d'un fichier n'entre jamais dans le texte** (raccourci à
  l'affichage des cartes et menus, entier au survol). Un dépôt dans un champ empêche le dépôt natif et écrit la mention au point de chute. Un mot qui pose
  problème est souligné en pointillé dans le champ (bulle, clic) : jamais de remarque sous le champ (`commun/mentions.js`, `commun/entrees.js`).
- **Tout menu de format montre la forme du ratio** (`commun/forme_format.js`, demande de Cal du 16/10 : on doit voir
  d'un coup d'œil si on est vertical ou horizontal) : `forme: '16:9'` sur une entrée de `menu.js`, `formeFormat(…)`
  devant le texte d'un bouton ou d'une tuile, `formeSelect(…)` devant un `<select>`. Jamais de forme dessinée à la main.
- Les graphes éprouvés de Character Factory (Krea 2, Qwen-Image 2.1) sont
  importés depuis `character_factory/factory/` (réglage `cf_repo`, défaut
  `<dépôt>/character_factory`), pas recopiés : une seule vérité.
- **Character Factory, la chaîne** (`character_factory/`, son `CLAUDE.md` à lui : règles propres à la chaîne) :
  tout en local, pas d'API ; images du personnage par **Krea 2** (décision de Cal du 28/09), Qwen-Image 2.1 pour
  l'A-pose et les vues ; conventions mètres, Y en haut, +Z devant ; les règles du brief tenues par le code (visage
  étages dans l'ordre, alignement des vues à ±5°, pas de bind en T-pose) ne s'affaiblissent
  pas sans décision de Cal. Les pages de ce dossier (`studio.html`…) sont l'ancienne copie : le front est dans
  `character/`. Après toute modification de `character_factory/factory/` : `python3 tools/check.py cf`.

## Vérifier
