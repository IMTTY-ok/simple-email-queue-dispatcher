import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

// Web client config — public by design (only ever authorizes the frontend to
// READ the dashboard collections; writes are blocked by Firestore rules).
const firebaseConfig = {
  apiKey: 'AIzaSyB5K2NW97RQbeTELu7_c15RR-NUX8YO05c',
  authDomain: 'email-dispatcher-43118.firebaseapp.com',
  projectId: 'email-dispatcher-43118',
  storageBucket: 'email-dispatcher-43118.firebasestorage.app',
  messagingSenderId: '389434670471',
  appId: '1:389434670471:web:affe0e8192a17a4426a722',
  measurementId: 'G-D2ZWYKFQMZ',
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

if (import.meta.env.DEV) {
  // local development: backend + database live in the Firebase Emulator Suite
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

if (typeof window !== 'undefined') {
  try {
    getAnalytics(app);
  } catch {
    // analytics is optional
  }
}