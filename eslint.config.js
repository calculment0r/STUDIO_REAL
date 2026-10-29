// Lint de tout le dépôt (ESLint 9, configuration plate) : une seule configuration, à la racine.
// Lancer : `npm run lint` (ou `npm run lint:corriger` pour les corrections automatiques).
//
// Les dépendances ESLint (eslint, @eslint/js, typescript-eslint, eslint-plugin-react-hooks,
// eslint-plugin-react-refresh, globals) restent déclarées dans apps/conducteur/package.json et sont
// hissées à la racine de node_modules par les workspaces : ne pas les déplacer sans raison.
//
// Pas de Prettier. Les règles « recommandées » sont des erreurs ; seules quelques règles de confort
// sont en avertissement (react-refresh, max-len, any/this-alias dans les tests).
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// Zones de code (chemins relatifs à la racine du dépôt).
const ZONES_NODE = [
  'apps/serveur/**',
  'apps/serveur-spectacle/**',
  'outils/**',
  'prototypes/figurants/serveur/**',
  '**/*.mjs',
  '**/*.cjs',
  '**/vite.config.ts',
  '**/vitest.config.ts',
  'projets/**/*.ts',
]
const ZONES_NAVIGATEUR = [
  'apps/conducteur/src/**',
  'apps/telephone/src/**',
  'packages/ui-telephone/src/**',
  'packages/emulateur/src/**',
  'packages/theme/*.js',
  'prototypes/banc-essai/**',
  'prototypes/clavier/**',
  'prototypes/scene-pops/**',
  'prototypes/figurants/pages/**',
  'conception/**',
  'design/**',
]
const ZONES_REACT = [
  'apps/conducteur/**/*.{ts,tsx}',
  'packages/ui-telephone/**/*.{ts,tsx}',
  'apps/telephone/**/*.{ts,tsx}',
]
const FICHIERS_TEST = ['**/*.test.{ts,tsx,js,mjs}', '**/test-outils/**', '**/tests/**']
const FICHIERS_TEST_TS = ['**/*.test.{ts,tsx}', '**/test-outils/**/*.{ts,tsx}', '**/tests/**/*.{ts,tsx}']

export default tseslint.config(
  {
    ignores: [
      '**/node_modules',
      'conducteur/**', // build Pages versionné à la racine (généré par `npm run pages`)
      '**/dist',
      '**/build',
      '**/.wrangler',
      '**/*.d.ts',
      '**/coverage',
      'medias-locales/**',
      'prototypes/**/vendor/**',
      // Fichiers du design exportés par l'outil de design, gardés en local seulement (ignorés par git).
      'conception/conducteur/source/support.js',
      'conception/conducteur/source/uploads/**',
    ],
  },

  // ── JavaScript et TypeScript : règles recommandées ──────────────────────
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
  },

  // ── Conventions communes ────────────────────────────────────────────────
  // Variables, paramètres et éléments déstructurés préfixés par _ : volontairement inutilisés.
  // Un bloc catch vide est accepté (échec toléré : stockage, JSON, fermeture de socket).
  {
    files: ['**/*.{js,mjs,cjs}'],
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    rules: { 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
  // Sources exportées par l'outil de design (code compact, paramètres de rappel non utilisés) : arguments non vérifiés.
  {
    files: ['conception/**', 'design/**'],
    rules: { 'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },

  // ── Globals par zone ────────────────────────────────────────────────────
  { files: ZONES_NODE, languageOptions: { globals: globals.node } },
  { files: ZONES_NAVIGATEUR, languageOptions: { globals: globals.browser } },
  // Service worker du banc d'essai : globals du worker, pas de la page.
  { files: ['prototypes/banc-essai/sw.js'], languageOptions: { globals: globals.serviceworker } },
  // Tests : Node (process, spawnSync) ET navigateur (Edge piloté par CDP, DOM simulé).
  {
    files: FICHIERS_TEST,
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // ── React : règles des hooks sur les interfaces (.ts et .tsx : les hooks vivent aussi en .ts) ──
  {
    files: ZONES_REACT,
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  // Rafraîchissement à chaud : seulement les composants .tsx du Conducteur, en avertissement.
  {
    files: ['apps/conducteur/**/*.tsx'],
    plugins: { 'react-refresh': reactRefresh },
    rules: { 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }] },
  },

  // ── Tests et outils de test : any et alias de this tolérés (avertissement) ─────
  {
    files: FICHIERS_TEST_TS,
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
    },
  },

  // ── Longueur de ligne : avertissement partout (les lignes de commentaire, dont l'en-tête, sont exclues) ──
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    rules: {
      'max-len': ['warn', { code: 200, ignoreComments: true, ignoreUrls: true }],
    },
  },
)
