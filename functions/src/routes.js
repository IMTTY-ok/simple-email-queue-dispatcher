'use strict';

/**
 * HTTP API — the endpoints the dashboard calls.
 *
 * All routes keep the `/api` prefix so the Cloud Function base URL plus
 * `/api/...` matches the browser's `apiUrl()` path math.
 *
 * Every endpoint is authenticated. The client sends the Firebase ID token as
 * `Authorization: Bearer <token>`; the server verifies it and resolves the
 * caller's role from `users/{uid}`.
 *
 * Roles per endpoint group:
 *
 *   /api/users/*       admin (except "register", which any signed-in user calls)
 *   /api/config/*      admin    — holds the SMTP identity and the secrets flag
 *   /api/emails/*      operator — enqueue, remove, read the queue
 *   /api/dispatch/*    operator — the dispatcher lifecycle
 *   /api/activity      operator — scoped to the caller's own entries
 *   /api/stats         operator — aggregate counters
 *   /api/report        operator — scoped to the caller's own emails
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
const auth = require('./shared/auth.js');
const { resolveConfig, applyConfigAsync, publicConfig, syncPasswordFlag, ensureSeededConfig } = require('./shared/config.js');
const { verifyConnection, sendSingleMail, resetTransport, humanError } = require('./modules/module-2-send-simulator/simulator.js');
const queue = require('./modules/module-1-email-queue-creator/queue.js');
const dispatch = require('./modules/module-3-retry-logic/dispatch.js');
const logger = require('./modules/module-4-final-status-logger/logger.js');
const summary = require('./modules/module-5-summary-exporter/summary.js');

const router = express.Router();

const { ROLES } = auth;
const requireAuth = auth.requireAuth;
const requireRole = auth.requireRole;

/**
 * The scope of the caller's own records.
 * An administrator sees the whole installation; an operator only sees the
 * emails and activity they created.
 */
function scopeOf(req) {
  return req.user.role === ROLES.ADMIN ? null : req.user.uid;
}

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

// ── authentication ──────────────────────────────────────────────────────────────

/**
 * Create or fetch the caller's profile.
 * Every signed-in account calls this once after signing in; the server decides
 * the role (the first account becomes the administrator).
 */
router.post('/api/users/register', requireAuth(), h(async (req, res) => {
  const profile = await auth.ensureProfile(req.user.uid, req.user.email, req.user.name);
  ok(res, { ok: true, profile });
}));

/** Who am I? Used by the dashboard to decide which panels to show. */
router.get('/api/users/me', requireAuth(), h(async (req, res) => {
  const profile = await auth.ensureProfile(req.user.uid, req.user.email, req.user.name);
  ok(res, { ok: true, profile });
}));

/** The administrator's account list. */
router.get('/api/users', requireAuth(), requireRole(ROLES.ADMIN), h(async (req, res) => {
  ok(res, { ok: true, users: await auth.listProfiles() });
}));

/**
 * Change somebody's role. Administrator only — and an administrator cannot
 * demote themselves, which would lock the installation out of its own
 * configuration.
 */
router.post('/api/users/:uid/role', requireAuth(), requireRole(ROLES.ADMIN), h(async (req, res) => {
  const { uid } = req.params;
  const { role } = req.body || {};
  if (uid === req.user.uid && role !== ROLES.ADMIN) {
    return fail(res, 400, 'You cannot remove your own administrator role.');
  }
  const result = await auth.setRole(uid, role);
  if (!result.ok) return fail(res, 400, result.error);
  ok(res, { ok: true, ...result });
}));

// ── Module 2 — Send Simulator: configuration (administrator only) ──────────────

router.get('/api/config', requireAuth(), requireRole(ROLES.ADMIN), h(async (req, res) => {
  const config = await resolveConfig(store.db);
  await ensureSeededConfig(store.db, config);
  await syncPasswordFlag(store.db, config);
  ok(res, publicConfig(config));
}));

