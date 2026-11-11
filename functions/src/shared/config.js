'use strict';

/**
 * Runtime configuration for the dispatcher.
 *
 * Layered source of truth:
 *   1. process.env (defaults / Firebase secrets)
 *   2. Firestore `_config/main`  (dashboard-editable, non-secret fields)
 *   3. Firestore `_secrets/main` (dashboard-set SMTP password — rules-denied
 *      for browsers)
 *
 * The SMTP password is NEVER stored in a public read, never returned to the
 * client, and never committed to the repo. Only the boolean `hasPassword` is
 * exposed.
 */

const { collections } = require('../shared/store.js');
const { normalizeSimulationMode, SIMULATION_MODES } = require('../modules/module-2-send-simulator/simulator.js');

/** Parse a boolean-ish environment value. */
function toBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true' || value === '1';
}

/** Parse an integer and clamp it into `[min, max]`. */
function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/** Environment defaults for the function. */
const ENV_DEFAULTS = {
  smtp: {
    host: String(process.env.SMTP_HOST || ''),
    port: clampInt(process.env.SMTP_PORT, 587, 1, 65535),
    secure: toBool(process.env.SMTP_SECURE, false),
    user: String(process.env.SMTP_USER || ''),
    fromName: String(process.env.FROM_NAME || 'Email Dispatcher'),
    fromEmail: String(process.env.FROM_EMAIL || process.env.SMTP_USER || ''),
  },
  retryLimit: clampInt(process.env.RETRY_LIMIT, 3, 0, 10),
  retryDelayMs: clampInt(process.env.RETRY_DELAY_MS, 3000, 100, 60000),
  interEmailDelayMs: clampInt(process.env.INTER_EMAIL_DELAY_MS, 1200, 50, 60000),
  dryRun: toBool(process.env.SMTP_DRYRUN, false),
  simulationMode: normalizeSimulationMode(process.env.SIMULATION_MODE),
  envPassword: String(process.env.SMTP_PASS || ''),
};

/** Compose the effective runtime config for this invocation. */
async function resolveConfig(db) {
  const conf = JSON.parse(JSON.stringify(ENV_DEFAULTS));

  const [cfgSnap, secSnap] = await Promise.all([
    db.collection(collections.config).doc('main').get(),
    db.collection(collections.secrets).doc('main').get(),
  ]);

  const stored = cfgSnap.exists ? cfgSnap.data() : {};
  const smtp = stored.smtp && typeof stored.smtp === 'object' ? stored.smtp : {};

  if (typeof smtp.host === 'string' && smtp.host !== '') conf.smtp.host = smtp.host;
  if (smtp.port !== undefined) conf.smtp.port = clampInt(smtp.port, 587, 1, 65535);
  if (typeof smtp.secure === 'boolean') conf.smtp.secure = smtp.secure;
  if (typeof smtp.user === 'string' && smtp.user !== '') conf.smtp.user = smtp.user;
  if (typeof smtp.fromName === 'string' && smtp.fromName !== '') conf.smtp.fromName = smtp.fromName;
  if (typeof smtp.fromEmail === 'string' && smtp.fromEmail !== '') conf.smtp.fromEmail = smtp.fromEmail;

  if (typeof stored.dryRun === 'boolean') conf.dryRun = stored.dryRun;
  if (stored.simulationMode !== undefined) {
    conf.simulationMode = normalizeSimulationMode(stored.simulationMode);
  }
  if (stored.retryLimit !== undefined) conf.retryLimit = clampInt(stored.retryLimit, 3, 0, 10);
  if (stored.retryDelayMs !== undefined) conf.retryDelayMs = clampInt(stored.retryDelayMs, 3000, 100, 60000);
  if (stored.interEmailDelayMs !== undefined) conf.interEmailDelayMs = clampInt(stored.interEmailDelayMs, 1200, 50, 60000);

  // stored dashboard password wins over the env/secret fallback
  const storedPass = secSnap.exists && typeof secSnap.data().smtpPass === 'string' ? secSnap.data().smtpPass : '';
  conf.smtp.pass = storedPass || conf.envPassword || '';

  return conf;
}

/**
 * Apply a dashboard config patch.
 *
 * Non-secret fields land in `_config/main`; a supplied password lands in
 * `_secrets/main` (unreadable by browser clients).
 * Returns the list of changed field names.
 */
