import { useEffect, useRef, useState } from 'react';
import { Mail, CheckCircle, XCircle, Clock, RefreshCw, Zap, CalendarClock, Ban } from 'lucide-react';
import type { Stats } from '../../../shared/types/email';

interface StatsCardsProps {
  stats: Stats;
}

/** Smoothly animates a number from its previous value to the new value */
function useAnimatedValue(value: number, duration = 400) {
  const [display, setDisplay] = useState(value);
  const current = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (current.current === value) return;
    // start from the number actually on screen, not a stale animation start
    const start = current.current;
    const end = value;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(start + (end - start) * eased);
      current.current = next;
      setDisplay(next);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else current.current = end;
    };

    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration]);

  return display;
}

interface StatCardProps {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ReactNode;
  color: string;
  sub?: string;
}

function StatCard({ label, value, suffix = '', icon, color, sub }: StatCardProps) {
  const animated = useAnimatedValue(value);

  return (
    <div
      className="rounded-card border border-hairline bg-surface-card px-3 py-2.5 transition-colors hover:border-[#A9B9CB]"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest font-bold text-ink-muted">{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="mt-1 text-[22px] font-extrabold leading-none tabular" style={{ color }}>
        {animated}
        {suffix}
      </div>
      {sub && <p className="text-[10.5px] text-ink-faint mt-0.5 leading-tight">{sub}</p>}
    </div>
  );
}

/**
 * Module 5 — Summary Exporter.
 *
 * The live statistics of the installation. `Scheduled` and `Cancelled` were
 * added by Module 6 — Scheduled Delivery; the other counters are unchanged.
 */
export function StatsCards({ stats }: StatsCardsProps) {
  const processed = stats.delivered + stats.failed;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
      <StatCard
        label="Total tasks"
        value={stats.total}
        icon={<Mail className="w-4 h-4" />}
        color="#24436A"
        sub="emails in system"
      />
      <StatCard
        label="Delivered"
        value={stats.delivered}
        icon={<CheckCircle className="w-4 h-4" />}
        color="#16815B"
        sub={processed > 0 ? `${stats.successRate}% success` : 'awaiting processing'}
      />
      <StatCard
        label="Failed"
        value={stats.failed}
        icon={<XCircle className="w-4 h-4" />}
        color="#B24545"
        sub={processed > 0 ? `${stats.failureRate}% failure` : 'awaiting processing'}
      />
      <StatCard
        label="Queued"
        value={stats.queued}
        icon={<Clock className="w-4 h-4" />}
        color="#465F7B"
        sub="waiting in queue"
      />
      <StatCard
        label="Scheduled"
        value={stats.scheduled}
        icon={<CalendarClock className="w-4 h-4" />}
        color="#172A43"
        sub="waiting for their moment"
      />
      <StatCard
        label="Cancelled"
        value={stats.cancelled}
        icon={<Ban className="w-4 h-4" />}
        color="#8A9BB0"
        sub="schedules called off"
      />
    </div>
  );
}

/** The secondary counters — attempts, retries and the success rate. */
export function StatsDetails({ stats }: StatsCardsProps) {
  const processed = stats.delivered + stats.failed;

  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: 'Attempts', value: stats.totalAttempts, icon: <Zap className="w-3.5 h-3.5" />, color: '#24436A' },
        { label: 'Retries', value: stats.totalRetries, icon: <RefreshCw className="w-3.5 h-3.5" />, color: '#A56B18' },
        {
          label: 'Success rate',
          value: processed > 0 ? stats.successRate : 0,
          suffix: '%',
          icon: <CheckCircle className="w-3.5 h-3.5" />,
          color: '#16815B',
        },
      ].map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-2 rounded-control border border-hairline px-2.5 py-2"
        >
          <span style={{ color: item.color }}>{item.icon}</span>
          <div className="min-w-0">
            <div className="text-[15px] font-bold leading-none tabular" style={{ color: item.color }}>
              {item.value}
              {item.suffix ?? ''}
            </div>
            <div className="text-[10.5px] text-ink-muted mt-0.5 truncate">{item.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
