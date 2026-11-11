import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITY_TYPES } from '../functions/src/modules/module-4-final-status-logger/logger.js';
import { statusKey } from '../functions/src/modules/module-1-email-queue-creator/queue.js';

/**
 * Module 4 — Final Status Logger.
 *
 * The logger maintains the complete history of every email. Every status
 * must map onto exactly one statistics counter, otherwise the dashboard
 * counters drift away from the documents.
 */
describe('Module 4 — Final Status Logger / status mapping', () => {
  it('maps every status onto a statistics counter', () => {
    assert.equal(statusKey('QUEUED'), 'queued');
    assert.equal(statusKey('SENDING'), 'sending');
    assert.equal(statusKey('RETRYING'), 'retrying');
    assert.equal(statusKey('DELIVERED'), 'delivered');
    assert.equal(statusKey('FAILED'), 'failed');
  });

  it('returns null for an unknown status so no counter is corrupted', () => {
    assert.equal(statusKey('WEIRD'), null);
    assert.equal(statusKey(undefined), null);
  });

  it('declares the activity types the dashboard renders', () => {
    assert.deepEqual([...ACTIVITY_TYPES].sort(), ['failure', 'info', 'retry', 'success', 'warning']);
  });
});
