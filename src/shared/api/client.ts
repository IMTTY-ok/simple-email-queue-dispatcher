/**
 * Shared HTTP client for the Cloud Function API.
 *
 * Every request the dashboard makes goes through `api()`. It resolves the
 * base URL once, sends JSON, and turns a non-2xx response into a readable
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
 * Perform a JSON request against the API.
 * @throws {Error} with a human-readable message when the request fails.
 */
export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const init: RequestInit = {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  };
  const res = await fetch(apiUrl(path), init);
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
