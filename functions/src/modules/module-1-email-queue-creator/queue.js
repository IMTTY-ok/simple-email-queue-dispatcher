'use strict';

/**
 * Module 1 — Email Queue Creator
 * ==============================
 *
 * Responsible for creating and storing email tasks (PRD §5).
 *
 * Features delivered here:
 *   • add an email to the queue
 *   • generate a unique Email ID automatically (`EML-001`, `EML-002`, …)
 *   • expose the queue position of a newly added email
 *   • validate the email address, subject and message
 *   • refuse empty emails
 *
 * The queue itself is FIFO: `seq` is a monotonic counter, and
 * `nextQueued()` always returns the lowest `seq` still in state `QUEUED`.
 */

const store = require('../../shared/store.js');

/** Matches a single, syntactically valid email address. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Maximum lengths accepted for a single field. */
const LIMITS = {
  recipient: 320,
  subject: 200,
  message: 10000,
  senderName: 120,
};

/**
 * Validate one queued email.
 *
 * @param {unknown} input raw request body
 * @returns {{ ok: true, value: {recipient:string,subject:string,message:string,senderName:string} }
 *          | { ok: false, error: string }}
 */
function validateEmail(input) {
  const source = input && typeof input === 'object' ? input : {};
  const recipient = String(source.recipient ?? '').trim();
  const subject = String(source.subject ?? '').trim();
  const message = String(source.message ?? '').trim();
  const senderName = String(source.senderName ?? '').trim();

  if (!recipient) return { ok: false, error: 'Recipient email is required.' };
  if (!EMAIL_REGEX.test(recipient)) return { ok: false, error: 'Please enter a valid email address.' };
  if (!subject) return { ok: false, error: 'Subject is required.' };
  if (!message) return { ok: false, error: 'Message is required.' };

  if (recipient.length > LIMITS.recipient) return { ok: false, error: 'Recipient email is too long.' };
  if (subject.length > LIMITS.subject) return { ok: false, error: 'Subject is too long.' };
  if (message.length > LIMITS.message) return { ok: false, error: 'Message is too long.' };
  if (senderName.length > LIMITS.senderName) return { ok: false, error: 'Sender name is too long.' };

  return { ok: true, value: { recipient, subject, message, senderName } };
}

/** Build a fresh email document (not yet written to Firestore). */
async function makeEmail({ recipient, subject, message, senderName }, retryLimit) {
  const seq = await store.claimSeq('emailSeq');
  const now = store.stamp();
  return {
    id: `EML-${store.pad(seq)}`,
    seq,
    recipient,
    subject,
    message,
    senderName: senderName || null,
    status: 'QUEUED',
    attempts: 0,
    retries: 0,
    retryLimit,
    createdAt: now,
    updatedAt: now,
    finalStatus: null,
    socketErr: null,
    smtp: null,
    logs: [],
  };
}

/**
 * Add an email to the rear of the queue.
 *
 * @returns {Promise<{ email: object, position: number }>}
 */
async function enqueue(input, retryLimit = 3) {
  const email = await makeEmail(input, retryLimit);
  await store.emailsCol().doc(email.id).set(email);
  await store.bumpStats({ total: 1, queued: 1 });
  const position = await queuedCount();
  return { email, position };
}

/** Every queued email, oldest first. */
async function listEmails() {
  const snap = await store.emailsCol().orderBy('seq', 'asc').get();
  return snap.docs.map((d) => d.data());
}

/** One email by id, or `null` when it does not exist. */
async function getEmail(id) {
  const snap = await store.emailsCol().doc(id).get();
  return snap.exists ? snap.data() : null;
}

/** How many emails are waiting in the queue. */
async function queuedCount() {
  return (await store.readStatsDoc()).queued || 0;
}

/** True when at least one email is waiting. */
async function hasQueued() {
  return queuedCount() > 0;
}

/**
 * The front of the queue — the next email to be dispatched (FIFO).
 * Returns `null` when the queue is empty.
 */
async function nextQueued() {
  const snap = await store.emailsCol()
    .where('status', '==', 'QUEUED')
    .orderBy('seq', 'asc')
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].data();
}

/**
 * Remove an email from the queue and correct the statistics counters.
 * Returns the removed document, or `null` when it did not exist.
 */
async function removeEmail(id) {
  const snap = await store.emailsCol().doc(id).get();
  if (!snap.exists) return null;
  const removed = snap.data();
  const delta = {
    total: -1,
    totalAttempts: -(removed.attempts || 0),
    totalRetries: -(removed.retries || 0),
  };
  const key = statusKey(removed.status);
  if (key) delta[key] = -1;
  await store.emailsCol().doc(id).delete();
  await store.bumpStats(delta);
  return removed;
}

/** Maps a status onto its statistics-counter key. */
function statusKey(status) {
  switch (status) {
    case 'QUEUED': return 'queued';
    case 'SENDING': return 'sending';
    case 'RETRYING': return 'retrying';
    case 'DELIVERED': return 'delivered';
    case 'FAILED': return 'failed';
    default: return null;
  }
}

module.exports = {
  EMAIL_REGEX,
  LIMITS,
  validateEmail,
  makeEmail,
  enqueue,
  listEmails,
  getEmail,
  queuedCount,
  hasQueued,
  nextQueued,
  removeEmail,
  statusKey,
};
