import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Clock,
  Globe2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  CalendarPlus,
} from 'lucide-react';
import type { EmailFormData, ScheduleResult } from '../../../shared/types/email';
import { timeZoneOptions } from '../constants/timezones';
import {
  browserTimeZone,
  describeInTimeZone,
  humanizeRemaining,
  toLocalDateTimeValue,
  validateSchedule,
} from '../utils/time';

interface SchedulePanelProps {
  form: EmailFormData;
  /** Validates the recipient / subject / message before a schedule is saved. */
  validateForm: () => string | null;
  onSchedule: (
    form: EmailFormData,
    scheduledAt: string,
    timezone: string
  ) => Promise<ScheduleResult>;
  onCancel: () => void;
  disabled?: boolean;
}

/** Tomorrow at 09:00 in the browser's own time zone. */
function defaultSlot(): { date: string; time: string } {
  const zone = browserTimeZone();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const date = toLocalDateTimeValue(tomorrow, zone).slice(0, 10);
  return { date, time: '09:00' };
}

/**
 * Module 6 — Scheduled Delivery.
 *
 * The scheduling panel of the Email Queue Creator.
 *
 * The user picks a date, a time and an IANA time zone. The panel then shows
 * a confirmation that spells out exactly what the server is about to store
 * — the local wall-clock time, the zone, the UTC instant and the time left
 * — before anything is saved.
 */
export function SchedulePanel({
  form,
  validateForm,
  onSchedule,
  onCancel,
  disabled,
}: SchedulePanelProps) {
  const zone = useMemo(() => browserTimeZone(), []);
  const slots = useMemo(() => defaultSlot(), []);

  const [date, setDate] = useState(slots.date);
  const [time, setTime] = useState(slots.time);
  const [timezone, setTimezone] = useState(zone);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // A one-second tick keeps the "time left" counter honest.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const localValue = date && time ? `${date}T${time}` : '';
  const validation = useMemo(
    () => validateSchedule(localValue, timezone, now),
    [localValue, timezone, now]
  );
  const utc = validation.ok ? validation.utc : null;

  const startConfirmation = () => {
    setError(null);
    const formError = validateForm();
    if (formError) {
      setError(formError);
      return;
    }
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setConfirming(true);
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const result = await onSchedule(form, localValue, timezone);
    setBusy(false);

    if (!result.success) {
      setError(result.error ?? 'The scheduled email could not be saved.');
      setConfirming(false);
      return;
    }
    setDone(result.emailId ?? '');
    if (result.warning) setWarning(result.warning);
  };

  if (done) {
    return (
      <div className="space-y-2">
        <div className="notice notice-green animate-fade-up" role="status">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
          <div>
            <p className="font-semibold">Scheduled email {done} saved.</p>
            <p className="mt-0.5">
              It will be delivered by the server at{' '}
              <strong>{utc ? describeInTimeZone(utc, timezone) : localValue}</strong>. The dashboard
              does not have to stay open.
            </p>
            {warning && (
              <p className="mt-1" style={{ color: '#A56B18' }}>
                {warning}
              </p>
            )}
          </div>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-control border border-hairline bg-surface-head p-3 space-y-3 animate-fade-up"
      aria-label="Schedule this email for later"
    >
      <div className="flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-navy-700" />
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-navy-900">
          Schedule for later
        </h3>
      </div>

      {!confirming ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="schedule-date">
                Schedule date
              </label>
              <input
                id="schedule-date"
                type="date"
                className="input"
                value={date}
                min={toLocalDateTimeValue(new Date(now), timezone).slice(0, 10)}
                onChange={(e) => { setDate(e.target.value); setError(null); }}
                disabled={disabled || busy}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="schedule-time">
                Schedule time
              </label>
              <input
                id="schedule-time"
                type="time"
                className="input"
                value={time}
                onChange={(e) => { setTime(e.target.value); setError(null); }}
                disabled={disabled || busy}
              />
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="schedule-timezone">
              Timezone
            </label>
            <select
              id="schedule-timezone"
              className="select"
              value={timezone}
              onChange={(e) => { setTimezone(e.target.value); setError(null); }}
              disabled={disabled || busy}
            >
              {timeZoneOptions(zone).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {utc && (
            <p className="text-[11.5px] text-ink-muted flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              Stored as <span className="mono">{utc.toISOString()}</span> (UTC)
            </p>
          )}

          {error && (
            <p className="notice notice-red" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              <span>{error}</span>
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-0.5">
            <button
              type="button"
              className="btn btn-primary"
              onClick={startConfirmation}
              disabled={disabled || busy}
            >
              <CalendarPlus className="w-4 h-4" />
              Schedule Email
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="notice notice-slate" role="group" aria-label="Scheduled delivery confirmation">
            <Globe2 className="w-4 h-4 shrink-0 mt-px" />
            <div className="space-y-1 min-w-0">
              <p className="font-semibold text-navy-900">Confirm the scheduled delivery</p>
              <dl className="text-[12px] space-y-0.5">
                <div className="flex gap-2">
                  <dt className="text-ink-muted w-28 shrink-0">Recipient</dt>
                  <dd className="truncate font-medium">{form.recipient || '—'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-muted w-28 shrink-0">Subject</dt>
                  <dd className="truncate font-medium">{form.subject || '—'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-muted w-28 shrink-0">Local time</dt>
                  <dd className="font-medium">
                    {utc ? describeInTimeZone(utc, timezone) : localValue}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-muted w-28 shrink-0">Stored (UTC)</dt>
                  <dd className="mono">{utc ? utc.toISOString() : '—'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-muted w-28 shrink-0">Time left</dt>
                  <dd className="font-medium">
                    {utc ? humanizeRemaining(utc.getTime() - now) : '—'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {error && (
            <p className="notice notice-red" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              <span>{error}</span>
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={confirm}
              disabled={busy}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin-smooth" /> : <CheckCircle2 className="w-4 h-4" />}
              {busy ? 'Scheduling…' : 'Confirm schedule'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setConfirming(false); setError(null); }}
              disabled={busy}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}
