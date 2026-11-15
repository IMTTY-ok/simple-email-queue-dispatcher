'use strict';

/**
 * Module 6 — Scheduled Delivery: time and timezone helpers.
 * ========================================================
 *
 * Pure functions only — no Firebase, no network, no side effects. Everything
 * here is therefore directly unit-testable (see `tests/module-6-scheduled-delivery.test.ts`).
 *
 * The scheduling model
 * --------------------
 *   • The browser picks a **wall-clock** date and time (e.g. 15 Nov 2026 09:00)
 *     together with an **IANA timezone** (e.g. Asia/Kolkata).
 *   • The wall-clock time is converted to a single UTC instant, which is what
 *     Firestore stores (`scheduledAt`, a Firestore Timestamp) and what the
 *     Cloud Task is scheduled for.
 *   • The original timezone is stored alongside it (`timezone`) so the
 *     dashboard can render the schedule back in the timezone the user picked.
 *
 * Daylight saving
 * ---------------
 *   A wall-clock time can be *ambiguous* (it happens twice when the clocks go
 *   back) or *non-existent* (it is skipped when the clocks go forward).
 *
 *     • Ambiguous  → the earlier of the two instants is used (still summer time).
 *     • Non-existent → the time is shifted forward by the size of the gap,
 *       i.e. 02:30 on a spring-forward morning becomes 03:30 local time.
 *
 *   Both cases are deterministic and documented rather than silently wrong.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Cloud Tasks refuses a schedule further out than 30 days. */
const MAX_TASK_DELAY_MS = 30 * DAY_MS;

/**
 * An IANA time-zone name such as `Asia/Kolkata`, `Europe/Berlin` or `UTC`.
 * Fixed-offset identifiers (`UTC+05:30`) and abbreviations (`IST`) are
 * rejected on purpose — they are ambiguous across regions.
 */
const IANA_TIME_ZONE = /^(UTC|[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){1,2})$/;

/** A local wall-clock timestamp: `YYYY-MM-DDTHH:mm` (seconds optional). */
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Is `timeZone` a time zone this runtime understands?
 */
function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string') return false;
  const value = timeZone.trim();
  if (value.length === 0 || value.length > 64) return false;
  if (!IANA_TIME_ZONE.test(value)) return false;
  try {
    // Throws a RangeError for an unknown zone.
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The UTC offset (in milliseconds) that `timeZone` had at `instant`.
 * Positive east of Greenwich — Asia/Kolkata returns +5h30m.
 */
function zoneOffsetMs(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const field = {};
  for (const part of parts) {
    if (part.type !== 'literal') field[part.type] = part.value;
  }

  // Some engines report midnight as hour 24.
  let hour = Number(field.hour);
  if (hour === 24) hour = 0;

  const asUtc = Date.UTC(
    Number(field.year),
    Number(field.month) - 1,
    Number(field.day),
    hour,
    Number(field.minute),
    Number(field.second)
  );

  // Compare against the second-truncated instant so the millisecond part of
  // `instant` cannot leak into the offset.
  const truncated = Math.floor(instant.getTime() / 1000) * 1000;
  return asUtc - truncated;
}

/**
 * Convert a local wall-clock time in `timeZone` into the UTC instant it
 * refers to.
 *
 * @param {string} localDateTime `YYYY-MM-DDTHH:mm` (or with seconds)
 * @param {string} timeZone an IANA time-zone name
 * @returns {Date|null} the UTC instant, or `null` when the input is invalid
 */
function zonedTimeToUtc(localDateTime, timeZone) {
  if (!isValidTimeZone(timeZone)) return null;
  const match = LOCAL_DATE_TIME.exec(String(localDateTime ?? '').trim());
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const naive = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second || '0')
  );
  if (!Number.isFinite(naive)) return null;

  // The offset depends on the instant, and the instant depends on the offset.
  // Two or three refinement passes are enough for every real-world zone
  // (including the zones that switch offset twice a year).
  let guess = new Date(naive);
  for (let i = 0; i < 3; i++) {
    const next = new Date(naive - zoneOffsetMs(guess, timeZone));
    if (next.getTime() === guess.getTime()) break;
    guess = next;
  }
  return guess;
}

