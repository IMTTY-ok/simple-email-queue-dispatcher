import { ScrollText, CheckCircle, XCircle, RefreshCw, Info } from 'lucide-react';
import type { ActivityEntry } from '../types/email';
import { formatTime } from '../utils/queue';

interface ActivityLogProps {
  entries: ActivityEntry[];
  onClear?: () => void;
}

const ENTRY_CONFIG = {
  success: {
    icon: <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#34d399' }} />,
    textColor: '#6ee7b7',
    lineClass: 'log-success',
  },
  failure: {
    icon: <XCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#f87171' }} />,
    textColor: '#fca5a5',
    lineClass: 'log-failure',
  },
  retry: {
    icon: <RefreshCw className="w-3.5 h-3.5 shrink-0" style={{ color: '#fbbf24' }} />,
    textColor: '#fcd34d',
    lineClass: 'log-retry',
  },
  warning: {
    icon: <Info className="w-3.5 h-3.5 shrink-0" style={{ color: '#facc15' }} />,
    textColor: '#fef08a',
    lineClass: 'log-info',
  },
  info: {
    icon: <Info className="w-3.5 h-3.5 shrink-0" style={{ color: '#60a5fa' }} />,
    textColor: '#93c5fd',
    lineClass: 'log-info',
  },
};

export function ActivityLog({ entries, onClear }: ActivityLogProps) {
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
          <ScrollText className="w-3.5 h-3.5 text-emerald-400" />
          Activity Log
        </h2>
        <div className="flex items-center gap-3">
          <span
            className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.07)',
              color: '#4b5563',
            }}
          >
            {entries.length}
          </span>
          {onClear && entries.length > 0 && (
            <button
              onClick={onClear}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              title="Clear log"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 font-mono text-xs">
        {entries.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-12 animate-fade-up">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <ScrollText className="w-4.5 h-4.5 text-gray-700" size={18} />
            </div>
            <p className="text-gray-600 text-xs">No activity yet</p>
          </div>
        ) : (
          entries.map((entry, i) => {
            const cfg = ENTRY_CONFIG[entry.type] ?? ENTRY_CONFIG.info;
            return (
              <div
                key={entry.id}
                className={`log-entry ${cfg.lineClass} flex items-start gap-2 py-1 rounded-sm animate-slide-right`}
                style={{ animationDelay: `${Math.min(i * 20, 200)}ms` }}
              >
                <span className="shrink-0 mt-px">{cfg.icon}</span>
                <div className="flex-1 min-w-0 leading-relaxed">
                  <span className="tabular-nums" style={{ color: '#374151' }}>
                    {formatTime(entry.timestamp)}{' '}
                  </span>
                  <span style={{ color: cfg.textColor }}>{entry.message}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
