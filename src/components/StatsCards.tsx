import { useEffect, useRef, useState } from 'react';
import { Mail, CheckCircle, XCircle, Clock, RefreshCw, Zap } from 'lucide-react';
import type { Stats } from '../types/email';

interface StatsCardsProps {
  stats: Stats;
}

/** Smoothly animates a number from its previous value to the new value */
function useAnimatedValue(value: number, duration = 400) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (prev.current === value) return;
    const start = prev.current;
    const end = value;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else { prev.current = end; }
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
  gradient: string;
  glow: string;
  borderColor: string;
  sub?: string;
  large?: boolean;
}

function StatCard({ label, value, suffix = '', icon, gradient, glow, borderColor, sub, large }: StatCardProps) {
  const animated = useAnimatedValue(value);

  return (
    <div
      className={`stat-card relative rounded-2xl p-4 overflow-hidden cursor-default select-none`}
      style={{
        background: 'linear-gradient(135deg, rgba(18,24,38,0.95) 0%, rgba(10,14,22,0.98) 100%)',
        border: `1px solid ${borderColor}`,
      }}
    >
      {/* Background glow blob */}
      <div
        className="absolute -top-6 -right-6 w-20 h-20 rounded-full blur-2xl opacity-20 pointer-events-none"
        style={{ background: glow }}
      />

      <div className="relative flex items-start justify-between mb-2">
        <span className="text-xs text-gray-500 uppercase tracking-widest font-semibold">{label}</span>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
          style={{ background: gradient }}
        >
          {icon}
        </div>
      </div>

      <div className={`relative font-extrabold tabular-nums leading-none ${large ? 'text-4xl' : 'text-3xl'}`}
        style={{ background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
      >
        {animated}{suffix}
      </div>

      {sub && <p className="text-xs text-gray-600 mt-1.5 leading-tight">{sub}</p>}
    </div>
  );
}

export function StatsCards({ stats }: StatsCardsProps) {
  const processed = stats.delivered + stats.failed;

  return (
    <div className="space-y-3 stagger">
      {/* Primary 4 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="animate-fade-up">
          <StatCard
            label="Total"
            value={stats.total}
            icon={<Mail className="w-4 h-4 text-white" />}
            gradient="linear-gradient(135deg, #3b82f6, #6366f1)"
            glow="#3b82f6"
            borderColor="rgba(99,102,241,0.2)"
            sub="emails in system"
          />
        </div>
        <div className="animate-fade-up">
          <StatCard
            label="Delivered"
            value={stats.delivered}
            icon={<CheckCircle className="w-4 h-4 text-white" />}
            gradient="linear-gradient(135deg, #10b981, #34d399)"
            glow="#10b981"
            borderColor="rgba(16,185,129,0.2)"
            sub={processed > 0 ? `${stats.successRate}% success` : 'awaiting processing'}
          />
        </div>
        <div className="animate-fade-up">
          <StatCard
            label="Failed"
            value={stats.failed}
            icon={<XCircle className="w-4 h-4 text-white" />}
            gradient="linear-gradient(135deg, #ef4444, #f87171)"
            glow="#ef4444"
            borderColor="rgba(239,68,68,0.2)"
            sub={processed > 0 ? `${stats.failureRate}% failure` : 'awaiting processing'}
          />
        </div>
        <div className="animate-fade-up">
          <StatCard
            label="Pending"
            value={stats.pending}
            icon={<Clock className="w-4 h-4 text-white" />}
            gradient="linear-gradient(135deg, #64748b, #94a3b8)"
            glow="#64748b"
            borderColor="rgba(100,116,139,0.2)"
            sub="in queue"
          />
        </div>
      </div>

      {/* Secondary 3 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: 'Total Attempts',
            value: stats.totalAttempts,
            icon: <Zap className="w-3.5 h-3.5 text-white" />,
            gradient: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
            glow: '#7c3aed',
            border: 'rgba(124,58,237,0.2)',
          },
          {
            label: 'Total Retries',
            value: stats.totalRetries,
            icon: <RefreshCw className="w-3.5 h-3.5 text-white" />,
            gradient: 'linear-gradient(135deg, #d97706, #fbbf24)',
            glow: '#d97706',
            border: 'rgba(217,119,6,0.2)',
          },
          {
            label: 'Success Rate',
            value: processed > 0 ? stats.successRate : 0,
            suffix: '%',
            icon: <CheckCircle className="w-3.5 h-3.5 text-white" />,
            gradient: 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
            glow: '#0ea5e9',
            border: 'rgba(14,165,233,0.2)',
          },
        ].map((s) => (
          <div
            key={s.label}
            className="animate-fade-up flex items-center gap-3 rounded-xl px-3 py-3"
            style={{
              background: 'linear-gradient(135deg, rgba(18,24,38,0.9), rgba(10,14,22,0.95))',
              border: `1px solid ${s.border}`,
            }}
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow"
              style={{ background: s.gradient }}
            >
              {s.icon}
            </div>
            <div className="min-w-0">
              <div className="font-bold tabular-nums text-lg leading-none"
                style={{ background: s.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
              >
                <AnimNum value={s.value} />{s.suffix ?? ''}
              </div>
              <div className="text-xs text-gray-600 mt-0.5">{s.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnimNum({ value }: { value: number }) {
  const v = useAnimatedValue(value);
  return <>{v}</>;
}
