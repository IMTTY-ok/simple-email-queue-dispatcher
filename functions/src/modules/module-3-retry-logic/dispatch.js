'use strict';

/**
 * Module 3 — Retry Logic Engine
 * ==============================
 *
 * The main logic of the project (PRD §7).
 *
 * Retry rule
 * ----------
 *   A failed email may be retried a maximum of `retryLimit` times.
 *
 *     Initial attempt = Attempt 1
 *     Retry 1         = Attempt 2
 *     Retry 2         = Attempt 3
 *     Retry 3         = Attempt 4
 *
 *   With the default `retryLimit` of 3 the maximum is therefore **4 total
 *   attempts**. The limit is configurable from the dashboard (0–10) and is
 *   clamped server-side.
 *
 * Retry behaviour
 * ---------------
 *   1. record the failed attempt
 *   2. increase the retry count
 *   3. check whether the retry limit has been reached
 *   4. if not:  status → RETRYING, wait `retryDelayMs`, attempt again
 *   5. if yes:  status → FAILED, record the final result
 *
 * Cloud Functions are ephemeral, so the engine runs as a *bounded dispatch
 * pass* inside a single invocation instead of an endless loop. The dashboard
 * keeps a pass alive by calling `/api/dispatch/continue` while work remains.
 */

const { FieldValue } = require('firebase-admin/firestore');
const { resolveConfig } = require('../../shared/config.js');
const store = require('../../shared/store.js');
const queue = require('../module-1-email-queue-creator/queue.js');
const simulator = require('../module-2-send-simulator/simulator.js');
const logger = require('../module-4-final-status-logger/logger.js');
const summary = require('../module-5-summary-exporter/summary.js');

/** Stay comfortably under the gen-1 max timeout (540s). */
const PASS_BUDGET_MS = 420000;

/** Renew the dispatch lease at least this often while a pass is alive. */
const LEASE_HEARTBEAT_MS = 20000;

/** An email stranded by a dead invocation is reclaimed after this long. */
const STALE_AFTER_MS = 90 * 1000;

