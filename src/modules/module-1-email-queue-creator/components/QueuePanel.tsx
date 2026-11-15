import { Layers, ArrowDown, CalendarClock } from 'lucide-react';
import type { Email } from '../../../shared/types/email';
import { QueueItem } from './QueueItem';

interface QueuePanelProps {
  emails: Email[];
  currentProcessingId: string | null;
  onRemove?: (id: string) => void;
}

const ACTIVE_STATUSES = ['QUEUED', 'SENDING', 'RETRYING'];

/**
 * Module 1 — Email Queue Creator.
 *
 * The FIFO queue, shown below the composer. Scheduled entries carry their own
 * badge and the moment they are due for, so the two pipelines never look
 * mixed up.
 */
export function QueuePanel({ emails, currentProcessingId, onRemove }: QueuePanelProps) {
  const activeCount = emails.filter((e) => ACTIVE_STATUSES.includes(e.status)).length;
  const scheduledCount = emails.filter((e) => e.status === 'SCHEDULED').length;

  // Build positions only for queued/active
  const positionMap: Record<string, number> = {};
  let pos = 1;
  for (const e of emails) {
    if (ACTIVE_STATUSES.includes(e.status)) {
      positionMap[e.id] = pos++;
    }
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 pb-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-ink-muted">Queue · FIFO</p>
        <div className="flex items-center gap-1.5">
          {scheduledCount > 0 && (
            <span className="badge badge-navy">
              <CalendarClock className="w-3 h-3" />
              {scheduledCount} scheduled
            </span>
          )}
          <span className="badge badge-slate tabular">{activeCount} pending</span>
        </div>
      </div>

      <div className="scroll-y border border-hairline rounded-control max-h-[420px]">
        {emails.length === 0 ? (
          <div className="empty-state">
            <div
              className="w-11 h-11 rounded-lg flex items-center justify-center mb-1"
              style={{ background: '#EEF2F7', border: '1px solid #CCD6E3' }}
            >
              <Layers className="w-5 h-5 text-ink-faint" />
            </div>
            <p className="empty-state-title">The queue is empty</p>
            <p className="empty-state-hint">Write an email above to fill it.</p>
          </div>
        ) : (
          <div>
            {/* FRONT label */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-head border-b border-hairline-soft">
              <span className="text-[10px] mono font-bold" style={{ color: '#24436A' }}>
                FRONT
              </span>
              <div className="flex-1 border-t border-dashed" style={{ borderColor: '#CCD6E3' }} />
              <ArrowDown className="w-3 h-3 text-ink-faint" />
            </div>

            {emails.map((email) => (
              <QueueItem
                key={email.id}
                email={email}
                position={positionMap[email.id] ?? null}
                isActive={email.id === currentProcessingId}
                onRemove={onRemove}
              />
            ))}

            {/* REAR label */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-head border-t border-hairline-soft">
              <ArrowDown className="w-3 h-3 text-ink-faint" />
              <div className="flex-1 border-t border-dashed" style={{ borderColor: '#CCD6E3' }} />
              <span className="text-[10px] mono font-bold text-ink-faint">REAR</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
