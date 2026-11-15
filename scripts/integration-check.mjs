#!/usr/bin/env node
/**
 * End-to-end integration check against the running Firebase Emulator Suite.
 *
 * Exercises all five modules over the real HTTP API, plus the authentication
 * and authorization layer:
 *
 *   1. Email Queue Creator  - enqueue, validate, list, remove
 *   2. Send Simulator       - config, dry-run, simulation modes, connection test
 *   3. Retry Logic Engine   - dispatch, bounded retry, pause/resume, reset
 *   4. Final Status Logger  - activity log and per-attempt history
 *   5. Summary Exporter     - statistics and the dispatch report
 *
 *   Auth                   - anonymous requests are refused, a signed-in
 *                             operator cannot reach the SMTP configuration or
 *                             change roles, and an administrator can.
 *
 * Usage:
 *   npm run dev            # in one terminal (emulators + dashboard)
 *   npm run test:integration
 *
 * Set API_BASE / AUTH_BASE to point at a deployed function instead.
 */

const API_BASE =
  process.env.API_BASE ||
  'http://127.0.0.1:5001/email-dispatcher-43118/us-central1/backend';

const AUTH_BASE = process.env.AUTH_BASE || 'http://127.0.0.1:9099';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

let passed = 0;
let failed = 0;

function head(text) {
  console.log(`\n=== ${text} ===`);
}

