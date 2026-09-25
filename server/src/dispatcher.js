import config from './config.js';
import { sendSingleMail, verifyConnection, humanError } from './transport.js';
import { broadcast } from './sse.js';
import * as store from './store.js';

/**
 * The dispatcher: takes emails from the queue (FIFO) and physically sends
 * them through SMTP with a bounded retry loop.
 *
 *   QUEUED → SENDING → DELIVERED   (server accepted the message)
 *          → SENDING → RETRYING → … → FAILED  (server refused it, retries exhausted)
 */

const dispatcher = {
  running: false,
  paused: false,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pause-aware wait: also stops ticking while the dispatcher is paused. */
async function waitPausable(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until && dispatcher.running) {
    while (dispatcher.paused && dispatcher.running) await sleep(200);
    await sleep(200);
  }
}

function emitState() {
  broadcast('dispatcher', {
    running: dispatcher.running,
    paused: dispatcher.paused,
  });
}

export function getDispatcherState() {
  return { running: dispatcher.running, paused: dispatcher.paused };
}

export function startDispatch() {
  if (dispatcher.running) return { ok: false, error: 'Dispatcher is already running.' };
  if (!store.hasQueued()) return { ok: false, error: 'No emails in the queue. Add an email first.' };
  if (!config.dryRun && !config.smtp.host) {
    return { ok: false, error: 'SMTP is not configured. Set it in Settings (or enable dry-run mode).' };
  }

  dispatcher.paused = false;
  dispatcher.running = true;
  emitState();
  run();
  return { ok: true };
}

export function pauseDispatch() {
  dispatcher.paused = true;
  emitState();
  return { ok: true };
}

export function resumeDispatch() {
  dispatcher.paused = false;
  emitState();
  return { ok: true };
}

export function stopDispatch() {
  dispatcher.paused = false;
  dispatcher.running = false;
  emitState();
  return { ok: true };
}

async function run() {
  try {
    while (dispatcher.running) {
      while (dispatcher.paused && dispatcher.running) await sleep(200);
      if (!dispatcher.running) break;

      const email = store.nextQueued();
      if (!email) break;

      await processEmail(email);
      if (!dispatcher.running) break;

      // small gap between emails so the log reads naturally
      await waitPausable(config.interEmailDelayMs);
    }
  } catch (err) {
    console.error('[dispatcher] fatal loop error:', err);
  } finally {
    dispatcher.running = false;
    dispatcher.paused = false;
    emitState();
  }
}

/**
 * Drive one email through its attempts. Returns nothing; all state
 * transitions + logs are recorded via the store.
 */
async function processEmail(email) {
  const totalAttempts = email.retryLimit + 1;

  store.markSending(email.id);
  await sleep(200); // let the dashboard render SENDING before the first attempt

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    while (dispatcher.paused && dispatcher.running) await sleep(200);
    if (!dispatcher.running) return;

    try {
      const info = await sendSingleMail({
        recipient: email.recipient,
        subject: email.subject,
        message: email.message,
        senderName: email.senderName,
      });

      const rejected = (info.rejected || []).filter(Boolean).map(String);
      if (rejected.length > 0) {
        const detail = `SMTP rejected recipient: ${rejected.join(', ')}`;
        store.logAttempt(email.id, attempt, 'FAILURE', detail);
        store.markFailed(email.id, attempt, detail);
        await waitPausable(config.interEmailDelayMs);
        return;
      }

      const smtpInfo = {
        accepted: info.accepted || [],
        response: String(info.response || '').slice(0, 200),
        messageId: String(info.messageId || ''),
      };
      store.logAttempt(email.id, attempt, 'SUCCESS', smtpInfo.response);
      store.markDelivered(email.id, attempt, smtpInfo);
      return;
    } catch (err) {
      const detail = humanError(err);
      const isLast = attempt === totalAttempts;

      store.logAttempt(email.id, attempt, 'FAILURE', detail);

      if (isLast) {
        store.markFailed(email.id, attempt, detail);
        await waitPausable(config.interEmailDelayMs);
        return;
      }

      store.markRetrying(email.id, attempt);
      await waitPausable(config.retryDelayMs); // backoff before next attempt
      if (!dispatcher.running) return;
    }
  }
}

/** Send a single mail immediately (for the settings "Test send" button). */
export async function testSend({ to, subject }) {
  const connection = await verifyConnection();
  return {
    connection,
    delivery: await sendSingleMail({
      recipient: to,
      subject: subject || 'Email Queue Dispatcher — test message',
      message:
        'This is a test message from the Email Queue Dispatcher.\n\nIf you received this, SMTP settings are working correctly.',
    }),
  };
}