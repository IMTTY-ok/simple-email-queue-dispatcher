'use strict';

/**
 * Module 6 — Scheduled Delivery: the schedule book-keeping.
 * ==========================================================
 *
 * Creating, cancelling and rescheduling a scheduled delivery.
 *
 * A scheduled email is an ordinary email document with three extra fields:
 *
 *   | field             | meaning                                            |
 *   |-------------------|----------------------------------------------------|
 *   | `status`          | `SCHEDULED` until it is claimed for delivery       |
 *   | `scheduledAt`     | the UTC instant it becomes due (Firestore Timestamp) |
 *   | `timezone`        | the IANA zone the user picked, kept for display     |
 *
 * plus the scheduling bookkeeping:
 *
 *   | field             | meaning                                            |
 *   |-------------------|----------------------------------------------------|
 *   | `deliveryMode`    | `IMMEDIATE` or `SCHEDULED`                          |
 *   | `scheduleVersion` | bumped on every reschedule; stale tasks are refused |
 *   | `scheduledTaskId` | the Cloud Task that carries this revision           |
 *   | `dispatchedAt`    | when the delivery actually started                  |
 *   | `cancelledAt`     | when it was cancelled                               |
 *
 * Nothing here talks to SMTP — the delivery itself is Module 3's job.
 */

const { Timestamp } = require('firebase-admin/firestore');

const store = require('../../shared/store.js');
const queue = require('../module-1-email-queue-creator/queue.js');
const logger = require('../module-4-final-status-logger/logger.js');
const clock = require('./clock.js');
const tasks = require('./tasks.js');
const guard = require('./guard.js');

/**
 * How many emails are waiting for their moment.
 */
async function scheduledCount() {
  const snap = await store.emailsCol().where('status', '==', 'SCHEDULED').limit(400).get();
  return snap.size;
}

/**
 * Create a scheduled email.
 *
 * @param {object} params
 * @param {object} params.input the raw request body (recipient/subject/message/…)
 * @param {number} params.retryLimit the retry limit of the installation
 * @param {string} params.createdBy the uid of the account creating it
 * @returns {Promise<{ok:true,email:object,scheduler:string,warning?:string}
 *                  |{ok:false,error:string,status?:number}>}
 */
async function createScheduledEmail({ input, retryLimit = 3, createdBy = null, dispatchUrl = null }) {
  const validation = queue.validateEmail(input);
  if (!validation.ok) return { ok: false, error: validation.error, status: 400 };

  const source = input && typeof input === 'object' ? input : {};
  const schedule = clock.validateSchedule({
    scheduledAt: source.scheduledAt,
    timezone: source.timezone,
  });
  if (!schedule.ok) return { ok: false, error: schedule.error, status: 400 };

  const { scheduledAtUtc, timezone } = schedule.value;

  // The email itself is created by Module 1, so the id, the sequence number
  // and the statistics counters stay exactly the same as for an immediate
  // email.
  const { email } = await queue.enqueue(validation.value, retryLimit, createdBy, {
    deliveryMode: 'SCHEDULED',
    scheduledAt: Timestamp.fromDate(scheduledAtUtc),
    timezone,
  });

  // Now hand the delivery to the Cloud Tasks queue.
  let scheduler = 'sweep';
  let warning;
  let taskId = null;

  const task = await tasks.createTask({
    emailId: email.id,
    scheduleVersion: email.scheduleVersion,
    scheduledAt: scheduledAtUtc,
    dispatchUrl,
  });

  if (task.ok) {
    if (task.beyondTaskWindow) {
      scheduler = 'sweep';
      warning =
        'This date is further out than the Cloud Tasks window (30 days); delivery relies on the periodic scheduler sweep.';
    } else {
      scheduler = 'cloud-tasks';
      taskId = task.taskId;
    }
  } else {
    scheduler = 'sweep';
    warning = `The scheduled task could not be queued (${task.error}); delivery relies on the periodic scheduler sweep.`;
  }

  if (taskId) {
    await store.emailsCol().doc(email.id).set({ scheduledTaskId: taskId }, { merge: true });
  }

  await logger.pushActivity({
    emailId: email.id,
    message: `${email.id} — scheduled for ${clock.describeInTimeZone(scheduledAtUtc, timezone)}`,
    type: 'info',
    kind: 'scheduled',
    createdBy: email.createdBy || null,
  });

  return {
    ok: true,
    email: store.serializeEmail({ ...email, scheduledTaskId: taskId }),
    scheduler,
    warning,
  };
}

/**
 * Cancel a scheduled email.
 *
 * A cancelled email can never be claimed, so a task that is already queued
 * becomes harmless on its own.
 *
 * @param {object} params
 * @param {string} params.id the email id
 * @param {string|null} params.scope the caller's uid, or `null` for an admin
 * @returns {Promise<{ok:true,email:object}|{ok:false,error:string,status?:number}>}
 */
