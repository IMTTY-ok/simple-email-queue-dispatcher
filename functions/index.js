'use strict';

/**
 * Firebase Cloud Functions entry point.
 *
 * One HTTPS function (`backend`) hosts the whole Express API so the frontend's
 * `apiUrl('/api/...')` calls resolve to:
 *   {FUNCTIONS_BASE}/backend/api/...
 *
 * Prod base:  https://us-central1-<project>.cloudfunctions.net/backend
 * Emulator:   http://127.0.0.1:5001/<project>/us-central1/backend
 */

const express = require('express');
const cors = require('cors');
const crypto = require('node:crypto');
const functions = require('firebase-functions/v1');
const { router } = require('./src/routes.js');
const auth = require('./src/shared/auth.js');
const schedulingEngine = require('./src/modules/module-6-scheduled-delivery/engine.js');
const schedulingTasks = require('./src/modules/module-6-scheduled-delivery/tasks.js');

/**
 * Browser origins allowed to call the API.
 *
 * Override in production with `ALLOWED_ORIGIN` (comma-separated) — the
 * value below is only the fallback used when that variable is not set.
 */
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
];

/**
 * Parse the configured origins.
 *
 * - Trim whitespace around each entry (a stray space would otherwise make an
 *   otherwise valid origin fail an exact comparison).
 * - Drop empties so a trailing comma or a blank `ALLOWED_ORIGIN=` cannot poison
 *   the list.
 * - Validate each entry as an absolute origin (scheme + host [+ port]) so a
 *   malformed value can never silently match or break the comparison.
 */
function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((origin) => {
      try {
        const url = new URL(origin);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    });
}

const configuredOrigins = parseOrigins(process.env.ALLOWED_ORIGIN);

/**
 * The effective allowlist.
 *
 * The built-in local development origins are *always* present, even when
 * `ALLOWED_ORIGIN` is set. A stale or partial environment value (for example
 * one left over from an older setup that only listed `http://localhost:5173`)
 * can therefore never silently remove the defaults that local development
 * depends on. Production origins supplied through `ALLOWED_ORIGIN` are added
 * on top, never replacing the defaults.
 *
 * Comparison is performed with exact string equality (see `isAllowedOrigin`),
 * never with substring matching.
 */
const originList = Array.from(new Set([...DEFAULT_ORIGINS, ...configuredOrigins]));

/** Methods that change state. They must come from an allowed browser origin. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Simple per-IP token bucket for the state-changing endpoints.
 *
 * The dashboard's dispatch pump alone calls `/api/dispatch/continue` roughly
 * every two seconds, so the limit has to leave room for that on top of a
 * person clicking around. It is configurable so a busy deployment can raise
 * it without a code change.
 */
const RATE_LIMIT = {
  windowMs: clampInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000, 1000, 3_600_000),
  max: clampInt(process.env.RATE_LIMIT_MAX, 120, 10, 10_000),
};
const rateBuckets = new Map();

/** Parse an integer environment variable, falling back when it is unusable. */
function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function rateLimited(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start >= RATE_LIMIT.windowMs) {
    rateBuckets.set(ip, { start: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT.max;
}

// Drop stale buckets so the map cannot grow without bound.
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT.windowMs;
  for (const [ip, bucket] of rateBuckets) {
    if (bucket.start < cutoff) rateBuckets.delete(ip);
  }
}, RATE_LIMIT.windowMs).unref();

const app = express();

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

/** Exact-origin check: protocol + host + port, no substring matching. */
function isAllowedOrigin(origin) {
  if (!origin) return false;
  // Normalise via URL so trivial differences (trailing slash, casing of the
  // scheme) cannot bypass or break the comparison. The host/port comparison
  // stays exact.
  try {
    const url = new URL(origin);
    const normalised = `${url.protocol}//${url.host}`;
    return originList.includes(normalised) || originList.includes(origin.trim());
  } catch {
    return originList.includes(String(origin).trim());
  }
}

