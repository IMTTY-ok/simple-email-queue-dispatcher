import 'dotenv/config';

const env = process.env;

function toBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true' || value === '1';
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

const config = {
  port: clampInt(env.PORT, 5001, 1, 65535),
  allowedOrigin: env.ALLOWED_ORIGIN || '*',
  smtp: {
    host: String(env.SMTP_HOST || ''),
    port: clampInt(env.SMTP_PORT, 587, 1, 65535),
    secure: toBool(env.SMTP_SECURE, false),
    user: String(env.SMTP_USER || ''),
    pass: String(env.SMTP_PASS || ''),
    fromName: String(env.FROM_NAME || 'Email Dispatcher'),
    fromEmail: String(env.FROM_EMAIL || env.SMTP_USER || ''),
  },
  retryLimit: clampInt(env.RETRY_LIMIT, 3, 0, 10),
  retryDelayMs: clampInt(env.RETRY_DELAY_MS, 3000, 100, 60000),
  interEmailDelayMs: clampInt(env.INTER_EMAIL_DELAY_MS, 1200, 50, 60000),
  dryRun: toBool(env.SMTP_DRYRUN, false),
};

/**
 * Apply a partial config object received from the dashboard settings panel.
 * Returns a list of which fields changed (for the UI to show feedback).
 */
export function applyConfig(partial = {}) {
  const changed = [];

  const smtp = partial.smtp;
  if (smtp && typeof smtp === 'object') {
    if (typeof smtp.host === 'string') {
      config.smtp.host = smtp.host.trim();
      changed.push('smtp.host');
    }
    if (smtp.port !== undefined) {
      config.smtp.port = clampInt(smtp.port, 587, 1, 65535);
      changed.push('smtp.port');
    }
    if (typeof smtp.secure === 'boolean') {
      config.smtp.secure = smtp.secure;
      changed.push('smtp.secure');
    }
    if (typeof smtp.user === 'string') {
      config.smtp.user = smtp.user.trim();
      changed.push('smtp.user');
    }
    // only overwrite password if provided (keeps it from being blanked by an empty save)
    if (typeof smtp.pass === 'string' && smtp.pass !== '') {
      config.smtp.pass = smtp.pass;
      changed.push('smtp.pass');
    }
    if (typeof smtp.fromName === 'string') {
      config.smtp.fromName = smtp.fromName.trim();
      changed.push('smtp.fromName');
    }
    if (typeof smtp.fromEmail === 'string') {
      config.smtp.fromEmail = smtp.fromEmail.trim();
      changed.push('smtp.fromEmail');
    }
  }

  if (typeof partial.dryRun === 'boolean') {
    config.dryRun = partial.dryRun;
    changed.push('dryRun');
  }
  if (partial.retryLimit !== undefined) {
    config.retryLimit = clampInt(partial.retryLimit, 3, 0, 10);
    changed.push('retryLimit');
  }
  if (partial.retryDelayMs !== undefined) {
    config.retryDelayMs = clampInt(partial.retryDelayMs, 3000, 100, 60000);
    changed.push('retryDelayMs');
  }
  if (partial.interEmailDelayMs !== undefined) {
    config.interEmailDelayMs = clampInt(partial.interEmailDelayMs, 1200, 50, 60000);
    changed.push('interEmailDelayMs');
  }

  return changed;
}

/** Sanitized config — never leaks the SMTP password. */
export function publicConfig() {
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
    smtpConfigured: smtpConfigured(),
    dryRun: config.dryRun,
    retryLimit: config.retryLimit,
    retryDelayMs: config.retryDelayMs,
    interEmailDelayMs: config.interEmailDelayMs,
  };
}

export function smtpConfigured() {
  if (config.dryRun) return true;
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
}

export default config;