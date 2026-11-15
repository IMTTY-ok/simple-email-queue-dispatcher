import { useState } from 'react';
import { Mail, Lock, LogIn, UserPlus, AlertTriangle, ShieldCheck } from 'lucide-react';

interface LoginScreenProps {
  onSignIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  onSignUp: (email: string, password: string, displayName: string) => Promise<{ success: boolean; error?: string }>;
  error: string | null;
}

/**
 * The sign-in screen.
 *
 * The dashboard is not reachable without an account — that is what keeps the
 * queue contents out of reach of anonymous visitors.
 */
export function LoginScreen({ onSignIn, onSignUp, error }: LoginScreenProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isSignUp = mode === 'signup';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);

    if (!email.trim()) return setLocalError('Please enter your email address.');
    if (!password) return setLocalError('Please enter a password.');
    if (isSignUp && password.length < 6) {
      return setLocalError('Please choose a password of at least 6 characters.');
    }

    setBusy(true);
    const result = isSignUp
      ? await onSignUp(email, password, displayName)
      : await onSignIn(email, password);
    setBusy(false);

    if (!result.success && result.error) setLocalError(result.error);
  };

  const message = localError || error;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: '#F4F6F9' }}>
      <div className="relative w-full max-w-md">
        <div
          className="card"
          style={{ boxShadow: '0 18px 40px rgba(23, 42, 67, 0.10)' }}
        >
          <div
            className="px-6 py-5 flex items-center gap-3"
            style={{ background: '#172A43', borderRadius: '10px 10px 0 0' }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: '#24436A' }}
            >
              <Mail className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1
                className="text-[13px] font-bold uppercase tracking-[0.09em] leading-tight"
                style={{ color: '#FFFFFF' }}
              >
                Simple Email Queue Dispatcher
              </h1>
              <p className="text-[11px] leading-tight" style={{ color: '#8FA6C4' }}>
                Sign in to manage the dispatch queue
              </p>
            </div>
          </div>

          <div className="card-body space-y-4">
            {/* Mode switch */}
            <div className="segment grid-cols-2">
              {(
                [
                  { id: 'signin', label: 'Sign in', icon: LogIn },
                  { id: 'signup', label: 'Create account', icon: UserPlus },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setMode(tab.id);
                      setLocalError(null);
                    }}
                    aria-pressed={active}
                    className="segment-btn flex items-center justify-center gap-2"
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {message && (
              <div className="notice notice-red" role="alert">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                <span>{message}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3" noValidate>
              {isSignUp && (
                <div>
                  <label htmlFor="auth-name" className="field-label">
                    Display name <span className="text-ink-faint">(optional)</span>
                  </label>
                  <input
                    id="auth-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ada Lovelace"
                    autoComplete="name"
                    className="input"
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="field-label">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    aria-required="true"
                    className="input pl-8"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="auth-password" className="field-label">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                  <input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    aria-required="true"
                    className="input pl-8"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="btn btn-navy w-full"
              >
                {isSignUp ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                {busy ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
              </button>
            </form>

            <p className="text-[11px] leading-snug flex items-start gap-2 pt-1 border-t border-hairline-soft text-ink-faint">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>
                The <strong>first</strong> account created on this installation becomes the administrator.
                Everyone after that is an operator. Roles are assigned by the server and cannot be
                changed from the browser.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
