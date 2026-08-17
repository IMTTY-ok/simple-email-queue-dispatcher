import { Settings, Gauge, Database, Shuffle, CheckCircle2, XCircle } from 'lucide-react';
import type { SimulationMode, ProcessingSpeed } from '../types/email';

interface SimulationControlsProps {
  mode: SimulationMode;
  retryLimit: number;
  speed: ProcessingSpeed;
  onModeChange: (mode: SimulationMode) => void;
  onRetryLimitChange: (limit: number) => void;
  onSpeedChange: (speed: ProcessingSpeed) => void;
  onLoadDemo: () => void;
  isProcessing: boolean;
}

const MODE_OPTIONS: { value: SimulationMode; label: string; desc: string; icon: React.ReactNode; color: string; activeGrad: string }[] = [
  {
    value: 'RANDOM',
    label: 'Random',
    desc: '60% success rate',
    icon: <Shuffle className="w-4 h-4" />,
    color: 'rgba(37,99,235,0.18)',
    activeGrad: 'linear-gradient(135deg,rgba(37,99,235,0.25),rgba(79,70,229,0.15))',
  },
  {
    value: 'FORCE_SUCCESS',
    label: 'Force Success',
    desc: 'All deliveries succeed',
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'rgba(5,150,105,0.18)',
    activeGrad: 'linear-gradient(135deg,rgba(5,150,105,0.25),rgba(16,185,129,0.1))',
  },
  {
    value: 'FORCE_FAILURE',
    label: 'Force Failure',
    desc: 'Demonstrates full retry',
    icon: <XCircle className="w-4 h-4" />,
    color: 'rgba(220,38,38,0.18)',
    activeGrad: 'linear-gradient(135deg,rgba(220,38,38,0.25),rgba(239,68,68,0.1))',
  },
];

const SPEEDS: { value: ProcessingSpeed; label: string; sub: string }[] = [
  { value: 'SLOW',   label: 'Slow',   sub: '2s' },
  { value: 'NORMAL', label: 'Normal', sub: '1s' },
  { value: 'FAST',   label: 'Fast',   sub: '0.4s' },
];

export function SimulationControls({
  mode, retryLimit, speed,
  onModeChange, onRetryLimitChange, onSpeedChange, onLoadDemo, isProcessing,
}: SimulationControlsProps) {
  return (
    <div
      className="rounded-2xl p-5 space-y-5"
      style={{
        background: 'linear-gradient(160deg, rgba(14,18,28,0.95) 0%, rgba(8,11,18,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
        <Settings className="w-3.5 h-3.5 text-purple-400" />
        Simulation Controls
      </h2>

      {/* Mode */}
      <div>
        <p className="text-xs text-gray-600 font-semibold uppercase tracking-widest mb-2">Mode</p>
        <div className="space-y-1.5">
          {MODE_OPTIONS.map((opt) => {
            const isChecked = mode === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all duration-200 ${
                  isProcessing ? 'opacity-60 cursor-not-allowed' : 'hover:border-white/10'
                }`}
                style={{
                  background: isChecked ? opt.activeGrad : 'rgba(255,255,255,0.03)',
                  border: isChecked ? `1px solid ${opt.color}` : '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <input
                  type="radio"
                  checked={isChecked}
                  onChange={() => !isProcessing && onModeChange(opt.value)}
                  className="sr-only"
                />
                {/* Custom radio */}
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-all duration-200"
                  style={{
                    border: isChecked ? '2px solid #60a5fa' : '2px solid rgba(255,255,255,0.15)',
                    background: isChecked ? 'rgba(96,165,250,0.2)' : 'transparent',
                  }}
                >
                  {isChecked && <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-200">{opt.label}</p>
                  <p className="text-xs" style={{ color: '#4b5563' }}>{opt.desc}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Retry limit */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-600 font-semibold uppercase tracking-widest">Retry Limit</p>
          <span
            className="text-sm font-extrabold tabular-nums"
            style={{ color: '#a78bfa' }}
          >
            {retryLimit}
          </span>
        </div>
        <input
          type="range" min={0} max={5} value={retryLimit}
          onChange={(e) => onRetryLimitChange(Number(e.target.value))}
          disabled={isProcessing}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer disabled:opacity-50"
          style={{ accentColor: '#8b5cf6' }}
        />
        <p className="text-xs mt-1.5" style={{ color: '#374151' }}>
          Max {retryLimit + 1} total attempt{retryLimit + 1 !== 1 ? 's' : ''} per email
        </p>
      </div>

      {/* Speed */}
      <div>
        <p className="text-xs text-gray-600 font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5" />
          Speed
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {SPEEDS.map((s) => {
            const active = speed === s.value;
            return (
              <button
                key={s.value}
                onClick={() => onSpeedChange(s.value)}
                disabled={isProcessing}
                className="btn py-2 rounded-xl text-xs font-semibold flex flex-col items-center gap-0.5 transition-all disabled:opacity-50"
                style={{
                  background: active
                    ? 'linear-gradient(135deg, rgba(124,58,237,0.35), rgba(99,102,241,0.2))'
                    : 'rgba(255,255,255,0.04)',
                  border: active
                    ? '1px solid rgba(167,139,250,0.4)'
                    : '1px solid rgba(255,255,255,0.06)',
                  color: active ? '#c4b5fd' : '#6b7280',
                }}
              >
                <span>{s.label}</span>
                <span className="text-xs opacity-60 font-mono">{s.sub}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Demo */}
      <div className="pt-1 border-t border-white/[0.05]">
        <button
          onClick={onLoadDemo}
          disabled={isProcessing}
          className="btn w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, #4338ca, #6d28d9)' }}
        >
          <Database className="w-4 h-4" />
          Load Demo Data
        </button>
        <p className="text-xs text-center mt-2" style={{ color: '#374151' }}>
          Adds 5 sample emails to the queue
        </p>
      </div>
    </div>
  );
}
