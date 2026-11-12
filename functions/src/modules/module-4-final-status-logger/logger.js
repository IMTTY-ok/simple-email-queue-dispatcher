'use strict';

/**
 * Module 4 — Final Status Logger
 * ================================
 *
 * Maintains the complete history of every email (PRD §8).
 *
 * Each attempt is appended to the email document's `logs` array:
 *
 *   | Field       | Description                     |
 *   |-------------|---------------------------------|
 *   | attempt     | attempt number                  |
 *   | result      | SUCCESS | FAILURE               |
 *   | detail      | SMTP response or error text     |
 *   | timestamp   | time of the attempt             |
 *
 * Every transition is also written to the global `activity` collection, which
 * the dashboard renders as the live Activity Log.
 *
 * The logger is the only place allowed to change an email's status, so the
 * statistics counters can never drift away from the documents themselves.
 *
 * Activity entries inherit the `createdBy` of the email they concern. The
 * Firestore rules use that field to keep an operator out of another account's
 * dispatch history.
 */

const store = require('../../shared/store.js');
const { statusKey } = require('../module-1-email-queue-creator/queue.js');

/** Activity entry types used by the dashboard's log colouring. */
const ACTIVITY_TYPES = ['info', 'success', 'failure', 'retry', 'warning'];

/**
 * Append a global activity entry.
 * The history is bounded — the oldest entries are trimmed away.
 *
 * @param {object} entry
 * @param {string} entry.emailId the email the entry is about
 * @param {string} entry.message the human-readable text
 * @param {string} entry.type one of ACTIVITY_TYPES
 * @param {string|null} [entry.createdBy] the account the entry belongs to
 */
async function pushActivity({ emailId, message, type, createdBy = null }) {
  const seq = await store.claimSeq('activitySeq');
  const id = `ACT-${store.pad(seq)}`;
  const entry = {
    id,
    seq,
    emailId,
    message,
    type: ACTIVITY_TYPES.includes(type) ? type : 'info',
    createdBy,
    timestamp: store.stamp(),
  };
  await store.activityCol().doc(id).set(entry);
  const count = await store.countDocs(store.activityCol());
  if (count > store.HISTORY_LIMIT + 10) {
    await store.trimOldest(store.activityCol(), count - store.HISTORY_LIMIT);
  }
  return entry;
}

/**
 * The most recent activity entries, newest first.
 * @param {string|null} [createdBy] when given, only that account's entries
 */
async function listActivity(createdBy = null) {
  const query = createdBy
    ? store.activityCol().where('createdBy', '==', createdBy).orderBy('seq', 'desc').limit(store.HISTORY_LIMIT)
    : store.activityCol().orderBy('seq', 'desc').limit(store.HISTORY_LIMIT);
  const snap = await query.get();
  return snap.docs.map((d) => d.data());
}

/**
 * Move an email to a new status and keep the statistics counters in sync.
 * @returns the updated document, or `null` when the email no longer exists
 */
async function moveStatus(id, toStatus, payload = {}, sideDeltas = {}) {
  const ref = store.emailsCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const prev = snap.data();

  const delta = {};
  const fromKey = statusKey(prev.status);
  const toKey = statusKey(toStatus);
  if (fromKey && toKey && fromKey !== toKey) {
    delta[fromKey] = -1;
    delta[toKey] = 1;
  }

  const merged = {
    ...prev,
    ...payload,
    status: toStatus,
    updatedAt: store.stamp(),
  };
  await ref.set(merged, { merge: true });
  await store.bumpStats({ ...delta, ...sideDeltas });
  return merged;
}

/**
 * Record the outcome of a single SMTP attempt in the email's own history.
 */
async function logAttempt(id, attempt, result, detail) {
  const snap = await store.emailsCol().doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data();
  const logs = Array.isArray(data.logs) ? data.logs : [];
  logs.push({ attempt, result, detail, timestamp: store.stamp() });
  await store.emailsCol().doc(id).set({ logs }, { merge: true });
  await pushActivity({
    emailId: id,
    message: `${id} — Attempt ${attempt}: ${result}${detail ? ` (${detail})` : ''}`,
    type: result === 'SUCCESS' ? 'success' : 'failure',
    createdBy: data.createdBy || null,
  });
  return logs;
}

/** Mark an email as being dispatched right now. */
async function markSending(id, attempt = 1) {
  const email = await moveStatus(id, 'SENDING');
  if (!email) return null;
  await store.setCurrentProcessingId(id);
  await pushActivity({
    emailId: id,
    message: `${id} — dispatch started (attempt ${attempt} of ${email.retryLimit + 1})`,
    type: 'info',
    createdBy: email.createdBy || null,
  });
  return email;
}

/**
 * Return an in-flight email (SENDING / RETRYING) to the queue.
 * Used when a dispatch pass is interrupted by pause/stop so the email is
 * never stranded off-queue (nextQueued() would never find it again).
 */
async function requeueInFlight(id) {
  const snap = await store.emailsCol().doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (data.status !== 'SENDING' && data.status !== 'RETRYING') return null;
  const requeued = await moveStatus(id, 'QUEUED');
  if (requeued) {
    await store.setCurrentProcessingId(null);
    await pushActivity({
      emailId: id,
      message: `${id} — requeued (dispatch interrupted mid-flight)`,
      type: 'warning',
      createdBy: data.createdBy || null,
    });
  }
  return requeued;
}

/** Mark an email as waiting for its next attempt. */
async function markRetrying(id, attempt) {
  const email = await moveStatus(id, 'RETRYING', { attempts: attempt, retries: attempt - 1, finalStatus: null });
  if (email) {
    await pushActivity({
      emailId: id,
      message: `${id} — delivery failed, retrying (attempt ${attempt + 1})`,
      type: 'retry',
      createdBy: email.createdBy || null,
    });
  }
  return email;
}

/** Mark an email as successfully delivered. */
async function markDelivered(id, attempt, smtpInfo) {
  const email = await moveStatus(id, 'DELIVERED', {
    attempts: attempt,
    retries: attempt - 1,
    finalStatus: 'DELIVERED',
    smtp: smtpInfo,
    socketErr: null,
  }, { totalAttempts: attempt, totalRetries: attempt - 1 });
  if (email) {
    const accepted = Array.isArray(smtpInfo.accepted) ? smtpInfo.accepted.join(', ') : '';
    await pushActivity({
      emailId: id,
      message: `${id} — DELIVERED (accepted by mail server${accepted ? ` · ${accepted}` : ''})`,
      type: 'success',
      createdBy: email.createdBy || null,
    });
  }
  return email;
}

/** Mark an email as failed for good. */
async function markFailed(id, attempt, detail) {
  const email = await moveStatus(id, 'FAILED', {
    attempts: attempt,
    retries: attempt - 1,
    finalStatus: 'FAILED',
    socketErr: detail || null,
  }, { totalAttempts: attempt, totalRetries: attempt - 1 });
  if (email) {
    await pushActivity({
      emailId: id,
      message: `${id} — FAILED (${detail || 'could not be sent'})`,
      type: 'failure',
      createdBy: email.createdBy || null,
    });
  }
  return email;
}

module.exports = {
  ACTIVITY_TYPES,
  pushActivity,
  listActivity,
  moveStatus,
  logAttempt,
  markSending,
  requeueInFlight,
  markRetrying,
  markDelivered,
  markFailed,
};
