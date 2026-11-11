import { useEffect, useRef, useState } from 'react';
import {
  Server,
  Save,
  PlugZap,
  Send,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Dices,
  CircleCheck,
  CircleX,
} from 'lucide-react';
import type { ServerConfig, SimulationMode } from '../../../shared/types/email';
import { isValidEmail } from '../../../shared/utils/format';
import { SIMULATION_MODES, SIMULATION_MODE_LABELS, SMTP_PORT_OPTIONS } from '../../../shared/constants';

interface SettingsPanelProps {
  config: ServerConfig | null;
  onSaveConfig: (patch: {
    smtp?: {
      host?: string;
      port?: number;
      secure?: boolean;
      user?: string;
      pass?: string;
      fromName?: string;
      fromEmail?: string;
    };
    dryRun?: boolean;
    simulationMode?: SimulationMode;
    retryLimit?: number;
  }) => Promise<{
    success: boolean;
    error?: string;
    changed?: string[];
    verify?: { ok: boolean; error?: string; note?: string; mode?: string };
  }>;
  onTestConnection: () => Promise<{ success: boolean; error?: string; note?: string }>;
  onTestSend: (to: string) => Promise<{ success: boolean; error?: string }>;
}

const SIMULATION_MODE_ICONS: Record<SimulationMode, React.ReactNode> = {
  AUTOMATIC: <Dices className="w-3.5 h-3.5" />,
  FORCE_SUCCESS: <CircleCheck className="w-3.5 h-3.5" />,
  FORCE_FAILURE: <CircleX className="w-3.5 h-3.5" />,
};

/**
 * Module 2 — Send Simulator.
 *
 * Configures the transport the dispatcher uses: the SMTP server, the
 * credentials, the sender identity, and the simulation behaviour used while
 * dry-run mode is enabled.
 */
