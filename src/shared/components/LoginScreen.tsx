import { useState, type ReactNode } from 'react';
import {
  Mail,
  Lock,
  User,
  AlertTriangle,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

interface LoginScreenProps {
  onSignIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  onSignUp: (email: string, password: string, displayName: string) => Promise<{ success: boolean; error?: string }>;
  onResetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  error: string | null;
}

type Mode = 'signin' | 'signup' | 'reset';

/**
 * Premium SaaS authentication screen.
 *
 * Email + password only. No social / third-party providers.
 */
export function LoginScreen({ onSignIn, onSignUp, onResetPassword, error }: LoginScreenProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);

  const isSignUp = mode === 'signup';
  const isReset = mode === 'reset';

  const switchMode = (next: Mode) => {
    setMode(next);
    setLocalError(null);
    setLocalSuccess(null);
    setShowPassword(false);
    setShowConfirm(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);
    setLocalSuccess(null);

    if (!email.trim()) return setLocalError('Please enter your email address.');

    if (isReset) {
      setBusy(true);
      const result = await onResetPassword(email);
      setBusy(false);
      if (result.success) {
        setLocalSuccess('A password reset link has been sent to your email.');
      } else if (result.error) {
        setLocalError(result.error);
      }
      return;
    }

    if (!password) return setLocalError('Please enter a password.');

    if (isSignUp) {
      if (password.length < 6) {
        return setLocalError('Please choose a password of at least 6 characters.');
      }
      if (password !== confirmPassword) {
        return setLocalError('Passwords do not match.');
      }
    }

    setBusy(true);
    const result = isSignUp
      ? await onSignUp(email, password, displayName)
      : await onSignIn(email, password);
    setBusy(false);

    if (!result.success && result.error) setLocalError(result.error);
  };

  const message = localError || error;
  const success = localSuccess;

  return (
    <div className="auth-shell">
      {/* Background decorations */}
      <div className="auth-bg" aria-hidden="true">
        <div className="auth-blob auth-blob-tl" />
        <div className="auth-blob auth-blob-tr" />
        <div className="auth-wave auth-wave-bottom" />
        <div className="auth-wave auth-wave-mid" />
        <div className="auth-glow auth-glow-1" />
        <div className="auth-glow auth-glow-2" />
      </div>

      {/* Header */}
      <header className="auth-header">
        <div className="auth-brand">
          <BrandLogo />
          <div className="auth-brand-text">
            <span className="auth-brand-line1">Email Queue</span>
            <span className="auth-brand-line2">Dispatcher</span>
          </div>
        </div>
        <nav className="auth-nav" aria-label="Section labels">
          <span>Queue</span>
          <span className="auth-nav-sep">•</span>
          <span>Simulate</span>
          <span className="auth-nav-sep">•</span>
          <span>Deliver</span>
        </nav>
      </header>

      {/* Main content */}
      <main className="auth-main">
        {/* Left illustration */}
        <section className="auth-illustration" aria-hidden="true">
          <EmailAutomationIllustration />
          <FeatureHighlights />
        </section>

        {/* Right card */}
        <section className="auth-card-wrap">
          <div className="auth-card">
            {/* Circular logo badge */}
            <div className="auth-badge">
              <BrandLogo size={52} />
            </div>

            <div className="auth-card-inner">
              <h1 className="auth-title">
                {isReset ? (
                  <>
                    <span className="auth-title-navy">Reset Your</span>{' '}
                    <span className="auth-title-purple">Password</span>
                  </>
                ) : isSignUp ? (
                  <>
                    <span className="auth-title-navy">Create</span>{' '}
                    <span className="auth-title-purple">Account</span>
                  </>
                ) : (
                  <>
                    <span className="auth-title-navy">Welcome</span>{' '}
                    <span className="auth-title-purple">Back!</span>
                  </>
                )}
              </h1>

              <p className="auth-subtitle">
                {isReset
                  ? 'Enter your registered email address to receive a password reset link.'
                  : isSignUp
                  ? 'Start managing your emails with ease.'
                  : 'Sign in to your Email Queue Dispatcher'}
              </p>

              {message && (
                <div className="auth-notice auth-notice-error" role="alert">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                  <span>{message}</span>
                </div>
              )}
              {success && (
                <div className="auth-notice auth-notice-success" role="status">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
                  <span>{success}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="auth-form" noValidate>
                {isSignUp && (
                  <AuthInput
                    id="auth-name"
                    label="Full name"
                    icon={<User className="w-5 h-5" />}
                    type="text"
                    value={displayName}
                    onChange={setDisplayName}
                    placeholder="Ada Lovelace"
                    autoComplete="name"
                  />
                )}

                <AuthInput
                  id="auth-email"
                  label="Email address"
                  icon={<Mail className="w-5 h-5" />}
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="Email Address"
                  autoComplete="email"
                  required
                />

                {!isReset && (
                  <PasswordInput
                    id="auth-password"
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    placeholder="Password"
                    show={showPassword}
                    onToggle={() => setShowPassword((s) => !s)}
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  />
                )}

                {isSignUp && (
                  <PasswordInput
                    id="auth-confirm"
                    label="Confirm password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="Confirm Password"
                    show={showConfirm}
                    onToggle={() => setShowConfirm((s) => !s)}
                    autoComplete="new-password"
                  />
                )}

                {!isSignUp && !isReset && (
                  <div className="auth-forgot-row">
                    <button
                      type="button"
                      className="auth-link auth-link-purple"
                      onClick={() => switchMode('reset')}
                    >
                      Forgot Password?
                    </button>
                  </div>
                )}

                <PrimaryButton busy={busy} isSignUp={isSignUp} isReset={isReset} />

                <div className="auth-switch">
                  {isReset ? (
                    <button type="button" className="auth-link auth-link-purple font-semibold" onClick={() => switchMode('signin')}>
                      Back to Sign In
                    </button>
                  ) : isSignUp ? (
                    <p>
                      Already have an account?{' '}
                      <button type="button" className="auth-link auth-link-purple font-semibold" onClick={() => switchMode('signin')}>
                        Sign In
                      </button>
                    </p>
                  ) : (
                    <p>
                      Don&apos;t have an account?{' '}
                      <button type="button" className="auth-link auth-link-purple font-semibold" onClick={() => switchMode('signup')}>
                        Create Account
                      </button>
                    </p>
                  )}
                </div>
              </form>

              <p className="auth-footnote">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  The <strong>first</strong> account created on this installation becomes the administrator.
                  Everyone after that is an operator. Roles are assigned by the server.
                </span>
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

function BrandLogo({ size = 60 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 72 52" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="logoEnv" x1="0" y1="0" x2="72" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#713BFF" />
          <stop offset="1" stopColor="#2525B8" />
        </linearGradient>
        <linearGradient id="logoTrail" x1="0" y1="0" x2="20" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#28D7E8" stopOpacity="0" />
          <stop offset="1" stopColor="#28D7E8" />
        </linearGradient>
      </defs>
      <path d="M4 6 Q4 0 10 0 L62 0 Q68 0 68 6 L68 46 Q68 52 62 52 L10 52 Q4 52 4 46 Z" fill="url(#logoEnv)" />
      <path d="M4 6 L36 28 L68 6" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9" />
      <path d="M4 46 L28 26" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M68 46 L44 26" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <line x1="-6" y1="18" x2="2" y2="18" stroke="url(#logoTrail)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="-10" y1="26" x2="0" y2="26" stroke="url(#logoTrail)" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      <line x1="-4" y1="34" x2="4" y2="34" stroke="url(#logoTrail)" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function PrimaryButton({ busy, isSignUp, isReset }: { busy: boolean; isSignUp: boolean; isReset: boolean }) {
  const label = isReset ? 'Send Reset Link' : isSignUp ? 'Create Account' : 'Sign In';
  return (
    <button type="submit" disabled={busy} className="auth-btn">
      {busy ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>{isReset ? 'Sending…' : isSignUp ? 'Creating…' : 'Signing In...'}</span>
        </>
      ) : (
        <>
          <span>{label}</span>
          <ArrowRight className="w-5 h-5 auth-btn-arrow" />
        </>
      )}
    </button>
  );
}

function AuthInput({
  id,
  label,
  icon,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <div className="auth-field">
      <label htmlFor={id} className="auth-label">
        {label}
      </label>
      <div className="auth-input-wrap">
        <span className="auth-input-icon">{icon}</span>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className="auth-input"
        />
      </div>
    </div>
  );
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  show,
  onToggle,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  show: boolean;
  onToggle: () => void;
  autoComplete?: string;
}) {
  return (
    <div className="auth-field">
      <label htmlFor={id} className="auth-label">
        {label}
      </label>
      <div className="auth-input-wrap">
        <span className="auth-input-icon auth-input-icon-purple">
          <Lock className="w-5 h-5" />
        </span>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="auth-input auth-input-pw"
        />
        <button
          type="button"
          className="auth-eye"
          onClick={onToggle}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
        >
          {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}

function EmailAutomationIllustration() {
  return (
    <div className="auth-illustration-inner">
      <svg className="auth-illustration-svg" viewBox="0 0 560 440" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="envBody2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F1F0FF" />
            <stop offset="1" stopColor="#DCE8FF" />
          </linearGradient>
          <linearGradient id="envFlap2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#713BFF" />
            <stop offset="1" stopColor="#2525B8" />
          </linearGradient>
          <linearGradient id="pipe2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#3437CB" />
            <stop offset="0.5" stopColor="#425BEB" />
            <stop offset="1" stopColor="#477BFF" />
          </linearGradient>
          <linearGradient id="server2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#24436A" />
            <stop offset="1" stopColor="#101B55" />
          </linearGradient>
          <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#F1F0FF" />
          </linearGradient>
          <filter id="glow2" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#101B55" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Floating envelope (larger, 3D-ish) */}
        <g className="auth-float-env" filter="url(#softShadow)">
          <rect x="150" y="30" width="260" height="175" rx="20" fill="url(#envBody2)" stroke="#713BFF" strokeWidth="2.5" />
          <path d="M150 52 L280 132 L410 52" stroke="#713BFF" strokeWidth="3" fill="none" />
          <path d="M150 205 L260 135" stroke="#2525B8" strokeWidth="2" opacity="0.35" />
          <path d="M410 205 L300 135" stroke="#2525B8" strokeWidth="2" opacity="0.35" />
          {/* highlight */}
          <rect x="150" y="30" width="260" height="40" rx="20" fill="rgba(255,255,255,0.35)" />
          {/* motion trails */}
          <line x1="100" y1="95" x2="145" y2="95" stroke="#28D7E8" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
          <line x1="88" y1="118" x2="140" y2="118" stroke="#28D7E8" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
          <line x1="105" y1="141" x2="148" y2="141" stroke="#28D7E8" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
          <line x1="95" y1="164" x2="142" y2="164" stroke="#28D7E8" strokeWidth="2" strokeLinecap="round" opacity="0.25" />
        </g>

        {/* Dotted delivery path from envelope to pipeline */}
        <path d="M280 205 Q300 230 320 255" stroke="#713BFF" strokeWidth="1.8" strokeDasharray="5 7" fill="none" opacity="0.45" />

        {/* Server stack (detailed) */}
        <g transform="translate(55, 265)" filter="url(#softShadow)">
          {/* base shadow */}
          <ellipse cx="80" cy="132" rx="85" ry="10" fill="#101B55" opacity="0.22" />
          {/* server 1 */}
          <g>
            <rect x="0" y="0" width="160" height="38" rx="10" fill="url(#server2)" />
            <rect x="0" y="0" width="160" height="6" rx="10" fill="rgba(255,255,255,0.12)" />
            <g stroke="#477BFF" strokeWidth="1.6" opacity="0.7">
              <line x1="16" y1="19" x2="52" y2="19" />
              <line x1="16" y1="26" x2="44" y2="26" />
            </g>
            <circle cx="138" cy="19" r="4" fill="#28D7E8" className="auth-led" />
            <circle cx="126" cy="19" r="3" fill="#713BFF" opacity="0.9" />
          </g>
          {/* server 2 */}
          <g transform="translate(0,44)">
            <rect x="0" y="0" width="160" height="38" rx="10" fill="url(#server2)" />
            <rect x="0" y="0" width="160" height="6" rx="10" fill="rgba(255,255,255,0.12)" />
            <g stroke="#477BFF" strokeWidth="1.6" opacity="0.7">
              <line x1="16" y1="19" x2="52" y2="19" />
              <line x1="16" y1="26" x2="44" y2="26" />
            </g>
            <circle cx="138" cy="19" r="4" fill="#28D7E8" className="auth-led" style={{ animationDelay: '0.5s' }} />
            <circle cx="126" cy="19" r="3" fill="#713BFF" opacity="0.9" />
          </g>
          {/* server 3 */}
          <g transform="translate(0,88)">
            <rect x="0" y="0" width="160" height="38" rx="10" fill="url(#server2)" />
            <rect x="0" y="0" width="160" height="6" rx="10" fill="rgba(255,255,255,0.12)" />
            <g stroke="#477BFF" strokeWidth="1.6" opacity="0.7">
              <line x1="16" y1="19" x2="52" y2="19" />
              <line x1="16" y1="26" x2="44" y2="26" />
            </g>
            <circle cx="138" cy="19" r="4" fill="#28D7E8" className="auth-led" style={{ animationDelay: '1s' }} />
            <circle cx="126" cy="19" r="3" fill="#713BFF" opacity="0.9" />
          </g>
          {/* side depth */}
          <rect x="160" y="4" width="8" height="118" rx="4" fill="#0a1230" opacity="0.5" />
        </g>

        {/* Digital activity ring (behind pipeline) */}
        <g opacity="0.4">
          <circle cx="360" cy="275" r="110" fill="none" stroke="#713BFF" strokeWidth="1" opacity="0.12" />
          <circle cx="360" cy="275" r="88" fill="none" stroke="#28D7E8" strokeWidth="0.8" opacity="0.1" strokeDasharray="4 8" />
          <circle cx="360" cy="275" r="66" fill="none" stroke="#477BFF" strokeWidth="0.6" opacity="0.08" />
        </g>

        {/* Conveyor pipeline (wider, illuminated) */}
        <g filter="url(#softShadow)">
          <path d="M220 322 Q305 295 380 272 Q445 250 505 238" stroke="url(#pipe2)" strokeWidth="18" strokeLinecap="round" fill="none" />
          <path d="M220 322 Q305 295 380 272 Q445 250 505 238" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.25" strokeDasharray="8 12" />
          {/* side lighting */}
          <path d="M220 310 Q305 283 380 260 Q445 238 505 226" stroke="#28D7E8" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6" />
        </g>

        {/* Four email cards (spaced) */}
        <g className="auth-card1" filter="url(#softShadow)">
          <rect x="240" y="300" width="62" height="40" rx="8" fill="url(#cardGrad)" stroke="#713BFF" strokeWidth="1.6" />
          <rect x="248" y="309" width="24" height="3.5" rx="1.75" fill="#713BFF" opacity="0.8" />
          <rect x="248" y="317" width="40" height="3" rx="1.5" fill="#477BFF" opacity="0.55" />
          <rect x="248" y="325" width="32" height="3" rx="1.5" fill="#477BFF" opacity="0.55" />
          <text x="248" y="336" fontSize="7" fill="#713BFF" fontWeight="700">QUEUED</text>
        </g>
        <g className="auth-card2" filter="url(#softShadow)">
          <rect x="302" y="276" width="62" height="40" rx="8" fill="url(#cardGrad)" stroke="#713BFF" strokeWidth="1.6" />
          <rect x="310" y="285" width="24" height="3.5" rx="1.75" fill="#713BFF" opacity="0.8" />
          <rect x="310" y="293" width="40" height="3" rx="1.5" fill="#477BFF" opacity="0.55" />
          <rect x="310" y="301" width="32" height="3" rx="1.5" fill="#477BFF" opacity="0.55" />
          <text x="310" y="312" fontSize="7" fill="#713BFF" fontWeight="700">PROCESSING</text>
        </g>
        <g className="auth-card3" filter="url(#softShadow)">
          <rect x="382" y="252" width="62" height="40" rx="8" fill="url(#cardGrad)" stroke="#713BFF" strokeWidth="1.6" />
          <rect x="390" y="261" width="24" height="3.5" rx="1.75" fill="#713BFF" opacity="0.8" />
          <rect x="390" y="269" width="40" height="3" rx="1.5" fill="#477BFF" opacity="0.55" />
          <rect x="390" y="277" width="32" height="3" rx="1.5" fill="#477BFF" opacity="0.55" />
          <text x="390" y="288" fontSize="7" fill="#713BFF" fontWeight="700">RETRY READY</text>
        </g>
        <g className="auth-card4" filter="url(#softShadow)">
          <rect x="464" y="228" width="62" height="40" rx="8" fill="url(#cardGrad)" stroke="#28D7E8" strokeWidth="1.8" />
          <rect x="472" y="237" width="24" height="3.5" rx="1.75" fill="#28D7E8" opacity="0.9" />
          <rect x="472" y="245" width="40" height="3" rx="1.5" fill="#477BFF" opacity="0.55" />
          <rect x="472" y="253" width="32" height="3" rx="1.5" fill="#477BFF" opacity="0.55" />
          <text x="472" y="264" fontSize="7" fill="#28D7E8" fontWeight="700">DELIVERED</text>
        </g>

        {/* Success badge (prominent) */}
        <g className="auth-success" filter="url(#glow2)">
          <circle cx="512" cy="150" r="42" fill="#28D7E8" opacity="0.92" />
          <circle cx="512" cy="150" r="42" fill="none" stroke="#FFFFFF" strokeWidth="4" />
          <circle cx="512" cy="150" r="52" fill="none" stroke="#28D7E8" strokeWidth="2" opacity="0.35" />
          <path d="M494 150 L508 166 L534 136" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>

        {/* Processing notification (upper-right, outside envelope) */}
        <g className="auth-notif1" filter="url(#softShadow)">
          <rect x="412" y="40" width="136" height="46" rx="12" fill="rgba(255,255,255,0.9)" stroke="#713BFF" strokeWidth="1.2" />
          <circle cx="430" cy="63" r="9" fill="#713BFF" opacity="0.18" />
          <path d="M426 63 L429 66 L435 60" stroke="#713BFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x="448" y="55" width="72" height="4" rx="2" fill="#713BFF" opacity="0.75" />
          <rect x="448" y="63" width="88" height="3" rx="1.5" fill="#477BFF" opacity="0.5" />
          <text x="448" y="78" fontSize="8" fill="#58638F" fontWeight="600">Processing email…</text>
        </g>
        <g className="auth-notif2" filter="url(#softShadow)">
          <rect x="60" y="205" width="136" height="44" rx="12" fill="rgba(255,255,255,0.9)" stroke="#28D7E8" strokeWidth="1.2" />
          <circle cx="78" cy="227" r="9" fill="#28D7E8" opacity="0.22" />
          <path d="M74 227 L77 230 L83 224" stroke="#28D7E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x="96" y="219" width="60" height="4" rx="2" fill="#28D7E8" opacity="0.85" />
          <rect x="96" y="227" width="88" height="3" rx="1.5" fill="#477BFF" opacity="0.45" />
          <text x="96" y="241" fontSize="8" fill="#58638F" fontWeight="600">Delivery successful</text>
        </g>

        {/* Dotted connection trails */}
        <path d="M280 205 Q320 235 350 260" stroke="#713BFF" strokeWidth="1.6" strokeDasharray="4 6" fill="none" opacity="0.4" />
        <path d="M130 265 Q170 245 210 235" stroke="#477BFF" strokeWidth="1.6" strokeDasharray="4 6" fill="none" opacity="0.4" />

        {/* Floating particles */}
        <circle cx="40" cy="120" r="3" fill="#28D7E8" opacity="0.6" className="auth-particle" />
        <circle cx="500" cy="100" r="2.5" fill="#713BFF" opacity="0.5" className="auth-particle" style={{ animationDelay: '1s' }} />
        <circle cx="90" cy="380" r="2" fill="#477BFF" opacity="0.5" className="auth-particle" style={{ animationDelay: '2s' }} />
        <circle cx="520" cy="360" r="3" fill="#28D7E8" opacity="0.4" className="auth-particle" style={{ animationDelay: '0.5s' }} />

        {/* Abstract leaf shapes */}
        <ellipse cx="30" cy="400" rx="45" ry="18" fill="#2525B8" opacity="0.14" transform="rotate(-20 30 400)" />
        <ellipse cx="530" cy="395" rx="32" ry="13" fill="#713BFF" opacity="0.12" transform="rotate(15 530 395)" />
      </svg>

    </div>
  );
}

function FeatureHighlights() {
  return (
    <div className="auth-features">
      <div className="auth-feature">
        <div className="auth-feature-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>
        <div className="auth-feature-text">
          <span>Fast Queue</span>
          <span>Processing</span>
        </div>
      </div>
      <div className="auth-feature-sep" />
      <div className="auth-feature">
        <div className="auth-feature-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </div>
        <div className="auth-feature-text">
          <span>Secure &amp;</span>
          <span>Reliable</span>
        </div>
      </div>
      <div className="auth-feature-sep" />
      <div className="auth-feature">
        <div className="auth-feature-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="20" x2="4" y2="10" />
            <line x1="10" y1="20" x2="10" y2="4" />
            <line x1="16" y1="20" x2="16" y2="14" />
            <line x1="22" y1="20" x2="22" y2="8" />
          </svg>
        </div>
        <div className="auth-feature-text">
          <span>Real-time</span>
          <span>Tracking</span>
        </div>
      </div>
    </div>
  );
}