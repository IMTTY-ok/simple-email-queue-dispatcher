/**
 * Module 6 — Scheduled Delivery: time and timezone helpers.
 * =====================================================
 *
 * The browser mirror of the server's `clock.js`. Both sides use the same
 * algorithm, so the time the user sees in the confirmation panel is exactly
 * the time the server will store.
 *
 * The browser never decides *when* an email is sent — the server's clock
 * does. These helpers only exist so the dashboard can show the user what
 * they are about to ask for.
 */

const IANA_TIME_ZONE = /^(UTC|[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){1,2})$/;

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Is `timeZone` a time zone this browser understands? */
export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== 'string') return false;
  const value = timeZone.trim();
  if (value.length === 0 || value.length > 64) return false;
  if (!IANA_TIME_ZONE.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The UTC offset (ms) `timeZone` had at `instant`. */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
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

  const field: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') field[part.type] = part.value;
  }
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
  const truncated = Math.floor(instant.getTime() / 1000) * 1000;
  return asUtc - truncated;
}

/**
 * Convert a local wall-clock time in `timeZone` into the UTC instant it
 * refers to.
 *
 * Ambiguous times (the clocks go back) resolve to the earlier of the two
 * instants; non-existent times (the clocks go forward) are shifted past the
 * gap. The server applies exactly the same rule.
 */
export function zonedTimeToUtc(localDateTime: string, timeZone: string): Date | null {
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

  let guess = new Date(naive);
  for (let i = 0; i < 3; i++) {
    const next = new Date(naive - zoneOffsetMs(guess, timeZone));
    if (next.getTime() === guess.getTime()) break;
    guess = next;
  }
  return guess;
}

/** The wall-clock parts of a UTC instant, as seen in `timeZone`. */
export function utcToZonedParts(
  instant: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number } | null {
  if (!isValidTimeZone(timeZone)) return null;
  if (!Number.isFinite(instant.getTime())) return null;

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

  const field: Record<string, string> = {};
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

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** `YYYY-MM-DD` for the wall-clock parts of an instant. */
export function formatZonedDate(instant: Date, timeZone: string): string {
  const p = utcToZonedParts(instant, timeZone);
  if (!p) return '';
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** `HH:mm` for the wall-clock parts of an instant. */
export function formatZonedTime(instant: Date, timeZone: string): string {
  const p = utcToZonedParts(instant, timeZone);
  if (!p) return '';
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** A human label such as `15 Nov 2026, 09:00 (Asia/Kolkata)`. */
export function describeInTimeZone(instant: Date, timeZone: string): string {
  if (!Number.isFinite(instant.getTime())) return '';
  try {
    return (
      new Intl.DateTimeFormat('en-GB', {
        timeZone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(instant) + ` (${timeZone})`
    );
  } catch {
    return `${formatZonedDate(instant, timeZone)} ${formatZonedTime(instant, timeZone)} (${timeZone})`;
  }
}

/** `2026-11-15T09:00` — the wall-clock value of an instant in a zone. */
export function toLocalDateTimeValue(instant: Date, timeZone: string): string {
  const date = formatZonedDate(instant, timeZone);
  const time = formatZonedTime(instant, timeZone);
  if (!date || !time) return '';
  return `${date}T${time}`;
}

/** The time zone of the browser, falling back to UTC. */
export function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

/** `2h 15m`, `45m`, `in a moment`, `due now`. */
export function humanizeRemaining(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return 'due now';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return 'in a moment';
}

/**
 * Check a requested schedule the way the server will check it.
 *
 * @returns `{ ok: true, utc }` or `{ ok: false, error }`
 */
export function validateSchedule(
  scheduledAt: string,
  timezone: string,
  now: number = Date.now()
): { ok: true; utc: Date } | { ok: false; error: string } {
  if (!scheduledAt) return { ok: false, error: 'Pick a date and a time.' };
  if (!timezone) return { ok: false, error: 'Pick a timezone.' };
  if (!isValidTimeZone(timezone)) {
    return { ok: false, error: `"${timezone}" is not a known IANA timezone.` };
  }

  const utc = zonedTimeToUtc(scheduledAt, timezone);
  if (!utc) return { ok: false, error: 'That date and time could not be read.' };
  if (utc.getTime() <= now) {
    return { ok: false, error: 'The scheduled time must be in the future.' };
  }
  return { ok: true, utc };
}
