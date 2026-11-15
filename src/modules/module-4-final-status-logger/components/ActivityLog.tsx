import {
  ScrollText,
  CheckCircle,
  XCircle,
  RefreshCw,
  Info,
  PlusCircle,
  CalendarClock,
  Play,
  Ban,
} from 'lucide-react';
import type { ActivityEntry, ActivityKind } from '../../../shared/types/email';
import { formatTime } from '../../../shared/utils/format';

interface ActivityLogProps {
  entries: ActivityEntry[];
  onClear?: () => void;
  /** Render without the surrounding card, for use inside another panel. */
  embedded?: boolean;
}

/** The indicator each kind of event gets. */
const KIND_CONFIG: Record<ActivityKind, { label: string; icon: React.ReactNode; color: string }> = {
  added: { label: 'ADDED', icon: <PlusCircle className="w-3 h-3" />, color: '#465F7B' },
  scheduled: { label: 'SCHEDULED', icon: <CalendarClock className="w-3 h-3" />, color: '#24436A' },
  dispatch: { label: 'DISPATCH', icon: <Play className="w-3 h-3" />, color: '#24436A' },
  retry: { label: 'RETRY', icon: <RefreshCw className="w-3 h-3" />, color: '#A56B18' },
  delivered: { label: 'DELIVERED', icon: <CheckCircle className="w-3 h-3" />, color: '#16815B' },
  failed: { label: 'FAILED', icon: <XCircle className="w-3 h-3" />, color: '#B24545' },
  cancelled: { label: 'CANCELLED', icon: <Ban className="w-3 h-3" />, color: '#465F7B' },
  info: { label: 'INFO', icon: <Info className="w-3 h-3" />, color: '#465F7B' },
  warning: { label: 'WARN', icon: <Info className="w-3 h-3" />, color: '#465F7B' },
};

const LINE_CLASS: Record<string, string> = {
  success: 'log-success',
  failure: 'log-failure',
  retry: 'log-retry',
  warning: 'log-warning',
  info: 'log-info',
};

/**
 * Module 4 — Final Status Logger.
 *
 * The live activity log. Every kind of event gets its own indicator, so a
 * scheduled delivery, a dispatch, a retry and a cancellation can be told
 * apart at a glance. The entries carry the real server timestamps.
 */
export function ActivityLog({ entries, onClear, embedded = false }: ActivityLogProps) {
  const body = (
    <div className="scroll-y max-h-[420px]">
      {entries.length === 0 ? (
        <div className="empty-state">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: '#EEF2F7', border: '1px solid #CCD6E3' }}
          >
            <ScrollText className="w-4 h-4 text-ink-faint" />
          </div>
          <p className="empty-state-hint">No activity yet</p>
        </div>
      ) : (
        <div>
          {entries.map((entry) => {
            const kind = (entry.kind ?? 'info') as ActivityKind;
            const cfg = KIND_CONFIG[kind] ?? KIND_CONFIG.info;
            return (
              <div
                key={entry.id}
                className={`log-entry ${LINE_CLASS[entry.type] ?? 'log-info'}`}
              >
                <span className="shrink-0 mt-px" style={{ color: cfg.color }}>
                  {cfg.icon}
                </span>
                <span
                  className="log-kind shrink-0 mt-px"
                  style={{ color: cfg.color, borderColor: cfg.color, background: 'transparent' }}
                >
                  {cfg.label}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="log-time">{formatTime(entry.timestamp)} </span>
                  <span style={{ color: 'var(--text)' }}>{entry.message}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <section className="card">
      <header className="card-head">
        <h2 className="card-title">
          <ScrollText className="w-3.5 h-3.5 text-navy-700" />
          ACTIVITY LOG
        </h2>
        <div className="flex items-center gap-2">
          <span className="badge badge-slate tabular">{entries.length}</span>
          {onClear && entries.length > 0 && (
            <button type="button" onClick={onClear} className="btn btn-ghost btn-sm">
              Clear
            </button>
          )}
        </div>
      </header>
      <div className="card-body-flush">{body}</div>
    </section>
  );
}
