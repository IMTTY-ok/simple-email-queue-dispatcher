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
const attachments = require('./attachments.js');

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
 * @param {string} [uid] the uid of the signed-in account — the attachments
 *   have to live in that account's own storage folder
 * @returns {{ ok: true, value: {recipient:string,subject:string,message:string,senderName:string,attachments:object[]} }
 *          | { ok: false, error: string }}
 */
function validateEmail(input, uid = null) {
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

  // An email may carry files. They were uploaded to Cloud Storage by the
  // browser; the API only receives their descriptors.
  const files = attachments.validateAttachments(source.attachments, uid);
  if (!files.ok) return { ok: false, error: files.error };

  return {
    ok: true,
    value: { recipient, subject, message, senderName, attachments: files.value },
  };
}

/**
 * Build a fresh email document (not yet written to Firestore).
 *
 * `options.deliveryMode === 'SCHEDULED'` (Module 6 — Scheduled Delivery) adds
 * the scheduling fields. The default stays exactly what it was: an immediate
 * email that waits in the FIFO queue.
 */
async function makeEmail({ recipient, subject, message, senderName, attachments: files }, retryLimit, createdBy, options = {}) {
  const seq = await store.claimSeq('emailSeq');
  const now = store.stamp();
  const scheduled = options && options.deliveryMode === 'SCHEDULED';

  const email = {
    id: `EML-${store.pad(seq)}`,
    seq,
    recipient,
    subject,
    message,
    senderName: senderName || null,
    // The files that travel with this email. Only the descriptors live on
    // the document; the bytes are in Cloud Storage (see attachments.js).
    attachments: Array.isArray(files) ? files : [],
    // The account that created the email. The Firestore rules use this to keep
    // an operator inside their own queue entries.
    createdBy: createdBy || null,
    status: scheduled ? 'SCHEDULED' : 'QUEUED',
    attempts: 0,
    retries: 0,
    retryLimit,
    createdAt: now,
    updatedAt: now,
    finalStatus: null,
    socketErr: null,
    smtp: null,
    logs: [],
    // Module 6 — Scheduled Delivery.
    // `deliveryMode` tells the two pipelines apart: `IMMEDIATE` goes through
    // the FIFO dispatcher, `SCHEDULED` waits for its own moment. A scheduled
    // email is *not* `QUEUED`, so the FIFO dispatcher can never pick it up
    // before its time.
    deliveryMode: scheduled ? 'SCHEDULED' : 'IMMEDIATE',
  };

  if (scheduled) {
    email.scheduleVersion = Number(options.scheduleVersion) || 1;
    email.scheduledAt = options.scheduledAt || null;
    email.timezone = options.timezone || null;
    email.scheduledTaskId = null;
    email.dispatchedAt = null;
    email.cancelledAt = null;
  }

  return email;
}

/**
 * Add an email to the rear of the queue.
 *
 * @param {object} input validated email fields
 * @param {number} retryLimit attempts allowed for this email
 * @param {string} [createdBy] uid of the account that created it
 * @param {object} [options] `deliveryMode: 'SCHEDULED'` creates a scheduled
 *   email instead of an immediate one (Module 6 — Scheduled Delivery).
 * @returns {Promise<{ email: object, position: number }>}
 */
async function enqueue(input, retryLimit = 3, createdBy = null, options = {}) {
  const email = await makeEmail(input, retryLimit, createdBy, options);
  // The files have to be in the bucket before the email exists — otherwise
  // the queue would hold an email whose attachments cannot be delivered.
  await attachments.assertStored(email.attachments);
  await store.emailsCol().doc(email.id).set(email);
  // A scheduled email waits for its own moment — it is counted as
  // `scheduled`, never as `queued`.
  await store.bumpStats(
    email.status === 'SCHEDULED' ? { total: 1, scheduled: 1 } : { total: 1, queued: 1 }
  );
  const position = await queuedCount();
  return { email, position };
}

/**
 * Every email, oldest first.
 * @param {string} [createdBy] when given, only that account's emails
 */
async function listEmails(createdBy = null) {
  const query = createdBy
    ? store.emailsCol().where('createdBy', '==', createdBy).orderBy('seq', 'asc')
    : store.emailsCol().orderBy('seq', 'asc');
  const snap = await query.get();
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
 *
 * Only `QUEUED` emails are considered. A scheduled email (Module 6) has the
 * status `SCHEDULED` until its moment arrives, so the FIFO dispatcher can
 * never pick it up early.
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
  // The email is gone, so its files are gone too — the bytes are only kept
  // for as long as the email needs them.
  await attachments.release(removed.attachments);
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
    // Module 6 — Scheduled Delivery
    case 'SCHEDULED': return 'scheduled';
    case 'CANCELLED': return 'cancelled';
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
