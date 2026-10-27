import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Le test d'intégration démarre `wrangler dev` : on laisse le temps au premier lancement.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
