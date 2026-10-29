# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Lint

- Une seule configuration pour tout le dépôt : `eslint.config.js` à la racine (il n'y en a plus dans `apps/conducteur`). Les dépendances ESLint restent déclarées dans `apps/conducteur/package.json`, hissées à la racine par les workspaces.
- Lancer : `npm run lint` depuis la racine (tout le dépôt) ou `npm run lint` dans `apps/conducteur` (ce dossier seul, même configuration). `npm run lint:corriger` applique les corrections automatiques.
- Règles : `js.configs.recommended` et `tseslint.configs.recommended` en erreur ; règles react-hooks sur le Conducteur, `ui-telephone` et `telephone` (`.ts` et `.tsx`) ; pas de Prettier. Le lint est bloquant dans la CI (`.github/workflows/verifier.yml`) : 0 erreur exigée, les avertissements ne bloquent pas.
- Avertissements restants : 361 au total, produits par 4 règles. `max-len` (200 colonnes, commentaires exclus) : 309, surtout dans les prototypes et les tests. `@typescript-eslint/no-explicit-any` : 30 et `@typescript-eslint/no-this-alias` : 1, tolérés dans les tests et `test-outils` seulement (partout ailleurs ce sont des erreurs). `react-refresh/only-export-components` : 21, sur les `.tsx` du Conducteur (un fichier qui exporte un composant et autre chose coupe le rafraîchissement à chaud ; sans danger).
- Conventions : un nom commençant par `_` est volontairement inutilisé ; un `catch` vide est accepté ; pour une exception ponctuelle, écrire `// eslint-disable-next-line <règle> -- <raison>`.
- Ignorés : `node_modules`, `dist`, `build`, le dossier `conducteur/` de la racine (build Pages généré), `medias-locales`, `**/*.d.ts`, `prototypes/**/vendor`.
