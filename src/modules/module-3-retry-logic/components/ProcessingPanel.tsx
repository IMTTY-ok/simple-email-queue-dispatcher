import { RefreshCw, CheckCircle, XCircle, Mail, Inbox, Send, CalendarClock } from 'lucide-react';
import type { Email } from '../../../shared/types/email';

interface ProcessingPanelProps {
  currentEmail: Email | null;
  isProcessing: boolean;
  isPaused: boolean;
  queuedCount: number;
  canSend: boolean;
  /** Render without the surrounding card, for use inside another panel. */
  embedded?: boolean;
}

const STATUS_META = {
  SENDING:   { text: 'Sending…', color: '#24436A', badge: 'badge-navy' },
  RETRYING:  { text: 'Retrying…', color: '#A56B18', badge: 'badge-amber' },
  DELIVERED: { text: 'Delivered!', color: '#16815B', badge: 'badge-green' },
  FAILED:    { text: 'Failed',     color: '#B24545', badge: 'badge-red' },
  QUEUED:    { text: 'Queued',     color: '#465F7B', badge: 'badge-slate' },
  SCHEDULED: { text: 'Scheduled',  color: '#24436A', badge: 'badge-navy' },
  CANCELLED: { text: 'Cancelled',  color: '#465F7B', badge: 'badge-slate' },
};

/**
 * Module 3 — Retry Logic Engine (client side).
 *
 * The live view of the task the dispatcher is working on right now: its id,
 * its status, the attempt it is on and the attempt history.
 */
export function ProcessingPanel({
  currentEmail,
  isProcessing,
  isPaused,
  queuedCount,
  canSend,
  embedded = false,
}: ProcessingPanelProps) {
  const meta = currentEmail ? STATUS_META[currentEmail.status] : null;

  const totalAttempts = currentEmail ? currentEmail.retryLimit + 1 : 0;
  const rawProgress = currentEmail ? (currentEmail.attempts / totalAttempts) * 100 : 0;
  const progressPercent = Math.max(
    rawProgress,
    currentEmail?.status === 'SENDING' || currentEmail?.status === 'RETRYING' ? 8 : 0
  );

  const body = (
    <div className="space-y-3">
      {/* Empty / idle */}
      {!currentEmail && !isProcessing && (
        <div className="empty-state">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center"
            style={{ background: '#EEF2F7', border: '1px solid #CCD6E3' }}
          >
            <Inbox className="w-5 h-5 text-ink-faint" />
          </div>
          <p className="empty-state-title">No active processing</p>
          <p className="empty-state-hint">
            {queuedCount > 0
              ? `${queuedCount} email${queuedCount !== 1 ? 's' : ''} waiting — click Start Dispatch`
              : 'Add an email and click Start Dispatch'}
          </p>
        </div>
      )}

      {/* Processing done / waiting for next */}
      {!currentEmail && isProcessing && (
        <div className="empty-state">
          <Send className="w-6 h-6 text-navy-500" />
          <p className="empty-state-title">Dispatcher running</p>
          <p className="empty-state-hint">Waiting for the next queued email…</p>
        </div>
      )}

      {/* Active email */}
      {currentEmail && (
        <div className="space-y-3 animate-fade-up">
          {/* Current task */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-control"
              style={{ background: '#E7EDF5', border: '1px solid #C8D6E7' }}
            >
              <Mail className="w-4 h-4" style={{ color: '#24436A' }} />
              <span className="mono font-extrabold text-[13px] tracking-wider" style={{ color: '#172A43' }}>
                {currentEmail.id}
              </span>
            </span>
            {meta && (
              <span className={`badge ${meta.badge}`}>
                {currentEmail.status === 'RETRYING' && <RefreshCw className="w-3 h-3 animate-spin-smooth" />}
                {currentEmail.status === 'DELIVERED' && <CheckCircle className="w-3 h-3" />}
                {currentEmail.status === 'FAILED' && <XCircle className="w-3 h-3" />}
                {meta.text}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-[12.5px] text-ink-muted truncate">{currentEmail.recipient}</p>
            <p className="text-[12px] text-ink-faint truncate">{currentEmail.subject}</p>
          </div>

          {/* A scheduled delivery keeps its own marker */}
          {currentEmail.deliveryMode === 'SCHEDULED' && currentEmail.scheduledAt && (
            <p className="text-[11.5px] flex items-center gap-1.5" style={{ color: '#24436A' }}>
              <CalendarClock className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                Scheduled delivery ·{' '}
                {new Date(currentEmail.scheduledAt).toLocaleString('en-GB', {
                  timeZone: currentEmail.timezone || 'UTC',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            </p>
          )}

          {/* SMTP detail */}
          {currentEmail.smtp?.response && currentEmail.status === 'DELIVERED' && (
            <p className="text-[11.5px] mono break-all" style={{ color: '#16815B' }}>
              ✓ {currentEmail.smtp.response}
            </p>
          )}
          {currentEmail.socketErr && currentEmail.status === 'FAILED' && (
            <p className="text-[11.5px] mono break-words" style={{ color: '#B24545' }}>
              ✗ {currentEmail.socketErr}
            </p>
          )}

          {/* Attempt progress */}
          <div>
            <div className="flex justify-between text-[11.5px] text-ink-muted mb-1.5">
              <span className="tabular">
                Attempt {currentEmail.attempts || 1} of {totalAttempts}
              </span>
              <span className="tabular">{Math.round(progressPercent)}%</span>
            </div>
            <div className="relative w-full h-2 rounded-full overflow-hidden" style={{ background: '#E4EAF2' }}>
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%`, background: '#24436A' }}
              />
            </div>
          </div>

          {/* Attempt history */}
          {currentEmail.logs.length > 0 && (
            <div className="space-y-1">
              <p className="field-label">Attempt history</p>
              {currentEmail.logs.map((log) => (
                <div
                  key={log.attempt}
                  className="flex items-center justify-between gap-2 text-[11.5px] px-2.5 py-1.5 rounded-control border"
                  style={{
                    background: log.result === 'SUCCESS' ? '#E7F4EE' : '#FBECEC',
                    borderColor: log.result === 'SUCCESS' ? '#BFE2D4' : '#EFCACA',
                  }}
                >
                  <span className="text-ink-muted tabular">Attempt {log.attempt}</span>
                  <span
                    className="font-semibold"
                    style={{ color: log.result === 'SUCCESS' ? '#16815B' : '#B24545' }}
                  >
                    {log.result === 'SUCCESS' ? '✓ SUCCESS' : '✗ FAILED'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11.5px] text-ink-muted border-t border-hairline-soft pt-2 tabular">
            {queuedCount} email{queuedCount !== 1 ? 's' : ''} remaining in queue
          </p>
        </div>
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <section className="card">
      <header className="card-head">
        <h2 className="card-title">PROCESSING</h2>
        <div className="flex items-center gap-1.5">
          {isPaused && <span className="badge badge-amber">PAUSED</span>}
          {isProcessing && !isPaused && <span className="badge badge-navy">LIVE</span>}
          {!canSend && <span className="badge badge-amber">DRY-RUN</span>}
        </div>
      </header>
      <div className="card-body">{body}</div>
    </section>
  );
}
