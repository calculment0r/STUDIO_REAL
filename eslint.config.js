// Lint de tout le dépôt (ESLint 9, flat config) : TypeScript partout, React sur les
// interfaces (Conducteur, téléphone, ui-telephone), JavaScript des prototypes et outils
// avec les globals de leur environnement (Node pour les serveurs et scripts, navigateur
// pour les pages). Les fichiers de test adoucissent no-explicit-any et no-this-alias.
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'node_modules',
      '**/node_modules',
      'conducteur', // build Pages versionné (racine)
      '**/dist',
      '**/.wrangler',
      '**/*.d.ts',
      '**/coverage',
    ],
  },

  // ── TypeScript (recommandé) ──────────────────────────────────────────────
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
  // TS côté Node : serveurs, scripts, config vitest.
  {
    files: ['apps/serveur/**', 'apps/serveur-spectacle/**'],
    languageOptions: { globals: globals.node },
  },
  // TS côté navigateur : interfaces Conducteur, téléphone et ui-telephone.
  {
    files: ['apps/conducteur/src/**', 'apps/telephone/src/**', 'packages/ui-telephone/src/**'],
    languageOptions: { globals: globals.browser },
  },
  // Tests du Conducteur : node (process, spawnSync) ET navigateur (Edge, CDP).
  {
    files: ['apps/conducteur/**/*.test.ts', 'apps/conducteur/src/test-outils/**'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // ── React : hooks + fast refresh, uniquement sur les interfaces ─────────
  {
    files: ['apps/conducteur/**/*.tsx', 'apps/telephone/**/*.tsx', 'packages/ui-telephone/**/*.tsx'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // ── Fichiers de test : adoucissement ────────────────────────────────────
  {
    files: ['**/*.test.{ts,tsx}', '**/test-outils/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
    },
  },

  // ── JavaScript (recommandé) ─────────────────────────────────────────────
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
  // JS côté Node : serveur figurants, outils, serveurs, scripts du Conducteur.
  {
    files: [
      'prototypes/figurants/serveur/**',
      'outils/**',
      'apps/serveur-spectacle/**',
      'apps/serveur/**',
      'apps/conducteur/**/*.mjs',
    ],
    languageOptions: { globals: globals.node },
  },
  // JS côté navigateur : pages figurants, thème, prototypes, design.
  {
    files: [
      'prototypes/figurants/pages/**',
      'packages/theme/*.js',
      'prototypes/banc-essai/**',
      'prototypes/clavier/**',
      'prototypes/scene-pops/**',
      'conception/**',
      'design/**',
    ],
    languageOptions: { globals: globals.browser },
  },
)
