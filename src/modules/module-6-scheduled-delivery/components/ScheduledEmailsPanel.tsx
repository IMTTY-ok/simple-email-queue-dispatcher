import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Ban,
  RefreshCw,
  Eye,
  X,
  Loader2,
  Inbox,
  AlertCircle,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import type { Email, EmailStatus } from '../../../shared/types/email';
import { timeZoneOptions } from '../constants/timezones';
import {
  browserTimeZone,
  describeInTimeZone,
  humanizeRemaining,
  toLocalDateTimeValue,
  validateSchedule,
} from '../utils/time';

interface ScheduledEmailsPanelProps {
  /** Every live email the signed-in account may see. */
  emails: Email[];
  loading?: boolean;
  error?: string | null;
  onCancel: (id: string) => Promise<{ success: boolean; error?: string }>;
  onReschedule: (
    id: string,
    scheduledAt: string,
    timezone: string
  ) => Promise<{ success: boolean; error?: string }>;
  onRunDue?: () => Promise<{ success: boolean; error?: string; dispatched?: number }>;
}

type StatusFilter = 'ALL' | EmailStatus;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'SENDING', label: 'Sending' },
  { value: 'RETRYING', label: 'Retrying' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: 'badge-navy',
  SENDING: 'badge-navy',
  RETRYING: 'badge-amber',
  DELIVERED: 'badge-green',
  FAILED: 'badge-red',
  CANCELLED: 'badge-slate',
};

const PAGE_SIZE = 10;

/**
 * Module 6 — Scheduled Delivery.
 *
 * The dedicated management view for scheduled deliveries.
 *
 * It is fed by the same live `emails` subscription the rest of the dashboard
 * uses, so the Firestore security rules decide who sees what: an operator
 * only ever sees their own scheduled emails, an administrator sees all of
 * them. The full message body is deliberately not part of the table — it is
 * only shown when the user explicitly asks for it.
 */
