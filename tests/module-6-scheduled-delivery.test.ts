import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TASK_DELAY_MS,
  isValidTimeZone,
  zonedTimeToUtc,
  utcToZonedParts,
  describeInTimeZone,
  validateSchedule,
  humanizeRemaining,
} from '../functions/src/modules/module-6-scheduled-delivery/clock.js';
import {
  decideClaim,
  isEligibleForScheduleChange,
  withinTaskWindow,
} from '../functions/src/modules/module-6-scheduled-delivery/guard.js';
import {
  zonedTimeToUtc as clientZonedTimeToUtc,
  utcToZonedParts as clientUtcToZonedParts,
  toLocalDateTimeValue,
  validateSchedule as clientValidateSchedule,
  isValidTimeZone as clientIsValidTimeZone,
} from '../src/modules/module-6-scheduled-delivery/utils/time.ts';
import { statusKey } from '../functions/src/modules/module-1-email-queue-creator/queue.js';
import { ACTIVITY_KINDS, defaultKind } from '../functions/src/modules/module-4-final-status-logger/logger.js';

/**
 * Module 6 — Scheduled Delivery.
 *
 * The scheduling rules that must hold no matter what the browser does:
 *
 *   • a wall-clock time in a named zone resolves to exactly one UTC instant
 *   • the browser and the server agree on that instant
 *   • a moment in the past is refused
 *   • a scheduled email is never delivered early
 *   • only the current revision of a schedule may be claimed
 *   • only a scheduled email may be cancelled or rescheduled
 */

const NOW = Date.UTC(2026, 10, 15, 0, 0, 0); // 15 Nov 2026, 00:00 UTC

describe('Module 6 — time zones', () => {
  it('accepts real IANA zones', () => {
    assert.equal(isValidTimeZone('Asia/Kolkata'), true);
    assert.equal(isValidTimeZone('Europe/Berlin'), true);
    assert.equal(isValidTimeZone('America/New_York'), true);
    assert.equal(isValidTimeZone('UTC'), true);
  });

  it('rejects unknown zones, abbreviations and fixed offsets', () => {
    assert.equal(isValidTimeZone('Not/AZone'), false);
    assert.equal(isValidTimeZone('IST'), false);
    assert.equal(isValidTimeZone('UTC+05:30'), false);
    assert.equal(isValidTimeZone(''), false);
    assert.equal(isValidTimeZone(undefined as unknown as string), false);
  });

  it('resolves Asia/Kolkata to UTC (+05:30)', () => {
    const utc = zonedTimeToUtc('2026-11-15T09:00', 'Asia/Kolkata');
    assert.equal(utc?.toISOString(), '2026-11-15T03:30:00.000Z');
  });

  it('resolves a summer-time zone to the summer offset', () => {
    // America/New_York is UTC-4 in July and UTC-5 in November.
    assert.equal(
      zonedTimeToUtc('2026-07-15T09:00', 'America/New_York')?.toISOString(),
      '2026-07-15T13:00:00.000Z'
    );
    assert.equal(
      zonedTimeToUtc('2026-11-15T09:00', 'America/New_York')?.toISOString(),
      '2026-11-15T14:00:00.000Z'
    );
  });

  it('round-trips a UTC instant back into the same wall-clock time', () => {
    const utc = zonedTimeToUtc('2026-11-15T09:00', 'Asia/Kolkata')!;
    const parts = utcToZonedParts(utc, 'Asia/Kolkata');
    assert.equal(parts?.year, 2026);
    assert.equal(parts?.month, 11);
    assert.equal(parts?.day, 15);
    assert.equal(parts?.hour, 9);
    assert.equal(parts?.minute, 0);
  });

  it('renders a readable label with the zone', () => {
    const utc = zonedTimeToUtc('2026-11-15T09:00', 'Asia/Kolkata')!;
    assert.match(describeInTimeZone(utc, 'Asia/Kolkata'), /Asia\/Kolkata/);
  });

  it('refuses a wall-clock time it cannot read', () => {
    assert.equal(zonedTimeToUtc('15/11/2026 09:00', 'UTC'), null);
    assert.equal(zonedTimeToUtc('2026-11-15T09:00', 'Nowhere/Nothing'), null);
  });
});

