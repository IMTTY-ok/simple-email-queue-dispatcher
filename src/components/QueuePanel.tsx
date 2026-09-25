import { Layers, ArrowDown } from 'lucide-react';
import type { Email } from '../types/email';
import { QueueItem } from './QueueItem';

interface QueuePanelProps {
  emails: Email[];
  currentProcessingId: string | null;
  onRemove?: (id: string) => void;
}

const ACTIVE_STATUSES = ['QUEUED', 'SENDING', 'RETRYING'];

export function QueuePanel({ emails, currentProcessingId, onRemove }: QueuePanelProps) {
  const activeCount = emails.filter((e) => ACTIVE_STATUSES.includes(e.status)).length;

  // Build positions only for queued/active
  const positionMap: Record<string, number> = {};
  let pos = 1;
  for (const e of emails) {
    if (ACTIVE_STATUSES.includes(e.status)) {
      positionMap[e.id] = pos++;
    }
  }

  return (
    <div
      className="flex flex-col h-full rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, rgba(14,18,28,0.95) 0%, rgba(8,11,18,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Panel header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/[0.05]">
        <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-blue-400" />
          Email Queue
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600 font-mono">FIFO</span>
          <span
            className="px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{
              background: 'rgba(37,99,235,0.15)',
              border: '1px solid rgba(99,102,241,0.3)',
              color: '#93c5fd',
            }}
          >
            {activeCount} pending
          </span>
        </div>
      </div>

      {/* Queue body */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {emails.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-12 animate-fade-up">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <Layers className="w-6 h-6 text-gray-700" />
            </div>
            <p className="text-gray-500 text-sm font-medium">Queue is empty</p>
            <p className="text-gray-700 text-xs mt-1">Add emails using the form below</p>
          </div>
        ) : (
          <div>
            {/* FRONT label */}
            <div className="flex items-center gap-2 mb-2 px-0.5">
              <span className="text-xs font-mono font-bold" style={{ color: '#60a5fa' }}>FRONT</span>
              <div className="flex-1 border-t border-dashed border-blue-900/40" />
              <ArrowDown className="w-3 h-3 text-blue-800" />
            </div>

            <div className="space-y-2">
              {emails.map((email, idx) => (
                <div key={email.id}>
                  <QueueItem
                    email={email}
                    position={positionMap[email.id] ?? idx + 1}
                    isActive={email.id === currentProcessingId}
                    onRemove={onRemove}
                  />
                  {idx < emails.length - 1 && (
                    <div className="flex justify-center my-1">
                      <ArrowDown className="w-3 h-3 text-gray-800" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* REAR label */}
            <div className="flex items-center gap-2 mt-2 px-0.5">
              <ArrowDown className="w-3 h-3 text-gray-800" />
              <div className="flex-1 border-t border-dashed border-gray-800/60" />
              <span className="text-xs font-mono font-bold text-gray-600">REAR</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}