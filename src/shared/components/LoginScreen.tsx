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
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: '#080b12' }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-[0.05]"
          style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }}
        />
        <div
          className="absolute bottom-0 right-0 w-80 h-80 rounded-full blur-3xl opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)' }}
        />
      </div>

      <div className="relative w-full max-w-md">
        <div
          className="rounded-2xl p-7 space-y-5"
          style={{
            background: 'linear-gradient(160deg, rgba(14,18,28,0.95) 0%, rgba(8,11,18,0.98) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}
            >
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-white leading-tight">Email Queue Dispatcher</h1>
              <p className="text-xs text-gray-500">Sign in to manage the dispatch queue</p>
            </div>
          </div>

          {/* Mode switch */}
          <div className="grid grid-cols-2 gap-2">
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
                  className="btn py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                  style={{
                    background: active
                      ? 'linear-gradient(135deg, #2563eb, #4f46e5)'
                      : 'rgba(255,255,255,0.04)',
                    border: active ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.06)',
                    color: active ? '#fff' : '#6b7280',
                  }}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {message && (
            <div
              className="p-3 rounded-xl flex items-start gap-2.5 text-sm animate-fade-up"
              style={{ background: 'rgba(69,10,10,0.6)', border: '1px solid rgba(248,113,113,0.25)' }}
              role="alert"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f87171' }} />
              <p style={{ color: '#fca5a5' }}>{message}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            {isSignUp && (
              <div>
                <label htmlFor="auth-name" className="block text-xs text-gray-500 font-medium mb-1.5">
                  Display name <span className="text-gray-700">(optional)</span>
                </label>
                <input
                  id="auth-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                  className="input-field w-full rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs text-gray-500 font-medium mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-required="true"
                  className="input-field w-full rounded-xl pl-9 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs text-gray-500 font-medium mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  aria-required="true"
                  className="input-field w-full rounded-xl pl-9 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="btn w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #2563eb, #4f46e5)' }}
            >
              {isSignUp ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
              {busy ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p
            className="text-[11px] leading-snug flex items-start gap-2 pt-1 border-t border-white/[0.05]"
            style={{ color: '#374151' }}
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: '#4b5563' }} />
            <span>
              The <strong>first</strong> account created on this installation becomes the administrator.
              Everyone after that is an operator. Roles are assigned by the server and cannot be
              changed from the browser.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