describe('Module 6 — browser and server agree', () => {
  const zones = ['UTC', 'Asia/Kolkata', 'America/New_York', 'Europe/Berlin', 'Australia/Sydney'];
  const moments = ['2026-01-15T09:00', '2026-03-08T02:30', '2026-07-15T23:45', '2026-11-01T01:30'];

  it('resolve the same UTC instant on both sides', () => {
    for (const zone of zones) {
      for (const moment of moments) {
        const server = zonedTimeToUtc(moment, zone);
        const client = clientZonedTimeToUtc(moment, zone);
        assert.equal(server?.getTime(), client?.getTime(), `${zone} ${moment}`);
      }
    }
  });

  it('agree on which zones are valid', () => {
    for (const zone of [...zones, 'Not/AZone', 'IST']) {
      assert.equal(isValidTimeZone(zone), clientIsValidTimeZone(zone), zone);
    }
  });

  it('agree on the local rendering of a UTC instant', () => {
    const instant = new Date('2026-11-15T03:30:00.000Z');
    assert.equal(
      toLocalDateTimeValue(instant, 'Asia/Kolkata'),
      '2026-11-15T09:00'
    );
    const serverParts = utcToZonedParts(instant, 'Asia/Kolkata');
    const clientParts = clientUtcToZonedParts(instant, 'Asia/Kolkata');
    assert.deepEqual(clientParts, serverParts);
  });

  it('agree that a past moment is invalid', () => {
    const server = validateSchedule({ scheduledAt: '2026-11-14T09:00', timezone: 'UTC' }, NOW);
    const client = clientValidateSchedule('2026-11-14T09:00', 'UTC', NOW);
    assert.equal(server.ok, false);
    assert.equal(client.ok, false);
  });
});

describe('Module 6 — schedule validation', () => {
  it('accepts a moment in the future', () => {
    const result = validateSchedule({ scheduledAt: '2026-11-15T09:00', timezone: 'Asia/Kolkata' }, NOW);
    assert.equal(result.ok, true);
    assert.equal(result.value.scheduledAtIso, '2026-11-15T03:30:00.000Z');
    assert.equal(result.value.timezone, 'Asia/Kolkata');
  });

  it('refuses a moment in the past', () => {
    const result = validateSchedule({ scheduledAt: '2026-11-14T09:00', timezone: 'UTC' }, NOW);
    assert.equal(result.ok, false);
    assert.match(result.error, /future/i);
  });

  it('refuses the exact present moment', () => {
    const result = validateSchedule({ scheduledAt: '2026-11-15T00:00', timezone: 'UTC' }, NOW);
    assert.equal(result.ok, false);
  });

  it('refuses an unknown timezone', () => {
    const result = validateSchedule({ scheduledAt: '2026-11-15T09:00', timezone: 'Nowhere/Nothing' }, NOW);
    assert.equal(result.ok, false);
    assert.match(result.error, /timezone/i);
  });

  it('refuses a missing date or time', () => {
    assert.equal(validateSchedule({ scheduledAt: '', timezone: 'UTC' }, NOW).ok, false);
    assert.equal(validateSchedule({ scheduledAt: '2026-11-15T09:00', timezone: '' }, NOW).ok, false);
  });

  it('knows when a moment is beyond the Cloud Tasks window', () => {
    const near = validateSchedule({ scheduledAt: '2026-11-20T09:00', timezone: 'UTC' }, NOW);
    assert.equal(near.ok, true);
    assert.equal(near.value.withinTaskWindow, true);

    const far = validateSchedule({ scheduledAt: '2026-12-20T09:00', timezone: 'UTC' }, NOW);
    assert.equal(far.ok, true);
    assert.equal(far.value.withinTaskWindow, false);
  });
});

