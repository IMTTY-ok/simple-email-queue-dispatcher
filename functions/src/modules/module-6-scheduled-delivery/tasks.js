'use strict';

/**
 * Module 6 — Scheduled Delivery: the Cloud Tasks client.
 * =====================================================
 *
 * The scheduled delivery trigger is **Google Cloud Tasks**: a managed queue
 * that calls the dispatch endpoint at exactly the requested moment, no matter
 * whether the dashboard, the browser or the laptop is switched on.
 *
 * Why the REST API instead of `@google-cloud/tasks`?
 * ----------------------------------------------------
 * The Cloud Tasks REST API is a thin JSON-over-HTTPS call, and this project
 * already has everything needed to authenticate it (`firebase-admin`'s
 * application-default credential). Adding the client library would pull in a
 * large dependency tree for one `POST`, so the client is implemented here
 * directly — with no new dependency.
 *
 * The same REST shape is served by the **Firebase emulator**, so the whole
 * scheduling path can be exercised locally:
 *
 *   emulator : POST http://<CLOUD_TASKS_EMULATOR_HOST>/projects/{p}/locations/{l}/queues/{q}/tasks
 *   cloud    : POST https://cloudtasks.googleapis.com/v2/projects/{p}/locations/{l}/queues/{q}/tasks
 *
 * Configuration (environment variables)
 * -------------------------------------
 *   GCLOUD_PROJECT            project id            (set by the runtime)
 *   CLOUD_TASKS_LOCATION      region of the queue   (default `us-central1`)
 *   CLOUD_TASKS_QUEUE         queue name            (default `email-scheduler`)
 *   SCHEDULE_TASK_SECRET      HMAC secret           (required — see below)
 *   SCHEDULED_DISPATCH_URL    full URL of the dispatch function (optional)
 *
 * Security
 * --------
 * The dispatch endpoint is public infrastructure, so every task payload is
 * signed with HMAC-SHA256 over `{emailId}:{scheduleVersion}:{taskId}` using
 * `SCHEDULE_TASK_SECRET`. The endpoint recomputes the signature and compares
 * it in constant time. Without a secret nothing is ever enqueued — the
 * feature fails closed rather than opening an unprotected endpoint.
 */

const crypto = require('node:crypto');
const admin = require('firebase-admin');

const { MAX_TASK_DELAY_MS } = require('./clock.js');

/** The HTTP function that receives a due task. */
const DISPATCH_FUNCTION = 'scheduledDispatch';

/** The region the dispatch function lives in. */
const REGION = process.env.CLOUD_TASKS_LOCATION || 'us-central1';

/** The Cloud Tasks queue that carries the scheduled deliveries. */
const QUEUE = process.env.CLOUD_TASKS_QUEUE || 'email-scheduler';

/** The project id — the runtime always provides it. */
const PROJECT_ID =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  '';

/** The shared secret used to sign and verify task payloads. */
const SECRET = String(process.env.SCHEDULE_TASK_SECRET || '').trim();

/** Set by the Firebase emulator when the Cloud Tasks emulator is running. */
const EMULATOR_HOST = String(process.env.CLOUD_TASKS_EMULATOR_HOST || '').trim();

/** The shortest secret that is considered strong enough to sign payloads. */
const MIN_SECRET_LENGTH = 16;

/**
 * Why the task queue cannot be used, or `null` when it is ready.
 * Surfaced through `/api/status` so the dashboard can tell the operator
 * that scheduled delivery currently relies on the periodic sweep.
 */
function unavailableReason() {
  if (!PROJECT_ID) return 'GCLOUD_PROJECT is not set.';
  if (!SECRET) return 'SCHEDULE_TASK_SECRET is not set.';
  if (SECRET.length < MIN_SECRET_LENGTH) {
    return `SCHEDULE_TASK_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`;
  }
  return null;
}

/** Is the Cloud Tasks path usable? */
function isConfigured() {
  return unavailableReason() === null;
}

