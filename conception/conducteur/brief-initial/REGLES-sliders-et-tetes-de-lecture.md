---
name: theme-showrunner-sliders-et-tetes
description: "Le theme de SHOWRUNNER_TOOLS fait loi — et deux composants ont ete rates plusieurs fois : les sliders et les tetes de lecture"
metadata:
  node_type: memory
  type: feedback
  originSessionId: e5d29066-2c9b-426d-acc6-baa499e8ad93
  modified: 2026-10-09T13:08:25.441Z
---

SUPERVISIO doit passer dans le theme de **SHOWRUNNER_TOOLS**
(github.com/calculment0r/SHOWRUNNER_TOOLS, public), et a terme y etre
integre. Son `CLAUDE.md` porte les regles dures ; `commun/tokens.css` est la
seule source des couleurs, `commun/base.css` les composants.

**DEUX COMPOSANTS QUE J'AI RATES PLUSIEURS FOIS, dits par Cal le 09/10 :
« on a designe des sliders et a chaque fois tu m'as mis des sliders de
merde », et « on a mis des conventions sur les tetes de lecture qui doivent
etre identiques ».**

1. **LES SLIDERS** — `commun/curseur.css`. C'est le **fader de console
   d'ODIO, couche** : rail creux arrondi (--panel3 sous un filet, trait fin
   au milieu), chapeau **plein rectangulaire 10x20 aux coins doux** avec une
   encoche au milieu, porte par son ombre. Pose sous `:where()` sans classe :
   tout `input[type=range]` le prend. Decision du 06/10 : « **je ne veux plus
   aucun de ces sliders avec le rond tout simple** ». Jamais de pouce rond.
   Le modele d'origine : `musique/nodal.css` (.fader / .machine__fader).

2. **LES TETES DE LECTURE** — `commun/tete.css` + `commun/tete.js`. Decision
   du 30/09 : « il serait bien que toutes nos timelines aient la meme cue
   partout, celle du montage video est bien ». `.sr-ph` : trait orange 2 px
   pleine hauteur, onglet 11 px en haut arrondi dessous, deplace par
   `transform` sur son propre calque. `.sr-mk` : graduations en timecode
   HH:MM:SS:FF (mono 8 px). Les fonctions : `tete()`, `poser()`, `suivre()`,
   `peindreRegle()`, `brancherRegle()`, `tc()`. La variante timeline du
   curseur est `.tl` dans `base.css` (thumb 4x28 orange, la piste est la
   `.track` dessous).

Les autres regles dures du theme : aucune couleur en dur (un jeton manque, on
l'ajoute) ; **filets, jamais de bordures** (`box-shadow: inset 0 0 0 1px`) ;
**un seul `.tb.go` orange par ecran**, l'orange est l'action ; les capitales
sont pour la machine (mono, espace, petit), la prose en bas de casse ;
Norelli pour le seul logotype, Venus Rising pour l'affichage ; deux themes
par les seuls jetons, sombre par defaut, clair sous `[data-theme="light"]`.

**How to apply:** avant d'ecrire un curseur ou une tete de lecture dans
SUPERVISIO, relire ces deux fichiers du depot SHOWRUNNER_TOOLS et les
reprendre tels quels — ne jamais en redessiner un. Voir
[[niko-teste-en-ligne-jamais-en-local]].