describe('Module 6 — the delivery guard', () => {
  const base = {
    status: 'SCHEDULED',
    scheduleVersion: 2,
    expectedVersion: 2,
    dueAt: NOW,
    now: NOW,
  };

  it('claims a scheduled email whose moment has arrived', () => {
    assert.equal(decideClaim(base).claimed, true);
  });

  it('refuses to send before the scheduled moment', () => {
    const result = decideClaim({ ...base, dueAt: NOW + 60_000 });
    assert.equal(result.claimed, false);
    assert.equal(result.reason, 'not-due');
  });

  it('refuses a task that carries an older schedule version', () => {
    const result = decideClaim({ ...base, expectedVersion: 1 });
    assert.equal(result.claimed, false);
    assert.equal(result.reason, 'stale-version');
  });

  it('refuses an email that is not scheduled', () => {
    for (const status of ['QUEUED', 'SENDING', 'RETRYING', 'DELIVERED', 'FAILED', 'CANCELLED']) {
      const result = decideClaim({ ...base, status });
      assert.equal(result.claimed, false, status);
      assert.equal(result.reason, 'not-scheduled');
    }
  });

  it('refuses an email without a moment', () => {
    const result = decideClaim({ ...base, dueAt: null });
    assert.equal(result.claimed, false);
    assert.equal(result.reason, 'no-schedule');
  });

  it('only lets a scheduled email be cancelled or rescheduled', () => {
    assert.equal(isEligibleForScheduleChange('SCHEDULED'), true);
    assert.equal(isEligibleForScheduleChange('SENDING'), false);
    assert.equal(isEligibleForScheduleChange('DELIVERED'), false);
    assert.equal(isEligibleForScheduleChange('CANCELLED'), false);
  });

  it('knows the Cloud Tasks window', () => {
    assert.equal(withinTaskWindow(NOW + 1000, NOW, MAX_TASK_DELAY_MS), true);
    assert.equal(withinTaskWindow(NOW + MAX_TASK_DELAY_MS + 1, NOW, MAX_TASK_DELAY_MS), false);
  });
});

describe('Module 6 — the surrounding modules', () => {
  it('counts a scheduled email in its own statistics bucket', () => {
    assert.equal(statusKey('SCHEDULED'), 'scheduled');
    assert.equal(statusKey('CANCELLED'), 'cancelled');
  });

  it('leaves the counters of the five original modules alone', () => {
    assert.equal(statusKey('QUEUED'), 'queued');
    assert.equal(statusKey('SENDING'), 'sending');
    assert.equal(statusKey('RETRYING'), 'retrying');
    assert.equal(statusKey('DELIVERED'), 'delivered');
    assert.equal(statusKey('FAILED'), 'failed');
  });

  it('gives every activity kind a label', () => {
    assert.ok(ACTIVITY_KINDS.includes('scheduled'));
    assert.ok(ACTIVITY_KINDS.includes('cancelled'));
    assert.ok(ACTIVITY_KINDS.includes('dispatch'));
    assert.equal(defaultKind('success'), 'delivered');
    assert.equal(defaultKind('failure'), 'failed');
    assert.equal(defaultKind('retry'), 'retry');
  });
});

describe('Module 6 — the countdown', () => {
  it('describes the time left', () => {
    assert.equal(humanizeRemaining(2 * 3600_000 + 15 * 60_000), '2h 15m');
    assert.equal(humanizeRemaining(45 * 60_000), '45m');
    assert.equal(humanizeRemaining(3 * 24 * 3600_000 + 2 * 3600_000), '3d 2h');
    assert.equal(humanizeRemaining(0), 'due now');
    assert.equal(humanizeRemaining(-1), 'due now');
  });
});
