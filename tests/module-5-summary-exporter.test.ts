import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { exportCSV, exportJSON } from '../src/modules/module-5-summary-exporter/utils/exportReport.ts';

/**
 * Module 5 — Summary Exporter.
 *
 * The exported report must survive recipients, subjects and SMTP responses
 * that contain commas, quotes and newlines — the CSV has to stay parseable.
 */

/** A minimal email document used across the assertions. */
function makeEmail(overrides = {}) {
  return {
    id: 'EML-001',
    seq: 1,
    recipient: 'student@example.com',
    subject: 'Assignment Submission',
    message: 'Your assignment has been received.',
    senderName: null,
    status: 'DELIVERED',
    attempts: 1,
    retries: 0,
    retryLimit: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
    finalStatus: 'DELIVERED',
    socketErr: null,
    smtp: { accepted: ['student@example.com'], response: '250 2.0.0 OK', messageId: '<1@mail>' },
    logs: [{ attempt: 1, result: 'SUCCESS', detail: '250 2.0.0 OK', timestamp: '2026-01-01T00:00:01.000Z' }],
    ...overrides,
  };
}

describe('Module 5 — Summary Exporter / CSV', () => {
  it('writes one header row plus one row per email', () => {
    const csv = exportCSV([makeEmail(), makeEmail({ id: 'EML-002', seq: 2 })]);
    const lines = csv.split('\n');
    assert.equal(lines.length, 3);
    assert.match(lines[0], /^"Email ID","Recipient","Subject"/);
  });

  it('quotes every cell so separators cannot break the structure', () => {
    const csv = exportCSV([makeEmail({ subject: 'Hello, "World"' })]);
    assert.match(csv, /"Hello, ""World"""/);
  });

  it('escapes embedded double quotes by doubling them', () => {
    const csv = exportCSV([makeEmail({ recipient: 'a"b@example.com' })]);
    assert.match(csv, /"a""b@example\.com"/);
  });

  it('survives a newline inside a field', () => {
    const csv = exportCSV([makeEmail({ subject: 'Line one\nLine two' })]);
    // The newline is inside a quoted cell, so it stays part of one row.
    assert.match(csv, /"Line one\nLine two"/);
  });

  it('writes an empty cell for missing optional values', () => {
    const csv = exportCSV([makeEmail({ senderName: null, socketErr: null, smtp: null })]);
    assert.ok(csv.includes('""'));
  });

  it('includes the attempt history in the row', () => {
    const csv = exportCSV([makeEmail()]);
    assert.match(csv, /Attempt 1: SUCCESS/);
  });
});

describe('Module 5 — Summary Exporter / JSON', () => {
  it('produces valid JSON', () => {
    const parsed = JSON.parse(exportJSON([makeEmail()], {
      total: 1, queued: 0, sending: 0, delivered: 1, failed: 0, retrying: 0,
      totalAttempts: 1, totalRetries: 0, successRate: 100, failureRate: 0,
    }));
    assert.equal(Array.isArray(parsed.emails), true);
    assert.equal(parsed.emails.length, 1);
  });

  it('carries the summary statistics', () => {
    const parsed = JSON.parse(exportJSON([], {
      total: 5, queued: 1, sending: 0, delivered: 3, failed: 1, retrying: 0,
      totalAttempts: 7, totalRetries: 2, successRate: 75, failureRate: 25,
    }));
    assert.equal(parsed.summary.totalEmails, 5);
    assert.equal(parsed.summary.delivered, 3);
    assert.equal(parsed.summary.failed, 1);
    assert.equal(parsed.summary.successRate, '75%');
    assert.equal(parsed.summary.failureRate, '25%');
  });

  it('stamps the export time', () => {
    const parsed = JSON.parse(exportJSON([], {
      total: 0, queued: 0, sending: 0, delivered: 0, failed: 0, retrying: 0,
      totalAttempts: 0, totalRetries: 0, successRate: 0, failureRate: 0,
    }));
    assert.ok(!Number.isNaN(Date.parse(parsed.exportedAt)));
  });
});
