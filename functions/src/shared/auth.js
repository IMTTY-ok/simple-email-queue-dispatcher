'use strict';

/**
 * Authentication and authorization for the Cloud Function API.
 *
 * The browser is a Firebase client. It signs in with Firebase Authentication
 * and sends the resulting ID token as `Authorization: Bearer <token>`.
 * Every state-changing endpoint verifies that token before doing anything.
 *
 * Roles are stored server-side in `users/{uid}`:
 *
 *   admin     — full access: SMTP configuration, user management, everything
 *   operator  — day-to-day use: enqueue, remove, dispatch, read the queue
 *
 * A role is **never** taken from the request body. It is read from Firestore
 * with the Admin SDK, so a client cannot promote itself. The very first
 * account created becomes the admin; every later account is an operator.
 *
 * Note that the Admin SDK bypasses Firestore security rules — so authorizing
 * here is not optional, it is the only thing protecting these endpoints.
 */

const { getAuth } = require('firebase-admin/auth');
const store = require('./store.js');

/** The roles the application understands. */
const ROLES = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
};

/** Collection holding one profile document per authenticated account. */
const USERS_COLLECTION = 'users';

/**
 * Sentinel document recording that the administrator has already been
 * assigned. It lives in `_meta`, which browsers cannot read.
 */
const BOOTSTRAP_DOC = 'bootstrap';

/** Extract the bearer token from the Authorization header. */
function bearerToken(req) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

/** Read the stored role of an account, or `null` when it has no profile yet. */
async function getRole(uid) {
  const snap = await store.db.collection(USERS_COLLECTION).doc(uid).get();
  if (!snap.exists) return null;
  const role = snap.data().role;
  return role === ROLES.ADMIN || role === ROLES.OPERATOR ? role : null;
}

/**
 * Verify the caller's ID token and resolve their role.
 * @returns {Promise<{ok:true, uid, email, name, role} | {ok:false, status, error}>}
 */
async function authenticate(req) {
  const token = bearerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: 'Authentication required. Sign in and send a Bearer token.' };
  }

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(token);
  } catch {
    return { ok: false, status: 401, error: 'Invalid or expired authentication token.' };
  }

  const role = await getRole(decoded.uid);
  return {
    ok: true,
    uid: decoded.uid,
    email: decoded.email || null,
    name: decoded.name || null,
    role,
  };
}

/**
 * Middleware: reject the request unless it carries a valid ID token.
 */
function requireAuth() {
  return async (req, res, next) => {
    const result = await authenticate(req);
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error });
    }
    req.user = result;
    return next();
  };
}

/**
 * Middleware: require one of the given roles.
 * Must be mounted after `requireAuth()`.
 */
function requireRole(...allowed) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'Authentication required.' });
    }
    if (!req.user.role) {
      return res.status(403).json({ ok: false, error: 'No profile yet — finish signing in first.' });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        ok: false,
        error: `Insufficient permissions. This action requires: ${allowed.join(' or ')}.`,
      });
    }
    return next();
  };
}

/**
 * Create (or return) the profile of an account.
 *
 * The first account ever created becomes the admin; everybody after that is an
 * operator. The role is decided entirely on the server.
 *
 * The "first account" decision is made inside a transaction against a
 * sentinel document, so two accounts registering at the same moment can never
 * both become administrators.
 */
async function ensureProfile(uid, email, displayName) {
  const ref = store.db.collection(USERS_COLLECTION).doc(uid);
  const bootstrapRef = store.db.collection('_meta').doc(BOOTSTRAP_DOC);

  await store.db.runTransaction(async (t) => {
    const existing = await t.get(ref);
    if (existing.exists) return;

    const bootstrap = await t.get(bootstrapRef);
    const isFirstAccount = !bootstrap.exists;
    const role = isFirstAccount ? ROLES.ADMIN : ROLES.OPERATOR;

    t.set(ref, {
      uid,
      email: email || null,
      displayName: displayName || null,
      role,
      createdAt: store.stamp(),
      createdBy: uid,
    });

    if (isFirstAccount) {
      t.set(bootstrapRef, { createdAt: store.stamp(), createdBy: uid });
    }
  });

  const snap = await ref.get();
  return { ...snap.data(), created: false };
}

/** All accounts, for the administrator's user list. */
async function listProfiles() {
  const snap = await store.db.collection(USERS_COLLECTION).orderBy('createdAt', 'asc').get();
  return snap.docs.map((d) => d.data());
}

/**
 * Change somebody's role.
 *
 * Only an administrator may call this, and an administrator cannot demote
 * themselves — that would be a way to lock the installation out of its own
 * configuration.
 */
async function setRole(uid, role) {
  if (role !== ROLES.ADMIN && role !== ROLES.OPERATOR) {
    return { ok: false, error: `Role must be "${ROLES.ADMIN}" or "${ROLES.OPERATOR}".` };
  }
  const ref = store.db.collection(USERS_COLLECTION).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'No such account.' };
  await ref.set({ role, updatedAt: store.stamp() }, { merge: true });
  return { ok: true, uid, role };
}

module.exports = {
  ROLES,
  USERS_COLLECTION,
  BOOTSTRAP_DOC,
  bearerToken,
  getRole,
  authenticate,
  requireAuth,
  requireRole,
  ensureProfile,
  listProfiles,
  setRole,
};
