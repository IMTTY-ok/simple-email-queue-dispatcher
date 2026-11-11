'use strict';

/**
 * Dispatch engine.
 *
 * Cloud Functions are ephemeral, so the old background loop becomes a bounded
 * "dispatch pass" that runs inside one invocation and yields when it runs out of
 * queue, gets paused/stopped, or hits its time budget. The dashboard keeps the
 * pass alive by calling /api/dispatch/continue while more work remains.
 *
 * FIFO, retry counting and attempt tracking behave exactly like the old server.
 */

const { FieldValue } = require('firebase-admin/firestore');
const { resolveConfig } = require('./config.js');
const { sendSingleMail, humanError, resetTransport } = require('./smtp.js');
const store = require('./firestore.js');

// stay comfortably under the gen-1 max timeout (540s)
const PASS_BUDGET_MS = 420000;

// renew the dispatch lease at least this often while a pass is alive
const LEASE_HEARTBEAT_MS = 20000;

// unique per invocation (FUNCTION_EXECUTION_ID is set by Cloud Functions)
const OWNER = `${process.env.FUNCTION_EXECUTION_ID || 'local'}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dispatchStopped() {
  const meta = await store.getMeta();
  return !meta.dispatch.running || meta.dispatch.paused;
}

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

async function processEmail(email, config) {
  const totalAttempts = email.retryLimit + 1;

  // resume where the interrupted pass left off — restarting at attempt 1 would
  // let repeated pause/resume cycles grant unlimited retries
  const usedAttempts = email.attempts || 0;
  if (usedAttempts >= totalAttempts) {
    await store.markFailed(email.id, totalAttempts, 'Retry limit exhausted');
    return;
  }
  const startAttempt = usedAttempts + 1;

  await store.markSending(email.id, startAttempt);

  for (let attempt = startAttempt; attempt <= totalAttempts; attempt++) {
    if (await dispatchStopped()) {
      await store.requeueInFlight(email.id);
      return;
    }

    try {
      const info = await sendSingleMail(config, {
        recipient: email.recipient,
        subject: email.subject,
        message: email.message,
        senderName: email.senderName,
      });

      const rejected = (info.rejected || []).filter(Boolean).map(String);
      if (rejected.length > 0) {
        const detail = `SMTP rejected recipient: ${rejected.join(', ')}`;
        await store.logAttempt(email.id, attempt, 'FAILURE', detail);
        await store.markFailed(email.id, attempt, detail);
        await waitPausable(config.interEmailDelayMs);
        return;
      }

      const smtpInfo = {
        accepted: info.accepted || [],
        response: String(info.response || '').slice(0, 200),
        messageId: String(info.messageId || ''),
      };
      await store.logAttempt(email.id, attempt, 'SUCCESS', smtpInfo.response);
      await store.markDelivered(email.id, attempt, smtpInfo);
      return;
    } catch (err) {
      const detail = humanError(err);
      const isLast = attempt === totalAttempts;

      await store.logAttempt(email.id, attempt, 'FAILURE', detail);

      if (isLast) {
        await store.markFailed(email.id, attempt, detail);
        await waitPausable(config.interEmailDelayMs);
        return;
      }

      await store.markRetrying(email.id, attempt);
      await waitPausable(config.retryDelayMs);
      if (await dispatchStopped()) {
        await store.requeueInFlight(email.id);
        return;
      }
    }
  }
}

/** Reclaim emails that were left mid-flight by a killed invocation. */
async function reapStale() {
  const staleBefore = new Date(Date.now() - 90 * 1000).toISOString();
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
      if (email.status === 'SENDING') {
        await store.db.collection('stats').doc('main').set(
          { sending: FieldValue.increment(-1), queued: FieldValue.increment(1) },
          { merge: true }
        );
      } else {
        await store.db.collection('stats').doc('main').set(
          { retrying: FieldValue.increment(-1), queued: FieldValue.increment(1) },
          { merge: true }
        );
      }
      await store.pushActivity({
        emailId: email.id,
        message: `${email.id} — requeued after stale dispatch lease`,
        type: 'warning',
      });
    }
  }
}

async function dispatchPass() {
  // only one invocation may dispatch at a time — a second pass would send
  // duplicate emails for the same queue entry
  const claimed = await store.claimDispatchLease(OWNER);
  if (!claimed) {
    return { done: false, reason: 'busy', remaining: await store.queuedCount() };
  }

  try {
    const config = await resolveConfig(store.db);
    await reapStale();
    const started = Date.now();

    for (;;) {
      if (await dispatchStopped()) {
        return { done: true, reason: 'stopped', remaining: await store.queuedCount() };
      }
      if (Date.now() - started >= PASS_BUDGET_MS) {
        return { done: false, reason: 'budget', remaining: await store.queuedCount() };
      }
      if (!(await store.renewDispatchLease(OWNER))) {
        // lease stolen after expiry — stop rather than risk double-sending
        return { done: false, reason: 'busy', remaining: await store.queuedCount() };
      }

      const email = await store.nextQueued();
      if (!email) {
        await store.setDispatchRunning(false, false);
        await store.setCurrentProcessingId(null);
        return { done: true, remaining: 0 };
      }

      await processEmail(email, config);

      if (Date.now() - started >= PASS_BUDGET_MS) {
        return { done: false, reason: 'budget', remaining: await store.queuedCount() };
      }
      await waitPausable(config.interEmailDelayMs);
    }
  } finally {
    await store.releaseDispatchLease(OWNER);
  }
}

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

async function resumeDispatch() {
  await store.setDispatchRunning(true, false);
  const result = await dispatchPass();
  return { ok: true, ...result, dispatcher: await store.getDispatcherState() };
}

async function continueDispatch() {
  const meta = await store.getMeta();
  if (!meta.dispatch.running) {
    await store.setDispatchRunning(true, false);
  }
  const result = await dispatchPass();
  return { ok: true, ...result, dispatcher: await store.getDispatcherState() };
}

async function pauseDispatch() {
  await store.setDispatchRunning(true, true);
  return { ok: true, dispatcher: await store.getDispatcherState() };
}

async function stopDispatch() {
  resetTransport();
  await store.setDispatchRunning(false, false);
  return { ok: true, dispatcher: await store.getDispatcherState() };
}

async function resetQueue() {
  resetTransport();
  const stats = await store.resetQueue();
  return { ok: true, stats };
}

module.exports = {
  startDispatch,
  resumeDispatch,
  continueDispatch,
  pauseDispatch,
  stopDispatch,
  resetQueue,
  getDispatcherState: () => store.getDispatcherState(),
};