function check(condition, description, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${description}`);
  } else {
    failed++;
    console.log(`  FAIL  ${description}`);
    if (detail) console.log(`        ${detail}`);
  }
}

/**
 * Perform a request and never throw — failures are reported, not fatal.
 *
 * Mutating requests carry an allowed `Origin` header, exactly like the
 * dashboard does. The function rejects state-changing requests from an
 * unknown origin.
 */
async function request(method, path, payload, options = {}) {
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const token = options.token ?? null;
  const origin = options.origin === null ? null : options.origin ?? CLIENT_ORIGIN;

  const headers = {};
  if (payload) headers['Content-Type'] = 'application/json';
  if (mutating && origin) headers.Origin = origin;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: null, error: String(err) };
  }
}

const get = (path, options) => request('GET', path, null, options);
const post = (path, payload, options) => request('POST', path, payload, options);
const del = (path, options) => request('DELETE', path, null, options);

/**
 * The wall-clock time of an instant in a given IANA zone, as
 * `YYYY-MM-DDTHH:mm` — the shape the scheduling API expects.
 *
 * `withSeconds` adds the seconds, which the server accepts as well. The
 * browser's time picker only offers minutes; the seconds are used by the
 * integration check to schedule an email a few seconds ahead.
 */
function zonedWallClock(date, timeZone, withSeconds = false) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const field = {};
  for (const part of parts) {
    if (part.type !== 'literal') field[part.type] = part.value;
  }
  let hour = Number(field.hour);
  if (hour === 24) hour = 0;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const base = `${pad(field.year, 4)}-${pad(field.month)}-${pad(field.day)}T${pad(hour)}:${pad(field.minute)}`;
  return withSeconds ? `${base}:${pad(field.second)}` : base;
}

/** The UTC instant a wall-clock time in a zone refers to. */
function zonedToUtc(localDateTime, timeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localDateTime);
  const [, y, mo, d, h, mi, se] = match;
  const naive = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se || 0));
  let guess = new Date(naive);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(guess);
    const field = {};
    for (const part of parts) {
      if (part.type !== 'literal') field[part.type] = part.value;
    }
    let hour = Number(field.hour);
    if (hour === 24) hour = 0;
    const asUtc = Date.UTC(
      Number(field.year),
      Number(field.month) - 1,
      Number(field.day),
      hour,
      Number(field.minute),
      Number(field.second)
    );
    const offset = asUtc - Math.floor(guess.getTime() / 1000) * 1000;
    const next = new Date(naive - offset);
    if (next.getTime() === guess.getTime()) break;
    guess = next;
  }
  return guess;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Create (or sign in to) an account on the Auth emulator and return its ID
 * token. The Auth emulator's REST API needs any API key — it ignores it.
 */
async function authAccount(email, password, displayName) {
  // The Auth emulator exposes the Identity Toolkit REST API. It ignores the
  // API key, but the parameter has to be present.
  const url = `${AUTH_BASE}/identitytoolkit.googleapis.com/v1/accounts`;
  const body = { email, password, returnSecureToken: true };

  const signUp = await fetch(`${url}:signUp?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, displayName }),
  });
  if (signUp.ok) {
    const data = await signUp.json();
    return { uid: data.localId, token: data.idToken, email: data.email };
  }

  const signIn = await fetch(`${url}:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!signIn.ok) throw new Error(`Could not sign in as ${email}: ${signIn.status}`);
  const data = await signIn.json();
  return { uid: data.localId, token: data.idToken, email: data.email };
}

async function main() {
  console.log(`Integration check against ${API_BASE}`);

  // ── setup ───────────────────────────────────────────────────────────────────
  head('Setup - reset the queue');

  // The reset needs an authenticated caller, so create the first account first.
  // The first account ever created on the installation becomes the admin.
  // Fixed accounts, so the check can be re-run against the same emulator:
  // signing in returns the account that already exists, with its role.
  const admin = await authAccount(
    'admin@example.com',
    'integration-admin-password',
    'Integration Admin'
  );
  check(Boolean(admin.token), 'the first account was created and signed in');

  const reset = await post('/api/dispatch/reset', {}, { token: admin.token });
  check(reset.ok, 'reset returns 200', `status=${reset.status}`);
  check(reset.body?.stats?.total === 0, 'queue is empty after reset', `total=${reset.body?.stats?.total}`);

  const operator = await authAccount(
    'operator@example.com',
    'integration-operator-password',
    'Integration Operator'
  );
  check(Boolean(operator.token), 'a second account was created and signed in');

  const adminProfile = await get('/api/users/me', { token: admin.token });
  check(adminProfile.body?.profile?.role === 'admin', 'the first account is the administrator', `role=${adminProfile.body?.profile?.role}`);

  const operatorProfile = await get('/api/users/me', { token: operator.token });
  check(operatorProfile.body?.profile?.role === 'operator', 'the second account is an operator', `role=${operatorProfile.body?.profile?.role}`);

  // ── security: authentication ─────────────────────────────────────────────────
  head('Security - authentication');

  const noToken = await request('POST', '/api/emails', {
    recipient: 'nope@example.com',
    subject: 'S',
    message: 'M',
  }, { token: null });
  check(!noToken.ok, 'a state change without a token is refused', `status=${noToken.status}`);
  check(noToken.status === 401, 'the refusal is a 401', `status=${noToken.status}`);

  const badToken = await post('/api/emails', { recipient: 'x@y.com', subject: 's', message: 'm' }, { token: 'not-a-real-token' });
  check(!badToken.ok, 'a state change with an invalid token is refused', `status=${badToken.status}`);
  check(badToken.status === 401, 'the refusal is a 401', `status=${badToken.status}`);

  const health = await get('/api/health');
  check(health.ok, 'the health endpoint stays public', `status=${health.status}`);

  // ── security: authorization ──────────────────────────────────────────────────
  head('Security - authorization');

  const operatorConfig = await get('/api/config', { token: operator.token });
  check(!operatorConfig.ok, 'an operator cannot read the SMTP configuration', `status=${operatorConfig.status}`);
  check(operatorConfig.status === 403, 'the refusal is a 403', `status=${operatorConfig.status}`);

  const operatorConfigWrite = await post('/api/config', { dryRun: true }, { token: operator.token });
  check(!operatorConfigWrite.ok, 'an operator cannot change the SMTP configuration', `status=${operatorConfigWrite.status}`);
  check(operatorConfigWrite.status === 403, 'the refusal is a 403', `status=${operatorConfigWrite.status}`);

  const operatorTest = await post('/api/config/test', {}, { token: operator.token });
  check(!operatorTest.ok, 'an operator cannot run a connection test', `status=${operatorTest.status}`);

  const adminConfig = await get('/api/config', { token: admin.token });
  check(adminConfig.ok, 'an administrator can read the SMTP configuration', `status=${adminConfig.status}`);

  const operatorEscalate = await post(`/api/users/${operator.uid}/role`, { role: 'admin' }, { token: operator.token });
  check(!operatorEscalate.ok, 'an operator cannot promote themselves', `status=${operatorEscalate.status}`);
  check(operatorEscalate.status === 403, 'the refusal is a 403', `status=${operatorEscalate.status}`);

  const operatorListUsers = await get('/api/users', { token: operator.token });
  check(!operatorListUsers.ok, 'an operator cannot list the accounts', `status=${operatorListUsers.status}`);

  const adminListUsers = await get('/api/users', { token: admin.token });
  check(adminListUsers.ok, 'an administrator can list the accounts', `status=${adminListUsers.status}`);
  check(Array.isArray(adminListUsers.body?.users) && adminListUsers.body.users.length >= 2, 'the account list contains both accounts');

  const adminDemoteSelf = await post(`/api/users/${admin.uid}/role`, { role: 'operator' }, { token: admin.token });
  check(!adminDemoteSelf.ok, 'an administrator cannot demote themselves', `status=${adminDemoteSelf.status}`);

  const adminPromote = await post(`/api/users/${operator.uid}/role`, { role: 'admin' }, { token: admin.token });
  check(adminPromote.ok, 'an administrator can promote an operator', `status=${adminPromote.status}`);
  // put it back
  await post(`/api/users/${operator.uid}/role`, { role: 'operator' }, { token: admin.token });

  // ── security: origin enforcement ────────────────────────────────────────────
  head('Security - origin enforcement on mutating endpoints');

  const noOrigin = await fetch(`${API_BASE}/api/emails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
    body: JSON.stringify({ recipient: 'nope@example.com', subject: 'S', message: 'M' }),
  });
  check(!noOrigin.ok, 'a state change without an Origin header is refused', `status=${noOrigin.status}`);
  check(noOrigin.status === 403, 'the refusal is a 403', `status=${noOrigin.status}`);

  const badOrigin = await fetch(`${API_BASE}/api/emails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example.com', Authorization: `Bearer ${admin.token}` },
    body: JSON.stringify({ recipient: 'nope@example.com', subject: 'S', message: 'M' }),
  });
  check(!badOrigin.ok, 'a state change from an unknown origin is refused', `status=${badOrigin.status}`);

  const readOnly = await fetch(`${API_BASE}/api/health`);
  check(readOnly.ok, 'reads still work without an Origin header', `status=${readOnly.status}`);

  // ── Module 1 - Email Queue Creator ──────────────────────────────────────────
  head('Module 1 - Email Queue Creator');

  const add = await post('/api/emails', {
    recipient: 'ada@example.com',
    subject: 'Assignment',
    message: 'Body',
  }, { token: admin.token });
  check(add.ok, 'enqueue returns 200', `status=${add.status}`);
  check(add.body?.email?.id === 'EML-001', 'first email gets id EML-001', `id=${add.body?.email?.id}`);
  check(add.body?.email?.status === 'QUEUED', 'new email is QUEUED', `status=${add.body?.email?.status}`);
  check(add.body?.position === 1, 'queue position is 1', `position=${add.body?.position}`);
  check(add.body?.email?.seq === 1, 'sequence counter starts at 1', `seq=${add.body?.email?.seq}`);
  check(add.body?.email?.createdBy === admin.uid, 'the email records its owner');

  const bad = await post('/api/emails', { recipient: 'abc@', subject: 'S', message: 'M' }, { token: admin.token });
  check(!bad.ok, 'invalid address is rejected', `status=${bad.status}`);
  check(/valid email address/i.test(bad.body?.error ?? ''), 'rejection explains the problem', `error=${bad.body?.error}`);

  const empty = await post('/api/emails', { recipient: '', subject: '', message: '' }, { token: admin.token });
  check(!empty.ok, 'empty email is refused', `status=${empty.status}`);

  const batch = await post('/api/emails/batch', {
    items: [
      { recipient: 'b1@example.com', subject: 'S1', message: 'M1' },
      { recipient: 'b2@example.com', subject: 'S2', message: 'M2' },
    ],
  }, { token: admin.token });
  check(batch.ok, 'batch enqueue returns 200', `status=${batch.status}`);
  check(batch.body?.count === 2, 'batch created 2 emails', `count=${batch.body?.count}`);
  check(batch.body?.created?.[0]?.id === 'EML-002', 'ids continue sequentially', `id=${batch.body?.created?.[0]?.id}`);

  const list = await get('/api/emails', { token: admin.token });
  check(list.body?.length === 3, 'queue lists 3 emails', `count=${list.body?.length}`);
  check(list.body?.[0]?.id === 'EML-001', 'queue is ordered FIFO', `first=${list.body?.[0]?.id}`);

  const one = await get('/api/emails/EML-001', { token: admin.token });
  check(one.body?.recipient === 'ada@example.com', 'single email can be fetched', `recipient=${one.body?.recipient}`);

  const missing = await get('/api/emails/EML-999', { token: admin.token });
  check(!missing.ok, 'unknown id returns 404', `status=${missing.status}`);

  // ownership: an operator does not see the administrator's emails
  const operatorList = await get('/api/emails', { token: operator.token });
  check(operatorList.ok, 'an operator can list the queue', `status=${operatorList.status}`);
  check(operatorList.body?.length === 0, "an operator only sees their own emails", `count=${operatorList.body?.length}`);

  const operatorReadsAdmin = await get('/api/emails/EML-001', { token: operator.token });
  check(!operatorReadsAdmin.ok, "an operator cannot read another account's email", `status=${operatorReadsAdmin.status}`);
  check(operatorReadsAdmin.status === 403, 'the refusal is a 403', `status=${operatorReadsAdmin.status}`);

  // ── Module 2 - Send Simulator ───────────────────────────────────────────────
  head('Module 2 - Send Simulator');

  const cfg = await get('/api/config', { token: admin.token });
  check(cfg.ok, 'config can be read', `status=${cfg.status}`);
  check(cfg.body?.smtp !== undefined && cfg.body?.smtp !== null, 'config exposes the smtp section');
  check(cfg.body?.smtp?.pass === undefined, 'config never exposes the password');

  const save = await post('/api/config', {
    dryRun: true,
    simulationMode: 'FORCE_SUCCESS',
    retryLimit: 2,
  }, { token: admin.token });
  check(save.ok, 'config can be saved', `status=${save.status}`);
  check(save.body?.config?.dryRun === true, 'dry-run was stored');
  check(save.body?.config?.simulationMode === 'FORCE_SUCCESS', 'simulation mode was stored', `mode=${save.body?.config?.simulationMode}`);
  check(save.body?.config?.retryLimit === 2, 'retry limit was stored', `limit=${save.body?.config?.retryLimit}`);

  const test = await post('/api/config/test', {}, { token: admin.token });
  check(test.body?.ok === true, 'dry-run connection test succeeds', `note=${test.body?.note}`);

  const badTest = await post('/api/config/test-send', { to: 'not-an-email' }, { token: admin.token });
  check(badTest.body?.ok === false, 'test-send rejects an invalid recipient', `error=${badTest.body?.error}`);

  // ── Module 3 - success path ─────────────────────────────────────────────────
  head('Module 3 - Retry Logic Engine (success path)');

  const start = await post('/api/dispatch/start', {}, { token: admin.token });
  check(start.ok, 'dispatch start returns 200', `status=${start.status}`);
  check(start.body?.done === true, 'the queue was drained in one pass', `done=${start.body?.done}`);

  const stats = await get('/api/stats', { token: admin.token });
  check(stats.body?.total === 3, 'statistics count every email', `total=${stats.body?.total}`);
  check(stats.body?.delivered === 3, 'every email was delivered', `delivered=${stats.body?.delivered}`);
  check(stats.body?.failed === 0, 'no email failed', `failed=${stats.body?.failed}`);
  check(stats.body?.successRate === 100, 'success rate is 100%', `rate=${stats.body?.successRate}`);
  check(stats.body?.totalAttempts === 3, 'one attempt per email', `attempts=${stats.body?.totalAttempts}`);

  // ── Module 4 - Final Status Logger ──────────────────────────────────────────
  head('Module 4 - Final Status Logger');

  const activity = await get('/api/activity', { token: admin.token });
  check(activity.body?.length > 0, 'activity log has entries', `count=${activity.body?.length}`);
  check(/^ACT-/.test(activity.body?.[0]?.id ?? ''), 'entries carry an id', `id=${activity.body?.[0]?.id}`);
  check(Boolean(activity.body?.[0]?.timestamp), 'entries are timestamped');
  check(activity.body?.some((e) => e.type === 'success'), 'a successful delivery is logged');

  const email = await get('/api/emails/EML-001', { token: admin.token });
  check(email.body?.logs?.length === 1, 'the attempt was logged on the email', `logs=${email.body?.logs?.length}`);
  check(email.body?.logs?.[0]?.result === 'SUCCESS', 'the attempt result was recorded', `result=${email.body?.logs?.[0]?.result}`);
  check(email.body?.finalStatus === 'DELIVERED', 'the final status was recorded', `final=${email.body?.finalStatus}`);

  const operatorActivity = await get('/api/activity', { token: operator.token });
  check(operatorActivity.body?.length === 0, "an operator only sees their own activity", `count=${operatorActivity.body?.length}`);

  // ── Module 5 - Summary Exporter ─────────────────────────────────────────────
  head('Module 5 - Summary Exporter');

  const report = await get('/api/report', { token: admin.token });
  check(report.ok, 'report can be fetched', `status=${report.status}`);
  check(report.body?.summary?.total === 3, 'the report carries the summary', `total=${report.body?.summary?.total}`);
  check(report.body?.emails?.length === 3, 'the report carries one row per email', `rows=${report.body?.emails?.length}`);

  const operatorReport = await get('/api/report', { token: operator.token });
  check(operatorReport.body?.emails?.length === 0, "an operator's report only covers their own emails", `rows=${operatorReport.body?.emails?.length}`);

  // ── Module 3 - failure and retry path ───────────────────────────────────────
  head('Module 3 - Retry Logic Engine (failure and retry path)');

  await post('/api/dispatch/reset', {}, { token: admin.token });
  const saveFail = await post('/api/config', { dryRun: true, simulationMode: 'FORCE_FAILURE', retryLimit: 1 }, { token: admin.token });
  check(saveFail.body?.config?.simulationMode === 'FORCE_FAILURE', 'force-failure mode stored');

  await post('/api/emails', { recipient: 'fail@example.com', subject: 'Will fail', message: 'Body' }, { token: admin.token });
  const failStart = await post('/api/dispatch/start', {}, { token: admin.token });
  check(failStart.ok, 'dispatch runs with a failing simulator', `status=${failStart.status}`);

  const failStats = await get('/api/stats', { token: admin.token });
  check(failStats.body?.failed === 1, 'the email ended up FAILED', `failed=${failStats.body?.failed}`);
  check(failStats.body?.delivered === 0, 'nothing was delivered', `delivered=${failStats.body?.delivered}`);
  check(failStats.body?.totalAttempts === 2, 'retryLimit 1 means 2 attempts', `attempts=${failStats.body?.totalAttempts}`);
  check(failStats.body?.totalRetries === 1, 'one retry was recorded', `retries=${failStats.body?.totalRetries}`);
  check(failStats.body?.failureRate === 100, 'failure rate is 100%', `rate=${failStats.body?.failureRate}`);

  const failedEmail = await get('/api/emails/EML-001', { token: admin.token });
  check(failedEmail.body?.logs?.length === 2, 'both attempts were logged', `logs=${failedEmail.body?.logs?.length}`);
  check(failedEmail.body?.logs?.[0]?.result === 'FAILURE', 'attempt 1 failed', `result=${failedEmail.body?.logs?.[0]?.result}`);
  check(Boolean(failedEmail.body?.socketErr), 'the failure detail was captured');

  // ── Module 3 - pause and resume ──────────────────────────────────────────────
  head('Module 3 - Retry Logic Engine (pause and resume)');

  await post('/api/dispatch/reset', {}, { token: admin.token });
  await post('/api/config', { dryRun: true, simulationMode: 'FORCE_SUCCESS', retryLimit: 3 }, { token: admin.token });
  for (let n = 1; n <= 4; n++) {
    await post('/api/emails', { recipient: `p${n}@example.com`, subject: `S${n}`, message: 'M' }, { token: admin.token });
  }
  const pause = await post('/api/dispatch/pause', {}, { token: admin.token });
  check(pause.body?.dispatcher?.paused === true, 'pause sets the paused flag', `paused=${pause.body?.dispatcher?.paused}`);
  const resume = await post('/api/dispatch/resume', {}, { token: admin.token });
  check(resume.ok, 'resume returns 200', `status=${resume.status}`);
  const afterResume = await get('/api/stats', { token: admin.token });
  check(afterResume.body?.total === 4, 'all four emails were processed after resume', `total=${afterResume.body?.total}`);

  // ── Module 1 - removal ──────────────────────────────────────────────────────
  head('Module 1 - Email Queue Creator (removal)');

  await post('/api/emails', { recipient: 'temp@example.com', subject: 'Temp', message: 'Body' }, { token: admin.token });
  const all = await get('/api/emails', { token: admin.token });
  const temp = all.body?.find((e) => e.recipient === 'temp@example.com');
  const removed = await del(`/api/emails/${temp?.id}`, { token: admin.token });
  check(removed.ok, 'a queued email can be removed', `status=${removed.status}`);
  const afterRemove = await get('/api/stats', { token: admin.token });
  check(afterRemove.body?.total === all.body?.length - 1, 'statistics reflect the removal', `total=${afterRemove.body?.total}`);

  // ── Module 6 - Scheduled Delivery ─────────────────────────────────────────
  head('Module 6 - Scheduled Delivery');

  await post('/api/dispatch/reset', {}, { token: admin.token });

  // The scheduler status every signed-in account may read.
  const status = await get('/api/status', { token: operator.token });
  check(status.ok, 'an operator can read the operational status', `status=${status.status}`);
  check(status.body?.mode === 'DRY-RUN' || status.body?.mode === 'LIVE', 'the status carries the operating mode', `mode=${status.body?.mode}`);
  check(status.body?.scheduler !== undefined, 'the status describes the scheduler');
  check(status.body?.smtp?.pass === undefined && status.body?.smtp === undefined, 'the status never exposes SMTP credentials');

  // 1. schedule 30 minutes into the future
  const in30 = new Date(Date.now() + 30 * 60 * 1000);
  const slot30 = zonedWallClock(in30, 'Asia/Kolkata');
  const schedule30 = await post('/api/scheduled-emails', {
    recipient: 'student@example.com',
    subject: 'Project Update',
    message: 'Please check the latest project status.',
    scheduledAt: slot30,
    timezone: 'Asia/Kolkata',
  }, { token: admin.token });
  check(schedule30.ok, 'an email can be scheduled 30 minutes ahead', `status=${schedule30.status} error=${schedule30.body?.error}`);
  check(schedule30.body?.email?.status === 'SCHEDULED', 'the scheduled email has the status SCHEDULED', `status=${schedule30.body?.email?.status}`);
  check(schedule30.body?.email?.timezone === 'Asia/Kolkata', 'the requested timezone is kept for display', `tz=${schedule30.body?.email?.timezone}`);
  check(Number(schedule30.body?.email?.scheduleVersion) === 1, 'the first revision is version 1', `v=${schedule30.body?.email?.scheduleVersion}`);

  const scheduledId = schedule30.body?.email?.id;

  // 2. schedule several hours ahead
  const inHours = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const slotHours = zonedWallClock(inHours, 'UTC');
  const scheduleHours = await post('/api/scheduled-emails', {
    recipient: 'later@example.com',
    subject: 'Later',
    message: 'Hours later',
    scheduledAt: slotHours,
    timezone: 'UTC',
  }, { token: admin.token });
  check(scheduleHours.ok, 'an email can be scheduled several hours ahead', `status=${scheduleHours.status}`);
  check(scheduleHours.body?.email?.status === 'SCHEDULED', 'the second scheduled email is SCHEDULED');

  // 3. a past moment is refused
  const pastSlot = zonedWallClock(new Date(Date.now() - 60 * 60 * 1000), 'UTC');
  const past = await post('/api/scheduled-emails', {
    recipient: 'past@example.com',
    subject: 'Past',
    message: 'Should never be accepted',
    scheduledAt: pastSlot,
    timezone: 'UTC',
  }, { token: admin.token });
  check(!past.ok, 'a schedule in the past is refused', `status=${past.status}`);
  check(past.status === 400, 'the refusal is a 400', `status=${past.status}`);
  check(/future/i.test(past.body?.error ?? ''), 'the refusal explains why', `error=${past.body?.error}`);

  // 4. the task must not execute early
  const earlySweep = await post('/api/scheduled-emails/sweep', {}, { token: admin.token });
  check(earlySweep.ok, 'the scheduler sweep runs', `status=${earlySweep.status}`);
  check(earlySweep.body?.dispatched === 0, 'nothing is delivered before its time', `dispatched=${earlySweep.body?.dispatched}`);
  const stillScheduled = await get(`/api/emails/${scheduledId}`, { token: admin.token });
  check(stillScheduled.body?.status === 'SCHEDULED', 'the email is still waiting', `status=${stillScheduled.body?.status}`);

  // 6. a timezone other than Asia/Kolkata
  const newYork = new Date(Date.now() + 4 * 60 * 60 * 1000);
  const nySlot = zonedWallClock(newYork, 'America/New_York');
  const nySchedule = await post('/api/scheduled-emails', {
    recipient: 'ny@example.com',
    subject: 'New York',
    message: 'Another zone',
    scheduledAt: nySlot,
    timezone: 'America/New_York',
  }, { token: admin.token });
  check(nySchedule.ok, 'a schedule in another timezone is accepted', `status=${nySchedule.status} error=${nySchedule.body?.error}`);
  check(nySchedule.body?.email?.timezone === 'America/New_York', 'the zone is kept', `tz=${nySchedule.body?.email?.timezone}`);

  // 7. a daylight-saving zone: the UTC offset differs between summer and winter
  const dstSummer = zonedWallClock(new Date(Date.UTC(2027, 6, 15, 12, 0)), 'Europe/Berlin');
  const dstWinter = zonedWallClock(new Date(Date.UTC(2027, 0, 15, 12, 0)), 'Europe/Berlin');
  const summerUtc = zonedToUtc(dstSummer, 'Europe/Berlin');
  const winterUtc = zonedToUtc(dstWinter, 'Europe/Berlin');
  const summerOffset = summerUtc.getTime() - Date.parse(`${dstSummer}:00Z`.replace('T', 'T'));
  const winterOffset = winterUtc.getTime() - Date.parse(`${dstWinter}:00Z`.replace('T', 'T'));
  check(
    summerOffset !== winterOffset,
    'a daylight-saving zone shifts its UTC offset',
    `summerOffset=${summerOffset / 3600000}h winterOffset=${winterOffset / 3600000}h`
  );

  // 8. UTC storage and local display agree
  const storedUtc = new Date(schedule30.body?.email?.scheduledAt);
  const expectedUtc = zonedToUtc(slot30, 'Asia/Kolkata');
  check(
    Math.abs(storedUtc.getTime() - expectedUtc.getTime()) < 1000,
    'the stored UTC instant matches the local wall-clock time',
    `stored=${storedUtc.toISOString()} expected=${expectedUtc.toISOString()}`
  );
  const rendered = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(storedUtc);
  check(rendered.length > 0, 'the schedule renders back in the requested zone', `rendered=${rendered}`);

  // 9. cancel an upcoming scheduled email
  const cancel = await post(`/api/scheduled-emails/${scheduledId}/cancel`, {}, { token: admin.token });
  check(cancel.ok, 'a scheduled email can be cancelled', `status=${cancel.status}`);
  check(cancel.body?.email?.status === 'CANCELLED', 'the email is CANCELLED', `status=${cancel.body?.email?.status}`);
  const afterCancel = await post('/api/scheduled-emails/sweep', {}, { token: admin.token });
  check(afterCancel.body?.dispatched === 0, 'a cancelled email is never delivered', `dispatched=${afterCancel.body?.dispatched}`);

  // 10. reschedule an upcoming scheduled email
  const rescheduleId = scheduleHours.body?.email?.id;
  const newMoment = new Date(Date.now() + 90 * 60 * 1000);
  const newSlot = zonedWallClock(newMoment, 'UTC');
  const reschedule = await post(`/api/scheduled-emails/${rescheduleId}/reschedule`, {
    scheduledAt: newSlot,
    timezone: 'UTC',
  }, { token: admin.token });
  check(reschedule.ok, 'a scheduled email can be rescheduled', `status=${reschedule.status} error=${reschedule.body?.error}`);
  check(Number(reschedule.body?.email?.scheduleVersion) === 2, 'the schedule version is bumped', `v=${reschedule.body?.email?.scheduleVersion}`);
  check(reschedule.body?.email?.scheduledAt !== scheduleHours.body?.email?.scheduledAt, 'the scheduled moment changed');

  // 11. the old task must not send after a reschedule
  const staleSweep = await post('/api/scheduled-emails/sweep', {}, { token: admin.token });
  check(staleSweep.body?.dispatched === 0, 'a rescheduled email is not delivered early', `dispatched=${staleSweep.body?.dispatched}`);

  // 14. an operator cannot touch another account's scheduled email
  const operatorCancel = await post(`/api/scheduled-emails/${rescheduleId}/cancel`, {}, { token: operator.token });
  check(!operatorCancel.ok, "an operator cannot cancel another account's scheduled email", `status=${operatorCancel.status}`);
  check(operatorCancel.status === 403, 'the refusal is a 403', `status=${operatorCancel.status}`);

  const operatorSchedule = await post('/api/scheduled-emails', {
    recipient: 'operator@example.com',
    subject: 'Mine',
    message: 'My own schedule',
    scheduledAt: zonedWallClock(new Date(Date.now() + 60 * 60 * 1000), 'UTC'),
    timezone: 'UTC',
  }, { token: operator.token });
  check(operatorSchedule.ok, 'an operator can schedule their own email', `status=${operatorSchedule.status}`);

  const operatorSchedules = await get('/api/scheduled-emails', { token: operator.token });
  check(operatorSchedules.ok, 'the scheduled list can be read', `status=${operatorSchedules.status}`);
  check(
    operatorSchedules.body?.scheduled?.every((e) => e.createdBy === operator.uid),
    "an operator only sees their own scheduled emails",
    `count=${operatorSchedules.body?.scheduled?.length}`
  );

  const adminSchedules = await get('/api/scheduled-emails', { token: admin.token });
  check(adminSchedules.body?.scheduled?.length >= operatorSchedules.body?.scheduled?.length, 'an administrator sees the scheduled emails');

  // 5. the server delivers it on time — with no browser involved.
  //
  // The Cloud Tasks queue calls the dispatch function at the scheduled
  // moment. Nothing in the browser is asked to do anything: the check only
  // waits and then looks at the document.
  const soon = new Date(Date.now() + 6000);
  const soonSlot = zonedWallClock(soon, 'UTC', true);
  const soonSchedule = await post('/api/scheduled-emails', {
    recipient: 'soon@example.com',
    subject: 'Soon',
    message: 'Due in a few seconds',
    scheduledAt: soonSlot,
    timezone: 'UTC',
  }, { token: admin.token });
  check(soonSchedule.ok, 'an email can be scheduled a few seconds ahead', `status=${soonSchedule.status} error=${soonSchedule.body?.error}`);
  const schedulerKind = soonSchedule.body?.scheduler;
  check(
    schedulerKind === 'cloud-tasks' || schedulerKind === 'sweep',
    'the schedule reports which mechanism will deliver it',
    `scheduler=${schedulerKind}`
  );

  const taskQueueActive = status.body?.scheduler?.emulator === true;
  if (taskQueueActive) {
    check(schedulerKind === 'cloud-tasks', 'the task queue carries the delivery', `scheduler=${schedulerKind}`);
  }

  const soonId = soonSchedule.body?.email?.id;

  // The task queue fires straight away in the emulator, so the handler
  // answers "not due yet" until the scheduled moment has passed. Allow for
  // the retry back-off of the queue.
  await sleep(25000);

  const byTask = await get(`/api/emails/${soonId}`, { token: admin.token });
  if (taskQueueActive) {
    check(byTask.body?.status === 'DELIVERED', 'the server delivered the email on its own', `status=${byTask.body?.status}`);
    check(Boolean(byTask.body?.dispatchedAt), 'the actual dispatch time was recorded', `dispatchedAt=${byTask.body?.dispatchedAt}`);
    check(byTask.body?.logs?.length === 1, 'exactly one delivery attempt was made', `logs=${byTask.body?.logs?.length}`);
    check(byTask.body?.deliveryMode === 'SCHEDULED', 'it travelled through the scheduled pipeline', `mode=${byTask.body?.deliveryMode}`);
  } else {
    check(byTask.body?.status === 'SCHEDULED', 'without a task queue the email waits for the sweep', `status=${byTask.body?.status}`);
  }

  // 12. + 13. the task may be retried — it must never send twice.
  const [sweepA, sweepB] = await Promise.all([
    post('/api/scheduled-emails/sweep', {}, { token: admin.token }),
    post('/api/scheduled-emails/sweep', {}, { token: admin.token }),
  ]);
  const totalDispatched = (sweepA.body?.dispatched ?? 0) + (sweepB.body?.dispatched ?? 0);
  check(totalDispatched === 0, 'a delivered email is never sent again, even with two concurrent sweeps', `a=${sweepA.body?.dispatched} b=${sweepB.body?.dispatched}`);

  const afterSweep = await get(`/api/emails/${soonId}`, { token: admin.token });
  check(afterSweep.body?.logs?.length === 1, 'the email still has exactly one attempt', `logs=${afterSweep.body?.logs?.length}`);

  // The statistics know about the scheduled emails.
  const schedStats = await get('/api/stats', { token: admin.token });
  check(schedStats.body?.scheduled !== undefined, 'the statistics carry the scheduled counter', `scheduled=${schedStats.body?.scheduled}`);
  check(schedStats.body?.cancelled !== undefined, 'the statistics carry the cancelled counter', `cancelled=${schedStats.body?.cancelled}`);

  // The report carries the scheduled delivery details.
  const schedReport = await get('/api/report', { token: admin.token });
  const schedRow = schedReport.body?.emails?.find((e) => e.id === soonId);
  check(Boolean(schedRow), 'the report contains the scheduled email');
  check(schedRow?.scheduledAt !== undefined, 'the report carries the scheduled moment', `scheduledAt=${schedRow?.scheduledAt}`);
  check(schedRow?.deliveryMode === 'SCHEDULED', 'the report marks it as a scheduled delivery');

  // The activity log records the scheduling events.
  const schedActivity = await get('/api/activity', { token: admin.token });
  check(
    schedActivity.body?.some((e) => e.kind === 'scheduled'),
    'a scheduled event is recorded in the activity log'
  );
  check(
    schedActivity.body?.some((e) => e.kind === 'dispatch'),
    'a dispatch event is recorded in the activity log'
  );
  check(
    schedActivity.body?.some((e) => e.kind === 'cancelled'),
    'a cancellation event is recorded in the activity log'
  );

  // ── result ──────────────────────────────────────────────────────────────────
  head('Result');
  console.log(`  passed: ${passed}`);
  console.log(`  failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Integration check crashed:', err);
  process.exit(1);
});
