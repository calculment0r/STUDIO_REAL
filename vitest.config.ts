// Projets vitest (vitest 3.2 : `test.projects` remplace le fichier vitest.workspace.ts, devenu obsolète) : un projet
// par famille de tests, pour séparer le rapide du lent.
//   rapides (npm test)        : modele, conducteur-rapide, serveur-logique, figurants  → aucun serveur, aucun navigateur
//   lents (npm run test:lent) : conducteur-lent (wrangler dev + Edge sans tête), serveur-integration (wrangler dev)
//   tout  (npm run test:tout) : les six projets
// Chaque projet garde les réglages de son vitest.config / vite.config (timeouts du serveur, environnement…) : on les
// étend ici, on ne les recopie pas. Attention : à l'extension, vite CONCATÈNE les listes (include, exclude) au lieu de
// les remplacer ; d'où le découpage par `exclude` pour le serveur, dont la config déclare déjà `include`.
import { configDefaults, defineConfig } from 'vitest/config';

/** Fichiers lents du Conducteur : serveur wrangler et/ou Edge sans tête. */
const LENTS_CONDUCTEUR = ['**/*.edge.test.ts', '**/integration.serveur.test.ts'];

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'modele', root: './packages/modele' },
      },
      {
        extends: './apps/conducteur/vite.config.ts',
        test: { name: 'conducteur-rapide', root: './apps/conducteur', exclude: [...configDefaults.exclude, ...LENTS_CONDUCTEUR] },
      },
      {
        extends: './apps/conducteur/vite.config.ts',
        test: { name: 'conducteur-lent', root: './apps/conducteur', include: LENTS_CONDUCTEUR, testTimeout: 120_000, hookTimeout: 240_000 },
      },
      {
        extends: './apps/serveur/vitest.config.ts',
        test: { name: 'serveur-logique', root: './apps/serveur', exclude: [...configDefaults.exclude, 'tests/integration/**'] },
      },
      {
        extends: './apps/serveur/vitest.config.ts',
        test: { name: 'serveur-integration', root: './apps/serveur', exclude: [...configDefaults.exclude, 'tests/logique/**'] },
      },
      {
        test: {
          name: 'figurants',
          root: './prototypes/figurants/serveur',
          include: ['**/*.test.mjs'],
          environment: 'node',
          passWithNoTests: true,
        },
      },
    ],
  },
});