export function SettingsPanel({
  config,
  onSaveConfig,
  onTestConnection,
  onTestSend,
}: SettingsPanelProps) {
  const [host, setHost] = useState('');
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [fromName, setFromName] = useState('Email Dispatcher');
  const [fromEmail, setFromEmail] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [simulationMode, setSimulationMode] = useState<SimulationMode>('AUTOMATIC');
  const [testTo, setTestTo] = useState('');

  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Seed the form once the server config arrives for the first time.
  // A ref (not a state flag) keeps later config changes from overwriting
  // whatever the user is currently typing.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!config || seededRef.current) return;
    seededRef.current = true;
    setHost(config.smtp.host ?? '');
    setPort(config.smtp.port ?? 587);
    setSecure(config.smtp.secure ?? false);
    setUser(config.smtp.user ?? '');
    setFromName(config.smtp.fromName ?? 'Email Dispatcher');
    setFromEmail(config.smtp.fromEmail ?? '');
    setDryRun(config.dryRun ?? false);
    setSimulationMode(config.simulationMode ?? 'AUTOMATIC');
  }, [config]);

  const show = (type: 'success' | 'error', message: string) => setFeedback({ type, message });
  const clear = () => setFeedback(null);

  const handleSave = async () => {
    setBusy('save');
    clear();
    const res = await onSaveConfig({
      smtp: {
        host,
        port,
        secure,
        user,
        pass,
        fromName,
        fromEmail,
      },
      dryRun,
      simulationMode,
    });
    setBusy(null);

    if (!res.success) {
      show('error', res.error ?? 'Failed to save settings.');
      return;
    }
    show('success', res.verify?.ok
      ? `Settings saved. SMTP connection verified — ${res.verify.note ?? 'OK'}`
      : res.verify?.error
        ? `Settings saved, but connection check failed: ${res.verify.error}`
        : 'Settings saved.');
    setPass('');
  };

  const handleTest = async () => {
    setBusy('test');
    clear();
    const res = await onTestConnection();
    setBusy(null);
    if (res.success) show('success', res.note ?? 'Connection OK');
    else show('error', res.error ?? 'Connection failed');
  };

  const handleTestSend = async () => {
    if (!isValidEmail(testTo.trim())) {
      show('error', 'Enter a valid recipient email for the test.');
      return;
    }
    setBusy('testsend');
    clear();
    const res = await onTestSend(testTo.trim());
    setBusy(null);
    if (res.success) show('success', `Test email accepted by SMTP → sent to ${testTo.trim()}`);
    else show('error', res.error ?? 'Test send failed');
  };

  const inputStyle = 'input-field w-full rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none disabled:opacity-50 transition-all';

  return (
    <div
      className="rounded-2xl p-5 space-y-5"
      style={{
        background: 'linear-gradient(160deg, rgba(14,18,28,0.95) 0%, rgba(8,11,18,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
        <Server className="w-3.5 h-3.5 text-purple-400" />
        SMTP Dispatcher Settings
      </h2>

      {/* Feedback */}
      {feedback && (
        <div
          className="p-3 rounded-xl flex items-start gap-2.5 animate-fade-up text-sm"
          style={
            feedback.type === 'success'
              ? { background: 'rgba(5,46,22,0.6)', border: '1px solid rgba(52,211,153,0.25)' }
              : { background: 'rgba(69,10,10,0.6)', border: '1px solid rgba(248,113,113,0.25)' }
          }
          role="status"
          aria-live="polite"
        >
          {feedback.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#34d399' }} />
            : <XCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f87171' }} />}
          <p style={{ color: feedback.type === 'success' ? '#6ee7b7' : '#fca5a5' }}>{feedback.message}</p>
        </div>
      )}

      {/* Connection fields */}
      <div className="space-y-2.5">
        <label htmlFor="smtp-host" className="block text-xs text-gray-600 font-semibold uppercase tracking-widest">SMTP Server</label>
        <input
          id="smtp-host"
          value={host}
          onChange={(e) => { setHost(e.target.value); clear(); }}
          placeholder="smtp.gmail.com"
          className={inputStyle}
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        />
        <div className="grid grid-cols-3 gap-2">
          {SMTP_PORT_OPTIONS.map((opt) => {
            const active = port === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setPort(opt.value); setSecure(opt.secure); clear(); }}
                className="btn py-2 rounded-xl text-xs font-semibold flex flex-col items-center gap-0.5 transition-all"
                aria-pressed={active}
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
                <span className="font-mono">{opt.value}</span>
                <span className="text-[10px] opacity-70">{opt.label}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2.5 pt-1">
          <div className="flex items-center gap-2">
            <input
              id="smtp-user"
              value={user}
              onChange={(e) => { setUser(e.target.value); clear(); }}
              placeholder="you@gmail.com"
              aria-label="SMTP username"
              className={inputStyle}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>
          <div className="relative">
            <input
              id="smtp-pass"
              type={showPass ? 'text' : 'password'}
              value={pass}
              onChange={(e) => { setPass(e.target.value); clear(); }}
              placeholder={config?.hasPassword ? '•••••••• (keep blank to keep current)' : 'SMTP password / app password'}
              aria-label="SMTP password"
              autoComplete="off"
              className={`${inputStyle} pr-10`}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <button
              type="button"
              onClick={() => setShowPass((s) => !s)}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-lg text-gray-600 hover:text-gray-400 hover:bg-white/5 transition-colors"
              aria-label={showPass ? 'Hide password' : 'Show password'}
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] leading-snug" style={{ color: '#374151' }}>
            Stored server-side in Firebase — never sent back to the browser or committed to the repo.
            Leave blank to keep the current password.
          </p>
        </div>

        {/* From identity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <input
            id="smtp-from-name"
            value={fromName}
            onChange={(e) => { setFromName(e.target.value); clear(); }}
            placeholder="Sender Name"
            aria-label="Sender name"
            className={inputStyle}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          />
          <input
            id="smtp-from-email"
            value={fromEmail}
            onChange={(e) => { setFromEmail(e.target.value); clear(); }}
            placeholder="From email (defaults to user)"
            aria-label="From email address"
            className={inputStyle}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          />
        </div>
      </div>

      {/* Dry-run + simulation mode */}
      <div className="space-y-2 pt-1 border-t border-white/[0.05]">
        <label className="flex items-center justify-between gap-3 p-3 rounded-xl cursor-pointer transition-all"
          style={{
            background: dryRun ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)',
            border: dryRun ? '1px solid rgba(245,158,11,0.35)' : '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <FlaskConical className="w-4 h-4 shrink-0" style={{ color: dryRun ? '#fbbf24' : '#6b7280' }} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-200">Dry-run (no real sending)</p>
              <p className="text-xs" style={{ color: '#4b5563' }}>
                Lets the queue + retry demo run without SMTP credentials
              </p>
            </div>
          </div>
          <input type="checkbox" checked={dryRun}
            onChange={(e) => { setDryRun(e.target.checked); clear(); }}
            aria-label="Enable dry-run mode"
            className="w-6 h-6 shrink-0 accent-amber-500" />
        </label>

        {/* Simulation modes — only meaningful in dry-run */}
        <div className={dryRun ? 'space-y-2' : 'space-y-2 opacity-40 pointer-events-none'}>
          <p className="text-xs text-gray-600 font-semibold uppercase tracking-widest">Simulation Mode</p>
          <div className="grid grid-cols-3 gap-2">
            {SIMULATION_MODES.map((mode) => {
              const active = simulationMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => { setSimulationMode(mode); clear(); }}
                  disabled={!dryRun}
                  aria-pressed={active}
                  title={
                    mode === 'AUTOMATIC'
                      ? 'Randomly succeeds or fails each attempt'
                      : mode === 'FORCE_SUCCESS'
                        ? 'Every attempt succeeds'
                        : 'Every attempt fails — demonstrates the retry engine'
                  }
                  className="btn px-2 py-2 rounded-xl text-[11px] font-semibold flex flex-col items-center gap-1 transition-all"
                  style={{
                    background: active
                      ? 'linear-gradient(135deg, rgba(217,119,6,0.35), rgba(239,68,68,0.2))'
                      : 'rgba(255,255,255,0.04)',
                    border: active
                      ? '1px solid rgba(251,191,36,0.4)'
                      : '1px solid rgba(255,255,255,0.06)',
                    color: active ? '#fcd34d' : '#6b7280',
                  }}
                >
                  {SIMULATION_MODE_ICONS[mode]}
                  <span className="leading-tight text-center">{SIMULATION_MODE_LABELS[mode]}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-snug" style={{ color: '#374151' }}>
            Used while dry-run is enabled. “Force Failure” makes every attempt fail so the
            retry engine can be demonstrated.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleSave}
            disabled={busy !== null}
            className="btn flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #2563eb, #4f46e5)' }}
          >
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Config
          </button>
          <button
            onClick={handleTest}
            disabled={busy !== null}
            className="btn flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #0e7490, #0891b2)' }}
          >
            {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
            Test Connection
          </button>
        </div>

        <div className="flex gap-2">
          <input
            id="test-send-to"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="Send a test email to…"
            aria-label="Test email recipient"
            className={`${inputStyle} flex-1`}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          />
          <button
            onClick={handleTestSend}
            disabled={busy !== null}
            className="btn flex items-center justify-center gap-2 px-4 rounded-xl text-sm font-semibold text-emerald-200 disabled:opacity-50"
            style={{
              background: 'rgba(5,150,105,0.15)',
              border: '1px solid rgba(52,211,153,0.3)',
            }}
            title="Send a real test email to verify end-to-end delivery"
            aria-label="Send test email"
          >
            {busy === 'testsend' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[11px] leading-snug" style={{ color: '#374151' }}>
          {dryRun
            ? `Dry-run mode is ON — delivery is simulated (${SIMULATION_MODE_LABELS[simulationMode]}).`
            : config?.smtpConfigured
              ? `Configured for ${config.smtp.host}:${config.smtp.port}. Emails are sent for real via SMTP.`
              : 'SMTP not configured yet. Add credentials above and click Save Config first.'}
        </p>
      </div>
    </div>
  );
}
