/**
 * Shared domain types for the Email Queue Dispatcher.
 *
 * These describe the data as it travels between the five modules and the
 * Cloud Function API. They are intentionally transport-shaped (plain JSON)
 * so a Firestore snapshot and a REST response can both satisfy them.
 */

// ── Module 3 — Retry Logic Engine: email status system ─────────────────────────

/** The lifecycle of a queued email. */
export type EmailStatus = 'QUEUED' | 'SENDING' | 'RETRYING' | 'DELIVERED' | 'FAILED';

/** The outcome of a single delivery attempt. */
export type AttemptResult = 'SUCCESS' | 'FAILURE';

/**
 * How the Send Simulator decides whether an attempt succeeds.
 * Only meaningful while dry-run mode is enabled.
 */
export type SimulationMode = 'AUTOMATIC' | 'FORCE_SUCCESS' | 'FORCE_FAILURE';

/** How fast the dispatcher paces itself between attempts. */
export type ProcessingSpeed = 'SLOW' | 'NORMAL' | 'FAST';

// ── Module 4 — Final Status Logger ─────────────────────────────────────────────

/** The type of an entry in the global activity log. */
export type ActivityType = 'info' | 'success' | 'failure' | 'retry' | 'warning';

/** One recorded delivery attempt. */
export interface AttemptLog {
  attempt: number;
  result: AttemptResult;
  detail?: string;
  timestamp: string;
}

/** One entry in the global activity log. */
export interface ActivityEntry {
  id: string;
  emailId: string;
  message: string;
  type: ActivityType;
  timestamp: string;
}

// ── Module 2 — Send Simulator: transport configuration ─────────────────────────

/** The mail-server connection details. */
export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

/** The sanitized configuration the server exposes to the browser. */
export interface ServerConfig {
  smtp: SmtpSettings;
  hasPassword: boolean;
  smtpConfigured: boolean;
  dryRun: boolean;
  simulationMode: SimulationMode;
  retryLimit: number;
  retryDelayMs: number;
  interEmailDelayMs: number;
}

// ── Module 1 — Email Queue Creator ─────────────────────────────────────────────

/** One email task as stored by the server and streamed to the dashboard. */
export interface Email {
  id: string;
  seq: number;
  recipient: string;
  subject: string;
  message: string;
  senderName?: string | null;
  status: EmailStatus;
  attempts: number;
  retries: number;
  retryLimit: number;
  createdAt: string;
  updatedAt: string;
  finalStatus: 'DELIVERED' | 'FAILED' | null;
  socketErr: string | null;
  smtp: SmtpInfo | null;
  logs: AttemptLog[];
}

/** The data the SMTP server returned for a successful delivery. */
export interface SmtpInfo {
  accepted: string[];
  response: string;
  messageId: string;
}

/** The raw input of the "Add Email" form. */
export interface EmailFormData {
  recipient: string;
  subject: string;
  message: string;
  senderName: string;
}

// ── Module 3 — dispatcher state ────────────────────────────────────────────────

/** Whether the dispatcher is running, and whether it is paused. */
export interface DispatcherState {
  running: boolean;
  paused: boolean;
}

// ── Module 5 — Summary Exporter: statistics ────────────────────────────────────

/** Live statistics, aggregated by the server. */
export interface Stats {
  total: number;
  queued: number;
  sending: number;
  delivered: number;
  failed: number;
  retrying: number;
  totalAttempts: number;
  totalRetries: number;
  successRate: number;
  failureRate: number;
}
