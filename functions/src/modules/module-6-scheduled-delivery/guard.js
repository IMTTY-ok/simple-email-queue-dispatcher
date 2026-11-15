'use strict';

/**
 * Module 6 — Scheduled Delivery: the delivery guard.
 * ===================================================
 *
 * The rules that decide whether a scheduled email may be sent. Pure decision
 * logic — no Firebase, no network, no clock of its own — so every rule can be
 * unit-tested directly.
 *
 * These four checks are the whole safety story:
 *
 *   1. only a `SCHEDULED` email may be claimed;
 *   2. only the *current* revision of the schedule may be claimed, which is
 *      what makes the task of a superseded schedule harmless;
 *   3. the schedule must carry a moment at all;
 *   4. the moment must have arrived — the server's clock is the only
 *      authority, so an email can never go out early.
 *
 * The check-and-set itself lives in `engine.js`, inside one Firestore
 * transaction, so exactly one execution can ever win the claim.
 */

/**
 * May this email be claimed for delivery right now?
 *
 * @param {object} state
 * @param {string} state.status the email's current status
 * @param {number|string} state.scheduleVersion the version on the email
 * @param {number|string} state.expectedVersion the version the caller carries
 * @param {number|null} state.dueAt epoch milliseconds of the scheduled moment
 * @param {number} state.now the current epoch milliseconds
 * @returns {{claimed:boolean, reason?:string}}
 */
function decideClaim({ status, scheduleVersion, expectedVersion, dueAt, now }) {
  if (status !== 'SCHEDULED') {
    return { claimed: false, reason: 'not-scheduled' };
  }
  if (Number(scheduleVersion || 0) !== Number(expectedVersion)) {
    return { claimed: false, reason: 'stale-version' };
  }
  if (dueAt === null || dueAt === undefined || !Number.isFinite(dueAt)) {
    return { claimed: false, reason: 'no-schedule' };
  }
  if (dueAt > now) {
    return { claimed: false, reason: 'not-due' };
  }
  return { claimed: true };
}

/**
 * May this email still be cancelled or rescheduled?
 * Only a scheduled email is still waiting for its moment.
 */
function isEligibleForScheduleChange(status) {
  return status === 'SCHEDULED';
}

/**
 * Is this moment far enough out for a Cloud Tasks task to carry it?
 * Cloud Tasks refuses a schedule further than 30 days ahead.
 */
function withinTaskWindow(dueAt, now, maxDelayMs) {
  if (!Number.isFinite(dueAt) || !Number.isFinite(now)) return false;
  return dueAt - now <= maxDelayMs;
}

module.exports = {
  decideClaim,
  isEligibleForScheduleChange,
  withinTaskWindow,
};