app.use(cors({
  origin(origin, callback) {
    // allow non-browser clients (curl, health checks) that send no Origin
    if (!origin || isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
}));

/**
 * Guard the state-changing endpoints.
 *
 * Browsers always send an `Origin` header on POST/PUT/PATCH/DELETE, so
 * requiring a known origin here does not affect the dashboard — it stops a
 * third-party website from driving the dispatcher through a visitor's
 * browser, and it stops plain `curl` calls from silently reconfiguring the
 * SMTP settings or triggering real deliveries.
 */
app.use((req, res, next) => {
  if (!MUTATING_METHODS.has(req.method)) return next();

  const origin = req.get('Origin');
  if (!origin || !isAllowedOrigin(origin)) {
    return res.status(403).json({
      ok: false,
      error: 'Origin not allowed. Set ALLOWED_ORIGIN on the function to include this origin.',
    });
  }

  if (rateLimited(req.ip || 'unknown')) {
    return res.status(429).json({ ok: false, error: 'Too many requests — slow down.' });
  }

  return next();
});

app.use(express.json({ limit: '100kb' }));
app.use(router);

app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Not found: ${req.method} ${req.path}` });
});

// gen-1 HTTPS function; a generous timeout so a single dispatch pass can drain a queue
exports.backend = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .https.onRequest(app);

// ─────────────────────────────────────────────────────────────────────────────
// Module 6 — Scheduled Delivery
// ─────────────────────────────────────────────────────────────────────────────
//
// `scheduledDispatch` is the target of the Cloud Tasks queue. Google calls it
// at the exact moment a scheduled email becomes due — no browser, no
// dashboard, no laptop involved.
//
// The endpoint is public infrastructure, so every payload carries an
// HMAC-SHA256 signature over `{emailId}:{scheduleVersion}:{taskId}` produced
// with `SCHEDULE_TASK_SECRET`. A payload without a valid signature is
// refused, and the secret is never stored in Firestore or returned to the
// browser.

/** Read the task payload — the runtime parses JSON, but be forgiving. */
function readPayload(req) {
  const body = req.body;
  if (!body) return null;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString('utf8'));
    } catch {
      return null;
    }
  }
  return typeof body === 'object' ? body : null;
}

exports.scheduledDispatch = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .https.onRequest(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed.' });
      return;
    }

    const payload = readPayload(req);
    if (!schedulingTasks.verifySignature(payload)) {
      res.status(403).json({ ok: false, error: 'Invalid task signature.' });
      return;
    }

    try {
      const result = await schedulingEngine.dispatchDueEmail({
        emailId: payload.emailId,
        scheduleVersion: Number(payload.scheduleVersion),
      });

      // A short, content-free record of what the task decided.
      console.log(
        `[scheduling] task ${payload.emailId} v${payload.scheduleVersion}: ${
          result.dispatched ? 'dispatched' : `skipped (${result.reason})`
        }`
      );

      // "Not due yet" must be retried, not swallowed: Cloud Tasks repeats the
      // task until the scheduled moment has passed.
      if (!result.dispatched && result.reason === 'not-due') {
        res.status(503).json({ ok: false, error: 'Not due yet.', reason: result.reason });
        return;
      }

      res.status(200).json({ ok: true, dispatched: result.dispatched, reason: result.reason });
    } catch (err) {
      console.error('[scheduling] dispatch failed:', err);
      res.status(500).json({ ok: false, error: 'The scheduled delivery could not be processed.' });
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// The scheduler sweep.
//
// The Cloud Tasks queue is the primary trigger. This endpoint is the safety
// net: it asks the server to look for scheduled emails whose moment has come
// and to deliver them. It is what covers schedules further out than the
// 30-day Cloud Tasks window, and it repairs a task that was lost.
//
// It accepts either
//   • a normal Firebase ID token (the dashboard's "Run due now" button), or
//   • the shared `SCHEDULE_SWEEP_TOKEN` (a Cloud Scheduler job).

exports.scheduledSweep = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .https.onRequest(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed.' });
      return;
    }

    const expected = String(process.env.SCHEDULE_SWEEP_TOKEN || '').trim();
    const provided = String(req.get('x-internal-sweep-token') || '').trim();

    let authorised = false;
    if (expected && provided && expected.length >= 16 && provided.length === expected.length) {
      authorised = crypto.timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
    }

    if (!authorised) {
      const result = await auth.authenticate(req);
      if (!result.ok) {
        res.status(result.status).json({ ok: false, error: result.error });
        return;
      }
      if (!result.role) {
        res.status(403).json({ ok: false, error: 'No profile yet — finish signing in first.' });
        return;
      }
    }

    try {
      const outcome = await schedulingEngine.sweepDueScheduledEmails();
      res.status(200).json({ ok: true, ...outcome });
    } catch (err) {
      console.error('[scheduling] sweep failed:', err);
      res.status(500).json({ ok: false, error: 'The scheduler sweep could not be completed.' });
    }
  });
