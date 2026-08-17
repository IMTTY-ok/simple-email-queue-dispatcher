import { RefreshCw, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';
import type { Email, EmailStatus } from '../types/email';
import { formatTime } from '../utils/queue';

interface QueueItemProps {
  email: Email;
  position: number;
  isActive: boolean;
}

const STATUS_CONFIG: Record<EmailStatus, {
  label: string;
  icon: React.ReactNode;
  gradient: string;
  bg: string;
  border: string;
  text: string;
}> = {
  PENDING: {
    label: 'PENDING',
    icon: <Clock className="w-3 h-3" />,
    gradient: 'linear-gradient(135deg, #475569, #64748b)',
    bg: 'rgba(71,85,105,0.12)',
    border: 'rgba(100,116,139,0.25)',
    text: '#94a3b8',
  },
  PROCESSING: {
    label: 'PROCESSING',
    icon: <Zap className="w-3 h-3" />,
    gradient: 'linear-gradient(135deg, #2563eb, #4f46e5)',
    bg: 'rgba(37,99,235,0.14)',
    border: 'rgba(99,102,241,0.4)',
    text: '#93c5fd',
  },
  RETRYING: {
    label: 'RETRYING',
    icon: <RefreshCw className="w-3 h-3 animate-spin-smooth" />,
    gradient: 'linear-gradient(135deg, #d97706, #f59e0b)',
    bg: 'rgba(217,119,6,0.14)',
    border: 'rgba(245,158,11,0.4)',
    text: '#fcd34d',
  },
  DELIVERED: {
    label: 'DELIVERED',
    icon: <CheckCircle className="w-3 h-3" />,
    gradient: 'linear-gradient(135deg, #059669, #10b981)',
    bg: 'rgba(5,150,105,0.12)',
    border: 'rgba(16,185,129,0.3)',
    text: '#6ee7b7',
  },
  FAILED: {
    label: 'FAILED',
    icon: <XCircle className="w-3 h-3" />,
    gradient: 'linear-gradient(135deg, #dc2626, #ef4444)',
    bg: 'rgba(220,38,38,0.12)',
    border: 'rgba(239,68,68,0.3)',
    text: '#fca5a5',
  },
};

function StatusBadge({ status }: { status: EmailStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export function QueueItem({ email, position, isActive }: QueueItemProps) {
  const cfg = STATUS_CONFIG[email.status];

  return (
    <div
      className={`relative rounded-xl p-3 transition-all duration-300 animate-fade-up ${
        isActive ? 'queue-item-active' : ''
      }`}
      style={
        isActive
          ? {}
          : {
              background: 'rgba(14,18,28,0.7)',
              border: `1px solid ${cfg.border}`,
            }
      }
    >
      {/* Left accent bar — only when active */}
      {isActive && (
        <div
          className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full"
          style={{ background: 'linear-gradient(180deg, #60a5fa, #818cf8)' }}
        />
      )}

      <div className="flex items-start justify-between gap-2 pl-1">
        {/* Left: position + info */}
        <div className="flex items-start gap-2.5 min-w-0">
          {/* Position circle */}
          <div
            className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold leading-none mt-0.5 transition-all duration-300"
            style={
              isActive
                ? { background: 'linear-gradient(135deg, #2563eb, #4f46e5)', color: '#fff' }
                : { background: 'rgba(255,255,255,0.06)', color: '#64748b' }
            }
          >
            {position}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-xs text-gray-200 tracking-wide">{email.id}</span>
              {isActive && (
                <span className="text-xs font-semibold animate-pulse"
                  style={{ color: '#60a5fa' }}
                >
                  ← ACTIVE
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 truncate mt-0.5">{email.recipient}</p>
            <p className="text-xs mt-0.5 truncate" style={{ color: '#475569' }}>{email.subject}</p>
          </div>
        </div>

        {/* Right: badges */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          <StatusBadge status={email.status} />
          {email.retries > 0 && (
            <span className="text-xs flex items-center gap-1" style={{ color: '#fbbf24' }}>
              <RefreshCw className="w-3 h-3" />
              {email.retries}×
            </span>
          )}
        </div>
      </div>

      {/* Attempt mini-badges */}
      {email.logs.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/[0.05] flex flex-wrap gap-1">
          {email.logs.map((log) => (
            <span
              key={log.attempt}
              className={`text-xs px-1.5 py-0.5 rounded font-mono font-medium ${
                log.result === 'SUCCESS' ? 'attempt-badge-success' : 'attempt-badge-fail'
              }`}
              title={`Attempt ${log.attempt} at ${formatTime(log.timestamp)}`}
            >
              A{log.attempt} {log.result === 'SUCCESS' ? '✓' : '✗'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
