'use strict';

/**
 * Module 2 — Send Simulator
 * ==========================
 *
 * Determines whether an email delivery attempt succeeds or fails (PRD §6).
 *
 * Two transports are supported:
 *
 *   • **Real SMTP** (Nodemailer) — talks to an actual mail server. The
 *     server's response decides the outcome: a resolved promise is a
 *     `250 OK` acceptance, a rejected one is a refusal.
 *
 *   • **Simulator** — used when dry-run mode is enabled. It produces the same
 *     result shape without touching the network, and honours the three
 *     simulation modes from the PRD:
 *
 *       `AUTOMATIC`     — pseudo-random success/failure (good for demos)
 *       `FORCE_SUCCESS` — every attempt succeeds
 *       `FORCE_FAILURE` — every attempt fails (demonstrates the retry engine)
 *
 * The real SMTP path is never replaced by the simulator — dry-run is an
 * explicit, user-selected mode.
 */

const nodemailer = require('nodemailer');

/** The simulation modes the dashboard can choose from. */
const SIMULATION_MODES = ['AUTOMATIC', 'FORCE_SUCCESS', 'FORCE_FAILURE'];

/** Probability of success in `AUTOMATIC` mode. */
const AUTOMATIC_SUCCESS_RATE = 0.6;

let transport = null;
let transportSignature = '';

/** Normalise an arbitrary value into a known simulation mode. */
function normalizeSimulationMode(mode) {
  const value = String(mode || '').trim().toUpperCase();
  return SIMULATION_MODES.includes(value) ? value : 'AUTOMATIC';
}

/**
 * Identity of the current transport configuration.
 * A changed signature forces a fresh transport (new host / port / user / mode).
 */
function signature(config) {
  if (config.dryRun) return `dry-run:${normalizeSimulationMode(config.simulationMode)}`;
  return `${config.smtp.host}:${config.smtp.port}:${config.smtp.user}`;
}

/** Decides the outcome of a single simulated attempt. */
function simulateOutcome(mode) {
  switch (normalizeSimulationMode(mode)) {
    case 'FORCE_SUCCESS':
      return true;
    case 'FORCE_FAILURE':
      return false;
    case 'AUTOMATIC':
    default:
      return Math.random() < AUTOMATIC_SUCCESS_RATE;
  }
}

/**
 * A transport that simulates a mail server.
 * Successful attempts resolve with a `250 OK` response; failed attempts
 * reject with an error shaped like a real SMTP refusal.
 */
function makeDryRunner(simulationMode) {
  const mode = normalizeSimulationMode(simulationMode);
  let seq = 0;
  return {
    async verify() {
      return true;
    },
    async sendMail(mail) {
      seq++;
      const to = mail.to ? String(mail.to) : '';
      if (!simulateOutcome(mode)) {
        const error = new Error(`550 5.1.1 Recipient address rejected: ${to}`);
        error.code = 'EENVELOPE';
        error.responseCode = 550;
        error.response = `550 5.1.1 Recipient address rejected: ${to}`;
        error.command = 'RCPT';
        throw error;
      }
      const id = `dry-${Date.now().toString(36)}-${seq}`;
      return {
        accepted: [to],
        rejected: [],
        messageId: `<${id}@dryrun.local>`,
        response: `250 2.0.0 OK dry-run delivered to ${to}`,
      };
    },
    close() {},
  };
}

/**
 * Return the transport for the current configuration, creating it if needed.
 * @param {object} config resolved runtime configuration
 */
function getTransport(config) {
  const sig = signature(config);
  if (transport && transportSignature === sig) return transport;

  if (config.dryRun) {
    transport = makeDryRunner(config.simulationMode);
  } else {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.pass ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      // bound each attempt so one hung socket can't consume the whole pass budget
      connectionTimeout: 30000,
      greetingTimeout: 20000,
      socketTimeout: 60000,
    });
  }
  transportSignature = sig;
  return transport;
}

/** Close and forget the cached transport (used after a config change). */
function resetTransport() {
  if (transport) {
    try {
      if (typeof transport.close === 'function') transport.close();
    } catch {
      // ignore
    }
  }
  transport = null;
  transportSignature = '';
}

/**
 * Verify that the mail server accepts our credentials.
 * In dry-run mode this always succeeds — no connection is attempted.
 */
async function verifyConnection(config) {
  if (config.dryRun) {
    return { ok: true, mode: 'dry-run', note: `Dry-run mode — no SMTP used (${normalizeSimulationMode(config.simulationMode)})` };
  }
  if (!(config.smtp.host && config.smtp.user && config.smtp.pass)) {
    return { ok: false, error: 'SMTP not configured. Host, user and password are required.' };
  }
  try {
    const t = getTransport(config);
    await t.verify();
    return { ok: true, mode: 'smtp', note: `Connected to ${config.smtp.host}:${config.smtp.port} (${config.smtp.user})` };
  } catch (err) {
    return { ok: false, mode: 'smtp', error: humanError(err) };
  }
}

/**
 * Perform one delivery attempt.
 * @returns the Nodemailer `sentMessage` info object
 */
async function sendSingleMail(config, { recipient, subject, message, senderName }) {
  const fromAddress = config.smtp.fromEmail || config.smtp.user;
  const fromName = config.smtp.fromName || senderName || 'Email Dispatcher';

  const mail = {
    from: { name: fromName, address: fromAddress },
    to: recipient,
    subject,
    text: message,
    html: wrapHtml(subject, message, senderName),
  };

  const t = getTransport(config);
  return t.sendMail(mail);
}

/** Turn any thrown value into a short, human-readable message. */
function humanError(err) {
  if (!err) return 'Unknown SMTP error';
  let message = err.message || String(err);
  if (err.code) message = `[${err.code}] ${message}`;
  if (err.response && typeof err.response === 'string') {
    message += ` ${err.response.trim().slice(0, 200)}`;
  }
  return message.slice(0, 400);
}

/** Build the HTML body of a message. */
function wrapHtml(subject, message, senderName) {
  const safeText = escapeHtml(message);
  const safeSubject = escapeHtml(subject);
  const sender = escapeHtml(senderName || 'Email Dispatcher');
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0"
          style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#0f172a;padding:16px 24px;">
              <span style="color:#60a5fa;font-weight:700;font-size:15px;">✉ ${sender}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px;">
              <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">${safeSubject}</h2>
              <div style="color:#334155;font-size:15px;line-height:1.6;white-space:pre-wrap;">${safeText}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <span style="color:#64748b;font-size:12px;">Sent by the Email Queue Dispatcher.</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Escape the characters that would break out of HTML text. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  SIMULATION_MODES,
  AUTOMATIC_SUCCESS_RATE,
  normalizeSimulationMode,
  simulateOutcome,
  makeDryRunner,
  getTransport,
  resetTransport,
  verifyConnection,
  sendSingleMail,
  humanError,
  wrapHtml,
  escapeHtml,
};