/**
 * The wall-clock parts of a UTC instant, as seen in `timeZone`.
 *
 * @returns {{year:number,month:number,day:number,hour:number,minute:number,second:number}|null}
 */
function utcToZonedParts(instant, timeZone) {
  if (!isValidTimeZone(timeZone)) return null;
  const date = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const field = {};
  for (const part of parts) {
    if (part.type !== 'literal') field[part.type] = part.value;
  }
  let hour = Number(field.hour);
  if (hour === 24) hour = 0;

  return {
    year: Number(field.year),
    month: Number(field.month),
    day: Number(field.day),
    hour,
    minute: Number(field.minute),
    second: Number(field.second),
  };
}

/** `YYYY-MM-DD` for the wall-clock parts. */
function formatZonedDate(instant, timeZone) {
  const p = utcToZonedParts(instant, timeZone);
  if (!p) return '';
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** `HH:mm` for the wall-clock parts. */
function formatZonedTime(instant, timeZone) {
  const p = utcToZonedParts(instant, timeZone);
  if (!p) return '';
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** A human label such as `15 Nov 2026, 09:00 (Asia/Kolkata)`. */
function describeInTimeZone(instant, timeZone) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date) + ` (${timeZone})`;
  } catch {
    return `${formatZonedDate(date, timeZone)} ${formatZonedTime(date, timeZone)} (${timeZone})`;
  }
}

/**
 * Validate a requested schedule.
 *
 * @param {object} input
 * @param {string} input.scheduledAt local wall-clock `YYYY-MM-DDTHH:mm`
 * @param {string} input.timezone an IANA time-zone name
 * @param {number} [input.now] the current epoch milliseconds (injectable for tests)
 * @returns {{ok:true,value:{scheduledAtUtc:Date,scheduledAtIso:string,timezone:string,withinTaskWindow:boolean}}
 *          |{ok:false,error:string}}
 */
function validateSchedule(input, now = Date.now()) {
  const source = input && typeof input === 'object' ? input : {};
  const timezone = String(source.timezone ?? '').trim();
  const scheduledAt = String(source.scheduledAt ?? '').trim();

  if (!scheduledAt) {
    return { ok: false, error: 'Pick a date and a time for the scheduled email.' };
  }
  if (!timezone) {
    return { ok: false, error: 'Pick a timezone for the scheduled email.' };
  }
  if (!isValidTimeZone(timezone)) {
    return { ok: false, error: `"${timezone}" is not a known IANA timezone.` };
  }

  const utc = zonedTimeToUtc(scheduledAt, timezone);
  if (!utc) {
    return { ok: false, error: 'That date and time could not be read.' };
  }

  const at = utc.getTime();
  if (!Number.isFinite(at)) {
    return { ok: false, error: 'That date and time could not be read.' };
  }
  if (at <= now) {
    return { ok: false, error: 'The scheduled time must be in the future.' };
  }

  return {
    ok: true,
    value: {
      scheduledAtUtc: utc,
      scheduledAtIso: utc.toISOString(),
      timezone,
      withinTaskWindow: at - now <= MAX_TASK_DELAY_MS,
    },
  };
}

/**
 * A short, human description of the time left until `at`.
 * `2h 15m`, `45m`, `in a moment`.
 */
function humanizeRemaining(ms) {
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return 'due now';
  const totalMinutes = Math.floor(ms / MINUTE_MS);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return 'in a moment';
}

module.exports = {
  MINUTE_MS,
  HOUR_MS,
  DAY_MS,
  MAX_TASK_DELAY_MS,
  IANA_TIME_ZONE,
  LOCAL_DATE_TIME,
  isValidTimeZone,
  zoneOffsetMs,
  zonedTimeToUtc,
  utcToZonedParts,
  formatZonedDate,
  formatZonedTime,
  describeInTimeZone,
  validateSchedule,
  humanizeRemaining,
};
