#!/usr/bin/env node
/**
 * End-to-end integration check against the running Firebase Emulator Suite.
 *
 * Exercises all five modules over the real HTTP API:
 *   1. Email Queue Creator  - enqueue, validate, list, remove
 *   2. Send Simulator       - config, dry-run, simulation modes, connection test
 *   3. Retry Logic Engine   - dispatch, bounded retry, pause/resume, reset
 *   4. Final Status Logger  - activity log and per-attempt history
 *   5. Summary Exporter     - statistics and the dispatch report
 *
 * Usage:
 *   npm run dev            # in one terminal (emulators + dashboard)
 *   node scripts/integration-check.mjs
 *
 * Set API_BASE to point at a deployed function instead of the emulator.
 */

const API_BASE =
  process.env.API_BASE ||
  'http://127.0.0.1:5001/email-dispatcher-43118/us-central1/backend';

/** The browser origin the dashboard sends; must be in the function allowlist. */
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
async function request(method, path, payload) {
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
        ...(mutating ? { Origin: CLIENT_ORIGIN } : {}),
      },
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

const get = (path) => request('GET', path);
const post = (path, payload) => request('POST', path, payload ?? {});
const del = (path) => request('DELETE', path);

async function main() {
  console.log(`Integration check against ${API_BASE}`);

  // ── setup ───────────────────────────────────────────────────────────────────
  head('Setup - reset the queue');
  const reset = await post('/api/dispatch/reset');
  check(reset.ok, 'reset returns 200', `status=${reset.status}`);
  check(reset.body?.stats?.total === 0, 'queue is empty after reset', `total=${reset.body?.stats?.total}`);

  // ── Module 1 - Email Queue Creator ──────────────────────────────────────────
  head('Module 1 - Email Queue Creator');

  const add = await post('/api/emails', {
    recipient: 'ada@example.com',
    subject: 'Assignment',
    message: 'Body',
  });
  check(add.ok, 'enqueue returns 200', `status=${add.status}`);
  check(add.body?.email?.id === 'EML-001', 'first email gets id EML-001', `id=${add.body?.email?.id}`);
  check(add.body?.email?.status === 'QUEUED', 'new email is QUEUED', `status=${add.body?.email?.status}`);
  check(add.body?.position === 1, 'queue position is 1', `position=${add.body?.position}`);
  check(add.body?.email?.seq === 1, 'sequence counter starts at 1', `seq=${add.body?.email?.seq}`);

  const bad = await post('/api/emails', { recipient: 'abc@', subject: 'S', message: 'M' });
  check(!bad.ok, 'invalid address is rejected', `status=${bad.status}`);
  check(/valid email address/i.test(bad.body?.error ?? ''), 'rejection explains the problem', `error=${bad.body?.error}`);

  const empty = await post('/api/emails', { recipient: '', subject: '', message: '' });
  check(!empty.ok, 'empty email is refused', `status=${empty.status}`);

  const batch = await post('/api/emails/batch', {
    items: [
      { recipient: 'b1@example.com', subject: 'S1', message: 'M1' },
      { recipient: 'b2@example.com', subject: 'S2', message: 'M2' },
    ],
  });
  check(batch.ok, 'batch enqueue returns 200', `status=${batch.status}`);
  check(batch.body?.count === 2, 'batch created 2 emails', `count=${batch.body?.count}`);
  check(batch.body?.created?.[0]?.id === 'EML-002', 'ids continue sequentially', `id=${batch.body?.created?.[0]?.id}`);

  const list = await get('/api/emails');
  check(list.body?.length === 3, 'queue lists 3 emails', `count=${list.body?.length}`);
  check(list.body?.[0]?.id === 'EML-001', 'queue is ordered FIFO', `first=${list.body?.[0]?.id}`);

  const one = await get('/api/emails/EML-001');
  check(one.body?.recipient === 'ada@example.com', 'single email can be fetched', `recipient=${one.body?.recipient}`);

  const missing = await get('/api/emails/EML-999');
  check(!missing.ok, 'unknown id returns 404', `status=${missing.status}`);

  // ── Module 2 - Send Simulator ───────────────────────────────────────────────
  head('Module 2 - Send Simulator');

  const cfg = await get('/api/config');
  check(cfg.ok, 'config can be read', `status=${cfg.status}`);
  check(cfg.body?.smtp !== undefined && cfg.body?.smtp !== null, 'config exposes the smtp section');
  check(cfg.body?.smtp?.pass === undefined, 'config never exposes the password');

  const save = await post('/api/config', {
    dryRun: true,
    simulationMode: 'FORCE_SUCCESS',
    retryLimit: 2,
  });
  check(save.ok, 'config can be saved', `status=${save.status}`);
  check(save.body?.config?.dryRun === true, 'dry-run was stored');
  check(save.body?.config?.simulationMode === 'FORCE_SUCCESS', 'simulation mode was stored', `mode=${save.body?.config?.simulationMode}`);
  check(save.body?.config?.retryLimit === 2, 'retry limit was stored', `limit=${save.body?.config?.retryLimit}`);

  const test = await post('/api/config/test');
  check(test.body?.ok === true, 'dry-run connection test succeeds', `note=${test.body?.note}`);

  const badTest = await post('/api/config/test-send', { to: 'not-an-email' });
  check(badTest.body?.ok === false, 'test-send rejects an invalid recipient', `error=${badTest.body?.error}`);

  // ── Module 3 - success path ─────────────────────────────────────────────────
  head('Module 3 - Retry Logic Engine (success path)');

  const start = await post('/api/dispatch/start');
  check(start.ok, 'dispatch start returns 200', `status=${start.status}`);
  check(start.body?.done === true, 'the queue was drained in one pass', `done=${start.body?.done}`);

  const stats = await get('/api/stats');
  check(stats.body?.total === 3, 'statistics count every email', `total=${stats.body?.total}`);
  check(stats.body?.delivered === 3, 'every email was delivered', `delivered=${stats.body?.delivered}`);
  check(stats.body?.failed === 0, 'no email failed', `failed=${stats.body?.failed}`);
  check(stats.body?.successRate === 100, 'success rate is 100%', `rate=${stats.body?.successRate}`);
  check(stats.body?.totalAttempts === 3, 'one attempt per email', `attempts=${stats.body?.totalAttempts}`);

  // ── Module 4 - Final Status Logger ──────────────────────────────────────────
  head('Module 4 - Final Status Logger');

  const activity = await get('/api/activity');
  check(activity.body?.length > 0, 'activity log has entries', `count=${activity.body?.length}`);
  check(/^ACT-/.test(activity.body?.[0]?.id ?? ''), 'entries carry an id', `id=${activity.body?.[0]?.id}`);
  check(Boolean(activity.body?.[0]?.timestamp), 'entries are timestamped');
  check(
    activity.body?.some((e) => e.type === 'success'),
    'a successful delivery is logged'
  );

  const email = await get('/api/emails/EML-001');
  check(email.body?.logs?.length === 1, 'the attempt was logged on the email', `logs=${email.body?.logs?.length}`);
  check(email.body?.logs?.[0]?.result === 'SUCCESS', 'the attempt result was recorded', `result=${email.body?.logs?.[0]?.result}`);
  check(email.body?.finalStatus === 'DELIVERED', 'the final status was recorded', `final=${email.body?.finalStatus}`);

  // ── Module 5 - Summary Exporter ─────────────────────────────────────────────
  head('Module 5 - Summary Exporter');

  const report = await get('/api/report');
  check(report.ok, 'report can be fetched', `status=${report.status}`);
  check(report.body?.summary?.total === 3, 'the report carries the summary', `total=${report.body?.summary?.total}`);
  check(report.body?.emails?.length === 3, 'the report carries one row per email', `rows=${report.body?.emails?.length}`);

  // ── Module 3 - failure and retry path ───────────────────────────────────────
  head('Module 3 - Retry Logic Engine (failure and retry path)');

  await post('/api/dispatch/reset');
  const saveFail = await post('/api/config', { dryRun: true, simulationMode: 'FORCE_FAILURE', retryLimit: 1 });
  check(saveFail.body?.config?.simulationMode === 'FORCE_FAILURE', 'force-failure mode stored');

  await post('/api/emails', { recipient: 'fail@example.com', subject: 'Will fail', message: 'Body' });
  const failStart = await post('/api/dispatch/start');
  check(failStart.ok, 'dispatch runs with a failing simulator', `status=${failStart.status}`);

  const failStats = await get('/api/stats');
  check(failStats.body?.failed === 1, 'the email ended up FAILED', `failed=${failStats.body?.failed}`);
  check(failStats.body?.delivered === 0, 'nothing was delivered', `delivered=${failStats.body?.delivered}`);
  check(failStats.body?.totalAttempts === 2, 'retryLimit 1 means 2 attempts', `attempts=${failStats.body?.totalAttempts}`);
  check(failStats.body?.totalRetries === 1, 'one retry was recorded', `retries=${failStats.body?.totalRetries}`);
  check(failStats.body?.failureRate === 100, 'failure rate is 100%', `rate=${failStats.body?.failureRate}`);

  const failedEmail = await get('/api/emails/EML-001');
  check(failedEmail.body?.logs?.length === 2, 'both attempts were logged', `logs=${failedEmail.body?.logs?.length}`);
  check(failedEmail.body?.logs?.[0]?.result === 'FAILURE', 'attempt 1 failed', `result=${failedEmail.body?.logs?.[0]?.result}`);
  check(Boolean(failedEmail.body?.socketErr), 'the failure detail was captured');

  // ── Module 3 - pause and resume ──────────────────────────────────────────────
  head('Module 3 - Retry Logic Engine (pause and resume)');

  await post('/api/dispatch/reset');
  await post('/api/config', { dryRun: true, simulationMode: 'FORCE_SUCCESS', retryLimit: 3 });
  for (let n = 1; n <= 4; n++) {
    await post('/api/emails', { recipient: `p${n}@example.com`, subject: `S${n}`, message: 'M' });
  }
  const pause = await post('/api/dispatch/pause');
  check(pause.body?.dispatcher?.paused === true, 'pause sets the paused flag', `paused=${pause.body?.dispatcher?.paused}`);
  const resume = await post('/api/dispatch/resume');
  check(resume.ok, 'resume returns 200', `status=${resume.status}`);
  const afterResume = await get('/api/stats');
  check(afterResume.body?.total === 4, 'all four emails were processed after resume', `total=${afterResume.body?.total}`);

  // ── security: origin enforcement ────────────────────────────────────────────
  head('Security - origin enforcement on mutating endpoints');

  // Raw fetch — the helper above always attaches an Origin header.
  const noOrigin = await fetch(`${API_BASE}/api/emails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: 'nope@example.com', subject: 'S', message: 'M' }),
  });
  check(!noOrigin.ok, 'a state change without an Origin header is refused', `status=${noOrigin.status}`);
  check(noOrigin.status === 403, 'the refusal is a 403', `status=${noOrigin.status}`);

  const badOrigin = await fetch(`${API_BASE}/api/emails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example.com' },
    body: JSON.stringify({ recipient: 'nope@example.com', subject: 'S', message: 'M' }),
  });
  check(!badOrigin.ok, 'a state change from an unknown origin is refused', `status=${badOrigin.status}`);

  const readOnly = await fetch(`${API_BASE}/api/health`);
  check(readOnly.ok, 'reads still work without an Origin header', `status=${readOnly.status}`);

  // ── Module 1 - removal ──────────────────────────────────────────────────────
  head('Module 1 - Email Queue Creator (removal)');

  await post('/api/emails', { recipient: 'temp@example.com', subject: 'Temp', message: 'Body' });
  const all = await get('/api/emails');
  const temp = all.body?.find((e) => e.recipient === 'temp@example.com');
  const removed = await del(`/api/emails/${temp?.id}`);
  check(removed.ok, 'a queued email can be removed', `status=${removed.status}`);
  const afterRemove = await get('/api/stats');
  check(afterRemove.body?.total === all.body?.length - 1, 'statistics reflect the removal', `total=${afterRemove.body?.total}`);

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
