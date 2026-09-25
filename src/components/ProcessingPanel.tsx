import { Cpu, RefreshCw, CheckCircle, XCircle, Mail, Inbox, Send } from 'lucide-react';
import type { Email } from '../types/email';

interface ProcessingPanelProps {
  currentEmail: Email | null;
  isProcessing: boolean;
  isPaused: boolean;
  queuedCount: number;
  canSend: boolean;
}

const STATUS_META = {
  SENDING:   { text: 'Sending…', color: '#60a5fa', gradient: 'linear-gradient(135deg,#2563eb,#4f46e5)' },
  RETRYING:  { text: 'Retrying…', color: '#fcd34d', gradient: 'linear-gradient(135deg,#d97706,#f59e0b)' },
  DELIVERED: { text: 'Delivered!', color: '#6ee7b7', gradient: 'linear-gradient(135deg,#059669,#10b981)' },
  FAILED:    { text: 'Failed',     color: '#fca5a5', gradient: 'linear-gradient(135deg,#dc2626,#ef4444)' },
  QUEUED:    { text: 'Queued',     color: '#94a3b8', gradient: 'linear-gradient(135deg,#475569,#64748b)' },
};

export function ProcessingPanel({
  currentEmail,
  isProcessing,
  isPaused,
  queuedCount,
  canSend,
}: ProcessingPanelProps) {
  const meta = currentEmail ? STATUS_META[currentEmail.status] : null;

  const totalAttempts = currentEmail ? currentEmail.retryLimit + 1 : 0;
  const rawProgress = currentEmail ? (currentEmail.attempts / totalAttempts) * 100 : 0;
  const progressPercent = Math.max(
    rawProgress,
    currentEmail?.status === 'SENDING' || currentEmail?.status === 'RETRYING' ? 8 : 0
  );

  return (
    <div
      className="flex flex-col h-full rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, rgba(14,18,28,0.95) 0%, rgba(8,11,18,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/[0.05]">
        <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-purple-400" />
          Processing
        </h2>
        <div className="flex items-center gap-1.5">
          {isPaused && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold animate-pulse"
              style={{ background: 'rgba(217,119,6,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#fcd34d' }}
            >
              PAUSED
            </span>
          )}
          {isProcessing && !isPaused && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#93c5fd' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse-dot" />
              LIVE
            </span>
          )}
          {!canSend && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(217,119,6,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#fcd34d' }}
            >
              DRY-RUN
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 flex flex-col overflow-y-auto">
        {/* Empty / idle */}
        {!currentEmail && !isProcessing && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 animate-fade-up">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <Inbox className="w-7 h-7 text-gray-700 animate-bounce-subtle" />
            </div>
            <p className="text-gray-500 text-sm font-medium">No active processing</p>
            <p className="text-gray-700 text-xs mt-1">
              {queuedCount > 0
                ? `${queuedCount} email${queuedCount !== 1 ? 's' : ''} waiting — click Start`
                : 'Add emails and click Start'}
            </p>
          </div>
        )}

        {/* Processing done / waiting for next */}
        {!currentEmail && isProcessing && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 animate-fade-up">
            <Send className="w-10 h-10 text-purple-700 mb-3 animate-pulse" />
            <p className="text-gray-400 text-sm font-medium">Dispatcher running</p>
            <p className="text-gray-600 text-xs mt-1">Waiting for next queued email…</p>
          </div>
        )}

        {/* Active email */}
        {currentEmail && (
          <div className="space-y-4 animate-scale-in">
            {/* Email ID chip */}
            <div className="flex flex-col items-center gap-1">
              <div
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl"
                style={{
                  background: 'rgba(37,99,235,0.12)',
                  border: '1px solid rgba(99,102,241,0.3)',
                }}
              >
                <Mail className="w-4 h-4 text-blue-400" />
                <span className="font-mono font-extrabold text-blue-300 text-sm tracking-widest">
                  {currentEmail.id}
                </span>
              </div>
              <p className="text-xs text-gray-600 truncate max-w-full">{currentEmail.recipient}</p>
              <p className="text-xs truncate max-w-full" style={{ color: '#334155' }}>{currentEmail.subject}</p>
            </div>

            {/* Status display */}
            {meta && (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="text-xl font-extrabold flex items-center gap-2 transition-all duration-300"
                  style={{ color: meta.color }}
                >
                  {currentEmail.status === 'RETRYING' && (
                    <RefreshCw className="w-5 h-5 animate-spin-smooth" />
                  )}
                  {currentEmail.status === 'DELIVERED' && (
                    <CheckCircle className="w-5 h-5 animate-scale-in" />
                  )}
                  {currentEmail.status === 'FAILED' && (
                    <XCircle className="w-5 h-5 animate-scale-in" />
                  )}
                  <span>{meta.text}</span>
                </div>

                {/* SMTP detail */}
                {currentEmail.smtp?.response && currentEmail.status === 'DELIVERED' && (
                  <p className="text-xs font-mono text-center max-w-full truncate px-2"
                    style={{ color: '#34d399' }}>
                    ✓ {currentEmail.smtp.response}
                  </p>
                )}
                {currentEmail.socketErr && currentEmail.status === 'FAILED' && (
                  <p className="text-xs font-mono text-center max-w-full break-words px-2"
                    style={{ color: '#f87171' }}>
                    ✗ {currentEmail.socketErr}
                  </p>
                )}
              </div>
            )}

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-gray-600 mb-2">
                <span>Attempt {currentEmail.attempts || 1} of {totalAttempts}</span>
                <span className="font-mono">{Math.round(progressPercent)}%</span>
              </div>
              <div className="relative w-full h-2.5 rounded-full overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full progress-bar transition-all duration-700 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
                {(currentEmail.status === 'SENDING' || currentEmail.status === 'RETRYING') && (
                  <div
                    className="absolute inset-0 progress-bar-striped opacity-40 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                )}
              </div>
            </div>

            {/* Attempt history */}
            {currentEmail.logs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-gray-600 font-semibold uppercase tracking-wider">Attempt History</p>
                <div className="space-y-1">
                  {currentEmail.logs.map((log, i) => (
                    <div
                      key={log.attempt}
                      className="flex flex-col gap-0.5 text-xs px-3 py-2 rounded-lg animate-fade-up"
                      style={{
                        animationDelay: `${i * 50}ms`,
                        background: log.result === 'SUCCESS'
                          ? 'rgba(5,46,22,0.5)'
                          : 'rgba(69,10,10,0.5)',
                        border: log.result === 'SUCCESS'
                          ? '1px solid rgba(52,211,153,0.2)'
                          : '1px solid rgba(248,113,113,0.2)',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Attempt {log.attempt}</span>
                        <span className={`font-semibold ${log.result === 'SUCCESS' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {log.result === 'SUCCESS' ? '✓ SUCCESS' : '✗ FAILED'}
                        </span>
                      </div>
                      {log.detail && (
                        <p className="font-mono text-[10px] leading-snug opacity-70" style={{ color: log.result === 'SUCCESS' ? '#6ee7b7' : '#fca5a5' }}>
                          {log.detail}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Queue remaining */}
            <div className="mt-auto pt-3 border-t border-white/[0.05] text-center">
              <p className="text-xs text-gray-600">
                {queuedCount} email{queuedCount !== 1 ? 's' : ''} remaining in queue
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}