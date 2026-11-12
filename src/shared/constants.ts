/**
 * Shared constants used by more than one module.
 */

/**
 * Module 2 — Send Simulator.
 * The three simulation modes the dashboard can choose from.
 * Mirrors `SIMULATION_MODES` in `functions/src/modules/module-2-send-simulator/simulator.js`.
 */
export const SIMULATION_MODES = ['AUTOMATIC', 'FORCE_SUCCESS', 'FORCE_FAILURE'] as const;

/** Human-readable labels for the simulation modes. */
export const SIMULATION_MODE_LABELS: Record<string, string> = {
  AUTOMATIC: 'Automatic',
  FORCE_SUCCESS: 'Force Success',
  FORCE_FAILURE: 'Force Failure',
};

/**
 * Module 3 — Retry Logic Engine.
 * Processing speed presets. Each preset maps onto the retry delay and the
 * pause between two consecutive emails.
 */
export const PROCESSING_SPEEDS = ['SLOW', 'NORMAL', 'FAST'] as const;

/** Delay presets (ms) for each processing speed. */
export const PROCESSING_SPEED_DELAYS: Record<string, { retryDelayMs: number; interEmailDelayMs: number }> = {
  SLOW: { retryDelayMs: 5000, interEmailDelayMs: 2000 },
  NORMAL: { retryDelayMs: 3000, interEmailDelayMs: 1200 },
  FAST: { retryDelayMs: 1000, interEmailDelayMs: 400 },
};

/** The SMTP ports offered by the settings panel. */
export const SMTP_PORT_OPTIONS = [
  { value: 587, label: '587 (StartTLS)', secure: false },
  { value: 465, label: '465 (SSL/TLS)', secure: true },
  { value: 25, label: '25 (plain)', secure: false },
];

/** The two roles the application understands, with their display labels. */
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  operator: 'Operator',
};

/**
 * Module 1 — Email Queue Creator.
 * The five sample emails loaded by the "Load Demo Data" button (PRD §25).
 */
export const DEMO_EMAILS = [
  { recipient: 'student1@example.com', subject: 'Assignment Submission', message: 'Your assignment has been received and is under review.' },
  { recipient: 'student2@example.com', subject: 'Exam Schedule', message: 'Your final exam is scheduled for next Monday at 10:00 AM.' },
  { recipient: 'student3@example.com', subject: 'Fee Reminder', message: 'This is a reminder that your fee payment is due by end of this week.' },
  { recipient: 'student4@example.com', subject: 'Library Notice', message: 'The books you borrowed are due for return. Please return them by Friday.' },
  { recipient: 'student5@example.com', subject: 'Result Announcement', message: 'Your semester results have been published on the student portal.' },
];
