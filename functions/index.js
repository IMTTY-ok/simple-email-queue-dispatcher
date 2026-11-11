'use strict';

/**
 * Firebase Cloud Functions entry point.
 *
 * One HTTPS function (`backend`) hosts the whole Express API so the frontend's
 * existing apiUrl('/api/...') calls resolve to:
 *   {FUNCTIONS_BASE}/backend/api/...
 *
 * Prod base:  https://us-central1-email-dispatcher-43118.cloudfunctions.net/backend
 * Emulator:   http://127.0.0.1:5001/email-dispatcher-43118/us-central1/backend
 */

const express = require('express');
const cors = require('cors');
const functions = require('firebase-functions/v1');
const { router } = require('./src/routes.js');

const DEFAULT_ORIGINS = [
  'https://my-second-peach.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const allowedOrigins = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const originList = allowedOrigins.length > 0 ? allowedOrigins : DEFAULT_ORIGINS;

const app = express();

app.use(cors({
  origin(origin, callback) {
    // allow non-browser clients (curl, health checks) that send no Origin
    if (!origin || originList.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
}));
app.use(express.json({ limit: '100kb' }));
app.use(router);

app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Not found: ${req.method} ${req.path}` });
});

// gen-1 HTTPS function; a generous timeout so a single dispatch pass can drain a queue
exports.backend = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .https.onRequest(app);