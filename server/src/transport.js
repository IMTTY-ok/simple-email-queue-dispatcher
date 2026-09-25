import nodemailer from 'nodemailer';
import config, { smtpConfigured } from './config.js';

let transport = null;
let transportSignature = '';

function signature() {
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

/** Get (or lazily create) the transport matching the current config. */
export function getTransport() {
  const sig = signature();
  if (transport && transportSignature === sig) return transport;

  if (config.dryRun) {
    transport = makeDryRunner();
  } else {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.pass ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  transportSignature = sig;
  return transport;
}

/** Drop the cached transport so a new config takes effect immediately. */
export function resetTransport() {
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
 * Verify the SMTP connection works (auth + server reachable).
 */
export async function verifyConnection() {
  if (!smtpConfigured()) {
    if (config.dryRun) return { ok: true, mode: 'dry-run', note: 'Dry-run mode — no SMTP used' };
    return { ok: false, error: 'SMTP not configured. Host, user and password are required.' };
  }
  try {
    const t = getTransport();
    await t.verify();
    return { ok: true, mode: 'smtp', note: `Connected to ${config.smtp.host}:${config.smtp.port} (${config.smtp.user})` };
  } catch (err) {
    return { ok: false, mode: 'smtp', error: humanError(err) };
  }
}

/**
 * Send one real email.
 * Resolves when the SMTP server ACCEPTS the message.
 * Rejects when the server refuses it (bad recipient, auth failure, host down, ...).
 */
export async function sendSingleMail({ recipient, subject, message, senderName }) {
  const fromAddress = config.smtp.fromEmail || config.smtp.user;
  const fromName = config.smtp.fromName || senderName || 'Email Dispatcher';

  const mail = {
    from: { name: fromName, address: fromAddress },
    to: recipient,
    subject,
    text: message,
    html: wrapHtml(subject, message, senderName),
  };

  const transport = getTransport();
  const info = await transport.sendMail(mail);
  return info;
}

/** Short, human-friendly version of a Nodemailer/SMTP error. */
export function humanError(err) {
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
              <span style="color:#64748b;font-size:12px;">Sent by the Email Queue Dispatcher — real SMTP delivery simulation.</span>
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