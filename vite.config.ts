import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The Firebase SDK is the bulk of the bundle — splitting it into its
    // own chunk keeps the app chunk small and lets the SDK stay cached
    // across deploys.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/ },
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  server: {
    proxy: {
      // Development proxy → Firebase Cloud Functions emulator (functions)
      '/api': {
        target: 'http://127.0.0.1:5001/email-dispatcher-43118/us-central1/backend',
        changeOrigin: true,
      },
    },
  },
});
