'use strict';

/**
 * Module 6 — Scheduled Delivery: the scheduling engine.
 * =====================================================
 *
 * This module owns *when* a scheduled email is delivered. It deliberately
 * contains no SMTP code and no queue code of its own: once an email is
 * claimed, the **existing** dispatch and retry pipeline of Module 3 does the
 * sending (`dispatch.processEmail`), so the retry limit, the retry history
 * and the status transitions are exactly the ones an immediate email uses.
 *
 * The three guarantees
 * --------------------
 *
 *   1. **No premature delivery** — the claim refuses to run before
 *      `scheduledAt`. The server's own clock decides, never the browser.
 *
 *   2. **Idempotency** — the claim is a Firestore transaction that moves the
 *      email from `SCHEDULED` to `SENDING`. Only one execution can win that
 *      transition, so a retried Cloud Task or two concurrent executions can
 *      never send the same email twice.
 *
 *   3. **Cancellation and rescheduling** — a cancelled email is no longer
 *      `SCHEDULED`, so it cannot be claimed. A reschedule bumps
 *      `scheduleVersion`; a task carrying the old version is refused.
 *
 * Delivery is *at-least-once*, not exactly-once: if the process dies between
 * the SMTP server accepting a message and the result being written back, the
 * outcome of that one message is genuinely unknown. See `reapStaleScheduled`.
 */

const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const store = require('../../shared/store.js');
const { resolveConfig } = require('../../shared/config.js');
const dispatch = require('../module-3-retry-logic/dispatch.js');
const logger = require('../module-4-final-status-logger/logger.js');
const clock = require('./clock.js');
const guard = require('./guard.js');

/** How many due emails one sweep may dispatch. */
const SWEEP_BATCH = Math.max(1, Number(process.env.SCHEDULE_SWEEP_BATCH) || 5);

/** An email stuck in flight for longer than this is considered abandoned. */
const STALE_AFTER_MS = 90 * 1000;

/**
 * Read a timestamp that may be a Firestore Timestamp, an ISO string or epoch
 * milliseconds.
 *
 * @returns {number|null} epoch milliseconds
 */
function toMillis(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return null;
}

/**
 * Claim a due scheduled email for delivery.
 *
 * The whole check-and-set happens inside one Firestore transaction, so it is
 * the single point where "may this email be sent?" is decided.
 *
 * @param {object} params
 * @param {string} params.emailId
 * @param {number} params.scheduleVersion
 * @param {number} [params.now] epoch milliseconds (injectable for tests)
 * @returns {Promise<{claimed:boolean, reason?:string, email?:object, dueAt?:number}>}
 */
async function claimScheduledEmail({ emailId, scheduleVersion, now = Date.now() }) {
  const ref = store.emailsCol().doc(emailId);
  const version = Number(scheduleVersion);

  return store.db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return { claimed: false, reason: 'missing' };

    const email = snap.data();

    const dueAt = toMillis(email.scheduledAt);

    const decision = guard.decideClaim({
      status: email.status,
      scheduleVersion: email.scheduleVersion,
      expectedVersion: version,
      dueAt,
      now,
    });
    if (!decision.claimed) {
      return { claimed: false, reason: decision.reason, status: email.status, dueAt };
    }

    t.update(ref, {
      status: 'SENDING',
      dispatchedAt: Timestamp.fromDate(new Date(now)),
      updatedAt: store.stamp(),
    });

    // Move the counters in the same transaction, so the statistics can never
    // drift away from the documents.
    t.set(
      store.statsDoc(),
      {
        scheduled: FieldValue.increment(-1),
        sending: FieldValue.increment(1),
        updatedAt: store.stamp(),
      },
      { merge: true }
    );

    return { claimed: true, email: { ...email, status: 'SENDING' }, dueAt };
  });
}

/**
 * Claim a due scheduled email and send it through the existing pipeline.
 *
 * @param {object} params
 * @param {string} params.emailId
 * @param {number} params.scheduleVersion
 * @returns {Promise<{dispatched:boolean, reason?:string, finalStatus?:string}>}
 */
async function dispatchDueEmail({ emailId, scheduleVersion }) {
  const claim = await claimScheduledEmail({ emailId, scheduleVersion });

  if (!claim.claimed) {
    if (claim.reason === 'not-due') {
      console.log(
        `[scheduling] ${emailId} is due at ${new Date(claim.dueAt).toISOString()}, now is ${new Date().toISOString()}`
      );
    }
    return { dispatched: false, reason: claim.reason };
  }

  const email = claim.email;

  await logger.pushActivity({
    emailId,
    message: `${emailId} — scheduled delivery started (due ${clock.describeInTimeZone(
      claim.dueAt,
      email.timezone || 'UTC'
    )})`,
    type: 'info',
    kind: 'dispatch',
    createdBy: email.createdBy || null,
  });

  const config = await resolveConfig(store.db);

  // `scheduled: true` makes the retry engine ignore the *interactive*
  // dispatcher flags (running / paused). Those flags belong to the browser
  // driven FIFO queue; a scheduled delivery is server driven and must not be
  // switched off by somebody pausing the dashboard.
  await dispatch.processEmail(email, config, { scheduled: true });

  const after = await store.emailsCol().doc(emailId).get();
  const finalStatus = after.exists ? after.data().status : 'UNKNOWN';

  return { dispatched: true, finalStatus };
}

