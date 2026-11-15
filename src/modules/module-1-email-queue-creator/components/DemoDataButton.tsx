import { useState } from 'react';
import { Database, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface DemoDataButtonProps {
  disabled?: boolean;
  onLoadDemo: () => Promise<{ success: boolean; error?: string; count?: number }>;
}

/**
 * Module 1 — Email Queue Creator.
 *
 * Loads the five sample emails from the PRD demo scenario (§25) so the
 * retry engine can be demonstrated during a presentation.
 */
export function DemoDataButton({ disabled, onLoadDemo }: DemoDataButtonProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleClick = async () => {
    setBusy(true);
    setMessage(null);
    const res = await onLoadDemo();
    setBusy(false);
    setMessage(
      res.success
        ? { type: 'success', text: `Loaded ${res.count ?? 5} demo emails.` }
        : { type: 'error', text: res.error ?? 'Failed to load demo data.' }
    );
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || busy}
        className="btn btn-ghost w-full"
        title="Fill the queue with the five sample emails from the PRD"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin-smooth" /> : <Database className="w-4 h-4" />}
        Load Demo Data
      </button>
      {message && (
        <p
          className={`text-[11.5px] flex items-center gap-1.5 ${message.type === 'success' ? '' : ''}`}
          role="status"
          aria-live="polite"
          style={{ color: message.type === 'success' ? '#16815B' : '#B24545' }}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5" />
          )}
          {message.text}
        </p>
      )}
    </div>
  );
}
