import { RefreshCw, CheckCircle, XCircle, Clock, Zap, Trash2, CalendarClock, Ban, Paperclip } from 'lucide-react';
import type { Email, EmailStatus } from '../../../shared/types/email';
import { formatTime } from '../../../shared/utils/format';
import { formatBytes } from '../utils/attachments';

interface QueueItemProps {
  email: Email;
  /** Queue position, or `null` for an email that is no longer pending. */
  position: number | null;
  isActive: boolean;
  onRemove?: (id: string) => void;
}

const STATUS_CONFIG: Record<EmailStatus, { label: string; icon: React.ReactNode; badge: string }> = {
  QUEUED: { label: 'QUEUED', icon: <Clock className="w-3 h-3" />, badge: 'badge-slate' },
  SCHEDULED: { label: 'SCHEDULED', icon: <CalendarClock className="w-3 h-3" />, badge: 'badge-navy' },
  SENDING: { label: 'SENDING', icon: <Zap className="w-3 h-3" />, badge: 'badge-navy' },
  RETRYING: { label: 'RETRYING', icon: <RefreshCw className="w-3 h-3 animate-spin-smooth" />, badge: 'badge-amber' },
  DELIVERED: { label: 'DELIVERED', icon: <CheckCircle className="w-3 h-3" />, badge: 'badge-green' },
  FAILED: { label: 'FAILED', icon: <XCircle className="w-3 h-3" />, badge: 'badge-red' },
  CANCELLED: { label: 'CANCELLED', icon: <Ban className="w-3 h-3" />, badge: 'badge-slate' },
};

export function QueueItem({ email, position, isActive, onRemove }: QueueItemProps) {
  const cfg = STATUS_CONFIG[email.status] ?? STATUS_CONFIG.QUEUED;
  const canRemove = Boolean(onRemove && email.status === 'QUEUED');
  const scheduled = email.status === 'SCHEDULED' || email.deliveryMode === 'SCHEDULED';

  return (
    <div className={`queue-row ${isActive ? 'queue-row-active' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        {/* Left: position + info */}
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          {/* Position */}
          <div
            className={`queue-position ${isActive ? 'queue-position-active' : ''}`}
            title={position !== null ? `Queue position ${position}` : undefined}
          >
            {position ?? ''}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="mono font-bold text-[11.5px] text-navy-900">{email.id}</span>
              <span className={`badge ${cfg.badge}`}>
                {cfg.icon}
                {cfg.label}
              </span>
              {isActive && (
                <span className="text-[10px] font-bold tracking-widest" style={{ color: '#24436A' }}>
                  LIVE
                </span>
              )}
            </div>

            <p className="text-[12px] text-ink-muted truncate mt-0.5">{email.recipient}</p>
            <p className="text-[12px] text-ink-faint truncate">{email.subject}</p>

            {scheduled && email.scheduledAt && (
              <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: '#24436A' }}>
                <CalendarClock className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {new Date(email.scheduledAt).toLocaleString('en-GB', {
                    timeZone: email.timezone || 'UTC',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                  {email.timezone ? ` (${email.timezone})` : ''}
                </span>
              </p>
            )}

            {email.status === 'FAILED' && email.socketErr && (
              <p className="text-[11px] mt-0.5 truncate" style={{ color: '#B24545' }} title={email.socketErr}>
                {email.socketErr}
              </p>
            )}
          </div>
        </div>

        {/* Right: attempts + removal */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          {email.retries > 0 && (
            <span className="text-[11px] flex items-center gap-1" style={{ color: '#A56B18' }}>
              <RefreshCw className="w-3 h-3" />
              {email.retries}×
            </span>
          )}
          {canRemove && onRemove && (
            <button
              type="button"
              onClick={() => onRemove(email.id)}
              className="btn btn-ghost btn-sm"
              style={{ color: '#B24545' }}
              title="Remove from queue"
              aria-label={`Remove ${email.id} from queue`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* The files that travel with the email. */}
      {email.attachments && email.attachments.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-hairline-soft flex flex-wrap gap-1">
          {email.attachments.map((file, i) => (
            <span
              key={`${email.id}-${i}`}
              className="badge badge-slate"
              title={`${file.name} — ${formatBytes(file.size)}`}
            >
              <Paperclip className="w-3 h-3" />
              <span className="max-w-[150px] truncate">{file.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Attempt history */}
      {email.logs.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-hairline-soft flex flex-wrap gap-1">
          {email.logs.map((log) => (
            <span
              key={log.attempt}
              className={`badge ${log.result === 'SUCCESS' ? 'badge-green' : 'badge-red'}`}
              title={`Attempt ${log.attempt}: ${log.result}${log.detail ? ` — ${log.detail}` : ''} (${formatTime(log.timestamp)})`}
            >
              A{log.attempt} {log.result === 'SUCCESS' ? '✓' : '✗'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
