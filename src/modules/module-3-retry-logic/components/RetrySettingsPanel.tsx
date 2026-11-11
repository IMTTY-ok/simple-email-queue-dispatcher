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

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{
        background: 'linear-gradient(160deg, rgba(14,18,28,0.95) 0%, rgba(8,11,18,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
        <Gauge className="w-3.5 h-3.5 text-amber-400" />
        Retry Engine
      </h2>

      {/* Retry limit */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="retry-limit" className="text-xs text-gray-600 font-semibold uppercase tracking-widest flex items-center gap-1.5">
            Retry Limit
          </label>
          <span className="text-sm font-extrabold tabular-nums" style={{ color: '#a78bfa' }}>
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
          style={{ accentColor: '#8b5cf6' }}
        />
        <p className="text-xs mt-1.5" style={{ color: '#374151' }}>
          Max {limit + 1} total SMTP attempt{limit + 1 !== 1 ? 's' : ''} per email
        </p>
      </div>

      {/* Processing speed */}
      <div>
        <p className="text-xs text-gray-600 font-semibold uppercase tracking-widest flex items-center gap-1.5 mb-2">
          <Timer className="w-3.5 h-3.5" />
          Processing Speed
        </p>
        <div className="grid grid-cols-3 gap-2">
          {PROCESSING_SPEEDS.map((s) => {
            const active = speed === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => { setSpeed(s); setMessage(null); }}
                aria-pressed={active}
                className="btn py-2 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: active
                    ? 'linear-gradient(135deg, rgba(217,119,6,0.35), rgba(239,68,68,0.2))'
                    : 'rgba(255,255,255,0.04)',
                  border: active
                    ? '1px solid rgba(251,191,36,0.4)'
                    : '1px solid rgba(255,255,255,0.06)',
                  color: active ? '#fcd34d' : '#6b7280',
                }}
              >
                {SPEED_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={busy || isProcessing}
          className="btn flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Retry Settings
        </button>
        {message && (
          <span className="text-xs" role="status" aria-live="polite" style={{ color: message === 'Saved.' ? '#6ee7b7' : '#fca5a5' }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
