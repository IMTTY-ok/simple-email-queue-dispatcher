'use strict';

/**
 * Gmail SMTP transport via Nodemailer.
 * Ported from the old Express server — same Gmail SMTP behaviour, dry-run stub,
 * retry-friendly errors and HTML template.
 */

const nodemailer = require('nodemailer');

let transport = null;
let transportSignature = '';

function signature(config) {
  if (config.dryRun) return 'dry-run';
  return `${config.smtp.host}:${config.smtp.port}:${config.smtp.user}`;
}

function makeDryRunner() {
  let seq = 0;
  return {
    async verify() {
      return true;
    },
    async sendMail(mail) {
      seq++;
      const to = mail.to ? String(mail.to) : '';
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

function getTransport(config) {
  const sig = signature(config);
  if (transport && transportSignature === sig) return transport;

  if (config.dryRun) {
    transport = makeDryRunner();
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

async function verifyConnection(config) {
  if (config.dryRun) return { ok: true, mode: 'dry-run', note: 'Dry-run mode — no SMTP used' };
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
  const info = await t.sendMail(mail);
  return info;
}

function humanError(err) {
  if (!err) return 'Unknown SMTP error';
  let message = err.message || String(err);
  if (err.code) message = `[${err.code}] ${message}`;
  if (err.response && typeof err.response === 'string') {
    message += ` ${err.response.trim().slice(0, 200)}`;
  }
  return message.slice(0, 400);
}

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
              <span style="color:#64748b;font-size:12px;">Sent by the Email Queue Dispatcher — Gmail SMTP delivery.</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  verifyConnection,
  sendSingleMail,
  resetTransport,
  humanError,
};