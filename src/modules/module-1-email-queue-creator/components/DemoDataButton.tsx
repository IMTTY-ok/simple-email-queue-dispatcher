import { useState } from 'react';
import { Database, Loader2 } from 'lucide-react';

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
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={disabled || busy}
        className="btn w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: 'linear-gradient(135deg, #4338ca, #6d28d9)' }}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
        Load Demo Data
      </button>
      {message && (
        <p
          className="text-xs text-center animate-fade-up"
          role="status"
          aria-live="polite"
          style={{ color: message.type === 'success' ? '#6ee7b7' : '#fca5a5' }}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