/**
 * The base URL of the Cloud Tasks API.
 * The emulator serves the same routes without the `/v2` prefix.
 */
function apiBase() {
  if (EMULATOR_HOST) return `http://${EMULATOR_HOST}`;
  return 'https://cloudtasks.googleapis.com/v2';
}

/**
 * The URL the queue calls when a task becomes due.
 *
 * The caller may pass the address explicitly — it is derived from the
 * request that created the schedule, so the queue always calls *this* very
 * function, whatever port or host it happens to run on.
 */
function targetUrl(explicitUrl) {
  const override = String(explicitUrl || process.env.SCHEDULED_DISPATCH_URL || '').trim();
  if (override) return override;
  if (EMULATOR_HOST) {
    // The Functions emulator serves the function under /<project>/<region>/<name>.
    const port = process.env.FUNCTIONS_EMULATOR_PORT || '5001';
    return `http://127.0.0.1:${port}/${PROJECT_ID}/${REGION}/${DISPATCH_FUNCTION}`;
  }
  return `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${DISPATCH_FUNCTION}`;
}

/** The queue resource name, e.g. `projects/p/locations/l/queues/q`. */
function queueName() {
  return `projects/${PROJECT_ID}/locations/${REGION}/queues/${QUEUE}`;
}

/**
 * An OAuth2 access token for the Cloud Tasks API.
 *
 * In production this comes from the runtime's service account (the default
 * application credential). In the emulator no token is needed — the emulator
 * does not authenticate its own requests.
 */
async function accessToken() {
  if (EMULATOR_HOST) return null;
  try {
    const credential = admin.credential.applicationDefault();
    const token = await credential.getAccessToken();
    return token && token.access_token ? token.access_token : null;
  } catch (err) {
    console.error('[scheduling] could not obtain a Cloud Tasks access token:', err && err.message);
    return null;
  }
}

/**
 * Perform a JSON request against the Cloud Tasks API.
 */
async function request(method, path, body, query) {
  const url = new URL(`${apiBase()}${path}`);
  for (const [key, value] of Object.entries(query || {})) {
    url.searchParams.set(key, value);
  }

  const headers = { 'Content-Type': 'application/json' };
  const token = await accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const error = new Error(
      (data && (data.error?.message || data.message)) || `Cloud Tasks responded ${res.status}`
    );
    error.status = res.status;
    error.details = data;
    throw error;
  }
  return data;
}

/**
 * Create the task queue when it does not exist yet.
 *
 * The queue normally has to be provisioned once with
 * `gcloud tasks queues create` — but the same call also works, and is
 * idempotent, so the function can provision it on demand.
 *
 * The retry configuration is written in the shape each environment expects:
 * the Cloud Tasks API uses protobuf durations (`minBackoff: "10s"`), while
 * the Firebase emulator's Cloud Tasks emulator expects plain seconds
 * (`minBackoffSeconds: 10`). The emulator also dispatches a task
 * immediately instead of waiting for its `scheduleTime`, so it retries far
 * more often — the dispatch handler answers "not due yet" with a 503 until
 * the scheduled moment has passed.
 */
async function ensureQueue() {
  const body = EMULATOR_HOST
    ? {
        retryConfig: {
          maxAttempts: 60,
          maxRetrySeconds: 3600,
          maxBackoffSeconds: 60,
          maxDoublings: 3,
          minBackoffSeconds: 1,
        },
        rateLimits: {
          maxConcurrentDispatches: 20,
          maxDispatchesPerSecond: 10,
        },
      }
    : {
        retryConfig: {
          maxAttempts: 5,
          minBackoff: '10s',
          maxBackoff: '300s',
          maxDoublings: 5,
        },
        rateLimits: {
          maxConcurrentDispatches: 20,
          maxDispatchesPerSecond: 10,
        },
      };

  try {
    if (EMULATOR_HOST) {
      await request('POST', `/projects/${PROJECT_ID}/locations/${REGION}/queues/${QUEUE}`, body);
    } else {
      await request('POST', `/projects/${PROJECT_ID}/locations/${REGION}/queues`, {
        ...body,
        name: queueName(),
      }, { queueId: QUEUE });
    }
    return true;
  } catch (err) {
    // ALREADY_EXISTS is the normal case after the first run.
    const message = String((err && err.details && err.details.error?.status) || '');
    if (err.status === 409 || message.includes('ALREADY_EXISTS')) return true;
    throw err;
  }
}

