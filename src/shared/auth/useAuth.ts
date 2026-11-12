import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { api, errMessage } from '../api/client';

/**
 * Authentication for the dashboard.
 *
 * The account is created with Firebase Authentication (email + password).
 * The **role** is never chosen by the client — the server reads it from
 * `users/{uid}` and decides:
 *
 *   the first account ever created becomes `admin`
 *   every later account becomes `operator`
 *
 * A client can therefore never promote itself, whatever it sends.
 */

/** The two roles the application understands. */
export type Role = 'admin' | 'operator';

/** The profile the server keeps for each account. */
export interface AuthProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: Role;
  createdAt?: string;
}

/** Everything the dashboard needs to know about the signed-in account. */
export interface AuthState {
  user: User | null;
  profile: AuthProfile | null;
  role: Role | null;
  loading: boolean;
  error: string | null;
}

/**
 * Track the signed-in account and its server-side profile.
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    role: null,
    loading: true,
    error: null,
  });
  const registeredUid = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        registeredUid.current = null;
        setState({ user: null, profile: null, role: null, loading: false, error: null });
        return;
      }

      setState((p) => ({ ...p, user, loading: p.profile ? p.loading : true }));

      // Ask the server who we are. This creates the profile on first sign-in
      // and is idempotent afterwards.
      if (registeredUid.current !== user.uid) {
        registeredUid.current = user.uid;
        try {
          const { profile } = await api<{ profile: AuthProfile }>('/api/users/register', { method: 'POST' });
          setState({ user, profile, role: profile.role, loading: false, error: null });
        } catch (err) {
          registeredUid.current = null;
          setState({ user, profile: null, role: null, loading: false, error: errMessage(err) });
        }
      }
    });

    return unsubscribe;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setState((p) => ({ ...p, error: null }));
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      return { success: true };
    } catch (err) {
      return { success: false, error: readableAuthError(err) };
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    setState((p) => ({ ...p, error: null }));
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (displayName.trim()) {
        await updateProfile(credential.user, { displayName: displayName.trim() });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: readableAuthError(err) };
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    registeredUid.current = null;
    setState({ user: null, profile: null, role: null, loading: false, error: null });
  }, []);

  return {
    ...state,
    isAdmin: state.role === 'admin',
    signIn,
    signUp,
    signOut,
  };
}

/**
 * Turn a Firebase auth error into something a person can act on.
 */
export function readableAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That does not look like an email address.';
    case 'auth/missing-password':
      return 'Please enter a password.';
    case 'auth/weak-password':
      return 'Please choose a password of at least 6 characters.';
    case 'auth/email-already-in-use':
      return 'An account with that email already exists.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Wrong email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Could not reach the authentication service. Is the emulator running?';
    default:
      return errMessage(err);
  }
}
