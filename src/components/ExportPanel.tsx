import { FileDown, FileText, BarChart3, CheckCircle, XCircle, TrendingUp } from 'lucide-react';
import type { Email, Stats } from '../types/email';
import { downloadCSV, downloadJSON } from '../utils/exportReport';

interface ExportPanelProps {
  emails: Email[];
  stats: Stats;
}

export function ExportPanel({ emails, stats }: ExportPanelProps) {
  const processedEmails = emails.filter((e) => e.status === 'DELIVERED' || e.status === 'FAILED');
  const hasData = processedEmails.length > 0;
  const processed = stats.delivered + stats.failed;

  return (
    <div
      className="rounded-2xl p-5 space-y-5"
      style={{
        background: 'linear-gradient(160deg, rgba(14,18,28,0.95) 0%, rgba(8,11,18,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
        <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
        Dispatch Summary &amp; Export
      </h2>

      {/* Stats table */}
      <div
        className="rounded-xl p-4 space-y-2"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
      >
        {processed > 0 && (
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/[0.05]">
            <TrendingUp className="w-4 h-4" style={{ color: '#34d399' }} />
            <span className="text-sm font-bold" style={{ color: '#6ee7b7' }}>
              {stats.pending === 0 && stats.processing === 0 && stats.retrying === 0
                ? 'DISPATCH COMPLETE'
                : 'IN PROGRESS'}
            </span>
          </div>
        )}

        {[
          { label: 'Total Emails',    value: stats.total,        color: '#60a5fa' },
          { label: 'Delivered',        value: stats.delivered,    color: '#34d399' },
          { label: 'Failed',           value: stats.failed,       color: '#f87171' },
          { label: 'Pending',          value: stats.pending,      color: '#64748b' },
          { label: 'Total Attempts',   value: stats.totalAttempts, color: '#a78bfa' },
          { label: 'Total Retries',    value: stats.totalRetries, color: '#fbbf24' },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between text-sm">
            <span style={{ color: '#4b5563' }}>{item.label}</span>
            <span className="font-mono font-bold tabular-nums" style={{ color: item.color }}>
              {item.value}
            </span>
          </div>
        ))}

        {processed > 0 && (
          <div className="pt-2 mt-1 border-t border-white/[0.05] space-y-2">
            {[
              { label: 'Success Rate', value: `${stats.successRate}%`, color: '#34d399' },
              { label: 'Failure Rate', value: `${stats.failureRate}%`, color: '#f87171' },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between text-sm">
                <span style={{ color: '#4b5563' }}>{r.label}</span>
                <span className="font-mono font-bold" style={{ color: r.color }}>{r.value}</span>
              </div>
            ))}
            {/* Success bar */}
            <div className="w-full h-1.5 rounded-full overflow-hidden mt-1" style={{ background: 'rgba(239,68,68,0.3)' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${stats.successRate}%`,
                  background: 'linear-gradient(90deg, #059669, #34d399)',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Results table */}
      {processedEmails.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.05]">
                {['ID', 'Recipient', 'Att.', 'Ret.', 'Status'].map((h) => (
                  <th key={h} className="pb-2 font-semibold uppercase tracking-wider text-left last:text-right"
                    style={{ color: '#374151', fontSize: '10px' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {processedEmails.map((email) => (
                <tr
                  key={email.id}
                  className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
                >
                  <td className="py-1.5 font-mono font-semibold text-gray-400">{email.id}</td>
                  <td className="py-1.5 max-w-[110px] truncate" style={{ color: '#4b5563' }}>{email.recipient}</td>
                  <td className="py-1.5 text-center tabular-nums" style={{ color: '#6b7280' }}>{email.attempts}</td>
                  <td className="py-1.5 text-center tabular-nums" style={{ color: '#fbbf24' }}>{email.retries}</td>
                  <td className="py-1.5 text-right">
                    <span
                      className="inline-flex items-center gap-1 font-semibold"
                      style={{ color: email.finalStatus === 'DELIVERED' ? '#34d399' : '#f87171' }}
                    >
                      {email.finalStatus === 'DELIVERED'
                        ? <CheckCircle className="w-3 h-3" />
                        : <XCircle className="w-3 h-3" />
                      }
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
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#374151' }}>Export Report</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => downloadCSV(emails)}
            disabled={!hasData}
            className="btn flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: hasData ? 'linear-gradient(135deg, #0e7490, #0891b2)' : 'rgba(255,255,255,0.05)' }}
          >
            <FileText className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={() => downloadJSON(emails)}
            disabled={!hasData}
            className="btn flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: hasData ? 'linear-gradient(135deg, #4338ca, #6d28d9)' : 'rgba(255,255,255,0.05)' }}
          >
            <FileDown className="w-4 h-4" />
            JSON
          </button>
        </div>
        {!hasData && (
          <p className="text-xs text-center" style={{ color: '#374151' }}>Process emails first to enable export</p>
        )}
      </div>
    </div>
  );
}
