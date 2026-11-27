import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En développement, Vite proxifie /api vers le backend : le frontend et l'API
// partagent la même origine, comme en production derrière nginx. Le cookie de
// session HttpOnly SameSite=Strict fonctionne donc sans configuration CORS particulière.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': { target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
});