async function cancelScheduledEmail({ id, scope = null }) {
  const ref = store.emailsCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'Email not found.', status: 404 };

  const email = snap.data();
  if (scope && email.createdBy && email.createdBy !== scope) {
    return { ok: false, error: 'That email belongs to another account.', status: 403 };
  }
  if (!guard.isEligibleForScheduleChange(email.status)) {
    return {
      ok: false,
      error: `This email is ${email.status.toLowerCase()} and can no longer be cancelled.`,
      status: 409,
    };
  }

  const taskId = email.scheduledTaskId || null;

  const cancelled = await logger.moveStatus(id, 'CANCELLED', {
    cancelledAt: Timestamp.fromDate(new Date()),
    scheduledTaskId: null,
  });
  if (!cancelled) return { ok: false, error: 'Email not found.', status: 404 };

  if (taskId) {
    // Best effort — the status change above already makes the task harmless.
    await tasks.deleteTask(taskId);
  }

  await logger.pushActivity({
    emailId: id,
    message: `${id} — scheduled delivery cancelled`,
    type: 'warning',
    kind: 'cancelled',
    createdBy: email.createdBy || null,
  });

  return { ok: true, email: store.serializeEmail(cancelled) };
}

/**
 * Move a scheduled email to a new moment.
 *
 * The schedule version is bumped, a new task is queued, and the old task is
 * deleted. Even when the old task cannot be deleted it stays harmless: the
 * dispatch handler compares the version it carries with the version on the
 * email and refuses anything older.
 *
 * @param {object} params
 * @param {string} params.id the email id
 * @param {string|null} params.scope the caller's uid, or `null` for an admin
 * @param {string} params.scheduledAt the new local wall-clock time
 * @param {string} params.timezone the new IANA time zone
 * @returns {Promise<{ok:true,email:object,scheduler:string,warning?:string}
 *                  |{ok:false,error:string,status?:number}>}
 */
async function rescheduleScheduledEmail({ id, scope = null, scheduledAt, timezone, dispatchUrl = null }) {
  const ref = store.emailsCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'Email not found.', status: 404 };

  const email = snap.data();
  if (scope && email.createdBy && email.createdBy !== scope) {
    return { ok: false, error: 'That email belongs to another account.', status: 403 };
  }
  if (!guard.isEligibleForScheduleChange(email.status)) {
    return {
      ok: false,
      error: `This email is ${email.status.toLowerCase()} and can no longer be rescheduled.`,
      status: 409,
    };
  }

  const schedule = clock.validateSchedule({ scheduledAt, timezone });
  if (!schedule.ok) return { ok: false, error: schedule.error, status: 400 };

  const { scheduledAtUtc, timezone: zone } = schedule.value;
  const previousVersion = Number(email.scheduleVersion || 1);
  const nextVersion = previousVersion + 1;
  const previousTaskId = email.scheduledTaskId || null;

  await ref.set(
    {
      scheduledAt: Timestamp.fromDate(scheduledAtUtc),
      timezone: zone,
      scheduleVersion: nextVersion,
      scheduledTaskId: null,
      updatedAt: store.stamp(),
    },
    { merge: true }
  );

  let scheduler = 'sweep';
  let warning;
  let taskId = null;

  const task = await tasks.createTask({
    emailId: id,
    scheduleVersion: nextVersion,
    scheduledAt: scheduledAtUtc,
    dispatchUrl,
  });

  if (task.ok && !task.beyondTaskWindow) {
    scheduler = 'cloud-tasks';
    taskId = task.taskId;
  } else if (task.ok) {
    warning =
      'This date is further out than the Cloud Tasks window (30 days); delivery relies on the periodic scheduler sweep.';
  } else {
    warning = `The scheduled task could not be queued (${task.error}); delivery relies on the periodic scheduler sweep.`;
  }

  if (taskId) {
    await ref.set({ scheduledTaskId: taskId }, { merge: true });
  }

  if (previousTaskId) {
    await tasks.deleteTask(previousTaskId);
  }

  await logger.pushActivity({
    emailId: id,
    message: `${id} — schedule moved to ${clock.describeInTimeZone(scheduledAtUtc, zone)}`,
    type: 'info',
    kind: 'scheduled',
    createdBy: email.createdBy || null,
  });

  const fresh = await ref.get();
  return {
    ok: true,
    email: store.serializeEmail(fresh.data()),
    scheduler,
    warning,
  };
}

/**
 * The scheduled emails a caller may see.
 *
 * @param {string|null} scope the caller's uid, or `null` for an admin
 */
async function listScheduledEmails(scope = null) {
  const query = scope
    ? store.emailsCol().where('createdBy', '==', scope).orderBy('seq', 'asc')
    : store.emailsCol().orderBy('seq', 'asc');
  const snap = await query.get();
  return snap.docs
    .map((doc) => store.serializeEmail(doc.data()))
    .filter((email) => email.deliveryMode === 'SCHEDULED' || email.status === 'SCHEDULED');
}

/**
 * May this email still be cancelled or rescheduled?
 */
function isEligible(email) {
  return guard.isEligibleForScheduleChange(email ? email.status : null);
}

module.exports = {
  scheduledCount,
  createScheduledEmail,
  cancelScheduledEmail,
  rescheduleScheduledEmail,
  listScheduledEmails,
  isEligible,
};
