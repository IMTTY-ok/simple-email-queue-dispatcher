'use strict';

/**
 * HTTP API — the exact same endpoints the frontend already calls.
 * All routes keep the /api prefix so the Cloud Function base URL +
 * '/api/...' matches the browser's existing apiUrl() path math.
 */

const express = require('express');
const { resolveConfig, applyConfigAsync, publicConfig, syncPasswordFlag, ensureSeededConfig } = require('./config.js');
const { verifyConnection, sendSingleMail, resetTransport, humanError } = require('./smtp.js');
const store = require('./firestore.js');
const dispatch = require('./dispatch.js');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ok(res, payload) {
  res.json(payload);
}

function fail(res, status, error) {
  res.status(status).json({ ok: false, error });
}

function h(fn) {
  return (req, res) =>
    fn(req, res).catch((err) => {
      console.error('[functions] route error:', err);
      if (!res.headersSent) fail(res, 500, humanError(err));
    });
}

// ── meta / health ──────────────────────────────────────────────────────────────

router.get('/api/health', h(async (req, res) => {
  const config = await resolveConfig(store.db);
  ok(res, {
    ok: true,
    service: 'email-queue-dispatcher-functions',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    dispatcher: await store.getDispatcherState(),
    smtpConfigured: publicConfig(config).smtpConfigured,
    stats: await store.getStats(),
  });
}));

// ── configuration ──────────────────────────────────────────────────────────────

router.get('/api/config', h(async (req, res) => {
  const config = await resolveConfig(store.db);
  await ensureSeededConfig(store.db, config);
  await syncPasswordFlag(store.db, config);
  ok(res, publicConfig(config));
}));

router.post('/api/config', h(async (req, res) => {
  const body = req.body || {};
  const dryRunTurnedOff = body.dryRun === false;

  const { changed, config } = await applyConfigAsync(store.db, body);
  resetTransport();

  let verify = null;
  if (changed.length > 0 && dryRunTurnedOff && !config.dryRun) {
    verify = await verifyConnection(config);
  }
  await syncPasswordFlag(store.db, config);

  ok(res, { ok: true, changed, verify, config: publicConfig(config) });
}));

router.post('/api/config/test', h(async (req, res) => {
  const config = await resolveConfig(store.db);
  ok(res, await verifyConnection(config));
}));

router.post('/api/config/test-send', h(async (req, res) => {
  const { to } = req.body || {};
  if (!to || !EMAIL_REGEX.test(String(to))) {
    return fail(res, 400, 'Valid recipient email required.');
  }
  const config = await resolveConfig(store.db);
  const verify = await verifyConnection(config);
  if (!verify.ok) return ok(res, { ok: false, step: 'connection', verify });
  try {
    const info = await sendSingleMail(config, {
      recipient: to,
      subject: 'Email Queue Dispatcher — test message',
      message: 'This is a test message from the Email Queue Dispatcher.\n\nIf you received this, SMTP settings work correctly.',
    });
    ok(res, { ok: true, step: 'send', verify, smtp: { accepted: info.accepted, rejected: info.rejected, response: info.response } });
  } catch (err) {
    ok(res, { ok: false, step: 'send', verify, error: humanError(err) });
  }
}));

// ── emails (queue) ─────────────────────────────────────────────────────────────

router.get('/api/emails', h(async (req, res) => {
  ok(res, await store.listEmails());
}));

router.get('/api/emails/:id', h(async (req, res) => {
  const email = await store.getEmail(req.params.id);
  if (!email) return fail(res, 404, 'Email not found.');
  ok(res, email);
}));

router.post('/api/emails/batch', h(async (req, res) => {
  const items = (req.body && req.body.items) || [];
  if (!Array.isArray(items) || items.length === 0) {
    return fail(res, 400, 'items[] with recipient/subject/message is required.');
  }
  const config = await resolveConfig(store.db);

  const created = [];
  for (const item of items) {
    const { recipient, subject, message, senderName } = item || {};
    if (!recipient || !String(recipient).trim()) return fail(res, 400, 'Recipient email is required for every item.');
    if (!EMAIL_REGEX.test(String(recipient).trim())) return fail(res, 400, `Invalid recipient: ${recipient}`);
    if (!subject || !String(subject).trim()) return fail(res, 400, 'Subject is required for every item.');
    if (!message || !String(message).trim()) return fail(res, 400, 'Message is required for every item.');
    created.push(
      (await store.enqueue(
        {
          recipient: String(recipient).trim(),
          subject: String(subject).trim(),
          message: String(message).trim(),
          senderName: senderName ? String(senderName).trim() : '',
        },
        config.retryLimit
      )).email
    );
  }
  ok(res, { ok: true, count: created.length, created });
}));

router.post('/api/emails', h(async (req, res) => {
  const { recipient, subject, message, senderName } = req.body || {};

  if (!recipient || !String(recipient).trim()) return fail(res, 400, 'Recipient email is required.');
  if (!EMAIL_REGEX.test(String(recipient).trim())) return fail(res, 400, 'Please enter a valid email address.');
  if (!subject || !String(subject).trim()) return fail(res, 400, 'Subject is required.');
  if (!message || !String(message).trim()) return fail(res, 400, 'Message is required.');

  const config = await resolveConfig(store.db);
  const { email, position } = await store.enqueue(
    {
      recipient: String(recipient).trim(),
      subject: String(subject).trim(),
      message: String(message).trim(),
      senderName: senderName ? String(senderName).trim() : '',
    },
    config.retryLimit
  );

  ok(res, { ok: true, email, position });
}));

router.delete('/api/emails/:id', h(async (req, res) => {
  const removed = await store.removeEmail(req.params.id);
  if (!removed) return fail(res, 404, 'Email not found.');
  ok(res, { ok: true, removed });
}));

// ── activity + stats ───────────────────────────────────────────────────────────

router.get('/api/activity', h(async (req, res) => {
  ok(res, await store.listActivity());
}));

router.get('/api/stats', h(async (req, res) => {
  ok(res, await store.getStats());
}));

// ── dispatcher lifecycle ───────────────────────────────────────────────────────

router.post('/api/dispatch/start', h(async (req, res) => {
  const result = await dispatch.startDispatch();
  if (!result.ok) return fail(res, 400, result.error);
  ok(res, result);
}));

router.post('/api/dispatch/continue', h(async (req, res) => {
  ok(res, await dispatch.continueDispatch());
}));

router.post('/api/dispatch/pause', h(async (req, res) => {
  ok(res, await dispatch.pauseDispatch());
}));

router.post('/api/dispatch/resume', h(async (req, res) => {
  ok(res, await dispatch.resumeDispatch());
}));

router.post('/api/dispatch/stop', h(async (req, res) => {
  ok(res, await dispatch.stopDispatch());
}));

router.post('/api/dispatch/reset', h(async (req, res) => {
  ok(res, await dispatch.resetQueue());
}));

module.exports = { router };