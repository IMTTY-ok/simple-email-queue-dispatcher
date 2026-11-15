import type { ActivityEntry, AttemptLog, DispatcherState, Email, EmailFormData, ServerConfig, Stats } from './types/email';

/**
 * Mapping helpers between the Firestore/REST payloads and the shared types.
 *
 * The server stores plain JSON, so these mappers are deliberately defensive:
 * a partially-written document must never crash the dashboard render.
 */

/** Statistics counters → the shape the dashboard renders. */
export function statsFromDoc(doc: Record<string, unknown>): Stats {
  const delivered = Number(doc.delivered) || 0;
  const failed = Number(doc.failed) || 0;
  const processed = delivered + failed;
  const retrying = Number(doc.retrying) || 0;
  return {
    total: Number(doc.total) || 0,
    queued: Number(doc.queued) || 0,
    sending: (Number(doc.sending) || 0) + retrying,
    delivered,
    failed,
    retrying,
    // Module 6 — Scheduled Delivery
    scheduled: Number(doc.scheduled) || 0,
    cancelled: Number(doc.cancelled) || 0,
    totalAttempts: Number(doc.totalAttempts) || 0,
    totalRetries: Number(doc.totalRetries) || 0,
    successRate: processed > 0 ? Math.round((delivered / processed) * 100) : 0,
    failureRate: processed > 0 ? Math.round((failed / processed) * 100) : 0,
  };
}

/**
 * The `_config/main` document → the sanitized server configuration.
 * Mirrors `publicConfig()` on the server.
 */
export function configFromDoc(doc: Record<string, unknown>): ServerConfig | null {
  if (!doc || Object.keys(doc).length === 0) return null;
  const smtp = (doc.smtp && typeof doc.smtp === 'object' ? doc.smtp : {}) as Record<string, unknown>;
  const host = String(smtp.host ?? '');
  const user = String(smtp.user ?? '');
  const hasPassword = doc.passwordSet === true;
  const dryRun = doc.dryRun === true;
  return {
    smtp: {
      host,
      port: Number(smtp.port) || 587,
      secure: smtp.secure === true,
      user,
      pass: '',
      fromName: String(smtp.fromName ?? 'Email Dispatcher'),
      fromEmail: String(smtp.fromEmail ?? ''),
    },
    hasPassword,
    smtpConfigured: dryRun ? true : Boolean(host && user && hasPassword),
    dryRun,
    simulationMode: (doc.simulationMode as ServerConfig['simulationMode']) ?? 'AUTOMATIC',
    retryLimit: Number(doc.retryLimit) || 3,
    retryDelayMs: Number(doc.retryDelayMs) || 3000,
    interEmailDelayMs: Number(doc.interEmailDelayMs) || 1200,
  };
}

/**
 * Normalise a timestamp that may be a Firestore `Timestamp`, an ISO string
 * or epoch milliseconds into an ISO-8601 string.
 */
function toIsoString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : value;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const maybe = value as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === 'function') return maybe.toDate().toISOString();
  if (typeof maybe.seconds === 'number') return new Date(maybe.seconds * 1000).toISOString();
  return null;
}

/** A raw Firestore document → an `Email`. */
export function toEmail(doc: Record<string, unknown>): Email {
  const email = doc as unknown as Email;
  return {
    ...email,
    logs: Array.isArray(email.logs) ? email.logs : [],
    // Module 6 — Scheduled Delivery: the server stores the schedule as a
    // Firestore Timestamp; the dashboard always works with ISO strings.
    scheduledAt: toIsoString(email.scheduledAt),
    dispatchedAt: toIsoString(email.dispatchedAt),
    cancelledAt: toIsoString(email.cancelledAt),
  };
}

/** A raw Firestore document → an `ActivityEntry`. */
export function toActivity(doc: Record<string, unknown>): ActivityEntry {
  return doc as unknown as ActivityEntry;
}

/** A raw Firestore document → an `AttemptLog`. */
export function toAttemptLog(doc: Record<string, unknown>): AttemptLog {
  return doc as unknown as AttemptLog;
}

/** The dispatcher flags stored in `_meta/main`. */
export function toDispatcherState(doc: Record<string, unknown>): DispatcherState {
  return {
    running: doc?.running === true,
    paused: doc?.paused === true,
  };
}

/** The fields accepted by the "Add Email" form. */
export function toEmailFormData(form: EmailFormData): EmailFormData {
  return {
    recipient: form.recipient.trim(),
    subject: form.subject.trim(),
    message: form.message.trim(),
    senderName: form.senderName.trim(),
  };
}
