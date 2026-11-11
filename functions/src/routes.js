'use strict';

/**
 * HTTP API — the endpoints the dashboard calls.
 *
 * All routes keep the `/api` prefix so the Cloud Function base URL plus
 * `/api/...` matches the browser's `apiUrl()` path math.
 *
 * Each group of endpoints is owned by exactly one module:
 *
 *   /api/emails/*     → Module 1  Email Queue Creator
 *   /api/config/*     → Module 2  Send Simulator (transport configuration)
 *   /api/dispatch/*   → Module 3  Retry Logic Engine
 *   /api/activity     → Module 4  Final Status Logger
 *   /api/stats        → Module 5  Summary Exporter
 */

const express = require('express');
const { ok, fail, h } = require('./shared/http.js');
const store = require('./shared/store.js');
const { resolveConfig, applyConfigAsync, publicConfig, syncPasswordFlag, ensureSeededConfig } = require('./shared/config.js');
const { verifyConnection, sendSingleMail, resetTransport, humanError } = require('./modules/module-2-send-simulator/simulator.js');
const queue = require('./modules/module-1-email-queue-creator/queue.js');
const dispatch = require('./modules/module-3-retry-logic/dispatch.js');
const logger = require('./modules/module-4-final-status-logger/logger.js');
const summary = require('./modules/module-5-summary-exporter/summary.js');

const router = express.Router();

// ── health ──────────────────────────────────────────────────────────────────────

router.get('/api/health', h(async (req, res) => {
  const config = await resolveConfig(store.db);
  ok(res, {
    ok: true,
    service: 'email-queue-dispatcher-functions',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    dispatcher: await store.getDispatcherState(),
    smtpConfigured: publicConfig(config).smtpConfigured,
    stats: await summary.getStats(),
  });
}));

// ── Module 2 — Send Simulator: configuration ───────────────────────────────────

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
  if (!to || !queue.EMAIL_REGEX.test(String(to))) {
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

// ── Module 1 — Email Queue Creator ──────────────────────────────────────────────

router.get('/api/emails', h(async (req, res) => {
  ok(res, await queue.listEmails());
}));

router.get('/api/emails/:id', h(async (req, res) => {
  const email = await queue.getEmail(req.params.id);
  if (!email) return fail(res, 404, 'Email not found.');
  ok(res, email);
}));

router.post('/api/emails/batch', h(async (req, res) => {
  const items = (req.body && req.body.items) || [];
  if (!Array.isArray(items) || items.length === 0) {
    return fail(res, 400, 'items[] with recipient/subject/message is required.');
  }
  if (items.length > 100) {
    return fail(res, 400, 'A batch may contain at most 100 emails.');
  }
  const config = await resolveConfig(store.db);

  const created = [];
  for (const item of items) {
    const validation = queue.validateEmail(item);
    if (!validation.ok) return fail(res, 400, validation.error);
    const { email } = await queue.enqueue(validation.value, config.retryLimit);
    created.push(email);
    await logger.pushActivity({
      emailId: email.id,
      message: `${email.id} queued for delivery (position ${created.length})`,
      type: 'info',
    });
  }
  ok(res, { ok: true, count: created.length, created });
}));

router.post('/api/emails', h(async (req, res) => {
  const validation = queue.validateEmail(req.body || {});
  if (!validation.ok) return fail(res, 400, validation.error);

  const config = await resolveConfig(store.db);
  const { email, position } = await queue.enqueue(validation.value, config.retryLimit);
  await logger.pushActivity({
    emailId: email.id,
    message: `${email.id} queued for delivery (position ${position})`,
    type: 'info',
  });

  ok(res, { ok: true, email, position });
}));

router.delete('/api/emails/:id', h(async (req, res) => {
  const removed = await queue.removeEmail(req.params.id);
  if (!removed) return fail(res, 404, 'Email not found.');
  await logger.pushActivity({ emailId: removed.id, message: `${removed.id} removed from queue`, type: 'warning' });
  ok(res, { ok: true, removed });
}));

// ── Module 4 — Final Status Logger ─────────────────────────────────────────────

router.get('/api/activity', h(async (req, res) => {
  ok(res, await logger.listActivity());
}));

// ── Module 5 — Summary Exporter ─────────────────────────────────────────────────

router.get('/api/stats', h(async (req, res) => {
  ok(res, await summary.getStats());
}));

router.get('/api/report', h(async (req, res) => {
  ok(res, await summary.buildReport());
}));

// ── Module 3 — Retry Logic Engine: dispatcher lifecycle ─────────────────────────

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
