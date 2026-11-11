'use strict';

/**
 * Firestore-backed store for emails, activity log, stats and dispatcher metadata.
 * Replaces the old in-memory store — the queue now survives restarts.
 *
 * Every mutation updates the Firestore docs/collections that the dashboard
 * subscribes to (emails, activity, stats, _meta, _config).
 */

const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const HISTORY_LIMIT = 250;
const STATUS_KEY = { QUEUED: 'queued', SENDING: 'sending', RETRYING: 'retrying', DELIVERED: 'delivered', FAILED: 'failed' };

function stamp() {
  return new Date().toISOString();
}

function pad(n, width = 3) {
  return String(n).padStart(width, '0');
}

// ── refs ─────────────────────────────────────────────────────────────────────────

const emailsCol = () => db.collection('emails');
const activityCol = () => db.collection('activity');
const statsDoc = () => db.collection('stats').doc('main');
const metaDoc = () => db.collection('_meta').doc('main');

// ── meta / dispatcher state ────────────────────────────────────────────────────────

async function getMeta() {
  const snap = await metaDoc().get();
  if (!snap.exists) {
    return { emailSeq: 0, activitySeq: 0, dispatch: { running: false, paused: false }, currentProcessingId: null };
  }
  return snap.data();
}

async function setMeta(patch) {
  await metaDoc().set(patch, { merge: true });
}

async function getDispatcherState() {
  return (await getMeta()).dispatch || { running: false, paused: false };
}

async function setDispatchRunning(running, paused) {
  const meta = await getMeta();
  const dispatch = { ...(meta.dispatch || {}), running, paused };
  await setMeta({ dispatch });
  return dispatch;
}

async function setCurrentProcessingId(id) {
  await setMeta({ currentProcessingId: id || null });
}

async function claimSeq(key) {
  const value = await db.runTransaction(async (t) => {
    const ref = metaDoc();
    const snap = await t.get(ref);
    const current = snap.exists ? snap.data()[key] || 0 : 0;
    const next = current + 1;
    t.set(ref, { [key]: next }, { merge: true });
    return next;
  });
  return value;
}

// ── stats ────────────────────────────────────────────────────────────────────────

function emptyStatsDoc() {
  return {
    total: 0, queued: 0, sending: 0, retrying: 0, delivered: 0, failed: 0,
    totalAttempts: 0, totalRetries: 0, updatedAt: stamp(),
  };
}

async function bumpStats(delta) {
  if (!delta || Object.keys(delta).length === 0) return;
  const patch = {};
  for (const [key, value] of Object.entries(delta)) {
    if (value !== 0) patch[key] = FieldValue.increment(value);
  }
  if (Object.keys(patch).length === 0) return;
  patch.updatedAt = stamp();
  await statsDoc().set(patch, { merge: true });
}

async function readStatsDoc() {
  const snap = await statsDoc().get();
  return snap.exists ? snap.data() : emptyStatsDoc();
}

/** Full Stats shape (matches the old in-memory getStats exactly). */
async function getStats() {
  const d = await readStatsDoc();
  const delivered = d.delivered || 0;
  const failed = d.failed || 0;
  const processed = delivered + failed;
  const retrying = d.retrying || 0;
  return {
    total: d.total || 0,
    queued: d.queued || 0,
    sending: (d.sending || 0) + retrying,
    delivered,
    failed,
    retrying,
    totalAttempts: d.totalAttempts || 0,
    totalRetries: d.totalRetries || 0,
    successRate: processed > 0 ? Math.round((delivered / processed) * 100) : 0,
    failureRate: processed > 0 ? Math.round((failed / processed) * 100) : 0,
  };
}

async function queuedCount() {
  return (await readStatsDoc()).queued || 0;
}

// ── activity ────────────────────────────────────────────────────────────────────

async function pushActivity({ emailId, message, type }) {
  const seq = await claimSeq('activitySeq');
  const id = `ACT-${pad(seq)}`;
  const entry = { id, seq, emailId, message, type, timestamp: stamp() };
  // keep history bounded: trim to HISTORY_LIMIT + a margin
  await activityCol().doc(id).set(entry);
  const count = await countDocs(activityCol());
  if (count > HISTORY_LIMIT + 10) {
    await trimOldest(activityCol(), count - HISTORY_LIMIT);
  }
  return entry;
}

async function listActivity() {
  const snap = await activityCol().orderBy('seq', 'desc').limit(HISTORY_LIMIT).get();
  return snap.docs.map((d) => d.data());
}

