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
const functions = require('firebase-functions/v1');
const { router } = require('./src/routes.js');

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

const allowedOrigins = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const originList = allowedOrigins.length > 0 ? allowedOrigins : DEFAULT_ORIGINS;

/** Methods that change state. They must come from an allowed browser origin. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Simple per-IP token bucket: 60 mutating requests per minute. */
const RATE_LIMIT = { windowMs: 60_000, max: 60 };
const rateBuckets = new Map();

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

app.use(cors({
  origin(origin, callback) {
    // allow non-browser clients (curl, health checks) that send no Origin
    if (!origin || originList.includes(origin)) {
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
  if (!origin || !originList.includes(origin)) {
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