router.post('/api/config', requireAuth(), requireRole(ROLES.ADMIN), h(async (req, res) => {
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

router.post('/api/config/test', requireAuth(), requireRole(ROLES.ADMIN), h(async (req, res) => {
  const config = await resolveConfig(store.db);
  ok(res, await verifyConnection(config));
}));

router.post('/api/config/test-send', requireAuth(), requireRole(ROLES.ADMIN), h(async (req, res) => {
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

router.get('/api/emails', requireAuth(), requireRole(ROLES.ADMIN, ROLES.OPERATOR), h(async (req, res) => {
  ok(res, await queue.listEmails(scopeOf(req)));
}));

router.get('/api/emails/:id', requireAuth(), requireRole(ROLES.ADMIN, ROLES.OPERATOR), h(async (req, res) => {
  const email = await queue.getEmail(req.params.id);
  if (!email) return fail(res, 404, 'Email not found.');
  const scope = scopeOf(req);
  if (scope && email.createdBy && email.createdBy !== scope) {
    return fail(res, 403, 'That email belongs to another account.');
  }
  ok(res, email);
}));

router.post('/api/emails/batch', requireAuth(), requireRole(ROLES.ADMIN, ROLES.OPERATOR), h(async (req, res) => {
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
    const { email } = await queue.enqueue(validation.value, config.retryLimit, req.user.uid);
    created.push(email);
    await logger.pushActivity({
      emailId: email.id,
      message: `${email.id} queued for delivery (position ${created.length})`,
      type: 'info',
      createdBy: email.createdBy,
    });
  }
  ok(res, { ok: true, count: created.length, created });
}));

router.post('/api/emails', requireAuth(), requireRole(ROLES.ADMIN, ROLES.OPERATOR), h(async (req, res) => {
  const validation = queue.validateEmail(req.body || {});
  if (!validation.ok) return fail(res, 400, validation.error);

  const config = await resolveConfig(store.db);
  const { email, position } = await queue.enqueue(validation.value, config.retryLimit, req.user.uid);
  await logger.pushActivity({
    emailId: email.id,
    message: `${email.id} queued for delivery (position ${position})`,
    type: 'info',
    createdBy: email.createdBy,
  });

  ok(res, { ok: true, email, position });
}));

router.delete('/api/emails/:id', requireAuth(), requireRole(ROLES.ADMIN, ROLES.OPERATOR), h(async (req, res) => {
  const existing = await queue.getEmail(req.params.id);
  if (!existing) return fail(res, 404, 'Email not found.');
  const scope = scopeOf(req);
  if (scope && existing.createdBy && existing.createdBy !== scope) {
    return fail(res, 403, 'That email belongs to another account.');
  }
  const removed = await queue.removeEmail(req.params.id);
  await logger.pushActivity({
    emailId: removed.id,
    message: `${removed.id} removed from queue`,
    type: 'warning',
    createdBy: removed.createdBy,
  });
  ok(res, { ok: true, removed });
}));

// ── Module 4 — Final Status Logger ─────────────────────────────────────────────

router.get('/api/activity', requireAuth(), requireRole(ROLES.ADMIN, ROLES.OPERATOR), h(async (req, res) => {
  ok(res, await logger.listActivity(scopeOf(req)));
}));

// ── Module 5 — Summary Exporter ─────────────────────────────────────────────────

router.get('/api/stats', requireAuth(), requireRole(ROLES.ADMIN, ROLES.OPERATOR), h(async (req, res) => {
  ok(res, await summary.getStats());
}));

router.get('/api/report', requireAuth(), requireRole(ROLES.ADMIN, ROLES.OPERATOR), h(async (req, res) => {
  ok(res, await summary.buildReport(scopeOf(req)));
}));

// ── Module 3 — Retry Logic Engine: dispatcher lifecycle ─────────────────────────

router.post('/api/dispatch/start', requireAuth(), requireRole(ROLES.ADMIN, ROLES.OPERATOR), h(async (req, res) => {
  const result = await dispatch.startDispatch();
  if (!result.ok) return fail(res, 400, result.error);
  ok(res, result);
}));

router.post('/api/dispatch/continue', requireAuth(), requireRole(ROLES.ADMIN, ROLES.OPERATOR), h(async (req, res) => {
  ok(res, await dispatch.continueDispatch());
}));

router.post('/api/dispatch/pause', requireAuth(), requireRole(ROLES.ADMIN, ROLES.OPERATOR), h(async (req, res) => {
  ok(res, await dispatch.pauseDispatch());
}));

router.post('/api/dispatch/resume', requireAuth(), requireRole(ROLES.ADMIN, ROLES.OPERATOR), h(async (req, res) => {
  ok(res, await dispatch.resumeDispatch());
}));

router.post('/api/dispatch/stop', requireAuth(), requireRole(ROLES.ADMIN, ROLES.OPERATOR), h(async (req, res) => {
  ok(res, await dispatch.stopDispatch());
}));

router.post('/api/dispatch/reset', requireAuth(), requireRole(ROLES.ADMIN, ROLES.OPERATOR), h(async (req, res) => {
  ok(res, await dispatch.resetQueue());
}));

module.exports = { router };
