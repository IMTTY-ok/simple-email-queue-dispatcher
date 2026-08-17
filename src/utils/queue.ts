import type { Email, EmailStatus, Stats } from '../types/email';

/**
 * Generates the next sequential Email ID
 */
export function generateEmailId(counter: number): string {
  return `EML-${String(counter).padStart(3, '0')}`;
}

/**
 * Creates a new email object
 */
export function createEmail(
  id: string,
  recipient: string,
  subject: string,
  message: string,
  senderName?: string
): Email {
  const now = new Date().toISOString();
  return {
    id,
    recipient,
    subject,
    message,
    senderName,
    status: 'PENDING',
    attempts: 0,
    retries: 0,
    createdAt: now,
    updatedAt: now,
    finalStatus: null,
    logs: [],
  };
}

/**
 * Enqueue: add email to the rear of the queue
 */
export function enqueue(emails: Email[], email: Email): Email[] {
  return [...emails, email];
}

/**
 * Dequeue: remove and return the first email (FIFO)
 */
export function dequeue(emails: Email[]): { email: Email | null; remaining: Email[] } {
  if (emails.length === 0) return { email: null, remaining: [] };
  const [email, ...remaining] = emails;
  return { email, remaining };
}

/**
 * Get pending emails in the queue (not yet processed)
 */
export function getPendingEmails(emails: Email[]): Email[] {
  return emails.filter((e) => e.status === 'PENDING');
}

/**
 * Compute stats from all emails
 */
export function computeStats(emails: Email[]): Stats {
  const total = emails.length;
  const pending = emails.filter((e) => e.status === 'PENDING').length;
  const processing = emails.filter((e) => e.status === 'PROCESSING').length;
  const delivered = emails.filter((e) => e.status === 'DELIVERED').length;
  const failed = emails.filter((e) => e.status === 'FAILED').length;
  const retrying = emails.filter((e) => e.status === 'RETRYING').length;
  const totalAttempts = emails.reduce((sum, e) => sum + e.attempts, 0);
  const totalRetries = emails.reduce((sum, e) => sum + e.retries, 0);
  const processed = delivered + failed;
  const successRate = processed > 0 ? Math.round((delivered / processed) * 100) : 0;
  const failureRate = processed > 0 ? Math.round((failed / processed) * 100) : 0;

  return {
    total,
    pending,
    processing,
    delivered,
    failed,
    retrying,
    totalAttempts,
    totalRetries,
    successRate,
    failureRate,
  };
}

/**
 * Get status badge color classes
 */
export function getStatusColors(status: EmailStatus): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  switch (status) {
    case 'PENDING':
      return { bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-600', dot: 'bg-slate-400' };
    case 'PROCESSING':
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
