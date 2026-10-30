# Conducteur : architecture et partage du travail

Application web (Vite + React 19 + TypeScript + zustand) qui reproduit **fidèlement** le design de
`conception/conducteur/` (référence : `Studio Real Conducteur (statique).html` à ouvrir dans Chrome ; code lisible dans
`source/Studio Real Conducteur.dc.html`, `source/studio-real/*.js`). Règles : `conception/conducteur/LISEZMOI-claude-code.md`.

## Dossiers et propriétaires (un chantier = un dossier ; ne pas écrire dans le dossier d'un autre)

| Dossier | Contenu | Chantier |
|---|---|---|
| `packages/modele/src/` | format du projet (`types.ts`), contrat du moteur (`moteur.ts`), exemple de démonstration, moteur de lecture, validation, tests | MODÈLE |
| `src/theme/` | `index.css` (importe le paquet `@studio-real/theme` : jetons, polices, base, composants), `jetons.ts` (lit les jetons pour les canvas), `polices.ts` (Venus Rising), `format.ts` | COQUILLE |
| `src/etat/` | magasin zustand (`magasin.ts`) : projet, sélection, mode, lecture, zoom ; persistance locale ; annuler/rétablir | COQUILLE |
| `src/coquille/` | mise en page générale, en-tête (chiffres à largeur fixe), panneau de droite à 3 niveaux, tiroir des assets, salle simulée, export/import JSON, raccourcis clavier, plein écran | COQUILLE |
| `src/conduite/` | la conduite (bas) : actes → moments → passages, pistes, zoom et défilement façon Premiere, tête de lecture | CONDUITE |
| `src/planche/` | la planche (haut) : étapes et sorties d'un moment, zoom sémantique, caméra qui suit en mode Jouer | PLANCHE |
| `src/blocs/` | catalogue des blocs (34 du design + 10 de `etude-10-blocs.md`) et leurs aperçus animés | BLOCS |
| `apps/serveur/` | Cloudflare Worker + Durable Object + D1 + R2 : projets, médias, salle temps réel, présence | SERVEUR |
| `projets/live/` | le projet du spectacle LIVE au format `studio-real/conducteur@1` | PROJET LIVE |

## Contrats entre chantiers
- **Format** : `@studio-real/modele` → `types.ts` (ne pas le modifier sans le dire dans son rapport ; un ajout de champ optionnel est permis).
- **Moteur** : `@studio-real/modele` → `moteur.ts` (signatures). Le chantier MODÈLE exporte `creerLecteur` et `signauxSalle` depuis `index.ts`.
- **Magasin** (`src/etat/magasin.ts`, chantier COQUILLE) : `useMagasin` (zustand) expose au minimum
  `projet`, `selection: { moment?: string; etape?: string }` (étendue : `sortie`, `passage`, `acte`, `piste`…), `mode: 'repetition' | 'spectacle'` (audit UX d'octobre 2026 : RÉPÉTITION par défaut, SPECTACLE = structure verrouillée, lecteur stable, ×1, Espace = GO ; `changerMode` accepte encore 'preparer' / 'ecrire' / 'repeter' → 'repetition' et 'jouer' → 'spectacle'),
  `lecture: EtatLecture | null`, `zoomPlanche`, `zoomConduite`, et les actions `selectionner`, `modifierProjet(fn)`,
  `lancer()`, `pause()`, `go()` (le GO unique : un appui = un cue ; `top()` en est l'ancien nom), `allerA()`. CONDUITE et PLANCHE lisent et appellent ces actions, rien d'autre.
- **Blocs** (chantier BLOCS) : `src/blocs/index.ts` exporte `CATALOGUE` (familles, blocs, réglages, sorties nommées) et
  le composant `<ApercuBloc ty={…} k={…} t={…} actif={…} />` (aperçu animé dans le bloc). PLANCHE l'utilise.
- **Composants exportés** : `src/conduite/Conduite.tsx` (`<Conduite />`), `src/planche/Planche.tsx` (`<Planche />`),
  `src/coquille/App.tsx` (`<App />` qui assemble tout).

## Règles de design (extrait, voir LISEZMOI)
Fond `#0a0d0b`, rampe corail `#f0b49b → #7a3a22`, verts `#1a3f2c / #2f6b4a`, accent `#e0674a`, encre tech `#b9cfd8`,
thème clair complet (`data-theme="light"`). Titres et **tous les chiffres** en Venus Rising (repli libre : voir `src/theme`),
texte en Chakra Petch, micro-étiquettes en Azeret Mono 7–9 px capitales. Tout chiffre qui change dans un en-tête a une
largeur fixe et des chiffres tabulaires ; les temps sont `MM:SS` entiers. Aucune couleur en dur hors des jetons.
**La police Venus Rising n'a pas de licence connue : elle n'entre pas dans le dépôt public** (fichier local hors git
`conception/conducteur/source/uploads/`, chargé seulement s'il est présent ; repli : Chakra Petch 700).
