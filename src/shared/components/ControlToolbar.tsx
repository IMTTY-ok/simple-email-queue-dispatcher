import { Play, Pause, Square, RotateCcw, Loader2, FlaskConical } from 'lucide-react';

interface ControlToolbarProps {
  isProcessing: boolean;
  isPaused: boolean;
  /** How many emails are waiting in the FIFO queue. */
  queuedCount: number;
  /** Is the installation in dry-run mode? */
  dryRun: boolean;
  /** The name of the action currently running, or `null`. */
  busy: string | null;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onReset: () => void;
}

/**
 * The dispatcher control bar.
 *
 * The four controls the operator uses to drive the queue. Every button
 * reports its own loading and disabled state, and `RESET QUEUE` always asks
 * for a confirmation because it removes the queued emails.
 */
export function ControlToolbar({
  isProcessing,
  isPaused,
  queuedCount,
  dryRun,
  busy,
  onStart,
  onPause,
  onStop,
  onReset,
}: ControlToolbarProps) {
  const idle = !isProcessing || isPaused;

  return (
    <div className="toolbar">
      <button
        type="button"
        className="btn btn-primary"
        onClick={onStart}
        disabled={busy !== null || !idle}
        title={isPaused ? 'Resume the dispatch' : 'Start dispatching the queue'}
      >
        {busy === 'start' ? (
          <Loader2 className="w-4 h-4 animate-spin-smooth" />
        ) : (
          <Play className="w-4 h-4" fill="currentColor" />
        )}
        {isPaused ? 'Resume Dispatch' : 'Start Dispatch'}
      </button>

      <button
        type="button"
        className="btn btn-amber"
        onClick={onPause}
        disabled={busy !== null || !isProcessing || isPaused}
        title="Pause the dispatch"
      >
        {busy === 'pause' ? (
          <Loader2 className="w-4 h-4 animate-spin-smooth" />
        ) : (
          <Pause className="w-4 h-4" fill="currentColor" />
        )}
        Pause
      </button>

      <button
        type="button"
        className="btn btn-red"
        onClick={onStop}
        disabled={busy !== null || (!isProcessing && !isPaused)}
        title="Stop the dispatcher"
      >
        {busy === 'stop' ? (
          <Loader2 className="w-4 h-4 animate-spin-smooth" />
        ) : (
          <Square className="w-4 h-4" fill="currentColor" />
        )}
        Stop
      </button>

      <button
        type="button"
        className="btn btn-ghost"
        onClick={onReset}
        disabled={busy !== null}
        title="Clear the queue, the activity log and the statistics"
      >
        {busy === 'reset' ? (
          <Loader2 className="w-4 h-4 animate-spin-smooth" />
        ) : (
          <RotateCcw className="w-4 h-4" />
        )}
        Reset Queue
      </button>

      <div className="flex-1" />

      <p className="text-[11.5px] text-ink-muted flex items-center gap-1.5">
        {dryRun ? (
          <>
            <FlaskConical className="w-3.5 h-3.5 shrink-0" style={{ color: '#A56B18' }} />
            <span style={{ color: '#A56B18' }}>
              DRY-RUN mode is active; no external email is sent.
            </span>
          </>
        ) : (
          <>
            <span className="status-dot status-dot-live" />
            Live mode — emails are sent for real over SMTP.
          </>
        )}
      </p>

      <p className="text-[11.5px] text-ink-muted tabular">
        {queuedCount} email{queuedCount !== 1 ? 's' : ''} waiting
      </p>
    </div>
  );
}
