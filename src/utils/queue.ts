import type { EmailStatus } from '../types/email';

/**
 * Format timestamp to HH:MM:SS
 */
export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * Get status badge color classes for the new real-dispatch statuses.
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
 * Human label for a status
 */
export function statusLabel(status: EmailStatus): string {
  switch (status) {
    case 'QUEUED':
      return 'QUEUED';
    case 'SENDING':
      return 'SENDING';
    case 'RETRYING':
      return 'RETRYING';
    case 'DELIVERED':
      return 'DELIVERED';
    case 'FAILED':
      return 'FAILED';
    default:
      return status;
  }
}