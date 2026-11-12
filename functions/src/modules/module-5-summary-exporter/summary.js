'use strict';

/**
 * Module 5 — Summary Exporter
 * ============================
 *
 * Produces the summary statistics the dashboard displays and the data behind
 * the exported dispatch report (PRD §9).
 *
 * Summary statistics:
 *   Total Emails · Pending · Processing · Delivered · Failed ·
 *   Total Attempts · Total Retries · Success Rate · Failure Rate
 *
 * The CSV / JSON serialisation itself lives on the client (it downloads a file
 * straight from the browser); the server owns the authoritative numbers.
 */

const store = require('../../shared/store.js');

/**
 * The full statistics shape returned to the dashboard.
 */
async function getStats() {
  const d = await store.readStatsDoc();
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

/**
 * A dispatch report: the summary statistics plus one row per processed email.
 * `finalStatus` is `DELIVERED` / `FAILED` / `null` (still queued).
 *
 * @param {string|null} [createdBy] when given, only that account's emails
 */
async function buildReport(createdBy = null) {
  const [stats, emails] = await Promise.all([getStats(), listReportedEmails(createdBy)]);
  return {
    exportedAt: store.stamp(),
    summary: stats,
    emails,
  };
}

/**
 * All emails in FIFO order — the rows of the exported report.
 * @param {string|null} [createdBy] when given, only that account's emails
 */
async function listReportedEmails(createdBy = null) {
  const query = createdBy
    ? store.emailsCol().where('createdBy', '==', createdBy).orderBy('seq', 'asc')
    : store.emailsCol().orderBy('seq', 'asc');
  const snap = await query.get();
  return snap.docs.map((d) => d.data());
}

module.exports = {
  getStats,
  buildReport,
  listReportedEmails,
};
