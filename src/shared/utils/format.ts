/**
 * Shared formatting and validation helpers.
 *
 * Pure functions only — no React, no side effects, no Firebase.
 */

import type { EmailStatus } from '../types/email';

/** Matches a single, syntactically valid email address. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Format an ISO timestamp as `HH:MM:SS`.
 */
export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Validate an email address.
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

/**
 * Tailwind colour classes for a status badge.
 */
export function getStatusColors(status: EmailStatus): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  switch (status) {
    case 'QUEUED':
      return { bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-600', dot: 'bg-slate-400' };
    case 'SENDING':
      return { bg: 'bg-blue-900/40', text: 'text-blue-300', border: 'border-blue-500', dot: 'bg-blue-400' };
    case 'RETRYING':
      return { bg: 'bg-amber-900/40', text: 'text-amber-300', border: 'border-amber-500', dot: 'bg-amber-400' };
    case 'DELIVERED':
      return { bg: 'bg-emerald-900/40', text: 'text-emerald-300', border: 'border-emerald-500', dot: 'bg-emerald-400' };
    case 'FAILED':
      return { bg: 'bg-red-900/40', text: 'text-red-300', border: 'border-red-500', dot: 'bg-red-400' };
    default:
      return { bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-600', dot: 'bg-slate-400' };
  }
}

/**
 * Human label for a status.
 */
export function statusLabel(status: EmailStatus): string {
  return status;
}

/**
 * The total number of attempts an email with the given retry limit may make.
 * `retryLimit = 3` → 1 initial attempt + 3 retries = 4 total attempts.
 */
export function maxAttempts(retryLimit: number): number {
  return Math.max(1, retryLimit + 1);
}

/**
 * The percentage of the allowed attempts that have been used.
 */
export function attemptProgress(attempts: number, retryLimit: number): number {
  const total = maxAttempts(retryLimit);
  if (attempts <= 0) return 0;
  return Math.min(100, Math.round((attempts / total) * 100));
}
