import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

/**
 * Centralised Firebase initialisation.
 *
 * The web config is public by design — it only identifies the project and
 * grants the read access the Firestore rules allow. Every write goes through
 * the Cloud Function, so the browser never needs write permission (see
 * `firestore.rules`).
 *
 * The web API key should still be restricted in the Google Cloud console
 * (HTTP referrers + the Firebase APIs that are actually needed).
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyB5K2NW97RQbeTELu7_c15RR-NUX8YO05c',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'email-dispatcher-43118.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'email-dispatcher-43118',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'email-dispatcher-43118.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '389434670471',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:389434670471:web:affe0e8192a17a4426a722',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-D2ZWYKFQMZ',
};

export const app = initializeApp(firebaseConfig);

/** Firebase Authentication — the dashboard requires a signed-in account. */
export const auth = getAuth(app);

/** Firestore — read-only from the browser; every write goes through the API. */
export const db = getFirestore(app);

if (import.meta.env.DEV) {
  // Local development: authentication, backend and database all live in the
  // Firebase Emulator Suite. `connectAuthEmulator` has to run before the
  // first auth call, and it may only be called once per session.
  if (!auth.emulatorConfig) {
    // The Firebase SDK needs the full URL, scheme included.
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

if (typeof window !== 'undefined') {
  try {
    getAnalytics(app);
  } catch {
    // analytics is optional
  }
}
