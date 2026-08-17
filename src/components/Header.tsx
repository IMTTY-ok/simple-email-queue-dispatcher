import { Play, Pause, RotateCcw, Mail, Activity, Zap } from 'lucide-react';

interface HeaderProps {
  isProcessing: boolean;
  isPaused: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
}

export function Header({ isProcessing, isPaused, onStart, onPause, onReset }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06]"
      style={{ background: 'rgba(8,11,18,0.85)', backdropFilter: 'blur(20px) saturate(180%)' }}
    >
      {/* Subtle top glow line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo / Title */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}
              >
                <Mail className="w-4.5 h-4.5 text-white" size={18} />
              </div>
              {isProcessing && !isPaused && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-400 rounded-full animate-pulse-dot border-2 border-gray-950" />
              )}
            </div>
            <div>
              <h1 className="font-bold text-base sm:text-lg leading-tight tracking-tight text-white">
                Email Queue Dispatcher
              </h1>
              <p className="text-gray-500 text-xs leading-tight">Queue Management &amp; Retry Simulation</p>
            </div>
          </div>

          {/* Center status pill */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.07]"
            style={{ background: 'rgba(15,20,30,0.6)' }}
          >
            {isProcessing && !isPaused ? (
              <>
                <Zap className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs text-blue-400 font-medium">Processing</span>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse-dot" />
              </>
            ) : isPaused ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse-dot" />
                <span className="text-xs text-amber-400 font-medium">Paused</span>
              </>
            ) : (
              <>
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs text-emerald-400 font-medium">System Ready</span>
              </>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {!isProcessing || isPaused ? (
              <button
                onClick={onStart}
                className="btn flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-white text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg, #2563eb, #4f46e5)' }}
                title={isPaused ? 'Resume Processing' : 'Start Processing'}
              >
                <Play className="w-3.5 h-3.5" fill="currentColor" />
                <span className="hidden sm:inline">{isPaused ? 'Resume' : 'Start'}</span>
              </button>
            ) : (
              <button
                onClick={onPause}
                className="btn flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-white text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}
                title="Pause Processing"
              >
                <Pause className="w-3.5 h-3.5" fill="currentColor" />
                <span className="hidden sm:inline">Pause</span>
              </button>
            )}
            <button
              onClick={onReset}
              className="btn flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-gray-300 text-sm font-medium border border-white/[0.08]"
              style={{ background: 'rgba(255,255,255,0.05)' }}
              title="Reset All"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