/** Unique per invocation (FUNCTION_EXECUTION_ID is set by Cloud Functions). */
const OWNER = `${process.env.FUNCTION_EXECUTION_ID || 'local'}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/** Promise-based delay. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when the dispatcher was paused or stopped. */
async function dispatchStopped() {
  const meta = await store.getMeta();
  return !meta.dispatch.running || meta.dispatch.paused;
}

/**
 * Sleep, but wake up early when the dispatcher is paused or stopped.
 * The lease is renewed while waiting so a long backoff cannot lose it.
 */
async function waitPausable(ms) {
  const until = Date.now() + ms;
  let lastBeat = Date.now();
  while (Date.now() < until) {
    if (await dispatchStopped()) return;
    if (Date.now() - lastBeat >= LEASE_HEARTBEAT_MS) {
      lastBeat = Date.now();
      await store.renewDispatchLease(OWNER);
    }
    await sleep(200);
  }
}

/**
 * Process a single email: attempt delivery, retry on failure until the
 * retry limit is exhausted.
 */
async function processEmail(email, config) {
  const totalAttempts = email.retryLimit + 1;

  // Resume where the interrupted pass left off — restarting at attempt 1
  // would let repeated pause/resume cycles grant unlimited retries.
  const usedAttempts = email.attempts || 0;
  if (usedAttempts >= totalAttempts) {
    await logger.markFailed(email.id, totalAttempts, 'Retry limit exhausted');
    return;
  }
  const startAttempt = usedAttempts + 1;

  await logger.markSending(email.id, startAttempt);

  for (let attempt = startAttempt; attempt <= totalAttempts; attempt++) {
    if (await dispatchStopped()) {
      await logger.requeueInFlight(email.id);
      return;
    }

    try {
      const info = await simulator.sendSingleMail(config, {
        recipient: email.recipient,
        subject: email.subject,
        message: email.message,
        senderName: email.senderName,
      });

      const rejected = (info.rejected || []).filter(Boolean).map(String);
      if (rejected.length > 0) {
        const detail = `SMTP rejected recipient: ${rejected.join(', ')}`;
        await logger.logAttempt(email.id, attempt, 'FAILURE', detail);
        await logger.markFailed(email.id, attempt, detail);
        await waitPausable(config.interEmailDelayMs);
        return;
      }

      const smtpInfo = {
        accepted: info.accepted || [],
        response: String(info.response || '').slice(0, 200),
        messageId: String(info.messageId || ''),
      };
      await logger.logAttempt(email.id, attempt, 'SUCCESS', smtpInfo.response);
      await logger.markDelivered(email.id, attempt, smtpInfo);
      return;
    } catch (err) {
      const detail = simulator.humanError(err);
      const isLast = attempt === totalAttempts;

      await logger.logAttempt(email.id, attempt, 'FAILURE', detail);

      if (isLast) {
        await logger.markFailed(email.id, attempt, detail);
        await waitPausable(config.interEmailDelayMs);
        return;
      }

      await logger.markRetrying(email.id, attempt);
      await waitPausable(config.retryDelayMs);
      if (await dispatchStopped()) {
        await logger.requeueInFlight(email.id);
        return;
      }
    }
  }
}

/**
 * Reclaim emails that were left mid-flight by a killed invocation.
 * Without this an email could stay in SENDING forever.
 */
async function reapStale() {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const snap = await store.db
    .collection('emails')
    .where('status', 'in', ['SENDING', 'RETRYING'])
    .limit(200)
    .get();
  for (const doc of snap.docs) {
    const email = doc.data();
    if (email.updatedAt < staleBefore) {
      await store.db.collection('emails').doc(email.id).set(
        { status: 'QUEUED', updatedAt: new Date().toISOString() },
        { merge: true }
      );
      // fix the counters: this email was SENDING or RETRYING
      const counter = email.status === 'SENDING' ? 'sending' : 'retrying';
      await store.db.collection('stats').doc('main').set(
        { [counter]: FieldValue.increment(-1), queued: FieldValue.increment(1) },
        { merge: true }
      );
      await logger.pushActivity({
        emailId: email.id,
        message: `${email.id} — requeued after stale dispatch lease`,
        type: 'warning',
        createdBy: email.createdBy || null,
      });
    }
  }
}

/**
 * Run one bounded dispatch pass.
 *
 * Only one invocation may dispatch at a time — a second pass would send
 * duplicate emails for the same queue entry, so the dispatch lease is
 * claimed for the whole duration of the pass.
 */
async function dispatchPass() {
  const claimed = await store.claimDispatchLease(OWNER);
  if (!claimed) {
    return { done: false, reason: 'busy', remaining: await queue.queuedCount() };
  }

  try {
    const config = await resolveConfig(store.db);
    await reapStale();
    const started = Date.now();

    for (;;) {
      if (await dispatchStopped()) {
        return { done: true, reason: 'stopped', remaining: await queue.queuedCount() };
      }
      if (Date.now() - started >= PASS_BUDGET_MS) {
        return { done: false, reason: 'budget', remaining: await queue.queuedCount() };
      }
      if (!(await store.renewDispatchLease(OWNER))) {
        // lease stolen after expiry — stop rather than risk double-sending
        return { done: false, reason: 'busy', remaining: await queue.queuedCount() };
      }

      const email = await queue.nextQueued();
      if (!email) {
        await store.setDispatchRunning(false, false);
        await store.setCurrentProcessingId(null);
        return { done: true, remaining: 0 };
      }

      await processEmail(email, config);

      if (Date.now() - started >= PASS_BUDGET_MS) {
        return { done: false, reason: 'budget', remaining: await queue.queuedCount() };
      }
      await waitPausable(config.interEmailDelayMs);
    }
  } finally {
    await store.releaseDispatchLease(OWNER);
  }
}

/** Start dispatching. Refuses when the queue is empty or SMTP is missing. */
async function startDispatch() {
  const config = await resolveConfig(store.db);
  const stats = await store.readStatsDoc();
  if (stats.queued === 0) {
    return { ok: false, error: 'No emails in the queue. Add an email first.' };
  }
  if (!config.dryRun && !config.smtp.host) {
    return { ok: false, error: 'SMTP is not configured. Set it in Settings (or enable dry-run mode).' };
  }

  await store.setDispatchRunning(true, false);
  const result = await dispatchPass();
  return { ok: true, ...result, dispatcher: await store.getDispatcherState() };
}

/** Resume a paused dispatch. */
async function resumeDispatch() {
  await store.setDispatchRunning(true, false);
  const result = await dispatchPass();
  return { ok: true, ...result, dispatcher: await store.getDispatcherState() };
}

/** Continue the current pass — called by the dashboard while work remains. */
async function continueDispatch() {
  const meta = await store.getMeta();
  if (!meta.dispatch.running) {
    await store.setDispatchRunning(true, false);
  }
  const result = await dispatchPass();
  return { ok: true, ...result, dispatcher: await store.getDispatcherState() };
}

/** Pause the dispatcher. Cooperative — the current email is requeued. */
async function pauseDispatch() {
  await store.setDispatchRunning(true, true);
  return { ok: true, dispatcher: await store.getDispatcherState() };
}

/** Stop the dispatcher. */
async function stopDispatch() {
  simulator.resetTransport();
  await store.setDispatchRunning(false, false);
  return { ok: true, dispatcher: await store.getDispatcherState() };
}

/** Clear the queue, the activity log and the statistics. */
async function resetQueue() {
  simulator.resetTransport();
  await store.setDispatchRunning(false, false);
  await store.setCurrentProcessingId(null);
  await store.deleteCollection('emails');
  await store.deleteCollection('activity');
  await store.statsDoc().set(store.emptyStatsDoc());
  await store.setMeta({ emailSeq: 0, activitySeq: 0 });
  // A lease left behind by a killed invocation would block the next pass
  // until it expires, so drop it together with the queue.
  await store.clearDispatchLease();
  return { ok: true, stats: await summary.getStats() };
}

module.exports = {
  PASS_BUDGET_MS,
  LEASE_HEARTBEAT_MS,
  STALE_AFTER_MS,
  sleep,
  dispatchStopped,
  waitPausable,
  processEmail,
  reapStale,
  dispatchPass,
  startDispatch,
  resumeDispatch,
  continueDispatch,
  pauseDispatch,
  stopDispatch,
  resetQueue,
};