/**
 * Dispatch every scheduled email whose time has come.
 *
 * This is the safety net that covers everything the task queue cannot:
 * schedules further out than Cloud Tasks' 30-day window, tasks that were
 * lost, and emails that were re-armed after an abandoned attempt.
 *
 * @param {object} [options]
 * @param {number} [options.limit] how many emails to dispatch at once
 * @param {number} [options.now] epoch milliseconds (injectable for tests)
 */
async function sweepDueScheduledEmails(options = {}) {
  const limit = Math.max(1, Number(options.limit) || SWEEP_BATCH);
  const now = Number(options.now) || Date.now();

  // Re-arm whatever an earlier execution left behind before looking for new
  // work — a re-armed email is due again straight away.
  await reapStaleScheduled(now);

  const snap = await store.emailsCol().where('status', '==', 'SCHEDULED').limit(200).get();

  const due = snap.docs
    .map((doc) => doc.data())
    .filter((email) => {
      const at = toMillis(email.scheduledAt);
      return at !== null && at <= now;
    })
    .sort((a, b) => (toMillis(a.scheduledAt) || 0) - (toMillis(b.scheduledAt) || 0))
    .slice(0, limit);

  const results = [];
  for (const email of due) {
    // Sequential on purpose: one stalled SMTP attempt must not delay the
    // others, and the batch stays small.
    // eslint-disable-next-line no-await-in-loop
    const result = await dispatchDueEmail({
      emailId: email.id,
      scheduleVersion: Number(email.scheduleVersion || 1),
    });
    results.push({ emailId: email.id, ...result });
  }

  return { scanned: snap.size, dispatched: results.filter((r) => r.dispatched).length, results };
}

/**
 * Re-arm scheduled emails that were abandoned mid-flight.
 *
 * A scheduled email that is still `SENDING` / `RETRYING` long after its
 * `updatedAt` was last touched belongs to an execution that died. When no
 * attempt was ever recorded the email is safely put back into `SCHEDULED`;
 * when an attempt *was* recorded the outcome of that attempt is unknown, so
 * the email is left alone and an operator is told about it rather than
 * risking a duplicate send.
 */
async function reapStaleScheduled(now = Date.now()) {
  const staleBefore = new Date(now - STALE_AFTER_MS).toISOString();
  const snap = await store.emailsCol()
    .where('status', 'in', ['SENDING', 'RETRYING'])
    .limit(200)
    .get();

  const rearmed = [];
  const uncertain = [];

  for (const doc of snap.docs) {
    const email = doc.data();
    if (email.deliveryMode !== 'SCHEDULED') continue;
    if (!email.updatedAt || email.updatedAt >= staleBefore) continue;

    const attempts = Array.isArray(email.logs) ? email.logs.length : 0;

    if (attempts > 0) {
      uncertain.push(email.id);
      // eslint-disable-next-line no-await-in-loop
      await logger.pushActivity({
        emailId: email.id,
        message: `${email.id} — scheduled delivery outcome unknown (an attempt was interrupted); not retried automatically`,
        type: 'warning',
        kind: 'failed',
        createdBy: email.createdBy || null,
      });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    await store.db.runTransaction(async (t) => {
      const fresh = await t.get(doc.ref);
      if (!fresh.exists) return;
      const current = fresh.data();
      if (current.status !== 'SENDING' && current.status !== 'RETRYING') return;
      t.update(doc.ref, { status: 'SCHEDULED', updatedAt: store.stamp() });
      t.set(
        store.statsDoc(),
        {
          sending: FieldValue.increment(-1),
          scheduled: FieldValue.increment(1),
          updatedAt: store.stamp(),
        },
        { merge: true }
      );
    });

    // eslint-disable-next-line no-await-in-loop
    await logger.pushActivity({
      emailId: email.id,
      message: `${email.id} — scheduled delivery re-armed after an interrupted dispatch`,
      type: 'warning',
      kind: 'scheduled',
      createdBy: email.createdBy || null,
    });
    rearmed.push(email.id);
  }

  return { rearmed, uncertain };
}

module.exports = {
  SWEEP_BATCH,
  STALE_AFTER_MS,
  toMillis,
  decideClaim: guard.decideClaim,
  claimScheduledEmail,
  dispatchDueEmail,
  sweepDueScheduledEmails,
  reapStaleScheduled,
};
