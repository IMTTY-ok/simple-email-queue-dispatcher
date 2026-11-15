import { Mail, LogOut, ShieldCheck, User } from 'lucide-react';

interface HeaderProps {
  /** Is the backend reachable? */
  connected: boolean;
  /** `DRY-RUN` or `LIVE` — the real operating mode of the installation. */
  mode: 'DRY-RUN' | 'LIVE';
  /** Is the dispatcher currently working? */
  isProcessing: boolean;
  isPaused: boolean;
  accountLabel: string;
  roleLabel: string;
  onSignOut: () => void;
}

/**
 * The application header.
 *
 * A full-width dark navy bar: the identity on the left, the live server
 * state and the operating mode on the right. Both indicators read from the
 * real application state — nothing here is hardcoded.
 */
export function Header({
  connected,
  mode,
  isProcessing,
  isPaused,
  accountLabel,
  roleLabel,
  onSignOut,
}: HeaderProps) {
  const dispatcherLabel = isProcessing && !isPaused ? 'DISPATCHING' : isPaused ? 'PAUSED' : 'IDLE';

  return (
    <header className="w-full" style={{ background: '#172A43' }}>
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <div className="flex items-center justify-between gap-4 h-14">
          {/* Identity */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: '#24436A' }}
            >
              <Mail className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1
                className="text-[12.5px] font-bold tracking-[0.1em] uppercase leading-tight truncate"
                style={{ color: '#FFFFFF' }}
              >
                Simple Email Queue Dispatcher
              </h1>
              <p
                className="text-[10px] leading-tight tracking-[0.08em] uppercase truncate"
                style={{ color: '#8FA6C4' }}
              >
                Server-side SMTP dispatch · retry engine · scheduling
              </p>
            </div>
          </div>

          {/* Live state */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
              title={connected ? 'Connected to the backend' : 'The backend is unreachable'}
            >
              <span className={`status-dot ${connected ? 'status-dot-live' : 'status-dot-off'}`} />
              <span
                className="text-[10.5px] font-bold tracking-[0.08em] uppercase"
                style={{ color: connected ? '#8FE0C0' : '#F0B4B4' }}
              >
                Server: {connected ? 'Online' : 'Offline'}
              </span>
            </div>

            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
              title={`Operating mode: ${mode}`}
            >
              <span
                className="text-[10.5px] font-bold tracking-[0.08em] uppercase"
                style={{ color: mode === 'LIVE' ? '#8FE0C0' : '#F3CE8E' }}
              >
                Mode: {mode}
              </span>
            </div>

            <div
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
              title={`Dispatcher: ${dispatcherLabel}`}
            >
              <span
                className={`status-dot ${
                  isProcessing && !isPaused ? 'status-dot-live' : isPaused ? 'status-dot-wait' : 'status-dot-off'
                }`}
                style={isProcessing || isPaused ? undefined : { background: '#8FA6C4' }}
              />
              <span className="text-[10.5px] font-bold tracking-[0.08em] uppercase" style={{ color: '#C9D6E6' }}>
                {dispatcherLabel}
              </span>
            </div>

            {/* Account */}
            <div
              className="flex items-center gap-2 pl-2 sm:pl-3 border-l"
              style={{ borderColor: 'rgba(255,255,255,0.14)' }}
              title={`Signed in as ${accountLabel} (${roleLabel})`}
            >
              <div className="hidden lg:flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" style={{ color: '#8FA6C4' }} />
                <span className="text-[11px] max-w-[130px] truncate" style={{ color: '#C9D6E6' }}>
                  {accountLabel}
                </span>
                <span
                  className="flex items-center gap-1 text-[9.5px] font-bold tracking-[0.08em] uppercase"
                  style={{ color: '#8FA6C4' }}
                >
                  <ShieldCheck className="w-3 h-3" />
                  {roleLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="btn btn-sm"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#DCE6F2' }}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
