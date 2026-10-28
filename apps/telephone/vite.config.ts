import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import paquet from './package.json' with { type: 'json' };

// L'application téléphone : servie par le serveur de spectacle sous /t/ (adresse fixe du QR, téléphones en 4G).
// La version et l'heure de construction partent dans hello.app (la régie compare : « sortie périmée, recharger »).
export default defineConfig({
  base: '/t/',
  plugins: [react()],
  define: {
    __VERSION_APP__: JSON.stringify(paquet.version),
    __BUILD_APP__: JSON.stringify(new Date().toISOString().slice(0, 16)),
  },
  server: { port: 5180 },
  build: { outDir: 'dist', emptyOutDir: true, target: ['es2020', 'safari15'], assetsInlineLimit: 0 },
});
