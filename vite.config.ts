import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { creador2dBackend } from './scripts/vite-plugin-creador2d.mjs';

import { workflowIndex } from './scripts/vite-plugin-workflow-index.mjs';

export default defineConfig(async () => {
  return {
    base: './',
    // El backend del Creador 2D se levanta junto al servidor de desarrollo.
    // Antes habia que arrancarlo a mano en otra ventana, y cuando ese proceso
    // moria el editor de mundos fallaba con ERR_CONNECTION_REFUSED.
    plugins: [react(), creador2dBackend({ raiz: __dirname }), workflowIndex({ raiz: __dirname })],
    // Prevent vite from obscuring rust errors
    clearScreen: false,
    // Tauri expects a fixed port, fail if that port is not available
    server: {
      port: 3142,
      strictPort: true,
      host: '127.0.0.1',
      watch: {
        ignored: [
          '**/src-tauri/**',
          '**/auth-server/**',
          '**/dist/**',
          '**/recursos-*/**',
          '**/*.exe',
          '**/*.zip',
          '**/*.tar.gz',
          '**/*.7z',
          '**/*.db',
          '**/*.log'
        ]
      }
    },
    // to make use of `TAURI_DEBUG` and other env variables
    // https://tauri.app/v1/api/config#buildconfig.beforedevcommand
    envPrefix: ['VITE_', 'TAURI_'],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
