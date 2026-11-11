import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maxAttempts, attemptProgress } from '../src/shared/utils/format.ts';

/**
 * Module 3 — Retry Logic Engine.
 *
 * The retry rule from the PRD:
 *
 *   Initial attempt = Attempt 1
 *   Retry 1         = Attempt 2
 *   Retry 2         = Attempt 3
 *   Retry 3         = Attempt 4
 *
 *   → the maximum number of delivery attempts is 4 for the default
 *     retry limit of 3.
 */
describe('Module 3 — Retry Logic Engine / attempt budget', () => {
  it('allows 4 total attempts for the default retry limit of 3', () => {
    assert.equal(maxAttempts(3), 4);
  });

  it('allows one attempt when retries are disabled', () => {
    assert.equal(maxAttempts(0), 1);
  });

  it('scales linearly with the retry limit', () => {
    assert.equal(maxAttempts(1), 2);
    assert.equal(maxAttempts(5), 6);
    assert.equal(maxAttempts(10), 11);
  });

  it('never reports fewer than one attempt', () => {
    assert.equal(maxAttempts(-5), 1);
  });
});

describe('Module 3 — Retry Logic Engine / progress', () => {
  it('reports 0% before the first attempt', () => {
    assert.equal(attemptProgress(0, 3), 0);
  });

  it('reports 25% after one of four attempts', () => {
    assert.equal(attemptProgress(1, 3), 25);
  });

  it('reports 50% halfway through', () => {
    assert.equal(attemptProgress(2, 3), 50);
  });

  it('reports 100% once every attempt is used', () => {
    assert.equal(attemptProgress(4, 3), 100);
  });

  it('never exceeds 100%', () => {
    assert.equal(attemptProgress(9, 3), 100);
  });
});
