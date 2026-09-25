import express from 'express';
import config, { applyConfig, publicConfig } from './config.js';
import { verifyConnection, sendSingleMail, resetTransport, humanError } from './transport.js';
import { addClient, clientCount, broadcast } from './sse.js';
import * as store from './store.js';
import * as dispatcher from './dispatcher.js';

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ok(res, payload) {
  res.json(payload);
}

function fail(res, status, error) {
  res.status(status).json({ ok: false, error });
}

// ── meta / health ──────────────────────────────────────────────────────────────

router.get('/health', (req, res) => {
  ok(res, {
    ok: true,
    service: 'email-queue-dispatcher-server',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    dispatcher: dispatcher.getDispatcherState(),
    sseClients: clientCount(),
    smtpConfigured: publicConfig().smtpConfigured,
    stats: store.getStats(),
  });
});

// ── configuration ──────────────────────────────────────────────────────────────

router.get('/config', (req, res) => {
  ok(res, publicConfig());
});

router.post('/config', async (req, res) => {
  const body = req.body || {};
  const dryRunTurnedOff = body.dryRun === false;
  try {
    const changed = applyConfig(body);
    resetTransport();

    // if someone just switched OFF dry-run, run a real connection check so they
    // learn immediately whether their SMTP credentials actually work.
    let verify = null;
    if (changed.length > 0 && dryRunTurnedOff && !config.dryRun) {
      verify = await verifyConnection();
    }
    broadcast('config', publicConfig());
    ok(res, { ok: true, changed, verify, config: publicConfig() });
  } catch (err) {
    resetTransport();
    fail(res, 500, humanError(err));
  }
});

router.post('/config/test', async (req, res) => {
  const verify = await verifyConnection();
  ok(res, verify);
});

router.post('/config/test-send', async (req, res) => {
  const { to } = req.body || {};
  if (!to || !EMAIL_REGEX.test(String(to))) {
    return fail(res, 400, 'Valid recipient email required.');
  }
  const verify = await verifyConnection();
  if (!verify.ok) return ok(res, { ok: false, step: 'connection', verify });
  try {
    const info = await sendSingleMail({
      recipient: to,
      subject: 'Email Queue Dispatcher — test message',
      message: 'This is a test message from the Email Queue Dispatcher.\n\nIf you received this, SMTP settings work correctly.',
    });
    ok(res, { ok: true, step: 'send', verify, smtp: { accepted: info.accepted, rejected: info.rejected, response: info.response } });
  } catch (err) {
    ok(res, { ok: false, step: 'send', verify, error: humanError(err) });
  }
});

// ── emails (queue) ─────────────────────────────────────────────────────────────

router.get('/emails', (req, res) => {
  ok(res, store.listEmails());
});

router.get('/emails/:id', (req, res) => {
  const email = store.getEmail(req.params.id);
  if (!email) return fail(res, 404, 'Email not found.');
  ok(res, email);
});

router.post('/emails/batch', (req, res) => {
  const items = (req.body && req.body.items) || [];
  if (!Array.isArray(items) || items.length === 0) {
    return fail(res, 400, 'items[] with recipient/subject/message is required.');
  }
  const created = [];
  for (const item of items) {
    const { recipient, subject, message, senderName } = item || {};
    if (!recipient || !String(recipient).trim()) return fail(res, 400, 'Recipient email is required for every item.');
    if (!EMAIL_REGEX.test(String(recipient).trim())) return fail(res, 400, `Invalid recipient: ${recipient}`);
    if (!subject || !String(subject).trim()) return fail(res, 400, 'Subject is required for every item.');
    if (!message || !String(message).trim()) return fail(res, 400, 'Message is required for every item.');
    created.push(
      store.enqueue({
        recipient: String(recipient).trim(),
        subject: String(subject).trim(),
        message: String(message).trim(),
        senderName: senderName ? String(senderName).trim() : '',
      }).email
    );
  }
  ok(res, { ok: true, count: created.length, created });
});

router.post('/emails', (req, res) => {
  const { recipient, subject, message, senderName } = req.body || {};

  if (!recipient || !String(recipient).trim()) return fail(res, 400, 'Recipient email is required.');
  if (!EMAIL_REGEX.test(String(recipient).trim())) return fail(res, 400, 'Please enter a valid email address.');
  if (!subject || !String(subject).trim()) return fail(res, 400, 'Subject is required.');
  if (!message || !String(message).trim()) return fail(res, 400, 'Message is required.');

  const { email, position } = store.enqueue({
    recipient: String(recipient).trim(),
    subject: String(subject).trim(),
    message: String(message).trim(),
    senderName: senderName ? String(senderName).trim() : '',
  });

  ok(res, { ok: true, email, position });
});

router.delete('/emails/:id', (req, res) => {
  const removed = store.removeEmail(req.params.id);
  if (!removed) return fail(res, 404, 'Email not found.');
  ok(res, { ok: true, removed });
});

// ── activity + stats ───────────────────────────────────────────────────────────

router.get('/activity', (req, res) => {
  ok(res, store.listActivity());
});

router.get('/stats', (req, res) => {
  ok(res, store.getStats());
});

// ── dispatcher lifecycle ───────────────────────────────────────────────────────

router.post('/dispatch/start', (req, res) => {
  const result = dispatcher.startDispatch();
  if (!result.ok) return fail(res, 400, result.error);
  ok(res, { ok: true, dispatcher: dispatcher.getDispatcherState() });
});

router.post('/dispatch/pause', (req, res) => {
  ok(res, dispatcher.pauseDispatch());
});

router.post('/dispatch/resume', (req, res) => {
  ok(res, dispatcher.resumeDispatch());
});

router.post('/dispatch/stop', (req, res) => {
  ok(res, dispatcher.stopDispatch());
});

router.post('/dispatch/reset', (req, res) => {
  dispatcher.stopDispatch();
  resetTransport();
  ok(res, { ok: true, stats: store.clear() });
});

// ── live events (Server-Sent Events) ───────────────────────────────────────────

router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // heartbeat keeps idle connections alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  addClient(res);

  // send the full current state immediately so a fresh page catches up
  const snapshot = {
    dispatcher: dispatcher.getDispatcherState(),
    emails: store.listEmails(),
    activity: store.listActivity(),
    config: publicConfig(),
    stats: store.getStats(),
  };
  res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);

  res.on('close', () => {
    clearInterval(heartbeat);
  });
});

export { router };