'use strict';

/**
 * Shared Firestore data-access layer.
 *
 * This module owns *how* data is stored (collections, documents, counters,
 * sequence generators, the dispatch lease). It deliberately contains no
 * business rules — those live in the per-module services:
 *
 *   module-1-email-queue-creator  → creating and managing queued emails
 *   module-2-send-simulator       → deciding whether a delivery attempt succeeds
 *   module-3-retry-logic          → the attempt/retry loop and the dispatcher lifecycle
 *   module-4-final-status-logger  → attempt history, activity log, status transitions
 *   module-5-summary-exporter     → aggregate statistics for the dashboard
 *
 * Every mutation here lands in the documents the dashboard subscribes to
 * (emails, activity, stats, _meta, _config) so the UI stays live.
 */

const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

/** Collection / document names shared by every module. */
const collections = {
  emails: 'emails',
  activity: 'activity',
  stats: 'stats',
  meta: '_meta',
  config: '_config',
  secrets: '_secrets',
};

/** How many activity entries are kept before the oldest are trimmed. */
const HISTORY_LIMIT = 250;

/** Dispatch lease lifetime (ms). A pass renews it while it works. */
const LEASE_TTL_MS = 240000;

const DEFAULT_DISPATCH = { running: false, paused: false };

const DEFAULT_META = {
  emailSeq: 0,
  activitySeq: 0,
  dispatch: DEFAULT_DISPATCH,
  currentProcessingId: null,
};

// ── refs ────────────────────────────────────────────────────────────────────────

const emailsCol = () => db.collection(collections.emails);
const activityCol = () => db.collection(collections.activity);
const statsDoc = () => db.collection(collections.stats).doc('main');
const metaDoc = () => db.collection(collections.meta).doc('main');
const leaseDoc = () => db.collection(collections.meta).doc('dispatchLease');

// ── helpers ─────────────────────────────────────────────────────────────────────

/** ISO-8601 timestamp used for every `createdAt` / `updatedAt` field. */
function stamp() {
  return new Date().toISOString();
}

/** Zero-pad a number, e.g. 42 → "042" (used for EML-001 / ACT-001 ids). */
function pad(n, width = 3) {
  return String(n).padStart(width, '0');
}

// ── meta / dispatcher state ─────────────────────────────────────────────────────

/**
 * Read `_meta/main`.
 *
 * The returned object is always normalised: `dispatch` is guaranteed to exist
 * and carry both flags, even when the document was created by a sequence
 * counter that did not write the dispatcher state. Callers rely on this
 * instead of re-checking for undefined.
 */
async function getMeta() {
  const snap = await metaDoc().get();
  const data = snap.exists ? snap.data() : {};
  return {
    ...DEFAULT_META,
    ...data,
    dispatch: { ...DEFAULT_DISPATCH, ...(data.dispatch || {}) },
  };
}

/** Merge a patch into `_meta/main`. */
async function setMeta(patch) {
  await metaDoc().set(patch, { merge: true });
}

/** Current dispatcher flags: `{ running, paused }`. */
async function getDispatcherState() {
  return (await getMeta()).dispatch;
}

/** Persist the dispatcher flags. */
async function setDispatchRunning(running, paused) {
  const meta = await getMeta();
  const dispatch = { ...(meta.dispatch || {}), running, paused };
  await setMeta({ dispatch });
  return dispatch;
}

/** Remember which email is currently being dispatched. */
async function setCurrentProcessingId(id) {
  await setMeta({ currentProcessingId: id || null });
}

/**
 * Atomically reserve the next value of a monotonic counter (`emailSeq`,
 * `activitySeq`). Guarantees unique ids even with concurrent writers.
 */
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

// ── statistics counters ─────────────────────────────────────────────────────────

/** A zeroed statistics document. */
function emptyStatsDoc() {
  return {
    total: 0, queued: 0, sending: 0, retrying: 0, delivered: 0, failed: 0,
    totalAttempts: 0, totalRetries: 0, updatedAt: stamp(),
  };
}

/** Apply a delta to the statistics counters (negative values decrement). */
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

/** Raw statistics document as stored. */
async function readStatsDoc() {
  const snap = await statsDoc().get();
  return snap.exists ? snap.data() : emptyStatsDoc();
}

// ── document housekeeping ───────────────────────────────────────────────────────

/** Number of documents in a collection (capped at 400 for cheap counting). */
async function countDocs(coll) {
  const snap = await coll.limit(400).get();
  return snap.size;
}

/**
 * Delete the oldest `extra` documents of a collection.
 * Ordered explicitly by `seq`: activity ids pad to 3 digits, so plain
 * document-id ordering would place ACT-1000 before ACT-999 and trim the
 * newest entries instead of the oldest.
 */
async function trimOldest(coll, extra) {
  const snap = await coll.orderBy('seq', 'asc').limit(extra).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

/** Delete every document of a collection. */
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

// ── dispatch lease ──────────────────────────────────────────────────────────────
//
// Only one dispatcher invocation may run at a time. Without the lease two
// browser tabs could send the same email twice.

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

/**
 * Drop the lease entirely.
 *
 * Used by the reset flow: a lease left behind by a killed invocation would
 * otherwise block the next dispatch pass until it expires.
 */
async function clearDispatchLease() {
  await leaseDoc().set({ owner: null, until: 0, updatedAt: stamp() }, { merge: true });
}

module.exports = {
  db,
  collections,
  HISTORY_LIMIT,
  LEASE_TTL_MS,
  stamp,
  pad,
  emailsCol,
  activityCol,
  statsDoc,
  metaDoc,
  leaseDoc,
  getMeta,
  setMeta,
  getDispatcherState,
  setDispatchRunning,
  setCurrentProcessingId,
  claimSeq,
  emptyStatsDoc,
  bumpStats,
  readStatsDoc,
  countDocs,
  trimOldest,
  deleteCollection,
  claimDispatchLease,
  renewDispatchLease,
  releaseDispatchLease,
  clearDispatchLease,
};
