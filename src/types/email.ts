// Email status types
export type EmailStatus = 'PENDING' | 'PROCESSING' | 'RETRYING' | 'DELIVERED' | 'FAILED';

// Simulation modes
export type SimulationMode = 'RANDOM' | 'FORCE_SUCCESS' | 'FORCE_FAILURE';

// Processing speed
export type ProcessingSpeed = 'SLOW' | 'NORMAL' | 'FAST';

// Individual attempt log
export interface AttemptLog {
  attempt: number;
  result: 'SUCCESS' | 'FAILURE';
  timestamp: string;
}

// Email object
export interface Email {
  id: string;
  recipient: string;
  subject: string;
  message: string;
  senderName?: string;
  status: EmailStatus;
  attempts: number;
  retries: number;
  createdAt: string;
  updatedAt: string;
  finalStatus: 'DELIVERED' | 'FAILED' | null;
  logs: AttemptLog[];
}

// Activity log entry
export interface ActivityEntry {
  id: string;
  emailId: string;
  message: string;
  type: 'info' | 'success' | 'failure' | 'retry' | 'warning';
  timestamp: string;
}

// Queue state
export interface QueueState {
  emails: Email[];
  activityLog: ActivityEntry[];
  isProcessing: boolean;
  isPaused: boolean;
  currentProcessingId: string | null;
  simulationMode: SimulationMode;
  retryLimit: number;
  processingSpeed: ProcessingSpeed;
  emailCounter: number;
  activityCounter: number;
}

// Statistics
export interface Stats {
  total: number;
  pending: number;
  processing: number;
  delivered: number;
  failed: number;
  retrying: number;
  totalAttempts: number;
  totalRetries: number;
  successRate: number;
  failureRate: number;
}

// Form data
export interface EmailFormData {
  recipient: string;
  subject: string;
  message: string;
  senderName: string;
}