async function applyConfigAsync(db, partial = {}) {
  const changed = [];
  const cfgRef = db.collection(collections.config).doc('main');
  const secRef = db.collection(collections.secrets).doc('main');

  const smtp = partial.smtp && typeof partial.smtp === 'object' ? partial.smtp : {};

  const cfg = {};
  if (typeof smtp.host === 'string') {
    cfg.smtp = { ...(cfg.smtp || {}) };
    const value = smtp.host.trim();
    if (value !== '') { cfg.smtp.host = value; changed.push('smtp.host'); }
  }
  if (smtp.port !== undefined) {
    cfg.smtp = { ...(cfg.smtp || {}), port: clampInt(smtp.port, 587, 1, 65535) };
    changed.push('smtp.port');
  }
  if (typeof smtp.secure === 'boolean') {
    cfg.smtp = { ...(cfg.smtp || {}), secure: smtp.secure };
    changed.push('smtp.secure');
  }
  if (typeof smtp.user === 'string') {
    cfg.smtp = { ...(cfg.smtp || {}) };
    const value = smtp.user.trim();
    if (value !== '') { cfg.smtp.user = value; changed.push('smtp.user'); }
  }
  if (typeof smtp.fromName === 'string') {
    cfg.smtp = { ...(cfg.smtp || {}) };
    const value = smtp.fromName.trim();
    if (value !== '') { cfg.smtp.fromName = value; changed.push('smtp.fromName'); }
  }
  if (typeof smtp.fromEmail === 'string') {
    cfg.smtp = { ...(cfg.smtp || {}) };
    const value = smtp.fromEmail.trim();
    if (value !== '') { cfg.smtp.fromEmail = value; changed.push('smtp.fromEmail'); }
  }

  if (typeof partial.dryRun === 'boolean') { cfg.dryRun = partial.dryRun; changed.push('dryRun'); }
  if (partial.simulationMode !== undefined) {
    cfg.simulationMode = normalizeSimulationMode(partial.simulationMode);
    changed.push('simulationMode');
  }
  if (partial.retryLimit !== undefined) {
    cfg.retryLimit = clampInt(partial.retryLimit, 3, 0, 10);
    changed.push('retryLimit');
  }
  if (partial.retryDelayMs !== undefined) {
    cfg.retryDelayMs = clampInt(partial.retryDelayMs, 3000, 100, 60000);
    changed.push('retryDelayMs');
  }
  if (partial.interEmailDelayMs !== undefined) {
    cfg.interEmailDelayMs = clampInt(partial.interEmailDelayMs, 1200, 50, 60000);
    changed.push('interEmailDelayMs');
  }

  // password → server-side secrets doc (never in a browser-readable document)
  let passwordSaved = false;
  if (typeof smtp.pass === 'string' && smtp.pass !== '') {
    await secRef.set({ smtpPass: smtp.pass }, { merge: true });
    cfg.passwordSet = true;
    passwordSaved = true;
    changed.push('smtp.pass');
  }

  if (Object.keys(cfg).length > 0) {
    await cfgRef.set(cfg, { merge: true });
  }

  const config = await resolveConfig(db);
  return { changed, passwordSaved, config };
}

/** Sanitized public config — never leaks the SMTP password. */
function publicConfig(config) {
  return {
    smtp: {
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      user: config.smtp.user,
      fromName: config.smtp.fromName,
      fromEmail: config.smtp.fromEmail,
    },
    hasPassword: Boolean(config.smtp.pass),
    smtpConfigured: config.dryRun ? true : Boolean(config.smtp.host && config.smtp.user && config.smtp.pass),
    dryRun: config.dryRun,
    simulationMode: config.simulationMode,
    retryLimit: config.retryLimit,
    retryDelayMs: config.retryDelayMs,
    interEmailDelayMs: config.interEmailDelayMs,
  };
}

/** Seed `_config/main` on first read so browser listeners pick up real values. */
async function ensureSeededConfig(db, config) {
  const cfgRef = db.collection(collections.config).doc('main');
  const snap = await cfgRef.get();
  if (!snap.exists) {
    const { host, port, secure, user, fromName, fromEmail } = config.smtp;
    await cfgRef.set({
      smtp: { host, port, secure, user, fromName, fromEmail },
      dryRun: config.dryRun,
      simulationMode: config.simulationMode,
      retryLimit: config.retryLimit,
      retryDelayMs: config.retryDelayMs,
      interEmailDelayMs: config.interEmailDelayMs,
      passwordSet: Boolean(config.smtp.pass),
    });
  }
}

/**
 * Keep the browser-visible `_config.passwordSet` flag in sync with reality so the
 * dashboard redisplays a correct masked/configured state after cold starts.
 */
async function syncPasswordFlag(db, config) {
  const cfgRef = db.collection(collections.config).doc('main');
  if (config.smtp.pass) {
    const snap = await cfgRef.get();
    if (!snap.exists || snap.data().passwordSet !== true) {
      await cfgRef.set({ passwordSet: true }, { merge: true });
    }
  } else {
    const snap = await cfgRef.get();
    if (snap.exists && snap.data().passwordSet === true) {
      await cfgRef.set({ passwordSet: false }, { merge: true });
    }
  }
}

module.exports = {
  SIMULATION_MODES,
  toBool,
  clampInt,
  resolveConfig,
  applyConfigAsync,
  publicConfig,
  syncPasswordFlag,
  ensureSeededConfig,
};
