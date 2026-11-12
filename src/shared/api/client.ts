import { auth } from '../lib/firebase';

/**
 * Shared HTTP client for the Cloud Function API.
 *
 * Every request the dashboard makes goes through `api()`. It resolves the
 * base URL once, attaches the signed-in account's Firebase ID token as a
 * bearer token, sends JSON, and turns a non-2xx response into a readable
 * `Error` so callers never have to inspect the raw response.
 */

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

/**
 * Build the absolute URL for an API path.
 * Without `VITE_API_URL` the path stays relative and the Vite dev proxy
 * forwards it to the Functions emulator.
 */
export function apiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}

/**
 * The current account's ID token, or `null` when nobody is signed in.
 * The token is refreshed automatically by the Firebase SDK.
 */
async function idToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * Perform a JSON request against the API.
 *
 * @throws {Error} with a human-readable message when the request fails.
 */
export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await idToken();

  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(apiUrl(path), { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

/**
 * Turn an unknown thrown value into a readable message.
 */
export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