// ── emails ──────────────────────────────────────────────────────────────────────

async function makeEmail({ recipient, subject, message, senderName }, retryLimit) {
  const seq = await claimSeq('emailSeq');
  const id = `EML-${pad(seq)}`;
  const now = stamp();
  return {
    id,
    seq,
    recipient,
    subject,
    message,
    senderName: senderName || null,
    status: 'QUEUED',
    attempts: 0,
    retries: 0,
    retryLimit,
    createdAt: now,
    updatedAt: now,
    finalStatus: null,
    socketErr: null,
    smtp: null,
    logs: [],
  };
}

async function enqueue({ recipient, subject, message, senderName }, retryLimit = 3) {
  const email = await makeEmail({ recipient, subject, message, senderName: senderName || '' }, retryLimit);
  await emailsCol().doc(email.id).set(email);
  await bumpStats({ total: 1, queued: 1 });
  const position = await queuedCount();
  await pushActivity({
    emailId: email.id,
    message: `${email.id} queued for delivery (position ${position})`,
    type: 'info',
  });
  return { email, position };
}

async function listEmails() {
  const snap = await emailsCol().orderBy('seq', 'asc').get();
  return snap.docs.map((d) => d.data());
}

async function getEmail(id) {
  const snap = await emailsCol().doc(id).get();
  return snap.exists ? snap.data() : null;
}

async function hasQueued() {
  return (await readStatsDoc()).queued > 0;
}

async function nextQueued() {
  const snap = await emailsCol().where('status', '==', 'QUEUED').orderBy('seq', 'asc').limit(1).get();
  return snap.empty ? null : snap.docs[0].data();
}

/** Transition an email to a new status, maintaining the stats counters. */
async function moveStatus(id, toStatus, payload = {}, sideDeltas = {}) {
  const ref = emailsCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const prev = snap.data();

  const delta = {};
  const fromKey = STATUS_KEY[prev.status];
  const toKey = STATUS_KEY[toStatus];
  if (fromKey && toKey && fromKey !== toKey) {
    delta[fromKey] = -1;
    delta[toKey] = 1;
  }

  const merged = {
    ...prev,
    ...payload,
    status: toStatus,
    updatedAt: stamp(),
  };
  await ref.set(merged, { merge: true });
  await bumpStats({ ...delta, ...sideDeltas });
  return merged;
}

async function markSending(id, attempt = 1) {
  const email = await moveStatus(id, 'SENDING');
  if (!email) return null;
  await setCurrentProcessingId(id);
  await pushActivity({
    emailId: id,
    message: `${id} — dispatch started (attempt ${attempt} of ${email.retryLimit + 1})`,
    type: 'info',
  });
  return email;
}

/**
 * Return an in-flight email (SENDING/RETRYING) to the queue.
 * Used when a dispatch pass is interrupted by pause/stop so the email is
 * never stranded off-queue (nextQueued() would never find it again).
 */
async function requeueInFlight(id) {
  const email = await getEmail(id);
  if (!email || (email.status !== 'SENDING' && email.status !== 'RETRYING')) return null;
  const requeued = await moveStatus(id, 'QUEUED');
  if (requeued) {
    await setCurrentProcessingId(null);
    await pushActivity({
      emailId: id,
      message: `${id} — requeued (dispatch interrupted mid-flight)`,
      type: 'warning',
    });
  }
  return requeued;
}

async function logAttempt(id, attempt, result, detail) {
  const email = await getEmail(id);
  if (!email) return;
  const logs = Array.isArray(email.logs) ? email.logs : [];
  logs.push({ attempt, result, detail, timestamp: stamp() });
  await emailsCol().doc(id).set({ logs }, { merge: true });
  await pushActivity({
    emailId: id,
    message: `${id} — Attempt ${attempt}: ${result}${detail ? ` (${detail})` : ''}`,
    type: result === 'SUCCESS' ? 'success' : 'failure',
  });
}

async function markRetrying(id, attempt) {
  const email = await moveStatus(id, 'RETRYING', { attempts: attempt, retries: attempt - 1, finalStatus: null });
  if (email) {
    await pushActivity({
      emailId: id,
      message: `${id} — delivery failed, retrying (attempt ${attempt + 1})`,
      type: 'retry',
    });
  }
  return email;
}

