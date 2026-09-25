// Real-dispatch statuses (server-driven)
export type EmailStatus = 'QUEUED' | 'SENDING' | 'RETRYING' | 'DELIVERED' | 'FAILED';

export type ActivityType = 'info' | 'success' | 'failure' | 'retry' | 'warning';

// Individual SMTP attempt result
export interface AttemptLog {
  attempt: number;
  result: 'SUCCESS' | 'FAILURE';
  detail?: string;
  timestamp: string;
}

// Data returned by the SMTP server after a successful send
export interface SmtpInfo {
  accepted: string[];
  response: string;
  messageId: string;
}

// One email, as stored + streamed by the dispatcher server
export interface Email {
  id: string;
  recipient: string;
  subject: string;
  message: string;
  senderName?: string;
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

export interface ActivityEntry {
  id: string;
  emailId: string;
  message: string;
  type: ActivityType;
  timestamp: string;
}

export interface DispatcherState {
  running: boolean;
  paused: boolean;
}

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

export interface ServerConfig {
  smtp: SmtpSettings;
  hasPassword: boolean;
  smtpConfigured: boolean;
  dryRun: boolean;
  retryLimit: number;
  retryDelayMs: number;
  interEmailDelayMs: number;
}

// Live stats from the server
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

export interface EmailFormData {
  recipient: string;
  subject: string;
  message: string;
  senderName: string;
}

export interface ApiResult<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}