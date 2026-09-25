import config from './config.js';
import { broadcast } from './sse.js';

/**
 * In-memory email queue store + activity log.
 * Every mutation broadcasts live events so dashboards update instantly.
 */

const EMAIL_STATUSES = ['QUEUED', 'SENDING', 'RETRYING', 'DELIVERED', 'FAILED'];
const HISTORY_LIMIT = 250;

let emails = [];
let activity = [];
let emailCounter = 0;
let activityCounter = 0;
let currentProcessingId = null;

// ── id + object helpers ────────────────────────────────────────────────────────

function pad(n, width = 3) {
  return String(n).padStart(width, '0');
}

function stamp() {
  return new Date().toISOString();
}

function makeEmail({ recipient, subject, message, senderName }) {
  emailCounter += 1;
  const id = `EML-${pad(emailCounter)}`;
  const now = stamp();
  return {
    id,
    recipient,
    subject,
    message,
    senderName: senderName || undefined,
    status: 'QUEUED',
    attempts: 0,
    retries: 0,
    retryLimit: config.retryLimit,
    createdAt: now,
    updatedAt: now,
    finalStatus: null,
    socketErr: null,
    smtp: null,
    logs: [],
  };
}

// ── internal helpers ───────────────────────────────────────────────────────────

function pushActivity({ emailId, message, type }) {
  activityCounter += 1;
  const entry = {
    id: `ACT-${activityCounter}`,
    emailId,
    message,
    type, // 'info' | 'success' | 'failure' | 'retry' | 'warning'
    timestamp: stamp(),
  };
  activity = [entry, ...activity].slice(0, HISTORY_LIMIT);
  emitActivity(entry);
  return entry;
}

function emitEmail(email) {
  broadcast('email', email);
  emitStats();
}

function emitActivity(entry) {
  broadcast('activity', entry);
}

function emitStats() {
  broadcast('stats', getStats());
}

function patchEmail(id, patch) {
  const email = emails.find((e) => e.id === id);
  if (!email) return null;
  Object.assign(email, patch, { updatedAt: stamp() });
  emitEmail(email);
  return email;
}

// ── queries ───────────────────────────────────────────────────────────────────

export function hasQueued() {
  return emails.some((e) => e.status === 'QUEUED');
}

export function nextQueued() {
  // FIFO: oldest QUEUED first
  return emails.find((e) => e.status === 'QUEUED') || null;
}

export function getEmail(id) {
  return emails.find((e) => e.id === id) || null;
}

export function listEmails() {
  return emails;
}

export function listActivity() {
  return activity;
}

export function getStats() {
  // {
  //   total, queued, sending, retrying, delivered, failed,
  //   totalAttempts, totalRetries, successRate, failureRate
  // }
  const counts = {};
  for (const status of EMAIL_STATUSES) counts[status] = 0;
  let totalAttempts = 0;
  let totalRetries = 0;
  for (const e of emails) {
    if (Object.prototype.hasOwnProperty.call(counts, e.status)) counts[e.status] += 1;
    totalAttempts += e.attempts;
    totalRetries += e.retries;
  }
  const processed = counts.DELIVERED + counts.FAILED;
  const successRate = processed > 0 ? Math.round((counts.DELIVERED / processed) * 100) : 0;
  const failureRate = processed > 0 ? Math.round((counts.FAILED / processed) * 100) : 0;

  return {
    total: emails.length,
    queued: counts.QUEUED,
    sending: counts.SENDING + counts.RETRYING,
    delivered: counts.DELIVERED,
    failed: counts.FAILED,
    retrying: counts.RETRYING,
    totalAttempts,
    totalRetries,
    successRate,
    failureRate,
  };
}

export function getDisposition() {
  return { smtpConfigured: Boolean(config.smtp.host), retryLimit: config.retryLimit };
}

export function getCurrentProcessingId() {
  return currentProcessingId;
}

// ── mutations ─────────────────────────────────────────────────────────────────

export function enqueue({ recipient, subject, message, senderName }) {
  const email = makeEmail({ recipient, subject, message, senderName });
  emails.push(email);
  const queuedCount = emails.filter((e) => e.status === 'QUEUED').length;
  pushActivity({
    emailId: email.id,
    message: `${email.id} queued for delivery (position ${queuedCount})`,
    type: 'info',
  });
  emitEmail(email);
  return { email, position: queuedCount };
}

export function removeEmail(id) {
  const idx = emails.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const [removed] = emails.splice(idx, 1);
  pushActivity({
    emailId: removed.id,
    message: `${removed.id} removed from queue`,
    type: 'warning',
  });
  emitStats();
  return removed;
}

export function markSending(id) {
  currentProcessingId = id;
  const email = patchEmail(id, { status: 'SENDING' });
  if (email) {
    pushActivity({
      emailId: email.id,
      message: `${email.id} — dispatch started (attempt 1 of ${email.retryLimit + 1})`,
      type: 'info',
    });
  }
  return email;
}

export function logAttempt(id, attempt, result, detail) {
  const email = getEmail(id);
  if (!email) return;
  email.logs.push({ attempt, result, detail, timestamp: stamp() });
  pushActivity({
    emailId: id,
    message: `${id} — Attempt ${attempt}: ${result}${detail ? ` (${detail})` : ''}`,
    type: result === 'SUCCESS' ? 'success' : 'failure',
  });
}

export function markRetrying(id, attempt) {
  const email = getEmail(id);
  if (!email) return;
  const nextAttempt = attempt + 1;
  const email_ = patchEmail(id, {
    status: 'RETRYING',
    attempts: attempt,
    retries: attempt - 1,
    finalStatus: null,
  });
  if (email_) {
    pushActivity({
      emailId: id,
      message: `${id} — delivery failed, retrying (attempt ${nextAttempt})`,
      type: 'retry',
    });
  }
  return email;
}

export function markDelivered(id, attempt, smtpInfo) {
  const email = patchEmail(id, {
    status: 'DELIVERED',
    attempts: attempt,
    retries: attempt - 1,
    finalStatus: 'DELIVERED',
    smtp: smtpInfo,
    socketErr: null,
  });
  if (email) {
    const accepted = Array.isArray(smtpInfo.accepted) ? smtpInfo.accepted.join(', ') : '';
    pushActivity({
      emailId: id,
      message: `${id} — DELIVERED (accepted by mail server${accepted ? ` · ${accepted}` : ''})`,
      type: 'success',
    });
  }
  return email;
}

export function markFailed(id, attempt, detail) {
  const email = patchEmail(id, {
    status: 'FAILED',
    attempts: attempt,
    retries: attempt - 1,
    finalStatus: 'FAILED',
    socketErr: detail || null,
  });
  if (email) {
    pushActivity({
      emailId: id,
      message: `${id} — FAILED (${detail || 'could not be sent'})`,
      type: 'failure',
    });
  }
  return email;
}

export function clear() {
  emails = [];
  emailCounter = 0;
  activity = [];
  activityCounter = 0;
  currentProcessingId = null;
  const stats = {
    total: 0,
    queued: 0,
    sending: 0,
    delivered: 0,
    failed: 0,
    retrying: 0,
    totalAttempts: 0,
    totalRetries: 0,
    successRate: 0,
    failureRate: 0,
  };
  broadcast('email:clear', {});
  broadcast('activity', { emailId: 'SYS', message: 'Queue reset — all data cleared', type: 'warning', timestamp: stamp() });
  broadcast('stats', stats);
  return stats;
}