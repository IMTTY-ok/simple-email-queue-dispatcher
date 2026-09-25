import type { Email, Stats } from '../types/email';

/**
 * Export all emails as a CSV string (real SMTP dispatch report)
 */
export function exportCSV(emails: Email[]): string {
  const headers = [
    'Email ID',
    'Recipient',
    'Subject',
    'Sender Name',
    'Status',
    'Attempts',
    'Retries',
    'Final Status',
    'SMTP Response',
    'Error Detail',
    'Created At',
    'Updated At',
    'Attempt Logs',
  ];

  const rows = emails.map((email) => {
    const logSummary = email.logs
      .map((l) => `Attempt ${l.attempt}: ${l.result}${l.detail ? ` (${l.detail})` : ''}`)
      .join(' | ');

    return [
      email.id,
      email.recipient,
      `"${email.subject.replace(/"/g, '""')}"`,
      email.senderName || '',
      email.status,
      email.attempts,
      email.retries,
      email.finalStatus || 'N/A',
      `"${(email.smtp?.response || '').replace(/"/g, '""')}"`,
      `"${(email.socketErr || '').replace(/"/g, '""')}"`,
      email.createdAt,
      email.updatedAt,
      `"${logSummary.replace(/"/g, '""')}"`,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Export emails and stats as JSON
 */
export function exportJSON(emails: Email[], stats: Stats): string {
  const data = {
    exportedAt: new Date().toISOString(),
    summary: {
      totalEmails: stats.total,
      delivered: stats.delivered,
      failed: stats.failed,
      queued: stats.queued,
      sending: stats.sending,
      retrying: stats.retrying,
      totalAttempts: stats.totalAttempts,
      totalRetries: stats.totalRetries,
      successRate: `${stats.successRate}%`,
      failureRate: `${stats.failureRate}%`,
    },
    emails,
  };
  return JSON.stringify(data, null, 2);
}

/**
 * Download a string as a file in the browser
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Trigger CSV download
 */
export function downloadCSV(emails: Email[]): void {
  const csv = exportCSV(emails);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadFile(csv, `email-dispatch-report-${timestamp}.csv`, 'text/csv');
}

/**
 * Trigger JSON download
 */
export function downloadJSON(emails: Email[], stats: Stats): void {
  const json = exportJSON(emails, stats);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadFile(json, `email-dispatch-report-${timestamp}.json`, 'application/json');
}