async function markDelivered(id, attempt, smtpInfo) {
  const email = await moveStatus(id, 'DELIVERED', {
    attempts: attempt,
    retries: attempt - 1,
    finalStatus: 'DELIVERED',
    smtp: smtpInfo,
    socketErr: null,
  }, { totalAttempts: attempt, totalRetries: attempt - 1 });
  if (email) {
    const accepted = Array.isArray(smtpInfo.accepted) ? smtpInfo.accepted.join(', ') : '';
    await pushActivity({
      emailId: id,
      message: `${id} — DELIVERED (accepted by mail server${accepted ? ` · ${accepted}` : ''})`,
      type: 'success',
    });
  }
  return email;
}

async function markFailed(id, attempt, detail) {
  const email = await moveStatus(id, 'FAILED', {
    attempts: attempt,
    retries: attempt - 1,
    finalStatus: 'FAILED',
    socketErr: detail || null,
  }, { totalAttempts: attempt, totalRetries: attempt - 1 });
  if (email) {
    await pushActivity({
      emailId: id,
      message: `${id} — FAILED (${detail || 'could not be sent'})`,
      type: 'failure',
    });
  }
  return email;
}

async function removeEmail(id) {
  const snap = await emailsCol().doc(id).get();
  if (!snap.exists) return null;
  const removed = snap.data();
  const delta = { total: -1, totalAttempts: -(removed.attempts || 0), totalRetries: -(removed.retries || 0) };
  const key = STATUS_KEY[removed.status];
  if (key) delta[key] = -1;
  await emailsCol().doc(id).delete();
  await bumpStats(delta);
  await pushActivity({ emailId: removed.id, message: `${removed.id} removed from queue`, type: 'warning' });
  return removed;
}

// ── reset ───────────────────────────────────────────────────────────────────────

async function deleteCollection(name) {
  if (typeof db.recursiveDelete === 'function') {
    await db.recursiveDelete(db.collection(name));
    return;
  }
  for (;;) {
    const snap = await db.collection(name).limit(200).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function resetQueue() {
  await setDispatchRunning(false, false);
  await setCurrentProcessingId(null);
  await deleteCollection('emails');
  await deleteCollection('activity');
  await statsDoc().set(emptyStatsDoc());
  await setMeta({ emailSeq: 0, activitySeq: 0 });
  return getStats();
}

// ── helpers ─────────────────────────────────────────────────────────────────────

async function countDocs(coll) {
  const snap = await coll.limit(400).get();
  return snap.size;
}

async function trimOldest(coll, extra) {
  // order explicitly by seq: activity IDs pad to 3 digits, so plain doc-ID
  // ordering puts ACT-1000 before ACT-999 and would trim the NEWEST entries
  const snap = await coll.orderBy('seq', 'asc').limit(extra).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

// ── dispatch lease (prevents two invocations sending the same email) ──────────

const LEASE_TTL_MS = 240000;
const leaseDoc = () => db.collection('_meta').doc('dispatchLease');

/** Claim the right to run a dispatch pass. False if another live pass holds it. */
async function claimDispatchLease(owner, ttlMs = LEASE_TTL_MS) {
  const ref = leaseDoc();
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const lease = snap.exists ? snap.data() : {};
    const now = Date.now();
    if (lease.owner && lease.owner !== owner && Number(lease.until || 0) > now) return false;
    t.set(ref, { owner, until: now + ttlMs, updatedAt: stamp() });
    return true;
  });
}

/** Extend a lease we hold. Returns false if it was lost. */
async function renewDispatchLease(owner, ttlMs = LEASE_TTL_MS) {
  const ref = leaseDoc();
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const lease = snap.exists ? snap.data() : {};
    if (lease.owner !== owner) return false;
    const now = Date.now();
    t.set(ref, { owner, until: now + ttlMs, updatedAt: stamp() });
    return true;
  });
}

/** Release a lease we hold (no-op if it already expired / was taken over). */
async function releaseDispatchLease(owner) {
  const ref = leaseDoc();
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const lease = snap.exists ? snap.data() : {};
    if (lease.owner !== owner) return;
    t.set(ref, { owner: null, until: 0, updatedAt: stamp() });
  });
}

module.exports = {
  db,
  getMeta,
  setMeta,
  getDispatcherState,
  setDispatchRunning,
  setCurrentProcessingId,
  getStats,
  readStatsDoc,
  queuedCount,
  pushActivity,
  listActivity,
  enqueue,
  listEmails,
  getEmail,
  hasQueued,
  nextQueued,
  markSending,
  requeueInFlight,
  logAttempt,
  markRetrying,
  markDelivered,
  markFailed,
  removeEmail,
  resetQueue,
  claimDispatchLease,
  renewDispatchLease,
  releaseDispatchLease,
};