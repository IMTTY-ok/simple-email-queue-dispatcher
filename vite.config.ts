import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Resolve the Firebase project id.
 *
 * Priority:
 *   1. `VITE_FIREBASE_PROJECT_ID` — an explicit override
 *   2. the `default` project in `.firebaserc` — the single place to change
 *   3. the bundled demo project, so the repository works out of the box
 */
function resolveFirebaseProjectId(): string {
  const fromEnv = process.env.VITE_FIREBASE_PROJECT_ID;
  if (fromEnv) return fromEnv;

  try {
    const firebaserc = JSON.parse(readFileSync('.firebaserc', 'utf8'));
    const fromFirebaserc = firebaserc?.projects?.default;
    if (typeof fromFirebaserc === 'string' && fromFirebaserc) return fromFirebaserc;
  } catch {
    // no .firebaserc (or it is unreadable) — fall through to the default
  }

  return 'email-dispatcher-43118';
}

const firebaseProjectId = resolveFirebaseProjectId();

/**
 * The Functions emulator serves the API under
 * `http://127.0.0.1:5001/<project-id>/us-central1/backend`.
 */
const functionsEmulatorUrl = `http://127.0.0.1:5001/${firebaseProjectId}/us-central1/backend`;

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
        target: functionsEmulatorUrl,
        changeOrigin: true,
      },
    },
  },
});
