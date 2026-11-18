/**
 * Shared domain types for the Email Queue Dispatcher.
 *
 * These describe the data as it travels between the five modules and the
 * Cloud Function API. They are intentionally transport-shaped (plain JSON)
 * so a Firestore snapshot and a REST response can both satisfy them.
 */

// ── Module 3 — Retry Logic Engine: email status system ─────────────────────────

/**
 * The lifecycle of a queued email.
 *
 * `SCHEDULED` and `CANCELLED` were added by Module 6 — Scheduled Delivery.
 * A scheduled email is *not* `QUEUED`, so the FIFO dispatcher can never pick
 * it up before the moment it is due for.
 */
export type EmailStatus =
  | 'QUEUED'
  | 'SCHEDULED'
  | 'SENDING'
  | 'RETRYING'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED';

/** How an email reaches the mail server. */
export type DeliveryMode = 'IMMEDIATE' | 'SCHEDULED';

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

/**
 * The finer-grained event an activity entry describes.
 *
 * Added by Module 6 — Scheduled Delivery so the dashboard can give every
 * kind of event its own indicator.
 */
export type ActivityKind =
  | 'added'
  | 'scheduled'
  | 'dispatch'
  | 'retry'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'info'
  | 'warning';

/** One entry in the global activity log. */
export interface ActivityEntry {
  id: string;
  emailId: string;
  message: string;
  type: ActivityType;
  kind?: ActivityKind;
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

/**
 * One file that travels with an email.
 *
 * The bytes live in Cloud Storage — only this small descriptor travels with
 * the email document.
 */
export interface Attachment {
  /** The file name the recipient sees. */
  name: string;
  /** The size of the file in bytes. */
  size: number;
  /** The content type the server sends the file with. */
  contentType: string;
  /** Where the file lives in Cloud Storage. */
  path: string;
}

/** One email task as stored by the server and streamed to the dashboard. */
export interface Email {
  id: string;
  seq: number;
  recipient: string;
  subject: string;
  message: string;
  senderName?: string | null;
  /** The files that travel with this email. */
  attachments?: Attachment[];
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
  // ── Module 6 — Scheduled Delivery ────────────────────────────────────────
  /** `IMMEDIATE` waits in the FIFO queue, `SCHEDULED` waits for its moment. */
  deliveryMode?: DeliveryMode;
  /** The UTC instant the email becomes due (ISO-8601). */
  scheduledAt?: string | null;
  /** The IANA timezone the schedule was picked in. */
  timezone?: string | null;
  /** Bumped on every reschedule; a stale task carries an older version. */
  scheduleVersion?: number;
  /** The Cloud Task that carries this revision of the schedule. */
  scheduledTaskId?: string | null;
  /** When the delivery actually started. */
  dispatchedAt?: string | null;
  /** When the schedule was called off. */
  cancelledAt?: string | null;
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
  /** The files to travel with the email (descriptors, not bytes). */
  attachments?: Attachment[];
}

/**
 * The attachment rules the server enforces.
 *
 * The browser asks the server for these before it offers a file, so the
 * limits it shows are the limits the server applies.
 */
export interface AttachmentRules {
  /** The Cloud Storage bucket the files live in. */
  bucket: string;
  /** How many files one email may carry. */
  maxCount: number;
  /** The largest single file, in bytes. */
  maxFileBytes: number;
  /** The largest total of all files of one email, in bytes. */
  maxTotalBytes: number;
  /** The extensions the server accepts. */
  extensions: string[];
  /** The content type the server sends each extension with. */
  contentTypes: Record<string, string>;
  /** The folder every attachment lives in. */
  uploadRoot: string;
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
  /** Module 6 — Scheduled Delivery */
  scheduled: number;
  cancelled: number;
  totalAttempts: number;
  totalRetries: number;
  successRate: number;
  failureRate: number;
}

// ── Module 6 — Scheduled Delivery ─────────────────────────────────────────────

/** How the server delivers a scheduled email. */
export type SchedulerProvider = 'cloud-tasks' | 'sweep';

/** What the server knows about its scheduling configuration. */
export interface SchedulerStatus {
  configured: boolean;
  reason: string | null;
  provider: string;
  queue: string;
  location: string;
  project: string;
  emulator: boolean;
  maxTaskDelayDays: number;
}

/**
 * The operational status every signed-in account may read.
 * It never contains SMTP credentials.
 */
export interface ServerStatus {
  ok: boolean;
  serverTime: string;
  mode: 'DRY-RUN' | 'LIVE';
  dryRun: boolean;
  simulationMode: SimulationMode;
  retryLimit: number;
  retryDelayMs: number;
  interEmailDelayMs: number;
  smtpConfigured: boolean;
  dispatcher: DispatcherState;
  scheduler: SchedulerStatus;
}

/** The result of creating a schedule. */
export interface ScheduleResult {
  success: boolean;
  error?: string;
  emailId?: string;
  scheduler?: SchedulerProvider;
  warning?: string;
}