/**
 * The signature that proves a task payload came from this server.
 *
 * @param {string} emailId
 * @param {number} scheduleVersion
 * @param {string} taskId
 */
function sign(emailId, scheduleVersion, taskId) {
  return crypto
    .createHmac('sha256', SECRET)
    .update(`${emailId}:${scheduleVersion}:${taskId}`)
    .digest('hex');
}

/**
 * Verify a task payload's signature in constant time.
 *
 * @returns {boolean}
 */
function verifySignature(payload) {
  if (!isConfigured()) return false;
  if (!payload || typeof payload !== 'object') return false;
  const { emailId, scheduleVersion, taskId, signature } = payload;
  if (typeof emailId !== 'string' || !emailId) return false;
  if (typeof taskId !== 'string' || !taskId) return false;
  if (typeof signature !== 'string' || !signature) return false;

  const expected = sign(emailId, Number(scheduleVersion), taskId);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * The id of the task that carries one revision of a schedule.
 *
 * It contains the email id and the schedule version, so a task of a
 * superseded schedule is recognisable — and it carries a short random
 * suffix, so two tasks for the same revision can never collide on the
 * queue's name uniqueness.
 *
 * @param {string} emailId
 * @param {number} scheduleVersion
 */
function taskIdFor(emailId, scheduleVersion) {
  const suffix = crypto.randomBytes(4).toString('hex');
  return `${emailId}-v${scheduleVersion}-${suffix}`;
}

/**
 * Work out the address of this very function from the request that is
 * creating the schedule.
 *
 * In the emulator the function is reachable under
 * `http://<host>/<project>/<region>/<name>`; the `Host` header of the
 * incoming request carries the emulator's port, so the task always calls
 * the very instance that created it.
 *
 * In production the standard Cloud Functions address is used, and
 * `SCHEDULED_DISPATCH_URL` overrides both.
 *
 * @param {object} req the Express request
 * @returns {string|null}
 */
function dispatchUrlFromRequest(req) {
  const override = String(process.env.SCHEDULED_DISPATCH_URL || '').trim();
  if (override) return override;

  const host = req && typeof req.get === 'function' ? String(req.get('host') || '') : '';
  if (process.env.FUNCTIONS_EMULATOR === 'true' && host) {
    return `http://${host}/${PROJECT_ID}/${REGION}/${DISPATCH_FUNCTION}`;
  }
  return null;
}

/**
 * Enqueue a delivery task.
 *
 * @param {object} params
 * @param {string} params.emailId
 * @param {number} params.scheduleVersion
 * @param {Date} params.scheduledAt the UTC instant the email becomes due
 * @param {string} [params.dispatchUrl] the address of the dispatch function
 * @returns {Promise<{ok:boolean, taskId?:string, taskName?:string, error?:string, beyondTaskWindow?:boolean}>}
 */
async function createTask({ emailId, scheduleVersion, scheduledAt, dispatchUrl }) {
  if (!isConfigured()) {
    return { ok: false, error: unavailableReason() };
  }

  const at = scheduledAt instanceof Date ? scheduledAt.getTime() : Number(scheduledAt);
  if (!Number.isFinite(at)) {
    return { ok: false, error: 'The scheduled time could not be read.' };
  }

  // Cloud Tasks refuses a schedule further out than 30 days. Such a schedule
  // stays valid — it is simply carried by the periodic sweep instead.
  if (at - Date.now() > MAX_TASK_DELAY_MS) {
    return { ok: true, beyondTaskWindow: true, taskId: null, taskName: null };
  }

  const taskId = taskIdFor(emailId, scheduleVersion);
  const payload = {
    emailId,
    scheduleVersion: Number(scheduleVersion),
    taskId,
    signature: sign(emailId, Number(scheduleVersion), taskId),
  };

  const body = {
    task: {
      name: `${queueName()}/tasks/${taskId}`,
      scheduleTime: new Date(at).toISOString(),
      // A protobuf Duration in its JSON form: "600s".
      dispatchDeadline: '600s',
      retryConfig: {
        maxAttempts: 5,
        minBackoff: '10s',
        maxBackoff: '300s',
        maxDoublings: 5,
      },
      httpRequest: {
        url: targetUrl(dispatchUrl),
        httpMethod: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'),
      },
    },
  };

  try {
    const data = await request('POST', `/projects/${PROJECT_ID}/locations/${REGION}/queues/${QUEUE}/tasks`, body);
    return { ok: true, taskId, taskName: data?.task?.name || `${queueName()}/tasks/${taskId}` };
  } catch (err) {
    if (err.status === 409) {
      // A task with this id is already queued — that is exactly what we want.
      return { ok: true, taskId, taskName: `${queueName()}/tasks/${taskId}` };
    }
    // The queue may not exist yet. Create it once and try again.
    if (isMissingQueue(err)) {
      try {
        await ensureQueue();
        const data = await request('POST', `/projects/${PROJECT_ID}/locations/${REGION}/queues/${QUEUE}/tasks`, body);
        return { ok: true, taskId, taskName: data?.task?.name || `${queueName()}/tasks/${taskId}` };
      } catch (retryErr) {
        if (retryErr.status === 409) {
          return { ok: true, taskId, taskName: `${queueName()}/tasks/${taskId}` };
        }
        return { ok: false, error: retryErr.message || 'Could not queue the scheduled delivery.' };
      }
    }
    return { ok: false, error: err.message || 'Could not queue the scheduled delivery.' };
  }
}

/**
 * Did the API refuse because the queue does not exist yet?
 */
function isMissingQueue(err) {
  if (err.status === 404) return true;
  const message = String((err && err.details && err.details.error?.message) || err?.message || '');
  return /non-existent queue|does not exist|not found/i.test(message);
}

/**
 * Remove a queued task.
 *
 * Best effort: a task that already fired cannot be deleted, and a task that
 * no longer exists is not an error. The *version* check in the dispatch
 * handler is what actually makes a stale task harmless.
 *
 * @param {string} taskId
 */
async function deleteTask(taskId) {
  if (!isConfigured() || !taskId) return { ok: false, skipped: true };
  try {
    await request('DELETE', `/projects/${PROJECT_ID}/locations/${REGION}/queues/${QUEUE}/tasks/${taskId}`);
    return { ok: true };
  } catch (err) {
    if (err.status === 404) return { ok: true, missing: true };
    return { ok: false, error: err.message };
  }
}

/**
 * A short description of the scheduler configuration, for the dashboard.
 */
function describe() {
  const reason = unavailableReason();
  return {
    configured: reason === null,
    reason,
    provider: 'google-cloud-tasks',
    queue: QUEUE,
    location: REGION,
    project: PROJECT_ID,
    emulator: Boolean(EMULATOR_HOST),
    maxTaskDelayDays: Math.round(MAX_TASK_DELAY_MS / (24 * 60 * 60 * 1000)),
  };
}

module.exports = {
  DISPATCH_FUNCTION,
  REGION,
  QUEUE,
  PROJECT_ID,
  MIN_SECRET_LENGTH,
  unavailableReason,
  isConfigured,
  apiBase,
  targetUrl,
  queueName,
  ensureQueue,
  sign,
  verifySignature,
  taskIdFor,
  dispatchUrlFromRequest,
  createTask,
  deleteTask,
  describe,
};
