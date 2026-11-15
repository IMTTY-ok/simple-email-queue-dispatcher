import { useEffect, useRef, useState } from 'react';
import { Gauge, Timer, Save, Loader2 } from 'lucide-react';
import { PROCESSING_SPEEDS, PROCESSING_SPEED_DELAYS } from '../../../shared/constants';

/** The processing-speed presets with their labels. */
const SPEED_LABELS: Record<string, string> = {
  SLOW: 'Slow',
  NORMAL: 'Normal',
  FAST: 'Fast',
};

interface RetrySettingsPanelProps {
  retryLimit: number;
  retryDelayMs: number;
  isProcessing: boolean;
  onSave: (patch: {
    retryLimit?: number;
    retryDelayMs?: number;
    interEmailDelayMs?: number;
  }) => Promise<{ success: boolean; error?: string }>;
  /** Render without the surrounding card, for use inside another panel. */
  embedded?: boolean;
}

/**
 * Module 3 — Retry Logic Engine.
 *
 * Exposes the two knobs the retry engine reads:
 *
 *   • **Retry limit** — how many times a failed attempt may be repeated.
 *     `retryLimit = 3` means 1 initial attempt + 3 retries = 4 attempts.
 *   • **Processing speed** — how long the dispatcher waits between attempts
 *     and between two consecutive emails.
 */
export function RetrySettingsPanel({
  retryLimit,
  retryDelayMs,
  isProcessing,
  onSave,
  embedded = false,
}: RetrySettingsPanelProps) {
  const [limit, setLimit] = useState(retryLimit);
  const [speed, setSpeed] = useState('NORMAL');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const seededRef = useRef(false);

  // Seed from the server config once.
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    setLimit(retryLimit);
    const preset = PROCESSING_SPEEDS.find(
      (s) => PROCESSING_SPEED_DELAYS[s].retryDelayMs === retryDelayMs
    );
    setSpeed(preset ?? 'NORMAL');
  }, [retryLimit, retryDelayMs]);

  const handleSave = async () => {
    setBusy(true);
    setMessage(null);
    const delays = PROCESSING_SPEED_DELAYS[speed];
    const res = await onSave({
      retryLimit: limit,
      retryDelayMs: delays.retryDelayMs,
      interEmailDelayMs: delays.interEmailDelayMs,
    });
    setBusy(false);
    setMessage(res.success ? 'Saved.' : res.error ?? 'Failed to save.');
  };

  const body = (
    <div className="space-y-4">
      {/* Retry limit */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="retry-limit" className="field-label mb-0 flex items-center gap-1.5">
            <Gauge className="w-3 h-3" />
            Retry limit
          </label>
          <span className="text-[13px] font-extrabold tabular" style={{ color: '#24436A' }}>
            {limit}
          </span>
        </div>
        <input
          id="retry-limit"
          type="range"
          min={0}
          max={10}
          value={limit}
          onChange={(e) => { setLimit(Number(e.target.value)); setMessage(null); }}
          className="w-full h-6 cursor-pointer"
          style={{ accentColor: '#24436A' }}
        />
        <p className="text-[11px] mt-1 text-ink-faint">
          Max {limit + 1} total SMTP attempt{limit + 1 !== 1 ? 's' : ''} per email
        </p>
      </div>

      {/* Processing speed */}
      <div>
        <p className="field-label flex items-center gap-1.5">
          <Timer className="w-3 h-3" />
          Dispatch speed
        </p>
        <div className="segment grid-cols-3">
          {PROCESSING_SPEEDS.map((s) => {
            const active = speed === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => { setSpeed(s); setMessage(null); }}
                aria-pressed={active}
                className="segment-btn"
              >
                {SPEED_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || isProcessing}
          className="btn btn-navy"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin-smooth" /> : <Save className="w-3.5 h-3.5" />}
          Save Retry Settings
        </button>
        {message && (
          <span
            className="text-[11.5px]"
            role="status"
            aria-live="polite"
            style={{ color: message === 'Saved.' ? '#16815B' : '#B24545' }}
          >
            {message}
          </span>
        )}
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <section className="card">
      <header className="card-head">
        <h2 className="card-title">
          <Gauge className="w-3.5 h-3.5 text-navy-700" />
          RETRY ENGINE
        </h2>
      </header>
      <div className="card-body">{body}</div>
    </section>
  );
}
