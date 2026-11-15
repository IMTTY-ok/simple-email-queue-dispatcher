import { FileDown, FileText, TrendingUp, CheckCircle, XCircle, CalendarClock } from 'lucide-react';
import type { Email, Stats } from '../../../shared/types/email';
import { downloadCSV, downloadJSON } from '../utils/exportReport';

interface ExportPanelProps {
  emails: Email[];
  stats: Stats;
}

/**
 * Module 5 — Summary Exporter.
 *
 * The dispatch summary and the CSV / JSON export. The export format is the
 * one the project has always produced — the scheduling columns are appended
 * at the end, so an existing report stays readable.
 */
export function ExportPanel({ emails, stats }: ExportPanelProps) {
  const processedEmails = emails.filter((e) => e.status === 'DELIVERED' || e.status === 'FAILED');
  const hasData = processedEmails.length > 0;
  const processed = stats.delivered + stats.failed;

  return (
    <div className="space-y-3">
      {processed > 0 && (
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4" style={{ color: '#16815B' }} />
          <span className="text-[12px] font-bold" style={{ color: '#16815B' }}>
            {stats.queued === 0 && stats.sending === 0 && stats.retrying === 0 && stats.scheduled === 0
              ? 'DISPATCH COMPLETE'
              : 'IN PROGRESS'}
          </span>
        </div>
      )}

      {/* Counter table */}
      <div className="rounded-control border border-hairline divide-y divide-[#E4EAF2]">
        {[
          { label: 'Total tasks', value: stats.total, color: '#24436A' },
          { label: 'Delivered', value: stats.delivered, color: '#16815B' },
          { label: 'Failed', value: stats.failed, color: '#B24545' },
          { label: 'Queued', value: stats.queued, color: '#465F7B' },
          { label: 'Scheduled', value: stats.scheduled, color: '#172A43' },
          { label: 'Cancelled', value: stats.cancelled, color: '#8A9BB0' },
          { label: 'Total attempts', value: stats.totalAttempts, color: '#24436A' },
          { label: 'Total retries', value: stats.totalRetries, color: '#A56B18' },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between px-3 py-1.5">
            <span className="text-[12px] text-ink-muted">{item.label}</span>
            <span className="text-[12.5px] font-bold tabular" style={{ color: item.color }}>
              {item.value}
            </span>
          </div>
        ))}

        {processed > 0 && (
          <div className="px-3 py-2 space-y-1.5">
            {[
              { label: 'Success rate', value: `${stats.successRate}%`, color: '#16815B' },
              { label: 'Failure rate', value: `${stats.failureRate}%`, color: '#B24545' },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-[12px] text-ink-muted">{r.label}</span>
                <span className="text-[12.5px] font-bold tabular" style={{ color: r.color }}>
                  {r.value}
                </span>
              </div>
            ))}
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#EFCACA' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${stats.successRate}%`, background: '#16815B' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Results table */}
      {processedEmails.length > 0 && (
        <div className="table-wrap border border-hairline rounded-control scroll-y max-h-[280px]">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Recipient</th>
                <th>Att.</th>
                <th>Ret.</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {processedEmails.map((email) => (
                <tr key={email.id}>
                  <td className="mono font-semibold text-navy-900 whitespace-nowrap">{email.id}</td>
                  <td className="max-w-[130px] truncate text-ink-muted">{email.recipient}</td>
                  <td className="text-center tabular text-ink-muted">{email.attempts}</td>
                  <td className="text-center tabular" style={{ color: '#A56B18' }}>
                    {email.retries}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <span
                      className="inline-flex items-center gap-1 font-semibold"
                      style={{ color: email.finalStatus === 'DELIVERED' ? '#16815B' : '#B24545' }}
                    >
                      {email.finalStatus === 'DELIVERED' ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      {email.finalStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Export buttons */}
      <div className="space-y-1.5">
        <p className="field-label">Export report</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => downloadCSV(emails)}
            disabled={!hasData}
            className="btn btn-ghost"
            title="Download the dispatch report as CSV"
          >
            <FileText className="w-4 h-4" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => downloadJSON(emails, stats)}
            disabled={!hasData}
            className="btn btn-ghost"
            title="Download the dispatch report as JSON"
          >
            <FileDown className="w-4 h-4" />
            JSON
          </button>
        </div>
        {!hasData && (
          <p className="text-[11.5px] text-ink-faint flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5" />
            Process emails first to enable the export.
          </p>
        )}
      </div>
    </div>
  );
}