export function ScheduledEmailsPanel({
  emails,
  loading = false,
  error = null,
  onCancel,
  onReschedule,
  onRunDue,
}: ScheduledEmailsPanelProps) {
  const zone = useMemo(() => browserTimeZone(), []);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [viewing, setViewing] = useState<Email | null>(null);
  const [editing, setEditing] = useState<Email | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editZone, setEditZone] = useState(zone);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  /** Only scheduled-origin emails belong in this view. */
  const scheduled = useMemo(
    () => emails.filter((email) => email.deliveryMode === 'SCHEDULED'),
    [emails]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scheduled.filter((email) => {
      if (needle) {
        const haystack = `${email.id} ${email.recipient} ${email.subject}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (status !== 'ALL' && email.status !== status) return false;

      const at = email.scheduledAt ? Date.parse(email.scheduledAt) : null;
      if (fromDate && at !== null) {
        if (at < Date.parse(`${fromDate}T00:00:00Z`)) return false;
      }
      if (toDate && at !== null) {
        if (at > Date.parse(`${toDate}T23:59:59Z`)) return false;
      }
      return true;
    });
  }, [scheduled, query, status, fromDate, toDate]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, status, fromDate, toDate]);

  const handleCancel = async (email: Email) => {
    if (!window.confirm(`Cancel the scheduled delivery to ${email.recipient}?`)) return;
    setBusyId(email.id);
    setMessage(null);
    const result = await onCancel(email.id);
    setBusyId(null);
    setMessage(
      result.success
        ? { type: 'success', text: `${email.id} cancelled.` }
        : { type: 'error', text: result.error ?? 'The schedule could not be cancelled.' }
    );
  };

  const openEditor = (email: Email) => {
    const at = email.scheduledAt ? new Date(email.scheduledAt) : new Date(Date.now() + 3600_000);
    const tz = email.timezone || zone;
    const value = toLocalDateTimeValue(at, tz);
    setEditDate(value.slice(0, 10));
    setEditTime(value.slice(11, 16));
    setEditZone(tz);
    setEditError(null);
    setEditing(email);
  };

  const saveEditor = async () => {
    if (!editing) return;
    const localValue = `${editDate}T${editTime}`;
    const check = validateSchedule(localValue, editZone, Date.now());
    if (!check.ok) {
      setEditError(check.error);
      return;
    }
    setBusyId(editing.id);
    setEditError(null);
    const result = await onReschedule(editing.id, localValue, editZone);
    setBusyId(null);
    if (!result.success) {
      setEditError(result.error ?? 'The schedule could not be moved.');
      return;
    }
    setEditing(null);
    setMessage({ type: 'success', text: `${editing.id} moved to ${describeInTimeZone(check.utc, editZone)}.` });
  };

  const handleRunDue = async () => {
    if (!onRunDue) return;
    setBusyId('sweep');
    const result = await onRunDue();
    setBusyId(null);
    setMessage(
      result.success
        ? { type: 'success', text: `Scheduler sweep finished — ${result.dispatched ?? 0} email(s) delivered.` }
        : { type: 'error', text: result.error ?? 'The sweep could not be completed.' }
    );
  };

  return (
    <section className="card">
      <header className="card-head">
        <h2 className="card-title">
          <CalendarClock className="w-3.5 h-3.5 text-navy-700" />
          SCHEDULED EMAILS
        </h2>
        <div className="flex items-center gap-2">
          <span className="badge badge-navy tabular">{scheduled.length}</span>
          {onRunDue && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleRunDue}
              disabled={busyId !== null}
              title="Ask the server to deliver every schedule that is due right now"
            >
              {busyId === 'sweep' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin-smooth" />
              ) : (
                <Clock className="w-3.5 h-3.5" />
              )}
              Run due now
            </button>
          )}
        </div>
      </header>

      {/* Filters */}
      <div className="px-3 pt-3 pb-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
          <input
            type="search"
            className="input pl-8"
            placeholder="Search id, recipient, subject…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search scheduled emails"
          />
        </div>
        <div className="relative">
          <Filter className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
          <select
            className="select pl-8"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            aria-label="Filter by status"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="scheduled-from">
            From
          </label>
          <input
            id="scheduled-from"
            type="date"
            className="input"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="scheduled-to">
            To
          </label>
          <input
            id="scheduled-to"
            type="date"
            className="input"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
      </div>

      {message && (
        <div className="px-3 pb-2">
          <p
            className={`notice ${message.type === 'success' ? 'notice-green' : 'notice-red'}`}
            role="status"
            aria-live="polite"
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            )}
            <span>{message.text}</span>
          </p>
        </div>
      )}

      {/* Table */}
      <div className="table-wrap border-t border-hairline-soft">
        {loading ? (
          <div className="empty-state">
            <Loader2 className="w-5 h-5 animate-spin-smooth text-ink-faint" />
            <p className="empty-state-hint">Loading scheduled emails…</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <AlertCircle className="w-5 h-5 text-[#B24545]" />
            <p className="empty-state-title">The scheduled emails could not be loaded</p>
            <p className="empty-state-hint">{error}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <Inbox className="w-6 h-6 text-ink-faint" />
            <p className="empty-state-title">
              {scheduled.length === 0 ? 'No scheduled emails yet' : 'Nothing matches these filters'}
            </p>
            <p className="empty-state-hint">
              {scheduled.length === 0
                ? 'Pick “Schedule for later” in the Email Queue Creator to plan a delivery.'
                : 'Try a different search term, status or date range.'}
            </p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Email ID</th>
                <th>Recipient</th>
                <th>Subject</th>
                <th>Scheduled For</th>
                <th>Timezone</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((email) => {
                const due = email.scheduledAt ? Date.parse(email.scheduledAt) : null;
                const remaining = due !== null ? due - now : null;
                const eligible = email.status === 'SCHEDULED';
                return (
                  <tr key={email.id}>
                    <td className="mono font-semibold text-navy-900 whitespace-nowrap">{email.id}</td>
                    <td className="max-w-[190px] truncate">{email.recipient}</td>
                    <td className="max-w-[190px] truncate text-ink-muted">{email.subject}</td>
                    <td className="whitespace-nowrap">
                      {email.scheduledAt
                        ? describeInTimeZone(new Date(email.scheduledAt), email.timezone || 'UTC')
                        : '—'}
                      {remaining !== null && eligible && remaining > 0 && (
                        <span className="block text-[11px] text-ink-faint">
                          in {humanizeRemaining(remaining)}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-ink-muted">{email.timezone || '—'}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[email.status] ?? 'badge-slate'}`}>
                        {email.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setViewing(email)}
                          title="View the message"
                          aria-label={`View ${email.id}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => openEditor(email)}
                          disabled={!eligible || busyId !== null}
                          title={eligible ? 'Move to another moment' : 'Only a scheduled email can be moved'}
                          aria-label={`Reschedule ${email.id}`}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleCancel(email)}
                          disabled={!eligible || busyId !== null}
                          title={eligible ? 'Cancel this delivery' : 'Only a scheduled email can be cancelled'}
                          aria-label={`Cancel ${email.id}`}
                          style={eligible ? { color: '#B24545' } : undefined}
                        >
                          {busyId === email.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin-smooth" />
                          ) : (
                            <Ban className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-hairline-soft">
          <p className="text-[11.5px] text-ink-muted tabular">
            {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of{' '}
            {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11.5px] text-ink-muted tabular px-1">
              {currentPage} / {pageCount}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage >= pageCount}
              aria-label="Next page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Reschedule editor */}
      {editing && (
        <div className="px-3 py-3 border-t border-hairline-soft bg-surface-head">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-navy-900">
              Move {editing.id}
            </h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setEditing(null)}
              aria-label="Close the reschedule editor"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="field-label" htmlFor="edit-date">
                New date
              </label>
              <input
                id="edit-date"
                type="date"
                className="input"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="edit-time">
                New time
              </label>
              <input
                id="edit-time"
                type="time"
                className="input"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="edit-zone">
                Timezone
              </label>
              <select
                id="edit-zone"
                className="select"
                value={editZone}
                onChange={(e) => setEditZone(e.target.value)}
              >
                {timeZoneOptions(zone).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {editError && (
            <p className="notice notice-red mt-2" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              <span>{editError}</span>
            </p>
          )}
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={saveEditor}
              disabled={busyId !== null}
            >
              {busyId === editing.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin-smooth" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Save new time
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Message viewer */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(23, 42, 67, 0.45)' }}
          role="dialog"
          aria-modal="true"
          aria-label={`Email ${viewing.id}`}
          onClick={() => setViewing(null)}
        >
          <div
            className="card w-full max-w-lg max-h-[85vh] overflow-auto animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="card-head sticky top-0">
              <h2 className="card-title">{viewing.id}</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setViewing(null)}
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </header>
            <div className="card-body space-y-3">
              <dl className="text-[12.5px] space-y-1.5">
                <div className="flex gap-3">
                  <dt className="text-ink-muted w-24 shrink-0">Recipient</dt>
                  <dd className="font-medium break-all">{viewing.recipient}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="text-ink-muted w-24 shrink-0">Subject</dt>
                  <dd className="font-medium break-words">{viewing.subject}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="text-ink-muted w-24 shrink-0">Scheduled</dt>
                  <dd>
                    {viewing.scheduledAt
                      ? describeInTimeZone(
                          new Date(viewing.scheduledAt),
                          viewing.timezone || 'UTC'
                        )
                      : '—'}
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="text-ink-muted w-24 shrink-0">Status</dt>
                  <dd>
                    <span className={`badge ${STATUS_BADGE[viewing.status] ?? 'badge-slate'}`}>
                      {viewing.status}
                    </span>
                  </dd>
                </div>
              </dl>
              <div>
                <p className="field-label">Message</p>
                <p className="text-[12.5px] whitespace-pre-wrap break-words border border-hairline rounded-control p-3 bg-surface-head">
                  {viewing.message}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
